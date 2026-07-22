const assert = require('assert');

const DEFAULT_BASE_URL = 'https://oxsum324.github.io/section-properties-calculator/';
const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
]);
const PUBLIC_ROUTE_SAMPLES = [
  { path: '鋼筋混凝土/', needles: ['鋼筋混凝土構件設計工具箱', 'RC 自動巡檢', '../結構工具箱/assets/status/platform-status.json', '平台公開巡檢狀態'] },
  { path: '鋼筋混凝土/tools/beam.html', needles: ['梁 Beam 設計', 'RC 工具箱'] },
  { path: '鋼筋混凝土/tools/shear-wall.html', needles: ['剪力牆 Shear Wall', '18.7'] },
  { path: '鋼構工具/', needles: ['鋼構正式規範核算工具', '../結構工具箱/core/direct-print-boundary.css', 'steel-formal-output-page', '鋼構正式工具主頁列印已封鎖'] },
  { path: '鋼構工具/plate-check.html', needles: ['鋼構連接板正式規範核算工具', '../結構工具箱/core/direct-print-boundary.css', 'steel-formal-output-page', '此頁是操作介面，不是計算書'] },
  { path: '鋼構工具/steel-beam-formal.html', needles: ['鋼梁正式規範核算工具', '../結構工具箱/core/direct-print-boundary.css', 'steel-formal-output-page', '產生計算書'] },
  { path: '鋼構工具/steel-column-formal.html', needles: ['鋼柱正式規範核算工具', '../結構工具箱/core/direct-print-boundary.css', 'steel-formal-output-page', '本頁不得作為附件'] },
  { path: '鋼構工具/app.js', needles: ['getAuditStatusSource', '../結構工具箱/assets/status/platform-status.json', '平台公開巡檢狀態', '鋼構本機自巡檢狀態'] },
  { path: 'anchor/', needles: ['錨栓檢討工具'], checkAssets: true },
  { path: '石材固定/石材計算書產生器_規範版V2.html', needles: ['石材外牆固定構件計算書產生器', '規範版', '../結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '石材工具主頁列印已封鎖', 'buildPrintableSheetsHtml()', 'const V2_METHOD_MEDIA = Object.freeze({', "mode:'public_static'", '公開靜態版不檢查本機服務', 'const proseAt = m.search(/[\\u3400-\\u9fff]/);'] },
  { path: '覆工板/index.html', needles: ['覆工板系統計算工具', '../結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '覆工板工具主頁列印已封鎖', 'printDeckingReport()'] },
  { path: '開挖擋土支撐/index.html', needles: ['開挖擋土支撐計算工具', '本機服務工具'] },
  { path: '連續梁分析.html', needles: ['連續梁分析工具', '結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '分析工具主頁列印已封鎖'] },
  { path: '鋼架/平面剛架分析.html', needles: ['平面剛架分析', '../結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '本頁不得作為附件'] },
  { path: 'index.html', needles: ['斷面性質計算工具', '結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '斷面工具主頁列印已封鎖'] },
  { path: '斷面性質計算.html', needles: ['斷面性質計算工具', '結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '本頁不得作為附件'] },
  { path: '合成斷面性質.html', needles: ['合成斷面性質計算', '結構工具箱/core/direct-print-boundary.css', 'formal-tool-output-page', '此頁是操作介面，不是計算書'] },
  { path: 'RC補強斷面性質.html', needles: ['RC 補強斷面性質計算', '鋼筋混凝土/shared/direct-print-boundary.css', 'rc-formal-output-page', 'RC 工具主頁列印已封鎖'] },
  { path: '結構工具箱/tools/風力/wind-force.html', needles: ['矩形建物 MWFRS', '建築物耐風設計', '../../core/direct-print-boundary.css', 'formal-tool-output-page', '正式工具主頁列印已封鎖'] },
  { path: '結構工具箱/tools/風力/wind-object-solid.html', needles: ['實體標示物風力', '表 2.10', '../../core/direct-print-boundary.css', 'formal-tool-output-page', '此頁是操作介面，不是計算書'] },
  { path: '結構工具箱/tools/地震力/seismic-force.html', needles: ['等值靜力分析', '建築物耐震設計', '../../core/direct-print-boundary.css', 'formal-tool-output-page', '本頁不得作為附件'] },
  { path: '結構工具箱/tools/foundation/foundation-local.html', needles: ['基礎局部檢核', '../../core/direct-print-boundary.css', 'local-quick-output-page', '局部快算主頁列印已封鎖'] },
  { path: '結構工具箱/tools/equipment/equipment-load.html', needles: ['設備局部荷重', '../../core/direct-print-boundary.css', 'local-quick-output-page', '此頁是操作介面，不是計算書'] },
  { path: '結構工具箱/tools/earth/earth-pressure.html', needles: ['擋土土壓局部快算', '../../core/direct-print-boundary.css', 'local-quick-output-page', '本頁不得作為附件'] }
];
const CLEAN_ROUTE_SAMPLES = [
  { path: 'rc-column/', source: '/rc-column', targetNeedle: 'column.html' },
  { path: 'steel-beam-formal/', source: '/steel-beam-formal', targetNeedle: 'steel-beam-formal.html' }
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
  '結構工具箱/tools/pages-live-browser-smoke.js',
  '結構工具箱/tools/run-pages-browser-smoke.sh',
  '結構工具箱/tools/build-pages-artifact.js',
  '結構工具箱/tools/build-pages-clean-routes.js',
  '結構工具箱/tools/build-pages-deployment-manifest.js',
  '結構工具箱/tools/attachment-package-check.js',
  '結構工具箱/tools/attachment-package-build.js',
  '結構工具箱/tools/attachment-package-verify.js',
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

async function fetchResponse(url, options = {}, fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    if (isTransientNetworkError(error)) {
      throw new TransientPagesSmokeError(`${url} 暫時性網路錯誤：${error.message || error}`, error);
    }
    throw error;
  }
  if (response.status >= 500 && response.status <= 599) {
    throw new TransientPagesSmokeError(`${url} 暫時回傳 HTTP ${response.status}`);
  }
  return response;
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

async function assertDeploymentManifest(base) {
  const manifest = await fetchJson(liveUrl(base, 'pages-deployment.json'));
  assert.equal(manifest.schemaVersion, 1, 'Pages deployment manifest schemaVersion');
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
  assert.equal(manifest.artifactDigestAlgorithm, 'sha256-tree-v1', 'Pages deployment manifest digest algorithm');
  assert.match(manifest.artifactDigest, /^[0-9a-f]{64}$/i, 'Pages deployment manifest artifactDigest');
  assert.equal(Number.isInteger(manifest.fileCount), true, 'Pages deployment manifest fileCount integer');
  assert.ok(manifest.fileCount > 0, 'Pages deployment manifest contains published files');
  assert.equal(Number.isInteger(manifest.totalBytes), true, 'Pages deployment manifest totalBytes integer');
  assert.ok(manifest.totalBytes > 0, 'Pages deployment manifest totalBytes positive');

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

async function main() {
  const base = baseUrl();
  const deploymentManifest = await assertDeploymentManifest(base);
  const homeUrl = liveUrl(base, '結構工具箱/');
  const homeJsUrl = liveUrl(base, '結構工具箱/assets/home/home.js');
  const platformStatusUrl = liveUrl(base, '結構工具箱/assets/status/platform-status.json');
  const preflightStatusUrl = liveUrl(base, '結構工具箱/assets/status/preflight-summary.json');
  const reportReadinessStatusUrl = liveUrl(base, '結構工具箱/assets/status/report-readiness-status.json');
  const directPrintBoundaryUrl = liveUrl(base, '結構工具箱/core/direct-print-boundary.css');

  const homeHtml = await fetchText(homeUrl);
  assert.ok(homeHtml.includes('assets/home/home.js'), 'homepage references home.js');

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
  assert.ok(String(reportReadinessStatus.compactSummary || '').includes('頁面診斷明細不進計算書'), 'report readiness compact summary keeps page-only wording');
  assert.ok(String(reportReadinessStatus.compactSummary || '').includes('文件預設內部審閱，明確核可後為正式附件'), 'report readiness compact summary keeps approval-based document classification');
  assert.ok(String(reportReadinessStatus.compactSummary || '').includes('兩者皆可列印'), 'report readiness compact summary keeps printable approval boundary');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceRequired, 31, 'report readiness rendered delivery covers every formal homepage tool');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceComplete, reportReadinessStatus.renderedDeliveryEvidenceRequired, 'report readiness rendered delivery fully covered');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceIssueCount, 0, 'report readiness rendered delivery issues empty');
  assert.match(reportReadinessStatus.renderedDeliveryEvidenceRunId, /^\d{8}-\d{6}$/, 'report readiness rendered delivery runId');
  assert.ok(Array.isArray(reportReadinessStatus.renderedDeliveryEvidenceFamilies) && reportReadinessStatus.renderedDeliveryEvidenceFamilies.length >= 6, 'report readiness rendered delivery family coverage');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceFamilies.reduce((sum, family) => sum + family.complete, 0), reportReadinessStatus.renderedDeliveryEvidenceComplete, 'report readiness rendered delivery family totals');
  assert.ok(String(reportReadinessStatus.renderedDeliveryEvidenceSummary || '').includes('實際交付物渲染'), 'report readiness rendered delivery summary');
  assert.equal(reportReadinessStatus.renderedDeliveryEvidenceSourcePath, `output/preflight/history/${reportReadinessStatus.renderedDeliveryEvidenceRunId}/rendered-delivery-evidence/rendered-delivery-evidence-summary.json`, 'report readiness rendered delivery source path');
  assert.match(reportReadinessStatus.renderedDeliveryEvidenceSourceHash, /^[0-9a-f]{64}$/i, 'report readiness rendered delivery source hash');
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
}

async function runCli() {
  const attempts = environmentInteger('PAGES_HTTP_SMOKE_ATTEMPTS', 1, 1);
  const retryDelaySeconds = environmentInteger('PAGES_HTTP_SMOKE_RETRY_DELAY_SECONDS', 5, 0);
  await runWithTransientRetry(main, {
    attempts,
    delayMs: retryDelaySeconds * 1000,
    onRetry(error, context) {
      console.error(`Pages HTTP smoke attempt ${context.attempt}/${context.attempts} 遇到暫態錯誤：${error.message || error}`);
      console.error(`將於 ${retryDelaySeconds} 秒後完整重跑 HTTP smoke（attempt ${context.nextAttempt}/${context.attempts}）。`);
    },
  });
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
  main,
  runCli,
};
