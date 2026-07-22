'use strict';

const Checker = require('./attachment-package-check.js');
const Builder = require('./attachment-package-build.js');
const Verifier = require('./attachment-package-verify.js');

const ASSESSMENT_KIND = 'formal-attachment-package-upgrade-assessment.v1';

function legacyUpgradeRequirements() {
  return [
    {
      code: 'preserve-legacy-package',
      state: 'required',
      message: '保留原附件包及其清單不變，作為既有交付與追溯證據。',
    },
    {
      code: 'confirm-and-reexport-current-results',
      state: 'required',
      message: '由原始計算工具重新開啟或匯入來源資料，確認計算內容後重新輸出正式計算書；不得直接改寫舊清單或複製舊核可資訊。',
    },
    {
      code: 'fresh-formal-approval',
      state: 'required',
      message: '針對重新確認的輸出重新勾選正式附件核可，留下新的核可時間。',
    },
    {
      code: 'build-separate-v3-package',
      state: 'required',
      message: '以重新輸出的附件資料夾執行「建立正式附件包」，另建全新的 v3 包；不得覆寫舊包。',
    },
  ];
}

function currentPackageRequirement() {
  return [{
    code: 'no-upgrade-needed',
    state: 'satisfied',
    message: '此附件包已採 v3，且完整性與正式核可時間鏈驗證通過，不需升級。',
  }];
}

function blockedRequirement() {
  return [{
    code: 'repair-integrity-before-upgrade',
    state: 'blocked',
    message: '先回到可信來源修復或重新輸出附件；完整性異常未排除前，不得進行升級或重新核可。',
  }];
}

function assessUpgrade(inputDir) {
  const verification = Verifier.verifyPackage(inputDir);
  const schemaVersion = verification.manifestSchemaVersion;
  const isLegacy = (schemaVersion === 1 && verification.manifestKind === Builder.LEGACY_MANIFEST_KIND)
    || (schemaVersion === 2 && verification.manifestKind === Builder.PREVIOUS_MANIFEST_KIND);
  const isCurrent = schemaVersion === 3 && verification.manifestKind === Builder.MANIFEST_KIND;
  const formalAttachmentCount = verification.records.filter(record => record.role === 'formal').length;
  const traceabilitySourceCount = verification.records.filter(record => record.role === 'traceability').length;

  let status = 'blocked';
  let requiresUpgrade = false;
  let requirements = blockedRequirement();
  if (verification.status === 'ready' && isCurrent) {
    status = 'ready';
    requirements = currentPackageRequirement();
  } else if (verification.status === 'review' && isLegacy && verification.summary.errors === 0) {
    status = 'review';
    requiresUpgrade = true;
    requirements = legacyUpgradeRequirements();
  }

  return {
    kind: ASSESSMENT_KIND,
    status,
    packageDir: verification.packageDir,
    currentPackage: {
      schemaVersion,
      kind: verification.manifestKind,
      packageFingerprint: verification.packageFingerprint,
      formalAttachmentCount,
      traceabilitySourceCount,
    },
    targetPackage: {
      schemaVersion: 3,
      kind: Builder.MANIFEST_KIND,
    },
    requiresUpgrade,
    automaticUpgradeAllowed: false,
    inPlaceUpgradeAllowed: false,
    verification: {
      status: verification.status,
      summary: { ...verification.summary },
      issues: verification.issues.map(issue => ({ ...issue, files: [...(issue.files || [])] })),
    },
    requirements,
  };
}

function formatSummary(report) {
  const statusLabel = report.status === 'ready'
    ? '不需升級'
    : report.status === 'review'
      ? '需重新核可後組包'
      : '暫停升級';
  const versionLabel = Number.isSafeInteger(report.currentPackage.schemaVersion)
    ? `v${report.currentPackage.schemaVersion}`
    : '無法辨識';
  const lines = [
    `正式附件包升級評估：${statusLabel}`,
    `目前版本：${versionLabel}；目標版本：v3；原地升級：不允許。`,
    `完整性檢查：${report.verification.status === 'blocked' ? '阻擋' : '已完成'}；清單檔案 ${report.verification.summary.expectedFiles} 份；已驗證 ${report.verification.summary.verifiedFiles} 份。`,
  ];
  report.verification.issues
    .filter(issue => issue.level === 'error')
    .forEach(issue => lines.push(`[阻擋] ${issue.message}`));
  report.requirements.forEach(requirement => {
    const label = requirement.state === 'satisfied' ? '完成' : requirement.state === 'blocked' ? '阻擋' : '必要';
    lines.push(`[${label}] ${requirement.message}`);
  });
  lines.push('本工具只讀取附件包並提供內部遷移指引，不修改檔案、不補造 metadata，也不產生正式附件。');
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return '用法：node attachment-package-upgrade-assess.js --input <正式附件包資料夾> [--json]';
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
  const report = assessUpgrade(options.input);
  console.log(options.json ? JSON.stringify(report, null, 2) : formatSummary(report));
  return Checker.exitCodeForStatus(report.status);
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error(`正式附件包升級評估失敗：${error.message || error}`);
    process.exitCode = Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  ASSESSMENT_KIND,
  legacyUpgradeRequirements,
  currentPackageRequirement,
  blockedRequirement,
  assessUpgrade,
  formatSummary,
  parseArgs,
  usage,
};
