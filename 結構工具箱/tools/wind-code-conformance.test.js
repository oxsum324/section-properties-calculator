'use strict';
// 建築物耐風設計規範及解說（103 年版，內政部 103.12.03 公告）條文／表／圖之獨立手算回歸測試。
// 預期值一律取自規範條文、表列值或依條文公式手算之封閉解，不取自本工具輸出或 golden case。
// 執行：node 結構工具箱/tools/wind-code-conformance.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const corePath = path.resolve(__dirname, '../core/loads/wind.js');
const context = { window: {}, Math, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(corePath, 'utf8'), context, { filename: corePath });
const W = context.window.Wind;

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; } catch (error) { failures.push(`${name}: ${error.message}`); }
}
function near(actual, expected, tol, label) {
  assert.ok(Number.isFinite(actual), `${label}: actual not finite (${actual})`);
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: actual=${actual} expected=${expected} tol=${tol}`);
}

// ── §2.5 用途係數：第一～三類 1.1、第四類（臨時性設施）0.9、第五類（一般）1.0 ──
check('§2.5 importance factors', () => {
  const factors = Object.values(W.IMPORTANCE).map(item => item.factor).sort((a, b) => a - b);
  assert.deepStrictEqual(factors, [0.9, 1.0, 1.1, 1.1, 1.1]);
  assert.ok(Object.values(W.IMPORTANCE).every(item => item.factor <= 1.1), 'no factor may exceed 1.1');
});

// ── 式 (2.7)：K(z)=2.774(z/zg)^2α，z ≦ 5 m 時以 5 m 計（三種地況同一下限） ──
check('Eq 2.7 K(z) lower bound 5 m', () => {
  near(W.calcKz(3, 'C'), 2.774 * Math.pow(5 / 300, 0.30), 1e-12, 'C z=3');      // 0.8122
  near(W.calcKz(5, 'A'), 2.774 * Math.pow(5 / 500, 0.64), 1e-12, 'A z=5');      // 0.1456
  near(W.calcKz(10, 'A'), 2.774 * Math.pow(10 / 500, 0.64), 1e-12, 'A z=10');   // 0.2269
  near(W.calcKz(6, 'B'), 2.774 * Math.pow(6 / 400, 0.50), 1e-12, 'B z=6');      // 0.3397
  near(W.calcKz(10, 'C'), 1.000, 2e-3, 'C z=10 ≈ 1.0');
  near(W.calcKz(4.999, 'B'), W.calcKz(5.001, 'B'), 1e-4, 'continuity at 5 m');
  // q(z)=0.06 K(z) Kzt [I V]^2：A 地況 z=10、V=37.5、I=1.1 → 0.06×0.22688×(41.25)^2
  near(W.calcQz(10, 37.5, 'A', 1.1, 1.0).qz, 0.06 * 2.774 * Math.pow(0.02, 0.64) * 41.25 * 41.25, 1e-9, 'qz A');
});

// ── 式 (2.8) 與表 2.3(a)(b)(c)：K1/(H/Lh)、γ、μ ──
// 山脊：γ=3、μ上風=1.5、μ下風=1.5；懸崖：γ=2.5、μ上風=1.5、μ下風=4；山丘：γ=4、μ=1.5
check('Eq 2.8 Kzt ridge upwind (table 2.3 cross-check)', () => {
  const d = W.calcKztDetail('ridge', 'C', 30, 100, -50, 10); // H/Lh=0.3、x/Lh=-0.5、z/Lh=0.1
  near(d.K1, 0.435, 1e-12, 'K1');            // 表 2.3(a) 0.43
  near(d.K2, 1 - 50 / 150, 1e-12, 'K2');     // 表 2.3(b) 0.67
  near(d.K3, Math.exp(-0.3), 1e-12, 'K3');   // 表 2.3(c) 0.74
  near(d.Kzt, Math.pow(1 + 0.435 * (2 / 3) * Math.exp(-0.3), 2), 1e-12, 'Kzt'); // 1.4758
});
check('Eq 2.8 Kzt cliff downwind', () => {
  const d = W.calcKztDetail('cliff', 'AB', 30, 100, 100, 20); // x/Lh=1、z/Lh=0.2
  near(d.K2, 0.75, 1e-12, 'K2');             // 表 2.3(b) 懸崖 x/Lh=1.0 → 0.75
  near(d.K3, Math.exp(-0.5), 1e-12, 'K3');   // 表 2.3(c) 懸崖 z/Lh=0.2 → 0.61
  near(d.Kzt, Math.pow(1 + 0.225 * 0.75 * Math.exp(-0.5), 2), 1e-12, 'Kzt'); // 1.2152
});
check('Eq 2.8 Kzt hill crest / cliff upwind / H/Lh>0.5', () => {
  const hill = W.calcKztDetail('hill', 'C', 30, 100, 0, 20);
  near(hill.K3, Math.exp(-0.8), 1e-12, 'hill K3');  // 表 2.3(c) 山丘 z/Lh=0.2 → 0.45
  near(hill.Kzt, Math.pow(1 + 0.315 * Math.exp(-0.8), 2), 1e-12, 'hill Kzt');
  const cliffUp = W.calcKztDetail('cliff', 'C', 30, 100, -100, 0);
  near(cliffUp.K2, 1 - 1 / 1.5, 1e-12, 'cliff upwind K2'); // 表 2.3(b) x/Lh=-1 → 0.33
  const steep = W.calcKztDetail('ridge', 'AB', 60, 100, 60, 12); // H/Lh=0.6>0.5 → K1 用 0.5、Lh=2H=120
  near(steep.K1, 0.65, 1e-12, 'steep K1');
  near(steep.K2, 1 - 60 / (1.5 * 120), 1e-12, 'steep K2');
  near(steep.K3, Math.exp(-3 * 12 / 120), 1e-12, 'steep K3');
});

// ── 式 (2.13)～(2.19)：R² = (1/β)·Rn·Rh·RB·(0.53+0.47RL) ──
check('Eq 2.15 resonant response factor', () => {
  const g = W.calcGustFlex({ fn: 0.4, h: 100, B: 30, L: 30, terrain: 'B', beta: 0.02, V: 37.5 });
  // 獨立逐式手算
  const zBar = 60, c = 0.30, ell = 98, eps = 0.33, b = 0.62, alpha = 0.25;
  const Iz = c * Math.pow(10 / zBar, 1 / 6);
  const Lz = ell * Math.pow(zBar / 10, eps);
  const Q2 = 1 / (1 + 0.63 * Math.pow((30 + 100) / Lz, 0.63));
  const Vz = b * Math.pow(zBar / 10, alpha) * 37.5;
  const N1 = 0.4 * Lz / Vz;
  const Rn = 7.47 * N1 / Math.pow(1 + 10.3 * N1, 5 / 3);
  const Rj = eta => 1 / eta - (1 - Math.exp(-2 * eta)) / (2 * eta * eta);
  const Rh = Rj(4.6 * 0.4 * 100 / Vz), RB = Rj(4.6 * 0.4 * 30 / Vz), RL = Rj(15.4 * 0.4 * 30 / Vz);
  const R2 = (1 / 0.02) * Rn * Rh * RB * (0.53 + 0.47 * RL);
  const x = 2 * Math.log(3600 * 0.4);
  const gR = Math.sqrt(x) + 0.577 / Math.sqrt(x);
  const Gf = 1.927 * (1 + 1.7 * Iz * Math.sqrt(3.4 * 3.4 * Q2 + gR * gR * R2)) / (1 + 1.7 * 3.4 * Iz);
  near(g.R2, R2, 1e-9, 'R2');
  near(g.Gf, Gf, 1e-9, 'Gf');
});

// ── 式 (2.21)：W_Lz = 0.87 (L/B) W_Dz（h/√BL < 3） ──
check('Eq 2.21 cross-wind force', () => {
  const r = W.calcBuildingWind({ V: 37.5, terrain: 'C', I: 1, B: 20, L: 40, storyH: [3, 3, 3] });
  assert.ok(r.hBL < 3);
  r.stories.forEach((s, i) => near(r.crossWind[i].WL, 0.87 * (40 / 20) * s.F, 1e-9, `WL story ${i + 1}`));
  const r2 = W.calcBuildingWind({ V: 37.5, terrain: 'C', I: 1, B: 40, L: 20, storyH: [3, 3, 3] });
  r2.stories.forEach((s, i) => near(r2.crossWind[i].WL, 0.87 * 0.5 * s.F, 1e-9, `WL(L/B=0.5) story ${i + 1}`));
});

// ── 式 (2.23)：M_Tz = 0.28 (B·W_Dz)*，(B·W_Dz)* 取各向來風之較大值並適用於各向來風 ──
check('Eq 2.23 torsion envelope over wind directions', () => {
  const base = { V: 42.5, terrain: 'C', I: 1, storyH: [3.5, 3.5, 3.5, 3.5, 3.5, 3.5], eaveHeight: 21 };
  const rx = W.calcBuildingWind({ ...base, B: 20, L: 30 });
  const ry = W.calcBuildingWind({ ...base, B: 30, L: 20 });
  assert.strictEqual(typeof W.applyTorsionEnvelopeEq223, 'function', 'envelope helper exported');
  W.applyTorsionEnvelopeEq223(rx, ry, 20, 30);
  rx.stories.forEach((s, idx) => {
    const expected = 0.28 * Math.max(20 * s.F, 30 * ry.stories[idx].F);
    near(rx.torsion[idx].MT, expected, 1e-6, `X MT story ${idx + 1}`);
    near(ry.torsion[idx].MT, expected, 1e-6, `Y MT story ${idx + 1}`);
  });
});

// ── 表 2.17：部分封閉式 (GCpi) = ±1.146 ──
check('Table 2.17 GCpi', () => {
  near(W.GCPI.enclosed, 0.375, 0, 'enclosed');
  near(W.GCPI.partial, 1.146, 0, 'partial');
});

// ── 圖 3.1／3.2：(GCp) = ASCE 7-02 (GCp) × 2.083（§3.3 解說），A 以 0.93 / 1.86 / 9.3 / 46.5 m² 為折點 ──
const k = 2.083;
const gcp = (tbl, zone, A) => W.lookupGCp(W[tbl][zone], A);
check('Fig 3.1(a) walls h<=18', () => {
  near(gcp('GCP_WALL_LE18', 'zone4', 0.5).pos, 1.0 * k, 0.011, 'z4 pos small');
  near(gcp('GCP_WALL_LE18', 'zone4', 46.5).pos, 0.7 * k, 0.011, 'z4 pos large');
  near(gcp('GCP_WALL_LE18', 'zone4', 0.93).neg, -1.1 * k, 0.011, 'z4 neg small');
  near(gcp('GCP_WALL_LE18', 'zone5', 0.93).neg, -1.4 * k, 0.011, 'z5 neg small');
  near(gcp('GCP_WALL_LE18', 'zone5', 100).neg, -0.8 * k, 0.011, 'z5 neg large');
});
check('Fig 3.1(b) roof theta<=7 h<=18 (curves level off at 9.3 m2)', () => {
  near(gcp('GCP_ROOF_LE18', 'zone1', 9.3).pos, 0.2 * k, 0.011, 'pos at 9.3');
  near(gcp('GCP_ROOF_LE18', 'zone1', 46.5).neg, -0.9 * k, 0.011, 'z1 neg large');
  near(gcp('GCP_ROOF_LE18', 'zone2', 9.3).neg, -1.1 * k, 0.011, 'z2 neg at 9.3');
  near(gcp('GCP_ROOF_LE18', 'zone2', 46.5).neg, -1.1 * k, 0.011, 'z2 neg large');
  near(gcp('GCP_ROOF_LE18', 'zone3', 0.93).neg, -2.8 * k, 0.011, 'z3 neg small');
  near(gcp('GCP_ROOF_LE18', 'zone3', 46.5).neg, -1.1 * k, 0.011, 'z3 neg large');
  // 對數內插中點：A = √(0.93×9.3)
  near(gcp('GCP_ROOF_LE18', 'zone2', Math.sqrt(0.93 * 9.3)).neg, -(1.8 + 1.1) / 2 * k, 0.011, 'z2 log-mid');
});
check('Fig 3.2 walls and roof h>18', () => {
  near(gcp('GCP_WALL_GT18', 'zone4', 1.86).pos, 0.9 * k, 0.011, 'wall pos flat to 1.86');
  near(gcp('GCP_WALL_GT18', 'zone4', 46.5).pos, 0.6 * k, 0.011, 'wall pos large');
  near(gcp('GCP_WALL_GT18', 'zone4', 46.5).neg, -0.7 * k, 0.011, 'z4 neg large');
  near(gcp('GCP_WALL_GT18', 'zone5', 1.86).neg, -1.8 * k, 0.011, 'z5 neg flat to 1.86');
  near(gcp('GCP_WALL_GT18', 'zone5', 46.5).neg, -1.0 * k, 0.011, 'z5 neg large');
  near(gcp('GCP_ROOF_GT18', 'zone1', 0.93).neg, -1.4 * k, 0.011, 'roof z1 small');
  near(gcp('GCP_ROOF_GT18', 'zone1', 46.5).neg, -0.9 * k, 0.011, 'roof z1 large');
  near(gcp('GCP_ROOF_GT18', 'zone2', 0.93).neg, -2.3 * k, 0.011, 'roof z2 small');
  near(gcp('GCP_ROOF_GT18', 'zone2', 46.5).neg, -1.6 * k, 0.011, 'roof z2 large');
  near(gcp('GCP_ROOF_GT18', 'zone3', 0.93).neg, -3.2 * k, 0.011, 'roof z3 small');
  near(gcp('GCP_ROOF_GT18', 'zone3', 10).neg,
    -(3.2 - 0.9 * Math.log10(10 / 0.93) / Math.log10(46.5 / 0.93)) * k, 0.011, 'roof z3 at 10 m2');
  near(gcp('GCP_ROOF_GT18', 'zone3', 46.5).neg, -2.3 * k, 0.011, 'roof z3 large');
  // 牆區域 5 於 A=10 m²：1.86→46.5 對數內插
  near(gcp('GCP_WALL_GT18', 'zone5', 10).neg,
    -(1.8 - 0.8 * Math.log10(10 / 1.86) / Math.log10(46.5 / 1.86)) * k, 0.011, 'z5 neg at 10 m2');
});
check('Eq 3.2 C&C h>18 roof corner pressure', () => {
  // 地況 C、V=37.5、I=1、h=30、屋面區域 3、A=10 m²、封閉式
  const r = W.calcCC({ V: 37.5, terrain: 'C', I: 1, h: 30, zone: 'zone3', surface: 'roof', A: 10, encl: 'enclosed' });
  const qh = 0.06 * 2.774 * Math.pow(30 / 300, 0.30) * 37.5 * 37.5;
  const GCp = -(3.2 - 0.9 * Math.log10(10 / 0.93) / Math.log10(46.5 / 0.93)) * k;
  near(r.p_neg, qh * GCp - qh * 0.375, 0.011 * qh, 'p_neg');
});

// ── 表 2.11：平邊構材 2.0/1.8/1.6；圓形 D√q≦1.70：1.2/1.3/1.5；D√q＞1.70：0.8/0.9/1.1 ──
check('Table 2.11 porous frame Cf', () => {
  const cf = (phi, memberType, dSqrtQz) => W.lookupPorousFrameCf({ solidity: phi, memberType, dSqrtQz }).cf;
  assert.strictEqual(cf(0.05, 'flat'), 2.0);
  assert.strictEqual(cf(0.20, 'flat'), 1.8);
  assert.strictEqual(cf(0.50, 'flat'), 1.6);
  assert.strictEqual(cf(0.05, 'circular', 1.0), 1.2);
  assert.strictEqual(cf(0.20, 'circular', 1.70), 1.3);
  assert.strictEqual(cf(0.50, 'circular', 1.0), 1.5);
  assert.strictEqual(cf(0.05, 'circular', 3.0), 0.8);
  assert.strictEqual(cf(0.20, 'circular', 3.0), 0.9);
  assert.strictEqual(cf(0.50, 'circular', 3.0), 1.1);
});

// ── 表 2.15：桁架高塔（現行實作已符合；作為邊界回歸） ──
check('Table 2.15 lattice tower Cf (boundary regression)', () => {
  const cf = (phi, towerShape, memberShape = 'angle_flat', skewWind = false) =>
    W.lookupLatticeTowerCf({ solidity: phi, towerShape, memberShape, skewWind }).cf;
  near(cf(0.02, 'square'), 4.0, 1e-12, 'sq phi<0.025');
  near(cf(0.2, 'square'), 4.1 - 5.2 * 0.2, 1e-12, 'sq 0.2');
  near(cf(0.5, 'square'), 1.8, 1e-12, 'sq 0.5');
  near(cf(0.8, 'square'), 1.3 + 0.7 * 0.8, 1e-12, 'sq 0.8');
  near(cf(0.2, 'triangle'), 3.7 - 4.5 * 0.2, 1e-12, 'tri 0.2');
  near(cf(0.2, 'square', 'circular'), (4.1 - 5.2 * 0.2) * 0.67, 1e-12, 'sq round members');
  near(cf(0.4, 'square', 'angle_flat', true), (4.1 - 5.2 * 0.4) * (1 + 0.75 * 0.4), 1e-12, 'sq skew');
});

// ── 表 2.10：離地架高標示物以 M/N（較大邊／較小邊）查表；h=20 m、B=1 m → M/N=20 → Cf=1.5 ──
check('Table 2.10 elevated sign uses M/N (fence-sign page)', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '風力/wind-fence-sign.html'), 'utf8');
  const match = page.match(/const aspectRatio = ([^;]+);/);
  assert.ok(match, 'aspectRatio expression present');
  const aspectFn = new Function('atGround', 'B', 'h', `return ${match[1]};`);
  near(aspectFn(false, 1, 20), 20, 1e-12, 'elevated tall sign M/N');
  near(aspectFn(false, 45, 3), 15, 1e-12, 'elevated wide sign M/N');
  near(aspectFn(true, 16, 2), 8, 1e-12, 'ground fence B/h');
  near(W.lookupSignCf({ atGround: false, aspectRatio: aspectFn(false, 1, 20) }).cf, 1.5, 1e-12, 'Cf');
});

// ── 表 2.10 註 (2)：底緣離地 < 0.25×垂直向尺寸為位於地面上；表 2.13：R 依 2h/D（D 為最小水平尺寸） ──
check('Table 2.10 at-ground rule / Table 2.13 2h/D (sign-pole page)', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '風力/wind-sign-pole.html'), 'utf8');
  const ground = page.match(/const atGround = ([^;]+);/);
  const aspect = page.match(/const panelAspect = ([^;]+);/);
  const dMin = page.match(/const dMin = ([^;]+);/);
  const rCall = page.match(/W\.lookupAngularPrismR\(([^)]+)\)/);
  assert.ok(ground && aspect && dMin && rCall, 'page expressions present');
  const atGroundFn = new Function('panelBottom', 'panelHeight', `return ${ground[1]};`);
  assert.strictEqual(atGroundFn(0.4, 2), true, 'z_b=0.4 < 0.25×2 → at ground');
  assert.strictEqual(atGroundFn(0.5, 2), false, 'z_b=0.5 = 0.25×2 → above ground');
  const aspectFn = new Function('atGround', 'panelWidth', 'panelHeight', `return ${aspect[1]};`);
  near(aspectFn(false, 1, 12), 12, 1e-12, 'elevated tall panel M/N');
  const ratioFn = new Function('prismShape', 'width', 'h', `const dMin = ${dMin[1]}; return ${rCall[1]};`);
  near(ratioFn('rect_short', 1.0, 3), 6, 1e-12, '2h/D rect_short');      // R = 0.7
  near(ratioFn('rect_long', 1.0, 3), 12, 1e-12, '2h/D rect_long D=b/2'); // R = 0.8
  assert.strictEqual(W.lookupAngularPrismR(ratioFn('rect_short', 1.0, 3)).r, 0.7);
  assert.strictEqual(W.lookupAngularPrismR(ratioFn('rect_long', 1.0, 3)).r, 0.8);
});

// ── 表 2.10、表 2.12、圖 3.3（現行實作已符合；作為邊界回歸） ──
check('Table 2.10 / 2.12 / Fig 3.3 regression', () => {
  near(W.lookupSignCf({ atGround: true, aspectRatio: 15 }).cf, 1.5 + (1.75 - 1.5) * 0.5, 1e-12, 'sign ground ν=15');
  near(W.lookupSignCf({ atGround: false, aspectRatio: 13 }).cf, 1.3 + 0.1 * 0.5, 1e-12, 'sign above M/N=13');
  near(W.lookupTowerCf({ sectionType: 'square_face', hOverD: 16 }).cf, 1.4 + 0.6 * 0.5, 1e-12, 'tower h/D=16');
  const cpn = W.lookupOpenRoofCpn('monoslope', 'unblocked', 22.5, 'zone3', 1, 20); // a=2.0、A<a² → small
  near(cpn.pos, (3.6 + 5.2) / 2, 1e-12, 'Cpn pos θ=22.5');
  near(cpn.neg, (-3.8 - 5.0) / 2, 1e-12, 'Cpn neg θ=22.5');
});

if (failures.length) {
  console.error(`wind-code-conformance: ${failures.length} failed, ${passed} passed`);
  failures.forEach(item => console.error('  FAIL ' + item));
  process.exit(1);
}
console.log(`wind-code-conformance: all ${passed} checks passed`);
