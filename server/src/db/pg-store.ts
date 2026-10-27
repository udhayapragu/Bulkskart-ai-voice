import pg from 'pg';
import { isSafeIdentifier, JSON_COLUMNS, primaryKeyOf, type FindOptions, type Row, type Store } from './store.js';

// Postgres implementation of Store. Identifiers come only from the TableName union
// and are re-checked here, so they are never built from user input. Values are always
// bound as parameters.
export function createPgStore(connectionString: string): Store {
  const pool = new pg.Pool({ connectionString, max: 10 });

  const quote = (identifier: string) => {
    if (!isSafeIdentifier(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
    return `"${identifier}"`;
  };

  const encode = (column: string, value: unknown) => {
    if (JSON_COLUMNS.has(column) && value !== null && value !== undefined) return JSON.stringify(value);
    return value;
  };

  const decode = (row: Row): Row => {
    const out: Row = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = value instanceof Date ? value.toISOString() : value;
    }
    return out;
  };

  return {
    driver: 'postgres',

    async get(table, id) {
      const key = primaryKeyOf(table);
      const { rows } = await pool.query(`select * from ${quote(table)} where ${quote(key)} = $1`, [id]);
      return rows[0] ? (decode(rows[0]) ) : undefined;
    },

    async find(table, options: FindOptions = {}) {
      const params: unknown[] = [];
      const clauses = Object.entries(options.where ?? {}).map(([column, value]) => {
        if (value === null) return `${quote(column)} is null`;
        params.push(encode(column, value));
        return `${quote(column)} = $${params.length}`;
      });
      let sql = `select * from ${quote(table)}`;
      if (clauses.length) sql += ` where ${clauses.join(' and ')}`;
      if (options.orderBy) {
        const direction = options.orderBy.direction === 'asc' ? 'asc' : 'desc';
        sql += ` order by ${quote(options.orderBy.column)} ${direction}`;
      }
      if (options.limit !== undefined) {
        params.push(Math.max(1, Math.floor(options.limit)));
        sql += ` limit $${params.length}`;
      }
      const { rows } = await pool.query(sql, params);
      return rows.map(decode) ;
    },

    async insert(table, values) {
      const columns = Object.keys(values);
      const params = columns.map((column) => encode(column, values[column]));
      const placeholders = columns.map((_, index) => `$${index + 1}`);
      const sql = columns.length
        ? `insert into ${quote(table)} (${columns.map(quote).join(', ')}) values (${placeholders.join(', ')}) returning *`
        : `insert into ${quote(table)} default values returning *`;
      const { rows } = await pool.query(sql, params);
      return decode(rows[0]) ;
    },

    async update(table, id, patch) {
      const key = primaryKeyOf(table);
      const columns = Object.keys(patch);
      if (!columns.length) return this.get(table, id);
      const params = columns.map((column) => encode(column, patch[column]));
      params.push(id);
      const assignments = columns.map((column, index) => `${quote(column)} = $${index + 1}`);
      const sql = `update ${quote(table)} set ${assignments.join(', ')} where ${quote(key)} = $${params.length} returning *`;
      const { rows } = await pool.query(sql, params);
      return rows[0] ? (decode(rows[0]) ) : undefined;
    },

    async remove(table, id) {
      const key = primaryKeyOf(table);
      const result = await pool.query(`delete from ${quote(table)} where ${quote(key)} = $1`, [id]);
      return (result.rowCount ?? 0) > 0;
    },

    async close() {
      await pool.end();
    },
  };
}
