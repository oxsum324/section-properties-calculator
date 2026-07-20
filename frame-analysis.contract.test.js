const fs = require('fs');
const path = require('path');
const vm = require('vm');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf8');
}

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
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

function captureFrameReportHtml(source, project = {}) {
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
    state: {
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

const pageOnlyReportStatusNeedles = [
  '產報前檢查',
  '優先閱讀',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
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
  '計畫名稱',
  '計畫編號',
  '設計人員',
  '產出工具',
  '工具版本',
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
assert(frameReportRuntime.html.includes('載重</h2>'), 'rigid frame runtime report keeps load table', '載重');
assert(frameReportRuntime.html.includes('平衡檢核'), 'rigid frame runtime report keeps equilibrium section', '平衡檢核');
assert(frameReportRuntime.html.includes('DRAFT／非正式附件 - 待人工複核'), 'rigid frame incomplete report is explicitly draft', 'DRAFT／非正式附件');
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
assert(!readyFrameReport.html.includes('DRAFT／非正式附件'), 'rigid frame complete report removes draft classification', 'formal attachment state');
assert(readyFrameReport.html.includes('data-document-class="ready-to-sign"'), 'rigid frame complete report records ready-to-sign document class', 'ready-to-sign');
assert(readyFrameReport.html.includes('文件分類｜可送簽版'), 'rigid frame complete report identifies the sign-off candidate', '文件分類｜可送簽版');
assert(readyFrameReport.html.includes('正式附件仍須完成公司簽認'), 'rigid frame complete report preserves the approval boundary', '正式附件仍須完成公司簽認');
assert(readyFrameReport.html.includes('Frame QA'), 'rigid frame complete report keeps project name', 'Frame QA');
assert(readyFrameReport.html.includes('FR-001'), 'rigid frame complete report keeps project number', 'FR-001');
assert(readyFrameReport.html.includes('Codex QA'), 'rigid frame complete report keeps designer', 'Codex QA');

console.log('\nFrame analysis contract checks passed.');
