"""Builds the README logo, "drop. bounceback. rebattle.", from Funnel Display Bold.

Run from the repo root:  pip install fonttools brotli && python3 tools/make-logo.py
Writes docs/logo-dark.svg (light text, for dark backgrounds) and docs/logo-light.svg
(dark text, for light backgrounds). Same rules as the app's logo (public/styles.css,
.brand): letter-spacing -0.03em, square full stops 0.14em with a 0.06em gap, the lead
in the muted colour, an amber underline under "rebattle" placed like the icon's
(0.075em below the baseline, 0.12em thick). The text is outlines, so it doesn't
depend on fonts on the viewer's machine. No kerning (fontTools doesn't shape text).
"""
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

font = instancer.instantiateVariableFont(TTFont('public/fonts/funnel-display-normal-latin.woff2'), {'wght': 700})
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
EM = font['head'].unitsPerEm
SPACING = -0.03 * EM
STOP, STOP_GAP = 0.14 * EM, 0.06 * EM
GAP, THICK = 0.075 * EM, 0.12 * EM
ASC = 0.80 * EM  # top of the box (ascenders, with a little room)
PAD = 0.04 * EM


def word(text, x):
    """Outline of a word starting at x (baseline 0, y up). Returns (path, new x)."""
    pen = SVGPathPen(glyphs)
    for ch in text:
        name = cmap[ord(ch)]
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, 1, x, 0)))
        x += glyphs[name].width + SPACING
    return pen.getCommands(), x - SPACING


def build(lead_colour, name_colour, accent='#ffb020'):
    parts, x = [], 0
    space = glyphs[cmap[ord(' ')]].width + SPACING
    for i, (text, colour) in enumerate([('drop', lead_colour), ('bounceback', lead_colour), ('rebattle', name_colour)]):
        start = x
        path, x = word(text, x)
        parts.append(f'<path fill="{colour}" d="{path}"/>')
        if text == 'rebattle':
            parts.append(f'<rect fill="{accent}" x="{start:.1f}" y="{-GAP - THICK:.1f}" width="{x - start:.1f}" height="{THICK:.1f}"/>')
        x += STOP_GAP
        parts.append(f'<rect fill="{colour}" x="{x:.1f}" y="0" width="{STOP:.1f}" height="{STOP:.1f}"/>')
        x += STOP + (space if i < 2 else 0)
    width, height = x + 2 * PAD, ASC + GAP + THICK + 2 * PAD
    # Font units are y-up; flip into SVG's y-down with the baseline at PAD + ASC.
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height:.0f}" role="img" aria-label="drop. bounceback. rebattle.">'
            f'<g transform="translate({PAD:.1f} {PAD + ASC:.1f}) scale(1 -1)">{"".join(parts)}</g></svg>\n')


open('docs/logo-dark.svg', 'w').write(build('#9599a6', '#eceef2'))
open('docs/logo-light.svg', 'w').write(build('#6b6f7b', '#111318'))
