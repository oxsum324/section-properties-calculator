'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const History = require('./attachment-package-upgrade-history.js');
const Baseline = require('./attachment-package-upgrade-history-baseline.js');
const Advance = require('./attachment-package-upgrade-history-baseline-advance.js');
const Chain = require('./attachment-package-upgrade-history-baseline-chain.js');

const TIMES = {
  receipt1: new Date('2026-07-22T01:00:00.000Z'),
  receipt2: new Date('2026-07-22T01:01:00.000Z'),
  receipt3: new Date('2026-07-22T01:02:00.000Z'),
  receipt4: new Date('2026-07-22T01:03:00.000Z'),
  initial: new Date('2026-07-22T03:00:00.000Z'),
  advance2: new Date('2026-07-22T04:00:00.000Z'),
  advance3: new Date('2026-07-22T05:00:00.000Z'),
  inspect: new Date('2026-07-22T06:00:00.000Z'),
};

function addReceipt(historyDir, suffix, now) {
  const receiptId = `CHAIN${suffix.padStart(3, '0')}`;
  const flowResult = {
    kind: 'formal-attachment-package-upgrade-flow.v1',
    inputKind: 'formal-package',
    action: 'no-upgrade-needed',
    status: 'ready',
    changedState: false,
    workspaceDir: '',
    packageDir: '',
    workspaceResult: {
      planFingerprint: '',
      assessment: {
        status: 'ready',
        currentPackage: { packageFingerprint: `PKG-${suffix.padStart(2, '0').repeat(12)}` },
      },
    },
  };
  const receipt = History.buildReceipt(flowResult, {
    historyDir,
    selectedInput: path.dirname(historyDir),
    inputKind: flowResult.inputKind,
  }, { now, receiptId });
  return History.writeReceipt(receipt, historyDir, { probeToken: `CHAIN-${suffix}` });
}

function createValidChain(parent) {
  const historyDir = path.join(parent, 'history');
  const chainRoot = path.join(parent, 'trusted-chain');
  fs.mkdirSync(historyDir, { recursive: true });
  addReceipt(historyDir, '1', TIMES.receipt1);
  const initialPath = path.join(chainRoot, 'initial-baseline.json');
  const initial = Baseline.publishBaseline(historyDir, { now: TIMES.initial, output: initialPath });
  assert.equal(initial.published, true);

  addReceipt(historyDir, '2', TIMES.receipt2);
  const advance2 = Advance.advanceBaseline(historyDir, {
    baseline: initialPath,
    now: TIMES.advance2,
    acceptAdditions: true,
    reviewer: 'QA-CHAIN-01',
    basis: 'CHAIN-REV-02',
    advancementId: 'ADV-CHAIN-0002',
    output: path.join(chainRoot, 'advance-02'),
  });
  assert.equal(advance2.advanced, true);

  addReceipt(historyDir, '3', TIMES.receipt3);
  const advance3 = Advance.advanceBaseline(historyDir, {
    baseline: advance2.baselinePath,
    now: TIMES.advance3,
    acceptAdditions: true,
    reviewer: 'QA-CHAIN-02',
    basis: 'CHAIN-REV-03',
    advancementId: 'ADV-CHAIN-0003',
    output: path.join(chainRoot, 'advance-03'),
  });
  assert.equal(advance3.advanced, true);
  return { historyDir, chainRoot, initialPath, advance2, advance3 };
}

function copyDirectoryFiles(source, target, filter = () => true) {
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source).sort().forEach(name => {
    if (!filter(name)) return;
    const sourcePath = path.join(source, name);
    const targetPath = path.join(target, name);
    const stat = fs.lstatSync(sourcePath);
    if (stat.isDirectory()) copyDirectoryFiles(sourcePath, targetPath);
    else if (stat.isFile()) fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
    else throw new Error(`unsupported test entry: ${sourcePath}`);
  });
}

function directoryDigest(directory) {
  return JSON.stringify(Chain.directorySnapshot(directory));
}

function issueCodes(result) {
  return result.issues.map(item => item.code);
}

function cli(args) {
  return spawnSync(process.execPath, [
    path.join(__dirname, 'attachment-package-upgrade-history-baseline-chain.js'),
    ...args,
  ], { encoding: 'utf8' });
}

assert.equal(Chain.CHAIN_KIND, 'formal-attachment-package-upgrade-history-baseline-chain-index.v1');
assert.match(Chain.CHAIN_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.deepEqual(
  Chain.parseArgs(['--history', 'C:/history', '--chain-root', 'C:/chain', '--initial-baseline', 'C:/initial.json', '--json']),
  { json: true, history: 'C:/history', chainRoot: 'C:/chain', initialBaseline: 'C:/initial.json' },
);
assert.throws(() => Chain.parseArgs(['--chain-root']), /缺少路徑值/);
assert.match(Chain.usage(), /固定唯讀/);
assert.match(Chain.usage(), /斷鏈、分叉、替換或缺少核准紀錄/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-history-baseline-chain-'));
try {
  const main = createValidChain(path.join(tempRoot, 'main'));
  const rootBefore = directoryDigest(main.chainRoot);
  const historyBefore = JSON.stringify(require('./attachment-package-upgrade-history-index.js').historySnapshot(main.historyDir));
  const valid = Chain.inspectChain(main.historyDir, main.chainRoot, { now: TIMES.inspect });
  assert.equal(valid.kind, Chain.CHAIN_KIND);
  assert.equal(valid.status, 'valid');
  assert.match(valid.chainFingerprint, /^HCX-[0-9A-F]{24}$/);
  assert.deepEqual(valid.summary, {
    baselines: 3, bundles: 2, links: 2,
    terminalReceiptCount: 3, currentReceiptCount: 3,
    pendingAdditions: 0, errors: 0, warnings: 0,
  });
  assert.equal(valid.root.collectionFingerprint, valid.baselines[0].collectionFingerprint);
  assert.equal(valid.terminal.collectionFingerprint, valid.baselines[2].collectionFingerprint);
  assert.deepEqual(valid.baselines.map(item => item.role), ['root', 'intermediate', 'terminal']);
  assert.deepEqual(valid.links.map(item => item.advancementId), ['ADV-CHAIN-0002', 'ADV-CHAIN-0003']);
  assert.deepEqual(valid.links.map(item => item.acceptedAddedReceiptIds), [['CHAIN002'], ['CHAIN003']]);
  assert.equal(valid.currentComparison.status, 'match');
  assert.equal(directoryDigest(main.chainRoot), rootBefore);
  assert.equal(JSON.stringify(require('./attachment-package-upgrade-history-index.js').historySnapshot(main.historyDir)), historyBefore);
  assert.doesNotMatch(JSON.stringify(valid), /attachment-history-baseline-chain|QA-CHAIN|CHAIN-REV|Desktop|AppData/i);
  assert.equal(Chain.inspectChain(main.historyDir, main.chainRoot, { now: TIMES.inspect }).chainFingerprint, valid.chainFingerprint);
  assert.match(Chain.formatSummary(valid), /版本鏈完整/);

  const validCli = cli(['--history', main.historyDir, '--chain-root', main.chainRoot, '--json']);
  assert.equal(validCli.status, 0, validCli.stderr || validCli.stdout);
  assert.equal(JSON.parse(validCli.stdout).status, 'valid');

  const gapRoot = path.join(tempRoot, 'gap-root');
  copyDirectoryFiles(main.chainRoot, gapRoot, name => name !== 'initial-baseline.json');
  const gap = Chain.inspectChain(main.historyDir, gapRoot, { now: TIMES.inspect });
  assert.equal(gap.status, 'blocked');
  assert.equal(issueCodes(gap).includes('chain-predecessor-missing'), true);
  const externalInitial = Chain.inspectChain(main.historyDir, gapRoot, {
    now: TIMES.inspect,
    initialBaseline: main.initialPath,
  });
  assert.equal(externalInitial.status, 'valid');
  assert.equal(externalInitial.summary.baselines, 3);

  const missingApprovalRoot = path.join(tempRoot, 'missing-approval-root');
  copyDirectoryFiles(main.chainRoot, missingApprovalRoot);
  fs.rmSync(path.join(missingApprovalRoot, 'advance-03', Advance.APPROVAL_FILE_NAME));
  const missingApproval = Chain.inspectChain(main.historyDir, missingApprovalRoot, { now: TIMES.inspect });
  assert.equal(missingApproval.status, 'blocked');
  assert.equal(issueCodes(missingApproval).includes('invalid-advancement-bundle-contents'), true);

  const replacedRoot = path.join(tempRoot, 'replaced-root');
  copyDirectoryFiles(main.chainRoot, replacedRoot);
  fs.appendFileSync(path.join(replacedRoot, 'advance-03', Advance.BASELINE_FILE_NAME), ' \n', 'utf8');
  const replaced = Chain.inspectChain(main.historyDir, replacedRoot, { now: TIMES.inspect });
  assert.equal(replaced.status, 'blocked');
  assert.equal(issueCodes(replaced).includes('chain-predecessor-missing') || issueCodes(replaced).includes('chain-next-baseline-mismatch'), true);

  const duplicateApprovalRoot = path.join(tempRoot, 'duplicate-approval-root');
  copyDirectoryFiles(main.chainRoot, duplicateApprovalRoot);
  const duplicateApprovalPath = path.join(duplicateApprovalRoot, 'advance-03', Advance.APPROVAL_FILE_NAME);
  const duplicateApproval = Advance.readApprovalRecord(path.join(main.chainRoot, 'advance-03', Advance.APPROVAL_FILE_NAME));
  const duplicateText = fs.readFileSync(duplicateApprovalPath, 'utf8').replace(
    `"reviewedAt": "${duplicateApproval.reviewedAt}",`,
    `"reviewedAt": "${duplicateApproval.reviewedAt}",\n  "reviewedAt": "${duplicateApproval.reviewedAt}",`,
  );
  fs.writeFileSync(duplicateApprovalPath, duplicateText, 'utf8');
  const duplicateApprovalResult = Chain.inspectChain(main.historyDir, duplicateApprovalRoot, { now: TIMES.inspect });
  assert.equal(duplicateApprovalResult.status, 'blocked');
  assert.equal(issueCodes(duplicateApprovalResult).includes('invalid-advancement-approval'), true);

  const duplicateBaselineRoot = path.join(tempRoot, 'duplicate-baseline-root');
  copyDirectoryFiles(main.chainRoot, duplicateBaselineRoot);
  fs.copyFileSync(
    path.join(duplicateBaselineRoot, 'initial-baseline.json'),
    path.join(duplicateBaselineRoot, 'duplicate-initial.json'),
    fs.constants.COPYFILE_EXCL,
  );
  const duplicateBaseline = Chain.inspectChain(main.historyDir, duplicateBaselineRoot, { now: TIMES.inspect });
  assert.equal(duplicateBaseline.status, 'blocked');
  assert.equal(issueCodes(duplicateBaseline).includes('duplicate-chain-baseline'), true);

  const forkHistory = path.join(tempRoot, 'fork-history');
  fs.mkdirSync(forkHistory);
  const firstReceiptName = fs.readdirSync(main.historyDir).sort()[0];
  fs.copyFileSync(path.join(main.historyDir, firstReceiptName), path.join(forkHistory, firstReceiptName), fs.constants.COPYFILE_EXCL);
  addReceipt(forkHistory, '9', new Date('2026-07-22T01:09:00.000Z'));
  const forkTemp = path.join(tempRoot, 'fork-temp-bundle');
  const forkAdvance = Advance.advanceBaseline(forkHistory, {
    baseline: main.initialPath,
    now: new Date('2026-07-22T04:30:00.000Z'),
    acceptAdditions: true,
    reviewer: 'QA-FORK', basis: 'FORK-TEST', advancementId: 'ADV-CHAIN-FORK',
    output: forkTemp,
  });
  assert.equal(forkAdvance.advanced, true);
  const forkRoot = path.join(tempRoot, 'fork-root');
  copyDirectoryFiles(main.chainRoot, forkRoot);
  copyDirectoryFiles(forkTemp, path.join(forkRoot, 'advance-fork'));
  const fork = Chain.inspectChain(main.historyDir, forkRoot, { now: TIMES.inspect });
  assert.equal(fork.status, 'blocked');
  assert.equal(issueCodes(fork).includes('chain-fork'), true);

  const mismatchHistory = path.join(tempRoot, 'mismatch-history');
  copyDirectoryFiles(main.historyDir, mismatchHistory);
  fs.rmSync(path.join(mismatchHistory, fs.readdirSync(mismatchHistory).sort().slice(-1)[0]));
  const mismatch = Chain.inspectChain(mismatchHistory, main.chainRoot, { now: TIMES.inspect });
  assert.equal(mismatch.status, 'blocked');
  assert.equal(issueCodes(mismatch).includes('chain-terminal-history-mismatch'), true);

  const singleParent = path.join(tempRoot, 'single');
  const singleHistory = path.join(singleParent, 'history');
  const singleRoot = path.join(singleParent, 'chain');
  fs.mkdirSync(singleHistory, { recursive: true });
  addReceipt(singleHistory, '1', TIMES.receipt1);
  Baseline.publishBaseline(singleHistory, { now: TIMES.initial, output: path.join(singleRoot, 'initial.json') });
  const single = Chain.inspectChain(singleHistory, singleRoot, { now: TIMES.inspect });
  assert.equal(single.status, 'valid');
  assert.equal(single.summary.baselines, 1);
  assert.equal(single.summary.bundles, 0);

  const emptyParent = path.join(tempRoot, 'empty');
  const emptyHistory = path.join(emptyParent, 'history');
  const emptyRoot = path.join(emptyParent, 'chain');
  fs.mkdirSync(emptyHistory, { recursive: true });
  fs.mkdirSync(emptyRoot, { recursive: true });
  const empty = Chain.inspectChain(emptyHistory, emptyRoot, { now: TIMES.inspect });
  assert.equal(empty.status, 'blocked');
  assert.equal(issueCodes(empty).includes('chain-empty'), true);

  const unexpectedRoot = path.join(tempRoot, 'unexpected-root');
  copyDirectoryFiles(main.chainRoot, unexpectedRoot);
  fs.writeFileSync(path.join(unexpectedRoot, 'notes.txt'), 'not allowed', 'utf8');
  const unexpected = Chain.inspectChain(main.historyDir, unexpectedRoot, { now: TIMES.inspect });
  assert.equal(unexpected.status, 'blocked');
  assert.equal(issueCodes(unexpected).includes('unexpected-chain-file'), true);

  const raceRoot = path.join(tempRoot, 'race-root');
  copyDirectoryFiles(main.chainRoot, raceRoot);
  const race = Chain.inspectChain(main.historyDir, raceRoot, {
    now: TIMES.inspect,
    beforeFinalize() { fs.writeFileSync(path.join(raceRoot, 'late-change.txt'), 'changed', 'utf8'); },
  });
  assert.equal(race.status, 'blocked');
  assert.equal(issueCodes(race).includes('chain-changed-during-read'), true);

  addReceipt(main.historyDir, '4', TIMES.receipt4);
  const pendingRootBefore = directoryDigest(main.chainRoot);
  const pending = Chain.inspectChain(main.historyDir, main.chainRoot, { now: TIMES.inspect });
  assert.equal(pending.status, 'review');
  assert.equal(pending.summary.terminalReceiptCount, 3);
  assert.equal(pending.summary.currentReceiptCount, 4);
  assert.equal(pending.summary.pendingAdditions, 1);
  assert.deepEqual(pending.currentComparison.added, ['CHAIN004']);
  assert.equal(issueCodes(pending).includes('chain-advancement-pending'), true);
  assert.equal(directoryDigest(main.chainRoot), pendingRootBefore);
  assert.match(Chain.formatSummary(pending), /尚有新增待前進/);
  const pendingCli = cli(['--history', main.historyDir, '--chain-root', main.chainRoot, '--json']);
  assert.equal(pendingCli.status, 1, pendingCli.stderr || pendingCli.stdout);

  const help = cli(['--help']);
  assert.equal(help.status, 0);
  const missingArgs = cli([]);
  assert.equal(missingArgs.status, 3);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment package upgrade trusted baseline chain read-only verifier OK');
