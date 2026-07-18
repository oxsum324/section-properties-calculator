const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '連續梁分析.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const directPrintBoundaryPath = path.join(__dirname, '結構工具箱', 'core', 'direct-print-boundary.css');
const directPrintBoundarySource = fs.readFileSync(directPrintBoundaryPath, 'utf8');
const sharedReportPath = path.join(__dirname, '結構工具箱', 'core', 'ui', 'report.js');
const sharedReportSource = fs.readFileSync(sharedReportPath, 'utf8');
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
assert(/<body class="formal-tool-output-page">[\s\S]*class="formal-direct-print-boundary"/.test(html), 'continuous beam exposes work-page direct-print boundary', 'formal output page boundary');
['分析工具主頁列印已封鎖', '此頁是操作介面，不是計算書', '本頁不得作為附件'].forEach(needle => {
  assert(html.includes(needle), 'continuous beam explains blocked direct print', needle);
});
assert(directPrintBoundarySource.includes('body.formal-tool-output-page > :not(.formal-direct-print-boundary)'), 'shared CSS hides continuous beam work page during direct print', 'formal work-page children hidden');
assert(directPrintBoundarySource.includes('body.formal-tool-output-page > .formal-direct-print-boundary'), 'shared CSS renders continuous beam direct-print notice', 'boundary notice rendered');
assert(html.includes('window.ToolReportUI?.normalizeProjectFieldValue'), 'shared project meta normalization hook exists', 'continuous beam uses shared placeholder cleanup when available');
assert(html.includes("['設計人員', 'projDesigner']"), 'designer participates in readiness completeness', 'continuous beam attachment readiness requires designer metadata');
assert(html.includes("name:     getProjectFieldValue('projName')"), 'report export uses normalized project name', 'continuous beam report payload');
assert(html.includes("designer: getProjectFieldValue('projDesigner')"), 'report export uses normalized designer', 'continuous beam report payload');
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
  const context = {
    window: {
      open() {
        return {
          document: {
            open() {},
            write(nextHtml) { reportHtml += String(nextHtml || ''); },
            close() {},
          },
        };
      },
    },
    console,
    Date,
  };
  vm.createContext(context);
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
  vm.runInContext(mainScript, context, { filename: '連續梁分析.html#main' });
  vm.runInContext(extractFunctionBlock(moduleScript, 'collectSaveData'), context, { filename: '連續梁分析.html#collectSaveData' });
  vm.runInContext(extractFunctionBlock(moduleScript, 'restoreFromData'), context, { filename: '連續梁分析.html#restoreFromData' });

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
  assert(ctx.document.getElementById('reportReadiness').innerHTML.includes('缺 計畫名稱、設計人員'), 'placeholder project text still counts as missing metadata', ctx.document.getElementById('reportReadiness').innerHTML);
  const placeholderSave = ctx.collectSaveData();
  assert(placeholderSave.projName === '', 'placeholder project name is normalized before local save', JSON.stringify(placeholderSave));
  assert(placeholderSave.projDesigner === '', 'placeholder designer is normalized before local save', JSON.stringify(placeholderSave));
  ctx.exportPDF();
  assert(ctx.__lastReportConfig.project.name === '', 'placeholder project name is scrubbed before report export', JSON.stringify(ctx.__lastReportConfig.project));
  assert(ctx.__lastReportConfig.project.no === 'CB-001', 'project number remains in report export', JSON.stringify(ctx.__lastReportConfig.project));
  assert(ctx.__lastReportConfig.project.designer === '', 'placeholder designer is scrubbed before report export', JSON.stringify(ctx.__lastReportConfig.project));
  const reportHtml = renderSharedReportPayload(ctx.__lastReportConfig);
  const reportText = assertReportHtmlText(reportHtml, 'continuous beam runtime report', [
    '連續梁分析計算書',
    '計畫名稱',
    '計畫編號',
    'CB-001',
    '支承反力',
    '梁示意圖',
    '剪力圖',
    '彎矩圖',
  ]);
  assert(reportHtml.includes('連續梁分析計算書'), 'continuous beam runtime report title', '連續梁分析計算書');
  assert(reportHtml.includes('計畫名稱</b>—'), 'continuous beam runtime report placeholder project fallback', '計畫名稱 —');
  assert(reportHtml.includes('CB-001'), 'continuous beam runtime report project number', 'CB-001');
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

  resetToSingleSpan(ctx);
  ctx.model.loads[0] = [{ type: 'udl', w: 10 }];
  ctx.renderLoadInputs();
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

  console.log('\nAll continuous beam regression checks passed.');
}

main();
