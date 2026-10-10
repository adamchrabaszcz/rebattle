# Architecture

Static app, all served files in `public/`: `public/index.html` loads five plain scripts in order. Each attaches one global; there is no module system yet (planned, see the README roadmap).

| Script | Global | Role |
| --- | --- | --- |
| `public/js/bracket.js` | `Bracket` | Engine. Pure functions over a tournament object; no DOM, no storage |
| `public/js/storage.js` | `Store` | localStorage persistence, JSON export, import validation |
| `public/js/ui.js` | `UI` | Builds every screen as an HTML string; draws SVG connector lines after render |
| `public/js/replay.js` | `Replay` | Canvas replay video: timeline, drawing, player, export |
| `public/js/app.js` | – | Owns state, handles every click (`data-action` delegation), calls `UI.render` |

Flow: a click → `app.js` mutates `state` (via `Bracket` for results) → `Store.upsert` → `UI.render(container, state)` re-renders the whole screen. Undo keeps up to 20 full JSON snapshots of the tournament.

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

## Rendering (`ui.js`)

- HTML strings; every user string through `escapeHtml`.
- Bracket columns share one width on desktop (`--col-w`, set by `syncColumns`). Connector lines are an SVG overlay measured from the rendered cards (`drawConnectors`), with small hops where lines cross.
- The Losers bracket is random, so `lbLayout` orders each column by the average position of where its riders came from (barycenter) to keep lines tidy.
- Hovering a rider traces their whole path (`data-cid` on slots and edges).
- Phones (≤700px) switch to one round at a time with tabs; lines are replaced by "→ R3" tags.

## Replay video (`replay.js`)

- `buildTimeline(tournament, focus)` makes the scene list: intro, rounds (WB R1, WB R2, then LB/WB alternating), the semis crossover, semifinals, finals, podium. With `focus`, it builds one rider's journey instead.
- `drawFrame(ctx, timeline, t)` is a pure function of time, so playback, scrubbing and recording all give identical frames (confetti uses a seeded random).
- 1080×1920 canvas, exported with `MediaRecorder` in real time (mp4 where supported, otherwise webm). Drawing and recording wait for the bundled fonts to load.
- Losers rounds open with a short name shuffle ("random draw"); timing constants are at the top of the file.

## Storage

- `localStorage` keys `ruedaBattle.tournaments` and `ruedaBattle.activeTournamentId`; names predate the rebattle rename and must stay.
- A `storage` event from another tab marks the open tournament as changed elsewhere; recording, renaming and undo are blocked until it is reloaded.
- Import: `Store.readFile` parses and validates; `app.js` asks before replacing a tournament with the same id.

## Hosting

- Cloudflare Workers, static assets only: `wrangler.jsonc` publishes `public/`, so docs, tests and tools are never served.
- Cloudflare's GitHub integration deploys `main` on every merge and builds a preview for each pull request.
- The planned cloud saving (one Durable Object per tournament) will add a Worker script to the same project.
- `public/_headers` sets the security headers and caching:
  - **CSP:** only the site's own files. No inline scripts or `<style>` tags; `style="…"` attributes are allowed because the UI sets widths and colours with them. A new outside source (analytics, a CDN, the future API on another host) needs adding to the CSP first.
  - **Caching:** fonts are cached for a year (rename a font file to change it), icons for a week. HTML, CSS and JS are always revalidated, so a deploy shows up at once.
- `public/manifest.webmanifest` lets phones install the app ("Add to Home Screen") in standalone mode with the "r" icon.
