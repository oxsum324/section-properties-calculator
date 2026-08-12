'use strict';

const assert = require('assert');
const { inspectXlsxPackage, normalizePartName, relationshipOwnerPart } = require('./xlsx-package-integrity');

function bufferMap(entries) {
  return new Map(Object.entries(entries).map(([name, value]) => [name, Buffer.from(value)]));
}

const contentTypes = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';
const rootRels = '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
const workbookRels = '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
const clean = bufferMap({
  '[Content_Types].xml': contentTypes,
  '_rels/.rels': rootRels,
  'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Results" sheetId="1" state="visible" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': workbookRels,
  'xl/styles.xml': '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="0.000"/></numFmts></styleSheet>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1"><v>12.5</v></c><c r="B1"><f>IFERROR(A1/100,&quot;&quot;)</f><v>0.125</v></c></row></sheetData></worksheet>',
});
const cleanResult = inspectXlsxPackage(clean, { label: 'clean fixture' });
assert.equal(cleanResult.pass, true);
assert.equal(cleanResult.sheetCount, 1);
assert.equal(cleanResult.visibleSheetCount, 1);
assert.equal(cleanResult.formulaCount, 1);
assert.equal(cleanResult.cachedFormulaCount, 1);

const contaminated = new Map(clean);
contaminated.set('xl/workbook.xml', Buffer.from('<workbook xmlns:r="r"><bookViews><workbookView visibility="hidden"/></bookViews><sheets><sheet name="Results" sheetId="1" state="veryHidden" r:id="rId1"/></sheets><definedNames><definedName name="secret" hidden="1">[legacy.xlsx]Sheet1!A1</definedName></definedNames></workbook>'));
contaminated.set('xl/worksheets/sheet1.xml', Buffer.from('<worksheet><cols><col min="1" max="1" hidden="1"/></cols><sheetData><row r="1" hidden="1"><c r="A1" t="e"><v>#REF!</v></c><c r="B1"><f>[legacy.xlsx]Sheet1!A1</f></c><c r="C1"><f>WEBSERVICE(&quot;https://example.com&quot;)</f><v>1</v></c></row></sheetData></worksheet>'));
contaminated.set('xl/worksheets/sheet9.xml', Buffer.from('<worksheet/>'));
contaminated.set('xl/externalLinks/externalLink1.xml', Buffer.from('<externalLink/>'));
contaminated.set('xl/comments1.xml', Buffer.from('<comments><commentList><comment ref="A1"/></commentList></comments>'));
contaminated.set('xl/persons/person.xml', Buffer.from('<personList/>'));
contaminated.set('xl/vbaProject.bin', Buffer.from('macro'));
contaminated.set('customXml/item1.xml', Buffer.from('<case>legacy</case>'));
contaminated.set('xl/media/orphan.png', Buffer.from('png'));
contaminated.set('xl/styles.xml', Buffer.from('<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode=";;;"/></numFmts></styleSheet>'));
contaminated.set('xl/_rels/workbook.xml.rels', Buffer.from(`${workbookRels.slice(0, -16)}<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink" Target="https://example.com/book.xlsx" TargetMode="External"/></Relationships>`));
const contaminatedResult = inspectXlsxPackage(contaminated, { label: 'contaminated fixture' });
assert.equal(contaminatedResult.pass, false);
for (const code of [
  'external-relationship',
  'hidden-sheet',
  'hidden-workbook-window',
  'hidden-defined-name',
  'hidden-row',
  'hidden-column',
  'formula-error-cell',
  'formula-without-cached-result',
  'external-formula-reference',
  'network-capable-formula',
  'unreferenced-worksheet',
  'external-or-active-content',
  'comment-content',
  'hidden-number-format',
  'unreferenced-sensitive-part',
]) {
  assert.ok(contaminatedResult.issues.some(item => item.code === code), `detects ${code}`);
}

const missingTarget = new Map(clean);
missingTarget.set('xl/_rels/workbook.xml.rels', Buffer.from('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'));
const missingTargetResult = inspectXlsxPackage(missingTarget, { label: 'missing target fixture' });
assert.ok(missingTargetResult.issues.some(item => item.code === 'missing-relationship-target'));

assert.equal(normalizePartName('xl/worksheets/../styles.xml'), 'xl/styles.xml');
assert.equal(relationshipOwnerPart('xl/_rels/workbook.xml.rels'), 'xl/workbook.xml');
assert.equal(relationshipOwnerPart('_rels/.rels'), '');

console.log('XLSX package integrity contract OK (clean formulas accepted, hidden/external/active contamination rejected)');
