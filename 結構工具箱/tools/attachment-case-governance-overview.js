'use strict';

const crypto = require('crypto');
const path = require('path');
const Builder = require('./attachment-package-build.js');
const Checker = require('./attachment-package-check.js');
const Verifier = require('./attachment-package-verify.js');
const History = require('./attachment-package-upgrade-history.js');
const Index = require('./attachment-package-upgrade-history-index.js');
const Advance = require('./attachment-package-upgrade-history-baseline-advance.js');
const Chain = require('./attachment-package-upgrade-history-baseline-chain.js');

const OVERVIEW_KIND = 'formal-attachment-case-governance-overview.v1';
const OVERVIEW_BOUNDARY_INSTRUCTION = '本總覽只供案件內部確認正式附件包、升級歷程與可信基準版本鏈的一致性；不得放入計算書、主報告或正式附件包，亦不代表正式附件核可或數位簽章。';

function issue(level, component, code, message) {
  return { level, component, code, message };
}

function pathsOverlap(left, right) {
  return Builder.isPathInside(left, right) || Builder.isPathInside(right, left);
}

function validateSeparatedRoots(packageSnapshot, historySnapshot, chainSnapshot, externalSnapshot = null) {
  const roots = [
    ['正式附件包', packageSnapshot.root.realPath],
    ['外部歷程', historySnapshot.root.realPath],
    ['可信基準版本鏈', chainSnapshot.root.realPath],
  ];
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (pathsOverlap(roots[left][1], roots[right][1])) {
        throw new Error(`${roots[left][0]}與${roots[right][0]}必須使用完全分離的實體資料夾。`);
      }
    }
  }
  if (externalSnapshot) {
    roots.forEach(([label, rootPath]) => {
      if (Builder.isPathInside(rootPath, externalSnapshot.realPath)) {
        throw new Error(`外部初始可信基準不得位於${label}內。`);
      }
    });
  }
}

function sanitizeMessage(value, replacements) {
  let result = String(value || '');
  replacements.forEach(([source, target]) => {
    if (!source) return;
    const variants = new Set([
      String(source),
      String(source).replace(/\\/g, '/'),
      String(source).replace(/\//g, '\\'),
    ]);
    variants.forEach(variant => { result = result.split(variant).join(target); });
  });
  return result;
}

function overviewFingerprint(packageSummary, historySummary, chainSummary, issues, nextActions) {
  const payload = {
    package: packageSummary,
    history: historySummary,
    chain: chainSummary,
    issues: issues.map(item => ({ level: item.level, component: item.component, code: item.code })),
    nextActions: nextActions.map(item => item.code),
  };
  const digest = crypto.createHash('sha256')
    .update(History.canonicalJson(payload), 'utf8')
    .digest('hex')
    .slice(0, 24)
    .toUpperCase();
  return `GOV-${digest}`;
}

function buildNextActions(packageStatus, chainStatus, issues) {
  const actions = [];
  if (packageStatus === 'blocked') {
    actions.push({ code: 'repair-formal-package', message: '停止歸檔；先修復或重新建立正式附件包，再重新驗證。' });
  } else if (packageStatus === 'review') {
    actions.push({ code: 'review-or-upgrade-formal-package', message: '確認附件包相容性提醒；舊版附件包應依升級流程重建為目前格式。' });
  }
  if (chainStatus === 'blocked') {
    actions.push({ code: 'repair-trusted-baseline-chain', message: '停止歸檔；先處理可信基準版本鏈的斷鏈、篡改或核准證據問題。' });
  } else if (chainStatus === 'review') {
    actions.push({ code: 'advance-trusted-baseline', message: '目前歷程有合法新增收據；完成人工複核後另行前進可信基準。' });
  }
  if (issues.some(item => item.code === 'overview-source-changed')) {
    actions.push({ code: 'rerun-after-source-stable', message: '輸入在總覽期間發生變更；固定資料後重新執行唯讀總覽。' });
  }
  if (!actions.length) {
    actions.push({ code: 'internal-archive-review', message: '附件包與內部版本鏈目前一致，可進入案件內部歸檔複核；正式採用仍由主文及負責人確認。' });
  }
  return actions;
}

function inspectGovernance(packageDir, historyDir, chainRoot, options = {}) {
  const generatedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('無法建立案件治理總覽時間。');

  const packageBefore = Chain.directorySnapshot(packageDir, '正式附件包');
  const historyBefore = Index.historySnapshot(historyDir);
  const chainBefore = Chain.directorySnapshot(chainRoot, '可信基準版本鏈根目錄');
  const externalBefore = options.initialBaseline ? Advance.fileSnapshot(options.initialBaseline) : null;
  validateSeparatedRoots(packageBefore, historyBefore, chainBefore, externalBefore);

  const packageReport = Verifier.verifyPackage(packageDir);
  const chainReport = Chain.inspectChain(historyDir, chainRoot, {
    now: generatedAt,
    initialBaseline: options.initialBaseline,
  });
  const replacements = [
    [path.resolve(packageDir), '[正式附件包]'],
    [path.resolve(historyDir), '[外部歷程]'],
    [path.resolve(chainRoot), '[可信基準版本鏈]'],
    [options.initialBaseline ? path.resolve(options.initialBaseline) : '', '[外部初始基準]'],
  ];
  const issues = [];
  packageReport.issues.forEach(item => issues.push(issue(
    item.level === 'warning' ? 'warn' : 'error',
    'formal-package',
    item.code,
    sanitizeMessage(item.message, replacements),
  )));
  chainReport.issues.forEach(item => issues.push(issue(
    item.level,
    'trusted-baseline-chain',
    item.code,
    sanitizeMessage(item.message, replacements),
  )));

  if (typeof options.beforeFinalize === 'function') options.beforeFinalize({ packageReport, chainReport });
  let sourceChanged = false;
  try {
    sourceChanged = JSON.stringify(packageBefore) !== JSON.stringify(Chain.directorySnapshot(packageDir, '正式附件包'))
      || JSON.stringify(historyBefore) !== JSON.stringify(Index.historySnapshot(historyDir))
      || JSON.stringify(chainBefore) !== JSON.stringify(Chain.directorySnapshot(chainRoot, '可信基準版本鏈根目錄'))
      || (externalBefore && JSON.stringify(externalBefore) !== JSON.stringify(Advance.fileSnapshot(options.initialBaseline)));
  } catch (error) {
    sourceChanged = true;
  }
  if (sourceChanged) {
    issues.push(issue('error', 'overview', 'overview-source-changed', '正式附件包、外部歷程或可信基準版本鏈在總覽期間發生變更。'));
  }

  const errors = issues.filter(item => item.level === 'error').length;
  const warnings = issues.filter(item => item.level === 'warn').length;
  const status = errors || packageReport.status === 'blocked' || chainReport.status === 'blocked'
    ? 'blocked'
    : packageReport.status === 'review' || chainReport.status === 'review' || warnings
      ? 'review'
      : 'ready';
  const packageSummary = {
    status: packageReport.status,
    manifestSchemaVersion: packageReport.manifestSchemaVersion,
    manifestKind: packageReport.manifestKind,
    packageFingerprint: packageReport.packageFingerprint,
    expectedFiles: packageReport.summary.expectedFiles,
    verifiedFiles: packageReport.summary.verifiedFiles,
    errors: packageReport.summary.errors,
    warnings: packageReport.summary.warnings,
  };
  const historySummary = {
    status: chainReport.currentComparison.status,
    currentReceiptCount: chainReport.summary.currentReceiptCount,
    terminalReceiptCount: chainReport.summary.terminalReceiptCount,
    pendingAdditions: chainReport.summary.pendingAdditions,
  };
  const chainSummary = {
    status: chainReport.status,
    chainFingerprint: chainReport.chainFingerprint,
    baselines: chainReport.summary.baselines,
    bundles: chainReport.summary.bundles,
    links: chainReport.summary.links,
    rootCollectionFingerprint: chainReport.root?.collectionFingerprint || '',
    terminalCollectionFingerprint: chainReport.terminal?.collectionFingerprint || '',
  };
  const nextActions = buildNextActions(packageReport.status, chainReport.status, issues);
  return {
    schemaVersion: 1,
    kind: OVERVIEW_KIND,
    generatedAt: generatedAt.toISOString(),
    status,
    governanceFingerprint: overviewFingerprint(packageSummary, historySummary, chainSummary, issues, nextActions),
    boundary: {
      classification: 'internal-governance-only',
      attachToFormalReport: false,
      formalAttachmentApproval: false,
      instruction: OVERVIEW_BOUNDARY_INSTRUCTION,
    },
    scope: {
      packageName: path.basename(path.resolve(packageDir)),
      historyName: path.basename(path.resolve(historyDir)),
      chainRootName: path.basename(path.resolve(chainRoot)),
    },
    summary: { errors, warnings, actionCount: nextActions.length },
    package: packageSummary,
    history: historySummary,
    chain: chainSummary,
    issues,
    nextActions,
  };
}

function formatSummary(result) {
  const statusLabel = result.status === 'ready' ? '可進入內部歸檔複核' : result.status === 'review' ? '需人工確認' : '停止歸檔';
  const lines = [
    '案件附件治理唯讀總覽',
    `狀態：${statusLabel}`,
    `正式附件包：${result.package.status}；已驗證 ${result.package.verifiedFiles}/${result.package.expectedFiles}`,
    `可信基準版本鏈：${result.chain.status}；基準 ${result.chain.baselines}；連結 ${result.chain.links}`,
    `目前歷程：${result.history.currentReceiptCount} 份；鏈尾 ${result.history.terminalReceiptCount} 份；待前進 ${result.history.pendingAdditions} 份`,
    `治理指紋：${result.governanceFingerprint}`,
  ];
  result.issues.forEach(item => lines.push(`- ${item.level === 'error' ? '阻擋' : '提醒'} [${item.component}/${item.code}] ${item.message}`));
  result.nextActions.forEach(item => lines.push(`- 下一步：${item.message}`));
  lines.push(OVERVIEW_BOUNDARY_INSTRUCTION);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`參數 ${arg} 缺少路徑值。`);
      index += 1;
      return value;
    };
    if (arg === '--package') options.package = takeValue();
    else if (arg === '--history') options.history = takeValue();
    else if (arg === '--chain-root') options.chainRoot = takeValue();
    else if (arg === '--initial-baseline') options.initialBaseline = takeValue();
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return [
    '用法：node attachment-case-governance-overview.js',
    '  --package <正式附件包> --history <外部歷程資料夾> --chain-root <可信基準根目錄>',
    '  [--initial-baseline <根目錄外的初始可信基準 JSON>] [--json]',
    '本工具固定唯讀；ready 只表示可進入內部歸檔複核，不代表正式附件核可。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return Checker.PACKAGE_STATUS_EXIT_CODES.ready;
  }
  if (!options.package || !options.history || !options.chainRoot) {
    console.error(usage());
    return Checker.CLI_ERROR_EXIT_CODE;
  }
  const result = inspectGovernance(options.package, options.history, options.chainRoot, options);
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
  OVERVIEW_KIND,
  OVERVIEW_BOUNDARY_INSTRUCTION,
  pathsOverlap,
  validateSeparatedRoots,
  sanitizeMessage,
  overviewFingerprint,
  buildNextActions,
  inspectGovernance,
  formatSummary,
  parseArgs,
  usage,
};
