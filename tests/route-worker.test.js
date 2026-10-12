// Addresses the app understands, and the Worker's API basics.
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseRoute } from '../public/js/route.js';
import worker from '../worker/index.js';

test('parseRoute: the app, tournament links and everything else', () => {
  const cases = {
    '/': { name: 'home' },
    '/index.html': { name: 'home' },
    '/t/cable-open-x7k2': { name: 'view', code: 'cable-open-x7k2' },
    '/t/cable-open-x7k2/': { name: 'view', code: 'cable-open-x7k2' },
    '/t/cable-open-x7k2/dora': { name: 'rider', code: 'cable-open-x7k2', rider: 'dora' },
    '/manage/cable-open-x7k2': { name: 'manage', code: 'cable-open-x7k2' },
  };
  for (const [path, want] of Object.entries(cases)) assert.deepEqual(parseRoute(path), want, path);

  for (const path of ['/t', '/t/', '/t/Cable', '/t/-x', '/t/x-', '/t/a_b', '/t/' + 'a'.repeat(33), '/t/a/b/c', '/manage', '/manage/a/b', '/foo', '/t/%3Cscript%3E', '/t/a b'])
    assert.equal(parseRoute(path).name, 'notFound', path);
});

test('worker: /api/health answers JSON with safe headers', async () => {
  const res = await worker.fetch(new Request('https://rebattle.app/api/health'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.match(res.headers.get('Content-Type'), /^application\/json/);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(res.headers.get('Content-Security-Policy'), /default-src 'none'/);
});

test('worker: wrong method and unknown API paths', async () => {
  const post = await worker.fetch(new Request('https://rebattle.app/api/health', { method: 'POST' }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET, HEAD');
  const other = await worker.fetch(new Request('https://rebattle.app/api/nope'));
  assert.equal(other.status, 404);
  assert.deepEqual(await other.json(), { error: 'not found' });
});

// The static-assets binding: index.html with the headers public/_headers gives it.
const assets = {
  asked: [],
  async fetch(url) {
    this.asked.push(String(url));
    return new Response('<!doctype html>app', { headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'" } });
  },
};

test('worker: paths that are no file get the app, with a 404 unless the app knows them', async () => {
  const env = { ASSETS: assets };
  for (const path of ['/about', '/tournaments', '/competitions', '/brand', '/t/cable-open-x7k2', '/t/cable-open-x7k2/dora', '/manage/cable-open-x7k2', '/about/']) {
    const res = await worker.fetch(new Request('https://rebattle.app' + path), env);
    assert.equal(res.status, 200, path);
    assert.equal(await res.text(), '<!doctype html>app', path);
  }
  for (const path of ['/foo', '/wp-login.php', '/t/Cable', '/manage', '/old/page.html']) {
    const res = await worker.fetch(new Request('https://rebattle.app' + path), env);
    assert.equal(res.status, 404, path);
    assert.equal(await res.text(), '<!doctype html>app', `${path}: the app shows its not-found screen`);
  }
  assert.ok(assets.asked.every((u) => u === 'https://rebattle.app/'), 'always index.html');
});

test('worker: the app page keeps its security headers; HEAD has no body, writes are refused', async () => {
  const env = { ASSETS: assets };
  const res = await worker.fetch(new Request('https://rebattle.app/nope'), env);
  assert.equal(res.headers.get('Content-Security-Policy'), "default-src 'self'");
  const head = await worker.fetch(new Request('https://rebattle.app/about', { method: 'HEAD' }), env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const post = await worker.fetch(new Request('https://rebattle.app/about', { method: 'POST' }), env);
  assert.equal(post.status, 405);
});
