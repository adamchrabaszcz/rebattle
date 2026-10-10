// Bracket engine + import checks. No dependencies: run with `node --test tests/`.
// The engine files are plain browser scripts that attach to the global object,
// so requiring them here exposes Bracket and Store the same way the page does.
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/bracket.js');
require('../js/storage.js');
const { Bracket, Store } = globalThis;

const names = (n) => Array.from({ length: n }, (_, i) => 'Rider ' + (i + 1));

function create(n, heatFormat = 'single') {
  return Bracket.createTournament({ name: 'Test', competitorNames: names(n), settings: { heatFormat, lapTimeSeconds: 20 } });
}

// Plays every heat with random winners, in random order among the playable heats.
function playOut(t) {
  let heats = 0;
  for (let guard = 0; guard < 10000; guard += 1) {
    const playable = Bracket.getPlayableMatches(t);
    if (!playable.length) break;
    const m = playable[Math.floor(Math.random() * playable.length)];
    Bracket.recordRaceWinner(t, m.id, Math.random() < 0.5 ? m.slotA.competitorId : m.slotB.competitorId);
    if (m.completed) heats += 1;
  }
  return heats;
}

test('every field size finishes with consistent counts (4-40 riders, both formats)', () => {
  for (let n = 4; n <= 40; n += 1) {
    for (const format of ['single', 'bo3']) {
      for (let run = 0; run < 15; run += 1) {
        const t = create(n, format);
        const heats = playOut(t);
        const label = `n=${n} ${format} run ${run}`;
        assert.equal(t.status, 'completed', label);
        assert.equal(new Set(t.standings).size, n, `${label}: everyone placed once`);
        assert.equal(t.wb.matches.filter((m) => !m.isBye).length, n - 1, `${label}: WB heats`);
        assert.equal(t.lb.matches.filter((m) => !m.isBye).length, n - 3, `${label}: LB heats`);
        assert.equal(heats, Bracket.estimateHeatsCount(n), `${label}: total heats match the setup estimate`);
      }
    }
  }
});

test('Final 4 is a crossover: WB 1st v LB 2nd, WB 2nd v LB 1st', () => {
  const t = create(12);
  playOut(t);
  const { semi1, semi2 } = t.final4;
  assert.deepEqual([semi1.slotA.competitorId, semi1.slotB.competitorId], [t.wb.champion, t.lb.runnerUp]);
  assert.deepEqual([semi2.slotA.competitorId, semi2.slotB.competitorId], [t.wb.runnerUp, t.lb.champion]);
  assert.equal(t.standings[0], t.final4.grandFinal.winnerId);
  assert.equal(t.standings[2], t.final4.smallFinal.winnerId);
});

test('byes fill the first round up to a power of two', () => {
  for (const [n, size] of [[4, 4], [5, 8], [12, 16], [17, 32]]) {
    const t = create(n);
    assert.equal(t.bracketSize, size);
    assert.equal(t.wb.matches.filter((m) => m.round === 1 && m.isBye).length, size - n, `n=${n}`);
  }
});

test('the Losers bracket waits for Winners rounds 1 and 2', () => {
  const t = create(16);
  const playRound = (round) =>
    t.wb.matches.filter((m) => m.round === round).forEach((m) => Bracket.recordRaceWinner(t, m.id, m.slotA.competitorId));
  playRound(1);
  assert.equal(Bracket.isLbGateOpen(t), false);
  assert.equal(t.lb.matches.length, 0);
  playRound(2);
  assert.equal(Bracket.isLbGateOpen(t), true);
  assert.ok(t.lb.matches.length > 0);
});

test('best of 3 needs two wins', () => {
  const t = create(4, 'bo3');
  const m = Bracket.getPlayableMatches(t)[0];
  Bracket.recordRaceWinner(t, m.id, m.slotA.competitorId);
  assert.equal(m.completed, false);
  Bracket.recordRaceWinner(t, m.id, m.slotB.competitorId);
  assert.equal(m.completed, false);
  Bracket.recordRaceWinner(t, m.id, m.slotA.competitorId);
  assert.equal(m.completed, true);
  assert.equal(m.winnerId, m.slotA.competitorId);
});

test('invalid results are refused', () => {
  const t = create(4);
  const m = Bracket.getPlayableMatches(t)[0];
  assert.throws(() => Bracket.recordRaceWinner(t, m.id, 'someone_else'), /Winner must be one of/);
  Bracket.recordRaceWinner(t, m.id, m.slotA.competitorId);
  assert.throws(() => Bracket.recordRaceWinner(t, m.id, m.slotA.competitorId), /already completed/);
});

test('placings: riders out in the same Losers round share a place, numbered after everyone above', () => {
  for (let run = 0; run < 50; run += 1) {
    const t = create(16);
    playOut(t);
    const placings = Bracket.getPlacings(t);
    assert.deepEqual(placings.slice(0, 4).map((p) => p.place), [1, 2, 3, 4]);
    placings.forEach((p, i) => {
      if (i < 4) return;
      // a place is either shared with the rider above, or equals the count of riders above + 1
      assert.ok(p.place === placings[i - 1].place || p.place === i + 1, `place ${p.place} at position ${i + 1}`);
    });
  }
});

test('import accepts real exports, including names with quotes and markup', () => {
  const t = Bracket.createTournament({
    name: 'Cable Park <Open> "2026"',
    competitorNames: ['Ola Wiśniewska', 'Kuba "K" <b>', 'Zuza', 'Jan', 'Iga'],
    settings: { heatFormat: 'bo3', lapTimeSeconds: 20 },
  });
  playOut(t);
  assert.doesNotThrow(() => Store.validateTournament(JSON.parse(JSON.stringify(t))));
});

test('import rejects files that would inject markup through ids or other fields', () => {
  const fresh = () => JSON.parse(JSON.stringify(create(6)));
  const cases = {
    'tournament id': (t) => (t.id = 'x" onmouseover="alert(1)'),
    'match id': (t) => (t.wb.matches[0].id = '<img src=x onerror=alert(1)>'),
    'competitor id': (t) => (t.competitors[0].id = 'a b'),
    status: (t) => (t.status = '<b>done</b>'),
    'missing bracket': (t) => delete t.wb,
  };
  Object.entries(cases).forEach(([what, spoil]) => {
    const t = fresh();
    spoil(t);
    assert.throws(() => Store.validateTournament(t), /does not look like a rebattle tournament file/, what);
  });
});
