const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsDir = __dirname;
const visualPath = path.join(toolsDir, 'retrofit-report-visual.test.js');
const portableHtmlPath = path.join(toolsDir, 'report-portable-html-check.js');
const sharedReportPath = path.join(toolsDir, '..', 'shared', 'report.js');
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
const sharedReport = read(sharedReportPath);
const wrapper = read(wrapperPath);

[
  'retrofit-report-visual.test.js',
  'node $visualTestFile',
  'RC retrofit report visual smoke failed',
].forEach(needle => assertIncludes(wrapper, needle, 'RC retrofit report wrapper'));

[
  "require('./report-portable-html-check')",
  'RC retrofit NG calculation can be explicitly approved as a truthful formal attachment',
  'RC retrofit blank project metadata remains printable for internal review',
  'collectRetrofitProjectData()',
  "page.locator('#retrofitJsonFile').setInputFiles",
  'RC retrofit JSON download filename is traceable',
  'rejects unknown JSON schema',
  'rejects invalid JSON before changing current state',
  'assertReportScreenshotQuality(screenshotPath',
  'assertReportPdfTextQuality(pdfPath',
  'rendered-delivery-evidence-summary.json',
  'portableHtml: portableBeamHtml',
  'captureArtifactIntegrity',
  "'reportPdf'",
  "'reportScreenshot'",
  'artifactIntegrity',
  "assertPortableFormalHtml(report, 'RC retrofit beam report', assert, { outputDir })",
  "key: 'rc-retrofit-ng-column-formal-html'",
  'htmlArtifact: portableBlockedHtml.htmlArtifact',
  "assertPortableFormalHtml(blockedReport, 'RC retrofit NG column report', assert, { outputDir })",
].forEach(needle => assertIncludes(visual, needle, 'RC retrofit report visual gate'));

[
  'repDownloadCurrentHtml',
  'downloadedFileName',
  'attachment checker reads one static formal state line',
  'saved HTML excludes transient controls',
  'renderStandaloneFormalHtmlPdf',
  'standalone HTML keeps screen controls out of print media',
  'standalone HTML reopens without external network requests',
  "'standaloneFormalHtmlPrintPdf'",
  "contentBoundaryProfile: 'traceable-calculation-book'",
  'saved HTML carries an independently reproducible SHA-256 content seal',
  'changed calculation content invalidates the saved HTML seal',
  'standalone HTML independently verifies its SHA-256 content seal',
  'changed standalone HTML is visibly blocked on screen and in print',
].forEach(needle => assertIncludes(portableHtml, needle, 'RC portable formal HTML gate'));

[
  '.rep-steps-wrap > .rep-step:last-of-type',
  '.rep-summary { break-before:avoid-page',
  'page-break-after:avoid',
  'rc-calculation-book-content-v1',
  'sha256Fallback',
  'rep-content-integrity-alert',
  '非數位簽章',
].forEach(needle => assertIncludes(sharedReport, needle, 'RC formal report closing-page print boundary'));

console.log('RC retrofit report visual contract OK');
