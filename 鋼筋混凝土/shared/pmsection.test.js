/* shared/pmsection.js 單元測試 — 以閉合解驗證 P-M 互制引擎。
 * 執行：node 鋼筋混凝土/shared/pmsection.test.js
 */
const PM = require('./pmsection.js');

let pass = 0, fail = 0;
function ok(cond, title, detail) {
  if (cond) { pass++; console.log(`PASS | ${title}${detail ? ' | ' + detail : ''}`); }
  else { fail++; console.error(`FAIL | ${title}${detail ? ' | ' + detail : ''}`); }
}
function near(a, b, rel, title) {
  const tol = Math.abs(b) * (rel == null ? 0.02 : rel) + 1e-9;
  ok(Math.abs(a - b) <= tol, title, `got=${a.toFixed(3)} expect=${b.toFixed(3)} tol=${tol.toFixed(3)}`);
}
// 由 nominal 曲線內插 P=target 時的 M
function nominalMatP(nominal, P) {
  let best = null;
  for (let i = 0; i < nominal.length - 1; i++) {
    const A = nominal[i], B = nominal[i + 1];
    if ((A.P - P) * (B.P - P) <= 0 && A.P !== B.P) {
      const t = (P - A.P) / (B.P - A.P);
      const M = A.M + t * (B.M - A.M);
      if (best == null || M > best) best = M;
    }
  }
  return best == null ? 0 : best;
}


function circleBars(D, cover, n, As, db) {
  const R = D / 2;
  const r = R - cover - db / 2;
  const bars = [];
  for (let i = 0; i < n; i++) {
    const theta = (2 * Math.PI * i) / n;
    bars.push({ y: R - r * Math.cos(theta), As });
  }
  return bars;
}

// ── 1. β1 (規範 2.7.3) ──
near(PM.beta1Of(210), 0.85, 1e-9, 'β1(210)=0.85');
near(PM.beta1Of(280), 0.85, 1e-9, 'β1(280)=0.85');
near(PM.beta1Of(350), 0.85 - 0.05 * 70 / 70, 1e-9, 'β1(350)=0.80');
near(PM.beta1Of(560), 0.65, 1e-9, 'β1(560)=0.65');

// ── 2. φ 轉換 (規範 21.2.2) ──
near(PM.phiOf(0.006, 0.65, 0.90), 0.90, 1e-9, 'φ 拉力控制 (εt≥0.005)');
near(PM.phiOf(0.001, 0.65, 0.90), 0.65, 1e-9, 'φ 壓力控制 (εt≤0.002)');
near(PM.phiOf(0.0035, 0.65, 0.90), 0.65 + 0.25 * 0.5, 1e-9, 'φ 過渡區線性內插');

// ── 3. 純軸壓 Po (大 c → Pn=Po, Mn=0) ──
(function () {
  const fc = 280, fy = 4200, b = 30, h = 60;
  const bars = [{ y: 6, As: 10 }, { y: 54, As: 10 }];
  const Ast = 20, Ag = b * h;
  const PoExpect = (0.85 * fc * (Ag - Ast) + fy * Ast) / 1000;
  const res = PM.point(1000, { b, h, bars }, { fc, fy, beta1: 0.85 });
  near(res.Pn / 1000, PoExpect, 1e-3, '大 c 純軸壓 Pn=Po');
  ok(Math.abs(res.Mn) < 1, '對稱斷面純軸壓 Mn≈0', `Mn=${(res.Mn / 1e5).toFixed(4)} tf·m`);
  const cv = PM.curve({ b, h, bars }, { fc, fy });
  near(cv.Po, PoExpect, 1e-6, 'curve.Po 一致');
  near(cv.phiPnMax, 0.65 * 0.80 * PoExpect, 1e-6, 'φPn,max = φc·0.80·Po');
})();

// ── 4. 純撓曲 (P=0) 對單層受拉斷面比對閉合解 ──
(function () {
  const fc = 280, fy = 4200, b = 30, h = 60, d = 54, As = 20, beta1 = 0.85;
  const a = As * fy / (0.85 * fc * b);          // 等值方塊深度
  const MnExpect = As * fy * (d - a / 2) / 1e5;  // tf·m
  const cv = PM.curve({ b, h, bars: [{ y: d, As }] }, { fc, fy, beta1 }, { steps: 240 });
  const Mn0 = nominalMatP(cv.nominal, 0);
  near(Mn0, MnExpect, 0.02, '純撓曲 Mn 比對閉合解 (As·fy·(d−a/2))');
})();

// ── 5. checkDemand：封包內 OK、封包外 NG ──
(function () {
  const fc = 280, fy = 4200, b = 25, h = 400;   // 模擬剪力牆面內 (tw=25, ℓw=400)
  const bars = [
    { y: 8, As: 20.3 }, { y: 392, As: 20.3 },   // 端部集中筋
    { y: 100, As: 5 }, { y: 200, As: 5 }, { y: 300, As: 5 }, // 腹筋
  ];
  const cv = PM.curve({ b, h, bars }, { fc, fy });
  const Pu = 120; // tf
  const phiMn = PM.phiMnAtPu(cv.design, Pu);
  ok(phiMn > 0, 'phiMnAtPu 回傳正值', `φMn=${phiMn.toFixed(1)} tf·m @ Pu=${Pu}`);
  const inEnv = PM.checkDemand(cv.design, Pu, phiMn * 0.5);
  ok(inEnv.ok === true && inEnv.util <= 1, '需求點在封包內 → OK', `util=${inEnv.util.toFixed(2)}`);
  const outEnv = PM.checkDemand(cv.design, Pu, phiMn * 1.5);
  ok(outEnv.ok === false && outEnv.util > 1, '需求點超出封包 → NG', `util=${outEnv.util.toFixed(2)}`);
  const range = PM.pRange(cv.design);
  ok(range.max > 0 && range.min < 0, 'pRange 回傳設計軸力上下限', `P=${range.min.toFixed(1)}~${range.max.toFixed(1)} tf`);
  const overCompression = PM.checkDemand(cv.design, range.max + 50, 0);
  ok(overCompression.ok === false && overCompression.axialOk === false, 'Pu 超出軸壓封包且 Mu=0 → NG', `Pu=${(range.max + 50).toFixed(1)} > ${range.max.toFixed(1)}`);
  const overTension = PM.checkDemand(cv.design, range.min - 50, 0);
  ok(overTension.ok === false && overTension.axialOk === false, 'Pu 超出拉力封包且 Mu=0 → NG', `Pu=${(range.min - 50).toFixed(1)} < ${range.min.toFixed(1)}`);
})();

// ── 6. 設計封包單調性：P 由 Po 降至負值 (純拉) ──
(function () {
  const cv = PM.curve({ b: 25, h: 400, bars: [{ y: 8, As: 20 }, { y: 392, As: 20 }] }, { fc: 280, fy: 4200 });
  const first = cv.design[0].P, last = cv.design[cv.design.length - 1].P;
  ok(first > 0 && last < 0, '封包由軸壓端跨越至純拉端', `P: ${first.toFixed(1)} → ${last.toFixed(1)} tf`);
  ok(cv.design[0].P <= cv.phiPnMax + 1e-6, '頂點受 φPn,max 上限約束', `top=${cv.design[0].P.toFixed(1)} cap=${cv.phiPnMax.toFixed(1)}`);
})();


// ── 7. 圓形斷面壓力區：半圓閉合解 ──
(function () {
  const fc = 280, fy = 4200, D = 70, R = D / 2, beta1 = 0.85;
  const res = PM.pointCircle(R / beta1, { shape: 'circle', D, bars: [] }, { fc, fy, beta1 });
  const pExpect = 0.85 * fc * (Math.PI * R * R / 2) / 1000;
  const mExpect = 0.85 * fc * ((2 / 3) * Math.pow(R, 3)) / 1e5;
  near(res.Pn / 1000, pExpect, 1e-12, '圓形半圓壓力區 Pn 閉合解');
  near(res.Mn / 1e5, mExpect, 1e-12, '圓形半圓壓力區 Mn 閉合解');
})();

// ── 8. 圓柱曲線對齊柱頁既有回歸基準 ──
(function () {
  const ratios = [];
  for (let cR = 5; cR >= 0.05 - 1e-9; cR -= 0.05) ratios.push(Number(cR.toFixed(10)));
  const cv = PM.curve(
    { shape: 'circle', D: 70, bars: circleBars(70, 5, 8, 5.067, 2.54) },
    { fc: 280, fy: 4200, beta1: 0.85, phiComp: 0.75, phiTen: 0.90, PnMaxFactor: 0.85 },
    { cRatios: ratios }
  );
  near(cv.phiPnMax, 686.2910434732414, 1e-10, '圓柱 φPn,max 對齊柱頁基準');
  near(PM.phiMnAtPu(cv.design, 220), 71.04066971868404, 1e-10, '圓柱 φMn@Pu 對齊柱頁基準');
})();

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ HAS FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
