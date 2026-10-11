# AGENTS.md

rebattle is a static, no-build tournament manager for head-to-head double elimination (Winners + Losers bracket, crossover Final 4). Plain HTML/CSS/JS, saved in the browser.

Keep this file short. Detailed context lives in `docs/`; read the relevant doc before changing an area, and update it in the same change when behaviour or structure changes.

## Read first

- `docs/architecture.md`: modules, data model, bracket rules, rendering, replay video
- `docs/brand.md`: logo, colours, type, wording
- `CONTRIBUTING.md`: workflow, commits, checks

## Commands

- Run: `node tools/serve.mjs` (static app), or `npm install` once then `npm run dev` (app + Worker); open http://127.0.0.1:8787
- Test: `node --test` and `node tests/browser/smoke.mjs` (both must pass; CI runs them on every push)

## Rules

- No build step, no framework, no npm runtime dependencies. Native ES modules; no globals. Dev tools only, pinned to an exact version (`package-lock.json`). Third-party browser code only as unmodified files in `public/js/vendor/`, with source, version and licence noted in `docs/architecture.md`.
- `public/js/engine/` stays pure logic (no DOM, imports nothing else); cover changes with tests in `tests/`.
- Every user-supplied string goes through `escapeHtml` before it reaches HTML.
- Clicks go through `data-action` handled in `public/js/app.js`; no inline handlers. The read-only view only runs actions listed in `VIEW_ACTIONS`; add one there only if it changes no data.
- Don't rename the `ruedaBattle.*` localStorage keys (existing saved data).
- Online tournaments: the browser sends whole snapshots with `baseVersion`; the Worker checks login, same origin, size, `validateTournament` and ownership on every write. Keep owner emails out of anything public (`/api/t/*` and the live feed).
- Conventional Commits; branch + PR, never commit straight to `main`.
- One feature or fix per PR, each branched from `main` and mergeable on its own; split multi-part requests (CONTRIBUTING.md).
