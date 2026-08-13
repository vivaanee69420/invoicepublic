# GM Dental — Patient Growth Platform: System Specifications

This folder contains developer-ready specifications for the six software systems discussed
in the Space Dental partnership call (August 2026). The goal is to build our own in-house
versions of these systems for GM Dental's six practices, rather than depending on a
third-party partner.

## The six systems

| # | System | What it does | Spec |
|---|--------|--------------|------|
| 1 | Gold Card Referral App | Digital referral/loyalty card patients carry on their phone. QR-code sharing, referred-patient perks, cashback rewards for the referrer, referral pipeline dashboard for the practice. | [01-gold-card-referral-app.md](01-gold-card-referral-app.md) |
| 2 | Finance Waterfall Engine | Runs a patient's finance application through a configurable panel of lenders in sequence until one approves. Tracks declines and feeds the re-engagement engine. | [02-finance-waterfall.md](02-finance-waterfall.md) |
| 3 | Advanced Treatment Plan (In-House Payment Plans) | Internal instalment-plan system: deposit up front, monthly payments, treatment stages unlocked as payment milestones are reached, missed-payment chasing workflow. | [03-advanced-treatment-plan.md](03-advanced-treatment-plan.md) |
| 4 | Virtual TCO Platform | Video-consultation and remote treatment-planning tool: photo/scan upload, clinician review queue, fixed-price quoting, deal closing, hand-back to the treating practice. | [04-virtual-tco-platform.md](04-virtual-tco-platform.md) |
| 5 | Patient Re-Engagement Engine ("Sweep") | Segments the practice CRM (~20,000 patients) into actionable call lists: finance declines, non-converters, DNAs/cancellations, upsell candidates. Call outcomes, objection tracking, rebooking. | [05-patient-reengagement-engine.md](05-patient-reengagement-engine.md) |
| 6 | Dental Comparison Directory | Public "compare the dentist" style marketplace: practice profiles, verified/premium tiers, treatment-and-location search, lead routing with contact-SLA rules, subscription billing. | [06-dental-comparison-directory.md](06-dental-comparison-directory.md) |

## Recommended build order

1. **Patient Re-Engagement Engine (5)** — fastest revenue win, works off data we already
   have, no external integrations beyond the CRM. Space Dental's whole "quick wins" pitch
   is this system.
2. **Gold Card Referral App (1)** — zero-marketing-cost lead generation; standalone,
   low regulatory surface.
3. **Advanced Treatment Plan (3)** — recovers patients who fail all lender finance; needs
   payment provider + legal review of plan terms.
4. **Virtual TCO Platform (4)** — needs clinical governance sign-off; can start as a
   lightweight booking + upload flow.
5. **Finance Waterfall (2)** — highest regulatory burden (FCA credit broking); build the
   tracking/CRM side first, add lender API integrations as agreements are signed.
6. **Comparison Directory (6)** — largest standalone product; only worth building if we
   want to operate it as its own business.

## Existing stack (must integrate with)

- **Dentally** — practice management / clinical charting. Has a public REST API
  (patients, appointments, treatment plans). Clinicians chart here; TCOs read charts here.
- **GoHighLevel (GHL)** — CRM, marketing automation, call/SMS. Has REST API + webhooks.
  This is where leads, pipelines, and communication history live today.
- Six practice sites (Kent / SE London / Sussex), ~25 clinicians, ~240 new consults/month,
  ~70% conversion. Roughly 20,000 patient records in the CRM.

## Shared infrastructure (build once, use everywhere)

- **Identity & roles**: patient, referrer, TCO/sales agent, clinician, practice manager,
  group admin. Single sign-on across the internal tools.
- **Patient master record**: one patient ID that links CRM (GHL), clinical record
  (Dentally), finance applications, payment plans, and referrals. Systems 1–5 all hang
  off this.
- **Messaging service**: transactional email + SMS (and later WhatsApp) with template
  management and consent checking. Used by every system.
- **Audit log**: append-only event log of every patient contact, finance application,
  payment, and consent — needed for FCA/GDPR/GDC evidence across all systems.
- **Dashboards**: per-practice and group-level reporting (referrals by stage, finance
  approval rates, plan arrears, re-engagement conversion, diary white-space).

## Compliance requirements that shape the software (not optional)

These came up on the call and must be designed in from day one — flag each to our
solicitor before the relevant system goes live:

- **FCA / consumer credit**: introducing patients to lender finance is regulated credit
  broking. The waterfall engine (2) must record permissions basis, creditworthiness
  information, and every application outcome. Sequential applications to progressively
  higher-APR lenders have affordability-rule implications. The in-house instalment plan
  (3) may itself be a regulated credit agreement depending on term/charges — legal review
  determines the product shape before code is written.
- **GDPR / UK DPA**: re-engagement calling (5) and referral marketing (1) need recorded
  lawful basis and consent flags on every contact; data sharing with any third party
  needs a DPA. Build consent as a first-class field, not an afterthought.
- **GDC / clinical governance**: remote treatment planning (4) needs clinician sign-off
  steps, records of what evidence (photos, scans, radiographs) each plan was based on,
  and a defined refund/unsuitability pathway.
- **Call recording**: if sales calls are recorded, notice + retention policy required.

## What "done" looks like

Each spec defines an MVP scope and a Phase 2 scope. MVP across systems 5, 1 and 3 is the
target for the first release. Every spec ends with open questions that need a business or
legal decision before that part is built.
