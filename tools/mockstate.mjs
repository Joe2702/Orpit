// Build an AppState close to the one in the reported screenshot, so the Home
// screen can be rendered in a real browser with no server or database.
const DAY = 86400000;
const now = Date.now();
const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const habits = [
  { id: '1', name: 'Daily Check-In', color: 'indigo', target: 'Every day', locked: true, days: '1111111', paused: false, archived: false, why: null, reminderTime: null },
  { id: '2', name: 'Read', color: 'teal', target: 'Every day', locked: false, days: '1111111', paused: false, archived: false, why: null, reminderTime: null },
  { id: '3', name: 'Stretch', color: 'coral', target: 'Every day', locked: false, days: '1111111', paused: false, archived: false, why: null, reminderTime: null },
];
const checkins = [];
for (let i = 0; i < 30; i++) {
  if (i % 2 === 0) checkins.push({ habitId: '1', day: dayKey(now - i * DAY) });
  if (i % 3 === 0) checkins.push({ habitId: '2', day: dayKey(now - i * DAY) });
}

const workouts = [0, 2, 4].map((i) => ({
  id: `w${i}`, name: 'Push day', catId: null, dur: 55, dist: null, kcal: 420,
  intensity: 'Hard', note: null, sets: null, ts: now - i * DAY,
}));

const nights = Array.from({ length: 12 }, (_, i) => ({
  id: `n${i}`, hours: 8.6 + Math.sin(i) * 0.9, quality: 4,
  bedH: 23.5, wakeH: 8, note: null, ts: now - i * DAY,
}));

const txns = [
  { id: 'tadj', name: 'Balance correction', cat: 'Adjustment', amount: 240, income: false, accId: 'a1', toAccId: null, adjust: true, note: null, photo: false, ts: now - 4 * DAY },
  { id: 't0', name: 'Main Bank → Savings', cat: 'Transfer', amount: -500, income: false, accId: 'a1', toAccId: 'a2', adjust: false, note: null, photo: false, ts: now - 3 * DAY },
  { id: 't1', name: 'Groceries', cat: 'Food', amount: -120, income: false, accId: 'a1', toAccId: null, adjust: false, note: null, photo: false, ts: now - DAY },
  { id: 't2', name: 'Transport', cat: 'Transport', amount: -80, income: false, accId: 'a1', toAccId: null, adjust: false, note: null, photo: false, ts: now - 2 * DAY },
];

// The three counters from the screenshot — long names on purpose, since that is
// what the reported layout shows.
const counters = [
  { id: 'c1', name: 'Pages read', unit: 'pages', color: 'indigo', icon: 'book', step: 5 },
  { id: 'c2', name: 'Pull-ups', unit: 'reps', color: 'coral', icon: 'reps', step: 5 },
  { id: 'c3', name: 'Handstand hold', unit: 'Sec', color: 'blue', icon: 'clock', step: 10 },
];

export const state = {
  profile: {
    name: 'Youssif', email: 'y@example.com', theme: 'dark', reminders: true, haptics: true,
    onboarded: true, currency: 'EGP', avatar: null, layout: null, reminderTime: '21:00',
    reminderTz: 'Africa/Cairo', claimedBadges: [], accent: 'indigo', modules: null,
    textScale: 1, windDown: false, emailVerified: true, introDone: true,
    createdAt: now - 120 * DAY,
  },
  habits, checkins, wCats: [], workouts, nights, txns,
  accounts: [
    { id: 'a1', name: 'Main Bank', type: 'Bank', color: 'blue', opening: 1500 },
    { id: 'a2', name: 'Savings', type: 'Savings', color: 'emerald', opening: 0 },
  ],
  fcats: [], budgets: [], goals: [], recurring: [],
  counters, countLogs: [], wTemplates: [],
  archive: { workouts: 0, nights: 0, txns: 0, countLogs: 0, checkins: 0, txnSum: 0, activeDays: 0, earliestTs: now - 120 * DAY, accSums: {} },
};
