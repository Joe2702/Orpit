import React, { useEffect, useRef, useState } from 'react';

interface Item {
  id: string;
  node: React.ReactNode;
}

/**
 * A vertical list whose blocks can be reordered by pressing-and-holding, then
 * dragging. A normal tap or scroll passes straight through; only a ~320ms hold
 * (with the finger roughly still) starts a drag. Uses pointer capture so the
 * drag can't be stolen by the page scroll, and handles pointercancel so a scroll
 * gesture never accidentally triggers a reorder.
 */
export function Reorderable({ items, onReorder }: { items: Item[]; onReorder: (ids: string[]) => void }) {
  const idsKey = items.map((i) => i.id).join('|');
  const [order, setOrder] = useState<string[]>(items.map((i) => i.id));
  useEffect(() => setOrder(items.map((i) => i.id)), [idsKey]);

  const byId = new Map(items.map((i) => [i.id, i.node]));
  const wrapRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<{ id: string; startY: number; el: HTMLDivElement; pointerId: number } | null>(null);
  const info = useRef<
    | null
    | {
        id: string;
        startY: number;
        el: HTMLDivElement;
        pointerId: number;
        slots: { id: string; top: number; height: number }[];
        dIdx: number;
        height: number;
        T: number;
      }
  >(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDY, setDragDY] = useState(0);
  const [shift, setShift] = useState<Record<string, number>>({});

  const clearPending = () => {
    clearTimeout(timer.current);
    pending.current = null;
  };

  const activate = () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const slots = order.map((sid) => {
      const r = wrapRefs.current.get(sid)!.getBoundingClientRect();
      return { id: sid, top: r.top, height: r.height };
    });
    const dIdx = order.indexOf(p.id);
    if (dIdx < 0) return;
    try {
      p.el.setPointerCapture(p.pointerId);
    } catch {
      /* ignore */
    }
    info.current = { ...p, slots, dIdx, height: slots[dIdx].height, T: dIdx };
    setDragId(p.id);
    setDragDY(0);
    setShift({});
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(18);
  };

  const doDrag = (clientY: number) => {
    const inf = info.current;
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

  const finish = () => {
    clearTimeout(timer.current);
    const inf = info.current;
    if (inf) {
      try {
        inf.el.releasePointerCapture(inf.pointerId);
      } catch {
        /* ignore */
      }
    }
    info.current = null;
    pending.current = null;
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

  const onDown = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pending.current = { id, startY: e.clientY, el: e.currentTarget as HTMLDivElement, pointerId: e.pointerId };
    clearTimeout(timer.current);
    timer.current = setTimeout(activate, 320);
  };
  const onMove = (e: React.PointerEvent) => {
    if (info.current) {
      doDrag(e.clientY);
      return;
    }
    // Finger moved before the hold completed → it's a scroll, not a drag.
    if (pending.current && Math.abs(e.clientY - pending.current.startY) > 12) clearPending();
  };
  const onUp = () => finish();
  const onCancel = () => finish();

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div style={{ touchAction: dragId ? 'none' : undefined }}>
      {order.map((id) => {
        const isDragged = id === dragId;
        const tY = isDragged ? dragDY : shift[id] || 0;
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) wrapRefs.current.set(id, el);
            }}
            onPointerDown={(e) => onDown(e, id)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onCancel}
            style={{
              position: 'relative',
              transform: `translateY(${tY}px)${isDragged ? ' scale(1.02)' : ''}`,
              transition: isDragged ? 'none' : 'transform .2s cubic-bezier(.2,.8,.3,1)',
              zIndex: isDragged ? 6 : 1,
              boxShadow: isDragged ? '0 16px 36px -10px rgba(8,9,14,.4)' : undefined,
              borderRadius: 20,
              opacity: isDragged ? 0.98 : 1,
              touchAction: isDragged ? 'none' : undefined,
            }}
          >
            {byId.get(id)}
          </div>
        );
      })}
    </div>
  );
}
