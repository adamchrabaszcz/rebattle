// Saving tournaments online: the Worker's organiser API and the two stores, run in
// Node against the in-memory stand-in for Durable Objects (tools/fake-do.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Bracket from '../public/js/engine/bracket.js';
import worker from '../worker/index.js';
import { slugify, makeCode } from '../worker/codes.js';
import { parseRoute } from '../public/js/route.js';
import { memoryStores } from '../tools/serve.mjs';

const BASE = 'http://127.0.0.1:8787';

function tournament(name = 'Cable Park Open', n = 8) {
  return Bracket.createTournament({ name, competitorNames: Array.from({ length: n }, (_, i) => 'Rider ' + (i + 1)), settings: { heatFormat: 'single', lapTimeSeconds: 20 } });
}
function playOne(t) {
  const [m] = Bracket.getPlayableMatches(t);
  Bracket.recordRaceWinner(t, m.id, m.slotA.competitorId);
  return t;
}

// One shared set of stores; each "organiser" is the local stand-in login with their email.
function world() {
  const stores = memoryStores();
  const as = (email) => {
    const env = { ...stores, DEV_ORGANISER_EMAIL: email };
    return async (method, path, body, headers = {}) => {
      const init = { method, headers: { ...headers } };
      if (body !== undefined) {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
        init.headers = { 'Content-Type': 'application/json', Origin: BASE, ...headers };
      } else if (method !== 'GET') init.headers = { Origin: BASE, ...headers };
      const res = await worker.fetch(new Request(BASE + path, init), env, null, { suffix: as.suffix });
      return { status: res.status, body: await res.json() };
    };
  };
  return { stores, as };
}

test('codes: readable, unique-ish, always a valid address', () => {
  assert.equal(slugify('Cable Park Open — Juniors 2026'), 'cable-park-open');
  assert.equal(slugify('Mistrzostwa Łódź 2026'), 'mistrzostwa-lodz'); // 21 chars: cut at a word
  assert.equal(slugify('Łódź Open'), 'lodz-open');
  assert.equal(slugify('Ærø Wake Ølympics'), 'aero-wake-olympics');
  assert.equal(slugify('!!!'), 'tournament');
  assert.equal(slugify(''), 'tournament');
  assert.equal(slugify('a'.repeat(40)), 'a'.repeat(20));
  for (const name of ['Cable Park Open', 'Łódź', '???', 'x'.repeat(80), 'Über Cup - Finals!!', '  spaced   out  ']) {
    const code = makeCode(name);
    assert.match(code, /-[a-z2-9]{4}$/);
    assert.deepEqual(parseRoute('/t/' + code), { name: 'view', code }, code);
  }
});

test('an organiser creates, lists, loads, saves and deletes a tournament', async () => {
  const { as } = world();
  const ada = as('ada@example.com');
  const t = tournament();

  const created = await ada('POST', '/api/manage/tournaments', { tournament: t });
  assert.equal(created.status, 201);
  assert.match(created.body.code, /^cable-park-open-[a-z2-9]{4}$/);
  assert.equal(created.body.version, 1);
  const code = created.body.code;

  const list = await ada('GET', '/api/manage/tournaments');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((e) => [e.code, e.name, e.competitors, e.version]), [[code, 'Cable Park Open', 8, 1]]);

  const loaded = await ada('GET', '/api/manage/t/' + code);
  assert.equal(loaded.status, 200);
  assert.deepEqual(loaded.body.tournament, t);
  assert.equal(loaded.body.owners, undefined, 'owner emails never go back out');

  playOne(t);
  const saved = await ada('PUT', '/api/manage/t/' + code, { baseVersion: 1, tournament: t });
  assert.deepEqual([saved.status, saved.body.version], [200, 2]);
  assert.equal((await ada('GET', '/api/manage/tournaments')).body[0].version, 2);

  // Saving on top of an old version is refused with the current copy.
  const stale = await ada('PUT', '/api/manage/t/' + code, { baseVersion: 1, tournament: tournament() });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.version, 2);
  assert.deepEqual(stale.body.tournament, t);

  const removed = await ada('DELETE', '/api/manage/t/' + code);
  assert.equal(removed.status, 200);
  assert.equal((await ada('GET', '/api/manage/t/' + code)).status, 404);
  assert.deepEqual((await ada('GET', '/api/manage/tournaments')).body, []);
});

test("nobody else can read, change or delete an organiser's tournament", async () => {
  const { as } = world();
  const ada = as('ada@example.com');
  const bo = as('bo@example.com');
  const t = tournament();
  const { code } = (await ada('POST', '/api/manage/tournaments', { tournament: t })).body;

  assert.equal((await bo('GET', '/api/manage/t/' + code)).status, 404);
  assert.equal((await bo('PUT', '/api/manage/t/' + code, { baseVersion: 1, tournament: t })).status, 404);
  assert.equal((await bo('DELETE', '/api/manage/t/' + code)).status, 404);
  assert.deepEqual((await bo('GET', '/api/manage/tournaments')).body, []);
  assert.equal((await ada('GET', '/api/manage/t/' + code)).body.version, 1, 'untouched');

  const nobody = as('');
  assert.equal((await nobody('GET', '/api/manage/tournaments')).status, 401);
  assert.equal((await nobody('POST', '/api/manage/tournaments', { tournament: t })).status, 401);
});

test('writes must come from rebattle itself, as JSON, small and well-formed', async () => {
  const { as } = world();
  const ada = as('ada@example.com');
  const t = tournament();

  assert.equal((await ada('POST', '/api/manage/tournaments', { tournament: t }, { Origin: 'https://evil.example' })).status, 403);
  const noOrigin = await worker.fetch(
    new Request(BASE + '/api/manage/tournaments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournament: t }) }),
    { ...world().stores, DEV_ORGANISER_EMAIL: 'ada@example.com' }
  );
  assert.equal(noOrigin.status, 403);
  assert.equal((await ada('POST', '/api/manage/tournaments', JSON.stringify({ tournament: t }), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await ada('POST', '/api/manage/tournaments', '{oops')).status, 400);
  assert.equal((await ada('POST', '/api/manage/tournaments', { tournament: { ...t, id: 'x" onmouseover="alert(1)' } })).status, 400);
  assert.equal((await ada('POST', '/api/manage/tournaments', { tournament: { ...t, name: 'x'.repeat(600 * 1024) } })).status, 413);

  const { code } = (await ada('POST', '/api/manage/tournaments', { tournament: t })).body;
  assert.equal((await ada('PUT', '/api/manage/t/' + code, { tournament: t })).status, 400, 'baseVersion missing');
  assert.equal((await ada('PUT', '/api/manage/t/' + code, { baseVersion: 1, tournament: tournament('Another') })).status, 400, 'a different tournament');
  assert.equal((await ada('GET', '/api/manage/t/Not_A_Code')).status, 404);
});

test('a taken code is skipped; history keeps the last 20 versions; concurrent saves never both win', async () => {
  const { as, stores } = world();
  const ada = as('ada@example.com');
  const draws = ['aaaa', 'aaaa', 'bbbb'];
  as.suffix = () => draws.shift();
  const first = await ada('POST', '/api/manage/tournaments', { tournament: tournament('Same Name') });
  const second = await ada('POST', '/api/manage/tournaments', { tournament: tournament('Same Name') });
  as.suffix = undefined;
  assert.equal(first.body.code, 'same-name-aaaa');
  assert.equal(second.body.code, 'same-name-bbbb');

  const t = tournament('History');
  const { code } = (await ada('POST', '/api/manage/tournaments', { tournament: t })).body;
  for (let v = 1; v <= 24; v += 1) assert.equal((await ada('PUT', '/api/manage/t/' + code, { baseVersion: v, tournament: t })).status, 200);
  const keys = stores.TOURNAMENTS.objects.get(code).store.storage.keys().filter((k) => k.startsWith('v:'));
  assert.equal(keys.length, 20);
  assert.ok(keys.includes('v:25') && keys.includes('v:6') && !keys.includes('v:5'));

  const [a, b] = await Promise.all([
    ada('PUT', '/api/manage/t/' + code, { baseVersion: 25, tournament: t }),
    ada('PUT', '/api/manage/t/' + code, { baseVersion: 25, tournament: t }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
});
