// Shared helpers for every page.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const pct = (a, b, d = 1) => (b ? ((a / b) * 100).toFixed(d) : (0).toFixed(d)) + '%';
const short = (h, n = 10) => (h ? `${h.slice(0, n)}…${h.slice(-6)}` : '');
const ago = (iso) => {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.max(s, 0)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const timeLeft = (iso) => {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'Ended';
  const h = Math.floor(ms / 3600e3);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : h >= 1 ? `${h}h ${Math.floor((ms % 3600e3) / 60e3)}m left` : `${Math.ceil(ms / 60e3)}m left`;
};

const storage = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = storage.get('sv_token');
  if (auth && token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}

function toast(msg) {
  let box = $('.toasts');
  if (!box) document.body.append((box = Object.assign(document.createElement('div'), { className: 'toasts' })));
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  box.append(t);
  setTimeout(() => t.remove(), 4000);
}

// Theme toggle: explicit choice wins over the OS setting.
function initTheme() {
  const btn = $('#theme-btn');
  if (!btn) return;
  const current = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const paint = () => (btn.textContent = current() === 'dark' ? '☀' : '☾');
  paint();
  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('sv_theme', next); } catch {}
    paint();
    document.dispatchEvent(new CustomEvent('themechange'));
  });
}

// Live blockchain events from the server.
function onBlocks(handler) {
  const es = new EventSource('/api/events');
  es.onmessage = (e) => handler(JSON.parse(e.data));
  return es;
}

// ---------- icons (inline SVG, stroke = currentColor) ----------
const ICON_PATHS = {
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
  eye: '<path d="M3 3l18 18"/><path d="M10.6 6.1A10 10 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3 3.6M6.7 6.7C4.3 8.3 3 12 3 12s4 6 9 6a9.6 9.6 0 0 0 4-.9"/>',
  zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M15.4 9.6A6 6 0 1 1 9.6 15.4"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  dollar: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M3 21h18"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  home: '<path d="M3 11l9-8 9 8M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  heart: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
  cube: '<path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/><path d="M12 22V12M21 7l-9 5-9-5"/>',
  tree: '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M12 7v4M12 11l-6 6M12 11l6 6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  vote: '<path d="M4 13h16v8H4zM8 13V5h8v8"/><path d="M10 9l1.5 1.5L14 8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6H3v-6l2-8z"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;

// ---------- charts ----------
// Categorical color follows the option's position in the poll — fixed order, never cycled by rank.
const seriesColor = (i) => `var(--series-${(i % 8) + 1})`;

let tipEl;
function showTip(e, html) {
  if (!tipEl) document.body.append((tipEl = Object.assign(document.createElement('div'), { className: 'tooltip' })));
  tipEl.innerHTML = html;
  tipEl.style.display = 'block';
  const x = Math.min(e.clientX + 14, innerWidth - tipEl.offsetWidth - 8);
  tipEl.style.left = x + 'px';
  tipEl.style.top = e.clientY + 14 + 'px';
}
const hideTip = () => tipEl && (tipEl.style.display = 'none');
document.addEventListener('mousemove', (e) => {
  const seg = e.target.closest?.('[data-tip]');
  seg ? showTip(e, seg.dataset.tip) : hideTip();
});

// Donut chart in SVG. items: [{label, value}] in fixed order.
function donut(items, { center = '', sub = '', size = 180 } = {}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = 70, c = 2 * Math.PI * r, gap = total ? 2 : 0;
  let offset = 0;
  const segs = items.map((it, i) => {
    if (!it.value) return '';
    const len = (it.value / total) * c;
    const visible = Math.max(len - gap, 0.5);
    const tip = esc(`<b>${it.label}</b><br>${fmt(it.value)} · ${pct(it.value, total)}`);
    const seg = `<circle class="donut-seg" data-tip="${tip}" r="${r}" cx="90" cy="90" fill="none" stroke="${seriesColor(i)}" stroke-width="22"
      stroke-dasharray="${visible} ${c - visible}" stroke-dashoffset="${-offset}" transform="rotate(-90 90 90)"/>`;
    offset += len;
    return seg;
  }).join('');
  return `<div class="donut-wrap" style="max-width:${size}px">
    <svg viewBox="0 0 180 180" role="img" aria-label="${esc(items.map((i) => `${i.label}: ${fmt(i.value)}`).join(', '))}">
      <circle r="${r}" cx="90" cy="90" fill="none" stroke="var(--track)" stroke-width="22"/>${segs}
    </svg>
    <div class="donut-center"><div><b>${center}</b><span>${sub}</span></div></div>
  </div>`;
}

// Legend + bars: identity never relies on color alone (label + value on every row).
function legendBars(items) {
  const total = items.reduce((s, i) => s + i.value, 0);
  return items.map((it, i) => `
    <div class="legend-row" data-tip="${esc(`<b>${esc(it.label)}</b><br>${fmt(it.value)} tokens · ${pct(it.value, total)}`)}">
      <span class="swatch" style="background:${seriesColor(i)}"></span>
      <span>${esc(it.label)}</span>
      <span class="val">${fmt(it.value)}<small>${pct(it.value, total)}</small></span>
      <div class="bar-track"><div class="bar-fill" style="width:${total ? (it.value / total) * 100 : 0}%;background:${seriesColor(i)}"></div></div>
    </div>`).join('');
}

function decisionBadge(d, status) {
  const projected = status === 'active' ? ' (projected)' : '';
  if (d === 'PASSED') return `<span class="decision good">✓ Passed${projected}</span>`;
  if (d === 'REJECTED') return `<span class="decision bad">✕ Rejected${projected}</span>`;
  if (d === 'NO QUORUM') return `<span class="decision warn">⚠ ${status === 'active' ? 'Quorum not yet reached' : 'No quorum'}</span>`;
  if (d.startsWith('ELECTED')) return `<span class="decision info">★ ${esc(d.replace('ELECTED: ', status === 'active' ? 'Leading: ' : 'Elected: '))}</span>`;
  return `<span class="decision warn">${esc(d)}</span>`;
}

document.addEventListener('DOMContentLoaded', initTheme);
