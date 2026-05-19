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
    coreReportLabel: 'FoundationLocalCore v',
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
    coreReportLabel: 'EquipmentLoadCore v',
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
    coreReportLabel: 'EarthPressureCore v',
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
    path.basename(tool.core),
    'id="btnCalc"',
    'id="metricGrid"',
    'id="checkList"',
    'id="coreVersion"',
    '工具與責任邊界',
    tool.coreReportLabel,
    tool.label,
    '初估',
    '列印計算書',
    '輸入格式',
    '計算指紋',
  ].forEach(needle => assertIncludes(html, needle, `${tool.key} html`));

  [
    tool.coreGlobal,
    "version: '0.1.0'",
    'inputSchemaVersion',
    'logicSignature',
    'function normalizeInput',
    'function validateInput',
    'function calculate',
    'module.exports',
  ].forEach(needle => assertIncludes(core, needle, `${tool.key} core`));

  const api = require(corePath);
  assert.equal(api.version, '0.1.0', `${tool.key} core version`);
  assert.match(api.inputSchemaVersion, /\.input\.v0\.1$/, `${tool.key} input schema version`);
  assert.ok(api.logicSignature.startsWith(`${tool.key}-core:v0.1:`), `${tool.key} logic signature`);

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
