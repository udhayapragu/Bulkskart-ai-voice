import type { VoiceProvider } from './types.js';

// Test double. "Audio" is the UTF-8 bytes of the text, so the same transcribe path that
// real audio would take is exercised without any speech service.
export function createMockVoiceProvider(): VoiceProvider {
  return {
    name: 'mock',
    liveReady: false,
    async synthesize({ text, language }) {
      return { audio: Buffer.from(`${language}:${text}`, 'utf8'), mimeType: 'text/plain; x-mock=tts' };
    },
    async transcribe(audio) {
      const text = audio.toString('utf8');
      return { text, language: null };
    },
  };
}
