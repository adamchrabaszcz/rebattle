"""Builds the logo set and its usage sheet from the bundled fonts.

Run from the repo root:  pip install fonttools brotli && python3 tools/make-logo.py
Writes:
- docs/brand/logos/<version>-<colourway>.svg  (4 versions x 4 colourways), outlines on a transparent
  background, so they don't depend on fonts on the viewer's machine. The PNGs next to them are
  headless-Chrome screenshots of these SVGs (see docs/brand.md).
- docs/brand/logo-usage.svg  do's and don'ts, shown in docs/brand.md.

Versions (docs/brand.md has when to use which):
  full      "drop. bounceback. rebattle."  square full stops (the sentence's punctuation), underline under "rebattle"
  name      "rebattle"                     underline, no full stop
  mark      "r"                            underline from the letter's left edge to its right
  badge     the mark next to "rebattle.app": the one fixed "where to find us" element
  The address "rebattle.app" is text, not logo: Funnel Sans, a round dot, no underline, the logo's text colour.
Colourways (named by the background they go on):
  on-dark, on-light      full colour: text, muted "drop. bounceback.", amber underline
  mono-dark, mono-white  one colour for everything, underline included

Same rules as the app's logo (public/styles.css, .brand): letter-spacing -0.03em, square stops
0.14em with a 0.06em gap, underline 0.075em below the baseline and 0.12em thick. No kerning
(fontTools doesn't shape text).
"""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen


def load(path, weight):
    font = instancer.instantiateVariableFont(TTFont(path), {'wght': weight})
    return font.getGlyphSet(), font.getBestCmap(), font['head'].unitsPerEm


DISPLAY = load('public/fonts/funnel-display-normal-latin.woff2', 700)
SANS = load('public/fonts/funnel-sans-normal-latin.woff2', 500)
EM = DISPLAY[2]
SPACING = -0.03 * EM
STOP, STOP_GAP = 0.14 * EM, 0.06 * EM
GAP, THICK = 0.075 * EM, 0.12 * EM
LINE_BOTTOM = -(GAP + THICK)
BADGE_SIZE = 0.62  # the address's size next to the mark, relative to the mark
BADGE_GAP = 0.32 * EM  # from the mark's underline end to the address
PAD = 0.04 * EM  # a hair of room so nothing touches the edge; clear space is a usage rule

AMBER = '#ffb020'
COLOURWAYS = {
    'on-dark': {'text': '#eceef2', 'lead': '#9599a6', 'line': AMBER},
    'on-light': {'text': '#111318', 'lead': '#5f636d', 'line': AMBER},
    'mono-dark': {'text': '#111318', 'lead': '#111318', 'line': '#111318'},
    'mono-white': {'text': '#ffffff', 'lead': '#ffffff', 'line': '#ffffff'},
}


class Art:
    """Shapes in font units (y up, baseline 0) and their bounds."""

    def __init__(self):
        self.parts, self.x0, self.x1, self.y0, self.y1 = [], 0, 0, LINE_BOTTOM, 0

    def grow(self, x0, y0, x1, y1):
        self.x0, self.y0 = min(self.x0, x0), min(self.y0, y0)
        self.x1, self.y1 = max(self.x1, x1), max(self.y1, y1)

    def text(self, s, x, colour, font=DISPLAY, size=1, y=0, spacing=SPACING):
        """Draws s from x on baseline y; returns the end x and the ink bounds."""
        glyphs, cmap, _ = font
        pen, bounds = SVGPathPen(glyphs), BoundsPen(glyphs)
        for ch in s:
            name = cmap[ord(ch)]
            m = (size, 0, 0, size, x, y)
            glyphs[name].draw(TransformPen(pen, m))
            glyphs[name].draw(TransformPen(bounds, m))
            x += glyphs[name].width * size + spacing * size
        self.parts.append(f'<path fill="{colour}" d="{pen.getCommands()}"/>')
        self.grow(*bounds.bounds)
        return x - spacing * size, bounds.bounds

    def rect(self, x, y, w, h, colour):
        self.parts.append(f'<rect fill="{colour}" x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}"/>')
        self.grow(x, y, x + w, y + h)

    def stop(self, x, colour):
        x += STOP_GAP
        self.rect(x, 0, STOP, STOP, colour)
        return x + STOP

    def underline(self, x0, x1, colour):
        self.rect(x0, LINE_BOTTOM, x1 - x0, THICK, colour)

    def group(self, scale=1, tx=0, ty=0, sx=None):
        """The shapes as an SVG group, the bounds' top-left at (tx, ty) in SVG units."""
        sx = scale if sx is None else sx
        return f'<g transform="translate({tx - self.x0 * sx:.2f} {ty + self.y1 * scale:.2f}) scale({sx:.5f} {-scale:.5f})">{"".join(self.parts)}</g>'

    def svg(self):
        w, h = self.x1 - self.x0 + 2 * PAD, self.y1 - self.y0 + 2 * PAD
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" role="img" aria-label="rebattle">'
                f'{self.group(1, PAD, PAD)}</svg>\n')


def full(c, app_suffix=False):
    a, x = Art(), 0
    space = DISPLAY[0][DISPLAY[1][ord(' ')]].width + SPACING
    for i, (text, colour) in enumerate([('drop', c['lead']), ('bounceback', c['lead']), ('rebattle', c['text'])]):
        start = x
        x, _ = a.text(text, x, colour)
        if text == 'rebattle':
            a.underline(start, x, c['line'])
            if app_suffix:  # don't: the address joined to the sentence
                x = a.stop(x, c['text'])
                a.text('app', x + STOP_GAP, c['lead'])
                break
        x = a.stop(x, colour)
        x += space if i < 2 else 0
    return a


def name(c, with_stop=False):
    a = Art()
    x, _ = a.text('rebattle', 0, c['text'])
    a.underline(0, x, c['line'])
    if with_stop:  # don't: the full stop belongs to the sentence
        a.stop(x, c['text'])
    return a


def mark(c, with_stop=False):
    a = Art()
    _, (x0, _, x1, _) = a.text('r', 0, c['text'])
    a.underline(x0, x1, c['line'])
    if with_stop:  # don't: "r." reads as an abbreviation
        a.stop(x1, c['text'])
    return a


def badge(c):
    """The mark, then rebattle.app in the text font, its x-height centred on the r's."""
    a = mark(c)
    glyphs, cmap, _ = SANS
    r_top, r_right = a.y1, a.x1
    pen = BoundsPen(glyphs)
    glyphs[cmap[ord('x')]].draw(pen)
    x_height = pen.bounds[3] * BADGE_SIZE
    a.text('rebattle.app', r_right + BADGE_GAP, c['text'], font=SANS, size=BADGE_SIZE, y=(r_top - x_height) / 2, spacing=0)
    return a


def address_as_logo(c):
    """Don't: rebattle.app in the logo font, with the square dot and the underline."""
    a = Art()
    x, _ = a.text('rebattle', 0, c['text'])
    x = a.stop(x, c['text'])
    x, _ = a.text('app', x + STOP_GAP, c['text'])
    a.underline(0, x, c['line'])
    return a


VERSIONS = {
    'full': lambda c: full(c),
    'name': lambda c: name(c),
    'mark': lambda c: mark(c),
    'badge': lambda c: badge(c),
}

os.makedirs('docs/brand/logos', exist_ok=True)
for version, build in VERSIONS.items():
    for colourway, colours in COLOURWAYS.items():
        open(f'docs/brand/logos/{version}-{colourway}.svg', 'w').write(build(colours).svg())


# ---- usage sheet: do's and don'ts --------------------------------------------------

W, TILE_W, TILE_H, BOX_H, GUTTER, HEAD = 1200, 580, 240, 190, 40, 70
LABEL = 'font-family="Helvetica, Arial, sans-serif"'
DEFS = (
    '<linearGradient id="photo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a6f97"/><stop offset="0.6" stop-color="#0b3c5d"/><stop offset="1" stop-color="#1d2d44"/></linearGradient>'
    '<linearGradient id="busy" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a8f99"/><stop offset="0.5" stop-color="#c9b38a"/><stop offset="1" stop-color="#6d7a8c"/></linearGradient>'
    f'<clipPath id="tile"><rect width="{TILE_W}" height="{BOX_H}" rx="10"/></clipPath>'
)
DARK, LIGHT = COLOURWAYS['on-dark'], COLOURWAYS['on-light']


def fit(art, box_w, max_w, max_h, stretch=1, box_h=BOX_H):
    """Centres art in a box, scaled to fit max_w x max_h (stretch: widen it, for the don't)."""
    w, h = art.x1 - art.x0, art.y1 - art.y0
    s = min(max_w / (w * stretch), max_h / h)
    return art.group(s, (box_w - w * s * stretch) / 2, (box_h - h * s) / 2, sx=s * stretch)


def avatar(art):
    r = 78
    return f'<circle cx="{TILE_W / 2}" cy="{BOX_H / 2}" r="{r}" fill="#111318"/><g transform="translate({TILE_W / 2 - r} {BOX_H / 2 - r})">{fit(art, 2 * r, 2 * r * 0.4, 2 * r * 0.62, box_h=2 * r)}</g>'


def half_and_half(left, right):
    return fit(left, TILE_W / 2, 220, 80) + f'<g transform="translate({TILE_W / 2} 0)">{fit(right, TILE_W / 2, 140, 100)}</g>'


DOS = [
    ('The full logo, with clear space around it', '#111318', lambda: fit(full(DARK), TILE_W, 460, 60)),
    ('The badge: where to find us, when there is no QR code', '#f6f5f2', lambda: fit(badge(LIGHT), TILE_W, 380, 70)),
    ('The name, where the sentence is too long', '#f6f5f2', lambda: fit(name(LIGHT), TILE_W, 300, 90)),
    ('The mark as an avatar or icon', '#ffffff', lambda: avatar(mark(DARK))),
    ('One colour (white) on a photo', 'url(#photo)', lambda: fit(full(COLOURWAYS['mono-white']), TILE_W, 460, 60)),
    ('One colour (dark) for single-colour print', '#ffffff', lambda: fit(full(COLOURWAYS['mono-dark']), TILE_W, 460, 60)),
]
DONTS = [
    ('The address set as a logo (logo font, square dot, underline)', '#111318', lambda: fit(address_as_logo(DARK), TILE_W, 360, 80)),
    ('The address joined to the sentence', '#111318', lambda: fit(full(DARK, app_suffix=True), TILE_W, 500, 60)),
    ('A full stop on the name or the mark', '#f6f5f2', lambda: half_and_half(name(LIGHT, with_stop=True), mark(LIGHT, with_stop=True))),
    ('The underline in another colour', '#111318', lambda: fit(full({**DARK, 'line': '#e0457b'}), TILE_W, 460, 60)),
    ('Stretched or squashed', '#f6f5f2', lambda: fit(full(LIGHT), TILE_W, 530, 50, stretch=1.45)),
    ('Full colour on a busy or mid-tone background', 'url(#busy)', lambda: fit(full(LIGHT), TILE_W, 460, 60)),
]


def tile(x, y, ok, label, bg, art):
    colour, sign = ('#17713f', '&#10003;') if ok else ('#c23737', '&#10007;')
    return (f'<g transform="translate({x} {y})"><g clip-path="url(#tile)"><rect width="{TILE_W}" height="{BOX_H}" fill="{bg}"/>{art()}</g>'
            f'<rect width="{TILE_W}" height="{BOX_H}" rx="10" fill="none" stroke="#dcd9d1"/>'
            f'<text x="0" y="{BOX_H + 28}" {LABEL} font-size="17" fill="#15171c"><tspan fill="{colour}" font-weight="700">{sign} </tspan>{label}</text></g>')


height = HEAD + len(DOS) * (TILE_H + GUTTER)
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {height}" width="{W}" role="img" aria-label="rebattle logo: do and don&#8217;t">',
       f'<defs>{DEFS}</defs><rect width="{W}" height="{height}" fill="#ffffff"/>',
       f'<text x="0" y="42" {LABEL} font-size="26" font-weight="700" fill="#17713f">Do</text>',
       f'<text x="{TILE_W + GUTTER}" y="42" {LABEL} font-size="26" font-weight="700" fill="#c23737">Don&#8217;t</text>']
for col, (ok, tiles) in enumerate([(True, DOS), (False, DONTS)]):
    for row, (label, bg, art) in enumerate(tiles):
        out.append(tile(col * (TILE_W + GUTTER), HEAD + row * (TILE_H + GUTTER), ok, label, bg, art))
out.append('</svg>\n')
open('docs/brand/logo-usage.svg', 'w').write(''.join(out))
