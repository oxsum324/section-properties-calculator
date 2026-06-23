const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf8');
}

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

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
    needles: ['id="reportStatus"', 'function setReportStatus'],
  },
  {
    label: 'RC retrofit section reports',
    path: 'RC補強斷面性質.html',
    needles: ['id="b-report-status"', 'id="c-report-status"', 'function setReportStatus'],
  },
];

for (const tool of tools) {
  const html = read(tool.path);
  assert(!html.includes('alert('), `${tool.label} uses inline feedback`, tool.path);
  for (const needle of tool.needles) {
    assert(html.includes(needle), `${tool.label} keeps feedback contract`, needle);
  }
}

console.log('\nAll section tools contract checks passed.');
