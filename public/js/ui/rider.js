// A rider's own page (/t/<code>/<rider>): where they stand, what's next, the heats
// they rode, and their journey video once it's over. Live like the bracket.

import * as Bracket from '../engine/bracket.js';
import { riderSummary } from '../engine/rider.js';
import { stageLabel } from './cards.js';
import { brandHome, escapeHtml } from './html.js';
import { renderLive } from './bracket-screen.js';
import { renderShare } from './share.js';

const MEDALS = ['🥇', '🥈', '🥉'];

function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return n + s;
}

function headline(sum) {
  if (sum.stage === 'placed') return sum.place ? `${MEDALS[sum.place - 1] ? MEDALS[sum.place - 1] + ' ' : ''}${ordinal(sum.place)} place` : 'Finished';
  if (sum.stage === 'out') return 'Out &mdash; lost twice';
  if (sum.stage === 'final4') return 'In the Final 4';
  if (sum.stage === 'losers') return 'In the Losers bracket &mdash; one more loss and out';
  return 'Unbeaten &mdash; in the Winners bracket';
}

function nextLine(t, sum) {
  const name = (id) => escapeHtml(Bracket.getName(t, id));
  if (sum.next) {
    const label = escapeHtml(stageLabel(t, sum.next.match));
    if (!sum.next.opponentId) return `<strong>Next:</strong> ${label}, opponent not decided yet`;
    return `<strong>Next:</strong> ${label} vs ${name(sum.next.opponentId)} <span class="ready-tag">ready to ride</span>`;
  }
  if (!sum.waiting) return '';
  if (sum.stage === 'final4') return 'Through to the Final 4 &mdash; waiting for the other bracket to finish';
  return 'Waiting for the next Losers bracket draw';
}

function heatRow(t, h) {
  const label = escapeHtml(stageLabel(t, h.match));
  if (h.bye) return `<li><span class="heat-label">${label}</span><span class="heat-vs">Bye &mdash; through without riding</span><span class="heat-result won">Through</span></li>`;
  const score = h.match.racesNeededToWin > 1 ? ` ${h.score[0]}&ndash;${h.score[1]}` : '';
  return `<li><span class="heat-label">${label}</span><span class="heat-vs">vs ${escapeHtml(Bracket.getName(t, h.opponentId))}</span><span class="heat-result ${h.won ? 'won' : 'lost'}">${
    h.won ? 'Won' : 'Lost'
  }${score}</span></li>`;
}

function renderRiderScreen(state) {
  const t = state.tournament;
  const cid = state.riderId;
  const sum = riderSummary(t, cid);
  const next = nextLine(t, sum);
  return `
    <div class="topbar event-top">
      <div class="title"><h1>${escapeHtml(Bracket.getName(t, cid))}</h1><small>${escapeHtml(t.name)}${
    state.live ? ` &middot; <span data-live>${renderLive(state.live.status)}</span>` : ''
  }</small></div>
      ${brandHome()}
    </div>
    <div class="toolbar event-toolbar">
      <a class="btn" href="/t/${escapeHtml(state.live.code)}">Whole bracket</a>
      <button data-action="open-share" data-share="rider">Share</button>
      ${t.status === 'completed' ? `<button class="primary" data-action="open-journey" data-cid="${cid}">Watch my journey</button>` : ''}
    </div>
    ${renderShare(state)}
    <div class="card section rider-status">
      <div class="rider-headline">${headline(sum)}</div>
      ${next ? `<p class="rider-next">${next}</p>` : ''}
    </div>
    <section class="section">
      <h2>Heats</h2>
      ${sum.heats.length ? `<ol class="rider-heats">${sum.heats.map((h) => heatRow(t, h)).join('')}</ol>` : '<p class="empty">No heats ridden yet.</p>'}
    </section>
    <footer class="note">Live: this page updates as the organiser records results.</footer>
  `;
}

export { renderRiderScreen };
