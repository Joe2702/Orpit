import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { OrbitMark } from '../OrbitMark';
import { Avatar } from '../ui';
import { t } from '../i18n';
import { assistantUnread } from '../lib/assistant';
import { DIcon, GROUP_LABEL, Kbd, MOD_KEY, placesFor, sectionOf, type DeskPlace } from './nav';
import './desktop.css';

// The website's frame: a sidebar of every place in Orbit, and the page beside
// it. The phone app's screens render in the page as they are; Home and the
// transactions list have wide versions of their own.

const COLLAPSE_KEY = 'orbit.desk.collapsed';
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

export function useSidebarCollapsed(): [boolean, (v: boolean) => void] {
  const [c, setC] = useState(readCollapsed);
  useEffect(() => {
    const on = () => setC(readCollapsed());
    window.addEventListener('orbit-sidebar', on);
    return () => window.removeEventListener('orbit-sidebar', on);
  }, []);
  const set = (v: boolean) => {
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
    } catch {
      /* private window: it just won't be remembered */
    }
    window.dispatchEvent(new Event('orbit-sidebar'));
  };
  return [c, set];
}

/** Screens with a wide layout of their own; everything else reads in a column. */
const WIDE = ['home', 'ftxns'];
const MID = ['analytics', 'finances', 'insights', 'finsights'];

const GROUPS_KEY = 'orbit.desk.folded';
const readFolded = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]');
  } catch {
    return [];
  }
};

export function DesktopShell({
  scrollRef,
  children,
  theme,
  setTheme,
  openPalette,
  showHelp,
}: {
  scrollRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  openPalette: () => void;
  showHelp: () => void;
}) {
  const { state, screen, go, open } = useStore();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  // Sections of the sidebar fold away, and stay folded.
  const [folded, setFolded] = useState<string[]>(readFolded);
  const fold = (g: string) => {
    const next = folded.includes(g) ? folded.filter((x) => x !== g) : [...folded, g];
    setFolded(next);
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
    } catch {
      /* not remembered */
    }
  };
  const here = sectionOf(screen);
  const places = placesFor(state!);
  const groups = (['main', 'track', 'money', 'reflect'] as const).map((g) => ({
    g,
    items: places.filter((p) => p.group === g && p.screen !== 'settings'),
  }));
  const settings = places.find((p) => p.screen === 'settings')!;
  const briefNew = assistantUnread(state!.assistantBrief);
  const reviewCount = state!.txns.filter((x) => x.review).length;

  // Scroll back to the top on a new page, as a website does.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [screen, scrollRef]);

  const badge = (p: DeskPlace): React.ReactNode => {
    if (p.screen === 'brief' && briefNew) return <span className="desk-dot" aria-label={t('New')} />;
    if (p.screen === 'ftxns' && reviewCount > 0) return <span className="desk-count">{reviewCount > 99 ? '99+' : reviewCount}</span>;
    return null;
  };

  const item = (p: DeskPlace) => {
    const on = here === p.screen;
    return (
      <div
        key={p.screen}
        role="link"
        tabIndex={0}
        aria-current={on ? 'page' : undefined}
        title={collapsed ? t(p.label) : undefined}
        className={`desk-nav${on ? ' on' : ''}`}
        onClick={() => go(p.screen)}
        onKeyDown={(e) => e.key === 'Enter' && go(p.screen)}
      >
        <DIcon name={p.icon} />
        {!collapsed && <span className="desk-nav-label">{t(p.label)}</span>}
        {!collapsed && badge(p)}
        {collapsed && badge(p) && <span className="desk-dot desk-dot-corner" />}
      </div>
    );
  };

  const profile = state!.profile;
  return (
    <div className={`desk-root${collapsed ? ' collapsed' : ''}`}>
      <nav className="desk-side" aria-label={t('Orbit')}>
        <div className="desk-brand">
          <div role="link" tabIndex={0} onClick={() => go('home')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 0 }}>
            <OrbitMark size={26} />
            {!collapsed && <span className="display" style={{ fontSize: 25, lineHeight: 1, color: 'var(--text)' }}>Orbit</span>}
          </div>
          {!collapsed && (
            <button className="desk-icon-btn" onClick={() => setCollapsed(true)} title={`${t('Collapse sidebar')}  [`} aria-label={t('Collapse sidebar')}>
              <DIcon name="collapse" size={18} />
            </button>
          )}
        </div>
        {collapsed && (
          <button className="desk-icon-btn" style={{ alignSelf: 'center', marginBottom: 6 }} onClick={() => setCollapsed(false)} title={`${t('Expand sidebar')}  [`} aria-label={t('Expand sidebar')}>
            <DIcon name="collapse" size={18} style={{ transform: 'scaleX(-1)' }} />
          </button>
        )}

        <div className="desk-search" role="button" tabIndex={0} onClick={openPalette} onKeyDown={(e) => e.key === 'Enter' && openPalette()} title={collapsed ? t('Search or jump to…') : undefined}>
          <DIcon name="search" size={17} />
          {!collapsed && <span style={{ flex: 1, minWidth: 0 }}>{t('Search or jump to…')}</span>}
          {!collapsed && <Kbd>{MOD_KEY} K</Kbd>}
        </div>
        <div className="desk-new" role="button" tabIndex={0} onClick={() => open('chooser')} onKeyDown={(e) => e.key === 'Enter' && open('chooser')} title={collapsed ? t('Log something') : undefined}>
          <DIcon name="plus" size={18} sw={2.3} />
          {!collapsed && <span style={{ flex: 1 }}>{t('Log something')}</span>}
          {!collapsed && <Kbd style={{ background: 'rgba(255,255,255,.18)', color: 'inherit', borderColor: 'transparent' }}>N</Kbd>}
        </div>

        <div className="desk-nav-scroll">
          {groups.map(({ g, items }) =>
            items.length ? (
              <div key={g} className="desk-group">
                {GROUP_LABEL[g] && !collapsed && (
                  <div className="desk-group-label" role="button" tabIndex={0} aria-expanded={!folded.includes(g)} onClick={() => fold(g)} onKeyDown={(e) => e.key === 'Enter' && fold(g)}>
                    <span style={{ flex: 1 }}>{t(GROUP_LABEL[g])}</span>
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', transition: 'transform .2s', transform: folded.includes(g) ? 'rotate(-90deg)' : 'none' }}>
                      <path d="M2 3.5l3 3 3-3" />
                    </svg>
                  </div>
                )}
                {GROUP_LABEL[g] && collapsed && <div className="desk-group-rule" />}
                {(collapsed || !folded.includes(g) || items.some((p) => p.screen === here)) && items.map(item)}
              </div>
            ) : null
          )}
        </div>

        <div className="desk-foot">
          <div className="desk-me" role="link" tabIndex={0} onClick={() => go('settings')} onKeyDown={(e) => e.key === 'Enter' && go('settings')} title={collapsed ? t(settings.label) : undefined} aria-current={here === 'settings' ? 'page' : undefined}>
            <Avatar name={profile.name} src={profile.avatar} size={32} />
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.name || t('You')}</div>
                <div dir="ltr" style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'start' }}>{profile.email}</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="desk-icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? t('Light theme') : t('Dark theme')} aria-label={theme === 'dark' ? t('Light theme') : t('Dark theme')}>
                <DIcon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
              </button>
              <button className="desk-icon-btn" onClick={showHelp} title={t('Keyboard shortcuts')} aria-label={t('Keyboard shortcuts')}>
                <DIcon name="keyboard" size={17} />
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="desk-main">
        <div ref={scrollRef} className="desk-scroll">
          <div className={`desk-page${WIDE.includes(screen) ? ' wide' : MID.includes(screen) ? ' mid' : ''}${here === screen ? ' top' : ''}`}>{children}</div>
        </div>
      </main>
    </div>
  );
}

/**
 * A sheet, on a big screen: the same content as on the phone, in a dialog in
 * the middle of the window instead of a panel rising from the bottom edge.
 */
export function DeskModal({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="desk-modal-wrap" role="presentation">
      <div className="desk-scrim" onClick={onClose} />
      <div role="dialog" aria-modal className="desk-modal glass-strong" data-lens="dialog" style={wide ? { width: 'min(720px, 94vw)' } : undefined}>
        {children}
      </div>
    </div>
  );
}

/**
 * Story reports are made for a phone held upright. On a big screen one plays
 * in a phone-sized frame in the middle of the window; `transform` makes the
 * frame the box its full-screen layers fill.
 */
export function StoryFrame({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="desk-modal-wrap" style={{ zIndex: 118 }}>
      <div className="desk-scrim" style={{ background: 'rgba(4,4,8,.72)' }} onClick={onClose} />
      <div className="desk-story">{children}</div>
    </div>
  );
}
