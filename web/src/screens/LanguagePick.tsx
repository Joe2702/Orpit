import React, { useState } from 'react';
import { OrbitMark } from '../OrbitMark';
import { Space } from '../Space';
import { reducedMotion } from '../Motion';
import { phoneLang, setLangPref } from '../i18n';

/**
 * The very first screen: which language Orbit should speak. Asked before
 * anything else, so everything after it (sign-up, the tour, the app) is
 * already in that language and the right way round. Written in both
 * languages, since we don't know which one the reader has yet. Shown once:
 * the choice is kept, and can be changed later in Profile.
 */
export function LanguagePick() {
  const [chosen, setChosen] = useState<'en' | 'ar' | null>(null);
  const still = reducedMotion();
  const options: { lang: 'en' | 'ar'; name: string; line: string; glyph: string }[] = [
    { lang: 'en', name: 'English', line: 'Continue in English', glyph: 'Aa' },
    { lang: 'ar', name: 'العربية', line: 'تابع بالعربية', glyph: 'أب' },
  ];
  // The phone's own language first.
  if (phoneLang() === 'ar') options.reverse();

  const choose = (l: 'en' | 'ar') => {
    if (chosen) return;
    navigator.vibrate?.(12);
    setChosen(l);
    // A beat to see the choice land, then the app starts again in it.
    window.setTimeout(() => setLangPref(l), still ? 0 : 520);
  };

  const rise = (d: number): React.CSSProperties => (still ? {} : { animation: `fadeUp .7s cubic-bezier(.2,.8,.2,1) ${d}s both` });

  return (
    <div style={{ position: 'absolute', inset: 0, color: '#f2f2f5', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'opacity .45s, transform .45s', opacity: chosen ? 0.0001 : 1, transform: chosen ? 'scale(1.04)' : 'none', transitionDelay: chosen ? '.15s' : '0s' }}>
      <Space horizonTop="58%" animate={!still} />
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'calc(env(safe-area-inset-top) + 24px) 26px 0' }}>
        <div style={still ? undefined : { animation: 'popIn .8s cubic-bezier(.3,1.4,.5,1) both' }}>
          <OrbitMark size={56} spin={!still} />
        </div>
        <div className="display" style={{ fontSize: 38, lineHeight: 1.05, marginTop: 26, ...rise(0.15) }}>
          Choose your language
        </div>
        <div dir="rtl" lang="ar" className="display" style={{ fontSize: 32, lineHeight: 1.25, marginTop: 6, color: 'rgba(242,242,245,.72)', textAlign: 'left', ...rise(0.25) }}>
          اختر لغتك
        </div>
      </div>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12, padding: '0 22px calc(env(safe-area-inset-bottom) + 26px)' }}>
        {options.map((o, k) => {
          const on = chosen === o.lang;
          return (
            <div
              key={o.lang}
              role="button"
              tabIndex={0}
              lang={o.lang}
              dir={o.lang === 'ar' ? 'rtl' : 'ltr'}
              onClick={() => choose(o.lang)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), choose(o.lang))}
              className="press99"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderRadius: 24,
                cursor: 'pointer',
                background: on ? 'color-mix(in srgb, var(--indigo) 22%, rgba(255,255,255,.06))' : 'rgba(255,255,255,.06)',
                border: `1.5px solid ${on ? 'color-mix(in srgb, var(--indigo) 75%, transparent)' : 'rgba(255,255,255,.12)'}`,
                boxShadow: on ? '0 0 34px -8px color-mix(in srgb, var(--indigo) 70%, transparent)' : '0 16px 30px -20px rgba(0,0,0,.8)',
                backdropFilter: 'blur(16px) saturate(160%)',
                WebkitBackdropFilter: 'blur(16px) saturate(160%)',
                transition: 'background .3s, border-color .3s, box-shadow .4s',
                ...rise(0.4 + k * 0.1),
              }}
            >
              <span style={{ width: 48, height: 48, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 700, background: on ? 'var(--indigo)' : 'rgba(255,255,255,.1)', color: on ? 'var(--on-accent)' : '#f2f2f5', transition: 'background .3s, color .3s' }}>
                {o.glyph}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 700 }}>{o.name}</div>
                <div style={{ fontSize: 13.5, color: 'rgba(242,242,245,.6)', marginTop: 2 }}>{o.line}</div>
              </div>
              <span style={{ width: 24, height: 24, flex: 'none', borderRadius: '50%', border: `1.8px solid ${on ? 'var(--indigo)' : 'rgba(255,255,255,.3)'}`, background: on ? 'var(--indigo)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .25s', transform: on ? 'scale(1.1)' : 'none' }}>
                {on && (
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ fill: 'none', stroke: 'var(--on-accent)', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M2.5 6.2l2.3 2.3 4.7-5" />
                  </svg>
                )}
              </span>
            </div>
          );
        })}
        <div style={{ textAlign: 'center', fontSize: 12.5, color: 'rgba(242,242,245,.5)', marginTop: 6, lineHeight: 1.6, ...rise(0.65) }}>
          You can change this later in Profile
          <br />
          <span dir="rtl" lang="ar">يمكنك تغييرها لاحقًا من حسابي</span>
        </div>
      </div>
    </div>
  );
}
