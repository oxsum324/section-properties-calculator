/* 鋼筋混凝土工具箱 — 共用撓曲強度模組
 *
 * 提供：
 *   Flexure.solveSection({shape, h, layers, fc, fy, beta1})
 *     嚴謹應變相容解 (二分法)，回傳 {c, a, Cc, armC, eqN, Mn, epsT_max, valid}
 *     - shape: { type:'rect', b }
 *              | { type:'T', bw, bf, hf, flangeOnComp:bool }
 *              | { type:'L', bw, bf, hf, flangeOnComp:bool }
 *       T/L 形壓力區計算相同 (Whitney 應力方塊僅取決於面積)；
 *       L 形翼板偏心影響 Ig/Mcr，由呼叫端自行處理。
 *     - layers: [{ y, As }]   y = 距壓力面深度 (cm)
 *     - 回傳 Mn 單位 = kgf·cm，對壓力面 y=0 取矩
 *
 *   Flexure.phiFlexure(epsT, fy)
 *     依 εt 線性內插 φ (拉控 0.9 / 過渡 / 壓控 0.65)
 *
 *   Flexure.designAsRect({ b, d, Mu_kgcm, fc, fy })
 *     單筋矩形斷面 (1 排底拉)，給 Mu 反算 As 需求 (cm²)
 *     收斂迭代法 — 適用板/單筋梁
 *
 *   Flexure.phiMnRect({ b, d, h, As, fc, fy })
 *     單筋矩形斷面快速計算 φMn (回傳 kgf·cm) 與 ε_t、φ
 *
 * 依賴: shared/common.js (PHI, ES, calcBeta1)
 */

(function (global) {
  'use strict';

  const Es = 2.04e6;        // kgf/cm²
  const eps_cu = 0.003;     // 混凝土極限應變

  // ─── 嚴謹應變相容解 (T/L/矩形通用) ─────────────
  function solveSection(opt) {
    const { shape: shapeIn, h, layers, fc, fy, beta1 } = opt;
    const shape = (typeof shapeIn === 'object' && shapeIn !== null && shapeIn.type)
                  ? shapeIn : { type:'rect', b: shapeIn };

    // 壓力區 [0, a] 之混凝土合力 Cc 與作用點 armC (距壓力面 y=0)
    const concreteRes = (a) => {
      if (a <= 0) return { Cc: 0, armC: 0 };
      if (shape.type === 'rect') {
        const Cc = 0.85 * fc * shape.b * a;
        return { Cc, armC: a / 2 };
      }
      // T/L 形 (壓力區幾何相同；L 形偏心由呼叫端處理 Ig/Mcr)
      if (shape.flangeOnComp) {
        if (a <= shape.hf) {
          const Cc = 0.85 * fc * shape.bf * a;
          return { Cc, armC: a / 2 };
        }
        const Cf = 0.85 * fc * shape.bf * shape.hf;
        const Cw = 0.85 * fc * shape.bw * (a - shape.hf);
        const Cc = Cf + Cw;
        const armC = (Cf * (shape.hf / 2) + Cw * (shape.hf + (a - shape.hf) / 2)) / Cc;
        return { Cc, armC };
      } else {
        // 翼緣在拉力面 → 壓力區僅腹板
        const Cc = 0.85 * fc * shape.bw * a;
        return { Cc, armC: a / 2 };
      }
    };

    const evalC = (c) => {
      const a = Math.min(beta1 * c, h);
      const { Cc, armC } = concreteRes(a);
      let Fnet = 0, Mr = 0, epsT_max = -Infinity;
      for (const L of layers) {
        if (!L || L.As <= 0) continue;
        const eps = eps_cu * (L.y - c) / c;     // 拉為正
        let fs = Es * eps;
        if (fs >  fy) fs =  fy;
        if (fs < -fy) fs = -fy;
        // 鋼筋若位於壓力塊內，需扣回排擠的混凝土
        const inComp = (L.y < a);
        const Fi = (fs + (inComp ? 0.85 * fc : 0)) * L.As;
        Fnet += Fi;
        Mr   += Fi * L.y;
        if (eps > epsT_max) epsT_max = eps;
      }
      const eqN = Fnet - Cc;                    // 軸力平衡
      const Mn  = -Cc * armC + Mr;              // 對 y=0 取矩
      return { c, a, Cc, armC, eqN, Mn, epsT_max };
    };

    // 二分法
    let lo = 0.01 * h, hi = 1.5 * h;
    const rLo = evalC(lo), rHi = evalC(hi);
    if (rLo.eqN * rHi.eqN > 0) {
      return { ...rHi, valid: false };
    }
    let c, r;
    for (let i = 0; i < 60; i++) {
      c = (lo + hi) / 2;
      r = evalC(c);
      if (r.eqN > 0) lo = c; else hi = c;
    }
    return { ...r, valid: true };
  }

  // ─── φ 內插 (拉控 / 過渡 / 壓控) ────────────────
  function phiFlexure(epsT, fy) {
    const epsY = fy / Es;
    const phiC = 0.65;
    const phiT = 0.90;
    if (epsT >= 0.005) return phiT;
    if (epsT <= epsY)  return phiC;
    return phiC + (phiT - phiC) * (epsT - epsY) / (0.005 - epsY);
  }

  // ─── 單筋矩形：給 Mu 反算 As 需求 ───────────────
  // Mu_kgcm 為已含 φ 的需求 (即 φMn ≥ Mu)
  // 解 As^2·(fy²/(1.7 fc' b)) − As·fy·d + Mu/φ = 0
  function designAsRect(opt) {
    const { b, d, Mu_kgcm, fc, fy } = opt;
    if (Mu_kgcm <= 0 || b <= 0 || d <= 0) return { As: 0, a: 0, converged: true };
    const phi = 0.9;                            // 假設拉控；若不足會於檢核反映
    const Mn = Mu_kgcm / phi;
    // 迭代: As_new = Mn / (fy·(d − a/2))
    let As = Mn / (fy * 0.9 * d);
    for (let i = 0; i < 30; i++) {
      const a = (As * fy) / (0.85 * fc * b);
      if (a >= d) return { As, a, converged: false };  // 超筋
      const AsNew = Mn / (fy * (d - a / 2));
      if (Math.abs(AsNew - As) < 1e-6) { As = AsNew; break; }
      As = AsNew;
    }
    const a = (As * fy) / (0.85 * fc * b);
    return { As, a, converged: true };
  }

  // ─── 單筋矩形：給 As 算 φMn ─────────────────────
  function phiMnRect(opt) {
    const { b, d, h, As, fc, fy } = opt;
    const beta1 = (typeof calcBeta1 === 'function') ? calcBeta1(fc)
                  : (fc <= 280 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 280) / 70));
    if (As <= 0) return { phiMn: 0, Mn: 0, a: 0, epsT: 0, phi: 0.9 };
    const sc = solveSection({
      shape: { type:'rect', b },
      h: h || (d * 1.15),
      layers: [{ y: d, As }],
      fc, fy, beta1
    });
    const phi = phiFlexure(sc.epsT_max, fy);
    return { phiMn: phi * sc.Mn, Mn: sc.Mn, a: sc.a, epsT: sc.epsT_max, phi };
  }

  // ─── As,min (規範 9.6.1.2 — 一般梁/單向板) ──────
  function asMinFlexure(b, d, fc, fy) {
    return Math.max(0.8 * Math.sqrt(fc) / fy, 14 / fy) * b * d;
  }

  global.Flexure = {
    solveSection,
    phiFlexure,
    designAsRect,
    phiMnRect,
    asMinFlexure,
  };
})(window);
