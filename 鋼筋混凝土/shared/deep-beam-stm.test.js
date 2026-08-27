const assert = require('assert');
const STM = require('./deep-beam-stm.js');

function near(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

const base = {
  h: 400,
  ln: 1000,
  bw: 100,
  d: 360,
  z: 320,
  Pu: 500,
  fc: 280,
  fy: 4200,
  lambda: 1,
  betaC: 1,
  betaS: 0.75,
  strutWidth: 50,
  loadBearingWidth: 60,
  supportBearingWidth: 60,
  topNodeWidth: 60,
  bottomNodeWidth: 60,
  tieBarArea: 6.469,
  tieBarDiameter: 2.865,
  tieCount: 20,
  tieRows: 2,
  tieSideCover: 7.5,
  tieTransverseBarDiameter: 1.27,
  maxAggregateSize: 2.5,
  tieVerticalClearSpacing: 3,
  verticalBarArea: 2.85,
  verticalFaces: 2,
  verticalSpacing: 20,
  horizontalBarArea: 2.85,
  horizontalFaces: 2,
  horizontalSpacing: 20,
  geometryConfirmed: true,
  anchorageConfirmed: true,
};

const result = STM.assess(base);
assert.equal(result.valid, true);
assert.equal(result.status, 'ready');
assert.equal(result.isDeepBeam, true);
near(result.a, 500);
near(result.reaction, 250);
near(result.thetaDeg, 32.61924307119283);
near(result.tieDemand, 390.625);
near(result.tieAsStm, 124.0079365079365);
near(result.tieAsMin, 120);
near(result.tieAsRequired, result.tieAsStm);
assert.equal(result.checks.tieOk, true);
assert.equal(result.checks.tieLayoutOk, true);
assert.deepEqual(result.tieLayout.rowCounts, [10, 10]);
near(result.tieLayout.providedArea, 129.38);
near(result.tieLayout.requiredHorizontalClear, 10 / 3);
near(result.tieLayout.minHorizontalClear, 5.978888888888889);
near(result.tieLayout.tieBandDepth, 8.73);
near(result.tieLayout.centroidFromBottom, 13.135);
assert.equal(result.checks.strutOk, true);
assert.equal(result.checks.topNodeOk, true);
assert.equal(result.checks.bottomNodeOk, true);
assert.equal(result.checks.verticalRatioOk, true);
assert.equal(result.checks.horizontalRatioOk, true);
assert.equal(result.checks.shearLimit99Ok, true);
assert.equal(result.checks.shearLimit2344Ok, true);
assert.equal(result.failedItems.length, 0);

const review = STM.assess({ ...base, geometryConfirmed: false, anchorageConfirmed: false });
assert.equal(review.status, 'review');
assert.deepEqual(review.modelReviewItems, [
  '壓桿、拉桿與節點有效寬度／力流幾何',
  '拉桿於兩端節點區之錨定與發展',
]);

const weakTie = STM.assess({ ...base, tieCount: 15 });
assert.equal(weakTie.status, 'blocked');
assert.equal(weakTie.checks.tieOk, false);
assert.ok(weakTie.failedItems.includes('底部拉桿鋼筋'));

const threeRows = STM.assess({ ...base, tieCount: 20, tieRows: 3 });
assert.equal(threeRows.status, 'ready');
assert.deepEqual(threeRows.tieLayout.rowCounts, [7, 7, 6]);
assert.deepEqual(threeRows.tieLayout.rowColumnIndices, [
  [0, 1, 2, 3, 4, 5, 6],
  [0, 1, 2, 3, 4, 5, 6],
  [0, 1, 2, 4, 5, 6],
]);
assert.equal(threeRows.tieLayout.rowAlignmentOk, true);
assert.equal(threeRows.tieLayout.layoutOk, true);

const areaOnly = { ...base, tieAsProvided:20 * 6.469 };
for (const key of ['tieBarArea','tieBarDiameter','tieCount','tieRows','tieSideCover','tieTransverseBarDiameter','maxAggregateSize','tieVerticalClearSpacing']) delete areaOnly[key];
const backwardCompatible = STM.assess(areaOnly);
assert.equal(backwardCompatible.valid, true);
assert.equal(backwardCompatible.status, 'ready');
assert.equal(backwardCompatible.tieLayout.evaluated, false);

const congestedTie = STM.assess({
  ...base,
  bw: 30,
  tieBarArea: 10.07,
  tieBarDiameter: 3.581,
  tieCount: 12,
  tieRows: 3,
});
assert.equal(congestedTie.status, 'blocked');
assert.equal(congestedTie.checks.tieLayoutOk, false);
assert.ok(congestedTie.failedItems.includes('底部拉桿多排配筋幾何'));

const tightVertical = STM.assess({ ...base, tieRows: 3, tieVerticalClearSpacing: 2 });
assert.equal(tightVertical.status, 'blocked');
assert.equal(tightVertical.tieLayout.verticalSpacingOk, false);

const invalidRows = STM.assess({ ...base, tieRows: 2.5 });
assert.equal(invalidRows.valid, false);
assert.ok(invalidRows.errors.some(error => error.includes('tieRows')));

const sparseDistribution = STM.assess({ ...base, verticalBarArea: 1.267, verticalSpacing: 30 });
assert.equal(sparseDistribution.status, 'blocked');
assert.equal(sparseDistribution.checks.verticalRatioOk, false);
assert.equal(sparseDistribution.lambdaS, null);
assert.equal(sparseDistribution.checks.shearLimit2344Ok, false);

const ordinary = STM.assess({ ...base, ln: 2000, z: 320 });
assert.equal(ordinary.isDeepBeam, false);
assert.equal(ordinary.status, 'blocked');
assert.ok(ordinary.failedItems.includes('深梁適用條件'));

const smallAngle = STM.assess({ ...base, ln: 1500, z: 300 });
assert.equal(smallAngle.isDeepBeam, true);
assert.ok(smallAngle.thetaDeg < 25);
assert.equal(smallAngle.checks.angleOk, false);

const invalid = STM.assess({ ...base, z: 500 });
assert.equal(invalid.valid, false);
assert.ok(invalid.errors.includes('z 不得大於 h'));

for (const [overrides, message] of [
  [{ fy:5600.01 }, 'STM 拉桿 fy 不得大於 5600 kgf/cm²'],
  [{ lambda:1.01 }, 'λ 不得大於 1.0'],
  [{ betaC:2.01 }, 'βc 不得大於 2.0'],
]) {
  const outsideMaterialLimit = STM.assess({ ...base, ...overrides });
  assert.equal(outsideMaterialLimit.valid, false);
  assert.ok(outsideMaterialLimit.errors.includes(message));
}

near(STM.asMinFlexure(100, 360, 280, 4200), 120);
near(STM.asMinFlexure(100, 360, 280, 7000), 90);
assert.deepEqual(STM.alignedColumnIndices(6, 7), [0, 1, 2, 4, 5, 6]);

console.log('deep-beam-stm unit tests passed');
