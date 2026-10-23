'use strict';
// 覆工板力學回歸：以獨立閉合解（簡支梁影響線、AISC ASD 1989 式換算 kgf/cm²）核對 index.html 內嵌計算。
const assert = require('node:assert/strict');
const path = require('node:path');
const { replayDeckingExport } = require('./decking-result-replay.js');
const fixture = require('./test-fixtures/report-smoke.json');

const KSI = 70.307;
function run(mutate) {
  const payload = JSON.parse(JSON.stringify(fixture));
  if (mutate) mutate(payload);
  return replayDeckingExport(payload, { toolRoot: __dirname }).results;
}
function near(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} vs ${expected}`);
}

// 1) PC400 履帶 (c = 4.35 m) 於 L = 6.5 m 簡支小梁：最大剪力發生於履帶段緊靠支承，
//    V = ½·WT·L + Wc·c·(1 − c/2L)；Wc = 8.244×1.3 = 10.7172 tf/m → 履帶項 = 31.0201 tf（非 ½·Wc·c = 23.31 tf）。
{
  const r = run();
  const s = r.stringer;
  const Wc = 8.244 * 1.3, c = 4.35, L = 6.5;
  near(s.V2, 0.5 * s.WT * L + Wc * c * (1 - c / (2 * L)), 1e-9, 'stringer V2');
  near(Wc * c * (1 - c / (2 * L)), 31.020111, 1e-5, 'track shear term');
  assert.ok(s.Vmax >= s.V2 - 1e-12);
  // 跨長 ≤ 履帶長時退化為全跨均佈：V = ½(WT+Wc)L
  const short = run(p => { p.inputs.stringer.L = 4; }).stringer;
  near(short.V2, 0.5 * short.WT * 4 + 0.5 * Wc * 4, 1e-9, 'stringer V2 (L<=c)');
}

// 2) 充分側撐、半結實翼板：Fy = 3300 kgf/cm²，H300×300×10×15，b/2tf = 10 > 545/√3300 = 9.49
//    Fb = Fy[0.79 − 0.002(b/2tf)√(Fy/70.307)] = 3300×(0.79 − 0.002×10×6.851) = 2154.8 kgf/cm²（×β=1.33 → 2865.9）
{
  const r = run(p => { p.global.Fy = 3300; p.inputs.stringer.section = 'H300×300×10×15'; });
  assert.equal(r.stringer.flange.code, 2);
  near(r.stringer.Fb, 3300 * (0.79 - 0.002 * 10 * Math.sqrt(3300 / KSI)) * 1.33, 1e-6, 'semicompact Fb');
  assert.ok(r.stringer.Fb > 0.6 * 3300 * 1.33 - 1e-9 && r.stringer.Fb <= 0.66 * 3300 * 1.33 + 1e-9);
}

// 3) 未充分側撐：H300×300×10×15，Lt = 1000 cm，Fy = 2500：F1-8 = 12000×70.307/(1000×30/45) = 1265.5 kgf/cm² < 0.6Fy = 1500
{
  const r = run(p => { p.inputs.stringer.section = 'H300×300×10×15'; p.inputs.stringer.Lt = 1000; });
  assert.equal(r.stringer.brace.code, 30);
  near(r.stringer.Fb, 12000 * KSI / (1000 * 30 / 45) * 1.33, 1e-6, 'unbraced Fb (F1-8)');
  // Lt = 0（充分側撐、結實）仍為 0.66Fy·β
  const braced = run(p => { p.inputs.stringer.section = 'H300×300×10×15'; });
  near(braced.stringer.Fb, 0.66 * 2500 * 1.33, 1e-9, 'compact braced Fb');
}

console.log('decking mechanics regression OK (track shear, semicompact Fb, LTB Fb)');
