// In-memory stand-in for Durable Object namespaces, for tools/serve.mjs and tests.
// Mirrors what the stores rely on: idFromName/get, one instance per name, a storage
// with get/put/delete/deleteAll/list (values copied, like real storage), one request at a
// time per object (Cloudflare's input gates), and acceptWebSocket/getWebSockets for
// live viewers (any object with send/close; see tools/ws.mjs). Data is lost on
// restart; `npm run dev` (wrangler) runs the real thing.

function memoryStorage() {
  const data = new Map();
  return {
    async get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : undefined;
    },
    async put(key, value) {
      const entries = typeof key === 'object' ? Object.entries(key) : [[key, value]];
      for (const [k, v] of entries) data.set(k, structuredClone(v));
    },
    async delete(keys) {
      for (const k of [].concat(keys)) data.delete(k);
    },
    async deleteAll() {
      data.clear();
    },
    async list({ prefix = '' } = {}) {
      return new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]));
    },
    keys: () => [...data.keys()],
  };
}

export function fakeNamespace(StoreClass) {
  const objects = new Map();
  return {
    idFromName: (name) => ({ name, toString: () => name }),
    get(id) {
      if (!objects.has(id.name)) {
        const sockets = new Set();
        const state = {
          storage: memoryStorage(),
          acceptWebSocket(ws) {
            sockets.add(ws);
            ws.onClose = () => sockets.delete(ws);
          },
          getWebSockets: () => [...sockets],
        };
        objects.set(id.name, { store: new StoreClass(state), queue: Promise.resolve(), sockets });
      }
      const obj = objects.get(id.name);
      const queued = (fn) => {
        const run = obj.queue.then(fn);
        obj.queue = run.catch(() => {});
        return run;
      };
      return {
        fetch: (input, init) => queued(() => obj.store.fetch(new Request(input, init))),
        // In place of the WebSocket upgrade: hands the store a socket directly.
        connect: (ws) => queued(() => obj.store.connect(ws)),
      };
    },
    objects, // for tests: peek at what is stored
  };
}
