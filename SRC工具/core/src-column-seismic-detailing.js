/* SRC column current-code seismic detailing research subchecks.
 *
 * Scope: clause 8.4.2 joint flexural-strength ratios, clause 9.6.1
 * strong-column/weak-beam arithmetic for one strong-axis frame plane, and
 * clause 9.6.3 confinement quantity, extent, spacing,
 * splice, corner-bar, and crosstie checks for a fully encased rectangular
 * SRC column. Adjacent-member nominal strengths remain project inputs.
 *
 * Units: cm, cm2, kgf/cm2, tf, tf-m.
 */
(function initSrcColumnSeismicDetailing(globalObject, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (globalObject) globalObject.SrcColumnSeismicDetailing = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildSrcColumnSeismicDetailing() {
  'use strict';

  const VERSION = 'src-column.seismic-detailing.v0.2.0-research';
  const SRC_JOINT_STEEL_RATIO = 0.6;
  const SRC_JOINT_RC_RATIO = 0.6;
  const STEEL_BEAM_JOINT_RATIO = 1.0;
  const VERIFIED_TRANSFER_JOINT_RATIO = 0.7;
  const STRONG_COLUMN_RATIO = 1.2;
  const ZERO_TOLERANCE = 1e-9;

  class SrcColumnSeismicDetailingError extends Error {
    constructor(code, path, message) {
      super(message);
      this.name = 'SrcColumnSeismicDetailingError';
      this.code = code;
      this.path = path;
    }
  }

  function finite(value, path) {
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      throw new SrcColumnSeismicDetailingError('finite-number-required', path, `${path} must be finite`);
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new SrcColumnSeismicDetailingError('finite-number-required', path, `${path} must be finite`);
    }
    return number;
  }

  function positive(value, path) {
    const number = finite(value, path);
    if (!(number > 0)) throw new SrcColumnSeismicDetailingError('positive-number-required', path, `${path} must be positive`);
    return number;
  }

  function nonnegative(value, path) {
    const number = finite(value, path);
    if (number < 0) throw new SrcColumnSeismicDetailingError('nonnegative-number-required', path, `${path} must be nonnegative`);
    return number;
  }

  function requireConfirmed(value, path, message) {
    if (value !== true) throw new SrcColumnSeismicDetailingError('confirmation-required', path, message);
  }

  function booleanAt(value, path) {
    if (value !== true && value !== false) {
      throw new SrcColumnSeismicDetailingError('boolean-required', path, `${path} must be explicitly true or false`);
    }
    return value;
  }

  function jointFlexuralStrengthRatio(input) {
    if (!input || typeof input !== 'object') {
      throw new SrcColumnSeismicDetailingError('input-required', 'jointFlexuralStrengthRatio', 'A clause 8.4.2 joint input object is required');
    }
    if (input.axis !== 'x') {
      throw new SrcColumnSeismicDetailingError('unsupported-joint-ratio-axis', 'axis', 'Only one strong-axis x frame plane is covered');
    }
    const connectionType = String(input.connectionType || '');
    if (!['src-beam-src-column', 'steel-beam-src-column'].includes(connectionType)) {
      throw new SrcColumnSeismicDetailingError('unsupported-joint-connection-type', 'connectionType', 'Clause 8.4.2 requires an explicit SRC-beam/SRC-column or steel-beam/SRC-column connection type');
    }
    requireConfirmed(input.jointFaceNominalStrengthsConfirmed, 'jointFaceNominalStrengthsConfirmed', 'All component moments must be nominal strengths at the joint faces');
    requireConfirmed(input.allConnectedMembersIncludedConfirmed, 'allConnectedMembersIncludedConfirmed', 'The sums must include every beam and column connected at the joint in the checked frame plane');
    requireConfirmed(input.componentStrengthsSeparatedConfirmed, 'componentStrengthsSeparatedConfirmed', 'Steel and reinforced-concrete component strengths must be separated without double counting');

    const useVerifiedAlternative = booleanAt(input.useVerifiedSmoothTransferAlternative, 'useVerifiedSmoothTransferAlternative');
    if (connectionType === 'src-beam-src-column' && useVerifiedAlternative) {
      throw new SrcColumnSeismicDetailingError('smooth-transfer-alternative-not-applicable', 'useVerifiedSmoothTransferAlternative', 'Equation (8.4-4) applies only to a steel beam connected to an SRC column');
    }
    if (useVerifiedAlternative) {
      requireConfirmed(input.smoothStressTransferAnalysisConfirmed, 'smoothStressTransferAnalysisConfirmed', 'Equation (8.4-4) requires project analysis confirming smooth transfer of steel-beam stress into the SRC column');
    }
    const steelRequiredRatio = connectionType === 'src-beam-src-column'
      ? SRC_JOINT_STEEL_RATIO
      : (useVerifiedAlternative ? VERIFIED_TRANSFER_JOINT_RATIO : STEEL_BEAM_JOINT_RATIO);

    const cases = Array.isArray(input.cases) ? input.cases : [];
    if (cases.length !== 2) {
      throw new SrcColumnSeismicDetailingError('two-direction-cases-required', 'cases', 'Clockwise and counterclockwise component-strength cases are both required');
    }
    const requiredSenses = new Set(['clockwise', 'counterclockwise']);
    const seen = new Set();
    const results = cases.map((item, index) => {
      const sense = item && item.sense;
      if (!requiredSenses.has(sense) || seen.has(sense)) {
        throw new SrcColumnSeismicDetailingError('invalid-or-duplicate-sense', `cases[${index}].sense`, 'Exactly one clockwise and one counterclockwise case are required');
      }
      seen.add(sense);
      const steelColumnSumTfM = positive(item.steelColumnSumTfM, `cases[${index}].steelColumnSumTfM`);
      const steelBeamSumTfM = positive(item.steelBeamSumTfM, `cases[${index}].steelBeamSumTfM`);
      const steelRatio = steelColumnSumTfM / steelBeamSumTfM;
      const steel = {
        columnSumTfM: steelColumnSumTfM,
        beamSumTfM: steelBeamSumTfM,
        requiredRatio: steelRequiredRatio,
        requiredColumnSumTfM: steelRequiredRatio * steelBeamSumTfM,
        ratio: steelRatio,
        utilization: steelRequiredRatio / steelRatio,
        ok: steelRatio + ZERO_TOLERANCE >= steelRequiredRatio,
      };
      let rc = null;
      if (connectionType === 'src-beam-src-column') {
        const rcColumnSumTfM = positive(item.rcColumnSumTfM, `cases[${index}].rcColumnSumTfM`);
        const rcBeamSumTfM = positive(item.rcBeamSumTfM, `cases[${index}].rcBeamSumTfM`);
        const rcRatio = rcColumnSumTfM / rcBeamSumTfM;
        rc = {
          columnSumTfM: rcColumnSumTfM,
          beamSumTfM: rcBeamSumTfM,
          requiredRatio: SRC_JOINT_RC_RATIO,
          requiredColumnSumTfM: SRC_JOINT_RC_RATIO * rcBeamSumTfM,
          ratio: rcRatio,
          utilization: SRC_JOINT_RC_RATIO / rcRatio,
          ok: rcRatio + ZERO_TOLERANCE >= SRC_JOINT_RC_RATIO,
        };
      }
      return { sense, steel, rc, ok: steel.ok && (!rc || rc.ok) };
    });
    const componentResults = results.flatMap(item => [item.steel, item.rc].filter(Boolean));
    return {
      version: VERSION,
      mode: 'strong-axis-joint-flexural-strength-ratio-subcheck',
      clauses: connectionType === 'src-beam-src-column'
        ? ['8.4.2 / (8.4-1)', '8.4.2 / (8.4-2)']
        : [useVerifiedAlternative ? '8.4.2 / (8.4-4)' : '8.4.2 / (8.4-3)'],
      axis: 'x',
      connectionType,
      useVerifiedSmoothTransferAlternative: useVerifiedAlternative,
      requiredRatios: { steel: steelRequiredRatio, rc: connectionType === 'src-beam-src-column' ? SRC_JOINT_RC_RATIO : null },
      cases: results,
      maximumUtilization: Math.max(...componentResults.map(item => item.utilization)),
      minimumRatio: Math.min(...componentResults.map(item => item.ratio)),
      ok: results.every(item => item.ok),
      completeJointDesign: false,
      boundary: 'This result covers clause 8.4.2 component flexural-strength ratios for one strong-axis joint frame plane only; connection hardware, panel-zone shear, anchorage, orthogonal direction, and every other joint require separate verified paths.',
    };
  }

  function strongColumnWeakBeam(input) {
    if (!input || typeof input !== 'object') {
      throw new SrcColumnSeismicDetailingError('input-required', 'strongColumnWeakBeam', 'A strong-column/weak-beam input object is required');
    }
    if (input.axis !== 'x') {
      throw new SrcColumnSeismicDetailingError('unsupported-strong-column-axis', 'axis', 'Only one strong-axis x frame plane is covered');
    }
    if (input.orthogonalBeamDirectionPresent !== false) {
      throw new SrcColumnSeismicDetailingError('orthogonal-frame-plane-not-covered', 'orthogonalBeamDirectionPresent', 'An orthogonal beam direction requires a separate weak-axis check');
    }
    requireConfirmed(input.columnStrengthsAtGoverningAxialLoadsConfirmed, 'columnStrengthsAtGoverningAxialLoadsConfirmed', 'Column nominal moments must use the minimum strength from governing axial-load combinations');
    requireConfirmed(input.jointFaceNominalStrengthsConfirmed, 'jointFaceNominalStrengthsConfirmed', 'All column and beam moments must be nominal strengths at the joint faces');
    requireConfirmed(input.opposingMomentDirectionsConfirmed, 'opposingMomentDirectionsConfirmed', 'Beam and column moment sums must act in opposing directions in the frame plane');

    const cases = Array.isArray(input.cases) ? input.cases : [];
    if (cases.length !== 2) {
      throw new SrcColumnSeismicDetailingError('two-direction-cases-required', 'cases', 'Clockwise and counterclockwise cases are both required');
    }
    const requiredSenses = new Set(['clockwise', 'counterclockwise']);
    const seen = new Set();
    const results = cases.map((item, index) => {
      const sense = item && item.sense;
      if (!requiredSenses.has(sense) || seen.has(sense)) {
        throw new SrcColumnSeismicDetailingError('invalid-or-duplicate-sense', `cases[${index}].sense`, 'Exactly one clockwise and one counterclockwise case are required');
      }
      seen.add(sense);
      const upperColumn = positive(item.upperColumnNominalTfM, `cases[${index}].upperColumnNominalTfM`);
      const lowerColumn = positive(item.lowerColumnNominalTfM, `cases[${index}].lowerColumnNominalTfM`);
      const leftBeam = positive(item.leftBeamNominalTfM, `cases[${index}].leftBeamNominalTfM`);
      const rightBeam = positive(item.rightBeamNominalTfM, `cases[${index}].rightBeamNominalTfM`);
      const columnSumTfM = upperColumn + lowerColumn;
      const beamSumTfM = leftBeam + rightBeam;
      const ratio = columnSumTfM / beamSumTfM;
      return {
        sense,
        columnSumTfM,
        beamSumTfM,
        requiredColumnSumTfM: STRONG_COLUMN_RATIO * beamSumTfM,
        ratio,
        utilization: STRONG_COLUMN_RATIO / ratio,
        ok: ratio + ZERO_TOLERANCE >= STRONG_COLUMN_RATIO,
      };
    });
    const minimumRatio = Math.min(...results.map(item => item.ratio));
    return {
      version: VERSION,
      mode: 'strong-axis-joint-subcheck',
      clause: '9.6.1 / (9.6-1)',
      axis: 'x',
      requiredRatio: STRONG_COLUMN_RATIO,
      cases: results,
      minimumRatio,
      utilization: STRONG_COLUMN_RATIO / minimumRatio,
      ok: results.every(item => item.ok),
      completeFrameCheck: false,
      boundary: 'This result covers one strong-axis joint frame plane only; every other joint, orthogonal direction, and clause 8.4.2 force-transfer proportion remain outside this subcheck.',
    };
  }

  function confinement(input) {
    if (!input || typeof input !== 'object') {
      throw new SrcColumnSeismicDetailingError('input-required', 'confinement', 'A confinement input object is required');
    }
    if (input.axis !== 'x') {
      throw new SrcColumnSeismicDetailingError('unsupported-confinement-axis', 'axis', 'Only strong-axis x confinement is covered; weak-axis H/T bending requires Ahcc=0 and a separate check');
    }
    requireConfirmed(input.highlyConfinedAreaConfirmed, 'highlyConfinedAreaConfirmed', 'The highly confined concrete area Ahcc must be confirmed from the steel-flange geometry');
    requireConfirmed(input.cornerLongitudinalBarsConfirmed, 'cornerLongitudinalBarsConfirmed', 'At least one longitudinal bar at every section corner must be confirmed');
    requireConfirmed(input.crosstiesProvidedAsNeededConfirmed, 'crosstiesProvidedAsNeededConfirmed', 'Required crossties for bar restraint and concrete confinement must be confirmed');
    requireConfirmed(input.crosstiesEngageLongitudinalBarsConfirmed, 'crosstiesEngageLongitudinalBarsConfirmed', 'Crossties must engage longitudinal bars');
    requireConfirmed(input.crosstieHooksAlternatedConfirmed, 'crosstieHooksAlternatedConfirmed', 'Adjacent 90-degree and 135-degree crosstie hooks on the same bar must alternate');

    const width = positive(input.widthCm, 'widthCm');
    const depth = positive(input.depthCm, 'depthCm');
    const clearHeight = positive(input.clearHeightCm, 'clearHeightCm');
    const coreWidth = positive(input.coreWidthCm, 'coreWidthCm');
    const coreArea = positive(input.coreAreaCm2, 'coreAreaCm2');
    const steelArea = positive(input.steelAreaCm2, 'steelAreaCm2');
    const reinforcementArea = positive(input.reinforcementAreaCm2, 'reinforcementAreaCm2');
    const highlyConfinedArea = nonnegative(input.highlyConfinedAreaCm2, 'highlyConfinedAreaCm2');
    const fc = positive(input.fcKgfCm2, 'fcKgfCm2');
    const fys = positive(input.fysKgfCm2, 'fysKgfCm2');
    const fyr = positive(input.fyrKgfCm2, 'fyrKgfCm2');
    const fyh = positive(input.fyhKgfCm2, 'fyhKgfCm2');
    const spacing = positive(input.spacingCm, 'spacingCm');
    const providedAsh = positive(input.providedAshCm2, 'providedAshCm2');
    const shearRequiredAsh = nonnegative(input.shearRequiredAshCm2, 'shearRequiredAshCm2');
    const minimumBarDiameter = positive(input.minimumLongitudinalBarDiameterCm, 'minimumLongitudinalBarDiameterCm');
    const providedConfinementHeight = positive(input.providedConfinementZoneHeightCm, 'providedConfinementZoneHeightCm');
    const firstHoopDistance = nonnegative(input.firstHoopDistanceCm, 'firstHoopDistanceCm');

    const grossArea = width * depth;
    if (!(coreArea < grossArea)) throw new SrcColumnSeismicDetailingError('invalid-core-area', 'coreAreaCm2', 'Ach must be smaller than Ag');
    if (!(coreWidth < Math.min(width, depth))) throw new SrcColumnSeismicDetailingError('invalid-core-width', 'coreWidthCm', 'bc must be smaller than the section short side');
    if (highlyConfinedArea > 2500 + ZERO_TOLERANCE) throw new SrcColumnSeismicDetailingError('highly-confined-area-cap', 'highlyConfinedAreaCm2', 'Ahcc must not exceed 2500 cm2');
    const concreteArea = grossArea - steelArea - reinforcementArea;
    if (!(concreteArea > 0)) throw new SrcColumnSeismicDetailingError('invalid-net-concrete-area', 'steelAreaCm2', 'Ag-As-Ar must be positive');
    if (highlyConfinedArea > concreteArea + ZERO_TOLERANCE) throw new SrcColumnSeismicDetailingError('highly-confined-area-outside-concrete', 'highlyConfinedAreaCm2', 'Ahcc cannot exceed the net concrete area');

    const steelAxialKgf = steelArea * fys;
    const highlyConfinedAxialKgf = 0.2 * fc * highlyConfinedArea;
    const nominalAxialKgf = steelAxialKgf + 0.85 * fc * concreteArea + fyr * reinforcementArea;
    const reductionFactor = 1 - (steelAxialKgf + highlyConfinedAxialKgf) / nominalAxialKgf;
    if (!(reductionFactor > 0 && reductionFactor <= 1 + ZERO_TOLERANCE)) {
      throw new SrcColumnSeismicDetailingError('invalid-confinement-reduction', 'highlyConfinedAreaCm2', 'The clause 9.6.3 confinement reduction factor must remain between 0 and 1');
    }
    const ashEquation6Cm2 = 0.3 * spacing * coreWidth * (fc / fyh) * (grossArea / coreArea - 1) * reductionFactor;
    const ashEquation7Cm2 = 0.09 * spacing * coreWidth * (fc / fyh) * reductionFactor;
    const requiredAshCm2 = Math.max(shearRequiredAsh, ashEquation6Cm2, ashEquation7Cm2);

    const shortSide = Math.min(width, depth);
    const confinedSpacingLimitCm = Math.min(shortSide / 4, 15, 6 * minimumBarDiameter);
    const nonConfinedSpacingLimitCm = Math.min(15, 6 * minimumBarDiameter);
    const inflectionWithinMiddleHalf = booleanAt(input.inflectionPointWithinMiddleHalf, 'inflectionPointWithinMiddleHalf');
    const wholeLengthConfined = booleanAt(input.wholeLengthConfined, 'wholeLengthConfined');
    if (!inflectionWithinMiddleHalf && !wholeLengthConfined) {
      throw new SrcColumnSeismicDetailingError('whole-length-confinement-required', 'wholeLengthConfined', 'The full clear height must be confined when the inflection point is outside the middle half');
    }
    const requiredConfinementHeightCm = inflectionWithinMiddleHalf
      ? Math.max(depth, clearHeight / 6, 45)
      : clearHeight;
    let nonConfinedSpacingCm = null;
    let nonConfinedSpacingOk = true;
    if (!wholeLengthConfined) {
      nonConfinedSpacingCm = positive(input.nonConfinedSpacingCm, 'nonConfinedSpacingCm');
      nonConfinedSpacingOk = nonConfinedSpacingCm <= nonConfinedSpacingLimitCm + ZERO_TOLERANCE;
    }

    const splicePresent = booleanAt(input.mainBarSplicePresent, 'mainBarSplicePresent');
    if (splicePresent) {
      requireConfirmed(input.spliceWithinMiddleHalfConfirmed, 'spliceWithinMiddleHalfConfirmed', 'Main-bar splices are allowed only in the middle half of the member');
      requireConfirmed(input.tensionLapSpliceDesignedConfirmed, 'tensionLapSpliceDesignedConfirmed', 'The splice must be designed as a tension lap splice');
      requireConfirmed(input.confinementThroughSpliceConfirmed, 'confinementThroughSpliceConfirmed', 'Confinement reinforcement must be provided throughout the splice');
      requireConfirmed(input.alternateBarsSplicedOnlyConfirmed, 'alternateBarsSplicedOnlyConfirmed', 'At most alternate bars may be spliced at one section');
      const staggerDistance = positive(input.spliceStaggerDistanceCm, 'spliceStaggerDistanceCm');
      if (staggerDistance < 60 - ZERO_TOLERANCE) {
        throw new SrcColumnSeismicDetailingError('splice-stagger-too-short', 'spliceStaggerDistanceCm', 'Alternate splice sections must be at least 60 cm apart');
      }
    }

    const checks = {
      ash: providedAsh + ZERO_TOLERANCE >= requiredAshCm2,
      confinedSpacing: spacing <= confinedSpacingLimitCm + ZERO_TOLERANCE,
      nonConfinedSpacing: nonConfinedSpacingOk,
      firstHoopDistance: firstHoopDistance <= spacing / 2 + ZERO_TOLERANCE,
      confinementHeight: providedConfinementHeight + ZERO_TOLERANCE >= requiredConfinementHeightCm,
    };
    return {
      version: VERSION,
      mode: 'strong-axis-rectangular-confinement-subcheck',
      clauses: ['9.6.3 / (9.6-6)~(9.6-10)', '9.6.3 / confinement extent and spacing'],
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
        shearRequiredCm2: shearRequiredAsh,
        equation6Cm2: ashEquation6Cm2,
        equation7Cm2: ashEquation7Cm2,
        governingMode: shearRequiredAsh >= ashEquation6Cm2 && shearRequiredAsh >= ashEquation7Cm2
          ? 'shear-demand'
          : (ashEquation6Cm2 >= ashEquation7Cm2 ? 'equation-9.6-6' : 'equation-9.6-7'),
        requiredCm2: requiredAshCm2,
        utilization: requiredAshCm2 / providedAsh,
        ok: checks.ash,
      },
      spacing: {
        confinedProvidedCm: spacing,
        confinedLimitCm: confinedSpacingLimitCm,
        nonConfinedProvidedCm: nonConfinedSpacingCm,
        nonConfinedLimitCm: nonConfinedSpacingLimitCm,
        firstHoopDistanceCm: firstHoopDistance,
        firstHoopLimitCm: spacing / 2,
      },
      extent: {
        inflectionPointWithinMiddleHalf: inflectionWithinMiddleHalf,
        wholeLengthConfined,
        providedCm: providedConfinementHeight,
        requiredCm: requiredConfinementHeightCm,
      },
      splice: { present: splicePresent, checked: true },
      checks,
      ok: Object.values(checks).every(Boolean),
      completeSeismicDetailing: false,
      boundary: 'This result covers the current-code strong-axis rectangular-column confinement checks only; the fourth-chapter baseline, weak-axis Ahcc=0 check, joint-region detailing, and field placement still require separate verification.',
    };
  }

  function calculate(input) {
    return {
      version: VERSION,
      jointFlexuralStrengthRatio: jointFlexuralStrengthRatio(input.jointFlexuralStrengthRatio),
      strongColumnWeakBeam: strongColumnWeakBeam(input.strongColumnWeakBeam),
      confinement: confinement(input.confinement),
      completeSeismicDesign: false,
    };
  }

  return {
    VERSION,
    SRC_JOINT_STEEL_RATIO,
    SRC_JOINT_RC_RATIO,
    STEEL_BEAM_JOINT_RATIO,
    VERIFIED_TRANSFER_JOINT_RATIO,
    STRONG_COLUMN_RATIO,
    SrcColumnSeismicDetailingError,
    jointFlexuralStrengthRatio,
    strongColumnWeakBeam,
    confinement,
    calculate,
  };
});
