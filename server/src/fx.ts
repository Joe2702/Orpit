// Exchange rates for foreign-currency payments.
//
// Free daily feeds, tried in order. Each says how much of every currency one
// unit of `base` buys; callers want the other way round, what one unit of each
// currency is worth in `base`, so that is what comes back.
//
// Order matters for the terms each one comes with. A keyed ExchangeRate-API
// account (free tier, set EXCHANGE_RATE_API_KEY) needs no credit and is used
// when there is a key. Without one, the open currency-api project comes first:
// no key, no limits, no attribution. ExchangeRate-API's keyless feed is last,
// because it asks for a credit wherever its rates are used, which the app
// shows in Settings.

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ json(): Promise<unknown> }>;

interface Feed {
  name: string;
  url: (base: string) => string;
  read: (body: any, base: string) => Record<string, number> | null;
}

function feeds(): Feed[] {
  const key = (process.env.EXCHANGE_RATE_API_KEY || '').trim();
  const list: Feed[] = [];
  if (key) {
    list.push({
      name: 'exchangerate-api',
      url: (base) => `https://v6.exchangerate-api.com/v6/${encodeURIComponent(key)}/latest/${base}`,
      read: (body) => (body?.result === 'success' && body.conversion_rates && typeof body.conversion_rates === 'object' ? body.conversion_rates : null),
    });
  }
  list.push(
    {
      name: 'currency-api',
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
    {
      name: 'open-er-api',
      url: (base) => `https://open.er-api.com/v6/latest/${base}`,
      read: (body) => (body?.result === 'success' && body.rates && typeof body.rates === 'object' ? body.rates : null),
    }
  );
  return list;
}

export async function fetchRates(base: string, get: Fetch = fetch as unknown as Fetch): Promise<Record<string, number> | null> {
  for (const feed of feeds()) {
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
