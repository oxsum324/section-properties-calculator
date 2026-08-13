'use strict';

const assert = require('assert');
const Verifier = require('./xlsx-seal-verifier');

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fixture({ status = '正式附件', result = 12.5, contentSha = '', approvalSha = '', includeSeals = true } = {}) {
  const strings = [
    '項目', '值', '文件狀態', status, '內部審閱', '核可資訊', '核可時間：2026/08/13 09:00:00',
    '產出工具', '錨栓檢討工具', '工具版本', 'v1', '輸出時間', '2026/08/13 08:55:00',
    '計算指紋', 'CF-1234ABCD5678EF90', '控制DCR',
    Verifier.LABELS.contentScope, Verifier.CONTENT_SCOPE, Verifier.LABELS.contentSha256, contentSha,
    Verifier.LABELS.approvalScope, Verifier.APPROVAL_SCOPE, Verifier.LABELS.approvalSha256, approvalSha,
    Verifier.LABELS.note, 'SHA-256 防竄改證據，非核可人身分之數位簽章', '檢核模式', 'DCR',
  ];
  const index = value => strings.indexOf(value);
  const row = (number, label, value, numeric = false) => `<row r="${number}"><c r="A${number}" t="s"><v>${index(label)}</v></c><c r="B${number}"${numeric ? '' : ' t="s"'}><v>${numeric ? value : index(value)}</v></c></row>`;
  const summaryRows = [
    row(1, '項目', '值'), row(2, '文件狀態', status), row(3, '核可資訊', '核可時間：2026/08/13 09:00:00'),
    row(4, '產出工具', '錨栓檢討工具'), row(5, '工具版本', 'v1'), row(6, '輸出時間', '2026/08/13 08:55:00'),
    row(7, '計算指紋', 'CF-1234ABCD5678EF90'), row(8, '控制DCR', 0.75, true),
  ];
  if (includeSeals) summaryRows.push(
    row(9, Verifier.LABELS.contentScope, Verifier.CONTENT_SCOPE), row(10, Verifier.LABELS.contentSha256, contentSha),
    row(11, Verifier.LABELS.approvalScope, Verifier.APPROVAL_SCOPE), row(12, Verifier.LABELS.approvalSha256, approvalSha),
    row(13, Verifier.LABELS.note, 'SHA-256 防竄改證據，非核可人身分之數位簽章'),
  );
  return new Map([
    ['xl/sharedStrings.xml', Buffer.from(`<sst>${strings.map(value => `<si><t>${xmlEscape(value)}</t></si>`).join('')}</sst>`)],
    ['xl/workbook.xml', Buffer.from('<workbook xmlns:r="r"><sheets><sheet name="Summary" r:id="rId1"/><sheet name="Results" r:id="rId2"/></sheets></workbook>')],
    ['xl/_rels/workbook.xml.rels', Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>')],
    ['xl/worksheets/sheet1.xml', Buffer.from(`<worksheet><sheetData>${summaryRows.join('')}</sheetData></worksheet>`)],
    ['xl/worksheets/sheet2.xml', Buffer.from(`<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>${index('檢核模式')}</v></c><c r="B1" t="s"><v>${index('DCR')}</v></c></row><row r="2"><c r="A2" t="s"><v>${index('控制DCR')}</v></c><c r="B2"><f>IFERROR(10/8,&quot;&quot;)</f><v>${result}</v></c></row></sheetData></worksheet>`)],
  ]);
}

function sealedFixture(options = {}) {
  const base = fixture({ ...options, contentSha: '0'.repeat(64), approvalSha: '0'.repeat(64) });
  const parsed = Verifier.parsedWorkbook(base);
  const contentSha = Verifier.sha256Text(Verifier.canonicalContent(parsed));
  const fields = new Map(parsed.find(sheet => sheet.name === 'Summary').rows.map(row => {
    const values = row.cells.map(cell => String(cell.value ?? ''));
    return [values[0] || '', values[1] || ''];
  }));
  const approvalSha = Verifier.sha256Text(Verifier.canonicalApproval(fields, contentSha));
  return fixture({ ...options, contentSha, approvalSha });
}

const clean = Verifier.verifyAnchorXlsxSeals(sealedFixture());
assert.equal(clean.content.status, 'verified');
assert.equal(clean.approval.status, 'verified');

const contentTampered = Verifier.verifyAnchorXlsxSeals(sealedFixture({ result: 13.5 }));
assert.equal(contentTampered.content.status, 'verified', 'fixture seals its own changed content');
const changedAfterSeal = sealedFixture();
changedAfterSeal.set('xl/worksheets/sheet2.xml', Buffer.from(changedAfterSeal.get('xl/worksheets/sheet2.xml').toString('utf8').replace('<v>12.5</v>', '<v>13.5</v>')));
const changedContent = Verifier.verifyAnchorXlsxSeals(changedAfterSeal);
assert.equal(changedContent.content.status, 'failed');
assert.equal(changedContent.approval.status, 'verified');

const resealedContentEntries = new Map(changedAfterSeal);
const resealedParsed = Verifier.parsedWorkbook(resealedContentEntries);
const forgedContentSha = Verifier.sha256Text(Verifier.canonicalContent(resealedParsed));
const resealedSummary = resealedContentEntries.get('xl/worksheets/sheet1.xml').toString('utf8');
const resealedStrings = Verifier.parseSharedStrings(resealedContentEntries.get('xl/sharedStrings.xml').toString('utf8'));
const oldContentSha = clean.content.expectedSha256;
const oldContentIndex = resealedStrings.indexOf(oldContentSha);
assert.ok(oldContentIndex >= 0);
resealedContentEntries.set(
  'xl/sharedStrings.xml',
  Buffer.from(resealedContentEntries.get('xl/sharedStrings.xml').toString('utf8').replace(`<si><t>${oldContentSha}</t></si>`, `<si><t>${forgedContentSha}</t></si>`)),
);
assert.ok(resealedSummary.includes(`<v>${oldContentIndex}</v>`));
const resealedContent = Verifier.verifyAnchorXlsxSeals(resealedContentEntries);
assert.equal(resealedContent.content.status, 'verified');
assert.equal(resealedContent.approval.status, 'failed');

const changedApprovalEntries = sealedFixture();
const summaryXml = changedApprovalEntries.get('xl/worksheets/sheet1.xml').toString('utf8');
const stringsXml = changedApprovalEntries.get('xl/sharedStrings.xml').toString('utf8');
const statusIndex = [...stringsXml.matchAll(/<si><t>([\s\S]*?)<\/t><\/si>/g)].findIndex(item => item[1] === '正式附件');
const reviewIndex = [...stringsXml.matchAll(/<si><t>([\s\S]*?)<\/t><\/si>/g)].findIndex(item => item[1] === '內部審閱');
assert.ok(statusIndex >= 0 && reviewIndex >= 0);
changedApprovalEntries.set('xl/worksheets/sheet1.xml', Buffer.from(summaryXml.replace(`<c r="B2" t="s"><v>${statusIndex}</v></c>`, `<c r="B2" t="s"><v>${reviewIndex}</v></c>`)));
const changedApproval = Verifier.verifyAnchorXlsxSeals(changedApprovalEntries);
assert.equal(changedApproval.content.status, 'verified');
assert.equal(changedApproval.approval.status, 'failed');

const missing = Verifier.verifyAnchorXlsxSeals(fixture({ includeSeals: false }));
assert.equal(missing.content.status, 'missing');
assert.equal(missing.approval.status, 'missing');

console.log('XLSX dual seal verifier contract OK (content/approval tamper separated, legacy missing detected)');
