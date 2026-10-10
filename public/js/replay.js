// Vertical (9:16) animated replay of a finished tournament, drawn on a canvas
// so the same frames can be previewed in-app and recorded to a video file.
//
// The timeline is a list of scenes; drawFrame(t) is a pure function of time,
// so scrubbing, playback and recording all go through the same path.
// Heat order follows how the event is run: top to bottom within a round,
// WB R1, WB R2, then LB and WB rounds in turns, the LB final, then Final 4.

import * as Bracket from './bracket.js';
import { lbLayout } from './ui.js';

const W = 1080;
const H = 1920;
const TARGET_SECONDS = 27;
const FADE = 0.3; // scene cross-fade
// Losers-bracket rounds are a random draw: names shuffle briefly before locking in. The
// scene gets DRAW_EXTRA more time than a normal round, so what's left after the shuffle
// goes to letting the results stay on screen longer.
const SHUFFLE = 0.35;
const DRAW_EXTRA = 0.6;
// Same fonts as the app (bundled in fonts/): Funnel Sans for text, Funnel Display
// for big titles and the logo. Canvas only uses a web font once it has loaded,
// so drawing and recording wait for FONTS_READY.
const FONT = '"Funnel Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const DISPLAY = '"Funnel Display", ' + FONT;
const fontFor = (size) => (size >= 60 ? DISPLAY : FONT);
let fontsLoaded = !(globalThis.document && document.fonts);
const FONTS_READY = fontsLoaded
  ? Promise.resolve()
  : Promise.all(['400 40px', '700 40px', '800 40px'].map((f) => document.fonts.load(`${f} "Funnel Sans"`)).concat(
      ['700 80px', '800 80px'].map((f) => document.fonts.load(`${f} "Funnel Display"`))
    ))
      .catch(() => {})
      .then(() => { fontsLoaded = true; });
const C = {
  bg: '#111318',
  panel: '#181b22',
  panel2: '#20232c',
  border: '#2e323d',
  text: '#eceef2',
  muted: '#9599a6',
  accent: '#4f8cff', // winners bracket colour in the video (losers bracket is violet)
  accent2: '#ffb020', // brand amber
  win: '#35c17a',
  lose: '#e35b5b',
  losers: '#a685ff', // the Losers bracket's own colour (red is reserved for ✕ OUT)
  gold: '#ffd451',
  silver: '#c0c7d6',
  bronze: '#d08a4b',
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => 1 - Math.pow(1 - clamp01(x), 3);

// ---- timeline -------------------------------------------------------------

// focus: competitor id for a single rider's journey (only their heats, then
// their result), or null for the whole competition.
function buildTimeline(t, focus) {
  const k = t.bracketRounds;
  const wbRounds = {};
  t.wb.matches.forEach((m) => (wbRounds[m.round] = wbRounds[m.round] || []).push({ match: m }));
  const lb = lbLayout(t);

  const wbScene = (r) =>
    wbRounds[r] && {
      type: 'round',
      kicker: 'Winners',
      color: C.accent,
      title: r === k ? 'Final' : 'Round ' + r,
      sub: r === k ? 'Winner → Semi 1 · runner-up → Semi 2' : 'Lose here → second chance in the Losers bracket',
      items: wbRounds[r],
    };
  const lbScene = (l) =>
    lb.levels[l] &&
    lb.levels[l].length && {
      type: 'round',
      kicker: 'Losers',
      color: C.losers,
      title: 'Round ' + l,
      sub:
        l === 1
          ? 'Second chance for Winners R1 losers · lose again → out'
          : t.lb.levels[l] && t.lb.levels[l].wbDropouts.length
          ? `Joined by Winners R${l} drop-ins · lose → out`
          : 'Lose → out',
      draw: true,
      items: lb.levels[l],
    };

  const rounds = [wbScene(1), wbScene(2)];
  for (let i = 1; i <= Math.max(lb.maxLevel, k); i += 1) rounds.push(lbScene(i), wbScene(i + 2));
  if (lb.final.length)
    rounds.push({ type: 'round', kicker: 'Losers', color: C.losers, title: 'Final', sub: 'Winner → Semi 2 · runner-up → Semi 1', items: lb.final });

  const f4 = t.final4;
  const semis = {
        type: 'round',
        kicker: 'Final 4',
        color: C.accent2,
        title: 'Semifinals',
        sub: 'Winners → Grand final · losers → Small final',
        big: true,
        fixed: 2.4,
        items: [
          { match: f4.semi1, label: 'Semifinal 1' },
          { match: f4.semi2, label: 'Semifinal 2' },
        ],
      };
  const finals = {
        type: 'round',
        kicker: 'Final 4',
        color: C.accent2,
        title: 'Finals',
        big: true,
        fixed: 3.4,
        items: [
          { match: f4.smallFinal, label: 'Small final · 3rd place' },
          { match: f4.grandFinal, label: 'Grand final · 1st place' },
        ],
      };

  const scenes = focus
    ? journeyScenes(t, focus, rounds.filter(Boolean).concat([semis, finals]))
    : [{ type: 'intro', fixed: 3.5 }] // logo (underline done at 1.85s), then name, field and format
        .concat(rounds.filter(Boolean))
        .concat([
          { type: 'qualify', kicker: 'Final 4', color: C.accent2, title: 'The semis', fixed: 3.0 },
          semis,
          finals,
          { type: 'podium', fixed: 5.8 }, // confetti is fully faded ~0.25s before the end
        ]);

  // Fixed scenes keep their length; the remaining budget is shared between
  // round scenes by heat count, with a floor so small rounds stay readable.
  const fixedTotal = scenes.reduce((a, s) => a + (s.fixed || 0) + (s.draw ? DRAW_EXTRA : 0), 0);
  const budget = Math.max(0, TARGET_SECONDS - fixedTotal);
  const weight = (s) => 1 + 0.3 * s.items.filter((i) => !i.match.isBye).length;
  const flex = scenes.filter((s) => !s.fixed);
  const totalWeight = flex.reduce((a, s) => a + weight(s), 0) || 1;
  let start = 0;
  scenes.forEach((s, i) => {
    s.index = i;
    s.dur = (s.fixed || Math.max(1.6, (budget * weight(s)) / totalWeight)) + (s.draw ? DRAW_EXTRA : 0);
    s.start = start;
    start += s.dur;
  });
  return { scenes, total: start, tournament: t, focus: focus || null };
}

function ordinal(n) {
  const v = n % 100;
  return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}

// One rider's path: every heat they rode (in running order), one per
// scene, then a result card.
function journeyScenes(t, focus, heatScenes) {
  const rode = (item) => item.match.slotA.competitorId === focus || item.match.slotB.competitorId === focus;
  const mine = heatScenes
    .map((s) => {
      const items = s.items.filter(rode);
      if (!items.length) return null;
      return Object.assign({}, s, { items, big: true, fixed: items[0].match.stage === 'GRAND_FINAL' ? 2.6 : 1.8 });
    })
    .filter(Boolean);

  const placing = Bracket.getPlacings(t).find((p) => p.id === focus);
  const tied = Bracket.getPlacings(t).filter((p) => p.place === placing.place).length > 1;
  const last = mine[mine.length - 1];
  const lm = last.items[0].match;
  let how;
  if (placing.place === 1) how = 'Champion';
  else if (lm.stage === 'GRAND_FINAL') how = `Lost the Grand Final to ${name(t, lm.winnerId)}`;
  else if (lm.stage === 'SMALL_FINAL') how = lm.winnerId === focus ? 'Won the Small Final' : `Lost the Small Final to ${name(t, lm.winnerId)}`;
  else how = `Out in ${last.kicker} · ${last.title}, beaten by ${name(t, lm.winnerId)}`;
  const ridden = mine.map((s) => s.items[0].match).filter((m) => !m.isBye);
  const wins = ridden.filter((m) => m.winnerId === focus).length;

  return [{ type: 'journeyIntro', fixed: 2.0 }]
    .concat(mine)
    .concat([
      {
        type: 'result',
        fixed: placing.place <= 3 ? 4.7 : 4.0, // medal finishes get time for the confetti to clear
        place: placing.place,
        tied,
        how,
        stats: `${ridden.length} heat${ridden.length === 1 ? '' : 's'} · ${wins} win${wins === 1 ? '' : 's'} · ${ridden.length - wins} loss${
          ridden.length - wins === 1 ? '' : 'es'
        }`,
      },
    ]);
}

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

const name = (t, id) => Bracket.getName(t, id) || 'TBD';

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

// One heat card. p = resolve progress (0 = undecided, 1 = result shown).
// p = winner progress (green highlight + winner tags); pTag = loser progress
// (dim + tag sliding in), which runs first.
function drawHeat(ctx, t, item, x, y, w, h, p, pTag, focus, shownAs) {
  if (pTag == null) pTag = p;
  const m = item.match;
  const keys = item.swap ? ['slotB', 'slotA'] : ['slotA', 'slotB'];
  if (m.isBye) p = 1;

  roundRect(ctx, x, y, w, h, Math.min(22, h * 0.14));
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = m.isLbFinal || (m.stage === 'WB' && m.round === t.bracketRounds) || m.stage === 'GRAND_FINAL' ? C.accent2 : C.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  const pad = h * 0.08;
  const rowH = (h - pad * 2) / 2;
  const size = Math.max(26, Math.min(54, rowH * 0.5));
  keys.forEach((key, i) => {
    const slot = m[key];
    const ry = y + pad + rowH * i;
    const cy = ry + rowH / 2;
    const id = slot.competitorId;
    if (!id) {
      text(ctx, slot.isBye ? 'no opponent — advances' : 'TBD', x + pad * 2, cy, { size: size * 0.7, color: C.muted });
      return;
    }
    const isWinner = m.winnerId === id;
    const isLoser = m.loserId === id;
    if (focus && id === focus) {
      roundRect(ctx, x + pad - 2, ry + 1, w - pad * 2 + 4, rowH - 2, 14);
      ctx.strokeStyle = C.accent2;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    if (isWinner) {
      withAlpha(ctx, p, () => {
        roundRect(ctx, x + pad, ry + 3, w - pad * 2, rowH - 6, 12);
        ctx.fillStyle = 'rgba(53,193,122,0.18)';
        ctx.fill();
      });
    }
    const tag = m.isBye ? (isWinner ? { text: 'BYE', color: C.accent2 } : null) : outcomeTag(m, isWinner);
    // A Winners-bracket drop-in keeps a chip saying so; when the result tag
    // slides in, the chip steps aside to its left and both stay.
    const tagSize = Math.max(16, size * 0.55);
    const lvl = m.stage === 'LB' && t.lb.levels[m.level];
    const chip = lvl && lvl.wbDropouts.includes(id) && !m.isBye && !shownAs ? { text: `FROM WINNERS R${m.level}`, color: C.losers } : null;
    const resultW = tag ? tagWidth(ctx, tag, tagSize) + 12 : 0;
    if (chip) drawTag(ctx, chip, x + w - pad * 2 - resultW * pTag, cy, tagSize);
    const tagRoom = (tag ? resultW : 0) + (chip ? tagWidth(ctx, chip, tagSize) + 12 : 0) + size * 0.6;
    withAlpha(ctx, isLoser ? 1 - 0.55 * pTag : 1, () => {
      text(ctx, name(t, shownAs ? shownAs(id, i) : id), x + pad * 2, cy, {
        size,
        weight: isWinner && p > 0.5 ? 700 : 500,
        color: isWinner && p > 0.5 ? C.win : C.text,
        maxWidth: w - pad * 4 - tagRoom,
      });
    });
    if (tag) {
      // Both result tags slide in together (pTag); the Grand Final keeps its
      // build-up, so the winner's gold medal waits for the winner highlight.
      const tp = m.isBye ? p : isLoser || m.stage !== 'GRAND_FINAL' ? pTag : p;
      const slide = m.isBye ? 0 : (1 - tp) * 120; // result tags slide in from the right
      ctx.save();
      roundRect(ctx, x, y, w, h, Math.min(22, h * 0.14));
      ctx.clip(); // slide in from the card's edge, not from outside it
      withAlpha(ctx, tp, () => drawTag(ctx, tag, x + w - pad * 2 + slide, cy, tagSize));
      ctx.restore();
    }
  });
}

// "LOSERS  ⤮ RANDOM DRAW": the draw tag is bright while the names shuffle, then settles.
function drawKickerWithDraw(ctx, scene, local) {
  const kicker = scene.kicker.toUpperCase();
  const label = 'RANDOM DRAW';
  ctx.font = `800 40px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
  const kw = ctx.measureText(kicker).width;
  ctx.font = `700 30px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  const lw = ctx.measureText(label).width;
  const icon = 34, gap = 36, igap = 12;
  const x0 = W / 2 - (kw + gap + icon + igap + lw) / 2;
  text(ctx, kicker, x0, 210, { size: 40, weight: 800, color: scene.color, spacing: 6 });
  const settle = ease((local - FADE - SHUFFLE) / 0.4);
  const color = settle < 1 ? C.text : C.muted;
  withAlpha(ctx, 1 - 0.45 * settle, () => {
    // spin the icon a little while shuffling
    drawShuffleIcon(ctx, x0 + kw + gap + icon / 2, 210, icon, color, local < FADE + SHUFFLE ? Math.sin(local * 18) * 0.12 : 0);
    text(ctx, label, x0 + kw + gap + icon + igap, 212, { size: 30, weight: 700, color, spacing: 4 });
  });
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

function drawHeader(ctx, tl, scene, local = 99) {
  text(ctx, tl.tournament.name, W / 2, 120, { size: 34, color: C.muted, align: 'center', maxWidth: W - 160 });
  if (scene.draw) drawKickerWithDraw(ctx, scene, local);
  else text(ctx, scene.kicker.toUpperCase(), W / 2, 210, { size: 40, weight: 800, color: scene.color, align: 'center', spacing: 6 });
  text(ctx, scene.title, W / 2, 300, { size: 92, weight: 800, align: 'center', maxWidth: W - 120 });
  if (scene.sub) text(ctx, scene.sub, W / 2, 378, { size: 32, color: C.muted, align: 'center', maxWidth: W - 120 });
}

// Progress strip: one dot per scene, current one highlighted.
const DOT_Y = 1810;
function dotLayout(tl) {
  const n = tl.scenes.length;
  const gap = Math.min(40, 760 / Math.max(1, n - 1));
  return { gap, x0: W / 2 - (gap * (n - 1)) / 2 };
}

// Scene index of the dot at canvas coords (x, y), or -1.
function dotAt(tl, x, y) {
  const { gap, x0 } = dotLayout(tl);
  if (Math.abs(y - DOT_Y) > 40) return -1;
  const i = Math.round((x - x0) / gap);
  return i >= 0 && i < tl.scenes.length && Math.abs(x - (x0 + gap * i)) <= Math.max(gap / 2, 14) ? i : -1;
}

function drawProgress(ctx, tl, t) {
  const { gap, x0 } = dotLayout(tl);
  tl.scenes.forEach((s, i) => {
    const active = t >= s.start;
    ctx.beginPath();
    ctx.arc(x0 + gap * i, DOT_Y, t >= s.start && t < s.start + s.dur ? 9 : 6, 0, Math.PI * 2);
    ctx.fillStyle = active ? (s.color || C.accent2) : C.border;
    ctx.fill();
  });
  drawLogo(ctx, W / 2, 1875, 30);
}

// ---- scenes ---------------------------------------------------------------

function drawIntro(ctx, tl, local) {
  const t = tl.tournament;
  const a = ease(local / 0.6);
  withAlpha(ctx, a, () => {
    // Underline waits while "drop. bounceback." is read, then draws over "rebattle" (same pace as the home screen).
    drawLogo(ctx, W / 2, 575, 52, ease((local - 1.1) / 0.75));
    const lines = wrapLines(ctx, t.name, W - 160, 104, 800).slice(0, 3);
    lines.forEach((l, i) => text(ctx, l, W / 2, 690 + i * 120, { size: 104, weight: 800, align: 'center' }));
    const yAfter = 690 + lines.length * 120;
    const fmt = t.settings.heatFormat === 'bo3' ? 'best of 3' : 'single run';
    text(ctx, `${t.competitors.length} riders · ${fmt}`, W / 2, yAfter + 10, { size: 44, color: C.muted, align: 'center' });
    text(ctx, new Date(t.createdAt).toLocaleDateString(), W / 2, yAfter + 80, { size: 36, color: C.muted, align: 'center' });
    withAlpha(ctx, ease((local - 0.35) / 0.4), () => {
      text(ctx, 'DOUBLE ELIMINATION', W / 2, yAfter + 190, { size: 34, weight: 800, color: C.accent2, align: 'center', spacing: 5 });
    });
  });
  // The field, fading in underneath.
  const names = t.competitors.map((c) => c.name).slice(0, 36);
  const cols = 3;
  names.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    withAlpha(ctx, 0.45 * ease((local - 0.2 - i * 0.02) / 0.4), () =>
      text(ctx, n, 200 + col * 340, 1360 + row * 46, { size: 30, color: C.muted, align: 'center', maxWidth: 320 })
    );
  });
}

function drawRound(ctx, tl, scene, local) {
  const t = tl.tournament;
  drawHeader(ctx, tl, scene, local);

  const items = scene.items;
  const top = scene.big ? 470 : 430;
  const bottom = 1740;
  const cols = items.length > 8 ? 2 : 1;
  const rows = Math.ceil(items.length / cols);
  const gapY = scene.big ? 110 : Math.min(28, 200 / rows);
  const gapX = 30;
  const cardW = cols === 1 ? 960 : (960 - gapX) / 2;
  const cardH = Math.min(scene.big ? 280 : 230, (bottom - top - gapY * (rows - 1)) / rows);
  const blockH = rows * cardH + (rows - 1) * gapY;
  const y0 = top + Math.max(0, (bottom - top - blockH) / 2);
  const x0 = (W - 960) / 2;

  // Real heats resolve one after another, top to bottom (column-major).
  const real = items.filter((i) => !i.match.isBye);
  // A drawn round first shuffles its riders' names, then the heats resolve as usual.
  const lead = scene.draw ? SHUFFLE : 0;
  const shuffling = scene.draw && local < FADE + lead;
  const pool = shuffling ? items.flatMap((i) => [i.match.slotA.competitorId, i.match.slotB.competitorId]).filter(Boolean) : null;
  const hold = scene.draw ? DRAW_EXTRA - SHUFFLE : 0; // drawn rounds keep their results up a little longer
  const window = Math.max(0.2, scene.dur - lead - hold - FADE - 0.7); // leave room for the last loser tag
  const step = window / Math.max(1, real.length);
  const resolveDur = Math.min(0.35, step * 1.6);

  items.forEach((item, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const x = x0 + col * (cardW + gapX);
    const y = y0 + row * (cardH + gapY);
    const order = real.indexOf(item);
    const heatStart = FADE + lead + order * step;
    // Loser first (dims, tag slides in), then the winner lights up, so every
    // heat ends on the winner. The Grand Final holds the pause longer.
    const gap = item.match.stage === 'GRAND_FINAL' ? 0.7 : 0.35;
    const pTag = order < 0 ? 1 : ease((local - heatStart) / 0.3);
    const p = order < 0 ? 1 : ease((local - heatStart - gap) / (item.match.stage === 'GRAND_FINAL' ? 0.4 : resolveDur));
    const enter = ease((local - i * 0.025) / 0.3);
    withAlpha(ctx, enter, () => {
      if (item.label) text(ctx, item.label.toUpperCase(), x + 8, y - 34, { size: 28, weight: 700, color: C.muted, spacing: 3 });
      // While shuffling, the round's riders rotate through all rows (a new name every 70ms);
      // each row is a different offset into the same list, so no name shows twice at once.
      const shownAs = shuffling ? (id, row) => pool[(Math.floor(local / 0.07) * 5 + i * 2 + row) % pool.length] : null;
      drawHeat(ctx, t, item, x, y + (1 - enter) * 30, cardW, cardH, p, pTag, tl.focus, shownAs);
    });
  });
}

// Both bracket finals feed the semis crosswise: WB winner meets the LB
// runner-up (SF1), WB runner-up meets the LB winner (SF2). Lines draw from
// each finalist into their semifinal slot; the name lands as the line arrives.
function drawQualify(ctx, tl, scene, local) {
  const t = tl.tournament;
  drawHeader(ctx, tl, scene);
  const wbF = t.wb.matches.find((m) => m.round === t.bracketRounds);
  const lbF = t.lb.matches.find((m) => m.isLbFinal);
  if (!wbF || !lbF) return;

  const cw = 460;
  const ch = 220;
  const xs = [60, 560];
  const srcY = 480;
  const dstY = 1200;
  const enter = ease(local / 0.35);

  // [source card index, source is winner?, target card index, target row, tag]
  const routes = [
    { src: 0, win: true, dst: 0, row: 0, id: wbF.winnerId, label: 'WB 1st' },
    { src: 1, win: false, dst: 0, row: 1, id: lbF.loserId, label: 'LB 2nd' },
    { src: 0, win: false, dst: 1, row: 0, id: wbF.loserId, label: 'WB 2nd' },
    { src: 1, win: true, dst: 1, row: 1, id: lbF.winnerId, label: 'LB 1st' },
  ];
  const lineStart = (i) => 0.45 + i * 0.4;
  const lineDur = 0.6;
  const progress = (i) => ease((local - lineStart(i)) / lineDur);

  const card = (x, y, label, rows) => {
    text(ctx, label, x + 8, y - 34, { size: 28, weight: 700, color: C.muted, spacing: 3 });
    roundRect(ctx, x, y, cw, ch, 20);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = C.accent2;
    ctx.lineWidth = 2;
    ctx.stroke();
    const pad = 16;
    const rowH = (ch - pad * 2) / 2;
    rows.forEach((r, i) => {
      const ry = y + pad + rowH * i;
      if (r.highlight) {
        withAlpha(ctx, r.alpha, () => {
          roundRect(ctx, x + pad, ry + 3, cw - pad * 2, rowH - 6, 12);
          ctx.fillStyle = 'rgba(53,193,122,0.18)';
          ctx.fill();
        });
      }
      withAlpha(ctx, r.alpha, () =>
        text(ctx, r.text, x + pad * 2, ry + rowH / 2, { size: r.size || 40, weight: r.weight || 600, color: r.color, maxWidth: cw - pad * 4 - (r.tag ? tagWidth(ctx, r.tag, 20) + 16 : 0) }) // names never run under the tag
      );
      if (r.tag) withAlpha(ctx, r.tagAlpha, () => drawTag(ctx, r.tag, x + cw - pad * 2, ry + rowH / 2, 20));
    });
  };

  withAlpha(ctx, enter, () => {
    // Sources: the two bracket finals, already decided.
    [wbF, lbF].forEach((m, i) => {
      const goes = (win) => routes.findIndex((r) => r.src === i && r.win === win);
      card(xs[i], srcY, i === 0 ? 'WINNERS FINAL' : 'LOSERS FINAL', [
        { text: name(t, m.winnerId), color: C.win, weight: 700, highlight: true, alpha: 1, tag: { text: `→ SF ${routes[goes(true)].dst + 1}`, color: C.accent2 }, tagAlpha: progress(goes(true)) },
        { text: name(t, m.loserId), color: C.text, alpha: 0.8, tag: { text: `→ SF ${routes[goes(false)].dst + 1}`, color: C.accent2 }, tagAlpha: progress(goes(false)) },
      ]);
    });

    // Lines, drawn progressively as smooth curves.
    routes.forEach((r, i) => {
      const pr = progress(i);
      if (pr <= 0) return;
      const x0 = xs[r.src] + cw * (r.win ? 0.3 : 0.7);
      const y0 = srcY + ch;
      const x1 = xs[r.dst] + cw * (r.row === 0 ? 0.3 : 0.7);
      const y1 = dstY;
      const pt = (u) => {
        const v = 1 - u;
        return [
          v * v * v * x0 + 3 * v * v * u * x0 + 3 * v * u * u * x1 + u * u * u * x1,
          v * v * v * y0 + 3 * v * v * u * (y0 + 260) + 3 * v * u * u * (y1 - 260) + u * u * u * y1,
        ];
      };
      ctx.save();
      ctx.strokeStyle = r.win ? C.win : C.losers; // runners-up: violet, like a drop to the losers bracket
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      if (!r.win) ctx.setLineDash([16, 12]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (let k = 1; k <= 40; k += 1) ctx.lineTo(...pt((k / 40) * pr));
      ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(...pt(pr), 9, 0, Math.PI * 2);
      ctx.fillStyle = r.win ? C.win : C.losers;
      ctx.fill();
    });

    // Targets: the semis fill in as each line lands.
    [0, 1].forEach((d) => {
      const rows = [0, 1].map((row) => {
        const i = routes.findIndex((r) => r.dst === d && r.row === row);
        const landed = progress(i);
        return landed >= 1
          ? { text: name(t, routes[i].id), color: C.text, weight: 700, alpha: 1, tag: { text: routes[i].label.toUpperCase(), color: C.muted }, tagAlpha: 1 }
          : { text: routes[i].label, color: C.muted, weight: 400, size: 32, alpha: 0.7 };
      });
      card(xs[d], dstY, `SEMIFINAL ${d + 1}`, rows);
    });
  });
}

// Overshoot ease for the medal "pop".
const easeBack = (x) => {
  const u = clamp01(x) - 1;
  return 1 + 2.7 * u * u * u + 1.7 * u * u;
};

// Deterministic per-index random, so confetti is identical on every
// playback, scrub and recording (positions are a pure function of time).
function rand(i, salt) {
  let h = (i * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const CONFETTI = [C.gold, C.accent, C.win, C.lose, C.accent2, '#ffffff', C.silver];

function drawConfetti(ctx, age, x0, y0) {
  if (age <= 0) return;
  const piece = (x, y, rot, i, alpha) => {
    withAlpha(ctx, alpha, () => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(Math.cos(rot * 1.7), 1); // flip as it tumbles
      ctx.fillStyle = CONFETTI[i % CONFETTI.length];
      ctx.fillRect(-8, -13, 16, 26);
      ctx.restore();
    });
  };
  // Burst from above the winner's block.
  const k = 1.6; // air drag
  const drag = (1 - Math.exp(-k * age)) / k;
  for (let i = 0; i < 120; i += 1) {
    const ang = -Math.PI / 2 + (rand(i, 1) - 0.5) * 2.4;
    const speed = 900 + rand(i, 2) * 1100;
    const x = x0 + Math.cos(ang) * speed * drag + Math.sin(age * 3 + i) * 18;
    const y = y0 + Math.sin(ang) * speed * drag + 420 * age * age;
    piece(x, y, rand(i, 3) * 6 + age * (4 + rand(i, 4) * 6), i, 1 - clamp01((age - 2.4) / 0.8));
  }
  // Then a gentle rain from the top of the frame.
  for (let i = 0; i < 70; i += 1) {
    const a = age - 0.3 - rand(i, 5) * 0.8;
    if (a <= 0) continue;
    const x = rand(i, 6) * W + Math.sin(a * 2.5 + i) * 30;
    const y = -40 + a * (380 + rand(i, 7) * 260);
    piece(x, y, rand(i, 8) * 6 + a * 5, i + 3, 1 - clamp01((age - 2.8) / 0.7));
  }
}

function drawJourneyIntro(ctx, tl, local) {
  const t = tl.tournament;
  withAlpha(ctx, ease(local / 0.6), () => {
    text(ctx, 'RIDER JOURNEY', W / 2, 600, { size: 40, weight: 800, color: C.accent2, align: 'center', spacing: 8 });
    const lines = wrapLines(ctx, name(t, tl.focus), W - 160, 128, 800).slice(0, 2);
    lines.forEach((l, i) => text(ctx, l, W / 2, 740 + i * 140, { size: 128, weight: 800, align: 'center' }));
    const y = 740 + lines.length * 140;
    text(ctx, t.name, W / 2, y + 10, { size: 44, color: C.muted, align: 'center', maxWidth: W - 160 });
    text(ctx, `${t.competitors.length} riders · ${new Date(t.createdAt).toLocaleDateString()}`, W / 2, y + 80, {
      size: 36,
      color: C.muted,
      align: 'center',
    });
  });
}

function drawResult(ctx, tl, scene, local) {
  const t = tl.tournament;
  drawHeader(ctx, tl, { kicker: 'Final result', color: C.accent2, title: name(t, tl.focus) });
  const reveal = local - 0.4;
  if (reveal > 0) {
    const pop = easeBack(reveal / 0.45);
    ctx.save();
    ctx.translate(W / 2, 720);
    ctx.scale(pop, pop);
    if (scene.place <= 3) drawMedal(ctx, 0, 40, 130, scene.place);
    else text(ctx, ordinal(scene.place), 0, 0, { size: 220, weight: 800, color: C.accent2, align: 'center' });
    ctx.restore();
  }
  withAlpha(ctx, ease((reveal - 0.3) / 0.35), () => {
    text(ctx, `${ordinal(scene.place)} place${scene.tied ? ' (shared)' : ''}`, W / 2, 960, { size: 64, weight: 800, align: 'center' });
  });
  withAlpha(ctx, ease((reveal - 0.7) / 0.35), () => {
    wrapLines(ctx, scene.how, W - 180, 44, 500)
      .slice(0, 3)
      .forEach((l, i) => text(ctx, l, W / 2, 1080 + i * 58, { size: 44, color: C.text, align: 'center' }));
    text(ctx, scene.stats, W / 2, 1300, { size: 38, color: C.muted, align: 'center' });
  });
  if (scene.place <= 3) drawConfetti(ctx, reveal - 0.2, W / 2, 680);
}

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

function drawPodium(ctx, tl, local) {
  const t = tl.tournament;
  drawHeader(ctx, tl, { kicker: 'Final standings', color: C.accent2, title: 'Podium' });
  const base = 1080;
  // Revealed 3rd, then 2nd, then 1st.
  const spots = [
    { place: 3, x: 850, h: 200, color: C.bronze, delay: 0.2 },
    { place: 2, x: 230, h: 280, color: C.silver, delay: 0.9 },
    { place: 1, x: 540, h: 380, color: C.gold, delay: 1.6 },
  ];
  const winnerAt = spots[2].delay + 0.45; // the moment 1st place is shown
  spots.forEach((s) => {
    const h = s.h * ease((local - s.delay) / 0.5);
    if (h <= 0) return;
    ctx.save();
    if (s.place === 1 && local > winnerAt) {
      ctx.shadowColor = C.gold;
      ctx.shadowBlur = 30 + 20 * Math.sin((local - winnerAt) * 5);
    }
    roundRect(ctx, s.x - 140, base - h, 280, h, 16);
    ctx.fillStyle = C.panel2;
    ctx.fill();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.place === 1 && local > winnerAt ? 5 : 3;
    ctx.stroke();
    ctx.restore();
    if (h > 80) text(ctx, String(s.place), s.x, base - h / 2, { size: 96, weight: 800, color: s.color, align: 'center' });

    const reveal = local - s.delay - 0.45;
    if (reveal <= 0) return;
    const nameSize = s.place === 1 ? 50 : 40;
    const fit = fitName(ctx, name(t, t.standings[s.place - 1]), 290, nameSize, 30, 800);
    const lineH = fit.size * 1.1;
    const lift = (fit.lines.length - 1) * lineH; // a two-line name pushes the medal up
    const pop = easeBack(reveal / 0.45);
    ctx.save();
    ctx.translate(s.x, base - s.h - 150 - lift);
    ctx.scale(pop, pop);
    drawMedal(ctx, 0, 20, s.place === 1 ? 46 : 38, s.place);
    ctx.restore();
    withAlpha(ctx, ease(reveal / 0.3), () =>
      fit.lines.forEach((line, li) =>
        text(ctx, line, s.x, base - s.h - 55 - lift + li * lineH + (1 - ease(reveal / 0.3)) * 20, {
          size: fit.size,
          weight: 800,
          align: 'center',
          maxWidth: 300,
        })
      )
    );
  });

  // Everyone else, in two columns.
  const rest = Bracket.getPlacings(t).slice(3);
  const perCol = Math.min(12, Math.ceil(rest.length / 2)); // balance the two columns
  // One size for the whole list, small enough for the longest name to fit (not below 24px).
  ctx.font = `400 30px ${FONT}`;
  const longest = Math.max(1, ...rest.map(({ id }) => ctx.measureText(name(t, id)).width));
  const listSize = Math.max(24, Math.min(30, Math.floor((30 * 400) / longest)));
  rest.slice(0, perCol * 2).forEach(({ id, place }, i) => {
    const first = i === 0 || rest[i - 1].place !== place; // number a shared place once
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    withAlpha(ctx, ease((local - winnerAt - 0.5 - i * 0.04) / 0.3), () => {
      const x = 140 + col * 440;
      const y = 1180 + row * 46;
      if (first || i % perCol === 0) text(ctx, place + '.', x, y, { size: 30, weight: 700, color: C.accent2, align: 'right' });
      text(ctx, name(t, id), x + 18, y, { size: listSize, color: C.text, maxWidth: 400 });
    });
  });
  if (rest.length > perCol * 2) {
    withAlpha(ctx, ease((local - winnerAt - 1.4) / 0.3), () =>
      text(ctx, `+ ${rest.length - perCol * 2} more`, W / 2, 1180 + perCol * 46 + 10, { size: 28, color: C.muted, align: 'center' })
    );
  }

  drawConfetti(ctx, local - winnerAt, spots[2].x, base - spots[2].h - 150);
}

function drawScene(ctx, tl, scene, local) {
  if (scene.type === 'intro') drawIntro(ctx, tl, local);
  else if (scene.type === 'round') drawRound(ctx, tl, scene, local);
  else if (scene.type === 'podium') drawPodium(ctx, tl, local);
  else if (scene.type === 'qualify') drawQualify(ctx, tl, scene, local);
  else if (scene.type === 'journeyIntro') drawJourneyIntro(ctx, tl, local);
  else if (scene.type === 'result') drawResult(ctx, tl, scene, local);
}

function drawFrame(ctx, tl, t) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const scenes = tl.scenes;
  let i = scenes.findIndex((s) => t < s.start + s.dur);
  if (i < 0) i = scenes.length - 1;
  const scene = scenes[i];
  const local = Math.min(t - scene.start, scene.dur);

  // Cross-fade: the previous scene's final frame fades out under the new one.
  if (i > 0 && local < FADE / 2) withAlpha(ctx, 1 - local / (FADE / 2), () => drawScene(ctx, tl, scenes[i - 1], scenes[i - 1].dur));
  withAlpha(ctx, i === 0 ? 1 : (local - FADE / 3) / (FADE * 2 / 3), () => {
    ctx.save();
    ctx.translate(0, (1 - ease(local / FADE)) * 40);
    drawScene(ctx, tl, scene, local);
    ctx.restore();
  });
  drawProgress(ctx, tl, t);
  ctx.restore();
}

// ---- player ---------------------------------------------------------------

let player = null;

function fmt(sec) {
  const s = Math.max(0, Math.round(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function mount(container, tournament, focus) {
  unmount();
  const canvas = container.querySelector('#replay-canvas');
  if (!canvas) return;
  const q = (name) => container.querySelector(`[data-replay="${name}"]`);
  player = {
    canvas,
    ctx: canvas.getContext('2d'),
    tl: buildTimeline(tournament, focus),
    t: 0,
    playing: false,
    raf: null,
    last: null,
    recorder: null,
    file: null,
    el: { focus: q('focus'), subtitle: q('subtitle'), tip: q('tip'), play: q('play'), restart: q('restart'), scrub: q('scrub'), time: q('time'), export: q('export'), share: q('share'), status: q('status') },
  };
  const p = player;
  p.el.scrub.max = String(Math.round(p.tl.total * 1000));
  p.el.play.addEventListener('click', toggle);
  p.canvas.addEventListener('click', onCanvasClick);
  // Instant tooltip over the scene dots (the native title tooltip is slow).
  p.canvas.addEventListener('mousemove', (e) => {
    const { x, y } = canvasPoint(e);
    const i = dotAt(p.tl, x, y);
    p.el.tip.hidden = i < 0;
    if (i < 0) return;
    const { gap, x0 } = dotLayout(p.tl);
    const scale = p.canvas.getBoundingClientRect().width / W;
    p.el.tip.textContent = sceneName(p.tl.scenes[i]);
    p.el.tip.style.left = (x0 + gap * i) * scale + 'px';
    p.el.tip.style.top = (DOT_Y - 30) * scale + 'px';
  });
  p.canvas.addEventListener('mouseleave', () => (p.el.tip.hidden = true));
  document.addEventListener('keydown', onKey);
  p.el.scrub.addEventListener('pointerdown', () => (p.scrubbing = true));
  p.el.scrub.addEventListener('change', () => (p.scrubbing = false));
  p.el.restart.addEventListener('click', () => {
    seek(0);
    play();
  });
  p.el.scrub.addEventListener('input', () => {
    pause();
    seek(Number(p.el.scrub.value) / 1000);
  });
  p.el.export.addEventListener('click', exportVideo);
  p.el.focus.value = focus || '';
  p.el.focus.addEventListener('change', () => setFocus(p.el.focus.value || null));
  updateSubtitle();
  p.el.share.addEventListener('click', shareVideo);
  draw();
  play();
  if (!fontsLoaded) FONTS_READY.then(() => player === p && draw()); // repaint once the fonts are in
}

function setFocus(focus) {
  const p = player;
  pause();
  p.tl = buildTimeline(p.tl.tournament, focus);
  p.el.scrub.max = String(Math.round(p.tl.total * 1000));
  p.file = null;
  p.el.share.hidden = true;
  p.el.status.textContent = '';
  updateSubtitle();
  seek(0);
  play();
}

function updateSubtitle() {
  const p = player;
  p.el.subtitle.textContent = p.tl.focus ? `${name(p.tl.tournament, p.tl.focus)}'s journey` : 'Replay';
}

function unmount() {
  if (!player) return;
  document.removeEventListener('keydown', onKey);
  cancelAnimationFrame(player.raf);
  if (player.recorder && player.recorder.state !== 'inactive') {
    player.recorder.onstop = null;
    player.recorder.stop();
  }
  player = null;
}

function draw() {
  const p = player;
  drawFrame(p.ctx, p.tl, p.t);
  // Only touch the DOM when something changed: rewriting the button's text
  // every frame can swallow clicks on it in some browsers.
  setText(p.el.time, `${fmt(p.t)} / ${fmt(p.tl.total)}`);
  setText(p.el.play, p.playing ? 'Pause' : 'Play');
  if (!p.scrubbing) p.el.scrub.value = String(Math.round(p.t * 1000));
}

function setText(el, value) {
  if (el.textContent !== value) el.textContent = value;
}

function toggle() {
  if (!player || player.recorder) return;
  if (player.playing) pause();
  else play();
}

function canvasPoint(e) {
  const r = player.canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

function sceneName(s) {
  if (s.type === 'intro' || s.type === 'journeyIntro') return 'Start';
  if (s.type === 'result') return 'Result';
  if (s.type === 'podium') return 'Podium';
  return `${s.kicker} · ${s.title}`;
}

// A dot jumps to the start of its scene and plays from there; anywhere
// else on the video toggles play/pause.
function onCanvasClick(e) {
  if (!player || player.recorder) return;
  const { x, y } = canvasPoint(e);
  const i = dotAt(player.tl, x, y);
  if (i < 0) return toggle();
  pause();
  seek(player.tl.scenes[i].start + (i > 0 ? 0.001 : 0));
  play();
}

function onKey(e) {
  if (e.code !== 'Space' || !player || /INPUT|TEXTAREA|BUTTON|SELECT/.test(e.target.tagName)) return;
  e.preventDefault();
  toggle();
}

function tick(now) {
  const p = player;
  if (!p || !p.playing) return;
  if (p.last != null) p.t = Math.min(p.tl.total, p.t + (now - p.last) / 1000);
  p.last = now;
  if (p.t >= p.tl.total) {
    p.playing = false;
    draw();
    if (p.recorder) setTimeout(() => p.recorder && p.recorder.stop(), 300); // hold the last frame briefly
    return;
  }
  draw();
  p.raf = requestAnimationFrame(tick);
}

function play() {
  const p = player;
  if (!p || p.playing) return;
  if (p.t >= p.tl.total) p.t = 0;
  p.playing = true;
  p.last = null;
  p.raf = requestAnimationFrame(tick);
  draw();
}

function pause() {
  const p = player;
  if (!p) return;
  p.playing = false;
  cancelAnimationFrame(p.raf);
  draw();
}

function seek(sec) {
  player.t = Math.max(0, Math.min(player.tl.total, sec));
  draw();
}

// Records the canvas in real time while the replay plays once from the start.
function exportVideo() {
  const p = player;
  if (!p || p.recorder) return;
  if (!fontsLoaded) {
    // Recording before the fonts arrive would bake fallback text into the first frames.
    FONTS_READY.then(() => player === p && exportVideo());
    return;
  }
  if (!globalThis.MediaRecorder || !p.canvas.captureStream) {
    p.el.status.textContent = 'Video export is not supported in this browser.';
    return;
  }
  const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mimeType = types.find((tp) => MediaRecorder.isTypeSupported(tp)) || '';
  const rec = new MediaRecorder(p.canvas.captureStream(30), mimeType ? { mimeType, videoBitsPerSecond: 8000000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    const type = rec.mimeType || mimeType || 'video/webm';
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const base = (p.tl.tournament.name || 'rebattle') + (p.tl.focus ? '_' + name(p.tl.tournament, p.tl.focus) + '_journey' : '_replay');
    const safe = base.replace(/[^a-z0-9_-]+/gi, '_');
    const blob = new Blob(chunks, { type });
    p.file = new File([blob], `${safe}.${ext}`, { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = p.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    p.recorder = null;
    setControlsDisabled(false);
    p.el.status.textContent = `Saved ${p.file.name}`;
    if (navigator.canShare && navigator.canShare({ files: [p.file] })) p.el.share.hidden = false;
  };
  p.recorder = rec;
  setControlsDisabled(true);
  p.el.status.textContent = 'Recording… keep this tab visible until it finishes.';
  p.el.focus.disabled = true;
  pause();
  seek(0);
  rec.start(250);
  play();
}

function setControlsDisabled(disabled) {
  const el = player.el;
  [el.play, el.restart, el.scrub, el.export, el.focus].forEach((b) => (b.disabled = disabled));
}

function shareVideo() {
  const p = player;
  if (!p || !p.file) return;
  navigator.share({ files: [p.file], title: p.tl.tournament.name }).catch(() => {});
}

export { mount, unmount, buildTimeline, drawFrame, W, H };
