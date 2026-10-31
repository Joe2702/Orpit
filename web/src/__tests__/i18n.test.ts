import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractKeys, placeholders } from '../i18n/keys';
import { AR, AR_DATA } from '../i18n/ar';
import { __setLangForTest, t, tn, tData, num, listJoin } from '../i18n';
import { money, money0, moneyShort, relLabel, daysLabel } from '../lib/format';
import { period } from '../lib/period';

// The Arabic has to keep up with the English. These read every t('…'),
// tn(n, '…', '…') and tk('…') in the app and fail on a phrase with no Arabic,
// an Arabic phrase that lost or invented a {placeholder}, a counted phrase
// without its plural forms, or Arabic left over for English that's gone.

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files: { name: string; src: string }[] = [];
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'i18n') walk(p);
    } else if (/\.tsx?$/.test(e.name)) files.push({ name: path.relative(SRC, p), src: fs.readFileSync(p, 'utf8') });
  }
};
walk(SRC);
const keys = extractKeys(files);
const byText = new Map(keys.map((k) => [k.text, k]));

afterEach(() => __setLangForTest('en'));

describe('Arabic dictionary', () => {
  it('has every phrase the app uses', () => {
    const missing = [...byText.keys()].filter((k) => !(k in AR));
    expect(missing).toEqual([]);
  });

  it('keeps the same placeholders', () => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(AR)) {
      const want = placeholders(k);
      if (typeof v === 'string') {
        if (placeholders(v).join() !== want.join()) bad.push(k);
      } else {
        // A form may drop {n} ("one payment"), but may not invent a placeholder.
        const allowed = new Set([...want, '{n}']);
        for (const form of Object.values(v)) if (form && placeholders(form).some((p) => !allowed.has(p))) bad.push(k);
        if (placeholders(v.other).filter((p) => p !== '{n}').join() !== want.filter((p) => p !== '{n}').join()) bad.push(k);
      }
    }
    expect(bad).toEqual([]);
  });

  it('gives counted phrases all their Arabic plural forms', () => {
    const bad = keys.filter((k) => k.plural).filter((k) => {
      const v = AR[k.text];
      return typeof v !== 'object' || !v.one || !v.two || !v.few || !v.many || !v.other;
    });
    expect(bad.map((k) => k.text)).toEqual([]);
  });

  it('has no Arabic for English that no longer exists', () => {
    expect(Object.keys(AR).filter((k) => !byText.has(k))).toEqual([]);
  });

  it('writes digits the Western way, so the digits setting decides', () => {
    const all = Object.values(AR).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)));
    expect(all.filter((s) => /[٠-٩]/.test(s!))).toEqual([]);
  });

  it('names every starter category, habit and workout type the server creates', () => {
    const seed = fs.readFileSync(path.resolve(SRC, '../../server/src/seed.ts'), 'utf8');
    const names = [...seed.matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
    const inserted = [...seed.matchAll(/\[userId, '([^']+)'/g)].map((m) => m[1]);
    const missing = [...names, ...inserted].filter((n) => !(n in AR_DATA));
    expect(missing).toEqual([]);
  });
});

describe('translating', () => {
  it('leaves English as written', () => {
    expect(t('Save')).toBe('Save');
    expect(t('{n} added', { n: 1250 })).toBe('1,250 added');
    expect(tn(1, '{n} night', '{n} nights')).toBe('1 night');
    expect(tn(3, '{n} night', '{n} nights')).toBe('3 nights');
    expect(tData('Food')).toBe('Food');
  });

  it('uses the six Arabic plural forms', () => {
    __setLangForTest('ar', AR, AR_DATA);
    expect(tn(1, '{n} night', '{n} nights')).toBe('ليلة واحدة');
    expect(tn(2, '{n} night', '{n} nights')).toBe('ليلتان');
    expect(tn(3, '{n} night', '{n} nights')).toBe('3 ليالٍ');
    expect(tn(11, '{n} night', '{n} nights')).toBe('11 ليلة');
    expect(tn(100, '{n} night', '{n} nights')).toBe('100 ليلة');
  });

  it('falls back to the English rather than a blank', () => {
    __setLangForTest('ar', AR, AR_DATA);
    expect(t('A phrase nobody translated')).toBe('A phrase nobody translated');
    expect(tData('My own category')).toBe('My own category');
    expect(tData('Groceries')).toBe('البقالة');
  });

  it('writes money and dates the Arabic way', () => {
    __setLangForTest('ar', AR, AR_DATA);
    expect(money(1250)).toBe('1,250 ج.م');
    expect(money0(351.4)).toBe('351 ج.م');
    expect(moneyShort(12400)).toMatch(/^12\sألف\sج\.م$/);
    expect(relLabel(Date.now())).toBe('اليوم');
    expect(daysLabel('1000001')).toBe('الأحد والسبت');
    expect(listJoin(['أ', 'ب', 'ج'])).toBe('أ وب وج');
    const p = period('Week', 0, { now: new Date(2026, 9, 21, 12).getTime() });
    expect(p.title).toBe('هذا الأسبوع');
    expect(p.caption).toBe('18–24 أكتوبر');
    expect(p.buckets[0].label).toBe('ح');
  });

  it('switches to Arabic digits when asked', () => {
    __setLangForTest('ar', AR, AR_DATA, 'arab');
    expect(num(1250)).toBe('١٬٢٥٠');
    expect(t('{n} added', { n: 3 })).toBe('٣ أُضيفت');
  });
});
