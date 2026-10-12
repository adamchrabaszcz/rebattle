// The link preview: the Open Graph tags in index.html and the image they point to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const meta = (key) => html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1];

test('index.html has the tags LinkedIn, WhatsApp and others read', () => {
  for (const key of ['og:type', 'og:site_name', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:alt', 'twitter:card']) {
    assert.ok(meta(key), `${key} is missing`);
  }
  assert.equal(meta('og:url'), 'https://rebattle.app/');
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.match(meta('og:image'), /^https:\/\/rebattle\.app\//, 'platforms need an absolute image URL');
});

test('the preview image exists and is the size the tags say', () => {
  const path = new URL(meta('og:image')).pathname;
  const png = readFileSync(new URL(`../public${path}`, import.meta.url));
  assert.equal(png.toString('latin1', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), Number(meta('og:image:width')));
  assert.equal(png.readUInt32BE(20), Number(meta('og:image:height')));
  assert.ok(png.length < 300_000, 'small enough for every platform');
});
