const assert = require('assert');
const SlabEvaluator = require('./slab-evaluator.js');

function close(actual, expected, tolerance = 1e-12, label = 'value') {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}

assert.deepEqual(SlabEvaluator.getCoefficients('simple'), { pos:8, neg:Infinity });
assert.deepEqual(SlabEvaluator.getCoefficients('oneEnd'), { pos:14, neg:9 });
assert.deepEqual(SlabEvaluator.getCoefficients('bothEnd'), { pos:16, neg:11 });
assert.deepEqual(SlabEvaluator.getCoefficients('cantilever'), { pos:Infinity, neg:2 });

const continuous = SlabEvaluator.minimumThickness({
  stype:'one', Lx:300, Ly:650, fy:4200, supW:25, supportX:'bothEnd',
});
close(continuous.hmin, 275 / 28, 1e-12, 'continuous hmin');
assert.equal(continuous.branch, 'one-way');

const endSpan = SlabEvaluator.analyzeStripMoments({
  stype:'one', Lx:420, Ly:950, wu:1.6, supportX:'oneEnd', supportY:'simple',
});
close(endSpan.Xpos, 1.6 * 4.2 ** 2 / 14, 1e-12, 'end-span positive moment');
close(endSpan.Xneg, 1.6 * 4.2 ** 2 / 9, 1e-12, 'end-span negative moment');
close(endSpan.VuX, 1.6 * 4.2 / 2, 1e-12, 'end-span shear');

const twoWay = SlabEvaluator.analyzeStripMoments({
  stype:'two', Lx:350, Ly:500, wu:1.092, supportX:'bothEnd', supportY:'bothEnd',
});
close(twoWay.alphaX + twoWay.alphaY, 1, 1e-12, 'two-way load fractions');
close(twoWay.Xpos, SlabEvaluator.stripMoment({ wu:1.092, alpha:twoWay.alphaX, spanM:3.5, coefficient:16 }), 1e-12, 'two-way X moment');

assert.deepEqual(SlabEvaluator.temperatureRatio(2800), { rho:0.002, branch:'fy-le-2800' });
assert.deepEqual(SlabEvaluator.temperatureRatio(4200), { rho:0.0018, branch:'fy-le-4200' });
close(SlabEvaluator.temperatureRatio(5000).rho, 0.0018 * 4200 / 5000, 1e-12, 'high-strength temperature ratio');

const shear = SlabEvaluator.oneWayShearNoReinf({ fc:280, lambda:1, b:100, d:10, rhoW:0.01, phi:0.75 });
close(shear.lambdaS, 1, 1e-12, 'size effect');
close(shear.vc, 2.12 * shear.lambdaS * Math.cbrt(0.01) * Math.sqrt(280), 1e-12, 'vc');
close(shear.phiVc, 0.75 * shear.vc * 100 * 10 / 1000, 1e-12, 'phi Vc');

assert.throws(() => SlabEvaluator.minimumThickness({ stype:'one', Lx:0, Ly:500, fy:4200 }), /Lx:positive-finite-required/);
console.log('slab-evaluator.test.js: PASS');
