'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Portfolio = require('./attachment-case-governance-portfolio.js');
const Snapshot = require('./attachment-case-governance-portfolio-snapshot.js');
const Trend = require('./attachment-case-governance-portfolio-snapshot-trend.js');

const TIMES = {
  first: '2026-07-22T01:00:00.000Z',
  second: '2026-07-22T02:00:00.000Z',
  third: '2026-07-22T03:00:00.000Z',
  fourth: '2026-07-22T04:00:00.000Z',
  trend: new Date('2026-07-22T04:00:00.000Z'),
};

function makeCase(caseName, status, token) {
  const state = status === 'ready'
    ? { packageStatus: 'ready', chainStatus: 'valid', pendingAdditions: 0, issueCodes: [], nextActionCodes: ['internal-archive-review'] }
    : status === 'review'
      ? { packageStatus: 'ready', chainStatus: 'review', pendingAdditions: 1, issueCodes: ['chain-advancement-pending'], nextActionCodes: ['advance-trusted-baseline'] }
      : { packageStatus: 'blocked', chainStatus: 'blocked', pendingAdditions: 0, issueCodes: ['chain-disconnected'], nextActionCodes: ['repair-trusted-baseline-chain'] };
  return {
    caseName,
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

function makeSnapshot(cases, token, generatedAt, parentName = '案件上層', issues = []) {
  const sortedCases = [...cases].sort((left, right) => left.caseName.localeCompare(right.caseName));
  const status = issues.some(item => item.level === 'error') || sortedCases.some(item => item.status === 'blocked')
    ? 'blocked'
    : sortedCases.some(item => item.status === 'review') ? 'review' : 'ready';
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
    discovery: { parentName, caseCount: sortedCases.length, ignoredDirectoryCount: 0, ignoredDirectories: [] },
    summary: {
      readyCases: sortedCases.filter(item => item.status === 'ready').length,
      reviewCases: sortedCases.filter(item => item.status === 'review').length,
      blockedCases: sortedCases.filter(item => item.status === 'blocked').length,
      errors: issues.filter(item => item.level === 'error').length,
      warnings: issues.filter(item => item.level === 'warn').length,
    },
    triage: Portfolio.buildTriage(sortedCases, issues),
    cases: sortedCases,
    issues,
    nextActions: [{ code: 'follow-current-status', message: '依目前狀態處理。', cases: sortedCases.map(item => item.caseName) }],
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
  return spawnSync(process.execPath, [path.join(__dirname, 'attachment-case-governance-portfolio-snapshot-trend.js'), ...args], { encoding: 'utf8' });
}

assert.equal(Trend.TREND_KIND, 'formal-attachment-case-governance-portfolio-snapshot-trend.v1');
assert.match(Trend.TREND_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.match(Trend.TREND_BOUNDARY_INSTRUCTION, /不代表.*風險評分/);
assert.deepEqual(Trend.parseArgs(['--directory', 'C:/snapshots', '--json']), { json: true, directory: 'C:/snapshots' });
assert.throws(() => Trend.parseArgs(['--directory']), /缺少路徑值/);
assert.throws(() => Trend.parseArgs(['--unknown']), /未知參數/);
assert.match(Trend.usage(), /全部連續快照/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-portfolio-snapshot-trend-'));
try {
  const stableDirectory = path.join(tempRoot, 'stable');
  const stableFirst = makeSnapshot([makeCase('案件甲', 'ready', 'A')], 'A', TIMES.first);
  const stableSecond = makeSnapshot([makeCase('案件甲', 'ready', 'A')], 'A', TIMES.second);
  writeSnapshot(stableDirectory, stableFirst);
  writeSnapshot(stableDirectory, stableSecond);
  const stableDigest = directoryDigest(stableDirectory);
  const stable = Trend.analyzeSnapshotTrend(stableDirectory, { now: TIMES.trend });
  assert.equal(stable.kind, Trend.TREND_KIND);
  assert.equal(stable.status, 'ready');
  assert.equal(stable.integrityStatus, 'ready');
  assert.equal(stable.currentHealth, 'ready');
  assert.equal(stable.latestTransitionStatus, 'ready');
  assert.equal(stable.attentionStatus, 'ready');
  assert.equal(stable.analysisComplete, true);
  assert.equal(stable.summary.snapshotCount, 2);
  assert.equal(stable.summary.transitionCount, 1);
  assert.equal(stable.summary.trackedCases, 1);
  assert.equal(stable.summary.unchanged, 1);
  assert.equal(stable.summary.attentionP0 + stable.summary.attentionP1 + stable.summary.attentionP2, 0);
  assert.equal(stable.caseTrends[0].attentionPriority, 'none');
  assert.deepEqual(stable.caseTrends[0].statusTrail.map(item => item.status), ['ready', 'ready']);
  assert.match(stable.trendFingerprint, /^TRD-[0-9A-F]{24}$/);
  assert.equal(Trend.analyzeSnapshotTrend(stableDirectory, { now: new Date('2026-07-23T04:00:00.000Z') }).trendFingerprint, stable.trendFingerprint);
  assert.equal(directoryDigest(stableDirectory), stableDigest);
  assert.equal(JSON.stringify(stable).includes(tempRoot), false);
  assert.doesNotMatch(JSON.stringify(stable), /reviewer|basis|AppData|Desktop|計算內容/i);
  assert.match(Trend.formatSummary(stable), /目前健康：ready；最新轉折：ready/);

  const recurringPortfolioIssue = { level: 'warn', code: 'portfolio-note', message: '僅供測試。', entries: [] };
  const progressDirectory = path.join(tempRoot, 'progress');
  writeSnapshot(progressDirectory, makeSnapshot([makeCase('案件甲', 'ready', 'A')], 'A', TIMES.first, '案件上層', [recurringPortfolioIssue]));
  writeSnapshot(progressDirectory, makeSnapshot([makeCase('案件甲', 'review', 'B'), makeCase('案件乙', 'blocked', 'C')], 'B', TIMES.second, '案件上層', [recurringPortfolioIssue]));
  writeSnapshot(progressDirectory, makeSnapshot([makeCase('案件甲', 'review', 'B'), makeCase('案件乙', 'ready', 'D')], 'C', TIMES.third));
  const progressDigest = directoryDigest(progressDirectory);
  const progress = Trend.analyzeSnapshotTrend(progressDirectory, { now: TIMES.trend });
  assert.equal(progress.status, 'review');
  assert.equal(progress.integrityStatus, 'ready');
  assert.equal(progress.currentHealth, 'review');
  assert.equal(progress.latestTransitionStatus, 'review');
  assert.equal(progress.attentionStatus, 'review');
  assert.equal(progress.summary.snapshotCount, 3);
  assert.equal(progress.summary.transitionCount, 2);
  assert.equal(progress.summary.trackedCases, 2);
  assert.equal(progress.summary.regressed, 1);
  assert.equal(progress.summary.added, 1);
  assert.equal(progress.summary.improved, 1);
  assert.equal(progress.summary.unchanged, 1);
  assert.equal(progress.summary.attentionP1, 1);
  const caseA = progress.caseTrends.find(item => item.caseName === '案件甲');
  const caseB = progress.caseTrends.find(item => item.caseName === '案件乙');
  assert.equal(caseA.attentionPriority, 'P1');
  assert.deepEqual(caseA.statusTrail.map(item => item.status), ['ready', 'review', 'review']);
  assert.deepEqual(caseA.activeRecurringIssueCodes, ['chain-advancement-pending']);
  assert.equal(caseB.attentionPriority, 'none');
  assert.deepEqual(caseB.statusTrail.map(item => item.status), ['missing', 'blocked', 'ready']);
  const recurringCaseIssue = progress.issueTrends.find(item => item.code === 'chain-advancement-pending');
  const recurringTopIssue = progress.issueTrends.find(item => item.code === 'portfolio-note');
  assert.equal(recurringCaseIssue.recurring, true);
  assert.equal(recurringCaseIssue.active, true);
  assert.equal(recurringCaseIssue.snapshotCount, 2);
  assert.equal(recurringCaseIssue.activeSinceAt, TIMES.second);
  assert.equal(recurringTopIssue.recurring, true);
  assert.equal(recurringTopIssue.active, false);
  assert.equal(recurringTopIssue.activeSinceAt, '');
  assert.equal(progress.nextActions.some(item => item.code === 'review-active-recurring-issues'), true);
  assert.equal(directoryDigest(progressDirectory), progressDigest);

  const regressionDirectory = path.join(tempRoot, 'regression');
  writeSnapshot(regressionDirectory, makeSnapshot([makeCase('案件甲', 'ready', 'A')], 'A', TIMES.first));
  writeSnapshot(regressionDirectory, makeSnapshot([makeCase('案件甲', 'review', 'B')], 'B', TIMES.second));
  const regression = Trend.analyzeSnapshotTrend(regressionDirectory, { now: TIMES.trend });
  assert.equal(regression.status, 'blocked');
  assert.equal(regression.currentHealth, 'review');
  assert.equal(regression.latestTransitionStatus, 'blocked');
  assert.equal(regression.attentionStatus, 'blocked');
  assert.equal(regression.caseTrends[0].attentionPriority, 'P0');
  assert.equal(regression.caseTrends[0].attentionReasons.includes('latest-regression'), true);

  const recoveredDirectory = path.join(tempRoot, 'recovered');
  writeSnapshot(recoveredDirectory, makeSnapshot([makeCase('案件甲', 'ready', 'A')], 'A', TIMES.first));
  writeSnapshot(recoveredDirectory, makeSnapshot([makeCase('案件甲', 'review', 'B')], 'B', TIMES.second));
  writeSnapshot(recoveredDirectory, makeSnapshot([makeCase('案件甲', 'ready', 'A')], 'C', TIMES.third));
  writeSnapshot(recoveredDirectory, makeSnapshot([makeCase('案件甲', 'ready', 'A')], 'C', TIMES.fourth));
  const recovered = Trend.analyzeSnapshotTrend(recoveredDirectory, { now: new Date('2026-07-22T05:00:00.000Z') });
  assert.equal(recovered.status, 'ready');
  assert.equal(recovered.currentHealth, 'ready');
  assert.equal(recovered.latestTransitionStatus, 'ready');
  assert.equal(recovered.attentionStatus, 'ready');
  assert.equal(recovered.summary.regressed, 1);
  assert.equal(recovered.summary.improved, 1);
  assert.equal(recovered.caseTrends[0].attentionPriority, 'none');

  const blockedDirectory = path.join(tempRoot, 'blocked');
  writeSnapshot(blockedDirectory, makeSnapshot([makeCase('案件甲', 'blocked', 'C')], 'C', TIMES.first));
  writeSnapshot(blockedDirectory, makeSnapshot([makeCase('案件甲', 'blocked', 'C')], 'C', TIMES.second));
  const blocked = Trend.analyzeSnapshotTrend(blockedDirectory, { now: TIMES.trend });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.currentHealth, 'blocked');
  assert.equal(blocked.caseTrends[0].attentionPriority, 'P0');

  const removalDirectory = path.join(tempRoot, 'removal');
  writeSnapshot(removalDirectory, makeSnapshot([makeCase('案件甲', 'ready', 'A'), makeCase('案件乙', 'ready', 'B')], 'A', TIMES.first));
  writeSnapshot(removalDirectory, makeSnapshot([makeCase('案件甲', 'ready', 'A')], 'B', TIMES.second));
  writeSnapshot(removalDirectory, makeSnapshot([makeCase('案件甲', 'ready', 'A')], 'B', TIMES.third));
  const removal = Trend.analyzeSnapshotTrend(removalDirectory, { now: TIMES.trend });
  const removedCase = removal.caseTrends.find(item => item.caseName === '案件乙');
  assert.equal(removedCase.currentStatus, 'missing');
  assert.equal(removedCase.attentionPriority, 'P2');
  assert.equal(removedCase.attentionReasons.includes('case-removed-from-current'), true);
  assert.equal(removedCase.missingSinceAt, TIMES.second);
  assert.equal(removal.summary.removedCurrentCases, 1);
  assert.equal(removal.latestTransitionStatus, 'ready');
  assert.equal(removal.attentionStatus, 'review');
  assert.equal(removal.status, 'review');

  const singleDirectory = path.join(tempRoot, 'single');
  writeSnapshot(singleDirectory, stableFirst);
  const single = Trend.analyzeSnapshotTrend(singleDirectory, { now: TIMES.trend });
  assert.equal(single.status, 'review');
  assert.equal(single.analysisComplete, false);
  assert.equal(single.latestTransitionStatus, 'not-available');
  assert.equal(single.attentionStatus, 'not-available');
  assert.equal(single.issues.some(item => item.code === 'insufficient-snapshots'), true);

  const mixedDirectory = path.join(tempRoot, 'mixed');
  writeSnapshot(mixedDirectory, makeSnapshot([makeCase('案件甲', 'ready', 'A')], 'A', TIMES.first, '案件上層甲'));
  writeSnapshot(mixedDirectory, makeSnapshot([makeCase('案件甲', 'ready', 'B')], 'B', TIMES.second, '案件上層乙'));
  const mixed = Trend.analyzeSnapshotTrend(mixedDirectory, { now: TIMES.trend });
  assert.equal(mixed.status, 'blocked');
  assert.equal(mixed.integrityStatus, 'blocked');
  assert.equal(mixed.analysisComplete, false);
  assert.equal(mixed.issues.some(item => item.code === 'trend-requires-single-group'), true);

  const invalidDirectory = path.join(tempRoot, 'invalid');
  writeSnapshot(invalidDirectory, stableFirst, 'renamed.json');
  const invalid = Trend.analyzeSnapshotTrend(invalidDirectory, { now: TIMES.trend });
  assert.equal(invalid.status, 'blocked');
  assert.equal(invalid.issues.some(item => item.code === 'snapshot-filename-mismatch'), true);

  const raceDirectory = path.join(tempRoot, 'race');
  const raceFirst = writeSnapshot(raceDirectory, stableFirst);
  writeSnapshot(raceDirectory, stableSecond);
  const race = Trend.analyzeSnapshotTrend(raceDirectory, {
    now: TIMES.trend,
    afterAnalyze() { fs.appendFileSync(raceFirst, ' ', 'utf8'); },
  });
  assert.equal(race.status, 'blocked');
  assert.equal(race.integrityStatus, 'blocked');
  assert.equal(race.issues.some(item => item.code === 'snapshot-directory-changed-during-trend-analysis'), true);

  const stableCli = cli(['--directory', stableDirectory, '--json']);
  assert.equal(stableCli.status, 0, stableCli.stderr || stableCli.stdout);
  assert.equal(JSON.parse(stableCli.stdout).status, 'ready');
  assert.equal(cli(['--directory', progressDirectory, '--json']).status, 1);
  assert.equal(cli(['--directory', singleDirectory, '--json']).status, 1);
  assert.equal(cli(['--directory', regressionDirectory, '--json']).status, 2);
  assert.equal(cli(['--help']).status, 0);
  assert.equal(cli([]).status, 3);
  assert.equal(cli(['--unknown']).status, 3);
  assert.equal(directoryDigest(stableDirectory), stableDigest);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment portfolio snapshot trend OK');
