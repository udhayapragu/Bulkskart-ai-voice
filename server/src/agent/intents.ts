import type { LanguageCode } from '../domain/languages.js';

export type Intent = 'stop_contact' | 'human' | 'not_interested' | 'later' | 'yes' | 'no' | 'question' | 'unknown';

// Keyword cues per language. Matching is case-insensitive substring matching on the
// normalised utterance. A production deployment should also use the speech model's
// intent output; these cues are the deterministic fallback and the test oracle.
const CUES: Record<Intent, Record<LanguageCode, string[]>> = {
  stop_contact: {
    en: ["don't call", 'do not call', 'dont call', 'stop calling', 'remove me', 'unsubscribe', 'stop'],
    hi: ['मत कॉल', 'कॉल मत', 'फोन मत', 'बंद करो', 'बंद कीजिए'],
    ta: ['அழைக்க வேண்டாம்', 'அழைக்காதீர்', 'அழைப்பதை நிறுத்', 'நிறுத்துங்கள்'],
    te: ['కాల్ చేయకండి', 'కాల్ చేయవద్దు', 'కాల్స్ ఆపండి', 'ఆపండి'],
    ml: ['വിളിക്കരുത്', 'വിളിക്കല്ലേ', 'വിളി നിർത്ത'],
  },
  human: {
    en: ['human', 'real person', 'talk to someone', 'manager', 'executive', 'agent'],
    hi: ['इंसान', 'किसी से बात', 'मैनेजर', 'आदमी से'],
    ta: ['மனிதர்', 'ஆளிடம்', 'மேலாளர்'],
    te: ['మనిషి', 'వ్యక్తితో', 'మేనేజర్'],
    ml: ['ആളോട്', 'മനുഷ്യൻ', 'മാനേജർ'],
  },
  not_interested: {
    en: ['not interested', 'no thanks', 'no need', 'not required', 'already have'],
    hi: ['रुचि नहीं', 'जरूरत नहीं', 'ज़रूरत नहीं', 'नहीं चाहिए', 'इच्छा नहीं'],
    ta: ['ஆர்வம் இல்லை', 'தேவையில்லை', 'வேண்டாம்'],
    te: ['ఆసక్తి లేదు', 'అవసరం లేదు', 'వద్దు'],
    ml: ['താൽപ്പര്യമില്ല', 'ആവശ്യമില്ല', 'വേണ്ട'],
  },
  later: {
    en: ['later', 'call back', 'call me back', 'busy', 'not now', 'tomorrow'],
    hi: ['बाद में', 'बाद मे', 'फिर कॉल', 'अभी नहीं', 'व्यस्त', 'कल'],
    ta: ['பிறகு', 'பின்னர்', 'இப்போது முடியாது', 'பிசி', 'நாளை'],
    te: ['తర్వాత', 'ఇప్పుడు కాదు', 'బిజీ', 'రేపు'],
    ml: ['പിന്നീട്', 'ഇപ്പോൾ പറ്റില്ല', 'തിരക്കിലാണ്', 'നാളെ'],
  },
  yes: {
    en: ['yes', 'yeah', 'sure', 'okay', 'ok', 'go ahead'],
    hi: ['हाँ', 'हां', 'ठीक है', 'जी'],
    ta: ['ஆம்', 'சரி', 'ஓகே'],
    te: ['అవును', 'సరే', 'ఓకే'],
    ml: ['അതെ', 'ശരി', 'ഓക്കെ'],
  },
  no: {
    en: ['no', 'nope'],
    hi: ['नहीं', 'ना'],
    ta: ['இல்லை'],
    te: ['లేదు', 'కాదు'],
    ml: ['ഇല്ല'],
  },
  question: { en: [], hi: [], ta: [], te: [], ml: [] },
  unknown: { en: [], hi: [], ta: [], te: [], ml: [] },
};

// Priority: stop/human/not-interested/later are checked before yes/no so that a
// refusal is never mistaken for agreement.
const PRIORITY: Intent[] = ['stop_contact', 'human', 'not_interested', 'later', 'yes', 'no'];

const QUESTION_WORDS = /\b(what|how|when|where|why|who|which|price|cost|fee|fees|charge|charges|register|registration|kitna|kya|kaise)\b|\?/i;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Latin cues need word boundaries so "no" does not match "know" and "ok" not "book".
// Native-script cues use plain substring matching because combining marks break \b.
function containsCue(text: string, cue: string): boolean {
  const needle = cue.toLowerCase();
  if (/^[a-z' ]+$/.test(needle)) return new RegExp(`\\b${escapeRegExp(needle)}\\b`).test(text);
  return text.includes(needle);
}

/**
 * Cues from every language are checked, because suppliers often code-mix (for example
 * a Tamil conversation containing an English "not interested").
 */
export function classifyIntent(text: string): Intent {
  const normalised = text.toLowerCase().trim();
  if (!normalised) return 'unknown';
  for (const intent of PRIORITY) {
    const cues = Object.values(CUES[intent]).flat();
    if (cues.some((cue) => containsCue(normalised, cue))) return intent;
  }
  return QUESTION_WORDS.test(normalised) ? 'question' : 'unknown';
}

const LEADING_FILLER = /^(we|i|our company|our firm|our unit|the company|company)\s+(actually\s+)?(manufacture|manufactures|make|makes|produce|produces|supply|supplies|deal in|trade in|sell|sells)\s+/i;

/**
 * Splits a free-text product answer such as "We manufacture rice, sugar and oil." into
 * product names. Filler phrases and trailing punctuation are removed.
 */
export function parseProducts(text: string): string[] {
  const body = text.trim().replace(LEADING_FILLER, '');
  return body
    .split(/,|\band\b|\/|;| और | மற்றும் | మరియు | ഉം /u)
    .map((part) => part.trim().replace(/[.!?]+$/, '').trim())
    .filter((part) => part.length > 1 && part.length < 80)
    .slice(0, 20);
}
