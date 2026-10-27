import { timingSafeEqual } from 'node:crypto';
import type { TelephonyProvider, WebhookRequest } from './types.js';

// Exotel adapter. Fail-closed: outbound dialing and webhook field mapping are not yet
// verified against Exotel's official API documentation. Webhooks are rejected unless a
// shared token is configured and matches, so an unverified endpoint cannot update calls.
export function createExotelTelephonyProvider(webhookToken: string | undefined): TelephonyProvider {
  return {
    name: 'exotel',
    mode: 'live',
    async placeCall() {
      throw new Error('Exotel outbound dialing is not verified in this build. Use the mock provider or complete the Exotel adapter.');
    },
    verifyWebhook(request: WebhookRequest) {
      if (!webhookToken) return false;
      const received = Buffer.from(request.query.token ?? '');
      const expected = Buffer.from(webhookToken);
      return received.length === expected.length && timingSafeEqual(received, expected);
    },
    parseStatusEvent() {
      throw new Error('Exotel status-event mapping is not verified in this build.');
    },
  };
}
