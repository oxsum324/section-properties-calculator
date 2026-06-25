const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const catalogPath = path.join(ROOT, 'decking-traceability.catalog.json');

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
const html = readUtf8('index.html');
const report = readUtf8('report/gen_report.py');
const fixture = readUtf8('test-fixtures/report-smoke.json');
const sectionTable = readUtf8('shared/h-section-table.js');

const expectedTools = [
  'decking-load-member-strength',
  'decking-column-load-path',
  'decking-foundation-support',
  'decking-report-governance',
];

assert(catalog.version === '0.1.0', 'decking traceability catalog version', catalog.version);
assert(catalog.family === 'decking-traceability', 'decking traceability catalog family', catalog.family);
assertString(catalog.description, 'decking traceability catalog description');
assert(Array.isArray(catalog.tools), 'decking traceability catalog tools array', `count=${catalog.tools?.length || 0}`);
assert(
  sameArray((catalog.tools || []).map(tool => tool.key), expectedTools),
  'decking traceability catalog tool order',
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
      /AASHTO|AISC|CNS|JIS|規範|施工|樁基|握裹|交付治理/.test(trace.clause),
      `${trace.id} names formal source or engineering basis`,
      trace.clause
    );
    assertString(trace.purpose, `${trace.id} purpose`);
    for (const field of ['inputs', 'calculation', 'report', 'evidence', 'manualReview']) {
      assertStringArray(trace[field], `${trace.id} ${field}`);
    }
    assert(
      trace.manualReview.some(item => /人工複核|設計者|施工圖|專案|現場|材料|地質|吊車|外部|審查者/.test(item)),
      `${trace.id} manual review wording`,
      trace.manualReview.join(' / ')
    );
    for (const evidence of trace.evidence || []) {
      assert(evidenceExists(evidence), `${trace.id} evidence exists`, evidence);
    }
  }
}

assert(seenTraceIds.size >= 8, 'decking traceability catalog trace volume', `traces=${seenTraceIds.size}`);

[
  'AASHTO Standard Specifications for Highway Bridges',
  '鋼構造建築物鋼結構設計技術規範',
  'AISC ASD',
  'CNS',
  'JIS',
  'HS 20-44',
  'PC400',
].forEach((needle) => {
  assert(catalogText.includes(needle) || report.includes(needle) || sectionTable.includes(needle), `decking formal basis includes ${needle}`, needle);
});

[
  'function loadCombo',
  'function deflThreeCases',
  'function calcDeck',
  'function calcStringer',
  'function calcGirder',
  'function calcColumn',
  'function calcBond',
  'function calcPile',
  'function exportJSON',
].forEach((needle) => {
  assert(html.includes(needle), `decking HTML keeps ${needle}`, needle);
});

[
  'Fb = 0.6 * g.Fy * g.beta',
  'Fv = 0.4 * g.Fy * g.beta',
  'const Pu1 = c.Vmax',
  'const Pu2 = 0.5*WT2*L + Pc*(L-0.5)/L',
  'const Pu3 = 0.5*WT2*L + Pc*2*Math.max(0, L-4)/L',
  'const tau = 0.03 * fc',
  'const Qa = Qb/FSb + Qs/FSs',
  'setActionStatus',
].forEach((needle) => {
  assert(html.includes(needle), `decking HTML keeps calculation/feedback guard: ${needle}`, needle);
});

[
  '適用規範',
  'HS 20-44 卡車',
  'PC400 履帶車',
  'WT₂ (吊車)',
  '傳至共構柱之軸力 Pu（三情境）',
  'AISC 軸壓+雙軸彎交互式',
  'H 型鋼貫入 PC 之握裹力檢核',
  '共構樁基承載力檢核',
  '本計算書係依本案設計載重',
].forEach((needle) => {
  assert(report.includes(needle), `decking report keeps section: ${needle}`, needle);
});

[
  '"deck"',
  '"stringer"',
  '"girder"',
  '"column"',
  '"bond"',
  '"pile"',
  '"ok_fb"',
  '"ok_d"',
  '"PuMax"',
  '"Qa"',
].forEach((needle) => {
  assert(fixture.includes(needle), `decking report fixture keeps ${needle}`, needle);
});

[
  'H_SECTIONS',
  'DECK_PLATE',
  'LOAD_PRESETS',
  'HS20-44',
  'PC400',
  '200T 吊車',
  '300T 吊車',
].forEach((needle) => {
  assert(sectionTable.includes(needle), `decking shared section table keeps ${needle}`, needle);
});

assert(readme.includes('decking-traceability.catalog.json'), 'decking README documents traceability catalog path', 'README.md');
assert(readme.includes('條文語意追蹤'), 'decking README documents traceability purpose', 'README.md');

if (failed) {
  console.error(`\n${failed} decking traceability contract checks failed.`);
  process.exit(1);
}

console.log('\nAll decking traceability contract checks passed.');
