import { Router } from 'express';
import QRCode from 'qrcode';
import { readFileSync } from 'fs';
import { URL } from 'url';
import { AppDeps } from '../app.js';
import { logEvent } from '../db.js';
import { notify } from '../services/notify.js';
import { pushInquiryToGhl } from '../services/ghl.js';

const router = Router();

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

function render(template: string, vars: Record<string, any>): string {
  return template.replace(/{{(\w+)}}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined ? String(val) : '';
  });
}

function formatPennies(p: number): string {
  return '£' + (p / 100).toFixed(2);
}

// Patient-facing labels: rewards are credit toward the referrer's next treatment.
const REWARD_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Ready to use',
  paid: 'Redeemed',
  void: 'Cancelled',
};

const SERVICE_WORKER_JS = `
const CACHE = 'goldcard-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
`;

export function publicRoutes(deps: AppDeps): Router {
  router.get('/healthz', (req, res) => {
    res.json({ ok: true });
  });

  router.get('/sw.js', (req, res) => {
    res.type('application/javascript').send(SERVICE_WORKER_JS);
  });

  // Per-card web-app manifest so the card installs to the home screen and
  // opens straight to this referrer's QR code.
  router.get('/card/:code/manifest.webmanifest', (req, res) => {
    const { code } = req.params;
    const referrer = deps.db.prepare(
      'SELECT id FROM referrers WHERE referral_code = ?'
    ).get(code);
    if (!referrer) return res.status(404).json({ error: 'not_found' });

    res.type('application/manifest+json').json({
      name: 'GM Dental Gold Card',
      short_name: 'Gold Card',
      description: 'Your GM Dental referral card — show the QR code to friends.',
      start_url: `/card/${code}`,
      scope: '/card/',
      display: 'standalone',
      background_color: '#0f172a',
      theme_color: '#0f172a',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    });
  });

  router.get('/card/:code', async (req, res) => {
    const { code } = req.params;
    const referrer = deps.db.prepare(
      'SELECT id, name, referral_code FROM referrers WHERE referral_code = ?'
    ).get(code);

    if (!referrer) {
      return res.status(404).type('html').send('<h1>Card not found</h1>');
    }

    const baseUrl = deps.config.baseUrl;
    const qrDataUrl = await QRCode.toDataURL(`${baseUrl}/r/${code}`);
    const referralUrl = `${baseUrl}/r/${code}`;

    const rewards = deps.db.prepare(`
      SELECT r.id, r.created_at, r.amount_pennies, r.status
      FROM rewards r
      JOIN referrals rf ON r.referral_id = rf.id
      WHERE rf.referrer_id = ?
      ORDER BY r.created_at DESC
    `).all(referrer.id) as any[];

    let rewardsRows = '';
    if (rewards.length === 0) {
      rewardsRows = '<tr><td colspan="3">No credits yet — share your card!</td></tr>';
    } else {
      rewardsRows = rewards
        .map((rw) => {
          const date = new Date(rw.created_at).toLocaleDateString();
          const amount = formatPennies(rw.amount_pennies);
          const label = REWARD_LABELS[rw.status] ?? rw.status;
          const statusBadge = `<span class="badge badge-${rw.status}">${escapeHtml(label)}</span>`;
          return `<tr><td>${escapeHtml(date)}</td><td>${escapeHtml(amount)}</td><td>${statusBadge}</td></tr>`;
        })
        .join('');
    }

    const entriesThisMonth = (deps.db.prepare(
      "SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ? AND substr(created_at, 1, 7) = strftime('%Y-%m', 'now')"
    ).get(referrer.id) as any).n;

    const totalPending = rewards
      .filter((r) => r.status === 'pending')
      .reduce((sum, r) => sum + r.amount_pennies, 0);
    const totalReady = rewards
      .filter((r) => r.status === 'approved')
      .reduce((sum, r) => sum + r.amount_pennies, 0);
    const totalPaid = rewards
      .filter((r) => r.status === 'paid')
      .reduce((sum, r) => sum + r.amount_pennies, 0);

    const cardPath = new URL('../views/card.html', import.meta.url).pathname;
    const template = readFileSync(cardPath, 'utf-8');

    const html = render(template, {
      name: escapeHtml(referrer.name),
      code: escapeHtml(code),
      qrDataUrl,
      referralUrl: escapeHtml(referralUrl),
      rewardsRows,
      entriesThisMonth: String(entriesThisMonth),
      totalPending: formatPennies(totalPending),
      totalReady: formatPennies(totalReady),
      totalPaid: formatPennies(totalPaid)
    });

    res.type('html').send(html);
  });

  router.get('/r/:code', (req, res) => {
    const { code } = req.params;
    const referrer = deps.db.prepare(
      'SELECT id, name FROM referrers WHERE referral_code = ?'
    ).get(code);

    if (!referrer) {
      return res.status(404).type('html').send('<h1>Referral code not found</h1>');
    }

    const referPath = new URL('../views/refer.html', import.meta.url).pathname;
    const template = readFileSync(referPath, 'utf-8');

    const html = render(template, {
      referrerName: escapeHtml(referrer.name),
      code: escapeHtml(code)
    });

    res.type('html').send(html);
  });

  // Native apps (Capacitor iOS/Android) register their push token against the
  // referrer's card so refer-reminders and reward alerts can reach the device.
  router.post('/api/device-token', (req, res) => {
    const { code, token, platform } = req.body || {};
    if (!code || !token || !platform) {
      return res.status(400).json({ error: 'validation', detail: 'code, token, platform required' });
    }
    const referrer = deps.db.prepare(
      'SELECT id FROM referrers WHERE referral_code = ?'
    ).get(String(code)) as any;
    if (!referrer) return res.status(404).json({ error: 'not_found' });

    deps.db.prepare(
      'INSERT INTO push_tokens (referrer_id, platform, token) VALUES (?, ?, ?) ' +
      'ON CONFLICT(token) DO UPDATE SET referrer_id = excluded.referrer_id, platform = excluded.platform'
    ).run(referrer.id, String(platform), String(token));
    logEvent(deps.db, 'referrer', referrer.id, 'push_token.registered', { platform });
    res.status(201).json({ ok: true });
  });

  router.post('/r/:code/inquiry', async (req, res) => {
    const { code } = req.params;
    const referrer = deps.db.prepare(
      'SELECT id, phone, email, practice_id FROM referrers WHERE referral_code = ?'
    ).get(code);

    if (!referrer) {
      return res.status(404).type('html').send('<h1>Referral code not found</h1>');
    }

    const body = req.body;
    const prospect_name = String(body.prospect_name || '').trim();
    const prospect_phone = String(body.prospect_phone || '').trim();
    const prospect_email = String(body.prospect_email || '').trim();
    const treatment_interest = body.treatment_interest || 'not_sure';
    const consent = body.consent;

    if (!prospect_name) {
      return res.status(400).json({ error: 'validation', detail: 'Name required' });
    }

    if (!prospect_phone && !prospect_email) {
      return res.status(400).json({ error: 'validation', detail: 'Phone or email required' });
    }

    if (!consent || (consent !== 'on' && consent !== '1' && consent !== 1 && consent !== true && consent !== 'true')) {
      return res.status(400).json({ error: 'validation', detail: 'Consent required' });
    }

    const normPhone = (prospect_phone || '').replace(/\D/g, '');
    const normEmail = prospect_email.trim().toLowerCase();
    const referrerNormPhone = (referrer.phone || '').replace(/\D/g, '');
    const referrerNormEmail = (referrer.email || '').trim().toLowerCase();

    if ((normPhone && normPhone === referrerNormPhone) || (normEmail && normEmail === referrerNormEmail)) {
      return res.status(422).json({ error: 'self_referral_not_allowed' });
    }

    const result = deps.db.prepare(`
      INSERT INTO referrals (referrer_id, prospect_name, prospect_phone, prospect_email, treatment_interest, practice_id, consented_marketing, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(referrer.id, prospect_name, prospect_phone || null, prospect_email || null, treatment_interest, referrer.practice_id);

    const referralId = Number(result.lastInsertRowid);

    logEvent(deps.db, 'referral', referralId, 'referral.created', { code });
    void pushInquiryToGhl(deps.db, deps.config, referralId);
    notify(deps.db, 'email', null, 'new_inquiry', { referralId });

    const isJson = req.get('Content-Type')?.includes('application/json');
    if (isJson) {
      return res.status(201).json({ id: referralId, status: 'new' });
    } else {
      return res.type('html').send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Thank You</title>
          <style>
            body { font-family: system-ui; background: #0f172a; color: #e2e8f0; padding: 2rem; }
            .container { max-width: 500px; margin: 0 auto; text-align: center; }
            h1 { color: #d4af37; margin-bottom: 1rem; }
            p { font-size: 1.125rem; margin-bottom: 1rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Thanks!</h1>
            <p>The GM Dental team will call you shortly.</p>
          </div>
        </body>
        </html>
      `);
    }
  });

  return router;
}
