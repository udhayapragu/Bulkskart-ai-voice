import type { AppConfig } from '../config/index.js';
import { createMemoryStore } from './memory-store.js';
import { createPgStore } from './pg-store.js';
import type { Store } from './store.js';

export async function createStore(config: AppConfig): Promise<Store> {
  if (config.STORE_DRIVER === 'postgres') {
    if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required for the postgres store');
    return createPgStore(config.DATABASE_URL);
  }
  return createMemoryStore();
}
