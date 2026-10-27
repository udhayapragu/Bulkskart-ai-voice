import type { LanguageCode } from '../../domain/languages.js';

export interface SynthesisRequest {
  text: string;
  language: LanguageCode;
}

export interface SynthesisResult {
  audio: Buffer;
  mimeType: string;
}

export interface TranscriptionResult {
  text: string;
  language: LanguageCode | null;
}

/**
 * Speech-to-text and text-to-speech. Implementations: mock (tests and simulator) and
 * Sarvam AI (fails closed until verified against the official API).
 */
export interface VoiceProvider {
  readonly name: 'mock' | 'sarvam';
  /** True only when the provider has been verified against its live API. */
  readonly liveReady: boolean;
  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
  transcribe(audio: Buffer, language?: LanguageCode): Promise<TranscriptionResult>;
}

export class ProviderNotReadyError extends Error {
  constructor(provider: string, detail: string) {
    super(`${provider} is not ready: ${detail}`);
    this.name = 'ProviderNotReadyError';
  }
}
