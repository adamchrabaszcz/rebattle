# 0006. Organisers log in with Cloudflare Access

- Status: Accepted
- Date: 2026-10-11

## Context
Saving online needs to know who an organiser is, so only they can change their tournaments. Viewers never log in. Building accounts would mean passwords or magic links, a user table, resets and abuse handling, and organisers are approved people, not anyone who signs up (decided 2026-10-11). The app already runs on Cloudflare.

## Decision
Cloudflare Access (Zero Trust, free plan) guards `/manage/*` and `/api/manage/*` with a one-time code by email, and lets in only the emails in an "Approved organisers" policy kept in the Cloudflare dashboard, not in this repository. The Worker doesn't trust that Access was in front: `worker/auth.js` checks the token on every organiser request itself (signature against the team's keys, issuer, audience, expiry, an email claim). The email is the organiser's identity.

## Consequences
- No passwords and no user table in rebattle; Access logs who logged in when.
- Becoming an organiser means being added to the policy by the owner; there's no sign-up (#76 plans a way to ask).
- Owner emails are stored with each tournament, so they must never reach anything public (`/api/t/*`, the live feed, the competitions list).
- Login only works on rebattle.app: pull request previews aren't behind Access. Locally, `DEV_ORGANISER_EMAIL` stands in for it, on `127.0.0.1` and `localhost` only.
- The team domain and the app's AUD tag are in `wrangler.jsonc`; they aren't secrets.
