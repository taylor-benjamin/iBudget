/* Controller: routing, rendering, event delegation, modals, wizard, lock, export. */

/* ---------- theme ---------- */
function applyTheme() {
  const t = S.settings.theme;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

/* ---------- render ---------- */
function routeFromHash() {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0];
  return VIEWS[r] ? r : 'dashboard';
}

function render() {
  applyTheme();
  ui.route = routeFromHash();
  $('#nav').innerHTML = ROUTES.map(([id, ic, label]) =>
    `<a href="#/${id}" class="nav-item ${ui.route === id ? 'active' : ''}" title="${label}" aria-label="${label}" ${ui.route === id ? 'aria-current="page"' : ''}>${icon(ic, 24)}<span class="nav-label">${label}</span></a>`).join('');
  const P = getPeriod(), s = periodSummary(P);
  const left = s.totalTarget - s.spent;
  $('#sideLeft').innerHTML = `<b>${esc(moneyShort(Math.round(left)))}</b><span>${left >= 0 ? 'left to spend' : 'over budget'}</span>`;
  $('#userAvatar').textContent = initials(S.profile.name);
  $('#userName').textContent = S.profile.name || 'Set up profile';
  $('#view').innerHTML = VIEWS[ui.route]();
  document.title = `${ROUTES.find(r => r[0] === ui.route)[2]} · iBudget`;
}

/* ---------- inline form errors (no pop-up notifications) ---------- */
function formError(form, msg) {
  let el = form.querySelector('.form-error');
  if (!el) { el = document.createElement('p'); el.className = 'form-error'; el.setAttribute('role', 'alert'); form.appendChild(el); }
  el.textContent = msg;
}

/* ---------- modals ---------- */
function openModal({ title = '', body, cls = '', dismissable = true }) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-backdrop ${dismissable ? 'dismissable' : ''}"><div class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    ${title ? `<div class="modal-head"><h2>${esc(title)}</h2>${dismissable ? `<button class="icon-btn sm ghost" data-action="close-modal" aria-label="Close">${icon('x', 18)}</button>` : ''}</div>` : ''}
    <div class="modal-body">${body}</div></div></div>`;
  const f = root.querySelector('[autofocus]') || root.querySelector('input,select,button');
  setTimeout(() => f && f.focus(), 30);
  return root.firstElementChild;
}
function closeModal() { $('#modalRoot').innerHTML = ''; ui.qa = null; }

/* ---------- quick add ---------- */
function openQuickAdd(date, catId) {
  ui.qa = { cat: catId || null };
  const cats = [];
  for (const r of rootCats()) { cats.push(r); cats.push(...childCats(r.id)); }
  openModal({
    title: 'Quick add', cls: 'qa-modal',
    body: `<form data-form="quickadd" class="qa">
      <div class="qa-amount"><span>${esc(currencySymbol())}</span><input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="0.00" required autofocus aria-label="Amount"></div>
      <input type="hidden" name="categoryId" value="${catId || ''}">
      <div class="qa-cats">${cats.map(c => `<button type="button" class="qa-cat ${c.parentId ? 'sub' : ''} ${c.id === catId ? 'sel' : ''}" data-action="qa-cat" data-id="${c.id}" style="--c:${c.color}"><span>${esc(c.icon)}</span>${esc(c.name)}</button>`).join('')}</div>
      <details class="qa-more"><summary>Date & note (optional)</summary>
        <div class="form-grid two"><label>Date<input type="date" name="date" value="${date || todayISO()}"></label><label>Note<input name="note" placeholder="e.g. Coffee with Sam"></label></div></details>
      <button class="btn-primary block lg" type="submit">Save</button>
    </form>`,
  });
}

function openTxEdit(id) {
  const t = S.transactions.find(x => x.id === id);
  if (!t) return;
  openModal({
    title: 'Edit transaction',
    body: `<form data-form="tx" data-id="${t.id}" class="form-grid">
      <label>Amount<input name="amount" type="number" step="0.01" min="0.01" value="${t.amount}" required></label>
      <label>Category<select name="categoryId">${catOptions(t.categoryId)}</select></label>
      <label>Date<input name="date" type="date" value="${t.date}" required></label>
      <label>Note<input name="note" value="${esc(t.note)}"></label>
      <div class="row-actions"><button class="btn-primary" type="submit">Save</button><button type="button" class="btn-sm danger" data-action="tx-delete" data-id="${t.id}">Delete</button></div>
    </form>`,
  });
}

/* ---------- income modals ---------- */
function openPaycheck(date) {
  const h = S.pay.hourly;
  openModal({
    title: 'Log paycheck',
    body: `<form data-form="paycheck" class="form-grid">
      <label>Payday<input name="date" type="date" value="${date || todayISO()}" required></label>
      <div class="helper"><b>Hours × rate helper</b> <span class="muted">(optional)</span>
        <div class="form-grid three">
          <label>Hours<input name="hours" type="number" step="0.25" min="0" data-calc placeholder="${+h.hours * (WEEKS_PER_CHECK[h.frequency] || 2) || ''}"></label>
          <label>Rate<input name="rate" type="number" step="0.01" min="0" data-calc value="${+h.rate || ''}"></label>
          <label>Overtime hours<input name="otHours" type="number" step="0.25" min="0" data-calc></label>
          <label>OT rate<input name="otRate" type="number" step="0.01" min="0" data-calc value="${h.rate ? round2(h.rate * 1.5) : ''}"></label>
        </div><small class="muted">Gross from helper: <b id="calcGross">—</b>. Enter your actual take-home below.</small></div>
      <label>Take-home amount<input name="amount" type="number" step="0.01" min="0.01" required autofocus></label>
      <label>Note<input name="note" placeholder="Optional"></label>
      <button class="btn-primary" type="submit">Save paycheck</button>
    </form>`,
  });
}
function openIncome() {
  openModal({
    title: 'Add other income',
    body: `<form data-form="income" class="form-grid">
      <label>Type<select name="kind">${Object.entries(INCOME_KINDS).filter(([k]) => k !== 'paycheck').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Amount<input name="amount" type="number" step="0.01" min="0.01" required autofocus></label>
      <label>Date<input name="date" type="date" value="${todayISO()}" required></label>
      <label>Note<input name="note" placeholder="e.g. Holiday bonus"></label>
      <button class="btn-primary" type="submit">Add income</button>
    </form>`,
  });
}

/* ---------- category / bill / goal modals ---------- */
const PALETTE = ['#22c3ff', '#1fe29a', '#f6c945', '#ff8a3d', '#a78bfa', '#ff4fa3', '#2ee6d6', '#8ef05a', '#ff5a6e', '#6f8cff', '#ffb36b', '#c084fc'];
function openCategory(id) {
  const c = id ? catById(id) : { name: '', icon: '📦', color: PALETTE[S.categories.length % PALETTE.length], targetType: 'amount', target: 0, parentId: null };
  const hasKids = id && childCats(id).length;
  openModal({
    title: id ? 'Edit category' : 'New category',
    body: `<form data-form="cat" data-id="${id || ''}" class="form-grid">
      <label>Name<input name="name" value="${esc(c.name)}" required autofocus></label>
      <label>Icon (emoji)<input name="icon" value="${esc(c.icon)}" maxlength="4"></label>
      <label>Color<input name="color" type="color" value="${c.color}"></label>
      <label>Subcategory of<select name="parentId" ${hasKids ? 'disabled' : ''}><option value="">— Top-level category —</option>${rootCats().filter(r => r.id !== id).map(r => `<option value="${r.id}" ${c.parentId === r.id ? 'selected' : ''}>${esc(r.icon + ' ' + r.name)}</option>`).join('')}</select></label>
      <p class="hint">Subcategories roll up into their parent's budget, charts and calendar color.</p>
      <div class="row-actions"><button class="btn-primary" type="submit">Save</button>${id ? `<button type="button" class="btn-sm danger" data-action="cat-delete" data-id="${id}">Delete</button>` : ''}</div>
    </form>`,
  });
}
function openBill(id) {
  const b = id ? S.bills.find(x => x.id === id) : { name: '', amount: '', categoryId: rootCats()[0]?.id, frequency: 'monthly', due: todayISO() };
  openModal({
    title: id ? 'Edit bill' : 'New recurring bill',
    body: `<form data-form="bill" data-id="${id || ''}" class="form-grid">
      <label>Name<input name="name" value="${esc(b.name)}" required autofocus placeholder="e.g. Rent"></label>
      <label>Amount<input name="amount" type="number" step="0.01" min="0.01" value="${b.amount}" required></label>
      <label>Category<select name="categoryId">${catOptions(b.categoryId)}</select></label>
      <label>Repeats<select name="frequency">${Object.entries(BILL_FREQ).map(([k, v]) => `<option value="${k}" ${b.frequency === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>First due date<input name="due" type="date" value="${b.due}" required></label>
      <div class="row-actions"><button class="btn-primary" type="submit">Save</button>${id ? `<button type="button" class="btn-sm danger" data-action="bill-delete" data-id="${id}">Delete</button>` : ''}</div>
    </form>`,
  });
}
function openGoal(id) {
  const g = id ? S.goals.find(x => x.id === id) : { name: '', target: '', saved: 0, date: addMonths(todayISO(), 12) };
  openModal({
    title: id ? 'Edit goal' : 'New savings goal',
    body: `<form data-form="goal" data-id="${id || ''}" class="form-grid">
      <label>Goal name<input name="name" value="${esc(g.name)}" required autofocus placeholder="e.g. Emergency fund"></label>
      <label>Target amount<input name="target" type="number" step="0.01" min="1" value="${g.target}" required></label>
      <label>Already saved<input name="saved" type="number" step="0.01" min="0" value="${g.saved}"></label>
      <label>Target date<input name="date" type="date" value="${g.date}" required></label>
      <div class="row-actions"><button class="btn-primary" type="submit">Save goal</button>${id ? `<button type="button" class="btn-sm danger" data-action="goal-delete" data-id="${id}">Delete</button>` : ''}</div>
    </form>`,
  });
}

/* ---------- period & filter popovers ---------- */
function openPeriodMenu() {
  const p = S.period, P = getPeriod();
  openModal({
    title: 'Date range', cls: 'narrow',
    body: `<div class="seg block">
        <button class="${p.mode === 'month' ? 'active' : ''}" data-action="period-mode" data-mode="month">Month</button>
        <button class="${p.mode === 'payperiod' ? 'active' : ''}" data-action="period-mode" data-mode="payperiod">Pay period</button>
      </div>
      <form data-form="period-custom" class="form-grid">
        <h4>Custom range</h4>
        <label>From<input type="date" name="start" value="${P.start}" required></label>
        <label>To<input type="date" name="end" value="${P.end}" required></label>
        <button class="btn-primary" type="submit">Apply custom range</button>
      </form>`,
  });
}
function openCatFilter() {
  openModal({
    title: 'Filter by category', cls: 'narrow',
    body: `<div class="filter-list"><button class="filter-item ${!ui.catFilter ? 'sel' : ''}" data-action="cat-filter" data-id="">All categories</button>
      ${rootCats().map(c => `<button class="filter-item ${ui.catFilter === c.id ? 'sel' : ''}" data-action="cat-filter" data-id="${c.id}">${catAvatar(c, 'sm')}${esc(c.name)}</button>`).join('')}</div>`,
  });
}
/* ---------- export ---------- */
function openExport() {
  const P = getPeriod();
  openModal({
    title: 'Export data', cls: 'narrow',
    body: `<form data-form="export" class="form-grid">
      <label>From<input type="date" name="start" value="${P.start}" required></label>
      <label>To<input type="date" name="end" value="${P.end}" required></label>
      <div class="row-actions"><button class="btn-primary" type="submit" name="fmt" value="csv">${icon('download', 16)} CSV</button><button class="btn-outline" type="submit" name="fmt" value="pdf">${icon('download', 16)} PDF</button></div>
      <p class="hint">PDF opens a print view — choose “Save as PDF”.</p>
    </form>`,
  });
}
function exportRows(start, end) {
  const rows = [];
  for (const t of txInRange(start, end)) rows.push({ date: t.date, type: 'Expense', category: catLabel(t.categoryId), desc: t.note || '', amount: -t.amount });
  for (const i of incomeEvents(start, minISO(end, todayISO()))) rows.push({ date: i.date, type: i.kind === 'salary' ? 'Salary' : INCOME_KINDS[i.kind], category: 'Income', desc: i.note || '', amount: +i.amount });
  return rows.sort((a, b) => (a.date < b.date ? -1 : 1));
}
function exportCSV(start, end) {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['Date', 'Type', 'Category', 'Description', 'Amount'].join(',')];
  for (const r of exportRows(start, end)) lines.push([r.date, q(r.type), q(r.category), q(r.desc), r.amount.toFixed(2)].join(','));
  download(`ibudget-${start}-to-${end}.csv`, lines.join('\n'), 'text/csv');
}
function exportPDF(start, end) {
  const P = { mode: 'custom', start, end };
  const s = periodSummary(P);
  const rows = exportRows(start, end);
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups for this site to export a PDF.'); return; }
  w.document.write(`<!doctype html><html><head><title>iBudget report ${start} – ${end}</title><style>
    body{font:13px/1.45 system-ui,sans-serif;color:#111;margin:32px}h1{margin:0 0 4px}h2{margin:24px 0 8px;font-size:16px}
    table{width:100%;border-collapse:collapse}th,td{padding:5px 8px;border-bottom:1px solid #ddd;text-align:left}td.n,th.n{text-align:right}
    .cards{display:flex;gap:12px}.cards div{flex:1;border:1px solid #ddd;border-radius:8px;padding:10px}.cards b{display:block;font-size:18px}tr.over td{color:#c0143c}
  </style></head><body><h1>iBudget report</h1><div>${esc(fmtDate(start, { month: 'long', day: 'numeric', year: 'numeric' }))} – ${esc(fmtDate(end, { month: 'long', day: 'numeric', year: 'numeric' }))}</div>
  <h2>Summary</h2><div class="cards"><div>Income<b>${money(s.income)}</b></div><div>Spent<b>${money(s.spent)}</b></div><div>Remaining<b>${money(s.remaining)}</b></div><div>Savings rate<b>${fmtPct(s.savingsRate, 1)}</b></div></div>
  <h2>Budget vs. actual</h2><table><tr><th>Category</th><th class="n">Target</th><th class="n">Actual</th><th class="n">Variance</th></tr>
  ${s.rows.map(r => `<tr class="${r.status}"><td>${esc(r.cat.name)}</td><td class="n">${money(r.target)}</td><td class="n">${money(r.actual)}</td><td class="n">${money(r.diff, { sign: true })}</td></tr>`).join('')}</table>
  <h2>Transactions</h2><table><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th class="n">Amount</th></tr>
  ${rows.map(r => `<tr><td>${r.date}</td><td>${esc(r.type)}</td><td>${esc(r.category)}</td><td>${esc(r.desc)}</td><td class="n">${money(r.amount, { sign: true })}</td></tr>`).join('')}</table>
  <script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);
  w.document.close();
}

/* ---------- setup wizard ---------- */
function startWizard() {
  ui.wiz = {
    step: 0,
    name: S.profile.name || '',
    type: S.pay.type,
    salary: { ...S.pay.salary },
    hourly: { ...S.pay.hourly },
    cats: DEFAULT_CATEGORIES.map(([name, ic, color, pct]) => ({ name, icon: ic, color, pct, on: true })),
  };
  renderWizard();
}
function renderWizard() {
  const w = ui.wiz, steps = ['Welcome', 'Pay type', 'Pay details', 'Categories', 'Done'];
  const dots = `<div class="wiz-steps">${steps.map((s, i) => `<span class="${i === w.step ? 'on' : i < w.step ? 'done' : ''}">${esc(s)}</span>`).join('')}</div>`;
  const nav = (next = 'Next', skip = true) => `<div class="wiz-nav">${w.step > 0 ? `<button type="button" class="btn-sm ghost" data-action="wiz-back">Back</button>` : '<span></span>'}
    <div>${skip ? `<button type="button" class="btn-sm ghost" data-action="wiz-skip">Skip</button>` : ''}<button class="btn-primary" type="submit">${next}</button></div></div>`;
  let body = '';
  if (w.step === 0) {
    body = `<div class="wiz-hero">${$('.logo').innerHTML}<h2>Welcome to iBudget</h2><p>Let's get you budgeting in under two minutes: pay type, pay amount, categories. Every step can be skipped.</p></div>
      <label>What should we call you?<input name="name" value="${esc(w.name)}" placeholder="Your name" autofocus></label>
      ${nav('Get started', false)}
      <button type="button" class="btn-outline block" data-action="load-demo">Or explore with sample data</button>`;
  } else if (w.step === 1) {
    body = `<h2>How do you get paid?</h2><p class="muted">You can switch any time in Settings — your past data is kept.</p>
      <div class="type-cards">
        <button type="button" class="type-card ${w.type === 'salary' ? 'sel' : ''}" data-action="wiz-type" data-type="salary">${icon('wallet', 30)}<b>Salary</b><span>Same amount on a schedule. Paydays fill in automatically.</span></button>
        <button type="button" class="type-card ${w.type === 'hourly' ? 'sel' : ''}" data-action="wiz-type" data-type="hourly">${icon('clock', 30)}<b>Hourly</b><span>Pay varies. Log each paycheck; we plan around a safe average.</span></button>
      </div>${nav()}`;
  } else if (w.step === 2) {
    const c = w[w.type];
    const freq = `<label>How often?<select name="frequency">${Object.entries(FREQ_LABEL).map(([k, v]) => `<option value="${k}" ${c.frequency === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Next (or most recent) payday<input type="date" name="anchor" value="${c.anchor}"></label>`;
    body = w.type === 'salary'
      ? `<h2>Your salary</h2><div class="form-grid"><label>Take-home pay per paycheck<input name="amount" type="number" step="0.01" min="0" value="${+c.amount || ''}" placeholder="e.g. 2150" autofocus></label>${freq}</div>${nav()}`
      : `<h2>Your hourly pay</h2><div class="form-grid"><label>Hourly rate<input name="rate" type="number" step="0.01" min="0" value="${+c.rate || ''}" placeholder="e.g. 22.50" autofocus></label><label>Typical hours per week<input name="hours" type="number" step="0.5" min="0" value="${+c.hours || ''}" placeholder="e.g. 30"></label>${freq}</div>
         <p class="hint">Used only as a starting estimate — you'll log real paychecks as they arrive.</p>${nav()}`;
  } else if (w.step === 3) {
    const total = sum(w.cats.filter(c => c.on), c => c.pct);
    body = `<h2>Pick your categories</h2><p class="muted">Preloaded with suggested targets as % of income. Tap to toggle — fine-tune later.</p>
      <div class="wiz-cats">${w.cats.map((c, i) => `<button type="button" class="wiz-cat ${c.on ? 'on' : ''}" data-action="wiz-cat" data-idx="${i}" style="--c:${c.color}"><span>${c.icon}</span>${esc(c.name)}<em>${c.pct}%</em></button>`).join('')}</div>
      <p class="alloc-note">Allocated <b>${total}%</b> · <b class="good">${100 - total}%</b> left for savings</p>${nav()}`;
  } else {
    body = `<div class="wiz-hero"><div class="done-check">${icon('check', 40)}</div><h2>You're all set${w.name ? ', ' + esc(w.name.split(' ')[0]) : ''}!</h2>
      <p>Log purchases with the <b>Quick add</b> button (or press <kbd>N</kbd>). Your charts update instantly.</p></div>${nav('Start budgeting', false)}`;
  }
  openModal({ cls: 'wizard', dismissable: false, body: `${dots}<form data-form="wiz" class="wiz-form">${body}</form>` });
}
function wizCollect(form) {
  const w = ui.wiz, fd = Object.fromEntries(new FormData(form));
  if (w.step === 0) w.name = (fd.name || '').trim();
  if (w.step === 2) Object.assign(w[w.type], fd);
}
function finishWizard() {
  const w = ui.wiz;
  commit(st => {
    st.profile.name = w.name;
    if (st.transactions.length || st.incomes.length) {
      closePaySegment(); // re-running setup: keep past income under the old settings
    } else {
      st.pay.since = startOfMonth(todayISO());
      st.pay.history = [];
    }
    st.pay.type = w.type;
    st.pay.salary = { ...w.salary, amount: +w.salary.amount || 0 };
    st.pay.hourly = { ...w.hourly, rate: +w.hourly.rate || 0, hours: +w.hourly.hours || 0 };
    if (!st.transactions.length) st.categories = w.cats.filter(c => c.on).map(c => makeCategory(c.name, c.icon, c.color, c.pct));
    st.setupDone = true;
  });
  ui.wiz = null;
  closeModal();
}

/* ---------- app lock ---------- */
async function hashPin(pin) {
  const salt = S.settings.lock.salt || '';
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const ch of salt + ':' + pin) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return 'djb2-' + h;
}
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function biometricAvailable() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
  catch { return false; }
}
async function registerBiometric() {
  if (!(await biometricAvailable())) { alert('Face ID / fingerprint isn’t available in this browser. Open iBudget over https or localhost on a device with biometrics.'); return; }
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'iBudget' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'ibudget-user', displayName: S.profile.name || 'iBudget user' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000,
    } });
    commit(st => { st.settings.lock.credId = b64(cred.rawId); });
  } catch (e) { /* cancelled — PIN still works */ }
}
function showLock() {
  ui.lockPin = '';
  const lock = S.settings.lock;
  $('#lockRoot').innerHTML = `<div class="lock-screen"><div class="lock-box">
    <div class="logo big">${$('.logo').innerHTML}</div><h2>iBudget is locked</h2><p class="muted">Enter your PIN${lock.credId ? ' or use biometrics' : ''}</p>
    <div class="pin-dots" id="pinDots">${'<i></i>'.repeat(lock.pinLength || 4)}</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-action="pin-key" data-k="${n}">${n}</button>`).join('')}
      ${lock.credId ? `<button data-action="unlock-bio" aria-label="Use biometrics">${icon('fingerprint', 24)}</button>` : '<span></span>'}<button data-action="pin-key" data-k="0">0</button><button data-action="pin-key" data-k="back" aria-label="Delete">⌫</button></div>
  </div></div>`;
  if (lock.credId) unlockBiometric(true);
}
async function pinKey(k) {
  const lock = S.settings.lock, len = lock.pinLength || 4;
  ui.lockPin = k === 'back' ? ui.lockPin.slice(0, -1) : (ui.lockPin + k).slice(0, len);
  $$('#pinDots i').forEach((d, i) => d.classList.toggle('on', i < ui.lockPin.length));
  if (ui.lockPin.length === len) {
    if (await hashPin(ui.lockPin) === lock.pinHash) unlock();
    else { $('#pinDots').classList.add('shake'); ui.lockPin = ''; setTimeout(() => { $('#pinDots')?.classList.remove('shake'); $$('#pinDots i').forEach(d => d.classList.remove('on')); }, 450); }
  }
}
async function unlockBiometric(silent) {
  try {
    await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: unb64(S.settings.lock.credId) }],
      userVerification: 'required', timeout: 60000,
    } });
    unlock();
  } catch (e) { /* fall back to PIN */ }
}
function unlock() { $('#lockRoot').innerHTML = ''; }
function openLockSetup() {
  openModal({
    title: 'Set up app lock', cls: 'narrow',
    body: `<form data-form="lock" class="form-grid">
      <label>PIN (4–6 digits)<input name="pin" type="password" inputmode="numeric" pattern="\\d{4,6}" required autofocus autocomplete="new-password"></label>
      <label>Confirm PIN<input name="pin2" type="password" inputmode="numeric" pattern="\\d{4,6}" required autocomplete="new-password"></label>
      <label class="switch"><input type="checkbox" name="bio" checked><span></span> Also use Face ID / fingerprint if available</label>
      <p class="hint">The lock keeps others from opening iBudget on this device. Data in browser storage isn't encrypted.</p>
      <button class="btn-primary" type="submit">Turn on lock</button></form>`,
  });
}

/* ---------- actions (click delegation) ---------- */
const actions = {
  'go': el => { location.hash = '#/' + el.dataset.route; closeModal(); },
  'close-modal': closeModal,
  'quick-add': el => openQuickAdd(el.dataset.date),
  'qa-cat': el => {
    $$('.qa-cat').forEach(b => b.classList.toggle('sel', b === el));
    $('.qa input[name=categoryId]').value = el.dataset.id;
  },
  'tx-edit': el => openTxEdit(el.dataset.id),
  'tx-delete': el => {
    const t = S.transactions.find(x => x.id === el.dataset.id);
    if (!t || !confirm('Delete this transaction?')) return;
    closeModal();
    commit(st => {
      st.transactions = st.transactions.filter(x => x !== t);
      if (t.billId) { const b = st.bills.find(x => x.id === t.billId); if (b) b.paid = b.paid.filter(d => d !== t.billDate); }
    });
  },
  'tx-scope': el => { ui.txScope = el.dataset.scope; render(); },
  'clear-search': () => { ui.query = ''; $('#search').value = ''; render(); },
  'export': openExport,
  'period-menu': openPeriodMenu,
  'period-shift': el => commit(st => { st.period.offset = (st.period.offset || 0) + +el.dataset.dir; }),
  'period-mode': el => { closeModal(); commit(st => { st.period = { mode: el.dataset.mode, offset: 0, start: null, end: null }; }); },
  'cat-filter-menu': openCatFilter,
  'cat-filter': el => { ui.catFilter = el.dataset.id || null; closeModal(); render(); },
  'slice': el => { ui.selCat = ui.selCat === el.dataset.id ? null : el.dataset.id; render(); },
  'sort': el => { const k = el.dataset.key; ui.sort = { key: k, dir: ui.sort.key === k ? -ui.sort.dir : (k === 'name' ? 1 : -1) }; render(); },
  'target-type': el => {
    const c = catById(el.dataset.id), type = el.dataset.type;
    if (!c || c.targetType === type) return;
    const P = getPeriod(), s = periodSummary(P), cur = catTarget(c, P, s.income);
    commit(() => {
      c.targetType = type;
      c.target = type === 'percent' ? (s.income ? round2(cur / s.income * 100) : 0) : Math.round(cur / periodFactor(P));
    });
  },
  'cat-add': () => openCategory(),
  'cat-edit': el => openCategory(el.dataset.id),
  'cat-delete': el => {
    const id = el.dataset.id, c = catById(id);
    const n = S.transactions.filter(t => t.categoryId === id).length;
    if (!confirm(`Delete “${c.name}”?${n ? ` Its ${n} transaction(s) will move to ${c.parentId ? 'the parent category' : 'Uncategorized'}.` : ''}`)) return;
    closeModal();
    commit(st => {
      for (const t of st.transactions) if (t.categoryId === id) t.categoryId = c.parentId || null;
      for (const b of st.bills) if (b.categoryId === id) b.categoryId = c.parentId || null;
      for (const k of st.categories) if (k.parentId === id) k.parentId = null;
      st.categories = st.categories.filter(k => k.id !== id);
    });
  },
  'pay-type': el => {
    const type = el.dataset.type;
    if (S.pay.type === type) return;
    commit(() => setPayType(type));
  },
  'log-paycheck': el => openPaycheck(el.dataset.date),
  'add-income': openIncome,
  'income-delete': el => commit(st => { st.incomes = st.incomes.filter(i => i.id !== el.dataset.id); }),
  'bill-add': () => openBill(),
  'bill-edit': el => openBill(el.dataset.id),
  'bill-delete': el => { if (!confirm('Delete this bill? Past payments stay in your transactions.')) return; closeModal(); commit(st => { st.bills = st.bills.filter(b => b.id !== el.dataset.id); }); },
  'bill-pay': el => { closeModal(); commit(() => markBillPaid(el.dataset.id, el.dataset.date)); },
  'bill-unpay': el => commit(() => unmarkBillPaid(el.dataset.id, el.dataset.date)),
  'cal-shift': el => { ui.calOffset += +el.dataset.dir; ui.calDay = null; render(); },
  'cal-today': () => { ui.calOffset = 0; ui.calDay = todayISO(); render(); },
  'cal-day': el => { ui.calDay = el.dataset.date; render(); },
  'goal-add': () => openGoal(),
  'goal-edit': el => openGoal(el.dataset.id),
  'goal-delete': el => { if (!confirm('Delete this goal?')) return; closeModal(); commit(st => { st.goals = st.goals.filter(g => g.id !== el.dataset.id); }); },
  'goal-contribute': el => {
    const g = S.goals.find(x => x.id === el.dataset.id);
    openModal({ title: `Add to ${g.name}`, cls: 'narrow', body: `<form data-form="contribute" data-id="${g.id}" class="form-grid"><label>Amount<input name="amount" type="number" step="0.01" min="0.01" required autofocus></label><button class="btn-primary" type="submit">Add</button></form>` });
  },
  'nw-delete': el => commit(st => { st.netWorth[el.dataset.type].splice(+el.dataset.idx, 1); }),
  'member-remove': el => commit(st => { st.shared.members.splice(+el.dataset.idx, 1); }),
  'theme': el => commit(st => { st.settings.theme = el.dataset.theme; }),
  'lock-setup': openLockSetup,
  'lock-disable': () => { if (confirm('Turn off app lock?')) commit(st => { st.settings.lock = { enabled: false, pinHash: null, salt: null, credId: null }; }); },
  'lock-now': showLock,
  'bio-setup': registerBiometric,
  'unlock-bio': () => unlockBiometric(false),
  'pin-key': el => pinKey(el.dataset.k),
  'backup': () => download(`ibudget-backup-${todayISO()}.json`, JSON.stringify(S, null, 2), 'application/json'),
  'import': () => $('#importFile').click(),
  'load-demo': () => {
    if (S.transactions.length && !confirm('Replace your current data with sample data?')) return;
    const lock = S.settings.lock;
    S = demoState();
    S.settings.lock = lock;
    ui.wiz = null; closeModal(); saveState(); render();
  },
  'rerun-setup': startWizard,
  'reset': () => {
    if (!confirm('Erase all data in this browser? This cannot be undone.')) return;
    S = defaultState(); saveState(); render(); startWizard();
  },
  'wiz-back': () => { ui.wiz.step--; renderWizard(); },
  'wiz-skip': () => { ui.wiz.step++; renderWizard(); },
  'wiz-type': el => { ui.wiz.type = el.dataset.type; renderWizard(); },
  'wiz-cat': el => { const c = ui.wiz.cats[+el.dataset.idx]; c.on = !c.on; renderWizard(); },
};

/* ---------- forms ---------- */
const forms = {
  quickadd(fd, form) {
    const amount = +fd.amount;
    if (!(amount > 0)) return formError(form, 'Enter an amount.');
    if (!fd.categoryId) return formError(form, 'Pick a category.');
    const tx = { id: uid(), date: fd.date || todayISO(), amount: round2(amount), categoryId: fd.categoryId, note: (fd.note || '').trim() };
    closeModal();
    commit(st => st.transactions.push(tx));
  },
  tx(fd, form) {
    const t = S.transactions.find(x => x.id === form.dataset.id);
    closeModal();
    commit(() => Object.assign(t, { amount: round2(+fd.amount), categoryId: fd.categoryId, date: fd.date, note: fd.note.trim() }));
  },
  paycheck(fd) {
    const n = k => (fd[k] === '' || fd[k] == null ? undefined : +fd[k]);
    closeModal();
    commit(st => st.incomes.push({ id: uid(), date: fd.date, amount: round2(+fd.amount), kind: 'paycheck', hours: n('hours'), rate: n('rate'), otHours: n('otHours'), otRate: n('otRate'), note: fd.note.trim() || 'Paycheck' }));
  },
  income(fd) {
    closeModal();
    commit(st => st.incomes.push({ id: uid(), date: fd.date, amount: round2(+fd.amount), kind: fd.kind, note: fd.note.trim() }));
  },
  'pay-salary'(fd) {
    commit(() => { closePaySegment(); S.pay.salary = { amount: +fd.amount, frequency: fd.frequency, anchor: fd.anchor || todayISO() }; });
  },
  'pay-hourly'(fd) {
    commit(() => { S.pay.hourly = { rate: +fd.rate, hours: +fd.hours || 0, frequency: fd.frequency, anchor: fd.anchor || todayISO() }; });
  },
  cat(fd, form) {
    const id = form.dataset.id;
    closeModal();
    commit(st => {
      if (id) {
        const c = catById(id);
        Object.assign(c, { name: fd.name.trim(), icon: fd.icon || '•', color: fd.color });
        if ('parentId' in fd) c.parentId = fd.parentId || null;
      } else {
        st.categories.push({ ...makeCategory(fd.name.trim(), fd.icon || '•', fd.color, 0), targetType: 'amount', parentId: fd.parentId || null });
      }
    });
  },
  bill(fd, form) {
    const id = form.dataset.id;
    closeModal();
    commit(st => {
      const data = { name: fd.name.trim(), amount: round2(+fd.amount), categoryId: fd.categoryId, frequency: fd.frequency, due: fd.due };
      if (id) Object.assign(st.bills.find(b => b.id === id), data);
      else st.bills.push({ id: uid(), paid: [], ...data });
    });
  },
  goal(fd, form) {
    const id = form.dataset.id;
    closeModal();
    commit(st => {
      const data = { name: fd.name.trim(), target: +fd.target, saved: +fd.saved || 0, date: fd.date };
      if (id) Object.assign(st.goals.find(g => g.id === id), data);
      else st.goals.push({ id: uid(), created: todayISO(), ...data });
    });
  },
  contribute(fd, form) {
    const g = S.goals.find(x => x.id === form.dataset.id);
    closeModal();
    commit(() => { g.saved = round2(g.saved + +fd.amount); });
  },
  nw(fd, form) { commit(st => st.netWorth[form.dataset.type].push({ name: fd.name.trim(), value: +fd.value })); },
  profile(fd) { commit(st => { st.profile.name = fd.name.trim(); st.settings.currency = fd.currency; }); },
  'period-custom'(fd, form) {
    if (fd.end < fd.start) return formError(form, 'End date must be after start date.');
    closeModal();
    commit(st => { st.period = { mode: 'custom', offset: 0, start: fd.start, end: fd.end }; });
  },
  export(fd, form, submitter) {
    if (fd.end < fd.start) return formError(form, 'End date must be after start date.');
    (submitter?.value === 'pdf' ? exportPDF : exportCSV)(fd.start, fd.end);
    closeModal();
  },
  invite(fd, form) {
    const email = fd.email.trim();
    commit(st => st.shared.members.push({ email, invited: todayISO() }));
    download(`ibudget-shared-budget-${todayISO()}.json`, JSON.stringify({ ...S, settings: { ...S.settings, lock: { enabled: false } } }, null, 2), 'application/json');
    const body = `Hi! I'm sharing my budget with you in iBudget.\n\n1. Open iBudget: ${location.href.split('#')[0]}\n2. Go to Settings → Data → Restore / import\n3. Choose the budget file I'm attaching.\n`;
    location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Join my budget on iBudget')}&body=${encodeURIComponent(body)}`;
  },
  async lock(fd, form) {
    if (fd.pin !== fd.pin2) return formError(form, 'PINs don’t match.');
    const salt = b64(crypto.getRandomValues(new Uint8Array(12)));
    S.settings.lock = { enabled: true, salt, pinLength: fd.pin.length, pinHash: null, credId: null };
    S.settings.lock.pinHash = await hashPin(fd.pin);
    closeModal(); saveState(); render();
    if (fd.bio && await biometricAvailable()) registerBiometric();
  },
  wiz(fd, form) {
    wizCollect(form);
    if (ui.wiz.step >= 4) return finishWizard();
    ui.wiz.step++;
    renderWizard();
  },
};

const changes = {
  target: el => {
    const c = catById(el.dataset.id), v = Math.max(0, +el.value || 0);
    commit(() => { c.target = v; });
  },
  warnAt: el => commit(st => { st.alerts.warnAt = clamp(+el.value || 80, 1, 999); }),
  overAt: el => commit(st => { st.alerts.overAt = clamp(+el.value || 100, 1, 999); }),
  calCat: el => { ui.calCat = el.value || null; render(); },
};

/* ---------- global listeners ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) {
    if (el.tagName === 'A') e.preventDefault();
    e.stopPropagation();
    actions[el.dataset.action](el, e);
    return;
  }
  if (e.target.classList.contains('modal-backdrop') && e.target.classList.contains('dismissable')) closeModal();
});
document.addEventListener('keydown', e => {
  const el = e.target.closest?.('[data-action][role="button"], .slice');
  if (el && (e.key === 'Enter' || e.key === ' ') && el.tagName !== 'BUTTON') { e.preventDefault(); actions[el.dataset.action]?.(el, e); return; }
  if (e.key === 'Escape' && $('.modal-backdrop.dismissable')) closeModal();
  const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
  if (!typing && !$('.modal-backdrop') && !$('.lock-screen') && (e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openQuickAdd(); }
  if (!typing && e.key === '/' && !$('.modal-backdrop')) { e.preventDefault(); $('#search').focus(); }
});
document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]');
  if (!form || !forms[form.dataset.form]) return;
  e.preventDefault();
  forms[form.dataset.form](Object.fromEntries(new FormData(form)), form, e.submitter);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && changes[el.dataset.change]) changes[el.dataset.change](el, e);
});
document.addEventListener('input', e => {
  if (e.target.matches('[data-calc]')) {
    const f = e.target.form, v = n => +f[n].value || 0;
    const gross = v('hours') * v('rate') + v('otHours') * v('otRate');
    $('#calcGross').textContent = gross ? money(gross) : '—';
  }
});

// Tooltip for [data-tip]
const tipEl = $('#tooltip');
document.addEventListener('mouseover', e => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) { tipEl.classList.remove('show'); return; }
  tipEl.textContent = t.getAttribute('data-tip');
  tipEl.classList.add('show');
});
document.addEventListener('mousemove', e => {
  if (!tipEl.classList.contains('show')) return;
  const x = Math.min(e.clientX + 14, innerWidth - tipEl.offsetWidth - 8);
  tipEl.style.transform = `translate(${x}px, ${e.clientY + 14}px)`;
});

// Search
$('#searchIcon').innerHTML = icon('search', 16);
$('#search').addEventListener('input', e => {
  ui.query = e.target.value;
  ui.txScope = ui.query ? 'all' : ui.txScope;
  if (ui.route !== 'transactions') location.hash = '#/transactions';
  else render();
});

$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.categories)) throw new Error('Not an iBudget file');
    if (!confirm('Replace the data in this browser with the imported file?')) return;
    const lock = S.settings.lock;
    S = deepMerge(defaultState(), data);
    S.settings.lock = lock;
    saveState(); render();
  } catch (err) { alert('That file couldn’t be imported: ' + err.message); }
});

window.addEventListener('hashchange', () => { closeModal(); render(); $('#view').focus({ preventScroll: true }); window.scrollTo(0, 0); });

/* ---------- boot ---------- */
render();
if (S.settings.lock.enabled && S.settings.lock.pinHash) showLock();
if (!S.setupDone) startWizard();
else if (new URLSearchParams(location.search).has('quickadd')) openQuickAdd();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
