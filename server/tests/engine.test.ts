import { describe, expect, it } from 'vitest';
import { classifyIntent, parseProducts } from '../src/agent/intents.js';
import { handleSupplierTurn, startConversation, summarizeConversation, type AgentTurn } from '../src/agent/engine.js';
import { findApprovedAnswer, type KnowledgeEntry } from '../src/agent/knowledge.js';
import { SCENARIOS } from '../src/agent/scenarios.js';
import { TEMPLATES } from '../src/agent/templates.js';
import type { LanguageCode } from '../src/domain/languages.js';

const knowledge: KnowledgeEntry[] = [
  { id: 'k1', language: 'en', topic: 'about', question: 'What is Bulkskart?', answer: 'Bulkskart is a B2B bulk trading marketplace.', keywords: ['bulkskart', 'what is'], status: 'approved' },
  { id: 'k2', language: 'en', topic: 'fees', question: 'Registration fees?', answer: 'Registration fees are 500 rupees.', keywords: ['fee', 'fees'], status: 'draft' },
  { id: 'k3', language: 'hi', topic: 'about', question: 'Bulkskart क्या है?', answer: 'Bulkskart एक B2B बल्क ट्रेडिंग मार्केटप्लेस है।', keywords: ['क्या है'], status: 'approved' },
];

function run(language: LanguageCode, utterances: string[], kb: KnowledgeEntry[] = knowledge) {
  let turn: AgentTurn = startConversation(language);
  const replies = [turn.reply];
  const effects = [...turn.effects];
  for (const utterance of utterances) {
    if (turn.state.stage === 'closed') break;
    turn = handleSupplierTurn(turn.state, utterance, kb);
    replies.push(turn.reply);
    effects.push(...turn.effects);
  }
  return { state: turn.state, replies, effects };
}

describe('intent classification', () => {
  it('does not match "no" inside "know"', () => {
    expect(classifyIntent('I want to know more')).not.toBe('no');
  });

  it('matches stop requests before anything else, in every language', () => {
    expect(classifyIntent("Please don't call me again")).toBe('stop_contact');
    expect(classifyIntent('मत कॉल करो')).toBe('stop_contact');
    expect(classifyIntent('அழைக்க வேண்டாம்')).toBe('stop_contact');
    expect(classifyIntent('కాల్ చేయకండి')).toBe('stop_contact');
    expect(classifyIntent('വിളിക്കരുത്')).toBe('stop_contact');
  });

  it('treats a refusal as refusal even when it contains a yes-cue', () => {
    expect(classifyIntent('yes but not interested')).toBe('not_interested');
  });

  it('recognises questions', () => {
    expect(classifyIntent('What are the charges?')).toBe('question');
  });
});

describe('product parsing', () => {
  it('splits a free-text product answer', () => {
    expect(parseProducts('rice, sugar and cooking oil')).toEqual(['rice', 'sugar', 'cooking oil']);
  });
});

describe('five-language conversation', () => {
  const languages: LanguageCode[] = ['en', 'hi', 'ta', 'te', 'ml'];

  it.each(languages)('opens in %s with a Bulkskart AI-assistant identification and a convenient-time question', (language) => {
    const opening = startConversation(language);
    expect(opening.reply).toBe(TEMPLATES[language].greeting);
    expect(opening.reply).toMatch(/Bulkskart/);
    expect(opening.state.stage).toBe('greeting');
  });

  it('has every template key translated for every language', () => {
    const keys = Object.keys(TEMPLATES.en);
    for (const language of languages) {
      for (const key of keys) {
        expect(TEMPLATES[language][key as keyof typeof TEMPLATES.en], `${language}.${key}`).toBeTruthy();
      }
    }
  });

  it('switches to the language the supplier speaks, when it is written in a native script', () => {
    const turn = handleSupplierTurn(startConversation('en').state, 'ஆம், சொல்லுங்கள்', knowledge);
    expect(turn.state.language).toBe('ta');
    expect(turn.reply).toBe(TEMPLATES.ta.pitch + ' ' + TEMPLATES.ta.ask_products);
  });

  it('runs an interested Tamil-speaking supplier through products to a link request', () => {
    const { state, effects } = run('ta', ['ஆம்', 'அரிசி, சர்க்கரை', 'இல்லை', 'ஆம், இணைப்பை அனுப்புங்கள்']);
    expect(state.stage).toBe('closed');
    expect(state.products).toEqual(['அரிசி', 'சர்க்கரை']);
    expect(effects.some((e) => e.type === 'send_link')).toBe(true);
    expect(state.outcome).toBe('interested');
  });
});

describe('refusals and handoffs', () => {
  it('records do-not-call and ends the call when asked to stop, even in the middle of a sales step', () => {
    const { state, effects } = run('en', ['Yes, go ahead.', 'We make cotton.', "Stop calling me, don't call again"]);
    expect(effects.some((e) => e.type === 'do_not_call')).toBe(true);
    expect(state.doNotCall).toBe(true);
    expect(state.stage).toBe('closed');
  });

  it('hands off to a human when the supplier asks for a person', () => {
    const { state, effects } = run('te', ['నాకు మనిషితో మాట్లాడాలి']);
    expect(state.handoff).toBe(true);
    expect(effects).toContainEqual({ type: 'transfer_human', reason: 'supplier_requested' });
  });

  it('records not interested without any further sales steps', () => {
    const { state, replies } = run('ml', ['താൽപ്പര്യമില്ല']);
    expect(state.outcome).toBe('not_interested');
    expect(replies.at(-1)).not.toMatch(/\?/);
  });

  it('hands off after repeated misunderstanding instead of looping', () => {
    const { state } = run('en', ['mmm', 'hmm']);
    expect(state.handoff).toBe(true);
    expect(state.stage).toBe('closed');
  });

  it('captures a callback time when the supplier is busy', () => {
    const { state, effects } = run('hi', ['अभी व्यस्त हूँ, कल शाम को कॉल करें।', 'शाम 6 बजे के बाद']);
    expect(state.outcome).toBe('callback_requested');
    expect(effects).toContainEqual({ type: 'callback_requested', note: 'शाम 6 बजे के बाद' });
  });
});

describe('knowledge-only answers (no invented facts)', () => {
  it('answers from an approved entry in the same language', () => {
    const entry = findApprovedAnswer('What is Bulkskart exactly?', 'en', knowledge);
    expect(entry?.id).toBe('k1');
  });

  it('never speaks a draft entry', () => {
    const { replies, effects } = run('en', ['Yes.', 'Cotton.', 'What are the registration fees?']);
    expect(replies.join(' ')).not.toMatch(/500 rupees/);
    expect(effects.some((e) => e.type === 'unanswered_question')).toBe(true);
  });

  it('says it does not know when there is no approved answer, and never states a fee', () => {
    const { replies, state } = run('en', ['Yes.', 'Cotton.', 'Is there a financing approval for my shop?']);
    expect(replies.join(' ')).toContain(TEMPLATES.en.unknown_answer);
    expect(state.unansweredQuestions).toHaveLength(1);
  });

  it('does not answer an unrelated question with a common-word keyword', () => {
    const generic: KnowledgeEntry[] = [
      { id: 'g1', language: 'en', topic: 'about', question: 'What is Bulkskart?', answer: 'Bulkskart is a B2B marketplace.', keywords: ['about'], status: 'approved' },
    ];
    expect(findApprovedAnswer('Can you tell me about registration?', 'en', generic)).toBeNull();
    const { replies } = run('en', ['Yes.', 'Cotton.', 'Can you tell me about registration?'], generic);
    expect(replies.join(' ')).not.toContain('B2B marketplace');
  });

  it('matches whole words only, so a trigger does not fire inside a longer word', () => {
    const entries: KnowledgeEntry[] = [
      { id: 'w1', language: 'en', topic: 'shop', question: 'Shop?', answer: 'Shop answer.', keywords: ['shop'], status: 'approved' },
    ];
    expect(findApprovedAnswer('We run a workshop', 'en', entries)).toBeNull();
    expect(findApprovedAnswer('We run a shop', 'en', entries)?.id).toBe('w1');
  });

  it('extracts product names without filler words or trailing punctuation', () => {
    expect(parseProducts('We manufacture cotton fabric and garments.')).toEqual(['cotton fabric', 'garments']);
    expect(parseProducts('Our company makes rice, sugar.')).toEqual(['rice', 'sugar']);
  });

  it('answers in the caller language only when an approved entry exists for that language', () => {
    const { replies } = run('hi', ['हाँ', 'Bulkskart क्या है?']);
    expect(replies.join(' ')).toContain('B2B बल्क ट्रेडिंग मार्केटप्लेस');
  });
});

describe('simulator scenarios', () => {
  it.each(SCENARIOS.map((s) => [s.id, s] as const))('scenario %s reaches a closed conversation', (_id, scenario) => {
    const { state } = run(scenario.language, scenario.supplierTurns);
    expect(state.stage).toBe('closed');
  });

  it('summarises a conversation and recommends a concrete next action', () => {
    const { state } = run('en', ['Yes.', 'We make cotton.', 'No, that is all.', 'Yes, send the link.']);
    const summary = summarizeConversation(state, 'Acme Textiles');
    expect(summary.summary).toContain('Acme Textiles');
    expect(summary.recommendedAction).toMatch(/website link/);
    expect(summary.leadStatus).toBe('interested');
  });
});
