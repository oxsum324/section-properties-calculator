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
const Portfolio = require('./attachment-case-governance-portfolio.js');

const FINGERPRINT = 'CF-BA7C0001BEEF2026';
const TIMES = {
  receipt1: new Date('2026-07-22T01:00:00.000Z'),
  receipt2: new Date('2026-07-22T01:01:00.000Z'),
  receipt3: new Date('2026-07-22T01:02:00.000Z'),
  initial: new Date('2026-07-22T03:00:00.000Z'),
  advance: new Date('2026-07-22T04:00:00.000Z'),
  inspect: new Date('2026-07-22T06:00:00.000Z'),
};

function writeReadySource(inputDir, projectNo) {
  const sourcePath = path.join(inputDir, 'source', 'beam.json');
  const reportPath = path.join(inputDir, 'reports', 'beam.html');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({
    schema: 'tool-project-storage.v1',
    tool: { id: 'rc-beam', name: 'RC 梁', version: 'V3.1' },
    project: { no: projectNo },
    calculationFingerprint: FINGERPRINT,
    savedAt: '2026/07/22 09:00:00',
  }), 'utf8');
  fs.writeFileSync(reportPath, [
    '<h1>RC 梁設計計算書</h1>',
    '<div>文件狀態：正式附件</div>',
    `<div>計畫編號：${projectNo}</div>`,
    '<div>產出工具：RC 梁</div>',
    '<div>工具版本：v3.1</div>',
    '<div>輸出時間：2026/07/22 09:00:00</div>',
    '<div>核可時間：2026/07/22 09:05:00</div>',
    `<div>計算指紋：${FINGERPRINT}</div>`,
  ].join('\n'), 'utf8');
}

function addReceipt(historyDir, suffix, now) {
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
  }, { now, receiptId: `PORTF${suffix.padStart(3, '0')}` });
  return History.writeReceipt(receipt, historyDir, { probeToken: `PORTFOLIO-${suffix}` });
}

function createCaseRoot(parent, name, number) {
  const projectNo = `PORTFOLIO-${number}`;
  const caseRoot = path.join(parent, name);
  const inputDir = path.join(caseRoot, '新組包來源');
  const packageDir = path.join(caseRoot, `${projectNo}-正式附件包-20260722`);
  const historyDir = path.join(caseRoot, History.HISTORY_DIR_NAME);
  const chainRoot = path.join(caseRoot, Baseline.BASELINE_DIR_NAME);
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(historyDir, { recursive: true });
  writeReadySource(inputDir, projectNo);
  assert.equal(Builder.buildPackage(inputDir, {
    output: packageDir,
    projectNo,
    now: TIMES.inspect,
  }).status, 'ready');
  addReceipt(historyDir, '1', TIMES.receipt1);
  const initialPath = path.join(chainRoot, 'initial-baseline.json');
  assert.equal(Baseline.publishBaseline(historyDir, { now: TIMES.initial, output: initialPath }).published, true);
  addReceipt(historyDir, '2', TIMES.receipt2);
  assert.equal(Advance.advanceBaseline(historyDir, {
    baseline: initialPath,
    now: TIMES.advance,
    acceptAdditions: true,
    reviewer: 'QA-PORTFOLIO',
    basis: 'PORTFOLIO-REV-02',
    advancementId: `ADV-PORTFOLIO-${String(number).padStart(4, '0')}`,
    output: path.join(chainRoot, 'advance-02'),
  }).advanced, true);
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

function digest(directory) {
  return JSON.stringify(Chain.directorySnapshot(directory, '案件上層資料夾'));
}

function cli(args) {
  return spawnSync(process.execPath, [path.join(__dirname, 'attachment-case-governance-portfolio.js'), ...args], { encoding: 'utf8' });
}

function issueCodes(result) {
  return result.issues.map(item => item.code);
}

assert.equal(Portfolio.PORTFOLIO_KIND, 'formal-attachment-case-governance-portfolio.v1');
assert.match(Portfolio.PORTFOLIO_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.deepEqual(Portfolio.TRIAGE_RULES.map(item => item.code), [
  'source-stability-blocked',
  'formal-package-blocked',
  'trusted-chain-blocked',
  'case-layout-blocked',
  'other-blocked',
  'baseline-advance-review',
  'package-compatibility-review',
  'other-review',
]);
assert.deepEqual(Portfolio.parseArgs(['--parent', 'C:/cases', '--json']), { json: true, parent: 'C:/cases' });
assert.throws(() => Portfolio.parseArgs(['--parent']), /缺少路徑值/);
assert.throws(() => Portfolio.parseArgs(['--unknown']), /未知參數/);
assert.match(Portfolio.usage(), /只掃描直接子資料夾/);
assert.match(Portfolio.usage(), /不代表任何案件的正式附件核可/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-case-portfolio-'));
try {
  const parent = path.join(tempRoot, '案件上層');
  fs.mkdirSync(parent);
  const caseA = createCaseRoot(parent, '案件甲', 1);
  const caseB = createCaseRoot(parent, '案件乙', 2);
  fs.mkdirSync(path.join(parent, '說明資料'));

  const scan = Portfolio.scanPortfolio(parent);
  assert.deepEqual(scan.cases.map(item => item.name), ['案件乙', '案件甲'].sort());
  assert.deepEqual(scan.ignoredDirectories, ['說明資料']);
  assert.deepEqual(scan.issues, []);
  assert.equal(Portfolio.governanceCandidateSnapshots(scan).length, 6);

  const before = digest(parent);
  const ready = Portfolio.inspectPortfolio(parent, { now: TIMES.inspect });
  assert.equal(ready.kind, Portfolio.PORTFOLIO_KIND);
  assert.equal(ready.status, 'ready');
  assert.match(ready.portfolioFingerprint, /^POR-[0-9A-F]{24}$/);
  assert.equal(ready.discovery.parentName, '案件上層');
  assert.equal(ready.discovery.caseCount, 2);
  assert.equal(ready.discovery.ignoredDirectoryCount, 1);
  assert.deepEqual(ready.discovery.ignoredDirectories, ['說明資料']);
  assert.deepEqual(ready.summary, { readyCases: 2, reviewCases: 0, blockedCases: 0, errors: 0, warnings: 0 });
  assert.deepEqual(ready.triage, {
    highestPriority: 'none',
    actionableCaseCount: 0,
    portfolioIssueCount: 0,
    groupCount: 0,
    casePriorityCounts: { P0: 0, P1: 0, P2: 0 },
    groups: [],
  });
  assert.deepEqual(ready.cases.map(item => item.caseName), ['案件乙', '案件甲'].sort());
  assert.equal(ready.cases.every(item => item.status === 'ready'), true);
  assert.deepEqual(ready.nextActions.map(item => item.code), ['internal-archive-review']);
  assert.equal(digest(parent), before);
  assert.equal(JSON.stringify(ready).includes(tempRoot), false);
  assert.doesNotMatch(JSON.stringify(ready), /QA-PORTFOLIO|PORTFOLIO-REV|AppData|Desktop/i);
  assert.equal(
    Portfolio.inspectPortfolio(parent, { now: new Date('2026-07-22T07:00:00.000Z') }).portfolioFingerprint,
    ready.portfolioFingerprint,
  );
  assert.match(Portfolio.formatSummary(ready), /全部可進入內部歸檔複核/);
  assert.match(Portfolio.formatSummary(ready), /忽略非案件資料夾：1/);
  assert.match(Portfolio.formatSummary(ready), /處置優先：無；待處理案件 0；問題群組 0/);

  const readyCli = cli(['--parent', parent, '--json']);
  assert.equal(readyCli.status, 0, readyCli.stderr || readyCli.stdout);
  assert.equal(JSON.parse(readyCli.stdout).status, 'ready');

  addReceipt(caseB.historyDir, '3', TIMES.receipt3);
  const reviewBefore = digest(parent);
  const review = Portfolio.inspectPortfolio(parent, { now: TIMES.inspect });
  assert.equal(review.status, 'review');
  assert.deepEqual(review.summary, { readyCases: 1, reviewCases: 1, blockedCases: 0, errors: 0, warnings: 0 });
  assert.equal(review.cases.find(item => item.caseName === '案件乙').pendingAdditions, 1);
  assert.deepEqual(review.nextActions.map(item => item.code), ['review-pending-cases']);
  assert.equal(review.triage.highestPriority, 'P1');
  assert.equal(review.triage.actionableCaseCount, 1);
  assert.deepEqual(review.triage.casePriorityCounts, { P0: 0, P1: 1, P2: 0 });
  assert.deepEqual(review.triage.groups.map(item => item.code), ['baseline-advance-review']);
  assert.deepEqual(review.triage.groups[0].cases, ['案件乙']);
  assert.equal(digest(parent), reviewBefore);
  assert.equal(cli(['--parent', parent, '--json']).status, 1);

  const caseCPath = path.join(parent, '案件丙');
  copyDirectory(caseA.caseRoot, caseCPath);
  fs.rmSync(path.join(caseCPath, Baseline.BASELINE_DIR_NAME, 'advance-02', Advance.APPROVAL_FILE_NAME));
  const blocked = Portfolio.inspectPortfolio(parent, { now: TIMES.inspect });
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.summary, { readyCases: 1, reviewCases: 1, blockedCases: 1, errors: 0, warnings: 0 });
  assert.deepEqual(blocked.nextActions.map(item => item.code), ['repair-blocked-cases', 'review-pending-cases']);
  assert.equal(blocked.triage.highestPriority, 'P0');
  assert.equal(blocked.triage.actionableCaseCount, 2);
  assert.deepEqual(blocked.triage.casePriorityCounts, { P0: 1, P1: 1, P2: 0 });
  assert.deepEqual(blocked.triage.groups.map(item => item.code), ['trusted-chain-blocked', 'baseline-advance-review']);
  assert.deepEqual(blocked.triage.groups[0].cases, ['案件丙']);
  assert.match(Portfolio.formatSummary(blocked), /\[P0\] 可信基準版本鏈需修復；1 案（案件丙）/);
  assert.equal(cli(['--parent', parent, '--json']).status, 2);

  const caseDPath = path.join(parent, '案件丁');
  fs.mkdirSync(caseDPath);
  copyDirectory(caseA.packageDir, path.join(caseDPath, path.basename(caseA.packageDir)));
  const incomplete = Portfolio.inspectPortfolio(parent, { now: TIMES.inspect });
  assert.equal(incomplete.status, 'blocked');
  assert.equal(incomplete.discovery.caseCount, 4);
  assert.equal(incomplete.summary.blockedCases, 2);
  assert.equal(incomplete.cases.find(item => item.caseName === '案件丁').issueCodes.includes('missing-upgrade-history'), true);
  assert.deepEqual(incomplete.triage.casePriorityCounts, { P0: 2, P1: 1, P2: 0 });
  assert.deepEqual(incomplete.triage.groups.map(item => item.code), ['trusted-chain-blocked', 'case-layout-blocked', 'baseline-advance-review']);

  const emptyParent = path.join(tempRoot, '空上層');
  fs.mkdirSync(path.join(emptyParent, '一般文件'), { recursive: true });
  const empty = Portfolio.inspectPortfolio(emptyParent, { now: TIMES.inspect });
  assert.equal(empty.status, 'blocked');
  assert.equal(empty.discovery.caseCount, 0);
  assert.equal(empty.discovery.ignoredDirectoryCount, 1);
  assert.equal(issueCodes(empty).includes('portfolio-empty'), true);
  assert.deepEqual(empty.nextActions.map(item => item.code), ['fix-portfolio-layout']);
  assert.equal(empty.triage.highestPriority, 'P0');
  assert.equal(empty.triage.actionableCaseCount, 0);
  assert.equal(empty.triage.portfolioIssueCount, 1);
  assert.deepEqual(empty.triage.groups.map(item => item.code), ['case-layout-blocked']);
  assert.deepEqual(empty.triage.groups[0].portfolioIssueCodes, ['portfolio-empty']);

  const raceParent = path.join(tempRoot, '競態上層');
  fs.mkdirSync(raceParent);
  const raceCase = createCaseRoot(raceParent, '競態案件', 3);
  const raced = Portfolio.inspectPortfolio(raceParent, {
    now: TIMES.inspect,
    beforeFinalize() {
      copyDirectory(raceCase.packageDir, path.join(raceCase.caseRoot, '執行中新增附件包'));
    },
  });
  assert.equal(raced.status, 'blocked');
  assert.equal(issueCodes(raced).includes('portfolio-changed-during-read'), true);
  assert.deepEqual(raced.nextActions.map(item => item.code), ['rerun-after-portfolio-stable']);
  assert.equal(raced.triage.highestPriority, 'P0');
  assert.deepEqual(raced.triage.groups.map(item => item.code), ['source-stability-blocked']);
  assert.deepEqual(raced.triage.groups[0].portfolioIssueCodes, ['portfolio-changed-during-read']);
  assert.match(Portfolio.formatSummary(raced), /固定案件上層資料夾與治理資料後重新執行/);

  const overlapping = Portfolio.buildTriage([
    {
      caseName: '雙重阻擋案',
      status: 'blocked',
      nextActionCodes: ['repair-formal-package', 'repair-trusted-baseline-chain'],
    },
    {
      caseName: '相容性複核案',
      status: 'review',
      nextActionCodes: ['review-or-upgrade-formal-package'],
    },
  ]);
  assert.equal(overlapping.actionableCaseCount, 2);
  assert.deepEqual(overlapping.casePriorityCounts, { P0: 1, P1: 0, P2: 1 });
  assert.deepEqual(overlapping.groups.map(item => item.code), [
    'formal-package-blocked',
    'trusted-chain-blocked',
    'package-compatibility-review',
  ]);
  assert.equal(overlapping.groups[0].cases.includes('雙重阻擋案'), true);
  assert.equal(overlapping.groups[1].cases.includes('雙重阻擋案'), true);

  assert.equal(cli(['--help']).status, 0);
  assert.equal(cli([]).status, 3);
  assert.equal(cli(['--unknown']).status, 3);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment case governance portfolio OK');
