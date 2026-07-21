import React from 'react';

// Finance-category icon path sets (ported from the Orbit design).
const FIN: Record<string, string[]> = {
  food: ['M5 3v7M5 3a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2M5 10v9M15 3c-1.7 0-3 2-3 4.5S13.3 12 15 12m0-9v16'],
  car: ['M4 12l1.5-4.5A2 2 0 0 1 7.4 6h5.2a2 2 0 0 1 1.9 1.5L16 12M4 12h12v4H4zM6 16v1.5M14 16v1.5', 'M6.5 12h0M13.5 12h0'],
  home: ['M4 9.5 10 4l6 5.5M6 8.5V16h8V8.5'],
  star: ['M10 3l2.1 4.4 4.9.6-3.6 3.4.9 4.8L10 14.4 5.7 16.6l.9-4.8L3 8.4l4.9-.6z'],
  heart: ['M10 16S3.5 12 3.5 7.6A3.6 3.6 0 0 1 10 5a3.6 3.6 0 0 1 6.5 2.6C16.5 12 10 16 10 16z'],
  bag: ['M5 7h10l-.8 9.2a1 1 0 0 1-1 .8H6.8a1 1 0 0 1-1-.8zM7.5 7V5.5a2.5 2.5 0 0 1 5 0V7'],
  cash: ['M3 6h14v8H3zM3 9.5h14M6.5 12.5h2', 'M10 6v8'],
  laptop: ['M5 5h10v8H5zM3 16h14M8 13h4'],
  chart: ['M4 16V9M9 16V5M14 16v-4M4 16h11'],
  gift: ['M4 9h12v8H4zM4 6h12v3H4zM10 6v11M10 6C10 4 8.5 3 7.5 4S8 6 10 6M10 6c0-2 1.5-3 2.5-2S12 6 10 6'],
  coffee: ['M4 8h10v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM14 9h2a2 2 0 0 1 0 4h-2M6 3v2M9 3v2'],
  phone: ['M7 3h6v14H7zM9.5 14.5h1'],
  other: ['M10 4a6 6 0 1 0 0 12A6 6 0 0 0 10 4zM10 9v4M10 6.5h0'],
};

const CTR: Record<string, string[]> = {
  reps: ['M4 8v4M6.5 6.2v7.6M13.5 6.2v7.6M16 8v4M6.5 10h7'],
  flame: ['M10 3.2c.8 2.8 3.9 3.7 3.9 6.9a3.9 3.9 0 0 1-7.8 0c0-1.4.7-2.2 1.5-3 .3 1 .9 1.5 1.6 1.5C10.5 8.6 9.2 5.9 10 3.2Z'],
  book: ['M10 5.4C8.4 4.4 6 4.2 4 4.9v10c2-.7 4.4-.5 6 .5M10 5.4c1.6-1 4-1.2 6-.5v10c-2-.7-4.4-.5-6 .5M10 5.4v10'],
  clock: ['M10 3.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M10 6.6V10l2.6 1.7'],
  target: ['M10 3.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6'],
  drop: ['M10 3.4c2.8 3.6 4.6 5.6 4.6 8a4.6 4.6 0 0 1-9.2 0c0-2.4 1.8-4.4 4.6-8Z'],
  pen: ['M12.6 4.1l3.3 3.3-8.1 8.1L4 16.6l1.1-3.8 7.5-8.7ZM11.5 5.3l3.2 3.2'],
  bolt: ['M11 3l-6 8.2h4l-1 5.8 6-8.2h-4L11 3Z'],
  tally: ['M6 4.2l-1.2 11.6M11.4 4.2l-1.2 11.6M3.6 8h13M2.9 12h13'],
  cup: ['M4 7h9v4a4.5 4.5 0 0 1-9 0zM13 8h2a2 2 0 0 1 0 4h-2M5 3.2v1.4M8.5 3.2v1.4'],
  star: ['M10 3l2.1 4.3 4.7.6-3.4 3.3.8 4.7L10 14.4 5.8 16.2l.8-4.7L3.2 8.2l4.7-.6z'],
  heart: ['M10 16S3.5 12 3.5 7.6A3.6 3.6 0 0 1 10 5a3.6 3.6 0 0 1 6.5 2.6C16.5 12 10 16 10 16z'],
};

export const FIN_ICONS = Object.keys(FIN);
export const CTR_ICONS = ['reps', 'flame', 'book', 'clock', 'target', 'drop', 'pen', 'bolt', 'tally', 'cup', 'star', 'heart'];

function draw(paths: string[], color: string, size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ fill: 'none', stroke: color, strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export function FinIcon({ icon, color, size = 20 }: { icon: string; color: string; size?: number }) {
  return draw(FIN[icon] || FIN.other, color, size);
}

export function CIcon({ icon, color, size = 22 }: { icon: string; color: string; size?: number }) {
  return draw(CTR[icon] || CTR.tally, color, size);
}
