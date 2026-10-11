'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const originals = require('./fixtures/rc-page-ui-originals.json');
const source = require('./src/rc-page-ui.source.js');
const generated = require('./rc-page-ui.js');
const selected = new Set('num setResult setCheck markAllResultsPending applyPanel syncDesignFields updateBanner attachFormulaTips syncDetailHelp syncAdvancedCaseTools svgToDataURL'.split(' '));

class Node {
  constructor(id = '', classes = []) {
    this.id = id; this.classes = new Set(classes); this.dataset = {}; this.style = {};
    this.value = '1'; this.checked = false; this.textContent = ''; this.innerHTML = '';
    this.readOnly = false; this.disabled = false; this.title = ''; this.children = []; this.attributes = {};
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      contains: name => this.classes.has(name),
      toggle: (name, force) => { const active = force === undefined ? !this.classes.has(name) : !!force; active ? this.classes.add(name) : this.classes.delete(name); return active; }
    };
  }
  querySelector(selector) {
    if (selector === '.value') return this.valueNode || null;
    if (selector === '.unit') return this.unitNode || null;
    const tab = selector.match(/^button\[data-tab="([^"]+)"\]$/);
    return tab ? this.children.find(node => node.dataset.tab === tab[1]) || null : null;
  }
  closest() { return this.parent || null; }
  appendChild(node) { this.children = this.children.filter(item => item !== node); this.children.push(node); return node; }
  getAttribute(name) { return this.attributes[name] || null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  cloneNode() { const node = new Node(this.id); node.attributes = { ...this.attributes }; node.innerHTML = this.innerHTML; return node; }
  snapshot() { return { id: this.id, classes: [...this.classes].sort(), dataset: this.dataset, style: this.style, value: this.value, checked: this.checked, readOnly: this.readOnly, disabled: this.disabled, title: this.title, text: this.textContent, html: this.innerHTML, attributes: this.attributes, children: this.children.map(node => node.id), valueText: this.valueNode?.textContent, unitText: this.unitNode?.textContent, className: this.className }; }
}

function fixture(variant, tab = 'summary') {
  const ids = new Map();
  const add = (id, classes = []) => { const node = new Node(id, classes); ids.set(id, node); return node; };
  const allIds = new Set(['testNumber', 'resultA', 'resultB', 'bannerStatus', 'bannerKey', 'conclusionScope', 'advancedCaseCard', 'showCaseTools', 'showDetailHelp', 'showSteps', 'enableTorsion', 'enableDefl', 'enableExactDefl', 'seismicMode', 'showAdvanced', 'colType', 'retainType', 'manualLayout', 'flexModeHint', 'barSpXBot', 'barSpYBot', 'barSpXTop', 'barSpYTop']);
  for (const info of Object.values(originals.pages)) for (const helper of info.helpers) {
    for (const match of helper.code.matchAll(/(?:\$\(|getElementById\()['"]([^'"]+)['"]|['"]([A-Za-z][A-Za-z0-9]+)['"]/g)) allIds.add(match[1] || match[2]);
  }
  for (const id of allIds) add(id);
  const tabs = 'geom loads flex shear torsion defl seismic summary rebar pm ties load methods detail iso combined mat pile retain'.split(' ').map(name => {
    const node = add('tab-' + name); node.dataset.tab = name; if (name === tab) node.classes.add('active'); return node;
  });
  const tabBar = add('tabBar'); tabBar.children = tabs;
  const panels = tabs.map(button => { const node = add('panel-' + button.dataset.tab); node.dataset.panel = button.dataset.tab; return node; });
  const cards = ['normal', 'advanced', 'stepsFlex', 'stepsSeismic', 'stepsTorsion', 'stepsDefl'].map(id => {
    const node = ids.get(id) || add(id); node.dataset.shows = 'summary geom rebar loads load flex pm iso';
    if (id.startsWith('steps')) node.classes.add('steps-card');
    if (id === 'advanced') node.classes.add('advanced-card'); return node;
  });
  const topics = ['flex', 'torsion', 'defl', 'shear'].map(topic => { const node = add('topic-' + topic); node.dataset.topic = topic; return node; });
  const seismicCard = add('seismicCard', ['card']), badge = add('seismicBadge', ['badge-seismic']); badge.parent = seismicCard;
  const stack = ['botBar1N', 'topBar1N'].map(id => add(id));
  for (const id of ['resultA', 'resultB']) {
    const node = ids.get(id); node.classes = new Set(['result-item', 'rc-pending', 'fail']);
    node.valueNode = new Node(); node.valueNode.textContent = '舊值';
    node.unitNode = new Node(); node.unitNode.textContent = '舊單位';
  }
  const document = {
    body: add('body'), getElementById: id => ids.get(id) || null,
    querySelector(selector) { return selector === '.section-tabs' ? tabBar : selector === '.section-tabs button.active' ? tabs.find(node => node.classes.has('active')) || null : null; },
    querySelectorAll(selector) {
      if (selector === '.section-tabs button') return tabs;
      if (selector === '.subpanel') return panels;
      if (selector === '[data-shows]') return cards;
      if (selector === '.steps-card') return cards.filter(node => node.classes.has('steps-card'));
      if (selector === '.badge-seismic') return [badge];
      if (selector === '.result-item') return [...ids.values()].filter(node => node.classes.has('result-item'));
      if (selector.includes('RebarStack')) return stack;
      if (selector === '[data-topic]') return topics;
      const match = selector.match(/^\[data-topic="([^"]+)"\]$/);
      return match ? topics.filter(node => node.dataset.topic === match[1]) : [];
    }
  };
  const calls = [], tips = [];
  const window = { FormulaInfo: { attach: value => tips.push(value) }, lastColumnAttachmentReadiness: { resolvedReviewItems: variant === 2 ? ['柱端錨定'] : [] } };
  for (const id of ['showSteps', 'enableTorsion', 'enableDefl', 'enableExactDefl', 'seismicMode', 'showAdvanced', 'showCaseTools', 'showDetailHelp', 'manualLayout']) ids.get(id).checked = variant !== 1;
  ids.get('colType').value = variant === 1 ? 'circle' : 'rect'; ids.get('retainType').value = variant === 2 ? 'counterfort' : 'gravity';
  class XMLSerializer { serializeToString(node) { return '<svg' + Object.entries(node.attributes).map(([key, value]) => ` ${key}="${value}"`).join('') + '>' + node.innerHTML + '</svg>'; } }
  const context = { document, window, FormulaInfo: window.FormulaInfo, XMLSerializer, currentMode: variant === 1 ? 'check' : 'design', currentTab: 'geom', TOPIC_VISIBLE: { summary: 'all', geom: new Set(['flex']), flex: new Set(['flex']) }, SPACING_IDS: ['barSpXBot', 'barSpYBot', 'barSpXTop', 'barSpYTop'] };
  context.$ = id => document.getElementById(id);
  for (const name of ['calcBeam', 'calcColumn', 'calcWall', 'calcFdtn', 'calcShearWall']) context[name] = () => calls.push(name);
  context.collectBeamManualReviewItems = context.collectColumnManualReviewItems = () => variant === 2 ? ['柱端錨定'] : [];
  context.collectWallSummaryChecks = () => [['fixture', variant === 0 ? true : variant === 1 ? false : null]];
  context.summarizeWallResult = () => ({ ok: variant === 0 ? true : variant === 1 ? false : null, text: '牆摘要', reviewWarnings: variant === 2 ? ['人工複核'] : [] });
  return { document, ids, context, calls, tips, XMLSerializer, snapshot: () => ({ nodes: [...ids.values()].map(node => node.snapshot()), calls, tips, currentTab: context.currentTab }) };
}

function oldHelper(page, name, fixture) {
  const code = originals.pages[page].helpers.find(helper => helper.name === name).code;
  const context = vm.createContext(fixture.context);
  return vm.runInContext(code + `\n;${name};`, context);
}

function newHelpers(api, page, fixture) {
  const ctx = fixture.context;
  return api.createPage({ page, document: fixture.document, window: ctx.window, XMLSerializer: fixture.XMLSerializer,
    getMode: () => ctx.currentMode, getTopicVisible: () => ctx.TOPIC_VISIBLE, getSpacingIds: () => ctx.SPACING_IDS,
    setCurrentTab: tab => { ctx.currentTab = tab; },
    calculate: ctx[{ beam: 'calcBeam', column: 'calcColumn', wall: 'calcWall', foundation: 'calcFdtn', 'shear-wall': 'calcShearWall' }[page]],
    collectManualReviewItems: ctx.collectBeamManualReviewItems,
    collectSummaryChecks: ctx.collectWallSummaryChecks, summarizeResult: ctx.summarizeWallResult
  });
}

function resultFixture(page, variant) {
  const code = originals.pages[page].helpers.find(helper => helper.name === 'updateBanner').code;
  const result = Object.fromEntries([...code.matchAll(/\br\.([\w]+)/g)].map(match => [match[1], 1]));
  for (const key of Object.keys(result)) if (/^ok|Ok$|^enable|^needSkin$|^seismic$|^methodApplicable$|^isPier$|^torsion|^loadCasesActive$|^designSuggestionReady$/.test(key)) result[key] = variant === 0 ? true : variant === 1 ? false : null;
  Object.assign(result, { developmentData: { okExplicit: variant !== 1, developmentManualReview: variant === 2, okLapZone: variant !== 1, ldReq: 1, lapReq: 2, leftTypeLabel: '左錨定', rightTypeLabel: '右錨定' }, scwb: { active: true, ok: variant !== 1 }, reviewWarnings: variant === 2 ? ['圖說待確認'] : [], loadCaseParseErrors: [], loadCaseControls: { overall: { name: '控制工況' } }, shearDemandSource: '固定測試', torsionDetailOk: variant === 2 ? null : variant !== 1 });
  return result;
}

const counts = {};
function equivalence(page, name, variant, args, prepare = () => {}, tab = 'summary') {
  const legacy = fixture(variant, tab); prepare(legacy);
  const prior = oldHelper(page, name, legacy);
  function invoke(fn, f) {
    try { return { value: fn(...(typeof args === 'function' ? args(f) : args)) }; }
    catch (error) { return { error: error.name }; }
  }
  const expectedReturn = invoke(prior, legacy), expectedDOM = legacy.snapshot();
  for (const api of [source, generated]) {
    const current = fixture(variant, tab); prepare(current);
    const method = newHelpers(api, page, current)[name];
    assert.equal(typeof method, 'function', `${page}.${name} exists`);
    const actualReturn = invoke(method, current);
    const normalize = value => JSON.parse(JSON.stringify(value));
    assert.deepEqual(actualReturn, expectedReturn, `${page}.${name}: return/error, fixture ${variant}/${tab}`);
    assert.deepEqual(normalize(current.snapshot()), normalize(expectedDOM), `${page}.${name}: DOM/callback/data, fixture ${variant}/${tab}`);
  }
  counts[`${page}.${name}`] = (counts[`${page}.${name}`] || 0) + 1;
}

for (const [page, info] of Object.entries(originals.pages)) for (const helper of info.helpers.filter(helper => selected.has(helper.name))) {
  const name = helper.name;
  for (let variant = 0; variant < 3; variant++) {
    if (name === 'num') {
      for (const value of ['0', '12.5', 'invalid', '-2', 'Infinity']) equivalence(page, name, variant, ['testNumber'], f => { f.ids.get('testNumber').value = value; });
      equivalence(page, name, variant, ['missingNumber']);
    } else if (name === 'setResult') {
      for (const value of [1.2345, null, NaN, Infinity, '文字', '2']) equivalence(page, name, variant, ['resultA', value, 'cm', 2, 'ok']);
      equivalence(page, name, variant, ['missingResult', 1, undefined]);
      equivalence(page, name, variant, ['resultA', 1, undefined], f => { f.ids.get('resultA').valueNode = null; });
    } else if (name === 'setCheck') {
      for (const pass of [true, false, null, 1]) equivalence(page, name, variant, ['resultA', pass, '']);
      equivalence(page, name, variant, ['resultA', null, '人工複核']);
      equivalence(page, name, variant, ['missingResult', true]);
      equivalence(page, name, variant, ['resultA', true], f => { f.ids.get('resultA').valueNode = null; });
    } else if (name === 'svgToDataURL') {
      equivalence(page, name, variant, [null]);
      equivalence(page, name, variant, f => { const svg = new Node('svg'); svg.innerHTML = '<text>中文&amp;圖</text>'; if (variant) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); return [svg]; });
    } else if (name === 'attachFormulaTips') {
      equivalence(page, name, variant, [], f => { if (variant === 1) f.context.window.FormulaInfo = null; });
    } else if (name === 'applyPanel') {
      for (const tab of ['geom', 'loads', 'rebar', 'summary', 'iso', 'unrecognized']) equivalence(page, name, variant, [tab]);
    } else if (name === 'updateBanner') {
      const tabs = { beam: 'geom loads flex shear torsion defl seismic summary', column: 'geom loads pm shear ties seismic summary', wall: 'geom load rebar methods summary', 'shear-wall': 'geom load pm rebar shear detail summary' }[page].split(' ');
      for (const tab of tabs) equivalence(page, name, variant, [resultFixture(page, variant)], () => {}, tab);
    } else {
      equivalence(page, name, variant, [], f => { if (variant === 2) { f.ids.delete('advancedCaseCard'); f.ids.delete('showDetailHelp'); f.ids.delete('flexModeHint'); } });
    }
  }
}
assert.ok(Object.values(counts).every(count => count >= 3), 'every extracted page/helper has at least three fixtures');

// Same-name report collectors have different contracts and stay in the pages.
for (const [text, gate, full] of [['有效內容', false, true], ['未啟用扭力', true, true], ['完整內容', true, false]]) {
  const outputs = {};
  for (const page of ['beam', 'column', 'wall', 'foundation']) {
    const f = fixture(0); f.ids.get('testNumber').textContent = text;
    Object.assign(f.context, { stepsArr: [], reportFullSteps: full, summarizeStepText: value => '摘要：' + value });
    const returned = oldHelper(page, 'grab', f)('testNumber', '群組', gate);
    outputs[page] = { returned, steps: JSON.parse(JSON.stringify(f.context.stepsArr)) };
  }
  assert.notDeepEqual(outputs.beam, outputs.foundation, 'grab return contract remains page-specific');
  assert.notDeepEqual(outputs.beam, outputs.wall, 'grab gate/text/summary policy remains page-specific');
}
for (const value of ['12', '', undefined]) {
  const f = fixture(0);
  f.context.tuple = { values: { amount: value } };
  const tupleValue = oldHelper('beam', 'value', f)('amount');
  const dom = fixture(0); dom.context.tr = { querySelector: () => value === undefined ? null : { value } };
  const domValue = oldHelper('shear-wall', 'value', dom)('amount');
  assert.notEqual(typeof tupleValue, typeof domValue, 'value numeric tuple and DOM string contracts stay distinct');
}

// Guard the all-results pending rule independently of equivalence snapshots.
const pending = fixture(0);
const api = newHelpers(generated, 'beam', pending);
api.markAllResultsPending(); api.setResult('resultA', 1, 'cm');
assert.equal(pending.ids.get('resultA').classList.contains('rc-pending'), false);
assert.equal(pending.ids.get('resultB').classList.contains('rc-pending'), true);
for (const page of Object.keys(originals.pages)) {
  const html = fs.readFileSync(path.join(__dirname, '../tools', page + '.html'), 'utf8');
  assert.ok(html.includes('../shared/rc-page-ui.js'), `${page}: shared runtime connected`);
  assert.ok(html.indexOf('../shared/rc-page-ui.js') < html.indexOf('tool-page-a11y.js'), `${page}: a11y comes after shared UI`);
  for (const helper of originals.pages[page].helpers.filter(helper => !selected.has(helper.name))) {
    assert.ok(html.replace(/\r\n/g, '\n').includes(helper.code.replace(/\r\n/g, '\n')), `${page}.${helper.name}: unextracted collector stays unchanged`);
  }
}
console.log(JSON.stringify({ passed: true, helpers: selected.size, pageHelpers: Object.keys(counts).length, equivalenceCases: Object.values(counts).reduce((a, b) => a + b, 0), counts }));
