export type LanguageCode = 'en' | 'hi' | 'ta' | 'te' | 'ml';
export type LeadStatus = 'new' | 'interested' | 'not_interested' | 'callback_requested' | 'registered';

export interface Supplier {
  id: string;
  phone_e164: string;
  company_name: string | null;
  contact_name: string | null;
  city: string | null;
  state: string | null;
  products: string[];
  preferred_language: LanguageCode | null;
  lead_status: LeadStatus;
  do_not_call: boolean;
  contact_source: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  language: LanguageCode;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'archived';
  mode: 'mock' | 'live';
  max_attempts: number;
  retry_delay_minutes: number;
  calling_window_start: string;
  calling_window_end: string;
  timezone: string;
  concurrency: number;
  recording_enabled: boolean;
  launched_by: string | null;
  launched_at: string | null;
  created_at: string;
}

export interface CampaignStats {
  contacts: number;
  by_contact_status: Record<string, number>;
  calls: number;
  by_outcome: Record<string, number>;
}

export interface TranscriptLine {
  speaker: 'agent' | 'supplier';
  text: string;
  at: string;
}

export interface Call {
  id: string;
  campaign_id: string | null;
  supplier_id: string | null;
  direction: 'outbound' | 'inbound';
  mode: 'mock' | 'live';
  provider: string;
  to_number: string | null;
  language: LanguageCode | null;
  status: string;
  outcome: LeadStatus | null;
  attempt_no: number;
  transcript: TranscriptLine[];
  duration_seconds: number | null;
  recording_permitted: boolean;
  error_message: string | null;
  created_at: string;
  ended_at: string | null;
}

export interface CallSummary {
  summary: string;
  recommended_action: string;
  lead_status: LeadStatus;
  language: LanguageCode | null;
}

export interface FollowUp {
  id: string;
  supplier_id: string;
  call_id: string | null;
  task_type: string;
  due_at: string | null;
  status: 'open' | 'done' | 'canceled';
  notes: string | null;
  created_at: string;
}

export interface KnowledgeEntry {
  id: string;
  language: LanguageCode;
  topic: string;
  question: string;
  answer: string;
  keywords: string[];
  status: 'draft' | 'approved' | 'retired';
  approved_by: string | null;
  approved_at: string | null;
}

export interface Scenario {
  id: string;
  description: string;
  language: LanguageCode;
}

export interface AgentSettings {
  calling: { min_hours_between_calls: number; require_consent: boolean; default_from_number: string | null };
  languages: { enabled: LanguageCode[]; default: LanguageCode };
  voice: { persona_name: string; voice_id: string | null; speaking_rate: number; provider: 'mock' | 'sarvam' };
  company: { name: string; website_url: string };
  usage_rates: { telephony_per_minute: number; voice_ai_per_minute: number; currency: string };
}

export interface Overview {
  suppliers: number;
  do_not_call: number;
  leads: Record<LeadStatus, number>;
  campaigns: Record<string, number>;
  calls: { total: number; today: number; active: number; simulated: number };
  outcomes: Record<LeadStatus, number>;
  open_follow_ups: number;
}

export interface Usage {
  calls_total: number;
  calls_by_mode: { live: number; mock: number };
  minutes: { live: number; mock_simulated: number };
  estimated_cost: { amount: number; currency: string; note: string };
}

export interface SystemHealth {
  store: 'postgres' | 'memory';
  telephony: { provider: string; mode: 'mock' | 'live'; webhook_secret_configured: boolean };
  voice: { provider: string; live_ready: boolean };
  live_calling_enabled: boolean;
  scheduler_enabled: boolean;
  website_url: string;
  checked_at: string;
}
