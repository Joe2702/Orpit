// Exchange rates for foreign-currency payments.
//
// Two free daily feeds, tried in order. Each says how much of every currency
// one unit of `base` buys; callers want the other way round, what one unit of
// each currency is worth in `base`, so that is what comes back.

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ json(): Promise<unknown> }>;

const FEEDS: { url: (base: string) => string; read: (body: any, base: string) => Record<string, number> | null }[] = [
  {
    url: (base) => `https://open.er-api.com/v6/latest/${base}`,
    read: (body) => (body?.result === 'success' && body.rates && typeof body.rates === 'object' ? body.rates : null),
  },
  {
    // Lower-case codes, nested under the base.
    url: (base) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base.toLowerCase()}.json`,
    read: (body, base) => {
      const r = body?.[base.toLowerCase()];
      if (!r || typeof r !== 'object') return null;
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(r)) if (/^[a-z]{3}$/.test(k)) out[k.toUpperCase()] = Number(v);
      return out;
    },
  },
];

export async function fetchRates(base: string, get: Fetch = fetch as unknown as Fetch): Promise<Record<string, number> | null> {
  for (const feed of FEEDS) {
    try {
      const r = await get(feed.url(base), { signal: AbortSignal.timeout(6000) });
      const per = feed.read(await r.json(), base);
      if (!per) continue;
      const rates: Record<string, number> = {};
      for (const [cur, v] of Object.entries(per)) if (isFinite(v) && v > 0) rates[cur] = 1 / v;
      if (Object.keys(rates).length > 5) return rates;
    } catch {
      // Next feed.
    }
  }
  return null;
}
