import type { LanguageCode } from '../../domain/languages.js';

export type ProviderCallStatus = 'ringing' | 'in_progress' | 'completed' | 'no_answer' | 'busy' | 'failed' | 'canceled';

export interface PlaceCallRequest {
  to: string;
  from: string;
  callId: string;
  language: LanguageCode;
}

export interface StatusEvent {
  providerCallId: string;
  status: ProviderCallStatus;
  durationSeconds?: number;
}

export interface WebhookRequest {
  rawBody: string;
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
}

/**
 * Telephony adapter. placeCall resolves only when the provider has accepted the call,
 * and that acceptance is the only thing that moves a call to "dialing".
 */
export interface TelephonyProvider {
  readonly name: 'mock' | 'exotel';
  /** 'mock' never touches a phone network. 'live' places real calls. */
  readonly mode: 'mock' | 'live';
  placeCall(request: PlaceCallRequest): Promise<{ providerCallId: string }>;
  verifyWebhook(request: WebhookRequest): boolean;
  parseStatusEvent(request: WebhookRequest): StatusEvent | null;
}
