'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Builder = require('./attachment-package-build.js');
const Checker = require('./attachment-package-check.js');
const History = require('./attachment-package-upgrade-history.js');
const Index = require('./attachment-package-upgrade-history-index.js');
const Baseline = require('./attachment-package-upgrade-history-baseline.js');
const Advance = require('./attachment-package-upgrade-history-baseline-advance.js');
const Chain = require('./attachment-package-upgrade-history-baseline-chain.js');
const Overview = require('./attachment-case-governance-overview.js');

const ROOT_KIND = 'formal-attachment-case-governance-root-entry.v1';
const ROOT_BOUNDARY_INSTRUCTION = '本入口只供案件內部自動定位正式附件包、外部歷程與可信基準版本鏈；不得放入計算書、主報告或正式附件包，亦不代表正式附件核可或數位簽章。';
const MAX_PROBE_JSON_BYTES = 1024 * 1024;

function issue(level, code, message, entries = []) {
  return { level, code, message, entries: [...entries].sort() };
}

function samePath(left, right) {
  const normalize = value => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
  return normalize(left) === normalize(right);
}

function physicalRoot(rootDir) {
  const resolved = path.resolve(rootDir || '');
  if (!rootDir || !fs.existsSync(resolved)) throw new Error(`案件根目錄不存在：${resolved || rootDir || '(未指定)'}`);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('案件根目錄必須是實體資料夾。');
  const realPath = (fs.realpathSync.native || fs.realpathSync)(resolved);
  if (!samePath(realPath, resolved)) throw new Error('案件根目錄不得透過符號連結或目錄連接重新導向。');
  return { resolved, realPath };
}

function readJsonKind(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile() || Number(stat.size) > MAX_PROBE_JSON_BYTES) return '';
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return typeof parsed?.kind === 'string' ? parsed.kind : '';
  } catch (error) {
    return '';
  }
}

function isFormalPackageDirectory(directory) {
  const marker = path.join(directory, Builder.INTERNAL_TRACE_DIR, Builder.PACKAGE_MANIFEST_FILE);
  return fs.existsSync(marker) && fs.lstatSync(marker).isFile();
}

function isHistoryDirectory(directory, name) {
  if (name === History.HISTORY_DIR_NAME) return true;
  return fs.readdirSync(directory).some(entry => {
    if (path.extname(entry).toLowerCase() !== '.json') return false;
    return readJsonKind(path.join(directory, entry)) === History.HISTORY_KIND;
  });
}

function isChainDirectory(directory, name) {
  if (name === Baseline.BASELINE_DIR_NAME) return true;
  return fs.readdirSync(directory).some(entry => {
    const candidate = path.join(directory, entry);
    const stat = fs.lstatSync(candidate);
    if (stat.isFile() && path.extname(entry).toLowerCase() === '.json') {
      return readJsonKind(candidate) === Index.INDEX_KIND;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    const children = fs.readdirSync(candidate).sort();
    return JSON.stringify(children) === JSON.stringify([Advance.APPROVAL_FILE_NAME, Advance.BASELINE_FILE_NAME].sort());
  });
}

function scanCaseRoot(rootDir) {
  const root = physicalRoot(rootDir);
  const candidates = { packages: [], histories: [], chains: [] };
  const issues = [];
  fs.readdirSync(root.resolved).sort().forEach(name => {
    const candidate = path.join(root.resolved, name);
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink()) {
      issues.push(issue('error', 'unsafe-case-root-entry', '案件根目錄含連結項目，無法安全自動辨識。', [name]));
      return;
    }
    if (!stat.isDirectory()) return;
    try {
      if (isFormalPackageDirectory(candidate)) candidates.packages.push({ name, path: candidate });
      if (isHistoryDirectory(candidate, name)) candidates.histories.push({ name, path: candidate });
      if (isChainDirectory(candidate, name)) candidates.chains.push({ name, path: candidate });
    } catch (error) {
      issues.push(issue('error', 'case-root-entry-unreadable', '案件根目錄的候選資料夾無法安全讀取。', [name]));
    }
  });
  const rules = [
    ['packages', 'formal-package', '正式附件包'],
    ['histories', 'upgrade-history', '外部升級歷程'],
    ['chains', 'trusted-baseline-chain', '可信基準版本鏈'],
  ];
  const rolesByPath = new Map();
  rules.forEach(([field, , label]) => {
    candidates[field].forEach(item => {
      const labels = rolesByPath.get(item.path) || [];
      labels.push(label);
      rolesByPath.set(item.path, labels);
    });
  });
  rolesByPath.forEach((labels, candidatePath) => {
    if (labels.length > 1) {
      issues.push(issue('error', 'overlapping-case-role', '同一資料夾同時符合多種治理角色，為避免誤判而停止。', [path.basename(candidatePath)]));
    }
  });
  rules.forEach(([field, code, label]) => {
    if (candidates[field].length === 0) {
      issues.push(issue('error', `missing-${code}`, `案件根目錄找不到${label}。`));
    } else if (candidates[field].length > 1) {
      issues.push(issue('error', `ambiguous-${code}`, `案件根目錄找到多組${label}，為避免猜選而停止。`, candidates[field].map(item => item.name)));
    }
  });
  return { root, candidates, issues };
}

function candidateNames(candidates) {
  return {
    packages: candidates.packages.map(item => item.name).sort(),
    histories: candidates.histories.map(item => item.name).sort(),
    chains: candidates.chains.map(item => item.name).sort(),
  };
}

function discoveryFingerprint(discovery, governanceFingerprint = '') {
  const payload = {
    candidates: candidateNames(discovery.candidates),
    issues: discovery.issues.map(item => ({ level: item.level, code: item.code, entries: item.entries })),
    governanceFingerprint,
  };
  const digest = crypto.createHash('sha256')
    .update(History.canonicalJson(payload), 'utf8')
    .digest('hex')
    .slice(0, 24)
    .toUpperCase();
  return `CAS-${digest}`;
}

function sameDiscovery(left, right) {
  return samePath(left.root.realPath, right.root.realPath)
    && JSON.stringify(candidateNames(left.candidates)) === JSON.stringify(candidateNames(right.candidates))
    && JSON.stringify(left.issues.map(item => ({ code: item.code, entries: item.entries })))
      === JSON.stringify(right.issues.map(item => ({ code: item.code, entries: item.entries })));
}

function blockedResult(discovery, generatedAt) {
  const names = candidateNames(discovery.candidates);
  return {
    schemaVersion: 1,
    kind: ROOT_KIND,
    generatedAt: generatedAt.toISOString(),
    status: 'blocked',
    caseFingerprint: discoveryFingerprint(discovery),
    boundary: {
      classification: 'internal-governance-only',
      attachToFormalReport: false,
      formalAttachmentApproval: false,
      instruction: ROOT_BOUNDARY_INSTRUCTION,
    },
    discovery: {
      caseRootName: path.basename(discovery.root.resolved),
      status: 'blocked',
      packageCandidates: names.packages,
      historyCandidates: names.histories,
      chainCandidates: names.chains,
    },
    governance: null,
    issues: discovery.issues,
    nextActions: [{ code: 'fix-case-root-layout', message: '整理案件根目錄，使正式附件包、外部歷程與可信基準版本鏈各只有一組實體資料夾後重試。' }],
  };
}

function inspectCaseRoot(rootDir, options = {}) {
  const generatedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('無法建立案件根目錄治理總覽時間。');
  const discoveryBefore = scanCaseRoot(rootDir);
  if (discoveryBefore.issues.length) return blockedResult(discoveryBefore, generatedAt);

  const selected = {
    package: discoveryBefore.candidates.packages[0],
    history: discoveryBefore.candidates.histories[0],
    chain: discoveryBefore.candidates.chains[0],
  };
  const selectedBefore = {
    package: Chain.directorySnapshot(selected.package.path, '正式附件包'),
    history: Index.historySnapshot(selected.history.path),
    chain: Chain.directorySnapshot(selected.chain.path, '可信基準版本鏈根目錄'),
  };
  const governance = Overview.inspectGovernance(
    selected.package.path,
    selected.history.path,
    selected.chain.path,
    { now: generatedAt },
  );
  if (typeof options.beforeFinalize === 'function') options.beforeFinalize({ discovery: discoveryBefore, governance });

  const wrapperIssues = [];
  try {
    const discoveryAfter = scanCaseRoot(rootDir);
    const selectedChanged = JSON.stringify(selectedBefore.package) !== JSON.stringify(Chain.directorySnapshot(selected.package.path, '正式附件包'))
      || JSON.stringify(selectedBefore.history) !== JSON.stringify(Index.historySnapshot(selected.history.path))
      || JSON.stringify(selectedBefore.chain) !== JSON.stringify(Chain.directorySnapshot(selected.chain.path, '可信基準版本鏈根目錄'));
    if (!sameDiscovery(discoveryBefore, discoveryAfter) || selectedChanged) {
      wrapperIssues.push(issue('error', 'case-root-changed-during-read', '案件根目錄候選或已選資料在唯讀總覽期間發生變更。'));
    }
  } catch (error) {
    wrapperIssues.push(issue('error', 'case-root-changed-during-read', '案件根目錄在唯讀總覽期間無法再次確認。'));
  }
  const status = wrapperIssues.length ? 'blocked' : governance.status;
  const nextActions = wrapperIssues.length
    ? [{ code: 'rerun-after-case-root-stable', message: '固定案件根目錄內容後重新執行唯讀總覽。' }]
    : governance.nextActions;
  const names = candidateNames(discoveryBefore.candidates);
  const result = {
    schemaVersion: 1,
    kind: ROOT_KIND,
    generatedAt: generatedAt.toISOString(),
    status,
    caseFingerprint: '',
    boundary: {
      classification: 'internal-governance-only',
      attachToFormalReport: false,
      formalAttachmentApproval: false,
      instruction: ROOT_BOUNDARY_INSTRUCTION,
    },
    discovery: {
      caseRootName: path.basename(discoveryBefore.root.resolved),
      status: wrapperIssues.length ? 'blocked' : 'resolved',
      packageCandidates: names.packages,
      historyCandidates: names.histories,
      chainCandidates: names.chains,
      selectedPackage: selected.package.name,
      selectedHistory: selected.history.name,
      selectedChain: selected.chain.name,
    },
    governance,
    issues: wrapperIssues,
    nextActions,
  };
  result.caseFingerprint = discoveryFingerprint({ ...discoveryBefore, issues: wrapperIssues }, governance.governanceFingerprint);
  return result;
}

function formatSummary(result) {
  const statusLabel = result.status === 'ready' ? '可進入內部歸檔複核' : result.status === 'review' ? '需人工確認' : '停止歸檔';
  const lines = [
    '案件根目錄附件治理唯讀入口',
    `狀態：${statusLabel}`,
    `案件根目錄：${result.discovery.caseRootName}`,
    `案件指紋：${result.caseFingerprint}`,
  ];
  if (result.discovery.status === 'resolved') {
    lines.push(`正式附件包：${result.discovery.selectedPackage}`);
    lines.push(`外部歷程：${result.discovery.selectedHistory}`);
    lines.push(`可信基準鏈：${result.discovery.selectedChain}`);
  }
  result.issues.forEach(item => lines.push(`- 阻擋 [${item.code}] ${item.message}`));
  if (result.governance) lines.push(Overview.formatSummary(result.governance));
  if (!result.governance || result.issues.length) {
    result.nextActions.forEach(item => lines.push(`- 下一步：${item.message}`));
  }
  lines.push(ROOT_BOUNDARY_INSTRUCTION);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('參數 --root 缺少路徑值。');
      options.root = value;
      index += 1;
    } else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return [
    '用法：node attachment-case-governance-root.js --root <案件根目錄> [--json]',
    '只掃描直接子資料夾；三類治理資料各只有一組時才會執行唯讀總覽。',
    'ready 只表示可進入內部歸檔複核，不代表正式附件核可。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return Checker.PACKAGE_STATUS_EXIT_CODES.ready;
  }
  if (!options.root) {
    console.error(usage());
    return Checker.CLI_ERROR_EXIT_CODE;
  }
  const result = inspectCaseRoot(options.root, options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return Checker.exitCodeForStatus(result.status);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  ROOT_KIND,
  ROOT_BOUNDARY_INSTRUCTION,
  readJsonKind,
  isFormalPackageDirectory,
  isHistoryDirectory,
  isChainDirectory,
  scanCaseRoot,
  candidateNames,
  discoveryFingerprint,
  sameDiscovery,
  blockedResult,
  inspectCaseRoot,
  formatSummary,
  parseArgs,
  usage,
};
