'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Shear = require('./core/src-column-shear.js');
const WeakAxisReference = require('./core/src-column-weak-axis-shear-reference.js');

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

assert.equal(Shear.VERSION, 'src-column.shear.v0.4.0-research', 'shear subcheck is explicitly versioned as research');
assert.equal(WeakAxisReference.VERSION, 'src-column.weak-axis-shear-reference.v0.1.0');
const referenceSource = fs.readFileSync(path.join(__dirname, 'core', 'src-column-weak-axis-shear-reference.js'), 'utf8');
const productionSource = fs.readFileSync(path.join(__dirname, 'core', 'src-column-shear.js'), 'utf8');
assert.equal(referenceSource.includes('require('), false, 'external reference imports no production calculation');
assert.equal(productionSource.includes('SrcColumnWeakAxisShearReference'), false, 'production shear does not silently consume the external reference');

const officialAiscG6 = WeakAxisReference.calculate({
  fy: 50,
  modulus: 29000,
  flangeWidth: 8.14,
  flangeThickness: 0.430,
});
close(officialAiscG6.flangeSlenderness, 9.465116279069768, 1e-12, 'AISC Companion Example G.6 flange slenderness');
close(officialAiscG6.yieldingLimit, 29.019993108200424, 1e-12, 'AISC Companion Example G.6 yielding limit');
assert.equal(officialAiscG6.cv2Equation, 'G2-9');
close(officialAiscG6.cv2, 1, 1e-12, 'AISC Companion Example G.6 Cv2');
close(officialAiscG6.shearArea, 7.0004, 1e-12, 'AISC Companion Example G.6 two-flange shear area');
close(officialAiscG6.nominalShear, 210.012, 1e-12, 'AISC Companion Example G.6 nominal shear before published rounding');
close(officialAiscG6.designShear, 189.0108, 1e-10, 'AISC Companion Example G.6 LRFD design shear before published rounding');
assert.equal(officialAiscG6.adoption, 'not-adopted-by-production');

const h500WeakAxisReference = WeakAxisReference.calculate({
  fy: 3500,
  modulus: 2040000,
  flangeWidth: 30.4,
  flangeThickness: 2.4,
  forceDivisor: 1000,
});
close(h500WeakAxisReference.flangeSlenderness, 6.333333333333333, 1e-12, 'H500x304x15x24 reference flange slenderness');
close(h500WeakAxisReference.nominalShear, 306.432, 1e-12, 'H500x304x15x24 AISC G6 project-specified reference Vns');
close(h500WeakAxisReference.designShear, 275.7888, 1e-10, 'H500x304x15x24 AISC G6 project-specified reference phi Vns');

const inelasticBuckling = WeakAxisReference.calculate({ fy: 1, modulus: 100, flangeWidth: 30, flangeThickness: 1 });
assert.equal(inelasticBuckling.cv2Equation, 'G2-10', 'intermediate flange slenderness uses the G2-10 Cv2 branch');
const elasticBuckling = WeakAxisReference.calculate({ fy: 1, modulus: 100, flangeWidth: 40, flangeThickness: 1 });
assert.equal(elasticBuckling.cv2Equation, 'G2-11', 'large flange slenderness uses the G2-11 Cv2 branch');
assert.throws(
  () => WeakAxisReference.calculate({ fy: 50, modulus: 29000, flangeWidth: 8.14, flangeThickness: 0.430, phi: 1.01 }),
  error => error instanceof WeakAxisReference.WeakAxisShearReferenceError && error.code === 'phi-out-of-range',
  'external reference fails closed on an invalid resistance factor'
);
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
  weakAxisRcDesignBasis: 'project-confirmed',
  weakAxisSteelNominalShearTf: 100,
  weakAxisRcNominalShearTf: 120,
  weakAxisRequiredTransverseAreaCm2: 1.2,
  weakAxisStrengthsConfirmed: true,
  weakAxisRcStrengthConfirmed: true,
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

const automaticWeakAxis = Shear.calculate({
  ...weakAxisInput,
  widthCm: 65,
  depthCm: 80,
  steelDepthCm: 50,
  steelFlangeWidthCm: 30.4,
  weakAxisRcDesignBasis: 'automatic-clause-5.5.2',
  weakAxisEffectiveDepthCm: 58,
  weakAxisAvCm2: 2.54,
  weakAxisAvfCm2: 2.54,
});
assert.equal(automaticWeakAxis.strengthSource, 'project-confirmed-steel+automatic-rc-clause-5.5.2');
assert.equal(automaticWeakAxis.rc.source, 'automatic-clause-5.5.2-selected-y-axis');
close(automaticWeakAxis.rc.sectionWidthCm, 80, 1e-12, 'weak-axis RC path rotates the concrete depth into selected-direction b');
close(automaticWeakAxis.rc.sectionDepthCm, 65, 1e-12, 'weak-axis RC path rotates the concrete width into selected-direction depth');
close(automaticWeakAxis.rc.effectiveDepthCm, 58, 1e-12, 'weak-axis RC path adopts the direction-specific effective depth');
close(automaticWeakAxis.rc.steelFrictionPlaneWidthCm, 50, 1e-12, 'weak-axis friction plane deducts the explicit embedded-steel dimension');
close(automaticWeakAxis.rc.netConcreteWidthCm, 30, 1e-12, 'weak-axis net concrete width is direction-aware');
close(automaticWeakAxis.rc.generalTf, 78.92336660475799, 1e-10, 'weak-axis clause 5.5.2 general-shear path');
close(automaticWeakAxis.rc.frictionTf, 62.862719999999996, 1e-10, 'weak-axis clause 5.5.2 shear-friction path');
close(automaticWeakAxis.rc.nominalShearTf, 62.862719999999996, 1e-10, 'weak-axis RC nominal strength takes the smaller path');
close(automaticWeakAxis.rc.requiredTransverseAreaCm2, 3.4994586271871935, 1e-10, 'weak-axis RC transverse-steel demand is calculated');
assert.equal(automaticWeakAxis.rc.governingMode, 'shear-friction');

const externallyTracedWeakAxis = Shear.calculate({
  ...weakAxisInput,
  weakAxisSteelNominalShearTf: h500WeakAxisReference.nominalShear,
});
close(externallyTracedWeakAxis.steel.nominalShearTf, h500WeakAxisReference.nominalShear, 1e-12, 'project-confirmed weak-axis Vns can be reproduced by the independent AISC G6 reference');
assert.equal(externallyTracedWeakAxis.strengthSource, 'project-confirmed-weak-axis', 'external comparison does not silently change the production authority label');

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
  ['confirmation-required', input => { input.weakAxisRcStrengthConfirmed = false; }],
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

for (const [code, mutate] of [
  ['unsupported-weak-axis-rc-design-basis', input => { input.weakAxisRcDesignBasis = 'invented'; }],
  ['effective-depth-outside-section', input => { input.weakAxisEffectiveDepthCm = 65; }],
  ['confirmation-required', input => { input.normalWeightConcreteConfirmed = false; }],
]) {
  const input = {
    ...weakAxisInput,
    widthCm: 65,
    depthCm: 80,
    steelDepthCm: 50,
    weakAxisRcDesignBasis: 'automatic-clause-5.5.2',
    weakAxisEffectiveDepthCm: 58,
    weakAxisAvCm2: 2.54,
    weakAxisAvfCm2: 2.54,
  };
  mutate(input);
  assert.throws(
    () => Shear.calculate(input),
    error => error instanceof Shear.SrcColumnShearError && error.code === code,
    `automatic weak-axis ${code} fails closed`
  );
}

console.log('SRC column seismic selected-axis shear subcheck OK (automatic x-axis + dual-basis y-axis RC boundaries)');
