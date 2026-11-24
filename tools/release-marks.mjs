// Marks what a release shipped (.github/workflows/release.yml, after the tag): every pull
// request merged since the previous release, and every issue those pull requests closed,
// gets the version's milestone and a "Released in vX.Y.Z" comment with a link to the
// release. Re-running doesn't comment twice. Uses the gh CLI; no dependencies.
//
//   node tools/release-marks.mjs <version> <previous tag or ""> <sha>
//   (GH_TOKEN and GITHUB_REPOSITORY set, as in the workflow)
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Pull request numbers from merge commit subjects ("Merge pull request #12 from …") and
// squash merges ("feat: … (#12)"), oldest first, no repeats.
function pullRequestNumbers(subjects) {
  const out = [];
  for (const s of subjects) {
    const m = s.match(/^Merge pull request #(\d+)\b/) || s.match(/\(#(\d+)\)$/);
    if (m && !out.includes(Number(m[1]))) out.push(Number(m[1]));
  }
  return out.sort((a, b) => a - b);
}

const releasedLine = (version, url) => `Released in [v${version}](${url}).`;

function main([version, previous, sha]) {
  const repo = process.env.GITHUB_REPOSITORY;
  const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
  const gh = (...args) => run('gh', args);
  const range = previous ? `${previous}..${sha}` : sha;
  const prs = pullRequestNumbers(run('git', ['log', '--format=%s', range]).split('\n'));
  const issues = new Set();
  for (const pr of prs) {
    const closed = JSON.parse(gh('pr', 'view', String(pr), '--repo', repo, '--json', 'closingIssuesReferences'));
    closed.closingIssuesReferences.forEach((i) => issues.add(i.number));
  }
  const title = `v${version}`;
  const url = `https://github.com/${repo}/releases/tag/${title}`;
  const line = releasedLine(version, url);
  // The milestone: made open so things can be added to it, then closed (it is shipped).
  const existing = JSON.parse(gh('api', `repos/${repo}/milestones?state=all&per_page=100`)).find((m) => m.title === title);
  const milestone = existing || JSON.parse(gh('api', `repos/${repo}/milestones`, '-f', `title=${title}`, '-f', `description=${url}`));
  if (milestone.state === 'closed') gh('api', '-X', 'PATCH', `repos/${repo}/milestones/${milestone.number}`, '-f', 'state=open');
  for (const n of [...prs, ...issues]) {
    gh('api', '-X', 'PATCH', `repos/${repo}/issues/${n}`, '-F', `milestone=${milestone.number}`); // issues and pull requests alike
    const comments = JSON.parse(gh('api', `repos/${repo}/issues/${n}/comments?per_page=100`));
    if (!comments.some((c) => c.body.includes(line))) gh('api', `repos/${repo}/issues/${n}/comments`, '-f', `body=${line}`);
    console.log(`#${n}: ${title}`);
  }
  gh('api', '-X', 'PATCH', `repos/${repo}/milestones/${milestone.number}`, '-f', 'state=closed');
  console.log(`${title}: ${prs.length} pull requests, ${issues.size} issues`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

export { pullRequestNumbers, releasedLine };
