import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { TelephonyProvider, WebhookRequest } from './types.js';

export const MOCK_SIGNATURE_HEADER = 'x-bulkskart-signature';

export function signPayload(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

// Simulated telephony. No real call is placed, and calls it creates are labelled
// mode='mock' so the dashboard never presents them as real dials.
export function createMockTelephonyProvider(webhookSecret: string | undefined): TelephonyProvider {
  return {
    name: 'mock',
    mode: 'mock',
    async placeCall() {
      return { providerCallId: `mock_${randomUUID()}` };
    },
    verifyWebhook(request: WebhookRequest) {
      if (!webhookSecret) return false;
      const received = request.headers[MOCK_SIGNATURE_HEADER] ?? '';
      const expected = Buffer.from(signPayload(request.rawBody, webhookSecret));
      const actual = Buffer.from(received);
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },
    parseStatusEvent(request) {
      try {
        const body = JSON.parse(request.rawBody) as Record<string, unknown>;
        const status = body.status as string;
        const allowed = ['ringing', 'in_progress', 'completed', 'no_answer', 'busy', 'failed', 'canceled'];
        if (typeof body.provider_call_id !== 'string' || !allowed.includes(status)) return null;
        return {
          providerCallId: body.provider_call_id,
          status: status as 'ringing',
          durationSeconds: typeof body.duration_seconds === 'number' ? body.duration_seconds : undefined,
        };
      } catch {
        return null;
      }
    },
  };
}
