const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const catalogPath = path.join(ROOT, 'stone-traceability.catalog.json');

let failed = 0;

function assert(pass, label, detail = '') {
  if (!pass) {
    failed++;
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

function evidenceExists(relativePath) {
  return fs.existsSync(path.join(ROOT, ...relativePath.split('/')));
}

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, ...relativePath.split('/')), 'utf8');
}

const catalogText = fs.readFileSync(catalogPath, 'utf8');
const catalog = JSON.parse(catalogText);
const readme = readUtf8('README.md');
const formulaRegistry = readUtf8('js/formula-registry.spec.js');
const codeProfiles = readUtf8('js/code-profiles-registry.spec.js');
const calculator = readUtf8('js/calculator.spec.js');
const constants = readUtf8('js/constants.spec.js');
const inputSchema = readUtf8('js/input-schema.spec.js');
const regressionSmoke = readUtf8('js/regression-smoke.test.js');
const mainHtml = readUtf8('石材計算書產生器_規範版V2.html');
const uiSmoke = readUtf8('ui_smoke_test.py');

const expectedTools = [
  'stone-load-demand',
  'stone-anchor-connection',
  'stone-panel-local',
  'stone-serviceability-report',
];

assert(catalog.version === '0.6.0', 'stone traceability catalog version', catalog.version);
assert(catalog.family === 'stone-traceability', 'stone traceability catalog family', catalog.family);
assertString(catalog.description, 'stone traceability catalog description');
assert(Array.isArray(catalog.tools), 'stone traceability catalog tools array', `count=${catalog.tools?.length || 0}`);
assert(
  sameArray((catalog.tools || []).map(tool => tool.key), expectedTools),
  'stone traceability catalog tool order',
  JSON.stringify((catalog.tools || []).map(tool => tool.key))
);

const seenToolKeys = new Set();
const seenTraceIds = new Set();
for (const tool of catalog.tools || []) {
  assertString(tool.key, `${tool.key || 'tool'} key`);
  assert(!seenToolKeys.has(tool.key), `${tool.key} unique key`, tool.key);
  seenToolKeys.add(tool.key);
  assertString(tool.label, `${tool.key} label`);
  assertString(tool.scope, `${tool.key} scope`);
  assert(tool.status === 'covered', `${tool.key} status`, tool.status);
  assert(Array.isArray(tool.traces) && tool.traces.length >= 2, `${tool.key} trace count`, `count=${tool.traces?.length || 0}`);

  for (const [index, trace] of (tool.traces || []).entries()) {
    assertString(trace.id, `${tool.key} trace ${index} id`);
    assert(!seenTraceIds.has(trace.id), `${trace.id} unique trace id`, trace.id);
    seenTraceIds.add(trace.id);
    assertString(trace.clause, `${trace.id} clause`);
    assert(
      /耐風|耐震|ACI|CNS|JASS|鋼構|台北市|規範|節/.test(trace.clause),
      `${trace.id} names formal source`,
      trace.clause
    );
    assertString(trace.purpose, `${trace.id} purpose`);
    for (const field of ['inputs', 'calculation', 'report', 'evidence', 'manualReview']) {
      assertStringArray(trace[field], `${trace.id} ${field}`);
    }
    assert(
      trace.manualReview.some(item => /人工複核|設計者|施工圖|專案|材料|試驗|廠商|外部|技師/.test(item)),
      `${trace.id} manual review wording`,
      trace.manualReview.join(' / ')
    );
    for (const evidence of trace.evidence || []) {
      assert(evidenceExists(evidence), `${trace.id} evidence exists`, evidence);
    }
  }
}

assert(seenTraceIds.size >= 8, 'stone traceability catalog trace volume', `traces=${seenTraceIds.size}`);

[
  '建築物耐風設計規範及解說（107 年版）',
  '建築物耐震設計規範及解說（113 年版）',
  '混凝土結構設計規範附篇 D',
  'CNS 14448',
  'CNS 6300 A1028',
  'JASS 9',
  '台北市石材外牆作業規範',
].forEach((needle) => {
  assert(catalogText.includes(needle), `stone traceability catalog includes source: ${needle}`, needle);
});

[
  '膨脹螺栓 Tu1（垂直力）',
  '膨脹螺栓 Tu2（水平力）',
  '膨脹螺栓 拉剪交互',
  '石材板彎曲應力',
  '石材孔周剪應力 / 石板衝切（簡化）',
  '掛件相對位移容許',
  '伸縮縫淨寬估算',
].forEach((needle) => {
  assert(formulaRegistry.includes(needle), `stone formula registry keeps check: ${needle}`, needle);
});

[
  'cns_wind_107',
  'cns_seismic_113',
  'aci_318_appendix_d',
  'cns_steel_general',
  'cns_stone_general',
  'buildGovernanceFingerprint',
  'buildGovernanceAckHash',
  'PROFILE_INPUT_BINDINGS',
  'buildProfileInputUpdates',
  'normalizeProfileOverrides',
  'buildProfileOwnedInputDefaults',
  'validateGovernanceMeta',
].forEach((needle) => {
  assert(codeProfiles.includes(needle), `stone code profile governance keeps ${needle}`, needle);
});

[
  'anchorCapacity',
  'anchorGroupReduction',
  'seismicDemand',
  'panelCheck',
  'geometryCheck',
  'materialCheck',
  'dimensionCheck',
  'driftCheck',
  'thermalCheck',
  'buildCaseCheckData',
  'calcCase',
].forEach((needle) => {
  assert(calculator.includes(`function ${needle}`), `stone calculator keeps function ${needle}`, needle);
});

[
  'ANCHOR_CATALOG',
  'STONE_GRADE_CATALOG',
  'SPEC_MODULES',
  'SPEC_REFS',
  'FIELD_RULES',
  'GEOMETRY_RULE_OPTIONS',
].forEach((needle) => {
  assert(constants.includes(needle), `stone constants keep ${needle}`, needle);
});

[
  'validate',
  'warnings',
  'errors',
].forEach((needle) => {
  assert(inputSchema.includes(needle), `stone input schema keeps ${needle}`, needle);
});

[
  'anchor group and edge reduction',
  'manual GCp and GCpi wind pressure',
  'drift failure flags displacement and rotation',
  'thermal joint failure',
  'separated interaction omits duplicate shear term',
  'profile runtime sync',
].forEach((needle) => {
  assert(regressionSmoke.includes(needle), `stone regression smoke keeps ${needle}`, needle);
});

[
  'function v2SyncProfileOwnedInputs',
  'SP.buildProfileInputUpdates',
  'function v2GetRuntimeProfileOverride',
  'function v2SetRuntimeProfileOverride',
  'v2SetRuntimeProfileOverride(inp.code_profiles)',
  'function v2ApplyImportedDefault',
  'v2ProfileOwnedInputDefaults(profileOverride)',
  'applied_defaults: appliedDefaults.length',
  '缺少欄位已依目前設定補齊',
  '已同步 ${updatedCount} 個 profile 預設欄位',
  '保留 ${preservedCount} 個人工覆寫欄位',
].forEach((needle) => {
  assert(mainHtml.includes(needle), `stone profile picker runtime keeps ${needle}`, needle);
});

[
  'Expected saved project profile to replace fresh runtime state',
  'Expected default project to clear unrelated browser profile',
  'Expected in-memory project profile to survive storage failure',
  'Expected missing fields to follow active project profile',
  'Expected explicit imported Rp to survive profile default migration',
].forEach((needle) => {
  assert(uiSmoke.includes(needle), `stone project profile browser regression keeps ${needle}`, needle);
});

assert(readme.includes('stone-traceability.catalog.json'), 'stone README documents traceability catalog path', 'README.md');
assert(readme.includes('條文語意追蹤'), 'stone README documents traceability purpose', 'README.md');

if (failed) {
  console.error(`\n${failed} stone traceability contract checks failed.`);
  process.exit(1);
}

console.log('\nAll stone traceability contract checks passed.');
