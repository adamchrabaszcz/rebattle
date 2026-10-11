// Makes the replay video frame by frame, faster than real time: each frame is drawn at
// its own moment (drawFrame is a pure function of time) on a canvas off screen, encoded
// with the browser's H.264 encoder (WebCodecs) and packed into an MP4 by the vendored
// muxer. Nothing has to play on screen. Browsers without WebCodecs record in real time
// instead (replay/player.js).

import { drawFrame } from './frame.js';
import { H, W } from './theme.js';

const FPS = 30;
const HOLD = 0.3; // seconds of the last frame at the end, as the real-time recording does
const BITRATE = 8000000;
// H.264 profiles that fit 1080x1920 (level 4.0 and up), best first.
const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.640032', 'avc1.42e032'];

const STALL_MS = 5000; // no frame accepted, or no finish, for this long: give up and record in real time

// Only in Chromium-based browsers (Chrome, Edge, …): Safari's encoder takes the setup and then
// stalls, and every browser on iPhone and iPad is Safari underneath (Chrome there says CriOS).
function canEncode() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return typeof VideoEncoder === 'function' && typeof VideoFrame === 'function' && /Chrome\/|Chromium\//.test(ua);
}

const stalled = (what) => new Error(`video encoder stalled (${what})`);
const withTimeout = (promise, what) => {
  promise.catch(() => {}); // if it fails after we gave up (the encoder is closed then), nobody is waiting
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(stalled(what)), STALL_MS))]);
};

async function pickConfig() {
  for (const codec of CODECS) {
    const config = { codec, width: W, height: H, bitrate: BITRATE, framerate: FPS, avc: { format: 'avc' } };
    try {
      if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
    } catch {
      // try the next one
    }
  }
  return null;
}

const nextTask = () => new Promise((r) => setTimeout(r, 0));

// Resolves to an MP4 Blob, or null when this browser can't encode it (the caller then
// records in real time). onProgress(0..1) after every few frames; cancelled() stops it.
async function encodeVideo(tl, { onProgress = () => {}, cancelled = () => false } = {}) {
  if (!canEncode()) return null;
  const config = await withTimeout(pickConfig(), 'setup');
  if (!config) return null;
  const { Muxer, ArrayBufferTarget } = await import('../vendor/mp4-muxer.js');
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: FPS }, fastStart: 'in-memory' });
  let failure = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) });
  encoder.configure(config);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const frames = Math.ceil((tl.total + HOLD) * FPS);
  try {
    for (let i = 0; i < frames; i += 1) {
      if (failure) throw failure;
      if (cancelled()) return null;
      drawFrame(ctx, tl, Math.min(i / FPS, tl.total));
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();
      // Let the encoder catch up, and the page breathe, so the progress shows. An encoder
      // that stops taking frames would wait here forever: give up after STALL_MS.
      const waitSince = Date.now();
      while (encoder.encodeQueueSize > 6) {
        if (failure) throw failure;
        if (Date.now() - waitSince > STALL_MS) throw stalled('queue');
        await nextTask();
      }
      if (i % 5 === 0) {
        onProgress(i / frames);
        await nextTask();
      }
    }
    await withTimeout(encoder.flush(), 'finish');
    if (failure) throw failure;
    muxer.finalize();
    onProgress(1);
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}

export { canEncode, encodeVideo };
