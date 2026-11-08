// Which app a page load gets: the phone app (web/dist), or on a computer the
// desktop website (site/dist). Someone can choose either one on any device; the
// choice is a cookie, and it wins over the guess.

export type View = 'desktop' | 'phone';

const MOBILE = /Mobi|Android|iPhone|iPod|iPad|Silk|Kindle|Opera Mini|IEMobile|BlackBerry/i;

export function pickView(h: { cookie?: string; ua?: string; chMobile?: string }): View {
  const chosen = /(?:^|;\s*)orbit_view=(phone|desktop)\b/.exec(h.cookie || '')?.[1] as View | undefined;
  if (chosen) return chosen;
  // Chrome says outright whether it's a phone; everyone else, the user agent.
  if (h.chMobile === '?1') return 'phone';
  if (h.chMobile === '?0' && !MOBILE.test(h.ua || '')) return 'desktop';
  return MOBILE.test(h.ua || '') ? 'phone' : 'desktop';
}
