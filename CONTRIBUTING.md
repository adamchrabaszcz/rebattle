# Contributing

Contributions are welcome: bug reports, fixes, refactors, ideas. Start with an issue (or pick an open one), then a pull request. By contributing you agree that your work is released under the project's [MIT licence](LICENSE). Security problems go through [`SECURITY.md`](SECURITY.md), not issues.

From a fork, the same rules apply; GitHub asks a maintainer to approve the checks on your first pull request.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Editors pick up the shared settings (UTF-8, LF, final newline, 2-space indent) from `.editorconfig`.

## Workflow

1. Branch from the latest `main`: `<type>/<short-topic>`, e.g. `feat/follow-me-card`, `fix/lb-final-detection`.
2. Make the change, keeping it focused on one thing.
3. Run the checks (below) and look at the change in a browser, on desktop and phone width.
4. Open a pull request into `main`. CI must be green before merging. Claude reviews it once it's opened or marked ready, with inline comments and a checklist (AGENTS.md, "Code review"); `@claude review` in a comment asks for another pass after new commits. The review advises; merging is the owner's decision.

### One feature or fix per pull request

- Each feature, fix or docs change gets its own branch and pull request, even when several are asked for at once. A request with three things is three pull requests.
- Keep them independent: each starts from `main`, not from another open branch, and can be merged in any order. Where two touch the same file, put their changes in different places (e.g. CSS next to the rules it extends, not all appended at the end).
- If `main` moves and a pull request conflicts, update it from `main` (or redo it on a fresh branch) rather than piling more onto it.
- Small means reviewable in one sitting: one behaviour, its tests and its docs.

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

## Planned work: GitHub issues

- The roadmap is the [issue list](https://github.com/adamchrabaszcz/rebattle/issues), not a section in the docs.
- Every task starts as an issue: a feature, a fix, a docs change. If you're asked for something that has no issue yet, open one first, in the format below.
- The pull request for it ends its description with `Closes #<issue>`, so merging closes the issue. Every pull request closes exactly one issue; `Part of #n` closes nothing, so don't rely on it.

### Issues and pull requests

**Issues** use one format. The issue forms (Feature, Bug, Docs or chore; there are no blank issues) write it; when you write the body yourself (`gh issue create --body`, the API), use the same headings:

```markdown
### What and why
What should change and why, in plain words. For a bug: what happens, what should, where, and how to see it.

### Done when
- [ ] A short checklist that says when it is finished

### Blast radius
Optional. What else it touches or could break, and who would notice (organisers, riders, viewers, saved data, the Worker, CI and releases).

### Parent
Optional. #41, when it is one step of bigger work (also add it as a sub-issue there).
```

- **Title:** plain words, no type prefix ("Video: encoding stalls in Safari").
- **Label:** `enhancement`, `bug`, `documentation` or `chore`.
- `.github/workflows/format.yml` checks new and edited issues. One without "What and why" or "Done when" gets the `needs-format` label and a comment, both gone once it is fixed.

**Pull requests** follow `.github/pull_request_template.md`: what and why, the checks you ran, and `Closes #<issue>`. The title is a Conventional Commit (`fix: the video saves in Safari`). The `format / pull-request` check fails without either, and it is required on `main`. The rules are in `tools/format-check.mjs`, tested in `tests/format-check.test.js`.
- **Work that takes several pull requests** is a parent issue with a **sub-issue per step** (GitHub's sub-issues: "Add sub-issue" on the parent, or `gh api -X POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<id>`). Each step's pull request closes its sub-issue, and `.github/workflows/issues.yml` closes the parent when its last sub-issue is closed. Steps that come up later become new sub-issues of the same parent.
- After a merge, check the issues it should have closed are closed.
- Ideas that aren't planned yet are issues too; close them as `not planned` if they're dropped.

## Releases

Every merge to `main` deploys. After CI passes there, `.github/workflows/release.yml` tags the commit and publishes a GitHub release with the merged pull requests as notes, if the merge shipped something. The version follows the commit types since the last release (`tools/release.mjs`): a breaking change (`feat!:` or a `BREAKING CHANGE:` footer) → major, `feat` → minor, `fix` / `perf` → patch. `docs`, `ci`, `chore`, `test`, `refactor`, `style` and `build` make no release. So the commit type matters: it decides the version. After a release, every pull request in it and every issue those closed get the milestone `vX.Y.Z` and a "Released in vX.Y.Z" comment (`tools/release-marks.mjs`), so an issue shows which version shipped it.

## Checks

```sh
node --test                       # engine + import tests
node tests/browser/smoke.mjs      # plays the app in headless Chrome under the real CSP
find public/js -name '*.js' -print0 | xargs -0 -n1 node --check   # every module parses
npm ci && npx wrangler deploy --dry-run                        # the Worker builds (pinned wrangler)
```

CI runs the same in `.github/workflows/`. Actions there are pinned to a full commit SHA with the version in a comment (`uses: actions/checkout@<sha> # v4.4.0`), because a tag can be moved to other code that would then run with the workflow's token and secrets. Pin a new action the same way; Dependabot (`.github/dependabot.yml`) proposes updates weekly as one `ci` pull request, and security fixes for the dev tools (wrangler and what it pulls in) as `build` pull requests. Dependabot writes its own titles ("Bump…") and descriptions; the format check skips its pull requests, and the title is renamed to the repo's style when merging (`ci: bump checkout to v7.0.1`), since the squash commit takes the title.

## Logging in locally

There's no Cloudflare Access on your machine. To see the app as a logged-in organiser, set `DEV_ORGANISER_EMAIL`:

```sh
DEV_ORGANISER_EMAIL=you@example.com node tools/serve.mjs
# or for npm run dev: put DEV_ORGANISER_EMAIL=you@example.com in .dev.vars (git-ignored)
```

It only works on `127.0.0.1` and `localhost`. Online tournaments then work too: in memory with `tools/serve.mjs` (gone when it stops), or with the real Durable Objects under `npm run dev` (kept in `.wrangler/`).

## Code conventions

- No build step and no npm runtime dependencies (third-party browser code only as unmodified files in `public/js/vendor/`). Native ES modules, readable as shipped; the root `package.json` only marks them as modules for Node.
- `public/js/engine/` is pure logic: no DOM, no storage, imports nothing from `ui/`, `replay/` or `store/`. Engine changes need a test in `tests/`.
- Screens are built as HTML strings in `public/js/ui/`; every user-supplied string goes through `escapeHtml`. Views get their data through `state` and never read storage.
- One job per module; keep files under ~350 lines (the engine excepted). The module map is in `docs/architecture.md`.
- Interaction goes through `data-action` attributes handled in `public/js/app.js`; no inline event handlers.
- Comments explain *why*, not *what*.
- The saved-data keys (`ruedaBattle.*`) predate the rename and stay as they are; new keys go under `rebattle.*`.
- Brand rules (logo, colours, fonts, wording) are in `docs/brand.md`.

## Docs

Context belongs in `docs/`, not in long comments or in `AGENTS.md`. When a change alters behaviour, the data model or structure, update `docs/architecture.md` (or `docs/brand.md`) in the same pull request.

Decisions that are costly to reverse, or that people will ask "why?" about, get a short record in [`docs/adr/`](docs/adr/README.md). A change that goes against an accepted record says so, and adds a new record that supersedes it.
