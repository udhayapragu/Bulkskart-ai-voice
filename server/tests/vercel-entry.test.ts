import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTestServices } from './helpers.js';

describe('scheduler cron endpoint', () => {
  it('rejects requests without the CRON_SECRET bearer token', async () => {
    const services = await createTestServices({ config: { CRON_SECRET: 'cron-secret-value-16plus' } });
    const app = createApp(services);
    expect((await request(app).get('/api/cron/scheduler')).status).toBe(401);
    expect((await request(app).get('/api/cron/scheduler').set('Authorization', 'Bearer wrong-value-here-x')).status).toBe(401);
  });

  it('runs a scheduler pass with the correct token', async () => {
    const services = await createTestServices({ config: { CRON_SECRET: 'cron-secret-value-16plus' } });
    const app = createApp(services);
    const res = await request(app).get('/api/cron/scheduler').set('Authorization', 'Bearer cron-secret-value-16plus');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('dialed');
  });

  it('is disabled when CRON_SECRET is not configured', async () => {
    const services = await createTestServices();
    const app = createApp(services);
    expect((await request(app).get('/api/cron/scheduler').set('Authorization', 'Bearer anything-at-all-here')).status).toBe(401);
  });
});

describe('Vercel entry point', () => {
  it('returns a JSON 500 without leaking details when configuration is missing', async () => {
    vi.resetModules();
    const saved = { ...process.env };
    process.env = { NODE_ENV: 'test', SESSION_SECRET: 'short' }; // invalid on purpose
    try {
      const { default: handler } = await import('../src/vercel.js');
      const app = (await import('express')).default();
      app.use((req, res) => void handler(req, res));
      const res = await request(app).get('/api/overview');
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/not configured correctly/);
      expect(JSON.stringify(res.body)).not.toMatch(/short|SESSION_SECRET/);
    } finally {
      process.env = saved;
    }
  });
});
