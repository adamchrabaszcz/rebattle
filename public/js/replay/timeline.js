// The replay's scene list. Pure: no canvas, so it runs (and is tested) in Node.

import * as Bracket from '../engine/bracket.js';
import { lbLayout } from '../engine/lb-layout.js';
import { riderSlugs } from '../engine/slug.js';
import { C, DRAW_EXTRA, TARGET_SECONDS } from './theme.js';

// ---- timeline -------------------------------------------------------------

// focus: competitor id for a single rider's journey (only their heats, then
// their result), or null for the whole competition.
// site: { host, code } to put the tournament's public address on the last scene
// (code null for a local tournament: then just the host).
function buildTimeline(t, focus, site) {
  const k = t.bracketRounds;
  const wbRounds = {};
  t.wb.matches.forEach((m) => (wbRounds[m.round] = wbRounds[m.round] || []).push({ match: m }));
  const lb = lbLayout(t);

  const wbScene = (r) =>
    wbRounds[r] && {
      type: 'round',
      kicker: 'Winners',
      color: C.accent,
      title: r === k ? 'Final' : 'Round ' + r,
      sub: r === k ? 'Winner → Semi 1 · runner-up → Semi 2' : 'Lose here → second chance in the Losers bracket',
      items: wbRounds[r],
    };
  const lbScene = (l) =>
    lb.levels[l] &&
    lb.levels[l].length && {
      type: 'round',
      kicker: 'Losers',
      color: C.losers,
      title: 'Round ' + l,
      sub:
        l === 1
          ? 'Second chance for Winners R1 losers · lose again → out'
          : t.lb.levels[l] && t.lb.levels[l].wbDropouts.length
          ? `Joined by Winners R${l} drop-ins · lose → out`
          : 'Lose → out',
      draw: true,
      items: lb.levels[l],
    };

  const rounds = [wbScene(1), wbScene(2)];
  for (let i = 1; i <= Math.max(lb.maxLevel, k); i += 1) rounds.push(lbScene(i), wbScene(i + 2));
  if (lb.final.length)
    rounds.push({ type: 'round', kicker: 'Losers', color: C.losers, title: 'Final', sub: 'Winner → Semi 2 · runner-up → Semi 1', items: lb.final });

  const f4 = t.final4;
  const semis = {
        type: 'round',
        kicker: 'Final 4',
        color: C.accent2,
        title: 'Semifinals',
        sub: 'Winners → Grand final · losers → Small final',
        big: true,
        fixed: 2.4,
        items: [
          { match: f4.semi1, label: 'Semifinal 1' },
          { match: f4.semi2, label: 'Semifinal 2' },
        ],
      };
  const finals = {
        type: 'round',
        kicker: 'Final 4',
        color: C.accent2,
        title: 'Finals',
        big: true,
        fixed: 3.4,
        items: [
          { match: f4.smallFinal, label: 'Small final · 3rd place' },
          { match: f4.grandFinal, label: 'Grand final · 1st place' },
        ],
      };

  const scenes = focus
    ? journeyScenes(t, focus, rounds.filter(Boolean).concat([semis, finals]), site)
    : [{ type: 'intro', fixed: 3.5 }] // logo (underline done at 1.85s), then name, field and format
        .concat(rounds.filter(Boolean))
        .concat([
          { type: 'qualify', kicker: 'Final 4', color: C.accent2, title: 'The semis', fixed: 3.0 },
          semis,
          finals,
          { type: 'podium', fixed: 5.8, link: siteLink(site, 'Results:', site && site.code && '/t/' + site.code) }, // confetti is fully faded ~0.25s before the end
        ]);

  // Fixed scenes keep their length; the remaining budget is shared between
  // round scenes by heat count, with a floor so small rounds stay readable.
  const fixedTotal = scenes.reduce((a, s) => a + (s.fixed || 0) + (s.draw ? DRAW_EXTRA : 0), 0);
  const budget = Math.max(0, TARGET_SECONDS - fixedTotal);
  const weight = (s) => 1 + 0.3 * s.items.filter((i) => !i.match.isBye).length;
  const flex = scenes.filter((s) => !s.fixed);
  const totalWeight = flex.reduce((a, s) => a + weight(s), 0) || 1;
  let start = 0;
  scenes.forEach((s, i) => {
    s.index = i;
    s.dur = (s.fixed || Math.max(1.6, (budget * weight(s)) / totalWeight)) + (s.draw ? DRAW_EXTRA : 0);
    s.start = start;
    start += s.dur;
  });
  return { scenes, total: start, tournament: t, focus: focus || null };
}

// One rider's path: every heat they rode (in running order), one per
// scene, then a result card.
function journeyScenes(t, focus, heatScenes, site) {
  const rode = (item) => item.match.slotA.competitorId === focus || item.match.slotB.competitorId === focus;
  const mine = heatScenes
    .map((s) => {
      const items = s.items.filter(rode);
      if (!items.length) return null;
      return Object.assign({}, s, { items, big: true, fixed: items[0].match.stage === 'GRAND_FINAL' ? 2.6 : 1.8 });
    })
    .filter(Boolean);

  const placing = Bracket.getPlacings(t).find((p) => p.id === focus);
  const tied = Bracket.getPlacings(t).filter((p) => p.place === placing.place).length > 1;
  const last = mine[mine.length - 1];
  const lm = last.items[0].match;
  let how;
  if (placing.place === 1) how = 'Champion';
  else if (lm.stage === 'GRAND_FINAL') how = `Lost the Grand Final to ${name(t, lm.winnerId)}`;
  else if (lm.stage === 'SMALL_FINAL') how = lm.winnerId === focus ? 'Won the Small Final' : `Lost the Small Final to ${name(t, lm.winnerId)}`;
  else how = `Out in ${last.kicker} · ${last.title}, beaten by ${name(t, lm.winnerId)}`;
  const ridden = mine.map((s) => s.items[0].match).filter((m) => !m.isBye);
  const wins = ridden.filter((m) => m.winnerId === focus).length;

  return [{ type: 'journeyIntro', fixed: 2.0 }]
    .concat(mine)
    .concat([
      {
        type: 'result',
        fixed: placing.place <= 3 ? 4.7 : 4.0, // medal finishes get time for the confetti to clear
        place: placing.place,
        tied,
        how,
        stats: `${ridden.length} heat${ridden.length === 1 ? '' : 's'} · ${wins} win${wins === 1 ? '' : 's'} · ${ridden.length - wins} loss${
          ridden.length - wins === 1 ? '' : 'es'
        }`,
        link: siteLink(site, `${name(t, focus).split(/\s+/)[0]}’s journey:`, site && site.code && `/t/${site.code}/${riderSlugs(t)[focus]}`),
      },
    ]);
}

const name = (t, id) => Bracket.getName(t, id) || 'TBD';

// The address shown at the end of the video: { label, url }, or null without a site.
// A local tournament has no public page, so it gets just the host, unlabelled.
function siteLink(site, label, path) {
  if (!site || !site.host) return null;
  return path ? { label, url: site.host + path } : { label: '', url: site.host };
}

export { name, buildTimeline };
