const assert = require('assert');
require('./beam-evaluator.js');

const BeamEvaluator = global.BeamEvaluator;
const shearBase = {
  sectionType:'rect', bw:35, bf:35, hf:0, h:60,
  fc:280, fyt:4200, d:54, Ag:2100, Av:1.426, s:10,
  rhoShear:0.012, phiShear:0.75, lambda:1,
  seismic:false, Ve:0, enableTorsion:false, torsionDesignStatus:'pending',
};
const base = { phiMnPos:100, phiMnNeg:80, shearBase };

const neutral = BeamEvaluator.computeShearState(shearBase, { Pu:0, Vu:30000, Tu:0 });
assert.equal(neutral.status, 'evaluated');
assert.ok(neutral.phiVn_eff > 0);

const compression = BeamEvaluator.computeShearState(shearBase, { Pu:120000, Vu:30000, Tu:0 });
const tension = BeamEvaluator.computeShearState(shearBase, { Pu:-120000, Vu:30000, Tu:0 });
assert.ok(compression.phiVn_eff > neutral.phiVn_eff, 'compression Pu increases the current beam Vc expression');
assert.ok(tension.phiVn_eff < neutral.phiVn_eff, 'tension Pu decreases the current beam Vc expression');

const seismic = BeamEvaluator.computeShearState({ ...shearBase, seismic:true, Ve:60000 }, { Pu:0, Vu:20000, Tu:0 });
assert.equal(seismic.shearDemand, 60000);
assert.equal(seismic.shearDemandSource, 'Ve');
assert.equal(seismic.forceVc0, true);
assert.equal(seismic.phiVn_eff, seismic.phiVs);

const positive = BeamEvaluator.evaluateDemand(base, { M:50, V:10, P:0, T:0 });
assert.equal(positive.status, 'evaluated');
assert.equal(positive.flexureDirection, 'positive');
assert.equal(positive.flexureUtilization, 0.5);

const negative = BeamEvaluator.evaluateDemand(base, { M:-40, V:10, P:0, T:0 });
assert.equal(negative.flexureDirection, 'negative');
assert.equal(negative.flexureUtilization, 0.5);
assert.ok(Number.isNaN(BeamEvaluator.flexureScore(base, { M:-40, V:10, P:0, T:0 }, 'positive')));
assert.equal(BeamEvaluator.flexureScore(base, { M:-40, V:10, P:0, T:0 }, 'negative').score, 0.5);

const torsionProbe = BeamEvaluator.computeShearState({ ...shearBase, enableTorsion:true }, { Pu:0, Vu:0, Tu:0 });
const belowT = torsionProbe.Tu_th * 0.5 / 1e5;
const aboveT = torsionProbe.Tu_th * 1.5 / 1e5;
const below = BeamEvaluator.evaluateDemand(base, { M:0, V:0, P:0, T:belowT });
assert.equal(below.status, 'evaluated');
assert.ok(Math.abs(below.torsionRatio - 0.5) < 1e-12);

const pending = BeamEvaluator.shearTorsionScore(base, { M:0, V:0, P:0, T:aboveT });
assert.equal(pending.status, 'torsion-review-required');
assert.equal(pending.scoreLabel, '扭力詳算待複核');
assert.ok(pending.score >= 1e12);

const approved = BeamEvaluator.shearTorsionScore({ ...base, shearBase:{ ...shearBase, torsionDesignStatus:'ok' } }, { M:0, V:0, P:0, T:aboveT });
assert.equal(approved.status, 'torsion-capacity-unresolved');
assert.equal(approved.scoreLabel, '扭力容量待確認');

const rejected = BeamEvaluator.shearTorsionScore({ ...base, shearBase:{ ...shearBase, torsionDesignStatus:'ng' } }, { M:0, V:0, P:0, T:aboveT });
assert.equal(rejected.status, 'torsion-not-approved');
assert.equal(rejected.scoreLabel, '扭力詳算不符');

const unresolved = BeamEvaluator.shearTorsionScore({ ...base, shearBase:{ ...shearBase, phiShear:0 } }, { M:0, V:10, P:0, T:0 });
assert.equal(unresolved.status, 'capacity-unresolved');
assert.equal(unresolved.scoreLabel, '容量待確認');

console.log('beam-evaluator.test.js: PASS');
