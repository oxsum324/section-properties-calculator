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

const BASELINE_TIME = new Date('2026-07-22T09:10:11.000Z');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function directorySnapshot(directory) {
  return fs.readdirSync(directory).sort().map(name => {
    const filePath = path.join(directory, name);
    const stat = fs.lstatSync(filePath);
    return {
      name,
      type: stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'link' : 'other',
      sha256: stat.isFile() ? sha256(filePath) : '',
    };
  });
}

function addReceipt(historyDir, suffix = '01', now = new Date('2026-07-22T01:00:00.000Z')) {
  const receiptId = `BASELINE${suffix}`;
  const flowResult = {
    kind: 'formal-attachment-package-upgrade-flow.v1',
    inputKind: 'formal-package',
    action: suffix === '02' ? 'workspace-created' : 'no-upgrade-needed',
    status: suffix === '02' ? 'review' : 'ready',
    changedState: suffix === '02',
    workspaceDir: '',
    packageDir: '',
    workspaceResult: {
      planFingerprint: suffix === '02' ? 'WSP-222222222222222222222222' : '',
      assessment: {
        status: suffix === '02' ? 'review' : 'ready',
        currentPackage: { packageFingerprint: `PKG-${suffix.repeat(12)}` },
      },
    },
  };
  const receipt = History.buildReceipt(flowResult, {
    historyDir,
    selectedInput: path.dirname(historyDir),
    inputKind: flowResult.inputKind,
  }, { now, receiptId });
  return History.writeReceipt(receipt, historyDir, { probeToken: `BASELINE-${suffix}` });
}

function makeHistory(parent, name = 'history') {
  const historyDir = path.join(parent, name);
  fs.mkdirSync(historyDir, { recursive: true });
  addReceipt(historyDir, '01');
  addReceipt(historyDir, '02', new Date('2026-07-22T01:01:00.000Z'));
  return historyDir;
}

function cli(args) {
  return spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-history-baseline.js'),
    ...args,
  ], { encoding: 'utf8' });
}

assert.equal(Baseline.PUBLICATION_KIND, 'formal-attachment-package-upgrade-history-baseline-publication.v1');
assert.equal(Baseline.BASELINE_DIR_NAME, '附件升級可信基準_勿附入主報告');
assert.match(Baseline.BASELINE_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.deepEqual(
  Baseline.parseArgs(['--history', 'C:/history', '--baseline', 'C:/old.json', '--output', 'C:/new.json', '--json']),
  { json: true, history: 'C:/history', baseline: 'C:/old.json', output: 'C:/new.json' },
);
assert.throws(() => Baseline.parseArgs(['--baseline']), /缺少路徑值/);
assert.throws(() => Baseline.parseArgs(['--output', '--json']), /缺少路徑值/);
assert.match(Baseline.usage(), /既有檔案不得覆寫/);
assert.match(Baseline.usage(), /不代表附件正式核可/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-history-baseline-'));
try {
  const historyDir = makeHistory(tempRoot);
  const historyBefore = directorySnapshot(historyDir);
  const published = Baseline.publishBaseline(historyDir, { now: BASELINE_TIME });
  assert.equal(published.kind, Baseline.PUBLICATION_KIND);
  assert.equal(published.status, 'valid');
  assert.equal(published.published, true);
  assert.equal(published.receiptCount, 2);
  assert.equal(published.boundary.attachToFormalReport, false);
  assert.equal(published.boundary.formalApproval, false);
  assert.ok(fs.existsSync(published.baselinePath));
  assert.equal(path.basename(path.dirname(published.baselinePath)), Baseline.BASELINE_DIR_NAME);
  assert.equal(path.dirname(published.baselinePath) === historyDir, false);
  assert.deepEqual(directorySnapshot(historyDir), historyBefore, 'baseline publication must not write the history directory');

  const baselineJson = JSON.parse(fs.readFileSync(published.baselinePath, 'utf8'));
  assert.equal(baselineJson.kind, Index.INDEX_KIND);
  assert.equal(baselineJson.status, 'valid');
  assert.equal(baselineJson.collectionFingerprint, published.collectionFingerprint);
  assert.equal(baselineJson.receipts.length, 2);
  assert.doesNotMatch(JSON.stringify(baselineJson), /Desktop|AppData|attachment-history-baseline|approvalTime|核可時間|calculationInput/i);
  assert.equal(fs.readdirSync(path.dirname(published.baselinePath)).some(name => name.includes('.tmp-')), false);

  const matched = Index.inspectHistoryDir(historyDir, { baseline: published.baselinePath, now: BASELINE_TIME });
  assert.equal(matched.status, 'valid');
  assert.equal(matched.baseline.status, 'match');

  const oldBaselineHash = sha256(published.baselinePath);
  assert.throws(
    () => Baseline.publishBaseline(historyDir, { now: BASELINE_TIME }),
    /不得覆寫/,
  );
  assert.equal(sha256(published.baselinePath), oldBaselineHash, 'duplicate publication must preserve the existing baseline');

  assert.throws(
    () => Baseline.publishBaseline(historyDir, { now: new Date('2026-07-22T09:11:00.000Z'), output: path.join(historyDir, 'baseline.json') }),
    /不得位於歷程內/,
  );
  assert.throws(
    () => Baseline.publishBaseline(historyDir, { now: new Date('2026-07-22T09:12:00.000Z'), output: path.join(tempRoot, 'wraps-history.json') }),
    /不得位於歷程內，也不得包住歷程/,
  );
  assert.deepEqual(directorySnapshot(historyDir), historyBefore);

  const emptyRoot = path.join(tempRoot, 'empty-case');
  const emptyHistory = path.join(emptyRoot, 'history');
  fs.mkdirSync(emptyHistory, { recursive: true });
  const empty = Baseline.publishBaseline(emptyHistory, { now: BASELINE_TIME });
  assert.equal(empty.status, 'review');
  assert.equal(empty.published, false);
  assert.equal(fs.existsSync(path.join(emptyRoot, Baseline.BASELINE_DIR_NAME)), false);
  assert.match(Baseline.formatSummary(empty), /沒有建立或修改任何基準檔/);
  assert.match(Baseline.formatSummary(empty), /尚無任何收據/);
  const emptyCli = cli(['--history', emptyHistory, '--json']);
  assert.equal(emptyCli.status, 1, emptyCli.stderr || emptyCli.stdout);
  assert.equal(JSON.parse(emptyCli.stdout).published, false);

  const tamperedRoot = path.join(tempRoot, 'tampered-case');
  const tamperedHistory = makeHistory(tamperedRoot);
  const tamperedName = fs.readdirSync(tamperedHistory).sort()[0];
  const tamperedPath = path.join(tamperedHistory, tamperedName);
  const tamperedReceipt = JSON.parse(fs.readFileSync(tamperedPath, 'utf8'));
  tamperedReceipt.input.packageFingerprint = 'PKG-AAAAAAAAAAAAAAAAAAAAAAAA';
  fs.writeFileSync(tamperedPath, `${JSON.stringify(tamperedReceipt, null, 2)}\n`, 'utf8');
  const tampered = Baseline.publishBaseline(tamperedHistory, { now: BASELINE_TIME });
  assert.equal(tampered.status, 'blocked');
  assert.equal(tampered.published, false);
  assert.equal(fs.existsSync(path.join(tamperedRoot, Baseline.BASELINE_DIR_NAME)), false);
  const tamperedCli = cli(['--history', tamperedHistory, '--json']);
  assert.equal(tamperedCli.status, 2, tamperedCli.stderr || tamperedCli.stdout);

  addReceipt(historyDir, '03', new Date('2026-07-22T01:02:00.000Z'));
  const additionOutput = path.join(tempRoot, 'addition-output', 'must-not-exist.json');
  const addition = Baseline.publishBaseline(historyDir, {
    baseline: published.baselinePath,
    output: additionOutput,
    now: new Date('2026-07-22T09:13:00.000Z'),
  });
  assert.equal(addition.status, 'review');
  assert.equal(addition.published, false);
  assert.equal(addition.index.baseline.status, 'new-records');
  assert.equal(fs.existsSync(additionOutput), false);
  assert.equal(fs.existsSync(path.dirname(additionOutput)), false);

  const failureRoot = path.join(tempRoot, 'rename-failure');
  const failureHistory = makeHistory(failureRoot);
  const failureOutput = path.join(failureRoot, 'new-baseline', 'baseline.json');
  assert.throws(
    () => Baseline.publishBaseline(failureHistory, {
      now: BASELINE_TIME,
      output: failureOutput,
      renameSync() { throw new Error('injected atomic publish failure'); },
    }),
    /injected atomic publish failure/,
  );
  assert.equal(fs.existsSync(failureOutput), false);
  assert.equal(fs.existsSync(path.dirname(failureOutput)), false, 'new empty output directory must be cleaned after failure');

  const cliRoot = path.join(tempRoot, 'cli-case');
  const cliHistory = makeHistory(cliRoot);
  const cliOutput = path.join(cliRoot, 'trusted', 'baseline.json');
  const cliResult = cli(['--history', cliHistory, '--output', cliOutput, '--json']);
  assert.equal(cliResult.status, 0, cliResult.stderr || cliResult.stdout);
  const cliJson = JSON.parse(cliResult.stdout);
  assert.equal(cliJson.published, true);
  assert.equal(cliJson.baselinePath, path.resolve(cliOutput));
  assert.ok(fs.existsSync(cliOutput));
  assert.match(Baseline.formatSummary(cliJson), /可信基準已發布/);

  const cliBaselineHash = sha256(cliOutput);
  const duplicateCli = cli(['--history', cliHistory, '--output', cliOutput, '--json']);
  assert.equal(duplicateCli.status, 3);
  assert.match(duplicateCli.stderr, /不得覆寫/);
  assert.equal(sha256(cliOutput), cliBaselineHash);

  const help = cli(['--help']);
  assert.equal(help.status, 0);
  const missingArg = cli([]);
  assert.equal(missingArg.status, 3);
  const missingOutputValue = cli(['--history', cliHistory, '--output']);
  assert.equal(missingOutputValue.status, 3);
  assert.match(missingOutputValue.stderr, /缺少路徑值/);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment package upgrade trusted history baseline publisher OK');
