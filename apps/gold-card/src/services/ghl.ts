import type { Config } from '../config.js';
import { logEvent, type Db } from '../db.js';

export async function pushInquiryToGhl(db: Db, cfg: Config, referralId: number): Promise<void> {
  if (!cfg.ghlApiToken || !cfg.ghlLocationId) {
    logEvent(db, 'referral', referralId, 'ghl_push_skipped', { reason: 'not_configured' });
    return;
  }

  logEvent(db, 'referral', referralId, 'ghl_push_queued', {});

  try {
    // TODO: Real implementation
    // const response = await fetch('https://services.leadconnectorhq.com/contacts/', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${cfg.ghlApiToken}`,
    //     'Version': '2021-07-28',
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     locationId: cfg.ghlLocationId,
    //     // ... referral data
    //   }),
    // });
    // if (!response.ok) {
    //   throw new Error(`GHL API error: ${response.status}`);
    // }
  } catch (error) {
    logEvent(db, 'referral', referralId, 'ghl_push_failed', { error: String(error) });
  }
}
