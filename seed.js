/*
 * Seeds the database with ~45 days of realistic sample data so you can see the
 * dashboard working before your team starts entering real leads.
 *
 *   npm run seed          → inserts sample rows. Run it once on a fresh database;
 *                           re-running adds the rows again. Delete data/tracker.db to start clean.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'tracker.db'));

// Make sure the schema exists (same DDL as server.js).
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_date     TEXT NOT NULL,
    name          TEXT NOT NULL,
    phone         TEXT NOT NULL DEFAULT '',
    city          TEXT NOT NULL DEFAULT '',
    source        TEXT NOT NULL,
    source_detail TEXT NOT NULL DEFAULT '',
    campaign      TEXT NOT NULL DEFAULT '',
    treatment     TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'New',
    quoted_value  REAL NOT NULL DEFAULT 0,
    final_value   REAL NOT NULL DEFAULT 0,
    next_followup TEXT NOT NULL DEFAULT '',
    entered_by    TEXT NOT NULL DEFAULT '',
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS spend (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    spend_date TEXT NOT NULL,
    platform   TEXT NOT NULL,
    amount     REAL NOT NULL DEFAULT 0,
    campaign   TEXT NOT NULL DEFAULT '',
    entered_by TEXT NOT NULL DEFAULT '',
    notes      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const SOURCES = [
  // [source, daily lead weight, daily ad spend ₹ (0 = organic/offline)]
  ['Facebook', 5, 3500],
  ['Google Ads', 4, 4000],
  ['Instagram', 3, 2000],
  ['SEO / Website', 2, 0],
  ['Exhibition / Event', 2, 1500],
  ['Walk-in', 1.5, 0],
  ['Referral', 1.5, 0],
  ['JustDial', 1, 800],
];
const STATUSES = ['New', 'Contacted', 'Consultation Booked', 'Consultation Done', 'Treatment Booked', 'Treatment Done', 'Lost'];
const TREATMENTS = ['Hair Transplant', 'PRP Therapy', 'Skin Treatment', 'Laser Hair Removal', 'Dental Implant', 'Consultation Only'];
const NAMES = ['Rahul Sharma', 'Priya Patel', 'Amit Kumar', 'Sneha Reddy', 'Vikram Singh', 'Anjali Gupta', 'Rohan Mehta', 'Kavita Joshi', 'Suresh Nair', 'Deepa Iyer', 'Arjun Desai', 'Pooja Verma', 'Manish Agarwal', 'Ritu Malhotra', 'Sanjay Rao'];
const TEAM = ['Reception', 'Dr. Gaurav', 'Marketing Team', 'Front Desk'];
const CITIES = ['Mumbai', 'Pune', 'Thane', 'Navi Mumbai', 'Nashik'];

// Deterministic pseudo-random so re-runs on a fresh DB give the same demo.
let s = 42;
const rand = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pickFrom = (arr) => arr[Math.floor(rand() * arr.length)];

const insertLead = db.prepare(`INSERT INTO leads
  (lead_date, name, phone, city, source, campaign, treatment, status, quoted_value, final_value, entered_by, notes)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
const insertSpend = db.prepare(`INSERT INTO spend (spend_date, platform, amount, campaign, entered_by) VALUES (?,?,?,?,?)`);

const DAYS = 45;
const today = new Date();
let leadCount = 0;
let spendCount = 0;

for (let d = DAYS; d >= 0; d--) {
  const date = new Date(today);
  date.setDate(date.getDate() - d);
  const iso = date.toISOString().slice(0, 10);
  const recency = d / DAYS; // older leads are further along the funnel

  for (const [source, weight, dailySpend] of SOURCES) {
    // leads for this source today
    const n = Math.round(weight * (0.4 + rand() * 1.2));
    for (let i = 0; i < n; i++) {
      // Older leads have progressed further; ~15% are lost.
      let status;
      const r = rand();
      if (r < 0.15) status = 'Lost';
      else {
        const maxStage = Math.min(5, Math.floor(recency * 6 + rand() * 2));
        status = STATUSES[Math.max(0, Math.min(5, Math.floor(rand() * (maxStage + 1))))];
      }
      const quoted = 15000 + Math.floor(rand() * 12) * 5000;
      const done = status === 'Treatment Done' || status === 'Treatment Booked';
      insertLead.run(
        iso, pickFrom(NAMES), `98${String(Math.floor(rand() * 1e8)).padStart(8, '0')}`,
        pickFrom(CITIES), source,
        dailySpend > 0 ? `${source.split(' ')[0]} Campaign ${1 + Math.floor(rand() * 3)}` : '',
        pickFrom(TREATMENTS), status, quoted,
        done ? quoted * (0.8 + rand() * 0.3) : 0,
        pickFrom(TEAM), '',
      );
      leadCount++;
    }
    if (dailySpend > 0) {
      insertSpend.run(iso, source, Math.round(dailySpend * (0.7 + rand() * 0.6)), `${source.split(' ')[0]} Campaign 1`, 'Marketing Team');
      spendCount++;
    }
  }
}

console.log(`Seeded ${leadCount} leads and ${spendCount} spend entries over ${DAYS + 1} days.`);
console.log('Start the app with: npm start');
