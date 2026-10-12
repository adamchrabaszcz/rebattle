// The rebattle Worker. Cloudflare runs it first for /api/* (wrangler.jsonc,
// run_worker_first); other requests are static files from public/, and only a path
// that is no file reaches the Worker: app routes such as /t/<code> get index.html
// (appPage), anything else the same page with a 404.
//
// Static responses get their headers from public/_headers; API responses don't,
// so they set their own here.

import { parseRoute } from '../public/js/route.js';
import { organiserOf } from './auth.js';
import { handleManage } from './manage.js';
import { handlePublic } from './public.js';

export { TournamentStore, OrganiserList, CompetitionIndex } from './stores.js';

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
  // deps (tests only): getKeys for Access signing keys, suffix for tournament codes.
  async fetch(request, env = {}, ctx, deps = {}) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return readOnly(request) ? json({ ok: true }) : notAllowed();
    if (url.pathname.startsWith('/api/t/') || url.pathname === '/api/competitions') return handlePublic(request, env, json); // anyone, read-only

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
    if (url.pathname.startsWith('/api/manage/')) {
      const who = await organiserOf(request, env, deps);
      if (!who) return json({ error: 'login required' }, 401);
      return handleManage(request, env, who, json, deps);
    }
    if (!url.pathname.startsWith('/api/')) return appPage(request, env, url);
    return json({ error: 'not found' }, 404);
  },
};

// A path that is no file: index.html, so the app routes it (route.js). Paths the app doesn't
// know get the same page with a 404, so people see its "not found" screen and search
// engines a real 404 instead of endless copies of the home page.
async function appPage(request, env, url) {
  if (!readOnly(request)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const page = await env.ASSETS.fetch(new URL('/', url));
  const status = page.ok && parseRoute(url.pathname).name === 'notFound' ? 404 : page.status;
  return new Response(request.method === 'HEAD' ? null : page.body, { status, headers: page.headers });
}
