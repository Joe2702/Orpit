#!/usr/bin/env python3
"""
Generate Orbit's launcher icons, splash screens and store icon.

The mark: one orbit, seen from above. A faint full ring is the path; a bright
trail sweeps most of the way round it and ends in a warm dot, the sun coming
up on the day. It reads as an orbit at any size (the faint ring closes the
circle, so it's never a letter C) and as a day coming full circle, which is
what Orbit is for.

Everything is drawn per pixel with numpy at 4x and shrunk, so the trail's fade
is smooth and every edge is clean.

Run from the repo root:  python3 tools/make-icons.py
Set ORBIT_ICON_OUT=dir to write a preview set there instead of into the app.
Requires pillow and numpy.
"""
import math
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREVIEW = os.environ.get('ORBIT_ICON_OUT')
RES = os.path.join(PREVIEW or ROOT, 'web/android/app/src/main/res')
PUBLIC = os.path.join(PREVIEW or ROOT, 'web/public')
STORE = os.path.join(PREVIEW or ROOT, 'store')
SS = 4  # supersampling

# Colours. The indigo matches the app's accent family; the dot is the one warm
# thing in it.
BG_TOP = np.array([0x55, 0x57, 0xEA], float)
BG_MID = np.array([0x2F, 0x2C, 0x92], float)
BG_END = np.array([0x1A, 0x17, 0x5A], float)
DAWN = np.array([0xFF, 0xB0, 0x5E], float)
SUN = (0xFF, 0xD2, 0x8F)
WHITE = np.array([255, 255, 255], float)

# Geometry, in the 108-unit adaptive-icon canvas.
R = 21.0          # orbit radius: with the sun, inside the 66-unit safe circle
W = 6.6           # trail width
HEAD = -58.0      # where the dot is, degrees (0 = right, y down)
SPAN = 300.0      # how far round the trail reaches behind it
DOT = 5.8         # dot radius
BASE = 0.17       # the faint ring's opacity


def ss_for(n):
    # Big images need less supersampling, and 4x of a 1920 splash is slow.
    return SS if n <= 512 else 2


def grid(n, ss=None):
    ss = ss or ss_for(n)
    s = n * ss
    y, x = np.mgrid[0:s, 0:s].astype(float)
    k = 108.0 / s
    return (x + 0.5) * k, (y + 0.5) * k, k


def background(n, dawn=True):
    """Indigo, lit from the top left, with a warm dawn where the sun is."""
    # A smooth gradient needs no supersampling.
    X, Y, _ = grid(n, 1)
    t = np.clip((X + Y) / 216.0, 0, 1)[..., None]
    col = np.where(t < 0.55, BG_TOP + (BG_MID - BG_TOP) * (t / 0.55), BG_MID + (BG_END - BG_MID) * ((t - 0.55) / 0.45))
    # A soft sheen top left.
    d = np.hypot((X - 26) / 70, (Y - 14) / 70)[..., None]
    col = col + (WHITE - col) * (0.16 * np.clip(1 - d, 0, 1) ** 2)
    if not dawn:
        img = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
        return img
    # Dawn behind the sun.
    hx, hy = 54 + R * math.cos(math.radians(HEAD)), 54 + R * math.sin(math.radians(HEAD))
    d = np.hypot(X - hx, Y - hy)[..., None] / 46.0
    col = col + (DAWN - col) * (0.30 * np.clip(1 - d, 0, 1) ** 2)
    return Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')


def mark(n, scale=1.0, mono=False):
    """The ring, the trail and the sun on a transparent square."""
    X, Y, k = grid(n)
    # Scaling about the centre lets splash screens and legacy icons size it.
    X = 54 + (X - 54) / scale
    Y = 54 + (Y - 54) / scale
    px = k / scale  # one output pixel at supersample, in canvas units
    r = np.hypot(X - 54, Y - 54)
    band = np.clip((W / 2 - np.abs(r - R)) / px + 0.5, 0, 1)

    ang = np.degrees(np.arctan2(Y - 54, X - 54))
    behind = np.mod(HEAD - ang, 360.0)  # degrees behind the sun, going back round
    fade = np.clip(1 - behind / SPAN, 0, 1) ** 1.35
    alpha = band * np.maximum(BASE if not mono else 0.32, fade)

    hx, hy = 54 + R * math.cos(math.radians(HEAD)), 54 + R * math.sin(math.radians(HEAD))
    dr = np.hypot(X - hx, Y - hy)
    sun = np.clip((DOT - dr) / px + 0.5, 0, 1)

    out = np.zeros(X.shape + (4,), float)
    out[..., :3] = 255
    out[..., 3] = alpha
    if not mono:
        # A glow round the sun, under it.
        glow = 0.55 * np.clip(1 - dr / (DOT * 2.6), 0, 1) ** 2
        g_rgb = np.array(SUN, float)
        a_new = glow + out[..., 3] * (1 - glow)
        rgb = (g_rgb * glow[..., None] + out[..., :3] * (out[..., 3] * (1 - glow))[..., None]) / np.maximum(a_new, 1e-6)[..., None]
        out[..., :3], out[..., 3] = rgb, a_new
        sun_rgb = np.array(SUN, float)
    else:
        sun_rgb = WHITE
    a_new = sun + out[..., 3] * (1 - sun)
    rgb = (sun_rgb * sun[..., None] + out[..., :3] * (out[..., 3] * (1 - sun))[..., None]) / np.maximum(a_new, 1e-6)[..., None]
    out[..., :3], out[..., 3] = rgb, a_new

    out[..., 3] *= 255
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')
    return img.resize((n, n), Image.LANCZOS)


def full_icon(n, scale=1.0):
    return Image.alpha_composite(background(n), mark(n, scale))


def mask(n, kind):
    m = Image.new('L', (n * SS, n * SS), 0)
    from PIL import ImageDraw
    d = ImageDraw.Draw(m)
    if kind == 'circle':
        d.ellipse([0, 0, n * SS - 1, n * SS - 1], fill=255)
    else:
        d.rounded_rectangle([0, 0, n * SS - 1, n * SS - 1], radius=int(n * SS * 0.22), fill=255)
    return m.resize((n, n), Image.LANCZOS)


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print('  ', os.path.relpath(path, PREVIEW or ROOT), f'{img.size[0]}x{img.size[1]}')


if __name__ == '__main__':
    DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

    print('Adaptive icon layers (108dp):')
    for d, s in DENS.items():
        n = int(108 * s)
        save(background(n), f'{RES}/mipmap-{d}/ic_launcher_background.png')
        save(mark(n), f'{RES}/mipmap-{d}/ic_launcher_foreground.png')
        # Android 13+ themed icons recolour this silhouette themselves.
        save(mark(n, mono=True), f'{RES}/drawable-{d}/ic_launcher_monochrome.png')

    print('Legacy launcher icons (48dp):')
    for d, s in DENS.items():
        n = int(48 * s)
        icon = full_icon(n, scale=1.28)
        sq = icon.copy()
        sq.putalpha(mask(n, 'square'))
        save(sq, f'{RES}/mipmap-{d}/ic_launcher.png')
        rd = icon.copy()
        rd.putalpha(mask(n, 'circle'))
        save(rd, f'{RES}/mipmap-{d}/ic_launcher_round.png')

    print('Splash screens:')
    SPLASH = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}
    for d, (w, h) in SPLASH.items():
        for orient, (ow, oh) in (('port', (w, h)), ('land', (h, w))):
            side = max(ow, oh)
            bg = background(side, dawn=False)
            canvas = bg.crop(((side - ow) // 2, (side - oh) // 2, (side - ow) // 2 + ow, (side - oh) // 2 + oh))
            m = mark(int(min(ow, oh) * 0.62))
            canvas.alpha_composite(m, ((ow - m.size[0]) // 2, (oh - m.size[1]) // 2))
            save(canvas.convert('RGB'), f'{RES}/drawable-{orient}-{d}/splash.png')
    save(Image.open(f'{RES}/drawable-land-mdpi/splash.png'), f'{RES}/drawable/splash.png')

    print('Web icons:')
    save(full_icon(192, 1.28), f'{PUBLIC}/icon-192.png')
    save(full_icon(512, 1.28), f'{PUBLIC}/icon-512.png')
    save(full_icon(180, 1.28), f'{PUBLIC}/apple-touch-icon.png')

    print('Play Store icon (512, opaque; Play rounds the corners itself):')
    save(full_icon(512, 1.28).convert('RGB'), f'{STORE}/icon-512.png')
    print('\nDone.')
