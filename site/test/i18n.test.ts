import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractKeys, placeholders } from '@core/i18n/keys';
import { AR } from '@core/i18n/ar';
import { AR_SITE } from '../src/i18n-ar';

// Every phrase on the website needs Arabic, from the website's own dictionary
// or, for words the phone app already says, from the phone app's.

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const files: { name: string; src: string }[] = [];
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name) && e.name !== 'i18n-ar.ts') files.push({ name: path.relative(SRC, p), src: fs.readFileSync(p, 'utf8') });
  }
};
walk(SRC);
const keys = extractKeys(files);
const used = new Set(keys.map((k) => k.text));
const has = (k: string) => k in AR_SITE || k in AR;

describe('the website in Arabic', () => {
  it('has every phrase', () => {
    expect([...used].filter((k) => !has(k))).toEqual([]);
  });
  it('gives counted phrases every plural form', () => {
    const bad = keys
      .filter((k) => k.plural)
      .filter((k) => {
        const v = AR_SITE[k.text] ?? AR[k.text];
        return typeof v !== 'object' || !v.one || !v.two || !v.few || !v.many || !v.other;
      });
    expect(bad.map((k) => k.text)).toEqual([]);
  });
  it('keeps the placeholders', () => {
    const bad = Object.entries(AR_SITE).filter(([k, v]) => {
      const want = placeholders(k).filter((p) => p !== '{n}').join();
      return placeholders(typeof v === 'string' ? v : v.other).filter((p) => p !== '{n}').join() !== want;
    });
    expect(bad.map(([k]) => k)).toEqual([]);
  });
  it('translates nothing twice, and nothing that’s gone', () => {
    expect(Object.keys(AR_SITE).filter((k) => k in AR)).toEqual([]);
    expect(Object.keys(AR_SITE).filter((k) => !used.has(k))).toEqual([]);
  });
});
