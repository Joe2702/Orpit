import React, { useEffect, useRef, useState } from 'react';

interface Item {
  id: string;
  node: React.ReactNode;
}

/**
 * A vertical list whose blocks can be reordered by long-pressing and dragging.
 * Touch-friendly: a normal tap/scroll passes through; only a ~300ms hold starts
 * a drag. On drop it reports the new order via onReorder.
 */
export function Reorderable({ items, onReorder }: { items: Item[]; onReorder: (ids: string[]) => void }) {
  const idsKey = items.map((i) => i.id).join('|');
  const [order, setOrder] = useState<string[]>(items.map((i) => i.id));
  useEffect(() => setOrder(items.map((i) => i.id)), [idsKey]);

  const byId = new Map(items.map((i) => [i.id, i.node]));
  const wrapRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const pending = useRef<{ id: string; startY: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const info = useRef<
    | { id: string; startY: number; slots: { id: string; top: number; height: number }[]; dIdx: number; height: number; T: number }
    | null
  >(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDY, setDragDY] = useState(0);
  const [shift, setShift] = useState<Record<string, number>>({});

  const clearPending = () => {
    clearTimeout(timer.current);
    pending.current = null;
  };

  const doDrag = (clientY: number) => {
    const inf = info.current;
    if (!inf) return;
    const dy = clientY - inf.startY;
    setDragDY(dy);
    const dragged = inf.slots[inf.dIdx];
    const draggedCenter = dragged.top + dragged.height / 2 + dy;
    let T = 0;
    inf.slots.forEach((s, i) => {
      if (i === inf.dIdx) return;
      if (draggedCenter > s.top + s.height / 2) T++;
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

  const onWinMove = (e: PointerEvent) => {
    if (info.current) {
      e.preventDefault();
      doDrag(e.clientY);
    }
  };
  const onWinUp = () => endDrag();

  const endDrag = () => {
    window.removeEventListener('pointermove', onWinMove);
    window.removeEventListener('pointerup', onWinUp);
    window.removeEventListener('pointercancel', onWinUp);
    const inf = info.current;
    info.current = null;
    setDragId(null);
    setDragDY(0);
    setShift({});
    if (!inf) return;
    const others = order.filter((x) => x !== inf.id);
    others.splice(inf.T, 0, inf.id);
    if (others.join('|') !== order.join('|')) {
      setOrder(others);
      onReorder(others);
    }
  };

  const activate = (id: string) => {
    if (!pending.current || pending.current.id !== id) return;
    const startY = pending.current.startY;
    pending.current = null;
    const slots = order.map((sid) => {
      const el = wrapRefs.current.get(sid)!;
      const r = el.getBoundingClientRect();
      return { id: sid, top: r.top, height: r.height };
    });
    const dIdx = order.indexOf(id);
    info.current = { id, startY, slots, dIdx, height: slots[dIdx].height, T: dIdx };
    setDragId(id);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);
    window.addEventListener('pointermove', onWinMove, { passive: false });
    window.addEventListener('pointerup', onWinUp);
    window.addEventListener('pointercancel', onWinUp);
  };

  const onDown = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pending.current = { id, startY: e.clientY };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => activate(id), 300);
  };
  const onItemMove = (e: React.PointerEvent) => {
    // Moved before the hold completed → it's a scroll, not a drag.
    if (!info.current && pending.current && Math.abs(e.clientY - pending.current.startY) > 10) {
      clearPending();
    }
  };
  const onItemUp = () => {
    if (!info.current) clearPending();
  };

  useEffect(() => () => {
    window.removeEventListener('pointermove', onWinMove);
    window.removeEventListener('pointerup', onWinUp);
    window.removeEventListener('pointercancel', onWinUp);
  }, []);

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
            onPointerMove={onItemMove}
            onPointerUp={onItemUp}
            style={{
              position: 'relative',
              transform: `translateY(${tY}px)${isDragged ? ' scale(1.02)' : ''}`,
              transition: isDragged ? 'none' : 'transform .2s cubic-bezier(.2,.8,.3,1)',
              zIndex: isDragged ? 6 : 1,
              borderRadius: 20,
              boxShadow: isDragged ? '0 16px 36px -10px rgba(8,9,14,.4)' : undefined,
              opacity: isDragged ? 0.98 : 1,
              touchAction: dragId ? 'none' : undefined,
            }}
          >
            {byId.get(id)}
          </div>
        );
      })}
    </div>
  );
}
