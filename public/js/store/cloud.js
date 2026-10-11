// Online tournaments: the organiser API (worker/manage.js), a copy of each online
// tournament in this browser, and an outbox that sends changes when it can.
//
// Every change is written here first (instant, works offline), marked pending, and
// sent as a whole snapshot with the version it was based on. Only the latest
// snapshot matters, so the outbox is one slot per tournament, not a queue. If the
// server has moved on (another device saved), the save is refused with its copy
// and the status becomes 'conflict' until the organiser picks a version.
//
// Statuses per tournament: 'saved', 'saving', 'offline' (waiting to send),
// 'conflict' (detail: { version, tournament } from the server), 'error' (detail: message).

const KEY = 'rebattle.online'; // { [code]: { code, version, tournament, pending } }
const RETRY_MS = 10000;

// ---- the copy in this browser ----------------------------------------------------

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}
function writeAll(all) {
  localStorage.setItem(KEY, JSON.stringify(all));
}
export function cached(code) {
  return readAll()[code] || null;
}
export function cachedList() {
  return Object.values(readAll());
}
export function remember(code, version, tournament, pending = false) {
  const all = readAll();
  all[code] = { code, version, tournament, pending };
  writeAll(all);
}
export function forget(code) {
  const all = readAll();
  delete all[code];
  writeAll(all);
}

// ---- the API ---------------------------------------------------------------------

// Throws { offline } when the server can't be reached, { loggedOut } when the login
// has expired (Access answers with a redirect), { conflict } on 409, { status, message } otherwise.
async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      redirect: 'manual',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw { offline: true, message: 'offline' };
  }
  if (res.type === 'opaqueredirect' || res.status === 401) throw { loggedOut: true, message: 'Your login has expired. Log in again to save online.' };
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) throw { conflict: data, message: 'changed on another device' };
  if (!res.ok) throw { status: res.status, message: data.error || 'server error ' + res.status };
  return data;
}

export const list = () => api('GET', '/api/manage/tournaments');
export const load = (code) => api('GET', '/api/manage/t/' + code);
export const remove = (code) => api('DELETE', '/api/manage/t/' + code);
export const setVisibility = (code, listed) => api('PUT', `/api/manage/t/${code}/visibility`, { listed });
export async function create(tournament, listed = false) {
  const { code, version } = await api('POST', '/api/manage/tournaments', { tournament, listed });
  remember(code, version, tournament);
  return code;
}

// ---- the outbox -----------------------------------------------------------------

const listeners = [];
const statuses = {};
let sending = false;
let retryTimer = null;

export function onStatus(fn) {
  listeners.push(fn);
}
export function status(code) {
  return statuses[code] || { status: cached(code) && cached(code).pending ? 'offline' : 'saved' };
}
function setStatus(code, s, detail) {
  statuses[code] = { status: s, detail };
  listeners.forEach((fn) => fn(code, s, detail));
}

// A change to an online tournament: keep it here, then send it.
export function save(code, tournament) {
  const entry = cached(code);
  remember(code, entry ? entry.version : 0, tournament, true);
  flush();
}

// "Keep mine" after a conflict: base the pending copy on the server's version and send it.
export function overwrite(code, serverVersion) {
  const entry = cached(code);
  remember(code, serverVersion, entry.tournament, true);
  delete statuses[code];
  flush();
}

// "Use theirs" after a conflict.
export function accept(code, version, tournament) {
  remember(code, version, tournament, false);
  setStatus(code, 'saved');
}

export async function flush() {
  if (sending) return;
  const next = cachedList().find((e) => e.pending && !['conflict', 'error'].includes(status(e.code).status));
  if (!next) return;
  sending = true;
  setStatus(next.code, 'saving');
  const sent = JSON.stringify(next.tournament);
  try {
    const { version } = await api('PUT', '/api/manage/t/' + next.code, { baseVersion: next.version, tournament: next.tournament });
    const now = cached(next.code);
    // A change made while this one was on its way stays pending, now based on the new version.
    const newer = !!now && JSON.stringify(now.tournament) !== sent;
    if (now) remember(next.code, version, now.tournament, newer);
    setStatus(next.code, newer ? 'saving' : 'saved');
    sending = false;
    flush();
  } catch (e) {
    sending = false;
    if (e.conflict) setStatus(next.code, 'conflict', e.conflict);
    else if (e.offline || (e.status && e.status >= 500)) {
      setStatus(next.code, 'offline');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(flush, RETRY_MS);
    } else setStatus(next.code, 'error', e.message);
  }
}

if (typeof window !== 'undefined') window.addEventListener('online', () => flush());
