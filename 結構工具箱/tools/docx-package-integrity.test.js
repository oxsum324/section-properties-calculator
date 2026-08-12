'use strict';

const assert = require('assert');
const { inspectDocxPackage, normalizePartName, relationshipOwnerPart } = require('./docx-package-integrity');

function bufferMap(entries) {
  return new Map(Object.entries(entries).map(([name, value]) => [name, Buffer.from(value)]));
}

const rootRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const contentTypes = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';
const clean = bufferMap({
  '[Content_Types].xml': contentTypes,
  '_rels/.rels': rootRels,
  'word/document.xml': '<w:document xmlns:w="w" xmlns:r="r"><w:body><w:p><w:r><w:t>正式計算內容</w:t></w:r></w:p><w:sectPr><w:footerReference r:id="rIdFooter"/></w:sectPr><w:drawing><a:blip r:embed="rIdImage"/></w:drawing></w:body></w:document>',
  'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/><Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/></Relationships>',
  'word/footer1.xml': '<w:ftr xmlns:w="w"><w:p><w:r><w:t>文件狀態：正式附件</w:t></w:r></w:p></w:ftr>',
  'word/media/image1.png': 'png',
  'word/comments.xml': '<w:comments xmlns:w="w"/>',
  'customXml/item1.xml': '<b:Sources xmlns:b="http://schemas.openxmlformats.org/officeDocument/2006/bibliography"/>',
});
const cleanResult = inspectDocxPackage(clean, { label: 'clean fixture' });
assert.equal(cleanResult.pass, true);
assert.equal(cleanResult.mediaCount, 1);
assert.equal(cleanResult.referencedMediaCount, 1);
assert.equal(cleanResult.footerCount, 1);
assert.equal(cleanResult.referencedFooterCount, 1);

const contaminated = new Map(clean);
contaminated.set('word/media/legacy.png', Buffer.from('legacy'));
contaminated.set('word/header9.xml', Buffer.from('<w:hdr xmlns:w="w"><w:p><w:t>舊案名稱</w:t></w:p></w:hdr>'));
contaminated.set('word/document.xml', Buffer.from('<w:document xmlns:w="w" xmlns:r="r"><w:body><w:ins><w:r><w:t>未接受修訂</w:t></w:r></w:ins><w:commentRangeStart w:id="0"/></w:body></w:document>'));
contaminated.set('word/comments.xml', Buffer.from('<w:comments xmlns:w="w"><w:comment w:id="0"><w:p><w:r><w:t>內部意見</w:t></w:r></w:p></w:comment></w:comments>'));
contaminated.set('word/embeddings/oleObject1.bin', Buffer.from('ole'));
contaminated.set('customXml/item2.xml', Buffer.from('<case><project>舊案</project></case>'));
contaminated.set('word/_rels/document.xml.rels', Buffer.from('<Relationships><Relationship Id="rIdTemplate" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="file:///legacy.dotx" TargetMode="External"/></Relationships>'));
const contaminatedResult = inspectDocxPackage(contaminated, { label: 'contaminated fixture' });
assert.equal(contaminatedResult.pass, false);
for (const code of ['unreferenced-sensitive-part', 'tracked-revision', 'comment-anchor', 'comment-content', 'embedded-active-content', 'unexpected-custom-xml', 'external-sensitive-relationship']) {
  assert.ok(contaminatedResult.issues.some(item => item.code === code), `detects ${code}`);
}

const missingTarget = new Map(clean);
missingTarget.set('word/_rels/document.xml.rels', Buffer.from('<Relationships><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/></Relationships>'));
const missingTargetResult = inspectDocxPackage(missingTarget, { label: 'missing target fixture' });
assert.ok(missingTargetResult.issues.some(item => item.code === 'missing-relationship-target'));

assert.equal(normalizePartName('word/../customXml/item1.xml'), 'customXml/item1.xml');
assert.equal(relationshipOwnerPart('word/_rels/document.xml.rels'), 'word/document.xml');
assert.equal(relationshipOwnerPart('_rels/.rels'), '');

console.log('DOCX package integrity contract OK (clean accepted, hidden-package contamination rejected)');
