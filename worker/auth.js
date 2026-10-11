// Organiser login via Cloudflare Access. Access sits in front of /manage/* and
// /api/manage/* and only lets approved emails through; this file checks the token
// Access attaches anyway (Cf-Access-Jwt-Assertion), so nothing relies on Access
// being configured correctly: signature (RS256, the team's published keys),
// issuer, audience (this app's AUD tag), expiry, and an email claim.

const SKEW = 60; // seconds of clock difference tolerated
const KEY_CACHE_MS = 10 * 60 * 1000;

const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

// The team's signing keys, cached for a while; refetched once when a token names
// a key we don't have (Access rotates keys).
let cached = { domain: null, keys: [], at: 0 };
export async function accessKeys(teamDomain, { refresh = false } = {}) {
  if (!refresh && cached.domain === teamDomain && Date.now() - cached.at < KEY_CACHE_MS) return cached.keys;
  const res = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('could not load Access keys');
  const { keys } = await res.json();
  cached = { domain: teamDomain, keys: keys || [], at: Date.now() };
  return cached.keys;
}

// Returns { email } for a valid token, otherwise null. getKeys(refresh) is injectable for tests.
export async function verifyAccessToken(token, { teamDomain, aud, getKeys, now = Date.now() / 1000 }) {
  if (!token || !teamDomain || !aud) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || !header.kid) return null;

  let jwk = (await getKeys(false)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await getKeys(true)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  let ok = false;
  try {
    ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), signed);
  } catch {
    return null;
  }
  if (!ok) return null;

  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== teamDomain || !auds.includes(aud)) return null;
  if (typeof payload.exp !== 'number' || payload.exp + SKEW < now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf - SKEW > now) return null;
  if (typeof payload.email !== 'string' || !payload.email.includes('@')) return null;
  return { email: payload.email.toLowerCase() };
}

// The organiser behind a request, or null. Locally (wrangler dev / tools/serve.mjs on
// 127.0.0.1 or localhost) DEV_ORGANISER_EMAIL from .dev.vars stands in for Access;
// it is ignored on any other host.
export async function organiserOf(request, env, { getKeys } = {}) {
  const host = new URL(request.url).hostname;
  if (env.DEV_ORGANISER_EMAIL && (host === '127.0.0.1' || host === 'localhost')) return { email: env.DEV_ORGANISER_EMAIL.toLowerCase() };
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  return verifyAccessToken(request.headers.get('Cf-Access-Jwt-Assertion'), {
    teamDomain,
    aud: env.ACCESS_AUD,
    getKeys: getKeys || ((refresh) => accessKeys(teamDomain, { refresh })),
  });
}
