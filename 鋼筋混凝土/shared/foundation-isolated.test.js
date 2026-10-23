const assert = require('assert');
const FoundationIsolated = require('./foundation-isolated.js');
const Flexure = require('./flexure.js');

function near(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: finite result required`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

const input = {
  fc: 280, fy: 4200, B: 250, L: 250, hf: 60, c1: 60, c2: 60,
  cover: 7.5, dbX: 2.222, dbY: 2.222,
  AsXPerM: 100 / 18 * 3.879, AsYPerM: 100 / 18 * 3.879,
  PuTf: 184, phiShear: 0.75, lambda: 1
};

assert.deepEqual(FoundationIsolated.validateInput(input), [], 'default isolated footing input validates');
const result = FoundationIsolated.calculateStrength(input);
near(result.MuTfm, 33.212, 1e-10, 'default footing moment');
near(result.Vu1Kgf / 1000, 32.915392, 1e-10, 'default footing one-way shear demand');
// 獨立手算 表 22.5.5.1(c)（基腳無剪力筋 Av < Av,min），λs = 1（13.2.6.2(a) 淺基礎），Nu = 0：
// d = 60 − 7.5 − 2.222 = 50.278 cm；As = (100/18 × 3.879) × 2.5 = 21.55 × 2.5 = 53.875 cm²（X 向實配，b = B = 250）
// ρw = 53.875 / (250 × 50.278) = 0.0042862；ρw^(1/3) = 0.162439
// vc = 2.12 × 1 × 1 × 0.162439 × √280(16.7332) = 5.76242 kgf/cm²（< 1.33√280 = 22.255）
// φVc = 0.75 × 5.76242 × 250 × 50.278 = 54,323 kgf = 54.323 tf（舊式 0.53√fc′ 為 83.605 tf）
const isoRho = (100 / 18 * 3.879) * 2.5 / (250 * 50.278);
near(result.rhoW1, isoRho, 1e-12, 'default footing rho_w uses provided X tension steel over b·d');
near(result.lambdaS1, 1, 0, 'shallow footing waives size effect for one-way shear (13.2.6.2(a))');
near(result.phiVc1Kgf / 1000, 0.75 * 2.12 * 1 * 1 * Math.cbrt(isoRho) * Math.sqrt(280) * 250 * 50.278 / 1000, 1e-9, 'default footing one-way shear capacity follows Table 22.5.5.1(c)');
near(result.phiVc1Kgf / 1000, 54.323, 0.001, 'default footing one-way shear capacity hand value');
near(result.Vu2Kgf / 1000, 148.19731743590398, 1e-10, 'default footing punching demand');
// 衝剪 λs = 1（13.2.6.2(a)），vc 不變：bo = 4 × (60 + 50.278) = 441.112；vc = min(1.06, 0.27×6, 0.27×(40×50.278/441.112+2))√280
near(result.lambdaS2, 1, 0, 'shallow footing waives size effect for punching (13.2.6.2(a))');
near(result.phiVc2Kgf / 1000, 0.75 * Math.min(1.06, 0.53 * 3, 0.265 * (40 * 50.278 / 441.112 + 2)) * Math.sqrt(280) * 441.112 * 50.278 / 1000, 1e-9, 'default footing punching capacity');
near(result.AsReqX, 27, 1e-10, 'default footing X reinforcement demand remains finite');
near(result.AsReqY, 27, 1e-10, 'default footing Y reinforcement demand remains finite');

// Rectangular footing whose Y cantilever governs: one-way section width must be L (200 cm), not B.
// qu = 150 tf / 6 m2 = 2.5 kgf/cm2; armY = (300 - 50) / 2 = 125 cm; d = 60 - 7.5 - 1.905 = 50.595 cm.
const rect = FoundationIsolated.calculateStrength({ ...input, B:300, L:200, c1:50, c2:50, dbX:1.905, dbY:1.905, AsXPerM:15, AsYPerM:15, PuTf:150 });
near(rect.Vu1Kgf / 1000, 2.5 * 200 * (125 - 50.595) / 1000, 1e-9, 'rectangular footing one-way shear uses width L for Y cantilever');
// Y 向斷面受拉筋取 Y 向筋：As = 15 × 200/100 = 30 cm²；ρw = 30 / (200 × 50.595) = 0.0029647
// φVc = 0.75 × 2.12 × ρw^(1/3) × √280 × 200 × 50.595
assert.equal(rect.v1Direction, 'Y', 'rectangular footing Y cantilever governs');
near(rect.phiVc1Kgf / 1000, 0.75 * 2.12 * Math.cbrt(30 / (200 * 50.595)) * Math.sqrt(280) * 200 * 50.595 / 1000, 1e-9, 'rectangular footing one-way shear capacity uses width L and Y steel');

// 兩向 ρw 不同時，臂長較短方向可能控制：B = 300、L = 260、c = 50 → armX = 105、armY = 125；
// X 向 AsX = 40 cm²/m（ρwX = 40/(100·50.595) = 0.0079059），Y 向 AsY = 5 cm²/m（ρwY = 0.00098824）。
// qu = 150/7.8 = 19.2308 tf/m² = 1.92308 kgf/cm²；d = 50.595
// X：Vu = 1.92308×300×(105−50.595) = 31,388 kgf；φVc = 0.75×2.12×0.19921×16.7332×300×50.595 = 80,449 kgf → 0.390
// Y：Vu = 1.92308×260×(125−50.595) = 37,202 kgf；φVc = 0.75×2.12×0.09961×16.7332×260×50.595 = 34,861 kgf → 1.067（控制）
const mixed = FoundationIsolated.calculateStrength({ ...input, B:300, L:260, c1:50, c2:50, dbX:1.905, dbY:1.905, AsXPerM:40, AsYPerM:5, PuTf:150 });
const quMixed = 150 / 7.8 / 10;
const phiVcY = 0.75 * 2.12 * Math.cbrt(5 / (100 * 50.595)) * Math.sqrt(280) * 260 * 50.595;
assert.equal(mixed.v1Direction, 'Y', 'direction with lower rho_w governs when its Vu/phiVc ratio is larger');
near(mixed.Vu1Kgf, quMixed * 260 * (125 - 50.595), 1e-6, 'mixed-steel footing governing one-way shear demand');
near(mixed.phiVc1Kgf, phiVcY, 1e-6, 'mixed-steel footing governing one-way shear capacity');
near(mixed.phiVc1Kgf / 1000, 34.861, 0.001, 'mixed-steel footing governing one-way shear capacity hand value');

// 共用剪力函式：22.5.5.1.3 λs、22.5.5.1.1 上限與 Nu/6Ag ≤ 0.05fc′、ρw = 0 時 Vc = 0
near(FoundationIsolated.sizeEffectFactor(90.278), Math.sqrt(2 / (1 + 90.278 / 25)), 1e-15, 'size effect factor 22.5.5.1.3');
near(FoundationIsolated.sizeEffectFactor(90.278), 0.658585, 1e-6, 'size effect factor hand value d = 90.278 cm');
near(FoundationIsolated.sizeEffectFactor(20), 1, 0, 'size effect factor capped at 1 for d <= 25 cm');
near(FoundationIsolated.sizeEffectFactor(90.278, { waived:true }), 1, 0, 'size effect waived per 13.2.6.2');
const capped = FoundationIsolated.oneWayShearNoStirrups({ fc:280, lambda:1, bw:100, d:40, As:1200, lambdaS:1 });
// ρw = 1200/(100×40) = 0.3 → 2.12×0.3^(1/3)×√280 = 23.69 > 1.33√280 = 22.255 → 取上限
assert.equal(capped.capped, true, 'Vc upper limit 1.33λ√fc′bwd governs');
near(capped.Vc, 1.33 * Math.sqrt(280) * 100 * 40, 1e-9, 'Vc capped at 1.33λ√fc′bwd');
const axial = FoundationIsolated.oneWayShearNoStirrups({ fc:280, lambda:1, bw:100, d:40, As:20, lambdaS:1, NuKgf:1e6, AgCm2:5000 });
// Nu/6Ag = 1e6/30000 = 33.3 → 上限 0.05×280 = 14
near(axial.axialStress, 14, 1e-12, 'Nu/6Ag limited to 0.05fc′');
near(FoundationIsolated.oneWayShearNoStirrups({ fc:280, lambda:1, bw:100, d:40, As:0, lambdaS:1 }).Vc, 0, 0, 'no tension steel gives Vc = 0');

// 設計建議估算：As 不變時解 φ·2.12·(As/(b·d))^(1/3)·√fc′·b·d = qu·b·(arm − d)；預設例 qu = 2.944 kgf/cm²、arm = 95 cm、As = 21.55 cm²/m
const dReq = FoundationIsolated.requiredDepthOneWayNoStirrups({ quKgfCm2:2.944, arm:95, fc:280, lambda:1, phi:0.75, asPerCm:0.2155, waiveSizeEffect:true });
near(0.75 * 2.12 * Math.cbrt(0.2155 / dReq) * Math.sqrt(280) * dReq, 2.944 * (95 - dReq), 1e-6, 'required depth estimate satisfies phiVc = Vu with provided As held constant');
near(dReq, 35.965, 0.001, 'required depth estimate hand value');

const wrongKey = Flexure.designAsRect({ b: 250, d: 50, Mu: 1e6, fc: 280, fy: 4200 });
assert.equal(wrongKey.converged, false, 'wrong flexure demand key fails closed');
assert.ok(Number.isNaN(wrongKey.As), 'wrong flexure demand key cannot silently become zero reinforcement');
assert.throws(() => FoundationIsolated.calculateStrength({ ...input, hf: 8 }), /invalid-foundation-input/, 'invalid effective depth is rejected');

console.log('foundation isolated strength core tests passed.');
