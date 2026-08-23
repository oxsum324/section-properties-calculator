'use strict';

const assert = require('node:assert/strict');
const Axial = require('./core/src-column-seismic-axial.js');

function close(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: actual must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: actual=${actual}, expected=${expected}, tolerance=${tolerance}`);
}

function strengthInput() {
  return {
    widthCm: 65,
    depthCm: 80,
    fcKgfCm2: 280,
    ecKgfCm2: 15000 * Math.sqrt(280),
    steelAreaCm2: 215,
    reinforcementAreaCm2: 60.84,
    fyrKgfCm2: 4200,
    lengthCm: 350,
    kx: 1.53,
    ky: 1.83,
    steelNominalCompressionXTf: 729,
    steelNominalCompressionYTf: 656.1,
  };
}

function checkInput(overrides = {}) {
  return {
    compressionStrength: Axial.calculateCompressionDesignStrength(strengthInput()),
    pdTf: 100,
    plTf: 20,
    peTf: 100,
    fu: 2,
    fuFromProjectSeismicCriteriaConfirmed: true,
    parkingUse: false,
    publicAssemblyUse: false,
    liveLoadExceeds05TfM2: false,
    applyTransferCapacityCap: false,
    applyMomentFrameOmission: false,
    governingPuTf: 200,
    designTensionStrengthTf: 900,
    designTensionStrengthConfirmed: true,
    ...overrides,
  };
}

assert.equal(Axial.VERSION, 'src-column.seismic-axial.v1.0.0', 'formal seismic axial subcheck is explicitly versioned');

const strength = Axial.calculateCompressionDesignStrength(strengthInput());
const expectedAc = 65 * 80 - 215 - 60.84;
const expectedShort = 0.8 * (0.85 * 280 * expectedAc + 60.84 * 4200) / 1000;
const expectedEulerX = 0.8 * Math.PI ** 2 * ((15000 * Math.sqrt(280)) * (65 * 80 ** 3 / 12) / 5) / (1.53 * 350) ** 2 / 1000;
const expectedEulerY = 0.8 * Math.PI ** 2 * ((15000 * Math.sqrt(280)) * (80 * 65 ** 3 / 12) / 5) / (1.83 * 350) ** 2 / 1000;
const expectedRc = Math.min(expectedShort, expectedEulerX, expectedEulerY);
close(strength.concreteAreaCm2, expectedAc, 1e-12, 'net concrete area');
close(strength.rc.shortNominalTf, expectedShort, 1e-12, 'equation 6.4-6 tied short-column strength');
close(strength.rc.eulerXNominalTf, expectedEulerX, 1e-12, 'equation 6.4-7 x Euler strength');
close(strength.rc.eulerYNominalTf, expectedEulerY, 1e-12, 'equation 6.4-7 y Euler strength');
close(strength.designCompressionStrengthTf, 0.85 * 656.1 + 0.65 * expectedRc, 1e-12, 'equation 6.4-1 strength superposition');
assert.equal(strength.steel.controlAxis, 'y', 'weak-axis steel compression governs the steel contribution');
assert.equal(strength.rc.governingMode, expectedRc === expectedShort ? 'short-column-6.4-6' : (expectedRc === expectedEulerX ? 'euler-x-6.4-7' : 'euler-y-6.4-7'), 'least RC compression branch governs');

const seismic = Axial.seismicAxialCheck(checkInput());
close(seismic.factors.amplifiedSeismicTf, 280, 1e-12, '1.4 Fu PE');
close(seismic.combinations.compression[0].signedTf, 410, 1e-12, 'equation 9.3-1 plus sense');
close(seismic.combinations.compression[1].signedTf, -150, 1e-12, 'equation 9.3-1 minus sense');
close(seismic.combinations.tension[1].signedTf, -190, 1e-12, 'equation 9.3-2 minus sense');
close(seismic.compression.adoptedDemandTf, 410, 1e-12, 'governing compression demand');
close(seismic.tension.adoptedDemandTf, 190, 1e-12, 'governing tension demand');
close(seismic.tension.utilization, 190 / 900, 1e-12, 'project-confirmed tension strength utilization');
assert.equal(seismic.ok, true, 'both clause 9.3 directions pass');
assert.equal(seismic.completeSeismicDesign, false, 'axial subcheck cannot claim complete seismic design');

const tensionFailure = Axial.seismicAxialCheck(checkInput({ designTensionStrengthTf: 100 }));
assert.equal(tensionFailure.tension.ok, false, 'insufficient project-confirmed tensile strength fails');
assert.equal(tensionFailure.ok, false, 'tension failure cannot pass the axial subcheck');

const compressionFailure = Axial.seismicAxialCheck(checkInput({
  pdTf: 1200,
  plTf: 0,
  peTf: 0,
  designTensionStrengthTf: undefined,
  designTensionStrengthConfirmed: undefined,
}));
assert.equal(compressionFailure.compression.ok, false, 'insufficient calculated compression strength fails');
assert.equal(compressionFailure.ok, false, 'compression failure cannot pass the axial subcheck');

const highLive = Axial.seismicAxialCheck(checkInput({
  pdTf: 400,
  plTf: 100,
  peTf: 80,
  fu: 3,
  parkingUse: true,
  designTensionStrengthTf: undefined,
  designTensionStrengthConfirmed: undefined,
}));
assert.equal(highLive.factors.adoptedFu, 2.5, 'Fu is capped at the allowed 2.5 value');
assert.equal(highLive.factors.fuCappedAt25, true, 'Fu cap is disclosed');
assert.equal(highLive.factors.liveLoadFactor, 1, 'parking use selects the 1.0 live-load factor');
close(highLive.compression.adoptedDemandTf, 860, 1e-12, 'high-live equation 9.3-1 demand');
assert.equal(highLive.tension.applicable, false, 'no tensile capacity input is required when no tension demand occurs');

const transferLimited = Axial.seismicAxialCheck(checkInput({
  applyTransferCapacityCap: true,
  transferCapacityConfirmed: true,
  compressionTransferCapacityTf: 200,
  tensionTransferCapacityTf: 100,
}));
close(transferLimited.transferCapacityCap.compressionLimitTf, 250, 1e-12, '1.25 compression transfer cap');
close(transferLimited.transferCapacityCap.tensionLimitTf, 125, 1e-12, '1.25 tension transfer cap');
close(transferLimited.compression.adoptedDemandTf, 250, 1e-12, 'compression transfer cap is applied');
close(transferLimited.tension.adoptedDemandTf, 125, 1e-12, 'tension transfer cap is applied');

const omitted = Axial.seismicAxialCheck(checkInput({
  applyMomentFrameOmission: true,
  momentFrameConfirmed: true,
  relevantProvisionsSatisfiedConfirmed: true,
  governingPuTf: 0.5 * strength.designCompressionStrengthTf,
  designTensionStrengthTf: undefined,
  designTensionStrengthConfirmed: undefined,
}));
assert.equal(omitted.omission.applied, true, 'eligible confirmed moment-frame omission is explicit');
assert.equal(omitted.ok, true, 'applied omission passes this subcheck without inventing tensile strength');

for (const [code, mutate] of [
  ['confirmation-required', input => { input.fuFromProjectSeismicCriteriaConfirmed = false; }],
  ['nonnegative-number-required', input => { input.peTf = -1; }],
  ['boolean-required', input => { delete input.parkingUse; }],
  ['confirmation-required', input => { input.applyTransferCapacityCap = true; input.compressionTransferCapacityTf = 100; input.tensionTransferCapacityTf = 100; }],
  ['finite-number-required', input => { delete input.designTensionStrengthTf; }],
  ['confirmation-required', input => { input.designTensionStrengthConfirmed = false; }],
  ['confirmation-required', input => { input.applyMomentFrameOmission = true; }],
  ['omission-ratio-exceeded', input => {
    input.applyMomentFrameOmission = true;
    input.momentFrameConfirmed = true;
    input.relevantProvisionsSatisfiedConfirmed = true;
    input.governingPuTf = 0.51 * input.compressionStrength.designCompressionStrengthTf;
  }],
]) {
  const input = checkInput();
  mutate(input);
  assert.throws(
    () => Axial.seismicAxialCheck(input),
    error => error instanceof Axial.SrcColumnSeismicAxialError && error.code === code,
    `${code} fails closed`
  );
}

console.log('SRC column seismic axial subcheck OK (clause 6.4 compression strength + clause 9.3 load combinations)');
