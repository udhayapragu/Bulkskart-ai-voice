import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services/context.js';
import { audit, ServiceError } from '../services/context.js';
import { LANGUAGES } from '../domain/languages.js';
import { ACTIVE_CALL_STATUSES, type CallStatus } from '../domain/types.js';
import { requireAdmin } from '../middleware/auth.js';
import { asyncHandler, parseBody, uuid } from './http.js';
import { createSupplier, getSupplierDetail, importSuppliers, listSuppliers, recordConsent, setDoNotCall, updateLeadStatus } from '../services/suppliers.js';
import { createKnowledgeEntry, listKnowledge, setKnowledgeStatus, updateKnowledgeEntry } from '../services/knowledge.js';
import { getSettings, updateSettingsSection } from '../services/settings.js';
import { campaignStats, createCampaign, enrollSuppliers, launchCampaign, runSchedulerTick, runSimulatedCallForSupplier, setCampaignPaused } from '../services/campaigns.js';
import { overview, usage } from '../services/analytics.js';
import { SCENARIOS } from '../agent/scenarios.js';
import { TEMPLATES } from '../agent/templates.js';
import type { Row } from '../db/store.js';

const language = z.enum(LANGUAGES);
const leadStatus = z.enum(['new', 'interested', 'not_interested', 'callback_requested', 'registered']);
const supplierInput = z.object({
  phone: z.string().min(8).max(20),
  company_name: z.string().max(200).nullish(),
  contact_name: z.string().max(200).nullish(),
  email: z.string().email().max(200).nullish(),
  city: z.string().max(100).nullish(),
  state: z.string().max(100).nullish(),
  products: z.array(z.string().max(100)).max(50).optional(),
  preferred_language: language.nullish(),
  contact_source: z.string().min(2).max(200),
  consent: z
    .object({
      status: z.enum(['granted', 'withdrawn', 'unknown']),
      basis: z.string().min(2).max(200),
      evidence: z.string().max(1000).nullish(),
    })
    .optional(),
});

const campaignInput = z.object({
  name: z.string().min(3).max(120),
  language,
  mode: z.enum(['mock', 'live']).default('mock'),
  from_number: z.string().max(20).nullish(),
  max_attempts: z.number().int().min(1).max(10).optional(),
  retry_delay_minutes: z.number().int().min(5).max(7 * 24 * 60).optional(),
  calling_window_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  calling_window_end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  timezone: z.string().max(64).optional(),
  concurrency: z.number().int().min(1).max(50).optional(),
  recording_enabled: z.boolean().optional(),
});

const knowledgeInput = z.object({
  language,
  topic: z.string().min(2).max(100),
  question: z.string().min(3).max(500),
  answer: z.string().min(3).max(2000),
  keywords: z.array(z.string().min(2).max(60)).max(30).optional(),
});

const uuidList = z.array(uuid).min(1).max(5000);

export function createApiRouter(services: Services): Router {
  const router = Router();
  const { store, config } = services;
  router.use(requireAdmin(config));

  router.get('/overview', asyncHandler(async (_req, res) => res.json(await overview(services))));

  router.get('/system/health', asyncHandler(async (_req, res) => {
    res.json({
      store: store.driver,
      telephony: { provider: services.telephony.name, mode: services.telephony.mode, webhook_secret_configured: Boolean(config.TELEPHONY_WEBHOOK_SECRET) },
      voice: { provider: services.voice.name, live_ready: services.voice.liveReady },
      live_calling_enabled: config.LIVE_CALLING_ENABLED,
      scheduler_enabled: config.SCHEDULER_ENABLED,
      website_url: config.WEBSITE_URL,
      checked_at: services.now().toISOString(),
    });
  }));

  // Suppliers and leads
  router.get('/suppliers', asyncHandler(async (req, res) => {
    const status = leadStatus.safeParse(req.query.lead_status);
    const limit = Number(req.query.limit);
    res.json(await listSuppliers(services, {
      lead_status: status.success ? status.data : undefined,
      search: typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : undefined,
      limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : undefined,
    }));
  }));
  router.post('/suppliers', asyncHandler(async (req, res) => {
    const result = await createSupplier(services, req.actor!, parseBody(supplierInput, req.body));
    res.status(result.created ? 201 : 200).json(result);
  }));
  router.post('/suppliers/import', asyncHandler(async (req, res) => {
    const { rows } = parseBody(z.object({ rows: z.array(supplierInput).min(1).max(5000) }), req.body);
    res.json(await importSuppliers(services, req.actor!, rows));
  }));
  router.get('/suppliers/:id', asyncHandler(async (req, res) => {
    res.json(await getSupplierDetail(services, uuid.parse(req.params.id)));
  }));
  router.post('/suppliers/:id/do-not-call', asyncHandler(async (req, res) => {
    const { reason } = parseBody(z.object({ reason: z.string().min(3).max(500) }), req.body);
    res.json(await setDoNotCall(services, req.actor!, uuid.parse(req.params.id), reason));
  }));
  router.post('/suppliers/:id/consent', asyncHandler(async (req, res) => {
    const body = parseBody(z.object({
      status: z.enum(['granted', 'withdrawn', 'unknown']),
      basis: z.string().min(2).max(200),
      evidence: z.string().max(1000).nullish(),
    }), req.body);
    res.status(201).json(await recordConsent(services, req.actor!, uuid.parse(req.params.id), body));
  }));
  router.patch('/suppliers/:id/lead-status', asyncHandler(async (req, res) => {
    const { status } = parseBody(z.object({ status: leadStatus }), req.body);
    res.json(await updateLeadStatus(services, req.actor!, uuid.parse(req.params.id), status));
  }));

  // Campaigns
  router.get('/campaigns', asyncHandler(async (_req, res) => {
    res.json(await store.find('campaigns', { orderBy: { column: 'created_at', direction: 'desc' } }));
  }));
  router.post('/campaigns', asyncHandler(async (req, res) => {
    res.status(201).json(await createCampaign(services, req.actor!, parseBody(campaignInput, req.body)));
  }));
  router.get('/campaigns/:id', asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const campaign = await store.get('campaigns', id);
    if (!campaign) throw new ServiceError(404, 'Campaign not found');
    res.json({ campaign, stats: await campaignStats(services, id) });
  }));
  router.get('/campaigns/:id/contacts', asyncHandler(async (req, res) => {
    const contacts = await store.find('campaign_contacts', { where: { campaign_id: uuid.parse(req.params.id) }, limit: 500 });
    res.json(contacts);
  }));
  router.post('/campaigns/:id/enroll', asyncHandler(async (req, res) => {
    const { supplier_ids } = parseBody(z.object({ supplier_ids: uuidList }), req.body);
    res.json(await enrollSuppliers(services, req.actor!, uuid.parse(req.params.id), supplier_ids));
  }));
  router.post('/campaigns/:id/launch', asyncHandler(async (req, res) => {
    const { confirmation } = parseBody(z.object({ confirmation: z.string().max(200) }), req.body);
    res.json(await launchCampaign(services, req.actor!, uuid.parse(req.params.id), confirmation));
  }));
  router.post('/campaigns/:id/pause', asyncHandler(async (req, res) => {
    res.json(await setCampaignPaused(services, req.actor!, uuid.parse(req.params.id), true));
  }));
  router.post('/campaigns/:id/resume', asyncHandler(async (req, res) => {
    const { confirmation } = parseBody(z.object({ confirmation: z.string().max(200).optional() }), req.body);
    res.json(await setCampaignPaused(services, req.actor!, uuid.parse(req.params.id), false, confirmation));
  }));
  router.post('/scheduler/tick', asyncHandler(async (req, res) => {
    const report = await runSchedulerTick(services);
    await audit(services, req.actor!, 'scheduler.manual_tick', null, null, report as unknown as Row);
    res.json(report);
  }));

  // Calls
  router.get('/calls', asyncHandler(async (req, res) => {
    const where: Record<string, unknown> = {};
    if (typeof req.query.campaign_id === 'string') where.campaign_id = uuid.parse(req.query.campaign_id);
    const calls = await store.find('calls', { where, orderBy: { column: 'created_at', direction: 'desc' }, limit: 200 });
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    res.json(status ? calls.filter((call) => call.status === status) : calls);
  }));
  router.get('/calls/:id', asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const call = await store.get('calls', id);
    if (!call) throw new ServiceError(404, 'Call not found');
    const [summary] = await store.find('call_summaries', { where: { call_id: id } });
    res.json({ call, summary: summary ?? null, active: ACTIVE_CALL_STATUSES.includes(call.status as CallStatus) });
  }));
  router.get('/scenarios', (_req, res) => res.json(SCENARIOS));
  router.get('/agent/templates', (_req, res) => res.json(TEMPLATES));
  router.post('/calls/simulate', asyncHandler(async (req, res) => {
    const body = parseBody(z.object({
      supplier_id: uuid,
      campaign_id: uuid.nullish(),
      scenario_id: z.string().min(3).max(60),
    }), req.body);
    res.status(201).json(await runSimulatedCallForSupplier(services, req.actor!, {
      supplierId: body.supplier_id,
      campaignId: body.campaign_id ?? null,
      scenarioId: body.scenario_id,
    }));
  }));

  // Follow-ups
  router.get('/follow-ups', asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'open';
    res.json(await store.find('follow_up_tasks', { where: { status }, orderBy: { column: 'due_at', direction: 'asc' }, limit: 300 }));
  }));
  router.patch('/follow-ups/:id', asyncHandler(async (req, res) => {
    const { status } = parseBody(z.object({ status: z.enum(['open', 'done', 'canceled']) }), req.body);
    const id = uuid.parse(req.params.id);
    const updated = await store.update('follow_up_tasks', id, { status });
    if (!updated) throw new ServiceError(404, 'Follow-up not found');
    await audit(services, req.actor!, 'follow_up.update', 'follow_up_task', id, { status });
    res.json(updated);
  }));

  // Knowledge base
  router.get('/knowledge', asyncHandler(async (req, res) => {
    const lang = language.safeParse(req.query.language);
    res.json(await listKnowledge(services, lang.success ? lang.data : undefined));
  }));
  router.post('/knowledge', asyncHandler(async (req, res) => {
    res.status(201).json(await createKnowledgeEntry(services, req.actor!, parseBody(knowledgeInput, req.body)));
  }));
  router.patch('/knowledge/:id', asyncHandler(async (req, res) => {
    const patch = parseBody(knowledgeInput.partial(), req.body);
    res.json(await updateKnowledgeEntry(services, req.actor!, uuid.parse(req.params.id), patch));
  }));
  router.post('/knowledge/:id/status', asyncHandler(async (req, res) => {
    const { status } = parseBody(z.object({ status: z.enum(['approved', 'draft', 'retired']) }), req.body);
    res.json(await setKnowledgeStatus(services, req.actor!, uuid.parse(req.params.id), status));
  }));

  // Settings, analytics
  router.get('/settings', asyncHandler(async (_req, res) => res.json(await getSettings(services))));
  router.put('/settings/:section', asyncHandler(async (req, res) => {
    const sectionResult = z.enum(['calling', 'languages', 'usage_rates']).safeParse(req.params.section);
    if (!sectionResult.success) throw new ServiceError(404, 'Unknown settings section');
    const section = sectionResult.data;
    const value = parseBody(z.record(z.string(), z.unknown()), req.body);
    if (section === 'calling') {
      parseBody(z.object({
        min_hours_between_calls: z.number().min(1).max(720).optional(),
        require_consent: z.boolean().optional(),
        default_from_number: z.string().max(20).nullish(),
      }).strict(), value);
    }
    if (section === 'languages') {
      parseBody(z.object({ enabled: z.array(language).min(1), default: language }).strict(), value);
    }
    if (section === 'usage_rates') {
      parseBody(z.object({
        telephony_per_minute: z.number().min(0).max(1000),
        voice_ai_per_minute: z.number().min(0).max(1000),
        currency: z.string().length(3),
      }).strict(), value);
    }
    res.json(await updateSettingsSection(services, req.actor!, section, value));
  }));
  router.get('/analytics/usage', asyncHandler(async (_req, res) => res.json(await usage(services))));

  return router;
}
