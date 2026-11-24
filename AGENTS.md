# AGENTS.md

rebattle is a static, no-build tournament manager for head-to-head double elimination (Winners + Losers bracket, crossover Final 4). Plain HTML/CSS/JS, saved in the browser.

Keep this file short. Detailed context lives in `docs/`; read the relevant doc before changing an area, and update it in the same change when behaviour or structure changes.

## Read first

- `docs/architecture.md`: modules, data model, bracket rules, rendering, replay video
- `docs/brand.md`: logo, colours, type, wording
- `docs/adr/`: why it's built this way (no framework, the browser as authority, Durable Objects, the Losers draw, Access, the old storage keys); a change against one supersedes it with a new record
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
- Every task has a GitHub issue (create one first if it's missing), in the format in CONTRIBUTING.md ("Issues and pull requests": What and why, Done when, optional Blast radius and Parent); its PR has a Conventional Commit title and says `Closes #n`, one issue per PR (`.github/workflows/format.yml` checks both). Multi-PR work: a parent issue with a sub-issue per step; the parent closes itself when the last one closes (CONTRIBUTING.md). No roadmap in the docs: planned work is the issue list.
- Online tournaments: the browser sends whole snapshots with `baseVersion`; the Worker checks login, same origin, size, `validateTournament` and ownership on every write. Keep owner emails out of anything public (`/api/t/*` and the live feed).
- Conventional Commits; branch + PR, never commit straight to `main`.
- One feature or fix per PR, each branched from `main` and mergeable on its own; split multi-part requests (CONTRIBUTING.md).

## Code review

Claude reviews each pull request when it's opened or marked ready (`.github/workflows/claude-review.yml`); `@claude review` in a comment asks for another pass (only the owner, members and collaborators can start it; fork pull requests get no automatic review). When reviewing, look first at what CI can't see:

- **Outside text:** a user-supplied string (names, titles, codes, imported files) reaching HTML without `escapeHtml`; an inline handler instead of `data-action`.
- **Read-only view:** a new entry in `VIEW_ACTIONS` that changes data.
- **The engine:** `public/js/engine/` touching the DOM or storage, or importing anything.
- **The Worker:** a write path missing a check (login, same origin, size, `validateTournament`, ownership, `baseVersion`); an owner email in `/api/t/*`, the public list or the live feed.
- **Saved data:** a renamed `ruedaBattle.*` key, or a new key not under `rebattle.*`; a change to the tournament format without a `!` and a note on existing data.
- **Dependencies:** a runtime npm dependency, a CDN, or a vendored file that is modified or not noted in `docs/architecture.md`.
- **Tests:** an engine or Worker change without a test that fails without it.
- **No personal data or secrets** in code, tests, docs or examples (real riders' names, emails other than `@example.com`).

Skip what the tests, the smoke test, the Worker build and the format check already catch. The summary is a checklist of these points and CONTRIBUTING.md's rules, `[x]` when fine and `[ ]` with what needs attention (leaving out what doesn't apply), then the verdict. If nothing important turns up, keep it short.
