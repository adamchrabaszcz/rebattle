// Address parts: tournament codes made from the name (worker/codes.js adds a random
// suffix), and rider links made from ids, so no rider's name is in an address.
// Always matches the app's route pattern (public/js/route.js). Pure, no DOM.

const LETTERS = { ł: 'l', đ: 'd', ð: 'd', ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', þ: 'th', ı: 'i' };

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

// Each rider's link: a short code worked out from the tournament and competitor ids,
// e.g. /t/cable-open-x7k2/k7m2qp. No name in the address, and it never changes:
// ids stay the same when a name is fixed. Anyone can work it out from the tournament
// (the public page does), so it hides nothing the page doesn't show. In the rare case
// two riders get the same code, the later one gets -2. Returns { [competitorId]: code }.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // same as tournament codes: no 0/o, 1/l

function riderCode(text) {
  let h = 0x811c9dc5; // FNV-1a, 32 bits: enough to tell a tournament's riders apart
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  let out = '';
  for (let i = 0; i < 6; i += 1, h >>>= 5) out += ALPHABET[h & 31];
  return out;
}

function riderSlugs(t) {
  const out = Object.create(null); // ids come from saved files: no inherited keys
  const taken = new Set();
  t.competitors.forEach((c) => {
    const base = riderCode(t.id + '/' + c.id);
    let slug = base;
    for (let n = 2; taken.has(slug); n += 1) slug = base + '-' + n;
    taken.add((out[c.id] = slug));
  });
  return out;
}

export { slugify, riderSlugs };
