const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsDir = __dirname;
const visualPath = path.join(toolsDir, 'foundation-report-visual.test.js');
const testFoundationPath = path.join(toolsDir, 'test-foundation.ps1');
const casesPath = path.join(toolsDir, 'foundation-regression-cases.json');
const toolPath = path.join(toolsDir, 'foundation.html');

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

[
  'assessFoundationAttachmentReadiness',
  'documentState: attachmentReadiness.documentState',
  'documentClass: attachmentReadiness.documentClass',
  '案件識別資料',
].forEach(needle => assertIncludes(tool, needle, 'foundation formal attachment state wiring'));

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
  'assertArtifact(screenshotPath',
  'assertArtifact(pdfPath',
  'foundation-report-visual-audit.json',
].forEach(needle => assertIncludes(visual, needle, 'foundation report visual smoke quality gate'));

console.log('foundation report visual contract OK');
