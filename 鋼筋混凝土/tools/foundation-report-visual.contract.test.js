const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsDir = __dirname;
const visualPath = path.join(toolsDir, 'foundation-report-visual.test.js');
const testFoundationPath = path.join(toolsDir, 'test-foundation.ps1');
const casesPath = path.join(toolsDir, 'foundation-regression-cases.json');

function read(file) {
  assert.ok(fs.existsSync(file), `missing required file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} should include: ${needle}`);
}

const visual = read(visualPath);
const testFoundation = read(testFoundationPath);
const cases = JSON.parse(read(casesPath));

[
  'iso_default',
  'combined_default',
  'combined_pass_warn',
  'mat_pass_warn',
  'retain_counterfort_warn',
  'pile_default',
].forEach(key => {
  assert.ok(cases.cases.some(tc => tc.key === key), `visual smoke case missing from regression cases: ${key}`);
  assertIncludes(visual, key, 'foundation report visual smoke case list');
});

[
  'Foundation report visual smoke',
  'foundation-report-visual.test.js',
  'node $visualTestFile',
].forEach(needle => assertIncludes(testFoundation, needle, 'test-foundation visual smoke wiring'));

[
  'process.env.FOUNDATION_REPORT_PORT || 0',
  'server.address().port',
  'foundationAttachmentReadinessCard',
  'page attachment readiness card',
  'page attachment readiness boundary',
  'page attachment readiness priority',
  'report excludes page-only status',
  '不列為 OK 結論',
  'assertReportScreenshotQuality(screenshotPath',
  'assertReportPdfTextQuality(pdfPath',
  'minTextLength: 700',
  'screenshotQuality',
  'pdfTextQuality',
  'assertArtifact(screenshotPath',
  'assertArtifact(pdfPath',
  'foundation-report-visual-audit.json',
].forEach(needle => assertIncludes(visual, needle, 'foundation report visual smoke quality gate'));

console.log('foundation report visual contract OK');
