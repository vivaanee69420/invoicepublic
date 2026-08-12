# 05 — Patient Re-Engagement Engine ("Sweep")

## What it is (from the call)

The "sweep team" system — Space Dental's fastest revenue claim (£30k for one practice in
two days). A dedicated team works through the practice's existing patient database and
re-engages everyone who represents unconverted or repeatable revenue. On the call they
segmented our ~20,000-patient CRM roughly as:

- **~30% non-converters** (~6,000): consulted but didn't go ahead — finance declined,
  affordability, "found cheaper elsewhere / Turkey".
- **Past treatment upsell** (~5,000 estimated): aligner patients never offered bonding;
  bonding/veneer patients 3+ years out who are chipped/stained and due a refresh.
- **DNAs and cancellations**: implant consultations booked but never attended in the
  last 6 months — re-engaged with an offer of a video consult (System 04) or in-person.

Their process: ring the patient, reference their history ("you had a dual-arch consult
six months ago — can I ask what made you not go ahead?"), handle the objection (new
finance options via System 02, payment plan via System 03, price/Turkey objections via
trained sales scripts), and book them back into the diary. A stated goal is eliminating
clinicians' diary **white space**.

Our version: a **segmentation + call-queue + outcome-tracking system** on top of our
own data (GoHighLevel CRM + Dentally), worked by our own team.

## User roles

| Role | What they do |
|------|--------------|
| Campaign manager | Builds segments, creates campaigns, assigns agents, sets scripts/offers, monitors results. |
| Sweep agent | Works a prioritised call queue: sees full patient context, logs outcome + objection, books appointments, triggers finance/plan/gold-card flows. |
| Practice manager | Sees rebooked revenue, diary fill, per-campaign ROI. |

## Core flows

### A. Data sync & segmentation
1. Nightly sync from GHL (contacts, opportunities, pipeline stages, comms history) and
   Dentally (appointments incl. DNA/cancelled status, treatment plans, completed
   treatments, charting summary) into a local reporting DB keyed on the patient master
   record. De-duplicate on phone/email/DOB.
2. Segment builder with saved segments, e.g.:
   - `consulted_not_converted` — treatment plan created, no acceptance, N months back,
     filter by treatment type/value and recorded objection.
   - `finance_declined` — from System 02 (or historical flags in GHL).
   - `dna_or_cancelled` — implant consults last 6 months, never rebooked.
   - `refresh_due` — bonding/veneers completed > 36 months ago.
   - `upsell` — aligner completers with no bonding/whitening.
   - Exclusions always applied: deceased, do-not-contact, no marketing consent, active
     complaint, active treatment.

### B. Campaign & call queue
1. Manager turns a segment into a campaign: assigned agents, call script/offer,
   priority ordering (e.g. by treatment value), max attempts, retry spacing,
   calling-hours window.
2. Agent gets a next-call screen: patient context (history, past quotes, objection,
   last contact), the script, and one-click outcomes:
   `booked_consult | booked_video_tco | finance_restarted | plan_offered | callback |
   no_answer | not_interested (reason) | do_not_contact`.
3. `booked_*` outcomes create the appointment (Dentally at Phase 2; MVP creates a GHL
   task/booking link) and move the GHL opportunity stage.
4. `do_not_contact` writes back to GHL immediately and permanently excludes.

### C. Reporting
- Per campaign: contacts attempted / reached / booked / attended / treatment accepted /
  £ revenue (attribution via the booked appointment → accepted plan chain).
- Objection analytics: top reasons patients still say no (feeds pricing/offer strategy).
- Diary white-space view (Phase 2, from Dentally): unfilled clinician hours per site,
  targeted by campaigns.

## Functional requirements

### MVP
- GHL API sync (contacts, opportunities, notes, tags) + CSV import from Dentally
  (full API sync in Phase 2).
- Patient master record with dedup + consent/exclusion flags.
- Segment builder (filterable, saved, refreshable) + preview counts.
- Campaign management + agent call queue with scripted context screen.
- Outcome logging with objection taxonomy; automatic exclusion handling.
- Click-to-call via GHL dialer or Twilio; call notes stored.
- Campaign dashboard with the funnel above.
- Handoffs: one click into System 02 (finance application), System 03 (plan offer),
  System 01 (send gold card), System 04 (book video TCO).

### Phase 2
- Dentally API sync (appointments, plans, recalls) replacing CSV.
- Multi-channel sequences: SMS/email touches before/after call attempts.
- Diary white-space targeting.
- Auto-prioritisation (value × recency × reachability scoring).
- Call recording + QA review workflow.

## Data model (sketch)

- `patients_master` (id, ghl_contact_id, dentally_patient_id, identity fields,
  consent_marketing, do_not_contact, exclusions[])
- `segments` (id, name, definition_json, last_refreshed, count)
- `campaigns` (id, segment_id, script_ref, offer, agents[], status, calling_window,
  max_attempts)
- `call_tasks` (id, campaign_id, patient_id, priority, attempts, next_attempt_at,
  status)
- `call_outcomes` (id, call_task_id, agent_id, outcome, objection, note, booked_ref,
  created_at)

## Compliance notes
- Every dial checks consent + do-not-contact at call time (not just at segment build).
- Marketing-call rules (PECR): screen against TPS for numbers without consent; log the
  lawful basis used per campaign.
- Scripts referencing clinical history must stay within what a non-clinician may
  discuss; clinical questions route to a clinician callback.
- If calls are recorded: notice at call start, retention policy.

## Open questions
1. Who staffs the sweep team — existing TCOs, new hires, or per-practice?
2. Calling hours and max attempts policy?
3. Which segment do we pilot first? (Recommendation: `dna_or_cancelled` implants —
   smallest data-quality risk, highest value.)
4. Do we need TPS screening integration at MVP, or is our consent coverage sufficient?
