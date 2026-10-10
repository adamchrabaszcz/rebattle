// Scenes for the rounds: the intro, every heat card, the semis crossover.

import { drawLogo, drawShuffleIcon, drawTag, outcomeTag, roundRect, tagWidth, text, withAlpha, wrapLines } from './draw.js';
import { C, DRAW_EXTRA, ease, FADE, FONT, SHUFFLE, W } from './theme.js';
import { name } from './timeline.js';

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

function drawHeader(ctx, tl, scene, local = 99) {
  text(ctx, tl.tournament.name, W / 2, 120, { size: 34, color: C.muted, align: 'center', maxWidth: W - 160 });
  if (scene.draw) drawKickerWithDraw(ctx, scene, local);
  else text(ctx, scene.kicker.toUpperCase(), W / 2, 210, { size: 40, weight: 800, color: scene.color, align: 'center', spacing: 6 });
  text(ctx, scene.title, W / 2, 300, { size: 92, weight: 800, align: 'center', maxWidth: W - 120 });
  if (scene.sub) text(ctx, scene.sub, W / 2, 378, { size: 32, color: C.muted, align: 'center', maxWidth: W - 120 });
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

export { drawHeader, drawIntro, drawRound, drawQualify };
