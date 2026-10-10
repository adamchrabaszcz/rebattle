// Browser smoke test: plays through the real app in headless Chrome, under the same
// headers (CSP included) that Cloudflare serves from public/_headers.
// No dependencies: tools/serve.mjs + the Chrome DevTools Protocol over WebSocket.
//
//   node tests/browser/smoke.mjs          (CHROME_PATH=... to pick a browser)
//
// Fails on any page error, console error, CSP violation, failed request or broken step.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from '../../tools/serve.mjs';

const server = createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
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
const requests = {};
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (pending[d.id]) { pending[d.id](d); delete pending[d.id]; }
  const p = d.params;
  if (d.method === 'Runtime.exceptionThrown') problems.push('page error: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  if (d.method === 'Runtime.consoleAPICalled' && p.type === 'error') problems.push('console.error: ' + p.args.map((a) => a.value ?? a.description).join(' '));
  if (d.method === 'Log.entryAdded' && (p.entry.level === 'error' || /Content Security Policy/.test(p.entry.text))) problems.push('log: ' + p.entry.text);
  if (d.method === 'Network.responseReceived' && p.response.status >= 400) problems.push(`HTTP ${p.response.status}: ${p.response.url}`);
  if (d.method === 'Network.loadingFailed' && !p.canceled) problems.push(`request failed (${p.errorText}): ${requests[p.requestId] || p.requestId}`);
  if (d.method === 'Network.requestWillBeSent') requests[p.requestId] = p.request.url;
};
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending[id] = r; ws.send(JSON.stringify({ id, method, params })); });
async function js(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
}
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Network.enable');
await send('DOM.enable');

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
  async function create(name, n, format) {
    q('[data-action=go-setup]').click(); await wait();
    setVal(q('#f-name'), name); setVal(q('#f-count'), n); setVal(q('#f-lap'), 20);
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

await step('40-rider bracket draws connector lines', () => js(`(async () => { ${H}
  q('[data-action=go-home]').click(); await wait();
  await create('Big Field', 40, 'bo3');
  await play(60);
  await wait(200);
  const lines = qa('svg path').length;
  if (lines < 20) throw new Error(lines + ' connector paths');
  return lines + ' paths';
})()`));

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

await step('no page errors, console errors, CSP violations or failed requests', async () => {
  await sleep(200);
  check(!problems.length, problems.join('\n      '));
});

ws.close();
console.log(failures ? `\n${failures} step(s) failed` : '\nall steps passed');
process.exit(failures ? 1 : 0);
