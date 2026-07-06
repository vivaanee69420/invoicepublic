const crypto = require('crypto');

function localISO(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function daysFrom(base, n) {
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localISO(d);
}

function id() {
  return crypto.randomUUID();
}

// Demo data so the board looks alive on first run. Dates are generated
// relative to the day the seed runs, so "today" is always populated.
function buildSeed() {
  const today = localISO();
  const yesterday = daysFrom(today, -1);
  const tomorrow = daysFrom(today, 1);
  const now = new Date().toISOString();

  const workspaces = [
    { id: 'fts', name: 'FTS', color: '#5B8DEF' },
    { id: 'gmdental', name: 'GM Dental', color: '#2FB380' },
    { id: 'plan4growth', name: 'Plan4Growth', color: '#E8833A' }
  ];

  // Staff push data with a personal key. The owner does NOT use a key — they
  // sign in with a password (OWNER_PASSWORD env var) and get a session cookie.
  const staff = [
    { id: id(), name: 'Priya', role: 'Front desk', workspace: 'gmdental', key: 'priya-demo-key' },
    { id: id(), name: 'Ramesh', role: 'Accounts', workspace: 'fts', key: 'ramesh-demo-key' },
    { id: id(), name: 'Sara', role: 'Marketing', workspace: 'plan4growth', key: 'sara-demo-key' }
  ];

  const tasks = [
    { title: 'Approve Q2 invoice batch (or push to Monday)', workspace: 'fts', due: today, priority: 1, pinned: true, assignee: 'Dr. Gaurav' },
    { title: 'Sign off supplier payment run', workspace: 'fts', due: today, priority: 2, assignee: 'Ramesh' },
    { title: 'Reconcile last week’s card settlements', workspace: 'fts', due: yesterday, priority: 2, assignee: 'Ramesh' },
    { title: 'Confirm insurance pre-auths for tomorrow’s crown cases', workspace: 'gmdental', due: today, priority: 1, pinned: true, assignee: 'Priya' },
    { title: 'Call back 3 patients on the recall list', workspace: 'gmdental', due: today, priority: 2, assignee: 'Priya' },
    { title: 'Order composite refills before stock runs out', workspace: 'gmdental', due: tomorrow, priority: 3 },
    { title: 'Give a firm yes/no on the partner collab video', workspace: 'plan4growth', due: today, priority: 1, pinned: true, assignee: 'Dr. Gaurav' },
    { title: 'Review July content calendar draft', workspace: 'plan4growth', due: tomorrow, priority: 2, assignee: 'Sara' },
    { title: 'Send updated campaign outline to the team', workspace: 'plan4growth', due: today, priority: 2, assignee: 'Sara' }
  ].map(t => ({
    id: id(), status: 'open', notes: '', createdBy: 'seed', createdAt: now,
    priority: 2, pinned: false, assignee: '', ...t
  }));

  const emails = [
    {
      subject: 'Repeat sponsor wants more placements this month',
      from: 'partnerships@brandco.com', workspace: 'plan4growth',
      snippet: 'Paid the last invoice and wants more slots this month.',
      action: 'Reply with how many slots you can take and your rate. Fast — they pay on time.',
      urgency: 'high', date: today
    },
    {
      subject: 'Q2 invoice ready for approval',
      from: 'accounts@fts.internal', workspace: 'fts',
      snippet: 'Q2 invoice is prepared and marked due today.',
      action: 'Approve or push to Monday.',
      urgency: 'high', date: today
    },
    {
      subject: 'Lab: crown shade confirmation needed',
      from: 'lab@dentalworks.com', workspace: 'gmdental',
      snippet: 'Two crown cases scheduled Monday need shade confirmation.',
      action: 'Confirm shades so the lab can start today.',
      urgency: 'normal', date: today
    },
    {
      subject: 'Partner tool pushing back on your decline',
      from: 'hello@partnertool.io', workspace: 'plan4growth',
      snippet: 'They are proposing a next collab video anyway.',
      action: 'Give a firm yes or no with a realistic timeline.',
      urgency: 'normal', date: today
    }
  ].map(e => ({ id: id(), handled: false, link: '', createdAt: now, ...e }));

  const events = [
    { title: 'Morning huddle — full team', date: today, start: '09:00', end: '09:20', workspace: 'gmdental' },
    { title: 'Sponsor check-in call', date: today, start: '09:30', end: '10:00', workspace: 'plan4growth' },
    { title: 'Lab call — crown cases', date: today, start: '12:00', end: '12:30', workspace: 'gmdental' },
    { title: 'Weekly planning', date: today, start: '15:00', end: '15:45', workspace: 'fts' }
  ].map(e => ({ id: id(), createdAt: now, ...e }));

  const summaries = [
    {
      member: 'Priya', workspace: 'gmdental', date: today,
      wins: 'Rebooked 4 of 5 cancellations; pre-auths for Monday submitted.',
      blockers: 'Insurance portal was down for an hour — 2 verifications pending.',
      tomorrow: 'Finish recall list calls; confirm lab pickups.'
    },
    {
      member: 'Ramesh', workspace: 'fts', date: yesterday,
      wins: 'Closed out June ledger; supplier statements matched.',
      blockers: 'Waiting on your sign-off for the payment run.',
      tomorrow: 'Prepare Q2 invoice batch for approval.'
    }
  ].map(s => ({ id: id(), submittedAt: now, ...s }));

  const notes = [
    {
      kind: 'meeting', title: 'Weekly planning — carry-overs', workspace: 'plan4growth', date: yesterday,
      body: 'Send the updated campaign outline before end of day. Book the follow-up for early next week and share the agenda. Confirm creative direction for the next two posts.'
    },
    {
      kind: 'announcement', title: 'Clinic hours change', workspace: 'gmdental', date: today,
      body: 'Saturday clinic starts at 10:00 from next week. Front desk to update the booking page and voicemail.'
    }
  ].map(n => ({ id: id(), createdAt: now, ...n }));

  return { workspaces, staff, tasks, emails, events, summaries, notes, sessions: {} };
}

module.exports = { buildSeed, localISO };

if (require.main === module) {
  const { save, DB_PATH } = require('./store');
  save(buildSeed());
  console.log('Seeded fresh database at', DB_PATH);
}
