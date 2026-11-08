import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { t } from '../i18n';
import { DIcon, Kbd, MOD_KEY, placesFor } from './nav';
import { DeskModal } from './DesktopShell';

// Keyboard shortcuts on the website. None of them fire while typing in a
// field, and only Esc and the palette work while a dialog is open.

const typing = (el: EventTarget | null): boolean => {
  const n = el as HTMLElement | null;
  if (!n) return false;
  const tag = n.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable;
};

export function useDeskKeys(on: boolean, h: { palette: () => void; help: () => void; toggleSidebar: () => void; blocked: boolean }) {
  const { state, sheet, closeSheet, go, open } = useStore();
  const live = useRef({ state, sheet, h });
  live.current = { state, sheet, h };
  const pendingG = useRef(0);

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      const { state: s, sheet: sh, h: hh } = live.current;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        hh.palette();
        return;
      }
      if (e.key === 'Escape' && sh) {
        e.preventDefault();
        closeSheet();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || sh || hh.blocked || !s) return;

      if (pendingG.current && Date.now() - pendingG.current < 1500) {
        pendingG.current = 0;
        const place = placesFor(s).find((p) => p.key === e.key.toLowerCase());
        if (place) {
          e.preventDefault();
          go(place.screen);
        }
        return;
      }
      switch (e.key) {
        case 'g':
          pendingG.current = Date.now();
          return;
        case 'n':
          e.preventDefault();
          open('chooser');
          return;
        case '/':
          e.preventDefault();
          hh.palette();
          return;
        case '?':
          e.preventDefault();
          hh.help();
          return;
        case '[':
          e.preventDefault();
          hh.toggleSidebar();
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on, closeSheet, go, open]);
}

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const general: [React.ReactNode, string][] = [
    [<><Kbd>{MOD_KEY}</Kbd> <Kbd>K</Kbd></>, t('Search, jump anywhere, run a command')],
    [<Kbd>/</Kbd>, t('Search, jump anywhere, run a command')],
    [<Kbd>N</Kbd>, t('Log something')],
    [<Kbd>[</Kbd>, t('Collapse or expand the sidebar')],
    [<Kbd>Esc</Kbd>, t('Close a dialog')],
    [<Kbd>?</Kbd>, t('Show these shortcuts')],
  ];
  const places = placesFor(state!).filter((p) => p.key);
  return (
    <DeskModal onClose={onClose} wide>
      <div className="desk-modal-body" style={{ padding: '26px 30px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <DIcon name="keyboard" size={24} style={{ color: 'var(--indigo)' }} />
          <div className="display" style={{ fontSize: 32, lineHeight: 1, color: 'var(--text)', flex: 1 }}>{t('Keyboard shortcuts')}</div>
          <button className="desk-icon-btn" onClick={onClose} aria-label={t('Close')}>
            <svg width="14" height="14" aria-hidden style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' }}>
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 36px' }}>
          <div>
            <div className="desk-group-label" style={{ padding: '0 0 8px' }}>{t('Anywhere')}</div>
            {general.map(([k, label], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--hairline)', fontSize: 13.5, color: 'var(--text)' }}>
                <span style={{ flex: 1 }}>{label}</span>
                <span style={{ display: 'flex', gap: 4 }}>{k}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="desk-group-label" style={{ padding: '0 0 8px' }}>{t('Go to: press G, then')}</div>
            {places.map((p) => (
              <div key={p.screen} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--hairline)', fontSize: 13.5, color: 'var(--text)' }}>
                <DIcon name={p.icon} size={16} style={{ color: 'var(--text3)' }} />
                <span style={{ flex: 1 }}>{t(p.label)}</span>
                <Kbd>{p.key!.toUpperCase()}</Kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DeskModal>
  );
}
