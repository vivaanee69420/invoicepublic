import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export function createDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS referrers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      practice_id TEXT NOT NULL DEFAULT 'default',
      referral_code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL REFERENCES referrers(id),
      prospect_name TEXT NOT NULL,
      prospect_phone TEXT,
      prospect_email TEXT,
      treatment_interest TEXT,
      practice_id TEXT NOT NULL DEFAULT 'default',
      status TEXT NOT NULL DEFAULT 'new',
      lost_reason TEXT,
      treatment_value_pennies INTEGER,
      consented_marketing INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reward_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      practice_id TEXT,
      type TEXT NOT NULL CHECK(type IN ('fixed','percent')),
      value INTEGER NOT NULL,
      cap_pennies INTEGER,
      min_treatment_value_pennies INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referral_id INTEGER REFERENCES referrals(id),
      referrer_id INTEGER NOT NULL REFERENCES referrers(id),
      rule_id INTEGER REFERENCES reward_rules(id),
      amount_pennies INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','paid','void')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL REFERENCES referrers(id),
      platform TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS nudges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL REFERENCES referrers(id),
      channel TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS draws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL UNIQUE,
      referrer_id INTEGER NOT NULL REFERENCES referrers(id),
      prize TEXT NOT NULL DEFAULT 'free_whitening_treatment',
      drawn_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  return db;
}

export function logEvent(db: Db, entity: string, entityId: number | string, type: string, data?: unknown): void {
  const dataJson = data ? JSON.stringify(data) : null;
  db.prepare('INSERT INTO events (entity, entity_id, type, data) VALUES (?, ?, ?, ?)').run(
    entity,
    String(entityId),
    type,
    dataJson
  );
}
