/* Page renderers. Each returns an HTML string for #view. */

const ui = {
  route: 'dashboard', query: '', catFilter: null, selCat: null,
  sort: { key: 'diff', dir: -1 }, calOffset: 0, calDay: null, calCat: null,
  txScope: 'period', wiz: null, qa: null, lockPin: '',
};

const ROUTES = [
  ['dashboard', 'home', 'Dashboard'],
  ['transactions', 'list', 'Transactions'],
  ['budget', 'pie', 'Budget'],
  ['calendar', 'calendar', 'Calendar'],
  ['bills', 'repeat', 'Bills'],
  ['income', 'wallet', 'Income'],
  ['goals', 'target', 'Goals'],
  ['networth', 'bank', 'Net worth'],
  ['settings', 'settings', 'Settings'],
];

/* ---------- shared bits ---------- */

function pageHead(title, actions = '') {
  return `<div class="page-head"><h1>${title}</h1><div class="head-actions">${actions}</div></div>`;
}
function periodControls({ filter = true } = {}) {
  const P = getPeriod();
  const shift = P.mode !== 'custom';
  const fc = ui.catFilter && catById(ui.catFilter);
  return `<div class="period-nav">
      ${shift ? `<button class="icon-btn sm" data-action="period-shift" data-dir="-1" aria-label="Previous period">${icon('chevL', 16)}</button>` : ''}
      <button class="btn-outline" data-action="period-menu">${icon('calendar', 16)} <span>${esc(P.mode === 'payperiod' ? 'Pay period · ' + P.label : P.label)}</span></button>
      ${shift ? `<button class="icon-btn sm" data-action="period-shift" data-dir="1" aria-label="Next period">${icon('chevR', 16)}</button>` : ''}
    </div>
    ${filter ? `<button class="btn-outline ${fc ? 'active' : ''}" data-action="cat-filter-menu">${icon('filter', 16)} <span>${fc ? esc(fc.icon + ' ' + fc.name) : 'Filter by Category'}</span></button>` : ''}`;
}
function catAvatar(c, size = '') {
  return `<span class="cat-avatar ${size}" style="--c:${c.color}">${esc(c.icon || '•')}</span>`;
}
function statusPill(status, labels = { ok: 'On track', warn: 'Near limit', over: 'Over budget' }) {
  return `<span class="pill ${status}">${labels[status]}</span>`;
}
function catOptions(selected, { allowNone = false } = {}) {
  let html = allowNone ? `<option value="">— None —</option>` : '';
  for (const r of rootCats()) {
    html += `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>${esc(r.icon + ' ' + r.name)}</option>`;
    for (const c of childCats(r.id)) html += `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>&nbsp;&nbsp;&nbsp;↳ ${esc(c.icon + ' ' + c.name)}</option>`;
  }
  return html;
}
const matchesFilter = t => !ui.catFilter || (rootOf(t.categoryId)?.id === ui.catFilter) || t.categoryId === ui.catFilter;
function emptyState(text, btn = '') {
  return `<div class="empty"><p>${text}</p>${btn}</div>`;
}
function kpi(label, value, iconName, deltaHtml) {
  return `<div class="kpi"><div class="kpi-head"><span>${label}</span><span class="kpi-icon">${icon(iconName, 30)}</span></div>
    <div class="kpi-value">${value}</div>${deltaHtml}</div>`;
}
function delta(pct, goodWhenUp, suffix, unit = '%') {
  if (pct == null || !isFinite(pct)) return `<div class="kpi-delta muted">${suffix}</div>`;
  const up = pct >= 0, good = up === goodWhenUp;
  return `<div class="kpi-delta ${good ? 'good' : 'bad'}">${icon(up ? 'trendUp' : 'trendDown', 18)}<b>${up ? '+' : '−'}${Math.abs(pct).toFixed(1)}${unit}</b><span>${up ? 'Up' : 'Down'} ${suffix}</span></div>`;
}
const pctChange = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) * 100 : null);

function txRow(t, P, rowsById) {
  const c = catOrNone(t.categoryId), root = rootOf(t.categoryId) || UNCATEGORIZED;
  const r = rowsById[root.id];
  const status = r ? r.status : 'ok';
  return `<div class="tx-row" data-action="tx-edit" data-id="${t.id}" role="button" tabindex="0">
    <div class="tx-who">${catAvatar(c)}<span>${esc(c.name)}</span></div>
    <div class="tx-when"><b>${esc(fmtDate(t.date, { month: 'numeric', day: 'numeric', year: 'numeric' }))}</b><small>${esc(fmtDow(t.date))}</small><span class="tx-note">${esc(t.note || '—')}</span></div>
    <div class="tx-amt">${money(t.amount)}</div>
    <div class="tx-status">${statusPill(status)}<small>${r && r.target ? `Used: ${fmtPct(r.pct)}` : ''}</small></div>
  </div>`;
}

function piePair(P, rows) {
  const vis = rows.filter(r => r.actual > 0 || r.target > 0);
  const actual = vis.map(r => ({ id: r.cat.id, label: r.cat.name, value: r.actual, color: r.cat.color }));
  const target = vis.map(r => ({ id: r.cat.id, label: r.cat.name, value: r.target, color: r.cat.color }));
  const sel = ui.selCat && vis.find(r => r.cat.id === ui.selCat);
  const totA = sum(vis, r => r.actual), totT = sum(vis, r => r.target);
  return `<div class="pie-pair">
      <figure>${donut(actual, { selId: ui.selCat, caption: 'Actual spend' })}<figcaption>Actual spend</figcaption></figure>
      <figure>${donut(target, { selId: ui.selCat, caption: 'Budget targets' })}<figcaption>Budget targets</figcaption></figure>
    </div>
    ${sel ? `<div class="pie-detail">${catAvatar(sel.cat)}<div><b>${esc(sel.cat.name)}</b>
        <span>Spent <b>${money(sel.actual)}</b> (${totA ? (sel.actual / totA * 100).toFixed(1) : 0}% of spend) · Target <b>${money(sel.target)}</b> (${totT ? (sel.target / totT * 100).toFixed(1) : 0}% of budget)</span></div>
        ${statusPill(sel.status)}</div>` : `<p class="hint center">Tap a slice or category to compare it on both charts.</p>`}
    <div class="legend">${vis.map(r => `<button class="legend-item ${ui.selCat === r.cat.id ? 'sel' : ''}" data-action="slice" data-id="${r.cat.id}"><i style="background:${r.cat.color}"></i>${esc(r.cat.name)}</button>`).join('')}</div>`;
}

function varianceTable(rows, { limit = 0 } = {}) {
  const k = ui.sort.key, dir = ui.sort.dir;
  const val = r => (k === 'name' ? r.cat.name.toLowerCase() : k === 'pct' ? (isFinite(r.pct) ? r.pct : 1e9) : r[k]);
  let list = [...rows].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * dir);
  if (limit) list = list.slice(0, limit);
  const th = (key, label, cls = '') => `<th class="${cls}"><button class="th-sort ${k === key ? 'on' : ''}" data-action="sort" data-key="${key}">${label}${k === key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
  return `<div class="table-wrap"><table class="variance">
    <thead><tr>${th('name', 'Category')}${th('target', 'Target', 'num')}${th('actual', 'Actual', 'num')}${th('diff', 'Variance $', 'num')}${th('pct', 'Used %', 'num')}<th class="bar-col">Progress</th></tr></thead>
    <tbody>${list.map(r => `<tr class="${r.status}">
      <td><span class="cell-cat">${catAvatar(r.cat, 'sm')}${esc(r.cat.name)}</span></td>
      <td class="num">${money(r.target)}</td><td class="num">${money(r.actual)}</td>
      <td class="num var">${r.diff > 0 ? `${money(r.diff)} over` : `${money(-r.diff)} under`}</td>
      <td class="num">${fmtPct(r.pct)}</td>
      <td class="bar-col">${progressBar(r.target ? r.actual / r.target : (r.actual ? 1.01 : 0), r.cat.color)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

/* ---------- Dashboard ---------- */

function viewDashboard() {
  const P = getPeriod(), s = periodSummary(P), PP = prevPeriod(P), pv = periodSummary(PP);
  const t = todayISO(), live = t >= P.start && t <= P.end;
  const prevSpentSoFar = live ? spentInRange(PP.start, minISO(PP.end, addDays(PP.start, daysBetween(P.start, t)))) : pv.spent;
  const rowsById = Object.fromEntries(s.rows.map(r => [r.cat.id, r]));
  const noun = periodNoun(P);


  const kpis = `<section class="kpis">
    ${kpi('Income', money(s.income, { cents: false }), 'wallet', delta(pctChange(s.income, pv.income), true, `from last ${noun}`))}
    ${kpi('Spent', money(s.spent, { cents: false }), 'receipt', delta(pctChange(s.spent, prevSpentSoFar), false, live ? `vs. same point last ${noun}` : `from last ${noun}`))}
    ${kpi('Remaining', money(s.remaining, { cents: false }), 'coins', `<div class="kpi-delta ${s.totalTarget - s.spent >= 0 ? 'good' : 'bad'}">${icon('pie', 18)}<b>${money(Math.abs(s.totalTarget - s.spent), { cents: false })}</b><span>${s.totalTarget - s.spent >= 0 ? 'left in budget' : 'over budget'}</span></div>`)}
    ${kpi('Savings Rate', fmtPct(s.savingsRate, 1), 'percent', delta(pv.income ? s.savingsRate - pv.savingsRate : null, true, `from last ${noun}`, ' pts'))}
  </section>`;

  // "LIVE" pay cycle panel
  const np = nextPayday(), last = incomeEvents(addDays(t, -120), t).pop();
  const sts = safeToSpend(P, s);
  const cfg = currentPayCfg();
  const billsBefore = np ? billsInRange(t, np.date).filter(o => !o.paid) : [];
  const livePanel = `<section class="card live">
    <div class="live-head"><span class="live-dot"></span><h3>Pay cycle <b>LIVE</b></h3></div>
    <div class="live-body">
      <div class="live-agent">
        <div class="avatar xl">${esc(initials(S.profile.name))}</div>
        <div class="agent-name">${esc(S.profile.name || 'You')}</div>
        <button class="agent-role" data-action="go" data-route="income">${S.pay.type === 'salary' ? 'Salary' : 'Hourly'} · ${esc(FREQ_LABEL[cfg.frequency] || '')}</button>
      </div>
      <div class="live-call">
        ${np ? `<div class="call-status">${icon('wallet', 30)}<span>Next payday…</span></div>
          <div class="call-time"><small>Arrives</small><b>${esc(relDay(np.date))}</b></div>
          <div class="call-number">+${money(np.amount)}</div>
          <div class="call-date">${esc(fmtDate(np.date, { weekday: 'short', month: 'short', day: 'numeric' }))}${np.estimated ? ' · estimate' : ''}</div>`
        : `<div class="call-status">${icon('wallet', 30)}<span>No pay schedule yet</span></div><div class="call-number sm">Set up your pay</div><button class="btn-sm" data-action="go" data-route="income">Open Income</button>`}
      </div>
      <div class="live-stats">
        <div><small>Safe to spend</small><b>${sts ? money(sts.perDay, { cents: false }) : '—'}</b><em>${sts ? 'per day' : 'period closed'}</em></div>
        <div><small>Bills before payday</small><b>${billsBefore.length}</b><em>${money(sum(billsBefore, o => o.bill.amount), { cents: false })}</em></div>
        <div><small>Days left</small><b>${live ? daysBetween(t, P.end) + 1 : 0}</b><em>this ${noun}</em></div>
        <div><small>Last paid</small><b>${last ? esc(fmtDate(last.date)) : '—'}</b><em>${last ? money(last.amount, { cents: false }) : ''}</em></div>
      </div>
    </div>
  </section>`;

  // Weekly line chart
  const anchor = live ? t : P.end;
  const ws = startOfWeek(anchor);
  const pts = [...Array(7)].map((_, i) => {
    const d = addDays(ws, i);
    const v = sum(S.transactions.filter(x => x.date === d && matchesFilter(x)), x => x.amount);
    return { label: fmtDow(d), value: d > t ? null : v, tip: `${money(v)}\n${fmtDate(d, { weekday: 'long', month: 'short', day: 'numeric' })}`, highlight: d === anchor, calloutSub: d === t ? 'Today' : fmtDate(d) };
  });
  const dailyBudget = ui.catFilter ? (rowsById[ui.catFilter]?.target || 0) / periodDays(P) : s.totalTarget / periodDays(P);

  const ratio = s.totalTarget ? s.spent / s.totalTarget : 0;

  const recent = txInRange(P.start, P.end).filter(matchesFilter).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 12);
  const upcoming = billsInRange(addDays(t, -30), addDays(t, 30)).filter(o => !o.paid).slice(0, 5);

  return `${pageHead('Dashboard', periodControls())}${kpis}
  <div class="dash">
    <div class="dash-main">
      ${livePanel}
      <section class="card">
        <div class="card-head"><h3>Actual vs. <span class="accent">Budget</span></h3><a class="link" href="#/budget">Adjust targets →</a></div>
        ${piePair(P, s.rows)}
      </section>
      <div class="dash-pair">
        <section class="card gauge-card">
          <h3>Budget Used</h3>
          <div class="gauge-wrap">
            <div class="gauge-stats"><div><small>Total budget</small><b>${money(s.totalTarget, { cents: false })}</b></div><div><small>Spent</small><b>${money(s.spent, { cents: false })}</b></div></div>
            ${gauge(ratio, `of ${noun} budget`)}
          </div>
        </section>
        <section class="card">
          <h3>Spending <span class="accent">this week</span>${ui.catFilter ? ` <small class="muted">· ${esc(catById(ui.catFilter)?.name)}</small>` : ''}</h3>
          ${lineChart(pts, { ref: dailyBudget })}
        </section>
      </div>
      <section class="card">
        <div class="card-head"><h3>Budget vs. Actual</h3><a class="link" href="#/budget">Full breakdown →</a></div>
        ${varianceTable(s.rows, { limit: 6 })}
      </section>
    </div>
    <aside class="dash-side">
      <section class="card list-card">
        <div class="card-head"><h3>Recent Transactions</h3><a class="link" href="#/transactions">View all</a></div>
        <div class="tx-list">${recent.length ? recent.map(x => txRow(x, P, rowsById)).join('') : emptyState(`No transactions this ${noun} yet.`, `<button class="btn-primary" data-action="quick-add">Log a purchase</button>`)}</div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Upcoming Bills</h3><a class="link" href="#/bills">Manage</a></div>
        ${upcoming.length ? `<div class="mini-list">${upcoming.map(o => billMini(o)).join('')}</div>` : emptyState('No unpaid bills in the next 30 days.')}
      </section>
    </aside>
  </div>`;
}

function billMini(o) {
  const c = catOrNone(o.bill.categoryId);
  return `<div class="mini-row ${o.overdue ? 'overdue' : ''}">${catAvatar(c, 'sm')}<div><b>${esc(o.bill.name)}</b><small>${o.overdue ? 'Overdue · ' : ''}${esc(fmtDate(o.date))} · ${esc(relDay(o.date))}</small></div>
    <span class="amt">${money(o.bill.amount)}</span><button class="btn-sm" data-action="bill-pay" data-id="${o.bill.id}" data-date="${o.date}">Mark paid</button></div>`;
}

/* ---------- Transactions ---------- */

function viewTransactions() {
  const P = getPeriod();
  let list = ui.txScope === 'all' ? [...S.transactions] : txInRange(P.start, P.end);
  list = list.filter(matchesFilter);
  const q = ui.query.trim().toLowerCase();
  if (q) list = list.filter(t => `${t.note} ${catLabel(t.categoryId)} ${t.amount} ${t.date}`.toLowerCase().includes(q));
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const total = sum(list, t => t.amount);
  const groups = {};
  for (const t of list) (groups[t.date] ||= []).push(t);
  return `${pageHead('Transactions', `${periodControls()}<button class="btn-primary" data-action="quick-add">${icon('plus', 16)} Add</button>`)}
  <section class="card">
    <div class="toolbar">
      <div class="seg">
        <button class="${ui.txScope === 'period' ? 'active' : ''}" data-action="tx-scope" data-scope="period">This ${periodNoun(P)}</button>
        <button class="${ui.txScope === 'all' ? 'active' : ''}" data-action="tx-scope" data-scope="all">All time</button>
      </div>
      <span class="muted">${list.length} transaction${list.length === 1 ? '' : 's'} · <b class="text">${money(total)}</b>${q ? ` · matching “${esc(ui.query)}”` : ''}</span>
      ${q ? `<button class="btn-sm ghost" data-action="clear-search">Clear search</button>` : ''}
    </div>
    ${list.length ? Object.entries(groups).map(([d, txs]) => `
      <div class="day-group"><div class="day-head"><span>${esc(fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</span><span>${money(sum(txs, t => t.amount))}</span></div>
      ${txs.map(t => { const c = catOrNone(t.categoryId); return `<div class="tx-line" data-action="tx-edit" data-id="${t.id}" role="button" tabindex="0">${catAvatar(c)}
        <div class="grow"><b>${esc(t.note || c.name)}</b><small>${esc(catLabel(t.categoryId))}${t.billId ? ' · bill' : ''}</small></div>
        <span class="amt">${money(t.amount)}</span>
        <button class="icon-btn sm ghost" data-action="tx-delete" data-id="${t.id}" aria-label="Delete">${icon('trash', 16)}</button></div>`; }).join('')}</div>`).join('')
    : emptyState(q ? 'No transactions match your search.' : 'No transactions yet.', `<button class="btn-primary" data-action="quick-add">Log a purchase</button>`)}
  </section>`;
}

/* ---------- Budget ---------- */

function viewBudget() {
  const P = getPeriod(), s = periodSummary(P);
  const allocated = s.totalTarget, unalloc = s.income - allocated;
  return `${pageHead('Budget', periodControls({ filter: false }))}
  <div class="grid-2">
    <section class="card">
      <div class="card-head"><h3>Actual vs. <span class="accent">Budget</span></h3></div>
      ${piePair(P, s.rows)}
    </section>
    <section class="card">
      <div class="card-head"><h3>Category Targets</h3><button class="btn-sm" data-action="cat-add">${icon('plus', 14)} Category</button></div>
      <div class="alloc">
        <div><small>Income (${esc(periodNoun(P))})</small><b>${money(s.income, { cents: false })}</b></div>
        <div><small>Allocated</small><b>${money(allocated, { cents: false })}</b></div>
        <div class="${unalloc < 0 ? 'bad' : 'good'}"><small>${unalloc < 0 ? 'Over-allocated' : 'Unallocated → savings'}</small><b>${money(Math.abs(unalloc), { cents: false })}</b><em>${s.income ? fmtPct(Math.abs(unalloc) / s.income * 100) : ''}</em></div>
      </div>
      <div class="targets">${s.rows.filter(r => r.cat.id !== '_none').map(r => targetRow(r, P)).join('')}</div>
      <p class="hint">$ targets are per month (scaled for other periods). % targets recalculate automatically when your income changes.</p>
    </section>
  </div>
  <section class="card">
    <div class="card-head"><h3>Budget vs. Actual <span class="muted sm">· click a column to sort</span></h3>
      <div class="thresholds">Near limit at <input type="number" min="1" max="999" data-change="warnAt" value="${S.alerts.warnAt}" aria-label="Near-limit threshold">% · over at <input type="number" min="1" max="999" data-change="overAt" value="${S.alerts.overAt}" aria-label="Over-budget threshold">%</div></div>
    ${varianceTable(s.rows)}
  </section>`;
}

function targetRow(r, P) {
  const c = r.cat, subs = childCats(c.id);
  return `<div class="target-row ${r.status}">
    <button class="cat-btn" data-action="cat-edit" data-id="${c.id}" title="Edit category">${catAvatar(c)}</button>
    <div class="t-name"><b>${esc(c.name)}</b><small>${money(r.actual, { cents: false })} of ${money(r.target, { cents: false })}${subs.length ? ` · ${subs.map(x => esc(x.name)).join(', ')}` : ''}</small>${progressBar(r.target ? r.actual / r.target : 0, c.color)}</div>
    <div class="seg xs" role="group" aria-label="Target type">
      <button class="${c.targetType === 'amount' ? 'active' : ''}" data-action="target-type" data-id="${c.id}" data-type="amount">${esc(currencySymbol())}</button>
      <button class="${c.targetType === 'percent' ? 'active' : ''}" data-action="target-type" data-id="${c.id}" data-type="percent">%</button>
    </div>
    <label class="t-input"><input type="number" min="0" step="${c.targetType === 'percent' ? '0.5' : '1'}" value="${+c.target}" data-change="target" data-id="${c.id}" aria-label="${esc(c.name)} target"><span>${c.targetType === 'percent' ? '% of income' : '/ month'}</span></label>
  </div>`;
}

/* ---------- Calendar ---------- */

function viewCalendar() {
  const t = todayISO();
  const m0 = addMonths(startOfMonth(t), ui.calOffset, 1);
  const gridStart = startOfWeek(m0), mEnd = endOfMonth(m0);
  const gridEnd = addDays(startOfWeek(mEnd), 6);
  const inc = incomeEvents(gridStart, gridEnd);
  const bills = billsInRange(gridStart, gridEnd);
  const expected = S.pay.type === 'hourly' ? paydays(S.pay.hourly, maxISO(gridStart, S.pay.since), gridEnd).filter(d => !paycheckLoggedNear(d)) : [];
  const catOk = t2 => !ui.calCat || rootOf(t2.categoryId)?.id === ui.calCat;
  const txs = txInRange(gridStart, gridEnd).filter(catOk);
  const byDay = {};
  const push = (d, k, v) => { ((byDay[d] ||= { inc: [], bills: [], tx: [], exp: false })[k]).push(v); };
  inc.forEach(e => push(e.date, 'inc', e));
  bills.filter(o => !ui.calCat || rootOf(o.bill.categoryId)?.id === ui.calCat).forEach(o => push(o.date, 'bills', o));
  txs.forEach(x => push(x.date, 'tx', x));
  expected.forEach(d => { (byDay[d] ||= { inc: [], bills: [], tx: [], exp: false }).exp = true; });

  let cells = '';
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    const e = byDay[d] || { inc: [], bills: [], tx: [], exp: false };
    const out = d.slice(0, 7) !== m0.slice(0, 7);
    const spend = sum(e.tx, x => x.amount);
    const cats = [...new Set(e.tx.map(x => (rootOf(x.categoryId) || UNCATEGORIZED).id))].map(id => catOrNone(id));
    const chips = [
      ...e.inc.map(i => `<span class="chip pay">+${esc(moneyShort(i.amount))}${i.kind !== 'salary' && i.kind !== 'paycheck' ? ' ' + esc(INCOME_KINDS[i.kind] || '') : ''}</span>`),
      ...(e.exp ? [`<span class="chip pay outline">Payday · log</span>`] : []),
      ...e.bills.map(o => `<span class="chip bill ${o.paid ? 'paid' : o.overdue ? 'overdue' : ''}" style="--c:${catOrNone(o.bill.categoryId).color}">${esc(o.bill.name)}</span>`),
    ];
    cells += `<button class="cal-cell ${out ? 'out' : ''} ${d === t ? 'today' : ''} ${d === ui.calDay ? 'sel' : ''}" data-action="cal-day" data-date="${d}">
      <span class="cal-num">${parseISO(d).getDate()}</span>
      <div class="cal-chips">${chips.slice(0, 3).join('')}${chips.length > 3 ? `<span class="chip more">+${chips.length - 3}</span>` : ''}</div>
      ${spend ? `<div class="cal-spend"><span class="dots">${cats.slice(0, 5).map(c => `<i style="background:${c.color}"></i>`).join('')}</span>${esc(moneyShort(spend))}</div>` : ''}
    </button>`;
  }
  const monthLabel = parseISO(m0).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthInc = sum(inc.filter(i => i.date.slice(0, 7) === m0.slice(0, 7)), i => i.amount);
  const monthSpend = sum(txs.filter(i => i.date.slice(0, 7) === m0.slice(0, 7)), i => i.amount);

  return `${pageHead('Calendar', `<div class="period-nav"><button class="icon-btn sm" data-action="cal-shift" data-dir="-1" aria-label="Previous month">${icon('chevL', 16)}</button><button class="btn-outline" data-action="cal-today">${esc(monthLabel)}</button><button class="icon-btn sm" data-action="cal-shift" data-dir="1" aria-label="Next month">${icon('chevR', 16)}</button></div>
    <label class="select-wrap">${icon('filter', 16)}<select data-change="calCat" aria-label="Filter by category"><option value="">All categories</option>${rootCats().map(c => `<option value="${c.id}" ${ui.calCat === c.id ? 'selected' : ''}>${esc(c.icon + ' ' + c.name)}</option>`).join('')}</select></label>`)}
  <div class="cal-layout">
    <section class="card cal-card">
      <div class="cal-summary"><span><i class="cal-key pay"></i>Income <b>${money(monthInc, { cents: false })}</b></span><span><i class="cal-key spend"></i>Spent <b>${money(monthSpend, { cents: false })}</b></span><span><i class="cal-key bill"></i>Bills (outlined = upcoming)</span></div>
      <div class="cal-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<div class="cal-dow">${x}</div>`).join('')}${cells}</div>
    </section>
    <aside class="card cal-detail">${calDetail(ui.calDay || t, byDay)}</aside>
  </div>`;
}

function calDetail(d, byDay) {
  const e = byDay[d] || { inc: [], bills: [], tx: [], exp: false };
  const spend = sum(e.tx, x => x.amount);
  return `<h3>${esc(fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' }))}</h3>
    ${e.inc.length || e.exp ? `<h4>Income</h4>${e.inc.map(i => `<div class="mini-row"><span class="cat-avatar sm" style="--c:var(--green)">$</span><div><b>${esc(i.note || INCOME_KINDS[i.kind] || 'Salary')}</b><small>${esc(i.kind === 'salary' ? 'Scheduled salary' : INCOME_KINDS[i.kind])}</small></div><span class="amt good">+${money(i.amount)}</span></div>`).join('')}
      ${e.exp ? `<div class="mini-row"><span class="cat-avatar sm" style="--c:var(--green)">$</span><div><b>Expected payday</b><small>Not logged yet</small></div><button class="btn-sm" data-action="log-paycheck" data-date="${d}">Log</button></div>` : ''}` : ''}
    ${e.bills.length ? `<h4>Bills</h4>${e.bills.map(o => `<div class="mini-row">${catAvatar(catOrNone(o.bill.categoryId), 'sm')}<div><b>${esc(o.bill.name)}</b><small>${o.paid ? 'Paid' : o.overdue ? 'Overdue' : 'Upcoming'}</small></div><span class="amt">${money(o.bill.amount)}</span>${o.paid ? `<button class="btn-sm ghost" data-action="bill-unpay" data-id="${o.bill.id}" data-date="${o.date}">Undo</button>` : `<button class="btn-sm" data-action="bill-pay" data-id="${o.bill.id}" data-date="${o.date}">Paid</button>`}</div>`).join('')}` : ''}
    <h4>Spending ${spend ? `· ${money(spend)}` : ''}</h4>
    ${e.tx.length ? e.tx.map(x => { const c = catOrNone(x.categoryId); return `<div class="mini-row click" data-action="tx-edit" data-id="${x.id}">${catAvatar(c, 'sm')}<div><b>${esc(x.note || c.name)}</b><small>${esc(catLabel(x.categoryId))}</small></div><span class="amt">${money(x.amount)}</span></div>`; }).join('') : `<p class="muted">No purchases.</p>`}
    <button class="btn-outline block" data-action="quick-add" data-date="${d}">${icon('plus', 16)} Add purchase on this day</button>`;
}

/* ---------- Bills ---------- */

function viewBills() {
  const t = todayISO();
  const upcoming = billsInRange(addDays(t, -60), addDays(t, 45)).filter(o => !o.paid);
  const monthly = sum(S.bills, b => b.amount * ({ weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, once: 0 }[b.frequency] ?? 1));
  return `${pageHead('Recurring Bills', `<button class="btn-primary" data-action="bill-add">${icon('plus', 16)} Add bill</button>`)}
  <div class="grid-2">
    <section class="card">
      <div class="card-head"><h3>Upcoming & Overdue</h3><span class="muted">Shown until you mark them paid</span></div>
      ${upcoming.length ? `<div class="mini-list">${upcoming.map(billMini).join('')}</div>` : emptyState('Nothing due. 🎉')}
    </section>
    <section class="card">
      <div class="card-head"><h3>All Bills</h3><span class="muted">≈ <b class="text">${money(monthly)}</b> / month</span></div>
      ${S.bills.length ? `<div class="mini-list">${S.bills.map(b => { const c = catOrNone(b.categoryId); const next = billOccurrencesFor(b, t, addDays(t, 400)).find(d => !b.paid.includes(d)); return `<div class="mini-row click" data-action="bill-edit" data-id="${b.id}">${catAvatar(c, 'sm')}<div><b>${esc(b.name)}</b><small>${esc(BILL_FREQ[b.frequency])} · ${esc(c.name)}${next ? ` · next ${esc(fmtDate(next))}` : ''}</small></div><span class="amt">${money(b.amount)}</span></div>`; }).join('')}</div>`
        : emptyState('Add rent, utilities and other fixed costs once — they’ll appear on your calendar on their due dates.', `<button class="btn-primary" data-action="bill-add">Add a bill</button>`)}
    </section>
  </div>`;
}

/* ---------- Income ---------- */

function viewIncome() {
  const t = todayISO(), p = S.pay, hourly = p.type === 'hourly';
  const st = hourlyStats();
  const recent = incomeEvents(addDays(t, -180), t).reverse().slice(0, 25);
  const next = paydays(currentPayCfg(), t, addDays(t, 70)).slice(0, 5);
  const cfgForm = hourly ? `
    <form data-form="pay-hourly" class="form-grid">
      <label>Hourly rate<input name="rate" type="number" step="0.01" min="0" value="${+p.hourly.rate || ''}" required></label>
      <label>Typical hours / week<input name="hours" type="number" step="0.5" min="0" value="${+p.hourly.hours || ''}"></label>
      <label>Paid<select name="frequency">${Object.entries(FREQ_LABEL).map(([k, v]) => `<option value="${k}" ${p.hourly.frequency === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>A recent or upcoming payday<input name="anchor" type="date" value="${p.hourly.anchor}"></label>
      <button class="btn-primary" type="submit">Save schedule</button>
    </form>`
    : `
    <form data-form="pay-salary" class="form-grid">
      <label>Take-home per paycheck<input name="amount" type="number" step="0.01" min="0" value="${+p.salary.amount || ''}" required></label>
      <label>Paid<select name="frequency">${Object.entries(FREQ_LABEL).map(([k, v]) => `<option value="${k}" ${p.salary.frequency === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>A recent or upcoming payday<input name="anchor" type="date" value="${p.salary.anchor}"></label>
      <div class="calc-note">≈ <b>${money((+p.salary.amount || 0) * PER_MONTH[p.salary.frequency], { cents: false })}</b>/month · ${money((+p.salary.amount || 0) * PER_MONTH[p.salary.frequency] * 12, { cents: false })}/year</div>
      <button class="btn-primary" type="submit">Save schedule</button>
    </form>`;

  return `${pageHead('Income', `<button class="btn-outline" data-action="add-income">${icon('plus', 16)} Bonus / tips / side</button>${hourly ? `<button class="btn-primary" data-action="log-paycheck">${icon('plus', 16)} Log paycheck</button>` : ''}`)}
  <div class="grid-2">
    <section class="card">
      <h3>How do you get paid?</h3>
      ${payToggle()}
      <p class="hint">${hourly ? 'Hourly: log each paycheck as it arrives. iBudget plans around a conservative average so low-hour weeks don’t break your budget.' : 'Salary: enter your pay once and future paydays fill in automatically.'} Switching keeps all past income.</p>
      ${cfgForm}
    </section>
    <section class="card">
      <h3>${hourly ? 'Paycheck stats' : 'Upcoming paydays'}</h3>
      ${hourly ? `<div class="stat-row">
          <div><small>Conservative avg</small><b>${money(st.conservative, { cents: false })}</b></div>
          <div><small>Average</small><b>${money(st.mean, { cents: false })}</b></div>
          <div><small>Lowest</small><b>${money(st.low, { cents: false })}</b></div>
          <div><small>Logged</small><b>${st.count}</b></div></div>` : ''}
      <div class="mini-list">${next.map(d => `<div class="mini-row"><span class="cat-avatar sm" style="--c:var(--green)">$</span><div><b>${esc(fmtDate(d, { weekday: 'long', month: 'short', day: 'numeric' }))}</b><small>${esc(relDay(d))}</small></div><span class="amt good">${hourly ? '≈ ' + money(st.conservative, { cents: false }) : '+' + money(p.salary.amount)}</span></div>`).join('') || `<p class="muted">Add a payday date to see your schedule.</p>`}</div>
    </section>
  </div>
  <section class="card">
    <div class="card-head"><h3>Income history</h3><span class="muted">Last 6 months</span></div>
    ${recent.length ? `<div class="mini-list">${recent.map(i => `<div class="mini-row"><span class="cat-avatar sm" style="--c:${i.kind === 'salary' || i.kind === 'paycheck' ? 'var(--green)' : 'var(--cyan)'}">$</span>
      <div><b>${esc(i.note || INCOME_KINDS[i.kind] || 'Salary')}</b><small>${esc(fmtDate(i.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))} · ${esc(i.kind === 'salary' ? 'Salary (scheduled)' : INCOME_KINDS[i.kind])}${i.hours ? ` · ${i.hours}h × ${money(i.rate)}${i.otHours ? ` + ${i.otHours}h OT` : ''}` : ''}</small></div>
      <span class="amt good">+${money(i.amount)}</span>${i.scheduled ? '' : `<button class="icon-btn sm ghost" data-action="income-delete" data-id="${i.id}" aria-label="Delete">${icon('trash', 16)}</button>`}</div>`).join('')}</div>` : emptyState('No income recorded yet.')}
  </section>`;
}

function payToggle() {
  return `<div class="pay-toggle" role="radiogroup" aria-label="Pay type">
    <button role="radio" aria-checked="${S.pay.type === 'salary'}" class="${S.pay.type === 'salary' ? 'active' : ''}" data-action="pay-type" data-type="salary">${icon('wallet', 18)} Salary</button>
    <button role="radio" aria-checked="${S.pay.type === 'hourly'}" class="${S.pay.type === 'hourly' ? 'active' : ''}" data-action="pay-type" data-type="hourly">${icon('clock', 18)} Hourly</button>
    <span class="knob ${S.pay.type}"></span></div>`;
}

/* ---------- Goals ---------- */

function viewGoals() {
  return `${pageHead('Savings Goals', `<button class="btn-primary" data-action="goal-add">${icon('plus', 16)} New goal</button>`)}
  ${S.goals.length ? `<div class="goal-grid">${S.goals.map(g => {
    const ratio = g.target ? g.saved / g.target : 0;
    const left = Math.max(0, g.target - g.saved), months = Math.max(0, Math.round(daysBetween(todayISO(), g.date) / 30.4375));
    return `<section class="card goal">
      <div class="card-head"><h3>${esc(g.name)}</h3>${left <= 0 ? '<span class="pill ok">Done</span>' : ''}</div>
      <div class="goal-nums"><b>${money(g.saved, { cents: false })}</b><span>of ${money(g.target, { cents: false })} · by ${esc(fmtDate(g.date, { month: 'short', year: 'numeric' }))}</span></div>
      <div class="bar goal-bar"><span style="width:${clamp(ratio, 0, 1) * 100}%"></span></div>
      <div class="goal-meta"><span>${fmtPct(ratio * 100)} saved</span><span>${left <= 0 ? '' : `${money(left, { cents: false })} to go · ${months} month${months === 1 ? '' : 's'} left`}</span></div>
      <div class="row-actions"><button class="btn-primary sm" data-action="goal-contribute" data-id="${g.id}">Add money</button><button class="btn-sm ghost" data-action="goal-edit" data-id="${g.id}">Edit</button></div>
    </section>`;
  }).join('')}</div>` : `<section class="card">${emptyState('Set a goal amount and target date, then add money as you save to track your progress.', `<button class="btn-primary" data-action="goal-add">Create a goal</button>`)}</section>`}`;
}

/* ---------- Net worth ---------- */

function viewNetWorth() {
  const nw = S.netWorth;
  const a = sum(nw.assets, x => x.value), l = sum(nw.liabilities, x => x.value);
  const list = (type, items) => `${items.map((x, i) => `<div class="mini-row"><div><b>${esc(x.name)}</b></div><span class="amt">${money(x.value)}</span><button class="icon-btn sm ghost" data-action="nw-delete" data-type="${type}" data-idx="${i}" aria-label="Remove">${icon('trash', 16)}</button></div>`).join('') || '<p class="muted">Nothing added yet.</p>'}
    <form data-form="nw" data-type="${type}" class="inline-form"><input name="name" placeholder="${type === 'assets' ? 'e.g. Savings account' : 'e.g. Student loan'}" required aria-label="Name"><input name="value" type="number" step="0.01" min="0" placeholder="Value" required aria-label="Value"><button class="btn-sm" type="submit">${icon('plus', 14)} Add</button></form>`;
  return `${pageHead('Net Worth')}
  <section class="kpis three">
    ${kpi('Assets', money(a, { cents: false }), 'trendUp', '<div class="kpi-delta muted">What you own</div>')}
    ${kpi('Liabilities', money(l, { cents: false }), 'trendDown', '<div class="kpi-delta muted">What you owe</div>')}
    ${kpi('Net Worth', money(a - l, { cents: false }), 'bank', `<div class="kpi-delta ${a - l >= 0 ? 'good' : 'bad'}">${a ? `<b>${fmtPct((a - l) / a * 100)}</b><span>of assets are yours</span>` : ''}</div>`)}
  </section>
  <div class="grid-2"><section class="card"><h3>Assets</h3>${list('assets', nw.assets)}</section><section class="card"><h3>Liabilities</h3>${list('liabilities', nw.liabilities)}</section></div>`;
}

/* ---------- Settings ---------- */

function viewSettings() {
  const lock = S.settings.lock;
  return `${pageHead('Settings')}
  <div class="grid-2">
    <section class="card">
      <h3>Profile</h3>
      <form data-form="profile" class="form-grid">
        <label>Your name<input name="name" value="${esc(S.profile.name)}" placeholder="Name"></label>
        <label>Currency<select name="currency">${['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CZK', 'JPY', 'INR'].map(c => `<option ${S.settings.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <button class="btn-primary" type="submit">Save</button>
      </form>
    </section>
    <section class="card">
      <h3>Pay type</h3>
      ${payToggle()}
      <p class="hint">Changes apply instantly. Past income is kept. <a class="link" href="#/income">Edit pay schedule →</a></p>
    </section>
    <section class="card">
      <h3>Appearance</h3>
      <div class="seg">${['dark', 'light', 'system'].map(t => `<button class="${S.settings.theme === t ? 'active' : ''}" data-action="theme" data-theme="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
    </section>
    <section class="card">
      <h3>Budget status</h3>
      <div class="thresholds">Near limit at <input type="number" min="1" max="999" data-change="warnAt" value="${S.alerts.warnAt}" aria-label="Near-limit threshold">% · over at <input type="number" min="1" max="999" data-change="overAt" value="${S.alerts.overAt}" aria-label="Over-budget threshold">%</div>
      <p class="hint">Controls when categories show as “Near limit” or “Over budget”.</p>
    </section>
    <section class="card">
      <h3>${icon('lock', 18)} Security</h3>
      ${lock.enabled ? `<p>App lock is <b class="good">on</b>. ${lock.credId ? 'Biometric unlock is set up, with your PIN as fallback.' : 'Unlock with your PIN.'}</p>
        <div class="row-actions">${lock.credId ? '' : `<button class="btn-sm" data-action="bio-setup">${icon('fingerprint', 14)} Add Face ID / fingerprint</button>`}<button class="btn-sm" data-action="lock-now">Lock now</button><button class="btn-sm danger" data-action="lock-disable">Turn off</button></div>`
        : `<p class="muted">Require a PIN (and optionally Face ID / fingerprint) to open iBudget on this device.</p><button class="btn-primary sm" data-action="lock-setup">Set up app lock</button>`}
    </section>
    <section class="card">
      <h3>${icon('users', 18)} Shared budget</h3>
      <p class="muted">Invite a partner by email. They'll get a link to iBudget and a copy of your budget file to import. Live sync between devices needs a hosted server, which this version doesn't use.</p>
      <form data-form="invite" class="inline-form"><input name="email" type="email" placeholder="partner@email.com" required aria-label="Partner email"><button class="btn-sm" type="submit">Invite</button></form>
      ${S.shared.members.length ? `<div class="mini-list">${S.shared.members.map((m, i) => `<div class="mini-row"><span class="avatar sm">${esc(m.email[0].toUpperCase())}</span><div><b>${esc(m.email)}</b><small>Invited ${esc(fmtDate(m.invited))}</small></div><button class="icon-btn sm ghost" data-action="member-remove" data-idx="${i}" aria-label="Remove">${icon('x', 16)}</button></div>`).join('')}</div>` : ''}
    </section>
    <section class="card">
      <h3>Data</h3>
      <div class="row-actions wrap">
        <button class="btn-sm" data-action="export">${icon('download', 14)} Export CSV / PDF</button>
        <button class="btn-sm" data-action="backup">${icon('download', 14)} Backup (JSON)</button>
        <button class="btn-sm" data-action="import">${icon('upload', 14)} Restore / import</button>
        <button class="btn-sm" data-action="load-demo">Load sample data</button>
        <button class="btn-sm" data-action="rerun-setup">Re-run setup</button>
        <button class="btn-sm danger" data-action="reset">Erase everything</button>
      </div>
      <p class="hint">Your data is stored only in this browser.</p>
    </section>
  </div>`;
}

const VIEWS = {
  dashboard: viewDashboard, transactions: viewTransactions, budget: viewBudget, calendar: viewCalendar,
  bills: viewBills, income: viewIncome, goals: viewGoals, networth: viewNetWorth, settings: viewSettings,
};
