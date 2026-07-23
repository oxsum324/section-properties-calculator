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
});

const seismic = global.BeamRebarDesigner.search({ ...base, seismic:true, Ve:30, Vu:18 });
assert.equal(seismic.status, 'evaluated');
assert.ok(seismic.candidates.every(candidate => candidate.spacing <= 15));

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
