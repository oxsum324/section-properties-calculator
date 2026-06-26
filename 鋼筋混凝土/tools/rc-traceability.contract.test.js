const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const repoRoot = path.resolve(ROOT, '..');
const catalogPath = path.join(ROOT, 'tools', 'rc-traceability.catalog.json');
const readmePath = path.join(ROOT, 'README.md');
const auditPath = path.join(ROOT, 'audit-tool.ps1');
const preflightPath = path.join(repoRoot, 'preflight-tools.ps1');

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

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

const catalogText = readUtf8(catalogPath);
const catalog = JSON.parse(catalogText);
const readme = readUtf8(readmePath);
const audit = readUtf8(auditPath);
const preflight = readUtf8(preflightPath);

const expectedTools = ['beam', 'column', 'slab', 'wall', 'shear-wall', 'foundation', 'single-pile'];
const requiredTracePhrases = [
  '人工複核',
  '施工圖',
  '專案',
  '報告',
  'evidence'
];

assert(catalog.version === '0.1.0', 'RC traceability catalog version', catalog.version);
assert(catalog.family === 'rc-traceability', 'RC traceability catalog family', catalog.family);
assertString(catalog.description, 'RC traceability catalog description');
assert(!catalogText.includes('18.10'), 'RC traceability catalog has no stale 18.10 references', 'uses current RC clause refs');
assert(Array.isArray(catalog.tools), 'RC traceability catalog tools array', `count=${catalog.tools?.length || 0}`);
assert(
  sameArray((catalog.tools || []).map(tool => tool.key), expectedTools),
  'RC traceability catalog tool order',
  JSON.stringify((catalog.tools || []).map(tool => tool.key))
);

const seenToolKeys = new Set();
const seenTraceIds = new Set();
let totalTraceCount = 0;
let totalManualReviewCount = 0;

for (const tool of catalog.tools || []) {
  assertString(tool.key, `${tool.key || 'tool'} key`);
  assert(!seenToolKeys.has(tool.key), `${tool.key} unique key`, tool.key);
  seenToolKeys.add(tool.key);
  assertString(tool.label, `${tool.key} label`);
  assertString(tool.scope, `${tool.key} scope`);
  assert(tool.status === 'covered', `${tool.key} status`, tool.status);
  assert(Array.isArray(tool.traces) && tool.traces.length >= 3, `${tool.key} trace count`, `count=${tool.traces?.length || 0}`);

  for (const [index, trace] of (tool.traces || []).entries()) {
    totalTraceCount++;
    assertString(trace.id, `${tool.key} trace ${index} id`);
    assert(!seenTraceIds.has(trace.id), `${trace.id} unique trace id`, trace.id);
    seenTraceIds.add(trace.id);
    assertString(trace.clause, `${trace.id} clause`);
    assert(
      /混凝土結構設計規範|112 年版|規範|章|節|式/.test(trace.clause),
      `${trace.id} names formal RC source`,
      trace.clause
    );
    assertString(trace.purpose, `${trace.id} purpose`);
    for (const field of ['inputs', 'calculation', 'report', 'evidence', 'manualReview']) {
      assertStringArray(trace[field], `${trace.id} ${field}`);
    }
    totalManualReviewCount += trace.manualReview.length;
    assert(
      trace.manualReview.some(item => /人工複核|正式分析|施工圖|設計者|專案|模型|圖說|地工報告|試樁/.test(item)),
      `${trace.id} manual review wording`,
      trace.manualReview.join(' / ')
    );
    for (const evidence of trace.evidence || []) {
      assert(evidenceExists(evidence), `${trace.id} evidence exists`, evidence);
    }
  }
}

assert(totalTraceCount >= 24, 'RC traceability catalog trace volume', `traces=${totalTraceCount}`);
assert(totalManualReviewCount >= 24, 'RC traceability catalog manual review volume', `manualReview=${totalManualReviewCount}`);

for (const phrase of requiredTracePhrases) {
  assert(catalogText.includes(phrase), `RC traceability catalog includes ${phrase}`, phrase);
}

[
  'beam-development-25',
  'column-smrf-18-4',
  'slab-two-way-flat-boundary',
  'wall-sbe-extension-18-7-6',
  'shear-wall-scope-review-boundary',
  'foundation-combined-mat-review-boundary',
  'single-pile-manual-review-boundary'
].forEach((traceId) => {
  assert(catalogText.includes(traceId), `RC catalog keeps high-risk trace ${traceId}`, traceId);
});

assert(
  audit.includes('RC traceability catalog contract') && audit.includes('rc-traceability.contract.test.js'),
  'RC audit runs traceability catalog contract',
  'audit-tool.ps1'
);
assert(
  preflight.includes('rc-traceability-contract') && preflight.includes('鋼筋混凝土/tools/rc-traceability.contract.test.js'),
  'platform preflight runs RC traceability catalog contract',
  'preflight-tools.ps1'
);
assert(readme.includes('tools/rc-traceability.catalog.json'), 'RC README documents traceability catalog path', 'README.md');
assert(readme.includes('RC 條文語意追蹤 catalog'), 'RC README documents traceability purpose', 'README.md');
assert(readme.includes('rc-traceability.contract.test.js'), 'RC README documents traceability contract', 'README.md');

if (failed) {
  console.error(`\n${failed} RC traceability contract checks failed.`);
  process.exit(1);
}

console.log('\nAll RC traceability contract checks passed.');
