import React from 'react';

/**
 * A save button that follows you up the form.
 *
 * Entering an amount happens at the top of the screen and saving happens at the
 * bottom, so every entry ended with a scroll past fields you had already filled
 * in — friction on the one action the app most wants to be effortless.
 *
 * This is `position: sticky`, not a fixed overlay, which matters for three
 * reasons: it needs no scroll listener, it cannot be trapped by the transform
 * that animates a sheet open, and it settles into its natural place when you
 * reach the end of the form instead of hovering over the last field forever.
 * Floating while there is more below, resting once there isn't.
 *
 * `bottom` is the gap to the scrollport's edge: inside a sheet that is zero,
 * but on a screen the tab bar overlays the last ~80px, so the button has to
 * clear it or it sits underneath.
 */
export function StickySave({
  label,
  onClick,
  color = 'indigo',
  enabled = true,
  bottom = 0,
  reserve,
}: {
  label: string;
  onClick: () => void;
  color?: string;
  enabled?: boolean;
  /** Distance from the bottom of the scrolling area while floating. */
  bottom?: number;
  /**
   * Space kept below the button. Without it there is nothing left to scroll,
   * the button never reaches its resting place, and it hovers permanently over
   * whatever sits last in the form — which is how the receipt picker ended up
   * unreachable. Defaults to the float offset, which is exactly the slack
   * needed for the button to settle.
   */
  reserve?: number;
}) {
  return (
    <>
    <div style={{ position: 'sticky', bottom, zIndex: 5, marginTop: 10 }}>
      {/* Whatever scrolls under the button has to read as behind it, not as
          part of it. A blur does that over any backdrop; a solid fade cannot,
          because the page background is `--app-bg` — itself a radial gradient,
          so nesting it in a linear-gradient produced invalid CSS that silently
          painted nothing. The mask softens the blur's top edge so there is no
          hard line across the form. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: -24,
          right: -24,
          bottom: -26,
          top: -40,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          background: 'color-mix(in srgb, var(--bg) 62%, transparent)',
          WebkitMaskImage: 'linear-gradient(to top, #000 0%, #000 70%, transparent 100%)',
          maskImage: 'linear-gradient(to top, #000 0%, #000 70%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />
      <div
        onClick={enabled ? onClick : undefined}
        className={enabled ? 'press99' : undefined}
        role="button"
        aria-disabled={!enabled}
        style={{
          position: 'relative',
          background: enabled ? `var(--${color})` : `color-mix(in srgb,var(--${color}) 40%,var(--surface))`,
          color: '#fff',
          height: 54,
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '-.01em',
          cursor: enabled ? 'pointer' : 'default',
          boxShadow: '0 12px 26px -10px rgba(20,21,26,.45)',
        }}
      >
        {label}
      </div>
    </div>
    <div aria-hidden style={{ height: reserve ?? bottom }} />
    </>
  );
}
