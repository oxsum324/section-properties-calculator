/* 鋼筋混凝土工具箱 — 共用 P-M 互制 (單軸矩形 / 圓形斷面, 應變相容法)
 *
 * 依台灣 112 年「混凝土結構設計規範」, 單位 cm / kgf。
 * 適用：柱、結構牆 (剪力牆) 面內撓曲 — 矩形接受任意縱筋分布，圓形採解析圓弓壓力區。
 *
 * 座標約定：
 *   y = 自「極限受壓纖維」沿斷面深度方向量起 (cm), 0 ≤ y ≤ h。
 *   b = 受壓邊寬 (cm, 與彎曲軸垂直)；h = 斷面深度 (cm, 沿彎曲方向)。
 *     - 柱繞主軸：b = 寬,  h = 深。
 *     - 剪力牆面內：b = 牆厚 tw,  h = 牆長 ℓw。
 *
 * 假設 (與 column.html 既有 P-M 引擎一致)：
 *   - 極限混凝土應變 εcu = 0.003。
 *   - Whitney 等值矩形應力方塊 a = β1·c, 應力 0.85·fc'。
 *   - 位於壓力方塊內的鋼筋扣除被排擠之混凝土應力 0.85·fc'。
 *   - 鋼筋彈塑性 (Es, ±fy 截斷)。
 *   - 強度折減 φ 依最外受拉鋼筋應變 εt 於 0.002~0.005 線性轉換 (規範 21.2.2)。
 *   - 軸壓設計上限 φPn,max = φc·α·Po (繫筋 α=0.80，螺箍 α=0.85)。
 *
 * 純函式, 同時支援瀏覽器 (window.PMSection) 與 Node (module.exports), 便於單元測試。
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) root.PMSection = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPS_CU = 0.003;
  const DEFAULTS = { Es: 2.04e6, phiTen: 0.90, phiComp: 0.65, PnMaxFactor: 0.80 };

  // β1 — 應力方塊深度比 (規範 2.7.3)
  function beta1Of(fc) {
    if (fc <= 280) return 0.85;
    if (fc >= 560) return 0.65;
    return 0.85 - 0.05 * (fc - 280) / 70;
  }

  // φ — 依最外受拉鋼筋應變 εt 線性轉換 (規範 21.2.2)
  function phiOf(epsT, phiComp, phiTen) {
    const pc = (phiComp == null) ? DEFAULTS.phiComp : phiComp;
    const pt = (phiTen == null) ? DEFAULTS.phiTen : phiTen;
    if (epsT >= 0.005) return pt;
    if (epsT <= 0.002) return pc;
    return pc + (pt - pc) * (epsT - 0.002) / 0.003;
  }

  // 斷面型式判讀。圓形以 D / diameter / b 代表直徑。
  function isCircleSection(sec) {
    return !!sec && (sec.shape === 'circle' || sec.type === 'circle' || sec.D != null || sec.diameter != null);
  }

  function circleDiameter(sec) {
    const D = sec.D != null ? sec.D : (sec.diameter != null ? sec.diameter : sec.b);
    if (!(D > 0)) throw new Error('circle section requires positive D');
    return D;
  }

  // 圓形壓力區：圓弓形封閉解析積分，與 column.html 既有引擎一致。
  function pointCircle(c, sec, mat) {
    const D = circleDiameter(sec);
    const R = D / 2;
    const bars = sec.bars || [];
    const fc = mat.fc, fy = mat.fy;
    const beta1 = (mat.beta1 == null) ? beta1Of(fc) : mat.beta1;
    const Es = mat.Es || DEFAULTS.Es;
    const a = Math.max(0, Math.min(beta1 * c, D));
    const arg = Math.max(0, 2 * R * a - a * a);
    const Aseg = (a <= 0) ? 0
      : R * R * Math.acos(Math.min(1, Math.max(-1, (R - a) / R)))
        - (R - a) * Math.sqrt(arg);
    const Sseg = (2 / 3) * Math.pow(arg, 1.5);
    const Cc = 0.85 * fc * Aseg;
    let Pn = Cc;
    let Mn = 0.85 * fc * Sseg;
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const epsS = EPS_CU * (c - bar.y) / c;
      let fs = epsS * Es;
      if (fs > fy) fs = fy;
      if (fs < -fy) fs = -fy;
      const inComp = bar.y < a;
      const Fnet = inComp ? (fs - 0.85 * fc) * bar.As : fs * bar.As;
      Pn += Fnet;
      Mn += Fnet * (R - bar.y);
    }
    return { Pn, Mn };
  }

  /* 給定中性軸深度 c (cm) → 標稱 (Pn, Mn)。
   *   sec = { b, h, bars:[{y, As}] }
   *   mat = { fc, fy, beta1, Es }
   * Mn 對斷面形心 (h/2) 取矩, 受壓側為正。回傳 kgf, kgf·cm。 */
  function point(c, sec, mat) {
    if (isCircleSection(sec)) return pointCircle(c, sec, mat);
    const b = sec.b, h = sec.h, bars = sec.bars || [];
    const fc = mat.fc, fy = mat.fy;
    const beta1 = (mat.beta1 == null) ? beta1Of(fc) : mat.beta1;
    const Es = mat.Es || DEFAULTS.Es;
    const a = Math.min(beta1 * c, h);
    const Cc = 0.85 * fc * b * a;                 // 混凝土壓力 (kgf)
    let Pn = Cc;
    let Mn = Cc * (h / 2 - a / 2);
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const epsS = EPS_CU * (c - bar.y) / c;
      let fs = epsS * Es;
      if (fs > fy) fs = fy;
      if (fs < -fy) fs = -fy;
      const inComp = bar.y < a;                   // 位於壓力方塊內 → 扣除排擠混凝土
      const Fnet = inComp ? (fs - 0.85 * fc) * bar.As : fs * bar.As;
      Pn += Fnet;
      Mn += Fnet * (h / 2 - bar.y);
    }
    return { Pn, Mn };
  }

  /* 完整 P-M 互制曲線。
   *   sec = { b, h, bars:[{y, As}] }
   *   mat = { fc, fy, beta1?, Es?, phiComp?, phiTen?, PnMaxFactor? }
   *   opt = { steps?, cMaxFactor?, cMinFactor?, cRatios? }
   * 回傳 (P 單位 tf, M 單位 tf·m)：
   *   { nominal:[{P,M,phi}], design:[{P,M}], phiPnMax, Po, Ast, dt, Ag, beta1, phiFactorComp }
   *   nominal: 標稱曲線 (Po → 純拉)；design: 已乘 φ 並套用 φPn,max 上限之設計封包。 */
  function curve(sec, matIn, opt) {
    const mat = Object.assign({}, DEFAULTS, matIn || {});
    if (mat.beta1 == null) mat.beta1 = beta1Of(mat.fc);
    const circle = isCircleSection(sec);
    const D = circle ? circleDiameter(sec) : null;
    const b = circle ? D : sec.b;
    const h = circle ? D : sec.h;
    const bars = sec.bars || [];
    const fc = mat.fc, fy = mat.fy;
    const Ag = circle ? Math.PI * D * D / 4 : b * h;
    const Ast = bars.reduce(function (s, r) { return s + r.As; }, 0);
    const Po = 0.85 * fc * (Ag - Ast) + fy * Ast;            // 標稱最大軸壓 (kgf)
    const phiPnMax = mat.phiComp * mat.PnMaxFactor * Po;     // 設計軸壓上限 (kgf)
    const refDepth = circle ? D : h;
    const dt = bars.length ? Math.max.apply(null, bars.map(function (r) { return r.y; })) : refDepth;
    const steps = (opt && opt.steps) || 120;
    const cMax = (opt && opt.cMaxFactor) || 5;
    const cMin = (opt && opt.cMinFactor) || 0.02;
    const cRatios = opt && Array.isArray(opt.cRatios) && opt.cRatios.length
      ? opt.cRatios.slice()
      : Array.from({ length: steps }, function (_, i) { return cMax - (cMax - cMin) * i / (steps - 1); });

    const nominal = [{ P: Po, M: 0, phi: mat.phiComp, c: cMax * refDepth }];  // 純軸壓端
    for (let i = 0; i < cRatios.length; i++) {
      const c = cRatios[i] * refDepth;
      const pt = point(c, sec, mat);
      const epsT = EPS_CU * (dt - c) / c;
      nominal.push({ P: pt.Pn, M: pt.Mn, phi: phiOf(epsT, mat.phiComp, mat.phiTen), c: c });
    }
    nominal.push({ P: -Ast * fy, M: 0, phi: mat.phiTen, c: 0 });   // 純拉端

    const design = nominal.map(function (p) {
      let phiP = p.P * p.phi;
      if (p.P > 0 && phiP > phiPnMax) phiP = phiPnMax;       // 套用軸壓上限
      return { P: phiP / 1000, M: Math.abs(p.M) * p.phi / 1e5 };
    });

    return {
      nominal: nominal.map(function (p) { return { P: p.P / 1000, M: Math.abs(p.M) / 1e5, phi: p.phi, c: p.c }; }),
      design: design,
      phiPnMax: phiPnMax / 1000,
      Po: Po / 1000,
      Ast: Ast,
      dt: dt,
      Ag: Ag,
      beta1: mat.beta1,
      shape: circle ? 'circle' : 'rect',
      refDepth: refDepth,
      phiFactorComp: mat.phiComp,
      PnMaxFactor: mat.PnMaxFactor,
    };
  }

  /* 在給定設計軸力 Pu (tf) 下, 由設計封包內插 φMn (tf·m)。
   * P 在 c 上單調 → 同一 Pu 唯一交點; 仍取最大 M 以涵蓋軸壓上限平台。 */
  function phiMnAtPu(design, Pu) {
    let best = null;
    for (let i = 0; i < design.length - 1; i++) {
      const A = design[i], B = design[i + 1];
      if ((A.P - Pu) * (B.P - Pu) <= 0 && A.P !== B.P) {
        const t = (Pu - A.P) / (B.P - A.P);
        const M = A.M + t * (B.M - A.M);
        if (best == null || M > best) best = M;
      }
    }
    return best == null ? 0 : best;
  }

  function pRange(points) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i].P;
      if (!isFinite(p)) continue;
      if (p < min) min = p;
      if (p > max) max = p;
    }
    return {
      min: min === Infinity ? NaN : min,
      max: max === -Infinity ? NaN : max,
    };
  }

  /* 在給定標稱軸力 P (tf) 下, 由標稱曲線內插中性軸深度 c (cm)。
   * 供特殊邊界構材應變法 (規範 18.7.6.2) 取用對應 Mn 之中性軸。 */
  function cAtP(nominal, P) {
    for (let i = 0; i < nominal.length - 1; i++) {
      const A = nominal[i], B = nominal[i + 1];
      if ((A.P - P) * (B.P - P) <= 0 && A.P !== B.P) {
        const t = (P - A.P) / (B.P - A.P);
        return A.c + t * (B.c - A.c);
      }
    }
    return NaN;
  }

  /* 檢核需求點 (Mu, Pu) 是否落於設計封包內。
   * 回傳 { phiMn, util, ok, axialOk, pMin, pMax, outOfRange }；
   * util = Mu / φMn (利用率)。 */
  function checkDemand(design, Pu, Mu) {
    const range = pRange(design);
    const tol = 1e-9;
    const axialOk = isFinite(range.min) && isFinite(range.max) && Pu >= range.min - tol && Pu <= range.max + tol;
    const phiMn = phiMnAtPu(design, Pu);
    const m = Math.abs(Mu);
    const util = phiMn > 0 ? m / phiMn : (m > 0 ? Infinity : 0);
    return {
      phiMn: phiMn,
      util: util,
      ok: axialOk && m <= phiMn + tol,
      axialOk: axialOk,
      pMin: range.min,
      pMax: range.max,
      outOfRange: !axialOk,
    };
  }

  return {
    EPS_CU: EPS_CU,
    beta1Of: beta1Of,
    phiOf: phiOf,
    isCircleSection: isCircleSection,
    point: point,
    pointCircle: pointCircle,
    curve: curve,
    phiMnAtPu: phiMnAtPu,
    pRange: pRange,
    cAtP: cAtP,
    checkDemand: checkDemand,
  };
});
