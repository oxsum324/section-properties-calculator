const assert = require('assert');
const FoundationIsolated = require('./foundation-isolated.js');
const Flexure = require('./flexure.js');

function near(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: finite result required`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

const input = {
  fc: 280, fy: 4200, B: 250, L: 250, hf: 60, c1: 60, c2: 60,
  cover: 7.5, dbX: 2.222, dbY: 2.222,
  AsXPerM: 100 / 18 * 3.879, AsYPerM: 100 / 18 * 3.879,
  PuTf: 184, phiShear: 0.75, lambda: 1
};

assert.deepEqual(FoundationIsolated.validateInput(input), [], 'default isolated footing input validates');
const result = FoundationIsolated.calculateStrength(input);
near(result.MuTfm, 33.212, 1e-10, 'default footing moment');
near(result.Vu1Kgf / 1000, 32.915392, 1e-10, 'default footing one-way shear demand');
near(result.phiVc1Kgf / 1000, 83.6053657179845, 1e-10, 'default footing one-way shear capacity');
near(result.Vu2Kgf / 1000, 148.19731743590398, 1e-10, 'default footing punching demand');
near(result.phiVc2Kgf / 1000, 295.0346406607326, 1e-10, 'default footing punching capacity');
near(result.AsReqX, 27, 1e-10, 'default footing X reinforcement demand remains finite');
near(result.AsReqY, 27, 1e-10, 'default footing Y reinforcement demand remains finite');

// Rectangular footing whose Y cantilever governs: one-way section width must be L (200 cm), not B.
// qu = 150 tf / 6 m2 = 2.5 kgf/cm2; armY = (300 - 50) / 2 = 125 cm; d = 60 - 7.5 - 1.905 = 50.595 cm.
const rect = FoundationIsolated.calculateStrength({ ...input, B:300, L:200, c1:50, c2:50, dbX:1.905, dbY:1.905, AsXPerM:15, AsYPerM:15, PuTf:150 });
near(rect.Vu1Kgf / 1000, 2.5 * 200 * (125 - 50.595) / 1000, 1e-9, 'rectangular footing one-way shear uses width L for Y cantilever');
near(rect.phiVc1Kgf / 1000, 0.75 * 0.53 * Math.sqrt(280) * 200 * 50.595 / 1000, 1e-9, 'rectangular footing one-way shear capacity uses width L');

const wrongKey = Flexure.designAsRect({ b: 250, d: 50, Mu: 1e6, fc: 280, fy: 4200 });
assert.equal(wrongKey.converged, false, 'wrong flexure demand key fails closed');
assert.ok(Number.isNaN(wrongKey.As), 'wrong flexure demand key cannot silently become zero reinforcement');
assert.throws(() => FoundationIsolated.calculateStrength({ ...input, hf: 8 }), /invalid-foundation-input/, 'invalid effective depth is rejected');

console.log('foundation isolated strength core tests passed.');
