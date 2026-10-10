# AGENTS.md

rebattle is a static, no-build tournament manager for head-to-head double elimination (Winners + Losers bracket, crossover Final 4). Plain HTML/CSS/JS, saved in the browser.

Keep this file short. Detailed context lives in `docs/`; read the relevant doc before changing an area, and update it in the same change when behaviour or structure changes.

## Read first

- `docs/architecture.md`: modules, data model, bracket rules, rendering, replay video
- `docs/brand.md`: logo, colours, type, wording
- `CONTRIBUTING.md`: workflow, commits, checks

## Commands

- Run: `python3 -m http.server 8787`, open http://127.0.0.1:8787
- Test: `node --test` (must pass; CI runs it on every push)

## Rules

- No build step, no runtime dependencies, no framework.
- `js/bracket.js` stays pure logic (no DOM); cover engine changes with tests in `tests/`.
- Every user-supplied string goes through `escapeHtml` before it reaches HTML.
- Clicks go through `data-action` handled in `js/app.js`; no inline handlers.
- Don't rename the `ruedaBattle.*` localStorage keys (existing saved data).
- Conventional Commits; branch + PR, never commit straight to `main`.
