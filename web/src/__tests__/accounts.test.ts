import { describe, it, expect } from 'vitest';
import { round2, movementOf, openingForBalance } from '../lib/accounts';

describe('correcting an account balance', () => {
  it('leaves the account untouched when the balance is not changed', () => {
    // The important one. Renaming an account, or changing its colour, saves the
    // form — and must not quietly shift every historical balance with it.
    const opening = 1500;
    const balance = 2340.75; // after a pile of transactions
    const movement = movementOf(balance, opening);
    expect(openingForBalance(balance, movement)).toBe(opening);
  });

  it('moves the opening balance by exactly the correction', () => {
    const movement = movementOf(2340.75, 1500);
    // Bank says 2400.75 — 60 more than the app thinks.
    expect(openingForBalance(2400.75, movement)).toBe(1560);
  });

  it('handles an account that has only ever spent', () => {
    const movement = movementOf(120.5, 1000); // -879.50 spent
    expect(movement).toBe(-879.5);
    expect(openingForBalance(100, movement)).toBe(979.5);
  });

  it('works for a brand-new account, where today is the opening balance', () => {
    expect(openingForBalance(250, 0)).toBe(250);
  });

  it('accepts a balance the user drove negative', () => {
    const movement = movementOf(-40, 200);
    expect(openingForBalance(-75, movement)).toBe(165);
  });

  it('does not accumulate floating-point drift over repeated edits', () => {
    // 0.1 + 0.2 arithmetic through several round-trips is exactly where a
    // balance starts reading 1499.9999999999998.
    let opening = 0.1;
    let balance = 0.3;
    for (let i = 0; i < 200; i++) {
      const movement = movementOf(balance, opening);
      opening = openingForBalance(balance, movement);
    }
    expect(opening).toBe(0.1);
    expect(round2(opening)).toBe(0.1);
  });
});
