// Public, read-only API for the live pages (/t/<code> and rider pages). No login.
// Never sends the owners' emails: only the snapshot, its version and when it changed.
//
//   GET /api/t/<code>        -> { code, version, updatedAt, tournament }
//   GET /api/t/<code>/live   WebSocket: { type: 'snapshot', version, updatedAt, tournament }
//                            on connect and after every save, { type: 'deleted' } at the end;
//                            a viewer that sends anything is disconnected

const CODE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/; // same as public/js/route.js

export async function handlePublic(request, env, json) {
  const url = new URL(request.url);
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
