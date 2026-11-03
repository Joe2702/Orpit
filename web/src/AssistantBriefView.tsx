import React, { useState } from 'react';
import type { AssistantBrief } from './types';
import { Card } from './ui';
import { Markdown, plain } from './lib/md';
import { fmtClock } from './lib/format';
import { t } from './i18n';

/** When it came in: "at 9:48 AM", or "yesterday at 9:48 AM". */
export function arrived(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const time = fmtClock(d.getHours() + d.getMinutes() / 60);
  const today = new Date(now).toDateString() === d.toDateString();
  return today ? t('Arrived at {time}', { time }) : t('Arrived yesterday at {time}', { time });
}

/**
 * Claude's brief, as it was written: a section per heading, the first open and
 * the rest one line each until tapped, so six sections fit on a screen.
 */
export function AssistantBriefView({ brief }: { brief: AssistantBrief }) {
  const [openIdx, setOpenIdx] = useState<Set<number>>(() => new Set([0]));
  const toggle = (i: number) =>
    setOpenIdx((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 2px 9px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{t('From Claude')}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', flex: 1, minWidth: 0, textAlign: 'end', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{arrived(brief.ts)}</div>
      </div>
      <Card style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
        {brief.title && brief.title !== 'Morning brief' && (
          <div className="display" style={{ fontSize: 21, lineHeight: 1.2, color: 'var(--text)', padding: '15px 16px 4px' }}>
            {brief.title}
          </div>
        )}
        {brief.sections.map((s, i) => {
          const isOpen = openIdx.has(i);
          return (
            <div key={i} style={{ borderTop: i ? '1px solid var(--hairline)' : 'none' }}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => toggle(i)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(i))}
                className="pressRow"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', cursor: 'pointer' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text)' }}>{s.heading}</div>
                  {!isOpen && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plain(s.body)}</div>}
                </div>
                <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden style={{ flex: 'none', fill: 'none', stroke: 'var(--text3)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', transition: 'transform .3s cubic-bezier(.3,1.3,.5,1)', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                  <path d="M4.5 7l4.5 4.5L13.5 7" />
                </svg>
              </div>
              {/* Opens to its own height: the grid row grows from nothing. */}
              <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: 'grid-template-rows .32s cubic-bezier(.2,.8,.2,1)' }}>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '0 16px 15px', opacity: isOpen ? 1 : 0, transition: 'opacity .25s' }}>
                    <Markdown text={s.body} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </Card>
    </>
  );
}
