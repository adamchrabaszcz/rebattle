// The brand page (/brand): its links point to real files, its colours match docs/brand.md,
// and the "download everything" zip holds the current files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import { renderBrand, VERSIONS, COLOURWAYS, COLOURS, STORY } from '../public/js/ui/brand.js';
import { parseRoute } from '../public/js/route.js';

const PUBLIC = new URL('../public/', import.meta.url);
const html = renderBrand();

test('/brand is a route of its own', () => {
  assert.deepEqual(parseRoute('/brand'), { name: 'brand' });
});

test('every file the page links to or shows exists', () => {
  const paths = [...html.matchAll(/(?:href|src)="(\/(?:brand|icons)\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(paths.length > 40);
  for (const path of paths) assert.ok(existsSync(new URL('.' + path, PUBLIC)), path);
});

test('every version is offered in every colourway, as SVG and PNG', () => {
  for (const [id] of VERSIONS)
    for (const [cw] of COLOURWAYS)
      for (const ext of ['svg', 'png']) assert.match(html, new RegExp(`href="/brand/logos/${id}-${cw}\\.${ext}" download`));
});

test('"How the logo is made" has the same steps and captions as the sheet tools/make-logo-story.py draws', () => {
  const tool = readFileSync(new URL('../tools/make-logo-story.py', import.meta.url), 'utf8');
  for (const [file, title, text] of STORY) {
    assert.ok(tool.includes(`('${file}', '${title}', '${text}'`), `${file}: the page and the sheet differ`);
    assert.ok(existsSync(new URL(`brand/how/${file}.svg`, PUBLIC)), file);
  }
});

test('the colours are the ones in docs/brand.md', () => {
  const doc = readFileSync(new URL('../docs/brand.md', import.meta.url), 'utf8').toLowerCase();
  for (const [name, hex] of COLOURS) assert.ok(doc.includes(hex), `${name} ${hex} is not in docs/brand.md`);
});

// The zip's central directory: name, CRC-32 and size of every entry.
function zipEntries(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = buf.readUInt32LE(end + 16);
  const entries = {};
  for (let i = buf.readUInt16LE(end + 10); i > 0; i--) {
    const nameLength = buf.readUInt16LE(at + 28);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength);
    entries[name] = { crc: buf.readUInt32LE(at + 16), size: buf.readUInt32LE(at + 24) };
    at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return entries;
}

function brandFiles(dir = new URL('brand/', PUBLIC), prefix = '') {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.') || name === 'rebattle-brand.zip') return [];
    const url = new URL(name, dir);
    return statSync(url).isDirectory() ? brandFiles(new URL(name + '/', dir), prefix + name + '/') : [[prefix + name, url]];
  });
}

test('the zip holds every brand file as it is now (run tools/make-brand-kit.py)', () => {
  const entries = zipEntries(readFileSync(new URL('brand/rebattle-brand.zip', PUBLIC)));
  const files = [...brandFiles(), ['share-preview.png', new URL('icons/share-preview.png', PUBLIC)]];
  assert.deepEqual(Object.keys(entries).sort(), ['README.txt', ...files.map(([name]) => name)].sort());
  for (const [name, url] of files) {
    const data = readFileSync(url);
    assert.equal(entries[name].size, data.length, `${name} changed`);
    assert.equal(entries[name].crc, crc32(data), `${name} changed`);
  }
});
