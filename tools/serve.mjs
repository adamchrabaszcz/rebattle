// Local static server for public/, with the same headers Cloudflare serves from
// public/_headers (CSP included), so what works here works on rebattle.app.
// No dependencies.
//
//   node tools/serve.mjs            http://127.0.0.1:8787
//   PORT=9000 node tools/serve.mjs
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export function createServer() {
  const rules = parseHeaders();
  return http.createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
    if (!file.startsWith(ROOT) || path.startsWith('/_headers') || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    const headers = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' };
    for (const r of rules) if (matches(r.pattern, path)) Object.assign(headers, r.headers);
    headers['Cache-Control'] = 'no-store'; // always serve the files on disk while developing
    res.writeHead(200, headers).end(readFileSync(file));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8787;
  createServer().listen(port, '127.0.0.1', () => console.log(`rebattle on http://127.0.0.1:${port}`));
}
