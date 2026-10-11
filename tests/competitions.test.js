// The public list of competitions: the organiser's visibility setting and the index
// behind /api/competitions (worker/manage.js, worker/public.js, worker/stores.js).
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Bracket from '../public/js/engine/bracket.js';
import worker from '../worker/index.js';
import { memoryStores } from '../tools/serve.mjs';

const BASE = 'http://127.0.0.1:8787';

function tournament(name = 'Cable Park Open', n = 5) {
  return Bracket.createTournament({ name, competitorNames: Array.from({ length: n }, (_, i) => 'Rider ' + (i + 1)), settings: { heatFormat: 'single', lapTimeSeconds: 20 } });
}
const playAll = (t) => {
  while (Bracket.getPlayableMatches(t).length) {
    const [m] = Bracket.getPlayableMatches(t);
    Bracket.recordRaceWinner(t, m.id, m.slotA.competitorId);
  }
  return t;
};

function world() {
  const stores = memoryStores();
  const as = (email) => async (method, path, body, headers = {}) => {
    const init = { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { Origin: BASE } : {}), ...headers } };
    if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
    const res = await worker.fetch(new Request(BASE + path, init), { ...stores, DEV_ORGANISER_EMAIL: email });
    return { status: res.status, body: await res.json(), text: '' };
  };
  const list = async (query = '') => {
    const res = await worker.fetch(new Request(BASE + '/api/competitions' + query), { ...stores });
    const text = await res.text();
    return { status: res.status, text, ...JSON.parse(text) };
  };
  return { as, list };
}

test('new tournaments are unlisted unless the organiser lists them', async () => {
  const { as, list } = world();
  const ada = as('ada@example.com');
  const quiet = await ada('POST', '/api/manage/tournaments', { tournament: tournament('Quiet Open') });
  const loud = await ada('POST', '/api/manage/tournaments', { tournament: tournament('Loud Open'), listed: true });
  assert.equal(quiet.status, 201);
  assert.equal((await ada('GET', '/api/manage/t/' + quiet.body.code)).body.listed, false);
  assert.equal((await ada('GET', '/api/manage/t/' + loud.body.code)).body.listed, true);
  const l = await list();
  assert.equal(l.status, 200);
  assert.deepEqual(l.competitions.map((c) => c.name), ['Loud Open']);
  assert.deepEqual(Object.keys(l.competitions[0]).sort(), ['code', 'createdAt', 'name', 'riders', 'started', 'status', 'updatedAt', 'winner']);
  assert.equal(l.competitions[0].started, false, '"Starting soon" until the first heat');
  assert.ok(!l.text.includes('ada@example.com'), 'no owner emails');
});

test('the list follows saves, the visibility switch and deletion', async () => {
  const { as, list } = world();
  const ada = as('ada@example.com');
  const t = tournament('Cable Park Open');
  const { code } = (await ada('POST', '/api/manage/tournaments', { tournament: t })).body;

  assert.deepEqual((await ada('PUT', `/api/manage/t/${code}/visibility`, { listed: true })).body, { listed: true });
  assert.equal((await list()).competitions[0].code, code);

  playAll(t);
  t.name = 'Cable Park Open 2026';
  assert.equal((await ada('PUT', '/api/manage/t/' + code, { baseVersion: 1, tournament: t })).status, 200);
  const [entry] = (await list()).competitions;
  assert.deepEqual([entry.name, entry.status, entry.started, entry.winner], ['Cable Park Open 2026', 'completed', true, Bracket.getName(t, t.standings[0])]);

  assert.deepEqual((await ada('PUT', `/api/manage/t/${code}/visibility`, { listed: false })).body, { listed: false });
  assert.equal((await list()).total, 0);
  await ada('PUT', `/api/manage/t/${code}/visibility`, { listed: true });
  assert.equal((await list()).total, 1);
  assert.equal((await ada('DELETE', '/api/manage/t/' + code)).status, 200);
  assert.equal((await list()).total, 0, 'deleted: gone from the list');
});

test('only the owner can change visibility, from rebattle itself, with a true/false', async () => {
  const { as, list } = world();
  const ada = as('ada@example.com');
  const bo = as('bo@example.com');
  const { code } = (await ada('POST', '/api/manage/tournaments', { tournament: tournament() })).body;
  const path = `/api/manage/t/${code}/visibility`;

  assert.equal((await bo('PUT', path, { listed: true })).status, 404, "someone else's tournament");
  assert.equal((await as('')('PUT', path, { listed: true })).status, 401, 'not logged in');
  assert.equal((await ada('PUT', path, { listed: true }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await ada('PUT', path, { listed: 'yes' })).status, 400);
  assert.equal((await ada('PUT', path, '{oops')).status, 400);
  assert.equal((await ada('PUT', path, JSON.stringify({ listed: true }), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await ada('GET', path)).status, 405);
  assert.equal((await list()).total, 0, 'still unlisted');
});

test('running competitions come first, then finished ones, newest first; paged', async (t) => {
  let clock = 1_791_700_000_000; // each save a second later, so the order never depends on timing
  t.mock.method(Date, 'now', () => (clock += 1000));
  const { as, list } = world();
  const ada = as('ada@example.com');
  const make = async (name, finished) => {
    const tt = tournament(name);
    if (finished) playAll(tt);
    await ada('POST', '/api/manage/tournaments', { tournament: tt, listed: true });
  };
  await make('Old Final', true);
  await make('Running A', false);
  await make('New Final', true);
  await make('Running B', false);
  const all = await list();
  assert.deepEqual(all.competitions.map((c) => c.name), ['Running B', 'Running A', 'New Final', 'Old Final']);
  const page = await list('?offset=1&limit=2');
  assert.deepEqual([page.total, page.competitions.map((c) => c.name)], [4, ['Running A', 'New Final']]);
  assert.equal((await list('?limit=999')).competitions.length, 4, 'capped, not refused');
  const post = await worker.fetch(new Request(BASE + '/api/competitions', { method: 'POST' }), memoryStores());
  assert.equal(post.status, 405);
});
