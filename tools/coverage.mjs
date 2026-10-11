// Line coverage for the README badge, from both test runs: the Node tests
// (NODE_V8_COVERAGE=<dir>/node) and the browser smoke test (SMOKE_COVERAGE=<dir>/browser,
// Chrome's precise coverage). Both are V8's format, so one reader handles them.
// Every module under public/js (vendored files aside) and worker/ counts, also
// those no test loads. No dependencies.
//
//   NODE_V8_COVERAGE=coverage/node node --test
//   NODE_V8_COVERAGE=coverage/node SMOKE_COVERAGE=coverage/browser node tests/browser/smoke.mjs
//   node tools/coverage.mjs coverage      -> prints a table, writes coverage/badge.svg and summary.md
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const dir = process.argv[2] || 'coverage';

// The files that count, as repo paths.
function sources(base) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, base), { withFileTypes: true, recursive: true })) {
    const path = relative(ROOT, join(entry.parentPath, entry.name));
    if (entry.isFile() && path.endsWith('.js') && !path.startsWith('public/js/vendor/')) out.push(path);
  }
  return out;
}
const FILES = [...sources('public/js'), ...sources('worker')].sort();

// A V8 script URL to a repo path: file:///…/repo/worker/x.js, or http://host/js/x.js (served from public/).
function repoPath(url) {
  if (url.startsWith('file://')) return relative(ROOT, fileURLToPath(url));
  const m = url.match(/^https?:\/\/[^/]+(\/js\/[^?#]+)/);
  return m ? 'public' + m[1] : null;
}

// Executable lines: not blank, not only a comment, not only closing brackets.
function executableLines(text) {
  const lines = [];
  let offset = 0;
  let inComment = false;
  for (const [i, line] of text.split('\n').entries()) {
    const t = line.trim();
    const start = offset + line.length - line.trimStart().length;
    offset += line.length + 1;
    if (inComment) {
      if (t.includes('*/')) inComment = false;
      continue;
    }
    if (t.startsWith('/*') && !t.includes('*/')) {
      inComment = true;
      continue;
    }
    if (!t || t.startsWith('//') || t.startsWith('/*') || /^[\]})]+[;,)]*$/.test(t)) continue;
    lines.push({ line: i + 1, offset: start });
  }
  return lines;
}

// Count at an offset: the innermost range that contains it (V8 block coverage).
function countAt(functions, offset) {
  let best = null;
  for (const f of functions)
    for (const r of f.ranges)
      if (r.startOffset <= offset && offset < r.endOffset && (!best || r.endOffset - r.startOffset < best.endOffset - best.startOffset)) best = r;
  return best ? best.count : 0;
}

// covered[path] = Set of covered line numbers, merged over every run and page.
const covered = {};
for (const sub of ['node', 'browser']) {
  if (!existsSync(join(dir, sub))) continue;
  for (const name of readdirSync(join(dir, sub)).filter((n) => n.endsWith('.json'))) {
    for (const script of JSON.parse(readFileSync(join(dir, sub, name), 'utf8')).result || []) {
      const path = repoPath(script.url);
      if (!path || !FILES.includes(path)) continue;
      const set = (covered[path] = covered[path] || new Set());
      for (const { line, offset } of executableLines(readFileSync(join(ROOT, path), 'utf8'))) if (countAt(script.functions, offset) > 0) set.add(line);
    }
  }
}

const rows = FILES.map((path) => {
  const total = executableLines(readFileSync(join(ROOT, path), 'utf8')).length;
  const hit = covered[path] ? covered[path].size : 0;
  return { path, hit, total, pct: total ? (100 * hit) / total : 100 };
});
const hit = rows.reduce((n, r) => n + r.hit, 0);
const total = rows.reduce((n, r) => n + r.total, 0);
const pct = total ? (100 * hit) / total : 0;

const colour = pct >= 90 ? '#4c1' : pct >= 80 ? '#97ca00' : pct >= 70 ? '#a4a61d' : pct >= 60 ? '#dfb317' : '#e05d44';
const value = Math.floor(pct) + '%';
// A flat badge like shields.io's: grey label, coloured value. Widths from ~7 px per character.
const lw = 62;
const vw = 8 + 7 * value.length;
writeFileSync(
  join(dir, 'badge.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="coverage: ${value}"><title>coverage: ${value}</title>` +
    `<rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="${colour}"/>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">` +
    `<text x="${lw / 2}" y="14">coverage</text><text x="${lw + vw / 2}" y="14">${value}</text></g></svg>\n`
);

const table = rows.map((r) => `| ${r.path} | ${r.hit}/${r.total} | ${r.pct.toFixed(0)}% |`).join('\n');
writeFileSync(join(dir, 'summary.md'), `## Coverage: ${pct.toFixed(1)}% of lines\n\nNode tests and the browser smoke test together.\n\n| File | Lines | % |\n| --- | --- | --- |\n${table}\n`);
for (const r of rows) console.log(`${r.pct.toFixed(0).padStart(4)}%  ${String(r.hit).padStart(4)}/${String(r.total).padEnd(4)}  ${r.path}`);
console.log(`\ncoverage: ${pct.toFixed(1)}% of ${total} lines`);
