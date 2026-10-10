// Match cards: slots, result icons, drop and next tags, stage labels, "Up next".

import * as Bracket from '../engine/bracket.js';
import { slotOf } from '../engine/lb-layout.js';
import { escapeHtml } from './html.js';

// ---- Bracket / live view ------------------------------------------------

function slotHtml(tournament, match, slotKey, readOnly) {
  const slot = match[slotKey];
  if (!slot.competitorId) {
    if (slot.isBye) {
      return `<div class="slot bye-slot" data-slot="${slotKey}"><span class="name">no opponent &mdash; advances</span></div>`;
    }
    return `<div class="slot" data-slot="${slotKey}"><span class="name tbd">${escapeHtml(slot.placeholder || 'TBD')}</span></div>`;
  }
  const name = escapeHtml(Bracket.getName(tournament, slot.competitorId));
  const isWinner = match.completed && match.winnerId === slot.competitorId;
  const isLoser = match.completed && match.loserId === slot.competitorId;
  const scoreCount = match.races.filter((r) => r.winnerId === slot.competitorId).length;
  const scoreHtml = match.racesNeededToWin > 1 && !match.isBye ? `<span class="score">${scoreCount}</span>` : '';
  const btn =
    !readOnly && !match.completed && !match.isBye && !match.placeholder && match.slotA.competitorId && match.slotB.competitorId
      ? `<button class="small" data-action="record-winner" data-match="${match.id}" data-winner="${slot.competitorId}">Won</button>`
      : '';
  return `<div class="slot ${isWinner ? 'winner' : ''} ${isLoser ? 'loser' : ''}" data-slot="${slotKey}" data-cid="${slot.competitorId}">
    <span class="name">${name}${resultIcon(match, isWinner, isLoser)}</span>${dropTag(tournament, match, slot.competitorId, isLoser)}${scoreHtml}${btn}
  </div>`;
}

// Final outcome of a heat for this competitor, read from where the engine
// sends them: out of the competition, or onto the podium.
const PLACES = { rank1: ['🥇', '1st place'], rank2: ['🥈', '2nd place'], rank3: ['🥉', '3rd place'] };
function resultIcon(match, isWinner, isLoser) {
  const d = isWinner ? match.onWinnerAdvanceTo : isLoser ? match.onLoserAdvanceTo : null;
  if (!match.completed || !d) return '';
  if (d.type === 'eliminated') return `<span class="result-icon eliminated" title="Eliminated">&#x2715;</span>`;
  const place = PLACES[d.type];
  return place ? `<span class="result-icon medal" title="${place[1]}">${place[0]}</span>` : '';
}

// Marks the WB -> LB hand-off on both ends: the WB loser who drops, and the
// LB slot they land in (LB level L is fed by WB round L).
// Semifinal pairing: WB 1st vs LB 2nd, WB 2nd vs LB 1st.
const SEMI_ORIGIN = { semi1: ['WB 1st', 'LB 2nd'], semi2: ['WB 2nd', 'LB 1st'] }; // same wording as the replay

function dropTag(tournament, match, competitorId, isLoser) {
  const isWinner = match.completed && match.winnerId === competitorId;
  const toSemi = (n) => `<span class="drop-tag semi-tag">&rarr; Semifinal ${n}</span>`;
  if (match.stage === 'WB' && match.round === tournament.bracketRounds && match.completed) {
    return isWinner ? toSemi(1) : isLoser ? toSemi(2) : '';
  }
  if (match.isLbFinal && match.completed) {
    return isWinner ? toSemi(2) : isLoser ? toSemi(1) : '';
  }
  if (match.stage === 'SF') {
    const semi = tournament.final4.semi1 && tournament.final4.semi1.id === match.id ? 'semi1' : 'semi2';
    const origin = SEMI_ORIGIN[semi][match.slotA.competitorId === competitorId ? 0 : 1];
    return `<span class="drop-tag semi-tag">${origin}</span>`;
  }
  if (match.stage === 'WB') {
    const d = match.onLoserAdvanceTo;
    if (isLoser && d && d.type === 'lbEntrant') return `<span class="drop-tag">&darr; to LB R${d.level}</span>`;
    const w = match.onWinnerAdvanceTo;
    if (isWinner && w && w.type === 'slot') {
      const next = Bracket.findMatch(tournament, w.matchId);
      return nextTag(next.round === tournament.bracketRounds ? 'WB Final' : 'R' + next.round);
    }
    return '';
  }
  if (match.stage === 'LB') {
    const ls = tournament.lb.levels[match.level];
    const from = ls && ls.wbDropouts.includes(competitorId) ? `<span class="drop-tag">from WB R${match.level}</span>` : '';
    if (!isWinner) return from;
    let next = null;
    tournament.lb.matches.forEach((n) => {
      if (n.level > match.level && slotOf(n, competitorId) && (!next || n.level < next.level)) next = n;
    });
    return from + nextTag(next && next.isLbFinal ? 'LB Final' : 'R' + (next ? next.level : match.level + 1));
  }
  return '';
}

// Where a winner goes next. Only shown on phones (CSS), where the bracket is
// one round at a time and the connector lines are hidden.
function nextTag(label) {
  return `<span class="drop-tag next-tag">&rarr; ${label}</span>`;
}

function pendingPoolCard(tournament, entry) {
  const name = escapeHtml(Bracket.getName(tournament, entry.competitorId));
  return `
    <div class="match-card pending">
      <div class="slot" data-cid="${entry.competitorId}"><span class="name">${name}</span><span class="drop-tag">from WB R${entry.level}</span></div>
      <div class="slot"><span class="name tbd">Waiting for this round to open&hellip;</span></div>
    </div>
  `;
}

function isWbFinal(tournament, match) {
  return match.stage === 'WB' && match.round === tournament.bracketRounds;
}

function matchCard(tournament, match, opts) {
  opts = opts || {};
  const wbFinal = isWbFinal(tournament, match);
  const classes = ['match-card'];
  if (match.isBye) classes.push('bye');
  if (match.isLbFinal || wbFinal) classes.push('final-marker');
  if (match.placeholder) classes.push('placeholder');
  if (match.completed) classes.push('completed');
  else if (!match.placeholder && match.slotA.competitorId && match.slotB.competitorId) classes.push('ready');

  let title = '';
  if (opts.showLabel) title = `<div class="round-title">${opts.showLabel}</div>`;
  const byeTag = match.isBye ? '<span class="bye-tag">BYE</span>' : '';
  const finalTag = match.isLbFinal
    ? '<span class="final-tag">LB FINAL</span>'
    : wbFinal
    ? '<span class="final-tag">WB FINAL</span>'
    : '';

  return `
    <div class="${classes.join(' ')}" data-match-id="${match.id}">
      ${title}
      ${byeTag}${finalTag}
      ${(opts.swapSlots ? ['slotB', 'slotA'] : ['slotA', 'slotB']).map((k) => slotHtml(tournament, match, k, opts.readOnly)).join('')}
    </div>
  `;
}

function renderUpNext(tournament, readOnly) {
  if (tournament.status === 'completed') return '';
  const playable = Bracket.getPlayableMatches(tournament);
  if (!playable.length) {
    return `<div class="up-next section"><h3>Up next</h3><p class="empty">Nothing ready to play right now &mdash; waiting on earlier heats.</p></div>`;
  }
  return `
    <div class="up-next section">
      <h3>Up next (${playable.length})</h3>
      <div class="up-next-grid">${playable.map((m) => matchCard(tournament, m, { showLabel: stageLabel(tournament, m), readOnly })).join('')}</div>
    </div>
  `;
}

function stageLabel(tournament, match) {
  if (match.stage === 'WB') return isWbFinal(tournament, match) ? 'Winners · Final' : 'Winners · Round ' + match.round;
  if (match.stage === 'LB') return match.isLbFinal ? 'Losers · Final' : 'Losers · Round ' + match.level;
  if (match.stage === 'SF') return 'Final 4 · Semifinal';
  if (match.stage === 'SMALL_FINAL') return 'Small Final (3rd place)';
  if (match.stage === 'GRAND_FINAL') return 'Grand Final (1st place)';
  return match.stage;
}

export { pendingPoolCard, matchCard, renderUpNext };
