import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';
import { createPgStore } from '../src/db/pg-store.js';
import type { Store } from '../src/db/store.js';
import { createProviders } from '../src/providers/index.js';
import { createSupplier } from '../src/services/suppliers.js';
import { createCampaign, enrollSuppliers, launchCampaign, launchConfirmation, runSchedulerTick } from '../src/services/campaigns.js';
import { testConfig, IN_WINDOW } from './helpers.js';
import type { Services } from '../src/services/context.js';

// Runs against a real PostgreSQL database. Skipped unless TEST_DATABASE_URL is set.
// The database is wiped on each run, so never point this at production.
const url = process.env.TEST_DATABASE_URL;
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

describe.skipIf(!url)('PostgreSQL store (integration)', () => {
  let store: Store;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`
      drop table if exists call_summaries, follow_up_tasks, calls, campaign_contacts, campaigns,
        consent_records, suppliers, knowledge_base, agent_settings, audit_logs, schema_migrations cascade`);
    await admin.end();
    await runMigrations(url!, migrationsDir);
    store = createPgStore(url!);
  });

  afterAll(async () => {
    await store?.close();
  });

  it('applies all migrations and enables row level security on every table', async () => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    const { rows } = await client.query(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`,
    );
    await client.end();
    expect(rows.length).toBe(10);
    expect(rows.every((r) => r.rowsecurity === true)).toBe(true);
  });

  it('round-trips jsonb columns, text arrays, and null filters', async () => {
    const supplier = await store.insert('suppliers', { phone_e164: '+919800000001', contact_source: 'test', products: ['rice', 'sugar'], lead_status: 'new', do_not_call: false });
    expect(supplier.products).toEqual(['rice', 'sugar']);
    const call = await store.insert('calls', {
      supplier_id: supplier.id,
      direction: 'outbound',
      mode: 'mock',
      provider: 'mock',
      status: 'queued',
      transcript: [{ speaker: 'agent', text: 'नमस्ते', at: '2026-10-27T00:00:00.000Z' }],
      agent_state: { stage: 'greeting' },
    });
    const reloaded = await store.get('calls', String(call.id));
    expect(reloaded?.transcript).toEqual([{ speaker: 'agent', text: 'नमस्ते', at: '2026-10-27T00:00:00.000Z' }]);
    expect(reloaded?.agent_state).toEqual({ stage: 'greeting' });
    const unassigned = await store.find('calls', { where: { campaign_id: null } });
    expect(unassigned.some((row) => row.id === call.id)).toBe(true);
  });

  it('uses the key column for agent_settings', async () => {
    await store.insert('agent_settings', { key: 'calling', value: { min_hours_between_calls: 24 } });
    const updated = await store.update('agent_settings', 'calling', { value: { min_hours_between_calls: 48 } });
    expect(updated?.value).toEqual({ min_hours_between_calls: 48 });
  });

  it('runs an enrolment, launch, dial and simulated conversation end to end on Postgres', async () => {
    const config = await testConfig({ STORE_DRIVER: 'postgres', DATABASE_URL: url! });
    const { voice, telephony } = createProviders(config);
    const services: Services = { store, config, voice, telephony, now: () => new Date(IN_WINDOW) };
    const actor = 'integration@bulkskart.test';
    const { supplier } = await createSupplier(services, actor, {
      phone: '9800000777',
      company_name: 'Integration Traders',
      contact_source: 'integration_test',
      consent: { status: 'granted', basis: 'b2b_outreach_approved' },
    });
    const campaign = await createCampaign(services, actor, { name: 'PG Campaign', language: 'te', mode: 'mock' });
    const enrolled = await enrollSuppliers(services, actor, campaign.id, [supplier.id]);
    expect(enrolled.added).toBe(1);
    await launchCampaign(services, actor, campaign.id, launchConfirmation(campaign));
    const report = await runSchedulerTick(services);
    expect(report.dialed).toBe(1);
    const [call] = await store.find('calls', { where: { campaign_id: campaign.id } });
    expect(['completed', 'handoff']).toContain(call.status);
    const summaries = await store.find('call_summaries', { where: { call_id: call.id } });
    expect(summaries).toHaveLength(1);
    const audits = await store.find('audit_logs', { where: { action: 'call.completed' } });
    expect(audits.length).toBeGreaterThan(0);
  });
});
