import React, { useEffect, useState } from 'react';
import { api, ApiError, type AdminMetrics } from '../api';
import { BarChart } from '../charts/charts';
import { Button } from '../ui/kit';
import { date, num } from '../i18n';

// The developer's numbers, at orpitapp.com/admin: how many accounts there are,
// how many people open Orpit each day and how often, who comes back, and
// which parts get used. The same numbers as the phone app's hidden inbox,
// behind the same admin password. Not linked from anywhere, and in English
// only: it's a tool for the person running Orpit, not part of the app.

const KEY = 'orbit_admin';

export function Admin() {
  const [password, setPassword] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) || '';
    } catch {
      return '';
    }
  });
  const [typed, setTyped] = useState('');
  const [m, setM] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (pw: string) => {
    setBusy(true);
    setError('');
    try {
      const r = await api.adminMetrics(pw);
      setM(r);
      setPassword(pw);
      try {
        sessionStorage.setItem(KEY, pw);
      } catch {
        /* private window: ask again next time */
      }
    } catch (e) {
      setM(null);
      setPassword('');
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* nothing to clear */
      }
      setError(e instanceof ApiError && e.status === 403 ? 'That password isn’t right.' : e instanceof Error ? e.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (password) void load(password);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) {
    return (
      <div className="page narrow">
        <div className="page-head">
          <div>
            <h1 className="page-title">Admin</h1>
            <div className="page-sub">Accounts, daily users and sessions.</div>
          </div>
        </div>
        <form
          className="card card-pad"
          style={{ maxWidth: 420 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (typed) void load(typed);
          }}
        >
          <label htmlFor="admin-pw" className="stat-label" style={{ marginBottom: 8 }}>
            Admin password
          </label>
          <div className="row" style={{ gap: 8 }}>
            <input id="admin-pw" className="input" type="password" autoFocus autoComplete="current-password" value={typed} onChange={(e) => setTyped(e.target.value)} style={{ flex: 1 }} />
            <Button kind="primary" type="submit" disabled={busy || !typed}>
              {busy ? 'Opening…' : 'Open'}
            </Button>
          </div>
          {error && (
            <div role="alert" style={{ color: 'var(--danger)', fontSize: 14, marginTop: 12 }}>
              {error}
            </div>
          )}
          <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>
            The ADMIN_PASSWORD set on Render. Kept for this tab only.
          </div>
        </form>
      </div>
    );
  }

  const daily = m.daily || [];
  const today = daily[daily.length - 1];
  const bars = (pick: (d: (typeof daily)[number]) => number) =>
    daily.map((d, i) => ({
      label: i % 5 === 4 || i === daily.length - 1 ? date(new Date(`${d.day}T12:00`), { day: 'numeric', month: 'short' }) : '',
      title: date(new Date(`${d.day}T12:00`), { weekday: 'short', day: 'numeric', month: 'short' }),
      value: pick(d),
      now: i === daily.length - 1,
    }));
  const sum = (pick: (d: (typeof daily)[number]) => number) => daily.reduce((a, d) => a + pick(d), 0);
  const pct = (v: number | null) => (v == null ? '·' : `${v}%`);
  const sessions = (n: number) => `${num(n)} ${n === 1 ? 'session' : 'sessions'}`;
  // Whole numbers on the axis: these are counts of people and visits.
  const whole = (v: number) => (Number.isInteger(v) ? num(v) : '');
  const kpis: [string, number | undefined, string][] = [
    ['Accounts', m.active?.users, `${sum((d) => d.signups)} new in 30 days`],
    ['Active today', m.active?.d1, `${sessions(today?.opens ?? 0)} today`],
    ['Active, 7 days', m.active?.d7, sessions(daily.slice(-7).reduce((a, d) => a + d.opens, 0))],
    ['Active, 30 days', m.active?.d30, sessions(sum((d) => d.opens))],
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1 className="page-title">Admin</h1>
          <div className="page-sub">Everything here counts only people who leave “Share usage counts” on.</div>
        </div>
        <Button size="sm" kind="ghost" icon="repeat" onClick={() => void load(password)} disabled={busy}>
          Refresh
        </Button>
      </div>

      <div className="kpis many" style={{ '--n': 4 } as React.CSSProperties}>
        {kpis.map(([label, v, sub]) => (
          <div key={label} className="card card-pad kpi">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{num(v ?? 0)}</div>
            <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
              {sub}
            </div>
          </div>
        ))}
      </div>

      <div className="grid">
        <div className="card c6">
          <div className="card-head">
            <span className="card-title">People each day</span>
            <span className="card-sub">opened Orpit, last 30 days</span>
          </div>
          <div className="card-body">
            <BarChart height={220} minTop={4} fmt={whole} label="People who opened Orpit each day" data={bars((d) => d.people)} />
          </div>
        </div>
        <div className="card c6">
          <div className="card-head">
            <span className="card-title">Sessions each day</span>
            <span className="card-sub">opening the app or coming back to it</span>
          </div>
          <div className="card-body">
            <BarChart height={220} minTop={4} fmt={whole} label="Sessions each day" data={bars((d) => d.opens)} />
          </div>
        </div>
        <div className="card c6">
          <div className="card-head">
            <span className="card-title">New accounts each day</span>
          </div>
          <div className="card-body">
            <BarChart height={180} minTop={4} fmt={whole} label="New accounts each day" data={bars((d) => d.signups)} />
          </div>
        </div>
        <div className="card c6">
          <div className="card-head">
            <span className="card-title">Coming back, by signup week</span>
          </div>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Week of</th>
                  <th className="r">New</th>
                  <th className="r">Day 1</th>
                  <th className="r">Week 1</th>
                  <th className="r">Day 30</th>
                </tr>
              </thead>
              <tbody>
                {m.cohorts.map((c) => (
                  <tr key={c.week}>
                    <td>{date(new Date(`${c.week}T12:00`), { day: 'numeric', month: 'short' })}</td>
                    <td className="r num">{c.users}</td>
                    <td className="r num">{pct(c.d1)}</td>
                    <td className="r num">{pct(c.w1)}</td>
                    <td className="r num">{pct(c.d30)}</td>
                  </tr>
                ))}
                {m.cohorts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="faint">
                      No signups in the last 8 weeks.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card c12">
          <div className="card-head">
            <span className="card-title">What gets used</span>
            <span className="card-sub">last 30 days</span>
          </div>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th className="r">People</th>
                  <th className="r">Times</th>
                </tr>
              </thead>
              <tbody>
                {m.features.map((f) => (
                  <tr key={f.name}>
                    <td>{f.name.replace(/_/g, ' ')}</td>
                    <td className="r num">{f.users}</td>
                    <td className="r num">{f.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
