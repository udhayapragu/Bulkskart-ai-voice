import { ACTIVE_CALL_STATUSES, type Call, type Campaign, type FollowUpTask, type Supplier } from '../domain/types.js';
import type { Services } from './context.js';
import { getSettings } from './settings.js';

const LEAD_STATUSES = ['new', 'interested', 'not_interested', 'callback_requested', 'registered'] as const;

export async function overview(services: Services) {
  const [suppliers, campaigns, calls, followUps] = await Promise.all([
    services.store.find('suppliers').then((rows) => rows as unknown as Supplier[]),
    services.store.find('campaigns').then((rows) => rows as unknown as Campaign[]),
    services.store.find('calls').then((rows) => rows as unknown as Call[]),
    services.store.find('follow_up_tasks', { where: { status: 'open' } }).then((rows) => rows as unknown as FollowUpTask[]),
  ]);
  const todayStart = new Date(services.now());
  todayStart.setUTCHours(0, 0, 0, 0);

  const leads = Object.fromEntries(LEAD_STATUSES.map((status) => [status, 0])) as Record<string, number>;
  for (const supplier of suppliers) leads[supplier.lead_status] += 1;

  const outcomes = Object.fromEntries(LEAD_STATUSES.map((status) => [status, 0])) as Record<string, number>;
  for (const call of calls) if (call.outcome) outcomes[call.outcome] += 1;

  const campaignCounts: Record<string, number> = { draft: 0, running: 0, paused: 0, completed: 0, archived: 0 };
  for (const campaign of campaigns) campaignCounts[campaign.status] += 1;

  return {
    suppliers: suppliers.length,
    do_not_call: suppliers.filter((supplier) => supplier.do_not_call).length,
    leads,
    campaigns: campaignCounts,
    calls: {
      total: calls.length,
      today: calls.filter((call) => new Date(call.created_at) >= todayStart).length,
      active: calls.filter((call) => ACTIVE_CALL_STATUSES.includes(call.status)).length,
      simulated: calls.filter((call) => call.mode === 'mock').length,
    },
    outcomes,
    open_follow_ups: followUps.length,
  };
}

export async function usage(services: Services) {
  const [calls, settings] = await Promise.all([
    services.store.find('calls').then((rows) => rows as unknown as Call[]),
    getSettings(services),
  ]);
  const completed = calls.filter((call) => call.duration_seconds);
  const minutesBy = (mode: 'mock' | 'live') =>
    completed.filter((call) => call.mode === mode).reduce((sum, call) => sum + (call.duration_seconds ?? 0), 0) / 60;
  const liveMinutes = minutesBy('live');
  const rates = settings.usage_rates;
  const estimated = liveMinutes * (rates.telephony_per_minute + rates.voice_ai_per_minute);
  return {
    calls_total: calls.length,
    calls_by_mode: {
      live: calls.filter((call) => call.mode === 'live').length,
      mock: calls.filter((call) => call.mode === 'mock').length,
    },
    minutes: { live: round(liveMinutes), mock_simulated: round(minutesBy('mock')) },
    estimated_cost: {
      amount: round(estimated),
      currency: rates.currency,
      note: rates.telephony_per_minute === 0 && rates.voice_ai_per_minute === 0
        ? 'Rates are not configured. Enter them in Settings to see an estimate.'
        : 'Estimate only. Reconcile with provider invoices.',
    },
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
