// A believable year and a bit of someone's life, for screenshot tours.
//
// tools/mockstate.mjs reproduces one reported screenshot; this one exists to
// make every chart and range in the app show something real — fourteen months
// of workouts, nights, spending, habits and counters with the gaps and noise an
// actual person leaves behind. Deterministic, so two tours compare cleanly.
const DAY = 86400000;
const NOW = Date.now();

let seed = 20261022;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const at = (daysAgo, hour) => {
  const d = new Date(NOW - daysAgo * DAY);
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return Math.min(d.getTime(), NOW - 60_000);
};

const SPAN = 420;

const wCats = [
  { id: 'wc1', name: 'Strength', color: 'coral' },
  { id: 'wc2', name: 'Running', color: 'blue' },
  { id: 'wc3', name: 'Football', color: 'emerald' },
  { id: 'wc4', name: 'Mobility', color: 'purple' },
];
const workouts = [];
const nights = [];
const txns = [];
const checkins = [];
const countLogs = [];

const habits = [
  { id: 'h1', name: 'Daily Check-In', color: 'indigo', target: 'Every day', locked: true, days: '1111111', paused: false, archived: false, why: null, reminderTime: null },
  { id: 'h2', name: 'Read 20 pages', color: 'teal', target: 'Every day', locked: false, days: '1111111', paused: false, archived: false, why: 'Finish 24 books this year', reminderTime: '22:00', cue: 'In bed, before I pick up my phone' },
  { id: 'h3', name: 'Morning stretch', color: 'coral', target: 'Weekdays', locked: false, days: '0111110', paused: false, archived: false, why: null, reminderTime: null, cue: 'After my morning coffee' },
  { id: 'h4', name: 'No phone after midnight', color: 'purple', target: '5× a week', locked: false, days: '1111100', paused: false, archived: false, why: null, reminderTime: null },
];

for (let i = SPAN; i >= 0; i--) {
  const dow = new Date(NOW - i * DAY).getDay();
  // Training: a strength split, weekend football, the odd run — with a quiet
  // stretch over the summer, as there always is.
  const lull = i > 110 && i < 135;
  if (!lull && [0, 2, 4].includes(dow) && rnd() < 0.82) {
    const sets = [
      { ex: 'Bench press', reps: 8, weight: 60 + Math.round((SPAN - i) / 30) * 2.5 },
      { ex: 'Bench press', reps: 8, weight: 60 + Math.round((SPAN - i) / 30) * 2.5 },
      { ex: 'Overhead press', reps: 10, weight: 35 },
      { ex: 'Pull-ups', reps: 9, weight: null },
    ];
    workouts.push({ id: `w${i}a`, name: pick(['Push day', 'Pull day', 'Leg day', 'Upper body']), catId: 'wc1', dur: 45 + Math.round(rnd() * 30), dist: null, kcal: 380 + Math.round(rnd() * 120), intensity: pick(['Moderate', 'Hard']), note: null, sets, ts: at(i, 18.5) });
  }
  if (!lull && dow === 5 && rnd() < 0.7) {
    workouts.push({ id: `w${i}b`, name: 'Five-a-side', catId: 'wc3', dur: 75, dist: null, kcal: 640, intensity: 'Hard', note: null, sets: null, ts: at(i, 20) });
  }
  if (!lull && dow === 6 && rnd() < 0.5) {
    const km = (4 + rnd() * 4).toFixed(1);
    workouts.push({ id: `w${i}c`, name: 'Easy run', catId: 'wc2', dur: Math.round(Number(km) * 6.2), dist: `${km} km`, kcal: Math.round(Number(km) * 68), intensity: 'Easy', note: null, sets: null, ts: at(i, 7.5) });
  }

  // Sleep: most nights logged, later on weekends, a few missing.
  if (rnd() < 0.86) {
    const weekend = dow === 5 || dow === 6;
    const bed = (weekend ? 24.6 : 23.4) + (rnd() - 0.5) * 1.4;
    const hours = Math.max(4.6, Math.min(9.6, (weekend ? 8.1 : 7.0) + (rnd() - 0.5) * 2));
    const wake = (bed + hours) % 24;
    nights.push({ id: `n${i}`, hours: Math.round(hours * 4) / 4, quality: Math.max(3, Math.min(10, Math.round(hours + (rnd() - 0.4) * 3))), bedH: Math.round((bed % 24) * 4) / 4, wakeH: Math.round(wake * 4) / 4, note: null, ts: at(i, wake) });
  }

  // Money: groceries, transport, coffee, the occasional big one.
  if (rnd() < 0.55) txns.push({ id: `tc${i}`, name: pick(['Coffee', 'Starbucks', 'Costa']), cat: 'Coffee', amount: -(85 + Math.round(rnd() * 70)), income: false, accId: 'a1', toAccId: null, adjust: false, note: null, photo: false, ts: at(i, 9.2) });
  if (rnd() < 0.5) txns.push({ id: `tt${i}`, name: pick(['Uber', 'Careem', 'Metro card']), cat: 'Transport', amount: -(60 + Math.round(rnd() * 160)), income: false, accId: 'a1', toAccId: null, adjust: false, note: null, photo: false, ts: at(i, 8.4) });
  if (dow === 5 && rnd() < 0.9) txns.push({ id: `tg${i}`, name: pick(['Carrefour', 'Seoudi', 'Gourmet']), cat: 'Groceries', amount: -(900 + Math.round(rnd() * 1300)), income: false, accId: 'a1', toAccId: null, adjust: false, note: null, photo: false, ts: at(i, 13), sms: rnd() < 0.5 });
  if (rnd() < 0.18) txns.push({ id: `te${i}`, name: pick(['Dinner with friends', 'Talabat', 'Cinema', 'Brunch']), cat: 'Eating out', amount: -(350 + Math.round(rnd() * 900)), income: false, accId: 'a1', toAccId: null, adjust: false, note: null, photo: false, ts: at(i, 21) });
  if (rnd() < 0.03) txns.push({ id: `ts${i}`, name: pick(['Zara', 'Noon order', 'Amazon']), cat: 'Shopping', amount: -(1200 + Math.round(rnd() * 3500)), income: false, accId: 'a1', toAccId: null, adjust: false, note: null, photo: false, ts: at(i, 16) });
  if (new Date(NOW - i * DAY).getDate() === 1) {
    txns.push({ id: `ti${i}`, name: 'Salary', cat: 'Salary', amount: 32000, income: true, accId: 'a1', toAccId: null, adjust: false, note: null, photo: false, ts: at(i, 10), sms: true });
    txns.push({ id: `tr${i}`, name: 'Rent', cat: 'Housing', amount: -9500, income: false, accId: 'a1', toAccId: null, adjust: false, note: null, photo: false, ts: at(i, 11) });
    txns.push({ id: `tx${i}`, name: 'Main Bank → Savings', cat: 'Transfer', amount: -4000, income: false, accId: 'a1', toAccId: 'a2', adjust: false, note: null, photo: false, ts: at(i, 12) });
  }
  if (new Date(NOW - i * DAY).getDate() === 14) {
    txns.push({ id: `tp${i}`, name: 'Vodafone', cat: 'Bills', amount: -420, income: false, accId: 'a1', toAccId: null, adjust: false, note: null, photo: false, ts: at(i, 12) });
    txns.push({ id: `tgy${i}`, name: 'Gym membership', cat: 'Health', amount: -1100, income: false, accId: 'a1', toAccId: null, adjust: false, note: null, photo: false, ts: at(i, 12) });
  }

  // Habits: good weeks and bad ones.
  const k = dayKey(NOW - i * DAY);
  const form = 0.55 + 0.35 * Math.sin((SPAN - i) / 23);
  if (rnd() < form + 0.25) checkins.push({ habitId: 'h1', day: k });
  if (rnd() < form) checkins.push({ habitId: 'h2', day: k });
  if (habits[2].days[dow] === '1' && rnd() < form - 0.05) checkins.push({ habitId: 'h3', day: k });
  if (habits[3].days[dow] === '1' && rnd() < form - 0.15) checkins.push({ habitId: 'h4', day: k });

  // Counters.
  if (rnd() < 0.6) countLogs.push({ id: `cl${i}a`, counterId: 'c1', amount: 10 + Math.round(rnd() * 30), ts: at(i, 22.5) });
  if (rnd() < 0.35) countLogs.push({ id: `cl${i}b`, counterId: 'c2', amount: 20 + Math.round(rnd() * 25), ts: at(i, 18) });
  if (rnd() < 0.8) countLogs.push({ id: `cl${i}c`, counterId: 'c3', amount: 1 + Math.round(rnd() * 2), ts: at(i, 15) });
}

// A few entries straight from bank messages, the kind the importer flags or
// files specially: an unknown shop, money from a person, a foreign charge on
// the credit card, a refund, and a transfer it paired from two messages.
{
  const sms = (id, name, cat, amount, accId, hoursAgo, extra = {}) =>
    txns.push({ id, name, cat, amount, income: false, accId, toAccId: null, adjust: false, note: null, photo: false, ts: NOW - hoursAgo * 3600_000, sms: true, auto: true, smsKey: id, ...extra });
  sms('sx1', 'XYZ Trading', 'Other', -300, 'a1', 5, { review: true });
  sms('sx2', 'Money received', 'Other', 500, 'a5', 26, { income: true, review: true });
  sms('sx3', 'Netflix', 'Subscriptions', -484.52, 'a4', 30, { note: 'USD 9.99 at 48.50' });
  sms('sx4', 'Amazon', 'Shopping', 200, 'a1', 50);
  sms('sx5', 'Transfer', 'Transfer', -2000, 'a1', 72, { toAccId: 'a5' });
  sms('sx6', 'El Nour Pharmacy', 'Health', -265, 'a1', 3, { review: true });
}

export const state = {
  profile: {
    name: 'Youssif Mohammed', email: 'y@example.com', theme: 'dark', reminders: true, haptics: true,
    onboarded: true, currency: 'EGP', avatar: null, layout: null, reminderTime: '21:00',
    reminderTz: 'Africa/Cairo', claimedBadges: [], accent: 'indigo', modules: null,
    textScale: 1, windDown: false, emailVerified: true, introDone: true,
    createdAt: NOW - SPAN * DAY,
  },
  habits, checkins, wCats, workouts, nights, txns,
  accounts: [
    // Filled from CIB's messages: the balance is the one the bank last
    // reported, not opening + everything logged.
    { id: 'a1', name: 'CIB', type: 'Bank', color: 'blue', opening: 18000, smsBalance: 46820.5, smsBalanceTs: NOW - 2 * 3600_000, smsLinks: [{ sender: 'CIB', card: null }, { sender: 'CIB', card: '1234' }] },
    { id: 'a2', name: 'Savings', type: 'Savings', color: 'emerald', opening: 40000, smsLinks: [] },
    { id: 'a3', name: 'Cash', type: 'Cash', color: 'amber', opening: 1500, smsLinks: [] },
    { id: 'a4', name: 'CIB card ••4444', type: 'Credit card', color: 'indigo', opening: 0, smsLinks: [{ sender: 'CIB', card: '4444' }] },
    { id: 'a5', name: 'Vodafone Cash', type: 'Wallet', color: 'rose', opening: 0, smsBalance: 800, smsBalanceTs: NOW - 26 * 3600_000, smsLinks: [{ sender: 'Vodafone Cash', card: null }] },
  ],
  fcats: [
    ['Groceries', 'cart', 'expense'],
    ['Eating out', 'food', 'expense'],
    ['Coffee', 'coffee', 'expense'],
    ['Transport', 'car', 'expense'],
    ['Housing', 'home', 'expense'],
    ['Bills', 'bolt', 'expense'],
    ['Subscriptions', 'repeat', 'expense'],
    ['Health', 'heart', 'expense'],
    ['Shopping', 'bag', 'expense'],
    ['Fees', 'other', 'expense'],
    ['Salary', 'cash', 'income'],
    ['Freelance', 'laptop', 'income'],
    ['Other', 'other', 'income'],
  ].map(([name, icon, kind], i) => ({ id: `fc${i}`, name, icon, color: 'indigo', kind })),
  budgets: [
    { id: 'b1', cat: 'Groceries', limit: 7000, rollover: false },
    { id: 'b2', cat: 'Eating out', limit: 3000, rollover: true },
    { id: 'b3', cat: 'Coffee', limit: 2000, rollover: false },
    { id: 'b4', cat: 'Transport', limit: 2500, rollover: false },
  ],
  goals: [
    { id: 'g1', name: 'Emergency fund', target: 120000, current: 64000, color: 'emerald', dueTs: NOW + 200 * DAY },
    { id: 'g2', name: 'New laptop', target: 55000, current: 21500, color: 'indigo', dueTs: NOW + 90 * DAY },
  ],
  recurring: [
    { id: 'r1', name: 'Rent', cat: 'Housing', accId: 'a1', amount: 9500, freq: 'Monthly', income: false, nextTs: NOW + 9 * DAY },
    { id: 'r2', name: 'Netflix', cat: 'Subscriptions', accId: 'a1', amount: 240, freq: 'Monthly', income: false, nextTs: NOW + 3 * DAY },
    { id: 'r3', name: 'Salary', cat: 'Salary', accId: 'a1', amount: 32000, freq: 'Monthly', income: true, nextTs: NOW + 10 * DAY },
  ],
  counters: [
    { id: 'c1', name: 'Pages read', unit: 'pages', color: 'teal', icon: 'book', step: 5 },
    { id: 'c2', name: 'Pull-ups', unit: 'reps', color: 'coral', icon: 'reps', step: 5 },
    { id: 'c3', name: 'Glasses of water', unit: 'glasses', color: 'blue', icon: 'drop', step: 1 },
  ],
  countLogs,
  wTemplates: [{ id: 'wt1', name: 'Push day', catId: 'wc1', dur: 60, intensity: 'Hard' }],
  milestones: [
    { id: 'm1', name: 'No sugar', since: '2026-03-03', color: 'teal', icon: 'drop' },
    { id: 'm2', name: 'Together', since: '2022-11-14', color: 'coral', icon: 'heart' },
    { id: 'm3', name: 'Since born', since: '2001-12-12', color: 'indigo', icon: 'star' },
  ],
  archive: { workouts: 0, nights: 0, txns: 0, countLogs: 0, checkins: 0, txnSum: 0, activeDays: 0, earliestTs: NOW - SPAN * DAY, accSums: {}, windowDays: 400 },
};
