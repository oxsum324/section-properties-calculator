'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Portfolio = require('./attachment-case-governance-portfolio.js');
const Compare = require('./attachment-case-governance-portfolio-compare.js');

const TIMES = {
  previous: '2026-07-22T01:00:00.000Z',
  current: '2026-07-22T02:00:00.000Z',
  compare: new Date('2026-07-22T03:00:00.000Z'),
};

function makeCase(caseName, status, token, overrides = {}) {
  const defaults = status === 'ready' ? {
    packageStatus: 'ready',
    chainStatus: 'valid',
    pendingAdditions: 0,
    issueCodes: [],
    nextActionCodes: ['internal-archive-review'],
  } : status === 'review' ? {
    packageStatus: 'ready',
    chainStatus: 'review',
    pendingAdditions: 1,
    issueCodes: ['chain-advancement-pending'],
    nextActionCodes: ['advance-trusted-baseline'],
  } : {
    packageStatus: 'ready',
    chainStatus: 'blocked',
    pendingAdditions: 0,
    issueCodes: ['chain-disconnected'],
    nextActionCodes: ['repair-trusted-baseline-chain'],
  };
  return {
    caseName,
    status,
    caseFingerprint: `CAS-${token.repeat(24)}`,
    governanceFingerprint: `GOV-${token.repeat(24)}`,
    packageStatus: defaults.packageStatus,
    chainStatus: defaults.chainStatus,
    currentReceiptCount: 2,
    pendingAdditions: defaults.pendingAdditions,
    issueCodes: defaults.issueCodes,
    nextActionCodes: defaults.nextActionCodes,
    ...overrides,
  };
}

function makeSnapshot(cases, token, generatedAt, options = {}) {
  const sortedCases = [...cases].sort((left, right) => Compare.compareOrdinal(left.caseName, right.caseName));
  const issues = options.issues || [];
  const summary = {
    readyCases: sortedCases.filter(item => item.status === 'ready').length,
    reviewCases: sortedCases.filter(item => item.status === 'review').length,
    blockedCases: sortedCases.filter(item => item.status === 'blocked').length,
    errors: issues.filter(item => item.level === 'error').length,
    warnings: issues.filter(item => item.level === 'warn').length,
  };
  const status = summary.errors || summary.blockedCases ? 'blocked' : summary.reviewCases ? 'review' : 'ready';
  const triage = Portfolio.buildTriage(sortedCases, issues);
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
    discovery: {
      parentName: '案件上層',
      caseCount: sortedCases.length,
      ignoredDirectoryCount: 0,
      ignoredDirectories: [],
    },
    summary,
    triage,
    cases: sortedCases,
    issues,
    nextActions: status === 'ready'
      ? [{ code: 'internal-archive-review', message: '內部歸檔複核。', cases: sortedCases.map(item => item.caseName) }]
      : [{ code: 'review-current-portfolio', message: '依目前總覽處理。', cases: sortedCases.filter(item => item.status !== 'ready').map(item => item.caseName) }],
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function fileDigest(directory) {
  const rows = fs.readdirSync(directory).sort().map(name => {
    const bytes = fs.readFileSync(path.join(directory, name));
    return `${name}:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  });
  return crypto.createHash('sha256').update(rows.join('\n'), 'utf8').digest('hex');
}

function cli(args) {
  return spawnSync(process.execPath, [path.join(__dirname, 'attachment-case-governance-portfolio-compare.js'), ...args], { encoding: 'utf8' });
}

assert.equal(Compare.COMPARISON_KIND, 'formal-attachment-case-governance-portfolio-comparison.v1');
assert.equal(Compare.COMPARISON_VIEW_KIND, 'formal-attachment-case-governance-portfolio-comparison-view.v1');
assert.match(Compare.COMPARISON_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.deepEqual(Compare.parseArgs(['--previous', 'old.json', '--current', 'new.json', '--json']), {
  json: true,
  onlyBlocking: false,
  changeTypes: [],
  previous: 'old.json',
  current: 'new.json',
});
assert.deepEqual(Compare.parseArgs(['--change', 'added', '--change', 'regressed']), {
  json: false,
  onlyBlocking: false,
  changeTypes: ['regressed', 'added'],
});
assert.throws(() => Compare.parseArgs(['--previous']), /缺少 JSON 路徑/);
assert.throws(() => Compare.parseArgs(['--change']), /缺少差異類型/);
assert.throws(() => Compare.parseArgs(['--change', 'unknown']), /不支援的差異類型/);
assert.throws(() => Compare.parseArgs(['--only-blocking', '--change', 'added']), /不得與 --change 同時使用/);
assert.throws(() => Compare.parseArgs(['--unknown']), /未知參數/);
assert.match(Compare.usage(), /未套用 --only-actionable 或 --priority/);
assert.match(Compare.usage(), /fingerprint|指紋/i);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-portfolio-compare-'));
try {
  const previousCases = [
    makeCase('案件甲', 'ready', 'A'),
    makeCase('案件乙', 'review', 'B'),
    makeCase('案件丙', 'blocked', 'C'),
    makeCase('案件丁', 'ready', 'D'),
    makeCase('案件戊', 'ready', 'E'),
  ];
  const currentCases = [
    makeCase('案件甲', 'review', '1'),
    makeCase('案件乙', 'ready', '2'),
    makeCase('案件丙', 'blocked', '3', { issueCodes: ['chain-fork'], nextActionCodes: ['repair-trusted-baseline-chain'] }),
    makeCase('案件戊', 'ready', 'E'),
    makeCase('案件己', 'blocked', '4'),
  ];
  const previous = makeSnapshot(previousCases, 'A', TIMES.previous);
  const current = makeSnapshot(currentCases, 'B', TIMES.current);
  Compare.validateSnapshot(previous, '前次');
  Compare.validateSnapshot(current, '目前');

  const previousPath = path.join(tempRoot, 'previous.json');
  const currentPath = path.join(tempRoot, 'current.json');
  writeJson(previousPath, previous);
  writeJson(currentPath, current);
  const before = fileDigest(tempRoot);
  const result = Compare.compareFiles(previousPath, currentPath, { now: TIMES.compare });
  assert.equal(result.kind, Compare.COMPARISON_KIND);
  assert.equal(result.status, 'blocked');
  assert.match(result.comparisonFingerprint, /^CMP-[0-9A-F]{24}$/);
  assert.deepEqual(result.summary, {
    added: 1,
    removed: 1,
    improved: 1,
    regressed: 1,
    changed: 1,
    unchanged: 1,
    portfolioChanged: true,
  });
  assert.deepEqual(result.changes.map(item => `${item.change}:${item.caseName}`), [
    'regressed:案件甲',
    'added:案件己',
    'removed:案件丁',
    'improved:案件乙',
    'changed:案件丙',
    'unchanged:案件戊',
  ]);
  assert.equal(result.changes.find(item => item.caseName === '案件甲').currentPriority, 'P1');
  assert.equal(result.changes.find(item => item.caseName === '案件乙').previousPriority, 'P1');
  assert.deepEqual(result.changes.find(item => item.caseName === '案件丙').addedIssueCodes, ['chain-fork']);
  assert.deepEqual(result.changes.find(item => item.caseName === '案件丙').resolvedIssueCodes, ['chain-disconnected']);
  assert.deepEqual(result.nextActions.map(item => item.code), [
    'repair-current-portfolio',
    'review-regressions',
    'review-added-cases',
    'confirm-removed-cases',
    'confirm-improvements',
    'review-same-status-changes',
  ]);
  assert.equal(fileDigest(tempRoot), before);
  assert.equal(JSON.stringify(result).includes(tempRoot), false);
  assert.doesNotMatch(JSON.stringify(result), /AppData|Desktop|reviewer|basis/i);
  assert.match(Compare.formatSummary(result), /新增 1；移除 1；改善 1；惡化 1/);
  assert.match(Compare.formatSummary(result), /案件甲：regressed/);
  assert.equal(
    Compare.compareFiles(previousPath, currentPath, { now: new Date('2026-07-22T04:00:00.000Z') }).comparisonFingerprint,
    result.comparisonFingerprint,
  );

  const blockingView = Compare.buildFilteredView(result, { onlyBlocking: true });
  assert.equal(blockingView.kind, Compare.COMPARISON_VIEW_KIND);
  assert.equal(blockingView.status, result.status);
  assert.equal(blockingView.comparisonFingerprint, result.comparisonFingerprint);
  assert.deepEqual(blockingView.summary, result.summary);
  assert.deepEqual(blockingView.view, {
    filters: { onlyBlocking: true, changeTypes: [] },
    fingerprintScope: 'all-changes',
    fullChangeCount: 6,
    displayedChangeCount: 3,
    hiddenChangeCount: 3,
    fullNextActionCount: 6,
    displayedNextActionCount: 4,
  });
  assert.deepEqual(blockingView.changes.map(item => `${item.change}:${item.caseName}`), [
    'regressed:案件甲',
    'added:案件己',
    'changed:案件丙',
  ]);
  assert.deepEqual(blockingView.nextActions.map(item => item.code), [
    'repair-current-portfolio',
    'review-regressions',
    'review-added-cases',
    'review-same-status-changes',
  ]);
  assert.equal(result.kind, Compare.COMPARISON_KIND);
  assert.equal(result.changes.length, 6);
  assert.match(Compare.formatSummary(blockingView), /顯示篩選：目前阻擋或惡化；顯示 3\/6；指紋範圍 all-changes/);

  const selectedView = Compare.buildFilteredView(result, { changeTypes: ['added', 'regressed', 'added'] });
  assert.deepEqual(selectedView.view.filters.changeTypes, ['regressed', 'added']);
  assert.deepEqual(selectedView.changes.map(item => item.caseName), ['案件甲', '案件己']);
  assert.equal(selectedView.status, result.status);
  assert.equal(selectedView.comparisonFingerprint, result.comparisonFingerprint);

  const blockedCli = cli(['--previous', previousPath, '--current', currentPath, '--json']);
  assert.equal(blockedCli.status, 2, blockedCli.stderr || blockedCli.stdout);
  assert.equal(JSON.parse(blockedCli.stdout).status, 'blocked');
  const blockingCli = cli(['--previous', previousPath, '--current', currentPath, '--only-blocking', '--json']);
  assert.equal(blockingCli.status, blockedCli.status, blockingCli.stderr || blockingCli.stdout);
  const blockingCliResult = JSON.parse(blockingCli.stdout);
  assert.equal(blockingCliResult.kind, Compare.COMPARISON_VIEW_KIND);
  assert.equal(blockingCliResult.comparisonFingerprint, JSON.parse(blockedCli.stdout).comparisonFingerprint);
  assert.deepEqual(blockingCliResult.changes.map(item => item.caseName), ['案件甲', '案件己', '案件丙']);
  assert.doesNotMatch(blockingCli.stdout, /案件丁|案件乙|案件戊/);
  const selectedCli = cli(['--previous', previousPath, '--current', currentPath, '--change', 'added', '--change', 'regressed', '--json']);
  assert.equal(selectedCli.status, blockedCli.status, selectedCli.stderr || selectedCli.stdout);
  assert.deepEqual(JSON.parse(selectedCli.stdout).changes.map(item => item.caseName), ['案件甲', '案件己']);

  const stablePrevious = makeSnapshot([makeCase('穩定案件', 'ready', '5')], 'C', TIMES.previous);
  const stableCurrent = JSON.parse(JSON.stringify(stablePrevious));
  stableCurrent.generatedAt = TIMES.current;
  const stablePreviousPath = path.join(tempRoot, 'stable-previous.json');
  const stableCurrentPath = path.join(tempRoot, 'stable-current.json');
  writeJson(stablePreviousPath, stablePrevious);
  writeJson(stableCurrentPath, stableCurrent);
  const stable = Compare.compareFiles(stablePreviousPath, stableCurrentPath, { now: TIMES.compare });
  assert.equal(stable.status, 'ready');
  assert.equal(stable.summary.portfolioChanged, false);
  assert.deepEqual(stable.summary, { added: 0, removed: 0, improved: 0, regressed: 0, changed: 0, unchanged: 1, portfolioChanged: false });
  assert.deepEqual(stable.nextActions.map(item => item.code), ['archive-stable-comparison']);
  assert.equal(cli(['--previous', stablePreviousPath, '--current', stableCurrentPath, '--json']).status, 0);
  const stableBlockingCli = cli(['--previous', stablePreviousPath, '--current', stableCurrentPath, '--only-blocking', '--json']);
  assert.equal(stableBlockingCli.status, 0, stableBlockingCli.stderr || stableBlockingCli.stdout);
  assert.equal(JSON.parse(stableBlockingCli.stdout).view.displayedChangeCount, 0);

  const reviewPrevious = makeSnapshot([makeCase('複核案件', 'review', '6')], 'D', TIMES.previous);
  const reviewCurrent = JSON.parse(JSON.stringify(reviewPrevious));
  reviewCurrent.generatedAt = TIMES.current;
  const review = Compare.compareSnapshots(reviewPrevious, reviewCurrent, { now: TIMES.compare });
  assert.equal(review.status, 'review');
  assert.equal(review.summary.unchanged, 1);

  const metadataCurrent = JSON.parse(JSON.stringify(stableCurrent));
  metadataCurrent.portfolioFingerprint = `POR-${'E'.repeat(24)}`;
  const metadataChanged = Compare.compareSnapshots(stablePrevious, metadataCurrent, { now: TIMES.compare });
  assert.equal(metadataChanged.status, 'review');
  assert.equal(metadataChanged.summary.portfolioChanged, true);
  assert.equal(metadataChanged.summary.unchanged, 1);

  const racePath = path.join(tempRoot, 'race-current.json');
  writeJson(racePath, stableCurrent);
  const raced = Compare.compareFiles(stablePreviousPath, racePath, {
    now: TIMES.compare,
    beforeFinalize() { fs.appendFileSync(racePath, ' ', 'utf8'); },
  });
  assert.equal(raced.status, 'blocked');
  assert.equal(raced.issues.some(item => item.code === 'comparison-source-changed-during-read'), true);
  assert.deepEqual(raced.nextActions.map(item => item.code), ['rerun-after-snapshots-stable']);

  const filteredPath = path.join(tempRoot, 'filtered.json');
  writeJson(filteredPath, Portfolio.buildFilteredView(stablePrevious, { onlyActionable: true }));
  assert.throws(() => Compare.readSnapshotFile(filteredPath, '篩選檔'), /篩選視圖/);
  assert.equal(cli(['--previous', filteredPath, '--current', stableCurrentPath]).status, 3);

  const duplicatePath = path.join(tempRoot, 'duplicate.json');
  const duplicateText = JSON.stringify(stablePrevious).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1');
  fs.writeFileSync(duplicatePath, duplicateText, 'utf8');
  assert.throws(() => Compare.readSnapshotFile(duplicatePath, '重複鍵檔'), /重複 JSON 欄位/);

  const badSummary = JSON.parse(JSON.stringify(stablePrevious));
  badSummary.summary.readyCases = 99;
  assert.throws(() => Compare.validateSnapshot(badSummary, '錯誤摘要'), /summary 與案件／問題內容不一致/);
  const extraField = JSON.parse(JSON.stringify(stablePrevious));
  extraField.untrusted = true;
  assert.throws(() => Compare.validateSnapshot(extraField, '額外欄位'), /封閉格式/);

  assert.equal(cli(['--help']).status, 0);
  assert.equal(cli([]).status, 3);
  assert.equal(cli(['--change', 'unknown']).status, 3);
  assert.equal(cli(['--only-blocking', '--change', 'added']).status, 3);
  assert.equal(cli(['--unknown']).status, 3);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment portfolio snapshot comparison OK');
