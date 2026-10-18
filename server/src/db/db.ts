import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATIONS } from './migrations';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '../..');
export const DEFAULT_DB_PATH = path.join(SERVER_ROOT, 'data', 'teammate.db');

export type DB = Database.Database;

/** Opens (or creates) the SQLite file and applies pending migrations. Returns names applied this time. */
export function openDb(file: string = process.env.TEAMMATE_DB || DEFAULT_DB_PATH): { db: DB; applied: string[] } {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT name FROM _migrations').pluck().all() as string[]);
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.name)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(m.name, new Date().toISOString());
    })();
    applied.push(m.name);
  }
  return { db, applied };
}
