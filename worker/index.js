// The rebattle Worker. Cloudflare runs it only for /api/* (wrangler.jsonc,
// run_worker_first); everything else is a static file from public/, and unknown
// paths such as /t/<code> get index.html so the app can route them itself.
//
// Static responses get their headers from public/_headers; API responses don't,
// so they set their own here.

const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
};

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...API_HEADERS, ...extra } });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method not allowed' }, 405, { Allow: 'GET, HEAD' });
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  },
};
