import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { loadConfig } from './config/index.js';
import { createStore } from './db/index.js';
import { createApp } from './app.js';
import { createProviders } from './providers/index.js';
import type { Services } from './services/context.js';

// Vercel entry point. Unlike index.ts, this does not listen or start a timer: the platform
// runs one function per request, so the app is built on the first request and reused.
let appPromise: Promise<Express> | undefined;

function buildApp(): Promise<Express> {
  appPromise ??= (async () => {
    const config = loadConfig();
    const store = await createStore(config);
    const { voice, telephony } = createProviders(config);
    const services: Services = { store, config, voice, telephony, now: () => new Date() };
    return createApp(services);
  })().catch((error) => {
    appPromise = undefined; // allow a retry once the environment is fixed
    throw error;
  });
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await buildApp();
    app(req, res);
  } catch (error) {
    // Log the reason on the server only. The response names no secrets.
    console.error('[vercel] startup failed:', (error as Error).message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server is not configured correctly. Check the environment variables in the Vercel project.' }));
  }
}
