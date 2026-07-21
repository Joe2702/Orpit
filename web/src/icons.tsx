import React from 'react';

type IP = { c?: string; size?: number; sw?: number };

const stroke = (c: string, sw = 2): React.CSSProperties => ({
  fill: 'none',
  stroke: c,
  strokeWidth: sw,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export const IconWorkout = ({ c = 'var(--coral)', size = 22, sw = 2 }: IP) => (
  <svg width={size} height={size} style={stroke(c, sw)}>
    <path d="M5 8v6M8 6v10M14 6v10M17 8v6M8 11h6" />
  </svg>
);

export const IconSleep = ({ c = 'var(--blue)', size = 22, sw = 2 }: IP) => (
  <svg width={size} height={size} style={stroke(c, sw)}>
    <path d="M19 12.3A8 8 0 1 1 9.7 3a6.3 6.3 0 0 0 9.3 9.3Z" />
  </svg>
);

export const IconExpense = ({ c = 'var(--emerald)', size = 22, sw = 2 }: IP) => (
  <svg width={size} height={size} style={stroke(c, sw)}>
    <path d="M11 3v16M14.5 6H9.2a2.7 2.7 0 0 0 0 5.4h3.6a2.7 2.7 0 0 1 0 5.4H7" />
  </svg>
);

export const IconHabit = ({ c = 'var(--teal)', size = 22, sw = 2 }: IP) => (
  <svg width={size} height={size} style={stroke(c, sw)}>
    <circle cx="11" cy="11" r="8" />
    <path d="M7.5 11l2.3 2.3L15 8" />
  </svg>
);

export const IconPlus = ({ c = '#fff', size = 19, sw = 2.4 }: IP) => (
  <svg width={size} height={size} style={stroke(c, sw)}>
    <path d="M10 4v11M4 9.5h11" />
  </svg>
);

export const IconChevron = ({ c = 'var(--text2)', size = 18, sw = 2 }: IP) => (
  <svg width={size} height={size} style={stroke(c, sw)}>
    <path d="M7 4l5 5-5 5" />
  </svg>
);

export const IconPencil = ({ c = 'var(--text2)', size = 16, sw = 1.8 }: IP) => (
  <svg width={size} height={size} style={{ ...stroke(c, sw), flex: 'none', opacity: 0.7 }}>
    <path d="M11 3l2.5 2.5L6 13l-3 .8.8-3L11 3Z" />
  </svg>
);

export const IconTrash = ({ c = 'var(--danger)', size = 18, sw = 2 }: IP) => (
  <svg width={size} height={size} style={stroke(c, sw)}>
    <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />
  </svg>
);
