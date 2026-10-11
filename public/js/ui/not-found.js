// Shown for an address that doesn't lead to anything (yet): an unknown path, or a
// tournament link before cloud saving exists.
import { brandLogo } from './html.js';

function renderNotFound() {
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

export { renderNotFound };
