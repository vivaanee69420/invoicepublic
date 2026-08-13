# 04 — Virtual TCO Platform (Video Consultations & Remote Treatment Planning)

## What it is (from the call)

Space Dental's "virtual TCO" (treatment-coordinator) service works two ways:

1. **Dial-in rescue**: a patient is in the chair at a partner practice and fails
   finance / can't afford the terms. The practice starts a video call with a central
   TCO who runs alternative finance options live, so the patient is saved before they
   walk out.
2. **Remote consultation & closing**: for re-engaged leads (DNAs, cancelled consults,
   web inquiries), a TCO offers a video call instead of an in-person visit
   (their estimate: 50–60% choose video). On the call, the patient's photos are
   collected ("drag and drop" upload), digital scans/x-rays from previous consults can
   be uploaded if the patient has them, a lead clinician reviews the case, and the TCO
   presents a **fixed-price** plan and closes the deal — the patient is then handed to
   the treating practice.

Our version: a scheduling + video + case-file + quoting tool used by our own TCO team
across the six practices.

> **⚠️ Clinical governance gate:** any treatment plan sold remotely must carry a named
> clinician's review, an explicit record of what evidence it was based on (photos only
> vs. scans vs. radiographs), and a defined pathway for "patient found unsuitable at
> the in-person assessment" (re-plan or refund). The software enforces this by making
> clinician sign-off a required step before a quote can be issued. GDC remote-consult
> guidance applies — clinical lead to sign off the workflow before launch.

## User roles

| Role | What they do |
|------|--------------|
| Patient | Books/joins a video call from a link (no app install), uploads photos/records, reviews and accepts a quote, pays a deposit. |
| TCO | Runs the calendar, hosts calls, builds the case file, requests clinician review, presents quotes, closes. |
| Reviewing clinician | Works a review queue: examines uploaded evidence + chart notes, records suitability opinion, approves or amends the draft plan. |
| Practice TCO (dial-in mode) | Starts an instant call from the practice, shares patient context, hands the patient over. |
| Admin | Fixed-price catalogue management, conversion reporting. |

## Core flows

### A. Booked video consultation
1. Patient books from a link (offered on re-engagement calls or web inquiries): picks a
   slot, gets confirmation + reminders (email/SMS) with the join link.
2. Pre-call: patient gets an upload link — guided photo capture (front smile, left,
   right, upper, lower — with example images), plus optional upload of existing x-rays
   /scans/treatment plans from other providers.
3. Call happens in-browser (WebRTC — e.g. Daily/Whereby embed or Twilio Video at MVP;
   no native app). TCO has the case file side-by-side with the video.
4. TCO drafts the treatment options from the fixed-price catalogue; flags anything
   needing add-ons (extractions, bone graft — included/excluded per catalogue rules).
5. **Clinician review**: draft plan + evidence goes to the review queue. Clinician
   records: suitability opinion, evidence relied on, amendments. Only after approval can
   the quote be issued.
6. Quote presented (on the call or by link): fixed price, what's included, finance /
   payment-plan options (Systems 02/03 hooked in here). Patient accepts + pays deposit.
7. Handoff: case file, quote, and deposit record pushed to the treating practice
   (Dentally appointment + GHL opportunity updated). If the in-person assessment finds
   the patient unsuitable → structured refund/re-plan flow.

### B. Dial-in rescue (in-practice)
1. Practice user hits "Request TCO now" → creates an instant call with patient context
   attached (treatment plan, amount, which lenders already declined).
2. Available central TCO claims it, joins, works alternative finance (System 02) or the
   payment plan (System 03) live.
3. Outcome recorded against the patient: saved (which product) / follow-up / lost.

## Functional requirements

### MVP
- Booking calendar with TCO availability, reminders, browser-based video calls.
- Guided photo upload + document upload; case file per patient (images, docs, notes,
  consent records).
- Fixed-price treatment catalogue (per treatment: price, inclusions, exclusions,
  add-on rules).
- Quote builder → clinician review queue (hard gate) → quote issue → accept + deposit
  payment (Stripe payment link at MVP).
- Dial-in instant-call queue with context handoff.
- Outcome tracking + conversion dashboard (booked → attended → quoted → accepted).
- Handoff records to practice (MVP: email/GHL task; Phase 2: Dentally API).

### Phase 2
- Dentally integration: pull chart/treatment-plan context; push appointments.
- E-signature on treatment plan consent.
- Recording of calls (with notice) attached to the case file.
- Intraoral-scan file support (STL viewers) if we start accepting scans.
- Patient self-serve portal for quote review, finance application, and deposit.

## Data model (sketch)

- `consultations` (id, patient_ref, type: booked|dial_in, practice_id, tco_id,
  scheduled_at, status, outcome, lost_reason)
- `case_files` (id, patient_ref, consultation_id) + `case_assets` (id, case_file_id,
  kind: photo|xray|scan|doc, storage_ref, uploaded_by, captured_guidance_step)
- `catalogue_items` (id, treatment, price, inclusions, exclusions, active)
- `quotes` (id, consultation_id, items[], total, status: draft|in_review|approved|
  issued|accepted|declined|refunded, reviewing_clinician_id, review_note,
  evidence_basis, issued_at, accepted_at)
- `deposits` (id, quote_id, amount, provider_ref, status)

## Compliance notes
- Clinical images are special-category health data: encrypt at rest, UK-region storage,
  strict access control, retention policy aligned with clinical-record rules.
- The review step must capture *what the clinician saw* (evidence list is part of the
  approval record).
- Refund pathway for unsuitable patients is a first-class flow, not a manual workaround.
- Video platform must be capable of a UK/EU data-processing agreement.

## Open questions
1. Which treatments are permitted for remote quoting at launch (implants only? aligners
   too?), and what evidence is mandatory per treatment?
2. Deposit amount and refund terms on unsuitability?
3. Do we record calls?
4. Who staffs the central TCO team and what hours does dial-in cover?
