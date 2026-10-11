// What the public list shows for a listed competition: no owners, nothing the public
// page doesn't already show. status: 'in_progress' or 'completed'; started: a heat
// has been ridden ("Starting soon" until then); winner: first place's name once it's over.
export function listing(code, t, updatedAt) {
  const name = (id) => (t.competitors.find((c) => c.id === id) || {}).name || null;
  const matches = [...t.wb.matches, ...t.lb.matches, ...Object.values(t.final4).filter(Boolean)];
  return {
    code,
    name: t.name,
    createdAt: t.createdAt,
    updatedAt,
    riders: t.competitors.length,
    status: t.status,
    started: matches.some((m) => m.races && m.races.length),
    winner: t.status === 'completed' && t.standings ? name(t.standings[0]) : null,
  };
}
