// What a release marks (tools/release-marks.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pullRequestNumbers, releasedLine } from '../tools/release-marks.mjs';

test('pull requests come from merge commits and squash merges, once each, in order', () => {
  const subjects = [
    'Merge pull request #73 from adamchrabaszcz/fix/video-safari-stall',
    'test: a stalling encoder falls back to the real-time recording',
    'fix: make the video frame by frame only in Chromium, never hang',
    'feat: something squashed (#80)',
    'Merge pull request #71 from adamchrabaszcz/feat/video-webcodecs',
    'Merge pull request #73 from adamchrabaszcz/fix/video-safari-stall',
    "Merge branch 'main' into feat/x",
  ];
  assert.deepEqual(pullRequestNumbers(subjects), [71, 73, 80]);
  assert.deepEqual(pullRequestNumbers(['']), []);
});

test('the comment links the release', () => {
  assert.equal(releasedLine('1.2.1', 'https://github.com/o/r/releases/tag/v1.2.1'), 'Released in [v1.2.1](https://github.com/o/r/releases/tag/v1.2.1).');
});
