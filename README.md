# rebattle

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/brand/logos/full-on-dark.svg">
  <img alt="drop. bounceback. rebattle." src="public/brand/logos/full-on-light.svg" width="560">
</picture>

[![test](https://github.com/adamchrabaszcz/rebattle/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/adamchrabaszcz/rebattle/actions/workflows/test.yml) [![codecov](https://codecov.io/gh/adamchrabaszcz/rebattle/graph/badge.svg)](https://codecov.io/gh/adamchrabaszcz/rebattle)

A tournament manager for head-to-head double-elimination events, built for a wakeboard competition but sport-agnostic. Riders who lose once drop to the Losers bracket for a second chance; the top two of each bracket cross over into a Final 4.

## Format

- **Winners bracket**: a classic knockout, filled up to a power of two with random byes.
- **Losers bracket**: lose once in the Winners bracket and you drop here; lose again and you're out. Each round is a fresh random draw that mixes survivors with the latest drop-ins. It opens once Winners rounds 1 and 2 are done.
- **Final 4 (crossover)**: Semifinal 1 = WB 1st v LB 2nd, Semifinal 2 = WB 2nd v LB 1st. Semifinal winners ride the Grand final, the others the Small final.
- Heats are single run or best of 3. Every field size plays exactly 2N heats.

## Features

**For organisers**

- **Run it from your phone:** setup with a time estimate and a random draw, then one tap per heat to record the winner. Single runs or best of 3. Undo, and rename riders or the tournament at any time.
- **The bracket:** connector lines, a rider's whole path on hover, drop-in markers, shared places for riders out in the same round. On phones, one round at a time with tabs and swipes.
- **Without an account,** everything is saved in this browser: export and import JSON to back up or move it. `?view` opens a read-only copy that follows the results, e.g. on a second screen at the venue.
- **With an account** (approved organisers, Cloudflare Access login): tournaments are saved online and open from any device at `/manage/<code>`. They keep working when the venue wifi drops and upload when it's back, and if two devices changed the same tournament you pick which version to keep. Local tournaments can be moved online.
- **Who can find it:** an online tournament is unlisted by default (only people with the link), or listed on [rebattle.app/competitions](https://rebattle.app/competitions).

**For everyone else** (online tournaments, no login)

- **A live page** at `rebattle.app/t/<code>`: the bracket, read-only, updating by itself as heats are recorded.
- **A page for each rider:** where they stand, their next heat and opponent, the heats they've ridden.
- **Sharing:** the link, the phone's share sheet, a QR code and a printable A4 poster.
- **Replay video:** a vertical (1080×1920) animated recap of the whole event, or one rider's journey, saved as a video file to post. First names only, unless "Full names" is ticked.
- **Follow a competition** by the code on its poster, or browse the listed ones. [rebattle.app/brand](https://rebattle.app/brand) has the logo and an Instagram kit for events running on rebattle.

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
node --test                    # engine, Worker and tools, in Node
node tests/browser/smoke.mjs   # the real app in headless Chrome
```

- `node --test` plays thousands of random tournaments (4–40 riders, both formats) and checks the bracket invariants, the import checks, the Losers-bracket layout and the replay timeline (every heat shown once, in order; a rider's journey shows exactly their heats). It also runs the Worker against in-memory stores: the organiser login, saving online, the public pages and live feed, the competitions list, plus the addresses, SEO files, brand page and release tools.
- The smoke test serves the app with the same headers as Cloudflare (CSP included) and the Worker on in-memory stores, then clicks through it in headless Chrome. It covers a full tournament (setup, draw, every heat, undo, rename, export and import), the replay video, the read-only view, saving online (offline, and a conflict between two devices), the public pages with live updates, sharing, the competitions list, the introduction and phone width. Any page error, console error, CSP violation or failed request fails it.

Both need only Node 22 or newer; the smoke test also needs Chrome (set `CHROME_PATH` if it isn't found). Neither needs `npm install`. Both run on every push via GitHub Actions, along with a Wrangler dry run that checks the Worker builds.

Coverage counts the lines both runs execute, in every module under `public/js` and `worker/` (also those no test loads). CI puts the per-file table in the run's summary and uploads the report to [Codecov](https://codecov.io), which comments coverage changes on pull requests. Locally:

```sh
NODE_V8_COVERAGE=coverage/node node --test
NODE_V8_COVERAGE=coverage/node SMOKE_COVERAGE=coverage/browser node tests/browser/smoke.mjs
node tools/coverage.mjs coverage    # table, coverage/lcov.info
```

## Deploy

Live at **https://rebattle.app** on Cloudflare Workers: static assets from `public/` plus a small Worker for `/api/*` (`wrangler.jsonc`). Cloudflare builds from GitHub: every merge to `main` goes live, and pull requests get a preview URL. There is no build step; the deploy command is `npx wrangler deploy`, using the pinned Wrangler from `package-lock.json`. Once CI passes on `main`, a merge that ships a change also gets a version tag and a [GitHub release](https://github.com/adamchrabaszcz/rebattle/releases) (`.github/workflows/release.yml`): the version comes from the Conventional Commits since the last release.

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
| `public/brand/` | The logo files and the brand kit zip, offered on [rebattle.app/brand](https://rebattle.app/brand); generated by `tools/make-logo.py`, `tools/make-icons.py` and `tools/make-brand-kit.py` |
| `tools/` | The local server with Cloudflare's headers and in-memory stores (`serve.mjs`), the logo, icon and brand kit generators (`make-*.py`), and the CI scripts for coverage, the format check and releases |
| `tests/` | `node --test` suite; `tests/browser/` the headless-Chrome smoke test |
| `wrangler.jsonc` | Cloudflare deploy config |
| `worker/` | The Worker behind `/api/*` |
| `package.json` | Dev tools (pinned Wrangler) and scripts; marks `.js` as ES modules for Node |

## Docs

- [`docs/architecture.md`](docs/architecture.md): modules, data model, bracket rules, rendering, replay video
- [`docs/brand.md`](docs/brand.md): logo, colours, type, wording
- [`CONTRIBUTING.md`](CONTRIBUTING.md): workflow and Conventional Commits
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md): how we treat each other
- [`AGENTS.md`](AGENTS.md): short brief for coding agents
- Planned work and ideas: [GitHub issues](https://github.com/adamchrabaszcz/rebattle/issues)
- Security problems: [`SECURITY.md`](SECURITY.md) (report privately, not in issues)

## Licence

The code is under the [MIT licence](LICENSE): use it, run it, change it, and contributions are welcome under the same terms ([`CONTRIBUTING.md`](CONTRIBUTING.md)).

The **rebattle** name and logo (`public/brand/`, `public/icons/`) are not covered by the licence: they stay reserved, so a copy you run should have its own name and look. The bundled fonts keep their own licence (SIL OFL, `public/fonts/OFL.txt`), and the files in `public/js/vendor/` theirs (MIT, noted in `docs/architecture.md`).

