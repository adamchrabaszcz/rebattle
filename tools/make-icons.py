"""Builds the rebattle icons from the logo's "r" mark.

Run from the repo root, after tools/make-logo.py:  python3 tools/make-icons.py
Reads the mark's outlines from public/js/ui/logo-outlines.js (written by tools/make-logo.py), so the
icons carry the same "r" as the app. Writes public/icons/favicon.svg and public/icons/touch-icon.svg,
and docs/brand/instagram/profile.svg (the Instagram profile picture: square, mark small enough for
the round crop). The PNGs (favicon-32, apple-touch-icon, icon-512, profile) are headless-Chrome
screenshots of those SVGs at 32/180/512/1080 px.
"""
import json
import os
import re

src = open('public/js/ui/logo-outlines.js').read()
mark = json.loads(src.split('export const LOGO = ', 1)[1].rsplit(';', 1)[0])['mark']
X, Y, W, H = mark['box']  # font units, y down: the letter's top at Y, the underline's bottom at Y + H
paths = ''.join(f'<path fill="{"#ffb020" if role == "line" else "#eceef2"}" d="{d}"/>' for role, d in mark['parts'].items())


def svg(size=64, rounded=True, fill_frac=0.6):
    """The mark centred on the dark background, fill_frac of the size tall."""
    s = size * fill_frac / H
    tx, ty = size / 2 - (X + W / 2) * s, (size - H * s) / 2 - Y * s
    rect = f'<rect width="{size}" height="{size}" rx="{size * 0.22 if rounded else 0:g}" fill="#111318"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">{rect}'
            f'<g transform="translate({tx:.3f} {ty:.3f}) scale({s:.5f} {-s:.5f})">{paths}</g></svg>\n')


open('public/icons/favicon.svg', 'w').write(svg(64, True))
open('public/icons/touch-icon.svg', 'w').write(svg(180, False, fill_frac=0.5))
os.makedirs('docs/brand/instagram', exist_ok=True)
open('docs/brand/instagram/profile.svg', 'w').write(svg(1080, False, fill_frac=0.5))
