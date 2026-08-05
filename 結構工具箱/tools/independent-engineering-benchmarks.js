const fs = require('fs');
const path = require('path');

const toolsRoot = __dirname;
const repoRoot = path.resolve(toolsRoot, '..', '..');
const defaultCatalogPath = path.join(toolsRoot, 'independent-engineering-benchmarks.catalog.json');
const defaultOutputPath = path.join(repoRoot, 'output', 'audit', 'independent-engineering-benchmarks.json');

const ROOT_KEYS = ['schemaVersion', 'kind', 'portfolio', 'benchmarks', 'priorityTargets'];
const PORTFOLIO_KEYS = ['eligibleState', 'eligibleFormalRoutes', 'scopeNote'];
const BENCHMARK_KEYS = ['id', 'route', 'title', 'productionModule', 'oracle', 'referenceType', 'referenceBasis', 'input', 'assertions'];
const ASSERTION_KEYS = ['path', 'absTolerance'];
const TARGET_KEYS = ['route', 'priority', 'evidenceNeeded'];

function exactKeys(value, expected, label, issues) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${label}:object-required`);
    return;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.join('\u0000') !== wanted.join('\u0000')) {
    issues.push(`${label}:keys:${actual.join(',')}`);
  }
}

function getPath(value, dottedPath) {
  return String(dottedPath).split('.').reduce((current, key) => (
    current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined
  ), value);
}

function equipmentOracle(i) {
  const serviceWeight = i.equipmentWeight + i.fluidWeight + i.accessoryWeight;
  const designWeight = serviceWeight * i.dynamicFactor;
  const pointLoad = designWeight / i.supportCount;
  const spreadB = i.contactB + 2 * i.spreadDepth;
  const spreadL = i.contactL + 2 * i.spreadDepth;
  return {
    serviceWeight,
    designWeight,
    pointLoad,
    qContact: pointLoad / (i.contactB * i.contactL),
    spreadB,
    spreadL,
    qSpread: pointLoad / (spreadB * spreadL),
    qEquivalent: designWeight / (i.planB * i.planL),
    horizontalTotal: designWeight * i.horizontalCoeff,
    horizontalPerSupport: designWeight * i.horizontalCoeff / i.supportCount
  };
}

function earthOracle(i) {
  const sinPhi = Math.sin(i.phiDeg * Math.PI / 180);
  const Ka = (1 - sinPhi) / (1 + sinPhi);
  const soilForce = 0.5 * Ka * i.gammaSoil * i.H * i.H;
  const surchargeForce = Ka * i.surcharge * i.H;
  const totalForce = soilForce + surchargeForce;
  const overturningMoment = soilForce * i.H / 3 + surchargeForce * i.H / 2;
  return {
    Ka,
    soilForce,
    surchargeForce,
    totalForce,
    overturningMoment,
    fsSlide: (i.mu * i.verticalLoad) / totalForce,
    fsOver: (i.verticalLoad * i.baseB / 2) / overturningMoment
  };
}

function foundationOracle(i) {
  const area = i.B * i.L;
  const Ptotal = i.P;
  const qAvg = Ptotal / area;
  const qFromMx = 6 * i.Mx / (i.B * i.L * i.L);
  const qFromMy = 6 * i.My / (i.L * i.B * i.B);
  return {
    area,
    Ptotal,
    qAvg,
    qFromMx,
    qFromMy,
    qmax: qAvg + Math.abs(qFromMx) + Math.abs(qFromMy),
    qmin: qAvg - Math.abs(qFromMx) - Math.abs(qFromMy),
    fsSlide: Math.hypot(i.Hx, i.Hy) > 0 ? (i.mu * Ptotal + i.passive) / Math.hypot(i.Hx, i.Hy) : Infinity,
    fsOver: Math.min(
      Math.abs(i.My) > 0 ? Ptotal * (i.B / 2) / Math.abs(i.My) : Infinity,
      Math.abs(i.Mx) > 0 ? Ptotal * (i.L / 2) / Math.abs(i.Mx) : Infinity
    )
  };
}

function rcColumnPmOracle(i) {
  const a = Math.min(i.beta1 * i.c, i.h);
  const concreteForce = 0.85 * i.fc * i.b * a;
  let PnKgf = concreteForce;
  let MnKgfCm = concreteForce * (i.h / 2 - a / 2);
  let dt = 0;
  for (const bar of i.bars) {
    dt = Math.max(dt, bar.y);
    const strain = 0.003 * (i.c - bar.y) / i.c;
    const stress = Math.max(-i.fy, Math.min(i.fy, strain * i.Es));
    const netForce = bar.y < a ? (stress - 0.85 * i.fc) * bar.As : stress * bar.As;
    PnKgf += netForce;
    MnKgfCm += netForce * (i.h / 2 - bar.y);
  }
  const epsT = 0.003 * (dt - i.c) / i.c;
  const phi = epsT >= 0.005
    ? i.phiTen
    : (epsT <= 0.002
      ? i.phiComp
      : i.phiComp + (i.phiTen - i.phiComp) * (epsT - 0.002) / 0.003);
  const Ast = i.bars.reduce((sum, bar) => sum + bar.As, 0);
  const Po = (0.85 * i.fc * (i.b * i.h - Ast) + i.fy * Ast) / 1000;
  const phiPnMax = i.phiComp * i.PnMaxFactor * Po;
  const Pn = PnKgf / 1000;
  const Mn = Math.abs(MnKgfCm) / 1e5;
  const phiPn = phi * Pn;
  const phiMn = phi * Mn;
  return {
    Pn,
    Mn,
    epsT,
    phi,
    phiPn,
    phiMn,
    Po,
    phiPnMax,
    designP: Pn > 0 ? Math.min(phiPn, phiPnMax) : phiPn,
    designM: phiMn
  };
}

function rcBeamStrengthOracle(i) {
  const flexure = (As, d) => {
    const tensileForce = As * i.fy;
    const a = tensileForce / (0.85 * i.fc * i.b);
    const c = a / i.beta1;
    const epsT = 0.003 * (d - c) / c;
    const epsY = i.fy / 2.04e6;
    const phi = epsT >= 0.005
      ? 0.9
      : (epsT <= epsY ? 0.65 : 0.65 + 0.25 * (epsT - epsY) / (0.005 - epsY));
    const Mn = tensileForce * (d - a / 2);
    return { c, a, Cc:tensileForce, eqN:0, Mn, epsT, phi, phiMn:phi * Mn, valid:1 };
  };
  const positive = flexure(i.asPositive, i.dPositive);
  const negative = flexure(i.asNegative, i.dNegative);
  const asMin = d => Math.max(0.8 * Math.sqrt(i.fc) / i.fy, 14 / i.fy) * i.b * d;

  const Ag = i.b * i.h;
  const rhoShear = i.asPositive / (i.b * i.dPositive);
  const AvProvidedPerS = i.Av / i.stirrupSpacing;
  const AvMinPerS = Math.max(0.2 * Math.sqrt(i.fc) * i.b / i.fyt, 3.5 * i.b / i.fyt);
  const hasMinStir = AvProvidedPerS >= AvMinPerS;
  const sqrtFc = Math.sqrt(i.fc);
  const vcBaseStress = 0.53 * i.lambda * sqrtFc;
  const axialStress = Math.min(Math.max(i.axialDemand * 1000 / (6 * Ag), -vcBaseStress), 0.05 * i.fc);
  const vcSimpleStress = Math.max(0, vcBaseStress + axialStress);
  const vcRhoStress = Math.max(0, 2.12 * i.lambda * Math.cbrt(Math.max(rhoShear, 0.0001)) * sqrtFc + axialStress);
  const VcSimple = vcSimpleStress * i.b * i.dPositive;
  const VcRho = vcRhoStress * i.b * i.dPositive;
  const lambdaS = Math.min(1, Math.sqrt(2 / (1 + i.dPositive / 25)));
  const VcRaw = hasMinStir ? Math.max(VcSimple, VcRho) : lambdaS * VcRho;
  const Vc = Math.max(0, Math.min(VcRaw, 1.33 * i.lambda * sqrtFc * i.b * i.dPositive));
  const phiVc = i.phiShear * Vc;
  const VsProvided = i.Av * i.fyt * i.dPositive / i.stirrupSpacing;
  const phiVs = i.phiShear * VsProvided;
  const phiVn = phiVc + phiVs;
  const shearDemand = Math.max(i.shearDemand, i.Ve) * 1000;
  const forceVc0 = i.Ve * 1000 > 0.5 * shearDemand && i.axialDemand * 1000 < Ag * i.fc / 20;
  const phiVnEffective = forceVc0 ? phiVs : phiVn;
  const flexureUtilization = i.momentDemand / (positive.phiMn / 1e5);
  const shearUtilization = shearDemand / phiVnEffective;
  const governingUtilization = Math.max(flexureUtilization, shearUtilization);
  return {
    positiveC:positive.c,
    positiveA:positive.a,
    positiveCc:positive.Cc,
    positiveEqN:positive.eqN,
    positiveMn:positive.Mn,
    positiveEpsT:positive.epsT,
    positivePhi:positive.phi,
    positivePhiMn:positive.phiMn,
    positiveValid:positive.valid,
    negativeC:negative.c,
    negativeA:negative.a,
    negativeCc:negative.Cc,
    negativeEqN:negative.eqN,
    negativeMn:negative.Mn,
    negativeEpsT:negative.epsT,
    negativePhi:negative.phi,
    negativePhiMn:negative.phiMn,
    negativeValid:negative.valid,
    asMinPositive:asMin(i.dPositive),
    asMinNegative:asMin(i.dNegative),
    AvProvidedPerS,
    AvMinPerS,
    hasMinStir:hasMinStir ? 1 : 0,
    Vc,
    phiVc,
    VsProvided,
    phiVs,
    phiVn,
    forceVc0:forceVc0 ? 1 : 0,
    phiVnEffective,
    shearDemand,
    veControls:i.Ve > i.shearDemand ? 1 : 0,
    flexureUtilization,
    shearUtilization,
    governingUtilization,
    overallPass:governingUtilization <= 1 ? 1 : 0
  };
}

function rcShearWallStrengthOracle(i) {
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const bool = value => value ? 1 : 0;
  const rowsBE = Math.max(1, Math.round(i.nBE / 2));
  const bars = [];
  const y0 = i.cover;
  const y1 = Math.max(i.cover + 0.1, i.lbe - i.cover);
  const AsRowBE = i.nBE * i.aBE / rowsBE;
  for (let k = 0; k < rowsBE; k += 1) {
    const y = rowsBE === 1 ? (y0 + y1) / 2 : y0 + (y1 - y0) * k / (rowsBE - 1);
    bars.push({ y, As:AsRowBE });
    bars.push({ y:i.lw - y, As:AsRowBE });
  }
  const webLength = i.lw - 2 * i.lbe;
  const webBarRows = webLength > 0 ? Math.max(0, Math.round(webLength / i.sV)) : 0;
  for (let k = 0; k < webBarRows; k += 1) {
    bars.push({ y:i.lbe + (k + 0.5) * webLength / webBarRows, As:i.nLayer * i.aV });
  }

  const AstTotal = bars.reduce((sum, bar) => sum + bar.As, 0);
  const Ag = i.tw * i.lw;
  const Acv = Ag;
  const beta1 = i.fc <= 280 ? 0.85 : (i.fc >= 560 ? 0.65 : 0.85 - 0.05 * (i.fc - 280) / 70);
  const Po = (0.85 * i.fc * (Ag - AstTotal) + i.fy * AstTotal) / 1000;
  const phiPnMax = 0.65 * 0.8 * Po;
  const dt = Math.max(...bars.map(bar => bar.y));
  const nominal = [{ P:Po, M:0, phi:0.65, c:5 * i.lw }];
  for (let step = 0; step < i.pmSteps; step += 1) {
    const cRatio = 5 - (5 - 0.02) * step / (i.pmSteps - 1);
    const c = cRatio * i.lw;
    const a = Math.min(beta1 * c, i.lw);
    const Cc = 0.85 * i.fc * i.tw * a;
    let Pn = Cc;
    let Mn = Cc * (i.lw / 2 - a / 2);
    for (const bar of bars) {
      const strain = 0.003 * (c - bar.y) / c;
      const stress = clamp(strain * 2.04e6, -i.fy, i.fy);
      const force = bar.y < a ? (stress - 0.85 * i.fc) * bar.As : stress * bar.As;
      Pn += force;
      Mn += force * (i.lw / 2 - bar.y);
    }
    const epsT = 0.003 * (dt - c) / c;
    const phi = epsT >= 0.005 ? 0.9 : (epsT <= 0.002 ? 0.65 : 0.65 + 0.25 * (epsT - 0.002) / 0.003);
    nominal.push({ P:Pn / 1000, M:Math.abs(Mn) / 1e5, phi, c });
  }
  nominal.push({ P:-AstTotal * i.fy / 1000, M:0, phi:0.9, c:0 });
  const design = nominal.map(point => ({
    P:point.P > 0 ? Math.min(point.phi * point.P, phiPnMax) : point.phi * point.P,
    M:point.phi * point.M
  }));

  function interpolate(points, P, valueKey, takeAbsolute = false) {
    let best = null;
    for (let index = 0; index < points.length - 1; index += 1) {
      const A = points[index];
      const B = points[index + 1];
      if ((A.P - P) * (B.P - P) <= 0 && A.P !== B.P) {
        const t = (P - A.P) / (B.P - A.P);
        let value = A[valueKey] + t * (B[valueKey] - A[valueKey]);
        if (takeAbsolute) value = Math.abs(value);
        if (best == null || value > best) best = value;
      }
    }
    return best == null ? 0 : best;
  }

  const cAtPu = interpolate(nominal, i.Pu, 'c');
  const phiMn = interpolate(design, i.Pu, 'M');
  const MnNomAtPu = interpolate(nominal, i.Pu, 'M', true);
  const pmPMin = Math.min(...design.map(point => point.P));
  const pmPMax = Math.max(...design.map(point => point.P));
  const pmUtil = Math.abs(i.Mu) / phiMn;
  const pmOk = i.Pu >= pmPMin - 1e-9 && i.Pu <= pmPMax + 1e-9 && Math.abs(i.Mu) <= phiMn + 1e-9;

  const hwlw = i.hw / i.lw;
  const alphaC = hwlw <= 1.5 ? 0.8 : (hwlw >= 2 ? 0.53 : 0.8 + (0.53 - 0.8) * (hwlw - 1.5) / 0.5);
  const rhol = i.nLayer * i.aV / (i.tw * i.sV);
  const rhot = i.nLayer * i.aH / (i.tw * i.sH);
  const Vn = Acv * (alphaC * i.lambda * Math.sqrt(i.fc) + rhot * i.fyt);
  const VnMaxSingle = 2.65 * Math.sqrt(i.fc) * Acv;
  const Ve = i.shearDemandMode === 'amplified'
    ? Math.abs(i.Vuns) + Math.abs(i.omegaV) * Math.abs(i.omegaW) * Math.abs(i.VuEh)
    : Math.abs(i.Vu);
  const Vmn = Ve > 0 && Math.abs(i.Mu) > 0 && MnNomAtPu > 0 ? Ve * 1000 * MnNomAtPu / Math.abs(i.Mu) : null;
  const flexureControlled = Vmn != null && Vn < Vmn;
  const phiShear = flexureControlled ? 0.6 : 0.75;
  const phiVn = phiShear * Vn;
  const shearUtil = Ve * 1000 / phiVn;
  const shearOk = phiVn >= Ve * 1000 - 1e-9;
  const vnMaxOk = Ve * 1000 <= phiShear * VnMaxSingle + 1e-9;
  const needTwoLayer = Ve * 1000 > 0.5 * phiShear * alphaC * i.lambda * Math.sqrt(i.fc) * Acv || hwlw >= 2;
  const twoLayerOk = !needTwoLayer || i.nLayer >= 2;

  const S = i.tw * i.lw * i.lw / 6;
  const sigmaFiber = i.Pu * 1000 / Ag + Math.abs(i.Mu) * 1e5 / S;
  const cLimit = i.lw / (600 * 1.5 * Math.max(0.005, i.duhw));
  const sigmaTrig = sigmaFiber > 0.2 * i.fc;
  const cTrig = cAtPu >= cLimit;
  const sbeReq = i.seismic && (sigmaTrig || cTrig);
  const sbeHoriz = Math.max(cAtPu - 0.1 * i.lw, cAtPu / 2);
  const sbeVert = Ve > 0 ? Math.max(i.lw, Math.abs(i.Mu) * 1e5 / (4 * Ve * 1000)) : i.lw;
  const sigmaStop = 0.15 * i.fc;
  const sbeExtX = sigmaFiber > sigmaStop ? i.lw * (1 - sigmaStop / sigmaFiber) : 0;
  const bWidthMin = i.hu / 16;
  const hxLimit = Math.min(35, 2 * i.bComp / 3);
  const sbeLengthOk = !sbeReq || i.lbe >= sbeHoriz - 1e-9;
  const sbeBWidthOk = !sbeReq || i.bComp >= bWidthMin - 1e-9;
  const b30Required = sbeReq && cAtPu / i.lw >= 0.375;
  const sbeCratioBOk = !sbeReq || !b30Required || i.bComp >= 30 - 1e-9;
  const sbeHxOk = !sbeReq || i.hx <= hxLimit + 1e-9;
  const so = Math.min(15, Math.max(10, 10 + (35 - i.hx) / 3));
  const sbeSpLimit = Math.min(Math.min(i.tw, i.lbe) / 3, 6 * i.dbBE, so);
  const AshReq = 0.09 * i.fc / i.fyt * i.sTie * (i.tw - 2 * i.cover);
  const AshProv = i.nLegTie * i.aTie;
  const sbeSpOk = !sbeReq || i.sTie <= sbeSpLimit + 1e-9;
  const sbeAshOk = !sbeReq || AshProv >= AshReq - 1e-9;
  const sbeDesignOk = !sbeReq || (sbeLengthOk && sbeBWidthOk && sbeCratioBOk && sbeHxOk && sbeSpOk && sbeAshOk);

  const shearFricLimit = 1.1 * i.lambda * Math.sqrt(i.fc) * Acv;
  const shearFricActive = i.hasJoint && Ve * 1000 > shearFricLimit;
  const surfaceMu = { monolithic:1.4, roughened:1, not_roughened:0.6, steel:0.7 }[i.jointSurface] * i.lambda;
  const shearFricAvfProv = 2 * i.nBE * i.aBE + webBarRows * i.nLayer * i.aV;
  const shearFricAvfReq = shearFricActive ? Ve * 1000 / (phiShear * surfaceMu * Math.min(i.fy, 4200)) : 0;
  const shearFricVnBySteel = surfaceMu * shearFricAvfProv * Math.min(i.fy, 4200);
  const roughSurface = i.jointSurface === 'monolithic' || i.jointSurface === 'roughened';
  const shearFricVnMax = roughSurface
    ? Math.min(0.2 * i.fc * Acv, (33.6 + 0.08 * i.fc) * Acv, 112 * Acv)
    : Math.min(0.2 * i.fc * Acv, 56 * Acv);
  const shearFricVn = Math.min(shearFricVnBySteel, shearFricVnMax);
  const shearFricPhiVn = phiShear * shearFricVn;
  const shearFricOk = !i.hasJoint || !shearFricActive || (shearFricPhiVn >= Ve * 1000 - 1e-9 && Ve * 1000 <= phiShear * shearFricVnMax + 1e-9);

  const spVmax = Math.min(3 * i.tw, 45, i.lw / 3);
  const spHmax = Math.min(3 * i.tw, 45, i.lw / 5);
  const rholOk = rhol >= 0.0025 - 1e-9;
  const rhotOk = rhot >= 0.0025 - 1e-9;
  const spVOk = i.sV <= spVmax + 1e-9;
  const spHOk = i.sH <= spHmax + 1e-9;
  const isPier = hwlw >= 2 && i.lw / i.tw <= 2.5;
  const geomModelOk = i.cover * 2 < i.tw && i.lbe > 2 * i.cover && 2 * i.lbe < i.lw;
  const overallOk = geomModelOk && !isPier && pmOk && shearOk && vnMaxOk && twoLayerOk && sbeDesignOk && shearFricOk && rholOk && rhotOk && spVOk && spHOk;

  return {
    barRows:bars.length, webBarRows, AstTotal, rhol, rhot, Po, phiPnMax, pmPMin, pmPMax,
    cAtPu, phiMn, pmUtil, pmOk:bool(pmOk), alphaC, Vn, VnMaxSingle, Ve,
    MnNomAtPu, Vmn, phiShear, phiVn, shearUtil, flexureControlled:bool(flexureControlled),
    shearOk:bool(shearOk), vnMaxOk:bool(vnMaxOk), needTwoLayer:bool(needTwoLayer), twoLayerOk:bool(twoLayerOk),
    sigmaFiber, cLimit, sigmaTrig:bool(sigmaTrig), cTrig:bool(cTrig), sbeReq:bool(sbeReq),
    sbeHoriz, sbeVert, sbeExtX, bWidthMin, hxLimit, sbeLengthOk:bool(sbeLengthOk),
    sbeBWidthOk:bool(sbeBWidthOk), sbeHxOk:bool(sbeHxOk), sbeSpLimit, AshReq, AshProv,
    sbeSpOk:bool(sbeSpOk), sbeAshOk:bool(sbeAshOk), sbeDesignOk:bool(sbeDesignOk),
    shearFricLimit, shearFricActive:bool(shearFricActive), shearFricAvfProv, shearFricAvfReq,
    shearFricVn, shearFricPhiVn, shearFricOk:bool(shearFricOk), rholOk:bool(rholOk),
    rhotOk:bool(rhotOk), spVOk:bool(spVOk), spHOk:bool(spHOk), overallOk:bool(overallOk)
  };
}

function rcFoundationOracle(i) {
  const dX = i.hf - i.cover - i.dbX;
  const dY = i.hf - i.cover - i.dbY;
  const d = Math.min(dX, dY);
  const areaM2 = i.B * i.L / 1e4;
  const quTfM2 = i.PuTf / areaM2;
  const quKgfCm2 = quTfM2 / 10;
  const armX = (i.L - i.c1) / 2;
  const armY = (i.B - i.c2) / 2;
  const MuxKgfCm = quKgfCm2 * i.B * armX * armX / 2;
  const MuyKgfCm = quKgfCm2 * i.L * armY * armY / 2;
  const AsProvX = i.AsXPerM * i.B / 100;
  const AsProvY = i.AsYPerM * i.L / 100;

  function flexuralCapacity(width, depth, steelArea) {
    const a = steelArea * i.fy / (0.85 * i.fc * width);
    const c = a / i.beta1;
    const epsT = 0.003 * (depth - c) / c;
    const epsY = i.fy / i.Es;
    const phi = epsT >= 0.005 ? 0.9 : (epsT <= epsY ? 0.65 : 0.65 + 0.25 * (epsT - epsY) / (0.005 - epsY));
    return phi * steelArea * i.fy * (depth - a / 2) / 1e5;
  }

  function requiredSteel(width, depth, momentKgfCm) {
    const coefficient = i.fy * i.fy / (1.7 * i.fc * width);
    const linear = i.fy * depth;
    const discriminant = linear * linear - 4 * coefficient * momentKgfCm / 0.9;
    return (linear - Math.sqrt(discriminant)) / (2 * coefficient);
  }

  const flexuralAsX = requiredSteel(i.B, dX, MuxKgfCm);
  const flexuralAsY = requiredSteel(i.L, dY, MuyKgfCm);
  const AsMinPerM = 0.0018 * 100 * i.hf;
  const AsReqX = Math.max(flexuralAsX, AsMinPerM * i.B / 100);
  const AsReqY = Math.max(flexuralAsY, AsMinPerM * i.L / 100);
  const v1Arm = Math.max(0, Math.max(armX, armY) - d);
  const Vu1Kgf = quKgfCm2 * i.B * v1Arm;
  const phiVc1Kgf = i.phiShear * 0.53 * i.lambda * Math.sqrt(i.fc) * i.B * d;
  const c1d = i.c1 + d;
  const c2d = i.c2 + d;
  const bo = 2 * (c1d + c2d);
  const criticalAreaM2 = c1d * c2d / 1e4;
  const Vu2Kgf = (i.PuTf - quTfM2 * criticalAreaM2) * 1000;
  const betaC = Math.max(i.c1, i.c2) / Math.min(i.c1, i.c2);
  const vc = Math.min(
    1.06 * i.lambda * Math.sqrt(i.fc),
    0.27 * (2 + 4 / betaC) * i.lambda * Math.sqrt(i.fc),
    0.27 * (40 * d / bo + 2) * i.lambda * Math.sqrt(i.fc)
  );
  const phiVc2Kgf = i.phiShear * vc * bo * d;
  return {
    dX,
    dY,
    quTfM2,
    MuxTfm: MuxKgfCm / 1e5,
    MuyTfm: MuyKgfCm / 1e5,
    phiMnXTfm: flexuralCapacity(i.B, dX, AsProvX),
    phiMnYTfm: flexuralCapacity(i.L, dY, AsProvY),
    flexuralAsX,
    flexuralAsY,
    AsReqX,
    AsReqY,
    Vu1Tf: Vu1Kgf / 1000,
    phiVc1Tf: phiVc1Kgf / 1000,
    bo,
    Vu2Tf: Vu2Kgf / 1000,
    phiVc2Tf: phiVc2Kgf / 1000
  };
}

function rcPileOracle(i) {
  const layer = i.layers[0];
  const alpha = layer.c <= 3 ? 0.9 : layer.c <= 6 ? 0.7 : 0.55;
  const perimeter = Math.PI * i.pileDiameterM;
  const pileAreaM2 = Math.PI * i.pileDiameterM * i.pileDiameterM / 4;
  const Qs = alpha * layer.c * perimeter * i.pileLength;
  const Qb = 9 * layer.c * pileAreaM2;
  const Qult = Qs + Qb;

  const xs = [];
  const ys = [];
  for (let xIndex = 0; xIndex < i.pileNL; xIndex++) {
    for (let yIndex = 0; yIndex < i.pileNB; yIndex++) {
      xs.push((xIndex - (i.pileNL - 1) / 2) * i.pileSL);
      ys.push((yIndex - (i.pileNB - 1) / 2) * i.pileSB);
    }
  }
  const sumX2 = xs.reduce((sum, value) => sum + value * value, 0);
  const sumY2 = ys.reduce((sum, value) => sum + value * value, 0);
  const reactions = xs.map((x, index) => (
    i.PuTf / xs.length
    + i.MxTfm * 100 * ys[index] / sumY2
    + i.MyTfm * 100 * x / sumX2
  ));
  const rowL = Array.from({ length:i.pileNL }, (_, xIndex) => (
    reactions.slice(xIndex * i.pileNB, (xIndex + 1) * i.pileNB).reduce((sum, value) => sum + Math.max(value, 0), 0)
  ));
  const rowB = Array.from({ length:i.pileNB }, (_, yIndex) => (
    Array.from({ length:i.pileNL }, (_, xIndex) => reactions[xIndex * i.pileNB + yIndex])
      .reduce((sum, value) => sum + Math.max(value, 0), 0)
  ));

  const d = i.hc - i.cover - i.db;
  const c1d = i.c1 + d;
  const c2d = i.c2 + d;
  const bo = 2 * (c1d + c2d);
  const betaC = Math.max(i.c1, i.c2) / Math.min(i.c1, i.c2);
  const vc = Math.min(
    1.06 * i.lambda * Math.sqrt(i.fc),
    0.27 * (2 + 4 / betaC) * i.lambda * Math.sqrt(i.fc),
    0.27 * (40 * d / bo + 2) * i.lambda * Math.sqrt(i.fc)
  );
  let excludedCount = 0;
  let Vu2Tf = 0;
  reactions.forEach((reaction, index) => {
    const dx = Math.abs(xs[index]) - c1d / 2;
    const dy = Math.abs(ys[index]) - c2d / 2;
    const distance = dx <= 0 && dy <= 0 ? 0 : Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
    if (distance < i.pileD / 2) excludedCount += 1;
    else Vu2Tf += Math.max(reaction, 0);
  });

  const rowSpanL = (i.pileNL - 1) * i.pileSL / 100;
  const rowSpanB = (i.pileNB - 1) * i.pileSB / 100;
  const controlRowL = Math.max(...rowL);
  const controlRowB = Math.max(...rowB);
  const capMuLongTfm = controlRowL * rowSpanL / 8;
  const capMuTransTfm = controlRowB * rowSpanB / 8;
  const capMuTfm = Math.max(capMuLongTfm, capMuTransTfm);
  const capVuTf = Math.max(controlRowL / 2, controlRowB / 2, ...reactions);
  const momentKgfCm = capMuTfm * 1e5;
  const width = 100;
  const quadratic = i.fy * i.fy / (1.7 * i.fc * width);
  const linear = i.fy * d;
  const capFlexuralAs = (linear - Math.sqrt(linear * linear - 4 * quadratic * momentKgfCm / 0.9)) / (2 * quadratic);
  const capAsReq = Math.max(0.0018 * width * i.hc, capFlexuralAs);
  const capAsProv = Math.max(i.capSteelAreaTotal / 2, capAsReq);
  const a = capAsProv * i.fy / (0.85 * i.fc * width);
  const capPhiMnTfm = 0.9 * capAsProv * i.fy * (d - a / 2) / 1e5;
  const capPhiVcTf = i.phiShear * 0.53 * i.lambda * Math.sqrt(i.fc) * width * d / 1000;
  const capVsTf = 11.4 * 2800 * d / 10 / 1000;

  return {
    Qs,
    Qb,
    Qult,
    Qall: Qult / i.safetyFactor,
    reaction1: reactions[0],
    reaction2: reactions[1],
    reaction3: reactions[2],
    reaction4: reactions[3],
    reactionSum: reactions.reduce((sum, value) => sum + value, 0),
    rMax: Math.max(...reactions),
    rMin: Math.min(...reactions),
    d,
    Vu2Tf,
    phiVc2Tf: i.phiShear * vc * bo * d / 1000,
    excludedCount,
    rowL1: rowL[0],
    rowL2: rowL[1],
    rowB1: rowB[0],
    rowB2: rowB[1],
    capMuLongTfm,
    capMuTransTfm,
    capMuTfm,
    capVuTf,
    capFlexuralAs,
    capAsReq,
    capPhiMnTfm,
    capPhiVnTf: capPhiVcTf + capVsTf
  };
}

function steelBeamAsdOracle(i) {
  const E = 2.04e6;
  const H = i.H / 10;
  const B = i.B / 10;
  const tw = i.tw / 10;
  const tf = i.tf / 10;
  const hw = H - 2 * tf;
  const A = 2 * B * tf + hw * tw;
  const Ix = 2 * (B * tf ** 3 / 12 + B * tf * ((H - tf) / 2) ** 2) + tw * hw ** 3 / 12;
  const Iy = 2 * tf * B ** 3 / 12 + hw * tw ** 3 / 12;
  const Sx = Ix / (H / 2);
  const Zx = 2 * (B * tf * (H / 2 - tf / 2) + tw * (hw / 2) * (hw / 4));
  const ry = Math.sqrt(Iy / A);
  const J = (2 * B * tf ** 3 + hw * tw ** 3) / 3;
  const ho = H - tf;
  const Cw = Iy * ho ** 2 / 4;
  const rts = Math.sqrt(Iy * ho / (2 * Sx));
  const lambdaF = B / (2 * tf);
  const lambdaW = hw / tw;
  const lpf = 0.38 * Math.sqrt(E / i.Fy);
  const lrf = Math.sqrt(E / i.Fy);
  const lpw = 3.76 * Math.sqrt(E / i.Fy);
  const lrw = 5.70 * Math.sqrt(E / i.Fy);

  const Mp = i.Fy * Zx;
  const Mr = 0.7 * i.Fy * Sx;
  const Lp = 1.76 * ry * Math.sqrt(E / i.Fy);
  const arg = J / (Sx * ho);
  const Lr = 1.95 * rts * E / (0.7 * i.Fy)
    * Math.sqrt(arg + Math.sqrt(arg ** 2 + 6.76 * (0.7 * i.Fy / E) ** 2));
  const MnLtb = Math.min(i.Cb * (Mp - (Mp - Mr) * (i.Lb - Lp) / (Lr - Lp)), Mp);
  const MnYield = Mp;
  const MnFlb = Mp;
  const Mn = Math.min(MnYield, MnLtb, MnFlb);

  const Aw = hw * tw;
  const shearRatio = hw / tw;
  const kv = 5.34;
  const compactShearWeb = shearRatio <= 2.24 * Math.sqrt(E / i.Fy);
  let Cv1;
  if (compactShearWeb || shearRatio <= 1.10 * Math.sqrt(kv * E / i.Fy)) Cv1 = 1;
  else if (shearRatio <= 1.37 * Math.sqrt(kv * E / i.Fy)) Cv1 = 1.10 * Math.sqrt(kv * E / i.Fy) / shearRatio;
  else Cv1 = 1.51 * kv * E / (shearRatio ** 2 * i.Fy);
  const Vn = 0.6 * i.Fy * Aw * Cv1;
  const EI = E * Ix;
  const deltaD = 5 * i.wD * i.L ** 4 / (384 * EI);
  const deltaL = 5 * i.wL * i.L ** 4 / (384 * EI);
  const deltaT = deltaD + deltaL;

  return {
    A, Ix, Iy, Sx, Zx, ry, J, Cw, ho, rts,
    lambdaF, lambdaW, lpf, lrf, lpw, lrw,
    compactFlange: lambdaF <= lpf ? 1 : 0,
    compactWeb: lambdaW <= lpw ? 1 : 0,
    Lp, Lr,
    inelasticLtb: i.Lb > Lp && i.Lb <= Lr ? 1 : 0,
    governingLtb: MnLtb < MnYield && MnLtb <= MnFlb ? 1 : 0,
    Mp, Mr, MnYield, MnLtb, MnFlb, Mn,
    MnOmegaTfm: Mn / 1.67 / 1e5,
    Cv1,
    compactShearWeb: compactShearWeb ? 1 : 0,
    VnTf: Vn / 1000,
    VnOmegaTf: Vn / (compactShearWeb ? 1.5 : 1.67) / 1000,
    EI,
    deltaD,
    deltaL,
    deltaT,
    ratioL: i.L / deltaL,
    ratioT: i.L / deltaT,
    allowLive: i.L / i.limitLive,
    allowTotal: i.L / i.limitTotal
  };
}

function steelColumnAsdOracle(i) {
  const E = 2.04e6;
  const omega = 1.67;
  const H = i.H / 10;
  const B = i.B / 10;
  const tw = i.tw / 10;
  const tf = i.tf / 10;
  const hw = H - 2 * tf;
  const A = 2 * B * tf + hw * tw;
  const Ix = 2 * (B * tf ** 3 / 12 + B * tf * ((H - tf) / 2) ** 2) + tw * hw ** 3 / 12;
  const Iy = 2 * tf * B ** 3 / 12 + hw * tw ** 3 / 12;
  const Sx = Ix / (H / 2);
  const Sy = Iy / (B / 2);
  const Zx = 2 * (B * tf * (H / 2 - tf / 2) + tw * (hw / 2) * (hw / 4));
  const Zy = 2 * (tf * B ** 2 / 4) + hw * tw ** 2 / 4;
  const rx = Math.sqrt(Ix / A);
  const ry = Math.sqrt(Iy / A);
  const lambdaF = B / (2 * tf);
  const lambdaW = hw / tw;
  const lrfComp = 0.56 * Math.sqrt(E / i.Fy);
  const lrwComp = 1.49 * Math.sqrt(E / i.Fy);
  const nonSlenderFlange = lambdaF <= lrfComp;
  const nonSlenderWeb = lambdaW <= lrwComp;
  const Qs = nonSlenderFlange ? 1 : NaN;
  const Qa = nonSlenderWeb ? 1 : NaN;
  const Q = Qs * Qa;

  const KLrX = i.Kx * i.Lx / rx;
  const KLrY = i.Ky * i.Ly / ry;
  const KLr = Math.max(KLrX, KLrY);
  const Fe = Math.PI ** 2 * E / KLr ** 2;
  const Cc = Math.sqrt(2 * Math.PI ** 2 * E / i.Fy);
  const limit = 4.71 * Math.sqrt(E / (Q * i.Fy));
  const compressionInelastic = KLr <= limit;
  const Fcr = compressionInelastic
    ? Q * 0.658 ** (Q * i.Fy / Fe) * i.Fy
    : 0.877 * Fe;
  const Pn = Fcr * A;
  const slendernessRatio = KLr / Cc;
  const traditionalSafetyFactor = 5 / 3 + 3 * slendernessRatio / 8 - slendernessRatio ** 3 / 8;
  const Fa = KLr < Cc
    ? (1 - slendernessRatio ** 2 / 2) * i.Fy / traditionalSafetyFactor
    : 12 * Math.PI ** 2 * E / (23 * KLr ** 2);

  const J = (2 * B * tf ** 3 + hw * tw ** 3) / 3;
  const ho = H - tf;
  const rts = Math.sqrt(Iy * ho / (2 * Sx));
  const Mpx = i.Fy * Zx;
  const Mrx = 0.7 * i.Fy * Sx;
  const Lp = 1.76 * ry * Math.sqrt(E / i.Fy);
  const ltbArg = J / (Sx * ho);
  const Lr = 1.95 * rts * E / (0.7 * i.Fy)
    * Math.sqrt(ltbArg + Math.sqrt(ltbArg ** 2 + 6.76 * (0.7 * i.Fy / E) ** 2));
  const MnxLtb = Math.min(i.Cb * (Mpx - (Mpx - Mrx) * (i.Lb - Lp) / (Lr - Lp)), Mpx);
  const Mnx = Math.min(Mpx, MnxLtb);
  const Mpy = Math.min(i.Fy * Zy, 1.6 * i.Fy * Sy);
  const Mny = Mpy;

  const fa = i.Pu * 1000 / A;
  const fbx = i.Mux * 1e5 / Sx;
  const fby = i.Muy * 1e5 / Sy;
  const Fbx = Mnx / (omega * Sx);
  const Fby = Mny / (omega * Sy);
  const Fex = 12 * Math.PI ** 2 * E / (23 * KLrX ** 2);
  const Fey = 12 * Math.PI ** 2 * E / (23 * KLrY ** 2);
  const axialStressRatio = fa / Fa;
  const ampX = 1 - fa / Fex;
  const ampY = 1 - fa / Fey;
  const IR1 = axialStressRatio
    + i.Cmx * fbx / (ampX * Fbx)
    + i.Cmy * fby / (ampY * Fby);
  const IR2 = fa / (0.60 * i.Fy) + fbx / Fbx + fby / Fby;

  return {
    A, Ix, Iy, Sx, Sy, Zx, Zy, rx, ry,
    lambdaF, lambdaW, lrfComp, lrwComp,
    nonSlenderFlange: nonSlenderFlange ? 1 : 0,
    nonSlenderWeb: nonSlenderWeb ? 1 : 0,
    KLrX, KLrY, KLr,
    controlY: KLrY > KLrX ? 1 : 0,
    Fe, Cc, limit, Q, Qs, Qa,
    compressionInelastic: compressionInelastic ? 1 : 0,
    Fcr, Pn, PnOmegaTf:Pn / omega / 1000,
    Fa, PaAsdTf:Fa * A / 1000,
    Lp, Lr,
    majorLtbInelastic:i.Lb > Lp && i.Lb <= Lr ? 1 : 0,
    majorGoverningLtb:MnxLtb < Mpx ? 1 : 0,
    Mpx, Mrx, Mnx,
    MnxOmegaTfm:Mnx / omega / 1e5,
    Mpy, Mny, MnyOmegaTfm:Mny / omega / 1e5,
    fa, fbx, fby, Fbx, Fby, Fex, Fey,
    interactionFull:axialStressRatio > 0.15 ? 1 : 0,
    axialStressRatio, IR1, IR2,
    maxIR:Math.max(IR1, IR2),
    interactionOk:IR1 <= 1 && IR2 <= 1 ? 1 : 0
  };
}

function windForceMwfrsOracle(i) {
  const terrain = { alpha:0.15, zg:300, b:0.94, c:0.20, ell:152, eps:0.20, zmin:4.5 };
  const cpWindward = 0.8;
  const gcpi = 0.375;
  const totalH = i.storyH.reduce((sum, height) => sum + height, 0);
  const zBar = Math.max(0.6 * totalH, terrain.zmin);
  const Iz = terrain.c * (10 / zBar) ** (1 / 6);
  const Lz = terrain.ell * (zBar / 10) ** terrain.eps;
  const calcKz = z => 2.774 * (Math.max(z, terrain.zmin) / terrain.zg) ** (2 * terrain.alpha);
  const calcQz = z => 0.06 * calcKz(z) * i.Kzt * i.I ** 2 * i.V ** 2;
  const KzH = calcKz(totalH);
  const qH = calcQz(totalH);
  const Vh = terrain.b * (Math.max(totalH, terrain.zmin) / 10) ** terrain.alpha * i.V;
  let cumulativeHeight = 0;
  const storyRows = i.storyH.map(height => {
    const zBottom = cumulativeHeight;
    cumulativeHeight += height;
    const zMid = (zBottom + cumulativeHeight) / 2;
    return { height, zMid, Kz:calcKz(zMid), qz:calcQz(zMid) };
  });

  const leewardCp = (L, B) => {
    const ratio = L / B;
    if (ratio <= 1) return -0.5;
    if (ratio >= 4) return -0.2;
    if (ratio <= 2) return -0.5 + (ratio - 1) * 0.2;
    return -0.3 + (ratio - 2) / 2 * 0.1;
  };

  const direction = (prefix, B, L) => {
    const Q2 = 1 / (1 + 0.63 * ((B + totalH) / Lz) ** 0.63);
    const Q = Math.sqrt(Q2);
    const G = 1.927 * (1 + 1.7 * 3.4 * Iz * Q) / (1 + 1.7 * 3.4 * Iz);
    const Cpl = leewardCp(L, B);
    const pl = qH * G * Cpl;
    const rows = storyRows.map(row => {
      const pw = row.qz * G * cpWindward;
      const pNet = pw - pl;
      const A = row.height * B;
      const F = pNet * A;
      return {
        ...row, pw, pl, pNet, A, F,
        WL:0.87 * Math.sqrt(L / B) * F,
        MT:0.28 * B * F,
        wallCasePos:row.qz * G * cpWindward - qH * gcpi,
        wallCaseNeg:row.qz * G * cpWindward + qH * gcpi
      };
    });
    const Vb = rows.reduce((sum, row) => sum + row.F, 0);
    const OTM = rows.reduce((sum, row) => sum + row.F * row.zMid, 0);
    const roofPMax = qH * gcpi;
    const roofPMin = qH * G * -0.7 - qH * gcpi;
    return {
      [`${prefix}G`]:G, [`${prefix}Iz`]:Iz, [`${prefix}Lz`]:Lz,
      [`${prefix}Q2`]:Q2, [`${prefix}Q`]:Q, [`${prefix}Cpl`]:Cpl,
      [`${prefix}SimpleRegime`]:totalH / Math.sqrt(B * L) < 3 ? 1 : 0,
      [`${prefix}Vb`]:Vb, [`${prefix}OTM`]:OTM,
      [`${prefix}F1`]:rows[0].F, [`${prefix}F2`]:rows[1].F, [`${prefix}F3`]:rows[2].F,
      [`${prefix}Pnet1`]:rows[0].pNet, [`${prefix}Pnet3`]:rows[2].pNet,
      [`${prefix}WL1`]:rows[0].WL, [`${prefix}WL3`]:rows[2].WL,
      [`${prefix}MT1`]:rows[0].MT, [`${prefix}MT3`]:rows[2].MT,
      [`${prefix}CrossTotal`]:rows.reduce((sum, row) => sum + row.WL, 0),
      [`${prefix}TorsionTotal`]:rows.reduce((sum, row) => sum + row.MT, 0),
      [`${prefix}WallCasePos1`]:rows[0].wallCasePos,
      [`${prefix}WallCaseNeg1`]:rows[0].wallCaseNeg,
      [`${prefix}RoofCpMax`]:0, [`${prefix}RoofCpMin`]:-0.7,
      [`${prefix}RoofPMax`]:roofPMax, [`${prefix}RoofPMin`]:roofPMin
    };
  };

  return {
    totalH, zBar, KzH, qH, Vh,
    zMid1:storyRows[0].zMid, zMid2:storyRows[1].zMid, zMid3:storyRows[2].zMid,
    Kz1:storyRows[0].Kz, Kz2:storyRows[1].Kz, Kz3:storyRows[2].Kz,
    qz1:storyRows[0].qz, qz2:storyRows[1].qz, qz3:storyRows[2].qz,
    ...direction('x', i.B, i.L),
    ...direction('y', i.L, i.B)
  };
}

function windObjectSolidTable210Oracle(i) {
  const terrains = {
    A:{ alpha:0.32, zg:500, c:0.45, ell:55, eps:0.50, zmin:18 },
    B:{ alpha:0.25, zg:400, c:0.30, ell:98, eps:0.33, zmin:9 },
    C:{ alpha:0.15, zg:300, c:0.20, ell:152, eps:0.20, zmin:4.5 }
  };
  const groundTable = [[3,1.2],[5,1.3],[8,1.4],[10,1.5],[20,1.75],[30,1.85],[40,2.0]];
  const aboveTable = [[6,1.2],[10,1.3],[16,1.4],[20,1.5],[40,1.75],[60,1.85],[80,2.0]];
  const terrain = terrains[i.terrain];

  function lookup(table, ratio) {
    const used = Math.max(table[0][0], Math.min(ratio, table[table.length - 1][0]));
    let low = table[0];
    let high = table[table.length - 1];
    for (let index = 0; index < table.length - 1; index += 1) {
      if (used >= table[index][0] && used <= table[index + 1][0]) {
        low = table[index];
        high = table[index + 1];
        break;
      }
    }
    const cf = low[0] === high[0]
      ? low[1]
      : low[1] + (high[1] - low[1]) * (used - low[0]) / (high[0] - low[0]);
    return { used, lowRatio:low[0], highRatio:high[0], lowCf:low[1], highCf:high[1], cf };
  }

  function calculateCase(item) {
    const objectHeight = item.objectHeight;
    const bigM = Math.max(item.sectionMajor, item.sectionMinor);
    const smallN = Math.min(item.sectionMajor, item.sectionMinor);
    const windWidth = item.windWidth;
    const nu = objectHeight / windWidth;
    const mnRatio = bigM / smallN;
    const groundLimit = 0.25 * objectHeight;
    const atGround = item.bottomClearance < groundLimit;
    const cfNu = lookup(groundTable, nu);
    const cfMn = lookup(aboveTable, mnRatio);
    const controlNu = cfNu.cf >= cfMn.cf;
    const codeCf = Math.max(cfNu.cf, cfMn.cf);
    const manualAdoption = item.cfSource !== 'code';
    const baseCf = manualAdoption ? item.adoptedCf : codeCf;
    const zr = item.bottomClearance + objectHeight / 2;
    const topElevation = item.bottomClearance + objectHeight;
    const zPressure = Math.max(zr, terrain.zmin);
    const Kz = 2.774 * (zPressure / terrain.zg) ** (2 * terrain.alpha);
    const qz = 0.06 * Kz * i.Kzt * i.I ** 2 * i.V ** 2;
    const gustHeight = Math.max(zr, 0.1);
    const gustWidth = Math.max(windWidth, 1);
    const gustZBar = Math.max(0.6 * gustHeight, terrain.zmin);
    const gustIz = terrain.c * (10 / gustZBar) ** (1 / 6);
    const gustLz = terrain.ell * (gustZBar / 10) ** terrain.eps;
    const gustQ2 = 1 / (1 + 0.63 * ((gustWidth + gustHeight) / gustLz) ** 0.63);
    const gustQ = Math.sqrt(gustQ2);
    const G = 1.927 * (1 + 1.7 * 3.4 * gustIz * gustQ) / (1 + 1.7 * 3.4 * gustIz);
    const area = objectHeight * windWidth;
    const force = qz * G * baseCf * area;
    const eccentricity = 0.3 * windWidth;
    return {
      objectHeight, bigM, smallN, windWidth, nu, mnRatio, groundLimit,
      atGround:atGround ? 1 : 0,
      cfNuRatio:cfNu.used,
      cfNuLowRatio:cfNu.lowRatio,
      cfNuHighRatio:cfNu.highRatio,
      cfNuLow:cfNu.lowCf,
      cfNuHigh:cfNu.highCf,
      cfNu:cfNu.cf,
      cfMnRatio:cfMn.used,
      cfMnLowRatio:cfMn.lowRatio,
      cfMnHighRatio:cfMn.highRatio,
      cfMnLow:cfMn.lowCf,
      cfMnHigh:cfMn.highCf,
      cfMn:cfMn.cf,
      controlNu:controlNu ? 1 : 0,
      controlMn:controlNu ? 0 : 1,
      codeCf,
      baseCf,
      manualAdoption:manualAdoption ? 1 : 0,
      zr,
      topElevation,
      Kz,
      qz,
      gustZBar,
      gustIz,
      gustLz,
      gustQ2,
      gustQ,
      G,
      area,
      force,
      baseShear:force,
      baseMoment:force * zr,
      eccentricity,
      torsion:force * eccentricity
    };
  }

  return Object.fromEntries(i.cases.map(item => [item.id, calculateCase(item)]));
}

function seismicForceStaticOracle(i) {
  const faX = [0.5, 0.6, 0.7, 0.8, 0.9];
  const fvX = [0.30, 0.35, 0.40, 0.45, 0.50];
  const faRows = { 1:[1, 1, 1, 1, 1], 2:[1.1, 1.1, 1, 1, 1], 3:[1.2, 1.2, 1.1, 1, 1] };
  const fvRows = { 1:[1, 1, 1, 1, 1], 2:[1.5, 1.4, 1.3, 1.2, 1.1], 3:[1.8, 1.7, 1.6, 1.5, 1.4] };
  const interpolate = (xs, ys, x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    for (let index = 0; index < xs.length - 1; index += 1) {
      if (x <= xs[index + 1]) {
        const fraction = (x - xs[index]) / (xs[index + 1] - xs[index]);
        return ys[index] + fraction * (ys[index + 1] - ys[index]);
      }
    }
    return ys[ys.length - 1];
  };
  const FaD = interpolate(faX, faRows[i.siteClass], i.SsD);
  const FvD = interpolate(fvX, fvRows[i.siteClass], i.S1D);
  const FaM = interpolate(faX, faRows[i.siteClass], i.SsM);
  const FvM = interpolate(fvX, fvRows[i.siteClass], i.S1M);
  const SDS = FaD * i.SsD;
  const SD1 = FvD * i.S1D;
  const SMS = FaM * i.SsM;
  const SM1 = FvM * i.S1M;
  const ToD = SD1 / SDS;
  const ToM = SM1 / SMS;
  const system = { R:4.8, alphaY:1, periodC:0.07 };
  const Tcode = system.periodC * i.hn ** 0.75;
  const Tdesign = Math.min(i.CU * Tcode, i.Tdyna);
  const Ra = 1 + (system.R - 1) / 1.5;
  const calcFu = (capacity, period, transition) => {
    const short = Math.sqrt(2 * capacity - 1);
    if (period >= transition) return capacity;
    if (period >= 0.6 * transition) return short + (capacity - short) * (period - 0.6 * transition) / (0.4 * transition);
    if (period >= 0.2 * transition) return short;
    return 1 + (short - 1) * period / (0.2 * transition);
  };
  const Fu = calcFu(Ra, Tdesign, ToD);
  const FuM = Tdesign >= ToM ? system.R : calcFu(system.R, Tdesign, ToM);
  const calcSa = (period, short, oneSecond) => {
    const transition = oneSecond / short;
    if (period <= 0.2 * transition) return short * (0.4 + 3 * period / transition);
    if (period <= transition) return short;
    if (period <= 2.5 * transition) return oneSecond / period;
    return Math.max(0.4 * short, oneSecond / period);
  };
  const SaD = calcSa(Tdesign, SDS, SD1);
  const SaM = calcSa(Tdesign, SMS, SM1);
  const W = i.floors.reduce((sum, floor) => sum + floor.W, 0);
  const modifiedRatio = ratio => ratio <= 0.3 ? ratio : (ratio >= 0.8 ? 0.7 * ratio : 0.52 * ratio + 0.144);
  const VD_ratio = SaD / Fu;
  const VD_ratio_m = modifiedRatio(VD_ratio);
  const VD = i.I / (1.4 * system.alphaY) * VD_ratio_m * W;
  const Vs_ratio = VD_ratio;
  const Vs_ratio_m = modifiedRatio(Vs_ratio);
  const Vstar = i.I * Fu / (4.2 * system.alphaY) * Vs_ratio_m * W;
  const VM_ratio = SaM / FuM;
  const VM_ratio_m = modifiedRatio(VM_ratio);
  const VM = i.I / (1.4 * system.alphaY) * VM_ratio_m * W;
  const Vdesign = Math.max(VD, Vstar, VM);
  const Ft = Tdesign <= 0.7 ? 0 : (Tdesign >= 3.6 ? 0.25 * Vdesign : Math.min(0.07 * Tdesign * Vdesign, 0.25 * Vdesign));
  const remaining = Vdesign - Ft;
  let cumulativeHeight = 0;
  const floors = i.floors.map(floor => {
    cumulativeHeight += floor.dH;
    return { h:cumulativeHeight, Wh:floor.W * cumulativeHeight };
  });
  const sumWh = floors.reduce((sum, floor) => sum + floor.Wh, 0);
  floors.forEach((floor, index) => {
    floor.Fi = remaining * floor.Wh / sumWh + (index === floors.length - 1 ? Ft : 0);
  });
  let accumulatedShear = 0;
  for (let index = floors.length - 1; index >= 0; index -= 1) {
    accumulatedShear += floors[index].Fi;
    floors[index].Vstory = accumulatedShear;
  }
  const OTM = floors.reduce((sum, floor) => sum + floor.Fi * floor.h, 0);
  const output = {
    R:system.R, alphaY:system.alphaY,
    FaD, FvD, FaM, FvM, SDS, SD1, SMS, SM1, ToD, ToM,
    Tcode, Tdesign, dynamicPeriodControls:Tdesign === i.Tdyna ? 1 : 0,
    Ra, Fu, FuM, SaD, SaM, W,
    VD, VD_ratio, VD_ratio_m, VD_coeff:VD / W,
    Vstar, Vs_ratio, Vs_ratio_m, Vs_coeff:Vstar / W,
    VM, VM_ratio, VM_ratio_m, VM_coeff:VM / W,
    Vdesign, V_coeff:Vdesign / W,
    controlledByVstar:Vdesign === Vstar ? 1 : 0,
    controlledByVM:Vdesign === VM ? 1 : 0,
    Ft, sumWh, OTM, forceSum:floors.reduce((sum, floor) => sum + floor.Fi, 0)
  };
  floors.forEach((floor, index) => {
    const n = index + 1;
    output[`h${n}`] = floor.h;
    output[`Wh${n}`] = floor.Wh;
    output[`Fi${n}`] = floor.Fi;
    output[`Vstory${n}`] = floor.Vstory;
  });
  return output;
}

function anchorCastInOracle(i) {
  const round = (value, digits = 2) => {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  };
  const phiTensionSteel = 0.75;
  const phiShearSteel = 0.65;
  const phiConcrete = 0.7;
  const futa = Math.min(i.steelUltimateStrengthMpa, 1.9 * i.steelYieldStrengthMpa, 862);
  const anchorCount = i.anchorCountX * i.anchorCountY;
  const maxAnchorTension = i.tensionKn / anchorCount;

  const steelTensionNominalRaw = i.effectiveAreaMm2 * futa / 1000;
  const steelTensionDesignRaw = phiTensionSteel * steelTensionNominalRaw;
  const steelTensionDcrRaw = maxAnchorTension / steelTensionDesignRaw;

  const projection = 1.5 * i.effectiveEmbedmentMm;
  const xMin = Math.max(0, i.edgeLeftMm - projection);
  const xMax = Math.min(i.concreteWidthMm, i.edgeLeftMm + i.spacingXmm + projection);
  const yMin = Math.max(0, i.edgeBottomMm - projection);
  const yMax = Math.min(i.concreteHeightMm, i.edgeBottomMm + i.spacingYmm + projection);
  const failureArea = (xMax - xMin) * (yMax - yMin);
  const singleArea = 9 * i.effectiveEmbedmentMm ** 2;
  const tensionAreaRatio = failureArea / singleArea;
  const minimumEdge = Math.min(i.edgeLeftMm, i.edgeRightMm, i.edgeBottomMm, i.edgeTopMm);
  const tensionEdgeFactor = Math.min(1, 0.7 + 0.3 * minimumEdge / projection);
  const tensionBaseNominal = 10 * Math.sqrt(i.concreteStrengthMpa) * i.effectiveEmbedmentMm ** 1.5 / 1000;
  const tensionBreakoutNominalRaw = tensionAreaRatio * tensionEdgeFactor * tensionBaseNominal;
  const tensionBreakoutDesignRaw = phiConcrete * tensionBreakoutNominalRaw;
  const tensionBreakoutDcrRaw = i.tensionKn / tensionBreakoutDesignRaw;

  const pulloutNominalRaw = 8 * i.headBearingAreaMm2 * i.concreteStrengthMpa / 1000;
  const pulloutDesignRaw = phiConcrete * pulloutNominalRaw;
  const pulloutDcrRaw = maxAnchorTension / pulloutDesignRaw;

  const shearDemandRaw = Math.hypot(i.shearXKn, i.shearYKn);
  const steelShearNominalRaw = 0.6 * i.effectiveAreaMm2 * futa * 2 / 1000;
  const steelShearDesignRaw = phiShearSteel * steelShearNominalRaw;
  const steelShearDcrRaw = shearDemandRaw / steelShearDesignRaw;

  const mergeLength = intervals => {
    const sorted = intervals.map(interval => ({ ...interval })).sort((a, b) => a.start - b.start);
    const merged = [];
    for (const interval of sorted) {
      const current = merged[merged.length - 1];
      if (current && interval.start <= current.end) current.end = Math.max(current.end, interval.end);
      else merged.push(interval);
    }
    return merged.reduce((sum, interval) => sum + Math.max(0, interval.end - interval.start), 0);
  };
  const directionalShearStrength = direction => {
    const actualCa1 = direction === 'x' ? i.edgeRightMm : i.edgeTopMm;
    const ca2 = direction === 'x'
      ? Math.min(i.edgeBottomMm, i.edgeTopMm)
      : Math.min(i.edgeLeftMm, i.edgeRightMm);
    const parallelSpacing = direction === 'x' ? i.spacingYmm : i.spacingXmm;
    const ca1 = Math.min(actualCa1, Math.max(ca2 / 1.5, i.thicknessMm / 1.5, parallelSpacing / 3));
    const centers = direction === 'x'
      ? [i.edgeBottomMm, i.edgeBottomMm + i.spacingYmm]
      : [i.edgeLeftMm, i.edgeLeftMm + i.spacingXmm];
    const boundary = direction === 'x' ? i.concreteHeightMm : i.concreteWidthMm;
    const union = mergeLength(centers.map(center => ({
      start:Math.max(0, center - 1.5 * ca1),
      end:Math.min(boundary, center + 1.5 * ca1)
    })));
    const projectedArea = union * 1.5 * ca1;
    const areaRatio = projectedArea / (4.5 * ca1 ** 2);
    const edgeFactor = Math.min(1, 0.7 + 0.3 * ca2 / (1.5 * ca1));
    const baseA = 0.6 * (i.effectiveEmbedmentMm / i.diameterMm) ** 0.2
      * Math.sqrt(i.concreteStrengthMpa) * i.diameterMm ** 0.2 * ca1 ** 1.5 / 1000;
    const baseB = 3.7 * Math.sqrt(i.concreteStrengthMpa) * ca1 ** 1.5 / 1000;
    return areaRatio * edgeFactor * Math.min(baseA, baseB) * phiConcrete;
  };
  const shearStrengthX = directionalShearStrength('x');
  const shearStrengthY = directionalShearStrength('y');
  const dcrX = Math.abs(i.shearXKn) / shearStrengthX;
  const dcrY = Math.abs(i.shearYKn) / shearStrengthY;
  const orthogonalDcr = Math.hypot(dcrX, dcrY);
  const cornerVectorDcr = shearDemandRaw / Math.min(shearStrengthX, shearStrengthY);
  const shearBreakoutDcrRaw = Math.max(orthogonalDcr, cornerVectorDcr);
  const shearBreakoutDesignRaw = shearDemandRaw / shearBreakoutDcrRaw;

  const roundedTensionBreakoutNominal = round(tensionBreakoutNominalRaw);
  const roundedPulloutNominal = round(pulloutNominalRaw);
  const pryoutNominalRaw = 2 * Math.min(roundedTensionBreakoutNominal, roundedPulloutNominal);
  const pryoutDesignRaw = phiConcrete * pryoutNominalRaw;
  const pryoutDcrRaw = shearDemandRaw / pryoutDesignRaw;

  const tensionBreakoutDcr = round(tensionBreakoutDcrRaw, 3);
  const shearBreakoutDcr = round(shearBreakoutDcrRaw, 3);
  const interactionDemand = round(tensionBreakoutDcr + shearBreakoutDcr, 3);
  const interactionDcr = round((tensionBreakoutDcr + shearBreakoutDcr) / 1.2, 3);
  return {
    anchorCount,
    maxAnchorTension:round(maxAnchorTension, 3),
    steelTensionNominal:round(steelTensionNominalRaw),
    steelTensionDesign:round(steelTensionDesignRaw),
    steelTensionDemand:round(maxAnchorTension),
    steelTensionDcr:round(steelTensionDcrRaw, 3),
    tensionBreakoutNominal:roundedTensionBreakoutNominal,
    tensionBreakoutDesign:round(tensionBreakoutDesignRaw),
    tensionBreakoutDemand:round(i.tensionKn),
    tensionBreakoutDcr,
    pulloutNominal:roundedPulloutNominal,
    pulloutDesign:round(pulloutDesignRaw),
    pulloutDemand:round(maxAnchorTension),
    pulloutDcr:round(pulloutDcrRaw, 3),
    steelShearNominal:round(steelShearNominalRaw),
    steelShearDesign:round(steelShearDesignRaw),
    steelShearDemand:round(shearDemandRaw),
    steelShearDcr:round(steelShearDcrRaw, 3),
    shearBreakoutNominal:round(shearBreakoutDesignRaw),
    shearBreakoutDesign:round(shearBreakoutDesignRaw),
    shearBreakoutDemand:round(shearDemandRaw),
    shearBreakoutDcr,
    pryoutNominal:round(pryoutNominalRaw),
    pryoutDesign:round(pryoutDesignRaw),
    pryoutDemand:round(shearDemandRaw),
    pryoutDcr:round(pryoutDcrRaw, 3),
    interactionDemand,
    interactionCapacity:1.2,
    interactionDcr,
    tensionBreakoutControls:1,
    shearBreakoutControls:1,
    interactionControls:1,
    governingDcr:interactionDcr,
    maxDcr:interactionDcr,
    overallPass:interactionDcr <= 1 ? 1 : 0,
    formalPass:interactionDcr <= 1 ? 1 : 0
  };
}

const ORACLES = {
  'equipment-basic-load-path': equipmentOracle,
  'earth-rankine-dry-active': earthOracle,
  'foundation-external-load-only': foundationOracle,
  'rc-column-balanced-nearby-pm-point': rcColumnPmOracle,
  'rc-beam-seismic-strength': rcBeamStrengthOracle,
  'rc-shear-wall-seismic-strength': rcShearWallStrengthOracle,
  'rc-foundation-isolated-strength': rcFoundationOracle,
  'rc-pile-clay-group-cap': rcPileOracle,
  'steel-beam-asd-inelastic-ltb': steelBeamAsdOracle,
  'steel-column-asd-weak-axis-interaction': steelColumnAsdOracle,
  'wind-force-rigid-three-story-mwfrs': windForceMwfrsOracle,
  'wind-object-solid-table-2-10': windObjectSolidTable210Oracle,
  'seismic-force-eight-story-static': seismicForceStaticOracle,
  'anchor-cast-in-m20-chapter-17': anchorCastInOracle
};

function loadProductionModule(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    throw new Error(`unsafe-production-module:${relativePath}`);
  }
  const absolutePath = path.resolve(toolsRoot, normalized);
  if (!absolutePath.startsWith(`${toolsRoot}${path.sep}`) || !fs.existsSync(absolutePath)) {
    throw new Error(`missing-production-module:${relativePath}`);
  }
  return require(absolutePath);
}

function validateCatalog(catalog) {
  const issues = [];
  exactKeys(catalog, ROOT_KEYS, 'catalog', issues);
  if (catalog?.schemaVersion !== 1) issues.push('catalog:schema-version');
  if (catalog?.kind !== 'independent-engineering-benchmarks.v1') issues.push('catalog:kind');
  exactKeys(catalog?.portfolio, PORTFOLIO_KEYS, 'portfolio', issues);
  if (catalog?.portfolio?.eligibleState !== 'formal') issues.push('portfolio:eligible-state');
  if (!Number.isInteger(catalog?.portfolio?.eligibleFormalRoutes) || catalog.portfolio.eligibleFormalRoutes < 1) issues.push('portfolio:eligible-formal-routes');
  if (!String(catalog?.portfolio?.scopeNote || '').includes('golden case')) issues.push('portfolio:scope-note-distinction');
  if (!Array.isArray(catalog?.benchmarks) || catalog.benchmarks.length < 1) issues.push('benchmarks:required');
  if (!Array.isArray(catalog?.priorityTargets)) issues.push('priority-targets:array-required');

  const ids = new Set();
  const routes = new Set();
  for (const [index, benchmark] of (catalog?.benchmarks || []).entries()) {
    const label = `benchmark[${index}]`;
    exactKeys(benchmark, BENCHMARK_KEYS, label, issues);
    if (!benchmark.id || ids.has(benchmark.id)) issues.push(`${label}:unique-id`);
    ids.add(benchmark.id);
    if (!/^\/[a-z0-9-]+$/.test(String(benchmark.route || '')) || routes.has(benchmark.route)) issues.push(`${label}:unique-route`);
    routes.add(benchmark.route);
    if (!ORACLES[benchmark.oracle]) issues.push(`${label}:known-oracle`);
    if (benchmark.referenceType !== 'closed-form-identity') issues.push(`${label}:reference-type`);
    if (!String(benchmark.referenceBasis || '').trim()) issues.push(`${label}:reference-basis`);
    if (!benchmark.input || typeof benchmark.input !== 'object' || Array.isArray(benchmark.input)) issues.push(`${label}:input-object`);
    if (!Array.isArray(benchmark.assertions) || benchmark.assertions.length < 1) issues.push(`${label}:assertions-required`);
    const assertionPaths = new Set();
    for (const [assertionIndex, assertion] of (benchmark.assertions || []).entries()) {
      const assertionLabel = `${label}.assertions[${assertionIndex}]`;
      exactKeys(assertion, ASSERTION_KEYS, assertionLabel, issues);
      if (!assertion.path || assertionPaths.has(assertion.path)) issues.push(`${assertionLabel}:unique-path`);
      assertionPaths.add(assertion.path);
      if (!Number.isFinite(assertion.absTolerance) || assertion.absTolerance < 0) issues.push(`${assertionLabel}:abs-tolerance`);
    }
  }

  const targetRoutes = new Set();
  for (const [index, target] of (catalog?.priorityTargets || []).entries()) {
    const label = `priorityTarget[${index}]`;
    exactKeys(target, TARGET_KEYS, label, issues);
    if (!/^\/[a-z0-9-]+$/.test(String(target.route || '')) || targetRoutes.has(target.route)) issues.push(`${label}:unique-route`);
    targetRoutes.add(target.route);
    if (!['P0', 'P1'].includes(target.priority)) issues.push(`${label}:priority`);
    if (!String(target.evidenceNeeded || '').trim()) issues.push(`${label}:evidence-needed`);
    if (routes.has(target.route)) issues.push(`${label}:already-benchmarked`);
  }
  return issues;
}

function closeEnough(actual, expected, absTolerance) {
  if (actual === Infinity && expected === Infinity) return true;
  if (actual === -Infinity && expected === -Infinity) return true;
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  return Math.abs(actual - expected) <= absTolerance;
}

function runBenchmarks(catalog, options = {}) {
  const catalogIssues = validateCatalog(catalog);
  if (catalogIssues.length) {
    return {
      schemaVersion: 1,
      kind: 'independent-engineering-benchmarks-result.v1',
      generatedAt: new Date().toISOString(),
      status: 'blocked',
      summary: {
        eligibleFormalRoutes: Number(catalog?.portfolio?.eligibleFormalRoutes) || 0,
        pilotRequired: Array.isArray(catalog?.benchmarks) ? catalog.benchmarks.length : 0,
        pilotVerified: 0,
        independentlyVerifiedRoutes: 0,
        priorityTargets: Array.isArray(catalog?.priorityTargets) ? catalog.priorityTargets.length : 0,
        issueCount: catalogIssues.length
      },
      records: [],
      issues: catalogIssues
    };
  }

  const loadModule = options.loadProduction || loadProductionModule;
  const records = [];
  const issues = [];
  for (const benchmark of catalog.benchmarks) {
    const recordIssues = [];
    let production;
    let expected;
    try {
      const moduleApi = loadModule(benchmark.productionModule, benchmark);
      if (!moduleApi || typeof moduleApi.calculate !== 'function') throw new Error('calculate-export-required');
      const validationErrors = typeof moduleApi.validateInput === 'function' ? moduleApi.validateInput(benchmark.input) : [];
      if (validationErrors.length) throw new Error(`production-input-invalid:${validationErrors.join('|')}`);
      production = moduleApi.calculate(benchmark.input);
      expected = ORACLES[benchmark.oracle](benchmark.input);
    } catch (error) {
      recordIssues.push(`benchmark-execution:${error.message}`);
    }
    if (production && expected) {
      for (const assertion of benchmark.assertions) {
        const actualValue = getPath(production, assertion.path);
        const expectedValue = getPath(expected, assertion.path);
        if (!closeEnough(actualValue, expectedValue, assertion.absTolerance)) {
          recordIssues.push(`benchmark-value-mismatch:${assertion.path}:actual=${actualValue}:expected=${expectedValue}`);
        }
      }
    }
    issues.push(...recordIssues.map(issue => `${benchmark.id}:${issue}`));
    records.push({
      id: benchmark.id,
      route: benchmark.route,
      title: benchmark.title,
      status: recordIssues.length ? 'blocked' : 'verified',
      referenceType: benchmark.referenceType,
      referenceBasis: benchmark.referenceBasis,
      assertionCount: benchmark.assertions.length,
      issues: recordIssues
    });
  }
  const pilotVerified = records.filter(record => record.status === 'verified').length;
  return {
    schemaVersion: 1,
    kind: 'independent-engineering-benchmarks-result.v1',
    generatedAt: new Date().toISOString(),
    status: issues.length === 0 && pilotVerified === catalog.benchmarks.length ? 'ready' : 'blocked',
    summary: {
      eligibleFormalRoutes: catalog.portfolio.eligibleFormalRoutes,
      pilotRequired: catalog.benchmarks.length,
      pilotVerified,
      independentlyVerifiedRoutes: new Set(records.filter(record => record.status === 'verified').map(record => record.route)).size,
      priorityTargets: catalog.priorityTargets.length,
      issueCount: issues.length
    },
    records,
    priorityTargets: catalog.priorityTargets,
    issues
  };
}

function parseArgs(argv) {
  const args = { catalogPath: defaultCatalogPath, outputPath: defaultOutputPath, json: false, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') args.json = true;
    else if (token === '--write') args.write = true;
    else if (token === '--catalog') args.catalogPath = path.resolve(argv[++index] || '');
    else if (token === '--output') args.outputPath = path.resolve(argv[++index] || '');
    else throw new Error(`unknown-argument:${token}`);
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const catalog = JSON.parse(fs.readFileSync(args.catalogPath, 'utf8').replace(/^\uFEFF/, ''));
  const result = runBenchmarks(catalog);
  if (args.write) {
    fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
    fs.writeFileSync(args.outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`Independent engineering benchmarks: ${result.status}; pilot ${result.summary.pilotVerified}/${result.summary.pilotRequired}; formal portfolio ${result.summary.independentlyVerifiedRoutes}/${result.summary.eligibleFormalRoutes}; issues ${result.summary.issueCount}\n`);
  }
  return result.status === 'ready' ? 0 : 2;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 3;
  }
}

module.exports = {
  ORACLES,
  validateCatalog,
  runBenchmarks,
  main
};
