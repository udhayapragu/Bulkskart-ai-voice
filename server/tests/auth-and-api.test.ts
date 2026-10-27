import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTestServices, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_WEBHOOK_SECRET } from './helpers.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { createSessionToken, verifySessionToken } from '../src/auth/session.js';
import { signPayload, MOCK_SIGNATURE_HEADER } from '../src/providers/telephony/mock.js';

async function signedIn(app: ReturnType<typeof createApp>) {
  const login = await request(app).post('/api/auth/login').send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });
  expect(login.status).toBe(200);
  const cookie = login.headers['set-cookie'] as unknown as string[];
  return cookie.map((c) => c.split(';')[0]).join('; ');
}

describe('password hashing and session tokens', () => {
  it('verifies the right password only', async () => {
    const hash = await hashPassword('a-long-password-here');
    expect(await verifyPassword('a-long-password-here', hash)).toBe(true);
    expect(await verifyPassword('wrong-password-here', hash)).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });

  it('rejects a tampered or expired session token', () => {
    const secret = 'token-secret-that-is-at-least-32-characters';
    const token = createSessionToken('admin@x.test', secret, 60, 1_000_000);
    expect(verifySessionToken(token, secret, 1_000_000)?.sub).toBe('admin@x.test');
    expect(verifySessionToken(token.replace(/.$/, 'A'), secret, 1_000_000)).toBeNull();
    expect(verifySessionToken(token, 'a-different-secret-that-is-long-enough', 1_000_000)).toBeNull();
    expect(verifySessionToken(token, secret, 1_000_000 + 61_000)).toBeNull();
  });
});

describe('admin API authentication', () => {
  it('requires a session for every /api route except login and health', async () => {
    const app = createApp(await createTestServices());
    expect((await request(app).get('/api/overview')).status).toBe(401);
    expect((await request(app).get('/api/suppliers')).status).toBe(401);
    expect((await request(app).get('/api/settings')).status).toBe(401);
    expect((await request(app).get('/health')).status).toBe(200);
  });

  it('rejects a wrong password without revealing whether the email exists', async () => {
    const app = createApp(await createTestServices());
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: TEST_ADMIN_EMAIL, password: 'nope-nope-nope' });
    const wrongEmail = await request(app).post('/api/auth/login').send({ email: 'other@x.test', password: TEST_ADMIN_PASSWORD });
    expect(wrongPassword.status).toBe(401);
    expect(wrongEmail.body).toEqual(wrongPassword.body);
  });

  it('sets an httpOnly, SameSite=Strict session cookie on login and accepts it', async () => {
    const app = createApp(await createTestServices());
    const login = await request(app).post('/api/auth/login').send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });
    const setCookie = String(login.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    const cookie = await signedIn(app);
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.body).toEqual({ email: TEST_ADMIN_EMAIL });
  });

  it('is locked out after repeated failures', async () => {
    const app = createApp(await createTestServices());
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/login').send({ email: TEST_ADMIN_EMAIL, password: 'bad-password-here' });
    }
    const locked = await request(app).post('/api/auth/login').send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });
    expect(locked.status).toBe(429);
  });

  it('refuses login when admin credentials are not configured', async () => {
    const services = await createTestServices();
    const app = createApp({ ...services, config: { ...services.config, ADMIN_EMAIL: undefined, ADMIN_PASSWORD_HASH: undefined } });
    expect((await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' })).status).toBe(503);
  });
});

describe('admin API behaviour', () => {
  it('creates a supplier, rejects an invalid phone, and returns the existing record for a duplicate', async () => {
    const app = createApp(await createTestServices());
    const cookie = await signedIn(app);
    const body = { phone: '9876599999', company_name: 'Test Mills', contact_source: 'trade_fair_list', consent: { status: 'granted', basis: 'b2b' } };
    const created = await request(app).post('/api/suppliers').set('Cookie', cookie).send(body);
    expect(created.status).toBe(201);
    const duplicate = await request(app).post('/api/suppliers').set('Cookie', cookie).send({ ...body, phone: '+91 98765 99999' });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.created).toBe(false);
    const invalid = await request(app).post('/api/suppliers').set('Cookie', cookie).send({ ...body, phone: '123' });
    expect(invalid.status).toBe(422);
  });

  it('rejects a launch without confirmation and returns 422 with the required text', async () => {
    const app = createApp(await createTestServices());
    const cookie = await signedIn(app);
    const campaign = await request(app).post('/api/campaigns').set('Cookie', cookie).send({ name: 'Diwali Push', language: 'ta', mode: 'mock' });
    expect(campaign.status).toBe(201);
    const launch = await request(app).post(`/api/campaigns/${campaign.body.id}/launch`).set('Cookie', cookie).send({ confirmation: 'yes' });
    expect(launch.status).toBe(422);
    expect(launch.body.error).toContain('LAUNCH Diwali Push');
  });

  it('never returns internal error details', async () => {
    const app = createApp(await createTestServices());
    const cookie = await signedIn(app);
    const res = await request(app).get('/api/campaigns/not-a-uuid').set('Cookie', cookie);
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|at .* \(/);
  });

  it('rejects unknown settings sections and unexpected fields', async () => {
    const app = createApp(await createTestServices());
    const cookie = await signedIn(app);
    expect((await request(app).put('/api/settings/voice').set('Cookie', cookie).send({ provider: 'sarvam' })).status).toBe(404);
    expect((await request(app).put('/api/settings/calling').set('Cookie', cookie).send({ hacked: true })).status).toBe(422);
  });

  it('shows simulated calls as simulated in analytics and never claims live minutes', async () => {
    const services = await createTestServices();
    const app = createApp(services);
    const cookie = await signedIn(app);
    const supplier = await request(app).post('/api/suppliers').set('Cookie', cookie).send({ phone: '9876500077', contact_source: 'directory_export', consent: { status: 'granted', basis: 'b2b' } });
    const sim = await request(app).post('/api/calls/simulate').set('Cookie', cookie).send({ supplier_id: supplier.body.supplier.id, scenario_id: 'not-interested-ml' });
    expect(sim.status).toBe(201);
    expect(sim.body.mode).toBe('mock');
    const usage = await request(app).get('/api/analytics/usage').set('Cookie', cookie);
    expect(usage.body.calls_by_mode.mock).toBe(1);
    expect(usage.body.minutes.live).toBe(0);
    expect(usage.body.estimated_cost.note).toMatch(/not configured/);
  });
});

describe('telephony webhooks over HTTP', () => {
  it('rejects a status callback without a valid signature', async () => {
    const app = createApp(await createTestServices());
    const res = await request(app).post('/webhooks/telephony/status').send({ provider_call_id: 'x', status: 'completed' });
    expect(res.status).toBe(401);
  });

  it('accepts a correctly signed status callback over the raw body', async () => {
    const app = createApp(await createTestServices());
    const raw = JSON.stringify({ provider_call_id: 'unknown-call', status: 'completed' });
    const res = await request(app)
      .post('/webhooks/telephony/status')
      .set('Content-Type', 'application/json')
      .set(MOCK_SIGNATURE_HEADER, signPayload(raw, TEST_WEBHOOK_SECRET))
      .send(raw);
    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(false);
  });

  it('rejects an inbound call with a bad signature', async () => {
    const app = createApp(await createTestServices());
    const res = await request(app).post('/webhooks/telephony/inbound').send({ from: '+919876500012', to: '+911', provider_call_id: 'c1' });
    expect(res.status).toBe(401);
  });
});
