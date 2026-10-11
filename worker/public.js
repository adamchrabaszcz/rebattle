// Public, read-only API for the live pages (/t/<code> and rider pages). No login.
// Never sends the owners' emails: only the snapshot, its version and when it changed.
//
//   GET /api/competitions?offset=0&limit=30  -> { total, competitions: [summary] }
//                            the listed ones (worker/listing.js), running first, then finished
//   GET /api/t/<code>        -> { code, version, updatedAt, tournament }
//   GET /api/t/<code>/live   WebSocket: { type: 'snapshot', version, updatedAt, tournament }
//                            on connect and after every save, { type: 'deleted' } at the end;
//                            a viewer that sends anything is disconnected

const CODE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/; // same as public/js/route.js

export async function handlePublic(request, env, json) {
  const url = new URL(request.url);
  if (url.pathname === '/api/competitions') {
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method not allowed' }, 405, { Allow: 'GET, HEAD' });
    if (!env.COMPETITIONS) return json({ total: 0, competitions: [] });
    const offset = Number(url.searchParams.get('offset')) || 0;
    const limit = Number(url.searchParams.get('limit')) || 30;
    const index = env.COMPETITIONS.get(env.COMPETITIONS.idFromName('all'));
    return json(await (await index.fetch('https://index/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offset, limit }) })).json());
  }
  const m = url.pathname.match(/^\/api\/t\/([^/]+)(\/live)?$/);
  if (!m || !CODE.test(m[1])) return json({ error: 'not found' }, 404);
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method not allowed' }, 405, { Allow: 'GET, HEAD' });
  if (!env.TOURNAMENTS) return json({ error: 'online tournaments are not available here' }, 503);
  const store = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(m[1]));

  if (m[2]) {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected a WebSocket' }, 426);
    return store.fetch(new Request('https://store/live', request)); // the store answers 404 or switches protocols
  }
  const res = await store.fetch('https://store/read');
  if (res.status !== 200) return json({ error: 'not found' }, 404);
  const { version, updatedAt, tournament } = await res.json();
  return json({ code: m[1], version, updatedAt, tournament });
}
