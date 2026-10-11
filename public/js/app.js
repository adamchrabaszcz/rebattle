// Entry point: owns app state and handles every click (data-action delegation).
import * as Bracket from './engine/bracket.js';
import * as Store from './store/local.js';
import { render as renderScreen } from './ui/index.js';
import { brandLogo, escapeHtml } from './ui/html.js';
import { computeEstimateHtml } from './ui/setup.js';
import * as Replay from './replay/player.js';
import { parseRoute } from './route.js';

const container = document.getElementById('app');
const UNDO_LIMIT = 20;

function freshDraft() {
  return { name: '', competitorCount: null, lapTimeSeconds: 20, breakSeconds: 0, heatFormat: 'single', names: [] };
}

function defaultTournamentName() {
  return 'Tournament — ' + new Date().toLocaleDateString();
}

const state = {
  screen: 'home',
  draft: freshDraft(),
  tournament: null,
  undoStack: [],
  externalUpdateAvailable: false,
  nameDraft: null, // { competitorId: name } while the rename panel is open
  titleDraft: '', // tournament name being edited in the same panel
  tournaments: [], // saved list, filled for the home screen
  readOnly: false, // view only: nothing can be recorded or edited (?view for now, the public link later)
};

// The only actions the read-only view runs. An allowlist, so anything added later
// stays organiser-only unless it is listed here on purpose.
const VIEW_ACTIONS = new Set(['go-home', 'open-replay', 'open-journey', 'close-replay']);

function render() {
  try {
    if (state.screen !== 'replay') Replay.unmount();
    // Views get their data through state and never read storage themselves.
    state.tournaments = state.screen === 'home' ? Store.loadAll() : [];
    renderScreen(container, state);
    if (state.screen === 'setup') bindSetupLiveUpdates();
    if (state.screen === 'replay') Replay.mount(container, state.tournament, state.replayFocus);
  } catch (e) {
    console.error('Render failed', e);
    renderCrashScreen(e);
  }
}

// A tournament saved by an older version of this app (different data shape)
// can throw mid-render. Rather than leave a blank page, fall back to a
// screen that explains what happened and offers a way out without losing
// every other saved tournament.
function renderCrashScreen(error) {
  const brokenId = state.tournament && state.tournament.id;
  container.innerHTML = `
    <div class="topbar">
      <div class="title"><h1 class="brand-h1 small">${brandLogo()}</h1><small>Something went wrong</small></div>
    </div>
    <div class="card">
      <h2>This tournament couldn't be displayed</h2>
      <p>It was likely saved by an older version of this app and is missing data the current version expects.</p>
      <p style="font-family:monospace; font-size:12px;">${escapeHtml(error && error.message)}</p>
      <div class="toolbar" style="margin-top:16px;">
        ${brokenId && !state.readOnly ? '<button class="danger" data-action="discard-broken-tournament">Discard this tournament</button>' : ''}
        <button data-action="${state.readOnly ? 'go-home' : 'go-home-force'}">Back to tournament list</button>
      </div>
    </div>
  `;
}

function bindSetupLiveUpdates() {
  const countEl = document.getElementById('f-count');
  const lapEl = document.getElementById('f-lap');
  const breakEl = document.getElementById('f-break');
  const holder = document.getElementById('estimate-holder');

  function update() {
    const n = parseInt(countEl.value, 10);
    const lap = parseFloat(lapEl.value);
    const brk = parseFloat(breakEl.value);
    holder.innerHTML = computeEstimateHtml(n, lap, brk);
  }

  [countEl, lapEl, breakEl].forEach((el) => el && el.addEventListener('input', update));

  container.querySelectorAll('input[name="heatFormat"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      container.querySelectorAll('.format-option').forEach((opt) => opt.classList.remove('selected'));
      radio.closest('.format-option').classList.add('selected');
    });
  });
}

function snapshotUndo() {
  if (!state.tournament) return;
  state.undoStack.push(JSON.parse(JSON.stringify(state.tournament)));
  if (state.undoStack.length > UNDO_LIMIT) state.undoStack.shift();
}

// Browser storage can be full or blocked (private mode). The result is still applied
// on screen; say so loudly so the organiser exports a backup instead of losing it.
function saveActive() {
  if (!state.tournament) return;
  try {
    Store.upsert(state.tournament);
  } catch (e) {
    console.error('Save failed', e);
    alert('Could not save in this browser (storage full or blocked). The change is shown but NOT saved: use Export JSON now to keep a backup.');
  }
}

function goHome() {
  state.screen = 'home';
  render();
}

function goSetup() {
  state.draft = freshDraft();
  state.screen = 'setup';
  render();
}

function handleSetupNext() {
  const name = document.getElementById('f-name').value.trim();
  const count = parseInt(document.getElementById('f-count').value, 10);
  const lap = parseFloat(document.getElementById('f-lap').value);
  const brk = parseFloat(document.getElementById('f-break').value) || 0;
  const format = (container.querySelector('input[name="heatFormat"]:checked') || {}).value || 'single';

  if (!count || count < 4) {
    alert('Enter at least 4 competitors.');
    return;
  }
  if (!lap || lap <= 0) {
    alert('Enter a lap time greater than 0.');
    return;
  }

  const prevNames = state.draft.names || [];
  const names = Array.from({ length: count }, (_, i) => prevNames[i] || '');

  state.draft = { name, competitorCount: count, lapTimeSeconds: lap, breakSeconds: brk, heatFormat: format, names };
  state.screen = 'names';
  render();
}

function handleNamesDraw() {
  const inputs = Array.from(container.querySelectorAll('.name-input'));
  const names = inputs.map((inp) => inp.value.trim());
  const errorEl = document.getElementById('names-error');

  if (names.some((n) => !n)) {
    errorEl.textContent = 'Please fill in every competitor name.';
    return;
  }

  let tournament;
  try {
    tournament = Bracket.createTournament({
      name: state.draft.name || defaultTournamentName(),
      competitorNames: names,
      settings: {
        lapTimeSeconds: state.draft.lapTimeSeconds,
        breakSeconds: state.draft.breakSeconds,
        heatFormat: state.draft.heatFormat,
      },
    });
  } catch (e) {
    errorEl.textContent = e.message;
    return;
  }

  Store.upsert(tournament);
  Store.setActiveId(tournament.id);
  state.tournament = tournament;
  state.undoStack = [];
  state.screen = 'bracket';
  render();
}

function handleRecordWinner(matchId, winnerId) {
  if (state.externalUpdateAvailable) {
    alert('This tournament changed in another tab/window. Reload it (button above) before recording more results, or you could overwrite what was just saved there.');
    return;
  }
  snapshotUndo();
  try {
    Bracket.recordRaceWinner(state.tournament, matchId, winnerId);
  } catch (e) {
    alert(e.message);
    state.undoStack.pop();
    return;
  }
  saveActive();
  render();
}

// Matches reference competitors by id, so a rename only touches the
// competitor list and shows up everywhere on the next render.
function handleSaveNames() {
  if (state.externalUpdateAvailable) {
    alert('This tournament changed in another tab/window. Reload it (button above) before editing names, or you could overwrite what was just saved there.');
    return;
  }
  const draft = state.nameDraft;
  const title = state.titleDraft.trim();
  const errorEl = document.getElementById('rename-error');
  if (!title) {
    if (errorEl) errorEl.textContent = 'The tournament name cannot be empty.';
    return;
  }
  if (Object.values(draft).some((n) => !n.trim())) {
    if (errorEl) errorEl.textContent = 'Names cannot be empty.';
    return;
  }
  const changed = title !== state.tournament.name || state.tournament.competitors.some((c) => draft[c.id].trim() !== c.name);
  if (changed) {
    snapshotUndo(); // one undo step reverts the whole edit, title included
    state.tournament.name = title;
    state.tournament.competitors.forEach((c) => (c.name = draft[c.id].trim()));
    saveActive();
  }
  state.nameDraft = null;
  render();
}

function handleUndo() {
  if (!state.undoStack.length) return;
  if (state.externalUpdateAvailable) {
    alert('This tournament changed in another tab/window. Reload it (button above) before undoing, or you could overwrite what was just saved there.');
    return;
  }
  state.nameDraft = null; // an open rename panel would hold names from before the undo
  state.tournament = state.undoStack.pop();
  saveActive();
  render();
}

function handleOpenTournament(id) {
  const t = Store.getById(id);
  if (!t) return;
  state.nameDraft = null;
  state.tournament = t;
  Store.setActiveId(id);
  state.undoStack = [];
  state.screen = 'bracket';
  render();
}

function handleDeleteTournament(id) {
  if (!confirm('Delete this tournament? This cannot be undone.')) return;
  Store.remove(id);
  if (state.tournament && state.tournament.id === id) state.tournament = null;
  render();
}

function handleReloadExternalUpdate() {
  if (state.tournament) {
    const fresh = Store.getById(state.tournament.id);
    if (fresh) state.tournament = fresh;
    state.undoStack = []; // snapshots from before the reload no longer apply
  }
  state.externalUpdateAvailable = false;
  render();
}

// Runs in every OTHER tab/window than the one that made the change — this is
// how we notice "the same tournament is also open elsewhere and just got
// updated there", so we can warn before this tab's next save silently
// clobbers it. (Opening two DIFFERENT tournaments in two tabs is fine and
// never triggers this — each saves under its own id with no conflict.)
window.addEventListener('storage', (e) => {
  if (e.key !== null && e.key !== 'ruedaBattle.tournaments') return; // pre-rename key, see store/local.js
  if (!state.tournament) return;
  const fresh = Store.getById(state.tournament.id);
  if (!fresh) return;
  if (state.readOnly) {
    // Nothing to overwrite here, so the view simply follows along (a running replay
    // keeps its own copy; the bracket is current again once it's closed).
    state.tournament = fresh;
    if (state.screen === 'bracket') render();
    return;
  }
  if (state.screen !== 'bracket') return;
  if (JSON.stringify(fresh) !== JSON.stringify(state.tournament)) {
    state.externalUpdateAvailable = true;
    render();
  }
});

function handleImportFile(file) {
  Store.readFile(file)
    .then((t) => {
      const existing = Store.getById(t.id);
      if (existing && !confirm(`"${existing.name}" is already saved here. Replace it with the version from this file? Results recorded since that file was exported will be lost.`)) return;
      Store.upsert(t);
      state.nameDraft = null;
      Store.setActiveId(t.id);
      state.tournament = t;
      state.undoStack = [];
      state.screen = 'bracket';
      render();
    })
    .catch((e) => alert('Import failed: ' + e.message));
}

container.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (state.readOnly && !VIEW_ACTIONS.has(action)) return;

  // Away from the plain app (the read-only view, or another address): load / afresh.
  if (action === 'go-home' && (state.readOnly || location.pathname !== '/')) location.href = '/';
  else if (action === 'go-home') goHome();
  else if (action === 'go-setup') goSetup();
  else if (action === 'go-setup-back') {
    state.screen = 'setup';
    render();
  } else if (action === 'setup-next') handleSetupNext();
  else if (action === 'names-draw') handleNamesDraw();
  else if (action === 'record-winner') handleRecordWinner(el.dataset.match, el.dataset.winner);
  else if (action === 'undo') handleUndo();
  else if (action === 'toggle-more') el.parentElement.classList.toggle('open');
  else if (action === 'open-replay' || action === 'open-journey') {
    state.replayFocus = action === 'open-journey' ? el.dataset.cid : null;
    state.screen = 'replay';
    render();
  } else if (action === 'close-replay') {
    state.screen = 'bracket';
    render();
  }
  else if (action === 'edit-names') {
    state.nameDraft = {};
    state.titleDraft = state.tournament.name;
    state.tournament.competitors.forEach((c) => (state.nameDraft[c.id] = c.name));
    render();
  } else if (action === 'cancel-names') {
    state.nameDraft = null;
    render();
  } else if (action === 'save-names') handleSaveNames();
  else if (action === 'export') Store.exportToFile(state.tournament);
  else if (action === 'new-tournament') goSetup();
  else if (action === 'open-tournament') handleOpenTournament(el.dataset.id);
  else if (action === 'delete-tournament') handleDeleteTournament(el.dataset.id);
  else if (action === 'reload-external-update') handleReloadExternalUpdate();
  else if (action === 'go-home-force') {
    state.tournament = null;
    Store.setActiveId(null);
    state.screen = 'home';
    render();
  } else if (action === 'discard-broken-tournament') {
    if (state.tournament) Store.remove(state.tournament.id);
    state.tournament = null;
    state.screen = 'home';
    render();
  }
});

container.addEventListener('input', (e) => {
  const el = e.target.closest('.rename-input');
  if (el && state.nameDraft) state.nameDraft[el.dataset.cid] = el.value;
  if (e.target.id === 'rename-title') state.titleDraft = e.target.value;
});

container.addEventListener('change', (e) => {
  if (state.readOnly) return;
  const el = e.target.closest('[data-action="import-file"]');
  if (el && el.files && el.files[0]) {
    handleImportFile(el.files[0]);
    el.value = '';
  }
});

// ---- init ---------------------------------------------------------------

// Tournament addresses (/t/<code>, /manage/<code>) arrive with cloud saving; until
// then they, like any unknown path, show "not found". See route.js.
// ?view (the active tournament) or ?view=<id> opens it read-only, without changing
// which tournament is active for the organiser in this browser.
const route = parseRoute(location.pathname);
const params = new URLSearchParams(location.search);
const viewed = route.name === 'home' && params.has('view') && Store.getById(params.get('view') || Store.getActiveId());
if (route.name !== 'home') {
  state.screen = 'notFound';
} else if (viewed) {
  state.readOnly = true;
  state.tournament = viewed;
  state.screen = 'bracket';
} else {
  const activeId = Store.getActiveId();
  if (activeId) {
    const t = Store.getById(activeId);
    if (t) {
      state.tournament = t;
      state.screen = 'bracket';
    }
  }
}
render();
