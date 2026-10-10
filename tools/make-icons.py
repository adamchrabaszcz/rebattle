"""Builds the rebattle icons from the "r" in Funnel Display Bold.

Run from the repo root:  pip install fonttools brotli && python3 tools/make-icons.py
Writes public/icons/favicon.svg and public/icons/touch-icon.svg, and prints the inline mark used in
public/js/ui.js (R_MARK). The PNGs (favicon-32, apple-touch-icon, icon-512) are screenshots of
those SVGs at 32/180/512 px.
"""
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen

font = instancer.instantiateVariableFont(TTFont('public/fonts/funnel-display-normal-latin.woff2'), {'wght': 700})
glyphs = font.getGlyphSet()
pen = SVGPathPen(glyphs)
glyphs[font.getBestCmap()[ord('r')]].draw(pen)
path = pen.getCommands()
# Ink bounds of that "r" (font units, 1200/em); the underline spans exactly X0..X1.
X0,X1,TOP=36,490,607.2
GAP,TH=90,144          # underline: 0.075em below the baseline, 0.12em thick (same thickness as the logo)
H=TOP+GAP+TH
def svg(size=64, rounded=True, fill_frac=0.6):
    s=size*fill_frac/H
    ty=(size-size*fill_frac)/2 + TOP*s
    tx=size/2-(X0+X1)/2*s
    rect=f'<rect width="{size}" height="{size}" rx="{size*0.22 if rounded else 0:g}" fill="#111318"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">{rect}'
            f'<g transform="translate({tx:.3f} {ty:.3f}) scale({s:.5f} {-s:.5f})">'
            f'<path fill="#eceef2" d="{path}"/>'
            f'<rect x="{X0}" y="{-GAP-TH}" width="{X1-X0}" height="{TH}" fill="#ffb020"/></g></svg>\n')
open('public/icons/favicon.svg','w').write(svg(64, True))
open('public/icons/touch-icon.svg','w').write(svg(180, False, fill_frac=0.5))
mark=(f'<svg class="r-mark" viewBox="{X0-10:g} {-TOP-10:g} {X1-X0+20:g} {H+20:g}" aria-hidden="true">'
      f'<g transform="scale(1 -1)"><path fill="currentColor" d="{path}"/>'
      f'<rect x="{X0}" y="{-GAP-TH}" width="{X1-X0}" height="{TH}" fill="var(--accent)"/></g></svg>')
print(mark)
