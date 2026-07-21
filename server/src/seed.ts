import type { PoolClient } from 'pg';

const DAY = 86400000;

function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function agoDate(days: number): string {
  return dayStr(new Date(Date.now() - days * DAY));
}
function agoTs(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

/**
 * Seed a freshly-created user with the demo dataset from the original prototype.
 * Habit check-ins are generated as real dated rows so streaks and the heatmap
 * are derived from actual data (no hardcoded/synthetic values).
 */
export async function seedUser(c: PoolClient, userId: number) {
  // --- Habits + real check-in history ---
  const habitSeed = [
    { name: 'Meditate', color: 'teal', target: 'Daily', streak: 12, density: 0.85 },
    { name: 'Read 20 pages', color: 'indigo', target: 'Daily', streak: 5, density: 0.7 },
    { name: 'Drink water', color: 'blue', target: 'Daily', streak: 23, density: 0.9 },
    { name: 'No phone after 10', color: 'coral', target: '5 / week', streak: 3, density: 0.55 },
  ];

  let sort = 0;
  for (const h of habitSeed) {
    const { rows } = await c.query(
      `INSERT INTO habits (user_id, name, color, target, sort)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [userId, h.name, h.color, h.target, sort++]
    );
    const habitId = rows[0].id;

    // Deterministic pseudo-random so seeds look organic but stable per habit.
    let s = h.name.length * 7 + 13;
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };

    const days = new Set<string>();
    // The most recent `streak` days are consecutive (so the current streak is real).
    for (let i = 0; i < h.streak; i++) days.add(agoDate(i));
    // Scatter earlier check-ins across the last 12 weeks (84 days) for the heatmap.
    for (let i = h.streak; i < 84; i++) {
      if (rand() < h.density) days.add(agoDate(i));
    }

    for (const day of days) {
      await c.query(
        `INSERT INTO habit_checkins (habit_id, user_id, day) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING`,
        [habitId, userId, day]
      );
    }
  }

  // --- Workout categories ---
  const cats = [
    { name: 'Run', color: 'coral' },
    { name: 'Lift', color: 'indigo' },
    { name: 'Cardio', color: 'blue' },
  ];
  const catIds: number[] = [];
  sort = 0;
  for (const cat of cats) {
    const { rows } = await c.query(
      `INSERT INTO workout_categories (user_id, name, color, sort)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [userId, cat.name, cat.color, sort++]
    );
    catIds.push(rows[0].id);
  }
  const [RUN, LIFT, CARDIO] = catIds;

  const workouts = [
    { name: 'Morning Run', cat: RUN, dur: 32, dist: '5.2 km', kcal: 312, intensity: null, d: 0 },
    { name: 'Upper Body', cat: LIFT, dur: 48, dist: null, kcal: 280, intensity: null, d: 1 },
    { name: 'Evening Walk', cat: CARDIO, dur: 26, dist: '2.4 km', kcal: null, intensity: null, d: 2 },
    { name: 'Yoga Flow', cat: CARDIO, dur: 35, dist: null, kcal: null, intensity: 'Easy', d: 3 },
    { name: 'Tempo Run', cat: RUN, dur: 28, dist: '4.5 km', kcal: 268, intensity: null, d: 5 },
    { name: 'Leg Day', cat: LIFT, dur: 52, dist: null, kcal: 305, intensity: null, d: 6 },
    { name: 'Park Walk', cat: CARDIO, dur: 40, dist: '3.6 km', kcal: null, intensity: null, d: 8 },
    { name: 'Long Run', cat: RUN, dur: 46, dist: '8.0 km', kcal: 480, intensity: null, d: 10 },
    { name: 'Sunday Cycle', cat: CARDIO, dur: 45, dist: '15 km', kcal: null, intensity: null, d: 12 },
  ];
  for (const w of workouts) {
    await c.query(
      `INSERT INTO workouts (user_id, category_id, name, dur, dist, kcal, intensity, ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, w.cat, w.name, w.dur, w.dist, w.kcal, w.intensity, agoTs(w.d)]
    );
  }

  const nights = [
    { hours: 7.4, quality: 8, bed: 23.3, wake: 6.7, d: 0 },
    { hours: 6.97, quality: 6, bed: 23.8, wake: 6.77, d: 1 },
    { hours: 7.68, quality: 10, bed: 22.9, wake: 6.58, d: 2 },
    { hours: 8.03, quality: 8, bed: 22.7, wake: 6.73, d: 3 },
    { hours: 6.5, quality: 6, bed: 0.2, wake: 6.7, d: 4 },
    { hours: 7.3, quality: 8, bed: 23.4, wake: 6.7, d: 5 },
    { hours: 7.1, quality: 8, bed: 23.6, wake: 6.7, d: 6 },
    { hours: 7.6, quality: 9, bed: 23.1, wake: 6.7, d: 7 },
    { hours: 9.4, quality: 9, bed: 22.4, wake: 7.8, d: 9 },
    { hours: 6.2, quality: 5, bed: 0.6, wake: 6.8, d: 11 },
    { hours: 8.1, quality: 8, bed: 22.8, wake: 6.9, d: 13 },
    { hours: 7.0, quality: 7, bed: 23.5, wake: 6.5, d: 16 },
  ];
  for (const n of nights) {
    await c.query(
      `INSERT INTO nights (user_id, hours, quality, bed_h, wake_h, ts)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, n.hours, n.quality, n.bed, n.wake, agoTs(n.d)]
    );
  }

  // --- Accounts (create first so txns/recurring can reference them) ---
  const accSeed = [
    { key: 'ac1', name: 'Cash', type: 'Cash', color: 'emerald', opening: 180 },
    { key: 'ac2', name: 'Main Bank', type: 'Bank', color: 'blue', opening: 2600 },
    { key: 'ac3', name: 'Savings', type: 'Savings', color: 'indigo', opening: 5200 },
  ];
  const accId: Record<string, number> = {};
  sort = 0;
  for (const a of accSeed) {
    const { rows } = await c.query(
      `INSERT INTO accounts (user_id, name, type, color, opening, sort)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [userId, a.name, a.type, a.color, a.opening, sort++]
    );
    accId[a.key] = rows[0].id;
  }

  const txns = [
    { name: 'Salary', cat: 'Salary', acc: 'ac2', amount: 3200, income: true, d: 18 },
    { name: 'Rent', cat: 'Housing', acc: 'ac2', amount: -1400, income: false, d: 17 },
    { name: 'Gym membership', cat: 'Health', acc: 'ac2', amount: -40, income: false, d: 10 },
    { name: 'Freelance', cat: 'Freelance', acc: 'ac2', amount: 420, income: true, d: 9 },
    { name: 'Cinema', cat: 'Fun', acc: 'ac1', amount: -32, income: false, d: 7 },
    { name: 'Uber', cat: 'Transport', acc: 'ac1', amount: -23.5, income: false, d: 6 },
    { name: 'Whole Foods', cat: 'Food', acc: 'ac2', amount: -86.4, income: false, d: 5 },
    { name: 'Dinner out', cat: 'Fun', acc: 'ac1', amount: -58, income: false, d: 3 },
    { name: 'Groceries', cat: 'Food', acc: 'ac2', amount: -92, income: false, d: 2 },
    { name: 'Coffee', cat: 'Food', acc: 'ac1', amount: -5.4, income: false, d: 1 },
  ];
  for (const t of txns) {
    await c.query(
      `INSERT INTO txns (user_id, name, cat, amount, income, acc_id, ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, t.name, t.cat, t.amount, t.income, accId[t.acc], agoTs(t.d)]
    );
  }

  // --- Finance categories ---
  const fcats = [
    { name: 'Food', icon: 'food', color: 'coral', kind: 'expense' },
    { name: 'Transport', icon: 'car', color: 'blue', kind: 'expense' },
    { name: 'Housing', icon: 'home', color: 'indigo', kind: 'expense' },
    { name: 'Fun', icon: 'star', color: 'teal', kind: 'expense' },
    { name: 'Health', icon: 'heart', color: 'danger', kind: 'expense' },
    { name: 'Shopping', icon: 'bag', color: 'coral', kind: 'expense' },
    { name: 'Salary', icon: 'cash', color: 'emerald', kind: 'income' },
    { name: 'Freelance', icon: 'laptop', color: 'emerald', kind: 'income' },
    { name: 'Investment', icon: 'chart', color: 'emerald', kind: 'income' },
  ];
  sort = 0;
  for (const f of fcats) {
    await c.query(
      `INSERT INTO fcats (user_id, name, icon, color, kind, sort) VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, f.name, f.icon, f.color, f.kind, sort++]
    );
  }

  // --- Budgets (by category name) ---
  const budgets = [
    { cat: 'Food', limit: 450 },
    { cat: 'Transport', limit: 150 },
    { cat: 'Fun', limit: 200 },
    { cat: 'Health', limit: 120 },
    { cat: 'Shopping', limit: 250 },
  ];
  sort = 0;
  for (const b of budgets) {
    await c.query(`INSERT INTO budgets (user_id, cat, limit_amt, sort) VALUES ($1,$2,$3,$4)`, [
      userId,
      b.cat,
      b.limit,
      sort++,
    ]);
  }

  // --- Savings goals ---
  const goals = [
    { name: 'Emergency Fund', target: 10000, current: 6400, color: 'indigo', due: 150 },
    { name: 'Japan Trip', target: 4000, current: 1250, color: 'coral', due: 90 },
    { name: 'New Laptop', target: 2000, current: 1650, color: 'teal', due: 40 },
  ];
  sort = 0;
  for (const g of goals) {
    await c.query(
      `INSERT INTO goals (user_id, name, target, current, color, due_ts, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, g.name, g.target, g.current, g.color, new Date(Date.now() + g.due * DAY), sort++]
    );
  }

  // --- Recurring transactions ---
  const recurring = [
    { name: 'Rent', cat: 'Housing', acc: 'ac2', amount: 1400, freq: 'Monthly', next: 12 },
    { name: 'Netflix', cat: 'Fun', acc: 'ac2', amount: 15.99, freq: 'Monthly', next: 4 },
    { name: 'Spotify', cat: 'Fun', acc: 'ac2', amount: 9.99, freq: 'Monthly', next: 9 },
    { name: 'Gym', cat: 'Health', acc: 'ac2', amount: 40, freq: 'Monthly', next: 20 },
    { name: 'Phone plan', cat: 'Housing', acc: 'ac2', amount: 35, freq: 'Monthly', next: 2 },
  ];
  sort = 0;
  for (const r of recurring) {
    await c.query(
      `INSERT INTO recurring (user_id, name, cat, acc_id, amount, freq, next_ts, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, r.name, r.cat, accId[r.acc], r.amount, r.freq, new Date(Date.now() + r.next * DAY), sort++]
    );
  }

  // --- Counters + generated log history ---
  const counterSeed = [
    { key: 'c1', name: 'Pull-ups', unit: 'reps', color: 'indigo', icon: 'reps', step: 5, n: 62, base: 10, mod: 4, mul: 2, every: 3, off: 0 },
    { key: 'c2', name: 'Push-ups', unit: 'reps', color: 'coral', icon: 'flame', step: 10, n: 48, base: 20, mod: 5, mul: 5, every: 3, off: 1 },
    { key: 'c3', name: 'Pages read', unit: 'pages', color: 'teal', icon: 'book', step: 10, n: 70, base: 15, mod: 6, mul: 5, every: 2, off: 0 },
    { key: 'c4', name: 'Focus', unit: 'hours', color: 'blue', icon: 'clock', step: 1, n: 80, base: 1.5, mod: 3, mul: 1, every: 2, off: 0 },
  ];
  sort = 0;
  for (const ct of counterSeed) {
    const { rows } = await c.query(
      `INSERT INTO counters (user_id, name, unit, color, icon, step, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [userId, ct.name, ct.unit, ct.color, ct.icon, ct.step, sort++]
    );
    const cid = rows[0].id;
    for (let i = 0; i < ct.n; i++) {
      const amt = ct.base + (i % ct.mod) * ct.mul;
      await c.query(`INSERT INTO count_logs (user_id, counter_id, amount, ts) VALUES ($1,$2,$3,$4)`, [
        userId,
        cid,
        amt,
        agoTs(i * ct.every + ct.off),
      ]);
    }
  }
}
