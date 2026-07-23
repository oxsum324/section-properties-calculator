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
  't_beam_seismic_vc0',
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
  'waitForCalculatedReadiness',
  "typeof window.RCUI?.renderAttachmentReadiness === 'function'",
  "page.waitForEvent('popup'",
  'beamAttachmentReadinessCard',
  'page attachment readiness card',
  'page attachment readiness boundary',
  'page attachment readiness priority',
  'report excludes page-only attachment readiness',
  'T-beam section caption',
  'T-beam excludes rectangular caption',
  '容量式候選依',
  '套用並檢核',
  'M+ / M− / V 利用率',
  '人工複核 / 補充資料需求',
  '不列為 OK 結論',
  'assertArtifact(screenshotPath',
  'assertReportScreenshotQuality(screenshotPath',
  'assertReportPdfTextQuality(pdfPath',
  'beam-direct-print-${tc.key}.pdf',
  'readPdfTextWithPoppler(directPrintPdfPath)',
  'RC 工具主頁列印已封鎖',
  'direct print hides work page',
  'blocked direct-print PDF page count',
  'blocked direct-print PDF written',
  'screenshotQuality',
  'pdfTextQuality',
  'assertArtifact(pdfPath',
  'beam-report-visual-audit.json',
].forEach(needle => assertIncludes(visual, needle, 'beam report visual smoke quality gate'));

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

console.log('beam report visual contract OK');
