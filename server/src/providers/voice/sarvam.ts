import { ProviderNotReadyError, type VoiceProvider } from './types.js';

// Sarvam AI adapter. Deliberately fail-closed: no request is sent until the endpoints,
// payloads and streaming behaviour are verified against Sarvam's official API docs with
// a real SARVAM_API_KEY. Until then every call throws, so nothing can claim to speak.
export function createSarvamVoiceProvider(apiKey: string | undefined): VoiceProvider {
  const notReady = (): never => {
    throw new ProviderNotReadyError(
      'sarvam',
      apiKey
        ? 'adapter not yet verified against the official Sarvam API in this build'
        : 'SARVAM_API_KEY is not set',
    );
  };
  return {
    name: 'sarvam',
    liveReady: false,
    synthesize: async () => notReady(),
    transcribe: async () => notReady(),
  };
}
