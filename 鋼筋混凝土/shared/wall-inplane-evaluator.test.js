const assert = require('assert');
require('./wall.js');
require('./pmsection.js');
require('./wall-inplane-evaluator.js');

const Evaluator = global.WallInplaneEvaluator;
const base = {
  fc:280, fy:4200, h:25, lw:500, lc:300, k:1, hw:1200,
  e:2, lambda:1, rhot:0.003, phiComp:0.65, phiShear:0.75,
  phiTen:0.90, pnMaxFactor:0.80,
  vBarArea:1.267, vBarDb:1.27, hBarDb:1.27, vSp:20, layers:2, cover:2,
  seismic:false, wallType:'bearing',
};

const capacity = Evaluator.computeCapacity(base);
assert.equal(capacity.status, 'evaluated');
assert.equal(capacity.eOk, true);
assert.ok(capacity.phiPn > 0 && capacity.phiVn > 0);

const pmCapacity = Evaluator.computePMCapacity(base);
assert.equal(pmCapacity.status, 'evaluated');
assert.ok(pmCapacity.pMin < 0 && pmCapacity.pMax > 0);
assert.ok(pmCapacity.barCount >= 2 && pmCapacity.actualSpacing <= base.vSp + 1e-9);

const pmCompression = Evaluator.pmScore(base, { P:80, M:30 });
assert.equal(pmCompression.status, 'evaluated');
assert.ok(pmCompression.phiMn > 0 && pmCompression.utilization > 0);

const pmTension = Evaluator.pmScore(base, { P:-40, M:10 });
assert.equal(pmTension.status, 'evaluated');
assert.ok(Number.isFinite(pmTension.utilization), 'tension demand is evaluated by the P-M envelope');

const derivedMoment = Evaluator.evaluatePMDemand(base, { P:80 });
assert.equal(derivedMoment.M, 1.6);

const pmAxialOut = Evaluator.pmScore(base, { P:pmCapacity.pMin - 50, M:0 });
assert.equal(pmAxialOut.status, 'axial-out-of-range');
assert.equal(pmAxialOut.scoreLabel, '軸力越界');
assert.ok(pmAxialOut.score >= 1e12);

const compression = Evaluator.compressionScore(base, { P:80, V:30 });
assert.equal(compression.status, 'evaluated');
assert.ok(compression.axialUtilization > 0 && compression.score === compression.axialUtilization);

const highCompression = Evaluator.compressionScore(base, { P:160, V:30 });
assert.ok(highCompression.score > compression.score, 'compression utilization follows the complete tuple P');

const tension = Evaluator.tensionScore(base, { P:-40, V:30 });
assert.equal(tension.status, 'tension-capacity-unresolved');
assert.equal(tension.scoreLabel, '拉力容量待確認');
assert.ok(tension.score >= 1e12);

const eccentric = Evaluator.compressionScore({ ...base, e:5 }, { P:80, V:30 });
assert.equal(eccentric.status, 'eccentricity-out-of-range');
assert.equal(eccentric.scoreLabel, '偏心超界');
assert.ok(eccentric.score >= 1e12);

const ordinaryShear = Evaluator.shearScore(base, { P:80, V:-50 });
assert.equal(ordinaryShear.status, 'evaluated');
assert.equal(ordinaryShear.shearDemand, 50);
assert.equal(ordinaryShear.shearControlUtilization, ordinaryShear.shearUtilization);

const specialShear = Evaluator.shearScore({ ...base, seismic:true, wallType:'shear', rhot:0.02 }, { P:80, V:400 });
assert.equal(specialShear.status, 'evaluated');
assert.ok(specialShear.shearLimitUtilization > 0);
assert.equal(specialShear.shearControlUtilization, Math.max(specialShear.shearUtilization, specialShear.shearLimitUtilization));

const invalid = Evaluator.shearScore({ ...base, phiShear:0 }, { P:80, V:30 });
assert.equal(invalid.status, 'capacity-unresolved');
assert.equal(invalid.scoreLabel, '容量待確認');

console.log('wall-inplane-evaluator.test.js: PASS');
