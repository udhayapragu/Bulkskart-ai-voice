import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Services } from './services/context.js';
import { createAuthRouter } from './routes/auth.js';
import { createApiRouter } from './routes/api.js';
import { createWebhookRouter } from './routes/webhooks.js';
import { errorHandler } from './routes/http.js';

declare module 'http' {
  interface IncomingMessage {
    rawBody?: string;
  }
}

export function createApp(services: Services) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Webhooks need the exact request bytes for signature verification.
  app.use(
    '/webhooks',
    express.json({
      limit: '256kb',
      verify: (req, _res, buffer) => {
        req.rawBody = buffer.toString('utf8');
      },
    }),
    createWebhookRouter(services),
  );

  app.use('/api', cookieParser(), express.json({ limit: '256kb' }));
  app.use('/api/auth', createAuthRouter(services));
  app.use('/api', createApiRouter(services));

  if (services.config.WEB_DIST_DIR) {
    // Single-origin deployment: the built dashboard is served by the API process.
    const dist = path.resolve(services.config.WEB_DIST_DIR);
    app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }));
    app.get(/^(?!\/(api|webhooks|health)\b).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
