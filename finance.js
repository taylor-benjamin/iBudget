/* Budget math: pay schedules, income, periods, category targets, bills. */

const FREQ_LABEL = { weekly: 'Weekly', biweekly: 'Every 2 weeks', semimonthly: 'Twice a month', monthly: 'Monthly' };
const PER_MONTH = { weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1 };
const WEEKS_PER_CHECK = { weekly: 1, biweekly: 2, semimonthly: 52 / 24, monthly: 52 / 12 };
const INCOME_KINDS = { paycheck: 'Paycheck', bonus: 'Bonus', tips: 'Tips', side: 'Side income', other: 'Other income' };
const BILL_FREQ = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', once: 'One time' };

/* ---------- pay schedule ---------- */

/** Paydays for a schedule { frequency, anchor } within [start, end]. */
function paydays(cfg, start, end) {
  const out = [];
  if (!cfg || !cfg.anchor || start > end) return out;
  const f = cfg.frequency;
  if (f === 'weekly' || f === 'biweekly') {
    const step = f === 'weekly' ? 7 : 14;
    let d = addDays(cfg.anchor, Math.ceil(daysBetween(cfg.anchor, start) / step) * step);
    while (d <= end) { out.push(d); d = addDays(d, step); }
  } else {
    const day = parseISO(cfg.anchor).getDate();
    for (let m = startOfMonth(start); m <= end; m = addMonths(m, 1, 1)) {
      const days = f === 'semimonthly' ? [addDays(m, 14), endOfMonth(m)] : [addMonths(m, 0, day)];
      for (const d of days) if (d >= start && d <= end) out.push(d);
    }
  }
  return out;
}

/** Pay history as segments so switching pay type or salary keeps past income intact. */
function paySegments() {
  const p = S.pay;
  return [...p.history, { type: p.type, start: p.since, end: null, salary: { ...p.salary }, hourly: { ...p.hourly } }];
}
function closePaySegment() {
  const p = S.pay, t = todayISO();
  if (p.since < t) p.history.push({ type: p.type, start: p.since, end: addDays(t, -1), salary: { ...p.salary }, hourly: { ...p.hourly } });
  p.since = t;
}
function setPayType(type) {
  if (S.pay.type === type) return;
  closePaySegment();
  S.pay.type = type;
}
const currentPayCfg = () => S.pay[S.pay.type];

/** Income in range: scheduled salary paydays + everything logged (hourly checks, bonuses, tips…). */
function incomeEvents(start, end) {
  const ev = [];
  for (const seg of paySegments()) {
    if (seg.type !== 'salary' || !(+seg.salary.amount)) continue;
    const s = maxISO(start, seg.start), e = seg.end ? minISO(end, seg.end) : end;
    for (const d of paydays(seg.salary, s, e)) {
      ev.push({ id: 'sal-' + d, date: d, amount: +seg.salary.amount, kind: 'salary', scheduled: true, note: 'Salary' });
    }
  }
  for (const i of S.incomes) if (i.date >= start && i.date <= end) ev.push(i);
  return ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const hourlyPaychecks = () => S.incomes.filter(i => i.kind === 'paycheck').sort((a, b) => (a.date < b.date ? -1 : 1));

/** Rolling stats over the last 8 hourly paychecks. `conservative` = lower of mean and median. */
function hourlyStats() {
  const h = S.pay.hourly;
  const fallback = (+h.rate || 0) * (+h.hours || 0) * (WEEKS_PER_CHECK[h.frequency] || 2);
  const pcs = hourlyPaychecks().slice(-8);
  if (!pcs.length) return { count: 0, mean: fallback, median: fallback, conservative: fallback, low: fallback, high: fallback, last: null, fallback: true };
  const amts = pcs.map(p => +p.amount);
  const mean = sum(amts) / amts.length, med = median(amts);
  return { count: amts.length, mean, median: med, conservative: Math.min(mean, med), low: Math.min(...amts), high: Math.max(...amts), last: pcs[pcs.length - 1], fallback: false };
}
const paycheckLoggedNear = d => S.incomes.some(i => i.kind === 'paycheck' && Math.abs(daysBetween(i.date, d)) <= 3);

function incomeSummary(P) {
  const t = todayISO();
  const events = incomeEvents(P.start, P.end);
  const received = sum(events.filter(e => e.date <= t), e => e.amount);
  const scheduled = sum(events.filter(e => e.date > t), e => e.amount);
  let projected = 0;
  if (S.pay.type === 'hourly') {
    const avg = hourlyStats().conservative;
    for (const d of paydays(S.pay.hourly, maxISO(maxISO(P.start, S.pay.since), t), P.end)) {
      if (!paycheckLoggedNear(d)) projected += avg;
    }
  }
  return { events, received, scheduled, projected, total: received + scheduled + projected };
}

function nextPayday() {
  const cfg = currentPayCfg(), t = todayISO();
  if (!cfg || !cfg.anchor) return null;
  const d = paydays(cfg, t, addDays(t, 62)).find(x => S.pay.type === 'salary' || !paycheckLoggedNear(x) || x > t);
  if (!d) return null;
  const hourly = S.pay.type === 'hourly';
  return { date: d, amount: hourly ? hourlyStats().conservative : +cfg.amount, estimated: hourly };
}

/* ---------- periods ---------- */

function monthPeriod(offset = 0) {
  const m = addMonths(startOfMonth(todayISO()), offset, 1);
  return { mode: 'month', offset, start: m, end: endOfMonth(m), label: parseISO(m).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
}
function payPeriod(offset = 0) {
  const cfg = currentPayCfg(), t = todayISO();
  const ds = cfg && cfg.anchor ? paydays(cfg, addDays(t, -800), addDays(t, 800)) : [];
  let i = -1;
  ds.forEach((d, k) => { if (d <= t) i = k; });
  const j = i + offset;
  if (i < 0 || j < 0 || j + 1 >= ds.length) return { ...monthPeriod(offset), fallback: true };
  const start = ds[j], end = addDays(ds[j + 1], -1);
  return { mode: 'payperiod', offset, start, end, label: `${fmtDate(start)} – ${fmtDate(end)}` };
}
function getPeriod() {
  const p = S.period;
  if (p.mode === 'custom' && p.start && p.end) {
    const o = { month: 'short', day: 'numeric', year: 'numeric' };
    return { mode: 'custom', offset: 0, start: p.start, end: p.end, label: `${fmtDate(p.start, o)} – ${fmtDate(p.end, o)}` };
  }
  if (p.mode === 'payperiod') return payPeriod(p.offset || 0);
  return monthPeriod(p.offset || 0);
}
function prevPeriod(P) {
  if (P.mode === 'month') return monthPeriod(P.offset - 1);
  if (P.mode === 'payperiod') return payPeriod(P.offset - 1);
  const len = periodDays(P);
  return { mode: 'custom', offset: 0, start: addDays(P.start, -len), end: addDays(P.start, -1) };
}
const periodDays = P => daysBetween(P.start, P.end) + 1;
/** Fixed $ targets are monthly; scale them to other period lengths. */
const periodFactor = P => (P.mode === 'month' ? 1 : periodDays(P) / 30.4375);
function elapsedFraction(P) {
  const t = todayISO();
  if (t < P.start) return 0;
  if (t > P.end) return 1;
  return (daysBetween(P.start, t) + 1) / periodDays(P);
}
const periodNoun = P => (P.mode === 'month' ? 'month' : 'period');

/* ---------- categories & budget ---------- */

const catById = id => S.categories.find(c => c.id === id);
const rootCats = () => S.categories.filter(c => !c.parentId);
const childCats = id => S.categories.filter(c => c.parentId === id);
function rootOf(id) {
  let c = catById(id);
  let guard = 0;
  while (c && c.parentId && guard++ < 10) { const p = catById(c.parentId); if (!p) break; c = p; }
  return c || null;
}
function catLabel(id) {
  const c = catById(id);
  if (!c) return 'Uncategorized';
  const r = rootOf(id);
  return r && r.id !== c.id ? `${r.name} › ${c.name}` : c.name;
}
const UNCATEGORIZED = { id: '_none', name: 'Uncategorized', icon: '❔', color: '#8d9399', targetType: 'amount', target: 0 };
const catOrNone = id => catById(id) || UNCATEGORIZED;

const txInRange = (start, end) => S.transactions.filter(t => t.date >= start && t.date <= end);
const spentInRange = (start, end) => sum(txInRange(start, end), t => t.amount);

function catTarget(cat, P, income) {
  return cat.targetType === 'percent' ? income * (+cat.target || 0) / 100 : (+cat.target || 0) * periodFactor(P);
}
function catStatus(actual, target) {
  const pct = target > 0 ? actual / target * 100 : (actual > 0 ? Infinity : 0);
  if (pct >= S.alerts.overAt) return 'over';
  if (pct >= S.alerts.warnAt) return 'warn';
  return 'ok';
}
function budgetRows(P, income) {
  const spend = {};
  for (const t of txInRange(P.start, P.end)) {
    const r = rootOf(t.categoryId);
    const k = r ? r.id : '_none';
    spend[k] = (spend[k] || 0) + (+t.amount || 0);
  }
  const rows = rootCats().map(cat => {
    const target = catTarget(cat, P, income), actual = spend[cat.id] || 0;
    return { cat, target, actual, diff: actual - target, pct: target > 0 ? actual / target * 100 : (actual > 0 ? Infinity : 0), status: catStatus(actual, target) };
  });
  if (spend._none) rows.push({ cat: UNCATEGORIZED, target: 0, actual: spend._none, diff: spend._none, pct: Infinity, status: 'over' });
  return rows;
}
function periodSummary(P) {
  const inc = incomeSummary(P);
  const rows = budgetRows(P, inc.total);
  const spent = sum(rows, r => r.actual);
  const totalTarget = sum(rows, r => r.target);
  return {
    P, inc, rows, spent, totalTarget,
    income: inc.total,
    remaining: inc.total - spent,
    savingsRate: inc.total > 0 ? (inc.total - spent) / inc.total * 100 : 0,
  };
}
function rowFor(catId, P) {
  const s = periodSummary(P);
  const r = rootOf(catId);
  return s.rows.find(x => x.cat.id === (r ? r.id : '_none'));
}

/* ---------- bills ---------- */

function billOccurrencesFor(b, start, end) {
  const out = [];
  if (!b.due || start > end) return out;
  const s = maxISO(start, b.due);
  if (b.frequency === 'once') {
    if (b.due >= start && b.due <= end) out.push(b.due);
  } else if (b.frequency === 'weekly') {
    let d = addDays(b.due, Math.max(0, Math.ceil(daysBetween(b.due, s) / 7)) * 7);
    while (d <= end) { out.push(d); d = addDays(d, 7); }
  } else {
    const step = { monthly: 1, quarterly: 3, yearly: 12 }[b.frequency] || 1;
    const d0 = parseISO(b.due), sd = parseISO(s), day = d0.getDate();
    const diff = (sd.getFullYear() - d0.getFullYear()) * 12 + sd.getMonth() - d0.getMonth();
    for (let k = Math.max(0, Math.floor(diff / step) - 1), g = 0; g < 600; k++, g++) {
      const d = addMonths(b.due, k * step, day);
      if (d > end) break;
      if (d >= s) out.push(d);
    }
  }
  return out;
}
function billsInRange(start, end) {
  const t = todayISO(), out = [];
  for (const b of S.bills) {
    for (const d of billOccurrencesFor(b, start, end)) {
      const paid = (b.paid || []).includes(d);
      out.push({ bill: b, date: d, paid, overdue: !paid && d < t });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
function markBillPaid(billId, date) {
  const b = S.bills.find(x => x.id === billId);
  if (!b || b.paid.includes(date)) return;
  b.paid.push(date);
  const t = todayISO();
  S.transactions.push({ id: uid(), date: date <= t ? date : t, amount: +b.amount, categoryId: b.categoryId, note: b.name, billId: b.id, billDate: date });
}
function unmarkBillPaid(billId, date) {
  const b = S.bills.find(x => x.id === billId);
  if (!b) return;
  b.paid = b.paid.filter(d => d !== date);
  S.transactions = S.transactions.filter(t => !(t.billId === billId && t.billDate === date));
}
function unpaidBillsTotal(start, end) {
  return sum(billsInRange(start, end).filter(o => !o.paid), o => o.bill.amount);
}

/* ---------- derived insight numbers ---------- */

function safeToSpend(P, s = periodSummary(P)) {
  const t = todayISO();
  if (t < P.start || t > P.end) return null;
  const daysLeft = daysBetween(t, P.end) + 1;
  const bills = unpaidBillsTotal(t, P.end);
  const pool = Math.min(s.totalTarget, s.income) - s.spent - bills;
  return { perDay: Math.max(0, pool / daysLeft), pool, daysLeft, bills };
}
