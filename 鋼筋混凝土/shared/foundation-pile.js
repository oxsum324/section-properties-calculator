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
    let Vu2Tf = 0;
    let excludedCount = 0;
    reactions.forEach((reaction, index) => {
      const distX = Math.abs(xs[index]) - c1d / 2;
      const distY = Math.abs(ys[index]) - c2d / 2;
      const insideCritical = distX <= 0 && distY <= 0;
      const distance = insideCritical ? 0 : Math.hypot(Math.max(0, distX), Math.max(0, distY));
      if (distance < pileD / 2) {
        excludedCount += 1;
      } else {
        Vu2Tf += Math.max(0, reaction);
      }
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
    const capMuLongTfm = controlRowL * Math.max(rowSpanL, pileD / 100) / 8;
    const capMuTransTfm = controlRowB * Math.max(rowSpanB, pileD / 100) / 8;
    const capMuTfm = Math.max(capMuLongTfm, capMuTransTfm);
    const capVuTf = Math.max(controlRowL / 2, controlRowB / 2, Math.max(rMax, 0));
    const capDesign = Flexure.designAsRect({ b:100, d, Mu_kgcm:capMuTfm * 1e5, fc, fy });
    if (!capDesign.converged || !Number.isFinite(capDesign.As)) throw new RangeError('pile-cap-flexure-design-not-converged');
    const capAsReq = Math.max(0.0018 * 100 * hc, capDesign.As);
    const capAsProv = Math.max(capSteelAreaTotal / 2, capAsReq);
    const capPhiMnTfm = Flexure.phiMnRect({ b:100, d, h:hc, As:capAsProv, fc, fy }).phiMn / 1e5;
    const capPhiVcTf = phiShear * 0.53 * lambda * Math.sqrt(fc) * 100 * d / 1000;
    const capVsTf = 11.4 * 2800 * d / 10 / 1000;
    const capPhiVnTf = capPhiVcTf + capVsTf;

    return {
      d, nPile, xs, ys, sumX2, sumY2, reactions, rMax, rMin, minSpacing,
      c1d, c2d, bo, betaC, vc, phiVc2Kgf, Vu2Tf, excludedCount,
      rowSpanL, rowSpanB, pileReactionRowsL, pileReactionRowsB, controlRowL, controlRowB,
      capMuLongTfm, capMuTransTfm, capMuTfm, capVuTf,
      capFlexuralAs:capDesign.As, capAsReq, capAsProv, capPhiMnTfm, capPhiVcTf, capVsTf, capPhiVnTf,
      okPunching:phiVc2Kgf / 1000 >= Vu2Tf,
      okCapFlex:capPhiMnTfm >= capMuTfm,
      okCapShear:capPhiVnTf >= capVuTf
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
    validateGroupAndCapInput,
    calculateGroupAndCap
  };
});
