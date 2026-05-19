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

const tools = [
  {
    key: 'foundation-local',
    label: '基礎局部檢核',
    route: '/foundation-local',
    html: 'tools/foundation/foundation-local.html',
    core: 'tools/foundation/foundation-local-core.js',
    test: 'tools/foundation/foundation-local-core.test.js',
    golden: 'tools/foundation/foundation-local-golden-cases.js',
    smoke: 'foundation-local-smoke',
    title: '<title>基礎局部檢核 V0.1</title>',
    calcFunction: 'function calculateFoundationLocal',
    coreGlobal: 'FoundationLocalCore',
    indexHref: 'tools/foundation/foundation-local.html',
    boundaryPath: '結構工具箱/tools/foundation/',
  },
  {
    key: 'equipment-load',
    label: '設備局部荷重',
    route: '/equipment-load',
    html: 'tools/equipment/equipment-load.html',
    core: 'tools/equipment/equipment-load-core.js',
    test: 'tools/equipment/equipment-load-core.test.js',
    golden: 'tools/equipment/equipment-load-golden-cases.js',
    smoke: 'equipment-load-smoke',
    title: '<title>設備局部荷重 V0.1</title>',
    calcFunction: 'function calculateEquipmentLoad',
    coreGlobal: 'EquipmentLoadCore',
    indexHref: 'tools/equipment/equipment-load.html',
    boundaryPath: '結構工具箱/tools/equipment/',
  },
  {
    key: 'earth-pressure',
    label: '擋土土壓局部快算',
    route: '/earth-pressure',
    html: 'tools/earth/earth-pressure.html',
    core: 'tools/earth/earth-pressure-core.js',
    test: 'tools/earth/earth-pressure-core.test.js',
    golden: 'tools/earth/earth-pressure-golden-cases.js',
    smoke: 'earth-pressure-smoke',
    title: '<title>擋土土壓局部快算 V0.1</title>',
    calcFunction: 'function calculateEarthPressure',
    coreGlobal: 'EarthPressureCore',
    indexHref: 'tools/earth/earth-pressure.html',
    boundaryPath: '結構工具箱/tools/earth/',
  },
];

const repoDocs = {
  index: readText(path.join(toolboxRoot, 'index.html')),
  readme: readText(repoFile('README.md')),
  boundaries: readText(repoFile('TOOL_BOUNDARIES.md')),
  staging: readText(repoFile('STAGING_GROUPS.md')),
  vercel: readText(repoFile('vercel.json')),
};

const exportHelperPath = assertFile('tools/local-quick-export.js');
const exportHelperText = readText(exportHelperPath);
const ExportHelper = require(exportHelperPath);

[
  'LocalQuickExport',
  'function jsonReplacer',
  'function buildPayload',
  'function downloadJson',
  'function downloadResultJson',
  'application/json',
  'module.exports',
].forEach(needle => assertIncludes(exportHelperText, needle, 'local quick export helper'));

assert.equal(ExportHelper.version, '0.1.0', 'local quick export helper version');
const helperPayload = ExportHelper.buildPayload({
  tool: { id: 'helper-smoke', name: 'Helper Smoke' },
  project: { name: '未填' },
  generatedAt: '2026-05-19T00:00:00.000Z',
  result: { value: Infinity }
});
assert.equal(helperPayload.tool.id, 'helper-smoke', 'local quick export helper payload tool');
assert.equal(JSON.stringify(helperPayload, ExportHelper.jsonReplacer).includes('"Infinity"'), true, 'local quick export helper non-finite number serialization');
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-export.js', 'local quick export README');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-export.js', 'local quick export boundary');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-export.js', 'local quick export staging group');

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
    tool.calcFunction,
    '../local-quick-export.js',
    path.basename(tool.core),
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

  assertIncludes(repoDocs.index, `href="${tool.indexHref}"`, `${tool.key} platform index`);
  assertIncludes(repoDocs.index, tool.label, `${tool.key} platform index label`);
  assertIncludes(repoDocs.readme, tool.label, `${tool.key} README`);
  assertIncludes(repoDocs.boundaries, tool.boundaryPath, `${tool.key} tool boundary`);
  assertIncludes(repoDocs.staging, tool.html, `${tool.key} staging group`);
  assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-export.js', 'local quick export staging group');
  assertIncludes(repoDocs.vercel, `"source": "${tool.route}"`, `${tool.key} vercel route`);
  assertIncludes(repoDocs.vercel, `"destination": "/結構工具箱/${tool.html}"`, `${tool.key} vercel destination`);

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
