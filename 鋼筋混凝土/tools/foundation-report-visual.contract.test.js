const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsDir = __dirname;
const visualPath = path.join(toolsDir, 'foundation-report-visual.test.js');
const testFoundationPath = path.join(toolsDir, 'test-foundation.ps1');
const casesPath = path.join(toolsDir, 'foundation-regression-cases.json');
const toolPath = path.join(toolsDir, 'foundation.html');
const baseDemandPath = path.join(toolsDir, '..', 'shared', 'retaining-base-demand.js');
const baseDemandTestPath = path.join(toolsDir, '..', 'shared', 'retaining-base-demand.test.js');
const pileGroupLateralPath = path.join(toolsDir, '..', 'shared', 'pile-group-lateral.js');
const pileGroupLateralTestPath = path.join(toolsDir, '..', 'shared', 'pile-group-lateral.test.js');
const pilePyBridgePath = path.join(toolsDir, '..', 'shared', 'pile-py-result-bridge.js');
const pilePyBridgeTestPath = path.join(toolsDir, '..', 'shared', 'pile-py-result-bridge.test.js');
const pilePyTableAdapterPath = path.join(toolsDir, '..', 'shared', 'pile-py-table-adapter.js');
const pilePyTableAdapterTestPath = path.join(toolsDir, '..', 'shared', 'pile-py-table-adapter.test.js');

function read(file) {
  assert.ok(fs.existsSync(file), `missing required file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} should include: ${needle}`);
}

const visual = read(visualPath);
const testFoundation = read(testFoundationPath);
const cases = JSON.parse(read(casesPath));
const tool = read(toolPath);
const baseDemand = read(baseDemandPath);
const baseDemandTest = read(baseDemandTestPath);
const pileGroupLateral = read(pileGroupLateralPath);
const pileGroupLateralTest = read(pileGroupLateralTestPath);
const pilePyBridge = read(pilePyBridgePath);
const pilePyBridgeTest = read(pilePyBridgeTestPath);
const pilePyTableAdapter = read(pilePyTableAdapterPath);
const pilePyTableAdapterTest = read(pilePyTableAdapterTestPath);

[
  'assessFoundationAttachmentReadiness',
  'documentState: attachmentReadiness.documentState',
  'documentClass: attachmentReadiness.documentClass',
  '案件識別資料',
].forEach(needle => assertIncludes(tool, needle, 'foundation formal attachment state wiring'));

[
  '../shared/retaining-base-demand.js?v=1',
  "geometry: {",
  'toeEffectiveDepth:',
  'heelEffectiveDepth:',
  "group:'底版強度檢核'",
  '趾版底層 φMn ≥ Mu',
  '踵版頂層 φMn ≥ Mu',
].forEach(needle => assertIncludes(tool, needle, 'retaining wall base design wiring'));

[
  'rc-retaining-base-demand.v1',
  'deadMin: 0.9',
  'deadMax: 1.2',
  'earth: 1.6',
  "expectedFace: 'bottom'",
  "expectedFace: 'top'",
  'contactOk',
].forEach(needle => assertIncludes(baseDemand, needle, 'retaining wall base demand core'));

[
  'toe factored moment',
  'heel factored moment',
  'invalid geometry fails closed',
].forEach(needle => assertIncludes(baseDemandTest, needle, 'retaining wall base demand regression'));

[
  '../shared/pile-group-lateral.js?v=1',
  'pHX',
  'pHY',
  'PileGroupLateral.evaluate',
  "group:'群樁側向荷重分配結果'",
  "group:'側向分析'",
  '須由專項 p-y 分析承接',
].forEach(needle => assertIncludes(tool, needle, 'pile group lateral report wiring'));

[
  'rc-pile-group-lateral.v1',
  'FHWA-HIF-18-031 Table 7-1',
  'rowMultiplier',
  'responseAnalysisComplete: !required',
  'spacingRatio',
].forEach(needle => assertIncludes(pileGroupLateral, needle, 'pile group lateral core'));

[
  '3D front row',
  '4D second row interpolation',
  '5D trailing row',
  'spacing below 3D fails closed',
  'load distribution does not claim p-y response completion',
].forEach(needle => assertIncludes(pileGroupLateralTest, needle, 'pile group lateral regression'));

[
  '../shared/pile-py-result-bridge.js?v=1',
  'btnDownloadPilePyTemplate',
  'btnImportPilePy',
  'btnAdoptPilePy',
  'PILE_PY_BRIDGE.inspectState',
  "group:'專項 p-y 分析結果'",
  '來源檔 / SHA-256',
].forEach(needle => assertIncludes(tool, needle, 'pile p-y result adoption wiring'));

[
  'rc-pile-py-result.v1',
  'rc-pile-py-adoption.v1',
  'p-y 分析來源與目前樁基模型不符',
  'sourceSha256',
  'displacementRatio',
  'momentRatio',
  'shearRatio',
].forEach(needle => assertIncludes(pilePyBridge, needle, 'pile p-y result bridge core'));

[
  'p-y reviewed candidate becomes adopted result',
  '來源與目前樁基模型不符',
  'pile p-y result bridge unit tests OK',
].forEach(needle => assertIncludes(pilePyBridgeTest, needle, 'pile p-y result bridge regression'));

[
  '../shared/pile-py-table-adapter.js?v=1',
  'btnBuildPilePyFromTable',
  'btnLoadPilePyXTable',
  'btnLoadPilePyYTable',
  'btnDownloadPilePyTableSample',
  'btnDownloadPilePyCandidate',
  'loadPilePyTableFile',
  '表格檔超過 1 MiB 上限',
  'buildPilePyCandidateFromTable',
  'preparePilePyCandidateArtifact',
  'downloadPilePyCandidateJson',
  '候選 JSON 內容與驗證時的 SHA-256 不一致',
  'p-y JSON 超過 1 MiB 上限',
  'analysisScope',
  '來源表格換算',
  'X / Y 表格 SHA-256',
  'X / Y 來源檔名',
].forEach(needle => assertIncludes(tool, needle, 'pile p-y table adapter wiring'));

[
  'rc-pile-py-table-adapter.v1',
  'si-kn-m-mm',
  'us-kip-ft-in',
  'project-tf-m-cm',
  '缺少深度 0 m 的樁頭列',
  'representative-pile',
  'sourceFilename',
].forEach(needle => assertIncludes(pilePyTableAdapter, needle, 'pile p-y table adapter core'));

[
  'Adapter.parseTable(siX',
  "Adapter.parseTable(us, 'us-kip-ft-in'",
  '/缺少深度 0 m/',
  '/缺少欄位 depth_m/',
  '/須先完成支援範圍內的 p-multiplier/',
].forEach(needle => assertIncludes(pilePyTableAdapterTest, needle, 'pile p-y table adapter regression'));

[
  'iso_default',
  'combined_default',
  'combined_pass_warn',
  'mat_pass_warn',
  'retain_earth_bridge',
  'retain_counterfort_warn',
  'pile_default',
  'pile_lateral_distribution',
].forEach(key => {
  assert.ok(cases.cases.some(tc => tc.key === key), `visual smoke case missing from regression cases: ${key}`);
  assertIncludes(visual, key, 'foundation report visual smoke case list');
});

[
  'Foundation report visual smoke',
  'foundation-report-visual.test.js',
  'pile-group-lateral.test.js',
  'pile-py-result-bridge.test.js',
  'pile-py-table-adapter.test.js',
  'Pile p-y table adapter unit tests',
  'node $visualTestFile',
].forEach(needle => assertIncludes(testFoundation, needle, 'test-foundation visual smoke wiring'));

[
  'process.env.FOUNDATION_REPORT_PORT || 0',
  'server.address().port',
  'foundationAttachmentReadinessCard',
  'page attachment readiness card',
  'page attachment readiness boundary',
  'page attachment readiness priority',
  'page metadata completeness',
  'documentState',
  'documentApproved',
  'calculationText',
  'report defaults to printable internal review independent of engineering readiness',
  'DRAFT／非正式附件',
  '文件狀態：內部審閱',
  'report excludes page-only status',
  '不列為 OK 結論',
  '作業模式：',
  'RC 工具箱 ·',
  '僅供初步設計參考',
  'assertReportScreenshotQuality(screenshotPath',
  'assertReportPdfTextQuality(pdfPath',
  'minTextLength: 700',
  'screenshotQuality',
  'pdfTextQuality',
  'captureArtifactIntegrity',
  "'reportPdf'",
  "'reportScreenshot'",
  'artifactIntegrity',
  'assertArtifact(screenshotPath',
  'assertArtifact(pdfPath',
  'foundation-report-visual-audit.json',
].forEach(needle => assertIncludes(visual, needle, 'foundation report visual smoke quality gate'));

console.log('foundation report visual contract OK');
