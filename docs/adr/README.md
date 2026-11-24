# Architecture decision records

One file per decision that is costly to reverse, or that people will ask "why?" about: the stack, where data lives, who decides what, the bracket format, saved data. `docs/architecture.md` says what the app does; these say why it is built that way.

- **Name:** `NNNN-decision-title.md`, numbered in order. Numbers are never reused.
- **Never deleted.** When a decision changes, write a new record and set the old one's status to `Superseded by NNNN`. The old one stays, so the history of why stays readable.
- **Short:** a page at most. Write it in the pull request that makes the decision, or before it as a proposal (`Proposed`).
- A pull request that goes against an accepted record says so, and supersedes it with a new one.

## Template

```markdown
# NNNN. Decision title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context
What forces the decision: the problem, the constraints, the options considered.

## Decision
What we do, in one or two sentences, then any detail.

## Consequences
What becomes easier, what becomes harder, what we now have to keep doing.
```

## Records

- [0001. Record architecture decisions](0001-record-architecture-decisions.md)
- [0002. No framework, no build step, no runtime dependencies](0002-no-framework-no-build-step.md)
- [0003. The organiser's browser runs the bracket; the server stores whole snapshots](0003-browser-authority-whole-snapshots.md)
- [0004. One Durable Object per tournament](0004-one-durable-object-per-tournament.md)
- [0005. A random draw for every Losers bracket round](0005-random-losers-draw.md)
- [0006. Organisers log in with Cloudflare Access](0006-cloudflare-access-login.md)
- [0007. Saved-data keys are `rebattle.*`, and aren't renamed once live](0007-saved-data-keys.md)
