/* Persistent state (localStorage) and the sample-data generator. */

const STORE_KEY = 'ibudget.v1';
const LEGACY_KEYS = ['tally.budget.v1'];

const DEFAULT_CATEGORIES = [
  // name, icon, color, suggested % of income
  ['Housing', '🏠', '#22c3ff', 30],
  ['Groceries', '🛒', '#1fe29a', 12],
  ['Transport', '🚗', '#f6c945', 10],
  ['Dining', '🍽️', '#ff8a3d', 6],
  ['Utilities', '💡', '#a78bfa', 6],
  ['Entertainment', '🎬', '#ff4fa3', 5],
  ['Shopping', '🛍️', '#2ee6d6', 5],
  ['Health', '💊', '#8ef05a', 4],
  ['Subscriptions', '🔁', '#ff5a6e', 2],
  ['Personal', '✨', '#6f8cff', 5],
];

function makeCategory(name, icon, color, pct) {
  return { id: uid(), name, icon, color, targetType: 'percent', target: pct, parentId: null };
}
const makeDefaultCategories = () => DEFAULT_CATEGORIES.map(c => makeCategory(...c));

function defaultState() {
  const t = todayISO();
  return {
    version: 1,
    setupDone: false,
    profile: { name: '' },
    pay: {
      type: 'salary',
      since: startOfMonth(t),
      salary: { amount: 0, frequency: 'biweekly', anchor: t },
      hourly: { rate: 0, hours: 0, frequency: 'biweekly', anchor: t },
      history: [], // closed segments: { type, start, end, salary, hourly }
    },
    incomes: [],      // logged income: { id, date, amount, kind, hours, rate, otHours, otRate, note }
    categories: makeDefaultCategories(),
    transactions: [], // { id, date, amount, categoryId, note, billId?, billDate? }
    bills: [],        // { id, name, amount, categoryId, frequency, due, paid: [dates] }
    goals: [],        // { id, name, target, saved, date, created }
    alerts: { warnAt: 80, overAt: 100 },
    period: { mode: 'month', offset: 0, start: null, end: null },
    settings: { theme: 'dark', currency: 'USD', lock: { enabled: false, pinHash: null, salt: null, credId: null } },
    netWorth: { assets: [], liabilities: [] },
    shared: { members: [] },
  };
}

const isPlain = v => v && typeof v === 'object' && !Array.isArray(v);
function deepMerge(base, over) {
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = isPlain(base[k]) && isPlain(over[k]) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

/** Drop fields from older versions (notifications, AI suggestions). */
function stripRemoved(st) {
  delete st.undo;
  delete st.subscriptionFlags;
  delete st.settings.notifications;
  delete st.alerts.fired;
  delete st.alerts.reminded;
  for (const c of st.categories) delete c.muted;
  return st;
}

function loadState() {
  try {
    let raw = localStorage.getItem(STORE_KEY);
    for (const k of LEGACY_KEYS) if (!raw && (raw = localStorage.getItem(k))) localStorage.removeItem(k);
    if (raw) return stripRemoved(deepMerge(defaultState(), JSON.parse(raw)));
  } catch (e) { console.warn('Could not load saved data', e); }
  return defaultState();
}

function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) { console.error('Could not save — browser storage is full or blocked.', e); }
}

var S = loadState();

/** Mutate state, persist, re-render. */
function commit(fn) {
  if (fn) fn(S);
  saveState();
  render();
}

/* ---------- sample data ---------- */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoState() {
  const st = defaultState();
  const t = todayISO();
  const start = addMonths(startOfMonth(t), -4, 1);
  let anchor = start;
  while (parseISO(anchor).getDay() !== 5) anchor = addDays(anchor, 1); // a Friday

  st.setupDone = true;
  st.profile.name = 'Alex Rivera';
  st.pay = {
    type: 'salary', since: start, history: [],
    salary: { amount: 2150, frequency: 'biweekly', anchor },
    hourly: { rate: 24, hours: 32, frequency: 'biweekly', anchor },
  };

  const C = Object.fromEntries(st.categories.map(c => [c.name, c]));
  C.Housing.targetType = 'amount'; C.Housing.target = 1350;
  C.Subscriptions.targetType = 'amount'; C.Subscriptions.target = 45;
  const coffee = { ...makeCategory('Coffee', '☕', '#ffb36b', 0), parentId: C.Dining.id, targetType: 'amount' };
  st.categories.push(coffee);
  C.Coffee = coffee;

  const rnd = mulberry32(42);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const tx = [];
  const add = (date, amount, cat, note, extra = {}) =>
    tx.push({ id: uid(), date, amount: round2(amount), categoryId: C[cat].id, note, ...extra });

  for (let d = start; d <= t; d = addDays(d, 1)) {
    if (rnd() < 0.26) add(d, 55 + rnd() * 70, 'Groceries', pick(['Whole Foods', "Trader Joe's", 'Costco', 'Safeway']));
    if (rnd() < 0.24) add(d, 12 + rnd() * 34, 'Dining', pick(['Chipotle', 'Sushi Go', 'Thai Basil', 'Pizza Night', 'Burger Joint']));
    if (rnd() < 0.22) add(d, 4 + rnd() * 3, 'Coffee', pick(['Blue Bottle', 'Starbucks']));
    if (rnd() < 0.2) add(d, 30 + rnd() * 28, 'Transport', pick(['Shell', 'Chevron', 'Uber', 'Metro card']));
    if (rnd() < 0.1) add(d, 15 + rnd() * 45, 'Entertainment', pick(['Cinema', 'Concert tickets', 'Bowling', 'Steam']));
    if (rnd() < 0.11) add(d, 20 + rnd() * 70, 'Shopping', pick(['Amazon', 'Target', 'Uniqlo', 'IKEA']));
    if (rnd() < 0.05) add(d, 10 + rnd() * 40, 'Health', pick(['CVS Pharmacy', 'Walgreens']));
    if (rnd() < 0.08) add(d, 8 + rnd() * 32, 'Personal', pick(['Haircut', 'Gift', 'Books']));
  }

  const bill = (name, amount, cat, dueOffset) => ({
    id: uid(), name, amount, categoryId: C[cat].id, frequency: 'monthly', due: addDays(start, dueOffset), paid: [],
  });
  st.bills = [
    bill('Rent', 1250, 'Housing', 0),
    bill('Electricity', 96, 'Utilities', 17),
    bill('Internet', 65, 'Utilities', 21),
    bill('Car insurance', 138, 'Transport', 24),
    bill('Gym membership', 40, 'Health', 4),
    bill('Netflix', 15.49, 'Subscriptions', 8),
    bill('Spotify', 10.99, 'Subscriptions', 13),
  ];
  for (const b of st.bills) {
    for (const d of billOccurrencesFor(b, start, t)) {
      b.paid.push(d);
      tx.push({ id: uid(), date: d, amount: b.amount, categoryId: b.categoryId, note: b.name, billId: b.id, billDate: d });
    }
  }
  // A small monthly charge that isn't set up as a bill
  for (let d = addDays(start, 11); d <= t; d = addMonths(d, 1)) add(d, 7.99, 'Subscriptions', 'StreamPlus');

  st.transactions = tx;
  st.incomes = [
    { id: uid(), date: addDays(start, 40), amount: 500, kind: 'bonus', note: 'Quarterly bonus' },
    { id: uid(), date: addDays(t, -9), amount: 180, kind: 'side', note: 'Freelance logo' },
  ];
  st.goals = [
    { id: uid(), name: 'Emergency fund', target: 6000, saved: 2150, date: addMonths(t, 10), created: start },
    { id: uid(), name: 'Japan trip', target: 3000, saved: 900, date: addMonths(t, 7), created: start },
  ];
  st.netWorth = {
    assets: [{ name: 'Checking', value: 3200 }, { name: 'Savings', value: 2150 }, { name: '401(k)', value: 18400 }, { name: 'Car', value: 9500 }],
    liabilities: [{ name: 'Car loan', value: 6200 }, { name: 'Credit card', value: 840 }],
  };
  return st;
}
