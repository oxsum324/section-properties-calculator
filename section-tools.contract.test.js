const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf8');
}

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

function functionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert(start >= 0, `${functionName} exists`, functionName);
  const next = source.indexOf('\nfunction ', start + 1);
  return next >= 0 ? source.slice(start, next) : source.slice(start);
}

function assertReportPayloadExcludes(source, functionName, needles) {
  const body = functionSource(source, functionName);
  const reportStart = body.indexOf('openReport({');
  assert(reportStart >= 0, `${functionName} calls openReport`, 'openReport');
  const payload = body.slice(reportStart);
  for (const needle of needles) {
    assert(!payload.includes(needle), `${functionName} keeps page-only status out of report payload`, needle);
  }
}

const pageOnlyReportStatusNeedles = [
  '產報前檢查',
  '優先閱讀',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
];

const tools = [
  {
    label: 'section property picker',
    path: 'index.html',
    needles: ['id="exportStatus"', 'function setStatus', 'sendIxToOpener()'],
  },
  {
    label: 'section property standalone',
    path: '斷面性質計算.html',
    needles: ['id="exportStatus"', 'function setStatus'],
  },
  {
    label: 'composite section report',
    path: '合成斷面性質.html',
    needles: ['id="reportStatus"', 'id="reportReadiness"', 'function compositeReportReadinessModel', 'page-only-report-status'],
  },
  {
    label: 'RC retrofit section reports',
    path: 'RC補強斷面性質.html',
    needles: ['id="b-report-status"', 'id="c-report-status"', 'id="b-report-readiness"', 'id="c-report-readiness"', 'function renderReportReadiness', 'page-only-report-status'],
  },
];

for (const tool of tools) {
  const html = read(tool.path);
  assert(!html.includes('alert('), `${tool.label} uses inline feedback`, tool.path);
  for (const needle of tool.needles) {
    assert(html.includes(needle), `${tool.label} keeps feedback contract`, needle);
  }
}

const compositeHtml = read('合成斷面性質.html');
assertReportPayloadExcludes(compositeHtml, 'exportReport', pageOnlyReportStatusNeedles);

const rcRetrofitHtml = read('RC補強斷面性質.html');
assertReportPayloadExcludes(rcRetrofitHtml, 'exportBeamReport', pageOnlyReportStatusNeedles);
assertReportPayloadExcludes(rcRetrofitHtml, 'exportColReport', pageOnlyReportStatusNeedles);

console.log('\nAll section tools contract checks passed.');
