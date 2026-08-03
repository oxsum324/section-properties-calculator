const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsDir = __dirname;
const visualPath = path.join(toolsDir, 'foundation-report-visual.test.js');
const testFoundationPath = path.join(toolsDir, 'test-foundation.ps1');
const casesPath = path.join(toolsDir, 'foundation-regression-cases.json');
const toolPath = path.join(toolsDir, 'foundation.html');
const baseDemandPath = path.join(toolsDir, '..', 'shared', 'retaining-base-demand.js');
const baseDemandTestPath = path.join(toolsDir, '..', 'shared', 'retaining-base-demand.test.js');

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
const tool = read(toolPath);
const baseDemand = read(baseDemandPath);
const baseDemandTest = read(baseDemandTestPath);

[
  'assessFoundationAttachmentReadiness',
  'documentState: attachmentReadiness.documentState',
  'documentClass: attachmentReadiness.documentClass',
  '案件識別資料',
].forEach(needle => assertIncludes(tool, needle, 'foundation formal attachment state wiring'));

[
  '../shared/retaining-base-demand.js?v=1',
  "geometry: {",
  'toeEffectiveDepth:',
  'heelEffectiveDepth:',
  "group:'底版強度檢核'",
  '趾版底層 φMn ≥ Mu',
  '踵版頂層 φMn ≥ Mu',
].forEach(needle => assertIncludes(tool, needle, 'retaining wall base design wiring'));

[
  'rc-retaining-base-demand.v1',
  'deadMin: 0.9',
  'deadMax: 1.2',
  'earth: 1.6',
  "expectedFace: 'bottom'",
  "expectedFace: 'top'",
  'contactOk',
].forEach(needle => assertIncludes(baseDemand, needle, 'retaining wall base demand core'));

[
  'toe factored moment',
  'heel factored moment',
  'invalid geometry fails closed',
].forEach(needle => assertIncludes(baseDemandTest, needle, 'retaining wall base demand regression'));

[
  'iso_default',
  'combined_default',
  'combined_pass_warn',
  'mat_pass_warn',
  'retain_earth_bridge',
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
  'page metadata completeness',
  'documentState',
  'documentApproved',
  'calculationText',
  'report defaults to printable internal review independent of engineering readiness',
  'DRAFT／非正式附件',
  '文件狀態：內部審閱',
  'report excludes page-only status',
  '不列為 OK 結論',
  '作業模式：',
  'RC 工具箱 ·',
  '僅供初步設計參考',
  'assertReportScreenshotQuality(screenshotPath',
  'assertReportPdfTextQuality(pdfPath',
  'minTextLength: 700',
  'screenshotQuality',
  'pdfTextQuality',
  'captureArtifactIntegrity',
  "'reportPdf'",
  "'reportScreenshot'",
  'artifactIntegrity',
  'assertArtifact(screenshotPath',
  'assertArtifact(pdfPath',
  'foundation-report-visual-audit.json',
].forEach(needle => assertIncludes(visual, needle, 'foundation report visual smoke quality gate'));

console.log('foundation report visual contract OK');
