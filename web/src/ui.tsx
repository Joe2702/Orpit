import React, { type CSSProperties } from 'react';
import { useStore } from './store';
import type { Range } from './types';

export const S = (s: CSSProperties) => s; // identity helper for readability

export function chip(active: boolean, col: string): CSSProperties {
  return {
    padding: '10px 16px',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all .15s',
    whiteSpace: 'nowrap',
    border: `1.5px solid ${active ? col : 'var(--border)'}`,
    background: active ? `color-mix(in srgb,${col} 12%,transparent)` : 'var(--surface)',
    color: active ? col : 'var(--text2)',
  };
}

export function toggleTrack(on: boolean): CSSProperties {
  return {
    width: 48,
    height: 28,
    borderRadius: 999,
    flex: 'none',
    cursor: 'pointer',
    transition: 'all .2s',
    position: 'relative',
    background: on ? 'var(--indigo)' : 'var(--border)',
  };
}
export function toggleKnob(on: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: 3,
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#fff',
    transition: 'all .25s cubic-bezier(.34,1.56,.64,1)',
    boxShadow: '0 1px 3px rgba(0,0,0,.3)',
    left: on ? 23 : 3,
  };
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 38,
        height: 38,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flex: 'none',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      <svg
        width="20"
        height="20"
        style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}
      >
        <path d="M12 5l-5 5 5 5" />
      </svg>
    </div>
  );
}

export function SectionLabel({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        color: 'var(--text2)',
        marginBottom: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function DetailHeader({
  title,
  iconColor,
  icon,
}: {
  title: string;
  iconColor?: string;
  icon?: React.ReactNode;
}) {
  const { go } = useStore();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <BackButton onClick={() => go('home')} />
      <div style={{ flex: 1, fontSize: 24, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)' }}>
        {title}
      </div>
      {icon && (
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 13,
            background: `color-mix(in srgb,var(--${iconColor}) 14%,transparent)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
          }}
        >
          {icon}
        </span>
      )}
    </div>
  );
}

export function RangeSeg() {
  const { range, setRange } = useStore();
  const items: Range[] = ['Week', 'Month', 'Year', 'All'];
  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 3,
        marginBottom: 20,
      }}
    >
      {items.map((r) => (
        <div
          key={r}
          onClick={() => setRange(r)}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '8px 0',
            borderRadius: 11,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all .2s',
            ...(range === r
              ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(20,21,26,.12)' }
              : { color: 'var(--text2)' }),
          }}
        >
          {r}
        </div>
      ))}
    </div>
  );
}

export function rangeWord(range: Range): string {
  return range === 'All' ? 'all time' : 'this ' + range.toLowerCase();
}

export function Card({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        boxShadow: 'var(--shadow)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function avatarInitial(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

/** Round profile avatar — shows the uploaded photo if there is one, else the initial. */
export function Avatar({
  name,
  src,
  size = 46,
  onClick,
}: {
  name: string;
  src?: string | null;
  size?: number;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={onClick ? 'press96' : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--indigo)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize: size * 0.38,
        flex: 'none',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {src ? (
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        avatarInitial(name)
      )}
    </div>
  );
}
