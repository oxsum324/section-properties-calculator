const assert = require('assert');
require('./deep-beam-stm.js');
const STM = require('./pile-cap-3d-stm.js');

assert.strictEqual(STM.NUMERICAL_TOLERANCE_POLICY.authority, 'numerical-quality-gate');
assert.strictEqual(STM.NUMERICAL_TOLERANCE_POLICY.label, '數值門檻（非條文值）');
assert.strictEqual(Object.isFrozen(STM.NUMERICAL_TOLERANCE_POLICY), true);

function tieInput(count = 12, rows = 2) {
  return {
    barArea:6.469,
    barDiameter:2.87,
    count,
    rows,
    sideCover:7.5,
    transverseBarDiameter:1.27,
    maxAggregateSize:2.5,
    verticalClearSpacing:3,
  };
}

function baseInput(overrides = {}) {
  return {
    capLengthX:600,
    capWidthY:600,
    h:180,
    columnX:100,
    columnY:100,
    loadNodeDepth:20,
    pileDiameter:100,
    Pu:400,
    Mx:0,
    My:0,
    fc:280,
    fy:4200,
    lambda:1,
    betaC:1,
    betaS:0.4,
    strutArea:4000,
    topNodeArea:10000,
    bottomNodeArea:7000,
    xTieMinimumArea:60,
    yTieMinimumArea:60,
    xTie:tieInput(),
    yTie:tieInput(),
    pileReactions:[
      { id:'P1', x:-150, y:-150, reaction:100 },
      { id:'P2', x:150, y:-150, reaction:100 },
      { id:'P3', x:-150, y:150, reaction:100 },
      { id:'P4', x:150, y:150, reaction:100 },
    ],
    ...overrides,
  };
}

{
  const parsed = STM.parsePileReactions('P1, -150, -150, 100\n150；-150；100');
  assert.deepStrictEqual(parsed, [
    { id:'P1', x:-150, y:-150, reaction:100 },
    { id:'P2', x:150, y:-150, reaction:100 },
  ]);
  assert.throws(() => STM.parsePileReactions([{ id:'P1', x:-150, y:-150, reaction:0 }]), /非正向反力/);
  assert.throws(() => STM.parsePileReactions([{ id:'P1', x:Number.NaN, y:-150, reaction:100 }]), /數值無效/);
}

{
  const result = STM.assess(baseInput());
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.status, 'review');
  assert.strictEqual(result.numericalTolerancePolicy.adoptedForceErrorPct, STM.NUMERICAL_TOLERANCE_POLICY.maxForceErrorPct);
  assert.strictEqual(result.numericalTolerancePolicy.adoptedMomentErrorPct, STM.NUMERICAL_TOLERANCE_POLICY.maxMomentErrorPct);
  assert.strictEqual(result.numericalTolerancePolicy.adoptedHorizontalResidualPct, STM.NUMERICAL_TOLERANCE_POLICY.maxHorizontalResidualPct);
  assert.strictEqual(result.grid.complete, true);
  assert.strictEqual(result.reactionTotal, 400);
  assert.strictEqual(result.reactionMomentX, 0);
  assert.strictEqual(result.reactionMomentY, 0);
  assert.ok(result.minThetaDeg >= 25);
  assert.ok(Math.abs(result.xTieDemand - result.yTieDemand) < 1e-9);
  assert.deepStrictEqual(result.xTieLayout.rowCounts, [6, 6]);
  assert.strictEqual(result.strengthPass, true);
}

{
  const duplicateIds = STM.assess(baseInput({
    pileReactions:[
      { id:'P1', x:-150, y:-150, reaction:100 },
      { id:'P1', x:150, y:-150, reaction:100 },
      { id:'P3', x:-150, y:150, reaction:100 },
      { id:'P4', x:150, y:150, reaction:100 },
    ],
  }));
  assert.strictEqual(duplicateIds.valid, false);
  assert.ok(duplicateIds.errors.includes('樁編號不得重複'));
}

{
  const ready = STM.assess(baseInput({
    reactionSourceConfirmed:true,
    threeDimensionalTopologyConfirmed:true,
    nodalGeometryConfirmed:true,
    anchorageConfirmed:true,
    localTieDistributionConfirmed:true,
  }));
  assert.strictEqual(ready.status, 'ready');
  assert.deepStrictEqual(ready.modelReviewItems, []);
}

{
  const moment = STM.assess(baseInput({
    My:60,
    pileReactions:[
      { id:'P1', x:-150, y:-150, reaction:90 },
      { id:'P2', x:150, y:-150, reaction:110 },
      { id:'P3', x:-150, y:150, reaction:90 },
      { id:'P4', x:150, y:150, reaction:110 },
    ],
  }));
  assert.strictEqual(moment.valid, true);
  assert.strictEqual(moment.checks.forceBalanceOk, true);
  assert.strictEqual(moment.checks.momentYBalanceOk, true);
  assert.strictEqual(moment.loadX, 15);
  assert.ok(Math.abs(moment.horizontalResidualX) < 1e-9);
}

{
  const biaxial = STM.assess(baseInput({
    Mx:-30,
    My:45,
    pileReactions:[
      { id:'P1', x:-150, y:-150, reaction:97.5 },
      { id:'P2', x:150, y:-150, reaction:112.5 },
      { id:'P3', x:-150, y:150, reaction:87.5 },
      { id:'P4', x:150, y:150, reaction:102.5 },
    ],
  }));
  assert.strictEqual(biaxial.valid, true);
  assert.strictEqual(biaxial.checks.forceBalanceOk, true);
  assert.strictEqual(biaxial.checks.momentXBalanceOk, true);
  assert.strictEqual(biaxial.checks.momentYBalanceOk, true);
  assert.strictEqual(biaxial.loadX, 11.25);
  assert.strictEqual(biaxial.loadY, -7.5);
  assert.ok(Math.abs(biaxial.horizontalResidualX) < 1e-9);
  assert.ok(Math.abs(biaxial.horizontalResidualY) < 1e-9);
  assert.strictEqual(biaxial.checks.horizontalXBalanceOk, true);
  assert.strictEqual(biaxial.checks.horizontalYBalanceOk, true);

  const scaled = STM.assess(baseInput({
    Pu:800,
    Mx:-60,
    My:90,
    pileReactions:[
      { id:'P1', x:-150, y:-150, reaction:195 },
      { id:'P2', x:150, y:-150, reaction:225 },
      { id:'P3', x:-150, y:150, reaction:175 },
      { id:'P4', x:150, y:150, reaction:205 },
    ],
  }));
  assert.strictEqual(scaled.valid, true);
  assert.strictEqual(scaled.loadX, biaxial.loadX);
  assert.strictEqual(scaled.loadY, biaxial.loadY);
  assert.ok(Math.abs(scaled.forceErrorPct - biaxial.forceErrorPct) < 1e-12);
  assert.ok(Math.abs(scaled.momentXErrorPct - biaxial.momentXErrorPct) < 1e-12);
  assert.ok(Math.abs(scaled.momentYErrorPct - biaxial.momentYErrorPct) < 1e-12);
  assert.ok(Math.abs(scaled.xTieDemand - 2 * biaxial.xTieDemand) < 1e-9);
  assert.ok(Math.abs(scaled.yTieDemand - 2 * biaxial.yTieDemand) < 1e-9);
  assert.ok(Math.abs(scaled.maxStrutDcr - 2 * biaxial.maxStrutDcr) < 1e-9);

  const residualOnly = STM.assess(baseInput({
    Mx:-30,
    My:45,
    pileReactions:[
      { id:'P1', x:-150, y:-150, reaction:96 },
      { id:'P2', x:150, y:-150, reaction:114 },
      { id:'P3', x:-150, y:150, reaction:86 },
      { id:'P4', x:150, y:150, reaction:104 },
    ],
  }));
  assert.strictEqual(residualOnly.valid, true);
  assert.strictEqual(residualOnly.checks.forceBalanceOk, true);
  assert.strictEqual(residualOnly.checks.momentXBalanceOk, true);
  assert.strictEqual(residualOnly.checks.momentYBalanceOk, true);
  assert.strictEqual(residualOnly.checks.horizontalXBalanceOk, false);
  assert.strictEqual(residualOnly.checks.horizontalYBalanceOk, true);
  assert.ok(residualOnly.horizontalResidualXPct > 1);
  assert.strictEqual(residualOnly.status, 'blocked');
  assert.ok(residualOnly.failedItems.includes('X 向水平力平衡'));
}

{
  const unbalanced = STM.assess(baseInput({
    pileReactions:[
      { x:-150, y:-150, reaction:100 },
      { x:150, y:-150, reaction:100 },
      { x:-150, y:150, reaction:100 },
      { x:150, y:150, reaction:80 },
    ],
  }));
  assert.strictEqual(unbalanced.valid, true);
  assert.strictEqual(unbalanced.status, 'blocked');
  assert.strictEqual(unbalanced.checks.forceBalanceOk, false);
}

{
  const incomplete = STM.assess(baseInput({
    pileReactions:[
      { x:-150, y:-150, reaction:100 },
      { x:150, y:-150, reaction:100 },
      { x:-150, y:150, reaction:200 },
    ],
  }));
  assert.strictEqual(incomplete.valid, false);
  assert.ok(incomplete.errors.some((item) => item.includes('完整矩形正交樁群')));
}

{
  assert.throws(
    () => STM.parsePileReactions('-150,-150,-10'),
    /非正向反力/,
  );
}

{
  const outside = STM.assess(baseInput({
    My:400,
    pileReactions:[
      { x:-150, y:-150, reaction:33.3333333333 },
      { x:150, y:-150, reaction:166.6666666667 },
      { x:-150, y:150, reaction:33.3333333333 },
      { x:150, y:150, reaction:166.6666666667 },
    ],
  }));
  assert.strictEqual(outside.valid, true);
  assert.strictEqual(outside.checks.loadPointInsideColumn, false);
  assert.strictEqual(outside.status, 'blocked');
}

{
  const beta075 = STM.assess(baseInput({ betaS:0.75 }));
  assert.strictEqual(beta075.valid, true);
  assert.strictEqual(beta075.check2344Required, true);
  assert.ok(beta075.lambdaSX < 1);
  assert.ok(beta075.lambdaSY < 1);
  const distributed = STM.assess(baseInput({ betaS:0.75, distributionReinforcementComplies:true }));
  assert.strictEqual(distributed.lambdaSX, 1);
  assert.strictEqual(distributed.lambdaSY, 1);
}

{
  const partial = STM.directionalShearDemand([
    { x:40, reaction:100 },
    { x:100, reaction:100 },
    { x:-100, reaction:80 },
  ], 'x', 75, 50);
  assert.strictEqual(partial.positiveSide, 100);
  assert.strictEqual(partial.negativeSide, 80);
  assert.strictEqual(partial.demand, 100);
}

for (const [overrides, message] of [
  [{ fy:5600.01 }, 'STM 拉桿 fy 不得大於 5600 kgf/cm²'],
  [{ lambda:1.01 }, 'λ 不得大於 1.0'],
  [{ betaC:2.01 }, 'βc 不得大於 2.0'],
  [{ balanceTolerancePct:2.01 }, '垂直力平衡容許誤差不得大於 2.0%'],
  [{ momentTolerancePct:1.01 }, '力矩平衡容許誤差不得大於 1.0%'],
  [{ horizontalTolerancePct:1.01 }, '水平力平衡容許殘差不得大於 1.0%'],
]) {
  const outsideMaterialLimit = STM.assess(baseInput(overrides));
  assert.strictEqual(outsideMaterialLimit.valid, false);
  assert.ok(outsideMaterialLimit.errors.includes(message));
}

console.log('pile-cap 3D STM unit tests passed');
