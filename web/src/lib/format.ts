import type { LanguageCode, LeadStatus } from './types';

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  ml: 'Malayalam',
};

export const LEAD_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  interested: 'Interested',
  not_interested: 'Not Interested',
  callback_requested: 'Callback Requested',
  registered: 'Registered',
};

export const LEAD_STATUSES = Object.keys(LEAD_LABELS) as LeadStatus[];

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
