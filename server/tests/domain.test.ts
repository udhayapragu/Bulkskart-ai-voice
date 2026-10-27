import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../src/domain/phone.js';
import { evaluateMarketingEligibility, isWithinCallingWindow } from '../src/domain/compliance.js';
import { nextAttemptAfterFailure } from '../src/domain/retry.js';
import { detectScriptLanguage } from '../src/domain/languages.js';
import { loadConfig } from '../src/config/index.js';

describe('phone normalisation', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['098765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['0044 7700 900123', '+447700900123'],
  ])('normalises %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['12345', 'abcdefghij', '+0123456789', ''])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('marketing eligibility', () => {
  const supplier = { do_not_call: false, contact_source: 'supplier_directory' };
  const granted = [{ status: 'granted' as const, basis: 'b2b', source: 'x', recorded_at: '2026-01-01T00:00:00Z' }];

  it('allows a supplier with granted consent and a contact source', () => {
    expect(evaluateMarketingEligibility({ supplier, consents: granted, requireConsent: true })).toBeNull();
  });

  it('blocks do-not-call suppliers regardless of consent', () => {
    expect(evaluateMarketingEligibility({ supplier: { ...supplier, do_not_call: true }, consents: granted, requireConsent: true })).toBe('do_not_call');
  });

  it('blocks when the latest consent record is withdrawal, even after an earlier grant', () => {
    const consents = [
      ...granted,
      { status: 'withdrawn' as const, basis: 'request', source: 'x', recorded_at: '2026-02-01T00:00:00Z' },
    ];
    expect(evaluateMarketingEligibility({ supplier, consents, requireConsent: false })).toBe('do_not_call');
  });

  it('requires granted consent when consent is required, and a contact source always', () => {
    expect(evaluateMarketingEligibility({ supplier, consents: [], requireConsent: true })).toBe('consent_not_granted');
    expect(evaluateMarketingEligibility({ supplier, consents: [], requireConsent: false })).toBeNull();
    expect(evaluateMarketingEligibility({ supplier: { do_not_call: false, contact_source: '' }, consents: granted, requireConsent: true })).toBe('missing_contact_source');
  });
});

describe('calling window', () => {
  const window = { start: '09:00', end: '19:00', timezone: 'Asia/Kolkata' };

  it('is open at 11:00 IST and closed at 23:00 IST', () => {
    expect(isWithinCallingWindow(new Date('2026-10-27T05:30:00Z'), window)).toBe(true);
    expect(isWithinCallingWindow(new Date('2026-10-27T17:30:00Z'), window)).toBe(false);
  });

  it('includes the start minute and excludes the end minute', () => {
    expect(isWithinCallingWindow(new Date('2026-10-27T03:30:00Z'), window)).toBe(true); // 09:00 IST
    expect(isWithinCallingWindow(new Date('2026-10-27T13:30:00Z'), window)).toBe(false); // 19:00 IST
  });

  it('supports overnight windows', () => {
    const overnight = { start: '22:00', end: '06:00', timezone: 'Asia/Kolkata' };
    expect(isWithinCallingWindow(new Date('2026-10-27T17:30:00Z'), overnight)).toBe(true); // 23:00 IST
    expect(isWithinCallingWindow(new Date('2026-10-27T05:30:00Z'), overnight)).toBe(false); // 11:00 IST
  });
});

describe('retry policy', () => {
  const now = new Date('2026-10-27T05:30:00Z');
  it('schedules a retry until max attempts is reached', () => {
    const first = nextAttemptAfterFailure(1, { maxAttempts: 3, retryDelayMinutes: 60 }, now);
    expect(first).toEqual({ result: 'retry_scheduled', nextAttemptAt: '2026-10-27T06:30:00.000Z' });
  });

  it('exhausts the contact when attempts reach the limit', () => {
    expect(nextAttemptAfterFailure(3, { maxAttempts: 3, retryDelayMinutes: 60 }, now)).toEqual({ result: 'exhausted', nextAttemptAt: null });
  });
});

describe('language detection', () => {
  it.each([
    ['नमस्ते', 'hi'],
    ['வணக்கம்', 'ta'],
    ['నమస్కారం', 'te'],
    ['നമസ്കാരം', 'ml'],
    ['hello there', null],
  ])('detects script in %s', (text, expected) => {
    expect(detectScriptLanguage(text)).toBe(expected);
  });
});

describe('configuration safety', () => {
  it('refuses production without postgres', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', STORE_DRIVER: 'memory', VOICE_PROVIDER: 'sarvam', SESSION_SECRET: 'x'.repeat(40) })).toThrow(/postgres/);
  });

  it('refuses a short session secret', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'short' })).toThrow(/at least 32/);
  });

  it('requires Exotel credentials when Exotel is selected', () => {
    expect(() => loadConfig({ TELEPHONY_PROVIDER: 'exotel' })).toThrow(/EXOTEL_ACCOUNT_SID/);
  });

  it('treats empty environment values as unset', () => {
    const config = loadConfig({ TELEPHONY_WEBHOOK_SECRET: '', WEB_DIST_DIR: '', DATABASE_URL: '', SESSION_SECRET: '' });
    expect(config.TELEPHONY_WEBHOOK_SECRET).toBeUndefined();
    expect(config.WEB_DIST_DIR).toBeUndefined();
    expect(config.SESSION_SECRET).toBeUndefined();
  });

  it('keeps live calling disabled by default', () => {
    expect(loadConfig({}).LIVE_CALLING_ENABLED).toBe(false);
  });
});
