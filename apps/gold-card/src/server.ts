import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { createApp } from './app.js';

const config = loadConfig();
const db = createDb(config.dbPath);
const app = createApp({ db, config });

app.listen(config.port, () => {
  console.log(`Admin URL: ${config.baseUrl}/admin`);
  console.log(`Example card URL: ${config.baseUrl}/card/XXXXXXXX`);
});
