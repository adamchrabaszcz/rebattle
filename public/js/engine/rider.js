// One rider's view of a tournament, for their page (/t/<code>/<rider>): where they
// stand, the heats they rode and what comes next. Pure, no DOM.

import { getPlacings } from './bracket.js';

const other = (m, cid) => (m.slotA.competitorId === cid ? m.slotB.competitorId : m.slotA.competitorId);
const rides = (m, cid) => m.slotA.competitorId === cid || m.slotB.competitorId === cid;

// Every heat in the order a rider meets them: Winners rounds, Losers rounds, Final 4.
function heatsInOrder(t) {
  const f = t.final4;
  return [
    ...t.wb.matches.slice().sort((a, b) => a.round - b.round),
    ...t.lb.matches.slice().sort((a, b) => a.level - b.level),
    ...[f.semi1, f.semi2, f.smallFinal, f.grandFinal].filter(Boolean),
  ];
}

// stage: 'winners' (no loss yet), 'losers' (one loss), 'final4' (through to the
//   Final 4), 'out' (lost twice) or 'placed' (the tournament is over: see place).
// heats: the ones ridden, [{ match, opponentId, won, bye, score: [mine, theirs] }].
// next: { match, opponentId } (opponentId null while still open), or null; waiting:
//   true when nothing is set yet because a draw or the other bracket comes first.
function riderSummary(t, cid) {
  const mine = heatsInOrder(t).filter((m) => rides(m, cid));
  const heats = mine
    .filter((m) => m.completed)
    .map((m) => {
      const opponentId = other(m, cid);
      const wins = (id) => m.races.filter((r) => r.winnerId === id).length;
      return { match: m, opponentId, won: m.winnerId === cid, bye: !!m.isBye, score: [wins(cid), wins(opponentId)] };
    });
  const open = mine.find((m) => !m.completed);
  const next = open ? { match: open, opponentId: other(open, cid) || null } : null;

  let stage;
  let place = null;
  if (t.status === 'completed') {
    stage = 'placed';
    const p = getPlacings(t).find((x) => x.id === cid);
    place = p ? p.place : null;
  } else if (t.eliminationOrder.includes(cid)) stage = 'out';
  else if ([t.wb.champion, t.wb.runnerUp, t.lb.champion, t.lb.runnerUp].includes(cid)) stage = 'final4';
  else stage = heats.some((h) => !h.won) ? 'losers' : 'winners';

  return { stage, place, heats, next, waiting: !next && ['winners', 'losers', 'final4'].includes(stage) };
}

export { riderSummary, heatsInOrder };
