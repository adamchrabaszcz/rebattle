// Pure layout helpers shared by the bracket view and the replay (no DOM).

function slotOf(match, competitorId) {
  if (match.slotA.competitorId === competitorId) return 'slotA';
  if (match.slotB.competitorId === competitorId) return 'slotB';
  return null;
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

export { slotOf, lbLayout };
