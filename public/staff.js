/* Staff portal — push updates to the owner board */

let key = localStorage.getItem('staff_key') || '';
let me = null;
let workspaces = [];

function $(id) { return document.getElementById(id); }

function localISO(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function msg(id, text, ok) {
  const el = $(id);
  el.textContent = text;
  el.className = 'form-msg ' + (ok ? 'ok' : 'err');
  if (ok) setTimeout(() => { el.textContent = ''; }, 4000);
}

async function push(type, data, msgId, form) {
  try {
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ type, data })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || res.statusText);
    msg(msgId, '✓ Sent — it is on the board now.', true);
    if (form) form.reset();
    fillDefaults();
  } catch (err) {
    msg(msgId, err.message, false);
  }
}

async function signIn(k) {
  const res = await fetch('/api/me', { headers: { 'x-api-key': k } });
  if (!res.ok) throw new Error('That key was not recognised.');
  me = await res.json();
  key = k;
  localStorage.setItem('staff_key', k);

  const board = await fetch('/api/board').then(r => r.json());
  workspaces = board.workspaces;

  const options = workspaces.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  document.querySelectorAll('select[data-ws]').forEach(sel => {
    sel.innerHTML = options;
    if (workspaces.some(w => w.id === me.workspace)) sel.value = me.workspace;
  });

  $('loginCard').hidden = true;
  $('portal').hidden = false;
  const who = $('whoami');
  who.classList.remove('offline');
  $('whoText').textContent = `${me.name} · ${me.role}`;
  fillDefaults();
}

function fillDefaults() {
  $('tkDue').value = localISO();
  $('evDate').value = localISO();
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  try { await signIn($('loginKey').value.trim()); }
  catch (err) { msg('loginMsg', err.message, false); }
});

$('summaryForm').addEventListener('submit', e => {
  e.preventDefault();
  push('summary', {
    workspace: $('sumWs').value,
    wins: $('sumWins').value.trim(),
    blockers: $('sumBlockers').value.trim(),
    tomorrow: $('sumTomorrow').value.trim()
  }, 'summaryMsg', e.target);
});

$('emailForm').addEventListener('submit', e => {
  e.preventDefault();
  push('email', {
    workspace: $('emWs').value,
    subject: $('emSubject').value.trim(),
    from: $('emFrom').value.trim(),
    snippet: $('emSnippet').value.trim(),
    action: $('emAction').value.trim(),
    urgency: $('emUrgent').checked ? 'high' : 'normal'
  }, 'emailMsg', e.target);
});

$('taskForm').addEventListener('submit', e => {
  e.preventDefault();
  push('task', {
    workspace: $('tkWs').value,
    title: $('tkTitle').value.trim(),
    due: $('tkDue').value || null,
    priority: +$('tkPriority').value,
    assignee: $('tkAssignee').value.trim() || undefined
  }, 'taskMsg', e.target);
});

$('eventForm').addEventListener('submit', e => {
  e.preventDefault();
  push('event', {
    workspace: $('evWs').value,
    title: $('evTitle').value.trim(),
    date: $('evDate').value || undefined,
    start: $('evStart').value,
    end: $('evEnd').value
  }, 'eventMsg', e.target);
});

$('noteForm').addEventListener('submit', e => {
  e.preventDefault();
  push('note', {
    workspace: $('ntWs').value,
    kind: $('ntKind').value,
    title: $('ntTitle').value.trim(),
    body: $('ntBody').value.trim()
  }, 'noteMsg', e.target);
});

if (key) signIn(key).catch(() => { key = ''; localStorage.removeItem('staff_key'); });
