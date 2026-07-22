'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Portfolio = require('./attachment-case-governance-portfolio.js');
const Snapshot = require('./attachment-case-governance-portfolio-snapshot.js');
const Disposition = require('./attachment-case-governance-portfolio-snapshot-trend-disposition.js');
const Checkpoint = require('./attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js');

const TIMES = {
  first: '2026-07-22T01:00:00.000Z',
  second: '2026-07-22T02:00:00.000Z',
  third: '2026-07-22T03:00:00.000Z',
  firstReceipt: new Date('2026-07-22T04:00:00.000Z'),
  readded: '2026-07-22T05:00:00.000Z',
  removedAgain: '2026-07-22T06:00:00.000Z',
  stableAgain: '2026-07-22T07:00:00.000Z',
  secondReceipt: new Date('2026-07-22T08:00:00.000Z'),
  initialCheckpoint: new Date('2026-07-22T04:30:00.000Z'),
  advancedCheckpoint: new Date('2026-07-22T08:30:00.000Z'),
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

function copyDirectory(source, target) {
  fs.mkdirSync(target);
  fs.readdirSync(source).forEach(name => fs.copyFileSync(path.join(source, name), path.join(target, name)));
}

function cli(args) {
  return spawnSync(process.execPath, [path.join(__dirname, 'attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js'), ...args], { encoding: 'utf8' });
}

assert.equal(Checkpoint.CHECKPOINT_KIND, 'formal-attachment-case-governance-trend-disposition-checkpoint.v1');
assert.equal(Checkpoint.CHECKPOINT_STATE_KIND, 'formal-attachment-case-governance-trend-disposition-checkpoint-state.v1');
assert.match(Checkpoint.CHECKPOINT_BOUNDARY_INSTRUCTION, /外部可信位置/);
assert.match(Checkpoint.CHECKPOINT_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.deepEqual(Checkpoint.parseArgs(['--directory', 'C:/snapshots', '--ledger', 'C:/ledger', '--checkpoint', 'D:/trusted/a.json', '--json']), {
  json: true,
  initialize: false,
  advance: false,
  acceptAdditions: false,
  directory: 'C:/snapshots',
  ledger: 'C:/ledger',
  checkpoint: 'D:/trusted/a.json',
});
assert.throws(() => Checkpoint.parseArgs(['--initialize', '--advance']), /不得同時/);
assert.throws(() => Checkpoint.parseArgs(['--initialize']), /--output、--reviewer 與 --basis/);
assert.throws(() => Checkpoint.parseArgs(['--advance', '--output', 'x', '--reviewer', '甲', '--basis', '乙']), /--checkpoint/);
assert.throws(() => Checkpoint.parseArgs(['--advance', '--checkpoint', 'x', '--output', 'y', '--reviewer', '甲', '--basis', '乙']), /--accept-additions/);
assert.throws(() => Checkpoint.parseArgs(['--output', 'x']), /只能搭配/);
assert.throws(() => Checkpoint.parseArgs(['--directory']), /缺少值/);
assert.throws(() => Checkpoint.parseArgs(['--unknown']), /未知參數/);
assert.match(Checkpoint.usage(), /不得自動猜選最新檢查點/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-trend-checkpoint-'));
try {
  const snapshots = path.join(tempRoot, 'snapshots');
  const ledger = path.join(tempRoot, 'ledger');
  const trusted = path.join(tempRoot, 'trusted-checkpoints');
  const caseA = makeCase('案件甲', 'ready', 'A');
  const caseB = makeCase('案件乙', 'ready', 'B');
  writeSnapshot(snapshots, makeSnapshot([caseA, caseB], 'A', TIMES.first));
  writeSnapshot(snapshots, makeSnapshot([caseA], 'B', TIMES.second));
  writeSnapshot(snapshots, makeSnapshot([caseA], 'B', TIMES.third));
  Disposition.publishDisposition(snapshots, ledger, {
    now: TIMES.firstReceipt,
    caseRemovals: ['案件乙'],
    reviewer: '王工程師',
    basis: '確認第一次持續移除。',
  });
  const snapshotDigest = directoryDigest(snapshots);
  const ledgerDigest = directoryDigest(ledger);

  const initialized = Checkpoint.publishCheckpoint(snapshots, ledger, {
    initialize: true,
    output: trusted,
    reviewer: '林主管',
    basis: '已將第一份收據鏈保存於受保護位置。',
    now: TIMES.initialCheckpoint,
  });
  assert.equal(initialized.status, 'ready');
  assert.equal(initialized.checkpointStatus, 'ready');
  assert.equal(initialized.checkpoint.relation, 'match');
  assert.equal(initialized.publication.action, 'initial');
  assert.equal(initialized.publication.acceptedAdditionCount, 1);
  assert.match(initialized.publication.checkpointFingerprint, /^TAC-[0-9A-F]{24}$/);
  assert.match(initialized.checkpointStateFingerprint, /^TCS-[0-9A-F]{24}$/);
  assert.equal(directoryDigest(snapshots), snapshotDigest);
  assert.equal(directoryDigest(ledger), ledgerDigest);
  const initialPath = path.join(trusted, initialized.publication.checkpointFileName);
  const initialRaw = fs.readFileSync(initialPath, 'utf8');
  const initialFile = Checkpoint.readCheckpointFile(initialPath);
  assert.equal(initialFile.checkpoint.decision.reviewer, '林主管');
  assert.equal(initialFile.checkpoint.decision.basis, '已將第一份收據鏈保存於受保護位置。');
  assert.equal(initialFile.checkpoint.decision.formalAttachmentApproval, false);
  assert.equal(initialFile.checkpoint.previousCheckpoint.checkpointFingerprint, '');
  assert.equal(initialFile.checkpoint.ledger.ledgerFingerprint, Disposition.readLedgerStrict(ledger).ledgerFingerprint);
  const exact = Checkpoint.inspectCheckpointState(snapshots, ledger, initialPath, { now: TIMES.inspect });
  assert.equal(exact.status, 'ready');
  assert.equal(exact.checkpoint.relation, 'match');
  assert.equal(exact.checkpoint.anchoredReceiptCount, 1);
  assert.equal(exact.checkpoint.currentReceiptCount, 1);
  assert.equal(JSON.stringify(exact).includes(tempRoot), false);
  assert.doesNotMatch(JSON.stringify(exact), /林主管|受保護位置|reviewer|basis|AppData|Desktop/i);
  assert.equal(Checkpoint.inspectCheckpointState(snapshots, ledger, initialPath, { now: new Date('2026-07-23T09:00:00.000Z') }).checkpointStateFingerprint, exact.checkpointStateFingerprint);

  writeSnapshot(snapshots, makeSnapshot([caseA, caseB], 'C', TIMES.readded));
  writeSnapshot(snapshots, makeSnapshot([caseA], 'D', TIMES.removedAgain));
  writeSnapshot(snapshots, makeSnapshot([caseA], 'D', TIMES.stableAgain));
  Disposition.publishDisposition(snapshots, ledger, {
    now: TIMES.secondReceipt,
    caseRemovals: ['案件乙'],
    reviewer: '李工程師',
    basis: '確認第二次持續移除。',
  });
  const additions = Checkpoint.inspectCheckpointState(snapshots, ledger, initialPath, { now: TIMES.inspect });
  assert.equal(additions.status, 'review');
  assert.equal(additions.checkpointStatus, 'review');
  assert.equal(additions.checkpoint.relation, 'new-receipts');
  assert.equal(additions.checkpoint.addedReceiptCount, 1);
  assert.equal(additions.issues[0].code, 'checkpoint-advance-required');
  assert.throws(() => Checkpoint.publishCheckpoint(snapshots, ledger, {
    advance: true,
    checkpoint: initialPath,
    output: trusted,
    reviewer: '林主管',
    basis: '接受新增。',
    now: TIMES.advancedCheckpoint,
  }), /--accept-additions/);

  const advanced = Checkpoint.publishCheckpoint(snapshots, ledger, {
    advance: true,
    acceptAdditions: true,
    checkpoint: initialPath,
    output: trusted,
    reviewer: '林主管',
    basis: '已複核第二份收據並明確接受新增。',
    now: TIMES.advancedCheckpoint,
  });
  assert.equal(advanced.status, 'ready');
  assert.equal(advanced.checkpoint.relation, 'match');
  assert.equal(advanced.publication.action, 'advance');
  assert.equal(advanced.publication.acceptedAdditionCount, 1);
  assert.equal(fs.readFileSync(initialPath, 'utf8'), initialRaw);
  const advancedPath = path.join(trusted, advanced.publication.checkpointFileName);
  const advancedFile = Checkpoint.readCheckpointFile(advancedPath);
  assert.equal(advancedFile.checkpoint.previousCheckpoint.checkpointFingerprint, initialFile.checkpoint.checkpointFingerprint);
  assert.equal(advancedFile.checkpoint.previousCheckpoint.sha256, initialFile.rawHash);
  assert.equal(advancedFile.checkpoint.previousCheckpoint.fileName, initialFile.fileName);
  assert.equal(advancedFile.checkpoint.ledger.receiptCount, 2);

  const truncatedLedger = path.join(tempRoot, 'truncated-copy', 'ledger');
  fs.mkdirSync(path.dirname(truncatedLedger));
  copyDirectory(ledger, truncatedLedger);
  const terminalName = fs.readdirSync(truncatedLedger).sort().at(-1);
  fs.rmSync(path.join(truncatedLedger, terminalName));
  const internallyValidPrefix = Disposition.readLedgerStrict(truncatedLedger);
  assert.equal(internallyValidPrefix.records.length, 1);
  const truncated = Checkpoint.inspectCheckpointState(snapshots, truncatedLedger, advancedPath, { now: TIMES.inspect });
  assert.equal(truncated.status, 'blocked');
  assert.equal(truncated.checkpoint.relation, 'tail-truncated');
  assert.equal(truncated.issues[0].code, 'ledger-tail-truncated');

  const changedLedger = path.join(tempRoot, 'changed-copy', 'ledger');
  fs.mkdirSync(path.dirname(changedLedger));
  copyDirectory(ledger, changedLedger);
  const changedName = fs.readdirSync(changedLedger).sort()[0];
  const changed = JSON.parse(fs.readFileSync(path.join(changedLedger, changedName), 'utf8'));
  changed.decision.basis = '遭變更';
  fs.writeFileSync(path.join(changedLedger, changedName), `${JSON.stringify(changed, null, 2)}\n`);
  const changedState = Checkpoint.inspectCheckpointState(snapshots, changedLedger, advancedPath, { now: TIMES.inspect });
  assert.equal(changedState.status, 'blocked');

  const renamedCheckpoint = path.join(trusted, 'renamed.json');
  fs.copyFileSync(advancedPath, renamedCheckpoint);
  const renamed = Checkpoint.inspectCheckpointState(snapshots, ledger, renamedCheckpoint, { now: TIMES.inspect });
  assert.equal(renamed.status, 'blocked');
  assert.equal(renamed.checkpoint.relation, 'invalid');
  fs.rmSync(renamedCheckpoint);
  const invalidCheckpoint = JSON.parse(fs.readFileSync(advancedPath, 'utf8'));
  invalidCheckpoint.extra = true;
  assert.throws(() => Checkpoint.validateCheckpoint(invalidCheckpoint), /欄位/);
  const invalidFingerprint = JSON.parse(fs.readFileSync(advancedPath, 'utf8'));
  invalidFingerprint.checkpointFingerprint = 'TAC-AAAAAAAAAAAAAAAAAAAAAAAA';
  assert.throws(() => Checkpoint.validateCheckpoint(invalidFingerprint), /指紋不一致/);
  const duplicatePath = path.join(trusted, 'duplicate.json');
  fs.writeFileSync(duplicatePath, '{"schemaVersion":1,"schemaVersion":1}\n');
  assert.throws(() => Checkpoint.readCheckpointFile(duplicatePath), /重複 JSON/);
  fs.rmSync(duplicatePath);
  const hardlinkPath = path.join(trusted, 'hardlink.json');
  fs.linkSync(advancedPath, hardlinkPath);
  assert.throws(() => Checkpoint.readCheckpointFile(advancedPath), /硬連結/);
  fs.rmSync(hardlinkPath);

  assert.throws(() => Checkpoint.publishCheckpoint(snapshots, ledger, {
    initialize: true,
    output: snapshots,
    reviewer: '甲',
    basis: '乙',
    now: TIMES.inspect,
  }), /獨立位置/);
  assert.throws(() => Checkpoint.inspectCheckpointState(snapshots, ledger, path.join(ledger, 'x.json')), /獨立位置/);
  const collisionOutput = path.join(tempRoot, 'collision-output');
  Checkpoint.publishCheckpoint(snapshots, ledger, {
    initialize: true,
    output: collisionOutput,
    reviewer: '林主管',
    basis: '同時同內容不得覆寫。',
    now: TIMES.inspect,
  });
  assert.throws(() => Checkpoint.publishCheckpoint(snapshots, ledger, {
    initialize: true,
    output: collisionOutput,
    reviewer: '林主管',
    basis: '同時同內容不得覆寫。',
    now: TIMES.inspect,
  }), /已存在/);

  const failedOutput = path.join(tempRoot, 'failed-output');
  assert.throws(() => Checkpoint.publishCheckpoint(snapshots, ledger, {
    initialize: true,
    output: failedOutput,
    reviewer: '甲',
    basis: '破壞暫存。',
    now: TIMES.inspect,
    beforeValidate: ({ stagingPath }) => fs.appendFileSync(stagingPath, '{'),
  }), /不是有效 JSON|多餘內容/);
  assert.equal(fs.existsSync(failedOutput), false);
  const lockedOutput = path.join(tempRoot, 'locked-output');
  const lockPath = path.join(tempRoot, '.locked-output.trend-disposition-checkpoint.lock');
  fs.writeFileSync(lockPath, 'existing');
  assert.throws(() => Checkpoint.publishCheckpoint(snapshots, ledger, {
    initialize: true,
    output: lockedOutput,
    reviewer: '甲',
    basis: '不得移除他人鎖。',
    now: TIMES.inspect,
  }), /EEXIST/);
  assert.equal(fs.readFileSync(lockPath, 'utf8'), 'existing');
  fs.rmSync(lockPath);

  const raceOutput = path.join(tempRoot, 'race-output');
  assert.throws(() => Checkpoint.publishCheckpoint(snapshots, ledger, {
    initialize: true,
    output: raceOutput,
    reviewer: '甲',
    basis: '來源競態。',
    now: TIMES.inspect,
    beforePublish: () => fs.appendFileSync(path.join(snapshots, fs.readdirSync(snapshots).sort()[0]), ' '),
  }), /發布期間|來源|快照|自我驗證|改變/);
  assert.equal(fs.existsSync(raceOutput), false);
  // Restore the intentional race mutation before the remaining checks.
  const racedSnapshot = path.join(snapshots, fs.readdirSync(snapshots).sort()[0]);
  fs.writeFileSync(racedSnapshot, fs.readFileSync(racedSnapshot, 'utf8').trimEnd() + '\n');

  const reviewSnapshots = path.join(tempRoot, 'review-snapshots');
  const reviewLedger = path.join(tempRoot, 'review-ledger');
  const reviewTrusted = path.join(tempRoot, 'review-trusted');
  const reviewCase = makeCase('案件丙', 'review', 'E');
  writeSnapshot(reviewSnapshots, makeSnapshot([reviewCase], 'E', TIMES.first, '審閱案件群組'));
  writeSnapshot(reviewSnapshots, makeSnapshot([reviewCase], 'E', TIMES.second, '審閱案件群組'));
  const reviewPublished = Checkpoint.publishCheckpoint(reviewSnapshots, reviewLedger, {
    initialize: true,
    output: reviewTrusted,
    reviewer: '趙主管',
    basis: '只錨定空收據鏈，不核可目前狀態。',
    now: TIMES.inspect,
  });
  assert.equal(reviewPublished.checkpointStatus, 'ready');
  assert.equal(reviewPublished.status, 'review');
  assert.equal(reviewPublished.checkpoint.relation, 'match');

  const inspectRace = Checkpoint.inspectCheckpointState(reviewSnapshots, reviewLedger, path.join(reviewTrusted, reviewPublished.publication.checkpointFileName), {
    now: TIMES.inspect,
    beforeFinalize: () => writeSnapshot(reviewSnapshots, makeSnapshot([reviewCase], 'F', '2026-07-22T10:00:00.000Z', '審閱案件群組')),
  });
  assert.equal(inspectRace.status, 'blocked');
  assert.equal(inspectRace.checkpoint.relation, 'sources-changed');

  const help = cli(['--help']);
  assert.equal(help.status, 0);
  const missing = cli([]);
  assert.equal(missing.status, 3);
  const cliExact = cli(['--directory', snapshots, '--ledger', ledger, '--checkpoint', advancedPath, '--json']);
  assert.equal(cliExact.status, 0);
  assert.equal(JSON.parse(cliExact.stdout).checkpoint.relation, 'match');
  const cliReview = cli(['--directory', reviewSnapshots, '--ledger', reviewLedger, '--checkpoint', path.join(reviewTrusted, reviewPublished.publication.checkpointFileName), '--json']);
  assert.equal(cliReview.status, 1);
  const cliBlocked = cli(['--directory', snapshots, '--ledger', truncatedLedger, '--checkpoint', advancedPath, '--json']);
  assert.equal(cliBlocked.status, 2);
  const cliError = cli(['--directory', snapshots, '--ledger', ledger, '--advance']);
  assert.equal(cliError.status, 3);

  console.log('attachment case governance trend disposition checkpoint tests passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
