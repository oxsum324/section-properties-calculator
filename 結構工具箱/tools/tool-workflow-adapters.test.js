'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const adapters = require('./tool-workflow-adapters.js');
const workflow = require('../core/ui/tool-workflow.js');
const manifest = require('./tool-workflow.manifest.json');
const root = path.resolve(__dirname, '../..');
function documentStub() {
  return { querySelectorAll() { return []; }, querySelector() { return null; }, getElementById() { return null; }, activeElement: null };
}
function windowStub(document = documentStub()) { return { document, getComputedStyle() { return { display: 'block', visibility: 'visible' }; }, console, HYToolWorkflow: workflow }; }
let connections = 0;
for (const tool of manifest.tools.filter(item => !['steel-explicit', 'native-react'].includes(item.adapter))) {
  const file = path.join(root, tool.file), html = fs.readFileSync(file, 'utf8');
  const tag = html.match(new RegExp(`<script[^>]*data-tool-key="${tool.key}"[^>]*>`));
  assert.ok(tag, `${tool.key}: explicit adapter script is connected`);
  assert.ok(tag[0].includes(`data-workflow-result="${tool.resultSelector}"`));
  for (const script of html.matchAll(/<script[^>]*src="([^"]*tool-workflow(?:-adapters)?\.js)"/g)) {
    assert.ok(fs.existsSync(path.resolve(path.dirname(file), script[1])), `${tool.key}: workflow script resolves locally`);
  }
  connections++;
}
assert.equal(connections, 36);

for (const [key, engine] of [['/rc-beam', 'calcBeam'], ['/rc-column', 'calcColumn'], ['/rc-wall', 'calcWall'], ['/rc-shear-wall', 'calcShearWall']]) {
  const tool = manifest.tools.find(item => item.key === key), html = fs.readFileSync(path.join(root, tool.file), 'utf8');
  assert.ok(!html.includes('calc-verdict-strip.js'), `${key}: obsolete verdict strip is not loaded`);
  const scriptTags = [...html.matchAll(/<script\b[^>]*>/g)];
  const lastScript = scriptTags.at(-1);
  assert.ok(lastScript?.[0].includes('project-meta-profile.js'), `${key}: project metadata script remains last`);
  assert.ok(html.indexOf('</body>', lastScript.index) - (lastScript.index + lastScript[0].length) <= 200, `${key}: final project script remains close to body end`);
  const start = html.indexOf('  function applyPanel(tab) {'), end = html.indexOf('\n  }', start) + 4;
  assert.ok(start >= 0 && end > start, `${key}: real applyPanel source exists`);
  const env = windowStub(); let calculations = 0;
  env.$ = () => null; env.TOPIC_VISIBLE = { summary: 'all' }; env[engine] = () => { calculations++; };
  vm.createContext(env); vm.runInContext(html.slice(start, end), env);
  const options = adapters.createOptions(tool, env);
  options.calculate(); options.showResults(); options.readSummary();
  assert.equal(calculations, 1, `${key}: actual applyPanel plus navigation has exactly one engine call`);
}

const slab = manifest.tools.find(item => item.key === '/rc-slab');
const slabHtml = fs.readFileSync(path.join(root, slab.file), 'utf8');
const slabStart = slabHtml.indexOf('  let slabCalcQueued = false;');
const slabEnd = slabHtml.indexOf("  $('autoSelfWt').addEventListener", slabStart);
const pendingFrames = new Map(); let frameId = 0, slabCalls = 0;
const slabEnv = windowStub();
Object.assign(slabEnv, {
  requestAnimationFrame(callback) { const id = ++frameId; pendingFrames.set(id, callback); return id; },
  cancelAnimationFrame(id) { pendingFrames.delete(id); }, calcSlab() { slabCalls++; }
});
vm.createContext(slabEnv); vm.runInContext(slabHtml.slice(slabStart, slabEnd), slabEnv);
slabEnv.scheduleCalc(); slabEnv.scheduleCalc(); assert.equal(pendingFrames.size, 1);
adapters.createOptions(slab, slabEnv).calculate();
assert.equal(slabCalls, 1, 'slab immediate operation calculates once');
assert.equal(pendingFrames.size, 0, 'slab pending automatic frame is cancelled before explicit calculation');

let originalCalcCalls = 0, calculated = 0; const handlers = [];
const button = { addEventListener(type, callback, capture) { handlers.push({ callback, capture: !!capture }); } };
button.addEventListener('click', () => { originalCalcCalls++; }, false);
const rcDocument = documentStub();
rcDocument.querySelectorAll = selector => selector === '.btn-calc' ? [button] : [];
const rcEnv = windowStub(rcDocument);
rcEnv.applyPanel = () => { calculated++; };
rcEnv.MutationObserver = class { observe() {} disconnect() {} };
rcEnv.addEventListener = () => {};
rcEnv.HYToolWorkflow = { ...workflow, install(options) { return { ...workflow.createController(options), refresh() {} }; } };
adapters.install(manifest.tools.find(item => item.key === '/rc-beam'), rcEnv);
const event = { stopped: false, preventDefault() {}, stopImmediatePropagation() { this.stopped = true; } };
for (const handler of handlers.sort((a, b) => Number(b.capture) - Number(a.capture))) { if (!event.stopped) handler.callback(event); }
assert.deepEqual([calculated, originalCalcCalls], [1, 0], 'RC calculation capture runs the adapter once and suppresses the original click callback');

const homeSource = fs.readFileSync(path.join(root, '結構工具箱', 'assets', 'home', 'home.js'), 'utf8');
assert.ok(!homeSource.includes('鋼筋混凝土/shared/calc-verdict-strip.js'), 'homepage dependency map no longer tracks the removed strip');

let clicked = 0, scrolled = 0;
const genericDocument = documentStub();
const result = { hidden: false, getAttribute() { return null; }, getClientRects() { return [{}]; }, scrollIntoView() { scrolled++; }, textContent: 'NG 原始結果', classList: { contains() { return false; } } };
genericDocument.querySelector = selector => selector === '#btnCalc' ? { click() { clicked++; } } : selector === '#bannerStatus' ? result : null;
genericDocument.querySelectorAll = selector => selector === '#bannerStatus' ? [result] : [];
const generic = adapters.createOptions({ key: '/foundation-local', calculateButton: '#btnCalc', resultSelector: '#bannerStatus' }, windowStub(genericDocument));
generic.calculate(); generic.showResults();
assert.deepEqual([clicked, scrolled], [1, 1]);
assert.deepEqual(generic.readSummary(), { text: 'NG 原始結果', tone: 'idle' }, 'adapter mirrors text and does not infer engineering status from NG words');

const seismicDocument = documentStub(), seismicCalls = [];
const seismicResults = Object.fromEntries(['#resultPanel', '#apResult', '#vResult', '#miscResult'].map(selector => [selector, { ...result, textContent: selector }]));
seismicDocument.querySelectorAll = selector => seismicResults[selector] ? [seismicResults[selector]] : [];
seismicDocument.querySelector = selector => selector === '#btnCalc' ? { click() { seismicCalls.push('main'); } } : seismicResults[selector] || null;
const seismicEnv = windowStub(seismicDocument);
for (const name of ['calcAppendage', 'calcVertical', 'calcMisc']) seismicEnv[name] = () => seismicCalls.push(name);
const seismic = adapters.createOptions({ key: '/seismic-force', calculateButton: '#btnCalc', resultSelector: '#resultPanel' }, seismicEnv);
for (const [card, functionName, expectedResult] of [['appendageCard', 'calcAppendage', '#apResult'], ['verticalCard', 'calcVertical', '#vResult'], ['miscCard', 'calcMisc', '#miscResult']]) {
  seismicDocument.activeElement = { closest() { return { id: card }; } };
  const count = seismicCalls.length;
  seismic.calculate(); seismic.showResults();
  assert.equal(seismicCalls.length, count + 1);
  assert.equal(seismicCalls.at(-1), functionName);
  assert.equal(seismic.readSummary().text, expectedResult, 'keyboard operation mirrors the corresponding local card');
}
seismic.selectResultFor({ closest() { return null; } });
assert.equal(seismic.readSummary().text, '#resultPanel', 'main button resets a previously selected local result');
seismic.selectResultFor({ closest() { return { id: 'verticalCard' }; } });
assert.equal(seismic.readSummary().text, '#vResult', 'existing local button chooses its result before the original callback');

const beamDocument = documentStub(); let errorFocused = 0;
beamDocument.getElementById = id => id === 'errorMsg' ? { textContent: '模型輸入有誤', scrollIntoView() { errorFocused++; } } : null;
const beamEnv = windowStub(beamDocument); beamEnv.runAnalysis = () => {};
const invalid = adapters.createOptions({ key: '/beam-analysis', resultSelector: '#resultsCard' }, beamEnv);
assert.equal(invalid.calculate(), false); assert.equal(errorFocused, 1, 'invalid continuous-beam input points to the original error and never navigates to stale results');
console.log('workflow adapters: 36 local connections, four real RC summary functions, obsolete strip removal, single-call RC capture, slab frame cancellation, seismic card routing, result mirroring and error routing passed');
