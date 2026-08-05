const assert = require('assert');
const FoundationPile = require('./foundation-pile.js');

function near(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: finite result required`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

const layers = [{ from:0, to:10, N:0, c:5, phi:0, gammaEff:1.8, type:'clay' }];
const capacity = FoundationPile.calculateAxialCapacity({
  layers, pileLength:10, pileDiameterM:0.5, pileInstall:'drilled', safetyFactor:2.5
});
near(capacity.Qs, 54.97787143782138, 1e-10, 'uniform clay shaft capacity');
near(capacity.Qb, 8.835729338221293, 1e-10, 'uniform clay tip capacity');
near(capacity.Qall, 25.525440310417068, 1e-10, 'uniform clay allowable capacity');

const group = FoundationPile.calculateGroupAndCap({
  fc:280, fy:4200, phiShear:0.75, lambda:1,
  c1:60, c2:60, pileD:50, pileNL:2, pileNB:2, pileSL:250, pileSB:250,
  PuTf:400, MxTfm:80, MyTfm:40,
  hc:100, cover:7.5, db:2.222, capSteelAreaTotal:80
});
assert.deepEqual(group.reactions, [76, 108, 92, 124], '2x2 group resolves signed biaxial pile reactions');
near(group.reactions.reduce((sum, value) => sum + value, 0), 400, 1e-10, 'pile reactions preserve axial equilibrium');
near(group.rMax, 124, 1e-12, 'maximum pile reaction');
near(group.rMin, 76, 1e-12, 'minimum pile reaction');
assert.equal(group.excludedCount, 0, 'benchmark piles remain outside punching exclusion zone');
near(group.Vu2Tf, 400, 1e-10, 'pile-cap punching demand');
near(group.phiVc2Kgf / 1000, 721.9106876490419, 1e-10, 'pile-cap punching capacity');
assert.deepEqual(group.pileReactionRowsL, [184, 216], 'long-direction row reactions');
assert.deepEqual(group.pileReactionRowsB, [168, 232], 'transverse row reactions');
near(group.capMuTfm, 72.5, 1e-12, 'pile-cap beam-strip moment');
near(group.capAsReq, 21.70585248939605, 1e-8, 'pile-cap reinforcement demand');
near(group.capPhiVnTf, 348.21531113097745, 1e-10, 'pile-cap shear capacity');

assert.throws(() => FoundationPile.calculateGroupAndCap({}), /invalid-pile-group-cap-input/, 'invalid pile group input is rejected');
console.log('foundation pile and pile-cap core tests passed.');
