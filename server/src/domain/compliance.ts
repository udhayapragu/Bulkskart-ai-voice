export type ConsentStatus = 'granted' | 'withdrawn' | 'unknown';

export interface ConsentRecord {
  status: ConsentStatus;
  basis: string;
  source: string;
  recorded_at: string;
}

export interface SupplierCompliance {
  do_not_call: boolean;
  contact_source: string | null | undefined;
}

export type EligibilityBlock = 'do_not_call' | 'missing_contact_source' | 'consent_not_granted' | 'outside_calling_window' | 'max_attempts_reached' | 'not_due';

/**
 * Latest consent record wins. Withdrawal or DNC always blocks marketing calls,
 * whatever the earlier records said.
 */
export function latestConsent(records: ConsentRecord[]): ConsentRecord | undefined {
  return [...records].sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1))[0];
}

export function evaluateMarketingEligibility(input: {
  supplier: SupplierCompliance;
  consents: ConsentRecord[];
  requireConsent: boolean;
}): EligibilityBlock | null {
  if (input.supplier.do_not_call) return 'do_not_call';
  if (!input.supplier.contact_source) return 'missing_contact_source';
  const consent = latestConsent(input.consents);
  if (consent?.status === 'withdrawn') return 'do_not_call';
  if (input.requireConsent && consent?.status !== 'granted') return 'consent_not_granted';
  return null;
}

/** Returns minutes since midnight in the given IANA timezone. */
export function localMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Window is inclusive of start and exclusive of end. Overnight windows are supported. */
export function isWithinCallingWindow(date: Date, window: { start: string; end: string; timezone: string }): boolean {
  const now = localMinutes(date, window.timezone);
  const start = toMinutes(window.start);
  const end = toMinutes(window.end);
  return start <= end ? now >= start && now < end : now >= start || now < end;
}
