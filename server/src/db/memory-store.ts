import { randomUUID } from 'node:crypto';
import { type FindOptions, primaryKeyOf, type Row, type Store, TABLES, type TableName } from './store.js';

// In-memory implementation used for mock mode and tests. It is not durable.
// Timestamps come from the injected clock so tests can control time consistently.
export function createMemoryStore(clock: () => Date = () => new Date()): Store {
  const tables = new Map<TableName, Map<string, Row>>(TABLES.map((name) => [name, new Map()]));
  let auditSequence = 0;

  const table = (name: TableName) => tables.get(name)!;

  const matches = (row: Row, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  return {
    driver: 'memory',

    async get(name, id) {
      const row = table(name).get(id);
      return row ? structuredClone(row) : undefined;
    },

    async find(name, options: FindOptions = {}) {
      let rows = [...table(name).values()].filter((row) => matches(row, options.where));
      if (options.orderBy) {
        const { column, direction } = options.orderBy;
        const sign = direction === 'asc' ? 1 : -1;
        rows.sort((a, b) => {
          const left = String(a[column] ?? '');
          const right = String(b[column] ?? '');
          return left < right ? -sign : left > right ? sign : 0;
        });
      }
      if (options.limit !== undefined) rows = rows.slice(0, options.limit);
      return rows.map((row) => structuredClone(row));
    },

    async insert(name, values) {
      const now = clock().toISOString();
      const key = primaryKeyOf(name);
      const id = name === 'audit_logs'
        ? String(++auditSequence)
        : String(values[key] ?? randomUUID());
      const row: Row = {
        [key]: id,
        created_at: now,
        ...(name === 'suppliers' || name === 'campaigns' || name === 'knowledge_base' || name === 'agent_settings'
          ? { updated_at: now }
          : {}),
        ...values,
        [key]: id,
      };
      table(name).set(id, row);
      return structuredClone(row) ;
    },

    async update(name, id, patch) {
      const current = table(name).get(id);
      if (!current) return undefined;
      const updated: Row = { ...current, ...patch };
      if ('updated_at' in current) updated.updated_at = clock().toISOString();
      table(name).set(id, updated);
      return structuredClone(updated) ;
    },

    async remove(name, id) {
      return table(name).delete(id);
    },

    async close() {
      for (const rows of tables.values()) rows.clear();
    },
  };
}
