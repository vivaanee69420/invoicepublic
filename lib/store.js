const fs = require('fs');
const path = require('path');

// DATA_DIR is configurable so a hosting platform can point it at a persistent
// disk (e.g. Render disk mounted at /var/data). Defaults to ./data locally.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function load() {
  if (!fs.existsSync(DB_PATH)) {
    const { buildSeed } = require('./seed');
    const db = buildSeed();
    save(db);
    return db;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  if (!db.sessions) db.sessions = {}; // forward-compat for older data files
  return db;
}

function save(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

module.exports = { load, save, DB_PATH, DATA_DIR };
