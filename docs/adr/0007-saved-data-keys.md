# 0007. The first saved-data keys keep the old name

- Status: Accepted
- Date: 2026-10-10

## Context
Before it was called rebattle, the app saved tournaments in the browser under `ruedaBattle.tournaments` and `ruedaBattle.activeTournamentId`. Organisers have tournaments saved under those keys, and a local tournament exists only in that browser. Renaming the keys would make those tournaments disappear unless every version from then on migrated them, with no way to know when everyone had.

## Decision
Those two keys keep their names for good. Every key added since uses the new name: `rebattle.online`, `rebattle.activeOnline`, `rebattle.theme`.

## Consequences
- Existing local tournaments keep loading, with no migration code.
- The old name stays visible in the code and in the browser's storage; `docs/architecture.md` (Storage) explains it, and the review flags a renamed `ruedaBattle.*` key or a new key outside `rebattle.*`.
- The saved tournament format follows the same rule: a change to it is a breaking change (a `!` commit and a note on what happens to existing data), never a silent one.
