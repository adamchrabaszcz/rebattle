// Home screen: the saved tournaments (passed in as state.tournaments).

import { brandLogo, escapeHtml } from './html.js';

// ---- Home / tournament list ---------------------------------------------

function renderHome(state) {
  const all = state.tournaments.slice().sort((a, b) => b.createdAt - a.createdAt);
  const list = all.length
    ? `<div class="tournament-list">${all
        .map(
          (t) => `
      <div class="item">
        <div>
          <div><strong>${escapeHtml(t.name)}</strong></div>
          <div class="meta">${t.competitors.length} competitors &middot; ${t.status === 'completed' ? 'completed' : 'in progress'} &middot; ${new Date(
            t.createdAt
          ).toLocaleString()}</div>
        </div>
        <div class="toolbar">
          <button data-action="open-tournament" data-id="${t.id}">Open</button>
          <button class="danger small" data-action="delete-tournament" data-id="${t.id}">Delete</button>
        </div>
      </div>`
        )
        .join('')}</div>`
    : `<p class="empty">No tournaments saved yet.</p>`;

  return `
    <div class="topbar">
      <div class="title"><h1 class="brand-h1">${brandLogo({ animate: true })}</h1></div>
      <div class="toolbar">
        <label class="file-input-label btn">Import JSON<input type="file" accept="application/json" data-action="import-file" /></label>
        <button class="primary" data-action="go-setup">New tournament</button>
      </div>
    </div>
    <div class="card">
      <h2>Saved tournaments</h2>
      ${list}
    </div>
  `;
}

export { renderHome };
