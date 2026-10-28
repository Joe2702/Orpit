import React, { type CSSProperties } from 'react';
import { useStore } from './store';
import type { Range } from './types';

export const S = (s: CSSProperties) => s; // identity helper for readability

export function chip(active: boolean, col: string): CSSProperties {
  return {
    padding: '10px 16px',
    borderRadius: 'calc(12px * var(--sq))',
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
    <div role="button" tabIndex={0} aria-label="Back"
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

export function SectionLabel({
  children,
  style,
  action,
}: {
  children: React.ReactNode;
  style?: CSSProperties;
  /** Optional trailing link, e.g. "See all". */
  action?: { label: string; onClick: () => void };
}) {
  // Sentence case, in the text colour. Small spaced-out capitals over every
  // group is the most recognisable mark of a component-library screen.
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '6px 2px 10px', ...style }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 650, letterSpacing: '-.01em', color: 'var(--text)' }}>{children}</div>
      {action && (
        <span tabIndex={0} onClick={action.onClick} role="button" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--indigo)', cursor: 'pointer', flex: 'none' }}>
          {action.label}
        </span>
      )}
    </div>
  );
}

export function DetailHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { go } = useStore();
  return (
    <div style={{ marginBottom: 18 }}>
      <BackButton onClick={() => go('home')} />
      <div className="display" style={{ fontSize: 38, lineHeight: 1.05, color: 'var(--text)', marginTop: 14 }}>
        {title}
      </div>
      {subtitle && <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}

const Chevron = ({ dir }: { dir: 'l' | 'r' }) => (
  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
    <path d={dir === 'l' ? 'M12 5l-5 5 5 5' : 'M8 5l5 5-5 5'} />
  </svg>
);

/**
 * Week / Month / Year / All, and which one: "‹ Oct 18 – 24 ›".
 *
 * The dates are spelled out under the control because the control alone left
 * people guessing — "Year" used to mean the last twelve months, and nothing on
 * screen said so. Now every chart sits under the exact dates it covers, and the
 * arrows step back through earlier weeks, months and years.
 */
export function RangeSeg({ period }: { period?: { title: string; caption: string; hasPrev: boolean; isCurrent: boolean } }) {
  const { range, setRange, rangeOffset, setRangeOffset } = useStore();
  const items: Range[] = ['Week', 'Month', 'Year', 'All'];
  const navBtn = (dir: 'l' | 'r', enabled: boolean, onClick: () => void, label: string) => (
    <div tabIndex={0}
      onClick={enabled ? onClick : undefined}
      role="button"
      aria-label={label}
      aria-disabled={!enabled}
      className={enabled ? 'press92' : undefined}
      style={{
        width: 40,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'calc(10px * var(--sq))',
        color: enabled ? 'var(--text)' : 'var(--text3)',
        opacity: enabled ? 1 : 0.35,
        cursor: enabled ? 'pointer' : 'default',
        flex: 'none',
      }}
    >
      <Chevron dir={dir} />
    </div>
  );
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: 2,
          background: 'color-mix(in srgb, var(--text) 5%, transparent)',
          borderRadius: 'calc(13px * var(--sq))',
          padding: 3,
        }}
      >
        {items.map((r) => (
          <div tabIndex={0}
            key={r}
            role="tab"
            aria-selected={range === r}
            onClick={() => setRange(r)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              // 44px is the smallest reliable touch target. This is the control
              // people reach for on every stats screen.
              minHeight: 40,
              borderRadius: 'calc(10px * var(--sq))',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background .2s, color .2s',
              ...(range === r
                ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 2px rgba(0,0,0,.08), 0 2px 8px -4px rgba(0,0,0,.16)' }
                : { color: 'var(--text2)' }),
            }}
          >
            {r}
          </div>
        ))}
      </div>
      {period && (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
          {range !== 'All' && navBtn('l', period.hasPrev, () => setRangeOffset(rangeOffset + 1), 'Previous period')}
          <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }} aria-live="polite">
            <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--text)', letterSpacing: '-.01em' }}>{period.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>{period.caption}</div>
          </div>
          {range !== 'All' && navBtn('r', !period.isCurrent, () => setRangeOffset(rangeOffset - 1), 'Next period')}
        </div>
      )}
    </div>
  );
}

/**
 * The one way a tracker screen offers its main action: tinted with the
 * tracker's colour rather than filled with it. Four screens each opening with
 * a full-width slab of saturated colour was loud in a way nothing else on the
 * screen could compete with.
 */
export function TrackerAction({ label, onClick }: { color?: string; label: string; onClick: () => void }) {
  return (
    <div tabIndex={0}
      onClick={onClick}
      className="press99"
      role="button"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 50,
        borderRadius: 'calc(15px * var(--sq))',
        marginBottom: 16,
        cursor: 'pointer',
        fontSize: 15,
        fontWeight: 650,
        color: 'var(--indigo)',
        background: 'color-mix(in srgb, var(--indigo) 11%, var(--surface))',
        border: '1px solid color-mix(in srgb, var(--indigo) 18%, transparent)',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2.3, strokeLinecap: 'round' }}>
        <path d="M10 4v12M4 10h12" />
      </svg>
      {label}
    </div>
  );
}

/** A figure with its label underneath, for rows of headline numbers. */
export function Stat({
  value,
  label,
  color = 'var(--text)',
  size = 'md',
  align = 'left',
}: {
  value: React.ReactNode;
  label: string;
  color?: string;
  size?: 'lg' | 'md' | 'sm';
  align?: 'left' | 'center';
}) {
  const fs = size === 'lg' ? 30 : size === 'md' ? 22 : 18;
  // Long figures shrink to fit their column instead of ending in "…": a
  // bold digit is about 0.6em wide, so `chars` of them fit when the size is at
  // most 100cqi / (0.6 × chars). Older WebViews without container units drop
  // the declaration and fall back to the inherited size, which still fits.
  const chars = typeof value === 'string' || typeof value === 'number' ? String(value).length : 0;
  const fit = chars > 4 ? `min(${fs}px, ${(100 / (0.6 * chars)).toFixed(1)}cqi)` : `${fs}px`;
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: align, containerType: 'inline-size' }}>
      <div
        style={{
          fontSize: fit,
          fontWeight: 700,
          letterSpacing: '-.03em',
          color,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      {/* Labels wrap rather than truncate: at the largest text size a
          three-column row has about 60px per label. */}
      <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 5, lineHeight: 1.25, overflowWrap: 'break-word' }}>{label}</div>
    </div>
  );
}

/** Headline figures side by side on one card, separated by hairlines. */
export function StatRow({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  const kids = React.Children.toArray(children).filter(Boolean);
  return (
    <Card style={{ display: 'flex', padding: '16px 4px', marginBottom: 12, ...style }}>
      {kids.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--hairline)', margin: '2px 0' }} />}
          <div style={{ flex: 1, minWidth: 0, padding: '0 12px' }}>{k}</div>
        </React.Fragment>
      ))}
    </Card>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'calc(20px * var(--sq))',
        boxShadow: 'var(--shadow)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A card holding one chart: what it shows, the headline figure, then the chart. */
export function ChartCard({
  title,
  value,
  note,
  action,
  children,
  style,
}: {
  title: string;
  value?: React.ReactNode;
  /** Small text beside the value, e.g. "avg 52 min a session". */
  note?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Card style={{ padding: '16px 18px 14px', marginBottom: 12, ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text2)' }}>{title}</div>
        {action && (
          <span tabIndex={0} onClick={action.onClick} role="button" style={{ fontSize: 13, fontWeight: 600, color: 'var(--indigo)', cursor: 'pointer' }}>
            {action.label}
          </span>
        )}
      </div>
      {(value != null || note) && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {value != null && <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.035em', color: 'var(--text)' }}>{value}</div>}
          {note && <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>{note}</div>}
        </div>
      )}
      <div style={{ marginTop: 18 }}>{children}</div>
    </Card>
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
    <div role="button" tabIndex={0}
      onClick={onClick}
      className={onClick ? 'press96' : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text)',
        fontWeight: 650,
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
