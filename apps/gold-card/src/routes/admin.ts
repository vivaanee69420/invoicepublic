import { Router, Request, Response, NextFunction } from 'express';
import { readFileSync } from 'fs';
import { URL } from 'url';
import { randomBytes } from 'crypto';
import { AppDeps } from '../app.js';
import { logEvent } from '../db.js';
import { canTransition, computeRewardForReferral } from '../services/rewards.js';
import { notify } from '../services/notify.js';

const router = Router();

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

function requireAdmin(deps: AppDeps) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.get('x-admin-key');
    // The God Mode key is a superset of admin access. An absent or empty key
    // must never match an unset config value.
    if (!key || (key !== deps.config.adminApiKey && key !== deps.config.godApiKey)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  };
}

export function adminRoutes(deps: AppDeps): Router {
  const admin = requireAdmin(deps);

  router.get('/admin', (req, res) => {
    const adminPath = new URL('../views/admin.html', import.meta.url).pathname;
    const html = readFileSync(adminPath, 'utf-8');
    res.type('html').send(html);
  });

  router.post('/api/admin/referrers', admin, (req, res) => {
    const { name, phone, email, practice_id } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'validation', detail: 'Name required' });
    }

    let code: string | null = null;
    for (let i = 0; i < 5; i++) {
      code = generateCode();
      try {
        deps.db.prepare(`
          INSERT INTO referrers (name, phone, email, practice_id, referral_code, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(name, phone || null, email || null, practice_id || 'default', code, 'active');
        break;
      } catch (e: any) {
        if (i === 4) throw e;
      }
    }

    const referrer = deps.db.prepare('SELECT id FROM referrers WHERE referral_code = ?').get(code);
    const id = referrer?.id;

    notify(deps.db, 'sms', phone || null, 'card_invite', { code });

    res.status(201).json({
      id,
      referral_code: code,
      card_url: `${deps.config.baseUrl}/card/${code}`,
      landing_url: `${deps.config.baseUrl}/r/${code}`
    });
  });

  router.post('/api/admin/referrers/bulk', admin, (req, res) => {
    const { referrers } = req.body;

    if (!Array.isArray(referrers) || referrers.length > 500) {
      return res.status(400).json({ error: 'validation', detail: 'Array max 500 items' });
    }

    const results = referrers.map((r: any) => {
      try {
        const { name, phone, email, practice_id } = r;
        if (!name) {
          return { ok: false, error: 'Name required' };
        }

        let code: string | null = null;
        for (let i = 0; i < 5; i++) {
          code = generateCode();
          try {
            deps.db.prepare(`
              INSERT INTO referrers (name, phone, email, practice_id, referral_code, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            `).run(name, phone || null, email || null, practice_id || 'default', code, 'active');
            break;
          } catch (e: any) {
            if (i === 4) throw e;
          }
        }

        const referrer = deps.db.prepare('SELECT id FROM referrers WHERE referral_code = ?').get(code);
        notify(deps.db, 'sms', phone || null, 'card_invite', { code });

        return { ok: true, id: referrer?.id, referral_code: code };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    });

    res.json({ results });
  });

  router.get('/api/admin/referrals', admin, (req, res) => {
    const { status, practice_id } = req.query;

    let sql = `
      SELECT r.*, ref.name as referrer_name
      FROM referrals r
      JOIN referrers ref ON r.referrer_id = ref.id
    `;
    const params: any[] = [];

    if (status) {
      sql += ' WHERE r.status = ?';
      params.push(status);
    }
    if (practice_id) {
      sql += (status ? ' AND' : ' WHERE') + ' r.practice_id = ?';
      params.push(practice_id);
    }

    sql += ' ORDER BY r.created_at DESC LIMIT 200';

    const rows = deps.db.prepare(sql).all(...params);
    res.json(rows);
  });

  router.patch('/api/admin/referrals/:id', admin, (req, res) => {
    const id = parseInt(req.params.id);
    const { status, lost_reason, treatment_value_pennies } = req.body;

    const referral = deps.db.prepare('SELECT * FROM referrals WHERE id = ?').get(id);
    if (!referral) {
      return res.status(404).json({ error: 'not_found' });
    }

    if (!canTransition(referral.status, status)) {
      return res.status(409).json({
        error: 'invalid_transition',
        from: referral.status,
        to: status
      });
    }

    if (status === 'lost' && lost_reason) {
      deps.db.prepare("UPDATE referrals SET status = ?, lost_reason = ?, updated_at = datetime('now') WHERE id = ?")
        .run(status, lost_reason, id);
    } else if (status === 'treatment_completed') {
      if (!treatment_value_pennies || treatment_value_pennies <= 0) {
        return res.status(400).json({ error: 'validation', detail: 'Treatment value required and must be positive' });
      }
      deps.db.prepare("UPDATE referrals SET status = ?, treatment_value_pennies = ?, updated_at = datetime('now') WHERE id = ?")
        .run(status, treatment_value_pennies, id);
    } else {
      deps.db.prepare("UPDATE referrals SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .run(status, id);
    }

    logEvent(deps.db, 'referral', id, `referral.status_changed.${status}`, {});

    let reward = null;
    if (status === 'treatment_completed') {
      reward = computeRewardForReferral(deps.db, id);
    }

    const updated = deps.db.prepare('SELECT * FROM referrals WHERE id = ?').get(id);
    const response: any = updated;
    if (reward) {
      response.reward = reward;
    }
    res.json(response);
  });

  router.get('/api/admin/reward-rules', admin, (req, res) => {
    const rows = deps.db.prepare('SELECT * FROM reward_rules ORDER BY created_at DESC').all();
    res.json(rows);
  });

  router.post('/api/admin/reward-rules', admin, (req, res) => {
    const { practice_id, type, value, cap_pennies, min_treatment_value_pennies } = req.body;

    if (!type || !['fixed', 'percent'].includes(type)) {
      return res.status(400).json({ error: 'validation', detail: 'Type must be fixed or percent' });
    }
    if (!value || value <= 0) {
      return res.status(400).json({ error: 'validation', detail: 'Value must be positive' });
    }

    const result = deps.db.prepare(`
      INSERT INTO reward_rules (practice_id, type, value, cap_pennies, min_treatment_value_pennies, active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
    `).run(practice_id || null, type, value, cap_pennies || null, min_treatment_value_pennies || 0);

    const rule = deps.db.prepare('SELECT * FROM reward_rules WHERE id = ?').get(Number(result.lastInsertRowid));
    res.status(201).json(rule);
  });

  router.patch('/api/admin/reward-rules/:id', admin, (req, res) => {
    const id = parseInt(req.params.id);
    const { active } = req.body;

    deps.db.prepare('UPDATE reward_rules SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
    const rule = deps.db.prepare('SELECT * FROM reward_rules WHERE id = ?').get(id);
    res.json(rule);
  });

  router.get('/api/admin/rewards', admin, (req, res) => {
    const { status } = req.query;

    let sql = `
      SELECT r.*, ref.name as referrer_name
      FROM rewards r
      JOIN referrers ref ON r.referrer_id = ref.id
    `;
    const params: any[] = [];

    if (status) {
      sql += ' WHERE r.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY r.created_at DESC LIMIT 200';

    const rows = deps.db.prepare(sql).all(...params);
    res.json(rows);
  });

  router.patch('/api/admin/rewards/:id', admin, (req, res) => {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    const reward = deps.db.prepare('SELECT * FROM rewards WHERE id = ?').get(id);
    if (!reward) {
      return res.status(404).json({ error: 'not_found' });
    }

    const allowed: Record<string, string[]> = {
      'pending': ['approved', 'void'],
      'approved': ['paid', 'void']
    };

    const currentStatus = reward.status;
    if (!(currentStatus in allowed) || !allowed[currentStatus].includes(status)) {
      return res.status(409).json({ error: 'invalid_transition', from: currentStatus, to: status });
    }

    const now = new Date().toISOString();
    deps.db.prepare('UPDATE rewards SET status = ?, decided_at = ? WHERE id = ?')
      .run(status, now, id);

    if (status === 'approved') {
      const referral = deps.db.prepare('SELECT referrer_id FROM referrals WHERE id = ?').get(reward.referral_id);
      const referrer = deps.db.prepare('SELECT phone FROM referrers WHERE id = ?').get(referral.referrer_id);
      notify(deps.db, 'sms', referrer?.phone || null, 'reward_approved', { amountPennies: reward.amount_pennies });
    }

    const updated = deps.db.prepare('SELECT * FROM rewards WHERE id = ?').get(id);
    res.json(updated);
  });

  // Monthly whitening draw: one winner per calendar month, picked at random
  // from every referrer who made at least one referral that month.
  router.post('/api/admin/draw', admin, (req, res) => {
    const month = String(req.body?.month || new Date().toISOString().slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'validation', detail: 'month must be YYYY-MM' });
    }

    const existing = deps.db.prepare(`
      SELECT d.*, ref.name as referrer_name
      FROM draws d JOIN referrers ref ON d.referrer_id = ref.id
      WHERE d.month = ?
    `).get(month);
    if (existing) {
      return res.json({ ...existing, already_drawn: true });
    }

    // One entry per referral (not per referrer): a patient who referred three
    // friends this month has three chances to win.
    const candidates = deps.db.prepare(
      "SELECT referrer_id FROM referrals WHERE substr(created_at, 1, 7) = ?"
    ).all(month) as any[];
    if (candidates.length === 0) {
      return res.status(404).json({ error: 'no_entries', detail: `No referrals in ${month}` });
    }

    const winnerId = Number(candidates[Math.floor(Math.random() * candidates.length)].referrer_id);
    const result = deps.db.prepare(
      "INSERT INTO draws (month, referrer_id, prize) VALUES (?, ?, 'free_whitening_treatment')"
    ).run(month, winnerId);

    const winner = deps.db.prepare('SELECT id, name, phone FROM referrers WHERE id = ?').get(winnerId);
    logEvent(deps.db, 'draw', Number(result.lastInsertRowid), 'draw.winner', { month, referrerId: winnerId });
    notify(deps.db, 'sms', winner?.phone || null, 'draw_winner', { month, prize: 'free whitening treatment' });

    res.status(201).json({
      month,
      referrer_id: winnerId,
      referrer_name: winner?.name,
      prize: 'free_whitening_treatment',
      entries: candidates.length,
      already_drawn: false,
    });
  });

  // Refer-reminder nudges: message every active referrer who hasn't referred
  // anyone recently and hasn't already been nudged recently. Push if the
  // referrer has a registered device, SMS otherwise. Run from cron (see README)
  // or the God Mode dashboard.
  router.post('/api/admin/nudges/run', admin, (req, res) => {
    const days = parseInt(String(req.body?.days || deps.config.nudgeDays), 10);
    if (!Number.isFinite(days) || days < 1) {
      return res.status(400).json({ error: 'validation', detail: 'days must be a positive integer' });
    }
    const window = `-${days} days`;

    const targets = deps.db.prepare(`
      SELECT r.id, r.name, r.phone, r.referral_code FROM referrers r
      WHERE r.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM referrals f
          WHERE f.referrer_id = r.id AND f.created_at >= datetime('now', ?)
        )
        AND NOT EXISTS (
          SELECT 1 FROM nudges n
          WHERE n.referrer_id = r.id AND n.sent_at >= datetime('now', ?)
        )
    `).all(window, window) as any[];

    const nudged: number[] = [];
    for (const t of targets) {
      const tokens = deps.db.prepare(
        'SELECT token FROM push_tokens WHERE referrer_id = ?'
      ).all(t.id) as any[];
      const cardUrl = `${deps.config.baseUrl}/card/${t.referral_code}`;
      if (tokens.length > 0) {
        for (const tok of tokens) {
          notify(deps.db, 'push', tok.token, 'refer_reminder', { name: t.name, cardUrl });
        }
        deps.db.prepare("INSERT INTO nudges (referrer_id, channel) VALUES (?, 'push')").run(t.id);
      } else {
        notify(deps.db, 'sms', t.phone || null, 'refer_reminder', { name: t.name, cardUrl });
        deps.db.prepare("INSERT INTO nudges (referrer_id, channel) VALUES (?, 'sms')").run(t.id);
      }
      nudged.push(Number(t.id));
    }

    logEvent(deps.db, 'nudge', 'batch', 'nudges.run', { days, count: nudged.length });
    res.json({ nudged: nudged.length, referrer_ids: nudged });
  });

  router.get('/api/admin/draws', admin, (req, res) => {
    const rows = deps.db.prepare(`
      SELECT d.*, ref.name as referrer_name
      FROM draws d JOIN referrers ref ON d.referrer_id = ref.id
      ORDER BY d.month DESC LIMIT 24
    `).all();
    res.json(rows);
  });

  router.get('/api/admin/stats', admin, (req, res) => {
    const referrerCount = (deps.db.prepare('SELECT COUNT(*) as count FROM referrers').get() as any).count;

    const statuses = deps.db.prepare(`
      SELECT status, COUNT(*) as count FROM referrals GROUP BY status
    `).all() as any[];
    const referralsByStatus: Record<string, number> = {};
    statuses.forEach((row) => {
      referralsByStatus[row.status] = row.count;
    });

    const rewardStats = deps.db.prepare(`
      SELECT status, SUM(amount_pennies) as total FROM rewards GROUP BY status
    `).all() as any[];
    const rewardsPennies: Record<string, number> = { pending: 0, approved: 0, paid: 0 };
    rewardStats.forEach((row) => {
      rewardsPennies[row.status] = row.total || 0;
    });

    const inquiries = (deps.db.prepare('SELECT COUNT(*) as count FROM referrals').get() as any).count;
    const completed = (deps.db.prepare('SELECT COUNT(*) as count FROM referrals WHERE status = ?').get('treatment_completed') as any).count;

    res.json({
      referrers: referrerCount,
      referrals_by_status: referralsByStatus,
      rewards_pennies: rewardsPennies,
      inquiries,
      completed
    });
  });

  return router;
}
