// What search engines read: the description, the structured data, robots.txt and the sitemap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRoute } from '../public/js/route.js';

const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');
const html = read('index.html');

test('index.html has a description, structured data and text for crawlers without JavaScript', () => {
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  assert.ok(description && description.length <= 160, 'a description search results show in full');
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s)[1]);
  assert.equal(data['@type'], 'WebApplication');
  assert.equal(data.url, 'https://rebattle.app/');
  assert.match(html, /<noscript>[\s\S]*Double-elimination[\s\S]*<\/noscript>/);
});

test('robots.txt keeps crawlers out of the organiser pages and the API, and points to the sitemap', () => {
  const robots = read('robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Disallow: \/manage\/$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, /^Sitemap: https:\/\/rebattle\.app\/sitemap\.xml$/m);
});

test('the sitemap lists only real pages of the app', () => {
  const urls = [...read('sitemap.xml').matchAll(/<loc>(.+?)<\/loc>/g)].map((m) => new URL(m[1]));
  assert.ok(urls.length > 0);
  for (const url of urls) {
    assert.equal(url.origin, 'https://rebattle.app');
    assert.notEqual(parseRoute(url.pathname).name, 'notFound', url.pathname);
  }
});
