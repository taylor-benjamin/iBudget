/* Shared helpers: DOM, dates (ISO "YYYY-MM-DD" strings in local time), formatting, icons. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayISO = () => toISO(new Date());
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const startOfMonth = iso => iso.slice(0, 8) + '01';
const endOfMonth = iso => { const d = parseISO(iso); return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
const startOfWeek = iso => addDays(iso, -((parseISO(iso).getDay() + 6) % 7)); // Monday
const minISO = (a, b) => (a < b ? a : b);
const maxISO = (a, b) => (a > b ? a : b);
/** Add n months; the day is clamped to the target month's length (anchorDay defaults to iso's day). */
function addMonths(iso, n, anchorDay) {
  const d = parseISO(iso);
  const day = anchorDay ?? d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day, daysInMonth(t.getFullYear(), t.getMonth())));
  return toISO(t);
}
const fmtDate = (iso, o = { month: 'short', day: 'numeric' }) => parseISO(iso).toLocaleDateString('en-US', o);
const fmtDow = iso => parseISO(iso).toLocaleDateString('en-US', { weekday: 'short' });
function relDay(iso) {
  const n = daysBetween(todayISO(), iso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/* ---------- numbers ---------- */
const sum = (arr, f = x => x) => arr.reduce((s, x) => s + (+f(x) || 0), 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round2 = n => Math.round(n * 100) / 100;
const roundTo = (n, step) => Math.round(n / step) * step;
function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const _fmtCache = {};
function money(n, { cents = true, sign = false } = {}) {
  const cur = (window.S && S.settings.currency) || 'USD';
  const key = cur + cents;
  _fmtCache[key] ||= new Intl.NumberFormat('en-US', {
    style: 'currency', currency: cur,
    minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
  });
  const v = +n || 0;
  const s = _fmtCache[key].format(Math.abs(v));
  if (v < 0) return '−' + s;
  return sign && v > 0 ? '+' + s : s;
}
const moneyShort = n => money(n, { cents: Math.abs(n) < 1000 && Math.round(n) !== n });
function currencySymbol() {
  return money(0, { cents: false }).replace(/[\d\s.,−]/g, '') || '$';
}
const fmtPct = (n, d = 0) => (isFinite(n) ? n.toFixed(d) : '—') + '%';

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '🙂';
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

/* ---------- icons (24px stroke) ---------- */
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  pie: '<path d="M21 12.5A9 9 0 1 1 11.5 3v9.5z"/><path d="M15 3.3A9 9 0 0 1 20.7 9H15z"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18M7.5 14h.01M12 14h.01M16.5 14h.01M7.5 17.5h.01M12 17.5h.01"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5"/><path d="M16.5 14h.01"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 21h18"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  trendUp: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  trendDown: '<path d="M3 7l6 6 4-4 8 8"/><path d="M14 17h7v-7"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2.3 2-2.2-2-2.3 2-2.2-2L5 21z"/><path d="M9 8h6M9 12h6"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><circle cx="16.5" cy="15.5" r="5"/>',
  percent: '<path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>',
  chevR: '<path d="M9 18l6-6-6-6"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  fingerprint: '<path d="M12 11c0 3.5-1 6.5-3 9M8.5 7.5A5 5 0 0 1 17 11c0 1.5-.1 3-.4 4.5M6.3 9.6A7 7 0 0 0 6 11c0 2.2-.5 4.3-1.5 6M12 7a4 4 0 0 0-4 4c0 3.3-.8 6.3-2.4 8.7M16 17.5c-.4 1.3-1 2.6-1.6 3.7M12 15c-.2 2-.8 4-1.8 5.8"/>',
};
function icon(name, size = 20, extraClass = '') {
  return `<svg class="ico ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
