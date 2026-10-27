import { loadConfig } from '../config/index.js';
import { createStore } from '../db/index.js';
import { createProviders } from '../providers/index.js';
import type { Services } from '../services/context.js';
import { createSupplier } from '../services/suppliers.js';
import { createKnowledgeEntry, setKnowledgeStatus } from '../services/knowledge.js';
import { createCampaign, enrollSuppliers } from '../services/campaigns.js';

// Seeds demo data for local testing. Only the facts stated in the project brief are
// approved: Bulkskart is a B2B bulk trading marketplace, and its website is bulkskart.com.
// Fees, registration, financing and customer counts are NOT invented; they are drafts
// that Bulkskart must review and approve before the agent may speak them.
const config = loadConfig();
const store = await createStore(config);
const { voice, telephony } = createProviders(config);
const services: Services = { store, config, voice, telephony, now: () => new Date() };
const actor = 'seed:demo';

const about = await createKnowledgeEntry(services, actor, {
  language: 'en',
  topic: 'about',
  question: 'What is Bulkskart?',
  answer: 'Bulkskart is a B2B bulk trading marketplace where manufacturers and suppliers can reach bulk buyers.',
  keywords: ['bulkskart', 'b2b', 'what is bulkskart'],
});
await setKnowledgeStatus(services, actor, String(about.id), 'approved');
await createKnowledgeEntry(services, actor, {
  language: 'en',
  topic: 'fees',
  question: 'What are the registration fees?',
  answer: '[DRAFT - Bulkskart to confirm the fee before approval]',
  keywords: ['fee', 'fees', 'price', 'charges'],
});

const suppliers = [
  { phone: '9800011111', company_name: 'Sri Lakshmi Textiles', products: ['cotton fabric'], preferred_language: 'ta' as const },
  { phone: '9800022222', company_name: 'Ganesh Spices Co', products: ['turmeric', 'chilli'], preferred_language: 'te' as const },
  { phone: '9800033333', company_name: 'Kerala Coir Works', products: ['coir mats'], preferred_language: 'ml' as const },
  { phone: '9800044444', company_name: 'Rajasthan Handicrafts', products: ['brass items'], preferred_language: 'hi' as const },
  { phone: '9800055555', company_name: 'Pune Packaging Ltd', products: ['cartons'], preferred_language: 'en' as const },
];
const created: string[] = [];
for (const s of suppliers) {
  const result = await createSupplier(services, actor, {
    ...s,
    city: 'Demo City',
    contact_source: 'demo_seed_list',
    consent: { status: 'granted', basis: 'b2b_outreach_approved', evidence: 'Demo data only' },
  });
  created.push(result.supplier.id);
}

const campaign = await createCampaign(services, actor, { name: 'Demo Outreach (simulated)', language: 'en', mode: 'mock' });
await enrollSuppliers(services, actor, campaign.id, created);

console.log(`Seeded: 2 knowledge entries (1 approved), ${suppliers.length} suppliers, campaign "${campaign.name}" (draft, not launched).`);
await store.close();
