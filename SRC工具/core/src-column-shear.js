/* SRC column seismic selected-axis shear research subcheck.
 *
 * Scope: current Taiwan SRC clauses 9.6.2 and 5.5 for a fully encased,
 * centered H-shape. The strong-axis path computes steel-web and RC strength.
 * The weak-axis path never rotates the clause 5.5.1 web formula. Steel strength
 * is either project-confirmed or, when the project explicitly adopts it,
 * calculated by ANSI/AISC 360-22 G6 for weak-axis shear without torsion. The RC
 * part offers either an automatic direction-aware clause 5.5.2 path or legacy
 * project-confirmed values.
 * The automatic RC path is limited to normal-weight concrete,
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

  const VERSION = 'src-column.shear.v1.0.0';
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

  function selectedAxis(value) {
    if (value !== 'x' && value !== 'y') {
      throw new SrcColumnShearError('unsupported-shear-axis', 'axis', 'axis must be x or y');
    }
    return value;
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

  function weakAxisSteelNominalShear(input) {
    const fy = positive(input.steelFysKgfCm2, 'steelFysKgfCm2');
    const modulus = positive(input.steelEsKgfCm2, 'steelEsKgfCm2');
    const flangeWidth = positive(input.steelFlangeWidthCm, 'steelFlangeWidthCm');
    const flangeThickness = positive(input.steelFlangeThicknessCm, 'steelFlangeThicknessCm');
    const kv = 1.2;
    const flangeSlenderness = flangeWidth / (2 * flangeThickness);
    const elasticRoot = Math.sqrt(kv * modulus / fy);
    const yieldingLimit = 1.10 * elasticRoot;
    const inelasticLimit = 1.37 * elasticRoot;
    let cv2;
    let cv2Equation;
    if (flangeSlenderness <= yieldingLimit) {
      cv2 = 1;
      cv2Equation = 'G2-9';
    } else if (flangeSlenderness <= inelasticLimit) {
      cv2 = yieldingLimit / flangeSlenderness;
      cv2Equation = 'G2-10';
    } else {
      cv2 = 1.51 * kv * modulus / (flangeSlenderness ** 2 * fy);
      cv2Equation = 'G2-11';
    }
    const shearAreaCm2 = 2 * flangeWidth * flangeThickness;
    const nominalShearTf = 0.6 * fy * shearAreaCm2 * cv2 / 1000;
    return {
      source: 'project-specified-aisc-360-g6',
      standard: 'ANSI/AISC 360-22',
      clause: 'G6 / (G6-1); Cv2 from G2.2',
      noTorsion: true,
      fyKgfCm2: fy,
      modulusKgfCm2: modulus,
      flangeWidthCm: flangeWidth,
      flangeThicknessCm: flangeThickness,
      kv,
      flangeSlenderness,
      yieldingLimit,
      inelasticLimit,
      cv2,
      cv2Equation,
      shearAreaCm2,
      nominalShearTf,
      designShearTf: PHI_STEEL * nominalShearTf,
      governingMode: cv2Equation === 'G2-9' ? 'flange-shear-yielding' : 'flange-shear-buckling',
    };
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
    const steelFrictionPlaneWidth = positive(
      input.steelFrictionPlaneWidthCm ?? input.steelFlangeWidthCm,
      input.steelFrictionPlaneWidthCm == null ? 'steelFlangeWidthCm' : 'steelFrictionPlaneWidthCm'
    );
    if (!(steelFrictionPlaneWidth < width)) {
      throw new SrcColumnShearError('invalid-net-concrete-width', 'steelFrictionPlaneWidthCm', 'Steel width deducted from the friction plane must be smaller than the selected concrete width');
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
    const netConcreteWidthCm = width - steelFrictionPlaneWidth;
    const frictionConcreteTf = k1 * netConcreteWidthCm * effectiveDepth / 1000;
    const frictionTf = frictionTransverseTf + frictionConcreteTf + studContributionTf;
    const nominalShearTf = Math.min(generalTf, frictionTf);

    return {
      grossAreaCm2,
      sectionWidthCm: width,
      sectionDepthCm: depth,
      effectiveDepthCm: effectiveDepth,
      avCm2: av,
      avfCm2: avf,
      spacingCm: spacing,
      fyhKgfCm2: fyh,
      steelFrictionPlaneWidthCm: steelFrictionPlaneWidth,
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
    const axis = selectedAxis(input.axis);
    requireConfirmed(input.projectPlasticHingeMomentsConfirmed, 'projectPlasticHingeMomentsConfirmed', 'Project plastic-hinge end moments must be confirmed');
    const weakAxisRcDesignBasis = axis === 'y'
      ? (input.weakAxisRcDesignBasis || 'project-confirmed')
      : 'automatic-clause-5.5.2';
    const weakAxisSteelDesignBasis = axis === 'y'
      ? (input.weakAxisSteelDesignBasis || 'project-confirmed')
      : 'automatic-clause-5.5.1';
    if (axis === 'y' && !['automatic-clause-5.5.2', 'project-confirmed'].includes(weakAxisRcDesignBasis)) {
      throw new SrcColumnShearError('unsupported-weak-axis-rc-design-basis', 'weakAxisRcDesignBasis', 'Weak-axis RC design basis must be automatic-clause-5.5.2 or project-confirmed');
    }
    if (axis === 'y' && !['project-confirmed', 'project-specified-aisc-360-g6'].includes(weakAxisSteelDesignBasis)) {
      throw new SrcColumnShearError('unsupported-weak-axis-steel-design-basis', 'weakAxisSteelDesignBasis', 'Weak-axis steel design basis must be project-confirmed or project-specified-aisc-360-g6');
    }
    if (axis === 'x' || weakAxisRcDesignBasis === 'automatic-clause-5.5.2') {
      requireConfirmed(input.normalWeightConcreteConfirmed, 'normalWeightConcreteConfirmed', 'Normal-weight concrete must be confirmed');
      requireConfirmed(input.monolithicInterfaceConfirmed, 'monolithicInterfaceConfirmed', 'A monolithic shear-friction plane must be confirmed');
      requireConfirmed(input.transverseReinforcementPerpendicularConfirmed, 'transverseReinforcementPerpendicularConfirmed', 'Perpendicular closed transverse reinforcement must be confirmed');
    }
    if (axis === 'y' && weakAxisSteelDesignBasis === 'project-confirmed') {
      requireConfirmed(input.weakAxisStrengthsConfirmed, 'weakAxisStrengthsConfirmed', 'Weak-axis nominal steel shear strength must be confirmed by the project');
    }
    if (axis === 'y' && weakAxisSteelDesignBasis === 'project-specified-aisc-360-g6') {
      requireConfirmed(input.weakAxisAiscG6ApplicabilityConfirmed, 'weakAxisAiscG6ApplicabilityConfirmed', 'Project adoption of ANSI/AISC 360-22 G6 and weak-axis shear without torsion must be confirmed');
    }
    if (axis === 'y' && weakAxisRcDesignBasis === 'project-confirmed') {
      requireConfirmed(input.weakAxisRcStrengthConfirmed ?? input.weakAxisStrengthsConfirmed, 'weakAxisRcStrengthConfirmed', 'Weak-axis nominal RC shear strength must be confirmed by the project');
      requireConfirmed(input.weakAxisRequiredTransverseAreaConfirmed, 'weakAxisRequiredTransverseAreaConfirmed', 'Weak-axis required transverse-reinforcement area must be confirmed by the project');
    }

    const steelNominalMomentTfM = positive(input.steelNominalMomentTfM, 'steelNominalMomentTfM');
    const rcProbableMomentTfM = positive(input.rcProbableMomentTfM, 'rcProbableMomentTfM');
    const probableMomentTfM = steelNominalMomentTfM + rcProbableMomentTfM;
    const demandShearTf = columnDemandShear(input.mctTfM, input.mcbTfM, input.clearHeightCm);
    const steelRequiredTf = steelNominalMomentTfM / probableMomentTfM * demandShearTf;
    const rcRequiredTf = rcProbableMomentTfM / probableMomentTfM * demandShearTf;
    let steel;
    if (axis === 'x') {
      steel = steelNominalShear(input.steelFywKgfCm2, input.steelWebThicknessCm, input.steelDepthCm);
    } else if (weakAxisSteelDesignBasis === 'project-specified-aisc-360-g6') {
      steel = weakAxisSteelNominalShear(input);
    } else {
      const nominalShearTf = positive(input.weakAxisSteelNominalShearTf, 'weakAxisSteelNominalShearTf');
      steel = {
        source: 'project-confirmed-weak-axis',
        nominalShearTf,
        designShearTf: PHI_STEEL * nominalShearTf,
      };
    }
    const automaticRc = axis === 'x' || weakAxisRcDesignBasis === 'automatic-clause-5.5.2';
    const rcInput = axis === 'x'
      ? input
      : {
        ...input,
        widthCm: input.depthCm,
        depthCm: input.widthCm,
        effectiveDepthCm: input.weakAxisEffectiveDepthCm,
        avCm2: input.weakAxisAvCm2,
        avfCm2: input.weakAxisAvfCm2,
        steelFrictionPlaneWidthCm: input.steelDepthCm,
        shearStudContributionTf: 0,
      };
    const rc = automaticRc
      ? { ...rcNominalShear(rcInput), source: axis === 'y' ? 'automatic-clause-5.5.2-selected-y-axis' : 'automatic-clause-5.5.2-selected-x-axis' }
      : {
        source: 'project-confirmed-weak-axis',
        nominalShearTf: positive(input.weakAxisRcNominalShearTf, 'weakAxisRcNominalShearTf'),
      };
    if (!automaticRc) rc.designShearTf = PHI_RC * rc.nominalShearTf;
    const steelUtilization = steelRequiredTf / steel.designShearTf;
    const rcUtilization = rcRequiredTf / rc.designShearTf;
    const requiredNominalRcShearTf = rcRequiredTf / PHI_RC;
    const requiredGeneralTransverseTf = automaticRc ? Math.max(0, requiredNominalRcShearTf - rc.concreteTf) : null;
    const requiredGeneralAreaCm2 = automaticRc
      ? requiredGeneralTransverseTf * 1000 * Number(input.spacingCm)
        / (Number(input.fyhKgfCm2) * Number(rc.effectiveDepthCm))
      : null;
    const requiredFrictionTransverseTf = automaticRc
      ? Math.max(0, requiredNominalRcShearTf - rc.frictionConcreteTf - rc.shearStudContributionTf)
      : null;
    const requiredFrictionAreaCm2 = automaticRc
      ? requiredFrictionTransverseTf * 1000 * Number(input.spacingCm)
        / (rc.frictionCoefficient * Number(input.fyhKgfCm2) * Number(rc.effectiveDepthCm))
      : null;
    const requiredTransverseAreaCm2 = automaticRc
      ? Math.max(requiredGeneralAreaCm2, requiredFrictionAreaCm2)
      : nonnegative(input.weakAxisRequiredTransverseAreaCm2, 'weakAxisRequiredTransverseAreaCm2');

    return {
      version: VERSION,
      mode: 'seismic-selected-axis-subcheck',
      axis,
      weakAxisSteelDesignBasis: axis === 'y' ? weakAxisSteelDesignBasis : null,
      weakAxisRcDesignBasis: axis === 'y' ? weakAxisRcDesignBasis : null,
      strengthSource: axis === 'x'
        ? 'automatic-clause-5.5'
        : `${weakAxisSteelDesignBasis}+${automaticRc ? 'automatic-rc-clause-5.5.2' : 'project-confirmed-rc'}`,
      clauses: axis === 'x'
        ? ['9.6.2 / (9.6-3)~(9.6-5)', '5.5.1 / (5.5-3)', '5.5.2 / (5.5-4)~(5.5-13)']
        : [
          '9.6.2 / (9.6-3)~(9.6-5)',
          weakAxisSteelDesignBasis === 'project-specified-aisc-360-g6'
            ? 'project-specified ANSI/AISC 360-22 G6 / (G6-1), Cv2 from G2.2'
            : 'project-confirmed weak-axis steel strength under applicable steel provisions',
          automaticRc
            ? '5.5.2 / (5.5-4)~(5.5-13) selected-y-axis RC path'
            : 'project-confirmed weak-axis RC strength under applicable RC provisions',
        ],
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
        governingMode: automaticRc ? rc.governingMode : 'project-confirmed-weak-axis',
        utilization: rcUtilization,
        ok: rcUtilization <= 1 + ZERO_TOLERANCE,
      },
      ok: steelUtilization <= 1 + ZERO_TOLERANCE && rcUtilization <= 1 + ZERO_TOLERANCE,
      completeSeismicDesign: false,
      boundary: axis === 'x'
        ? 'This result covers the selected x-axis column shear subcheck using the current-code steel-web and RC paths; complete frame, joint, base, orthogonal-direction, and remaining seismic design stay outside this subcheck.'
        : `This result covers selected y-axis demand, probable-moment allocation, ${weakAxisSteelDesignBasis === 'project-specified-aisc-360-g6' ? 'project-specified ANSI/AISC 360-22 G6 steel weak-axis shear without torsion' : 'project-confirmed steel weak-axis strength'}, and ${automaticRc ? 'direction-aware clause 5.5.2 RC shear' : 'project-confirmed RC strength and transverse-reinforcement demand'}; it does not rotate the Taiwan SRC clause 5.5.1 web formula, and the orthogonal direction remains a separate check.`,
    };
  }

  return {
    VERSION,
    PHI_STEEL,
    PHI_RC,
    SrcColumnShearError,
    columnDemandShear,
    steelNominalShear,
    weakAxisSteelNominalShear,
    rcNominalShear,
    selectedAxis,
    calculate,
  };
});
