// Release versions from Conventional Commits (tools/release.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextVersion } from '../tools/release.mjs';

const c = (subject, body = '') => ({ subject, body });

test('the first release is 1.0.0', () => {
  assert.equal(nextVersion(null, []), '1.0.0');
  assert.equal(nextVersion(null, [c('feat: anything')]), '1.0.0');
});

test('feat bumps the minor, fix and perf the patch, breaking changes the major', () => {
  assert.equal(nextVersion('1.2.3', [c('fix: a'), c('feat: b')]), '1.3.0');
  assert.equal(nextVersion('1.2.3', [c('fix(ui): a')]), '1.2.4');
  assert.equal(nextVersion('1.2.3', [c('perf: a')]), '1.2.4');
  assert.equal(nextVersion('1.2.3', [c('feat(api)!: a')]), '2.0.0');
  assert.equal(nextVersion('1.2.3', [c('fix: a', 'Details.\n\nBREAKING CHANGE: the API moved')]), '2.0.0');
});

test('changes users don\'t get make no release', () => {
  assert.equal(nextVersion('1.2.3', [c('docs: a'), c('ci: b'), c('chore: c'), c('test: d'), c('refactor: e'), c('style: f'), c('build: g')]), null);
  assert.equal(nextVersion('1.2.3', [c('Merge pull request #9 from x/y'), c('not conventional')]), null);
  assert.equal(nextVersion('1.2.3', []), null);
});
