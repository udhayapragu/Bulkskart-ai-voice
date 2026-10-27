import { loadConfig, type AppConfig } from '../src/config/index.js';
import { createMemoryStore } from '../src/db/memory-store.js';
import { createProviders } from '../src/providers/index.js';
import type { Services } from '../src/services/context.js';
import { hashPassword } from '../src/auth/password.js';

export const TEST_SECRET = 'test-session-secret-that-is-long-enough-32+';
export const TEST_WEBHOOK_SECRET = 'webhook-secret-for-tests-16+';
export const TEST_ADMIN_EMAIL = 'admin@bulkskart.test';
export const TEST_ADMIN_PASSWORD = 'correct-horse-battery';

// 11:00 IST on 27 Oct 2026, inside the default 09:00-19:00 calling window.
export const IN_WINDOW = new Date('2026-10-27T05:30:00Z');
// 23:00 IST, outside the calling window.
export const OUT_OF_WINDOW = new Date('2026-10-27T17:30:00Z');

export async function testConfig(overrides: Record<string, string> = {}): Promise<AppConfig> {
  return loadConfig({
    NODE_ENV: 'test',
    STORE_DRIVER: 'memory',
    SESSION_SECRET: TEST_SECRET,
    ADMIN_EMAIL: TEST_ADMIN_EMAIL,
    ADMIN_PASSWORD_HASH: await hashPassword(TEST_ADMIN_PASSWORD),
    TELEPHONY_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
    ...overrides,
  });
}

export async function createTestServices(
  options: { now?: Date; config?: Record<string, string> } = {},
): Promise<Services & { setNow: (d: Date) => void }> {
  const config = await testConfig(options.config);
  const { voice, telephony } = createProviders(config);
  let current = options.now ?? IN_WINDOW;
  const services = {
    store: createMemoryStore(() => new Date(current.getTime())),
    config,
    voice,
    telephony,
    now: () => new Date(current.getTime()),
    setNow: (d: Date) => {
      current = d;
    },
  };
  return services;
}
