import type { LanguageCode } from './languages.js';
import type { LeadOutcome } from '../agent/engine.js';

export type LeadStatus = LeadOutcome;

export interface Supplier {
  id: string;
  phone_e164: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  products: string[];
  preferred_language: LanguageCode | null;
  lead_status: LeadStatus;
  do_not_call: boolean;
  do_not_call_at: string | null;
  contact_source: string;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  language: LanguageCode;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'archived';
  mode: 'mock' | 'live';
  from_number: string | null;
  max_attempts: number;
  retry_delay_minutes: number;
  calling_window_start: string;
  calling_window_end: string;
  timezone: string;
  concurrency: number;
  recording_enabled: boolean;
  launched_by: string | null;
  launched_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignContact {
  id: string;
  campaign_id: string;
  supplier_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'exhausted' | 'suppressed' | 'skipped';
  attempts: number;
  next_attempt_at: string;
  last_outcome: string | null;
  created_at: string;
}

export type CallStatus =
  | 'queued' | 'dialing' | 'ringing' | 'in_progress' | 'completed'
  | 'no_answer' | 'busy' | 'failed' | 'canceled' | 'handoff';

export const ACTIVE_CALL_STATUSES: CallStatus[] = ['queued', 'dialing', 'ringing', 'in_progress'];
export const TERMINAL_CALL_STATUSES: CallStatus[] = ['completed', 'no_answer', 'busy', 'failed', 'canceled', 'handoff'];

export interface Call {
  id: string;
  campaign_id: string | null;
  supplier_id: string | null;
  direction: 'outbound' | 'inbound';
  mode: 'mock' | 'live';
  provider: string;
  provider_call_id: string | null;
  from_number: string | null;
  to_number: string | null;
  language: LanguageCode | null;
  status: CallStatus;
  outcome: LeadStatus | null;
  attempt_no: number;
  transcript: TranscriptLine[];
  agent_state: Record<string, unknown>;
  duration_seconds: number | null;
  recording_url: string | null;
  recording_permitted: boolean;
  error_message: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface TranscriptLine {
  speaker: 'agent' | 'supplier';
  text: string;
  at: string;
}

export interface FollowUpTask {
  id: string;
  supplier_id: string;
  call_id: string | null;
  task_type: 'callback' | 'send_website_link' | 'human_handoff' | 'registration_help' | 'review';
  due_at: string | null;
  status: 'open' | 'done' | 'canceled';
  notes: string | null;
  created_at: string;
}
