// Canvas drawing primitives: text, logo, tags, medals, icons.

import { C, clamp01, DISPLAY, FONT, fontFor } from './theme.js';

// ---- drawing helpers ------------------------------------------------------

function withAlpha(ctx, a, fn) {
  ctx.save();
  ctx.globalAlpha *= clamp01(a);
  fn();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, { size = 40, weight = 400, color = C.text, align = 'left', maxWidth, spacing } = {}) {
  ctx.font = `${weight} ${size}px ${fontFor(size)}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing ? spacing + 'px' : '0px';
  let s = String(str);
  if (maxWidth && ctx.measureText(s).width > maxWidth) {
    while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
    s += '…';
  }
  ctx.fillText(s, x, y);
}

// The logo, "drop. bounceback. rebattle.", centred on cx with its baseline at y. Full
// stops are squares (logo only); underline (0..1) is how much of the amber line under
// "rebattle" is drawn, so the intro can draw it at reading pace like the home screen.
function drawLogo(ctx, cx, y, size, underline = 1) {
  ctx.save();
  ctx.font = `700 ${size}px ${DISPLAY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = -0.03 * size + 'px';
  const stop = 0.14 * size;
  const stopGap = 0.06 * size;
  const space = ctx.measureText(' ').width;
  const parts = [
    { word: 'drop', color: C.muted },
    { word: 'bounceback', color: C.muted },
    { word: 'rebattle', color: C.text, underline: true },
  ].map((p) => ({ ...p, w: ctx.measureText(p.word).width }));
  const total = parts.reduce((sum, p) => sum + p.w + stopGap + stop, 0) + space * (parts.length - 1);
  let x = cx - total / 2;
  parts.forEach((p) => {
    ctx.fillStyle = p.color;
    ctx.fillText(p.word, x, y);
    if (p.underline && underline > 0) {
      ctx.fillStyle = C.accent2;
      ctx.fillRect(x, y + 0.14 * size, p.w * clamp01(underline), 0.12 * size);
      ctx.fillStyle = p.color;
    }
    ctx.fillRect(x + p.w + stopGap, y - stop, stop, stop);
    x += p.w + stopGap + stop + space;
  });
  ctx.restore();
}

function wrapLines(ctx, str, maxWidth, size, weight) {
  ctx.font = `${weight} ${size}px ${fontFor(size)}`;
  const words = String(str).split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((w) => {
    const next = line ? line + ' ' + w : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  });
  if (line) lines.push(line);
  return lines;
}

// What happened to this competitor after the heat, shown as a tag.
function outcomeTag(match, isWinner) {
  const d = isWinner ? match.onWinnerAdvanceTo : match.onLoserAdvanceTo;
  if (match.stage === 'SF') return isWinner ? { text: 'GRAND FINAL', color: C.accent2 } : { text: 'SMALL FINAL', color: C.muted };
  if (!d) return null;
  switch (d.type) {
    case 'slot': // WB winner into the next round
    case 'lbLevelAdvance': // LB winner into the next round
      return { text: '✓ ADVANCES', color: C.win };
    case 'lbEntrant':
      return { text: '↓ LOSERS', color: C.losers };
    case 'eliminated':
      return { text: '✕ OUT', color: C.lose };
    // Bracket finalists: say which semifinal (WB winner vs LB runner-up,
    // WB runner-up vs LB winner) instead of a vague "Final 4".
    case 'wbChampion':
    case 'lbRunnerUp':
      return { text: '→ SEMI 1', color: C.accent2 };
    case 'wbRunnerUp':
    case 'lbChampion':
      return { text: '→ SEMI 2', color: C.accent2 };
    case 'rank1':
      return { medal: 1 };
    case 'rank2':
      return { medal: 2 };
    case 'rank3':
      return { medal: 3 };
    case 'rank4':
      return { text: '4TH', color: C.muted };
    default:
      return null;
  }
}

function tagWidth(ctx, tag, size) {
  if (tag.medal) return size * 1.9;
  ctx.font = `700 ${size}px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
  return ctx.measureText(tag.text).width + size * 1.1;
}

function drawTag(ctx, tag, xRight, y, size) {
  if (tag.medal) {
    // Centre the whole medal (ribbon top to disc bottom spans 3.1r) on the row.
    const r = size * 0.95;
    drawMedal(ctx, xRight - r, y + r * 0.55, r, tag.medal);
    return;
  }
  ctx.font = `700 ${size}px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
  const w = ctx.measureText(tag.text).width + size * 1.1;
  const h = size * 1.7;
  roundRect(ctx, xRight - w, y - h / 2, w, h, h / 2);
  ctx.strokeStyle = tag.color;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, tag.text, xRight - w / 2, y + 1, { size, weight: 700, color: tag.color, align: 'center', spacing: 1 });
}

// Medals are drawn as vector shapes rather than emoji: emoji are bitmaps
// and go soft when scaled up (pop animation, 1080p video).
const MEDAL = {
  1: ['#fff1a8', '#ffd451', '#c9971c'],
  2: ['#ffffff', '#d5dae4', '#8f98ab'],
  3: ['#f6c28f', '#d08a4b', '#8a4f22'],
};
function drawMedal(ctx, cx, cy, r, place) {
  const [light, mid, dark] = MEDAL[place];
  ctx.save();
  // Ribbon: two straps meeting behind the disc.
  const top = cy - r * 2.1;
  [
    [C.accent, -1],
    [C.lose, 1],
  ].forEach(([color, side]) => {
    ctx.beginPath();
    ctx.moveTo(cx + side * r * 0.95, top);
    ctx.lineTo(cx + side * r * 0.35, top);
    ctx.lineTo(cx - side * r * 0.25, cy - r * 0.6);
    ctx.lineTo(cx + side * r * 0.35, cy - r * 0.6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  });
  // Disc with a soft metallic gradient and an inner ring.
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, light);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, dark);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2);
  ctx.strokeStyle = dark;
  ctx.globalAlpha *= 0.6;
  ctx.lineWidth = Math.max(1.5, r * 0.07);
  ctx.stroke();
  ctx.restore();
  text(ctx, String(place), cx, cy + r * 0.04, { size: r * 1.05, weight: 800, color: dark, align: 'center' });
}

// Two crossing arrows (the usual "shuffle" symbol), drawn so it never depends on a font glyph.
function drawShuffleIcon(ctx, cx, cy, s, color, tilt) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt || 0);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = s * 0.11;
  ctx.lineCap = 'round';
  const h = s / 2, v = s * 0.3;
  [[-v, v], [v, -v]].forEach(([y1, y2]) => {
    ctx.beginPath();
    ctx.moveTo(-h, y1);
    ctx.bezierCurveTo(-h * 0.1, y1, h * 0.1, y2, h * 0.7, y2);
    ctx.stroke();
    ctx.beginPath(); // arrowhead
    ctx.moveTo(h, y2);
    ctx.lineTo(h * 0.62, y2 - s * 0.17);
    ctx.lineTo(h * 0.62, y2 + s * 0.17);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

// Overshoot ease for the medal "pop".
const easeBack = (x) => {
  const u = clamp01(x) - 1;
  return 1 + 2.7 * u * u * u + 1.7 * u * u;
};

// Fit a name into maxWidth without cutting it: one line if it fits, otherwise split
// into two balanced lines at a space, shrinking the size (down to minSize) as needed.
// Only a single word too long even at minSize still gets the "…" from text().
function fitName(ctx, str, maxWidth, size, minSize, weight) {
  const words = String(str).split(/\s+/);
  const splits = words.length < 2 ? [] : words.slice(1).map((_, i) => [words.slice(0, i + 1).join(' '), words.slice(i + 1).join(' ')]);
  for (let sz = size; sz >= minSize; sz -= 2) {
    ctx.font = `${weight} ${sz}px ${fontFor(sz)}`;
    if (ctx.measureText(str).width <= maxWidth) return { size: sz, lines: [String(str)] };
    const best = splits
      .map((l) => ({ l, w: Math.max(ctx.measureText(l[0]).width, ctx.measureText(l[1]).width) }))
      .sort((a, b) => a.w - b.w)[0];
    if (best && best.w <= maxWidth) return { size: sz, lines: best.l };
  }
  return { size: minSize, lines: splits.length ? splits[Math.floor(splits.length / 2)] : [String(str)] };
}

export { text, withAlpha, roundRect, drawLogo, wrapLines, outcomeTag, tagWidth, drawTag, drawShuffleIcon, drawMedal, easeBack, fitName };
