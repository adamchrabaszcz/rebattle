// Following an online tournament without logging in (/t/<code> and rider pages):
// one read for the first paint, then a WebSocket that brings every new version
// (worker/public.js). If the socket drops it reconnects, sooner when the phone comes
// back to the page; if sockets never get through (a strict network), it falls back
// to reading every 20 seconds.
//
// Statuses: 'live', 'connecting', 'polling', 'offline'.

const POLL_MS = 20000;
const MAX_BACKOFF_MS = 30000;
const GIVE_UP_ON_SOCKETS = 3; // failed attempts in a row that never opened

// { version, updatedAt, tournament }, or throws { notFound } / { offline }.
export async function read(code) {
  let res;
  try {
    res = await fetch('/api/t/' + code, { credentials: 'omit' });
  } catch {
    throw { offline: true };
  }
  if (res.status === 404) throw { notFound: true };
  if (!res.ok) throw { offline: true };
  return res.json();
}

// onSnapshot({ version, updatedAt, tournament }) for each newer version, onGone() when
// the tournament is deleted, onStatus(status). Starts after the first read, at `version`.
export function follow(code, version, { onSnapshot, onGone, onStatus }) {
  let current = version;
  let socket = null;
  let failures = 0;
  let backoff = 1000;
  let timer = null;
  let polling = false;
  let stopped = false;

  const status = (s) => !stopped && onStatus(s);
  const take = (data) => {
    if (data.version > current) {
      current = data.version;
      onSnapshot(data);
    }
  };

  function connect() {
    clearTimeout(timer);
    if (stopped || socket) return;
    status('connecting');
    const ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/api/t/' + code + '/live');
    let opened = false;
    socket = ws;
    ws.onopen = () => {
      opened = true;
      failures = 0;
      backoff = 1000;
      status('live');
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'snapshot') take(msg);
      else if (msg.type === 'deleted') {
        stop();
        onGone();
      }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      if (stopped) return;
      if (!opened) failures += 1;
      if (failures >= GIVE_UP_ON_SOCKETS) return startPolling();
      status(navigator.onLine === false ? 'offline' : 'connecting');
      timer = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    };
  }

  function startPolling() {
    polling = true;
    status('polling');
    timer = setTimeout(poll, POLL_MS);
  }

  let reading = false;
  function poll() {
    clearTimeout(timer);
    if (stopped || reading) return;
    reading = true;
    read(code)
      .then(
        (data) => {
          status('polling');
          take(data);
        },
        (e) => {
          if (!e.notFound) return status('offline');
          stop();
          onGone();
        }
      )
      .finally(() => {
        reading = false;
        if (!stopped) timer = setTimeout(poll, POLL_MS);
      });
  }

  // Phones close sockets in the background: catch up as soon as the page is back.
  function wake() {
    if (stopped || document.visibilityState === 'hidden') return;
    if (polling) poll();
    else if (!socket) {
      backoff = 1000;
      connect();
    }
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('online', wake);
    if (socket) {
      const ws = socket;
      socket = null;
      ws.close();
    }
  }

  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  connect();
  return stop;
}
