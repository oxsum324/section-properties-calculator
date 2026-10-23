/* RC isolated footing strength core.
 * Units: cm, kgf/cm2, tf, kgf, kgf-cm unless a returned key states otherwise.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./flexure.js'));
  } else {
    root.FoundationIsolated = factory(root.Flexure);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (Flexure) {
  'use strict';

  // ─── 基礎共用混凝土剪力強度（無剪力筋；112 年混凝土結構設計規範，kgf/cm² 制）────────
  // 獨立基腳（本檔）、聯合基腳／筏式基礎／擋土牆（foundation.html）與樁帽（foundation-pile.js）
  // 一律呼叫本節函式，不得另寫公式。
  // 13.2.6.2：(a) 透過直接承壓受土壤連續支撐之淺基礎、(b) 抵抗側向土壓力之擋土牆，
  //           單向與雙向剪力可忽略尺寸效應，取 λs = 1；樁帽由基樁支撐，不適用，λs 依 22.5.5.1.3。
  const SIZE_EFFECT_WAIVER_CLAUSE = '13.2.6.2';

  // 22.5.5.1.3：λs = √(2/(1 + d/25)) ≤ 1（d 以 cm 計）
  function sizeEffectFactor(d, options = {}) {
    const dCm = Number(d);
    if (!(dCm > 0)) throw new RangeError('size-effect:positive-depth-required');
    if (options && options.waived === true) return 1;
    return Math.min(1, Math.sqrt(2 / (1 + dCm / 25)));
  }

  // 表 22.5.5.1(c)（Av < Av,min）：Vc = (2.12 λs λ ρw^(1/3) √fc′ + Nu/6Ag) bw d，Vc ≥ 0；
  // 22.5.5.1.1：Vc ≤ 1.33 λ √fc′ bw d，Nu/6Ag ≤ 0.05 fc′。ρw = As/(bw d)。單位 kgf、cm。
  function oneWayShearNoStirrups(input) {
    const fc = Number(input?.fc);
    const lambda = Number(input?.lambda);
    const bw = Number(input?.bw);
    const d = Number(input?.d);
    const As = Number(input?.As);
    const lambdaS = Number(input?.lambdaS);
    const NuKgf = input?.NuKgf == null ? 0 : Number(input.NuKgf);
    const AgCm2 = input?.AgCm2 == null ? NaN : Number(input.AgCm2);
    const issues = [];
    for (const [key, value] of [['fc', fc], ['bw', bw], ['d', d]]) {
      if (!Number.isFinite(value) || value <= 0) issues.push(`${key}:positive-finite-required`);
    }
    if (!Number.isFinite(lambda) || lambda <= 0 || lambda > 1) issues.push('lambda:range-0-1');
    if (!Number.isFinite(lambdaS) || lambdaS <= 0 || lambdaS > 1) issues.push('lambdaS:range-0-1');
    if (!Number.isFinite(As) || As < 0) issues.push('As:nonnegative-finite-required');
    if (!Number.isFinite(NuKgf)) issues.push('NuKgf:finite-required');
    if (NuKgf !== 0 && !(AgCm2 > 0)) issues.push('AgCm2:positive-required-with-axial');
    if (issues.length) throw new RangeError(`invalid-one-way-shear-input:${issues.join(',')}`);
    const sqrtFc = Math.sqrt(fc);
    const rhoW = As / (bw * d);
    const concreteStress = 2.12 * lambdaS * lambda * Math.cbrt(rhoW) * sqrtFc;
    const axialStress = NuKgf === 0 ? 0 : Math.min(NuKgf / (6 * AgCm2), 0.05 * fc);
    const vcFormulaStress = Math.max(0, concreteStress + axialStress);
    const vcMaxStress = 1.33 * lambda * sqrtFc;
    const capped = vcFormulaStress > vcMaxStress;
    const vcStress = Math.min(vcFormulaStress, vcMaxStress);
    const Vc = vcStress * bw * d;
    const phi = input?.phi == null ? NaN : Number(input.phi);
    return {
      formula: '22.5.5.1(c)', rhoW, lambdaS, sqrtFc, concreteStress, axialStress,
      vcFormulaStress, vcMaxStress, capped, vcStress, Vc, VcMax: vcMaxStress * bw * d,
      phiVc: Number.isFinite(phi) ? phi * Vc : NaN
    };
  }

  // 22.6.5.2 無剪力筋雙向剪力 vc（kgf/cm²）：表 22.6.5.2 三式取小，各項乘 λs。
  function twoWayShearStressNoStirrups(input) {
    const fc = Number(input?.fc);
    const lambda = Number(input?.lambda);
    const lambdaS = Number(input?.lambdaS);
    const betaC = Number(input?.betaC);
    const alphaS = Number(input?.alphaS);
    const bo = Number(input?.bo);
    const d = Number(input?.d);
    const issues = [];
    for (const [key, value] of [['fc', fc], ['betaC', betaC], ['alphaS', alphaS], ['d', d]]) {
      if (!Number.isFinite(value) || value <= 0) issues.push(`${key}:positive-finite-required`);
    }
    // bo = 0（臨界周長全在構材外）時 (c) 式不控制，φVc = vc·bo·d 自然為 0
    if (!Number.isFinite(bo) || bo < 0) issues.push('bo:nonnegative-finite-required');
    if (!Number.isFinite(lambda) || lambda <= 0 || lambda > 1) issues.push('lambda:range-0-1');
    if (!Number.isFinite(lambdaS) || lambdaS <= 0 || lambdaS > 1) issues.push('lambdaS:range-0-1');
    if (issues.length) throw new RangeError(`invalid-two-way-shear-input:${issues.join(',')}`);
    const base = lambdaS * lambda * Math.sqrt(fc);
    const vcA = 1.06 * base;
    // 表 22.6.5.2（原 PDF p.390）：(b) 0.53(1+2/β)、(c) 0.265(2+αs·d/bo)
    const vcB = 0.53 * (1 + 2 / betaC) * base;
    const vcC = 0.265 * (alphaS * d / bo + 2) * base;
    return { lambdaS, vcA, vcB, vcC, vc: Math.min(vcA, vcB, vcC) };
  }

  // 設計建議用估算（非檢核）：實配鋼筋量 asPerCm（cm²/cm 寬）維持不變，求單向剪力所需 d：
  // φ·vc(d)·d = qu·(arm − d)，vc(d) 依表 22.5.5.1(c)；左式隨 d 遞增、右式遞減，二分法求唯一解。
  function requiredDepthOneWayNoStirrups(input) {
    const quKgfCm2 = Number(input?.quKgfCm2);
    const arm = Number(input?.arm);
    const asPerCm = Number(input?.asPerCm);
    const phi = Number(input?.phi);
    if (!(quKgfCm2 > 0) || !(arm > 0)) return 0;
    if (!(asPerCm > 0) || !(phi > 0)) return NaN;
    const waived = input.waiveSizeEffect === true;
    const residual = depth => {
      const shear = oneWayShearNoStirrups({
        fc: input.fc, lambda: input.lambda, bw: 1, d: depth, As: asPerCm,
        lambdaS: sizeEffectFactor(depth, { waived })
      });
      return phi * shear.Vc - quKgfCm2 * (arm - depth);
    };
    let lo = 1e-6;
    let hi = arm;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (residual(mid) >= 0) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  function validateInput(input) {
    const issues = [];
    const positive = ['fc', 'fy', 'B', 'L', 'hf', 'c1', 'c2', 'dbX', 'dbY', 'AsXPerM', 'AsYPerM', 'phiShear', 'lambda'];
    for (const key of positive) {
      if (!Number.isFinite(Number(input?.[key])) || Number(input[key]) <= 0) issues.push(`${key}:positive-finite-required`);
    }
    if (!Number.isFinite(Number(input?.cover)) || Number(input.cover) < 0) issues.push('cover:nonnegative-finite-required');
    if (!Number.isFinite(Number(input?.PuTf)) || Number(input.PuTf) <= 0) issues.push('PuTf:positive-finite-required');
    if (Number(input?.c1) >= Number(input?.L) || Number(input?.c2) >= Number(input?.B)) issues.push('column-must-fit-footing');
    if (Number(input?.phiShear) > 1) issues.push('phiShear:maximum-one');
    if (Number(input?.lambda) > 1) issues.push('lambda:maximum-one');
    const dX = Number(input?.hf) - Number(input?.cover) - Number(input?.dbX);
    const dY = Number(input?.hf) - Number(input?.cover) - Number(input?.dbY);
    if (!(dX > 0) || !(dY > 0)) issues.push('effective-depth:positive-required');
    return issues;
  }

  function calculateStrength(input) {
    const issues = validateInput(input);
    if (issues.length) throw new RangeError(`invalid-foundation-input:${issues.join(',')}`);
    if (!Flexure || typeof Flexure.phiMnRect !== 'function' || typeof Flexure.designAsRect !== 'function') {
      throw new Error('foundation-flexure-dependency-missing');
    }

    const fc = Number(input.fc);
    const fy = Number(input.fy);
    const B = Number(input.B);
    const L = Number(input.L);
    const hf = Number(input.hf);
    const c1 = Number(input.c1);
    const c2 = Number(input.c2);
    const cover = Number(input.cover);
    const dbX = Number(input.dbX);
    const dbY = Number(input.dbY);
    const AsXPerM = Number(input.AsXPerM);
    const AsYPerM = Number(input.AsYPerM);
    const PuTf = Number(input.PuTf);
    const phiShear = Number(input.phiShear);
    const lambda = Number(input.lambda);

    const dX = hf - cover - dbX;
    const dY = hf - cover - dbY;
    const d = Math.min(dX, dY);
    const areaM2 = B * L / 1e4;
    const quTfM2 = PuTf / areaM2;
    const quKgfCm2 = quTfM2 / 10;
    const armX = (L - c1) / 2;
    const armY = (B - c2) / 2;
    const arm = Math.max(armX, armY);

    const MuxKgfCm = quKgfCm2 * B * armX * armX / 2;
    const MuyKgfCm = quKgfCm2 * L * armY * armY / 2;
    const MuKgfCm = Math.max(MuxKgfCm, MuyKgfCm);
    const MuxTfm = MuxKgfCm / 1e5;
    const MuyTfm = MuyKgfCm / 1e5;
    const MuTfm = MuKgfCm / 1e5;

    const AsProvX = AsXPerM * B / 100;
    const AsProvY = AsYPerM * L / 100;
    const flexX = Flexure.phiMnRect({ b: B, d: dX, h: hf, As: AsProvX, fc, fy });
    const flexY = Flexure.phiMnRect({ b: L, d: dY, h: hf, As: AsProvY, fc, fy });
    const phiMnXTfm = flexX.phiMn / 1e5;
    const phiMnYTfm = flexY.phiMn / 1e5;
    const MuMode = MuxTfm >= MuyTfm ? 'X 向柱面懸臂' : 'Y 向柱面懸臂';
    const phiMnTfm = MuMode === 'X 向柱面懸臂' ? phiMnXTfm : phiMnYTfm;

    const AsMinPerM = 0.0018 * 100 * hf;
    const designX = Flexure.designAsRect({ b: B, d: dX, Mu_kgcm: MuxKgfCm, fc, fy });
    const designY = Flexure.designAsRect({ b: L, d: dY, Mu_kgcm: MuyKgfCm, fc, fy });
    if (!designX.converged || !designY.converged || !Number.isFinite(designX.As) || !Number.isFinite(designY.As)) {
      throw new RangeError('foundation-flexure-design-not-converged');
    }
    const AsReqX = Math.max(designX.As, AsMinPerM * B / 100);
    const AsReqY = Math.max(designY.As, AsMinPerM * L / 100);
    const AsReq = MuMode === 'X 向柱面懸臂' ? AsReqX : AsReqY;

    const betaRect = Math.max(L / B, B / L);
    const centerBandRatio = 2 / (betaRect + 1);
    const isRect = Math.abs(L - B) > 1;

    // 單向剪力：距柱面 d 之臨界斷面，X 向懸臂（臂長 armX）斷面寬 B、受拉筋為 X 向筋；
    // Y 向懸臂（臂長 armY）斷面寬 L、受拉筋為 Y 向筋。表 22.5.5.1(c)，λs = 1（13.2.6.2(a)），Nu = 0。
    const lambdaS1 = sizeEffectFactor(d, { waived: true });
    const oneWayFor = (direction, armDir, width, AsProv) => {
      const v1ArmDir = Math.max(0, armDir - d);
      const VuKgf = quKgfCm2 * width * v1ArmDir;
      const shear = oneWayShearNoStirrups({ fc, lambda, bw: width, d, As: AsProv, lambdaS: lambdaS1, phi: phiShear });
      const ratio = shear.phiVc > 0 ? VuKgf / shear.phiVc : (VuKgf > 0 ? Infinity : 0);
      return { direction, arm: armDir, v1Arm: v1ArmDir, width, As: AsProv, VuKgf, ratio, ...shear };
    };
    const oneWayX = oneWayFor('X', armX, B, AsProvX);
    const oneWayY = oneWayFor('Y', armY, L, AsProvY);
    const oneWay = oneWayX.ratio >= oneWayY.ratio ? oneWayX : oneWayY;
    const v1Arm = oneWay.v1Arm;
    const v1Width = oneWay.width;
    const v1Direction = oneWay.direction;
    const v1As = oneWay.As;
    const rhoW1 = oneWay.rhoW;
    const vc1 = oneWay.vcStress;
    const Vu1Kgf = oneWay.VuKgf;
    const Vc1Kgf = oneWay.Vc;
    const phiVc1Kgf = oneWay.phiVc;

    const c1d = c1 + d;
    const c2d = c2 + d;
    const bo = 2 * (c1d + c2d);
    const criticalAreaM2 = c1d * c2d / 1e4;
    const Vu2Kgf = (PuTf - quTfM2 * criticalAreaM2) * 1000;
    const betaC = Math.max(c1, c2) / Math.min(c1, c2);
    const alphaS = 40;
    // 雙向衝剪：λs = 1（13.2.6.2(a)）
    const lambdaS2 = sizeEffectFactor(d, { waived: true });
    const twoWay = twoWayShearStressNoStirrups({ fc, lambda, lambdaS: lambdaS2, betaC, alphaS, bo, d });
    const vcA = twoWay.vcA;
    const vcB = twoWay.vcB;
    const vcC = twoWay.vcC;
    const vc2 = twoWay.vc;
    const phiVc2Kgf = phiShear * vc2 * bo * d;

    return {
      dX, dY, d, areaM2, quTfM2, quKgfCm2, armX, armY, arm,
      MuxKgfCm, MuyKgfCm, MuKgfCm, MuxTfm, MuyTfm, MuTfm,
      AsProvX, AsProvY, phiMnXTfm, phiMnYTfm, MuMode, phiMnTfm,
      AsMinPerM, flexuralAsX: designX.As, flexuralAsY: designY.As, AsReqX, AsReqY, AsReq,
      betaRect, centerBandRatio, isRect,
      v1Arm, v1Width, v1Direction, v1As, lambdaS1, rhoW1, vc1, Vu1Kgf, Vc1Kgf, phiVc1Kgf, oneWayX, oneWayY,
      c1d, c2d, bo, criticalAreaM2, Vu2Kgf, betaC, lambdaS2, vcA, vcB, alphaS, vcC, vc2, phiVc2Kgf
    };
  }

  return {
    SIZE_EFFECT_WAIVER_CLAUSE,
    sizeEffectFactor,
    oneWayShearNoStirrups,
    twoWayShearStressNoStirrups,
    requiredDepthOneWayNoStirrups,
    validateInput,
    calculateStrength
  };
});
