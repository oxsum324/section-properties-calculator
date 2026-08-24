const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
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
    ['errorMsg', { textContent: '', style: { display: 'none' } }],
    ['selfWeight', { checked: false }],
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
        d: [0, 0, 0, 0.0012, -0.0034, 0.0008],
        reactions: [0, 12, 36, 0, 8, 0],
        elems: [
          {
            m: { id: 1, i: 1, j: 2 },
            L: 6,
            diag: {
              Ms: [0, 18, -12],
              Vs: [12, -8, 4],
              Ns: [3, -2, 1],
            },
          },
        ],
      },
    },
    loadCaseIdCnt: 1,
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
    'firstLoadCaseId',
    'normalizeLoadCaseId',
    'comboFactor',
    'loadCaseName',
    'formatActiveCombination',
    'escapeHtml',
    'fmtCheck',
    'hasAnySpring',
    'activeFrameLoadCount',
    'getFrameProjectInfo',
    'missingFrameProjectFields',
    'frameReportReadinessModel',
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
    ['defE', { value: '2040' }],
    ['defA', { value: '63.1' }],
    ['defI', { value: '13600' }],
    ['selfWeight', { checked: false }],
    ['density', { value: '7.85' }],
  ]);
  const context = {
    FRAME_PUBLIC_VERSION: frameMetadata.version,
    FRAME_CALCULATION_ENGINE: frameMetadata.calculationEngine,
    state: {
      nodes: [], members: [], loadCases: [], comboFactors: {},
      nodalLoads: [], memberLoads: [], memberPointLoads: [], solution: null,
    },
    nodeIdCnt: 0,
    memberIdCnt: 0,
    loadCaseIdCnt: 0,
    document: {
      getElementById(id) { return elements.get(id) || null; },
    },
    window: {
      ToolReportUI: {
        normalizeProjectFieldValue(value) { return String(value || '').trim(); },
      },
    },
    syncLoadCaseTableFromDom() {},
    invalidateAnalysisState() { context.state.solution = null; },
    renderFrameBenchmarkPanel() {},
    renderLoadCaseTable() {},
    renderNodeTable() {},
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
  [
    'asNonNegativeNumber', 'makeNode', 'springValue', 'activeSpring', 'hasSupportDof',
    'ensureLoadCases', 'firstLoadCaseId', 'normalizeLoadCaseId', 'comboFactor',
    'formatActiveCombination', 'activeLoadFactors', 'momentAboutOrigin',
    'computeAppliedResultant', 'validateModel', 'zeros', 'matmul', 'matvec',
    'transpose', 'subtractMat', 'invSmall', 'condenseReleases', 'solveLinear',
    'analyze', 'getFrameProjectInfo', 'getFrameBenchmarkDefinition',
    'frameBenchmarkProjectData', 'resolveFrameBenchmarkMetric', 'frameBenchmarkResultModel',
    'resetAll', 'validateFrameProjectData', 'collectProjectData', 'loadFromData',
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
  '封閉式參考解比對',
  '此驗證結果只供工作頁確認求解器',
  'PF-BM-PORTAL-SWAY-01',
  'PF-BM-PORTAL-UDL-01',
  'PF-BM-INCLINED-CANTILEVER-01',
  'PF-BM-PORTAL-HSPRING-01',
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
  'id="reportStatus"',
  'id="reportLink"',
  'id="frameReportReadiness"',
  'id="projName"',
  'id="projNo"',
  'id="projDesigner"',
  '../結構工具箱/core/ui/report.js',
  'function getFrameProjectInfo',
  'assessFormalAttachment',
  'buildReportTrace',
  'page-only-report-status',
  'page-only-tool-actions',
  'page-only-frame-benchmark',
  'id="frameBenchmarkCaseSelect"',
  'id="loadFrameBenchmarkButton"',
  'value="portalSideswayBenchmark"',
  'value="portalSymmetricUdlBenchmark"',
  'value="inclinedCantileverBenchmark"',
  'value="elasticSupportPortalBenchmark"',
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
  '分析組合',
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
assert(frameReportRuntime.html.includes('載重</h2>'), 'rigid frame runtime report keeps load table', '載重');
assert(frameReportRuntime.html.includes('平衡檢核'), 'rigid frame runtime report keeps equilibrium section', '平衡檢核');
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
  version: 'V0.8',
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
assert(sourceProjectJson.version === 'V0.8', 'rigid frame JSON records current version', sourceProjectJson.version);
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
    selfWeight: false,
    density: 7.85,
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

function runInteractiveFrameBenchmark(kind) {
  const runtime = createFrameAnalysisContext(frameAnalysisHtml);
  const projectData = runtime.context.frameBenchmarkProjectData(kind);
  runtime.context.loadFromData(JSON.parse(JSON.stringify(projectData)));
  runtime.context.state.benchmarkId = kind;
  return {
    definition: runtime.context.getFrameBenchmarkDefinition(kind),
    projectData,
    model: runtime.context.frameBenchmarkResultModel(),
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

const priorV07FrameJson = JSON.parse(JSON.stringify(sourceProjectJson));
priorV07FrameJson.version = 'V0.7';
frameRuntime.context.loadFromData(priorV07FrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'prior V0.7 JSON remains readable after the V0.8 elastic-support benchmark upgrade',
  'schema v1 compatibility path',
);

const priorV06FrameJson = JSON.parse(JSON.stringify(sourceProjectJson));
priorV06FrameJson.version = 'V0.6';
frameRuntime.context.loadFromData(priorV06FrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'prior V0.6 JSON remains readable after the V0.8 elastic-support benchmark upgrade',
  'schema v1 compatibility path',
);

const priorV05FrameJson = JSON.parse(JSON.stringify(sourceProjectJson));
priorV05FrameJson.version = 'V0.5';
frameRuntime.context.loadFromData(priorV05FrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'prior V0.5 JSON remains readable after the V0.8 elastic-support benchmark upgrade',
  'schema v1 compatibility path',
);

const priorFrameJson = JSON.parse(JSON.stringify(sourceProjectJson));
priorFrameJson.version = 'V0.4';
frameRuntime.context.loadFromData(priorFrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'prior V0.4 JSON remains readable after the V0.8 elastic-support benchmark upgrade',
  'schema v1 compatibility path',
);

const olderFrameJson = JSON.parse(JSON.stringify(sourceProjectJson));
olderFrameJson.version = 'V0.3';
frameRuntime.context.loadFromData(olderFrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'older V0.3 JSON remains readable after the V0.8 elastic-support benchmark upgrade',
  'schema v1 compatibility path',
);

const legacyFrameJson = JSON.parse(JSON.stringify(sourceProjectJson));
delete legacyFrameJson.schema;
legacyFrameJson.version = 'V0.2';
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

console.log('\nFrame analysis contract checks passed.');
