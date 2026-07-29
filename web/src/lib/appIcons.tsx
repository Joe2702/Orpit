import React from 'react';

// One stroke-drawn icon set to replace every emoji in the UI.
//
// Emoji render differently on every device and font, and they made the app look
// like a toy. These are plain geometric shapes on a 24-unit grid, drawn in
// `currentColor` so each caller controls the colour — which also lets an icon
// inherit a habit's or badge's own colour instead of being fixed forever.

export type GlyphName =
  | 'dumbbell' | 'flame' | 'moon' | 'bed' | 'check' | 'sprout' | 'tree'
  | 'coin' | 'wallet' | 'chart' | 'gem' | 'tally' | 'calculator'
  | 'star' | 'medal' | 'rocket' | 'target' | 'compass' | 'shield'
  | 'sparkle' | 'calendar' | 'camera' | 'crown' | 'trophy' | 'gift'
  | 'search' | 'lock' | 'plus' | 'bolt' | 'link' | 'alert' | 'zen'
  | 'cash' | 'receipt' | 'trendUp' | 'planet' | 'pause' | 'play' | 'sun';

const P: Record<GlyphName, React.ReactNode> = {
  dumbbell: <><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" /></>,
  flame: <><path d="M12 3c3 3.5 5 6 5 9a5 5 0 0 1-10 0c0-1.6.7-3 2-4.5.4 1.4 1.1 2.2 2 2.5-.4-2.6.3-5 1-7z" /></>,
  moon: <><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" /></>,
  bed: <><path d="M3 18v-8M3 13h18v5M21 18v-5a3 3 0 0 0-3-3h-7v3" /><circle cx="7" cy="10.5" r="1.8" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.2l2.6 2.6L16 9" /></>,
  sprout: <><path d="M12 21v-7M12 14c0-3 2-5 5-5 0 3-2 5-5 5zM12 14c0-2.5-1.7-4.2-4.2-4.2 0 2.5 1.7 4.2 4.2 4.2z" /></>,
  tree: <><path d="M12 21v-4M12 17l-5-3h3l-4-3h2.5L5 8h4L12 3l3 5h4l-3.5 3H18l-4 3h3z" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.8 9.8h3.4a1.6 1.6 0 0 1 0 3.2h-2.4a1.6 1.6 0 0 0 0 3.2h3.4" /></>,
  wallet: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3M3 7.5V17a2 2 0 0 0 2 2h14v-4M3 7.5V9h16v2h-4a2 2 0 0 0 0 4h4" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M4 20h16" /></>,
  gem: <><path d="M7 4h10l4 5-9 11L3 9zM3 9h18M9.5 9L12 20M14.5 9L12 20M9.5 9L11 4M14.5 9L13 4" /></>,
  tally: <><path d="M5 5v14M10 5v14M15 5v14M20 5v14M3 15l18-6" /></>,
  calculator: <><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M8 7h8M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" /></>,
  star: <><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.9l-5.3 2.7 1.1-5.8L3.5 9.7l5.9-.8z" /></>,
  medal: <><circle cx="12" cy="14.5" r="5.5" /><path d="M12 12.2l.9 1.9 2 .3-1.5 1.4.4 2-1.8-.9-1.8.9.4-2L9.1 14.4l2-.3zM8 8.5L6 3h5l1 2M16 8.5L18 3h-5" /></>,
  rocket: <><path d="M12 3c3 2.5 4.5 6 4.5 9.5L12 17l-4.5-4.5C7.5 9 9 5.5 12 3z" /><circle cx="12" cy="9.5" r="1.8" /><path d="M9 16l-2 5 4-2M15 16l2 5-4-2" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  compass: <><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  shield: <><path d="M12 3l7 3v5.5c0 4.2-2.8 7.6-7 9.5-4.2-1.9-7-5.3-7-9.5V6z" /><path d="M9 12l2 2 4-4.5" /></>,
  sparkle: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M3.5 10h17M8 2.5v4M16 2.5v4" /></>,
  camera: <><path d="M3 8.5h3.5L8 6h8l1.5 2.5H21V19H3z" /><circle cx="12" cy="13" r="3.5" /></>,
  crown: <><path d="M3.5 8l3.5 4 5-6.5 5 6.5 3.5-4-1.5 11h-14z" /><path d="M5 19h14" /></>,
  trophy: <><path d="M8 4h8v6a4 4 0 0 1-8 0z" /><path d="M8 5.5H5V7a3 3 0 0 0 3 3M16 5.5h3V7a3 3 0 0 1-3 3M12 14v3M9 20h6l-.6-3h-4.8z" /></>,
  gift: <><rect x="3.5" y="9" width="17" height="4" rx="1" /><path d="M5 13v7h14v-7M12 9v11" /><path d="M12 9S10.5 4.5 8.2 4.5a2.2 2.2 0 0 0 0 4.5zM12 9s1.5-4.5 3.8-4.5a2.2 2.2 0 0 1 0 4.5z" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  lock: <><rect x="4.5" y="10" width="15" height="10" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  bolt: <><path d="M13.5 3L5 13.5h6L10.5 21 19 10.5h-6z" /></>,
  link: <><path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5L12.5 17" /></>,
  alert: <><path d="M12 3.5l9 16H3z" /><path d="M12 9.5v4.5M12 17h.01" /></>,
  zen: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12c2.8 0 2.8 3.5 5.7 3.5S12 12 14.8 12s2.8 3.5 5.7 3.5" /></>,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.8" /><path d="M6 9.5h.01M18 14.5h.01" /></>,
  receipt: <><path d="M6 3h12v18l-2.5-1.7L13 21l-2.5-1.7L8 21l-2-1.5z" /><path d="M9.5 8h5M9.5 12h5" /></>,
  trendUp: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  planet: <><circle cx="12" cy="11" r="6" /><ellipse cx="12" cy="11" rx="10.5" ry="4" transform="rotate(-24 12 11)" /></>,
  pause: <><path d="M9 5v14M15 5v14" /></>,
  play: <><path d="M7 4.5l12 7.5-12 7.5z" /></>,
  sun: <><circle cx="12" cy="12" r="4.5" /><path d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1L5.3 5.3" /></>,
};

export function Glyph({
  name,
  size = 20,
  color = 'currentColor',
  sw = 1.9,
}: {
  name: GlyphName;
  size?: number;
  color?: string;
  sw?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ display: 'block', flex: 'none', fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' }}
    >
      {P[name]}
    </svg>
  );
}
