// Shown for an address that doesn't lead to anything: an unknown path, a tournament
// that doesn't exist (or isn't yours), or a link that isn't live yet.
import { brandLogo } from './html.js';

function renderNotFound(state) {
  if (state && state.notFoundReason === 'offline') {
    return `
    <div class="topbar">
      <div class="title"><h1 class="brand-h1 small">${brandLogo()}</h1></div>
    </div>
    <div class="card">
      <h2>You&rsquo;re offline</h2>
      <p>This tournament isn&rsquo;t on this device yet, and the server can&rsquo;t be reached. Try again when you&rsquo;re back online.</p>
      <button class="primary" data-action="go-home">Open rebattle</button>
    </div>
  `;
  }
  return `
    <div class="topbar">
      <div class="title"><h1 class="brand-h1 small">${brandLogo()}</h1></div>
    </div>
    <div class="card">
      <h2>Nothing here</h2>
      <p>We couldn't find a tournament at this address. Check the link you were sent.</p>
      <button class="primary" data-action="go-home">Open rebattle</button>
    </div>
  `;
}

// While an online tournament loads for the first time on this device.
function renderLoading() {
  return `
    <div class="topbar">
      <div class="title"><h1 class="brand-h1 small">${brandLogo()}</h1></div>
    </div>
    <div class="card"><p class="empty" style="margin:0;">Loading the tournament&hellip;</p></div>
  `;
}

export { renderNotFound, renderLoading };
