import { describe, expect, it } from 'vitest';
import { CODES, POPULAR, currencyFlag, currencyName, currencySymbol, isCurrency, searchCurrencies } from '../lib/currencies';
import { money0, setCurrency } from '../lib/format';

describe('every currency', () => {
  it('has well over a hundred codes, no repeats, and the popular ones among them', () => {
    expect(CODES.length).toBeGreaterThan(140);
    expect(new Set(CODES).size).toBe(CODES.length);
    for (const c of POPULAR) expect(isCurrency(c)).toBe(true);
    expect(isCurrency('XXX')).toBe(false);
  });

  it('keeps the old symbols and finds sensible ones for the rest', () => {
    expect(currencySymbol('EGP')).toBe('E£');
    expect(currencySymbol('SAR')).toBe('SR ');
    expect(currencySymbol('EGP', 'ar')).toBe('ج.م');
    expect(currencySymbol('INR')).toBe('₹');
    expect(currencySymbol('AED')).toBe('AED ');
    expect(currencySymbol('AED', 'ar')).toBe('د.إ');
  });

  it('names them in English and Arabic, and flags them', () => {
    expect(currencyName('JPY')).toBe('Japanese Yen');
    expect(currencyName('KWD', 'ar')).toBe('دينار كويتي');
    expect(currencyFlag('EGP')).toBe('🇪🇬');
    expect(currencyFlag('EUR')).toBe('🇪🇺');
    expect(currencyFlag('XOF')).toBe('🌍');
  });

  it('finds a currency by code, name in either language, or symbol', () => {
    expect(searchCurrencies('yen')[0]).toBe('JPY');
    expect(searchCurrencies('kwd')[0]).toBe('KWD');
    expect(searchCurrencies('دينار')).toContain('KWD');
    expect(searchCurrencies('₹')).toContain('INR');
    expect(searchCurrencies('')).toHaveLength(CODES.length);
  });

  it('formats money in a currency outside the original five', () => {
    setCurrency('AED');
    expect(money0(1250)).toBe('AED 1,250');
    setCurrency('nope');
    expect(money0(1250)).toBe('E£1,250');
  });
});
