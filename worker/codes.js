// Tournament codes for addresses like /t/cable-open-x7k2: a short form of the name
// plus 4 random characters, so codes are readable, unique (the store refuses a code
// that is taken and the Worker draws again) and can't be guessed from the name alone.
// Always matches the app's route pattern (public/js/route.js).

const LETTERS = { ł: 'l', đ: 'd', ð: 'd', ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', þ: 'th', ı: 'i' };
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // no 0/o, 1/l: easy to read off a poster

export function slugify(name, max = 20) {
  let s = String(name || '')
    .toLowerCase()
    .replace(/[łđðøæœßþı]/g, (c) => LETTERS[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > max) s = s.slice(0, max).replace(/-[^-]*$/, '') || s.slice(0, max); // cut at a word boundary
  return s.replace(/-+$/, '') || 'tournament';
}

export function randomSuffix(n = 4) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function makeCode(name, suffix = randomSuffix()) {
  return slugify(name) + '-' + suffix;
}
