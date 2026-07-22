'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const History = require('./attachment-package-upgrade-history.js');
const Index = require('./attachment-package-upgrade-history-index.js');
const Baseline = require('./attachment-package-upgrade-history-baseline.js');
const Advance = require('./attachment-package-upgrade-history-baseline-advance.js');

const INITIAL_TIME = new Date('2026-07-22T02:00:00.000Z');
const ADVANCE_TIME = new Date('2026-07-22T10:20:30.000Z');

function hash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function directorySnapshot(directory) {
  return fs.readdirSync(directory).sort().map(name => {
    const filePath = path.join(directory, name);
    const stat = fs.lstatSync(filePath);
    return { name, type: stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other', hash: stat.isFile() ? hash(filePath) : '' };
  });
}

function addReceipt(historyDir, suffix, now) {
  const receiptId = `ADVANCE${suffix}`;
  const workspaceCreated = suffix === '02';
  const flowResult = {
    kind: 'formal-attachment-package-upgrade-flow.v1',
    inputKind: 'formal-package',
    action: workspaceCreated ? 'workspace-created' : 'no-upgrade-needed',
    status: workspaceCreated ? 'review' : 'ready',
    changedState: workspaceCreated,
    workspaceDir: '',
    packageDir: '',
    workspaceResult: {
      planFingerprint: workspaceCreated ? 'WSP-222222222222222222222222' : '',
      assessment: {
        status: workspaceCreated ? 'review' : 'ready',
        currentPackage: { packageFingerprint: `PKG-${suffix.repeat(12)}` },
      },
    },
  };
  const receipt = History.buildReceipt(flowResult, {
    historyDir,
    selectedInput: path.dirname(historyDir),
    inputKind: flowResult.inputKind,
  }, { now, receiptId });
  return History.writeReceipt(receipt, historyDir, { probeToken: `ADVANCE-${suffix}` });
}

function makeHistory(parent) {
  const historyDir = path.join(parent, 'history');
  fs.mkdirSync(historyDir, { recursive: true });
  addReceipt(historyDir, '01', new Date('2026-07-22T01:00:00.000Z'));
  addReceipt(historyDir, '02', new Date('2026-07-22T01:01:00.000Z'));
  return historyDir;
}

function createBaseline(historyDir, parent, now = INITIAL_TIME) {
  const baselinePath = path.join(parent, 'old-baseline', 'trusted.json');
  const result = Baseline.publishBaseline(historyDir, { now, output: baselinePath });
  assert.equal(result.published, true);
  return baselinePath;
}

function prepareAdditionCase(parent) {
  const historyDir = makeHistory(parent);
  const baselinePath = createBaseline(historyDir, parent);
  addReceipt(historyDir, '03', new Date('2026-07-22T01:02:00.000Z'));
  return { historyDir, baselinePath };
}

function cli(args) {
  return spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-history-baseline-advance.js'),
    ...args,
  ], { encoding: 'utf8' });
}

assert.equal(Advance.ADVANCEMENT_KIND, 'formal-attachment-package-upgrade-history-baseline-advancement.v1');
assert.equal(Advance.APPROVAL_KIND, 'formal-attachment-package-upgrade-history-baseline-advancement-record.v1');
assert.match(Advance.ADVANCEMENT_BOUNDARY_INSTRUCTION, /不是正式附件核可/);
assert.deepEqual(
  Advance.parseArgs([
    '--history', 'C:/history', '--baseline', 'C:/old.json', '--accept-additions',
    '--reviewer', 'QA-01', '--basis', '案件複核單', '--output', 'C:/new', '--json',
  ]),
  {
    json: true, acceptAdditions: true, history: 'C:/history', baseline: 'C:/old.json',
    reviewer: 'QA-01', basis: '案件複核單', output: 'C:/new',
  },
);
assert.throws(() => Advance.parseArgs(['--reviewer']), /缺少值/);
assert.match(Advance.usage(), /只有純新增收據/);
assert.match(Advance.usage(), /不是正式附件核可/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-history-baseline-advance-'));
try {
  const mainCase = path.join(tempRoot, 'main');
  const { historyDir, baselinePath } = prepareAdditionCase(mainCase);
  const historyBefore = directorySnapshot(historyDir);
  const baselineHashBefore = hash(baselinePath);

  const pending = Advance.advanceBaseline(historyDir, { baseline: baselinePath, now: ADVANCE_TIME });
  assert.equal(pending.status, 'review');
  assert.equal(pending.advanced, false);
  assert.equal(pending.reason, 'approval-required');
  assert.deepEqual(pending.acceptedAddedReceiptIds, ['ADVANCE03']);
  assert.equal(fs.existsSync(path.join(mainCase, Baseline.BASELINE_DIR_NAME)), false);
  assert.match(Advance.formatSummary(pending), /需明確接受新增收據/);
  assert.match(Advance.formatSummary(pending), /新增 1 份收據/);

  assert.throws(
    () => Advance.advanceBaseline(historyDir, {
      baseline: baselinePath, now: ADVANCE_TIME, acceptAdditions: true,
      reviewer: '', basis: '案件複核單',
    }),
    /內部複核人不得空白/,
  );
  assert.equal(fs.existsSync(path.join(mainCase, Baseline.BASELINE_DIR_NAME)), false);

  const advanced = Advance.advanceBaseline(historyDir, {
    baseline: baselinePath,
    now: ADVANCE_TIME,
    acceptAdditions: true,
    reviewer: 'QA-01',
    basis: '案件複核單 REV-A：確認新增歷程均屬本案操作',
    advancementId: 'ADV-TEST-0001',
  });
  assert.equal(advanced.status, 'valid');
  assert.equal(advanced.advanced, true);
  assert.equal(advanced.reason, 'additions-accepted');
  assert.deepEqual(advanced.acceptedAddedReceiptIds, ['ADVANCE03']);
  assert.match(advanced.approvalFingerprint, /^HAD-[0-9A-F]{24}$/);
  assert.ok(fs.existsSync(advanced.bundleDir));
  assert.deepEqual(fs.readdirSync(advanced.bundleDir).sort(), [Advance.APPROVAL_FILE_NAME, Advance.BASELINE_FILE_NAME].sort());
  assert.equal(path.basename(advanced.baselinePath), Advance.BASELINE_FILE_NAME);
  assert.equal(path.basename(advanced.approvalPath), Advance.APPROVAL_FILE_NAME);
  assert.deepEqual(directorySnapshot(historyDir), historyBefore, 'advancement must not mutate history receipts');
  assert.equal(hash(baselinePath), baselineHashBefore, 'advancement must not mutate the previous baseline');

  const nextBaseline = JSON.parse(fs.readFileSync(advanced.baselinePath, 'utf8'));
  const approval = JSON.parse(fs.readFileSync(advanced.approvalPath, 'utf8'));
  assert.equal(nextBaseline.kind, Index.INDEX_KIND);
  assert.equal(nextBaseline.status, 'valid');
  assert.equal(nextBaseline.receipts.length, 3);
  assert.equal(Advance.validateApprovalRecord(approval), true);
  assert.equal(approval.advancementId, 'ADV-TEST-0001');
  assert.equal(approval.decision.reviewer, 'QA-01');
  assert.equal(approval.decision.formalAttachmentApproval, false);
  assert.equal(approval.boundary.attachToFormalReport, false);
  assert.equal(approval.previousBaseline.sha256, Advance.sha256File(baselinePath));
  assert.equal(approval.nextBaseline.sha256, Advance.sha256File(advanced.baselinePath));
  assert.equal(approval.previousBaseline.receiptCount, 2);
  assert.equal(approval.nextBaseline.receiptCount, 3);
  assert.deepEqual(approval.acceptedAdditions.map(item => item.receiptId), ['ADVANCE03']);
  assert.doesNotMatch(
    `${fs.readFileSync(advanced.baselinePath, 'utf8')}\n${fs.readFileSync(advanced.approvalPath, 'utf8')}`,
    /Desktop|AppData|attachment-history-baseline-advance|approvalTime|核可時間|calculationInput/i,
  );
  assert.equal(fs.readdirSync(path.dirname(advanced.bundleDir)).some(name => name.includes('.tmp-')), false);
  const matched = Index.inspectHistoryDir(historyDir, { baseline: advanced.baselinePath, now: ADVANCE_TIME });
  assert.equal(matched.status, 'valid');
  assert.equal(matched.baseline.status, 'match');
  const bundleValidation = Advance.validateAdvancementBundle(advanced.bundleDir, historyDir, baselinePath, { now: ADVANCE_TIME });
  assert.deepEqual(bundleValidation.difference.added, ['ADVANCE03']);

  const tamperedBundle = path.join(tempRoot, 'tampered-bundle-copy');
  fs.mkdirSync(tamperedBundle);
  fs.copyFileSync(advanced.baselinePath, path.join(tamperedBundle, Advance.BASELINE_FILE_NAME), fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(advanced.approvalPath, path.join(tamperedBundle, Advance.APPROVAL_FILE_NAME), fs.constants.COPYFILE_EXCL);
  fs.appendFileSync(path.join(tamperedBundle, Advance.BASELINE_FILE_NAME), ' \n', 'utf8');
  assert.throws(
    () => Advance.validateAdvancementBundle(tamperedBundle, historyDir, baselinePath, { now: ADVANCE_TIME }),
    /新版基準 SHA-256 不符/,
  );

  const approvalHash = hash(advanced.approvalPath);
  assert.throws(
    () => Advance.advanceBaseline(historyDir, {
      baseline: baselinePath, now: ADVANCE_TIME, acceptAdditions: true,
      reviewer: 'QA-01', basis: '重複發布測試',
    }),
    /已存在，不得覆寫/,
  );
  assert.equal(hash(advanced.approvalPath), approvalHash);

  const noChange = Advance.advanceBaseline(historyDir, { baseline: advanced.baselinePath, now: ADVANCE_TIME });
  assert.equal(noChange.status, 'valid');
  assert.equal(noChange.advanced, false);
  assert.equal(noChange.reason, 'no-new-receipts');
  assert.match(Advance.formatSummary(noChange), /不需前進/);

  const missingCase = path.join(tempRoot, 'missing');
  const missingHistory = makeHistory(missingCase);
  const missingBaseline = createBaseline(missingHistory, missingCase);
  fs.rmSync(path.join(missingHistory, fs.readdirSync(missingHistory).sort()[0]));
  const missingOutput = path.join(missingCase, 'must-not-exist');
  const missing = Advance.advanceBaseline(missingHistory, {
    baseline: missingBaseline, now: ADVANCE_TIME, acceptAdditions: true,
    reviewer: 'QA-01', basis: '不得接受遺失', output: missingOutput,
  });
  assert.equal(missing.status, 'blocked');
  assert.equal(missing.advanced, false);
  assert.equal(missing.reason, 'integrity-blocked');
  assert.equal(fs.existsSync(missingOutput), false);

  const changedCase = path.join(tempRoot, 'changed');
  const changedHistory = makeHistory(changedCase);
  const changedBaseline = createBaseline(changedHistory, changedCase);
  const oldName = fs.readdirSync(changedHistory).sort()[0];
  const oldPath = path.join(changedHistory, oldName);
  const changedReceipt = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
  changedReceipt.flow.action = 'package-blocked';
  changedReceipt.flow.status = 'blocked';
  changedReceipt.receiptFingerprint = History.receiptFingerprint(changedReceipt);
  fs.rmSync(oldPath);
  fs.writeFileSync(
    path.join(changedHistory, Index.receiptFileName(changedReceipt)),
    `${JSON.stringify(changedReceipt, null, 2)}\n`,
    'utf8',
  );
  const changed = Advance.advanceBaseline(changedHistory, {
    baseline: changedBaseline, now: ADVANCE_TIME, acceptAdditions: true,
    reviewer: 'QA-01', basis: '不得接受改變',
  });
  assert.equal(changed.status, 'blocked');
  assert.equal(changed.advanced, false);
  assert.equal(changed.comparison.baseline.status, 'differences');

  const tamperedCase = path.join(tempRoot, 'tampered');
  const tamperedHistory = makeHistory(tamperedCase);
  const tamperedBaseline = createBaseline(tamperedHistory, tamperedCase);
  const tamperedPath = path.join(tamperedHistory, fs.readdirSync(tamperedHistory).sort()[0]);
  const tamperedReceipt = JSON.parse(fs.readFileSync(tamperedPath, 'utf8'));
  tamperedReceipt.input.packageFingerprint = 'PKG-AAAAAAAAAAAAAAAAAAAAAAAA';
  fs.writeFileSync(tamperedPath, `${JSON.stringify(tamperedReceipt, null, 2)}\n`, 'utf8');
  const tampered = Advance.advanceBaseline(tamperedHistory, {
    baseline: tamperedBaseline, now: ADVANCE_TIME, acceptAdditions: true,
    reviewer: 'QA-01', basis: '不得接受篡改',
  });
  assert.equal(tampered.status, 'blocked');
  assert.equal(tampered.advanced, false);

  const renameCase = path.join(tempRoot, 'rename-failure');
  const renamePrepared = prepareAdditionCase(renameCase);
  const renameOutput = path.join(renameCase, 'new-bundles', 'advance-bundle');
  assert.throws(
    () => Advance.advanceBaseline(renamePrepared.historyDir, {
      baseline: renamePrepared.baselinePath, now: ADVANCE_TIME, acceptAdditions: true,
      reviewer: 'QA-01', basis: '原子失敗測試', output: renameOutput,
      renameSync() { throw new Error('injected bundle rename failure'); },
    }),
    /injected bundle rename failure/,
  );
  assert.equal(fs.existsSync(renameOutput), false);
  assert.equal(fs.existsSync(path.dirname(renameOutput)), false, 'new empty output parent must be removed after failure');

  const raceCase = path.join(tempRoot, 'history-race');
  const racePrepared = prepareAdditionCase(raceCase);
  const raceOutput = path.join(raceCase, 'new-bundles', 'advance-bundle');
  assert.throws(
    () => Advance.advanceBaseline(racePrepared.historyDir, {
      baseline: racePrepared.baselinePath, now: ADVANCE_TIME, acceptAdditions: true,
      reviewer: 'QA-01', basis: '歷程競態測試', output: raceOutput,
      beforeFinalize() {
        addReceipt(racePrepared.historyDir, '04', new Date('2026-07-22T01:03:00.000Z'));
      },
    }),
    /歷程在可信基準前進發布前發生變更/,
  );
  assert.equal(fs.existsSync(raceOutput), false);
  assert.equal(fs.existsSync(path.dirname(raceOutput)), false);

  const boundaryCase = path.join(tempRoot, 'boundary');
  const boundaryPrepared = prepareAdditionCase(boundaryCase);
  assert.throws(
    () => Advance.advanceBaseline(boundaryPrepared.historyDir, {
      baseline: boundaryPrepared.baselinePath, now: ADVANCE_TIME, acceptAdditions: true,
      reviewer: 'QA-01', basis: '路徑邊界', output: path.join(boundaryPrepared.historyDir, 'bundle'),
    }),
    /不得位於歷程內/,
  );
  assert.throws(
    () => Advance.advanceBaseline(boundaryPrepared.historyDir, {
      baseline: boundaryPrepared.baselinePath, now: ADVANCE_TIME, acceptAdditions: true,
      reviewer: 'QA-01', basis: '路徑邊界', output: boundaryCase,
    }),
    /不得位於歷程內，也不得包住歷程/,
  );

  const tamperedApproval = JSON.parse(JSON.stringify(approval));
  tamperedApproval.decision.basis = '遭修改';
  assert.throws(() => Advance.validateApprovalRecord(tamperedApproval), /HAD 指紋無效/);
  const fakeCountApproval = JSON.parse(JSON.stringify(approval));
  fakeCountApproval.nextBaseline.receiptCount += 1;
  fakeCountApproval.advancementFingerprint = Advance.approvalFingerprint(fakeCountApproval);
  assert.throws(() => Advance.validateApprovalRecord(fakeCountApproval), /收據數與接受新增數不一致/);

  const cliCase = path.join(tempRoot, 'cli');
  const cliPrepared = prepareAdditionCase(cliCase);
  const cliPending = cli(['--history', cliPrepared.historyDir, '--baseline', cliPrepared.baselinePath, '--json']);
  assert.equal(cliPending.status, 1, cliPending.stderr || cliPending.stdout);
  assert.equal(JSON.parse(cliPending.stdout).advanced, false);
  const cliMissingReviewer = cli([
    '--history', cliPrepared.historyDir, '--baseline', cliPrepared.baselinePath,
    '--accept-additions', '--basis', 'CLI 複核', '--json',
  ]);
  assert.equal(cliMissingReviewer.status, 3);
  assert.match(cliMissingReviewer.stderr, /內部複核人不得空白/);
  const cliOutput = path.join(cliCase, 'cli-output');
  const cliAdvanced = cli([
    '--history', cliPrepared.historyDir, '--baseline', cliPrepared.baselinePath,
    '--accept-additions', '--reviewer', 'QA-CLI', '--basis', 'CLI 複核單',
    '--output', cliOutput, '--json',
  ]);
  assert.equal(cliAdvanced.status, 0, cliAdvanced.stderr || cliAdvanced.stdout);
  const cliResult = JSON.parse(cliAdvanced.stdout);
  assert.equal(cliResult.advanced, true);
  assert.ok(fs.existsSync(cliResult.baselinePath));
  assert.ok(fs.existsSync(cliResult.approvalPath));

  const help = cli(['--help']);
  assert.equal(help.status, 0);
  const missingArgs = cli([]);
  assert.equal(missingArgs.status, 3);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment package upgrade trusted baseline advancement OK');
