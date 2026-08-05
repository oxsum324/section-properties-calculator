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

    const v1Arm = Math.max(0, arm - d);
    const Vu1Kgf = quKgfCm2 * B * v1Arm;
    const Vc1Kgf = 0.53 * lambda * Math.sqrt(fc) * B * d;
    const phiVc1Kgf = phiShear * Vc1Kgf;

    const c1d = c1 + d;
    const c2d = c2 + d;
    const bo = 2 * (c1d + c2d);
    const criticalAreaM2 = c1d * c2d / 1e4;
    const Vu2Kgf = (PuTf - quTfM2 * criticalAreaM2) * 1000;
    const betaC = Math.max(c1, c2) / Math.min(c1, c2);
    const vcA = 1.06 * lambda * Math.sqrt(fc);
    const vcB = 0.27 * (2 + 4 / betaC) * lambda * Math.sqrt(fc);
    const alphaS = 40;
    const vcC = 0.27 * (alphaS * d / bo + 2) * lambda * Math.sqrt(fc);
    const vc2 = Math.min(vcA, vcB, vcC);
    const phiVc2Kgf = phiShear * vc2 * bo * d;

    return {
      dX, dY, d, areaM2, quTfM2, quKgfCm2, armX, armY, arm,
      MuxKgfCm, MuyKgfCm, MuKgfCm, MuxTfm, MuyTfm, MuTfm,
      AsProvX, AsProvY, phiMnXTfm, phiMnYTfm, MuMode, phiMnTfm,
      AsMinPerM, flexuralAsX: designX.As, flexuralAsY: designY.As, AsReqX, AsReqY, AsReq,
      betaRect, centerBandRatio, isRect,
      v1Arm, Vu1Kgf, Vc1Kgf, phiVc1Kgf,
      c1d, c2d, bo, criticalAreaM2, Vu2Kgf, betaC, vcA, vcB, alphaS, vcC, vc2, phiVc2Kgf
    };
  }

  return { validateInput, calculateStrength };
});
