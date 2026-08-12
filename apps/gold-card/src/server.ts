import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { createApp } from './app.js';

const config = loadConfig();
const db = createDb(config.dbPath);

// First run: seed the default reward — £25 credit off the referrer's next
// treatment for every friend who completes treatment.
const ruleCount = db.prepare('SELECT COUNT(*) AS n FROM reward_rules').get() as { n: number };
if (Number(ruleCount.n) === 0) {
  db.prepare(
    "INSERT INTO reward_rules (practice_id, type, value, cap_pennies, min_treatment_value_pennies, active) VALUES (NULL, 'fixed', 2500, NULL, 0, 1)"
  ).run();
  console.log('Seeded default reward rule: £25 treatment credit per completed referral');
}

const app = createApp({ db, config });

app.listen(config.port, () => {
  console.log(`Admin URL: ${config.baseUrl}/admin`);
  console.log(`Example card URL: ${config.baseUrl}/card/XXXXXXXX`);
});
