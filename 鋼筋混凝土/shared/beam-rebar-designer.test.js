const assert = require('node:assert/strict');

global.window = global;
require('../../結構工具箱/core/materials/rebar.js');
require('./flexure.js');
require('./beam-evaluator.js');
require('./beam-rebar-designer.js');

const base = {
  sectionType:'rect', bw:35, h:65, bf:35, hf:0, ln:600,
  cover:4, sv:3, shMin:4,
  fc:280, fy:4200, fyt:2800, beta1:0.85,
  MuPos:60, MuNeg:35, Vu:22, Pu:0, Tu:0, Ve:0,
  seismic:false, enableTorsion:false, torsionDesignStatus:'pending',
  barTable:global.Rebar.REBAR_TABLE,
  limit:5,
};

const ordinary = global.BeamRebarDesigner.search(base);
assert.equal(ordinary.status, 'evaluated');
assert.ok(ordinary.candidates.length >= 3);
ordinary.candidates.forEach(candidate => {
  assert.ok(candidate.flexPosUtilization <= 1 + 1e-9);
  assert.ok(candidate.flexNegUtilization <= 1 + 1e-9);
  assert.ok(candidate.shearUtilization <= 1 + 1e-9);
  assert.ok(candidate.bottomCounts.filter(Boolean).every(count => count >= 2));
  assert.ok(candidate.topCounts.filter(Boolean).every(count => count >= 2));
  assert.ok(candidate.epsTPos + 1e-9 >= candidate.epsTLimit);
  assert.ok(candidate.epsTNeg + 1e-9 >= candidate.epsTLimit);
});

const ranges = global.BeamRebarDesigner.summarizeLongitudinalRanges({
  ...base,
  asFlexReqPos:12,
  asFlexReqNeg:8,
  tieBar:'#4',
});
assert.equal(ranges.status, 'evaluated');
assert.equal(ranges.rows.length, 10);
ranges.rows.filter(row => row.feasible).forEach(row => {
  assert.ok(row.minBars <= row.codeMaxBars);
  assert.ok(row.codeMaxBars <= row.geometryMaxBars);
  assert.ok(row.minCounts.filter(Boolean).every(count => count >= 2));
});

const fourLayerStack = global.BeamRebarDesigner.buildStack('#8', [4, 4, 4, 4], base.cover, 1.27, base.sv, base.barTable);
assert.equal(fourLayerStack.length, 4);
assert.ok(fourLayerStack[3].dFromFace > fourLayerStack[2].dFromFace);
const fourLayerRanges = global.BeamRebarDesigner.summarizeLongitudinalRanges({
  ...base, asFlexReqPos:12, asFlexReqNeg:8, tieBar:'#4', maxRows:4,
});
assert.equal(fourLayerRanges.status, 'evaluated');
assert.ok(fourLayerRanges.rows.every(row => row.geometryMaxBars == null || row.geometryMaxBars <= 4 * row.capPerLayer));
assert.ok(fourLayerRanges.rows.filter(row => row.codeMaxCounts).every(row => row.codeMaxCounts.length === 4));

const highStrength = global.BeamRebarDesigner.search({ ...base, fy:5600 });
assert.equal(highStrength.status, 'evaluated');
assert.ok(highStrength.candidates.every(candidate => candidate.epsTLimit > 0.005));
assert.ok(highStrength.candidates.every(candidate => candidate.epsTPos + 1e-9 >= candidate.epsTLimit && candidate.epsTNeg + 1e-9 >= candidate.epsTLimit));

const tDeterminate = global.BeamRebarDesigner.summarizeLongitudinalRanges({ ...base, sectionType:'T', support:'simple', bf:120, hf:12, tieBar:'#4' });
const tIndeterminate = global.BeamRebarDesigner.summarizeLongitudinalRanges({ ...base, sectionType:'T', support:'bothEnd', bf:120, hf:12, tieBar:'#4' });
assert.ok(tDeterminate.rows.filter(row => row.direction === 'neg').every(row => row.asMinWidth === 70));
assert.ok(tIndeterminate.rows.filter(row => row.direction === 'neg').every(row => row.asMinWidth === 35));

const seismicInput = { ...base, bw:45, h:75, bf:45, ln:700, MuPos:45, MuNeg:30, seismic:true, Ve:30, Vu:18 };
const seismic = global.BeamRebarDesigner.search(seismicInput);
assert.equal(seismic.status, 'evaluated');
assert.ok(seismic.candidates.every(candidate => candidate.spacing <= 15));
const seismicRhoLimit = Math.min((Math.sqrt(seismicInput.fc) + 100) / (4 * seismicInput.fy), 0.025);
assert.ok(seismic.candidates.every(candidate => candidate.bottomAs / (seismicInput.bw * candidate.dPos) <= seismicRhoLimit + 1e-9));
assert.ok(seismic.candidates.every(candidate => candidate.topAs / (seismicInput.bw * candidate.dNeg) <= seismicRhoLimit + 1e-9));

const seismicRanges = global.BeamRebarDesigner.summarizeLongitudinalRanges({
  ...seismicInput, asFlexReqPos:10, asFlexReqNeg:7, tieBar:'#4'
});
assert.equal(seismicRanges.status, 'evaluated');
assert.ok(seismicRanges.rows.every(row => row.minMode !== 'four-thirds'));
assert.ok(seismicRanges.rows.filter(row => row.codeMaxBars != null).every(row => row.rhoAtMax <= seismicRhoLimit + 1e-9));

const narrow = global.BeamRebarDesigner.search({ ...base, bw:15, cover:6 });
assert.equal(narrow.status, 'no-solution');

const torsionBlocked = global.BeamRebarDesigner.search({ ...base, enableTorsion:true, Tu:100 });
assert.equal(torsionBlocked.status, 'no-solution');
assert.match(torsionBlocked.reason, /22\.7/);

const invalid = global.BeamRebarDesigner.search({ ...base, h:0 });
assert.equal(invalid.status, 'invalid-input');

console.log('beam rebar designer unit: PASS', {
  ordinary: ordinary.candidates.length,
  seismic: seismic.candidates.length,
  evaluated: ordinary.evaluatedCount,
});
