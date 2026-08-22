'use strict';

const assert = require('node:assert/strict');
const Shear = require('./core/src-column-shear.js');

function close(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: actual must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: actual=${actual}, expected=${expected}, tolerance=${tolerance}`);
}

function officialExample14ShearInput() {
  return {
    axis: 'x',
    widthCm: 80,
    depthCm: 80,
    fcKgfCm2: 280,
    steelDepthCm: 49.4,
    steelFlangeWidthCm: 30.2,
    steelWebThicknessCm: 1.3,
    steelFywKgfCm2: 3500,
    steelNominalMomentTfM: 163.7,
    rcProbableMomentTfM: 104.7,
    rcAxialDemandTf: 355.5,
    effectiveDepthCm: 69.7,
    avCm2: 2 * 1.27,
    avfCm2: 2 * 1.27,
    spacingCm: 35,
    fyhKgfCm2: 4200,
    mctTfM: 191.9,
    mcbTfM: 191.9,
    clearHeightCm: 225,
    frictionCoefficient: 0.8,
    frictionK1KgfCm2: 28,
    shearStudContributionTf: 0,
    projectPlasticHingeMomentsConfirmed: true,
    normalWeightConcreteConfirmed: true,
    monolithicInterfaceConfirmed: true,
    transverseReinforcementPerpendicularConfirmed: true,
  };
}

assert.equal(Shear.VERSION, 'src-column.shear.v0.3.0-research', 'shear subcheck is explicitly versioned as research');
close(Shear.columnDemandShear(191.9, 191.9, 225), 170.57777777777778, 1e-12, 'equation 9.6-5 column demand shear');

const steel = Shear.steelNominalShear(3500, 1.3, 49.4);
close(steel.webAreaCm2, 64.22, 1e-12, 'example 14 steel web area');
close(steel.nominalShearTf, 134.862, 1e-12, 'example 14 equation 5.5-3 nominal steel shear');
close(steel.designShearTf, 121.3758, 1e-12, 'example 14 design steel shear');

const example14 = Shear.calculate(officialExample14ShearInput());
assert.equal(example14.mode, 'seismic-selected-axis-subcheck', 'the implemented mode cannot be mistaken for complete seismic design');
close(example14.demand.shearTf, 170.57777777777778, 1e-12, 'example 14 probable column shear');
close(example14.probableMoments.totalTfM, 268.4, 1e-12, 'example 14 probable composite moment');
close(example14.steel.requiredShearTf, 104.03719158801127, 1e-12, 'example 14 steel share of shear');
close(example14.rc.requiredShearTf, 66.54058618976653, 1e-12, 'example 14 RC share of shear');
close(example14.rc.concreteTf, 69.07175560232929, 1e-10, 'example 14 axial-compression concrete shear term');
close(example14.rc.frictionConcreteTf, 97.18968, 1e-10, 'example 14 shear-friction concrete term');
close(example14.rc.requiredGeneralAreaCm2, 2.349237922528226, 1e-12, 'example 14 required general-shear transverse area at 35 cm spacing');
close(example14.rc.requiredFrictionAreaCm2, 0, 1e-12, 'example 14 shear-friction concrete term alone covers the allocated nominal demand');
close(example14.rc.requiredTransverseAreaCm2, 2.349237922528226, 1e-12, 'example 14 shear demand passed to confinement uses the governing required transverse area');
assert.equal(example14.rc.governingMode, 'general-shear', '35 cm example is governed by general shear');
assert.equal(example14.steel.ok, true, 'official example steel share passes');
assert.equal(example14.rc.ok, true, 'official example RC share passes at 35 cm');
assert.equal(example14.ok, true, 'both separately allocated shear checks must pass');
assert.equal(example14.completeSeismicDesign, false, 'a shear subcheck never claims complete seismic design');

const weakAxisInput = {
  ...officialExample14ShearInput(),
  axis: 'y',
  steelNominalMomentTfM: 39.9,
  rcProbableMomentTfM: 80,
  mctTfM: 120,
  mcbTfM: 110,
  clearHeightCm: 300,
  weakAxisSteelNominalShearTf: 100,
  weakAxisRcNominalShearTf: 120,
  weakAxisRequiredTransverseAreaCm2: 1.2,
  weakAxisStrengthsConfirmed: true,
  weakAxisRequiredTransverseAreaConfirmed: true,
};
const weakAxis = Shear.calculate(weakAxisInput);
assert.equal(weakAxis.axis, 'y');
assert.equal(weakAxis.strengthSource, 'project-confirmed-weak-axis');
close(weakAxis.demand.shearTf, 76.66666666666667, 1e-12, 'weak-axis demand remains equation 9.6-5');
close(weakAxis.steel.designShearTf, 90, 1e-12, 'weak-axis steel design strength applies phi to the project-confirmed nominal value');
close(weakAxis.rc.designShearTf, 90, 1e-12, 'weak-axis RC design strength applies phi to the project-confirmed nominal value');
close(weakAxis.rc.requiredTransverseAreaCm2, 1.2, 1e-12, 'weak-axis confinement receives the project-confirmed transverse area');
assert.equal(Object.hasOwn(weakAxis.steel, 'webAreaCm2'), false, 'weak-axis steel strength does not fabricate a rotated web area');

const tooWideSpacing = officialExample14ShearInput();
tooWideSpacing.spacingCm = 45;
const failedRc = Shear.calculate(tooWideSpacing);
assert.equal(failedRc.steel.ok, true, 'steel can pass independently');
assert.equal(failedRc.rc.ok, false, 'insufficient transverse reinforcement fails the RC share');
assert.equal(failedRc.ok, false, 'one failed component cannot be hidden by the other component');

const frictionControlled = Shear.rcNominalShear({
  ...officialExample14ShearInput(),
  spacingCm: 10,
  frictionK1KgfCm2: 14,
});
assert.equal(frictionControlled.governingMode, 'shear-friction', 'the smaller shear-friction path governs when appropriate');
close(frictionControlled.nominalShearTf, frictionControlled.frictionTf, 1e-12, 'nominal RC shear takes the smaller failure mode');

for (const [code, mutate] of [
  ['unsupported-shear-axis', input => { input.axis = 'z'; }],
  ['confirmation-required', input => { input.projectPlasticHingeMomentsConfirmed = false; }],
  ['shear-stud-scope-not-implemented', input => { input.shearStudContributionTf = 1; }],
  ['finite-number-required', input => { input.rcAxialDemandTf = null; }],
  ['effective-depth-outside-section', input => { input.effectiveDepthCm = 80; }],
  ['probable-end-moment-required', input => { input.mctTfM = 0; input.mcbTfM = 0; }],
]) {
  const input = officialExample14ShearInput();
  mutate(input);
  assert.throws(
    () => Shear.calculate(input),
    error => error instanceof Shear.SrcColumnShearError && error.code === code,
    `${code} fails closed`
  );
}

for (const [code, mutate] of [
  ['confirmation-required', input => { input.weakAxisStrengthsConfirmed = false; }],
  ['confirmation-required', input => { input.weakAxisRequiredTransverseAreaConfirmed = false; }],
  ['positive-number-required', input => { input.weakAxisSteelNominalShearTf = 0; }],
  ['nonnegative-number-required', input => { input.weakAxisRequiredTransverseAreaCm2 = -0.1; }],
]) {
  const input = { ...weakAxisInput };
  mutate(input);
  assert.throws(
    () => Shear.calculate(input),
    error => error instanceof Shear.SrcColumnShearError && error.code === code,
    `weak-axis ${code} fails closed`
  );
}

console.log('SRC column seismic selected-axis shear subcheck OK (automatic x-axis + project-confirmed y-axis boundaries)');
