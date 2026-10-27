import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services/context.js';
import { applyStatusEvent, routeInboundCall } from '../services/calls.js';
import { asyncHandler } from './http.js';

const inboundSchema = z.object({
  from: z.string().min(5).max(30),
  to: z.string().min(5).max(30),
  provider_call_id: z.string().min(1).max(200),
});

/**
 * Telephony webhooks. Each request is authenticated before its body is trusted. The
 * raw body is kept as a string so the HMAC is computed over the exact bytes received.
 */
export function createWebhookRouter(services: Services): Router {
  const router = Router();
  const toWebhookRequest = (req: { body?: unknown; rawBody?: string; headers: Record<string, string | string[] | undefined>; query: Record<string, unknown> }) => ({
    rawBody: req.rawBody ?? '',
    headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
    query: Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, typeof v === 'string' ? v : undefined])),
  });

  router.post(
    '/telephony/status',
    asyncHandler(async (req, res) => {
      const request = toWebhookRequest(req);
      if (!services.telephony.verifyWebhook(request)) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }
      const event = services.telephony.parseStatusEvent(request);
      if (!event) {
        res.status(400).json({ error: 'Unrecognised status event' });
        return;
      }
      res.json(await applyStatusEvent(services, event));
    }),
  );

  router.post(
    '/telephony/inbound',
    asyncHandler(async (req, res) => {
      if (!services.telephony.verifyWebhook(toWebhookRequest(req))) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }
      const parsed = inboundSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({ error: 'Invalid inbound call payload' });
        return;
      }
      const routed = await routeInboundCall(services, {
        from: parsed.data.from,
        to: parsed.data.to,
        providerCallId: parsed.data.provider_call_id,
      });
      res.json({ action: routed.action, call_id: routed.callId, language: routed.language });
    }),
  );

  return router;
}
