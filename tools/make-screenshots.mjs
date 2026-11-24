// Screenshots for the README (docs/screenshots/): a made-up tournament, halfway through,
// on its public page: the bracket on a desktop and the page on a phone, each in light and
// dark. Built with the real engine, saved through the Worker on in-memory stores
// (tools/serve.mjs) and shot in headless Chrome over the DevTools Protocol. Rerun after a
// design change. No dependencies.
//
//   node tools/make-screenshots.mjs          (CHROME_PATH=... to pick a browser)
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer, memoryStores } from './serve.mjs';
import { createTournament, getPlayableMatches, recordRaceWinner } from '../public/js/engine/bracket.js';

const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));

// Made-up riders: the screenshots are public, so no real names.
const RIDERS = ['Maja Lis', 'Tom Reed', 'Ines Duarte', 'Kai Berg', 'Lena Ford', 'Oskar Wren', 'Nina Holt', 'Jonas Vale', 'Ada Moss', 'Felix Dunn', 'Rosa Lind', 'Theo Marsh'];
const PLAYED = 15; // of 24 heats: Winners nearly done, the Losers bracket under way

// The same draw and results every time (the engine draws with Math.random).
let seed = 7;
Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const tournament = createTournament({ name: 'Lakeside Cable Open', competitorNames: RIDERS, settings: { heatFormat: 'single', lapTimeSeconds: 90, breakSeconds: 30 } });
for (let i = 0; i < PLAYED; i++) {
  const match = getPlayableMatches(tournament)[0];
  const winner = Math.random() < 0.5 ? match.slotA : match.slotB;
  recordRaceWinner(tournament, match.id, winner.competitorId);
}

const server = createServer({ env: { DEV_ORGANISER_EMAIL: 'organiser@example.com', ...memoryStores() } });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const created = await fetch(BASE + '/api/manage/tournaments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: BASE },
  body: JSON.stringify({ tournament }),
});
if (!created.ok) throw new Error('saving the tournament: HTTP ' + created.status);
const { code } = await created.json();

// ---- Chrome over CDP (as in tests/browser/smoke.mjs) -------------------------------

function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const c of candidates.filter(Boolean)) {
    if (c.includes('/')) { if (existsSync(c)) return c; continue; }
    try { return execFileSync('which', [c], { encoding: 'utf8' }).trim(); } catch {}
  }
  throw new Error('Chrome not found; set CHROME_PATH');
}

const profile = mkdtempSync(join(tmpdir(), 'rebattle-shots-'));
const chrome = spawn(findChrome(), ['--headless=new', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => {
  chrome.kill();
  server.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const startBy = Date.now() + 60_000;
let port;
while (!port && Date.now() < startBy && chrome.exitCode === null) {
  await sleep(100);
  try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {}
}
let target;
while (port && !target && Date.now() < startBy) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  if (!target) await sleep(100);
}
if (!target) throw new Error('Chrome did not start');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = {};
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (pending[d.id]) { pending[d.id](d); delete pending[d.id]; }
};
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending[id] = r; ws.send(JSON.stringify({ id, method, params })); });
async function until(expression, ms = 10_000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.result?.value) return;
  }
  throw new Error('timed out waiting for: ' + expression);
}

// ---- the shots ----------------------------------------------------------------

// The bracket: the public page scrolled to the Winners bracket. The phone: the
// page of a rider who is up next in the Losers bracket.
const rider = RIDERS[2];
const SHOTS = [
  {
    name: 'bracket', width: 1440, height: 970, scale: 1, mobile: false,
    show: `[...document.querySelectorAll('h2')].find((h) => h.textContent === 'Winners Bracket').scrollIntoView(), true`,
  },
  {
    name: 'phone', width: 390, height: 844, scale: 2, mobile: true,
    show: `(() => { const a = [...document.querySelectorAll('.rider-links a')].find((a) => a.textContent.includes(${JSON.stringify(rider)})); location.href = a.href; return true; })()`,
    ready: `!!document.querySelector('.rider-headline')`,
  },
];
mkdirSync(OUT, { recursive: true });
for (const shot of SHOTS) {
  for (const scheme of ['light', 'dark']) {
    await send('Emulation.setDeviceMetricsOverride', { width: shot.width, height: shot.height, deviceScaleFactor: shot.scale, mobile: shot.mobile });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await send('Page.navigate', { url: `${BASE}/t/${code}` });
    await until(`document.querySelector('[data-live]')?.textContent === 'live' && document.fonts.status === 'loaded'`);
    await until(shot.show);
    if (shot.ready) await until(shot.ready);
    await sleep(800); // connector lines and the logo's drawing settle
    const { result } = await send('Page.captureScreenshot', { format: 'png' });
    const file = join(OUT, `${shot.name}-${scheme}.png`);
    writeFileSync(file, Buffer.from(result.data, 'base64'));
    console.log(file);
  }
}
process.exit(0);
