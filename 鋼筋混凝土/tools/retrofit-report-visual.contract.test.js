const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsDir = __dirname;
const visualPath = path.join(toolsDir, 'retrofit-report-visual.test.js');
const portableHtmlPath = path.join(toolsDir, 'report-portable-html-check.js');
const wrapperPath = path.join(toolsDir, 'test-retrofit-report.ps1');

function read(file) {
  assert.ok(fs.existsSync(file), `missing required file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} should include: ${needle}`);
}

const visual = read(visualPath);
const portableHtml = read(portableHtmlPath);
const wrapper = read(wrapperPath);

[
  'retrofit-report-visual.test.js',
  'node $visualTestFile',
  'RC retrofit report visual smoke failed',
].forEach(needle => assertIncludes(wrapper, needle, 'RC retrofit report wrapper'));

[
  "require('./report-portable-html-check')",
  "await assertPortableFormalHtml(report, 'RC retrofit beam report', assert)",
  "await assertPortableFormalHtml(blockedReport, 'RC retrofit NG column report', assert)",
  'RC retrofit NG calculation can be explicitly approved as a truthful formal attachment',
  'RC retrofit blank project metadata remains printable for internal review',
  'assertReportScreenshotQuality(screenshotPath',
  'assertReportPdfTextQuality(pdfPath',
  'rendered-delivery-evidence-summary.json',
  'portableHtml: portableBeamHtml',
  'portableBeamApprovedHtml',
  "key: 'rc-retrofit-ng-column-formal-html'",
  'htmlArtifact: portableBlockedHtml.downloadedFileName',
  'portableBlockedApprovedHtml',
].forEach(needle => assertIncludes(visual, needle, 'RC retrofit report visual gate'));

[
  'repDownloadCurrentHtml',
  'downloadedFileName',
  'attachment checker reads one static formal state line',
  'saved HTML excludes transient controls',
].forEach(needle => assertIncludes(portableHtml, needle, 'RC portable formal HTML gate'));

console.log('RC retrofit report visual contract OK');
