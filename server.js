/*
 * Lead & Marketing Tracker — zero-dependency server.
 * Runs on Node 22+ (uses the built-in node:sqlite module).
 *
 *   npm start          → serves the app on http://localhost:3000
 *   PORT=8080 npm start
 *
 * Data lives in ./data/tracker.db (SQLite). Back it up by copying that file.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'tracker.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
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
  CREATE INDEX IF NOT EXISTS idx_leads_date ON leads(lead_date);
  CREATE INDEX IF NOT EXISTS idx_spend_date ON spend(spend_date);
`);

const LEAD_FIELDS = [
  'lead_date', 'name', 'phone', 'city', 'source', 'source_detail', 'campaign',
  'treatment', 'status', 'quoted_value', 'final_value', 'next_followup',
  'entered_by', 'notes',
];
const SPEND_FIELDS = ['spend_date', 'platform', 'amount', 'campaign', 'entered_by', 'notes'];
const NUMERIC_FIELDS = new Set(['quoted_value', 'final_value', 'amount']);

function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null) continue;
    out[f] = NUMERIC_FIELDS.has(f) ? (Number(body[f]) || 0) : String(body[f]).trim();
  }
  return out;
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvEscape(r[c])).join(','));
  return lines.join('\r\n');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'leads', ':id'?]
  const resource = parts[1];
  const id = parts[2] ? Number(parts[2]) : null;

  // ---- leads -------------------------------------------------------------
  if (resource === 'leads') {
    if (req.method === 'GET') {
      const rows = db.prepare('SELECT * FROM leads ORDER BY lead_date DESC, id DESC').all();
      return json(res, 200, rows);
    }
    if (req.method === 'POST') {
      const b = pick(await readBody(req), LEAD_FIELDS);
      if (!b.name || !b.lead_date || !b.source) return json(res, 400, { error: 'name, lead_date and source are required' });
      const cols = Object.keys(b);
      const stmt = db.prepare(`INSERT INTO leads (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
      const info = stmt.run(...cols.map((c) => b[c]));
      return json(res, 201, db.prepare('SELECT * FROM leads WHERE id = ?').get(info.lastInsertRowid));
    }
    if (req.method === 'PUT' && id) {
      const b = pick(await readBody(req), LEAD_FIELDS);
      const cols = Object.keys(b);
      if (!cols.length) return json(res, 400, { error: 'nothing to update' });
      db.prepare(`UPDATE leads SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
        .run(...cols.map((c) => b[c]), id);
      const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
      return row ? json(res, 200, row) : json(res, 404, { error: 'not found' });
    }
    if (req.method === 'DELETE' && id) {
      db.prepare('DELETE FROM leads WHERE id = ?').run(id);
      return json(res, 200, { ok: true });
    }
  }

  // ---- spend -------------------------------------------------------------
  if (resource === 'spend') {
    if (req.method === 'GET') {
      const rows = db.prepare('SELECT * FROM spend ORDER BY spend_date DESC, id DESC').all();
      return json(res, 200, rows);
    }
    if (req.method === 'POST') {
      const b = pick(await readBody(req), SPEND_FIELDS);
      if (!b.spend_date || !b.platform || !(b.amount > 0)) return json(res, 400, { error: 'spend_date, platform and a positive amount are required' });
      const cols = Object.keys(b);
      const info = db.prepare(`INSERT INTO spend (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
        .run(...cols.map((c) => b[c]));
      return json(res, 201, db.prepare('SELECT * FROM spend WHERE id = ?').get(info.lastInsertRowid));
    }
    if (req.method === 'PUT' && id) {
      const b = pick(await readBody(req), SPEND_FIELDS);
      const cols = Object.keys(b);
      if (!cols.length) return json(res, 400, { error: 'nothing to update' });
      db.prepare(`UPDATE spend SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...cols.map((c) => b[c]), id);
      const row = db.prepare('SELECT * FROM spend WHERE id = ?').get(id);
      return row ? json(res, 200, row) : json(res, 404, { error: 'not found' });
    }
    if (req.method === 'DELETE' && id) {
      db.prepare('DELETE FROM spend WHERE id = ?').run(id);
      return json(res, 200, { ok: true });
    }
  }

  // ---- CSV export ----------------------------------------------------------
  if (resource === 'export' && req.method === 'GET') {
    const which = parts[2] === 'spend.csv' ? 'spend' : parts[2] === 'leads.csv' ? 'leads' : null;
    if (which) {
      const rows = db.prepare(`SELECT * FROM ${which} ORDER BY ${which === 'leads' ? 'lead_date' : 'spend_date'} DESC`).all();
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${which}-${new Date().toISOString().slice(0, 10)}.csv"`,
      });
      return res.end('﻿' + toCsv(rows)); // BOM so Excel opens UTF-8 correctly
    }
  }

  return json(res, 404, { error: 'unknown endpoint' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    return serveStatic(res, url.pathname);
  } catch (err) {
    return json(res, 400, { error: err.message || 'bad request' });
  }
});

server.listen(PORT, () => {
  console.log(`Lead & Marketing Tracker running → http://localhost:${PORT}`);
});
