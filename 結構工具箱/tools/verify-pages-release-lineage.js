const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const STATUS_PATHS = [
  '結構工具箱/assets/status/platform-status.json',
  '結構工具箱/assets/status/preflight-summary.json',
  '結構工具箱/assets/status/report-readiness-status.json',
].sort();

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : process.argv[index + 1] || '';
}

function gitText(repoRoot, args) {
  return childProcess.execFileSync('git', ['-C', repoRoot, '-c', 'core.quotepath=false', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitPathList(repoRoot, args) {
  const output = childProcess.execFileSync('git', ['-C', repoRoot, '-c', 'core.quotepath=false', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output.split('\0').map(value => value.trim()).filter(Boolean).sort();
}

function readJson(filePath, label) {
  assert.ok(fs.existsSync(filePath), `${label} exists`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function verifyPagesReleaseLineage(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const expectedBranch = String(options.expectedBranch || '').trim();
  const actualHead = gitText(repoRoot, ['rev-parse', 'HEAD']).toLowerCase();
  const headSha = String(options.headSha || actualHead).trim().toLowerCase();
  assert.match(headSha, /^[0-9a-f]{40}$/, 'release carrier HEAD is a full Git SHA');
  assert.equal(actualHead, headSha, 'release carrier HEAD matches the requested deployment commit');

  const preflightRelativePath = STATUS_PATHS.find((relativePath) => relativePath.endsWith('/preflight-summary.json'));
  const preflightPath = path.join(repoRoot, ...preflightRelativePath.split('/'));
  const preflight = readJson(preflightPath, 'tracked preflight release snapshot');
  const sourceCommitSha = String(preflight.sourceCommitSha || '').trim().toLowerCase();
  assert.match(sourceCommitSha, /^[0-9a-f]{40}$/, 'tracked preflight snapshot identifies a full tested Git commit');
  assert.equal(preflight.sourceDirty, false, 'tracked preflight snapshot proves a clean tested worktree');
  assert.equal(preflight.quick, false, 'tracked preflight snapshot is not quick mode');
  assert.equal(preflight.forcePlatformAudit, true, 'tracked preflight snapshot forced platform audit');
  assert.equal(preflight.forceSlowChecks, true, 'tracked preflight snapshot forced slow checks');
  assert.equal(preflight.pass, true, 'tracked preflight snapshot passed');
  assert.equal(preflight.slowReuseCount, 0, 'tracked preflight snapshot reused no slow checks');
  assert.equal(preflight.platformAuditReused, false, 'tracked preflight snapshot reran platform audit');
  assert.equal(preflight.recordsCount, preflight.passedCount, 'tracked preflight snapshot passed every check');
  assert.ok(Number.isInteger(preflight.postCheckCount) && preflight.postCheckCount > 0, 'tracked preflight snapshot records post-checks');
  assert.equal(preflight.postCheckCount, preflight.postChecksPassedCount, 'tracked preflight snapshot passed every post-check');
  if (expectedBranch) {
    assert.equal(String(preflight.sourceBranch || ''), expectedBranch, 'tracked preflight snapshot branch matches the deployment branch');
  }

  gitText(repoRoot, ['cat-file', '-e', `${sourceCommitSha}^{commit}`]);
  const lineage = gitText(repoRoot, ['rev-list', '--parents', '-n', '1', headSha]).split(/\s+/);
  assert.equal(lineage.length, 2, 'release carrier is a single-parent commit');
  assert.equal(lineage[1].toLowerCase(), sourceCommitSha, 'release carrier direct parent is the tested commit');

  const changedPaths = gitPathList(repoRoot, ['diff', '--name-only', '--no-renames', '-z', `${sourceCommitSha}..${headSha}`]);
  assert.deepEqual(changedPaths, STATUS_PATHS, 'release carrier changes only the three public status snapshots');

  for (const relativePath of STATUS_PATHS) {
    gitText(repoRoot, ['cat-file', '-e', `${headSha}:${relativePath}`]);
  }

  return {
    schemaVersion: 1,
    status: 'success',
    headSha,
    sourceCommitSha,
    sourceBranch: String(preflight.sourceBranch || ''),
    sourceDirty: preflight.sourceDirty,
    runId: String(preflight.runId || ''),
    changedPaths,
  };
}

function main() {
  const result = verifyPagesReleaseLineage({
    repoRoot: argValue('--repo-root') || process.cwd(),
    headSha: argValue('--head-sha'),
    expectedBranch: argValue('--expected-branch'),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Pages release lineage blocked: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  STATUS_PATHS,
  verifyPagesReleaseLineage,
};
