import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from '../config/index.js';

// Applies every migrations/*.sql file once, in filename order, inside a transaction each.
export async function runMigrations(connectionString: string, migrationsDir: string): Promise<string[]> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )`);
    const done = new Set(
      (await client.query<{ filename: string }>('select filename from schema_migrations')).rows.map((r) => r.filename),
    );
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (filename) values ($1)', [file]);
        await client.query('commit');
        applied.push(file);
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  const config = loadConfig();
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required to run migrations');
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
  const applied = await runMigrations(config.DATABASE_URL, dir);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database already up to date');
}
