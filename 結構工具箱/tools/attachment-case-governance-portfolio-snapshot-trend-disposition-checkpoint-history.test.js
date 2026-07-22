'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const HistoryJson = require('./attachment-package-upgrade-history.js');
const Portfolio = require('./attachment-case-governance-portfolio.js');
const Snapshot = require('./attachment-case-governance-portfolio-snapshot.js');
const Disposition = require('./attachment-case-governance-portfolio-snapshot-trend-disposition.js');
const Checkpoint = require('./attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js');
const CheckpointHistory = require('./attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint-history.js');

const TIMES = {
  first: '2026-07-22T01:00:00.000Z',
  second: '2026-07-22T02:00:00.000Z',
  third: '2026-07-22T03:00:00.000Z',
  firstReceipt: new Date('2026-07-22T04:00:00.000Z'),
  firstCheckpoint: new Date('2026-07-22T04:30:00.000Z'),
  readded: '2026-07-22T05:00:00.000Z',
  removedAgain: '2026-07-22T06:00:00.000Z',
  stableAgain: '2026-07-22T07:00:00.000Z',
  secondReceipt: new Date('2026-07-22T08:00:00.000Z'),
  secondCheckpoint: new Date('2026-07-22T08:30:00.000Z'),
  inspect: new Date('2026-07-22T09:00:00.000Z'),
};

function makeCase(caseName, status, token) {
  const state = status === 'ready'
    ? { packageStatus: 'ready', chainStatus: 'valid', pendingAdditions: 0, issueCodes: [], nextActionCodes: ['internal-archive-review'] }
    : { packageStatus: 'ready', chainStatus: 'review', pendingAdditions: 1, issueCodes: ['chain-advancement-pending'], nextActionCodes: ['advance-trusted-baseline'] };
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
  const status = sortedCases.some(item => item.status === 'review') ? 'review' : 'ready';
  return {
    schemaVersion: 1,
    kind: Portfolio.PORTFOLIO_KIND,
    generatedAt,
    status,
    portfolioFingerprint: `POR-${token.repeat(24)}`,
    boundary: { classification: 'internal-governance-only', attachToFormalReport: false, formalAttachmentApproval: false, instruction: Portfolio.PORTFOLIO_BOUNDARY_INSTRUCTION },
    discovery: { parentName, caseCount: sortedCases.length, ignoredDirectoryCount: 0, ignoredDirectories: [] },
    summary: {
      readyCases: sortedCases.filter(item => item.status === 'ready').length,
      reviewCases: sortedCases.filter(item => item.status === 'review').length,
      blockedCases: 0,
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

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source).forEach(name => fs.copyFileSync(path.join(source, name), path.join(target, name)));
}

function cli(args) {
  return spawnSync(process.execPath, [path.join(__dirname, 'attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint-history.js'), ...args], { encoding: 'utf8' });
}

assert.equal(CheckpointHistory.HISTORY_STATE_KIND, 'formal-attachment-case-governance-trend-disposition-checkpoint-history-state.v1');
assert.match(CheckpointHistory.HISTORY_BOUNDARY_INSTRUCTION, /明確指定受信任的 TAC 終點/);
assert.match(CheckpointHistory.HISTORY_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.deepEqual(CheckpointHistory.parseArgs(['--directory', 'a', '--ledger', 'b', '--history', 'c', '--head', 'd', '--json']), {
  json: true, directory: 'a', ledger: 'b', history: 'c', head: 'd',
});
assert.throws(() => CheckpointHistory.parseArgs(['--directory']), /缺少值/);
assert.throws(() => CheckpointHistory.parseArgs(['--unknown']), /未知參數/);
assert.match(CheckpointHistory.usage(), /不得自動猜選最新檢查點/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-checkpoint-history-'));
try {
  const snapshots = path.join(tempRoot, 'snapshots');
  const ledger = path.join(tempRoot, 'ledger');
  const history = path.join(tempRoot, 'checkpoint-history');
  const caseA = makeCase('案件甲', 'ready', 'A');
  const caseB = makeCase('案件乙', 'ready', 'B');
  writeSnapshot(snapshots, makeSnapshot([caseA, caseB], 'A', TIMES.first));
  writeSnapshot(snapshots, makeSnapshot([caseA], 'B', TIMES.second));
  writeSnapshot(snapshots, makeSnapshot([caseA], 'B', TIMES.third));
  Disposition.publishDisposition(snapshots, ledger, { now: TIMES.firstReceipt, caseRemovals: ['案件乙'], reviewer: '王工程師', basis: '確認第一次移除。' });
  const firstPublished = Checkpoint.publishCheckpoint(snapshots, ledger, {
    initialize: true, output: history, reviewer: '林主管', basis: '建立第一個受信任終點。', now: TIMES.firstCheckpoint,
  });
  const firstPath = path.join(history, firstPublished.publication.checkpointFileName);
  const snapshotDigest = directoryDigest(snapshots);
  const ledgerDigest = directoryDigest(ledger);

  const single = CheckpointHistory.inspectCheckpointHistory(snapshots, ledger, history, firstPath, { now: TIMES.inspect });
  assert.equal(single.status, 'ready');
  assert.equal(single.integrityStatus, 'ready');
  assert.equal(single.currentCheckpointStatus, 'ready');
  assert.equal(single.head.relation, 'trusted-head-is-terminal');
  assert.equal(single.summary.checkpointCount, 1);
  assert.equal(single.summary.trustedHeadPosition, 1);
  assert.match(single.historyFingerprint, /^TCH-[0-9A-F]{24}$/);
  assert.match(single.historyStateFingerprint, /^THS-[0-9A-F]{24}$/);
  assert.equal(directoryDigest(snapshots), snapshotDigest);
  assert.equal(directoryDigest(ledger), ledgerDigest);
  assert.equal(JSON.stringify(single).includes(tempRoot), false);
  assert.doesNotMatch(JSON.stringify(single), /林主管|受信任終點|reviewer|basis|AppData|Desktop/i);
  assert.equal(CheckpointHistory.inspectCheckpointHistory(snapshots, ledger, history, firstPath, { now: new Date('2026-07-23T09:00:00.000Z') }).historyStateFingerprint, single.historyStateFingerprint);

  writeSnapshot(snapshots, makeSnapshot([caseA, caseB], 'C', TIMES.readded));
  writeSnapshot(snapshots, makeSnapshot([caseA], 'D', TIMES.removedAgain));
  writeSnapshot(snapshots, makeSnapshot([caseA], 'D', TIMES.stableAgain));
  Disposition.publishDisposition(snapshots, ledger, { now: TIMES.secondReceipt, caseRemovals: ['案件乙'], reviewer: '李工程師', basis: '確認第二次移除。' });
  const secondPublished = Checkpoint.publishCheckpoint(snapshots, ledger, {
    advance: true, acceptAdditions: true, checkpoint: firstPath, output: history, reviewer: '林主管', basis: '接受第二份收據。', now: TIMES.secondCheckpoint,
  });
  const secondPath = path.join(history, secondPublished.publication.checkpointFileName);
  const chain = CheckpointHistory.readCheckpointHistoryStrict(history, secondPath);
  assert.equal(chain.records.length, 2);
  assert.equal(chain.records[0].fileName, path.basename(firstPath));
  assert.equal(chain.records[1].fileName, path.basename(secondPath));
  assert.equal(chain.relation, 'trusted-head-is-terminal');
  assert.equal(chain.status, 'ready');

  const oldHead = CheckpointHistory.inspectCheckpointHistory(snapshots, ledger, history, firstPath, { now: TIMES.inspect });
  assert.equal(oldHead.status, 'review');
  assert.equal(oldHead.integrityStatus, 'review');
  assert.equal(oldHead.head.relation, 'trusted-head-behind-history');
  assert.equal(oldHead.summary.checkpointsAfterTrustedHead, 1);
  assert.equal(oldHead.issues[0].code, 'trusted-head-behind-checkpoint-history');
  const currentHead = CheckpointHistory.inspectCheckpointHistory(snapshots, ledger, history, secondPath, { now: TIMES.inspect });
  assert.equal(currentHead.status, 'ready');
  assert.equal(currentHead.summary.checkpointCount, 2);
  assert.equal(currentHead.summary.anchoredReceiptCount, 2);
  assert.equal(currentHead.summary.terminalReceiptCount, 2);

  const missingTailHistory = path.join(tempRoot, 'missing-tail-history');
  copyDirectory(history, missingTailHistory);
  const missingTailHead = path.join(missingTailHistory, path.basename(secondPath));
  fs.rmSync(missingTailHead);
  const validRemainingPrefix = CheckpointHistory.readCheckpointHistoryStrict(missingTailHistory, path.join(missingTailHistory, path.basename(firstPath)));
  assert.equal(validRemainingPrefix.records.length, 1);
  const missingTail = CheckpointHistory.inspectCheckpointHistory(snapshots, ledger, missingTailHistory, missingTailHead, { now: TIMES.inspect });
  assert.equal(missingTail.status, 'blocked');
  assert.equal(missingTail.integrityStatus, 'blocked');
  assert.equal(missingTail.head.relation, 'invalid');

  const missingMiddleHistory = path.join(tempRoot, 'missing-middle-history');
  copyDirectory(history, missingMiddleHistory);
  fs.rmSync(path.join(missingMiddleHistory, path.basename(firstPath)));
  const missingMiddle = CheckpointHistory.inspectCheckpointHistory(snapshots, ledger, missingMiddleHistory, path.join(missingMiddleHistory, path.basename(secondPath)), { now: TIMES.inspect });
  assert.equal(missingMiddle.status, 'blocked');

  const forkHistory = path.join(tempRoot, 'fork-history');
  copyDirectory(history, forkHistory);
  const fork = JSON.parse(fs.readFileSync(path.join(forkHistory, path.basename(secondPath)), 'utf8'));
  fork.decision.basis = '另一個分叉決定。';
  fork.checkpointFingerprint = '';
  fork.checkpointFingerprint = Checkpoint.checkpointFingerprint(fork);
  Checkpoint.validateCheckpoint(fork);
  fs.writeFileSync(path.join(forkHistory, Checkpoint.checkpointFileName(fork)), `${JSON.stringify(fork, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  assert.throws(() => CheckpointHistory.readCheckpointHistoryStrict(forkHistory, path.join(forkHistory, path.basename(secondPath))), /分叉/);

  const scopeHistory = path.join(tempRoot, 'scope-history');
  copyDirectory(history, scopeHistory);
  const changedScopePath = path.join(scopeHistory, path.basename(secondPath));
  const changedScope = JSON.parse(fs.readFileSync(changedScopePath, 'utf8'));
  changedScope.scope.groupName = '其他案件群組';
  changedScope.checkpointFingerprint = '';
  changedScope.checkpointFingerprint = Checkpoint.checkpointFingerprint(changedScope);
  Checkpoint.validateCheckpoint(changedScope);
  fs.rmSync(changedScopePath);
  const changedScopeName = Checkpoint.checkpointFileName(changedScope);
  fs.writeFileSync(path.join(scopeHistory, changedScopeName), `${JSON.stringify(changedScope, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  assert.throws(() => CheckpointHistory.readCheckpointHistoryStrict(scopeHistory, path.join(scopeHistory, changedScopeName)), /範圍不得改變/);

  const renamedHistory = path.join(tempRoot, 'renamed-history');
  copyDirectory(history, renamedHistory);
  const renamedHead = path.join(renamedHistory, 'renamed.json');
  fs.renameSync(path.join(renamedHistory, path.basename(secondPath)), renamedHead);
  const renamed = CheckpointHistory.inspectCheckpointHistory(snapshots, ledger, renamedHistory, renamedHead, { now: TIMES.inspect });
  assert.equal(renamed.status, 'blocked');
  const nonJsonHistory = path.join(tempRoot, 'non-json-history');
  copyDirectory(history, nonJsonHistory);
  fs.writeFileSync(path.join(nonJsonHistory, 'note.txt'), 'not allowed');
  assert.throws(() => CheckpointHistory.readCheckpointHistoryStrict(nonJsonHistory, path.join(nonJsonHistory, path.basename(secondPath))), /非實體 JSON/);
  const hardlinkHistory = path.join(tempRoot, 'hardlink-history');
  copyDirectory(history, hardlinkHistory);
  fs.linkSync(path.join(hardlinkHistory, path.basename(firstPath)), path.join(hardlinkHistory, 'alias.json'));
  assert.throws(() => CheckpointHistory.readCheckpointHistoryStrict(hardlinkHistory, path.join(hardlinkHistory, path.basename(secondPath))), /硬連結/);

  assert.throws(() => CheckpointHistory.validateHistoryBoundary(snapshots, ledger, snapshots, path.join(snapshots, 'x.json')), /完全分離/);
  assert.throws(() => CheckpointHistory.validateHistoryBoundary(snapshots, ledger, history, firstPath.replace(path.basename(firstPath), `sub/${path.basename(firstPath)}`)), /直接檔案/);

  const race = CheckpointHistory.inspectCheckpointHistory(snapshots, ledger, history, secondPath, {
    now: TIMES.inspect,
    beforeFinalize: () => fs.writeFileSync(path.join(history, 'race.txt'), 'changed'),
  });
  assert.equal(race.status, 'blocked');
  assert.equal(race.issues[0].code, 'trusted-checkpoint-history-sources-changed');
  fs.rmSync(path.join(history, 'race.txt'));

  const reviewSnapshots = path.join(tempRoot, 'review-snapshots');
  const reviewLedger = path.join(tempRoot, 'review-ledger');
  const reviewHistory = path.join(tempRoot, 'review-history');
  const reviewCase = makeCase('案件丙', 'review', 'E');
  writeSnapshot(reviewSnapshots, makeSnapshot([reviewCase], 'E', TIMES.first, '審閱案件群組'));
  writeSnapshot(reviewSnapshots, makeSnapshot([reviewCase], 'E', TIMES.second, '審閱案件群組'));
  const reviewCheckpoint = Checkpoint.publishCheckpoint(reviewSnapshots, reviewLedger, {
    initialize: true, output: reviewHistory, reviewer: '趙主管', basis: '只錨定空鏈。', now: TIMES.inspect,
  });
  const reviewHead = path.join(reviewHistory, reviewCheckpoint.publication.checkpointFileName);
  const review = CheckpointHistory.inspectCheckpointHistory(reviewSnapshots, reviewLedger, reviewHistory, reviewHead, { now: TIMES.inspect });
  assert.equal(review.integrityStatus, 'ready');
  assert.equal(review.status, 'review');

  const finalSnapshotDigest = directoryDigest(snapshots);
  const finalLedgerDigest = directoryDigest(ledger);
  const help = cli(['--help']);
  assert.equal(help.status, 0);
  const missingArgs = cli([]);
  assert.equal(missingArgs.status, 3);
  const readyCli = cli(['--directory', snapshots, '--ledger', ledger, '--history', history, '--head', secondPath, '--json']);
  assert.equal(readyCli.status, 0);
  assert.equal(JSON.parse(readyCli.stdout).head.relation, 'trusted-head-is-terminal');
  const reviewCli = cli(['--directory', snapshots, '--ledger', ledger, '--history', history, '--head', firstPath, '--json']);
  assert.equal(reviewCli.status, 1);
  const blockedCli = cli(['--directory', snapshots, '--ledger', ledger, '--history', missingTailHistory, '--head', missingTailHead, '--json']);
  assert.equal(blockedCli.status, 2);
  const errorCli = cli(['--directory', snapshots, '--ledger', ledger, '--history', history]);
  assert.equal(errorCli.status, 3);

  assert.equal(directoryDigest(snapshots), finalSnapshotDigest);
  assert.equal(directoryDigest(ledger), finalLedgerDigest);
  assert.equal(HistoryJson.canonicalJson(currentHead.head).includes('林主管'), false);
  console.log('attachment case governance trend disposition checkpoint history tests passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
