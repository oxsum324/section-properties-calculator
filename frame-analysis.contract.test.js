const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const LoadCombo = require('./結構工具箱/core/loads/loadcombo.js');
const calculationBookContentBoundary = require('./結構工具箱/tools/calculation-book-content-boundary.json');
const analysisSectionMetadata = require('./結構工具箱/tools/analysis-section-tool-metadata.js');
const frameMetadata = analysisSectionMetadata['frame-analysis'];

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf8');
}

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

function assertNear(actual, expected, absTolerance, title) {
  const error = Math.abs(Number(actual) - Number(expected));
  assert(
    Number.isFinite(Number(actual)) && error <= absTolerance,
    title,
    `actual=${actual}, expected=${expected}, absError=${error}, tolerance=${absTolerance}`,
  );
}

function maxAbs(values) {
  return Math.max(...values.map(value => Math.abs(Number(value))));
}

function functionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert(start >= 0, `${functionName} exists`, functionName);
  const next = source.indexOf('\nfunction ', start + 1);
  return next >= 0 ? source.slice(start, next) : source.slice(start);
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

function assertFunctionTemplateExcludes(source, functionName, startNeedle, needles, label) {
  const body = functionSource(source, functionName);
  const start = body.indexOf(startNeedle);
  assert(start >= 0, `${label} template exists`, startNeedle);
  const template = body.slice(start);
  for (const needle of needles) {
    assert(!template.includes(needle), `${label} excludes page-only readiness wording`, needle);
  }
}

function assertIncludesAll(source, needles, label) {
  needles.forEach(needle => {
    assert(source.includes(needle), `${label} keeps governed marker`, needle);
  });
}

function captureFrameReportHtml(source, project = {}, runtimeState = null) {
  let reportHtml = '';
  const reportStatus = { textContent: '' };
  const reportLink = {
    href: '',
    style: { display: '' },
    removeAttribute(name) {
      if (name === 'href') this.href = '';
    },
  };
  const elements = new Map([
    ['projName', { value: project.name || '' }],
    ['projNo', { value: project.no || '' }],
    ['projDesigner', { value: project.designer || '' }],
    ['projNote', { value: project.note || '' }],
    ['projBasis', { value: project.basis || '' }],
    ['defE', { value: '2040' }],
    ['defA', { value: '63.1' }],
    ['defI', { value: '13600' }],
    ['errorMsg', { textContent: '', style: { display: 'none' } }],
    ['selfWeight', { checked: false }],
    ['density', { value: '7.85' }],
    ['reportStatus', reportStatus],
    ['reportLink', reportLink],
    ['geomCanvas', { toDataURL() { return 'data:image/png;base64,geom'; } }],
    ['momCanvas', { toDataURL() { return 'data:image/png;base64,moment'; } }],
    ['shearCanvas', { toDataURL() { return 'data:image/png;base64,shear'; } }],
    ['axialCanvas', { toDataURL() { return 'data:image/png;base64,axial'; } }],
  ]);
  const context = {
    FRAME_PUBLIC_VERSION: frameMetadata.version,
    FRAME_CALCULATION_ENGINE: frameMetadata.calculationEngine,
    FRAME_CASE_SCHEMA: 'plane-frame.case.v2',
    FRAME_LEGACY_PROJECT_SCHEMA: 'plane-frame.project.v1',
    FOUNDATION_TRANSFER_LOAD_KEYS: ['D', 'L', 'W', 'E'],
    state: runtimeState ? JSON.parse(JSON.stringify(runtimeState)) : {
      nodes: [
        { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
        { id: 2, x: 6, y: 0, cx: false, cy: true, crz: false, kx: 0, ky: 0, krz: 0 },
      ],
      members: [
        { id: 1, i: 1, j: 2, E: 2040, A: 63.1, I: 13600, relI: false, relJ: false },
      ],
      loadCases: [{ id: 1, name: 'D' }],
      comboFactors: { 1: 1 },
      loadCombinations: [{ id: 1, name: 'COMB1', factors: { 1: 1 } }],
      activeCombinationId: 1,
      nodalLoads: [{ caseId: 1, node: 2, Fx: 0, Fy: -12, M: 0 }],
      memberLoads: [{ caseId: 1, member: 1, w: 1.5, dir: 'globalY' }],
      memberPointLoads: [{ caseId: 1, member: 1, P: 8, a: 3, dir: 'globalY' }],
      solution: {
        comboText: '1D',
        validation: { checks: [{ level: 'ok', text: '模型基本自檢通過。' }] },
        equilibrium: {
          ok: true,
          applied: { Fx: 0, Fy: -20, M: -72 },
          support: { Fx: 0, Fy: 20, M: 72 },
          residual: { Fx: 0, Fy: 0, M: 0 },
        },
        solverDiagnostics: {
          passed: true,
          freeDofCount: 3,
          constrainedDofCount: 3,
          inactiveDofs: [],
          minScaledPivot: 0.25,
          algebraicResidualMax: 1e-13,
          algebraicResidualRatio: 1e-14,
        },
        d: [0, 0, 0, 0.0012, -0.0034, 0.0008],
        reactions: [0, 12, 36, 0, 8, 0],
        elems: [
          {
            m: { id: 1, i: 1, j: 2 },
            L: 6,
            qLocal: [3, 12, 36, -1, -4, -12],
            diag: {
              xs: [0, 3, 6],
              Ms: [0, 18, -12],
              Vs: [12, -8, 4],
              Ns: [3, -2, 1],
            },
          },
        ],
      },
    },
    loadCaseIdCnt: 1,
    loadCombinationIdCnt: 1,
    lastReportObjectUrl: null,
    Blob: class FakeBlob {
      constructor(parts) {
        reportHtml = parts.map(part => String(part || '')).join('');
      }
    },
    URL: {
      createObjectURL() {
        return 'blob:frame-report';
      },
      revokeObjectURL() {},
    },
    window: {
      open(url) {
        context.__openedUrl = url;
        return {};
      },
    },
    document: {
      getElementById(id) {
        return elements.get(id) || null;
      },
    },
    syncLoadCaseTableFromDom() {},
    runAnalysis() {},
    analyze(loadFactors) {
      return { ...context.state.solution, loadFactors, comboText: context.formatCombinationFactors(loadFactors) };
    },
    console,
    Math,
    Number,
    String,
    JSON,
    parseFloat,
    parseInt,
    isFinite,
    Date: class extends Date {
      constructor(...args) {
        super(...(args.length ? args : ['2026-07-03T00:00:00.000Z']));
      }
      static now() {
        return new Date('2026-07-03T00:00:00.000Z').valueOf();
      }
    },
  };
  vm.createContext(context);
  vm.runInContext(sharedReportSource, context, { filename: 'shared-report-runtime' });
  [
    'asNonNegativeNumber',
    'springValue',
    'activeSpring',
    'hasSupportDof',
    'formatSupportValue',
    'formatNodeSupport',
    'ensureLoadCases',
    'normalizedCombinationFactors',
    'ensureLoadCombinations',
    'currentLoadCombination',
    'firstLoadCaseId',
    'normalizeLoadCaseId',
    'comboFactor',
    'loadCaseName',
    'formatCombinationFactors',
    'activeLoadFactors',
    'formatActiveCombination',
    'frameStoryResponseModel',
    'frameCombinationAnalysisSet',
    'frameStoryCombinationEnvelopeModel',
    'frameNodeEnvelopeComponents',
    'frameNodeCombinationEnvelopeModel',
    'frameMemberEnvelopeComponents',
    'frameMemberCombinationEnvelopeModel',
    'formatFrameStoryRatio',
    'escapeHtml',
    'fmtCheck',
    'hasAnySpring',
    'activeFrameLoadCount',
    'getFrameProjectInfo',
    'missingFrameProjectFields',
    'validateFrameProjectData',
    'frameReportReadinessModel',
    'automaticFoundationLoadCaseId',
    'normalizeFoundationTransferSettings',
    'frameCalculationModelSnapshot',
    'frameSolutionTraceSnapshot',
    'frameCalculationResultSnapshot',
    'buildFrameCalculationTrace',
    'setReportLink',
    'setReportStatus',
    'printReport',
  ].forEach(name => {
    vm.runInContext(functionSource(source, name), context, { filename: `frame-report:${name}` });
  });
  assert(typeof context.printReport === 'function', 'rigid frame printReport runtime function exists', 'printReport');
  context.printReport();
  return {
    html: reportHtml,
    status: reportStatus.textContent,
    href: reportLink.href,
    openedUrl: context.__openedUrl,
  };
}

function stableSha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function reportCalculationFingerprint(reportHtml) {
  return String(reportHtml || '').match(/計算指紋<\/b>(CF-[0-9A-F]{16})/)?.[1] || '';
}

function createFrameAnalysisContext(source) {
  const elements = new Map([
    ['projName', { value: '' }],
    ['projNo', { value: '' }],
    ['projDesigner', { value: '' }],
    ['projNote', { value: '' }],
    ['projBasis', { value: '' }],
    ['defE', { value: '2040' }],
    ['defA', { value: '63.1' }],
    ['defI', { value: '13600' }],
    ['selfWeight', { checked: false }],
    ['density', { value: '7.85' }],
  ]);
  const context = {
    FRAME_PUBLIC_VERSION: frameMetadata.version,
    FRAME_CALCULATION_ENGINE: frameMetadata.calculationEngine,
    FRAME_CASE_SCHEMA: 'plane-frame.case.v2',
    FRAME_LEGACY_PROJECT_SCHEMA: 'plane-frame.project.v1',
    FOUNDATION_TRANSFER_LOAD_KEYS: ['D', 'L', 'W', 'E'],
    state: {
      nodes: [], members: [], loadCases: [], comboFactors: {}, loadCombinations: [], activeCombinationId: null,
      nodalLoads: [], memberLoads: [], memberPointLoads: [], solution: null,
    },
    nodeIdCnt: 0,
    memberIdCnt: 0,
    loadCaseIdCnt: 0,
    loadCombinationIdCnt: 0,
    document: {
      getElementById(id) { return elements.get(id) || null; },
    },
    window: {
      ToolReportUI: {
        normalizeProjectFieldValue(value) { return String(value || '').trim(); },
      },
      LoadCombo,
    },
    syncLoadCaseTableFromDom() {},
    invalidateAnalysisState() { context.state.solution = null; },
    renderFrameBenchmarkPanel() {},
    renderLoadCaseTable() {},
    renderLoadCombinationControls() {},
    renderNodeTable() {},
    renderFoundationTransferControls() {},
    refreshNodeSelectors() {},
    console,
    Math,
    Number,
    String,
    Boolean,
    JSON,
    Object,
    Array,
    Map,
    Set,
    parseFloat,
    parseInt,
    isFinite,
  };
  vm.createContext(context);
  vm.runInContext(sharedReportSource, context, { filename: 'shared-report-analysis-runtime' });
  [
    'asNonNegativeNumber', 'makeNode', 'springValue', 'activeSpring', 'hasSupportDof',
    'ensureLoadCases', 'normalizedCombinationFactors', 'ensureLoadCombinations', 'currentLoadCombination',
    'persistActiveCombinationFactors', 'selectLoadCombination', 'addLoadCombination', 'deleteLoadCombination',
    'firstLoadCaseId', 'normalizeLoadCaseId', 'comboFactor', 'loadCaseName',
    'automaticFoundationLoadCaseId', 'normalizeFoundationTransferSettings',
    'buildFoundationLoadComponentPackage',
    'formatCombinationFactors', 'formatActiveCombination', 'activeLoadFactors', 'momentAboutOrigin',
    'computeAppliedResultant', 'validateModel', 'zeros', 'matmul', 'matvec',
    'transpose', 'subtractMat', 'invSmall', 'condenseReleases', 'solveLinear',
    'analyze', 'frameStoryResponseModel', 'frameCombinationAnalysisSet', 'frameStoryCombinationEnvelopeModel', 'frameNodeEnvelopeComponents', 'frameNodeCombinationEnvelopeModel', 'frameMemberEnvelopeComponents', 'frameMemberCombinationEnvelopeModel', 'formatFrameStoryRatio', 'hasAnySpring', 'activeFrameLoadCount', 'getFrameProjectInfo', 'missingFrameProjectFields', 'frameReportReadinessModel', 'getFrameBenchmarkDefinition',
    'frameBenchmarkProjectData', 'resolveFrameBenchmarkMetric', 'frameBenchmarkResultModel',
    'setReportStatus', 'resetAll', 'validateFrameProjectData', 'updateNode', 'frameCalculationModelSnapshot', 'frameSolutionTraceSnapshot',
    'frameCalculationResultSnapshot', 'buildFrameCalculationTrace', 'buildFrameCasePayload',
    'canonicalFrameValue', 'canonicalFrameJson', 'cloneFrameWorkspaceValue', 'captureFrameWorkspaceSnapshot',
    'restoreFrameWorkspaceSnapshot', 'collectProjectData', 'applyImportedFrameCase', 'loadFromData',
  ].forEach(name => {
    vm.runInContext(functionSource(source, name), context, { filename: `frame-analysis:${name}` });
  });
  context.runAnalysis = () => {
    context.state.solution = context.analyze();
    return context.state.solution;
  };
  return { context, elements };
}

function frameResultSnapshot(context) {
  const solution = context.state.solution;
  return JSON.parse(JSON.stringify({
    input: context.collectProjectData(),
    solution: {
      d: solution?.d || [],
      reactions: solution?.reactions || [],
      springForces: solution?.springForces || [],
      equilibrium: solution?.equilibrium || null,
      loadFactors: solution?.loadFactors || {},
      comboText: solution?.comboText || '',
      elems: (solution?.elems || []).map(elem => ({
        id: elem.m.id,
        L: elem.L,
        qLocal: elem.qLocal,
        dLocal: elem.dLocal,
        diag: elem.diag,
      })),
    },
  }));
}

const pageOnlyReportStatusNeedles = [...new Set(
  Object.values(calculationBookContentBoundary.forbiddenCategories).flat(),
)];
const frameBenchmarkPageOnlyNeedles = [
  '獨立參考解比對',
  '此驗證結果只供工作頁確認求解器',
  'PF-BM-PORTAL-SWAY-01',
  'PF-BM-PORTAL-UDL-01',
  'PF-BM-INCLINED-CANTILEVER-01',
  'PF-BM-PORTAL-HSPRING-01',
  'PF-BM-CANTILEVER-RSPRING-01',
  'PF-BM-PORTAL-2STORY-SWAY-01',
  'PF-BM-PORTAL-2STORY-ASYM-01',
];

function reportHtmlText(reportHtml) {
  return String(reportHtml || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function assertReportHtmlText(reportHtml, label, requiredNeedles, minLength = 700) {
  const text = reportHtmlText(reportHtml);
  assert(text.length >= minLength, `${label} visible report text is substantial`, `chars=${text.length}`);
  requiredNeedles.forEach(needle => {
    assert(text.includes(needle), `${label} visible report text includes required wording`, needle);
  });
  pageOnlyReportStatusNeedles.forEach(needle => {
    assert(!text.includes(needle), `${label} visible report text excludes page-only readiness wording`, needle);
  });
  return text;
}

const frameAnalysisHtml = read(path.join('鋼架', '平面剛架分析.html'));
const directPrintBoundary = read(path.join('結構工具箱', 'core', 'direct-print-boundary.css'));
const sharedReportSource = read(path.join('結構工具箱', 'core', 'ui', 'report.js'));

assert(!frameAnalysisHtml.includes('alert('), 'rigid frame avoids blocking alert', 'alert(');
assertIncludesAll(frameAnalysisHtml, [
  '../結構工具箱/core/loads/loadcombo.js',
  '../結構工具箱/core/ui/force-picker.js',
  'id="foundationTransferNode"',
  'id="foundationTransferCaseD"',
  'id="foundationTransferCaseE"',
  'buildFoundationLoadComponentPackage',
  "ForcePicker.sendTo('foundation-pile-cap'",
  '../鋼筋混凝土/tools/foundation.html?import=1',
], 'rigid frame foundation component transfer');

assertIncludesAll(frameAnalysisHtml, [
  '<title>平面剛架分析',
  'id="frameAnalysisVersion"',
  '../結構工具箱/tools/analysis-section-tool-metadata.js',
  'FRAME_ANALYSIS_METADATA.version',
  "schema: 'plane-frame.project.v1'",
  'version: FRAME_PUBLIC_VERSION',
  'calculationEngine: FRAME_CALCULATION_ENGINE',
  'function validateFrameProjectData',
  'function solveLinear',
  'function analyze',
  'function validateModel',
  'function computeAppliedResultant',
  'function renderModelChecks',
  'function syncLoadCaseTableFromDom',
  'function drawBoundedCanvasText',
  'function makeNode',
  'function activeSpring',
  'function setReportStatus',
  'function setReportLink',
  'function frameReportReadinessModel',
  'function renderFrameReportReadiness',
  'function getFrameBenchmarkDefinition',
  'function frameBenchmarkProjectData',
  'function frameBenchmarkResultModel',
  'function renderFrameBenchmarkPanel',
  'function invalidateAnalysisState',
  'id="geomCanvas"',
  'id="momCanvas"',
  'id="dispTbl"',
  'id="storyResponseCard"',
  'id="storyResponseTbl"',
  'function frameStoryResponseModel',
  'function renderStoryResponse',
  'id="loadCombinationSelect"',
  'id="loadCombinationName"',
  'function addLoadCombination',
  'function selectLoadCombination',
  'id="storyEnvelopeCard"',
  'id="storyEnvelopeTbl"',
  'function frameStoryCombinationEnvelopeModel',
  'function frameCombinationAnalysisSet',
  'function renderStoryEnvelope',
  'id="nodeEnvelopeCard"',
  'id="nodeEnvelopeTbl"',
  'function frameNodeCombinationEnvelopeModel',
  'function renderNodeEnvelope',
  'id="memberEnvelopeCard"',
  'id="memberEnvelopeTbl"',
  'function frameMemberCombinationEnvelopeModel',
  'function renderMemberEnvelope',
  'id="reportStatus"',
  'id="reportLink"',
  'id="frameReportReadiness"',
  'id="projName"',
  'id="projNo"',
  'id="projDesigner"',
  '../結構工具箱/core/ui/report.js',
  'function getFrameProjectInfo',
  'buildFormalDocumentStateReport',
  'buildReportTrace',
  'function buildFrameCalculationTrace',
  "const FRAME_CASE_SCHEMA = 'plane-frame.case.v2'",
  'id="projBasis"',
  'page-only-report-status',
  'page-only-tool-actions',
  'page-only-frame-benchmark',
  'id="frameBenchmarkCaseSelect"',
  'id="loadFrameBenchmarkButton"',
  'value="portalSideswayBenchmark"',
  'value="portalSymmetricUdlBenchmark"',
  'value="inclinedCantileverBenchmark"',
  'value="elasticSupportPortalBenchmark"',
  'value="rotationalSpringCantileverBenchmark"',
  'value="twoStoryPortalBenchmark"',
  'value="asymmetricTwoStoryPortalBenchmark"',
  'function loadSelectedFrameBenchmark',
  'URL.createObjectURL(new Blob',
  'lastReportObjectUrl',
  'equilibrium',
  'formatActiveCombination',
  'comboFactors',
  'caseId: normalizeLoadCaseId',
  "loadExample('springPortal')",
  'kX/kY (tf/m)',
  'kθ (tf·m/rad)',
  'springForces',
], 'rigid frame static contract');

assertIncludesAll(frameAnalysisHtml, [
  'href="../結構工具箱/core/direct-print-boundary.css"',
  '<body class="formal-tool-output-page">',
  'class="formal-direct-print-boundary"',
  '分析工具主頁列印已封鎖',
  '此頁是操作介面，不是計算書',
  '本頁不得作為附件',
], 'rigid frame direct-print boundary');
assertIncludesAll(directPrintBoundary, [
  'body.formal-tool-output-page > :not(.formal-direct-print-boundary)',
  'body.formal-tool-output-page > .formal-direct-print-boundary',
], 'shared direct-print CSS');

assertIncludesAll(frameAnalysisHtml, [
  'grid-template-columns: minmax(560px, 0.9fr) minmax(0, 1.1fr)',
  '.main-layout > * { min-width: 0; }',
  '.row2 input, .row2 select, .row3 input, .row3 select { width: 100%; min-width: 0; }',
  'canvas { display: block; max-width: 100%; height: auto; margin: 0 auto; }',
  '@media (max-width: 1180px)',
  'overflow-x: auto',
], 'rigid frame responsive contract');

assertPrintHidesSelectors(frameAnalysisHtml, ['.page-only-report-status', '.page-only-tool-actions', '.page-only-frame-benchmark'], 'rigid frame page-only controls');
assertFunctionTemplateExcludes(frameAnalysisHtml, 'printReport', 'const html = `', pageOnlyReportStatusNeedles, 'rigid frame report export');
assertFunctionTemplateExcludes(frameAnalysisHtml, 'printReport', 'const html = `', frameBenchmarkPageOnlyNeedles, 'rigid frame benchmark report boundary');

const frameReportRuntime = captureFrameReportHtml(frameAnalysisHtml);
const frameReportText = assertReportHtmlText(frameReportRuntime.html, 'rigid frame runtime report', [
  '平面剛架分析 計算書',
  '產出工具',
  '工具版本',
  '計算引擎',
  '輸出時間',
  '計算指紋',
  '載重組合矩陣',
  '節點',
  '桿件',
  '載重',
  '模型自檢',
  '平衡檢核',
  '節點位移 / 反力',
  '桿件極值',
]);
assert(frameReportRuntime.html.includes('平面剛架分析 計算書'), 'rigid frame runtime report title', '平面剛架分析 計算書');
assert(frameReportRuntime.html.includes(`<b>工具版本</b>${frameMetadata.version}`), 'rigid frame report preserves canonical public version casing', frameMetadata.version);
assert(frameReportRuntime.html.includes(`<b>計算引擎</b>${frameMetadata.calculationEngine}`), 'rigid frame report identifies calculation engine', frameMetadata.calculationEngine);
assert(frameReportRuntime.html.includes('<h3>載重</h3>'), 'rigid frame runtime report keeps load table', '載重');
assert(frameReportRuntime.html.includes('平衡檢核'), 'rigid frame runtime report keeps equilibrium section', '平衡檢核');
assert(!frameReportRuntime.html.includes('樓層反應摘要'), 'non-story beam report omits inapplicable story-response section', 'no horizontal floor above the support level');
assert(frameReportRuntime.html.includes('文件狀態：內部審閱'), 'rigid frame report defaults to printable internal review', '文件狀態：內部審閱');
assert(frameReportRuntime.html.includes('本計算內容已完成審閱，核可作為正式附件'), 'rigid frame report exposes explicit approval checkbox', '核可作為正式附件');
assert(frameReportText.includes('節點 N2'), 'rigid frame visible report text keeps node data', '節點 N2');
assert(frameReportText.includes('桿件 M1'), 'rigid frame visible report text keeps member data', '桿件 M1');
assert(frameReportRuntime.href === 'blob:frame-report', 'rigid frame runtime report link set', frameReportRuntime.href);
assert(frameReportRuntime.openedUrl === 'blob:frame-report', 'rigid frame runtime report window opens blob URL', frameReportRuntime.openedUrl);
assert(frameReportRuntime.status.includes('已產生計算書'), 'rigid frame runtime report status message', frameReportRuntime.status);
for (const needle of pageOnlyReportStatusNeedles) {
  assert(!frameReportRuntime.html.includes(needle), 'rigid frame runtime report excludes page-only readiness wording', needle);
}
for (const needle of frameBenchmarkPageOnlyNeedles) {
  assert(!frameReportRuntime.html.includes(needle), 'rigid frame runtime report excludes page-only benchmark wording', needle);
}

const readyFrameReport = captureFrameReportHtml(frameAnalysisHtml, {
  name: 'Frame QA',
  no: 'FR-001',
  designer: 'Codex QA',
  note: 'Ready attachment sample',
});
assert(readyFrameReport.html.includes('文件狀態：內部審閱'), 'rigid frame complete report remains printable before approval', '文件狀態：內部審閱');
assert(readyFrameReport.html.includes('data-document-class="internal-review"'), 'rigid frame complete report records internal-review document class', 'internal-review');
assert(readyFrameReport.html.includes('本計算內容已完成審閱，核可作為正式附件'), 'rigid frame complete report exposes explicit approval action', '核可作為正式附件');
assert(readyFrameReport.html.includes('Frame QA'), 'rigid frame complete report keeps project name', 'Frame QA');
assert(readyFrameReport.html.includes('FR-001'), 'rigid frame complete report keeps project number', 'FR-001');
assert(readyFrameReport.html.includes('Codex QA'), 'rigid frame complete report keeps designer', 'Codex QA');

const frameProjectFixture = {
  schema: 'plane-frame.project.v1',
  tool: '平面剛架分析',
  version: frameMetadata.version,
  unit: 'tf-m',
  project: { name: 'Frame Replay', no: 'FR-R01', designer: 'QA', note: 'JSON result chain' },
  defaults: { E: 2040, A: 63.1, I: 13600 },
  selfWeight: false,
  density: 7.85,
  loadCases: [{ id: 1, name: 'D' }, { id: 2, name: 'L' }],
  comboFactors: { 1: 1.2, 2: 1.6 },
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: 0, y: 4, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 3, x: 6, y: 4, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 4, x: 6, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
  ],
  members: [
    { id: 1, i: 1, j: 2, E: 2040, A: 63.1, I: 13600, relI: false, relJ: false },
    { id: 2, i: 2, j: 3, E: 2040, A: 63.1, I: 13600, relI: false, relJ: false },
    { id: 3, i: 3, j: 4, E: 2040, A: 63.1, I: 13600, relI: false, relJ: false },
  ],
  nodalLoads: [{ caseId: 2, node: 2, Fx: 1.25, Fy: 0, M: 0 }],
  memberLoads: [{ caseId: 1, member: 2, w: 2.5, dir: 'globalY' }],
  memberPointLoads: [{ caseId: 2, member: 2, P: 5.5, a: 2.25, dir: 'globalY' }],
};

const frameRuntime = createFrameAnalysisContext(frameAnalysisHtml);
frameRuntime.context.loadFromData(JSON.parse(JSON.stringify(frameProjectFixture)));
const sourceProjectJson = JSON.parse(JSON.stringify(frameRuntime.context.collectProjectData()));
const sourceResultSnapshot = frameResultSnapshot(frameRuntime.context);
const sourceResultSha256 = stableSha256(sourceResultSnapshot);
const sourceFrameReport = captureFrameReportHtml(
  frameAnalysisHtml,
  frameRuntime.context.getFrameProjectInfo(),
  frameRuntime.context.state,
);
const sourceFrameFingerprint = reportCalculationFingerprint(sourceFrameReport.html);
assert(sourceProjectJson.schema === 'plane-frame.project.v1', 'rigid frame JSON declares stable schema', sourceProjectJson.schema);
assert(sourceProjectJson.version === frameMetadata.version, 'rigid frame JSON records current version', sourceProjectJson.version);
assert(sourceProjectJson.calculationEngine === frameMetadata.calculationEngine, 'rigid frame JSON records canonical calculation engine', sourceProjectJson.calculationEngine);
assert(frameRuntime.context.state.solution.equilibrium.ok === true, 'rigid frame replay fixture passes equilibrium check', JSON.stringify(frameRuntime.context.state.solution.equilibrium));
assert(/^[0-9a-f]{64}$/.test(sourceResultSha256), 'rigid frame source input/result snapshot has stable SHA-256', sourceResultSha256);
assert(/^CF-[0-9A-F]{16}$/.test(sourceFrameFingerprint), 'rigid frame source report exposes calculation fingerprint', sourceFrameFingerprint);

frameRuntime.context.state.nodes[2].x = 8;
frameRuntime.context.state.memberLoads.length = 0;
frameRuntime.elements.get('projNo').value = 'MUTATED';
frameRuntime.context.runAnalysis();
frameRuntime.context.loadFromData(JSON.parse(JSON.stringify(sourceProjectJson)));
const replayResultSnapshot = frameResultSnapshot(frameRuntime.context);
const replayResultSha256 = stableSha256(replayResultSnapshot);
const replayFrameReport = captureFrameReportHtml(
  frameAnalysisHtml,
  frameRuntime.context.getFrameProjectInfo(),
  frameRuntime.context.state,
);
const replayFrameFingerprint = reportCalculationFingerprint(replayFrameReport.html);
assert(replayResultSha256 === sourceResultSha256, 'rigid frame JSON replay reproduces model and every analysis result', `source=${sourceResultSha256}, replay=${replayResultSha256}`);
assert(replayFrameFingerprint === sourceFrameFingerprint, 'rigid frame JSON replay reproduces calculation-book fingerprint', `source=${sourceFrameFingerprint}, replay=${replayFrameFingerprint}`);
assert(sourceFrameReport.html.includes('目前組合樓層反應'), 'portal-frame report includes applicable story-response results', '目前組合樓層反應');
assert(sourceFrameReport.html.includes('層剪力 Vx(tf)'), 'portal-frame report includes story-shear result column', '層剪力 Vx(tf)');

const formalCasePayload = frameRuntime.context.buildFrameCasePayload();
const formalBaselineFingerprint = formalCasePayload.calculationFingerprint;
assert(formalCasePayload.schema === 'plane-frame.case.v2', 'rigid frame formal JSON declares V2 case schema', formalCasePayload.schema);
assert(formalCasePayload.tool.id === 'frame-analysis', 'rigid frame formal JSON records stable tool id', formalCasePayload.tool.id);
assert(formalCasePayload.tool.calculationEngine === frameMetadata.calculationEngine, 'rigid frame formal JSON records calculation engine', formalCasePayload.tool.calculationEngine);
assert(formalCasePayload.report.calculationFingerprint === formalBaselineFingerprint, 'rigid frame formal JSON links report and source fingerprints', formalBaselineFingerprint);
assert(formalBaselineFingerprint === sourceFrameFingerprint, 'rigid frame report and formal JSON share one complete calculation fingerprint', formalBaselineFingerprint);

frameRuntime.elements.get('projName').value = 'Metadata-only mutation';
frameRuntime.elements.get('projNo').value = 'META-002';
frameRuntime.elements.get('projDesigner').value = 'Different reviewer';
frameRuntime.elements.get('projBasis').value = 'S-202 Rev.4';
const metadataOnlyFingerprint = frameRuntime.context.buildFrameCalculationTrace().calculationFingerprint;
assert(metadataOnlyFingerprint === formalBaselineFingerprint, 'rigid frame calculation fingerprint excludes display metadata and project basis', metadataOnlyFingerprint);

const resultMutationOriginal = frameRuntime.context.state.solution.d[3];
frameRuntime.context.state.solution.d[3] = resultMutationOriginal + 1e-5;
const resultMutationFingerprint = frameRuntime.context.buildFrameCalculationTrace().calculationFingerprint;
assert(resultMutationFingerprint !== formalBaselineFingerprint, 'rigid frame calculation fingerprint includes solved results', `${formalBaselineFingerprint} -> ${resultMutationFingerprint}`);
frameRuntime.context.state.solution.d[3] = resultMutationOriginal;

frameRuntime.context.state.nodalLoads[0].Fx += 0.25;
frameRuntime.context.runAnalysis();
const loadMutationFingerprint = frameRuntime.context.buildFrameCalculationTrace().calculationFingerprint;
assert(loadMutationFingerprint !== formalBaselineFingerprint, 'rigid frame calculation fingerprint changes with load input', `${formalBaselineFingerprint} -> ${loadMutationFingerprint}`);
frameRuntime.context.loadFromData(JSON.parse(JSON.stringify(sourceProjectJson)));

frameRuntime.elements.get('selfWeight').checked = true;
frameRuntime.elements.get('density').value = '7.70';
frameRuntime.context.runAnalysis();
const selfWeightFingerprint = frameRuntime.context.buildFrameCalculationTrace().calculationFingerprint;
assert(selfWeightFingerprint !== formalBaselineFingerprint, 'rigid frame calculation fingerprint changes with self weight and density', `${formalBaselineFingerprint} -> ${selfWeightFingerprint}`);
frameRuntime.context.loadFromData(JSON.parse(JSON.stringify(sourceProjectJson)));

frameRuntime.context.state.nodalLoads = [{ caseId: 1, node: 2, Fx: 1e-300, Fy: 0, M: 0 }];
frameRuntime.context.state.memberLoads = [];
frameRuntime.context.state.memberPointLoads = [];
frameRuntime.elements.get('selfWeight').checked = true;
frameRuntime.elements.get('density').value = '1e-300';
frameRuntime.context.runAnalysis();
const zeroDensitySelfWeightReadiness = frameRuntime.context.frameReportReadinessModel(frameRuntime.context.state.solution.validation);
assert(zeroDensitySelfWeightReadiness.level === 'blocked', 'rigid frame negligible nodal load and self weight cannot disguise an empty formal model', zeroDensitySelfWeightReadiness.failedItems.join('；'));
assert(zeroDensitySelfWeightReadiness.failedItems.some(item => item.includes('沒有啟用的外力或自重')), 'rigid frame empty-load boundary reports the governing failure', zeroDensitySelfWeightReadiness.failedItems.join('；'));
frameRuntime.context.loadFromData(JSON.parse(JSON.stringify(sourceProjectJson)));

frameRuntime.context.state.nodes[1].kx = 500;
frameRuntime.context.updateNode(1, 'cx', true);
assert(frameRuntime.context.state.nodes[1].kx === 0, 'rigid frame fixed support toggle clears the mutually exclusive spring', JSON.stringify(frameRuntime.context.state.nodes[1]));
const fixedTogglePayload = frameRuntime.context.buildFrameCasePayload();
const fixedToggleReplay = frameRuntime.context.applyImportedFrameCase(JSON.parse(JSON.stringify(fixedTogglePayload)), 'fixed-toggle.json');
assert(fixedToggleReplay.calculationFingerprint === fixedTogglePayload.calculationFingerprint, 'rigid frame self-produced fixed-support case remains replayable', fixedToggleReplay.calculationFingerprint);
frameRuntime.context.loadFromData(JSON.parse(JSON.stringify(sourceProjectJson)));

frameRuntime.context.state.nodes[1].kx = 750;
frameRuntime.context.runAnalysis();
frameRuntime.elements.get('projBasis').value = '';
const unresolvedSpringReadiness = frameRuntime.context.frameReportReadinessModel(frameRuntime.context.state.solution.validation);
assert(unresolvedSpringReadiness.level === 'review', 'rigid frame spring assumption without project basis remains review', unresolvedSpringReadiness.level);
const unresolvedSpringReport = captureFrameReportHtml(frameAnalysisHtml, frameRuntime.context.getFrameProjectInfo(), frameRuntime.context.state);
assert(unresolvedSpringReport.html.includes('data-formal-approval-allowed="false"'), 'rigid frame review report disables formal approval', 'data-formal-approval-allowed="false"');
frameRuntime.elements.get('projBasis').value = '結構分析模型 S-202 Rev.4，專案指定水平彈簧剛度';
const resolvedSpringReadiness = frameRuntime.context.frameReportReadinessModel(frameRuntime.context.state.solution.validation);
assert(resolvedSpringReadiness.level === 'ready', 'rigid frame project basis resolves documented spring assumption', resolvedSpringReadiness.level);
const resolvedSpringReport = captureFrameReportHtml(frameAnalysisHtml, frameRuntime.context.getFrameProjectInfo(), frameRuntime.context.state);
assert(resolvedSpringReport.html.includes('data-formal-approval-allowed="true"'), 'rigid frame ready report enables explicit formal approval', 'data-formal-approval-allowed="true"');
frameRuntime.context.loadFromData(JSON.parse(JSON.stringify(sourceProjectJson)));

frameRuntime.context.state.nodes[2].x = 7.25;
frameRuntime.context.runAnalysis();
const beforeFormalReplay = stableSha256(frameResultSnapshot(frameRuntime.context));
const replayedFormalCase = frameRuntime.context.applyImportedFrameCase(JSON.parse(JSON.stringify(formalCasePayload)), 'formal-case.json');
assert(replayedFormalCase.calculationFingerprint === formalBaselineFingerprint, 'rigid frame V2 JSON replay reproduces the governed fingerprint', replayedFormalCase.calculationFingerprint);

frameRuntime.context.state.nodes[2].x = 7.5;
frameRuntime.context.runAnalysis();
const beforeMismatchRollback = stableSha256(frameResultSnapshot(frameRuntime.context));
const mismatchedFormalCase = JSON.parse(JSON.stringify(formalCasePayload));
mismatchedFormalCase.calculationFingerprint = 'CF-0000000000000000';
mismatchedFormalCase.report.calculationFingerprint = mismatchedFormalCase.calculationFingerprint;
let mismatchError = '';
try {
  frameRuntime.context.applyImportedFrameCase(mismatchedFormalCase, 'mismatch.json');
} catch (error) {
  mismatchError = String(error.message || error);
}
const afterMismatchRollback = stableSha256(frameResultSnapshot(frameRuntime.context));
assert(mismatchError.includes('案件 JSON 重現失敗') && mismatchError.includes('已保留原輸入'), 'rigid frame rejects mismatched V2 fingerprint with rollback notice', mismatchError);
assert(afterMismatchRollback === beforeMismatchRollback, 'rigid frame mismatched V2 replay restores the complete prior model and result', `${beforeMismatchRollback} / ${afterMismatchRollback}`);
assert(beforeFormalReplay !== stableSha256(frameResultSnapshot(frameRuntime.context)), 'rigid frame successful formal replay replaced the pre-replay mutation before rollback scenario', beforeFormalReplay);

const beforeResultTamperRollback = stableSha256(frameResultSnapshot(frameRuntime.context));
const resultTamperedFormalCase = JSON.parse(JSON.stringify(formalCasePayload));
resultTamperedFormalCase.result.combinations[0].d[3] += 999999;
let resultTamperError = '';
try {
  frameRuntime.context.applyImportedFrameCase(resultTamperedFormalCase, 'result-tamper.json');
} catch (error) {
  resultTamperError = String(error.message || error);
}
const afterResultTamperRollback = stableSha256(frameResultSnapshot(frameRuntime.context));
assert(resultTamperError.includes('來源結果快照與重新計算結果不一致') && resultTamperError.includes('已保留原輸入'), 'rigid frame rejects a tampered claimed result even when fingerprints are unchanged', resultTamperError);
assert(afterResultTamperRollback === beforeResultTamperRollback, 'rigid frame result-tampered V2 replay restores the complete prior model and result', `${beforeResultTamperRollback} / ${afterResultTamperRollback}`);

frameRuntime.elements.get('projName').value = 'UNSAVED-WIP';
frameRuntime.context.state.members[0].E = 0;
frameRuntime.context.invalidateAnalysisState();
const beforeInvalidWipRollback = stableSha256(frameResultSnapshot(frameRuntime.context));
const invalidWipTamperedCase = JSON.parse(JSON.stringify(formalCasePayload));
invalidWipTamperedCase.result.combinations[0].d[3] += 999;
let invalidWipTamperError = '';
try {
  frameRuntime.context.applyImportedFrameCase(invalidWipTamperedCase, 'result-tamper-over-wip.json');
} catch (error) {
  invalidWipTamperError = String(error.message || error);
}
const afterInvalidWipRollback = stableSha256(frameResultSnapshot(frameRuntime.context));
assert(invalidWipTamperError.includes('來源結果快照與重新計算結果不一致') && invalidWipTamperError.includes('已保留原輸入'), 'rigid frame rejects a tampered V2 result over an invalid unsaved WIP', invalidWipTamperError);
assert(!invalidWipTamperError.includes('原輸入復原失敗'), 'rigid frame raw rollback does not revalidate an invalid unsaved WIP', invalidWipTamperError);
assert(afterInvalidWipRollback === beforeInvalidWipRollback, 'rigid frame invalid WIP rollback preserves the complete raw workspace', `${beforeInvalidWipRollback} / ${afterInvalidWipRollback}`);
assert(frameRuntime.elements.get('projName').value === 'UNSAVED-WIP' && frameRuntime.context.state.members[0].E === 0 && frameRuntime.context.state.solution === null, 'rigid frame invalid WIP rollback preserves project text, invalid member input and unsolved state', `${frameRuntime.elements.get('projName').value} / ${frameRuntime.context.state.members[0].E} / ${Boolean(frameRuntime.context.state.solution)}`);
frameRuntime.context.loadFromData(JSON.parse(JSON.stringify(sourceProjectJson)));

function runClosedFormFrameCase(caseData) {
  const runtime = createFrameAnalysisContext(frameAnalysisHtml);
  runtime.context.loadFromData({
    schema: 'plane-frame.project.v1',
    tool: '平面剛架分析',
    version: frameMetadata.version,
    calculationEngine: frameMetadata.calculationEngine,
    unit: 'tf-m',
    project: { name: '', no: '', designer: '', note: caseData.id },
    defaults: { E: caseData.E, A: caseData.A, I: caseData.I },
    selfWeight: caseData.selfWeight === true,
    density: caseData.density == null ? 7.85 : caseData.density,
    loadCases: [{ id: 1, name: 'D' }],
    comboFactors: { 1: 1 },
    nodes: caseData.nodes,
    members: caseData.members,
    nodalLoads: caseData.nodalLoads || [],
    memberLoads: caseData.memberLoads || [],
    memberPointLoads: caseData.memberPointLoads || [],
  });
  const solution = runtime.context.state.solution;
  assert(solution?.equilibrium?.ok === true, `${caseData.id} closed-form case passes global equilibrium`, JSON.stringify(solution?.equilibrium));
  return solution;
}

const closedFormMaterial = { E: 2040, A: 63.1, I: 13600 };
const closedFormEI = closedFormMaterial.E * closedFormMaterial.I * 1e-4;

const cantileverLength = 6;
const cantileverTipLoad = 1;
const cantileverSolution = runClosedFormFrameCase({
  id: 'cantilever-tip-load',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: 0, y: cantileverLength, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false }],
  nodalLoads: [{ caseId: 1, node: 2, Fx: cantileverTipLoad, Fy: 0, M: 0 }],
});
assertNear(cantileverSolution.d[3], cantileverTipLoad * cantileverLength ** 3 / (3 * closedFormEI), 1e-11, 'cantilever tip translation matches PL^3/(3EI)');
assertNear(cantileverSolution.d[5], -cantileverTipLoad * cantileverLength ** 2 / (2 * closedFormEI), 1e-11, 'cantilever tip rotation matches PL^2/(2EI)');
assertNear(cantileverSolution.reactions[0], -cantileverTipLoad, 1e-10, 'cantilever base horizontal reaction matches statics');
assertNear(cantileverSolution.reactions[2], cantileverTipLoad * cantileverLength, 1e-10, 'cantilever base moment matches PL');
assertNear(maxAbs(cantileverSolution.elems[0].diag.Ms), cantileverTipLoad * cantileverLength, 1e-10, 'cantilever moment diagram maximum matches PL');
assertNear(maxAbs(cantileverSolution.elems[0].diag.Vs), cantileverTipLoad, 1e-10, 'cantilever shear diagram matches P');

const simpleSpan = 8;
const uniformLoad = 1;
const simpleUdlSolution = runClosedFormFrameCase({
  id: 'simple-beam-uniform-load',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: simpleSpan, y: 0, cx: false, cy: true, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false }],
  memberLoads: [{ caseId: 1, member: 1, w: uniformLoad, dir: 'globalY' }],
});
assertNear(simpleUdlSolution.reactions[1], uniformLoad * simpleSpan / 2, 1e-10, 'simple beam UDL left reaction matches wL/2');
assertNear(simpleUdlSolution.reactions[4], uniformLoad * simpleSpan / 2, 1e-10, 'simple beam UDL right reaction matches wL/2');
assertNear(simpleUdlSolution.d[2], -uniformLoad * simpleSpan ** 3 / (24 * closedFormEI), 1e-11, 'simple beam UDL left rotation matches wL^3/(24EI)');
assertNear(simpleUdlSolution.d[5], uniformLoad * simpleSpan ** 3 / (24 * closedFormEI), 1e-11, 'simple beam UDL right rotation matches wL^3/(24EI)');
assertNear(maxAbs(simpleUdlSolution.elems[0].diag.Ms), uniformLoad * simpleSpan ** 2 / 8, 1e-10, 'simple beam UDL maximum moment matches wL^2/8');
assertNear(maxAbs(simpleUdlSolution.elems[0].diag.Vs), uniformLoad * simpleSpan / 2, 1e-10, 'simple beam UDL maximum shear matches wL/2');

const midpointLoad = 10;
const simplePointSolution = runClosedFormFrameCase({
  id: 'simple-beam-midpoint-load',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: simpleSpan, y: 0, cx: false, cy: true, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false }],
  memberPointLoads: [{ caseId: 1, member: 1, P: midpointLoad, a: simpleSpan / 2, dir: 'globalY' }],
});
assertNear(simplePointSolution.reactions[1], midpointLoad / 2, 1e-10, 'simple beam midpoint load left reaction matches P/2');
assertNear(simplePointSolution.reactions[4], midpointLoad / 2, 1e-10, 'simple beam midpoint load right reaction matches P/2');
assertNear(simplePointSolution.d[2], -midpointLoad * simpleSpan ** 2 / (16 * closedFormEI), 1e-11, 'simple beam midpoint load left rotation matches PL^2/(16EI)');
assertNear(simplePointSolution.d[5], midpointLoad * simpleSpan ** 2 / (16 * closedFormEI), 1e-11, 'simple beam midpoint load right rotation matches PL^2/(16EI)');
assertNear(maxAbs(simplePointSolution.elems[0].diag.Ms), midpointLoad * simpleSpan / 4, 1e-10, 'simple beam midpoint load maximum moment matches PL/4');
assertNear(maxAbs(simplePointSolution.elems[0].diag.Vs), midpointLoad / 2, 1e-10, 'simple beam midpoint load maximum shear matches P/2');

const releasedEndSolution = runClosedFormFrameCase({
  id: 'fixed-pinned-beam-uniform-load',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: simpleSpan, y: 0, cx: false, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: true }],
  memberLoads: [{ caseId: 1, member: 1, w: uniformLoad, dir: 'globalY' }],
});
assertNear(releasedEndSolution.reactions[1], 5 * uniformLoad * simpleSpan / 8, 1e-10, 'fixed-pinned beam left reaction matches 5wL/8');
assertNear(releasedEndSolution.reactions[4], 3 * uniformLoad * simpleSpan / 8, 1e-10, 'fixed-pinned beam right reaction matches 3wL/8');
assertNear(releasedEndSolution.reactions[2], uniformLoad * simpleSpan ** 2 / 8, 1e-10, 'fixed-pinned beam fixed-end reaction moment matches wL^2/8');
assertNear(releasedEndSolution.elems[0].qLocal[5], 0, 1e-10, 'released member end moment is zero after static condensation');
assertNear(Math.min(...releasedEndSolution.elems[0].diag.Ms), -uniformLoad * simpleSpan ** 2 / 8, 1e-10, 'fixed-pinned beam hogging moment matches -wL^2/8');
assertNear(Math.max(...releasedEndSolution.elems[0].diag.Ms), 9 * uniformLoad * simpleSpan ** 2 / 128, 1e-10, 'fixed-pinned beam positive moment matches 9wL^2/128');

const verticalUdlLength = 5;
const verticalUdl = 2.4;
const uniformClosedFormEA = closedFormMaterial.E * closedFormMaterial.A;
const verticalUdlSolution = runClosedFormFrameCase({
  id: 'vertical-cantilever-global-y-uniform-load',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: 0, y: verticalUdlLength, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false }],
  memberLoads: [{ caseId: 1, member: 1, w: verticalUdl, dir: 'globalY' }],
});
assertNear(verticalUdlSolution.reactions[1], verticalUdl * verticalUdlLength, 1e-10, 'vertical member global-Y UDL retains the complete vertical resultant');
assertNear(verticalUdlSolution.d[4], -verticalUdl * verticalUdlLength ** 2 / (2 * uniformClosedFormEA), 1e-12, 'vertical member global-Y UDL axial shortening matches wL^2/(2EA)');
assertNear(verticalUdlSolution.elems[0].diag.Ns[0], -verticalUdl * verticalUdlLength, 1e-10, 'vertical member global-Y UDL base axial force is compression wL');
assertNear(verticalUdlSolution.elems[0].diag.Ns.at(-1), 0, 1e-10, 'vertical member global-Y UDL axial diagram closes to zero at the free end');

const selfWeightDensity = 7.85;
const selfWeightPerLength = selfWeightDensity * closedFormMaterial.A * 1e-4;
const verticalSelfWeightSolution = runClosedFormFrameCase({
  id: 'vertical-cantilever-self-weight',
  ...closedFormMaterial,
  selfWeight: true,
  density: selfWeightDensity,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: 0, y: verticalUdlLength, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false }],
});
assertNear(verticalSelfWeightSolution.reactions[1], selfWeightPerLength * verticalUdlLength, 1e-10, 'vertical member self weight retains the complete vertical resultant');
assertNear(verticalSelfWeightSolution.d[4], -selfWeightPerLength * verticalUdlLength ** 2 / (2 * uniformClosedFormEA), 1e-12, 'vertical member self weight axial shortening matches gL^2/(2EA)');
assertNear(verticalSelfWeightSolution.elems[0].diag.Ns[0], -selfWeightPerLength * verticalUdlLength, 1e-10, 'vertical member self-weight base axial force is compression gL');

const inclinedUdlDx = 3;
const inclinedUdlDy = 4;
const inclinedUdlLength = 5;
const inclinedGlobalUdl = 1.7;
const inclinedC = inclinedUdlDx / inclinedUdlLength;
const inclinedS = inclinedUdlDy / inclinedUdlLength;
const inclinedQx = -inclinedGlobalUdl * inclinedS;
const inclinedQy = -inclinedGlobalUdl * inclinedC;
const inclinedTipAxial = inclinedQx * inclinedUdlLength ** 2 / (2 * uniformClosedFormEA);
const inclinedTipTransverse = inclinedQy * inclinedUdlLength ** 4 / (8 * closedFormEI);
const inclinedUdlSolution = runClosedFormFrameCase({
  id: 'inclined-cantilever-global-y-uniform-load',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: inclinedUdlDx, y: inclinedUdlDy, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false }],
  memberLoads: [{ caseId: 1, member: 1, w: inclinedGlobalUdl, dir: 'globalY' }],
});
assertNear(inclinedUdlSolution.d[3], inclinedC * inclinedTipAxial - inclinedS * inclinedTipTransverse, 1e-10, 'inclined member UDL global uX includes axial and flexural projections');
assertNear(inclinedUdlSolution.d[4], inclinedS * inclinedTipAxial + inclinedC * inclinedTipTransverse, 1e-10, 'inclined member UDL global uY includes axial and flexural projections');
assertNear(inclinedUdlSolution.d[5], inclinedQy * inclinedUdlLength ** 3 / (6 * closedFormEI), 1e-10, 'inclined member UDL rotation matches qyL^3/(6EI)');
assertNear(inclinedUdlSolution.reactions[1], inclinedGlobalUdl * inclinedUdlLength, 1e-10, 'inclined member UDL vertical reaction matches wL');
assertNear(inclinedUdlSolution.reactions[2], inclinedGlobalUdl * inclinedUdlLength * inclinedUdlDx / 2, 1e-10, 'inclined member UDL base moment matches resultant lever arm');

const doubleReleasedSolution = runClosedFormFrameCase({
  id: 'double-released-simple-beam-uniform-load',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: simpleSpan, y: 0, cx: false, cy: true, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: true, relJ: true }],
  memberLoads: [{ caseId: 1, member: 1, w: uniformLoad, dir: 'globalY' }],
});
assertNear(doubleReleasedSolution.reactions[1], uniformLoad * simpleSpan / 2, 1e-10, 'double-released simple beam left reaction matches wL/2');
assertNear(doubleReleasedSolution.reactions[4], uniformLoad * simpleSpan / 2, 1e-10, 'double-released simple beam right reaction matches wL/2');
assert(doubleReleasedSolution.inactiveDofs.includes(2) && doubleReleasedSolution.inactiveDofs.includes(5), 'double-released simple beam records only redundant nodal rotations as inactive', JSON.stringify(doubleReleasedSolution.inactiveDofs));
assertNear(doubleReleasedSolution.elems[0].qLocal[2], 0, 1e-10, 'double-released simple beam i-end moment is zero');
assertNear(doubleReleasedSolution.elems[0].qLocal[5], 0, 1e-10, 'double-released simple beam j-end moment is zero');

function runBlockedFrameCase(caseData) {
  const runtime = createFrameAnalysisContext(frameAnalysisHtml);
  let thrownMessage = '';
  try {
    runtime.context.loadFromData({
      schema: 'plane-frame.project.v1', tool: '平面剛架分析', version: frameMetadata.version,
      calculationEngine: frameMetadata.calculationEngine, unit: 'tf-m',
      project: { name: '', no: '', designer: '', note: caseData.id },
      defaults: { ...closedFormMaterial }, selfWeight: false, density: 7.85,
      loadCases: [{ id: 1, name: 'D' }], comboFactors: { 1: 1 },
      nodes: caseData.nodes, members: caseData.members,
      nodalLoads: caseData.nodalLoads || [], memberLoads: caseData.memberLoads || [], memberPointLoads: caseData.memberPointLoads || [],
    });
  } catch (error) {
    thrownMessage = String(error?.message || error);
    runtime.context.state.solution = null;
  }
  const errorText = thrownMessage || runtime.elements.get('errorMsg').textContent;
  assert(runtime.context.state.solution === null, `${caseData.id} unstable or invalid model is blocked`, errorText);
  return errorText;
}

const releasedColumnMechanismError = runBlockedFrameCase({
  id: 'double-released-column-sway-mechanism',
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: 0, y: 4, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: true, relJ: true }],
});
assert(releasedColumnMechanismError.includes('X 位移自由度沒有有效勁度'), 'double-released column translational mechanism is not hidden as a gauge', releasedColumnMechanismError);

const isolatedNodeError = runBlockedFrameCase({
  id: 'isolated-node-mechanism',
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: 4, y: 0, cx: false, cy: true, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 3, x: 8, y: 3, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false }],
});
assert(isolatedNodeError.includes('沒有有效勁度'), 'isolated node is blocked as an unstable model', isolatedNodeError);

const releasedMomentError = runBlockedFrameCase({
  id: 'released-rotation-with-nodal-moment',
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: simpleSpan, y: 0, cx: false, cy: true, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: true, relJ: true }],
  nodalLoads: [{ caseId: 1, node: 2, Fx: 0, Fy: 0, M: 3 }],
});
assert(releasedMomentError.includes('已由相接桿件釋放但仍承受外力'), 'moment on an inactive released rotation is blocked', releasedMomentError);

const outOfRangePointError = runBlockedFrameCase({
  id: 'member-point-load-outside-span',
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: simpleSpan, y: 0, cx: false, cy: true, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false }],
  memberPointLoads: [{ caseId: 1, member: 1, P: 5, a: simpleSpan + 0.5, dir: 'globalY' }],
});
assert(outOfRangePointError.includes('超出桿長'), 'out-of-range member point load is a fail-closed validation error', outOfRangePointError);

const springSpan = 5;
const springLoad = 20;
const springStiffness = 1000;
const axialStiffness = closedFormMaterial.E * closedFormMaterial.A / springSpan;
const springSolution = runClosedFormFrameCase({
  id: 'axial-bar-with-end-spring',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: springSpan, y: 0, cx: false, cy: true, crz: true, kx: springStiffness, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false }],
  nodalLoads: [{ caseId: 1, node: 2, Fx: springLoad, Fy: 0, M: 0 }],
});
const expectedSpringDisplacement = springLoad / (axialStiffness + springStiffness);
const expectedBarForce = axialStiffness * expectedSpringDisplacement;
const expectedSpringForce = springStiffness * expectedSpringDisplacement;
assertNear(springSolution.d[3], expectedSpringDisplacement, 1e-12, 'axial bar plus spring displacement matches P/(EA/L+k)');
assertNear(springSolution.reactions[0], -expectedBarForce, 1e-10, 'axial bar fixed-end reaction matches stiffness share');
assertNear(springSolution.reactions[3], -expectedSpringForce, 1e-10, 'axial spring reaction matches k times displacement');
assertNear(maxAbs(springSolution.elems[0].diag.Ns), expectedBarForce, 1e-10, 'axial member force matches EA/L stiffness share');
assertNear(springSolution.reactions[0] + springSolution.reactions[3], -springLoad, 1e-10, 'axial bar and spring reactions close global force balance');

function inclinedCantileverReference({ E, A, I, dx, dy, Fx, Fy }) {
  const L = Math.hypot(dx, dy);
  const c = dx / L;
  const s = dy / L;
  const EA = E * A;
  const EI = E * I * 1e-4;
  const localAxialLoad = c * Fx + s * Fy;
  const localTransverseLoad = -s * Fx + c * Fy;
  const localAxialDisplacement = localAxialLoad * L / EA;
  const localTransverseDisplacement = localTransverseLoad * L ** 3 / (3 * EI);
  const theta = localTransverseLoad * L ** 2 / (2 * EI);
  return {
    ux: c * localAxialDisplacement - s * localTransverseDisplacement,
    uy: s * localAxialDisplacement + c * localTransverseDisplacement,
    theta,
    reactionX: -Fx,
    reactionY: -Fy,
    reactionMoment: -(dx * Fy - dy * Fx),
    localAxialEndAction: -localAxialLoad,
    localAxialInternal: localAxialLoad,
    localShearReaction: -localTransverseLoad,
  };
}

const inclinedCantileverExpected = inclinedCantileverReference({
  ...closedFormMaterial,
  dx: 3,
  dy: 4,
  Fx: 0,
  Fy: -10,
});
const inclinedCantileverReferenceFixture = Object.freeze({
  ux: 0.07190121317474506,
  uy: -0.05431433783544181,
  theta: -0.027032871972318337,
  reactionX: 0,
  reactionY: 10,
  reactionMoment: 30,
  localAxialEndAction: 8,
  localAxialInternal: -8,
  localShearReaction: 6,
});
for (const [key, expected] of Object.entries(inclinedCantileverReferenceFixture)) {
  assertNear(inclinedCantileverExpected[key], expected, 1e-12, `inclined cantilever closed-form equations match frozen reference result: ${key}`);
}
const inclinedCantilever = runClosedFormFrameCase({
  id: 'inclined-cantilever-tip-vertical-load',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: 3, y: 4, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [{ id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false }],
  nodalLoads: [{ caseId: 1, node: 2, Fx: 0, Fy: -10, M: 0 }],
});
assertNear(inclinedCantilever.d[3], inclinedCantileverExpected.ux, 1e-10, 'inclined cantilever global uX retains axial-flexural coordinate transformation');
assertNear(inclinedCantilever.d[4], inclinedCantileverExpected.uy, 1e-10, 'inclined cantilever global uY retains axial-flexural coordinate transformation');
assertNear(inclinedCantilever.d[5], inclinedCantileverExpected.theta, 1e-10, 'inclined cantilever rotation matches local bending closed form');
assertNear(inclinedCantilever.reactions[0], inclinedCantileverExpected.reactionX, 1e-10, 'inclined cantilever base horizontal reaction matches statics');
assertNear(inclinedCantilever.reactions[1], inclinedCantileverExpected.reactionY, 1e-10, 'inclined cantilever base vertical reaction matches statics');
assertNear(inclinedCantilever.reactions[2], inclinedCantileverExpected.reactionMoment, 1e-10, 'inclined cantilever base moment matches r cross F');
assertNear(inclinedCantilever.elems[0].qLocal[0], inclinedCantileverExpected.localAxialEndAction, 1e-10, 'inclined cantilever local axial end action matches projected load');
assertNear(inclinedCantilever.elems[0].qLocal[1], inclinedCantileverExpected.localShearReaction, 1e-10, 'inclined cantilever local shear end force matches projected load');

function portalSideswayReference({ EA, EI, h, L, P }) {
  // Symmetric reduced slope-deflection system for an unbraced, fixed-base portal.
  // Unknowns are common story drift delta, common joint rotation theta, and
  // antisymmetric beam-end vertical displacement eta. Column axial flexibility
  // is retained instead of assuming EA is infinite.
  const columnAxial = EA / h;
  const beamVertical = 24 * EI / L ** 3;
  const beamRotationCoupling = 12 * EI / L ** 2;
  const jointRotational = 4 * EI / h + 6 * EI / L
    - beamRotationCoupling ** 2 / (columnAxial + beamVertical);
  const rotationPerDrift = -(6 * EI / h ** 2) / jointRotational;
  const storyStiffness = 24 * EI / h ** 3 + 12 * EI / h ** 2 * rotationPerDrift;
  const delta = P / storyStiffness;
  const theta = rotationPerDrift * delta;
  const eta = -beamRotationCoupling * theta / (columnAxial + beamVertical);
  return {
    delta,
    theta,
    eta,
    columnBaseMoment: 6 * EI / h ** 2 * delta + 2 * EI / h * theta,
    columnTopMoment: 6 * EI / h ** 2 * delta + 4 * EI / h * theta,
    beamEndMoment: 12 * EI / L ** 2 * eta + 6 * EI / L * theta,
    columnAxialForce: columnAxial * eta,
  };
}

const portalHeight = 4;
const portalSpan = 6;
const portalLateralLoad = 12;
const closedFormEA = closedFormMaterial.E * closedFormMaterial.A;
const portalSidesway = runClosedFormFrameCase({
  id: 'fixed-base-portal-sidesway-with-axial-flexibility',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: 0, y: portalHeight, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 3, x: portalSpan, y: portalHeight, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 4, x: portalSpan, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
  ],
  members: [
    { id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false },
    { id: 2, i: 2, j: 3, ...closedFormMaterial, relI: false, relJ: false },
    { id: 3, i: 4, j: 3, ...closedFormMaterial, relI: false, relJ: false },
  ],
  nodalLoads: [
    { caseId: 1, node: 2, Fx: portalLateralLoad / 2, Fy: 0, M: 0 },
    { caseId: 1, node: 3, Fx: portalLateralLoad / 2, Fy: 0, M: 0 },
  ],
});
const portalSideswayExpected = portalSideswayReference({
  EA: closedFormEA,
  EI: closedFormEI,
  h: portalHeight,
  L: portalSpan,
  P: portalLateralLoad,
});
const portalSideswayReferenceFixture = Object.freeze({
  delta: 0.01850737255450092,
  theta: -0.003486673589822547,
  eta: 0.0000992474151217497,
  columnBaseMoment: 14.41835680190092,
  columnTopMoment: 9.581643198099082,
  beamEndMoment: -9.58164319809908,
  columnAxialForce: 3.1938810660330272,
});
for (const [key, expected] of Object.entries(portalSideswayReferenceFixture)) {
  assertNear(portalSideswayExpected[key], expected, 1e-12, `portal sidesway reduced equations match frozen reference result: ${key}`);
}
assertNear(portalSidesway.d[3], portalSideswayExpected.delta, 1e-10, 'portal sidesway left joint drift matches reduced slope-deflection solution');
assertNear(portalSidesway.d[6], portalSideswayExpected.delta, 1e-10, 'portal sidesway right joint drift matches diaphragm-free symmetry solution');
assertNear(portalSidesway.d[4], portalSideswayExpected.eta, 1e-10, 'portal sidesway left joint vertical displacement retains column axial flexibility');
assertNear(portalSidesway.d[7], -portalSideswayExpected.eta, 1e-10, 'portal sidesway right joint vertical displacement is antisymmetric');
assertNear(portalSidesway.d[5], portalSideswayExpected.theta, 1e-10, 'portal sidesway left joint rotation matches reduced solution');
assertNear(portalSidesway.d[8], portalSideswayExpected.theta, 1e-10, 'portal sidesway right joint rotation is symmetric');
assertNear(portalSidesway.reactions[0], -portalLateralLoad / 2, 1e-10, 'portal sidesway left base takes half the story shear');
assertNear(portalSidesway.reactions[9], -portalLateralLoad / 2, 1e-10, 'portal sidesway right base takes half the story shear');
assertNear(portalSidesway.reactions[1], -portalSideswayExpected.columnAxialForce, 1e-10, 'portal sidesway left base vertical reaction matches axial-flexibility coupling');
assertNear(portalSidesway.reactions[10], portalSideswayExpected.columnAxialForce, 1e-10, 'portal sidesway right base vertical reaction is antisymmetric');
assertNear(portalSidesway.elems[0].qLocal[2], portalSideswayExpected.columnBaseMoment, 1e-10, 'portal sidesway left column base moment matches reduced solution');
assertNear(portalSidesway.elems[0].qLocal[5], portalSideswayExpected.columnTopMoment, 1e-10, 'portal sidesway left column top moment matches reduced solution');
assertNear(portalSidesway.elems[1].qLocal[2], portalSideswayExpected.beamEndMoment, 1e-10, 'portal sidesway beam left end moment matches reduced solution');
assertNear(portalSidesway.elems[1].qLocal[5], portalSideswayExpected.beamEndMoment, 1e-10, 'portal sidesway beam right end moment matches reduced solution');
assertNear(portalSideswayExpected.columnTopMoment + portalSideswayExpected.beamEndMoment, 0, 1e-10, 'portal sidesway independent joint moment equilibrium closes');

function elasticSupportPortalReference({ EA, EI, h, L, P, kx }) {
  // Equal horizontal base springs permit a common rigid-body translation while
  // fixed vertical/rotational base DOFs retain the fixed-base portal response.
  const upperFrame = portalSideswayReference({ EA, EI, h, L, P });
  const baseTranslation = P / (2 * kx);
  return {
    ...upperFrame,
    baseTranslation,
    topDisplacement: baseTranslation + upperFrame.delta,
    springReaction: -kx * baseTranslation,
  };
}

const portalHorizontalSpring = 1000;
const elasticSupportPortal = runClosedFormFrameCase({
  id: 'portal-sidesway-with-equal-horizontal-base-springs',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: false, cy: true, crz: true, kx: portalHorizontalSpring, ky: 0, krz: 0 },
    { id: 2, x: 0, y: portalHeight, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 3, x: portalSpan, y: portalHeight, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 4, x: portalSpan, y: 0, cx: false, cy: true, crz: true, kx: portalHorizontalSpring, ky: 0, krz: 0 },
  ],
  members: [
    { id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false },
    { id: 2, i: 2, j: 3, ...closedFormMaterial, relI: false, relJ: false },
    { id: 3, i: 4, j: 3, ...closedFormMaterial, relI: false, relJ: false },
  ],
  nodalLoads: [
    { caseId: 1, node: 2, Fx: portalLateralLoad / 2, Fy: 0, M: 0 },
    { caseId: 1, node: 3, Fx: portalLateralLoad / 2, Fy: 0, M: 0 },
  ],
});
const elasticSupportPortalExpected = elasticSupportPortalReference({
  EA: closedFormEA,
  EI: closedFormEI,
  h: portalHeight,
  L: portalSpan,
  P: portalLateralLoad,
  kx: portalHorizontalSpring,
});
const elasticSupportPortalReferenceFixture = Object.freeze({
  baseTranslation: 0.006,
  topDisplacement: 0.02450737255450092,
  delta: 0.01850737255450092,
  theta: -0.003486673589822547,
  eta: 0.0000992474151217497,
  springReaction: -6,
  columnBaseMoment: 14.41835680190092,
  beamEndMoment: -9.58164319809908,
});
for (const [key, expected] of Object.entries(elasticSupportPortalReferenceFixture)) {
  assertNear(elasticSupportPortalExpected[key], expected, 1e-12, `elastic-support portal closed-form equations match frozen reference result: ${key}`);
}
assertNear(elasticSupportPortal.d[0], elasticSupportPortalExpected.baseTranslation, 1e-10, 'elastic-support portal left base translation matches P/(2kx)');
assertNear(elasticSupportPortal.d[9], elasticSupportPortalExpected.baseTranslation, 1e-10, 'elastic-support portal right base translation matches P/(2kx)');
assertNear(elasticSupportPortal.d[3], elasticSupportPortalExpected.topDisplacement, 1e-10, 'elastic-support portal top displacement equals base translation plus frame drift');
assertNear(elasticSupportPortal.d[6], elasticSupportPortalExpected.topDisplacement, 1e-10, 'elastic-support portal right top displacement preserves symmetry');
assertNear(elasticSupportPortal.d[3] - elasticSupportPortal.d[0], elasticSupportPortalExpected.delta, 1e-10, 'elastic-support portal relative story drift matches fixed-base reduced solution');
assertNear(elasticSupportPortal.d[4], elasticSupportPortalExpected.eta, 1e-10, 'elastic-support portal retains column axial-flexibility displacement');
assertNear(elasticSupportPortal.d[5], elasticSupportPortalExpected.theta, 1e-10, 'elastic-support portal joint rotation matches fixed-base upper-frame response');
assertNear(elasticSupportPortal.reactions[0], elasticSupportPortalExpected.springReaction, 1e-10, 'elastic-support portal left horizontal spring reaction matches -kx times displacement');
assertNear(elasticSupportPortal.reactions[9], elasticSupportPortalExpected.springReaction, 1e-10, 'elastic-support portal right horizontal spring reaction matches -P/2');
assertNear(elasticSupportPortal.springForces[0], elasticSupportPortalExpected.springReaction, 1e-10, 'elastic-support portal exposes left spring force in the governed result chain');
assertNear(elasticSupportPortal.elems[0].qLocal[2], elasticSupportPortalExpected.columnBaseMoment, 1e-10, 'elastic-support portal column base moment matches reduced solution');
assertNear(elasticSupportPortal.elems[1].qLocal[2], elasticSupportPortalExpected.beamEndMoment, 1e-10, 'elastic-support portal beam end moment matches reduced solution');

function rotationalSpringCantileverReference({ EI, L, P, krz }) {
  // A horizontal tip force produces a clockwise rigid-body rotation at the
  // spring support. The tip response is the sum of that rotation and the
  // ordinary fixed-base Euler–Bernoulli cantilever deformation.
  const baseRotation = -P * L / krz;
  const rigidRotationDisplacement = -baseRotation * L;
  const flexuralDisplacement = P * L ** 3 / (3 * EI);
  const flexuralTipRotation = -P * L ** 2 / (2 * EI);
  return {
    baseRotation,
    rigidRotationDisplacement,
    flexuralDisplacement,
    topDisplacement: rigidRotationDisplacement + flexuralDisplacement,
    tipRotation: baseRotation + flexuralTipRotation,
    springReactionMoment: -krz * baseRotation,
    memberBaseMoment: P * L,
    memberBaseShear: P,
  };
}

const cantileverRotationalSpring = 5000;
const rotationalSpringCantilever = runClosedFormFrameCase({
  id: 'cantilever-with-base-rotational-spring',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: false, kx: 0, ky: 0, krz: cantileverRotationalSpring },
    { id: 2, x: 0, y: portalHeight, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [
    { id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false },
  ],
  nodalLoads: [{ caseId: 1, node: 2, Fx: 10, Fy: 0, M: 0 }],
});
const rotationalSpringCantileverExpected = rotationalSpringCantileverReference({
  EI: closedFormEI,
  L: portalHeight,
  P: 10,
  krz: cantileverRotationalSpring,
});
const rotationalSpringCantileverReferenceFixture = Object.freeze({
  baseRotation: -0.008,
  rigidRotationDisplacement: 0.032,
  flexuralDisplacement: 0.07689350249903883,
  topDisplacement: 0.10889350249903883,
  tipRotation: -0.03683506343713956,
  springReactionMoment: 40,
  memberBaseMoment: 40,
  memberBaseShear: 10,
});
for (const [key, expected] of Object.entries(rotationalSpringCantileverReferenceFixture)) {
  assertNear(rotationalSpringCantileverExpected[key], expected, 1e-12, `rotational-spring cantilever closed-form equations match frozen reference result: ${key}`);
}
assertNear(rotationalSpringCantilever.d[2], rotationalSpringCantileverExpected.baseRotation, 1e-10, 'rotational-spring cantilever base rotation matches -PL/krz');
assertNear(rotationalSpringCantilever.d[3], rotationalSpringCantileverExpected.topDisplacement, 1e-10, 'rotational-spring cantilever top displacement combines rigid rotation and beam flexure');
assertNear(rotationalSpringCantilever.d[5], rotationalSpringCantileverExpected.tipRotation, 1e-10, 'rotational-spring cantilever tip rotation combines base and beam rotations');
assertNear(rotationalSpringCantilever.reactions[0], -10, 1e-10, 'rotational-spring cantilever fixed horizontal base DOF balances the tip force');
assertNear(rotationalSpringCantilever.reactions[2], rotationalSpringCantileverExpected.springReactionMoment, 1e-10, 'rotational-spring cantilever spring reaction balances the load moment');
assertNear(rotationalSpringCantilever.springForces[2], rotationalSpringCantileverExpected.springReactionMoment, 1e-10, 'rotational-spring cantilever exposes rotational spring force in the governed result chain');
assertNear(rotationalSpringCantilever.elems[0].qLocal[2], rotationalSpringCantileverExpected.memberBaseMoment, 1e-10, 'rotational-spring cantilever member base moment matches PL');
assertNear(rotationalSpringCantilever.elems[0].qLocal[1], rotationalSpringCantileverExpected.memberBaseShear, 1e-10, 'rotational-spring cantilever member base shear matches P');

function twoStoryPortalReference({ EA, EI, h, L, P1, P2 }) {
  // Symmetry reduces the 18-DOF frame to
  // [delta1, theta1, eta1, delta2, theta2, eta2]. Column bending,
  // column axial deformation and beam bending are assembled independently
  // from their slope-deflection energy terms.
  const dofCount = 6;
  const reduced = Array.from({ length: dofCount }, () => Array(dofCount).fill(0));
  const addReducedElement = (local, maps, factor = 1) => {
    for (let a = 0; a < local.length; a += 1) {
      for (let b = 0; b < local.length; b += 1) {
        for (const [ia, ca] of maps[a]) {
          for (const [ib, cb] of maps[b]) reduced[ia][ib] += factor * ca * local[a][b] * cb;
        }
      }
    }
  };
  const bendingMatrix = (length) => {
    const scale = EI / length ** 3;
    return [
      [12, 6 * length, -12, 6 * length],
      [6 * length, 4 * length ** 2, -6 * length, 2 * length ** 2],
      [-12, -6 * length, 12, -6 * length],
      [6 * length, 2 * length ** 2, -6 * length, 4 * length ** 2],
    ].map(row => row.map(value => value * scale));
  };
  const columnBending = bendingMatrix(h);
  const beamBending = bendingMatrix(L);
  addReducedElement(columnBending, [[], [], [[0, -1]], [[1, 1]]], 2);
  addReducedElement(columnBending, [[[0, -1]], [[1, 1]], [[3, -1]], [[4, 1]]], 2);
  addReducedElement(beamBending, [[[2, 1]], [[1, 1]], [[2, -1]], [[1, 1]]]);
  addReducedElement(beamBending, [[[5, 1]], [[4, 1]], [[5, -1]], [[4, 1]]]);
  const columnAxial = [[EA / h, -EA / h], [-EA / h, EA / h]];
  addReducedElement(columnAxial, [[], [[2, 1]]], 2);
  addReducedElement(columnAxial, [[[2, 1]], [[5, 1]]], 2);

  const augmented = reduced.map((row, index) => [...row, [P1, 0, 0, P2, 0, 0][index]]);
  for (let pivot = 0; pivot < dofCount; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < dofCount; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) maxRow = row;
    }
    [augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]];
    const divisor = augmented[pivot][pivot];
    for (let col = pivot; col <= dofCount; col += 1) augmented[pivot][col] /= divisor;
    for (let row = 0; row < dofCount; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let col = pivot; col <= dofCount; col += 1) augmented[row][col] -= factor * augmented[pivot][col];
    }
  }
  const [delta1, theta1, eta1, delta2, theta2, eta2] = augmented.map(row => row[dofCount]);
  const matrixVector = (matrix, vector) => matrix.map(row => row.reduce((sum, value, index) => sum + value * vector[index], 0));
  const lowerColumn = matrixVector(columnBending, [0, 0, -delta1, theta1]);
  const upperColumn = matrixVector(columnBending, [-delta1, theta1, -delta2, theta2]);
  const firstFloorBeam = matrixVector(beamBending, [eta1, theta1, -eta1, theta1]);
  const roofBeam = matrixVector(beamBending, [eta2, theta2, -eta2, theta2]);
  return {
    delta1,
    theta1,
    eta1,
    delta2,
    theta2,
    eta2,
    baseReaction: -lowerColumn[0],
    lowerBaseMoment: lowerColumn[1],
    lowerTopMoment: lowerColumn[3],
    upperBaseMoment: upperColumn[1],
    firstFloorBeamMoment: firstFloorBeam[1],
    roofBeamMoment: roofBeam[1],
  };
}

const twoStoryFirstFloorLoad = 8;
const twoStoryRoofLoad = 6;
const twoStoryPortal = runClosedFormFrameCase({
  id: 'two-story-single-bay-rigid-portal-sidesway',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: 0, y: portalHeight, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 3, x: 0, y: portalHeight * 2, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 4, x: portalSpan, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 5, x: portalSpan, y: portalHeight, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 6, x: portalSpan, y: portalHeight * 2, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [
    { id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false },
    { id: 2, i: 2, j: 3, ...closedFormMaterial, relI: false, relJ: false },
    { id: 3, i: 4, j: 5, ...closedFormMaterial, relI: false, relJ: false },
    { id: 4, i: 5, j: 6, ...closedFormMaterial, relI: false, relJ: false },
    { id: 5, i: 2, j: 5, ...closedFormMaterial, relI: false, relJ: false },
    { id: 6, i: 3, j: 6, ...closedFormMaterial, relI: false, relJ: false },
  ],
  nodalLoads: [
    { caseId: 1, node: 2, Fx: twoStoryFirstFloorLoad / 2, Fy: 0, M: 0 },
    { caseId: 1, node: 5, Fx: twoStoryFirstFloorLoad / 2, Fy: 0, M: 0 },
    { caseId: 1, node: 3, Fx: twoStoryRoofLoad / 2, Fy: 0, M: 0 },
    { caseId: 1, node: 6, Fx: twoStoryRoofLoad / 2, Fy: 0, M: 0 },
  ],
});
const twoStoryPortalExpected = twoStoryPortalReference({
  EA: closedFormEA,
  EI: closedFormEI,
  h: portalHeight,
  L: portalSpan,
  P1: twoStoryFirstFloorLoad,
  P2: twoStoryRoofLoad,
});
const twoStoryPortalReferenceFixture = Object.freeze({
  delta1: 0.024130842805587416,
  theta1: -0.005337239934127811,
  eta1: 0.000230965376896191,
  delta2: 0.04633318002480235,
  theta2: -0.0028804223317657014,
  eta2: 0.00031076452016911974,
  baseReaction: -7,
  lowerBaseMoment: 17.70190961831105,
  lowerTopMoment: 10.29809038168895,
  upperBaseMoment: 4.2959513110016365,
  firstFloorBeamMoment: -14.594041692690602,
  roofBeamMoment: -7.704048688998361,
});
for (const [key, expected] of Object.entries(twoStoryPortalReferenceFixture)) {
  assertNear(twoStoryPortalExpected[key], expected, 1e-12, `two-story portal reduced equations match frozen reference result: ${key}`);
}
assertNear(twoStoryPortal.d[3], twoStoryPortalExpected.delta1, 1e-10, 'two-story portal first-floor drift matches reduced solution');
assertNear(twoStoryPortal.d[6], twoStoryPortalExpected.delta2, 1e-10, 'two-story portal roof drift matches reduced solution');
assertNear(twoStoryPortal.d[4], twoStoryPortalExpected.eta1, 1e-10, 'two-story portal first-floor vertical displacement retains axial coupling');
assertNear(twoStoryPortal.d[7], twoStoryPortalExpected.eta2, 1e-10, 'two-story portal roof vertical displacement retains axial coupling');
assertNear(twoStoryPortal.d[5], twoStoryPortalExpected.theta1, 1e-10, 'two-story portal first-floor rotation matches reduced solution');
assertNear(twoStoryPortal.d[8], twoStoryPortalExpected.theta2, 1e-10, 'two-story portal roof rotation matches reduced solution');
assertNear(twoStoryPortal.d[12], twoStoryPortalExpected.delta1, 1e-10, 'two-story portal right first floor preserves sway symmetry');
assertNear(twoStoryPortal.d[15], twoStoryPortalExpected.delta2, 1e-10, 'two-story portal right roof preserves sway symmetry');
assertNear(twoStoryPortal.d[13], -twoStoryPortalExpected.eta1, 1e-10, 'two-story portal right first-floor vertical displacement is antisymmetric');
assertNear(twoStoryPortal.reactions[0], twoStoryPortalExpected.baseReaction, 1e-10, 'two-story portal left base takes half the total story shear');
assertNear(twoStoryPortal.reactions[9], twoStoryPortalExpected.baseReaction, 1e-10, 'two-story portal right base takes half the total story shear');
assertNear(twoStoryPortal.elems[0].qLocal[2], twoStoryPortalExpected.lowerBaseMoment, 1e-10, 'two-story portal lower column base moment matches reduced solution');
assertNear(twoStoryPortal.elems[0].qLocal[5], twoStoryPortalExpected.lowerTopMoment, 1e-10, 'two-story portal lower column top moment matches reduced solution');
assertNear(twoStoryPortal.elems[1].qLocal[2], twoStoryPortalExpected.upperBaseMoment, 1e-10, 'two-story portal upper column base moment matches reduced solution');
assertNear(twoStoryPortal.elems[4].qLocal[2], twoStoryPortalExpected.firstFloorBeamMoment, 1e-10, 'two-story portal first-floor beam moment matches reduced solution');
assertNear(twoStoryPortal.elems[5].qLocal[2], twoStoryPortalExpected.roofBeamMoment, 1e-10, 'two-story portal roof beam moment matches reduced solution');
assertNear(twoStoryPortal.elems[0].qLocal[5] + twoStoryPortal.elems[1].qLocal[2] + twoStoryPortal.elems[4].qLocal[2], 0, 1e-10, 'two-story portal first-floor joint moment equilibrium closes');

function portalSymmetricUdlReference({ EA, EI, h, L, w }) {
  // Symmetric non-sway equations with beam axial deformation retained. The
  // left/right joint horizontal displacements are equal and opposite; column
  // axial shortening follows directly from the vertical reaction wL/2.
  const horizontalJointStiffness = 12 * EI / h ** 3 + 2 * EA / L;
  const coupling = 6 * EI / h ** 2;
  const rotationalJointStiffness = 4 * EI / h + 2 * EI / L;
  const fixedEndMoment = w * L ** 2 / 12;
  const theta = -fixedEndMoment / (rotationalJointStiffness - coupling ** 2 / horizontalJointStiffness);
  const xi = -coupling * theta / horizontalJointStiffness;
  const vertical = -(w * L / 2) * h / EA;
  return {
    theta,
    xi,
    vertical,
    horizontalReaction: 2 * EA / L * xi,
    columnBaseMoment: coupling * xi + 2 * EI / h * theta,
    columnTopMoment: coupling * xi + 4 * EI / h * theta,
    beamLeftMoment: 2 * EI / L * theta + fixedEndMoment,
  };
}

const portalUniformLoad = 2;
const portalSymmetricUdl = runClosedFormFrameCase({
  id: 'fixed-base-portal-symmetric-beam-uniform-load',
  ...closedFormMaterial,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: 0, y: portalHeight, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 3, x: portalSpan, y: portalHeight, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 4, x: portalSpan, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
  ],
  members: [
    { id: 1, i: 1, j: 2, ...closedFormMaterial, relI: false, relJ: false },
    { id: 2, i: 2, j: 3, ...closedFormMaterial, relI: false, relJ: false },
    { id: 3, i: 4, j: 3, ...closedFormMaterial, relI: false, relJ: false },
  ],
  memberLoads: [{ caseId: 1, member: 2, w: portalUniformLoad, dir: 'globalY' }],
});
const portalSymmetricExpected = portalSymmetricUdlReference({
  EA: closedFormEA,
  EI: closedFormEI,
  h: portalHeight,
  L: portalSpan,
  w: portalUniformLoad,
});
const portalSymmetricReferenceFixture = Object.freeze({
  theta: -0.001632975051870897,
  xi: 0.000039120830335277117,
  vertical: -0.0001864454181038501,
  horizontalReaction: 1.6785965880260705,
  columnBaseMoment: -2.224561680074486,
  columnTopMoment: -4.489824672029795,
  beamLeftMoment: 4.489824672029794,
});
for (const [key, expected] of Object.entries(portalSymmetricReferenceFixture)) {
  assertNear(portalSymmetricExpected[key], expected, 1e-12, `portal symmetric UDL reduced equations match frozen reference result: ${key}`);
}
assertNear(portalSymmetricUdl.d[3], portalSymmetricExpected.xi, 1e-10, 'portal symmetric UDL left joint horizontal displacement matches reduced solution');
assertNear(portalSymmetricUdl.d[6], -portalSymmetricExpected.xi, 1e-10, 'portal symmetric UDL right joint horizontal displacement is mirrored');
assertNear(portalSymmetricUdl.d[4], portalSymmetricExpected.vertical, 1e-10, 'portal symmetric UDL left column axial shortening matches wLh/(2EA)');
assertNear(portalSymmetricUdl.d[7], portalSymmetricExpected.vertical, 1e-10, 'portal symmetric UDL right column axial shortening matches wLh/(2EA)');
assertNear(portalSymmetricUdl.d[5], portalSymmetricExpected.theta, 1e-10, 'portal symmetric UDL left joint rotation matches reduced solution');
assertNear(portalSymmetricUdl.d[8], -portalSymmetricExpected.theta, 1e-10, 'portal symmetric UDL right joint rotation is mirrored');
assertNear(portalSymmetricUdl.reactions[0], portalSymmetricExpected.horizontalReaction, 1e-10, 'portal symmetric UDL left base horizontal reaction matches beam axial restraint');
assertNear(portalSymmetricUdl.reactions[9], -portalSymmetricExpected.horizontalReaction, 1e-10, 'portal symmetric UDL right base horizontal reaction is mirrored');
assertNear(portalSymmetricUdl.reactions[1], portalUniformLoad * portalSpan / 2, 1e-10, 'portal symmetric UDL left base vertical reaction matches wL/2');
assertNear(portalSymmetricUdl.reactions[10], portalUniformLoad * portalSpan / 2, 1e-10, 'portal symmetric UDL right base vertical reaction matches wL/2');
assertNear(portalSymmetricUdl.elems[0].qLocal[2], portalSymmetricExpected.columnBaseMoment, 1e-10, 'portal symmetric UDL left column base moment matches reduced solution');
assertNear(portalSymmetricUdl.elems[0].qLocal[5], portalSymmetricExpected.columnTopMoment, 1e-10, 'portal symmetric UDL left column top moment matches reduced solution');
assertNear(portalSymmetricUdl.elems[1].qLocal[2], portalSymmetricExpected.beamLeftMoment, 1e-10, 'portal symmetric UDL beam left end moment matches fixed-end plus rotation solution');
assertNear(portalSymmetricUdl.elems[1].qLocal[5], -portalSymmetricExpected.beamLeftMoment, 1e-10, 'portal symmetric UDL beam right end moment is mirrored');
assertNear(portalSymmetricExpected.columnTopMoment + portalSymmetricExpected.beamLeftMoment, 0, 1e-10, 'portal symmetric UDL independent joint moment equilibrium closes');

const asymmetricTwoStoryReferenceModel = {
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 2, x: 0, y: 3.6, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 3, x: 0, y: 8.1, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 4, x: 7.5, y: 0, cx: true, cy: true, crz: true, kx: 0, ky: 0, krz: 0 },
    { id: 5, x: 7.5, y: 3.6, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
    { id: 6, x: 7.5, y: 8.1, cx: false, cy: false, crz: false, kx: 0, ky: 0, krz: 0 },
  ],
  members: [
    { id: 1, i: 1, j: 2, E: 2040, A: 72, I: 18000, relI: false, relJ: false },
    { id: 2, i: 2, j: 3, E: 2040, A: 58, I: 11200, relI: false, relJ: false },
    { id: 3, i: 4, j: 5, E: 2040, A: 54, I: 9000, relI: false, relJ: false },
    { id: 4, i: 5, j: 6, E: 2040, A: 78, I: 21000, relI: false, relJ: false },
    { id: 5, i: 2, j: 5, E: 2040, A: 65, I: 24000, relI: false, relJ: false },
    { id: 6, i: 3, j: 6, E: 2040, A: 48, I: 13500, relI: false, relJ: false },
  ],
  nodalLoads: [
    { caseId: 1, node: 2, Fx: 5, Fy: 0, M: 0 },
    { caseId: 1, node: 5, Fx: 2, Fy: 0, M: 0 },
    { caseId: 1, node: 3, Fx: 4, Fy: -2, M: 0 },
    { caseId: 1, node: 6, Fx: 1.5, Fy: -5, M: 0 },
  ],
};

function independentRigidFrameReference(model) {
  // This reference path intentionally does not call the production matrix,
  // transformation or Gaussian-elimination helpers. It assembles a fresh
  // unreleased 2D-frame matrix and solves the free block by Cholesky factors.
  const dofCount = model.nodes.length * 3;
  const stiffness = Array.from({ length: dofCount }, () => Array(dofCount).fill(0));
  const force = Array(dofCount).fill(0);
  const nodeIndex = new Map(model.nodes.map((node, index) => [node.id, index]));
  const transposeReference = matrix => matrix[0].map((unused, column) => matrix.map(row => row[column]));
  const multiplyReference = (left, right) => left.map(row => right[0].map((unused, column) =>
    row.reduce((sum, value, index) => sum + value * right[index][column], 0)));
  const matrixVectorReference = (matrix, vector) => matrix.map(row =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0));
  const elements = [];

  for (const load of model.nodalLoads) {
    const offset = nodeIndex.get(load.node) * 3;
    force[offset] += load.Fx;
    force[offset + 1] += load.Fy;
    force[offset + 2] += load.M;
  }

  for (const member of model.members) {
    const iIndex = nodeIndex.get(member.i);
    const jIndex = nodeIndex.get(member.j);
    const ni = model.nodes[iIndex];
    const nj = model.nodes[jIndex];
    const dx = nj.x - ni.x;
    const dy = nj.y - ni.y;
    const length = Math.hypot(dx, dy);
    const cosine = dx / length;
    const sine = dy / length;
    const axialRigidity = member.E * member.A;
    const flexuralRigidity = member.E * member.I * 1e-4;
    const axial = axialRigidity / length;
    const shear = 12 * flexuralRigidity / length ** 3;
    const coupling = 6 * flexuralRigidity / length ** 2;
    const rotation = 4 * flexuralRigidity / length;
    const carryOver = 2 * flexuralRigidity / length;
    const local = [
      [axial, 0, 0, -axial, 0, 0],
      [0, shear, coupling, 0, -shear, coupling],
      [0, coupling, rotation, 0, -coupling, carryOver],
      [-axial, 0, 0, axial, 0, 0],
      [0, -shear, -coupling, 0, shear, -coupling],
      [0, coupling, carryOver, 0, -coupling, rotation],
    ];
    const transform = [
      [cosine, sine, 0, 0, 0, 0],
      [-sine, cosine, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 0, 0, cosine, sine, 0],
      [0, 0, 0, -sine, cosine, 0],
      [0, 0, 0, 0, 0, 1],
    ];
    const global = multiplyReference(transposeReference(transform), multiplyReference(local, transform));
    const dofs = [iIndex * 3, iIndex * 3 + 1, iIndex * 3 + 2, jIndex * 3, jIndex * 3 + 1, jIndex * 3 + 2];
    for (let row = 0; row < 6; row += 1) {
      for (let column = 0; column < 6; column += 1) stiffness[dofs[row]][dofs[column]] += global[row][column];
    }
    elements.push({ member, local, transform, dofs });
  }

  const constrained = new Set();
  model.nodes.forEach((node, index) => {
    if (node.cx) constrained.add(index * 3);
    if (node.cy) constrained.add(index * 3 + 1);
    if (node.crz) constrained.add(index * 3 + 2);
  });
  const free = Array.from({ length: dofCount }, (unused, index) => index).filter(index => !constrained.has(index));
  const reduced = free.map(row => free.map(column => stiffness[row][column]));
  const rhs = free.map(index => force[index]);
  const lower = Array.from({ length: free.length }, () => Array(free.length).fill(0));
  for (let row = 0; row < free.length; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let value = reduced[row][column];
      for (let k = 0; k < column; k += 1) value -= lower[row][k] * lower[column][k];
      if (row === column) {
        assert(value > 0, 'asymmetric reference matrix is positive definite', `pivot=${row}, value=${value}`);
        lower[row][column] = Math.sqrt(value);
      } else {
        lower[row][column] = value / lower[column][column];
      }
    }
  }
  const forward = Array(free.length).fill(0);
  for (let row = 0; row < free.length; row += 1) {
    let value = rhs[row];
    for (let column = 0; column < row; column += 1) value -= lower[row][column] * forward[column];
    forward[row] = value / lower[row][row];
  }
  const reducedDisplacement = Array(free.length).fill(0);
  for (let row = free.length - 1; row >= 0; row -= 1) {
    let value = forward[row];
    for (let column = row + 1; column < free.length; column += 1) value -= lower[column][row] * reducedDisplacement[column];
    reducedDisplacement[row] = value / lower[row][row];
  }
  const displacement = Array(dofCount).fill(0);
  free.forEach((dof, index) => { displacement[dof] = reducedDisplacement[index]; });
  const reactions = matrixVectorReference(stiffness, displacement).map((value, index) => value - force[index]);
  const memberEnds = new Map(elements.map(element => {
    const localDisplacement = matrixVectorReference(element.transform, element.dofs.map(dof => displacement[dof]));
    return [element.member.id, matrixVectorReference(element.local, localDisplacement)];
  }));
  return { displacement, reactions, memberEnds };
}

const asymmetricTwoStoryReference = independentRigidFrameReference(asymmetricTwoStoryReferenceModel);
const asymmetricTwoStoryReferenceFixture = Object.freeze({
  node2Ux: 0.01563750047845189,
  node5Ux: 0.015677527076888936,
  node3Ux: 0.03747731922829581,
  node6Uy: -0.0005341859051808281,
  node2Theta: -0.003985666241181421,
  node6Theta: -0.0036904347767222193,
  node1Rx: -7.993117841862814,
  node4Rx: -4.506882158137321,
  member1IMoment: 18.452991681358117,
  member3IMoment: 9.850224594883318,
  member5IMoment: -14.631450030659714,
  member6JMoment: -6.963410893302524,
});
const asymmetricTwoStoryReferenceResults = {
  node2Ux: asymmetricTwoStoryReference.displacement[3],
  node5Ux: asymmetricTwoStoryReference.displacement[12],
  node3Ux: asymmetricTwoStoryReference.displacement[6],
  node6Uy: asymmetricTwoStoryReference.displacement[16],
  node2Theta: asymmetricTwoStoryReference.displacement[5],
  node6Theta: asymmetricTwoStoryReference.displacement[17],
  node1Rx: asymmetricTwoStoryReference.reactions[0],
  node4Rx: asymmetricTwoStoryReference.reactions[9],
  member1IMoment: asymmetricTwoStoryReference.memberEnds.get(1)[2],
  member3IMoment: asymmetricTwoStoryReference.memberEnds.get(3)[2],
  member5IMoment: asymmetricTwoStoryReference.memberEnds.get(5)[2],
  member6JMoment: asymmetricTwoStoryReference.memberEnds.get(6)[5],
};
for (const [key, expected] of Object.entries(asymmetricTwoStoryReferenceFixture)) {
  assertNear(asymmetricTwoStoryReferenceResults[key], expected, 1e-12, `asymmetric two-story independent matrix matches frozen reference result: ${key}`);
}
assertNear(asymmetricTwoStoryReference.reactions[0] + asymmetricTwoStoryReference.reactions[9], -12.5, 1e-10, 'asymmetric two-story independent horizontal reactions close');
assertNear(asymmetricTwoStoryReference.reactions[1] + asymmetricTwoStoryReference.reactions[10], 7, 1e-10, 'asymmetric two-story independent vertical reactions close');
assertNear(asymmetricTwoStoryReference.reactions[2] + asymmetricTwoStoryReference.reactions[10] * 7.5 + asymmetricTwoStoryReference.reactions[11], 107.25, 1e-10, 'asymmetric two-story independent support moment closes about the origin');

const asymmetricTwoStoryPortal = runClosedFormFrameCase({
  id: 'asymmetric-two-story-single-bay-rigid-frame',
  E: 2040,
  A: 72,
  I: 18000,
  ...asymmetricTwoStoryReferenceModel,
});
const asymmetricProductionResults = {
  node2Ux: asymmetricTwoStoryPortal.d[3],
  node5Ux: asymmetricTwoStoryPortal.d[12],
  node3Ux: asymmetricTwoStoryPortal.d[6],
  node6Uy: asymmetricTwoStoryPortal.d[16],
  node2Theta: asymmetricTwoStoryPortal.d[5],
  node6Theta: asymmetricTwoStoryPortal.d[17],
  node1Rx: asymmetricTwoStoryPortal.reactions[0],
  node4Rx: asymmetricTwoStoryPortal.reactions[9],
  member1IMoment: asymmetricTwoStoryPortal.elems.find(element => element.m.id === 1).qLocal[2],
  member3IMoment: asymmetricTwoStoryPortal.elems.find(element => element.m.id === 3).qLocal[2],
  member5IMoment: asymmetricTwoStoryPortal.elems.find(element => element.m.id === 5).qLocal[2],
  member6JMoment: asymmetricTwoStoryPortal.elems.find(element => element.m.id === 6).qLocal[5],
};
for (const [key, expected] of Object.entries(asymmetricTwoStoryReferenceFixture)) {
  assertNear(asymmetricProductionResults[key], expected, 1e-10, `asymmetric two-story production solver matches independent reference: ${key}`);
}

function runInteractiveFrameBenchmark(kind) {
  const runtime = createFrameAnalysisContext(frameAnalysisHtml);
  const projectData = runtime.context.frameBenchmarkProjectData(kind);
  runtime.context.loadFromData(JSON.parse(JSON.stringify(projectData)));
  runtime.context.state.benchmarkId = kind;
  return {
    definition: runtime.context.getFrameBenchmarkDefinition(kind),
    projectData,
    model: runtime.context.frameBenchmarkResultModel(),
    storyResponse: runtime.context.frameStoryResponseModel(),
    runtimeState: JSON.parse(JSON.stringify(runtime.context.state)),
  };
}

const interactiveSidesway = runInteractiveFrameBenchmark('portalSideswayBenchmark');
assert(interactiveSidesway.definition.id === 'PF-BM-PORTAL-SWAY-01', 'interactive portal sidesway exposes stable case id', interactiveSidesway.definition.id);
assert(interactiveSidesway.projectData.version === frameMetadata.version, 'interactive portal sidesway uses current public version', interactiveSidesway.projectData.version);
assert(interactiveSidesway.projectData.calculationEngine === frameMetadata.calculationEngine, 'interactive portal sidesway records canonical engine', interactiveSidesway.projectData.calculationEngine);
assert(interactiveSidesway.projectData.nodes.length === 4 && interactiveSidesway.projectData.members.length === 3, 'interactive portal sidesway loads the governed four-node three-member model', `${interactiveSidesway.projectData.nodes.length}/${interactiveSidesway.projectData.members.length}`);
assert(interactiveSidesway.projectData.nodalLoads.length === 2 && interactiveSidesway.projectData.nodalLoads.every(load => load.Fx === 6), 'interactive portal sidesway loads two equal 6 tf joint forces', JSON.stringify(interactiveSidesway.projectData.nodalLoads));
assert(interactiveSidesway.model.pass === true && interactiveSidesway.model.rows.length === 6, 'interactive portal sidesway passes every visible reference comparison', `${interactiveSidesway.model.pass}/${interactiveSidesway.model.rows.length}`);
assertNear(interactiveSidesway.definition.metrics[0].expected, portalSideswayReferenceFixture.delta * 1000, 1e-12, 'interactive portal sidesway drift reference matches frozen fixture');
assertNear(interactiveSidesway.definition.metrics[1].expected, portalSideswayReferenceFixture.eta * 1000, 1e-12, 'interactive portal sidesway axial-flexibility displacement reference matches frozen fixture');
assertNear(interactiveSidesway.definition.metrics[2].expected, portalSideswayReferenceFixture.theta * 1000, 1e-12, 'interactive portal sidesway rotation reference matches frozen fixture');
assertNear(interactiveSidesway.definition.metrics[4].expected, portalSideswayReferenceFixture.columnBaseMoment, 1e-12, 'interactive portal sidesway column moment reference matches frozen fixture');
assertNear(interactiveSidesway.definition.metrics[5].expected, portalSideswayReferenceFixture.beamEndMoment, 1e-12, 'interactive portal sidesway beam moment reference matches frozen fixture');

const interactiveSymmetricUdl = runInteractiveFrameBenchmark('portalSymmetricUdlBenchmark');
assert(interactiveSymmetricUdl.definition.id === 'PF-BM-PORTAL-UDL-01', 'interactive portal symmetric UDL exposes stable case id', interactiveSymmetricUdl.definition.id);
assert(interactiveSymmetricUdl.projectData.memberLoads.length === 1 && interactiveSymmetricUdl.projectData.memberLoads[0].w === 2, 'interactive portal symmetric UDL loads the governed 2 tf/m beam load', JSON.stringify(interactiveSymmetricUdl.projectData.memberLoads));
assert(interactiveSymmetricUdl.model.pass === true && interactiveSymmetricUdl.model.rows.length === 6, 'interactive portal symmetric UDL passes every visible reference comparison', `${interactiveSymmetricUdl.model.pass}/${interactiveSymmetricUdl.model.rows.length}`);
assertNear(interactiveSymmetricUdl.definition.metrics[0].expected, portalSymmetricReferenceFixture.xi * 1000, 1e-12, 'interactive portal symmetric UDL horizontal displacement reference matches frozen fixture');
assertNear(interactiveSymmetricUdl.definition.metrics[1].expected, portalSymmetricReferenceFixture.vertical * 1000, 1e-12, 'interactive portal symmetric UDL vertical displacement reference matches frozen fixture');
assertNear(interactiveSymmetricUdl.definition.metrics[2].expected, portalSymmetricReferenceFixture.theta * 1000, 1e-12, 'interactive portal symmetric UDL rotation reference matches frozen fixture');
assertNear(interactiveSymmetricUdl.definition.metrics[3].expected, portalSymmetricReferenceFixture.horizontalReaction, 1e-12, 'interactive portal symmetric UDL horizontal reaction reference matches frozen fixture');
assertNear(interactiveSymmetricUdl.definition.metrics[5].expected, portalSymmetricReferenceFixture.beamLeftMoment, 1e-12, 'interactive portal symmetric UDL beam moment reference matches frozen fixture');

const interactiveInclinedCantilever = runInteractiveFrameBenchmark('inclinedCantileverBenchmark');
assert(interactiveInclinedCantilever.definition.id === 'PF-BM-INCLINED-CANTILEVER-01', 'interactive inclined cantilever exposes stable case id', interactiveInclinedCantilever.definition.id);
assert(interactiveInclinedCantilever.projectData.nodes.length === 2 && interactiveInclinedCantilever.projectData.members.length === 1, 'interactive inclined cantilever loads the governed 3-4-5 single-member model', `${interactiveInclinedCantilever.projectData.nodes.length}/${interactiveInclinedCantilever.projectData.members.length}`);
assert(interactiveInclinedCantilever.projectData.nodalLoads.length === 1 && interactiveInclinedCantilever.projectData.nodalLoads[0].Fy === -10, 'interactive inclined cantilever loads the governed 10 tf downward joint force', JSON.stringify(interactiveInclinedCantilever.projectData.nodalLoads));
assert(interactiveInclinedCantilever.model.pass === true && interactiveInclinedCantilever.model.rows.length === 7, 'interactive inclined cantilever passes every visible coordinate-transformation comparison', `${interactiveInclinedCantilever.model.pass}/${interactiveInclinedCantilever.model.rows.length}`);
assertNear(interactiveInclinedCantilever.definition.metrics[0].expected, inclinedCantileverReferenceFixture.ux * 1000, 1e-12, 'interactive inclined cantilever horizontal displacement reference matches frozen fixture');
assertNear(interactiveInclinedCantilever.definition.metrics[1].expected, inclinedCantileverReferenceFixture.uy * 1000, 1e-12, 'interactive inclined cantilever vertical displacement reference matches frozen fixture');
assertNear(interactiveInclinedCantilever.definition.metrics[2].expected, inclinedCantileverReferenceFixture.theta * 1000, 1e-12, 'interactive inclined cantilever rotation reference matches frozen fixture');
assertNear(interactiveInclinedCantilever.definition.metrics[4].expected, inclinedCantileverReferenceFixture.reactionMoment, 1e-12, 'interactive inclined cantilever support moment reference matches frozen fixture');
assertNear(interactiveInclinedCantilever.definition.metrics[5].expected, inclinedCantileverReferenceFixture.localAxialInternal, 1e-12, 'interactive inclined cantilever tension-positive axial-force reference matches frozen fixture');
assertNear(interactiveInclinedCantilever.definition.metrics[6].expected, inclinedCantileverReferenceFixture.localShearReaction, 1e-12, 'interactive inclined cantilever local shear reference matches frozen fixture');

const interactiveElasticSupportPortal = runInteractiveFrameBenchmark('elasticSupportPortalBenchmark');
assert(interactiveElasticSupportPortal.definition.id === 'PF-BM-PORTAL-HSPRING-01', 'interactive elastic-support portal exposes stable case id', interactiveElasticSupportPortal.definition.id);
assert(interactiveElasticSupportPortal.projectData.nodes.length === 4 && interactiveElasticSupportPortal.projectData.members.length === 3, 'interactive elastic-support portal loads the governed four-node three-member model', `${interactiveElasticSupportPortal.projectData.nodes.length}/${interactiveElasticSupportPortal.projectData.members.length}`);
assert(interactiveElasticSupportPortal.projectData.nodes.filter(node => node.kx === portalHorizontalSpring).length === 2, 'interactive elastic-support portal assigns equal horizontal springs to both bases', JSON.stringify(interactiveElasticSupportPortal.projectData.nodes));
assert(interactiveElasticSupportPortal.model.pass === true && interactiveElasticSupportPortal.model.rows.length === 7, 'interactive elastic-support portal passes every visible spring-response comparison', `${interactiveElasticSupportPortal.model.pass}/${interactiveElasticSupportPortal.model.rows.length}`);
assertNear(interactiveElasticSupportPortal.definition.metrics[0].expected, elasticSupportPortalReferenceFixture.baseTranslation * 1000, 1e-12, 'interactive elastic-support portal base translation reference matches frozen fixture');
assertNear(interactiveElasticSupportPortal.definition.metrics[1].expected, elasticSupportPortalReferenceFixture.topDisplacement * 1000, 1e-12, 'interactive elastic-support portal top displacement reference matches frozen fixture');
assertNear(interactiveElasticSupportPortal.definition.metrics[2].expected, elasticSupportPortalReferenceFixture.eta * 1000, 1e-12, 'interactive elastic-support portal vertical displacement reference matches frozen fixture');
assertNear(interactiveElasticSupportPortal.definition.metrics[3].expected, elasticSupportPortalReferenceFixture.theta * 1000, 1e-12, 'interactive elastic-support portal rotation reference matches frozen fixture');
assertNear(interactiveElasticSupportPortal.definition.metrics[4].expected, elasticSupportPortalReferenceFixture.springReaction, 1e-12, 'interactive elastic-support portal spring reaction reference matches frozen fixture');
assertNear(interactiveElasticSupportPortal.definition.metrics[5].expected, elasticSupportPortalReferenceFixture.columnBaseMoment, 1e-12, 'interactive elastic-support portal column base moment reference matches frozen fixture');
assertNear(interactiveElasticSupportPortal.definition.metrics[6].expected, elasticSupportPortalReferenceFixture.beamEndMoment, 1e-12, 'interactive elastic-support portal beam end moment reference matches frozen fixture');

const interactiveRotationalSpringCantilever = runInteractiveFrameBenchmark('rotationalSpringCantileverBenchmark');
assert(interactiveRotationalSpringCantilever.definition.id === 'PF-BM-CANTILEVER-RSPRING-01', 'interactive rotational-spring cantilever exposes stable case id', interactiveRotationalSpringCantilever.definition.id);
assert(interactiveRotationalSpringCantilever.projectData.nodes.length === 2 && interactiveRotationalSpringCantilever.projectData.members.length === 1, 'interactive rotational-spring cantilever loads the governed two-node one-member model', `${interactiveRotationalSpringCantilever.projectData.nodes.length}/${interactiveRotationalSpringCantilever.projectData.members.length}`);
assert(interactiveRotationalSpringCantilever.projectData.nodes[0].krz === cantileverRotationalSpring && interactiveRotationalSpringCantilever.projectData.nodes[0].crz === false, 'interactive rotational-spring cantilever assigns an active base rotational spring', JSON.stringify(interactiveRotationalSpringCantilever.projectData.nodes[0]));
assert(interactiveRotationalSpringCantilever.projectData.nodalLoads.length === 1 && interactiveRotationalSpringCantilever.projectData.nodalLoads[0].Fx === 10, 'interactive rotational-spring cantilever loads the governed 10 tf horizontal tip force', JSON.stringify(interactiveRotationalSpringCantilever.projectData.nodalLoads));
assert(interactiveRotationalSpringCantilever.model.pass === true && interactiveRotationalSpringCantilever.model.rows.length === 6, 'interactive rotational-spring cantilever passes every visible spring-response comparison', `${interactiveRotationalSpringCantilever.model.pass}/${interactiveRotationalSpringCantilever.model.rows.length}`);
assertNear(interactiveRotationalSpringCantilever.definition.metrics[0].expected, rotationalSpringCantileverReferenceFixture.baseRotation * 1000, 1e-12, 'interactive rotational-spring cantilever base rotation reference matches frozen fixture');
assertNear(interactiveRotationalSpringCantilever.definition.metrics[1].expected, rotationalSpringCantileverReferenceFixture.topDisplacement * 1000, 1e-12, 'interactive rotational-spring cantilever top displacement reference matches frozen fixture');
assertNear(interactiveRotationalSpringCantilever.definition.metrics[2].expected, rotationalSpringCantileverReferenceFixture.tipRotation * 1000, 1e-12, 'interactive rotational-spring cantilever tip rotation reference matches frozen fixture');
assertNear(interactiveRotationalSpringCantilever.definition.metrics[3].expected, rotationalSpringCantileverReferenceFixture.springReactionMoment, 1e-12, 'interactive rotational-spring cantilever spring moment reference matches frozen fixture');
assertNear(interactiveRotationalSpringCantilever.definition.metrics[4].expected, rotationalSpringCantileverReferenceFixture.memberBaseMoment, 1e-12, 'interactive rotational-spring cantilever member moment reference matches frozen fixture');
assertNear(interactiveRotationalSpringCantilever.definition.metrics[5].expected, rotationalSpringCantileverReferenceFixture.memberBaseShear, 1e-12, 'interactive rotational-spring cantilever member shear reference matches frozen fixture');

const interactiveTwoStoryPortal = runInteractiveFrameBenchmark('twoStoryPortalBenchmark');
assert(interactiveTwoStoryPortal.definition.id === 'PF-BM-PORTAL-2STORY-SWAY-01', 'interactive two-story portal exposes stable case id', interactiveTwoStoryPortal.definition.id);
assert(interactiveTwoStoryPortal.projectData.nodes.length === 6 && interactiveTwoStoryPortal.projectData.members.length === 6, 'interactive two-story portal loads the governed six-node six-member model', `${interactiveTwoStoryPortal.projectData.nodes.length}/${interactiveTwoStoryPortal.projectData.members.length}`);
assert(
  interactiveTwoStoryPortal.projectData.nodalLoads.length === 4
    && interactiveTwoStoryPortal.projectData.nodalLoads.filter(load => load.Fx === 4).length === 2
    && interactiveTwoStoryPortal.projectData.nodalLoads.filter(load => load.Fx === 3).length === 2,
  'interactive two-story portal loads symmetric 8 tf first-floor and 6 tf roof forces',
  JSON.stringify(interactiveTwoStoryPortal.projectData.nodalLoads),
);
assert(interactiveTwoStoryPortal.model.pass === true && interactiveTwoStoryPortal.model.rows.length === 10, 'interactive two-story portal passes every visible multistory-response comparison', `${interactiveTwoStoryPortal.model.pass}/${interactiveTwoStoryPortal.model.rows.length}`);
const twoStoryInteractiveExpected = [
  twoStoryPortalReferenceFixture.delta1 * 1000,
  twoStoryPortalReferenceFixture.delta2 * 1000,
  twoStoryPortalReferenceFixture.eta1 * 1000,
  twoStoryPortalReferenceFixture.theta1 * 1000,
  twoStoryPortalReferenceFixture.theta2 * 1000,
  twoStoryPortalReferenceFixture.baseReaction,
  twoStoryPortalReferenceFixture.lowerBaseMoment,
  twoStoryPortalReferenceFixture.lowerTopMoment,
  twoStoryPortalReferenceFixture.upperBaseMoment,
  twoStoryPortalReferenceFixture.firstFloorBeamMoment,
];
interactiveTwoStoryPortal.definition.metrics.forEach((metric, index) => {
  assertNear(metric.expected, twoStoryInteractiveExpected[index], 1e-12, `interactive two-story portal metric ${index + 1} matches frozen reduced-system fixture`);
});

const interactiveAsymmetricTwoStory = runInteractiveFrameBenchmark('asymmetricTwoStoryPortalBenchmark');
assert(interactiveAsymmetricTwoStory.definition.id === 'PF-BM-PORTAL-2STORY-ASYM-01', 'interactive asymmetric two-story frame exposes stable case id', interactiveAsymmetricTwoStory.definition.id);
assert(interactiveAsymmetricTwoStory.projectData.version === frameMetadata.version, 'interactive asymmetric two-story frame uses current public version', interactiveAsymmetricTwoStory.projectData.version);
assert(interactiveAsymmetricTwoStory.projectData.nodes.length === 6 && interactiveAsymmetricTwoStory.projectData.members.length === 6, 'interactive asymmetric two-story frame loads the governed six-node six-member model', `${interactiveAsymmetricTwoStory.projectData.nodes.length}/${interactiveAsymmetricTwoStory.projectData.members.length}`);
assert(
  interactiveAsymmetricTwoStory.projectData.nodes[1].y === 3.6
    && interactiveAsymmetricTwoStory.projectData.nodes[2].y === 8.1
    && interactiveAsymmetricTwoStory.projectData.nodes[5].x === 7.5,
  'interactive asymmetric two-story frame preserves unequal story heights and governed span',
  JSON.stringify(interactiveAsymmetricTwoStory.projectData.nodes),
);
assert(
  new Set(interactiveAsymmetricTwoStory.projectData.members.map(member => `${member.A}/${member.I}`)).size === 6,
  'interactive asymmetric two-story frame preserves six distinct member stiffness pairs',
  JSON.stringify(interactiveAsymmetricTwoStory.projectData.members.map(member => ({ id: member.id, A: member.A, I: member.I }))),
);
assert(
  interactiveAsymmetricTwoStory.projectData.nodalLoads.length === 4
    && interactiveAsymmetricTwoStory.projectData.nodalLoads.reduce((sum, load) => sum + load.Fx, 0) === 12.5
    && interactiveAsymmetricTwoStory.projectData.nodalLoads.reduce((sum, load) => sum + load.Fy, 0) === -7,
  'interactive asymmetric two-story frame preserves offset horizontal and vertical nodal loads',
  JSON.stringify(interactiveAsymmetricTwoStory.projectData.nodalLoads),
);
assert(interactiveAsymmetricTwoStory.model.pass === true && interactiveAsymmetricTwoStory.model.rows.length === 12, 'interactive asymmetric two-story frame passes every visible independent-reference comparison', `${interactiveAsymmetricTwoStory.model.pass}/${interactiveAsymmetricTwoStory.model.rows.length}`);
const asymmetricInteractiveExpected = [
  asymmetricTwoStoryReferenceFixture.node2Ux * 1000,
  asymmetricTwoStoryReferenceFixture.node5Ux * 1000,
  asymmetricTwoStoryReferenceFixture.node3Ux * 1000,
  asymmetricTwoStoryReferenceFixture.node6Uy * 1000,
  asymmetricTwoStoryReferenceFixture.node2Theta * 1000,
  asymmetricTwoStoryReferenceFixture.node6Theta * 1000,
  asymmetricTwoStoryReferenceFixture.node1Rx,
  asymmetricTwoStoryReferenceFixture.node4Rx,
  asymmetricTwoStoryReferenceFixture.member1IMoment,
  asymmetricTwoStoryReferenceFixture.member3IMoment,
  asymmetricTwoStoryReferenceFixture.member5IMoment,
  asymmetricTwoStoryReferenceFixture.member6JMoment,
];
interactiveAsymmetricTwoStory.definition.metrics.forEach((metric, index) => {
  assertNear(metric.expected, asymmetricInteractiveExpected[index], 1e-12, `interactive asymmetric two-story metric ${index + 1} matches frozen independent fixture`);
});

const asymmetricStoryResponse = interactiveAsymmetricTwoStory.storyResponse;
assert(asymmetricStoryResponse.active === true && asymmetricStoryResponse.rows.length === 2, 'asymmetric two-story frame produces two governed story-response rows', JSON.stringify(asymmetricStoryResponse));
assert(asymmetricStoryResponse.governingStory === 2, 'asymmetric two-story frame identifies the second story as drift-control story', String(asymmetricStoryResponse.governingStory));
const asymmetricFirstFloorUx = (asymmetricTwoStoryReference.displacement[3] + asymmetricTwoStoryReference.displacement[12]) / 2;
const asymmetricRoofUx = (asymmetricTwoStoryReference.displacement[6] + asymmetricTwoStoryReference.displacement[15]) / 2;
assertNear(asymmetricStoryResponse.rows[0].upperAverageUx, asymmetricFirstFloorUx, 1e-12, 'story response averages all first-floor horizontal node displacements');
assertNear(asymmetricStoryResponse.rows[0].driftRatio, Math.abs(asymmetricFirstFloorUx) / 3.6, 1e-12, 'first-story drift ratio uses the governed 3.6 m story height');
assertNear(asymmetricStoryResponse.rows[1].driftRatio, Math.abs(asymmetricRoofUx - asymmetricFirstFloorUx) / 4.5, 1e-12, 'second-story drift ratio uses relative floor displacement and 4.5 m story height');
assertNear(asymmetricStoryResponse.rows[0].storyShear, 12.5, 1e-12, 'first-story shear accumulates all horizontal loads above the base');
assertNear(asymmetricStoryResponse.rows[1].storyShear, 5.5, 1e-12, 'second-story shear excludes horizontal loads applied at the first-floor level');
assert(interactiveInclinedCantilever.storyResponse.active === false, 'inclined cantilever does not get misclassified as a story system', interactiveInclinedCantilever.storyResponse.reason);

const asymmetricStoryReport = captureFrameReportHtml(
  frameAnalysisHtml,
  { name: '', no: '', designer: '', note: 'story response report' },
  interactiveAsymmetricTwoStory.runtimeState,
);
assert(asymmetricStoryReport.html.includes('目前組合樓層反應'), 'story-frame calculation book includes the story-response section', '目前組合樓層反應');
assert(asymmetricStoryReport.html.includes('控制樓層</b> 第 2 層'), 'story-frame calculation book records the governing story result', '第 2 層');
assert(asymmetricStoryReport.html.includes('12.500'), 'story-frame calculation book records first-story shear', '12.500 tf');
assert(asymmetricStoryReport.html.includes('5.500'), 'story-frame calculation book records second-story shear', '5.500 tf');
for (const needle of frameBenchmarkPageOnlyNeedles) {
  assert(!asymmetricStoryReport.html.includes(needle), 'story-frame calculation book still excludes page-only benchmark wording', needle);
}

const storyEnvelopeRuntime = createFrameAnalysisContext(frameAnalysisHtml);
const storyEnvelopeProject = storyEnvelopeRuntime.context.frameBenchmarkProjectData('asymmetricTwoStoryPortalBenchmark');
const envelopeRoofElevation = Math.max(...storyEnvelopeProject.nodes.map(node => node.y));
storyEnvelopeProject.loadCases = [{ id: 1, name: 'FLOOR' }, { id: 2, name: 'ROOF' }];
storyEnvelopeProject.nodalLoads = storyEnvelopeProject.nodalLoads.map(load => ({
  ...load,
  caseId: storyEnvelopeProject.nodes.find(node => node.id === load.node).y === envelopeRoofElevation ? 2 : 1,
}));
storyEnvelopeProject.comboFactors = { 1: 2, 2: 0 };
storyEnvelopeProject.loadCombinations = [
  { id: 1, name: 'LOWER-CONTROL', factors: { 1: 2, 2: 0 } },
  { id: 2, name: 'ROOF-CONTROL', factors: { 1: 0, 2: 1 } },
];
storyEnvelopeProject.activeCombinationId = 1;
storyEnvelopeRuntime.context.loadFromData(storyEnvelopeProject);
const lowerEnvelopeSolution = storyEnvelopeRuntime.context.analyze({ 1: 2, 2: 0 });
const roofEnvelopeSolution = storyEnvelopeRuntime.context.analyze({ 1: 0, 2: 1 });
const lowerStoryModel = storyEnvelopeRuntime.context.frameStoryResponseModel(lowerEnvelopeSolution);
const roofStoryModel = storyEnvelopeRuntime.context.frameStoryResponseModel(roofEnvelopeSolution);
const storyEnvelope = storyEnvelopeRuntime.context.frameStoryCombinationEnvelopeModel();
assert(storyEnvelope.active === true && storyEnvelope.rows.length === 2, 'two named combinations produce a two-story response envelope', JSON.stringify(storyEnvelope));
assertNear(storyEnvelope.rows[0].storyShear, 14, 1e-12, 'first-story shear envelope retains the lower-floor combination signed result');
assert(storyEnvelope.rows[0].shearCombinationName === 'LOWER-CONTROL', 'first-story shear envelope identifies its controlling combination', storyEnvelope.rows[0].shearCombinationName);
assertNear(storyEnvelope.rows[1].storyShear, 5.5, 1e-12, 'second-story shear envelope retains the roof combination signed result');
assert(storyEnvelope.rows[1].shearCombinationName === 'ROOF-CONTROL', 'second-story shear envelope identifies its controlling combination', storyEnvelope.rows[1].shearCombinationName);
storyEnvelope.rows.forEach((row, index) => {
  const expected = lowerStoryModel.rows[index].driftRatio >= roofStoryModel.rows[index].driftRatio
    ? { model: lowerStoryModel, name: 'LOWER-CONTROL' }
    : { model: roofStoryModel, name: 'ROOF-CONTROL' };
  assertNear(row.driftRatio, expected.model.rows[index].driftRatio, 1e-12, `story ${index + 1} drift envelope equals the governing solved combination`);
  assert(row.driftCombinationName === expected.name, `story ${index + 1} drift envelope identifies the governing combination`, row.driftCombinationName);
});
const memberEnvelope = storyEnvelopeRuntime.context.frameMemberCombinationEnvelopeModel();
assert(
  memberEnvelope.active === true && memberEnvelope.rows.length === storyEnvelopeProject.members.length * 3,
  'two named combinations produce N/V/M envelope rows for every member',
  `rows=${memberEnvelope.rows.length}`,
);
const solvedMemberCombinations = [
  { name: 'LOWER-CONTROL', solution: lowerEnvelopeSolution },
  { name: 'ROOF-CONTROL', solution: roofEnvelopeSolution },
];
const componentValuesKey = { N: 'Ns', V: 'Vs', M: 'Ms' };
memberEnvelope.rows.forEach(row => {
  const samples = [];
  solvedMemberCombinations.forEach(combination => {
    const element = combination.solution.elems.find(item => item.m.id === row.memberId);
    element.diag[componentValuesKey[row.component]].forEach((value, index) => {
      samples.push({ value, x: element.diag.xs[index], name: combination.name });
    });
  });
  const expectedMaximum = samples.reduce((current, sample) => sample.value > current.value ? sample : current, samples[0]);
  const expectedMinimum = samples.reduce((current, sample) => sample.value < current.value ? sample : current, samples[0]);
  assertNear(row.maxValue, expectedMaximum.value, 1e-12, `M${row.memberId} ${row.component} maximum equals solved-combination envelope`);
  assertNear(row.maxX, expectedMaximum.x, 1e-12, `M${row.memberId} ${row.component} maximum station is retained`);
  assert(row.maxCombinationName === expectedMaximum.name, `M${row.memberId} ${row.component} maximum controlling combination is retained`, row.maxCombinationName);
  assertNear(row.minValue, expectedMinimum.value, 1e-12, `M${row.memberId} ${row.component} minimum equals solved-combination envelope`);
  assertNear(row.minX, expectedMinimum.x, 1e-12, `M${row.memberId} ${row.component} minimum station is retained`);
  assert(row.minCombinationName === expectedMinimum.name, `M${row.memberId} ${row.component} minimum controlling combination is retained`, row.minCombinationName);
});
['N', 'V', 'M'].forEach(component => {
  const rows = memberEnvelope.rows.filter(row => row.component === component);
  const expected = rows.reduce((current, row) => Math.abs(row.absoluteValue) > Math.abs(current.absoluteValue) ? row : current, rows[0]);
  const actual = memberEnvelope.governingByComponent[component];
  assert(
    actual.memberId === expected.memberId
      && actual.absoluteValue === expected.absoluteValue
      && actual.absoluteCombinationName === expected.absoluteCombinationName,
    `global |${component}| summary points to the governing member envelope row`,
    `M${expected.memberId} / ${expected.absoluteCombinationName}`,
  );
});
const nodeEnvelope = storyEnvelopeRuntime.context.frameNodeCombinationEnvelopeModel();
const supportedNodeDofCount = storyEnvelopeProject.nodes.reduce((count, node) => count
  + Number(storyEnvelopeRuntime.context.hasSupportDof(node, 'cx', 'kx'))
  + Number(storyEnvelopeRuntime.context.hasSupportDof(node, 'cy', 'ky'))
  + Number(storyEnvelopeRuntime.context.hasSupportDof(node, 'crz', 'krz')), 0);
assert(
  nodeEnvelope.active === true && nodeEnvelope.rows.length === storyEnvelopeProject.nodes.length * 3 + supportedNodeDofCount,
  'two named combinations produce displacement rows for every node and reaction rows only for supported degrees of freedom',
  `rows=${nodeEnvelope.rows.length}, supported=${supportedNodeDofCount}`,
);
const solvedNodeCombinations = [
  { name: 'LOWER-CONTROL', solution: lowerEnvelopeSolution },
  { name: 'ROOF-CONTROL', solution: roofEnvelopeSolution },
];
const nodeComponentSource = {
  uX: { valuesKey: 'd', offset: 0, scale: 1000 },
  uY: { valuesKey: 'd', offset: 1, scale: 1000 },
  thetaZ: { valuesKey: 'd', offset: 2, scale: 1000 },
  Rx: { valuesKey: 'reactions', offset: 0, scale: 1 },
  Ry: { valuesKey: 'reactions', offset: 1, scale: 1 },
  Mz: { valuesKey: 'reactions', offset: 2, scale: 1 },
};
nodeEnvelope.rows.forEach(row => {
  const nodeIndex = storyEnvelopeProject.nodes.findIndex(node => node.id === row.nodeId);
  const source = nodeComponentSource[row.component];
  const samples = solvedNodeCombinations.map(combination => {
    const scaledValue = combination.solution[source.valuesKey][nodeIndex * 3 + source.offset] * source.scale;
    return {
      value: Math.abs(scaledValue) < 1e-12 ? 0 : scaledValue,
      name: combination.name,
    };
  });
  const expectedMaximum = samples.reduce((current, sample) => sample.value > current.value ? sample : current, samples[0]);
  const expectedMinimum = samples.reduce((current, sample) => sample.value < current.value ? sample : current, samples[0]);
  assertNear(row.maxValue, expectedMaximum.value, 1e-12, `N${row.nodeId} ${row.component} maximum equals solved-combination envelope`);
  assert(row.maxCombinationName === expectedMaximum.name, `N${row.nodeId} ${row.component} maximum controlling combination is retained`, row.maxCombinationName);
  assertNear(row.minValue, expectedMinimum.value, 1e-12, `N${row.nodeId} ${row.component} minimum equals solved-combination envelope`);
  assert(row.minCombinationName === expectedMinimum.name, `N${row.nodeId} ${row.component} minimum controlling combination is retained`, row.minCombinationName);
});
Object.keys(nodeEnvelope.governingByComponent).forEach(component => {
  const rows = nodeEnvelope.rows.filter(row => row.component === component);
  const expected = rows.reduce((current, row) => Math.abs(row.absoluteValue) > Math.abs(current.absoluteValue) ? row : current, rows[0]);
  const actual = nodeEnvelope.governingByComponent[component];
  assert(
    actual.nodeId === expected.nodeId
      && actual.absoluteValue === expected.absoluteValue
      && actual.absoluteCombinationName === expected.absoluteCombinationName,
    `global |${component}| summary points to the governing node envelope row`,
    `N${expected.nodeId} / ${expected.absoluteCombinationName}`,
  );
});
const springNodeEnvelopeRuntime = createFrameAnalysisContext(frameAnalysisHtml);
const springNodeEnvelopeProject = springNodeEnvelopeRuntime.context.frameBenchmarkProjectData('elasticSupportPortalBenchmark');
springNodeEnvelopeProject.loadCombinations = [
  { id: 1, name: 'SPRING-SERVICE', factors: { 1: 1 } },
  { id: 2, name: 'SPRING-ULTIMATE', factors: { 1: 1.5 } },
];
springNodeEnvelopeProject.activeCombinationId = 1;
springNodeEnvelopeRuntime.context.loadFromData(springNodeEnvelopeProject);
const springNodeEnvelope = springNodeEnvelopeRuntime.context.frameNodeCombinationEnvelopeModel();
const springBaseNodes = springNodeEnvelopeProject.nodes.filter(node => !node.cx && node.kx > 0);
const springReactionRows = springNodeEnvelope.rows.filter(row => row.component === 'Rx' && springBaseNodes.some(node => node.id === row.nodeId));
assert(
  springReactionRows.length === springBaseNodes.length,
  'node envelope includes Rx rows for active horizontal spring supports',
  `springBases=${springBaseNodes.length}, rows=${springReactionRows.length}`,
);
springReactionRows.forEach(row => {
  assert(
    row.maxCombinationName === 'SPRING-SERVICE' && row.minCombinationName === 'SPRING-ULTIMATE',
    `spring support N${row.nodeId} reaction envelope retains signed service and ultimate controls`,
    `${row.maxCombinationName}/${row.minCombinationName}`,
  );
});
storyEnvelopeRuntime.context.selectLoadCombination(2);
assert(storyEnvelopeRuntime.context.state.activeCombinationId === 2 && storyEnvelopeRuntime.context.state.comboFactors[2] === 1, 'combination selection restores the named factor vector', JSON.stringify(storyEnvelopeRuntime.context.state.comboFactors));
storyEnvelopeRuntime.context.runAnalysis();
assert(storyEnvelopeRuntime.context.state.solution.comboText === '1ROOF', 'active result chain solves only the selected named combination', storyEnvelopeRuntime.context.state.solution.comboText);
const storyEnvelopeJson = storyEnvelopeRuntime.context.collectProjectData();
assert(storyEnvelopeJson.loadCombinations.length === 2 && storyEnvelopeJson.activeCombinationId === 2, 'JSON preserves all named combinations and the active selection', JSON.stringify({ combinations: storyEnvelopeJson.loadCombinations, active: storyEnvelopeJson.activeCombinationId }));
const storyEnvelopeReport = captureFrameReportHtml(
  frameAnalysisHtml,
  { name: '', no: '', designer: '', note: 'combination envelope report' },
  storyEnvelopeRuntime.context.state,
);
assert(storyEnvelopeReport.html.includes('載重組合矩陣') && storyEnvelopeReport.html.includes('LOWER-CONTROL') && storyEnvelopeReport.html.includes('ROOF-CONTROL'), 'calculation book records the complete named combination matrix', 'LOWER-CONTROL / ROOF-CONTROL');
assert(storyEnvelopeReport.html.includes('多組合樓層反應包絡'), 'calculation book includes the multi-combination story envelope', '多組合樓層反應包絡');
assert(storyEnvelopeReport.html.includes('多組合節點位移／支承反力包絡'), 'calculation book includes the multi-combination node displacement and support reaction envelope', '多組合節點位移／支承反力包絡');
assert(storyEnvelopeReport.html.includes('水平位移 uX') && storyEnvelopeReport.html.includes('水平反力 Rx'), 'node envelope report distinguishes displacement and supported reaction rows', '水平位移 uX / 水平反力 Rx');
assert(storyEnvelopeReport.html.includes('多組合桿件內力包絡'), 'calculation book includes the multi-combination member-force envelope', '多組合桿件內力包絡');
assert(storyEnvelopeReport.html.includes('最大值') && storyEnvelopeReport.html.includes('最小值') && storyEnvelopeReport.html.includes('控制組合'), 'member envelope report preserves signed bounds, station and controlling combination columns', '最大值 / 最小值 / 控制組合');

const storyLoadRuntime = createFrameAnalysisContext(frameAnalysisHtml);
const storyLoadProject = storyLoadRuntime.context.frameBenchmarkProjectData('portalSideswayBenchmark');
storyLoadProject.nodalLoads = [{ caseId: 1, node: 2, Fx: 1, Fy: 0, M: 0 }];
storyLoadProject.memberLoads = [{ caseId: 1, member: 1, w: 2, dir: 'localY' }];
storyLoadProject.memberPointLoads = [{ caseId: 1, member: 3, P: 3, a: 2, dir: 'localY' }];
storyLoadRuntime.context.loadFromData(storyLoadProject);
const storyLoadResponse = storyLoadRuntime.context.frameStoryResponseModel();
assert(storyLoadResponse.active === true && storyLoadResponse.rows.length === 1, 'local-axis lateral load fixture produces one applicable story row', JSON.stringify(storyLoadResponse));
assertNear(storyLoadResponse.rows[0].storyShear, -10, 1e-12, 'story shear transforms and accumulates nodal, distributed local-y and point local-y horizontal loads');
assertNear(storyLoadResponse.rows[0].storyShear, storyLoadRuntime.context.state.solution.equilibrium.applied.Fx, 1e-12, 'one-story shear matches the solved global horizontal applied resultant');

const priorV14FrameJson = JSON.parse(JSON.stringify(sourceProjectJson));
priorV14FrameJson.version = 'V1.4';
frameRuntime.context.loadFromData(priorV14FrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution)
    && frameRuntime.context.state.loadCombinations.length === sourceProjectJson.loadCombinations.length,
  'prior V1.4 member-envelope JSON remains readable after the V1.5 node-envelope upgrade',
  'named combination schema is unchanged',
);

const priorV13FrameJson = JSON.parse(JSON.stringify(sourceProjectJson));
priorV13FrameJson.version = 'V1.3';
frameRuntime.context.loadFromData(priorV13FrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution)
    && frameRuntime.context.state.loadCombinations.length === sourceProjectJson.loadCombinations.length,
  'prior V1.3 named-combination JSON remains readable after the V1.5 node-envelope upgrade',
  'named combination schema is unchanged',
);

function priorSingleCombinationFrameJson(version) {
  const data = JSON.parse(JSON.stringify(sourceProjectJson));
  data.version = version;
  delete data.loadCombinations;
  delete data.activeCombinationId;
  return data;
}

const priorV12FrameJson = priorSingleCombinationFrameJson('V1.2');
frameRuntime.context.loadFromData(priorV12FrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution)
    && frameRuntime.context.state.loadCombinations.length === 1,
  'prior V1.2 single-combination JSON remains readable after the V1.5 node-envelope upgrade',
  'legacy comboFactors synthesized as one named combination',
);

const priorV11FrameJson = priorSingleCombinationFrameJson('V1.1');
frameRuntime.context.loadFromData(priorV11FrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'prior V1.1 JSON remains readable after the V1.3 combination-envelope upgrade',
  'schema v1 compatibility path',
);

const priorV10FrameJson = priorSingleCombinationFrameJson('V1.0');
frameRuntime.context.loadFromData(priorV10FrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'prior V1.0 JSON remains readable after the V1.3 combination-envelope upgrade',
  'schema v1 compatibility path',
);

const priorV09FrameJson = priorSingleCombinationFrameJson('V0.9');
frameRuntime.context.loadFromData(priorV09FrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'prior V0.9 JSON remains readable after the V1.3 combination-envelope upgrade',
  'schema v1 compatibility path',
);

const priorV08FrameJson = priorSingleCombinationFrameJson('V0.8');
frameRuntime.context.loadFromData(priorV08FrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'prior V0.8 JSON remains readable after the V1.3 combination-envelope upgrade',
  'schema v1 compatibility path',
);

const priorV07FrameJson = priorSingleCombinationFrameJson('V0.7');
frameRuntime.context.loadFromData(priorV07FrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'prior V0.7 JSON remains readable after the V1.3 combination-envelope upgrade',
  'schema v1 compatibility path',
);

const priorV06FrameJson = priorSingleCombinationFrameJson('V0.6');
frameRuntime.context.loadFromData(priorV06FrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'prior V0.6 JSON remains readable after the V1.3 combination-envelope upgrade',
  'schema v1 compatibility path',
);

const priorV05FrameJson = priorSingleCombinationFrameJson('V0.5');
frameRuntime.context.loadFromData(priorV05FrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'prior V0.5 JSON remains readable after the V1.3 combination-envelope upgrade',
  'schema v1 compatibility path',
);

const priorFrameJson = priorSingleCombinationFrameJson('V0.4');
frameRuntime.context.loadFromData(priorFrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'prior V0.4 JSON remains readable after the V1.3 combination-envelope upgrade',
  'schema v1 compatibility path',
);

const olderFrameJson = priorSingleCombinationFrameJson('V0.3');
frameRuntime.context.loadFromData(olderFrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'older V0.3 JSON remains readable after the V1.3 combination-envelope upgrade',
  'schema v1 compatibility path',
);

const legacyFrameJson = priorSingleCombinationFrameJson('V0.2');
delete legacyFrameJson.schema;
frameRuntime.context.loadFromData(legacyFrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'legacy V0.2 JSON remains readable and reproduces the same analysis result',
  'schema-less compatibility path',
);
frameRuntime.context.loadFromData(JSON.parse(JSON.stringify(sourceProjectJson)));

const stateBeforeRejectedFrameImport = stableSha256(frameRuntime.context.collectProjectData());
let rejectedFrameSchema = '';
try {
  frameRuntime.context.loadFromData({ ...sourceProjectJson, schema: 'plane-frame.project.v999' });
} catch (error) {
  rejectedFrameSchema = error.message;
}
assert(rejectedFrameSchema.includes('不支援的平面剛架案例版本'), 'rigid frame rejects unknown JSON schema before reset', rejectedFrameSchema);
assert(stableSha256(frameRuntime.context.collectProjectData()) === stateBeforeRejectedFrameImport, 'rejected rigid frame schema leaves active model unchanged', stateBeforeRejectedFrameImport);

const malformedFrameJson = JSON.parse(JSON.stringify(sourceProjectJson));
malformedFrameJson.nodes[1].id = malformedFrameJson.nodes[0].id;
let rejectedFrameTopology = '';
try {
  frameRuntime.context.loadFromData(malformedFrameJson);
} catch (error) {
  rejectedFrameTopology = error.message;
}
assert(rejectedFrameTopology.includes('節點編號不得重複'), 'rigid frame rejects malformed node identity before reset', rejectedFrameTopology);
assert(stableSha256(frameRuntime.context.collectProjectData()) === stateBeforeRejectedFrameImport, 'rejected rigid frame topology leaves active model unchanged', stateBeforeRejectedFrameImport);

const foundationTransferRuntime = createFrameAnalysisContext(frameAnalysisHtml);
foundationTransferRuntime.context.loadFromData({
  schema: 'plane-frame.project.v1',
  tool: '平面剛架分析',
  project: { name: '樁帽轉接驗證', no: 'PC-001', designer: '', note: '' },
  defaults: { E: 2040, A: 63.1, I: 13600 },
  selfWeight: false,
  density: 7.85,
  loadCases: [
    { id: 1, name: 'D' },
    { id: 2, name: 'L' },
    { id: 3, name: 'W' },
    { id: 4, name: 'E' },
  ],
  comboFactors: { 1: 1, 2: 0, 3: 0, 4: 0 },
  loadCombinations: [{ id: 1, name: 'D', factors: { 1: 1, 2: 0, 3: 0, 4: 0 } }],
  activeCombinationId: 1,
  nodes: [
    { id: 1, x: 0, y: 0, cx: true, cy: true, crz: true },
    { id: 2, x: 0, y: 6, cx: false, cy: false, crz: false },
  ],
  members: [{ id: 1, i: 1, j: 2, E: 2040, A: 63.1, I: 13600, relI: false, relJ: false }],
  nodalLoads: [
    { caseId: 1, node: 2, Fx: 0, Fy: -10, M: 0 },
    { caseId: 2, node: 2, Fx: 0, Fy: -5, M: 0 },
    { caseId: 3, node: 2, Fx: 2, Fy: 0, M: 0 },
    { caseId: 4, node: 2, Fx: -3, Fy: 0, M: 0 },
  ],
  memberLoads: [],
  memberPointLoads: [],
  foundationTransfer: {
    nodeId: 1,
    momentAxis: 'My',
    momentSign: 1,
    caseMap: { D: 1, L: 2, W: 3, E: 4 },
  },
});
const foundationComponentPackage = foundationTransferRuntime.context.buildFoundationLoadComponentPackage();
assert(foundationComponentPackage.schemaVersion === 'loadcombo-components-v1', 'rigid frame exports governed component package schema', foundationComponentPackage.schemaVersion);
assertNear(foundationComponentPackage.forces.P.D, 10, 1e-8, 'rigid frame maps D vertical support reaction to compression-positive P');
assertNear(foundationComponentPackage.forces.P.L, 5, 1e-8, 'rigid frame maps L vertical support reaction to compression-positive P');
assertNear(foundationComponentPackage.forces.My.W, -12, 1e-8, 'rigid frame maps W support Mz to foundation action My');
assertNear(foundationComponentPackage.forces.My.E, 18, 1e-8, 'rigid frame maps E support Mz to foundation action My');
assertNear(foundationComponentPackage.forces.Mx.W, 0, 1e-12, 'rigid frame leaves orthogonal foundation moment at zero');
assert(foundationComponentPackage.source.analysisId === 'frame:PC-001:N1', 'rigid frame component package preserves project and support identity', foundationComponentPackage.source.analysisId);
const savedFoundationTransfer = foundationTransferRuntime.context.collectProjectData().foundationTransfer;
assert(
  savedFoundationTransfer.nodeId === 1 && savedFoundationTransfer.caseMap.W === 3 && savedFoundationTransfer.momentAxis === 'My',
  'rigid frame project JSON preserves foundation transfer mapping',
  JSON.stringify(savedFoundationTransfer),
);
foundationTransferRuntime.context.state.foundationTransfer.caseMap.E = 3;
let duplicateFoundationCaseError = '';
try {
  foundationTransferRuntime.context.buildFoundationLoadComponentPackage();
} catch (error) {
  duplicateFoundationCaseError = error.message;
}
assert(duplicateFoundationCaseError.includes('不可重複指定'), 'rigid frame rejects duplicate D/L/W/E case mapping', duplicateFoundationCaseError);
foundationTransferRuntime.context.state.foundationTransfer.caseMap = { D: 2, L: 1, W: 3, E: 4 };
foundationTransferRuntime.elements.get('selfWeight').checked = true;
let misplacedSelfWeightError = '';
try {
  foundationTransferRuntime.context.buildFoundationLoadComponentPackage();
} catch (error) {
  misplacedSelfWeightError = error.message;
}
assert(
  misplacedSelfWeightError.includes('D 必須對應第一個載重案例'),
  'rigid frame blocks a component package that would omit configured self weight from D',
  misplacedSelfWeightError,
);

console.log('\nFrame analysis contract checks passed.');
