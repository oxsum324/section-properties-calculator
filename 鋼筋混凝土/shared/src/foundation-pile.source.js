/* RC pile foundation and pile-cap production core.
 * Units: cm, m, tf, tf-m, kgf/cm2 unless a returned key states otherwise.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./flexure.js'), require('./foundation-isolated.js'));
  } else {
    root.FoundationPile = factory(root.Flexure, root.FoundationIsolated);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (Flexure, FoundationShear) {
  'use strict';
  // 樁帽混凝土剪力（單向表 22.5.5.1(c)、雙向 22.6.5.2）與尺寸效應 λs 由 foundation-isolated.js 之共用函式提供；
  // 樁帽由基樁支撐，不屬 13.2.6.2 可免計 λs 之淺基礎或擋土牆，λs 依 22.5.5.1.3 計算。

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

  // 規範解說 5.5-3～5.5-7。兩個工作分量總和為樁頭服務壓力；q0 為極限單位端阻。
  function workingSettlement({ serviceLoad, toePercent, Qb, Qs, pileLength, pileArea_m2, pileD_m, fc,
    mode, xiInput, CpInput, CsInput, qoInput, qbUlt, allowable }) {
    const manual = mode === 'manual';
    const xi = manual ? xiInput : 0.67;
    const Cp = manual ? CpInput : 0.09;
    const Cs = manual && CsInput !== 0 ? CsInput : (0.93 + 0.16 * Math.sqrt(pileLength / pileD_m)) * Cp;
    const qo = manual && qoInput !== 0 ? qoInput : qbUlt;
    const Ep = 15000 * Math.sqrt(fc) * 10;
    const envelope = toePercent == null;
    const base = { serviceLoad, toePercent, envelope, xi, Cp, Cs, qo, Ep, mode };
    const pending = reason => ({ ...base, reason, ok:null, Wo_cm:null, minWo_cm:null, Ws_cm:null, Wpp_cm:null, Wps_cm:null });
    if (![serviceLoad, Qb, Qs].every(v => Number.isFinite(v) && v >= 0)) return pending('工作載重或極限分量待確認');
    if (![xi, Cp, Cs, qo, Ep, pileLength, pileArea_m2, pileD_m, allowable].every(v => Number.isFinite(v) && v > 0) || xi > 1) return pending('沉陷參數待確認');
    if (!envelope && !(Number.isFinite(toePercent) && toePercent >= 0 && toePercent <= 100)) return pending('指定端承比例須在 0～100%');
    const lo = Math.max(0, serviceLoad - Qs);
    const hi = Math.min(Qb, serviceLoad);
    const tol = 1e-10 * Math.max(1, serviceLoad);
    if (lo > hi + tol) return pending('工作載重超過端承與摩擦力合計上限');
    const specified = serviceLoad * toePercent / 100;
    if (!envelope && (specified < lo - tol || specified > hi + tol)) return pending('指定工作分量超過端承或摩擦力上限');
    function at(toe) {
      const shaft = serviceLoad - toe;
      const Ws_cm = 100 * (toe + xi * shaft) * pileLength / (pileArea_m2 * Ep);
      const Wpp_cm = 100 * Cp * toe / (pileD_m * qo);
      const Wps_cm = 100 * Cs * shaft / (pileLength * qo);
      return { toe, shaft, Ws_cm, Wpp_cm, Wps_cm, Wo_cm:Ws_cm + Wpp_cm + Wps_cm };
    }
    // Wo 對工作端承力為一次式，兩端點給出整個可行分配區間的極值。
    const a = at(envelope ? lo : specified);
    const b = envelope ? at(hi) : a;
    const [low, high] = a.Wo_cm <= b.Wo_cm ? [a,b] : [b,a];
    const ok = high.Wo_cm <= allowable ? true : low.Wo_cm > allowable ? false : null;
    return { ...base, ...high, low, minWo_cm:low.Wo_cm, ok, reason:ok === null ? '沉陷範圍跨越容許值，工作分配待確認' : '' };
  }

  function settlementRange(result) {
    if (!Number.isFinite(result?.Wo_cm)) return '待確認';
    const high = result.Wo_cm.toFixed(2);
    return result.envelope ? result.minWo_cm.toFixed(2) + '～' + high : high;
  }

  function settlementBasis(result) {
    if (!result || result.Wo_cm == null) return result?.reason || '沉陷資料待確認';
    const method = result.envelope ? '可行範圍（分項取上界同一組分配）' : '指定端承 ' + result.toePercent + '%';
    return '服務載重 ' + result.serviceLoad.toFixed(2) + ' tf；' + method + '；工作 Qb/Qs = ' +
      result.toe.toFixed(2) + ' / ' + result.shaft.toFixed(2) + ' tf；Wo = ' + settlementRange(result) + ' cm' +
      (result.reason ? '；' + result.reason : '');
  }

  function groupReactions({ pileNL, pileNB, pileSL, pileSB, axial, mx, my }) {
    if (![pileNL, pileNB].every(v => Number.isInteger(v) && v > 0) ||
        ![pileSL, pileSB].every(v => Number.isFinite(v) && v > 0) ||
        ![axial, mx, my].every(Number.isFinite)) throw new RangeError('樁群載重、間距或支數待確認');
    if ((pileNB === 1 && mx !== 0) || (pileNL === 1 && my !== 0)) throw new RangeError('單排樁沿此軸無法用軸力平衡所給彎矩');
    const xs = [], ys = [];
    for (let i = 0; i < pileNL; i++) {
      for (let j = 0; j < pileNB; j++) {
        xs.push((i - (pileNL - 1) / 2) * pileSL);
        ys.push((j - (pileNB - 1) / 2) * pileSB);
      }
    }
    const sumX2 = xs.reduce((sum, x) => sum + x*x, 0);
    const sumY2 = ys.reduce((sum, y) => sum + y*y, 0);
    const reactions = xs.map((x,i) => axial / xs.length + (sumY2 ? 100*mx*ys[i]/sumY2 : 0) + (sumX2 ? 100*my*x/sumX2 : 0));
    return { xs, ys, sumX2, sumY2, reactions, rMax:Math.max(...reactions), rMin:Math.min(...reactions) };
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
    if (!FoundationShear || typeof FoundationShear.oneWayShearNoStirrups !== 'function'
      || typeof FoundationShear.twoWayShearStressNoStirrups !== 'function' || typeof FoundationShear.sizeEffectFactor !== 'function') {
      throw new Error('pile-cap-shear-dependency-missing');
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

    const { xs, ys, sumX2, sumY2, reactions, rMax, rMin } = groupReactions({
      pileNL, pileNB, pileSL, pileSB, axial:PuTf, mx:MxTfm, my:MyTfm
    });
    const minSpacing = Math.min(pileSL, pileSB);

    const c1d = c1 + d;
    const c2d = c2 + d;
    const bo = 2 * (c1d + c2d);
    const betaC = Math.max(c1, c2) / Math.min(c1, c2);
    // 22.5.5.1.3 尺寸效應：樁帽不適用 13.2.6.2 免計，單向與雙向剪力皆乘 λs
    const lambdaS = FoundationShear.sizeEffectFactor(d);
    const punchingStress = FoundationShear.twoWayShearStressNoStirrups({ fc, lambda, lambdaS, betaC, alphaS: 40, bo, d });
    const vc = punchingStress.vc;
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
    let capShearLong = null;
    let capShearTrans = null;
    let capAsMinLong = NaN;
    let capAsMinTrans = NaN;
    let capAsMin = NaN;
    let capFlexConverged = false;
    let okCapFlex = false;
    let okCapFlexStrength = false;
    let okCapAsMin = false;
    let okCapShear = false;
    if (capGeometryProvided) {
      // 長向主筋（沿 L）分布於帽寬 capB；橫向主筋（沿 B）分布於帽長 capL；每方向鋼筋量 = capSteelAreaTotal。
      const designLong = Flexure.designAsRect({ b:capB, d, Mu_kgcm:capMuLongTfm * 1e5, fc, fy });
      const designTrans = Flexure.designAsRect({ b:capL, d, Mu_kgcm:capMuTransTfm * 1e5, fc, fy });
      capFlexConverged = designLong.converged && designTrans.converged
        && Number.isFinite(designLong.As) && Number.isFinite(designTrans.As);
      const asMinLong = 0.0018 * capB * hc;
      const asMinTrans = 0.0018 * capL * hc;
      capAsMinLong = asMinLong;
      capAsMinTrans = asMinTrans;
      capAsMin = Math.max(asMinLong, asMinTrans);
      const capAsReqLong = capFlexConverged ? Math.max(asMinLong, designLong.As) : NaN;
      const capAsReqTrans = capFlexConverged ? Math.max(asMinTrans, designTrans.As) : NaN;
      capFlexuralAs = capFlexConverged ? Math.max(designLong.As, designTrans.As) : NaN;
      capAsReq = capFlexConverged ? Math.max(capAsReqLong, capAsReqTrans) : NaN;
      capPhiMnLongTfm = Flexure.phiMnRect({ b:capB, d, h:hc, As:capAsProv, fc, fy }).phiMn / 1e5;
      capPhiMnTransTfm = Flexure.phiMnRect({ b:capL, d, h:hc, As:capAsProv, fc, fy }).phiMn / 1e5;
      const longRatio = capPhiMnLongTfm > 0 ? capMuLongTfm / capPhiMnLongTfm : Infinity;
      const transRatio = capPhiMnTransTfm > 0 ? capMuTransTfm / capPhiMnTransTfm : Infinity;
      capPhiMnTfm = longRatio >= transRatio ? capPhiMnLongTfm : capPhiMnTransTfm;
      // 撓曲判定分列：強度（φMn ≥ Mu）與最小鋼筋量（As ≥ 0.0018·b·h）各自標示；整體 okCapFlex 判定式不變。
      okCapFlexStrength = capPhiMnLongTfm >= capMuLongTfm && capPhiMnTransTfm >= capMuTransTfm;
      okCapAsMin = capAsProv >= asMinLong && capAsProv >= asMinTrans;
      okCapFlex = capFlexConverged
        && capPhiMnLongTfm >= capMuLongTfm && capPhiMnTransTfm >= capMuTransTfm
        && capAsProv >= capAsReqLong && capAsProv >= capAsReqTrans;
      // 單向剪力 表 22.5.5.1(c)：長向斷面寬 capB、橫向斷面寬 capL；ρw = 每方向實配 As/(b·d)；λs 依 22.5.5.1.3
      capShearLong = FoundationShear.oneWayShearNoStirrups({ fc, lambda, bw:capB, d, As:capAsProv, lambdaS, phi:phiShear });
      capShearTrans = FoundationShear.oneWayShearNoStirrups({ fc, lambda, bw:capL, d, As:capAsProv, lambdaS, phi:phiShear });
      capPhiVcLongTf = capShearLong.phiVc / 1000;
      capPhiVcTransTf = capShearTrans.phiVc / 1000;
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
      c1d, c2d, bo, betaC, lambdaS, vcA:punchingStress.vcA, vcB:punchingStress.vcB, vcC:punchingStress.vcC,
      vc, phiVc2Kgf, Vu2Tf, excludedCount, partialCount, punchingFactors,
      rowSpanL, rowSpanB, pileReactionRowsL, pileReactionRowsB, controlRowL, controlRowB,
      capMuLongTfm, capMuTransTfm, capMuTfm, capVuLongTf, capVuTransTf, capVuTf,
      capB, capL, capGeometryProvided, capFlexConverged,
      capFlexuralAs, capAsReq, capAsProv, capPhiMnTfm, capPhiMnLongTfm, capPhiMnTransTfm,
      capAsMinLong, capAsMinTrans, capAsMin,
      capRhoWLong:capShearLong ? capShearLong.rhoW : NaN,
      capRhoWTrans:capShearTrans ? capShearTrans.rhoW : NaN,
      capVcStressLong:capShearLong ? capShearLong.vcStress : NaN,
      capVcStressTrans:capShearTrans ? capShearTrans.vcStress : NaN,
      capPhiVcLongTf, capPhiVcTransTf, capPhiVcTf, capVsTf, capPhiVnTf,
      okPunching:phiVc2Kgf / 1000 >= Vu2Tf,
      okCapFlex,
      okCapFlexStrength,
      okCapAsMin,
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
    workingSettlement, settlementRange, settlementBasis, groupReactions,
    pileReactionFactor,
    validateGroupAndCapInput,
    calculateGroupAndCap
  };
});
