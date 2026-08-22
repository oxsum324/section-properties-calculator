/* Production-independent SRC column arithmetic oracle.
 *
 * This module deliberately does not import src-column-core.js or PMSection.
 * It independently recomputes the current research core's table 3.4-2
 * compactness, stiffness allocation, steel compression, steel interaction,
 * redistribution, and tied rectangular RC uniaxial/biaxial
 * strain-compatibility P-M paths.
 * The RC demand point is solved continuously in neutral-axis depth and does
 * not consume the production core's discretized design curve.
 *
 * Units: cm, cm2, cm3, cm4, kgf/cm2, tf, tf-m.
 */
'use strict';

const ORACLE_VERSION = 'src-column.oracle.v0.3.0-research';
const SUPPORTED_SCHEMA = 'src-column.input.v4';
const PHI_COMPRESSION = 0.85;
const PHI_FLEXURE = 0.9;
const DEFAULT_ES_KGF_CM2 = 2_040_000;
const RC_EPS_CU = 0.003;
const RC_PHI_TIED = 0.65;
const RC_PHI_TENSION = 0.90;
const RC_PN_MAX_FACTOR = 0.80;

class SrcColumnOracleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SrcColumnOracleError';
    this.code = code;
  }
}

function numberAt(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new SrcColumnOracleError('invalid-number', `${label} must be finite`);
  return number;
}

function positiveAt(value, label) {
  const number = numberAt(value, label);
  if (!(number > 0)) throw new SrcColumnOracleError('nonpositive-number', `${label} must be positive`);
  return number;
}

function steelGradeGroup(value) {
  const grade = String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (['SS400', 'SM400', 'SN400', 'A36', '400'].includes(grade)) return '400';
  if (['SS490', 'SM490', 'SN490', 'A572GR50', 'A572 GR.50', 'A572 GR50', '490'].includes(grade)) return '490';
  throw new SrcColumnOracleError('unsupported-steel-grade', 'Table 3.4-2 oracle supports only 400- and 490-grade groups');
}

function compactness(input) {
  const steel = input.steel || {};
  const group = steelGradeGroup(steel.grade);
  const depth = positiveAt(steel.depthCm, 'steel.depthCm');
  const width = positiveAt(steel.flangeWidthCm, 'steel.flangeWidthCm');
  const tf = positiveAt(steel.flangeThicknessCm, 'steel.flangeThicknessCm');
  const tw = positiveAt(steel.webThicknessCm, 'steel.webThicknessCm');
  const fysTfCm2 = positiveAt(steel.fysKgfCm2, 'steel.fysKgfCm2') / 1000;
  const clearWebDepthCm = depth - 2 * tf;
  if (!(clearWebDepthCm > 0) || !(tw < width)) {
    throw new SrcColumnOracleError('invalid-h-section-geometry', 'H-shape plate geometry is invalid');
  }
  const flangeRatio = width / (2 * tf);
  const webRatio = clearWebDepthCm / tw;
  const general = group === '400'
    ? { flange: 23, web: 96 }
    : { flange: 20, web: 81 };
  const seismicReference = {
    flange: 21 / Math.sqrt(fysTfCm2),
    web: 123 / Math.sqrt(fysTfCm2),
  };
  return {
    gradeGroup: group,
    flangeRatio,
    clearWebDepthCm,
    webRatio,
    flangeGeneralLimit: general.flange,
    webGeneralLimit: general.web,
    flangeSeismicLimit: seismicReference.flange,
    webSeismicLimit: seismicReference.web,
    flangeOk: flangeRatio <= general.flange,
    webOk: webRatio <= general.web,
    ok: flangeRatio <= general.flange && webRatio <= general.web,
  };
}

function steelCompression(input, axis) {
  const steel = input.steel || {};
  const concrete = input.concrete || {};
  const member = input.member || {};
  const area = positiveAt(steel.areaCm2, 'steel.areaCm2');
  const inertia = positiveAt(axis === 'x' ? steel.ixCm4 : steel.iyCm4, `steel.i${axis}Cm4`);
  const width = positiveAt(concrete.widthCm, 'concrete.widthCm');
  const depth = positiveAt(concrete.depthCm, 'concrete.depthCm');
  const grossArea = width * depth;
  const grossInertia = axis === 'x' ? width * depth ** 3 / 12 : depth * width ** 3 / 12;
  const alpha = axis === 'x' ? 0.2 : 0.4;
  const effectiveRadiusCm = Math.sqrt(inertia / area) + alpha * Math.sqrt(grossInertia / grossArea);
  const k = positiveAt(axis === 'x' ? member.kx : member.ky, `member.k${axis}`);
  const length = positiveAt(member.lengthCm, 'member.lengthCm');
  const fys = positiveAt(steel.fysKgfCm2, 'steel.fysKgfCm2');
  const es = steel.esKgfCm2 == null ? DEFAULT_ES_KGF_CM2 : positiveAt(steel.esKgfCm2, 'steel.esKgfCm2');
  const lambdaC = (k * length / (Math.PI * effectiveRadiusCm)) * Math.sqrt(fys / es);
  const strengthFactor = lambdaC <= 1.5 ? Math.exp(-0.419 * lambdaC ** 2) : 0.877 / lambdaC ** 2;
  return {
    effectiveRadiusCm,
    lambdaC,
    branch: lambdaC <= 1.5 ? 'inelastic' : 'elastic',
    nominalCompressionTf: strengthFactor * fys * area / 1000,
  };
}

function steelInteraction(puTf, muxTfM, muyTfM, pnsTf, mnxTfM, mnyTfM) {
  const axialRatio = puTf / (PHI_COMPRESSION * pnsTf);
  const momentRatioX = Math.abs(muxTfM) / (PHI_FLEXURE * mnxTfM);
  const momentRatioY = Math.abs(muyTfM) / (PHI_FLEXURE * mnyTfM);
  const momentRatio = momentRatioX + momentRatioY;
  const highAxial = axialRatio >= 0.2;
  const utilization = highAxial
    ? axialRatio + (8 / 9) * momentRatio
    : axialRatio / 2 + momentRatio;
  return {
    branch: highAxial ? 'high-axial' : 'low-axial',
    axialRatio,
    momentRatioX,
    momentRatioY,
    momentRatio,
    utilization,
  };
}

function rcBeta1(fcKgfCm2) {
  const fc = positiveAt(fcKgfCm2, 'concrete.fcKgfCm2');
  if (fc <= 280) return 0.85;
  if (fc >= 560) return 0.65;
  return 0.85 - 0.05 * (fc - 280) / 70;
}

function rcPhiFromTensionStrain(epsT, fyKgfCm2, esKgfCm2) {
  const strain = numberAt(epsT, 'epsT');
  const fy = positiveAt(fyKgfCm2, 'reinforcement.fyKgfCm2');
  const es = positiveAt(esKgfCm2, 'reinforcement.esKgfCm2');
  const epsTy = fy / es;
  if (strain <= epsTy) return RC_PHI_TIED;
  if (strain >= epsTy + 0.003) return RC_PHI_TENSION;
  return RC_PHI_TIED + (RC_PHI_TENSION - RC_PHI_TIED) * (strain - epsTy) / 0.003;
}

function normalizeRcInput(input) {
  const concrete = input.concrete || {};
  const reinforcement = input.reinforcement || {};
  if (reinforcement.tieType !== 'tied') {
    throw new SrcColumnOracleError('unsupported-tie-type', 'RC P-M oracle supports tied rectangular columns only');
  }
  const widthCm = positiveAt(concrete.widthCm, 'concrete.widthCm');
  const depthCm = positiveAt(concrete.depthCm, 'concrete.depthCm');
  const fcKgfCm2 = positiveAt(concrete.fcKgfCm2, 'concrete.fcKgfCm2');
  const fyKgfCm2 = positiveAt(reinforcement.fyKgfCm2, 'reinforcement.fyKgfCm2');
  const esKgfCm2 = reinforcement.esKgfCm2 == null
    ? DEFAULT_ES_KGF_CM2
    : positiveAt(reinforcement.esKgfCm2, 'reinforcement.esKgfCm2');
  if (!Array.isArray(reinforcement.layers) || reinforcement.layers.length < 2) {
    throw new SrcColumnOracleError('reinforcement-layers-required', 'RC P-M oracle requires at least two reinforcement layers');
  }
  const layers = reinforcement.layers.map((layer, index) => {
    const yCm = positiveAt(layer.yCm, `reinforcement.layers[${index}].yCm`);
    if (!(yCm < depthCm)) {
      throw new SrcColumnOracleError('invalid-reinforcement-depth', `reinforcement.layers[${index}].yCm must lie inside the section`);
    }
    return { yCm, areaCm2: positiveAt(layer.areaCm2, `reinforcement.layers[${index}].areaCm2`) };
  });
  return {
    widthCm,
    depthCm,
    fcKgfCm2,
    fyKgfCm2,
    esKgfCm2,
    beta1: rcBeta1(fcKgfCm2),
    layers,
  };
}

function rcNominalPointFromModel(cCm, model) {
  const c = positiveAt(cCm, 'cCm');
  const { widthCm: width, depthCm: depth, fcKgfCm2: fc, fyKgfCm2: fy, esKgfCm2: es, beta1, layers } = model;
  const aCm = Math.min(beta1 * c, depth);
  const concreteForceKgf = 0.85 * fc * width * aCm;
  let nominalPKgf = concreteForceKgf;
  let nominalMKgfCm = concreteForceKgf * (depth / 2 - aCm / 2);
  for (const layer of layers) {
    const strain = RC_EPS_CU * (c - layer.yCm) / c;
    const stress = Math.max(-fy, Math.min(fy, strain * es));
    const netForceKgf = layer.yCm < aCm
      ? (stress - 0.85 * fc) * layer.areaCm2
      : stress * layer.areaCm2;
    nominalPKgf += netForceKgf;
    nominalMKgfCm += netForceKgf * (depth / 2 - layer.yCm);
  }
  const tensionDepthCm = Math.max(...layers.map(layer => layer.yCm));
  const epsT = RC_EPS_CU * (tensionDepthCm - c) / c;
  const epsTy = fy / es;
  return {
    cCm: c,
    aCm,
    epsT,
    epsTy,
    phi: rcPhiFromTensionStrain(epsT, fy, es),
    nominalPKgf,
    nominalMKgfCm,
  };
}

function rcNominalPoint(cCm, input) {
  return rcNominalPointFromModel(cCm, normalizeRcInput(input));
}

function rcInteractionAtDemand(input, puTf, muTfM) {
  const model = normalizeRcInput(input);
  const pu = numberAt(puTf, 'puTf');
  const mu = Math.abs(numberAt(muTfM, 'muTfM'));
  const grossAreaCm2 = model.widthCm * model.depthCm;
  const steelAreaCm2 = model.layers.reduce((sum, layer) => sum + layer.areaCm2, 0);
  const nominalPoTf = (0.85 * model.fcKgfCm2 * (grossAreaCm2 - steelAreaCm2)
    + model.fyKgfCm2 * steelAreaCm2) / 1000;
  const phiPnMaxTf = RC_PHI_TIED * RC_PN_MAX_FACTOR * nominalPoTf;
  const pureTensionTf = -RC_PHI_TENSION * model.fyKgfCm2 * steelAreaCm2 / 1000;
  const axialToleranceTf = 1e-7;
  const axialOk = pu >= pureTensionTf - axialToleranceTf && pu <= phiPnMaxTf + axialToleranceTf;
  const common = {
    method: 'continuous-log-bisection',
    demand: { puTf: pu, muxTfM: mu },
    nominalPoTf,
    phiPnMaxTf,
    pMinTf: pureTensionTf,
    pMaxTf: phiPnMaxTf,
    axialOk,
  };
  if (!axialOk) {
    return {
      ...common,
      phiMnTfM: 0,
      utilization: mu > 0 ? Infinity : 0,
      ok: false,
      outOfRange: true,
      solution: null,
    };
  }

  function designPoint(logC) {
    const point = rcNominalPointFromModel(Math.exp(logC), model);
    let designPTf = point.phi * point.nominalPKgf / 1000;
    if (point.nominalPKgf > 0) designPTf = Math.min(designPTf, phiPnMaxTf);
    return {
      ...point,
      designPTf,
      designMTfM: Math.abs(point.nominalMKgfCm) * point.phi / 100000,
    };
  }

  let low = Math.log(model.depthCm * 1e-8);
  let high = Math.log(model.depthCm * 1e6);
  let lowPoint = designPoint(low);
  let highPoint = designPoint(high);
  if (pu < lowPoint.designPTf - axialToleranceTf || pu > highPoint.designPTf + axialToleranceTf) {
    throw new SrcColumnOracleError('rc-root-not-bracketed', 'RC design axial force could not be bracketed by the independent solver');
  }
  for (let iteration = 0; iteration < 160; iteration += 1) {
    const middle = (low + high) / 2;
    const middlePoint = designPoint(middle);
    if (middlePoint.designPTf < pu) {
      low = middle;
      lowPoint = middlePoint;
    } else {
      high = middle;
      highPoint = middlePoint;
    }
  }
  const solution = Math.abs(lowPoint.designPTf - pu) <= Math.abs(highPoint.designPTf - pu)
    ? lowPoint
    : highPoint;
  const utilization = solution.designMTfM > 0 ? mu / solution.designMTfM : (mu > 0 ? Infinity : 0);
  return {
    ...common,
    phiMnTfM: solution.designMTfM,
    utilization,
    ok: mu <= solution.designMTfM + 1e-9,
    outOfRange: false,
    solution: {
      cCm: solution.cCm,
      aCm: solution.aCm,
      epsT: solution.epsT,
      epsTy: solution.epsTy,
      phi: solution.phi,
      nominalPTf: solution.nominalPKgf / 1000,
      nominalMTfM: Math.abs(solution.nominalMKgfCm) / 100000,
      designPTf: solution.designPTf,
    },
  };
}

function normalizeBiaxialRcInput(input) {
  const base = normalizeRcInput(input);
  const barsInput = input?.reinforcement?.bars;
  if (!Array.isArray(barsInput) || barsInput.length < 4) {
    throw new SrcColumnOracleError('biaxial-bars-required', 'Biaxial RC oracle requires at least four positioned bars');
  }
  const bars = barsInput.map((bar, index) => {
    const xCm = numberAt(bar?.xCm, `reinforcement.bars[${index}].xCm`);
    const yCm = numberAt(bar?.yCm, `reinforcement.bars[${index}].yCm`);
    if (!(xCm > 0 && xCm < base.widthCm && yCm > 0 && yCm < base.depthCm)) {
      throw new SrcColumnOracleError('bar-outside-section', `reinforcement.bars[${index}] must lie inside the section`);
    }
    return {
      x: xCm - base.widthCm / 2,
      y: base.depthCm / 2 - yCm,
      areaCm2: positiveAt(bar?.areaCm2, `reinforcement.bars[${index}].areaCm2`),
    };
  });
  return { ...base, bars };
}

function numericalCompressionBlock(model, nx, ny, edge) {
  const width = model.widthCm;
  const depth = model.depthCm;
  const strips = 320;
  let areaCm2 = 0;
  let firstX = 0;
  let firstY = 0;
  if (Math.abs(ny) >= Math.abs(nx)) {
    const dx = width / strips;
    for (let index = 0; index < strips; index += 1) {
      const x = -width / 2 + (index + 0.5) * dx;
      const threshold = (edge - nx * x) / ny;
      const low = ny > 0 ? Math.max(-depth / 2, threshold) : -depth / 2;
      const high = ny > 0 ? depth / 2 : Math.min(depth / 2, threshold);
      if (high <= low) continue;
      const stripArea = dx * (high - low);
      areaCm2 += stripArea;
      firstX += stripArea * x;
      firstY += dx * (high * high - low * low) / 2;
    }
  } else {
    const dy = depth / strips;
    for (let index = 0; index < strips; index += 1) {
      const y = -depth / 2 + (index + 0.5) * dy;
      const threshold = (edge - ny * y) / nx;
      const low = nx > 0 ? Math.max(-width / 2, threshold) : -width / 2;
      const high = nx > 0 ? width / 2 : Math.min(width / 2, threshold);
      if (high <= low) continue;
      const stripArea = dy * (high - low);
      areaCm2 += stripArea;
      firstX += dy * (high * high - low * low) / 2;
      firstY += stripArea * y;
    }
  }
  return {
    areaCm2,
    xCm: areaCm2 > 0 ? firstX / areaCm2 : 0,
    yCm: areaCm2 > 0 ? firstY / areaCm2 : 0,
  };
}

function rcBiaxialNominalPointFromModel(cCm, thetaRad, model) {
  const c = positiveAt(cCm, 'cCm');
  const theta = numberAt(thetaRad, 'thetaRad');
  const nx = Math.sin(theta);
  const ny = Math.cos(theta);
  const zMax = Math.abs(nx) * model.widthCm / 2 + Math.abs(ny) * model.depthCm / 2;
  const zMin = -zMax;
  const blockDepthCm = Math.min(model.beta1 * c, zMax - zMin);
  const blockEdge = zMax - blockDepthCm;
  const neutralEdge = zMax - c;
  const block = numericalCompressionBlock(model, nx, ny, blockEdge);
  const concreteForceKgf = 0.85 * model.fcKgfCm2 * block.areaCm2;
  let nominalPKgf = concreteForceKgf;
  let nominalMxKgfCm = concreteForceKgf * block.yCm;
  let nominalMyKgfCm = concreteForceKgf * block.xCm;
  let zMinBar = Infinity;
  for (const bar of model.bars) {
    const z = bar.x * nx + bar.y * ny;
    zMinBar = Math.min(zMinBar, z);
    const strain = RC_EPS_CU * (z - neutralEdge) / c;
    const stress = Math.max(-model.fyKgfCm2, Math.min(model.fyKgfCm2, model.esKgfCm2 * strain));
    const netStress = z >= blockEdge ? stress - 0.85 * model.fcKgfCm2 : stress;
    const forceKgf = netStress * bar.areaCm2;
    nominalPKgf += forceKgf;
    nominalMxKgfCm += forceKgf * bar.y;
    nominalMyKgfCm += forceKgf * bar.x;
  }
  const epsT = RC_EPS_CU * ((zMax - zMinBar) - c) / c;
  return {
    cCm: c,
    thetaRad: theta,
    blockDepthCm,
    blockAreaCm2: block.areaCm2,
    epsT,
    epsTy: model.fyKgfCm2 / model.esKgfCm2,
    phi: rcPhiFromTensionStrain(epsT, model.fyKgfCm2, model.esKgfCm2),
    nominalPKgf,
    nominalMxKgfCm,
    nominalMyKgfCm,
  };
}

function biaxialConvexHull(points) {
  const unique = new Map();
  for (const point of points) {
    const normalized = { x: Math.max(0, point.x), y: Math.max(0, point.y) };
    unique.set(`${normalized.x.toFixed(8)},${normalized.y.toFixed(8)}`, normalized);
  }
  const sorted = [...unique.values()].sort((left, right) => left.x === right.x ? left.y - right.y : left.x - right.x);
  if (sorted.length <= 1) return sorted;
  const cross = (origin, left, right) => (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function biaxialRayCapacity(hull, unitX, unitY) {
  const determinant = (ax, ay, bx, by) => ax * by - ay * bx;
  let capacity = 0;
  for (let index = 0; index < hull.length; index += 1) {
    const start = hull[index];
    const end = hull[(index + 1) % hull.length];
    const edgeX = end.x - start.x;
    const edgeY = end.y - start.y;
    const denominator = determinant(unitX, unitY, edgeX, edgeY);
    if (Math.abs(denominator) < 1e-12) continue;
    const rayDistance = determinant(start.x, start.y, edgeX, edgeY) / denominator;
    const edgeFraction = determinant(start.x, start.y, unitX, unitY) / denominator;
    if (rayDistance >= -1e-9 && edgeFraction >= -1e-9 && edgeFraction <= 1 + 1e-9) capacity = Math.max(capacity, rayDistance);
  }
  return capacity;
}

function rcBiaxialInteractionAtDemand(input, puTf, muxTfM, muyTfM) {
  const model = normalizeBiaxialRcInput(input);
  const pu = numberAt(puTf, 'puTf');
  const mux = Math.abs(numberAt(muxTfM, 'muxTfM'));
  const muy = Math.abs(numberAt(muyTfM, 'muyTfM'));
  const steelAreaCm2 = model.bars.reduce((sum, bar) => sum + bar.areaCm2, 0);
  const nominalPoTf = (0.85 * model.fcKgfCm2 * (model.widthCm * model.depthCm - steelAreaCm2)
    + model.fyKgfCm2 * steelAreaCm2) / 1000;
  const phiPnMaxTf = RC_PHI_TIED * RC_PN_MAX_FACTOR * nominalPoTf;
  const pureTensionTf = -RC_PHI_TENSION * model.fyKgfCm2 * steelAreaCm2 / 1000;
  const axialOk = pu >= pureTensionTf - 1e-7 && pu <= phiPnMaxTf + 1e-7;
  const demandMagnitude = Math.hypot(mux, muy);
  const common = {
    method: 'numerical-strip-log-bisection',
    demand: { puTf: pu, muxTfM: mux, muyTfM: muy },
    nominalPoTf,
    phiPnMaxTf,
    pMinTf: pureTensionTf,
    pMaxTf: phiPnMaxTf,
    axialOk,
  };
  if (!axialOk) return { ...common, phiMnTfM: 0, utilization: demandMagnitude > 0 ? Infinity : 0, ok: false, outOfRange: true, surface: [] };
  if (demandMagnitude <= 1e-12) return { ...common, phiMnTfM: Infinity, utilization: 0, ok: true, outOfRange: false, surface: [] };

  const reference = Math.hypot(model.widthCm, model.depthCm);
  const points = [{ x: 0, y: 0 }];
  const surface = [];
  const angleSteps = 72;
  for (let angleIndex = 0; angleIndex < angleSteps; angleIndex += 1) {
    const thetaRad = 2 * Math.PI * angleIndex / angleSteps;
    function designPoint(logC) {
      const point = rcBiaxialNominalPointFromModel(Math.exp(logC), thetaRad, model);
      let designPTf = point.phi * point.nominalPKgf / 1000;
      if (point.nominalPKgf > 0) designPTf = Math.min(designPTf, phiPnMaxTf);
      return {
        ...point,
        designPTf,
        designMxTfM: point.phi * point.nominalMxKgfCm / 100000,
        designMyTfM: point.phi * point.nominalMyKgfCm / 100000,
      };
    }
    let low = Math.log(reference * 1e-8);
    let high = Math.log(reference * 1e6);
    let lowPoint = designPoint(low);
    let highPoint = designPoint(high);
    if (pu < lowPoint.designPTf - 1e-6 || pu > highPoint.designPTf + 1e-6) {
      throw new SrcColumnOracleError('rc-root-not-bracketed', 'Biaxial RC axial demand could not be bracketed');
    }
    for (let iteration = 0; iteration < 120; iteration += 1) {
      const middle = (low + high) / 2;
      const point = designPoint(middle);
      if (point.designPTf < pu) {
        low = middle;
        lowPoint = point;
      } else {
        high = middle;
        highPoint = point;
      }
    }
    const solution = Math.abs(lowPoint.designPTf - pu) <= Math.abs(highPoint.designPTf - pu) ? lowPoint : highPoint;
    const x = Math.abs(solution.designMxTfM);
    const y = Math.abs(solution.designMyTfM);
    points.push({ x, y });
    surface.push({ thetaRad, x, y, cCm: solution.cCm, phi: solution.phi, epsT: solution.epsT, designPTf: solution.designPTf });
  }
  const hull = biaxialConvexHull(points);
  const unitX = mux / demandMagnitude;
  const unitY = muy / demandMagnitude;
  const capacityTfM = biaxialRayCapacity(hull, unitX, unitY);
  const utilization = capacityTfM > 0 ? demandMagnitude / capacityTfM : Infinity;
  return {
    ...common,
    phiMnTfM: capacityTfM,
    capacityTfM,
    capacityMuxTfM: capacityTfM * unitX,
    capacityMuyTfM: capacityTfM * unitY,
    utilization,
    ok: utilization <= 1 + 1e-9,
    outOfRange: false,
    angleSteps,
    surface,
    hull,
  };
}

function calculate(input) {
  if (input?.schema !== SUPPORTED_SCHEMA) {
    throw new SrcColumnOracleError('unsupported-input-schema', `Oracle accepts only ${SUPPORTED_SCHEMA}`);
  }
  if (input?.detailing?.seismicDesign === true) {
    throw new SrcColumnOracleError('seismic-scope-not-implemented', 'Seismic SRC column design is outside the oracle scope');
  }
  const concrete = input.concrete || {};
  const steel = input.steel || {};
  const demands = input.demands || {};
  const width = positiveAt(concrete.widthCm, 'concrete.widthCm');
  const depth = positiveAt(concrete.depthCm, 'concrete.depthCm');
  const fc = positiveAt(concrete.fcKgfCm2, 'concrete.fcKgfCm2');
  const area = positiveAt(steel.areaCm2, 'steel.areaCm2');
  const ix = positiveAt(steel.ixCm4, 'steel.ixCm4');
  const iy = positiveAt(steel.iyCm4, 'steel.iyCm4');
  const zx = positiveAt(steel.zxCm3, 'steel.zxCm3');
  const zy = steel.zyCm3 == null ? null : positiveAt(steel.zyCm3, 'steel.zyCm3');
  const fys = positiveAt(steel.fysKgfCm2, 'steel.fysKgfCm2');
  const es = steel.esKgfCm2 == null ? DEFAULT_ES_KGF_CM2 : positiveAt(steel.esKgfCm2, 'steel.esKgfCm2');
  const ec = concrete.ecKgfCm2 == null ? 15000 * Math.sqrt(fc) : positiveAt(concrete.ecKgfCm2, 'concrete.ecKgfCm2');
  const grossArea = width * depth;
  const grossIx = width * depth ** 3 / 12;
  const grossIy = depth * width ** 3 / 12;
  const axialSteelRatio = es * area / (es * area + 0.55 * ec * grossArea);
  const momentSteelRatioX = es * ix / (es * ix + 0.35 * ec * grossIx);
  const momentSteelRatioY = es * iy / (es * iy + 0.35 * ec * grossIy);
  const pu = positiveAt(demands.puTf, 'demands.puTf');
  const mux = Math.abs(numberAt(demands.muxTfM, 'demands.muxTfM'));
  const muy = Math.abs(numberAt(demands.muyTfM == null ? 0 : demands.muyTfM, 'demands.muyTfM'));
  if (muy > 0 && zy == null) throw new SrcColumnOracleError('biaxial-steel-zy-required', 'Biaxial steel interaction requires Zy');
  const initialSteelDemands = {
    puTf: pu * axialSteelRatio,
    muxTfM: mux * momentSteelRatioX,
    muyTfM: muy * momentSteelRatioY,
  };
  const initialRcDemands = {
    puTf: pu - initialSteelDemands.puTf,
    muxTfM: mux - initialSteelDemands.muxTfM,
    muyTfM: muy - initialSteelDemands.muyTfM,
  };
  const compressionX = steelCompression(input, 'x');
  const compressionY = steelCompression(input, 'y');
  const control = compressionX.nominalCompressionTf <= compressionY.nominalCompressionTf ? compressionX : compressionY;
  const controlAxis = control === compressionX ? 'x' : 'y';
  const nominalMomentXTfM = zx * fys / 100000;
  const nominalMomentYTfM = (zy || 0) * fys / 100000;
  const initialInteraction = steelInteraction(
    initialSteelDemands.puTf,
    initialSteelDemands.muxTfM,
    initialSteelDemands.muyTfM,
    control.nominalCompressionTf,
    nominalMomentXTfM,
    muy > 0 ? nominalMomentYTfM : Infinity
  );
  const useRedistribution = input?.detailing?.redistributeToSteelBoundary === true;
  const divisor = useRedistribution ? initialInteraction.utilization : 1;
  if (!(divisor > 0)) throw new SrcColumnOracleError('invalid-redistribution-divisor', 'Interaction divisor must be positive');
  const finalSteelDemands = {
    puTf: initialSteelDemands.puTf / divisor,
    muxTfM: initialSteelDemands.muxTfM / divisor,
    muyTfM: initialSteelDemands.muyTfM / divisor,
  };
  const finalRcDemands = {
    puTf: pu - finalSteelDemands.puTf,
    muxTfM: mux - finalSteelDemands.muxTfM,
    muyTfM: muy - finalSteelDemands.muyTfM,
  };
  const finalInteraction = steelInteraction(
    finalSteelDemands.puTf,
    finalSteelDemands.muxTfM,
    finalSteelDemands.muyTfM,
    control.nominalCompressionTf,
    nominalMomentXTfM,
    muy > 0 ? nominalMomentYTfM : Infinity
  );
  const rc = muy > 0
    ? rcBiaxialInteractionAtDemand(input, finalRcDemands.puTf, finalRcDemands.muxTfM, finalRcDemands.muyTfM)
    : rcInteractionAtDemand(input, finalRcDemands.puTf, finalRcDemands.muxTfM);

  return {
    oracleVersion: ORACLE_VERSION,
    supportedSchema: SUPPORTED_SCHEMA,
    coverage: {
      covered: ['table-3.4-2-compactness', 'stiffness-allocation', 'steel-compression', 'steel-biaxial-interaction', 'redistribution', 'rc-strain-compatibility-pm', 'rc-biaxial-interaction'],
      uncovered: ['shear', 'seismic-design'],
    },
    compactness: compactness(input),
    allocation: { axialSteelRatio, momentSteelRatioX, momentSteelRatioY, initialSteelDemands, initialRcDemands },
    steel: {
      compressionX,
      compressionY,
      compressionControlAxis: controlAxis,
      nominalCompressionTf: control.nominalCompressionTf,
      nominalMomentXTfM,
      nominalMomentYTfM,
      initialInteraction,
      finalInteraction,
    },
    redistribution: { applied: useRedistribution, beta: initialInteraction.utilization, finalSteelDemands, finalRcDemands },
    rc,
  };
}

module.exports = {
  ORACLE_VERSION,
  SUPPORTED_SCHEMA,
  SrcColumnOracleError,
  steelGradeGroup,
  compactness,
  steelCompression,
  steelInteraction,
  rcBeta1,
  rcPhiFromTensionStrain,
  rcNominalPoint,
  rcInteractionAtDemand,
  rcBiaxialInteractionAtDemand,
  calculate,
};
