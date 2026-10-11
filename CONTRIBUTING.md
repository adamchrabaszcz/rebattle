# Contributing

## Workflow

1. Branch from `main`: `<type>/<short-topic>`, e.g. `feat/follow-me-card`, `fix/lb-final-detection`.
2. Make the change, keeping it focused on one thing.
3. Run the checks (below) and look at the change in a browser, on desktop and phone width.
4. Open a pull request into `main`. CI must be green before merging.

## Commits: Conventional Commits

Format: `<type>(<optional scope>): <summary>`, summary in the imperative, lowercase, no full stop.

| Type | For |
| --- | --- |
| `feat` | a new feature people can see or use |
| `fix` | a bug fix |
| `docs` | documentation only |
| `style` | formatting, no behaviour change |
| `refactor` | code change that neither fixes a bug nor adds a feature |
| `perf` | performance |
| `test` | adding or fixing tests |
| `build` / `ci` | tooling, GitHub Actions, deploy config |
| `chore` | anything else that doesn't touch the app |

Scopes used in this repo: `bracket`, `ui`, `replay`, `storage`, `app`, `brand`, `icons`.

Examples:

```
feat(replay): shuffle names in Losers-bracket rounds
fix(storage): ask before replacing a tournament on import
docs: add architecture notes
```

Breaking changes (e.g. a change to the saved tournament format) get a `!` after the type and a `BREAKING CHANGE:` footer explaining what happens to existing data.

## Checks

```sh
node --test                       # engine + import tests
node tests/browser/smoke.mjs      # plays the app in headless Chrome under the real CSP
find public/js -name '*.js' -print0 | xargs -0 -n1 node --check   # every module parses
npm ci && npx wrangler deploy --dry-run                        # the Worker builds (pinned wrangler)
```

## Code conventions

- No build step and no runtime dependencies. Native ES modules, readable as shipped; the root `package.json` only marks them as modules for Node.
- `public/js/engine/` is pure logic: no DOM, no storage, imports nothing from `ui/`, `replay/` or `store/`. Engine changes need a test in `tests/`.
- Screens are built as HTML strings in `public/js/ui/`; every user-supplied string goes through `escapeHtml`. Views get their data through `state` and never read storage.
- One job per module; keep files under ~350 lines (the engine excepted). The module map is in `docs/architecture.md`.
- Interaction goes through `data-action` attributes handled in `public/js/app.js`; no inline event handlers.
- Comments explain *why*, not *what*.
- The saved-data keys (`ruedaBattle.*`) predate the rename and stay as they are.
- Brand rules (logo, colours, fonts, wording) are in `docs/brand.md`.

## Docs

Context belongs in `docs/`, not in long comments or in `AGENTS.md`. When a change alters behaviour, the data model or structure, update `docs/architecture.md` (or `docs/brand.md`) in the same pull request.
