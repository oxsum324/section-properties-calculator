const assert = require('assert');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Checker = require('./attachment-package-check.js');

const COMPLETE_CALCULATION_CONTENT = '<section><h2>採用輸入</h2><div>材料與荷載資料：fc\'=280 kgf/cm²；Mu=12.5 tf·m</div></section><section><h2>計算內容</h2><div>檢核公式與代入值：Mu=12.5 tf·m；φMn=18.2 tf·m</div></section><section><h2>檢核結論</h2><div>DCR=0.69；檢核結果：通過</div></section>';

const extracted = Checker.extractTextMetadata(`
計畫名稱：測試大樓
計畫編號：PKG-001
設計人員：Codex QA
產出工具：RC 梁設計／檢核
工具版本：V3.1
輸出時間：2026/07/12 13:00:00
核可時間：2026/07/12 13:05:00
計算指紋：CF-1234ABCD5678EF90
`);
assert.equal(extracted.projectName, '測試大樓');
assert.equal(extracted.projectNo, 'PKG-001');
assert.equal(extracted.sourceTool, 'RC 梁設計／檢核');
assert.equal(extracted.toolVersion, 'v3.1');
assert.equal(extracted.approvalTime, '2026/07/12 13:05:00');
assert.deepEqual(extracted.fingerprints, ['CF-1234ABCD5678EF90']);
assert.equal(Checker.isValidApprovalTime('2026/07/12 13:05:00'), true);
assert.equal(Checker.isValidApprovalTime('2026-07-12T05:05:00.000Z'), true);
assert.equal(Checker.isValidApprovalTime('2026/02/30 13:05:00'), false);
assert.equal(Checker.isValidApprovalTime('2026-02-30T05:05:00.000Z'), false);
assert.equal(Checker.parseTraceDateTime('2026/07/12 13:05:00'), Checker.parseTraceDateTime('2026-07-12T05:05:00.000Z'));
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
  { file: 'beam.pdf', type: 'pdf', errors: [], pageOnlyNeedles: [], draftDocumentNeedles: [], readyDocumentNeedles: ['文件狀態：正式附件'], projectName: '測試大樓', projectNo: 'PKG-001', designer: 'Codex QA', sourceTool: 'RC 梁', toolVersion: 'V3.1', outputTime: '2026/07/12 13:00:00', approvalTime: '2026/07/12 13:05:00', fingerprints: ['CF-1234ABCD5678EF90'] },
], { projectNo: 'PKG-001' });
assert.equal(readyReport.status, 'ready');
assert.match(Checker.formatSummary(readyReport), /測試大樓｜PKG-001｜Codex QA/);
assert.deepEqual(Checker.detectReadyDocumentClass('<strong>文件狀態：正式附件</strong>'), ['文件狀態：正式附件']);
assert.deepEqual(Checker.detectReadyDocumentClass('<div>文件狀態</div><div>正式附件</div>'), ['文件狀態：正式附件']);
assert.equal(Checker.READY_DOCUMENT_CLASS_LABEL, '文件狀態：正式附件');
assert.equal(Checker.CALCULATION_BOOK_CONTENT_BOUNDARY.version, '1.3.0');
assert.deepEqual(Checker.CONTENT_PROFILES['calculation-summary'], ['adoptedInputs', 'engineeringResult', 'engineeringValues']);
assert.equal(Checker.detectCalculationContentProfile('RC 梁設計計算書'), 'calculation-book');
assert.equal(Checker.detectCalculationContentProfile('RC 梁計算摘要'), 'calculation-summary');
assert.equal(Checker.extractHtmlText('<style>採用輸入 計算內容 檢核結論</style><div hidden>採用輸入</div><div aria-hidden="true">計算內容</div><h1>RC 梁設計計算書</h1>'), 'RC 梁設計計算書');
assert.equal(
  Checker.extractHtmlText('<style>.hidden-by-class{display:none}</style><div class="hidden-by-class">採用輸入 計算內容 檢核結論 Mu=12.5 tf·m DCR=0.69</div><div>可見報告</div>'),
  '可見報告',
  'class-based display:none content cannot satisfy an attachment boundary',
);
assert.equal(
  Checker.extractHtmlText('<style>@media print{.print-hidden{visibility:hidden!important}}</style><div class="print-hidden">採用輸入 計算內容 檢核結論 Mu=12.5 tf·m DCR=0.69</div><div>列印可見報告</div>'),
  '列印可見報告',
  '@media print hidden content cannot satisfy an attachment boundary',
);
assert.equal(
  Checker.extractHtmlText('<style>.transparent{opacity:0}.clear{color:transparent}</style><div class="transparent">採用輸入 計算內容</div><div class="clear">檢核結論 DCR=0.69</div><div>可見報告</div>'),
  '可見報告',
  'zero-opacity and transparent text cannot satisfy an attachment boundary',
);
const offscreenHtml = Checker.extractHtmlVisibleContent('<style>.offscreen{position:absolute;left:-9999px}</style><div class="offscreen">採用輸入 計算內容 檢核結論 Mu=12.5 tf·m DCR=0.69</div><div>可見報告</div>');
assert(offscreenHtml.text.includes('採用輸入'), 'static extraction keeps unresolved offscreen text only for diagnosis');
assert.deepEqual(offscreenHtml.visibilityIssues, ['.offscreen'], 'unresolved offscreen CSS forces visibility review instead of claiming visible text');
const whiteOnWhiteHtml = Checker.extractHtmlVisibleContent('<style>.white-on-white{color:#fff;background-color:rgb(255,255,255)}</style><div class="white-on-white">採用輸入 計算內容 檢核結論 Mu=12.5 tf·m DCR=0.69</div><div>可見報告</div>');
assert.deepEqual(whiteOnWhiteHtml.visibilityIssues, ['.white-on-white'], 'same foreground/background text forces visibility review');
assert.equal(whiteOnWhiteHtml.text, '可見報告', 'same-color text is excluded from visible engineering content');
const inlineWhiteDefaultHtml = Checker.extractHtmlVisibleContent('<div style="color:white">採用輸入 計算內容 檢核結論 Mu=12.5 tf·m DCR=0.69</div><div>可見報告</div>');
assert.equal(inlineWhiteDefaultHtml.text, '可見報告', 'inline white text on the default white page cannot satisfy an attachment boundary');
assert.deepEqual(inlineWhiteDefaultHtml.visibilityIssues, ['inline div']);
const splitSameColorHtml = Checker.extractHtmlVisibleContent('<style>.split-same{color:white}.split-same{background:white}</style><div class="split-same">採用輸入 計算內容 檢核結論 Mu=12.5 tf·m DCR=0.69</div><div>可見報告</div>');
assert.equal(splitSameColorHtml.text, '可見報告', 'separate rules for the same selector are merged before contrast evaluation');
assert.deepEqual(splitSameColorHtml.visibilityIssues, ['.split-same']);
const zeroClippedHtml = Checker.extractHtmlVisibleContent('<div style="width:0;height:0;overflow:hidden">採用輸入 計算內容 檢核結論 Mu=12.5 tf·m DCR=0.69</div><div>可見報告</div>');
assert.equal(zeroClippedHtml.text, '可見報告', 'zero-size clipped content cannot satisfy an attachment boundary');
assert.deepEqual(zeroClippedHtml.visibilityIssues, []);
const contrastedHeadingHtml = Checker.extractHtmlVisibleContent('<div style="background:navy"><h1 style="color:white">明確對比彩色標題</h1></div>');
assert.equal(contrastedHeadingHtml.text, '明確對比彩色標題', 'white text on an explicit dark ancestor remains visible');
assert.deepEqual(contrastedHeadingHtml.visibilityIssues, [], 'clear foreground/background contrast is not flagged');
const complexVisibilitySelectorHtml = Checker.extractHtmlVisibleContent('<style>.report .calc{color:white}</style><section class="report"><div class="calc">保留作診斷的工程內容</div></section>');
assert(complexVisibilitySelectorHtml.text.includes('保留作診斷的工程內容'));
assert.deepEqual(complexVisibilitySelectorHtml.visibilityIssues, ['.report .calc'], 'unparsed selectors with visibility-related declarations require review');
const complexTypographySelectorHtml = Checker.extractHtmlVisibleContent('<style>.report h1{font-weight:700;letter-spacing:.02em}</style><section class="report"><h1>純排版標題</h1></section>');
assert.equal(complexTypographySelectorHtml.text, '純排版標題');
assert.deepEqual(complexTypographySelectorHtml.visibilityIssues, [], 'pure typography on a complex selector does not require visibility review');
const linkedStylesheetHtml = Checker.extractHtmlVisibleContent('<link rel="stylesheet" href="report.css"><div>外部樣式診斷內容</div>');
assert.equal(linkedStylesheetHtml.text, '外部樣式診斷內容');
assert.deepEqual(linkedStylesheetHtml.visibilityIssues, ['link[rel=stylesheet]']);
const importedStylesheetHtml = Checker.extractHtmlVisibleContent('<style>@import url("report.css");</style><div>匯入樣式診斷內容</div>');
assert.equal(importedStylesheetHtml.text, '匯入樣式診斷內容');
assert.deepEqual(importedStylesheetHtml.visibilityIssues, ['@import']);
const unparsedColorHtml = Checker.extractHtmlVisibleContent('<style>.tone{color:hsl(0 0% 100%)}</style><div class="tone">HSL 診斷內容</div>');
assert.equal(unparsedColorHtml.text, 'HSL 診斷內容');
assert.deepEqual(unparsedColorHtml.visibilityIssues, ['.tone'], 'unsupported color functions require review even on a simple selector');
const unparsedVariableBackgroundHtml = Checker.extractHtmlVisibleContent('<div style="background:var(--report-background)">CSS 變數診斷內容</div>');
assert.equal(unparsedVariableBackgroundHtml.text, 'CSS 變數診斷內容');
assert.deepEqual(unparsedVariableBackgroundHtml.visibilityIssues, ['inline div']);




const unsafeSourceReport = Checker.analyzePackage([], { unsafeSourceEntries: ['linked-outside'] });
assert.equal(unsafeSourceReport.status, 'blocked');
assert.equal(unsafeSourceReport.summary.unsafeSourceEntries, 1);
assert(unsafeSourceReport.issues.some(issue => issue.code === 'unsafe-source-entry'));
assert.match(Checker.formatSummary(unsafeSourceReport), /已阻擋 1 個來源符號連結/);

const sourceRecord = {
  file: 'beam.json', type: 'json', errors: [], pageOnlyNeedles: [], draftDocumentNeedles: [], readyDocumentNeedles: [],
  projectName: '測試大樓', projectNo: 'PKG-001', designer: '', sourceTool: 'RC 梁', toolVersion: 'V3.1',
  outputTime: '2026/07/12 12:59:00', fingerprints: ['CF-1234ABCD5678EF90'],
};
const reportRecord = {
  file: 'beam.pdf', type: 'pdf', errors: [], pageOnlyNeedles: [], draftDocumentNeedles: [], readyDocumentNeedles: ['文件狀態：正式附件'],
  projectName: '測試大樓', projectNo: 'PKG-001', designer: 'Codex QA', sourceTool: 'RC 梁', toolVersion: 'V3.1',
  outputTime: '2026/07/12 13:00:00', approvalTime: '2026/07/12 13:05:00', fingerprints: ['CF-1234ABCD5678EF90'],
};
const whiteOnWhitePackage = Checker.analyzePackage([{ ...reportRecord, file: 'white-on-white.html', type: 'html', visibilityEvidence: { status: 'review', method: 'html-static-print-visibility', reasons: whiteOnWhiteHtml.visibilityIssues } }]);
assert.equal(whiteOnWhitePackage.status, 'review', 'white-on-white HTML cannot automatically pass as a formal attachment');
assert(whiteOnWhitePackage.issues.some(issue => issue.code === 'visibility-boundary-review'));
const matchedSourceReport = Checker.analyzePackage([sourceRecord, reportRecord], { projectNo: 'PKG-001' });
const canonicalEvidenceHash = 'a'.repeat(64);
const canonicalVisibleText = Checker.normalizeText(COMPLETE_CALCULATION_CONTENT);
const canonicalVisibleBoundary = Checker.evaluateCalculationContent(canonicalVisibleText, { contentBoundaryProfile: 'calculation-book' });
const canonicalEvidence = {
  kind: Checker.CANONICAL_RENDER_EVIDENCE_KIND,
  artifact: 'beam.pdf',
  artifactSha256: canonicalEvidenceHash,
  sourceHtmlSha256: 'b'.repeat(64),
  renderer: 'browser-print',
  dom: {
    printVisibility: {
      ambiguousTextNodeCount: 0,
      checks: ['print-media', 'text-range-client-rects'],
    },
  },
  pdf: {
    pageCount: 1,
    pages: [{ width: 596, height: 842, inkPixels: 12000, inkRatio: 0.0239, bounds: { minX: 40, minY: 50, maxX: 550, maxY: 790 } }],
    visibleText: {
      source: 'controlled-html-print-session',
      method: 'print-media-computed-style-client-rects',
      generatedInSamePrintSession: true,
      derivedFromRenderedPages: false,
      text: canonicalVisibleText,
      textLength: canonicalVisibleText.length,
      textSha256: crypto.createHash('sha256').update(canonicalVisibleText, 'utf8').digest('hex'),
      contentBoundary: canonicalVisibleBoundary,
    },
  },
};
assert.equal(
  Checker.validateCanonicalRenderEvidence(canonicalEvidence, { artifactName: 'beam.pdf', artifactSha256: canonicalEvidenceHash }).status,
  'verified',
  'same-session print-visible DOM plus artifact hash and rendered page metrics form canonical evidence',
);
const traceableVisibleText = Checker.normalizeText(`RC 梁設計計算書 產出工具：RC 梁 工具版本：v3.1 輸出時間：2026/07/12 13:00:00 計算指紋：CF-1234ABCD5678EF90 ${COMPLETE_CALCULATION_CONTENT}`);
assert.equal(Checker.detectCalculationContentProfile(traceableVisibleText), 'traceable-calculation-book', 'complete visible traceability selects the traceable book profile');
const traceableEvidence = JSON.parse(JSON.stringify(canonicalEvidence));
traceableEvidence.pdf.visibleText.text = traceableVisibleText;
traceableEvidence.pdf.visibleText.textLength = traceableVisibleText.length;
traceableEvidence.pdf.visibleText.textSha256 = crypto.createHash('sha256').update(traceableVisibleText, 'utf8').digest('hex');
traceableEvidence.pdf.visibleText.contentBoundary = Checker.evaluateCalculationContent(traceableVisibleText, { contentBoundaryProfile: 'traceable-calculation-book' });
assert.equal(
  Checker.validateCanonicalRenderEvidence(traceableEvidence, { artifactName: 'beam.pdf', artifactSha256: canonicalEvidenceHash }).status,
  'verified',
  'traceable calculation-book evidence remains compatible with formal browser smoke output',
);
const traceableSummaryText = traceableVisibleText.replace('RC 梁設計計算書', 'RC 梁計算摘要');
assert.equal(Checker.detectCalculationContentProfile(traceableSummaryText), 'traceable-calculation-summary', 'summary title and complete traceability select the traceable summary profile');
const traceableSummaryEvidence = JSON.parse(JSON.stringify(traceableEvidence));
traceableSummaryEvidence.pdf.visibleText.text = traceableSummaryText;
traceableSummaryEvidence.pdf.visibleText.textLength = traceableSummaryText.length;
traceableSummaryEvidence.pdf.visibleText.textSha256 = crypto.createHash('sha256').update(traceableSummaryText, 'utf8').digest('hex');
traceableSummaryEvidence.pdf.visibleText.contentBoundary = Checker.evaluateCalculationContent(traceableSummaryText, { contentBoundaryProfile: 'traceable-calculation-summary' });
assert.equal(Checker.validateCanonicalRenderEvidence(traceableSummaryEvidence, { artifactName: 'beam.pdf', artifactSha256: canonicalEvidenceHash }).status, 'verified', 'traceable calculation-summary evidence remains compatible');
const compiledEvidence = JSON.parse(JSON.stringify(traceableEvidence));
compiledEvidence.pdf.visibleText.contentBoundary = Checker.evaluateCalculationContent(traceableVisibleText, { contentBoundaryProfile: 'compiled-engineering-report' });
assert.equal(
  Checker.validateCanonicalRenderEvidence(compiledEvidence, { artifactName: 'beam.pdf', artifactSha256: canonicalEvidenceHash }).status,
  'verified',
  'compiled engineering reports remain compatible with the calculation-book family while content is independently reevaluated',
);
const downgradedTraceableEvidence = JSON.parse(JSON.stringify(traceableEvidence));
downgradedTraceableEvidence.pdf.visibleText.contentBoundary = Checker.evaluateCalculationContent(traceableVisibleText, { contentBoundaryProfile: 'calculation-book' });
const downgradedTraceableResult = Checker.validateCanonicalRenderEvidence(downgradedTraceableEvidence, { artifactName: 'beam.pdf', artifactSha256: canonicalEvidenceHash });
assert.equal(downgradedTraceableResult.status, 'review', 'traceable visible content cannot claim a non-traceable profile');
assert(downgradedTraceableResult.reasons.includes('visible-content-profile'));
assert.equal(
  Checker.validateCanonicalRenderEvidence(canonicalEvidence, { artifactName: 'beam.pdf', artifactSha256: 'd'.repeat(64) }).status,
  'review',
  'canonical evidence cannot be reused after the PDF bytes change',
);
assert.equal(
  Checker.validateCanonicalRenderEvidence(canonicalEvidence, { artifactName: 'other.pdf', artifactSha256: canonicalEvidenceHash }).status,
  'review',
  'canonical evidence cannot be reused for another PDF filename',
);
const falseBoundaryEvidence = JSON.parse(JSON.stringify(canonicalEvidence));
falseBoundaryEvidence.pdf.visibleText.text = '只有標題與狀態，沒有工程計算內容。';
falseBoundaryEvidence.pdf.visibleText.textLength = falseBoundaryEvidence.pdf.visibleText.text.length;
falseBoundaryEvidence.pdf.visibleText.textSha256 = crypto.createHash('sha256').update(falseBoundaryEvidence.pdf.visibleText.text, 'utf8').digest('hex');
assert.equal(
  Checker.validateCanonicalRenderEvidence(falseBoundaryEvidence, { artifactName: 'beam.pdf', artifactSha256: canonicalEvidenceHash }).status,
  'review', 'checker recomputes visible calculation content instead of trusting a claimed empty missingGroups list',
);
const falseProfileEvidence = JSON.parse(JSON.stringify(canonicalEvidence));
falseProfileEvidence.pdf.visibleText.contentBoundary.profile = 'calculation-summary';
const falseProfileResult = Checker.validateCanonicalRenderEvidence(falseProfileEvidence, { artifactName: 'beam.pdf', artifactSha256: canonicalEvidenceHash });
assert.equal(falseProfileResult.status, 'review', 'checker redetects the visible document profile instead of trusting an evidence claim');
assert(
  falseProfileResult.reasons.includes('visible-content-profile'),
  'forged calculation-summary profile is rejected when visible text is a calculation book',
);
const textOnlyPdfReport = Checker.analyzePackage([
  { ...reportRecord, visibilityEvidence: { status: 'review', method: 'pdftotext-only', reasons: ['canonical-render-evidence-missing'] } },
]);
assert.equal(textOnlyPdfReport.status, 'review', 'PDF text extraction alone cannot automatically pass the package');
assert(textOnlyPdfReport.issues.some(issue => issue.code === 'pdf-canonical-render-evidence-required'));
const canonicalPdfReport = Checker.analyzePackage([
  { ...reportRecord, visibilityEvidence: { status: 'verified', method: 'canonical-render-visible-text', reasons: [] } },
]);
assert.equal(canonicalPdfReport.status, 'ready', 'verified canonical render evidence preserves formal PDF readiness');

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
  { file: 'beam-missing-identity.pdf', type: 'pdf', errors: [], pageOnlyNeedles: [], draftDocumentNeedles: [], readyDocumentNeedles: ['文件狀態：正式附件'], projectName: '', projectNo: '', designer: '', sourceTool: 'RC 梁', toolVersion: 'V3.1', outputTime: '2026/07/12 13:00:00', approvalTime: '2026/07/12 13:05:00', fingerprints: ['CF-1234ABCD5678EF90'] },
], { projectNo: 'PKG-001' });
assert.equal(missingReportIdentity.status, 'ready', 'formal attachment may inherit blank case identity from its main report');
assert.equal(missingReportIdentity.issues.some(issue => issue.code === 'missing-report-identity'), false, 'blank optional attachment identity is not an issue');
assert.deepEqual(Checker.REPORT_IDENTITY_FIELDS.map(([, label]) => label), ['計畫名稱', '計畫編號', '設計人員']);

const missingApprovalTime = Checker.analyzePackage([
  { ...reportRecord, file: 'beam-no-approval-time.pdf', approvalTime: '' },
]);
assert.equal(missingApprovalTime.status, 'blocked', 'formal attachment marker without approval time cannot be packaged');
assert(missingApprovalTime.issues.some(issue => issue.code === 'missing-formal-approval-time'));
const invalidApprovalTime = Checker.analyzePackage([
  { ...reportRecord, file: 'beam-invalid-approval-time.pdf', approvalTime: '2026/02/30 13:05:00' },
]);
assert.equal(invalidApprovalTime.status, 'blocked');
assert(invalidApprovalTime.issues.some(issue => issue.code === 'invalid-formal-approval-time'));
const approvalBeforeOutput = Checker.analyzePackage([
  { ...reportRecord, file: 'beam-approval-before-output.pdf', approvalTime: '2026/07/12 12:59:59' },
]);
assert.equal(approvalBeforeOutput.status, 'blocked');
assert(approvalBeforeOutput.issues.some(issue => issue.code === 'formal-approval-before-output'));
const equalApprovalAndOutput = Checker.analyzePackage([
  { ...reportRecord, file: 'beam-equal-approval-output.pdf', approvalTime: reportRecord.outputTime },
]);
assert.equal(equalApprovalAndOutput.status, 'ready', 'approval and output may share the same displayed second');
const invalidOutputTime = Checker.analyzePackage([
  { ...reportRecord, file: 'beam-invalid-output-time.pdf', outputTime: '2026/02/30 13:00:00' },
]);
assert.equal(invalidOutputTime.status, 'review');
assert(invalidOutputTime.issues.some(issue => issue.code === 'invalid-output-time'));

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
assert(Checker.PAGE_ONLY_NEEDLES.includes('計算層級 / 複核邊界'));
assert(Checker.PAGE_ONLY_NEEDLES.includes('條文對照 ＆ 方法分級'));
assert(Checker.PAGE_ONLY_NEEDLES.includes('規範覆蓋矩陣'));

const governanceNarrativeReport = Checker.analyzePackage([
  { file: 'governance-heavy.pdf', errors: [], pageOnlyNeedles: ['規範覆蓋矩陣'], projectName: '', projectNo: '', designer: '', sourceTool: 'RC 柱', toolVersion: 'V3.1', outputTime: '2026/07/23 10:00:00', fingerprints: ['CF-1234ABCD5678EF90'] },
]);
assert.equal(governanceNarrativeReport.status, 'blocked');
assert(governanceNarrativeReport.issues.some(issue => issue.code === 'page-only-leak'));

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
  assert.equal(scanned.attachments[0].sourceSha256, Checker.sha256File(path.join(tempDir, 'wind.json')));
  assert.match(scanned.attachments[0].sourceSha256, /^[0-9a-f]{64}$/);
  assert.equal(scanned.status, 'ready');
  const cli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-check.js'), '--input', tempDir, '--project-no', 'PKG-001'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.match(cli.stdout, /附件組包一致性檢查：可整理/);

  fs.writeFileSync(path.join(tempDir, 'wind-formal.html'), `<h1>矩形建物風力計算書</h1><div>計畫名稱：測試大樓</div><div>計畫編號：PKG-001</div><div>設計人員：Codex QA</div><div>產出工具：矩形建物 MWFRS</div><div>工具版本：v1</div><div>輸出時間：2026/07/12 13:00:00</div><div>計算指紋：CF-1234ABCD5678EF90</div>${COMPLETE_CALCULATION_CONTENT}`, 'utf8');
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

  fs.writeFileSync(path.join(tempDir, 'wind-formal.html'), '<h1>矩形建物風力計算書</h1><div>文件狀態：正式附件</div><div>核可時間：2026/07/12 13:05:00</div><div>計畫名稱：測試大樓</div><div>計畫編號：PKG-001</div><div>設計人員：Codex QA</div><div>產出工具：矩形建物 MWFRS</div><div>工具版本：v1</div><div>輸出時間：2026/07/12 13:00:00</div><div>計算指紋：CF-1234ABCD5678EF90</div>', 'utf8');
  const emptyShellPackage = Checker.checkPackage(tempDir, { projectNo: 'PKG-001' });
  assert.equal(emptyShellPackage.status, 'blocked', 'title, approval, and trace metadata cannot replace engineering calculation content');
  assert(emptyShellPackage.issues.some(issue => issue.code === 'missing-calculation-content'));
  const emptyShellRecord = emptyShellPackage.attachments.find(item => item.file === 'wind-formal.html');
  assert.deepEqual(emptyShellRecord?.contentBoundary?.missingGroups, ['adoptedInputs', 'calculationProcess', 'engineeringResult', 'engineeringValues']);
  assert.match(Checker.formatSummary(emptyShellPackage), /內容缺 adoptedInputs,calculationProcess,engineeringResult,engineeringValues/);
  const visibilitySecurityShell = '<h1>RC 梁設計計算書</h1><div>文件狀態：正式附件</div><div>核可時間：2026/07/12 13:05:00</div><div>產出工具：RC 梁</div><div>工具版本：v3.1</div><div>輸出時間：2026/07/12 13:00:00</div><div>計算指紋：CF-9999AAAA8888BBBB</div>';
  const visibilitySecurityCases = [
    { name: 'inline-white-default', html: `${visibilitySecurityShell}<div style="color:white">${COMPLETE_CALCULATION_CONTENT}</div>` },
    { name: 'split-same-color', html: `<style>.concealed{color:white}.concealed{background:white}</style>${visibilitySecurityShell}<div class="concealed">${COMPLETE_CALCULATION_CONTENT}</div>` },
    { name: 'zero-clipped-box', html: `${visibilitySecurityShell}<div style="width:0;height:0;overflow:hidden">${COMPLETE_CALCULATION_CONTENT}</div>` },
  ];
  visibilitySecurityCases.forEach(testCase => {
    const fixturePath = path.join(tempDir, `${testCase.name}.html`);
    fs.writeFileSync(fixturePath, testCase.html, 'utf8');
    const record = Checker.inspectAttachment(fixturePath, tempDir);
    assert.deepEqual(
      record.contentBoundary?.missingGroups,
      ['adoptedInputs', 'calculationProcess', 'engineeringResult', 'engineeringValues'],
      `${testCase.name} concealed content cannot satisfy the calculation boundary`,
    );
    const packageResult = Checker.analyzePackage([record]);
    assert.notEqual(packageResult.status, 'ready', `${testCase.name} package cannot be ready`);
    fs.rmSync(fixturePath);
  });

  const visibilityReviewCases = [
    { name: 'complex-visibility-selector', html: `<style>.report .calc{color:white}</style>${visibilitySecurityShell}<section class="report"><div class="calc">${COMPLETE_CALCULATION_CONTENT}</div></section>` },
    { name: 'external-stylesheet', html: `<link rel="stylesheet" href="report.css">${visibilitySecurityShell}${COMPLETE_CALCULATION_CONTENT}` },
    { name: 'css-import', html: `<style>@import url("report.css");</style>${visibilitySecurityShell}${COMPLETE_CALCULATION_CONTENT}` },
    { name: 'unparsed-color', html: `<style>.tone{color:hsl(0 0% 100%);background:var(--report-background)}</style>${visibilitySecurityShell}<div class="tone">${COMPLETE_CALCULATION_CONTENT}</div>` },
  ];
  visibilityReviewCases.forEach(testCase => {
    const fixturePath = path.join(tempDir, `${testCase.name}.html`);
    fs.writeFileSync(fixturePath, testCase.html, 'utf8');
    const record = Checker.inspectAttachment(fixturePath, tempDir);
    assert.deepEqual(record.contentBoundary?.missingGroups, [], `${testCase.name} visible text remains available for diagnosis`);
    assert.equal(record.visibilityEvidence?.status, 'review', `${testCase.name} requires visibility review`);
    const packageResult = Checker.analyzePackage([record]);
    assert.equal(packageResult.status, 'review', `${testCase.name} package cannot be ready`);
    assert(packageResult.issues.some(issue => issue.code === 'visibility-boundary-review'));
    fs.rmSync(fixturePath);
  });


  fs.writeFileSync(path.join(tempDir, 'wind-formal.html'), `<h1>矩形建物風力計算書</h1><div>文件狀態：正式附件</div><div>核可時間：2026/07/12 13:05:00</div><div>計畫名稱：測試大樓</div><div>計畫編號：PKG-001</div><div>設計人員：Codex QA</div><div>產出工具：矩形建物 MWFRS</div><div>工具版本：v1</div><div>輸出時間：2026/07/12 13:00:00</div><div>計算指紋：CF-1234ABCD5678EF90</div>${COMPLETE_CALCULATION_CONTENT}`, 'utf8');
  const classifiedPackage = Checker.checkPackage(tempDir, { projectNo: 'PKG-001' });
  assert.equal(classifiedPackage.status, 'ready', 'explicit ready document classification allows package readiness');
  const classifiedReport = classifiedPackage.attachments.find(item => item.file === 'wind-formal.html');
  assert.deepEqual(classifiedReport?.readyDocumentNeedles, ['文件狀態：正式附件']);
  assert.deepEqual(classifiedReport?.contentBoundary?.missingGroups, []);
  assert.equal(classifiedPackage.fingerprintLinks.length, 1, 'project JSON and ready report are linked by fingerprint');
  assert.equal(classifiedPackage.issues.some(issue => issue.code.includes('duplicate')), false);

  fs.writeFileSync(path.join(tempDir, 'wind-formal.html'), `<h1>矩形建物風力計算書</h1><div>文件狀態：正式附件</div><div>核可時間：2026/07/12 13:05:00</div><div>計畫名稱：測試大樓</div><div>計畫編號：PKG-001</div><div>產出工具：矩形建物 MWFRS</div><div>工具版本：v1</div><div>輸出時間：2026/07/12 13:00:00</div><div>計算指紋：CF-1234ABCD5678EF90</div>${COMPLETE_CALCULATION_CONTENT}`, 'utf8');
  const missingDesignerPackage = Checker.checkPackage(tempDir, { projectNo: 'PKG-001' });
  assert.equal(missingDesignerPackage.status, 'ready', 'parsed formal attachment may omit designer and inherit it from the main report');
  assert.equal(missingDesignerPackage.issues.some(issue => issue.code === 'missing-report-identity'), false);
  const missingDesignerCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-check.js'), '--input', tempDir, '--project-no', 'PKG-001'], { encoding: 'utf8' });
  assert.equal(missingDesignerCli.status, 0, missingDesignerCli.stderr || missingDesignerCli.stdout);
  assert.match(missingDesignerCli.stdout, /可整理/);

  const scriptedShellPath = path.join(tempDir, 'scripted-empty-shell.html');
  fs.writeFileSync(scriptedShellPath, '<h1>RC 梁設計計算書</h1><div>文件狀態：正式附件</div><div>核可時間：2026/07/12 13:05:00</div><div>產出工具：RC 梁</div><div>工具版本：v3.1</div><div>輸出時間：2026/07/12 13:00:00</div><div>計算指紋：CF-9999AAAA8888BBBB</div><script>const hidden = "採用輸入 計算內容 檢核結論";</script>', 'utf8');
  const scriptedShellRecord = Checker.inspectAttachment(scriptedShellPath, tempDir);
  assert.deepEqual(scriptedShellRecord.contentBoundary?.missingGroups, ['adoptedInputs', 'calculationProcess', 'engineeringResult', 'engineeringValues'], 'script source cannot satisfy visible calculation content');
  fs.rmSync(scriptedShellPath);

  const summaryPath = path.join(tempDir, 'design-summary.html');
  fs.writeFileSync(summaryPath, '<h1>RC 梁計算摘要</h1><div>文件狀態：正式附件</div><div>核可時間：2026/07/12 13:05:00</div><div>產出工具：RC 梁</div><div>工具版本：v3.1</div><div>輸出時間：2026/07/12 13:00:00</div><div>計算指紋：CF-9999AAAA8888BBBB</div><section>採用材料與荷載資料：Mu=12.5 tf·m</section><section>DCR=0.69；檢核結果：通過</section>', 'utf8');
  const summaryRecord = Checker.inspectAttachment(summaryPath, tempDir);
  assert.equal(summaryRecord.contentBoundary?.profile, 'traceable-calculation-summary');
  assert.deepEqual(summaryRecord.contentBoundary?.missingGroups, [], 'an explicitly titled summary may omit repeated detailed equations');
  fs.rmSync(summaryPath);

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

  const linkedTargetDir = path.join(tempDir, 'linked-target');
  const linkedInputDir = path.join(tempDir, 'linked-input');
  const linkedEntry = path.join(linkedInputDir, 'linked-outside');
  fs.mkdirSync(linkedTargetDir, { recursive: true });
  fs.mkdirSync(linkedInputDir, { recursive: true });
  fs.writeFileSync(path.join(linkedTargetDir, 'outside.html'), '<div>文件狀態：正式附件</div>', 'utf8');
  fs.writeFileSync(path.join(linkedInputDir, 'case.json'), JSON.stringify({
    tool: { name: '矩形建物 MWFRS', version: 'v1' },
    project: { no: 'PKG-001' },
    calculationFingerprint: 'CF-1234ABCD5678EF90',
    savedAt: '2026/07/20 16:00:00',
  }), 'utf8');
  fs.symlinkSync(linkedTargetDir, linkedEntry, process.platform === 'win32' ? 'junction' : 'dir');
  const linkedCollection = Checker.collectAttachmentFiles(linkedInputDir, '');
  assert.deepEqual(linkedCollection.files.map(file => path.basename(file)), ['case.json']);
  assert.deepEqual(linkedCollection.unsafeSourceEntries.map(file => path.basename(file)), ['linked-outside']);
  const linkedPackage = Checker.checkPackage(linkedInputDir, { projectNo: 'PKG-001' });
  assert.equal(linkedPackage.status, 'blocked', 'source junction must block automatic packaging');
  assert.deepEqual(linkedPackage.unsafeSourceEntries, ['linked-outside']);
  assert(linkedPackage.issues.some(issue => issue.code === 'unsafe-source-entry'));
  const linkedCli = spawnSync(process.execPath, [path.join(__dirname, 'attachment-package-check.js'), '--input', linkedInputDir, '--project-no', 'PKG-001'], { encoding: 'utf8' });
  assert.equal(linkedCli.status, 2, linkedCli.stderr || linkedCli.stdout);
  assert.match(linkedCli.stdout, /已阻擋 1 個來源符號連結/);
  assert.throws(() => Checker.checkPackage(linkedEntry), /資料夾本身不得是符號連結或 junction/);

  const changingFile = path.join(tempDir, 'changing-during-inspection.html');
  fs.writeFileSync(changingFile, '<div>文件狀態：正式附件</div><div>產出工具：測試工具</div><div>工具版本：v1</div><div>輸出時間：2026/07/22 01:00:00</div><div>計算指紋：CF-1234ABCD5678EF90</div>', 'utf8');
  const originalReadFileSync = fs.readFileSync;
  let changingFileReadCount = 0;
  fs.readFileSync = function patchedReadFileSync(filePath, ...args) {
    const value = originalReadFileSync.call(fs, filePath, ...args);
    if (path.resolve(String(filePath)) === path.resolve(changingFile) && ++changingFileReadCount === 2) {
      fs.appendFileSync(changingFile, '\nchanged-during-inspection', 'utf8');
    }
    return value;
  };
  let changingRecord;
  try {
    changingRecord = Checker.inspectAttachment(changingFile, tempDir);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
  assert(changingRecord.errors.some(message => message.includes('內容檢查期間發生變更')), 'inspection must reject a file changed while metadata is being read');
  fs.rmSync(changingFile);

  const fixtureDir = path.join(tempDir, 'fixture');
  fs.mkdirSync(path.join(fixtureDir, 'word'), { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, 'xl', 'worksheets'), { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, 'word', 'document.xml'), '<w:document><w:p><w:t>計畫名稱：測試大樓</w:t></w:p><w:p><w:t>計畫編號：PKG-001</w:t></w:p></w:document>', 'utf8');
  fs.writeFileSync(path.join(fixtureDir, 'word', 'footer1.xml'), '<w:ftr><w:p><w:t>文件狀態：正式附件</w:t></w:p><w:p><w:t>核可時間：2026/07/21 21:05:00</w:t></w:p><w:p><w:t>產出工具：錨栓檢討工具</w:t></w:p><w:p><w:t>工具版本：v1</w:t></w:p><w:p><w:t>輸出時間：2026/07/21 21:00:00</w:t></w:p><w:p><w:t>計算指紋：CF-1234ABCD5678EF90</w:t></w:p></w:ftr>', 'utf8');
  fs.writeFileSync(path.join(fixtureDir, 'xl', 'sharedStrings.xml'), '<sst><si><t>文件狀態</t></si><si><t>正式附件</t></si><si><t>核可時間</t></si><si><t>2026/07/21 21:05:00</t></si><si><t>計畫名稱</t></si><si><t>測試大樓</t></si><si><t>計畫編號</t></si><si><t>PKG-001</t></si><si><t>產出工具</t></si><si><t>錨栓檢討工具</t></si><si><t>工具版本</t></si><si><t>v1</t></si><si><t>輸出時間</t></si><si><t>2026/07/21 21:00:00</t></si><si><t>計算指紋</t></si><si><t>CF-1234ABCD5678EF90</t></si></sst>', 'utf8');
  const xlsxMetadataCells = Array.from({ length: 16 }, (_, index) => `<c t="s"><v>${index}</v></c>`).join('');
  fs.writeFileSync(path.join(fixtureDir, 'xl', 'worksheets', 'sheet1.xml'), `<worksheet><sheetData><row>${xlsxMetadataCells}</row></sheetData></worksheet>`, 'utf8');
  for (const [archive, source] of [['sample.docx', 'word'], ['sample.xlsx', 'xl']]) {
    const result = spawnSync('tar', ['-a', '-cf', path.join(tempDir, archive), '-C', fixtureDir, source], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${archive} fixture archive`);
  }
  const docxRecord = Checker.inspectAttachment(path.join(tempDir, 'sample.docx'), tempDir);
  const xlsxRecord = Checker.inspectAttachment(path.join(tempDir, 'sample.xlsx'), tempDir);
  assert.deepEqual(docxRecord.errors, []);
  assert.equal(docxRecord.sourceSha256, Checker.sha256File(path.join(tempDir, 'sample.docx')));
  assert.equal(docxRecord.projectNo, 'PKG-001');
  assert.equal(docxRecord.sourceTool, '錨栓檢討工具');
  assert.equal(docxRecord.toolVersion, 'v1');
  assert.equal(docxRecord.outputTime, '2026/07/21 21:00:00');
  assert.equal(docxRecord.approvalTime, '2026/07/21 21:05:00');
  assert.deepEqual(docxRecord.readyDocumentNeedles, ['文件狀態：正式附件']);
  assert.deepEqual(docxRecord.fingerprints, ['CF-1234ABCD5678EF90']);
  assert.deepEqual(xlsxRecord.errors, []);
  assert.equal(xlsxRecord.sourceSha256, Checker.sha256File(path.join(tempDir, 'sample.xlsx')));
  assert.equal(xlsxRecord.projectNo, 'PKG-001');
  assert.equal(xlsxRecord.sourceTool, '錨栓檢討工具');
  assert.equal(xlsxRecord.toolVersion, 'v1');
  assert.equal(xlsxRecord.outputTime, '2026/07/21 21:00:00');
  assert.equal(xlsxRecord.approvalTime, '2026/07/21 21:05:00');
  assert.deepEqual(xlsxRecord.readyDocumentNeedles, ['文件狀態：正式附件']);
  assert.deepEqual(xlsxRecord.fingerprints, ['CF-1234ABCD5678EF90']);

  const hiddenDocxRoot = path.join(tempDir, 'hidden-docx-root');
  fs.mkdirSync(path.join(hiddenDocxRoot, 'word'), { recursive: true });
  fs.writeFileSync(path.join(hiddenDocxRoot, 'word', 'document.xml'), `<w:document>
    <w:p><w:r><w:t>RC 梁設計計算書</w:t></w:r></w:p>
    <w:p><w:r><w:t>文件狀態：正式附件 核可時間：2026/07/21 21:05:00 產出工具：RC 梁 工具版本：v3.1 輸出時間：2026/07/21 21:00:00 計算指紋：CF-1234ABCD5678EF90</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>採用輸入：fc'=280 kgf/cm²；Mu=12.5 tf·m。計算內容：Mu=12.5 tf·m；φMn=18.2 tf·m。檢核結論：DCR=0.69；通過。</w:t></w:r></w:p>
  </w:document>`, 'utf8');
  const hiddenDocxPath = path.join(tempDir, 'hidden-content.docx');
  const hiddenDocxArchive = spawnSync('tar', ['-a', '-cf', hiddenDocxPath, '-C', hiddenDocxRoot, 'word'], { encoding: 'utf8' });
  assert.equal(hiddenDocxArchive.status, 0, hiddenDocxArchive.stderr || 'hidden DOCX fixture archive');
  const hiddenDocxRecord = Checker.inspectAttachment(hiddenDocxPath, tempDir);
  assert.deepEqual(hiddenDocxRecord.errors, []);
  assert.deepEqual(
    hiddenDocxRecord.contentBoundary?.missingGroups,
    ['adoptedInputs', 'calculationProcess', 'engineeringResult', 'engineeringValues'],
    'w:vanish text cannot satisfy DOCX calculation content',
  );

  const missingCellReferenceIssues = [];
  const missingCellReferenceText = Checker.extractVisibleWorksheetText('<worksheet><cols><col min="2" max="2" hidden="1"/></cols><sheetData><row><c t="s"><v>0</v></c></row></sheetData></worksheet>', ['不可判讀'], { visibilityIssues: missingCellReferenceIssues });
  assert.equal(missingCellReferenceText, '', 'a cell without r cannot be classified as visible when hidden columns exist');
  assert.deepEqual(
    missingCellReferenceIssues,
    ['工作表含隱藏欄，但儲存格缺少可判讀的 r 參照'],
    'missing cell references force XLSX visibility review instead of silently accepting hidden-column content',
  );
  const hiddenXlsxRoot = path.join(tempDir, 'hidden-xlsx-root');
  fs.mkdirSync(path.join(hiddenXlsxRoot, 'xl', '_rels'), { recursive: true });
  fs.mkdirSync(path.join(hiddenXlsxRoot, 'xl', 'worksheets'), { recursive: true });
  const hiddenXlsxStrings = [
    'RC 梁設計計算書', '文件狀態：正式附件', '核可時間：2026/07/21 21:05:00', '產出工具：RC 梁',
    '工具版本：v3.1', '輸出時間：2026/07/21 21:00:00', '計算指紋：CF-1234ABCD5678EF90',
    "採用輸入：fc'=280 kgf/cm²；Mu=12.5 tf·m。計算內容：Mu=12.5 tf·m；φMn=18.2 tf·m。檢核結論：DCR=0.69；通過。",
  ];
  fs.writeFileSync(path.join(hiddenXlsxRoot, 'xl', 'sharedStrings.xml'), `<sst>${hiddenXlsxStrings.map(item => `<si><t>${item}</t></si>`).join('')}</sst>`, 'utf8');
  fs.writeFileSync(path.join(hiddenXlsxRoot, 'xl', 'workbook.xml'), '<workbook><sheets><sheet name="Visible" sheetId="1" r:id="rId1"/><sheet name="Hidden" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>', 'utf8');
  fs.writeFileSync(path.join(hiddenXlsxRoot, 'xl', '_rels', 'workbook.xml.rels'), '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>', 'utf8');
  fs.writeFileSync(path.join(hiddenXlsxRoot, 'xl', 'worksheets', 'sheet1.xml'), `<worksheet><cols><col min="2" max="2" hidden="1"/></cols><sheetData>
    ${Array.from({ length: 7 }, (_, index) => `<row r="${index + 1}"><c r="A${index + 1}" t="s"><v>${index}</v></c></row>`).join('')}
    <row r="8" hidden="1"><c r="A8" t="s"><v>7</v></c></row>
    <row r="9"><c r="B9" t="s"><v>7</v></c></row>
  </sheetData></worksheet>`, 'utf8');
  fs.writeFileSync(path.join(hiddenXlsxRoot, 'xl', 'worksheets', 'sheet2.xml'), '<worksheet><sheetData><row><c t="s"><v>7</v></c></row></sheetData></worksheet>', 'utf8');
  const hiddenXlsxPath = path.join(tempDir, 'hidden-content.xlsx');
  const hiddenXlsxArchive = spawnSync('tar', ['-a', '-cf', hiddenXlsxPath, '-C', hiddenXlsxRoot, 'xl'], { encoding: 'utf8' });
  assert.equal(hiddenXlsxArchive.status, 0, hiddenXlsxArchive.stderr || 'hidden XLSX fixture archive');
  const hiddenXlsxRecord = Checker.inspectAttachment(hiddenXlsxPath, tempDir);
  assert.deepEqual(hiddenXlsxRecord.errors, []);
  assert.equal(hiddenXlsxRecord.visibilityEvidence?.status, 'bounded', 'cells with valid r references make hidden columns deterministic');
  assert.deepEqual(
    hiddenXlsxRecord.contentBoundary?.missingGroups,
    ['adoptedInputs', 'calculationProcess', 'engineeringResult', 'engineeringValues'],
    'hidden worksheet, hidden row and hidden column text cannot satisfy XLSX calculation content',
  );
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
const preflightPath = path.resolve(__dirname, '..', '..', 'preflight-tools.ps1');
const preflightSource = fs.readFileSync(preflightPath, 'utf8');
const attachmentCommandStart = preflightSource.indexOf('$attachmentPackageCheckCommandLines');
const attachmentCommandEnd = preflightSource.indexOf('$attachmentPackageBuildCommand', attachmentCommandStart);
assert.ok(attachmentCommandStart >= 0 && attachmentCommandEnd > attachmentCommandStart, 'attachment preflight command region exists');
const attachmentCommandRegion = preflightSource.slice(attachmentCommandStart, attachmentCommandEnd);
assert.ok(attachmentCommandRegion.indexOf('attachment-package-check.test.js') < attachmentCommandRegion.indexOf('attachment-canonical-render-e2e.test.js'), 'attachment unit runs before browser E2E');
assert.match(attachmentCommandRegion, /if \(-not \$Quick -and -not \$CI\)/, 'quick and CI retain the unit gate while skipping only browser E2E');
const attachmentKeyStart = preflightSource.indexOf('key = "attachment-package-check"');
const attachmentKeyEnd = preflightSource.indexOf('key = "attachment-package-build"', attachmentKeyStart);
const attachmentKeyRegion = preflightSource.slice(attachmentKeyStart, attachmentKeyEnd);
assert.match(attachmentKeyRegion, /slow\s*=\s*\$false/, 'attachment-package-check key remains in quick and CI preflight');


console.log('attachment package check OK');
