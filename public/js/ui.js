// Pure-ish rendering: builds HTML strings from app state. No state mutation here —
// app.js owns state and wires up event handling via data-action delegation.

import * as Bracket from './bracket.js';

// The logo: the whole sentence, name last. Square full stops are a logo-only detail.
// With animate, the amber underline under "rebattle" is drawn at reading pace (CSS only).
function brandLogo({ animate = false } = {}) {
  const stop = '<i class="brand-stop"></i>';
  return `<span class="brand${animate ? ' brand-animate' : ''}" aria-label="drop. bounceback. rebattle."><span class="brand-lead" aria-hidden="true">drop${stop} bounceback${stop}</span> <span class="brand-name" aria-hidden="true"><span class="brand-word">rebattle</span>${stop}</span></span>`;
}

// The short mark: Funnel Display's "r" (as an outline, so it never depends on the font
// loading) with the amber underline starting at the letter's left edge. Same as the icon.
const R_MARK = '<svg class="r-mark" viewBox="26 -617.2 474 861.2" aria-hidden="true"><g transform="scale(1 -1)"><path fill="currentColor" d="M118 0V436.0009765625H36.00048828125V600H203.99951171875V482.0001220703125H245.99951171875Q269.59954833984375 544.5999755859375 321.6995544433594 575.8999633789062Q373.799560546875 607.199951171875 439.399658203125 607.199951171875H489.9996337890625V463.200927734375H431.99969482421875Q353.99945068359375 463.200927734375 317.3992004394531 419.20074462890625Q280.7989501953125 375.2005615234375 280.7989501953125 303.2001953125V0Z"/><rect x="36" y="-234" width="454" height="144" style="fill:var(--accent)"/></g></svg>';

// Small logo to the right of a tournament's own title; doubles as the way back to
// the list. Phones get the short "r" mark so the competition name keeps the room.
function brandHome() {
  return `<button type="button" class="brand-home" data-action="go-home" title="Back to tournament list">${brandLogo()}${R_MARK}</button>`;
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function fmtDuration(totalSeconds) {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(h + 'h');
  if (h || m) parts.push(m + 'm');
  parts.push(sec + 's');
  return parts.join(' ');
}

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

// ---- Setup ---------------------------------------------------------------

function computeEstimateHtml(n, lapTimeSeconds, breakSeconds, heatFormat) {
  if (!n || n < 4) {
    return `<p class="empty">Enter at least 4 competitors to see bracket size and time estimate.</p>`;
  }
  const bracketSize = Bracket.nextPowerOfTwo(n);
  const byes = bracketSize - n;
  const est = Bracket.estimateDurationSeconds(n, lapTimeSeconds || 0, breakSeconds || 0);
  return `
    <div class="estimate">
      <div class="row"><span>Bracket size</span><span>${bracketSize} (${byes} bye${byes === 1 ? '' : 's'} in round 1)</span></div>
      <div class="row"><span>Total heats</span><span>${est.heats}</span></div>
      <div class="row"><span>Estimated time &mdash; single run</span><span>${fmtDuration(est.single)}</span></div>
      <div class="row"><span>Estimated time &mdash; best of 3</span><span>${fmtDuration(est.bo3Min)} &ndash; ${fmtDuration(est.bo3Max)}</span></div>
    </div>
  `;
}

function renderSetup(state) {
  const d = state.draft;
  return `
    <div class="topbar">
      <div class="title"><h1 class="brand-h1 small">${brandLogo()}</h1><small>Setup</small></div>
      <div class="toolbar"><button data-action="go-home">Back</button></div>
    </div>
    <div class="card">
      <h2>Tournament setup</h2>
      <div class="field">
        <label for="f-name">Tournament name</label>
        <input type="text" id="f-name" placeholder="e.g. Cable Park Open &mdash; Juniors" value="${escapeHtml(d.name || '')}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-count">Number of competitors</label>
          <input type="number" id="f-count" min="4" step="1" value="${d.competitorCount || ''}" />
        </div>
        <div class="field">
          <label for="f-lap">Lap time (seconds)</label>
          <input type="number" id="f-lap" min="1" step="1" value="${d.lapTimeSeconds || ''}" />
        </div>
        <div class="field">
          <label for="f-break">Break between heats (seconds, optional)</label>
          <input type="number" id="f-break" min="0" step="1" value="${d.breakSeconds || 0}" />
        </div>
      </div>

      <div id="estimate-holder">${computeEstimateHtml(d.competitorCount, d.lapTimeSeconds, d.breakSeconds, d.heatFormat)}</div>

      <div class="field" style="max-width:none; margin-top:18px;">
        <label>Heat format</label>
        <div class="format-options">
          <label class="format-option ${d.heatFormat === 'single' ? 'selected' : ''}">
            <input type="radio" name="heatFormat" value="single" ${d.heatFormat === 'single' ? 'checked' : ''} />
            <div class="label">Single run</div>
            <div class="sub">Fastest. One lap decides the heat.</div>
          </label>
          <label class="format-option ${d.heatFormat === 'bo3' ? 'selected' : ''}">
            <input type="radio" name="heatFormat" value="bo3" ${d.heatFormat === 'bo3' ? 'checked' : ''} />
            <div class="label">Best of 3</div>
            <div class="sub">First to 2 wins. Up to 3 laps per heat.</div>
          </label>
        </div>
      </div>

      <div style="margin-top:22px;">
        <button class="primary" data-action="setup-next">Next: enter competitors</button>
      </div>
    </div>
  `;
}

// ---- Names -----------------------------------------------------------

function renderNames(state) {
  const n = state.draft.competitorCount;
  const names = state.draft.names || Array.from({ length: n }, () => '');
  const inputs = names
    .map(
      (val, i) => `<input type="text" class="name-input" data-index="${i}" placeholder="Competitor ${i + 1}" value="${escapeHtml(val)}" />`
    )
    .join('');

  return `
    <div class="topbar">
      <div class="title"><h1>${escapeHtml(state.draft.name || 'New tournament')}</h1><small>Enter competitors</small></div>
      <div class="toolbar"><button data-action="go-setup-back">Back</button></div>
    </div>
    <div class="card">
      <h2>Competitor names (${n})</h2>
      <p>Names will be randomly drawn into the bracket, including random byes if ${n} isn't a power of two.</p>
      <div class="name-grid">${inputs}</div>
      <button class="primary" data-action="names-draw">Draw bracket</button>
      <span id="names-error" style="color:#e35b5b; margin-left:12px;"></span>
    </div>
  `;
}

// ---- Bracket / live view ------------------------------------------------

function slotHtml(tournament, match, slotKey) {
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
    !match.completed && !match.isBye && !match.placeholder && match.slotA.competitorId && match.slotB.competitorId
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
      ${(opts.swapSlots ? ['slotB', 'slotA'] : ['slotA', 'slotB']).map((k) => slotHtml(tournament, match, k)).join('')}
    </div>
  `;
}

function renderUpNext(tournament) {
  if (tournament.status === 'completed') return '';
  const playable = Bracket.getPlayableMatches(tournament);
  if (!playable.length) {
    return `<div class="up-next section"><h3>Up next</h3><p class="empty">Nothing ready to play right now &mdash; waiting on earlier heats.</p></div>`;
  }
  return `
    <div class="up-next section">
      <h3>Up next (${playable.length})</h3>
      <div class="up-next-grid">${playable.map((m) => matchCard(tournament, m, { showLabel: stageLabel(tournament, m) })).join('')}</div>
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

function slotOf(match, competitorId) {
  if (match.slotA.competitorId === competitorId) return 'slotA';
  if (match.slotB.competitorId === competitorId) return 'slotB';
  return null;
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

// Display layout of the Losers Bracket, shared by the bracket view and the
// replay so both show heats in the same top-to-bottom order.
//   levels[lvl] / final: [{ match, swap }] in display order
//   edges: traced winner lines between LB heats
function lbLayout(tournament) {
  const matches = tournament.lb.matches;

  // Group by level; the LB final (whatever its level) gets its own trailing
  // column, mirroring the Winners Bracket's "Final" column. A level
  // can exceed totalLevels when the field needs extra purely-internal
  // rounds to converge to the final 2 (larger brackets) — find the real max.
  const byLevel = {};
  const finalMatches = [];
  let maxLevel = tournament.lb.totalLevels;
  matches.forEach((m) => {
    if (m.isLbFinal) finalMatches.push(m);
    else {
      (byLevel[m.level] = byLevel[m.level] || []).push(m);
      if (m.level > maxLevel) maxLevel = m.level;
    }
  });

  // LB matches are created on demand, so there's no pre-wired structure to
  // draw from — trace each winner to the next LB match they appear in.
  const edges = [];
  matches.forEach((m) => {
    if (!m.completed || !m.winnerId || m.isLbFinal) return;
    let next = null;
    matches.forEach((n) => {
      if (n.level <= m.level || !slotOf(n, m.winnerId)) return;
      if (!next || n.level < next.level) next = n;
    });
    if (next) edges.push({ from: m.id, to: next.id, slot: slotOf(next, m.winnerId), kind: 'win', done: true });
  });

  // Pairings within a level are random, so in creation order the lines
  // criss-cross. Order each column by where its feeders sit in the previous
  // columns (barycenter), and show the fed slot on top. Matches fed only by
  // WB drop-ins have no incoming line and go to the bottom.
  const feedersOf = {};
  edges.forEach((e) => (feedersOf[e.to] = feedersOf[e.to] || []).push(e));
  const pos = {};
  const arrange = (list) => {
    const keyed = list.map((n, i) => {
      const ps = (feedersOf[n.id] || []).map((e) => pos[e.from]);
      return { n, i, key: ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Infinity };
    });
    keyed.sort((a, b) => a.key - b.key || a.i - b.i);
    return keyed.map(({ n }, i) => {
      pos[n.id] = i;
      const slotPos = (k) => {
        const e = (feedersOf[n.id] || []).find((f) => f.slot === k);
        return e ? pos[e.from] : Infinity;
      };
      return { match: n, swap: slotPos('slotB') < slotPos('slotA') };
    });
  };

  const levels = {};
  for (let lvl = 1; lvl <= maxLevel; lvl += 1) levels[lvl] = arrange(byLevel[lvl] || []);
  return { maxLevel, levels, final: arrange(finalMatches), edges };
}

// Losers-bracket rounds are paired by random draw; the round title says so with a shuffle icon.
const DRAW_ICON =
  '<span class="draw-icon" title="Pairings are a random draw" aria-label="random draw"><svg viewBox="0 0 16 16" aria-hidden="true">' +
  '<path d="M1.5 4.5h2.5c3 0 4.5 7 7.5 7h1.5M1.5 11.5h2.5c3 0 4.5-7 7.5-7h1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
  '<path d="M12.5 2.2l3 2.3-3 2.3zM12.5 9.2l3 2.3-3 2.3z" fill="currentColor"/></svg></span>';

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

function renderStandings(tournament) {
  if (tournament.status !== 'completed') return '';
  const medals = ['🥇', '🥈', '🥉'];
  return `
    <div class="section">
      <h2>Final standings</h2>
      <ol class="standings">
        ${Bracket.getPlacings(tournament)
          .map(
            ({ id, place }, i, all) => {
              // A shared place is numbered once, on the first rider of the group.
              const first = i === 0 || all[i - 1].place !== place;
              return `<li class="${i === 0 ? 'top1' : ''}" data-cid="${id}"><span class="rank">${
                first ? medals[place - 1] || place + '.' : ''
              }</span><span class="standing-name">${escapeHtml(
                Bracket.getName(tournament, id)
              )}</span><button class="small journey-btn" data-action="open-journey" data-cid="${id}">Share journey</button></li>`;
            }
          )
          .join('')}
      </ol>
    </div>
  `;
}

function renderRenamePanel(state) {
  if (!state.nameDraft) return '';
  const t = state.tournament;
  const inputs = t.competitors
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (c) =>
        `<input type="text" class="rename-input" data-cid="${c.id}" value="${escapeHtml(state.nameDraft[c.id])}" aria-label="Name for ${escapeHtml(c.name)}" />`
    )
    .join('');
  return `
    <div class="card section">
      <h2>Edit names</h2>
      <p style="margin-top:0;">Fix typos at any point &mdash; results and bracket positions stay the same.</p>
      <div class="field">
        <label for="rename-title">Tournament name</label>
        <input type="text" id="rename-title" class="rename-title" value="${escapeHtml(state.titleDraft)}" />
      </div>
      <label>Competitors</label>
      <div class="name-grid">${inputs}</div>
      <button class="primary" data-action="save-names">Save changes</button>
      <button data-action="cancel-names">Cancel</button>
      <span id="rename-error" style="color:#e35b5b; margin-left:12px;"></span>
    </div>
  `;
}

// What the marks on the bracket mean. Samples reuse the real classes so they always
// look exactly like the bracket; items that only exist on one layout are tagged.
function renderLegend() {
  const item = (sample, label, only) =>
    `<div class="key-item${only ? ' only-' + only : ''}"><span class="key-sample">${sample}</span><span>${label}</span></div>`;
  return `
    <section class="section key">
      <h2>Legend</h2>
      <div class="key-grid">
        ${item(DRAW_ICON, 'Random draw &mdash; Losers bracket pairings are drawn fresh each round')}
        ${item('<span class="bye-tag">BYE</span>', 'Bye &mdash; no opponent, the rider goes straight through')}
        ${item('<span class="key-card ready"></span>', 'Ready to ride &mdash; pick the winner')}
        ${item('<span class="drop-tag">&darr; to LB R2</span>', 'Lost in the Winners bracket &mdash; second chance in the Losers bracket')}
        ${item('<span class="drop-tag">from WB R2</span>', 'Came down from the Winners bracket')}
        ${item('<span class="drop-tag semi-tag">&rarr; Semifinal 1</span>', 'Where each bracket&rsquo;s top two go in the Final 4')}
        ${item('<span class="drop-tag next-tag">&rarr; R3</span>', 'Where the winner rides next', 'phone')}
        ${item('<span class="result-icon eliminated">&#x2715;</span>', 'Out &mdash; lost twice')}
        ${item('<span class="result-icon medal">🥇🥈🥉</span>', 'Final places')}
        ${item('<span class="key-line"></span>', 'Winner&rsquo;s path', 'desktop')}
        ${item('<span class="key-line lose"></span>', 'Loser&rsquo;s path (to the Losers bracket or Small final)', 'desktop')}
        ${item('<span class="key-hover">Name</span>', 'Hover a rider to highlight their whole path', 'desktop')}
      </div>
    </section>
  `;
}

function renderBracketScreen(state) {
  const t = state.tournament;
  return `
    <div class="topbar event-top">
      <div class="title"><h1>${escapeHtml(t.name)}</h1><small>${t.competitors.length} competitors &middot; ${
    t.settings.heatFormat === 'bo3' ? 'best of 3' : 'single run'
  } &middot; ${t.status === 'completed' ? 'completed' : 'in progress'}</small></div>
      ${brandHome()}
    </div>
      <div class="toolbar event-toolbar">
        <button data-action="undo" ${state.undoStack.length ? '' : 'disabled'}>Undo</button>
        ${t.status === 'completed' ? '<button class="primary" data-action="open-replay">Share replay</button>' : ''}
        <button class="more-toggle" aria-label="More actions" data-action="toggle-more">&middot;&middot;&middot;</button>
        <div class="toolbar-more">
          <button data-action="edit-names" ${state.nameDraft ? 'disabled' : ''}>Edit names</button>
          <button data-action="export">Export JSON</button>
          <label class="file-input-label btn">Import JSON<input type="file" accept="application/json" data-action="import-file" /></label>
          <button data-action="go-home">Tournament list</button>
          <button class="danger" data-action="new-tournament">New tournament</button>
        </div>
      </div>
    ${
      state.externalUpdateAvailable
        ? `<div class="card" style="border-color: var(--accent-2); margin-bottom:20px;">
            <strong>This tournament was just updated in another tab/window.</strong>
            <p style="margin:6px 0 10px;">Your view here is out of date. Reload it before recording anything else, or you risk overwriting what was saved there.</p>
            <button class="primary" data-action="reload-external-update">Reload latest version</button>
          </div>`
        : ''
    }
    ${renderRenamePanel(state)}
    ${
      t.status === 'completed'
        ? `<div class="results-row">${renderStandings(t)}${renderFinal4(t)}</div>` // side by side on desktop
        : renderUpNext(t) + renderFinal4(t)
    }
    ${renderWinnersBracket(t)}
    ${renderLosersBracket(t)}
    ${renderLegend()}
    <footer class="note">Auto-saved locally in this browser. Use Export to back up or move to another device.</footer>
  `;
}

// ---- connector lines -------------------------------------------------------

// Shared column width for all brackets on desktop: sized so the bracket
// with the most rounds fills the width (230-360px per column). On phones
// (one round at a time) the property is removed.
const COL_GAP = 56;
function syncColumns(root) {
  const graphs = [...root.querySelectorAll('.bracket-graph:not(.final4-graph)')];
  if (!graphs.length || window.matchMedia('(max-width: 700px)').matches) {
    root.style.removeProperty('--col-w');
    return;
  }
  const n = Math.max(...graphs.map((g) => g.querySelectorAll('.bracket-column').length));
  const width = graphs[0].clientWidth;
  const w = Math.max(230, Math.min(360, (width - COL_GAP * (n - 1)) / n));
  root.style.setProperty('--col-w', Math.floor(w) + 'px');
}

function drawConnectors(root) {
  syncColumns(root);
  root.querySelectorAll('.bracket-graph').forEach((graph) => {
    const svg = graph.querySelector('svg.bracket-lines');
    let edges = [];
    try {
      edges = JSON.parse(graph.dataset.edges || '[]');
    } catch (e) {
      edges = [];
    }
    // Collapse first so a stale, wider SVG doesn't inflate scrollWidth.
    svg.setAttribute('width', 0);
    svg.setAttribute('height', 0);
    const g = graph.getBoundingClientRect();
    const ox = graph.scrollLeft - g.left;
    const oy = graph.scrollTop - g.top;
    svg.setAttribute('width', graph.scrollWidth);
    svg.setAttribute('height', graph.scrollHeight);

    const lines = edges
      .map((e) => {
        const from = graph.querySelector(`[data-match-id="${e.from}"]`);
        const to = graph.querySelector(`[data-match-id="${e.to}"]`);
        if (!from || !to) return '';
        const fromSlot = e.done ? from.querySelector(e.kind === 'lose' ? '.slot.loser' : '.slot.winner') : null;
        const toSlot = e.slot ? to.querySelector(`.slot[data-slot="${e.slot}"]`) : null;
        const fr = from.getBoundingClientRect();
        const tr = to.getBoundingClientRect();
        const fy = (fromSlot || from).getBoundingClientRect();
        const ty = (toSlot || to).getBoundingClientRect();
        const x1 = fr.right + ox;
        const y1 = fy.top + fy.height / 2 + oy;
        const x2 = tr.left + ox;
        const y2 = ty.top + ty.height / 2 + oy;
        // Winner and loser lines bend at different x so their verticals don't overlap.
        return { from: e.from, to: e.to, slot: e.slot, x1, y1, x2, y2, bend: e.bend != null ? e.bend : e.kind === 'lose' ? 0.65 : 0.4, cls: ['edge', e.kind, e.done ? 'done' : ''].join(' ') };
      })
      .filter(Boolean);

    if (graph.dataset.stagger) {
      const gaps = {};
      lines.forEach((l) => (gaps[Math.round(l.x1)] = gaps[Math.round(l.x1)] || []).push(l));
      Object.values(gaps).forEach((group) => {
        group.sort((a, b) => a.y1 - b.y1);
        group.forEach((l, i) => (l.bend = group.length > 1 ? 0.2 + (0.6 * i) / (group.length - 1) : 0.5));
      });
    }

    lines.forEach((l) => (l.mx = l.x1 + (l.x2 - l.x1) * l.bend));

    // Line hops: wherever a horizontal run crosses another line's vertical,
    // it bumps over it, so a crossing never looks like a junction.
    const HOP = 5;
    const hopsOn = (self, y, xa, xb) =>
      lines
        .filter((o) => o !== self)
        .filter((o) => {
          const lo = Math.min(o.y1, o.y2);
          const hi = Math.max(o.y1, o.y2);
          return o.mx > xa + HOP && o.mx < xb - HOP && y > lo + 1 && y < hi - 1;
        })
        .map((o) => o.mx)
        .sort((a, b) => a - b)
        .filter((x, i, xs) => i === 0 || x - xs[i - 1] > 2 * HOP + 2);
    const run = (self, y, xa, xb) =>
      hopsOn(self, y, xa, xb)
        .map((x) => ` H${x - HOP} A${HOP} ${HOP} 0 0 1 ${x + HOP} ${y}`)
        .join('') + ` H${xb}`;

    svg.innerHTML = lines
      .map((l) => {
        const d = `M${l.x1} ${l.y1}${run(l, l.y1, l.x1, l.mx)} V${l.y2}${run(l, l.y2, l.mx, l.x2)}`;
        return `<path class="${l.cls}" d="${d}" data-from="${l.from}" data-to="${l.to}" data-slot="${l.slot || ''}" />`;
      })
      .join('');
  });
}

// ---- path tracing ----------------------------------------------------------
//
// Hovering a competitor highlights every heat they're in and every line
// they travelled along. An edge belongs to their path when they appear in
// its source heat and sit in the exact slot it feeds in the target heat.

function tracePath(root, cid) {
  root.classList.toggle('tracing', !!cid);
  root.querySelectorAll('.path-hl').forEach((el) => el.classList.remove('path-hl'));
  root.querySelectorAll('.path-card').forEach((el) => el.classList.remove('path-card'));
  root.querySelectorAll('path.edge.path').forEach((el) => el.classList.remove('path'));
  if (!cid) return;

  const sel = `[data-cid="${cid}"]`;
  root.querySelectorAll(sel).forEach((el) => {
    el.classList.add('path-hl');
    const card = el.closest('.match-card');
    if (card) card.classList.add('path-card');
  });
  root.querySelectorAll('.bracket-graph').forEach((graph) => {
    graph.querySelectorAll('path.edge').forEach((p) => {
      const from = graph.querySelector(`[data-match-id="${p.dataset.from}"]`);
      const to = graph.querySelector(`[data-match-id="${p.dataset.to}"]`);
      const target = to && p.dataset.slot ? to.querySelector(`.slot[data-slot="${p.dataset.slot}"]`) : null;
      if (from && from.querySelector(sel) && target && target.dataset.cid === cid) {
        p.classList.add('path');
        p.parentNode.appendChild(p); // draw on top of the dimmed lines
      }
    });
  });
}

// Module-level so the highlight is re-applied after a re-render (e.g. after
// clicking "Won" while the pointer is still over someone).
let traceCid = null;
let tabsBound = false;
function bindTabs(container) {
  if (tabsBound) return;
  tabsBound = true;
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab-graph]');
    if (!btn) return;
    const key = btn.dataset.tabGraph;
    const i = Number(btn.dataset.tab);
    tabState[key] = i;
    const bar = btn.parentElement;
    bar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    bar.nextElementSibling.querySelectorAll('.bracket-column').forEach((c) => c.classList.toggle('active', Number(c.dataset.col) === i));
  });
}

let traceBound = false;
function bindTracing(container) {
  if (traceBound) return;
  traceBound = true;
  const update = (cid) => {
    if (cid === traceCid) return;
    traceCid = cid;
    tracePath(container, cid);
  };
  container.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-cid]');
    update(el ? el.dataset.cid : null);
  });
  container.addEventListener('mouseleave', () => update(null));
}

let lastContainer = null;
let resizeQueued = false;
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    if (resizeQueued || !lastContainer) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      drawConnectors(lastContainer);
      if (traceCid) tracePath(lastContainer, traceCid);
    });
  });
}

// ---- replay ----------------------------------------------------------------
// The canvas and its controls are driven by Replay (replay.js), mounted by
// app.js after this HTML is in the DOM.

function renderReplayScreen(state) {
  const t = state.tournament;
  return `
    <div class="topbar event-top">
      <div class="title"><h1>${escapeHtml(t.name)}</h1><small data-replay="subtitle">Replay</small></div>
      ${brandHome()}
    </div>
    <div class="toolbar event-toolbar align-end"><button data-action="close-replay">Back to bracket</button></div>
    <div class="replay">
      <div class="replay-stage">
        <canvas id="replay-canvas" width="1080" height="1920"></canvas>
        <div class="replay-tip" data-replay="tip" hidden></div>
      </div>
      <div class="replay-controls">
        <div class="replay-row">
          <button data-replay="play">Pause</button>
          <button data-replay="restart">Restart</button>
          <input type="range" min="0" step="10" value="0" data-replay="scrub" aria-label="Replay position" />
          <span class="replay-time" data-replay="time"></span>
        </div>
        <div class="replay-row">
          <label for="replay-focus" style="margin:0;">Show</label>
          <select id="replay-focus" data-replay="focus">
            <option value="">Whole competition</option>
            ${Bracket.getPlacings(t)
              .map(({ id, place }) => `<option value="${id}">${escapeHtml(Bracket.getName(t, id))} &mdash; ${place}.</option>`)
              .join('')}
          </select>
        </div>
        <div class="replay-row">
          <button class="primary" data-replay="export">Download video</button>
          <button data-replay="share" hidden>Share&hellip;</button>
        </div>
        <p class="replay-status" data-replay="status">Vertical 1080&times;1920 &mdash; ready for Stories, Reels and TikTok.</p>
      </div>
    </div>
  `;
}

// ---- top-level dispatch --------------------------------------------------

function render(container, state) {
  lastContainer = container;
  bindTracing(container);
  bindTabs(container);
  container.classList.toggle('wide', state.screen === 'bracket');
  if (state.screen === 'home') container.innerHTML = renderHome(state);
  else if (state.screen === 'setup') container.innerHTML = renderSetup(state);
  else if (state.screen === 'names') container.innerHTML = renderNames(state);
  else if (state.screen === 'replay') container.innerHTML = renderReplayScreen(state);
  else if (state.screen === 'bracket') {
    container.innerHTML = renderBracketScreen(state);
    drawConnectors(container);
    if (traceCid) tracePath(container, traceCid);
    // Redraw once web fonts settle, since they can shift card positions.
    if (document.fonts && document.fonts.ready)
      document.fonts.ready.then(() => {
        drawConnectors(container);
        if (traceCid) tracePath(container, traceCid);
      });
  }
}

export { render, escapeHtml, brandLogo, computeEstimateHtml, fmtDuration, lbLayout };
