// Organiser API for online tournaments. The caller is already logged in (auth.js);
// here: same-origin writes only, size and shape checks, ownership, and the two stores.
//
//   GET    /api/manage/tournaments   your tournaments (for the home screen)
//   POST   /api/manage/tournaments   { tournament }               -> { code, version }
//   GET    /api/manage/t/<code>      -> { code, version, updatedAt, tournament }
//   PUT    /api/manage/t/<code>      { baseVersion, tournament }  -> { version } | 409 { version, tournament }
//   DELETE /api/manage/t/<code>

import { validateTournament } from '../public/js/engine/validate.js';
import { makeCode } from './codes.js';

const MAX_BODY = 512 * 1024; // a 40-rider tournament is about 40 KB
const CODE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/; // same as public/js/route.js

const tournamentStore = (env, code) => env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(code));
const organiserList = (env, email) => env.ORGANISERS.get(env.ORGANISERS.idFromName(email));
const call = (stub, op, body) =>
  stub.fetch(`https://store/${op}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});

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
      const res = await call(tournamentStore(env, code), 'create', { code, email: who.email, tournament: data.tournament });
      if (res.status === 409) continue; // code taken: draw another suffix
      const { version, updatedAt } = await res.json();
      await call(organiserList(env, who.email), 'put', summary(code, data.tournament, version, updatedAt));
      return json({ code, version }, 201);
    }
    return json({ error: 'could not find a free code' }, 500);
  }

  const m = url.pathname.match(/^\/api\/manage\/t\/([^/]+)$/);
  if (!m || !CODE.test(m[1])) return json({ error: 'not found' }, 404);
  const code = m[1];
  const store = tournamentStore(env, code);

  if (request.method === 'GET') {
    const res = await call(store, 'read');
    if (res.status !== 200) return json({ error: 'not found' }, 404);
    const { version, updatedAt, owners, tournament } = await res.json();
    if (!owners.includes(who.email)) return json({ error: 'not found' }, 404); // don't confirm someone else's code
    return json({ code, version, updatedAt, tournament });
  }
  if (request.method === 'PUT') {
    const { data, error, status } = await readBody(request);
    if (error) return json({ error }, status);
    if (!Number.isInteger(data.baseVersion)) return json({ error: 'baseVersion missing' }, 400);
    const res = await call(store, 'save', { email: who.email, baseVersion: data.baseVersion, tournament: data.tournament });
    const out = await res.json();
    if (res.status === 200) await call(organiserList(env, who.email), 'put', summary(code, data.tournament, out.version, out.updatedAt));
    if (res.status === 403) return json({ error: 'not found' }, 404);
    return json(out, res.status);
  }
  if (request.method === 'DELETE') {
    const res = await call(store, 'remove', { email: who.email });
    if (res.status !== 200) return json({ error: 'not found' }, 404);
    await call(organiserList(env, who.email), 'delete', { code });
    return json({ ok: true });
  }
  return json({ error: 'method not allowed' }, 405, { Allow: 'GET, PUT, DELETE' });
}
