'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = __dirname;
const sharedStylesheet = path.join(repoRoot, '結構工具箱', 'core', 'report-readiness.css');
const sharedStylesheetRelative = '結構工具箱/core/report-readiness.css';

const pages = [
  'RC補強斷面性質.html',
  '合成斷面性質.html',
  '連續梁分析.html',
  '覆工板/index.html',
  '鋼架/平面剛架分析.html',
  '結構工具箱/tools/earth/earth-pressure.html',
  '結構工具箱/tools/equipment/equipment-load.html',
  '結構工具箱/tools/foundation/foundation-local.html',
  '結構工具箱/tools/鋼構/steel-beam.html',
  '結構工具箱/tools/鋼構/steel-column.html',
  '結構工具箱/tools/地震力/seismic-appendage.html',
  '結構工具箱/tools/地震力/seismic-dynamic.html',
  '結構工具箱/tools/地震力/seismic-force.html',
  '結構工具箱/tools/地震力/seismic-misc.html',
  '結構工具箱/tools/風力/wind-cc.html',
  '結構工具箱/tools/風力/wind-fence-sign.html',
  '結構工具箱/tools/風力/wind-force.html',
  '結構工具箱/tools/風力/wind-kzt.html',
  '結構工具箱/tools/風力/wind-lattice-tower.html',
  '結構工具箱/tools/風力/wind-object-frame.html',
  '結構工具箱/tools/風力/wind-object-solid.html',
  '結構工具箱/tools/風力/wind-object-tower.html',
  '結構工具箱/tools/風力/wind-open-roof.html',
  '結構工具箱/tools/風力/wind-parapet.html',
  '結構工具箱/tools/風力/wind-sign-pole.html',
  '結構工具箱/tools/風力/wind-special.html',
];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8');
}

function inlineCss(html) {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map(match => match[1])
    .join('\n');
}

assert.equal(pages.length, 26, 'shared report-readiness inventory stays explicit at 26 migrated pages');
assert.ok(fs.existsSync(sharedStylesheet), 'shared report-readiness stylesheet exists');

const stylesheet = fs.readFileSync(sharedStylesheet, 'utf8');
[
  '.report-readiness {',
  '.report-readiness.ready {',
  '.report-readiness.review {',
  '.report-readiness.blocked {',
  '.report-readiness-head {',
  '.report-readiness-grid {',
  '.report-readiness-item > :first-child {',
  '.report-readiness-item > :last-child {',
  '.report-readiness-priority {',
  '.report-readiness-note {',
  '@media print',
  '.page-only-report-status {',
  'display: none !important;',
].forEach(needle => assert.ok(stylesheet.includes(needle), `shared stylesheet includes ${needle}`));
assert.equal(stylesheet.includes('color-mix('), false, 'shared stylesheet keeps compatibility without color-mix');
assert.equal(
  /\.report-readiness-item\s+(?:span|strong)\s*\{/.test(stylesheet),
  false,
  'shared readiness item roles are positional instead of element-name dependent'
);
assert.match(
  stylesheet,
  /@media\s+print\s*\{[\s\S]*?\.page-only-report-status\s*\{[\s\S]*?display:\s*none\s*!important;/,
  'shared stylesheet hides page-only readiness from print/export rendering'
);

const coreUiReport = read('結構工具箱/core/ui/report.js');
const localQuickExport = read('結構工具箱/tools/local-quick-export.js');
assert.ok(
  coreUiReport.includes('<span>${escapeReportHtml(item.label)}</span><strong>${escapeReportHtml(item.value)}</strong>'),
  'core report helper uses span-label then strong-value readiness items'
);
assert.ok(
  localQuickExport.includes('<strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span>'),
  'local quick helper uses strong-label then span-value readiness items'
);

for (const relativePath of pages) {
  const absolutePath = path.join(repoRoot, ...relativePath.split('/'));
  const html = fs.readFileSync(absolutePath, 'utf8');
  const expectedHref = path.relative(path.dirname(absolutePath), sharedStylesheet).replace(/\\/g, '/');
  const escapedHref = expectedHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stylesheetLink = new RegExp(`<link\\b(?=[^>]*\\brel=["']stylesheet["'])(?=[^>]*\\bhref=["']${escapedHref}["'])[^>]*>`, 'i');
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';

  assert.ok(head, `${relativePath} has a head element`);
  assert.match(head, stylesheetLink, `${relativePath} links the shared report-readiness stylesheet`);
  assert.ok(html.includes('page-only-report-status'), `${relativePath} keeps the page-only readiness boundary class`);
  assert.equal(
    inlineCss(html).includes('.report-readiness'),
    false,
    `${relativePath} does not duplicate report-readiness selectors in inline CSS`
  );
}

console.log(`report readiness shared stylesheet contract OK (${pages.length} pages; ${sharedStylesheetRelative})`);
