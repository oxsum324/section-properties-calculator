'use strict';

const assert = require('assert');
const { EXPECTED_RENDERER, EXPORT_KIND, verifyPrintMetadata } = require('./xlsx-print-visual');

const expectedSheets = [
  { name: 'Summary' },
  { name: 'Results' },
];
const clean = {
  kind: EXPORT_KIND,
  renderer: EXPECTED_RENDERER,
  sheetCount: 2,
  records: [
    {
      index: 1,
      sheet: 'Summary',
      usedRows: 20,
      usedColumns: 2,
      verticalPageBreakCount: 0,
      pageSetup: { paperSize: 9, orientation: 1, zoom: false, fitToPagesWide: 1, fitToPagesTall: 0, centerHorizontally: true, centerVertically: false, printArea: '$A$1:$B$20', printTitleRows: '$1:$1' },
    },
    {
      index: 2,
      sheet: 'Results',
      usedRows: 8,
      usedColumns: 12,
      verticalPageBreakCount: 0,
      pageSetup: { paperSize: 9, orientation: 2, zoom: false, fitToPagesWide: 1, fitToPagesTall: 0, centerHorizontally: true, centerVertically: false, printArea: '$A$1:$L$8', printTitleRows: '$1:$1' },
    },
  ],
};
assert.equal(verifyPrintMetadata(clean, expectedSheets).pass, true, 'clean A4 one-page-wide print metadata passes');

const contaminated = JSON.parse(JSON.stringify(clean));
contaminated.records[0].pageSetup.paperSize = 1;
contaminated.records[0].pageSetup.printTitleRows = '';
contaminated.records[1].pageSetup.orientation = 1;
contaminated.records[1].pageSetup.zoom = 100;
contaminated.records[1].pageSetup.fitToPagesTall = 1;
contaminated.records[1].verticalPageBreakCount = 1;
const result = verifyPrintMetadata(contaminated, expectedSheets);
assert.equal(result.pass, false, 'unsafe print metadata fails');
for (const code of ['not-a4', 'missing-repeat-header', 'orientation-mismatch', 'fit-mode-disabled', 'forced-one-page-tall', 'horizontal-overflow-pages']) {
  assert.ok(result.issues.some(issue => issue.code === code), `detects ${code}`);
}

console.log('XLSX print visual contract OK (A4/one-page-wide/repeated-header metadata enforced)');
