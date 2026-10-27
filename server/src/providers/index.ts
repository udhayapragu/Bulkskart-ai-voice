import type { AppConfig } from '../config/index.js';
import { createMockVoiceProvider } from './voice/mock.js';
import { createSarvamVoiceProvider } from './voice/sarvam.js';
import type { VoiceProvider } from './voice/types.js';
import { createMockTelephonyProvider } from './telephony/mock.js';
import { createExotelTelephonyProvider } from './telephony/exotel.js';
import type { TelephonyProvider } from './telephony/types.js';

export function createProviders(config: AppConfig): { voice: VoiceProvider; telephony: TelephonyProvider } {
  const voice = config.VOICE_PROVIDER === 'sarvam' ? createSarvamVoiceProvider(config.SARVAM_API_KEY) : createMockVoiceProvider();
  const telephony =
    config.TELEPHONY_PROVIDER === 'exotel'
      ? createExotelTelephonyProvider(config.TELEPHONY_WEBHOOK_SECRET)
      : createMockTelephonyProvider(config.TELEPHONY_WEBHOOK_SECRET);
  return { voice, telephony };
}
