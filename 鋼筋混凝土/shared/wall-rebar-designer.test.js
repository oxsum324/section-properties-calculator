const assert = require('assert');

global.window = global;
require('../../結構工具箱/core/materials/rebar.js');
require('./wall.js');
require('./pmsection.js');
require('./wall-inplane-evaluator.js');
require('./wall-rebar-designer.js');

const base = {
  fc:280, fy:4200, h:25, lw:500, lc:300, k:1, hw:1200,
  e:2, lambda:1, phiComp:0.65, phiTen:0.90, phiShear:0.75,
  pnMaxFactor:0.80, cover:4, seismic:false, wallType:'bearing',
};
const catalog = {
  base,
  demand:{ P:300, M:300, V:80 },
  barTable:global.Rebar.REBAR_TABLE,
  verticalBars:['#4', '#5'],
  horizontalBars:['#4', '#5'],
  boundaryBars:['#8'],
  boundaryCounts:[4],
  spacings:[15, 20, 25],
  limit:5,
};

const basic = global.WallRebarDesigner.search(catalog);
assert.equal(basic.status, 'evaluated');
assert.ok(basic.candidates.length > 0 && basic.candidates.length <= 5);
for (const candidate of basic.candidates) {
  assert.ok(candidate.pmUtilization <= 1 + 1e-9);
  assert.ok(candidate.shearUtilization <= 1 + 1e-9);
  assert.ok(candidate.rhol > 0 && candidate.rhot > 0);
}

const boundaryDemand = { ...catalog, demand:{ P:300, M:1600, V:80 } };
const withBoundary = global.WallRebarDesigner.search(boundaryDemand);
assert.equal(withBoundary.status, 'evaluated');
assert.equal(withBoundary.candidates[0].boundaryEnabled, true);
assert.equal(withBoundary.candidates[0].boundaryBar, '#8');
assert.equal(withBoundary.candidates[0].boundaryCountEach, 4);

const withoutBoundary = global.WallRebarDesigner.search({ ...boundaryDemand, allowBoundary:false });
assert.equal(withoutBoundary.status, 'no-solution');

const tooThin = global.WallRebarDesigner.search({ ...catalog, base:{ ...base, h:8 } });
assert.equal(tooThin.status, 'geometry-failed');

const wallPier = global.WallRebarDesigner.search({ ...catalog, base:{ ...base, h:200, lw:400, hw:1000 } });
assert.equal(wallPier.status, 'geometry-failed');

console.log('wall-rebar-designer.test.js: PASS');
