/* 鋼筋混凝土工具箱 — RC 板純計算核心
 * 板厚、規範係數條帶內力、溫度筋比例與無剪力筋單向剪力。
 */
(function initSlabEvaluator(globalScope) {
  'use strict';

  const SUPPORT_COEFFICIENTS = Object.freeze({
    simple: Object.freeze({ pos:8, neg:Infinity }),
    oneEnd: Object.freeze({ pos:14, neg:9 }),
    bothEnd: Object.freeze({ pos:16, neg:11 }),
    cantilever: Object.freeze({ pos:Infinity, neg:2 }),
  });

  function finitePositive(value, key) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) throw new RangeError(`${key}:positive-finite-required`);
    return number;
  }

  function getCoefficients(support) {
    return SUPPORT_COEFFICIENTS[support] || SUPPORT_COEFFICIENTS.bothEnd;
  }

  function supportName(support) {
    return ({
      simple:'簡支代表跨', oneEnd:'端跨 (一端外端)', bothEnd:'內跨 (兩端連續)', cantilever:'懸臂',
    })[support] || support;
  }

  function minimumThickness(input) {
    const Lx = finitePositive(input.Lx, 'Lx');
    const Ly = finitePositive(input.Ly, 'Ly');
    const fy = finitePositive(input.fy, 'fy');
    const supW = Math.max(Number(input.supW) || 0, 0);
    const lnX = Math.max(Lx - supW, 0);
    const lnY = Math.max(Ly - supW, 0);
    const fyFactor1Way = 0.4 + fy / 7000;
    const fyFactor2Way = 0.8 + fy / 14000;
    const stype = input.stype;

    if (stype === 'one') {
      const factor = ({ simple:20, oneEnd:24, bothEnd:28, cantilever:10 })[input.supportX] || 28;
      const hmin = lnX / factor * fyFactor1Way;
      return {
        hmin, lnX, lnY, factor,
        formula:`ℓn/${factor}·(0.4+fy/7000) = ${lnX.toFixed(1)}/${factor}×${fyFactor1Way.toFixed(3)}`,
        reference:`規範 9.3.1.1 — 一向板 (${supportName(input.supportX)})`,
        branch:'one-way',
      };
    }

    const lnLong = Math.max(lnX, lnY);
    const lnShort = Math.min(lnX, lnY);
    const beta = lnShort > 0 ? lnLong / lnShort : 1;
    if (stype === 'two') {
      const alphaFm = Number(input.alphaFm) || 0;
      if (alphaFm <= 0.2) {
        const hmin = Math.max(lnLong / 30 * fyFactor1Way, 12.5);
        return {
          hmin, lnX, lnY, lnLong, lnShort, beta, denominator:30,
          formula:`α_fm=${alphaFm.toFixed(2)} ≤ 0.2 → 套用 8.3.1.1; max(ℓn/30·(0.4+fy/7000), 12.5)\n  = max(${lnLong.toFixed(1)}/30×${fyFactor1Way.toFixed(3)}, 12.5)`,
          reference:'規範 8.3.1.2(a) → 8.3.1.1 (α_fm ≤ 0.2)',
          branch:'two-way-low-alpha',
        };
      }
      if (alphaFm <= 2) {
        const denominator = 36 + 5 * beta * (alphaFm - 0.2);
        const hmin = Math.max(lnLong * fyFactor2Way / denominator, 12.5);
        return {
          hmin, lnX, lnY, lnLong, lnShort, beta, denominator,
          formula:`h = ℓn(0.8+fy/14000) / [36+5β(α_fm−0.2)]\n  = ${lnLong.toFixed(1)}×${fyFactor2Way.toFixed(3)} / [36+5×${beta.toFixed(2)}×${(alphaFm-0.2).toFixed(2)}]\n  = ${lnLong.toFixed(1)}×${fyFactor2Way.toFixed(3)} / ${denominator.toFixed(2)}; ≥ 12.5`,
          reference:'規範 8.3.1.2(b) (0.2 < α_fm ≤ 2.0)',
          branch:'two-way-mid-alpha',
        };
      }
      const denominator = 36 + 9 * beta;
      const hmin = Math.max(lnLong * fyFactor2Way / denominator, 9);
      return {
        hmin, lnX, lnY, lnLong, lnShort, beta, denominator,
        formula:`h = ℓn(0.8+fy/14000) / [36+9β]\n  = ${lnLong.toFixed(1)}×${fyFactor2Way.toFixed(3)} / [36+9×${beta.toFixed(2)}]\n  = ${lnLong.toFixed(1)}×${fyFactor2Way.toFixed(3)} / ${denominator.toFixed(2)}; ≥ 9`,
        reference:'規範 8.3.1.2(c) (α_fm > 2.0)',
        branch:'two-way-high-alpha',
      };
    }

    const hasDrop = stype === 'flatDrop';
    const panelPos = input.panelPos || 'interior';
    const factor = hasDrop ? (panelPos === 'extNoBeam' ? 33 : 36) : (panelPos === 'extNoBeam' ? 30 : 33);
    const positionName = ({ interior:'內版', extWithBeam:'外版(有邊梁)', extNoBeam:'外版(無邊梁)' })[panelPos] || panelPos;
    const absoluteMinimum = hasDrop ? 10 : 12.5;
    const hmin = Math.max(lnLong / factor * fyFactor1Way, absoluteMinimum);
    return {
      hmin, lnX, lnY, lnLong, lnShort, beta, factor, absoluteMinimum,
      formula:`${positionName}${hasDrop?'·有柱頭板':'·無柱頭板'}: max(ℓn/${factor}·(0.4+fy/7000), ${absoluteMinimum})\n  = max(${lnLong.toFixed(1)}/${factor}×${fyFactor1Way.toFixed(3)}, ${absoluteMinimum})`,
      reference:`規範 8.3.1.1 (${positionName}${hasDrop?'，有柱頭板':'，無柱頭板'})`,
      branch:hasDrop ? 'flat-drop' : 'flat',
    };
  }

  function stripMoment({ wu, alpha = 1, spanM, coefficient }) {
    if (!Number.isFinite(coefficient)) return 0;
    return Number(wu) * Number(alpha) * Number(spanM) ** 2 / coefficient;
  }

  function analyzeStripMoments(input) {
    const Lx = finitePositive(input.Lx, 'Lx') / 100;
    const Ly = finitePositive(input.Ly, 'Ly') / 100;
    const wu = finitePositive(input.wu, 'wu');
    const cfX = getCoefficients(input.supportX);
    const cfY = getCoefficients(input.supportY);
    if (input.stype === 'one') {
      return {
        lnX:Lx, lnY:Ly, mRatio:Lx / Ly, alphaX:1, alphaY:0,
        Xpos:stripMoment({ wu, spanM:Lx, coefficient:cfX.pos }),
        Xneg:stripMoment({ wu, spanM:Lx, coefficient:cfX.neg }),
        Ypos:0, Yneg:0, VuX:wu * Lx / 2, VuY:0,
      };
    }
    const mRatio = Lx / Ly;
    const m4 = mRatio ** 4;
    const alphaX = 1 / (1 + m4);
    const alphaY = m4 / (1 + m4);
    return {
      lnX:Lx, lnY:Ly, mRatio, alphaX, alphaY,
      Xpos:stripMoment({ wu, alpha:alphaX, spanM:Lx, coefficient:cfX.pos }),
      Xneg:stripMoment({ wu, alpha:alphaX, spanM:Lx, coefficient:cfX.neg }),
      Ypos:stripMoment({ wu, alpha:alphaY, spanM:Ly, coefficient:cfY.pos }),
      Yneg:stripMoment({ wu, alpha:alphaY, spanM:Ly, coefficient:cfY.neg }),
      VuX:alphaX * wu * Lx / 2,
      VuY:alphaY * wu * Ly / 2,
    };
  }

  function sizeEffectLambda(dCm) {
    const d = Number(dCm);
    if (!Number.isFinite(d) || d <= 0) return 1;
    return Math.min(1, Math.sqrt(2 / (1 + d / 25)));
  }

  function oneWayShearNoReinf({ fc, lambda = 1, b, d, rhoW, phi = 0.75 }) {
    const lambdaS = sizeEffectLambda(d);
    const rho = Math.max(0, Number(rhoW) || 0);
    const vc = rho > 0 ? 2.12 * lambdaS * Number(lambda) * Math.cbrt(rho) * Math.sqrt(Number(fc)) : 0;
    const Vc = vc * Number(b) * Number(d) / 1000;
    const phiVc = Number(phi) * Vc;
    return { lambdaS, rhoW:rho, vc, Vc, phiVc, phiVn:phiVc, Vs:0 };
  }

  function temperatureRatio(fyT) {
    const fy = finitePositive(fyT, 'fyT');
    if (fy <= 2800) return { rho:0.002, branch:'fy-le-2800' };
    if (fy <= 4200) return { rho:0.0018, branch:'fy-le-4200' };
    return { rho:Math.max(0.0018 * 4200 / fy, 0.0014), branch:'fy-gt-4200' };
  }

  const api = { getCoefficients, minimumThickness, stripMoment, analyzeStripMoments, sizeEffectLambda, oneWayShearNoReinf, temperatureRatio };
  globalScope.SlabEvaluator = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
