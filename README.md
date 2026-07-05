# My Planner — unified daily dashboard

An xtiles-style daily board that pulls **emails, tasks, meetings, notes and team
daily summaries from every workspace you run** (FTS, GM Dental, Plan4Growth — and
any new one you invent) onto one page. Staff push updates from their own portal
or from scripts, and the board updates live.

![Owner dashboard](docs/dashboard.png)

## The two sides

| Page | Who | What |
|---|---|---|
| `/` (index.html) | You | The board: Daily Digest, Top 3 Priorities, unified Tasks, Important Emails, Team Daily Summaries, Today's Workload with free blocks, Meeting Notes, Announcements |
| `/staff.html` | Your team | Sign in with a personal API key, then submit daily summaries, flag emails that need you, add tasks/events/notes — each lands on your board instantly |

## Quick start

```bash
npm install
npm start          # http://localhost:3000
```

The first run seeds a demo database (`data/db.json`) with the three workspaces
and demo staff. Reset it any time with `npm run seed`.

### Demo API keys (change before real use)

| Person | Role | Key |
|---|---|---|
| Dr. Gaurav | owner | `owner-demo-key` |
| Priya | Front desk (GM Dental) | `priya-demo-key` |
| Ramesh | Accounts (FTS) | `ramesh-demo-key` |
| Sara | Marketing (Plan4Growth) | `sara-demo-key` |

Keys live in `data/db.json` under `staff` — edit that file to rename people,
change keys, or add team members. Every write to the API requires a valid key in
the `x-api-key` header; reading the board is open (put the app behind your own
auth/VPN if you deploy it publicly).

## What makes the board smart

- **Daily Digest** — auto-generated every refresh: emails needing you, meetings,
  tasks due, overdue count, how many team updates are in, plus a one-line read of
  the day.
- **Top 3 Priorities** — computed, not hand-picked: pinned tasks first, then
  P1s due soonest, overdue floats up.
- **Unified Tasks** — one list across all workspaces with colour-coded tags,
  grouped Overdue / Due today / Coming up / Done, progress bar and quick-add.
- **Team Daily Summaries** — what each member shipped, blockers, tomorrow's plan;
  shows who you're still waiting on. Resubmitting replaces that day's entry.
- **Today's Workload** — bookings plus computed free blocks (gaps ≥ 45 min
  between 08:00–18:00) so you can protect deep-work time.
- **Live** — the board listens on a server-sent-events stream; anything a staff
  member or script pushes shows up without a refresh (90 s polling as fallback).
- **Day navigation & workspace filter** — flip between days, or filter every tile
  to a single business with one chip.
- Dark mode follows your system setting; layout works on a phone.

## Push API — connect your other dashboards

Anything that can send an HTTP request can feed this board: your FTS system,
GM Dental practice software exports, Plan4Growth tools, Zapier/Make, a Google
Apps Script watching a Gmail label, or a cron job.

`POST /api/push` with header `x-api-key: <key>`. Body is one item or an array.
Unknown workspaces are created automatically.

```bash
# a task
curl -X POST https://your-host/api/push \
  -H 'Content-Type: application/json' -H 'x-api-key: priya-demo-key' \
  -d '{"type":"task","data":{"title":"Call lab about crown case","workspace":"gmdental","due":"2026-07-06","priority":1,"pinned":false,"assignee":"Priya"}}'

# an email that needs a decision
curl -X POST https://your-host/api/push \
  -H 'Content-Type: application/json' -H 'x-api-key: ramesh-demo-key' \
  -d '{"type":"email","data":{"subject":"Q2 invoice approval","from":"accounts@fts","snippet":"Batch ready","action":"Approve or push to Monday","urgency":"high","link":"https://mail.google.com/...","workspace":"fts"}}'

# a daily summary (one per member per day — resubmit to replace)
curl -X POST https://your-host/api/push \
  -H 'Content-Type: application/json' -H 'x-api-key: sara-demo-key' \
  -d '{"type":"summary","data":{"wins":"Campaign draft done","blockers":"Waiting on ad budget sign-off","tomorrow":"Launch A/B test"}}'

# batch: an event + a note in one call
curl -X POST https://your-host/api/push \
  -H 'Content-Type: application/json' -H 'x-api-key: owner-demo-key' \
  -d '[{"type":"event","data":{"title":"Lab call","date":"2026-07-06","start":"12:00","end":"12:30","workspace":"gmdental"}},
       {"type":"note","data":{"kind":"announcement","title":"New Saturday hours","body":"Clinic opens 10:00 from next week"}}]'
```

### Full API

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/board?date=YYYY-MM-DD` | none | Everything the board renders for that day |
| `POST /api/push` | key | Create `task` / `email` / `summary` / `event` / `note` (single or batch) |
| `PATCH /api/tasks/:id` | key | `{"status":"done"\|"open"}` and/or `{"pinned":true}` |
| `PATCH /api/emails/:id` | key | `{"handled":true}` |
| `GET /api/me` | key | Who a key belongs to |
| `GET /api/stream` | none | Server-sent events; fires on every change |

Field notes: `priority` is 1 (must) / 2 (should) / 3 (nice); dates are
`YYYY-MM-DD`; times are `HH:MM`; `urgency` is `high`/`normal`/`low`;
`note.kind` is `meeting` or `announcement`. If `workspace` is omitted the
sender's home workspace is used.

### Gmail auto-feed idea

In Gmail, create a label like `Needs-Doctor`. A small Google Apps Script
time-trigger can scan the label and forward each thread to `/api/push` as an
`email` item (subject, sender, snippet, link), then remove the label. Your board
becomes the one inbox that only ever shows decisions.

## Architecture

- `server.js` — Express API + static hosting + SSE broadcast
- `lib/store.js` — JSON file persistence (`data/db.json`, atomic writes)
- `lib/seed.js` — demo data, regenerated relative to today
- `public/` — owner board (`index.html`, `app.js`) and staff portal
  (`staff.html`, `staff.js`), plain HTML/CSS/JS, no build step

Single small Node process, one JSON file, deployable on any $5 VPS,
Render/Railway free tier, or a spare machine at the clinic.
