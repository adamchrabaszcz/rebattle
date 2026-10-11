// In-memory stand-in for Durable Object namespaces, for tools/serve.mjs and tests.
// Mirrors what the stores rely on: idFromName/get, one instance per name, a storage
// with get/put/delete/deleteAll (values copied, like real storage), and one request
// at a time per object (Cloudflare's input gates). Data is lost on restart; `npm run
// dev` (wrangler) runs the real thing.

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
    keys: () => [...data.keys()],
  };
}

export function fakeNamespace(StoreClass) {
  const objects = new Map();
  return {
    idFromName: (name) => ({ name, toString: () => name }),
    get(id) {
      if (!objects.has(id.name)) objects.set(id.name, { store: new StoreClass({ storage: memoryStorage() }), queue: Promise.resolve() });
      const obj = objects.get(id.name);
      return {
        fetch(input, init) {
          const run = obj.queue.then(() => obj.store.fetch(new Request(input, init)));
          obj.queue = run.catch(() => {});
          return run;
        },
      };
    },
    objects, // for tests: peek at what is stored
  };
}
