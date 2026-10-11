# Architecture

Static app, all served files in `public/`. `public/index.html` loads one ES module, `js/app.js`, which imports the rest (with `modulepreload` hints so they download in parallel). No globals, no build step. Modules don't load over `file://`, so run it from a server.

All paths below are under `public/js/`.

| Module | Role |
| --- | --- |
| `app.js` | Entry. Owns state, handles every click (`data-action` delegation), calls `render` |
| `engine/bracket.js` | Engine (`Bracket`). Pure functions over a tournament object; no DOM, no storage |
| `engine/lb-layout.js` | Pure: Losers-bracket display order and lines, shared by the bracket view and the replay |
| `store/local.js` | `Store`: localStorage persistence, JSON export, import validation |
| `ui/index.js` | `render(container, state)`: picks the screen, binds tabs, hover tracing and resize |
| `ui/html.js` | `escapeHtml`, `fmtDuration`, the logo, the "r" mark, the draw icon |
| `ui/home.js`, `ui/setup.js` | Tournament list; setup form, time estimate, names screen |
| `ui/bracket-screen.js` | The tournament screen: header, toolbar, rename panel, standings, legend |
| `ui/brackets.js`, `ui/cards.js` | Winners, Losers and Final 4 columns (with phone tabs); match cards and their tags |
| `ui/connectors.js` | Connector lines and path tracing, measured from the rendered cards |
| `ui/replay-screen.js` | The replay screen's HTML; `replay/player.js` drives it |
| `replay/theme.js` | Canvas size, timing constants, fonts (`FONTS_READY`), colours |
| `replay/timeline.js` | `buildTimeline`: the scene list. Pure, tested in Node |
| `replay/draw.js` | Canvas primitives: text, logo, tags, medals, icons |
| `replay/rounds.js`, `replay/finale.js` | Scenes: intro, rounds, semis crossover; podium, journey, result, confetti |
| `replay/frame.js` | `drawFrame(ctx, timeline, t)`, scene dots |
| `replay/player.js` | Playback, scrubbing, recording and sharing |

Dependencies point one way: `app.js` → `ui/`, `replay/`, `store/` → `engine/`. `engine/` imports nothing from the others.

Flow: a click → `app.js` mutates `state` (via `Bracket` for results) → `Store.upsert` → `render(container, state)` re-renders the whole screen. Views get everything through `state` (the home screen's list arrives as `state.tournaments`) and never read storage themselves, so the store can later be swapped for the cloud one. Undo keeps up to 20 full JSON snapshots of the tournament.

## Data model (saved as-is, also the export format)

- `tournament`: `id`, `name`, `createdAt`, `status` (`in_progress` | `completed`), `settings` (`heatFormat` `single` | `bo3`, `lapTimeSeconds`, `breakSeconds`), `competitors` `[{id, name}]`, `bracketSize`, `bracketRounds`.
- `wb.matches`, `lb.matches`, `final4.{semi1, semi2, smallFinal, grandFinal}`: matches.
- A match: `id`, `stage` (`WB` | `LB` | `SF` | `SMALL_FINAL` | `GRAND_FINAL`), `round` (WB) or `level` (LB), `slotA`/`slotB` `{competitorId, isBye}`, `races` (one entry per run, for best of 3), `winnerId`, `loserId`, `completed`, `isBye`, `isLbFinal`.
- Each match carries `onWinnerAdvanceTo` / `onLoserAdvanceTo` descriptors (`slot`, `lbEntrant`, `lbLevelAdvance`, `eliminated`, `wbChampion`, `wbRunnerUp`, `lbChampion`, `lbRunnerUp`, `rank1`–`rank4`). Recording a result dispatches them, so advancement is automatic.
- `standings`: competitor ids, best first, set when the tournament completes. `Bracket.getPlacings` turns them into places, with ties for riders knocked out in the same Losers round.

Ids are plain tokens (`[A-Za-z0-9_.-]`). Import enforces this, because ids end up in HTML attributes.

## Bracket rules

- **Winners bracket** is pre-built for the next power of two; byes are random and resolve immediately.
- **Losers bracket** is built on demand in gated *levels*. Level L is the survivors of level L−1 plus everyone who dropped from WB round L, shuffled (a random draw each round). A level opens only when its whole roster is known; level 1 also waits for WB round 2. An odd roster gives one random rider a bye. Levels beyond the last WB-fed one keep halving until two remain: that heat is the LB final.
- **Final 4**: semi 1 = WB 1st v LB 2nd, semi 2 = WB 2nd v LB 1st; winners ride the Grand final, losers the Small final.
- Invariants (tested): N−1 real WB heats, N−3 real LB heats, 2N heats in total, everyone placed exactly once.

## Rendering (`ui/`)

- HTML strings; every user string through `escapeHtml`.
- Bracket columns share one width on desktop (`--col-w`, set by `syncColumns`). Connector lines are an SVG overlay measured from the rendered cards (`drawConnectors`), with small hops where lines cross.
- The Losers bracket is random, so `lbLayout` orders each column by the average position of where its riders came from (barycenter) to keep lines tidy.
- Hovering a rider traces their whole path (`data-cid` on slots and edges).
- Phones (≤700px) switch to one round at a time with tabs; lines are replaced by "→ R3" tags.

## Replay video (`replay/`)

- `buildTimeline(tournament, focus)` makes the scene list: intro, rounds (WB R1, WB R2, then LB/WB alternating), the semis crossover, semifinals, finals, podium. With `focus`, it builds one rider's journey instead.
- `drawFrame(ctx, timeline, t)` is a pure function of time, so playback, scrubbing and recording all give identical frames (confetti uses a seeded random).
- 1080×1920 canvas, exported with `MediaRecorder` in real time (mp4 where supported, otherwise webm). Drawing and recording wait for the bundled fonts to load.
- Losers rounds open with a short name shuffle ("random draw"); timing constants are in `replay/theme.js`.

## Read-only view

- `state.readOnly` renders the tournament screen without anything that changes data: no Won buttons, Undo, Edit names, Export/Import, New/Delete, and no rename panel. Up next, the brackets, tracing, standings and the replay (including its video download) stay.
- `app.js` also refuses every click whose action isn't in `VIEW_ACTIONS` (an allowlist), so a new organiser action is blocked in the view unless it is added there on purpose.
- The view follows changes made in another tab (the `storage` event) instead of showing the "updated elsewhere" warning, since it has nothing to overwrite.
- For now it opens with `?view` (the active tournament) or `?view=<id>`, in the same browser. Cloud saving will replace this with a public link per tournament.

## Organiser login

- Cloudflare Access (Zero Trust) protects `/manage/*` and `/api/manage/*` and only lets approved emails in (a one-time code by email). The list of approved emails lives in the Access policy in the Cloudflare dashboard, not in this repo.
- `worker/auth.js` checks the token Access attaches (`Cf-Access-Jwt-Assertion`) on every organiser request anyway: RS256 signature against the team's published keys (cached, refetched when a key rotates), issuer (`ACCESS_TEAM_DOMAIN`), audience (`ACCESS_AUD`, the app's AUD tag), expiry, and an email claim. Both values are in `wrangler.jsonc`; they aren't secrets. Empty values mean nobody is logged in.
- `GET /api/manage/me` answers `{ email }` or `{ email: null }`; the app asks once at start and shows "Organiser log in" or "Logged in as … · Log out" under the tournament list. "Log in" goes to `/api/manage/login` (Access shows its email-code page, then the Worker sends the browser home); "Log out" is Access's own `/cdn-cgi/access/logout`.
- Locally there is no Access: `DEV_ORGANISER_EMAIL` (in `.dev.vars` for `npm run dev`, or the environment for `node tools/serve.mjs`) logs you in, and only on `127.0.0.1` / `localhost`.

## Storage

- `localStorage` keys `ruedaBattle.tournaments` and `ruedaBattle.activeTournamentId`; names predate the rebattle rename and must stay.
- A `storage` event from another tab marks the open tournament as changed elsewhere; recording, renaming and undo are blocked until it is reloaded.
- Import: `Store.readFile` parses and validates; `app.js` asks before replacing a tournament with the same id.

## Hosting

- One Cloudflare Workers project: static assets from `public/` (docs, tests and tools are never served) plus `worker/index.js`, which runs only for `/api/*` (`run_worker_first`). For now it only answers `/api/health`; cloud saving adds the tournament API there.
- Unknown paths get `index.html` (`not_found_handling: "single-page-application"`), and `public/js/route.js` decides the screen: `/` is the app, `/t/<code>`, `/t/<code>/<rider>` and `/manage/<code>` are tournament links (shown as "not found" until cloud saving), anything else is "not found". That's why `index.html` uses absolute paths (`/js/…`).
- API responses set their own headers (`worker/index.js`); `_headers` only covers static files.
- Wrangler is a pinned dev dependency (`package.json` + `package-lock.json`), so local runs, CI and Cloudflare's build use the same version.
- Cloudflare's GitHub integration deploys `main` on every merge and builds a preview for each pull request.
- `public/_headers` sets the security headers and caching:
  - **CSP:** only the site's own files. No inline scripts or `<style>` tags; `style="…"` attributes are allowed because the UI sets widths and colours with them. A new outside source (analytics, a CDN, the future API on another host) needs adding to the CSP first.
  - **Caching:** fonts are cached for a year (rename a font file to change it), icons for a week. HTML, CSS and JS are always revalidated, so a deploy shows up at once.
- `public/manifest.webmanifest` lets phones install the app ("Add to Home Screen") in standalone mode with the "r" icon.
