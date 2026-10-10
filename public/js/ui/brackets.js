// The bracket graphs: Winners, Losers and Final 4 columns, with phone tabs.

import * as Bracket from '../engine/bracket.js';
import { lbLayout } from '../engine/lb-layout.js';
import { matchCard, pendingPoolCard } from './cards.js';
import { DRAW_ICON, escapeHtml } from './html.js';

// ---- bracket graph -------------------------------------------------------
//
// A graph is a row of columns plus a list of edges ({from, to, slot, kind,
// done}) between match cards. The edges are serialized onto the wrapper and
// drawn as an SVG overlay after the HTML is in the DOM (see drawConnectors),
// since line positions depend on the laid-out card positions.

// opts.stagger: bend each line at its own x, for graphs where lines can
// cross (the traced Losers Bracket) and would otherwise merge into one bus.
// Remembered tab per bracket ('wb' / 'lb') on phones, where a bracket shows
// one round at a time. Defaults to the round currently being played.
const tabState = {};

function graphHtml(columns, edges, opts) {
  opts = opts || {};
  const tabsKey = opts.tabsKey;
  let active = -1;
  if (tabsKey) {
    active = tabState[tabsKey] != null && tabState[tabsKey] < columns.length ? tabState[tabsKey] : opts.defaultTab || 0;
  }
  const tabs = tabsKey
    ? `<div class="round-tabs">${columns
        .map((col, i) => `<button class="small ${i === active ? 'active' : ''}" data-tab-graph="${tabsKey}" data-tab="${i}">${col.title}</button>`)
        .join('')}</div>`
    : '';
  const cols = columns
    .map(
      (col, i) => `
      <div class="bracket-column ${i === active ? 'active' : ''}" data-col="${i}">
        <div class="round-title">${col.title}</div>
        <div class="round-matches">
          ${
            col.cards.length
              ? col.cards
                  .map((c) => (typeof c === 'string' ? { html: c, grow: 1 } : c))
                  .map((c) => `<div class="match-cell" style="flex-grow:${c.grow}">${c.html}</div>`)
                  .join('')
              : `<div class="match-cell"><p class="empty" style="padding:0;margin:0;">${col.empty}</p></div>`
          }
        </div>
      </div>`
    )
    .join('');
  return `
    ${tabs}
    <div class="bracket-graph ${opts.className || ''} ${tabsKey ? 'has-tabs' : ''}" ${opts.stagger ? 'data-stagger="1"' : ''} data-edges="${escapeHtml(JSON.stringify(edges))}">
      <svg class="bracket-lines" aria-hidden="true"></svg>
      <div class="bracket-columns">${cols}</div>
    </div>
  `;
}

// First round that still has something to play (or is waiting to open),
// otherwise the last round.
function currentTab(columns, matchesPerColumn) {
  const i = matchesPerColumn.findIndex((ms, idx) => ms.some((m) => !m.completed) || (!ms.length && columns[idx].cards.length));
  return i >= 0 ? i : columns.length - 1;
}

function renderWinnersBracket(tournament) {
  const rounds = {};
  const edges = [];
  tournament.wb.matches.forEach((m) => {
    (rounds[m.round] = rounds[m.round] || []).push(m);
    const d = m.onWinnerAdvanceTo;
    if (d && d.type === 'slot') edges.push({ from: m.id, to: d.matchId, slot: d.slot, kind: 'win', done: m.completed });
  });
  const roundNums = Object.keys(rounds).map(Number).sort((a, b) => a - b);
  const columns = roundNums.map((r) => ({
    title: r === tournament.bracketRounds ? 'Final' : 'Round ' + r,
    cards: rounds[r].map((m) => matchCard(tournament, m)),
  }));
  return `
    <div class="section">
      <h2>Winners Bracket</h2>
      ${graphHtml(columns, edges, { tabsKey: 'wb', defaultTab: currentTab(columns, roundNums.map((r) => rounds[r])) })}
    </div>
  `;
}

function renderLosersBracket(tournament) {
  const layout = lbLayout(tournament);
  const card = ({ match, swap }) => matchCard(tournament, match, { swapSlots: swap });

  // A level that hasn't opened yet (still waiting on its WB round and/or the
  // previous LB level) shows the competitors already queued for it, so they
  // don't just disappear until the whole round is ready to pair up.
  const columns = [];
  for (let lvl = 1; lvl <= layout.maxLevel; lvl += 1) {
    const ls = tournament.lb.levels[lvl];
    const pendingCards = ls && !ls.opened ? ls.wbDropouts.map((id) => pendingPoolCard(tournament, { competitorId: id, level: lvl })) : [];
    columns.push({
      title: 'Round ' + lvl + DRAW_ICON,
      cards: layout.levels[lvl].map(card).concat(pendingCards),
      empty: 'No heats yet',
    });
  }
  columns.push({ title: 'Final', cards: layout.final.map(card), empty: 'Not reached yet' });

  const gateNote = !Bracket.isLbGateOpen(tournament)
    ? `<p class="empty" style="margin-top:-4px;">Opens once Winners Bracket Rounds 1 and 2 are both complete &mdash; competitors below are queued and waiting.</p>`
    : '';

  return `
    <div class="section">
      <h2>Losers Bracket</h2>
      ${gateNote}
      ${graphHtml(columns, layout.edges, {
        stagger: true,
        tabsKey: 'lb',
        defaultTab: currentTab(columns, columns.map((c, i) => (i < layout.maxLevel ? layout.levels[i + 1].map((x) => x.match) : layout.final.map((x) => x.match)))),
      })}
    </div>
  `;
}

// Before Final 4 exists, show its shape with placeholder slots (filled with
// names as soon as each bracket's top two are known) so the path is visible.
function placeholderMatch(id, stage, a, b) {
  const slot = (s) => ({ competitorId: s.id || null, isBye: false, placeholder: s.label });
  return { id, stage, placeholder: true, slotA: slot(a), slotB: slot(b), races: [], racesNeededToWin: 1, completed: false, isBye: false };
}

function renderFinal4(tournament) {
  const { wb, lb } = tournament;
  const f4 = tournament.final4.semi1
    ? tournament.final4
    : {
        semi1: placeholderMatch('ph_sf1', 'SF', { id: wb.champion, label: 'WB 1st' }, { id: lb.runnerUp, label: 'LB 2nd' }),
        semi2: placeholderMatch('ph_sf2', 'SF', { id: wb.runnerUp, label: 'WB 2nd' }, { id: lb.champion, label: 'LB 1st' }),
        grandFinal: placeholderMatch('ph_gf', 'GRAND_FINAL', { label: 'Winner SF 1' }, { label: 'Winner SF 2' }),
        smallFinal: placeholderMatch('ph_small', 'SMALL_FINAL', { label: 'Loser SF 1' }, { label: 'Loser SF 2' }),
      };

  // Bends are chosen so the two dashed loser lines never cross each other,
  // and winner lines run straight across before turning into the Grand Final.
  const edges = [];
  [
    [f4.semi1, 'slotA', 0.65],
    [f4.semi2, 'slotB', 0.35],
  ].forEach(([semi, slot, loseBend]) => {
    edges.push({ from: semi.id, to: f4.grandFinal.id, slot, kind: 'win', done: semi.completed, bend: 0.9 });
    edges.push({ from: semi.id, to: f4.smallFinal.id, slot, kind: 'lose', done: semi.completed, bend: loseBend });
  });

  // Three rows: SF1, SF2, and a lower row for the Small Final; the Grand
  // Final spans the first two rows so it sits centred between the semis.
  const empty = (grow) => ({ html: '', grow });
  const columns = [
    {
      title: 'Semifinals',
      cards: [
        matchCard(tournament, f4.semi1, { showLabel: 'Semifinal 1' }),
        matchCard(tournament, f4.semi2, { showLabel: 'Semifinal 2' }),
        empty(1),
      ],
    },
    {
      title: 'Small final',
      cards: [empty(2), { html: matchCard(tournament, f4.smallFinal, { showLabel: 'Small Final · 3rd place' }), grow: 1 }],
    },
    {
      title: 'Final',
      cards: [{ html: matchCard(tournament, f4.grandFinal, { showLabel: 'Grand Final · 1st place' }), grow: 2 }, empty(1)],
    },
  ];

  return `
    <div class="section">
      <h2>Final 4</h2>
      ${
        tournament.final4.semi1
          ? ''
          : `<p class="empty" style="margin-top:-4px;">Waiting for both brackets to finish (top two of the Winners and Losers brackets).</p>`
      }
      <p class="legend"><span class="legend-win"></span> winner advances <span class="legend-lose"></span> loser drops to small final</p>
      ${graphHtml(columns, edges, {
        className: 'final4-graph',
        tabsKey: 'f4',
        defaultTab: currentTab(columns, [[f4.semi1, f4.semi2], [f4.smallFinal], [f4.grandFinal]]),
      })}
    </div>
  `;
}

export { renderWinnersBracket, renderLosersBracket, renderFinal4, tabState };
