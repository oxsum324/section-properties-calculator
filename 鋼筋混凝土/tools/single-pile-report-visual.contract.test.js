const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsDir = __dirname;
const visualPath = path.join(toolsDir, 'single-pile-report-visual.test.js');
const testSinglePilePath = path.join(toolsDir, 'test-single-pile.ps1');

function read(file) {
  assert.ok(fs.existsSync(file), `missing required file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} should include: ${needle}`);
}

const visual = read(visualPath);
const testSinglePile = read(testSinglePilePath);

[
  'default_code',
  'bh5_regulation',
  'optimistic_params_review',
].forEach(key => assertIncludes(visual, key, 'single pile report visual smoke case list'));

[
  'Single pile report visual smoke',
  'single-pile-report-visual.test.js',
  'node $visualTestFile',
].forEach(needle => assertIncludes(testSinglePile, needle, 'test-single-pile visual smoke wiring'));

[
  'process.env.SINGLE_PILE_REPORT_PORT || 0',
  'server.address().port',
  'singlePileAttachmentReadinessCard',
  'page attachment readiness card',
  'page attachment readiness boundary',
  'page attachment readiness priority',
  '人工複核 / 補充資料需求',
  '不列為 OK 結論',
  'report excludes page-only status',
  'assertArtifact(screenshotPath',
  'assertArtifact(pdfPath',
  'single-pile-report-visual-audit.json',
].forEach(needle => assertIncludes(visual, needle, 'single pile report visual smoke quality gate'));

console.log('single pile report visual contract OK');
