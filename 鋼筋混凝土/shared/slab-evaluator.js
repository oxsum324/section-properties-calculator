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

  // 6.5.4 剪力係數 (Vu = k·wu·ℓn)：內跨 / 簡支 1/2；端跨第一內支承外側面 1.15/2；懸臂固定端 1.0
  const SHEAR_FACTORS = Object.freeze({ simple:0.5, oneEnd:1.15 / 2, bothEnd:0.5, cantilever:1.0 });
  function getShearFactor(support) {
    return SHEAR_FACTORS[support] || SHEAR_FACTORS.bothEnd;
  }

  // 表 8.3.1.1 無內梁雙向板最小厚度 ℓn/k（112 年版原 PDF p.97，fy 列 2800／4200／5600）；fy 介於表列值之間時線性內插 (fy < 2800 取 2800 列)
  const FLAT_THICKNESS_TABLE = Object.freeze([
    Object.freeze({ fy:2800, noDrop:{ extNoBeam:33, extWithBeam:36, interior:36 }, drop:{ extNoBeam:36, extWithBeam:40, interior:40 } }),
    Object.freeze({ fy:4200, noDrop:{ extNoBeam:30, extWithBeam:33, interior:33 }, drop:{ extNoBeam:33, extWithBeam:36, interior:36 } }),
    Object.freeze({ fy:5600, noDrop:{ extNoBeam:27, extWithBeam:30, interior:30 }, drop:{ extNoBeam:30, extWithBeam:33, interior:33 } }),
  ]);
  function flatThicknessRatio(fy, hasDrop, panelPos) {
    const key = hasDrop ? 'drop' : 'noDrop';
    const pos = ['extNoBeam', 'extWithBeam', 'interior'].includes(panelPos) ? panelPos : 'interior';
    const rows = FLAT_THICKNESS_TABLE.map(row => ({ fy:row.fy, k:row[key][pos], ratio:1 / row[key][pos] }));
    const f = Math.max(Number(fy), rows[0].fy);
    let lo = rows[0], hi = rows[1];
    if (f > rows[1].fy) { lo = rows[1]; hi = rows[2]; }
    const ratio = lo.ratio + (hi.ratio - lo.ratio) * (f - lo.fy) / (hi.fy - lo.fy);
    return { ratio, kEq:1 / ratio, k4200:rows[1].k, extrapolated:Number(fy) > rows[2].fy };
  }

  function supportName(support) {
    return ({
      simple:'簡支代表跨', oneEnd:'端跨 (一端外端)', bothEnd:'內跨 (兩端連續)', cantilever:'懸臂',
    })[support] || support;
  }

  function baseMinimumThickness(input) {
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
        const tbl = flatThicknessRatio(fy, false, 'extNoBeam');
        const hmin = Math.max(lnLong * tbl.ratio, 12.5);
        return {
          hmin, lnX, lnY, lnLong, lnShort, beta, denominator:tbl.kEq,
          formula:`α_fm=${alphaFm.toFixed(2)} ≤ 0.2 → 套用表 8.3.1.1 (外版無邊梁列，fy=${fy} 線性內插 k=${tbl.kEq.toFixed(2)}); max(ℓn/k, 12.5)\n  = max(${lnLong.toFixed(1)}/${tbl.kEq.toFixed(2)}, 12.5)`,
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
    const tbl = flatThicknessRatio(fy, hasDrop, panelPos);
    const factor = tbl.kEq;
    const positionName = ({ interior:'內版', extWithBeam:'外版(有邊梁)', extNoBeam:'外版(無邊梁)' })[panelPos] || panelPos;
    const absoluteMinimum = hasDrop ? 10 : 12.5;
    const hmin = Math.max(lnLong * tbl.ratio, absoluteMinimum);
    return {
      hmin, lnX, lnY, lnLong, lnShort, beta, factor, absoluteMinimum,
      formula:`${positionName}${hasDrop?'·有柱頭板':'·無柱頭板'}: 表 8.3.1.1 fy=${fy} 線性內插 k=${factor.toFixed(2)}${tbl.extrapolated?' (fy>5600 外插)':''}; max(ℓn/k, ${absoluteMinimum})\n  = max(${lnLong.toFixed(1)}/${factor.toFixed(2)}, ${absoluteMinimum})`,
      reference:`規範 8.3.1.1 (${positionName}${hasDrop?'，有柱頭板':'，無柱頭板'})`,
      branch:hasDrop ? 'flat-drop' : 'flat',
    };
  }

  function minimumThickness(input) {
    const result = baseMinimumThickness(input);
    if (input.stype !== 'two' || input.edgeType !== 'discontinuous') return result;
    if (!Number.isFinite(input.edgeAlpha) || input.edgeAlpha < 0 || input.edgeAlpha >= 0.8) return result;
    if (!['two-way-mid-alpha', 'two-way-high-alpha'].includes(result.branch)) return result;
    // §8.3.1.2.1 increases the formula result in Table 8.3.1.2(b) or (d).
    const baseFormula = result.lnLong * (0.8 + Number(input.fy) / 14000) / result.denominator;
    const floor = result.branch === 'two-way-mid-alpha' ? 12.5 : 9;
    const hmin = Math.max(1.1 * baseFormula, floor);
    return { ...result, hmin, edgeIncrease: true,
      formula: result.formula + `\n不連續板緣最低 α_f = ${input.edgeAlpha} < 0.8；max(1.10 × ${baseFormula.toFixed(3)}, ${floor}) = ${hmin.toFixed(3)} cm`,
      reference: result.reference + '、8.3.1.2.1',
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
        Ypos:0, Yneg:0, VuX:getShearFactor(input.supportX) * wu * Lx, VuY:0,
        shearFactorX:getShearFactor(input.supportX), shearFactorY:NaN,
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
      VuX:getShearFactor(input.supportX) * alphaX * wu * Lx,
      VuY:getShearFactor(input.supportY) * alphaY * wu * Ly,
      shearFactorX:getShearFactor(input.supportX),
      shearFactorY:getShearFactor(input.supportY),
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

  function interiorPunchingStress({ c1, c2, d, netShearTf, mxTfm, myTfm, phiVc }) {
    if (![c1, c2, d, phiVc].every(value => Number.isFinite(value) && value > 0)
        || ![netShearTf, mxTfm, myTfm].every(Number.isFinite) || netShearTf < 0) return null;
    const widthX = c1 + d, widthY = c2 + d;
    const area = 2 * (widthX + widthY) * d;
    const direct = netShearTf * 1000 / area;
    function transfer(span, transverse, moment) {
      const gammaF = 1 / (1 + 2 / 3 * Math.sqrt(span / transverse));
      const gammaV = 1 - gammaF;
      // R8.4.4.2.3, with the span measured in the direction of the stress gradient.
      const jc = (d * span ** 3 + span * d ** 3) / 6 + d * transverse * span ** 2 / 2;
      return { gammaF, gammaV, jc, flexuralMoment: gammaF * moment,
        edgeStress: gammaV * moment * 100000 * span / (2 * jc) };
    }
    const x = transfer(widthY, widthX, mxTfm);
    const y = transfer(widthX, widthY, myTfm);
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => ({
      label: `${sx > 0 ? '+' : '−'}X、${sy > 0 ? '+' : '−'}Y`,
      stress: direct + sy * x.edgeStress - sx * y.edgeStress,
    }));
    const maximumStress = Math.max(...corners.map(corner => Math.abs(corner.stress)));
    if (!Number.isFinite(maximumStress) || !Number.isFinite(maximumStress / phiVc)) return null;
    const governingCorners = corners.filter(corner => Math.abs(corner.stress) === maximumStress);
    return { area, direct, x, y, corners, governingCorners, maximumStress, phiVc,
      ratio: maximumStress / phiVc, ok: maximumStress <= phiVc };
  }

  function slabTransferGeometry({ c1, c2, h, d, xMinus, xPlus, yMinus, yPlus }) {
    if (![c1, c2, h, d].every(value => Number.isFinite(value) && value > 0)
        || ![xMinus, xPlus, yMinus, yPlus].every(value => Number.isFinite(value) && value >= 0)) return null;
    const closed = 2 * (c1 + c2 + 2 * d);
    const xEdge = Math.min(xMinus, xPlus);
    const yEdge = Math.min(yMinus, yPlus);
    const candidates = [
      { type:'單側 X 板緣', bo:c2 + d + 2 * (c1 + d / 2 + xEdge) },
      { type:'單側 Y 板緣', bo:c1 + d + 2 * (c2 + d / 2 + yEdge) },
      { type:'相鄰兩側板緣', bo:c1 + c2 + d + xEdge + yEdge },
      { type:'相對兩側 X 板緣', bo:2 * (c1 + xMinus + xPlus) },
      { type:'相對兩側 Y 板緣', bo:2 * (c2 + yMinus + yPlus) },
    ];
    const shortest = candidates.reduce((a, b) => a.bo <= b.bo ? a : b);
    if (!Number.isFinite(closed) || !Number.isFinite(shortest.bo)) return null;
    return {
      widthX:c1 + Math.min(1.5 * h, xMinus) + Math.min(1.5 * h, xPlus),
      widthY:c2 + Math.min(1.5 * h, yMinus) + Math.min(1.5 * h, yPlus),
      closed, shortest, interior:Math.min(xEdge, yEdge) >= d / 2 && shortest.bo > closed,
    };
  }

  function slabFlexuralTransfer({ stress, geometry, source, x, y }) {
    if (!stress) return null;
    function check(moment, width, { available, face }) {
      const demand = Math.abs(moment);
      const capacity = Number.isFinite(available) && available >= 0 ? available : null;
      const ready = geometry?.interior && source && (face === 'top' || face === 'bottom') && capacity !== null;
      // Keep mathematically equal values equal after the γf multiplication.
      const rounding = 2 * Number.EPSILON * demand;
      return { moment, width:width ?? null, demand, capacity, face,
        ok:demand === 0 ? true : ready ? demand - capacity <= rounding : null };
    }
    const xAxis = check(stress.x.flexuralMoment, geometry?.widthX, x);
    const yAxis = check(stress.y.flexuralMoment, geometry?.widthY, y);
    return { source, x:xAxis, y:yAxis,
      ok:xAxis.ok === false || yAxis.ok === false ? false : geometry?.interior && xAxis.ok === true && yAxis.ok === true ? true : null };
  }

  // 112 年版 24.4.3.2：收縮與溫度竹節鋼筋比不小於 0.0018，與 fyt 無關
  // （解說：舊版 fy > 4,200 之折減已取消）；fyt 仍用於伸展與錨定
  function temperatureRatio(fyT) {
    finitePositive(fyT, 'fyT');
    return { rho:0.0018, branch:'fixed-0.0018' };
  }

  const api = { getCoefficients, getShearFactor, flatThicknessRatio, minimumThickness, stripMoment, analyzeStripMoments, sizeEffectLambda, oneWayShearNoReinf, interiorPunchingStress, slabTransferGeometry, slabFlexuralTransfer, temperatureRatio };
  globalScope.SlabEvaluator = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
