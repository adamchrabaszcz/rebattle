// localStorage persistence: a list of tournaments + which one is active.
// Also provides JSON export/import for backup / moving to another machine.

import { validateTournament } from '../engine/validate.js';

const KEY_TOURNAMENTS = 'rebattle.tournaments';
const KEY_ACTIVE_ID = 'rebattle.activeTournamentId';
// The online tournament last opened on this device (its code), when that was the last
// one opened: / takes you back to it. Opening a local one clears it, and vice versa.
const KEY_ACTIVE_ONLINE = 'rebattle.activeOnline';

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
  if (id) {
    localStorage.setItem(KEY_ACTIVE_ID, id);
    localStorage.removeItem(KEY_ACTIVE_ONLINE);
  } else localStorage.removeItem(KEY_ACTIVE_ID);
}

function getActiveOnline() {
  return localStorage.getItem(KEY_ACTIVE_ONLINE);
}

function setActiveOnline(code) {
  if (code) {
    localStorage.setItem(KEY_ACTIVE_ONLINE, code);
    localStorage.removeItem(KEY_ACTIVE_ID);
  } else localStorage.removeItem(KEY_ACTIVE_ONLINE);
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

export { loadAll, saveAll, getActiveId, setActiveId, getActiveOnline, setActiveOnline, upsert, remove, getById, exportToFile, readFile, validateTournament };
