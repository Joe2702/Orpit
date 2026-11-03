// The accent colour, picked from anywhere on the wheel.
//
// Any colour can be chosen, but not every colour can be used as-is: a pale
// yellow link on white, or a deep navy button on near-black, can't be read.
// So the chosen colour is nudged lighter or darker, per theme, only as far as
// it takes to read clearly against the page, and the text on accent buttons
// is white or near-black, whichever stands out more.

export interface Hsv {
  h: number; // 0–360
  s: number; // 0–1
  v: number; // 0–1
}

export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const toHex = (n: number) => Math.round(clamp01(n) * 255).toString(16).padStart(2, '0');

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export const rgbToHex = (r: number, g: number, b: number) => `#${toHex(r)}${toHex(g)}${toHex(b)}`;

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return rgbToHex(f(5), f(3), f(1));
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = hexToRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// The page each theme's accent has to read against.
const PAGE = { light: '#ffffff', dark: '#161619' };
const TARGET = 3.2;

/**
 * The chosen colour as it's used in a theme: moved toward black (light theme)
 * or white (dark theme) in small steps until it reads against the page, and
 * the text colour that goes on top of it.
 */
export function accentFor(hex: string, theme: 'light' | 'dark'): { accent: string; onAccent: string } {
  let c = hex;
  const page = PAGE[theme];
  for (let i = 0; i < 40 && contrast(c, page) < TARGET; i++) {
    const [r, g, b] = hexToRgb(c);
    c = theme === 'light' ? rgbToHex(r * 0.94, g * 0.94, b * 0.94) : rgbToHex(r + (1 - r) * 0.08, g + (1 - g) * 0.08, b + (1 - b) * 0.08);
  }
  const onAccent = contrast(c, '#ffffff') >= contrast(c, '#0c0c0f') ? '#ffffff' : '#0c0c0f';
  return { accent: c, onAccent };
}
