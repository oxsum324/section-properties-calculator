const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsDir = __dirname;
const visualPath = path.join(toolsDir, 'shear-wall-report-visual.test.js');
const testShearWallReportPath = path.join(toolsDir, 'test-shear-wall-report.ps1');
const toolPath = path.join(toolsDir, 'shear-wall.html');

function read(file) {
  assert.ok(fs.existsSync(file), `missing required file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} should include: ${needle}`);
}

const visual = read(visualPath);
const testShearWallReport = read(testShearWallReportPath);
const tool = read(toolPath);

[
  'assessShearWallAttachmentReadiness',
  'documentState:attachmentReadiness.documentState',
  'documentClass:attachmentReadiness.documentClass',
  '案件識別資料',
].forEach(needle => assertIncludes(tool, needle, 'shear wall formal attachment state wiring'));

[
  'slender_seismic',
  'axial_out_of_range',
].forEach(key => assertIncludes(visual, key, 'shear wall report visual smoke case list'));

[
  'Shear wall report visual smoke',
  'shear-wall-report-visual.test.js',
  'node $testFile',
].forEach(needle => assertIncludes(testShearWallReport, needle, 'test-shear-wall-report visual smoke wiring'));

[
  'process.env.SHEAR_WALL_REPORT_PORT || 0',
  'server.address().port',
  'shearWallAttachmentReadinessCard',
  'page attachment readiness card',
  'page attachment readiness boundary',
  'page attachment readiness priority',
  'page metadata completeness',
  'documentState',
  'documentReason',
  'calculationText',
  'report document class follows page readiness',
  'DRAFT／非正式附件',
  'report excludes page-only status',
  'c@Pu 不採用',
  'toolbarDisplayPrint',
  'assertReportScreenshotQuality(screenshotPath',
  'assertReportPdfTextQuality(pdfPath',
  "'V0.3'",
  "'RC Shear Wall', '計算書', 'V0.3'",
  'screenshotQuality',
  'pdfTextQuality',
  'assertArtifact(screenshotPath',
  'assertArtifact(pdfPath',
  'shear-wall-report-visual-audit.json',
].forEach(needle => assertIncludes(visual, needle, 'shear wall report visual smoke quality gate'));

console.log('shear wall report visual contract OK');
