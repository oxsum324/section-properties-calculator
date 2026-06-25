const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const catalogPath = path.join(ROOT, 'steel-traceability.catalog.json');
const readmePath = path.join(ROOT, 'README.md');
const auditPath = path.join(ROOT, 'audit-tool.ps1');
const mainCalculatorPath = path.join(ROOT, 'calculator.js');
const mainSmokePath = path.join(ROOT, 'calculator.smoke-test.js');

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

const expectedTools = ['steel-main', 'steel-plate', 'steel-beam-formal', 'steel-column-formal'];

assert(catalog.version === '0.1.0', 'steel traceability catalog version', catalog.version);
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
['single_plate', 'column_splice', 'gusset', 'beam_column_moment'].forEach((needle) => {
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
