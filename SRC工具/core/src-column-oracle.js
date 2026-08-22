/* Production-independent SRC column arithmetic oracle.
 *
 * This module deliberately does not import src-column-core.js or PMSection.
 * It independently recomputes the current research core's table 3.4-2
 * compactness, stiffness allocation, steel compression, steel interaction,
 * redistribution, tied rectangular RC uniaxial/biaxial strain-compatibility
 * P-M paths, and the current-code seismic strong-axis shear,
 * strong-column/weak-beam, and rectangular-column confinement subchecks.
 * The RC demand point is solved continuously in neutral-axis depth and does
 * not consume the production core's discretized design curve.
 *
 * Units: cm, cm2, cm3, cm4, kgf/cm2, tf, tf-m.
 */
'use strict';

const ORACLE_VERSION = 'src-column.oracle.v0.5.0-research';
const SUPPORTED_SCHEMA = 'src-column.input.v6';
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
  const seismic = input?.detailing?.seismicDesign === true;
  const flangeLimit = seismic ? seismicReference.flange : general.flange;
  const webLimit = seismic ? seismicReference.web : general.web;
  return {
    governingMode: seismic ? 'seismic-lambda-pd-subcheck' : 'general-lambda-p',
    gradeGroup: group,
    flangeRatio,
    clearWebDepthCm,
    webRatio,
    flangeGeneralLimit: general.flange,
    webGeneralLimit: general.web,
    flangeSeismicLimit: seismicReference.flange,
    webSeismicLimit: seismicReference.web,
    flangeOk: flangeRatio <= flangeLimit,
    webOk: webRatio <= webLimit,
    ok: flangeRatio <= flangeLimit && webRatio <= webLimit,
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

function rcProbableMomentTfM(input) {
  const base = normalizeRcInput(input);
  const model = { ...base, fyKgfCm2: 1.25 * base.fyKgfCm2 };
  let low = Math.log(model.depthCm * 1e-8);
  let high = Math.log(model.depthCm * 1e6);
  let lowPoint = rcNominalPointFromModel(Math.exp(low), model);
  let highPoint = rcNominalPointFromModel(Math.exp(high), model);
  if (lowPoint.nominalPKgf > 0 || highPoint.nominalPKgf < 0) {
    throw new SrcColumnOracleError('rc-probable-root-not-bracketed', 'RC probable pure-bending state could not be bracketed');
  }
  for (let iteration = 0; iteration < 180; iteration += 1) {
    const middle = (low + high) / 2;
    const point = rcNominalPointFromModel(Math.exp(middle), model);
    if (point.nominalPKgf < 0) {
      low = middle;
      lowPoint = point;
    } else {
      high = middle;
      highPoint = point;
    }
  }
  const solution = Math.abs(lowPoint.nominalPKgf) <= Math.abs(highPoint.nominalPKgf) ? lowPoint : highPoint;
  return Math.abs(solution.nominalMKgfCm) / 100000;
}

function requireOracleConfirmation(value, code, message) {
  if (value !== true) throw new SrcColumnOracleError(code, message);
}

function booleanAt(value, label) {
  if (value !== true && value !== false) throw new SrcColumnOracleError('boolean-required', `${label} must be explicitly true or false`);
  return value;
}

function seismicStrongAxisShear(input, rcAxialDemandTf, steelNominalMomentTfM) {
  const shear = input.shear || {};
  if (shear.axis !== 'x') throw new SrcColumnOracleError('unsupported-shear-axis', 'Only strong-axis x shear is covered');
  requireOracleConfirmation(shear.projectPlasticHingeMomentsConfirmed, 'plastic-hinge-moments-not-confirmed', 'Project plastic-hinge moments must be confirmed');
  requireOracleConfirmation(shear.normalWeightConcreteConfirmed, 'normal-weight-concrete-not-confirmed', 'Normal-weight concrete must be confirmed');
  requireOracleConfirmation(shear.monolithicInterfaceConfirmed, 'monolithic-interface-not-confirmed', 'Monolithic shear-friction interface must be confirmed');
  requireOracleConfirmation(shear.transverseReinforcementPerpendicularConfirmed, 'transverse-reinforcement-not-confirmed', 'Perpendicular transverse reinforcement must be confirmed');

  const concrete = input.concrete || {};
  const steel = input.steel || {};
  const width = positiveAt(concrete.widthCm, 'concrete.widthCm');
  const depth = positiveAt(concrete.depthCm, 'concrete.depthCm');
  const fc = positiveAt(concrete.fcKgfCm2, 'concrete.fcKgfCm2');
  const effectiveDepth = positiveAt(shear.effectiveDepthCm, 'shear.effectiveDepthCm');
  if (!(effectiveDepth < depth)) throw new SrcColumnOracleError('effective-depth-outside-section', 'Effective depth must lie inside the section');
  const mct = numberAt(shear.mctTfM, 'shear.mctTfM');
  const mcb = numberAt(shear.mcbTfM, 'shear.mcbTfM');
  if (mct < 0 || mcb < 0 || !(mct + mcb > 0)) throw new SrcColumnOracleError('invalid-probable-end-moment', 'Probable end moments must be nonnegative and not both zero');
  const clearHeight = positiveAt(shear.clearHeightCm, 'shear.clearHeightCm');
  const demandShearTf = (mct + mcb) * 100 / clearHeight;
  const rcProbableMoment = rcProbableMomentTfM(input);
  const totalProbableMoment = steelNominalMomentTfM + rcProbableMoment;
  const steelRequiredShearTf = steelNominalMomentTfM / totalProbableMoment * demandShearTf;
  const rcRequiredShearTf = rcProbableMoment / totalProbableMoment * demandShearTf;

  const fyw = positiveAt(steel.fywKgfCm2, 'steel.fywKgfCm2');
  const webThickness = positiveAt(steel.webThicknessCm, 'steel.webThicknessCm');
  const steelDepth = positiveAt(steel.depthCm, 'steel.depthCm');
  const steelWebAreaCm2 = webThickness * steelDepth;
  const steelNominalShearTf = 0.6 * fyw * steelWebAreaCm2 / 1000;
  const steelDesignShearTf = 0.9 * steelNominalShearTf;

  const purc = numberAt(rcAxialDemandTf, 'rcAxialDemandTf');
  if (purc < 0) throw new SrcColumnOracleError('unsupported-rc-axial-tension', 'Shear oracle supports RC compression only');
  const av = positiveAt(shear.avCm2, 'shear.avCm2');
  const avf = positiveAt(shear.avfCm2, 'shear.avfCm2');
  const spacing = positiveAt(shear.spacingCm, 'shear.spacingCm');
  const fyh = positiveAt(shear.fyhKgfCm2, 'shear.fyhKgfCm2');
  const flangeWidth = positiveAt(steel.flangeWidthCm, 'steel.flangeWidthCm');
  if (!(flangeWidth < width)) throw new SrcColumnOracleError('invalid-net-concrete-width', 'Steel flange width must be less than concrete width');
  const studContribution = numberAt(shear.shearStudContributionTf, 'shear.shearStudContributionTf');
  if (studContribution !== 0) throw new SrcColumnOracleError('shear-stud-scope-not-implemented', 'Shear-stud contribution is outside the oracle scope');
  const grossArea = width * depth;
  const sqrtFc = Math.sqrt(fc);
  const transverseLimitTf = 2.12 * sqrtFc * width * effectiveDepth / 1000;
  const transverseTf = Math.min(av * fyh * effectiveDepth / spacing / 1000, transverseLimitTf);
  const concreteTf = 0.53 * (1 + purc * 1000 / (140 * grossArea)) * sqrtFc * width * effectiveDepth / 1000;
  const generalTf = transverseTf + concreteTf;
  const frictionTransverseTf = Math.min(0.8 * avf * fyh * effectiveDepth / spacing / 1000, 0.8 * transverseLimitTf);
  const frictionConcreteTf = 28 * (width - flangeWidth) * effectiveDepth / 1000;
  const frictionTf = frictionTransverseTf + frictionConcreteTf;
  const rcNominalShearTf = Math.min(generalTf, frictionTf);
  const rcDesignShearTf = 0.75 * rcNominalShearTf;
  const requiredNominalShearTf = rcRequiredShearTf / 0.75;
  const requiredGeneralTransverseTf = Math.max(0, requiredNominalShearTf - concreteTf);
  const requiredGeneralAreaCm2 = requiredGeneralTransverseTf * 1000 * spacing / (fyh * effectiveDepth);
  const requiredFrictionTransverseTf = Math.max(0, requiredNominalShearTf - frictionConcreteTf);
  const requiredFrictionAreaCm2 = requiredFrictionTransverseTf * 1000 * spacing / (0.8 * fyh * effectiveDepth);
  const requiredTransverseAreaCm2 = Math.max(requiredGeneralAreaCm2, requiredFrictionAreaCm2);

  return {
    method: 'independent-continuous-probable-moment',
    mode: 'seismic-strong-axis-subcheck',
    demand: { mctTfM: mct, mcbTfM: mcb, clearHeightCm: clearHeight, shearTf: demandShearTf },
    probableMoments: {
      steelNominalMomentTfM,
      rcProbableMomentTfM: rcProbableMoment,
      totalTfM: totalProbableMoment,
      steelShare: steelNominalMomentTfM / totalProbableMoment,
      rcShare: rcProbableMoment / totalProbableMoment,
    },
    steel: {
      webAreaCm2: steelWebAreaCm2,
      nominalShearTf: steelNominalShearTf,
      designShearTf: steelDesignShearTf,
      requiredShearTf: steelRequiredShearTf,
      utilization: steelRequiredShearTf / steelDesignShearTf,
      ok: steelRequiredShearTf <= steelDesignShearTf + 1e-9,
    },
    rc: {
      axialDemandTf: purc,
      transverseLimitTf,
      transverseTf,
      concreteTf,
      generalTf,
      frictionTransverseTf,
      netConcreteWidthCm: width - flangeWidth,
      frictionConcreteTf,
      frictionTf,
      governingMode: generalTf <= frictionTf ? 'general-shear' : 'shear-friction',
      nominalShearTf: rcNominalShearTf,
      designShearTf: rcDesignShearTf,
      requiredShearTf: rcRequiredShearTf,
      requiredNominalShearTf,
      requiredGeneralTransverseTf,
      requiredGeneralAreaCm2,
      requiredFrictionTransverseTf,
      requiredFrictionAreaCm2,
      requiredTransverseAreaCm2,
      utilization: rcRequiredShearTf / rcDesignShearTf,
      ok: rcRequiredShearTf <= rcDesignShearTf + 1e-9,
    },
    ok: steelRequiredShearTf <= steelDesignShearTf + 1e-9 && rcRequiredShearTf <= rcDesignShearTf + 1e-9,
    completeSeismicDesign: false,
  };
}

function seismicStrongColumnWeakBeam(input) {
  const joint = input.strongColumnWeakBeam || {};
  if (joint.axis !== 'x') throw new SrcColumnOracleError('unsupported-strong-column-axis', 'Only one strong-axis joint frame plane is covered');
  if (joint.orthogonalBeamDirectionPresent !== false) throw new SrcColumnOracleError('orthogonal-frame-plane-not-covered', 'An orthogonal frame plane requires a separate check');
  requireOracleConfirmation(joint.columnStrengthsAtGoverningAxialLoadsConfirmed, 'column-strengths-not-confirmed', 'Column strengths at governing axial loads must be confirmed');
  requireOracleConfirmation(joint.jointFaceNominalStrengthsConfirmed, 'joint-face-strengths-not-confirmed', 'Joint-face nominal strengths must be confirmed');
  requireOracleConfirmation(joint.opposingMomentDirectionsConfirmed, 'moment-directions-not-confirmed', 'Opposing moment directions must be confirmed');
  const sourceCases = Array.isArray(joint.cases) ? joint.cases : [];
  if (sourceCases.length !== 2) throw new SrcColumnOracleError('two-direction-cases-required', 'Two strong-column loading senses are required');
  const senses = new Set();
  const cases = sourceCases.map((item, index) => {
    if (!['clockwise', 'counterclockwise'].includes(item.sense) || senses.has(item.sense)) {
      throw new SrcColumnOracleError('invalid-or-duplicate-sense', 'Exactly one clockwise and one counterclockwise case are required');
    }
    senses.add(item.sense);
    const columnSumTfM = positiveAt(item.upperColumnNominalTfM, `strongColumnWeakBeam.cases[${index}].upperColumnNominalTfM`)
      + positiveAt(item.lowerColumnNominalTfM, `strongColumnWeakBeam.cases[${index}].lowerColumnNominalTfM`);
    const beamSumTfM = positiveAt(item.leftBeamNominalTfM, `strongColumnWeakBeam.cases[${index}].leftBeamNominalTfM`)
      + positiveAt(item.rightBeamNominalTfM, `strongColumnWeakBeam.cases[${index}].rightBeamNominalTfM`);
    const ratio = columnSumTfM / beamSumTfM;
    return {
      sense: item.sense,
      columnSumTfM,
      beamSumTfM,
      requiredColumnSumTfM: 1.2 * beamSumTfM,
      ratio,
      utilization: 1.2 / ratio,
      ok: ratio + 1e-9 >= 1.2,
    };
  });
  const minimumRatio = Math.min(...cases.map(item => item.ratio));
  return {
    mode: 'strong-axis-joint-subcheck',
    clause: '9.6.1 / (9.6-1)',
    axis: 'x',
    requiredRatio: 1.2,
    cases,
    minimumRatio,
    utilization: 1.2 / minimumRatio,
    ok: cases.every(item => item.ok),
    completeFrameCheck: false,
  };
}

function seismicConfinement(input, shearResult) {
  const confinement = input.confinement || {};
  if (confinement.axis !== 'x') throw new SrcColumnOracleError('unsupported-confinement-axis', 'Only strong-axis confinement is covered');
  for (const [value, code, message] of [
    [confinement.highlyConfinedAreaConfirmed, 'highly-confined-area-not-confirmed', 'Ahcc must be confirmed'],
    [confinement.cornerLongitudinalBarsConfirmed, 'corner-bars-not-confirmed', 'Corner longitudinal bars must be confirmed'],
    [confinement.crosstiesProvidedAsNeededConfirmed, 'crossties-not-confirmed', 'Required crossties must be confirmed'],
    [confinement.crosstiesEngageLongitudinalBarsConfirmed, 'crosstie-engagement-not-confirmed', 'Crosstie engagement must be confirmed'],
    [confinement.crosstieHooksAlternatedConfirmed, 'crosstie-hooks-not-confirmed', 'Alternating hooks must be confirmed'],
  ]) requireOracleConfirmation(value, code, message);

  const concrete = input.concrete || {};
  const steel = input.steel || {};
  const reinforcement = input.reinforcement || {};
  const shear = input.shear || {};
  const width = positiveAt(concrete.widthCm, 'concrete.widthCm');
  const depth = positiveAt(concrete.depthCm, 'concrete.depthCm');
  const clearHeight = positiveAt(shear.clearHeightCm, 'shear.clearHeightCm');
  const coreWidth = positiveAt(confinement.coreWidthCm, 'confinement.coreWidthCm');
  const coreArea = positiveAt(confinement.coreAreaCm2, 'confinement.coreAreaCm2');
  const highlyConfinedArea = numberAt(confinement.highlyConfinedAreaCm2, 'confinement.highlyConfinedAreaCm2');
  if (highlyConfinedArea < 0 || highlyConfinedArea > 2500) throw new SrcColumnOracleError('invalid-highly-confined-area', 'Ahcc must be between 0 and 2500 cm2');
  const spacing = positiveAt(shear.spacingCm, 'shear.spacingCm');
  const providedAsh = positiveAt(shear.avCm2, 'shear.avCm2');
  const fyh = positiveAt(shear.fyhKgfCm2, 'shear.fyhKgfCm2');
  const steelArea = positiveAt(steel.areaCm2, 'steel.areaCm2');
  const reinforcementArea = (reinforcement.layers || []).reduce((sum, layer, index) => sum + positiveAt(layer.areaCm2, `reinforcement.layers[${index}].areaCm2`), 0);
  const fc = positiveAt(concrete.fcKgfCm2, 'concrete.fcKgfCm2');
  const fys = positiveAt(steel.fysKgfCm2, 'steel.fysKgfCm2');
  const fyr = positiveAt(reinforcement.fyKgfCm2, 'reinforcement.fyKgfCm2');
  const grossArea = width * depth;
  const concreteArea = grossArea - steelArea - reinforcementArea;
  if (!(coreArea < grossArea && coreWidth < Math.min(width, depth) && concreteArea > 0 && highlyConfinedArea <= concreteArea)) {
    throw new SrcColumnOracleError('invalid-confinement-geometry', 'Confinement geometry is outside the oracle scope');
  }
  const steelAxialKgf = steelArea * fys;
  const highlyConfinedAxialKgf = 0.2 * fc * highlyConfinedArea;
  const nominalAxialKgf = steelAxialKgf + 0.85 * fc * concreteArea + fyr * reinforcementArea;
  const reductionFactor = 1 - (steelAxialKgf + highlyConfinedAxialKgf) / nominalAxialKgf;
  if (!(reductionFactor > 0 && reductionFactor <= 1)) throw new SrcColumnOracleError('invalid-confinement-reduction', 'Confinement reduction is outside 0..1');
  const equation6Cm2 = 0.3 * spacing * coreWidth * (fc / fyh) * (grossArea / coreArea - 1) * reductionFactor;
  const equation7Cm2 = 0.09 * spacing * coreWidth * (fc / fyh) * reductionFactor;
  const shearRequiredCm2 = shearResult.rc.requiredTransverseAreaCm2;
  const requiredCm2 = Math.max(shearRequiredCm2, equation6Cm2, equation7Cm2);
  const minimumBarDiameter = positiveAt(confinement.minimumLongitudinalBarDiameterCm, 'confinement.minimumLongitudinalBarDiameterCm');
  const confinedLimit = Math.min(Math.min(width, depth) / 4, 15, 6 * minimumBarDiameter);
  const nonConfinedLimit = Math.min(15, 6 * minimumBarDiameter);
  const inflectionWithinMiddleHalf = booleanAt(confinement.inflectionPointWithinMiddleHalf, 'confinement.inflectionPointWithinMiddleHalf');
  const wholeLengthConfined = booleanAt(confinement.wholeLengthConfined, 'confinement.wholeLengthConfined');
  if (!inflectionWithinMiddleHalf && !wholeLengthConfined) throw new SrcColumnOracleError('whole-length-confinement-required', 'Full-height confinement is required');
  const requiredExtent = inflectionWithinMiddleHalf ? Math.max(depth, clearHeight / 6, 45) : clearHeight;
  const providedExtent = positiveAt(confinement.providedConfinementZoneHeightCm, 'confinement.providedConfinementZoneHeightCm');
  const firstHoopDistance = numberAt(confinement.firstHoopDistanceCm, 'confinement.firstHoopDistanceCm');
  if (firstHoopDistance < 0) throw new SrcColumnOracleError('negative-first-hoop-distance', 'First-hoop distance must be nonnegative');
  const nonConfinedSpacing = wholeLengthConfined ? null : positiveAt(confinement.nonConfinedSpacingCm, 'confinement.nonConfinedSpacingCm');
  const splicePresent = booleanAt(confinement.mainBarSplicePresent, 'confinement.mainBarSplicePresent');
  if (splicePresent) {
    requireOracleConfirmation(confinement.spliceWithinMiddleHalfConfirmed, 'splice-location-not-confirmed', 'Splice location must be confirmed');
    requireOracleConfirmation(confinement.tensionLapSpliceDesignedConfirmed, 'tension-lap-not-confirmed', 'Tension lap design must be confirmed');
    requireOracleConfirmation(confinement.confinementThroughSpliceConfirmed, 'splice-confinement-not-confirmed', 'Splice confinement must be confirmed');
    requireOracleConfirmation(confinement.alternateBarsSplicedOnlyConfirmed, 'alternate-splice-not-confirmed', 'Alternate bar splicing must be confirmed');
    if (positiveAt(confinement.spliceStaggerDistanceCm, 'confinement.spliceStaggerDistanceCm') < 60) throw new SrcColumnOracleError('splice-stagger-too-short', 'Splice stagger must be at least 60 cm');
  }
  const checks = {
    ash: providedAsh + 1e-9 >= requiredCm2,
    confinedSpacing: spacing <= confinedLimit + 1e-9,
    nonConfinedSpacing: nonConfinedSpacing == null || nonConfinedSpacing <= nonConfinedLimit + 1e-9,
    firstHoopDistance: firstHoopDistance <= spacing / 2 + 1e-9,
    confinementHeight: providedExtent + 1e-9 >= requiredExtent,
  };
  return {
    mode: 'strong-axis-rectangular-confinement-subcheck',
    axis: 'x',
    axialTerms: {
      grossAreaCm2: grossArea,
      concreteAreaCm2: concreteArea,
      steelAxialTf: steelAxialKgf / 1000,
      highlyConfinedAxialTf: highlyConfinedAxialKgf / 1000,
      nominalAxialTf: nominalAxialKgf / 1000,
      reductionFactor,
    },
    ash: {
      spacingCm: spacing,
      providedCm2: providedAsh,
      shearRequiredCm2,
      equation6Cm2,
      equation7Cm2,
      governingMode: shearRequiredCm2 >= equation6Cm2 && shearRequiredCm2 >= equation7Cm2
        ? 'shear-demand'
        : (equation6Cm2 >= equation7Cm2 ? 'equation-9.6-6' : 'equation-9.6-7'),
      requiredCm2,
      utilization: requiredCm2 / providedAsh,
      ok: checks.ash,
    },
    spacing: {
      confinedProvidedCm: spacing,
      confinedLimitCm: confinedLimit,
      nonConfinedProvidedCm: nonConfinedSpacing,
      nonConfinedLimitCm: nonConfinedLimit,
      firstHoopDistanceCm: firstHoopDistance,
      firstHoopLimitCm: spacing / 2,
    },
    extent: {
      inflectionPointWithinMiddleHalf: inflectionWithinMiddleHalf,
      wholeLengthConfined,
      providedCm: providedExtent,
      requiredCm: requiredExtent,
    },
    checks,
    ok: Object.values(checks).every(Boolean),
    completeSeismicDetailing: false,
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
  const shearRequested = input?.detailing?.seismicColumnShearSubcheck === true;
  const strongColumnRequested = input?.detailing?.seismicStrongColumnWeakBeamSubcheck === true;
  const confinementRequested = input?.detailing?.seismicConfinementSubcheck === true;
  const seismicSubcheckRequested = shearRequested || strongColumnRequested || confinementRequested;
  if (input?.detailing?.seismicDesign === true && !seismicSubcheckRequested) {
    throw new SrcColumnOracleError('seismic-scope-not-implemented', 'Seismic SRC column design is outside the oracle scope');
  }
  if (shearRequested && input?.detailing?.seismicDesign !== true) {
    throw new SrcColumnOracleError('seismic-shear-mode-required', 'The clause 9.6.2 shear subcheck requires seismicDesign=true');
  }
  if ((strongColumnRequested || confinementRequested) && input?.detailing?.seismicDesign !== true) {
    throw new SrcColumnOracleError('seismic-detailing-mode-required', 'Clauses 9.6.1 and 9.6.3 require seismicDesign=true');
  }
  if (confinementRequested && !shearRequested) {
    throw new SrcColumnOracleError('confinement-shear-demand-required', 'Confinement requires the calculated shear reinforcement demand');
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
  if (shearRequested && muy > 0) throw new SrcColumnOracleError('seismic-shear-strong-axis-only', 'The shear subcheck covers strong-axis uniaxial action only');
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
  const shear = shearRequested
    ? seismicStrongAxisShear(input, finalRcDemands.puTf, nominalMomentXTfM)
    : null;
  const strongColumnWeakBeam = strongColumnRequested ? seismicStrongColumnWeakBeam(input) : null;
  const confinement = confinementRequested ? seismicConfinement(input, shear) : null;

  return {
    oracleVersion: ORACLE_VERSION,
    supportedSchema: SUPPORTED_SCHEMA,
    coverage: {
      covered: ['table-3.4-2-compactness', 'stiffness-allocation', 'steel-compression', 'steel-biaxial-interaction', 'redistribution', 'rc-strain-compatibility-pm', 'rc-biaxial-interaction', 'seismic-strong-axis-column-shear-subcheck', 'seismic-strong-axis-joint-subcheck', 'seismic-strong-axis-confinement-subcheck'],
      uncovered: ['complete-seismic-design', 'weak-axis-shear', 'weak-axis-joint-and-confinement', 'clause-8.4.2-joint-force-transfer'],
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
    shear,
    strongColumnWeakBeam,
    confinement,
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
  rcProbableMomentTfM,
  seismicStrongAxisShear,
  seismicStrongColumnWeakBeam,
  seismicConfinement,
  calculate,
};
