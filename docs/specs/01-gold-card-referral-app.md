# 01 — Gold Card Referral App

## What it is (from the call)

A digital "gold card" given free to existing patients who have completed treatment. The
patient carries it on their phone (wallet-style card / app screen). When they show it to
a friend, the friend scans a QR code, lands on a portal, and requests a consultation.
The referred friend gets a **free consultation + 5% discount**; the referrer earns a
reward when the friend completes paid treatment. Space Dental claimed one practice did
£663k in a year from this channel with zero marketing spend (~34% of business revenue).

Key correction we made on the call: **percentage cashback is dangerous on high-value
dentistry** (5% of a £25,000 case = £1,250 per referral). Our version must support a
**fixed reward amount (e.g. £25–£50)** as the default, with percentage as a configurable
option, per-practice, with a per-referral cap.

## User roles

| Role | What they do |
|------|--------------|
| Referrer (existing patient) | Signs up via link sent by the practice, gets their card + unique QR code, views their rewards ledger and referral statuses. |
| Referred patient (prospect) | Scans QR, lands on a branded page, submits contact details + treatment interest. |
| Follow-up agent (our team) | Sees new referral inquiries, calls them, qualifies (what do they want to change, why), books consultation or virtual TCO call. |
| Practice manager / admin | Configures reward rules, issues cards in bulk to the patient base, views pipeline dashboard, approves reward payouts. |

## Core user journeys

### A. Card issuance (bulk + individual)
1. Admin selects patients from the CRM (e.g. "everyone who completed treatment") and
   triggers a bulk invite — SMS/email with a sign-up link.
2. Patient opens link, confirms identity (name + DOB or one-time code), accepts terms,
   and gets their card: a mobile-friendly card page with their name, practice branding,
   and a unique QR code. Add-to-Apple-Wallet / Google-Wallet pass generation is Phase 2.

### B. Referral
1. Friend scans the referrer's QR code → lands on `/r/{referrer_code}` — a branded page:
   "You've been referred to GM Dental — free consultation + 5% off treatment."
2. Friend submits: name, phone, email, treatment interest (implants / aligners / bonding /
   veneers / not sure), preferred practice/location, consent checkboxes.
3. Inquiry appears instantly in the follow-up queue AND is pushed to GoHighLevel as a
   contact + pipeline opportunity (source = "gold-card", referrer attached).
4. Agent calls within a target SLA (configurable, e.g. 1 business day), qualifies, and
   books either an in-practice consultation (Dentally appointment) or a virtual TCO call
   (System 04).

### C. Reward
1. When the referred patient's treatment is **completed and paid** (manual mark-off by
   admin at MVP; Dentally invoice webhook later), the reward is calculated by the active
   rule and credited to the referrer's ledger as "pending approval".
2. Admin approves → payout (bank transfer / account credit against future treatment —
   business decision, see open questions). Referrer gets a notification.

## Functional requirements

### MVP
- Referrer sign-up flow with unique referral code + QR generation.
- Mobile card page (responsive web; no native app needed at MVP).
- Referred-patient landing page + inquiry form with consent capture.
- Referral pipeline: statuses `new → contacted → booked → attended → treatment agreed →
  treatment completed → reward paid` (+ `lost` with reason).
- Reward rules engine: per practice — fixed amount **or** percentage, with cap, minimum
  qualifying treatment value, and expiry.
- Referrer rewards ledger screen ("see exactly how much they're earning").
- Admin dashboard: referrals by stage, conversion rates, reward liability, top referrers.
- Bulk invite tool (CSV upload at MVP; GHL segment sync Phase 2).
- GHL integration: push each inquiry as contact + opportunity with source attribution.
- Notifications: referrer notified on friend's booking (optional) and on reward credit;
  agent notified on new inquiry.

### Phase 2
- Apple/Google Wallet passes.
- Dentally integration to auto-detect completed+paid treatment for reward triggering.
- Referrer leaderboard / tiered rewards.
- Multi-brand theming (per practice site).
- Fraud controls: self-referral detection (matching phone/email/address), velocity
  limits, duplicate-inquiry merging.

## Data model (sketch)

- `referrers` (id, patient_ref, name, contact, referral_code, status, created_at)
- `referrals` (id, referrer_id, prospect_name, prospect_contact, treatment_interest,
  practice_id, status, lost_reason, consented_marketing, created_at)
- `reward_rules` (id, practice_id, type: fixed|percent, amount, cap, min_treatment_value,
  active_from/to)
- `rewards` (id, referral_id, referrer_id, rule_id, amount, status: pending|approved|
  paid|void, paid_at)
- `events` (append-only audit of every status change and contact attempt)

## Compliance notes
- Consent checkboxes are required fields; store timestamp + wording version.
- The referred patient's discount and the referrer's reward are marketing incentives —
  terms page must state qualifying conditions, and CQC/GDC advertising rules apply to
  the landing-page claims.
- Rewards paid in cash vs. treatment credit may have different tax treatment — finance
  to confirm before payout method is fixed.

## Decisions taken (Aug 2026)
- **Payout method: treatment credit.** The referrer earns £25 off their next
  treatment per completed referral — no cash payouts. Statuses are surfaced to
  the patient as Pending → Ready to use → Redeemed.
- **Delivery: installable web app (PWA).** The card page ships a per-referrer
  manifest, service worker, and icons, so it installs to the patient's home
  screen and opens straight to their QR code. Implemented in `apps/gold-card/`.

## Open questions
1. ~~Payout method~~ — decided: treatment credit (see above).
2. Default reward: £25 confirmed as launch default; revisit £50 via a
   per-practice A/B once volume data exists (the rules engine supports
   per-practice rules for exactly this).
3. Does the 5% discount for the referred patient apply to all treatments or exclude
   already-discounted plans?
4. SLA for first contact on a new referral inquiry?
