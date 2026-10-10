// The read-only view renders the same tournament screen with no way to change anything.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Bracket from '../public/js/engine/bracket.js';
import { renderBracketScreen } from '../public/js/ui/bracket-screen.js';

const ORGANISER_ACTIONS = ['record-winner', 'undo', 'edit-names', 'save-names', 'export', 'import-file', 'new-tournament', 'delete-tournament', 'toggle-more', 'reload-external-update'];
const actions = (html) => new Set([...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]));

function tournament(n, heats) {
  const t = Bracket.createTournament({ name: 'Viewer <Open>', competitorNames: Array.from({ length: n }, (_, i) => 'Rider ' + (i + 1)), settings: { heatFormat: 'single', lapTimeSeconds: 20 } });
  for (let i = 0; i < heats; i += 1) {
    const [m] = Bracket.getPlayableMatches(t);
    if (!m) break;
    Bracket.recordRaceWinner(t, m.id, m.slotA.competitorId);
  }
  return t;
}

const screen = (t, readOnly) =>
  renderBracketScreen({ tournament: t, readOnly, undoStack: [{}], nameDraft: null, titleDraft: '', externalUpdateAvailable: false });

test('in progress: organisers can record, the view cannot', () => {
  const t = tournament(12, 9);
  const organiser = actions(screen(t, false));
  assert.ok(organiser.has('record-winner') && organiser.has('undo') && organiser.has('edit-names'));

  const html = screen(t, true);
  const view = actions(html);
  for (const a of ORGANISER_ACTIONS) assert.ok(!view.has(a), `view offers ${a}`);
  assert.match(html, /view only/);
  assert.match(html, /Up next/, 'the view still shows who rides next');
  assert.match(html, /Viewer &lt;Open&gt;/, 'names stay escaped');
});

test('completed: the view can watch the replay and journeys, nothing else', () => {
  const t = tournament(9, 1e9);
  assert.equal(t.status, 'completed');
  const view = actions(screen(t, true));
  for (const a of ORGANISER_ACTIONS) assert.ok(!view.has(a), `view offers ${a}`);
  assert.ok(view.has('open-replay') && view.has('open-journey'));
  for (const a of view) assert.ok(['go-home', 'open-replay', 'open-journey'].includes(a), `unexpected action ${a}`);
});
