const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const catalogPath = path.join(ROOT, 'steel-traceability.catalog.json');
const readmePath = path.join(ROOT, 'README.md');
const auditPath = path.join(ROOT, 'audit-tool.ps1');
const mainCalculatorPath = path.join(ROOT, 'calculator.js');
const mainSmokePath = path.join(ROOT, 'calculator.smoke-test.js');
const mainAppPath = path.join(ROOT, 'app.js');
const mainIndexPath = path.join(ROOT, 'index.html');

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

const catalogText = fs.readFileSync(catalogPath, 'utf8');
const catalog = JSON.parse(catalogText);
const readme = fs.readFileSync(readmePath, 'utf8');
const audit = fs.readFileSync(auditPath, 'utf8');
const calculator = fs.readFileSync(mainCalculatorPath, 'utf8');
const smoke = fs.readFileSync(mainSmokePath, 'utf8');
const app = fs.readFileSync(mainAppPath, 'utf8');
const index = fs.readFileSync(mainIndexPath, 'utf8');

const expectedTools = ['steel-main', 'steel-plate', 'steel-beam-formal', 'steel-column-formal'];

assert(catalog.version === '0.2.0', 'steel traceability catalog version', catalog.version);
assert(catalog.family === 'steel-traceability', 'steel traceability catalog family', catalog.family);
assertString(catalog.description, 'steel traceability catalog description');
assert(Array.isArray(catalog.tools), 'steel traceability catalog tools array', `count=${catalog.tools?.length || 0}`);
assert(sameArray((catalog.tools || []).map(tool => tool.key), expectedTools), 'steel traceability catalog tool order', JSON.stringify((catalog.tools || []).map(tool => tool.key)));

const seenToolKeys = new Set();
for (const tool of catalog.tools || []) {
  assertString(tool.key, `${tool.key || 'tool'} key`);
  assert(!seenToolKeys.has(tool.key), `${tool.key} unique key`, tool.key);
  seenToolKeys.add(tool.key);
  assertString(tool.label, `${tool.key} label`);
  assertString(tool.scope, `${tool.key} scope`);
  assert(tool.status === 'covered', `${tool.key} status`, tool.status);
  assert(Array.isArray(tool.traces) && tool.traces.length >= 2, `${tool.key} trace count`, `count=${tool.traces?.length || 0}`);

  const seenTraceIds = new Set();
  for (const [index, trace] of (tool.traces || []).entries()) {
    assertString(trace.id, `${tool.key} trace ${index} id`);
    assert(!seenTraceIds.has(trace.id), `${tool.key} trace id unique`, trace.id);
    seenTraceIds.add(trace.id);
    assertString(trace.clause, `${tool.key} trace ${trace.id} clause`);
    assert(/規範|章|節|式/.test(trace.clause), `${tool.key} trace ${trace.id} names formal source`, trace.clause);
    assertString(trace.purpose, `${tool.key} trace ${trace.id} purpose`);
    for (const field of ['inputs', 'calculation', 'report', 'evidence', 'manualReview']) {
      assertStringArray(trace[field], `${tool.key} trace ${trace.id} ${field}`);
    }
    assert(
      trace.manualReview.some(item => /人工複核|設計者|施工圖|專案|模型|材料|試驗|正式手算/.test(item)),
      `${tool.key} trace ${trace.id} manual review wording`,
      trace.manualReview.join(' / ')
    );
    for (const evidence of trace.evidence || []) {
      assert(evidenceExists(evidence), `${tool.key} trace ${trace.id} evidence exists`, evidence);
    }
  }
}

assert(
  catalogText.includes('steel-main-scope-boundary') && catalogText.includes('complianceReady=false'),
  'steel traceability catalog records development-module boundary',
  'steel-main-scope-boundary'
);
assert(
  calculator.includes('此模組尚未收斂到完整規範覆核範圍') &&
    calculator.includes('本模組仍含範圍受限或簡化條件'),
  'steel calculator preserves formal-scope guardrails',
  'development modules blocked'
);
const steelMain = catalog.tools.find((tool) => tool.key === 'steel-main');
const shearTabTrace = steelMain?.traces?.find((trace) => trace.id === 'steel-main-single-plate-shear-tab');
const gussetTrace = steelMain?.traces?.find((trace) => trace.id === 'steel-main-brace-gusset-tension');
const developmentBoundary = steelMain?.traces?.find((trace) => trace.id === 'steel-main-scope-boundary');
assert(Boolean(shearTabTrace), 'steel traceability catalog records formal Shear Tab route', 'steel-main-single-plate-shear-tab');
assert(
  shearTabTrace?.calculation?.includes('complianceReady=true') &&
    shearTabTrace?.report?.includes('剪力接頭檢核計算書') &&
    shearTabTrace?.calculation?.some((item) => item.includes('eccentric bolt-group')) &&
    shearTabTrace?.calculation?.some((item) => item.includes('eccentric weld-metal')),
  'steel Shear Tab trace covers formal state, eccentric bolt group, eccentric weld group, and report',
  shearTabTrace?.id || 'missing'
);
assert(
  /single_plate:\s*\{[\s\S]*?complianceReady:\s*true/.test(calculator) &&
    smoke.includes('shear.complianceReady, true') &&
    smoke.includes('single plate should expose all ten strength routes'),
  'steel runtime and smoke mark Shear Tab as formal with complete strength routes',
  'single_plate'
);
assert(
  Boolean(gussetTrace) &&
    gussetTrace.calculation?.includes('complianceReady=true') &&
    gussetTrace.report?.includes('支撐 / Gusset 接頭檢核計算書') &&
    gussetTrace.calculation?.some((item) => item.includes('Whitmore effective width')) &&
    gussetTrace.calculation?.includes('Whitmore theoretical width = 2Lconn tan30 degrees') &&
    gussetTrace.calculation?.includes('flat-plate brace U = 1.0 and Ae = An') &&
    gussetTrace.calculation?.includes('bolted Gusset Ae = min(An, 0.85Ag)') &&
    gussetTrace.calculation?.some((item) => item.includes('4.00 tf/cm2') && item.includes('5.00 tf/cm2')) &&
    gussetTrace.calculation?.some((item) => item.includes('Lconn <= 1250 mm') && item.includes('note [e]')) &&
    gussetTrace.calculation?.some((item) => item.includes('strict exact-field source replay')),
  'steel Gusset trace covers formal state, capped Whitmore width, strict replay, and report',
  gussetTrace?.id || 'missing'
);
assert(
  /brace_gusset:\s*\{[\s\S]*?complianceReady:\s*true/.test(calculator) &&
    smoke.includes('complete Gusset V1 golden case should pass') &&
    smoke.includes('Gusset V1 should expose all thirteen required strength routes') &&
    app.includes('brace_gusset: "支撐接頭｜平板支撐 Gusset 拉力接頭｜LRFD 正式模組"') &&
    /<option value="brace_gusset">支撐接頭｜平板支撐 Gusset 拉力接頭｜LRFD 正式模組<\/option>/.test(index),
  'steel runtime, smoke, UI, and option mark Gusset V1 as formal',
  'brace_gusset'
);
assert(
  !developmentBoundary?.manualReview?.some((item) => item.includes('單剪力板') || item.includes('Gusset')) &&
    ['柱續接', '梁柱彎矩'].every((needle) => developmentBoundary?.manualReview?.some((item) => item.includes(needle))),
  'steel development boundary excludes formal Shear Tab and Gusset while retaining two modules',
  developmentBoundary?.manualReview?.join(' / ') || 'missing'
);
['column_splice', 'beam_column_moment'].forEach((needle) => {
  assert(
    smoke.includes(needle) || calculator.includes(needle),
    `steel development module remains explicitly tested or guarded: ${needle}`,
    needle
  );
});
assert(
  audit.includes('Steel traceability catalog contract') && audit.includes('steel-traceability.contract.test.js'),
  'steel audit runs traceability catalog contract',
  'audit-tool.ps1'
);
assert(readme.includes('steel-traceability.catalog.json'), 'steel README documents traceability catalog path', 'README.md');
assert(readme.includes('條文語意追蹤'), 'steel README documents traceability purpose', 'README.md');

if (failed) {
  console.error(`\n${failed} steel traceability contract checks failed.`);
  process.exit(1);
}

console.log('\nAll steel traceability contract checks passed.');
