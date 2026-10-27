export const LANGUAGES = ['en', 'hi', 'ta', 'te', 'ml'] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  ml: 'Malayalam',
};

// Unicode blocks identify the script of what the supplier said. Romanised speech
// cannot be classified this way, so it leaves the current language unchanged.
const SCRIPT_RANGES: Array<{ language: Exclude<LanguageCode, 'en'>; pattern: RegExp }> = [
  { language: 'hi', pattern: /[ऀ-ॿ]/g },
  { language: 'ta', pattern: /[஀-௿]/g },
  { language: 'te', pattern: /[ఀ-౿]/g },
  { language: 'ml', pattern: /[ഀ-ൿ]/g },
];

/** Returns the language written in the dominant native script, or null for Latin text. */
export function detectScriptLanguage(text: string): LanguageCode | null {
  let best: { language: LanguageCode; count: number } | null = null;
  for (const { language, pattern } of SCRIPT_RANGES) {
    const count = (text.match(pattern) ?? []).length;
    if (count > 0 && (!best || count > best.count)) best = { language, count };
  }
  return best?.language ?? null;
}

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}
