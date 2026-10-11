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
