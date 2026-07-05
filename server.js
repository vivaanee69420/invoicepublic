const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { load, save } = require('./lib/store');
const { localISO } = require('./lib/seed');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let db = load();

// ---------------------------------------------------------------- live updates
const sseClients = new Set();

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('data: {"type":"hello"}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function persist() {
  save(db);
  const msg = `data: ${JSON.stringify({ type: 'update', at: new Date().toISOString() })}\n\n`;
  for (const res of sseClients) res.write(msg);
}

// ---------------------------------------------------------------------- auth
function auth(req, res, next) {
  const key = req.get('x-api-key') || req.query.key;
  const staff = db.staff.find(s => s.key === key);
  if (!staff) {
    return res.status(401).json({ error: 'Invalid or missing API key. Send it in the x-api-key header.' });
  }
  req.staff = staff;
  next();
}

app.get('/api/me', auth, (req, res) => {
  const { id, name, role, workspace } = req.staff;
  res.json({ id, name, role, workspace });
});

// -------------------------------------------------------------------- ingest
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'general';
}

function ensureWorkspace(ws) {
  if (!ws) return 'general';
  const wsId = slug(ws);
  if (!db.workspaces.some(w => w.id === wsId)) {
    const palette = ['#8B5CF6', '#D9486E', '#0EA5A4', '#B7791F', '#5B8DEF'];
    db.workspaces.push({
      id: wsId,
      name: String(ws).trim(),
      color: palette[db.workspaces.length % palette.length]
    });
  }
  return wsId;
}

function reqStr(data, field) {
  const v = data[field];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`"${field}" is required`);
  return v.trim();
}

const CREATORS = {
  task: (d, staff) => ({
    id: crypto.randomUUID(),
    title: reqStr(d, 'title'),
    workspace: ensureWorkspace(d.workspace || staff.workspace),
    due: d.due || null,
    priority: [1, 2, 3].includes(d.priority) ? d.priority : 2,
    pinned: !!d.pinned,
    status: 'open',
    assignee: d.assignee || staff.name,
    notes: d.notes || '',
    createdBy: staff.name,
    createdAt: new Date().toISOString()
  }),
  email: (d, staff) => ({
    id: crypto.randomUUID(),
    subject: reqStr(d, 'subject'),
    from: d.from || '',
    workspace: ensureWorkspace(d.workspace || staff.workspace),
    snippet: d.snippet || '',
    action: d.action || '',
    urgency: ['high', 'normal', 'low'].includes(d.urgency) ? d.urgency : 'normal',
    link: d.link || '',
    date: d.date || localISO(),
    handled: false,
    createdBy: staff.name,
    createdAt: new Date().toISOString()
  }),
  summary: (d, staff) => ({
    id: crypto.randomUUID(),
    member: d.member || staff.name,
    workspace: ensureWorkspace(d.workspace || staff.workspace),
    date: d.date || localISO(),
    wins: d.wins || '',
    blockers: d.blockers || '',
    tomorrow: d.tomorrow || '',
    submittedAt: new Date().toISOString()
  }),
  event: (d, staff) => ({
    id: crypto.randomUUID(),
    title: reqStr(d, 'title'),
    date: d.date || localISO(),
    start: d.start || '',
    end: d.end || '',
    workspace: ensureWorkspace(d.workspace || staff.workspace),
    createdBy: staff.name,
    createdAt: new Date().toISOString()
  }),
  note: (d, staff) => ({
    id: crypto.randomUUID(),
    kind: d.kind === 'announcement' ? 'announcement' : 'meeting',
    title: reqStr(d, 'title'),
    body: d.body || '',
    workspace: ensureWorkspace(d.workspace || staff.workspace),
    date: d.date || localISO(),
    createdBy: staff.name,
    createdAt: new Date().toISOString()
  })
};

const COLLECTIONS = { task: 'tasks', email: 'emails', summary: 'summaries', event: 'events', note: 'notes' };

// Staff apps / other dashboards push items here. Accepts one item or a batch.
app.post('/api/push', auth, (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const created = [];
  try {
    for (const item of items) {
      const type = item && item.type;
      if (!CREATORS[type]) {
        throw new Error(`"type" must be one of: ${Object.keys(CREATORS).join(', ')}`);
      }
      const record = CREATORS[type](item.data || {}, req.staff);
      // one summary per member+workspace+date — a resubmission replaces it
      if (type === 'summary') {
        db.summaries = db.summaries.filter(
          s => !(s.member === record.member && s.workspace === record.workspace && s.date === record.date)
        );
      }
      db[COLLECTIONS[type]].push(record);
      created.push({ type, id: record.id });
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  persist();
  res.status(201).json({ created });
});

app.patch('/api/tasks/:id', auth, (req, res) => {
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (req.body.status === 'done' || req.body.status === 'open') {
    task.status = req.body.status;
    task.completedAt = req.body.status === 'done' ? new Date().toISOString() : null;
  }
  if (typeof req.body.pinned === 'boolean') task.pinned = req.body.pinned;
  persist();
  res.json(task);
});

app.patch('/api/emails/:id', auth, (req, res) => {
  const email = db.emails.find(e => e.id === req.params.id);
  if (!email) return res.status(404).json({ error: 'Email not found' });
  if (typeof req.body.handled === 'boolean') email.handled = req.body.handled;
  persist();
  res.json(email);
});

// --------------------------------------------------------------------- board
function taskSortScore(t, date) {
  let s = t.pinned ? 0 : 100;
  s += (t.priority || 2) * 10;
  if (!t.due) s += 8;
  else if (t.due < date) s -= 5; // overdue floats up
  else if (t.due > date) s += 5;
  return s;
}

function buildDigest(date, tasks, emails, events, summaries) {
  const open = tasks.filter(t => t.status === 'open');
  const overdue = open.filter(t => t.due && t.due < date).length;
  const dueToday = open.filter(t => t.due === date).length;
  const emailsNeedAction = emails.filter(e => !e.handled).length;
  const meetings = events.length;
  const activeStaff = db.staff.filter(s => s.role !== 'owner');
  const summariesIn = summaries.length;

  let oneLiner;
  if (overdue > 0) {
    oneLiner = `${overdue} task${overdue > 1 ? 's' : ''} slipped past ${overdue > 1 ? 'their' : 'its'} date — clear those first so today doesn’t pile on top.`;
  } else if (meetings >= 3) {
    oneLiner = 'Meeting-heavy day — protect one clean block for the priorities before the calendar fills.';
  } else if (emailsNeedAction >= 3) {
    oneLiner = 'The inbox is where today is won: a few fast decisions will unblock everything else.';
  } else {
    oneLiner = 'Light day on paper — a good one to bank progress on the top priorities.';
  }

  return {
    generatedAt: new Date().toISOString(),
    emailsNeedAction,
    meetings,
    dueToday,
    overdue,
    summariesIn,
    staffTotal: activeStaff.length,
    oneLiner
  };
}

app.get('/api/board', (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : localISO();

  const tasks = db.tasks.filter(t =>
    t.status === 'open' || (t.completedAt || '').slice(0, 10) === date
  );
  const emails = db.emails.filter(e => !e.handled || e.date === date);
  const events = db.events.filter(e => e.date === date).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const summaries = db.summaries.filter(s => s.date === date).sort((a, b) => a.member.localeCompare(b.member));
  const meetingNotes = db.notes.filter(n => n.kind === 'meeting' && n.date <= date).slice(-3).reverse();
  const announcements = db.notes.filter(n => n.kind === 'announcement').slice(-5).reverse();

  const priorities = tasks
    .filter(t => t.status === 'open')
    .sort((a, b) => taskSortScore(a, date) - taskSortScore(b, date))
    .slice(0, 3);

  res.json({
    date,
    today: localISO(),
    workspaces: db.workspaces,
    staff: db.staff.map(({ id, name, role, workspace }) => ({ id, name, role, workspace })),
    digest: buildDigest(date, tasks, emails, events, summaries),
    priorities,
    tasks,
    emails,
    events,
    summaries,
    meetingNotes,
    announcements
  });
});

app.listen(PORT, () => {
  console.log(`Unified dashboard running at http://localhost:${PORT}`);
  console.log(`Staff portal at http://localhost:${PORT}/staff.html`);
});
