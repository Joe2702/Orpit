import React, { useCallback, useEffect, useRef, useState } from 'react';

// Swipe a list row left to reveal Edit / Delete, the way native list apps work.
//
// The gesture rides on `touch-action: pan-y`: the browser keeps handling
// vertical scrolling itself and hands us the horizontal axis, so we never have
// to preventDefault or fight the scroll container. Pointer events cover touch,
// pen and mouse from one code path.

const BTN_W = 74;

// Only one row may sit open at a time — opening a second closes the first,
// which is what every native list does and what stops the UI feeling untidy.
let closeOthers: (() => void) | null = null;

export function SwipeRow({
  children,
  onEdit,
  onDelete,
  deleteLabel = 'Delete',
  disabled = false,
}: {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete: () => void;
  deleteLabel?: string;
  disabled?: boolean;
}) {
  const width = (onEdit ? BTN_W : 0) + BTN_W;
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; base: number } | null>(null);
  const opened = useRef(false);

  const close = useCallback(() => {
    opened.current = false;
    setDx(0);
    if (closeOthers === close) closeOthers = null;
  }, []);

  // Leaving the screen (or unmounting) shouldn't strand a row half-open.
  useEffect(() => () => { if (closeOthers === close) closeOthers = null; }, [close]);

  const down = (e: React.PointerEvent) => {
    if (disabled) return;
    // Ignore taps that land on the revealed buttons themselves.
    if ((e.target as HTMLElement).closest('[data-swipe-action]')) return;
    start.current = { x: e.clientX, base: dx };
  };

  const move = (e: React.PointerEvent) => {
    if (!start.current) return;
    const delta = e.clientX - start.current.x;
    if (!dragging) {
      if (Math.abs(delta) < 6) return; // let small jitters through as taps
      setDragging(true);
      if (!opened.current && closeOthers) closeOthers();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    // Clamp to the action strip, with a little rubber-band past each end.
    const raw = start.current.base + delta;
    setDx(raw > 0 ? raw * 0.18 : raw < -width ? -width + (raw + width) * 0.18 : raw);
  };

  const up = () => {
    if (!start.current) return;
    start.current = null;
    if (!dragging) return;
    setDragging(false);
    // Past the halfway mark, commit to open — otherwise spring shut.
    if (dx < -width / 2) {
      opened.current = true;
      setDx(-width);
      closeOthers = close;
    } else {
      close();
    }
  };

  // While open, the first tap anywhere on the row closes it instead of firing
  // whatever the row itself does — a tap should never be a surprise edit.
  const clickCapture = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-swipe-action]')) return;
    if (opened.current || dragging) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const btn = (label: string, color: string, icon: React.ReactNode, fn: () => void) => (
    <div
      data-swipe-action
      onClick={(e) => { e.stopPropagation(); close(); fn(); }}
      className="press92"
      role="button"
      aria-label={label}
      style={{ width: BTN_W, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: color, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
    >
      {icon}
      {label}
    </div>
  );

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18 }}>
      {/* Action strip, revealed as the row slides off it. */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end' }} aria-hidden={dx === 0}>
        {onEdit &&
          btn('Edit', 'var(--blue)', (
            <svg width="19" height="19" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M12.5 3.2l3.3 3.3M3 16h3.4l9-9-3.4-3.4-9 9z" />
            </svg>
          ), onEdit)}
        {btn(deleteLabel, 'var(--danger)', (
          <svg width="19" height="19" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M3.5 5.5h12M7.5 5.5V3.5h4v2M5 5.5l.8 10h7.4l.8-10" />
          </svg>
        ), onDelete)}
      </div>

      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={clickCapture}
        // Once this row owns the gesture, hide the touch stream from the
        // ancestors — otherwise swiping a row would also flip the app to the
        // next tab. Before the drag threshold everything still bubbles, so
        // pull-to-refresh continues to work when starting on top of a row.
        onTouchMove={(e) => { if (dragging) e.stopPropagation(); }}
        onTouchEnd={(e) => { if (dragging) e.stopPropagation(); }}
        style={{
          position: 'relative',
          touchAction: 'pan-y',
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform .22s cubic-bezier(.2,.8,.3,1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
