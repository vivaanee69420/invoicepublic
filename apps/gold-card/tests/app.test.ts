import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';

let server: any;
let base: string;
let app: any;
let db: any;

const config = {
  port: 0,
  baseUrl: 'http://localhost',
  adminApiKey: 'test-key',
  dbPath: ':memory:',
  ghlApiToken: null,
  ghlLocationId: null,
};

const admin = async (path: string, opts: RequestInit = {}) => {
  const headers: Record<string, string> = {
    'x-admin-key': config.adminApiKey,
    ...((opts.headers as Record<string, string>) || {}),
  };
  return fetch(`${base}${path}`, { ...opts, headers });
};

const j = (r: Response) => r.json();

before(async () => {
  db = createDb(':memory:');
  app = createApp({ db, config });
  server = app.listen(0);
  const addr = server.address();
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

test('GET /healthz returns ok', async () => {
  const r = await fetch(`${base}/healthz`);
  assert.equal(r.status, 200);
  const body = await j(r);
  assert.equal(body.ok, true);
});

test('admin endpoint without key returns 401', async () => {
  const r = await fetch(`${base}/api/admin/referrers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test' }),
  });
  assert.equal(r.status, 401);
  const body = await j(r);
  assert.equal(body.error, 'unauthorized');
});

test('create referrer with 8-char code and view landing/card', async () => {
  const createResp = await admin('/api/admin/referrers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Priya Shah',
      phone: '07700 900123',
      email: 'priya@example.com',
    }),
  });
  assert.equal(createResp.status, 201);
  const referrer = await j(createResp);
  assert(referrer.id);
  assert(referrer.referral_code);
  assert.equal(referrer.referral_code.length, 8);
  const code = referrer.referral_code;

  const landingResp = await fetch(`${base}/r/${code}`);
  assert.equal(landingResp.status, 200);
  const landingHtml = await landingResp.text();
  assert(landingHtml.includes('Priya Shah'));

  const cardResp = await fetch(`${base}/card/${code}`);
  assert.equal(cardResp.status, 200);
  const cardHtml = await cardResp.text();
  assert(cardHtml.includes('data:image'));
});

test('full happy path with fixed rule', async () => {
  const ruleResp = await admin('/api/admin/reward-rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'fixed', value: 2500 }),
  });
  assert.equal(ruleResp.status, 201);

  const refResp = await admin('/api/admin/referrers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Referrer',
      phone: '07700 900456',
      email: 'test@example.com',
    }),
  });
  const referrer = await j(refResp);
  const code = referrer.referral_code;

  const inquiryResp = await fetch(`${base}/r/${code}/inquiry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prospect_name: 'John Doe',
      prospect_phone: '07700 900789',
      prospect_email: 'john@example.com',
      treatment_interest: 'implants',
      consent: true,
    }),
  });
  assert.equal(inquiryResp.status, 201);
  const inquiry = await j(inquiryResp);
  assert.equal(inquiry.status, 'new');
  const inquiryId = inquiry.id;

  for (const status of ['contacted', 'booked', 'attended', 'treatment_agreed']) {
    const patchResp = await admin(`/api/admin/referrals/${inquiryId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    assert.equal(patchResp.status, 200);
  }

  const noValueResp = await admin(`/api/admin/referrals/${inquiryId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'treatment_completed' }),
  });
  assert.equal(noValueResp.status, 400);

  const completeResp = await admin(`/api/admin/referrals/${inquiryId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      status: 'treatment_completed',
      treatment_value_pennies: 500000,
    }),
  });
  assert.equal(completeResp.status, 200);
  const completed = await j(completeResp);
  assert.equal(completed.reward.amountPennies, 2500);
  assert.equal(completed.reward.reason, 'created');
});

test('invalid transition returns 409', async () => {
  const refResp = await admin('/api/admin/referrers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Transition Tester',
      email: 'trans@example.com',
    }),
  });
  const referrer = await j(refResp);
  const code = referrer.referral_code;

  const inquiryResp = await fetch(`${base}/r/${code}/inquiry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prospect_name: 'Invalid Prospect',
      prospect_email: 'inv@example.com',
      consent: true,
    }),
  });
  const inquiry = await j(inquiryResp);
  const inquiryId = inquiry.id;

  const badTransition = await admin(`/api/admin/referrals/${inquiryId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'attended' }),
  });
  assert.equal(badTransition.status, 409);
  const error = await j(badTransition);
  assert.equal(error.error, 'invalid_transition');
});

test('self-referral blocked', async () => {
  const refResp = await admin('/api/admin/referrers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Self Referrer',
      email: 'self@example.com',
    }),
  });
  const referrer = await j(refResp);
  const code = referrer.referral_code;

  const inquiryResp = await fetch(`${base}/r/${code}/inquiry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prospect_name: 'Self',
      prospect_email: 'self@example.com',
      consent: true,
    }),
  });
  assert.equal(inquiryResp.status, 422);
  const error = await j(inquiryResp);
  assert.equal(error.error, 'self_referral_not_allowed');
});

test('percent rule with cap per-practice', async () => {
  const refResp = await admin('/api/admin/referrers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Practice Referrer',
      email: 'practice@example.com',
      practice_id: 'p2',
    }),
  });
  const referrer = await j(refResp);
  const code = referrer.referral_code;

  const ruleResp = await admin('/api/admin/reward-rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      practice_id: 'p2',
      type: 'percent',
      value: 5,
      cap_pennies: 5000,
    }),
  });
  assert.equal(ruleResp.status, 201);

  const inquiryResp = await fetch(`${base}/r/${code}/inquiry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prospect_name: 'Capped Patient',
      prospect_email: 'capped@example.com',
      consent: true,
    }),
  });
  const inquiry = await j(inquiryResp);
  const inquiryId = inquiry.id;

  for (const status of ['contacted', 'booked', 'attended', 'treatment_agreed']) {
    await admin(`/api/admin/referrals/${inquiryId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  const completeResp = await admin(`/api/admin/referrals/${inquiryId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      status: 'treatment_completed',
      treatment_value_pennies: 2000000,
    }),
  });
  const completed = await j(completeResp);
  assert.equal(completed.reward.amountPennies, 5000);
});

test('reward lifecycle', async () => {
  const ruleResp = await admin('/api/admin/reward-rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'fixed', value: 1000 }),
  });
  assert.equal(ruleResp.status, 201);

  const refResp = await admin('/api/admin/referrers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Reward Lifecycle',
      email: 'lifecycle@example.com',
    }),
  });
  const referrer = await j(refResp);
  const code = referrer.referral_code;

  const inquiryResp = await fetch(`${base}/r/${code}/inquiry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prospect_name: 'Lifecycle Patient',
      prospect_email: 'lcpat@example.com',
      consent: true,
    }),
  });
  const inquiry = await j(inquiryResp);
  const inquiryId = inquiry.id;

  for (const status of ['contacted', 'booked', 'attended', 'treatment_agreed']) {
    await admin(`/api/admin/referrals/${inquiryId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  const completeResp = await admin(`/api/admin/referrals/${inquiryId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      status: 'treatment_completed',
      treatment_value_pennies: 100000,
    }),
  });
  const completed = await j(completeResp);
  const rewardId = completed.reward.rewardId;

  const rewardsResp = await admin('/api/admin/rewards?status=pending');
  const rewards = await j(rewardsResp);
  assert(Array.isArray(rewards));

  const approveResp = await admin(`/api/admin/rewards/${rewardId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'approved' }),
  });
  assert.equal(approveResp.status, 200);

  const paidResp = await admin(`/api/admin/rewards/${rewardId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'paid' }),
  });
  assert.equal(paidResp.status, 200);

  const badResp = await admin(`/api/admin/rewards/${rewardId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'approved' }),
  });
  assert.equal(badResp.status, 409);
});

test('stats endpoint', async () => {
  const statsResp = await admin('/api/admin/stats');
  assert.equal(statsResp.status, 200);
  const stats = await j(statsResp);
  assert(typeof stats.referrers === 'number');
  assert(stats.referrers >= 2);
  assert(stats.rewards_pennies);
  assert(typeof stats.rewards_pennies.pending === 'number');
  assert(typeof stats.rewards_pennies.approved === 'number');
  assert(typeof stats.rewards_pennies.paid === 'number');
});

test('PWA: manifest and service worker are served', async () => {
  const created = await admin('/api/admin/referrers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'PWA Tester' }),
  });
  const { referral_code } = await j(created);

  const manifestResp = await fetch(`${base}/card/${referral_code}/manifest.webmanifest`);
  assert.equal(manifestResp.status, 200);
  const manifest = await manifestResp.json();
  assert.equal(manifest.start_url, `/card/${referral_code}`);
  assert.equal(manifest.display, 'standalone');
  assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2);

  const badManifest = await fetch(`${base}/card/NOPE1234/manifest.webmanifest`);
  assert.equal(badManifest.status, 404);

  const swResp = await fetch(`${base}/sw.js`);
  assert.equal(swResp.status, 200);
  assert((swResp.headers.get('content-type') || '').includes('javascript'));

  const iconResp = await fetch(`${base}/icons/icon-192.png`);
  assert.equal(iconResp.status, 200);
});
