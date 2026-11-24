import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIssue, checkPullRequest, sections } from '../tools/format-check.mjs';

const ISSUE = `### What and why
The video stalls in Safari.

### Done when
- [ ] It saves in Safari

### Blast radius
_No response_
`;

test('an issue form body has its sections, empty fields read as empty', () => {
  const s = sections(ISSUE);
  assert.equal(s['What and why'], 'The video stalls in Safari.');
  assert.equal(s['Blast radius'], '');
  assert.deepEqual(checkIssue(ISSUE), []);
});

test('an issue without "What and why" or "Done when" is reported', () => {
  assert.equal(checkIssue('Just a sentence.').length, 2);
  assert.deepEqual(checkIssue('### What and why\nBecause.\n\n### Done when\n_No response_\n'), ['a "### Done when" section with something in it']);
});

test('a pull request needs a Conventional Commit title and a Closes line', () => {
  assert.deepEqual(checkPullRequest({ title: 'fix: the video saves in Safari', body: 'Text.\n\nCloses #72' }), []);
  assert.deepEqual(checkPullRequest({ title: 'feat(ui)!: new screen', body: 'Fixes #3' }), []);
  const bad = checkPullRequest({ title: 'Video fix', body: 'Part of #57' });
  assert.equal(bad.length, 2);
  assert.match(bad[0], /Conventional Commit/);
  assert.match(bad[1], /Closes #/);
});
