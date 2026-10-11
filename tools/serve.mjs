// Local static server for public/, with the same headers Cloudflare serves from
// public/_headers (CSP included) and the same fallback: an app path such as
// /t/<code> gets index.html (but a missing file with an extension is a 404 here,
// stricter than Cloudflare, so broken asset paths fail loudly). /api/* goes straight
// to worker/index.js, with in-memory stores (tools/fake-do.mjs), and the live feed
// /api/t/<code>/live gets a minimal WebSocket (tools/ws.mjs); `npm run dev` runs the
// real Durable Objects. DEV_ORGANISER_EMAIL=you@example.com logs you in as an organiser
// (see worker/auth.js).
// No dependencies.
//
//   node tools/serve.mjs            http://127.0.0.1:8787
//   PORT=9000 node tools/serve.mjs
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { TournamentStore, OrganiserList } from '../worker/index.js';
import { fakeNamespace } from './fake-do.mjs';
import { acceptWebSocket, refuseUpgrade } from './ws.mjs';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

// public/_headers: a path pattern on its own line, then indented "Name: value" lines.
function parseHeaders() {
  const rules = [];
  for (const line of readFileSync(join(ROOT, '_headers'), 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: {} });
    else {
      const i = line.indexOf(':');
      rules[rules.length - 1].headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}

const matches = (pattern, path) => (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern);

// Hands an /api/* request to the Worker and writes its Response back.
async function toWorker(req, res, env) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body });
  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

// Online saving works here too, in memory (tools/fake-do.mjs), lost on restart.
export const memoryStores = () => ({ TOURNAMENTS: fakeNamespace(TournamentStore), ORGANISERS: fakeNamespace(OrganiserList) });

// /api/t/<code>/live: the same checks as worker/public.js, then the store gets the
// socket directly (Node has no WebSocketPair to go through the Worker).
async function toLiveFeed(req, socket, env) {
  const m = new URL(req.url, 'http://x').pathname.match(/^\/api\/t\/([a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?)\/live$/);
  if (!m || !env.TOURNAMENTS) return refuseUpgrade(socket, 404, 'Not Found');
  const store = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(m[1]));
  if ((await store.fetch('https://store/read')).status !== 200) return refuseUpgrade(socket, 404, 'Not Found');
  const ws = acceptWebSocket(req, socket);
  if (ws) await store.connect(ws);
}

export function createServer({ env = { DEV_ORGANISER_EMAIL: process.env.DEV_ORGANISER_EMAIL, ...memoryStores() } } = {}) {
  const rules = parseHeaders();
  const server = http.createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.startsWith('/api/')) {
      toWorker(req, res, env).catch((e) => res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(e)));
      return;
    }
    let file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
    const missing = !file.startsWith(ROOT) || path.startsWith('/_headers') || !existsSync(file) || statSync(file).isDirectory();
    if (missing && !path.startsWith('/api/') && !extname(path)) file = join(ROOT, 'index.html'); // app route
    else if (missing) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    const headers = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' };
    for (const r of rules) if (matches(r.pattern, path)) Object.assign(headers, r.headers);
    headers['Cache-Control'] = 'no-store'; // always serve the files on disk while developing
    res.writeHead(200, headers).end(readFileSync(file));
  });
  server.on('upgrade', (req, socket) => toLiveFeed(req, socket, env).catch(() => socket.destroy()));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8787;
  createServer().listen(port, '127.0.0.1', () => console.log(`rebattle on http://127.0.0.1:${port}`));
}
