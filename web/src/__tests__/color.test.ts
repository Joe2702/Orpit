import { describe, it, expect } from 'vitest';
import { accentFor, contrast, hexToHsv, hsvToHex, isHex } from '../lib/color';

describe('the accent colour wheel', () => {
  it('turns wheel positions into colours and back', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000');
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00');
    expect(hsvToHex({ h: 240, s: 0, v: 1 })).toBe('#ffffff');
    const back = hexToHsv('#3d4ed8');
    expect(hsvToHex(back)).toBe('#3d4ed8');
    expect(isHex('#3D4ED8')).toBe(true);
    expect(isHex('indigo')).toBe(false);
  });

  it('keeps any colour readable: darker on light pages, lighter on dark ones', () => {
    for (let h = 0; h < 360; h += 15) {
      for (const [s, v] of [[1, 1], [0.4, 1], [1, 0.3], [0.1, 0.95]]) {
        const hex = hsvToHex({ h, s, v });
        expect(contrast(accentFor(hex, 'light').accent, '#ffffff')).toBeGreaterThanOrEqual(3.2);
        expect(contrast(accentFor(hex, 'dark').accent, '#161619')).toBeGreaterThanOrEqual(3.2);
      }
    }
  });

  it('leaves a colour alone when it already reads, and picks text that stands out on it', () => {
    expect(accentFor('#3d4ed8', 'light')).toEqual({ accent: '#3d4ed8', onAccent: '#ffffff' });
    const yellow = accentFor('#ffe14d', 'dark');
    expect(yellow.accent).toBe('#ffe14d');
    expect(yellow.onAccent).toBe('#0c0c0f');
  });
});
