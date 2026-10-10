// Small shared pieces of markup: escaping, formatting, the logo and icons.

// The logo: the whole sentence, name last. Square full stops are a logo-only detail.
// With animate, the amber underline under "rebattle" is drawn at reading pace (CSS only).
function brandLogo({ animate = false } = {}) {
  const stop = '<i class="brand-stop"></i>';
  return `<span class="brand${animate ? ' brand-animate' : ''}" aria-label="drop. bounceback. rebattle."><span class="brand-lead" aria-hidden="true">drop${stop} bounceback${stop}</span> <span class="brand-name" aria-hidden="true"><span class="brand-word">rebattle</span>${stop}</span></span>`;
}

// The short mark: Funnel Display's "r" (as an outline, so it never depends on the font
// loading) with the amber underline starting at the letter's left edge. Same as the icon.
const R_MARK = '<svg class="r-mark" viewBox="26 -617.2 474 861.2" aria-hidden="true"><g transform="scale(1 -1)"><path fill="currentColor" d="M118 0V436.0009765625H36.00048828125V600H203.99951171875V482.0001220703125H245.99951171875Q269.59954833984375 544.5999755859375 321.6995544433594 575.8999633789062Q373.799560546875 607.199951171875 439.399658203125 607.199951171875H489.9996337890625V463.200927734375H431.99969482421875Q353.99945068359375 463.200927734375 317.3992004394531 419.20074462890625Q280.7989501953125 375.2005615234375 280.7989501953125 303.2001953125V0Z"/><rect x="36" y="-234" width="454" height="144" style="fill:var(--accent)"/></g></svg>';

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

export { brandLogo, escapeHtml, fmtDuration, DRAW_ICON, brandHome };
