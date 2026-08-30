const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const publicEvidenceSchema = require('../assets/status/public-evidence-schema.js');

const DEFAULT_BASE_URL = 'https://oxsum324.github.io/section-properties-calculator/';
const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
]);
const PUBLIC_ROUTE_SAMPLES = [
  {
    path: '鋼筋混凝土/',
    needles: ['鋼筋混凝土構件設計工具箱', 'RC 自動巡檢', '../結構工具箱/assets/status/platform-status.json', '../結構工具箱/audit-dashboard.html', '../結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', 'RC 工具箱入口列印已封鎖', '明確核可後可作為正式附件', 'V1.7'],
    forbidden: ['最後改版日期', 'ver-draft', 'badge-new', '>NEW<', '僅供初步設計與檢算參考']
  },
  {
    path: '結構工具箱/index-classic.html',
    needles: ['舊網址相容入口', 'core/direct-print-boundary.css', 'formal-tool-output-page', '舊網址相容入口列印已封鎖', '工具清冊、使用邊界與巡檢狀態均以目前工具首頁為唯一公開來源', 'href="./index.html"', 'href="./audit-dashboard.html"'],
    forbidden: ['class="menu-card"', 'class="ver ', 'scope-pill', '>NEW<', '最後改版日期', 'output/audit/']
  },
  {
    path: '結構工具箱/assets/home/home.js',
    needles: ["capabilities: ['組合斷面', '斷面輔助']", "capabilities: ['案件參數', '案件入口']", "capabilities: ['附屬構造物', '耐震', 'TXT 備查']"],
    forbidden: ["capabilities: ['NEW'"]
  },
  { path: '鋼筋混凝土/tools/beam.html', needles: ['梁 Beam 設計', 'RC 工具箱'] },
  { path: '鋼筋混凝土/tools/shear-wall.html', needles: ['剪力牆 Shear Wall', '18.7'] },
  { path: '鋼構工具/', needles: ['鋼構正式規範核算工具', '../結構工具箱/core/direct-print-boundary.css', 'steel-formal-output-page', '鋼構正式工具主頁列印已封鎖'] },
  { path: '鋼構工具/plate-check.html', needles: ['鋼構連接板正式規範核算工具', '../結構工具箱/core/direct-print-boundary.css', 'steel-formal-output-page', '此頁是操作介面，不是計算書'] },
  { path: '鋼構工具/steel-beam-formal.html', needles: ['鋼梁正式規範核算工具', '../結構工具箱/core/direct-print-boundary.css', 'steel-formal-output-page', '產生計算書'] },
  { path: '鋼構工具/steel-column-formal.html', needles: ['鋼柱正式規範核算工具', '../結構工具箱/core/direct-print-boundary.css', 'steel-formal-output-page', '本頁不得作為附件'] },
  { path: '鋼構工具/app.js', needles: ['getAuditStatusSource', '../結構工具箱/assets/status/platform-status.json', '../結構工具箱/audit-dashboard.html', '平台公開巡檢狀態', '鋼構本機自巡檢狀態', '?auditSource=local'], forbidden: ['function isLocalAuditHost'] },
  { path: 'SRC工具/src-column.html', needles: ['SRC 柱方向可選耐震核算', 'V1.0', '../結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', 'SRC 柱操作頁列印已封鎖', '產生計算書', '正式構材附件'], checkAssets: true },
  { path: 'anchor/', needles: ['錨栓檢討工具'], checkAssets: true },
  { path: '石材固定/石材計算書產生器_規範版V2.html', needles: ['石材外牆固定構件計算書產生器', '規範版', 'const APP_VERSION = window.StonePublicMetadata.version', '產出工具：${window.StonePublicMetadata.name}', '工具版本：${APP_VERSION}', '計算引擎：${CALCULATOR_VERSION}', '../結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '石材工具主頁列印已封鎖', 'buildPrintableSheetsHtml()', 'const V2_METHOD_MEDIA = Object.freeze({', "mode:'public_static'", '公開靜態版不檢查本機服務', 'const proseAt = m.search(/[\\u3400-\\u9fff]/);'] },
  { path: '覆工板/index.html', needles: ['覆工板系統計算工具', 'const DECKING_TOOL_METADATA = Object.freeze({', 'pageVersion: DECKING_TOOL_METADATA.version', '../結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '覆工板工具主頁列印已封鎖', 'printDeckingReport()'] },
  { path: '開挖擋土支撐/index.html', needles: ['開挖擋土支撐計算工具', '本機受控服務工具', '../結構工具箱/core/direct-print-boundary.css', '開挖服務入口列印已封鎖', '已驗證範圍', '工程判斷邊界', '平台公開巡檢狀態'] },
  { path: '連續梁分析.html', needles: ['連續梁分析工具', 'analysis-section-tool-metadata.js', 'CONTINUOUS_BEAM_PUBLIC_VERSION', 'CONTINUOUS_BEAM_CALCULATION_ENGINE', 'textExport: true', '結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '分析工具主頁列印已封鎖'] },
  { path: '鋼架/平面剛架分析.html', needles: ['平面剛架分析', 'analysis-section-tool-metadata.js', 'FRAME_PUBLIC_VERSION', 'FRAME_CALCULATION_ENGINE', '<b>計算引擎</b>', '../結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '本頁不得作為附件'] },
  { path: 'index.html', needles: ['斷面性質計算工具', 'analysis-section-tool-metadata.js', 'SECTION_TOOL_VERSION', 'SECTION_CALCULATION_ENGINE', '計算引擎：${SECTION_CALCULATION_ENGINE}', '結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '斷面工具主頁列印已封鎖'] },
  { path: '斷面性質計算.html', needles: ['斷面性質計算工具 V2.1｜相容入口', 'window.location.replace(target.href)', 'target.search = window.location.search', '結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '本頁不得作為附件'] },
  { path: '合成斷面性質.html', needles: ['合成斷面性質計算', 'analysis-section-tool-metadata.js', 'COMPOSITE_PUBLIC_VERSION', 'COMPOSITE_CALCULATION_ENGINE', '結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '此頁是操作介面，不是計算書'] },
  { path: 'RC補強斷面性質.html', needles: ['RC 補強斷面性質計算', '鋼筋混凝土/shared/direct-print-boundary.css', 'rc-formal-output-page', 'RC 工具主頁列印已封鎖'] },
  { path: '結構工具箱/tools/formal-tool-metadata.js', needles: ["'wind-force':", "route: '/wind-force'", "version: 'V3'", "'seismic-dynamic':", "version: 'V3.8'"] },
  { path: '結構工具箱/tools/local-quick-tool-metadata.js', needles: ["'foundation-local':", "version: 'V0.6'", "'equipment-load':", "version: 'V0.3'", "'earth-pressure':", "governance: 'local-quick-contract'"] },
  { path: '結構工具箱/tools/analysis-section-tool-metadata.js', needles: ["'continuous-beam':", "route: '/beam-analysis'", "'frame-analysis':", "route: '/frame-analysis'", "calculationEngine: 'section-properties.inline.v2.1.0'", "'composite-section':"] },
  { path: '結構工具箱/tools/風力/wind-force.html', needles: ['矩形建物 MWFRS', '建築物耐風設計', '../formal-tool-metadata.js', "FormalToolMetadata['wind-force'].version", '../../core/direct-print-boundary.css', 'formal-tool-output-page', '正式工具主頁列印已封鎖'] },
  { path: '結構工具箱/tools/風力/wind-object-solid.html', needles: ['實體標示物風力', '表 2.10', '../formal-tool-metadata.js', 'version: PUBLIC_TOOL_VERSION', 'calculationEngine: TOOL_VERSION', '<b>計算引擎</b>', '../../core/direct-print-boundary.css', 'formal-tool-output-page', '此頁是操作介面，不是計算書'] },
  { path: '結構工具箱/tools/地震力/seismic-force.html', needles: ['等值靜力分析', '建築物耐震設計', '../formal-tool-metadata.js', 'version: PUBLIC_TOOL_VERSION', 'calculationEngine: TOOL_VERSION', '<b>計算引擎</b>', '../../core/direct-print-boundary.css', 'formal-tool-output-page', '本頁不得作為附件'] },
  { path: '結構工具箱/tools/foundation/foundation-local.html', needles: ['基礎局部檢核', '../local-quick-tool-metadata.js', "LocalQuickToolMetadata['foundation-local'].version", 'calculationEngine: Core.version', '計算引擎：${escapeHtml(Core.version)}', '../../core/direct-print-boundary.css', 'local-quick-output-page', '局部快算主頁列印已封鎖'] },
  { path: '結構工具箱/tools/equipment/equipment-load.html', needles: ['設備局部荷重', '../local-quick-tool-metadata.js', "LocalQuickToolMetadata['equipment-load'].version", 'calculationEngine: Core.version', '計算引擎：${escapeHtml(Core.version)}', '../../core/direct-print-boundary.css', 'local-quick-output-page', '此頁是操作介面，不是計算書'] },
  { path: '結構工具箱/tools/earth/earth-pressure.html', needles: ['擋土土壓局部快算', '../local-quick-tool-metadata.js', "LocalQuickToolMetadata['earth-pressure'].version", 'calculationEngine: Core.version', '計算引擎：${escapeHtml(Core.version)}', '../../core/direct-print-boundary.css', 'local-quick-output-page', '本頁不得作為附件'] }
];
const CLEAN_ROUTE_SAMPLES = [
  { path: 'rc-column/', source: '/rc-column', targetNeedle: 'column.html' },
  { path: 'rc-deep-beam-stm/', source: '/rc-deep-beam-stm', targetNeedle: 'deep-beam-stm.html' },
  { path: 'rc-foundation-deep-beam-stm/', source: '/rc-foundation-deep-beam-stm', targetNeedle: 'foundation-deep-beam-stm.html' },
  { path: 'rc-pile-cap-3d-stm/', source: '/rc-pile-cap-3d-stm', targetNeedle: 'pile-cap-3d-stm.html' },
  { path: 'steel-beam-formal/', source: '/steel-beam-formal', targetNeedle: 'steel-beam-formal.html' },
  { path: 'src-beam/', source: '/src-beam', targetNeedle: 'src-beam.html' },
  { path: 'src-column/', source: '/src-column', targetNeedle: 'src-column.html' },
];
const PRIVATE_PATHS = [
  '鋼構工具/core/formal-core-manifest.json',
  '結構工具箱/tools/independent-engineering-adapters/rc-stm-strength.js',
  '結構工具箱/tools/independent-engineering-benchmarks.js',
  '結構工具箱/tools/independent-engineering-benchmarks.catalog.json',
  '結構工具箱/tools/independent-engineering-benchmarks.test.js',
  '啟動案件附件工作台.bat',
  '安裝案件附件工作台捷徑.bat',
  '檢查案件附件工作台捷徑.bat',
  '移除案件附件工作台捷徑.bat',
  'README.md',
  'CONTEXT.md',
  'docs/adr/0001-page-only-report-readiness.md',
  'TOOL_BOUNDARIES.md',
  'STAGING_GROUPS.md',
  'TOOL_REPORT_GUIDE.md',
  'preflight-tools.ps1',
  'run-preflight-tools.bat',
  'toolbox-entrypoints.contract.test.js',
  'SRC工具/core/src-column-oracle.js',
  'SRC工具/src-column-page.contract.test.js',
  'SRC工具/src-column-browser-smoke.test.js',
  'SRC工具/src-column-core.test.js',
  'SRC工具/src-column-h-section-catalog.test.js',
  'SRC工具/src-column-oracle.test.js',
  'SRC工具/src-column-rc-biaxial.test.js',
  'SRC工具/src-column-shear.test.js',
  'SRC工具/src-column-seismic-axial.test.js',
  'SRC工具/src-column-seismic-detailing.test.js',
  'SRC工具/src-column-traceability.catalog.json',
  '鋼筋混凝土/shared/joint-reaction-fixture-sanitizer.js',
  '鋼筋混凝土/shared/joint-reaction-fixture-promotion-gate.js',
  '鋼筋混凝土/shared/joint-reaction-observed-intake.js',
  '鋼筋混凝土/shared/joint-reaction-observed-review.template.json',
  '鋼筋混凝土/shared/fixtures/joint-reactions/manifest.json',
  '鋼筋混凝土/shared/fixtures/joint-reactions/observed-manifest.json',
  '結構工具箱/tools/public-status-claims.contract.test.js',
  '結構工具箱/tools/pages-live-smoke.js',
  '結構工具箱/tools/pages-live-browser-smoke.js',
  '結構工具箱/tools/run-pages-browser-smoke.sh',
  '結構工具箱/tools/build-pages-artifact.js',
  '結構工具箱/tools/build-pages-clean-routes.js',
  '結構工具箱/tools/build-pages-deployment-manifest.js',
  '結構工具箱/tools/verify-pages-release-lineage.js',
  '結構工具箱/tools/public-release-change-assistant.js',
  '結構工具箱/tools/public-release-change-assistant.test.js',
  '結構工具箱/tools/public-release-decision-receipt.js',
  '結構工具箱/tools/public-release-decision-receipt.test.js',
  '結構工具箱/tools/public-release-decision-backup.js',
  '結構工具箱/tools/public-release-decision-backup.test.js',
  '結構工具箱/tools/public-release-decision-backup-health.js',
  '結構工具箱/tools/public-release-decision-backup-health.test.js',
  '結構工具箱/tools/public-release-decision-backup-task.test.js',
  '結構工具箱/tools/run-public-release-decision-backup-health.ps1',
  '結構工具箱/tools/manage-public-release-decision-backup-health-task.ps1',
  '結構工具箱/tools/public-release-decision-restore-drill.js',
  '結構工具箱/tools/public-release-decision-restore-drill.test.js',
  '結構工具箱/tools/public-release-decision-restore-drill-health.js',
  '結構工具箱/tools/public-release-decision-restore-drill-health.test.js',
  '結構工具箱/tools/public-release-decision-cloud-checkpoint.js',
  '結構工具箱/tools/public-release-decision-cloud-checkpoint.test.js',
  '結構工具箱/tools/public-release-decision-restore-drill-task.test.js',
  '結構工具箱/tools/run-public-release-decision-restore-drill.ps1',
  '結構工具箱/tools/manage-public-release-decision-restore-drill-task.ps1',
  'output/audit/public-release-decision-restore-drill-anchor.json',
  'output/audit/public-release-decision-cloud-checkpoint-anchor.json',
  'output/audit/public-release-decision-cloud-checkpoint-health.json',
  'output/audit/public-release-decision-cloud-observation-current.json',
  'output/audit/public-release-decision-cloud-verification-current.json',
  'output/audit/public-release-decision-cloud-checkpoint-staging/',
  'output/audit/public-release-decision-cloud-verifications/',
  '結構工具箱/tools/attachment-package-check.js',
  '結構工具箱/tools/attachment-package-build.js',
  '結構工具箱/tools/attachment-package-verify.js',
  '結構工具箱/tools/attachment-package-manager-worker.js',
  '結構工具箱/tools/attachment-package-manager.ps1',
  '結構工具箱/tools/啟動正式附件包管理器.bat',
  '結構工具箱/tools/attachment-package-manager.contract.test.js',
  '結構工具箱/tools/attachment-case-governance-viewer-worker.js',
  '結構工具箱/tools/attachment-case-governance-viewer.ps1',
  '結構工具箱/tools/啟動案件附件治理檢視器.bat',
  '結構工具箱/tools/attachment-case-governance-viewer.contract.test.js',
  '結構工具箱/tools/attachment-package-upgrade-assistant-worker.js',
  '結構工具箱/tools/attachment-package-upgrade-assistant.ps1',
  '結構工具箱/tools/啟動舊版附件升級助手.bat',
  '結構工具箱/tools/attachment-package-upgrade-assistant.contract.test.js',
  '結構工具箱/tools/attachment-governance-hub-worker.js',
  '結構工具箱/tools/attachment-governance-hub.ps1',
  '結構工具箱/tools/啟動案件附件工作台.bat',
  '結構工具箱/tools/attachment-governance-hub.contract.test.js',
  '結構工具箱/tools/install-attachment-governance-shortcuts.ps1',
  '結構工具箱/tools/attachment-governance-shortcut-installer.test.js',
  '結構工具箱/tools/attachment-package-upgrade-assess.js',
  '結構工具箱/tools/attachment-package-upgrade-workspace.js',
  '結構工具箱/tools/attachment-package-upgrade-workspace-check.js',
  '結構工具箱/tools/attachment-package-upgrade-flow.js',
  '結構工具箱/tools/attachment-package-upgrade-history.js',
  '結構工具箱/tools/attachment-package-upgrade-history-index.js',
  '結構工具箱/tools/attachment-package-upgrade-history-baseline.js',
  '結構工具箱/tools/attachment-package-upgrade-history-baseline-advance.js',
  '結構工具箱/tools/attachment-package-upgrade-history-baseline-chain.js',
  '結構工具箱/tools/attachment-case-governance-overview.js',
  '結構工具箱/tools/attachment-case-governance-root.js',
  '結構工具箱/tools/attachment-case-governance-portfolio.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-compare.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-snapshot.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-snapshot-index.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint-history.js',
  '結構工具箱/tools/attachment-case-governance-workspace.js',
  '結構工具箱/tools/local-quick-browser-smoke.test.js',
  '結構工具箱/tools/rendered-delivery-evidence.js',
  '結構工具箱/tools/rendered-delivery-evidence.inventory.json',
  '結構工具箱/tools/rc-stm-atomic-change-set.manifest.json',
  '結構工具箱/tools/rc-stm-atomic-change-set.js',
  '結構工具箱/tools/rc-stm-atomic-change-set-review.js',
  '結構工具箱/tools/rc-stm-atomic-change-set-review.test.js',
  '結構工具箱/tools/docx-package-integrity.js',
  '結構工具箱/tools/docx-package-integrity.test.js',
  '結構工具箱/tools/xlsx-package-integrity.js',
  '結構工具箱/tools/xlsx-package-integrity.test.js',
  '結構工具箱/tools/xlsx-print-export.py',
  '結構工具箱/tools/xlsx-print-visual.js',
  '結構工具箱/tools/xlsx-print-visual.test.js',
  '結構工具箱/tools/xlsx-seal-verifier.js',
  '結構工具箱/tools/xlsx-seal-verifier.test.js',
  '結構工具箱/tools/attachment-integrity-diagnostic.js',
  'dev_tools/attachment-integrity-diagnostic.js',
  '石材固定/dev_tools/baseline_capture.html',
  '石材固定/dev_tools/diagnostics.html',
  '石材固定/dev_tools/gov_filename_diff.py',
  '石材固定/dev_tools/verifier.config.json',
  '石材固定/server.py',
  '石材固定/tests/golden/case_01_standard_safe.json',
  '石材固定/註冊快速啟動.reg',
  '開挖擋土支撐/backend/app/main.py',
  '開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_SCHEMA.json',
  '開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_SCHEMA.json',
  '開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_PORTFOLIO_SCHEMA.json',
  '開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_MONITOR_SCHEMA.json',
  '開挖擋土支撐/GOVERNANCE_TRUSTED_ARCHIVE_LIFECYCLE_DASHBOARD_SCHEMA.json',
  '開挖擋土支撐/manage_receiver_governance_archive_lifecycle_monitor_task.ps1',
  '開挖擋土支撐/onboard_receiver_governance_archive_lifecycle_monitor.ps1',
  '開挖擋土支撐/receiver_governance_archive_lifecycle_monitor_center.ps1',
  '開挖擋土支撐/開啟多案件生命週期監控管理中心.bat',
  'GSM-外部歸檔生命週期監測-latest.json',
  'events/GSM-外部歸檔生命週期監測事件-000001-GME-00000000000000000000.json',
  'GSP-外部歸檔生命週期總覽-GSP-00000000000000000000/GSP-外部歸檔生命週期總覽-GSP-00000000000000000000.html',
  '開挖擋土支撐/frontend/package.json',
  '開挖擋土支撐/frontend/src/App.tsx',
  '開挖擋土支撐/frontend/dist/index.html',
  '螺栓檢討/bolt-review-tool/package.json',
  '螺栓檢討/bolt-review-tool/src/App.tsx',
  '覆工板/dump_xls.py',
  '.github/pages-smoke/package.json',
  '.github/pages-smoke/package-lock.json',
  '.github/pages-smoke/performance-budget.json',
  '.github/pages-smoke/write-ci-summary.js',
  '.github/pages-smoke/build-performance-trend.js',
  '.github/pages-smoke/build-performance-trend.test.js',
  '.github/pages-smoke/normalize-playwright-result.js',
  '.github/public-release-reduction-authorization.json',
  '.github/public-release-decision-anchor.json',
  '.github/workflows/pages-deploy.yml'
];

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : process.argv[index + 1] || '';
}

function hasArg(name) {
  return process.argv.includes(name);
}

function allowLocalOutput() {
  return hasArg('--allow-local-output') || process.env.PAGES_ALLOW_LOCAL_OUTPUT === '1';
}

function baseUrl() {
  const raw = argValue('--base-url') || process.env.PAGES_BASE_URL || DEFAULT_BASE_URL;
  return raw.endsWith('/') ? raw : `${raw}/`;
}

function liveUrl(base, relativePath) {
  return new URL(encodeURI(relativePath), base).toString();
}

class TransientPagesSmokeError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'TransientPagesSmokeError';
    this.transient = true;
    if (cause) this.cause = cause;
  }
}

function isTransientNetworkError(error) {
  const seen = new Set();
  let current = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (TRANSIENT_NETWORK_ERROR_CODES.has(String(current.code || '').toUpperCase())) return true;
    current = current.cause;
  }
  return false;
}

function isTransientSmokeError(error) {
  return Boolean(error?.transient) || isTransientNetworkError(error);
}

async function fetchResponse(url, options = {}, fetchImpl = globalThis.fetch, retryOptions = {}) {
  const attempts = retryOptions.attempts ?? environmentInteger('PAGES_HTTP_REQUEST_ATTEMPTS', 1, 1);
  const delayMs = retryOptions.delayMs ?? environmentInteger('PAGES_HTTP_REQUEST_RETRY_DELAY_MILLISECONDS', 1000, 0);
  const timeoutMs = retryOptions.timeoutMs ?? environmentInteger('PAGES_HTTP_REQUEST_TIMEOUT_MILLISECONDS', 30000, 1);
  const sleep = retryOptions.sleep || delay;
  const onRetry = retryOptions.onRetry || ((error, context) => {
    console.error(`Pages HTTP request ${context.attempt}/${context.attempts} 遇到暫態錯誤：${error.message || error}`);
    console.error(`將於 ${context.delayMs} ms 後重試同一請求（request attempt ${context.nextAttempt}/${context.attempts}）。`);
  });

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('HTTP request timeout 必須是正整數。');

  return runWithTransientRetry(async () => {
    let response;
    const controller = new AbortController();
    const upstreamSignal = options.signal;
    let timedOut = false;
    const forwardAbort = () => controller.abort(upstreamSignal.reason);
    if (upstreamSignal) {
      if (upstreamSignal.aborted) forwardAbort();
      else upstreamSignal.addEventListener('abort', forwardAbort, { once: true });
    }
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      response = await fetchImpl(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        throw new TransientPagesSmokeError(`${url} 單一請求超過 ${timeoutMs} ms`, error);
      }
      if (isTransientNetworkError(error)) {
        throw new TransientPagesSmokeError(`${url} 暫時性網路錯誤：${error.message || error}`, error);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      if (upstreamSignal && !upstreamSignal.aborted) upstreamSignal.removeEventListener('abort', forwardAbort);
    }
    if (response.status >= 500 && response.status <= 599) {
      throw new TransientPagesSmokeError(`${url} 暫時回傳 HTTP ${response.status}`);
    }
    return response;
  }, { attempts, delayMs, sleep, onRetry });
}

async function fetchText(url) {
  const response = await fetchResponse(url, { redirect: 'manual', cache: 'no-store' });
  assert.equal(response.status, 200, `${url} expected HTTP 200, got ${response.status}`);
  return response.text();
}

function localAssetUrls(html, pageUrl) {
  const page = new URL(pageUrl);
  const urls = [];
  const tagPattern = /<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(tagPattern)) {
    const reference = match[1].trim();
    if (!reference || /^(?:data:|javascript:|mailto:|#)/i.test(reference)) continue;
    const assetUrl = new URL(reference, page);
    if (assetUrl.origin === page.origin) urls.push(assetUrl.toString());
  }
  return [...new Set(urls)];
}

async function assertPublicAssets(html, pageUrl, label) {
  const assetUrls = localAssetUrls(html, pageUrl);
  assert.ok(assetUrls.length > 0, `${label} should reference public assets`);
  for (const assetUrl of assetUrls) {
    const response = await fetchResponse(assetUrl, { redirect: 'manual', cache: 'no-store' });
    assert.equal(response.status, 200, `${assetUrl} expected HTTP 200, got ${response.status}`);
    const body = await response.arrayBuffer();
    assert.ok(body.byteLength > 0, `${assetUrl} should not be empty`);
  }
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

function compareOrdinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateManifestFileInventory(manifest) {
  assert.equal(Array.isArray(manifest.files), true, 'Pages deployment manifest files array');
  assert.equal(manifest.files.length, manifest.fileCount, 'Pages deployment manifest file inventory count');
  const treeHash = crypto.createHash('sha256');
  const seen = new Set();
  let totalBytes = 0;
  let previousPath = '';

  manifest.files.forEach((file, index) => {
    assert.deepEqual(Object.keys(file).sort(), ['bytes', 'path', 'sha256'], `Pages deployment manifest file ${index} closed schema`);
    assert.equal(typeof file.path, 'string', `Pages deployment manifest file ${index} path`);
    assert.ok(file.path && !file.path.includes('\\') && !file.path.startsWith('/'), `Pages deployment manifest file ${index} safe relative path`);
    const segments = file.path.split('/');
    assert.ok(segments.every(segment => segment && segment !== '.' && segment !== '..' && !segment.startsWith('.')), `Pages deployment manifest file ${index} safe path segments`);
    assert.notEqual(file.path, 'pages-deployment.json', 'Pages deployment manifest excludes itself');
    assert.equal(seen.has(file.path), false, `Pages deployment manifest file ${index} unique path`);
    if (index > 0) assert.equal(compareOrdinal(previousPath, file.path), -1, `Pages deployment manifest file ${index} ordinal path order`);
    assert.equal(Number.isInteger(file.bytes), true, `Pages deployment manifest file ${index} byte count integer`);
    assert.ok(file.bytes >= 0, `Pages deployment manifest file ${index} byte count nonnegative`);
    assert.match(file.sha256, /^[0-9a-f]{64}$/, `Pages deployment manifest file ${index} SHA-256`);
    seen.add(file.path);
    previousPath = file.path;
    totalBytes += file.bytes;
    treeHash.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`, 'utf8');
  });

  assert.equal(totalBytes, manifest.totalBytes, 'Pages deployment manifest inventory byte total');
  assert.equal(treeHash.digest('hex'), manifest.artifactDigest, 'Pages deployment manifest inventory tree digest');
}

function validateDeploymentReleaseEvidence(releaseEvidence) {
  assert.ok(releaseEvidence && typeof releaseEvidence === 'object' && !Array.isArray(releaseEvidence), 'Pages deployment manifest releaseEvidence object');
  assert.deepEqual(Object.keys(releaseEvidence).sort(), ['dimensions', 'generatedAt', 'releaseHistory', 'runId', 'schemaVersion', 'sourceCommitSha'], 'Pages deployment manifest releaseEvidence closed schema');
  assert.equal(releaseEvidence.schemaVersion, publicEvidenceSchema.SCHEMA_VERSION, 'Pages deployment manifest public evidence schema version');
  assert.match(releaseEvidence.runId, /^\d{8}-\d{6}$/, 'Pages deployment manifest releaseEvidence runId');
  assert.match(releaseEvidence.generatedAt, /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/, 'Pages deployment manifest releaseEvidence generatedAt');
  assert.ok(Number.isFinite(Date.parse(releaseEvidence.generatedAt.replace(' ', 'T'))), 'Pages deployment manifest releaseEvidence generatedAt parseable');
  assert.match(releaseEvidence.sourceCommitSha, /^[0-9a-f]{40}$/i, 'Pages deployment manifest releaseEvidence sourceCommitSha');
  assert.deepEqual(releaseEvidence.dimensions, [
    { id: 'release', pass: true },
    { id: 'steel', pass: true },
    { id: 'rc', pass: true },
    { id: 'delivery', pass: true },
  ], 'Pages deployment manifest binds all four complete public evidence dimensions');
  assert.deepEqual(Object.keys(releaseEvidence.releaseHistory || {}).sort(), ['changePolicyVersion', 'latestClassification', 'latestReductionCount', 'latestRunId', 'oldestRunId', 'retainedCount', 'schemaVersion'], 'Pages deployment manifest release history closed schema');
  assert.equal(releaseEvidence.releaseHistory.schemaVersion, publicEvidenceSchema.RELEASE_HISTORY_SCHEMA_VERSION, 'Pages deployment manifest release history schema version');
  assert.equal(releaseEvidence.releaseHistory.changePolicyVersion, publicEvidenceSchema.CHANGE_POLICY_VERSION, 'Pages deployment manifest release change policy version');
  assert.ok(Number.isInteger(releaseEvidence.releaseHistory.retainedCount)
    && releaseEvidence.releaseHistory.retainedCount > 0
    && releaseEvidence.releaseHistory.retainedCount <= publicEvidenceSchema.RELEASE_HISTORY_LIMIT, 'Pages deployment manifest release history count is bounded');
  assert.match(releaseEvidence.releaseHistory.oldestRunId, /^\d{8}-\d{6}$/, 'Pages deployment manifest oldest retained release runId');
  assert.equal(releaseEvidence.releaseHistory.latestRunId, releaseEvidence.runId, 'Pages deployment manifest release history ends at current release');
  assert.ok(publicEvidenceSchema.CHANGE_CLASSIFICATIONS.includes(releaseEvidence.releaseHistory.latestClassification), 'Pages deployment manifest release change classification');
  assert.ok(Number.isInteger(releaseEvidence.releaseHistory.latestReductionCount) && releaseEvidence.releaseHistory.latestReductionCount >= 0, 'Pages deployment manifest release reduction count');
}

function artifactFileUrl(base, relativePath, runId) {
  const encodedPath = relativePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const url = new URL(encodedPath, base);
  url.searchParams.set('artifact_check', String(runId));
  return url.toString();
}

function validatePublishedFileContent(file, content) {
  assert.equal(content.byteLength, file.bytes, `${file.path} deployed byte count`);
  assert.equal(crypto.createHash('sha256').update(content).digest('hex'), file.sha256, `${file.path} deployed SHA-256`);
}

async function assertPublishedArtifact(base, manifest) {
  validateManifestFileInventory(manifest);
  let cursor = 0;
  const workerCount = Math.min(8, manifest.files.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < manifest.files.length) {
      const index = cursor;
      cursor += 1;
      const file = manifest.files[index];
      const url = artifactFileUrl(base, file.path, manifest.runId);
      const response = await fetchResponse(url, { redirect: 'manual', cache: 'no-store' });
      assert.equal(response.status, 200, `${url} expected HTTP 200, got ${response.status}`);
      const content = Buffer.from(await response.arrayBuffer());
      validatePublishedFileContent(file, content);
    }
  });
  await Promise.all(workers);
}

async function assertDeploymentManifest(base) {
  const manifest = await fetchJson(liveUrl(base, 'pages-deployment.json'));
  assert.equal(manifest.schemaVersion, 3, 'Pages deployment manifest schemaVersion');
  assert.equal(manifest.kind, 'pages-deployment', 'Pages deployment manifest kind');
  assert.match(manifest.generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'Pages deployment manifest generatedAt');
  assert.match(manifest.commitSha, /^[0-9a-f]{40}$/i, 'Pages deployment manifest commitSha');
  assert.equal(typeof manifest.sourceRef, 'string', 'Pages deployment manifest sourceRef');
  assert.ok(manifest.sourceRef, 'Pages deployment manifest sourceRef populated');
  assert.equal(typeof manifest.sourceDirty, 'boolean', 'Pages deployment manifest sourceDirty boolean');
  assert.equal(typeof manifest.runId, 'string', 'Pages deployment manifest runId');
  assert.ok(manifest.runId, 'Pages deployment manifest runId populated');
  assert.equal(Number.isInteger(manifest.runAttempt), true, 'Pages deployment manifest runAttempt integer');
  assert.ok(manifest.runAttempt >= 1, 'Pages deployment manifest runAttempt positive');
  validateDeploymentReleaseEvidence(manifest.releaseEvidence);
  assert.equal(manifest.artifactDigestAlgorithm, 'sha256-tree-v1', 'Pages deployment manifest digest algorithm');
  assert.match(manifest.artifactDigest, /^[0-9a-f]{64}$/i, 'Pages deployment manifest artifactDigest');
  assert.equal(Number.isInteger(manifest.fileCount), true, 'Pages deployment manifest fileCount integer');
  assert.ok(manifest.fileCount > 0, 'Pages deployment manifest contains published files');
  assert.equal(Number.isInteger(manifest.totalBytes), true, 'Pages deployment manifest totalBytes integer');
  assert.ok(manifest.totalBytes > 0, 'Pages deployment manifest totalBytes positive');
  validateManifestFileInventory(manifest);

  const expectedCommitSha = (argValue('--expected-commit-sha') || process.env.PAGES_EXPECTED_COMMIT_SHA || '').toLowerCase();
  const expectedRunId = argValue('--expected-run-id') || process.env.PAGES_EXPECTED_RUN_ID || '';
  if (expectedCommitSha) {
    assert.match(expectedCommitSha, /^[0-9a-f]{40}$/, 'expected Pages commit SHA');
    assert.equal(manifest.commitSha.toLowerCase(), expectedCommitSha, 'deployed Pages commit matches the requested source commit');
  }
  if (expectedRunId) {
    assert.equal(manifest.runId, String(expectedRunId), 'deployed Pages runId matches the current workflow run');
  }
  if (hasArg('--expect-clean-source') || process.env.PAGES_EXPECT_CLEAN_SOURCE === '1') {
    assert.equal(manifest.sourceDirty, false, 'deployed Pages manifest must come from a clean source checkout');
  }
  return manifest;
}

function assertStatusPayload(payload, label) {
  assert.equal(payload.publicEvidenceSchemaVersion, publicEvidenceSchema.SCHEMA_VERSION, `${label} publicEvidenceSchemaVersion`);
  assert.equal(payload.snapshotVersion, 1, `${label} snapshotVersion`);
  assert.equal(typeof payload.kind, 'string', `${label} kind`);
  assert.equal(typeof payload.generatedAt, 'string', `${label} generatedAt`);
  assert.equal(typeof payload.runId, 'string', `${label} runId`);
  assert.ok(payload.runId, `${label} runId populated`);
  assert.equal(payload.pass, true, `${label} pass`);
  assert.equal(Number.isInteger(payload.failureCount), true, `${label} failureCount integer`);
  assert.equal(payload.failureCount, 0, `${label} failureCount`);
  assert.equal(typeof payload.sourcePath, 'string', `${label} sourcePath`);
  assert.match(payload.sourceHash, /^[0-9a-f]{64}$/i, `${label} sourceHash`);
  assert.equal(JSON.stringify(payload).includes('C:\\'), false, `${label} must not expose Windows paths`);
}

async function assertOldOutputNotRequired(base) {
  const legacyUrls = [
    liveUrl(base, 'output/audit/platform-status.json'),
    liveUrl(base, 'output/preflight/preflight-summary.json')
  ];
  for (const url of legacyUrls) {
    const response = await fetchResponse(url, { redirect: 'manual', cache: 'no-store' });
    assert.notEqual(response.status, 200, `${url} should not be the homepage status source`);
  }
}

function assertNoLocalWorkspaceLeak(text, label) {
  assert.equal(/C:\\Users\\|Desktop\\AI\\|小工具製作/.test(text), false, `${label} must not expose local workspace paths`);
}

async function assertPublicRouteSamples(base) {
  for (const sample of PUBLIC_ROUTE_SAMPLES) {
    const pageUrl = liveUrl(base, sample.path);
    const html = await fetchText(pageUrl);
    for (const needle of sample.needles) {
      assert.ok(html.includes(needle), `${sample.path} missing public page marker: ${needle}`);
    }
    for (const forbidden of sample.forbidden || []) {
      assert.equal(html.includes(forbidden), false, `${sample.path} contains forbidden stale claim: ${forbidden}`);
    }
    assertNoLocalWorkspaceLeak(html, sample.path);
    if (sample.checkAssets) await assertPublicAssets(html, pageUrl, sample.path);
  }
}

async function assertCleanRouteSamples(base) {
  for (const sample of CLEAN_ROUTE_SAMPLES) {
    const html = await fetchText(liveUrl(base, sample.path));
    assert.ok(html.includes('generated-by: build-pages-clean-routes.js'), `${sample.path} missing generated clean-route marker`);
    assert.ok(html.includes(`content="${sample.source}"`), `${sample.path} missing clean-route source marker`);
    assert.ok(html.includes(sample.targetNeedle), `${sample.path} missing clean-route destination marker`);
    assert.ok(html.includes('window.location.search + window.location.hash'), `${sample.path} does not preserve query and hash`);
    assertNoLocalWorkspaceLeak(html, sample.path);
  }
}

function homeCleanRoutes(homeJs) {
  const routes = [...homeJs.matchAll(/\bhref:\s*['"](\/[^'"]+)['"]/g)].map(match => match[1]);
  const uniqueRoutes = [...new Set(routes)];
  assert.ok(uniqueRoutes.length >= 40, `home.js should expose the complete clean-route inventory, got ${uniqueRoutes.length}`);
  assert.equal(uniqueRoutes.length, routes.length, 'home.js clean routes should be unique');
  return uniqueRoutes;
}

async function assertAllHomeCleanRoutes(base, homeJs) {
  const routes = homeCleanRoutes(homeJs);
  let generatedCount = 0;
  let directCount = 0;
  for (const source of routes) {
    const path = `${source.replace(/^\/+/, '')}/`;
    const html = await fetchText(liveUrl(base, path));
    if (html.includes('generated-by: build-pages-clean-routes.js')) {
      generatedCount += 1;
      assert.ok(html.includes(`content="${source}"`), `${path} missing clean-route source marker`);
      assert.ok(html.includes('pages-clean-route-target'), `${path} missing clean-route destination marker`);
      assert.ok(html.includes('window.location.search + window.location.hash'), `${path} does not preserve query and hash`);
    } else {
      directCount += 1;
      assert.ok(html.length >= 500, `${path} direct public route should return a populated page`);
      assert.ok(/<title>[^<]+<\/title>/i.test(html), `${path} direct public route should expose a page title`);
    }
    assertNoLocalWorkspaceLeak(html, path);
  }
  assert.equal(generatedCount + directCount, routes.length, 'every homepage route should be classified and checked');
  return { total: routes.length, generated: generatedCount, direct: directCount };
}

async function assertPrivateBoundary(base) {
  for (const path of PRIVATE_PATHS) {
    const url = liveUrl(base, path);
    const response = await fetchResponse(url, { redirect: 'manual', cache: 'no-store' });
    assert.notEqual(response.status, 200, `${path} should not be published to Pages`);
  }
}

function environmentInteger(name, fallback, minimum) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < minimum || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`${name} 必須是大於或等於 ${minimum} 的整數。`);
  }
  return Number(raw);
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function runWithTransientRetry(task, options = {}) {
  const attempts = options.attempts ?? 1;
  const delayMs = options.delayMs ?? 5000;
  const sleep = options.sleep || delay;
  const onRetry = options.onRetry || (() => {});
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new Error('HTTP smoke attempts 必須是正整數。');
  if (!Number.isSafeInteger(delayMs) || delayMs < 0) throw new Error('HTTP smoke retry delay 必須是非負整數。');

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (!isTransientSmokeError(error) || attempt >= attempts) throw error;
      onRetry(error, { attempt, nextAttempt: attempt + 1, attempts, delayMs });
      await sleep(delayMs);
    }
  }
  throw new Error('Pages HTTP smoke 未執行。');
}

async function runWithAttemptCount(task, options = {}) {
  let attemptCount = 0;
  try {
    const result = await runWithTransientRetry(async () => {
      attemptCount += 1;
      return task();
    }, options);
    return { result, attemptCount };
  } catch (error) {
    error.pagesHttpSmokeAttemptCount = attemptCount;
    throw error;
  }
}

function writeHttpSmokeResult(filePath, payload) {
  if (!filePath) return;
  const target = path.resolve(filePath);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(payload)}\n`, 'utf8');
  fs.renameSync(temporary, target);
}

async function main() {
  const base = baseUrl();
  const deploymentManifest = await assertDeploymentManifest(base);
  await assertPublishedArtifact(base, deploymentManifest);
  const homeUrl = liveUrl(base, '結構工具箱/');
  const auditDashboardUrl = liveUrl(base, '結構工具箱/audit-dashboard.html');
  const homeJsUrl = liveUrl(base, '結構工具箱/assets/home/home.js');
  const platformStatusUrl = liveUrl(base, '結構工具箱/assets/status/platform-status.json');
  const preflightStatusUrl = liveUrl(base, '結構工具箱/assets/status/preflight-summary.json');
  const reportReadinessStatusUrl = liveUrl(base, '結構工具箱/assets/status/report-readiness-status.json');
  const directPrintBoundaryUrl = liveUrl(base, '結構工具箱/core/direct-print-boundary.css');

  const homeHtml = await fetchText(homeUrl);
  assert.ok(homeHtml.includes('assets/home/home.js'), 'homepage references home.js');

  const auditDashboardHtml = await fetchText(auditDashboardUrl);
  assert.ok(auditDashboardHtml.includes('RC 正式附件完整性'), 'audit dashboard exposes RC formal attachment integrity');
  assert.ok(auditDashboardHtml.includes('./assets/status/report-readiness-status.json'), 'audit dashboard reads the public report readiness snapshot');
  assert.ok(auditDashboardHtml.includes('attachmentIntegrityWrap'), 'audit dashboard keeps the attachment integrity detail table');

  const homeJs = await fetchText(homeJsUrl);
  assert.ok(homeJs.includes("assets/status/platform-status.json"), 'home.js reads platform status asset');
  assert.ok(homeJs.includes("assets/status/preflight-summary.json"), 'home.js reads preflight status asset');
  assert.ok(homeJs.includes("assets/status/report-readiness-status.json"), 'home.js reads report readiness status asset');
  assert.equal(/fetch\(\s*[`'"]\/output\//.test(homeJs), false, 'home.js must not fetch domain-root output paths');
  assert.ok(homeJs.includes("label: '報告閱讀狀態總覽'"), 'home.js keeps report readiness overview label');
  assert.ok(homeJs.includes('頁面上的「優先建議報告閱讀狀態」診斷明細只供公司內部整理計算附件前檢查'), 'home.js keeps page-only diagnostic boundary summary');
  assert.ok(homeJs.includes('計算書預設為可列印的內部審閱，勾選核可後改為正式附件'), 'home.js separates page diagnostics from approval-based document identity');
  assert.ok(homeJs.includes('工程檢核狀態與文件身分分開'), 'home.js explains engineering and document states are independent');
  assert.ok(homeJs.includes('完整檢查'), 'home.js keeps full preflight mode label');
  assert.ok(homeJs.includes('快速檢查'), 'home.js keeps quick preflight mode label');
  assert.ok(homeJs.includes('正式放行'), 'home.js keeps release preflight mode label');
  assert.ok(homeJs.includes('正式交付請以完整檢查或正式放行結果為準。'), 'home.js keeps full-run evidence summary');
  assert.ok(homeJs.includes("cardTag: '報告邊界'"), 'home.js keeps RC report boundary card tag');
  assert.ok(homeJs.includes("cardTag: '輸出邊界'"), 'home.js keeps anchor output boundary card tag');

  const directPrintBoundaryCss = await fetchText(directPrintBoundaryUrl);
  assert.ok(directPrintBoundaryCss.includes('body.formal-tool-output-page > :not(.formal-direct-print-boundary)'), 'formal direct-print stylesheet hides work-page content');
  assert.ok(directPrintBoundaryCss.includes('.formal-direct-print-boundary'), 'formal direct-print stylesheet renders the boundary notice');
  assert.ok(directPrintBoundaryCss.includes('body.local-quick-output-page > :not(.local-quick-direct-print-boundary)'), 'local quick direct-print stylesheet hides work-page content');
  assert.ok(directPrintBoundaryCss.includes('.local-quick-direct-print-boundary'), 'local quick direct-print stylesheet renders the boundary notice');
  assert.ok(directPrintBoundaryCss.includes('body.steel-formal-output-page > :not(.steel-formal-direct-print-boundary)'), 'steel formal direct-print stylesheet hides work-page content');
  assert.ok(directPrintBoundaryCss.includes('.steel-formal-direct-print-boundary'), 'steel formal direct-print stylesheet renders the boundary notice');
  assert.equal(directPrintBoundaryCss.includes('DRAFT'), false, 'formal direct-print stylesheet does not create a DRAFT document');

  const platformStatus = await fetchJson(platformStatusUrl);
  assertStatusPayload(platformStatus, 'platform status');
  assert.equal(platformStatus.kind, 'platform-status', 'platform status kind');
  assert.equal(platformStatus.sourcePath, 'output/audit/platform-status.json', 'platform status sourcePath');

  const preflightStatus = await fetchJson(preflightStatusUrl);
  assertStatusPayload(preflightStatus, 'preflight status');
  assert.equal(preflightStatus.kind, 'preflight-summary', 'preflight status kind');
  assert.equal(preflightStatus.quick, false, 'preflight status should publish latest full run');
  assert.equal(preflightStatus.forcePlatformAudit, true, 'published formal preflight status forced platform audit');
  assert.equal(preflightStatus.forceSlowChecks, true, 'published formal preflight status forced slow checks');
  assert.match(preflightStatus.sourceCommitSha, /^[0-9a-f]{40}$/i, 'preflight status sourceCommitSha git sha');
  assert.equal(typeof preflightStatus.sourceBranch, 'string', 'preflight status sourceBranch string');
  assert.equal(preflightStatus.sourceDirty, false, 'published formal preflight status starts from a clean worktree');
  assert.equal(preflightStatus.slowReuseCount, 0, 'published formal preflight status reused no slow checks');
  assert.equal(preflightStatus.platformAuditReused, false, 'published formal preflight status reran platform audit');
  assert.ok(/^output\/preflight\/(?:history\/[^/]+\/)?preflight-summary\.json$/.test(preflightStatus.sourcePath), 'preflight status sourcePath');
  assert.equal(Number.isInteger(preflightStatus.recordsCount), true, 'preflight recordsCount integer');
  assert.equal(preflightStatus.recordsCount, preflightStatus.passedCount, 'preflight records all passed');
  assert.equal(preflightStatus.postCheckCount, preflightStatus.postChecksPassedCount, 'preflight post-checks all passed');
  assert.equal(deploymentManifest.releaseEvidence.runId, preflightStatus.runId, 'deployment release run matches public preflight status');
  assert.equal(deploymentManifest.releaseEvidence.generatedAt, preflightStatus.generatedAt, 'deployment release timestamp matches public preflight status');
  assert.equal(deploymentManifest.releaseEvidence.sourceCommitSha.toLowerCase(), preflightStatus.sourceCommitSha.toLowerCase(), 'deployment tested source matches public preflight status');

  const reportReadinessStatus = await fetchJson(reportReadinessStatusUrl);
  assertStatusPayload(reportReadinessStatus, 'report readiness status');
  assert.equal(reportReadinessStatus.kind, 'report-readiness-status', 'report readiness status kind');
  assert.equal(reportReadinessStatus.sourcePath, 'output/audit/tool-maturity-matrix.json', 'report readiness status sourcePath');
  assert.equal(reportReadinessStatus.badge, '頁面專用', 'report readiness status badge');
  assert.equal(reportReadinessStatus.label, '報告閱讀狀態總覽', 'report readiness status label');
  assert.equal(reportReadinessStatus.pass, true, 'report readiness status pass');
  assert.equal(reportReadinessStatus.runId, deploymentManifest.releaseEvidence.runId, 'report readiness run matches deployment release evidence');
  const publicEvidenceValidation = publicEvidenceSchema.validatePublicEvidenceBundle({
    platformStatus,
    preflightStatus,
    reportReadinessStatus,
  });
  assert.equal(publicEvidenceValidation.pass, true, `published status bundle satisfies public evidence schema v${publicEvidenceSchema.SCHEMA_VERSION}: ${publicEvidenceValidation.errors.join(', ')}`);
  assert.deepEqual(publicEvidenceValidation.dimensions, deploymentManifest.releaseEvidence.dimensions, 'deployment manifest dimensions match independently revalidated public snapshots');
  assert.equal(publicEvidenceValidation.releaseHistory.entries.length, deploymentManifest.releaseEvidence.releaseHistory.retainedCount, 'deployment manifest release history count matches independently revalidated public snapshots');
  assert.equal(publicEvidenceValidation.releaseHistory.entries[0].runId, deploymentManifest.releaseEvidence.releaseHistory.oldestRunId, 'deployment manifest oldest release matches independently revalidated public snapshots');
  assert.equal(publicEvidenceValidation.releaseHistory.entries.at(-1).change.classification, deploymentManifest.releaseEvidence.releaseHistory.latestClassification, 'deployment manifest latest threshold classification matches independently revalidated public snapshots');
  assert.equal(publicEvidenceValidation.releaseHistory.entries.at(-1).change.reductions.length, deploymentManifest.releaseEvidence.releaseHistory.latestReductionCount, 'deployment manifest latest reduction count matches independently revalidated public snapshots');
  assert.equal(Number.isInteger(reportReadinessStatus.pageOnlyBoundaryRequired), true, 'report readiness required integer');
  assert.equal(reportReadinessStatus.pageOnlyBoundaryComplete, reportReadinessStatus.pageOnlyBoundaryRequired, 'report readiness status fully covered');
  assert.equal(reportReadinessStatus.pageOnlyBoundaryIssueCount, 0, 'report readiness status issues empty');
  assert.equal(Number.isInteger(reportReadinessStatus.reportTextSmokeRequired), true, 'report readiness report text required integer');
  assert.equal(Number.isInteger(reportReadinessStatus.reportTextSmokeComplete), true, 'report readiness report text complete integer');
  assert.equal(Number.isInteger(reportReadinessStatus.reportTextSmokeIssueCount), true, 'report readiness report text issue integer');
  assert.equal(reportReadinessStatus.reportTextSmokeComplete, reportReadinessStatus.reportTextSmokeRequired, 'report readiness report text status fully covered');
  assert.equal(reportReadinessStatus.reportTextSmokeIssueCount, 0, 'report readiness report text issues empty');
  assert.equal(Number.isInteger(reportReadinessStatus.reportTextSmokeEvidenceRequired), true, 'report readiness report text evidence required integer');
  assert.equal(Number.isInteger(reportReadinessStatus.reportTextSmokeEvidenceComplete), true, 'report readiness report text evidence complete integer');
  assert.equal(Number.isInteger(reportReadinessStatus.reportTextSmokeEvidenceIssueCount), true, 'report readiness report text evidence issue integer');
  assert.equal(reportReadinessStatus.reportTextSmokeEvidenceComplete, reportReadinessStatus.reportTextSmokeEvidenceRequired, 'report readiness report text evidence fully covered');
  assert.equal(reportReadinessStatus.reportTextSmokeEvidenceIssueCount, 0, 'report readiness report text evidence issues empty');
  assert.equal(reportReadinessStatus.reportTextSmokeEvidenceRunId, preflightStatus.runId, 'report readiness report text evidence runId matches public preflight');
  assert.equal(Array.isArray(reportReadinessStatus.reportTextSmokeEvidenceGates), true, 'report readiness report text evidence gates array');
  assert.deepEqual(reportReadinessStatus.reportTextSmokeEvidenceUnmappedFamilies, [], 'report readiness report text evidence maps every family');
  assert.ok(reportReadinessStatus.reportTextSmokeEvidenceGates.every(gate => gate.pass && gate.complete === gate.required), 'report readiness report text evidence gates pass');
  assert.ok(String(reportReadinessStatus.reportTextSmokeScope || '').includes('風力 / 地震正式工具'), 'report readiness report text scope includes formal tools');
  assert.ok(String(reportReadinessStatus.reportTextSmokeScope || '').includes('局部快算'), 'report readiness report text scope includes local quick tools');
  assert.ok(String(reportReadinessStatus.reportTextSmokeScope || '').includes('矩陣外工具家族'), 'report readiness report text scope keeps other-family boundary');
  assert.ok(String(reportReadinessStatus.compactSummary || '').includes('頁面診斷明細不進計算書'), 'report readiness compact summary keeps page-only wording');
  assert.ok(String(reportReadinessStatus.compactSummary || '').includes('文件預設內部審閱，明確核可後為正式附件'), 'report readiness compact summary keeps approval-based document classification');
  assert.ok(String(reportReadinessStatus.compactSummary || '').includes('兩者皆可列印'), 'report readiness compact summary keeps printable approval boundary');
  assert.ok([32, 33, 36, 37, 38, 39].includes(reportReadinessStatus.renderedDeliveryEvidenceRequired), 'report readiness rendered delivery covers a supported formal homepage portfolio');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceComplete, reportReadinessStatus.renderedDeliveryEvidenceRequired, 'report readiness rendered delivery fully covered');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceIssueCount, 0, 'report readiness rendered delivery issues empty');
  assert.match(reportReadinessStatus.renderedDeliveryEvidenceRunId, /^\d{8}-\d{6}$/, 'report readiness rendered delivery runId');
  assert.ok(Array.isArray(reportReadinessStatus.renderedDeliveryEvidenceFamilies) && reportReadinessStatus.renderedDeliveryEvidenceFamilies.length >= 6, 'report readiness rendered delivery family coverage');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceFamilies.reduce((sum, family) => sum + family.complete, 0), reportReadinessStatus.renderedDeliveryEvidenceComplete, 'report readiness rendered delivery family totals');
  assert.ok(String(reportReadinessStatus.renderedDeliveryEvidenceSummary || '').includes('實際交付物渲染'), 'report readiness rendered delivery summary');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceSourcePath, `output/preflight/history/${reportReadinessStatus.renderedDeliveryEvidenceRunId}/rendered-delivery-evidence/rendered-delivery-evidence-summary.json`, 'report readiness rendered delivery source path');
  assert.match(reportReadinessStatus.renderedDeliveryEvidenceSourceHash, /^[0-9a-f]{64}$/i, 'report readiness rendered delivery source hash');
  assert.ok([143, 145, 151, 157, 163, 165].includes(reportReadinessStatus.deliveryFileIntegrityRequired), 'report readiness exposes a supported complete redacted delivery file count');
  assert.equal(reportReadinessStatus.deliveryFileIntegrityVerified, reportReadinessStatus.deliveryFileIntegrityRequired, 'report readiness verifies every redacted delivery file');
  assert.equal(reportReadinessStatus.deliveryFileIntegrityIssueCount, 0, 'report readiness delivery file integrity issues empty');
  assert.equal(reportReadinessStatus.deliveryFileIntegrityPass, true, 'report readiness delivery file integrity passes');
  assert.ok([
    JSON.stringify([['formalPdfEvidence', 64, 64], ['rcRenderedVisual', 66, 66], ['mixedFormat', 13, 13]]),
    JSON.stringify([['formalPdfEvidence', 66, 66], ['rcRenderedVisual', 66, 66], ['mixedFormat', 13, 13]]),
    JSON.stringify([['formalPdfEvidence', 72, 72], ['rcRenderedVisual', 66, 66], ['mixedFormat', 13, 13]]),
    JSON.stringify([['formalPdfEvidence', 78, 78], ['rcRenderedVisual', 66, 66], ['mixedFormat', 13, 13]]),
    JSON.stringify([['formalPdfEvidence', 84, 84], ['rcRenderedVisual', 66, 66], ['mixedFormat', 13, 13]]),
    JSON.stringify([['formalPdfEvidence', 86, 86], ['rcRenderedVisual', 66, 66], ['mixedFormat', 13, 13]]),
  ].includes(JSON.stringify(reportReadinessStatus.deliveryFileIntegrityBreakdown.map(item => [item.key, item.required, item.verified]))), 'report readiness exposes the three redacted delivery integrity groups');
  assert.ok(reportReadinessStatus.deliveryFileIntegrityBreakdown.every(item => item.pass && item.issueCount === 0), 'report readiness delivery integrity groups pass');
  const deliveryFileIntegrityJson = JSON.stringify(reportReadinessStatus.deliveryFileIntegrityBreakdown);
  const reportReadinessJson = JSON.stringify(reportReadinessStatus);
  assert.equal(/sha256|artifact|filename|bytes/i.test(deliveryFileIntegrityJson), false, 'report readiness redacted delivery integrity omits private artifact evidence');
  assert.equal(/canonicalArtifactIntegrity|rcVisualArtifactIntegrity|mixedArtifactIntegrity/.test(JSON.stringify(reportReadinessStatus)), false, 'report readiness does not publish private aggregate property names');
  assert.equal(reportReadinessStatus.docxPackageIntegrityRequired, 4, 'report readiness expects 4 formal DOCX package checks');
  assert.equal(reportReadinessStatus.docxPackageIntegrityComplete, reportReadinessStatus.docxPackageIntegrityRequired, 'report readiness completes every formal DOCX package check');
  assert.equal(reportReadinessStatus.docxPackageIntegrityIssueCount, 0, 'report readiness formal DOCX package issues empty');
  assert.equal(reportReadinessStatus.docxPackageIntegrityPass, true, 'report readiness formal DOCX package checks pass');
  assert.equal(reportReadinessJson.includes('"docxPackageIntegrityRecords"'), false, 'report readiness omits private DOCX package records');
  assert.equal(reportReadinessStatus.xlsxPackageIntegrityRequired, 1, 'report readiness expects 1 formal XLSX package check');
  assert.equal(reportReadinessStatus.xlsxPackageIntegrityComplete, reportReadinessStatus.xlsxPackageIntegrityRequired, 'report readiness completes the formal XLSX package check');
  assert.equal(reportReadinessStatus.xlsxPackageIntegrityIssueCount, 0, 'report readiness formal XLSX package issues empty');
  assert.equal(reportReadinessStatus.xlsxPackageIntegrityPass, true, 'report readiness formal XLSX package check passes');
  assert.equal(reportReadinessJson.includes('"xlsxPackageIntegrityRecords"'), false, 'report readiness omits private XLSX package records');
  assert.equal(reportReadinessStatus.xlsxPrintVisualRequired, 1, 'report readiness expects 1 formal XLSX Office print check');
  assert.equal(reportReadinessStatus.xlsxPrintVisualComplete, reportReadinessStatus.xlsxPrintVisualRequired, 'report readiness completes the formal XLSX Office print check');
  assert.equal(reportReadinessStatus.xlsxPrintVisualSheetRequired, 9, 'report readiness expects all 9 XLSX worksheets');
  assert.equal(reportReadinessStatus.xlsxPrintVisualSheetComplete, reportReadinessStatus.xlsxPrintVisualSheetRequired, 'report readiness completes every XLSX worksheet visual print check');
  assert.equal(reportReadinessStatus.xlsxPrintVisualIssueCount, 0, 'report readiness formal XLSX Office print issues empty');
  assert.equal(reportReadinessStatus.xlsxPrintVisualPass, true, 'report readiness formal XLSX Office print check passes');
  assert.equal(reportReadinessJson.includes('"xlsxPrintVisualRecords"'), false, 'report readiness omits private XLSX Office print records');
  assert.equal(reportReadinessStatus.xlsxContentSealRequired, 1, 'report readiness expects 1 formal XLSX content seal');
  assert.equal(reportReadinessStatus.xlsxContentSealComplete, reportReadinessStatus.xlsxContentSealRequired, 'report readiness completes the formal XLSX content seal');
  assert.equal(reportReadinessStatus.xlsxApprovalSealRequired, 1, 'report readiness expects 1 formal XLSX approval seal');
  assert.equal(reportReadinessStatus.xlsxApprovalSealComplete, reportReadinessStatus.xlsxApprovalSealRequired, 'report readiness completes the formal XLSX approval seal');
  assert.equal(reportReadinessStatus.xlsxDualSealIssueCount, 0, 'report readiness formal XLSX dual seal issues empty');
  assert.equal(reportReadinessStatus.xlsxDualSealPass, true, 'report readiness formal XLSX dual seals pass');
  assert.equal(reportReadinessJson.includes('"xlsxDualSealRecords"'), false, 'report readiness omits private XLSX dual seal records');
  assert.equal(/anchor-xlsx-calculation-book-(?:content|approval)-v1|"(?:content|approval)Sha256"/.test(reportReadinessJson), false, 'report readiness omits XLSX seal scopes and values');
  assert.equal(reportReadinessStatus.formalResultReconciliationRequired, 14, 'report readiness expects 14 formal result reconciliations');
  assert.equal(reportReadinessStatus.formalResultReconciliationComplete, reportReadinessStatus.formalResultReconciliationRequired, 'report readiness completes every formal result reconciliation');
  assert.equal(reportReadinessStatus.formalResultReconciliationIssueCount, 0, 'report readiness formal result reconciliation issues empty');
  assert.equal(reportReadinessStatus.formalResultReconciliationPass, true, 'report readiness formal result reconciliation passes');
  assert.equal(reportReadinessJson.includes('"formalResultReconciliation":'), false, 'report readiness omits the private reconciliation aggregate');
  assert.equal(/formal-golden-result-to-report-fingerprint|goldenCase|calculationFingerprint/.test(reportReadinessJson), false, 'report readiness omits private reconciliation scope, case identity and fingerprints');
  assert.equal(reportReadinessStatus.rcResultReconciliationRequired, 34, 'report readiness expects 34 RC design and retrofit result reconciliations');
  assert.equal(reportReadinessStatus.rcResultReconciliationComplete, reportReadinessStatus.rcResultReconciliationRequired, 'report readiness completes every RC result reconciliation');
  assert.equal(reportReadinessStatus.rcResultReconciliationIssueCount, 0, 'report readiness RC result reconciliation issues empty');
  assert.equal(reportReadinessStatus.rcResultReconciliationPass, true, 'report readiness RC result reconciliation passes');
  assert.equal(reportReadinessJson.includes('"rcResultReconciliation":'), false, 'report readiness omits the private RC reconciliation aggregate');
  assert.equal(/rc-(?:project|source|form)-replay-to-report-fingerprint|sourceSnapshotSha256|"caseId"/.test(reportReadinessJson), false, 'report readiness omits private RC reconciliation scope, case identity and source snapshot hashes');
  assert.equal(reportReadinessStatus.rcSourceReportPackageRequired, 32, 'report readiness expects 32 RC real source/report package checks');
  assert.equal(reportReadinessStatus.rcSourceReportPackageComplete, reportReadinessStatus.rcSourceReportPackageRequired, 'report readiness completes every RC source/report package check');
  assert.equal(reportReadinessStatus.rcSourceReportPackageIssueCount, 0, 'report readiness RC source/report package issues empty');
  assert.equal(reportReadinessStatus.rcSourceReportPackagePass, true, 'report readiness RC source/report package checks pass');
  assert.equal(reportReadinessJson.includes('"rcSourceReportPackage":'), false, 'report readiness omits the private RC source/report package aggregate');
  assert.equal(/rc-real-source-json-to-formal-html-package-check|fingerprintLinkCount|"fingerprint"/.test(reportReadinessJson), false, 'report readiness omits private RC source/report package scope and fingerprints');
  assert.equal(reportReadinessStatus.rcStandaloneFormalHtmlPrintRequired, 34, 'report readiness expects 34 RC standalone formal HTML print checks');
  assert.equal(reportReadinessStatus.rcStandaloneFormalHtmlPrintComplete, reportReadinessStatus.rcStandaloneFormalHtmlPrintRequired, 'report readiness completes every RC standalone formal HTML print check');
  assert.equal(reportReadinessStatus.rcStandaloneFormalHtmlPrintIssueCount, 0, 'report readiness RC standalone formal HTML print issues empty');
  assert.equal(reportReadinessStatus.rcStandaloneFormalHtmlPrintPass, true, 'report readiness RC standalone formal HTML print checks pass');
  assert.equal(reportReadinessJson.includes('"rcStandaloneFormalHtmlPrint":'), false, 'report readiness omits the private RC standalone formal HTML print aggregate');
  assert.equal(/rc-approved-standalone-html-to-validated-pdf|externalRequestCount|standalonePrintArtifacts/.test(reportReadinessJson), false, 'report readiness omits private RC standalone formal HTML print scope and artifact details');
  assert.equal(reportReadinessStatus.rcFormalHtmlContentSealRequired, 34, 'report readiness expects 34 RC formal HTML content seal checks');
  assert.equal(reportReadinessStatus.rcFormalHtmlContentSealComplete, reportReadinessStatus.rcFormalHtmlContentSealRequired, 'report readiness completes every RC formal HTML content seal check');
  assert.equal(reportReadinessStatus.rcFormalHtmlContentSealIssueCount, 0, 'report readiness RC formal HTML content seal issues empty');
  assert.equal(reportReadinessStatus.rcFormalHtmlContentSealPass, true, 'report readiness RC formal HTML content seal checks pass');
  assert.equal(reportReadinessJson.includes('"rcFormalHtmlContentSeal":'), false, 'report readiness omits the private RC formal HTML content seal aggregate');
  assert.equal(/rc-formal-html-reproducible-content-sha256|"contentSha256"|contentSealArtifacts/.test(reportReadinessJson), false, 'report readiness omits private RC formal HTML content seal scope and artifact details');
  assert.equal(reportReadinessStatus.rcFormalHtmlApprovalSealRequired, 34, 'report readiness expects 34 RC formal HTML approval seal checks');
  assert.equal(reportReadinessStatus.rcFormalHtmlApprovalSealComplete, reportReadinessStatus.rcFormalHtmlApprovalSealRequired, 'report readiness completes every RC formal HTML approval seal check');
  assert.equal(reportReadinessStatus.rcFormalHtmlApprovalSealIssueCount, 0, 'report readiness RC formal HTML approval seal issues empty');
  assert.equal(reportReadinessStatus.rcFormalHtmlApprovalSealPass, true, 'report readiness RC formal HTML approval seal checks pass');
  assert.equal(reportReadinessJson.includes('"rcFormalHtmlApprovalSeal":'), false, 'report readiness omits the private RC formal HTML approval seal aggregate');
  assert.equal(/rc-formal-html-reproducible-approval-sha256|"approvalSha256"|approvalSealArtifacts/.test(reportReadinessJson), false, 'report readiness omits private RC formal HTML approval seal scope and artifact details');
  assert.equal(reportReadinessStatus.formalHtmlContentSealRequired, 14, 'report readiness expects 14 formal-tool HTML content seal checks');
  assert.equal(reportReadinessStatus.formalHtmlContentSealComplete, reportReadinessStatus.formalHtmlContentSealRequired, 'report readiness completes every formal-tool HTML content seal check');
  assert.equal(reportReadinessStatus.formalHtmlContentSealIssueCount, 0, 'report readiness formal-tool HTML content seal issues empty');
  assert.equal(reportReadinessStatus.formalHtmlContentSealPass, true, 'report readiness formal-tool HTML content seal checks pass');
  assert.equal(reportReadinessStatus.formalHtmlApprovalSealRequired, 14, 'report readiness expects 14 formal-tool HTML approval seal checks');
  assert.equal(reportReadinessStatus.formalHtmlApprovalSealComplete, reportReadinessStatus.formalHtmlApprovalSealRequired, 'report readiness completes every formal-tool HTML approval seal check');
  assert.equal(reportReadinessStatus.formalHtmlApprovalSealIssueCount, 0, 'report readiness formal-tool HTML approval seal issues empty');
  assert.equal(reportReadinessStatus.formalHtmlApprovalSealPass, true, 'report readiness formal-tool HTML approval seal checks pass');
  assert.equal(reportReadinessJson.includes('"formalHtmlContentSeal":'), false, 'report readiness omits the private formal-tool HTML content seal aggregate');
  assert.equal(reportReadinessJson.includes('"formalHtmlApprovalSeal":'), false, 'report readiness omits the private formal-tool HTML approval seal aggregate');
  assert.equal(/formal-tools-html-reproducible-(?:content|approval)-sha256|"htmlArtifact"|"contentSha256"|"approvalSha256"/.test(reportReadinessJson), false, 'report readiness omits private formal-tool seal scopes, artifacts, and hashes');
  assert.ok([5, 6].includes(reportReadinessStatus.steelHtmlContentSealRequired), 'report readiness expects a supported 5-to-6 steel formal HTML content seal transition count');
  assert.equal(reportReadinessStatus.steelHtmlContentSealComplete, reportReadinessStatus.steelHtmlContentSealRequired, 'report readiness completes every steel formal HTML content seal check');
  assert.equal(reportReadinessStatus.steelHtmlContentSealIssueCount, 0, 'report readiness steel formal HTML content seal issues empty');
  assert.equal(reportReadinessStatus.steelHtmlContentSealPass, true, 'report readiness steel formal HTML content seal checks pass');
  assert.ok([5, 6].includes(reportReadinessStatus.steelHtmlApprovalSealRequired), 'report readiness expects a supported 5-to-6 steel formal HTML approval seal transition count');
  assert.equal(reportReadinessStatus.steelHtmlApprovalSealComplete, reportReadinessStatus.steelHtmlApprovalSealRequired, 'report readiness completes every steel formal HTML approval seal check');
  assert.equal(reportReadinessStatus.steelHtmlApprovalSealIssueCount, 0, 'report readiness steel formal HTML approval seal issues empty');
  assert.equal(reportReadinessStatus.steelHtmlApprovalSealPass, true, 'report readiness steel formal HTML approval seal checks pass');
  assert.equal(reportReadinessJson.includes('"steelHtmlContentSeal":'), false, 'report readiness omits the private steel formal HTML content seal aggregate');
  assert.equal(reportReadinessJson.includes('"steelHtmlApprovalSeal":'), false, 'report readiness omits the private steel formal HTML approval seal aggregate');
  assert.equal(/steel-formal-html-reproducible-(?:content|approval)-sha256/.test(reportReadinessJson), false, 'report readiness omits private steel formal HTML seal scopes');
  assert.equal(reportReadinessStatus.anchorHtmlContentSealRequired, 1, 'report readiness expects 1 anchor formal HTML content seal check');
  assert.equal(reportReadinessStatus.anchorHtmlContentSealComplete, reportReadinessStatus.anchorHtmlContentSealRequired, 'report readiness completes every anchor formal HTML content seal check');
  assert.equal(reportReadinessStatus.anchorHtmlContentSealIssueCount, 0, 'report readiness anchor formal HTML content seal issues empty');
  assert.equal(reportReadinessStatus.anchorHtmlContentSealPass, true, 'report readiness anchor formal HTML content seal checks pass');
  assert.equal(reportReadinessStatus.anchorHtmlApprovalSealRequired, 1, 'report readiness expects 1 anchor formal HTML approval seal check');
  assert.equal(reportReadinessStatus.anchorHtmlApprovalSealComplete, reportReadinessStatus.anchorHtmlApprovalSealRequired, 'report readiness completes every anchor formal HTML approval seal check');
  assert.equal(reportReadinessStatus.anchorHtmlApprovalSealIssueCount, 0, 'report readiness anchor formal HTML approval seal issues empty');
  assert.equal(reportReadinessStatus.anchorHtmlApprovalSealPass, true, 'report readiness anchor formal HTML approval seal checks pass');
  assert.equal(reportReadinessJson.includes('"anchorHtmlContentSeal":'), false, 'report readiness omits the private anchor formal HTML content seal aggregate');
  assert.equal(reportReadinessJson.includes('"anchorHtmlApprovalSeal":'), false, 'report readiness omits the private anchor formal HTML approval seal aggregate');
  assert.equal(/anchor-formal-html-reproducible-(?:content|approval)-sha256/.test(reportReadinessJson), false, 'report readiness omits private anchor formal HTML seal scopes');
  assert.ok([5, 6].includes(reportReadinessStatus.steelResultReconciliationRequired), 'report readiness expects a supported 5-to-6 steel result reconciliation transition count');
  assert.equal(reportReadinessStatus.steelResultReconciliationComplete, reportReadinessStatus.steelResultReconciliationRequired, 'report readiness completes every steel result reconciliation');
  assert.equal(reportReadinessStatus.steelResultReconciliationIssueCount, 0, 'report readiness steel result reconciliation issues empty');
  assert.equal(reportReadinessStatus.steelResultReconciliationPass, true, 'report readiness steel result reconciliation passes');
  assert.equal(reportReadinessJson.includes('"steelResultReconciliation":'), false, 'report readiness omits the private steel reconciliation aggregate');
  assert.equal(/steel-source-replay-to-report-fingerprint|sourcePayloadSha256|"caseId"/.test(reportReadinessJson), false, 'report readiness omits private steel reconciliation scope, case identity and source payload hashes');
  assert.equal(reportReadinessStatus.stoneResultReconciliationRequired, 1, 'report readiness expects 1 stone result reconciliation');
  assert.equal(reportReadinessStatus.stoneResultReconciliationComplete, reportReadinessStatus.stoneResultReconciliationRequired, 'report readiness completes the stone result reconciliation');
  assert.equal(reportReadinessStatus.stoneResultReconciliationIssueCount, 0, 'report readiness stone result reconciliation issues empty');
  assert.equal(reportReadinessStatus.stoneResultReconciliationPass, true, 'report readiness stone result reconciliation passes');
  assert.equal(reportReadinessJson.includes('"stoneResultReconciliation":'), false, 'report readiness omits the private stone reconciliation aggregate');
  assert.equal(/stone-golden-replay-to-pdf-docx-hash|goldenCaseSha256|goldenInputSha256|pdfSha256|docxSha256|auditSha256|resultHash/.test(reportReadinessJson), false, 'report readiness omits private stone reconciliation scope and hashes');
  assert.equal(reportReadinessStatus.anchorResultReconciliationRequired, 1, 'report readiness expects 1 anchor result reconciliation');
  assert.equal(reportReadinessStatus.anchorResultReconciliationComplete, reportReadinessStatus.anchorResultReconciliationRequired, 'report readiness completes the anchor result reconciliation');
  assert.equal(reportReadinessStatus.anchorResultReconciliationIssueCount, 0, 'report readiness anchor result reconciliation issues empty');
  assert.equal(reportReadinessStatus.anchorResultReconciliationPass, true, 'report readiness anchor result reconciliation passes');
  assert.equal(reportReadinessJson.includes('"anchorResultReconciliation":'), false, 'report readiness omits the private anchor reconciliation aggregate');
  assert.equal(/anchor-workspace-replay-to-html-docx-xlsx-hash|sourceBackupSha256|sourceReplayFingerprint|htmlSha256|workbookSha256/.test(reportReadinessJson), false, 'report readiness omits private anchor reconciliation scope and hashes');
  assert.equal(reportReadinessStatus.deckingResultReconciliationRequired, 1, 'report readiness expects 1 decking result reconciliation');
  assert.equal(reportReadinessStatus.deckingResultReconciliationComplete, reportReadinessStatus.deckingResultReconciliationRequired, 'report readiness completes the decking result reconciliation');
  assert.equal(reportReadinessStatus.deckingResultReconciliationIssueCount, 0, 'report readiness decking result reconciliation issues empty');
  assert.equal(reportReadinessStatus.deckingResultReconciliationPass, true, 'report readiness decking result reconciliation passes');
  assert.equal(reportReadinessJson.includes('"deckingResultReconciliation":'), false, 'report readiness omits the private decking reconciliation aggregate');
  assert.equal(/decking-json-replay-to-docx-hash|sourceJsonSha256|decking-report-source\.json/.test(reportReadinessJson), false, 'report readiness omits private decking reconciliation scope and hashes');
  assert.equal(reportReadinessStatus.excavationResultReconciliationRequired, 1, 'report readiness expects 1 excavation result reconciliation');
  assert.equal(reportReadinessStatus.excavationResultReconciliationComplete, reportReadinessStatus.excavationResultReconciliationRequired, 'report readiness completes the excavation result reconciliation');
  assert.equal(reportReadinessStatus.excavationResultReconciliationIssueCount, 0, 'report readiness excavation result reconciliation issues empty');
  assert.equal(reportReadinessStatus.excavationResultReconciliationPass, true, 'report readiness excavation result reconciliation passes');
  assert.equal(reportReadinessJson.includes('"excavationResultReconciliation":'), false, 'report readiness omits the private excavation reconciliation aggregate');
  assert.equal(/excavation-project-state-replay-to-pdf-docx-hash|sourceProjectSha256|resultSha256|excavation-project-state\.json/.test(reportReadinessJson), false, 'report readiness omits private excavation reconciliation scope and hashes');
  assert.ok([3, 4, 5, 6].includes(reportReadinessStatus.localQuickResultReconciliationRequired), 'report readiness uses the supported 3-to-6 local quick result reconciliation transition');
  assert.equal(reportReadinessStatus.localQuickResultReconciliationComplete, reportReadinessStatus.localQuickResultReconciliationRequired, 'report readiness completes every local quick result reconciliation');
  assert.equal(reportReadinessStatus.localQuickResultReconciliationIssueCount, 0, 'report readiness local quick result reconciliation issues empty');
  assert.equal(reportReadinessStatus.localQuickResultReconciliationPass, true, 'report readiness local quick result reconciliation passes');
  assert.equal(reportReadinessJson.includes('"localQuickResultReconciliation":'), false, 'report readiness omits the private local quick reconciliation aggregate');
  assert.equal(/local-quick-json-replay-to-pdf-hash|sourceJsonSha256|sourceInputSha256|sourceResultSha256|replayResultSha256/.test(reportReadinessJson), false, 'report readiness omits private local quick reconciliation scope and hashes');
  if (Number.isInteger(reportReadinessStatus.supplementalDeliveryEvidenceRequired)) {
    assert.ok([1, 2].includes(reportReadinessStatus.supplementalDeliveryEvidenceRequired), 'report readiness supplemental delivery uses a supported transition count');
    assert.equal(reportReadinessStatus.supplementalDeliveryEvidenceComplete, reportReadinessStatus.supplementalDeliveryEvidenceRequired, 'report readiness supplemental delivery fully covered');
    assert.equal(reportReadinessStatus.supplementalDeliveryEvidenceIssueCount, 0, 'report readiness supplemental delivery issues empty');
    assert.ok(reportReadinessStatus.supplementalDeliveryEvidenceFamilies.some(item => item.family === 'excavation-formal' && item.complete === 1), 'report readiness supplemental delivery keeps excavation service coverage');
    if (reportReadinessStatus.supplementalDeliveryEvidenceRequired === 2) {
      assert.deepEqual(reportReadinessStatus.supplementalDeliveryEvidenceFamilies, [{ family: 'excavation-formal', complete: 1 }, { family: 'seismic-report', complete: 1 }], 'report readiness supplemental delivery covers report and service families');
      assert.ok(String(reportReadinessStatus.supplementalDeliveryEvidenceSummary || '').includes('補充報告 / 服務實際交付物渲染'), 'report readiness supplemental delivery summary');
      assert.ok(String(reportReadinessStatus.renderedDeliveryEvidenceSummary || '').includes('補充報告 / 服務成品'), 'report readiness rendered delivery summary includes supplemental report and service evidence');
    }
  }
  assert.equal(reportReadinessStatus.attachmentIntegrityRequired, 34, 'report readiness expects 34 RC HTML attachments');
  assert.equal(reportReadinessStatus.attachmentIntegrityActual, reportReadinessStatus.attachmentIntegrityRequired, 'report readiness keeps every RC HTML attachment');
  assert.equal(reportReadinessStatus.attachmentIntegrityVerified, reportReadinessStatus.attachmentIntegrityRequired, 'report readiness verifies every RC HTML attachment');
  assert.equal(reportReadinessStatus.attachmentIntegrityIssueCount, 0, 'report readiness attachment integrity issues empty');
  assert.equal(reportReadinessStatus.attachmentIntegrityPass, true, 'report readiness attachment integrity passes');
  assert.equal(Object.prototype.hasOwnProperty.call(reportReadinessStatus, 'attachmentIntegrityScope'), false, 'report readiness omits private attachment integrity scope');
  assert.equal(Object.prototype.hasOwnProperty.call(reportReadinessStatus, 'attachmentIntegritySetSha256'), false, 'report readiness omits private attachment integrity set hash');
  assert.equal(reportReadinessStatus.attachmentIntegrityGroups.length, 8, 'report readiness exposes eight RC attachment groups');
  assert.equal(reportReadinessStatus.attachmentIntegrityGroups.reduce((sum, group) => sum + group.expected, 0), 34, 'report readiness attachment group expectations total 34');
  assert.ok(reportReadinessStatus.attachmentIntegrityGroups.every(group => group.pass && group.actual === group.expected && group.verified === group.expected), 'report readiness attachment groups all pass');
  assert.ok(reportReadinessStatus.attachmentIntegrityGroups.every(group => !Object.prototype.hasOwnProperty.call(group, 'setSha256') && !Object.prototype.hasOwnProperty.call(group, 'artifacts')), 'report readiness attachment groups omit hashes and artifact lists');
  assert.equal(/"(?:artifact|artifacts|bytes|sha256|setSha256)"\s*:/.test(JSON.stringify(reportReadinessStatus)), false, 'report readiness snapshot omits private attachment integrity details');
  assert.equal(/\.(?:pdf|docx|xlsx)\b/i.test(JSON.stringify(reportReadinessStatus)), false, 'report readiness snapshot does not publish delivery filenames');
  assert.ok(String(reportReadinessStatus.summary || '').includes('頁面專用閱讀狀態治理'), 'report readiness status summary includes governance counts');
  assert.ok(Array.isArray(reportReadinessStatus.details) && reportReadinessStatus.details.length >= 3, 'report readiness status details array');
  assert.ok(reportReadinessStatus.details.join(' ').includes('正式計算書可讀文字抽檢'), 'report readiness status exposes report text coverage');
  assert.ok(reportReadinessStatus.details.join(' ').includes('瀏覽器 smoke 證據'), 'report readiness status exposes report text runtime evidence');
  assert.ok(reportReadinessStatus.details.join(' ').includes('正式放行實際交付物渲染佐證'), 'report readiness status exposes actual rendered delivery evidence');
  assert.ok(reportReadinessStatus.details.join(' ').includes('正式交付檔案完整性'), 'report readiness status exposes redacted delivery file integrity');
  assert.ok(reportReadinessStatus.details.join(' ').includes('不公開檔名、逐檔雜湊或完整性集合'), 'report readiness status explains the private evidence boundary');
  assert.ok(reportReadinessStatus.details.join(' ').includes('正式 Word 附件乾淨封裝'), 'report readiness status exposes formal DOCX package integrity');
  assert.ok(reportReadinessStatus.details.join(' ').includes('不公開檔名、封裝清冊或逐檔細節'), 'report readiness status keeps DOCX package details private');
  assert.ok(reportReadinessStatus.details.join(' ').includes('正式 Excel 附件乾淨封裝'), 'report readiness status exposes formal XLSX package integrity');
  assert.ok(reportReadinessStatus.details.join(' ').includes('不公開檔名、工作表清冊、公式或逐檔細節'), 'report readiness status keeps XLSX package details private');
  assert.ok(reportReadinessStatus.details.join(' ').includes('正式 Excel 列印成品'), 'report readiness status exposes formal XLSX Office print visual integrity');
  assert.ok(reportReadinessStatus.details.join(' ').includes('不公開工作表名稱、列印 PDF、逐頁指標或雜湊'), 'report readiness status keeps XLSX Office print evidence private');
  assert.ok(reportReadinessStatus.details.join(' ').includes('正式 Excel 雙封印'), 'report readiness status exposes formal XLSX dual seal integrity');
  assert.ok(reportReadinessStatus.details.join(' ').includes('不是核可人身分的數位簽章'), 'report readiness status explains XLSX seal identity boundary');
  assert.ok(reportReadinessStatus.details.join(' ').includes('不公開封印值、工作表內容或竄改樣本'), 'report readiness status keeps XLSX seal evidence private');
  assert.ok(reportReadinessStatus.details.join(' ').includes('正式計算書結果鏈'), 'report readiness status exposes formal result reconciliation count');
  assert.ok(reportReadinessStatus.details.join(' ').includes('不公開案例輸入、預期數值、案例雜湊或計算指紋'), 'report readiness status explains reconciliation privacy boundary');
  assert.ok(reportReadinessStatus.details.join(' ').includes('RC 正式計算書結果鏈'), 'report readiness status exposes RC result reconciliation count');
  assert.ok(reportReadinessStatus.details.join(' ').includes('不公開案例資料、來源快照雜湊或計算指紋'), 'report readiness status explains RC reconciliation privacy boundary');
  assert.ok(reportReadinessStatus.details.join(' ').includes('鋼構正式計算書結果鏈'), 'report readiness status exposes steel result reconciliation count');
  assert.ok(reportReadinessStatus.details.join(' ').includes('不公開來源資料、來源雜湊或計算指紋'), 'report readiness status explains steel reconciliation privacy boundary');
  assert.ok(reportReadinessStatus.details.join(' ').includes('石材正式計算書結果鏈'), 'report readiness status exposes stone result reconciliation count');
  assert.ok(reportReadinessStatus.details.join(' ').includes('不公開 golden 案例資料、來源 payload 雜湊、結果雜湊或成品雜湊'), 'report readiness status explains stone reconciliation privacy boundary');
  assert.ok(reportReadinessStatus.details.join(' ').includes('錨栓正式計算書結果鏈'), 'report readiness status exposes anchor result reconciliation count');
  assert.ok(reportReadinessStatus.details.join(' ').includes('不公開工作區資料、來源備份雜湊、案例重現指紋、計算指紋或成品雜湊'), 'report readiness status explains anchor reconciliation privacy boundary');
  assert.ok(reportReadinessStatus.details.join(' ').includes('局部快算計算書結果鏈'), 'report readiness status exposes local quick result reconciliation count');
  assert.ok(reportReadinessStatus.details.join(' ').includes('全輸入與全結果逐值重播'), 'report readiness status explains local quick replay coverage');
  assert.ok(reportReadinessStatus.details.join(' ').includes('RC 正式附件 HTML 完整性'), 'report readiness status exposes RC HTML attachment integrity');
  assert.equal(reportReadinessStatus.runId, preflightStatus.runId, 'report readiness runId matches public preflight status');
  assert.equal(reportReadinessStatus.preflightStatusSourcePath, preflightStatus.sourcePath, 'report readiness preflight source matches public preflight status');
  assert.ok(
    /^output\/preflight\/(?:history\/[^/]+\/)?preflight-summary\.json$/.test(reportReadinessStatus.preflightStatusSourcePath),
    'report readiness preflight sourcePath'
  );

  await assertPublicRouteSamples(base);
  await assertCleanRouteSamples(base);
  const cleanRouteCounts = await assertAllHomeCleanRoutes(base, homeJs);
  if (!allowLocalOutput()) {
    await assertOldOutputNotRequired(base);
  }
  if (hasArg('--check-private-boundary') || process.env.PAGES_CHECK_PRIVATE_BOUNDARY === '1') {
    await assertPrivateBoundary(base);
  }

  console.log(`pages live smoke OK (${base})`);
  console.log(`deployment commit=${deploymentManifest.commitSha}, run=${deploymentManifest.runId}, dirty=${deploymentManifest.sourceDirty}, files=${deploymentManifest.fileCount}, digest=${deploymentManifest.artifactDigest}`);
  console.log(`home routes checked=${cleanRouteCounts.total} (generated=${cleanRouteCounts.generated}, direct=${cleanRouteCounts.direct})`);
  console.log(`platform runId=${platformStatus.runId}, preflight runId=${preflightStatus.runId}, reportReadiness runId=${reportReadinessStatus.runId}`);
  return { fileCount: deploymentManifest.fileCount, routeCount: cleanRouteCounts.total };
}

async function runCli() {
  const startedAt = Date.now();
  const attempts = environmentInteger('PAGES_HTTP_SMOKE_ATTEMPTS', 1, 1);
  const retryDelaySeconds = environmentInteger('PAGES_HTTP_SMOKE_RETRY_DELAY_SECONDS', 5, 0);
  const resultFile = process.env.PAGES_HTTP_SMOKE_RESULT_FILE;
  try {
    const outcome = await runWithAttemptCount(main, {
      attempts,
      delayMs: retryDelaySeconds * 1000,
      onRetry(error, context) {
        console.error(`Pages HTTP smoke attempt ${context.attempt}/${context.attempts} 遇到暫態錯誤：${error.message || error}`);
        console.error(`將於 ${retryDelaySeconds} 秒後完整重跑 HTTP smoke（attempt ${context.nextAttempt}/${context.attempts}）。`);
      },
    });
    writeHttpSmokeResult(resultFile, {
      schemaVersion: 1,
      kind: 'pages-http-smoke',
      status: 'passed',
      durationMs: Date.now() - startedAt,
      attemptCount: outcome.attemptCount,
      fileCount: outcome.result.fileCount,
      routeCount: outcome.result.routeCount,
    });
    console.log(`pagesHttpSmokeAttemptCount=${outcome.attemptCount}`);
    return outcome.attemptCount;
  } catch (error) {
    writeHttpSmokeResult(resultFile, {
      schemaVersion: 1,
      kind: 'pages-http-smoke',
      status: 'failed',
      durationMs: Date.now() - startedAt,
      attemptCount: Math.max(1, Number(error.pagesHttpSmokeAttemptCount) || 1),
    });
    throw error;
  }
}

if (require.main === module) {
  runCli().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  TransientPagesSmokeError,
  isTransientNetworkError,
  isTransientSmokeError,
  fetchResponse,
  environmentInteger,
  runWithTransientRetry,
  runWithAttemptCount,
  writeHttpSmokeResult,
  validateManifestFileInventory,
  validateDeploymentReleaseEvidence,
  validatePublishedFileContent,
  assertPublishedArtifact,
  main,
  runCli,
};
