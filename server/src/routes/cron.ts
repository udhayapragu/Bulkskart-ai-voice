import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { Services } from '../services/context.js';
import { runSchedulerTick } from '../services/campaigns.js';
import { asyncHandler } from './http.js';

// Serverless hosts cannot run the background timer, so an external scheduler calls this
// endpoint with "Authorization: Bearer <CRON_SECRET>". It is mounted before the admin
// session check because it is not used by the dashboard.
export function createCronRouter(services: Services): Router {
  const router = Router();
  const expected = services.config.CRON_SECRET;

  const authorised = (header: string | undefined) => {
    if (!expected || !header?.startsWith('Bearer ')) return false;
    // Hash both sides first so the comparison is always the same length.
    const a = createHash('sha256').update(header.slice(7)).digest();
    const b = createHash('sha256').update(expected).digest();
    return timingSafeEqual(a, b);
  };

  router.all(
    '/cron/scheduler',
    asyncHandler(async (req, res) => {
      if (!authorised(req.headers.authorization)) {
        res.status(401).json({ error: 'Unauthorised' });
        return;
      }
      res.json(await runSchedulerTick(services));
    }),
  );
  return router;
}
