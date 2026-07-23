const assert = require('assert');
require('./column-evaluator.js');

const ColumnEvaluator = global.ColumnEvaluator;
const pmDesignX = [
  { P:600, M:0 },
  { P:300, M:80 },
  { P:0, M:120 },
  { P:-100, M:0 },
];
const pmDesignY = [
  { P:600, M:0 },
  { P:300, M:60 },
  { P:0, M:90 },
  { P:-100, M:0 },
];
const base = {
  pmDesignX,
  pmDesignY,
  axisX:{ Pc:1000, Cm:0.6, isShort:false },
  axisY:{ Pc:800, Cm:0.6, isShort:false },
  swayMode:false,
  deltaS:1,
  biaxialOptions:{ marker:'same-section' },
};
const capacityAtPu = input => ({
  ratio:Math.hypot(input.Mx / input.phiMnAtPu, input.My / input.phiMnyAtPu),
  input,
});

assert.equal(ColumnEvaluator.interpAt(pmDesignX, 150, 'P', 'M'), 100);

const low = ColumnEvaluator.evaluateDemand(base, { Pu:100, Mx:-20, My:10 }, { capacityAtPu });
assert.equal(low.status, 'evaluated');
assert.ok(low.deltaX >= 1 && low.deltaY >= 1);
assert.equal(low.Mc, 20 * low.deltaX, 'signed Mx is converted to a directional magnitude before magnification');
assert.equal(low.Mcy, 10 * low.deltaY, 'signed My is converted to a directional magnitude before magnification');
assert.equal(low.surface.input.marker, 'same-section');
assert.equal(low.surface.input.Pu, 100);

const high = ColumnEvaluator.evaluateDemand(base, { Pu:500, Mx:20, My:10 }, { capacityAtPu });
assert.equal(high.status, 'evaluated');
assert.ok(high.deltaX > low.deltaX && high.deltaY > low.deltaY, 'Pu-dependent second-order magnification is recomputed per tuple');
assert.ok(high.utilization > low.utilization, 'capacity utilization reflects magnification and Pu-level capacity together');

const axialOut = ColumnEvaluator.limitStateScore(base, { Pu:700, Mx:1, My:1 }, { capacityAtPu });
assert.equal(axialOut.status, 'axial-out-of-range');
assert.equal(axialOut.score, Number.MAX_SAFE_INTEGER);
assert.equal(axialOut.scoreLabel, '軸力越界');

const unstable = ColumnEvaluator.limitStateScore(base, { Pu:600, Mx:20, My:10 }, { capacityAtPu });
assert.equal(unstable.status, 'magnification-unstable');
assert.equal(unstable.scoreLabel, '二階不穩定');
assert.equal(unstable.score, Number.MAX_SAFE_INTEGER);

const swayUnstable = ColumnEvaluator.limitStateScore({ ...base, swayMode:true, deltaS:Infinity }, { Pu:100, Mx:20, My:10 }, { capacityAtPu });
assert.equal(swayUnstable.status, 'magnification-unstable');
assert.equal(swayUnstable.scoreLabel, '二階不穩定');

const unresolved = ColumnEvaluator.limitStateScore(base, { Pu:100, Mx:20, My:10 }, {});
assert.equal(unresolved.status, 'capacity-unresolved');
assert.equal(unresolved.scoreLabel, '容量待確認');

const zero = ColumnEvaluator.limitStateScore({ ...base, axisX:{...base.axisX,isShort:true}, axisY:{...base.axisY,isShort:true} }, { Pu:100, Mx:0, My:0 }, { capacityAtPu });
assert.equal(zero.status, 'evaluated');
assert.equal(zero.score, 0);

console.log('column-evaluator.test.js: PASS');
