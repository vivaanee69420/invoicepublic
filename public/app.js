/* Lead & Marketing Tracker — frontend.
   Vanilla JS + hand-rolled SVG charts. All user-entered text goes into the DOM
   via textContent (never innerHTML), so names/campaigns are safe to render. */
'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Fixed source → color-slot mapping. Order is the identity channel: it never
// changes with filters, and "Other" always wears the muted slot.
const SOURCES = [
  { name: 'Facebook',           color: 'var(--src-1)' },
  { name: 'Google Ads',         color: 'var(--src-2)' },
  { name: 'Instagram',          color: 'var(--src-3)' },
  { name: 'SEO / Website',      color: 'var(--src-4)' },
  { name: 'Exhibition / Event', color: 'var(--src-5)' },
  { name: 'Walk-in',            color: 'var(--src-6)' },
  { name: 'Referral',           color: 'var(--src-7)' },
  { name: 'JustDial',           color: 'var(--src-8)' },
  { name: 'Other',              color: 'var(--src-9)' },
];
const sourceColor = (name) =>
  (SOURCES.find((s) => s.name === name) || SOURCES[SOURCES.length - 1]).color;

// Funnel stages in order; "Lost" sits outside the funnel.
const STAGES = ['New', 'Contacted', 'Consultation Booked', 'Consultation Done', 'Treatment Booked', 'Treatment Done'];
const STATUSES = [...STAGES, 'Lost'];
const stageIndex = (status) => STAGES.indexOf(status); // -1 for Lost

const DEFAULT_TREATMENTS = ['Hair Transplant', 'PRP Therapy', 'Skin Treatment', 'Laser Hair Removal', 'Dental Implant', 'Consultation Only'];

const ORDINAL = ['var(--ord-1)', 'var(--ord-2)', 'var(--ord-3)', 'var(--ord-4)', 'var(--ord-5)', 'var(--ord-6)'];

const TABLE_LIMIT = 200; // rows shown before the "Show all" button appears

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  leads: [],
  spend: [],
  preset: '30d',
  from: null,          // ISO date or null
  to: null,
  source: '',          // '' = all sources
  search: '',
  editingLead: null,
  editingSpend: null,
  showAllLeads: false,
  showAllSpend: false,
};

// ---------------------------------------------------------------------------
// Tiny DOM / format helpers
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

const nfInt = new Intl.NumberFormat('en-IN');
const fmtInt = (n) => nfInt.format(Math.round(n));

function fmtMoney(n) { // Indian compact: ₹12.5L / ₹1.2Cr
  const v = Math.abs(n);
  if (v >= 1e7) return '₹' + (n / 1e7).toFixed(v >= 1e8 ? 0 : 1) + 'Cr';
  if (v >= 1e5) return '₹' + (n / 1e5).toFixed(v >= 1e6 ? 0 : 1) + 'L';
  if (v >= 1e3) return '₹' + fmtInt(n);
  return '₹' + Math.round(n);
}
const fmtMoneyFull = (n) => '₹' + fmtInt(n);
const fmtPct = (n) => (isFinite(n) ? (n * 100).toFixed(n * 100 >= 10 ? 0 : 1) + '%' : '—');

const isoToday = () => new Date().toISOString().slice(0, 10);
function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function fmtDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function niceTicks(maxVal, count = 4) {
  if (maxVal <= 0) return [0, 1];
  const rawStep = maxVal / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) || 10 * mag;
  const ticks = [];
  for (let v = 0; v <= maxVal + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < maxVal) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = el('div', { class: 'toast', text: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function loadAll() {
  [state.leads, state.spend] = await Promise.all([api('/api/leads'), api('/api/spend')]);
  renderAll();
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------
function currentRange() {
  const today = isoToday();
  switch (state.preset) {
    case 'today': return [today, today];
    case '7d':    return [isoDaysAgo(6), today];
    case '30d':   return [isoDaysAgo(29), today];
    case '90d':   return [isoDaysAgo(89), today];
    case 'month': return [today.slice(0, 8) + '01', today];
    case 'custom': return [state.from || '0000-01-01', state.to || today];
    default:      return [null, null]; // all time
  }
}

function inRange(dateIso, from, to) {
  if (!dateIso) return false;
  if (from && dateIso < from) return false;
  if (to && dateIso > to) return false;
  return true;
}

function filteredLeads() {
  const [from, to] = currentRange();
  return state.leads.filter((l) =>
    inRange(l.lead_date, from, to) && (!state.source || l.source === state.source));
}
function filteredSpend() {
  const [from, to] = currentRange();
  return state.spend.filter((s) =>
    inRange(s.spend_date, from, to) && (!state.source || s.platform === state.source));
}

// ---------------------------------------------------------------------------
// Tooltip (one shared instance; values lead, labels follow)
// ---------------------------------------------------------------------------
const tooltipEl = () => $('#tooltip');

function showTooltip(x, y, title, rows) {
  const tt = tooltipEl();
  tt.replaceChildren(el('div', { class: 'tt-title', text: title }));
  for (const r of rows) {
    tt.append(el('div', { class: 'tt-row' }, [
      r.color ? el('span', { class: 'tt-key', style: `background:${r.color}` }) : null,
      el('span', { class: 'tt-val', text: r.value }),
      el('span', { class: 'tt-name', text: r.name }),
    ]));
  }
  tt.hidden = false;
  const rect = tt.getBoundingClientRect();
  const px = Math.min(x + 14, window.innerWidth - rect.width - 8);
  const py = Math.min(y + 14, window.innerHeight - rect.height - 8);
  tt.style.left = px + 'px';
  tt.style.top = py + 'px';
}
function hideTooltip() { tooltipEl().hidden = true; }

// ---------------------------------------------------------------------------
// Dashboard — KPI tiles
// ---------------------------------------------------------------------------
function computeStats(leads, spend) {
  const totalLeads = leads.length;
  const consults = leads.filter((l) => stageIndex(l.status) >= 3).length;
  const treatments = leads.filter((l) => stageIndex(l.status) >= 4).length;
  const lost = leads.filter((l) => l.status === 'Lost').length;
  const revenue = leads.reduce((sum, l) => sum + (l.final_value || 0), 0);
  const totalSpend = spend.reduce((sum, s) => sum + (s.amount || 0), 0);
  return {
    totalLeads, consults, treatments, lost, revenue, totalSpend,
    convRate: totalLeads ? treatments / totalLeads : NaN,
    cpl: totalLeads && totalSpend ? totalSpend / totalLeads : NaN,
    cpa: treatments && totalSpend ? totalSpend / treatments : NaN,
    roas: totalSpend ? revenue / totalSpend : NaN,
  };
}

function renderKpis(stats) {
  const tiles = [
    { label: 'Total leads', value: fmtInt(stats.totalLeads), hero: true, hint: stats.lost ? `${fmtInt(stats.lost)} marked lost` : '' },
    { label: 'Consultations done', value: fmtInt(stats.consults), hint: fmtPct(stats.totalLeads ? stats.consults / stats.totalLeads : NaN) + ' of leads' },
    { label: 'Treatments booked', value: fmtInt(stats.treatments), hint: fmtPct(stats.convRate) + ' conversion' },
    { label: 'Ad spend', value: fmtMoney(stats.totalSpend), hint: isFinite(stats.cpl) ? fmtMoneyFull(stats.cpl) + ' per lead' : 'no spend entered' },
    { label: 'Cost per treatment', value: isFinite(stats.cpa) ? fmtMoney(stats.cpa) : '—', hint: 'spend ÷ treatments' },
    { label: 'Revenue', value: fmtMoney(stats.revenue), hint: isFinite(stats.roas) ? stats.roas.toFixed(1) + '× return on spend' : '' },
  ];
  $('#kpi-row').replaceChildren(...tiles.map((t) =>
    el('div', { class: 'kpi' + (t.hero ? ' hero' : '') }, [
      el('div', { class: 'label', text: t.label }),
      el('div', { class: 'value', text: t.value }),
      t.hint ? el('div', { class: 'hint', text: t.hint }) : null,
    ])));
}

// ---------------------------------------------------------------------------
// Dashboard — daily leads line chart (crosshair + all-series tooltip)
// ---------------------------------------------------------------------------
function renderTrend(leads) {
  const box = $('#chart-trend');
  const [from, to] = currentRange();
  const start = from || (leads.length ? leads.map((l) => l.lead_date).sort()[0] : isoDaysAgo(29));
  const end = to || isoToday();

  const days = [];
  for (let d = new Date(start + 'T00:00:00'); ; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > end) break;
    days.push(iso);
    if (days.length > 400) break; // hard stop for "all time" on huge ranges
  }
  const byDay = new Map(days.map((d) => [d, { total: 0, bySource: new Map() }]));
  for (const l of leads) {
    const rec = byDay.get(l.lead_date);
    if (!rec) continue;
    rec.total++;
    rec.bySource.set(l.source, (rec.bySource.get(l.source) || 0) + 1);
  }

  if (!leads.length) {
    box.replaceChildren(el('div', { class: 'empty-msg', text: 'No leads in this period yet.' }));
    return;
  }

  const W = Math.max(320, box.clientWidth || 520), H = 240;
  const pad = { l: 36, r: 46, t: 12, b: 26 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const maxY = Math.max(1, ...days.map((d) => byDay.get(d).total));
  const ticks = niceTicks(maxY);
  const yMax = ticks[ticks.length - 1];
  const x = (i) => pad.l + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / yMax) * ih;

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Daily leads line chart' });

  for (const t of ticks) {
    root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t), stroke: 'var(--grid)', 'stroke-width': 1 }));
    root.append(svg('text', { x: pad.l - 6, y: y(t) + 3.5, 'text-anchor': 'end', class: 'tick-label', text: fmtInt(t) }));
  }
  root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(0), y2: y(0), stroke: 'var(--baseline)', 'stroke-width': 1 }));

  const nLabels = Math.min(6, days.length);
  for (let i = 0; i < nLabels; i++) {
    const idx = Math.round((i / Math.max(1, nLabels - 1)) * (days.length - 1));
    root.append(svg('text', { x: x(idx), y: H - 8, 'text-anchor': 'middle', class: 'axis-label', text: fmtDateShort(days[idx]) }));
  }

  const pts = days.map((d, i) => [x(i), y(byDay.get(d).total)]);
  const lineD = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  root.append(svg('path', {
    d: `${lineD} L ${pts[pts.length - 1][0].toFixed(1)} ${y(0)} L ${pts[0][0].toFixed(1)} ${y(0)} Z`,
    fill: 'var(--src-1)', opacity: 0.1,
  }));
  root.append(svg('path', { d: lineD, fill: 'none', stroke: 'var(--src-1)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  // end marker (8px dot, 2px surface ring) + direct end label
  const last = pts[pts.length - 1];
  root.append(svg('circle', { cx: last[0], cy: last[1], r: 6, fill: 'var(--surface-1)' }));
  root.append(svg('circle', { cx: last[0], cy: last[1], r: 4, fill: 'var(--src-1)' }));
  root.append(svg('text', { x: last[0] + 9, y: last[1] + 4, class: 'direct-label', text: fmtInt(byDay.get(days[days.length - 1]).total) }));

  // crosshair + hover overlay
  const cross = svg('line', { y1: pad.t, y2: pad.t + ih, stroke: 'var(--baseline)', 'stroke-width': 1, visibility: 'hidden' });
  const hoverDotRing = svg('circle', { r: 6, fill: 'var(--surface-1)', visibility: 'hidden' });
  const hoverDot = svg('circle', { r: 4, fill: 'var(--src-1)', visibility: 'hidden' });
  root.append(cross, hoverDotRing, hoverDot);

  const overlay = svg('rect', { x: pad.l, y: pad.t, width: iw, height: ih, fill: 'transparent' });
  overlay.addEventListener('pointermove', (ev) => {
    const rect = root.getBoundingClientRect();
    const relX = ((ev.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(days.length - 1, Math.round(((relX - pad.l) / iw) * (days.length - 1))));
    const day = days[i];
    const rec = byDay.get(day);
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
    cross.setAttribute('visibility', 'visible');
    hoverDotRing.setAttribute('cx', x(i)); hoverDotRing.setAttribute('cy', y(rec.total));
    hoverDot.setAttribute('cx', x(i)); hoverDot.setAttribute('cy', y(rec.total));
    hoverDotRing.setAttribute('visibility', 'visible');
    hoverDot.setAttribute('visibility', 'visible');
    const rows = [{ value: fmtInt(rec.total), name: 'leads', color: 'var(--src-1)' }];
    for (const s of SOURCES) {
      const n = rec.bySource.get(s.name);
      if (n) rows.push({ value: fmtInt(n), name: s.name, color: s.color });
    }
    showTooltip(ev.clientX, ev.clientY, new Date(day + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }), rows);
  });
  overlay.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    hoverDot.setAttribute('visibility', 'hidden');
    hoverDotRing.setAttribute('visibility', 'hidden');
    hideTooltip();
  });
  root.append(overlay);

  box.replaceChildren(root);
}

// ---------------------------------------------------------------------------
// Dashboard — leads by source (horizontal bars, direct labels)
// ---------------------------------------------------------------------------
function renderSources(leads, spend) {
  const box = $('#chart-sources');
  const counts = SOURCES
    .map((s) => ({
      ...s,
      leads: leads.filter((l) => l.source === s.name).length,
      spend: spend.filter((e) => e.platform === s.name).reduce((a, e) => a + e.amount, 0),
      treatments: leads.filter((l) => l.source === s.name && stageIndex(l.status) >= 4).length,
    }))
    .filter((s) => s.leads > 0)
    .sort((a, b) => b.leads - a.leads);

  if (!counts.length) {
    box.replaceChildren(el('div', { class: 'empty-msg', text: 'No leads in this period yet.' }));
    return;
  }

  const W = Math.max(320, box.clientWidth || 520);
  const rowH = 30, barH = 18;
  const pad = { l: 128, r: 56, t: 6, b: 6 };
  const H = pad.t + pad.b + counts.length * rowH;
  const iw = W - pad.l - pad.r;
  const maxV = Math.max(...counts.map((c) => c.leads));
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Leads by source bar chart' });

  counts.forEach((c, i) => {
    const cy = pad.t + i * rowH + rowH / 2;
    const w = Math.max(2, (c.leads / maxV) * iw);
    root.append(svg('text', { x: pad.l - 10, y: cy + 4, 'text-anchor': 'end', class: 'cat-label', text: c.name }));
    // 4px rounded data-end, square at baseline: rounded rect + square patch at the left
    const bar = svg('rect', { x: pad.l, y: cy - barH / 2, width: w, height: barH, rx: 4, fill: c.color });
    const patch = svg('rect', { x: pad.l, y: cy - barH / 2, width: Math.min(4, w / 2), height: barH, fill: c.color });
    root.append(bar, patch);
    root.append(svg('text', { x: pad.l + w + 8, y: cy + 4, class: 'direct-label', text: fmtInt(c.leads) }));

    const hit = svg('rect', { x: 0, y: cy - rowH / 2, width: W, height: rowH, fill: 'transparent' });
    hit.addEventListener('pointermove', (ev) => {
      const rows = [
        { value: fmtInt(c.leads), name: 'leads', color: c.color },
        { value: fmtInt(c.treatments), name: 'treatments booked' },
      ];
      if (c.spend > 0) {
        rows.push({ value: fmtMoneyFull(c.spend), name: 'ad spend' });
        rows.push({ value: fmtMoneyFull(c.spend / c.leads), name: 'cost per lead' });
      }
      showTooltip(ev.clientX, ev.clientY, c.name, rows);
      bar.setAttribute('opacity', 0.85);
    });
    hit.addEventListener('pointerleave', () => { hideTooltip(); bar.removeAttribute('opacity'); });
    root.append(hit);
  });

  box.replaceChildren(root);
}

// ---------------------------------------------------------------------------
// Dashboard — funnel (ordinal ramp)
// ---------------------------------------------------------------------------
function renderFunnel(leads) {
  const box = $('#chart-funnel');
  const active = leads.filter((l) => l.status !== 'Lost');
  const counts = STAGES.map((_, i) => active.filter((l) => stageIndex(l.status) >= i).length);
  const lost = leads.length - active.length;

  if (!leads.length) {
    box.replaceChildren(el('div', { class: 'empty-msg', text: 'No leads in this period yet.' }));
    return;
  }

  const W = Math.max(320, box.clientWidth || 520);
  const rowH = 34, barH = 20;
  const pad = { l: 148, r: 96, t: 6, b: 6 };
  const H = pad.t + pad.b + STAGES.length * rowH;
  const iw = W - pad.l - pad.r;
  const maxV = Math.max(1, counts[0]);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Conversion funnel' });

  STAGES.forEach((stage, i) => {
    const cy = pad.t + i * rowH + rowH / 2;
    const w = Math.max(2, (counts[i] / maxV) * iw);
    root.append(svg('text', { x: pad.l - 10, y: cy + 4, 'text-anchor': 'end', class: 'cat-label', text: stage }));
    const bar = svg('rect', { x: pad.l, y: cy - barH / 2, width: w, height: barH, rx: 4, fill: ORDINAL[i] });
    const patch = svg('rect', { x: pad.l, y: cy - barH / 2, width: Math.min(4, w / 2), height: barH, fill: ORDINAL[i] });
    root.append(bar, patch);
    const pctOfPrev = i === 0 ? null : counts[i - 1] ? counts[i] / counts[i - 1] : null;
    root.append(svg('text', { x: pad.l + w + 8, y: cy + 4, class: 'direct-label', text: fmtInt(counts[i]) }));
    if (pctOfPrev !== null) {
      root.append(svg('text', {
        x: W - 6, y: cy + 4, 'text-anchor': 'end', class: 'tick-label',
        text: fmtPct(pctOfPrev) + ' of prev',
      }));
    }
    const hit = svg('rect', { x: 0, y: cy - rowH / 2, width: W, height: rowH, fill: 'transparent' });
    hit.addEventListener('pointermove', (ev) => {
      showTooltip(ev.clientX, ev.clientY, stage, [
        { value: fmtInt(counts[i]), name: 'reached this stage', color: ORDINAL[i] },
        { value: fmtPct(counts[0] ? counts[i] / counts[0] : NaN), name: 'of all active leads' },
      ]);
      bar.setAttribute('opacity', 0.85);
    });
    hit.addEventListener('pointerleave', () => { hideTooltip(); bar.removeAttribute('opacity'); });
    root.append(hit);
  });

  const note = el('div', { class: 'legend' }, [
    el('span', { text: `${fmtInt(lost)} lead${lost === 1 ? '' : 's'} marked Lost in this period (excluded from funnel).` }),
  ]);
  box.replaceChildren(root, note);
}

// ---------------------------------------------------------------------------
// Dashboard — spend vs revenue per paid platform (grouped bars + legend)
// ---------------------------------------------------------------------------
function renderRoi(leads, spend) {
  const box = $('#chart-roi');
  const platforms = SOURCES
    .map((s) => ({
      name: s.name,
      spend: spend.filter((e) => e.platform === s.name).reduce((a, e) => a + e.amount, 0),
      revenue: leads.filter((l) => l.source === s.name).reduce((a, l) => a + (l.final_value || 0), 0),
    }))
    .filter((p) => p.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  if (!platforms.length) {
    box.replaceChildren(el('div', { class: 'empty-msg', text: 'No ad spend entered for this period. Add it in the Ad Spend tab to see ROI.' }));
    return;
  }

  const W = Math.max(320, box.clientWidth || 520);
  const barH = 14, gap = 2, groupH = 46;
  // right padding holds the longest bar's value label AND the "×.× return"
  // text without collision
  const pad = { l: 128, r: 150, t: 26, b: 6 };
  const H = pad.t + pad.b + platforms.length * groupH;
  const iw = W - pad.l - pad.r;
  const maxV = Math.max(...platforms.map((p) => Math.max(p.spend, p.revenue)));
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Spend versus revenue by platform' });

  const C_SPEND = 'var(--src-1)', C_REV = 'var(--src-2)';

  platforms.forEach((p, i) => {
    const top = pad.t + i * groupH + (groupH - (2 * barH + gap)) / 2;
    root.append(svg('text', { x: pad.l - 10, y: top + barH + gap / 2 + 4, 'text-anchor': 'end', class: 'cat-label', text: p.name }));

    const rows = [
      { v: p.spend, color: C_SPEND, y: top, label: fmtMoney(p.spend) },
      { v: p.revenue, color: C_REV, y: top + barH + gap, label: fmtMoney(p.revenue) },
    ];
    for (const r of rows) {
      const w = Math.max(2, (r.v / maxV) * iw);
      root.append(svg('rect', { x: pad.l, y: r.y, width: w, height: barH, rx: 4, fill: r.color }));
      root.append(svg('rect', { x: pad.l, y: r.y, width: Math.min(4, w / 2), height: barH, fill: r.color }));
      root.append(svg('text', { x: pad.l + w + 8, y: r.y + barH - 3, class: 'direct-label', text: r.label }));
    }
    const roas = p.spend ? p.revenue / p.spend : NaN;
    root.append(svg('text', {
      x: W - 6, y: top + barH + gap / 2 + 4, 'text-anchor': 'end',
      class: roas >= 1 ? 'direct-label' : 'tick-label',
      text: isFinite(roas) ? roas.toFixed(1) + '× return' : '',
    }));

    const hit = svg('rect', { x: 0, y: pad.t + i * groupH, width: W, height: groupH, fill: 'transparent' });
    hit.addEventListener('pointermove', (ev) => {
      showTooltip(ev.clientX, ev.clientY, p.name, [
        { value: fmtMoneyFull(p.spend), name: 'spend', color: C_SPEND },
        { value: fmtMoneyFull(p.revenue), name: 'revenue', color: C_REV },
        { value: isFinite(roas) ? roas.toFixed(2) + '×' : '—', name: 'return on spend' },
      ]);
    });
    hit.addEventListener('pointerleave', hideTooltip);
    root.append(hit);
  });

  const legend = el('div', { class: 'legend' }, [
    el('span', { class: 'key' }, [el('span', { class: 'swatch', style: `background:${C_SPEND}` }), el('span', { text: 'Ad spend' })]),
    el('span', { class: 'key' }, [el('span', { class: 'swatch', style: `background:${C_REV}` }), el('span', { text: 'Revenue from that platform' })]),
  ]);
  box.replaceChildren(legend, root);
}

// ---------------------------------------------------------------------------
// Dashboard — source performance table
// ---------------------------------------------------------------------------
function renderPerfTable(leads, spend) {
  const table = $('#perf-table');
  const rows = SOURCES
    .map((s) => {
      const ls = leads.filter((l) => l.source === s.name);
      const sp = spend.filter((e) => e.platform === s.name).reduce((a, e) => a + e.amount, 0);
      const treatments = ls.filter((l) => stageIndex(l.status) >= 4).length;
      const revenue = ls.reduce((a, l) => a + (l.final_value || 0), 0);
      return {
        name: s.name, color: s.color, leads: ls.length, spend: sp,
        consults: ls.filter((l) => stageIndex(l.status) >= 3).length,
        treatments, revenue,
        cpl: ls.length && sp ? sp / ls.length : NaN,
        cpa: treatments && sp ? sp / treatments : NaN,
        conv: ls.length ? treatments / ls.length : NaN,
        roas: sp ? revenue / sp : NaN,
      };
    })
    .filter((r) => r.leads > 0 || r.spend > 0)
    .sort((a, b) => b.leads - a.leads);

  const head = el('tr', {}, ['Source', 'Leads', 'Ad spend', 'Cost/lead', 'Consults', 'Treatments', 'Conv %', 'Cost/treatment', 'Revenue', 'Return'].map((h, i) =>
    el('th', { class: i === 0 ? '' : 'num', text: h })));

  const body = rows.map((r) => el('tr', {}, [
    el('td', {}, [el('span', { class: 'src-dot', style: `background:${r.color}` }), el('span', { text: r.name })]),
    el('td', { class: 'num', text: fmtInt(r.leads) }),
    el('td', { class: 'num' + (r.spend ? '' : ' muted'), text: r.spend ? fmtMoneyFull(r.spend) : 'free' }),
    el('td', { class: 'num', text: isFinite(r.cpl) ? fmtMoneyFull(r.cpl) : '—' }),
    el('td', { class: 'num', text: fmtInt(r.consults) }),
    el('td', { class: 'num', text: fmtInt(r.treatments) }),
    el('td', { class: 'num', text: fmtPct(r.conv) }),
    el('td', { class: 'num', text: isFinite(r.cpa) ? fmtMoneyFull(r.cpa) : '—' }),
    el('td', { class: 'num', text: r.revenue ? fmtMoneyFull(r.revenue) : '—' }),
    el('td', {
      class: 'num ' + (isFinite(r.roas) ? (r.roas >= 1 ? 'good' : 'bad') : 'muted'),
      text: isFinite(r.roas) ? r.roas.toFixed(1) + '×' : '—',
      title: isFinite(r.roas) ? (r.roas >= 1 ? 'Earning more than you spend' : 'Spending more than you earn — review this channel') : 'No paid spend recorded',
    }),
  ]));

  const totals = computeStats(leads, spend);
  const totalRow = el('tr', {}, [
    el('td', {}, [el('strong', { text: 'All sources' })]),
    el('td', { class: 'num' }, [el('strong', { text: fmtInt(totals.totalLeads) })]),
    el('td', { class: 'num' }, [el('strong', { text: fmtMoneyFull(totals.totalSpend) })]),
    el('td', { class: 'num', text: isFinite(totals.cpl) ? fmtMoneyFull(totals.cpl) : '—' }),
    el('td', { class: 'num', text: fmtInt(totals.consults) }),
    el('td', { class: 'num', text: fmtInt(totals.treatments) }),
    el('td', { class: 'num', text: fmtPct(totals.convRate) }),
    el('td', { class: 'num', text: isFinite(totals.cpa) ? fmtMoneyFull(totals.cpa) : '—' }),
    el('td', { class: 'num', text: fmtMoneyFull(totals.revenue) }),
    el('td', {
      class: 'num ' + (isFinite(totals.roas) ? (totals.roas >= 1 ? 'good' : 'bad') : 'muted'),
      text: isFinite(totals.roas) ? totals.roas.toFixed(1) + '×' : '—',
    }),
  ]);

  table.replaceChildren(el('thead', {}, [head]), el('tbody', {}, [...body, totalRow]));
}

// ---------------------------------------------------------------------------
// Leads tab
// ---------------------------------------------------------------------------
function statusPill(status) {
  const cls = stageIndex(status) >= 4 ? ' won' : status === 'Lost' ? ' lost' : '';
  return el('span', { class: 'status-pill' + cls, text: status });
}

function renderLeadsTable() {
  const table = $('#leads-table');
  const q = state.search.toLowerCase();
  const rows = filteredLeads().filter((l) =>
    !q || [l.name, l.phone, l.campaign, l.treatment, l.city, l.source, l.notes]
      .some((v) => String(v || '').toLowerCase().includes(q)));

  $('#leads-count').textContent = `${fmtInt(rows.length)} lead${rows.length === 1 ? '' : 's'} in the selected period`;

  const head = el('tr', {}, ['Date', 'Name', 'Phone', 'Source', 'Campaign', 'Treatment', 'Status', 'Value (₹)', 'Follow-up', 'By', ''].map((h) => el('th', { text: h })));

  const shown = state.showAllLeads ? rows : rows.slice(0, TABLE_LIMIT);
  const body = shown.map((l) => {
    const statusSel = el('select', { class: 'status-select', title: 'Update status' },
      STATUSES.map((s) => el('option', { value: s, text: s, ...(s === l.status ? { selected: '' } : {}) })));
    statusSel.addEventListener('change', async () => {
      try {
        const updated = await api(`/api/leads/${l.id}`, 'PUT', { status: statusSel.value });
        Object.assign(l, updated);
        toast(`Status updated → ${updated.status}`);
        renderAll();
      } catch (e) { toast('Could not update: ' + e.message); }
    });

    return el('tr', {}, [
      el('td', { class: 'muted', text: fmtDateShort(l.lead_date) }),
      el('td', {}, [el('strong', { text: l.name })]),
      el('td', { text: l.phone || '—' }),
      el('td', {}, [el('span', { class: 'src-dot', style: `background:${sourceColor(l.source)}` }), el('span', { text: l.source })]),
      el('td', { class: 'muted', text: l.campaign || '—' }),
      el('td', { text: l.treatment || '—' }),
      el('td', {}, [statusSel]),
      el('td', { class: 'num', text: l.final_value ? fmtInt(l.final_value) : l.quoted_value ? fmtInt(l.quoted_value) + ' (quoted)' : '—' }),
      el('td', { class: 'muted', text: l.next_followup ? fmtDateShort(l.next_followup) : '—' }),
      el('td', { class: 'muted', text: l.entered_by || '—' }),
      el('td', {}, [
        el('button', { class: 'btn small', text: 'Edit', onclick: () => startEditLead(l) }),
        ' ',
        el('button', {
          class: 'btn small danger', text: 'Del',
          onclick: async () => {
            if (!confirm(`Delete lead "${l.name}"? This cannot be undone.`)) return;
            await api(`/api/leads/${l.id}`, 'DELETE');
            state.leads = state.leads.filter((x) => x.id !== l.id);
            toast('Lead deleted');
            renderAll();
          },
        }),
      ]),
    ]);
  });

  if (rows.length > shown.length) {
    body.push(el('tr', {}, [el('td', { colspan: 11 }, [
      el('button', {
        class: 'btn small', text: `Show all ${fmtInt(rows.length)} leads`,
        onclick: () => { state.showAllLeads = true; renderLeadsTable(); },
      }),
    ])]));
  }

  table.replaceChildren(el('thead', {}, [head]), el('tbody', {}, body));
}

function leadForm() { return $('#lead-form'); }

function startEditLead(l) {
  state.editingLead = l.id;
  const f = leadForm();
  for (const name of ['lead_date', 'name', 'phone', 'city', 'source', 'source_detail', 'campaign', 'treatment', 'status', 'quoted_value', 'final_value', 'next_followup', 'notes']) {
    if (f.elements[name]) f.elements[name].value = l[name] ?? '';
  }
  $('#lead-form-title').textContent = `Editing: ${l.name}`;
  $('#lead-submit').textContent = 'Save changes';
  $('#lead-cancel').hidden = false;
  document.querySelector('[data-tab="leads"]').click();
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetLeadForm() {
  state.editingLead = null;
  const f = leadForm();
  f.reset();
  f.elements.lead_date.value = isoToday();
  $('#lead-form-title').textContent = 'Add a lead';
  $('#lead-submit').textContent = 'Add lead';
  $('#lead-cancel').hidden = true;
}

async function submitLead(ev) {
  ev.preventDefault();
  const f = leadForm();
  const body = {};
  for (const elm of f.elements) if (elm.name) body[elm.name] = elm.value;
  body.entered_by = $('#whoami-input').value.trim();
  try {
    if (state.editingLead) {
      const updated = await api(`/api/leads/${state.editingLead}`, 'PUT', body);
      const i = state.leads.findIndex((l) => l.id === state.editingLead);
      if (i >= 0) state.leads[i] = updated;
      toast('Lead updated');
    } else {
      const created = await api('/api/leads', 'POST', body);
      state.leads.unshift(created);
      toast(`Lead added: ${created.name}`);
    }
    resetLeadForm();
    renderAll();
  } catch (e) { toast('Could not save: ' + e.message); }
}

// ---------------------------------------------------------------------------
// Spend tab
// ---------------------------------------------------------------------------
function renderSpendTable() {
  const table = $('#spend-table');
  const rows = filteredSpend();
  const total = rows.reduce((a, r) => a + r.amount, 0);
  $('#spend-count').textContent = `${fmtInt(rows.length)} entries · ${fmtMoneyFull(total)} total in the selected period`;

  const head = el('tr', {}, ['Date', 'Platform', 'Amount (₹)', 'Campaign', 'By', 'Notes', ''].map((h) => el('th', { text: h })));
  const shown = state.showAllSpend ? rows : rows.slice(0, TABLE_LIMIT);
  const body = shown.map((r) => el('tr', {}, [
    el('td', { class: 'muted', text: fmtDateShort(r.spend_date) }),
    el('td', {}, [el('span', { class: 'src-dot', style: `background:${sourceColor(r.platform)}` }), el('span', { text: r.platform })]),
    el('td', { class: 'num', text: fmtInt(r.amount) }),
    el('td', { class: 'muted', text: r.campaign || '—' }),
    el('td', { class: 'muted', text: r.entered_by || '—' }),
    el('td', { class: 'muted', text: r.notes || '' }),
    el('td', {}, [
      el('button', { class: 'btn small', text: 'Edit', onclick: () => startEditSpend(r) }),
      ' ',
      el('button', {
        class: 'btn small danger', text: 'Del',
        onclick: async () => {
          if (!confirm(`Delete ${fmtMoneyFull(r.amount)} spend on ${r.platform}?`)) return;
          await api(`/api/spend/${r.id}`, 'DELETE');
          state.spend = state.spend.filter((x) => x.id !== r.id);
          toast('Spend entry deleted');
          renderAll();
        },
      }),
    ]),
  ]));
  if (rows.length > shown.length) {
    body.push(el('tr', {}, [el('td', { colspan: 7 }, [
      el('button', {
        class: 'btn small', text: `Show all ${fmtInt(rows.length)} entries`,
        onclick: () => { state.showAllSpend = true; renderSpendTable(); },
      }),
    ])]));
  }
  table.replaceChildren(el('thead', {}, [head]), el('tbody', {}, body));
}

function spendForm() { return $('#spend-form'); }

function startEditSpend(r) {
  state.editingSpend = r.id;
  const f = spendForm();
  for (const name of ['spend_date', 'platform', 'amount', 'campaign', 'notes']) {
    if (f.elements[name]) f.elements[name].value = r[name] ?? '';
  }
  f.querySelector('button[type=submit]').textContent = 'Save changes';
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submitSpend(ev) {
  ev.preventDefault();
  const f = spendForm();
  const body = {};
  for (const elm of f.elements) if (elm.name) body[elm.name] = elm.value;
  body.entered_by = $('#whoami-input').value.trim();
  try {
    if (state.editingSpend) {
      const updated = await api(`/api/spend/${state.editingSpend}`, 'PUT', body);
      const i = state.spend.findIndex((s) => s.id === state.editingSpend);
      if (i >= 0) state.spend[i] = updated;
      toast('Spend updated');
    } else {
      const created = await api('/api/spend', 'POST', body);
      state.spend.unshift(created);
      toast(`Spend added: ${fmtMoneyFull(created.amount)} on ${created.platform}`);
    }
    state.editingSpend = null;
    f.reset();
    f.elements.spend_date.value = isoToday();
    f.querySelector('button[type=submit]').textContent = 'Add spend';
    renderAll();
  } catch (e) { toast('Could not save: ' + e.message); }
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------
const PRESETS = [
  ['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'],
  ['month', 'This month'], ['all', 'All time'], ['custom', 'Custom…'],
];

function renderFilterBar() {
  const wrap = $('#daterange');
  wrap.replaceChildren(...PRESETS.map(([key, label]) =>
    el('button', {
      class: key === state.preset ? 'active' : '', text: label,
      onclick: () => {
        state.preset = key;
        if (key === 'custom' && !state.from) { state.from = isoDaysAgo(29); state.to = isoToday(); }
        renderFilterBar();
        renderAll();
      },
    })));

  if (state.preset === 'custom') {
    const from = el('input', { type: 'date', value: state.from || '' });
    const to = el('input', { type: 'date', value: state.to || '' });
    from.addEventListener('change', () => { state.from = from.value; renderAll(); });
    to.addEventListener('change', () => { state.to = to.value; renderAll(); });
    wrap.append(from, to);
  }

  const sel = $('#filter-source');
  sel.replaceChildren(
    el('option', { value: '', text: 'All sources' }),
    ...SOURCES.map((s) => el('option', { value: s.name, text: s.name, ...(s.name === state.source ? { selected: '' } : {}) })));
  sel.onchange = () => { state.source = sel.value; renderAll(); };
}

// ---------------------------------------------------------------------------
// Render everything below the filter bar against the same slice
// ---------------------------------------------------------------------------
function renderAll() {
  const leads = filteredLeads();
  const spend = filteredSpend();
  const [from, to] = currentRange();
  $('#filter-note').textContent = from ? `${fmtDateShort(from)} – ${fmtDateShort(to)}` : 'Showing all data';

  renderKpis(computeStats(leads, spend));
  renderTrend(leads);
  renderSources(leads, spend);
  renderFunnel(leads);
  renderRoi(leads, spend);
  renderPerfTable(leads, spend);
  renderLeadsTable();
  renderSpendTable();
  renderTreatmentList();
}

function renderTreatmentList() {
  const seen = new Set(DEFAULT_TREATMENTS);
  for (const l of state.leads) if (l.treatment) seen.add(l.treatment);
  $('#treatment-list').replaceChildren(...[...seen].sort().map((t) => el('option', { value: t })));
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function initTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tabpane').forEach((p) =>
        p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
      renderAll(); // charts need a re-measure once their pane is visible
    });
  });
}

function initForms() {
  const leadSourceSel = leadForm().elements.source;
  leadSourceSel.replaceChildren(...SOURCES.map((s) => el('option', { value: s.name, text: s.name })));
  const leadStatusSel = leadForm().elements.status;
  leadStatusSel.replaceChildren(...STATUSES.map((s) => el('option', { value: s, text: s })));
  leadForm().elements.lead_date.value = isoToday();
  leadForm().addEventListener('submit', submitLead);
  $('#lead-cancel').addEventListener('click', resetLeadForm);

  const spendPlatformSel = spendForm().elements.platform;
  spendPlatformSel.replaceChildren(...SOURCES.map((s) => el('option', { value: s.name, text: s.name })));
  spendForm().elements.spend_date.value = isoToday();
  spendForm().addEventListener('submit', submitSpend);

  $('#lead-search').addEventListener('input', (ev) => { state.search = ev.target.value; renderLeadsTable(); });

  const who = $('#whoami-input');
  who.value = localStorage.getItem('tracker.whoami') || '';
  who.addEventListener('change', () => localStorage.setItem('tracker.whoami', who.value.trim()));
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderAll, 150);
});

initTabs();
initForms();
renderFilterBar();
loadAll().catch((e) => {
  document.querySelector('main').prepend(
    el('div', { class: 'card', text: 'Could not load data: ' + e.message + ' — is the server running?' }));
});
