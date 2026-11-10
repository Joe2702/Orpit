import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store';
import { useOpen } from '../forms/host';
import { enabled } from '@core/lib/modules';
import { t } from '../i18n';
import { Dialog, Kbd } from '../ui/kit';
import { visiblePlaces, MOD } from './nav';

// Keyboard shortcuts. None fire while typing in a field or with a dialog open,
// except the one that opens search.

const typing = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  return !!n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || n.isContentEditable);
};
const overlayOpen = () => !!document.querySelector('.dialog, .drawer, .palette, .menu');

export function useShortcuts(h: { palette: () => void; create: () => void; help: () => void; blocked: boolean }) {
  const s = useData();
  const nav = useNavigate();
  const open = useOpen();
  const live = useRef({ s, h });
  live.current = { s, h };
  const g = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { s: st, h: hh } = live.current;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!hh.blocked) hh.palette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || hh.blocked || overlayOpen()) return;
      const k = e.key.toLowerCase();
      if (g.current && Date.now() - g.current < 1500) {
        g.current = 0;
        const p = visiblePlaces(st).find((x) => x.key === k);
        if (p) {
          e.preventDefault();
          nav(p.to);
        }
        return;
      }
      const on = (m: string) => enabled(st, m);
      if (k === 'g') g.current = Date.now();
      else if (k === '/') (e.preventDefault(), hh.palette());
      else if (e.key === '?') (e.preventDefault(), hh.help());
      else if (k === 'n') (e.preventDefault(), hh.create());
      else if (k === 't' && on('finances')) (e.preventDefault(), open({ kind: 'txn' }));
      else if (k === 'w' && on('workouts')) (e.preventDefault(), open({ kind: 'workout' }));
      else if (k === 's' && on('sleep')) (e.preventDefault(), open({ kind: 'night' }));
      else if (k === 'k' && on('todos')) (e.preventDefault(), open({ kind: 'task' }));
      else if (k === 'h' && on('habits')) (e.preventDefault(), open({ kind: 'habit' }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav, open]);
}

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const s = useData();
  const row = (keys: React.ReactNode, label: string, k: string | number) => (
    <div key={k} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <span style={{ flex: 1 }}>{label}</span>
      <span className="row" style={{ gap: 4 }}>
        {keys}
      </span>
    </div>
  );
  const on = (m: string) => enabled(s, m);
  return (
    <Dialog title={t('Keyboard shortcuts')} onClose={onClose} wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>{t('Anywhere')}</div>
          {row(<><Kbd>{MOD}</Kbd><Kbd>K</Kbd></>, t('Search, jump, run a command'), 'k')}
          {row(<Kbd>/</Kbd>, t('Search'), 's')}
          {row(<Kbd>N</Kbd>, t('Add or log something'), 'n')}
          {on('finances') && row(<Kbd>T</Kbd>, t('New transaction'), 't')}
          {on('workouts') && row(<Kbd>W</Kbd>, t('Log a workout'), 'w')}
          {on('sleep') && row(<Kbd>S</Kbd>, t('Log sleep'), 'z')}
          {on('todos') && row(<Kbd>K</Kbd>, t('New task'), 'tk')}
          {on('habits') && row(<Kbd>H</Kbd>, t('New habit'), 'h')}
          {row(<Kbd>Esc</Kbd>, t('Close'), 'esc')}
          {row(<Kbd>?</Kbd>, t('This list'), 'q')}
        </div>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>{t('Go to: press G, then')}</div>
          {visiblePlaces(s)
            .filter((p) => p.key)
            .map((p) => row(<Kbd>{p.key!.toUpperCase()}</Kbd>, t(p.label), p.to))}
        </div>
      </div>
    </Dialog>
  );
}
