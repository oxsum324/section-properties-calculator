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
const Root = require('./attachment-case-governance-root.js');

const FINGERPRINT = 'CF-CA5E0011BEEF2026';
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
    project: { no: 'CASE-ROOT-001' },
    calculationFingerprint: FINGERPRINT,
    savedAt: '2026/07/22 09:00:00',
  }), 'utf8');
  fs.writeFileSync(reportPath, [
    '<h1>RC 梁設計計算書</h1>',
    '<div>文件狀態：正式附件</div>',
    '<div>計畫編號：CASE-ROOT-001</div>',
    '<div>產出工具：RC 梁</div>',
    '<div>工具版本：v3.1</div>',
    '<div>輸出時間：2026/07/22 09:00:00</div>',
    '<div>核可時間：2026/07/22 09:05:00</div>',
    `<div>計算指紋：${FINGERPRINT}</div>`,
  ].join('\n'), 'utf8');
}

function addReceipt(historyDir, suffix, now) {
  const receiptId = `ROOTG${suffix.padStart(3, '0')}`;
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
  return History.writeReceipt(receipt, historyDir, { probeToken: `CASE-ROOT-${suffix}` });
}

function createCaseRoot(parent, name = '案件治理根目錄') {
  const caseRoot = path.join(parent, name);
  const inputDir = path.join(caseRoot, '新組包來源');
  const packageDir = path.join(caseRoot, 'CASE-ROOT-001-正式附件包-20260722');
  const historyDir = path.join(caseRoot, History.HISTORY_DIR_NAME);
  const chainRoot = path.join(caseRoot, Baseline.BASELINE_DIR_NAME);
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(historyDir, { recursive: true });
  writeReadySource(inputDir);
  const built = Builder.buildPackage(inputDir, {
    output: packageDir,
    projectNo: 'CASE-ROOT-001',
    now: TIMES.inspect,
  });
  assert.equal(built.status, 'ready');
  addReceipt(historyDir, '1', TIMES.receipt1);
  const initialPath = path.join(chainRoot, 'initial-baseline.json');
  const initial = Baseline.publishBaseline(historyDir, { now: TIMES.initial, output: initialPath });
  assert.equal(initial.published, true);
  addReceipt(historyDir, '2', TIMES.receipt2);
  const advanced = Advance.advanceBaseline(historyDir, {
    baseline: initialPath,
    now: TIMES.advance,
    acceptAdditions: true,
    reviewer: 'QA-CASE-ROOT',
    basis: 'CASE-ROOT-REV-02',
    advancementId: 'ADV-CASE-ROOT-0002',
    output: path.join(chainRoot, 'advance-02'),
  });
  assert.equal(advanced.advanced, true);
  return { caseRoot, inputDir, packageDir, historyDir, chainRoot };
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source).sort().forEach(name => {
    const sourcePath = path.join(source, name);
    const targetPath = path.join(target, name);
    const stat = fs.lstatSync(sourcePath);
    if (stat.isDirectory()) copyDirectory(sourcePath, targetPath);
    else if (stat.isFile()) fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
    else throw new Error(`unsupported test entry: ${sourcePath}`);
  });
}

function rootDigest(rootDir) {
  return JSON.stringify(Chain.directorySnapshot(rootDir, '案件根目錄'));
}

function issueCodes(result) {
  return result.issues.map(item => item.code);
}

function cli(args) {
  return spawnSync(process.execPath, [path.join(__dirname, 'attachment-case-governance-root.js'), ...args], { encoding: 'utf8' });
}

assert.equal(Root.ROOT_KIND, 'formal-attachment-case-governance-root-entry.v1');
assert.match(Root.ROOT_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.deepEqual(Root.parseArgs(['--root', 'C:/case', '--json']), { json: true, root: 'C:/case' });
assert.throws(() => Root.parseArgs(['--root']), /缺少路徑值/);
assert.match(Root.usage(), /只掃描直接子資料夾/);
assert.match(Root.usage(), /不代表正式附件核可/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-case-root-'));
try {
  const main = createCaseRoot(tempRoot);
  assert.equal(Root.readJsonKind(path.join(main.historyDir, fs.readdirSync(main.historyDir)[0])), History.HISTORY_KIND);
  assert.equal(Root.isFormalPackageDirectory(main.packageDir), true);
  assert.equal(Root.isHistoryDirectory(main.historyDir, path.basename(main.historyDir)), true);
  assert.equal(Root.isChainDirectory(main.chainRoot, path.basename(main.chainRoot)), true);

  const scan = Root.scanCaseRoot(main.caseRoot);
  assert.deepEqual(Root.candidateNames(scan.candidates), {
    packages: [path.basename(main.packageDir)],
    histories: [History.HISTORY_DIR_NAME],
    chains: [Baseline.BASELINE_DIR_NAME],
  });
  assert.deepEqual(scan.issues, []);

  const before = rootDigest(main.caseRoot);
  const ready = Root.inspectCaseRoot(main.caseRoot, { now: TIMES.inspect });
  assert.equal(ready.kind, Root.ROOT_KIND);
  assert.equal(ready.status, 'ready');
  assert.match(ready.caseFingerprint, /^CAS-[0-9A-F]{24}$/);
  assert.equal(ready.discovery.status, 'resolved');
  assert.equal(ready.discovery.selectedPackage, path.basename(main.packageDir));
  assert.equal(ready.discovery.selectedHistory, History.HISTORY_DIR_NAME);
  assert.equal(ready.discovery.selectedChain, Baseline.BASELINE_DIR_NAME);
  assert.equal(ready.governance.status, 'ready');
  assert.equal(ready.governance.history.currentReceiptCount, 2);
  assert.deepEqual(ready.nextActions.map(item => item.code), ['internal-archive-review']);
  assert.equal(rootDigest(main.caseRoot), before);
  assert.equal(JSON.stringify(ready).includes(tempRoot), false);
  assert.doesNotMatch(JSON.stringify(ready), /QA-CASE-ROOT|CASE-ROOT-REV|AppData|Desktop/i);
  assert.equal(
    Root.inspectCaseRoot(main.caseRoot, { now: new Date('2026-07-22T07:00:00.000Z') }).caseFingerprint,
    ready.caseFingerprint,
  );
  assert.match(Root.formatSummary(ready), /可進入內部歸檔複核/);

  const readyCli = cli(['--root', main.caseRoot, '--json']);
  assert.equal(readyCli.status, 0, readyCli.stderr || readyCli.stdout);
  assert.equal(JSON.parse(readyCli.stdout).status, 'ready');

  const fallbackRoot = path.join(tempRoot, '非標準名稱根目錄');
  fs.mkdirSync(fallbackRoot, { recursive: true });
  copyDirectory(main.packageDir, path.join(fallbackRoot, 'package-a'));
  copyDirectory(main.historyDir, path.join(fallbackRoot, 'history-a'));
  copyDirectory(main.chainRoot, path.join(fallbackRoot, 'chain-a'));
  const fallback = Root.inspectCaseRoot(fallbackRoot, { now: TIMES.inspect });
  assert.equal(fallback.status, 'ready');
  assert.equal(fallback.discovery.selectedPackage, 'package-a');
  assert.equal(fallback.discovery.selectedHistory, 'history-a');
  assert.equal(fallback.discovery.selectedChain, 'chain-a');

  const ambiguous = createCaseRoot(tempRoot, '多組附件包案件');
  copyDirectory(ambiguous.packageDir, path.join(ambiguous.caseRoot, '第二組正式附件包'));
  const ambiguousResult = Root.inspectCaseRoot(ambiguous.caseRoot, { now: TIMES.inspect });
  assert.equal(ambiguousResult.status, 'blocked');
  assert.equal(ambiguousResult.governance, null);
  assert.equal(issueCodes(ambiguousResult).includes('ambiguous-formal-package'), true);
  assert.equal(ambiguousResult.discovery.packageCandidates.length, 2);
  const ambiguousCli = cli(['--root', ambiguous.caseRoot, '--json']);
  assert.equal(ambiguousCli.status, 2, ambiguousCli.stderr || ambiguousCli.stdout);

  const emptyRoot = path.join(tempRoot, '空案件');
  fs.mkdirSync(emptyRoot);
  const missing = Root.inspectCaseRoot(emptyRoot, { now: TIMES.inspect });
  assert.equal(missing.status, 'blocked');
  assert.equal(missing.governance, null);
  assert.equal(issueCodes(missing).includes('missing-formal-package'), true);
  assert.equal(issueCodes(missing).includes('missing-upgrade-history'), true);
  assert.equal(issueCodes(missing).includes('missing-trusted-baseline-chain'), true);

  const broken = createCaseRoot(tempRoot, '版本鏈缺件案件');
  fs.rmSync(path.join(broken.chainRoot, 'advance-02', Advance.APPROVAL_FILE_NAME));
  const brokenResult = Root.inspectCaseRoot(broken.caseRoot, { now: TIMES.inspect });
  assert.equal(brokenResult.status, 'blocked');
  assert.equal(brokenResult.governance.chain.status, 'blocked');

  const race = createCaseRoot(tempRoot, '競態案件');
  const raced = Root.inspectCaseRoot(race.caseRoot, {
    now: TIMES.inspect,
    beforeFinalize() { copyDirectory(race.packageDir, path.join(race.caseRoot, '執行中新增附件包')); },
  });
  assert.equal(raced.status, 'blocked');
  assert.equal(issueCodes(raced).includes('case-root-changed-during-read'), true);
  assert.deepEqual(raced.nextActions.map(item => item.code), ['rerun-after-case-root-stable']);
  assert.match(Root.formatSummary(raced), /固定案件根目錄內容後重新執行/);

  addReceipt(main.historyDir, '3', TIMES.receipt3);
  const pendingBefore = rootDigest(main.caseRoot);
  const pending = Root.inspectCaseRoot(main.caseRoot, { now: TIMES.inspect });
  assert.equal(pending.status, 'review');
  assert.equal(pending.governance.status, 'review');
  assert.equal(pending.governance.history.pendingAdditions, 1);
  assert.equal(pending.nextActions.some(item => item.code === 'advance-trusted-baseline'), true);
  assert.equal(rootDigest(main.caseRoot), pendingBefore);
  const pendingCli = cli(['--root', main.caseRoot, '--json']);
  assert.equal(pendingCli.status, 1, pendingCli.stderr || pendingCli.stdout);

  const help = cli(['--help']);
  assert.equal(help.status, 0);
  const missingArg = cli([]);
  assert.equal(missingArg.status, 3);
  const unknown = cli(['--unknown']);
  assert.equal(unknown.status, 3);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment case root auto-discovery governance entry OK');
