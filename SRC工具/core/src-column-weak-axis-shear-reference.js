/* Independent external reference for H-shape weak-axis steel shear.
 *
 * This module is intentionally not part of the SRC column production
 * calculation. It reproduces AISC 360 Section G6 and the Section G2.2 Cv2
 * branches so a project-specified weak-axis steel nominal shear can be
 * compared with an external, sourced arithmetic path. Taiwan SRC clauses
 * 5.5.1 and 9.6.2 remain the governing production profile; this reference
 * must never silently replace the project-confirmed Vns input.
 *
 * Inputs may use any consistent stress/length system. forceDivisor converts
 * stress x area to the desired force unit (1 for ksi/in -> kip, 1000 for
 * kgf/cm2 and cm -> tf).
 */
(function initSrcColumnWeakAxisShearReference(globalObject, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (globalObject) globalObject.SrcColumnWeakAxisShearReference = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildWeakAxisShearReference() {
  'use strict';

  const VERSION = 'src-column.weak-axis-shear-reference.v0.1.0';
  const DEFAULT_KV = 1.2;
  const DEFAULT_PHI = 0.9;
  const SOURCE = Object.freeze({
    authority: 'American Institute of Steel Construction',
    standard: 'ANSI/AISC 360-22',
    clause: 'G6 with Cv2 from G2.2',
    example: 'Companion V16.0 Example G.6, printed pages G-13 to G-14',
    url: 'https://www.aisc.org/globalassets/aisc/university-programs/teaching-aids/first-semester-design-examples---v16.0.pdf',
  });

  class WeakAxisShearReferenceError extends Error {
    constructor(code, path, message) {
      super(message);
      this.name = 'WeakAxisShearReferenceError';
      this.code = code;
      this.path = path;
    }
  }

  function positive(value, path) {
    const number = Number(value);
    if (!Number.isFinite(number) || !(number > 0)) {
      throw new WeakAxisShearReferenceError('positive-number-required', path, `${path} must be a positive finite number`);
    }
    return number;
  }

  function calculate(input) {
    if (!input || typeof input !== 'object') {
      throw new WeakAxisShearReferenceError('input-required', 'input', 'An AISC G6 reference input object is required');
    }
    const fy = positive(input.fy, 'fy');
    const modulus = positive(input.modulus, 'modulus');
    const flangeWidth = positive(input.flangeWidth, 'flangeWidth');
    const flangeThickness = positive(input.flangeThickness, 'flangeThickness');
    const forceDivisor = input.forceDivisor == null ? 1 : positive(input.forceDivisor, 'forceDivisor');
    const kv = input.kv == null ? DEFAULT_KV : positive(input.kv, 'kv');
    const phi = input.phi == null ? DEFAULT_PHI : positive(input.phi, 'phi');
    if (phi > 1) throw new WeakAxisShearReferenceError('phi-out-of-range', 'phi', 'phi must not exceed 1.0');

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
    const shearArea = 2 * flangeWidth * flangeThickness;
    const nominalShear = 0.6 * fy * shearArea * cv2 / forceDivisor;
    return Object.freeze({
      version: VERSION,
      mode: 'external-reference-only',
      adoption: 'not-adopted-by-production',
      source: SOURCE,
      kv,
      phi,
      flangeSlenderness,
      yieldingLimit,
      inelasticLimit,
      cv2,
      cv2Equation,
      shearArea,
      nominalShear,
      designShear: phi * nominalShear,
      governingMode: cv2Equation === 'G2-9' ? 'flange-shear-yielding' : 'flange-shear-buckling',
      boundary: 'Reference arithmetic only. Adoption requires an explicit project design basis and does not establish the Taiwan SRC weak-axis RC strength or Ash,shear.',
    });
  }

  return Object.freeze({
    VERSION,
    DEFAULT_KV,
    DEFAULT_PHI,
    SOURCE,
    WeakAxisShearReferenceError,
    calculate,
  });
});
