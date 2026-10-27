import { detectScriptLanguage, type LanguageCode } from '../domain/languages.js';
import { findApprovedAnswer, type KnowledgeEntry } from './knowledge.js';
import { classifyIntent, parseProducts } from './intents.js';
import { template, type TemplateKey } from './templates.js';

export type Stage = 'greeting' | 'callback_time' | 'products' | 'questions' | 'link_offer' | 'closed';
export type LeadOutcome = 'new' | 'interested' | 'not_interested' | 'callback_requested' | 'registered';
type OpenStage = Exclude<Stage, 'closed'>;

export type Effect =
  | { type: 'do_not_call' }
  | { type: 'transfer_human'; reason: string }
  | { type: 'send_link' }
  | { type: 'callback_requested'; note: string }
  | { type: 'products_recorded'; products: string[] }
  | { type: 'unanswered_question'; question: string }
  | { type: 'end_call' };

export interface ConversationState {
  language: LanguageCode;
  stage: Stage;
  turns: number;
  misses: number;
  products: string[];
  unansweredQuestions: string[];
  callbackNote: string | null;
  outcome: LeadOutcome;
  handoff: boolean;
  doNotCall: boolean;
  linkRequested: boolean;
}

export interface AgentTurn {
  reply: string;
  state: ConversationState;
  effects: Effect[];
}

export const MAX_TURNS = 30;
const MAX_MISSES = 2;

// Line the agent repeats when it has not received the answer it needs at this stage.
const PROMPT_FOR_STAGE: Record<OpenStage, TemplateKey> = {
  greeting: 'ask_convenient_time',
  callback_time: 'ask_callback_time',
  products: 'ask_products',
  questions: 'follow_up_question',
  link_offer: 'offer_link',
};

export function startConversation(language: LanguageCode): AgentTurn {
  const state: ConversationState = {
    language,
    stage: 'greeting',
    turns: 0,
    misses: 0,
    products: [],
    unansweredQuestions: [],
    callbackNote: null,
    outcome: 'new',
    handoff: false,
    doNotCall: false,
    linkRequested: false,
  };
  return { reply: template(language, 'greeting'), state, effects: [] };
}

/**
 * Advances the conversation by one supplier utterance. The function is pure: it
 * returns the next state, the reply to speak, and the side effects the caller must
 * persist. Refusals (stop, human, not interested) are checked before stage logic, so
 * a sales step can never override what the supplier asked for.
 */
export function handleSupplierTurn(
  previous: ConversationState,
  utterance: string,
  knowledge: KnowledgeEntry[],
): AgentTurn {
  const state: ConversationState = {
    ...previous,
    turns: previous.turns + 1,
    products: [...previous.products],
    unansweredQuestions: [...previous.unansweredQuestions],
  };
  if (state.stage === 'closed') return { reply: '', state, effects: [] };

  const text = utterance.trim();
  const detected = detectScriptLanguage(text);
  if (detected) state.language = detected;
  const intent = classifyIntent(text);

  if (intent === 'stop_contact') {
    return close(state, ['stop_confirmed'], [{ type: 'do_not_call' }, { type: 'end_call' }], {
      doNotCall: true,
      outcome: 'not_interested',
    });
  }
  if (intent === 'human') {
    return close(state, ['transfer_human'], [{ type: 'transfer_human', reason: 'supplier_requested' }, { type: 'end_call' }], {
      handoff: true,
    });
  }
  if (intent === 'not_interested') {
    return close(state, ['farewell'], [{ type: 'end_call' }], { outcome: 'not_interested' });
  }
  if (state.turns >= MAX_TURNS) {
    return close(state, ['transfer_human'], [{ type: 'transfer_human', reason: 'turn_limit_reached' }, { type: 'end_call' }], {
      handoff: true,
    });
  }

  switch (state.stage) {
    case 'greeting':
      if (intent === 'later' || intent === 'no') return open(state, 'callback_time', ['ask_callback_time']);
      if (intent === 'yes') {
        return open(state, 'products', ['pitch', 'ask_products']);
      }
      if (intent === 'question') return answerQuestion(state, text, knowledge);
      return miss(state);

    case 'callback_time': {
      if (intent === 'yes' || intent === 'no' || text.length < 2) return miss(state);
      const note = text.slice(0, 200);
      return close(state, ['callback_noted', 'farewell'], [{ type: 'callback_requested', note }, { type: 'end_call' }], {
        outcome: 'callback_requested',
        callbackNote: note,
      });
    }

    case 'products': {
      if (intent === 'question') return answerQuestion(state, text, knowledge);
      const products = parseProducts(text);
      if (!products.length) return miss(state);
      state.products = [...new Set([...state.products, ...products])];
      return open(state, 'questions', ['products_noted'], {
        outcome: state.outcome === 'new' ? 'interested' : state.outcome,
      }, [{ type: 'products_recorded', products: state.products }]);
    }

    case 'questions':
      if (intent === 'question') return answerQuestion(state, text, knowledge);
      if (intent === 'yes') return open(state, 'questions', ['follow_up_question']);
      return open(state, 'link_offer', ['offer_link']);

    case 'link_offer':
      if (intent === 'question') return answerQuestion(state, text, knowledge);
      if (intent === 'yes') {
        return close(state, ['link_queued', 'farewell'], [{ type: 'send_link' }, { type: 'end_call' }], {
          linkRequested: true,
          outcome: state.outcome === 'new' ? 'interested' : state.outcome,
        });
      }
      if (intent === 'no') return close(state, ['farewell'], [{ type: 'end_call' }]);
      return miss(state);
  }
  return { reply: template(state.language, 'farewell'), state, effects: [] };
}

function open(
  state: ConversationState,
  stage: OpenStage,
  keys: TemplateKey[],
  patch: Partial<ConversationState> = {},
  effects: Effect[] = [],
): AgentTurn {
  Object.assign(state, patch, { stage, misses: 0 });
  const lines = keys.map((key) => template(state.language, key));
  return { reply: lines.join(' '), state, effects };
}

function close(
  state: ConversationState,
  keys: TemplateKey[],
  effects: Effect[],
  patch: Partial<ConversationState> = {},
): AgentTurn {
  Object.assign(state, patch, { stage: 'closed' as const, misses: 0 });
  return { reply: keys.map((key) => template(state.language, key)).join(' '), state, effects };
}

function miss(state: ConversationState): AgentTurn {
  state.misses += 1;
  if (state.misses >= MAX_MISSES) {
    return close(state, ['transfer_human'], [{ type: 'transfer_human', reason: 'repeated_misunderstanding' }, { type: 'end_call' }], {
      handoff: true,
    });
  }
  const stage = state.stage === 'closed' ? 'greeting' : state.stage;
  return {
    reply: `${template(state.language, 'not_understood')} ${template(state.language, PROMPT_FOR_STAGE[stage])}`,
    state,
    effects: [],
  };
}

function answerQuestion(state: ConversationState, question: string, knowledge: KnowledgeEntry[]): AgentTurn {
  const stage = state.stage === 'closed' ? 'greeting' : state.stage;
  const reprompt = template(state.language, PROMPT_FOR_STAGE[stage]);
  state.misses = 0;
  const entry = findApprovedAnswer(question, state.language, knowledge);
  if (entry) return { reply: `${entry.answer} ${reprompt}`, state, effects: [] };
  const clipped = question.slice(0, 300);
  state.unansweredQuestions = [...state.unansweredQuestions, clipped];
  return {
    reply: `${template(state.language, 'unknown_answer')} ${reprompt}`,
    state,
    effects: [{ type: 'unanswered_question', question: clipped }],
  };
}

export interface ConversationSummary {
  summary: string;
  recommendedAction: string;
  leadStatus: LeadOutcome;
}

export function summarizeConversation(state: ConversationState, companyName?: string | null): ConversationSummary {
  const parts = [`${companyName ? `Supplier ${companyName}` : 'Supplier'} spoken to in ${state.language}.`];
  if (state.products.length) parts.push(`Products: ${state.products.join(', ')}.`);
  if (state.callbackNote) parts.push(`Callback time noted: "${state.callbackNote}".`);
  if (state.unansweredQuestions.length) parts.push(`Unanswered questions: ${state.unansweredQuestions.join(' | ')}.`);
  if (state.handoff) parts.push('Handed to a human team member.');
  if (state.doNotCall) parts.push('Asked not to be contacted again.');

  let recommendedAction = 'Retry per campaign rules.';
  if (state.doNotCall) recommendedAction = 'Suppressed. Do not dial this number for any marketing campaign.';
  else if (state.outcome === 'not_interested') recommendedAction = 'Close as not interested. No automated retry.';
  else if (state.outcome === 'callback_requested') recommendedAction = `Schedule a callback at the stated time: "${state.callbackNote}".`;
  else if (state.handoff) recommendedAction = 'Human team to call back and answer the open questions.';
  else if (state.linkRequested) recommendedAction = 'Send the Bulkskart website link and offer registration help.';
  else if (state.outcome === 'interested') recommendedAction = 'Human follow-up on the stated products.';

  return { summary: parts.join(' '), recommendedAction, leadStatus: state.outcome };
}
