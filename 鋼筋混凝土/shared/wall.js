/* 鋼筋混凝土工具箱 — 牆 (Wall) 共用公式
 *
 * 依台灣 112 年混凝土結構設計規範，單位 cm / kgf。
 * 所有函式皆為純函式，便於 wall.html / 計算書 / 其他工具共用。
 */
(function (root) {
  const Wall = {};

  // === 最小厚度 (規範 11.3) ===
  // type: 'bearing' | 'nonbearing' | 'basement' | 'shear'
  Wall.hmin = function (type, lc, lw) {
    if (type === 'bearing')      return Math.max(10, Math.min(lc, lw) / 25);
    if (type === 'nonbearing')   return Math.max(10, Math.min(lc, lw) / 30);
    if (type === 'basement')     return 20;
    /* shear */                  return Math.max(10, lc / 25, lw / 25);
  };

  // === 剪力強度係數 αc (規範 18.7.4.1) ===
  Wall.alphaC = function (hwlw) {
    if (hwlw <= 1.5) return 0.80;
    if (hwlw >= 2.0) return 0.53;
    return 0.80 + (0.53 - 0.80) * (hwlw - 1.5) / 0.5;
  };

  // === Vn 上限 ===
  // 單一牆段 (規範 18.7.4.4): 2.65·√fc'·Acv
  Wall.vnMaxSingle = function (fc, Acv) {
    return 2.65 * Math.sqrt(fc) * Acv;
  };
  // 全牆段總合 (規範 18.7.4.4): 2.12·λ·√fc'·ΣAcv
  Wall.vnMaxTotal = function (fc, lambda, sumAcv) {
    return 2.12 * lambda * Math.sqrt(fc) * sumAcv;
  };

  // === 結構牆 Vn (規範 18.7.4.1): Acv·(αc·λ·√fc' + ρt·fy) ===
  Wall.vn = function ({ Acv, alpha_c, lambda, fc, rhot, fy }) {
    return Acv * (alpha_c * lambda * Math.sqrt(fc) + rhot * fy);
  };

  // === 特殊結構牆設計剪力 (規範 18.7.3.1) ===
  // direct: Vu 已為設計剪力 Ve；amplified: Ve = Vuns + Ωv·ωv·VuEh。
  Wall.designShear = function ({ mode, Vu, Vuns, VuEh, omegaV, omegaW }) {
    if (mode === 'amplified') {
      return Math.abs(Number(Vuns) || 0) + Math.abs(Number(omegaV) || 0) * Math.abs(Number(omegaW) || 0) * Math.abs(Number(VuEh) || 0);
    }
    return Math.abs(Number(Vu) || 0);
  };

  // === 雙層鋼筋網判斷 ===
  // 須雙層: Vu > 0.5·φ·αc·λ·√fc'·Acv 或 hw/lw ≥ 2.0
  Wall.needTwoLayer = function ({ Vu, phi, alpha_c, lambda, fc, Acv, hwlw }) {
    const halfPhiVc = 0.5 * phi * alpha_c * lambda * Math.sqrt(fc) * Acv;
    return (Vu > halfPhiVc) || (hwlw >= 2.0);
  };

  // === 筋距上限 (規範 11.7.2) ===
  Wall.spacingLimits = function (h, lw) {
    return {
      general:           Math.min(3 * h, 45),  // min(3h, 45 cm)
      inplaneVertical:   lw / 3,               // 結構牆面內：縱筋
      inplaneHorizontal: lw / 5,               // 結構牆面內：橫筋
    };
  };

  // === 施工縫剪摩擦觸發門檻 (規範 22.9): Vu > 1.1·λ·√fc'·Acv ===
  Wall.shearFricLimit = function (lambda, fc, Acv) {
    return 1.1 * lambda * Math.sqrt(fc) * Acv;
  };

  Wall.shearFrictionSurface = function (surface, lambda) {
    const lam = Number(lambda) || 1.0;
    const map = {
      monolithic: {
        label: '整體澆置混凝土',
        mu: 1.4 * lam,
        maxGroup: 'rough',
      },
      roughened: {
        label: '已硬化混凝土面，粗糙至約 0.6 cm',
        mu: 1.0 * lam,
        maxGroup: 'rough',
      },
      not_roughened: {
        label: '已硬化混凝土面，未特別粗糙',
        mu: 0.6 * lam,
        maxGroup: 'other',
      },
      steel: {
        label: '乾淨無塗料結構鋼面，銲接鋼筋穿越界面',
        mu: 0.7 * lam,
        maxGroup: 'other',
      },
    };
    return map[surface] || map.roughened;
  };

  Wall.shearFrictionVnMax = function ({ fc, Ac, surface }) {
    const fcp = Number(fc) || 0;
    const area = Number(Ac) || 0;
    const info = Wall.shearFrictionSurface(surface, 1.0);
    if (info.maxGroup === 'rough') {
      return Math.min(0.2 * fcp * area, (33.6 + 0.08 * fcp) * area, 112 * area);
    }
    return Math.min(0.2 * fcp * area, 56 * area);
  };

  Wall.shearFrictionDesign = function ({ Vu, phi, mu, fy, Avf, fc, Ac, surface }) {
    const V = Math.max(0, Number(Vu) || 0);
    const ph = Math.max(0, Number(phi) || 0);
    const friction = Math.max(0, Number(mu) || 0);
    const fyDesign = Math.min(Math.max(0, Number(fy) || 0), 4200);
    const avf = Math.max(0, Number(Avf) || 0);
    const denom = ph * friction * fyDesign;
    const AvfReq = denom > 0 ? V / denom : Infinity;
    const VnBySteel = friction * avf * fyDesign;
    const VnMax = Wall.shearFrictionVnMax({ fc, Ac, surface });
    const Vn = Math.min(VnBySteel, VnMax);
    return {
      Vu: V,
      phi: ph,
      mu: friction,
      fyDesign,
      Avf: avf,
      AvfReq,
      VnBySteel,
      VnMax,
      Vn,
      phiVn: ph * Vn,
      phiVnMax: ph * VnMax,
      strengthOk: ph * Vn >= V - 1e-9,
      capOk: V <= ph * VnMax + 1e-9,
    };
  };

  // === Wall Pier 判定 (規範 18.7.1): Hw/ℓw ≥ 2.0 且 ℓw/bw ≤ 2.5 → 應依柱設計 ===
  Wall.isWallPier = function (hw, lw, bw) {
    if (lw <= 0 || bw <= 0) return false;
    return (hw / lw >= 2.0) && (lw / bw <= 2.5);
  };

  // === 簡易公式軸力 Pn (規範 11.5.3.1, e ≤ h/6): 0.55·fc'·Ag·[1−(k·ℓc/(32h))²] ===
  Wall.simplePn = function ({ fc, Ag, k, lc, h }) {
    return 0.55 * fc * Ag * (1 - Math.pow(k * lc / (32 * h), 2));
  };

  // === 最小鋼筋比 (表 11.6.1 + 18.7.2.4) ===
  // 回傳 { rholMin, rhotMin }
  Wall.minRho = function ({ seismic, isShearWall, needTwoLayer, hwlw, rhot }) {
    let rholMin, rhotMin;
    if (seismic || isShearWall) {
      rholMin = 0.0025;
      rhotMin = 0.0025;
    } else {
      rholMin = 0.0012;  // 竹節 fy ≥ 4200 且 ≤ #5
      rhotMin = 0.0020;
    }
    if (needTwoLayer) rhotMin = Math.max(rhotMin, 0.0025);
    return { rholMin, rhotMin };
  };

  // === 有效翼版寬 (規範 18.7.5.2) ===
  // b_eff = min(s/2, 0.25·hw, bf,act)，回傳含控制項
  Wall.effectiveFlange = function ({ half, hw, bfAct }) {
    const cands = [
      { v: half,       name: 's/2' },
      { v: 0.25 * hw,  name: '0.25hw' },
      { v: bfAct,      name: 'bf,act' },
    ];
    const min = cands.reduce((a, b) => a.v < b.v ? a : b);
    return { bEff: min.v, ctrl: min.name };
  };

  // === SBE 沿水平延伸 (壓應力 ≤ 0.15fc' 終止, 規範 18.7.6.3) ===
  // method: 'linear' | 'custom'
  // linear:  σ(x) = σmax·(1−x/lw) → x = lw·(1 − 0.15fc'/σmax)
  // custom:  pts = [{x, s}, ...]，線性插值找 σ = 0.15fc' 的位置
  Wall.sbeExtension = function ({ method, fc, sigmaMax, lw, points }) {
    const sigmaStop = 0.15 * fc;
    if (method === 'linear') {
      if (sigmaMax > sigmaStop && sigmaMax > 0) {
        return { x: lw * (1 - sigmaStop / sigmaMax), sigmaStop };
      }
      return { x: 0, sigmaStop };
    }
    const pts = (points || []).slice().sort((a, b) => a.x - b.x);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (a.s >= sigmaStop && b.s <= sigmaStop) {
        const t = (a.s - sigmaStop) / ((a.s - b.s) || 1);
        return { x: a.x + t * (b.x - a.x), sigmaStop };
      }
    }
    if (pts.length && pts[pts.length - 1].s > sigmaStop) {
      return { x: pts[pts.length - 1].x, sigmaStop };
    }
    return { x: 0, sigmaStop };
  };

  // === BE 觸發 (應變法, 規範 18.7.6.2): c ≥ ℓw/[600·(1.5·δu/hw)] ===
  Wall.beStrainTrigger = function (lw, duhw) {
    if (duhw <= 0) return Infinity;
    return lw / (600 * 1.5 * duhw);
  };

  // === BE 沿高延伸 (規範 18.7.6.2): max(ℓw, Mu/(4V))，V 採設計剪力 Ve ===
  Wall.beExtensionLength = function (lw, Mu_kgcm, V_kgf) {
    if (V_kgf <= 0) return lw;
    return Math.max(lw, Mu_kgcm / (4 * V_kgf));
  };

  // === BE 水平長度 (規範 18.7.6.4): max(c − 0.1·ℓw, c/2) ===
  Wall.beHorizontalLength = function (c, lw) {
    return Math.max(c - 0.1 * lw, c / 2);
  };

  // === SSW fc' ≤ 350 (規範 18.7.2.4) ===
  Wall.fcLimitSSW = 350;
  Wall.checkFcLimit = function (fc, isShearWall) {
    return !isShearWall || (fc <= Wall.fcLimitSSW);
  };

  root.Wall = Wall;
})(typeof window !== 'undefined' ? window : globalThis);
