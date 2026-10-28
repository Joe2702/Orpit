import React, { useState } from 'react';
import { useStore } from '../store';
import { Ring } from '../lib/charts';
import { BackButton } from '../ui';
import { computeBadges, type Badge } from '../lib/badges';
import { Glyph } from '../lib/appIcons';

export function Achievements() {
  const { state, go, claimedBadges, claimBadge, haptic } = useStore();
  const [justClaimed, setJustClaimed] = useState<string | null>(null);
  const claimed = new Set(claimedBadges);

  const badges = computeBadges(state!);
  const unlocked = badges.filter((b) => b.unlocked);
  const total = badges.length;
  const pct = Math.round((unlocked.length / total) * 100);
  const claimable = unlocked.filter((b) => !claimed.has(b.id));

  const onClaim = (id: string) => {
    haptic();
    claimBadge(id);
    setJustClaimed(id);
  };

  // Locked badges closest to being earned — a little nudge.
  const almost = badges
    .filter((b) => !b.unlocked && b.value > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <BackButton onClick={() => go('home')} />
      <div className="display" style={{ fontSize: 40, lineHeight: 1.05, color: 'var(--text)', margin: '4px 0 18px' }}>
        Achievements
      </div>

      {/* Summary */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ position: 'relative', width: 104, height: 104, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ring pct={pct} colorKey="indigo" size={104} stroke={12} />
          <div style={{ position: 'absolute', textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.02em' }}>
              {unlocked.length}<span style={{ fontSize: 15, color: 'var(--text2)' }}>/{total}</span>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text2)', marginTop: -1 }}>badges</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
            {unlocked.length === 0 ? 'Start earning badges' : unlocked.length === total ? 'You collected them all' : 'Keep it going'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
            {unlocked.length} of {total} unlocked. Log your day to reveal more.
          </div>
        </div>
      </div>

      {claimable.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', padding: '13px 15px', marginBottom: 22 }}>
          <Glyph name="gift" size={22} color="var(--indigo)" />
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>
            {claimable.length} new {claimable.length === 1 ? 'badge' : 'badges'} to reveal. Tap the outlined ones below.
          </div>
        </div>
      )}

      {almost.length > 0 && (
        <>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)', margin: '2px 0 12px' }}>
            Almost there
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {almost.map((b) => (
              <div key={b.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', boxShadow: 'var(--shadow)', padding: '13px 15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{b.desc}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {b.value} / {b.goal}
                  </span>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: 'color-mix(in srgb,var(--text2) 16%,transparent)', overflow: 'hidden' }}>
                  <div style={{ width: `${b.pct}%`, height: '100%', borderRadius: 999, background: 'var(--indigo)', transition: 'width .4s' }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)', margin: '2px 0 12px' }}>
        All badges
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {badges.map((b) => (
          <BadgeTile
            key={b.id}
            b={b}
            claimed={claimed.has(b.id)}
            justClaimed={justClaimed === b.id}
            onClaim={onClaim}
          />
        ))}
      </div>
    </div>
  );
}

function BadgeTile({
  b,
  claimed,
  justClaimed,
  onClaim,
}: {
  b: Badge;
  claimed: boolean;
  justClaimed: boolean;
  onClaim: (id: string) => void;
}) {
  // Earned but not yet claimed — a glowing mystery tile inviting a tap to reveal.
  if (b.unlocked && !claimed) {
    return (
      <div role="button" tabIndex={0}
        onClick={() => onClaim(b.id)}
        className="press"
        style={{ position: 'relative', overflow: 'hidden', background: 'var(--surface)', border: '1.5px solid var(--indigo)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: '16px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, minHeight: 138, justifyContent: 'center', cursor: 'pointer' }}
      >
        <div style={{ position: 'relative', width: 52, height: 52, borderRadius: '50%', background: 'color-mix(in srgb,var(--indigo) 12%,var(--surface))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name="gift" size={24} color="var(--indigo)" />
        </div>
        <div style={{ position: 'relative', fontSize: 13, fontWeight: 650, color: 'var(--indigo)' }}>Tap to reveal</div>
      </div>
    );
  }
  // Claimed — revealed with what was achieved.
  if (b.unlocked && claimed) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: '16px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 7, minHeight: 138, justifyContent: 'center', animation: justClaimed ? 'badgePop .45s ease' : undefined }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name={b.icon} size={26} color="var(--on-accent)" />
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{b.name}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.3 }}>{b.desc}</div>
      </div>
    );
  }
  // Locked — the badge stays a mystery, but the requirement + progress show.
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: '16px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, minHeight: 138, justifyContent: 'center', opacity: 0.92 }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'color-mix(in srgb,var(--text2) 12%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="24" height="24" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <rect x="5" y="10.5" width="14" height="10" rx="2" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </svg>
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', lineHeight: 1.3 }}>{b.desc}</div>
      <div style={{ width: '100%' }}>
        <div style={{ height: 6, borderRadius: 999, background: 'color-mix(in srgb,var(--text2) 16%,transparent)', overflow: 'hidden' }}>
          <div style={{ width: `${b.pct}%`, height: '100%', borderRadius: 999, background: 'var(--text2)' }} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
          {b.value} / {b.goal}
        </div>
      </div>
    </div>
  );
}
