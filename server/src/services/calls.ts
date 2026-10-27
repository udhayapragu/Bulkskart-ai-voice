import { ACTIVE_CALL_STATUSES, type Call, type CallStatus, type Campaign, type CampaignContact, type FollowUpTask, type Supplier, type TranscriptLine } from '../domain/types.js';
import type { LanguageCode } from '../domain/languages.js';
import { normalizePhone } from '../domain/phone.js';
import { nextAttemptAfterFailure } from '../domain/retry.js';
import { handleSupplierTurn, startConversation, summarizeConversation, type ConversationState, type Effect } from '../agent/engine.js';
import { loadApprovedKnowledge } from './knowledge.js';
import { setDoNotCall } from './suppliers.js';
import { audit, type Services } from './context.js';
import type { Row } from '../db/store.js';
import type { SimulationScenario } from '../agent/scenarios.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type ContactResult = 'completed' | 'no_answer' | 'busy' | 'failed' | 'canceled';

/**
 * Applies the outcome of one attempt to a campaign contact. Failed attempts are
 * retried until max_attempts, then marked exhausted. Completed contacts are never retried.
 */
export async function settleContact(
  services: Services,
  campaign: Pick<Campaign, 'max_attempts' | 'retry_delay_minutes'>,
  contactId: string,
  attempts: number,
  result: ContactResult,
  outcome: string | null = null,
): Promise<void> {
  const contact = await services.store.get('campaign_contacts', contactId);
  // Suppressed contacts (DNC) stay suppressed whatever the attempt result was.
  if (!contact || contact.status === 'suppressed') return;

  if (result === 'completed') {
    await services.store.update('campaign_contacts', contactId, { status: 'completed', last_outcome: outcome ?? 'completed' });
    return;
  }
  const retry = nextAttemptAfterFailure(attempts, { maxAttempts: campaign.max_attempts, retryDelayMinutes: campaign.retry_delay_minutes }, services.now());
  if (retry.result === 'exhausted') {
    await services.store.update('campaign_contacts', contactId, { status: 'exhausted', last_outcome: result });
  } else {
    await services.store.update('campaign_contacts', contactId, {
      status: 'pending',
      last_outcome: result,
      next_attempt_at: retry.nextAttemptAt,
    });
  }
}

async function createFollowUp(services: Services, supplierId: string, callId: string | null, taskType: FollowUpTask['task_type'], notes: string, dueInMs: number | null) {
  return services.store.insert('follow_up_tasks', {
    supplier_id: supplierId,
    call_id: callId,
    task_type: taskType,
    notes,
    due_at: dueInMs === null ? null : new Date(services.now().getTime() + dueInMs).toISOString(),
    status: 'open',
  });
}

async function applyEffects(services: Services, call: Call, effects: Effect[]): Promise<void> {
  const supplierId = call.supplier_id as string;
  for (const effect of effects) {
    switch (effect.type) {
      case 'do_not_call':
        await setDoNotCall(services, 'agent:voice', supplierId, 'Supplier asked not to be called during a call');
        break;
      case 'transfer_human':
        await createFollowUp(services, supplierId, call.id, 'human_handoff', `Handoff requested: ${effect.reason}`, DAY_MS);
        break;
      case 'send_link':
        // Queued only. Sending needs an approved messaging integration, which is not
        // connected here, so the dashboard shows this as pending, not sent.
        await createFollowUp(services, supplierId, call.id, 'send_website_link', `Send ${services.config.WEBSITE_URL} (pending approved messaging integration)`, null);
        break;
      case 'callback_requested':
        await createFollowUp(services, supplierId, call.id, 'callback', `Callback time given by supplier: ${effect.note}`, DAY_MS);
        break;
      case 'products_recorded':
      case 'unanswered_question':
      case 'end_call':
        break;
    }
  }
}

async function appendTranscript(services: Services, callId: string, lines: TranscriptLine[]): Promise<void> {
  const call = await services.store.get('calls', callId);
  const existing = (call?.transcript as TranscriptLine[] | undefined) ?? [];
  await services.store.update('calls', callId, { transcript: [...existing, ...lines] });
}

/** Starts the agent's opening turn for a call that the telephony provider has connected. */
export async function openCallConversation(services: Services, callId: string) {
  const call = (await services.store.get('calls', callId)) as unknown as Call;
  const language: LanguageCode = call.language ?? 'en';
  const opening = startConversation(language);
  const now = services.now().toISOString();
  await services.store.update('calls', callId, {
    status: 'in_progress',
    started_at: call.started_at ?? now,
    agent_state: opening.state as unknown as Row,
  });
  await appendTranscript(services, callId, [{ speaker: 'agent', text: opening.reply, at: now }]);
  return opening.reply;
}

/**
 * One conversational turn: transcribe the supplier's audio, advance the engine, apply
 * side effects, speak the reply. Finalises the call when the conversation closes.
 */
export async function handleSupplierAudio(services: Services, callId: string, audio: Buffer): Promise<{ reply: string; ended: boolean }> {
  const call = (await services.store.get('calls', callId)) as unknown as Call | undefined;
  if (!call) throw new Error(`Call not found: ${callId}`);
  if (!ACTIVE_CALL_STATUSES.includes(call.status)) throw new Error(`Call ${callId} is not active`);

  const { text } = await services.voice.transcribe(audio);
  const now = services.now().toISOString();
  const state = call.agent_state as unknown as ConversationState;
  const turn = handleSupplierTurn(state, text, await loadApprovedKnowledge(services));

  await services.store.update('calls', callId, {
    language: turn.state.language,
    agent_state: turn.state as unknown as Row,
  });
  await applyEffects(services, { ...call, language: turn.state.language }, turn.effects);
  const lines: TranscriptLine[] = [{ speaker: 'supplier', text, at: now }];
  if (turn.reply) lines.push({ speaker: 'agent', text: turn.reply, at: now });
  await appendTranscript(services, callId, lines);

  const ended = turn.state.stage === 'closed';
  if (ended) await finalizeCall(services, callId);
  return { reply: turn.reply, ended };
}

export async function finalizeCall(services: Services, callId: string): Promise<void> {
  const call = (await services.store.get('calls', callId)) as unknown as Call;
  const state = call.agent_state as unknown as ConversationState;
  const supplier = (await services.store.get('suppliers', call.supplier_id as string)) as unknown as Supplier | undefined;
  const summary = summarizeConversation(state, supplier?.company_name);
  const now = services.now().toISOString();

  // Simulated duration for mock calls only. Live calls take duration from the provider.
  const duration = call.mode === 'mock' ? Math.max(1, state.turns * 8) : call.duration_seconds;
  const status: CallStatus = state.handoff ? 'handoff' : 'completed';
  await services.store.update('calls', callId, {
    status,
    outcome: summary.leadStatus,
    duration_seconds: duration,
    ended_at: now,
  });

  await services.store.insert('call_summaries', {
    call_id: callId,
    summary: summary.summary,
    recommended_action: summary.recommendedAction,
    lead_status: summary.leadStatus,
    language: state.language,
  });

  if (supplier && summary.leadStatus !== 'new' && supplier.lead_status !== 'registered') {
    await services.store.update('suppliers', supplier.id, { lead_status: summary.leadStatus });
  }
  if (state.unansweredQuestions.length) {
    await createFollowUp(services, call.supplier_id as string, callId, 'review', `Unanswered questions: ${state.unansweredQuestions.join(' | ')}`, DAY_MS);
  }

  if (call.campaign_id && call.supplier_id) {
    const campaign = (await services.store.get('campaigns', call.campaign_id)) as unknown as Campaign | undefined;
    const [contact] = await services.store.find('campaign_contacts', { where: { campaign_id: call.campaign_id, supplier_id: call.supplier_id } });
    if (campaign && contact) {
      await settleContact(services, campaign, contact.id as string, Number(contact.attempts), 'completed', summary.leadStatus);
    }
  }
  await audit(services, 'agent:voice', 'call.completed', 'call', callId, { outcome: summary.leadStatus, status });
}

/** Runs a complete scripted conversation for a mock call. Used by the simulator and dev/demo tooling. */
export async function runSimulatedConversation(services: Services, callId: string, scenario: SimulationScenario): Promise<void> {
  await openCallConversation(services, callId);
  for (const line of scenario.supplierTurns) {
    const { ended } = await handleSupplierAudio(services, callId, Buffer.from(line, 'utf8'));
    if (ended) return;
  }
  // Scenario ran out before the conversation closed. Close the call as incomplete.
  const call = (await services.store.get('calls', callId)) as unknown as Call;
  if (ACTIVE_CALL_STATUSES.includes(call.status)) {
    await services.store.update('calls', callId, { status: 'completed', ended_at: services.now().toISOString() });
  }
}

export interface StatusEventResult {
  matched: boolean;
  duplicate: boolean;
  status?: CallStatus;
}

const PROVIDER_TO_CALL_STATUS: Record<string, CallStatus> = {
  ringing: 'ringing',
  in_progress: 'in_progress',
  completed: 'completed',
  no_answer: 'no_answer',
  busy: 'busy',
  failed: 'failed',
  canceled: 'canceled',
};

/**
 * Applies a verified provider status callback. Terminal states are final, so a
 * replayed or out-of-order event cannot reopen a call.
 */
export async function applyStatusEvent(
  services: Services,
  event: { providerCallId: string; status: string; durationSeconds?: number },
): Promise<StatusEventResult> {
  const [call] = await services.store.find('calls', { where: { provider_call_id: event.providerCallId } });
  if (!call) return { matched: false, duplicate: false };
  const current = call as unknown as Call;
  const next = PROVIDER_TO_CALL_STATUS[event.status];
  if (!next) return { matched: true, duplicate: false };
  if (['completed', 'no_answer', 'busy', 'failed', 'canceled'].includes(current.status)) {
    return { matched: true, duplicate: true, status: current.status };
  }

  const isTerminal = ['completed', 'no_answer', 'busy', 'failed', 'canceled'].includes(next);
  const patch: Row = { status: next };
  if (event.durationSeconds !== undefined) patch.duration_seconds = event.durationSeconds;
  if (isTerminal) patch.ended_at = services.now().toISOString();
  await services.store.update('calls', current.id, patch);

  if (isTerminal && current.campaign_id && current.supplier_id) {
    const campaign = (await services.store.get('campaigns', current.campaign_id)) as unknown as Campaign | undefined;
    const [contact] = await services.store.find('campaign_contacts', { where: { campaign_id: current.campaign_id, supplier_id: current.supplier_id } });
    if (campaign && contact) {
      await settleContact(services, campaign, contact.id as string, Number(contact.attempts), next as ContactResult);
    }
  }
  return { matched: true, duplicate: false, status: next };
}

export interface InboundResult {
  callId: string;
  supplierId: string;
  language: LanguageCode;
  action: 'connect_agent';
  createdSupplier: boolean;
}

/** Routes an inbound call to the agent. Unknown callers are recorded with unknown consent. */
export async function routeInboundCall(
  services: Services,
  input: { from: string; to: string; providerCallId: string },
): Promise<InboundResult> {
  const phone = normalizePhone(input.from);
  if (!phone) throw new Error(`Inbound caller number is not valid: ${input.from}`);

  let supplier = (await services.store.find('suppliers', { where: { phone_e164: phone } }))[0] as unknown as Supplier | undefined;
  let createdSupplier = false;
  if (!supplier) {
    supplier = (await services.store.insert('suppliers', {
      phone_e164: phone,
      contact_source: 'inbound_call',
      lead_status: 'new',
      products: [],
      do_not_call: false,
    })) as unknown as Supplier;
    await services.store.insert('consent_records', {
      supplier_id: supplier.id,
      status: 'unknown',
      basis: 'inbound_initiated',
      source: 'inbound_call',
      evidence: input.providerCallId,
    });
    createdSupplier = true;
  }
  const language: LanguageCode = supplier.preferred_language ?? 'en';
  const call = await services.store.insert('calls', {
    supplier_id: supplier.id,
    direction: 'inbound',
    mode: services.telephony.mode,
    provider: services.telephony.name,
    provider_call_id: input.providerCallId,
    from_number: phone,
    to_number: input.to,
    language,
    status: 'queued',
    transcript: [],
    agent_state: {},
    recording_permitted: false,
  });
  await audit(services, 'telephony:inbound', 'call.inbound', 'call', String(call.id), { created_supplier: createdSupplier });
  return { callId: String(call.id), supplierId: supplier.id, language, action: 'connect_agent', createdSupplier };
}
