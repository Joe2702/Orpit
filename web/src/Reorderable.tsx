import React, { useEffect, useRef, useState } from 'react';
import { t } from './i18n';

interface Item {
  id: string;
  node: React.ReactNode;
}

/**
 * Drag a block by its handle (the ⋮⋮ grip beside it) to reorder.
 *
 * Only the handle starts a drag, and it starts at once: holding anywhere on a
 * card used to pick it up, which made a slow tap or a pause mid-scroll move
 * things nobody meant to move. The handle sits in the margin beside each
 * block, level with its title, the same place on every screen.
 *
 * Uses NON-passive native touch listeners so we can call preventDefault() once a
 * drag begins — that's what actually stops the page from scrolling and stealing
 * the gesture (React's synthetic listeners are passive and can't do this, which
 * is why an earlier pointer-event version failed). The handle also has
 * `touch-action: none`, so the browser never treats it as a scroll.
 *
 * From the keyboard, a focused handle moves its block with the arrow keys.
 */
export function Reorderable({ items, onReorder, handleTop = 2 }: { items: Item[]; onReorder: (ids: string[]) => void; handleTop?: number }) {
  const idsKey = items.map((i) => i.id).join('|');
  const [order, setOrder] = useState<string[]>(items.map((i) => i.id));
  useEffect(() => setOrder(items.map((i) => i.id)), [idsKey]);

  const byId = new Map(items.map((i) => [i.id, i.node]));
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDY, setDragDY] = useState(0);
  const [shift, setShift] = useState<Record<string, number>>({});

  // Mutable gesture state (refs so the native listeners always see the latest).
  const S = useRef<{
    pending: { id: string; startY: number } | null;
    info: { id: string; startY: number; slots: { id: string; top: number; height: number }[]; dIdx: number; height: number; T: number } | null;
    timer: ReturnType<typeof setTimeout> | undefined;
  }>({ pending: null, info: null, timer: undefined });

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;

    const idFrom = (target: EventTarget | null): string | null => {
      const el = (target as HTMLElement | null)?.closest?.('[data-rid]') as HTMLElement | null;
      return el?.getAttribute('data-rid') || null;
    };

    const activate = () => {
      const p = S.current.pending;
      if (!p) return;
      S.current.pending = null;
      const slots = order.map((sid) => {
        const r = wrapRefs.current.get(sid)!.getBoundingClientRect();
        return { id: sid, top: r.top, height: r.height };
      });
      const dIdx = order.indexOf(p.id);
      if (dIdx < 0) return;
      S.current.info = { id: p.id, startY: p.startY, slots, dIdx, height: slots[dIdx].height, T: dIdx };
      setDragId(p.id);
      setDragDY(0);
      setShift({});
      if ('vibrate' in navigator) navigator.vibrate(18);
    };

    const doDrag = (clientY: number) => {
      const inf = S.current.info;
      if (!inf) return;
      const dy = clientY - inf.startY;
      setDragDY(dy);
      const dragged = inf.slots[inf.dIdx];
      const dc = dragged.top + dragged.height / 2 + dy;
      let T = 0;
      inf.slots.forEach((s, i) => {
        if (i === inf.dIdx) return;
        if (dc > s.top + s.height / 2) T++;
      });
      inf.T = T;
      const sh: Record<string, number> = {};
      inf.slots.forEach((s, i) => {
        if (i === inf.dIdx) return;
        let v = 0;
        if (T > inf.dIdx && i > inf.dIdx && i <= T) v = -inf.height;
        else if (T < inf.dIdx && i >= T && i < inf.dIdx) v = inf.height;
        sh[s.id] = v;
      });
      setShift(sh);
    };

    const onHandle = (target: EventTarget | null) => !!(target as HTMLElement | null)?.closest?.('[data-drag-handle]');
    const start = (clientY: number, id: string | null) => {
      if (!id) return;
      S.current.pending = { id, startY: clientY };
      clearTimeout(S.current.timer);
      activate();
    };
    const move = (clientY: number, e: Event) => {
      if (S.current.info) {
        e.preventDefault(); // block page scroll while dragging
        doDrag(clientY);
        return;
      }
      if (S.current.pending && Math.abs(clientY - S.current.pending.startY) > 12) {
        clearTimeout(S.current.timer);
        S.current.pending = null; // it's a scroll, not a hold
      }
    };
    const finish = () => {
      clearTimeout(S.current.timer);
      const inf = S.current.info;
      S.current.info = null;
      S.current.pending = null;
      setDragId(null);
      setDragDY(0);
      setShift({});
      if (inf) {
        const others = order.filter((x) => x !== inf.id);
        others.splice(inf.T, 0, inf.id);
        if (others.join('|') !== order.join('|')) {
          setOrder(others);
          onReorder(others);
        }
      }
    };

    // Both, always: a laptop with a touch screen has a mouse too. A browser
    // follows a tap with pretend mouse events; those are ignored, so one
    // touch can't start a second drag.
    let lastTouch = 0;
    const onTS = (e: TouchEvent) => {
      lastTouch = Date.now();
      const t = e.touches[0];
      if (t && onHandle(e.target)) start(t.clientY, idFrom(e.target));
    };
    const onTM = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) move(t.clientY, e);
    };
    const onTE = () => {
      lastTouch = Date.now();
      finish();
    };
    const fromTouch = () => Date.now() - lastTouch < 800;
    const onMD = (e: MouseEvent) => {
      if (fromTouch() || e.button !== 0 || !onHandle(e.target)) return;
      e.preventDefault(); // no text selection while dragging with a mouse
      start(e.clientY, idFrom(e.target));
    };
    const onMM = (e: MouseEvent) => {
      if (!fromTouch() && (S.current.info || S.current.pending)) move(e.clientY, e);
    };
    const onMU = () => {
      if (!fromTouch() && (S.current.info || S.current.pending)) finish();
    };

    c.addEventListener('touchstart', onTS, { passive: true });
    c.addEventListener('touchmove', onTM, { passive: false });
    c.addEventListener('touchend', onTE);
    c.addEventListener('touchcancel', onTE);
    c.addEventListener('mousedown', onMD);
    window.addEventListener('mousemove', onMM);
    window.addEventListener('mouseup', onMU);
    return () => {
      clearTimeout(S.current.timer);
      c.removeEventListener('touchstart', onTS);
      c.removeEventListener('touchmove', onTM);
      c.removeEventListener('touchend', onTE);
      c.removeEventListener('touchcancel', onTE);
      c.removeEventListener('mousedown', onMD);
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('mouseup', onMU);
    };
  }, [order, onReorder]);

  return (
    <div ref={containerRef}>
      {order.map((id) => {
        const isDragged = id === dragId;
        const tY = isDragged ? dragDY : shift[id] || 0;
        return (
          <div
            key={id}
            data-rid={id}
            ref={(el) => {
              if (el) wrapRefs.current.set(id, el);
            }}
            style={{
              position: 'relative',
              transform: `translateY(${tY}px)${isDragged ? ' scale(1.02)' : ''}`,
              transition: isDragged ? 'none' : 'transform .2s cubic-bezier(.2,.8,.3,1)',
              zIndex: isDragged ? 6 : 1,
              boxShadow: isDragged ? '0 16px 36px -10px rgba(8,9,14,.4)' : undefined,
              borderRadius: 'calc(20px * var(--sq))',
              opacity: isDragged ? 0.98 : 1,
            }}
          >
            <span
              data-drag-handle
              role="button"
              tabIndex={0}
              aria-label={t('Move')}
              onKeyDown={(e) => {
                const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
                if (!step) return;
                e.preventDefault();
                const i = order.indexOf(id);
                const j = i + step;
                if (j < 0 || j >= order.length) return;
                const next = [...order];
                [next[i], next[j]] = [next[j], next[i]];
                setOrder(next);
                onReorder(next);
              }}
              style={{
                position: 'absolute',
                top: handleTop - 8,
                insetInlineStart: -22,
                width: 30,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'none',
                cursor: isDragged ? 'grabbing' : 'grab',
                color: isDragged ? 'var(--indigo)' : 'var(--text3)',
                opacity: isDragged ? 1 : 0.75,
                zIndex: 2,
              }}
            >
              <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden style={{ fill: 'currentColor' }}>
                <circle cx="2.5" cy="3" r="1.5" />
                <circle cx="7.5" cy="3" r="1.5" />
                <circle cx="2.5" cy="8" r="1.5" />
                <circle cx="7.5" cy="8" r="1.5" />
                <circle cx="2.5" cy="13" r="1.5" />
                <circle cx="7.5" cy="13" r="1.5" />
              </svg>
            </span>
            {byId.get(id)}
          </div>
        );
      })}
    </div>
  );
}
