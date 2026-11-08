import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore, useData } from '../store';
import { api } from '../api';
import { t, getLang, setLangPref } from '../i18n';
import { enabled } from '@core/lib/modules';
import { Avatar, Button, Kbd, Menu } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useOpen } from '../forms/host';
import { PLACES, visiblePlaces, switchToPhone, MOD } from './nav';
import { Palette } from './Palette';
import { ShortcutHelp, useShortcuts } from './keys';

// The frame around every signed-in page: a bar across the top with the
// sections, search, "New" and the account menu.

export function Shell() {
  const s = useData();
  const { signOut, mutate, theme } = useStore();
  const open = useOpen();
  const nav = useNavigate();
  const loc = useLocation();
  const [palette, setPalette] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const places = visiblePlaces(s);
  const top = places.filter((p) => p.top);
  const reviewN = s.txns.filter((x) => x.review).length;
  const on = (m: string) => enabled(s, m);

  useShortcuts({ palette: () => setPalette(''), create: () => setPalette('new '), help: () => setHelp(true), blocked: palette !== null || help });

  // A new page starts at the top, like any website.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);

  const setTheme = (th: 'light' | 'dark' | 'system') => mutate((st) => ({ ...st, profile: { ...st.profile, theme: th } }), () => api.updateMe({ theme: th }));

  const creates = [
    on('finances') && { label: t('Transaction'), icon: 'money' as const, run: () => open({ kind: 'txn' }), hint: <Kbd>T</Kbd> },
    on('workouts') && { label: t('Workout'), icon: 'fitness' as const, run: () => open({ kind: 'workout' }), hint: <Kbd>W</Kbd> },
    on('sleep') && { label: t('Night of sleep'), icon: 'sleep' as const, run: () => open({ kind: 'night' }), hint: <Kbd>S</Kbd> },
    on('todos') && { label: t('Task'), icon: 'tasks' as const, run: () => open({ kind: 'task' }), hint: <Kbd>K</Kbd> },
    on('habits') && { label: t('Habit'), icon: 'habits' as const, run: () => open({ kind: 'habit' }), hint: <Kbd>H</Kbd> },
    on('counters') && { label: t('Counter'), icon: 'counter' as const, run: () => open({ kind: 'counter' }) },
  ].filter(Boolean) as { label: string; icon: 'money'; run: () => void; hint?: React.ReactNode }[];

  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Orbit">
          <span className="brand-mark" />
          Orbit
        </NavLink>
        <nav style={{ display: 'flex', alignItems: 'center' }}>
          {top.map((p) => (
            <NavLink key={p.to} to={p.to} end={p.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {t(p.label)}
              {p.to === '/money' && reviewN > 0 && <span className="nav-dot" title={t('{n} to check', { n: reviewN })} />}
            </NavLink>
          ))}
        </nav>
        <span className="spacer" />
        <div className="search-trigger" role="button" tabIndex={0} onClick={() => setPalette('')} onKeyDown={(e) => e.key === 'Enter' && setPalette('')}>
          <Icon name="search" size={15} />
          <span style={{ flex: 1 }}>{t('Search or jump to…')}</span>
          <Kbd>{MOD}</Kbd>
          <Kbd>K</Kbd>
        </div>
        <Menu
          width={240}
          trigger={(toggle) => (
            <Button kind="primary" icon="plus" onClick={toggle} style={{ marginInlineStart: 8 }}>
              {t('New')}
            </Button>
          )}
          items={[{ label: t('Add or log'), heading: true }, ...creates]}
        />
        <Menu
          width={260}
          trigger={(toggle) => (
            <button className="btn ghost icon" onClick={toggle} aria-label={t('Account')} style={{ marginInlineStart: 4, width: 38 }}>
              <Avatar name={s.profile.name} src={s.profile.avatar} />
            </button>
          )}
          items={[
            { label: s.profile.email, heading: true },
            { label: t('Settings'), icon: 'settings', run: () => nav('/settings'), hint: <Kbd>G S</Kbd> },
            { label: t('Keyboard shortcuts'), icon: 'keyboard', run: () => setHelp(true), hint: <Kbd>?</Kbd> },
            '-',
            { label: theme === 'dark' ? t('Light theme') : t('Dark theme'), icon: theme === 'dark' ? 'sun' : 'moon', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
            { label: getLang() === 'ar' ? 'English' : 'العربية', icon: 'globe', run: () => setLangPref(getLang() === 'ar' ? 'en' : 'ar') },
            { label: t('Use the phone layout'), icon: 'phone', run: switchToPhone },
            '-',
            { label: t('Sign out'), icon: 'logout', run: signOut, danger: true },
          ]}
        />
      </header>
      <main>
        <Outlet />
      </main>
      {palette !== null && <Palette initial={palette} onClose={() => setPalette(null)} showHelp={() => setHelp(true)} />}
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </>
  );
}

/** A page's own row of tabs, each a real address. */
export function PageTabs({ tabs }: { tabs: { to: string; label: string; badge?: number; end?: boolean }[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((x) => (
        <NavLink key={x.to} to={x.to} end={x.end} role="tab" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          {x.label}
          {!!x.badge && <span className="badge accent">{x.badge}</span>}
        </NavLink>
      ))}
    </div>
  );
}

export { PLACES };
