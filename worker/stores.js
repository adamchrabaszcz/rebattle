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
export class TournamentStore {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch(request) {
    const op = new URL(request.url).pathname.slice(1);
    const body = request.method === 'GET' ? {} : await request.json();
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
      return reply({ version, updatedAt });
    }
    if (op === 'remove') {
      if (!isOwner()) return reply({ error: 'not yours' }, 403);
      await this.storage.deleteAll();
      return reply({ ok: true });
    }
    return reply({ error: 'unknown operation' }, 400);
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
