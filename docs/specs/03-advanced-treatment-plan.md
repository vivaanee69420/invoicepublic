# 03 — Advanced Treatment Plan (In-House Payment Plans)

## What it is (from the call)

Space Dental's last-resort product when a patient fails every lender: an **internal
instalment plan** run on their own app. Their worked example (dual-arch implants,
£20k+):

1. Patient pays a small upfront amount (~£300) — this immediately gets them their
   hygiene appointment (an early deliverable so they get value from day one).
2. Patient pays monthly into the plan.
3. When the accumulated balance covers **stage 1** (e.g. one arch ≈ £9,000), that stage
   of treatment is delivered.
4. Payments continue; when the balance covers **stage 2** (second arch), it is delivered.

They claimed ~£300k collected through this in its first month across their network, with
~80% of finance-failed patients accepted onto it, a dedicated team chasing missed
payments, and "full access to the app" for partner practices. The crucial property:
**treatment is only ever delivered up to what has been paid for** — so there is no
credit risk on undelivered work.

Our version: a **stage-gated prepayment plan system** — patients save toward defined
treatment milestones; each milestone is only bookable once fully funded.

> **⚠️ Legal shape matters:** a plan where treatment is delivered only after the money
> is received is a *prepayment* scheme, not credit — which is what keeps it outside
> consumer-credit regulation. The software must therefore **enforce** stage-gating (no
> stage bookable before it is fully funded) and the terms (cancellation/refund policy,
> what happens to money held, deposit protection) need solicitor sign-off before launch.
> If we ever deliver treatment ahead of payment, it becomes lending — different regime.

## User roles

| Role | What they do |
|------|--------------|
| Patient | Signs up to a plan, sets up recurring payment, sees balance, progress toward each stage, payment history, upcoming charges. |
| TCO / agent | Builds a plan from a treatment plan (stages + prices), sends sign-up link, monitors progress, marks stages delivered. |
| Collections agent | Works the missed-payment queue: failed charges, paused plans, contact log, retry scheduling. |
| Practice manager / finance | Reconciliation, revenue reporting, refund approval, plan-terms configuration. |

## Core flows

### A. Plan creation
1. Agent builds a plan from the treatment plan: ordered stages, each with a price and a
   description (e.g. Stage 0 "Deposit + hygiene" £300 → Stage 1 "Upper arch" £9,000 →
   Stage 2 "Lower arch" £9,000). Total must equal the quoted treatment price.
2. Monthly amount agreed with the patient (min/max bounds configurable; plan length
   auto-calculated and shown).
3. Patient receives a sign-up link: reviews stages, terms, direct-debit/card mandate
   (Stripe / GoCardless), e-signs terms, pays the upfront amount.
4. Stage 0 unlocks immediately → hygiene appointment bookable.

### B. Ongoing payments
- Recurring charge on the agreed day. Success → balance updates, progress bars move.
- When a stage becomes fully funded → patient + agent notified → stage marked
  `ready_to_book` → appointment booked in Dentally → after delivery, agent marks
  `delivered` and the funded amount is recognised.

### C. Missed payments
- Failed charge → automatic retry schedule (e.g. +3 days, +7 days) → if still failing,
  plan status `in_arrears`, collections queue entry created with full context.
- Collections agent logs contact attempts and outcomes; options: reschedule payment
  date, reduce monthly amount (within bounds), pause plan (max N months), cancel plan
  (triggers refund policy on undelivered stages).
- No treatment stage is ever bookable while the plan is `in_arrears` — enforced by the
  system, not by convention.

## Functional requirements

### MVP
- Plan builder with ordered, priced stages; terms versioning + e-acceptance.
- Payment integration: GoCardless (direct debit) and/or Stripe (card, with SCA) —
  recurring mandates, webhooks for success/failure.
- Patient portal (responsive web): balance, per-stage progress, payment history, next
  charge, update payment method.
- Stage-gating engine: `funded → ready_to_book → booked → delivered`; hard block on
  booking unfunded stages.
- Arrears workflow + collections queue with contact logging.
- Notifications: payment receipt, failed payment, stage funded, plan paused/cancelled.
- Admin: plan list with statuses, arrears report, monthly collected vs. expected,
  refund processing (undelivered stages only).
- Full audit log.

### Phase 2
- Dentally integration: auto-create appointments for `ready_to_book` stages; pull
  treatment-plan items to build stages.
- Early-settlement flow (pay remaining balance at any time, small incentive optional).
- Plan variations (clinician revises treatment mid-plan → re-price stages with patient
  re-acceptance).
- Client-money segregation reporting if solicitor requires funds held in a separate
  account.

## Data model (sketch)

- `plans` (id, patient_ref, practice_id, treatment_plan_ref, total, monthly_amount,
  charge_day, status: active|in_arrears|paused|completed|cancelled, terms_version,
  signed_at)
- `plan_stages` (id, plan_id, sequence, title, price, status: locked|funded|
  ready_to_book|booked|delivered|refunded)
- `payments` (id, plan_id, due_at, amount, status: scheduled|paid|failed|refunded,
  provider_ref, failure_reason)
- `collections_actions` (id, plan_id, agent_id, action, outcome, note, created_at)

## Compliance notes
- Terms must state: money is prepayment for defined treatment stages; refund policy for
  undelivered stages; no interest/charges (charging credit-style fees risks pulling the
  product into the consumer-credit regime).
- Confirm with solicitor/accountant whether prepaid funds must be ring-fenced.
- Vulnerable-customer handling in the collections workflow (scripts, escalation flag).

## Open questions
1. Refund policy on cancellation — full refund of undelivered stages, or an admin fee?
2. Minimum monthly amount / maximum plan length?
3. Do we hold funds in a segregated client account?
4. GoCardless vs Stripe vs both?
