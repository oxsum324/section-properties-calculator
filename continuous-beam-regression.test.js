const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '連續梁分析.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
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
];
const exportPdfSource = extractFunctionBlock(html, 'exportPDF');
for (const needle of pageOnlyNeedles) {
  assert(!exportPdfSource.includes(needle), 'exportPDF excludes page-only readiness wording', needle);
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
    openReport() {},
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
  assertNear(ctx.solution.reactions[0].Ry, 30, 1e-9, 'simple span UDL left reaction', 'Ry0 = wL/2');
  assertNear(ctx.solution.reactions[1].Ry, 30, 1e-9, 'simple span UDL right reaction', 'Ry1 = wL/2');
  assertNear(Math.max(...ctx.diagrams.spans[0].ms), 45, 1e-9, 'simple span UDL max moment', 'Mmax = wL^2/8');

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
