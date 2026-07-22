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
const Disposition = require('./attachment-case-governance-portfolio-snapshot-trend-disposition.js');

const TIMES = {
  first: '2026-07-22T01:00:00.000Z',
  second: '2026-07-22T02:00:00.000Z',
  third: '2026-07-22T03:00:00.000Z',
  fourth: '2026-07-22T04:00:00.000Z',
  acknowledge: new Date('2026-07-22T05:00:00.000Z'),
  fifth: '2026-07-22T06:00:00.000Z',
  sixth: '2026-07-22T07:00:00.000Z',
  seventh: '2026-07-22T08:00:00.000Z',
  acknowledgeAgain: new Date('2026-07-22T08:30:00.000Z'),
  inspect: new Date('2026-07-22T09:00:00.000Z'),
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

function makeSnapshot(cases, token, generatedAt, parentName = '案件上層') {
  const sortedCases = [...cases].sort((left, right) => left.caseName.localeCompare(right.caseName));
  const status = sortedCases.some(item => item.status === 'blocked') ? 'blocked' : sortedCases.some(item => item.status === 'review') ? 'review' : 'ready';
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
      errors: 0,
      warnings: 0,
    },
    triage: Portfolio.buildTriage(sortedCases, []),
    cases: sortedCases,
    issues: [],
    nextActions: [{ code: 'follow-current-status', message: '依目前狀態處理。', cases: sortedCases.map(item => item.caseName) }],
  };
}

function writeSnapshot(directory, snapshot) {
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, Snapshot.snapshotFileName(snapshot));
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return filePath;
}

function directoryDigest(directory) {
  if (!fs.existsSync(directory)) return 'missing';
  const rows = fs.readdirSync(directory).sort().map(name => {
    const filePath = path.join(directory, name);
    const stat = fs.lstatSync(filePath);
    const hash = stat.isFile() ? crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex') : stat.isDirectory() ? 'directory' : 'special';
    return `${name}:${hash}`;
  });
  return crypto.createHash('sha256').update(rows.join('\n'), 'utf8').digest('hex');
}

function cli(args) {
  return spawnSync(process.execPath, [path.join(__dirname, 'attachment-case-governance-portfolio-snapshot-trend-disposition.js'), ...args], { encoding: 'utf8' });
}

function copyLedger(source, target) {
  fs.mkdirSync(target);
  fs.readdirSync(source).forEach(name => fs.copyFileSync(path.join(source, name), path.join(target, name)));
}

assert.equal(Disposition.DISPOSITION_KIND, 'formal-attachment-case-governance-trend-disposition.v1');
assert.equal(Disposition.DISPOSITION_STATE_KIND, 'formal-attachment-case-governance-trend-disposition-state.v1');
assert.match(Disposition.DISPOSITION_BOUNDARY_INSTRUCTION, /不得覆蓋目前工程／文件狀態/);
assert.match(Disposition.DISPOSITION_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.deepEqual(Disposition.parseArgs(['--directory', 'C:/snapshots', '--ledger', 'C:/ledger', '--json']), {
  json: true,
  acknowledge: false,
  caseRemovals: [],
  recurringIssues: [],
  directory: 'C:/snapshots',
  ledger: 'C:/ledger',
});
assert.deepEqual(Disposition.parseArgs(['--directory', 'C:/snapshots', '--ledger', 'C:/ledger', '--acknowledge', '--case-removal', '案件乙', '--recurring-issue', 'issue-a', '--reviewer', '王工程師', '--basis', '已確認']), {
  json: false,
  acknowledge: true,
  caseRemovals: ['案件乙'],
  recurringIssues: ['issue-a'],
  directory: 'C:/snapshots',
  ledger: 'C:/ledger',
  reviewer: '王工程師',
  basis: '已確認',
});
assert.throws(() => Disposition.parseArgs(['--directory']), /缺少值/);
assert.throws(() => Disposition.parseArgs(['--case-removal', '案件乙']), /只能搭配 --acknowledge/);
assert.throws(() => Disposition.parseArgs(['--acknowledge', '--reviewer', '甲', '--basis', '乙']), /至少需要/);
assert.throws(() => Disposition.parseArgs(['--acknowledge', '--case-removal', '案件乙']), /--reviewer 與 --basis/);
assert.throws(() => Disposition.parseArgs(['--unknown']), /未知參數/);
assert.match(Disposition.usage(), /不得覆蓋目前 blocked／review/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-trend-disposition-'));
try {
  const stableDirectory = path.join(tempRoot, 'stable-snapshots');
  const stableLedger = path.join(tempRoot, 'stable-ledger-not-created');
  writeSnapshot(stableDirectory, makeSnapshot([makeCase('案件甲', 'ready', 'A')], 'A', TIMES.first));
  writeSnapshot(stableDirectory, makeSnapshot([makeCase('案件甲', 'ready', 'A')], 'A', TIMES.second));
  const stableDigest = directoryDigest(stableDirectory);
  const stable = Disposition.inspectDispositionState(stableDirectory, stableLedger, { now: TIMES.inspect });
  assert.equal(stable.status, 'ready');
  assert.equal(stable.rawTrendStatus, 'ready');
  assert.equal(stable.effectiveAttentionStatus, 'ready');
  assert.equal(stable.summary.activeTargets, 0);
  assert.equal(stable.summary.receiptCount, 0);
  assert.match(stable.ledger.ledgerFingerprint, /^TAI-[0-9A-F]{24}$/);
  assert.match(stable.dispositionFingerprint, /^TDS-[0-9A-F]{24}$/);
  assert.equal(fs.existsSync(stableLedger), false);
  assert.equal(directoryDigest(stableDirectory), stableDigest);
  assert.equal(Disposition.inspectDispositionState(stableDirectory, stableLedger, { now: new Date('2026-07-23T09:00:00.000Z') }).dispositionFingerprint, stable.dispositionFingerprint);
  assert.equal(JSON.stringify(stable).includes(tempRoot), false);
  assert.doesNotMatch(JSON.stringify(stable), /reviewer|basis|AppData|Desktop|王工程師|現場確認/i);

  const removalDirectory = path.join(tempRoot, 'removal-snapshots');
  const removalLedger = path.join(tempRoot, 'removal-ledger');
  const caseA = makeCase('案件甲', 'ready', 'A');
  const caseB = makeCase('案件乙', 'ready', 'B');
  writeSnapshot(removalDirectory, makeSnapshot([caseA, caseB], 'A', TIMES.first));
  writeSnapshot(removalDirectory, makeSnapshot([caseA], 'B', TIMES.second));
  writeSnapshot(removalDirectory, makeSnapshot([caseA], 'B', TIMES.third));
  const removalDigest = directoryDigest(removalDirectory);
  const removalBefore = Disposition.inspectDispositionState(removalDirectory, removalLedger, { now: TIMES.acknowledge });
  assert.equal(removalBefore.status, 'review');
  assert.equal(removalBefore.rawTrendStatus, 'review');
  assert.equal(removalBefore.rawAttentionStatus, 'review');
  assert.equal(removalBefore.effectiveAttentionStatus, 'review');
  assert.equal(removalBefore.summary.activeTargets, 1);
  assert.deepEqual(removalBefore.targets.map(item => [item.type, item.key, item.evidenceAt, item.acknowledged]), [['case-removal', '案件乙', TIMES.second, false]]);
  assert.match(removalBefore.targets[0].evidenceFingerprint, /^DTE-[0-9A-F]{24}$/);

  const published = Disposition.publishDisposition(removalDirectory, removalLedger, {
    now: TIMES.acknowledge,
    caseRemovals: ['案件乙'],
    reviewer: '王工程師',
    basis: '案件已依主文確認移轉，不再列入本批次。',
  });
  assert.equal(published.status, 'ready');
  assert.equal(published.publication.published, true);
  assert.equal(published.publication.sequence, 1);
  assert.match(published.publication.receiptFingerprint, /^TRA-[0-9A-F]{24}$/);
  assert.equal(published.effectiveAttentionStatus, 'ready');
  assert.equal(published.rawAttentionStatus, 'review');
  assert.equal(published.summary.acknowledgedTargets, 1);
  assert.equal(published.caseAttention.find(item => item.caseName === '案件乙').effectivePriority, 'none');
  assert.equal(directoryDigest(removalDirectory), removalDigest);
  assert.equal(JSON.stringify(published).includes('王工程師'), false);
  assert.equal(JSON.stringify(published).includes('案件已依主文確認移轉'), false);
  const ledgerOne = Disposition.readLedgerStrict(removalLedger);
  assert.equal(ledgerOne.records.length, 1);
  assert.equal(ledgerOne.records[0].receipt.decision.reviewer, '王工程師');
  assert.equal(ledgerOne.records[0].receipt.decision.basis, '案件已依主文確認移轉，不再列入本批次。');
  assert.equal(ledgerOne.records[0].receipt.decision.formalAttachmentApproval, false);
  assert.equal(ledgerOne.records[0].receipt.previousReceiptFingerprint, '');
  assert.match(ledgerOne.ledgerFingerprint, /^TAI-[0-9A-F]{24}$/);
  const removalAfter = Disposition.inspectDispositionState(removalDirectory, removalLedger, { now: TIMES.inspect });
  assert.equal(removalAfter.status, 'ready');
  assert.equal(removalAfter.dispositionFingerprint, published.dispositionFingerprint);
  assert.throws(() => Disposition.publishDisposition(removalDirectory, removalLedger, {
    now: TIMES.inspect,
    caseRemovals: ['案件乙'],
    reviewer: '王工程師',
    basis: '重複確認。',
  }), /已有有效收據/);
  assert.equal(Disposition.readLedgerStrict(removalLedger).records.length, 1);

  writeSnapshot(removalDirectory, makeSnapshot([caseA], 'B', TIMES.fourth));
  const continuedRemoval = Disposition.inspectDispositionState(removalDirectory, removalLedger, { now: TIMES.acknowledge });
  assert.notEqual(continuedRemoval.trendFingerprint, removalAfter.trendFingerprint);
  assert.equal(continuedRemoval.targets[0].evidenceAt, TIMES.second);
  assert.equal(continuedRemoval.targets[0].acknowledged, true);
  assert.equal(continuedRemoval.status, 'ready');
  assert.equal(continuedRemoval.summary.staleReceiptCount, 0);

  writeSnapshot(removalDirectory, makeSnapshot([caseA, caseB], 'C', TIMES.fifth));
  const readded = Disposition.inspectDispositionState(removalDirectory, removalLedger, { now: new Date('2026-07-22T06:30:00.000Z') });
  assert.equal(readded.summary.activeTargets, 0);
  assert.equal(readded.summary.staleReceiptCount, 1);
  assert.equal(readded.status, 'review');

  writeSnapshot(removalDirectory, makeSnapshot([caseA], 'D', TIMES.sixth));
  const removedAgain = Disposition.inspectDispositionState(removalDirectory, removalLedger, { now: new Date('2026-07-22T07:30:00.000Z') });
  assert.equal(removedAgain.summary.activeTargets, 1);
  assert.equal(removedAgain.targets[0].evidenceAt, TIMES.sixth);
  assert.equal(removedAgain.targets[0].acknowledged, false);
  const publishedAgain = Disposition.publishDisposition(removalDirectory, removalLedger, {
    now: TIMES.acknowledgeAgain,
    caseRemovals: ['案件乙'],
    reviewer: '李工程師',
    basis: '第二次移除已重新確認。',
  });
  assert.equal(publishedAgain.publication.sequence, 2);
  const ledgerTwo = Disposition.readLedgerStrict(removalLedger);
  assert.equal(ledgerTwo.records.length, 2);
  assert.equal(ledgerTwo.records[1].receipt.previousReceiptFingerprint, ledgerTwo.records[0].receipt.receiptFingerprint);
  writeSnapshot(removalDirectory, makeSnapshot([caseA], 'D', TIMES.seventh));
  const removedAgainStable = Disposition.inspectDispositionState(removalDirectory, removalLedger, { now: TIMES.inspect });
  assert.equal(removedAgainStable.status, 'ready');
  assert.equal(removedAgainStable.summary.applicableReceiptCount, 1);
  assert.equal(removedAgainStable.summary.staleReceiptCount, 1);
  assert.equal(removedAgainStable.targets[0].acknowledged, true);

  const recurringDirectory = path.join(tempRoot, 'recurring-snapshots');
  const recurringLedger = path.join(tempRoot, 'recurring-ledger');
  const reviewCase = makeCase('案件甲', 'review', 'E');
  writeSnapshot(recurringDirectory, makeSnapshot([reviewCase], 'E', TIMES.first));
  writeSnapshot(recurringDirectory, makeSnapshot([reviewCase], 'E', TIMES.second));
  const recurringTrend = Trend.analyzeSnapshotTrend(recurringDirectory, { now: TIMES.acknowledge });
  assert.equal(recurringTrend.latestTransitionStatus, 'review');
  assert.equal(recurringTrend.issueTrends.find(item => item.code === 'chain-advancement-pending').activeSinceAt, TIMES.first);
  const recurringPublished = Disposition.publishDisposition(recurringDirectory, recurringLedger, {
    now: TIMES.acknowledge,
    recurringIssues: ['chain-advancement-pending'],
    reviewer: '陳工程師',
    basis: '反覆提醒已確認，案件仍依目前 review 流程處理。',
  });
  assert.equal(recurringPublished.targets[0].acknowledged, true);
  assert.equal(recurringPublished.caseAttention[0].acknowledgedReasons.includes('active-recurring-issue'), true);
  assert.equal(recurringPublished.caseAttention[0].remainingReasons.includes('current-priority-p1'), true);
  assert.equal(recurringPublished.effectiveAttentionStatus, 'review');
  assert.equal(recurringPublished.status, 'review');
  writeSnapshot(recurringDirectory, makeSnapshot([reviewCase, makeCase('案件乙', 'review', 'C')], 'D', TIMES.third));
  const recurringExpanded = Disposition.inspectDispositionState(recurringDirectory, recurringLedger, { now: TIMES.acknowledge });
  assert.equal(recurringExpanded.summary.staleReceiptCount, 1);
  assert.equal(recurringExpanded.targets.find(item => item.type === 'recurring-issue').acknowledged, false);
  assert.notEqual(recurringExpanded.targets.find(item => item.type === 'recurring-issue').evidenceFingerprint, recurringPublished.targets[0].evidenceFingerprint);

  const malformedLedger = path.join(tempRoot, 'malformed-ledger');
  copyLedger(removalLedger, malformedLedger);
  const malformedFile = path.join(malformedLedger, fs.readdirSync(malformedLedger).sort()[0]);
  fs.writeFileSync(malformedFile, fs.readFileSync(malformedFile, 'utf8').replace('"schemaVersion": 1', '"schemaVersion": 1,\n  "schemaVersion": 1'), 'utf8');
  const malformed = Disposition.inspectDispositionState(removalDirectory, malformedLedger, { now: TIMES.inspect });
  assert.equal(malformed.status, 'blocked');
  assert.equal(malformed.ledger.status, 'blocked');
  assert.equal(malformed.issues.some(item => item.code === 'invalid-disposition-ledger'), true);
  assert.equal(JSON.stringify(malformed).includes(malformedLedger), false);

  const brokenChainLedger = path.join(tempRoot, 'broken-chain-ledger');
  copyLedger(removalLedger, brokenChainLedger);
  const brokenFiles = fs.readdirSync(brokenChainLedger).sort();
  const brokenSecondPath = path.join(brokenChainLedger, brokenFiles[1]);
  const brokenSecond = JSON.parse(fs.readFileSync(brokenSecondPath, 'utf8'));
  brokenSecond.previousReceiptFingerprint = `TRA-${'F'.repeat(24)}`;
  brokenSecond.receiptFingerprint = '';
  brokenSecond.receiptFingerprint = Disposition.receiptFingerprint(brokenSecond);
  const brokenSecondName = Disposition.receiptFileName(brokenSecond);
  fs.unlinkSync(brokenSecondPath);
  fs.writeFileSync(path.join(brokenChainLedger, brokenSecondName), `${JSON.stringify(brokenSecond, null, 2)}\n`, 'utf8');
  assert.equal(Disposition.inspectDispositionState(removalDirectory, brokenChainLedger, { now: TIMES.inspect }).status, 'blocked');

  const renamedLedger = path.join(tempRoot, 'renamed-ledger');
  fs.mkdirSync(renamedLedger);
  fs.copyFileSync(path.join(removalLedger, fs.readdirSync(removalLedger).sort()[0]), path.join(renamedLedger, 'renamed.json'));
  assert.equal(Disposition.inspectDispositionState(removalDirectory, renamedLedger, { now: TIMES.inspect }).status, 'blocked');

  const unexpectedLedger = path.join(tempRoot, 'unexpected-ledger');
  fs.mkdirSync(unexpectedLedger);
  fs.writeFileSync(path.join(unexpectedLedger, 'note.txt'), 'internal', 'utf8');
  assert.equal(Disposition.inspectDispositionState(removalDirectory, unexpectedLedger, { now: TIMES.inspect }).status, 'blocked');

  const hardlinkLedger = path.join(tempRoot, 'hardlink-ledger');
  fs.mkdirSync(hardlinkLedger);
  const sourceReceipt = path.join(removalLedger, fs.readdirSync(removalLedger).sort()[0]);
  const hardlinkSourceCopy = path.join(tempRoot, 'hardlink-source-copy.json');
  fs.copyFileSync(sourceReceipt, hardlinkSourceCopy);
  fs.linkSync(hardlinkSourceCopy, path.join(hardlinkLedger, path.basename(sourceReceipt)));
  assert.equal(Disposition.inspectDispositionState(removalDirectory, hardlinkLedger, { now: TIMES.inspect }).status, 'blocked');

  assert.throws(() => Disposition.inspectDispositionState(removalDirectory, path.join(removalDirectory, 'ledger')), /完全分離/);

  const stagingRaceDirectory = path.join(tempRoot, 'staging-race-snapshots');
  const stagingRaceLedger = path.join(tempRoot, 'staging-race-ledger');
  writeSnapshot(stagingRaceDirectory, makeSnapshot([caseA, caseB], 'A', TIMES.first));
  writeSnapshot(stagingRaceDirectory, makeSnapshot([caseA], 'B', TIMES.second));
  writeSnapshot(stagingRaceDirectory, makeSnapshot([caseA], 'B', TIMES.third));
  assert.throws(() => Disposition.publishDisposition(stagingRaceDirectory, stagingRaceLedger, {
    now: TIMES.acknowledge,
    caseRemovals: ['案件乙'],
    reviewer: '測試者',
    basis: '暫存破壞測試。',
    beforeValidate({ stagingPath }) { fs.appendFileSync(stagingPath, 'x', 'utf8'); },
  }), /JSON|自我驗證/);
  assert.equal(fs.existsSync(stagingRaceLedger), false);

  const sourceRaceDirectory = path.join(tempRoot, 'source-race-snapshots');
  const sourceRaceLedger = path.join(tempRoot, 'source-race-ledger');
  writeSnapshot(sourceRaceDirectory, makeSnapshot([caseA, caseB], 'A', TIMES.first));
  writeSnapshot(sourceRaceDirectory, makeSnapshot([caseA], 'B', TIMES.second));
  writeSnapshot(sourceRaceDirectory, makeSnapshot([caseA], 'B', TIMES.third));
  assert.throws(() => Disposition.publishDisposition(sourceRaceDirectory, sourceRaceLedger, {
    now: TIMES.acknowledge,
    caseRemovals: ['案件乙'],
    reviewer: '測試者',
    basis: '來源競態測試。',
    afterPublish() { writeSnapshot(sourceRaceDirectory, makeSnapshot([caseA], 'B', TIMES.fourth)); },
  }), /發布期間.*趨勢已改變/);
  assert.equal(fs.existsSync(sourceRaceLedger), false);

  const inspectionRaceDirectory = path.join(tempRoot, 'inspection-race-snapshots');
  const inspectionRaceLedger = path.join(tempRoot, 'inspection-race-ledger');
  writeSnapshot(inspectionRaceDirectory, makeSnapshot([caseA, caseB], 'A', TIMES.first));
  writeSnapshot(inspectionRaceDirectory, makeSnapshot([caseA], 'B', TIMES.second));
  writeSnapshot(inspectionRaceDirectory, makeSnapshot([caseA], 'B', TIMES.third));
  const inspectionRace = Disposition.inspectDispositionState(inspectionRaceDirectory, inspectionRaceLedger, {
    now: TIMES.acknowledge,
    beforeStateFinalize() { writeSnapshot(inspectionRaceDirectory, makeSnapshot([caseA], 'B', TIMES.fourth)); },
  });
  assert.equal(inspectionRace.status, 'blocked');
  assert.equal(inspectionRace.issues.some(item => item.code === 'disposition-sources-changed-during-read'), true);

  const ledgerInspectionRaceDirectory = path.join(tempRoot, 'ledger-inspection-race-snapshots');
  const ledgerInspectionRaceLedger = path.join(tempRoot, 'ledger-inspection-race-ledger');
  writeSnapshot(ledgerInspectionRaceDirectory, makeSnapshot([caseA, caseB], 'A', TIMES.first));
  writeSnapshot(ledgerInspectionRaceDirectory, makeSnapshot([caseA], 'B', TIMES.second));
  writeSnapshot(ledgerInspectionRaceDirectory, makeSnapshot([caseA], 'B', TIMES.third));
  const ledgerInspectionRace = Disposition.inspectDispositionState(ledgerInspectionRaceDirectory, ledgerInspectionRaceLedger, {
    now: TIMES.acknowledge,
    beforeStateFinalize() {
      fs.mkdirSync(ledgerInspectionRaceLedger);
      const receiptName = fs.readdirSync(removalLedger).sort()[0];
      fs.copyFileSync(path.join(removalLedger, receiptName), path.join(ledgerInspectionRaceLedger, receiptName));
    },
  });
  assert.equal(ledgerInspectionRace.status, 'blocked');
  assert.equal(ledgerInspectionRace.issues.some(item => item.code === 'disposition-sources-changed-during-read'), true);

  const collisionDirectory = path.join(tempRoot, 'collision-snapshots');
  const collisionLedger = path.join(tempRoot, 'collision-ledger');
  writeSnapshot(collisionDirectory, makeSnapshot([caseA, caseB], 'A', TIMES.first));
  writeSnapshot(collisionDirectory, makeSnapshot([caseA], 'B', TIMES.second));
  writeSnapshot(collisionDirectory, makeSnapshot([caseA], 'B', TIMES.third));
  let collisionPath = '';
  assert.throws(() => Disposition.publishDisposition(collisionDirectory, collisionLedger, {
    now: TIMES.acknowledge,
    caseRemovals: ['案件乙'],
    reviewer: '測試者',
    basis: '目標競態測試。',
    linkSync(source, target) {
      collisionPath = target;
      fs.writeFileSync(target, 'external-writer', { encoding: 'utf8', flag: 'wx' });
      fs.linkSync(source, target);
    },
  }), /EEXIST|exist/i);
  assert.equal(fs.readFileSync(collisionPath, 'utf8'), 'external-writer');

  const lockedDirectory = path.join(tempRoot, 'locked-snapshots');
  const lockedLedger = path.join(tempRoot, 'locked-ledger');
  writeSnapshot(lockedDirectory, makeSnapshot([caseA, caseB], 'A', TIMES.first));
  writeSnapshot(lockedDirectory, makeSnapshot([caseA], 'B', TIMES.second));
  writeSnapshot(lockedDirectory, makeSnapshot([caseA], 'B', TIMES.third));
  const existingLock = path.join(tempRoot, `.${path.basename(lockedLedger)}.trend-disposition.lock`);
  fs.writeFileSync(existingLock, 'other-process-lock', { encoding: 'utf8', flag: 'wx' });
  assert.throws(() => Disposition.publishDisposition(lockedDirectory, lockedLedger, {
    now: TIMES.acknowledge,
    caseRemovals: ['案件乙'],
    reviewer: '測試者',
    basis: '排他鎖測試。',
  }), /EEXIST|exist/i);
  assert.equal(fs.readFileSync(existingLock, 'utf8'), 'other-process-lock');
  assert.equal(fs.existsSync(lockedLedger), false);

  const ledgerRaceDirectory = path.join(tempRoot, 'ledger-race-snapshots');
  const ledgerRaceLedger = path.join(tempRoot, 'ledger-race-ledger');
  writeSnapshot(ledgerRaceDirectory, makeSnapshot([caseA, caseB], 'A', TIMES.first));
  writeSnapshot(ledgerRaceDirectory, makeSnapshot([caseA], 'B', TIMES.second));
  writeSnapshot(ledgerRaceDirectory, makeSnapshot([caseA], 'B', TIMES.third));
  const ledgerRaceDigest = directoryDigest(ledgerRaceDirectory);
  assert.throws(() => Disposition.publishDisposition(ledgerRaceDirectory, ledgerRaceLedger, {
    now: TIMES.acknowledge,
    caseRemovals: ['案件乙'],
    reviewer: '測試者',
    basis: '收據鏈競態測試。',
    beforePublish({ receipt }) {
      const competing = JSON.parse(JSON.stringify(receipt));
      competing.decision.reviewer = '外部並行寫入者';
      competing.decision.basis = '有效但互相競爭的收據。';
      competing.receiptFingerprint = '';
      competing.receiptFingerprint = Disposition.receiptFingerprint(competing);
      fs.writeFileSync(path.join(ledgerRaceLedger, Disposition.receiptFileName(competing)), `${JSON.stringify(competing, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    },
  }), /序號|鏈結驗證/);
  const survivingRaceLedger = Disposition.readLedgerStrict(ledgerRaceLedger);
  assert.equal(survivingRaceLedger.records.length, 1);
  assert.equal(survivingRaceLedger.records[0].receipt.decision.reviewer, '外部並行寫入者');
  assert.equal(directoryDigest(ledgerRaceDirectory), ledgerRaceDigest);

  const cliWriteDirectory = path.join(tempRoot, 'cli-write-snapshots');
  const cliWriteLedger = path.join(tempRoot, 'cli-write-ledger');
  writeSnapshot(cliWriteDirectory, makeSnapshot([caseA, caseB], 'A', TIMES.first));
  writeSnapshot(cliWriteDirectory, makeSnapshot([caseA], 'B', TIMES.second));
  writeSnapshot(cliWriteDirectory, makeSnapshot([caseA], 'B', TIMES.third));
  const cliWriteDigest = directoryDigest(cliWriteDirectory);
  const writeCli = cli(['--directory', cliWriteDirectory, '--ledger', cliWriteLedger, '--acknowledge', '--case-removal', '案件乙', '--reviewer', 'CLI複核人', '--basis', 'CLI確認依據', '--json']);
  assert.equal(writeCli.status, 0, writeCli.stderr || writeCli.stdout);
  const writeCliResult = JSON.parse(writeCli.stdout);
  assert.equal(writeCliResult.publication.published, true);
  assert.equal(writeCliResult.summary.acknowledgedTargets, 1);
  assert.equal(writeCli.stdout.includes('CLI複核人'), false);
  assert.equal(writeCli.stdout.includes('CLI確認依據'), false);
  assert.equal(directoryDigest(cliWriteDirectory), cliWriteDigest);

  const stableCli = cli(['--directory', stableDirectory, '--ledger', stableLedger, '--json']);
  assert.equal(stableCli.status, 0, stableCli.stderr || stableCli.stdout);
  assert.equal(JSON.parse(stableCli.stdout).status, 'ready');
  const removalCli = cli(['--directory', removalDirectory, '--ledger', removalLedger, '--json']);
  assert.equal(removalCli.status, 0, removalCli.stderr || removalCli.stdout);
  assert.equal(JSON.parse(removalCli.stdout).summary.acknowledgedTargets, 1);
  const recurringCli = cli(['--directory', recurringDirectory, '--ledger', recurringLedger, '--json']);
  assert.equal(recurringCli.status, 1, recurringCli.stderr || recurringCli.stdout);
  const malformedCli = cli(['--directory', removalDirectory, '--ledger', malformedLedger, '--json']);
  assert.equal(malformedCli.status, 2, malformedCli.stderr || malformedCli.stdout);
  assert.equal(cli(['--help']).status, 0);
  assert.equal(cli([]).status, 3);
  assert.equal(cli(['--directory', stableDirectory, '--ledger', stableLedger, '--case-removal', '案件乙']).status, 3);
  assert.equal(directoryDigest(stableDirectory), stableDigest);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment portfolio snapshot trend disposition OK');
