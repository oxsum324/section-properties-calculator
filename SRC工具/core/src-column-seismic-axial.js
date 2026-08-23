/* SRC column current-code seismic axial-strength research subcheck.
 *
 * Scope: clause 9.3 axial load combinations and the clause 6.4.1
 * strength-superposition compression path for a fully encased rectangular
 * tied SRC column. Compression is positive. PD, PL, and PE are nonnegative
 * axial-force magnitudes in tf. Project tensile strength, optional connected-
 * member transfer caps, and omission confirmations remain explicit inputs.
 *
 * Units: cm, cm2, cm4, kgf/cm2, tf.
 */
(function initSrcColumnSeismicAxial(globalObject, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (globalObject) globalObject.SrcColumnSeismicAxial = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildSrcColumnSeismicAxial() {
  'use strict';

  const VERSION = 'src-column.seismic-axial.v1.0.0';
  const ZERO_TOLERANCE = 1e-9;
  const PHI_STEEL_COMPRESSION = 0.85;
  const PHI_RC_TIED_COMPRESSION = 0.65;
  const RC_EFFECTIVE_LENGTH_FACTOR = 0.8;
  const MAX_FU = 2.5;

  class SrcColumnSeismicAxialError extends Error {
    constructor(code, path, message) {
      super(message);
      this.name = 'SrcColumnSeismicAxialError';
      this.code = code;
      this.path = path;
    }
  }

  function finite(value, path) {
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      throw new SrcColumnSeismicAxialError('finite-number-required', path, `${path} must be finite`);
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new SrcColumnSeismicAxialError('finite-number-required', path, `${path} must be finite`);
    }
    return number;
  }

  function positive(value, path) {
    const number = finite(value, path);
    if (!(number > 0)) throw new SrcColumnSeismicAxialError('positive-number-required', path, `${path} must be positive`);
    return number;
  }

  function nonnegative(value, path) {
    const number = finite(value, path);
    if (number < 0) throw new SrcColumnSeismicAxialError('nonnegative-number-required', path, `${path} must be nonnegative`);
    return number;
  }

  function booleanAt(value, path) {
    if (value !== true && value !== false) {
      throw new SrcColumnSeismicAxialError('boolean-required', path, `${path} must be explicitly true or false`);
    }
    return value;
  }

  function requireConfirmed(value, path, message) {
    if (value !== true) throw new SrcColumnSeismicAxialError('confirmation-required', path, message);
  }

  function calculateCompressionDesignStrength(input) {
    if (!input || typeof input !== 'object') {
      throw new SrcColumnSeismicAxialError('input-required', 'compressionStrength', 'A compression-strength input object is required');
    }
    const width = positive(input.widthCm, 'widthCm');
    const depth = positive(input.depthCm, 'depthCm');
    const fc = positive(input.fcKgfCm2, 'fcKgfCm2');
    const ec = positive(input.ecKgfCm2, 'ecKgfCm2');
    const steelArea = positive(input.steelAreaCm2, 'steelAreaCm2');
    const reinforcementArea = positive(input.reinforcementAreaCm2, 'reinforcementAreaCm2');
    const fyr = positive(input.fyrKgfCm2, 'fyrKgfCm2');
    const length = positive(input.lengthCm, 'lengthCm');
    const kx = positive(input.kx, 'kx');
    const ky = positive(input.ky, 'ky');
    const steelNominalX = positive(input.steelNominalCompressionXTf, 'steelNominalCompressionXTf');
    const steelNominalY = positive(input.steelNominalCompressionYTf, 'steelNominalCompressionYTf');

    const grossAreaCm2 = width * depth;
    const concreteAreaCm2 = grossAreaCm2 - steelArea - reinforcementArea;
    if (!(concreteAreaCm2 > 0)) {
      throw new SrcColumnSeismicAxialError('invalid-net-concrete-area', 'steelAreaCm2', 'Ag-As-Ar must be positive');
    }
    const grossIxCm4 = width * depth ** 3 / 12;
    const grossIyCm4 = depth * width ** 3 / 12;
    const rcShortNominalTf = RC_EFFECTIVE_LENGTH_FACTOR
      * (0.85 * fc * concreteAreaCm2 + reinforcementArea * fyr) / 1000;
    const rcEulerXNominalTf = RC_EFFECTIVE_LENGTH_FACTOR * Math.PI ** 2
      * (ec * grossIxCm4 / 5) / (kx * length) ** 2 / 1000;
    const rcEulerYNominalTf = RC_EFFECTIVE_LENGTH_FACTOR * Math.PI ** 2
      * (ec * grossIyCm4 / 5) / (ky * length) ** 2 / 1000;
    const rcCandidates = [
      { mode: 'short-column-6.4-6', nominalTf: rcShortNominalTf },
      { mode: 'euler-x-6.4-7', nominalTf: rcEulerXNominalTf },
      { mode: 'euler-y-6.4-7', nominalTf: rcEulerYNominalTf },
    ];
    const rcControl = rcCandidates.reduce((governing, item) => item.nominalTf < governing.nominalTf ? item : governing);
    const steelControlAxis = steelNominalX <= steelNominalY ? 'x' : 'y';
    const steelNominalTf = Math.min(steelNominalX, steelNominalY);
    const steelDesignTf = PHI_STEEL_COMPRESSION * steelNominalTf;
    const rcDesignTf = PHI_RC_TIED_COMPRESSION * rcControl.nominalTf;

    return {
      version: VERSION,
      clauses: ['6.4.1 / (6.4-1)', '6.4.3 / (6.4-6)~(6.4-7)'],
      grossAreaCm2,
      concreteAreaCm2,
      grossIxCm4,
      grossIyCm4,
      steel: {
        nominalXTf: steelNominalX,
        nominalYTf: steelNominalY,
        controlAxis: steelControlAxis,
        nominalTf: steelNominalTf,
        phi: PHI_STEEL_COMPRESSION,
        designTf: steelDesignTf,
      },
      rc: {
        effectiveLengthFactor: RC_EFFECTIVE_LENGTH_FACTOR,
        shortNominalTf: rcShortNominalTf,
        eulerXNominalTf: rcEulerXNominalTf,
        eulerYNominalTf: rcEulerYNominalTf,
        governingMode: rcControl.mode,
        nominalTf: rcControl.nominalTf,
        phi: PHI_RC_TIED_COMPRESSION,
        designTf: rcDesignTf,
      },
      designCompressionStrengthTf: steelDesignTf + rcDesignTf,
    };
  }

  function seismicAxialCheck(input) {
    if (!input || typeof input !== 'object') {
      throw new SrcColumnSeismicAxialError('input-required', 'seismicAxial', 'A seismic-axial input object is required');
    }
    const compressionStrength = input.compressionStrength;
    if (!compressionStrength || !(Number(compressionStrength.designCompressionStrengthTf) > 0)) {
      throw new SrcColumnSeismicAxialError('compression-strength-required', 'compressionStrength.designCompressionStrengthTf', 'Calculated clause 6.4 design compression strength is required');
    }
    const designCompressionStrengthTf = positive(compressionStrength.designCompressionStrengthTf, 'compressionStrength.designCompressionStrengthTf');
    const pdTf = nonnegative(input.pdTf, 'pdTf');
    const plTf = nonnegative(input.plTf, 'plTf');
    const peTf = nonnegative(input.peTf, 'peTf');
    const projectFu = positive(input.fu, 'fu');
    requireConfirmed(input.fuFromProjectSeismicCriteriaConfirmed, 'fuFromProjectSeismicCriteriaConfirmed', 'Fu must be confirmed from the project seismic criteria');
    const parkingUse = booleanAt(input.parkingUse, 'parkingUse');
    const publicAssemblyUse = booleanAt(input.publicAssemblyUse, 'publicAssemblyUse');
    const liveLoadExceeds05TfM2 = booleanAt(input.liveLoadExceeds05TfM2, 'liveLoadExceeds05TfM2');
    const applyTransferCapacityCap = booleanAt(input.applyTransferCapacityCap, 'applyTransferCapacityCap');
    const applyMomentFrameOmission = booleanAt(input.applyMomentFrameOmission, 'applyMomentFrameOmission');
    const adoptedFu = Math.min(projectFu, MAX_FU);
    const liveLoadFactor = parkingUse || publicAssemblyUse || liveLoadExceeds05TfM2 ? 1 : 0.5;
    const amplifiedSeismicTf = 1.4 * adoptedFu * peTf;

    let compressionTransferLimitTf = Infinity;
    let tensionTransferLimitTf = Infinity;
    if (applyTransferCapacityCap) {
      requireConfirmed(input.transferCapacityConfirmed, 'transferCapacityConfirmed', 'Connected-member or joint-region limit-state axial transfer capacity must be confirmed');
      compressionTransferLimitTf = 1.25 * positive(input.compressionTransferCapacityTf, 'compressionTransferCapacityTf');
      tensionTransferLimitTf = 1.25 * positive(input.tensionTransferCapacityTf, 'tensionTransferCapacityTf');
    }

    const compressionBaseTf = 1.2 * pdTf + liveLoadFactor * plTf;
    const tensionBaseTf = 0.9 * pdTf;
    const compressionCombinations = [1, -1].map(sign => {
      const signedTf = compressionBaseTf + sign * amplifiedSeismicTf;
      const rawDemandTf = Math.max(0, signedTf);
      return {
        equation: '9.3-1',
        seismicSense: sign > 0 ? 'plus' : 'minus',
        signedTf,
        rawCompressionDemandTf: rawDemandTf,
        adoptedCompressionDemandTf: Math.min(rawDemandTf, compressionTransferLimitTf),
      };
    });
    const tensionCombinations = [1, -1].map(sign => {
      const signedTf = tensionBaseTf + sign * amplifiedSeismicTf;
      const rawDemandTf = Math.max(0, -signedTf);
      return {
        equation: '9.3-2',
        seismicSense: sign > 0 ? 'plus' : 'minus',
        signedTf,
        rawTensionDemandTf: rawDemandTf,
        adoptedTensionDemandTf: Math.min(rawDemandTf, tensionTransferLimitTf),
      };
    });
    const rawCompressionDemandTf = Math.max(...compressionCombinations.map(item => item.rawCompressionDemandTf));
    const adoptedCompressionDemandTf = Math.max(...compressionCombinations.map(item => item.adoptedCompressionDemandTf));
    const rawTensionDemandTf = Math.max(...tensionCombinations.map(item => item.rawTensionDemandTf));
    const adoptedTensionDemandTf = Math.max(...tensionCombinations.map(item => item.adoptedTensionDemandTf));

    const governingPuTf = nonnegative(input.governingPuTf, 'governingPuTf');
    const omissionRatio = governingPuTf / designCompressionStrengthTf;
    const omissionEligibleByRatio = omissionRatio <= 0.5 + ZERO_TOLERANCE;
    if (applyMomentFrameOmission) {
      requireConfirmed(input.momentFrameConfirmed, 'momentFrameConfirmed', 'Clause 9.3 omission applies only to a confirmed moment-frame SRC column');
      requireConfirmed(input.relevantProvisionsSatisfiedConfirmed, 'relevantProvisionsSatisfiedConfirmed', 'All relevant seismic provisions must be confirmed before omitting both clause 9.3 combinations');
      if (!omissionEligibleByRatio) {
        throw new SrcColumnSeismicAxialError('omission-ratio-exceeded', 'governingPuTf', 'Pu divided by design compression strength exceeds 0.5; clause 9.3 combinations cannot be omitted');
      }
    }

    let designTensionStrengthTf = null;
    if (!applyMomentFrameOmission && adoptedTensionDemandTf > ZERO_TOLERANCE) {
      designTensionStrengthTf = positive(input.designTensionStrengthTf, 'designTensionStrengthTf');
      requireConfirmed(input.designTensionStrengthConfirmed, 'designTensionStrengthConfirmed', 'Project design tensile strength must be confirmed from the approved strength method; concrete tension must not be assumed by this subcheck');
    }
    const compressionUtilization = adoptedCompressionDemandTf / designCompressionStrengthTf;
    const tensionUtilization = adoptedTensionDemandTf <= ZERO_TOLERANCE
      ? 0
      : adoptedTensionDemandTf / designTensionStrengthTf;
    const compressionOk = compressionUtilization <= 1 + ZERO_TOLERANCE;
    const tensionOk = adoptedTensionDemandTf <= ZERO_TOLERANCE || tensionUtilization <= 1 + ZERO_TOLERANCE;
    const omitted = applyMomentFrameOmission;

    return {
      version: VERSION,
      mode: 'seismic-axial-strength-subcheck',
      clauses: ['9.3 / (9.3-1)~(9.3-2)', '6.4.1 / (6.4-1)', '6.4.3 / (6.4-6)~(6.4-7)'],
      signConvention: 'compression-positive',
      factors: {
        projectFu,
        adoptedFu,
        fuCappedAt25: projectFu > MAX_FU,
        seismicMultiplier: 1.4,
        liveLoadFactor,
        amplifiedSeismicTf,
      },
      compressionStrength,
      combinations: {
        compression: compressionCombinations,
        tension: tensionCombinations,
      },
      transferCapacityCap: {
        applied: applyTransferCapacityCap,
        compressionLimitTf: Number.isFinite(compressionTransferLimitTf) ? compressionTransferLimitTf : null,
        tensionLimitTf: Number.isFinite(tensionTransferLimitTf) ? tensionTransferLimitTf : null,
      },
      omission: {
        requested: applyMomentFrameOmission,
        applied: omitted,
        governingPuTf,
        ratio: omissionRatio,
        ratioLimit: 0.5,
        eligibleByRatio: omissionEligibleByRatio,
      },
      compression: {
        rawDemandTf: rawCompressionDemandTf,
        adoptedDemandTf: adoptedCompressionDemandTf,
        designStrengthTf: designCompressionStrengthTf,
        utilization: compressionUtilization,
        ok: compressionOk,
      },
      tension: {
        applicable: adoptedTensionDemandTf > ZERO_TOLERANCE,
        rawDemandTf: rawTensionDemandTf,
        adoptedDemandTf: adoptedTensionDemandTf,
        designStrengthTf: designTensionStrengthTf,
        utilization: tensionUtilization,
        ok: tensionOk,
        strengthSource: designTensionStrengthTf == null ? null : 'project-confirmed',
      },
      ok: omitted || (compressionOk && tensionOk),
      completeSeismicDesign: false,
      boundary: 'This subcheck covers clause 9.3 axial-only combinations. Moment interaction, project tensile-strength derivation, connected-member or joint-region transfer capacity, and all remaining seismic provisions require their own verified paths.',
    };
  }

  function calculate(input) {
    const compressionStrength = calculateCompressionDesignStrength(input.compressionStrength);
    return seismicAxialCheck({ ...input.seismicAxial, compressionStrength });
  }

  return {
    VERSION,
    MAX_FU,
    PHI_STEEL_COMPRESSION,
    PHI_RC_TIED_COMPRESSION,
    RC_EFFECTIVE_LENGTH_FACTOR,
    SrcColumnSeismicAxialError,
    calculateCompressionDesignStrength,
    seismicAxialCheck,
    calculate,
  };
});
