const fs = require('fs');
const path = require('path');

const toolsRoot = __dirname;
const repoRoot = path.resolve(toolsRoot, '..', '..');
const defaultCatalogPath = path.join(toolsRoot, 'independent-engineering-benchmarks.catalog.json');
const defaultOutputPath = path.join(repoRoot, 'output', 'audit', 'independent-engineering-benchmarks.json');

const ROOT_KEYS = ['schemaVersion', 'kind', 'portfolio', 'benchmarks', 'candidateBenchmarks', 'priorityTargets'];
const PORTFOLIO_KEYS = ['eligibleState', 'eligibleFormalRoutes', 'scopeNote'];
const BENCHMARK_KEYS = ['id', 'route', 'title', 'productionModule', 'oracle', 'referenceType', 'referenceBasis', 'input', 'assertions'];
const CANDIDATE_KEYS = ['id', 'capability', 'title', 'productionModule', 'oracle', 'referenceType', 'referenceBasis', 'expectedOutcome', 'input', 'assertions'];
const ASSERTION_KEYS = ['path', 'absTolerance'];
const TARGET_KEYS = ['route', 'priority', 'evidenceNeeded'];
const CANDIDATE_OUTCOMES = new Set(['strength-pass', 'strength-reject']);

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
  const averageReaction = designWeight / i.supportCount;
  let reactions = Array.from({ length: i.supportCount }, () => averageReaction);
  let reactionMomentX = 0;
  let reactionMomentY = 0;
  let reactionEquilibriumMomentX = 0;
  let reactionEquilibriumMomentY = 0;
  let reactionEccentricityRatio = 0;
  let reactionUtilization = null;
  if (i.reactionMode === 'eccentric-rectangular-4') {
    const halfX = i.supportSpacingX / 2;
    const halfY = i.supportSpacingY / 2;
    const points = [
      [-halfX, halfY],
      [halfX, halfY],
      [halfX, -halfY],
      [-halfX, -halfY]
    ];
    reactionMomentX = designWeight * i.cgEccentricityY;
    reactionMomentY = designWeight * i.cgEccentricityX;
    reactions = points.map(([x, y]) => (
      averageReaction
      + reactionMomentY * x / (i.supportSpacingX * i.supportSpacingX)
      + reactionMomentX * y / (i.supportSpacingY * i.supportSpacingY)
    ));
    reactionEquilibriumMomentX = reactions.reduce((sum, reaction, index) => sum + reaction * points[index][1], 0);
    reactionEquilibriumMomentY = reactions.reduce((sum, reaction, index) => sum + reaction * points[index][0], 0);
    reactionEccentricityRatio = Math.abs(i.cgEccentricityX) / i.supportSpacingX
      + Math.abs(i.cgEccentricityY) / i.supportSpacingY;
    reactionUtilization = reactionEccentricityRatio / 0.5;
  }
  const pointLoad = Math.max(...reactions);
  const spreadB = i.contactB + 2 * i.spreadDepth;
  const spreadL = i.contactL + 2 * i.spreadDepth;
  return {
    serviceWeight,
    designWeight,
    averageReaction,
    maximumReaction: pointLoad,
    minimumReaction: Math.min(...reactions),
    reactionSum: reactions.reduce((sum, reaction) => sum + reaction, 0),
    reactionMomentX,
    reactionMomentY,
    reactionEquilibriumMomentX,
    reactionEquilibriumMomentY,
    reactionEccentricityRatio,
    reactionUtilization,
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
    const epsY = Math.abs(i.fy - 4200) < 1e-9 ? 0.002 : i.fy / 2.04e6;
    const epsTLimit = epsY + 0.003;
    const phi = epsT >= epsTLimit
      ? 0.9
      : (epsT <= epsY ? 0.65 : 0.65 + 0.25 * (epsT - epsY) / (epsTLimit - epsY));
    const Mn = tensileForce * (d - a / 2);
    return { c, a, Cc:tensileForce, eqN:0, Mn, epsT, phi, phiMn:phi * Mn, valid:1 };
  };
  const positive = flexure(i.asPositive, i.dPositive);
  const negative = flexure(i.asNegative, i.dNegative);
  const fyForAsMin = Math.min(i.fy, 5600);
  const asMin = d => Math.max(0.8 * Math.sqrt(i.fc) / fyForAsMin, 14 / fyForAsMin) * i.b * d;

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
  const epsTy = Math.abs(i.fy - 4200) < 1e-9 ? 0.002 : i.fy / 2.04e6;
  const epsTLimit = epsTy + 0.003;
  const positiveTensionControlled = positive.epsT >= epsTLimit;
  const negativeTensionControlled = negative.epsT >= epsTLimit;
  const asMinPositive = asMin(i.dPositive);
  const asMinNegative = asMin(i.dNegative);
  const asMinPositivePass = i.asPositive >= asMinPositive;
  const asMinNegativePass = i.asNegative >= asMinNegative;
  const positiveRho = i.asPositive / (i.b * i.dPositive);
  const negativeRho = i.asNegative / (i.b * i.dNegative);
  const rhoSmrfLimit = Math.min((Math.sqrt(i.fc) + 100) / (4 * i.fy), 0.025);
  const positiveSmrfRhoPass = positiveRho <= rhoSmrfLimit;
  const negativeSmrfRhoPass = negativeRho <= rhoSmrfLimit;
  const longitudinalDetailPass = positiveTensionControlled && negativeTensionControlled
    && asMinPositivePass && asMinNegativePass && positiveSmrfRhoPass && negativeSmrfRhoPass;
  const spanDepthRatio = i.ln / i.h;
  const loadDistanceProvided = Number.isFinite(Number(i.loadDistance)) && Number(i.loadDistance) >= 0;
  const loadDistanceRatio = loadDistanceProvided ? i.loadDistance / i.h : null;
  const deepBySpan = spanDepthRatio <= 4;
  const deepByLoad = loadDistanceProvided && loadDistanceRatio <= 2;
  const methodApplicable = !deepBySpan && !deepByLoad;
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
    epsTy,
    epsTLimit,
    positiveTensionControlled:positiveTensionControlled ? 1 : 0,
    negativeTensionControlled:negativeTensionControlled ? 1 : 0,
    asMinPositive,
    asMinNegative,
    asMinPositivePass:asMinPositivePass ? 1 : 0,
    asMinNegativePass:asMinNegativePass ? 1 : 0,
    positiveRho,
    negativeRho,
    rhoSmrfLimit,
    positiveSmrfRhoPass:positiveSmrfRhoPass ? 1 : 0,
    negativeSmrfRhoPass:negativeSmrfRhoPass ? 1 : 0,
    longitudinalDetailPass:longitudinalDetailPass ? 1 : 0,
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
    spanDepthRatio,
    loadDistanceRatio,
    deepBySpan:deepBySpan ? 1 : 0,
    deepByLoad:deepByLoad ? 1 : 0,
    methodApplicable:methodApplicable ? 1 : 0,
    overallPass:governingUtilization <= 1 && longitudinalDetailPass && hasMinStir && methodApplicable ? 1 : 0
  };
}

function stmTieLayoutOracle(input) {
  const rowBase = Math.floor(input.count / input.rows);
  const remainder = input.count % input.rows;
  const rowCounts = Array.from({ length:input.rows }, (_, index) => rowBase + (index < remainder ? 1 : 0));
  const requiredHorizontalClear = Math.max(2.5, input.barDiameter, (4 / 3) * input.maxAggregateSize);
  const insideWidth = input.bw - 2 * (input.sideCover + input.transverseBarDiameter);
  const maxBarsPerRow = Math.max(0, Math.floor((insideWidth + requiredHorizontalClear + 1e-9)
    / (input.barDiameter + requiredHorizontalClear)));
  const horizontalClears = rowCounts.map(count => count <= 1
    ? Infinity
    : (insideWidth - count * input.barDiameter) / (count - 1));
  const minHorizontalClear = Math.min(...horizontalClears);
  const requiredVerticalClear = 2.5;
  const tieBandDepth = input.rows * input.barDiameter + (input.rows - 1) * input.verticalClearSpacing;
  const availableDepth = input.h - 2 * (input.sideCover + input.transverseBarDiameter);
  const firstCenter = input.sideCover + input.transverseBarDiameter + input.barDiameter / 2;
  const rowCenters = rowCounts.map((_, index) => firstCenter
    + index * (input.barDiameter + input.verticalClearSpacing));
  const centroidFromBottom = rowCenters.reduce((sum, center, index) => sum + center * rowCounts[index], 0)
    / input.count;
  const providedArea = input.count * input.barArea;
  const layoutOk = rowCounts.every(count => count <= maxBarsPerRow)
    && minHorizontalClear >= requiredHorizontalClear - 1e-9
    && (input.rows === 1 || input.verticalClearSpacing >= requiredVerticalClear - 1e-9)
    && tieBandDepth <= availableDepth + 1e-9;
  return {
    rowCounts,
    requiredHorizontalClear,
    minHorizontalClear,
    tieBandDepth,
    centroidFromBottom,
    providedArea,
    layoutOk,
  };
}

function stmDirectTieLayoutInput(i, bw = i.bw, h = i.h) {
  return {
    bw,
    h,
    barArea:i.tieBarArea,
    barDiameter:i.tieBarDiameter,
    count:i.tieCount,
    rows:i.tieRows,
    sideCover:i.tieSideCover,
    transverseBarDiameter:i.tieTransverseBarDiameter,
    maxAggregateSize:i.maxAggregateSize,
    verticalClearSpacing:i.tieVerticalClearSpacing,
  };
}

function stmNestedTieLayoutInput(source, bw, h) {
  return {
    bw,
    h,
    barArea:source.barArea,
    barDiameter:source.barDiameter,
    count:source.count,
    rows:source.rows,
    sideCover:source.sideCover,
    transverseBarDiameter:source.transverseBarDiameter,
    maxAggregateSize:source.maxAggregateSize,
    verticalClearSpacing:source.verticalClearSpacing,
  };
}

function stmPileReactionFactor(distanceFromSection, pileDiameter) {
  const half = pileDiameter / 2;
  if (distanceFromSection >= half - 1e-9) return 1;
  if (distanceFromSection <= -half + 1e-9) return 0;
  return (distanceFromSection + half) / pileDiameter;
}

function rcDeepBeamStmOracle(input) {
  const i = input.case;
  const phi = 0.75;
  const layout = stmTieLayoutOracle(stmDirectTieLayoutInput(i));
  const a = i.ln / 2;
  const reaction = i.Pu / 2;
  const thetaRad = Math.atan2(i.z, a);
  const thetaDeg = thetaRad * 180 / Math.PI;
  const strutDemand = reaction / Math.sin(thetaRad);
  const tieDemand = reaction / Math.tan(thetaRad);
  const fyForMinimum = Math.min(i.fy, 5600);
  const tieAsStm = tieDemand * 1000 / (phi * i.fy);
  const tieAsMin = Math.max(0.8 * Math.sqrt(i.fc) / fyForMinimum, 14 / fyForMinimum) * i.bw * i.d;
  const tieAsRequired = Math.max(tieAsStm, tieAsMin);
  const strutFce = 0.85 * i.betaC * i.betaS * i.fc;
  const strutDesign = phi * strutFce * i.bw * i.strutWidth / 1000;
  const topNodeDesign = phi * 0.85 * i.betaC * i.fc * i.bw * i.topNodeWidth / 1000;
  const bottomNodeDesign = phi * 0.85 * i.betaC * 0.8 * i.fc * i.bw * i.bottomNodeWidth / 1000;
  const rhoVertical = i.verticalBarArea * i.verticalFaces / (i.bw * i.verticalSpacing);
  const rhoHorizontal = i.horizontalBarArea * i.horizontalFaces / (i.bw * i.horizontalSpacing);
  const distributedSpacingLimit = Math.min(i.d / 5, 30);
  const distributionOk = rhoVertical >= 0.0025 - 1e-9
    && rhoHorizontal >= 0.0025 - 1e-9
    && i.verticalSpacing <= distributedSpacingLimit + 1e-9
    && i.horizontalSpacing <= distributedSpacingLimit + 1e-9;
  const shearDesignLimit99 = phi * 2.65 * i.lambda * Math.sqrt(i.fc) * i.bw * i.d / 1000;
  const shearDesignLimit2344 = phi * 1.32 * Math.tan(thetaRad) * i.lambda
    * (distributionOk ? 1 : 0) * Math.sqrt(i.fc) * i.bw * i.d / 1000;
  const tieOk = layout.providedArea >= tieAsRequired - 1e-9;
  const strutOk = strutDesign >= strutDemand - 1e-9;
  const nodesOk = i.topNodeWidth <= i.loadBearingWidth + 1e-9
    && i.bottomNodeWidth <= i.supportBearingWidth + 1e-9
    && topNodeDesign >= Math.max(i.Pu, strutDemand) - 1e-9
    && bottomNodeDesign >= Math.max(reaction, strutDemand) - 1e-9;
  const shear2344Required = Math.abs(i.betaS - 0.75) < 1e-9;
  const shearLimitsOk = shearDesignLimit99 >= reaction - 1e-9
    && (!shear2344Required || shearDesignLimit2344 >= reaction - 1e-9);
  const deepBeam = i.ln <= 4 * i.h + 1e-9 || a <= 2 * i.h + 1e-9;
  const strengthPass = deepBeam && thetaDeg >= 25 - 1e-9 && tieOk && layout.layoutOk
    && strutOk && nodesOk && distributionOk && shearLimitsOk;
  return {
    a,
    reaction,
    thetaRad,
    thetaDeg,
    angleMarginDeg:thetaDeg - 25,
    angleOk:thetaDeg >= 25 - 1e-9 ? 1 : 0,
    strutDemand,
    tieDemand,
    tieAsStm,
    tieAsMin,
    tieAsRequired,
    tieProvidedArea:layout.providedArea,
    tieCentroidFromBottom:layout.centroidFromBottom,
    tieMinHorizontalClear:layout.minHorizontalClear,
    tieBandDepth:layout.tieBandDepth,
    tieRows:i.tieRows,
    minimumSteelControls:tieAsMin >= tieAsStm - 1e-9 ? 1 : 0,
    strutFce,
    strutDesign,
    topNodeDesign,
    bottomNodeDesign,
    rhoVertical,
    rhoHorizontal,
    distributedSpacingLimit,
    shearDesignLimit99,
    shearDesignLimit2344,
    shear2344Required:shear2344Required ? 1 : 0,
    tieOk:tieOk ? 1 : 0,
    tieLayoutOk:layout.layoutOk ? 1 : 0,
    strutOk:strutOk ? 1 : 0,
    nodesOk:nodesOk ? 1 : 0,
    distributionOk:distributionOk ? 1 : 0,
    shearLimitsOk:shearLimitsOk ? 1 : 0,
    strengthPass:strengthPass ? 1 : 0,
  };
}

function rcFoundation2dStmOracle(input) {
  const i = input.case;
  const phi = 0.75;
  const layout = stmTieLayoutOracle(stmDirectTieLayoutInput(i));
  const d = i.h - layout.centroidFromBottom;
  const z = i.h - i.loadNodeDepth - layout.centroidFromBottom;
  const reactionModeSoilUniform = i.reactionMode === 'soil-uniform';
  const soilLineReaction = reactionModeSoilUniform ? i.soilPressure * i.soilTributaryWidth / 100 : null;
  const reactionNodes = reactionModeSoilUniform
    ? [
      { x:-i.ln / 4, reaction:soilLineReaction * i.ln / 200 },
      { x:i.ln / 4, reaction:soilLineReaction * i.ln / 200 },
    ]
    : [...i.pileReactions];
  const nodes = reactionNodes.sort((left, right) => left.x - right.x).map(node => {
    const thetaRad = Math.atan2(z, Math.abs(node.x));
    return {
      ...node,
      thetaRad,
      thetaDeg:thetaRad * 180 / Math.PI,
      strutDemand:node.reaction / Math.sin(thetaRad),
      horizontal:node.reaction * node.x / z,
    };
  });
  const reactionTotal = nodes.reduce((sum, node) => sum + node.reaction, 0);
  const reactionMoment = nodes.reduce((sum, node) => sum + node.reaction * node.x, 0);
  const balanceErrorPct = Math.abs(reactionTotal - i.Pu) / i.Pu * 100;
  const momentErrorPct = Math.abs(reactionMoment) / (i.Pu * i.ln / 2) * 100;
  const horizontalResidual = nodes.reduce((sum, node) => sum + node.horizontal, 0);
  const horizontalAction = nodes.reduce((sum, node) => sum + Math.abs(node.horizontal), 0);
  const horizontalResidualPct = Math.abs(horizontalResidual) / horizontalAction * 100;
  const minThetaDeg = Math.min(...nodes.map(node => node.thetaDeg));
  let cumulative = 0;
  const tieSegments = nodes.slice(0, -1).map(node => {
    cumulative += node.reaction * node.x / z;
    return Math.abs(cumulative);
  });
  const tieDemand = Math.max(...tieSegments);
  const tieAsStm = tieDemand * 1000 / (phi * i.fy);
  const tieAsRequired = Math.max(tieAsStm, i.tieMinimumArea);
  const strutFce = 0.85 * i.betaC * i.betaS * i.fc;
  const strutDesign = phi * strutFce * i.bw * i.strutWidth / 1000;
  const maximumStrutDemand = Math.max(...nodes.map(node => node.strutDemand));
  const maxStrutDcr = maximumStrutDemand / strutDesign;
  const topNodeDesign = phi * 0.85 * i.betaC * i.fc * i.bw * i.topNodeWidth / 1000;
  const bottomNodeDesign = phi * 0.85 * i.betaC * 0.8 * i.fc * i.bw * i.bottomNodeWidth / 1000;
  const criticalSectionX = i.columnWidth / 2 + d;
  let shearLeft = 0;
  let shearRight = 0;
  if (reactionModeSoilUniform) {
    const outsideLength = Math.max(0, i.ln / 2 - criticalSectionX);
    shearLeft = soilLineReaction * outsideLength / 100;
    shearRight = shearLeft;
  } else {
    for (const node of nodes) {
      if (node.x > 0) shearRight += node.reaction * stmPileReactionFactor(node.x - criticalSectionX, i.pileDiameter);
      if (node.x < 0) shearLeft += node.reaction * stmPileReactionFactor(-node.x - criticalSectionX, i.pileDiameter);
    }
  }
  const shearDemand = Math.max(shearLeft, shearRight);
  const lambdaS = i.distributionReinforcementComplies ? 1 : Math.sqrt(2 / (1 + d / 25));
  const shearDesignLimit2344 = phi * 1.32 * Math.tan(minThetaDeg * Math.PI / 180)
    * i.lambda * lambdaS * Math.sqrt(i.fc) * i.bw * d / 1000;
  const symmetric = reactionModeSoilUniform || nodes.every((node) => {
    const opposite = nodes.find(candidate => Math.abs(candidate.x + node.x) < 1e-9);
    return opposite && Math.abs(opposite.reaction - node.reaction) < 1e-9;
  });
  const topologyOk = balanceErrorPct <= i.balanceTolerancePct + 1e-9
    && momentErrorPct <= i.momentTolerancePct + 1e-9
    && horizontalResidualPct <= (i.horizontalTolerancePct ?? 1) + 1e-9
    && symmetric;
  const tieOk = layout.providedArea >= tieAsRequired - 1e-9;
  const strutOk = strutDesign >= maximumStrutDemand - 1e-9;
  const bottomNodesOk = i.bottomNodeWidth <= i.supportBearingWidth + 1e-9
    && nodes.every(node => bottomNodeDesign >= Math.max(node.reaction, node.strutDemand) - 1e-9);
  const nodesOk = i.topNodeWidth <= i.columnWidth + 1e-9
    && topNodeDesign >= i.Pu - 1e-9
    && bottomNodesOk;
  const shear2344Required = Math.abs(i.betaS - 0.75) < 1e-9;
  const shear2344Ok = !shear2344Required || shearDesignLimit2344 >= shearDemand - 1e-9;
  const pileEffectiveDepthOk = reactionModeSoilUniform || d >= 30 - 1e-9;
  const strengthPass = topologyOk && minThetaDeg >= 25 - 1e-9 && tieOk && layout.layoutOk
    && strutOk && nodesOk && shear2344Ok && pileEffectiveDepthOk;
  return {
    d,
    z,
    reactionModeSoilUniform:reactionModeSoilUniform ? 1 : 0,
    reactionNodeCount:nodes.length,
    reactionTotal,
    reactionMoment,
    balanceErrorPct,
    momentErrorPct,
    horizontalResidual,
    horizontalAction,
    horizontalResidualPct,
    minThetaDeg,
    angleMarginDeg:minThetaDeg - 25,
    angleOk:minThetaDeg >= 25 - 1e-9 ? 1 : 0,
    firstStrutDemand:nodes[0].strutDemand,
    maximumStrutDemand,
    firstTieSegmentDemand:tieSegments[0],
    middleTieSegmentDemand:tieSegments[Math.floor(tieSegments.length / 2)],
    tieDemand,
    tieAsStm,
    tieAsRequired,
    tieProvidedArea:layout.providedArea,
    tieCentroidFromBottom:layout.centroidFromBottom,
    tieRows:i.tieRows,
    strutFce,
    strutDesign,
    maxStrutDcr,
    topNodeDesign,
    bottomNodeDesign,
    criticalSectionX,
    shearDemand,
    lambdaS,
    shearDesignLimit2344,
    shear2344Margin:shearDesignLimit2344 - shearDemand,
    shear2344Required:shear2344Required ? 1 : 0,
    shear2344Ok:shear2344Ok ? 1 : 0,
    topologyOk:topologyOk ? 1 : 0,
    tieOk:tieOk ? 1 : 0,
    tieLayoutOk:layout.layoutOk ? 1 : 0,
    strutOk:strutOk ? 1 : 0,
    nodesOk:nodesOk ? 1 : 0,
    pileEffectiveDepthOk:pileEffectiveDepthOk ? 1 : 0,
    strengthPass:strengthPass ? 1 : 0,
  };
}

function stmDirectionalShearOracle(nodes, coordinate, sectionDistance, pileDiameter) {
  let negative = 0;
  let positive = 0;
  for (const node of nodes) {
    if (node[coordinate] > 0) positive += node.reaction
      * stmPileReactionFactor(node[coordinate] - sectionDistance, pileDiameter);
    if (node[coordinate] < 0) negative += node.reaction
      * stmPileReactionFactor(-node[coordinate] - sectionDistance, pileDiameter);
  }
  return Math.max(negative, positive);
}

function stmDirectionalTieDemandOracle(nodes, coordinate, component) {
  const coordinates = [...new Set(nodes.map(node => node[coordinate]))].sort((a, b) => a - b);
  return Math.max(...coordinates.slice(0, -1).map((value, index) => {
    const cut = (value + coordinates[index + 1]) / 2;
    return Math.abs(nodes.filter(node => node[coordinate] <= cut + 1e-9)
      .reduce((sum, node) => sum + node[component], 0));
  }));
}

function rcPileCap3dStmOracle(input) {
  const i = input.case;
  const phi = 0.75;
  const xLayout = stmTieLayoutOracle(stmNestedTieLayoutInput(i.xTie, i.capWidthY, i.h));
  const yLayout = stmTieLayoutOracle(stmNestedTieLayoutInput(i.yTie, i.capLengthX, i.h));
  const loadX = i.My * 100 / i.Pu;
  const loadY = i.Mx * 100 / i.Pu;
  const xTieCentroidFromBottom = xLayout.centroidFromBottom;
  const yTieCentroidFromBottom = yLayout.centroidFromBottom;
  const z = i.h - i.loadNodeDepth - (xTieCentroidFromBottom + yTieCentroidFromBottom) / 2;
  const dX = i.h - xTieCentroidFromBottom;
  const dY = i.h - yTieCentroidFromBottom;
  const nodes = i.pileReactions.map(node => {
    const dx = node.x - loadX;
    const dy = node.y - loadY;
    const planDistance = Math.hypot(dx, dy);
    const length = Math.hypot(planDistance, z);
    return {
      ...node,
      dx,
      dy,
      thetaDeg:Math.atan2(z, planDistance) * 180 / Math.PI,
      thetaXDeg:Math.abs(dx) < 1e-9 ? 90 : Math.atan2(z, Math.abs(dx)) * 180 / Math.PI,
      thetaYDeg:Math.abs(dy) < 1e-9 ? 90 : Math.atan2(z, Math.abs(dy)) * 180 / Math.PI,
      strutDemand:node.reaction * length / z,
      horizontalX:node.reaction * dx / z,
      horizontalY:node.reaction * dy / z,
    };
  });
  const reactionTotal = nodes.reduce((sum, node) => sum + node.reaction, 0);
  const reactionMomentX = nodes.reduce((sum, node) => sum + node.reaction * node.y, 0);
  const reactionMomentY = nodes.reduce((sum, node) => sum + node.reaction * node.x, 0);
  const targetMomentX = i.Mx * 100;
  const targetMomentY = i.My * 100;
  const forceErrorPct = Math.abs(reactionTotal - i.Pu) / i.Pu * 100;
  const momentXErrorPct = Math.abs(reactionMomentX - targetMomentX) / (i.Pu * i.capWidthY / 2) * 100;
  const momentYErrorPct = Math.abs(reactionMomentY - targetMomentY) / (i.Pu * i.capLengthX / 2) * 100;
  const horizontalResidualX = nodes.reduce((sum, node) => sum + node.horizontalX, 0);
  const horizontalResidualY = nodes.reduce((sum, node) => sum + node.horizontalY, 0);
  const horizontalActionX = nodes.reduce((sum, node) => sum + Math.abs(node.horizontalX), 0);
  const horizontalActionY = nodes.reduce((sum, node) => sum + Math.abs(node.horizontalY), 0);
  const horizontalResidualXPct = Math.abs(horizontalResidualX) / horizontalActionX * 100;
  const horizontalResidualYPct = Math.abs(horizontalResidualY) / horizontalActionY * 100;
  const minThetaDeg = Math.min(...nodes.map(node => node.thetaDeg));
  const minThetaXDeg = Math.min(...nodes.map(node => node.thetaXDeg));
  const minThetaYDeg = Math.min(...nodes.map(node => node.thetaYDeg));
  const xTieDemand = stmDirectionalTieDemandOracle(nodes, 'x', 'horizontalX');
  const yTieDemand = stmDirectionalTieDemandOracle(nodes, 'y', 'horizontalY');
  const xTieAsStm = xTieDemand * 1000 / (phi * i.fy);
  const yTieAsStm = yTieDemand * 1000 / (phi * i.fy);
  const xTieAsRequired = Math.max(xTieAsStm, i.xTieMinimumArea);
  const yTieAsRequired = Math.max(yTieAsStm, i.yTieMinimumArea);
  const strutFce = 0.85 * i.betaC * i.betaS * i.fc;
  const strutDesign = phi * strutFce * i.strutArea / 1000;
  const maxStrutDcr = Math.max(...nodes.map(node => node.strutDemand / strutDesign));
  const topNodeDesign = phi * 0.85 * i.betaC * i.fc * i.topNodeArea / 1000;
  const bottomNodeDesign = phi * 0.85 * i.betaC * 0.8 * i.fc * i.bottomNodeArea / 1000;
  const criticalSectionX = i.columnX / 2 + dX;
  const criticalSectionY = i.columnY / 2 + dY;
  const shearX = stmDirectionalShearOracle(nodes, 'x', criticalSectionX, i.pileDiameter);
  const shearY = stmDirectionalShearOracle(nodes, 'y', criticalSectionY, i.pileDiameter);
  const lambdaSX = i.distributionReinforcementComplies ? 1 : Math.sqrt(2 / (1 + dX / 25));
  const lambdaSY = i.distributionReinforcementComplies ? 1 : Math.sqrt(2 / (1 + dY / 25));
  const shearDesignLimitX = phi * 1.32 * Math.tan(minThetaXDeg * Math.PI / 180)
    * i.lambda * lambdaSX * Math.sqrt(i.fc) * i.capWidthY * dX / 1000;
  const shearDesignLimitY = phi * 1.32 * Math.tan(minThetaYDeg * Math.PI / 180)
    * i.lambda * lambdaSY * Math.sqrt(i.fc) * i.capLengthX * dY / 1000;
  const pileNodeCount = nodes.length;
  const gridXCount = new Set(nodes.map(node => node.x)).size;
  const gridYCount = new Set(nodes.map(node => node.y)).size;
  const topologyOk = forceErrorPct <= (i.balanceTolerancePct ?? 2) + 1e-9
    && momentXErrorPct <= (i.momentTolerancePct ?? 1) + 1e-9
    && momentYErrorPct <= (i.momentTolerancePct ?? 1) + 1e-9
    && horizontalResidualXPct <= (i.horizontalTolerancePct ?? 1) + 1e-9
    && horizontalResidualYPct <= (i.horizontalTolerancePct ?? 1) + 1e-9
    && Math.abs(loadX) <= i.columnX / 2 + 1e-9
    && Math.abs(loadY) <= i.columnY / 2 + 1e-9;
  const tiesOk = xLayout.layoutOk && yLayout.layoutOk
    && xLayout.providedArea >= xTieAsRequired - 1e-9
    && yLayout.providedArea >= yTieAsRequired - 1e-9;
  const tieLayerOffset = Math.abs(xTieCentroidFromBottom - yTieCentroidFromBottom);
  const tieLayerOffsetOk = tieLayerOffset <= Math.max(i.xTie.barDiameter, i.yTie.barDiameter) + 1e-9;
  const strutOk = maxStrutDcr <= 1 + 1e-9;
  const nodesOk = topNodeDesign >= i.Pu - 1e-9
    && nodes.every(node => bottomNodeDesign >= Math.max(node.reaction, node.strutDemand) - 1e-9);
  const pileEffectiveDepthOk = Math.min(dX, dY) >= 30 - 1e-9;
  const shear2344Required = Math.abs(i.betaS - 0.75) < 1e-9;
  const shearLimitsOk = !shear2344Required
    || (shearDesignLimitX >= shearX - 1e-9 && shearDesignLimitY >= shearY - 1e-9);
  const strengthPass = topologyOk && minThetaDeg >= 25 - 1e-9 && tiesOk && tieLayerOffsetOk
    && strutOk && nodesOk && shearLimitsOk && pileEffectiveDepthOk;
  return {
    loadX,
    loadY,
    pileNodeCount,
    gridXCount,
    gridYCount,
    z,
    dX,
    dY,
    reactionTotal,
    reactionMomentX,
    reactionMomentY,
    targetMomentX,
    targetMomentY,
    forceErrorPct,
    momentXErrorPct,
    momentYErrorPct,
    horizontalResidualX,
    horizontalResidualY,
    horizontalResidualXPct,
    horizontalResidualYPct,
    minThetaDeg,
    minThetaXDeg,
    minThetaYDeg,
    angleMarginDeg:minThetaDeg - 25,
    angleOk:minThetaDeg >= 25 - 1e-9 ? 1 : 0,
    xTieDemand,
    yTieDemand,
    xTieAsStm,
    yTieAsStm,
    xTieAsRequired,
    yTieAsRequired,
    xTieProvidedArea:xLayout.providedArea,
    yTieProvidedArea:yLayout.providedArea,
    xTieCentroidFromBottom,
    yTieCentroidFromBottom,
    xTieRows:i.xTie.rows,
    yTieRows:i.yTie.rows,
    tieLayerOffset,
    tieLayerOffsetLimit:Math.max(i.xTie.barDiameter, i.yTie.barDiameter),
    tieLayerOffsetMargin:Math.max(i.xTie.barDiameter, i.yTie.barDiameter) - tieLayerOffset,
    strutFce,
    strutDesign,
    maxStrutDcr,
    topNodeDesign,
    bottomNodeDesign,
    criticalSectionX,
    criticalSectionY,
    shearX,
    shearY,
    lambdaSX,
    lambdaSY,
    shearDesignLimitX,
    shearDesignLimitY,
    shear2344Required:shear2344Required ? 1 : 0,
    shearLimitsOk:shearLimitsOk ? 1 : 0,
    topologyOk:topologyOk ? 1 : 0,
    tiesOk:tiesOk ? 1 : 0,
    tieLayerOffsetOk:tieLayerOffsetOk ? 1 : 0,
    strutOk:strutOk ? 1 : 0,
    nodesOk:nodesOk ? 1 : 0,
    pileEffectiveDepthOk:pileEffectiveDepthOk ? 1 : 0,
    strengthPass:strengthPass ? 1 : 0,
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

function rcWallStrengthOracle(input) {
  const bool = value => value ? 1 : 0;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const hmin = item => {
    if (item.wallType === 'bearing') return Math.max(10, Math.min(item.lc, item.lw) / 25);
    if (item.wallType === 'nonbearing') return Math.max(10, Math.min(item.lc, item.lw) / 30);
    if (item.wallType === 'basement') return 20;
    return Math.max(10, item.lc / 25, item.lw / 25);
  };
  const alphaC = ratio => ratio <= 1.5 ? 0.8 : ratio >= 2 ? 0.53 : 0.8 + (0.53 - 0.8) * (ratio - 1.5) / 0.5;

  const pmEnvelope = item => {
    const edgeOffset = item.cover + item.hBarDb + item.vBarDb / 2;
    const usableLength = item.lw - 2 * edgeOffset;
    const intervals = Math.max(1, Math.ceil(usableLength / item.vSp));
    const actualSpacing = usableLength / intervals;
    const distributedRows = intervals + 1;
    const bars = Array.from({ length:distributedRows }, (_, index) => ({
      y:edgeOffset + actualSpacing * index,
      As:item.layers * item.vBarArea,
    }));
    const boundaryEnabled = item.boundaryBarCountEach > 0;
    const boundaryEdgeOffset = boundaryEnabled ? item.cover + item.hBarDb + item.boundaryBarDb / 2 : 0;
    if (boundaryEnabled) {
      bars.push({ y:boundaryEdgeOffset, As:item.boundaryBarCountEach * item.boundaryBarArea });
      bars.push({ y:item.lw - boundaryEdgeOffset, As:item.boundaryBarCountEach * item.boundaryBarArea });
      bars.sort((a, b) => a.y - b.y);
    }
    const AstDistributed = distributedRows * item.layers * item.vBarArea;
    const AstBoundary = item.boundaryBarCountEach * 2 * item.boundaryBarArea;
    const Ast = AstDistributed + AstBoundary;
    const Ag = item.h * item.lw;
    const beta1 = item.fc <= 280 ? 0.85 : item.fc >= 560 ? 0.65 : 0.85 - 0.05 * (item.fc - 280) / 70;
    const Po = (0.85 * item.fc * (Ag - Ast) + item.fy * Ast) / 1000;
    const phiPnMax = 0.65 * 0.8 * Po;
    const dt = Math.max(...bars.map(bar => bar.y));
    const nominal = [{ P:Po, M:0, phi:0.65, c:5 * item.lw }];
    for (let step = 0; step < item.pmSteps; step += 1) {
      const cRatio = 5 - (5 - 0.02) * step / (item.pmSteps - 1);
      const c = cRatio * item.lw;
      const a = Math.min(beta1 * c, item.lw);
      const Cc = 0.85 * item.fc * item.h * a;
      let Pn = Cc;
      let Mn = Cc * (item.lw / 2 - a / 2);
      for (const bar of bars) {
        const strain = 0.003 * (c - bar.y) / c;
        const stress = clamp(strain * 2.04e6, -item.fy, item.fy);
        const force = bar.y < a ? (stress - 0.85 * item.fc) * bar.As : stress * bar.As;
        Pn += force;
        Mn += force * (item.lw / 2 - bar.y);
      }
      const epsT = 0.003 * (dt - c) / c;
      const phi = epsT >= 0.005 ? 0.9 : epsT <= 0.002 ? 0.65 : 0.65 + 0.25 * (epsT - 0.002) / 0.003;
      nominal.push({ P:Pn / 1000, M:Math.abs(Mn) / 1e5, phi, c });
    }
    nominal.push({ P:-Ast * item.fy / 1000, M:0, phi:0.9, c:0 });
    const design = nominal.map(point => ({
      P:point.P > 0 ? Math.min(point.phi * point.P, phiPnMax) : point.phi * point.P,
      M:point.phi * point.M,
    }));
    const pMin = Math.min(...design.map(point => point.P));
    const pMax = Math.max(...design.map(point => point.P));
    const moment = item.M == null ? item.P * item.e / 100 : item.M;
    let phiMn = 0;
    for (let index = 0; index < design.length - 1; index += 1) {
      const A = design[index];
      const B = design[index + 1];
      if ((A.P - item.P) * (B.P - item.P) <= 0 && A.P !== B.P) {
        const fraction = (item.P - A.P) / (B.P - A.P);
        phiMn = Math.max(phiMn, A.M + fraction * (B.M - A.M));
      }
    }
    const axialOk = item.P >= pMin - 1e-9 && item.P <= pMax + 1e-9;
    const utilization = phiMn > 0 ? Math.abs(moment) / phiMn : Math.abs(moment) > 0 ? Infinity : 0;
    return {
      moment, evaluated:axialOk && Number.isFinite(utilization), axialOut:!axialOk,
      ok:axialOk && Math.abs(moment) <= phiMn + 1e-9,
      phiMn, utilization, pMin, pMax, Po, phiPnMax,
      distributedRows, distributedBars:distributedRows * item.layers,
      boundaryBars:item.boundaryBarCountEach * 2,
      AstDistributed, AstBoundary, Ast,
      edgeOffset, boundaryEdgeOffset,
      throughThicknessOffset:item.cover + item.hBarDb + Math.max(item.vBarDb, boundaryEnabled ? item.boundaryBarDb : 0) / 2,
      actualSpacing,
    };
  };

  return Object.fromEntries(input.cases.map(item => {
    const isShearWall = item.seismic || item.wallType === 'shear';
    const minimumThickness = hmin(item);
    const hwlw = item.hw / item.lw;
    const hwlwPier = hwlw;
    const lwbw = item.lw / item.h;
    const wallPier = hwlwPier >= 2 && lwbw <= 2.5;
    const rhol = item.layers * item.vBarArea / (item.h * item.vSp);
    const rhot = item.layers * item.hBarArea / (item.h * item.hSp);
    const Ag = item.h * item.lw;
    const eLimit = item.h / 6;
    const eOk = Math.abs(item.e) <= eLimit + 1e-9;
    const Pn = 0.55 * item.fc * Ag * (1 - (item.k * item.lc / (32 * item.h)) ** 2);
    const phiPn = eOk && Pn > 0 ? 0.65 * Pn : 0;
    const ac = alphaC(hwlw);
    const Vn = Ag * (ac * item.lambda * Math.sqrt(item.fc) + rhot * item.fy);
    const phiVn = 0.75 * Vn;
    const VnLimit = 2.65 * Math.sqrt(item.fc) * Ag;
    const effectiveShearCapacity = isShearWall ? Math.min(phiVn, VnLimit) : phiVn;
    const shearDemand = Math.abs(item.V) * 1000;
    const shearUtilization = shearDemand / phiVn;
    const shearLimitUtilization = isShearWall ? shearDemand / VnLimit : 0;
    const shearControlUtilization = Math.max(shearUtilization, shearLimitUtilization);
    const axialUtilization = item.P > 1e-9 && phiPn > 0 ? item.P * 1000 / phiPn : 0;
    const simpleTensionFailClosed = item.P < -1e-9;
    const simpleEccentricityFailClosed = item.P > 1e-9 && (!eOk || !(phiPn > 0));
    const simpleEvaluated = !simpleTensionFailClosed && !simpleEccentricityFailClosed;
    const simpleOk = simpleEvaluated && Math.max(axialUtilization, shearControlUtilization) <= 1;
    const needTwoLayer = shearDemand > 0.5 * 0.75 * ac * item.lambda * Math.sqrt(item.fc) * Ag || hwlw >= 2;
    const rholMin = isShearWall ? 0.0025 : 0.0012;
    const rhotMin = isShearWall || needTwoLayer ? 0.0025 : 0.0020;
    const spacingGeneral = Math.min(3 * item.h, 45);
    const spacingVertical = item.lw / 3;
    const spacingHorizontal = item.lw / 5;
    const vSpacingOk = item.vSp <= spacingGeneral && (!isShearWall || item.vSp <= spacingVertical);
    const hSpacingOk = item.hSp <= spacingGeneral && (!isShearWall || item.hSp <= spacingHorizontal);
    const pm = pmEnvelope(item);

    let basement = { route:0, cantilever:0, simple:0, triCoef:0, uniCoef:0, pa:0, ps:0, pw:0, Mtri:0, Muni:0, Mw:0, Mu:0 };
    if (item.basement) {
      const isCantilever = item.basement.support === 'cantilever';
      const triCoef = isCantilever ? 1 / 6 : 0.0641;
      const uniCoef = isCantilever ? 1 / 2 : 1 / 8;
      const pa = item.basement.Ka * item.basement.gamma * item.basement.H;
      const ps = item.basement.Ka * item.basement.surcharge;
      const pw = item.basement.gammaWater * item.basement.waterHeight;
      const Mtri = triCoef * pa * item.basement.H ** 2;
      const Muni = uniCoef * ps * item.basement.H ** 2;
      const Mw = triCoef * pw * item.basement.waterHeight ** 2;
      basement = { route:1, cantilever:bool(isCantilever), simple:bool(!isCantilever), triCoef, uniCoef, pa, ps, pw, Mtri, Muni, Mw, Mu:1.6 * (Mtri + Muni + Mw) };
    }

    return [item.id, {
      bearingRoute:bool(item.wallType === 'bearing'),
      nonbearingRoute:bool(item.wallType === 'nonbearing'),
      basementRoute:basement.route,
      shearRoute:bool(isShearWall),
      basementCantileverRoute:basement.cantilever,
      basementSimpleRoute:basement.simple,
      hmin:minimumThickness,
      thicknessOk:bool(item.h >= minimumThickness),
      hwlwPier,
      lwbw,
      wallPier:bool(wallPier),
      fcLimitOk:bool(!isShearWall || item.fc <= 350),
      rhol,
      rhot,
      needTwoLayer:bool(needTwoLayer),
      layersOk:bool(!needTwoLayer || item.layers >= 2),
      rholMin,
      rhotMin,
      rholOk:bool(rhol >= rholMin),
      rhotOk:bool(rhot >= rhotMin),
      spacingGeneral,
      spacingVertical,
      spacingHorizontal,
      vSpacingOk:bool(vSpacingOk),
      hSpacingOk:bool(hSpacingOk),
      eLimit,
      eOk:bool(eOk),
      Ag,
      Pn,
      phiPn,
      hwlw,
      alphaC:ac,
      Vn,
      phiVn,
      VnLimit,
      effectiveShearCapacity,
      simpleEvaluated:bool(simpleEvaluated),
      simpleTensionFailClosed:bool(simpleTensionFailClosed),
      simpleEccentricityFailClosed:bool(simpleEccentricityFailClosed),
      simpleOk:bool(simpleOk),
      axialUtilization,
      shearUtilization,
      shearLimitUtilization,
      shearControlUtilization,
      moment:pm.moment,
      pmEvaluated:bool(pm.evaluated),
      pmAxialOut:bool(pm.axialOut),
      pmOk:bool(pm.ok),
      pmPhiMn:pm.phiMn,
      pmUtilization:Number.isFinite(pm.utilization) ? pm.utilization : 0,
      pmPMin:pm.pMin,
      pmPMax:pm.pMax,
      pmPo:pm.Po,
      pmPhiPnMax:pm.phiPnMax,
      pmDistributedRows:pm.distributedRows,
      pmDistributedBars:pm.distributedBars,
      pmBoundaryBars:pm.boundaryBars,
      pmAstDistributed:pm.AstDistributed,
      pmAstBoundary:pm.AstBoundary,
      pmAst:pm.Ast,
      pmEdgeOffset:pm.edgeOffset,
      pmBoundaryEdgeOffset:pm.boundaryEdgeOffset,
      pmThroughThicknessOffset:pm.throughThicknessOffset,
      pmActualSpacing:pm.actualSpacing,
      basementTriCoef:basement.triCoef,
      basementUniCoef:basement.uniCoef,
      basementPa:basement.pa,
      basementPs:basement.ps,
      basementPw:basement.pw,
      basementMtri:basement.Mtri,
      basementMuni:basement.Muni,
      basementMw:basement.Mw,
      basementMu:basement.Mu,
      coreChecksOk:bool(item.h >= minimumThickness && !wallPier && pm.ok
        && phiVn >= shearDemand && rhol >= rholMin && rhot >= rhotMin
        && (!needTwoLayer || item.layers >= 2)),
    }];
  }));
}

function rcRetrofitSectionOracle(input) {
  const flag = value => value ? 1 : 0;
  const elasticConcrete = strength => 12000 * Math.sqrt(strength);
  const blockFactor = strength => strength <= 280 ? 0.85 : strength >= 560 ? 0.65 : 0.85 - 0.05 * (strength - 280) / 70;
  const concreteShearBeam = (strength, width, depth) => 0.53 * Math.sqrt(strength) * width * depth;
  const concreteShearColumn = (strength, width, height, depth, axial) => {
    const axialFactor = 1 + axial / (140 * width * height);
    return Math.max(0, 0.53 * Math.sqrt(Math.max(strength, 0)) * Math.max(axialFactor, 0) * width * depth);
  };
  const stirrupShear = (area, yieldStrength, depth, spacing) => spacing > 0 ? area * yieldStrength * depth / spacing : 0;
  const bondLength = (layers, modulusMPa, thicknessMm) => 23300 / (layers * thicknessMm * modulusMPa) ** 0.58;
  const debondingStrain = (strength, layers, modulus, thicknessMm, ruptureStrain) => Math.min(0.083 * Math.sqrt(strength / (layers * modulus * thicknessMm)), 0.9 * ruptureStrain);
  const shearBond = (strengthMPa, layers, modulusMPa, thicknessMm, depthMm, ruptureStrain) => {
    const Le = bondLength(layers, modulusMPa, thicknessMm);
    const k1 = (Math.max(strengthMPa, 0) / 27.6) ** (2 / 3);
    const k2 = Math.max(0, (depthMm - Le) / depthMm);
    const raw = k1 * k2 * Le / (11900 * ruptureStrain);
    return { Le, raw, value:Math.min(raw, 0.75) };
  };

  function beamCapacity(section, addition) {
    const { b, h, d, dp, fc, fy, Es, As, Asp } = section;
    const mode = addition.mode;
    const epsCu = 0.003;
    const epsY = fy / Es;
    const b1 = blockFactor(fc);
    const compression = c => 0.85 * fc * b * Math.min(b1 * c, h);
    const compressionSteel = c => {
      if (!(Asp > 0)) return 0;
      const a = Math.min(b1 * c, h);
      const strain = epsCu * (c - dp) / c;
      const stress = Math.max(-fy, Math.min(fy, Es * strain));
      return Asp * (dp < a && strain > 0 ? stress - 0.85 * fc : stress);
    };
    const tensionSteel = c => As * Math.min(Es * epsCu * (d - c) / c, fy);
    const frpForce = (c, area, location) => {
      if (mode !== 'frp' || !(area > 0)) return 0;
      const strain = Math.min(epsCu * (location - c) / c - addition.epsBi, addition.epsLimit, addition.efu);
      return strain > 0 ? 0.85 * area * addition.Ef * strain : 0;
    };
    const plateForce = (c, area, location) => {
      if (mode !== 'plate' || !(area > 0)) return 0;
      const strain = epsCu * (location - c) / c;
      return strain > 0 ? area * Math.min(addition.EsPlate * strain, addition.fyPlate) : 0;
    };
    const equilibrium = c => compression(c) + compressionSteel(c) - tensionSteel(c)
      - frpForce(c, addition.Af, addition.df) - frpForce(c, addition.AfSide, addition.dfSide)
      - plateForce(c, addition.ApPlate, addition.dsp) - plateForce(c, addition.ApSide, addition.dspSide);
    let lower = 0.01 * d;
    let upper = 0.95 * h;
    let lowForce = equilibrium(lower);
    let highForce = equilibrium(upper);
    if (lowForce * highForce > 0) {
      lower = 0.001;
      upper = h;
      lowForce = equilibrium(lower);
      highForce = equilibrium(upper);
      if (lowForce * highForce > 0) return { ok:false };
    }
    let neutralAxis = 0;
    for (let iteration = 0; iteration < 80; iteration += 1) {
      neutralAxis = (lower + upper) / 2;
      const residual = equilibrium(neutralAxis);
      if (Math.abs(residual) < 1e-3) break;
      if (lowForce * residual < 0) {
        upper = neutralAxis;
        highForce = residual;
      } else {
        lower = neutralAxis;
        lowForce = residual;
      }
    }
    const a = b1 * neutralAxis;
    const steelStrain = epsCu * (d - neutralAxis) / neutralAxis;
    const steelStress = Math.min(Es * steelStrain, fy);
    const compressionStrain = epsCu * (neutralAxis - dp) / neutralAxis;
    const compressionStress = Math.max(-fy, Math.min(fy, Es * compressionStrain));
    const compressionStressNet = Asp > 0 && dp < a && compressionStrain > 0 ? compressionStress - 0.85 * fc : compressionStress;
    const frpStrain = mode === 'frp' ? Math.max(0, Math.min(epsCu * (addition.df - neutralAxis) / neutralAxis - addition.epsBi, addition.epsLimit, addition.efu)) : 0;
    const sideFrpStrain = mode === 'frp' && addition.AfSide > 0 ? Math.max(0, Math.min(epsCu * (addition.dfSide - neutralAxis) / neutralAxis - addition.epsBi, addition.epsLimit, addition.efu)) : 0;
    const plateStrain = mode === 'plate' ? epsCu * (addition.dsp - neutralAxis) / neutralAxis : 0;
    const plateStress = mode === 'plate' ? Math.min(addition.EsPlate * plateStrain, addition.fyPlate) : 0;
    const sidePlateStrain = mode === 'plate' && addition.ApSide > 0 ? epsCu * (addition.dspSide - neutralAxis) / neutralAxis : 0;
    const sidePlateStress = sidePlateStrain > 0 ? Math.min(addition.EsPlate * sidePlateStrain, addition.fyPlate) : 0;
    const moment = As * steelStress * (d - a / 2)
      + (Asp > 0 ? Asp * compressionStressNet * (a / 2 - dp) : 0)
      + 0.85 * addition.Af * addition.Ef * frpStrain * (addition.df - a / 2)
      + 0.85 * addition.AfSide * addition.Ef * sideFrpStrain * (addition.dfSide - a / 2)
      + addition.ApPlate * plateStress * (addition.dsp - a / 2)
      + addition.ApSide * sidePlateStress * (addition.dspSide - a / 2);
    const phi = steelStrain >= 0.005 ? 0.90 : steelStrain >= epsY ? 0.65 + 0.25 * (steelStrain - epsY) / (0.005 - epsY) : 0.65;
    const rawFrpStrain = mode === 'frp' ? epsCu * (addition.df - neutralAxis) / neutralAxis - addition.epsBi : 0;
    return {
      ok:true,
      c:neutralAxis,
      Mn:moment,
      phi,
      failMode:mode === 'frp' && rawFrpStrain > addition.epsLimit ? 'FRP 脫層' : mode === 'frp' && rawFrpStrain > addition.efu ? 'FRP 破斷' : '混凝土壓碎',
    };
  }

  function uncracked(section, materials) {
    const concreteArea = section.b * section.h;
    const concreteY = section.h / 2;
    const additions = [
      [section.As, materials.ns, section.h - section.d],
      [section.Asp, materials.ns, section.h - section.dp],
      [materials.Af, materials.nf, section.h - materials.df],
      [materials.ApPlate, materials.nsPlate, section.h - materials.dsp],
    ];
    let area = concreteArea;
    let firstMoment = concreteArea * concreteY;
    for (const [memberArea, ratio, y] of additions) {
      const transformed = memberArea > 0 && ratio > 0 ? (ratio - 1) * memberArea : 0;
      area += transformed;
      firstMoment += transformed * y;
    }
    const centroid = firstMoment / area;
    let inertia = section.b * section.h ** 3 / 12 + concreteArea * (concreteY - centroid) ** 2;
    for (const [memberArea, ratio, y] of additions) {
      const transformed = memberArea > 0 && ratio > 0 ? (ratio - 1) * memberArea : 0;
      inertia += transformed * (y - centroid) ** 2;
    }
    return { area, inertia };
  }

  function cracked(section, materials) {
    const linear = (materials.ns - 1) * section.Asp + materials.ns * section.As + materials.nf * materials.Af + materials.nsPlate * materials.ApPlate;
    const constant = -(materials.ns - 1) * section.Asp * section.dp - materials.ns * section.As * section.d
      - materials.nf * materials.Af * materials.df - materials.nsPlate * materials.ApPlate * materials.dsp;
    const discriminant = linear ** 2 - 2 * section.b * constant;
    if (discriminant < 0) return { ok:false, kd:0, inertia:0 };
    const kd = (-linear + Math.sqrt(discriminant)) / section.b;
    if (!(kd > 0 && kd < section.h)) return { ok:false, kd:0, inertia:0 };
    let inertia = section.b * kd ** 3 / 3;
    inertia += (materials.ns - 1) * section.Asp * (kd - section.dp) ** 2;
    inertia += materials.ns * section.As * (section.d - kd) ** 2;
    inertia += materials.nf * materials.Af * (materials.df - kd) ** 2;
    inertia += materials.nsPlate * materials.ApPlate * (materials.dsp - kd) ** 2;
    return { ok:true, kd, inertia };
  }

  function interaction(width, height, layers, strength, yieldStrength, steelModulus) {
    const epsCu = 0.003;
    const epsY = yieldStrength / steelModulus;
    const b1 = blockFactor(strength);
    const grossArea = width * height;
    const steelArea = layers.reduce((sum, layer) => sum + layer.A, 0);
    const Po = 0.85 * strength * (grossArea - steelArea) + yieldStrength * steelArea;
    const nominalCompressionLimit = 0.80 * Po;
    const points = [];
    for (let index = 0; index <= 120; index += 1) {
      const fraction = index / 120;
      const c = 0.02 * height + (5 * height - 0.02 * height) * fraction ** 2;
      const a = Math.min(b1 * c, height);
      const concreteForce = 0.85 * strength * a * width;
      let axial = concreteForce;
      let moment = concreteForce * (height / 2 - a / 2);
      let tensionStrain = -Infinity;
      for (const layer of layers) {
        const strain = epsCu * (c - layer.y) / c;
        const stress = Math.max(-yieldStrength, Math.min(yieldStrength, steelModulus * strain));
        const force = layer.A * (layer.y < a && strain > 0 ? stress - 0.85 * strength : stress);
        axial += force;
        moment += force * (height / 2 - layer.y);
        tensionStrain = Math.max(tensionStrain, -strain);
      }
      const phi = tensionStrain >= 0.005 ? 0.90 : tensionStrain >= epsY ? 0.65 + 0.25 * (tensionStrain - epsY) / (0.005 - epsY) : 0.65;
      const limitedAxial = Math.min(axial, nominalCompressionLimit);
      points.push({ Pn:limitedAxial, Mn:Math.max(0, moment), phi });
    }
    points.push({ Pn:-yieldStrength * steelArea, Mn:0, phi:0.90 });
    return points;
  }

  function momentAtAxial(points, target) {
    let best = null;
    for (let index = 0; index < points.length - 1; index += 1) {
      const first = points[index];
      const second = points[index + 1];
      if ((first.Pn - target) * (second.Pn - target) <= 0 && first.Pn !== second.Pn) {
        const fraction = (target - first.Pn) / (second.Pn - first.Pn);
        const moment = first.Mn + fraction * (second.Mn - first.Mn);
        const phi = first.phi + fraction * (second.phi - first.phi);
        if (!best || moment > best.Mn) best = { Mn:moment, phiMn:phi * moment };
      }
    }
    return best;
  }

  function evaluateBeam(item) {
    const section = { b:item.bMm / 10, h:item.hMm / 10, d:item.dMm / 10, dp:item.dpMm / 10, fc:item.fc, fy:item.fy, Es:2.04e6, As:item.As, Asp:item.Asp };
    const addition = { mode:item.mode, Af:0, AfSide:0, Ef:0, efu:0, epsLimit:0, epsBi:item.epsBi || 0, df:section.h, dfSide:section.h, ApPlate:0, ApSide:0, fyPlate:0, EsPlate:0, dsp:section.h, dspSide:section.h };
    let epsFdCalc = 0;
    let activeBondLength = 0;
    let plateShear = 0;
    let frpShear = 0;
    let shearKv = 0;
    let shearKvRaw = 0;
    let shearEps = 0;
    if (item.mode === 'frp') {
      const p = item.frp;
      addition.Ef = p.EfGPa * 10197;
      addition.efu = p.efuPct / 100 * p.CE;
      const totalThicknessMm = p.tfMm * p.layers;
      addition.Af = p.widthMm / 10 * (totalThicknessMm / 10);
      epsFdCalc = debondingStrain(item.fc, p.layers, addition.Ef, p.tfMm, addition.efu);
      addition.epsLimit = p.anchor || p.uwrap ? addition.efu : epsFdCalc;
      activeBondLength = bondLength(p.layers, p.EfGPa * 1000, p.tfMm);
      if (p.uwrap) {
        const heightMm = Math.max(0, item.hMm - p.slabMm);
        addition.AfSide = 2 * totalThicknessMm / 10 * (heightMm / 10);
        addition.dfSide = section.h - heightMm / 20;
        const bond = shearBond(item.fc * 0.0980665, p.layers, p.EfGPa * 1000, p.tfMm, heightMm, addition.efu);
        shearKv = bond.value;
        shearKvRaw = bond.raw;
        shearEps = Math.min(bond.value * addition.efu, 0.004);
        frpShear = 0.85 * 2 * totalThicknessMm / 10 * addition.Ef * shearEps * (heightMm / 10);
      } else if (item.frpShear) {
        const s = item.frpShear;
        const bond = shearBond(item.fc * 0.0980665, p.layers, p.EfGPa * 1000, p.tfMm, s.dfvMm, addition.efu);
        shearKv = bond.value;
        shearKvRaw = bond.raw;
        shearEps = Math.min(s.userEps, bond.value * addition.efu, 0.004);
        const angle = s.angleDeg * Math.PI / 180;
        const raw = 2 * p.layers * (p.tfMm / 10) * (s.widthMm / 10) * addition.Ef * shearEps
          * (Math.sin(angle) + Math.cos(angle)) * (s.dfvMm / 10) / (s.spacingMm / 10);
        frpShear = 0.85 * raw;
      }
    } else if (item.mode === 'plate') {
      const p = item.plate;
      addition.fyPlate = p.fy;
      addition.EsPlate = p.Es;
      addition.ApPlate = p.widthMm / 10 * (p.thicknessMm / 10);
      addition.dsp = section.h + p.thicknessMm / 20;
      if (p.uwrap) {
        const sideThicknessMm = p.sideThicknessMm || p.thicknessMm;
        const sideHeightMm = Math.max(0, item.hMm - p.slabMm);
        addition.ApSide = 2 * sideThicknessMm / 10 * (sideHeightMm / 10);
        addition.dspSide = section.h - sideHeightMm / 20;
        plateShear = 2 * sideThicknessMm / 10 * p.fy * Math.min(section.d, sideHeightMm / 10 * 0.9);
      }
    }
    const result = beamCapacity(section, addition);
    const baselineAddition = { mode:'rc', Af:0, AfSide:0, Ef:0, efu:0, epsLimit:0, epsBi:0, df:section.h, dfSide:section.h, ApPlate:0, ApSide:0, fyPlate:0, EsPlate:0, dsp:section.h, dspSide:section.h };
    const baseline = beamCapacity(section, baselineAddition);
    const Ec = elasticConcrete(item.fc);
    const materials = { ns:section.Es / Ec, Af:addition.Af, nf:addition.Ef / Ec, df:addition.df, ApPlate:addition.ApPlate, nsPlate:addition.EsPlate / Ec, dsp:addition.dsp };
    const gross = uncracked(section, materials);
    const crackedResult = cracked(section, materials);
    const Vc = concreteShearBeam(item.fc, section.b, section.d);
    const Vs = stirrupShear(item.Av, item.fyt, section.d, item.stirrupSpacing);
    const shearCap = 2.1 * Math.sqrt(item.fc) * section.b * section.d;
    const shearReinfRaw = Vs + plateShear + frpShear;
    const shearReinfUsed = Math.min(shearReinfRaw, shearCap);
    const Vn = Vc + shearReinfUsed;
    const phiVn = 0.75 * Vn;
    return {
      beamRoute:1, columnRoute:0, frpRoute:flag(item.mode === 'frp'), plateRoute:flag(item.mode === 'plate'),
      uwrapRoute:flag(item.mode === 'frp' ? item.frp.uwrap : item.mode === 'plate' && item.plate.uwrap),
      Af:addition.Af, AfSide:addition.AfSide, ApPlate:addition.ApPlate, ApSide:addition.ApSide,
      epsFdCalc, epsFdUsed:addition.epsLimit, activeBondLength,
      neutralAxis:result.c, Mn:result.Mn, phi:result.phi, phiMn:result.phi * result.Mn,
      baselineMn:baseline.Mn, strengthGain:result.Mn / baseline.Mn,
      frpDelamination:flag(result.failMode === 'FRP 脫層'), frpRupture:flag(result.failMode === 'FRP 破斷'),
      uncrackedArea:gross.area, uncrackedI:gross.inertia,
      crackedOk:flag(crackedResult.ok), crackedNeutralAxis:crackedResult.kd, crackedI:crackedResult.inertia,
      Vc, Vs, plateShear, frpShear, shearKv, shearKvRaw, shearEps,
      shearCap, shearReinfRaw, shearReinfUsed, shearCapped:flag(shearReinfRaw > shearCap),
      Vn, phiVn, shearRatio:item.VuTf * 1000 / phiVn,
    };
  }

  function evaluateColumn(item) {
    const width = item.bMm / 10;
    const height = item.hMm / 10;
    const cover = item.coverMm / 10;
    const steelModulus = 2.04e6;
    const steelArea = item.rebarLayers.reduce((sum, layer) => sum + layer.A, 0);
    const grossArea = width * height;
    const concreteModulus = elasticConcrete(item.fc);
    const modularRatio = steelModulus / concreteModulus;
    let lateralPressure = 0;
    let confinedFc = item.fc;
    let retrofitArea = 0;
    let retrofitInertia = 0;
    let retrofitModularRatio = 0;
    let jacketShear = 0;
    if (item.mode === 'jacket') {
      const p = item.jacket;
      const thickness = p.thicknessMm / 10;
      lateralPressure = p.ke * 2 * p.fy * thickness / height;
      confinedFc = item.fc * (-1.254 + 2.254 * Math.sqrt(1 + 7.94 * lateralPressure / item.fc) - 2 * lateralPressure / item.fc);
      if (!Number.isFinite(confinedFc) || confinedFc < item.fc) confinedFc = item.fc;
      retrofitArea = 2 * (width + height + 2 * thickness) * thickness;
      retrofitInertia = 2 * width * thickness * (height / 2 + thickness / 2) ** 2 + 2 * height * thickness ** 3 / 12;
      retrofitModularRatio = p.Es / concreteModulus;
      jacketShear = 2 * thickness * p.fy * (height - cover);
    } else {
      const p = item.frp;
      const modulus = p.EfGPa * 10197;
      const totalThickness = p.tfMm / 10 * p.layers;
      lateralPressure = p.ka * 2 * modulus * p.effectiveStrain * totalThickness / height;
      confinedFc = item.fc + 4.1 * lateralPressure;
      retrofitArea = 2 * (width + height) * totalThickness;
      retrofitInertia = retrofitArea * (height / 2) ** 2 * 0.5;
      retrofitModularRatio = modulus / concreteModulus;
      jacketShear = 0.95 * 2 * totalThickness * modulus * 0.004 * (height - cover);
    }
    const PoBase = 0.85 * item.fc * (grossArea - steelArea) + item.fy * steelArea;
    const PoConf = 0.85 * confinedFc * (grossArea - steelArea) + item.fy * steelArea;
    const fraction = item.layout === 'perim' ? 0.3 : 0.5;
    const flexSection = { b:width, h:height, d:height - cover, dp:cover, fc:item.fc, fy:item.fy, Es:steelModulus, As:steelArea * fraction, Asp:steelArea * fraction };
    const emptyAddition = { mode:'rc', Af:0, AfSide:0, Ef:0, efu:0, epsLimit:0, epsBi:0, df:height, dfSide:height, ApPlate:0, ApSide:0, fyPlate:0, EsPlate:0, dsp:height, dspSide:height };
    const flexBase = beamCapacity(flexSection, emptyAddition);
    const flexConf = beamCapacity({ ...flexSection, fc:confinedFc }, emptyAddition);
    const baseArea = grossArea + (modularRatio - 1) * steelArea;
    const baseI = width * height ** 3 / 12 + (modularRatio - 1) * (2 * steelArea * fraction * (height / 2 - cover) ** 2);
    const transformedArea = baseArea + (retrofitModularRatio - 1) * retrofitArea;
    const transformedI = baseI + (retrofitModularRatio - 1) * retrofitInertia;
    const Nu = item.NuTf * 1000;
    const Mu = item.MuTfm * 1e5;
    const Vc = concreteShearColumn(item.fc, width, height, height - cover, Nu);
    const VsRaw = stirrupShear(item.Av, item.fyt, height - cover, item.stirrupSpacing);
    const shearCap = 2.1 * Math.sqrt(item.fc) * width * (height - cover);
    const Vs = Math.min(VsRaw, shearCap);
    const shearReinfRaw = Vs + jacketShear;
    const shearReinfUsed = Math.min(shearReinfRaw, shearCap);
    const Vn = Vc + shearReinfUsed;
    const phiVn = 0.75 * Vn;
    const demandBase = momentAtAxial(interaction(width, height, item.rebarLayers, item.fc, item.fy, steelModulus), Nu);
    const demandConf = momentAtAxial(interaction(width, height, item.rebarLayers, confinedFc, item.fy, steelModulus), Nu);
    return {
      beamRoute:0, columnRoute:1, jacketRoute:flag(item.mode === 'jacket'), frpRoute:flag(item.mode === 'frp'),
      Ast:steelArea, lateralPressure, confinedFc, PoBase, PoConf, PnMaxBase:0.8 * PoBase, PnMaxConf:0.8 * PoConf,
      phiPnMaxConf:0.65 * 0.8 * PoConf,
      flexMnBase:flexBase.Mn, flexMnConf:flexConf.Mn,
      baseArea, transformedArea, baseI, transformedI,
      Vc, VsRaw, Vs, jacketShear, shearCap, shearReinfRaw, shearReinfUsed,
      shearCapped:flag(shearReinfRaw > shearCap), Vn, phiVn,
      pmBaseEvaluated:flag(demandBase), pmConfEvaluated:flag(demandConf),
      pmPhiMnBase:demandBase ? demandBase.phiMn : 0,
      pmPhiMnConf:demandConf ? demandConf.phiMn : 0,
      pmRatioConf:demandConf && demandConf.phiMn > 0 ? Mu / demandConf.phiMn : 0,
      pmOk:flag(demandConf && demandConf.phiMn > 0 && Mu <= demandConf.phiMn),
    };
  }

  return Object.fromEntries(input.cases.map(item => [item.id, item.kind === 'beam' ? evaluateBeam(item) : evaluateColumn(item)]));
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

function windObjectFrameThreeRouteOracle(input) {
  const terrain = {
    A:{ alpha:0.32, zg:500, c:0.45, ell:55, eps:0.50, zmin:18 },
    B:{ alpha:0.25, zg:400, c:0.30, ell:98, eps:0.33, zmin:9 },
    C:{ alpha:0.15, zg:300, c:0.20, ell:152, eps:0.20, zmin:4.5 },
  };
  const coefficient = (memberType, lowQD, phi) => {
    if (memberType === 'flat') return phi <= 0.10 ? 0.8 : phi <= 0.29 ? 0.9 : 1.1;
    if (lowQD) return phi <= 0.10 ? 2.0 : phi <= 0.29 ? 1.8 : 1.6;
    return phi <= 0.10 ? 1.2 : phi <= 0.29 ? 1.3 : 1.5;
  };
  return Object.fromEntries(input.cases.map(i => {
    const t = terrain[i.terrain];
    const zUse = Math.max(i.z, t.zmin);
    const Kz = 2.774 * Math.pow(zUse / t.zg, 2 * t.alpha);
    const qz = 0.06 * Kz * i.Kzt * i.I ** 2 * i.V ** 2;
    const dSqrtQz = i.memberType === 'circular' ? i.D * Math.sqrt(qz) : 0;
    const circularLowRoute = i.memberType === 'circular' && dSqrtQz <= 1.70;
    const circularHighRoute = i.memberType === 'circular' && dSqrtQz > 1.70;
    const equivalentWidth = Math.max(Math.sqrt(i.A), 1);
    const gustZBar = Math.max(0.6 * i.z, t.zmin);
    const gustIz = t.c * Math.pow(10 / gustZBar, 1 / 6);
    const gustLz = t.ell * Math.pow(gustZBar / 10, t.eps);
    const gustQ2 = 1 / (1 + 0.63 * Math.pow((equivalentWidth + i.z) / gustLz, 0.63));
    const gustQ = Math.sqrt(gustQ2);
    const G = 1.927 * (1 + 1.7 * 3.4 * gustIz * gustQ) / (1 + 1.7 * 3.4 * gustIz);
    const cf = coefficient(i.memberType, circularLowRoute, i.phi);
    const force = qz * G * cf * i.A;
    return [i.id, {
      zUse, Kz, qz, equivalentWidth,
      gustZBar, gustIz, gustLz, gustQ2, gustQ, G,
      dSqrtQz,
      circularLowRoute:circularLowRoute ? 1 : 0,
      circularHighRoute:circularHighRoute ? 1 : 0,
      flatRoute:i.memberType === 'flat' ? 1 : 0,
      lowBand:i.phi <= 0.10 ? 1 : 0,
      mediumBand:i.phi > 0.10 && i.phi <= 0.29 ? 1 : 0,
      highBand:i.phi > 0.29 ? 1 : 0,
      cf,
      force,
      baseShear:force,
      baseMoment:force * i.z,
      resultantHeight:i.z,
    }];
  }));
}

function windLatticeTowerFourBranchOracle(input) {
  const terrain = {
    A:{ alpha:0.32, zg:500, c:0.45, ell:55, eps:0.50, zmin:18 },
    B:{ alpha:0.25, zg:400, c:0.30, ell:98, eps:0.33, zmin:9 },
    C:{ alpha:0.15, zg:300, c:0.20, ell:152, eps:0.20, zmin:4.5 },
  };
  const kzAt = (z, t) => 2.774 * Math.pow(Math.max(z, t.zmin) / t.zg, 2 * t.alpha);
  return Object.fromEntries(input.cases.map(i => {
    const t = terrain[i.terrain];
    let baseCf;
    if (i.towerShape === 'square') {
      baseCf = i.solidity < 0.025 ? 4.0
        : i.solidity <= 0.44 ? 4.1 - 5.2 * i.solidity
          : i.solidity <= 0.69 ? 1.8 : 1.3 + 0.7 * i.solidity;
    } else {
      baseCf = i.solidity < 0.025 ? 3.6
        : i.solidity <= 0.44 ? 3.7 - 4.5 * i.solidity
          : i.solidity <= 0.69 ? 1.7 : 1.0 + i.solidity;
    }
    let memberFactor = 1;
    if (i.memberShape === 'circular') {
      memberFactor = i.solidity <= 0.29 ? 0.67 : i.solidity <= 0.79 ? 0.67 * i.solidity + 0.47 : 1;
    }
    const skewFactor = i.towerShape === 'square' && i.skewWind && i.solidity < 0.5
      ? 1 + 0.75 * i.solidity : 1;
    const cf = baseCf * memberFactor * skewFactor;
    const segments = Math.max(1, Math.round(i.segments));
    const segmentHeight = i.height / segments;
    const topZ = i.zBase + i.height;
    const gustHeight = Math.max(topZ, segmentHeight);
    const gustWidth = Math.max(i.faceWidth, 1);
    const gustZBar = Math.max(0.6 * gustHeight, t.zmin);
    const gustIz = t.c * Math.pow(10 / gustZBar, 1 / 6);
    const gustLz = t.ell * Math.pow(gustZBar / 10, t.eps);
    const gustQ2 = 1 / (1 + 0.63 * Math.pow((gustWidth + gustHeight) / gustLz, 0.63));
    const gustQ = Math.sqrt(gustQ2);
    const G = 1.927 * (1 + 1.7 * 3.4 * gustIz * gustQ) / (1 + 1.7 * 3.4 * gustIz);
    const segmentArea = i.faceWidth * i.solidity * segmentHeight;
    const rows = Array.from({ length:segments }, (_, index) => {
      const z1 = i.zBase + index * segmentHeight;
      const zMid = z1 + segmentHeight / 2;
      const Kz = kzAt(zMid, t);
      const qz = 0.06 * Kz * i.Kzt * i.I ** 2 * i.V ** 2;
      const force = qz * G * cf * segmentArea;
      return { zMid, Kz, qz, force, moment:force * zMid };
    });
    const first = rows[0];
    const top = rows[rows.length - 1];
    const baseShear = rows.reduce((sum, row) => sum + row.force, 0);
    const baseMoment = rows.reduce((sum, row) => sum + row.moment, 0);
    return [i.id, {
      baseCf, memberFactor, skewFactor, cf,
      lowPhiBaseBranch:i.solidity < 0.025 ? 1 : 0,
      linearBaseBranch:i.solidity >= 0.025 && i.solidity <= 0.44 ? 1 : 0,
      plateauBaseBranch:i.solidity > 0.44 && i.solidity <= 0.69 ? 1 : 0,
      highPhiBaseBranch:i.solidity > 0.69 ? 1 : 0,
      circularConstantBranch:i.memberShape === 'circular' && i.solidity <= 0.29 ? 1 : 0,
      circularInterpolatedBranch:i.memberShape === 'circular' && i.solidity > 0.29 && i.solidity <= 0.79 ? 1 : 0,
      unitMemberBranch:i.memberShape !== 'circular' || i.solidity > 0.79 ? 1 : 0,
      skewApplied:skewFactor !== 1 ? 1 : 0,
      segments, segmentHeight,
      totalSolidArea:i.faceWidth * i.height * i.solidity,
      G, gustZBar, gustIz, gustLz, gustQ2, gustQ,
      firstZMid:first.zMid, firstKz:first.Kz, firstQz:first.qz,
      topZMid:top.zMid, topKz:top.Kz, topQz:top.qz,
      segmentArea,
      baseShear, sumForce:baseShear,
      baseMoment, sumMoment:baseMoment,
      resultantHeight:baseShear > 0 ? baseMoment / baseShear : 0,
    }];
  }));
}

function windObjectTowerTable212Oracle(input) {
  const terrain = {
    A:{ alpha:0.32, zg:500, c:0.45, ell:55, eps:0.50, zmin:18 },
    B:{ alpha:0.25, zg:400, c:0.30, ell:98, eps:0.33, zmin:9 },
    C:{ alpha:0.15, zg:300, c:0.20, ell:152, eps:0.20, zmin:4.5 },
  };
  const tables = {
    square_face:[[1,1.3],[7,1.4],[25,2.0]],
    square_diagonal:[[1,1.0],[7,1.1],[25,1.5]],
    hex_oct:[[1,1.0],[7,1.2],[25,1.4]],
    circular_low_qd:[[1,0.7],[7,0.8],[25,1.2]],
    circular_moderate:[[1,0.5],[7,0.6],[25,0.7]],
    circular_rough:[[1,0.7],[7,0.8],[25,0.9]],
    circular_very_rough:[[1,0.8],[7,1.0],[25,1.2]],
  };
  const kzAt = (z, t) => 2.774 * Math.pow(Math.max(z, t.zmin) / t.zg, 2 * t.alpha);
  const interpolate = (points, value) => {
    const x = Math.max(points[0][0], Math.min(value, points[points.length - 1][0]));
    let low = points[0];
    let high = points[points.length - 1];
    for (let index = 0; index < points.length - 1; index += 1) {
      if (x >= points[index][0] && x <= points[index + 1][0]) {
        low = points[index];
        high = points[index + 1];
        break;
      }
    }
    const fraction = high[0] === low[0] ? 0 : (x - low[0]) / (high[0] - low[0]);
    return { x, low, high, value:low[1] + fraction * (high[1] - low[1]) };
  };
  return Object.fromEntries(input.cases.map(i => {
    const t = terrain[i.terrain];
    const topZ = i.zBase + i.height;
    const topKz = kzAt(topZ, t);
    const qTop = 0.06 * topKz * i.Kzt * i.I ** 2 * i.V ** 2;
    const dSqrtQz = i.D * Math.sqrt(qTop);
    const resolved = i.sectionType === 'circular_auto'
      ? (dSqrtQz <= 1.70 ? 'circular_low_qd' : 'circular_moderate')
      : i.sectionType;
    const hOverDActual = i.height / i.D;
    const cf = interpolate(tables[resolved], hOverDActual);
    const CfEff = cf.value * i.shapeFactor;
    const segments = Math.max(1, Math.round(i.segments));
    const segmentHeight = i.height / segments;
    const gustHeight = Math.max(topZ, segmentHeight);
    const gustWidth = Math.max(i.D, 1);
    const gustZBar = Math.max(0.6 * gustHeight, t.zmin);
    const gustIz = t.c * Math.pow(10 / gustZBar, 1 / 6);
    const gustLz = t.ell * Math.pow(gustZBar / 10, t.eps);
    const gustQ2 = 1 / (1 + 0.63 * Math.pow((gustWidth + gustHeight) / gustLz, 0.63));
    const gustQ = Math.sqrt(gustQ2);
    const G = 1.927 * (1 + 1.7 * 3.4 * gustIz * gustQ) / (1 + 1.7 * 3.4 * gustIz);
    const segmentArea = i.D * segmentHeight;
    const rows = Array.from({ length:segments }, (_, index) => {
      const zMid = i.zBase + index * segmentHeight + segmentHeight / 2;
      const Kz = kzAt(zMid, t);
      const qz = 0.06 * Kz * i.Kzt * i.I ** 2 * i.V ** 2;
      const force = qz * G * CfEff * segmentArea;
      return { zMid, Kz, qz, area:segmentArea, force, moment:force * zMid };
    });
    const first = rows[0];
    const topRow = rows[rows.length - 1];
    const bodyBaseShear = rows.reduce((sum, row) => sum + row.force, 0);
    const bodyBaseMoment = rows.reduce((sum, row) => sum + row.moment, 0);
    const topPresent = i.topArea > 0;
    const topBaseCf = topPresent ? (i.topAreaCf == null ? cf.value : i.topAreaCf) : 0;
    const topCfEff = topBaseCf * i.shapeFactor;
    const topForce = topPresent ? qTop * G * topCfEff * i.topArea : 0;
    const topMoment = topForce * topZ;
    const baseShear = bodyBaseShear + topForce;
    const baseMoment = bodyBaseMoment + topMoment;
    return [i.id, {
      squareFaceRoute:resolved === 'square_face' ? 1 : 0,
      squareDiagonalRoute:resolved === 'square_diagonal' ? 1 : 0,
      hexOctRoute:resolved === 'hex_oct' ? 1 : 0,
      circularAutoLowRoute:i.sectionType === 'circular_auto' && resolved === 'circular_low_qd' ? 1 : 0,
      circularAutoHighRoute:i.sectionType === 'circular_auto' && resolved === 'circular_moderate' ? 1 : 0,
      explicitCircularRoute:i.sectionType.startsWith('circular_') && i.sectionType !== 'circular_auto' ? 1 : 0,
      hOverDActual, hOverDUsed:cf.x,
      clampedLowRatio:hOverDActual < 1 ? 1 : 0,
      clampedHighRatio:hOverDActual > 25 ? 1 : 0,
      lowRatio:cf.low[0], highRatio:cf.high[0],
      baseCf:cf.value, shapeFactor:i.shapeFactor, CfEff,
      qTop, dSqrtQz,
      segments, segmentHeight, totalArea:i.D * i.height,
      G, gustZBar, gustIz, gustLz, gustQ2, gustQ,
      firstZMid:first.zMid, firstKz:first.Kz, firstQz:first.qz, firstArea:first.area, firstForce:first.force,
      topZMid:topRow.zMid, topKz:topRow.Kz, topQz:topRow.qz, topSegmentForce:topRow.force,
      bodyBaseShear, sumBodyForce:bodyBaseShear,
      bodyBaseMoment, sumBodyMoment:bodyBaseMoment,
      topPresent:topPresent ? 1 : 0,
      topInheritedCf:topPresent && i.topAreaCf == null ? 1 : 0,
      topSpecifiedCf:topPresent && i.topAreaCf != null ? 1 : 0,
      topBaseCf, topCfEff, topForce, topMoment,
      baseShear, baseMoment,
      resultantHeight:baseShear > 0 ? baseMoment / baseShear : 0,
    }];
  }));
}

function windFenceSignTable210Oracle(input) {
  const terrains = {
    A:{ alpha:0.32, zg:500, c:0.45, ell:55, eps:0.50, zmin:18 },
    B:{ alpha:0.25, zg:400, c:0.30, ell:98, eps:0.33, zmin:9 },
    C:{ alpha:0.15, zg:300, c:0.20, ell:152, eps:0.20, zmin:4.5 },
  };
  const groundTable = [[3,1.2],[5,1.3],[8,1.4],[10,1.5],[20,1.75],[30,1.85],[40,2.0]];
  const elevatedTable = [[6,1.2],[10,1.3],[16,1.4],[20,1.5],[40,1.75],[60,1.85],[80,2.0]];
  const interpolate = (points, rawRatio) => {
    const x = Math.max(points[0][0], Math.min(rawRatio, points[points.length - 1][0]));
    let low = points[0];
    let high = points[points.length - 1];
    for (let index = 0; index < points.length - 1; index += 1) {
      if (x >= points[index][0] && x <= points[index + 1][0]) {
        low = points[index];
        high = points[index + 1];
        break;
      }
    }
    const fraction = high[0] === low[0] ? 0 : (x - low[0]) / (high[0] - low[0]);
    return { x, low, high, cf:low[1] + fraction * (high[1] - low[1]) };
  };
  return Object.fromEntries(input.cases.map(item => {
    const terrain = terrains[item.terrain];
    const atGround = item.type === 'fence';
    const zr = item.s + item.h / 2;
    const zUse = Math.max(zr, terrain.zmin);
    const Kz = 2.774 * Math.pow(zUse / terrain.zg, 2 * terrain.alpha);
    const qz = 0.06 * Kz * item.Kzt * item.I ** 2 * item.V ** 2;
    const aspectRatio = item.B / item.h;
    const cf = interpolate(atGround ? groundTable : elevatedTable, aspectRatio);
    const manualAdoption = item.cfOverride != null;
    const cfBase = manualAdoption ? item.cfOverride : cf.cf;
    const cfEff = cfBase * item.phi;
    const gustHeight = item.h + item.s;
    const gustWidth = item.B;
    const gustZBar = Math.max(0.6 * gustHeight, terrain.zmin);
    const gustIz = terrain.c * Math.pow(10 / gustZBar, 1 / 6);
    const gustLz = terrain.ell * Math.pow(gustZBar / 10, terrain.eps);
    const gustQ2 = 1 / (1 + 0.63 * Math.pow((gustWidth + gustHeight) / gustLz, 0.63));
    const gustQ = Math.sqrt(gustQ2);
    const G = 1.927 * (1 + 1.7 * 3.4 * gustIz * gustQ) / (1 + 1.7 * 3.4 * gustIz);
    const area = item.h * item.B;
    const force = qz * G * cfEff * area;
    return [item.id, {
      groundRoute:atGround ? 1 : 0,
      elevatedRoute:atGround ? 0 : 1,
      aspectRatio,
      aspectRatioUsed:cf.x,
      clampedLow:aspectRatio < (atGround ? 3 : 6) ? 1 : 0,
      clampedHigh:aspectRatio > (atGround ? 40 : 80) ? 1 : 0,
      lowRatio:cf.low[0], highRatio:cf.high[0], lowCf:cf.low[1], highCf:cf.high[1], tableCf:cf.cf,
      manualAdoption:manualAdoption ? 1 : 0,
      cfBase, phi:item.phi, cfEff,
      zr, zUse, Kz, qz,
      gustHeight, gustWidth, gustZBar, gustIz, gustLz, gustQ2, gustQ, G,
      area, force, baseShear:force, baseMoment:force * zr,
    }];
  }));
}

function windSignPoleCompositeOracle(input) {
  const terrains = {
    A:{ alpha:0.32, zg:500, c:0.45, ell:55, eps:0.50, zmin:18 },
    B:{ alpha:0.25, zg:400, c:0.30, ell:98, eps:0.33, zmin:9 },
    C:{ alpha:0.15, zg:300, c:0.20, ell:152, eps:0.20, zmin:4.5 },
  };
  const signTables = {
    ground:[[3,1.2],[5,1.3],[8,1.4],[10,1.5],[20,1.75],[30,1.85],[40,2.0]],
    elevated:[[6,1.2],[10,1.3],[16,1.4],[20,1.5],[40,1.75],[60,1.85],[80,2.0]],
  };
  const angularCf = { rect_long:2.2, rect_short:1.4, tri_vertex:1.2, tri_face:2.0, right_iso_vertex:1.55 };
  const cableCf = {
    smooth:[1.2,0.5], moderate:[1.2,0.7], fine_cable:[1.2,0.9], rough_cable:[1.3,1.1],
  };
  const interpolate = (points, raw) => {
    const x = Math.max(points[0][0], Math.min(raw, points[points.length - 1][0]));
    let low = points[0];
    let high = points[points.length - 1];
    for (let index = 0; index < points.length - 1; index += 1) {
      if (x >= points[index][0] && x <= points[index + 1][0]) {
        low = points[index];
        high = points[index + 1];
        break;
      }
    }
    const fraction = high[0] === low[0] ? 0 : (x - low[0]) / (high[0] - low[0]);
    return { x, value:low[1] + fraction * (high[1] - low[1]) };
  };
  const calcQz = (z, item) => {
    const terrain = terrains[item.terrain];
    const zUse = Math.max(z, terrain.zmin);
    const Kz = 2.774 * Math.pow(zUse / terrain.zg, 2 * terrain.alpha);
    return { Kz, qz:0.06 * Kz * item.Kzt * item.I ** 2 * item.V ** 2 };
  };
  const calcGust = (height, width, terrainKey) => {
    const terrain = terrains[terrainKey];
    const zBar = Math.max(0.6 * height, terrain.zmin);
    const Iz = terrain.c * Math.pow(10 / zBar, 1 / 6);
    const Lz = terrain.ell * Math.pow(zBar / 10, terrain.eps);
    const Q = Math.sqrt(1 / (1 + 0.63 * Math.pow((width + height) / Lz, 0.63)));
    return 1.927 * (1 + 1.7 * 3.4 * Iz * Q) / (1 + 1.7 * 3.4 * Iz);
  };
  const angularR = slenderness => slenderness < 4 ? 0.6 : slenderness < 8 ? 0.7 : slenderness < 40 ? 0.8 : 1.0;

  return Object.fromEntries(input.cases.map(item => {
    const panelTop = item.panelBottom + item.panelHeight;
    const panelZr = item.panelBottom + item.panelHeight / 2;
    const panelArea = item.panelWidth * item.panelHeight * (1 - item.openingRatio / 100);
    const panelAtGround = item.panelBottom <= 0;
    const panelAspect = item.panelWidth / item.panelHeight;
    const panelTable = interpolate(panelAtGround ? signTables.ground : signTables.elevated, panelAspect);
    const panelCf = item.panelCfOverride == null ? panelTable.value : item.panelCfOverride;
    const panelQ = calcQz(panelZr, item);
    const panelG = calcGust(Math.max(panelTop, 0.1), item.panelWidth, item.terrain);
    const panelPressure = panelQ.qz * panelG * panelCf;
    const panelForce = panelPressure * panelArea;
    const panelMoment = panelForce * panelZr;

    const supportHeight = item.panelBottom;
    const supportSegments = Math.max(1, Math.min(24, Math.round(item.supportSegments)));
    const supportCount = Math.max(1, Math.round(item.supportCount));
    const supportWidth = item.supportType === 'pipe' ? item.pipeDiameter : item.prismWidth;
    const supportG = supportHeight > 0 ? calcGust(Math.max(supportHeight, 0.1), supportWidth, item.terrain) : 0;
    const segmentHeight = supportHeight > 0 ? supportHeight / supportSegments : 0;
    const slenderness = item.supportType === 'angular' ? supportHeight / supportWidth : 0;
    const R = item.supportType === 'angular' ? angularR(slenderness) : 0;
    const rows = [];
    for (let index = 0; index < supportSegments && supportHeight > 0; index += 1) {
      const zMid = index * segmentHeight + segmentHeight / 2;
      const q = calcQz(zMid, item);
      const dSqrtQz = item.supportType === 'pipe' ? item.pipeDiameter * Math.sqrt(q.qz) : 0;
      const cf = item.supportType === 'pipe'
        ? cableCf[item.pipeRoughness][dSqrtQz <= 1.70 ? 0 : 1]
        : angularCf[item.prismShape] * R;
      const area = supportWidth * segmentHeight * supportCount;
      const pressure = q.qz * supportG * cf;
      const force = pressure * area;
      rows.push({ zMid, Kz:q.Kz, qz:q.qz, dSqrtQz, cf, area, force, moment:force * zMid });
    }
    const supportShear = rows.reduce((sum, row) => sum + row.force, 0);
    const supportMoment = rows.reduce((sum, row) => sum + row.moment, 0);
    const first = rows[0] || {};
    const last = rows[rows.length - 1] || {};
    const totalShear = panelForce + supportShear;
    const totalMoment = panelMoment + supportMoment;
    return [item.id, {
      panelGroundRoute:panelAtGround ? 1 : 0,
      panelElevatedRoute:panelAtGround ? 0 : 1,
      panelAspect,
      panelAspectUsed:panelTable.x,
      panelClampedLow:panelAspect < (panelAtGround ? 3 : 6) ? 1 : 0,
      panelClampedHigh:panelAspect > (panelAtGround ? 40 : 80) ? 1 : 0,
      panelTableCf:panelTable.value,
      panelManualCf:item.panelCfOverride == null ? 0 : 1,
      panelCf,
      panelTop,
      panelZr,
      panelArea,
      panelKz:panelQ.Kz,
      panelQz:panelQ.qz,
      panelG,
      panelPressure,
      panelForce,
      panelMoment,
      supportPipeRoute:item.supportType === 'pipe' ? 1 : 0,
      supportAngularRoute:item.supportType === 'angular' ? 1 : 0,
      supportZeroHeight:supportHeight === 0 ? 1 : 0,
      supportCount,
      supportSegments,
      supportHeight,
      supportWidth,
      supportG,
      segmentHeight,
      angularShapeCf:item.supportType === 'angular' ? angularCf[item.prismShape] : 0,
      angularSlenderness:slenderness,
      angularR:R,
      angularR06:R === 0.6 ? 1 : 0,
      angularR07:R === 0.7 ? 1 : 0,
      angularR08:R === 0.8 ? 1 : 0,
      angularR10:R === 1.0 ? 1 : 0,
      pipeLowRegimeCount:item.supportType === 'pipe' ? rows.filter(row => row.dSqrtQz <= 1.70).length : 0,
      pipeHighRegimeCount:item.supportType === 'pipe' ? rows.filter(row => row.dSqrtQz > 1.70).length : 0,
      firstZMid:first.zMid || 0,
      firstKz:first.Kz || 0,
      firstQz:first.qz || 0,
      firstDSqrtQz:first.dSqrtQz || 0,
      firstCf:first.cf || 0,
      lastZMid:last.zMid || 0,
      lastKz:last.Kz || 0,
      lastQz:last.qz || 0,
      lastDSqrtQz:last.dSqrtQz || 0,
      lastCf:last.cf || 0,
      supportArea:rows.reduce((sum, row) => sum + row.area, 0),
      supportShear,
      supportMoment,
      supportLineLoad:supportHeight > 0 ? supportShear / supportHeight : 0,
      totalShear,
      totalMoment,
      resultantHeight:totalShear > 0 ? totalMoment / totalShear : 0,
    }];
  }));
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

function seismicAppendageOracle(input) {
  return Object.fromEntries(input.cases.map(i => {
    const Rpa = i.isTaipeiBasin ? 1 + (i.Rp - 1) / 2 : 1 + (i.Rp - 1) / 1.5;
    const CphCalc = 0.4 * i.SDS * i.Ip * (i.ap / Rpa) * (1 + 2 * i.hx / i.hn);
    const CphMax = 1.6 * i.SDS * i.Ip;
    const CphMin = 0.3 * i.SDS * i.Ip;
    const Cph = Math.min(CphMax, Math.max(CphMin, CphCalc));
    const FphCalc = CphCalc * i.Wp;
    const FphMax = CphMax * i.Wp;
    const FphMin = CphMin * i.Wp;
    const Fph = Cph * i.Wp;
    const Fpv = (i.isNearFault ? 2 / 3 : 1 / 2) * Fph;
    return [i.id, {
      Rpa, CphCalc, CphMax, CphMin, Cph,
      FphCalc, FphMax, FphMin, Fph, Fpv, Cpv:Fpv / i.Wp,
      calcControls:CphCalc <= CphMax && CphCalc >= CphMin ? 1 : 0,
      maxControls:CphCalc > CphMax ? 1 : 0,
      minControls:CphCalc < CphMin ? 1 : 0
    }];
  }));
}

function windCcThreeBranchOracle(input) {
  const terrain = {
    A:{ alpha:0.32, zg:500, zmin:18 },
    B:{ alpha:0.25, zg:400, zmin:9 },
    C:{ alpha:0.15, zg:300, zmin:4.5 },
  };
  const tables = {
    lowWall:{
      zone4:{ pos:[1.89, 1.46], neg:[-2.08, -1.67] },
      zone5:{ pos:[1.89, 1.46], neg:[-2.71, -1.67] },
    },
    lowRoof:{
      zone1:{ pos:[0.62, 0.42], neg:[-2.08, -1.46] },
      zone2:{ pos:[0.62, 0.42], neg:[-3.75, -1.67] },
      zone3:{ pos:[0.62, 0.42], neg:[-5.83, -2.08], negAmax:9.3 },
    },
    highWall:{
      zone4:{ pos:[1.87, 1.46], neg:[-1.88, -1.67] },
      zone5:{ pos:[1.87, 1.46], neg:[-3.75, -1.67] },
    },
    highRoof:{
      zone1:{ pos:[0.62, 0.42], neg:[-2.08, -1.75] },
      zone2:{ pos:[0.62, 0.42], neg:[-3.75, -2.29] },
      zone3:{ pos:[0.62, 0.42], neg:[-5.83, -2.29], negAmax:9.3 },
    },
  };
  const q = (z, i) => {
    const t = terrain[i.terrain];
    const zUse = Math.max(z, t.zmin);
    const kz = 2.774 * Math.pow(zUse / t.zg, 2 * t.alpha);
    return 0.06 * kz * i.Kzt * i.I ** 2 * i.V ** 2;
  };
  const interpolate = (curve, area, maxArea = 46.5) => {
    if (area <= 0.93) return curve[0];
    if (area >= maxArea) return curve[1];
    const ratio = Math.log10(area / 0.93) / Math.log10(maxArea / 0.93);
    return curve[0] + (curve[1] - curve[0]) * ratio;
  };
  return Object.fromEntries(input.cases.map(i => {
    const isLE18 = i.h <= 18;
    const tableKey = `${isLE18 ? 'low' : 'high'}${i.surface === 'roof' ? 'Roof' : 'Wall'}`;
    const curve = tables[tableKey][i.zone];
    const qh = q(i.h, i);
    const qz = q(Math.max(i.z, 0), i);
    const qh0 = q(Math.max(i.zh0, 0), i);
    const gcpPos = interpolate(curve.pos, i.A);
    const gcpNeg = interpolate(curve.neg, i.A, curve.negAmax);
    const gcpi = i.encl === 'partial' ? 1.145 : 0.375;
    const qPos = !isLE18 && i.surface === 'wall' ? qz : qh;
    const qNeg = qh;
    const qiPos = i.encl === 'partial' ? qh0 : qh;
    const qiNeg = qh;
    return [i.id, {
      qh, qz, qh0, qPos, qNeg, qiPos, qiNeg,
      zUse:i.z, zh0Use:i.zh0,
      gcpPos, gcpNeg, gcpi,
      pPos:qPos * gcpPos + qiNeg * gcpi,
      pNeg:qNeg * gcpNeg - qiPos * gcpi,
      isLE18:isLE18 ? 1 : 0,
      positiveUsesZ:qPos === qz && qz !== qh ? 1 : 0,
      partialNegativeUsesZh0:qiPos === qh0 && qh0 !== qh ? 1 : 0,
    }];
  }));
}

function windParapetThreeRouteOracle(input) {
  const terrain = {
    A:{ alpha:0.32, zg:500, zmin:18 },
    B:{ alpha:0.25, zg:400, zmin:9 },
    C:{ alpha:0.15, zg:300, zmin:4.5 },
  };
  const tables = {
    lowWall:{
      zone4:{ pos:[1.89, 1.46], neg:[-2.08, -1.67] },
      zone5:{ pos:[1.89, 1.46], neg:[-2.71, -1.67] },
    },
    lowRoof:{
      zone2:{ pos:[0.62, 0.42], neg:[-3.75, -1.67] },
      zone3:{ pos:[0.62, 0.42], neg:[-5.83, -2.08], negAmax:9.3 },
    },
    highWall:{
      zone4:{ pos:[1.87, 1.46], neg:[-1.88, -1.67] },
      zone5:{ pos:[1.87, 1.46], neg:[-3.75, -1.67] },
    },
    highRoof:{
      zone2:{ pos:[0.62, 0.42], neg:[-3.75, -2.29] },
      zone3:{ pos:[0.62, 0.42], neg:[-5.83, -2.29], negAmax:9.3 },
    },
  };
  const q = (z, i) => {
    const t = terrain[i.terrain];
    const zUse = Math.max(z, t.zmin);
    const kz = 2.774 * Math.pow(zUse / t.zg, 2 * t.alpha);
    return 0.06 * kz * i.Kzt * i.I ** 2 * i.V ** 2;
  };
  const interpolate = (curve, area, maxArea = 46.5) => {
    if (area <= 0.93) return curve[0];
    if (area >= maxArea) return curve[1];
    const ratio = Math.log10(area / 0.93) / Math.log10(maxArea / 0.93);
    return curve[0] + (curve[1] - curve[0]) * ratio;
  };
  const pressure = (qp, coefficient, gcpi) => qp * (
    coefficient >= 0 ? coefficient + gcpi : coefficient - gcpi
  );
  const summarize = cases => {
    const control = cases.reduce(
      (best, item) => Math.abs(item.pDiff) > Math.abs(best.pDiff) ? item : best,
      cases[0]
    );
    const output = {
      caseCount:cases.length,
      qp:cases[0].qp,
      topZ:cases[0].topZ,
      gcpi:cases[0].gcpi,
      isLE18:cases[0].isLE18,
    };
    for (const item of cases) {
      output[item.key] = {
        frontGCp:item.frontGCp,
        backGCp:item.backGCp,
        pFront:item.pFront,
        pBack:item.pBack,
        pDiff:item.pDiff,
        controls:item.key === control.key ? 1 : 0,
      };
    }
    return output;
  };
  const buildBuildingCases = i => {
    const isLE18 = i.h <= 18;
    const wall = tables[isLE18 ? 'lowWall' : 'highWall'];
    const roof = tables[isLE18 ? 'lowRoof' : 'highRoof'];
    const qp = q(i.h + i.hp, i);
    const gcpi = i.GCpiOverride != null ? i.GCpiOverride : ({ enclosed:0.375, partial:1.145, open:0 })[i.encl];
    const definitions = [
      { key:'windward_edge', face:'windward', wallZone:'zone4', roofZone:'zone2' },
      { key:'windward_corner', face:'windward', wallZone:'zone5', roofZone:'zone3' },
      { key:'leeward_edge', face:'leeward', wallZone:'zone4', roofZone:'zone2' },
      { key:'leeward_corner', face:'leeward', wallZone:'zone5', roofZone:'zone3' },
    ];
    return definitions.map(item => {
      const wallPos = interpolate(wall[item.wallZone].pos, i.A);
      const wallNeg = interpolate(wall[item.wallZone].neg, i.A, wall[item.wallZone].negAmax);
      const roofNeg = interpolate(roof[item.roofZone].neg, i.A, roof[item.roofZone].negAmax);
      const frontGCp = item.face === 'windward' ? wallPos : wallNeg;
      const backGCp = item.face === 'windward' ? roofNeg : wallPos;
      const pFront = pressure(qp, frontGCp, gcpi);
      const pBack = pressure(qp, backGCp, gcpi);
      return { ...item, qp, topZ:i.h + i.hp, gcpi, isLE18:isLE18 ? 1 : 0, frontGCp, backGCp, pFront, pBack, pDiff:pFront - pBack };
    });
  };
  const buildSingleCases = i => {
    const isLE18 = i.h <= 18;
    const wall = tables[isLE18 ? 'lowWall' : 'highWall'];
    const qp = q(i.h + i.hp, i);
    const gcpi = i.GCpiOverride != null ? i.GCpiOverride : ({ enclosed:0.375, partial:1.145, open:0 })[i.encl];
    const definitions = [
      { key:'edge_left', zone:'zone4', left:true },
      { key:'edge_right', zone:'zone4', left:false },
      { key:'corner_left', zone:'zone5', left:true },
      { key:'corner_right', zone:'zone5', left:false },
    ];
    return definitions.map(item => {
      const wallPos = interpolate(wall[item.zone].pos, i.A);
      const wallNeg = interpolate(wall[item.zone].neg, i.A, wall[item.zone].negAmax);
      const frontGCp = item.left ? wallPos : wallNeg;
      const backGCp = item.left ? wallNeg : wallPos;
      const pFront = pressure(qp, frontGCp, gcpi);
      const pBack = pressure(qp, backGCp, gcpi);
      return { ...item, qp, topZ:i.h + i.hp, gcpi, isLE18:isLE18 ? 1 : 0, frontGCp, backGCp, pFront, pBack, pDiff:pFront - pBack };
    });
  };
  const mwQp = q(input.mwfrs.h + input.mwfrs.hp, input.mwfrs);
  return {
    mwfrs:{
      qp:mwQp,
      topZ:input.mwfrs.h + input.mwfrs.hp,
      windwardGCpn:1.8,
      windwardP:mwQp * 1.8,
      leewardGCpn:-1.1,
      leewardP:mwQp * -1.1,
    },
    buildingCc:summarize(buildBuildingCases(input.buildingCc)),
    singleCc:summarize(buildSingleCases(input.singleCc)),
  };
}

function windOpenRoofFourCombinationOracle(input) {
  const terrain = {
    A:{ alpha:0.32, zg:500, c:0.45, ell:55, eps:0.50, zmin:18 },
    B:{ alpha:0.25, zg:400, c:0.30, ell:98, eps:0.33, zmin:9 },
    C:{ alpha:0.15, zg:300, c:0.20, ell:152, eps:0.20, zmin:4.5 },
  };
  const coefficientTables = {
    monoslope:{
      unblocked:{
        7.5:{ small:{ zone1:[1.6, -1.4], zone2:[2.4, -2.1], zone3:[3.2, -4.2] } },
        15:{ small:{ zone1:[1.8, -1.9], zone2:[2.7, -2.9], zone3:[3.6, -3.8] } },
      },
      blocked:{
        30:{ medium:{ zone1:[1.6, -2.3], zone2:[2.4, -3.5], zone3:[2.4, -3.5] } },
      },
    },
    gable:{
      unblocked:{
        30:{ large:{ zone1:[1.3, -0.9], zone2:[1.3, -0.9], zone3:[1.3, -0.9] } },
        45:{ large:{ zone1:[1.1, -0.8], zone2:[1.1, -0.8], zone3:[1.1, -0.8] } },
      },
      blocked:{
        7.5:{ small:{ zone1:[0.5, -1.7], zone2:[0.8, -2.6], zone3:[1.0, -5.1] } },
      },
    },
  };
  const angleBounds = theta => {
    const angles = [0, 7.5, 15, 30, 45];
    const thetaUse = Math.max(angles[0], Math.min(theta, angles[angles.length - 1]));
    const exact = angles.find(angle => angle === thetaUse);
    if (exact !== undefined) return { thetaUse, low:exact, high:exact };
    const high = angles.find(angle => angle > thetaUse);
    return { thetaUse, low:angles[angles.indexOf(high) - 1], high };
  };
  const interpolate = (low, high, theta, lowValue, highValue) => (
    low === high ? lowValue : lowValue + (highValue - lowValue) * (theta - low) / (high - low)
  );
  return Object.fromEntries(input.cases.map(i => {
    const t = terrain[i.terrain];
    const hUse = i.theta <= 10 ? i.hEave : i.hAvg;
    const zQ = Math.max(hUse, t.zmin);
    const kz = 2.774 * Math.pow(zQ / t.zg, 2 * t.alpha);
    const qh = 0.06 * kz * i.Kzt * i.I ** 2 * i.V ** 2;
    const zBar = Math.max(0.6 * hUse, t.zmin);
    const Iz = t.c * Math.pow(10 / zBar, 1 / 6);
    const Lz = t.ell * Math.pow(zBar / 10, t.eps);
    const Q2 = 1 / (1 + 0.63 * Math.pow((i.B + hUse) / Lz, 0.63));
    const Q = Math.sqrt(Q2);
    const G = 1.927 * (1 + 1.7 * 3.4 * Iz * Q) / (1 + 1.7 * 3.4 * Iz);
    const minWidth = Math.min(i.B, i.L);
    const a = Math.max(0.1 * minWidth, 0.9);
    const band = i.A < a ** 2 ? 'small' : i.A <= 4 * a ** 2 ? 'medium' : 'large';
    const { thetaUse, low, high } = angleBounds(i.theta);
    const table = coefficientTables[i.roofType][i.blockage];
    const zones = ['zone1', 'zone2', 'zone3'].map(zone => {
      const lowPair = table[low][band][zone];
      const highPair = table[high][band][zone];
      const cpnPos = interpolate(low, high, thetaUse, lowPair[0], highPair[0]);
      const cpnNeg = interpolate(low, high, thetaUse, lowPair[1], highPair[1]);
      return { zone, cpnPos, cpnNeg, pPos:qh * G * cpnPos, pNeg:qh * G * cpnNeg };
    });
    const maxPos = zones.reduce((best, current) => current.pPos > best.pPos ? current : best, zones[0]);
    const maxNeg = zones.reduce((best, current) => current.pNeg < best.pNeg ? current : best, zones[0]);
    const maxAbs = zones.reduce((best, current) => (
      Math.max(Math.abs(current.pPos), Math.abs(current.pNeg))
        > Math.max(Math.abs(best.pPos), Math.abs(best.pNeg)) ? current : best
    ), zones[0]);
    const result = {
      hUse,
      eaveHeightControls:i.theta <= 10 ? 1 : 0,
      qh, G, minWidth, a,
      smallBand:band === 'small' ? 1 : 0,
      mediumBand:band === 'medium' ? 1 : 0,
      largeBand:band === 'large' ? 1 : 0,
      thetaUse, thetaLow:low, thetaHigh:high,
    };
    for (const item of zones) {
      result[item.zone] = {
        cpnPos:item.cpnPos,
        cpnNeg:item.cpnNeg,
        pPos:item.pPos,
        pNeg:item.pNeg,
        maxPos:item.zone === maxPos.zone ? 1 : 0,
        maxNeg:item.zone === maxNeg.zone ? 1 : 0,
        maxAbs:item.zone === maxAbs.zone ? 1 : 0,
      };
    }
    return [i.id, result];
  }));
}

function seismicMiscOracle(input) {
  const interpolate = (xs, ys, x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    const upper = xs.findIndex(value => value >= x);
    const lower = upper - 1;
    return ys[lower] + (x - xs[lower]) / (xs[upper] - xs[lower]) * (ys[upper] - ys[lower]);
  };
  const faX = [0.5, 0.6, 0.7, 0.8, 0.9];
  const fvX = [0.30, 0.35, 0.40, 0.45, 0.50];
  const faRows = { 1:[1,1,1,1,1], 2:[1.1,1.1,1,1,1], 3:[1.2,1.2,1.1,1,1] };
  const fvRows = { 1:[1,1,1,1,1], 2:[1.5,1.4,1.3,1.2,1.1], 3:[1.8,1.7,1.6,1.5,1.4] };
  const calcSa = (T, short, oneSecond) => {
    const transition = oneSecond / short;
    if (T <= 0.2 * transition) return short * (0.4 + 3 * T / transition);
    if (T <= transition) return short;
    if (T <= 2.5 * transition) return oneSecond / T;
    return Math.max(0.4 * short, oneSecond / T);
  };
  const calcFu = (capacity, T, transition) => {
    const short = Math.sqrt(2 * capacity - 1);
    if (T >= transition) return capacity;
    if (T >= 0.6 * transition) return short + (capacity - short) * (T - 0.6 * transition) / (0.4 * transition);
    if (T >= 0.2 * transition) return short;
    return 1 + (short - 1) * T / (0.2 * transition);
  };
  const modified = ratio => ratio <= 0.3 ? ratio : ratio >= 0.8 ? 0.7 * ratio : 0.52 * ratio + 0.144;
  const modifiedVertical = (ratio, nearFault) => {
    const low = nearFault ? 0.20 : 0.15;
    const high = nearFault ? 0.53 : 0.40;
    return ratio >= high ? 0.7 * ratio : ratio > low ? 0.52 * ratio + 0.18 * high : ratio;
  };
  return Object.fromEntries(input.cases.map(i => {
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
    const T = i.T_user > 0 ? i.T_user : 0;
    const Ra = 1 + (i.R - 1) / (i.isTaipeiBasin ? 2 : 1.5);
    const Fu = calcFu(Ra, T, ToD);
    const FuM = T >= ToM ? i.R : calcFu(i.R, T, ToM);
    const SaD = calcSa(T, SDS, SD1);
    const SaM = calcSa(T, SMS, SM1);
    const ratio = SaD / Fu;
    const ratioM = SaM / FuM;
    const ratioModified = modified(ratio);
    let denom;
    let Vh;
    let similarPath = 0;
    let rigidPath = 0;
    let flexiblePath = 0;
    let Vv;
    let verticalSa = 0;
    let verticalFu = 0;
    let verticalRatioModified = 0;
    if (i.mode === 'similar') {
      denom = 1.4 * i.alphaY;
      Vh = i.I / denom * ratioModified * i.W;
      similarPath = 1;
      verticalSa = (i.isNearFault ? 2 / 3 : 1 / 2) * SaD;
      verticalFu = calcFu(3, T, ToD);
      verticalRatioModified = modifiedVertical(verticalSa / verticalFu, i.isNearFault);
      Vv = i.I / (1.4 * i.alphaY) * verticalRatioModified * i.W;
    } else if (T < 0.06) {
      denom = 3 * i.alphaY;
      Vh = SDS * i.I * i.W / denom;
      Vv = (i.isNearFault ? 2 / 3 : 1 / 2) * Vh;
      rigidPath = 1;
    } else {
      denom = 1.2 * i.alphaY;
      Vh = i.I / denom * ratioModified * i.W;
      Vv = (i.isNearFault ? 2 / 3 : 1 / 2) * Vh;
      flexiblePath = 1;
    }
    return [i.id, {
      FaD, FvD, SDS, SD1, ToD, T, Ra, Fu, SaD, ratio, ratioM, ratioModified,
      denom, Vh, VhCoeff:Vh / i.W, Vv, VvCoeff:Vv / i.W,
      similarPath, rigidPath, flexiblePath, verticalSa, verticalFu, verticalRatioModified
    }];
  }));
}

function steelPlateConnectionOracle(input) {
  const baseEdgeDistance = diameter => {
    const table = [
      [13, 19], [16, 22], [20, 25], [22, 28.5], [24, 32], [27, 38], [30, 41],
    ];
    return table.find(([limit]) => diameter <= limit)?.[1] || 1.5 * diameter;
  };
  const holeIncrement = (holeType, diameter, direction) => {
    if (holeType === 'short_slot_perpendicular' && direction === 'side') return diameter <= 22 ? 3 : diameter <= 24 ? 3 : 4.5;
    return 0;
  };
  const available = (nominal, method, phi, omega) => method === 'ASD' ? nominal / omega : phi * nominal;

  const calculateCase = i => {
    const horizontal = i.loadDirection === 'horizontal';
    const grossWidth = horizontal ? i.plateLength : i.plateWidth;
    const holeCountAcross = horizontal ? i.rowCount : i.lineCount;
    const holeCountAlong = horizontal ? i.lineCount : i.rowCount;
    const parallelSpacing = horizontal ? i.pitchX : i.pitchY;
    const transverseSpacing = horizontal ? i.pitchY : i.pitchX;
    const holeWidth = i.holeDiameter + 1.5;
    const controlNetWidth = grossWidth - holeCountAcross * holeWidth;
    const shearLength = Math.min(i.endDistanceStart, i.endDistanceEnd) + Math.max(holeCountAlong - 1, 0) * parallelSpacing;
    const Ag = grossWidth * i.plateThickness;
    const An = controlNetWidth * i.plateThickness;
    const Ae = Math.min(An, 0.85 * Ag);
    const automatic = {
      Agv:2 * shearLength * i.plateThickness,
      Anv:2 * (shearLength - (holeCountAlong - 0.5) * holeWidth) * i.plateThickness,
      Agt:Ag,
      Ant:An,
    };
    const areas = i.useManualBlockShearPath
      ? { Agv:i.manualAgv, Anv:i.manualAnv, Agt:i.manualAgt, Ant:i.manualAnt }
      : automatic;

    const grossNominal = i.plateYieldStrength * Ag / 1000;
    const grossAvailable = available(grossNominal, i.designMethod, 0.9, 1.67);
    const netNominal = i.plateUltimateStrength * Ae / 1000;
    const netAvailable = available(netNominal, i.designMethod, 0.75, 2);
    const tensionRupture = i.plateUltimateStrength * areas.Ant / 1000;
    const shearRupture = 0.6 * i.plateUltimateStrength * areas.Anv / 1000;
    const shearYield = 0.6 * i.plateYieldStrength * areas.Agv / 1000;
    const tensionYield = i.plateYieldStrength * areas.Agt / 1000;
    const equation3 = tensionRupture >= shearRupture;
    const blockNominal = equation3
      ? Math.min(shearYield + tensionRupture, shearRupture + tensionRupture)
      : Math.min(shearRupture + tensionYield, shearRupture + tensionRupture);
    const blockAvailable = available(blockNominal, i.designMethod, 0.75, 2);

    const ratios = [
      ['gross', i.requiredTension / grossAvailable],
      ['net', i.requiredTension / netAvailable],
      ['block', i.requiredTension / blockAvailable],
    ];
    const governing = ratios.sort((a, b) => b[1] - a[1])[0][0];
    const minSpacing = 3 * i.boltDiameter;
    const baseEdge = baseEdgeDistance(i.boltDiameter);
    const minEnd = baseEdge + holeIncrement(i.holeType, i.boltDiameter, 'end');
    const minSide = baseEdge + holeIncrement(i.holeType, i.boltDiameter, 'side');
    const maxEdge = Math.min(12 * i.plateThickness, 150);
    const maxSpacing = i.exposureCondition === 'weathering'
      ? Math.min(14 * i.plateThickness, 180)
      : Math.min(24 * i.plateThickness, 300);
    const spacingAlong = holeCountAlong > 1 ? parallelSpacing : minSpacing;
    const spacingAcross = holeCountAcross > 1 ? transverseSpacing : minSpacing;
    const holeCompatible = ['standard', 'short_slot_perpendicular', 'long_slot_perpendicular'].includes(i.holeType);
    const geometryValid = An > 0 && areas.Agv > 0 && areas.Anv > 0 && areas.Agt > 0 && areas.Ant > 0;
    const detailPass = holeCompatible
      && spacingAlong >= minSpacing && spacingAcross >= minSpacing
      && i.endDistanceStart >= minEnd && i.endDistanceEnd >= minEnd
      && i.edgeDistanceTop >= minSide && i.edgeDistanceBottom >= minSide
      && spacingAlong <= maxSpacing && spacingAcross <= maxSpacing
      && Math.max(i.endDistanceStart, i.endDistanceEnd) <= maxEdge
      && geometryValid;

    return {
      horizontal:horizontal ? 1 : 0,
      lrfd:i.designMethod === 'LRFD' ? 1 : 0,
      holeWidth,
      Ag, An, Ae,
      Agv:areas.Agv, Anv:areas.Anv, Agt:areas.Agt, Ant:areas.Ant,
      grossNominal, grossAvailable, grossRatio:i.requiredTension / grossAvailable,
      netNominal, netAvailable, netRatio:i.requiredTension / netAvailable,
      blockNominal, blockAvailable, blockRatio:i.requiredTension / blockAvailable,
      blockEquation3:equation3 ? 1 : 0,
      blockEquation4:equation3 ? 0 : 1,
      grossControls:governing === 'gross' ? 1 : 0,
      netControls:governing === 'net' ? 1 : 0,
      blockControls:governing === 'block' ? 1 : 0,
      minSpacingAlongProvided:spacingAlong,
      minSpacingAlongRequired:minSpacing,
      minSpacingAlongPass:spacingAlong >= minSpacing ? 1 : 0,
      minSpacingAcrossProvided:spacingAcross,
      minSpacingAcrossRequired:minSpacing,
      minSpacingAcrossPass:spacingAcross >= minSpacing ? 1 : 0,
      minEndRequired:minEnd,
      minSideRequired:minSide,
      maxSpacingRequired:maxSpacing,
      maxEdgeRequired:maxEdge,
      holeCompatible:holeCompatible ? 1 : 0,
      geometryNetValid:An > 0 ? 1 : 0,
      geometryBlockValid:geometryValid ? 1 : 0,
      manualBlockPath:i.useManualBlockShearPath ? 1 : 0,
      validationCount:0,
      overallPass:detailPass && ratios.every(([, ratio]) => ratio <= 1) ? 1 : 0,
    };
  };

  return Object.fromEntries(input.cases.map(item => [item.id, calculateCase(item)]));
}

function steelFormalOracle(input) {
  const available = (nominal, method, phi, omega) => method === 'ASD' ? nominal / omega : phi * nominal;
  const baseEdgeDistance = (diameter, fabrication) => {
    const rolled = [[13, 19], [16, 22], [20, 25], [22, 28.5], [24, 32], [27, 38], [30, 41]];
    const sheared = [[13, 22], [16, 28.5], [20, 32], [22, 38], [24, 44.5], [27, 50], [30, 57]];
    const table = fabrication === 'sheared' ? sheared : rolled;
    return table.find(([limit]) => diameter <= limit)?.[1] || (fabrication === 'sheared' ? 1.75 : 1.25) * diameter;
  };
  const bearingPerBolt = (lc, i) => {
    const c1 = i.deformationConsidered === false ? 1.5 : 1.2;
    const c2 = i.deformationConsidered === false ? 3.0 : 2.4;
    return Math.min(c1 * Math.max(lc, 0) * i.memberThickness * i.memberUltimateStrength, c2 * i.boltDiameter * i.memberThickness * i.memberUltimateStrength) / 1000;
  };
  const governing = checks => checks.reduce((best, current) => current.ratio > best.ratio ? current : best, checks[0]).key;

  const plateCase = i => {
    const holeWidth = i.holeDiameter + 1.5;
    const grossWidth = i.plateLength;
    const shearLength = Math.min(i.endDistanceStart, i.endDistanceEnd) + (i.lineCount - 1) * i.pitchX;
    const Ag = grossWidth * i.plateThickness;
    const An = (grossWidth - i.rowCount * holeWidth) * i.plateThickness;
    const Ae = Math.min(An, 0.85 * Ag);
    const Agv = 2 * shearLength * i.plateThickness;
    const Anv = 2 * (shearLength - (i.lineCount - 0.5) * holeWidth) * i.plateThickness;
    const Agt = Ag;
    const Ant = An;
    const grossAvailable = available(i.plateYieldStrength * Ag / 1000, i.designMethod, 0.9, 1.67);
    const netAvailable = available(i.plateUltimateStrength * Ae / 1000, i.designMethod, 0.75, 2);
    const tensionRupture = i.plateUltimateStrength * Ant / 1000;
    const shearRupture = 0.6 * i.plateUltimateStrength * Anv / 1000;
    const shearYield = 0.6 * i.plateYieldStrength * Agv / 1000;
    const tensionYield = i.plateYieldStrength * Agt / 1000;
    const equation3 = tensionRupture >= shearRupture;
    const blockNominal = equation3
      ? Math.min(shearYield + tensionRupture, shearRupture + tensionRupture)
      : Math.min(shearRupture + tensionYield, shearRupture + tensionRupture);
    const blockAvailable = available(blockNominal, i.designMethod, 0.75, 2);
    const checks = [
      { key:'gross', ratio:i.requiredTension / grossAvailable },
      { key:'net', ratio:i.requiredTension / netAvailable },
      { key:'block', ratio:i.requiredTension / blockAvailable },
    ];
    const minSpacing = 3 * i.boltDiameter;
    const minEdge = baseEdgeDistance(i.boltDiameter, i.edgeFabrication);
    const maxSpacing = i.exposureCondition === 'weathering' ? Math.min(14 * i.plateThickness, 180) : Math.min(24 * i.plateThickness, 300);
    const maxEdge = Math.min(12 * i.plateThickness, 150);
    const detailPass = i.pitchX >= minSpacing && i.pitchY >= minSpacing
      && i.endDistanceStart >= minEdge && i.endDistanceEnd >= minEdge
      && i.edgeDistanceTop >= minEdge && i.edgeDistanceBottom >= minEdge
      && i.pitchX <= maxSpacing && i.pitchY <= maxSpacing
      && Math.max(i.endDistanceStart, i.endDistanceEnd) <= maxEdge
      && An > 0 && Agv > 0 && Anv > 0 && Agt > 0 && Ant > 0;
    return {
      Ag, An, Ae, Agv, Anv, Agt, Ant,
      grossAvailable, netAvailable, blockAvailable,
      governingBlock: governing(checks) === 'block' ? 1 : 0,
      detailPass: detailPass ? 1 : 0,
      overallPass: detailPass && checks.every(check => check.ratio <= 1) ? 1 : 0,
    };
  };

  const tensionCase = i => {
    const bolted = i.tensionConnectionMode === 'bolted';
    const Ag = i.memberWidth * i.memberThickness;
    const holeWidth = i.holeDiameter + 1.5;
    const An = bolted ? (i.memberWidth - i.tensionBoltRowCount * holeWidth) * i.memberThickness : Ag;
    let U;
    let Ae;
    if (bolted) {
      U = i.tensionShearLagCase === 'w_shape_flange_ge_3' ? 0.9
        : i.tensionShearLagCase === 'other_ge_3' ? 0.85
          : i.tensionShearLagCase === 'two_bolts' ? 0.75 : Math.min(An, 0.85 * Ag) / Ag;
      Ae = i.tensionShearLagCase === 'connection_plate_cap' ? Math.min(An, 0.85 * Ag) : U * An;
    } else if (i.tensionWeldCase === 'transverse_direct') {
      U = 1;
      Ae = i.tensionDirectConnectedArea;
    } else {
      const ratio = i.tensionWeldLengthLongitudinal / i.memberWidth;
      U = ratio >= 2 ? 1 : ratio >= 1.5 ? 0.87 : ratio >= 1 ? 0.75 : 0;
      Ae = U * Ag;
    }
    const grossNominal = i.memberYieldStrength * Ag / 1000;
    const grossAvailable = available(grossNominal, i.designMethod, 0.9, 1.67);
    const netNominal = i.memberUltimateStrength * Ae / 1000;
    const netAvailable = available(netNominal, i.designMethod, 0.75, 2);
    const checks = [
      { key:'gross', ratio:i.requiredTension / grossAvailable },
      { key:'net', ratio:i.requiredTension / netAvailable },
    ];
    const output = {
      bolted:bolted ? 1 : 0,
      lrfd:i.designMethod === 'LRFD' ? 1 : 0,
      Ag, An, Ae, U,
      slenderness:i.unsupportedLength / i.radiusOfGyration,
      grossNominal, grossAvailable, grossRatio:i.requiredTension / grossAvailable,
      netNominal, netAvailable, netRatio:i.requiredTension / netAvailable,
      validationCount:1,
    };

    let detailPass = output.slenderness <= 300 && Ae <= Ag;
    if (bolted) {
      const boltCount = i.tensionBoltLineCount * i.tensionBoltRowCount;
      const boltArea = Math.PI * i.boltDiameter ** 2 / 4;
      const shearFactor = i.threadsCondition === 'excluded' ? 0.62 : 0.48;
      const boltNominal = shearFactor * i.boltUltimateStrength * boltArea * boltCount * i.tensionShearPlanes / 1000;
      const boltAvailable = available(boltNominal, i.designMethod, 0.75, 2);
      const endLc = i.tensionEndDistance - i.holeDiameter / 2;
      const interiorLc = i.tensionPitchLongitudinal - i.holeDiameter;
      const bearingNominal = (bearingPerBolt(endLc, i) + bearingPerBolt(interiorLc, i) * (i.tensionBoltLineCount - 1)) * i.tensionBoltRowCount;
      const bearingAvailable = available(bearingNominal, i.designMethod, 0.75, 2);
      const shearLength = i.tensionEndDistance + (i.tensionBoltLineCount - 1) * i.tensionPitchLongitudinal;
      const Agv = 2 * shearLength * i.memberThickness;
      const Anv = 2 * (shearLength - (i.tensionBoltLineCount - 0.5) * holeWidth) * i.memberThickness;
      const Agt = Ag;
      const Ant = An;
      const tensionRupture = i.memberUltimateStrength * Ant / 1000;
      const shearRupture = 0.6 * i.memberUltimateStrength * Anv / 1000;
      const shearYield = 0.6 * i.memberYieldStrength * Agv / 1000;
      const tensionYield = i.memberYieldStrength * Agt / 1000;
      const equation3 = tensionRupture >= shearRupture;
      const blockNominal = equation3
        ? Math.min(shearYield + tensionRupture, shearRupture + tensionRupture)
        : Math.min(shearRupture + tensionYield, shearRupture + tensionRupture);
      const blockAvailable = available(blockNominal, i.designMethod, 0.75, 2);
      checks.push(
        { key:'bolt', ratio:i.requiredTension / boltAvailable },
        { key:'bearing', ratio:i.requiredTension / bearingAvailable },
        { key:'block', ratio:i.requiredTension / blockAvailable },
      );
      const minSpacingRequired = 3 * i.boltDiameter;
      const minEndRequired = baseEdgeDistance(i.boltDiameter, i.edgeFabrication);
      const maxSpacingRequired = i.exposureCondition === 'weathering' ? Math.min(14 * i.memberThickness, 180) : Math.min(24 * i.memberThickness, 300);
      const maxEdge = Math.min(12 * i.memberThickness, 150);
      detailPass = detailPass
        && i.tensionPitchLongitudinal >= minSpacingRequired && i.tensionGaugeTransverse >= minSpacingRequired
        && i.tensionEndDistance >= minEndRequired && i.tensionEdgeDistanceNear >= minEndRequired && i.tensionEdgeDistanceFar >= minEndRequired
        && i.tensionPitchLongitudinal <= maxSpacingRequired
        && Math.max(i.tensionEndDistance, i.tensionEdgeDistanceNear, i.tensionEdgeDistanceFar) <= maxEdge
        && Agv > 0 && Anv > 0 && Agt > 0 && Ant > 0;
      Object.assign(output, {
        Agv, Anv, Agt, Ant,
        boltNominal, boltAvailable, boltRatio:i.requiredTension / boltAvailable,
        bearingNominal, bearingAvailable, bearingRatio:i.requiredTension / bearingAvailable,
        blockNominal, blockAvailable, blockRatio:i.requiredTension / blockAvailable,
        blockEquation3:equation3 ? 1 : 0,
        minSpacingRequired, minEndRequired, maxSpacingRequired,
      });
    } else {
      let weldAvailable;
      if (i.tensionWeldType === 'groove_cjp') {
        weldAvailable = available(i.memberYieldStrength * i.tensionDirectConnectedArea / 1000, i.designMethod, 0.9, 1.67);
      } else {
        const totalLength = i.tensionWeldLengthLongitudinal * i.tensionWeldLineCount + i.tensionWeldLengthTransverse;
        const baseArea = i.tensionConnectedThickness * totalLength;
        const weldArea = 0.707 * i.tensionWeldSize * totalLength;
        const baseAvailable = available(0.6 * i.memberYieldStrength * baseArea / 1000, i.designMethod, 0.9, 1.67);
        const electrodeAvailable = (i.designMethod === 'LRFD' ? 0.75 * 0.6 : 0.3) * i.tensionWeldElectrodeStrength * weldArea / 1000;
        weldAvailable = Math.min(baseAvailable, electrodeAvailable);
        const thicker = Math.max(i.memberThickness, i.tensionConnectedThickness);
        const thinner = Math.min(i.memberThickness, i.tensionConnectedThickness);
        const minimumFillet = thicker <= 6 ? 3 : thicker <= 12 ? 5 : thicker <= 19 ? 6 : 8;
        detailPass = detailPass && i.tensionWeldLengthLongitudinal >= i.memberWidth
          && i.tensionWeldLengthLongitudinal >= 4 * i.tensionWeldSize
          && i.tensionWeldSize >= minimumFillet && i.tensionWeldSize <= (thinner < 6 ? thinner : thinner - 1.5)
          && i.tensionLapLength >= Math.max(5 * thinner, 25);
      }
      checks.push({ key:'weld', ratio:i.requiredTension / weldAvailable });
      detailPass = detailPass && (i.tensionWeldType !== 'groove_cjp' || i.tensionWeldMatchingFiller === true);
      Object.assign(output, {
        weldNominal:weldAvailable,
        weldAvailable,
        weldRatio:i.requiredTension / weldAvailable,
        fillet:i.tensionWeldType === 'fillet' ? 1 : 0,
        cjp:i.tensionWeldType === 'groove_cjp' ? 1 : 0,
      });
    }
    const governingKey = governing(checks);
    Object.assign(output, {
      governingGross:governingKey === 'gross' ? 1 : 0,
      governingNet:governingKey === 'net' ? 1 : 0,
      governingBolt:governingKey === 'bolt' ? 1 : 0,
      governingBearing:governingKey === 'bearing' ? 1 : 0,
      governingBlock:governingKey === 'block' ? 1 : 0,
      governingWeld:governingKey === 'weld' ? 1 : 0,
      detailPass:detailPass ? 1 : 0,
      overallPass:detailPass && checks.every(check => check.ratio <= 1) ? 1 : 0,
    });
    return output;
  };

  return {
    [input.plateCase.id]:plateCase(input.plateCase),
    ...Object.fromEntries(input.tensionCases.map(item => [item.id, tensionCase(item)])),
  };
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

function rcSlabStrengthOracle(input) {
  const coefficients = support => ({
    simple:{ pos:8, neg:Infinity }, oneEnd:{ pos:14, neg:9 },
    bothEnd:{ pos:16, neg:11 }, cantilever:{ pos:Infinity, neg:2 },
  })[support];
  const phiFlexure = (epsT, fy) => {
    const epsY = fy / 2040000;
    if (epsT >= 0.005) return 0.9;
    if (epsT <= epsY) return 0.65;
    return 0.65 + 0.25 * (epsT - epsY) / (0.005 - epsY);
  };
  const calculateCase = i => {
    const b = 100;
    const netSpanCm = Math.max(i.Lx - i.supW, 0);
    const thicknessFactor = ({ simple:20, oneEnd:24, bothEnd:28, cantilever:10 })[i.supportX];
    const hmin = netSpanCm / thicknessFactor * (0.4 + i.fy / 7000);
    const spanM = i.Lx / 100;
    const cf = coefficients(i.supportX);
    const positiveMoment = Number.isFinite(cf.pos) ? i.wu * spanM ** 2 / cf.pos : 0;
    const negativeMoment = Number.isFinite(cf.neg) ? i.wu * spanM ** 2 / cf.neg : 0;
    const shearDemand = i.wu * spanM / 2;
    const temperatureRatio = i.fyT <= 2800 ? 0.002
      : i.fyT <= 4200 ? 0.0018
        : Math.max(0.0018 * 4200 / i.fyT, 0.0014);
    const AsMinimum = temperatureRatio * b * i.h;
    const effectiveDepth = i.h - i.cover - i.barDiameter / 2;
    const AsProvided = i.barArea * 100 / i.barSpacing;
    const capacity = Mu => {
      const nominalDemand = Mu * 100000 / 0.9;
      const quadraticA = i.fy ** 2 / (1.7 * i.fc * b);
      const quadraticB = -i.fy * effectiveDepth;
      const discriminant = quadraticB ** 2 - 4 * quadraticA * nominalDemand;
      const flexuralAs = Mu > 0 ? (-quadraticB - Math.sqrt(discriminant)) / (2 * quadraticA) : 0;
      const AsRequired = Math.max(flexuralAs, AsMinimum);
      const a = AsProvided * i.fy / (0.85 * i.fc * b);
      const beta1 = i.fc <= 280 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (i.fc - 280) / 70);
      const c = a / beta1;
      const epsT = 0.003 * (effectiveDepth - c) / c;
      const phi = phiFlexure(epsT, i.fy);
      const phiMn = phi * AsProvided * i.fy * (effectiveDepth - a / 2) / 100000;
      return { AsRequired, phiMn, ratio:Mu / phiMn, pass:AsProvided >= AsRequired && phiMn >= Mu ? 1 : 0 };
    };
    const positive = capacity(positiveMoment);
    const negative = capacity(negativeMoment);
    const rhoW = AsProvided / (b * effectiveDepth);
    const sizeEffect = Math.min(1, Math.sqrt(2 / (1 + effectiveDepth / 25)));
    const vc = 2.12 * sizeEffect * Math.cbrt(rhoW) * Math.sqrt(i.fc);
    const Vc = vc * b * effectiveDepth / 1000;
    const phiVc = 0.75 * Vc;
    const shearRatio = shearDemand / phiVc;
    const thicknessPass = i.h >= hmin ? 1 : 0;
    const shearPass = phiVc >= shearDemand ? 1 : 0;
    return {
      hmin, thicknessPass, spanM,
      positiveCoefficient:cf.pos, negativeCoefficient:cf.neg,
      positiveMoment, negativeMoment, shearDemand,
      temperatureRatio, AsMinimum, effectiveDepth, AsProvided,
      positiveAsRequired:positive.AsRequired, negativeAsRequired:negative.AsRequired,
      positivePhiMn:positive.phiMn, negativePhiMn:negative.phiMn,
      positiveRatio:positive.ratio, negativeRatio:negative.ratio,
      positivePass:positive.pass, negativePass:negative.pass,
      rhoW, sizeEffect, vc, Vc, phiVc, shearRatio, shearPass,
      overallPass:thicknessPass && positive.pass && negative.pass && shearPass ? 1 : 0,
    };
  };
  return Object.fromEntries(input.cases.map(item => [item.id, calculateCase(item)]));
}

function deckingSystemOracle(input) {
  const controlCode = values => {
    const maximum = Math.max(...values);
    return maximum === values[2] ? 3 : (maximum === values[1] ? 2 : 1);
  };
  const loadCombination = ({ WT, WT2 = WT, L, P_HS, Pcrane, Wc, craneUsesWT2 = false }) => {
    const M1 = WT * L * L / 8 + P_HS * L / 4;
    const V1 = WT * L / 2 + P_HS;
    const trackLength = 4.35;
    const M2 = WT * L * L / 8 + (L <= trackLength
      ? Wc * L * L / 8
      : Wc * (L * L - 4 * ((L - trackLength) / 2) ** 2) / 8);
    const V2 = WT * L / 2 + Wc * Math.min(L, trackLength) / 2;
    const craneWeight = craneUsesWT2 ? WT2 : WT;
    const M3 = craneWeight * L * L / 8 + Pcrane * L / 4;
    const V3 = craneWeight * L / 2 + Pcrane;
    return { M1, M2, M3, Mmax:Math.max(M1, M2, M3), V1, V2, V3, Vmax:Math.max(V1, V2, V3), control:controlCode([M1, M2, M3]) };
  };
  const deflections = ({ weight, craneWeight = weight, P_HS, Pcrane, Wc, L, E, I }) => {
    const span = L * 100;
    const EI = E * I;
    const full = wKgfM => 5 * (wKgfM / 100) * span ** 4 / (384 * EI);
    const point = loadTf => loadTf * 1000 * span ** 3 / (48 * EI);
    const track = Math.min(4.35, L) * 100;
    const trackDeflection = track >= span
      ? full(Wc * 1000)
      : (Wc * 10 * track) * (8 * span ** 3 - 4 * track ** 2 * span + track ** 3) / (384 * EI);
    const d1 = full(weight) + point(P_HS);
    const d2 = full(weight) + trackDeflection;
    const d3 = full(craneWeight) + point(Pcrane);
    return { d1, d2, d3, dmax:Math.max(d1, d2, d3), deflectionControl:controlCode([d1, d2, d3]) };
  };
  const classification = (section, Fy, fa, Lt) => {
    const flangeRatio = section.B / (2 * section.tf);
    const compactLimit = 545 / Math.sqrt(Fy);
    const noncompactLimit = 800 / Math.sqrt(Fy);
    const flangeCode = flangeRatio < compactLimit ? 1 : (flangeRatio < noncompactLimit ? 2 : 3);
    const webLimit = 5370 / Math.sqrt(Fy) * Math.max(0, 1 - 3.74 * fa / Fy);
    const webCode = section.H / section.tw < webLimit ? 1 : 2;
    const L1 = 640 * section.B / Math.sqrt(Fy);
    const L2 = 1.4e6 * (section.B * section.tf) / (section.H * Fy);
    const Lc = Math.min(L1, L2);
    const Lu = Math.max(L1, L2);
    const braceCode = Lt <= Lc ? 10 : (Lt <= Lu ? 20 : 30);
    let basicFb;
    if (braceCode === 10 && flangeCode === 1) basicFb = 0.66 * Fy;
    else if (braceCode === 10 && flangeCode === 2) basicFb = Math.min(0.66 * Fy, Fy * (1.07 - 0.005 * flangeRatio * Math.sqrt(Fy)));
    else basicFb = 0.6 * Fy;
    return { flangeCode, webCode, braceCode, FbBasic:basicFb };
  };
  const memberResult = ({ item, global, kind }) => {
    const section = item.section;
    const Sx = kind === 'deck' ? item.Sx * item.n : section.Sx * item.n;
    const Ix = kind === 'deck' ? item.Ix * item.n : section.Ix * item.n;
    const Aw = kind === 'deck' ? item.Aw * item.n : section.H * section.tw * item.n;
    const Wb = kind === 'deck' ? 0 : section.Wb * item.n;
    const surfaceWeight = global.Wp * item.B;
    const liveWeight = global.Wl * item.B;
    const P_HS = 7.3 * (1 + global.imp);
    const Wc = 8.244 * (1 + global.imp);
    let WT = (surfaceWeight + liveWeight + Wb + (kind === 'girder' ? item.W2 : 0)) / 1000;
    let WT2 = WT;
    if (kind === 'girder') WT2 = (surfaceWeight + Wb + item.W2) / 1000;
    let loads;
    if (kind === 'deck') {
      const M1 = WT * item.L ** 2 / 8 + P_HS * item.L / 4;
      const M2 = WT * item.L ** 2 / 8 + Wc * item.L ** 2 / 8;
      const M3 = WT * item.L ** 2 / 8 + item.Pcrane * item.L / 4;
      const V1 = WT * item.L / 2 + P_HS;
      const V2 = WT * item.L / 2 + Wc * item.L / 2;
      const V3 = WT * item.L / 2 + item.Pcrane;
      loads = { M1, M2, M3, Mmax:Math.max(M1, M2, M3), V1, V2, V3, Vmax:Math.max(V1, V2, V3), control:controlCode([M1, M2, M3]) };
    } else {
      loads = loadCombination({ WT, WT2, L:item.L, P_HS, Pcrane:item.Pcrane, Wc, craneUsesWT2:kind === 'girder' });
    }
    const classificationResult = kind === 'deck' ? null : classification(section, global.Fy, item.fa, item.Lt);
    const Fb = kind === 'deck' ? 0.6 * global.Fy * global.beta : classificationResult.FbBasic * global.beta;
    const Fv = 0.4 * global.Fy * global.beta;
    const fb = loads.Mmax * 1e5 / Sx;
    const fv = loads.Vmax * 1e3 / Aw;
    const weight = surfaceWeight + liveWeight + Wb + (kind === 'girder' ? item.W2 : 0);
    const craneWeight = kind === 'girder' ? surfaceWeight + Wb + item.W2 : weight;
    const deflection = deflections({ weight, craneWeight, P_HS, Pcrane:item.Pcrane, Wc, L:item.L, E:global.E, I:Ix });
    const defAllow = item.L * 100 / global.defl;
    return {
      WT, P_HS, Wc, ...loads, Fb, fb, Fv, fv, ...deflection, defAllow,
      flexurePass:fb < Fb ? 1 : 0, shearPass:fv < Fv ? 1 : 0,
      deflectionPass:deflection.dmax < defAllow ? 1 : 0,
      ...(classificationResult || {}),
      ...(kind === 'girder' ? { WT2 } : {}),
    };
  };
  const calculateCase = item => {
    const deck = memberResult({ item:item.deck, global:item.global, kind:'deck' });
    const stringer = memberResult({ item:item.stringer, global:item.global, kind:'stringer' });
    const girder = memberResult({ item:item.girder, global:item.global, kind:'girder' });
    girder.Pu1 = girder.Vmax;
    girder.Pu2 = 0.5 * girder.WT2 * item.girder.L + item.girder.Pcrane * (item.girder.L - 0.5) / item.girder.L;
    girder.Pu3 = 0.5 * girder.WT2 * item.girder.L + item.girder.Pcrane * 2 * Math.max(0, item.girder.L - 4) / item.girder.L;
    girder.PuMax = Math.max(girder.Pu1, girder.Pu2, girder.Pu3);

    const section = item.column.section;
    const fa = item.column.N * 1000 / section.A;
    const Mx = item.column.N * item.column.ex / 100;
    const My = item.column.N * item.column.ey / 100;
    const fbx = Mx * 1e5 / section.Sx;
    const fby = My * 1e5 / section.Sy;
    const KLrx = item.column.K * item.column.L / section.rx;
    const KLry = item.column.K * item.column.L / section.ry;
    const KLr = Math.max(KLrx, KLry);
    const Cc = Math.sqrt(2 * Math.PI ** 2 * item.global.E / item.global.Fy);
    const Fa = KLr < Cc
      ? (1 - (KLr / Cc) ** 2 / 2) * item.global.Fy / (5 / 3 + 3 * (KLr / Cc) / 8 - (KLr / Cc) ** 3 / 8)
      : 12 * Math.PI ** 2 * item.global.E / (23 * KLr ** 2);
    const Fa1 = Fa * item.global.beta * item.column.old;
    const Fbx = 0.66 * item.global.Fy * item.global.beta * item.column.old;
    const Fby = 0.75 * item.global.Fy * item.global.beta * item.column.old;
    const Fex = 12 * Math.PI ** 2 * item.global.E / (23 * KLrx ** 2);
    const Fey = 12 * Math.PI ** 2 * item.global.E / (23 * KLry ** 2);
    const ratio = fa / Fa1;
    const chk1 = ratio > 0.15
      ? ratio + fbx / ((1 - fa / Fex) * Fbx) + fby / ((1 - fa / Fey) * Fby)
      : ratio + fbx / Fbx + fby / Fby;
    const chk2 = ratio > 0.15 ? fa / (0.6 * item.global.Fy * item.column.old) + fbx / Fbx + fby / Fby : chk1;
    const worst = Math.max(chk1, chk2);
    const column = { fa, Mx, My, fbx, fby, KLrx, KLry, Cc, Fa, Fa1, Fbx, Fby, chk1, chk2, worst, pass:worst <= 1 ? 1 : 0 };

    const bondSection = item.column.section;
    const ls = 2 * (bondSection.B + bondSection.H);
    const tau = 0.03 * item.bond.fc;
    const F = tau * item.bond.L * ls / 1000;
    const Nc = (tau * item.bond.L * ls + 0.35 * item.bond.fc * bondSection.A) / 1000;
    const tensionPass = F > item.bond.T ? 1 : 0;
    const compressionPass = Nc > item.bond.P ? 1 : 0;
    const bond = { ls, tau, F, Nc, tensionPass, compressionPass, pass:tensionPass && compressionPass ? 1 : 0 };

    const Ab = Math.PI * item.pile.D ** 2 / 4;
    const qb = 7.5 * item.pile.Nb;
    const fs = item.pile.Ns / 3;
    const Qb = qb * Ab / 10000;
    const Qs = fs * (Math.PI * item.pile.D / 100) * (item.pile.Lb / 100);
    const Qa = Qb / item.pile.FSb + Qs / item.pile.FSs;
    const pile = { Ab, qb, fs, Qb, Qs, Qa, pass:Qa > item.pile.P ? 1 : 0 };
    return { deck, stringer, girder, column, bond, pile };
  };
  return Object.fromEntries(input.cases.map(item => [item.id, calculateCase(item)]));
}

function stoneFixingOracle(input) {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pass = (value, limit) => value <= limit ? 1 : 0;
  const missing = () => ({ value: 0, limit: 0, pass: 0 });
  const anchorCatalog = {
    'SH-440': { hole: 17.5, embed: 50.8, Nu: { 210: 2800, 280: 3700 }, Vu: { 210: 3000, 280: 3000 } },
    'SH-550': { hole: 22.2, embed: 63.5, Nu: { 210: 3850, 280: 5200 }, Vu: { 210: 4600, 280: 5100 } },
    'SH-560': { hole: 22.2, embed: 63.5, Nu: { 210: 3850, 280: 5200 }, Vu: { 210: 4600, 280: 5100 } },
    'SH-660': { hole: 26, embed: 76.2, Nu: { 210: 5700, 280: 5700 }, Vu: { 210: 7200, 280: 7200 } },
  };

  function calculateCase(item) {
    const cd = item.caseData;
    const i = item.global;
    const isPin = String(cd.type).startsWith('pk_');
    const totalPoints = cd.N;
    const effectivePoints = isPin ? Math.max(1, totalPoints / 2) : totalPoints;
    const area = cd.w * cd.h / 1e6;
    const weightPerArea = i.st_gam * i.st_t / 1000;
    const gravity = area * weightPerArea;
    const ipEffective = i.sp_ip15_on ? Math.max(i.s_ip_raw, i.sp_ip_default || 1.5) : i.s_ip_raw;
    const lowerSeismicPressure = 0.3 * i.s_sds * ipEffective * weightPerArea;
    const upperSeismicPressure = 1.6 * i.s_sds * ipEffective * weightPerArea;
    const detailedSeismicPressure = 0.4 * i.sp_seis_ap * i.s_sds * ipEffective
      * (1 + 2 * i.sp_seis_zh_ratio) * weightPerArea / i.sp_seis_rp;
    const seismicPressure = i.sp_seismic_detail_on
      ? Math.min(upperSeismicPressure, Math.max(lowerSeismicPressure, detailedSeismicPressure))
      : upperSeismicPressure;
    const seismicForce = seismicPressure * area;
    const verticalSeismic = i.sp_pev_conservative_on
      ? 0.5 * seismicForce
      : 0.2 * i.s_sds * gravity;
    let rawWindPos = i.w_pos;
    let rawWindNeg = i.w_neg;
    if (i.w_src === 'manual' && i.w_manual_mode === 'coeff') {
      rawWindPos = Math.abs(i.w_qref * (i.w_cpe_pos + i.w_gcpi));
      rawWindNeg = Math.abs(i.w_qref * (i.w_cpe_neg - i.w_gcpi));
    }
    const windPressurePos = rawWindPos * i.w_cf;
    const windPressureNeg = rawWindNeg * i.w_cf;
    const windForcePos = area * windPressurePos;
    const windForceNeg = area * windPressureNeg;
    const windEnvelope = Math.max(windForcePos, windForceNeg);
    const horizontalPull = i.sp_wind_dir_on ? Math.max(seismicForce, windForceNeg) : Math.max(seismicForce, windEnvelope);
    const horizontalPush = i.sp_wind_dir_on ? Math.max(seismicForce, windForcePos) : horizontalPull;
    const eqControlsPull = seismicForce >= (i.sp_wind_dir_on ? windForceNeg : windEnvelope);
    const eqControlsPush = seismicForce >= windForcePos;
    const verticalDemand = Math.max(
      eqControlsPull ? gravity + verticalSeismic : gravity,
      eqControlsPush ? gravity + verticalSeismic : gravity
    );
    const tensionPerPoint = horizontalPull / effectivePoints;
    const bendingPerPoint = Math.max(horizontalPull, horizontalPush) / effectivePoints;
    const shearPerPoint = verticalDemand / effectivePoints;

    const catalog = anchorCatalog[i.m_anc_type];
    const ultimateTension = catalog?.Nu?.[i.m_anc_fc] || i.m_anc_ta * i.m_anc_sf;
    const ultimateShear = catalog?.Vu?.[i.m_anc_fc] || ultimateTension;
    const vendorTa = i.m_anc_ta || ultimateTension / i.m_anc_sf;
    const vendorVa = ultimateShear / i.m_anc_sf;
    let psiCn = 1;
    let psiCv = 1;
    if (i.sp_psicv_on) {
      if (i.sp_concrete_crack === 'noncracked') {
        psiCn = Number(i.sp_anchor_aci_category || 1) === 1 ? 1.25 : 1;
        psiCv = 1.4;
      } else {
        psiCn = 1;
        psiCv = { none: 1, edge_rebar: 1.2, full_rebar: 1.4 }[i.sp_rebar_support || 'none'];
      }
    }
    const appendixTa = ultimateTension * i.sp_anchor_phi * psiCn / i.sp_anchor_service_factor;
    const appendixVa = ultimateShear * i.sp_anchor_phi * psiCv / i.sp_anchor_service_factor;
    const anchorMode = i.sp_anchor_on ? i.sp_anchor_design_mode : 'vendor_sf';
    const baseTa = anchorMode === 'appendix_d' ? appendixTa
      : anchorMode === 'dual_compare' ? Math.min(vendorTa, appendixTa) : vendorTa;
    const baseVa = anchorMode === 'appendix_d' ? appendixVa
      : anchorMode === 'dual_compare' ? Math.min(vendorVa, appendixVa) : vendorVa;
    const embed = catalog?.embed || i.sp_custom_anchor_embed_mm || 0;
    let tensionFactor = 1;
    let shearFactor = 1;
    if (i.sp_anchor_group_on && embed > 0) {
      const groupRatio = cd.N > 1 && cd.anchor_spacing_mm > 0
        ? clamp((3 * embed + cd.anchor_spacing_mm) / (6 * embed), 0.5, 1)
        : 1;
      const edgeFactor = cd.anchor_edge_mm >= 1.5 * embed
        ? 1
        : clamp(0.7 + 0.3 * cd.anchor_edge_mm / (1.5 * embed), 0.7, 1);
      tensionFactor = clamp(groupRatio * edgeFactor, 0.35, 1);
      shearFactor = tensionFactor;
    }
    const effectiveTa = baseTa * tensionFactor;
    const effectiveVa = baseVa * shearFactor;

    let spanX = Math.max(50, cd.w - 2 * cd.fx);
    let spanY = Math.max(50, cd.h - cd.fy1 - cd.fy2);
    if (/^pk_.*h$/.test(cd.type)) spanY = Math.max(50, cd.h);
    if (/^pk_.*v$/.test(cd.type)) spanX = Math.max(50, cd.w);
    const q = Math.max(windPressureNeg, windPressurePos, seismicPressure);
    const qStrip = q / 10000;
    const shortMm = Math.min(spanX, spanY);
    const longMm = Math.max(spanX, spanY);
    let momentShort = 0;
    let momentLong = 0;
    let moment;
    if (cd.panel_mode === 'two_way_rankine') {
      const shareShort = longMm ** 4 / (shortMm ** 4 + longMm ** 4);
      const shareLong = 1 - shareShort;
      momentShort = qStrip * shareShort * (shortMm / 10) ** 2 / 8;
      momentLong = qStrip * shareLong * (longMm / 10) ** 2 / 8;
      moment = Math.max(momentShort, momentLong);
    } else {
      const span = cd.panel_mode === 'one_way_long' ? longMm : shortMm;
      moment = qStrip * (span / 10) ** 2 / 8;
    }
    const panelSectionModulus = (i.st_t / 10) ** 2 / 6;
    const bendingStress = moment / panelSectionModulus;
    const holeDiameterCm = (cd.hole_diameter_mm || cd.d0 * 10) / 10;
    const netThicknessCm = Math.max(0, (i.st_t - cd.hole_depth_mm) / 10);
    const localMode = (i.sp_panel_local_mode || 'auto') === 'auto' ? (isPin ? 'ring' : 'cone') : i.sp_panel_local_mode;
    let localArea = Math.PI * holeDiameterCm * Math.max(netThicknessCm, 0.1);
    if (localMode === 'cone' && !isPin) {
      const outer = holeDiameterCm + 2 * Math.max(netThicknessCm, 0.1) * Math.tan(i.sp_panel_cone_angle * Math.PI / 180);
      localArea = Math.PI * (outer ** 2 - holeDiameterCm ** 2) / 4;
    }
    localArea = Math.max(0.01, localArea);
    const localStress = tensionPerPoint / localArea;
    const panelPass = bendingStress <= i.sp_stone_fb && netThicknessCm > 0 && localStress <= i.sp_stone_ft ? 1 : 0;

    const driftEnabled = Boolean(i.sp_drift_on);
    const driftDisplacement = driftEnabled
      ? i.sp_drift_theta * (cd.drift_span_mode === 'multi_story' ? i.sp_story_height_mm : Math.min(cd.h, i.sp_story_height_mm))
      : 0;
    const driftRotation = driftEnabled ? i.sp_drift_theta * 180 / Math.PI : 0;
    const driftPass = !driftEnabled || (driftDisplacement <= cd.movement_allow_mm && driftRotation <= cd.rotation_allow_deg) ? 1 : 0;
    const thermalEnabled = Boolean(i.sp_thermal_on);
    const deltaWidth = thermalEnabled ? i.sp_thermal_alpha * i.sp_thermal_delta_t * cd.w : 0;
    const deltaHeight = thermalEnabled ? i.sp_thermal_alpha * i.sp_thermal_delta_t * cd.h : 0;
    const requiredJoint = thermalEnabled ? Math.max(deltaWidth, deltaHeight) + i.sp_thermal_reserve_mm : 0;
    const thermalPass = !thermalEnabled || cd.joint_width_mm >= requiredJoint ? 1 : 0;

    const Tu1 = shearPerPoint * cd.bh / cd.d1;
    const Tu2 = tensionPerPoint * cd.bh / cd.d1;
    const Tu = Math.max(Tu1, Tu2);
    const interactionSeparated = i.sp_interaction_mode === 'separated' && Tu2 < Tu1;
    const interaction = interactionSeparated
      ? (Tu1 / effectiveTa) ** (5 / 3)
      : (Math.max(Tu1, Tu2) / effectiveTa) ** (5 / 3) + (shearPerPoint / effectiveVa) ** (5 / 3);
    const allowStressFactor = i.sp_allow_stress_static_on ? 1 : i.w_cf;
    const angleShearLimit = 0.4 * i.m_fy * Math.max(0.01, (cd.LL - cd.d0) * cd.Lt);
    const angleMoment = Math.max(shearPerPoint * cd.bh, bendingPerPoint * cd.d1);
    const angleBendingDemand = angleMoment / (0.6 * i.m_fy * allowStressFactor);
    const angleBendingLimit = cd.LL * cd.Lt ** 2 / 6;
    const screw = isPin ? missing() : { value: tensionPerPoint, limit: i.m_screw_ta, pass: pass(tensionPerPoint, i.m_screw_ta) };
    const anchorVertical = { value: Tu1, limit: effectiveTa, pass: pass(Tu1, effectiveTa) };
    const anchorHorizontal = { value: Tu2, limit: effectiveTa, pass: pass(Tu2, effectiveTa) };
    const anchorShear = { value: shearPerPoint, limit: effectiveVa, pass: pass(shearPerPoint, effectiveVa) };
    const anchorInteraction = { value: interaction, limit: 1, pass: pass(interaction, 1) };
    const carriageShear = cd.hasMC
      ? { value: tensionPerPoint, limit: i.m_mc_va, pass: pass(tensionPerPoint, i.m_mc_va) } : missing();
    const carriageTensionValue = shearPerPoint * 3.4 / 3.6;
    const carriageTension = cd.hasMC
      ? { value: carriageTensionValue, limit: i.m_mc_ta, pass: pass(carriageTensionValue, i.m_mc_ta) } : missing();
    const pin = isPin ? { value: Tu, limit: i.m_pin_va, pass: pass(Tu, i.m_pin_va) } : missing();
    const angleShear = { value: shearPerPoint, limit: angleShearLimit, pass: pass(shearPerPoint, angleShearLimit) };
    const angleBending = { value: angleBendingDemand, limit: angleBendingLimit, pass: pass(angleBendingDemand, angleBendingLimit) };
    const requiredPasses = [anchorVertical, anchorHorizontal, anchorShear, anchorInteraction, angleShear, angleBending];
    if (!isPin) requiredPasses.push(screw);
    if (isPin) requiredPasses.push(pin);
    if (cd.hasMC) requiredPasses.push(carriageShear, carriageTension);
    const allPass = requiredPasses.every(check => check.pass) && panelPass && driftPass && thermalPass ? 1 : 0;

    return {
      area, weightPerArea, gravity, ipEffective, seismicPressure, seismicForce, verticalSeismic,
      windPressurePos, windPressureNeg, windForcePos, windForceNeg, horizontalPull, horizontalPush,
      verticalDemand, tensionPerPoint, bendingPerPoint, shearPerPoint, totalPoints, effectivePoints,
      anchor: { vendorTa, vendorVa, appendixTa, appendixVa, baseTa, baseVa, effectiveTa, effectiveVa, psiCn, psiCv, tensionFactor, shearFactor },
      panel: { spanX, spanY, q, moment, momentShort, momentLong, sectionModulus: panelSectionModulus, bendingStress, localArea, localStress, pass: panelPass },
      drift: { displacement: driftDisplacement, rotation: driftRotation, pass: driftPass },
      thermal: { deltaWidth, deltaHeight, requiredJoint, pass: thermalPass },
      checks: { screw, anchorVertical, anchorHorizontal, anchorShear, anchorInteraction, carriageShear, carriageTension, pin, angleShear, angleBending },
      allPass,
    };
  }

  return Object.fromEntries(input.cases.map(item => [item.id, calculateCase(item)]));
}

function srcBeamCandidateOracle(input) {
  function calculateCase(i) {
    const concrete = i.concrete;
    const reinforcement = i.reinforcement;
    const steel = i.steel;
    const demands = i.demands;
    const b = Number(concrete.bCm);
    const fc = Number(concrete.fcKgfCm2);
    const d = Number(concrete.flexureDepthCm);
    const dPrime = Number(concrete.compressionSteelDepthCm);
    const dShear = Number(concrete.shearDepthCm);
    const asTension = Number(reinforcement.asTensionCm2);
    const asCompression = Number(reinforcement.asCompressionCm2);
    const fyTension = Number(reinforcement.fyrTensionKgfCm2);
    const fyCompression = Number(reinforcement.fyrCompressionKgfCm2);
    const es = Number(reinforcement.esKgfCm2 || 2100000);
    const beta1 = fc <= 280 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * ((fc - 280) / 70));
    const concreteSlopeTfPerCm = 0.85 * fc * b * beta1 / 1000;
    const tensionForceTf = asTension * fyTension / 1000;
    let neutralAxisCm;
    let compressionSteelStress = 0;
    let compressionSteelForceTf = 0;
    if (asCompression > 0) {
      const compressionElasticTf = asCompression * es * 0.003 / 1000;
      const linearCoefficient = compressionElasticTf - tensionForceTf;
      const discriminant = linearCoefficient ** 2 + 4 * concreteSlopeTfPerCm * compressionElasticTf * dPrime;
      neutralAxisCm = (-linearCoefficient + Math.sqrt(discriminant)) / (2 * concreteSlopeTfPerCm);
      compressionSteelStress = es * 0.003 * (neutralAxisCm - dPrime) / neutralAxisCm;
      if (Math.abs(compressionSteelStress) >= fyCompression) throw new Error(`src-candidate-compression-steel-yield-outside-closed-form:${i.id}`);
      compressionSteelForceTf = asCompression * compressionSteelStress / 1000;
    } else {
      neutralAxisCm = tensionForceTf / concreteSlopeTfPerCm;
    }
    const tensionElasticStress = Math.abs(es * 0.003 * (neutralAxisCm - d) / neutralAxisCm);
    if (tensionElasticStress < fyTension) throw new Error(`src-candidate-tension-steel-not-yielded:${i.id}`);
    const stressBlockDepthCm = beta1 * neutralAxisCm;
    const concreteForceTf = 0.85 * fc * b * stressBlockDepthCm / 1000;
    const mnRcTfM = (
      concreteForceTf * (d - stressBlockDepthCm / 2)
      + compressionSteelForceTf * (d - dPrime)
    ) / 100;
    const mnSteelTfM = Number(steel.zCm3) * Number(steel.fysKgfCm2) / 100000;
    const nominalMomentTfM = mnSteelTfM + mnRcTfM;
    const designMomentTfM = 0.9 * mnSteelTfM + 0.9 * mnRcTfM;
    const flexuralUtilization = Math.abs(Number(demands.muTfM)) / designMomentTfM;

    const grade = String(steel.grade || '').toUpperCase();
    const grade400 = ['SS400', 'SM400', 'SN400', 'A36', '400'].includes(grade);
    if (!grade400 && !['SS490', 'SM490', 'SN490', 'A572GR50', 'A572 GR.50', '490'].includes(grade)) {
      throw new Error(`src-candidate-unsupported-grade:${i.id}`);
    }
    const flangeRatio = (Number(steel.flangeWidthCm) / 2) / Number(steel.flangeThicknessCm);
    const flangeLimit = grade400 ? 23 : 20;
    const webRatio = (Number(steel.depthCm) - 2 * Number(steel.flangeThicknessCm)) / Number(steel.webThicknessCm);
    const webLimit = grade400 ? 107 : 91;

    const av = Number(reinforcement.avCm2);
    const avf = Number(reinforcement.avfCm2 || reinforcement.avCm2);
    const fyh = Number(reinforcement.fyhKgfCm2);
    const spacing = Number(reinforcement.spacingCm);
    const mu = Number(i.shearFriction?.mu ?? 0.8);
    const k1 = Number(i.shearFriction?.k1KgfCm2 ?? 28);
    const studContributionTf = Number(i.shearFriction?.studContributionTf || 0);
    const vnSteelTf = 0.6 * Number(steel.fywKgfCm2) * Number(steel.webThicknessCm) * Number(steel.depthCm) / 1000;
    const stirrupRawTf = av * fyh * dShear / spacing / 1000;
    const stirrupCapTf = 2.12 * Math.sqrt(fc) * b * dShear / 1000;
    const vnrTf = Math.min(stirrupRawTf, stirrupCapTf);
    const vncTf = 0.53 * Math.sqrt(fc) * b * dShear / 1000;
    const vnRcGeneralTf = vnrTf + vncTf;
    const frictionStirrupRawTf = mu * avf * fyh * dShear / spacing / 1000;
    const frictionStirrupCapTf = 2.12 * mu * Math.sqrt(fc) * b * dShear / 1000;
    const vnrFrictionTf = Math.min(frictionStirrupRawTf, frictionStirrupCapTf);
    const netConcreteWidthCm = b - Number(steel.flangeWidthCm);
    const vncFrictionTf = k1 * netConcreteWidthCm * dShear / 1000;
    const vnRcFrictionTf = vnrFrictionTf + vncFrictionTf + studContributionTf;
    const vnRcTf = Math.min(vnRcGeneralTf, vnRcFrictionTf);
    const vu = Math.abs(Number(demands.vuTf));
    const steelDemandShare = mnSteelTfM / nominalMomentTfM;
    const rcDemandShare = mnRcTfM / nominalMomentTfM;
    const steelUtilization = steelDemandShare * vu / (0.9 * vnSteelTf);
    const rcUtilization = rcDemandShare * vu / (0.75 * vnRcTf);
    const flangeCompactnessPass = flangeRatio <= flangeLimit ? 1 : 0;
    const webCompactnessPass = webRatio <= webLimit ? 1 : 0;
    const flexurePass = flexuralUtilization <= 1 ? 1 : 0;
    const steelShearSharePass = steelUtilization <= 1 ? 1 : 0;
    const rcShearSharePass = rcUtilization <= 1 ? 1 : 0;
    const overallOk = [flangeCompactnessPass, webCompactnessPass, flexurePass, steelShearSharePass, rcShearSharePass].every(Boolean) ? 1 : 0;
    return {
      neutralAxisCm,
      stressBlockDepthCm,
      compressionSteelStress,
      mnRcTfM,
      mnSteelTfM,
      nominalMomentTfM,
      designMomentTfM,
      flexuralUtilization,
      flangeRatio,
      flangeLimit,
      webRatio,
      webLimit,
      vnSteelTf,
      stirrupRawTf,
      stirrupCapTf,
      vnrTf,
      vncTf,
      vnRcGeneralTf,
      frictionStirrupRawTf,
      frictionStirrupCapTf,
      vnrFrictionTf,
      netConcreteWidthCm,
      vncFrictionTf,
      vnRcFrictionTf,
      vnRcTf,
      steelDemandShare,
      rcDemandShare,
      steelUtilization,
      rcUtilization,
      governingUtilization: Math.max(flexuralUtilization, steelUtilization, rcUtilization),
      flangeCompactnessPass,
      webCompactnessPass,
      flexurePass,
      steelShearSharePass,
      rcShearSharePass,
      overallOk,
    };
  }

  return Object.fromEntries(input.cases.map(item => [item.id, calculateCase(item)]));
}

function srcColumnFormalOracle(input) {
  const phiSteelCompression = 0.85;
  const phiSteelFlexure = 0.9;

  function calculateCase(item) {
    const source = item.input;
    const section = item.referenceSection;
    const concrete = source.concrete;
    const steel = source.steel;
    const member = source.member;
    const demands = source.demands;
    const width = Number(concrete.widthCm);
    const depth = Number(concrete.depthCm);
    const grossArea = width * depth;
    const grossIx = width * Math.pow(depth, 3) / 12;
    const grossIy = depth * Math.pow(width, 3) / 12;
    const es = Number(steel.esKgfCm2);
    const ec = 15000 * Math.sqrt(Number(concrete.fcKgfCm2));
    const axialSteelRatio = es * section.areaCm2 / (es * section.areaCm2 + 0.55 * ec * grossArea);
    const momentSteelRatioX = es * section.ixCm4 / (es * section.ixCm4 + 0.35 * ec * grossIx);
    const momentSteelRatioY = es * section.iyCm4 / (es * section.iyCm4 + 0.35 * ec * grossIy);
    const initialSteel = {
      puTf: Number(demands.puTf) * axialSteelRatio,
      muxTfM: Math.abs(Number(demands.muxTfM)) * momentSteelRatioX,
      muyTfM: Math.abs(Number(demands.muyTfM || 0)) * momentSteelRatioY,
    };
    const nominalMomentX = section.zxCm3 * Number(steel.fysKgfCm2) / 100000;
    const nominalMomentY = section.zyCm3 * Number(steel.fysKgfCm2) / 100000;

    function compressionAxis(axis) {
      const inertia = axis === 'x' ? section.ixCm4 : section.iyCm4;
      const grossInertia = axis === 'x' ? grossIx : grossIy;
      const alpha = axis === 'x' ? 0.2 : 0.4;
      const effectiveRadius = Math.sqrt(inertia / section.areaCm2) + alpha * Math.sqrt(grossInertia / grossArea);
      const k = Number(axis === 'x' ? member.kx : member.ky);
      const lambda = k * Number(member.lengthCm) / (Math.PI * effectiveRadius)
        * Math.sqrt(Number(steel.fysKgfCm2) / es);
      const strengthFactor = lambda <= 1.5 ? Math.exp(-0.419 * lambda * lambda) : 0.877 / (lambda * lambda);
      return {
        effectiveRadius,
        lambda,
        nominalTf: strengthFactor * Number(steel.fysKgfCm2) * section.areaCm2 / 1000,
      };
    }

    const compressionX = compressionAxis('x');
    const compressionY = compressionAxis('y');
    const controllingCompression = Math.min(compressionX.nominalTf, compressionY.nominalTf);
    function interaction(demand) {
      const axialRatio = demand.puTf / (phiSteelCompression * controllingCompression);
      const momentRatio = demand.muxTfM / (phiSteelFlexure * nominalMomentX)
        + (demand.muyTfM ? demand.muyTfM / (phiSteelFlexure * nominalMomentY) : 0);
      return axialRatio < 0.2 ? axialRatio / 2 + momentRatio : axialRatio + (8 / 9) * momentRatio;
    }
    const beta = interaction(initialSteel);
    const finalSteel = source.detailing.redistributeToSteelBoundary
      ? Object.fromEntries(Object.entries(initialSteel).map(([key, value]) => [key, value / beta]))
      : initialSteel;
    const finalRc = {
      puTf: Number(demands.puTf) - finalSteel.puTf,
      muxTfM: Math.abs(Number(demands.muxTfM)) - finalSteel.muxTfM,
    };
    const fysTfCm2 = Number(steel.fysKgfCm2) / 1000;
    const flangeRatio = (section.flangeWidthCm / 2) / section.flangeThicknessCm;
    const webRatio = (section.depthCm - 2 * section.flangeThicknessCm) / section.webThicknessCm;
    const grade400 = section.gradeGroup === '400';
    return {
      grossAreaCm2: grossArea,
      grossIxCm4: grossIx,
      grossIyCm4: grossIy,
      ecKgfCm2: ec,
      sectionAreaCm2: section.areaCm2,
      sectionIxCm4: section.ixCm4,
      sectionIyCm4: section.iyCm4,
      sectionZxCm3: section.zxCm3,
      sectionZyCm3: section.zyCm3,
      printedPage: section.printedPage,
      pdfPage: section.pdfPage,
      flangeRatio,
      webRatio,
      flangeGeneralLimit: grade400 ? 23 : 20,
      webGeneralLimit: grade400 ? 96 : 81,
      flangeSeismicLimit: 21 / Math.sqrt(fysTfCm2),
      webSeismicLimit: 123 / Math.sqrt(fysTfCm2),
      axialSteelRatio,
      momentSteelRatioX,
      momentSteelRatioY,
      initialSteelPuTf: initialSteel.puTf,
      initialSteelMuxTfM: initialSteel.muxTfM,
      compressionXEffectiveRadiusCm: compressionX.effectiveRadius,
      compressionYEffectiveRadiusCm: compressionY.effectiveRadius,
      compressionXLambdaC: compressionX.lambda,
      compressionYLambdaC: compressionY.lambda,
      compressionXNominalTf: compressionX.nominalTf,
      compressionYNominalTf: compressionY.nominalTf,
      nominalMomentXTfM: nominalMomentX,
      nominalMomentYTfM: nominalMomentY,
      initialSteelInteraction: beta,
      finalSteelInteraction: interaction(finalSteel),
      redistributionApplied: source.detailing.redistributeToSteelBoundary ? 1 : 0,
      finalRcPuTf: finalRc.puTf,
      finalRcMuxTfM: finalRc.muxTfM,
      compactnessPass: flangeRatio <= (grade400 ? 23 : 20) && webRatio <= (grade400 ? 96 : 81) ? 1 : 0,
      steelInteractionPass: interaction(finalSteel) <= 1 + 1e-9 ? 1 : 0,
      formalReleaseEligible: 1,
    };
  }

  return Object.fromEntries(input.cases.map(item => [item.id, calculateCase(item)]));
}

const ORACLES = {
  'equipment-basic-load-path': equipmentOracle,
  'earth-rankine-dry-active': earthOracle,
  'foundation-external-load-only': foundationOracle,
  'rc-column-balanced-nearby-pm-point': rcColumnPmOracle,
  'rc-beam-seismic-strength': rcBeamStrengthOracle,
  'rc-deep-beam-stm-strength': rcDeepBeamStmOracle,
  'rc-foundation-2d-stm-strength': rcFoundation2dStmOracle,
  'rc-pile-cap-3d-stm-strength': rcPileCap3dStmOracle,
  'rc-shear-wall-seismic-strength': rcShearWallStrengthOracle,
  'rc-wall-general-strength': rcWallStrengthOracle,
  'rc-retrofit-section-strength': rcRetrofitSectionOracle,
  'rc-foundation-isolated-strength': rcFoundationOracle,
  'rc-pile-clay-group-cap': rcPileOracle,
  'steel-beam-asd-inelastic-ltb': steelBeamAsdOracle,
  'steel-column-asd-weak-axis-interaction': steelColumnAsdOracle,
  'steel-plate-connection-strength': steelPlateConnectionOracle,
  'steel-formal-strength': steelFormalOracle,
  'decking-system-load-path': deckingSystemOracle,
  'stone-fixing-load-path': stoneFixingOracle,
  'rc-slab-one-way-strength': rcSlabStrengthOracle,
  'wind-force-rigid-three-story-mwfrs': windForceMwfrsOracle,
  'wind-object-solid-table-2-10': windObjectSolidTable210Oracle,
  'wind-object-frame-three-table-routes': windObjectFrameThreeRouteOracle,
  'wind-lattice-tower-four-table-branches': windLatticeTowerFourBranchOracle,
  'wind-object-tower-table-2-12': windObjectTowerTable212Oracle,
  'wind-fence-sign-table-2-10': windFenceSignTable210Oracle,
  'wind-sign-pole-composite-tables': windSignPoleCompositeOracle,
  'wind-cc-three-control-branches': windCcThreeBranchOracle,
  'wind-parapet-three-design-routes': windParapetThreeRouteOracle,
  'wind-open-roof-four-combinations': windOpenRoofFourCombinationOracle,
  'seismic-force-eight-story-static': seismicForceStaticOracle,
  'seismic-appendage-three-control-branches': seismicAppendageOracle,
  'seismic-misc-three-formula-paths': seismicMiscOracle,
  'anchor-cast-in-m20-chapter-17': anchorCastInOracle,
  'src-beam-candidate-strength': srcBeamCandidateOracle,
  'src-column-formal-member-strength': srcColumnFormalOracle
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
  if (catalog?.schemaVersion !== 3) issues.push('catalog:schema-version');
  if (catalog?.kind !== 'independent-engineering-benchmarks.v3') issues.push('catalog:kind');
  exactKeys(catalog?.portfolio, PORTFOLIO_KEYS, 'portfolio', issues);
  if (catalog?.portfolio?.eligibleState !== 'formal') issues.push('portfolio:eligible-state');
  if (!Number.isInteger(catalog?.portfolio?.eligibleFormalRoutes) || catalog.portfolio.eligibleFormalRoutes < 1) issues.push('portfolio:eligible-formal-routes');
  if (!String(catalog?.portfolio?.scopeNote || '').includes('golden case')) issues.push('portfolio:scope-note-distinction');
  if (!Array.isArray(catalog?.benchmarks) || catalog.benchmarks.length < 1) issues.push('benchmarks:required');
  if (!Array.isArray(catalog?.candidateBenchmarks)) issues.push('candidate-benchmarks:array-required');
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

  for (const [index, benchmark] of (catalog?.candidateBenchmarks || []).entries()) {
    const label = `candidateBenchmark[${index}]`;
    exactKeys(benchmark, CANDIDATE_KEYS, label, issues);
    if (!benchmark.id || ids.has(benchmark.id)) issues.push(`${label}:unique-id`);
    ids.add(benchmark.id);
    if (!/^[a-z0-9-]+$/.test(String(benchmark.capability || ''))) issues.push(`${label}:valid-capability`);
    if (!ORACLES[benchmark.oracle]) issues.push(`${label}:known-oracle`);
    if (benchmark.referenceType !== 'closed-form-identity') issues.push(`${label}:reference-type`);
    if (!String(benchmark.referenceBasis || '').trim()) issues.push(`${label}:reference-basis`);
    if (!CANDIDATE_OUTCOMES.has(benchmark.expectedOutcome)) issues.push(`${label}:expected-outcome`);
    if (!benchmark.input || typeof benchmark.input !== 'object' || Array.isArray(benchmark.input)) issues.push(`${label}:input-object`);
    if (!Array.isArray(benchmark.assertions) || benchmark.assertions.length < 1) issues.push(`${label}:assertions-required`);
    if (!benchmark.assertions?.some(assertion => assertion?.path === 'strengthPass')) issues.push(`${label}:strength-pass-assertion-required`);
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
      schemaVersion: 3,
      kind: 'independent-engineering-benchmarks-result.v3',
      generatedAt: new Date().toISOString(),
      status: 'blocked',
      summary: {
        eligibleFormalRoutes: Number(catalog?.portfolio?.eligibleFormalRoutes) || 0,
        pilotRequired: Array.isArray(catalog?.benchmarks) ? catalog.benchmarks.length : 0,
        pilotVerified: 0,
        independentlyVerifiedRoutes: 0,
        candidateRequired: Array.isArray(catalog?.candidateBenchmarks) ? catalog.candidateBenchmarks.length : 0,
        candidateVerified: 0,
        candidatePassRequired: Array.isArray(catalog?.candidateBenchmarks)
          ? catalog.candidateBenchmarks.filter(item => item?.expectedOutcome === 'strength-pass').length : 0,
        candidatePassVerified: 0,
        candidateRejectionRequired: Array.isArray(catalog?.candidateBenchmarks)
          ? catalog.candidateBenchmarks.filter(item => item?.expectedOutcome === 'strength-reject').length : 0,
        candidateRejectionVerified: 0,
        verifiedCandidateCapabilities: 0,
        priorityTargets: Array.isArray(catalog?.priorityTargets) ? catalog.priorityTargets.length : 0,
        issueCount: catalogIssues.length
      },
      records: [],
      candidateRecords: [],
      issues: catalogIssues
    };
  }

  const loadModule = options.loadProduction || loadProductionModule;
  const records = [];
  const candidateRecords = [];
  const issues = [];
  function executeBenchmark(benchmark, classification) {
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
      if (classification === 'candidate') {
        const expectedStrengthPass = benchmark.expectedOutcome === 'strength-pass' ? 1 : 0;
        if (production.strengthPass !== expectedStrengthPass) {
          recordIssues.push(`expected-outcome-mismatch:production:actual=${production.strengthPass}:expected=${expectedStrengthPass}`);
        }
        if (expected.strengthPass !== expectedStrengthPass) {
          recordIssues.push(`expected-outcome-mismatch:oracle:actual=${expected.strengthPass}:expected=${expectedStrengthPass}`);
        }
      }
      for (const assertion of benchmark.assertions) {
        const actualValue = getPath(production, assertion.path);
        const expectedValue = getPath(expected, assertion.path);
        if (!closeEnough(actualValue, expectedValue, assertion.absTolerance)) {
          recordIssues.push(`benchmark-value-mismatch:${assertion.path}:actual=${actualValue}:expected=${expectedValue}`);
        }
      }
    }
    issues.push(...recordIssues.map(issue => `${benchmark.id}:${issue}`));
    return {
      id: benchmark.id,
      ...(classification === 'formal' ? { route: benchmark.route } : { capability: benchmark.capability }),
      classification,
      ...(classification === 'candidate' ? { expectedOutcome: benchmark.expectedOutcome } : {}),
      title: benchmark.title,
      status: recordIssues.length ? 'blocked' : 'verified',
      referenceType: benchmark.referenceType,
      referenceBasis: benchmark.referenceBasis,
      assertionCount: benchmark.assertions.length,
      issues: recordIssues
    };
  }
  for (const benchmark of catalog.benchmarks) {
    records.push(executeBenchmark(benchmark, 'formal'));
  }
  for (const benchmark of catalog.candidateBenchmarks) {
    candidateRecords.push(executeBenchmark(benchmark, 'candidate'));
  }
  const pilotVerified = records.filter(record => record.status === 'verified').length;
  const candidateVerified = candidateRecords.filter(record => record.status === 'verified').length;
  const candidatePassRecords = candidateRecords.filter(record => record.expectedOutcome === 'strength-pass');
  const candidateRejectionRecords = candidateRecords.filter(record => record.expectedOutcome === 'strength-reject');
  return {
    schemaVersion: 3,
    kind: 'independent-engineering-benchmarks-result.v3',
    generatedAt: new Date().toISOString(),
    status: issues.length === 0
      && pilotVerified === catalog.benchmarks.length
      && candidateVerified === catalog.candidateBenchmarks.length ? 'ready' : 'blocked',
    summary: {
      eligibleFormalRoutes: catalog.portfolio.eligibleFormalRoutes,
      pilotRequired: catalog.benchmarks.length,
      pilotVerified,
      independentlyVerifiedRoutes: new Set(records.filter(record => record.status === 'verified').map(record => record.route)).size,
      candidateRequired: catalog.candidateBenchmarks.length,
      candidateVerified,
      candidatePassRequired: candidatePassRecords.length,
      candidatePassVerified: candidatePassRecords.filter(record => record.status === 'verified').length,
      candidateRejectionRequired: candidateRejectionRecords.length,
      candidateRejectionVerified: candidateRejectionRecords.filter(record => record.status === 'verified').length,
      verifiedCandidateCapabilities: new Set(candidateRecords.filter(record => record.status === 'verified').map(record => record.capability)).size,
      priorityTargets: catalog.priorityTargets.length,
      issueCount: issues.length
    },
    records,
    candidateRecords,
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
    process.stdout.write(`Independent engineering benchmarks: ${result.status}; formal pilot ${result.summary.pilotVerified}/${result.summary.pilotRequired}; formal portfolio ${result.summary.independentlyVerifiedRoutes}/${result.summary.eligibleFormalRoutes}; candidate pass ${result.summary.candidatePassVerified}/${result.summary.candidatePassRequired}; candidate rejection ${result.summary.candidateRejectionVerified}/${result.summary.candidateRejectionRequired}; issues ${result.summary.issueCount}\n`);
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
