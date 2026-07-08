# Lead & Marketing Tracker

A simple, self-hosted dashboard for tracking **every lead from every source** —
Facebook, Google Ads, Instagram, SEO, exhibitions/events, leaflets, referrals,
care homes, other businesses, walk-ins and anything else — plus your **daily ad
spend** (in £), so you can see exactly which platform is working and which is
burning money.

Built for a team: everyone opens the same page, adds leads and spend as they
come in, and the dashboard updates from a single shared database.

## What you get

- **Dashboard** — total leads, consultations, treatments booked, conversion
  rate, ad spend, cost per lead, cost per treatment, revenue and return on
  spend (ROAS), scoped to any date range:
  - Daily leads trend
  - Leads by source
  - Conversion funnel (New → Contacted → Consultation → Treatment)
  - Spend vs revenue per paid platform
  - Per-source performance table — cost/lead, conversion %, cost/treatment,
    revenue and return for every channel, with the winners and losers marked
- **Leads tab** — one form your whole team fills for every enquiry: date,
  name, phone, source, business, campaign/ad, treatment/service interest,
  quoted & final £ value, status, follow-up date, who entered it, notes.
  Update a lead's status right from the table as it moves through the funnel.
- **Business filter** — tag every lead and spend entry with which business it
  belongs to, then divide the whole dashboard per business with one dropdown.
- **Ad Spend tab** — enter what you spent per platform per day. This is what
  powers cost-per-lead and ROI, so make it a daily habit.
- **CSV export** for both leads and spend (opens in Excel / Google Sheets).
- Works on phones and desktops, light and dark mode.

## Requirements

- Node.js **22 or newer** — nothing else. Zero npm dependencies.

## Run it

```bash
npm start            # serves http://localhost:3000
```

Optional — load ~45 days of sample data first, to see the dashboard working:

```bash
npm run seed
npm start
```

To let the whole clinic/office use it, run it on one machine (or a small cloud
VM) and share the address, e.g. `http://192.168.1.50:3000` on your office
Wi-Fi. Change the port with `PORT=8080 npm start`.

> **Note:** there is no login. Run it on a private network (office LAN or
> behind a VPN), not on the open internet. If you need it internet-facing,
> put it behind a reverse proxy with basic auth.

## Data & backups

All data lives in a single file: `data/tracker.db` (SQLite). Back it up by
copying that file anywhere safe. Delete it to start fresh.

## Daily routine that makes this work

1. Every enquiry — call, walk-in, DM, form fill — goes in as a **lead** with
   the right **source** the moment it arrives.
2. Whoever runs the ads enters the day's **spend per platform** each evening.
3. As leads progress, update their **status** (and the final £ value once a
   treatment is booked) straight from the Leads table.
4. Check the dashboard weekly: the **Source performance** table tells you
   which platform earns more than it costs (green ×) and which doesn't (red ×).
