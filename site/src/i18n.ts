// The website's words. English is written where it's used; Arabic for the
// website's own phrases lives in ./i18n-ar.ts, and anything the phone app
// already says (category names, "Save", "Habits") comes from its dictionary,
// so the two never translate the same word two ways.

import {
  initI18n as initCore,
  t as coreT,
  tn as coreTn,
  getLang,
  num,
  type Vars,
  type Plural,
} from '@core/i18n';

export { getLang, isRTL, date, num, tData, setLangPref, listJoin, dateRange, locale, langPref } from '@core/i18n';

type SiteDict = Record<string, string | Plural>;
let site: SiteDict | null = null;
let rules: Intl.PluralRules | null = null;

export async function initI18n(): Promise<void> {
  await initCore();
  if (getLang() === 'ar') {
    try {
      site = (await import('./i18n-ar')).AR_SITE;
    } catch {
      site = null;
    }
  }
}

function fill(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => {
    if (!(k in vars)) return m;
    const v = vars[k];
    return typeof v === 'number' ? num(v) : v;
  });
}

/** A phrase in the reader's language. */
export function t(s: string, vars?: Vars): string {
  const tr = site?.[s];
  if (typeof tr === 'string') return fill(tr, vars);
  return coreT(s, vars);
}

/** A counted phrase: "1 entry", "3 entries", and Arabic's six forms. */
export function tn(n: number, one: string, other: string, vars?: Vars): string {
  const tr = site?.[other];
  if (!tr) return coreTn(n, one, other, vars);
  const all = { n, ...vars };
  if (typeof tr === 'string') return fill(tr, all);
  if (!rules) rules = new Intl.PluralRules('ar');
  const form = rules.select(n) as keyof Plural;
  return fill(tr[form] ?? tr.other, all);
}

/** English defined in one place and translated where it's shown. */
export const tk = (s: string): string => s;
