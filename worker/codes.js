// Tournament codes for addresses like /t/cable-open-x7k2: a short form of the name
// plus 4 random characters, so codes are readable, unique (the store refuses a code
// that is taken and the Worker draws again) and can't be guessed from the name alone.
// Always matches the app's route pattern (public/js/route.js).

import { slugify } from '../public/js/engine/slug.js';

export { slugify };

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // no 0/o, 1/l: easy to read off a poster

export function randomSuffix(n = 4) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function makeCode(name, suffix = randomSuffix()) {
  return slugify(name) + '-' + suffix;
}
