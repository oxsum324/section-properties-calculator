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
    'deckingAttachmentApproved': { checked: false, dataset: {} },
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
    functionSource(source, 'buildDeckingCalculationFingerprint'),
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
const directPrintBoundaryCss = fs.readFileSync(path.join(__dirname, '結構工具箱', 'core', 'direct-print-boundary.css'), 'utf8');
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
  '覆工板工具主頁列印已封鎖',
  '此頁是操作介面，不是計算書',
  '暫不列印：請先填寫',
];

assert(!html.includes('alert('), 'decking tool uses inline feedback', '覆工板/index.html');
assert(!html.includes('confirm('), 'decking tool uses inline confirmations', '覆工板/index.html');
assert(html.includes('id="actionStatus"'), 'decking tool action status exists', 'actionStatus');
assert(html.includes('function setActionStatus'), 'decking tool action status helper exists', 'setActionStatus');
assert(html.includes('function confirmResetAll'), 'decking reset confirmation helper exists', 'confirmResetAll');
assert(html.includes('function cancelResetAll'), 'decking reset cancellation helper exists', 'cancelResetAll');
assert(html.includes('href="../結構工具箱/core/direct-print-boundary.css"'), 'decking loads shared direct-print boundary', 'direct-print-boundary.css');
assert(html.includes('<body class="formal-tool-output-page">'), 'decking uses governed work-page body class', 'formal-tool-output-page');
assert(html.includes('class="formal-direct-print-boundary"'), 'decking exposes direct-print boundary', 'formal-direct-print-boundary');
['覆工板工具主頁列印已封鎖', '此頁是操作介面，不是計算書', '本頁不得作為附件'].forEach((needle) => {
  assert(html.includes(needle), 'decking direct-print boundary explains blocked work-page print', needle);
});
assert(directPrintBoundaryCss.includes('body.formal-tool-output-page > :not(.formal-direct-print-boundary)'), 'shared boundary hides decking work-page children', 'formal direct-print selector');
assert(!html.includes('onclick="window.print()"'), 'decking removes direct work-page print action', 'no direct window.print button');
assert(html.includes('onclick="printDeckingReport()"'), 'decking uses dedicated report print action', 'printDeckingReport');
const printDeckingReportSource = functionSource(html, 'printDeckingReport');
assert(printDeckingReportSource.includes("recalcAll();"), 'decking report print recalculates current state', 'recalcAll');
assert(printDeckingReportSource.includes('button[data-tab="report"]'), 'decking report print activates report tab', 'report tab');
assert(!printDeckingReportSource.includes('暫不列印：請先填寫'), 'decking report print does not block blank optional project metadata', 'optional metadata');
assert(html.includes('本計算內容已完成審閱，核可作為正式附件'), 'decking report exposes explicit approval checkbox', 'approval control');
assert(printDeckingReportSource.includes("classList.add('decking-report-print-mode')"), 'decking report print arms dedicated print mode', 'decking-report-print-mode add');
assert(printDeckingReportSource.includes('window.print();'), 'decking dedicated report path invokes browser print', 'window.print');
assert(printDeckingReportSource.includes("classList.remove('decking-report-print-mode')"), 'decking report print always clears dedicated mode', 'decking-report-print-mode remove');
assert(/body\.formal-tool-output-page\.decking-report-print-mode\s*>\s*main\s*\{[\s\S]*display:\s*block\s*!important/.test(html), 'decking dedicated print mode reveals report container', 'main print override');
assert(/section#tab-report\s*\{[\s\S]*display:\s*block\s*!important/.test(html), 'decking dedicated print mode reveals only report tab', 'tab-report print override');
assertPrintHidesSelectors(html, ['.decking-report-page-only'], 'decking report workflow guidance');
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
