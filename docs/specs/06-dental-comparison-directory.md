# 06 — Dental Comparison Directory ("Compare the Dentist" equivalent)

## What it is (from the call)

Space Dental's consumer-facing marketplace: a nationwide "compare the dentist" website
they drive £200–300k of patient-facing marketing into. Mechanics described on the call:

- Patients browse practices "like booking.com": profiles with reviews, testimonials,
  videos, pricing, treatment specialisms, filtered by treatment + location.
- **Verified/premium practices** rank at the top of listings and can fully edit their
  profile (pricing, treatments, media).
- When a patient inquires on a practice's profile, the practice gets the lead by email
  and has **48 hours to contact** the patient; if not contacted, the lead reverts to
  the site operator. If no consultation is booked within **2 weeks**, the lead also
  reverts. (Their framing: patient protection; the effect: unworked leads become theirs.)
- Commercials: 6-month free trial, then roughly £100/week–£100/month depending on
  volume (their numbers were inconsistent on the call — pricing is ours to define).
- SEO/AI angle: verified practices get a **backlink** to boost Google and
  LLM-recommendation visibility ("ChatGPT recommends X in Kent").

This is the largest system and it is a *business*, not a feature — only build it if we
want to operate a consumer marketplace ourselves (e.g. starting with Kent/SE where we
already dominate). Everything in systems 1–5 works without it.

## User roles

| Role | What they do |
|------|--------------|
| Consumer (patient) | Searches by treatment + location, compares practices, reads reviews, submits an inquiry. |
| Practice user | Claims/edits their profile, receives leads, updates lead status (contacted/booked), manages subscription. |
| Operator admin (us) | Verifies practices, moderates content/reviews, configures ranking rules, monitors lead SLAs, manages billing. |

## Core flows

### A. Consumer search & inquiry
1. Landing pages by treatment × location ("dental implants Kent") — programmatic SEO
   pages with genuine content, plus a search UI (treatment, postcode radius, filters:
   price range, finance available, rating).
2. Listing results ranked by: tier (verified first) → relevance → rating. Ranking rules
   must be disclosed on-site (CMA guidance on ranking transparency for comparison sites).
3. Practice profile: photos, treatments + indicative pricing, clinician bios, reviews,
   videos, accreditations, finance options.
4. Inquiry form: name, contact, treatment, timing, consent. Confirmation to patient;
   lead delivered to practice (email + dashboard + webhook).

### B. Lead SLA engine
- Lead states: `new → contacted → consultation_booked → attended → converted` plus
  `expired_uncontacted` and `expired_unbooked`.
- Timers: if not marked `contacted` within the SLA window (configurable, e.g. 48h),
  automated reminders fire, then the lead flags for operator follow-up. **Our version's
  policy decision:** what "reversion" means for us — we may simply follow up centrally
  to protect the patient, rather than claiming the lead commercially. The engine is the
  same either way; the policy is configuration.
- All state changes timestamped for dispute resolution.

### C. Practice onboarding & verification
1. Practice claims profile → operator verification checklist (GDC registration of named
   clinicians, CQC registration, indemnity confirmation) → `verified` badge.
2. Tiering: free listing (basic info) vs. verified/premium (full profile editing, top
   placement, backlink, lead volume). Trial → paid subscription (Stripe Billing).

## Functional requirements

### MVP (single-region launch)
- Practice profiles + treatment/location search with map + radius.
- Programmatic landing pages (treatment × town) with proper metadata/schema.org
  (`Dentist`, `MedicalClinic`, review markup).
- Inquiry capture + lead delivery (email + practice dashboard) + SLA timers +
  reminder automation.
- Practice dashboard: leads with status updates, profile editing, media upload.
- Operator admin: verification workflow, content moderation, ranking config, SLA
  monitoring.
- Review system: verified-patient reviews (invite link post-treatment), moderation
  queue, right-of-reply. No fabricated or imported-without-consent reviews.
- Subscription billing: free trial → paid tier (Stripe Billing), per-practice.

### Phase 2
- Consumer accounts (save comparisons, track inquiry).
- Booking integration (real diary slots via practice PMS APIs).
- Lead marketplace analytics for practices (source, conversion benchmarking).
- AI-visibility work: structured data, llms.txt, citations content — the honest version
  of the "ChatGPT recommends" pitch.
- Multi-region rollout.

## Data model (sketch)

- `practices` (id, name, locations[], tier, verified, verification_evidence,
  subscription_status)
- `profiles` (practice_id, description, treatments[], pricing[], media[], clinicians[])
- `leads` (id, practice_id, consumer contact, treatment, status, sla_deadline_at,
  state_history[])
- `reviews` (id, practice_id, patient_verified, rating, text, status, reply)
- `subscriptions` (practice_id, plan, trial_ends_at, stripe_ref)

## Compliance notes
- CMA comparison-site guidance: ranking criteria disclosure, no fake urgency, clear
  paid-placement labelling.
- GDC advertising standards apply to profile claims; operator moderation is our
  liability shield.
- Review authenticity rules (DMCC Act 2024 bans fake reviews — verification workflow is
  legally required, not nice-to-have).
- Lead data: we are controller for consumer data; DPAs with every receiving practice.

## Open questions
1. Do we actually want to operate this as a business, or is it out of scope for now?
   (Recommendation: park until systems 1–5 are live; revisit as a Kent-first launch.)
2. If built: does an unworked lead revert to central follow-up, and under what wording
   to the consumer?
3. Brand: run under GM Dental or a neutral consumer brand?
