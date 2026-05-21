const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolsRoot, '..', '..');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function toolboxFile(relativePath) {
  return path.join(toolboxRoot, ...relativePath.split('/'));
}

function assertFile(relativePath) {
  const fullPath = toolboxFile(relativePath);
  assert.ok(fs.existsSync(fullPath), `missing toolbox file: ${relativePath}`);
  return fullPath;
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} missing: ${needle}`);
}

const manifestPath = assertFile('tools/local-quick-tools.manifest.json');
const manifestText = readText(manifestPath);
const manifest = JSON.parse(manifestText);
const tools = manifest.tools;

assert.equal(manifest.version, '0.1.0', 'local quick tools manifest version');
assert.equal(manifest.family, 'local-quick-tools', 'local quick tools manifest family');
assert.ok(Array.isArray(tools), 'local quick tools manifest tools');
assert.ok(tools.length >= 3, 'local quick tools manifest tool count');

const repoDocs = {
  index: readText(path.join(toolboxRoot, 'index.html')),
  homeHtml: readText(toolboxFile('home.html')),
  homeCss: readText(toolboxFile('assets/home/home.css')),
  homeJs: readText(toolboxFile('assets/home/home.js')),
  readme: readText(repoFile('README.md')),
  boundaries: readText(repoFile('TOOL_BOUNDARIES.md')),
  staging: readText(repoFile('STAGING_GROUPS.md')),
  vercel: readText(repoFile('vercel.json')),
};
repoDocs.homeSource = `${repoDocs.index}\n${repoDocs.homeHtml}\n${repoDocs.homeJs}`;

const runnerPath = assertFile(manifest.shared.runner);
const exportHelperPath = assertFile(manifest.shared.exportHelper);
const exportHelperTestPath = assertFile(manifest.shared.exportHelperTest);
const outputConsistencyTestPath = assertFile(manifest.shared.outputConsistencyTest);
const browserSmokeTestPath = assertFile(manifest.shared.browserSmokeTest);
const runnerText = readText(runnerPath);
const exportHelperText = readText(exportHelperPath);
const exportHelperTestText = readText(exportHelperTestPath);
const outputConsistencyTestText = readText(outputConsistencyTestPath);
const browserSmokeTestText = readText(browserSmokeTestPath);
const ExportHelper = require(exportHelperPath);

[
  '"version": "0.1.0"',
  '"family": "local-quick-tools"',
  '"shared"',
  '"runner"',
  '"outputConsistencyTest"',
  '"browserSmokeTest"',
  '"tools"',
  '"foundation-local"',
  '"equipment-load"',
  '"earth-pressure"',
].forEach(needle => assertIncludes(manifestText, needle, 'local quick tools manifest'));

[
  'local quick tools manifest runner OK',
  'manifest.shared.exportHelperTest',
  'manifest.shared.outputConsistencyTest',
  'manifest.shared.browserSmokeTest',
  'manifest.shared.contractTest',
  'runNode',
].forEach(needle => assertIncludes(runnerText, needle, 'local quick tools runner'));

[
  'local quick output consistency OK',
  'assertNonFiniteNumbersSerialized',
  'Exporter.buildPayload',
  'r.provenance',
].forEach(needle => assertIncludes(outputConsistencyTestText, needle, 'local quick output consistency test'));

[
  'local quick browser smoke OK',
  'Microsoft Edge',
  'vercel.json',
  'Target.createTarget',
  'Emulation.setDeviceMetricsOverride',
  'route-tool',
  'route-toolbox-home',
  'file-url-new-home',
  'assertNewHomeState',
  'btnJson',
  'blob.text()',
  'assertJsonExportState',
  'btnPrint',
  'assertReportState',
  'relativeLinks',
  'horizontalOverflow',
].forEach(needle => assertIncludes(browserSmokeTestText, needle, 'local quick browser smoke test'));

[
  'LocalQuickExport',
  'function jsonReplacer',
  'function buildPayload',
  'function downloadJson',
  'function downloadResultJson',
  'application/json',
  'module.exports',
].forEach(needle => assertIncludes(exportHelperText, needle, 'local quick export helper'));

[
  'withDownloadStubs',
  'downloadResultJson',
  'foundation-local-2026-05-19.json',
  'application/json;charset=utf-8',
  'local quick export helper OK',
].forEach(needle => assertIncludes(exportHelperTestText, needle, 'local quick export helper test'));

assert.equal(ExportHelper.version, '0.1.0', 'local quick export helper version');
const helperPayload = ExportHelper.buildPayload({
  tool: { id: 'helper-smoke', name: 'Helper Smoke' },
  project: { name: '未填' },
  generatedAt: '2026-05-19T00:00:00.000Z',
  result: { value: Infinity }
});
assert.equal(helperPayload.tool.id, 'helper-smoke', 'local quick export helper payload tool');
assert.equal(JSON.stringify(helperPayload, ExportHelper.jsonReplacer).includes('"Infinity"'), true, 'local quick export helper non-finite number serialization');
const helperTestRun = spawnSync(process.execPath, [exportHelperTestPath], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert.strictEqual(
  helperTestRun.status,
  0,
  `local quick export helper test failed\nSTDOUT:\n${helperTestRun.stdout}\nSTDERR:\n${helperTestRun.stderr}`
);
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-export.js', 'local quick export README');
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-export.test.js', 'local quick export test README');
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-output-consistency.test.js', 'local quick output consistency test README');
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-browser-smoke.test.js', 'local quick browser smoke test README');
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-tools.manifest.json', 'local quick manifest README');
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-tools.run.js', 'local quick runner README');
assertIncludes(repoDocs.readme, '結構工具箱/home.html', 'new home README');
assertIncludes(repoDocs.readme, '/toolbox-home', 'new home route README');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-export.js', 'local quick export boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-export.test.js', 'local quick export test boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-output-consistency.test.js', 'local quick output consistency test boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-browser-smoke.test.js', 'local quick browser smoke test boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-tools.manifest.json', 'local quick manifest boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-tools.run.js', 'local quick runner boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/home.html', 'new home boundary');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-export.js', 'local quick export staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-export.test.js', 'local quick export test staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-output-consistency.test.js', 'local quick output consistency test staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-browser-smoke.test.js', 'local quick browser smoke test staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-tools.manifest.json', 'local quick manifest staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-tools.run.js', 'local quick runner staging group');
assertIncludes(repoDocs.homeHtml, '<title>結構工具箱新版入口</title>', 'new home title');
assertIncludes(repoDocs.homeHtml, 'assets/home/home.css', 'new home stylesheet');
assertIncludes(repoDocs.homeHtml, 'assets/home/home.js', 'new home script');
assertIncludes(repoDocs.homeHtml, '不取代原本首頁', 'new home preserve original copy');
assertIncludes(repoDocs.homeHtml, '力量來源與檢核目的', 'new home logic categories copy');
assertIncludes(repoDocs.homeHtml, 'data-file-href="index.html"', 'new home file-mode original link');
assertIncludes(repoDocs.homeHtml, 'id="memberSystemPanel"', 'new home member system panel');
[
  '結構分析力量',
  '風力規範外力',
  '地震力規範外力',
  '構件承載力檢核',
  '連接、附掛物與外牆構件',
  '斷面、係數與資料查詢',
  '施工臨設與現場快算',
  'categoryIcons',
  "mark: 'S'",
  "mark: 'W'",
  "mark: 'E'",
  "mark: 'F'",
  "mark: 'B'",
  "mark: 'P'",
  "mark: 'T'",
  'memberSystems',
  "memberSystem: 'rc'",
  "memberSystem: 'steel'",
  "label: 'SRC'",
].forEach(needle => assertIncludes(repoDocs.homeJs, needle, 'new home logic category data'));
assertIncludes(repoDocs.homeCss, '.category-icon', 'new home category icon CSS');
assertIncludes(repoDocs.homeCss, '.icon-mark', 'new home icon mark CSS');
assertIncludes(repoDocs.homeCss, '.member-system-panel', 'new home member system CSS');
assertIncludes(repoDocs.homeCss, '.tool-group__grid', 'new home member grouped CSS');
assertIncludes(repoDocs.homeCss, '.tool-chip--system', 'new home member system chip CSS');
assertIncludes(repoDocs.homeCss, '.tool-card--analysis', 'new home logic card CSS');
assertIncludes(repoDocs.homeCss, '.tool-card--wind', 'new home wind card CSS');
assertIncludes(repoDocs.homeCss, '.tool-card--seismic', 'new home seismic card CSS');
assertIncludes(repoDocs.homeCss, '.tool-card__icon', 'new home tool icon CSS');
assert.equal(repoDocs.homeCss.includes('category-tiles.png'), false, 'new home does not use category tile image');
assert.equal(repoDocs.homeJs.includes('category-art'), false, 'new home does not render category art');
assert.equal(repoDocs.homeJs.includes("categories: ['seismic', 'analysis'"), false, 'dynamic seismic summary is not mixed into structural analysis');
assert.match(repoDocs.homeJs, /title: '錨栓檢討工具'[\s\S]*?categories: \['attachments'\]/, 'anchor stays in attachment category');
assert.match(repoDocs.homeJs, /title: '石材固定構件計算書'[\s\S]*?categories: \['attachments'\]/, 'stone fixing stays in attachment category');
assert.match(repoDocs.homeJs, /title: '覆工板系統計算'[\s\S]*?categories: \['temporary'\]/, 'deck system stays in temporary category');
assertIncludes(repoDocs.vercel, '"source": "/toolbox-home"', 'new home vercel route');
assertIncludes(repoDocs.vercel, '"destination": "/結構工具箱/home"', 'new home vercel destination');

const routes = new Set();

for (const tool of tools) {
  assert.ok(!routes.has(tool.route), `duplicate route: ${tool.route}`);
  routes.add(tool.route);

  const htmlPath = assertFile(tool.html);
  const corePath = assertFile(tool.core);
  const testPath = assertFile(tool.test);
  const goldenPath = assertFile(tool.golden);

  const html = readText(htmlPath);
  const core = readText(corePath);
  const test = readText(testPath);
  const golden = readText(goldenPath);

  [
    tool.smoke,
    tool.title,
    `pageVersion: '${tool.pageVersion}'`,
    tool.calcFunction,
    'href="/結構工具箱/core/style.css"',
    'src="/結構工具箱/tools/local-quick-export.js"',
    `src="/結構工具箱/${tool.core}"`,
    'id="btnCalc"',
    'id="btnJson"',
    'id="metricGrid"',
    'id="checkList"',
    'id="coreVersion"',
    '工具與責任邊界',
    tool.coreGlobal,
    tool.label,
    '初估',
    '列印計算書',
    '下載 JSON',
    'LocalQuickExport',
    'function downloadResultJson',
    '輸入格式',
    '計算指紋',
  ].forEach(needle => assertIncludes(html, needle, `${tool.key} html`));

  [
    tool.coreGlobal,
    "CORE_VERSION = '0.1.0'",
    'inputSchemaVersion',
    'resultSchemaVersion',
    'logicSignature',
    'function provenance',
    'function checkItem',
    'function normalizeInput',
    'function validateInput',
    'function calculate',
    'module.exports',
  ].forEach(needle => assertIncludes(core, needle, `${tool.key} core`));

  const api = require(corePath);
  assert.equal(api.version, '0.1.0', `${tool.key} core version`);
  assert.match(api.inputSchemaVersion, /\.input\.v0\.1$/, `${tool.key} input schema version`);
  assert.match(api.resultSchemaVersion, /\.result\.v0\.1$/, `${tool.key} result schema version`);
  assert.ok(api.logicSignature.startsWith(`${tool.key}-core:v0.1:`), `${tool.key} logic signature`);
  assert.equal(typeof api.provenance, 'function', `${tool.key} provenance function`);
  const apiProvenance = api.provenance();
  assert.equal(apiProvenance.core, tool.coreGlobal, `${tool.key} provenance core`);
  assert.equal(apiProvenance.version, api.version, `${tool.key} provenance version`);
  assert.equal(apiProvenance.inputSchemaVersion, api.inputSchemaVersion, `${tool.key} provenance schema`);
  assert.equal(apiProvenance.resultSchemaVersion, api.resultSchemaVersion, `${tool.key} provenance result schema`);
  assert.equal(apiProvenance.logicSignature, api.logicSignature, `${tool.key} provenance signature`);
  const goldenCases = require(goldenPath);
  const result = api.calculate(goldenCases[0].input);
  assert.equal(result.resultSchemaVersion, api.resultSchemaVersion, `${tool.key} result schema`);
  assert.deepEqual(result.provenance, apiProvenance, `${tool.key} result provenance`);
  assert.ok(result.summary, `${tool.key} result summary`);
  assert.equal(typeof result.summary.status, 'string', `${tool.key} summary status`);
  assert.equal(typeof result.summary.headline, 'string', `${tool.key} summary headline`);
  assert.ok(Array.isArray(result.summary.primaryMetrics), `${tool.key} summary primary metrics`);
  assert.ok(result.summary.primaryMetrics.length >= 3, `${tool.key} summary primary metrics count`);
  assert.ok(Array.isArray(result.checks), `${tool.key} result checks`);
  assert.ok(result.checks.length >= 3, `${tool.key} checks count`);
  for (const check of result.checks) {
    assert.equal(typeof check.key, 'string', `${tool.key} check key`);
    assert.equal(typeof check.label, 'string', `${tool.key} check label`);
    assert.ok(['pass', 'fail', 'not_applicable'].includes(check.status), `${tool.key} check status`);
    assert.ok(Object.prototype.hasOwnProperty.call(check, 'passed'), `${tool.key} check passed`);
    assert.equal(typeof check.detail, 'string', `${tool.key} check detail`);
  }

  [
    'goldenCases',
    'approx',
    tool.coreGlobal,
    'validateInput',
    'calculate',
  ].forEach(needle => assertIncludes(test, needle, `${tool.key} regression test`));

  [
    'expected',
    'input',
  ].forEach(needle => assertIncludes(golden, needle, `${tool.key} golden cases`));

  assertIncludes(repoDocs.homeSource, tool.indexHref, `${tool.key} platform index`);
  assertIncludes(repoDocs.homeSource, tool.label, `${tool.key} platform index label`);
  assertIncludes(repoDocs.readme, tool.label, `${tool.key} README`);
  assertIncludes(repoDocs.boundaries, tool.boundaryPath, `${tool.key} tool boundary`);
  assertIncludes(repoDocs.staging, tool.html, `${tool.key} staging group`);
  assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-export.js', 'local quick export staging group');
  assertIncludes(repoDocs.vercel, `"source": "${tool.route}"`, `${tool.key} vercel route`);
  const cleanDestination = `/結構工具箱/${tool.html.replace(/\.html$/i, '')}`;
  assert.ok(
    repoDocs.vercel.includes(`"destination": "/結構工具箱/${tool.html}"`) ||
      repoDocs.vercel.includes(`"destination": "${cleanDestination}"`),
    `${tool.key} vercel destination missing: /結構工具箱/${tool.html} or ${cleanDestination}`
  );

  const run = spawnSync(process.execPath, [testPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.strictEqual(
    run.status,
    0,
    `${tool.key} regression failed\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`
  );
}

console.log(`local quick tools contract OK (${tools.length} tools)`);
