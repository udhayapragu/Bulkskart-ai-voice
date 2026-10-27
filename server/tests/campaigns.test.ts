import { describe, expect, it } from 'vitest';
import { createTestServices, IN_WINDOW, OUT_OF_WINDOW, TEST_WEBHOOK_SECRET } from './helpers.js';
import { createSupplier, setDoNotCall } from '../src/services/suppliers.js';
import { createCampaign, enrollSuppliers, launchCampaign, launchConfirmation, runSchedulerTick, setCampaignPaused } from '../src/services/campaigns.js';
import { applyStatusEvent, routeInboundCall } from '../src/services/calls.js';
import { signPayload, MOCK_SIGNATURE_HEADER } from '../src/providers/telephony/mock.js';
import { createKnowledgeEntry, setKnowledgeStatus } from '../src/services/knowledge.js';
import { createMockTelephonyProvider } from '../src/providers/telephony/mock.js';

const actor = 'admin@bulkskart.test';

async function setup() {
  const services = await createTestServices();
  const approvedAbout = await createKnowledgeEntry(services, actor, {
    language: 'en',
    topic: 'about',
    question: 'What is Bulkskart?',
    answer: 'Bulkskart is a B2B bulk trading marketplace.',
    keywords: ['bulkskart'],
  });
  await setKnowledgeStatus(services, actor, String(approvedAbout.id), 'approved');
  return services;
}

async function supplier(services: Awaited<ReturnType<typeof setup>>, phone: string, opts: { consent?: 'granted' | 'withdrawn' | 'none' } = {}) {
  const { supplier: row } = await createSupplier(services, actor, {
    phone,
    company_name: `Supplier ${phone.slice(-4)}`,
    contact_source: 'supplier_directory_export',
    consent: opts.consent === 'none' ? undefined : { status: opts.consent ?? 'granted', basis: 'b2b_outreach_approved' },
  });
  return row;
}

async function campaign(services: Awaited<ReturnType<typeof setup>>, overrides: Record<string, unknown> = {}) {
  return createCampaign(services, actor, {
    name: 'Autumn Outreach',
    language: 'en',
    mode: 'mock',
    max_attempts: 3,
    retry_delay_minutes: 60,
    ...overrides,
  } as Parameters<typeof createCampaign>[2]);
}

describe('launch safety', () => {
  it('refuses to launch without the exact confirmation text', async () => {
    const services = await setup();
    const c = await campaign(services);
    await expect(launchCampaign(services, actor, c.id, 'yes')).rejects.toThrow(/Confirmation must exactly match/);
    await expect(launchCampaign(services, actor, c.id, `launch ${c.name}`)).rejects.toThrow(/exactly match/);
  });

  it('launches a mock campaign with the exact confirmation and records who launched it', async () => {
    const services = await setup();
    const c = await campaign(services);
    const running = await launchCampaign(services, actor, c.id, launchConfirmation(c));
    expect(running.status).toBe('running');
    expect(running.launched_by).toBe(actor);
    const audit = await services.store.find('audit_logs', { where: { action: 'campaign.launch' } });
    expect(audit).toHaveLength(1);
  });

  it('refuses to create a live campaign while the telephony provider is mock', async () => {
    const services = await setup();
    await expect(createCampaign(services, actor, { name: 'Live One', language: 'en', mode: 'live' })).rejects.toThrow(/live telephony/);
  });

  it('pauses and resumes; resume needs the confirmation again', async () => {
    const services = await setup();
    const c = await campaign(services);
    await launchCampaign(services, actor, c.id, launchConfirmation(c));
    expect((await setCampaignPaused(services, actor, c.id, true)).status).toBe('paused');
    await expect(setCampaignPaused(services, actor, c.id, false, '')).rejects.toThrow(/exactly match/);
    expect((await setCampaignPaused(services, actor, c.id, false, launchConfirmation(c))).status).toBe('running');
  });
});

describe('eligibility and duplicate prevention', () => {
  it('never enrolls a supplier twice in the same campaign', async () => {
    const services = await setup();
    const c = await campaign(services);
    const s = await supplier(services, '9876500001');
    const first = await enrollSuppliers(services, actor, c.id, [s.id]);
    const second = await enrollSuppliers(services, actor, c.id, [s.id]);
    expect(first.added).toBe(1);
    expect(second).toMatchObject({ added: 0, duplicates: 1 });
  });

  it('does not create a second supplier for the same phone number in different formats', async () => {
    const services = await setup();
    const first = await createSupplier(services, actor, { phone: '+91 98765 00002', contact_source: 'x' });
    const second = await createSupplier(services, actor, { phone: '09876500002', contact_source: 'x' });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.supplier.id).toBe(first.supplier.id);
  });

  it('blocks suppliers without granted consent and records the reason', async () => {
    const services = await setup();
    const c = await campaign(services);
    const noConsent = await supplier(services, '9876500003', { consent: 'none' });
    const result = await enrollSuppliers(services, actor, c.id, [noConsent.id]);
    expect(result.blocked).toEqual([{ supplier_id: noConsent.id, reason: 'consent_not_granted' }]);
    const [contact] = await services.store.find('campaign_contacts', { where: { supplier_id: noConsent.id } });
    expect(contact.status).toBe('skipped');
  });

  it('suppresses do-not-call suppliers at enrollment and during the run', async () => {
    const services = await setup();
    const c = await campaign(services);
    const s = await supplier(services, '9876500004');
    await enrollSuppliers(services, actor, c.id, [s.id]);
    await setDoNotCall(services, actor, s.id, 'asked to stop');
    await launchCampaign(services, actor, c.id, launchConfirmation(c));
    const report = await runSchedulerTick(services);
    expect(report.dialed).toBe(0);
    const [contact] = await services.store.find('campaign_contacts', { where: { supplier_id: s.id } });
    expect(contact.status).toBe('suppressed');
    expect((await services.store.find('calls')).length).toBe(0);
  });
});

describe('scheduler, calling window, cooldown, simulated conversations', () => {
  it('does not dial outside the calling window', async () => {
    const services = await setup();
    services.setNow(OUT_OF_WINDOW);
    const c = await campaign(services);
    const s = await supplier(services, '9876500005');
    await enrollSuppliers(services, actor, c.id, [s.id]);
    await launchCampaign(services, actor, c.id, launchConfirmation(c));
    const report = await runSchedulerTick(services);
    expect(report.dialed).toBe(0);
    expect(report.skipped.outside_calling_window).toBe(1);
  });

  it('dials a due contact in the window and runs the simulated conversation to a stored summary', async () => {
    const services = await setup();
    const c = await campaign(services, { language: 'hi' });
    const s = await supplier(services, '9876500006');
    await enrollSuppliers(services, actor, c.id, [s.id]);
    await launchCampaign(services, actor, c.id, launchConfirmation(c));
    const report = await runSchedulerTick(services, { scenarioId: 'interested-en' });
    expect(report.dialed).toBe(1);

    const [call] = await services.store.find('calls', { where: { campaign_id: c.id } });
    expect(call.mode).toBe('mock');
    expect(call.status).toBe('completed');
    expect(call.provider_call_id).toMatch(/^mock_/);
    expect(['completed', 'handoff']).toContain(call.status);
    expect((call.transcript as unknown[]).length).toBeGreaterThan(2);
    const [summary] = await services.store.find('call_summaries', { where: { call_id: call.id } });
    expect(summary.recommended_action).toBeTruthy();
  });

  it('does not call the same supplier again within the cooldown period', async () => {
    const services = await setup();
    const c = await campaign(services);
    const s = await supplier(services, '9876500007');
    await enrollSuppliers(services, actor, c.id, [s.id]);
    await launchCampaign(services, actor, c.id, launchConfirmation(c));
    await runSchedulerTick(services, { scenarioId: 'interested-en' });
    // Another campaign enrols the same supplier and runs right after.
    const c2 = await campaign(services, { name: 'Second Campaign' });
    await enrollSuppliers(services, actor, c2.id, [s.id]);
    await launchCampaign(services, actor, c2.id, launchConfirmation({ name: 'Second Campaign' }));
    const report = await runSchedulerTick(services, { scenarioId: 'interested-en' });
    expect(report.skipped.cooldown_active).toBe(1);
    expect((await services.store.find('calls', { where: { campaign_id: c2.id } })).length).toBe(0);
  });

  it('creates a human-handoff or callback follow-up task from a simulated conversation', async () => {
    const services = await setup();
    const c = await campaign(services, { language: 'te' });
    const s = await supplier(services, '9876500008');
    await enrollSuppliers(services, actor, c.id, [s.id]);
    await launchCampaign(services, actor, c.id, launchConfirmation(c));
    // The scenario rotates per supplier; drive the simulator directly for a deterministic check.
    const { runSimulatedCallForSupplier } = await import('../src/services/campaigns.js');
    await runSimulatedCallForSupplier(services, actor, { supplierId: s.id, campaignId: c.id, scenarioId: 'human-te' });
    const tasks = await services.store.find('follow_up_tasks', { where: { supplier_id: s.id } });
    expect(tasks.map((t) => t.task_type)).toContain('human_handoff');
  });
});

describe('retry rules', () => {
  it('re-queues a contact after a failed attempt and exhausts it at max attempts', async () => {
    const services = await setup();
    const c = await campaign(services, { max_attempts: 2, retry_delay_minutes: 30 });
    const s = await supplier(services, '9876500009');
    await enrollSuppliers(services, actor, c.id, [s.id]);
    await launchCampaign(services, actor, c.id, launchConfirmation(c));
    const { settleContact } = await import('../src/services/calls.js');
    const [contact] = await services.store.find('campaign_contacts', { where: { supplier_id: s.id } });

    await services.store.update('campaign_contacts', contact.id, { attempts: 1 });
    await settleContact(services, { max_attempts: 2, retry_delay_minutes: 30 }, contact.id, 1, 'no_answer');
    let [after] = await services.store.find('campaign_contacts', { where: { supplier_id: s.id } });
    expect(after.status).toBe('pending');
    expect(new Date(after.next_attempt_at).getTime()).toBe(IN_WINDOW.getTime() + 30 * 60_000);

    await settleContact(services, { max_attempts: 2, retry_delay_minutes: 30 }, contact.id, 2, 'busy');
    [after] = await services.store.find('campaign_contacts', { where: { supplier_id: s.id } });
    expect(after.status).toBe('exhausted');
  });
});

describe('telephony webhooks', () => {
  it('verifies the HMAC signature and rejects a forged one', () => {
    const provider = createMockTelephonyProvider(TEST_WEBHOOK_SECRET);
    const rawBody = JSON.stringify({ provider_call_id: 'x', status: 'completed' });
    expect(provider.verifyWebhook({ rawBody, headers: { [MOCK_SIGNATURE_HEADER]: signPayload(rawBody, TEST_WEBHOOK_SECRET) }, query: {} })).toBe(true);
    expect(provider.verifyWebhook({ rawBody, headers: { [MOCK_SIGNATURE_HEADER]: signPayload(rawBody, 'other-secret-value-here') }, query: {} })).toBe(false);
    expect(provider.verifyWebhook({ rawBody: rawBody + ' ', headers: { [MOCK_SIGNATURE_HEADER]: signPayload(rawBody, TEST_WEBHOOK_SECRET) }, query: {} })).toBe(false);
    expect(provider.verifyWebhook({ rawBody, headers: {}, query: {} })).toBe(false);
  });

  it('fails closed when no webhook secret is configured', () => {
    expect(createMockTelephonyProvider(undefined).verifyWebhook({ rawBody: '{}', headers: {}, query: {} })).toBe(false);
  });

  it('treats a replayed terminal status as a duplicate and does not reopen the call', async () => {
    const services = await setup();
    const c = await campaign(services);
    const s = await supplier(services, '9876500010');
    await enrollSuppliers(services, actor, c.id, [s.id]);
    await launchCampaign(services, actor, c.id, launchConfirmation(c));
    const call = await services.store.insert('calls', {
      campaign_id: c.id,
      supplier_id: s.id,
      direction: 'outbound',
      mode: 'live',
      provider: 'exotel',
      provider_call_id: 'provider-123',
      status: 'dialing',
      transcript: [],
      agent_state: {},
      attempt_no: 1,
      recording_permitted: false,
    });
    const first = await applyStatusEvent(services, { providerCallId: 'provider-123', status: 'no_answer' });
    const replay = await applyStatusEvent(services, { providerCallId: 'provider-123', status: 'in_progress' });
    expect(first).toMatchObject({ matched: true, duplicate: false, status: 'no_answer' });
    expect(replay).toMatchObject({ matched: true, duplicate: true });
    expect((await services.store.get('calls', String(call.id)))?.status).toBe('no_answer');
  });

  it('routes an inbound caller to the agent and records unknown consent for a new number', async () => {
    const services = await setup();
    const routed = await routeInboundCall(services, { from: '+919876500011', to: '+911800000000', providerCallId: 'in-1' });
    expect(routed.action).toBe('connect_agent');
    expect(routed.createdSupplier).toBe(true);
    const [consent] = await services.store.find('consent_records', { where: { supplier_id: routed.supplierId } });
    expect(consent.status).toBe('unknown');
    expect(consent.basis).toBe('inbound_initiated');
  });
});

describe('knowledge base governance', () => {
  it('keeps new entries as drafts until an explicit approval', async () => {
    const services = await setup();
    const entry = await createKnowledgeEntry(services, actor, { language: 'en', topic: 'fees', question: 'Fees?', answer: 'Pending', keywords: ['fee'] });
    expect(entry.status).toBe('draft');
  });
});
