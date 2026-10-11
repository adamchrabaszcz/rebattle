// Small shared pieces of markup: escaping, formatting, the logo and icons.
import { EM, LOGO } from './logo-outlines.js';

// A logo version as inline outlines (the logo's own "r", and no waiting for the font),
// sized in em so it scales with the font size around it and sits on the text's baseline.
// The colours come from the stylesheet (.logo-text, .logo-lead, .logo-line), so it follows the theme.
function logoSvg(version, cls = 'logo') {
  const { box: [x, y, w, h], parts } = LOGO[version];
  const paths = Object.entries(parts).map(([role, d]) => `<path class="logo-${role}" d="${d}"/>`).join('');
  return `<svg class="${cls}" viewBox="${x} ${y} ${w} ${h}" style="--h:${h / EM};--below:${(y + h) / EM}" aria-hidden="true"><g transform="scale(1 -1)">${paths}</g></svg>`;
}

// The logo: the whole sentence, name last. Square full stops are a logo-only detail.
// With animate, the amber underline under "rebattle" is drawn at reading pace (CSS only).
function brandLogo({ animate = false } = {}) {
  return `<span class="brand${animate ? ' brand-animate' : ''}" role="img" aria-label="drop. bounceback. rebattle.">${logoSvg('full')}</span>`;
}

// The name version: "rebattle" with the underline and no full stop (the full stops
// belong to the sentence; docs/brand.md).
function brandName() {
  return `<span class="brand brand-name-only" role="img" aria-label="rebattle">${logoSvg('name')}</span>`;
}

// The short mark: the logo's "r" with the underline from its left edge to the bounce's tip.
const R_MARK = logoSvg('mark', 'r-mark');

// R_SHAPES: the mark's letter and underline in font units (y up), for drawing it elsewhere
// with other colours (the middle of QR codes); use with scale(1 -1). The viewBox keeps a
// little room around the mark.
const [MX, MY, MW, MH] = LOGO.mark.box;
const [ULX0, ULY0, ULX1, ULY1] = LOGO.mark.parts.line.match(/-?[\d.]+/g).map(Number); // M x0 y0 H x1 V y1 ...
export const R_SHAPES = {
  viewBox: `${MX - 10} ${MY - 10} ${MW + 20} ${MH + 20}`,
  letter: LOGO.mark.parts.text,
  underline: { x: ULX0, y: ULY0, width: ULX1 - ULX0, height: ULY1 - ULY0 },
};

// Small logo to the right of a tournament's own title; doubles as the way back to
// the list. Phones get the short "r" mark so the competition name keeps the room.
function brandHome() {
  return `<button type="button" class="brand-home" data-action="go-home" title="Back to tournament list">${brandLogo()}${R_MARK}</button>`;
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function fmtDuration(totalSeconds) {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(h + 'h');
  if (h || m) parts.push(m + 'm');
  parts.push(sec + 's');
  return parts.join(' ');
}

// Losers-bracket rounds are paired by random draw; the round title says so with a shuffle icon.
const DRAW_ICON =
  '<span class="draw-icon" title="Pairings are a random draw" aria-label="random draw"><svg viewBox="0 0 16 16" aria-hidden="true">' +
  '<path d="M1.5 4.5h2.5c3 0 4.5 7 7.5 7h1.5M1.5 11.5h2.5c3 0 4.5-7 7.5-7h1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
  '<path d="M12.5 2.2l3 2.3-3 2.3zM12.5 9.2l3 2.3-3 2.3z" fill="currentColor"/></svg></span>';

export { brandLogo, brandName, escapeHtml, fmtDuration, DRAW_ICON, brandHome };
