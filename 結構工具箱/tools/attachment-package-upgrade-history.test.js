'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const History = require('./attachment-package-upgrade-history.js');

const FIXED_NOW = new Date('2026-07-21T16:00:00.000Z');

function names(directory) {
  return fs.existsSync(directory) ? fs.readdirSync(directory).sort() : [];
}

assert.equal(History.HISTORY_KIND, 'formal-attachment-package-upgrade-history-record.v1');
assert.match(History.HISTORY_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.equal(
  History.receiptFingerprint({ a: 1, b: 2 }),
  History.receiptFingerprint({ b: 2, a: 1 }),
);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-package-upgrade-history-'));
try {
  const packageDir = path.join(tempRoot, 'legacy-package');
  const workspaceDir = path.join(tempRoot, 'upgrade-workspace');
  const outputDir = path.join(tempRoot, 'new-v3-package');
  const historyDir = path.join(tempRoot, 'internal-history');
  fs.mkdirSync(packageDir);
  fs.mkdirSync(workspaceDir);
  fs.mkdirSync(outputDir);
  fs.writeFileSync(path.join(packageDir, 'sentinel.txt'), 'package', 'utf8');
  fs.writeFileSync(path.join(workspaceDir, 'sentinel.txt'), 'workspace', 'utf8');
  fs.writeFileSync(path.join(outputDir, 'sentinel.txt'), 'output', 'utf8');
  const protectedBefore = {
    package: fs.readFileSync(path.join(packageDir, 'sentinel.txt'), 'utf8'),
    workspace: fs.readFileSync(path.join(workspaceDir, 'sentinel.txt'), 'utf8'),
    output: fs.readFileSync(path.join(outputDir, 'sentinel.txt'), 'utf8'),
  };

  const detected = { kind: 'formal-package', inputDir: packageDir, workspaceDir: '' };
  assert.equal(History.defaultHistoryDir(packageDir, detected), path.join(tempRoot, History.HISTORY_DIR_NAME));
  const context = History.prepareHistoryContext(packageDir, detected, {
    historyDir,
    output: workspaceDir,
    probeToken: 'PREPARE01',
  });
  assert.equal(context.historyDir, historyDir);
  assert.deepEqual(names(historyDir), [], 'write probe must be removed before the flow action');

  const flowResult = {
    kind: 'formal-attachment-package-upgrade-flow.v1',
    inputKind: 'formal-package',
    action: 'workspace-created',
    status: 'review',
    changedState: true,
    workspaceDir,
    packageDir: '',
    approvalTime: 'APPROVAL-MUST-NOT-LEAK',
    calculationInput: { moment: 'INPUT-VALUE-MUST-NOT-LEAK' },
    workspaceResult: {
      planFingerprint: 'WSP-1234567890ABCDEF12345678',
      assessment: {
        status: 'review',
        currentPackage: { packageFingerprint: 'PKG-1234567890ABCDEF12345678' },
      },
    },
  };
  const receipt = History.buildReceipt(flowResult, context, { now: FIXED_NOW, receiptId: 'RECEIPT01' });
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.kind, History.HISTORY_KIND);
  assert.equal(receipt.recordedAt, FIXED_NOW.toISOString());
  assert.equal(receipt.flow.action, 'workspace-created');
  assert.equal(receipt.flow.status, 'review');
  assert.equal(receipt.input.packageFingerprint, 'PKG-1234567890ABCDEF12345678');
  assert.equal(receipt.input.workspacePlanFingerprint, 'WSP-1234567890ABCDEF12345678');
  assert.deepEqual(Object.keys(receipt.input), ['packageFingerprint', 'workspacePlanFingerprint']);
  assert.deepEqual(Object.keys(receipt.output), ['packageFingerprint']);
  assert.equal(receipt.boundary.attachToFormalReport, false);
  assert.match(receipt.receiptFingerprint, /^HIS-[0-9A-F]{24}$/);
  assert.equal(History.receiptFingerprint(receipt), receipt.receiptFingerprint);
  assert.doesNotMatch(JSON.stringify(receipt), /approvalTime|核可時間/i);
  assert.doesNotMatch(JSON.stringify(receipt), /APPROVAL-MUST-NOT-LEAK|INPUT-VALUE-MUST-NOT-LEAK/);

  const written = History.writeReceipt(receipt, historyDir, { probeToken: 'WRITE001' });
  assert.equal(written.written, true);
  assert.equal(written.historyDir, historyDir);
  assert.equal(fs.existsSync(written.recordPath), true);
  assert.match(path.basename(written.recordPath), /^20260722-000000-workspace-created-RECEIPT01\.json$/);
  assert.deepEqual(JSON.parse(fs.readFileSync(written.recordPath, 'utf8')), receipt);
  assert.deepEqual(protectedBefore, {
    package: fs.readFileSync(path.join(packageDir, 'sentinel.txt'), 'utf8'),
    workspace: fs.readFileSync(path.join(workspaceDir, 'sentinel.txt'), 'utf8'),
    output: fs.readFileSync(path.join(outputDir, 'sentinel.txt'), 'utf8'),
  }, 'history receipt must not modify packages or workspaces');

  assert.throws(
    () => History.writeReceipt(receipt, historyDir, { probeToken: 'COLLIDE1' }),
    /不得覆寫/,
  );
  const failedReceipt = History.buildReceipt(flowResult, context, { now: FIXED_NOW, receiptId: 'RECEIPT02' });
  assert.throws(
    () => History.writeReceipt(failedReceipt, historyDir, {
      probeToken: 'FAILPROB',
      renameSync() { throw new Error('simulated receipt publish failure'); },
    }),
    /simulated receipt publish failure/,
  );
  assert.equal(names(historyDir).some(name => name.includes('RECEIPT02')), false, 'failed publish must remove receipt staging files');

  const completedFlow = {
    kind: 'formal-attachment-package-upgrade-flow.v1',
    inputKind: 'upgrade-workspace',
    action: 'package-built',
    status: 'ready',
    changedState: true,
    workspaceDir,
    packageDir: outputDir,
    completion: {
      status: 'ready',
      plan: {
        planFingerprint: 'WSP-ABCDEF1234567890ABCDEF12',
        sourcePackageFingerprint: 'PKG-ABCDEF1234567890ABCDEF12',
      },
      summary: { total: 1, matched: 1, pending: 0, errors: 0, warnings: 0 },
    },
    buildResult: {
      packageFingerprint: 'PKG-NEW1234567890ABCDEF1234',
      selfVerification: { status: 'ready' },
    },
  };
  const completed = History.recordFlowResult(completedFlow, {
    historyDir,
    selectedInput: workspaceDir,
    inputKind: 'upgrade-workspace',
  }, { now: new Date('2026-07-21T16:01:00.000Z'), receiptId: 'RECEIPT03', probeToken: 'WRITE003' });
  assert.equal(completed.receipt.flow.status, 'ready');
  assert.equal(completed.receipt.output.packageFingerprint, 'PKG-NEW1234567890ABCDEF1234');
  assert.equal(completed.receipt.evidence.selfVerificationStatus, 'ready');
  assert.equal(completed.receipt.evidence.completionSummary.matched, 1);

  assert.throws(
    () => History.validateHistoryBoundary(path.join(packageDir, 'history'), [packageDir]),
    /必須位於附件包、升級工作區及正式輸出之外/,
  );
  assert.throws(
    () => History.validateHistoryBoundary(tempRoot, [packageDir]),
    /必須位於附件包、升級工作區及正式輸出之外/,
  );
  assert.throws(
    () => History.validateHistoryBoundary(path.join(workspaceDir, 'history'), [workspaceDir]),
    /必須位於附件包、升級工作區及正式輸出之外/,
  );
  assert.throws(
    () => History.validateHistoryBoundary(path.join(outputDir, 'history'), [outputDir]),
    /必須位於附件包、升級工作區及正式輸出之外/,
  );
  const unsafeHistoryFile = path.join(tempRoot, 'history-is-file');
  fs.writeFileSync(unsafeHistoryFile, 'not directory', 'utf8');
  assert.throws(() => History.validateHistoryBoundary(unsafeHistoryFile, []), /必須是實體資料夾/);
  assert.throws(
    () => History.buildReceipt(flowResult, context, { now: FIXED_NOW, receiptId: 'bad id' }),
    /receiptId 格式無效/,
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment package external upgrade history OK');
