# 0002. No framework, no build step, no runtime dependencies

- Status: Accepted
- Date: 2026-10-10 (native ES modules since 2026-10-11)

## Context
rebattle was built for a wakeboard event and runs from the organiser's phone at the venue, where it has to keep going when the wifi drops. The app is small: a bracket engine, a dozen screens as HTML, a canvas video. A framework and a bundler would add a toolchain to install and keep updated, a build that can break, and code in the browser that isn't the code in the repository.

## Decision
Plain HTML, CSS and JavaScript as native ES modules, served exactly as they are in `public/`. No framework, no build step, no npm runtime dependencies. Dev tools only (Wrangler), pinned to an exact version. Third-party browser code only as unmodified files in `public/js/vendor/`, with source, version, licence and checksum noted in `docs/architecture.md`.

## Consequences
- What's in `public/` is what runs: readable as shipped, debuggable in any browser, deployed by copying.
- A strict Content Security Policy (only the site's own files, no inline scripts) is easy to keep, and the fonts are bundled, so the app works offline.
- Tests and the local server need only Node; nothing to install for a contributor.
- Screens are HTML strings, so every user string must go through `escapeHtml`, and clicks go through `data-action` handled in one place (`app.js`), since there's no framework doing either.
- No component model: keeping modules small (about 350 lines) is a rule we have to hold ourselves to.
- Opening `index.html` from disk doesn't work (browsers don't load modules from `file://`); a local server is needed.
