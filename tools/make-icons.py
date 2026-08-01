#!/usr/bin/env python3
"""
Generate Orbit's launcher icons and splash screens.

The app shipped with Capacitor's default placeholder art — a blue "X" that
belongs to the tooling, not to Orbit. This draws the mark the splash screen
already animates (a pale planet, a tilted orbit ring, one bright dot on it) at
every density Android and the web need, so the icon, the splash and the loading
animation are finally the same object.

Run from the repo root:  python3 tools/make-icons.py
Requires pillow.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'web/android/app/src/main/res')
PUBLIC = os.path.join(ROOT, 'web/public')
STORE = os.path.join(ROOT, 'store')

# The splash gradient, verbatim: radial-gradient(125% 85% at 50% 32%, ...)
STOPS = [(0.00, (0x60, 0x5a, 0xc9)), (0.46, (0x4a, 0x45, 0xa6)), (1.00, (0x3b, 0x37, 0x89))]
SS = 4  # supersample factor; everything is drawn big and shrunk for clean edges


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def gradient(size):
    """The brand backdrop, matching the splash screen's CSS radial gradient."""
    w = h = size
    img = Image.new('RGB', (w, h))
    px = img.load()
    cx, cy = 0.5, 0.32
    rx, ry = 0.625, 0.425  # CSS gives the ending shape as 125% x 85% of the box
    for y in range(h):
        fy = (y + 0.5) / h
        for x in range(w):
            fx = (x + 0.5) / w
            d = math.hypot((fx - cx) / rx, (fy - cy) / ry)
            d = min(1.0, d)
            for i in range(len(STOPS) - 1):
                p0, c0 = STOPS[i]
                p1, c1 = STOPS[i + 1]
                if d <= p1 or i == len(STOPS) - 2:
                    px[x, y] = lerp(c0, c1, (d - p0) / (p1 - p0) if p1 > p0 else 0)
                    break
    return img


def mark(size, safe_frac=0.53, mono=False, glow=True):
    """
    The Orbit mark on a transparent square.

    `safe_frac` is the *orbit's* width as a fraction of the canvas. Adaptive
    icons only guarantee the middle 72 of 108dp survives masking, and the dot
    rides beyond the end of the ring — so the budget is the ring plus the dot
    plus half the stroke, not the ring alone. At 0.53 the whole mark clears a
    circular mask; sized off the ring alone, the dot was sliced clean off.
    """
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    c = S / 2
    a = S * safe_frac / 2          # orbit semi-major axis
    b = a * (23 / 58)              # semi-minor, from the splash's ellipse
    planet_r = a * (31 / 58)
    dot_r = a * (8.2 / 58)
    stroke = max(SS, a * (4.6 / 58))
    tilt = math.radians(-26)

    white = (255, 255, 255, 255)

    if glow and not mono:
        # A soft halo, as on the splash. Drawn on its own layer so the blur
        # can't bleed into the crisp shapes above it.
        g = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        gd = ImageDraw.Draw(g)
        steps = 26
        for i in range(steps):
            t = i / (steps - 1)
            r = planet_r * (1.15 + 1.5 * t)
            alpha = int(52 * (1 - t) ** 2)
            gd.ellipse([c - r, c - r, c + r, c + r], fill=(255, 255, 255, alpha))
        g = g.filter(ImageFilter.GaussianBlur(S / 42))
        img = Image.alpha_composite(img, g)

    # The orbit ring: an ellipse tilted -26°. PIL can't rotate an ellipse and
    # its thick polylines come out serrated, so the band is filled as one
    # polygon — the outer rim followed by the inner rim in reverse.
    def rim(scale_a, scale_b, reverse=False):
        pts = []
        for i in range(721):
            t = i * math.pi / 360
            x, y = scale_a * math.cos(t), scale_b * math.sin(t)
            pts.append((c + x * math.cos(tilt) - y * math.sin(tilt),
                        c + x * math.sin(tilt) + y * math.cos(tilt)))
        return pts[::-1] if reverse else pts

    ring = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(ring).polygon(
        rim(a + stroke / 2, b + stroke / 2) + rim(a - stroke / 2, b - stroke / 2, reverse=True),
        fill=white if mono else (255, 255, 255, 175))
    img = Image.alpha_composite(img, ring)

    # The planet sits on top, so the ring passes behind it — same as the splash.
    pl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pl)
    if mono:
        pd.ellipse([c - planet_r, c - planet_r, c + planet_r, c + planet_r], fill=white)
    else:
        # A vertical wash from white to the pale lavender the splash uses.
        for i in range(int(planet_r * 2)):
            t = i / max(1, planet_r * 2 - 1)
            col = lerp((255, 255, 255), (0xdc, 0xd9, 0xf5), t ** 1.25)
            half = math.sqrt(max(0.0, planet_r ** 2 - (i - planet_r) ** 2))
            pd.line([(c - half, c - planet_r + i), (c + half, c - planet_r + i)],
                    fill=col + (255,), width=1)
    img = Image.alpha_composite(img, pl)

    # One bright dot riding the ring, at the end of the semi-major axis —
    # exactly where the splash parks it.
    dx = a * math.cos(tilt)
    dy = a * math.sin(tilt)
    dot = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dot)
    if not mono:
        for i in range(14):
            t = i / 13
            r = dot_r * (1 + 2.2 * t)
            dd.ellipse([c + dx - r, c + dy - r, c + dx + r, c + dy + r],
                       fill=(255, 255, 255, int(38 * (1 - t) ** 2)))
        dot = dot.filter(ImageFilter.GaussianBlur(S / 150))
        dd = ImageDraw.Draw(dot)
    dd.ellipse([c + dx - dot_r, c + dy - dot_r, c + dx + dot_r, c + dy + dot_r], fill=white)
    img = Image.alpha_composite(img, dot)

    return img.resize((size, size), Image.LANCZOS)


def rounded_mask(size, radius_frac):
    m = Image.new('L', (size * SS, size * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [0, 0, size * SS - 1, size * SS - 1], radius=int(size * SS * radius_frac), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def circle_mask(size):
    m = Image.new('L', (size * SS, size * SS), 0)
    ImageDraw.Draw(m).ellipse([0, 0, size * SS - 1, size * SS - 1], fill=255)
    return m.resize((size, size), Image.LANCZOS)


def full_icon(size, mark_frac=0.58):
    """Background + mark, filling the whole square."""
    bg = gradient(size).convert('RGBA')
    return Image.alpha_composite(bg, mark(size, safe_frac=mark_frac))


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print('  ', os.path.relpath(path, ROOT), f'{img.size[0]}x{img.size[1]}')


DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

print('Adaptive icon layers (108dp canvas):')
for d, s in DENSITIES.items():
    n = int(108 * s)
    save(gradient(n).convert('RGBA'), f'{RES}/mipmap-{d}/ic_launcher_background.png')
    save(mark(n), f'{RES}/mipmap-{d}/ic_launcher_foreground.png')
    # Android 13+ themed icons: a flat silhouette the system recolours itself.
    save(mark(n, mono=True, glow=False), f'{RES}/drawable-{d}/ic_launcher_monochrome.png')

print('Legacy launcher icons:')
for d, s in DENSITIES.items():
    n = int(48 * s)
    icon = full_icon(n)
    sq = icon.copy()
    sq.putalpha(rounded_mask(n, 0.22))
    save(sq, f'{RES}/mipmap-{d}/ic_launcher.png')
    rd = icon.copy()
    rd.putalpha(circle_mask(n))
    save(rd, f'{RES}/mipmap-{d}/ic_launcher_round.png')

print('Splash screens:')
SPLASH = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280),
          'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}
for d, (w, h) in SPLASH.items():
    for orient, (ow, oh) in (('port', (w, h)), ('land', (h, w))):
        # One square gradient cropped to the screen, so the light source stays
        # put whichever way the phone is held.
        side = max(ow, oh)
        bg = gradient(side).resize((side, side), Image.LANCZOS)
        canvas = bg.crop(((side - ow) // 2, (side - oh) // 2,
                          (side - ow) // 2 + ow, (side - oh) // 2 + oh)).convert('RGBA')
        m = mark(int(min(ow, oh) * 0.30))
        canvas.alpha_composite(m, ((ow - m.size[0]) // 2, (oh - m.size[1]) // 2))
        save(canvas.convert('RGB'), f'{RES}/drawable-{orient}-{d}/splash.png')
# The density-less default, used before Android picks a bucket.
base = Image.open(f'{RES}/drawable-land-mdpi/splash.png')
save(base, f'{RES}/drawable/splash.png')

print('Web / PWA icons:')
save(full_icon(192), f'{PUBLIC}/icon-192.png')
save(full_icon(512), f'{PUBLIC}/icon-512.png')
save(full_icon(180), f'{PUBLIC}/apple-touch-icon.png')

print('Play Store listing icon (512, no transparency):')
save(full_icon(512).convert('RGB'), f'{STORE}/play-icon-512.png')

print('\nDone.')
