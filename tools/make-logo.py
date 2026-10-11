"""Builds the logo set from Funnel Display Bold: three versions in four colourways.

Run from the repo root:  pip install fonttools brotli && python3 tools/make-logo.py
Writes docs/brand/logos/<version>-<colourway>.svg (12 files), outlines on a transparent
background, so they don't depend on fonts on the viewer's machine. The PNGs next to them
are headless-Chrome screenshots of these SVGs (see docs/brand.md).

Versions (docs/brand.md has when to use which):
  full  "drop. bounceback. rebattle."  square full stops (the sentence's punctuation), underline under "rebattle"
  name  "rebattle"                     underline, no full stop
  mark  "r"                            underline from the letter's left edge to its right
Colourways (named by the background they go on):
  on-dark, on-light   full colour: text, muted "drop. bounceback.", amber underline
  mono-dark, mono-white  one colour for everything, underline included

Same rules as the app's logo (public/styles.css, .brand): letter-spacing -0.03em, square
stops 0.14em with a 0.06em gap, underline 0.075em below the baseline and 0.12em thick.
No kerning (fontTools doesn't shape text).
"""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

font = instancer.instantiateVariableFont(TTFont('public/fonts/funnel-display-normal-latin.woff2'), {'wght': 700})
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
EM = font['head'].unitsPerEm
SPACING = -0.03 * EM
STOP, STOP_GAP = 0.14 * EM, 0.06 * EM
GAP, THICK = 0.075 * EM, 0.12 * EM
PAD = 0.04 * EM  # a hair of room so nothing touches the edge; clear space is a usage rule

AMBER = '#ffb020'
COLOURWAYS = {
    'on-dark': {'text': '#eceef2', 'lead': '#9599a6', 'line': AMBER},
    'on-light': {'text': '#111318', 'lead': '#5f636d', 'line': AMBER},
    'mono-dark': {'text': '#111318', 'lead': '#111318', 'line': '#111318'},
    'mono-white': {'text': '#ffffff', 'lead': '#ffffff', 'line': '#ffffff'},
}


def word(text, x):
    """Outline of a word starting at x (baseline 0, y up): (path, end x, ink top)."""
    pen, bounds = SVGPathPen(glyphs), BoundsPen(glyphs)
    for ch in text:
        name = cmap[ord(ch)]
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, 1, x, 0)))
        glyphs[name].draw(TransformPen(bounds, (1, 0, 0, 1, x, 0)))
        x += glyphs[name].width + SPACING
    return pen.getCommands(), x - SPACING, bounds.bounds


def svg(parts, left, right, top):
    """Wraps shapes (font units, y up) in an SVG cropped to [left, right] x [top, underline bottom]."""
    bottom = -(GAP + THICK)
    width, height = right - left + 2 * PAD, top - bottom + 2 * PAD
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height:.0f}" role="img" aria-label="rebattle">'
            f'<g transform="translate({PAD - left:.1f} {PAD + top:.1f}) scale(1 -1)">{"".join(parts)}</g></svg>\n')


def full(c):
    parts, x, top = [], 0, 0
    space = glyphs[cmap[ord(' ')]].width + SPACING
    for i, (text, colour) in enumerate([('drop', c['lead']), ('bounceback', c['lead']), ('rebattle', c['text'])]):
        start = x
        path, x, b = word(text, x)
        top = max(top, b[3])
        parts.append(f'<path fill="{colour}" d="{path}"/>')
        if text == 'rebattle':
            parts.append(f'<rect fill="{c["line"]}" x="{start:.1f}" y="{-GAP - THICK:.1f}" width="{x - start:.1f}" height="{THICK:.1f}"/>')
        x += STOP_GAP
        parts.append(f'<rect fill="{colour}" x="{x:.1f}" y="0" width="{STOP:.1f}" height="{STOP:.1f}"/>')
        x += STOP + (space if i < 2 else 0)
    return svg(parts, 0, x, top)


def name(c):
    path, x, b = word('rebattle', 0)
    return svg([f'<path fill="{c["text"]}" d="{path}"/>',
                f'<rect fill="{c["line"]}" x="0" y="{-GAP - THICK:.1f}" width="{x:.1f}" height="{THICK:.1f}"/>'], 0, x, b[3])


def mark(c):
    # The underline spans the "r"'s ink, left edge to right edge, as in the app icon.
    path, _, (x0, _, x1, top) = word('r', 0)
    return svg([f'<path fill="{c["text"]}" d="{path}"/>',
                f'<rect fill="{c["line"]}" x="{x0:.1f}" y="{-GAP - THICK:.1f}" width="{x1 - x0:.1f}" height="{THICK:.1f}"/>'], x0, x1, top)


os.makedirs('docs/brand/logos', exist_ok=True)
for version, build in [('full', full), ('name', name), ('mark', mark)]:
    for colourway, colours in COLOURWAYS.items():
        open(f'docs/brand/logos/{version}-{colourway}.svg', 'w').write(build(colours))
