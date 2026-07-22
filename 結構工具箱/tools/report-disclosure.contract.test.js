const fs = require('fs');
const path = require('path');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

let failed = 0;

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function assert(pass, label, detail = '') {
  if (!pass) {
    failed += 1;
    console.error(`FAIL | ${label} :: ${detail}`);
  } else {
    console.log(`PASS | ${label} | ${detail}`);
  }
}

function assertString(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0, label, value);
}

function assertStringArray(value, label) {
  assert(Array.isArray(value) && value.length > 0, label, Array.isArray(value) ? `count=${value.length}` : typeof value);
  if (!Array.isArray(value)) return;
  value.forEach((item, index) => assertString(item, `${label}[${index}]`));
}

function isSelectorOnly(value) {
  return /^[#.][A-Za-z0-9_-]+$/.test(String(value || '').trim());
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertPrintHidesSelectors(text, selectors, label) {
  selectors.forEach(selector => {
    const pattern = new RegExp(`@media\\s+print[\\s\\S]*${escapeRegex(selector)}[\\s\\S]*display:\\s*none\\s*!important`);
    assert(pattern.test(text), `${label} print hides ${selector}`, selector);
  });
}

const contractRelativePath = '結構工具箱/tools/report-disclosure.contract.test.js';
const calculationBookBoundaryRelativePath = '結構工具箱/tools/calculation-book-content-boundary.json';
const calculationBookBoundary = readJson(repoFile(calculationBookBoundaryRelativePath));
const catalogs = [
  {
    family: 'formal-traceability',
    path: '結構工具箱/tools/formal-traceability.catalog.json',
    minTraces: 17,
  },
  {
    family: 'rc-traceability',
    path: '鋼筋混凝土/tools/rc-traceability.catalog.json',
    minTraces: 26,
  },
  {
    family: 'steel-traceability',
    path: '鋼構工具/steel-traceability.catalog.json',
    minTraces: 11,
  },
  {
    family: 'anchor-traceability',
    path: '螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json',
    minTraces: 12,
  },
  {
    family: 'stone-traceability',
    path: '石材固定/stone-traceability.catalog.json',
    minTraces: 8,
  },
  {
    family: 'decking-traceability',
    path: '覆工板/decking-traceability.catalog.json',
    minTraces: 8,
  },
  {
    family: 'excavation-traceability',
    path: '開挖擋土支撐/excavation-traceability.catalog.json',
    minTraces: 10,
  },
];

const sourcePattern = /規範|條文|章|節|表|圖|式|ACI|AISC|CNS|JASS|ETA|ICC|AASHTO|ASD|LRFD|設計依據|公式來源|專案文件|風洞|地工報告|分析模型|評估報告|工程判讀|治理|schema|流程|工作流|設計假設|邊界|資料來源/;
const manualPattern = /人工複核|人工確認|人工判斷|設計者|審查者|使用者|專案負責人|施工圖|專案文件|模型|圖說|正式手算|外部分析|地工報告|試樁|材料資料|產品文件|風洞|設備資料|確認|複核|控管|送審/;
const reportLandingPattern = /[\u4e00-\u9fff]|報告|計算書|檢核|摘要|表|圖|輸出|列印|PDF|DOCX|Word|JSON|下載|落點|結論|採用|控制|欄位|標籤|名稱|說明|路線|status|summary|matrix|report|latest|Cache-Control|Omega|DCR|OK|NG|KL|Fa|Fbx|Fby|SBE|HSS|SMRF|P-M/;
const boundaryPattern = /人工複核|人工確認|人工判斷|待確認|不列為 OK|不提供正式|初步|初篩|簡化|專案文件|施工圖|專案模型|圖說|地工報告|外部分析|風洞|評估報告|產品文件|正式手算|適用範圍|邊界|超出|另行|服務|下載|簽章|確認|複核|判讀|控管|責任/;
const forbiddenAuthorityWording = ['工具內建', '工具建議', '專業版'];
const boundaryCategories = calculationBookBoundary.forbiddenCategories || {};
const pageOnlyReportStatusNeedles = boundaryCategories.pageReadingStatus || [];
const calculationBookUiOnlyNeedles = boundaryCategories.interfaceAndWorkflow || [];
const calculationBookGovernanceOnlyNeedles = boundaryCategories.governanceNarrative || [];
const calculationBookForbiddenNeedles = [...new Set(Object.values(boundaryCategories).flat())];
const formalReportRendererFiles = [
  '結構工具箱/core/ui/report.js',
  '結構工具箱/core/wind-report.js',
  '鋼筋混凝土/shared/report.js',
  '鋼構工具/core/ui/report.js',
  '螺栓檢討/bolt-review-tool/src/reportExport.ts',
  '螺栓檢討/bolt-review-tool/src/reportDocx.ts',
  '螺栓檢討/bolt-review-tool/src/reportWorkbook.ts',
  '覆工板/report/gen_report.py',
  '開挖擋土支撐/backend/app/reporting.py',
];

let totalTraces = 0;
let totalHumanReportEntries = 0;
const allTraceIds = new Set();

for (const catalogSpec of catalogs) {
  const catalog = readJson(repoFile(catalogSpec.path));
  assert(catalog.family === catalogSpec.family, `${catalogSpec.family} catalog family`, catalog.family);
  assert(Array.isArray(catalog.tools) && catalog.tools.length > 0, `${catalogSpec.family} tools populated`, `tools=${catalog.tools?.length || 0}`);

  let familyTraceCount = 0;
  const familyReportText = [];
  const familyManualText = [];
  const familyCombinedText = [];

  for (const tool of catalog.tools || []) {
    assertString(tool.key, `${catalogSpec.family} tool key`);
    assertString(tool.scope || tool.label, `${catalogSpec.family} ${tool.key} scope or label`);
    assert(Array.isArray(tool.traces) && tool.traces.length > 0, `${catalogSpec.family} ${tool.key} traces populated`, `traces=${tool.traces?.length || 0}`);

    for (const trace of tool.traces || []) {
      familyTraceCount += 1;
      totalTraces += 1;
      const traceLabel = `${catalogSpec.family}:${tool.key}:${trace.id || 'missing-id'}`;
      assertString(trace.id, `${traceLabel} id`);
      assert(!allTraceIds.has(`${catalogSpec.family}:${trace.id}`), `${traceLabel} unique family trace id`, trace.id);
      allTraceIds.add(`${catalogSpec.family}:${trace.id}`);
      assertString(trace.clause, `${traceLabel} clause`);
      assert(sourcePattern.test(trace.clause), `${traceLabel} clause names source basis`, trace.clause);
      assertString(trace.purpose, `${traceLabel} purpose`);
      assertStringArray(trace.report, `${traceLabel} report`);
      assertStringArray(trace.manualReview, `${traceLabel} manualReview`);

      const reportText = (trace.report || []).join(' / ');
      const manualText = (trace.manualReview || []).join(' / ');
      const combinedText = [trace.clause, trace.purpose, reportText, manualText].join(' / ');
      const humanReportEntries = (trace.report || []).filter(item => !isSelectorOnly(item));
      totalHumanReportEntries += humanReportEntries.length;

      assert(humanReportEntries.length > 0, `${traceLabel} report has human-readable landing`, reportText);
      assert(reportLandingPattern.test(reportText), `${traceLabel} report names output landing`, reportText);
      assert(manualPattern.test(manualText), `${traceLabel} manual review ownership`, manualText);
      assert(boundaryPattern.test(combinedText), `${traceLabel} disclosure boundary`, combinedText);
      for (const forbidden of forbiddenAuthorityWording) {
        assert(!combinedText.includes(forbidden), `${traceLabel} avoids tool-authority wording`, forbidden);
      }

      familyReportText.push(reportText);
      familyManualText.push(manualText);
      familyCombinedText.push(combinedText);
    }
  }

  assert(familyTraceCount >= catalogSpec.minTraces, `${catalogSpec.family} trace volume`, `traces=${familyTraceCount}`);
  assert(reportLandingPattern.test(familyReportText.join(' / ')), `${catalogSpec.family} report disclosure aggregate`, catalogSpec.path);
  assert(manualPattern.test(familyManualText.join(' / ')), `${catalogSpec.family} manual review aggregate`, catalogSpec.path);
  assert(boundaryPattern.test(familyCombinedText.join(' / ')), `${catalogSpec.family} boundary disclosure aggregate`, catalogSpec.path);
}

assert(totalTraces >= 92, 'cross-family report disclosure trace volume', `traces=${totalTraces}`);
assert(totalHumanReportEntries >= totalTraces, 'cross-family human report landing volume', `humanReportEntries=${totalHumanReportEntries}`);

const preflight = readText(repoFile('preflight-tools.ps1'));
[
  'report-disclosure-contract',
  'node 結構工具箱/tools/report-disclosure.contract.test.js',
  'Cross-family report disclosure contract',
  'python server_smoke_test.py',
  'node 石材固定/stone-report.contract.test.js',
  'node 鋼構工具/steel-formal.regression-test.js',
  'node 螺栓檢討/anchor-report.contract.test.js',
  'node 開挖擋土支撐/excavation-report.contract.test.js',
  'RC column report boundary contract',
  'test-column.ps1',
  'RC shear wall report boundary contract',
  'test-shear-wall-report.ps1',
].forEach(needle => assert(preflight.includes(needle), 'platform preflight runs report disclosure contract', needle));

const readme = readText(repoFile('README.md'));
const boundaries = readText(repoFile('TOOL_BOUNDARIES.md'));
const staging = readText(repoFile('STAGING_GROUPS.md'));
const reportGuide = readText(repoFile('TOOL_REPORT_GUIDE.md'));
const contextDoc = readText(repoFile('CONTEXT.md'));
const pageOnlyReportReadinessAdr = readText(repoFile('docs/adr/0001-page-only-report-readiness.md'));
const calculationBookContentAdr = readText(repoFile('docs/adr/0003-calculation-book-content-boundary.md'));
const formalManifest = readJson(repoFile('結構工具箱/tools/formal-tools.manifest.json'));
const formalToolsContract = readText(repoFile('結構工具箱/tools/formal-tools.contract.test.js'));
const localQuickToolsContract = readText(repoFile('結構工具箱/tools/local-quick-tools.contract.test.js'));
const localQuickBrowserSmoke = readText(repoFile('結構工具箱/tools/local-quick-browser-smoke.test.js'));
const attachmentPackageCheck = readText(repoFile('結構工具箱/tools/attachment-package-check.js'));
const renderedDeliveryEvidence = readText(repoFile('結構工具箱/tools/rendered-delivery-evidence.js'));
const deckingToolsContract = readText(repoFile('decking-tools.contract.test.js'));
const frameAnalysisContract = readText(repoFile('frame-analysis.contract.test.js'));
const sectionToolsContract = readText(repoFile('section-tools.contract.test.js'));
const sharedCalculationReport = readText(repoFile('結構工具箱/core/ui/report.js'));
const rcSharedCalculationReport = readText(repoFile('鋼筋混凝土/shared/report.js'));
const rcSharedStyle = readText(repoFile('鋼筋混凝土/shared/style.css'));
const rcBeamHtml = readText(repoFile('鋼筋混凝土/tools/beam.html'));
const rcFoundationHtml = readText(repoFile('鋼筋混凝土/tools/foundation.html'));
const rcShearWallHtml = readText(repoFile('鋼筋混凝土/tools/shear-wall.html'));
const rcWallHtml = readText(repoFile('鋼筋混凝土/tools/wall.html'));
const rcSlabHtml = readText(repoFile('鋼筋混凝土/tools/slab.html'));
const rcSinglePileHtml = readText(repoFile('鋼筋混凝土/tools/single-pile-designer.html'));
const rcTestBeamScript = readText(repoFile('鋼筋混凝土/tools/test-beam.ps1'));
const rcBeamReportVisualTest = readText(repoFile('鋼筋混凝土/tools/beam-report-visual.test.js'));
const rcReportScreenshotQualityHelper = readText(repoFile('鋼筋混凝土/tools/report-screenshot-quality.js'));
const rcTestColumnScript = readText(repoFile('鋼筋混凝土/tools/test-column.ps1'));
const rcColumnReportVisualTest = readText(repoFile('鋼筋混凝土/tools/column-report-visual.test.js'));
const rcTestSlabScript = readText(repoFile('鋼筋混凝土/tools/test-slab.ps1'));
const rcSlabReportVisualTest = readText(repoFile('鋼筋混凝土/tools/slab-report-visual.test.js'));
const rcTestWallScript = readText(repoFile('鋼筋混凝土/tools/test-wall.ps1'));
const rcWallReportVisualTest = readText(repoFile('鋼筋混凝土/tools/wall-report-visual.test.js'));
const rcTestFoundationScript = readText(repoFile('鋼筋混凝土/tools/test-foundation.ps1'));
const rcFoundationReportVisualTest = readText(repoFile('鋼筋混凝土/tools/foundation-report-visual.test.js'));
const rcTestShearWallReportScript = readText(repoFile('鋼筋混凝土/tools/test-shear-wall-report.ps1'));
const rcShearWallReportVisualTest = readText(repoFile('鋼筋混凝土/tools/shear-wall-report-visual.test.js'));
const rcTestSinglePileScript = readText(repoFile('鋼筋混凝土/tools/test-single-pile.ps1'));
const rcSinglePileReportVisualTest = readText(repoFile('鋼筋混凝土/tools/single-pile-report-visual.test.js'));
const stoneServer = readText(repoFile('石材固定/server.py'));
const stoneServerSmoke = readText(repoFile('石材固定/server_smoke_test.py'));
const stoneReportContract = readText(repoFile('石材固定/stone-report.contract.test.js'));
const deckingReportContract = readText(repoFile('覆工板/decking-report.contract.test.js'));
const steelFormalRegressionTest = readText(repoFile('鋼構工具/steel-formal.regression-test.js'));
const steelBrowserRunner = readText(repoFile('鋼構工具/steel-audit-browser-runner.js'));
const steelFormalStyles = readText(repoFile('鋼構工具/styles.css'));
const anchorReportExportTest = readText(repoFile('螺栓檢討/bolt-review-tool/src/reportExport.test.ts'));
const anchorReportDocxTest = readText(repoFile('螺栓檢討/bolt-review-tool/src/reportDocx.test.ts'));
const anchorReportWorkbookTest = readText(repoFile('螺栓檢討/bolt-review-tool/src/reportWorkbook.test.ts'));
const anchorReportArtifactsTest = readText(repoFile('螺栓檢討/bolt-review-tool/tests/reportArtifacts.test.ts'));
const anchorAttachmentReadinessTest = readText(repoFile('螺栓檢討/bolt-review-tool/src/attachmentReadiness.test.ts'));
const anchorReportDocumentState = readText(repoFile('螺栓檢討/bolt-review-tool/src/reportDocumentState.ts'));
const excavationReportingTest = readText(repoFile('開挖擋土支撐/backend/tests/test_reporting.py'));
const excavationReleaseArtifacts = readText(repoFile('開挖擋土支撐/backend/tests/release_report_artifacts.py'));

[
  readme,
  boundaries,
  staging,
  reportGuide,
].forEach((docText, index) => {
  const label = ['README', 'TOOL_BOUNDARIES', 'STAGING_GROUPS', 'TOOL_REPORT_GUIDE'][index];
  assert(docText.includes(contractRelativePath), `${label} documents report disclosure contract`, contractRelativePath);
  assert(docText.includes('report-disclosure-contract'), `${label} documents report disclosure preflight key`, 'report-disclosure-contract');
  assert(docText.includes(calculationBookBoundaryRelativePath), `${label} documents the shared calculation-book content boundary`, calculationBookBoundaryRelativePath);
});

assert(reportGuide.includes('規範判定') && reportGuide.includes('初估 / 簡化') && reportGuide.includes('人工複核'), 'TOOL_REPORT_GUIDE keeps report disclosure vocabulary', '規範判定 / 初估 / 簡化 / 人工複核');
assert(
  contextDoc.includes('頁面專用閱讀狀態') && contextDoc.includes('列印與 PDF 匯出時應排除'),
  'CONTEXT defines page-only report readiness boundary',
  '頁面專用閱讀狀態',
);
assert(
  pageOnlyReportReadinessAdr.includes('must not be copied into calculation books') &&
    pageOnlyReportReadinessAdr.includes('Engineering status and document identity are independent') &&
    pageOnlyReportReadinessAdr.includes('文件狀態：內部審閱') &&
    pageOnlyReportReadinessAdr.includes('文件狀態：正式附件'),
  'ADR records page-only diagnostics and calculation-book document-state decision',
  'docs/adr/0001-page-only-report-readiness.md',
);
assert(
  calculationBookContentAdr.includes('calculation-first') &&
    calculationBookContentAdr.includes('Input-mode guidance') &&
    calculationBookContentAdr.includes('calculation content precedes the conclusion') &&
    calculationBookContentAdr.includes(calculationBookBoundaryRelativePath) &&
    calculationBookContentAdr.includes('code-coverage matrices'),
  'ADR records the calculation-book content boundary',
  'docs/adr/0003-calculation-book-content-boundary.md',
);
assert(
  reportGuide.includes('頁面專用閱讀狀態') &&
    reportGuide.includes('CONTEXT.md') &&
    reportGuide.includes('docs/adr/0001-page-only-report-readiness.md') &&
    reportGuide.includes('Word / DOCX') &&
    reportGuide.includes('workbook'),
  'TOOL_REPORT_GUIDE links page-only readiness glossary, ADR, and delivery boundaries',
  '頁面專用閱讀狀態 / Word / DOCX / workbook',
);
assert(calculationBookBoundary.version === '1.1.0', 'calculation-book boundary carries a versioned shared contract', calculationBookBoundary.version);
assert(calculationBookBoundary.scope === 'all-calculation-book-and-formal-attachment-outputs', 'calculation-book boundary covers every attachment output', calculationBookBoundary.scope);
['pageReadingStatus', 'interfaceAndWorkflow', 'governanceNarrative'].forEach(category => {
  assertStringArray(boundaryCategories[category], `calculation-book boundary ${category}`);
});
assert(
  calculationBookForbiddenNeedles.length === Object.values(boundaryCategories).flat().length,
  'calculation-book boundary forbidden needles are unique',
  `needles=${calculationBookForbiddenNeedles.length}`,
);
assertStringArray(calculationBookBoundary.requiredCalculationContent, 'calculation-book boundary required calculation content');
const calculationContentGroups = calculationBookBoundary.requiredContentGroups;
const calculationContentProfiles = calculationBookBoundary.validationProfiles;
assert(calculationContentGroups && typeof calculationContentGroups === 'object', 'calculation-book boundary defines machine-verifiable positive content groups', 'requiredContentGroups');
['adoptedInputs', 'calculationProcess', 'engineeringResult', 'traceability'].forEach(groupKey => {
  const group = calculationContentGroups[groupKey];
  assert(group && typeof group.description === 'string' && group.description.trim(), `calculation-book content group ${groupKey} has a description`, groupKey);
  const needles = [...(group.anyOf || []), ...(group.allOf || [])];
  assertStringArray(needles, `calculation-book content group ${groupKey} matchers`);
  assert(needles.length === new Set(needles).size, `calculation-book content group ${groupKey} matchers are unique`, groupKey);
});
assert(calculationContentProfiles && typeof calculationContentProfiles === 'object', 'calculation-book boundary defines validation profiles', 'validationProfiles');
['calculation-book', 'traceable-calculation-book', 'traceable-calculation-summary', 'compiled-engineering-report', 'direct-print-boundary'].forEach(profileKey => {
  const groups = calculationContentProfiles[profileKey];
  assert(Array.isArray(groups), `calculation-book validation profile ${profileKey} is an array`, profileKey);
  assert(groups.length === new Set(groups).size, `calculation-book validation profile ${profileKey} has unique groups`, profileKey);
  groups.forEach(groupKey => assert(calculationContentGroups[groupKey], `calculation-book validation profile ${profileKey} references a known group`, groupKey));
});
assert(
  calculationContentProfiles['traceable-calculation-book'].includes('traceability') &&
    calculationContentProfiles['direct-print-boundary'].length === 0,
  'calculation-book profiles require traceability where supported and exempt direct-print notices',
  'traceable-calculation-book / direct-print-boundary',
);
assert(
  Array.isArray(calculationBookBoundary.allowedDocumentStates) &&
    calculationBookBoundary.allowedDocumentStates.includes('文件狀態：內部審閱') &&
    calculationBookBoundary.allowedDocumentStates.includes('文件狀態：正式附件'),
  'calculation-book boundary keeps printable internal review and formal attachment identities',
  '內部審閱 / 正式附件',
);
assert(Array.isArray(formalManifest.reportPageOnlyForbiddenNeedles) && formalManifest.reportPageOnlyForbiddenNeedles.length >= calculationBookForbiddenNeedles.length, 'formal manifest carries calculation-book boundary needles', 'reportPageOnlyForbiddenNeedles');
for (const needle of calculationBookForbiddenNeedles) {
  assert(formalManifest.reportPageOnlyForbiddenNeedles.includes(needle), 'formal manifest page-only report boundary needle', needle);
}
assert(
  reportGuide.includes('正式計算書與 HTML 畫面分層') &&
    reportGuide.includes('docs/adr/0003-calculation-book-content-boundary.md') &&
    reportGuide.includes(calculationBookBoundaryRelativePath) &&
    [...calculationBookUiOnlyNeedles, ...calculationBookGovernanceOnlyNeedles].every(needle => reportGuide.includes(needle)),
  'TOOL_REPORT_GUIDE defines the calculation-first report boundary',
  '正式計算書與 HTML 畫面分層',
);
assert(
  sharedCalculationReport.includes('CALCULATION_BOOK_PAGE_ONLY_LABELS') &&
    sharedCalculationReport.includes('getCalculationBookInputGroups') &&
    !sharedCalculationReport.includes('const highlightsHtml') &&
    !sharedCalculationReport.includes('const summaryFactsHtml') &&
    sharedCalculationReport.indexOf('${inputsHtml}') < sharedCalculationReport.indexOf('${checksHtml}') &&
    sharedCalculationReport.indexOf('${checksHtml}') < sharedCalculationReport.indexOf('${stepsHtml}') &&
    sharedCalculationReport.indexOf('${stepsHtml}') < sharedCalculationReport.indexOf('${summaryHtml}'),
  'shared calculation report filters interface fields and places the conclusion last',
  'CALCULATION_BOOK_PAGE_ONLY_LABELS',
);
assert(
    rcSharedCalculationReport.includes('RC_CALCULATION_BOOK_PAGE_ONLY_LABELS') &&
    rcSharedCalculationReport.includes('getRcCalculationBookInputGroups') &&
    !rcSharedCalculationReport.includes('const notesHtml') &&
    !rcSharedCalculationReport.includes('const symHtml') &&
    !rcSharedCalculationReport.includes('const methodsHtml') &&
    !rcSharedCalculationReport.includes('const coverageHtml') &&
    !rcSharedCalculationReport.includes('methods: cfg.methods') &&
    !rcSharedCalculationReport.includes('coverage: cfg.coverage') &&
    !rcSharedCalculationReport.includes('.rep-method') &&
    !rcSharedCalculationReport.includes('.rep-coverage') &&
    rcSharedCalculationReport.indexOf('${inputsHtml}') < rcSharedCalculationReport.indexOf('${checksHtml}') &&
    rcSharedCalculationReport.indexOf('${checksHtml}') < rcSharedCalculationReport.indexOf('${stepsHtml}') &&
    rcSharedCalculationReport.indexOf('${stepsHtml}') < rcSharedCalculationReport.indexOf('${summaryHtml}'),
  'RC shared calculation report filters interface fields and places the conclusion after calculation content',
  'RC_CALCULATION_BOOK_PAGE_ONLY_LABELS',
);
[
  ['attachment package checker', attachmentPackageCheck],
  ['rendered PDF validator', renderedDeliveryEvidence],
  ['formal tools contract', formalToolsContract],
  ['local quick tools contract', localQuickToolsContract],
  ['local quick browser smoke', localQuickBrowserSmoke],
  ['decking runtime contract', deckingToolsContract],
  ['frame report contract', frameAnalysisContract],
  ['section report contract', sectionToolsContract],
  ['RC rendered PDF helper', rcReportScreenshotQualityHelper],
  ['stone export smoke', stoneServerSmoke],
  ['decking DOCX smoke', deckingReportContract],
  ['steel formal regression', steelFormalRegressionTest],
  ['steel browser runner', steelBrowserRunner],
  ['anchor HTML smoke', anchorReportExportTest],
  ['anchor DOCX smoke', anchorReportDocxTest],
  ['anchor workbook smoke', anchorReportWorkbookTest],
  ['anchor release artifact smoke', anchorReportArtifactsTest],
  ['excavation PDF / DOCX smoke', excavationReportingTest],
  ['excavation release artifacts', excavationReleaseArtifacts],
].forEach(([label, source]) => {
  assert(source.includes('calculation-book-content-boundary.json'), `${label} consumes the shared calculation-book boundary`, calculationBookBoundaryRelativePath);
});
assert(stoneServer.includes('PAGE_ONLY_REVIEW_STATUS_KEY_MARKERS'), 'stone export server keeps page-only review key markers', 'PAGE_ONLY_REVIEW_STATUS_KEY_MARKERS');
assert(stoneServer.includes('def _strip_page_only_review_status'), 'stone export server keeps page-only review status stripper', '_strip_page_only_review_status');
assert(stoneServerSmoke.includes('PAGE_ONLY_REPORT_STATUS_NEEDLES'), 'stone export smoke keeps page-only report needle list', 'PAGE_ONLY_REPORT_STATUS_NEEDLES');
assert(stoneServerSmoke.includes('priority_report_reading_status'), 'stone export smoke covers stripped priority report reading status payload', 'priority_report_reading_status');
assert(stoneServerSmoke.includes('報告閱讀狀態：暫勿作附件'), 'stone export smoke covers reason text cleanup', '報告閱讀狀態：暫勿作附件');
assert(stoneServerSmoke.includes("self.assertNotIn('priority_report_reading_status', report['review'])"), 'stone export smoke asserts stripped page-only review key', 'priority_report_reading_status');
assert(stoneServerSmoke.includes('for needle in PAGE_ONLY_REPORT_STATUS_NEEDLES:'), 'stone export smoke asserts report output excludes page-only wording', 'PAGE_ONLY_REPORT_STATUS_NEEDLES');
assert(stoneReportContract.includes('server_smoke_test.ServerSmokeTests.test_export_audit_records_summary_and_trace'), 'stone report contract covers export audit summary path', 'test_export_audit_records_summary_and_trace');
assert(stoneReportContract.includes('server_smoke_test.ServerSmokeTests.test_export_audit_strips_page_only_report_reading_status'), 'stone report contract covers stripped page-only review status path', 'test_export_audit_strips_page_only_report_reading_status');
assert(stoneReportContract.includes('Stone report contract checks passed.'), 'stone report contract reports success clearly', 'Stone report contract checks passed.');
assert(steelFormalRegressionTest.includes('pageOnlyReportStatusNeedles'), 'steel formal regression keeps page-only needle list', 'pageOnlyReportStatusNeedles');
assert(steelFormalRegressionTest.includes('openFormalReportPopup'), 'steel formal regression covers formal report popup export path', 'openFormalReportPopup');
assert(steelFormalRegressionTest.includes('優先建議報告閱讀狀態'), 'steel formal regression covers page-only readiness wording in popup assertions', '優先建議報告閱讀狀態');
assert(steelFormalRegressionTest.includes('不會寫入計算書或列印 PDF'), 'steel formal regression covers print/PDF boundary wording', '不會寫入計算書或列印 PDF');
assert(steelFormalRegressionTest.includes('FORMAL_PROJECT_META_PLACEHOLDER'), 'steel formal regression covers placeholder metadata export boundary fixtures', 'FORMAL_PROJECT_META_PLACEHOLDER');
assert(steelFormalRegressionTest.includes('assertFormalProjectMetaPlaceholderRendered'), 'steel formal regression covers placeholder project metadata rendering checks', 'assertFormalProjectMetaPlaceholderRendered');
assert(steelFormalRegressionTest.includes('calculationBookUiOnlyNeedles'), 'steel formal regression covers calculation-book UI-only wording', 'calculationBookUiOnlyNeedles');
assert(steelFormalRegressionTest.includes('should place the conclusion after calculation content'), 'steel formal regression verifies report content ordering', 'conclusion after calculation content');
assert(steelBrowserRunner.includes('CALCULATION_BOOK_UI_ONLY_NEEDLES'), 'steel browser runner rejects UI-only calculation-book wording', 'CALCULATION_BOOK_UI_ONLY_NEEDLES');
assert(steelBrowserRunner.includes("lastIndexOf('檢核結論')"), 'steel browser runner verifies the rendered conclusion is last', '檢核結論');
assertPrintHidesSelectors(steelFormalStyles, ['.page-only-report-status'], 'steel formal shared styles');
assert(anchorReportExportTest.includes('PAGE_ONLY_REPORT_STATUS_NEEDLES'), 'anchor report HTML smoke keeps page-only needle list', 'PAGE_ONLY_REPORT_STATUS_NEEDLES');
assert(anchorReportExportTest.includes('expectNoPageOnlyReportStatus(html)'), 'anchor report HTML smoke asserts standalone HTML excludes page-only wording', 'expectNoPageOnlyReportStatus(html)');
assert(anchorReportDocxTest.includes('PAGE_ONLY_REPORT_STATUS_NEEDLES'), 'anchor DOCX smoke keeps page-only needle list', 'PAGE_ONLY_REPORT_STATUS_NEEDLES');
assert(anchorReportDocxTest.includes('for (const needle of PAGE_ONLY_REPORT_STATUS_NEEDLES)'), 'anchor DOCX smoke asserts DOCX excludes page-only wording', 'PAGE_ONLY_REPORT_STATUS_NEEDLES');
assert(anchorReportWorkbookTest.includes('PAGE_ONLY_REPORT_STATUS_NEEDLES'), 'anchor workbook smoke keeps page-only needle list', 'PAGE_ONLY_REPORT_STATUS_NEEDLES');
assert(anchorReportDocumentState.includes("'formal-attachment' | 'internal-review'"), 'anchor report state exposes explicit attachment approval classes', 'formal-attachment');
assert(anchorReportDocumentState.includes("label: approved ? '正式附件' : '內部審閱'"), 'anchor report state uses explicit approval for document identity', '正式附件');
assert(anchorReportDocumentState.includes('核可時間'), 'anchor report state records approval time', '核可時間');
assert(anchorReportDocumentState.includes('文件身分只反映使用者是否已完成核可'), 'anchor report state separates engineering results from document approval', '文件身分只反映使用者是否已完成核可');
assert(anchorReportWorkbookTest.includes('for (const needle of PAGE_ONLY_REPORT_STATUS_NEEDLES)'), 'anchor workbook smoke asserts XLSX excludes page-only wording', 'PAGE_ONLY_REPORT_STATUS_NEEDLES');
assert(anchorAttachmentReadinessTest.includes("expect(model.notes.join('\\n')).toContain('不會寫入計算書或列印 PDF')"), 'anchor attachment readiness smoke keeps page-only boundary note', '不會寫入計算書或列印 PDF');
assert(excavationReportingTest.includes('PAGE_ONLY_REPORT_STATUS_NEEDLES'), 'excavation reporting smoke keeps page-only needle list', 'PAGE_ONLY_REPORT_STATUS_NEEDLES');
assert(excavationReportingTest.includes('test_word_report_excludes_page_only_status_overview'), 'excavation reporting smoke covers DOCX export boundary', 'test_word_report_excludes_page_only_status_overview');
assert(excavationReportingTest.includes('test_pdf_report_excludes_page_only_status_overview'), 'excavation reporting smoke covers PDF export boundary', 'test_pdf_report_excludes_page_only_status_overview');
assert(excavationReportingTest.includes('self.assertNotIn(needle, combined_text)'), 'excavation reporting smoke asserts DOCX excludes page-only wording', 'self.assertNotIn(needle, combined_text)');
assert(excavationReportingTest.includes('self.assertNotIn(needle, text)'), 'excavation reporting smoke asserts PDF excludes page-only wording', 'self.assertNotIn(needle, text)');
assert(rcTestBeamScript.includes('beam-report-visual.test.js'), 'RC beam wrapper runs report visual smoke', 'beam-report-visual.test.js');
assert(rcTestBeamScript.includes('Beam report visual smoke'), 'RC beam wrapper labels report visual smoke clearly', 'Beam report visual smoke');
assert(rcBeamReportVisualTest.includes('page attachment readiness boundary'), 'RC beam report visual smoke asserts page-only boundary text on page', 'page attachment readiness boundary');
assert(rcBeamReportVisualTest.includes('report excludes page-only attachment readiness'), 'RC beam report visual smoke asserts exported report excludes page-only wording', 'report excludes page-only attachment readiness');
assert(rcBeamReportVisualTest.includes('beamAttachmentReadinessCard'), 'RC beam report visual smoke targets attachment readiness outlet', 'beamAttachmentReadinessCard');
assert(rcBeamReportVisualTest.includes('assertReportScreenshotQuality(screenshotPath'), 'RC beam report visual smoke asserts screenshot dimensions and nonblank pixels', 'assertReportScreenshotQuality(screenshotPath');
assert(rcBeamReportVisualTest.includes('screenshotQuality'), 'RC beam report visual smoke records screenshot quality in audit payload', 'screenshotQuality');
assert(rcBeamReportVisualTest.includes('beam-report-visual-audit.json'), 'RC beam report visual smoke writes audit evidence', 'beam-report-visual-audit.json');
assert(rcReportScreenshotQualityHelper.includes('function readPngVisualQuality'), 'RC shared screenshot helper parses PNG pixels', 'function readPngVisualQuality');
assert(rcReportScreenshotQualityHelper.includes('nonWhitePixelCount'), 'RC shared screenshot helper records nonblank screenshot evidence', 'nonWhitePixelCount');
assert(rcReportScreenshotQualityHelper.includes('uniqueColorCount'), 'RC shared screenshot helper records color diversity', 'uniqueColorCount');
assert(rcTestColumnScript.includes('column-report-visual.test.js'), 'RC column wrapper runs report visual smoke', 'column-report-visual.test.js');
assert(rcTestColumnScript.includes('Column report visual smoke'), 'RC column wrapper labels report visual smoke clearly', 'Column report visual smoke');
assert(rcColumnReportVisualTest.includes('page attachment readiness boundary'), 'RC column report visual smoke asserts page-only boundary text on page', 'page attachment readiness boundary');
assert(rcColumnReportVisualTest.includes('report excludes page-only attachment readiness'), 'RC column report visual smoke asserts exported report excludes page-only wording', 'report excludes page-only attachment readiness');
assert(rcColumnReportVisualTest.includes('columnAttachmentReadiness'), 'RC column report visual smoke targets attachment readiness outlet', 'columnAttachmentReadiness');
assert(rcColumnReportVisualTest.includes('assertReportScreenshotQuality(screenshotPath'), 'RC column report visual smoke asserts screenshot dimensions and nonblank pixels', 'assertReportScreenshotQuality(screenshotPath');
assert(rcColumnReportVisualTest.includes('screenshotQuality'), 'RC column report visual smoke records screenshot quality in audit payload', 'screenshotQuality');
assert(rcColumnReportVisualTest.includes('column-report-visual-audit.json'), 'RC column report visual smoke writes audit evidence', 'column-report-visual-audit.json');
assert(rcTestSlabScript.includes('slab-report-visual.test.js'), 'RC slab wrapper runs report visual smoke', 'slab-report-visual.test.js');
assert(rcTestSlabScript.includes('Slab report visual smoke'), 'RC slab wrapper labels report visual smoke clearly', 'Slab report visual smoke');
assert(rcSlabReportVisualTest.includes('page attachment readiness boundary'), 'RC slab report visual smoke asserts page-only boundary text on page', 'page attachment readiness boundary');
assert(rcSlabReportVisualTest.includes('report excludes page-only review prompt'), 'RC slab report visual smoke asserts exported report excludes page-only wording', 'report excludes page-only review prompt');
assert(rcSlabReportVisualTest.includes('slabAttachmentReadinessCard'), 'RC slab report visual smoke targets attachment readiness outlet', 'slabAttachmentReadinessCard');
assert(rcSlabReportVisualTest.includes('assertReportScreenshotQuality(screenshotPath'), 'RC slab report visual smoke asserts screenshot dimensions and nonblank pixels', 'assertReportScreenshotQuality(screenshotPath');
assert(rcSlabReportVisualTest.includes('screenshotQuality'), 'RC slab report visual smoke records screenshot quality in audit payload', 'screenshotQuality');
assert(rcSlabReportVisualTest.includes('slab-report-visual-audit.json'), 'RC slab report visual smoke writes audit evidence', 'slab-report-visual-audit.json');
assert(rcTestWallScript.includes('wall-report-visual.test.js'), 'RC wall wrapper runs report visual smoke', 'wall-report-visual.test.js');
assert(rcTestWallScript.includes('Wall report visual smoke'), 'RC wall wrapper labels report visual smoke clearly', 'Wall report visual smoke');
assert(rcWallReportVisualTest.includes('page attachment readiness boundary'), 'RC wall report visual smoke asserts page-only boundary text on page', 'page attachment readiness boundary');
assert(rcWallReportVisualTest.includes('report excludes page-only status'), 'RC wall report visual smoke asserts exported report excludes page-only wording', 'report excludes page-only status');
assert(rcWallReportVisualTest.includes('wallAttachmentReadinessCard'), 'RC wall report visual smoke targets attachment readiness outlet', 'wallAttachmentReadinessCard');
assert(rcWallReportVisualTest.includes('assertReportScreenshotQuality(screenshotPath'), 'RC wall report visual smoke asserts screenshot dimensions and nonblank pixels', 'assertReportScreenshotQuality(screenshotPath');
assert(rcWallReportVisualTest.includes('screenshotQuality'), 'RC wall report visual smoke records screenshot quality in audit payload', 'screenshotQuality');
assert(rcWallReportVisualTest.includes('wall-report-visual-audit.json'), 'RC wall report visual smoke writes audit evidence', 'wall-report-visual-audit.json');
assert(rcTestFoundationScript.includes('foundation-report-visual.test.js'), 'RC foundation wrapper runs report visual smoke', 'foundation-report-visual.test.js');
assert(rcTestFoundationScript.includes('Foundation report visual smoke'), 'RC foundation wrapper labels report visual smoke clearly', 'Foundation report visual smoke');
assert(rcFoundationReportVisualTest.includes('page attachment readiness boundary'), 'RC foundation report visual smoke asserts page-only boundary text on page', 'page attachment readiness boundary');
assert(rcFoundationReportVisualTest.includes('report excludes page-only status'), 'RC foundation report visual smoke asserts exported report excludes page-only wording', 'report excludes page-only status');
assert(rcFoundationReportVisualTest.includes('foundationAttachmentReadinessCard'), 'RC foundation report visual smoke targets attachment readiness outlet', 'foundationAttachmentReadinessCard');
assert(rcFoundationReportVisualTest.includes('assertReportScreenshotQuality(screenshotPath'), 'RC foundation report visual smoke asserts screenshot dimensions and nonblank pixels', 'assertReportScreenshotQuality(screenshotPath');
assert(rcFoundationReportVisualTest.includes('screenshotQuality'), 'RC foundation report visual smoke records screenshot quality in audit payload', 'screenshotQuality');
assert(rcFoundationReportVisualTest.includes('foundation-report-visual-audit.json'), 'RC foundation report visual smoke writes audit evidence', 'foundation-report-visual-audit.json');
assert(rcTestShearWallReportScript.includes('shear-wall-report-visual.test.js'), 'RC shear wall wrapper runs report visual smoke', 'shear-wall-report-visual.test.js');
assert(rcTestShearWallReportScript.includes('Shear wall report visual smoke'), 'RC shear wall wrapper labels report visual smoke clearly', 'Shear wall report visual smoke');
assert(rcShearWallReportVisualTest.includes('page attachment readiness boundary'), 'RC shear wall report visual smoke asserts page-only boundary text on page', 'page attachment readiness boundary');
assert(rcShearWallReportVisualTest.includes('report excludes page-only status'), 'RC shear wall report visual smoke asserts exported report excludes page-only wording', 'report excludes page-only status');
assert(rcShearWallReportVisualTest.includes('shearWallAttachmentReadinessCard'), 'RC shear wall report visual smoke targets attachment readiness outlet', 'shearWallAttachmentReadinessCard');
assert(rcShearWallReportVisualTest.includes('assertReportScreenshotQuality(screenshotPath'), 'RC shear wall report visual smoke asserts screenshot dimensions and nonblank pixels', 'assertReportScreenshotQuality(screenshotPath');
assert(rcShearWallReportVisualTest.includes('screenshotQuality'), 'RC shear wall report visual smoke records screenshot quality in audit payload', 'screenshotQuality');
assert(rcShearWallReportVisualTest.includes('shear-wall-report-visual-audit.json'), 'RC shear wall report visual smoke writes audit evidence', 'shear-wall-report-visual-audit.json');
assert(rcTestSinglePileScript.includes('single-pile-report-visual.test.js'), 'RC single pile wrapper runs report visual smoke', 'single-pile-report-visual.test.js');
assert(rcTestSinglePileScript.includes('Single pile report visual smoke'), 'RC single pile wrapper labels report visual smoke clearly', 'Single pile report visual smoke');
assert(rcSinglePileReportVisualTest.includes('page attachment readiness boundary'), 'RC single pile report visual smoke asserts page-only boundary text on page', 'page attachment readiness boundary');
assert(rcSinglePileReportVisualTest.includes('report excludes page-only status'), 'RC single pile report visual smoke asserts exported report excludes page-only wording', 'report excludes page-only status');
assert(rcSinglePileReportVisualTest.includes('singlePileAttachmentReadinessCard'), 'RC single pile report visual smoke targets attachment readiness outlet', 'singlePileAttachmentReadinessCard');
assert(rcSinglePileReportVisualTest.includes('assertReportScreenshotQuality(screenshotPath'), 'RC single pile report visual smoke asserts screenshot dimensions and nonblank pixels', 'assertReportScreenshotQuality(screenshotPath');
assert(rcSinglePileReportVisualTest.includes('screenshotQuality'), 'RC single pile report visual smoke records screenshot quality in audit payload', 'screenshotQuality');
assert(rcSinglePileReportVisualTest.includes('single-pile-report-visual-audit.json'), 'RC single pile report visual smoke writes audit evidence', 'single-pile-report-visual-audit.json');

for (const relativePath of formalReportRendererFiles) {
  const source = readText(repoFile(relativePath));
  for (const needle of pageOnlyReportStatusNeedles) {
    assert(!source.includes(needle), `${relativePath} excludes page-only report status wording`, needle);
  }
}

assertPrintHidesSelectors(
  rcSharedStyle,
  ['.report-readiness-card', '.advanced-tools', '.page-only-case-tools', '.mode-bar', '.mode-bar__report', '.mode-bar__action', '.mode-bar__project-status'],
  'RC shared page-only controls'
);
[
  ['RC beam case helper group', rcBeamHtml],
  ['RC foundation site preset workflow group', rcFoundationHtml],
  ['RC shear wall case helper card', rcShearWallHtml],
  ['RC wall case helper card', rcWallHtml],
  ['RC slab case helper group', rcSlabHtml],
].forEach(([label, html]) => {
  assert(html.includes('page-only-case-tools'), `${label} stays page-only`, 'page-only-case-tools');
});
[
  ['RC shear wall advanced tools page-only card', rcShearWallHtml],
  ['RC wall advanced tools page-only card', rcWallHtml],
  ['RC slab advanced tools page-only card', rcSlabHtml],
].forEach(([label, html]) => {
  assert(html.includes('advanced-tools'), `${label} class exists`, 'advanced-tools');
  assert(html.includes('advancedCaseCard'), `${label} card exists`, 'advancedCaseCard');
});
assertPrintHidesSelectors(
  rcShearWallHtml,
  ['.load-case-actions', '.design-sugg-actions'],
  'RC shear wall page-only control groups'
);
assertPrintHidesSelectors(
  rcSinglePileHtml,
  ['.report-readiness-card', '.page-only-case-tools'],
  'RC single pile page-only controls'
);
assert(rcSinglePileHtml.includes('page-only-case-tools'), 'RC single pile preset workflow card stays page-only', 'page-only-case-tools');

if (failed) {
  console.error(`\n${failed} report disclosure contract checks failed.`);
  process.exit(1);
}

console.log(`\nAll report disclosure contract checks passed (${totalTraces} traces).`);
