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
node --test                                  # engine + import tests
for f in public/js/*.js; do node --check "$f"; done # every script parses
```

## Code conventions

- No build step and no runtime dependencies. Plain scripts, readable as shipped.
- `public/js/bracket.js` is pure logic: no DOM, no storage. Engine changes need a test in `tests/`.
- Screens are built as HTML strings in `public/js/ui.js`; every user-supplied string goes through `escapeHtml`.
- Interaction goes through `data-action` attributes handled in `public/js/app.js`; no inline event handlers.
- Comments explain *why*, not *what*.
- The saved-data keys (`ruedaBattle.*`) predate the rename and stay as they are.
- Brand rules (logo, colours, fonts, wording) are in `docs/brand.md`.

## Docs

Context belongs in `docs/`, not in long comments or in `AGENTS.md`. When a change alters behaviour, the data model or structure, update `docs/architecture.md` (or `docs/brand.md`) in the same pull request.
