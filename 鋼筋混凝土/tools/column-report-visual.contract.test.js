const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsDir = __dirname;
const visualPath = path.join(toolsDir, 'column-report-visual.test.js');
const helperPath = path.join(toolsDir, 'report-screenshot-quality.js');
const testColumnPath = path.join(toolsDir, 'test-column.ps1');
const casesPath = path.join(toolsDir, 'column-regression-cases.json');

function read(file) {
  assert.ok(fs.existsSync(file), `missing required file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} should include: ${needle}`);
}

const visual = read(visualPath);
const helper = read(helperPath);
const testColumn = read(testColumnPath);
const cases = JSON.parse(read(casesPath));

[
  'default_rect_design',
  'seismic_lap_class_a_ineligible_uses_b',
  'seismic_detail_first_outside_spacing_ng'
].forEach(key => {
  assert.ok(cases.cases.some(tc => tc.key === key), `visual smoke case missing from regression cases: ${key}`);
  assertIncludes(visual, key, 'column report visual smoke case list');
});

[
  'Column report visual smoke',
  'column-report-visual.test.js',
  'node $visualTestFile'
].forEach(needle => assertIncludes(testColumn, needle, 'test-column visual smoke wiring'));

[
  'process.env.RC_VISUAL_PORT || 0',
  'server.address().port',
  'hasReportSummary',
  'hasCoverageSummary',
  'report top reminder hidden',
  'coverage summary hidden',
  'columnAttachmentReadiness',
  'page attachment readiness card',
  'page attachment readiness boundary',
  'report excludes page-only attachment readiness',
  'no gap-summary title',
  'no top manual-review reminder',
  'print toolbar hidden',
  'assertArtifact(screenshotPath',
  'assertReportScreenshotQuality(screenshotPath',
  'assertReportPdfTextQuality(pdfPath',
  'column-direct-print-${tc.key}.pdf',
  'readPdfTextWithPoppler(directPrintPdfPath)',
  'RC 工具主頁列印已封鎖',
  'direct print hides work page',
  'blocked direct-print PDF page count',
  'blocked direct-print PDF written',
  'screenshotQuality',
  'pdfTextQuality',
  'assertArtifact(pdfPath',
  '0x89, 0x50, 0x4e, 0x47',
  '0x25, 0x50, 0x44, 0x46',
  'column-report-visual-audit.json'
].forEach(needle => assertIncludes(visual, needle, 'column report visual smoke quality gate'));

[
  'function readPngVisualQuality',
  'function readPdfTextWithPython',
  'function readPdfTextWithPoppler',
  "spawnSync('pdftotext'",
  'function assertReportPdfTextQuality',
  'PAGE_ONLY_REPORT_STATUS_NEEDLES',
  'includeAny',
  'from pypdf import PdfReader',
  'nonWhitePixelCount',
  'uniqueColorCount',
  'module.exports',
].forEach(needle => assertIncludes(helper, needle, 'shared report artifact quality helper'));

console.log('column report visual contract OK');
