// Liquid glass: the bend at the rim.
//
// Frosted glass only blurs what's behind it. Liquid glass also bends it near
// the edge, the way a thick pane does, with a thin rainbow where the colours
// separate. Here that's an SVG filter used as a backdrop filter: a map says
// how far to pull each point of the backdrop (nothing in the middle, more and
// more towards the rim, always inward), and the red, green and blue channels
// are pulled by slightly different amounts.
//
// Chromium draws SVG backdrop filters, and Orbit runs on Android's Chromium
// WebView. Elsewhere, on low-memory phones, and when the phone asks for less
// transparency, the glass keeps its plain frosted blur from the stylesheet.


export interface LensCfg {
  /** How far the rim pulls the backdrop, in px at the very edge. */
  scale: number;
  /** How deep the bending band is, from the edge inward, in px. */
  band: number;
  /** Separate the colours a little at the rim. */
  chroma?: boolean;
  /** Magnify slightly, for the droplet behind the current tab. */
  zoom?: boolean;
  /** Frost on top of the bend, in px. */
  blur: number;
  sat?: number;
}

export const LENS = {
  bar: { scale: 36, band: 15, chroma: true, blur: 13.5, sat: 1.7 },
  drop: { scale: 30, band: 13, chroma: true, zoom: true, blur: 12.5, sat: 1.9 },
  fab: { scale: 30, band: 14, chroma: true, blur: 13.5, sat: 1.7 },
  toast: { scale: 24, band: 10, chroma: true, blur: 13.5, sat: 1.7 },
  sheet: { scale: 52, band: 24, chroma: true, blur: 26, sat: 1.8 },
  dialog: { scale: 40, band: 18, chroma: true, blur: 26, sat: 1.8 },
} satisfies Record<string, LensCfg>;

/**
 * The bend for a rounded rectangle, as RGBA bytes: red is the pull across,
 * green the pull down, 128 meaning none. Inside the shape the pull points
 * inward, ramping smoothly from nothing at `band` px in to full at the edge.
 */
export function lensField(w: number, h: number, r: number, band: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      // Nearest point of the rectangle shrunk by the corner radius.
      const cx = Math.min(Math.max(px, r), w - r);
      const cy = Math.min(Math.max(py, r), h - r);
      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.hypot(dx, dy);
      let edge: number;
      let nx = 0;
      let ny = 0;
      if (dist > 0) {
        edge = r - dist;
        nx = dx / dist;
        ny = dy / dist;
      } else {
        const m = Math.min(px, w - px, py, h - py);
        edge = m;
        if (m === px) nx = -1;
        else if (m === w - px) nx = 1;
        else if (m === py) ny = -1;
        else ny = 1;
      }
      const k = (y * w + x) * 4;
      d[k + 2] = 128;
      d[k + 3] = 255;
      if (edge < 0) {
        d[k] = 128;
        d[k + 1] = 128;
        continue;
      }
      const t = Math.max(0, 1 - edge / band);
      const mag = t * t * (3 - 2 * t);
      d[k] = Math.round(128 - nx * mag * 127);
      d[k + 1] = Math.round(128 - ny * mag * 127);
    }
  }
  return d;
}

function lensImage(w: number, h: number, r: number, band: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(w, h);
  img.data.set(lensField(w, h, r, band));
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

const NS = 'http://www.w3.org/2000/svg';
let defs: SVGSVGElement | null = null;
let count = 0;

function filterFor(id: string, cfg: LensCfg): SVGFEImageElement {
  if (!defs || !defs.isConnected) {
    defs = document.createElementNS(NS, 'svg');
    defs.setAttribute('aria-hidden', 'true');
    defs.setAttribute('width', '0');
    defs.setAttribute('height', '0');
    defs.style.position = 'absolute';
    document.body.appendChild(defs);
  }
  const f = document.createElementNS(NS, 'filter');
  f.setAttribute('id', id);
  for (const [k, v] of Object.entries({ x: '0', y: '0', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' })) f.setAttribute(k, v);
  const s = cfg.scale;
  const map = cfg.zoom ? 'zmap' : 'map';
  const pass = (scale: number, keep: string, name: string) =>
    `<feDisplacementMap in="SourceGraphic" in2="${map}" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d${name}"/>` +
    `<feColorMatrix in="d${name}" type="matrix" values="${keep}" result="${name}"/>`;
  f.innerHTML =
    `<feImage result="map" x="0" y="0" preserveAspectRatio="none"/>` +
    (cfg.zoom
      ? `<feComponentTransfer in="map" result="zmap"><feFuncR type="linear" slope="1.06" intercept="-0.03"/><feFuncG type="linear" slope="1.06" intercept="-0.03"/></feComponentTransfer>`
      : '') +
    (cfg.chroma
      ? pass(s, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', 'r') +
        pass(s * 0.9, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', 'g') +
        pass(s * 0.8, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', 'b') +
        `<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/>`
      : `<feDisplacementMap in="SourceGraphic" in2="${map}" scale="${s}" xChannelSelector="R" yChannelSelector="G"/>`);
  defs.appendChild(f);
  return f.querySelector('feImage') as SVGFEImageElement;
}

/** Whether this phone draws the bend; otherwise the plain frost stays. */
export function lensSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  try {
    if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return false;
  } catch {
    /* older browsers don't know the query */
  }
  const ua = navigator.userAgent;
  // iOS browsers are all WebKit underneath, whatever their name.
  if (!/Chrome\/\d+/.test(ua) || /CriOS|FxiOS|EdgiOS/.test(ua)) return false;
  // Three passes over the backdrop every frame is too much for the smallest phones.
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return !(mem && mem < 3);
}

/**
 * Bends the backdrop at the rim of `el`. The map follows the element's size
 * and corner radius as they change (the tab bar folding, a sheet growing), at
 * most once a frame. Returns what undoes it.
 */
export function attachLens(el: HTMLElement, cfg: LensCfg): () => void {
    const id = `orbit-lens-${++count}`;
    const img = filterFor(id, cfg);
    let last = '';
    let frame = 0;
    const update = () => {
      frame = 0;
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const cs = getComputedStyle(el);
      const r = parseFloat(cs.borderTopLeftRadius) || 0;
      // Chrome doesn't trim an SVG backdrop filter to rounded corners, so
      // without this the glass pokes out square past the rim at each corner.
      el.style.setProperty('clip-path', `inset(0 round ${cs.borderRadius})`);
      const key = `${w}x${h}x${r}`;
      if (key === last) return;
      last = key;
      const url = lensImage(w, h, r, cfg.band);
      img.setAttribute('href', url);
      img.setAttribute('width', String(w));
      img.setAttribute('height', String(h));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    update();
    const bf = `url(#${id}) blur(${cfg.blur}px) saturate(${cfg.sat ?? 1.7}) brightness(1.04)`;
    el.style.setProperty('backdrop-filter', bf);
    return () => {
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
      el.style.removeProperty('backdrop-filter');
      el.style.removeProperty('clip-path');
      img.parentElement?.remove();
    };
}

/**
 * Gives every element marked `data-lens="bar|drop|fab|toast|sheet|dialog"`
 * under `root` its bend, as it appears, and takes it away when it goes.
 * Toasts, sheets and dialogs come and go all the time; this way none of them
 * has to remember to ask.
 */
export function startLiquid(root: HTMLElement): () => void {
  if (!lensSupported()) return () => {};
  const live = new Map<HTMLElement, () => void>();
  const sweep = () => {
    for (const [el, undo] of live) {
      if (!el.isConnected) {
        undo();
        live.delete(el);
      }
    }
    root.querySelectorAll<HTMLElement>('[data-lens]').forEach((el) => {
      if (live.has(el)) return;
      const cfg = LENS[el.dataset.lens as keyof typeof LENS];
      if (cfg) live.set(el, attachLens(el, cfg));
    });
  };
  let queued = 0;
  const mo = new MutationObserver(() => {
    if (!queued) queued = requestAnimationFrame(() => ((queued = 0), sweep()));
  });
  mo.observe(root, { childList: true, subtree: true });
  sweep();
  return () => {
    mo.disconnect();
    if (queued) cancelAnimationFrame(queued);
    for (const undo of live.values()) undo();
    live.clear();
  };
}
