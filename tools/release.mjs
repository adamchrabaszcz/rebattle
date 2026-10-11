// The next release version from the Conventional Commits since the last tag (used by
// .github/workflows/release.yml after CI passes on main). A breaking change (`type!:`
// or a `BREAKING CHANGE:` footer) bumps the major number, `feat` the minor, `fix` and
// `perf` the patch; docs, ci, chore, test, refactor, style and build don't change what
// users get, so they make no release. The first release is v1.0.0. No dependencies.
//
//   node tools/release.mjs     prints e.g. "1.4.0", or nothing when there's nothing to release
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FIRST = '1.0.0';

// commits: [{ subject, body }]; last: 'x.y.z' or null. Returns 'x.y.z' or null.
export function nextVersion(last, commits) {
  if (!last) return FIRST;
  const level = commits.reduce((lvl, { subject, body = '' }) => {
    const m = subject.match(/^(\w+)(\([^)]*\))?(!)?:/);
    if (!m) return lvl;
    if (m[3] || /^BREAKING[ -]CHANGE:/m.test(body)) return Math.max(lvl, 3);
    if (m[1] === 'feat') return Math.max(lvl, 2);
    if (m[1] === 'fix' || m[1] === 'perf') return Math.max(lvl, 1);
    return lvl;
  }, 0);
  if (!level) return null;
  const [major, minor, patch] = last.split('.').map(Number);
  if (level === 3) return `${major + 1}.0.0`;
  if (level === 2) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let last = null;
  try {
    last = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*.[0-9]*.[0-9]*').slice(1);
  } catch {
    // no release yet
  }
  const range = last ? [`v${last}..HEAD`] : ['HEAD'];
  const log = git('log', '--no-merges', '--format=%s%x1f%b%x1e', ...range);
  const commits = log
    .split('\x1e')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [subject, body] = c.split('\x1f');
      return { subject, body };
    });
  const next = nextVersion(last, commits);
  if (next) console.log(next);
}
