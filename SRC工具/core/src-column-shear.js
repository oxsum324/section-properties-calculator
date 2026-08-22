/* SRC column seismic strong-axis shear research subcheck.
 *
 * Scope: current Taiwan SRC clauses 9.6.2 and 5.5 for a fully encased,
 * centered H-shape. Only strong-axis shear resisted by the steel web is
 * included. The RC residual section is limited to normal-weight concrete,
 * a monolithic shear-friction plane, perpendicular closed transverse
 * reinforcement, and zero shear-stud contribution.
 *
 * Units: cm, cm2, kgf/cm2, tf, tf-m.
 */
(function initSrcColumnShear(globalObject, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (globalObject) globalObject.SrcColumnShear = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildSrcColumnShear() {
  'use strict';

  const VERSION = 'src-column.shear.v0.2.0-research';
  const PHI_STEEL = 0.9;
  const PHI_RC = 0.75;
  const ZERO_TOLERANCE = 1e-9;

  class SrcColumnShearError extends Error {
    constructor(code, path, message) {
      super(message);
      this.name = 'SrcColumnShearError';
      this.code = code;
      this.path = path;
    }
  }

  function finite(value, path) {
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      throw new SrcColumnShearError('finite-number-required', path, `${path} must be finite`);
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new SrcColumnShearError('finite-number-required', path, `${path} must be finite`);
    }
    return number;
  }

  function positive(value, path) {
    const number = finite(value, path);
    if (!(number > 0)) {
      throw new SrcColumnShearError('positive-number-required', path, `${path} must be positive`);
    }
    return number;
  }

  function nonnegative(value, path) {
    const number = finite(value, path);
    if (number < 0) {
      throw new SrcColumnShearError('nonnegative-number-required', path, `${path} must be nonnegative`);
    }
    return number;
  }

  function requireConfirmed(value, path, message) {
    if (value !== true) throw new SrcColumnShearError('confirmation-required', path, message);
  }

  function columnDemandShear(mctTfM, mcbTfM, clearHeightCm) {
    const mct = nonnegative(mctTfM, 'mctTfM');
    const mcb = nonnegative(mcbTfM, 'mcbTfM');
    const height = positive(clearHeightCm, 'clearHeightCm');
    if (!(mct + mcb > 0)) {
      throw new SrcColumnShearError('probable-end-moment-required', 'mctTfM', 'At least one probable column-end moment must be positive');
    }
    return (mct + mcb) * 100 / height;
  }

  function steelNominalShear(fywKgfCm2, webThicknessCm, steelDepthCm) {
    const fyw = positive(fywKgfCm2, 'steelFywKgfCm2');
    const tw = positive(webThicknessCm, 'steelWebThicknessCm');
    const depth = positive(steelDepthCm, 'steelDepthCm');
    const webAreaCm2 = tw * depth;
    const nominalShearTf = 0.6 * fyw * webAreaCm2 / 1000;
    return { webAreaCm2, nominalShearTf, designShearTf: PHI_STEEL * nominalShearTf };
  }

  function rcNominalShear(input) {
    const width = positive(input.widthCm, 'widthCm');
    const depth = positive(input.depthCm, 'depthCm');
    const effectiveDepth = positive(input.effectiveDepthCm, 'effectiveDepthCm');
    if (!(effectiveDepth < depth)) {
      throw new SrcColumnShearError('effective-depth-outside-section', 'effectiveDepthCm', 'effectiveDepthCm must lie inside the concrete section');
    }
    const fc = positive(input.fcKgfCm2, 'fcKgfCm2');
    const purc = nonnegative(input.rcAxialDemandTf, 'rcAxialDemandTf');
    const av = positive(input.avCm2, 'avCm2');
    const avf = positive(input.avfCm2, 'avfCm2');
    const spacing = positive(input.spacingCm, 'spacingCm');
    const fyh = positive(input.fyhKgfCm2, 'fyhKgfCm2');
    const flangeWidth = positive(input.steelFlangeWidthCm, 'steelFlangeWidthCm');
    if (!(flangeWidth < width)) {
      throw new SrcColumnShearError('invalid-net-concrete-width', 'steelFlangeWidthCm', 'Steel flange width must be smaller than the concrete section width');
    }
    const mu = positive(input.frictionCoefficient, 'frictionCoefficient');
    const k1 = positive(input.frictionK1KgfCm2, 'frictionK1KgfCm2');
    const studContributionTf = nonnegative(input.shearStudContributionTf, 'shearStudContributionTf');
    if (studContributionTf > ZERO_TOLERANCE) {
      throw new SrcColumnShearError('shear-stud-scope-not-implemented', 'shearStudContributionTf', 'Shear-stud contribution is outside this research subcheck');
    }

    const grossAreaCm2 = width * depth;
    const sqrtFc = Math.sqrt(fc);
    const transverseLimitTf = 2.12 * sqrtFc * width * effectiveDepth / 1000;
    const rawTransverseTf = av * fyh * effectiveDepth / spacing / 1000;
    const transverseTf = Math.min(rawTransverseTf, transverseLimitTf);
    const concreteFactor = 1 + purc * 1000 / (140 * grossAreaCm2);
    const concreteTf = 0.53 * concreteFactor * sqrtFc * width * effectiveDepth / 1000;
    const generalTf = transverseTf + concreteTf;

    const frictionTransverseLimitTf = mu * transverseLimitTf;
    const rawFrictionTransverseTf = mu * avf * fyh * effectiveDepth / spacing / 1000;
    const frictionTransverseTf = Math.min(rawFrictionTransverseTf, frictionTransverseLimitTf);
    const netConcreteWidthCm = width - flangeWidth;
    const frictionConcreteTf = k1 * netConcreteWidthCm * effectiveDepth / 1000;
    const frictionTf = frictionTransverseTf + frictionConcreteTf + studContributionTf;
    const nominalShearTf = Math.min(generalTf, frictionTf);

    return {
      grossAreaCm2,
      effectiveDepthCm: effectiveDepth,
      transverseLimitTf,
      rawTransverseTf,
      transverseTf,
      concreteFactor,
      concreteTf,
      generalTf,
      frictionCoefficient: mu,
      frictionK1KgfCm2: k1,
      frictionTransverseLimitTf,
      rawFrictionTransverseTf,
      frictionTransverseTf,
      netConcreteWidthCm,
      frictionConcreteTf,
      shearStudContributionTf: studContributionTf,
      frictionTf,
      governingMode: generalTf <= frictionTf ? 'general-shear' : 'shear-friction',
      nominalShearTf,
      designShearTf: PHI_RC * nominalShearTf,
    };
  }

  function calculate(input) {
    if (!input || typeof input !== 'object') {
      throw new SrcColumnShearError('input-required', 'input', 'A shear input object is required');
    }
    if (input.axis !== 'x') {
      throw new SrcColumnShearError('unsupported-shear-axis', 'axis', 'Only strong-axis x shear is implemented');
    }
    requireConfirmed(input.projectPlasticHingeMomentsConfirmed, 'projectPlasticHingeMomentsConfirmed', 'Project plastic-hinge end moments must be confirmed');
    requireConfirmed(input.normalWeightConcreteConfirmed, 'normalWeightConcreteConfirmed', 'Normal-weight concrete must be confirmed');
    requireConfirmed(input.monolithicInterfaceConfirmed, 'monolithicInterfaceConfirmed', 'A monolithic shear-friction plane must be confirmed');
    requireConfirmed(input.transverseReinforcementPerpendicularConfirmed, 'transverseReinforcementPerpendicularConfirmed', 'Perpendicular closed transverse reinforcement must be confirmed');

    const steelNominalMomentTfM = positive(input.steelNominalMomentTfM, 'steelNominalMomentTfM');
    const rcProbableMomentTfM = positive(input.rcProbableMomentTfM, 'rcProbableMomentTfM');
    const probableMomentTfM = steelNominalMomentTfM + rcProbableMomentTfM;
    const demandShearTf = columnDemandShear(input.mctTfM, input.mcbTfM, input.clearHeightCm);
    const steelRequiredTf = steelNominalMomentTfM / probableMomentTfM * demandShearTf;
    const rcRequiredTf = rcProbableMomentTfM / probableMomentTfM * demandShearTf;
    const steel = steelNominalShear(input.steelFywKgfCm2, input.steelWebThicknessCm, input.steelDepthCm);
    const rc = rcNominalShear(input);
    const steelUtilization = steelRequiredTf / steel.designShearTf;
    const rcUtilization = rcRequiredTf / rc.designShearTf;
    const requiredNominalRcShearTf = rcRequiredTf / PHI_RC;
    const requiredGeneralTransverseTf = Math.max(0, requiredNominalRcShearTf - rc.concreteTf);
    const requiredGeneralAreaCm2 = requiredGeneralTransverseTf * 1000 * Number(input.spacingCm)
      / (Number(input.fyhKgfCm2) * Number(input.effectiveDepthCm));
    const requiredFrictionTransverseTf = Math.max(0, requiredNominalRcShearTf - rc.frictionConcreteTf - rc.shearStudContributionTf);
    const requiredFrictionAreaCm2 = requiredFrictionTransverseTf * 1000 * Number(input.spacingCm)
      / (rc.frictionCoefficient * Number(input.fyhKgfCm2) * Number(input.effectiveDepthCm));
    const requiredTransverseAreaCm2 = Math.max(requiredGeneralAreaCm2, requiredFrictionAreaCm2);

    return {
      version: VERSION,
      mode: 'seismic-strong-axis-subcheck',
      axis: 'x',
      clauses: ['9.6.2 / (9.6-3)~(9.6-5)', '5.5.1 / (5.5-3)', '5.5.2 / (5.5-4)~(5.5-13)'],
      demand: {
        mctTfM: Number(input.mctTfM),
        mcbTfM: Number(input.mcbTfM),
        clearHeightCm: Number(input.clearHeightCm),
        shearTf: demandShearTf,
      },
      probableMoments: {
        steelNominalMomentTfM,
        rcProbableMomentTfM,
        totalTfM: probableMomentTfM,
        steelShare: steelNominalMomentTfM / probableMomentTfM,
        rcShare: rcProbableMomentTfM / probableMomentTfM,
      },
      steel: {
        ...steel,
        requiredShearTf: steelRequiredTf,
        utilization: steelUtilization,
        ok: steelUtilization <= 1 + ZERO_TOLERANCE,
      },
      rc: {
        ...rc,
        axialDemandTf: Number(input.rcAxialDemandTf),
        requiredShearTf: rcRequiredTf,
        requiredNominalShearTf: requiredNominalRcShearTf,
        requiredGeneralTransverseTf,
        requiredGeneralAreaCm2,
        requiredFrictionTransverseTf,
        requiredFrictionAreaCm2,
        requiredTransverseAreaCm2,
        utilization: rcUtilization,
        ok: rcUtilization <= 1 + ZERO_TOLERANCE,
      },
      ok: steelUtilization <= 1 + ZERO_TOLERANCE && rcUtilization <= 1 + ZERO_TOLERANCE,
      completeSeismicDesign: false,
      boundary: 'This result covers only the current-code strong-axis column shear subcheck; any requested strong-column/weak-beam and confinement results are returned separately, while complete frame, joint, base, weak-axis, and remaining seismic design stay outside this subcheck.',
    };
  }

  return {
    VERSION,
    PHI_STEEL,
    PHI_RC,
    SrcColumnShearError,
    columnDemandShear,
    steelNominalShear,
    rcNominalShear,
    calculate,
  };
});
