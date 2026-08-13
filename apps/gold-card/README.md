# Gold Card — patient referral app

Gold Card is GM Dental's patient referral system. Existing patients get a digital gold card that **installs to their phone's home screen like an app (PWA)** — one tap opens their personal QR code. A friend scans it, lands on a referral page, signs up, and a member of the team contacts them to book a consultation. Inquiries advance through a status flow (new → contacted → booked → attended → treatment agreed → treatment completed, with a "lost" exit), and on completion the referrer automatically earns the configured reward — **by default a £25 credit off their next treatment** (seeded on first run; fixed or percentage-with-cap rules configurable per practice). Credits flow through pending → ready-to-use → redeemed on the patient's card. See the [full specification](../../docs/specs/01-gold-card-referral-app.md) for design rationale and Phase 2 roadmap.

## Quickstart

```bash
cd apps/gold-card
npm install
cp .env.example .env
npm run dev
```

Then visit:
- **Patient card**: http://localhost:3000/card/CODE (where CODE is an 8-char referral code)
- **Landing page**: http://localhost:3000/r/CODE
- **Admin dashboard**: http://localhost:3000/admin

## How it works

1. **Referrer setup**: Dentist or hygienist registers via admin, receives an 8-character referral code and shareable card (containing a QR code that links to the landing page).

2. **Patient inquiry**: Prospect scans QR or visits the landing page, enters their details (name, phone/email, treatment interest, consent checkbox). An inquiry is created with status `new`.

3. **Treatment pipeline**: Admin advances the inquiry through stages: `contacted`, `booked`, `attended`, `treatment_agreed`, then `treatment_completed`. Any non-terminal state can transition to `lost` (e.g., if the patient cancels).

4. **Reward calculation**: When an inquiry reaches `treatment_completed`, the system applies active reward rules based on the referrer's practice:
   - **Fixed rule**: Flat credit — the default rule seeded on first run is £25 (2500 pennies) off the referrer's next treatment
   - **Percent rule**: Percentage of treatment value (e.g., 5% capped at £50)
   - A reward row is created in `pending` status.

5. **Reward lifecycle**: Pending credits are `approved` (shown to the patient as "Ready to use"), then marked `paid` when redeemed against their next treatment, or `void`ed if needed. Amounts are tracked in integer pennies (e.g., £25.50 = 2550).

6. **Phone app (PWA)**: The card page serves a per-referrer web-app manifest (`/card/CODE/manifest.webmanifest`), a service worker (`/sw.js`) for offline reopening, and home-screen icons. On Android/Chrome an "Add to home screen" button appears on the card; on iPhone the card shows Share → Add to Home Screen instructions. Once installed it opens full-screen straight to the QR code.

## API Reference

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /healthz | None | Health check; returns `{ok:true}` |
| GET | /card/:code | None | HTML card page with referrer name and QR data image |
| GET | /r/:code | None | HTML landing page with referrer info and inquiry form |
| POST | /r/:code/inquiry | None | Submit patient inquiry; body: `{prospect_name, prospect_phone?, prospect_email?, treatment_interest?, consent}` |
| POST | /api/admin/referrers | Admin Key | Create referrer; body: `{name, phone?, email?, practice_id?}` → `{id, referral_code, card_url, landing_url}` |
| PATCH | /api/admin/referrals/:id | Admin Key | Update referral status; body: `{status, lost_reason?, treatment_value_pennies?}` |
| POST | /api/admin/reward-rules | Admin Key | Create reward rule; body: `{practice_id?, type, value, cap_pennies?, min_treatment_value_pennies?}` |
| GET | /api/admin/rewards | Admin Key | List rewards; query: `?status=pending\|approved\|paid\|void` |
| PATCH | /api/admin/rewards/:id | Admin Key | Update reward status; body: `{status}` |
| GET | /api/admin/stats | Admin Key | Global stats: `{referrers, referrals_by_status, rewards_pennies, inquiries, completed}` |

**Admin authentication**: Pass header `x-admin-key: YOUR_API_KEY` (configured via `ADMIN_API_KEY` environment variable).

### Inquiry validation

- `prospect_name` and `consent` are required.
- At least one of `prospect_phone` or `prospect_email` must be provided.
- If prospect phone or email matches the referrer's own phone or email, returns 422 `{error:'self_referral_not_allowed'}`.

### Status flow

```
new → contacted → booked → attended → treatment_agreed → treatment_completed
↓
└─ lost (from any non-terminal state)
```

Transitioning directly between non-adjacent states (e.g., `new` → `attended`) returns 409 `{error:'invalid_transition'}`.

## Examples

### Create a referrer
```bash
curl -X POST http://localhost:3000/api/admin/referrers \
  -H "x-admin-key: $(echo $ADMIN_API_KEY)" \
  -H "content-type: application/json" \
  -d '{
    "name": "Dr. Sarah Chen",
    "phone": "02071112222",
    "email": "sarah@gmdental.uk",
    "practice_id": "practice_001"
  }'
```

Response:
```json
{
  "id": "ref_123abc",
  "referral_code": "ABC12345",
  "card_url": "http://localhost:3000/card/ABC12345",
  "landing_url": "http://localhost:3000/r/ABC12345"
}
```

### Submit a patient inquiry
```bash
curl -X POST http://localhost:3000/r/ABC12345/inquiry \
  -H "content-type: application/json" \
  -d '{
    "prospect_name": "Jane Smith",
    "prospect_phone": "07700000111",
    "prospect_email": "jane@example.com",
    "treatment_interest": "teeth whitening",
    "consent": true
  }'
```

Response:
```json
{
  "id": "inq_789def",
  "status": "new"
}
```

### Advance inquiry to treatment completed and create reward
```bash
# First, advance through states
curl -X PATCH http://localhost:3000/api/admin/referrals/inq_789def \
  -H "x-admin-key: $(echo $ADMIN_API_KEY)" \
  -H "content-type: application/json" \
  -d '{"status": "contacted"}'

curl -X PATCH http://localhost:3000/api/admin/referrals/inq_789def \
  -H "x-admin-key: $(echo $ADMIN_API_KEY)" \
  -H "content-type: application/json" \
  -d '{"status": "treatment_completed", "treatment_value_pennies": 150000}'
```

Response (second call):
```json
{
  "id": "inq_789def",
  "status": "treatment_completed",
  "treatment_value_pennies": 150000,
  "reward": {
    "rewardId": "rew_456ghi",
    "amountPennies": 2500,
    "reason": "created"
  }
}
```

## God Mode (owner dashboard)

`/god` is the owner-level tier above per-site admin, protected by `GOD_MODE_KEY`
(the god key is also accepted on every admin endpoint). It provides:

- **Network overview** — referrers, referrals, completions, and referral revenue per practice, plus credit liability totals.
- **All referrers across all practices** with lifetime numbers and direct card links.
- **Manual credit grants** — goodwill gestures or prize fulfilment; reason is required and audit-logged; the credit appears on the patient's card as "Ready to use" immediately.
- **Run refer-reminder nudges on demand** and inspect the full audit trail.

## Refer-reminder nudges

`POST /api/admin/nudges/run` messages every active referrer with **no referral
and no reminder in the last `NUDGE_DAYS` days** (default 14) — push notification
if they've installed the mobile app, SMS otherwise. Schedule it daily via cron:

```cron
0 10 * * * curl -s -X POST https://YOUR-DOMAIN/api/admin/nudges/run -H "x-admin-key: $ADMIN_API_KEY"
```

## Monthly whitening draw

Every **referral** is one draw entry (three referrals in a month = three
chances). `POST /api/admin/draw` picks the month's winner (idempotent — one
winner per month), notifies them, and records it. Run it from the admin
dashboard, God Mode, or cron on the 1st of each month.

## Mobile apps (App Store / Play Store)

See [`../gold-card-mobile/`](../gold-card-mobile/README.md) — a Capacitor
shell that wraps this server into native iOS and Android apps with push
notifications. The card page auto-registers device push tokens when running
inside the app (`POST /api/device-token`).

## Testing

Run the test suite:
```bash
npm test
```

Tests are located in `tests/app.test.ts` and use Node's built-in `test` module with SQLite in-memory databases. They cover:
- Health check endpoint
- Admin authentication
- Referrer creation and card/landing page generation
- Full referral pipeline with fixed rewards
- Invalid state transitions
- Self-referral prevention
- Percent-based rules with practice-specific caps
- Reward lifecycle (pending → approved → paid)
- Statistics endpoint

## Production notes

- **Admin API key**: Set `ADMIN_API_KEY` environment variable to a strong, unique value and rotate regularly.
- **HTTPS**: Run behind a reverse proxy (nginx, Cloudflare) that enforces HTTPS; never expose the app directly over HTTP.
- **Notifications**: The stub notification service (`src/services/notify.ts`) logs to console. Integrate Twilio (SMS) or SMTP (email) for real dentist and patient communications.
- **CRM integration**: Set `GHL_API_TOKEN` and `GHL_LOCATION_ID` to enable real-time sync of referrals and rewards to GoHighLevel.
- **Database backups**: SQLite file at `${DBPath}` (default `./gold-card.db`) should be backed up hourly or after each completed treatment. Consider migrating to PostgreSQL for multi-instance deployments.
- **Reward calculations**: Percent rules use floor-based rounding; cap is always applied after calculation. E.g., 5% of £20,000 (2,000,000 pennies) = £1,000 (100,000 pennies), capped at £50 (5,000 pennies) = £50.
- **Phase 2 roadmap** (see spec): Apple Wallet/Google Pay passes, webhook-driven reward triggers from Dentally practice management, fraud detection (duplicate referrals within 30 days), and referrer leaderboards.
