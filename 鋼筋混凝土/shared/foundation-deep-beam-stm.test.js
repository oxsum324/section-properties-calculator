const assert = require('assert');
const STM = require('./foundation-deep-beam-stm.js');

assert.equal(STM.NUMERICAL_TOLERANCE_POLICY.authority, 'numerical-quality-gate');
assert.equal(STM.NUMERICAL_TOLERANCE_POLICY.label, '數值門檻（非條文值）');
assert.equal(Object.isFrozen(STM.NUMERICAL_TOLERANCE_POLICY), true);

const base = {
  reactionMode:'soil-uniform',
  h:400,
  ln:1000,
  bw:100,
  columnWidth:100,
  loadNodeDepth:20,
  Pu:500,
  fc:280,
  fy:4200,
  lambda:1,
  betaC:1,
  betaS:0.4,
  strutWidth:60,
  topNodeWidth:80,
  bottomNodeWidth:120,
  supportBearingWidth:200,
  soilPressure:50,
  soilTributaryWidth:100,
  pileDiameter:100,
  tieMinimumArea:40,
  tieBarArea:6.469,
  tieBarDiameter:2.865,
  tieCount:10,
  tieRows:2,
  tieSideCover:7.5,
  tieTransverseBarDiameter:1.27,
  maxAggregateSize:2.5,
  tieVerticalClearSpacing:3,
  balanceTolerancePct:2,
  symmetryTolerancePct:2,
  momentTolerancePct:1,
  distributionReinforcementComplies:false,
  reactionSourceConfirmed:true,
  twoDimensionalConfirmed:true,
  geometryConfirmed:true,
  anchorageConfirmed:true,
};

const soil = STM.assess(base);
assert.equal(soil.valid, true);
assert.equal(soil.status, 'ready');
assert.equal(soil.numericalTolerancePolicy.adoptedForceErrorPct, STM.NUMERICAL_TOLERANCE_POLICY.maxForceErrorPct);
assert.equal(soil.numericalTolerancePolicy.adoptedSymmetryErrorPct, STM.NUMERICAL_TOLERANCE_POLICY.maxSymmetryErrorPct);
assert.equal(soil.numericalTolerancePolicy.adoptedMomentErrorPct, STM.NUMERICAL_TOLERANCE_POLICY.maxMomentErrorPct);
assert.equal(soil.numericalTolerancePolicy.adoptedHorizontalResidualPct, STM.NUMERICAL_TOLERANCE_POLICY.maxHorizontalResidualPct);
assert.equal(soil.nodes.length, 2);
assert.ok(Math.abs(soil.reactionTotal - 500) < 1e-9);
assert.ok(Math.abs(soil.nodes[0].x + 250) < 1e-9);
assert.ok(Math.abs(soil.nodes[1].x - 250) < 1e-9);
assert.ok(soil.checks.balanceOk && soil.checks.momentBalanceOk && soil.checks.symmetryOk);
assert.ok(soil.tieDemand > 0 && soil.tieAsStm > 0);
assert.deepEqual(soil.tieLayout.rowCounts, [5, 5]);
assert.ok(soil.d > 300 && soil.z > 300);

const soilUnbalanced = STM.assess({ ...base, soilPressure:45 });
assert.equal(soilUnbalanced.status, 'blocked');
assert.equal(soilUnbalanced.checks.balanceOk, false);
assert.ok(soilUnbalanced.failedItems.includes('垂直力平衡'));

assert.deepEqual(STM.parsePileReactions('-360, 125\n-180 125\n180，125\n360;125'), [
  { x:-360, reaction:125 },
  { x:-180, reaction:125 },
  { x:180, reaction:125 },
  { x:360, reaction:125 },
]);
assert.throws(() => STM.parsePileReactions([{ x:-100, reaction:Number.NaN }, { x:100, reaction:10 }]), /樁反力第 1 列數值無效/);
assert.throws(() => STM.parsePileReactions([{ x:-100, reaction:-10 }, { x:100, reaction:10 }]), /樁反力第 1 列數值無效/);

const piles = STM.assess({
  ...base,
  reactionMode:'pile-group',
  h:240,
  ln:900,
  columnWidth:100,
  loadNodeDepth:20,
  bottomNodeWidth:80,
  supportBearingWidth:100,
  pileDiameter:100,
  pileReactions:'-360,125\n-180,125\n180,125\n360,125',
  tieCount:20,
  tieRows:3,
  tieMinimumArea:100,
  betaS:0.4,
});
assert.equal(piles.valid, true);
assert.equal(piles.status, 'ready');
assert.equal(piles.nodes.length, 4);
assert.deepEqual(piles.tieLayout.rowCounts, [7, 7, 6]);
assert.equal(piles.tieSegments.length, 3);
assert.ok(piles.tieSegments[1].demand > piles.tieSegments[0].demand);
assert.ok(Math.abs(piles.tieSegments[0].demand - piles.tieSegments[2].demand) < 1e-9);
assert.ok(piles.minThetaDeg >= 25);
assert.equal(piles.shearDemand, 125);
assert.equal(piles.checks.pileEffectiveDepthOk, true);

const pilesScaled = STM.assess({
  ...base,
  reactionMode:'pile-group',
  h:240,
  ln:900,
  columnWidth:100,
  loadNodeDepth:20,
  bottomNodeWidth:80,
  supportBearingWidth:100,
  pileDiameter:100,
  Pu:1500,
  pileReactions:'-360,375\n-180,375\n180,375\n360,375',
  tieCount:20,
  tieRows:3,
  tieMinimumArea:100,
  betaS:0.4,
});
assert.equal(pilesScaled.valid, true);
assert.equal(pilesScaled.checks.balanceOk, true);
assert.equal(pilesScaled.checks.momentBalanceOk, true);
assert.ok(Math.abs(pilesScaled.tieDemand - 3 * piles.tieDemand) < 1e-9);
assert.ok(Math.abs(pilesScaled.tieAsStm - 3 * piles.tieAsStm) < 1e-9);
assert.ok(Math.abs(pilesScaled.maxStrutDcr - 3 * piles.maxStrutDcr) < 1e-9);

const horizontalResidualOnly = STM.assess({
  ...base,
  reactionMode:'pile-group',
  h:240,
  ln:900,
  columnWidth:100,
  loadNodeDepth:20,
  bottomNodeWidth:80,
  supportBearingWidth:100,
  pileDiameter:100,
  pileReactions:'-360,123.74\n-180,123.74\n180,126.26\n360,126.26',
  tieCount:20,
  tieRows:3,
  tieMinimumArea:100,
  betaS:0.4,
});
assert.equal(horizontalResidualOnly.valid, true);
assert.equal(horizontalResidualOnly.checks.balanceOk, true);
assert.equal(horizontalResidualOnly.checks.momentBalanceOk, true);
assert.equal(horizontalResidualOnly.checks.symmetryOk, true);
assert.equal(horizontalResidualOnly.checks.horizontalBalanceOk, false);
assert.ok(horizontalResidualOnly.horizontalResidualPct > 1);
assert.equal(horizontalResidualOnly.status, 'blocked');
assert.ok(horizontalResidualOnly.failedItems.includes('水平力平衡'));

const pileAsymmetry = STM.assess({
  ...base,
  reactionMode:'pile-group',
  h:240,
  ln:900,
  supportBearingWidth:100,
  bottomNodeWidth:80,
  pileDiameter:100,
  pileReactions:'-360,120\n-180,125\n180,125\n360,130',
  tieCount:20,
  tieRows:3,
  tieMinimumArea:100,
});
assert.equal(pileAsymmetry.status, 'blocked');
assert.equal(pileAsymmetry.checks.symmetryOk, false);
assert.ok(pileAsymmetry.failedItems.includes('對稱反力拓樸'));

const beta075 = STM.assess({ ...piles.input, ...base,
  reactionMode:'pile-group', h:240, ln:900, columnWidth:100, loadNodeDepth:20,
  supportBearingWidth:100, bottomNodeWidth:80, pileDiameter:100,
  pileReactions:'-360,125\n-180,125\n180,125\n360,125',
  tieCount:20, tieRows:3, tieMinimumArea:100, betaS:0.75,
  distributionReinforcementComplies:false,
  reactionSourceConfirmed:true, twoDimensionalConfirmed:true, geometryConfirmed:true, anchorageConfirmed:true,
});
assert.equal(beta075.check2344Required, true);
assert.ok(beta075.lambdaS < 1);
assert.equal(beta075.checks.shearLimit2344Ok, false);
assert.ok(beta075.failedItems.includes('23.4.4 剪力條件'));

const beta075Distributed = STM.assess({
  ...base,
  reactionMode:'pile-group', h:240, ln:900, columnWidth:100, loadNodeDepth:20,
  supportBearingWidth:100, bottomNodeWidth:80, pileDiameter:100,
  pileReactions:'-360,125\n-180,125\n180,125\n360,125',
  tieCount:20, tieRows:3, tieMinimumArea:100, betaS:0.75,
  distributionReinforcementComplies:true,
  reactionSourceConfirmed:true, twoDimensionalConfirmed:true, geometryConfirmed:true, anchorageConfirmed:true,
});
assert.equal(beta075Distributed.lambdaS, 1);
assert.equal(beta075Distributed.checks.shearLimit2344Ok, true);

const pending = STM.assess({ ...base, geometryConfirmed:false, anchorageConfirmed:false });
assert.equal(pending.status, 'review');
assert.equal(pending.modelReviewItems.length, 2);

for (const [overrides, message] of [
  [{ fy:5600.01 }, 'STM 拉桿 fy 不得大於 5600 kgf/cm²'],
  [{ lambda:1.01 }, 'λ 不得大於 1.0'],
  [{ betaC:2.01 }, 'βc 不得大於 2.0'],
  [{ reactionMode:'typo-mode' }, 'reactionMode 僅支援 soil-uniform 或 pile-group'],
  [{ balanceTolerancePct:2.01 }, '垂直力平衡容許誤差不得大於 2.0%'],
  [{ symmetryTolerancePct:2.01 }, '反力對稱容許誤差不得大於 2.0%'],
  [{ momentTolerancePct:1.01 }, '力矩平衡容許誤差不得大於 1.0%'],
  [{ horizontalTolerancePct:1.01 }, '水平力平衡容許殘差不得大於 1.0%'],
]) {
  const outsideMaterialLimit = STM.assess({ ...base, ...overrides });
  assert.equal(outsideMaterialLimit.valid, false);
  assert.ok(outsideMaterialLimit.errors.includes(message));
}

assert.equal(STM.pileReactionFactor(60, 100), 1);
assert.equal(STM.pileReactionFactor(-60, 100), 0);
assert.ok(Math.abs(STM.pileReactionFactor(0, 100) - 0.5) < 1e-12);

assert.throws(() => STM.parsePileReactions('bad line'), /樁反力第 1 列/);

console.log('foundation deep-beam STM unit tests passed');
