// Checks the format of issues and pull requests (CONTRIBUTING.md, "Issues and pull requests"),
// for .github/workflows/format.yml. No dependencies.
//
// Issues: "### What and why" and "### Done when" with something under them; "### Blast radius"
// and "### Parent" are optional. The issue forms (.github/ISSUE_TEMPLATE/) write these headings.
// Pull requests: a Conventional Commit title, and a "Closes #n" line, so merging closes the issue.
//
//   node tools/format-check.mjs issue   reads the event at $GITHUB_EVENT_PATH, prints what is missing
//   node tools/format-check.mjs pr      the same for a pull request; exits 1 when something is missing
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REQUIRED = ['What and why', 'Done when'];
const TYPES = ['feat', 'fix', 'perf', 'docs', 'ci', 'chore', 'test', 'refactor', 'style', 'build'];
const TITLE = new RegExp(`^(${TYPES.join('|')})(\\([\\w ,./-]+\\))?!?: \\S`);
const CLOSES = /\b(close[sd]?|fix(e[sd])?|resolve[sd]?) +#\d+\b/i;

// "### Heading" sections of a body, heading -> text under it ("_No response_" is what an
// issue form writes for a field left empty).
function sections(body) {
  const out = {};
  let current = null;
  for (const line of String(body || '').split(/\r?\n/)) {
    const h = line.match(/^#{2,3} +(.+?) *$/);
    if (h) out[(current = h[1])] = '';
    else if (current) out[current] += line + '\n';
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim() === '_No response_' ? '' : out[k].trim();
  return out;
}

function checkIssue(body) {
  const s = sections(body);
  return REQUIRED.filter((name) => !s[name]).map((name) => `a "### ${name}" section with something in it`);
}

function checkPullRequest({ title, body }) {
  const problems = [];
  if (!TITLE.test(title || '')) problems.push(`a Conventional Commit title (${TYPES.join(', ')}), e.g. "fix: the video saves in Safari"`);
  if (!CLOSES.test(body || '')) problems.push('a "Closes #<issue>" line in the description, so merging closes the issue');
  return problems;
}

function main(kind) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const problems = kind === 'pr' ? checkPullRequest(event.pull_request) : checkIssue(event.issue.body);
  for (const p of problems) console.log(`Missing: ${p}`);
  if (!problems.length) console.log('Format OK.');
  if (kind === 'pr' && problems.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv[2]);

export { sections, checkIssue, checkPullRequest };
