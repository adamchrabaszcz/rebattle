// rebattle bracket engine — pure logic, no DOM access.
//
// Design notes:
// - Winners Bracket (WB) shape is fully determined by bracketSize and is pre-built
//   with TBD slots that fill in as earlier matches complete.
// - Losers Bracket (LB) is NOT pre-built. Matches are created on demand, the instant
//   two eligible competitors are available (a "pool" of size 0 or 1 at rest). This
//   avoids having to special-case the classic LB diagram shape under byes, and still
//   produces exactly N-3 LB matches in total regardless of play order (a pure
//   counting argument: N-2 entrants ever enter LB, each non-final LB match removes
//   exactly one via elimination, the final LB match removes none).
// - Every match carries onWinnerAdvanceTo / onLoserAdvanceTo descriptors that drive
//   fully automatic advancement (and automatic dropping into LB) once a result is
//   recorded — no manual bracket editing is ever required.

let idCounter = 0;
function uid(prefix) {
  idCounter += 1;
  return prefix + '_' + Date.now().toString(36) + '_' + idCounter.toString(36);
}

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function log2(n) {
  return Math.round(Math.log2(n));
}

// ---- time estimate (setup screen) -------------------------------------

function estimateHeatsCount(n) {
  if (n < 4) return null;
  return 2 * n; // WB:(n-1) + LB:(n-3) + Final4: 4, independent of byes
}

function estimateDurationSeconds(n, lapTimeSeconds, breakSeconds) {
  const heats = estimateHeatsCount(n);
  if (heats === null) return null;
  const brk = breakSeconds || 0;
  return {
    heats,
    single: heats * (lapTimeSeconds + brk),
    bo3Min: heats * (2 * lapTimeSeconds + brk),
    bo3Max: heats * (3 * lapTimeSeconds + brk),
  };
}

// ---- match helpers ------------------------------------------------------

function newMatch(stage, round, extra) {
  return Object.assign(
    {
      id: uid(stage.toLowerCase()),
      stage, // 'WB' | 'LB' | 'SF' | 'SMALL_FINAL' | 'GRAND_FINAL'
      round: round || null,
      slotA: { competitorId: null, isBye: false },
      slotB: { competitorId: null, isBye: false },
      isBye: false,
      racesNeededToWin: 1,
      races: [],
      winnerId: null,
      loserId: null,
      completed: false,
      onWinnerAdvanceTo: null,
      onLoserAdvanceTo: null,
    },
    extra || {}
  );
}

function findMatch(tournament, matchId) {
  return (
    tournament.wb.matches.find((m) => m.id === matchId) ||
    tournament.lb.matches.find((m) => m.id === matchId) ||
    [tournament.final4.semi1, tournament.final4.semi2, tournament.final4.smallFinal, tournament.final4.grandFinal].find(
      (m) => m && m.id === matchId
    )
  );
}

// ---- tournament creation --------------------------------------------

function createTournament({ name, competitorNames, settings }) {
  const names = competitorNames.map((n) => n.trim()).filter(Boolean);
  if (names.length < 4) {
    throw new Error('At least 4 competitors are required.');
  }

  const competitors = names.map((n) => ({ id: uid('c'), name: n }));
  const racesNeededToWin = settings.heatFormat === 'bo3' ? 2 : 1;

  const bracketSize = nextPowerOfTwo(competitors.length);
  const k = log2(bracketSize);
  const byesCount = bracketSize - competitors.length;

  const shuffled = shuffle(competitors.map((c) => c.id));
  const byeIds = shuffled.slice(0, byesCount);
  const remaining = shuffled.slice(byesCount);

  const tournament = {
    id: uid('t'),
    name: name || 'Tournament',
    createdAt: Date.now(),
    status: 'in_progress',
    settings: {
      lapTimeSeconds: settings.lapTimeSeconds,
      breakSeconds: settings.breakSeconds || 0,
      heatFormat: settings.heatFormat === 'bo3' ? 'bo3' : 'single',
    },
    competitors,
    bracketSize,
    bracketRounds: k,
    byeCompetitorIds: byeIds,
    wb: { matches: [], champion: null, runnerUp: null, roundTotals: {}, roundCompleted: {} },
    lb: {
      matches: [],
      levels: {},
      remainingAlive: 0,
      nonFinalWbCompleted: 0,
      nonFinalWbTotal: competitors.length - 2,
      totalLevels: k - 1, // mirrors WB's non-final round count, for column display
      champion: null,
      runnerUp: null,
    },
    final4: { semi1: null, semi2: null, smallFinal: null, grandFinal: null },
    eliminationOrder: [], // competitorIds, in elimination order (earliest first)
    ranks: {}, // 1..4 -> competitorId
    standings: null, // filled once tournament completes
  };

  buildWinnersBracket(tournament, byeIds, remaining, bracketSize, k, racesNeededToWin);

  tournament.wb.matches.forEach((m) => {
    tournament.wb.roundTotals[m.round] = (tournament.wb.roundTotals[m.round] || 0) + 1;
    if (m.completed) {
      tournament.wb.roundCompleted[m.round] = (tournament.wb.roundCompleted[m.round] || 0) + 1;
    }
  });

  return tournament;
}

// True once the Losers Bracket has actually started (level 1 opened) — used
// by the UI to show a "waiting for WB rounds 1-2" banner beforehand.
function isLbGateOpen(tournament) {
  return !!(tournament.lb.levels[1] && tournament.lb.levels[1].opened);
}

function buildWinnersBracket(tournament, byeIds, remaining, bracketSize, k, racesNeededToWin) {
  const byeMatches = byeIds.map((id) =>
    newMatch('WB', 1, {
      slotA: { competitorId: id, isBye: false },
      slotB: { competitorId: null, isBye: true },
      isBye: true,
      racesNeededToWin: 0,
      completed: true,
      winnerId: id,
      loserId: null,
    })
  );

  const realMatches = [];
  for (let i = 0; i < remaining.length; i += 2) {
    realMatches.push(
      newMatch('WB', 1, {
        slotA: { competitorId: remaining[i], isBye: false },
        slotB: { competitorId: remaining[i + 1], isBye: false },
        racesNeededToWin,
      })
    );
  }

  let round1 = shuffle([...byeMatches, ...realMatches]);
  tournament.wb.matches.push(...round1);

  let currentFeeders = round1;
  for (let round = 2; round <= k; round += 1) {
    const nextMatches = [];
    for (let i = 0; i < currentFeeders.length; i += 2) {
      const isFinalRound = round === k;
      const match = newMatch('WB', round, { racesNeededToWin });
      wireWinnerToSlot(currentFeeders[i], match, 'slotA');
      wireWinnerToSlot(currentFeeders[i + 1], match, 'slotB');
      nextMatches.push(match);

      if (isFinalRound) {
        match.onWinnerAdvanceTo = { type: 'wbChampion' };
        match.onLoserAdvanceTo = { type: 'wbRunnerUp' };
      }
    }
    tournament.wb.matches.push(...nextMatches);

    currentFeeders.forEach((feederMatch) => {
      // feederMatch belongs to `round - 1`; its loser (once known) must drop to LB,
      // tagged with the WB round it dropped from (drives the LB "level" column),
      // unless it's the WB final itself (handled above with onLoserAdvanceTo = wbRunnerUp).
      if (feederMatch.round < k) {
        feederMatch.onLoserAdvanceTo = { type: 'lbEntrant', level: feederMatch.round };
      }
    });

    currentFeeders = nextMatches;
  }

  // round1 byes/real matches also need onLoserAdvanceTo wired (round1 < k, unless k===1 which can't happen since bracketSize>=4)
  round1.forEach((m) => {
    if (!m.onLoserAdvanceTo) m.onLoserAdvanceTo = { type: 'lbEntrant', level: m.round };
  });

  // Resolve any already-completed matches (byes) immediately so their winner
  // propagates into round 2 right away.
  round1.forEach((m) => {
    if (m.completed) propagateWinner(tournament, m);
  });
}

function wireWinnerToSlot(feederMatch, targetMatch, slotKey) {
  if (feederMatch.completed) {
    targetMatch[slotKey] = { competitorId: feederMatch.winnerId, isBye: false };
  }
  feederMatch.onWinnerAdvanceTo = { type: 'slot', matchId: targetMatch.id, slot: slotKey };
}

// ---- generic advancement -------------------------------------------

function propagateWinner(tournament, match) {
  dispatch(tournament, match.onWinnerAdvanceTo, match.winnerId, match);
}

function propagateLoser(tournament, match) {
  if (match.loserId == null) return; // byes have no loser
  dispatch(tournament, match.onLoserAdvanceTo, match.loserId, match);
}

function dispatch(tournament, descriptor, competitorId, sourceMatch) {
  if (!descriptor) return;
  switch (descriptor.type) {
    case 'slot': {
      const target = findMatch(tournament, descriptor.matchId);
      target[descriptor.slot] = { competitorId, isBye: false };
      break;
    }
    case 'wbChampion':
      tournament.wb.champion = competitorId;
      checkFinal4Ready(tournament);
      break;
    case 'wbRunnerUp':
      tournament.wb.runnerUp = competitorId;
      checkFinal4Ready(tournament);
      break;
    case 'lbChampion':
      tournament.lb.champion = competitorId;
      checkFinal4Ready(tournament);
      break;
    case 'lbRunnerUp':
      tournament.lb.runnerUp = competitorId;
      checkFinal4Ready(tournament);
      break;
    case 'lbEntrant':
      lbReceiveWbDropout(tournament, competitorId, descriptor.level);
      break;
    case 'lbLevelAdvance': {
      const ls = tournament.lb.levels[descriptor.level];
      ls.survivorsOut.push(competitorId);
      ls.completedRealMatches += 1;
      if (ls.completedRealMatches >= ls.totalRealMatches) {
        ls.resolved = true;
        tryAdvanceLbLevels(tournament);
      }
      break;
    }
    case 'eliminated':
      tournament.lb.remainingAlive -= 1;
      tournament.eliminationOrder.push(competitorId);
      break;
    case 'rank1':
      tournament.ranks[1] = competitorId;
      finalizeIfComplete(tournament);
      break;
    case 'rank2':
      tournament.ranks[2] = competitorId;
      finalizeIfComplete(tournament);
      break;
    case 'rank3':
      tournament.ranks[3] = competitorId;
      finalizeIfComplete(tournament);
      break;
    case 'rank4':
      tournament.ranks[4] = competitorId;
      finalizeIfComplete(tournament);
      break;
    default:
      throw new Error('Unknown advance descriptor: ' + descriptor.type);
  }
}

// ---- losers bracket engine --------------------------------------------
//
// The Losers Bracket proceeds in fully-gated "levels". Level L's entire
// roster — survivors who just qualified out of level L-1, plus everyone who
// just dropped from WB round L — must be completely known before ANY
// pairing happens for that level. This guarantees every level's heats mix
// qualifiers with fresh drop-ins instead of pairing people from only one
// source, with the unavoidable exception of level 1 (there's no level 0 to
// supply qualifiers, so it's WB round-1 drop-ins only).
//
// Level 1 additionally waits for WB round 2 to finish too, mirroring how
// the event holds the Losers Bracket back for the first two WB heats/rounds
// before kicking it off at all.
//
// A level whose combined roster is odd gives one competitor (randomly) a
// bye into the next level, exactly like WB round 1 handles an uneven field.
//
// Beyond the last WB-round-fed level (totalLevels = bracketRounds - 1),
// "virtual" levels with no WB input keep reducing survivors purely among
// themselves until exactly 2 remain — that match is the Losers Bracket
// final (it doesn't eliminate its loser; both proceed to Final 4).

function getOrCreateLbLevel(tournament, level) {
  if (!tournament.lb.levels[level]) {
    tournament.lb.levels[level] = { wbDropouts: [], opened: false, resolved: false, survivorsOut: [] };
  }
  return tournament.lb.levels[level];
}

function isWbRoundDone(tournament, round) {
  return (tournament.wb.roundCompleted[round] || 0) >= (tournament.wb.roundTotals[round] || 0);
}

function lbReceiveWbDropout(tournament, competitorId, level) {
  tournament.lb.remainingAlive += 1;
  tournament.lb.nonFinalWbCompleted += 1;
  getOrCreateLbLevel(tournament, level).wbDropouts.push(competitorId);
  tryAdvanceLbLevels(tournament);
}

function tryAdvanceLbLevels(tournament) {
  for (let level = 1; ; level += 1) {
    const ls = getOrCreateLbLevel(tournament, level);
    if (ls.opened) continue; // already opened — see if the next level can go too

    const isWbFedLevel = level <= tournament.bracketRounds - 1;
    if (isWbFedLevel && !isWbRoundDone(tournament, level)) return;
    if (level === 1 && !isWbRoundDone(tournament, 2)) return; // one-round buffer before LB opens at all
    if (level > 1) {
      const prev = tournament.lb.levels[level - 1];
      if (!prev || !prev.resolved) return; // previous level hasn't finished playing yet
    }

    openLbLevel(tournament, level);
    // loop continues: a level can resolve instantly (0/1-person roster or an
    // all-bye level), which may immediately unlock the next one too.
  }
}

function openLbLevel(tournament, level) {
  const ls = tournament.lb.levels[level];
  const survivorsIn = level === 1 ? [] : tournament.lb.levels[level - 1].survivorsOut;
  let roster = shuffle([...survivorsIn, ...ls.wbDropouts]);
  ls.opened = true;
  ls.survivorsOut = [];
  ls.totalRealMatches = 0;
  ls.completedRealMatches = 0;

  if (roster.length % 2 === 1) {
    const byeId = roster.pop();
    tournament.lb.matches.push(
      newMatch('LB', null, {
        level,
        isBye: true,
        racesNeededToWin: 0,
        completed: true,
        slotA: { competitorId: byeId, isBye: false },
        slotB: { competitorId: null, isBye: true },
        winnerId: byeId,
        loserId: null,
      })
    );
    ls.survivorsOut.push(byeId);
  }

  ls.totalRealMatches = roster.length / 2;

  for (let i = 0; i < roster.length; i += 2) {
    const a = roster[i];
    const b = roster[i + 1];
    const isFinal =
      tournament.lb.nonFinalWbCompleted >= tournament.lb.nonFinalWbTotal && tournament.lb.remainingAlive === 2;

    const match = newMatch('LB', null, {
      level,
      slotA: { competitorId: a, isBye: false },
      slotB: { competitorId: b, isBye: false },
      racesNeededToWin: tournament.settings.heatFormat === 'bo3' ? 2 : 1,
    });

    if (isFinal) {
      match.onWinnerAdvanceTo = { type: 'lbChampion' };
      match.onLoserAdvanceTo = { type: 'lbRunnerUp' };
      match.isLbFinal = true;
    } else {
      match.onWinnerAdvanceTo = { type: 'lbLevelAdvance', level };
      match.onLoserAdvanceTo = { type: 'eliminated' };
    }

    tournament.lb.matches.push(match);
  }

  if (ls.totalRealMatches === 0) {
    // the level only ever had (at most) a bye — nothing left to play here
    ls.resolved = true;
    tryAdvanceLbLevels(tournament);
  }
}

// ---- final 4 ------------------------------------------------------------

function checkFinal4Ready(tournament) {
  const { wb, lb, final4 } = tournament;
  if (final4.semi1) return; // already created
  if (wb.champion && wb.runnerUp && lb.champion && lb.runnerUp) {
    const racesNeededToWin = tournament.settings.heatFormat === 'bo3' ? 2 : 1;

    const grandFinal = newMatch('GRAND_FINAL', null, { racesNeededToWin });
    grandFinal.onWinnerAdvanceTo = { type: 'rank1' };
    grandFinal.onLoserAdvanceTo = { type: 'rank2' };

    const smallFinal = newMatch('SMALL_FINAL', null, { racesNeededToWin });
    smallFinal.onWinnerAdvanceTo = { type: 'rank3' };
    smallFinal.onLoserAdvanceTo = { type: 'rank4' };

    const semi1 = newMatch('SF', null, {
      slotA: { competitorId: wb.champion, isBye: false },
      slotB: { competitorId: lb.runnerUp, isBye: false },
      racesNeededToWin,
      onWinnerAdvanceTo: { type: 'slot', matchId: grandFinal.id, slot: 'slotA' },
      onLoserAdvanceTo: { type: 'slot', matchId: smallFinal.id, slot: 'slotA' },
    });
    const semi2 = newMatch('SF', null, {
      slotA: { competitorId: wb.runnerUp, isBye: false },
      slotB: { competitorId: lb.champion, isBye: false },
      racesNeededToWin,
      onWinnerAdvanceTo: { type: 'slot', matchId: grandFinal.id, slot: 'slotB' },
      onLoserAdvanceTo: { type: 'slot', matchId: smallFinal.id, slot: 'slotB' },
    });

    final4.semi1 = semi1;
    final4.semi2 = semi2;
    final4.smallFinal = smallFinal;
    final4.grandFinal = grandFinal;
  }
}

function finalizeIfComplete(tournament) {
  const r = tournament.ranks;
  if (r[1] && r[2] && r[3] && r[4]) {
    const standings = [r[1], r[2], r[3], r[4]];
    // Later eliminations = better placement, so walk eliminationOrder backwards.
    for (let i = tournament.eliminationOrder.length - 1; i >= 0; i -= 1) {
      standings.push(tournament.eliminationOrder[i]);
    }
    tournament.standings = standings;
    tournament.status = 'completed';
  }
}

// ---- public mutation API -----------------------------------------------

function getPlayableMatches(tournament) {
  const all = [...tournament.wb.matches, ...tournament.lb.matches];
  [tournament.final4.semi1, tournament.final4.semi2, tournament.final4.smallFinal, tournament.final4.grandFinal].forEach(
    (m) => {
      if (m) all.push(m);
    }
  );
  return all.filter(
    (m) => !m.completed && !m.isBye && m.slotA.competitorId && m.slotB.competitorId
  );
}

function recordRaceWinner(tournament, matchId, winnerId) {
  const match = findMatch(tournament, matchId);
  if (!match) throw new Error('Match not found: ' + matchId);
  if (match.completed) throw new Error('Match already completed.');
  if (winnerId !== match.slotA.competitorId && winnerId !== match.slotB.competitorId) {
    throw new Error('Winner must be one of the two competitors in this match.');
  }

  match.races.push({ winnerId });
  const winsForWinner = match.races.filter((r) => r.winnerId === winnerId).length;

  if (winsForWinner >= match.racesNeededToWin) {
    match.completed = true;
    match.winnerId = winnerId;
    match.loserId = winnerId === match.slotA.competitorId ? match.slotB.competitorId : match.slotA.competitorId;
    if (match.stage === 'WB') {
      tournament.wb.roundCompleted[match.round] = (tournament.wb.roundCompleted[match.round] || 0) + 1;
    }
    // Loser must be processed first: it may decrement lb.remainingAlive, which
    // the winner's propagation depends on to correctly detect the LB final.
    // See bracket.js design notes.
    propagateLoser(tournament, match);
    propagateWinner(tournament, match);

    // A WB round 1 or round 2 result can be the one that finally opens a LB
    // level without itself feeding that level (e.g. the WB final IS round 2
    // in a 4-player bracket, and its dispatches are wbChampion / wbRunnerUp,
    // neither of which touches the Losers Bracket) — re-check explicitly so
    // already-waiting drop-ins don't sit there forever unpaired.
    if (match.stage === 'WB' && (match.round === 1 || match.round === 2)) {
      tryAdvanceLbLevels(tournament);
    }
  }

  return match;
}

// Final placings with ties: everyone knocked out in the same Losers Bracket
// round shares the best place of that group (e.g. four riders out in the
// same round after 11 others -> all 12th). Places 1-4 come from Final 4.
// Returns [{ id, place }] in standings order.
function getPlacings(tournament) {
  if (!tournament.standings) return [];
  const outLevel = {};
  tournament.lb.matches.forEach((m) => {
    if (m.completed && m.loserId && m.onLoserAdvanceTo && m.onLoserAdvanceTo.type === 'eliminated') outLevel[m.loserId] = m.level;
  });
  const top = tournament.standings.slice(0, 4).map((id, i) => ({ id, place: i + 1 }));
  const rest = tournament.standings
    .slice(4)
    .map((id, i) => ({ id, i, level: outLevel[id] || 0 }))
    .sort((a, b) => b.level - a.level || a.i - b.i); // later round out = better place
  let place = 5;
  const placings = top.slice();
  rest.forEach((r, i) => {
    if (i > 0 && r.level !== rest[i - 1].level) place = 5 + i;
    placings.push({ id: r.id, place });
  });
  return placings;
}

function getName(tournament, competitorId) {
  if (!competitorId) return null;
  const c = tournament.competitors.find((c) => c.id === competitorId);
  return c ? c.name : '?';
}

export const _internal = { shuffle, uid }; // exposed for tests

export {
  createTournament,
  getPlayableMatches,
  recordRaceWinner,
  getName,
  getPlacings,
  findMatch,
  isLbGateOpen,
  estimateHeatsCount,
  estimateDurationSeconds,
  nextPowerOfTwo,
};
