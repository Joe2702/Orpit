import React from 'react';
import { t } from './i18n';

/**
 * "For you" on Home: the day's prompts in one compact card you swipe through.
 *
 * The brief, a fresh start, a habit to pick back up, the weekly review and the
 * reminder offer used to be separate cards stacked above Today. On a busy
 * Monday that was four cards, and the habits people open the app to tick sat
 * below the fold. Now they share the height of one short row and Today
 * follows it, however many there are.
 *
 * Every card has the same shape (an icon, a title, a line or two, and one
 * action at the end), so swiping between them reads as one family.
 */
export type Slide = {
  key: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  text?: React.ReactNode;
  /** One line, cut off with an ellipsis (for user text such as brief headings). */
  oneLine?: boolean;
  /** What the card is read out as, when the title alone doesn't say it. */
  label?: string;
  /** Tapping the card opens this. */
  onOpen?: () => void;
  /** A control at the end of the row: a Done button, a close button. */
  end?: React.ReactNode;
  /** A second row, for a card that needs an input (the reminder time). */
  below?: React.ReactNode;
};

export function ForYou({ slides }: { slides: Slide[] }) {
  const track = React.useRef<HTMLDivElement>(null);
  const [at, setAt] = React.useState(0);
  const n = slides.length;
  // A card that goes away (read, done, dismissed) mustn't leave the dot past the end.
  const active = Math.min(at, Math.max(0, n - 1));
  if (!n) return null;

  const onScroll = () => {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    // scrollLeft runs negative in a right-to-left layout.
    setAt(Math.round(Math.abs(el.scrollLeft) / (first.offsetWidth + 8)));
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div ref={track} className="foryou-track" data-single={n === 1 ? '' : undefined} onScroll={onScroll} role="region" aria-label={t('For you')}>
        {slides.map((s) => {
          // With a control at the end, only the text part opens the card, so
          // the two buttons sit side by side rather than one inside the other.
          const whole = s.onOpen && !s.end;
          const body = (
            <>
              <span aria-hidden className="foryou-icon">
                {s.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="foryou-title">{s.title}</div>
                {s.text != null && (
                  <div className={s.oneLine ? 'foryou-text one' : 'foryou-text'} dir={s.oneLine ? 'auto' : undefined}>
                    {s.text}
                  </div>
                )}
              </div>
              {s.onOpen && (
                <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden style={{ flex: 'none', fill: 'none', stroke: 'var(--text3)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path className="flip-rtl" d="M7 4l5 5-5 5" />
                </svg>
              )}
            </>
          );
          return (
            <div
              key={s.key}
              className={whole ? 'foryou-slide press99' : 'foryou-slide'}
              role={whole ? 'button' : 'group'}
              tabIndex={whole ? 0 : undefined}
              onClick={whole ? s.onOpen : undefined}
              aria-label={whole ? s.label : undefined}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {whole || !s.onOpen ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>{body}</div>
                ) : (
                  <div role="button" tabIndex={0} onClick={s.onOpen} aria-label={s.label} className="press99" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, minHeight: 44, cursor: 'pointer' }}>
                    {body}
                  </div>
                )}
                {s.end}
              </div>
              {s.below && <div style={{ marginTop: 12 }}>{s.below}</div>}
            </div>
          );
        })}
      </div>
      {n > 1 && (
        <div className="foryou-dots" aria-hidden>
          {slides.map((s, i) => (
            <span key={s.key} data-on={i === active ? '' : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The close button at the end of a card. */
export function SlideDismiss({ onClick }: { onClick: () => void }) {
  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={t('Dismiss')}
      onClick={onClick}
      className="press92 hit"
      style={{ width: 28, height: 28, flex: 'none', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 99, color: 'var(--text3)', cursor: 'pointer', marginInlineEnd: -4 }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }}>
        <path d="M3 3l8 8M11 3l-8 8" />
      </svg>
    </div>
  );
}

/** The filled accent button at the end of a card, for an action done right here. */
export function SlideButton({ children, onClick, label, busy }: { children: React.ReactNode; onClick: () => void; label?: string; busy?: boolean }) {
  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={label}
      onClick={() => !busy && onClick()}
      className="press92 hit"
      style={{ height: 40, padding: '0 16px', borderRadius: 999, background: 'var(--indigo)', color: 'var(--on-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, flex: 'none', whiteSpace: 'nowrap' }}
    >
      {children}
    </div>
  );
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Line icons for the cards. */
export const SlideIcon = {
  brief: (
    <svg width="20" height="20" viewBox="0 0 22 22" style={stroke}>
      <path d="M3 15.5h16M6 15.5a5 5 0 0 1 10 0M11 4.5v2.2M4.6 8.1l1.5 1.5M17.4 8.1l-1.5 1.5M7 18.5h8" />
    </svg>
  ),
  fresh: (
    <svg width="20" height="20" viewBox="0 0 22 22" style={stroke}>
      <rect x="3.5" y="5" width="15" height="13.5" rx="3" />
      <path d="M3.5 9.5h15M7.5 3v4M14.5 3v4" />
    </svg>
  ),
  habit: (
    <svg width="20" height="20" viewBox="0 0 22 22" style={stroke}>
      <circle cx="11" cy="11" r="8" />
      <path d="M7.5 11l2.3 2.3L15 8" />
    </svg>
  ),
  review: (
    <svg width="20" height="20" viewBox="0 0 22 22" style={stroke}>
      <path d="M4 18V11M9 18V6M14 18v-5M19 18V9" />
    </svg>
  ),
  bell: (
    <svg width="20" height="20" viewBox="0 0 22 22" style={stroke}>
      <path d="M6 15V10a5 5 0 0 1 10 0v5l1.5 2h-13zM9 19.5h4" />
    </svg>
  ),
  aim: (
    <svg width="20" height="20" viewBox="0 0 22 22" style={stroke}>
      <circle cx="11" cy="11" r="8" />
      <circle cx="11" cy="11" r="4" />
      <circle cx="11" cy="11" r="0.6" />
    </svg>
  ),
};
