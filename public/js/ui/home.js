// Home screen: online tournaments (when logged in) and the ones saved in this browser.
// On phones a tap anywhere on a row opens it (open-row in app.js) and the Open
// buttons are hidden; on desktop the Open button does.
// The lists sit in their own element: the app fills in the online part (and the
// "Move online" buttons) once it knows who is logged in, without restarting the logo
// animation.

import { brandLogo, escapeHtml } from './html.js';

const when = (ms) => new Date(ms).toLocaleString();
const statusText = (s) => (s === 'completed' ? 'completed' : 'in progress');

function renderHome(state) {
  return `
    <div class="topbar">
      <div class="title"><h1 class="brand-h1">${brandLogo({ animate: true })}</h1></div>
      <div class="toolbar">
        <label class="file-input-label btn">Import JSON<input type="file" accept="application/json" data-action="import-file" /></label>
        <button class="primary" data-action="go-setup">New tournament</button>
      </div>
    </div>
    <div data-lists>${renderLists(state)}</div>
  `;
}

// state.onlineList: undefined (not logged in / not known yet), null (loading), or the
// list; state.onlineFromDevice: the server couldn't be reached, so it shows the copies
// kept on this device. state.onlinePending: codes with changes not uploaded yet.
function renderLists(state) {
  const loggedIn = !!state.organiser;
  return (loggedIn ? renderOnline(state) : '') + renderLocal(state, loggedIn);
}

function renderOnline(state) {
  const entries = state.onlineList;
  let body;
  if (entries === null || entries === undefined) body = '<p class="empty">Loading&hellip;</p>';
  else if (!entries.length) body = '<p class="empty">No online tournaments yet. While you&rsquo;re logged in, new tournaments are saved online.</p>';
  else
    body = `<div class="tournament-list">${entries
      .map((e) => {
        const code = escapeHtml(e.code);
        const pending = (state.onlinePending || []).includes(e.code) ? ' &middot; <span class="sync-pending">changes waiting to upload</span>' : '';
        const meta = e.competitors != null ? `${e.competitors} competitors &middot; ${statusText(e.status)} &middot; updated ${when(e.updatedAt)}` : statusText(e.status);
        return `
      <div class="item" data-action="open-row" data-code="${code}">
        <div>
          <div><strong>${escapeHtml(e.name)}</strong></div>
          <div class="meta">${meta}${pending} &middot; <span class="code">${code}</span></div>
        </div>
        <div class="toolbar">
          <a class="btn open-btn" href="/manage/${code}">Open</a>
          <button class="danger small" data-action="delete-online" data-code="${code}">Delete</button>
        </div>
      </div>`;
      })
      .join('')}</div>`;
  const note = state.onlineFromDevice ? '<p class="empty">Offline: showing the copies on this device.</p>' : '';
  return `
    <div class="card">
      <h2>Online</h2>
      ${note}${body}
    </div>`;
}

function renderLocal(state, loggedIn) {
  const all = state.tournaments.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (loggedIn && !all.length) return ''; // nothing local: the online card says it all
  const list = all.length
    ? `<div class="tournament-list">${all
        .map(
          (t) => `
      <div class="item" data-action="open-row" data-id="${t.id}">
        <div>
          <div><strong>${escapeHtml(t.name)}</strong></div>
          <div class="meta">${t.competitors.length} competitors &middot; ${statusText(t.status)} &middot; ${when(t.createdAt)}</div>
        </div>
        <div class="toolbar">
          <button class="open-btn" data-action="open-tournament" data-id="${t.id}">Open</button>
          ${loggedIn ? `<button class="small" data-action="move-online" data-id="${t.id}">Move online</button>` : ''}
          <button class="danger small" data-action="delete-tournament" data-id="${t.id}">Delete</button>
        </div>
      </div>`
        )
        .join('')}</div>`
    : `<p class="empty">No tournaments saved yet.</p>`;
  return `
    <div class="card">
      <h2>${loggedIn ? 'In this browser only' : 'Saved tournaments'}</h2>
      ${list}
    </div>`;
}

// The organiser login line. undefined = not known yet (the app asks the server after
// the first paint and then fills in just this element). Log in and out are plain
// links: Access handles both pages.
function renderAccount(organiser) {
  if (organiser === undefined) return '';
  if (!organiser) return '<a href="/api/manage/login">Organiser log in</a> &middot; save tournaments online';
  return `Logged in as ${escapeHtml(organiser)} &middot; <a href="/cdn-cgi/access/logout">Log out</a>`;
}

export { renderHome, renderLists, renderAccount };
