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
assert.equal(extracted.toolVersion, 'v3.1');
assert.deepEqual(extracted.fingerprints, ['CF-1234ABCD5678EF90']);
const htmlExtracted = Checker.extractTextMetadata('<div><b>計畫名稱</b>測試大樓</div><div><b>計畫編號</b>PKG-001</div><div><b>工具版本</b>V3.1</div><div><b>計算指紋</b>CF-1234ABCD5678EF90</div>');
assert.equal(htmlExtracted.projectName, '測試大樓');
assert.equal(htmlExtracted.projectNo, 'PKG-001');
assert.equal(htmlExtracted.toolVersion, 'v3.1');
assert.equal(Checker.extractTextMetadata('設計人員 Codex QA 製表日期 2026/07/12 計算書模式 詳算式').designer, 'Codex QA');
assert.equal(Checker.extractTextMetadata('產出工具：建築物耐風設計 — 開放式建 築屋面風壓 工具版本：v1').sourceTool, '建築物耐風設計 — 開放式建築屋面風壓');
assert.equal(
  Checker.extractTextMetadata('工具版本 f05d596 輸出時間 2026/07/17 08:00 目前工具版本 f05d596 版本狀態 與目前工具版本一致').toolVersion,
  'f05d596',
  'metadata extraction uses the first canonical field instead of a later explanatory version field',
);
assert.equal(Checker.normalizeToolVersion('4.0'), 'v4.0');
assert.equal(Checker.normalizeToolVersion('V4.0'), 'v4.0');
assert.equal(Checker.normalizeToolVersion('wind-force.v1'), 'v1');
assert.equal(Checker.normalizeToolVersion('114245f'), '114245f', 'Git commit hashes that start with a digit are not semantic versions');
const steelMemberSourceExtracted = Checker.extractJsonMetadata({
  schemaVersion: 1,
  kind: 'formal-calculation-source',
  savedAt: '2026-07-21T00:06:15.000Z',
  project: { name: '鋼構測試案', no: 'STEEL-001', designer: 'Codex QA' },
  tool: { id: 'steel-beam-formal', name: '鋼梁正式規範核算工具', version: 'v1.0' },
  calculationFingerprint: 'CF-ABCDEF0123456789',
});
assert.equal(steelMemberSourceExtracted.projectNo, 'STEEL-001');
assert.equal(steelMemberSourceExtracted.sourceTool, '鋼梁正式規範核算工具');
assert.equal(steelMemberSourceExtracted.toolVersion, 'v1.0');
assert.deepEqual(steelMemberSourceExtracted.fingerprints, ['CF-ABCDEF0123456789']);

const readyReport = Checker.analyzePackage([
  { file: 'beam.pdf', type: 'pdf', errors: [], pageOnlyNeedles: [], draftDocumentNeedles: [], readyDocumentNeedles: ['文件狀態：正式附件'], projectName: '測試大樓', projectNo: 'PKG-001', designer: 'Codex QA', sourceTool: 'RC 梁', toolVersion: 'V3.1', outputTime: '2026/07/12 13:00:00', fingerprints: ['CF-1234ABCD5678EF90'] },
], { projectNo: 'PKG-001' });
assert.equal(readyReport.status, 'ready');
assert.match(Checker.formatSummary(readyReport), /測試大樓｜PKG-001｜Codex QA/);
assert.deepEqual(Checker.detectReadyDocumentClass('<strong>文件狀態：正式附件</strong>'), ['文件狀態：正式附件']);
assert.deepEqual(Checker.detectReadyDocumentClass('<div>文件狀態</div><div>正式附件</div>'), ['文件狀態：正式附件']);
assert.equal(Checker.READY_DOCUMENT_CLASS_LABEL, '文件狀態：正式附件');

const sourceRecord = {
  file: 'beam.json', type: 'json', errors: [], pageOnlyNeedles: [], draftDocumentNeedles: [], readyDocumentNeedles: [],
  projectName: '測試大樓', projectNo: 'PKG-001', designer: '', sourceTool: 'RC 梁', toolVersion: 'V3.1',
  outputTime: '2026/07/12 12:59:00', fingerprints: ['CF-1234ABCD5678EF90'],
};
const reportRecord = {
  file: 'beam.pdf', type: 'pdf', errors: [], pageOnlyNeedles: [], draftDocumentNeedles: [], readyDocumentNeedles: ['文件狀態：正式附件'],
  projectName: '測試大樓', projectNo: 'PKG-001', designer: 'Codex QA', sourceTool: 'RC 梁', toolVersion: 'V3.1',
  outputTime: '2026/07/12 13:00:00', fingerprints: ['CF-1234ABCD5678EF90'],
};
const matchedSourceReport = Checker.analyzePackage([sourceRecord, reportRecord], { projectNo: 'PKG-001' });
assert.equal(matchedSourceReport.status, 'ready', 'one source JSON and one report with the same fingerprint form a valid traceability link');
assert.equal(matchedSourceReport.fingerprintLinks.length, 1);
assert.equal(matchedSourceReport.fingerprintLinks[0].sourceFile, 'beam.json');
assert.equal(matchedSourceReport.fingerprintLinks[0].reportFile, 'beam.pdf');
assert.equal(matchedSourceReport.issues.some(issue => issue.code.includes('duplicate')), false, 'source-to-report linkage is not a duplicate');
assert.match(Checker.formatSummary(matchedSourceReport), /已完成 1 組計算指紋配對/);

const mismatchedSourceReport = Checker.analyzePackage([
  sourceRecord,
  { ...reportRecord, fingerprints: ['CF-AAAA0000BBBB1111'] },
], { projectNo: 'PKG-001' });
assert.equal(mismatchedSourceReport.status, 'blocked', 'one-to-one source/report fingerprint mismatch blocks packaging');
assert.equal(mismatchedSourceReport.issues.find(issue => issue.code === 'source-report-fingerprint-mismatch')?.level, 'error');

const duplicateReports = Checker.analyzePackage([
  sourceRecord,
  reportRecord,
  { ...reportRecord, file: 'beam-copy.pdf' },
], { projectNo: 'PKG-001' });
assert.equal(duplicateReports.status, 'review', 'duplicate report outputs still require review');
assert.deepEqual(duplicateReports.issues.find(issue => issue.code === 'duplicate-report-fingerprint')?.files.sort(), ['beam-copy.pdf', 'beam.pdf']);

const unclassifiedReport = Checker.analyzePackage([
  { file: 'beam-unclassified.pdf', type: 'pdf', errors: [], pageOnlyNeedles: [], draftDocumentNeedles: [], readyDocumentNeedles: [], projectName: '測試大樓', projectNo: 'PKG-001', designer: 'Codex QA', sourceTool: 'RC 梁', toolVersion: 'V3.1', outputTime: '2026/07/12 13:00:00', fingerprints: ['CF-1234ABCD5678EF90'] },
], { projectNo: 'PKG-001' });
assert.equal(unclassifiedReport.status, 'review', 'unclassified formal report cannot be silently treated as ready');
assert(unclassifiedReport.issues.some(issue => issue.code === 'missing-document-class'));
assert.match(Checker.formatSummary(unclassifiedReport), /文件未分類/);

const missingReportIdentity = Checker.analyzePackage([
  { file: 'beam-missing-identity.pdf', type: 'pdf', errors: [], pageOnlyNeedles: [], draftDocumentNeedles: [], readyDocumentNeedles: ['文件狀態：正式附件'], projectName: '', projectNo: '', designer: '', sourceTool: 'RC 梁', toolVersion: 'V3.1', outputTime: '2026/07/12 13:00:00', fingerprints: ['CF-1234ABCD5678EF90'] },
], { projectNo: 'PKG-001' });
assert.equal(missingReportIdentity.status, 'ready', 'formal attachment may inherit blank case identity from its main report');
assert.equal(missingReportIdentity.issues.some(issue => issue.code === 'missing-report-identity'), false, 'blank optional attachment identity is not an issue');
assert.deepEqual(Checker.REPORT_IDENTITY_FIELDS.map(([, label]) => label), ['計畫名稱', '計畫編號', '設計人員']);

const incompleteTraceReport = Checker.analyzePackage([
  { file: 'legacy.pdf', errors: [], pageOnlyNeedles: [], projectName: '測試大樓', projectNo: 'PKG-001', designer: 'Codex QA', sourceTool: '', toolVersion: '', outputTime: '', fingerprints: ['CF-1234ABCD5678EF90'] },
], { projectNo: 'PKG-001' });
assert.equal(incompleteTraceReport.status, 'review');
assert(incompleteTraceReport.issues.some(issue => issue.code === 'missing-output-trace'));

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
assert(Checker.PAGE_ONLY_NEEDLES.includes('計算書模式'));
assert(Checker.PAGE_ONLY_NEEDLES.includes('輸出設定'));

const draftDocumentReport = Checker.analyzePackage([
  { file: 'beam-draft.pdf', errors: [], pageOnlyNeedles: [], draftDocumentNeedles: ['非正式附件', '不得作為正式附件'], projectName: '測試大樓', projectNo: 'PKG-001', designer: 'Codex QA', sourceTool: 'RC 梁', toolVersion: 'V3.1', outputTime: '2026/07/16 14:31:43', fingerprints: ['CF-1234ABCD5678EF90'] },
], { projectNo: 'PKG-001' });
assert.equal(draftDocumentReport.status, 'blocked');
assert(draftDocumentReport.issues.some(issue => issue.code === 'internal-review-document'));
const internalReviewReport = Checker.analyzePackage([
  { file: 'beam-review.pdf', errors: [], pageOnlyNeedles: [], draftDocumentNeedles: ['文件狀態：內部審閱'], readyDocumentNeedles: [], projectName: '', projectNo: '', designer: '', sourceTool: 'RC 梁', toolVersion: 'V3.1', outputTime: '2026/07/21 09:00:00', fingerprints: ['CF-1234ABCD5678EF90'] },
]);
assert.equal(internalReviewReport.status, 'blocked', 'printable internal-review output is not a formally approved package attachment');
assert(internalReviewReport.issues.some(issue => issue.code === 'internal-review-document'));
assert(Checker.DRAFT_DOCUMENT_NEEDLES.includes('文件狀態：內部審閱'));
assert(Checker.DRAFT_DOCUMENT_NEEDLES.includes('DRAFT /'));
assert(Checker.DRAFT_DOCUMENT_NEEDLES.includes('DRAFT／'));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-package-check-'));
try {
  fs.writeFileSync(path.join(tempDir, 'wind.json'), JSON.stringify({
    schema: 'tool-project-storage.v1',
    tool: { id: 'wind-force', name: '矩形建物 MWFRS', version: 'V1' },
    fields: { projNo: { value: 'PKG-001' } },
    calculationFingerprint: 'CF-1234ABCD5678EF90',
    savedAt: '2026/07/12 13:00:00',
  }), 'utf8');
  const scanned = Checker.checkPackage(tempDir, { projectNo: 'PKG-001' });
  assert.equal(scanned.attachments.length, 1);
  assert.equal(scanned.attachments[0].projectNo, 'PKG-001');
  assert.equal(scanned.attachments[0].toolVersion, 'v1');
  assert.equal(scanned.attachments[0].documentClassRequired, false, 'project JSON is source data and does not require a report document class');
  assert.equal(scanned.attachments[0].projectName, '');
  assert.equal(scanned.attachments[0].designer, '');
  assert.equal(scanned.status, 'ready');
  const cli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-check.js'), '--input', tempDir, '--project-no', 'PKG-001'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.match(cli.stdout, /附件組包一致性檢查：可整理/);

  fs.writeFileSync(path.join(tempDir, 'wind-formal.html'), '<h1>矩形建物風力計算書</h1><div>計畫名稱：測試大樓</div><div>計畫編號：PKG-001</div><div>設計人員：Codex QA</div><div>產出工具：矩形建物 MWFRS</div><div>工具版本：v1</div><div>輸出時間：2026/07/12 13:00:00</div><div>計算指紋：CF-1234ABCD5678EF90</div>', 'utf8');
  const legacyJsonAndFormalReport = Checker.checkPackage(tempDir, { projectNo: 'PKG-001' });
  assert.equal(legacyJsonAndFormalReport.status, 'review', 'compatible but unclassified report requires review');
  assert(legacyJsonAndFormalReport.issues.some(issue => issue.code === 'missing-document-class'));
  assert.equal(legacyJsonAndFormalReport.issues.some(issue => issue.code === 'tool-version-conflict'), false, 'legacy JSON and canonical report versions remain compatible');
  const unclassifiedFormalReport = legacyJsonAndFormalReport.attachments.find(item => item.file === 'wind-formal.html');
  assert.equal(unclassifiedFormalReport?.documentClassRequired, true);
  assert.deepEqual(unclassifiedFormalReport?.readyDocumentNeedles, []);
  const reviewCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-check.js'), '--input', tempDir, '--project-no', 'PKG-001'], { encoding: 'utf8' });
  assert.equal(reviewCli.status, 1, reviewCli.stderr || reviewCli.stdout);
  assert.match(reviewCli.stdout, /附件組包一致性檢查：需人工確認/);
  assert.match(reviewCli.stdout, /文件未分類/);

  fs.writeFileSync(path.join(tempDir, 'wind-formal.html'), '<h1>矩形建物風力計算書</h1><div>文件狀態：正式附件</div><div>計畫名稱：測試大樓</div><div>計畫編號：PKG-001</div><div>設計人員：Codex QA</div><div>產出工具：矩形建物 MWFRS</div><div>工具版本：v1</div><div>輸出時間：2026/07/12 13:00:00</div><div>計算指紋：CF-1234ABCD5678EF90</div>', 'utf8');
  const classifiedPackage = Checker.checkPackage(tempDir, { projectNo: 'PKG-001' });
  assert.equal(classifiedPackage.status, 'ready', 'explicit ready document classification allows package readiness');
  const classifiedReport = classifiedPackage.attachments.find(item => item.file === 'wind-formal.html');
  assert.deepEqual(classifiedReport?.readyDocumentNeedles, ['文件狀態：正式附件']);
  assert.equal(classifiedPackage.fingerprintLinks.length, 1, 'project JSON and ready report are linked by fingerprint');
  assert.equal(classifiedPackage.issues.some(issue => issue.code.includes('duplicate')), false);

  fs.writeFileSync(path.join(tempDir, 'wind-formal.html'), '<h1>矩形建物風力計算書</h1><div>文件狀態：正式附件</div><div>計畫名稱：測試大樓</div><div>計畫編號：PKG-001</div><div>產出工具：矩形建物 MWFRS</div><div>工具版本：v1</div><div>輸出時間：2026/07/12 13:00:00</div><div>計算指紋：CF-1234ABCD5678EF90</div>', 'utf8');
  const missingDesignerPackage = Checker.checkPackage(tempDir, { projectNo: 'PKG-001' });
  assert.equal(missingDesignerPackage.status, 'ready', 'parsed formal attachment may omit designer and inherit it from the main report');
  assert.equal(missingDesignerPackage.issues.some(issue => issue.code === 'missing-report-identity'), false);
  const missingDesignerCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-check.js'), '--input', tempDir, '--project-no', 'PKG-001'], { encoding: 'utf8' });
  assert.equal(missingDesignerCli.status, 0, missingDesignerCli.stderr || missingDesignerCli.stdout);
  assert.match(missingDesignerCli.stdout, /可整理/);

  fs.writeFileSync(path.join(tempDir, 'rc-draft.html'), '<div>DRAFT／非正式附件 - 待人工複核</div><div>本文件僅供內部複核；完成複核及資料補正前不得作為正式附件。</div><div>計畫名稱：測試大樓</div><div>計畫編號：PKG-001</div><div>設計人員：Codex QA</div><div>產出工具：RC 梁</div><div>工具版本：V3.1</div><div>輸出時間：2026/07/16 14:31:43</div><div>計算指紋：CF-BBBB0000CCCC1111</div>', 'utf8');
  const draftPackage = Checker.checkPackage(tempDir, { projectNo: 'PKG-001' });
  assert.equal(draftPackage.status, 'blocked', 'draft report cannot enter a delivery package');
  assert(draftPackage.issues.some(issue => issue.code === 'internal-review-document'));
  const blockedCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-check.js'), '--input', tempDir, '--project-no', 'PKG-001'], { encoding: 'utf8' });
  assert.equal(blockedCli.status, 2, blockedCli.stderr || blockedCli.stdout);
  assert.match(blockedCli.stdout, /附件組包一致性檢查：暫勿整理/);

  fs.writeFileSync(path.join(tempDir, 'anchor-review-draft.html'), '<div>文件分類｜DRAFT / 待人工複核</div><div>計畫名稱：測試大樓</div><div>計畫編號：PKG-001</div><div>產出工具：錨栓檢討工具</div><div>工具版本：v1</div><div>輸出時間：2026/07/20 10:30:00</div>', 'utf8');
  const anchorDraftPackage = Checker.checkPackage(tempDir, { projectNo: 'PKG-001' });
  const anchorDraft = anchorDraftPackage.attachments.find(item => item.file.endsWith('anchor-review-draft.html'));
  assert(anchorDraft?.draftDocumentNeedles.includes('DRAFT /'));
  assert.equal(anchorDraftPackage.status, 'blocked', 'anchor DRAFT document state cannot enter a delivery package');

  const evidenceDir = path.join(tempDir, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'formal-report.pdf'), 'fixture', 'utf8');
  fs.writeFileSync(path.join(evidenceDir, 'formal-report.txt'), 'derived PDF text', 'utf8');
  fs.writeFileSync(path.join(evidenceDir, 'formal-report.evidence.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(evidenceDir, 'rendered-delivery-evidence-summary.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(evidenceDir, 'case.json'), JSON.stringify({ project: { no: 'PKG-001' } }), 'utf8');
  fs.writeFileSync(path.join(evidenceDir, 'detail-scan.png'), 'fixture', 'utf8');
  fs.writeFileSync(path.join(evidenceDir, '.hidden-package.zip'), 'fixture', 'utf8');
  fs.writeFileSync(path.join(evidenceDir, 'Thumbs.db'), 'fixture', 'utf8');
  const evidenceCollection = Checker.collectAttachmentFiles(evidenceDir, '');
  assert.deepEqual(evidenceCollection.files.map(file => path.basename(file)), ['case.json', 'formal-report.pdf']);
  assert.deepEqual(evidenceCollection.skippedGeneratedEvidence.map(file => path.basename(file)), [
    'formal-report.evidence.json',
    'formal-report.txt',
    'rendered-delivery-evidence-summary.json'
  ]);
  assert.deepEqual(evidenceCollection.unsupportedFiles.map(file => path.basename(file)).sort(), ['.hidden-package.zip', 'detail-scan.png'].sort());
  assert.deepEqual(evidenceCollection.skippedSystemFiles.map(file => path.basename(file)), ['Thumbs.db']);

  const unsupportedDir = path.join(tempDir, 'unsupported-package');
  fs.mkdirSync(unsupportedDir, { recursive: true });
  fs.writeFileSync(path.join(unsupportedDir, 'case.json'), JSON.stringify({
    tool: { name: '矩形建物 MWFRS', version: 'v1' },
    project: { no: 'PKG-001' },
    calculationFingerprint: 'CF-1234ABCD5678EF90',
    savedAt: '2026/07/20 16:00:00',
  }), 'utf8');
  fs.writeFileSync(path.join(unsupportedDir, 'legacy-scan.png'), 'fixture', 'utf8');
  const unsupportedPackage = Checker.checkPackage(unsupportedDir, { projectNo: 'PKG-001' });
  assert.equal(unsupportedPackage.status, 'review', 'unread unsupported file prevents automatic package readiness');
  assert.equal(unsupportedPackage.summary.attachments, 1);
  assert.equal(unsupportedPackage.summary.unsupported, 1);
  assert.deepEqual(unsupportedPackage.unsupportedFiles, ['legacy-scan.png']);
  const unsupportedIssue = unsupportedPackage.issues.find(issue => issue.code === 'unsupported-attachment');
  assert.match(unsupportedIssue?.message || '', /legacy-scan\.png/);
  const unsupportedCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-check.js'), '--input', unsupportedDir, '--project-no', 'PKG-001'], { encoding: 'utf8' });
  assert.equal(unsupportedCli.status, 1, unsupportedCli.stderr || unsupportedCli.stdout);
  assert.match(unsupportedCli.stdout, /未檢查 1 個不支援檔案/);

  const fixtureDir = path.join(tempDir, 'fixture');
  fs.mkdirSync(path.join(fixtureDir, 'word'), { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, 'xl', 'worksheets'), { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, 'word', 'document.xml'), '<w:document><w:p><w:t>計畫名稱：測試大樓</w:t></w:p><w:p><w:t>計畫編號：PKG-001</w:t></w:p></w:document>', 'utf8');
  fs.writeFileSync(path.join(fixtureDir, 'word', 'footer1.xml'), '<w:ftr><w:p><w:t>文件狀態：正式附件</w:t></w:p><w:p><w:t>產出工具：錨栓檢討工具</w:t></w:p><w:p><w:t>工具版本：v1</w:t></w:p><w:p><w:t>輸出時間：2026/07/21 21:00:00</w:t></w:p><w:p><w:t>計算指紋：CF-1234ABCD5678EF90</w:t></w:p></w:ftr>', 'utf8');
  fs.writeFileSync(path.join(fixtureDir, 'xl', 'sharedStrings.xml'), '<sst><si><t>文件狀態</t></si><si><t>正式附件</t></si><si><t>計畫名稱</t></si><si><t>測試大樓</t></si><si><t>計畫編號</t></si><si><t>PKG-001</t></si><si><t>產出工具</t></si><si><t>錨栓檢討工具</t></si><si><t>工具版本</t></si><si><t>v1</t></si><si><t>輸出時間</t></si><si><t>2026/07/21 21:00:00</t></si><si><t>計算指紋</t></si><si><t>CF-1234ABCD5678EF90</t></si></sst>', 'utf8');
  fs.writeFileSync(path.join(fixtureDir, 'xl', 'worksheets', 'sheet1.xml'), '<worksheet><sheetData><row><c><v>0</v></c></row></sheetData></worksheet>', 'utf8');
  for (const [archive, source] of [['sample.docx', 'word'], ['sample.xlsx', 'xl']]) {
    const result = spawnSync('tar', ['-a', '-cf', path.join(tempDir, archive), '-C', fixtureDir, source], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${archive} fixture archive`);
  }
  const docxRecord = Checker.inspectAttachment(path.join(tempDir, 'sample.docx'), tempDir);
  const xlsxRecord = Checker.inspectAttachment(path.join(tempDir, 'sample.xlsx'), tempDir);
  assert.deepEqual(docxRecord.errors, []);
  assert.equal(docxRecord.projectNo, 'PKG-001');
  assert.equal(docxRecord.sourceTool, '錨栓檢討工具');
  assert.equal(docxRecord.toolVersion, 'v1');
  assert.equal(docxRecord.outputTime, '2026/07/21 21:00:00');
  assert.deepEqual(docxRecord.readyDocumentNeedles, ['文件狀態：正式附件']);
  assert.deepEqual(docxRecord.fingerprints, ['CF-1234ABCD5678EF90']);
  assert.deepEqual(xlsxRecord.errors, []);
  assert.equal(xlsxRecord.projectNo, 'PKG-001');
  assert.equal(xlsxRecord.sourceTool, '錨栓檢討工具');
  assert.equal(xlsxRecord.toolVersion, 'v1');
  assert.equal(xlsxRecord.outputTime, '2026/07/21 21:00:00');
  assert.deepEqual(xlsxRecord.readyDocumentNeedles, ['文件狀態：正式附件']);
  assert.deepEqual(xlsxRecord.fingerprints, ['CF-1234ABCD5678EF90']);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

assert.deepEqual(Checker.parseArgs(['--input', 'C:/case', '--project-no', 'PKG-001']), { input: 'C:/case', projectNo: 'PKG-001' });
assert.deepEqual(Checker.PACKAGE_STATUS_EXIT_CODES, { ready: 0, review: 1, blocked: 2 });
assert(Checker.SUPPORTED_EXTENSIONS.has('.pdf'));
assert(Checker.IGNORED_SYSTEM_FILES.has('thumbs.db'));
assert.equal(Checker.isIgnorableSystemFile('Thumbs.db'), true);
assert.equal(Checker.isIgnorableSystemFile('legacy-scan.png'), false);
assert.equal(Checker.CLI_ERROR_EXIT_CODE, 3);
assert.equal(Checker.exitCodeForStatus('ready'), 0);
assert.equal(Checker.exitCodeForStatus('review'), 1);
assert.equal(Checker.exitCodeForStatus('blocked'), 2);
assert.equal(Checker.exitCodeForStatus('unknown'), 3);
const helpCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-check.js'), '--help'], { encoding: 'utf8' });
assert.equal(helpCli.status, 0, helpCli.stderr || helpCli.stdout);
const missingInputCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-check.js')], { encoding: 'utf8' });
assert.equal(missingInputCli.status, 3, missingInputCli.stderr || missingInputCli.stdout);
const missingFolderPath = path.join(os.tmpdir(), `attachment-package-check-missing-${process.pid}-${Date.now()}`);
const missingFolderCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-check.js'), '--input', missingFolderPath], { encoding: 'utf8' });
assert.equal(missingFolderCli.status, 3, missingFolderCli.stderr || missingFolderCli.stdout);
assert.match(Checker.formatSummary(readyReport), /僅供交付前整理/);
assert.match(Checker.formatSummary({ ...readyReport, skippedGeneratedEvidence: ['formal-report.evidence.json'] }), /已略過 1 個驗證中間檔/);

console.log('attachment package check OK');
