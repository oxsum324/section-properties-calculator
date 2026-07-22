'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Portfolio = require('./attachment-case-governance-portfolio.js');
const Compare = require('./attachment-case-governance-portfolio-compare.js');
const Snapshot = require('./attachment-case-governance-portfolio-snapshot.js');
const Index = require('./attachment-case-governance-portfolio-snapshot-index.js');

const TIMES = {
  first: '2026-07-22T01:00:00.000Z',
  second: '2026-07-22T02:00:00.000Z',
  third: '2026-07-22T03:00:00.000Z',
  index: new Date('2026-07-22T04:00:00.000Z'),
};

function makeCase(status, token) {
  const state = status === 'ready'
    ? { packageStatus: 'ready', chainStatus: 'valid', pendingAdditions: 0, issueCodes: [], nextActionCodes: ['internal-archive-review'] }
    : status === 'review'
      ? { packageStatus: 'ready', chainStatus: 'review', pendingAdditions: 1, issueCodes: ['chain-advancement-pending'], nextActionCodes: ['advance-trusted-baseline'] }
      : { packageStatus: 'blocked', chainStatus: 'blocked', pendingAdditions: 0, issueCodes: ['chain-disconnected'], nextActionCodes: ['repair-trusted-baseline-chain'] };
  return {
    caseName: '案件甲',
    status,
    caseFingerprint: `CAS-${token.repeat(24)}`,
    governanceFingerprint: `GOV-${token.repeat(24)}`,
    packageStatus: state.packageStatus,
    chainStatus: state.chainStatus,
    currentReceiptCount: 2,
    pendingAdditions: state.pendingAdditions,
    issueCodes: state.issueCodes,
    nextActionCodes: state.nextActionCodes,
  };
}

function makeSnapshot(status, token, generatedAt, parentName = '案件上層') {
  const cases = [makeCase(status, token)];
  const summary = {
    readyCases: status === 'ready' ? 1 : 0,
    reviewCases: status === 'review' ? 1 : 0,
    blockedCases: status === 'blocked' ? 1 : 0,
    errors: 0,
    warnings: 0,
  };
  return {
    schemaVersion: 1,
    kind: Portfolio.PORTFOLIO_KIND,
    generatedAt,
    status,
    portfolioFingerprint: `POR-${token.repeat(24)}`,
    boundary: {
      classification: 'internal-governance-only',
      attachToFormalReport: false,
      formalAttachmentApproval: false,
      instruction: Portfolio.PORTFOLIO_BOUNDARY_INSTRUCTION,
    },
    discovery: { parentName, caseCount: 1, ignoredDirectoryCount: 0, ignoredDirectories: [] },
    summary,
    triage: Portfolio.buildTriage(cases, []),
    cases,
    issues: [],
    nextActions: [{ code: 'follow-current-status', message: '依目前狀態處理。', cases: ['案件甲'] }],
  };
}

function writeSnapshot(directory, snapshot, fileName = Snapshot.snapshotFileName(snapshot)) {
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return filePath;
}

function directoryDigest(directory) {
  const rows = fs.readdirSync(directory).sort().map(name => {
    const filePath = path.join(directory, name);
    const stat = fs.lstatSync(filePath);
    const hash = stat.isFile() ? crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex') : stat.isDirectory() ? 'directory' : 'special';
    return `${name}:${hash}`;
  });
  return crypto.createHash('sha256').update(rows.join('\n'), 'utf8').digest('hex');
}

function cli(args) {
  return spawnSync(process.execPath, [path.join(__dirname, 'attachment-case-governance-portfolio-snapshot-index.js'), ...args], { encoding: 'utf8' });
}

assert.equal(Index.SNAPSHOT_INDEX_KIND, 'formal-attachment-case-governance-portfolio-snapshot-index.v1');
assert.match(Index.SNAPSHOT_INDEX_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.deepEqual(Index.parseArgs(['--directory', 'C:/snapshots', '--compare-latest', '--change', 'added', '--change', 'regressed', '--json']), {
  json: true,
  compareLatest: true,
  onlyBlocking: false,
  changeTypes: ['regressed', 'added'],
  directory: 'C:/snapshots',
});
assert.throws(() => Index.parseArgs(['--directory']), /缺少路徑值/);
assert.throws(() => Index.parseArgs(['--change', 'regressed']), /只能搭配 --compare-latest/);
assert.throws(() => Index.parseArgs(['--compare-latest', '--change', 'unknown']), /不支援的差異類型/);
assert.throws(() => Index.parseArgs(['--compare-latest', '--only-blocking', '--change', 'added']), /不得與 --change 同時使用/);
assert.throws(() => Index.parseArgs(['--unknown']), /未知參數/);
assert.match(Index.usage(), /單一群組且至少兩份快照/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-portfolio-snapshot-index-'));
try {
  const stableDirectory = path.join(tempRoot, 'stable');
  const stableFirst = makeSnapshot('ready', 'A', TIMES.first);
  const stableSecond = makeSnapshot('ready', 'A', TIMES.second);
  writeSnapshot(stableDirectory, stableFirst);
  writeSnapshot(stableDirectory, stableSecond);
  const stableDigest = directoryDigest(stableDirectory);
  const stableIndex = Index.inspectSnapshotDirectory(stableDirectory, { now: TIMES.index });
  assert.equal(stableIndex.kind, Index.SNAPSHOT_INDEX_KIND);
  assert.equal(stableIndex.status, 'ready');
  assert.equal(stableIndex.integrityStatus, 'ready');
  assert.deepEqual(stableIndex.summary, { totalEntries: 2, validSnapshots: 2, invalidEntries: 0, groupCount: 1, comparableGroups: 1, errors: 0, warnings: 0 });
  assert.equal(stableIndex.groups[0].groupName, '案件上層');
  assert.equal(stableIndex.groups[0].snapshotCount, 2);
  assert.equal(stableIndex.groups[0].latestGeneratedAt, TIMES.second);
  assert.match(stableIndex.indexFingerprint, /^PSI-[0-9A-F]{24}$/);
  assert.equal(JSON.stringify(stableIndex).includes(tempRoot), false);
  assert.doesNotMatch(JSON.stringify(stableIndex), /reviewer|basis|AppData|Desktop/i);
  assert.equal(Index.inspectSnapshotDirectory(stableDirectory, { now: new Date('2026-07-23T04:00:00.000Z') }).indexFingerprint, stableIndex.indexFingerprint);
  assert.equal(directoryDigest(stableDirectory), stableDigest);
  assert.match(Index.formatSummary(stableIndex), /可比較 1/);

  const stableComparison = Index.compareLatestSnapshots(stableDirectory, { now: TIMES.index });
  assert.equal(stableComparison.status, 'ready');
  assert.equal(stableComparison.latestComparison.kind, Compare.COMPARISON_KIND);
  assert.equal(stableComparison.latestComparison.sources.previous.generatedAt, TIMES.first);
  assert.equal(stableComparison.latestComparison.sources.current.generatedAt, TIMES.second);
  assert.equal(stableComparison.latestComparison.status, 'ready');
  assert.equal(directoryDigest(stableDirectory), stableDigest);
  const stableFocused = Index.compareLatestSnapshots(stableDirectory, { now: TIMES.index, onlyBlocking: true });
  assert.equal(stableFocused.status, stableComparison.status);
  assert.equal(stableFocused.latestComparison.kind, Compare.COMPARISON_VIEW_KIND);
  assert.equal(stableFocused.latestComparison.view.fingerprintScope, 'all-changes');
  assert.equal(stableFocused.latestComparison.view.displayedChangeCount, 0);
  assert.equal(stableFocused.latestComparison.comparisonFingerprint, stableComparison.latestComparison.comparisonFingerprint);

  const singleDirectory = path.join(tempRoot, 'single');
  writeSnapshot(singleDirectory, stableFirst);
  const single = Index.inspectSnapshotDirectory(singleDirectory, { now: TIMES.index });
  assert.equal(single.integrityStatus, 'review');
  assert.equal(single.status, 'review');
  assert.equal(single.issues.some(item => item.code === 'insufficient-snapshots'), true);
  assert.equal(Index.compareLatestSnapshots(singleDirectory, { now: TIMES.index }).latestComparison, null);

  const regressionDirectory = path.join(tempRoot, 'regression');
  writeSnapshot(regressionDirectory, makeSnapshot('ready', 'A', TIMES.first));
  writeSnapshot(regressionDirectory, makeSnapshot('review', 'B', TIMES.second));
  const regressionIndex = Index.inspectSnapshotDirectory(regressionDirectory, { now: TIMES.index });
  assert.equal(regressionIndex.integrityStatus, 'ready');
  assert.equal(regressionIndex.status, 'review');
  const regression = Index.compareLatestSnapshots(regressionDirectory, { now: TIMES.index, onlyBlocking: true });
  assert.equal(regression.status, 'blocked');
  assert.equal(regression.latestComparison.status, 'blocked');
  assert.equal(regression.latestComparison.kind, Compare.COMPARISON_VIEW_KIND);
  assert.deepEqual(regression.latestComparison.changes.map(item => `${item.change}:${item.caseName}`), ['regressed:案件甲']);

  const mixedDirectory = path.join(tempRoot, 'mixed');
  writeSnapshot(mixedDirectory, makeSnapshot('ready', 'A', TIMES.first, '案件上層甲'));
  writeSnapshot(mixedDirectory, makeSnapshot('ready', 'B', TIMES.second, '案件上層甲'));
  writeSnapshot(mixedDirectory, makeSnapshot('ready', 'C', TIMES.first, '案件上層乙'));
  writeSnapshot(mixedDirectory, makeSnapshot('ready', 'D', TIMES.second, '案件上層乙'));
  const mixed = Index.inspectSnapshotDirectory(mixedDirectory, { now: TIMES.index });
  assert.equal(mixed.integrityStatus, 'review');
  assert.equal(mixed.status, 'review');
  assert.equal(mixed.groups.length, 2);
  assert.equal(mixed.issues.some(item => item.code === 'multiple-portfolio-groups'), true);
  const mixedCompare = Index.compareLatestSnapshots(mixedDirectory, { now: TIMES.index });
  assert.equal(mixedCompare.status, 'blocked');
  assert.equal(mixedCompare.latestComparison, null);
  assert.equal(mixedCompare.issues.some(item => item.code === 'latest-comparison-requires-single-group'), true);

  const duplicateTimeDirectory = path.join(tempRoot, 'duplicate-time');
  writeSnapshot(duplicateTimeDirectory, makeSnapshot('ready', 'A', TIMES.first));
  writeSnapshot(duplicateTimeDirectory, makeSnapshot('ready', 'B', TIMES.first));
  const duplicateTime = Index.inspectSnapshotDirectory(duplicateTimeDirectory, { now: TIMES.index });
  assert.equal(duplicateTime.status, 'blocked');
  assert.equal(duplicateTime.issues.some(item => item.code === 'duplicate-snapshot-time'), true);

  const invalidDirectory = path.join(tempRoot, 'invalid');
  fs.mkdirSync(invalidDirectory);
  writeSnapshot(invalidDirectory, stableFirst, 'renamed.json');
  fs.writeFileSync(path.join(invalidDirectory, 'broken.json'), '{', 'utf8');
  fs.writeFileSync(path.join(invalidDirectory, 'note.txt'), 'internal note', 'utf8');
  fs.mkdirSync(path.join(invalidDirectory, 'nested'));
  const invalid = Index.inspectSnapshotDirectory(invalidDirectory, { now: TIMES.index });
  assert.equal(invalid.status, 'blocked');
  assert.equal(invalid.summary.validSnapshots, 0);
  assert.equal(invalid.issues.some(item => item.code === 'snapshot-filename-mismatch'), true);
  assert.equal(invalid.issues.some(item => item.code === 'invalid-snapshot-file'), true);
  assert.equal(invalid.issues.some(item => item.code === 'unexpected-snapshot-entry'), true);
  assert.equal(invalid.issues.some(item => item.code === 'unsafe-snapshot-entry'), true);

  const duplicateKeyDirectory = path.join(tempRoot, 'duplicate-key');
  const duplicateKeyPath = writeSnapshot(duplicateKeyDirectory, stableFirst);
  fs.writeFileSync(duplicateKeyPath, fs.readFileSync(duplicateKeyPath, 'utf8').replace('"schemaVersion": 1', '"schemaVersion": 1,\n  "schemaVersion": 1'), 'utf8');
  const duplicateKey = Index.inspectSnapshotDirectory(duplicateKeyDirectory, { now: TIMES.index });
  assert.equal(duplicateKey.status, 'blocked');
  assert.equal(duplicateKey.issues.some(item => item.code === 'invalid-snapshot-file'), true);

  const hardlinkDirectory = path.join(tempRoot, 'hardlink');
  const hardlinkSource = writeSnapshot(hardlinkDirectory, stableFirst);
  fs.linkSync(hardlinkSource, path.join(hardlinkDirectory, 'alias.json'));
  const hardlinked = Index.inspectSnapshotDirectory(hardlinkDirectory, { now: TIMES.index });
  assert.equal(hardlinked.status, 'blocked');
  assert.equal(hardlinked.issues.filter(item => item.code === 'hardlinked-snapshot-entry').length, 2);

  const emptyDirectory = path.join(tempRoot, 'empty');
  fs.mkdirSync(emptyDirectory);
  const empty = Index.inspectSnapshotDirectory(emptyDirectory, { now: TIMES.index });
  assert.equal(empty.status, 'blocked');
  assert.equal(empty.issues.some(item => item.code === 'snapshot-directory-empty'), true);

  const indexRaceDirectory = path.join(tempRoot, 'index-race');
  const indexRacePath = writeSnapshot(indexRaceDirectory, stableFirst);
  const indexRace = Index.inspectSnapshotDirectory(indexRaceDirectory, {
    now: TIMES.index,
    beforeFinalize() { fs.appendFileSync(indexRacePath, ' ', 'utf8'); },
  });
  assert.equal(indexRace.status, 'blocked');
  assert.equal(indexRace.issues.some(item => item.code === 'snapshot-directory-changed-during-read'), true);

  const comparisonRaceDirectory = path.join(tempRoot, 'comparison-race');
  writeSnapshot(comparisonRaceDirectory, stableFirst);
  writeSnapshot(comparisonRaceDirectory, stableSecond);
  const comparisonRace = Index.compareLatestSnapshots(comparisonRaceDirectory, {
    now: TIMES.index,
    afterLatestCompare() { writeSnapshot(comparisonRaceDirectory, makeSnapshot('ready', 'A', TIMES.third)); },
  });
  assert.equal(comparisonRace.status, 'blocked');
  assert.equal(comparisonRace.integrityStatus, 'blocked');
  assert.equal(comparisonRace.issues.some(item => item.code === 'snapshot-directory-changed-during-latest-comparison'), true);

  const realLinkedDirectory = path.join(tempRoot, 'real-linked');
  const linkedDirectory = path.join(tempRoot, 'linked');
  fs.mkdirSync(realLinkedDirectory);
  try {
    fs.symlinkSync(realLinkedDirectory, linkedDirectory, 'junction');
    assert.throws(() => Index.inspectSnapshotDirectory(linkedDirectory), /實體資料夾/);
    fs.unlinkSync(linkedDirectory);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
  }

  const stableCli = cli(['--directory', stableDirectory, '--json']);
  assert.equal(stableCli.status, 0, stableCli.stderr || stableCli.stdout);
  assert.equal(JSON.parse(stableCli.stdout).status, 'ready');
  const stableCompareCli = cli(['--directory', stableDirectory, '--compare-latest', '--only-blocking', '--json']);
  assert.equal(stableCompareCli.status, 0, stableCompareCli.stderr || stableCompareCli.stdout);
  assert.equal(JSON.parse(stableCompareCli.stdout).latestComparison.view.displayedChangeCount, 0);
  assert.equal(cli(['--directory', singleDirectory, '--json']).status, 1);
  const blockedCli = cli(['--directory', regressionDirectory, '--compare-latest', '--json']);
  assert.equal(blockedCli.status, 2, blockedCli.stderr || blockedCli.stdout);
  assert.equal(JSON.parse(blockedCli.stdout).latestComparison.status, 'blocked');
  assert.equal(cli(['--help']).status, 0);
  assert.equal(cli([]).status, 3);
  assert.equal(cli(['--directory', stableDirectory, '--only-blocking']).status, 3);
  assert.equal(cli(['--unknown']).status, 3);
  assert.equal(directoryDigest(stableDirectory), stableDigest);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment portfolio snapshot index OK');
