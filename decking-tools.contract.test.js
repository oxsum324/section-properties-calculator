const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertPrintHidesSelectors(text, selectors, label) {
  selectors.forEach(selector => {
    const pattern = new RegExp(`@media\\s+print[\\s\\S]*${escapeRegex(selector)}[\\s\\S]*display:\\s*none\\s*!important`);
    assert(pattern.test(text), `${label} print hides ${selector}`, selector);
  });
}

function functionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert(start >= 0, `${functionName} exists`, functionName);
  const next = source.indexOf('\nfunction ', start + 1);
  return next >= 0 ? source.slice(start, next) : source.slice(start);
}

function renderDeckingReportRuntime(source, fixture, filename) {
  const elements = {
    'proj_name': { value: fixture.project?.name || '' },
    'proj_no': { value: fixture.project?.no || '' },
    'proj_date': { value: fixture.project?.date || '' },
    'report-readiness': { innerHTML: '', className: '' },
    'report-output': { innerHTML: '' },
  };
  const context = {
    console,
    Date,
    Math,
    RESULTS: JSON.parse(JSON.stringify(fixture.results || {})),
    G: () => ({ ...(fixture.global || {}) }),
    fmt: (v, d = 3) => (typeof v === 'number' && isFinite(v)) ? v.toFixed(d) : '—',
    textOrBlank: (v) => String(v || '').trim(),
    document: {
      getElementById(id) {
        if (!elements[id]) {
          elements[id] = { value: '', innerHTML: '', className: '' };
        }
        return elements[id];
      },
    },
  };
  const runtimeSource = [
    functionSource(source, 'resultFailures'),
    functionSource(source, 'reportReadinessModel'),
    functionSource(source, 'renderReportReadiness'),
    functionSource(source, 'buildReport'),
  ].join('\n');
  vm.createContext(context);
  vm.runInContext(runtimeSource, context, { filename });
  assert(typeof context.buildReport === 'function', 'decking runtime exposes buildReport', 'buildReport');
  context.buildReport();
  return {
    readinessClassName: elements['report-readiness'].className,
    readinessHtml: elements['report-readiness'].innerHTML,
    reportHtml: elements['report-output'].innerHTML,
  };
}

const htmlPath = path.join(__dirname, '覆工板', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const reportSmokeFixture = JSON.parse(fs.readFileSync(path.join(__dirname, '覆工板', 'test-fixtures', 'report-smoke.json'), 'utf8'));
const buildReportSource = functionSource(html, 'buildReport');
const reportHtmlStart = buildReportSource.indexOf('const html = `');
const reportHtmlSource = reportHtmlStart >= 0 ? buildReportSource.slice(reportHtmlStart) : '';
const pageOnlyReportStatusNeedles = [
  '產報前檢查',
  '優先閱讀',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '報告閱讀狀態',
  '優先建議報告閱讀狀態',
  '附件適用狀態',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
  '輸出邊界',
  '頁面顯示，不進計算書、列印或 PDF',
];

assert(!html.includes('alert('), 'decking tool uses inline feedback', '覆工板/index.html');
assert(!html.includes('confirm('), 'decking tool uses inline confirmations', '覆工板/index.html');
assert(html.includes('id="actionStatus"'), 'decking tool action status exists', 'actionStatus');
assert(html.includes('function setActionStatus'), 'decking tool action status helper exists', 'setActionStatus');
assert(html.includes('function confirmResetAll'), 'decking reset confirmation helper exists', 'confirmResetAll');
assert(html.includes('function cancelResetAll'), 'decking reset cancellation helper exists', 'cancelResetAll');
assert(html.includes('setActionStatus(`已套用'), 'decking preset feedback is inline', 'applyPreset');
assert(html.includes('setActionStatus(`已下載'), 'decking export feedback is inline', 'exportJSON');
assert(html.includes('id="report-readiness"'), 'decking readiness outlet exists', 'report-readiness');
assert(html.includes('page-only-report-status'), 'decking readiness uses page-only boundary class', 'page-only-report-status');
assert(html.includes('function reportReadinessModel'), 'decking readiness model exists', 'reportReadinessModel');
assert(html.includes('function renderReportReadiness'), 'decking readiness renderer exists', 'renderReportReadiness');
assertPrintHidesSelectors(
  html,
  ['.page-only-report-status'],
  'decking page-only report readiness'
);
for (const needle of pageOnlyReportStatusNeedles) {
  assert(!reportHtmlSource.includes(needle), 'decking report excludes page-only readiness wording', needle);
}

const runtimeReport = renderDeckingReportRuntime(html, reportSmokeFixture, htmlPath);
assert(runtimeReport.readinessClassName.includes('page-only-report-status'), 'decking runtime readiness keeps page-only boundary class', runtimeReport.readinessClassName);
[
  '產報前檢查',
  '優先閱讀',
  '頁面輔助',
  '暫勿作附件',
  '頁面顯示，不進計算書、列印或 PDF',
  '不會寫入計算書或列印 PDF',
].forEach((needle) => {
  assert(runtimeReport.readinessHtml.includes(needle), 'decking runtime readiness renders page-only status text', needle);
});
assert(runtimeReport.reportHtml.includes('覆工板系統結構計算書'), 'decking runtime report title', '覆工板系統結構計算書');
assert(runtimeReport.reportHtml.includes('部分項目不通過（NG）'), 'decking runtime report uses live result state', '部分項目不通過（NG）');
assert(runtimeReport.reportHtml.includes(reportSmokeFixture.project.name), 'decking runtime report project name', reportSmokeFixture.project.name);
assert(runtimeReport.reportHtml.includes(reportSmokeFixture.project.no), 'decking runtime report project no', reportSmokeFixture.project.no);
assert(runtimeReport.reportHtml.includes(reportSmokeFixture.project.date), 'decking runtime report project date', reportSmokeFixture.project.date);
for (const needle of pageOnlyReportStatusNeedles) {
  assert(!runtimeReport.reportHtml.includes(needle), 'decking runtime report excludes page-only readiness wording', needle);
}

console.log('\nAll decking tool contract checks passed.');
