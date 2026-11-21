import type { PoolClient } from 'pg';

/** The daily step goal a new Steps habit starts with; anyone can change it. */
export const STEP_GOAL = 8000;

/**
 * Seed a freshly-created user with a *clean* starting point:
 * a few starter habits (with NO history), the structural categories and one
 * account the app needs to function — and no dummy workouts/sleep/transactions.
 * Everything the user then adds is their own real data.
 */
export async function seedUser(c: PoolClient, userId: number) {
  // --- Permanent "Daily Check-In" habit (locked: can't be edited or deleted) ---
  await c.query(
    `INSERT INTO habits (user_id, name, color, target, days, locked, sort)
     VALUES ($1,$2,$3,$4,$5,TRUE,$6)`,
    [userId, 'Daily Check-In', 'indigo', 'Daily', '1111111', -1]
  );

  // --- Steps: ticked by Orpit when the day's steps reach the goal (from the
  // phone's health app). Added for everyone like Daily Check-In, but it can be
  // removed, and the flag stops it coming back once it has been.
  await c.query(
    `INSERT INTO habits (user_id, name, color, target, days, sort, auto, goal)
     VALUES ($1,'Steps','emerald','Daily','1111111',-1,'steps',$2)`,
    [userId, STEP_GOAL]
  );
  await c.query('UPDATE users SET steps_habit_added = TRUE WHERE id = $1', [userId]);

  // --- Starter habits (no check-ins → empty heatmap) ---
  const habits = [
    { name: 'Drink water', color: 'blue', target: 'Daily' },
    { name: 'Walk', color: 'teal', target: 'Daily' },
    { name: 'Train', color: 'coral', target: '5 / week' },
    { name: 'Read', color: 'indigo', target: 'Daily' },
  ];
  let sort = 0;
  for (const h of habits) {
    await c.query(
      `INSERT INTO habits (user_id, name, color, target, days, sort) VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, h.name, h.color, h.target, '1111111', sort++]
    );
  }

  // --- Workout categories (structural — needed to log a workout) ---
  const wCats = [
    { name: 'Push', color: 'coral' },
    { name: 'Pull', color: 'indigo' },
    { name: 'Legs', color: 'teal' },
    { name: 'Run', color: 'blue' },
  ];
  sort = 0;
  for (const cat of wCats) {
    await c.query(
      `INSERT INTO workout_categories (user_id, name, color, sort) VALUES ($1,$2,$3,$4)`,
      [userId, cat.name, cat.color, sort++]
    );
  }

  // --- One starter account (needed to log a transaction; opens at zero) ---
  await c.query(
    `INSERT INTO accounts (user_id, name, type, color, opening, sort) VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId, 'Cash', 'Cash', 'emerald', 0, 0]
  );

  // --- Finance categories (structural — needed to categorize money) ---
  const fcats = [
    { name: 'Food', icon: 'food', color: 'coral', kind: 'expense' },
    { name: 'Transport', icon: 'car', color: 'blue', kind: 'expense' },
    { name: 'Housing', icon: 'home', color: 'indigo', kind: 'expense' },
    { name: 'Fun', icon: 'star', color: 'teal', kind: 'expense' },
    { name: 'Health', icon: 'heart', color: 'danger', kind: 'expense' },
    { name: 'Shopping', icon: 'bag', color: 'coral', kind: 'expense' },
    { name: 'Salary', icon: 'cash', color: 'emerald', kind: 'income' },
    { name: 'Freelance', icon: 'laptop', color: 'emerald', kind: 'income' },
    { name: 'Other', icon: 'other', color: 'blue', kind: 'income' },
  ];
  sort = 0;
  for (const f of fcats) {
    await c.query(
      `INSERT INTO fcats (user_id, name, icon, color, kind, sort) VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, f.name, f.icon, f.color, f.kind, sort++]
    );
  }

  // No workouts, nights, transactions, budgets, goals, recurring, counters, or
  // check-ins — the user starts with a clean slate.
}
