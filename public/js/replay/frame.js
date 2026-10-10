// Vertical (9:16) animated replay of a finished tournament, drawn on a canvas
// so the same frames can be previewed in-app and recorded to a video file.
//
// The timeline is a list of scenes; drawFrame(t) is a pure function of time,
// so scrubbing, playback and recording all go through the same path.
// Heat order follows how the event is run: top to bottom within a round,
// WB R1, WB R2, then LB and WB rounds in turns, the LB final, then Final 4.

import { drawLogo, withAlpha } from './draw.js';
import { drawJourneyIntro, drawPodium, drawResult } from './finale.js';
import { drawIntro, drawQualify, drawRound } from './rounds.js';
import { C, ease, FADE, H, W } from './theme.js';

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

export { DOT_Y, dotLayout, dotAt, drawFrame };
