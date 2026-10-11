// The two Durable Objects behind cloud saving. Only the Worker talks to them (never
// the browser), with small JSON requests; the Worker has already checked the login.
// Written as plain classes with fetch() (no `cloudflare:workers` import), so the same
// code runs in Node tests against an in-memory stand-in (tools/fake-do.mjs).

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const HISTORY = 20; // versions kept for recovery

// One per tournament, addressed by its code. Holds the current snapshot, a version
// that goes up with every save, the owners' emails, and the last HISTORY versions.
// A save must name the version it was based on (compare-and-swap): if someone saved
// in between, it is refused with the newer copy, and the app lets the organiser choose.
//
// Viewers follow along over WebSockets (op 'live'): the current snapshot on connect,
// then every saved version. Hibernation API, so open sockets cost nothing while the
// tournament is quiet. Viewers can't send anything.
export class TournamentStore {
  constructor(state) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request) {
    const op = new URL(request.url).pathname.slice(1);
    const body = request.method === 'GET' || op === 'live' ? {} : await request.json();
    const meta = await this.storage.get('meta');
    const isOwner = () => meta.owners.includes(body.email);

    if (op === 'create') {
      if (meta) return reply({ error: 'taken' }, 409);
      const now = Date.now();
      const created = { code: body.code, owners: [body.email], version: 1, createdAt: now, updatedAt: now };
      await this.storage.put({ meta: created, snapshot: body.tournament, 'v:1': body.tournament });
      return reply({ version: 1, updatedAt: now }, 201);
    }
    if (!meta) return reply({ error: 'not found' }, 404);

    if (op === 'live') {
      if (request.headers.get('Upgrade') !== 'websocket') return reply({ error: 'expected a WebSocket' }, 426);
      const [client, server] = Object.values(new WebSocketPair());
      await this.connect(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (op === 'read') {
      return reply({ code: meta.code, version: meta.version, owners: meta.owners, updatedAt: meta.updatedAt, tournament: await this.storage.get('snapshot') });
    }
    if (op === 'save') {
      if (!isOwner()) return reply({ error: 'not yours' }, 403);
      const current = await this.storage.get('snapshot');
      if (body.baseVersion !== meta.version) return reply({ error: 'changed elsewhere', version: meta.version, tournament: current }, 409);
      if (body.tournament.id !== current.id) return reply({ error: 'different tournament' }, 400);
      const version = meta.version + 1;
      const updatedAt = Date.now();
      await this.storage.put({ meta: { ...meta, version, updatedAt }, snapshot: body.tournament, ['v:' + version]: body.tournament });
      if (version > HISTORY) await this.storage.delete('v:' + (version - HISTORY));
      this.broadcast(snapshotMessage(version, updatedAt, body.tournament));
      return reply({ version, updatedAt });
    }
    if (op === 'remove') {
      if (!isOwner()) return reply({ error: 'not yours' }, 403);
      await this.storage.deleteAll();
      this.broadcast(JSON.stringify({ type: 'deleted' }));
      for (const ws of this.state.getWebSockets()) closeQuietly(ws, 1000, 'deleted');
      return reply({ ok: true });
    }
    return reply({ error: 'unknown operation' }, 400);
  }

  // A new viewer: keep the socket (hibernatable) and send what there is now.
  // tools/serve.mjs calls this directly with its own socket, as Node has no WebSocketPair.
  async connect(ws) {
    const meta = await this.storage.get('meta');
    this.state.acceptWebSocket(ws);
    ws.send(snapshotMessage(meta.version, meta.updatedAt, await this.storage.get('snapshot')));
  }

  broadcast(message) {
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        // already closing; the runtime drops it
      }
    }
  }

  // Viewers only listen. Anything they send would wake (and bill) this object, so a
  // socket that talks is closed; the app never sends.
  webSocketMessage(ws) {
    closeQuietly(ws, 1008, 'viewers only listen');
  }
  webSocketClose(ws, code, reason) {
    closeQuietly(ws, code, reason);
  }
}

// What viewers get: never the owners, only the public snapshot.
const snapshotMessage = (version, updatedAt, tournament) => JSON.stringify({ type: 'snapshot', version, updatedAt, tournament });

function closeQuietly(ws, code, reason) {
  try {
    ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
  } catch {
    // already closed
  }
}

// One per organiser, addressed by their email: the list of their tournaments with
// what the home screen shows (name, status, riders, last change), so listing them
// doesn't wake every tournament.
export class OrganiserList {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch(request) {
    const op = new URL(request.url).pathname.slice(1);
    const entries = (await this.storage.get('entries')) || {};
    if (op === 'list') return reply(Object.values(entries).sort((a, b) => b.updatedAt - a.updatedAt));
    const body = await request.json();
    if (op === 'put') entries[body.code] = body;
    else if (op === 'delete') delete entries[body.code];
    else return reply({ error: 'unknown operation' }, 400);
    await this.storage.put('entries', entries);
    return reply({ ok: true });
  }
}
