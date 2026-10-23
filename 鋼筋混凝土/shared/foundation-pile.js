/* RC pile foundation and pile-cap production core.
 * Units: cm, m, tf, tf-m, kgf/cm2 unless a returned key states otherwise.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./flexure.js'));
  } else {
    root.FoundationPile = factory(root.Flexure);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (Flexure) {
  'use strict';

  function getLayerAtDepth(layers, depth) {
    return layers.find(layer => depth >= layer.from - 1e-9 && depth <= layer.to + 1e-9) || null;
  }

  function effectiveStressAtDepth(layers, depth) {
    if (!(depth > 0) || !layers.length) return 0;
    let stress = 0;
    for (const layer of layers) {
      const segment = Math.max(0, Math.min(depth, layer.to) - layer.from);
      if (segment > 0) stress += segment * layer.gammaEff;
      if (depth <= layer.to) break;
    }
    return stress;
  }

  const DEFAULT_AXIAL_RULES = Object.freeze({
    alphaSoft: 0.9,
    alphaMedium: 0.7,
    alphaStiff: 0.55,
    sandKDriven: 0.9,
    sandKBored: 0.65,
    deltaRatio: 0.75,
    sandFsCap: 8,
    denseSandFsCap: 12,
    tipCapDriven: 1800,
    tipCapBored: 750
  });

  function normalizeAxialRules(rules) {
    const merged = { ...DEFAULT_AXIAL_RULES, ...(rules || {}) };
    for (const [key, value] of Object.entries(merged)) {
      if (!Number.isFinite(Number(value)) || Number(value) <= 0) throw new RangeError(`invalid-pile-axial-rule:${key}`);
      merged[key] = Number(value);
    }
    return merged;
  }

  function integrateSkinFriction(layers, pileLength, pileDiameterM, pileInstall, rulesInput) {
    const rules = normalizeAxialRules(rulesInput);
    const perimeter = Math.PI * pileDiameterM;
    let Qs = 0;
    const segments = [];
    for (const layer of layers) {
      const segmentLength = Math.max(0, Math.min(pileLength, layer.to) - layer.from);
      if (segmentLength <= 0) continue;
      const midpoint = layer.from + segmentLength / 2;
      const sigmaMid = effectiveStressAtDepth(layers, midpoint);
      let fs;
      if (layer.type === 'clay' || layer.type === 'rock') {
        const alpha = layer.c <= 3 ? rules.alphaSoft : layer.c <= 6 ? rules.alphaMedium : rules.alphaStiff;
        fs = alpha * Math.max(layer.c, layer.type === 'rock' ? 8 : layer.c);
      } else {
        const earthCoefficient = pileInstall === 'driven' ? rules.sandKDriven : rules.sandKBored;
        const delta = Math.max(15, Math.min(35, layer.phi * rules.deltaRatio)) * Math.PI / 180;
        fs = Math.min(layer.N > 50 ? rules.denseSandFsCap : rules.sandFsCap, earthCoefficient * sigmaMid * Math.tan(delta));
      }
      const dQs = fs * perimeter * segmentLength;
      Qs += dQs;
      segments.push({ ...layer, segLen:segmentLength, fs, dQs, accumQs:Qs });
    }
    return { Qs, segments };
  }

  function calculateTipResistance(layers, pileLength, pileDiameterM, pileInstall, rulesInput) {
    const rules = normalizeAxialRules(rulesInput);
    const tipLayer = getLayerAtDepth(layers, pileLength);
    if (!tipLayer) {
      return { Qb: 0, qbUlt: 0, tipLayer: null, capApplied: false, capValue: null, criticalDepth: pileLength, sigmaCrit: 0 };
    }
    const area = Math.PI * pileDiameterM * pileDiameterM / 4;
    const criticalDepth = Math.min(pileLength, 20 * pileDiameterM);
    const sigmaCrit = effectiveStressAtDepth(layers, criticalDepth);
    let qbUlt;
    let capApplied = false;
    let capValue = null;
    if (tipLayer.type === 'clay' || tipLayer.type === 'rock') {
      qbUlt = 9 * Math.max(tipLayer.c, tipLayer.type === 'rock' ? 20 : tipLayer.c);
    } else {
      const phi = Math.max(0, Math.min(45, tipLayer.phi)) * Math.PI / 180;
      const Nq = Math.exp(Math.PI * Math.tan(phi)) * Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2);
      qbUlt = sigmaCrit * Nq;
      if (tipLayer.N > 50 || tipLayer.type === 'gravel') {
        capValue = pileInstall === 'driven' ? rules.tipCapDriven : rules.tipCapBored;
        if (qbUlt > capValue) {
          qbUlt = capValue;
          capApplied = true;
        }
      }
    }
    return { Qb: qbUlt * area, qbUlt, tipLayer, capApplied, capValue, criticalDepth, sigmaCrit };
  }

  function calculateAxialCapacity(input) {
    const layers = Array.isArray(input?.layers) ? input.layers : [];
    const pileLength = Number(input?.pileLength);
    const pileDiameterM = Number(input?.pileDiameterM);
    const safetyFactor = Number(input?.safetyFactor);
    if (!layers.length || !(pileLength > 0) || !(pileDiameterM > 0) || !(safetyFactor > 1)) {
      throw new RangeError('invalid-pile-capacity-input');
    }
    const skin = integrateSkinFriction(layers, pileLength, pileDiameterM, input.pileInstall, input.rules);
    const tip = calculateTipResistance(layers, pileLength, pileDiameterM, input.pileInstall, input.rules);
    const Qult = skin.Qs + tip.Qb;
    return { skin, tip, Qs: skin.Qs, Qb: tip.Qb, Qult, Qall: Qult / safetyFactor };
  }

  function pileReactionFactor(signedDistanceFromSection, pileDiameter) {
    const half = pileDiameter / 2;
    if (signedDistanceFromSection >= half) return 1;
    if (signedDistanceFromSection <= -half) return 0;
    return (signedDistanceFromSection + half) / pileDiameter;
  }

  function validateGroupAndCapInput(input) {
    const issues = [];
    const positive = ['fc', 'fy', 'phiShear', 'lambda', 'c1', 'c2', 'pileD', 'pileNL', 'pileNB', 'pileSL', 'pileSB', 'hc', 'db', 'capSteelAreaTotal'];
    for (const key of positive) {
      if (!Number.isFinite(Number(input?.[key])) || Number(input[key]) <= 0) issues.push(`${key}:positive-finite-required`);
    }
    if (!Number.isInteger(Number(input?.pileNL)) || !Number.isInteger(Number(input?.pileNB))) issues.push('pile-count:positive-integer-required');
    if (!Number.isFinite(Number(input?.PuTf)) || Number(input.PuTf) < 0) issues.push('PuTf:nonnegative-finite-required');
    if (!Number.isFinite(Number(input?.cover)) || Number(input.cover) < 0) issues.push('cover:nonnegative-finite-required');
    if (!Number.isFinite(Number(input?.MxTfm)) || !Number.isFinite(Number(input?.MyTfm))) issues.push('moment:finite-required');
    if (Number(input?.phiShear) > 1 || Number(input?.lambda) > 1) issues.push('strength-factor:maximum-one');
    if (Number(input?.hc) - Number(input?.cover) - Number(input?.db) <= 0) issues.push('effective-depth:positive-required');
    return issues;
  }

  function calculateGroupAndCap(input) {
    const issues = validateGroupAndCapInput(input);
    if (issues.length) throw new RangeError(`invalid-pile-group-cap-input:${issues.join(',')}`);
    if (!Flexure || typeof Flexure.designAsRect !== 'function' || typeof Flexure.phiMnRect !== 'function') {
      throw new Error('pile-cap-flexure-dependency-missing');
    }

    const fc = Number(input.fc);
    const fy = Number(input.fy);
    const phiShear = Number(input.phiShear);
    const lambda = Number(input.lambda);
    const c1 = Number(input.c1);
    const c2 = Number(input.c2);
    const pileD = Number(input.pileD);
    const pileNL = Number(input.pileNL);
    const pileNB = Number(input.pileNB);
    const pileSL = Number(input.pileSL);
    const pileSB = Number(input.pileSB);
    const PuTf = Number(input.PuTf);
    const MxTfm = Number(input.MxTfm);
    const MyTfm = Number(input.MyTfm);
    const hc = Number(input.hc);
    const cover = Number(input.cover);
    const db = Number(input.db);
    const capSteelAreaTotal = Number(input.capSteelAreaTotal);
    const d = hc - cover - db;
    const nPile = pileNL * pileNB;

    const xs = [];
    const ys = [];
    for (let i = 0; i < pileNL; i++) {
      for (let j = 0; j < pileNB; j++) {
        xs.push((i - (pileNL - 1) / 2) * pileSL);
        ys.push((j - (pileNB - 1) / 2) * pileSB);
      }
    }
    const sumX2 = xs.reduce((sum, value) => sum + value * value, 0);
    const sumY2 = ys.reduce((sum, value) => sum + value * value, 0);
    const MxTfCm = MxTfm * 100;
    const MyTfCm = MyTfm * 100;
    const reactions = xs.map((x, index) => (
      PuTf / nPile
      + (sumY2 > 0 ? MxTfCm * ys[index] / sumY2 : 0)
      + (sumX2 > 0 ? MyTfCm * x / sumX2 : 0)
    ));
    const rMax = Math.max(...reactions);
    const rMin = Math.min(...reactions);
    const minSpacing = Math.min(pileSL, pileSB);

    const c1d = c1 + d;
    const c2d = c2 + d;
    const bo = 2 * (c1d + c2d);
    const betaC = Math.max(c1, c2) / Math.min(c1, c2);
    const vc = Math.min(
      1.06 * lambda * Math.sqrt(fc),
      0.27 * (2 + 4 / betaC) * lambda * Math.sqrt(fc),
      0.27 * (40 * d / bo + 2) * lambda * Math.sqrt(fc)
    );
    const phiVc2Kgf = phiShear * vc * bo * d;
    // 規範 13.4.6.5（ACI 318 同條）：樁中心在臨界斷面外側 ≥ dpile/2 全額計入，
    // 在內側 ≥ dpile/2 不計入，其間以線性內插。signedDistance > 0 表示位於臨界斷面外側。
    let Vu2Tf = 0;
    let excludedCount = 0;
    let partialCount = 0;
    const punchingFactors = reactions.map((reaction, index) => {
      const distX = Math.abs(xs[index]) - c1d / 2;
      const distY = Math.abs(ys[index]) - c2d / 2;
      const insideCritical = distX <= 0 && distY <= 0;
      const signedDistance = insideCritical
        ? Math.max(distX, distY)
        : Math.hypot(Math.max(0, distX), Math.max(0, distY));
      const factor = pileReactionFactor(signedDistance, pileD);
      if (factor <= 0) excludedCount += 1;
      else if (factor < 1) partialCount += 1;
      Vu2Tf += Math.max(0, reaction) * factor;
      return factor;
    });

    const rowSpanL = pileNL > 1 ? (pileNL - 1) * pileSL / 100 : pileD / 100;
    const rowSpanB = pileNB > 1 ? (pileNB - 1) * pileSB / 100 : pileD / 100;
    const pileReactionRowsL = Array.from({ length:pileNL }, (_, i) => {
      let sum = 0;
      for (let j = 0; j < pileNB; j++) sum += Math.max(0, reactions[i * pileNB + j]);
      return sum;
    });
    const pileReactionRowsB = Array.from({ length:pileNB }, (_, j) => {
      let sum = 0;
      for (let i = 0; i < pileNL; i++) sum += Math.max(0, reactions[i * pileNB + j]);
      return sum;
    });
    const controlRowL = Math.max(...pileReactionRowsL);
    const controlRowB = Math.max(...pileReactionRowsB);

    // 樁帽撓曲：柱面臨界斷面（規範 13.2.7.1），取單側樁反力對柱面之力矩，全帽寬承擔。
    // 單向剪力：距柱面 d 之臨界斷面（規範 13.2.7.2），樁反力依 13.4.6.5 內插。
    const faceMoment = (coords, halfColumn) => {
      let positive = 0;
      let negative = 0;
      reactions.forEach((reaction, index) => {
        const arm = Math.abs(coords[index]) - halfColumn;
        if (!(arm > 0) || !(reaction > 0)) return;
        if (coords[index] > 0) positive += reaction * arm;
        else negative += reaction * arm;
      });
      return Math.max(positive, negative) / 100;
    };
    const oneWayShear = (coords, sectionDistance) => {
      let positive = 0;
      let negative = 0;
      reactions.forEach((reaction, index) => {
        if (!(reaction > 0)) return;
        const factor = pileReactionFactor(Math.abs(coords[index]) - sectionDistance, pileD);
        if (coords[index] > 0) positive += reaction * factor;
        else if (coords[index] < 0) negative += reaction * factor;
      });
      return Math.max(positive, negative);
    };
    const capMuLongTfm = faceMoment(xs, c1 / 2);
    const capMuTransTfm = faceMoment(ys, c2 / 2);
    const capMuTfm = Math.max(capMuLongTfm, capMuTransTfm);
    const capVuLongTf = oneWayShear(xs, c1 / 2 + d);
    const capVuTransTf = oneWayShear(ys, c2 / 2 + d);
    const capVuTf = Math.max(capVuLongTf, capVuTransTf);

    const capB = Number(input.capB);
    const capL = Number(input.capL);
    const capGeometryProvided = Number.isFinite(capB) && capB > 0 && Number.isFinite(capL) && capL > 0;
    const capAsProv = capSteelAreaTotal;
    let capFlexuralAs = NaN;
    let capAsReq = NaN;
    let capPhiMnTfm = NaN;
    let capPhiMnLongTfm = NaN;
    let capPhiMnTransTfm = NaN;
    let capPhiVcLongTf = NaN;
    let capPhiVcTransTf = NaN;
    let capPhiVnTf = NaN;
    let capFlexConverged = false;
    let okCapFlex = false;
    let okCapShear = false;
    if (capGeometryProvided) {
      // 長向主筋（沿 L）分布於帽寬 capB；橫向主筋（沿 B）分布於帽長 capL；每方向鋼筋量 = capSteelAreaTotal。
      const designLong = Flexure.designAsRect({ b:capB, d, Mu_kgcm:capMuLongTfm * 1e5, fc, fy });
      const designTrans = Flexure.designAsRect({ b:capL, d, Mu_kgcm:capMuTransTfm * 1e5, fc, fy });
      capFlexConverged = designLong.converged && designTrans.converged
        && Number.isFinite(designLong.As) && Number.isFinite(designTrans.As);
      const asMinLong = 0.0018 * capB * hc;
      const asMinTrans = 0.0018 * capL * hc;
      const capAsReqLong = capFlexConverged ? Math.max(asMinLong, designLong.As) : NaN;
      const capAsReqTrans = capFlexConverged ? Math.max(asMinTrans, designTrans.As) : NaN;
      capFlexuralAs = capFlexConverged ? Math.max(designLong.As, designTrans.As) : NaN;
      capAsReq = capFlexConverged ? Math.max(capAsReqLong, capAsReqTrans) : NaN;
      capPhiMnLongTfm = Flexure.phiMnRect({ b:capB, d, h:hc, As:capAsProv, fc, fy }).phiMn / 1e5;
      capPhiMnTransTfm = Flexure.phiMnRect({ b:capL, d, h:hc, As:capAsProv, fc, fy }).phiMn / 1e5;
      const longRatio = capPhiMnLongTfm > 0 ? capMuLongTfm / capPhiMnLongTfm : Infinity;
      const transRatio = capPhiMnTransTfm > 0 ? capMuTransTfm / capPhiMnTransTfm : Infinity;
      capPhiMnTfm = longRatio >= transRatio ? capPhiMnLongTfm : capPhiMnTransTfm;
      okCapFlex = capFlexConverged
        && capPhiMnLongTfm >= capMuLongTfm && capPhiMnTransTfm >= capMuTransTfm
        && capAsProv >= capAsReqLong && capAsProv >= capAsReqTrans;
      capPhiVcLongTf = phiShear * 0.53 * lambda * Math.sqrt(fc) * capB * d / 1000;
      capPhiVcTransTf = phiShear * 0.53 * lambda * Math.sqrt(fc) * capL * d / 1000;
      const vLongRatio = capVuLongTf / capPhiVcLongTf;
      const vTransRatio = capVuTransTf / capPhiVcTransTf;
      capPhiVnTf = vLongRatio >= vTransRatio ? capPhiVcLongTf : capPhiVcTransTf;
      okCapShear = capPhiVcLongTf >= capVuLongTf && capPhiVcTransTf >= capVuTransTf;
    }
    // 本核心未輸入樁帽剪力筋，Vs 不計入。
    const capPhiVcTf = capPhiVnTf;
    const capVsTf = 0;

    return {
      d, nPile, xs, ys, sumX2, sumY2, reactions, rMax, rMin, minSpacing,
      c1d, c2d, bo, betaC, vc, phiVc2Kgf, Vu2Tf, excludedCount, partialCount, punchingFactors,
      rowSpanL, rowSpanB, pileReactionRowsL, pileReactionRowsB, controlRowL, controlRowB,
      capMuLongTfm, capMuTransTfm, capMuTfm, capVuLongTf, capVuTransTf, capVuTf,
      capB, capL, capGeometryProvided, capFlexConverged,
      capFlexuralAs, capAsReq, capAsProv, capPhiMnTfm, capPhiMnLongTfm, capPhiMnTransTfm,
      capPhiVcLongTf, capPhiVcTransTf, capPhiVcTf, capVsTf, capPhiVnTf,
      okPunching:phiVc2Kgf / 1000 >= Vu2Tf,
      okCapFlex,
      okCapShear
    };
  }

  return {
    getLayerAtDepth,
    effectiveStressAtDepth,
    DEFAULT_AXIAL_RULES,
    normalizeAxialRules,
    integrateSkinFriction,
    calculateTipResistance,
    calculateAxialCapacity,
    pileReactionFactor,
    validateGroupAndCapInput,
    calculateGroupAndCap
  };
});
