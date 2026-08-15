'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('./core/src-beam-core.js');

function close(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: actual must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: actual=${actual}, expected=${expected}, tolerance=${tolerance}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function officialBeamExample() {
  return {
    schema: 'src-beam.input.v1',
    caseName: 'MOI SRC guide beam examples 1 and 2',
    demands: { puTf: 0, muTfM: 150, vuTf: 96.5 },
    concrete: {
      bCm: 50,
      hCm: 80,
      fcKgfCm2: 280,
      flexureDepthCm: 68,
      compressionSteelDepthCm: 12,
      shearDepthCm: 73,
    },
    reinforcement: {
      asTensionCm2: 4 * 8.17,
      asCompressionCm2: 4 * 8.17,
      fyrTensionKgfCm2: 4200,
      fyrCompressionKgfCm2: 4200,
      esKgfCm2: 2_040_000,
      avCm2: 2 * 0.713,
      avfCm2: 2 * 0.713,
      spacingCm: 15,
      fyhKgfCm2: 4200,
    },
    steel: {
      grade: 'A572 Gr.50',
      depthCm: 51.2,
      flangeWidthCm: 20.2,
      flangeThicknessCm: 2.2,
      webThicknessCm: 1.2,
      zCm3: 2870,
      fysKgfCm2: 3500,
      fywKgfCm2: 3500,
    },
    shearFriction: { mu: 0.8, k1KgfCm2: 28, studContributionTf: 0 },
    detailing: {
      fullyEncased: true,
      normalWeightConcrete: true,
      monolithicShearFrictionSurface: true,
      mainBarsContinuous: true,
      longitudinalClearSpacingMm: 25,
      reinforcementDetailingConfirmed: true,
      temporaryShoringProvided: true,
      steelConstructionCapacityVerified: false,
      seismicDesign: false,
    },
  };
}

assert.equal(Core.CORE_VERSION, 'src-beam.core.v0.1.0', 'SRC beam core has a versioned calculation engine');
assert.equal(Core.INPUT_SCHEMA, 'src-beam.input.v1', 'SRC beam core has a versioned input schema');
assert.equal(Core.REGULATION_PROFILE.id, 'tw-src-2011', 'SRC beam core names the current official profile');
assert.ok(Core.REGULATION_PROFILE.versionLabel.includes('100 年修正版'), 'SRC beam profile identifies the official amendment');
assert.ok(Core.REGULATION_PROFILE.draftBoundary.includes('修正草案'), 'SRC beam profile separates the research draft from current law');

const official = Core.calculate(officialBeamExample());
close(official.flexure.neutralAxisCm, 12.6, 0.08, 'official example neutral axis');
close(official.flexure.stressBlockDepthCm, 10.7, 0.08, 'official example stress block');
close(official.flexure.mnSteelTfM, 100.5, 0.08, 'official example Mns');
close(official.flexure.mnRcTfM, 85.33380548, 1e-6, 'full-precision Mnrc equilibrium');
close(official.flexure.mnRcTfM, 85.1, 0.3, 'official example rounded Mnrc');
close(official.flexure.nominalMomentTfM, 185.6, 0.25, 'official example rounded Mn');
close(official.flexure.designMomentTfM, 167.205, 0.02, 'full-precision phi Mn');
assert.ok(Math.abs(official.flexure.equilibriumResidualTf) < 1e-8, 'RC flexure equilibrium closes numerically');
assert.ok(official.flexure.compressionSteel.stress < 4200, 'official example compression steel remains below yield');
assert.ok(official.flexure.tensionSteel.stress < 0, 'official example tension steel sign is preserved');

close(official.shear.vnSteelTf, 129.0, 0.08, 'official example Vns');
close(official.shear.vnRcGeneralTf, 61.5, 0.12, 'official example general Vnrc');
close(official.shear.vnRcFrictionTf, 84.2, 0.15, 'official example friction Vnrc');
close(official.shear.vnRcTf, 61.5, 0.12, 'official example governing Vnrc');
close(official.shear.nominalSumTf, 190.5, 0.18, 'official example nominal shear sum');
assert.equal(official.shear.rcControlMode, 'general-shear', 'official example is governed by general RC shear');
assert.equal(official.checks.flexure, true, 'official demand passes flexure');
assert.equal(official.checks.steelShearShare, true, 'official demand passes the steel shear share');
assert.equal(official.checks.rcShearShare, true, 'official demand passes the RC shear share');
assert.equal(official.status, 'OK', 'fully confirmed official example is OK');

const shearCapInput = officialBeamExample();
shearCapInput.reinforcement.avCm2 = 100;
shearCapInput.reinforcement.avfCm2 = 100;
const shearCap = Core.calculate(shearCapInput);
close(shearCap.shear.stirrupCapTf, 2.12 * Math.sqrt(280) * 50 * 73 / 1000, 1e-10, 'general shear reinforcement cap');
close(shearCap.shear.frictionStirrupCapTf, 2.12 * 0.8 * Math.sqrt(280) * 50 * 73 / 1000, 1e-10, 'shear-friction reinforcement cap');
assert.equal(shearCap.shear.vnrTf, shearCap.shear.stirrupCapTf, 'large Av is capped by clause 5.5.2 general limit');
assert.equal(shearCap.shear.vnrFrictionTf, shearCap.shear.frictionStirrupCapTf, 'large Avf is capped by clause 5.5.2 friction limit');

const highShearInput = officialBeamExample();
highShearInput.demands.vuTf = 110;
const highShear = Core.calculate(highShearInput);
assert.equal(highShear.checks.steelShearShare, true, 'high-shear counterexample still passes the steel share');
assert.equal(highShear.checks.rcShearShare, false, 'high-shear counterexample fails the RC share independently');
assert.equal(highShear.status, 'NG', 'one failed shear share makes the SRC result NG');
assert.ok(highShear.shear.nominalSumTf > highShearInput.demands.vuTf, 'counterexample proves a raw nominal-capacity sum would look unconservatively acceptable');

const reviewInput = officialBeamExample();
reviewInput.detailing.temporaryShoringProvided = false;
const review = Core.calculate(reviewInput);
assert.equal(review.status, 'REVIEW', 'missing construction-stage verification cannot become formal OK');
assert.ok(review.reviewItems.some(item => item.code === 'construction-stage-review'), 'construction-stage review stays explicit');

const singlyReinforcedInput = officialBeamExample();
singlyReinforcedInput.reinforcement.asCompressionCm2 = 0;
singlyReinforcedInput.reinforcement.fyrCompressionKgfCm2 = 0;
const singlyReinforced = Core.calculate(singlyReinforcedInput);
assert.ok(singlyReinforced.flexure.mnRcTfM > 0, 'singly reinforced RC contribution remains within the v0.1 section solver');
assert.equal(singlyReinforced.flexure.compressionSteel.forceTf, 0, 'zero compression reinforcement contributes no artificial force');

[
  ['seismic-scope-not-implemented', input => { input.detailing.seismicDesign = true; }],
  ['axial-force-outside-scope', input => { input.demands.puTf = 5; }],
  ['not-fully-encased', input => { input.detailing.fullyEncased = false; }],
  ['main-bars-not-continuous', input => { input.detailing.mainBarsContinuous = false; }],
  ['longitudinal-clear-spacing', input => { input.detailing.longitudinalClearSpacingMm = 24.9; }],
  ['unsupported-shear-stud-contribution', input => { input.shearFriction.studContributionTf = 1; }],
  ['normal-weight-concrete-not-confirmed', input => { input.detailing.normalWeightConcrete = false; }],
  ['monolithic-surface-not-confirmed', input => { input.detailing.monolithicShearFrictionSurface = false; }],
  ['unsupported-input-schema', input => { input.schema = 'src-beam.input.v999'; }],
  ['high-strength-concrete-evidence-missing', input => { input.concrete.fcKgfCm2 = 421; }],
  ['high-strength-material-evidence-missing', input => { input.steel.fysKgfCm2 = 3521; }],
].forEach(([expectedCode, mutate]) => {
  const input = officialBeamExample();
  mutate(input);
  assert.throws(
    () => Core.calculate(input),
    error => error instanceof Core.SrcBeamInputError && error.issues.some(item => item.code === expectedCode),
    `${expectedCode} fails closed`
  );
});

const compactnessFailInput = officialBeamExample();
compactnessFailInput.steel.flangeThicknessCm = 0.45;
const compactnessFail = Core.calculate(compactnessFailInput);
assert.equal(compactnessFail.checks.flangeCompactness, false, 'noncompact encased flange is a failed engineering check');
assert.equal(compactnessFail.status, 'NG', 'width-thickness failure makes the result NG');

const catalogPath = path.join(__dirname, 'src-traceability.catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
assert.equal(catalog.coreVersion, Core.CORE_VERSION, 'traceability catalog follows the calculation engine version');
assert.equal(catalog.regulation.officialPage, Core.REGULATION_PROFILE.officialPage, 'traceability catalog and core use the same official page');
assert.ok(catalog.regulation.draftBoundary.includes('修正草案'), 'traceability catalog rejects draft-as-law ambiguity');
assert.deepEqual(
  catalog.equations.map(item => item.id),
  ['src-5.4-1', 'src-mns', 'src-5.5-1', 'src-5.5-2', 'src-5.5-3', 'src-5.5-4', 'src-5.5-10', 'src-3.4'],
  'traceability catalog covers every implemented SRC equation family'
);
assert.equal(catalog.goldenCases[0].id, 'MOI-SRC-GUIDE-BEAM-EXAMPLE-1-2', 'official guide example remains the canonical golden case');
assert.ok(catalog.goldenCases[0].sourceUrl.startsWith('https://www.abri.gov.tw/'), 'golden case retains an official source URL');

console.log('SRC beam core regression OK (official flexure/shear examples + fail-closed boundaries)');
