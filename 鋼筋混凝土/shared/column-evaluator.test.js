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

// ── E1 審查新增：6.6.4.5.4 細長柱最小彎矩 M2,min = Pu·(1.5 + 0.03h) cm ──
{
  const Pu = 200, h = 40, Pc = 293.6;
  const M2min = Pu * (1.5 + 0.03 * h) / 100;             // 5.4 tf·m
  const delta = 1.0 / (1 - Pu / (0.75 * Pc));            // M2,min 控制時 Cm 取 1.0
  const axis = { Pc, Cm:0.6, isShort:false, minEccCm:1.5 + 0.03 * h };
  const zeroM = ColumnEvaluator.magnifyAxis(axis, Pu, 0, 1);
  assert.ok(Math.abs(zeroM.moment - delta * M2min) < 1e-9, `Mc ${zeroM.moment} != ${delta * M2min}`);
  assert.equal(zeroM.m2minGoverns, true);
  // 計算彎矩大於 M2,min：維持原 Cm 與 Mu
  const bigM = ColumnEvaluator.magnifyAxis(axis, Pu, 20, 1);
  const deltaBig = Math.max(1, 0.6 / (1 - Pu / (0.75 * Pc)));
  assert.ok(Math.abs(bigM.moment - 20 * deltaBig) < 1e-9);
  assert.equal(bigM.m2minGoverns, false);
  // 短柱不放大、不套 M2,min
  const shortM = ColumnEvaluator.magnifyAxis({ ...axis, isShort:true }, Pu, 0, 1);
  assert.equal(shortM.moment, 0);
}
// M2,min 雙軸逐軸分別施加：不得兩軸同時套最小偏心
{
  const Pu = 100;
  const axisX = { Pc:1000, Cm:0.6, isShort:false, minEccCm:1.5 + 0.03 * 60 };
  const axisY = { Pc:800, Cm:0.6, isShort:false, minEccCm:1.5 + 0.03 * 40 };
  const r = ColumnEvaluator.evaluateDemand({ ...base, axisX, axisY }, { Pu, Mx:0, My:0 }, { capacityAtPu });
  const dX = 1 / (1 - Pu / 750), dY = 1 / (1 - Pu / 600);
  const mxMin = dX * Pu * 3.3 / 100, myMin = dY * Pu * 2.7 / 100;
  const phiMx = ColumnEvaluator.interpAt(pmDesignX, Pu, 'P', 'M'), phiMy = ColumnEvaluator.interpAt(pmDesignY, Pu, 'P', 'M');
  const expected = Math.max(mxMin / phiMx, myMin / phiMy);   // 單軸逐一施加
  assert.ok(Math.abs(r.utilization - expected) < 1e-9, `biaxial M2,min utilization ${r.utilization} != ${expected}`);
  assert.ok(Math.abs(r.Mc - mxMin) < 1e-9 && Math.abs(r.Mcy - myMin) < 1e-9);
}
console.log('column-evaluator.test.js: PASS');
