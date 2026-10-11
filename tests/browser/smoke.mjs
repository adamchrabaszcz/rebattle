// Browser smoke test: plays through the real app in headless Chrome, under the same
// headers (CSP included) that Cloudflare serves from public/_headers.
// No dependencies: tools/serve.mjs + the Chrome DevTools Protocol over WebSocket.
//
//   node tests/browser/smoke.mjs          (CHROME_PATH=... to pick a browser)
//
// Fails on any page error, console error, CSP violation, failed request or broken step.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, memoryStores } from '../../tools/serve.mjs';

const server = createServer({ env: {} });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
// A second server where the local stand-in login says an organiser is logged in.
const loggedIn = createServer({ env: { DEV_ORGANISER_EMAIL: 'organiser@example.com', ...memoryStores() } });
await new Promise((r) => loggedIn.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// ---- Chrome over CDP --------------------------------------------------------

function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const c of candidates.filter(Boolean)) {
    if (c.includes('/')) { if (existsSync(c)) return c; continue; }
    try { return execFileSync('which', [c], { encoding: 'utf8' }).trim(); } catch {}
  }
  throw new Error('Chrome not found; set CHROME_PATH');
}

const profile = mkdtempSync(join(tmpdir(), 'rebattle-smoke-'));
const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'];
if (process.env.CI) args.unshift('--no-sandbox');
const chrome = spawn(findChrome(), args, { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function cleanup() {
  chrome.kill();
  server.close();
  loggedIn.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.on('exit', cleanup);

let port;
for (let i = 0; i < 100 && !port; i++) {
  await sleep(100);
  try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {}
}
let target;
for (let i = 0; i < 50 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  if (!target) await sleep(100);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let seq = 0;
const pending = {};
const problems = [];
let offlineOnPurpose = false; // the offline step expects failed requests
const expected = new Set(); // error statuses a step causes on purpose, e.g. 409 (conflict), 404 (deleted)
const requests = {};
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (pending[d.id]) { pending[d.id](d); delete pending[d.id]; }
  const p = d.params;
  if (d.method === 'Runtime.exceptionThrown') problems.push('page error: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  if (d.method === 'Runtime.consoleAPICalled' && p.type === 'error') problems.push('console.error: ' + p.args.map((a) => a.value ?? a.description).join(' '));
  if (d.method === 'Log.entryAdded' && (/Content Security Policy/.test(p.entry.text) || (p.entry.level === 'error' && !(offlineOnPurpose && /ERR_INTERNET_DISCONNECTED/.test(p.entry.text)) && ![...expected].some((s) => p.entry.text.includes('status of ' + s))))) problems.push('log: ' + p.entry.text);
  if (d.method === 'Network.responseReceived' && p.response.status >= 400 && !expected.has(p.response.status)) problems.push(`HTTP ${p.response.status}: ${p.response.url}`);
  if (d.method === 'Network.loadingFailed' && !p.canceled && !offlineOnPurpose) problems.push(`request failed (${p.errorText}): ${requests[p.requestId] || p.requestId}`);
  if (d.method === 'Network.requestWillBeSent') requests[p.requestId] = p.request.url;
};
const rawSend = (method, params = {}) => new Promise((r) => { const id = ++seq; pending[id] = r; ws.send(JSON.stringify({ id, method, params })); });
// SMOKE_COVERAGE=<dir>: keep the app's coverage (tools/coverage.mjs). A page's scripts
// go away when it navigates, so it is saved before each navigation and at the end.
const COVERAGE = process.env.SMOKE_COVERAGE;
let coverageFiles = 0;
async function saveCoverage() {
  if (!COVERAGE) return;
  const r = await rawSend('Profiler.takePreciseCoverage');
  const result = (r.result?.result || []).filter((s) => /\/js\//.test(s.url));
  writeFileSync(join(COVERAGE, `page-${coverageFiles++}.json`), JSON.stringify({ result }));
}
const send = async (method, params = {}) => {
  if (method === 'Page.navigate' || method === 'Page.reload') await saveCoverage();
  return rawSend(method, params);
};
async function js(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
}
if (COVERAGE) {
  mkdirSync(COVERAGE, { recursive: true });
  await send('Profiler.enable');
  await send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
}
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Network.enable');
await send('DOM.enable');
// Dialogs would block the page: record them instead, also on pages the app navigates to itself.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__dialogs = []; window.alert = (m) => __dialogs.push('alert: ' + m); window.confirm = (m) => (__dialogs.push('confirm: ' + m), true);` });
async function until(expression, ms = 8000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) {
    const v = await js(expression).catch(() => null); // the page may be navigating
    if (v) return v;
  }
  throw new Error('timed out waiting for: ' + expression.slice(0, 80));
}

let failures = 0;
async function step(name, fn) {
  try {
    const note = await fn();
    console.log(`ok    ${name}${note ? ' (' + note + ')' : ''}`);
  } catch (e) {
    failures += 1;
    console.log(`FAIL  ${name}\n      ${e.message.split('\n')[0]}`);
  }
}
const check = (cond, msg) => { if (!cond) throw new Error(msg); };
async function view(width, height, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
}
async function open(path = '') {
  await send('Page.navigate', { url: BASE + path });
  await sleep(700);
  // dialogs would block the page; record them instead
  await js(`window.__dialogs = []; window.alert = (m) => __dialogs.push('alert: ' + m); window.confirm = (m) => (__dialogs.push('confirm: ' + m), true); 1`);
}
// Page-side helpers, injected per call (the app keeps no globals).
const H = `const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)], wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
  const saved = () => JSON.parse(localStorage.getItem('ruedaBattle.tournaments') || '[]');
  const active = () => saved().find((t) => t.id === localStorage.getItem('ruedaBattle.activeTournamentId'));
  const setVal = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  async function create(name, n, format, localOnly) {
    q('[data-action=go-setup]').click(); await wait();
    setVal(q('#f-name'), name); setVal(q('#f-count'), n); setVal(q('#f-lap'), 20);
    if (localOnly) q('#f-local').click();
    q('input[name=heatFormat][value=' + format + ']').click();
    q('[data-action=setup-next]').click(); await wait();
    qa('.name-input').forEach((el, i) => setVal(el, 'Rider ' + (i + 1)));
    q('[data-action=names-draw]').click(); await wait();
  }
  async function play(limit = 1e9) {
    let n = 0;
    for (; n < limit; n++) {
      const b = qa('[data-action=record-winner]');
      if (!b.length) break;
      b[n % b.length].click(); await wait(10);
    }
    return n;
  }`;

// ---- steps ------------------------------------------------------------------

await view(1400, 1000, false);
await open();
await js(`localStorage.clear(); 1`);
await open();

await step('home screen renders the logo with the bundled fonts', async () => {
  await js('document.fonts.ready.then(() => 1)');
  const r = await js(`(() => ({ brand: !!document.querySelector('.brand'), fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family) }))()`);
  check(r.brand, 'no logo');
  check(r.fonts.some((f) => /Funnel/.test(f)), 'Funnel fonts not loaded');
});

await step('colours follow the device: light by day, dark by night', async () => {
  const bg = `getComputedStyle(document.body).backgroundColor`;
  const seen = {};
  for (const scheme of ['light', 'dark']) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await sleep(100);
    seen[scheme] = await js(bg);
  }
  await send('Emulation.setEmulatedMedia', { features: [] });
  check(seen.light === 'rgb(246, 245, 242)' && seen.dark === 'rgb(17, 19, 24)', JSON.stringify(seen));
  return `${seen.light} / ${seen.dark}`;
});

await step('the footer switch picks Light or Dark over the device, remembered; Auto follows again', async () => {
  const bg = `getComputedStyle(document.body).backgroundColor`;
  const LIGHT = 'rgb(246, 245, 242)', DARK = 'rgb(17, 19, 24)';
  const pick = (v) => js(`document.querySelector('[data-action=set-theme][data-theme-choice=${v}]').click(), 1`);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await pick('light');
  check((await js(bg)) === LIGHT, 'Light did not apply on a dark device');
  check((await js(`document.querySelector('[data-theme-choice=light]').getAttribute('aria-pressed')`)) === 'true', 'Light not shown as chosen');
  await open(); // a reload keeps it, before the app's own code runs
  check((await js(bg)) === LIGHT && (await js(`localStorage.getItem('rebattle.theme')`)) === 'light', 'Light not remembered');
  await pick('dark');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  check((await js(bg)) === DARK, 'Dark did not hold on a light device');
  await pick('auto');
  check((await js(bg)) === LIGHT && (await js(`localStorage.getItem('rebattle.theme')`)) === null, 'Auto did not follow the device');
  await send('Emulation.setEmulatedMedia', { features: [] });
  return 'light, dark, auto';
});

await step('setup and random draw create an 11-rider tournament', () => js(`(async () => { ${H}
  await create('Smoke Open', 11, 'single');
  const t = active();
  if (!t || t.competitors.length !== 11) throw new Error('tournament not saved');
  if (!q('.event-top h1') || q('.event-top h1').textContent !== 'Smoke Open') throw new Error('title missing');
  return qa('[data-action=record-winner]').length + ' buttons ready';
})()`));

await step('every heat can be played to the end (2N heats, everyone placed)', () => js(`(async () => { ${H}
  const heats = await play();
  const t = active();
  if (t.status !== 'completed') throw new Error('status ' + t.status);
  if (t.standings.length !== 11) throw new Error('standings ' + t.standings.length);
  if (heats !== 22) throw new Error(heats + ' heats, expected 22');
  return heats + ' heats';
})()`));

await step('undo reopens the last heat, recording again completes it', () => js(`(async () => { ${H}
  q('[data-action=undo]').click(); await wait();
  if (active().status !== 'in_progress') throw new Error('undo did not reopen');
  await play();
  if (active().status !== 'completed') throw new Error('not completed again');
})()`));

await step('rename the tournament and a rider', () => js(`(async () => { ${H}
  q('[data-action=edit-names]').click(); await wait();
  setVal(q('#rename-title'), 'Smoke Open Final');
  const first = q('.rename-panel input:not(#rename-title)') || qa('#app input[type=text]').find((i) => i.id !== 'rename-title');
  setVal(first, 'Renamed Rider');
  q('[data-action=save-names]').click(); await wait();
  const t = active();
  if (t.name !== 'Smoke Open Final') throw new Error('title not saved: ' + t.name);
  if (!t.competitors.some((c) => c.name === 'Renamed Rider')) throw new Error('rider not renamed');
})()`));

await step('export JSON offers a rebattle_*.json download', () => js(`(async () => { ${H}
  let name = '';
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { name = this.download; };
  q('[data-action=toggle-more]')?.click();
  q('[data-action=export]').click(); await wait();
  HTMLAnchorElement.prototype.click = orig;
  if (!/^rebattle_.*\\.json$/.test(name)) throw new Error('download name ' + name);
  return name.replace(/_[^_]+\\.json$/, '_….json');
})()`));

const tmp = mkdtempSync(join(tmpdir(), 'rebattle-import-'));
await step('import rejects a crafted file and re-imports a valid one after asking', async () => {
  const good = await js(`localStorage.getItem('ruedaBattle.tournaments')`);
  const t = JSON.parse(good)[0];
  writeFileSync(join(tmp, 'bad.json'), JSON.stringify({ ...t, id: 'x" onmouseover="alert(1)' }));
  writeFileSync(join(tmp, 'good.json'), JSON.stringify(t));
  for (const file of ['bad.json', 'good.json']) {
    const { root } = (await send('DOM.getDocument')).result; // fresh: the app re-renders
    const { nodeId } = (await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[data-action=import-file]' })).result;
    await send('DOM.setFileInputFiles', { nodeId, files: [join(tmp, file)] });
    await sleep(300);
  }
  const dialogs = await js('__dialogs');
  check(dialogs.some((d) => d.startsWith('alert:')), 'crafted file not rejected: ' + JSON.stringify(dialogs));
  check(dialogs.some((d) => d.startsWith('confirm:')), 'no confirm before replacing: ' + JSON.stringify(dialogs));
  check(!dialogs.some((d) => /onmouseover/.test(d)), 'crafted id echoed back');
  return dialogs.length + ' dialogs';
});
rmSync(tmp, { recursive: true, force: true });

await step('replay video draws on the canvas', () => js(`(async () => { ${H}
  q('[data-action=open-replay]').click(); await wait(1500);
  const cv = q('#replay-canvas');
  if (!cv) throw new Error('no canvas');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 300) lit++;
  if (lit < 50) throw new Error('canvas looks empty');
  q('[data-action=close-replay]').click(); await wait();
  return cv.width + 'x' + cv.height;
})()`));

// Making the video in real time: the button says how long it takes, the progress and the
// note show under it, a hidden tab pauses it, and it ends with the saved file. On the
// shortest video, the last rider's journey (~10 s).
await step('making the video in real time says what it is doing', () => js(`(async () => { ${H}
  const encoder = window.VideoEncoder;
  window.VideoEncoder = undefined; // record in real time, also where frame-by-frame encoding exists
  const setHidden = (hidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  try {
    q('[data-action=open-replay]').click(); await wait(800);
    const focus = q('[data-replay=focus]');
    focus.value = focus.options[focus.options.length - 1].value;
    focus.dispatchEvent(new Event('change', { bubbles: true })); await wait(100);
    const label = q('[data-replay=export]').textContent;
    if (!/^Make video \\(\\d+:\\d\\d\\)$/.test(label)) throw new Error('button: ' + label);
    q('[data-replay=export]').click(); await wait(600);
    const making = () => q('[data-replay=making]').textContent;
    if (!/Making your video: 0:0\\d of .+plays once to record it/.test(making()) || !q('[data-replay=play]').disabled) throw new Error('not recording: ' + making());
    if (!(q('[data-replay=progress]').value > 0)) throw new Error('no progress');
    setHidden(true);
    if (!/Paused: come back to this tab/.test(making())) throw new Error('hidden tab not paused: ' + making());
    setHidden(false);
    if (!/plays once to record it/.test(making())) throw new Error('not resumed: ' + making());
    const start = Date.now();
    while (!/Video saved/.test(making()) && Date.now() - start < 60000) await wait(200);
    if (!/Video saved: .+_journey\\.(mp4|webm)/.test(making())) throw new Error('not saved: ' + making());
    if (q('[data-replay=export]').textContent !== label || q('[data-replay=play]').disabled) throw new Error('controls not back');
    q('[data-action=close-replay]').click(); await wait();
    return label + ', paused while hidden, saved after ' + ((Date.now() - start) / 1000).toFixed(0) + ' s';
  } finally {
    delete document.hidden;
    window.VideoEncoder = encoder;
  }
})()`));

// Making the video frame by frame, where the browser can encode: progress, then the saved
// file, in seconds rather than the video's length.
await step('making the replay video frame by frame saves it', () => js(`(async () => { ${H}
  q('[data-action=open-replay]').click(); await wait(800);
  q('[data-replay=export]').click();
  let value = 0;
  for (let i = 0; i < 100 && !(value > 0); i++) { await wait(50); value = q('[data-replay=progress]').value; }
  if (q('[data-replay=making]').hidden || !(value > 0)) throw new Error('no progress: ' + q('[data-replay=making]').textContent);
  const start = Date.now();
  while (!q('[data-replay=progress]').hidden && Date.now() - start < 90000) await wait(100);
  const text = q('[data-replay=making]').textContent;
  if (!/Video saved: .+_replay\\.(mp4|webm)/.test(text)) throw new Error('not saved: ' + text);
  q('[data-action=close-replay]').click(); await wait();
  return (typeof VideoEncoder === 'function' ? 'frame by frame' : 'in real time') + ', ' + ((Date.now() - start) / 1000).toFixed(1) + ' s';
})()`));

// Where the browser can't encode (no H.264 setting fits, the encoder fails, or it stalls:
// stops taking frames or never finishes) it records in real time instead (the step above
// follows one to the end); leaving the screen cancels it here. Without MediaRecorder
// either, it says so. The stalls take the encoder's 5 s patience each.
await step('without a usable encoder the video is recorded in real time', () => js(`(async () => { ${H}
  const encoder = window.VideoEncoder, recorder = window.MediaRecorder;
  const make = async () => {
    q('[data-action=open-replay]').click(); await wait(800);
    q('[data-replay=export]').click();
    const text = () => (q('[data-replay=making]').hidden ? q('[data-replay=status]').textContent : q('[data-replay=making]').textContent);
    const start = Date.now();
    do await wait(200); while (!/plays once to record it|not supported/.test(text()) && Date.now() - start < 20000);
    const r = { text: text(), locked: q('[data-replay=play]').disabled };
    q('[data-action=close-replay]').click(); await wait();
    return r;
  };
  // An encoder that takes the setup and then stalls, like Safari's.
  const stalling = (queue, finish) => class {
    static async isConfigSupported() { return { supported: true }; }
    constructor() { this.state = 'unconfigured'; }
    configure() { this.state = 'configured'; }
    get encodeQueueSize() { return queue; }
    encode() {}
    flush() { return finish ? Promise.resolve() : new Promise(() => {}); }
    close() { this.state = 'closed'; }
  };
  try {
    const fallbacks = {
      'no H.264 setting': class { static async isConfigSupported() { return { supported: false }; } },
      'the encoder fails': class { static async isConfigSupported() { return { supported: true }; } constructor() { throw new Error('no encoder'); } },
      'it stops taking frames': stalling(99, true),
      'it never finishes': stalling(0, false),
    };
    for (const [why, fake] of Object.entries(fallbacks)) {
      window.VideoEncoder = fake;
      const r = await make();
      if (!/plays once to record it/.test(r.text) || !r.locked) throw new Error(why + ': not recording: ' + r.text);
    }
    window.VideoEncoder = undefined;
    window.MediaRecorder = undefined;
    const r = await make();
    if (!/not supported/.test(r.text)) throw new Error('no recorder: ' + r.text);
    return 'records when no H.264 setting fits, the encoder fails or stalls; says when it cannot';
  } finally {
    window.VideoEncoder = encoder;
    window.MediaRecorder = recorder;
  }
})()`));

await step('40-rider bracket draws connector lines', () => js(`(async () => { ${H}
  q('[data-action=go-home]').click(); await wait();
  await create('Big Field', 40, 'bo3');
  await play(60);
  await wait(200);
  const lines = qa('svg path').length;
  if (lines < 20) throw new Error(lines + ' connector paths');
  return lines + ' paths';
})()`));

// ---- read-only view -------------------------------------------------------

await open('?view');
await step('?view shows the active tournament read-only', () => js(`(async () => { ${H}
  await wait(200);
  if (!q('.view-badge')) throw new Error('no view-only badge');
  const offered = new Set(qa('[data-action]').map((el) => el.dataset.action));
  for (const a of ['record-winner', 'undo', 'edit-names', 'export', 'import-file', 'new-tournament', 'toggle-more']) if (offered.has(a)) throw new Error('view offers ' + a);
  if (!q('.up-next')) throw new Error('no Up next');
  return [...offered].join(', ');
})()`));

await step('the view ignores organiser actions even if a button is forced in', () => js(`(async () => { ${H}
  const before = localStorage.getItem('ruedaBattle.tournaments');
  const card = q('.up-next .match-card');
  const slot = card.querySelector('[data-cid]');
  for (const html of [
    '<button data-action="record-winner" data-match="' + card.dataset.matchId + '" data-winner="' + slot.dataset.cid + '">x</button>',
    '<button data-action="delete-tournament" data-id="' + active().id + '">x</button>',
    '<button data-action="new-tournament">x</button>',
  ]) {
    q('#app').insertAdjacentHTML('afterbegin', html);
    q('#app > button').click(); await wait();
    q('#app > button')?.remove();
  }
  if (localStorage.getItem('ruedaBattle.tournaments') !== before) throw new Error('saved data changed');
  if (!q('.view-badge')) throw new Error('left the view');
})()`));

await step('the view follows results recorded in another tab', async () => {
  // Runs won plus heats finished, counted on the bracket graphs (each heat appears there
  // once; "Up next" repeats some), so it grows with every recorded run, best of 3 included.
  const count = `[...document.querySelectorAll('.bracket-graph .match-card')].reduce((n, c) => n + c.classList.contains('completed') + [...c.querySelectorAll('.score')].reduce((k, el) => k + Number(el.textContent), 0), 0)`;
  const before = await js(count);
  // A second, real tab plays the organiser and records one heat.
  const { targetId } = (await send('Target.createTarget', { url: BASE })).result;
  const other = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.id === targetId);
  const ws2 = new WebSocket(other.webSocketDebuggerUrl);
  await new Promise((r) => (ws2.onopen = r));
  let id2 = 0;
  const waiting = {};
  ws2.onmessage = (m) => { const d = JSON.parse(m.data); if (waiting[d.id]) { waiting[d.id](d); delete waiting[d.id]; } };
  const send2 = (method, params = {}) => new Promise((r) => { const i = ++id2; waiting[i] = r; ws2.send(JSON.stringify({ id: i, method, params })); });
  await sleep(1200);
  const clicked = (await send2('Runtime.evaluate', { expression: `(() => { const b = document.querySelector('[data-action=record-winner]'); if (!b) return false; b.click(); return true; })()`, returnByValue: true })).result.result.value;
  ws2.close();
  await send('Target.closeTarget', { targetId });
  check(clicked, 'organiser tab had no Won button');
  // Background tabs get the storage event with some delay, so poll for it.
  let after = before;
  for (let i = 0; i < 50 && after <= before; i++) {
    await sleep(100);
    after = await js(count);
  }
  check(after > before, `view did not update (${before} -> ${after})`);
  return `progress ${before} -> ${after}`;
});

await step('the logo leaves the view for the full app', async () => {
  await js(`document.querySelector('[data-action=go-home]').click(), 1`); // navigates away
  await sleep(1200);
  const r = await js(`({ search: location.search, won: !!document.querySelector('[data-action=record-winner]'), badge: !!document.querySelector('.view-badge') })`);
  check(!r.search && r.won && !r.badge, 'still in view mode: ' + JSON.stringify(r));
});

// ---- organiser login ------------------------------------------------------------

await step('home shows the organiser login line, logged out and logged in', async () => {
  await open();
  await sleep(500);
  await js(`document.querySelector('[data-action=go-home]')?.click(), 1`); // the app reopens the last tournament
  await sleep(200);
  const out = await js(`(() => { const a = document.querySelector('[data-account] a'); return a ? a.getAttribute('href') + ' ' + a.textContent : document.querySelector('[data-account]')?.textContent; })()`);
  check(out === '/api/manage/login Organiser log in', 'logged out: ' + out);
  await send('Page.navigate', { url: `http://127.0.0.1:${loggedIn.address().port}/` });
  await sleep(1200);
  const inn = await js(`document.querySelector('[data-account]')?.textContent`);
  check(/Logged in as organiser@example\.com/.test(inn) && /Log out/.test(inn), 'logged in: ' + inn);
  return inn.replace(/\s+/g, ' ');
});

// ---- online tournaments (logged in, in-memory stores) ------------------------------

const L = `http://127.0.0.1:${loggedIn.address().port}`;
const serverCopy = (code) => `fetch('/api/manage/t/${code}').then((r) => r.json())`;
const sync = `document.querySelector('[data-sync]')?.textContent`;
let code;
let movedCode;

await step('logged in, a new tournament is saved online by default', async () => {
  await send('Page.navigate', { url: L + '/' });
  await until(`document.querySelector('[data-lists]')?.textContent.includes('No online tournaments yet')`);
  await js(`(async () => { ${H} q('[data-action=go-setup]').click(); await wait(); return !!q('#f-local') && !q('#f-local').checked; })()`).then((ok) => check(ok, 'no unticked "keep in this browser" option'));
  // Who can find it: offered with both options explained, unlisted unless chosen; gone for a local one.
  const vis = await js(`(async () => { ${H} const before = { shown: !q('#f-visibility').hidden, checked: q('input[name=visibility]:checked').value, explained: qa('#f-visibility .sub').length }; q('#f-local').click(); await wait(); const hidden = q('#f-visibility').hidden; q('#f-local').click(); return { ...before, hidden }; })()`);
  check(vis.shown && vis.checked === 'unlisted' && vis.explained === 2 && vis.hidden, 'visibility choice at setup: ' + JSON.stringify(vis));
  await js(`(async () => { ${H} q('[data-action=go-home]').click(); await wait(); await create('Online Open', 9, 'single'); return 1; })()`);
  code = await until(`location.pathname.startsWith('/manage/') && document.querySelector('[data-action=record-winner]') && location.pathname.split('/')[2]`);
  check(/^online-open-[a-z2-9]{4}$/.test(code), 'code ' + code);
  await until(`${sync} === 'saved online'`);
  return code;
});

await step('results go to the server, and a fresh device loads them from there', async () => {
  await js(`(async () => { ${H} await play(3); return 1; })()`);
  await until(`${sync} === 'saved online'`);
  const server = await js(`${serverCopy(code)}.then((d) => ({ version: d.version, races: [...d.tournament.wb.matches, ...d.tournament.lb.matches].reduce((n, m) => n + m.races.length, 0) }))`);
  check(server.version === 4 && server.races === 3, 'server has ' + JSON.stringify(server));
  await js(`localStorage.removeItem('rebattle.online'), 1`); // as if on another device
  await send('Page.reload');
  await until(`document.querySelectorAll('.bracket-graph .match-card.completed').length >= 3 && ${sync} === 'saved online'`);
  return 'version ' + server.version;
});

await step('offline, changes wait on the device and upload when back online', async () => {
  offlineOnPurpose = true;
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await js(`(async () => { ${H} await play(2); return 1; })()`);
  await until(`${sync} === 'offline, changes waiting'`);
  const before = await js(`${serverCopy(code)}.then((d) => d.version)`).catch(() => 'unreachable');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await until(`${sync} === 'saved online'`, 15000);
  offlineOnPurpose = false;
  const races = await js(`${serverCopy(code)}.then((d) => [...d.tournament.wb.matches, ...d.tournament.lb.matches].reduce((n, m) => n + m.races.length, 0))`);
  check(races === 5, 'server has ' + races + ' runs, expected 5');
  return `server while offline: ${before}; after: 5 runs`;
});

await step('a change from another device: "use the other version" and "keep mine"', async () => {
  // The other device renames the tournament on the server.
  const other = (name) => js(`${serverCopy(code)}.then((d) => { d.tournament.name = ${JSON.stringify(name)}; return fetch('/api/manage/t/${code}', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseVersion: d.version, tournament: d.tournament }) }).then((r) => r.status); })`);
  expected.add(409);
  check((await other('Renamed Elsewhere')) === 200, 'other device could not save');
  await js(`(async () => { ${H} await play(1); return 1; })()`);
  await until(`!!document.querySelector('[data-action=sync-use-theirs]')`);
  const blocked = await js(`(async () => { ${H} const n = qa('[data-action=record-winner]').length; __dialogs.length = 0; q('[data-action=record-winner]').click(); await wait(); return __dialogs.some((d) => d.includes('another device')) && qa('[data-action=record-winner]').length === n; })()`);
  check(blocked, 'recording was not paused during the conflict');
  await js(`document.querySelector('[data-action=sync-use-theirs]').click(), 1`);
  await until(`!document.querySelector('[data-action=sync-use-theirs]') && document.querySelector('.event-top h1').textContent === 'Renamed Elsewhere' && ${sync} === 'saved online'`);

  check((await other('Renamed Again')) === 200, 'other device could not save');
  await js(`(async () => { ${H} await play(1); return 1; })()`);
  await until(`!!document.querySelector('[data-action=sync-keep-mine]')`);
  await js(`document.querySelector('[data-action=sync-keep-mine]').click(), 1`);
  await until(`${sync} === 'saved online'`);
  const name = await js(`${serverCopy(code)}.then((d) => d.tournament.name)`);
  expected.delete(409);
  check(name === 'Renamed Elsewhere', 'server name after keep mine: ' + name);
});

await step('a local tournament can be moved online', async () => {
  await send('Page.navigate', { url: L + '/tournaments' });
  await until(`!!document.querySelector('[data-action=go-setup]')`);
  await js(`(async () => { ${H} await create('Local First', 6, 'single', true); return 1; })()`);
  await until(`location.pathname === '/' && !!document.querySelector('[data-action=record-winner]')`);
  await js(`document.querySelector('[data-action=go-home]').click(), 1`);
  await until(`!!document.querySelector('[data-action=move-online]')`);
  await js(`document.querySelector('[data-action=move-online]').click(), 1`);
  const moved = await until(`location.pathname.startsWith('/manage/local-first-') && ${sync} === 'saved online' && location.pathname`);
  await send('Page.navigate', { url: L + '/tournaments' });
  await until(`document.querySelectorAll('[data-lists] a[href^="/manage/"]').length === 2`);
  check(!(await js(`!!document.querySelector('[data-action=move-online]')`)), 'still listed in this browser');
  movedCode = moved.split('/')[2];
  return moved;
});

await step('an online tournament can be deleted', async () => {
  await js(`document.querySelector('[data-action=delete-online][data-code="${code}"]').click(), 1`);
  await until(`document.querySelectorAll('[data-lists] a[href^="/manage/"]').length === 1`);
  expected.add(404);
  const status = await js(`fetch('/api/manage/t/${code}').then((r) => r.status)`);
  await sleep(200);
  expected.delete(404);
  check(status === 404, 'server still has it: ' + status);
});

// ---- public pages ------------------------------------------------------------

// Another device (the organiser's phone) records one heat through the API; the page
// runs the real engine for it.
const recordElsewhere = (c) => js(`(async () => {
  const B = await import('/js/engine/bracket.js');
  const d = await fetch('/api/manage/t/${c}').then((r) => r.json());
  const [m] = B.getPlayableMatches(d.tournament);
  B.recordRaceWinner(d.tournament, m.id, m.slotA.competitorId);
  return fetch('/api/manage/t/${c}', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseVersion: d.version, tournament: d.tournament }) }).then((r) => r.status);
})()`);
const doneOnBracket = `[...document.querySelectorAll('.bracket-graph .match-card.completed')].filter((c) => !c.classList.contains('bye')).length`;

await step('the public page shows the tournament live, read-only, without owner emails', async () => {
  await send('Page.navigate', { url: `${L}/t/${movedCode}` });
  await until(`document.querySelector('[data-live]')?.textContent === 'live'`);
  const r = await js(`({ won: !!document.querySelector('[data-action=record-winner]'), undo: !!document.querySelector('[data-action=undo]'), riders: document.querySelectorAll('.rider-links a').length, share: !!document.querySelector('[data-action=open-share]') })`);
  check(!r.won && !r.undo, 'organiser buttons on the public page: ' + JSON.stringify(r));
  check(r.riders === 6 && r.share, 'riders/share: ' + JSON.stringify(r));
  const body = await js(`fetch('/api/t/${movedCode}').then((r) => r.text())`);
  check(!body.includes('organiser@example.com'), 'public read leaks owners');
  return r.riders + ' riders';
});

await step('a result recorded elsewhere appears on the public page by itself', async () => {
  const before = await js(doneOnBracket);
  check((await recordElsewhere(movedCode)) === 200, 'organiser save failed');
  await until(`${doneOnBracket} > ${before}`, 5000);
  return `${before} -> ${await js(doneOnBracket)} heats`;
});

await step("a rider's page shows where they stand and what's next, and updates live", async () => {
  const href = await js(`document.querySelector('.rider-links a').getAttribute('href')`);
  check(href.startsWith(`/t/${movedCode}/`) && /\/[a-z2-9]{6}$/.test(href), 'rider link ' + href);
  await send('Page.navigate', { url: L + href });
  await until(`document.querySelector('[data-live]')?.textContent === 'live' && !!document.querySelector('.rider-headline')`);
  const r = await js(`({ name: document.querySelector('.event-top h1').textContent, head: document.querySelector('.rider-headline').textContent, next: document.querySelector('.rider-next')?.textContent || '', heats: document.querySelectorAll('.rider-heats li').length })`);
  check(/^Rider [1-6]$/.test(r.name) && r.head, 'rider page: ' + JSON.stringify(r));
  check(/Next:|Waiting/.test(r.next) || /Out|place/.test(r.head), 'no next heat: ' + JSON.stringify(r));
  // Play the rest elsewhere: the page follows to the end and offers the journey video.
  for (let i = 0; i < 12 && !(await js(`fetch('/api/t/${movedCode}').then((r) => r.json()).then((d) => d.tournament.status === 'completed')`)); i++) await recordElsewhere(movedCode);
  await until(`!!document.querySelector('[data-action=open-journey]') && /place/.test(document.querySelector('.rider-headline').textContent)`, 5000);
  const done = await js(`document.querySelector('.rider-headline').textContent + ' · ' + document.querySelectorAll('.rider-heats li').length + ' heats'`);
  await js(`document.querySelector('[data-action=open-journey]').click(), 1`);
  await until(`!!document.querySelector('#replay-canvas')`);
  await js(`document.querySelector('[data-action=close-replay]').click(), 1`);
  await until(`!!document.querySelector('.rider-headline')`);
  return r.name + ': ' + done;
});

await step('share panel: link, QR code and a printable poster', async () => {
  await send('Page.navigate', { url: `${L}/t/${movedCode}` });
  await until(`!!document.querySelector('[data-action=open-share]')`);
  await js(`document.querySelector('[data-action=open-share]').click(), 1`);
  const r = await until(`document.querySelector('.share-url') && ({ url: document.querySelector('.share-url').value, qr: document.querySelectorAll('.share-qr .qr > path').length, mark: !!document.querySelector('.share-qr .qr > svg path'), poster: !!document.querySelector('.poster') })`);
  check(r.url === `${L}/t/${movedCode}` && r.qr === 1 && r.mark && r.poster, 'share panel: ' + JSON.stringify(r));
  await js(`window.print = () => {}; document.querySelector('[data-action=print-poster]').click(), 1`);
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  const printed = await js(`({ poster: getComputedStyle(document.querySelector('.poster')).display, bracket: document.querySelector('.bracket-graph').getClientRects().length ? 'shown' : 'none', qr: Math.round(document.querySelector('.poster-qr').getBoundingClientRect().width), url: document.querySelector('.poster-url').textContent })`);
  await send('Emulation.setEmulatedMedia', { media: '' });
  check(printed.poster === 'flex' && printed.bracket === 'none' && printed.url.endsWith('/t/' + movedCode), 'poster: ' + JSON.stringify(printed));
  await js(`document.querySelector('[data-action=close-share]').click(), 1`);
  await until(`!document.querySelector('.share-panel')`);
  return printed.url;
});

await step('the organiser screen offers Share and the public link', async () => {
  await send('Page.navigate', { url: `${L}/manage/${movedCode}` });
  await until(`!!document.querySelector('[data-action=open-share]') && !!document.querySelector('footer a[href="/t/${movedCode}"]')`);
});

await step('the organiser sees who can find the tournament and can list it on rebattle.app', async () => {
  const listedCodes = `fetch('/api/competitions').then((r) => r.json()).then((d) => d.competitions.map((c) => c.code))`;
  // Moved online, so unlisted: the screen says so and explains it.
  const line = await until(`document.querySelector('.visibility-line')?.textContent`);
  check(/Unlisted/.test(line) && /only people with the link/.test(line), 'visibility line: ' + line);
  check(!(await js(listedCodes)).includes(movedCode), 'listed before choosing to');
  await js(`document.querySelector('[data-action=open-visibility]').click(), 1`);
  await until(`!!document.querySelector('.visibility-panel')`);
  await js(`(() => { const r = document.querySelector('input[name=visibility][value=listed]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-action=save-visibility]').click(); return 1; })()`);
  await until(`!document.querySelector('.visibility-panel') && /Listed on rebattle\\.app/.test(document.querySelector('.visibility-line')?.textContent || '')`);
  check((await js(listedCodes)).includes(movedCode), 'not on the public list after listing');
  await send('Page.reload');
  await until(`/Listed on rebattle\\.app/.test(document.querySelector('.visibility-line')?.textContent || '')`);
  // The share panel repeats it.
  await js(`document.querySelector('[data-action=open-share]').click(), 1`);
  check(/Listed on rebattle\.app/.test(await until(`document.querySelector('.share-panel .visibility-line')?.textContent`)), 'share panel does not say');
  // Offline, a change can't be saved: the organiser is told, and nothing changes.
  offlineOnPurpose = true;
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await js(`(() => { __dialogs.length = 0; document.querySelector('[data-action=open-visibility]').click(); const r = document.querySelector('input[name=visibility][value=unlisted]'); r.checked = true; document.querySelector('[data-action=save-visibility]').click(); return 1; })()`);
  const told = await until(`__dialogs.find((d) => d.includes("Couldn't change it"))`);
  const kept = await js(`({ panel: !!document.querySelector('.visibility-panel'), saveEnabled: !document.querySelector('[data-action=save-visibility]').disabled })`);
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  offlineOnPurpose = false;
  check(kept.panel && kept.saveEnabled, 'after a failed save: ' + JSON.stringify(kept));
  await js(`document.querySelector('[data-action=cancel-visibility]').click(), 1`);
  check((await js(listedCodes)).includes(movedCode), 'a failed change unlisted it anyway');
  return 'unlisted -> listed; offline: ' + told.replace(/^alert: /, '');
});

// ---- addresses --------------------------------------------------------------

await step('unknown tournaments, riders and paths show "not found", with all files loading', async () => {
  expected.add(404);
  for (const path of ['t/cable-open-x7k2', `t/${movedCode}/nobody`, 'no/such/page']) {
    await send('Page.navigate', { url: `${L}/${path}` });
    await until(`document.querySelector('.card h2')?.textContent === 'Nothing here' && !!document.querySelector('.brand') && [...document.fonts].some((f) => f.status === 'loaded')`).catch(() => {
      throw new Error(path + ': no "Nothing here"');
    });
  }
  await sleep(200);
  expected.delete(404);
  await js(`document.querySelector('[data-action=go-home]').click(), 1`);
  await sleep(1200);
  // This browser has tournaments but none running: / shows the list (at /tournaments).
  const home = await js(`({ path: location.pathname, list: !!document.querySelector('[data-lists]') })`);
  check(home.path === '/tournaments' && home.list, 'Open rebattle did not go to the list: ' + JSON.stringify(home));
});

// ---- introduction and returning visitors --------------------------------------

await step('listed competitions show on /competitions and the intro; unlisted pages ask not to be indexed', async () => {
  const setListed = (listed) => js(`fetch('/api/manage/t/${movedCode}/visibility', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listed: ${listed} }) }).then((r) => r.status)`);
  const noindex = `!!document.querySelector('meta[name=robots][content=noindex]')`;
  await send('Page.navigate', { url: L + '/tournaments' });
  await until(`!!document.querySelector('[data-lists]')`);
  check((await setListed(true)) === 200, 'could not list it');

  await send('Page.navigate', { url: L + '/competitions' });
  const card = await until(`(() => { const a = document.querySelector('.competition-card[href="/t/${movedCode}"]'); return a && a.textContent.replace(/\\s+/g, ' ').trim(); })()`);
  check(/Winner:/.test(card) && /6 riders/.test(card), 'card: ' + card);
  check(await js(`!!document.querySelector('.site-footer a[href="/competitions"]')`), 'no footer link');

  await send('Page.navigate', { url: L + '/about' });
  await until(`!document.querySelector('[data-intro-competitions]').hidden && !!document.querySelector('[data-intro-competitions] a[href="/t/${movedCode}"]')`);

  await send('Page.navigate', { url: `${L}/t/${movedCode}` });
  await until(`document.querySelector('[data-live]')?.textContent === 'live'`);
  check(!(await js(noindex)), 'a listed page asks not to be indexed');
  check((await setListed(false)) === 200, 'could not unlist it');
  await send('Page.reload');
  await until(`document.querySelector('[data-live]')?.textContent === 'live'`);
  check(await js(noindex), 'an unlisted page can be indexed');
  return card;
});

await step('/about: Follow takes a code or a pasted link, and rejects anything else', async () => {
  await send('Page.navigate', { url: L + '/about' });
  await until(`!!document.querySelector('#f-follow')`);
  const type = (v) => js(`(() => { const i = document.querySelector('#f-follow'); i.value = ${JSON.stringify(v)}; document.querySelector('[data-action=follow]').click(); return document.querySelector('#follow-error')?.textContent || ''; })()`);
  check(/doesn’t look like/.test(await type('not a code!')), 'bad code accepted');
  await type('  ' + movedCode.toUpperCase() + ' ');
  await until(`location.pathname === '/t/${movedCode}' && document.querySelector('[data-live]')?.textContent === 'live'`);
  const rider = await js(`document.querySelector('.rider-links a').getAttribute('href')`);
  await send('Page.navigate', { url: L + '/about' });
  await until(`!!document.querySelector('#f-follow')`);
  const pasted = JSON.stringify('https://rebattle.app' + rider + '?ref=poster'); // a link from another device
  await js(`(() => { const i = document.querySelector('#f-follow'); i.value = ${pasted}; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1; })()`);
  await until(`location.pathname === ${JSON.stringify(rider)} && !!document.querySelector('.rider-headline')`);
  return rider;
});

await step('a logged-in organiser goes back to their running online tournament from /', async () => {
  await send('Page.navigate', { url: L + '/tournaments' });
  await until(`!!document.querySelector('[data-action=go-setup]')`);
  await js(`(async () => { ${H} await create('Still Running', 5, 'single'); return 1; })()`);
  const running = await until(`location.pathname.startsWith('/manage/still-running-') && ${sync} === 'saved online' && location.pathname`);
  await send('Page.navigate', { url: L + '/' });
  await until(`location.pathname === ${JSON.stringify(running)} && !!document.querySelector('[data-action=record-winner]')`);
  await js(`document.querySelector('[data-action=go-home]').click(), 1`); // the logo: the list, not back again
  await until(`location.pathname === '/tournaments' && !!document.querySelector('[data-lists]')`);
  return running;
});

await step('a new visitor gets the introduction at /, and can start a tournament from it', async () => {
  await send('Page.navigate', { url: BASE });
  await sleep(500);
  const kept = await js(`JSON.stringify(Object.fromEntries(Object.entries(localStorage)))`);
  await js(`localStorage.clear(), 1`);
  await send('Page.navigate', { url: BASE });
  await until(`!!document.querySelector('#f-follow') && !!document.querySelector('.intro-steps') && location.pathname === '/'`);
  check(!(await js(`!!document.querySelector('a[href="/tournaments"]')`)), 'a new visitor is offered "Your tournaments"');
  await js(`document.querySelector('[data-action=go-setup]').click(), 1`);
  await until(`!!document.querySelector('#f-name')`);
  await js(`(() => { localStorage.clear(); const o = ${kept}; for (const k in o) localStorage.setItem(k, o[k]); return 1; })()`);
});

await step('phone: tapping a list row opens it, its Delete button doesn\'t', async () => {
  await view(390, 844, true);
  await open('tournaments');
  await until(`!!document.querySelector('[data-action=open-row]')`);
  const r = await js(`(async () => { ${H}
    if (qa('.open-btn').some((b) => b.offsetParent)) throw new Error('Open buttons shown on a phone');
    window.confirm = () => false; // Delete asks first; answer no
    q('[data-action=open-row] [data-action=delete-tournament]').click(); await wait();
    if (!q('[data-lists]')) throw new Error('Delete opened the tournament');
    const name = q('[data-action=open-row] strong').textContent;
    q('[data-action=open-row] .meta').click(); await wait();
    return { name, title: q('.event-top h1')?.textContent, path: location.pathname };
  })()`);
  check(r.title === r.name && r.path === '/', 'row did not open: ' + JSON.stringify(r));
  return r.name;
});

await view(390, 844, true);
await open();
await step('phone: round tabs and the more-menu work', () => js(`(async () => { ${H}
  await wait(300);
  const more = q('.toolbar-more');
  const before = getComputedStyle(more).display;
  q('[data-action=toggle-more]').click(); await wait();
  const after = getComputedStyle(more).display;
  if (before === after) throw new Error('menu did not toggle');
  if (document.documentElement.scrollWidth > 390) throw new Error('page scrolls sideways: ' + document.documentElement.scrollWidth);
  return before + ' -> ' + after;
})()`));

await step('phone: a sideways swipe changes the round, a vertical one doesn\'t', async () => {
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await open(); // touch takes effect on a fresh page
  const locate = () => js(`(() => { const g = document.querySelector('.bracket-graph.has-tabs'); g.scrollIntoView({ block: 'center' }); const r = g.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 120)) }; })()`);
  let where = await locate();
  const active = `[...document.querySelector('.round-tabs').querySelectorAll('button')].findIndex((b) => b.classList.contains('active'))`;
  const swipe = async (dx, dy) => {
    const at = (x, y) => [{ x, y }];
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(where.x, where.y) });
    for (let i = 1; i <= 5; i++) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(where.x + (dx * i) / 5, where.y + (dy * i) / 5) });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(250);
  };
  const first = await js(active);
  await swipe(0, -120); // scrolling
  check((await js(active)) === first, 'a vertical swipe changed the round');
  where = await locate(); // the page scrolled
  await swipe(first > 0 ? 140 : -140, 10);
  const second = await js(active);
  check(second === first + (first > 0 ? -1 : 1), `swipe: tab ${first} -> ${second}`);
  check(await js(`document.querySelector('.bracket-graph.has-tabs .bracket-column.active').className.includes('slide-from')`), 'no slide-in');
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  return `tab ${first} -> ${second}`;
});

await step('no page errors, console errors, CSP violations or failed requests', async () => {
  await sleep(200);
  check(!problems.length, problems.join('\n      '));
});

await saveCoverage();
ws.close();
console.log(failures ? `\n${failures} step(s) failed` : '\nall steps passed');
process.exit(failures ? 1 : 0);
