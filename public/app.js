/* Unified xtiles-style dashboard */

const state = {
  date: localISO(),
  ws: 'all',        // workspace filter
  board: null,
  key: localStorage.getItem('dash_key') || '',
  who: ''
};

// ------------------------------------------------------------------ helpers
function localISO(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function shiftDate(iso, days) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return localISO(d);
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function ws(id) {
  return (state.board?.workspaces || []).find(w => w.id === id) || { id, name: id, color: '#999' };
}
function wsTag(id) {
  const w = ws(id);
  return `<span class="ws-tag"><span class="swatch" style="background:${esc(w.color)}"></span>${esc(w.name)}</span>`;
}
function inWs(item) {
  return state.ws === 'all' || item.workspace === state.ws;
}

// --------------------------------------------------------------------- data
async function loadBoard() {
  const res = await fetch(`/api/board?date=${state.date}`);
  state.board = await res.json();
  render();
}

async function api(method, url, body) {
  if (!state.key) { openKeyDialog(); throw new Error('no key'); }
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': state.key },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) { openKeyDialog(); throw new Error('bad key'); }
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}

// -------------------------------------------------------------------- tiles
function tile(cls, emoji, title, sub, bodyHtml, count) {
  return `<section class="tile ${cls}">
    <h2><span>${emoji}</span> ${esc(title)} ${count != null ? `<span class="count">${count}</span>` : ''}</h2>
    ${sub ? `<p class="sub">${sub}</p>` : ''}
    ${bodyHtml}
  </section>`;
}

function dueBadge(t) {
  if (!t.due) return '';
  if (t.due < state.board.today && t.status === 'open') return `<span class="badge overdue">overdue · ${fmtDate(t.due)}</span>`;
  if (t.due === state.board.today) return `<span class="badge today">today</span>`;
  return `<span class="badge">${fmtDate(t.due)}</span>`;
}

function taskRow(t) {
  return `<li class="${t.status === 'done' ? 'done' : ''}">
    <div class="row">
      <input type="checkbox" class="check" data-task="${t.id}" ${t.status === 'done' ? 'checked' : ''} />
      <div class="grow">
        <div class="title">${t.pinned ? '📌 ' : ''}${esc(t.title)}</div>
        <div class="meta">${wsTag(t.workspace)} ${dueBadge(t)} ${t.assignee ? esc(t.assignee) : ''}</div>
      </div>
    </div>
  </li>`;
}

function digestTile(d) {
  const b = state.board;
  const tasks = b.tasks.filter(inWs).filter(t => t.status === 'open');
  const overdue = tasks.filter(t => t.due && t.due < b.today).length;
  const dueToday = tasks.filter(t => t.due === state.date).length;
  const emails = b.emails.filter(inWs).filter(e => !e.handled).length;
  const meetings = b.events.filter(inWs).length;

  const stats = [
    `${emails} email${emails === 1 ? '' : 's'} need you`,
    `${meetings} meeting${meetings === 1 ? '' : 's'}`,
    `${dueToday} task${dueToday === 1 ? '' : 's'} due`,
    overdue ? `⚠️ ${overdue} overdue` : null,
    `${d.summariesIn}/${d.staffTotal} team updates in`
  ].filter(Boolean).join(' · ');

  const genTime = new Date(d.generatedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return tile('t-yellow', '🌞', `Daily Digest — ${fmtDate(state.date)}`,
    'Your whole day pulled together. Scan top to bottom, tap anything to act on it.',
    `<p class="digest-stats">${esc(stats)}</p>
     <p class="digest-one">${esc(d.oneLiner)}</p>
     <p class="digest-line">Updated ${esc(genTime)} · refreshes live as the team pushes updates</p>`);
}

function prioritiesTile() {
  const items = state.board.priorities.filter(inWs);
  const body = items.length
    ? `<ul class="items">${items.map((t, i) => `<li class="${t.status === 'done' ? 'done' : ''}">
        <div class="row">
          <span class="prio-num">${i + 1}</span>
          <input type="checkbox" class="check" data-task="${t.id}" ${t.status === 'done' ? 'checked' : ''} />
          <div class="grow">
            <div class="title"><b>${esc(t.title)}</b></div>
            <div class="meta">${wsTag(t.workspace)} ${dueBadge(t)}</div>
          </div>
        </div>
      </li>`).join('')}</ul>`
    : `<div class="empty">Nothing urgent — enjoy it.</div>`;
  return tile('t-pink', '🔥', 'Top 3 Priorities',
    'The three that move the needle today. If nothing else gets done, do these.', body);
}

function tasksTile() {
  const b = state.board;
  const all = b.tasks.filter(inWs);
  const open = all.filter(t => t.status === 'open');
  const done = all.filter(t => t.status === 'done');
  const overdue = open.filter(t => t.due && t.due < b.today);
  const today = open.filter(t => t.due === state.date && !(t.due < b.today));
  const later = open.filter(t => !overdue.includes(t) && !today.includes(t));

  const total = open.length + done.length;
  const pct = total ? Math.round((done.length / total) * 100) : 0;

  const group = (label, arr) => arr.length
    ? `<div class="group-label">${label}</div><ul class="items">${arr.map(taskRow).join('')}</ul>`
    : '';

  const wsOptions = b.workspaces.map(w =>
    `<option value="${esc(w.id)}" ${state.ws === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('');

  return tile('t-ivory', '✅', 'Tasks',
    'Everything open across all your dashboards, in one list.',
    `<div class="progress"><div style="width:${pct}%"></div></div>
     <p class="sub">${done.length}/${total} done today (${pct}%)</p>
     ${group('⚠️ Overdue', overdue)}
     ${group('Due today', today)}
     ${group('Coming up / anytime', later)}
     ${group('Done', done)}
     ${!total ? '<div class="empty">No tasks yet.</div>' : ''}
     <form class="quickadd" id="quickAdd">
       <input type="text" id="qaTitle" placeholder="Quick add a task…" required />
       <select id="qaWs">${wsOptions}</select>
       <button class="primary" type="submit">Add</button>
     </form>`,
    open.length);
}

function emailsTile() {
  const items = state.board.emails.filter(inWs).filter(e => !e.handled);
  const body = items.length
    ? `<ul class="items">${items.map(e => `<li>
        <div class="row"><div class="grow">
          <div class="title"><b>${esc(e.subject)}</b>${e.urgency === 'high' ? ' <span class="badge high">urgent</span>' : ''}</div>
          <div class="meta">${wsTag(e.workspace)} ${e.from ? esc(e.from) : ''}</div>
          ${e.snippet ? `<div class="meta">${esc(e.snippet)}</div>` : ''}
          ${e.action ? `<div class="action-line"><b>Action:</b> ${esc(e.action)}</div>` : ''}
          <div class="email-actions">
            <button data-email-done="${e.id}">✓ Handled</button>
            ${e.link ? `<a class="btn" href="${esc(e.link)}" target="_blank" rel="noopener">Open ↗</a>` : ''}
          </div>
        </div></div>
      </li>`).join('')}</ul>`
    : `<div class="empty">Inbox clear — nothing needs a decision. 🎉</div>`;
  return tile('t-rose', '📧', 'Important Emails — Needs Action',
    'Only what needs a real decision, pulled from every workspace. Everything else can wait.',
    body, items.length);
}

function teamTile() {
  const b = state.board;
  const items = b.summaries.filter(inWs);
  const submitted = new Set(items.map(s => s.member));
  const missing = b.staff.filter(s => s.role !== 'owner' && !submitted.has(s.name)
    && (state.ws === 'all' || s.workspace === state.ws || s.workspace === 'all'));

  const blocks = items.map(s => `<li><div class="summary-block">
      <div class="who">👤 ${esc(s.member)} ${wsTag(s.workspace)}</div>
      <dl>
        ${s.wins ? `<dt>Done today</dt><dd>${esc(s.wins)}</dd>` : ''}
        ${s.blockers ? `<dt>Blockers</dt><dd>⚠️ ${esc(s.blockers)}</dd>` : ''}
        ${s.tomorrow ? `<dt>Tomorrow</dt><dd>${esc(s.tomorrow)}</dd>` : ''}
      </dl>
    </div></li>`).join('');

  const body = `
    ${items.length ? `<ul class="items">${blocks}</ul>` : '<div class="empty">No updates submitted yet today.</div>'}
    ${missing.length ? `<p class="missing">Waiting on: ${missing.map(m => esc(m.name)).join(', ')}</p>` : ''}`;

  return tile('t-green', '👥', 'Team Daily Summaries',
    'What each team member shipped, what blocked them, and their plan for tomorrow.',
    body, `${items.length}/${state.board.digest.staffTotal}`);
}

function meetingNotesTile() {
  const items = state.board.meetingNotes.filter(inWs);
  const body = items.length
    ? `<ul class="items">${items.map(n => `<li>
        <div class="title"><b>${esc(n.title)}</b></div>
        <div class="meta">${wsTag(n.workspace)} ${fmtDate(n.date)}</div>
        <div class="action-line">${esc(n.body)}</div>
      </li>`).join('')}</ul>`
    : '<div class="empty">No meeting notes yet.</div>';
  return tile('t-lavender', '📝', 'Meeting Notes — Action Items',
    'Carried over from planning sessions so nothing slips.', body);
}

function workloadTile() {
  const events = state.board.events.filter(inWs);
  const slots = [];
  for (const e of events) {
    slots.push(`<div class="slot"><span class="time">${esc(e.start)}–${esc(e.end)}</span><span>${esc(e.title)} ${wsTag(e.workspace)}</span></div>`);
  }
  // compute free blocks between 08:00 and 18:00
  const toMin = t => t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : null;
  const busy = events.filter(e => e.start && e.end).map(e => [toMin(e.start), toMin(e.end)]).sort((a, b) => a[0] - b[0]);
  const free = [];
  let cursor = 8 * 60;
  for (const [s, e] of busy) {
    if (s - cursor >= 45) free.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (18 * 60 - cursor >= 45) free.push([cursor, 18 * 60]);
  const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const freeItems = free.map(([s, e]) =>
    `<li><div class="slot free"><span class="time">✅ ${fmt(s)}–${fmt(e)}</span><span>open — protect it for deep work</span></div></li>`).join('');

  return tile('t-blue', '📅', "Today's Workload",
    'Your calendar read for the day, so you see the open space before it fills.',
    `${events.length ? `<div class="group-label">Booked (${events.length})</div>` : ''}
     <ul class="items">${slots.map(s => `<li>${s}</li>`).join('')}</ul>
     ${free.length ? `<div class="group-label">Free blocks</div><ul class="items">${freeItems}</ul>` : ''}
     ${!events.length ? '<div class="empty">No meetings booked — a clean runway.</div>' : ''}`);
}

function announcementsTile() {
  const items = state.board.announcements.filter(inWs);
  const body = items.length
    ? `<ul class="items">${items.map(n => `<li>
        <div class="title"><b>${esc(n.title)}</b></div>
        <div class="meta">${wsTag(n.workspace)} ${fmtDate(n.date)}${n.createdBy ? ' · ' + esc(n.createdBy) : ''}</div>
        <div class="action-line">${esc(n.body)}</div>
      </li>`).join('')}</ul>`
    : '<div class="empty">No announcements.</div>';
  return tile('t-orange', '📣', 'Announcements & Notes',
    'Team-wide notices pushed by staff — no links to chase.', body);
}

// ------------------------------------------------------------------- render
function render() {
  const b = state.board;
  if (!b) return;

  document.getElementById('dateLabel').textContent =
    state.date === b.today ? `Today · ${fmtDate(state.date)}` : fmtDate(state.date);

  // workspace chips
  const chips = [{ id: 'all', name: 'All', color: 'transparent' }, ...b.workspaces];
  document.getElementById('wsChips').innerHTML = chips.map(w =>
    `<button class="chip ${state.ws === w.id ? 'active' : ''}" data-ws="${esc(w.id)}">
       ${w.id !== 'all' ? `<span class="swatch" style="background:${esc(w.color)}"></span>` : ''}${esc(w.name)}
     </button>`).join('');

  document.getElementById('board').innerHTML = [
    digestTile(b.digest),
    prioritiesTile(),
    tasksTile(),
    emailsTile(),
    teamTile(),
    workloadTile(),
    meetingNotesTile(),
    announcementsTile()
  ].join('');
}

// ------------------------------------------------------------------ actions
document.addEventListener('click', async e => {
  const chip = e.target.closest('[data-ws]');
  if (chip) { state.ws = chip.dataset.ws; render(); return; }

  const done = e.target.closest('[data-email-done]');
  if (done) {
    try { await api('PATCH', `/api/emails/${done.dataset.emailDone}`, { handled: true }); await loadBoard(); } catch {}
  }
});

document.addEventListener('change', async e => {
  const check = e.target.closest('[data-task]');
  if (check) {
    try {
      await api('PATCH', `/api/tasks/${check.dataset.task}`, { status: check.checked ? 'done' : 'open' });
      await loadBoard();
    } catch { check.checked = !check.checked; }
  }
});

document.addEventListener('submit', async e => {
  if (e.target.id === 'quickAdd') {
    e.preventDefault();
    const title = document.getElementById('qaTitle').value.trim();
    const wsId = document.getElementById('qaWs').value;
    if (!title) return;
    try {
      await api('POST', '/api/push', { type: 'task', data: { title, workspace: wsId, due: state.date } });
      await loadBoard();
    } catch {}
  }
});

document.getElementById('prevDay').onclick = () => { state.date = shiftDate(state.date, -1); loadBoard(); };
document.getElementById('nextDay').onclick = () => { state.date = shiftDate(state.date, 1); loadBoard(); };
document.getElementById('todayBtn').onclick = () => { state.date = localISO(); loadBoard(); };

// ------------------------------------------------------------------ API key
const dlg = document.getElementById('keyDialog');
function openKeyDialog() {
  document.getElementById('keyInput').value = state.key;
  dlg.showModal();
}
document.getElementById('keyBtn').onclick = openKeyDialog;
document.getElementById('keyCancel').onclick = () => dlg.close();
document.getElementById('keySave').onclick = async () => {
  state.key = document.getElementById('keyInput').value.trim();
  localStorage.setItem('dash_key', state.key);
  dlg.close();
  await whoAmI();
};

async function whoAmI() {
  if (!state.key) return;
  try {
    const res = await fetch('/api/me', { headers: { 'x-api-key': state.key } });
    if (res.ok) {
      const me = await res.json();
      state.who = me.name;
      document.getElementById('keyWho').textContent = me.name;
    } else {
      document.getElementById('keyWho').textContent = 'Sign in';
    }
  } catch {}
}

// -------------------------------------------------------------- live stream
function connectStream() {
  const live = document.getElementById('liveDot');
  const liveText = document.getElementById('liveText');
  const es = new EventSource('/api/stream');
  es.onopen = () => { live.classList.remove('offline'); liveText.textContent = 'live'; };
  es.onmessage = ev => {
    try { if (JSON.parse(ev.data).type === 'update') loadBoard(); } catch {}
  };
  es.onerror = () => {
    live.classList.add('offline');
    liveText.textContent = 'reconnecting…';
  };
}

// safety-net poll in case SSE is blocked by a proxy
setInterval(loadBoard, 90000);

loadBoard();
whoAmI();
connectStream();
