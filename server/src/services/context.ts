import type { AppConfig } from '../config/index.js';
import type { Store, Row } from '../db/store.js';
import type { VoiceProvider } from '../providers/voice/types.js';
import type { TelephonyProvider } from '../providers/telephony/types.js';

export interface Services {
  store: Store;
  config: AppConfig;
  voice: VoiceProvider;
  telephony: TelephonyProvider;
  now: () => Date;
}

/** Every mutating action leaves a row in audit_logs. */
export async function audit(
  services: Services,
  actor: string,
  action: string,
  entityType: string | null,
  entityId: string | null,
  details: Row = {},
): Promise<void> {
  await services.store.insert('audit_logs', {
    actor,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  });
}

export class ServiceError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
