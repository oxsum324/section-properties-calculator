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
  readme: readText(repoFile('README.md')),
  boundaries: readText(repoFile('TOOL_BOUNDARIES.md')),
  staging: readText(repoFile('STAGING_GROUPS.md')),
  vercel: readText(repoFile('vercel.json')),
};

const runnerPath = assertFile(manifest.shared.runner);
const exportHelperPath = assertFile(manifest.shared.exportHelper);
const exportHelperTestPath = assertFile(manifest.shared.exportHelperTest);
const outputConsistencyTestPath = assertFile(manifest.shared.outputConsistencyTest);
const runnerText = readText(runnerPath);
const exportHelperText = readText(exportHelperPath);
const exportHelperTestText = readText(exportHelperTestPath);
const outputConsistencyTestText = readText(outputConsistencyTestPath);
const ExportHelper = require(exportHelperPath);

[
  '"version": "0.1.0"',
  '"family": "local-quick-tools"',
  '"shared"',
  '"runner"',
  '"outputConsistencyTest"',
  '"tools"',
  '"foundation-local"',
  '"equipment-load"',
  '"earth-pressure"',
].forEach(needle => assertIncludes(manifestText, needle, 'local quick tools manifest'));

[
  'local quick tools manifest runner OK',
  'manifest.shared.exportHelperTest',
  'manifest.shared.outputConsistencyTest',
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
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-tools.manifest.json', 'local quick manifest README');
assertIncludes(repoDocs.readme, '結構工具箱/tools/local-quick-tools.run.js', 'local quick runner README');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-export.js', 'local quick export boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-export.test.js', 'local quick export test boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-output-consistency.test.js', 'local quick output consistency test boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-tools.manifest.json', 'local quick manifest boundary');
assertIncludes(repoDocs.boundaries, '結構工具箱/tools/local-quick-tools.run.js', 'local quick runner boundary');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-export.js', 'local quick export staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-export.test.js', 'local quick export test staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-output-consistency.test.js', 'local quick output consistency test staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-tools.manifest.json', 'local quick manifest staging group');
assertIncludes(repoDocs.staging, '結構工具箱/tools/local-quick-tools.run.js', 'local quick runner staging group');

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
