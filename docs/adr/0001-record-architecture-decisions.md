# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-11-24

## Context
rebattle makes choices that look odd from outside: no framework, the organiser's phone as the authority, a random draw every Losers round, storage keys with an old name. The reasons were in pull request descriptions and private planning notes, so a newcomer, a contributor from a fork or the AI review couldn't find them, and would reasonably propose to undo them.

## Decision
Record each such decision in `docs/adr/` as a short record (context, decision, consequences), in the format in this folder's README. `docs/architecture.md` keeps describing what the code does.

## Consequences
- A change against a recorded decision is a conscious one: it says so and supersedes the record.
- The AI review checks pull requests against the records.
- Records describe the code as it is; when the code moves on, a new record supersedes the old one rather than the old one being edited to match.
