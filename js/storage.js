// localStorage persistence: a list of tournaments + which one is active.
// Also provides JSON export/import for backup / moving to another machine.

(function (global) {
  'use strict';

  // Keys predate the rebattle rename; kept so tournaments already saved in browsers still load.
  const KEY_TOURNAMENTS = 'ruedaBattle.tournaments';
  const KEY_ACTIVE_ID = 'ruedaBattle.activeTournamentId';

  function loadAll() {
    try {
      const raw = localStorage.getItem(KEY_TOURNAMENTS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Failed to load tournaments from localStorage', e);
      return [];
    }
  }

  function saveAll(tournaments) {
    localStorage.setItem(KEY_TOURNAMENTS, JSON.stringify(tournaments));
  }

  function getActiveId() {
    return localStorage.getItem(KEY_ACTIVE_ID);
  }

  function setActiveId(id) {
    if (id) localStorage.setItem(KEY_ACTIVE_ID, id);
    else localStorage.removeItem(KEY_ACTIVE_ID);
  }

  function upsert(tournament) {
    const all = loadAll();
    const idx = all.findIndex((t) => t.id === tournament.id);
    if (idx >= 0) all[idx] = tournament;
    else all.push(tournament);
    saveAll(all);
  }

  function remove(id) {
    const all = loadAll().filter((t) => t.id !== id);
    saveAll(all);
    if (getActiveId() === id) setActiveId(null);
  }

  function getById(id) {
    return loadAll().find((t) => t.id === id) || null;
  }

  function exportToFile(tournament) {
    const blob = new Blob([JSON.stringify(tournament, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (tournament.name || 'tournament').replace(/[^a-z0-9_-]+/gi, '_');
    a.href = url;
    a.download = `rebattle_${safeName}_${tournament.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000); // revoking right away can cancel the download (Safari, Firefox)
  }

  // An imported file is untrusted: its ids end up in HTML attributes, so apart from the
  // free-text names every string must be a plain token, and the core shape must be there.
  const TOKEN = /^[A-Za-z0-9_.-]{0,100}$/;
  function validateTournament(t) {
    const fail = (why) => {
      throw new Error('This does not look like a rebattle tournament file (' + why + ').');
    };
    if (!t || typeof t !== 'object' || Array.isArray(t)) fail('not an object');
    if (typeof t.id !== 'string' || !t.id || !TOKEN.test(t.id)) fail('bad id');
    if (typeof t.name !== 'string') fail('missing name');
    if (!Array.isArray(t.competitors) || t.competitors.length < 4) fail('missing competitors');
    if (t.competitors.some((c) => !c || typeof c.name !== 'string' || typeof c.id !== 'string')) fail('bad competitor');
    if (!['in_progress', 'completed'].includes(t.status)) fail('bad status');
    if (!t.wb || !Array.isArray(t.wb.matches) || !t.lb || !Array.isArray(t.lb.matches) || !t.final4 || !t.settings) fail('missing bracket');
    (function walk(v, key, parent) {
      if (typeof v === 'string') {
        const isName = key === 'name' && (parent === t || t.competitors.includes(parent));
        if (!isName && !TOKEN.test(v)) fail('unexpected text in "' + key + '"');
      } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, String(i), v));
      else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], k, v));
      else if (!(v === null || typeof v === 'number' || typeof v === 'boolean')) fail('unexpected value');
    })(t, '', null);
    return t;
  }

  // Reads and checks a file; saving is left to the caller, which asks before replacing
  // a tournament that is already saved under the same id.
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          let tournament;
          try {
            tournament = JSON.parse(reader.result);
          } catch (e) {
            throw new Error('This file is not valid JSON.');
          }
          resolve(validateTournament(tournament));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  global.Store = { loadAll, saveAll, getActiveId, setActiveId, upsert, remove, getById, exportToFile, readFile, validateTournament };
})(typeof window !== 'undefined' ? window : globalThis);
