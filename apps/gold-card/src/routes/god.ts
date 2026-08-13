import { Router, Request, Response, NextFunction } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { AppDeps } from '../app.js';
import { logEvent } from '../db.js';
import { notify } from '../services/notify.js';

// God Mode: the practice-owner tier above per-site admin. One key, full
// visibility across every practice, plus overrides no admin can perform
// (manual credit grants). Every god action is written to the audit log.

function requireGod(deps: AppDeps) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.get('x-god-key');
    if (!key || key !== deps.config.godApiKey) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  };
}

export function godRoutes(deps: AppDeps): Router {
  const router = Router();
  const god = requireGod(deps);

  router.get('/god', (req, res) => {
    const html = readFileSync(fileURLToPath(new URL('../views/god.html', import.meta.url)), 'utf-8');
    res.type('html').send(html);
  });

  // Cross-practice overview: the numbers the owner actually wants per site.
  router.get('/api/god/overview', god, (req, res) => {
    const practices = deps.db.prepare(`
      SELECT
        r.practice_id,
        COUNT(DISTINCT r.id) AS referrers,
        COUNT(f.id) AS referrals,
        SUM(CASE WHEN f.status = 'treatment_completed' THEN 1 ELSE 0 END) AS completed,
        COALESCE(SUM(CASE WHEN f.status = 'treatment_completed' THEN f.treatment_value_pennies ELSE 0 END), 0) AS revenue_pennies
      FROM referrers r
      LEFT JOIN referrals f ON f.referrer_id = r.id
      GROUP BY r.practice_id
      ORDER BY revenue_pennies DESC
    `).all();

    const credits = deps.db.prepare(`
      SELECT status, COALESCE(SUM(amount_pennies), 0) AS total FROM rewards GROUP BY status
    `).all() as any[];
    const creditTotals: Record<string, number> = { pending: 0, approved: 0, paid: 0, void: 0 };
    credits.forEach((c) => { creditTotals[c.status] = Number(c.total); });

    res.json({ practices, credit_totals_pennies: creditTotals });
  });

  // Every referrer across every practice, with card links and lifetime numbers.
  router.get('/api/god/referrers', god, (req, res) => {
    const rows = deps.db.prepare(`
      SELECT
        r.id, r.name, r.phone, r.email, r.practice_id, r.referral_code, r.status, r.created_at,
        COUNT(f.id) AS referrals,
        SUM(CASE WHEN f.status = 'treatment_completed' THEN 1 ELSE 0 END) AS completed,
        (SELECT COALESCE(SUM(amount_pennies), 0) FROM rewards w WHERE w.referrer_id = r.id AND w.status != 'void') AS credits_pennies
      FROM referrers r
      LEFT JOIN referrals f ON f.referrer_id = r.id
      GROUP BY r.id
      ORDER BY referrals DESC, r.created_at DESC
      LIMIT 500
    `).all() as any[];

    res.json(rows.map((r) => ({
      ...r,
      card_url: `${deps.config.baseUrl}/card/${r.referral_code}`,
      landing_url: `${deps.config.baseUrl}/r/${r.referral_code}`,
    })));
  });

  // Manual credit grant: goodwill gestures, prize fulfilment, corrections.
  // Created as an already-approved credit ("Ready to use" on the card).
  router.post('/api/god/credit', god, (req, res) => {
    const { referrer_id, amount_pennies, reason } = req.body || {};
    const amount = parseInt(String(amount_pennies), 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'validation', detail: 'amount_pennies must be a positive integer' });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'validation', detail: 'reason required' });
    }
    const referrer = deps.db.prepare('SELECT id, name, phone FROM referrers WHERE id = ?').get(Number(referrer_id)) as any;
    if (!referrer) return res.status(404).json({ error: 'not_found' });

    const result = deps.db.prepare(
      "INSERT INTO rewards (referral_id, referrer_id, rule_id, amount_pennies, status, decided_at) VALUES (NULL, ?, NULL, ?, 'approved', datetime('now'))"
    ).run(referrer.id, amount);
    const rewardId = Number(result.lastInsertRowid);

    logEvent(deps.db, 'reward', rewardId, 'god.credit_granted', { referrerId: referrer.id, amount, reason: String(reason) });
    notify(deps.db, 'sms', referrer.phone || null, 'credit_granted', { amountPennies: amount, reason: String(reason) });

    res.status(201).json({ reward_id: rewardId, referrer_id: referrer.id, amount_pennies: amount, status: 'approved' });
  });

  // Audit trail: everything that has happened, newest first.
  router.get('/api/god/events', god, (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 500);
    const rows = deps.db.prepare(
      'SELECT * FROM events ORDER BY id DESC LIMIT ?'
    ).all(limit);
    res.json(rows);
  });

  return router;
}
