"""Builds the logo set and its usage sheet from the bundled fonts.

Run from the repo root:  pip install fonttools brotli && python3 tools/make-logo.py
Writes:
- public/brand/logos/<version>-<colourway>.svg  (4 versions x 4 colourways), outlines on a
  transparent background, so they don't depend on fonts on the viewer's machine. The PNGs next to
  them are headless-Chrome screenshots of these SVGs (see docs/brand.md). Served for the /brand page.
- public/brand/logo-usage.svg  do's and don'ts, shown in docs/brand.md and on /brand.
- public/js/ui/logo-outlines.js  the full, name and mark outlines for the app and the video.
- public/brand/share-preview.svg  the link preview (1200x630); public/icons/share-preview.png is its
  headless-Chrome screenshot.
- public/brand/instagram/video-cover.svg  the cover for a Reel or Story (1080x1920); the .png next to
  it is its screenshot.
Then tools/make-icons.py, the PNG screenshots, and tools/make-brand-kit.py for the zip.

Versions (docs/brand.md has when to use which):
  full      "drop. bounceback. rebattle."  square full stops (the sentence's punctuation), underline under "rebattle"
  name      "rebattle"                     underline, no full stop
  mark      "r"                            underline from the letter's left edge to its right (the bounce's tip)
  badge     the mark next to "rebattle.app": the one fixed "where to find us" element
  The address "rebattle.app" is text, not logo: Funnel Sans, a round dot, no underline, the logo's text colour.
Colourways (named by the background they go on):
  on-dark, on-light      full colour: text, muted "drop. bounceback.", amber underline
  mono-dark, mono-white  one colour for everything, underline included

Same rules as the app's logo (public/styles.css, .brand): letter-spacing -0.03em, square stops
0.14em with a 0.06em gap, underline 0.075em below the baseline and 0.12em thick. No kerning
(fontTools doesn't shape text).

The "r" of "rebattle" (and the mark) is the logo's own: the drop and the bounce, see logo_r().
"""
import json
import os
import re
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.basePen import BasePen
from fontTools.pens.recordingPen import RecordingPen
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
DROP = GAP / 4  # the r's stem tip, below the baseline (see logo_r)
BOUNCE = GAP - DROP  # the gap from that tip to the underline, and from the arm's point to the e
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


class Flat(BasePen):
    """The contours of a glyph as lists of points, curves flattened."""

    def __init__(self, glyphs, dx=0):
        super().__init__(glyphs)
        self.contours, self.dx = [], dx

    def _moveTo(self, p):
        self.contours.append([(p[0] + self.dx, p[1])])

    def _lineTo(self, p):
        self.contours[-1].append((p[0] + self.dx, p[1]))

    def _qCurveToOne(self, c, p):
        x0, y0 = self._getCurrentPoint()
        for i in range(1, 51):
            t = i / 50
            self._lineTo(((1 - t) ** 2 * x0 + 2 * t * (1 - t) * c[0] + t * t * p[0], (1 - t) ** 2 * y0 + 2 * t * (1 - t) * c[1] + t * t * p[1]))

    def _curveToOne(self, c1, c2, p):
        x0, y0 = self._getCurrentPoint()
        for i in range(1, 51):
            t, u = i / 50, 1 - i / 50
            self._lineTo((u ** 3 * x0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p[0], u ** 3 * y0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p[1]))


def logo_r():
    """The logo's "r": a drop and a bounce. Funnel Display Bold's r with two points:
    - the drop: the stem ends in half a square pointing down (as long as half the stem's width),
      its tip DROP below the baseline, so the gap left to the underline is BOUNCE;
    - the bounce: the arm ends in a point whose sides follow the e's outline at the same gap,
      BOUNCE (lower side), mirrored about the arm's centre line (upper side).
    Returns the outline as a RecordingPen; the advance width stays the r's."""
    glyphs, cmap, _ = DISPLAY
    r = RecordingPen()
    glyphs[cmap[ord('r')]].draw(r)
    points = [p for _, args in r.value for p in args]
    s0, s1 = sorted(x for x, y in points if y == 0)  # the stem's foot
    arm = sorted((y, x) for x, y in points if x == max(p[0] for p in points))  # the arm's end
    (a0, ax), (a1, _) = arm
    am, half = (a0 + a1) / 2, (s1 - s0) / 2

    # The e's outer outline where it faces the arm, set where it follows the r in "rebattle".
    e = Flat(glyphs, glyphs[cmap[ord('r')]].width + SPACING)
    glyphs[cmap[ord('e')]].draw(e)
    side = sorted((p for p in e.contours[0] if a0 - 100 < p[1] < a1 + 120 and p[0] < ax + 320), key=lambda p: p[1])
    moved = []  # moved out, away from the e, by BOUNCE
    for k, (x, y) in enumerate(side):
        (xa, ya), (xb, yb) = side[max(0, k - 1)], side[min(len(side) - 1, k + 1)]
        length = ((xb - xa) ** 2 + (yb - ya) ** 2) ** 0.5 or 1
        moved.append((x - (yb - ya) / length * BOUNCE, y + (xb - xa) / length * BOUNCE))

    def at(yy):
        for (px, py), (x, y) in zip(moved, moved[1:]):
            if py <= yy <= y:
                return (px + (yy - py) / (y - py) * (x - px), yy)

    lower = [at(a0)] + [p for p in moved if a0 < p[1] < am] + [at(am)]
    upper = [(x, 2 * am - y) for x, y in reversed(lower[:-1])]
    bounce = [(round(x, 1), round(y, 1)) for x, y in reversed(lower + upper)]  # top to tip to bottom
    assert bounce[0][0] < ax, 'the bounce starts inside the arm'

    out = RecordingPen()
    for op, args in r.value:
        if op == 'moveTo':
            out.moveTo((s0, half - DROP))
        elif op == 'lineTo' and args[0] == (ax, a1):
            for p in bounce:
                out.lineTo(p)
        elif op == 'lineTo' and args[0] == (ax, a0):
            pass
        elif op == 'lineTo' and args[0] == (s1, 0):
            out.lineTo((s1, half - DROP))
            out.lineTo(((s0 + s1) / 2, -DROP))
        else:
            getattr(out, op)(*args)
    return out


LOGO_R = logo_r()


class Art:
    """Shapes in font units (y up, baseline 0) and their bounds."""

    def __init__(self):
        self.parts, self.x0, self.x1, self.y0, self.y1 = [], 0, 0, LINE_BOTTOM, 0
        self.paths = []  # (colour, d) for every shape, rectangles as paths too: for outlines()

    def grow(self, x0, y0, x1, y1):
        self.x0, self.y0 = min(self.x0, x0), min(self.y0, y0)
        self.x1, self.y1 = max(self.x1, x1), max(self.y1, y1)

    def text(self, s, x, colour, font=DISPLAY, size=1, y=0, spacing=SPACING, logo_r=False):
        """Draws s from x on baseline y (logo_r: its first letter is the logo's r); returns the
        end x and the ink bounds."""
        glyphs, cmap, _ = font
        pen, bounds = SVGPathPen(glyphs), BoundsPen(glyphs)
        for i, ch in enumerate(s):
            name = cmap[ord(ch)]
            m = (size, 0, 0, size, x, y)
            draw = LOGO_R.replay if logo_r and i == 0 else glyphs[name].draw
            draw(TransformPen(pen, m))
            draw(TransformPen(bounds, m))
            x += glyphs[name].width * size + spacing * size
        self.parts.append(f'<path fill="{colour}" d="{pen.getCommands()}"/>')
        self.paths.append((colour, pen.getCommands()))
        self.grow(*bounds.bounds)
        return x - spacing * size, bounds.bounds

    def rect(self, x, y, w, h, colour):
        self.parts.append(f'<rect fill="{colour}" x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}"/>')
        self.paths.append((colour, f'M{x:.1f} {y:.1f}H{x + w:.1f}V{y + h:.1f}H{x:.1f}Z'))
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
        x, _ = a.text(text, x, colour, logo_r=text == 'rebattle')
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
    x, _ = a.text('rebattle', 0, c['text'], logo_r=True)
    a.underline(0, x, c['line'])
    if with_stop:  # don't: the full stop belongs to the sentence
        a.stop(x, c['text'])
    return a


def mark(c, with_stop=False):
    a = Art()
    _, (x0, _, x1, _) = a.text('r', 0, c['text'], logo_r=True)
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
    x, _ = a.text('rebattle', 0, c['text'], logo_r=True)
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

os.makedirs('public/brand/logos', exist_ok=True)
for version, build in VERSIONS.items():
    for colourway, colours in COLOURWAYS.items():
        open(f'public/brand/logos/{version}-{colourway}.svg', 'w').write(build(colours).svg())


def outlines(art):
    """The shapes for the app and the video: the box [x, y, width, height] with y down (the
    shapes are y up, so draw them flipped), and one path per role (text, lead, line)."""
    parts = {}
    for role, d in art.paths:
        parts[role] = parts.get(role, '') + re.sub(r'-?\d+\.\d+', lambda m: f'{float(m[0]):.1f}'.replace('.0', ''), d)
    box = [round(v, 1) for v in (art.x0, -art.y1, art.x1 - art.x0, art.y1 - art.y0)]
    return {'box': box, 'parts': parts}


ROLES = {'text': 'text', 'lead': 'lead', 'line': 'line'}  # a "colourway" naming each shape's role
LOGO = {version: outlines(VERSIONS[version](ROLES)) for version in ('full', 'name', 'mark')}
LOGO_JS = re.sub(r'\[\s+([^]]+?)\s+]', lambda m: '[' + re.sub(r'\s+', ' ', m[1]) + ']', json.dumps(LOGO, indent=2))  # boxes on one line
open('public/js/ui/logo-outlines.js', 'w').write(
    '// The logo as outlines, for the app (ui/html.js) and the replay video (replay/draw.js).\n'
    '// Generated by tools/make-logo.py from the bundled font and the logo\'s "r"; don\'t edit.\n'
    '// Font units (1200 per em), shapes y up with the baseline at 0: draw them flipped. box is\n'
    '// [x, y, width, height] with y down; parts holds one path per role: text, lead (the muted\n'
    '// "drop. bounceback.") and line (the underline).\n'
    f'export const EM = {EM};\n'
    f'export const LOGO = {LOGO_JS};\n')


# ---- link preview: what LinkedIn, WhatsApp & co. show for a shared link ------------------------

PREVIEW_W, PREVIEW_H = 1200, 630  # the Open Graph size; platforms crop little of it
TAGLINE = 'Double-elimination brackets, run from your phone.'


def preview():
    """The full logo on the dark background, the tagline under it and the address at the bottom,
    all as outlines (public/brand/share-preview.svg; public/icons/share-preview.png is its screenshot)."""
    c = COLOURWAYS['on-dark']
    logo, line = full(c), Art()
    line.text(TAGLINE, 0, c['lead'], font=SANS, spacing=0)
    address = Art()
    address.text('rebattle.app', 0, c['text'], font=SANS, spacing=0)
    s = 960 / (logo.x1 - logo.x0)
    ts = 0.46 * s  # the tagline at a bit under half the logo's size
    logo_h, line_h = (logo.y1 - logo.y0) * s, (line.y1 - line.y0) * ts
    top = (PREVIEW_H - logo_h - 70 - line_h) / 2 - 20
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {PREVIEW_W} {PREVIEW_H}" width="{PREVIEW_W}" height="{PREVIEW_H}" role="img" aria-label="rebattle: {TAGLINE}">'
            f'<rect width="{PREVIEW_W}" height="{PREVIEW_H}" fill="#111318"/>'
            f'{logo.group(s, (PREVIEW_W - (logo.x1 - logo.x0) * s) / 2, top)}'
            f'{line.group(ts, (PREVIEW_W - (line.x1 - line.x0) * ts) / 2, top + logo_h + 70)}'
            f'{address.group(ts * 0.8, (PREVIEW_W - (address.x1 - address.x0) * ts * 0.8) / 2, PREVIEW_H - 70 - (address.y1 - address.y0) * ts * 0.8)}'
            '</svg>\n')


open('public/brand/share-preview.svg', 'w').write(preview())


# ---- video cover: the picked cover of a Reel or Story, for any contest --------------------

COVER_W, COVER_H = 1080, 1920


def video_cover():
    """The full logo dead centre (it survives the 4:5 and square crops of a profile grid) and the
    address at the bottom, as outlines (public/brand/instagram/video-cover.svg; .png is its screenshot)."""
    c = COLOURWAYS['on-dark']
    logo, address = full(c), Art()
    address.text('rebattle.app', 0, c['text'], font=SANS, spacing=0)
    s, k = 900 / (logo.x1 - logo.x0), 54 / EM  # the address 54 px to the em
    logo_h = (logo.y1 - logo.y0) * s
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {COVER_W} {COVER_H}" width="{COVER_W}" height="{COVER_H}" role="img" aria-label="drop. bounceback. rebattle. rebattle.app">'
            f'<rect width="{COVER_W}" height="{COVER_H}" fill="#111318"/>'
            f'{logo.group(s, (COVER_W - (logo.x1 - logo.x0) * s) / 2, (COVER_H - logo_h) / 2)}'
            f'{address.group(k, (COVER_W - (address.x1 - address.x0) * k) / 2, COVER_H - 180 - address.y1 * k)}'
            '</svg>\n')


open('public/brand/instagram/video-cover.svg', 'w').write(video_cover())


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
    """The mark in a round crop: the letter (its top to the baseline) centred, the underline below."""
    r = 78
    s = min(2 * r * 0.4 / (art.x1 - art.x0), 2 * r * 0.62 / (art.y1 - art.y0))  # as fit() scales it
    dy = (art.y1 - art.y0) * s / 2 - art.y1 * s / 2  # fit() centres the whole mark; move the letter's centre there
    return f'<circle cx="{TILE_W / 2}" cy="{BOX_H / 2}" r="{r}" fill="#111318"/><g transform="translate({TILE_W / 2 - r} {BOX_H / 2 - r + dy:.2f})">{fit(art, 2 * r, 2 * r * 0.4, 2 * r * 0.62, box_h=2 * r)}</g>'


def half_and_half(left, right):
    return fit(left, TILE_W / 2, 220, 80) + f'<g transform="translate({TILE_W / 2} 0)">{fit(right, TILE_W / 2, 140, 100)}</g>'


DOS = [
    ('The full logo, with clear space around it', '#111318', lambda: fit(full(DARK), TILE_W, 460, 60)),
    ('The badge: where to find us, when there is no QR code', '#f6f5f2', lambda: fit(badge(LIGHT), TILE_W, 380, 70)),
    ('The name, where the sentence is too long', '#f6f5f2', lambda: fit(name(LIGHT), TILE_W, 300, 90)),
    ('The mark as an avatar: the letter centred, the underline below', '#ffffff', lambda: avatar(mark(DARK))),
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
open('public/brand/logo-usage.svg', 'w').write(''.join(out))
