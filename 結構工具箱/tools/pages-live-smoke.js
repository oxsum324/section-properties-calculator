const assert = require('assert');

const DEFAULT_BASE_URL = 'https://oxsum324.github.io/section-properties-calculator/';
const PUBLIC_ROUTE_SAMPLES = [
  { path: '鋼筋混凝土/', needles: ['鋼筋混凝土構件設計工具箱', 'RC 自動巡檢'] },
  { path: '鋼筋混凝土/tools/beam.html', needles: ['梁 Beam 設計', 'RC 工具箱'] },
  { path: '鋼筋混凝土/tools/shear-wall.html', needles: ['剪力牆 Shear Wall', '18.7'] },
  { path: '鋼構工具/', needles: ['鋼構正式規範核算工具'] },
  { path: '鋼構工具/steel-beam-formal.html', needles: ['鋼梁正式規範核算工具'] },
  { path: 'anchor/', needles: ['錨栓檢討工具'] },
  { path: '石材固定/石材計算書產生器_規範版V2.html', needles: ['石材外牆固定構件計算書產生器', '規範版'] },
  { path: '覆工板/index.html', needles: ['覆工板系統計算工具'] },
  { path: '開挖擋土支撐/index.html', needles: ['開挖擋土支撐計算工具', '本機服務工具'] },
  { path: '連續梁分析.html', needles: ['連續梁分析工具'] },
  { path: '合成斷面性質.html', needles: ['合成斷面性質計算'] },
  { path: 'RC補強斷面性質.html', needles: ['RC 補強斷面性質計算'] },
  { path: '結構工具箱/tools/風力/wind-force.html', needles: ['矩形建物 MWFRS', '建築物耐風設計'] },
  { path: '結構工具箱/tools/風力/wind-object-solid.html', needles: ['實體標示物風力', '表 2.10'] },
  { path: '結構工具箱/tools/地震力/seismic-force.html', needles: ['等值靜力分析', '建築物耐震設計'] },
  { path: '結構工具箱/tools/foundation/foundation-local.html', needles: ['基礎局部檢核'] },
  { path: '結構工具箱/tools/equipment/equipment-load.html', needles: ['設備局部荷重'] },
  { path: '結構工具箱/tools/earth/earth-pressure.html', needles: ['擋土土壓局部快算'] }
];
const PRIVATE_PATHS = [
  'README.md',
  'CONTEXT.md',
  'docs/adr/0001-page-only-report-readiness.md',
  'TOOL_BOUNDARIES.md',
  'STAGING_GROUPS.md',
  'TOOL_REPORT_GUIDE.md',
  'preflight-tools.ps1',
  'run-preflight-tools.bat',
  'toolbox-entrypoints.contract.test.js',
  '結構工具箱/tools/pages-live-smoke.js',
  '結構工具箱/tools/attachment-package-check.js',
  '結構工具箱/tools/local-quick-browser-smoke.test.js',
  '結構工具箱/tools/rendered-delivery-evidence.js',
  '結構工具箱/tools/rendered-delivery-evidence.inventory.json',
  '石材固定/dev_tools/baseline_capture.html',
  '石材固定/dev_tools/diagnostics.html',
  '石材固定/dev_tools/gov_filename_diff.py',
  '石材固定/dev_tools/verifier.config.json',
  '石材固定/server.py',
  '石材固定/tests/golden/case_01_standard_safe.json',
  '石材固定/註冊快速啟動.reg',
  '開挖擋土支撐/backend/app/main.py',
  '開挖擋土支撐/frontend/package.json',
  '開挖擋土支撐/frontend/src/App.tsx',
  '開挖擋土支撐/frontend/dist/index.html',
  '螺栓檢討/bolt-review-tool/package.json',
  '螺栓檢討/bolt-review-tool/src/App.tsx',
  '覆工板/dump_xls.py',
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

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'manual', cache: 'no-store' });
  assert.equal(response.status, 200, `${url} expected HTTP 200, got ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

function assertStatusPayload(payload, label) {
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
    const response = await fetch(url, { redirect: 'manual', cache: 'no-store' });
    assert.notEqual(response.status, 200, `${url} should not be the homepage status source`);
  }
}

function assertNoLocalWorkspaceLeak(text, label) {
  assert.equal(/C:\\Users\\|Desktop\\AI\\|小工具製作/.test(text), false, `${label} must not expose local workspace paths`);
}

async function assertPublicRouteSamples(base) {
  for (const sample of PUBLIC_ROUTE_SAMPLES) {
    const html = await fetchText(liveUrl(base, sample.path));
    for (const needle of sample.needles) {
      assert.ok(html.includes(needle), `${sample.path} missing public page marker: ${needle}`);
    }
    assertNoLocalWorkspaceLeak(html, sample.path);
  }
}

async function assertPrivateBoundary(base) {
  for (const path of PRIVATE_PATHS) {
    const url = liveUrl(base, path);
    const response = await fetch(url, { redirect: 'manual', cache: 'no-store' });
    assert.notEqual(response.status, 200, `${path} should not be published to Pages`);
  }
}

async function main() {
  const base = baseUrl();
  const homeUrl = liveUrl(base, '結構工具箱/');
  const homeJsUrl = liveUrl(base, '結構工具箱/assets/home/home.js');
  const platformStatusUrl = liveUrl(base, '結構工具箱/assets/status/platform-status.json');
  const preflightStatusUrl = liveUrl(base, '結構工具箱/assets/status/preflight-summary.json');
  const reportReadinessStatusUrl = liveUrl(base, '結構工具箱/assets/status/report-readiness-status.json');

  const homeHtml = await fetchText(homeUrl);
  assert.ok(homeHtml.includes('assets/home/home.js'), 'homepage references home.js');

  const homeJs = await fetchText(homeJsUrl);
  assert.ok(homeJs.includes("assets/status/platform-status.json"), 'home.js reads platform status asset');
  assert.ok(homeJs.includes("assets/status/preflight-summary.json"), 'home.js reads preflight status asset');
  assert.ok(homeJs.includes("assets/status/report-readiness-status.json"), 'home.js reads report readiness status asset');
  assert.equal(/fetch\(\s*[`'"]\/output\//.test(homeJs), false, 'home.js must not fetch domain-root output paths');
  assert.ok(homeJs.includes("label: '報告閱讀狀態總覽'"), 'home.js keeps report readiness overview label');
  assert.ok(homeJs.includes('頁面上的「優先建議報告閱讀狀態」診斷明細只供公司內部整理計算附件前檢查'), 'home.js keeps page-only diagnostic boundary summary');
  assert.ok(homeJs.includes('RC 梁柱若非 ready，輸出會另以 DRAFT／非正式附件標明文件分類'), 'home.js distinguishes draft document classification from page-only diagnostics');
  assert.ok(homeJs.includes('完整檢查'), 'home.js keeps full preflight mode label');
  assert.ok(homeJs.includes('快速檢查'), 'home.js keeps quick preflight mode label');
  assert.ok(homeJs.includes('正式放行'), 'home.js keeps release preflight mode label');
  assert.ok(homeJs.includes('正式交付請以完整檢查或正式放行結果為準。'), 'home.js keeps full-run evidence summary');
  assert.ok(homeJs.includes("cardTag: '報告邊界'"), 'home.js keeps RC report boundary card tag');
  assert.ok(homeJs.includes("cardTag: '輸出邊界'"), 'home.js keeps anchor output boundary card tag');

  const platformStatus = await fetchJson(platformStatusUrl);
  assertStatusPayload(platformStatus, 'platform status');
  assert.equal(platformStatus.kind, 'platform-status', 'platform status kind');
  assert.equal(platformStatus.sourcePath, 'output/audit/platform-status.json', 'platform status sourcePath');

  const preflightStatus = await fetchJson(preflightStatusUrl);
  assertStatusPayload(preflightStatus, 'preflight status');
  assert.equal(preflightStatus.kind, 'preflight-summary', 'preflight status kind');
  assert.equal(preflightStatus.quick, false, 'preflight status should publish latest full run');
  assert.ok(/^output\/preflight\/(?:history\/[^/]+\/)?preflight-summary\.json$/.test(preflightStatus.sourcePath), 'preflight status sourcePath');
  assert.equal(Number.isInteger(preflightStatus.recordsCount), true, 'preflight recordsCount integer');
  assert.equal(preflightStatus.recordsCount, preflightStatus.passedCount, 'preflight records all passed');

  const reportReadinessStatus = await fetchJson(reportReadinessStatusUrl);
  assertStatusPayload(reportReadinessStatus, 'report readiness status');
  assert.equal(reportReadinessStatus.kind, 'report-readiness-status', 'report readiness status kind');
  assert.equal(reportReadinessStatus.sourcePath, 'output/audit/tool-maturity-matrix.json', 'report readiness status sourcePath');
  assert.equal(reportReadinessStatus.badge, '頁面專用', 'report readiness status badge');
  assert.equal(reportReadinessStatus.label, '報告閱讀狀態總覽', 'report readiness status label');
  assert.equal(reportReadinessStatus.pass, true, 'report readiness status pass');
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
  assert.ok(String(reportReadinessStatus.compactSummary || '').includes('優先建議報告閱讀狀態'), 'report readiness compact summary keeps page-only wording');
  assert.ok(String(reportReadinessStatus.compactSummary || '').includes('不會寫入計算書、列印或 PDF'), 'report readiness compact summary keeps export boundary');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceRequired, 31, 'report readiness rendered delivery covers every formal homepage tool');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceComplete, reportReadinessStatus.renderedDeliveryEvidenceRequired, 'report readiness rendered delivery fully covered');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceIssueCount, 0, 'report readiness rendered delivery issues empty');
  assert.match(reportReadinessStatus.renderedDeliveryEvidenceRunId, /^\d{8}-\d{6}$/, 'report readiness rendered delivery runId');
  assert.ok(Array.isArray(reportReadinessStatus.renderedDeliveryEvidenceFamilies) && reportReadinessStatus.renderedDeliveryEvidenceFamilies.length >= 6, 'report readiness rendered delivery family coverage');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceFamilies.reduce((sum, family) => sum + family.complete, 0), reportReadinessStatus.renderedDeliveryEvidenceComplete, 'report readiness rendered delivery family totals');
  assert.ok(String(reportReadinessStatus.renderedDeliveryEvidenceSummary || '').includes('實際交付物渲染'), 'report readiness rendered delivery summary');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceSourcePath, `output/preflight/history/${reportReadinessStatus.renderedDeliveryEvidenceRunId}/rendered-delivery-evidence/rendered-delivery-evidence-summary.json`, 'report readiness rendered delivery source path');
  assert.match(reportReadinessStatus.renderedDeliveryEvidenceSourceHash, /^[0-9a-f]{64}$/i, 'report readiness rendered delivery source hash');
  assert.equal(JSON.stringify(reportReadinessStatus).includes('"artifact":'), false, 'report readiness snapshot does not publish artifact fields');
  assert.equal(/\.(?:pdf|docx|xlsx)\b/i.test(JSON.stringify(reportReadinessStatus)), false, 'report readiness snapshot does not publish delivery filenames');
  assert.ok(String(reportReadinessStatus.summary || '').includes('頁面專用閱讀狀態治理'), 'report readiness status summary includes governance counts');
  assert.ok(Array.isArray(reportReadinessStatus.details) && reportReadinessStatus.details.length >= 3, 'report readiness status details array');
  assert.ok(reportReadinessStatus.details.join(' ').includes('正式計算書可讀文字抽檢'), 'report readiness status exposes report text coverage');
  assert.ok(reportReadinessStatus.details.join(' ').includes('瀏覽器 smoke 證據'), 'report readiness status exposes report text runtime evidence');
  assert.ok(reportReadinessStatus.details.join(' ').includes('正式放行實際交付物渲染佐證'), 'report readiness status exposes actual rendered delivery evidence');
  assert.equal(reportReadinessStatus.runId, preflightStatus.runId, 'report readiness runId matches public preflight status');
  assert.equal(reportReadinessStatus.preflightStatusSourcePath, preflightStatus.sourcePath, 'report readiness preflight source matches public preflight status');
  assert.ok(
    /^output\/preflight\/(?:history\/[^/]+\/)?preflight-summary\.json$/.test(reportReadinessStatus.preflightStatusSourcePath),
    'report readiness preflight sourcePath'
  );

  await assertPublicRouteSamples(base);
  if (!allowLocalOutput()) {
    await assertOldOutputNotRequired(base);
  }
  if (hasArg('--check-private-boundary') || process.env.PAGES_CHECK_PRIVATE_BOUNDARY === '1') {
    await assertPrivateBoundary(base);
  }

  console.log(`pages live smoke OK (${base})`);
  console.log(`platform runId=${platformStatus.runId}, preflight runId=${preflightStatus.runId}, reportReadiness runId=${reportReadinessStatus.runId}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
