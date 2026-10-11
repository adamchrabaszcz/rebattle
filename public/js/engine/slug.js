// Short, readable address parts made from names: tournament codes (worker/codes.js
// adds a random suffix) and rider links such as /t/cable-open-x7k2/dora.
// Always matches the app's route pattern (public/js/route.js). Pure, no DOM.

const LETTERS = { ł: 'l', đ: 'd', ð: 'd', ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', þ: 'th', ı: 'i' };
const RIDER = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/; // same as route.js

function slugify(name, max = 20, fallback = 'tournament') {
  let s = String(name || '')
    .toLowerCase()
    .replace(/[łđðøæœßþı]/g, (c) => LETTERS[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > max) s = s.slice(0, max).replace(/-[^-]*$/, '') || s.slice(0, max); // cut at a word boundary
  return s.replace(/-+$/, '') || fallback;
}

// Each rider's link name: the one stored on the competitor (so fixing a typo in a
// name doesn't break links already shared), or one made from the name, with -2, -3
// for riders who share a name. Returns { [competitorId]: slug }.
function riderSlugs(t) {
  const out = Object.create(null); // ids come from saved files: no inherited keys
  const taken = new Set();
  t.competitors.forEach((c) => {
    if (typeof c.slug === 'string' && RIDER.test(c.slug) && !taken.has(c.slug)) taken.add((out[c.id] = c.slug));
  });
  t.competitors.forEach((c) => {
    if (out[c.id]) return;
    const base = slugify(c.name, 24, 'rider');
    let slug = base;
    for (let n = 2; taken.has(slug); n += 1) slug = base + '-' + n;
    taken.add((out[c.id] = slug));
  });
  return out;
}

// Stores the links on the competitors (done when a tournament goes online). True if
// anything changed.
function assignSlugs(t) {
  const slugs = riderSlugs(t);
  let changed = false;
  t.competitors.forEach((c) => {
    if (c.slug !== slugs[c.id]) {
      c.slug = slugs[c.id];
      changed = true;
    }
  });
  return changed;
}

export { slugify, riderSlugs, assignSlugs };
