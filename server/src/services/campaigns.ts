import { isWithinCallingWindow, evaluateMarketingEligibility, type ConsentRecord } from '../domain/compliance.js';
import { ACTIVE_CALL_STATUSES, type Call, type CallStatus, type Campaign, type CampaignContact, type Supplier } from '../domain/types.js';
import { LANGUAGES, type LanguageCode } from '../domain/languages.js';
import { audit, ServiceError, type Services } from './context.js';
import { getSettings } from './settings.js';
import { runSimulatedConversation, settleContact } from './calls.js';
import { SCENARIOS, scenarioById } from '../agent/scenarios.js';
import type { Row } from '../db/store.js';

export interface CampaignInput {
  name: string;
  language: LanguageCode;
  mode: 'mock' | 'live';
  from_number?: string | null;
  max_attempts?: number;
  retry_delay_minutes?: number;
  calling_window_start?: string;
  calling_window_end?: string;
  timezone?: string;
  concurrency?: number;
  recording_enabled?: boolean;
}

export const launchConfirmation = (campaign: Pick<Campaign, 'name'>) => `LAUNCH ${campaign.name}`;

export async function createCampaign(services: Services, actor: string, input: CampaignInput): Promise<Campaign> {
  if (!LANGUAGES.includes(input.language)) throw new ServiceError(422, 'Unsupported language');
  if (input.mode === 'live' && services.telephony.mode !== 'live') {
    throw new ServiceError(409, 'Live campaigns need a live telephony provider. Create a mock campaign to test instead.');
  }
  const row = await services.store.insert('campaigns', {
    ...input,
    status: 'draft',
    timezone: input.timezone ?? 'Asia/Kolkata',
    max_attempts: input.max_attempts ?? 3,
    retry_delay_minutes: input.retry_delay_minutes ?? 240,
    calling_window_start: input.calling_window_start ?? '09:00',
    calling_window_end: input.calling_window_end ?? '19:00',
    concurrency: input.concurrency ?? 2,
    recording_enabled: input.recording_enabled ?? false,
    created_by: actor,
  });
  await audit(services, actor, 'campaign.create', 'campaign', String(row.id), { mode: input.mode });
  return row as unknown as Campaign;
}

export interface EnrollResult {
  added: number;
  duplicates: number;
  blocked: Array<{ supplier_id: string; reason: string }>;
}

/**
 * Adds suppliers to a campaign. A supplier already enrolled is counted as a duplicate
 * and left unchanged. Suppliers blocked by compliance are recorded as suppressed or
 * skipped with the reason, so the dashboard shows why they were not called.
 */
export async function enrollSuppliers(services: Services, actor: string, campaignId: string, supplierIds: string[]): Promise<EnrollResult> {
  const campaign = await requireCampaign(services, campaignId);
  if (campaign.status === 'completed' || campaign.status === 'archived') throw new ServiceError(409, 'Campaign is closed');
  const settings = await getSettings(services);
  const result: EnrollResult = { added: 0, duplicates: 0, blocked: [] };

  for (const supplierId of [...new Set(supplierIds)]) {
    const existing = await services.store.find('campaign_contacts', { where: { campaign_id: campaignId, supplier_id: supplierId } });
    if (existing.length) {
      result.duplicates += 1;
      continue;
    }
    const supplier = (await services.store.get('suppliers', supplierId)) as unknown as Supplier | undefined;
    if (!supplier) {
      result.blocked.push({ supplier_id: supplierId, reason: 'supplier_not_found' });
      continue;
    }
    const consents = (await services.store.find('consent_records', { where: { supplier_id: supplierId } })) as unknown as ConsentRecord[];
    const block = evaluateMarketingEligibility({ supplier, consents, requireConsent: settings.calling.require_consent });
    await services.store.insert('campaign_contacts', {
      campaign_id: campaignId,
      supplier_id: supplierId,
      status: block === 'do_not_call' ? 'suppressed' : block ? 'skipped' : 'pending',
      attempts: 0,
      next_attempt_at: services.now().toISOString(),
      last_outcome: block,
    });
    if (block) result.blocked.push({ supplier_id: supplierId, reason: block });
    else result.added += 1;
  }
  await audit(services, actor, 'campaign.enroll', 'campaign', campaignId, { ...result, blocked: undefined, blocked_count: result.blocked.length });
  return result;
}

export async function launchCampaign(services: Services, actor: string, campaignId: string, confirmation: string): Promise<Campaign> {
  const campaign = await requireCampaign(services, campaignId);
  if (campaign.status !== 'draft' && campaign.status !== 'paused') {
    throw new ServiceError(409, `Campaign is ${campaign.status} and cannot be launched`);
  }
  if (confirmation !== launchConfirmation(campaign)) {
    throw new ServiceError(422, `Confirmation must exactly match: ${launchConfirmation(campaign)}`);
  }
  if (campaign.mode === 'live') {
    if (!services.config.LIVE_CALLING_ENABLED) throw new ServiceError(403, 'Live calling is disabled (LIVE_CALLING_ENABLED is false)');
    if (services.telephony.mode !== 'live') throw new ServiceError(409, 'Live campaign requires a live telephony provider');
    if (!services.voice.liveReady) throw new ServiceError(409, 'Live campaign requires a voice provider verified for live calls');
  }
  const updated = await services.store.update('campaigns', campaignId, {
    status: 'running',
    launched_by: actor,
    launched_at: services.now().toISOString(),
  });
  await audit(services, actor, 'campaign.launch', 'campaign', campaignId, { mode: campaign.mode });
  return updated as unknown as Campaign;
}

export async function setCampaignPaused(services: Services, actor: string, campaignId: string, paused: boolean, confirmation?: string): Promise<Campaign> {
  const campaign = await requireCampaign(services, campaignId);
  if (paused) {
    if (campaign.status !== 'running') throw new ServiceError(409, 'Only a running campaign can be paused');
    await audit(services, actor, 'campaign.pause', 'campaign', campaignId, {});
    return (await services.store.update('campaigns', campaignId, { status: 'paused' })) as unknown as Campaign;
  }
  if (campaign.status !== 'paused') throw new ServiceError(409, 'Only a paused campaign can be resumed');
  return launchCampaign(services, actor, campaignId, confirmation ?? '');
}

async function requireCampaign(services: Services, id: string): Promise<Campaign> {
  const campaign = await services.store.get('campaigns', id);
  if (!campaign) throw new ServiceError(404, 'Campaign not found');
  return campaign as unknown as Campaign;
}

export type SkipReason =
  | 'outside_calling_window'
  | 'do_not_call'
  | 'consent_not_granted'
  | 'missing_contact_source'
  | 'supplier_missing'
  | 'supplier_in_active_call'
  | 'cooldown_active'
  | 'no_sender_number';

export interface DialResult {
  kind: 'dialed' | 'skipped' | 'failed';
  reason?: SkipReason | string;
  callId?: string;
}

/**
 * Dials one contact after re-checking every rule at the moment of dialing: DNC,
 * consent, duplicate in-flight calls, and the cooldown since the last call. The rules
 * are checked again here, not only at enrollment, because suppression can change
 * after a contact was added.
 */
export async function dialContact(services: Services, campaign: Campaign, contact: CampaignContact): Promise<DialResult> {
  const settings = await getSettings(services);
  const supplier = (await services.store.get('suppliers', contact.supplier_id)) as unknown as Supplier | undefined;
  if (!supplier) {
    await services.store.update('campaign_contacts', contact.id, { status: 'skipped', last_outcome: 'supplier_missing' });
    return { kind: 'skipped', reason: 'supplier_missing' };
  }
  const consents = (await services.store.find('consent_records', { where: { supplier_id: supplier.id } })) as unknown as ConsentRecord[];
  const block = evaluateMarketingEligibility({ supplier, consents, requireConsent: settings.calling.require_consent });
  if (block) {
    const status = block === 'do_not_call' ? 'suppressed' : 'skipped';
    await services.store.update('campaign_contacts', contact.id, { status, last_outcome: block });
    return { kind: 'skipped', reason: block };
  }

  const calls = (await services.store.find('calls', { where: { supplier_id: supplier.id }, orderBy: { column: 'created_at', direction: 'desc' } })) as unknown as Call[];
  if (calls.some((call) => ACTIVE_CALL_STATUSES.includes(call.status))) {
    return { kind: 'skipped', reason: 'supplier_in_active_call' };
  }
  const last = calls[0];
  if (last) {
    const cooldownEnd = new Date(last.created_at).getTime() + settings.calling.min_hours_between_calls * 3_600_000;
    if (cooldownEnd > services.now().getTime()) {
      await services.store.update('campaign_contacts', contact.id, { next_attempt_at: new Date(cooldownEnd).toISOString() });
      return { kind: 'skipped', reason: 'cooldown_active' };
    }
  }

  const from = campaign.from_number ?? settings.calling.default_from_number ?? (campaign.mode === 'mock' ? 'mock-sender' : null);
  if (!from) return { kind: 'skipped', reason: 'no_sender_number' };

  const attempt = Number(contact.attempts) + 1;
  const call = await services.store.insert('calls', {
    campaign_id: campaign.id,
    supplier_id: supplier.id,
    direction: 'outbound',
    mode: services.telephony.mode,
    provider: services.telephony.name,
    from_number: from,
    to_number: supplier.phone_e164,
    language: campaign.language,
    status: 'queued',
    attempt_no: attempt,
    transcript: [],
    agent_state: {},
    recording_permitted: campaign.recording_enabled,
  });
  await services.store.update('campaign_contacts', contact.id, { status: 'in_progress', attempts: attempt });

  try {
    const { providerCallId } = await services.telephony.placeCall({
      to: supplier.phone_e164,
      from,
      callId: String(call.id),
      language: campaign.language,
    });
    // Only the provider's acceptance moves the call to "dialing".
    await services.store.update('calls', String(call.id), { status: 'dialing', provider_call_id: providerCallId });
    return { kind: 'dialed', callId: String(call.id) };
  } catch (error) {
    await services.store.update('calls', String(call.id), { status: 'failed', error_message: (error as Error).message, ended_at: services.now().toISOString() });
    await settleContact(services, campaign, contact.id, attempt, 'failed');
    return { kind: 'failed', reason: (error as Error).message, callId: String(call.id) };
  }
}

export interface TickReport {
  dialed: number;
  failed: number;
  skipped: Record<string, number>;
  campaigns: number;
}

/**
 * One scheduler pass. Runs only inside each campaign's calling window and respects
 * its concurrency limit. Mock campaigns run the simulated conversation for each dial;
 * live campaigns wait for provider status callbacks.
 */
export interface TickOptions {
  /** Pins the simulated supplier behaviour for mock campaigns. Otherwise it is chosen per phone number. */
  scenarioId?: string;
}

export async function runSchedulerTick(services: Services, options: TickOptions = {}): Promise<TickReport> {
  const report: TickReport = { dialed: 0, failed: 0, skipped: {}, campaigns: 0 };
  const running = (await services.store.find('campaigns', { where: { status: 'running' } })) as unknown as Campaign[];
  const now = services.now();

  for (const campaign of running) {
    report.campaigns += 1;
    if (!isWithinCallingWindow(now, { start: campaign.calling_window_start, end: campaign.calling_window_end, timezone: campaign.timezone })) {
      report.skipped.outside_calling_window = (report.skipped.outside_calling_window ?? 0) + 1;
      continue;
    }
    const inFlight = (await services.store.find('calls', { where: { campaign_id: campaign.id } })).filter((call) =>
      ACTIVE_CALL_STATUSES.includes(call.status as CallStatus),
    ).length;
    let capacity = campaign.concurrency - inFlight;
    if (capacity <= 0) continue;

    const due = (await services.store.find('campaign_contacts', {
      where: { campaign_id: campaign.id, status: 'pending' },
      orderBy: { column: 'next_attempt_at', direction: 'asc' },
      limit: 500,
    })) as unknown as CampaignContact[];

    for (const contact of due) {
      if (capacity <= 0) break;
      if (new Date(contact.next_attempt_at).getTime() > now.getTime()) continue;
      const result = await dialContact(services, campaign, contact);
      if (result.kind === 'skipped') {
        const reason = result.reason ?? 'unknown';
        report.skipped[reason] = (report.skipped[reason] ?? 0) + 1;
        continue;
      }
      capacity -= 1;
      if (result.kind === 'failed') {
        report.failed += 1;
        continue;
      }
      report.dialed += 1;
      if (services.telephony.mode === 'mock' && result.callId) {
        const call = (await services.store.get('calls', result.callId)) as unknown as Call;
        const scenario = options.scenarioId ? scenarioById(options.scenarioId) : SCENARIOS[hashIndex(String(call.to_number), SCENARIOS.length)];
        await runSimulatedConversation(services, result.callId, scenario);
      }
    }
  }
  return report;
}

// Deterministic: the same phone number always gets the same simulated behaviour.
function hashIndex(value: string, modulo: number): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % modulo;
}

export async function runSimulatedCallForSupplier(services: Services, actor: string, input: { supplierId: string; campaignId?: string | null; scenarioId: string }) {
  if (services.telephony.mode !== 'mock') throw new ServiceError(409, 'The simulator only runs with the mock telephony provider');
  const supplier = (await services.store.get('suppliers', input.supplierId)) as unknown as Supplier | undefined;
  if (!supplier) throw new ServiceError(404, 'Supplier not found');
  const scenario = scenarioById(input.scenarioId);
  const block = evaluateMarketingEligibility({
    supplier,
    consents: (await services.store.find('consent_records', { where: { supplier_id: supplier.id } })) as never,
    requireConsent: false,
  });
  if (block === 'missing_contact_source' || block === 'do_not_call') {
    throw new ServiceError(409, `Supplier cannot be simulated: ${block}`);
  }
  const call = await services.store.insert('calls', {
    campaign_id: input.campaignId ?? null,
    supplier_id: supplier.id,
    direction: 'outbound',
    mode: 'mock',
    provider: 'mock',
    from_number: 'mock-sender',
    to_number: supplier.phone_e164,
    language: scenario.language,
    status: 'dialing',
    provider_call_id: `mock_sim_${Date.now()}_${supplier.id.slice(0, 8)}`,
    transcript: [],
    agent_state: {},
    attempt_no: 1,
    recording_permitted: false,
  });
  await audit(services, actor, 'call.simulate', 'call', String(call.id), { scenario: scenario.id });
  await runSimulatedConversation(services, String(call.id), scenario);
  return services.store.get('calls', String(call.id)) as Promise<Row | undefined>;
}

export async function campaignStats(services: Services, campaignId: string) {
  const contacts = (await services.store.find('campaign_contacts', { where: { campaign_id: campaignId } })) as unknown as CampaignContact[];
  const byStatus: Record<string, number> = {};
  for (const contact of contacts) byStatus[contact.status] = (byStatus[contact.status] ?? 0) + 1;
  const calls = (await services.store.find('calls', { where: { campaign_id: campaignId } })) as unknown as Call[];
  const byOutcome: Record<string, number> = {};
  for (const call of calls) if (call.outcome) byOutcome[call.outcome] = (byOutcome[call.outcome] ?? 0) + 1;
  return { contacts: contacts.length, by_contact_status: byStatus, calls: calls.length, by_outcome: byOutcome };
}
