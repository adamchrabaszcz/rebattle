# 0007. Saved-data keys are `rebattle.*`, and aren't renamed once live

- Status: Accepted
- Date: 2026-11-24

## Context
Tournaments saved without an account exist only in that browser's localStorage. The first two keys were named before the rename to rebattle (`ruedaBattle.tournaments`, `ruedaBattle.activeTournamentId`); every key added later used `rebattle.*`. Renaming a key hides whatever a browser saved under the old name, and the server can't see local tournaments, so there's no telling whether anyone has one. In November 2026 the only real tournament (Rueda Battle 2026) was online, which doesn't use these keys, and no local tournaments were known.

## Decision
The two old keys were renamed to `rebattle.tournaments` and `rebattle.activeTournamentId` without a migration (#138), before the repository went public. From now on every localStorage key is `rebattle.*`, and a key isn't renamed once it's live.

## Consequences
- One naming scheme in the code and in the browser's storage.
- A tournament saved locally under the old names before the rename stays in that browser but no longer shows.
- Renaming a live key later needs a migration that carries the saved data over, kept until no browser is likely to still have the old key; the review flags a renamed key or a new one outside `rebattle.*`.
- The saved tournament format follows the same rule: a change to it is a breaking change (a `!` commit and a note on what happens to existing data), never a silent one.
