import React, { useState, useEffect, useRef, useCallback } from 'react';
import { track } from '../lib/usage';
import { useStore } from '../store';
import { buildReport } from '../lib/report';
import { Glyph, type GlyphName } from '../lib/appIcons';
import { BigValue, DrawRing, RisingWords, reducedMotion } from '../Motion';
import { t } from '../i18n';

// How long each slide stays before moving on by itself. Holding a finger
// down pauses it, the way stories do.
const SLIDE_MS = 6000;
const CLOSE_AT = 120; // px pulled down that counts as "close"

/**
 * A full-screen story of a week, month or year: tap the right side for the
 * next slide and the left for the one before, hold to pause, pull down to
 * close. Each slide's number rolls into place and its words rise in.
 */
export function StoryReport({ kind, offset = 0, onClose }: { kind: 'week' | 'month' | 'year'; offset?: number; onClose: () => void }) {
  const { state, haptic } = useStore();
  const [slides] = useState(() => buildReport(state!, kind, offset));
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [held, setHeld] = useState(false);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const still = reducedMotion();
  useEffect(() => track('report_view'), []);
  const slide = slides[i];

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    haptic(8);
    setTimeout(onClose, still ? 0 : 260);
  }, [closing, haptic, onClose, still]);
  const next = useCallback(() => {
    if (i < slides.length - 1) {
      setDir(1);
      setI(i + 1);
    } else close();
  }, [i, slides.length, close]);
  const prev = useCallback(() => {
    setDir(-1);
    setI(Math.max(0, i - 1));
  }, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') (document.dir === 'rtl' ? prev : next)();
      else if (e.key === 'ArrowLeft') (document.dir === 'rtl' ? next : prev)();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, close]);

  // ---- Touch: tap, hold, swipe across, pull down ----
  const g = useRef<{ x: number; y: number; t: number; lastY: number; lastT: number; mode: '' | 'down' | 'side'; id: number } | null>(null);
  const swallowClick = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    g.current = { x: e.clientX, y: e.clientY, t: performance.now(), lastY: e.clientY, lastT: performance.now(), mode: '', id: e.pointerId };
    swallowClick.current = false;
    setHeld(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const ddy = e.clientY - s.y;
    if (!s.mode) {
      if (ddy > 10 && ddy > Math.abs(dx) * 1.2) {
        s.mode = 'down';
        setDragging(true);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(ddy)) s.mode = 'side';
    }
    if (s.mode === 'down') {
      // A little resistance, so it feels attached to the finger, not loose.
      setDy(Math.max(0, ddy * 0.92));
      s.lastY = e.clientY;
      s.lastT = performance.now();
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const s = g.current;
    g.current = null;
    setHeld(false);
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const ddy = e.clientY - s.y;
    const long = performance.now() - s.t > 380;
    if (s.mode === 'down') {
      swallowClick.current = true;
      setDragging(false);
      const v = (e.clientY - s.lastY) / Math.max(1, performance.now() - s.lastT); // px per ms
      if (ddy > CLOSE_AT || v > 0.55) close();
      else setDy(0);
    } else if (s.mode === 'side') {
      swallowClick.current = true;
      const forward = document.dir === 'rtl' ? dx > 0 : dx < 0;
      if (Math.abs(dx) > 50) (forward ? next : prev)();
    } else if (long) {
      // A hold was a pause, not a tap.
      swallowClick.current = true;
    }
  };
  const tap = (fn: () => void) => () => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    fn();
  };

  // Share the report as a short text card: the native sheet on the app, the
  // Web Share API (or clipboard) on the web.
  const share = async () => {
    const title = kind === 'week' ? t('My week on Orbit') : kind === 'year' ? t('My year on Orbit') : t('My month on Orbit');
    const lines = slides.filter((s) => s.value).map((s) => `${s.headline}: ${s.value}`);
    const text = `${title}\n\n${lines.join('\n')}`;
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, dialogTitle: title });
    } catch {
      try {
        if (navigator.share) await navigator.share({ title, text });
        else await navigator.clipboard.writeText(text);
      } catch {
        /* user dismissed the sheet */
      }
    }
  };

  const pull = Math.min(dy, 500);
  const color = `var(--${slide.color})`;
  const isEnd = slide.key === 'intro' || slide.key === 'outro';
  const paused = held || dragging || closing;

  return (
    <>
      {/* What shows behind the story while it's pulled down: the app, dimmed. */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 119, background: 'rgba(0,0,0,.55)', opacity: closing ? 0 : 1 - pull / 420, transition: dragging ? 'none' : 'opacity .3s' }} />
      <div
        role="dialog"
        aria-modal
        aria-label={slide.headline}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 120,
          overflow: 'hidden',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          // One dark, quiet backdrop for every slide; only a soft glow takes
          // the slide's colour, so a year in review doesn't look like a slot machine.
          background: '#0c0c0f',
          color: '#f0f0f3',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          borderRadius: closing ? 36 : Math.min(pull / 3, 36),
          transform: closing ? `translateY(${Math.max(pull, 80) + window.innerHeight * 0.9}px) scale(.85)` : `translateY(${pull}px) scale(${1 - pull / 1800})`,
          opacity: closing ? 0 : 1,
          transition: dragging ? 'none' : closing ? 'transform .3s cubic-bezier(.4,0,1,1), opacity .3s, border-radius .3s' : 'transform .45s cubic-bezier(.2,1.25,.4,1), border-radius .45s',
          // 'backwards': once open, the animation lets go, so the pull can move it.
          animation: still ? undefined : 'storyOpen .42s cubic-bezier(.2,.9,.3,1) backwards',
        }}
      >
        {/* Two slow glows in the slide's colour, drifting. The colour eases
            from slide to slide rather than jumping. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', color, transition: 'color .9s ease' }}>
          <div style={{ position: 'absolute', width: '120vw', height: '120vw', maxWidth: 620, maxHeight: 620, left: '50%', top: '38%', marginLeft: 'min(-60vw, -310px)', marginTop: 'min(-60vw, -310px)', borderRadius: '50%', background: 'radial-gradient(circle, currentColor 0%, transparent 62%)', opacity: 0.26, animation: 'storyGlowA 11s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', width: '90vw', height: '90vw', maxWidth: 460, maxHeight: 460, left: '50%', top: '62%', marginLeft: 'min(-45vw, -230px)', marginTop: 'min(-45vw, -230px)', borderRadius: '50%', background: 'radial-gradient(circle, currentColor 0%, transparent 60%)', opacity: 0.14, animation: 'storyGlowB 14s ease-in-out infinite' }} />
        </div>

        {/* Tap zones: the first third goes back, the rest goes on. */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 2 }}>
          <div role="button" tabIndex={0} aria-label={t('Previous')} onClick={tap(prev)} style={{ width: '33%', cursor: 'pointer' }} />
          <div role="button" tabIndex={0} aria-label={t('Next')} onClick={tap(next)} style={{ flex: 1, cursor: 'pointer' }} />
        </div>

        {/* Progress, and share (above the tap zones). */}
        <div style={{ position: 'relative', zIndex: 3, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', gap: 5, padding: '14px 16px 0' }}>
            {slides.map((_, idx) => (
              <div key={idx} style={{ flex: 1, height: 3, borderRadius: 999, background: 'rgba(255,255,255,.2)', overflow: 'hidden' }}>
                {idx < i || (idx === i && still) ? (
                  <div style={{ height: '100%', background: '#f0f0f3' }} />
                ) : idx === i ? (
                  <div
                    key={i}
                    onAnimationEnd={() => i < slides.length - 1 && next()}
                    style={{
                      height: '100%',
                      background: '#f0f0f3',
                      transformOrigin: document.dir === 'rtl' ? 'right' : 'left',
                      animation: `storyBar ${SLIDE_MS}ms linear both`,
                      animationPlayState: paused ? 'paused' : 'running',
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, padding: '8px 14px 0', opacity: paused ? 0.4 : 1, transition: 'opacity .25s' }}>
            <div data-no-drag tabIndex={0} onClick={share} className="press92" role="button" aria-label={t('Share this report')} style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', pointerEvents: 'auto' }}>
              <svg width="20" height="20" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
                <path d="M10 13V3M6.5 6.5L10 3l3.5 3.5M4 12v4.5h12V12" />
              </svg>
            </div>
            {/* No visible close: pull down, or Back. This one is for keyboards and screen readers. */}
            <button
              data-no-drag
              onClick={close}
              aria-label={t('Close report')}
              style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', border: 0, pointerEvents: 'auto' }}
            />
          </div>
        </div>

        {/* The slide (behind the tap zones, so all of it is tappable). */}
        <div
          key={i}
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '0 30px 56px',
            animation: still ? undefined : `${dir > 0 ? 'storyNext' : 'storyPrev'} .5s cubic-bezier(.2,.8,.2,1) backwards`,
            opacity: 1 - pull / 700,
          }}
        >
          {isEnd ? <Orbiting color={color} icon={slide.icon} burst={slide.key === 'outro'} /> : (
            <span style={{ animation: 'storyPop .7s cubic-bezier(.3,1.5,.5,1) .05s both' }}>
              <DrawRing size={66} color={color} delay={0.1}>
                <Glyph name={slide.icon} size={26} color="#f0f0f3" sw={1.7} />
              </DrawRing>
            </span>
          )}
          <div style={{ fontSize: 15.5, fontWeight: 600, color: 'rgba(240,240,243,.72)', marginTop: 18, animation: 'storyRise .55s cubic-bezier(.2,.8,.2,1) .18s both' }}>
            {isEnd ? (
              <span className="display" style={{ display: 'block', fontSize: 40, lineHeight: 1.08, color: '#f0f0f3', fontWeight: 400 }}>
                <RisingWords text={slide.headline} delay={0.2} step={0.09} />
              </span>
            ) : (
              slide.headline
            )}
          </div>
          {slide.value && (
            <>
              <div className="display" style={{ fontSize: slide.value.length > 9 ? 56 : 86, lineHeight: 1, margin: '14px 0 4px', overflowWrap: 'anywhere', textShadow: '0 0 40px rgba(255,255,255,.12)' }}>
                <BigValue text={slide.value} delay={0.3} />
              </div>
              <div aria-hidden style={{ width: 54, height: 3, borderRadius: 9, background: color, margin: '14px auto 14px', transformOrigin: 'center', animation: 'storyUnderline .7s cubic-bezier(.2,.8,.2,1) .7s both' }} />
            </>
          )}
          <div style={{ fontSize: 16, color: 'rgba(240,240,243,.82)', lineHeight: 1.5, marginTop: slide.value ? 0 : 14, maxWidth: 300, animation: `storyRise .6s cubic-bezier(.2,.8,.2,1) ${slide.value ? 0.85 : 0.5}s both` }}>{slide.caption}</div>
        </div>

        {/* On the first slide, how to get out. */}
        {i === 0 && (
          <div aria-hidden style={{ position: 'absolute', insetInline: 0, bottom: 'calc(env(safe-area-inset-bottom) + 22px)', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, color: 'rgba(240,240,243,.6)', animation: 'storyRise .6s ease 1.2s backwards', opacity: 1 - pull / 120 }}>
            <svg width="18" height="12" viewBox="0 0 18 12" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', animation: 'storyHint 1.6s ease-in-out infinite' }}>
              <path d="M3 3l6 6 6-6" />
            </svg>
            {t('Pull down to close')}
          </div>
        )}
      </div>
    </>
  );
}

/** The first and last slides: the icon with two orbits going round it. */
function Orbiting({ color, icon, burst }: { color: string; icon: GlyphName; burst: boolean }) {
  return (
    <div style={{ position: 'relative', width: 128, height: 128, animation: 'storyPop .8s cubic-bezier(.3,1.4,.5,1) both' }}>
      {[
        { s: 128, d: '9s', o: 0.22, dot: 7 },
        { s: 92, d: '6s', o: 0.35, dot: 6 },
      ].map((r, k) => (
        <div key={k} style={{ position: 'absolute', left: (128 - r.s) / 2, top: (128 - r.s) / 2, width: r.s, height: r.s, borderRadius: '50%', border: `1.5px solid rgba(255,255,255,${r.o})`, animation: `storyOrbit ${r.d} linear infinite ${k ? 'reverse' : ''}` }}>
          <span style={{ position: 'absolute', top: -r.dot / 2, left: '50%', marginLeft: -r.dot / 2, width: r.dot, height: r.dot, borderRadius: '50%', background: k ? '#f0f0f3' : color, boxShadow: `0 0 12px ${k ? 'rgba(255,255,255,.6)' : color}` }} />
        </div>
      ))}
      <div style={{ position: 'absolute', inset: 40, borderRadius: '50%', background: 'rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Glyph name={icon} size={24} color="#f0f0f3" sw={1.7} />
      </div>
      {/* The last slide ends with a small burst of light. */}
      {burst &&
        Array.from({ length: 14 }, (_, k) => {
          const a = (k / 14) * Math.PI * 2;
          const dist = 90 + (k % 3) * 24;
          return (
            <span
              key={k}
              aria-hidden
              style={
                {
                  position: 'absolute',
                  left: 62,
                  top: 62,
                  width: k % 2 ? 4 : 6,
                  height: k % 2 ? 4 : 6,
                  borderRadius: '50%',
                  background: k % 3 ? '#f0f0f3' : color,
                  ['--bx']: `${Math.cos(a) * dist}px`,
                  ['--by']: `${Math.sin(a) * dist}px`,
                  animation: `storyBurst 1.4s cubic-bezier(.1,.8,.3,1) ${0.35 + (k % 4) * 0.05}s both`,
                } as React.CSSProperties
              }
            />
          );
        })}
    </div>
  );
}
