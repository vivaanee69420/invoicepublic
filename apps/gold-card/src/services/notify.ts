import { logEvent, type Db } from '../db.js';

export function notify(db: Db, channel: 'sms' | 'email' | 'push', to: string | null, template: string, data: Record<string, unknown>): void {
  console.log(`[notify:${channel}] to=${to ?? 'unknown'} template=${template}`);
  logEvent(db, 'notification', to ?? 'unknown', `notify.${template}`, { channel, data });
}
