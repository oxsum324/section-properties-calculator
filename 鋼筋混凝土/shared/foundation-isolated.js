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

  const basePolygon = [[-1,-1], [1,-1], [1,1], [-1,1]];
  const maxBy = (items, score) => items.reduce((control, item) => score(item) > score(control) ? item : control);

  function clipPolygon(polygon, signedDistance) {
    const clipped = [];
    for (let i = 0; i < polygon.length; i++) {
      const from = polygon[i], to = polygon[(i + 1) % polygon.length];
      const a = signedDistance(from), b = signedDistance(to);
      if (a >= 0) clipped.push(from);
      if ((a > 0 && b < 0) || (a < 0 && b > 0)) {
        const fraction = a / (a - b);
        clipped.push(from.map((value, axis) => value + fraction * (to[axis] - value)));
      }
    }
    return clipped;
  }

  // Integrate through degree two exactly: three barycentric points on each triangle.
  function polygonMoments(polygon) {
    const sums = [0, 0, 0, 0, 0, 0];
    for (let i = 1; i + 1 < polygon.length; i++) {
      const triangle = [polygon[0], polygon[i], polygon[i + 1]];
      const [[ax, ay], [bx, by], [cx, cy]] = triangle;
      const weight = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 24;
      for (const [vx, vy] of triangle) {
        const x = (ax + bx + cx + 3 * vx) / 6;
        const y = (ay + by + cy + 3 * vy) / 6;
        sums[0] += weight;
        sums[1] += weight * x;
        sums[2] += weight * y;
        sums[3] += weight * x * x;
        sums[4] += weight * x * y;
        sums[5] += weight * y * y;
      }
    }
    const [area, x, y, xx, xy, yy] = sums; // Divided by the normalised full area (4).
    return [[area, x, y], [x, xx, xy], [y, xy, yy]];
  }

  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

  function solveThree(matrix, rhs) {
    const rows = matrix.map((row, i) => [...row, rhs[i]]);
    for (let k = 0; k < 3; k++) {
      const pivot = maxBy(rows.slice(k), row => Math.abs(row[k]));
      const index = rows.indexOf(pivot);
      [rows[k], rows[index]] = [pivot, rows[k]];
      const scale = pivot[k];
      if (!Number.isFinite(scale) || Math.abs(scale) < 1e-19) return null;
      rows[k] = pivot.map(value => value / scale);
      for (let i = 0; i < 3; i++) {
        if (i !== k) rows[i] = rows[i].map((value, j) => value - rows[i][k] * rows[k][j]);
      }
    }
    return rows.map(row => row[3]);
  }

  function planeAt([offset, dx, dy], [x, y]) {
    return offset + dx * x + dy * y;
  }

  function contactPlane(ex, ey) {
    // q / (P/A) = max(0, a + b*x + c*y), x and y normalised to [-1, 1].
    // The Jacobian is the integral of [1,x,y] ⊗ [1,x,y] over the compressed polygon.
    const target = [1, ex, ey];
    const evaluate = plane => {
      const polygon = clipPolygon(basePolygon, point => planeAt(plane, point));
      const jacobian = polygonMoments(polygon);
      const residual = jacobian.map((row, i) => dot(row, plane) - target[i]);
      return { plane, polygon, jacobian, residual, error:Math.hypot(...residual) };
    };
    const partial = 3 * (Math.abs(ex) + Math.abs(ey)) > 1 + 1e-12;
    if (!partial) return { ...evaluate([1, 3 * ex, 3 * ey]), partial };
    if (!ex || !ey) {
      const relativeLength = 3 * (1 - Math.max(Math.abs(ex), Math.abs(ey)));
      const slope = 4 / relativeLength ** 2;
      return { ...evaluate([slope * (relativeLength - 1), Math.sign(ex) * slope, Math.sign(ey) * slope]), partial };
    }
    if (Math.abs(ex) >= 0.5 && Math.abs(ey) >= 0.5) {
      // A triangular contact patch has its resultant one quarter of each leg from the loaded corner.
      const legX = 4 * (1 - Math.abs(ex)), legY = 4 * (1 - Math.abs(ey));
      const peak = 24 / (legX * legY);
      const dx = peak / legX, dy = peak / legY;
      return { ...evaluate([peak - dx - dy, Math.sign(ex) * dx, Math.sign(ey) * dy]), partial };
    }

    let state = evaluate([1, 3 * ex, 3 * ey]);
    for (let i = 0; i < 100 && state.error > 2e-10; i++) {
      const direction = solveThree(state.jacobian, state.residual);
      if (!direction) break;
      let improved = false;
      for (let step = 1; step >= 2 ** -24; step /= 2) {
        const next = evaluate(state.plane.map((value, index) => value - step * direction[index]));
        if (next.error < state.error) {
          state = next;
          improved = true;
          break;
        }
      }
      if (!improved) break;
    }
    return { ...state, partial };
  }

  function soilContact(P, mx, my, length, width) {
    const ex = P > 0 ? Math.abs(mx) / P : Infinity;
    const ey = P > 0 ? Math.abs(my) / P : Infinity;
    const kern = ex / length + ey / width;
    const base = { ex, ey, kern, qmin:null, qmax:null, contactAreaM2:null };
    if (ex >= length / 2 || ey >= width / 2) return { ...base, contact:'失去承壓平衡' };
    const { plane, polygon, jacobian, error, partial } = contactPlane(2 * mx / (P * length), 2 * my / (P * width));
    if (!(error <= 2e-10)) return { ...base, contact:'接觸反力未達平衡' };
    const average = P / (length * width);
    const corners = basePolygon.map(point => Math.max(0, planeAt(plane, point)) * average);
    if (!corners.every(Number.isFinite)) return { ...base, contact:'接觸壓力超出可計算範圍' };
    const contact = !partial ? '全底面接觸' : mx && my ? '雙向部分接觸' : '單向三角形';
    return { ...base, contact, partial, plane, polygon, error, contactAreaM2:jacobian[0][0] * length * width,
      qmin:Math.min(...corners), qmax:Math.max(...corners) };
  }

  function pressureCase({ id, PuTf, mAlongLTfm, mAlongBTfm }, L, B) {
    if (!Number.isFinite(PuTf) || PuTf <= 0 || !Number.isFinite(mAlongLTfm) || !Number.isFinite(mAlongBTfm)) {
      throw new RangeError(`${id}：請填同一組合的正向壓力 Pu 與兩向有號彎矩（零值也須填）。`);
    }
    const reaction = soilContact(PuTf, mAlongLTfm, mAlongBTfm, L / 100, B / 100);
    if (reaction.qmax === null) throw new RangeError(`${id}：${reaction.contact}，須另核基底反力。`);
    return { ...reaction, id, PuTf, mAlongLTfm, mAlongBTfm, average:PuTf * 1000 / (L * B),
      minTfM2:reaction.qmin, maxTfM2:reaction.qmax };
  }

  function reactionIntegrals(pressure, polygon) {
    // Scale normalised polygon integrals to kgf and kgf × normalised coordinate.
    return polygonMoments(polygon).map(row => pressure.PuTf * 1000 * dot(row, pressure.plane));
  }

  function stripDemands(pressure, direction, span, arm, depth) {
    const axis = direction === 'X' ? 0 : 1;
    const face = 1 - 2 * arm / span;
    return [1, -1].map(sign => {
      const cut = face + 2 * depth / span;
      const faceZone = clipPolygon(pressure.polygon, point => sign * point[axis] - face);
      const shearZone = clipPolygon(pressure.polygon, point => sign * point[axis] - cut);
      const forceAndMoments = reactionIntegrals(pressure, faceZone);
      const moment = span / 2 * (sign * forceAndMoments[axis + 1] - face * forceAndMoments[0]);
      return {
        caseId:pressure.id, side:sign === 1 ? '+' : '−', partial:pressure.partial,
        momentKgfCm:Math.max(0, moment), shearKgf:Math.max(0, reactionIntegrals(pressure, shearZone)[0])
      };
    });
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
      const contact = soilContact(P, mxBase, my, length, width);
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

  function punchingMomentAxis(span, transverseSpan, d, effectiveWidth, externalTfm, reactionTfm, availableTfm) {
    const gammaF = 1 / (1 + (2 / 3) * Math.sqrt(span / transverseSpan));
    const gammaV = 1 - gammaF;
    const Jc = (d * span ** 3 + span * d ** 3) / 6 + d * transverseSpan * span ** 2 / 2;
    const MscTfm = externalTfm - reactionTfm;
    const stressAtPositiveEdge = gammaV * MscTfm * 1e5 * (span / 2) / Jc;
    const flexureTfm = gammaF * Math.abs(MscTfm);
    return { gammaF, gammaV, Jc, effectiveWidth, externalTfm, reactionTfm, MscTfm,
      stressAtPositiveEdge, flexureTfm, availableTfm, ok:flexureTfm <= availableTfm };
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
    const pressureX = pressureCases.flatMap(item => stripDemands(item, 'X', L, armX, dX));
    const pressureY = pressureCases.flatMap(item => stripDemands(item, 'Y', B, armY, dY));
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

    // Use the size factor for each case independently, then compare demand/capacity.
    const oneWayFor = (direction, armDir, width, depth, AsProv, pressureSides) => {
      const v1ArmDir = Math.max(0, armDir - depth);
      const results = pressureSides.map(({ caseId, side, shearKgf:VuKgf, partial }) => {
        const lambdaS = sizeEffectFactor(depth, { waived:!partial });
        const shear = oneWayShearNoStirrups({ fc, lambda, bw:width, d:depth, As:AsProv, lambdaS, phi:phiShear });
        const ratio = shear.phiVc > 0 ? VuKgf / shear.phiVc : (VuKgf > 0 ? Infinity : 0);
        return { direction, caseId, side, partial, depth, arm:armDir, v1Arm:v1ArmDir, width, As:AsProv, VuKgf, ratio, ...shear };
      });
      return maxBy(results, item => item.ratio);
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
    const transferByCase = new Map();
    for (const row of input.transferCases ?? []) {
      const { id, externalLTfm, externalBTfm, availableLTfm, availableBTfm, reference } = row;
      if (!pressureCases.some(item => item.id === id) || transferByCase.has(id) ||
          ![externalLTfm, externalBTfm, availableLTfm, availableBTfm].every(Number.isFinite) ||
          Math.min(availableLTfm, availableBTfm) < 0 || typeof reference !== 'string' || !reference.trim()) {
        throw new RangeError('偏心衝剪資料須對應唯一強度組合，並填兩向彎矩、非負有效板寬容量及依據。');
      }
      transferByCase.set(id, row);
    }
    const betaC = Math.max(c1, c2) / Math.min(c1, c2);
    const alphaS = 40;
    const transferWidthL = Math.min(B, c2 + 3 * hf);
    const transferWidthB = Math.min(L, c1 + 3 * hf);
    // Integrate the actual upward pressure inside the critical perimeter for each case.
    const punchingCases = pressureCases.map(item => {
      const critical = [1, -1].reduce((polygon, sign) => {
        const withinX = clipPolygon(polygon, ([x]) => c1d / L + sign * x);
        return clipPolygon(withinX, ([, y]) => c2d / B + sign * y);
      }, item.polygon);
      const [upliftKgf, momentX, momentY] = reactionIntegrals(item, critical);
      const Vu2Kgf = Math.max(0, item.PuTf * 1000 - upliftKgf);
      const lambdaS = sizeEffectFactor(d, { waived:!item.partial });
      const twoWay = twoWayShearStressNoStirrups({ fc, lambda, lambdaS, betaC, alphaS, bo, d });
      const phiVc2Kgf = phiShear * twoWay.vc * bo * d;
      const phiVcStress = phiShear * twoWay.vc;
      const directStress = Vu2Kgf / (bo * d);
      const source = transferByCase.get(item.id);
      const transferRequired = !!source || input.requireTransferEvidence === true || item.mAlongLTfm !== 0 || item.mAlongBTfm !== 0;
      const alongL = source ? punchingMomentAxis(c1d, c2d, d, transferWidthL, source.externalLTfm,
        momentX * L / 2 / 1e5, source.availableLTfm) : null;
      const alongB = source ? punchingMomentAxis(c2d, c1d, d, transferWidthB, source.externalBTfm,
        momentY * B / 2 / 1e5, source.availableBTfm) : null;
      // For this closed symmetric perimeter, the maximum absolute combined stress is at a corner.
      const stressL = alongL?.stressAtPositiveEdge ?? 0;
      const stressB = alongB?.stressAtPositiveEdge ?? 0;
      const peakStress = directStress + Math.abs(stressL) + Math.abs(stressB);
      const peakCorner = source && peakStress > directStress
        ? `${stressL >= 0 ? '+' : '−'}L／${stressB >= 0 ? '+' : '−'}B` : '均勻剪應力';
      const pending = transferRequired && !source;
      const okShear = peakStress > phiVcStress ? false : pending ? null : true;
      const okTransfer = source ? alongL.ok && alongB.ok : null;
      return { ...item, ...twoWay, upliftKgf, Vu2Kgf, phiVc2Kgf, phiVcStress, directStress, peakStress,
        peakCorner, okShear, okTransfer, transferRequired, pending, alongL, alongB, reference:source?.reference };
    });
    const punchingAxialControl = maxBy(punchingCases, item => item.Vu2Kgf / item.phiVc2Kgf);
    const punchingControl = maxBy(punchingCases, item => item.peakStress / item.phiVcStress);
    const punchingPending = punchingCases.filter(item => item.pending);
    const okPunching = punchingCases.some(item => item.okShear === false) ? false : punchingPending.length ? null : true;
    const transfers = punchingCases.filter(item => item.transferRequired);
    const okMomentTransfer = transfers.some(item => item.okTransfer === false) ? false :
      transfers.length && !punchingPending.length ? true : null;
    const { Vu2Kgf, phiVc2Kgf, vcA, vcB, vcC, vc:vc2, lambdaS:lambdaS2 } = punchingAxialControl;
    const lambdaS1 = oneWay.lambdaS;

    return {
      dX, dY, d, areaM2, quTfM2, quKgfCm2, armX, armY, arm,
      pressureCases, pressureControl, pressureX, pressureY, flexureControlX, flexureControlY,
      punchingAxialControl, punchingControl, punchingCases, punchingPending, okPunching, okMomentTransfer,
      transferWidthL, transferWidthB,
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
