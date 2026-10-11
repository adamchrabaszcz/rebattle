# rebattle

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg">
  <img alt="drop. bounceback. rebattle." src="docs/logo-light.svg" width="560">
</picture>

A tournament manager for head-to-head double-elimination events, built for a wakeboard competition but sport-agnostic. Riders who lose once drop to the Losers bracket for a second chance; the top two of each bracket cross over into a Final 4.

## Format

- **Winners bracket**: a classic knockout, filled up to a power of two with random byes.
- **Losers bracket**: lose once in the Winners bracket and you drop here; lose again and you're out. Each round is a fresh random draw that mixes survivors with the latest drop-ins. It opens once Winners rounds 1 and 2 are done.
- **Final 4 (crossover)**: Semifinal 1 = WB 1st v LB 2nd, Semifinal 2 = WB 2nd v LB 1st. Semifinal winners ride the Grand final, the others the Small final.
- Heats are single run or best of 3. Every field size plays exactly 2N heats.

## Features

- Setup with a time estimate, random draw, then one tap per heat to record the winner. Undo, rename riders or the tournament at any time.
- Live bracket view: connector lines, path highlighting on hover, drop-in markers, shared places for riders out in the same round, a legend. On phones, brackets switch to round tabs.
- **Replay video**: a vertical (1080×1920) animated recap of the whole event, or one rider's journey, exported as a video file and shareable from a phone.
- **View-only mode**: `?view` opens the tournament read-only and follows results as they are recorded in another tab, e.g. on a second screen at the venue. A public link for spectators comes with cloud saving.
- Everything is saved in the browser; export/import JSON to back up or move to another device.
- **Online tournaments** for logged-in organisers (Cloudflare Access, approved emails): saved on the server, open from any device at `/manage/<code>`, keep working offline and upload when back, and ask which version to keep if two devices changed the same tournament. Local tournaments can be moved online.

## Run it

No build step and no dependencies, just Node (22 or newer):

```sh
node tools/serve.mjs   # or: npm start
# open http://127.0.0.1:8787
```

`tools/serve.mjs` serves `public/` with the same headers as Cloudflare (CSP included), so what works locally works on rebattle.app. For the full stack including the Worker (`/api/*`), install the pinned dev tools once and run Wrangler:

```sh
npm install            # dev tools only (wrangler); the site itself has no dependencies
npm run dev            # http://127.0.0.1:8787 with the Worker
```

Any static server works for the app alone. Opening `index.html` straight from the disk doesn't, because browsers don't load ES modules from `file://`. Saved tournaments are kept per address, so use Export/Import to move them between copies.

## Tests

```sh
node --test                    # bracket engine + import checks
node tests/browser/smoke.mjs   # the real app in headless Chrome
```

- `node --test` plays thousands of random tournaments (4–40 riders, both formats) and checks the bracket invariants, the import checks, the Losers-bracket layout, and the replay timeline (every heat shown once, in order; a rider's journey shows exactly their heats).
- The smoke test serves `public/` with the same headers as Cloudflare (CSP included) and clicks through the app in headless Chrome: setup, draw, a full tournament, undo, rename, export, import, the replay video, a 40-rider bracket and phone width. Any page error, CSP violation or failed request fails it. Set `CHROME_PATH` if Chrome isn't found.

Both run on every push via GitHub Actions, along with a Wrangler dry run that checks the Worker builds. Neither test needs anything installed.

## Deploy

Live at **https://rebattle.app** on Cloudflare Workers: static assets from `public/` plus a small Worker for `/api/*` (`wrangler.jsonc`). Cloudflare builds from GitHub: every merge to `main` goes live, and pull requests get a preview URL. There is no build step; the deploy command is `npx wrangler deploy`, using the pinned Wrangler from `package-lock.json`.

Saved tournaments live in each browser per address, so data on `127.0.0.1` doesn't show up on rebattle.app; move it with Export/Import JSON.

## Project layout

| Path | What |
| --- | --- |
| `public/` | Everything the site serves; nothing else is published |
| `public/index.html`, `public/styles.css` | The page and all styles |
| `public/js/app.js` | App state and all click handling (the entry module) |
| `public/js/engine/` | Bracket engine and Losers-bracket layout: pure logic, no DOM |
| `public/js/store/` | Saving in the browser, JSON export, and import validation |
| `public/js/ui/` | The screens as HTML, connector lines, tabs and path highlighting |
| `public/js/replay/` | The replay video: scene timeline, canvas drawing, player and video export |
| `public/fonts/` | Funnel Display + Funnel Sans, bundled so the app works offline (SIL OFL, see `public/fonts/OFL.txt`) |
| `public/_headers` | Security headers (CSP) and caching on Cloudflare |
| `public/manifest.webmanifest` | Home-screen install (name, colours, icons) |
| `public/icons/` | Favicon and home-screen icons, generated by `tools/make-icons.py` |
| `tools/serve.mjs` | Local server with Cloudflare's headers |
| `tests/` | `node --test` suite; `tests/browser/` the headless-Chrome smoke test |
| `wrangler.jsonc` | Cloudflare deploy config |
| `worker/` | The Worker behind `/api/*` |
| `package.json` | Dev tools (pinned Wrangler) and scripts; marks `.js` as ES modules for Node |

## Docs

- [`docs/architecture.md`](docs/architecture.md): modules, data model, bracket rules, rendering, replay video
- [`docs/brand.md`](docs/brand.md): logo, colours, type, wording
- [`CONTRIBUTING.md`](CONTRIBUTING.md): workflow and Conventional Commits
- [`AGENTS.md`](AGENTS.md): short brief for coding agents

## Roadmap

1. ~~Hosting on Cloudflare with a custom domain~~ (done: rebattle.app).
2. ~~Cloud saving: one Durable Object per tournament, organiser login via Cloudflare Access, offline-tolerant saves~~ (done).
3. ~~Public live link (`/t/<code>`), rider pages (`/t/<code>/<rider>`), share button, QR code and poster, the address at the end of the replay video, an introduction (`/about`)~~ (done). Next: how long until a rider's heat.
4. ~~Smaller modules and a read-only viewer mode~~ (done).
