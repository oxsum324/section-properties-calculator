const assert = require('node:assert/strict');
const FoundationLocalCore = require('./foundation-local-core.js');
const goldenCases = require('./foundation-local-golden-cases.js');

function approx(actual, expected, tolerance = 1e-6) {
  if (!Number.isFinite(expected)) {
    assert.equal(actual, expected);
    return;
  }
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} ~= ${expected} within ${tolerance}`
  );
}

assert.equal(goldenCases.length, 4);

for (const goldenCase of goldenCases) {
  const r = FoundationLocalCore.calculate(goldenCase.input);

  for (const [key, expected] of Object.entries(goldenCase.expected.values)) {
    approx(r[key], expected);
  }

  for (const [key, expected] of Object.entries(goldenCase.expected.flags)) {
    assert.equal(r[key], expected, `${goldenCase.id}.${key}`);
  }

  assert.equal(r.qmaxCorner.name, goldenCase.expected.corners.qmaxCorner, `${goldenCase.id}.qmaxCorner`);
  assert.equal(r.qminCorner.name, goldenCase.expected.corners.qminCorner, `${goldenCase.id}.qminCorner`);
}

{
  const errors = FoundationLocalCore.validateInput({
    ...goldenCases[0].input,
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
