// Competitions their organisers listed on rebattle.app (GET /api/competitions): the
// /competitions page, and the latest few on the introduction. Each card opens the
// public page, so people can follow along from the start or look back at the results.

import { brandHome, escapeHtml } from './html.js';

const CODE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/; // same as route.js
const LIVE_FOR = 6 * 60 * 60 * 1000; // "Live now" while a result came in during the last 6 hours

function status(c, now) {
  if (c.status === 'completed') return c.winner ? `Winner: <strong>${escapeHtml(c.winner)}</strong>` : 'Finished';
  if (!c.started) return 'Starting soon';
  return now - c.updatedAt < LIVE_FOR ? '<span class="live-dot"></span>Live now' : 'In progress';
}

function renderCompetitionCards(items, now = Date.now()) {
  return items
    .filter((c) => CODE.test(c.code))
    .map(
      (c) => `
      <a class="competition-card" href="/t/${c.code}">
        <span class="competition-name">${escapeHtml(c.name)}</span>
        <span class="competition-meta">${c.riders} riders &middot; ${new Date(c.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <span class="competition-status">${status(c, now)}</span>
      </a>`
    )
    .join('');
}

// state.competitions: { items, total, loading, error }
function renderCompetitions(state) {
  const list = state.competitions || { items: [], total: 0, loading: true };
  let body;
  if (list.error && !list.items.length) body = `<p class="empty">Couldn&rsquo;t load the list (${escapeHtml(list.error)}). Try again in a moment.</p>`;
  else if (list.loading && !list.items.length) body = '<p class="empty">Loading&hellip;</p>';
  else if (!list.items.length) body = '<p class="empty">No listed competitions yet.</p>';
  else
    body = `<div class="competition-grid">${renderCompetitionCards(list.items)}</div>${
      list.items.length < list.total ? `<button class="show-more" data-action="more-competitions" ${list.loading ? 'disabled' : ''}>Show more</button>` : ''
    }`;
  return `
    <div class="topbar event-top">
      <div class="title"><h1>Competitions</h1></div>
      ${brandHome()}
    </div>
    <p class="intro-note">Competitions their organisers chose to list. Tap one to follow it live, or to see how it went.</p>
    ${body}`;
}

// The introduction's section: the latest few, or nothing until there are some.
function renderIntroCompetitions(items) {
  if (!items || !items.length) return '';
  return `
      <h2>Competitions</h2>
      <div class="competition-grid">${renderCompetitionCards(items)}</div>
      <p><a href="/competitions">All competitions &rarr;</a></p>`;
}

export { renderCompetitions, renderCompetitionCards, renderIntroCompetitions };
