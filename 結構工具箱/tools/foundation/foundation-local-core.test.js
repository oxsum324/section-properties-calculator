const assert = require('node:assert/strict');
const FoundationLocalCore = require('./foundation-local-core.js');

const baseInput = {
  B: 2.5,
  L: 3,
  t: 0.6,
  Df: 1.2,
  gammaC: 2.4,
  gammaS: 1.8,
  P: 80,
  qa: 20,
  Mx: 12,
  My: 8,
  Hx: 4,
  Hy: 3,
  mu: 0.45,
  passive: 0,
  fsSlideReq: 1.5,
  fsOverReq: 1.5,
  includeSelfWeight: true
};

function approx(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} ~= ${expected} within ${tolerance}`
  );
}

{
  const r = FoundationLocalCore.calculate(baseInput);
  approx(r.Ptotal, 98.9);
  approx(r.qmax, 18.946666666666665);
  approx(r.qmin, 7.426666666666668);
  approx(r.kernUtil, 0.07280080889787665);
  approx(r.fsSlide, 8.901);
  approx(r.fsOver, 12.3625);
  assert.equal(r.qmaxCorner.name, '+X +Y');
  assert.equal(r.fullContact, true);
  assert.equal(r.bearingOk, true);
  assert.equal(r.overallOk, true);
}

{
  const r = FoundationLocalCore.calculate({ ...baseInput, Mx: 80, My: 60 });
  approx(r.kernUtil, 0.5123023255813953);
  approx(r.qmin, -27.34666666666666);
  assert.equal(r.fullContact, false);
  assert.equal(r.bearingOk, false);
  assert.equal(r.overallOk, false);
}

{
  const r = FoundationLocalCore.calculate({ ...baseInput, Hx: 0, Hy: 0 });
  assert.equal(r.fsSlide, Infinity);
  assert.equal(r.slideOk, true);
}

{
  const errors = FoundationLocalCore.validateInput({
    ...baseInput,
    B: 0,
    qa: 0,
    fsSlideReq: 0
  });
  assert.equal(errors.length, 3);
  assert.ok(errors.some(msg => msg.includes('B、L')));
  assert.ok(errors.some(msg => msg.includes('qa')));
  assert.ok(errors.some(msg => msg.includes('安全係數')));
}

console.log('foundation local core regression OK');
