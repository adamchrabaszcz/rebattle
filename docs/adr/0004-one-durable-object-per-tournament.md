# 0004. One Durable Object per tournament

- Status: Accepted
- Date: 2026-10-11

## Context
An online tournament is one small document (a 40-rider event is about 40 KB) that one organiser writes a few hundred times a day and any number of viewers follow live. Writes must be checked against the current version atomically (0003), and viewers need a push when it changes. The app already runs on Cloudflare Workers. A database would need its own transactions for the version check and a separate way to push changes to viewers.

## Decision
Each tournament is its own Durable Object (`TournamentStore`, addressed by its code) holding the snapshot, its version, the owners, the last 20 versions and the viewers' WebSockets. Each organiser has one (`OrganiserList`) with their tournaments' codes, and one more (`CompetitionIndex`) holds the public list. No region restriction: Cloudflare creates each object near where it's first used, so an event in the US lives in the US and one in Europe in Europe.

## Consequences
- The version check is a plain comparison inside the object: its storage calls don't let another request in between (input gates), so two saves can't both win (tested in `tests/cloud.test.js`).
- Live updates come from the same object (WebSocket Hibernation API, so idle viewers cost nothing).
- The free plan covers it: an event needs a few hundred writes against 100k a day.
- No queries across tournaments: anything that spans them (an organiser's list, the public list) is its own object, kept in step by the Worker.
- No EU jurisdiction (decided 2026-10-11, because events may run in the US): data is stored where the tournament was first used. A jurisdiction can't be added to existing objects later, only to new ones.
- Locally and in tests, `tools/fake-do.mjs` stands in for Durable Objects in memory; `npm run dev` runs the real ones.
