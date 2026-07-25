import React, { useEffect, useRef, useState } from 'react';

interface Item {
  id: string;
  node: React.ReactNode;
}

/**
 * Press-and-hold a block (~300ms, finger still), then drag to reorder.
 *
 * Uses NON-passive native touch listeners so we can call preventDefault() once a
 * drag begins — that's what actually stops the page from scrolling and stealing
 * the gesture (React's synthetic listeners are passive and can't do this, which
 * is why an earlier pointer-event version failed). A quick tap or a scroll swipe
 * passes straight through untouched.
 */
export function Reorderable({ items, onReorder }: { items: Item[]; onReorder: (ids: string[]) => void }) {
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

    const start = (clientY: number, id: string | null) => {
      if (!id) return;
      S.current.pending = { id, startY: clientY };
      clearTimeout(S.current.timer);
      S.current.timer = setTimeout(activate, 300);
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

    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const onTS = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) start(t.clientY, idFrom(e.target));
    };
    const onTM = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) move(t.clientY, e);
    };
    const onMD = (e: MouseEvent) => start(e.clientY, idFrom(e.target));
    const onMM = (e: MouseEvent) => {
      if (S.current.info || S.current.pending) move(e.clientY, e);
    };

    if (hasTouch) {
      c.addEventListener('touchstart', onTS, { passive: true });
      c.addEventListener('touchmove', onTM, { passive: false });
      c.addEventListener('touchend', finish);
      c.addEventListener('touchcancel', finish);
    } else {
      c.addEventListener('mousedown', onMD);
      window.addEventListener('mousemove', onMM);
      window.addEventListener('mouseup', finish);
    }
    return () => {
      clearTimeout(S.current.timer);
      c.removeEventListener('touchstart', onTS);
      c.removeEventListener('touchmove', onTM);
      c.removeEventListener('touchend', finish);
      c.removeEventListener('touchcancel', finish);
      c.removeEventListener('mousedown', onMD);
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('mouseup', finish);
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
              borderRadius: 20,
              opacity: isDragged ? 0.98 : 1,
            }}
          >
            {byId.get(id)}
          </div>
        );
      })}
    </div>
  );
}
