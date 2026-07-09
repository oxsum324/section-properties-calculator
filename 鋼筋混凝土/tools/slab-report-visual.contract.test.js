const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsDir = __dirname;
const visualPath = path.join(toolsDir, 'slab-report-visual.test.js');
const testSlabPath = path.join(toolsDir, 'test-slab.ps1');
const casesPath = path.join(toolsDir, 'slab-regression-cases.json');

function read(file) {
  assert.ok(fs.existsSync(file), `missing required file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} should include: ${needle}`);
}

const visual = read(visualPath);
const testSlab = read(testSlabPath);
const cases = JSON.parse(read(casesPath));

[
  'one_basic',
  'two_basic',
  'flat_interior_pass_warn',
  'flat_edge_cons',
].forEach(key => {
  assert.ok(cases.cases.some(tc => tc.key === key), `visual smoke case missing from regression cases: ${key}`);
  assertIncludes(visual, key, 'slab report visual smoke case list');
});

[
  'Slab report visual smoke',
  'slab-report-visual.test.js',
  'node $visualTestFile',
].forEach(needle => assertIncludes(testSlab, needle, 'test-slab visual smoke wiring'));

[
  'process.env.SLAB_REPORT_PORT || 0',
  'server.address().port',
  'slabAttachmentReadinessCard',
  'page attachment readiness card',
  'page attachment readiness boundary',
  'page attachment readiness priority',
  'report excludes page-only review prompt',
  'assertReportScreenshotQuality(screenshotPath',
  'assertArtifact(screenshotPath',
  'assertArtifact(pdfPath',
  'slab-report-visual-audit.json',
].forEach(needle => assertIncludes(visual, needle, 'slab report visual smoke quality gate'));

console.log('slab report visual contract OK');
