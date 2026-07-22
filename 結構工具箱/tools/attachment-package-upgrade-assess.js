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

function recordFingerprints(record) {
  return Checker.normalizedFingerprints(record).sort();
}

function recordsShareIdentity(formalRecord, sourceRecord) {
  if (String(formalRecord.sourceTool || '').trim() !== String(sourceRecord.sourceTool || '').trim()) return false;
  if (Checker.normalizeToolVersion(formalRecord.toolVersion) !== Checker.normalizeToolVersion(sourceRecord.toolVersion)) return false;
  const sourceFingerprints = new Set(recordFingerprints(sourceRecord));
  return recordFingerprints(formalRecord).some(fingerprint => sourceFingerprints.has(fingerprint));
}

function buildWorkItems(records) {
  const formalRecords = records.filter(record => record.role === 'formal')
    .sort((left, right) => String(left.packagedFile).localeCompare(String(right.packagedFile), 'zh-Hant'));
  const sourceRecords = records.filter(record => record.role === 'traceability');
  return formalRecords.map((formalRecord, index) => {
    const sources = sourceRecords.filter(sourceRecord => recordsShareIdentity(formalRecord, sourceRecord))
      .map(sourceRecord => sourceRecord.packagedFile)
      .sort((left, right) => String(left).localeCompare(String(right), 'zh-Hant'));
    const hasPackagedSource = sources.length > 0;
    const sourceInstruction = hasPackagedSource
      ? `由原始工具重新開啟或匯入：${sources.join('、')}。`
      : '附件包內沒有同工具版本且共享計算指紋的來源資料；請回到外部可信的原始計算檔或原工具重建，不得從舊報告反推輸入。';
    return {
      sequence: index + 1,
      formalAttachment: formalRecord.packagedFile,
      sourceTool: formalRecord.sourceTool,
      toolVersion: formalRecord.toolVersion,
      priorOutputTime: formalRecord.outputTime,
      priorApprovalTime: formalRecord.approvalTime || '',
      fingerprints: recordFingerprints(formalRecord),
      sourceStatus: hasPackagedSource ? 'paired' : 'external-source-required',
      sourceFiles: sources,
      actions: [
        {
          code: 'confirm-source',
          state: hasPackagedSource ? 'required' : 'external-source-required',
          message: sourceInstruction,
        },
        {
          code: 'reexport-formal-attachment',
          state: 'required',
          message: '以目前工具與規範重新計算確認，另行輸出新的正式計算書，不覆寫舊附件。',
        },
        {
          code: 'renew-formal-approval',
          state: 'required',
          message: '檢查新輸出內容後重新勾選正式附件核可，產生新的核可時間。',
        },
        {
          code: 'stage-for-v3-package',
          state: 'required',
          message: '將新計算書與對應來源資料放入新的組包來源資料夾，等待建立 v3 包。',
        },
      ],
    };
  });
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
  let workItems = [];
  if (verification.status === 'ready' && isCurrent) {
    status = 'ready';
    requirements = currentPackageRequirement();
  } else if (verification.status === 'review' && isLegacy && verification.summary.errors === 0) {
    status = 'review';
    requiresUpgrade = true;
    requirements = legacyUpgradeRequirements();
    workItems = buildWorkItems(verification.records);
  }
  const pairedWorkItems = workItems.filter(item => item.sourceStatus === 'paired').length;

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
    workItemSummary: {
      total: workItems.length,
      paired: pairedWorkItems,
      externalSourceRequired: workItems.length - pairedWorkItems,
    },
    workItems,
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
  const shownRequirements = report.workItems.length
    ? report.requirements.filter(requirement => ['preserve-legacy-package', 'build-separate-v3-package'].includes(requirement.code))
    : report.requirements;
  shownRequirements.forEach(requirement => {
    const label = requirement.state === 'satisfied' ? '完成' : requirement.state === 'blocked' ? '阻擋' : '必要';
    lines.push(`[${label}] ${requirement.message}`);
  });
  if (report.workItems.length) {
    lines.push(`逐份工作清單：${report.workItemSummary.total} 份；已配對來源 ${report.workItemSummary.paired} 份；需外部來源 ${report.workItemSummary.externalSourceRequired} 份。`);
    report.workItems.forEach(item => {
      lines.push(`[附件 ${item.sequence}] ${item.formalAttachment}`);
      lines.push(`  產出：${item.sourceTool} ${item.toolVersion}；舊輸出時間：${item.priorOutputTime || '未記錄'}；計算指紋：${item.fingerprints.join('、') || '未記錄'}`);
      lines.push(`  對應來源：${item.sourceFiles.length ? item.sourceFiles.join('、') : '包內未配對，需回外部可信來源'}`);
      item.actions.forEach(action => lines.push(`  [待辦] ${action.message}`));
    });
  }
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
  recordFingerprints,
  recordsShareIdentity,
  buildWorkItems,
  assessUpgrade,
  formatSummary,
  parseArgs,
  usage,
};
