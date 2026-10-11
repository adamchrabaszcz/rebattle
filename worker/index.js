// The rebattle Worker. Cloudflare runs it only for /api/* (wrangler.jsonc,
// run_worker_first); everything else is a static file from public/, and unknown
// paths such as /t/<code> get index.html so the app can route them itself.
//
// Static responses get their headers from public/_headers; API responses don't,
// so they set their own here.

import { organiserOf } from './auth.js';

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

const readOnly = (request) => request.method === 'GET' || request.method === 'HEAD';
const notAllowed = () => json({ error: 'method not allowed' }, 405, { Allow: 'GET, HEAD' });

export default {
  // deps.getKeys: Access signing keys, injectable for tests.
  async fetch(request, env = {}, ctx, deps = {}) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return readOnly(request) ? json({ ok: true }) : notAllowed();

    // Organiser endpoints. Access only lets approved emails reach /api/manage/*;
    // the token is checked here again regardless (auth.js).
    if (url.pathname === '/api/manage/me') {
      // Who is logged in, or { email: null }. Not an error: the app asks on every start.
      if (!readOnly(request)) return notAllowed();
      const who = await organiserOf(request, env, deps);
      return json({ email: who ? who.email : null });
    }
    if (url.pathname === '/api/manage/login') {
      // The "Log in" link. Access shows its email-code page first, then lets the
      // browser through to here, and we send it back to the app.
      if (!readOnly(request)) return notAllowed();
      const who = await organiserOf(request, env, deps);
      if (!who) return json({ error: 'login required' }, 401);
      return new Response(null, { status: 302, headers: { Location: '/', 'Cache-Control': 'no-store' } });
    }
    return json({ error: 'not found' }, 404);
  },
};
