"""Builds "How the logo is made": construction diagrams of the logo, step by step.

Run from the repo root, after tools/make-logo.py (it runs that script first to get its geometry,
which rewrites the same files):  python3 tools/make-logo-story.py
Writes to public/brand/how/:
- 1-letter.svg, 2-drop.svg, 3-bounce.svg, 4-mark.svg  one step of the mark each (560x640)
- 5-logo.svg  the whole logo with callouts (2340x450)
- sheet.svg   all of it on one page with titles and captions (2460x1640); sheet.png is its
  headless-Chrome screenshot, for social media
Everything is drawn from the logo's own outlines (logo_r() in make-logo.py), so the diagrams can't
drift from the logo, and all text is outlines too, so the files look the same without the fonts.
The captions are also on the brand page (public/js/ui/brand.js, STORY): keep them in step.
"""
import os
import re
import runpy

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen

L = runpy.run_path('tools/make-logo.py')
Art, DISPLAY, SANS, EM = L['Art'], L['DISPLAY'], L['SANS'], L['EM']
GAP, THICK, DROP, BOUNCE, STOP, LB = L['GAP'], L['THICK'], L['DROP'], L['BOUNCE'], L['STOP'], L['LINE_BOTTOM']
glyphs, cmap, _ = DISPLAY

INK, MUTED, GUIDE, MEAS, AMBER, PAGE, CARD = '#15171c', '#5f636d', '#b9bcc4', '#6a45d1', '#ffb020', '#f6f5f2', '#ffffff'
OUT = 'public/brand/how'

# ---- the geometry, as logo_r() finds it --------------------------------------------------

r_pen = RecordingPen()
glyphs[cmap[ord('r')]].draw(r_pen)
points = [p for _, args in r_pen.value for p in args]
S0, S1 = sorted(x for x, y in points if y == 0)  # the stem's foot
A0, A1 = sorted(y for x, y in points if x == max(p[0] for p in points))  # the arm's end
AM = (A0 + A1) / 2  # the arm's centre line
HALF = (S1 - S0) / 2
TIP = ((S0 + S1) / 2, -DROP)  # the drop's tip
bounds = BoundsPen(glyphs)
L['LOGO_R'].replay(bounds)
LEFT, BTIP_X = bounds.bounds[0], bounds.bounds[2]  # the mark's underline runs between these
E_DX = glyphs[cmap[ord('r')]].width + L['SPACING']  # where the e follows the r in "rebattle"


def outline(draw):
    pen = SVGPathPen(glyphs)
    draw(pen)
    return pen.getCommands()


R_PLAIN = outline(glyphs[cmap[ord('r')]].draw)
R_LOGO = outline(L['LOGO_R'].replay)
E_ALL = outline(glyphs[cmap[ord('e')]].draw)
E_OUTER = 'M' + E_ALL.split('M')[1]  # the e's outer contour (its first), the side that faces the r

# ---- drawing in font units: y up, the baseline at 0 ---------------------------------------
# A panel is PW x PH px; font units map to it with scale S, x 0 at OX and the baseline at BASE.

S, PW, PH, OX, BASE = 0.52, 560, 640, 70, 470
U = 1 / S  # one px in font units


def shape(d, fill='none', stroke=INK, width=1.6, extra=''):
    stroke_attrs = f' stroke="{stroke}" stroke-width="{width}" stroke-linejoin="round" vector-effect="non-scaling-stroke"' if stroke != 'none' else ''
    return f'<path d="{d}" fill="{fill}"{stroke_attrs} {extra}/>'


def line(x0, y0, x1, y1, colour=GUIDE, dash=True, width=1.2):
    da = f' stroke-dasharray="{6 * U:.1f} {5 * U:.1f}"' if dash else ''
    return f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{x1:.1f}" y2="{y1:.1f}" stroke="{colour}" stroke-width="{width}" vector-effect="non-scaling-stroke"{da}/>'


def words(s, size, font=SANS):
    """s as outlines at size (font units per em) from x 0 on baseline 0; returns (svg, width)."""
    a = Art()
    end, _ = a.text(s, 0, '{c}', font=font, size=size / EM, spacing=0)
    return ''.join(a.parts), end


def label(s, x, y, px, colour=MEAS, anchor='start', font=SANS):
    """a label px tall (em) in a panel, its baseline at font units (x, y)"""
    svg, w = words(s, px * U, font)
    dx = {'start': 0, 'middle': w / 2, 'end': w}[anchor]
    return f'<g transform="translate({x - dx:.1f} {y:.1f})">{svg.replace("{c}", colour)}</g>'


def ruler(x, y0, y1, parts, labels=()):
    """a measure at x from y0 to y1, ticked into parts; labels: (from, to, text) in parts"""
    out = [line(x, y0, x, y1, MEAS, False, 1.4)]
    step = (y1 - y0) / parts
    out += [line(x - 13 * U, y0 + i * step, x + 13 * U, y0 + i * step, MEAS, False, 1.4) for i in range(parts + 1)]
    out += [label(text, x + 24 * U, y0 + (a + b) / 2 * step - 6 * U, 17) for a, b, text in labels]
    return ''.join(out)


def guides(x0=-110, x1=900):
    """the baseline and where the underline goes"""
    return (line(x0, 0, x1, 0) + line(x0, -GAP, x1, -GAP) + line(x0, LB, x1, LB)
            + label('baseline', x0, 10 * U, 13, MUTED))


def units(content):
    return f'<g transform="translate({OX} {BASE}) scale({S} {-S})">{content}</g>'


def px(x, y):
    return OX + x * S, BASE - y * S


# 1 the letter: the font's own r, and where the underline will sit
step1 = units(guides() + line(S0, 660, S0, -70) + line(S1, 660, S1, -70) + shape(R_PLAIN)
              + ruler(640, 0, LB, 1) + label('the underline', 680, -GAP - 30 * U, 15) + label('goes here', 680, -GAP - 52 * U, 15))

# 2 the drop: half a square below the stem, its tip 1 of the 4 parts down
square = [(S0, HALF - DROP), (TIP[0], 2 * HALF - DROP), (S1, HALF - DROP), TIP]
poly = lambda pts: ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
drop_shape = (guides() + shape(R_LOGO)
              + f'<polygon points="{poly([square[0], square[2], square[3]])}" fill="{MEAS}" fill-opacity="0.18"/>'
              + f'<polygon points="{poly(square)}" fill="none" stroke="{MEAS}" stroke-width="1.2" vector-effect="non-scaling-stroke" stroke-dasharray="{5 * U:.1f} {4 * U:.1f}"/>'
              + ruler(S1 + 40, 0, -GAP, 4))
ZOOM, LENS_R, LENS = 2.3, 100, (436, 168)  # the magnifier: a close-up of the tip and the ruler
tip_px = px((TIP[0] + S1 + 40) / 2, -GAP / 2)
lens_shift = f'translate({LENS[0]} {LENS[1]}) scale({ZOOM}) translate({-tip_px[0]:.1f} {-tip_px[1]:.1f})'
step2 = (f'<defs><clipPath id="lens"><circle cx="{LENS[0]}" cy="{LENS[1]}" r="{LENS_R}"/></clipPath></defs>'
         + units(drop_shape)
         + f'<line x1="{tip_px[0]:.1f}" y1="{tip_px[1]:.1f}" x2="{LENS[0] - LENS_R * 0.7:.1f}" y2="{LENS[1] + LENS_R * 0.7:.1f}" stroke="{MEAS}" stroke-width="1"/>'
         + f'<circle cx="{tip_px[0]:.1f}" cy="{tip_px[1]:.1f}" r="{LENS_R / ZOOM:.1f}" fill="none" stroke="{MEAS}" stroke-width="1"/>'
         + f'<g clip-path="url(#lens)"><circle cx="{LENS[0]}" cy="{LENS[1]}" r="{LENS_R}" fill="{CARD}"/><g transform="{lens_shift}">{units(drop_shape)}</g></g>'
         + f'<circle cx="{LENS[0]}" cy="{LENS[1]}" r="{LENS_R}" fill="none" stroke="{MEAS}" stroke-width="1.4"/>')
# the 1 and the 3, next to the ruler inside the lens (px, y down)
rx = LENS[0] + ((S1 + 40) * S + OX - tip_px[0]) * ZOOM
ry = lambda part: LENS[1] + (BASE + GAP * part / 4 * S - tip_px[1]) * ZOOM
for text, a, b in (('1', 0, 1), ('3', 1, 4)):
    svg, w = words(text, 20 * U, SANS)
    step2 += f'<g transform="translate({rx - 22 - w * S:.1f} {(ry(a) + ry(b)) / 2 + 7:.1f}) scale({S} {-S})">{svg.replace("{c}", MEAS)}</g>'  # left of the ruler

# 3 the bounce: the arm's point follows the e, 3 parts away, mirrored about the arm's centre line
e_at = f'transform="translate({E_DX} 0)"'
step3 = units(line(-110, AM, 1000, AM, MEAS)
              + f'<clipPath id="facing"><rect x="-200" y="-400" width="370" height="1400"/></clipPath>'  # the e's side facing the r (in the e's own units)
              + f'<path d="{E_OUTER}" fill="none" stroke="{MEAS}" stroke-opacity="0.16" stroke-width="{2 * BOUNCE}" stroke-linejoin="round" clip-path="url(#facing)" {e_at}/>'
              + f'<path d="{E_OUTER}" fill="{CARD}" {e_at}/>'  # covers the band's inner half, holes included
              + f'<g {e_at}>{shape(E_ALL, stroke=GUIDE, width=1.4)}</g>'
              + shape(R_LOGO)
              + line(BTIP_X, AM + 60, BTIP_X + BOUNCE, AM + 60, MEAS, False, 1.4)
              + line(BTIP_X, AM + 40, BTIP_X, AM + 80, MEAS, False, 1.4)
              + line(BTIP_X + BOUNCE, AM + 40, BTIP_X + BOUNCE, AM + 80, MEAS, False, 1.4)
              + label('3', BTIP_X + BOUNCE / 2, AM + 100, 17, anchor='middle'))

# 4 the mark: filled, the underline from the letter's left edge to the bounce's tip
step4 = units(line(LEFT, 700, LEFT, LB - 70) + line(BTIP_X, 700, BTIP_X, LB - 70)
              + shape(R_LOGO, INK, 'none')
              + f'<rect x="{LEFT:.1f}" y="{LB}" width="{BTIP_X - LEFT:.1f}" height="{THICK}" fill="{AMBER}"/>'
              + ruler(640, 0, -GAP, 4, [(0, 4, '4 parts')]) + ruler(640, -GAP, LB, 1))

STEPS = [
    ('1-letter', 'The letter', 'Funnel Display Bold’s own “r”. The underline will sit below the baseline.', step1),
    ('2-drop', 'The drop', 'The stem ends in half a square, pointing down. Its tip takes 1 of the 4 parts between the baseline and the underline.', step2),
    ('3-bounce', 'The bounce', 'The arm ends in a point that follows the “e”, 3 parts away: the gap the drop leaves, used twice. Mirrored about the arm’s centre line.', step3),
    ('4-mark', 'The mark', 'The underline runs from the letter’s left edge to the bounce’s tip. One letter: drop, then bounce back.', step4),
]


def panel_svg(content, prefix=''):
    for name in ('lens', 'facing'):  # unique ids when several panels share the sheet
        content = content.replace(f'id="{name}"', f'id="{prefix}{name}"').replace(f'url(#{name})', f'url(#{prefix}{name})')
    return f'<rect width="{PW}" height="{PH}" rx="14" fill="{CARD}" stroke="#dcd9d1"/><svg width="{PW}" height="{PH}" overflow="hidden">{content}</svg>'


# ---- the logo, with callouts (px, y down) ------------------------------------------------

LOGO_W, LOGO_H = 2340, 450
logo = L['full']({'text': INK, 'lead': MUTED, 'line': AMBER})
LS = 2040 / (logo.x1 - logo.x0)
LX, LBASE = (LOGO_W - (logo.x1 - logo.x0) * LS) / 2, 120 + logo.y1 * LS
rects = [tuple(float(v) for v in m.groups()) for _, d in logo.paths if (m := re.match(r'M(-?[\d.]+) (-?[\d.]+)H(-?[\d.]+)V(-?[\d.]+)H', d))]
stops = [(x, y) for x, y, x1, y1 in rects if abs(x1 - x - STOP) < 1]
ux, _, ux1, _ = next(r for r in rects if abs(r[3] - r[1] - THICK) < 1)


def lpx(x, y):
    return LX + (x - logo.x0) * LS, LBASE - y * LS


def text_px(s, x, y, px, colour, anchor='start', font=SANS):
    """text px tall (em), baseline at px (x, y), y down"""
    svg, w = words(s, EM, font)
    k = px / EM
    dx = {'start': 0, 'middle': w * k / 2, 'end': w * k}[anchor]
    return f'<g transform="translate({x - dx:.1f} {y:.1f}) scale({k:.5f} {-k:.5f})">{svg.replace("{c}", colour)}</g>'


def callout(x, y, tx, ty, lines, anchor='start'):
    a, b = lpx(x, y)
    nudge = 10 if anchor == 'start' else -10
    out = [f'<circle cx="{a:.1f}" cy="{b:.1f}" r="5" fill="{MEAS}"/>',
           f'<polyline points="{a:.1f},{b:.1f} {a:.1f},{ty:.1f} {tx:.1f},{ty:.1f}" fill="none" stroke="{MEAS}" stroke-width="1.4"/>']
    for i, (text, colour) in enumerate(lines):
        out.append(text_px(text, tx + nudge, ty + 8 + i * 30, 22, colour, anchor))
    return ''.join(out)


s_px = STOP * LS
logo_inner = (f'<g transform="translate({LX - logo.x0 * LS:.2f} {LBASE:.2f}) scale({LS:.5f} {-LS:.5f})">{"".join(logo.parts)}</g>'
              + ''.join(f'<rect x="{lpx(x, STOP)[0] - 7:.1f}" y="{lpx(x, STOP)[1] - 7:.1f}" width="{s_px + 14:.1f}" height="{s_px + 14:.1f}" fill="none" stroke="{MEAS}" stroke-width="1.4" stroke-dasharray="5 4"/>' for x, _ in stops)
              + callout(stops[0][0] + STOP / 2, STOP + 90, lpx(stops[1][0], 0)[0] - 160, 70, [('Square full stops', MEAS), ('the sentence’s punctuation, only in the full logo', MUTED)])
              + callout(ux + TIP[0], TIP[1], lpx(ux, 0)[0] - 150, LBASE + 120, [('The same “r”', MEAS), ('the mark, set in the name', MUTED)], 'end')
              + callout(ux + (ux1 - ux) * 0.45, LB, lpx(ux + (ux1 - ux) * 0.45, 0)[0] + 50, LBASE + 120, [('The underline, drawn at reading pace', MEAS), ('waits 1.1 s, then draws in 0.75 s', MUTED)]))

# ---- the sheet -------------------------------------------------------------------------

SHEET_W, ROW, CAP = 2460, 190, 22


def wrap(text, width, px):
    lines, line_ = [], ''
    for w in text.split():
        trial = f'{line_} {w}'.strip()
        if words(trial, EM)[1] * px / EM > width and line_:
            lines.append(line_)
            line_ = w
        else:
            line_ = trial
    return lines + [line_]


def sheet():
    out = [f'<rect width="{SHEET_W}" height="1640" fill="{PAGE}"/>',
           text_px('The mark', 60, 120, 56, INK, font=DISPLAY),
           text_px('1 part = a quarter of the gap from the baseline to the underline', SHEET_W - 60, 118, 22, MEAS, 'end')]
    for i, (name, title, caption, content) in enumerate(STEPS):
        x = 60 + i * (PW + 40)
        out.append(f'<g transform="translate({x} {ROW})">{panel_svg(content, name + "-")}')
        out.append(text_px(f'{i + 1}. {title}', 0, PH + 50, 30, INK, font=DISPLAY))
        out += [text_px(t, 0, PH + 92 + k * 30, CAP, MUTED) for k, t in enumerate(wrap(caption, PW - 20, CAP))]
        out.append('</g>')
    out.append(text_px('The logo', 60, 1120, 56, INK, font=DISPLAY))
    out.append(f'<g transform="translate({(SHEET_W - LOGO_W) / 2} 1130)">{logo_inner}</g>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SHEET_W} 1640" width="{SHEET_W}" height="1640" role="img" aria-label="How the rebattle logo is made">{"".join(out)}</svg>\n'


os.makedirs(OUT, exist_ok=True)
for name, title, _, content in STEPS:
    open(f'{OUT}/{name}.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {PW} {PH}" width="{PW}" height="{PH}" role="img" aria-label="{title}">{panel_svg(content)}</svg>\n')
open(f'{OUT}/5-logo.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {LOGO_W} {LOGO_H}" width="{LOGO_W}" height="{LOGO_H}" role="img" aria-label="The logo">'
                                     f'<rect width="{LOGO_W}" height="{LOGO_H}" rx="14" fill="{CARD}" stroke="#dcd9d1"/>{logo_inner}</svg>\n')
open(f'{OUT}/sheet.svg', 'w').write(sheet())
