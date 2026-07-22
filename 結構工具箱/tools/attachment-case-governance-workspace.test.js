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
const Workspace = require('./attachment-case-governance-workspace.js');

const TIMES = {
  first: '2026-07-23T01:00:00.000Z',
  second: '2026-07-23T02:00:00.000Z',
  third: '2026-07-23T03:00:00.000Z',
  firstReceipt: new Date('2026-07-23T04:00:00.000Z'),
  firstCheckpoint: new Date('2026-07-23T04:30:00.000Z'),
  firstWorkspace: new Date('2026-07-23T04:45:00.000Z'),
  readded: '2026-07-23T05:00:00.000Z',
  removedAgain: '2026-07-23T06:00:00.000Z',
  stableAgain: '2026-07-23T07:00:00.000Z',
  secondReceipt: new Date('2026-07-23T08:00:00.000Z'),
  secondCheckpoint: new Date('2026-07-23T08:30:00.000Z'),
  secondWorkspace: new Date('2026-07-23T08:45:00.000Z'),
  inspect: new Date('2026-07-23T09:00:00.000Z'),
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

function cli(args) {
  return spawnSync(process.execPath, [path.join(__dirname, 'attachment-case-governance-workspace.js'), ...args], { encoding: 'utf8' });
}

function batchCli(fileName, args) {
  return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'call', path.join(__dirname, fileName), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ATTACHMENT_GOVERNANCE_NO_PAUSE: '1' },
  });
}

assert.equal(Workspace.WORKSPACE_KIND, 'formal-attachment-case-governance-workspace.v1');
assert.equal(Workspace.WORKSPACE_STATE_KIND, 'formal-attachment-case-governance-workspace-state.v1');
assert.match(Workspace.WORKSPACE_BOUNDARY_INSTRUCTION, /固定附件治理來源/);
assert.match(Workspace.WORKSPACE_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.deepEqual(Workspace.parseArgs(['--config', 'workspace.json', '--json']), { json: true, create: false, config: 'workspace.json' });
assert.throws(() => Workspace.parseArgs(['--directory']), /缺少值/);
assert.throws(() => Workspace.parseArgs(['--output', 'x']), /只能搭配 --create/);
assert.throws(() => Workspace.parseArgs(['--create']), /--output、--head、--reviewer 與 --basis/);
assert.throws(() => Workspace.parseArgs(['--create', '--output', 'o', '--head', 'h', '--reviewer', 'r', '--basis', 'b']), /--workspace-name/);
assert.throws(() => Workspace.parseArgs(['--create', '--previous-config', 'p', '--output', 'o', '--head', 'h', '--reviewer', 'r', '--basis', 'b', '--history', 'x']), /不得重新指定/);
assert.throws(() => Workspace.parseArgs(['--unknown']), /未知參數/);
assert.throws(() => Workspace.normalizeRelativePath('C:/absolute', '來源'), /相對路徑/);
assert.throws(() => Workspace.normalizeRelativePath('a\\b', '來源'), /相對路徑/);
assert.throws(() => Workspace.normalizeRelativePath('a/../b', '來源'), /正規化/);
assert.match(Workspace.usage(), /不覆寫舊設定/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-governance-workspace-'));
try {
  const snapshots = path.join(tempRoot, 'sources', 'snapshots');
  const ledger = path.join(tempRoot, 'sources', 'ledger');
  const history = path.join(tempRoot, 'trusted', 'checkpoint-history');
  const configs = path.join(tempRoot, 'workspace-configs');
  const caseA = makeCase('案件甲', 'ready', 'A');
  const caseB = makeCase('案件乙', 'ready', 'B');
  writeSnapshot(snapshots, makeSnapshot([caseA, caseB], 'A', TIMES.first));
  writeSnapshot(snapshots, makeSnapshot([caseA], 'B', TIMES.second));
  writeSnapshot(snapshots, makeSnapshot([caseA], 'B', TIMES.third));
  fs.mkdirSync(path.dirname(history), { recursive: true });
  Disposition.publishDisposition(snapshots, ledger, { now: TIMES.firstReceipt, caseRemovals: ['案件乙'], reviewer: '王工程師', basis: '確認第一次移除。' });
  const firstCheckpoint = Checkpoint.publishCheckpoint(snapshots, ledger, {
    initialize: true, output: history, reviewer: '林主管', basis: '建立第一個檢查點。', now: TIMES.firstCheckpoint,
  });
  const firstHead = path.join(history, firstCheckpoint.publication.checkpointFileName);
  const snapshotDigest = directoryDigest(snapshots);
  const ledgerDigest = directoryDigest(ledger);
  const historyDigest = directoryDigest(history);

  const firstPublished = Workspace.publishWorkspace({
    workspaceName: '案件甲治理工作區',
    directory: snapshots,
    ledger,
    history,
    head: firstHead,
    output: configs,
    reviewer: '周主管',
    basis: '固定第一版治理來源與受信任終點。',
    now: TIMES.firstWorkspace,
  });
  assert.equal(firstPublished.status, 'ready');
  assert.equal(firstPublished.integrityStatus, 'ready');
  assert.equal(firstPublished.publication.action, 'initial');
  assert.match(firstPublished.publication.workspaceFingerprint, /^TGW-[0-9A-F]{24}$/);
  assert.match(firstPublished.workspaceStateFingerprint, /^TWS-[0-9A-F]{24}$/);
  assert.equal(directoryDigest(snapshots), snapshotDigest);
  assert.equal(directoryDigest(ledger), ledgerDigest);
  assert.equal(directoryDigest(history), historyDigest);
  const firstConfigPath = path.join(configs, firstPublished.publication.workspaceFileName);
  const firstRaw = fs.readFileSync(firstConfigPath, 'utf8');
  const firstConfig = Workspace.readWorkspaceFile(firstConfigPath);
  assert.equal(firstConfig.workspace.workspaceName, '案件甲治理工作區');
  assert.equal(firstConfig.workspace.decision.reviewer, '周主管');
  assert.equal(firstConfig.workspace.decision.basis, '固定第一版治理來源與受信任終點。');
  assert.equal(firstConfig.workspace.decision.formalAttachmentApproval, false);
  assert.equal(firstConfig.workspace.previousWorkspace.workspaceFingerprint, '');
  assert.equal(path.isAbsolute(firstConfig.workspace.sources.snapshotDirectory), false);
  assert.equal(path.isAbsolute(firstConfig.workspace.sources.dispositionLedgerDirectory), false);
  assert.equal(path.isAbsolute(firstConfig.workspace.sources.checkpointHistoryDirectory), false);
  assert.equal(firstConfig.workspace.trustedHead.checkpointFingerprint, firstCheckpoint.publication.checkpointFingerprint);

  const exact = Workspace.inspectWorkspace(firstConfigPath, { now: TIMES.inspect });
  assert.equal(exact.status, 'ready');
  assert.equal(exact.trustedHead.relation, 'trusted-head-is-terminal');
  assert.equal(exact.workspaceFingerprint, firstConfig.workspace.workspaceFingerprint);
  assert.equal(JSON.stringify(exact).includes(tempRoot), false);
  assert.doesNotMatch(JSON.stringify(exact), /周主管|固定第一版|reviewer|basis|AppData|Desktop/i);
  assert.equal(Workspace.inspectWorkspace(firstConfigPath, { now: new Date('2026-07-24T09:00:00.000Z') }).workspaceStateFingerprint, exact.workspaceStateFingerprint);

  writeSnapshot(snapshots, makeSnapshot([caseA, caseB], 'C', TIMES.readded));
  writeSnapshot(snapshots, makeSnapshot([caseA], 'D', TIMES.removedAgain));
  writeSnapshot(snapshots, makeSnapshot([caseA], 'D', TIMES.stableAgain));
  Disposition.publishDisposition(snapshots, ledger, { now: TIMES.secondReceipt, caseRemovals: ['案件乙'], reviewer: '李工程師', basis: '確認第二次移除。' });
  const secondCheckpoint = Checkpoint.publishCheckpoint(snapshots, ledger, {
    advance: true, acceptAdditions: true, checkpoint: firstHead, output: history, reviewer: '林主管', basis: '接受第二份收據。', now: TIMES.secondCheckpoint,
  });
  const secondHead = path.join(history, secondCheckpoint.publication.checkpointFileName);
  const oldWorkspace = Workspace.inspectWorkspace(firstConfigPath, { now: TIMES.inspect });
  assert.equal(oldWorkspace.status, 'review');
  assert.equal(oldWorkspace.integrityStatus, 'ready');
  assert.equal(oldWorkspace.trustedHead.relation, 'trusted-head-behind-history');

  const secondPublished = Workspace.publishWorkspace({
    previousConfig: firstConfigPath,
    head: secondHead,
    output: configs,
    reviewer: '周主管',
    basis: '確認檢查點歷程後前進工作區終點。',
    now: TIMES.secondWorkspace,
  });
  assert.equal(secondPublished.status, 'ready');
  assert.equal(secondPublished.publication.action, 'advance');
  assert.equal(fs.readFileSync(firstConfigPath, 'utf8'), firstRaw);
  const secondConfigPath = path.join(configs, secondPublished.publication.workspaceFileName);
  const secondConfig = Workspace.readWorkspaceFile(secondConfigPath);
  assert.equal(secondConfig.workspace.previousWorkspace.fileName, firstConfig.fileName);
  assert.equal(secondConfig.workspace.previousWorkspace.workspaceFingerprint, firstConfig.workspace.workspaceFingerprint);
  assert.equal(secondConfig.workspace.previousWorkspace.sha256, firstConfig.rawHash);
  assert.equal(secondConfig.workspace.trustedHead.checkpointFingerprint, secondCheckpoint.publication.checkpointFingerprint);
  assert.equal(Workspace.inspectWorkspace(secondConfigPath, { now: TIMES.inspect }).status, 'ready');
  assert.throws(() => Workspace.publishWorkspace({
    previousConfig: secondConfigPath,
    head: secondHead,
    output: configs,
    reviewer: '周主管',
    basis: '不得原地重簽。',
    now: TIMES.inspect,
  }), /後續檢查點/);

  const wrongHeadWorkspace = JSON.parse(fs.readFileSync(secondConfigPath, 'utf8'));
  wrongHeadWorkspace.trustedHead.sha256 = '0'.repeat(64);
  wrongHeadWorkspace.workspaceFingerprint = '';
  wrongHeadWorkspace.workspaceFingerprint = Workspace.workspaceFingerprint(wrongHeadWorkspace);
  Workspace.validateWorkspace(wrongHeadWorkspace);
  const wrongHeadPath = path.join(configs, Workspace.workspaceFileName(wrongHeadWorkspace));
  fs.writeFileSync(wrongHeadPath, `${JSON.stringify(wrongHeadWorkspace, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const wrongHead = Workspace.inspectWorkspace(wrongHeadPath, { now: TIMES.inspect });
  assert.equal(wrongHead.status, 'blocked');
  assert.equal(wrongHead.issues[0].code, 'invalid-governance-workspace');

  const renamedPath = path.join(configs, 'renamed.json');
  fs.copyFileSync(secondConfigPath, renamedPath);
  assert.equal(Workspace.inspectWorkspace(renamedPath, { now: TIMES.inspect }).status, 'blocked');
  fs.rmSync(renamedPath);
  const extra = JSON.parse(fs.readFileSync(secondConfigPath, 'utf8'));
  extra.extra = true;
  assert.throws(() => Workspace.validateWorkspace(extra), /欄位/);
  const duplicatePath = path.join(configs, 'duplicate.json');
  fs.writeFileSync(duplicatePath, '{"schemaVersion":1,"schemaVersion":1}\n');
  assert.throws(() => Workspace.readWorkspaceFile(duplicatePath), /重複 JSON/);
  fs.rmSync(duplicatePath);
  const hardlinkPath = path.join(configs, 'alias.json');
  fs.linkSync(secondConfigPath, hardlinkPath);
  assert.throws(() => Workspace.readWorkspaceFile(secondConfigPath), /硬連結/);
  fs.rmSync(hardlinkPath);

  const movedDirectory = path.join(tempRoot, 'elsewhere', 'moved-config');
  fs.mkdirSync(movedDirectory, { recursive: true });
  const movedConfig = path.join(movedDirectory, path.basename(secondConfigPath));
  fs.copyFileSync(secondConfigPath, movedConfig);
  assert.equal(Workspace.inspectWorkspace(movedConfig, { now: TIMES.inspect }).status, 'blocked');
  assert.throws(() => Workspace.publishWorkspace({
    workspaceName: '重疊輸出', directory: snapshots, ledger, history, head: secondHead, output: snapshots,
    reviewer: '甲', basis: '乙', now: TIMES.inspect,
  }), /完全分離/);

  const failedOutput = path.join(tempRoot, 'failed-configs');
  assert.throws(() => Workspace.publishWorkspace({
    workspaceName: '暫存失敗', directory: snapshots, ledger, history, head: secondHead, output: failedOutput,
    reviewer: '甲', basis: '破壞暫存。', now: TIMES.inspect,
    beforeValidate: ({ stagingPath }) => fs.appendFileSync(stagingPath, '{'),
  }), /多餘內容|不是有效 JSON/);
  assert.equal(fs.existsSync(failedOutput), false);

  const lockedOutput = path.join(tempRoot, 'locked-configs');
  const lockPath = path.join(tempRoot, '.locked-configs.governance-workspace.lock');
  fs.writeFileSync(lockPath, 'existing');
  assert.throws(() => Workspace.publishWorkspace({
    workspaceName: '既有鎖', directory: snapshots, ledger, history, head: secondHead, output: lockedOutput,
    reviewer: '甲', basis: '不得移除他人鎖。', now: TIMES.inspect,
  }), /EEXIST/);
  assert.equal(fs.readFileSync(lockPath, 'utf8'), 'existing');
  fs.rmSync(lockPath);

  const raceOutput = path.join(tempRoot, 'race-configs');
  const raceFile = path.join(history, 'race.txt');
  assert.throws(() => Workspace.publishWorkspace({
    workspaceName: '來源競態', directory: snapshots, ledger, history, head: secondHead, output: raceOutput,
    reviewer: '甲', basis: '來源競態。', now: TIMES.inspect,
    beforePublish: () => fs.writeFileSync(raceFile, 'changed'),
  }), /發布期間|固定治理來源|終點已改變/);
  assert.equal(fs.existsSync(raceOutput), false);
  fs.rmSync(raceFile);

  const previousRaceOutput = path.join(tempRoot, 'previous-race-configs');
  const previousRaw = fs.readFileSync(secondConfigPath, 'utf8');
  assert.throws(() => Workspace.publishWorkspace({
    previousConfig: firstConfigPath,
    head: secondHead,
    output: previousRaceOutput,
    reviewer: '甲',
    basis: '前一設定競態。',
    now: TIMES.inspect,
    beforePublish: () => fs.appendFileSync(firstConfigPath, ' '),
  }), /前一設定已改變/);
  assert.equal(fs.existsSync(previousRaceOutput), false);
  fs.writeFileSync(firstConfigPath, firstRaw);
  assert.equal(fs.readFileSync(secondConfigPath, 'utf8'), previousRaw);

  const reviewSnapshots = path.join(tempRoot, 'review-sources', 'snapshots');
  const reviewLedger = path.join(tempRoot, 'review-sources', 'ledger');
  const reviewHistory = path.join(tempRoot, 'review-trusted', 'history');
  const reviewConfigs = path.join(tempRoot, 'review-configs');
  const reviewCase = makeCase('案件丙', 'review', 'E');
  writeSnapshot(reviewSnapshots, makeSnapshot([reviewCase], 'E', TIMES.first, '審閱案件群組'));
  writeSnapshot(reviewSnapshots, makeSnapshot([reviewCase], 'E', TIMES.second, '審閱案件群組'));
  fs.mkdirSync(path.dirname(reviewHistory), { recursive: true });
  const reviewCheckpoint = Checkpoint.publishCheckpoint(reviewSnapshots, reviewLedger, {
    initialize: true, output: reviewHistory, reviewer: '趙主管', basis: '只錨定空鏈。', now: TIMES.inspect,
  });
  const reviewHead = path.join(reviewHistory, reviewCheckpoint.publication.checkpointFileName);
  const reviewWorkspace = Workspace.publishWorkspace({
    workspaceName: '審閱工作區', directory: reviewSnapshots, ledger: reviewLedger, history: reviewHistory, head: reviewHead,
    output: reviewConfigs, reviewer: '趙主管', basis: '固定審閱案件來源。', now: TIMES.inspect,
  });
  assert.equal(reviewWorkspace.integrityStatus, 'ready');
  assert.equal(reviewWorkspace.status, 'review');

  const finalSnapshotDigest = directoryDigest(snapshots);
  const finalLedgerDigest = directoryDigest(ledger);
  const finalHistoryDigest = directoryDigest(history);
  const help = cli(['--help']);
  assert.equal(help.status, 0);
  const missing = cli([]);
  assert.equal(missing.status, 3);
  const readyCli = cli(['--config', secondConfigPath, '--json']);
  assert.equal(readyCli.status, 0);
  assert.equal(JSON.parse(readyCli.stdout).workspaceName, '案件甲治理工作區');
  if (process.platform === 'win32') {
    const readyBatch = batchCli('檢查附件治理工作區.bat', [secondConfigPath]);
    assert.equal(readyBatch.status, 0, `${readyBatch.stdout}\n${readyBatch.stderr}`);
    assert.match(readyBatch.stdout, /附件治理工作區狀態/);
    assert.match(readyBatch.stdout, /狀態：ready/);
    assert.doesNotMatch(`${readyBatch.stdout}\n${readyBatch.stderr}`, /not recognized|Press any key/i);

    const batchSnapshots = path.join(tempRoot, 'batch-sources', 'snapshots');
    const batchLedger = path.join(tempRoot, 'batch-sources', 'ledger');
    const batchHistory = path.join(tempRoot, 'batch-trusted', 'history');
    const batchConfigs = path.join(tempRoot, 'batch-configs');
    const batchNow = Date.now();
    writeSnapshot(batchSnapshots, makeSnapshot([caseA], 'C', new Date(batchNow - 3 * 60 * 60 * 1000).toISOString(), '批次案件群組'));
    writeSnapshot(batchSnapshots, makeSnapshot([caseA], 'C', new Date(batchNow - 2 * 60 * 60 * 1000).toISOString(), '批次案件群組'));
    fs.mkdirSync(path.dirname(batchHistory), { recursive: true });
    const batchCheckpoint = Checkpoint.publishCheckpoint(batchSnapshots, batchLedger, {
      initialize: true,
      output: batchHistory,
      reviewer: '批次複核人',
      basis: '建立批次入口測試檢查點。',
      now: new Date(batchNow - 60 * 60 * 1000),
    });
    const batchHead = path.join(batchHistory, batchCheckpoint.publication.checkpointFileName);
    const createBatch = batchCli('建立附件治理工作區.bat', [
      'initial', '批次工作區', batchSnapshots, batchLedger, batchHistory, batchHead, batchConfigs, '批次複核人', '驗證中文參數及完整建立流程。',
    ]);
    assert.equal(createBatch.status, 0, `${createBatch.stdout}\n${createBatch.stderr}`);
    assert.match(createBatch.stdout, /工作區：批次工作區/);
    assert.doesNotMatch(`${createBatch.stdout}\n${createBatch.stderr}`, /not recognized|Press any key/i);
    const batchConfigNames = fs.readdirSync(batchConfigs).filter(name => name.endsWith('.json'));
    assert.equal(batchConfigNames.length, 1);
    assert.equal(Workspace.inspectWorkspace(path.join(batchConfigs, batchConfigNames[0])).status, 'ready');
  }
  const reviewCli = cli(['--config', firstConfigPath, '--json']);
  assert.equal(reviewCli.status, 1);
  const blockedCli = cli(['--config', wrongHeadPath, '--json']);
  assert.equal(blockedCli.status, 2);
  const errorCli = cli(['--create']);
  assert.equal(errorCli.status, 3);
  assert.equal(directoryDigest(snapshots), finalSnapshotDigest);
  assert.equal(directoryDigest(ledger), finalLedgerDigest);
  assert.equal(directoryDigest(history), finalHistoryDigest);

  console.log('attachment case governance workspace tests passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
