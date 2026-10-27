import { loadConfig } from './config/index.js';
import { createStore } from './db/index.js';
import { createApp } from './app.js';
import { createProviders } from './providers/index.js';
import { runSchedulerTick } from './services/campaigns.js';
import type { Services } from './services/context.js';

const config = loadConfig();
const store = await createStore(config);
const { voice, telephony } = createProviders(config);
const services: Services = { store, config, voice, telephony, now: () => new Date() };

const app = createApp(services);
const server = app.listen(config.PORT, () => {
  console.log(`Bulkskart voice agent API listening on :${config.PORT} (store=${store.driver}, telephony=${telephony.name}, voice=${voice.name})`);
});

let schedulerTimer: NodeJS.Timeout | undefined;
if (config.SCHEDULER_ENABLED) {
  schedulerTimer = setInterval(() => {
    runSchedulerTick(services).catch((error) => console.error('[scheduler] tick failed:', error));
  }, config.SCHEDULER_INTERVAL_SECONDS * 1000);
}

const shutdown = async () => {
  if (schedulerTimer) clearInterval(schedulerTimer);
  server.close();
  await store.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
