# 02 — Finance Waterfall Engine

## What it is (from the call)

Space Dental's core "quick win": they hold a panel of **nine finance lenders** and run a
declined patient's application through them in sequence — "the first application may
fail, the second might fail, but the third will pass." Panel spans mainstream dental
finance (they named Chrysalis, Tabeo as the ones we already use) down to near-prime /
sub-prime lenders (they named Snap Finance — "they basically approve everyone, but at
different APR rates"), with terms they claim run up to **10 years** (our current max is
5 years via Chrysalis/Tabeo).

Our version is a **finance application orchestration and tracking system**: given a
patient and a treatment plan, work through our configured lender panel in a defined
order, record every outcome, and surface approved options to the TCO closing the deal.

> **⚠️ Build gate:** operating this requires FCA credit-broking permissions (or an
> exempt/appointed-representative structure) in **our** name — we cannot borrow Space
> Dental's or anyone else's via an informal SLA. The tracking/workflow layer below can
> be built now; **no lender integration goes live until our solicitor signs off the
> regulatory structure and each lender agreement.** Sequential submission to
> progressively higher-APR lenders also has FCA affordability/fair-treatment
> implications — the workflow must support "present options and let the patient choose",
> not just "keep submitting until something sticks".

## User roles

| Role | What they do |
|------|--------------|
| TCO / finance agent | Creates an application for a patient + treatment plan, works the waterfall, records outcomes, presents approved offers. |
| Patient | Receives a secure link to complete each lender's application (most lenders host their own application form) and e-signs. |
| Compliance admin | Configures the lender panel and ordering rules, reviews the audit trail, exports FCA reporting. |
| Practice manager | Sees approval rates, financed revenue, decline reasons per practice. |

## Core flow

1. **Application created** from a treatment plan (amount, treatment type, practice,
   deposit). Patient details pre-filled from the patient master record.
2. **Panel evaluation**: the engine lists eligible lenders for this amount/term
   (each lender has config: min/max loan, available terms, APR range, treatment types,
   soft-search support). Ordering is rule-based (e.g. lowest APR first — this is the
   compliant default, not "most likely to approve first").
3. **Submission**: agent (or patient via link) submits to lender #1. Most dental lenders
   provide a hosted application URL + webhook/status API; where no API exists, the agent
   records the outcome manually.
4. **Outcome recorded**: `approved | approved_with_conditions | referred | declined`,
   with decline reason where given. Declined → engine offers the next eligible lender.
   Every submission is timestamped in the audit log, including which credit-search type
   (soft/hard) the lender ran.
5. **Approval**: approved offers (possibly more than one) are presented to the patient
   with amount, term, APR, monthly payment. Patient chooses; agent marks
   `finance_secured`, treatment booking proceeds.
6. **Exhausted**: all lenders declined → application auto-flags to the **Advanced
   Treatment Plan** flow (System 03) and to the re-engagement queue (System 05) with
   status `all_declined`.

## Functional requirements

### MVP (no lender APIs — workflow + tracking only)
- Lender panel config: name, contact, loan range, terms, APR bands, application URL,
  active flag, ordering priority.
- Application record lifecycle with per-lender submission log and outcomes (manual entry).
- Monthly-payment calculator (amount, term, APR → payment) for quoting on calls.
- Decline-reason taxonomy (affordability, credit history, unknown) feeding reporting.
- Auto-handoff of exhausted applications to System 03 and System 05 queues.
- Dashboards: approval rate by lender, financed value per practice, average lenders
  tried per approval, time-to-decision.
- Full audit trail (who submitted what, when, to whom, outcome, evidence).

### Phase 2
- Direct lender API integrations (start with Tabeo — has a public API; then Chrysalis;
  evaluate others as agreements are signed).
- Soft-search pre-qualification step before any hard search.
- Patient self-serve portal: patient works through offers from a secure link.
- E-signature and document storage for credit agreements.
- Affordability pre-screen questionnaire (income/expenditure) stored against the
  application.

## Data model (sketch)

- `lenders` (id, name, min_amount, max_amount, terms_months[], apr_min, apr_max,
  search_type, api_type, priority, active)
- `finance_applications` (id, patient_ref, treatment_plan_ref, practice_id, amount,
  deposit, status: draft|in_progress|finance_secured|all_declined|abandoned, created_by)
- `lender_submissions` (id, application_id, lender_id, submitted_at, outcome,
  decline_reason, offer_amount, offer_term, offer_apr, offer_monthly, decided_at)
- `audit_events` (append-only)

## Compliance requirements (design-level, non-negotiable)
- Record the regulatory basis on every application (our FCA FRN / exempt status).
- Store the exact information presented to the patient about each offer (APR, total
  repayable) — screenshot/PDF snapshot at decision time.
- Hard-search count per patient visible to the agent before another submission
  (protect the patient's credit file; require explicit patient consent per submission).
- "Present all approved options" screen — the patient chooses, we don't auto-pick.
- Data retention policy per FCA/ICO guidance; right-to-erasure handling that preserves
  the regulatory record where legally required.

## Open questions
1. Which lenders will we actually contract with, and in what order do we sign them?
   (This defines Phase 2 sequencing.)
2. FCA route: full authorisation, limited permission, or appointed representative of a
   principal? (Solicitor decision — blocks go-live, not build.)
3. Do we verify the "10-year dental finance" claim with a named lender before designing
   for terms >60 months?
4. Who owns the patient conversation during finance — practice TCO or a central team?
