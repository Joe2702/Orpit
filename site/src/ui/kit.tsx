import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { t, isRTL } from '../i18n';

// The website's building blocks. Every overlay goes to <body> through a
// portal, closes on Esc and on a click outside, and gives focus back.

const portal = (node: React.ReactNode) => createPortal(node, document.body);

function useEsc(on: boolean, close: () => void) {
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [on, close]);
}

export function Button({
  children,
  icon,
  kind,
  size,
  onClick,
  type = 'button',
  disabled,
  title,
  style,
  className = '',
}: {
  children?: React.ReactNode;
  icon?: IconName;
  kind?: 'primary' | 'ghost' | 'danger' | 'danger solid';
  size?: 'sm';
  onClick?: (e: React.MouseEvent) => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  title?: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  const only = icon && !children;
  return (
    <button
      type={type}
      className={`btn ${kind || ''} ${size || ''} ${only ? 'icon' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={only ? title : undefined}
      style={style}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

/** A centred dialog: a form, a question, a list to pick from. */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
  onSubmit,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  onSubmit?: () => void;
}) {
  useEsc(true, onClose);
  const box = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>('input:not([type=checkbox]):not([disabled]), textarea, select');
    (first || box.current)?.focus();
    return () => back?.focus?.();
  }, []);
  return portal(
    <>
      <div className="scrim" onMouseDown={onClose} />
      <form
        ref={box}
        tabIndex={-1}
        className={`dialog${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        <div className="dialog-head">
          <div className="dialog-title">{title}</div>
          <span className="spacer" />
          <Button icon="x" kind="ghost" size="sm" title={t('Close')} onClick={onClose} />
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </form>
    </>
  );
}

/** Save / Cancel, the way every form ends. */
export function FormFoot({ onCancel, saveLabel, busy, left }: { onCancel: () => void; saveLabel?: string; busy?: boolean; left?: React.ReactNode }) {
  return (
    <>
      {left}
      <span className="spacer" />
      <Button kind="ghost" onClick={onCancel}>
        {t('Cancel')}
      </Button>
      <Button kind="primary" type="submit" disabled={busy}>
        {saveLabel || t('Save')}
      </Button>
    </>
  );
}

/** A panel sliding in from the side: the details of one thing, beside the list it came from. */
export function Drawer({ title, sub, onClose, children, actions, wide }: { title: React.ReactNode; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode; actions?: React.ReactNode; wide?: boolean }) {
  useEsc(true, onClose);
  return portal(
    <>
      <div className="scrim" style={{ background: 'color-mix(in srgb, var(--scrim) 50%, transparent)' }} onMouseDown={onClose} />
      <aside className={`drawer${wide ? ' wide' : ''}`} role="dialog" aria-modal>
        <div className="dialog-head" style={{ padding: '18px 22px', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-0.015em' }}>{title}</div>
            {sub && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{sub}</div>}
          </div>
          {actions}
          <Button icon="x" kind="ghost" size="sm" title={t('Close')} onClick={onClose} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>{children}</div>
      </aside>
    </>
  );
}

export interface MenuItem {
  label: string;
  icon?: IconName;
  run: () => void;
  danger?: boolean;
  hint?: React.ReactNode;
}

/** A dropdown that opens under whatever was clicked. */
export function Menu({ trigger, items, align = 'end', width }: { trigger: (open: () => void, isOpen: boolean) => React.ReactNode; items: (MenuItem | '-' | { label: string; heading: true })[]; align?: 'start' | 'end'; width?: number }) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = () => setAt(null);
  useEsc(!!at, close);
  const open = () => {
    const r = anchor.current!.getBoundingClientRect();
    const w = width || 220;
    const endSide = (align === 'end') !== isRTL();
    setAt({ top: r.bottom + 6, left: Math.max(8, Math.min(window.innerWidth - w - 8, endSide ? r.right - w : r.left)) });
  };
  useEffect(() => {
    if (!at) return;
    const off = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) close();
    };
    const scroll = () => close();
    window.addEventListener('mousedown', off);
    window.addEventListener('scroll', scroll, true);
    return () => {
      window.removeEventListener('mousedown', off);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [at]);
  return (
    <>
      <span ref={anchor} style={{ display: 'inline-flex' }}>
        {trigger(() => (at ? close() : open()), !!at)}
      </span>
      {at &&
        portal(
          <div ref={box} className="menu" role="menu" style={{ top: at.top, left: at.left, width: width || 220 }}>
            {items.map((it, i) =>
              it === '-' ? (
                <div key={i} className="menu-sep" />
              ) : 'heading' in it ? (
                <div key={i} className="menu-label">
                  {it.label}
                </div>
              ) : (
                <button
                  key={i}
                  role="menuitem"
                  className={`menu-item${it.danger ? ' danger' : ''}`}
                  onClick={() => {
                    close();
                    it.run();
                  }}
                >
                  {it.icon && <Icon name={it.icon} size={15} />}
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {it.hint}
                </button>
              )
            )}
          </div>
        )}
    </>
  );
}

export function Field({ label, children, hint, full, style }: { label: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode; full?: boolean; style?: React.CSSProperties }) {
  return (
    <div className={`field${full ? ' full' : ''}`} style={style}>
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, full }: { value: T; options: [T, React.ReactNode][]; onChange: (v: T) => void; full?: boolean }) {
  return (
    <div className={`seg${full ? ' full' : ''}`} role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Check({ on, onChange, label, round, partial }: { on: boolean; onChange: () => void; label: string; round?: boolean; partial?: boolean }) {
  return (
    <span
      role="checkbox"
      aria-checked={partial ? 'mixed' : on}
      aria-label={label}
      tabIndex={0}
      className={`check${round ? ' round' : ''}${on || partial ? ' on' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          onChange();
        }
      }}
    >
      {on && <Icon name="check" size={12} sw={3} />}
      {partial && !on && <Icon name="minus" size={12} sw={3} />}
    </span>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <span role="switch" aria-checked={on} aria-label={label} tabIndex={0} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), onChange(!on))} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Empty({ title, children, action, icon }: { title: string; children?: React.ReactNode; action?: React.ReactNode; icon?: IconName }) {
  return (
    <div className="empty">
      {icon && (
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--panel-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, color: 'var(--text-2)' }}>
          <Icon name={icon} size={20} />
        </div>
      )}
      <div className="empty-title">{title}</div>
      {children && <div style={{ fontSize: 13.5, maxWidth: 380, margin: '0 auto' }}>{children}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

/** The colour choices for habits, counters, lists and accounts: the same names the phone uses. */
export const COLOR_KEYS = ['indigo', 'blue', 'cyan', 'teal', 'emerald', 'amber', 'coral', 'rose', 'pink', 'purple'] as const;
const SWATCH: Record<string, string> = {
  indigo: '#6d78f7',
  blue: '#5b8cf0',
  cyan: '#38b3cf',
  teal: '#35b0a0',
  emerald: '#3aa97c',
  amber: '#dc9a3b',
  coral: '#e47a63',
  rose: '#e36377',
  pink: '#d965a0',
  purple: '#9a78ea',
};
/** A stored colour (a name or a hex) as something CSS can paint. */
export const paint = (c: string | null | undefined): string => (c && c.startsWith('#') ? c : SWATCH[c || 'indigo'] || SWATCH.indigo);

export function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      {COLOR_KEYS.map((c) => (
        <span key={c} role="radio" aria-checked={value === c} aria-label={c} tabIndex={0} className={`swatch${value === c ? ' on' : ''}`} style={{ background: SWATCH[c], color: SWATCH[c] }} onClick={() => onChange(c)} onKeyDown={(e) => e.key === 'Enter' && onChange(c)} />
      ))}
    </div>
  );
}

/** Measures an element's width, for charts that fill whatever space they're given. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setW(ref.current.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function Avatar({ name, src, size = 30 }: { name: string; src?: string | null; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src ? <img src={src} alt="" /> : (name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function Delta({ pct, goodWhenUp = true, suffix }: { pct: number | null; goodWhenUp?: boolean; suffix?: string }) {
  if (pct == null || !isFinite(pct)) return null;
  const r = Math.round(pct);
  const cls = r === 0 ? 'flat' : (r > 0) === goodWhenUp ? 'up' : 'down';
  return (
    <span className={`delta ${cls}`}>
      {r !== 0 && <Icon name={r > 0 ? 'arrowUp' : 'arrowDown'} size={11} sw={2.4} />}
      {Math.abs(r)}%{suffix ? ` ${suffix}` : ''}
    </span>
  );
}
