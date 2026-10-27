import type { LanguageCode } from '../domain/languages.js';
import type { Services } from './context.js';

export interface CallingSettings {
  min_hours_between_calls: number;
  require_consent: boolean;
  default_from_number: string | null;
}

export interface UsageRates {
  // Enter the per-minute rates from your provider invoices. Zero means "not configured".
  telephony_per_minute: number;
  voice_ai_per_minute: number;
  currency: string;
}

export interface AgentSettingsView {
  calling: CallingSettings;
  languages: { enabled: LanguageCode[]; default: LanguageCode };
  voice: { persona_name: string; voice_id: string | null; speaking_rate: number; provider: 'mock' | 'sarvam' };
  company: { name: string; website_url: string };
  usage_rates: UsageRates;
}

export const DEFAULT_SETTINGS: AgentSettingsView = {
  calling: { min_hours_between_calls: 24, require_consent: true, default_from_number: null },
  languages: { enabled: ['en', 'hi', 'ta', 'te', 'ml'], default: 'en' },
  voice: { persona_name: 'Bulkskart Assistant', voice_id: null, speaking_rate: 1, provider: 'mock' },
  company: { name: 'Bulkskart', website_url: 'https://bulkskart.com' },
  usage_rates: { telephony_per_minute: 0, voice_ai_per_minute: 0, currency: 'INR' },
};

const SECTIONS = Object.keys(DEFAULT_SETTINGS) as Array<keyof AgentSettingsView>;

export async function getSettings(services: Services): Promise<AgentSettingsView> {
  const rows = await services.store.find('agent_settings');
  const stored = new Map(rows.map((row) => [row.key as string, row.value as Record<string, unknown>]));
  const merged = Object.fromEntries(
    SECTIONS.map((section) => [section, { ...DEFAULT_SETTINGS[section], ...(stored.get(section) ?? {}) }]),
  ) as unknown as AgentSettingsView;
  return {
    ...merged,
    company: { ...merged.company, website_url: services.config.WEBSITE_URL },
    voice: { ...merged.voice, provider: services.config.VOICE_PROVIDER },
  };
}

export type EditableSection = 'calling' | 'languages' | 'usage_rates';

// The route validates the value's shape per section before calling this function.
export async function updateSettingsSection(
  services: Services,
  actor: string,
  section: EditableSection,
  value: Record<string, unknown>,
): Promise<AgentSettingsView> {
  const current = await getSettings(services);
  const next = { ...current[section], ...value };
  const existing = await services.store.get('agent_settings', section);
  if (existing) {
    await services.store.update('agent_settings', section, { value: next, updated_by: actor });
  } else {
    await services.store.insert('agent_settings', { key: section, value: next, updated_by: actor });
  }
  return getSettings(services);
}
