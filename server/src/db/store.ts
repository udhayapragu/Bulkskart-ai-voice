// Narrow data-access interface shared by the Postgres store (production) and the
// in-memory store (mock mode and automated tests). Domain code only uses these
// methods, so both backends behave the same way.

export const TABLES = [
  'suppliers',
  'consent_records',
  'campaigns',
  'campaign_contacts',
  'calls',
  'call_summaries',
  'follow_up_tasks',
  'agent_settings',
  'knowledge_base',
  'audit_logs',
] as const;

export type TableName = (typeof TABLES)[number];

export type Row = Record<string, unknown>;

export interface FindOptions {
  /** Equality filters, e.g. { campaign_id: 'x', status: 'pending' }. */
  where?: Record<string, unknown>;
  orderBy?: { column: string; direction: 'asc' | 'desc' };
  limit?: number;
}

export interface Store {
  readonly driver: 'postgres' | 'memory';
  get(table: TableName, id: string): Promise<Row | undefined>;
  find(table: TableName, options?: FindOptions): Promise<Row[]>;
  insert(table: TableName, row: Row): Promise<Row>;
  update(table: TableName, id: string, patch: Row): Promise<Row | undefined>;
  remove(table: TableName, id: string): Promise<boolean>;
  close(): Promise<void>;
}

/** Columns stored as jsonb. Their values are serialised as JSON, not as PG arrays. */
export const JSON_COLUMNS = new Set(['transcript', 'agent_state', 'value', 'details']);

export function isSafeIdentifier(name: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(name);
}

/** Primary-key column per table. Every table uses `id` except agent_settings. */
export function primaryKeyOf(table: TableName): string {
  return table === 'agent_settings' ? 'key' : 'id';
}
