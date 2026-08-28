const assert = require('node:assert/strict');
const FloorSlabWestergaardCore = require('./floor-slab-westergaard-core.js');
const goldenCases = require('./floor-slab-westergaard-golden-cases.js');

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(Number.isFinite(actual), `actual value must be finite: ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} ~= ${expected} within ${tolerance}`);
}

assert.equal(goldenCases.length, 6);
assert.equal(FloorSlabWestergaardCore.version, '0.1.0');

for (const goldenCase of goldenCases) {
  const errors = FloorSlabWestergaardCore.validateInput(goldenCase.input);
  assert.deepEqual(errors, [], `${goldenCase.id} validation`);
  const result = FloorSlabWestergaardCore.calculate(goldenCase.input);
  Object.entries(goldenCase.expected.values).forEach(([key, expected]) => approx(result[key], expected));
  Object.entries(goldenCase.expected.positionStress).forEach(([key, expected]) => approx(result.totalStressMpa[key], expected));
  Object.entries(goldenCase.expected.flags).forEach(([key, expected]) => assert.equal(result[key], expected, `${goldenCase.id}.${key}`));
  assert.equal(result.governingPosition, goldenCase.expected.governingPosition, `${goldenCase.id}.governingPosition`);
  assert.equal(result.resultSchemaVersion, FloorSlabWestergaardCore.resultSchemaVersion);
  assert.deepEqual(result.provenance, FloorSlabWestergaardCore.provenance());
}

{
  const r = FloorSlabWestergaardCore.calculate(goldenCases[0].input);
  approx(r.subgradeModulusNmm3, 0.05);
  approx(r.loadGroups[0].equivalentRadiusMm, 140.0339366124404);
  assert.equal(r.loadGroups[0].equivalentRadiusBranch, 'equivalent-radius');
  assert.equal(r.checks.length, 6);
  assert.equal(r.summary.primaryMetrics.length, 5);
}

{
  const r = FloorSlabWestergaardCore.calculate(goldenCases.find(item => item.id === 'missing-allowable-basis-blocked').input);
  assert.equal(r.loadGroups[0].equivalentRadiusMm, 400);
  assert.equal(r.loadGroups[0].equivalentRadiusBranch, 'direct-radius');
  assert.equal(r.checks.find(item => item.key === 'allowable-stress-basis').status, 'fail');
  assert.equal(r.stressChecksOk, true);
  assert.equal(r.overallOk, false);
}

{
  const r = FloorSlabWestergaardCore.calculate(goldenCases.find(item => item.id === 'reduced-influence-without-basis-blocked').input);
  assert.equal(r.checks.find(item => item.key === 'influence-basis').status, 'fail');
  assert.equal(r.loadGroups[0].usesReducedInfluence, true);
  assert.equal(r.loadGroups[0].influenceBasisReady, false);
}

{
  const errors = FloorSlabWestergaardCore.validateInput({
    slabThicknessMm: 0,
    elasticModulusMpa: -1,
    poissonRatio: 0.5,
    subgradeModulusMNm3: 0,
    allowableStressMpa: 0,
    loadGroups: [{ loadKn: 0, count: 1.5, dynamicFactor: 0, contactRadiusMm: 0, influenceInterior: -0.1, influenceEdge: 1.1, influenceCorner: 1 }]
  });
  ['版厚', '彈性模數', '泊松比', '版下反力模數', '容許彎拉應力', '單輪／單腳載重', '正整數', '動力／衝擊係數', '接觸半徑', '內部影響係數', '邊緣影響係數'].forEach(needle => {
    assert.ok(errors.some(message => message.includes(needle)), `validation includes ${needle}`);
  });
}

console.log('floor slab Westergaard core regression OK');
