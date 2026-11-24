// The Final 4 on the bracket screen: before it exists, placeholder semifinals show who
// is through so far, tagged with where they came from (WB 1st v LB 2nd, WB 2nd v LB 1st).
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Bracket from '../public/js/engine/bracket.js';
import { renderFinal4 } from '../public/js/ui/brackets.js';

// The tag in the card with this id, on the row of this rider.
function tagFor(html, matchId, name) {
  const card = html.split(`data-match-id="${matchId}"`)[1].split('data-match-id=')[0];
  const row = card.split(name)[1];
  return row && row.match(/semi-tag">([^<]+)</)?.[1];
}

test('placeholder semifinals: the Winners champion is WB 1st, the runner-up WB 2nd', () => {
  const t = Bracket.createTournament({ name: 'Open', competitorNames: Array.from({ length: 12 }, (_, i) => 'Rider ' + (i + 1)), settings: { heatFormat: 'single', lapTimeSeconds: 20 } });
  // Ride until the Winners final is done; the Losers bracket is still going.
  while (!t.wb.champion) {
    const [m] = Bracket.getPlayableMatches(t).filter((x) => x.stage === 'WB');
    Bracket.recordRaceWinner(t, m.id, m.slotA.competitorId);
  }
  assert.equal(t.final4.semi1, null, 'the Final 4 is not built yet');

  const html = renderFinal4(t, true);
  const champion = Bracket.getName(t, t.wb.champion);
  const runnerUp = Bracket.getName(t, t.wb.runnerUp);
  assert.equal(tagFor(html, 'ph_sf1', champion), 'WB 1st');
  assert.equal(tagFor(html, 'ph_sf2', runnerUp), 'WB 2nd');
});
