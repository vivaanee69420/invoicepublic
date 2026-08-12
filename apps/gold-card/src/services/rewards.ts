import { logEvent, type Db } from '../db.js';
import { notify } from './notify.js';

export const STATUS_FLOW: Record<string, string[]> = {
  new: ['contacted', 'lost'],
  contacted: ['booked', 'lost'],
  booked: ['attended', 'lost'],
  attended: ['treatment_agreed', 'lost'],
  treatment_agreed: ['treatment_completed', 'lost'],
  treatment_completed: [],
  lost: [],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = STATUS_FLOW[from];
  return allowed ? allowed.includes(to) : false;
}

export interface RewardResult {
  rewardId: number | null;
  amountPennies: number | null;
  reason: string;
}

export function computeRewardForReferral(db: Db, referralId: number): RewardResult {
  // 1. Load referral by id
  const referral = db.prepare('SELECT * FROM referrals WHERE id = ?').get(referralId) as any;
  if (!referral) {
    return { rewardId: null, amountPennies: null, reason: 'referral_not_found' };
  }

  // 2. Check if treatment is completed and treatment_value_pennies is set
  if (referral.status !== 'treatment_completed' || referral.treatment_value_pennies === null) {
    return { rewardId: null, amountPennies: null, reason: 'not_completed' };
  }

  // 3. Check if reward already exists
  const existingReward = db.prepare('SELECT id FROM rewards WHERE referral_id = ?').get(referralId);
  if (existingReward) {
    return { rewardId: null, amountPennies: null, reason: 'already_rewarded' };
  }

  // 4. Pick rule
  let rule = db.prepare(
    'SELECT * FROM reward_rules WHERE active = 1 AND practice_id = ? ORDER BY id DESC LIMIT 1'
  ).get(referral.practice_id) as any;

  if (!rule) {
    rule = db.prepare(
      'SELECT * FROM reward_rules WHERE active = 1 AND practice_id IS NULL ORDER BY id DESC LIMIT 1'
    ).get() as any;
  }

  if (!rule) {
    return { rewardId: null, amountPennies: null, reason: 'no_active_rule' };
  }

  // 5. Check minimum treatment value
  if (referral.treatment_value_pennies < rule.min_treatment_value_pennies) {
    return { rewardId: null, amountPennies: null, reason: 'below_minimum' };
  }

  // 6. Calculate amount
  let amount: number;
  if (rule.type === 'fixed') {
    amount = rule.value;
  } else {
    amount = Math.floor((referral.treatment_value_pennies * rule.value) / 100);
  }

  if (rule.cap_pennies !== null) {
    amount = Math.min(amount, rule.cap_pennies);
  }

  // 7. Insert reward
  const result = db.prepare(
    'INSERT INTO rewards (referral_id, referrer_id, rule_id, amount_pennies, status) VALUES (?, ?, ?, ?, ?)'
  ).run(
    referralId,
    referral.referrer_id,
    rule.id,
    amount,
    'pending'
  ) as any;

  const rewardId = Number(result.lastInsertRowid);

  logEvent(db, 'reward', rewardId, 'reward.created', {
    referralId,
    amountPennies: amount,
  });

  const referrer = db.prepare('SELECT phone FROM referrers WHERE id = ?').get(referral.referrer_id) as any;
  notify(db, 'sms', referrer?.phone || null, 'reward_pending', { amountPennies: amount });

  return { rewardId, amountPennies: amount, reason: 'created' };
}
