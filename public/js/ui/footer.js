// The footer on every screen but the replay: the way to the introduction, following
// a competition, your tournaments, the colours (Auto / Light / Dark) and the organiser
// login (filled in place by app.js once known, data-account). One row on desktop, two
// columns on phones.

import { brandName } from './html.js';
import { renderAccount } from './home.js';

const THEMES = [
  ['auto', 'Auto', 'Follow this device’s light or dark setting'],
  ['light', 'Light', 'Day colours'],
  ['dark', 'Dark', 'Night colours'],
];

// state.hasWork: tournaments saved on this device (then "Your tournaments" shows).
// state.theme: 'auto', 'light' or 'dark' (js/theme.js applies it).
function renderFooter(state) {
  return `
    <footer class="site-footer">
      <a class="site-brand" href="/about" aria-label="rebattle: about">${brandName()}</a>
      <nav class="site-links" aria-label="rebattle">
        <a href="/about">About</a>
        <a href="/about#follow">Follow a competition</a>
        ${state.hasWork ? '<a href="/tournaments">Your tournaments</a>' : ''}
      </nav>
      <div class="theme-switch" role="group" aria-label="Theme">
        <span>Theme</span>
        ${THEMES.map(([value, label, title]) => `<button type="button" class="small" data-action="set-theme" data-theme-choice="${value}" title="${title}" aria-pressed="${state.theme === value}">${label}</button>`).join('')}
      </div>
      <div class="site-account" data-account>${renderAccount(state.organiser)}</div>
    </footer>`;
}

export { renderFooter };
