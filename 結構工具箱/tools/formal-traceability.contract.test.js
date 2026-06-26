const fs = require('fs');
const path = require('path');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

let failed = 0;

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath).replace(/^\uFEFF/, ''));
}

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function toolFile(relativePath) {
  return path.join(toolsRoot, ...relativePath.split('/'));
}

function assert(pass, label, detail = '') {
  if (!pass) {
    failed += 1;
    console.error(`FAIL | ${label} :: ${detail}`);
  } else {
    console.log(`PASS | ${label} | ${detail}`);
  }
}

function assertString(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0, label, value);
}

function assertStringArray(value, label) {
  assert(Array.isArray(value) && value.length > 0, label, Array.isArray(value) ? `count=${value.length}` : typeof value);
  if (!Array.isArray(value)) return;
  value.forEach((item, index) => assertString(item, `${label}[${index}]`));
}

function sameArray(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function arrayIncludesAll(items, required, label) {
  for (const item of required) {
    assert(items.includes(item), `${label} includes ${item}`, item);
  }
}

const manifestPath = toolFile('formal-tools.manifest.json');
const catalogPath = toolFile('formal-traceability.catalog.json');
const manifest = readJson(manifestPath);
const catalogText = readText(catalogPath);
const catalog = JSON.parse(catalogText);
const preflight = readText(repoFile('preflight-tools.ps1'));
const formalToolsContract = readText(toolFile('formal-tools.contract.test.js'));
const formalRunner = readText(toolFile('formal-tools.run.js'));
const readme = readText(repoFile('README.md'));
const boundaries = readText(repoFile('TOOL_BOUNDARIES.md'));
const staging = readText(repoFile('STAGING_GROUPS.md'));
const reportGuide = readText(repoFile('TOOL_REPORT_GUIDE.md'));

assert(catalog.version === '0.1.0', 'formal traceability catalog version', catalog.version);
assert(catalog.family === 'formal-traceability', 'formal traceability catalog family', catalog.family);
assertString(catalog.description, 'formal traceability catalog description');
assert(Array.isArray(catalog.tools), 'formal traceability catalog tools array', `count=${catalog.tools?.length || 0}`);
assert(
  sameArray((catalog.tools || []).map(tool => tool.key), manifest.tools.map(tool => tool.key)),
  'formal traceability catalog tool order matches manifest',
  JSON.stringify((catalog.tools || []).map(tool => tool.key))
);
assert(
  manifest.shared.traceabilityContract === 'tools/formal-traceability.contract.test.js',
  'formal manifest points to traceability contract',
  manifest.shared.traceabilityContract
);

const manifestToolsByKey = new Map(manifest.tools.map(tool => [tool.key, tool]));
const allTraceIds = new Set();
let traceCount = 0;
let manualReviewCount = 0;

for (const tool of catalog.tools || []) {
  const manifestTool = manifestToolsByKey.get(tool.key);
  assert(manifestTool, `${tool.key} manifest tool exists`, tool.key);
  assertString(tool.key, `${tool.key || 'tool'} key`);
  assertString(tool.scope, `${tool.key} scope`);
  assert(Array.isArray(tool.traces) && tool.traces.length > 0, `${tool.key} trace count`, `count=${tool.traces?.length || 0}`);

  const goldenIds = new Set((manifestTool?.goldenCases || []).map(goldenCase => goldenCase.id));
  for (const [index, trace] of (tool.traces || []).entries()) {
    traceCount += 1;
    assertString(trace.id, `${tool.key} trace ${index} id`);
    assert(!allTraceIds.has(trace.id), `${tool.key} trace id globally unique`, trace.id);
    allTraceIds.add(trace.id);
    assertString(trace.clause, `${tool.key} trace ${trace.id} clause`);
    assert(/規範|表|圖|式|章|節|Eq/.test(trace.clause), `${tool.key} trace ${trace.id} names formal source`, trace.clause);
    assertString(trace.purpose, `${tool.key} trace ${trace.id} purpose`);
    for (const field of ['inputs', 'calculation', 'report', 'goldenCases', 'manualReview']) {
      assertStringArray(trace[field], `${tool.key} trace ${trace.id} ${field}`);
    }
    manualReviewCount += Array.isArray(trace.manualReview) ? trace.manualReview.length : 0;
    assert(
      trace.manualReview.some(item => /人工複核|設計者|施工圖|專案|風洞|模型|圖說|確認|複核/.test(item)),
      `${tool.key} trace ${trace.id} manual review wording`,
      (trace.manualReview || []).join(' / ')
    );
    for (const goldenId of trace.goldenCases || []) {
      assert(goldenIds.has(goldenId), `${tool.key} trace ${trace.id} golden case exists`, goldenId);
    }
    for (const forbidden of manifest.reportForbiddenNeedles || []) {
      if (['undefined', 'NaN'].includes(forbidden)) continue;
      assert(!JSON.stringify(trace).includes(forbidden), `${tool.key} trace ${trace.id} avoids forbidden wording`, forbidden);
    }
  }
}

assert(traceCount >= 17, 'formal traceability catalog trace volume', `traces=${traceCount}`);
assert(manualReviewCount >= 17, 'formal traceability catalog manual review volume', `manualReview=${manualReviewCount}`);

const requiredHighRiskTraceIds = [
  'wind-force-2-12-dual-direction',
  'wind-object-solid-table-2-10-dual-cf',
  'wind-object-solid-skew-eccentricity',
  'wind-sign-pole-composite-tables',
  'seismic-appendage-4-1-4-3',
  'seismic-dynamic-spectrum-base-shear'
];
for (const id of requiredHighRiskTraceIds) {
  assert(allTraceIds.has(id), `formal catalog keeps high-risk trace ${id}`, id);
}

const solidTrace = (catalog.tools || [])
  .find(tool => tool.key === 'wind-object-solid')
  ?.traces.find(trace => trace.id === 'wind-object-solid-table-2-10-dual-cf');
assert(Boolean(solidTrace), 'solid object Table 2.10 trace exists', 'wind-object-solid-table-2-10-dual-cf');
if (solidTrace) {
  arrayIncludesAll(solidTrace.inputs, ['H_o', 'M', 'N', 'b_w', 'z_b', 'openingRatio'], 'solid object Table 2.10 inputs');
  arrayIncludesAll(solidTrace.calculation, ['nu = H_o / b_w', 'M/N', 'C_f(nu)', 'C_f(M/N)', 'max[C_f(nu), C_f(M/N)]'], 'solid object Table 2.10 calculations');
  arrayIncludesAll(solidTrace.report, ['C<sub>f</sub>(ν)', 'C<sub>f</sub>(M/N)', '控制來源'], 'solid object Table 2.10 report fields');
  assert(
    solidTrace.manualReview.join(' ').includes('不得混用') &&
      solidTrace.manualReview.join(' ').includes('規範判定值分列'),
    'solid object Table 2.10 manual review keeps semantic boundary',
    solidTrace.manualReview.join(' / ')
  );
}

[
  'formal-traceability-contract',
  'node 結構工具箱/tools/formal-traceability.contract.test.js',
  'Formal wind and seismic traceability catalog contract'
].forEach(needle => assert(preflight.includes(needle), 'platform preflight runs formal traceability contract', needle));

[
  'steel-traceability-contract',
  'node 鋼構工具/steel-traceability.contract.test.js',
  'Steel traceability catalog contract'
].forEach(needle => assert(preflight.includes(needle), 'platform preflight runs steel traceability contract', needle));

[
  'manifest.shared.traceabilityContract',
  'formal-traceability.contract.test.js'
].forEach(needle => assert(formalToolsContract.includes(needle), 'formal tools contract documents traceability contract', needle));
[
  'manifest.shared.traceabilityContract',
  'traceability catalog contract'
].forEach(needle => assert(formalRunner.includes(needle), 'formal tools runner executes traceability contract', needle));

[
  '結構工具箱/tools/formal-traceability.catalog.json',
  '結構工具箱/tools/formal-traceability.contract.test.js'
].forEach(needle => {
  assert(readme.includes(needle), 'README documents formal traceability contract', needle);
  assert(boundaries.includes(needle), 'TOOL_BOUNDARIES documents formal traceability contract', needle);
  assert(staging.includes(needle), 'STAGING_GROUPS stages formal traceability contract', needle);
});
assert(reportGuide.includes('formal-traceability.contract.test.js'), 'TOOL_REPORT_GUIDE documents formal traceability contract', 'formal-traceability.contract.test.js');

if (failed) {
  console.error(`\n${failed} formal traceability contract checks failed.`);
  process.exit(1);
}

console.log('\nAll formal traceability contract checks passed.');
