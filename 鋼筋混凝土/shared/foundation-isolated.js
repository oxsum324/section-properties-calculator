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

  function pressureCase({ id, PuTf, mAlongLTfm, mAlongBTfm }, L, B) {
    if (!Number.isFinite(PuTf) || PuTf <= 0 || !Number.isFinite(mAlongLTfm) || !Number.isFinite(mAlongBTfm)) {
      throw new RangeError(`${id}：請填同一組合的正向壓力 Pu 與兩向有號彎矩（零值也須填）。`);
    }
    // q(x,y) = average + gradientX*x + gradientY*y, x along L and y along B.
    // Internally, q is in kgf/cm² and coordinates are in cm.
    const average = PuTf * 1000 / (L * B);
    const gradientX = 12 * mAlongLTfm * 1e5 / (B * L ** 3);
    const gradientY = 12 * mAlongBTfm * 1e5 / (L * B ** 3);
    const cornerVariation = Math.abs(gradientX) * L / 2 + Math.abs(gradientY) * B / 2;
    if (cornerVariation > average * (1 + 1e-12)) {
      throw new RangeError(`${id}：因數化基底反力出現拉應力，須先完成部分接觸分析。`);
    }
    return { id, PuTf, mAlongLTfm, mAlongBTfm, average, gradientX, gradientY,
      minTfM2: 10 * Math.max(0, average - cornerVariation), maxTfM2: 10 * (average + cornerVariation) };
  }

  function stripDemands(pressure, direction, span, width, arm, depth) {
    const gradient = direction === 'X' ? pressure.gradientX : pressure.gradientY;
    const face = span / 2 - arm;
    const shearArm = Math.max(0, arm - depth);
    // Integrating across the full perpendicular width cancels that direction's gradient.
    // On each side, integrate q(t) or q(t)*t over the strip, measured from the cut.
    return [1, -1].map(sign => {
      const qFace = pressure.average + sign * gradient * face;
      const qCut = pressure.average + sign * gradient * (face + depth);
      return {
        caseId: pressure.id,
        side: sign === 1 ? '+' : '−',
        momentKgfCm: width * (qFace * arm ** 2 / 2 + sign * gradient * arm ** 3 / 3),
        shearKgf: width * shearArm * (qCut + sign * gradient * shearArm / 2)
      };
    });
  }

  const maxBy = (items, score) => items.reduce((control, item) => score(item) > score(control) ? item : control);

  function serviceContact(P, mx, my, length, width) {
    const ex = P > 0 ? Math.abs(mx) / P : Infinity;
    const ey = P > 0 ? Math.abs(my) / P : Infinity;
    const kern = ex / length + ey / width;
    if (ex >= length / 2 || ey >= width / 2) {
      return { ex, ey, kern, contact:'失去承壓平衡', qmin:null, qmax:null };
    }
    if (kern <= 1 / 6 + 1e-12) {
      const average = P / (length * width);
      const variation = average * 6 * kern;
      return { ex, ey, kern, contact:'全底面接觸', qmin:Math.max(0, average - variation), qmax:average + variation };
    }
    if (mx && my) return { ex, ey, kern, contact:'雙向部分接觸待分析', qmin:0, qmax:null };
    const contactArea = 3 * (mx ? width * (length / 2 - ex) : length * (width / 2 - ey));
    return { ex, ey, kern, contact:'單向三角形', qmin:0, qmax:2 * P / contactArea };
  }

  function calculateService({ B, L, hf, qa, Df, gammaSoil, mu, PD, PL, PE, MxDL, MyDL, MxE, MyE, HDL, HE }) {
    const values = [B, L, hf, qa, Df, gammaSoil, mu, PD, PL, PE, MxDL, MyDL, MxE, MyE, HDL, HE];
    if (!values.every(Number.isFinite) || Math.min(B, L, hf, qa) <= 0 || Math.min(Df, gammaSoil, mu) < 0) {
      throw new RangeError('請核對基腳、土壤及服務載重資料。');
    }
    const length = L / 100;
    const width = B / 100;
    const Wsoil = Df / 100 * length * width * gammaSoil;
    const loads = [{ id:'D+L', P:PD + PL, mx:MxDL, my:MyDL, h:HDL, slideMin:1.5 }];
    if ([PE, MxE, MyE, HE].some(value => value !== 0)) {
      loads.push({ id:'D+L+E', P:PD + PL + PE, mx:MxDL + MxE, my:MyDL + MyE, h:HDL + HE, slideMin:1.2 });
    }
    const cases = loads.map(load => {
      const { P, h, my } = load;
      // Signed H acts at the column/footing interface, positive toward the +L pressure side.
      const mxBase = load.mx + h * hf / 100;
      const contact = serviceContact(P, mxBase, my, length, width);
      const N = Math.max(0, P + Wsoil);
      const slide = h ? mu * N / Math.abs(h) : null;
      const overL = mxBase ? Math.max(0, P) * length / (2 * Math.abs(mxBase)) : null;
      const overB = my ? Math.max(0, P) * width / (2 * Math.abs(my)) : null;
      const over = Math.min(overL ?? Infinity, overB ?? Infinity);
      return { ...load, ...contact, mxBase, N, slide, overL, overB, over:Number.isFinite(over) ? over : null };
    });
    const pressure = maxBy(cases, item => item.qmax ?? Infinity);
    const minPressure = cases.find(item => item.qmin === null) || maxBy(cases, item => -item.qmin);
    const kern = maxBy(cases, item => item.kern);
    const slide = maxBy(cases, item => item.slide === null ? -Infinity : -item.slide / item.slideMin);
    const over = maxBy(cases, item => -(item.over ?? Infinity));
    return { cases, Wsoil, pressure, minPressure, kern, slide, over,
      okQ:pressure.qmax !== null && pressure.qmax <= qa,
      okSlide:slide.slide === null ? null : slide.slide >= slide.slideMin,
      okOver:over.over === null ? null : over.over >= 1.5 };
  }

  function calculateStrength(input) {
    const cases = input?.strengthCases ?? [{ id:'軸力工況', PuTf:Number(input?.PuTf), mAlongLTfm:0, mAlongBTfm:0 }];
    if (!Array.isArray(cases) || !cases.length) throw new RangeError('請至少輸入一組因數化載重。');
    const issues = validateInput({ ...input, PuTf:cases[0]?.PuTf });
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
    const phiShear = Number(input.phiShear);
    const lambda = Number(input.lambda);

    const dX = hf - cover - dbX;
    const dY = hf - cover - dbY;
    const d = Math.min(dX, dY);
    const areaM2 = B * L / 1e4;
    const armX = (L - c1) / 2;
    const armY = (B - c2) / 2;
    const arm = Math.max(armX, armY);

    const pressureCases = cases.map(item => pressureCase(item, L, B));
    const pressureControl = maxBy(pressureCases, item => item.maxTfM2);
    const quKgfCm2 = pressureControl.average;
    const quTfM2 = quKgfCm2 * 10;
    const pressureX = pressureCases.flatMap(item => stripDemands(item, 'X', L, B, armX, dX));
    const pressureY = pressureCases.flatMap(item => stripDemands(item, 'Y', B, L, armY, dY));
    const flexureControlX = maxBy(pressureX, item => item.momentKgfCm);
    const flexureControlY = maxBy(pressureY, item => item.momentKgfCm);
    const MuxKgfCm = flexureControlX.momentKgfCm;
    const MuyKgfCm = flexureControlY.momentKgfCm;
    const MuxTfm = MuxKgfCm / 1e5;
    const MuyTfm = MuyKgfCm / 1e5;

    const AsProvX = AsXPerM * B / 100;
    const AsProvY = AsYPerM * L / 100;
    const flexX = Flexure.phiMnRect({ b: B, d: dX, h: hf, As: AsProvX, fc, fy });
    const flexY = Flexure.phiMnRect({ b: L, d: dY, h: hf, As: AsProvY, fc, fy });
    const phiMnXTfm = flexX.phiMn / 1e5;
    const phiMnYTfm = flexY.phiMn / 1e5;
    const controlsX = MuxTfm / phiMnXTfm >= MuyTfm / phiMnYTfm;
    const MuKgfCm = controlsX ? MuxKgfCm : MuyKgfCm;
    const MuTfm = MuKgfCm / 1e5;
    const MuMode = controlsX ? 'X 向柱面懸臂' : 'Y 向柱面懸臂';
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
    const oneWayFor = (direction, armDir, width, depth, AsProv, pressureSides) => {
      const v1ArmDir = Math.max(0, armDir - depth);
      const { caseId, side, shearKgf:VuKgf } = maxBy(pressureSides, item => item.shearKgf);
      const shear = oneWayShearNoStirrups({ fc, lambda, bw: width, d:depth, As: AsProv, lambdaS: lambdaS1, phi: phiShear });
      const ratio = shear.phiVc > 0 ? VuKgf / shear.phiVc : (VuKgf > 0 ? Infinity : 0);
      return { direction, caseId, side, depth, arm: armDir, v1Arm: v1ArmDir, width, As: AsProv, VuKgf, ratio, ...shear };
    };
    const oneWayX = oneWayFor('X', armX, B, dX, AsProvX, pressureX);
    const oneWayY = oneWayFor('Y', armY, L, dY, AsProvY, pressureY);
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
    if (c1d >= L || c2d >= B) throw new RangeError('柱周衝剪臨界面觸及基腳自由邊，須按實際周界另核。');
    const bo = 2 * (c1d + c2d);
    const criticalAreaM2 = c1d * c2d / 1e4;
    const punchingAxialControl = maxBy(pressureCases, item => item.PuTf);
    // The centred critical area integrates the mean pressure, even with linear gradients.
    // This is the axial component only and cannot certify eccentric punching.
    const Vu2Kgf = (punchingAxialControl.PuTf - punchingAxialControl.average * 10 * criticalAreaM2) * 1000;
    const eccentricPunching = pressureCases.some(item => item.mAlongLTfm !== 0 || item.mAlongBTfm !== 0);
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
      pressureCases, pressureControl, pressureX, pressureY, flexureControlX, flexureControlY,
      punchingAxialControl, eccentricPunching,
      MuxKgfCm, MuyKgfCm, MuKgfCm, MuxTfm, MuyTfm, MuTfm,
      AsProvX, AsProvY, phiMnXTfm, phiMnYTfm, MuMode, phiMnTfm,
      AsMinPerM, flexuralAsX: designX.As, flexuralAsY: designY.As, AsReqX, AsReqY, AsReq,
      betaRect, centerBandRatio, isRect,
      v1Arm, v1Width, v1Depth:oneWay.depth, v1Direction, v1As, lambdaS1, rhoW1, vc1, Vu1Kgf, Vc1Kgf, phiVc1Kgf, oneWayX, oneWayY,
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
    calculateService,
    calculateStrength
  };
});
