'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');
const Workspace = require('./attachment-package-upgrade-workspace.js');

const CHECK_KIND = 'formal-attachment-package-upgrade-workspace-check.v1';
const PENDING_PACKAGE_ERROR_CODES = new Set([
  'no-attachments',
  'internal-review-document',
  'missing-formal-approval-time',
]);

function issue(level, code, message, files = []) {
  return { level, code, message, files: [...new Set(files)] };
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sortedNames(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, 'zh-Hant'));
}

function sameNames(actual, expected) {
  return actual.length === expected.length && actual.every((name, index) => name === expected[index]);
}

function expectedNames(names) {
  return [...names].sort((left, right) => left.localeCompare(right, 'zh-Hant'));
}

function validatePlainDirectory(directory, label, issues) {
  if (!fs.existsSync(directory)) {
    issues.push(issue('error', 'missing-workspace-directory', `${label}不存在：${directory}`));
    return false;
  }
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    issues.push(issue('error', 'unsafe-workspace-directory', `${label}必須是工作區內的實體資料夾，不得為連結或其他特殊項目：${directory}`));
    return false;
  }
  return true;
}

function validatePlainFile(filePath, label, issues) {
  if (!fs.existsSync(filePath)) {
    issues.push(issue('error', 'missing-workspace-control-file', `${label}不存在：${filePath}`));
    return false;
  }
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    issues.push(issue('error', 'unsafe-workspace-control-file', `${label}必須是工作區內的實體檔案，不得為連結或其他特殊項目：${filePath}`));
    return false;
  }
  return true;
}

function workspacePaths(workspaceDir) {
  const resolvedWorkspace = path.resolve(workspaceDir || '');
  const guideDir = path.join(resolvedWorkspace, Workspace.INTERNAL_GUIDE_DIR);
  const packageSourceDir = path.join(resolvedWorkspace, Workspace.PACKAGE_SOURCE_DIR);
  return {
    workspaceDir: resolvedWorkspace,
    guideDir,
    packageSourceDir,
    formalReportsDir: path.join(packageSourceDir, Workspace.NEW_FORMAL_REPORTS_DIR),
    traceSourcesDir: path.join(packageSourceDir, Workspace.NEW_TRACE_SOURCES_DIR),
    planJsonPath: path.join(guideDir, Workspace.PLAN_JSON_FILE),
    planMarkdownPath: path.join(guideDir, Workspace.PLAN_MARKDOWN_FILE),
  };
}

function validateLayout(paths) {
  const issues = [];
  if (!validatePlainDirectory(paths.workspaceDir, '升級工作區', issues)) return issues;
  const rootNames = sortedNames(paths.workspaceDir);
  const expectedRootNames = expectedNames([Workspace.INTERNAL_GUIDE_DIR, Workspace.PACKAGE_SOURCE_DIR]);
  if (!sameNames(rootNames, expectedRootNames)) {
    issues.push(issue('error', 'workspace-root-layout-mismatch', `升級工作區根目錄只能包含「${expectedRootNames.join('」與「')}」；目前為：${rootNames.join('、') || '空白'}。`));
  }
  const guideReady = validatePlainDirectory(paths.guideDir, '內部升級工作說明資料夾', issues);
  const sourceReady = validatePlainDirectory(paths.packageSourceDir, '新組包來源資料夾', issues);
  if (guideReady) {
    const guideNames = sortedNames(paths.guideDir);
    const expectedGuideNames = expectedNames([Workspace.PLAN_JSON_FILE, Workspace.PLAN_MARKDOWN_FILE]);
    if (!sameNames(guideNames, expectedGuideNames)) {
      issues.push(issue('error', 'workspace-guide-layout-mismatch', `內部工作說明資料夾只能包含兩份工作清單；目前為：${guideNames.join('、') || '空白'}。`));
    }
    validatePlainFile(paths.planJsonPath, 'JSON 工作清單', issues);
    validatePlainFile(paths.planMarkdownPath, 'Markdown 工作清單', issues);
  }
  if (sourceReady) {
    const sourceNames = sortedNames(paths.packageSourceDir);
    const expectedSourceNames = expectedNames([Workspace.NEW_FORMAL_REPORTS_DIR, Workspace.NEW_TRACE_SOURCES_DIR]);
    if (!sameNames(sourceNames, expectedSourceNames)) {
      issues.push(issue('error', 'workspace-source-layout-mismatch', `新組包來源根目錄只能包含新的計算書與來源資料兩區；目前為：${sourceNames.join('、') || '空白'}。`));
    }
    validatePlainDirectory(paths.formalReportsDir, '重新輸出正式計算書資料夾', issues);
    validatePlainDirectory(paths.traceSourcesDir, '重新確認來源資料資料夾', issues);
  }
  return issues;
}

function readPlan(paths, issues) {
  if (!fs.existsSync(paths.planJsonPath)) return null;
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(paths.planJsonPath, 'utf8'));
  } catch (error) {
    issues.push(issue('error', 'invalid-workspace-plan-json', `JSON 工作清單無法解析：${error.message || error}`));
    return null;
  }
  if (plan.schemaVersion !== 1 || plan.kind !== Workspace.WORKSPACE_KIND) {
    issues.push(issue('error', 'workspace-plan-contract-mismatch', 'JSON 工作清單的版本或種類不符，停止完成度判定。'));
  }
  if (plan.formalReadiness !== 'review') {
    issues.push(issue('error', 'workspace-plan-readiness-tampered', '工作清單的正式狀態必須維持 review；工作區不得自行宣告正式核可。'));
  }
  if (!Number.isFinite(Date.parse(plan.generatedAt || ''))) {
    issues.push(issue('error', 'invalid-workspace-generated-at', `工作區建立時間無效：${plan.generatedAt || '未記錄'}。`));
  }
  if (!/^WSP-[0-9A-F]{24}$/.test(String(plan.planFingerprint || ''))
      || Workspace.planFingerprint(plan) !== plan.planFingerprint) {
    issues.push(issue('error', 'workspace-plan-fingerprint-mismatch', '工作清單指紋不符；清單可能遭修改，不得據此放行。'));
  }
  if (!Array.isArray(plan.copiedLegacyFiles) || plan.copiedLegacyFiles.length !== 0) {
    issues.push(issue('error', 'workspace-plan-legacy-copy-claim', '工作清單不得宣告或帶入任何舊附件複本。'));
  }
  const expectedBoundaries = {
    internalGuideDirectory: Workspace.INTERNAL_GUIDE_DIR,
    packageSourceDirectory: Workspace.PACKAGE_SOURCE_DIR,
    newFormalReportsDirectory: `${Workspace.PACKAGE_SOURCE_DIR}/${Workspace.NEW_FORMAL_REPORTS_DIR}`,
    newTraceSourcesDirectory: `${Workspace.PACKAGE_SOURCE_DIR}/${Workspace.NEW_TRACE_SOURCES_DIR}`,
  };
  Object.entries(expectedBoundaries).forEach(([key, value]) => {
    if (plan.boundaries?.[key] !== value) {
      issues.push(issue('error', 'workspace-plan-boundary-mismatch', `工作清單的 ${key} 邊界不符：${plan.boundaries?.[key] || '未記錄'}。`));
    }
  });
  if (!Array.isArray(plan.workItems) || !plan.workItems.length) {
    issues.push(issue('error', 'workspace-plan-work-items-missing', '工作清單沒有逐份附件待辦，不得判定完成。'));
  } else {
    const sequences = new Set();
    plan.workItems.forEach((item, index) => {
      if (!Number.isSafeInteger(item.sequence) || item.sequence < 1 || sequences.has(item.sequence)) {
        issues.push(issue('error', 'workspace-plan-sequence-invalid', `工作清單第 ${index + 1} 筆的附件序號無效或重複。`));
      }
      sequences.add(item.sequence);
      if (!String(item.sourceTool || '').trim() || !Array.isArray(item.fingerprints) || !item.fingerprints.length) {
        issues.push(issue('error', 'workspace-plan-identity-incomplete', `附件 ${item.sequence || index + 1} 缺少產出工具或計算指紋，無法安全配對新輸出。`));
      }
    });
    if (plan.workItemSummary?.total !== plan.workItems.length) {
      issues.push(issue('error', 'workspace-plan-summary-mismatch', '工作清單的總數與逐份附件待辦數量不一致。'));
    }
  }
  if (fs.existsSync(paths.planMarkdownPath)) {
    const actualMarkdown = fs.readFileSync(paths.planMarkdownPath, 'utf8').replace(/\r\n/g, '\n');
    const expectedMarkdown = Workspace.formatPlanMarkdown(plan).replace(/\r\n/g, '\n');
    if (actualMarkdown !== expectedMarkdown) {
      issues.push(issue('error', 'workspace-plan-markdown-mismatch', 'Markdown 工作清單與受指紋保護的 JSON 工作清單不一致。'));
    }
  }
  return plan;
}

function recordMatchesWorkItem(record, workItem) {
  if (String(record.sourceTool || '').trim() !== String(workItem.sourceTool || '').trim()) return false;
  const expectedFingerprints = new Set((workItem.fingerprints || []).map(value => String(value).toUpperCase()));
  return Checker.normalizedFingerprints(record).some(fingerprint => expectedFingerprints.has(fingerprint));
}

function freshnessIssues(record, workItem, generatedEpoch, role) {
  const issues = [];
  const outputEpoch = Checker.parseTraceDateTime(record.outputTime);
  if (!Number.isFinite(outputEpoch) || outputEpoch < generatedEpoch) {
    issues.push(issue('warn', 'new-output-not-fresh', `附件 ${workItem.sequence} 的${role}輸出時間不得早於工作區建立時間；請由可信來源重新輸出：${record.file}。`, [record.file]));
  }
  if (role === '正式計算書') {
    const approvalEpoch = Checker.parseTraceDateTime(record.approvalTime);
    if (!Number.isFinite(approvalEpoch) || approvalEpoch < generatedEpoch) {
      issues.push(issue('warn', 'new-approval-not-fresh', `附件 ${workItem.sequence} 必須在工作區建立後重新核可：${record.file}。`, [record.file]));
    }
  }
  return issues;
}

function incompletePackageCheck(paths, issues) {
  return {
    kind: 'attachment-package-check.v1',
    generatedAt: new Date().toISOString(),
    status: 'blocked',
    summary: { attachments: 0, unsupported: 0, unsafeSourceEntries: 0, errors: issues.length, warnings: 0 },
    expectedProjectNo: '', attachments: [], fingerprintLinks: [], issues, unsafeSourceEntries: [],
  };
}

function controlSnapshot(paths) {
  return {
    rootNames: sortedNames(paths.workspaceDir),
    guideNames: sortedNames(paths.guideDir),
    sourceNames: sortedNames(paths.packageSourceDir),
    planJsonSha256: sha256File(paths.planJsonPath),
    planMarkdownSha256: sha256File(paths.planMarkdownPath),
  };
}

function checkUpgradeWorkspace(inputDir, options = {}) {
  const paths = workspacePaths(inputDir);
  if (!fs.existsSync(paths.workspaceDir)) throw new Error(`升級工作區不存在：${paths.workspaceDir}`);
  const issues = validateLayout(paths);
  const plan = readPlan(paths, issues);
  if (issues.some(item => item.level === 'error') || !plan) {
    const packageCheck = incompletePackageCheck(paths, issues);
    return {
      kind: CHECK_KIND, status: 'blocked', workspaceDir: paths.workspaceDir,
      packageSourceDir: paths.packageSourceDir, formalReady: false, plan,
      summary: { total: plan?.workItems?.length || 0, matched: 0, pending: plan?.workItems?.length || 0, errors: issues.length, warnings: 0 },
      workItems: [], issues, packageCheck,
    };
  }

  const beforeControl = controlSnapshot(paths);
  const packageCheck = Checker.checkPackage(paths.packageSourceDir, { projectNo: options.projectNo || '' });
  const normalizedPackageIssues = packageCheck.issues.map(packageIssue => {
    if (packageIssue.level === 'error' && PENDING_PACKAGE_ERROR_CODES.has(packageIssue.code)) {
      return issue('warn', packageIssue.code, packageIssue.message, packageIssue.files);
    }
    if (packageIssue.level === 'error') return issue('error', packageIssue.code, packageIssue.message, packageIssue.files);
    return issue('warn', packageIssue.code, packageIssue.message, packageIssue.files);
  });
  issues.push(...normalizedPackageIssues);

  const formalRecords = packageCheck.attachments.filter(record => String(record.type || '').toLowerCase() !== 'json');
  const sourceRecords = packageCheck.attachments.filter(record => String(record.type || '').toLowerCase() === 'json');
  const generatedEpoch = Date.parse(plan.generatedAt);
  const usedFormalFiles = new Set();
  const usedSourceFiles = new Set();
  const workItems = plan.workItems.map(item => {
    const formalMatches = formalRecords.filter(record => recordMatchesWorkItem(record, item));
    const sourceMatches = sourceRecords.filter(record => recordMatchesWorkItem(record, item));
    const matchedFiles = new Set([...formalMatches, ...sourceMatches].map(record => record.file));
    const itemIssues = normalizedPackageIssues.filter(packageIssue =>
      packageIssue.files.some(file => matchedFiles.has(file)));
    const localIssues = [];
    if (formalMatches.length !== 1) {
      localIssues.push(issue('warn', 'new-formal-match-count', `附件 ${item.sequence} 應有且只能有 1 份同工具、同計算指紋的新正式計算書；目前 ${formalMatches.length} 份。`, formalMatches.map(record => record.file)));
    }
    if (sourceMatches.length !== 1) {
      localIssues.push(issue('warn', 'new-source-match-count', `附件 ${item.sequence} 應有且只能有 1 份同工具、同計算指紋的新來源資料；目前 ${sourceMatches.length} 份。`, sourceMatches.map(record => record.file)));
    }
    if (formalMatches.length === 1) {
      if (usedFormalFiles.has(formalMatches[0].file)) localIssues.push(issue('warn', 'new-formal-reused', `${formalMatches[0].file} 同時對應多筆舊附件，不得自動視為逐份完成。`, [formalMatches[0].file]));
      usedFormalFiles.add(formalMatches[0].file);
      localIssues.push(...freshnessIssues(formalMatches[0], item, generatedEpoch, '正式計算書'));
    }
    if (sourceMatches.length === 1) {
      if (usedSourceFiles.has(sourceMatches[0].file)) localIssues.push(issue('warn', 'new-source-reused', `${sourceMatches[0].file} 同時對應多筆舊附件，不得自動視為逐份完成。`, [sourceMatches[0].file]));
      usedSourceFiles.add(sourceMatches[0].file);
      localIssues.push(...freshnessIssues(sourceMatches[0], item, generatedEpoch, '來源資料'));
    }
    itemIssues.push(...localIssues);
    issues.push(...localIssues);
    return {
      sequence: item.sequence,
      legacyFormalAttachment: item.legacyFormalAttachment,
      sourceTool: item.sourceTool,
      priorToolVersion: item.toolVersion,
      fingerprints: [...item.fingerprints],
      formalFiles: formalMatches.map(record => record.file),
      sourceFiles: sourceMatches.map(record => record.file),
      status: itemIssues.length ? 'pending' : 'ready',
      issues: itemIssues,
    };
  });

  const unmatchedFormal = formalRecords.filter(record => !usedFormalFiles.has(record.file)).map(record => record.file);
  const unmatchedSources = sourceRecords.filter(record => !usedSourceFiles.has(record.file)).map(record => record.file);
  if (unmatchedFormal.length) issues.push(issue('warn', 'unmatched-new-formal-files', `有 ${unmatchedFormal.length} 份新計算書不在舊包逐份清單內，不得自動放行。`, unmatchedFormal));
  if (unmatchedSources.length) issues.push(issue('warn', 'unmatched-new-source-files', `有 ${unmatchedSources.length} 份新來源資料不在舊包逐份清單內，不得自動放行。`, unmatchedSources));

  const afterControl = controlSnapshot(paths);
  if (JSON.stringify(afterControl) !== JSON.stringify(beforeControl)) {
    issues.push(issue('error', 'workspace-changed-during-check', '升級工作區控制檔或目錄邊界在檢查期間發生變更，請停止同步或寫入後重查。'));
  }
  const errorCount = issues.filter(item => item.level === 'error').length;
  const warningCount = issues.filter(item => item.level === 'warn').length;
  const matched = workItems.filter(item => item.status === 'ready').length;
  const status = errorCount ? 'blocked' : warningCount ? 'review' : 'ready';
  return {
    kind: CHECK_KIND,
    status,
    workspaceDir: paths.workspaceDir,
    packageSourceDir: paths.packageSourceDir,
    formalReady: status === 'ready',
    plan: {
      generatedAt: plan.generatedAt,
      planFingerprint: plan.planFingerprint,
      sourcePackageFingerprint: plan.sourcePackage?.packageFingerprint || '',
    },
    summary: { total: workItems.length, matched, pending: workItems.length - matched, errors: errorCount, warnings: warningCount },
    workItems,
    issues,
    packageCheck,
    controlSnapshot: afterControl,
  };
}

function workspaceRootForPackageSource(inputDir) {
  const resolvedInput = path.resolve(inputDir || '');
  return path.basename(resolvedInput) === Workspace.PACKAGE_SOURCE_DIR ? path.dirname(resolvedInput) : '';
}

function formatSummary(result) {
  const label = result.status === 'ready' ? '可進入正式組包' : result.status === 'review' ? '待完成' : '阻擋';
  const lines = [
    `舊版附件升級工作區完成度：${label}`,
    `逐份待辦 ${result.summary.total} 份；完成 ${result.summary.matched} 份；待處理 ${result.summary.pending} 份。`,
    `阻擋 ${result.summary.errors} 項；提醒 ${result.summary.warnings} 項。`,
  ];
  result.issues.forEach(item => lines.push(`[${item.level === 'error' ? '阻擋' : '待辦'}] ${item.message}`));
  if (result.status === 'ready') lines.push(`完成度檢查通過；可只選取「${Workspace.PACKAGE_SOURCE_DIR}」建立新的 v3 正式附件包。`);
  else lines.push('完成度檢查不會代替人工核可，也不會修改工作區或建立正式附件包。');
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index];
    else if (arg === '--project-no') options.projectNo = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return '用法：node attachment-package-upgrade-workspace-check.js --input <舊版附件升級工作區> [--project-no <計畫編號>] [--json]';
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (!options.input) {
    console.log(usage());
    return Checker.CLI_ERROR_EXIT_CODE;
  }
  const result = checkUpgradeWorkspace(options.input, options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return Checker.exitCodeForStatus(result.status);
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error(`升級工作區完成度檢查失敗：${error.message || error}`);
    process.exitCode = Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  CHECK_KIND,
  PENDING_PACKAGE_ERROR_CODES,
  issue,
  sha256File,
  workspacePaths,
  validateLayout,
  readPlan,
  recordMatchesWorkItem,
  freshnessIssues,
  controlSnapshot,
  checkUpgradeWorkspace,
  workspaceRootForPackageSource,
  formatSummary,
  parseArgs,
  usage,
};
