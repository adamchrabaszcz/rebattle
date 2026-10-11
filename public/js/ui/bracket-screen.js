// The tournament screen: header, toolbar, rename panel, standings and legend.

import * as Bracket from '../engine/bracket.js';
import { renderFinal4, renderLosersBracket, renderWinnersBracket } from './brackets.js';
import { renderUpNext } from './cards.js';
import { riderSlugs } from '../engine/slug.js';
import { brandHome, DRAW_ICON, escapeHtml } from './html.js';
import { renderShare } from './share.js';

function renderStandings(tournament) {
  if (tournament.status !== 'completed') return '';
  const medals = ['🥇', '🥈', '🥉'];
  return `
    <div class="section">
      <h2>Final standings</h2>
      <ol class="standings">
        ${Bracket.getPlacings(tournament)
          .map(
            ({ id, place }, i, all) => {
              // A shared place is numbered once, on the first rider of the group.
              const first = i === 0 || all[i - 1].place !== place;
              return `<li class="${i === 0 ? 'top1' : ''}" data-cid="${id}"><span class="rank">${
                first ? medals[place - 1] || place + '.' : ''
              }</span><span class="standing-name">${escapeHtml(
                Bracket.getName(tournament, id)
              )}</span><button class="small journey-btn" data-action="open-journey" data-cid="${id}">Share journey</button></li>`;
            }
          )
          .join('')}
      </ol>
    </div>
  `;
}

function renderRenamePanel(state) {
  if (!state.nameDraft) return '';
  const t = state.tournament;
  const inputs = t.competitors
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (c) =>
        `<input type="text" class="rename-input" data-cid="${c.id}" value="${escapeHtml(state.nameDraft[c.id])}" aria-label="Name for ${escapeHtml(c.name)}" />`
    )
    .join('');
  return `
    <div class="card section">
      <h2>Edit names</h2>
      <p style="margin-top:0;">Fix typos at any point &mdash; results and bracket positions stay the same.</p>
      <div class="field">
        <label for="rename-title">Tournament name</label>
        <input type="text" id="rename-title" class="rename-title" value="${escapeHtml(state.titleDraft)}" />
      </div>
      <label>Competitors</label>
      <div class="name-grid">${inputs}</div>
      <button class="primary" data-action="save-names">Save changes</button>
      <button data-action="cancel-names">Cancel</button>
      <span id="rename-error" style="color:#e35b5b; margin-left:12px;"></span>
    </div>
  `;
}

// What the marks on the bracket mean. Samples reuse the real classes so they always
// look exactly like the bracket; items that only exist on one layout are tagged.
function renderLegend(readOnly) {
  const item = (sample, label, only) =>
    `<div class="key-item${only ? ' only-' + only : ''}"><span class="key-sample">${sample}</span><span>${label}</span></div>`;
  return `
    <section class="section key">
      <h2>Legend</h2>
      <div class="key-grid">
        ${item(DRAW_ICON, 'Random draw &mdash; Losers bracket pairings are drawn fresh each round')}
        ${item('<span class="bye-tag">BYE</span>', 'Bye &mdash; no opponent, the rider goes straight through')}
        ${item('<span class="key-card ready"></span>', readOnly ? 'Ready to ride &mdash; up next' : 'Ready to ride &mdash; pick the winner')}
        ${item('<span class="drop-tag">&darr; to LB R2</span>', 'Lost in the Winners bracket &mdash; second chance in the Losers bracket')}
        ${item('<span class="drop-tag">from WB R2</span>', 'Came down from the Winners bracket')}
        ${item('<span class="drop-tag semi-tag">&rarr; Semifinal 1</span>', 'Where each bracket&rsquo;s top two go in the Final 4')}
        ${item('<span class="drop-tag next-tag">&rarr; R3</span>', 'Where the winner rides next', 'phone')}
        ${item('<span class="result-icon eliminated">&#x2715;</span>', 'Out &mdash; lost twice')}
        ${item('<span class="result-icon medal">🥇🥈🥉</span>', 'Final places')}
        ${item('<span class="key-line"></span>', 'Winner&rsquo;s path', 'desktop')}
        ${item('<span class="key-line lose"></span>', 'Loser&rsquo;s path (to the Losers bracket or Small final)', 'desktop')}
        ${item('<span class="key-hover">Name</span>', 'Hover a rider to highlight their whole path', 'desktop')}
      </div>
    </section>
  `;
}

// Organisers get every action; the read-only view only gets watching the replay,
// and sharing the link when it's a public page.
function renderToolbar(state) {
  const t = state.tournament;
  const replay = t.status === 'completed' ? '<button class="primary" data-action="open-replay">Share replay</button>' : '';
  const share = state.live || state.online ? '<button data-action="open-share" data-share="tournament">Share</button>' : '';
  if (state.readOnly) return replay || share ? `<div class="toolbar event-toolbar">${share}${replay}</div>` : '';
  return `
      <div class="toolbar event-toolbar">
        <button data-action="undo" ${state.undoStack.length ? '' : 'disabled'}>Undo</button>
        ${share}
        ${replay}
        <button class="more-toggle" aria-label="More actions" data-action="toggle-more">&middot;&middot;&middot;</button>
        <div class="toolbar-more">
          <button data-action="edit-names" ${state.nameDraft ? 'disabled' : ''}>Edit names</button>
          <button data-action="export">Export JSON</button>
          <label class="file-input-label btn">Import JSON<input type="file" accept="application/json" data-action="import-file" /></label>
          <button data-action="go-home">Tournament list</button>
          <button class="danger" data-action="new-tournament">New tournament</button>
        </div>
      </div>`;
}

// Where an online tournament's changes are: shown next to the status and updated in
// place by the app (data-sync) as saves go out.
function renderSync(online) {
  const s = online.status;
  if (s === 'saving') return 'saving&hellip;';
  if (s === 'offline') return '<span class="sync-offline">offline, changes waiting</span>';
  if (s === 'conflict') return '<span class="sync-conflict">changed on another device</span>';
  if (s === 'error') return `<span class="sync-error">not saved online: ${escapeHtml(online.detail || 'error')}</span>`;
  return 'saved online';
}

// How a public page is getting its updates (store/live.js), updated in place (data-live).
function renderLive(status) {
  if (status === 'live') return '<span class="live-dot"></span>live';
  if (status === 'polling') return 'updates every 20 s';
  if (status === 'offline') return '<span class="sync-offline">offline, retrying</span>';
  return 'connecting&hellip;';
}

// Public page: every rider, linking to their own page.
function renderRiders(state) {
  const t = state.tournament;
  const slugs = riderSlugs(t);
  const code = escapeHtml(state.live.code);
  const links = t.competitors
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `<a href="/t/${code}/${escapeHtml(slugs[c.id])}" data-cid="${c.id}">${escapeHtml(c.name)}</a>`)
    .join('');
  return `
    <section class="section riders">
      <h2>Riders</h2>
      <p class="note">Tap a name for that rider&rsquo;s own page: their heats, what&rsquo;s next and, at the end, their journey video.</p>
      <div class="rider-links">${links}</div>
    </section>`;
}

// Another device saved this tournament since this one last did. Nothing is lost
// either way: the other version is in the banner, this one stays on this device.
function renderConflict(state) {
  if (!state.online || state.online.status !== 'conflict') return '';
  return `<div class="card" style="border-color: var(--lose); margin-bottom:20px;">
            <strong>This tournament was changed on another device.</strong>
            <p style="margin:6px 0 10px;">Your latest changes here weren&rsquo;t saved online. Use the other device&rsquo;s version, or keep yours and replace it.</p>
            <button class="primary" data-action="sync-use-theirs">Use the other version</button>
            <button data-action="sync-keep-mine">Keep mine</button>
          </div>`;
}

function renderBracketScreen(state) {
  const t = state.tournament;
  const readOnly = !!state.readOnly;
  return `
    <div class="topbar event-top">
      <div class="title"><h1>${escapeHtml(t.name)}</h1><small>${t.competitors.length} competitors &middot; ${
    t.settings.heatFormat === 'bo3' ? 'best of 3' : 'single run'
  } &middot; ${t.status === 'completed' ? 'completed' : 'in progress'}${
    state.live ? ` &middot; <span data-live>${renderLive(state.live.status)}</span>` : readOnly ? ' &middot; <span class="view-badge">view only</span>' : ''
  }${
    state.online ? ` &middot; <span data-sync>${renderSync(state.online)}</span>` : ''
  }</small></div>
      ${brandHome()}
    </div>
    ${renderToolbar(state)}
    ${renderShare(state)}
    ${
      state.externalUpdateAvailable
        ? `<div class="card" style="border-color: var(--accent-2); margin-bottom:20px;">
            <strong>This tournament was just updated in another tab/window.</strong>
            <p style="margin:6px 0 10px;">Your view here is out of date. Reload it before recording anything else, or you risk overwriting what was saved there.</p>
            <button class="primary" data-action="reload-external-update">Reload latest version</button>
          </div>`
        : ''
    }
    ${renderConflict(state)}
    ${readOnly ? '' : renderRenamePanel(state)}
    ${
      t.status === 'completed'
        ? `<div class="results-row">${renderStandings(t)}${renderFinal4(t, readOnly)}</div>` // side by side on desktop
        : renderUpNext(t, readOnly) + renderFinal4(t, readOnly)
    }
    ${renderWinnersBracket(t, readOnly)}
    ${renderLosersBracket(t, readOnly)}
    ${state.live ? renderRiders(state) : ''}
    ${renderLegend(readOnly)}
    <footer class="note">${
      state.live
        ? 'Live: new results show up here as the organiser records them.'
        : readOnly
        ? 'View only. New results show up here as soon as they are recorded in this browser.'
        : state.online
        ? `Saved online, and on this device so it keeps working offline. Public page: <a href="/t/${escapeHtml(state.online.code)}">${escapeHtml(location.host)}/t/${escapeHtml(state.online.code)}</a>`
        : 'Auto-saved locally in this browser. Use Export to back up or move to another device.'
    }</footer>
  `;
}

export { renderBracketScreen, renderSync, renderLive };
