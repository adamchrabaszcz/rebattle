// The pure parts behind the screens: the Losers-bracket layout (shared by the bracket
// view and the replay) and the replay's scene timeline. No DOM, no canvas.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Bracket from '../public/js/engine/bracket.js';
import { lbLayout, slotOf } from '../public/js/engine/lb-layout.js';
import { buildTimeline } from '../public/js/replay/timeline.js';

function played(n, heatFormat) {
  const t = Bracket.createTournament({ name: 'Test', competitorNames: Array.from({ length: n }, (_, i) => 'Rider ' + (i + 1)), settings: { heatFormat, lapTimeSeconds: 20 } });
  for (let guard = 0; guard < 10000; guard += 1) {
    const playable = Bracket.getPlayableMatches(t);
    if (!playable.length) break;
    const m = playable[Math.floor(Math.random() * playable.length)];
    Bracket.recordRaceWinner(t, m.id, Math.random() < 0.5 ? m.slotA.competitorId : m.slotB.competitorId);
  }
  assert.equal(t.status, 'completed');
  return t;
}

const fields = [];
for (let n = 4; n <= 40; n += 1) fields.push([n, n % 2 ? 'bo3' : 'single']);

test('lbLayout shows every Losers heat once, in its own column, with valid lines', () => {
  for (const [n, format] of fields) {
    const t = played(n, format);
    const layout = lbLayout(t);
    const shown = [];
    for (let lvl = 1; lvl <= layout.maxLevel; lvl += 1) {
      for (const { match } of layout.levels[lvl]) {
        assert.equal(match.level, lvl, `${n}: heat in the wrong column`);
        assert.ok(!match.isLbFinal, `${n}: LB final outside the Final column`);
        shown.push(match.id);
      }
    }
    for (const { match } of layout.final) {
      assert.ok(match.isLbFinal, `${n}: non-final heat in the Final column`);
      shown.push(match.id);
    }
    assert.deepEqual(shown.slice().sort(), t.lb.matches.map((m) => m.id).sort(), `${n}: every LB heat exactly once`);

    const byId = Object.fromEntries(t.lb.matches.map((m) => [m.id, m]));
    for (const e of layout.edges) {
      const from = byId[e.from];
      const to = byId[e.to];
      assert.ok(to.level > from.level || to.isLbFinal, `${n}: line goes backwards`);
      assert.equal(slotOf(to, from.winnerId), e.slot, `${n}: line lands in the winner's slot`);
    }
  }
});

test('lbLayout puts the slot fed from higher up on top', () => {
  const t = played(24, 'single');
  const layout = lbLayout(t);
  const pos = {};
  const columns = Object.values(layout.levels).concat([layout.final]);
  columns.forEach((col) => col.forEach(({ match }, i) => (pos[match.id] = i)));
  for (const col of columns) {
    for (const { match, swap } of col) {
      const feeder = (slot) => layout.edges.find((e) => e.to === match.id && e.slot === slot);
      const a = feeder('slotA');
      const b = feeder('slotB');
      if (a && b) assert.equal(swap, pos[b.from] < pos[a.from]);
      else if (!a && !b) assert.equal(swap, false);
    }
  }
});

test('the replay timeline covers every heat once, in running order, back to back', () => {
  for (const [n, format] of fields) {
    const t = played(n, format);
    const tl = buildTimeline(t);
    const types = tl.scenes.map((s) => s.type);
    assert.equal(types[0], 'intro');
    assert.equal(types[types.length - 1], 'podium');
    assert.equal(types.filter((x) => x === 'qualify').length, 1);
    const semis = tl.scenes.findIndex((s) => s.title === 'Semifinals');
    assert.equal(types[semis - 1], 'qualify', `${n}: the crossover leads into the semis`);
    assert.equal(tl.scenes[semis + 1].title, 'Finals');

    const all = [...t.wb.matches, ...t.lb.matches, t.final4.semi1, t.final4.semi2, t.final4.smallFinal, t.final4.grandFinal];
    const shown = tl.scenes.filter((s) => s.items).flatMap((s) => s.items.map((i) => i.match.id));
    assert.deepEqual(shown.slice().sort(), all.map((m) => m.id).sort(), `${n}: every heat exactly once`);

    let at = 0;
    tl.scenes.forEach((s, i) => {
      assert.equal(s.index, i);
      assert.ok(Math.abs(s.start - at) < 1e-9, `${n}: scene ${i} starts where the last one ended`);
      assert.ok(s.dur >= 1.6, `${n}: scene ${i} is long enough to read`);
      at += s.dur;
    });
    assert.ok(Math.abs(tl.total - at) < 1e-9);
    // Aims for 27s; very large fields run longer because every round keeps a readable minimum.
    assert.ok(tl.total >= 27 - 1e-9 && tl.total < 60, `${n}: ${tl.total.toFixed(1)}s`);
  }
});

test("a rider's journey shows only their heats, then their final place", () => {
  for (const [n, format] of [[5, 'single'], [16, 'bo3'], [29, 'single']]) {
    const t = played(n, format);
    const placings = Bracket.getPlacings(t);
    for (const c of t.competitors) {
      const tl = buildTimeline(t, c.id);
      assert.equal(tl.focus, c.id);
      assert.equal(tl.scenes[0].type, 'journeyIntro');
      const result = tl.scenes[tl.scenes.length - 1];
      assert.equal(result.type, 'result');
      assert.equal(result.place, placings.find((p) => p.id === c.id).place);

      const rode = (m) => m && (m.slotA.competitorId === c.id || m.slotB.competitorId === c.id);
      const all = [...t.wb.matches, ...t.lb.matches, t.final4.semi1, t.final4.semi2, t.final4.smallFinal, t.final4.grandFinal];
      const shown = tl.scenes.filter((s) => s.items).flatMap((s) => s.items.map((i) => i.match));
      assert.ok(shown.every(rode), `${n}: only their own heats`);
      assert.deepEqual(shown.map((m) => m.id).sort(), all.filter(rode).map((m) => m.id).sort(), `${n}: all of their heats`);
    }
  }
});
