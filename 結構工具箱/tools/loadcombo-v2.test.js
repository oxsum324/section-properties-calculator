const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const LoadCombo = require('../core/loads/loadcombo.js');

function findTuple(result, name) {
  const tuple = LoadCombo.getTupleByName(result, name);
  assert.ok(tuple, `missing tuple: ${name}`);
  return tuple;
}

function testTuplePreservationAndGoverningSelection() {
  const source = {
    model: 'independent-test-model',
    importBatch: 'batch-001',
    units: { force: 'tf', moment: 'tf-m' },
  };
  const result = LoadCombo.computeTuples({
    method: 'LRFD',
    source,
    forces: {
      P: { D: 10, L: 100, W: 0, E: 0 },
      M: { D: 0, L: 0, W: 100, E: 0 },
    },
  });

  const pControl = result.tuples.reduce((best, tuple) => (
    Math.abs(tuple.values.P) > Math.abs(best.values.P) ? tuple : best
  ));
  const mControl = result.tuples.reduce((best, tuple) => (
    Math.abs(tuple.values.M) > Math.abs(best.values.M) ? tuple : best
  ));

  assert.equal(pControl.name, '1.2D+1.6L');
  assert.equal(pControl.values.P, 172);
  assert.equal(pControl.values.M, 0);
  assert.equal(mControl.name, '1.2D+1.0L+1.0W');
  assert.equal(mControl.values.P, 112);
  assert.equal(mControl.values.M, 100);
  assert.equal(
    result.tuples.some(tuple => tuple.values.P === 172 && tuple.values.M === 100),
    false,
    'component envelopes must not be synthesized into a non-existent force tuple'
  );

  const selected = LoadCombo.selectGoverningTuple(result, tuple => ({
    score: Math.abs(tuple.values.P) / 200 + Math.abs(tuple.values.M) / 100,
    limitState: 'P-M interaction',
  }));
  assert.equal(selected.governing.name, '1.2D+1.0L+1.0W');
  assert.deepEqual(selected.governing.values, { P: 112, M: 100 });
  assert.equal(selected.details.limitState, 'P-M interaction');
  assert.equal(selected.method, 'LRFD');
  assert.deepEqual(selected.source, source);
  assert.notStrictEqual(selected.source, source);
}

function testSignsAndSourceInputsArePreserved() {
  const result = LoadCombo.computeTuples({
    method: 'ASD',
    source: { analysisCase: 'W-X', coordinateSystem: 'global' },
    forces: {
      P: { D: 0, L: 0, W: 10, E: 0 },
      My: { D: 0, L: 0, W: -5, E: 0 },
    },
  });
  const positiveWind = findTuple(result, 'D+0.75L+0.75W');
  const negativeWind = findTuple(result, 'D+0.75L-0.75W');

  assert.deepEqual(positiveWind.values, { P: 7.5, My: -3.75 });
  assert.deepEqual(negativeWind.values, { P: -7.5, My: 3.75 });
  assert.deepEqual(positiveWind.factors, { D: 1, L: 0.75, W: 0.75, E: 0 });
  assert.equal(positiveWind.method, 'ASD');
  assert.deepEqual(result.inputForces.My, { D: 0, L: 0, W: -5, E: 0 });
  assert.deepEqual(result.source, { analysisCase: 'W-X', coordinateSystem: 'global' });
}

function testDetailLookupAndLegacyExports() {
  const detail = {
    method: 'LRFD',
    combos: [
      { name: '1.2D+1.0L-1.0E', values: { P: -25, Mx: 40 } },
    ],
  };
  const tuple = LoadCombo.getTupleByName(detail, '1.2D+1.0L-1.0E');
  assert.deepEqual(tuple.values, { P: -25, Mx: 40 });
  assert.deepEqual(tuple.factors, { D: 1.2, L: 1, W: 0, E: -1 });
  assert.equal(tuple.method, 'LRFD');
  assert.equal(LoadCombo.getTupleByName(detail, 'missing'), null);
  assert.equal(LoadCombo.getComboSet('ASD').method, 'ASD');

  assert.equal(LoadCombo.TUPLE_SCHEMA_VERSION, 'loadcombo-tuples-v2');
  ['compute', 'computeDetailed', 'selectGoverningLimitStates', 'apply', 'clear', 'bind', 'toReportGroup'].forEach(name => {
    assert.equal(typeof LoadCombo[name], 'function', `legacy API missing: ${name}`);
  });
  assert.equal(LoadCombo.COMBOS.LRFD.length, 10);
  assert.equal(LoadCombo.COMBOS.ASD.length, 10);
}

testTuplePreservationAndGoverningSelection();
testSignsAndSourceInputsArePreserved();
testDetailLookupAndLegacyExports();
testLimitStateRecommendationsPreserveTuples();
testLimitStateTiesNoDemandAndInvalidDefinitions();
testColumnConsumersDoNotSynthesizeTuples();
testTupleSelectionUiAndTargetInvalidation();
testForceReceiveKeepsLastAppliedPayload();
testConsumerReportContracts();

console.log('loadcombo-v2.test.js: PASS (9/9)');

function testLimitStateRecommendationsPreserveTuples() {
  const tuples = LoadCombo.computeTuples({
    method: 'LRFD',
    source: { model:'limit-state-test' },
    forces: {
      P: { D:20, L:30, W:0, E:0 },
      M: { D:0, L:0, W:12, E:-9 },
      V: { D:4, L:5, W:-8, E:6 },
    },
  });
  const result = LoadCombo.selectGoverningLimitStates(tuples, [
    { key:'m-positive', label:'正彎矩', criterion:'positive', forceKey:'M' },
    { key:'m-negative', label:'負彎矩', criterion:'negative', forceKey:'M' },
    { key:'shear', label:'剪力', criterion:'abs', forceKey:'V' },
    {
      key:'p-m-vector',
      label:'P-M 需求向量候選',
      criterion:'normalized-srss',
      terms:[{ forceKey:'P' }, { forceKey:'M' }],
    },
  ]);
  assert.equal(result.schemaVersion, 'loadcombo-limit-states-v1');
  assert.equal(result.pass, true);
  assert.equal(result.states.length, 4);
  result.states.forEach(state => {
    assert.equal(state.status, 'recommended');
    assert.ok(state.governing, state.key + ' has complete tuple');
    assert.deepEqual(
      state.governing.values,
      findTuple(tuples, state.governing.name).values,
      state.key + ' recommendation is one real tuple'
    );
  });
  assert.ok(result.states[0].governing.values.M > 0, 'positive flexure chooses positive signed M');
  assert.ok(result.states[1].governing.values.M < 0, 'negative flexure chooses negative signed M');
  assert.ok(result.states[2].score > 0, 'absolute shear has a positive demand score');
  assert.equal(result.states[3].criterionLabel.includes('正規化'), true);
  assert.equal(result.states[3].activeTerms.length, 2);
}

function testLimitStateTiesNoDemandAndInvalidDefinitions() {
  const tied = LoadCombo.computeTuples({
    method: 'LRFD',
    forces: { M:{ D:0, L:0, W:10, E:0 } },
  });
  const result = LoadCombo.selectGoverningLimitStates(tied, [
    { key:'positive', label:'正彎矩', criterion:'positive', forceKey:'M' },
    { key:'zero', label:'零需求', criterion:'abs', forceKey:'V' },
    { key:'invalid', label:'錯誤準則', criterion:'capacity-magic', forceKey:'M' },
  ]);
  const positive = result.states[0];
  assert.equal(positive.governing.name, '1.2D+1.0L+1.0W', 'ties keep deterministic combo order');
  assert.deepEqual(positive.ties, ['1.2D+1.0L+1.0W', '0.9D+1.0W']);
  assert.equal(result.states[1].status, 'no-demand');
  assert.equal(result.states[1].governing, null);
  assert.equal(result.states[2].status, 'invalid');
  assert.ok(result.states[2].reason.includes('unsupported'));
  assert.equal(result.pass, false, 'invalid limit-state definitions fail closed');
}
function testColumnConsumersDoNotSynthesizeTuples() {
  const rcColumn = LoadCombo.computeTuples({
    method: 'LRFD',
    source: { consumer: 'RC column' },
    forces: {
      P: { D: 10, L: 100, W: 0, E: 0 },
      Mx: { D: 0, L: 0, W: 100, E: 0 },
      My: { D: 0, L: 0, W: 0, E: -80 },
    },
  });
  const rcControls = ['P', 'Mx', 'My'].map(key => rcColumn.tuples.reduce((best, tuple) => (
    Math.abs(tuple.values[key]) > Math.abs(best.values[key]) ? tuple : best
  )));
  assert.deepEqual(rcControls.map(tuple => tuple.name), [
    '1.2D+1.6L',
    '1.2D+1.0L+1.0W',
    '1.2D+1.0L+1.0E',
  ]);
  assert.equal(
    rcColumn.tuples.some(tuple => (
      tuple.values.P === rcControls[0].values.P
      && tuple.values.Mx === rcControls[1].values.Mx
      && tuple.values.My === rcControls[2].values.My
    )),
    false,
    'RC column must not synthesize P/Mx/My from different combinations'
  );
  assert.deepEqual(findTuple(rcColumn, '1.2D+1.0L+1.0W').values, { P: 112, Mx: 100, My: 0 });

  const steelColumn = LoadCombo.computeTuples({
    method: 'ASD',
    source: { consumer: 'steel column' },
    forces: {
      P: { D: 10, L: 100, W: 0, E: 0 },
      Mx: { D: 0, L: 0, W: -100, E: 0 },
      My: { D: 0, L: 0, W: 0, E: 80 },
    },
  });
  const steelControls = ['P', 'Mx', 'My'].map(key => steelColumn.tuples.reduce((best, tuple) => (
    Math.abs(tuple.values[key]) > Math.abs(best.values[key]) ? tuple : best
  )));
  assert.deepEqual(steelControls.map(tuple => tuple.name), [
    'D+L',
    'D+0.75L+0.75W',
    'D+0.75L+0.75E',
  ]);
  assert.equal(
    steelColumn.tuples.some(tuple => (
      tuple.values.P === steelControls[0].values.P
      && tuple.values.Mx === steelControls[1].values.Mx
      && tuple.values.My === steelControls[2].values.My
    )),
    false,
    'steel column must not synthesize P/Mx/My from different combinations'
  );
  assert.deepEqual(findTuple(steelColumn, 'D+0.75L+0.75W').values, { P: 85, Mx: -75, My: 0 });
}

function makeFakeElement(initial = {}) {
  const listeners = {};
  const attributes = {};
  return Object.assign({
    value: '0',
    textContent: '',
    dataset: {},
    style: {},
    checked: false,
    disabled: false,
    addEventListener(type, listener) {
      (listeners[type] || (listeners[type] = [])).push(listener);
    },
    dispatchEvent(event) {
      (listeners[event.type] || []).forEach(listener => listener.call(this, event));
      return true;
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete attributes[name];
    },
  }, initial);
}

function testTupleSelectionUiAndTargetInvalidation() {
  const previous = {
    window: global.window,
    document: global.document,
    Event: global.Event,
  };
  const elements = {};
  const cfg = {
    prefix: 'lcTest',
    tupleMode: 'select',
    method: 'LRFD',
    forces: [
      { key:'M', label:'彎矩 M', unit:'tf·m' },
      { key:'V', label:'剪力 V', unit:'tf' },
      { key:'P', label:'軸力 P', unit:'tf' },
      { key:'T', label:'扭矩 T', unit:'tf·m' },
    ],
    limitStates: [
      { key:'negative-flexure', label:'負彎矩', criterionLabel:'自訂容量評分', scorer:tuple => ({ score:-tuple.values.M, scoreLabel:'容量待確認' }) },
      { key:'shear-torsion', label:'剪力—扭矩', criterion:'normalized-srss', terms:[{ forceKey:'V' }, { forceKey:'T' }] },
    ],
    targetIds: { M:['targetMuPos','targetMuNeg'], V:'targetV', P:'targetP', T:'targetT' },
    targetReportMeta: {
      targetMuPos:{ label:'正彎矩需求 Mu+', unit:'tf·m' },
      targetMuNeg:{ label:'負彎矩需求 |Mu−|', unit:'tf·m' },
      targetV:{ label:'剪力需求 |Vu|', unit:'tf' },
      targetP:{ label:'軸力需求 Pu（有號）', unit:'tf', signed:true },
      targetT:{ label:'扭矩需求 |Tu|', unit:'tf·m' },
    },
    targetAdapter: ({ forceKey, value, targets }) => {
      if (forceKey === 'M') return [
        { id:targets[0], value:value >= 0 ? Math.abs(value) : 0 },
        { id:targets[1], value:value < 0 ? Math.abs(value) : 0 },
      ];
      return [{ id:targets[0], value:forceKey === 'P' ? value : Math.abs(value) }];
    },
  };
  const sourceValues = {
    M: { D:0, L:0, W:-10, E:0 },
    V: { D:0, L:0, W:-4, E:0 },
    P: { D:5, L:0, W:0, E:0 },
    T: { D:0, L:0, W:-2, E:0 },
  };
  cfg.forces.forEach(force => {
    ['D', 'L', 'W', 'E'].forEach(loadCase => {
      elements['lcTest_' + force.key + '_' + loadCase] = makeFakeElement({
        value: String(sourceValues[force.key][loadCase]),
      });
    });
    elements['lcTest_' + force.key + '_out'] = makeFakeElement();
    elements['lcTest_' + force.key + '_gov'] = makeFakeElement();
  });
  elements.targetMuPos = makeFakeElement();
  elements.targetMuNeg = makeFakeElement();
  elements.targetV = makeFakeElement();
  elements.targetP = makeFakeElement();
  elements.targetT = makeFakeElement();
  elements.lcTest_btnApply = makeFakeElement({ disabled:true });
  elements.lcTest_btnClear = makeFakeElement();
  elements.lcTest_status = makeFakeElement();
  cfg.limitStates.forEach((state, index) => {
    elements['lcTest_limit_' + index + '_criterion'] = makeFakeElement();
    elements['lcTest_limit_' + index + '_combo'] = makeFakeElement();
    elements['lcTest_limit_' + index + '_score'] = makeFakeElement();
    elements['lcTest_limit_' + index + '_select'] = makeFakeElement({ disabled:true });
  });

  const radios = LoadCombo.COMBOS.LRFD.map((combo, index) => makeFakeElement({
    value: String(index),
    name: 'lcTest_tupleSelect',
  }));
  try {
    global.window = {};
    global.Event = class {
      constructor(type, options) {
        this.type = type;
        this.bubbles = !!options?.bubbles;
      }
    };
    global.document = {
      getElementById(id) {
        return elements[id] || null;
      },
      querySelector(selector) {
        if (selector === 'input[name="lcTest_tupleSelect"]:checked') {
          return radios.find(radio => radio.checked) || null;
        }
        return null;
      },
      querySelectorAll(selector) {
        return selector === 'input[name="lcTest_tupleSelect"]' ? radios : [];
      },
    };

    LoadCombo.bind(cfg);
    assert.equal(LoadCombo.apply(cfg), null, 'selection mode blocks apply without one complete row');
    assert.equal(elements.targetP.value, '0');
    assert.ok(elements.lcTest_limit_0_combo.textContent.includes('1.2D+1.0L+1.0W'));
    assert.ok(elements.lcTest_limit_0_combo.textContent.includes('平手'));
    assert.equal(elements.lcTest_limit_0_score.textContent, '容量待確認', 'custom score label is rendered instead of a sentinel number');
    assert.equal(global.window.lastLoadComboSuggestions.lcTest.states[0].details.scoreLabel, '容量待確認');
    assert.equal(elements.lcTest_limit_0_select.disabled, false);
    assert.equal(global.window.lastLoadComboSuggestions.lcTest.states[0].governing.values.M, -10);

    elements.lcTest_limit_0_select.dispatchEvent(new global.Event('click', { bubbles:true }));
    assert.equal(radios[2].checked, true, 'suggestion selects its deterministic complete tuple row');
    assert.ok(elements.lcTest_status.textContent.includes('請確認完整有號內力'));
    const selected = LoadCombo.apply(cfg);
    assert.equal(selected.name, '1.2D+1.0L+1.0W');
    assert.deepEqual(selected.values, { M:-10, V:-4, P:6, T:-2 });
    assert.equal(elements.targetMuPos.value, '0.000');
    assert.equal(elements.targetMuNeg.value, '10.000');
    assert.equal(elements.targetV.value, '4.000');
    assert.equal(elements.targetP.value, '6.000');
    assert.equal(elements.targetT.value, '2.000');
    assert.equal(global.window.lastLoadCombo.lcTest.tuplePreserved, true);
    assert.deepEqual(
      global.window.lastLoadCombo.lcTest.adoptedWrites.map(write => ({ targetId:write.targetId, value:write.value })),
      [
        { targetId:'targetMuPos', value:0 },
        { targetId:'targetMuNeg', value:10 },
        { targetId:'targetV', value:4 },
        { targetId:'targetP', value:6 },
        { targetId:'targetT', value:2 },
      ],
      'stored state records the adapter values actually written to target fields'
    );

    const group = LoadCombo.toReportGroup('lcTest', '採用載重組合');
    assert.ok(group);
    assert.equal(group.items.find(item => item.label === '設計方法').value, 'LRFD');
    assert.equal(group.items.find(item => item.label === '採用組合').value, selected.name);
    assert.equal(
      group.items.find(item => item.label === '來源完整有號內力').value,
      'M=-10.000 tf·m；V=-4.000 tf；P=+6.000 tf；T=-2.000 tf·m'
    );
    assert.equal(
      group.items.find(item => item.label === '採用需求欄位').value,
      '正彎矩需求 Mu+=0.000 tf·m；負彎矩需求 |Mu−|=10.000 tf·m；剪力需求 |Vu|=4.000 tf；軸力需求 Pu（有號）=+6.000 tf；扭矩需求 |Tu|=2.000 tf·m'
    );
    assert.equal(group.items.some(item => item.label === '彎矩 M' && item.value === '-10.000'), false);

    elements.targetMuNeg.value = '11';
    elements.targetMuNeg.dispatchEvent(new global.Event('input', { bubbles:true }));
    assert.equal(global.window.lastLoadCombo.lcTest.tuplePreserved, false);
    assert.equal(LoadCombo.toReportGroup('lcTest', '採用載重組合'), null);
    assert.ok(elements.lcTest_status.textContent.includes('原採用組合已失效'));
  } finally {
    if (previous.window === undefined) delete global.window;
    else global.window = previous.window;
    if (previous.document === undefined) delete global.document;
    else global.document = previous.document;
    if (previous.Event === undefined) delete global.Event;
    else global.Event = previous.Event;
  }
}

function testForceReceiveKeepsLastAppliedPayload() {
  const receiveSource = fs.readFileSync(
    path.resolve(__dirname, '../core/ui/forces-receive.js'),
    'utf8'
  );
  const payload = {
    meta: {
      source: 'analysis-model',
      caseName: 'governing interaction',
      factored: true,
      combination: {
        name: '1.2D+1.0L-1.0E',
        method: 'LRFD',
        tuplePreserved: true,
        validationStatus: 'verified',
        reasons: [],
        factors: { D:1.2, L:1, W:0, E:-1 },
        values: { P:-12, Mx:8 },
      },
      timestamp: '2026-07-23T00:00:00.000Z',
    },
    forces: { P:-12, Mx:8 },
    target: 'column-rect',
  };
  let stored = JSON.stringify(payload);
  let banner = null;
  const forceElements = ['P', 'Mx'].map(key => ({
    value: '',
    getAttribute(name) {
      return name === 'data-force' ? key : null;
    },
    dispatchEvent() {},
  }));
  const document = {
    currentScript: { dataset:{ forceImportMode:'auto' } },
    readyState: 'complete',
    querySelectorAll(selector) {
      return selector === '[data-force]' ? forceElements : [];
    },
    createElement() {
      return {
        style: {},
        children: [],
        textContent: '',
        addEventListener() {},
        append(...children) {
          this.children.push(...children);
        },
        remove() {},
      };
    },
    body: {
      firstChild: null,
      insertBefore(element) {
        banner = element;
      },
    },
    addEventListener() {},
    dispatchEvent() {},
  };
  const context = {
    window: {},
    document,
    location: { search:'?import=1' },
    URLSearchParams,
    localStorage: {
      getItem() {
        return stored;
      },
      removeItem() {
        stored = null;
      },
    },
    Event: class {
      constructor(type, options) {
        this.type = type;
        this.bubbles = !!options?.bubbles;
      }
    },
    CustomEvent: class {},
    Date,
    JSON,
    console,
  };
  vm.runInNewContext(receiveSource, context, { filename:'core/ui/forces-receive.js' });
  const lastApplied = context.window.ForcePickerReceive.getLastApplied();
  assert.equal(stored, null, 'auto mode may clear pending storage after applying');
  assert.equal(lastApplied.meta.combination.name, '1.2D+1.0L-1.0E');
  assert.equal(lastApplied.meta.combination.tuplePreserved, true);
  assert.equal(lastApplied.forces.P, -12);
  lastApplied.forces.P = 999;
  assert.equal(context.window.ForcePickerReceive.getLastApplied().forces.P, -12, 'getLastApplied returns a clone');
  assert.ok(banner.children[0].textContent.includes('LRFD 1.2D+1.0L-1.0E'));
  assert.ok(banner.children[0].textContent.includes('完整配對'));

  const legacyPayload = JSON.parse(JSON.stringify(payload));
  delete legacyPayload.meta.combination.validationStatus;
  delete legacyPayload.meta.combination.reasons;
  stored = JSON.stringify(legacyPayload);
  banner = null;
  const legacyContext = { ...context, window:{} };
  vm.runInNewContext(receiveSource, legacyContext, { filename:'core/ui/forces-receive.js' });
  const legacyBannerText = banner.children[0].textContent;
  assert.ok(legacyBannerText.includes('LRFD 1.2D+1.0L-1.0E'));
  assert.ok(legacyBannerText.includes('未驗證來源'), 'legacy tuple cannot claim verified provenance');
  assert.equal(legacyBannerText.includes('完整配對'), false, 'legacy tuple fails closed');
}

function testConsumerReportContracts() {
  const repoRoot = path.resolve(__dirname, '../..');
  const consumers = [
    ['鋼筋混凝土/tools/beam.html', 'lcBeam'],
    ['鋼筋混凝土/tools/column.html', 'lcCol'],
    ['鋼筋混凝土/tools/wall.html', 'lcWall'],
    ['鋼筋混凝土/tools/shear-wall.html', 'lcSW'],
    ['結構工具箱/tools/鋼構/steel-beam.html', 'lcSB'],
    ['結構工具箱/tools/鋼構/steel-column.html', 'lcSC'],
  ];
  const texts = new Map();
  consumers.forEach(([relativePath, prefix]) => {
    const text = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    texts.set(relativePath, text);
    assert.ok(new RegExp("prefix\\s*:\\s*['\"]" + prefix + "['\"]").test(text), relativePath + ' load-combo prefix');
    assert.ok(/tupleMode\s*:\s*['"]select['"]/.test(text), relativePath + ' explicit tuple selection');
    assert.ok(/limitStates\s*:/.test(text), relativePath + ' declares page-only limit-state recommendations');
    assert.ok(/targetReportMeta\s*:/.test(text), relativePath + ' declares readable adopted-target report metadata');
    assert.ok(text.includes('LoadCombo.toReportGroup'), relativePath + ' report uses selected tuple group');
    const inlineScripts = Array.from(text.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi));
    inlineScripts.forEach((match, index) => {
      assert.doesNotThrow(() => new Function(match[1]), relativePath + ' inline script #' + (index + 1) + ' syntax');
    });
  });

  [
    '鋼筋混凝土/tools/beam.html',
    '鋼筋混凝土/tools/column.html',
    '結構工具箱/tools/鋼構/steel-beam.html',
    '結構工具箱/tools/鋼構/steel-column.html',
  ].forEach(relativePath => {
    const text = texts.get(relativePath);
    assert.equal(text.includes("group: '載重組合包絡摘要'"), false, relativePath + ' removes component envelope report');
    assert.equal(text.includes("group: '荷重組合控制摘要'"), false, relativePath + ' removes component-control report');
  });

  const rcBoundaryText = [
    texts.get('鋼筋混凝土/tools/beam.html'),
    texts.get('鋼筋混凝土/tools/wall.html'),
    texts.get('鋼筋混凝土/tools/shear-wall.html'),
  ].join('\n');
  assert.equal(rcBoundaryText.includes('本計算書僅供初步'), false);
  assert.equal(rcBoundaryText.includes('本計算書由 RC 工具箱自動產生，僅供初步'), false);
  assert.equal(rcBoundaryText.includes('最終設計圖說仍應由執業技師簽證'), false);

  const receiveText = fs.readFileSync(path.join(repoRoot, '結構工具箱/core/ui/forces-receive.js'), 'utf8');
  assert.ok(receiveText.includes('lastAppliedPayload = clone(payload)'));
  assert.ok(receiveText.includes('getLastApplied: () => clone(lastAppliedPayload)'));
  assert.ok(receiveText.includes('採用組合：'));

  ['鋼筋混凝土/tools/beam.html', '鋼筋混凝土/tools/column.html'].forEach(relativePath => {
    const text = texts.get(relativePath);
    assert.ok(text.includes("combination.validationStatus === 'verified'"));
    assert.ok(text.includes('combination.tuplePreserved === true'));
    assert.ok(text.includes("label: '來源驗證狀態'"));
    assert.ok(text.includes("'未驗證來源'"));
    assert.ok(text.includes("label: '採用組合'"));
    assert.ok(text.includes("label: '來源完整有號內力'"));
    assert.ok(text.includes("label: tuplePreserved ? '採用需求欄位'"));
  });
  ['結構工具箱/tools/鋼構/steel-beam.html', '結構工具箱/tools/鋼構/steel-column.html'].forEach(relativePath => {
    const text = texts.get(relativePath);
    assert.ok(text.includes('ForcePickerReceive?.getLastApplied?.()'));
    assert.ok(text.includes("combination.validationStatus === 'verified'"));
    assert.ok(text.includes("label:'來源驗證狀態'"));
    assert.ok(text.includes("'未驗證來源'"));
    assert.ok(text.includes("label:'採用組合'"));
    assert.ok(text.includes("label:'來源完整有號內力'"));
    assert.ok(text.includes("label:tuplePreserved ? '採用需求欄位'"));
  });

  const beamText = texts.get('鋼筋混凝土/tools/beam.html');
  assert.ok(beamText.includes("targetIds: { M:['MuPos','MuNeg'], V:'Vu', P:'Pu', T:'Tu' }"));
  assert.ok(beamText.includes("{ key: 'P', label: 'Pu', unit: 'tf' }"));
  assert.ok(beamText.includes("{ key: 'T', label: 'Tu', unit: 'tf·m' }"));
  assert.ok(beamText.includes("$('enableTorsion').checked = true"));
}
