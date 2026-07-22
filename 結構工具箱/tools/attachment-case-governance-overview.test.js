'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Builder = require('./attachment-package-build.js');
const History = require('./attachment-package-upgrade-history.js');
const Baseline = require('./attachment-package-upgrade-history-baseline.js');
const Advance = require('./attachment-package-upgrade-history-baseline-advance.js');
const Chain = require('./attachment-package-upgrade-history-baseline-chain.js');
const Index = require('./attachment-package-upgrade-history-index.js');
const Overview = require('./attachment-case-governance-overview.js');

const FINGERPRINT = 'CF-CA5E0A11BEEF2026';
const TIMES = {
  receipt1: new Date('2026-07-22T01:00:00.000Z'),
  receipt2: new Date('2026-07-22T01:01:00.000Z'),
  receipt3: new Date('2026-07-22T01:02:00.000Z'),
  initial: new Date('2026-07-22T03:00:00.000Z'),
  advance: new Date('2026-07-22T04:00:00.000Z'),
  inspect: new Date('2026-07-22T06:00:00.000Z'),
};

function writeReadySource(inputDir) {
  const sourcePath = path.join(inputDir, 'source', 'beam.json');
  const reportPath = path.join(inputDir, 'reports', 'beam.html');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({
    schema: 'tool-project-storage.v1',
    tool: { id: 'rc-beam', name: 'RC 梁', version: 'V3.1' },
    project: { no: 'CASE-GOV-001' },
    calculationFingerprint: FINGERPRINT,
    savedAt: '2026/07/22 09:00:00',
  }), 'utf8');
  fs.writeFileSync(reportPath, [
    '<h1>RC 梁設計計算書</h1>',
    '<div>文件狀態：正式附件</div>',
    '<div>計畫編號：CASE-GOV-001</div>',
    '<div>產出工具：RC 梁</div>',
    '<div>工具版本：v3.1</div>',
    '<div>輸出時間：2026/07/22 09:00:00</div>',
    '<div>核可時間：2026/07/22 09:05:00</div>',
    `<div>計算指紋：${FINGERPRINT}</div>`,
  ].join('\n'), 'utf8');
}

function createPackage(parent, name) {
  const inputDir = path.join(parent, `${name}-input`);
  const outputDir = path.join(parent, `${name}-package`);
  fs.mkdirSync(inputDir, { recursive: true });
  writeReadySource(inputDir);
  const result = Builder.buildPackage(inputDir, {
    output: outputDir,
    projectNo: 'CASE-GOV-001',
    now: TIMES.inspect,
  });
  assert.equal(result.status, 'ready');
  return outputDir;
}

function addReceipt(historyDir, suffix, now) {
  const receiptId = `CASEGOV${suffix.padStart(3, '0')}`;
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
  return History.writeReceipt(receipt, historyDir, { probeToken: `CASE-GOV-${suffix}` });
}

function createChain(parent) {
  const historyDir = path.join(parent, 'history');
  const chainRoot = path.join(parent, 'trusted-chain');
  fs.mkdirSync(historyDir, { recursive: true });
  addReceipt(historyDir, '1', TIMES.receipt1);
  const initialPath = path.join(chainRoot, 'initial-baseline.json');
  const initial = Baseline.publishBaseline(historyDir, { now: TIMES.initial, output: initialPath });
  assert.equal(initial.published, true);
  addReceipt(historyDir, '2', TIMES.receipt2);
  const advanced = Advance.advanceBaseline(historyDir, {
    baseline: initialPath,
    now: TIMES.advance,
    acceptAdditions: true,
    reviewer: 'QA-CASE-GOV',
    basis: 'CASE-GOV-REV-02',
    advancementId: 'ADV-CASE-GOV-0002',
    output: path.join(chainRoot, 'advance-02'),
  });
  assert.equal(advanced.advanced, true);
  return { historyDir, chainRoot, initialPath };
}

function copyDirectory(source, target, filter = () => true) {
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source).sort().forEach(name => {
    if (!filter(name)) return;
    const sourcePath = path.join(source, name);
    const targetPath = path.join(target, name);
    const stat = fs.lstatSync(sourcePath);
    if (stat.isDirectory()) copyDirectory(sourcePath, targetPath);
    else if (stat.isFile()) fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
    else throw new Error(`unsupported test entry: ${sourcePath}`);
  });
}

function snapshots(packageDir, historyDir, chainRoot) {
  return JSON.stringify({
    package: Chain.directorySnapshot(packageDir, '正式附件包'),
    history: Index.historySnapshot(historyDir),
    chain: Chain.directorySnapshot(chainRoot),
  });
}

function issueCodes(result) {
  return result.issues.map(item => item.code);
}

function cli(args) {
  return spawnSync(process.execPath, [path.join(__dirname, 'attachment-case-governance-overview.js'), ...args], { encoding: 'utf8' });
}

assert.equal(Overview.OVERVIEW_KIND, 'formal-attachment-case-governance-overview.v1');
assert.match(Overview.OVERVIEW_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.equal(Overview.pathsOverlap('C:/a', 'C:/a/b'), true);
assert.equal(Overview.pathsOverlap('C:/a', 'C:/b'), false);
assert.equal(Overview.sanitizeMessage('bad C:\\secret\\package', [['C:\\secret\\package', '[包]']]), 'bad [包]');
assert.deepEqual(
  Overview.parseArgs(['--package', 'C:/p', '--history', 'C:/h', '--chain-root', 'C:/c', '--initial-baseline', 'C:/i.json', '--json']),
  { json: true, package: 'C:/p', history: 'C:/h', chainRoot: 'C:/c', initialBaseline: 'C:/i.json' },
);
assert.throws(() => Overview.parseArgs(['--package']), /缺少路徑值/);
assert.match(Overview.usage(), /固定唯讀/);
assert.match(Overview.usage(), /不代表正式附件核可/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-case-governance-'));
try {
  const packageDir = createPackage(tempRoot, 'ready');
  const chain = createChain(path.join(tempRoot, 'chain-main'));
  const before = snapshots(packageDir, chain.historyDir, chain.chainRoot);
  const ready = Overview.inspectGovernance(packageDir, chain.historyDir, chain.chainRoot, { now: TIMES.inspect });
  assert.equal(ready.kind, Overview.OVERVIEW_KIND);
  assert.equal(ready.status, 'ready');
  assert.match(ready.governanceFingerprint, /^GOV-[0-9A-F]{24}$/);
  assert.equal(ready.boundary.classification, 'internal-governance-only');
  assert.equal(ready.boundary.attachToFormalReport, false);
  assert.equal(ready.boundary.formalAttachmentApproval, false);
  assert.equal(ready.package.status, 'ready');
  assert.equal(ready.package.manifestSchemaVersion, 3);
  assert.equal(ready.package.verifiedFiles, 2);
  assert.equal(ready.history.status, 'match');
  assert.equal(ready.history.currentReceiptCount, 2);
  assert.equal(ready.history.terminalReceiptCount, 2);
  assert.equal(ready.chain.status, 'valid');
  assert.equal(ready.chain.baselines, 2);
  assert.equal(ready.chain.links, 1);
  assert.deepEqual(ready.nextActions.map(item => item.code), ['internal-archive-review']);
  assert.equal(snapshots(packageDir, chain.historyDir, chain.chainRoot), before);
  assert.equal(JSON.stringify(ready).includes(tempRoot), false);
  assert.doesNotMatch(JSON.stringify(ready), /QA-CASE-GOV|CASE-GOV-REV|AppData|Desktop/i);
  assert.equal(
    Overview.inspectGovernance(packageDir, chain.historyDir, chain.chainRoot, { now: new Date('2026-07-22T07:00:00.000Z') }).governanceFingerprint,
    ready.governanceFingerprint,
  );
  assert.match(Overview.formatSummary(ready), /可進入內部歸檔複核/);
  assert.match(Overview.formatSummary(ready), /不代表正式附件核可/);

  const readyCli = cli(['--package', packageDir, '--history', chain.historyDir, '--chain-root', chain.chainRoot, '--json']);
  assert.equal(readyCli.status, 0, readyCli.stderr || readyCli.stdout);
  assert.equal(JSON.parse(readyCli.stdout).status, 'ready');

  const gapRoot = path.join(tempRoot, 'gap-root');
  copyDirectory(chain.chainRoot, gapRoot, name => name !== 'initial-baseline.json');
  const externalInitial = Overview.inspectGovernance(packageDir, chain.historyDir, gapRoot, {
    now: TIMES.inspect,
    initialBaseline: chain.initialPath,
  });
  assert.equal(externalInitial.status, 'ready');
  assert.equal(externalInitial.chain.baselines, 2);

  const tamperedPackage = createPackage(tempRoot, 'tampered');
  const reportPath = path.join(tamperedPackage, Builder.FORMAL_ATTACHMENTS_DIR, 'reports', 'beam.html');
  fs.appendFileSync(reportPath, '\n<!-- changed -->', 'utf8');
  const packageBlocked = Overview.inspectGovernance(tamperedPackage, chain.historyDir, chain.chainRoot, { now: TIMES.inspect });
  assert.equal(packageBlocked.status, 'blocked');
  assert.equal(packageBlocked.package.status, 'blocked');
  assert.equal(packageBlocked.nextActions.some(item => item.code === 'repair-formal-package'), true);
  const blockedCli = cli(['--package', tamperedPackage, '--history', chain.historyDir, '--chain-root', chain.chainRoot, '--json']);
  assert.equal(blockedCli.status, 2, blockedCli.stderr || blockedCli.stdout);
  assert.equal(JSON.parse(blockedCli.stdout).status, 'blocked');

  const brokenRoot = path.join(tempRoot, 'broken-chain');
  copyDirectory(chain.chainRoot, brokenRoot);
  fs.rmSync(path.join(brokenRoot, 'advance-02', Advance.APPROVAL_FILE_NAME));
  const chainBlocked = Overview.inspectGovernance(packageDir, chain.historyDir, brokenRoot, { now: TIMES.inspect });
  assert.equal(chainBlocked.status, 'blocked');
  assert.equal(chainBlocked.chain.status, 'blocked');
  assert.equal(chainBlocked.nextActions.some(item => item.code === 'repair-trusted-baseline-chain'), true);

  const racePackage = createPackage(tempRoot, 'race');
  const raced = Overview.inspectGovernance(racePackage, chain.historyDir, chain.chainRoot, {
    now: TIMES.inspect,
    beforeFinalize() { fs.writeFileSync(path.join(racePackage, 'late-change.txt'), 'changed', 'utf8'); },
  });
  assert.equal(raced.status, 'blocked');
  assert.equal(issueCodes(raced).includes('overview-source-changed'), true);
  assert.equal(raced.nextActions.some(item => item.code === 'rerun-after-source-stable'), true);

  assert.throws(
    () => Overview.inspectGovernance(packageDir, chain.historyDir, packageDir, { now: TIMES.inspect }),
    /完全分離/,
  );
  assert.throws(
    () => Overview.inspectGovernance(packageDir, chain.historyDir, chain.chainRoot, { now: TIMES.inspect, initialBaseline: chain.initialPath }),
    /不得位於可信基準版本鏈內/,
  );

  addReceipt(chain.historyDir, '3', TIMES.receipt3);
  const pendingBefore = snapshots(packageDir, chain.historyDir, chain.chainRoot);
  const pending = Overview.inspectGovernance(packageDir, chain.historyDir, chain.chainRoot, { now: TIMES.inspect });
  assert.equal(pending.status, 'review');
  assert.equal(pending.package.status, 'ready');
  assert.equal(pending.chain.status, 'review');
  assert.equal(pending.history.currentReceiptCount, 3);
  assert.equal(pending.history.terminalReceiptCount, 2);
  assert.equal(pending.history.pendingAdditions, 1);
  assert.equal(pending.nextActions.some(item => item.code === 'advance-trusted-baseline'), true);
  assert.equal(snapshots(packageDir, chain.historyDir, chain.chainRoot), pendingBefore);
  const pendingCli = cli(['--package', packageDir, '--history', chain.historyDir, '--chain-root', chain.chainRoot, '--json']);
  assert.equal(pendingCli.status, 1, pendingCli.stderr || pendingCli.stdout);
  assert.equal(JSON.parse(pendingCli.stdout).status, 'review');

  const help = cli(['--help']);
  assert.equal(help.status, 0);
  const missing = cli(['--package', packageDir]);
  assert.equal(missing.status, 3);
  const unknown = cli(['--unknown']);
  assert.equal(unknown.status, 3);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment case governance read-only overview OK');
