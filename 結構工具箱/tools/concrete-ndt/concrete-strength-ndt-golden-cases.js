(function (root, factory) {
  const cases = factory();
  if (typeof module === 'object' && module.exports) module.exports = cases;
  if (root) root.ConcreteStrengthNdtGoldenCases = cases;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const repeated = (value, count = 10) => Array(count).fill(value);
  const core = (id, zone, load, overrides = {}) => ({
    id, zone, diameterMm: 100, lengthMm: 200, failureLoadKn: load,
    moistureState: 'dry', samplingDirection: 'perpendicular', drillingDamage: 'typical',
    factorOverrides: overrides
  });
  const project = { name: 'Fixture', number: 'FIXTURE-01', preparer: 'test' };
  const base = { project, designStrengthMpa: 25, rebound: [], ultrasonic: [], core: [] };
  return Object.freeze([
    {
      id: 'rebound-only-three-zones',
      input: { ...base, rebound: [
        { id: 'R1', zone: 'Z1', readings: repeated(30), angleDeg: 0 },
        { id: 'R2', zone: 'Z2', readings: repeated(31), angleDeg: 0 },
        { id: 'R3', zone: 'Z3', readings: repeated(32), angleDeg: 0 }
      ] },
      expected: {
        n: 3, meanMpa: 6.34, sampleSdMpa: 0.5440441158582638,
        characteristicStrengthMpa: 5.4450474294131554, minimumSingleMpa: 5.8
      }
    },
    {
      id: 'ultrasonic-only-three-zones',
      input: { ...base, ultrasonic: [
        { id: 'U1', zone: 'Z1', velocityKmS: 3 },
        { id: 'U2', zone: 'Z2', velocityKmS: 4 },
        { id: 'U3', zone: 'Z3', velocityKmS: 5 }
      ] },
      expected: {
        n: 3, meanMpa: 25, sampleSdMpa: 12.031209415515965,
        characteristicStrengthMpa: 5.208660511476236, minimumSingleMpa: 13.5
      }
    },
    {
      id: 'core-only-three-zones',
      input: { ...base, core: [
        core('C1', 'Z1', 188.49555921538757),
        core('C2', 'Z2', 204.20352248330003),
        core('C3', 'Z3', 196.34954084936206)
      ] },
      expected: { n: 3, meanMpa: 25, sampleSdMpa: 1, characteristicStrengthMpa: 23.355, minimumSingleMpa: 24 }
    },
    {
      id: 'all-three-methods-three-matched-zones',
      input: {
        ...base,
        rebound: [
          { id: 'R1', zone: 'Z1', readings: repeated(30), angleDeg: 0 },
          { id: 'R2', zone: 'Z2', readings: repeated(31), angleDeg: 0 },
          { id: 'R3', zone: 'Z3', readings: repeated(32), angleDeg: 0 }
        ],
        ultrasonic: [
          { id: 'U1', zone: 'Z1', velocityKmS: 3 },
          { id: 'U2', zone: 'Z2', velocityKmS: 4 },
          { id: 'U3', zone: 'Z3', velocityKmS: 5 }
        ],
        core: [
          core('C1', 'Z1', 188.49555921538757),
          core('C2', 'Z2', 204.20352248330003),
          core('C3', 'Z3', 196.34954084936206)
        ]
      },
      expected: {
        rebound: { n: 3, meanMpa: 6.34, characteristicStrengthMpa: 5.4450474294131554 },
        ultrasonic: { n: 3, meanMpa: 25, characteristicStrengthMpa: 5.208660511476236 },
        core: { n: 3, meanMpa: 25, characteristicStrengthMpa: 23.355 },
        pooled: { n: 9, meanMpa: 18.78, sampleSdMpa: 11.115772397813839, characteristicStrengthMpa: 0.494554405596233 },
        matchedZoneCount: 3, formalAttachmentEligible: false
      }
    },
    {
      id: 'rebound-outlier-trimmed-after-original-mean',
      input: { ...base, rebound: [
        { id: 'R1', zone: 'Z1', readings: [...repeated(30, 11), 40], angleDeg: 0 },
        { id: 'R2', zone: 'Z2', readings: repeated(30), angleDeg: 0 },
        { id: 'R3', zone: 'Z3', readings: repeated(30), angleDeg: 0 }
      ] },
      expected: {
        rawMean: 30.833333333333332, removed: [40], retainedCount: 11,
        retainedMean: 30, rowStrengthMpa: 5.8, stats: { n: 3, meanMpa: 5.8, sampleSdMpa: 0, characteristicStrengthMpa: 5.8 }
      }
    },
    {
      id: 'core-four-correction-factors-explicit',
      input: { ...base, core: [
        core('C1', 'Z1', 157.07963267948966, { lengthDiameter: 1.1, diameter: 0.9, moisture: 1.05, drillingDamage: 0.95 }),
        core('C2', 'Z2', 157.07963267948966, { lengthDiameter: 1.1, diameter: 0.9, moisture: 1.05, drillingDamage: 0.95 }),
        core('C3', 'Z3', 157.07963267948966, { lengthDiameter: 1.1, diameter: 0.9, moisture: 1.05, drillingDamage: 0.95 })
      ] },
      expected: {
        rawStrengthMpa: 20, factors: { lengthDiameter: 1.1, diameter: 0.9, moisture: 1.05, drillingDamage: 0.95 },
        correctedStrengthMpa: 19.7505, meanMpa: 19.7505
      }
    },

    {
      id: 'rebound-nonzero-angle-deltaR-before-linear-curve',
      input: { ...base, rebound: [{ id: 'RA1', zone: 'ZA1', readings: repeated(30), angleDeg: 45, angleCorrectionOverrideDeltaR: 2, curveType: 'linear', curveCoefficients: { a: 2, b: -10 } }] },
      expected: { correctedMeanRebound: 32, rowStrengthMpa: 54, angleCorrectionDeltaR: 2 }
    }
  ]);
});
