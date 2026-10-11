// Public pages: the read-only API and live feed (worker/public.js, worker/stores.js),
// rider links (engine/slug.js) and a rider's summary (engine/rider.js).
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Bracket from '../public/js/engine/bracket.js';
import { riderSlugs } from '../public/js/engine/slug.js';
import { riderSummary } from '../public/js/engine/rider.js';
import { followPath, parseRoute } from '../public/js/route.js';
import { buildTimeline } from '../public/js/replay/timeline.js';
import worker from '../worker/index.js';
import { memoryStores } from '../tools/serve.mjs';

const BASE = 'http://127.0.0.1:8787';

function tournament(names = ['Ana', 'Ben', 'Cy', 'Dora', 'Eve', 'Finn'], heatFormat = 'single') {
  return Bracket.createTournament({ name: 'Cable Park Open', competitorNames: names, settings: { heatFormat, lapTimeSeconds: 20 } });
}
function playOne(t, pick = 'slotA') {
  const [m] = Bracket.getPlayableMatches(t);
  Bracket.recordRaceWinner(t, m.id, m[pick].competitorId);
  return m;
}

// An organiser's tournament in fresh stores, and a way to call the Worker as anyone.
async function online(t) {
  const env = { ...memoryStores(), DEV_ORGANISER_EMAIL: 'ada@example.com' };
  const call = async (method, path, body) => {
    const init = { method, headers: body ? { 'Content-Type': 'application/json', Origin: BASE } : method === 'GET' ? {} : { Origin: BASE } };
    if (body) init.body = JSON.stringify(body);
    return worker.fetch(new Request(BASE + path, init), env);
  };
  const { code } = await (await call('POST', '/api/manage/tournaments', { tournament: t })).json();
  const anyone = (path, init) => worker.fetch(new Request(BASE + path, init), { TOURNAMENTS: env.TOURNAMENTS }); // no login
  return { env, call, code, anyone };
}

// Stands in for a viewer's socket.
function viewer() {
  const v = { got: [], closed: null, send: (m) => v.got.push(JSON.parse(m)), close: (code) => (v.closed = code) };
  return v;
}

test('anyone can read an online tournament, without the owners', async () => {
  const t = tournament();
  const { code, anyone } = await online(t);
  const res = await anyone('/api/t/' + code);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(!text.includes('ada@example.com'), 'no owner emails');
  const body = JSON.parse(text);
  assert.deepEqual([body.code, body.version, body.tournament.id], [code, 1, t.id]);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');

  assert.equal((await anyone('/api/t/nope-zzzz')).status, 404);
  assert.equal((await anyone('/api/t/Not_A_Code')).status, 404);
  assert.equal((await anyone('/api/t/' + code + '/extra/bits')).status, 404);
  assert.equal((await anyone('/api/t/' + code, { method: 'PUT', body: '{}' })).status, 405);
  assert.equal((await anyone('/api/t/' + code + '/live')).status, 426, 'the live feed is a WebSocket');
  assert.equal((await worker.fetch(new Request(BASE + '/api/t/' + code), {})).status, 503);
});

test('viewers get the snapshot on connect, every save, and the end', async () => {
  const t = tournament();
  const { env, call, code } = await online(t);
  const store = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(code));
  const a = viewer();
  const b = viewer();
  await store.connect(a);
  await store.connect(b);
  assert.deepEqual(a.got.map((m) => [m.type, m.version]), [['snapshot', 1]]);

  playOne(t);
  assert.equal((await call('PUT', '/api/manage/t/' + code, { baseVersion: 1, tournament: t })).status, 200);
  assert.equal((await call('PUT', '/api/manage/t/' + code, { baseVersion: 1, tournament: t })).status, 409);
  assert.deepEqual(b.got.map((m) => [m.type, m.version]), [['snapshot', 1], ['snapshot', 2]], 'a refused save sends nothing');
  assert.deepEqual(b.got[1].tournament, t);
  assert.ok(!JSON.stringify(b.got).includes('ada@example.com'), 'no owner emails');

  a.onClose(); // one viewer leaves
  await call('DELETE', '/api/manage/t/' + code);
  assert.equal(a.got.length, 2);
  assert.deepEqual(b.got.at(-1), { type: 'deleted' });
  assert.equal(b.closed, 1000);
});

test('rider links: no names, unique, and they survive renames', () => {
  const t = tournament(['Dora Nowak', 'Dora Nowak', 'Ben', 'Cy', 'Eve', 'Finn']);
  const slugs = riderSlugs(t);
  const codes = Object.values(slugs);
  assert.equal(new Set(codes).size, 6, 'unique, same names included');
  for (const s of codes) {
    assert.match(s, /^[a-z2-9]{6}$/);
    assert.deepEqual(parseRoute('/t/cable-open-x7k2/' + s), { name: 'rider', code: 'cable-open-x7k2', rider: s });
  }
  assert.ok(!codes.some((s) => s.includes('dora')), 'no names in links');

  const copy = JSON.parse(JSON.stringify(t)); // e.g. the copy a viewer's browser gets
  copy.competitors[0].name = 'Dorota Nowak'; // a typo fixed later
  assert.deepEqual(riderSlugs(copy), slugs, 'every browser gets the same links, renames change nothing');

  const big = tournament(Array.from({ length: 64 }, (_, i) => 'Rider ' + i));
  assert.equal(new Set(Object.values(riderSlugs(big))).size, 64);
});

test("a rider's summary: stage, heats ridden, what's next", () => {
  const t = tournament(['Ana', 'Ben', 'Cy', 'Dora', 'Eve', 'Finn', 'Gus', 'Hal'], 'bo3');
  const id = (name) => t.competitors.find((c) => c.name === name).id;
  const ana = id('Ana');
  let s = riderSummary(t, ana);
  assert.equal(s.stage, 'winners');
  assert.deepEqual(s.heats, []);
  assert.equal(s.next.match.stage, 'WB');
  assert.ok(s.next.opponentId, 'round 1 opponent known');

  // Ana loses her first heat 1-2 and drops to the Losers bracket.
  const first = s.next.match;
  const other = s.next.opponentId;
  for (const w of [ana, other, other]) Bracket.recordRaceWinner(t, first.id, w);
  s = riderSummary(t, ana);
  assert.equal(s.stage, 'losers');
  assert.deepEqual(s.heats.map((h) => [h.won, h.score, h.opponentId]), [[false, [1, 2], other]]);
  assert.equal(riderSummary(t, other).next.opponentId, null, 'round 2 opponent not decided yet');

  // Play to the end: everyone has a place, and nobody is left waiting.
  while (Bracket.getPlayableMatches(t).length) {
    const [m] = Bracket.getPlayableMatches(t);
    Bracket.recordRaceWinner(t, m.id, m.slotA.competitorId);
    for (const c of t.competitors) {
      const r = riderSummary(t, c.id);
      if (t.status !== 'completed') assert.ok(r.next || r.waiting || r.stage === 'out', c.name + ' has no next step');
    }
  }
  const places = t.competitors.map((c) => riderSummary(t, c.id));
  assert.ok(places.every((r) => r.stage === 'placed' && r.place >= 1 && !r.next && !r.waiting));
  assert.equal(places.filter((r) => r.place === 1).length, 1);
  const champion = places.find((r) => r.place === 1);
  assert.ok(champion.heats.at(-1).won && champion.heats.at(-1).match.stage === 'GRAND_FINAL');
});

test('a viewer that sends anything is disconnected', async () => {
  const { env, code } = await online(tournament());
  const store = env.TOURNAMENTS.objects.get(code).store;
  const v = viewer();
  await env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(code)).connect(v);
  store.webSocketMessage(v, 'hello');
  assert.equal(v.closed, 1008);
});

test('addresses: the introduction, the list, and Follow a competition', () => {
  assert.deepEqual(parseRoute('/about'), { name: 'about' });
  assert.deepEqual(parseRoute('/tournaments'), { name: 'list' });
  assert.deepEqual(parseRoute('/about/x'), { name: 'notFound' });
  assert.equal(followPath('cable-open-x7k2'), '/t/cable-open-x7k2');
  assert.equal(followPath('  Cable-Open-X7K2 '), '/t/cable-open-x7k2', 'typed from a poster');
  assert.equal(followPath('https://rebattle.app/t/cable-open-x7k2'), '/t/cable-open-x7k2');
  assert.equal(followPath('rebattle.app/t/cable-open-x7k2/k7m2qp?ref=qr#top'), '/t/cable-open-x7k2/k7m2qp');
  for (const bad of ['', '   ', 'not a code!', '/t/', 'https://evil.example/x', '-dash-', '<script>']) assert.equal(followPath(bad), null, bad);
});

test('the video ends with the address: results on the podium, a rider\'s page on their journey', () => {
  const t = tournament(['Dora Nowak', 'Ben', 'Cy', 'Eve', 'Finn']);
  while (Bracket.getPlayableMatches(t).length) playOne(t);
  const last = (tl) => tl.scenes.at(-1);
  const site = { host: 'rebattle.app', code: 'cable-open-x7k2' };
  assert.deepEqual(last(buildTimeline(t, null, site)).link, { label: 'Results:', url: 'rebattle.app/t/cable-open-x7k2' });
  const dora = t.competitors[0].id;
  assert.deepEqual(last(buildTimeline(t, dora, site)).link, { label: 'Dora’s journey:', url: 'rebattle.app/t/cable-open-x7k2/' + riderSlugs(t)[dora] });
  assert.deepEqual(last(buildTimeline(t, dora, { host: 'rebattle.app', code: null })).link, { label: '', url: 'rebattle.app' }, 'local: no public page');
  assert.equal(last(buildTimeline(t, null)).link, null, 'no site: nothing drawn');
});
