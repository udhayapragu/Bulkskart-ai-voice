import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services/context.js';
import { audit } from '../services/context.js';
import { verifyPassword } from '../auth/password.js';
import { createSessionToken } from '../auth/session.js';
import { SESSION_COOKIE, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, parseBody } from './http.js';

const LOGIN_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(256),
});

export function createAuthRouter(services: Services): Router {
  const router = Router();
  const failures = new Map<string, { count: number; resetAt: number }>();
  const { config } = services;

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD_HASH || !config.SESSION_SECRET) {
        res.status(503).json({ error: 'Admin login is not configured on this server' });
        return;
      }
      const ip = req.ip ?? 'unknown';
      const now = Date.now();
      const record = failures.get(ip);
      if (record && record.resetAt > now && record.count >= MAX_FAILURES) {
        res.status(429).json({ error: 'Too many failed sign-in attempts. Try again later.' });
        return;
      }

      const { email, password } = parseBody(loginSchema, req.body);
      const emailMatches = email === config.ADMIN_EMAIL.toLowerCase();
      // Verify the hash even when the email is wrong, so timing does not reveal which part failed.
      const passwordMatches = await verifyPassword(password, config.ADMIN_PASSWORD_HASH);
      if (!emailMatches || !passwordMatches) {
        const current = record && record.resetAt > now ? record : { count: 0, resetAt: now + LOGIN_WINDOW_MS };
        failures.set(ip, { count: current.count + 1, resetAt: current.resetAt });
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      failures.delete(ip);
      const ttlSeconds = Math.round(config.SESSION_TTL_HOURS * 3600);
      const token = createSessionToken(email, config.SESSION_SECRET, ttlSeconds, now);
      res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.NODE_ENV === 'production',
        maxAge: ttlSeconds * 1000,
        path: '/',
      });
      await audit(services, email, 'auth.login', 'admin', null, {});
      res.json({ email });
    }),
  );

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/me', requireAdmin(config), (req, res) => {
    res.json({ email: req.actor });
  });

  return router;
}
