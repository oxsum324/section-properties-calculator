const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsDir = __dirname;
const visualPath = path.join(toolsDir, 'wall-report-visual.test.js');
const testWallPath = path.join(toolsDir, 'test-wall.ps1');
const toolPath = path.join(toolsDir, 'wall.html');

function read(file) {
  assert.ok(fs.existsSync(file), `missing required file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} should include: ${needle}`);
}

const visual = read(visualPath);
const testWall = read(testWallPath);
const tool = read(toolPath);

[
  'assessWallAttachmentReadiness',
  'documentState:attachmentReadiness.documentState',
  'documentClass:attachmentReadiness.documentClass',
  '案件識別資料',
  '../shared/wall-inplane-evaluator.js?v=1',
  'WallInplaneEvaluator.computeCapacity(wallInplaneEvaluatorBase)',
  "key:'compression-capacity'",
  "key:'tension-boundary'",
  "key:'shear-capacity'",
].forEach(needle => assertIncludes(tool, needle, 'wall formal attachment state wiring'));

[
  'shear_seismic',
  'basement_oop',
  'basement_pass_warn',
].forEach(key => assertIncludes(visual, key, 'wall report visual smoke case list'));

[
  'Wall report visual smoke',
  'Wall in-plane evaluator tests',
  'wall-inplane-evaluator.test.js',
  'wall-report-visual.test.js',
  'node $visualTestFile',
].forEach(needle => assertIncludes(testWall, needle, 'test-wall visual smoke wiring'));

[
  'process.env.WALL_REPORT_PORT || 0',
  'server.address().port',
  'wallAttachmentReadinessCard',
  'exerciseWallCapacityLoadCombo',
  'wall tension suggestion fails closed',
  'wall eccentricity overflow fails closed in browser workflow',
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
  'report excludes method audit table',
  '條文對照 ＆ 方法分級',
  '規範覆蓋矩陣',
  '不列為 OK 結論',
  'assertReportScreenshotQuality(screenshotPath',
  'assertReportPdfTextQuality(pdfPath',
  'screenshotQuality',
  'pdfTextQuality',
  'assertArtifact(screenshotPath',
  'assertArtifact(pdfPath',
  'wall-report-visual-audit.json',
].forEach(needle => assertIncludes(visual, needle, 'wall report visual smoke quality gate'));

console.log('wall report visual contract OK');
