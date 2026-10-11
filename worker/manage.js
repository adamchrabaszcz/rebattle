// Organiser API for online tournaments. The caller is already logged in (auth.js);
// here: same-origin writes only, size and shape checks, ownership, and the two stores.
//
//   GET    /api/manage/tournaments   your tournaments (for the home screen)
//   POST   /api/manage/tournaments   { tournament, listed? }      -> { code, version }
//   GET    /api/manage/t/<code>      -> { code, version, updatedAt, listed, tournament }
//   PUT    /api/manage/t/<code>      { baseVersion, tournament }  -> { version } | 409 { version, tournament }
//   PUT    /api/manage/t/<code>/visibility  { listed }           -> { listed }
//   DELETE /api/manage/t/<code>
//
// listed: shown on rebattle.app's public list (/competitions), or not (the default:
// only people with the link). The index is kept in step after every change here.

import { validateTournament } from '../public/js/engine/validate.js';
import { makeCode } from './codes.js';
import { listing } from './listing.js';

const MAX_BODY = 512 * 1024; // a 40-rider tournament is about 40 KB
const CODE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/; // same as public/js/route.js

const tournamentStore = (env, code) => env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(code));
const organiserList = (env, email) => env.ORGANISERS.get(env.ORGANISERS.idFromName(email));
const competitionIndex = (env) => env.COMPETITIONS.get(env.COMPETITIONS.idFromName('all'));
const call = (stub, op, body) =>
  stub.fetch(`https://store/${op}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});

// Keeps the public list in step with one tournament: its summary while listed, gone otherwise.
async function syncListing(env, code, listed, tournament, updatedAt) {
  if (!env.COMPETITIONS) return;
  if (listed) await call(competitionIndex(env), 'put', listing(code, tournament, updatedAt));
  else await call(competitionIndex(env), 'delete', { code });
}

const summary = (code, t, version, updatedAt) => ({ code, name: t.name, status: t.status, competitors: t.competitors.length, version, updatedAt });

// The body of a write: JSON, not too big, with a tournament that passes the same
// checks as an imported file. Returns { data } or { error, status }.
async function readBody(request) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return { status: 415, error: 'send JSON' };
  const text = await request.text();
  if (text.length > MAX_BODY) return { status: 413, error: 'tournament too large' };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { status: 400, error: 'not valid JSON' };
  }
  try {
    validateTournament(data && data.tournament);
  } catch (e) {
    return { status: 400, error: e.message };
  }
  return { data };
}

export async function handleManage(request, env, who, json, deps = {}) {
  const url = new URL(request.url);
  if (!env.TOURNAMENTS || !env.ORGANISERS) return json({ error: 'online saving is not available here' }, 503);
  // Writes only from rebattle's own pages: the Access cookie is sent cross-site, so
  // without this another site could make a logged-in organiser's browser save.
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.headers.get('Origin') !== url.origin) {
    return json({ error: 'cross-origin request refused' }, 403);
  }

  if (url.pathname === '/api/manage/tournaments') {
    if (request.method === 'GET') return json(await (await call(organiserList(env, who.email), 'list')).json());
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, { Allow: 'GET, POST' });
    const { data, error, status } = await readBody(request);
    if (error) return json({ error }, status);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = makeCode(data.tournament.name, deps.suffix && deps.suffix());
      const listed = data.listed === true; // unlisted unless the organiser chose otherwise
      const res = await call(tournamentStore(env, code), 'create', { code, email: who.email, tournament: data.tournament, listed });
      if (res.status === 409) continue; // code taken: draw another suffix
      const { version, updatedAt } = await res.json();
      await call(organiserList(env, who.email), 'put', summary(code, data.tournament, version, updatedAt));
      if (listed) await syncListing(env, code, true, data.tournament, updatedAt);
      return json({ code, version }, 201);
    }
    return json({ error: 'could not find a free code' }, 500);
  }

  const m = url.pathname.match(/^\/api\/manage\/t\/([^/]+)(\/visibility)?$/);
  if (!m || !CODE.test(m[1])) return json({ error: 'not found' }, 404);
  const code = m[1];
  const store = tournamentStore(env, code);

  if (m[2]) {
    if (request.method !== 'PUT') return json({ error: 'method not allowed' }, 405, { Allow: 'PUT' });
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return json({ error: 'send JSON' }, 415);
    let data;
    try {
      data = JSON.parse((await request.text()).slice(0, 1024));
    } catch {
      return json({ error: 'not valid JSON' }, 400);
    }
    if (!data || typeof data.listed !== 'boolean') return json({ error: 'listed must be true or false' }, 400);
    const res = await call(store, 'visibility', { email: who.email, listed: data.listed });
    if (res.status !== 200) return json({ error: 'not found' }, 404);
    const out = await res.json();
    await syncListing(env, code, out.listed, out.tournament, out.updatedAt);
    return json({ listed: out.listed });
  }

  if (request.method === 'GET') {
    const res = await call(store, 'read');
    if (res.status !== 200) return json({ error: 'not found' }, 404);
    const { version, updatedAt, owners, listed, tournament } = await res.json();
    if (!owners.includes(who.email)) return json({ error: 'not found' }, 404); // don't confirm someone else's code
    return json({ code, version, updatedAt, listed, tournament });
  }
  if (request.method === 'PUT') {
    const { data, error, status } = await readBody(request);
    if (error) return json({ error }, status);
    if (!Number.isInteger(data.baseVersion)) return json({ error: 'baseVersion missing' }, 400);
    const res = await call(store, 'save', { email: who.email, baseVersion: data.baseVersion, tournament: data.tournament });
    const out = await res.json();
    if (res.status === 200) {
      await call(organiserList(env, who.email), 'put', summary(code, data.tournament, out.version, out.updatedAt));
      if (out.listed) await syncListing(env, code, true, data.tournament, out.updatedAt);
    }
    if (res.status === 403) return json({ error: 'not found' }, 404);
    return json(out, res.status);
  }
  if (request.method === 'DELETE') {
    const res = await call(store, 'remove', { email: who.email });
    if (res.status !== 200) return json({ error: 'not found' }, 404);
    await call(organiserList(env, who.email), 'delete', { code });
    await syncListing(env, code, false);
    return json({ ok: true });
  }
  return json({ error: 'method not allowed' }, 405, { Allow: 'GET, PUT, DELETE' });
}
