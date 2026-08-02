// Editing an account balance.
//
// What the app stores is the *opening* balance; what someone actually knows is
// what the account holds today. Nobody remembers the figure their savings held
// the day they opened it, and when the app's number drifts from the bank's, the
// number they want to correct is today's.
//
// So the field takes today's balance and this works backwards to the opening
// balance that produces it. Transactions are never touched: only the starting
// point moves, by exactly the correction.

/** Money is cents. Without rounding, back-solving drifts by ~1e-13 per edit. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Everything logged against an account since it opened — the difference between
 * what it holds now and what it started with.
 */
export const movementOf = (balance: number, opening: number): number => round2(balance - opening);

/**
 * The opening balance that lands the account on `target` today.
 *
 * Passing back an unchanged balance must return the unchanged opening balance,
 * or simply renaming an account would quietly shift its history.
 */
export const openingForBalance = (target: number, movement: number): number => round2(target - movement);
