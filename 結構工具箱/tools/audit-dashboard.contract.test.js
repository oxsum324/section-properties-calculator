const assert = require('assert');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const vm = require('vm');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function hashText(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function assertUtf8NoBomWhenFresh(filePath, sourcePath, label) {
  if (!fs.existsSync(filePath) || !fs.existsSync(sourcePath)) return;
  if (fs.statSync(filePath).mtimeMs < fs.statSync(sourcePath).mtimeMs - 1000) return;
  const prefix = fs.readFileSync(filePath).subarray(0, 3);
  assert.equal(
    prefix.equals(Buffer.from([0xef, 0xbb, 0xbf])),
    false,
    `${label} should be UTF-8 without BOM`
  );
}

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function toolboxFile(relativePath) {
  return path.join(toolboxRoot, ...relativePath.split('/'));
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} missing: ${needle}`);
}

function resolveFileReference(filePath, label) {
  assert.equal(typeof filePath, 'string', `${label} path string`);
  assert.ok(filePath.length > 0, `${label} path populated`);
  return path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
}

function assertSha256(value, label) {
  assert.match(value, /^[0-9a-f]{64}$/i, `${label} sha256`);
}

function assertFileHashField(payload, hashField, pathField, label) {
  assert.ok(payload && typeof payload === 'object', `${label} payload object`);
  const resolvedPath = resolveFileReference(payload[pathField], `${label} ${pathField}`);
  assert.ok(fs.existsSync(resolvedPath), `${label} ${pathField} exists: ${payload[pathField]}`);
  assertSha256(payload[hashField], `${label} ${hashField}`);
  assert.equal(payload[hashField], hashText(readText(resolvedPath)), `${label} ${hashField} matches ${pathField}`);
}

function assertComponentFileHashes(component, label) {
  assertFileHashField(component, 'statusHash', 'statusPath', `${label} status`);
  assertFileHashField(component, 'summaryHash', 'summaryPath', `${label} summary`);
  assertFileHashField(component, 'historySummaryHash', 'historySummaryPath', `${label} history summary`);
}

function assertSourceTraceHashes(sourceTrace, expectedKeys, label) {
  assert.ok(sourceTrace && typeof sourceTrace === 'object', `${label} sourceTrace object`);
  assert.ok(Array.isArray(sourceTrace.componentStatusFiles), `${label} sourceTrace componentStatusFiles array`);
  if (expectedKeys) {
    assert.deepEqual(
      sourceTrace.componentStatusFiles.map(item => item.key).sort(),
      expectedKeys.filter(Boolean).sort(),
      `${label} sourceTrace keys match components`
    );
  }
  for (const item of sourceTrace.componentStatusFiles) {
    assertFileHashField(item, 'statusHash', 'statusPath', `${label} sourceTrace ${item.key} status`);
    assertFileHashField(item, 'summaryHash', 'summaryPath', `${label} sourceTrace ${item.key} summary`);
  }
}

function hasUtf8Bom(filePath) {
  const prefix = fs.readFileSync(filePath).subarray(0, 3);
  return prefix.equals(Buffer.from([0xef, 0xbb, 0xbf]));
}

function assertPreflightRecordLogs(summary, summaryPath = '') {
  const wrappedPowerShellError = /(^|\n)powershell(?:\.exe)?\s*:|NativeCommandError|FullyQualifiedErrorId/i;
  const forbiddenLogGlyphs = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\uFFFD\uE000-\uF8FF]/u;
  const preflightScriptPath = repoFile('preflight-tools.ps1');
  const summaryMtimeMs = summaryPath && fs.existsSync(summaryPath) ? fs.statSync(summaryPath).mtimeMs : null;
  for (const record of summary.records || []) {
    assert.ok(record && record.key, 'preflight record key');
    const logRefs = [
      ['latest', record.log],
      ['history', record.historyLog],
    ];
    for (const [kind, logPath] of logRefs) {
      assert.ok(logPath, `preflight record ${kind} log: ${record.key}`);
      assert.ok(fs.existsSync(logPath), `preflight record ${kind} log exists: ${record.key}`);
      if (record.pass !== true) continue;

      const logMtimeMs = fs.statSync(logPath).mtimeMs;
      const latestLogWasReplacedAfterSummary = kind === 'latest' && summaryMtimeMs !== null && logMtimeMs > summaryMtimeMs + 1000;
      if (latestLogWasReplacedAfterSummary) continue;

      const logText = readText(logPath);
      const logIsFresh = fs.existsSync(preflightScriptPath) && logMtimeMs >= fs.statSync(preflightScriptPath).mtimeMs - 1000;
      if (logIsFresh) {
        assert.equal(
          hasUtf8Bom(logPath),
          false,
          `fresh passed preflight ${kind} log should be UTF-8 without BOM: ${record.key}`
        );
        assert.equal(
          forbiddenLogGlyphs.test(logText),
          false,
          `fresh passed preflight ${kind} log should not contain mojibake/control glyphs: ${record.key}`
        );
      }
      assert.equal(
        wrappedPowerShellError.test(logText),
        false,
        `passed preflight ${kind} log should not contain PowerShell wrapper noise: ${record.key}`
      );
    }
  }
}
function assertHistoryManifestShape(manifest, label) {
  assert.ok(manifest && typeof manifest === 'object', `${label} manifest object`);
  assert.ok(Array.isArray(manifest.items), `${label} items`);
  assert.equal(Number.isInteger(manifest.count), true, `${label} count integer`);
  assert.equal(manifest.count, manifest.items.length, `${label} count matches items`);

  for (const item of manifest.items.slice(0, 5)) {
    assert.ok(item.runId, `${label} runId`);
    assert.ok(item.generatedAt, `${label} generatedAt`);
    assert.equal(typeof item.pass, 'boolean', `${label} pass boolean`);
    assert.equal(Number.isInteger(item.failureCount), true, `${label} failureCount integer`);
    assert.ok(Array.isArray(item.failures), `${label} failures array`);
    assert.ok(item.summaryPath, `${label} summaryPath`);
    assert.ok(item.summaryJsonPath, `${label} summaryJsonPath`);
  }
}

const dashboardPath = toolboxFile('audit-dashboard.html');
const dashboard = readText(dashboardPath);
const publicEvidenceSchemaSource = readText(toolboxFile('assets/status/public-evidence-schema.js'));
const rvrHealthLauncher = readText(repoFile('開挖擋土支撐/check_receiver_trust_backup_health.ps1'));
const gsmMonitorLauncher = readText(repoFile('開挖擋土支撐/receiver_governance_archive_lifecycle_monitor.ps1'));
const gsmMonitorTaskManager = readText(repoFile('開挖擋土支撐/manage_receiver_governance_archive_lifecycle_monitor_task.ps1'));
const gsmMonitorDashboardSchema = readJson(repoFile('開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_DASHBOARD_SCHEMA.json'));
const dashboardScripts = [...dashboard.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
assert.ok(dashboardScripts.length > 0, 'dashboard inline scripts');
dashboardScripts.forEach((match, index) => {
  assert.doesNotThrow(
    () => new vm.Script(match[1], { filename: `audit-dashboard.inline-${index}.js` }),
    `dashboard inline script parses: ${index}`
  );
});

[
  '交付前檢查歷程',
  'preflightLatestStatus',
  'preflightFullStatus',
  'preflightQuickStatus',
  'preflightFailureStatus',
  'preflightTimeline',
  'preflightHistoryWrap',
  'preflightLatestRecordsWrap',
  'preflightPostChecksWrap',
  'preflightStateText',
  'preflightTone',
  'incompleteReason',
  'renderPreflightPostChecks',
  'normalizePostChecks',
  '../output/preflight/post-checks.json',
  '../output/preflight/attachment-integrity-latest.json',
  '<th>post-check</th>',
  'renderPreflightHistory',
  'renderPreflightRecordLinks',
  '../output/preflight/preflight-summary.md',
  '../output/preflight/preflight-history.md',
  '../output/preflight/preflight-history.json',
  '../output/preflight/preflight-summary.json',
  'run-tick',
  'recordsCount',
  'passedCount',
  'totalSeconds',
  'slowestRecords',
  'record.log',
  'record.historyLog',
  'latest log',
  'history log',
  'failedKeys',
  'platformAuditMode',
  'platformAuditReused',
  'formatPlatformAuditMode',
  'slowReuseCount',
  'slowReuseKeys',
  'formatSlowReuse',
  '完成狀態',
  '未完成',
  'maturityUpgradeGapCount',
  'maturityUpgradeGapHint',
  'maturityUpgradeTargets',
  'jointReactionSyntheticCount',
  'jointReactionSyntheticHint',
  'jointReactionObservedCount',
  'jointReactionObservedHint',
  'jointReactionCandidateCount',
  'jointReactionCandidateHint',
  'jointReactionGateStatus',
  'jointReactionGateHint',
  'jointReactionObservedVersions',
  'jointReactionNextAction',
  'jointReactionNextActionText',
  'jointReactionIntakeCommand',
  'jointReactionPackageImportCommand',
  'jointReactionLockStatusCommand',
  'jointReactionLockClearCommand',
  'jointReactionEvidenceBoundary',
  '目前僅有合成格式相容性，尚未證明任何實際 ETABS／SAP2000 匯出版本',
  '合成樣本只證明 parser 對已知格式與錯誤案例的相容性',
  'maturityCoverageTotals',
  'traceabilityCatalogCoverage',
  'maturityGlobalGovernance',
  'Global Governance Gates',
  'RVR 信任清冊備份健康',
  'rvrBackupHealthStatus',
  'rvrBackupHealthCheckedAt',
  'rvrBackupHealthBackupAge',
  'rvrBackupHealthReceiptAge',
  'rvrBackupHealthTask',
  'rvrBackupHealthNextRun',
  'rvrBackupHealthIssues',
  'rvrBackupHealthHistoryWrap',
  'renderRvrBackupHealth',
  'renderRvrBackupHealthHistory',
  '../output/audit/rvr-backup-health-status.json',
  '../output/audit/rvr-backup-health-history.json',
  'rvr-backup-health-status',
  'rvr-backup-health-history',
  'data-rvr-health-transition',
  '異常／恢復歷程',
  '只在健康狀態或問題種類改變時新增一筆',
  'history-record-failed',
  'health-check-stale',
  'statusMaxAgeHours',
  '最近一次健康摘要已超過',
  'dashboard-summary-privacy-invalid',
  'containsPaths',
  'containsRegistryContent',
  'containsEvidenceFingerprints',
  '不發布備份位置、檔名、指紋或清冊內容',
  '不代表 Google Drive 已完成遠端同步',
  'GSC 多案件外部歸檔生命週期監測',
  'gsmMonitorHealth',
  'gsmMonitorCheckedAt',
  'gsmMonitorTask',
  'gsmMonitorNextRun',
  'gsmMonitorCurrentCount',
  'gsmMonitorUpcomingCount',
  'gsmMonitorAttentionCount',
  'gsmMonitorInvalidCount',
  'gsmMonitorIssues',
  'gsmMonitorHistoryWrap',
  'renderGsmLifecycleMonitor',
  '../output/audit/gsm-lifecycle-monitor-status.json',
  '../output/audit/gsm-lifecycle-monitor-history.json',
  '../output/audit/gsm-lifecycle-monitor-task-status.json',
  'governance-external-archive-lifecycle-monitor-dashboard-status',
  'governance-external-archive-lifecycle-monitor-dashboard-history',
  'governance-external-archive-lifecycle-monitor-task-dashboard-status',
  'monitor-operation-failed',
  'dashboard-status-stale',
  'containsCaseIdentifiers',
  'containsArchiveMetadata',
  '不發布案件名稱、路徑、保存端資料或任何 GSC／GSP／GSM／GME 指紋',
  'RC 正式附件完整性',
  'attachmentIntegrityStatus',
  'attachmentIntegrityCount',
  'attachmentIntegrityVerified',
  'attachmentIntegrityHash',
  'attachmentIntegrityWrap',
  'renderAttachmentIntegrity',
  './assets/status/report-readiness-status.json',
  '本機失敗 release',
  '公開狀態仍保留 release',
  'SHA-256 不符',
  '檔案缺失',
  '已驗證',
  '建議處置',
  '不要重算 hash',
  '重新輸出缺失附件',
  '清冊多出附件',
  '不要手動刪除清冊項目',
  '複製失敗項目處置清單',
  '不得藉由重算 hash、改寫 bytes 或更新清冊接受異動附件',
  '不含檔名、路徑、hash 或 bytes',
  'attachmentRemediationToolbar',
  'screen-only',
  'attachmentSourceToolHref',
  'data-attachment-source-route',
  '開啟來源工具',
  '附件異常關閉紀錄',
  '沒有診斷的舊紀錄不推測',
  'buildAttachmentIntegrityClosureRecords',
  'loadAttachmentIntegrityClosures',
  'attachmentIntegrityDiagnosticPass',
  'attachmentIntegrityDiagnosticAvailable',
  'data-attachment-closure-status',
  '附件檔案與 SHA-256',
  '不會寫入計算書、列印或 PDF',
  'data-governance-key',
  'payload.globalGovernance?.gates',
  'requiredCatalogFamilies',
  'missingCatalogFamilies',
  'Traceability Catalog Coverage',
  'payload.traceabilityCatalogCoverage',
  'data-catalog-family',
  'maturityEntrypointCoverage',
  'maturityEntrypointHint',
  'maturityOtherGovernanceCoverage',
  'maturityOtherGovernanceHint',
  'maturityOtherGovernanceWrap',
  'otherGovernanceRoutes',
  '<th>governance</th>',
  '<th>boundary tag</th>',
  '<th>preflight keys</th>',
  'maturityBoundaryCoverage',
  'maturityBoundaryHint',
  'maturityBoundaryWrap',
  'boundaryRoutes',
  '<th>boundary rule</th>',
  '<th>matched needles</th>',
  '<th>output</th>',
  '<th>fit</th>',
  '<th>limit</th>',
  '<th>capabilities</th>',
  'payload.entrypointCoverage',
  'maturitySourceTrace',
  'source-trace',
  'source-pill',
  'payload.sourceTrace?.inputs',
  'row.sourceTrace?.sourceHash',
  '<th>source hash</th>',
  'coverage-totals',
  'coverage-total',
  'MATURITY_COVERAGE_TOTALS',
  'Coverage Totals',
  'upgrade-targets',
  'upgradeGaps',
  'upgradePriority',
  'topUpgradeTargets',
  'maturityMultiGoldenCount',
  'maturityMultiGoldenHint',
  '多案例門檻',
  'toolsWithMultipleGoldenCases',
  '升級缺口',
  '升級優先',
  'formatSeconds',
  'formatSlowest',
  'formatCommandHash',
  'formatPreflightSource',
  '受測 commit',
  '啟動工作樹',
  'formatRecordMode',
  'formatRecordWorkdir',
  'commandHash',
  'workdirRelative',
  'reused',
  'payload.latestPreflight.totalSeconds',
  'formatPassedChecks(payload.latestPreflight)',
  'formatPlatformAuditMode(payload.latestPreflight)',
  'formatSlowReuse(payload.latestPreflight)',
  'formatSlowest(payload.latestPreflight)',
  '耗時',
  '平台 audit',
  '慢測重用',
  '最慢檢查',
  '完整檢查',
  '快速檢查',
  '正式放行',
  'preflightTimelineLegend',
  'reportReadinessBoundaryNote',
  '報告閱讀狀態邊界',
  '不會寫入計算書、列印或 PDF。',
  '文件狀態由核可勾選決定',
  '正式交付請以完整檢查或正式放行結果為準。',
  'kpiFreshness',
  'kpiFreshnessHint',
  'kpiReleaseFreshness',
  'kpiReleaseFreshnessHint',
  'kpiDeploymentAlignment',
  'kpiDeploymentAlignmentHint',
  'dataScopeNote',
  'localDetailLinks',
  'requestedAuditScope',
  'isDeploymentManifest',
  "typeof payload.sourceDirty === 'boolean'",
  'resolveDataScope',
  'applyDataScope',
  'renderPublicStatusCard',
  'publicCoverageText',
  'buildPublicEvidence',
  'PublicEvidenceSchema',
  'validatePublicEvidenceBundle',
  'public-evidence-schema.js',
  'renderPublicResources',
  'renderPublicReleaseHistory',
  'publicReleaseHistoryWrap',
  '正式 release 公開歷程',
  'RELEASE_HISTORY_SCHEMA_VERSION',
  'RELEASE_HISTORY_LIMIT',
  "dataScope.scope === 'public'",
  '正式 release 總覽',
  '鋼構正式附件證據',
  'RC 正式附件證據',
  '風震與跨家族交付證據',
  '僅限本機工作區',
  'local-diagnostic-section',
  'body[data-audit-scope="public"]',
  '不請求或公開本機 output',
  'isFormalReleaseSnapshot',
  'renderReleaseTrust',
  '7 日內',
  '30 日內',
  '建議重驗',
  '未部署證據',
  '未對齊',
  '已對齊',
  "manifest?.schemaVersion === 3",
  "fetchJson('../pages-deployment.json')",
  'kpiLatestTime',
  'parseGeneratedAt',
  'ageMinutes',
  '最近一輪巡檢約為',
  '最近一輪巡檢已超過',
  'formatRecordStatusAge',
  'statusAgeHours',
  'statusMaxAgeHours',
  '狀態年齡',
  'escapeAttr',
  'formatPreflightSource',
  'formatPostChecks',
  'postCheckCount',
  'postChecksPassedCount',
  'postCheckFailures',
  'sourceHash',
  'payload.lastSummaryHash',
  'payload.lastSummaryJsonHash',
  'item.summaryJsonHash || item.summaryHash',
  '目前待處理異常',
  '歷史異常（已收斂）',
  '歷史未完成（已收斂）',
  'formatPreflightResolution',
  'resolvedAbnormalCount',
  'unresolvedAbnormalCount',
  'resolvedIncompleteCount',
  'unresolvedIncompleteCount',
  '<th>摘要 hash</th>',
  '<th>post checks</th>',
  'JSON hash',
  '來源'
].forEach(needle => assertIncludes(dashboard, needle, 'audit dashboard preflight history'));

[
  'steelResultReconciliationRequired',
  'rcStandaloneFormalHtmlPrintRequired',
  'deliveryFileIntegrityVerified',
  'publicEvidenceSchemaVersion',
  'readiness.releaseAlignment',
].forEach(needle => assertIncludes(publicEvidenceSchemaSource, needle, 'shared public evidence schema'));

[
  'DashboardStatusPath',
  'DashboardHistoryPath',
  'rvr-backup-health-status.json',
  'rvr-backup-health-history.json',
  'kind = "rvr-backup-health-status"',
  'issueCodes = @($issueCodes)',
  'statusMaxAgeHours = $DashboardStatusMaxAgeHours',
  '--dashboard-history $DashboardHistoryPath',
  'history-record-failed',
  'scope = "local-only"',
  'containsPaths = $false',
  'containsRegistryContent = $false',
].forEach(needle => assertIncludes(rvrHealthLauncher, needle, 'RVR dashboard health summary'));

[
  'DashboardStatusPath',
  'DashboardHistoryPath',
  'DashboardTaskStatusPath',
  'gsm-lifecycle-monitor-status.json',
  'gsm-lifecycle-monitor-history.json',
  'gsm-lifecycle-monitor-task-status.json',
  'status = "untrusted"',
  'containsPaths = $false',
  'containsCaseIdentifiers = $false',
  'containsEvidenceFingerprints = $false',
  'containsArchiveMetadata = $false',
].forEach(needle => assertIncludes(gsmMonitorLauncher, needle, 'GSM dashboard status publisher'));
[
  'configurationMatchesCurrentTool',
  'monitorStateFresh',
  'CurrentMonitorExitCode',
  'task-not-installed',
  'task-configuration-drift',
  'dashboardMaxAgeArgumentPattern',
  'Dashboard output directory chain must be physical.',
  'containsTaskName = $false',
  'containsPaths = $false',
].forEach(needle => assertIncludes(gsmMonitorTaskManager, needle, 'GSM dashboard task publisher'));
assert.equal(gsmMonitorDashboardSchema.$schema, 'https://json-schema.org/draft/2020-12/schema', 'GSM dashboard schema draft');
assert.equal(gsmMonitorDashboardSchema.$defs.status.additionalProperties, false, 'GSM dashboard status closed fields');
assert.equal(gsmMonitorDashboardSchema.$defs.history.additionalProperties, false, 'GSM dashboard history closed fields');
assert.equal(gsmMonitorDashboardSchema.$defs.task.additionalProperties, false, 'GSM dashboard task closed fields');
const rvrDashboardPayloadStart = rvrHealthLauncher.indexOf('$dashboardStatus =');
const rvrDashboardPayloadEnd = rvrHealthLauncher.indexOf('try {', rvrDashboardPayloadStart);
assert.ok(rvrDashboardPayloadStart >= 0 && rvrDashboardPayloadEnd > rvrDashboardPayloadStart, 'RVR dashboard payload source range');
const rvrDashboardPayload = rvrHealthLauncher.slice(rvrDashboardPayloadStart, rvrDashboardPayloadEnd);
[
  'backupDirectory =',
  'backupPath =',
  'receiptPath =',
  'backupFingerprint =',
  'registryFingerprint =',
  'receiptFingerprint =',
  'issues =',
].forEach(needle => assert.equal(rvrDashboardPayload.includes(needle), false, `RVR dashboard payload excludes ${needle}`));

[
  ['/rc-beam', '../鋼筋混凝土/tools/beam.html', '鋼筋混凝土/tools/beam.html'],
  ['/rc-column', '../鋼筋混凝土/tools/column.html', '鋼筋混凝土/tools/column.html'],
  ['/rc-slab', '../鋼筋混凝土/tools/slab.html', '鋼筋混凝土/tools/slab.html'],
  ['/rc-wall', '../鋼筋混凝土/tools/wall.html', '鋼筋混凝土/tools/wall.html'],
  ['/rc-shear-wall', '../鋼筋混凝土/tools/shear-wall.html', '鋼筋混凝土/tools/shear-wall.html'],
  ['/rc-foundation', '../鋼筋混凝土/tools/foundation.html', '鋼筋混凝土/tools/foundation.html'],
  ['/rc-pile', '../鋼筋混凝土/tools/single-pile-designer.html', '鋼筋混凝土/tools/single-pile-designer.html'],
  ['/rc-retrofit-section', '../RC補強斷面性質.html', 'RC補強斷面性質.html'],
].forEach(([route, href, sourceFile]) => {
  assertIncludes(dashboard, `'${route}': '${href}'`, `attachment source whitelist ${route}`);
  assert.ok(fs.existsSync(repoFile(sourceFile)), `attachment source file exists: ${sourceFile}`);
});
assertIncludes(dashboard, "return sourceTools[String(route || '').trim()] || '';", 'attachment source whitelist rejects unknown routes');

const preflightTools = readText(repoFile('preflight-tools.ps1'));
[
  '$summaryLines.Add("- $($record.label): pass=$($record.pass), exitCode=$($record.exitCode), seconds=$($record.seconds), mode=$($record.mode), reused=$($record.reused), workdir=$($record.workdirRelative), commandHash=$($record.commandHash), log=$($record.log), historyLog=$($record.historyLog)")',
  '$failures.Add("$($record.key): exitCode=$($record.exitCode), mode=$($record.mode), reused=$($record.reused), workdir=$($record.workdirRelative), commandHash=$($record.commandHash), log=$($record.log), historyLog=$($record.historyLog)")',
  '$summaryMetricLines.Add("  - $($record.key): seconds=$($record.seconds), pass=$($record.pass), mode=$($record.mode), reused=$($record.reused), workdir=$($record.workdirRelative), commandHash=$($record.commandHash), log=$($record.log), historyLog=$($record.historyLog)")',
  '$summaryMetricLines.Add("- recordsCount: $runRecordsCount")',
  '$summaryMetricLines.Add("- passedCount: $runPassedCount")',
  'recordsCount = $runRecordsCount',
  'passedCount = $runPassedCount',
  'mode = "run-command"',
  'mode = "workdir-missing"',
  'reused = $false',
  'mode = $mode',
  'reused = $reused',
  '$recordReused = [bool]$record.reused',
  'Get-PreflightRelativePath',
  'workdir = $Workdir',
  'workdirRelative = Get-PreflightRelativePath $Workdir',
  'workdir = [string]$Check.workdir',
  'workdirRelative = Get-PreflightRelativePath ([string]$Check.workdir)',
  'workdirRelative = [string]$record.workdirRelative',
  'command = $Command',
  'commandHash = Get-CommandHash $Command',
  'script = $scriptPath',
  'command = [string]$Check.command',
  'commandHash = Get-CommandHash ([string]$Check.command)',
  'commandHash=$($record.commandHash)',
  'Get-PreflightRunTextLogs',
  'Add-PreflightIncompleteHistoryItem',
  'completedCount = $completedCount',
  'inProgressCount = $inProgressCount',
  'incompleteCount = $incompleteCount',
  'resolvedIncompleteCount = $resolvedIncompleteCount',
  'unresolvedIncompleteCount = $unresolvedIncompleteCount',
  'abnormalCount = $abnormalCount',
  'resolvedAbnormalCount = $resolvedAbnormalCount',
  'unresolvedAbnormalCount = $unresolvedAbnormalCount',
  'resolvedByRunId',
  'resolvedAt',
  'successfulReleaseRuns',
  'incompleteReason = $Reason',
  'historyLog = [string]$record.historyLog',
  'failedKeys = @($runFailedKeys.ToArray())',
  'slowReuseCount = $runSlowReuseKeys.Count',
  'slowReuseKeys = @($runSlowReuseKeys.ToArray())',
  'platformAuditMode = $runPlatformAuditMode',
  'platformAuditReused = $runPlatformAuditReused',
  'platformAuditDecisionPath = $runPlatformAuditDecisionPath',
  '- failedKeys:',
  '- slowReuseCount:',
  '- platformAuditMode:',
  'function Write-JsonFile',
  'function Get-TextFileLines',
  'audit-dashboard-contract-final',
  'Audit dashboard final output contract',
  'audit-dashboard-browser-smoke-final',
  'Audit dashboard final browser smoke',
  'audit-dashboard-live-output-smoke-final',
  'Audit dashboard final live-output smoke',
  '--live-output',
  '$finalLiveOutputSmokeRecord = Invoke-PreflightCheck',
  '$finalBrowserSmokeRecord = Invoke-PreflightCheck',
  'Update-PreflightHistoryManifest',
  ' = Invoke-PreflightCheck',
  'Publish-PreflightPostChecks -Checks @($postCheckRecords.ToArray()) | Out-Null',
  'function Publish-PreflightPostChecks',
  '$finalContractRecord = Invoke-PreflightCheck',
  'Join-Path $outputDir "post-checks.json"',
  'Join-Path $runDir "post-checks.json"',
  '$payload["postCheckCount"] = $checksArray.Count',
  '$postCheckCount = $postCheckState.count',
  '$payload["postChecksPassedCount"] = $passedCount',
  '$payload["postCheckFailures"] = @($failedKeys)',
  '$payload["postChecks"] = @($checksArray)',
  '$postCheckSummaryLines = @($postCheckState.summaryLines)',
  'postCheckCount: $($checksArray.Count)',
  '$postSummaryMatrixProc = Start-Process',
  'tool-maturity-matrix-final.stdout.txt',
  'tool-maturity-matrix-final-refresh',
  'function Write-TextFile',
  'Write-TextFile -Path $latestLog -Value $message',
  'Write-TextFile -Path $latestLog -Value $lines',
  'Write-TextFile -Path $historyMarkdownPath -Value $historyLines',
  'Write-TextFile -Path $summaryPath -Value $summaryContent',
  '$slowStatusMaxAgeHours = 24',
  '$statusAgeHours = [Math]::Round(((Get-Date) - $checkedAt).TotalHours, 2)',
  'status older than $slowStatusMaxAgeHours hours',
  'statusAgeHours = $statusAgeHours',
  'statusMaxAgeHours = $slowStatusMaxAgeHours',
  'statusAgeHours=$($decision.statusAgeHours)',
  'statusMaxAgeHours=$($decision.statusMaxAgeHours)',
  'chcp.com 65001 > $null',
  'function Remove-PreflightAnsiEscape',
  'function Get-ForbiddenLogGlyphCount',
  'function Repair-PreflightMojibake',
  '[System.Text.Encoding]::GetEncoding(950)',
  '$stdoutText = Remove-PreflightAnsiEscape (Repair-PreflightMojibake',
  '$stderrText = Remove-PreflightAnsiEscape (Repair-PreflightMojibake',
  'Get-Content -Path $stdoutPath -Raw -Encoding UTF8',
  'Get-Content -Path $stderrPath -Raw -Encoding UTF8',
  '[System.IO.File]::WriteAllText($latestLog, $output, [System.Text.UTF8Encoding]::new($false))',
  '[System.IO.File]::WriteAllText($historyLog, $output, [System.Text.UTF8Encoding]::new($false))',
  '$forbiddenLogPattern =',
  'log contains mojibake/control glyphs',
  '$env:PYTHONUTF8 = "1"',
  '$env:PYTHONIOENCODING = "utf-8"',
  '$env:NO_COLOR = "1"',
  '$env:FORCE_COLOR = "0"',
  '$env:CI = "1"',
  '[System.Text.UTF8Encoding]::new($false)'
].forEach(needle => assertIncludes(preflightTools, needle, 'preflight markdown history log traceability'));
[
  '| runId | state | resolution | generatedAt | quick | source commit | branch | dirty | pass | failures | failed keys | passed / checks | duration(s) | platform audit | slow reuse | slow reuse keys | slowest | summary | summary json | summary hash | post checks | summary json hash |',
  '$sourceCommitText = if ($item.sourceCommitSha)',
  '$sourceBranchText = if ($item.sourceBranch)',
  '$($item.passedCount) / $($item.recordsCount)',
  '$failedKeyText = Format-HistoryMarkdownListCell @($item.failedKeys)',
  '$slowReuseKeyText = Format-HistoryMarkdownListCell @($item.slowReuseKeys)',
  '$summaryJsonPathText = Format-HistoryMarkdownCell $item.summaryJsonPath',
  '$summaryHashText = Format-HistoryHashCell $item.summaryHash',
  '$summaryJsonHashText = Format-HistoryHashCell $item.summaryJsonHash',
  '$postCheckText = if ($item.postCheckCount -gt 0)',
  'summaryHash = $summaryHash',
  'summaryJsonHash = $summaryJsonHash',
  'summaryMtime = $summaryMtime',
  'summaryJsonMtime = $summaryJsonMtime',
  'attachmentIntegrityDiagnosticAvailable = [bool]$attachmentIntegrityDiagnosticAvailable',
  'rendered-delivery-evidence\\attachment-integrity-diagnostic.json',
  'historyLog = [string]$record.historyLog'
].forEach(needle => assertIncludes(preflightTools, needle, 'preflight history markdown diagnostics'));

const platformAuditPreflight = readText(repoFile('platform-audit-preflight.ps1'));
[
  '$decisionLogPath = "output\\preflight\\platform-audit-decision.json"',
  'Write-Output "decision=$decisionLogPath"',
  'function Write-JsonFile',
  'function Get-FileHashSha256',
  'Get-DecisionSourceTrace',
  'sourceTrace = Get-DecisionSourceTrace',
  'Get-PlatformComponentResults',
  'statusHash',
  'summaryHash',
  '[System.Text.UTF8Encoding]::new($false)'
].forEach(needle => assertIncludes(platformAuditPreflight, needle, 'platform audit decision log path'));
const refreshPlatformStatus = readText(repoFile('refresh-platform-status.ps1'));
[
  'function Write-JsonFile',
  'function Write-TextFile',
  'function Get-FileHashSha256',
  'sourceTrace = [ordered]@{',
  'lastSummaryHash',
  'summaryJsonHash',
  'statusHash',
  'summaryHash',
  '$decisionPath = Join-Path $preflightOutputDir "platform-audit-decision.json"',
  'mode = "component-status-refresh"',
  'components = @($records.ToArray())',
  'Write-JsonFile -Path $decisionPath -Value $decisionPayload -Depth 10',
  '[System.Text.UTF8Encoding]::new($false)'
].forEach(needle => assertIncludes(refreshPlatformStatus, needle, 'platform status JSON writer'));
const latestPreflightSummaryPath = repoFile('output/preflight/preflight-summary.json');
const latestPreflightSummaryForPlatformLog = fs.existsSync(latestPreflightSummaryPath) ? readJson(latestPreflightSummaryPath) : null;
const latestPlatformAuditRecord = Array.isArray(latestPreflightSummaryForPlatformLog?.records)
  ? latestPreflightSummaryForPlatformLog.records.find(record => record.key === 'platform-audit')
  : null;
if (latestPlatformAuditRecord?.log && latestPlatformAuditRecord.mode === 'reuse-status') {
  const platformAuditLatestLogPath = path.isAbsolute(latestPlatformAuditRecord.log)
    ? latestPlatformAuditRecord.log
    : repoFile(latestPlatformAuditRecord.log);
  assert.ok(fs.existsSync(platformAuditLatestLogPath), 'latest platform audit record log exists');
  const platformAuditLog = readText(platformAuditLatestLogPath);
  assertIncludes(
    platformAuditLog,
    'decision=output\\preflight\\platform-audit-decision.json',
    'platform audit decision log path'
  );
  assert.equal(/decision=[A-Z]:\\/i.test(platformAuditLog), false, 'platform audit decision log should be repo-relative');
}

assertUtf8NoBomWhenFresh(latestPreflightSummaryPath, repoFile('preflight-tools.ps1'), 'latest preflight summary JSON');
if (fs.existsSync(latestPreflightSummaryPath)) {
  const latestSummary = readJson(latestPreflightSummaryPath);
  const latestSummaryFresh = fs.statSync(latestPreflightSummaryPath).mtimeMs >= fs.statSync(repoFile('preflight-tools.ps1')).mtimeMs - 1000;
  if (Object.prototype.hasOwnProperty.call(latestSummary, 'recordsCount') || Object.prototype.hasOwnProperty.call(latestSummary, 'passedCount')) {
    assert.equal(Number.isInteger(latestSummary.recordsCount), true, 'latest preflight recordsCount integer');
    assert.equal(Number.isInteger(latestSummary.passedCount), true, 'latest preflight passedCount integer');
    assert.equal(latestSummary.recordsCount, latestSummary.records.length, 'latest preflight recordsCount matches records');
    assert.equal(
      latestSummary.passedCount,
      latestSummary.records.filter(record => record.pass === true).length,
      'latest preflight passedCount matches records'
    );
  }
  if (latestSummaryFresh) {
    assert.match(latestSummary.sourceCommitSha, /^[0-9a-f]{40}$/i, 'latest preflight sourceCommitSha git sha');
    assert.equal(typeof latestSummary.sourceBranch, 'string', 'latest preflight sourceBranch string');
    assert.equal(typeof latestSummary.sourceDirty, 'boolean', 'latest preflight sourceDirty boolean');
    assert.ok(Array.isArray(latestSummary.failedKeys), 'latest preflight failedKeys array');
    assert.ok(Array.isArray(latestSummary.slowReuseKeys), 'latest preflight slowReuseKeys array');
    assert.equal(Number.isInteger(latestSummary.slowReuseCount), true, 'latest preflight slowReuseCount integer');
    const failedKeys = latestSummary.records.filter(record => record.pass !== true).map(record => record.key).sort();
    const reusedKeys = latestSummary.records.filter(record => record.reused === true).map(record => record.key).sort();
    assert.deepEqual([...latestSummary.failedKeys].sort(), failedKeys, 'latest preflight failedKeys match failed records');
    assert.equal(latestSummary.slowReuseCount, reusedKeys.length, 'latest preflight slowReuseCount matches reused records');
    assert.deepEqual([...latestSummary.slowReuseKeys].sort(), reusedKeys, 'latest preflight slowReuseKeys match reused records');
    assert.equal(typeof latestSummary.platformAuditMode, 'string', 'latest preflight platformAuditMode string');
    assert.ok(typeof latestSummary.platformAuditReused === 'boolean' || latestSummary.platformAuditReused === null, 'latest preflight platformAuditReused boolean or null');
    assert.equal(typeof latestSummary.platformAuditDecisionPath, 'string', 'latest preflight platformAuditDecisionPath string');
  }

  const commandTraceRecords = latestSummary.records.filter(record =>
    Object.prototype.hasOwnProperty.call(record, 'command') ||
    Object.prototype.hasOwnProperty.call(record, 'commandHash') ||
    Object.prototype.hasOwnProperty.call(record, 'script')
  );
  if (commandTraceRecords.length) {
    assert.equal(commandTraceRecords.length, latestSummary.records.length, 'latest preflight command trace on every record');
    for (const record of latestSummary.records) {
      assert.equal(typeof record.command, 'string', `latest preflight record command string: ${record.key}`);
      assert.ok(record.command.trim().length > 0, `latest preflight record command populated: ${record.key}`);
      assert.match(record.commandHash, /^[0-9a-f]{64}$/i, `latest preflight record commandHash sha256: ${record.key}`);
      assert.equal(typeof record.script, 'string', `latest preflight record script string: ${record.key}`);
    }
  }
  const modeTraceRecords = latestSummary.records.filter(record =>
    Object.prototype.hasOwnProperty.call(record, 'mode') ||
    Object.prototype.hasOwnProperty.call(record, 'reused')
  );
  if (modeTraceRecords.length) {
    assert.equal(modeTraceRecords.length, latestSummary.records.length, 'latest preflight mode trace on every record');
    for (const record of latestSummary.records) {
      assert.equal(typeof record.mode, 'string', `latest preflight record mode string: ${record.key}`);
      assert.ok(record.mode.trim().length > 0, `latest preflight record mode populated: ${record.key}`);
      assert.equal(typeof record.reused, 'boolean', `latest preflight record reused boolean: ${record.key}`);
    }
  }
  const reusedRecords = latestSummary.records.filter(record => record.reused === true);
  for (const record of reusedRecords) {
    assert.equal(typeof record.statusCheckedAt, 'string', `latest preflight reused record statusCheckedAt string: ${record.key}`);
    assert.ok(record.statusCheckedAt.trim().length > 0, `latest preflight reused record statusCheckedAt populated: ${record.key}`);
    assert.equal(typeof record.statusAgeHours, 'number', `latest preflight reused record statusAgeHours number: ${record.key}`);
    assert.equal(typeof record.statusMaxAgeHours, 'number', `latest preflight reused record statusMaxAgeHours number: ${record.key}`);
    assert.ok(record.statusAgeHours <= record.statusMaxAgeHours, `latest preflight reused record status age within max age: ${record.key}`);
  }

  const workdirTraceRecords = latestSummary.records.filter(record =>
    Object.prototype.hasOwnProperty.call(record, 'workdir') ||
    Object.prototype.hasOwnProperty.call(record, 'workdirRelative')
  );
  if (workdirTraceRecords.length) {
    assert.equal(workdirTraceRecords.length, latestSummary.records.length, 'latest preflight workdir trace on every record');
    for (const record of latestSummary.records) {
      assert.equal(typeof record.workdir, 'string', `latest preflight record workdir string: ${record.key}`);
      assert.ok(record.workdir.trim().length > 0, `latest preflight record workdir populated: ${record.key}`);
      assert.equal(typeof record.workdirRelative, 'string', `latest preflight record workdirRelative string: ${record.key}`);
      assert.ok(record.workdirRelative.trim().length > 0, `latest preflight record workdirRelative populated: ${record.key}`);
    }
  }
  assert.equal(typeof latestSummary.totalSeconds, 'number', 'latest preflight totalSeconds number');
  assert.equal(typeof latestSummary.slowestKey, 'string', 'latest preflight slowestKey string');
  assert.equal(typeof latestSummary.slowestSeconds, 'number', 'latest preflight slowestSeconds number');
  assert.ok(Array.isArray(latestSummary.slowestRecords), 'latest preflight slowestRecords array');
  assert.ok(latestSummary.slowestRecords.length > 0, 'latest preflight slowestRecords populated');
  assert.ok(latestSummary.slowestRecords[0].key, 'latest preflight slowest record key');
  assert.equal(typeof latestSummary.slowestRecords[0].seconds, 'number', 'latest preflight slowest record seconds');
  assertPreflightRecordLogs(latestSummary, latestPreflightSummaryPath);
}

const preflightHistoryPath = repoFile('output/preflight/preflight-history.json');
assertUtf8NoBomWhenFresh(preflightHistoryPath, repoFile('preflight-tools.ps1'), 'preflight history JSON');
const platformAuditDecisionPath = repoFile('output/preflight/platform-audit-decision.json');
assertUtf8NoBomWhenFresh(platformAuditDecisionPath, repoFile('platform-audit-preflight.ps1'), 'platform audit decision JSON');
const platformStatusPath = repoFile('output/audit/platform-status.json');
assertUtf8NoBomWhenFresh(platformStatusPath, repoFile('refresh-platform-status.ps1'), 'platform status JSON');
const platformSummaryPath = repoFile('output/audit/platform-summary.json');
assertUtf8NoBomWhenFresh(platformSummaryPath, repoFile('refresh-platform-status.ps1'), 'platform summary JSON');
const platformHistoryPath = repoFile('output/audit/platform-history.json');
assertUtf8NoBomWhenFresh(platformHistoryPath, repoFile('refresh-platform-status.ps1'), 'platform history JSON');
if (fs.existsSync(preflightHistoryPath)) {
  const preflightHistory = readJson(preflightHistoryPath);
  assertHistoryManifestShape(preflightHistory, 'preflight history');
  assert.equal(Number.isInteger(preflightHistory.completedCount), true, 'preflight history completedCount integer');
  assert.equal(Number.isInteger(preflightHistory.inProgressCount), true, 'preflight history inProgressCount integer');
  assert.equal(Number.isInteger(preflightHistory.incompleteCount), true, 'preflight history incompleteCount integer');
  assert.equal(Number.isInteger(preflightHistory.resolvedIncompleteCount), true, 'preflight history resolvedIncompleteCount integer');
  assert.equal(Number.isInteger(preflightHistory.unresolvedIncompleteCount), true, 'preflight history unresolvedIncompleteCount integer');
  assert.equal(Number.isInteger(preflightHistory.abnormalCount), true, 'preflight history abnormalCount integer');
  assert.equal(Number.isInteger(preflightHistory.resolvedAbnormalCount), true, 'preflight history resolvedAbnormalCount integer');
  assert.equal(Number.isInteger(preflightHistory.unresolvedAbnormalCount), true, 'preflight history unresolvedAbnormalCount integer');
  assert.equal(preflightHistory.completedCount, preflightHistory.items.filter(item => item.complete !== false).length, 'preflight history completedCount matches items');
  assert.equal(preflightHistory.inProgressCount, preflightHistory.items.filter(item => item.inProgress === true).length, 'preflight history inProgressCount matches items');
  assert.equal(preflightHistory.incompleteCount, preflightHistory.items.filter(item => item.incomplete === true).length, 'preflight history incompleteCount matches items');
  assert.equal(preflightHistory.resolvedIncompleteCount, preflightHistory.items.filter(item => item.incomplete === true && item.resolved === true).length, 'preflight history resolvedIncompleteCount matches items');
  assert.equal(preflightHistory.unresolvedIncompleteCount, preflightHistory.items.filter(item => item.incomplete === true && item.resolved !== true).length, 'preflight history unresolvedIncompleteCount matches items');
  assert.equal(preflightHistory.resolvedIncompleteCount + preflightHistory.unresolvedIncompleteCount, preflightHistory.incompleteCount, 'preflight history resolution counts reconcile');
  assert.equal(preflightHistory.abnormalCount, preflightHistory.items.filter(item => item.pass !== true && item.inProgress !== true).length, 'preflight history abnormalCount matches items');
  assert.equal(preflightHistory.resolvedAbnormalCount, preflightHistory.items.filter(item => item.pass !== true && item.inProgress !== true && item.resolved === true).length, 'preflight history resolvedAbnormalCount matches items');
  assert.equal(preflightHistory.unresolvedAbnormalCount, preflightHistory.items.filter(item => item.pass !== true && item.inProgress !== true && item.resolved !== true).length, 'preflight history unresolvedAbnormalCount matches items');
  assert.equal(preflightHistory.resolvedAbnormalCount + preflightHistory.unresolvedAbnormalCount, preflightHistory.abnormalCount, 'preflight history abnormal resolution counts reconcile');
  assert.ok(preflightHistory.resolvedAbnormalCount >= preflightHistory.resolvedIncompleteCount, 'preflight history resolved abnormal count covers resolved incomplete subset');
  for (const [index, item] of preflightHistory.items.entries()) {
    assert.equal(typeof item.state, 'string', `preflight history item ${index} state string`);
    assert.equal(typeof item.complete, 'boolean', `preflight history item ${index} complete boolean`);
    assert.equal(typeof item.inProgress, 'boolean', `preflight history item ${index} inProgress boolean`);
    assert.equal(typeof item.incomplete, 'boolean', `preflight history item ${index} incomplete boolean`);
    assert.equal(typeof item.incompleteReason, 'string', `preflight history item ${index} incompleteReason string`);
    assert.equal(typeof item.resolved, 'boolean', `preflight history item ${index} resolved boolean`);
    assert.equal(typeof item.resolvedByRunId, 'string', `preflight history item ${index} resolvedByRunId string`);
    assert.equal(typeof item.resolvedAt, 'string', `preflight history item ${index} resolvedAt string`);
    if (item.resolved) {
      assert.equal(item.pass, false, `preflight history item ${index} resolved item preserves original failure`);
      assert.equal(item.inProgress, false, `preflight history item ${index} resolved item is not in progress`);
      assert.match(item.resolvedByRunId, /^\d{8}-\d{6}$/, `preflight history item ${index} resolvedByRunId`);
      assert.ok(item.resolvedByRunId > item.runId, `preflight history item ${index} resolved by later run`);
      assert.ok(item.resolvedAt, `preflight history item ${index} resolvedAt`);
    }
    if (item.complete === false) {
      assert.ok(['in-progress', 'incomplete', 'invalid-summary'].includes(item.state), `preflight history item ${index} incomplete state`);
      assert.ok(Array.isArray(item.logFiles), `preflight history item ${index} logFiles array`);
      if (item.incomplete === true) {
        assert.ok(item.incompleteReason, `preflight history item ${index} incomplete reason`);
        assert.deepEqual(item.failedKeys, [item.incompleteReason], `preflight history item ${index} incomplete failedKeys`);
      }
    }
    assert.equal(Number.isInteger(item.postCheckCount), true, `preflight history item ${index} postCheckCount integer`);
    assert.equal(Number.isInteger(item.postChecksPassedCount), true, `preflight history item ${index} postChecksPassedCount integer`);
    assert.ok(Array.isArray(item.postCheckFailures), `preflight history item ${index} postCheckFailures array`);
    assert.ok(Array.isArray(item.postChecks), `preflight history item ${index} postChecks array`);
    assert.equal(item.postCheckCount, item.postChecks.length, `preflight history item ${index} postCheckCount matches postChecks length`);
    assert.equal(item.postChecksPassedCount, item.postChecks.filter(check => check.pass === true).length, `preflight history item ${index} postChecksPassedCount matches pass flags`);
    assert.deepEqual([...item.postCheckFailures].sort(), item.postChecks.filter(check => check.pass !== true).map(check => String(check.key)).sort(), `preflight history item ${index} postCheckFailures match failed keys`);
    const wrappedPostChecks = item.postChecks.filter(check => check && typeof check === 'object' && Object.prototype.hasOwnProperty.call(check, 'value') && Object.prototype.hasOwnProperty.call(check, 'Count'));
    assert.deepEqual(wrappedPostChecks, [], `preflight history item ${index} postChecks must not contain PowerShell value/Count wrappers`);
  }
  if (preflightHistory.items.length) {
    const latestHistoryItem = preflightHistory.items[0];
    if (latestHistoryItem.complete === false) {
      assert.ok(['in-progress', 'incomplete', 'invalid-summary'].includes(latestHistoryItem.state), `preflight latest history incomplete state: ${latestHistoryItem.state}`);
    }
    const latest = preflightHistory.items.find(item => item.complete !== false) || latestHistoryItem;
    assert.equal(typeof latest.quick, 'boolean', 'preflight quick boolean');
    assert.equal(Number.isInteger(latest.recordsCount), true, 'preflight recordsCount integer');
    assert.equal(Number.isInteger(latest.passedCount), true, 'preflight passedCount integer');
    assert.equal(typeof latest.totalSeconds, 'number', 'preflight totalSeconds number');
    assert.equal(typeof latest.forcePlatformAudit, 'boolean', 'preflight forcePlatformAudit boolean');
    assert.equal(typeof latest.forceSlowChecks, 'boolean', 'preflight forceSlowChecks boolean');
    if (Object.prototype.hasOwnProperty.call(latest, 'sourceCommitSha')) {
      assert.equal(typeof latest.sourceCommitSha, 'string', 'preflight sourceCommitSha string');
      assert.equal(typeof latest.sourceBranch, 'string', 'preflight sourceBranch string');
      assert.equal(typeof latest.sourceDirty, 'boolean', 'preflight sourceDirty boolean');
      if (latest.sourceCommitSha) assert.match(latest.sourceCommitSha, /^[0-9a-f]{40}$/i, 'preflight sourceCommitSha git sha');
    }
    assert.equal(typeof latest.platformAuditMode, 'string', 'preflight platformAuditMode string');
    assert.equal(Number.isInteger(latest.slowReuseCount), true, 'preflight slowReuseCount integer');
    assert.equal(typeof latest.slowestKey, 'string', 'preflight slowestKey string');
    assert.equal(typeof latest.slowestSeconds, 'number', 'preflight slowestSeconds number');
    assert.ok(Array.isArray(latest.failedKeys), 'preflight failedKeys array');
    assert.ok(Array.isArray(latest.slowReuseKeys), 'preflight slowReuseKeys array');
    if (fs.existsSync(latestPreflightSummaryPath)) {
      const summaryForHistory = readJson(latestPreflightSummaryPath);
      if (Array.isArray(summaryForHistory.records) && summaryForHistory.records.some(record => Object.prototype.hasOwnProperty.call(record, 'reused'))) {
        const reusedKeys = summaryForHistory.records.filter(record => record.reused === true).map(record => record.key).sort();
        assert.deepEqual([...latest.slowReuseKeys].sort(), reusedKeys, 'preflight history slowReuseKeys match record reused flags');
      }
    }
    assert.ok(Array.isArray(latest.slowestRecords), 'preflight slowestRecords array');
    assert.ok(latest.slowestRecords.length > 0, 'preflight slowestRecords populated');
    assert.ok(latest.slowestRecords[0].key, 'preflight slowest record key');
    assert.equal(typeof latest.slowestRecords[0].seconds, 'number', 'preflight slowest record seconds');
    assertFileHashField(latest, 'summaryHash', 'summaryPath', 'preflight history latest summary');
    assertFileHashField(latest, 'summaryJsonHash', 'summaryJsonPath', 'preflight history latest summary JSON');
    assert.equal(typeof latest.summaryMtime, 'string', 'preflight history latest summaryMtime string');
    assert.equal(typeof latest.summaryJsonMtime, 'string', 'preflight history latest summaryJsonMtime string');
    const preflightToolsMtime = fs.statSync(repoFile('preflight-tools.ps1')).mtimeMs;
    const preflightHistoryFresh = fs.statSync(preflightHistoryPath).mtimeMs >= preflightToolsMtime - 1000;
    const latestSummaryFresh = latest.summaryJsonMtime ? Date.parse(latest.summaryJsonMtime) >= preflightToolsMtime - 1000 : false;
    const latestPostChecksPath = path.join(path.dirname(resolveFileReference(latest.summaryJsonPath, 'preflight history latest summaryJsonPath')), 'post-checks.json');
    if (preflightHistoryFresh && latestSummaryFresh && fs.existsSync(latestPostChecksPath)) {
      assert.equal(Number.isInteger(latest.postCheckCount), true, 'preflight postCheckCount integer');
      assert.equal(Number.isInteger(latest.postChecksPassedCount), true, 'preflight postChecksPassedCount integer');
      assert.ok(Array.isArray(latest.postCheckFailures), 'preflight postCheckFailures array');
      assert.ok(Array.isArray(latest.postChecks), 'preflight postChecks array');
      assert.equal(latest.postCheckCount, latest.postChecks.length, 'preflight postCheckCount matches postChecks length');
      assert.equal(
        latest.postChecksPassedCount,
        latest.postChecks.filter(check => check.pass === true).length,
        'preflight postChecksPassedCount matches passing post checks'
      );
      assert.deepEqual(
        [...latest.postCheckFailures].sort(),
        latest.postChecks.filter(check => check.pass !== true).map(check => String(check.key)).sort(),
        'preflight postCheckFailures match failed post checks'
      );
      if (latest.postCheckCount > 0) {
        const postChecksPath = latestPostChecksPath;
        assert.ok(fs.existsSync(postChecksPath), `preflight post-checks.json exists: ${postChecksPath}`);
        assert.equal(hasUtf8Bom(postChecksPath), false, 'preflight post-checks.json should be UTF-8 without BOM');
        const requirePassingPostChecks = latest.pass === true;
        const finalContract = latest.postChecks.find(check => check.key === 'audit-dashboard-contract-final');
        assert.ok(finalContract, 'preflight postChecks include final dashboard contract');
        if (requirePassingPostChecks) assert.equal(finalContract.pass, true, 'preflight final dashboard contract passed');
        assertSha256(finalContract.commandHash, 'preflight final dashboard contract commandHash');
        for (const [kind, logPath] of [['latest', finalContract.log], ['history', finalContract.historyLog]]) {
          assert.ok(logPath, `preflight final dashboard contract ${kind} log path`);
          assert.ok(fs.existsSync(logPath), `preflight final dashboard contract ${kind} log exists`);
          assert.equal(hasUtf8Bom(logPath), false, `preflight final dashboard contract ${kind} log should be UTF-8 without BOM`);
        }
        const finalBrowserSmoke = latest.postChecks.find(check => check.key === 'audit-dashboard-browser-smoke-final');
        if (latest.quick === false) {
          assert.ok(finalBrowserSmoke, 'full preflight postChecks include final dashboard browser smoke');
          if (requirePassingPostChecks) assert.equal(finalBrowserSmoke.pass, true, 'preflight final dashboard browser smoke passed');
          assertSha256(finalBrowserSmoke.commandHash, 'preflight final dashboard browser smoke commandHash');
          for (const [kind, logPath] of [['latest', finalBrowserSmoke.log], ['history', finalBrowserSmoke.historyLog]]) {
            assert.ok(logPath, `preflight final dashboard browser smoke ${kind} log path`);
            assert.ok(fs.existsSync(logPath), `preflight final dashboard browser smoke ${kind} log exists`);
            assert.equal(hasUtf8Bom(logPath), false, `preflight final dashboard browser smoke ${kind} log should be UTF-8 without BOM`);
          }
          const finalLiveOutputSmoke = latest.postChecks.find(check => check.key === 'audit-dashboard-live-output-smoke-final');
          assert.ok(finalLiveOutputSmoke, 'full preflight postChecks include final dashboard live-output smoke');
          if (requirePassingPostChecks) assert.equal(finalLiveOutputSmoke.pass, true, 'preflight final dashboard live-output smoke passed');
          assertSha256(finalLiveOutputSmoke.commandHash, 'preflight final dashboard live-output smoke commandHash');
          for (const [kind, logPath] of [['latest', finalLiveOutputSmoke.log], ['history', finalLiveOutputSmoke.historyLog]]) {
            assert.ok(logPath, `preflight final dashboard live-output smoke ${kind} log path`);
            assert.ok(fs.existsSync(logPath), `preflight final dashboard live-output smoke ${kind} log exists`);
            assert.equal(hasUtf8Bom(logPath), false, `preflight final dashboard live-output smoke ${kind} log should be UTF-8 without BOM`);
          }
          const liveOutputLog = readText(resolveFileReference(finalLiveOutputSmoke.historyLog, 'preflight final dashboard live-output smoke history log'));
          const liveOutputPostCheckIndex = latest.postChecks.findIndex(check => check.key === 'audit-dashboard-live-output-smoke-final');
          assert.ok(liveOutputPostCheckIndex > 0, 'preflight final live-output postCheck order after provisional checks');
          if (finalLiveOutputSmoke.pass === true) {
            assert.ok(liveOutputLog.includes(`liveRunId=${latest.runId}`), `preflight final dashboard live-output smoke read current runId: ${liveOutputLog}`);
            const livePostChecksMatch = liveOutputLog.match(/livePostChecks=(\d+)\/(\d+)/);
            const liveHistoryPostChecksMatch = liveOutputLog.match(/liveHistoryPostChecks=(\d+)\/(\d+)/);
            const liveHistoryRunsMatch = liveOutputLog.match(/livePostCheckHistoryRuns=([^\)\r\n,]+)/);
            assert.ok(livePostChecksMatch, `preflight final dashboard live-output log exposes livePostChecks: ${liveOutputLog}`);
            assert.ok(liveHistoryPostChecksMatch, `preflight final dashboard live-output log exposes liveHistoryPostChecks: ${liveOutputLog}`);
            assert.ok(liveHistoryRunsMatch, `preflight final dashboard live-output log exposes livePostCheckHistoryRuns: ${liveOutputLog}`);
            const expectedProvisionalPostCheckCount = liveOutputPostCheckIndex;
            assert.equal(Number(livePostChecksMatch[1]), expectedProvisionalPostCheckCount, 'preflight final live-output saw provisional postChecks passed count');
            assert.equal(Number(livePostChecksMatch[2]), expectedProvisionalPostCheckCount, 'preflight final live-output saw provisional postChecks total count');
            assert.equal(Number(liveHistoryPostChecksMatch[1]), expectedProvisionalPostCheckCount, 'preflight final live-output saw provisional history postChecks passed count');
            assert.equal(Number(liveHistoryPostChecksMatch[2]), expectedProvisionalPostCheckCount, 'preflight final live-output saw provisional history postChecks total count');
            assert.ok(liveHistoryRunsMatch[1].split('|').includes(latest.runId), `preflight final live-output history run list includes ${latest.runId}: ${liveHistoryRunsMatch[1]}`);
          } else {
            assert.notEqual(Number(finalLiveOutputSmoke.exitCode), 0, 'failed final live-output smoke records non-zero exitCode');
            assert.ok(/(?:AssertionError|Error|failed)/i.test(liveOutputLog), `failed final live-output smoke preserves readable diagnostics: ${liveOutputLog}`);
          }
        }
      }
    }
  }
}

if (fs.existsSync(platformStatusPath)) {
  const platformStatus = readJson(platformStatusPath);
  assertFileHashField(platformStatus, 'lastSummaryHash', 'lastSummary', 'platform status last summary');
  assertFileHashField(platformStatus, 'lastSummaryJsonHash', 'lastSummaryJson', 'platform status last summary JSON');
  assertFileHashField(platformStatus, 'lastHistorySummaryHash', 'lastHistorySummary', 'platform status last history summary');
  assertFileHashField(platformStatus, 'lastHistorySummaryJsonHash', 'lastHistorySummaryJson', 'platform status last history summary JSON');
}

if (fs.existsSync(platformSummaryPath)) {
  const platformSummary = readJson(platformSummaryPath);
  assert.ok(Array.isArray(platformSummary.records), 'platform summary records array');
  for (const record of platformSummary.records) {
    assertComponentFileHashes(record, `platform summary ${record.key}`);
  }
  assertSourceTraceHashes(platformSummary.sourceTrace, platformSummary.records.map(record => record.key), 'platform summary');
}

if (fs.existsSync(platformHistoryPath)) {
  const platformHistory = readJson(platformHistoryPath);
  assertHistoryManifestShape(platformHistory, 'platform history');
  if (platformHistory.items.length) {
    const latestPlatformHistory = platformHistory.items[0];
    assertFileHashField(latestPlatformHistory, 'summaryHash', 'summaryPath', 'platform history latest summary');
    assertFileHashField(latestPlatformHistory, 'summaryJsonHash', 'summaryJsonPath', 'platform history latest summary JSON');
    assertSourceTraceHashes(
      latestPlatformHistory.sourceTrace,
      Array.isArray(latestPlatformHistory.records) ? latestPlatformHistory.records.map(record => record.key) : undefined,
      'platform history latest'
    );
  }
}

if (fs.existsSync(platformAuditDecisionPath)) {
  const platformDecision = readJson(platformAuditDecisionPath);
  const platformDecisionFresh = fs.statSync(platformAuditDecisionPath).mtimeMs >= fs.statSync(repoFile('platform-audit-preflight.ps1')).mtimeMs - 1000;
  if (platformDecisionFresh) {
    assert.ok(Array.isArray(platformDecision.components), 'platform audit decision components array');
    for (const component of platformDecision.components) {
      assertComponentFileHashes(component, `platform audit decision ${component.key}`);
    }
    assertSourceTraceHashes(platformDecision.sourceTrace, platformDecision.components.map(component => component.key), 'platform audit decision');
  }
}

const maturityMatrixScript = readText(toolboxFile('tools/tool-maturity-matrix.js'));
const auditDashboardBrowserSmokeScript = readText(toolboxFile('tools/audit-dashboard-browser-smoke.test.js'));

[
  'liveOutputMode',
  'requiredLiveOutputPaths',
  'output/audit/platform-status.json',
  'output/audit/platform-history.json',
  '鋼構工具/output/audit/audit-status.json',
  '鋼筋混凝土/output/audit/audit-status.json',
  '結構工具箱/output/audit/audit-status.json',
  'platformStatus: readJsonFile',
  'componentStatuses',
  'statusCards',
  'readTextFile',
  'summarySnippet',
  'summaryPreviews',
  'output/audit/platform-summary.md',
  '鋼構工具/output/audit/audit-summary.md',
  '鋼筋混凝土/output/audit/audit-summary.md',
  '結構工具箱/output/audit/audit-summary.md',
  'summary preview includes source snippet',
  'expectedTraceabilityCatalogs',
  'traceabilityCatalogCoverage',
  '#traceabilityCatalogCoverage .coverage-total',
  'rc-traceability-catalog',
  'steel-traceability-catalog',
  'anchor-traceability-catalog',
  'stone-traceability-catalog',
  'decking-traceability-catalog',
  'excavation-traceability-catalog',
  'traceabilityCatalogs=',
  'livePostChecks=',
  'liveHistoryPostChecks=',
  'livePostCheckHistoryRuns=',
  'publicRequests.filter(isOutputRequest)',
  "state.auditScope, 'public'",
  'public dashboard hides private output links',
  "replace(/^\\uFEFF/, '')",
  'live-output'
].forEach(needle => assertIncludes(auditDashboardBrowserSmokeScript, needle, 'audit dashboard browser smoke live-output contract'));
[
  "const crypto = require('crypto');",
  'function hashText',
  'hasValidTraceabilityEntry',
  'preflightSummarySource',
  'sourcePath: preflightSummarySource?.path',
  'sourceMtime: preflightSummarySource?.mtime',
  'sourceHash: preflightSummarySource?.hash',
  'preflightEvidenceSummaries',
  'formalTraceabilityCatalog',
  'formal-traceability-catalog',
  'rcTraceabilityCatalog',
  'rc-traceability-catalog',
  'steelTraceabilityCatalog',
  'steel-traceability-catalog',
  'anchorTraceabilityCatalog',
  'anchor-traceability-catalog',
  'stoneTraceabilityCatalog',
  'stone-traceability-catalog',
  'deckingTraceabilityCatalog',
  'decking-traceability-catalog',
  'excavationTraceabilityCatalog',
  'excavation-traceability-catalog',
  'summarizeTraceabilityCatalog',
  'buildTraceabilityCatalogCoverage',
  'traceabilityCatalogCoverage',
  '## Traceability Catalog Coverage',
  'buildJointReactionCandidateInventory',
  'buildJointReactionEvidenceStatus',
  'jointReactionEvidence',
  'rc-joint-reaction-evidence-status.v1',
  'joint-reaction-synthetic-fixtures',
  'joint-reaction-observed-fixtures',
  'joint-reaction-sanitizer',
  'joint-reaction-promotion-gate',
  'joint-reaction-observed-intake',
  '## Joint Reactions Format Evidence',
  '合成格式測試通過不等於實際 ETABS／SAP2000 版本匯出已驗證',
  'GLOBAL_GOVERNANCE_GATES',
  'buildGlobalGovernance',
  'globalGovernance',
  'report-disclosure-contract',
  'delivery-artifacts-contract',
  'release-readiness-contract',
  'public-status-claims-contract',
  'public-release-change-governance',
  'independent-engineering-benchmarks',
  'rendered-delivery-evidence',
  '交付物一致性',
  '正式放行證據',
  '公開狀態宣告一致性',
  '公開門檻退化治理',
  '獨立工程基準',
  '實際交付物渲染佐證',
  '結構工具箱/tools/delivery-artifacts.contract.test.js',
  '結構工具箱/tools/release-readiness.contract.test.js',
  '結構工具箱/tools/public-status-claims.contract.test.js',
  '結構工具箱/tools/public-release-change-governance.test.js',
  '結構工具箱/tools/independent-engineering-benchmarks.test.js',
  '結構工具箱/tools/rendered-delivery-evidence.contract.test.js',
  '## Independent Engineering Benchmarks',
  '## Global Governance Gates',
  'latestFullPreflightSummary',
  'preflightHistoryHealth',
  'preflight-history',
  'latest-full-preflight-summary',
  'sourceInput(',
  'extractHomeEntrypoints',
  'extractRouteFileMap',
  'extractGovernanceSources',
  'resolveHomeEntrypointSource',
  'hasPrintSurface',
  'hasPageOnlyReadiness',
  'hidesPageOnlyReadinessInPrint',
  'otherGovernanceList',
  'buildEntrypointCoverage',
  'boundaryIssuesForEntrypoint',
  'boundaryRoutes',
  'boundaryIssueCount',
  'pageOnlyBoundaryRequired',
  'pageOnlyBoundaryComplete',
  'pageOnlyBoundaryIssueCount',
  'page-only readiness complete',
  'otherGovernanceRoutes',
  'otherGovernanceIssueCount',
  '### Other Governance Sources',
  'homeEntrypoints',
  'entrypointCoverage',
  'formalOutsideCoverage',
  'outsideMatrixRoutes',
  '## Homepage Entrypoint Coverage',
  '### Non-Matrix Boundary Checks',
  'sourceTrace: sourceTrace || { inputs: [] }',
  'sourceTrace.inputs',
  'sourceTraceFor(',
  'toolboxSourceInput(',
  'sourceTrace: rowSourceTrace',
  'source hash',
  '## Source Trace',
  'hash=${payload.latestPreflight.sourceHash.slice(0, 12)}',
  'function isCompleteFormalPreflight',
  'payload.postChecksPassedCount === payload.postCheckCount'
].forEach(needle => assertIncludes(maturityMatrixScript, needle, 'maturity latest preflight source traceability'));
const maturityMatrixPath = repoFile('output/audit/tool-maturity-matrix.json');
if (fs.existsSync(maturityMatrixPath)) {
  const matrix = readJson(maturityMatrixPath);
  const maturityFresh = fs.statSync(maturityMatrixPath).mtimeMs >= fs.statSync(repoFile('結構工具箱/tools/tool-maturity-matrix.js')).mtimeMs - 1000;
  const maturityMatrixMtime = fs.statSync(maturityMatrixPath).mtimeMs;
  assert.ok(matrix.totals && typeof matrix.totals === 'object', 'maturity matrix totals object');
  assert.equal(Number.isInteger(matrix.totals.toolsWithUpgradeGaps), true, 'maturity upgrade tool count integer');
  assert.equal(Number.isInteger(matrix.totals.upgradeGapCount), true, 'maturity upgrade gap count integer');
  assert.equal(Number.isInteger(matrix.totals.goldenCases), true, 'maturity golden case total integer');
  assert.equal(Number.isInteger(matrix.totals.toolsWithMultipleGoldenCases), true, 'maturity multiple golden case tool count integer');
  assert.equal(
    matrix.totals.toolsWithMultipleGoldenCases,
    matrix.totals.tools,
    'maturity all tools meet multiple golden case threshold'
  );
  const coverageTotalKeys = [
    'reportModes',
    'reportTextSmoke',
    'jsonExport',
    'jsonImport',
    'diagramGeometry',
    'coreRegression',
    'goldenCaseRegression',
    'jsonRoundTrip',
    'referenceTraceability',
  ];
  for (const key of coverageTotalKeys) {
    assert.equal(Number.isInteger(matrix.totals[key]), true, `maturity coverage total ${key} integer`);
    assert.equal(matrix.totals[key], matrix.totals.tools, `maturity coverage total ${key} complete`);
  }
  assert.ok(Array.isArray(matrix.topUpgradeTargets), 'maturity top upgrade targets array');
  assert.equal(matrix.jointReactionEvidence?.schemaVersion, 'rc-joint-reaction-evidence-status.v1', 'maturity Joint Reactions evidence schema');
  assert.ok(Number.isInteger(matrix.jointReactionEvidence?.synthetic?.count), 'maturity Joint Reactions synthetic count integer');
  assert.ok(matrix.jointReactionEvidence.synthetic.count >= 7, 'maturity Joint Reactions synthetic fixture coverage');
  assert.ok(Number.isInteger(matrix.jointReactionEvidence?.observed?.count), 'maturity Joint Reactions observed count integer');
  assert.ok(Number.isInteger(matrix.jointReactionEvidence?.candidates?.total), 'maturity Joint Reactions candidate count integer');
  assert.equal(matrix.jointReactionEvidence?.gate?.configured, true, 'maturity Joint Reactions anonymization promotion gate configured');
  assert.equal(matrix.jointReactionEvidence?.gate?.intakeConfigured, true, 'maturity Joint Reactions observed intake workflow configured');
  assert.equal(matrix.jointReactionEvidence?.gate?.reviewTemplateDefaultClosed, true, 'maturity Joint Reactions review template defaults closed');
  assert.equal(matrix.jointReactionEvidence?.gate?.transactionalPromotion, true, 'maturity Joint Reactions promotion is transactional');
  assert.equal(matrix.jointReactionEvidence?.gate?.staleLockRecoveryConfigured, true, 'maturity Joint Reactions stale lock recovery configured');
  assert.equal(matrix.jointReactionEvidence?.gate?.canonicalManifestPathGuardConfigured, true, 'maturity Joint Reactions canonical manifest path guard configured');
  assert.equal(matrix.jointReactionEvidence?.workflow?.assessmentIsReadOnly, true, 'maturity Joint Reactions assessment is read-only');
  assert.equal(matrix.jointReactionEvidence?.workflow?.promotionRequiresExplicitYes, true, 'maturity Joint Reactions promotion requires explicit yes');
  assert.match(matrix.jointReactionEvidence?.workflow?.intakeCommand || '', /joint-reaction-observed-intake\.js/, 'maturity Joint Reactions intake command available');
  assert.match(matrix.jointReactionEvidence?.workflow?.packageImportCommand || '', /--package/, 'maturity Joint Reactions browser package import command available');
  assert.match(matrix.jointReactionEvidence?.workflow?.lockStatusCommand || '', /--lock-status yes/, 'maturity Joint Reactions lock status command available');
  assert.match(matrix.jointReactionEvidence?.workflow?.lockClearCommand || '', /--clear-stale-lock yes.*--expected-lock-sha256/, 'maturity Joint Reactions SHA-bound stale lock clear command available');
  assert.equal(matrix.jointReactionEvidence?.workflow?.staleLockClearRequiresExplicitYesAndSha256, true, 'maturity Joint Reactions stale lock clear is explicit and SHA-bound');
  assert.equal(matrix.jointReactionEvidence?.workflow?.browserPackageSchema, 'rc-joint-reaction-browser-intake-package.v1', 'maturity Joint Reactions browser package schema');
  assert.equal(matrix.jointReactionEvidence?.claims?.affectsFormalToolMaturity, false, 'maturity Joint Reactions evidence does not inflate formal tool maturity');
  assert.match(matrix.jointReactionEvidence?.boundary || '', /合成格式測試通過不等於實際 ETABS／SAP2000 版本匯出已驗證/, 'maturity Joint Reactions boundary distinguishes synthetic and observed evidence');
  assert.ok(matrix.globalGovernance && typeof matrix.globalGovernance === 'object', 'maturity globalGovernance object');
  assert.equal(Number.isInteger(matrix.globalGovernance.required), true, 'maturity globalGovernance required integer');
  assert.equal(Number.isInteger(matrix.globalGovernance.passed), true, 'maturity globalGovernance passed integer');
  assert.equal(Number.isInteger(matrix.globalGovernance.issueCount), true, 'maturity globalGovernance issue count integer');
  assert.ok(Array.isArray(matrix.globalGovernance.gates), 'maturity globalGovernance gates array');
  const reportDisclosureGate = matrix.globalGovernance.gates.find(gate => gate.key === 'report-disclosure-contract');
  assert.ok(reportDisclosureGate, 'maturity globalGovernance report disclosure gate exists');
  assert.equal(reportDisclosureGate.pass, true, 'maturity globalGovernance report disclosure gate passes');
  assert.equal(reportDisclosureGate.coveredCatalogs, 7, 'maturity globalGovernance report disclosure catalog count');
  assert.deepEqual(reportDisclosureGate.catalogFamilies, ['formal-traceability', 'rc-traceability', 'steel-traceability', 'anchor-traceability', 'stone-traceability', 'decking-traceability', 'excavation-traceability'], 'maturity globalGovernance report disclosure relevant families');
  assert.deepEqual(reportDisclosureGate.issues, [], 'maturity globalGovernance report disclosure issues empty');
  const deliveryArtifactsGate = matrix.globalGovernance.gates.find(gate => gate.key === 'delivery-artifacts-contract');
  assert.ok(deliveryArtifactsGate, 'maturity globalGovernance delivery artifacts gate exists');
  assert.equal(deliveryArtifactsGate.pass, true, 'maturity globalGovernance delivery artifacts gate passes');
  assert.equal(deliveryArtifactsGate.coveredCatalogs, 4, 'maturity globalGovernance delivery artifacts catalog count');
  assert.deepEqual(deliveryArtifactsGate.catalogFamilies, ['stone-traceability', 'anchor-traceability', 'decking-traceability', 'excavation-traceability'], 'maturity globalGovernance delivery artifacts relevant families');
  assert.deepEqual(deliveryArtifactsGate.issues, [], 'maturity globalGovernance delivery artifacts issues empty');
  const releaseReadinessGate = matrix.globalGovernance.gates.find(gate => gate.key === 'release-readiness-contract');
  assert.ok(releaseReadinessGate, 'maturity globalGovernance release readiness gate exists');
  assert.equal(releaseReadinessGate.pass, true, 'maturity globalGovernance release readiness gate passes');
  assert.equal(releaseReadinessGate.coveredCatalogs, 0, 'maturity globalGovernance release readiness catalog count');
  assert.deepEqual(releaseReadinessGate.catalogFamilies, [], 'maturity globalGovernance release readiness relevant families empty');
  assert.deepEqual(releaseReadinessGate.issues, [], 'maturity globalGovernance release readiness issues empty');
  const publicStatusClaimsGate = matrix.globalGovernance.gates.find(gate => gate.key === 'public-status-claims-contract');
  assert.ok(publicStatusClaimsGate, 'maturity globalGovernance public status claims gate exists');
  assert.equal(publicStatusClaimsGate.pass, true, 'maturity globalGovernance public status claims gate passes');
  assert.equal(publicStatusClaimsGate.coveredCatalogs, 0, 'maturity globalGovernance public status claims catalog count');
  assert.deepEqual(publicStatusClaimsGate.catalogFamilies, [], 'maturity globalGovernance public status claims relevant families empty');
  assert.deepEqual(publicStatusClaimsGate.issues, [], 'maturity globalGovernance public status claims issues empty');
  const publicReleaseChangeGate = matrix.globalGovernance.gates.find(gate => gate.key === 'public-release-change-governance');
  assert.ok(publicReleaseChangeGate, 'maturity globalGovernance public release change gate exists');
  assert.equal(publicReleaseChangeGate.pass, true, 'maturity globalGovernance public release change gate passes');
  assert.equal(publicReleaseChangeGate.coveredCatalogs, 0, 'maturity globalGovernance public release change catalog count');
  assert.deepEqual(publicReleaseChangeGate.catalogFamilies, [], 'maturity globalGovernance public release change relevant families empty');
  assert.deepEqual(publicReleaseChangeGate.issues, [], 'maturity globalGovernance public release change issues empty');
  const independentBenchmarkGate = matrix.globalGovernance.gates.find(gate => gate.key === 'independent-engineering-benchmarks');
  assert.ok(independentBenchmarkGate, 'maturity globalGovernance independent engineering benchmark gate exists');
  assert.equal(independentBenchmarkGate.pass, true, 'maturity globalGovernance independent engineering benchmark gate passes');
  assert.equal(independentBenchmarkGate.coveredCatalogs, 0, 'maturity globalGovernance independent engineering benchmark catalog count');
  assert.deepEqual(independentBenchmarkGate.catalogFamilies, [], 'maturity globalGovernance independent engineering benchmark relevant families empty');
  assert.deepEqual(independentBenchmarkGate.issues, [], 'maturity globalGovernance independent engineering benchmark issues empty');
  assert.equal(matrix.independentBenchmarkCoverage?.status, 'ready', 'maturity independent engineering benchmark pilot ready');
  assert.ok([37, 38, 39, 40].includes(matrix.independentBenchmarkCoverage?.summary?.pilotVerified), 'maturity independent engineering benchmark pilot verified uses a supported transition count');
  assert.ok([37, 38, 39, 40].includes(matrix.independentBenchmarkCoverage?.summary?.eligibleFormalRoutes), 'maturity independent engineering benchmark eligible formal routes use a supported transition count');
  assert.equal(matrix.independentBenchmarkCoverage?.summary?.candidateRequired, 21, 'maturity independent engineering candidate cases required');
  assert.equal(matrix.independentBenchmarkCoverage?.summary?.candidateVerified, 21, 'maturity independent engineering candidate cases verified');
  assert.equal(matrix.independentBenchmarkCoverage?.summary?.candidatePassRequired, 12, 'maturity independent engineering passing candidate cases required');
  assert.equal(matrix.independentBenchmarkCoverage?.summary?.candidatePassVerified, 12, 'maturity independent engineering passing candidate cases verified');
  assert.equal(matrix.independentBenchmarkCoverage?.summary?.candidateRejectionRequired, 9, 'maturity independent engineering rejection candidate cases required');
  assert.equal(matrix.independentBenchmarkCoverage?.summary?.candidateRejectionVerified, 9, 'maturity independent engineering rejection candidate cases verified');
  assert.equal(matrix.independentBenchmarkCoverage?.summary?.verifiedCandidateCapabilities, 3, 'maturity independent engineering candidate capabilities remain distinct');
  assert.equal(matrix.independentBenchmarkCoverage?.summary?.eligibleFormalRoutes, matrix.entrypointCoverage?.byState?.formal, 'maturity independent engineering benchmark portfolio matches formal homepage entries');
  const renderedDeliveryGate = matrix.globalGovernance.gates.find(gate => gate.key === 'rendered-delivery-evidence');
  assert.ok(renderedDeliveryGate, 'maturity globalGovernance rendered delivery evidence gate exists');
  assert.equal(renderedDeliveryGate.pass, true, 'maturity globalGovernance rendered delivery evidence gate passes');
  assert.equal(renderedDeliveryGate.coveredCatalogs, 0, 'maturity globalGovernance rendered delivery evidence catalog count');
  assert.deepEqual(renderedDeliveryGate.catalogFamilies, [], 'maturity globalGovernance rendered delivery evidence relevant families empty');
  assert.deepEqual(renderedDeliveryGate.issues, [], 'maturity globalGovernance rendered delivery evidence issues empty');
  assert.ok(readText(repoFile('output/audit/tool-maturity-matrix.md')).includes('## Global Governance Gates'), 'maturity markdown exposes global governance gates');
  assert.ok(readText(repoFile('output/audit/tool-maturity-matrix.md')).includes('report-disclosure-contract'), 'maturity markdown exposes report disclosure gate');
  assert.ok(readText(repoFile('output/audit/tool-maturity-matrix.md')).includes('delivery-artifacts-contract'), 'maturity markdown exposes delivery artifacts gate');
  assert.ok(readText(repoFile('output/audit/tool-maturity-matrix.md')).includes('release-readiness-contract'), 'maturity markdown exposes release readiness gate');
  assert.ok(readText(repoFile('output/audit/tool-maturity-matrix.md')).includes('public-status-claims-contract'), 'maturity markdown exposes public status claims gate');
  assert.ok(readText(repoFile('output/audit/tool-maturity-matrix.md')).includes('public-release-change-governance'), 'maturity markdown exposes public release change gate');
  assert.ok(readText(repoFile('output/audit/tool-maturity-matrix.md')).includes('independent-engineering-benchmarks'), 'maturity markdown exposes independent engineering benchmark gate');
  assert.ok(readText(repoFile('output/audit/tool-maturity-matrix.md')).includes('## Independent Engineering Benchmarks'), 'maturity markdown exposes independent engineering benchmark coverage');
  assert.ok(readText(repoFile('output/audit/tool-maturity-matrix.md')).includes('## Joint Reactions Format Evidence'), 'maturity markdown exposes Joint Reactions evidence status');
  assert.ok(readText(repoFile('output/audit/tool-maturity-matrix.md')).includes('合成格式測試通過不等於實際 ETABS／SAP2000 版本匯出已驗證'), 'maturity markdown preserves Joint Reactions evidence boundary');
  assert.ok(readText(repoFile('output/audit/tool-maturity-matrix.md')).includes('| /src-beam |'), 'maturity markdown lists SRC inside formal route coverage');
  assert.ok(readText(repoFile('output/audit/tool-maturity-matrix.md')).includes('rendered-delivery-evidence'), 'maturity markdown exposes rendered delivery evidence gate');
  if (maturityFresh) {
    assert.ok(matrix.preflightHistoryHealth && typeof matrix.preflightHistoryHealth === 'object', 'maturity preflightHistoryHealth object');
    assert.equal(Number.isInteger(matrix.preflightHistoryHealth.count), true, 'maturity preflightHistoryHealth count integer');
    assert.equal(Number.isInteger(matrix.preflightHistoryHealth.completedCount), true, 'maturity preflightHistoryHealth completedCount integer');
    assert.equal(Number.isInteger(matrix.preflightHistoryHealth.inProgressCount), true, 'maturity preflightHistoryHealth inProgressCount integer');
    assert.equal(Number.isInteger(matrix.preflightHistoryHealth.incompleteCount), true, 'maturity preflightHistoryHealth incompleteCount integer');
    assert.equal(Number.isInteger(matrix.preflightHistoryHealth.resolvedIncompleteCount), true, 'maturity preflightHistoryHealth resolvedIncompleteCount integer');
    assert.equal(Number.isInteger(matrix.preflightHistoryHealth.unresolvedIncompleteCount), true, 'maturity preflightHistoryHealth unresolvedIncompleteCount integer');
    assert.equal(matrix.preflightHistoryHealth.resolvedIncompleteCount + matrix.preflightHistoryHealth.unresolvedIncompleteCount, matrix.preflightHistoryHealth.incompleteCount, 'maturity preflightHistoryHealth resolution counts reconcile');
    assert.equal(Number.isInteger(matrix.preflightHistoryHealth.abnormalCount), true, 'maturity preflightHistoryHealth abnormalCount integer');
    assert.equal(Number.isInteger(matrix.preflightHistoryHealth.resolvedAbnormalCount), true, 'maturity preflightHistoryHealth resolvedAbnormalCount integer');
    assert.equal(Number.isInteger(matrix.preflightHistoryHealth.unresolvedAbnormalCount), true, 'maturity preflightHistoryHealth unresolvedAbnormalCount integer');
    assert.equal(matrix.preflightHistoryHealth.resolvedAbnormalCount + matrix.preflightHistoryHealth.unresolvedAbnormalCount, matrix.preflightHistoryHealth.abnormalCount, 'maturity preflightHistoryHealth abnormal resolution counts reconcile');
    assert.equal(typeof matrix.preflightHistoryHealth.latestState, 'string', 'maturity preflightHistoryHealth latestState string');
  }
  if (maturityFresh) {
    assert.ok(matrix.entrypointCoverage && typeof matrix.entrypointCoverage === 'object', 'maturity entrypointCoverage object');
    assert.equal(Number.isInteger(matrix.entrypointCoverage.total), true, 'maturity entrypointCoverage total integer');
    assert.equal(Number.isInteger(matrix.entrypointCoverage.matrixCovered), true, 'maturity entrypointCoverage matrixCovered integer');
    assert.equal(Number.isInteger(matrix.entrypointCoverage.otherGoverned), true, 'maturity entrypointCoverage otherGoverned integer');
    assert.equal(Number.isInteger(matrix.entrypointCoverage.formalOutsideCoverage), true, 'maturity entrypointCoverage formalOutsideCoverage integer');
    assert.equal(matrix.entrypointCoverage.matrixCovered, matrix.totals.tools, 'maturity entrypointCoverage covers every maturity row');
    assert.equal(matrix.entrypointCoverage.formalOutsideCoverage, 0, 'maturity entrypointCoverage has no uncovered formal home entries');
    assert.equal(Number.isInteger(matrix.entrypointCoverage.otherGovernanceRequired), true, 'maturity entrypointCoverage otherGovernanceRequired integer');
    assert.equal(Number.isInteger(matrix.entrypointCoverage.otherGovernanceComplete), true, 'maturity entrypointCoverage otherGovernanceComplete integer');
    assert.equal(Number.isInteger(matrix.entrypointCoverage.otherGovernanceIssueCount), true, 'maturity entrypointCoverage otherGovernanceIssueCount integer');
    assert.equal(matrix.entrypointCoverage.otherGovernanceRequired, matrix.entrypointCoverage.otherGoverned, 'maturity entrypointCoverage other governance count matches otherGoverned');
    assert.equal(matrix.entrypointCoverage.otherGovernanceComplete, matrix.entrypointCoverage.otherGovernanceRequired, 'maturity entrypointCoverage other governance checks complete');
    assert.equal(matrix.entrypointCoverage.otherGovernanceIssueCount, 0, 'maturity entrypointCoverage other governance issues empty');
    assert.ok(Array.isArray(matrix.entrypointCoverage.otherGovernanceRoutes), 'maturity entrypointCoverage otherGovernanceRoutes array');
    assert.ok(matrix.entrypointCoverage.otherGovernanceRoutes.length > 0, 'maturity entrypointCoverage otherGovernanceRoutes populated');
    for (const route of matrix.entrypointCoverage.otherGovernanceRoutes) {
      assert.ok(route.governance, `maturity other governance route governance: ${route.route}`);
      assert.ok(route.governanceLabel, `maturity other governance route label: ${route.route}`);
      assert.ok(route.governanceCardTag, `maturity other governance route boundary tag: ${route.route}`);
      assert.ok(Array.isArray(route.preflightKeys) && route.preflightKeys.length > 0, `maturity other governance route preflight keys: ${route.route}`);
      assert.deepEqual(route.failedKeys, [], `maturity other governance route failed keys empty: ${route.route}`);
      assert.deepEqual(route.missingKeys, [], `maturity other governance route missing keys empty: ${route.route}`);
      assert.deepEqual(route.governanceIssues, [], `maturity other governance route issues empty: ${route.route}`);
      assert.equal(route.pass, true, `maturity other governance route pass: ${route.route}`);
    }
    assert.equal(Number.isInteger(matrix.entrypointCoverage.boundaryRequired), true, 'maturity entrypointCoverage boundaryRequired integer');
    assert.equal(Number.isInteger(matrix.entrypointCoverage.boundaryComplete), true, 'maturity entrypointCoverage boundaryComplete integer');
    assert.equal(Number.isInteger(matrix.entrypointCoverage.boundaryIssueCount), true, 'maturity entrypointCoverage boundaryIssueCount integer');
    assert.equal(Number.isInteger(matrix.entrypointCoverage.pageOnlyBoundaryRequired), true, 'maturity entrypointCoverage pageOnlyBoundaryRequired integer');
    assert.equal(Number.isInteger(matrix.entrypointCoverage.pageOnlyBoundaryComplete), true, 'maturity entrypointCoverage pageOnlyBoundaryComplete integer');
    assert.equal(Number.isInteger(matrix.entrypointCoverage.pageOnlyBoundaryIssueCount), true, 'maturity entrypointCoverage pageOnlyBoundaryIssueCount integer');
    assert.equal(matrix.entrypointCoverage.boundaryComplete, matrix.entrypointCoverage.boundaryRequired, 'maturity entrypointCoverage boundary checks complete');
    assert.equal(matrix.entrypointCoverage.boundaryIssueCount, 0, 'maturity entrypointCoverage boundary issues empty');
    assert.equal(matrix.entrypointCoverage.pageOnlyBoundaryComplete, matrix.entrypointCoverage.pageOnlyBoundaryRequired, 'maturity entrypointCoverage page-only readiness checks complete');
    assert.equal(matrix.entrypointCoverage.pageOnlyBoundaryIssueCount, 0, 'maturity entrypointCoverage page-only readiness issues empty');
    assert.ok(Array.isArray(matrix.entrypointCoverage.outsideMatrixRoutes), 'maturity entrypointCoverage outsideMatrixRoutes array');
    assert.ok(Array.isArray(matrix.entrypointCoverage.boundaryRoutes), 'maturity entrypointCoverage boundaryRoutes array');
    assert.ok(matrix.entrypointCoverage.boundaryRoutes.length > 0, 'maturity entrypointCoverage boundaryRoutes populated');
    for (const route of matrix.entrypointCoverage.boundaryRoutes) {
      assert.ok(route.stateLabel, `maturity boundary route state label: ${route.route}`);
      assert.ok(route.boundaryRule, `maturity boundary route boundary rule: ${route.route}`);
      assert.ok(Array.isArray(route.matchedLimitNeedles), `maturity boundary route matched needles array: ${route.route}`);
      assert.ok(route.matchedLimitNeedles.length > 0, `maturity boundary route matched needles populated: ${route.route}`);
      assert.equal(typeof route.sourcePath, 'string', `maturity boundary route source path string: ${route.route}`);
      assert.equal(typeof route.reportSurface, 'boolean', `maturity boundary route report surface boolean: ${route.route}`);
      assert.equal(typeof route.pageOnlyReadinessRequired, 'boolean', `maturity boundary route page-only required boolean: ${route.route}`);
      assert.equal(typeof route.pageOnlyReadinessPresent, 'boolean', `maturity boundary route page-only present boolean: ${route.route}`);
      assert.equal(typeof route.pageOnlyReadinessHiddenInPrint, 'boolean', `maturity boundary route page-only hidden boolean: ${route.route}`);
      assert.ok(route.output, `maturity boundary route output: ${route.route}`);
      assert.ok(route.fit, `maturity boundary route fit: ${route.route}`);
      assert.ok(route.limit, `maturity boundary route limit: ${route.route}`);
      if (route.pageOnlyReadinessRequired) {
        assert.ok(route.sourcePath, `maturity boundary route page-only sourcePath populated: ${route.route}`);
        assert.equal(route.pageOnlyReadinessPresent, true, `maturity boundary route page-only readiness present: ${route.route}`);
        assert.equal(route.pageOnlyReadinessHiddenInPrint, true, `maturity boundary route page-only readiness hidden in print: ${route.route}`);
      }
      assert.deepEqual(route.boundaryIssues, [], `maturity boundary route issues empty: ${route.route}`);
    }
    assert.ok(matrix.entrypointCoverage.total >= matrix.totals.tools, 'maturity entrypointCoverage total includes matrix tools');
    const maturityMarkdown = readText(repoFile('output/audit/tool-maturity-matrix.md'));
    assert.ok(maturityMarkdown.includes('## Homepage Entrypoint Coverage'), 'maturity markdown exposes homepage entrypoint coverage');
    assert.ok(maturityMarkdown.includes('### Other Governance Sources'), 'maturity markdown exposes other governance sources');
    assert.ok(maturityMarkdown.includes('### Non-Matrix Boundary Checks'), 'maturity markdown exposes non-matrix boundary checks');
    assert.ok(maturityMarkdown.includes('page-only readiness complete'), 'maturity markdown exposes page-only readiness metric');
    assert.ok(maturityMarkdown.indexOf('## Top Upgrade Targets') < maturityMarkdown.indexOf('## Source Trace'), 'maturity markdown top upgrade section precedes source trace');
  }
  if (maturityFresh) {
    assert.ok(matrix.sourceTrace && typeof matrix.sourceTrace === 'object', 'maturity sourceTrace object');
    assert.ok(Array.isArray(matrix.sourceTrace.inputs), 'maturity sourceTrace inputs array');
    const expectedSourceInputs = [
      'formal-tools-manifest',
      'formal-traceability-catalog',
      'rc-traceability-catalog',
      'steel-traceability-catalog',
      'anchor-traceability-catalog',
      'stone-traceability-catalog',
      'decking-traceability-catalog',
      'excavation-traceability-catalog',
      'local-quick-tools-manifest',
      'independent-engineering-benchmarks',
      'vercel-routes',
      'home-entrypoints',
      'joint-reaction-synthetic-fixtures',
      'joint-reaction-observed-fixtures',
      'joint-reaction-sanitizer-core',
      'joint-reaction-sanitizer-core-test',
      'joint-reaction-sanitizer',
      'joint-reaction-sanitizer-test',
      'joint-reaction-promotion-gate',
      'joint-reaction-promotion-gate-test',
      'joint-reaction-observed-intake',
      'joint-reaction-observed-intake-test',
      'joint-reaction-review-template',
      'latest-preflight-summary'
    ];
    const hasFullPreflightSource = matrix.sourceTrace.inputs
      .some(input => input.key === 'latest-full-preflight-summary');
    if (hasFullPreflightSource) expectedSourceInputs.push('latest-full-preflight-summary');
    const hasPassingFullPreflightSource = matrix.sourceTrace.inputs
      .some(input => input.key === 'latest-passing-full-preflight-summary');
    if (matrix.latestPreflight?.pass !== true && hasPassingFullPreflightSource) expectedSourceInputs.push('latest-passing-full-preflight-summary');
    assert.deepEqual(matrix.sourceTrace.inputs.map(input => input.key).sort(), expectedSourceInputs.sort(), 'maturity sourceTrace expected input keys');
    for (const input of matrix.sourceTrace.inputs) {
      assert.equal(input.exists, true, `maturity sourceTrace ${input.key} exists`);
      const sourcePath = resolveFileReference(input.sourcePath, `maturity sourceTrace ${input.key}`);
      const sourceMtimeMs = fs.statSync(sourcePath).mtimeMs;
      const stalePreflightSource = ['latest-preflight-summary', 'latest-full-preflight-summary', 'latest-passing-full-preflight-summary'].includes(input.key) && sourceMtimeMs > maturityMatrixMtime + 1000;
      if (stalePreflightSource) {
        assertSha256(input.sourceHash, `maturity sourceTrace ${input.key} stale sourceHash sha256`);
        assert.equal(typeof input.sourceMtime, 'string', `maturity sourceTrace ${input.key} stale sourceMtime string`);
      } else {
        assertFileHashField(input, 'sourceHash', 'sourcePath', `maturity sourceTrace ${input.key}`);
        assert.equal(input.sourceMtime, fs.statSync(sourcePath).mtime.toISOString(), `maturity sourceTrace ${input.key} mtime matches`);
      }
    }
  }
  if (maturityFresh && matrix.latestPreflight) {
    assert.equal(typeof matrix.latestPreflight.totalSeconds, 'number', 'maturity latest preflight totalSeconds number');
    assert.equal(typeof matrix.latestPreflight.forcePlatformAudit, 'boolean', 'maturity latest preflight forcePlatformAudit boolean');
    assert.equal(typeof matrix.latestPreflight.forceSlowChecks, 'boolean', 'maturity latest preflight forceSlowChecks boolean');
    assert.match(matrix.latestPreflight.sourceCommitSha, /^[0-9a-f]{40}$/i, 'maturity latest preflight sourceCommitSha git sha');
    assert.equal(typeof matrix.latestPreflight.sourceBranch, 'string', 'maturity latest preflight sourceBranch string');
    assert.equal(typeof matrix.latestPreflight.sourceDirty, 'boolean', 'maturity latest preflight sourceDirty boolean');
    assert.equal(Number.isInteger(matrix.latestPreflight.recordsCount), true, 'maturity latest preflight recordsCount integer');
    assert.equal(Number.isInteger(matrix.latestPreflight.passedCount), true, 'maturity latest preflight passedCount integer');
    assert.equal(Number.isInteger(matrix.latestPreflight.slowReuseCount), true, 'maturity latest preflight slowReuseCount integer');
    assert.ok(Array.isArray(matrix.latestPreflight.failedKeys), 'maturity latest preflight failedKeys array');
    assert.ok(Array.isArray(matrix.latestPreflight.slowReuseKeys), 'maturity latest preflight slowReuseKeys array');
    assert.ok(Array.isArray(matrix.latestPreflight.slowestRecords), 'maturity latest preflight slowestRecords array');
    assert.equal(typeof matrix.latestPreflight.sourcePath, 'string', 'maturity latest preflight sourcePath string');
    assert.equal(typeof matrix.latestPreflight.sourceMtime, 'string', 'maturity latest preflight sourceMtime string');
    assert.match(matrix.latestPreflight.sourceHash, /^[0-9a-f]{64}$/i, 'maturity latest preflight sourceHash sha256');
    if (fs.existsSync(latestPreflightSummaryPath) && fs.statSync(latestPreflightSummaryPath).mtimeMs <= maturityMatrixMtime + 1000) {
      const latestSummaryText = readText(latestPreflightSummaryPath);
      const latestSummaryForMatrix = JSON.parse(latestSummaryText);
      const scalarFields = [
        'generatedAt', 'runId', 'quick', 'pass', 'failureCount', 'recordsCount', 'passedCount',
        'totalSeconds', 'slowestKey', 'slowestSeconds', 'slowestText', 'slowReuseCount',
        'platformAuditMode', 'platformAuditReused', 'platformAuditDecisionPath',
        'forcePlatformAudit', 'forceSlowChecks', 'sourceCommitSha', 'sourceBranch', 'sourceDirty'
      ];
      for (const field of scalarFields) {
        assert.deepEqual(matrix.latestPreflight[field], latestSummaryForMatrix[field], `maturity latest preflight ${field} matches summary`);
      }
      for (const field of ['failedKeys', 'slowReuseKeys', 'slowestRecords']) {
        assert.deepEqual(matrix.latestPreflight[field], latestSummaryForMatrix[field], `maturity latest preflight ${field} matches summary`);
      }
      assert.equal(matrix.latestPreflight.sourcePath, 'output/preflight/preflight-summary.json', 'maturity latest preflight sourcePath points to summary');
      assert.equal(matrix.latestPreflight.sourceHash, hashText(latestSummaryText), 'maturity latest preflight sourceHash matches summary content');
      assert.equal(matrix.latestPreflight.sourceMtime, fs.statSync(latestPreflightSummaryPath).mtime.toISOString(), 'maturity latest preflight sourceMtime matches summary mtime');
    }
  }
  assert.ok(Array.isArray(matrix.rows), 'maturity rows array');
  for (const row of matrix.rows) {
    assert.ok(Array.isArray(row.upgradeGaps), `maturity row ${row.key} upgrade gaps array`);
    assert.equal(typeof row.upgradePriority, 'string', `maturity row ${row.key} upgrade priority string`);
    assert.equal(Number.isInteger(row.goldenCaseCount), true, `maturity row ${row.key} golden case count integer`);
    if (maturityFresh) {
      assert.ok(row.sourceTrace && typeof row.sourceTrace === 'object', `maturity row ${row.key} sourceTrace object`);
      assert.ok(Array.isArray(row.sourceTrace.inputs), `maturity row ${row.key} sourceTrace inputs array`);
      assert.match(row.sourceTrace.sourceHash, /^[0-9a-f]{64}$/i, `maturity row ${row.key} sourceTrace aggregate hash`);
      assert.ok(row.sourceTrace.inputs.length >= 1, `maturity row ${row.key} sourceTrace populated`);
      for (const input of row.sourceTrace.inputs) {
        assert.equal(typeof input.key, 'string', `maturity row ${row.key} source input key string`);
        assert.equal(input.exists, true, `maturity row ${row.key} source ${input.key} exists`);
        assertFileHashField(input, 'sourceHash', 'sourcePath', `maturity row ${row.key} source ${input.key}`);
      }
      assert.ok(readText(repoFile('output/audit/tool-maturity-matrix.md')).includes(row.sourceTrace.sourceHash.slice(0, 12)), `maturity markdown exposes row source hash ${row.key}`);
    }
  }
}

console.log('audit dashboard contract OK');
