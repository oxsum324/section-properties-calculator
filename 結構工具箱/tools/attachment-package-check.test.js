const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Checker = require('./attachment-package-check.js');

const extracted = Checker.extractTextMetadata(`
計畫名稱：測試大樓
計畫編號：PKG-001
設計人員：Codex QA
產出工具：RC 梁設計／檢核
工具版本：V3.1
輸出時間：2026/07/12 13:00:00
計算指紋：CF-1234ABCD5678EF90
`);
assert.equal(extracted.projectName, '測試大樓');
assert.equal(extracted.projectNo, 'PKG-001');
assert.equal(extracted.sourceTool, 'RC 梁設計／檢核');
assert.equal(extracted.toolVersion, 'V3.1');
assert.deepEqual(extracted.fingerprints, ['CF-1234ABCD5678EF90']);
const htmlExtracted = Checker.extractTextMetadata('<div><b>計畫名稱</b>測試大樓</div><div><b>計畫編號</b>PKG-001</div><div><b>工具版本</b>V3.1</div><div><b>計算指紋</b>CF-1234ABCD5678EF90</div>');
assert.equal(htmlExtracted.projectName, '測試大樓');
assert.equal(htmlExtracted.projectNo, 'PKG-001');
assert.equal(htmlExtracted.toolVersion, 'V3.1');
assert.equal(Checker.extractTextMetadata('設計人員 Codex QA 製表日期 2026/07/12 計算書模式 詳算式').designer, 'Codex QA');

const readyReport = Checker.analyzePackage([
  { file: 'beam.pdf', errors: [], pageOnlyNeedles: [], projectName: '測試大樓', projectNo: 'PKG-001', designer: 'Codex QA', sourceTool: 'RC 梁', toolVersion: 'V3.1', fingerprints: ['CF-1234ABCD5678EF90'] },
], { projectNo: 'PKG-001' });
assert.equal(readyReport.status, 'ready');

const conflictReport = Checker.analyzePackage([
  { file: 'beam.pdf', errors: [], pageOnlyNeedles: [], projectName: '測試大樓', projectNo: 'PKG-001', designer: 'Codex QA', sourceTool: 'RC 梁', toolVersion: 'V3.1', fingerprints: ['CF-1234ABCD5678EF90'] },
  { file: 'column.pdf', errors: [], pageOnlyNeedles: [], projectName: '其他大樓', projectNo: 'PKG-002', designer: 'Codex QA', sourceTool: 'RC 柱', toolVersion: 'V3.1', fingerprints: ['CF-AAAA0000BBBB1111'] },
]);
assert.equal(conflictReport.status, 'blocked');
assert(conflictReport.issues.some(issue => issue.code === 'projectNo-conflict'));
assert(conflictReport.issues.some(issue => issue.code === 'projectName-conflict'));

const pageOnlyReport = Checker.analyzePackage([
  { file: 'unsafe.pdf', errors: [], pageOnlyNeedles: ['優先閱讀'], projectName: '測試大樓', projectNo: 'PKG-001', designer: '', sourceTool: '', toolVersion: '', fingerprints: [] },
]);
assert.equal(pageOnlyReport.status, 'blocked');
assert(pageOnlyReport.issues.some(issue => issue.code === 'page-only-leak'));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-package-check-'));
try {
  fs.writeFileSync(path.join(tempDir, 'wind.json'), JSON.stringify({
    schema: 'tool-project-storage.v1',
    tool: { id: 'wind-force', name: '矩形建物 MWFRS', version: 'V1' },
    fields: { projName: { value: '測試大樓' }, projNo: { value: 'PKG-001' }, projDesigner: { value: 'Codex QA' } },
    calculationFingerprint: 'CF-1234ABCD5678EF90',
  }), 'utf8');
  const scanned = Checker.checkPackage(tempDir, { projectNo: 'PKG-001' });
  assert.equal(scanned.attachments.length, 1);
  assert.equal(scanned.attachments[0].projectNo, 'PKG-001');
  assert.equal(scanned.attachments[0].toolVersion, 'V1');
  assert.equal(scanned.status, 'ready');
  const cli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-check.js'), '--input', tempDir, '--project-no', 'PKG-001'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.match(cli.stdout, /附件組包一致性檢查：可整理/);

  const fixtureDir = path.join(tempDir, 'fixture');
  fs.mkdirSync(path.join(fixtureDir, 'word'), { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, 'xl', 'worksheets'), { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, 'word', 'document.xml'), '<w:document><w:p><w:t>計畫名稱：測試大樓</w:t></w:p><w:p><w:t>計畫編號：PKG-001</w:t></w:p></w:document>', 'utf8');
  fs.writeFileSync(path.join(fixtureDir, 'xl', 'sharedStrings.xml'), '<sst><si><t>計畫名稱</t></si><si><t>測試大樓</t></si><si><t>計畫編號</t></si><si><t>PKG-001</t></si></sst>', 'utf8');
  fs.writeFileSync(path.join(fixtureDir, 'xl', 'worksheets', 'sheet1.xml'), '<worksheet><sheetData><row><c><v>0</v></c></row></sheetData></worksheet>', 'utf8');
  for (const [archive, source] of [['sample.docx', 'word'], ['sample.xlsx', 'xl']]) {
    const result = spawnSync('tar', ['-a', '-cf', path.join(tempDir, archive), '-C', fixtureDir, source], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${archive} fixture archive`);
  }
  const docxRecord = Checker.inspectAttachment(path.join(tempDir, 'sample.docx'), tempDir);
  const xlsxRecord = Checker.inspectAttachment(path.join(tempDir, 'sample.xlsx'), tempDir);
  assert.deepEqual(docxRecord.errors, []);
  assert.equal(docxRecord.projectNo, 'PKG-001');
  assert.deepEqual(xlsxRecord.errors, []);
  assert.equal(xlsxRecord.projectNo, 'PKG-001');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

assert.deepEqual(Checker.parseArgs(['--input', 'C:/case', '--project-no', 'PKG-001']), { input: 'C:/case', projectNo: 'PKG-001' });
assert.match(Checker.formatSummary(readyReport), /僅供交付前整理/);

console.log('attachment package check OK');
