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
// 6.5.4：端跨第一內支承外側面剪力 = 1.15·wu·ℓn/2（E1 審查修正；原鎖定值 wu·ℓn/2 偏低 15%）
close(endSpan.VuX, 1.15 * 1.6 * 4.2 / 2, 1e-12, 'end-span shear at first interior support');

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
// ── E1 審查新增：獨立手算 ──
// 懸臂板：固定端剪力 = wu·ℓ（靜定，非 wu·ℓ/2）；彎矩 wu·ℓ²/2
{
  const cant = SlabEvaluator.analyzeStripMoments({ stype:'one', Lx:150, Ly:600, wu:1.5, supportX:'cantilever', supportY:'simple' });
  close(cant.Xneg, 1.5 * 1.5 ** 2 / 2, 1e-12, 'cantilever moment');
  close(cant.VuX, 1.5 * 1.5, 1e-12, 'cantilever shear = wu·L');
}
// 內跨 / 簡支：wu·ℓn/2
{
  const inner = SlabEvaluator.analyzeStripMoments({ stype:'one', Lx:300, Ly:700, wu:1.2, supportX:'bothEnd', supportY:'simple' });
  close(inner.VuX, 1.2 * 3.0 / 2, 1e-12, 'interior span shear');
}
// 無梁版最小厚度表 8.3.1.1（ACI 318-19 同表）：fy=2800 內版無柱頭板 ℓn/36（非 ℓn/33×(0.4+fy/7000)=ℓn/41.25）
{
  const flat = SlabEvaluator.minimumThickness({ stype:'flat', Lx:600, Ly:600, fy:2800, supW:50, panelPos:'interior' });
  close(flat.hmin, 550 / 36, 1e-9, 'flat interior fy2800 hmin');
  const flat42 = SlabEvaluator.minimumThickness({ stype:'flat', Lx:600, Ly:600, fy:4200, supW:50, panelPos:'interior' });
  close(flat42.hmin, 550 / 33, 1e-9, 'flat interior fy4200 hmin');
  // fy=5000 介於 4200 (ℓn/33) 與 5600 (ℓn/30) 之間線性內插（表 8.3.1.1 第三列為 fy=5600，112 年版 p.97）
  const flat50 = SlabEvaluator.minimumThickness({ stype:'flat', Lx:600, Ly:600, fy:5000, supW:50, panelPos:'interior' });
  close(flat50.hmin, 550 / 33 + (800 / 1400) * (550 / 30 - 550 / 33), 1e-9, 'flat interior fy5000 hmin');
  // 外版無邊梁、有柱頭板、fy=2800：ℓn/36
  const ext = SlabEvaluator.minimumThickness({ stype:'flatDrop', Lx:720, Ly:600, fy:2800, supW:60, panelPos:'extNoBeam' });
  close(ext.hmin, 660 / 36, 1e-9, 'flat drop extNoBeam fy2800 hmin');
}
console.log('slab-evaluator.test.js: PASS');
