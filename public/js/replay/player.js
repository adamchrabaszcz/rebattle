// In-app player: playback, scrubbing, scene dots, recording and sharing the video.

import { DOT_Y, dotAt, dotLayout, drawFrame } from './frame.js';
import { FONTS_READY, fontsLoaded, H, W } from './theme.js';
import { buildTimeline, name } from './timeline.js';

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

export { mount, unmount };
