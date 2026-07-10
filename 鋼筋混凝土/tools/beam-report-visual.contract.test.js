const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsDir = __dirname;
const visualPath = path.join(toolsDir, 'beam-report-visual.test.js');
const helperPath = path.join(toolsDir, 'report-screenshot-quality.js');
const testBeamPath = path.join(toolsDir, 'test-beam.ps1');
const casesPath = path.join(toolsDir, 'beam-regression-cases.json');

function read(file) {
  assert.ok(fs.existsSync(file), `missing required file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} should include: ${needle}`);
}

const visual = read(visualPath);
const helper = read(helperPath);
const testBeam = read(testBeamPath);
const cases = JSON.parse(read(casesPath));

[
  'default_rect_design',
  'smrf_ve_controls_shear_demand',
].forEach(key => {
  assert.ok(cases.cases.some(tc => tc.key === key), `visual smoke case missing from regression cases: ${key}`);
  assertIncludes(visual, key, 'beam report visual smoke case list');
});

[
  'Beam report visual smoke',
  'beam-report-visual.test.js',
  'node $visualTestFile',
].forEach(needle => assertIncludes(testBeam, needle, 'test-beam visual smoke wiring'));

[
  'process.env.BEAM_REPORT_PORT || 0',
  'server.address().port',
  'beamAttachmentReadinessCard',
  'page attachment readiness card',
  'page attachment readiness boundary',
  'page attachment readiness priority',
  'report excludes page-only attachment readiness',
  '人工複核 / 補充資料需求',
  '不列為 OK 結論',
  'assertArtifact(screenshotPath',
  'assertReportScreenshotQuality(screenshotPath',
  'assertReportPdfTextQuality(pdfPath',
  'screenshotQuality',
  'pdfTextQuality',
  'assertArtifact(pdfPath',
  'beam-report-visual-audit.json',
].forEach(needle => assertIncludes(visual, needle, 'beam report visual smoke quality gate'));

[
  'function readPngVisualQuality',
  'function readPdfTextWithPython',
  'function assertReportPdfTextQuality',
  'PAGE_ONLY_REPORT_STATUS_NEEDLES',
  'includeAny',
  'from pypdf import PdfReader',
  'nonWhitePixelCount',
  'uniqueColorCount',
  'module.exports',
].forEach(needle => assertIncludes(helper, needle, 'shared report artifact quality helper'));

console.log('beam report visual contract OK');
