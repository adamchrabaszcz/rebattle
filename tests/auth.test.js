// Organiser login: the Worker's own check of the Cloudflare Access token. Tokens are
// signed here with a test key, so every way a token can be wrong is covered.
import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyAccessToken, organiserOf } from '../worker/auth.js';
import worker from '../worker/index.js';

const TEAM = 'https://rebattle-test.cloudflareaccess.com';
const AUD = 'aud-tag-for-rebattle';
const NOW = 1_800_000_000;

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

async function keyPair(kid) {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256', use: 'sig' };
  return { privateKey: pair.privateKey, jwk };
}

async function sign(privateKey, payload, header = {}) {
  const h = enc({ alg: 'RS256', typ: 'JWT', kid: 'k1', ...header });
  const p = enc(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(h + '.' + p));
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

const good = { iss: TEAM, aud: [AUD], email: 'Organiser@Example.com', exp: NOW + 3600, nbf: NOW - 10, iat: NOW - 10 };

test('access tokens: valid passes, every kind of wrong one fails', async () => {
  const k1 = await keyPair('k1');
  const other = await keyPair('k1'); // same kid, different key: a forgery
  const getKeys = async () => [k1.jwk];
  const check = (token, opts = {}) => verifyAccessToken(token, { teamDomain: TEAM, aud: AUD, getKeys, now: NOW, ...opts });

  assert.deepEqual(await check(await sign(k1.privateKey, good)), { email: 'organiser@example.com' });
  assert.deepEqual(await check(await sign(k1.privateKey, { ...good, aud: AUD })), { email: 'organiser@example.com' }, 'aud as a string');

  const bad = {
    'signed by another key': await sign(other.privateKey, good),
    'wrong audience': await sign(k1.privateKey, { ...good, aud: ['someone-else'] }),
    'wrong issuer': await sign(k1.privateKey, { ...good, iss: 'https://evil.cloudflareaccess.com' }),
    expired: await sign(k1.privateKey, { ...good, exp: NOW - 120 }),
    'not valid yet': await sign(k1.privateKey, { ...good, nbf: NOW + 120 }),
    'no expiry': await sign(k1.privateKey, { ...good, exp: undefined }),
    'no email': await sign(k1.privateKey, { ...good, email: undefined }),
    'unknown key id': await sign(k1.privateKey, good, { kid: 'nope' }),
    'alg none': `${enc({ alg: 'none', kid: 'k1' })}.${enc(good)}.`,
    'HS256 header': await sign(k1.privateKey, good, { alg: 'HS256' }),
    garbage: 'not.a.token',
    empty: '',
  };
  for (const [why, token] of Object.entries(bad)) assert.equal(await check(token), null, why);

  // A tampered payload under a valid signature.
  const [h, , s] = (await sign(k1.privateKey, good)).split('.');
  assert.equal(await check(`${h}.${enc({ ...good, email: 'attacker@example.com' })}.${s}`), null, 'tampered payload');

  // Not configured: nothing passes.
  assert.equal(await check(await sign(k1.privateKey, good), { aud: '' }), null);
  assert.equal(await check(await sign(k1.privateKey, good), { teamDomain: '' }), null);
});

test('access tokens: a rotated key is fetched once', async () => {
  const k2 = await keyPair('k2');
  const calls = [];
  const getKeys = async (refresh) => (calls.push(refresh), refresh ? [k2.jwk] : []);
  const token = await sign(k2.privateKey, good, { kid: 'k2' });
  assert.deepEqual(await verifyAccessToken(token, { teamDomain: TEAM, aud: AUD, getKeys, now: NOW }), { email: 'organiser@example.com' });
  assert.deepEqual(calls, [false, true]);
});

test('the local stand-in login only works on localhost', async () => {
  const env = { DEV_ORGANISER_EMAIL: 'dev@example.com', ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
  const getKeys = async () => [];
  assert.deepEqual(await organiserOf(new Request('http://127.0.0.1:8787/api/manage/me'), env, { getKeys }), { email: 'dev@example.com' });
  assert.deepEqual(await organiserOf(new Request('http://localhost:8787/api/manage/me'), env, { getKeys }), { email: 'dev@example.com' });
  assert.equal(await organiserOf(new Request('https://rebattle.app/api/manage/me', { headers: { Host: 'localhost' } }), env, { getKeys }), null);
});

test('worker: /api/manage/me and /api/manage/login', async () => {
  const k1 = await keyPair('k1');
  const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
  const deps = { getKeys: async () => [k1.jwk] };
  const now = Date.now() / 1000;
  const token = await sign(k1.privateKey, { ...good, exp: now + 3600, nbf: now - 10 });
  const req = (path, headers = {}) => new Request('https://rebattle.app' + path, { headers });

  let res = await worker.fetch(req('/api/manage/me'), env, null, deps);
  assert.deepEqual(await res.json(), { email: null });
  res = await worker.fetch(req('/api/manage/me', { 'Cf-Access-Jwt-Assertion': token }), env, null, deps);
  assert.deepEqual(await res.json(), { email: 'organiser@example.com' });
  assert.equal(res.headers.get('Cache-Control'), 'no-store');

  res = await worker.fetch(req('/api/manage/login'), env, null, deps);
  assert.equal(res.status, 401);
  res = await worker.fetch(req('/api/manage/login', { 'Cf-Access-Jwt-Assertion': token }), env, null, deps);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), '/');

  res = await worker.fetch(new Request('https://rebattle.app/api/manage/me', { method: 'POST' }), env, null, deps);
  assert.equal(res.status, 405);
});
