// Closing scenes: podium, a rider's journey and result, confetti.

import * as Bracket from '../engine/bracket.js';
import { drawLink, drawMedal, easeBack, fitName, roundRect, text, withAlpha, wrapLines } from './draw.js';
import { drawHeader } from './rounds.js';
import { C, clamp01, ease, FONT, W } from './theme.js';
import { name } from './timeline.js';

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
    // Big, on one or two lines; long names get smaller instead of running off the sides.
    const fit = fitName(ctx, name(t, tl.focus), W - 160, 128, 64, 800);
    const lineH = fit.size * 1.1;
    fit.lines.forEach((l, i) => text(ctx, l, W / 2, 740 + i * lineH, { size: fit.size, weight: 800, align: 'center', maxWidth: W - 160 }));
    const y = 740 + fit.lines.length * lineH;
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
  if (scene.link) withAlpha(ctx, ease((reveal - 1.1) / 0.4), () => drawLink(ctx, scene.link, W / 2, 1480, { size: 40, twoLines: true }));
  if (scene.place <= 3) drawConfetti(ctx, reveal - 0.2, W / 2, 680);
}

function ordinal(n) {
  const v = n % 100;
  return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}

function drawPodium(ctx, tl, scene, local) {
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
  const perCol = Math.min(scene.link ? 11 : 12, Math.ceil(rest.length / 2)); // balance the two columns; leave room for the link
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

  if (scene.link) withAlpha(ctx, ease((local - winnerAt - 1.3) / 0.4), () => drawLink(ctx, scene.link, W / 2, 1755, { size: 34 }));

  drawConfetti(ctx, local - winnerAt, spots[2].x, base - spots[2].h - 150);
}

export { drawJourneyIntro, drawResult, drawPodium };
