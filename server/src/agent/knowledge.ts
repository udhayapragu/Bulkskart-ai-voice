import type { LanguageCode } from '../domain/languages.js';

export type KnowledgeStatus = 'draft' | 'approved' | 'retired';

export interface KnowledgeEntry {
  id: string;
  language: LanguageCode;
  topic: string;
  question: string;
  answer: string;
  keywords: string[];
  status: KnowledgeStatus;
}

/**
 * Finds an approved answer in the caller's language. Only entries whose status is
 * "approved" are eligible, so draft or retired content is never spoken. Returns
 * null when nothing matches, and the agent then says it does not know.
 */
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Latin keywords must match whole words, so "about" does not match "aboutique" and a
// generic cue cannot pull in an unrelated answer. Native-script keywords use substring
// matching because combining marks break word boundaries.
// Common words are never triggers, so an entry cannot match every question by accident.
const STOP_WORDS = new Set(['about', 'the', 'is', 'a', 'an', 'me', 'you', 'what', 'how', 'can', 'tell', 'this', 'that', 'it', 'of', 'for', 'to', 'in', 'on', 'and']);

export function keywordMatches(question: string, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();
  if (!needle || STOP_WORDS.has(needle)) return false;
  if (/^[a-z0-9' ]+$/.test(needle)) return new RegExp(`\\b${escapeRegExp(needle)}\\b`).test(question);
  return question.includes(needle);
}

export function findApprovedAnswer(
  question: string,
  language: LanguageCode,
  entries: KnowledgeEntry[],
): KnowledgeEntry | null {
  const haystack = question.toLowerCase();
  let best: { entry: KnowledgeEntry; score: number } | null = null;
  for (const entry of entries) {
    if (entry.status !== 'approved' || entry.language !== language) continue;
    const cues = entry.keywords.length ? entry.keywords : [entry.topic];
    const score = cues.filter((cue) => keywordMatches(haystack, cue)).length;
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry ?? null;
}
