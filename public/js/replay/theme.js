// Replay video constants: canvas size, timing, fonts and colours.

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

export { TARGET_SECONDS, DRAW_EXTRA, C, FONT, DISPLAY, fontFor, clamp01, W, FADE, SHUFFLE, ease, H, fontsLoaded, FONTS_READY };
