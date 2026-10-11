# Architecture

Static app, all served files in `public/`. `public/index.html` loads one ES module, `js/app.js`, which imports the rest (with `modulepreload` hints so they download in parallel). No globals, no build step. Modules don't load over `file://`, so run it from a server.

All paths below are under `public/js/`.

| Module | Role |
| --- | --- |
| `app.js` | Entry. Owns state, handles every click (`data-action` delegation), calls `render` |
| `engine/bracket.js` | Engine (`Bracket`). Pure functions over a tournament object; no DOM, no storage |
| `engine/lb-layout.js` | Pure: Losers-bracket display order and lines, shared by the bracket view and the replay |
| `engine/validate.js` | Pure: the shape and safety check for imported files and every snapshot the Worker accepts |
| `engine/slug.js` | Pure: address parts: tournament codes from names, rider links from ids |
| `engine/rider.js` | Pure: one rider's stage, heats ridden and next heat, for their page |
| `store/local.js` | `Store`: localStorage persistence, JSON export, import validation |
| `store/cloud.js` | Online tournaments for the organiser: the API, this device's copy, the outbox |
| `store/live.js` | Public pages: first read, then the live feed (WebSocket, polling fallback) |
| `ui/index.js` | `render(container, state)`: picks the screen, binds tabs, hover tracing and resize |
| `ui/html.js` | `escapeHtml`, `fmtDuration`, the logo, the "r" mark, the draw icon |
| `ui/home.js`, `ui/setup.js` | Tournament list; setup form, time estimate, names screen |
| `ui/intro.js` | The introduction (`/about`, and `/` for a new visitor): Follow a competition, how it works, start |
| `ui/bracket-screen.js` | The tournament screen: header, toolbar, rename panel, standings, riders list (public page), legend |
| `ui/rider.js` | A rider's page: stage, next heat, heats ridden, journey video |
| `ui/share.js` | The share panel (link, QR code) and the printable poster |
| `ui/not-found.js` | "Nothing here", offline and loading screens |
| `ui/brackets.js`, `ui/cards.js` | Winners, Losers and Final 4 columns (with phone tabs); match cards and their tags |
| `ui/connectors.js` | Connector lines and path tracing, measured from the rendered cards |
| `ui/replay-screen.js` | The replay screen's HTML; `replay/player.js` drives it |
| `replay/theme.js` | Canvas size, timing constants, fonts (`FONTS_READY`), colours |
| `replay/timeline.js` | `buildTimeline`: the scene list. Pure, tested in Node |
| `replay/draw.js` | Canvas primitives: text, logo, tags, medals, icons |
| `replay/rounds.js`, `replay/finale.js` | Scenes: intro, rounds, semis crossover; podium, journey, result, confetti |
| `replay/frame.js` | `drawFrame(ctx, timeline, t)`, scene dots |
| `replay/player.js` | Playback, scrubbing, recording and sharing |
| `vendor/qrcode.js` | QR code encoder, third-party (see Public pages) |

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

- `buildTimeline(tournament, focus, site)` makes the scene list: intro, rounds (WB R1, WB R2, then LB/WB alternating), the semis crossover, semifinals, finals, podium. With `focus`, it builds one rider's journey instead.
- The last scene ends with the address (`site` = `{ host, code }`, the host being the page's own): "Results: rebattle.app/t/<code>" on the podium, "Dora’s journey: rebattle.app/t/<code>/<rider>" on a rider's result. A local tournament has no public page, so it shows just the host. With the address, the podium list keeps 11 rows a column to leave it room.
- `drawFrame(ctx, timeline, t)` is a pure function of time, so playback, scrubbing and recording all give identical frames (confetti uses a seeded random).
- 1080×1920 canvas, exported with `MediaRecorder` in real time (mp4 where supported, otherwise webm). Drawing and recording wait for the bundled fonts to load.
- Losers rounds open with a short name shuffle ("random draw"); timing constants are in `replay/theme.js`.

## Read-only view

- `state.readOnly` renders the tournament screen without anything that changes data: no Won buttons, Undo, Edit names, Export/Import, New/Delete, and no rename panel. Up next, the brackets, tracing, standings and the replay (including its video download) stay.
- `app.js` also refuses every click whose action isn't in `VIEW_ACTIONS` (an allowlist), so a new organiser action is blocked in the view unless it is added there on purpose.
- The view follows changes made in another tab (the `storage` event) instead of showing the "updated elsewhere" warning, since it has nothing to overwrite.
- Local tournaments open it with `?view` (the active tournament) or `?view=<id>`, in the same browser: a second screen at a venue without internet. Online tournaments have public pages instead (below).

## Organiser login

- Cloudflare Access (Zero Trust) protects `/manage/*` and `/api/manage/*` and only lets approved emails in (a one-time code by email). The list of approved emails lives in the Access policy in the Cloudflare dashboard, not in this repo.
- `worker/auth.js` checks the token Access attaches (`Cf-Access-Jwt-Assertion`) on every organiser request anyway: RS256 signature against the team's published keys (cached, refetched when a key rotates), issuer (`ACCESS_TEAM_DOMAIN`), audience (`ACCESS_AUD`, the app's AUD tag), expiry, and an email claim. Both values are in `wrangler.jsonc`; they aren't secrets. Empty values mean nobody is logged in.
- `GET /api/manage/me` answers `{ email }` or `{ email: null }`; the app asks once at start and shows "Organiser log in" or "Logged in as … · Log out" under the tournament list. "Log in" goes to `/api/manage/login` (Access shows its email-code page, then the Worker sends the browser home); "Log out" is Access's own `/cdn-cgi/access/logout`.
- Locally there is no Access: `DEV_ORGANISER_EMAIL` (in `.dev.vars` for `npm run dev`, or the environment for `node tools/serve.mjs`) logs you in, and only on `127.0.0.1` / `localhost`.

## Online tournaments

- **Where:** a logged-in organiser's tournaments live on Cloudflare, one Durable Object per tournament (`TournamentStore`, addressed by its code) and one per organiser (`OrganiserList`, by email, the list for the home screen). `worker/stores.js`; no region restriction, so each lives near where it was created. Local tournaments (no account, this browser only) still work exactly as before.
- **Codes:** `worker/codes.js`: a short form of the name plus 4 random characters (`cable-open-x7k2`, no 0/o/1/l); the store refuses a taken code and the Worker draws again.
- **API:** `worker/manage.js`, all under `/api/manage/` (behind Access): list, create, load, save, delete. Every write must be same-origin (`Origin` header), JSON, at most 512 KB, and pass `engine/validate.js` (the import check); only owners can load or change a tournament (anyone else gets 404). Owner emails never leave the server.
- **Saving:** the organiser's browser stays the authority (it runs the engine, including the random draw) and sends whole snapshots with the version they were based on. The store accepts only if that is still the current version (compare-and-swap), keeps the last 20 versions, and otherwise answers 409 with its copy.
- **Offline:** `store/cloud.js` writes every change to this device first (`rebattle.online` in localStorage), then sends the latest snapshot per tournament (an outbox of one slot each), retrying every 10 s and when the browser comes back online. The header shows saved online / saving / offline, changes waiting / changed on another device.
- **Conflicts:** when another device saved in between, recording pauses and a banner offers "Use the other version" or "Keep mine" (which replaces the server copy after a confirm).
- **Screens:** `/manage/<code>` opens an online tournament (this device's copy first, then the server's). Home lists "Online" and "In this browser only", with "Move online" (moves: removed from this browser once it is safely online) and Delete. While logged in, new tournaments are online unless "Keep in this browser only" is ticked; if saving online fails, the new tournament is kept in this browser instead.
- **Locally:** `node tools/serve.mjs` runs the same Worker code against in-memory stores (`tools/fake-do.mjs`, lost on restart); `npm run dev` runs the real Durable Objects. Tests use the in-memory ones.

## Addresses and returning visitors

- **`/`** takes you back to the last tournament opened on this device if it is still running (a local one, or an online one: then `/manage/<code>`). Otherwise it shows the list, or the introduction in a browser with nothing saved. An organiser logged in on a new device gets their list instead of the introduction once the login is known.
- **The address follows the screen** (`syncAddress` in `app.js`): the list is `/tournaments`, a local tournament `/`, so a reload lands where you were. The logo goes to the list (`/tournaments`); on public pages and "Nothing here" it goes to `/`.
- **`/about`**: the introduction for everyone, linked from the list and "Nothing here". "Follow a competition" takes a typed code or a pasted link (`followPath` in `route.js`) to the public page.

## Public pages

- **`/t/<code>`:** the read-only tournament screen for anyone with the link, no login. A "live" dot in the header; a Riders list linking to each rider's page; Share; the replay and journeys once it's over.
- **`/t/<code>/<rider>`:** one rider's page (`ui/rider.js`, `engine/rider.js`): where they stand (unbeaten / Losers bracket / Final 4 / out / place), their next heat and opponent (or "waiting for the draw"), the heats they rode, and "Watch my journey" at the end.
- **API (`worker/public.js`, no login):** `GET /api/t/<code>` returns `{ code, version, updatedAt, tournament }`; `GET /api/t/<code>/live` is a WebSocket into the tournament's Durable Object, which sends the snapshot on connect and after every save, and `{ type: 'deleted' }` when it is deleted. Hibernation API, so idle viewers cost nothing; viewers can't send anything. Never the owners' emails.
- **In the browser (`store/live.js`):** one read for the first paint, then the socket. It reconnects with backoff (and at once when a phone returns to the page); after 3 attempts that never open, it reads every 20 s instead. Versions only move forward.
- **Rider links:** a 6-character code worked out from the tournament and competitor ids (`/t/cable-open-x7k2/k7m2qp`, FNV-1a hash, same alphabet as codes), so no name is in an address and fixing a typo never breaks a shared link. Nothing is stored: every browser works out the same codes. Not a secret (anyone with the tournament can work them out); a clash between two riders gets `-2`.
- **Sharing (`ui/share.js`):** the link, Copy, the phone's share sheet where there is one, a QR code (inline SVG, black on white with a quiet zone), and for the whole tournament a poster that only shows when printing (A4: name, QR code, "Follow live at …"). Both the organiser screen and the public pages have it.
- **QR encoder:** `public/js/vendor/qrcode.js` is `dist/qrcode.mjs` from `qrcode-generator` 2.0.4 by Kazuhiko Arase (MIT, licence header kept), unmodified (sha256 `ea91d7118a5395289170da848b7c6758b996163bfbccf312591ab65a4911b7c0`). Update by replacing the file with a newer release's.
- **Locally:** `tools/serve.mjs` answers the live feed with a minimal WebSocket (`tools/ws.mjs`) that the in-memory store gets directly.
- **CSP:** `connect-src 'self'` covers the same-origin socket. A browser that doesn't apply `'self'` to WebSockets falls back to reading every 20 s.

## Storage

- `localStorage` keys `ruedaBattle.tournaments` and `ruedaBattle.activeTournamentId`; names predate the rebattle rename and must stay. `rebattle.online` holds this device's copies of online tournaments; `rebattle.activeOnline` the online tournament last opened here, when that was the last one (opening a local one clears it, and the other way round).
- A `storage` event from another tab marks the open tournament as changed elsewhere; recording, renaming and undo are blocked until it is reloaded.
- Import: `Store.readFile` parses and validates; `app.js` asks before replacing a tournament with the same id.

## Hosting

- One Cloudflare Workers project: static assets from `public/` (docs, tests and tools are never served) plus `worker/index.js`, which runs only for `/api/*` (`run_worker_first`): health, the public API and the organiser API.
- Unknown paths get `index.html` (`not_found_handling: "single-page-application"`), and `public/js/route.js` decides the screen: `/t/<code>` and `/t/<code>/<rider>` are the public pages, `/manage/<code>` is the organiser's, `/tournaments` the list, `/about` the introduction, anything else is "not found". That's why `index.html` uses absolute paths (`/js/…`).
- API responses set their own headers (`worker/index.js`); `_headers` only covers static files.
- Wrangler is a pinned dev dependency (`package.json` + `package-lock.json`), so local runs, CI and Cloudflare's build use the same version.
- Cloudflare's GitHub integration deploys `main` on every merge and builds a preview for each pull request.
- `public/_headers` sets the security headers and caching:
  - **CSP:** only the site's own files. No inline scripts or `<style>` tags; `style="…"` attributes are allowed because the UI sets widths and colours with them. A new outside source (analytics, a CDN, the future API on another host) needs adding to the CSP first.
  - **Caching:** fonts are cached for a year (rename a font file to change it), icons for a week. HTML, CSS and JS are always revalidated, so a deploy shows up at once.
- `public/manifest.webmanifest` lets phones install the app ("Add to Home Screen") in standalone mode with the "r" icon.
