// The footer on every screen but the replay: the way to the introduction, following
// a competition, your tournaments, and the organiser login (filled in place by app.js
// once known, data-account). One row on desktop, two columns on phones.

import { R_MARK } from './html.js';
import { renderAccount } from './home.js';

// state.hasWork: tournaments saved on this device (then "Your tournaments" shows).
function renderFooter(state) {
  return `
    <footer class="site-footer">
      <a class="site-brand" href="/about">${R_MARK}<span>rebattle</span></a>
      <nav class="site-links" aria-label="rebattle">
        <a href="/about">About</a>
        <a href="/about#follow">Follow a competition</a>
        ${state.hasWork ? '<a href="/tournaments">Your tournaments</a>' : ''}
      </nav>
      <div class="site-account" data-account>${renderAccount(state.organiser)}</div>
    </footer>`;
}

export { renderFooter };
