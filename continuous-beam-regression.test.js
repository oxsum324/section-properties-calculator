const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const htmlPath = path.join(__dirname, '連續梁分析.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const directPrintBoundaryPath = path.join(__dirname, '結構工具箱', 'core', 'direct-print-boundary.css');
const directPrintBoundarySource = fs.readFileSync(directPrintBoundaryPath, 'utf8');
const sharedReportPath = path.join(__dirname, '結構工具箱', 'core', 'ui', 'report.js');
const sharedReportSource = fs.readFileSync(sharedReportPath, 'utf8');
const analysisSectionMetadataPath = path.join(__dirname, '結構工具箱', 'tools', 'analysis-section-tool-metadata.js');
const analysisSectionMetadataSource = fs.readFileSync(analysisSectionMetadataPath, 'utf8');
const analysisSectionMetadata = require(analysisSectionMetadataPath);

function loadReportUtilities(context) {
  // report.js 自 T2 起依賴共用 report-utils（core 與 RC 適配層），任何 vm 情境都先載入。
  for (const relativePath of ['結構工具箱/core/ui/report-utils.js', '鋼筋混凝土/shared/report-utils.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, ...relativePath.split('/')), 'utf8').replace(/^﻿/, ''), context, { filename: relativePath });
  }
}
const forcePickerPath = path.join(__dirname, '結構工具箱', 'core', 'ui', 'force-picker.js');
const forcePickerSource = fs.readFileSync(forcePickerPath, 'utf8');
const forcesReceivePath = path.join(__dirname, '結構工具箱', 'core', 'ui', 'forces-receive.js');
const forcesReceiveSource = fs.readFileSync(forcesReceivePath, 'utf8');

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertPrintHidesSelectors(source, selectors, label) {
  selectors.forEach(selector => {
    const pattern = new RegExp(`@media\\s+print[\\s\\S]*${escapeRegex(selector)}[\\s\\S]*display:\\s*none\\s*!important`);
    assert(pattern.test(source), `${label} print hides ${selector}`, selector);
  });
}

assert(html.includes('id="saveStatus"'), 'save status outlet exists', 'cloud save uses inline page status');
assert(html.includes('id="continuousBeamVersion"') && html.includes('CONTINUOUS_BEAM_PUBLIC_VERSION'), 'continuous beam page exposes canonical version', analysisSectionMetadata['continuous-beam'].version);
assert(html.includes("pageVersion: window.AnalysisSectionToolMetadata['continuous-beam'].version"), 'continuous beam JSON records canonical page version', analysisSectionMetadata['continuous-beam'].version);
assert(html.includes("calculationEngine: window.AnalysisSectionToolMetadata['continuous-beam'].calculationEngine"), 'continuous beam JSON records calculation engine', analysisSectionMetadata['continuous-beam'].calculationEngine);
assert(html.includes("schema: 'continuous-beam.project.v1'"), 'continuous beam JSON declares a stable schema', 'continuous-beam.project.v1');
assert(/openReport\(\{[\s\S]*?textExport:\s*true,[\s\S]*?outputSource:/.test(html), 'continuous beam enables governed TXT from the same report state', 'textExport: true');
assert(html.includes('function validateContinuousBeamSaveData'), 'continuous beam validates restored model topology', 'validated before active-state mutation');
assert(html.includes('id="saveModalStatus"'), 'save modal status outlet exists', 'save validation/errors stay in the modal');
assert(html.includes('id="loadModalStatus"'), 'load modal status outlet exists', 'load/delete errors stay in the modal');
assert(html.includes('function setInlineStatus'), 'inline status helper exists', 'shared helper drives non-blocking feedback');
assert(!html.includes('alert('), 'blocking alerts removed', 'continuous beam page reports recoverable issues inline');
assert(!html.includes('confirm('), 'blocking confirmations removed', 'cloud save/delete choices stay in the modal');
assert(html.includes('function setInlineChoice'), 'inline choice helper exists', 'save/load modal confirmations use real buttons');
assert(html.includes('function showSaveOverwriteChoice'), 'save overwrite choice exists', 'loaded cloud save can be overwritten or saved as new inline');
assert(html.includes('function showDeleteChoice'), 'delete choice exists', 'cloud delete confirmation stays in the load modal');
assert(html.includes('id="reportReadiness"'), 'attachment readiness outlet exists', 'continuous beam page-only readiness');
assert(html.includes('function continuousBeamReportReadinessModel'), 'attachment readiness model exists', 'continuous beam report readiness model');
assert(html.includes('page-only-report-status'), 'attachment readiness is page-only', 'print/PDF boundary class');
assert(html.includes('不會寫入計算書或列印 PDF'), 'attachment readiness boundary copy exists', 'page-only wording');
assert(html.includes('頁面顯示，不進計算書、列印或 PDF'), 'attachment readiness boundary row exists', 'page-only boundary row');
assert(html.includes('href="結構工具箱/core/direct-print-boundary.css"'), 'continuous beam loads shared direct-print boundary', 'shared print stylesheet');
assert(/<body class="formal-tool-output-page" data-family="analysis">[\s\S]*class="formal-direct-print-boundary"/.test(html), 'continuous beam exposes work-page direct-print boundary', 'formal output page boundary');
['分析工具主頁列印已封鎖', '此頁是操作介面，不是計算書', '本頁不得作為附件'].forEach(needle => {
  assert(html.includes(needle), 'continuous beam explains blocked direct print', needle);
});
assert(directPrintBoundarySource.includes('body.formal-tool-output-page > :not(.formal-direct-print-boundary)'), 'shared CSS hides continuous beam work page during direct print', 'formal work-page children hidden');
assert(directPrintBoundarySource.includes('body.formal-tool-output-page > .formal-direct-print-boundary'), 'shared CSS renders continuous beam direct-print notice', 'boundary notice rendered');
assert(html.includes('window.ToolReportUI?.normalizeProjectFieldValue'), 'shared project meta normalization hook exists', 'continuous beam uses shared placeholder cleanup when available');
assert(html.includes("['設計人員', 'projDesigner']"), 'designer participates in readiness completeness', 'continuous beam attachment readiness requires designer metadata');
assert(/name:\s*getProjectFieldValue\('projName'\)/.test(html), 'report export uses normalized project name', 'continuous beam report payload');
assert(/designer:\s*getProjectFieldValue\('projDesigner'\)/.test(html), 'report export uses normalized designer', 'continuous beam report payload');
assertPrintHidesSelectors(html, ['.page-only-report-status', '.save-bar', '.modal-overlay'], 'continuous beam page-only controls');
assert(
  html.includes("beam: { url: '鋼構工具/steel-beam-formal.html?import=1'"),
  'continuous beam steel transfer uses the formal beam page',
  'new-project steel attachments stay on the formal page'
);
assert(
  !/steel:\s*\{[\s\S]*?steel-column/.test(html),
  'continuous beam removes steel-column transfer',
  'beam analysis has no axial-force/frame context for column design'
);
assert(
  !html.includes('columnRect:') && !html.includes('columnCirc:'),
  'continuous beam removes RC column transfer',
  'beam analysis must not fabricate P=0 without axial-force/frame context'
);
assert(
  html.includes("loadBasis: 'unconfirmed'"),
  'all continuous beam transfers mark load basis unconfirmed',
  'candidate review must resolve the load basis manually'
);
assert(!html.includes('{ P: 0, Mx: env.M, Vx: env.V }'), 'continuous beam does not fabricate column force payload', 'column analysis needs independent P-M context');
assert(html.includes('member: { spanCm: env.Lcm }'), 'steel beam transfer includes span candidate', 'span remains a reviewable candidate value');
assert(forcePickerSource.includes('member:   payload.member   || null'), 'ForcePicker preserves member geometry', 'candidate span survives localStorage transport');
assert(forcePickerSource.includes("loadBasis: payload.meta?.loadBasis"), 'ForcePicker preserves load-basis status', 'candidate review receives the upstream load-basis classification');
assert(forcePickerSource.includes("'steel-beam':   '../../鋼構工具/steel-beam-formal.html?import=1'"), 'ForcePicker steel beam fallback targets formal page', 'generic transport cannot reopen the legacy beam page');
assert(!forcePickerSource.includes("'steel-column':"), 'ForcePicker exposes no generic steel-column target', 'column transfer requires a frame workflow with axial force context');
{
  let storedPayload = '';
  const forcePickerContext = {
    localStorage: {
      setItem(_key, value) { storedPayload = value; },
      getItem() { return storedPayload; },
      removeItem() { storedPayload = ''; },
    },
    window: {},
    Date,
    JSON,
    Object,
  };
  vm.createContext(forcePickerContext);
  loadReportUtilities(forcePickerContext);
  vm.runInContext(forcePickerSource, forcePickerContext, { filename: forcePickerPath });
  forcePickerContext.window.ForcePicker.stash({
    target: 'steel-beam',
    meta: { source: '連續梁分析', caseName: '主控組合 (梁)', factored: false, loadBasis: 'unconfirmed' },
    forces: { M: 10, MNeg: -12, V: 5 },
    member: { spanCm: 600 },
  });
  const preserved = JSON.parse(storedPayload);
  assert(preserved.meta.loadBasis === 'unconfirmed', 'ForcePicker runtime keeps load-basis status', JSON.stringify(preserved.meta));
  assert(preserved.member.spanCm === 600, 'ForcePicker runtime keeps candidate span', JSON.stringify(preserved.member));
}

function bootForceReceiver({ mode = 'candidate', payload }) {
  const events = [];
  const documentEvents = [];
  let banner = null;
  const fields = ['M', 'MNeg', 'V'].map((key, index) => ({
    key,
    value: String([50, 60, 25][index]),
    getAttribute(name) { return name === 'data-force' ? key : null; },
    dispatchEvent(event) { events.push({ key, type: event.type }); }
  }));
  const makeElement = () => ({
    style: {},
    append() {},
    addEventListener() {},
    remove() {}
  });
  const document = {
    currentScript: { dataset: mode === 'auto' ? { forceImportMode: 'auto' } : {} },
    readyState: 'complete',
    querySelectorAll(selector) { return selector === '[data-force]' ? fields : []; },
    dispatchEvent(event) { documentEvents.push(event); },
    addEventListener() {},
    createElement: makeElement,
    body: { firstChild: null, insertBefore(node) { banner = node; } }
  };
  class FakeEvent {
    constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
  }
  class FakeCustomEvent extends FakeEvent {
    constructor(type, init = {}) { super(type, init); this.detail = init.detail; }
  }
  let stored = JSON.stringify(payload);
  const context = {
    window: {}, document, location: { search: '?import=1' },
    localStorage: {
      getItem() { return stored; },
      removeItem() { stored = null; }
    },
    URLSearchParams, Event: FakeEvent, CustomEvent: FakeCustomEvent,
    JSON, Number, Set, Date
  };
  vm.createContext(context);
  loadReportUtilities(context);
  vm.runInContext(forcesReceiveSource, context, { filename: forcesReceivePath });
  return { api: context.window.ForcePickerReceive, fields, events, documentEvents, getStored: () => stored, getBanner: () => banner };
}

{
  const payload = {
    target: 'beam',
    meta: { source: '連續梁分析', caseName: '主控組合 (梁)', loadBasis: 'unconfirmed' },
    forces: { M: 88, MNeg: 126, V: 44 }
  };
  const receiver = bootForceReceiver({ payload });
  assert(receiver.api.mode === 'candidate', 'force receiver defaults to candidate mode', receiver.api.mode);
  assert(receiver.fields.map(field => field.value).join(',') === '50,60,25', 'candidate receiver leaves formal fields unchanged', JSON.stringify(receiver.fields));
  assert(!!receiver.getStored(), 'candidate receiver keeps pending storage', String(receiver.getStored()));
  assert(receiver.documentEvents.some(event => event.type === 'force-picker-candidate-ready'), 'candidate receiver announces review payload', JSON.stringify(receiver.documentEvents));
  const applied = receiver.api.applyPending({ forceKeys: ['M', 'V'] });
  assert(receiver.fields.map(field => field.value).join(',') === '88,60,44', 'candidate receiver only applies confirmed field keys', JSON.stringify(receiver.fields));
  assert(applied.filled.join(',') === 'M=88,V=44', 'candidate receiver reports applied field keys', JSON.stringify(applied));
  assert(receiver.getStored() == null && receiver.api.getPending() == null, 'candidate receiver clears storage only after apply', String(receiver.getStored()));
}

{
  const receiver = bootForceReceiver({
    mode: 'auto',
    payload: { target: 'legacy', meta: { source: '既有入口', factored: true }, forces: { M: 70, MNeg: 80, V: 30 } }
  });
  assert(receiver.api.mode === 'auto', 'force receiver preserves explicit legacy auto mode', receiver.api.mode);
  assert(receiver.fields.map(field => field.value).join(',') === '70,80,30', 'legacy auto receiver still fills mapped fields', JSON.stringify(receiver.fields));
  assert(receiver.getStored() == null && receiver.api.getPending() == null, 'legacy auto receiver consumes storage after import', String(receiver.getStored()));
  assert(!!receiver.getBanner(), 'legacy auto receiver still displays import notice', 'banner created');
}

function assertNear(actual, expected, tol, title, detail) {
  assert(Math.abs(actual - expected) <= tol, title, `${detail}; actual=${actual}, expected=${expected}, tol=${tol}`);
}

class FakeClassList {
  constructor() {
    this.set = new Set();
  }
  add(...tokens) {
    tokens.forEach(t => this.set.add(t));
  }
  remove(...tokens) {
    tokens.forEach(t => this.set.delete(t));
  }
  contains(token) {
    return this.set.has(token);
  }
}

class FakeContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.font = '12px sans-serif';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
  }
  clearRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}
  arc() {}
  closePath() {}
  fillRect() {}
  strokeRect() {}
  fillText() {}
  drawImage() {}
  setLineDash() {}
  save() {}
  restore() {}
  measureText(text) {
    return { width: String(text ?? '').length * 7 };
  }
}

class FakeElement {
  constructor(id = '', tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.readOnly = false;
    this.innerHTML = '';
    this.textContent = '';
    this.style = { display: '', background: '' };
    this.dataset = {};
    this.children = [];
    this.parentElement = { clientWidth: 1200 };
    this.clientWidth = 1200;
    this.width = 0;
    this.height = 0;
    this.classList = new FakeClassList();
    this.onclick = null;
  }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  getContext(kind) {
    if (this.tagName !== 'CANVAS' || kind !== '2d') return null;
    if (!this._ctx) this._ctx = new FakeContext2D(this);
    return this._ctx;
  }
  toDataURL() {
    return 'data:image/png;base64,AA==';
  }
  addEventListener() {}
  removeEventListener() {}
}

function extractInlineScripts(source) {
  const scripts = [];
  const re = /<script(?:\s+type="module")?>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(source))) scripts.push(match[1]);
  return scripts;
}

function extractFunctionBlock(source, name) {
  const needle = `function ${name}`;
  const start = source.indexOf(needle);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  let brace = source.indexOf('{', start);
  if (brace < 0) throw new Error(`Function body not found: ${name}`);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unclosed function: ${name}`);
}

const pageOnlyNeedles = [
  '產報前檢查',
  '優先閱讀',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
  '頁面顯示，不進計算書、列印或 PDF',
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

function stableSha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function continuousBeamResultSnapshot(ctx) {
  return JSON.parse(JSON.stringify({
    input: ctx.collectSaveData(),
    reactions: (ctx.solution?.reactions || []).map(reaction => ({
      Ry: reaction?.Ry ?? null,
      Mr: reaction?.Mr ?? null,
    })),
    spans: (ctx.diagrams?.spans || []).map(span => ({
      xs: span.xs,
      vs: span.vs,
      ms: span.ms,
      ds: span.ds,
    })),
  }));
}

function reportCalculationFingerprint(reportHtml) {
  return String(reportHtml || '').match(/計算指紋<\/b>(CF-[0-9A-F]{16})/)?.[1] || '';
}

function assertReportHtmlText(reportHtml, label, requiredNeedles, minLength = 360) {
  const text = reportHtmlText(reportHtml);
  assert(text.length >= minLength, `${label} visible report text is substantial`, `chars=${text.length}`);
  for (const needle of requiredNeedles) {
    assert(text.includes(needle), `${label} visible report text includes required wording`, needle);
  }
  for (const needle of pageOnlyNeedles) {
    assert(!text.includes(needle), `${label} visible report text excludes page-only readiness wording`, needle);
  }
  return text;
}

const exportPdfSource = extractFunctionBlock(html, 'exportPDF');
for (const needle of pageOnlyNeedles) {
  assert(!exportPdfSource.includes(needle), 'exportPDF excludes page-only readiness wording', needle);
}

function renderSharedReportPayload(payload) {
  let reportHtml = '';
  const blobContents = new Map();
  let blobSequence = 0;
  const reportWindow = {
    Blob: class MockBlob {
      constructor(parts, options = {}) { this.parts = parts; this.type = options.type || ''; }
    },
    URL: {
      createObjectURL(blob) {
        const url = `blob:contract/${++blobSequence}`;
        blobContents.set(url, blob.parts.map(String).join(''));
        return url;
      },
      revokeObjectURL(url) { blobContents.delete(url); },
    },
    setInterval() { return 1; },
    clearInterval() {},
    open(url) {
      assert(url === 'about:blank', 'shared report opens a blank popup before Blob navigation', url);
      const listeners = new Map();
      const location = {
        href: 'about:blank',
        replace(nextUrl) {
          this.href = nextUrl;
          const nextHtml = blobContents.get(nextUrl);
          assert(typeof nextHtml === 'string', 'shared report navigates to a live Blob URL', nextUrl);
          reportHtml = nextHtml;
          listeners.get('load')?.();
        },
      };
      return { closed: false, location, addEventListener(type, listener) { listeners.set(type, listener); }, focus() {} };
    },
  };
  const context = {
    window: reportWindow,
    console,
    Date,
  };
  vm.createContext(context);
  loadReportUtilities(context);
  vm.runInContext(analysisSectionMetadataSource, context, { filename: analysisSectionMetadataPath });
  context.window.AnalysisSectionToolMetadata = context.AnalysisSectionToolMetadata || analysisSectionMetadata;
  vm.runInContext(sharedReportSource, context, { filename: sharedReportPath });
  assert(typeof context.openReport === 'function', 'shared report renderer exposes openReport', sharedReportPath);
  context.openReport(payload);
  return reportHtml;
}

function buildDocument() {
  const elements = new Map();

  const defaultIds = [
    'unitSystem', 'numSpans', 'matSelect', 'fcGroup', 'fcVal', 'eVal', 'iMode', 'globalI',
    'globalIGroup', 'sectionSelectGroup', 'pickedSectionPanel', 'pickedSectionText',
    'projName', 'projNo', 'projDesigner', 'projNote',
    'spanInputs', 'loadSpanSelect', 'loadInputs', 'ilEnabled', 'ilControls', 'ilType', 'ilParam',
    'ilParamLabel', 'errorMsg', 'reactionTable', 'extremeTable', 'designBtns', 'currentFileLabel',
    'saveStatus', 'saveModalStatus', 'loadModalStatus',
    'reportReadiness',
    'sfdCard', 'bmdCard', 'deflCard', 'ilCard', 'resultsCard',
    'schematicCanvas', 'sfdCanvas', 'bmdCanvas', 'deflCanvas', 'ilCanvas',
    'saveModal', 'loadModal', 'saveDateInput', 'saveProjectInput', 'saveNoteInput', 'loadList',
  ];

  function create(id) {
    const tag = id.endsWith('Canvas') ? 'canvas' : 'div';
    const el = new FakeElement(id, tag);
    if (id.endsWith('Canvas')) el.parentElement = { clientWidth: 1200 };
    if (['sfdCard', 'bmdCard', 'deflCard', 'ilCard', 'resultsCard', 'fcGroup', 'sectionSelectGroup', 'pickedSectionPanel'].includes(id)) {
      el.style.display = 'none';
    }
    elements.set(id, el);
    return el;
  }

  defaultIds.forEach(create);

  const doc = {
    head: new FakeElement('head', 'head'),
    body: new FakeElement('body', 'body'),
    createElement(tagName) {
      return new FakeElement('', tagName);
    },
    getElementById(id) {
      return elements.get(id) || create(id);
    },
    querySelectorAll() {
      return [];
    },
  };

  doc.getElementById('unitSystem').value = 'kN-m';
  doc.getElementById('numSpans').value = '2';
  doc.getElementById('matSelect').value = 'steel';
  doc.getElementById('fcVal').value = '280';
  doc.getElementById('iMode').value = 'direct';
  doc.getElementById('globalI').value = '0.0003';
  doc.getElementById('loadSpanSelect').value = '0';
  doc.getElementById('ilType').value = 'reaction';
  doc.getElementById('ilParam').value = '0';
  doc.getElementById('ilEnabled').checked = false;

  return { doc, elements };
}

function bootPage() {
  const [mainScript, moduleScript] = extractInlineScripts(html);
  const { doc } = buildDocument();
  const listeners = {};

  const context = {
    console,
    Math,
    Date,
    JSON,
    Number,
    String,
    Array,
    Object,
    RegExp,
    Set,
    Map,
    Float64Array,
    parseFloat,
    parseInt,
    isFinite,
    alert() {},
    confirm() { return true; },
    getComputedStyle(el) { return el.style; },
    setTimeout(fn) { return typeof fn === 'function' ? (fn(), 1) : 1; },
    clearTimeout() {},
    initializeApp() { return {}; },
    getFirestore() { return {}; },
    collection() { return {}; },
    addDoc: async () => ({ id: 'fake-doc' }),
    doc: () => ({}),
    getDoc: async () => ({ exists: () => false }),
    getDocs: async () => ({ empty: true, forEach() {} }),
    updateDoc: async () => {},
    deleteDoc: async () => {},
    query: () => ({}),
    orderBy: () => ({}),
    serverTimestamp: () => ({ seconds: 0 }),
    document: doc,
  };

  context.openReport = (cfg) => {
    context.__lastReportConfig = cfg;
  };

  context.window = context;
  context.self = context;
  context.globalThis = context;
  context.addEventListener = (type, handler) => {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(handler);
  };
  context.removeEventListener = () => {};

  vm.createContext(context);
  loadReportUtilities(context);
  vm.runInContext(analysisSectionMetadataSource, context, { filename: analysisSectionMetadataPath });
  context.window.AnalysisSectionToolMetadata = context.AnalysisSectionToolMetadata || analysisSectionMetadata;
  vm.runInContext(sharedReportSource, context, { filename: sharedReportPath });
  context.openReport = (cfg) => {
    context.__lastReportConfig = cfg;
  };
  vm.runInContext(mainScript, context, { filename: '連續梁分析.html#main' });
  [
    'collectSaveData',
    'buildLocalPayload',
    'updateFileLabel',
    'validateContinuousBeamSaveData',
    'restoreLocalPayload',
    'restoreFromData',
  ].forEach(name => {
    vm.runInContext(extractFunctionBlock(moduleScript, name), context, { filename: `連續梁分析.html#${name}` });
  });

  context.__dispatch = (type, event) => {
    (listeners[type] || []).forEach(handler => handler(event));
  };

  context.init();
  return context;
}

function resetToSingleSpan(ctx) {
  ctx.document.getElementById('ilEnabled').checked = false;
  ctx.toggleIL();
  ctx.initModel(1);
  ctx.model.supports[0] = { type: 'pin' };
  ctx.model.supports[1] = { type: 'pin' };
  ctx.model.spans[0] = { L: 6, eiMul: 1, hinges: [] };
  ctx.model.loads[0] = [];
  ctx.renderSpanInputs();
  ctx.renderLoadSpanSelect();
  ctx.document.getElementById('loadSpanSelect').value = '0';
  ctx.renderLoadInputs();
}

function main() {
  const ctx = bootPage();
  assert(ctx.document.getElementById('reportReadiness').innerHTML.includes('產報前檢查'), 'initial readiness card renders', ctx.document.getElementById('reportReadiness').innerHTML);
  assert(ctx.document.getElementById('reportReadiness').innerHTML.includes('暫勿作附件'), 'initial readiness blocks report attachment', ctx.document.getElementById('reportReadiness').innerHTML);

  resetToSingleSpan(ctx);
  ctx.model.loads[0] = [{ type: 'udl', w: 10 }];
  ctx.renderLoadInputs();
  ctx.runAnalysis();
  assert(ctx.document.getElementById('reportReadiness').innerHTML.includes('可作附件，需人工複核'), 'analysis readiness asks for manual review when project fields are missing', ctx.document.getElementById('reportReadiness').innerHTML);
  assert(ctx.document.getElementById('reportReadiness').innerHTML.includes('不會寫入計算書或列印 PDF'), 'analysis readiness keeps page-only boundary', ctx.document.getElementById('reportReadiness').innerHTML);
  assert(ctx.document.getElementById('reportReadiness').innerHTML.includes('頁面顯示，不進計算書、列印或 PDF'), 'analysis readiness keeps boundary row copy', ctx.document.getElementById('reportReadiness').innerHTML);
  assertNear(ctx.solution.reactions[0].Ry, 30, 1e-9, 'simple span UDL left reaction', 'Ry0 = wL/2');
  assertNear(ctx.solution.reactions[1].Ry, 30, 1e-9, 'simple span UDL right reaction', 'Ry1 = wL/2');
  assertNear(Math.max(...ctx.diagrams.spans[0].ms), 45, 1e-9, 'simple span UDL max moment', 'Mmax = wL^2/8');

  let steelTransfer = null;
  ctx.document.getElementById('matSelect').value = 'steel';
  ctx.ForcePicker = {
    sendTo(target, payload, url) {
      steelTransfer = { target, payload, url };
    },
  };
  ctx.dispatchDesign('steel-beam');
  assert(steelTransfer?.target === 'steel-beam', 'continuous beam dispatches only to formal steel beam candidate target', JSON.stringify(steelTransfer));
  assert(steelTransfer?.url === '鋼構工具/steel-beam-formal.html?import=1', 'continuous beam dispatch uses formal steel beam URL', steelTransfer?.url);
  assert(steelTransfer?.payload?.meta?.loadBasis === 'unconfirmed', 'continuous beam dispatch preserves unconfirmed load basis', JSON.stringify(steelTransfer?.payload?.meta));
  assert(steelTransfer?.payload?.material === null, 'continuous beam does not auto-adopt steel material strength', JSON.stringify(steelTransfer?.payload));
  assert(steelTransfer?.payload?.member?.spanCm === 600, 'continuous beam dispatches span as a candidate value', JSON.stringify(steelTransfer?.payload?.member));
  assertNear(steelTransfer?.payload?.forces?.M, 45 / 9.80665, 1e-3, 'continuous beam dispatches positive moment candidate', JSON.stringify(steelTransfer?.payload?.forces));
  assert(steelTransfer?.payload?.forces?.MNeg === 0, 'continuous beam dispatches negative moment candidate', JSON.stringify(steelTransfer?.payload?.forces));
  assertNear(steelTransfer?.payload?.forces?.V, 30 / 9.80665, 1e-3, 'continuous beam dispatches shear candidate', JSON.stringify(steelTransfer?.payload?.forces));

  let concreteTransfer = null;
  ctx.document.getElementById('matSelect').value = 'concrete';
  ctx.ForcePicker = {
    sendTo(target, payload, url) {
      concreteTransfer = { target, payload, url };
    },
  };
  ctx.dispatchDesign('beam');
  assert(concreteTransfer?.target === 'beam', 'continuous beam dispatches RC candidate to beam only', JSON.stringify(concreteTransfer));
  assert(concreteTransfer?.url === '鋼筋混凝土/tools/beam.html?import=1', 'continuous beam dispatch uses RC beam URL', concreteTransfer?.url);
  assert(concreteTransfer?.payload?.meta?.loadBasis === 'unconfirmed', 'continuous beam RC dispatch preserves unconfirmed load basis', JSON.stringify(concreteTransfer?.payload?.meta));
  assert(concreteTransfer?.payload?.material === null && concreteTransfer?.payload?.section === null, 'continuous beam does not auto-adopt RC material or section', JSON.stringify(concreteTransfer?.payload));
  assert(!Object.prototype.hasOwnProperty.call(concreteTransfer?.payload?.forces || {}, 'P'), 'continuous beam RC dispatch has no fabricated axial force', JSON.stringify(concreteTransfer?.payload?.forces));

  ctx.document.getElementById('projName').value = '未填';
  ctx.document.getElementById('projNo').value = 'CB-001';
  ctx.document.getElementById('projDesigner').value = '未填';
  ctx.renderContinuousBeamReadiness();
  assert(ctx.document.getElementById('reportReadiness').innerHTML.includes('未填欄位由主文承接'), 'blank optional attachment identity is inherited from the main report', ctx.document.getElementById('reportReadiness').innerHTML);
  assert(!ctx.document.getElementById('reportReadiness').innerHTML.includes('缺 計畫名稱、設計人員'), 'blank optional attachment identity is not treated as an attachment defect', ctx.document.getElementById('reportReadiness').innerHTML);
  const placeholderSave = ctx.collectSaveData();
  assert(placeholderSave.projName === '', 'placeholder project name is normalized before local save', JSON.stringify(placeholderSave));
  assert(placeholderSave.projDesigner === '', 'placeholder designer is normalized before local save', JSON.stringify(placeholderSave));
  ctx.exportPDF();
  assert(ctx.__lastReportConfig.textExport === true, 'continuous beam report enables governed TXT', JSON.stringify(ctx.__lastReportConfig.textExport));
  assert(ctx.__lastReportConfig.project.name === '', 'placeholder project name is scrubbed before report export', JSON.stringify(ctx.__lastReportConfig.project));
  assert(ctx.__lastReportConfig.project.no === 'CB-001', 'project number remains in report export', JSON.stringify(ctx.__lastReportConfig.project));
  assert(ctx.__lastReportConfig.project.designer === '', 'placeholder designer is scrubbed before report export', JSON.stringify(ctx.__lastReportConfig.project));
  assert(ctx.__lastReportConfig.documentState?.label === '內部審閱', 'new continuous beam report defaults to printable internal review', JSON.stringify(ctx.__lastReportConfig.documentState));
  const reportHtml = renderSharedReportPayload(ctx.__lastReportConfig);
  assert(reportHtml.includes('data-text-export-enabled="true"'), 'continuous beam report carries TXT enablement into the report window', 'data-text-export-enabled=true');
  assert(reportHtml.includes('repDownloadCurrentText') && reportHtml.includes('下載文字計算書 TXT'), 'continuous beam report renders the TXT download control', 'repDownloadCurrentText');
  const reportText = assertReportHtmlText(reportHtml, 'continuous beam runtime report', [
    '連續梁分析計算書',
    '計畫編號',
    'CB-001',
    '支承反力',
    '梁示意圖',
    '剪力圖',
    '彎矩圖',
  ]);
  assert(reportHtml.includes('連續梁分析計算書'), 'continuous beam runtime report title', '連續梁分析計算書');
  assert(!reportText.includes('計畫名稱'), 'continuous beam runtime report omits blank optional project name', reportText);
  assert(reportHtml.includes('CB-001'), 'continuous beam runtime report project number', 'CB-001');
  assert(reportHtml.includes('文件狀態：內部審閱'), 'continuous beam runtime report renders printable internal-review status', '文件狀態：內部審閱');
  assert(reportHtml.includes('本計算內容已完成審閱，核可作為正式附件'), 'continuous beam runtime report exposes approval checkbox', '核可作為正式附件');
  assert(!reportHtml.includes('未填'), 'continuous beam runtime report excludes raw placeholder text', '未填');
  assert(!reportText.includes('未填'), 'continuous beam runtime visible text excludes raw placeholder text', '未填');
  for (const needle of pageOnlyNeedles) {
    assert(!reportHtml.includes(needle), 'continuous beam runtime report excludes page-only readiness wording', needle);
  }

  resetToSingleSpan(ctx);
  ctx.model.loads[0] = [{ type: 'point', P: 50, a: 3 }];
  ctx.renderLoadInputs();
  ctx.runAnalysis();
  const jumps = ctx.diagrams.spans[0].xs
    .map((x, i) => ({ x, v: ctx.diagrams.spans[0].vs[i] }))
    .filter(p => Math.abs(p.x - 3) < 1e-9);
  assert(jumps.length === 2, 'point load shear jump preserved', 'same x is sampled on both sides of the load');
  assertNear(jumps[0].v, 25, 1e-9, 'point load left shear', 'V(3-) = +25');
  assertNear(jumps[1].v, -25, 1e-9, 'point load right shear', 'V(3+) = -25');

  resetToSingleSpan(ctx);
  ctx.model.loads[0] = [{ type: 'point', P: 50, a: 8 }];
  ctx.renderLoadInputs();
  ctx.runAnalysis();
  assert(
    ctx.document.getElementById('errorMsg').textContent.includes('位置 a 必須介於 0 與 6.000 m 之間'),
    'out-of-span point load rejected',
    ctx.document.getElementById('errorMsg').textContent
  );
  assert(ctx.document.getElementById('reportReadiness').innerHTML.includes('暫勿作附件'), 'invalid load blocks attachment readiness', ctx.document.getElementById('reportReadiness').innerHTML);
  assert(ctx.document.getElementById('resultsCard').style.display === 'none', 'invalid load keeps results hidden', 'results card stays hidden after validation failure');

  resetToSingleSpan(ctx);
  ctx.model.loads[0] = [{ type: 'udl', w: 10 }];
  ctx.renderLoadInputs();
  ctx.document.getElementById('ilEnabled').checked = true;
  ctx.toggleIL();
  ctx.document.getElementById('ilType').value = 'reaction';
  ctx.onILTypeChange();
  ctx.document.getElementById('ilParam').value = '9';
  ctx.runAnalysis();
  assert(
    ctx.document.getElementById('errorMsg').textContent.includes('影響線支承編號必須為 0 ~ 1 的整數'),
    'invalid influence reaction index rejected',
    ctx.document.getElementById('errorMsg').textContent
  );
  assert(ctx.document.getElementById('ilCard').style.display === 'none', 'invalid influence line keeps card hidden', 'IL card stays hidden after validation failure');

  ctx.document.getElementById('projName').value = 'Project X';
  ctx.document.getElementById('projNo').value = 'P-001';
  ctx.document.getElementById('projDesigner').value = 'Alice';
  ctx.document.getElementById('projNote').value = 'Variant A';
  ctx.__dispatch('message', {
    data: {
      source: 'sectionTool',
      title: 'Rect Beam',
      Ix_cm4: 540000,
      section: { shape: 'rect', b: 30, h: 60 },
    },
  });
  const saved = ctx.collectSaveData();
  ctx.document.getElementById('projName').value = '';
  ctx.document.getElementById('projNo').value = '';
  ctx.document.getElementById('projDesigner').value = '';
  ctx.document.getElementById('projNote').value = '';
  ctx.restoreFromData(saved);
  const restored = ctx.collectSaveData();
  assert(restored.projName === 'Project X', 'save/restore keeps project name', restored.projName);
  assert(restored.projNo === 'P-001', 'save/restore keeps project number', restored.projNo);
  assert(restored.projDesigner === 'Alice', 'save/restore keeps designer', restored.projDesigner);
  assert(restored.projNote === 'Variant A', 'save/restore keeps note', restored.projNote);
  assert(restored.pickedSection && restored.pickedSection.title === 'Rect Beam', 'save/restore keeps picked section', restored.pickedSection ? restored.pickedSection.title : 'missing');

  ctx.initModel(2);
  ctx.model.supports[0] = { type: 'pin' };
  ctx.model.supports[1] = { type: 'roller' };
  ctx.model.supports[2] = { type: 'pin' };
  ctx.model.spans[0] = { L: 5.5, eiMul: 1, hinges: [] };
  ctx.model.spans[1] = { L: 7.25, eiMul: 0.85, hinges: [] };
  ctx.model.loads[0] = [
    { type: 'udl', w: 12.5 },
    { type: 'point', P: 18, a: 2.2 },
  ];
  ctx.model.loads[1] = [
    { type: 'trapezoid', w1: 5, w2: 14 },
    { type: 'moment', M: 9.5, a: 4.1 },
  ];
  ctx.document.getElementById('numSpans').value = '2';
  ctx.document.getElementById('unitSystem').value = 'kN-m';
  ctx.document.getElementById('matSelect').value = 'steel';
  ctx.document.getElementById('iMode').value = 'direct';
  ctx.document.getElementById('globalI').value = '0.00042';
  ctx.document.getElementById('eVal').value = '204000000';
  ctx.document.getElementById('ilEnabled').checked = false;
  ctx.renderSpanInputs();
  ctx.renderLoadSpanSelect();
  ctx.renderLoadInputs();
  ctx.runAnalysis();
  const sourcePayload = JSON.parse(JSON.stringify(ctx.buildLocalPayload()));
  const sourceSnapshot = continuousBeamResultSnapshot(ctx);
  const sourceSnapshotSha256 = stableSha256(sourceSnapshot);
  ctx.exportPDF();
  const sourceReportHtml = renderSharedReportPayload(ctx.__lastReportConfig);
  const sourceFingerprint = reportCalculationFingerprint(sourceReportHtml);
  assert(sourcePayload.schema === 'continuous-beam.project.v1', 'local JSON declares continuous beam schema', sourcePayload.schema);
  assert(sourcePayload.tool.pageVersion === analysisSectionMetadata['continuous-beam'].version, 'local JSON records current page version', sourcePayload.tool.pageVersion);
  assert(sourcePayload.tool.calculationEngine === analysisSectionMetadata['continuous-beam'].calculationEngine, 'local JSON records canonical calculation engine', sourcePayload.tool.calculationEngine);
  assert(/^[0-9a-f]{64}$/.test(sourceSnapshotSha256), 'source input/result snapshot has stable SHA-256', sourceSnapshotSha256);
  assert(/^CF-[0-9A-F]{16}$/.test(sourceFingerprint), 'source report exposes calculation fingerprint', sourceFingerprint);
  assert(sourceReportHtml.includes(`<b>工具版本</b>${analysisSectionMetadata['continuous-beam'].version}`), 'continuous beam report preserves canonical public version casing', analysisSectionMetadata['continuous-beam'].version);
  assert(sourceReportHtml.includes(`<b>計算引擎</b>${analysisSectionMetadata['continuous-beam'].calculationEngine}`), 'continuous beam report identifies calculation engine', analysisSectionMetadata['continuous-beam'].calculationEngine);

  ctx.model.spans[0].L = 3;
  ctx.model.loads[0] = [];
  ctx.document.getElementById('projNo').value = 'MUTATED';
  ctx.runAnalysis();
  ctx.restoreLocalPayload(JSON.parse(JSON.stringify(sourcePayload)), 'round-trip.json');
  ctx.runAnalysis();
  const replaySnapshot = continuousBeamResultSnapshot(ctx);
  const replaySnapshotSha256 = stableSha256(replaySnapshot);
  ctx.exportPDF();
  const replayReportHtml = renderSharedReportPayload(ctx.__lastReportConfig);
  const replayFingerprint = reportCalculationFingerprint(replayReportHtml);
  assert(replaySnapshotSha256 === sourceSnapshotSha256, 'JSON replay reproduces every adopted input and analysis result', `source=${sourceSnapshotSha256}, replay=${replaySnapshotSha256}`);
  assert(replayFingerprint === sourceFingerprint, 'JSON replay reproduces the calculation-book fingerprint', `source=${sourceFingerprint}, replay=${replayFingerprint}`);
  assert(ctx.document.getElementById('saveStatus').textContent.includes('round-trip.json'), 'JSON replay reports the restored local filename', ctx.document.getElementById('saveStatus').textContent);

  const stateBeforeRejectedImport = stableSha256(ctx.collectSaveData());
  let rejectedSchemaMessage = '';
  try {
    ctx.restoreLocalPayload({ ...sourcePayload, schema: 'continuous-beam.project.v999' }, 'future.json');
  } catch (error) {
    rejectedSchemaMessage = error.message;
  }
  assert(rejectedSchemaMessage.includes('不支援的連續梁案例版本'), 'unknown JSON schema is rejected before restore', rejectedSchemaMessage);
  assert(stableSha256(ctx.collectSaveData()) === stateBeforeRejectedImport, 'rejected JSON schema leaves the active case unchanged', stateBeforeRejectedImport);

  let rejectedModelMessage = '';
  const malformedPayload = JSON.parse(JSON.stringify(sourcePayload));
  malformedPayload.data.model.supports.pop();
  try {
    ctx.restoreLocalPayload(malformedPayload, 'malformed.json');
  } catch (error) {
    rejectedModelMessage = error.message;
  }
  assert(rejectedModelMessage.includes('支承資料與跨數不一致'), 'malformed model topology is rejected before restore', rejectedModelMessage);
  assert(stableSha256(ctx.collectSaveData()) === stateBeforeRejectedImport, 'rejected malformed model leaves the active case unchanged', stateBeforeRejectedImport);

  resetToSingleSpan(ctx);
  ctx.model.loads[0] = [{ type: 'udl', w: 10 }];
  ctx.renderLoadInputs();
  ctx.document.getElementById('iMode').value = 'section';
  ctx.runAnalysis();
  ctx.exportPDF();
  assert(ctx.__lastReportConfig.documentState?.label === '內部審閱', 'every newly generated continuous beam report starts as internal review', JSON.stringify(ctx.__lastReportConfig.documentState));
  const readyReportHtml = renderSharedReportPayload(ctx.__lastReportConfig);
  assert(readyReportHtml.includes('文件狀態：內部審閱'), 'complete continuous beam runtime report remains printable before approval', '文件狀態：內部審閱');
  assert(readyReportHtml.includes('data-document-class="internal-review"'), 'complete continuous beam report records internal-review document class', 'internal-review');
  assert(readyReportHtml.includes('本計算內容已完成審閱，核可作為正式附件'), 'complete continuous beam report exposes explicit approval action', '核可作為正式附件');
  ctx.document.getElementById('ilEnabled').checked = true;
  ctx.toggleIL();
  ctx.document.getElementById('ilType').value = 'moment';
  ctx.onILTypeChange();
  ctx.document.getElementById('ilParam').value = '3';
  ctx.runAnalysis();
  let redrawCalls = 0;
  const originalDrawIL = ctx.drawILDiagram;
  ctx.drawILDiagram = function (...args) {
    redrawCalls += 1;
    return originalDrawIL.apply(this, args);
  };
  ctx.redrawAll();
  assert(redrawCalls >= 1, 'redrawAll re-renders influence line', `drawILDiagram calls=${redrawCalls}`);
  ctx.drawILDiagram = originalDrawIL;

  runIndependentClosedFormChecks(ctx);
  runInstabilityChecks(ctx);
  runInternalForceSnapshotCheck(ctx);
  runDeflectionClosedFormChecks(ctx);

  console.log('\nAll continuous beam regression checks passed.');
}

// ===== 獨立閉合解核對（預期值由結構力學公式推導，不讀取工具輸出） =====
function setupBeam(ctx, { supports, spans, loads, E = '204000000', I = '0.00042' }) {
  ctx.document.getElementById('ilEnabled').checked = false;
  ctx.toggleIL();
  ctx.document.getElementById('iMode').value = 'direct';
  ctx.document.getElementById('globalI').value = I;
  ctx.document.getElementById('eVal').value = E; // 預設 EI ≈ 85,680 kN·m²，實務量級
  ctx.initModel(spans.length);
  supports.forEach((type, i) => { ctx.model.supports[i] = { type }; });
  spans.forEach((sp, i) => { ctx.model.spans[i] = { L: sp.L, eiMul: sp.eiMul || 1, hinges: sp.hinges || [] }; });
  spans.forEach((_, i) => { ctx.model.loads[i] = (loads[i] || []).map(ld => ({ ...ld })); });
  ctx.renderSpanInputs();
  ctx.renderLoadSpanSelect();
  ctx.renderLoadInputs();
  ctx.runAnalysis();
}

function spanEndMoment(ctx, spanIndex, end) {
  const ms = ctx.diagrams.spans[spanIndex].ms;
  return end === 'start' ? ms[0] : ms[ms.length - 1];
}

function runIndependentClosedFormChecks(ctx) {
  const relTol = (expected) => Math.max(1e-6, Math.abs(expected) * 1e-6);

  // 1) 兩等跨連續梁、全跨均佈：R_A = R_C = 3wL/8，R_B = 5wL/4，M_B = −wL²/8
  {
    const w = 10, L = 6;
    setupBeam(ctx, { supports: ['pin', 'roller', 'roller'], spans: [{ L }, { L }], loads: [[{ type: 'udl', w }], [{ type: 'udl', w }]] });
    assert(!!ctx.solution, 'two equal spans solves', 'solution present');
    const R = ctx.solution.reactions;
    assertNear(R[0].Ry, 3 * w * L / 8, relTol(22.5), 'two equal spans end reaction', 'R_A = 3wL/8');
    assertNear(R[1].Ry, 5 * w * L / 4, relTol(75), 'two equal spans interior reaction', 'R_B = 5wL/4');
    assertNear(R[2].Ry, 3 * w * L / 8, relTol(22.5), 'two equal spans far end reaction', 'R_C = 3wL/8');
    assertNear(spanEndMoment(ctx, 0, 'end'), -w * L * L / 8, relTol(45), 'two equal spans interior support moment', 'M_B = -wL^2/8');
    assertNear(spanEndMoment(ctx, 1, 'start'), -w * L * L / 8, relTol(45), 'two equal spans moment continuous across support', 'M_B (span 2 start) = -wL^2/8');
    assertNear(Math.max(...ctx.diagrams.spans[0].ms), 9 * w * L * L / 128, 1e-3, 'two equal spans max positive moment', 'M+ = 9wL^2/128 at x = 3L/8');
  }

  // 2) 三等跨連續梁、全跨均佈：M_B = M_C = −wL²/10，R_A = 0.4wL，R_B = 1.1wL
  {
    const w = 12, L = 5;
    setupBeam(ctx, { supports: ['pin', 'roller', 'roller', 'roller'], spans: [{ L }, { L }, { L }], loads: [[{ type: 'udl', w }], [{ type: 'udl', w }], [{ type: 'udl', w }]] });
    const R = ctx.solution.reactions;
    assertNear(R[0].Ry, 0.4 * w * L, relTol(24), 'three equal spans end reaction', 'R_A = 0.4wL');
    assertNear(R[1].Ry, 1.1 * w * L, relTol(66), 'three equal spans first interior reaction', 'R_B = 1.1wL');
    assertNear(spanEndMoment(ctx, 0, 'end'), -w * L * L / 10, relTol(30), 'three equal spans support B moment', 'M_B = -wL^2/10');
    assertNear(spanEndMoment(ctx, 1, 'end'), -w * L * L / 10, relTol(30), 'three equal spans support C moment', 'M_C = -wL^2/10');
  }

  // 3) 不等跨、不同 EI 之兩跨連續梁：三彎矩方程式
  //    2M_B(L1/I1 + L2/I2) = −(wL1³/(4I1) + wL2³/(4I2))
  {
    const w = 10, L1 = 5, L2 = 8, I1 = 1, I2 = 0.85;
    const MB = -(w * L1 ** 3 / I1 + w * L2 ** 3 / I2) / (8 * (L1 / I1 + L2 / I2));
    const RA = w * L1 / 2 + MB / L1;
    const RC = w * L2 / 2 + MB / L2;
    const RB = w * (L1 + L2) - RA - RC;
    setupBeam(ctx, { supports: ['pin', 'roller', 'roller'], spans: [{ L: L1, eiMul: I1 }, { L: L2, eiMul: I2 }], loads: [[{ type: 'udl', w }], [{ type: 'udl', w }]] });
    const R = ctx.solution.reactions;
    assertNear(spanEndMoment(ctx, 0, 'end'), MB, relTol(MB), 'unequal spans with EI ratio support moment', `three-moment M_B = ${MB.toFixed(6)}`);
    assertNear(R[0].Ry, RA, relTol(RA), 'unequal spans with EI ratio left reaction', `R_A = wL1/2 + M_B/L1 = ${RA.toFixed(6)}`);
    assertNear(R[1].Ry, RB, relTol(RB), 'unequal spans with EI ratio interior reaction', `R_B = ${RB.toFixed(6)}`);
    assertNear(R[2].Ry, RC, relTol(RC), 'unequal spans with EI ratio right reaction', `R_C = wL2/2 + M_B/L2 = ${RC.toFixed(6)}`);
  }

  // 4) 一端固定一端滾支（propped cantilever）均佈：R_roller = 3wL/8，|M_fixed| = wL²/8
  {
    const w = 10, L = 6;
    setupBeam(ctx, { supports: ['fixed', 'roller'], spans: [{ L }], loads: [[{ type: 'udl', w }]] });
    const R = ctx.solution.reactions;
    assertNear(R[1].Ry, 3 * w * L / 8, relTol(22.5), 'propped cantilever roller reaction', 'R_B = 3wL/8');
    assertNear(R[0].Ry, 5 * w * L / 8, relTol(37.5), 'propped cantilever fixed reaction', 'R_A = 5wL/8');
    assertNear(Math.abs(R[0].Mr), w * L * L / 8, relTol(45), 'propped cantilever fixed-end moment magnitude', '|M_A| = wL^2/8');
    assertNear(spanEndMoment(ctx, 0, 'start'), -w * L * L / 8, relTol(45), 'propped cantilever fixed-end hogging moment', 'M_A = -wL^2/8');
  }

  // 5) 兩端固定、跨中集中載重：M_end = −PL/8，M_mid = +PL/8，R = P/2
  {
    const P = 20, L = 6;
    setupBeam(ctx, { supports: ['fixed', 'fixed'], spans: [{ L }], loads: [[{ type: 'point', P, a: L / 2 }]] });
    const R = ctx.solution.reactions;
    assertNear(R[0].Ry, P / 2, relTol(10), 'fixed-fixed midspan point load reaction', 'R = P/2');
    assertNear(spanEndMoment(ctx, 0, 'start'), -P * L / 8, relTol(15), 'fixed-fixed midspan point load end moment', 'M_end = -PL/8');
    assertNear(Math.max(...ctx.diagrams.spans[0].ms), P * L / 8, 1e-6, 'fixed-fixed midspan point load midspan moment', 'M_mid = +PL/8');
  }

  // 6) 外伸梁（自由端＋鉸支＋滾支）：外伸 a = 2、主跨 L = 6、全長均佈
  //    R_C = w(L²/2 − a²/2)/L，R_B = w(a + L) − R_C，M_B = −wa²/2，自由端反力 = 0
  {
    const w = 10, a = 2, L = 6;
    const RC = w * (L * L / 2 - a * a / 2) / L;
    const RB = w * (a + L) - RC;
    setupBeam(ctx, { supports: ['free', 'pin', 'roller'], spans: [{ L: a }, { L }], loads: [[{ type: 'udl', w }], [{ type: 'udl', w }]] });
    const R = ctx.solution.reactions;
    assertNear(R[0].Ry, 0, 1e-6, 'overhang beam free end carries no reaction', 'R_free = 0');
    assertNear(R[1].Ry, RB, relTol(RB), 'overhang beam support reaction', `R_B = ${RB.toFixed(6)}`);
    assertNear(R[2].Ry, RC, relTol(RC), 'overhang beam far reaction', `R_C = ${RC.toFixed(6)}`);
    assertNear(spanEndMoment(ctx, 0, 'end'), -w * a * a / 2, relTol(20), 'overhang beam support moment', 'M_B = -wa^2/2');
  }
}

// ===== 不穩定結構（機構）須拒算，不得輸出反力 =====
function runInstabilityChecks(ctx) {
  const cases = [
    { title: 'pin + free single span', supports: ['pin', 'free'], spans: [{ L: 6 }] },
    { title: 'roller + free single span', supports: ['roller', 'free'], spans: [{ L: 6 }] },
    { title: 'simple span with internal hinge', supports: ['pin', 'roller'], spans: [{ L: 6, hinges: [3] }] },
    { title: 'two spans with only one vertical support', supports: ['free', 'pin', 'free'], spans: [{ L: 4 }, { L: 4 }] },
  ];
  // 原絕對門檻 1e-14 是否抓到機構取決於 EI 數值的捨入巧合（例：EI = 85,680 可抓到、86,000 抓不到），
  // 故以多組實務量級 EI（鋼梁／RC 梁／小斷面）逐一驗證拒算行為。
  const stiffnessVariants = [
    { E: '204000000', I: '0.00042', label: 'steel EI=85680' },
    { E: '200000000', I: '0.00043', label: 'steel EI=86000' },
    { E: '25000000', I: '0.0045', label: 'RC EI=112500' },
    { E: '204000000', I: '0.0000123', label: 'small EI=2509.2' },
  ];
  for (const c of cases) {
    for (const v of stiffnessVariants) {
      setupBeam(ctx, { supports: c.supports, spans: c.spans, loads: c.spans.map(() => [{ type: 'udl', w: 10 }]), E: v.E, I: v.I });
      const msg = ctx.document.getElementById('errorMsg').textContent;
      assert(ctx.solution == null, `unstable model rejected: ${c.title} (${v.label})`, `solution=${ctx.solution ? JSON.stringify(ctx.solution.reactions) : 'null'}`);
      assert(msg.includes('結構不穩定'), `unstable model shows instability message: ${c.title} (${v.label})`, msg);
    }
  }
  // 穩定模型在同一組 EI 範圍內不得被誤判為不穩定
  for (const v of stiffnessVariants) {
    setupBeam(ctx, { supports: ['pin', 'roller', 'roller'], spans: [{ L: 6 }, { L: 6 }], loads: [[{ type: 'udl', w: 10 }], [{ type: 'udl', w: 10 }]], E: v.E, I: v.I });
    assert(!!ctx.solution, `stable two-span model not falsely rejected (${v.label})`, ctx.document.getElementById('errorMsg').textContent || 'solution present');
    assertNear(ctx.solution.reactions[1].Ry, 75, 1e-6, `stable two-span interior reaction independent of EI (${v.label})`, 'R_B = 5wL/4');
  }
  // 拒算後恢復穩定模型須可正常求解（不殘留錯誤狀態）
  setupBeam(ctx, { supports: ['pin', 'roller'], spans: [{ L: 6 }], loads: [[{ type: 'udl', w: 10 }]] });
  assert(!!ctx.solution, 'stable model solves again after instability rejection', 'solution present');
  assertNear(ctx.solution.reactions[0].Ry, 30, 1e-6, 'stable model reaction after rejection', 'R = wL/2');
}

// ===== 跨內撓度閉合解核對（v 向上為正；δ 為向下撓度，工具 ds = −δ） =====
// 預期值全部由梁理論手推（Macaulay 雙重積分＋邊界條件），對照 Roark's Formulas for Stress and
// Strain 表 8.1；不讀取工具輸出。容許差說明：
//  - 取樣點逐點比對：Hermite＋固端特解在每個子元素內為精確多項式解，誤差只剩勁度矩陣求解與
//    浮點捨入（約 1e-13 相對），故取 1e-9 × max|δ| 為絕對容許差，足以抓到任何係數錯誤（舊版 20%～100%）。
//  - 兩等跨最大撓度：真正極值在 ξ* = (1+√33)/16 = 0.42154，圖面以 L/24 取樣，最近樣點 ξ = 10/24，
//    取樣極值較真值低約 1.5e-4（相對），故取 3e-4 相對容許差。
//  - 斜率以樣點五點四階單側差分估計：子元素內撓度為四次以下多項式，差分無截斷誤差，只剩捨入
//    放大（約 1e-12/h），取 1e-6 相對容許差。
function deflectionAtStations(ctx, spanIdx) {
  const sp = ctx.diagrams.spans[spanIdx];
  return sp.xs.map((xg, k) => ({ x: xg - sp.xStart, d: sp.ds[k] }));
}

function assertDeflectionClosedForm(ctx, spanIdx, deltaDown, title) {
  const pts = deflectionAtStations(ctx, spanIdx);
  const scale = Math.max(...pts.map(p => Math.abs(deltaDown(p.x))));
  const tol = Math.max(1e-15, scale * 1e-9);
  let worst = { err: -1 };
  for (const p of pts) {
    const err = Math.abs(p.d - (-deltaDown(p.x)));
    if (err > worst.err) worst = { err, x: p.x, actual: p.d, expected: -deltaDown(p.x) };
  }
  const interior = pts.filter(p => p.x > 1e-9 && p.x < ctx.diagrams.spans[spanIdx].L - 1e-9).length;
  assert(interior >= 20 && worst.err <= tol, title,
    `stations=${pts.length}, worst at x=${worst.x}: actual=${worst.actual}, expected=${worst.expected}, err=${worst.err}, tol=${tol}`);
}

function oneSidedSlope(pts, x0, side) {
  // 五點四階單側差分：v′ ≈ ±(25v0 − 48v1 + 36v2 − 16v3 + 3v4) / (12h)，對四次以下多項式為精確
  const near = pts.filter(p => side === 'left' ? p.x <= x0 + 1e-9 : p.x >= x0 - 1e-9)
    .sort((a, b) => side === 'left' ? b.x - a.x : a.x - b.x);
  const [p0, p1, p2, p3, p4] = near;
  const h = Math.abs(p1.x - p0.x);
  assert([p1, p2, p3, p4].every((p, i) => Math.abs(Math.abs(p.x - near[i].x) - h) < 1e-9), 'slope stencil is uniform', `x=${p0.x},${p1.x},${p4.x}`);
  const d = (25 * p0.d - 48 * p1.d + 36 * p2.d - 16 * p3.d + 3 * p4.d) / (12 * h);
  return side === 'left' ? d : -d;
}

function runDeflectionClosedFormChecks(ctx) {
  const E = 204000000, I = 0.00042, EI = E * I; // 85,680 kN·m²
  const mac = (x, a, n) => (x > a ? (x - a) ** n : 0);

  // 1) 簡支均佈：δ = w x (L³ − 2Lx² + x³) / 24EI，跨中 5wL⁴/384EI
  {
    const w = 10, L = 6;
    setupBeam(ctx, { supports: ['pin', 'roller'], spans: [{ L }], loads: [[{ type: 'udl', w }]] });
    const delta = x => w * x * (L ** 3 - 2 * L * x * x + x ** 3) / (24 * EI);
    assertDeflectionClosedForm(ctx, 0, delta, 'deflection: simply supported UDL at all stations');
    assertNear(-Math.min(...ctx.diagrams.spans[0].ds), 5 * w * L ** 4 / (384 * EI), 5 * w * L ** 4 / (384 * EI) * 1e-9,
      'deflection: simply supported UDL max = 5wL^4/384EI', 'midspan');
  }

  // 2) 簡支跨中集中：δ = P x (3L² − 4x²) / 48EI（x ≤ L/2，對稱），跨中 PL³/48EI
  {
    const P = 50, L = 6, a = 3;
    setupBeam(ctx, { supports: ['pin', 'roller'], spans: [{ L }], loads: [[{ type: 'point', P, a }]] });
    const delta = x => { const s = Math.min(x, L - x); return P * s * (3 * L * L - 4 * s * s) / (48 * EI); };
    assertDeflectionClosedForm(ctx, 0, delta, 'deflection: simply supported midspan point at all stations');
    assertNear(-Math.min(...ctx.diagrams.spans[0].ds), P * L ** 3 / (48 * EI), P * L ** 3 / (48 * EI) * 1e-9,
      'deflection: simply supported midspan point max = PL^3/48EI', 'midspan');
  }

  // 3) 兩等跨全跨均佈：三彎矩式 M_B = −wL²/8；跨 1 = 簡支均佈 − M_B 引起之上拱
  //    δ(ξ) = wL⁴/48EI · (ξ − 3ξ³ + 2ξ⁴)；dδ/dξ = 0 → 8ξ³ − 9ξ² + 1 = 0 → ξ* = (1+√33)/16
  //    δmax = 0.0054161 wL⁴/EI（跨中 wL⁴/192EI = 0.0052083 wL⁴/EI）
  {
    const w = 10, L = 6;
    setupBeam(ctx, { supports: ['pin', 'roller', 'roller'], spans: [{ L }, { L }], loads: [[{ type: 'udl', w }], [{ type: 'udl', w }]] });
    const delta1 = x => { const xi = x / L; return w * L ** 4 / (48 * EI) * (xi - 3 * xi ** 3 + 2 * xi ** 4); };
    assertDeflectionClosedForm(ctx, 0, delta1, 'deflection: two equal spans UDL span 1 at all stations');
    assertDeflectionClosedForm(ctx, 1, x => delta1(L - x), 'deflection: two equal spans UDL span 2 (mirror) at all stations');
    const xiStar = (1 + Math.sqrt(33)) / 16;
    const deltaMax = w * L ** 4 / (48 * EI) * (xiStar - 3 * xiStar ** 3 + 2 * xiStar ** 4);
    assertNear(deltaMax * EI / (w * L ** 4), 0.0054161216, 1e-9, 'two-span max deflection coefficient (hand)', 'ξ* = (1+√33)/16');
    const ds0 = ctx.diagrams.spans[0].ds;
    assertNear(-Math.min(...ds0), deltaMax, deltaMax * 3e-4, 'deflection: two equal spans sampled max within L/24 sampling of exact max', `exact=${deltaMax}`);
    assertNear(delta1(L / 2), w * L ** 4 / (192 * EI), 1e-15, 'two-span midspan coefficient 1/192 (hand)', 'ξ = 0.5');
  }

  // 4) 兩端固定均佈：δ = w x² (L − x)² / 24EI，跨中 wL⁴/384EI
  {
    const w = 10, L = 6;
    setupBeam(ctx, { supports: ['fixed', 'fixed'], spans: [{ L }], loads: [[{ type: 'udl', w }]] });
    const delta = x => w * x * x * (L - x) ** 2 / (24 * EI);
    assertDeflectionClosedForm(ctx, 0, delta, 'deflection: fixed-fixed UDL at all stations');
    assertNear(-Math.min(...ctx.diagrams.spans[0].ds), w * L ** 4 / (384 * EI), w * L ** 4 / (384 * EI) * 1e-9,
      'deflection: fixed-fixed UDL max = wL^4/384EI', 'midspan');
  }

  // 5) 兩端固定集中（a 處，b = L − a）：x ≤ a 時 δ = P b² x² (3aL − 3ax − bx) / 6EIL³，x ≥ a 鏡射
  //    跨中 PL³/192EI；載重點 P a³ b³ / 3EIL³
  const ffPoint = (P, a, L) => x => (x <= a
    ? P * (L - a) ** 2 * x * x * (3 * a * L - 3 * a * x - (L - a) * x) / (6 * EI * L ** 3)
    : P * a * a * (L - x) ** 2 * (3 * (L - a) * L - 3 * (L - a) * (L - x) - a * (L - x)) / (6 * EI * L ** 3));
  {
    const P = 50, L = 6;
    setupBeam(ctx, { supports: ['fixed', 'fixed'], spans: [{ L }], loads: [[{ type: 'point', P, a: 3 }]] });
    assertDeflectionClosedForm(ctx, 0, ffPoint(P, 3, L), 'deflection: fixed-fixed midspan point at all stations');
    assertNear(-Math.min(...ctx.diagrams.spans[0].ds), P * L ** 3 / (192 * EI), P * L ** 3 / (192 * EI) * 1e-9,
      'deflection: fixed-fixed midspan point max = PL^3/192EI', 'midspan');
    setupBeam(ctx, { supports: ['fixed', 'fixed'], spans: [{ L }], loads: [[{ type: 'point', P, a: 2 }]] });
    assertDeflectionClosedForm(ctx, 0, ffPoint(P, 2, L), 'deflection: fixed-fixed off-centre point (a = L/3) at all stations');
    assertNear(-ctx.diagrams.spans[0].ds[ctx.diagrams.spans[0].xs.findIndex(x => Math.abs(x - 2) < 1e-9)],
      P * 8 * 64 / (3 * EI * 216), 1e-12, 'deflection: fixed-fixed point under load = Pa^3b^3/3EIL^3', 'x = a');
    // 疊加：均佈＋偏心集中
    setupBeam(ctx, { supports: ['fixed', 'fixed'], spans: [{ L }], loads: [[{ type: 'udl', w: 10 }, { type: 'point', P, a: 2 }]] });
    assertDeflectionClosedForm(ctx, 0, x => 10 * x * x * (L - x) ** 2 / (24 * EI) + ffPoint(P, 2, L)(x),
      'deflection: fixed-fixed UDL + point superposition at all stations');
  }

  // 6) 懸臂（左端固定）均佈：δ = w x² (6L² − 4Lx + x²) / 24EI，自由端 wL⁴/8EI
  //    懸臂自由端集中：δ = P x² (3L − x) / 6EI，自由端 PL³/3EI
  {
    const w = 10, P = 50, L = 6;
    setupBeam(ctx, { supports: ['fixed', 'free'], spans: [{ L }], loads: [[{ type: 'udl', w }]] });
    assertDeflectionClosedForm(ctx, 0, x => w * x * x * (6 * L * L - 4 * L * x + x * x) / (24 * EI), 'deflection: cantilever UDL at all stations');
    assertNear(-Math.min(...ctx.diagrams.spans[0].ds), w * L ** 4 / (8 * EI), w * L ** 4 / (8 * EI) * 1e-9, 'deflection: cantilever UDL tip = wL^4/8EI', 'x = L');
    setupBeam(ctx, { supports: ['fixed', 'free'], spans: [{ L }], loads: [[{ type: 'point', P, a: L }]] });
    assertDeflectionClosedForm(ctx, 0, x => P * x * x * (3 * L - x) / (6 * EI), 'deflection: cantilever tip point at all stations');
    assertNear(-Math.min(...ctx.diagrams.spans[0].ds), P * L ** 3 / (3 * EI), P * L ** 3 / (3 * EI) * 1e-9, 'deflection: cantilever tip point = PL^3/3EI', 'x = L');
  }

  // 7) 簡支梯形 4→10 = 均佈 4 ＋ 三角形 0→6；三角形 δ = w0 x (7L⁴ − 10L²x² + 3x⁴) / 360EIL
  {
    const L = 6;
    const tri = (w0) => x => w0 * x * (7 * L ** 4 - 10 * L * L * x * x + 3 * x ** 4) / (360 * EI * L);
    const ssUdl = (w) => x => w * x * (L ** 3 - 2 * L * x * x + x ** 3) / (24 * EI);
    setupBeam(ctx, { supports: ['pin', 'roller'], spans: [{ L }], loads: [[{ type: 'trapezoid', w1: 0, w2: 10 }]] });
    assertDeflectionClosedForm(ctx, 0, tri(10), 'deflection: simply supported triangle 0→10 at all stations');
    setupBeam(ctx, { supports: ['pin', 'roller'], spans: [{ L }], loads: [[{ type: 'trapezoid', w1: 4, w2: 10 }]] });
    assertDeflectionClosedForm(ctx, 0, x => ssUdl(4)(x) + tri(6)(x), 'deflection: simply supported trapezoid 4→10 at all stations');
    // 兩端固定三角形 0→w0：R_A = 3w0L/20、M_A = w0L²/30 → δ = w0 x² (L − x)² (2L + x) / 120EIL
    setupBeam(ctx, { supports: ['fixed', 'fixed'], spans: [{ L }], loads: [[{ type: 'trapezoid', w1: 0, w2: 10 }]] });
    assertDeflectionClosedForm(ctx, 0, x => 10 * x * x * (L - x) ** 2 * (2 * L + x) / (120 * EI * L), 'deflection: fixed-fixed triangle 0→10 at all stations');
  }

  // 8) 集中彎矩（工具慣例：x > a 時 M_sag −= M0），Macaulay：
  //    簡支：R = M0/L，δ = [−M0 x³/6L + M0⟨x−a⟩²/2 + M0 (L/6 − b²/2L) x] / EI
  //    兩端固定：R = 6M0ab/L³、M_A = M0 b (2a − b)/L²，δ = [M_A x²/2 − R x³/6 + M0⟨x−a⟩²/2] / EI
  {
    const L = 6, M0 = 20;
    setupBeam(ctx, { supports: ['pin', 'roller'], spans: [{ L }], loads: [[{ type: 'moment', M: M0, a: 2 }]] });
    const b1 = L - 2;
    assertDeflectionClosedForm(ctx, 0, x => (-M0 * x ** 3 / (6 * L) + M0 * mac(x, 2, 2) / 2 + M0 * (L / 6 - b1 * b1 / (2 * L)) * x) / EI,
      'deflection: simply supported concentrated moment at all stations');
    setupBeam(ctx, { supports: ['fixed', 'fixed'], spans: [{ L }], loads: [[{ type: 'moment', M: M0, a: 3 }]] });
    const a = 3, b = 3, R = 6 * M0 * a * b / L ** 3, MA = M0 * b * (2 * a - b) / (L * L);
    assertDeflectionClosedForm(ctx, 0, x => (MA * x * x / 2 - R * x ** 3 / 6 + M0 * mac(x, a, 2) / 2) / EI,
      'deflection: fixed-fixed concentrated moment at all stations');
  }

  // 9) 內絞點（Gerber）：左端固定、x = 3 絞點、x = 6 滾支，全跨均佈 w = 10
  //    右段為簡支（絞點端受絞點力），絞點力 = wb/2 = 15；左段為懸臂受均佈＋端點 15
  //    δh = (w a⁴/8 + 15 a³/3)/EI = 236.25/EI；右段 δ = δh (1 − x′/b) + 簡支均佈
  {
    const w = 10, a = 3, b = 3, Hf = w * b / 2;
    setupBeam(ctx, { supports: ['fixed', 'roller'], spans: [{ L: 6, hinges: [3] }], loads: [[{ type: 'udl', w }]] });
    const dh = (w * a ** 4 / 8 + Hf * a ** 3 / 3) / EI;
    assertNear(dh * EI, 236.25, 1e-12, 'hinge deflection hand value', 'δh·EI = 236.25');
    const delta = x => (x <= a
      ? w * x * x * (6 * a * a - 4 * a * x + x * x) / (24 * EI) + Hf * x * x * (3 * a - x) / (6 * EI)
      : dh * (1 - (x - a) / b) + w * (x - a) * (b ** 3 - 2 * b * (x - a) ** 2 + (x - a) ** 3) / (24 * EI));
    assertDeflectionClosedForm(ctx, 0, delta, 'deflection: Gerber beam with internal hinge at all stations');
    const pts = deflectionAtStations(ctx, 0);
    // 絞點處撓度連續、斜率不連續：左 v′ = −(wa³/6 + Hf a²/2)/EI，右 v′ = +(δh/b − wb³/24EI)
    const sl = oneSidedSlope(pts, a, 'left'), sr = oneSidedSlope(pts, a, 'right');
    const slExp = -(w * a ** 3 / 6 + Hf * a * a / 2) / EI, srExp = dh / b - w * b ** 3 / (24 * EI);
    assertNear(sl, slExp, Math.abs(slExp) * 1e-6, 'deflection: slope left of hinge', `expected ${slExp}`);
    assertNear(sr, srExp, Math.abs(srExp) * 1e-6, 'deflection: slope right of hinge (kink at hinge)', `expected ${srExp}`);
  }

  // 10) 兩跨、只載跨 1、跨 2 EI 加倍：三彎矩式 2M_B(L/I + L/2I) = −wL³/4I → M_B = −wL²/12
  //     跨 1：δ = 簡支均佈 − |M_B| x (L² − x²)/6EIL；跨 2：δ_up = |M_B| x′(L − x′)(2L − x′)/(6·2EI·L)
  //     B 點斜率兩側相同：v′_B = |M_B| L / (3·2EI) = wL³/72EI（v 向上為正）
  {
    const w = 10, L = 6, MB = w * L * L / 12;
    setupBeam(ctx, { supports: ['pin', 'roller', 'roller'], spans: [{ L }, { L, eiMul: 2 }], loads: [[{ type: 'udl', w }], []] });
    assertDeflectionClosedForm(ctx, 0, x => w * x * (L ** 3 - 2 * L * x * x + x ** 3) / (24 * EI) - MB * x * (L * L - x * x) / (6 * EI * L),
      'deflection: two spans, span 1 loaded, span 1 at all stations');
    assertDeflectionClosedForm(ctx, 1, x => -MB * x * (L - x) * (2 * L - x) / (6 * 2 * EI * L),
      'deflection: two spans, span 1 loaded, unloaded span 2 (EI×2) at all stations');
    const p0 = deflectionAtStations(ctx, 0), p1 = deflectionAtStations(ctx, 1);
    assertNear(p0[p0.length - 1].d, p1[0].d, 1e-15, 'deflection continuous across interior support', 'v_B both sides');
    const sl = oneSidedSlope(p0, L, 'left'), sr = oneSidedSlope(p1, 0, 'right');
    const sExp = w * L ** 3 / (72 * EI);
    assertNear(sl, sExp, sExp * 1e-6, 'deflection: slope at interior support from span 1', `expected wL^3/72EI = ${sExp}`);
    assertNear(sr, sExp, sExp * 1e-6, 'deflection: slope at interior support from span 2 (continuous)', `expected wL^3/72EI = ${sExp}`);
  }

  // 11) kgf-cm 單位：L = 600 cm、w = 0.1 kgf/cm、E = 2.04e6 kgf/cm²、I = 20000 cm⁴，簡支均佈
  {
    const w = 0.1, L = 600, Ek = 2040000, Ik = 20000, EIk = Ek * Ik;
    ctx.document.getElementById('unitSystem').value = 'kgf-cm';
    setupBeam(ctx, { supports: ['pin', 'roller'], spans: [{ L }], loads: [[{ type: 'udl', w }]], E: String(Ek), I: String(Ik) });
    assertDeflectionClosedForm(ctx, 0, x => w * x * (L ** 3 - 2 * L * x * x + x ** 3) / (24 * EIk), 'deflection: kgf-cm simply supported UDL at all stations');
    assertNear(-Math.min(...ctx.diagrams.spans[0].ds), 5 * w * L ** 4 / (384 * EIk), 1e-12, 'deflection: kgf-cm max = 5wL^4/384EI', '≈ 0.004136 cm');
    ctx.document.getElementById('unitSystem').value = 'kN-m';
  }
}

// ===== 反力／剪力／彎矩凍結快照（取自修正前原始檔，證明撓度修正不改變內力路徑） =====
function internalForceSnapshotCases() {
  return [
    { supports: ['pin', 'roller'], spans: [{ L: 6 }], loads: [[{ type: 'udl', w: 10 }]] },
    { supports: ['pin', 'roller'], spans: [{ L: 6 }], loads: [[{ type: 'point', P: 50, a: 3 }]] },
    { supports: ['pin', 'roller', 'roller'], spans: [{ L: 6 }, { L: 6 }], loads: [[{ type: 'udl', w: 10 }], [{ type: 'udl', w: 10 }]] },
    { supports: ['fixed', 'fixed'], spans: [{ L: 6 }], loads: [[{ type: 'udl', w: 10 }, { type: 'point', P: 50, a: 2 }]] },
    { supports: ['fixed', 'free'], spans: [{ L: 6 }], loads: [[{ type: 'udl', w: 10 }, { type: 'point', P: 50, a: 6 }]] },
    { supports: ['fixed', 'roller'], spans: [{ L: 6, hinges: [3] }], loads: [[{ type: 'udl', w: 10 }]] },
    { supports: ['pin', 'roller', 'roller', 'fixed'], spans: [{ L: 5.5 }, { L: 7.25, eiMul: 0.85 }, { L: 4, eiMul: 1.7 }],
      loads: [[{ type: 'trapezoid', w1: 5, w2: 14 }, { type: 'moment', M: 9.5, a: 4.1 }], [{ type: 'point', P: 37, a: 2.2 }, { type: 'udl', w: 6 }], [{ type: 'trapezoid', w1: 12, w2: 3 }]] },
    { supports: ['fixed', 'roller', 'free'], spans: [{ L: 8, hinges: [5.5] }, { L: 2.5 }],
      loads: [[{ type: 'trapezoid', w1: 2, w2: 9 }, { type: 'point', P: 20, a: 6.5 }, { type: 'moment', M: -15, a: 1.5 }], [{ type: 'point', P: 12, a: 2.5 }]] },
  ];
}

function internalForceSnapshot(ctx) {
  return internalForceSnapshotCases().map(spec => {
    setupBeam(ctx, spec);
    return {
      reactions: (ctx.solution?.reactions || []).map(r => [r?.Ry ?? null, r?.Mr ?? null]),
      spans: (ctx.diagrams?.spans || []).map(sp => ({ xs: sp.xs, vs: sp.vs, ms: sp.ms })),
    };
  });
}

// 以 /workspace/連續梁分析_改前備份_2026-10-29.html（origin/master a2c4e97e 之原始檔）產生；
// JSON.stringify 對 double 採最短可逆表示，雜湊相同即逐位元相同。
const ORIGINAL_INTERNAL_FORCE_SNAPSHOT_SHA256 = '47d866483789376c7ea504c435e2b7597806c798bd6e64036147a4d5d2978f1e';
const ORIGINAL_INTERNAL_FORCE_CASE_SHA256 = [
  '2efeedef1228fe5ba9a458ba691f7b3f543a3dd8f0b72e19264b2abe1707bbbb',
  '61e6905b112a3bb4f4c4a29417222028e6c371efabb272bd4ebf4df23d179ebf',
  'b503e47751be87e85cc7a78a0d4054f2d2b7a06b2166e16da53625f28c0bd18c',
  'df3ba84a6d88f291f84cadc44fe87a8ae876939e2cc6f3f0be9727a188f0b0dc',
  '9f161135bbad92b8f8cc0a5d775f92b87707e0b42bbb3c8f8a1e7595e20c4a40',
  'c5af30eb43e56ab4472e5d6cdf32530af47061cf700ea8c25f0852289ba0f492',
  '879a2ce0030d22669ea1612d2466b02133467b5439794bd19163b806d6b12853',
  '1f116cb61a4e700e62699ea10ac0f5303f07bf22a250a8f76d8e8c33fbabb00c',
];

function runInternalForceSnapshotCheck(ctx) {
  const snapshot = internalForceSnapshot(ctx);
  if (process.env.CONTINUOUS_BEAM_PRINT_FORCE_SNAPSHOT === '1') {
    console.log('FORCE_SNAPSHOT_ALL=' + stableSha256(snapshot));
    console.log('FORCE_SNAPSHOT_CASES=' + JSON.stringify(snapshot.map(stableSha256)));
  }
  snapshot.forEach((item, i) => {
    assert(stableSha256(item) === ORIGINAL_INTERNAL_FORCE_CASE_SHA256[i], `internal-force snapshot case ${i + 1} bitwise identical to original`, stableSha256(item));
  });
  assert(stableSha256(snapshot) === ORIGINAL_INTERNAL_FORCE_SNAPSHOT_SHA256, 'reactions / shear / moment arrays bitwise identical to original file', stableSha256(snapshot));
}

main();
