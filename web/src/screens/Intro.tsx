import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { smsSupported } from '../lib/smsSync';
import { RisingWords, reducedMotion } from '../Motion';
import { CounterVisual, DragVisual, HabitsVisual, HelloVisual, InsightsVisual, MoneyVisual, PlusVisual, TRACKERS, YoursVisual } from './IntroScenes';
import { Space } from '../Space';
import { isRTL, t } from '../i18n';
import './intro.css';

/**
 * The first-run tour: what Orbit is, and the handful of things worth knowing
 * on day one, each shown by a small live demonstration that you can then try
 * yourself. Skippable from any scene, swipeable, and it asks for nothing: no
 * permission prompt appears until someone taps a feature that needs one.
 */

type SceneKey = 'hello' | 'plus' | 'habits' | 'drag' | 'counters' | 'money' | 'insights' | 'yours';
const ORDER: SceneKey[] = ['hello', 'plus', 'habits', 'drag', 'counters', 'money', 'insights', 'yours'];
// Where the nebula drifts for each scene: the light moves, the colour doesn't.
const DRIFT = [-60, 40, -30, 60, -40, 30, -10, 0];

export function Intro() {
  const { state, applyState, haptic } = useStore();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [prev, setPrev] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [drag, setDrag] = useState(0);
  const [picked, setPicked] = useState<string[]>(() => {
    const m = state?.profile.modules;
    return m && m.length ? TRACKERS.map((x) => x.key).filter((k) => m.includes(k)) : TRACKERS.map((x) => x.key);
  });
  const still = reducedMotion();
  const rtl = isRTL();
  const key = ORDER[i];
  const last = i === ORDER.length - 1;
  const firstName = (state?.profile.name || '').trim().split(/\s+/)[0] || '';

  const goTo = (n: number) => {
    if (n < 0 || n >= ORDER.length || n === i) return;
    haptic(8);
    const d = n > i ? 1 : -1;
    setPrev({ i, dir: d });
    setDir(d);
    setI(n);
  };
  useEffect(() => {
    if (!prev) return;
    const id = window.setTimeout(() => setPrev(null), 460);
    return () => clearTimeout(id);
  }, [prev]);

  const finish = (save: boolean) => {
    if (leaving || !state) return;
    haptic(14);
    setLeaving(true);
    // All six is the default (null), so only a narrower choice is saved.
    const modules = save && picked.length < TRACKERS.length ? picked : undefined;
    window.setTimeout(
      () => {
        applyState({ ...state, profile: { ...state.profile, introDone: true, ...(modules ? { modules } : {}) } });
        api.updateMe({ introDone: true, ...(modules ? { modules } : {}) }).catch(() => {});
      },
      still ? 0 : 560
    );
  };
  const next = () => (last ? finish(true) : goTo(i + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
      else if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) goTo(i + 1);
      else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) goTo(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Swiping between scenes. Anything marked data-interactive (a handle to
  // drag, a habit to tick) keeps its own gestures.
  const g = useRef<{ x: number; y: number; id: number; h: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-interactive], [role="button"], button')) return;
    g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, h: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    if (!s.h && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(e.clientY - s.y)) s.h = true;
    if (s.h) setDrag(dx);
  };
  const onUp = (e: React.PointerEvent) => {
    const s = g.current;
    g.current = null;
    if (!s || !s.h) return;
    const dx = e.clientX - s.x;
    setDrag(0);
    const forward = rtl ? dx > 60 : dx < -60;
    const back = rtl ? dx < -60 : dx > 60;
    if (forward) next();
    else if (back) goTo(i - 1);
  };

  // The visual is drawn for a 320 by 340 stage and scaled down on short screens.
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientHeight / 340, el.clientWidth / 320)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const copy: Record<SceneKey, { title: string; body: string }> = {
    hello: {
      title: firstName ? t('Hi {name}, welcome to Orbit', { name: firstName }) : t('Welcome to Orbit'),
      body: t('Your habits, training, sleep and money in one place, so you can see how each one moves the others.'),
    },
    plus: { title: t('Log anything with +'), body: t('Tap + at the bottom for a workout, a night’s sleep, a payment, a task or a habit. A couple of taps and it’s saved.') },
    habits: { title: t('Tick it off'), body: t('Tap a habit when it’s done. Say when and where you’ll do each one, and you’re far more likely to.') },
    drag: { title: t('Put what matters first'), body: t('Every card has a ⋮⋮ handle beside it. Drag it to reorder Home, Analytics, your habits and your to-do lists.') },
    counters: { title: t('Count anything'), body: t('Counters keep a running tally of whatever you choose, with a daily goal if you want one. One tap adds one.') },
    money: {
      title: t('Money, sorted'),
      body: smsSupported()
        ? t('Orbit can read your bank’s payment alerts and log spending by itself, leaving out declined payments. Turn it on in Finances when you’re ready. The messages never leave your phone.')
        : t('Log a payment in seconds. Budgets and what’s safe to spend today keep up by themselves.'),
    },
    insights: { title: t('Watch it add up'), body: t('Trends in Analytics, a story of every week, month and year, and a one-minute brief each morning.') },
    yours: { title: t('Make it yours'), body: t('Pick what you want to track. You can change it any time in Profile.') },
  };

  const visual = (k: SceneKey) =>
    k === 'hello' ? <HelloVisual /> : k === 'plus' ? <PlusVisual /> : k === 'habits' ? <HabitsVisual /> : k === 'drag' ? <DragVisual /> : k === 'counters' ? <CounterVisual /> : k === 'money' ? <MoneyVisual /> : k === 'insights' ? <InsightsVisual /> : (
      <YoursVisual picked={picked} onToggle={(m) => setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]))} />
    );
  const inAnim = (d: 1 | -1) => (still ? undefined : `${d === 1 ? 'sceneInNext' : 'sceneInPrev'} .55s cubic-bezier(.2,.8,.2,1) both`);
  const outAnim = (d: 1 | -1) => `${d === 1 ? 'sceneOutNext' : 'sceneOutPrev'} .42s cubic-bezier(.4,0,1,1) both`;
  // In right-to-left the story moves the other way.
  const flip = (d: 1 | -1) => (rtl ? (-d as 1 | -1) : d);

  return (
    <div
      className="intro-root"
      role="dialog"
      aria-modal
      aria-label={t('Welcome to Orbit')}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 110,
        overflow: 'hidden',
        background: '#07070a',
        color: 'var(--ink)',
        display: 'flex',
        flexDirection: 'column',
        touchAction: 'pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        animation: leaving ? 'introOut .55s cubic-bezier(.4,0,1,1) both' : still ? undefined : 'introIn .6s cubic-bezier(.2,.8,.2,1) both',
      }}
    >
      <Space shift={(rtl ? -1 : 1) * i + drag * -0.006} drift={(rtl ? -1 : 1) * DRIFT[i]} horizonTop="64%" animate={!still} />

      {/* Progress, and the way out. */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, padding: 'calc(env(safe-area-inset-top) + 16px) 16px 0' }}>
        <div style={{ flex: 1, display: 'flex', gap: 4 }}>
          {ORDER.map((_, n) => (
            <div key={n} role="button" tabIndex={-1} aria-label={t('Step {n}', { n: n + 1 })} onClick={() => goTo(n)} style={{ flex: 1, height: 3.5, borderRadius: 9, background: 'rgba(255,255,255,.16)', overflow: 'hidden', cursor: 'pointer' }}>
              <div style={{ height: '100%', borderRadius: 9, background: '#fff', width: n <= i ? '100%' : '0%', transition: 'width .5s cubic-bezier(.3,1.2,.5,1)', boxShadow: n === i ? '0 0 8px rgba(255,255,255,.8)' : 'none' }} />
            </div>
          ))}
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => finish(false)}
          onKeyDown={(e) => e.key === 'Enter' && finish(false)}
          style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink2)', padding: '8px 4px', cursor: 'pointer', opacity: last ? 0 : 1, pointerEvents: last ? 'none' : 'auto', transition: 'opacity .3s' }}
        >
          {t('Skip')}
        </div>
      </div>

      {/* The demonstration. */}
      <div ref={stage} style={{ position: 'relative', flex: 1, minHeight: 0, margin: '8px 0 0' }}>
        {prev && (
          <div key={`out${prev.i}`} aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: outAnim(flip(prev.dir)), pointerEvents: 'none' }}>
            <div style={{ transform: `scale(${scale})` }}>{visual(ORDER[prev.i])}</div>
          </div>
        )}
        <div
          key={`in${i}`}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: inAnim(flip(dir)), transform: drag ? `translateX(${drag * 0.35}px)` : undefined, transition: drag ? 'none' : 'transform .4s cubic-bezier(.3,1.3,.5,1)' }}
        >
          <div style={{ transform: `scale(${scale})` }}>{visual(key)}</div>
        </div>
      </div>

      {/* What it means. */}
      <div key={`t${i}`} style={{ position: 'relative', padding: '0 28px', minHeight: 150 }}>
        <div className="display" style={{ fontSize: 40, lineHeight: 1.05, color: 'var(--ink)', textWrap: 'balance' } as React.CSSProperties}>
          <RisingWords text={copy[key].title} delay={0.08} step={0.07} />
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink2)', marginTop: 12, maxWidth: 380, animation: still ? undefined : 'rise .6s cubic-bezier(.2,.8,.2,1) .3s both' }}>{copy[key].body}</div>
      </div>

      {/* Back, and on. */}
      <div style={{ position: 'relative', display: 'flex', gap: 8, padding: '16px 24px calc(env(safe-area-inset-bottom) + 20px)' }}>
        <div
          role="button"
          tabIndex={i ? 0 : -1}
          aria-label={t('Back')}
          aria-hidden={!i}
          onClick={() => goTo(i - 1)}
          className="press92"
          style={{ width: 56, height: 56, flex: 'none', borderRadius: '50%', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: i ? 1 : 0, transform: i ? 'scale(1)' : 'scale(.6)', pointerEvents: i ? 'auto' : 'none', transition: 'opacity .3s, transform .4s cubic-bezier(.3,1.5,.5,1)' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="flip-rtl" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M11 4L6 9l5 5" />
          </svg>
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={next}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), next())}
          className="press"
          style={{ position: 'relative', overflow: 'hidden', flex: 1, height: 56, borderRadius: 999, background: '#f2f2f5', color: '#0c0c0f', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 14px 34px -12px color-mix(in srgb, var(--indigo) 70%, transparent)' }}
        >
          <span key={`b${last ? 'l' : i === 0 ? 'f' : 'n'}`} style={{ animation: still ? undefined : 'rise .35s ease both' }}>
            {last ? t('Start using Orbit') : i === 0 ? t('Show me around') : t('Next')}
          </span>
          {/* The flip sits on a wrapper: the nudge animation would override it on the arrow itself. */}
          <span className="flip-rtl" style={{ display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden style={{ fill: 'none', stroke: '#0c0c0f', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round', animation: still ? undefined : 'nudge 1.6s ease-in-out infinite' }}>
              <path d="M4 9h10M10 5l4 4-4 4" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
