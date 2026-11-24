# 0003. The organiser's browser runs the bracket; the server stores whole snapshots

- Status: Accepted
- Date: 2026-10-11

## Context
Online tournaments need a server copy for other devices and viewers, and recording must keep working when the venue wifi drops. The Losers bracket draw is random (`Math.random`, see 0005). If both the phone and the server ran the engine, their draws would differ, and results recorded offline couldn't be reconciled. Sending individual results as commands would need the server to run the engine and to merge commands from two devices.

## Decision
The organiser's browser stays the authority: it runs the engine exactly as for a local tournament, and sends the **whole tournament snapshot** with the version it started from (`baseVersion`). The server accepts it only if that version is still current (compare-and-swap); otherwise it answers 409 with its own copy and the organiser picks which version to keep. Every write is checked: login, same origin, size (512 KB), `validateTournament` and ownership.

## Consequences
- The engine and the saved format are the same for local and online tournaments; the server doesn't run the engine.
- Offline is simple: each change is saved on the device first, and only the latest snapshot per tournament waits to be sent (an outbox of one slot).
- Undo is a local snapshot stack, saved like any other change; the server keeps the last 20 versions for recovery.
- Two devices editing at once can't be merged: one of them gets the conflict and chooses.
- The server trusts the organiser's engine for the results, so it validates the shape of every snapshot rather than the moves that led to it.
- A seeded draw (#28) would let the server replay results itself; that would supersede this record.
