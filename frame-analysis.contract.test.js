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
    'analyze', 'getFrameProjectInfo', 'resetAll', 'validateFrameProjectData',
    'collectProjectData', 'loadFromData',
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

assertPrintHidesSelectors(frameAnalysisHtml, ['.page-only-report-status', '.page-only-tool-actions'], 'rigid frame page-only controls');
assertFunctionTemplateExcludes(frameAnalysisHtml, 'printReport', 'const html = `', pageOnlyReportStatusNeedles, 'rigid frame report export');

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
  version: 'V0.4',
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
assert(sourceProjectJson.version === 'V0.4', 'rigid frame JSON records current version', sourceProjectJson.version);
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

const priorFrameJson = JSON.parse(JSON.stringify(sourceProjectJson));
priorFrameJson.version = 'V0.3';
frameRuntime.context.loadFromData(priorFrameJson);
assert(
  stableSha256(frameResultSnapshot(frameRuntime.context).solution) === stableSha256(sourceResultSnapshot.solution),
  'prior V0.3 JSON remains readable after the V0.4 evidence upgrade',
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
