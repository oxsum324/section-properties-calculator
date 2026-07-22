'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const History = require('./attachment-package-upgrade-history.js');
const Index = require('./attachment-package-upgrade-history-index.js');

const INDEX_TIME = new Date('2026-07-22T08:00:00.000Z');
const RECEIPT_TIMES = [
  new Date('2026-07-22T00:00:00.000Z'),
  new Date('2026-07-22T00:01:00.000Z'),
  new Date('2026-07-22T00:02:00.000Z'),
  new Date('2026-07-22T00:03:00.000Z'),
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function directorySnapshot(directory) {
  return fs.readdirSync(directory).sort().map(name => {
    const filePath = path.join(directory, name);
    const stat = fs.lstatSync(filePath);
    return { name, isFile: stat.isFile(), isDirectory: stat.isDirectory(), isLink: stat.isSymbolicLink(), sha256: stat.isFile() ? sha256(filePath) : '' };
  });
}

function copyHistory(source, target) {
  fs.cpSync(source, target, { recursive: true, errorOnExist: true });
  return target;
}

function writeReceipt(historyDir, options) {
  const flowResult = {
    kind: 'formal-attachment-package-upgrade-flow.v1',
    inputKind: options.inputKind || 'formal-package',
    action: options.action,
    status: options.status,
    changedState: options.changed,
    workspaceDir: '',
    packageDir: '',
    workspaceResult: {
      planFingerprint: options.workspacePlanFingerprint || '',
      assessment: {
        status: options.assessmentStatus || options.status,
        currentPackage: { packageFingerprint: options.inputPackageFingerprint || '' },
      },
    },
  };
  if (options.action === 'package-built') {
    flowResult.inputKind = 'upgrade-workspace';
    flowResult.workspaceResult = undefined;
    flowResult.completion = {
      status: 'ready',
      plan: {
        sourcePackageFingerprint: options.inputPackageFingerprint,
        planFingerprint: options.workspacePlanFingerprint,
      },
      summary: { total: 1, matched: 1, pending: 0, errors: 0, warnings: 0 },
    };
    flowResult.buildResult = {
      packageFingerprint: options.outputPackageFingerprint,
      selfVerification: { status: 'ready' },
    };
  }
  const receipt = History.buildReceipt(flowResult, {
    historyDir,
    selectedInput: path.dirname(historyDir),
    inputKind: flowResult.inputKind,
  }, { now: options.now, receiptId: options.receiptId });
  return History.writeReceipt(receipt, historyDir, { probeToken: `PROBE-${options.receiptId}` });
}

function writeBaseline(filePath, index) {
  fs.writeFileSync(filePath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

function issueCodes(result) {
  return result.issues.map(item => item.code);
}

function readOnlyInspect(historyDir, options = {}) {
  const before = directorySnapshot(historyDir);
  const result = Index.inspectHistoryDir(historyDir, { now: INDEX_TIME, ...options });
  assert.deepEqual(directorySnapshot(historyDir), before, 'history index inspection must be read-only');
  return result;
}

assert.equal(Index.INDEX_KIND, 'formal-attachment-package-upgrade-history-index.v1');
assert.deepEqual(Index.INDEX_EXIT_CODES, { valid: 0, review: 1, blocked: 2, error: 3 });
assert.deepEqual(
  Index.parseArgs(['--history', 'C:/history', '--baseline', 'C:/baseline.json', '--json']),
  { json: true, history: 'C:/history', baseline: 'C:/baseline.json' },
);
assert.match(Index.usage(), /固定唯讀/);
assert.equal(Index.exitCodeForStatus('valid'), 0);
assert.equal(Index.exitCodeForStatus('review'), 1);
assert.equal(Index.exitCodeForStatus('blocked'), 2);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-package-upgrade-history-index-'));
try {
  const historyDir = path.join(tempRoot, 'history');
  fs.mkdirSync(historyDir);
  writeReceipt(historyDir, {
    action: 'no-upgrade-needed', status: 'ready', changed: false,
    inputPackageFingerprint: 'PKG-111111111111111111111111',
    now: RECEIPT_TIMES[0], receiptId: 'RECEIPT01',
  });
  writeReceipt(historyDir, {
    action: 'workspace-created', status: 'review', changed: true,
    inputPackageFingerprint: 'PKG-222222222222222222222222',
    workspacePlanFingerprint: 'WSP-222222222222222222222222',
    now: RECEIPT_TIMES[1], receiptId: 'RECEIPT02',
  });
  writeReceipt(historyDir, {
    action: 'package-blocked', status: 'blocked', changed: false,
    now: RECEIPT_TIMES[2], receiptId: 'RECEIPT03',
  });

  const current = readOnlyInspect(historyDir);
  assert.equal(current.kind, Index.INDEX_KIND);
  assert.equal(current.status, 'valid');
  assert.equal(current.generatedAt, INDEX_TIME.toISOString());
  assert.match(current.collectionFingerprint, /^HIX-[0-9A-F]{24}$/);
  assert.equal(Index.collectionFingerprint(current.receipts), Index.collectionFingerprint([...current.receipts].reverse()));
  assert.deepEqual(current.summary, {
    files: 3, validReceipts: 3, invalidReceipts: 0,
    readyOutcomes: 1, reviewOutcomes: 1, blockedOutcomes: 1,
    added: 0, missing: 0, changed: 0, errors: 0, warnings: 0,
  });
  assert.equal(current.baseline.status, 'not-provided');
  assert.equal(current.baseline.requested, false);
  assert.equal(current.receipts.some(record => Object.keys(record).some(key => /path/i.test(key))), false);
  assert.doesNotMatch(JSON.stringify(current), /Desktop|approvalTime|核可時間/i);
  assert.match(Index.formatSummary(current), /無法證明過去收據是否曾遭刪除/);
  assert.match(Index.formatSummary(current), /不代表附件已正式核可/);

  const cliBefore = directorySnapshot(historyDir);
  const cli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-history-index.js'),
    '--history', historyDir,
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.equal(JSON.parse(cli.stdout).status, 'valid');
  assert.deepEqual(directorySnapshot(historyDir), cliBefore, 'CLI inspection must not write history files');

  const baselinePath = path.join(tempRoot, 'trusted-baseline.json');
  writeBaseline(baselinePath, current);
  const matched = readOnlyInspect(historyDir, { baseline: baselinePath });
  assert.equal(matched.status, 'valid');
  assert.equal(matched.baseline.used, true);
  assert.equal(matched.baseline.requested, true);
  assert.equal(matched.baseline.status, 'match');

  writeReceipt(historyDir, {
    action: 'package-built', status: 'ready', changed: true,
    inputPackageFingerprint: 'PKG-444444444444444444444444',
    workspacePlanFingerprint: 'WSP-444444444444444444444444',
    outputPackageFingerprint: 'PKG-555555555555555555555555',
    now: RECEIPT_TIMES[3], receiptId: 'RECEIPT04',
  });
  const added = readOnlyInspect(historyDir, { baseline: baselinePath });
  assert.equal(added.status, 'review');
  assert.deepEqual(added.baseline.added, ['RECEIPT04']);
  assert.equal(added.summary.added, 1);
  assert.equal(issueCodes(added).includes('baseline-receipt-added'), true);
  const addedCli = spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-history-index.js'),
    '--history', historyDir,
    '--baseline', baselinePath,
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(addedCli.status, 1, addedCli.stderr || addedCli.stdout);

  const currentFour = readOnlyInspect(historyDir);
  const fourBaselinePath = path.join(tempRoot, 'trusted-four-baseline.json');
  writeBaseline(fourBaselinePath, currentFour);

  const missingDir = copyHistory(historyDir, path.join(tempRoot, 'missing-history'));
  fs.rmSync(path.join(missingDir, currentFour.receipts[0].fileName));
  const missing = readOnlyInspect(missingDir, { baseline: fourBaselinePath });
  assert.equal(missing.status, 'blocked');
  assert.deepEqual(missing.baseline.missing, [currentFour.receipts[0].receiptId]);
  assert.equal(issueCodes(missing).includes('baseline-receipt-missing'), true);

  const changedDir = copyHistory(historyDir, path.join(tempRoot, 'changed-history'));
  const changedRecord = currentFour.receipts[0];
  const changedOldPath = path.join(changedDir, changedRecord.fileName);
  const changedReceipt = JSON.parse(fs.readFileSync(changedOldPath, 'utf8'));
  changedReceipt.flow.action = 'package-blocked';
  changedReceipt.flow.status = 'blocked';
  changedReceipt.receiptFingerprint = History.receiptFingerprint(changedReceipt);
  const changedName = Index.receiptFileName(changedReceipt);
  fs.rmSync(changedOldPath);
  fs.writeFileSync(path.join(changedDir, changedName), `${JSON.stringify(changedReceipt, null, 2)}\n`, 'utf8');
  const changed = readOnlyInspect(changedDir, { baseline: fourBaselinePath });
  assert.equal(changed.status, 'blocked');
  assert.deepEqual(changed.baseline.changed, [changedRecord.receiptId]);
  assert.equal(issueCodes(changed).includes('baseline-receipt-changed'), true);
  assert.equal(issueCodes(changed).includes('receipt-fingerprint-mismatch'), false);

  const tamperedDir = copyHistory(historyDir, path.join(tempRoot, 'tampered-history'));
  const tamperedPath = path.join(tamperedDir, currentFour.receipts[1].fileName);
  const tamperedReceipt = JSON.parse(fs.readFileSync(tamperedPath, 'utf8'));
  tamperedReceipt.input.packageFingerprint = 'PKG-AAAAAAAAAAAAAAAAAAAAAAAA';
  fs.writeFileSync(tamperedPath, `${JSON.stringify(tamperedReceipt, null, 2)}\n`, 'utf8');
  const tampered = readOnlyInspect(tamperedDir);
  assert.equal(tampered.status, 'blocked');
  assert.equal(issueCodes(tampered).includes('receipt-fingerprint-mismatch'), true);

  const unknownDir = copyHistory(historyDir, path.join(tempRoot, 'unknown-field-history'));
  const unknownPath = path.join(unknownDir, currentFour.receipts[1].fileName);
  const unknownReceipt = JSON.parse(fs.readFileSync(unknownPath, 'utf8'));
  unknownReceipt.calculationInput = { moment: 123 };
  unknownReceipt.receiptFingerprint = History.receiptFingerprint(unknownReceipt);
  fs.writeFileSync(unknownPath, `${JSON.stringify(unknownReceipt, null, 2)}\n`, 'utf8');
  const unknown = readOnlyInspect(unknownDir);
  assert.equal(unknown.status, 'blocked');
  assert.equal(issueCodes(unknown).includes('unknown-history-field'), true);

  const duplicateKeyDir = copyHistory(historyDir, path.join(tempRoot, 'duplicate-key-history'));
  const duplicateKeyPath = path.join(duplicateKeyDir, currentFour.receipts[0].fileName);
  const duplicateText = fs.readFileSync(duplicateKeyPath, 'utf8').replace(
    '"receiptId": "RECEIPT01",',
    '"receiptId": "RECEIPT01",\n  "receiptId": "RECEIPT01",',
  );
  fs.writeFileSync(duplicateKeyPath, duplicateText, 'utf8');
  const duplicateKey = readOnlyInspect(duplicateKeyDir);
  assert.equal(duplicateKey.status, 'blocked');
  assert.equal(issueCodes(duplicateKey).includes('duplicate-receipt-json-key'), true);

  const renamedDir = copyHistory(historyDir, path.join(tempRoot, 'renamed-history'));
  const originalName = currentFour.receipts[0].fileName;
  fs.renameSync(path.join(renamedDir, originalName), path.join(renamedDir, `RENAMED-${originalName}`));
  const renamed = readOnlyInspect(renamedDir);
  assert.equal(renamed.status, 'blocked');
  assert.equal(issueCodes(renamed).includes('receipt-filename-mismatch'), true);

  const pollutedDir = copyHistory(historyDir, path.join(tempRoot, 'polluted-history'));
  fs.writeFileSync(path.join(pollutedDir, 'notes.txt'), 'must remain outside', 'utf8');
  const polluted = readOnlyInspect(pollutedDir);
  assert.equal(polluted.status, 'blocked');
  assert.equal(issueCodes(polluted).includes('unexpected-history-entry'), true);

  const baselineInsideDir = copyHistory(historyDir, path.join(tempRoot, 'baseline-inside-history'));
  const baselineInsidePath = path.join(baselineInsideDir, 'trusted-baseline.json');
  writeBaseline(baselineInsidePath, currentFour);
  const baselineInside = readOnlyInspect(baselineInsideDir, { baseline: baselineInsidePath });
  assert.equal(baselineInside.status, 'blocked');
  assert.equal(issueCodes(baselineInside).includes('baseline-inside-history'), true);

  const corruptBaselinePath = path.join(tempRoot, 'corrupt-baseline.json');
  const corruptBaseline = JSON.parse(JSON.stringify(currentFour));
  corruptBaseline.receipts[0].status = 'blocked';
  writeBaseline(corruptBaselinePath, corruptBaseline);
  const corruptBaselineResult = readOnlyInspect(historyDir, { baseline: corruptBaselinePath });
  assert.equal(corruptBaselineResult.status, 'blocked');
  assert.equal(corruptBaselineResult.baseline.status, 'invalid');
  assert.equal(issueCodes(corruptBaselineResult).includes('baseline-fingerprint-mismatch'), true);
  assert.match(Index.formatSummary(corruptBaselineResult), /可信基準：無效/);

  const malformedBaselinePath = path.join(tempRoot, 'malformed-baseline.json');
  const malformedBaseline = JSON.parse(JSON.stringify(currentFour));
  malformedBaseline.receipts[0].recordedAt = 123;
  malformedBaseline.collectionFingerprint = 'HIX-000000000000000000000000';
  writeBaseline(malformedBaselinePath, malformedBaseline);
  const malformedBaselineResult = readOnlyInspect(historyDir, { baseline: malformedBaselinePath });
  assert.equal(malformedBaselineResult.status, 'blocked');
  assert.equal(malformedBaselineResult.baseline.status, 'invalid');
  assert.equal(issueCodes(malformedBaselineResult).includes('invalid-baseline-receipt'), true);

  const emptyDir = path.join(tempRoot, 'empty-history');
  fs.mkdirSync(emptyDir);
  const empty = readOnlyInspect(emptyDir);
  assert.equal(empty.status, 'review');
  assert.equal(issueCodes(empty).includes('history-empty'), true);

  const help = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-upgrade-history-index.js'), '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  const missingArg = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-upgrade-history-index.js')], { encoding: 'utf8' });
  assert.equal(missingArg.status, 3);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment package upgrade history read-only index OK');
