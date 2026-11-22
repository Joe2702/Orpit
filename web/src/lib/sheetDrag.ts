import { useEffect } from 'react';

/**
 * Pull a bottom sheet down to close it, the way sheets close on a phone.
 *
 * The sheet follows the finger and the dimmed page behind it brightens as it
 * goes. Let go past a third of its height, or with a quick flick down, and it
 * slides away; otherwise it settles back.
 *
 * A pull starts from the handle at the top at any time, and from anywhere in
 * the sheet when its content is already scrolled to the top, so scrolling the
 * content back up never closes it by accident. A touch on something that
 * drags by itself (the sleep dial, a reorder handle, a slider: anything with
 * `touch-action: none`, or marked `data-own-swipe`) is left to that.
 */
export function useSheetDrag(
  panel: React.RefObject<HTMLElement | null>,
  body: React.RefObject<HTMLElement | null>,
  backdrop: React.RefObject<HTMLElement | null>,
  close: () => void,
  on: boolean
) {
  useEffect(() => {
    const el = panel.current;
    if (!on || !el) return;
    let start: { y: number; t: number; fromHandle: boolean } | null = null;
    let dragging = false;
    let dy = 0;
    let last = { y: 0, t: 0 };
    let speed = 0;

    const ownDrag = (from: EventTarget | null) => {
      for (let n = from as Element | null; n && n !== el; n = n.parentElement) {
        if (n instanceof HTMLElement && n.dataset.ownSwipe !== undefined) return true;
        if (n.matches('input[type=range], textarea, [contenteditable=true]')) return true;
        if (getComputedStyle(n).touchAction === 'none') return true;
      }
      return false;
    };
    const set = (y: number, animate: boolean) => {
      el.style.transition = animate ? 'transform .26s cubic-bezier(.22,1,.36,1)' : 'none';
      el.style.transform = y ? `translateY(${y}px)` : '';
      const b = backdrop.current;
      if (b) {
        b.style.transition = animate ? 'opacity .26s ease' : 'none';
        b.style.opacity = String(Math.max(0, 1 - y / Math.max(1, el.offsetHeight)));
      }
    };

    const down = (e: TouchEvent) => {
      if (e.touches.length !== 1 || ownDrag(e.target)) {
        start = null;
        return;
      }
      const handle = el.querySelector('[data-sheet-handle]');
      const fromHandle = !!handle && handle.contains(e.target as Node);
      const atTop = (body.current?.scrollTop ?? 0) <= 0;
      start = fromHandle || atTop ? { y: e.touches[0].clientY, t: e.timeStamp, fromHandle } : null;
      dragging = false;
      dy = 0;
      last = { y: e.touches[0].clientY, t: e.timeStamp };
      speed = 0;
    };
    const move = (e: TouchEvent) => {
      if (!start) return;
      const y = e.touches[0].clientY;
      const d = y - start.y;
      if (!dragging) {
        // Only a pull down starts it; moving up is scrolling the content.
        if (d < 8) {
          if (d < -8) start = null;
          return;
        }
        dragging = true;
      }
      e.preventDefault();
      dy = Math.max(0, d);
      const dt = Math.max(1, e.timeStamp - last.t);
      speed = (y - last.y) / dt; // px per ms, down is positive
      last = { y, t: e.timeStamp };
      set(dy, false);
    };
    const up = () => {
      if (!start) return;
      start = null;
      if (!dragging) return;
      dragging = false;
      const h = el.offsetHeight;
      if (dy > h / 3 || (speed > 0.5 && dy > 24)) {
        set(h + 40, true);
        window.setTimeout(close, 220);
      } else {
        set(0, true);
      }
    };

    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
    return () => {
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', up);
      el.removeEventListener('touchcancel', up);
    };
  }, [on, close]); // eslint-disable-line react-hooks/exhaustive-deps
}
