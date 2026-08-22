'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('./core/src-column-core.js');

function close(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: actual must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: actual=${actual}, expected=${expected}, tolerance=${tolerance}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function officialGuideExample8() {
  return {
    schema: 'src-column.input.v2',
    caseName: 'MOI SRC design guide example 8',
    demands: { puTf: 734.0, muxTfM: 128.9, muyTfM: 0 },
    concrete: { widthCm: 65, depthCm: 80, fcKgfCm2: 280 },
    reinforcement: {
      tieType: 'tied',
      fyKgfCm2: 4200,
      esKgfCm2: 2_040_000,
      layers: [
        { yCm: 7, areaCm2: 6 * 5.07 },
        { yCm: 73, areaCm2: 6 * 5.07 },
      ],
    },
    steel: {
      shape: 'H500x304x15x24',
      grade: 'A572 Gr.50',
      depthCm: 50,
      flangeWidthCm: 30.4,
      flangeThicknessCm: 2.4,
      webThicknessCm: 1.5,
      areaCm2: 215,
      ixCm4: 95000,
      iyCm4: 11300,
      zxCm3: 4270,
      fysKgfCm2: 3500,
      esKgfCm2: 2_040_000,
    },
    member: { lengthCm: 350, kx: 1.53, ky: 1.83 },
    detailing: {
      fullyEncased: true,
      centeredDoublySymmetricH: true,
      mainBarsContinuous: true,
      secondOrderDemandIncluded: true,
      seismicDesign: false,
      redistributeToSteelBoundary: true,
    },
  };
}

assert.equal(Core.CORE_VERSION, 'src-column.core.v0.2.0-research', 'SRC column core is explicitly versioned as research');
assert.equal(Core.INPUT_SCHEMA, 'src-column.input.v2', 'SRC column core has a versioned input schema');
assert.equal(Core.RELEASE_STATUS, 'research-core-not-public', 'research core cannot be mistaken for a formal public route');
assert.equal(Core.REGULATION_PROFILE.id, 'tw-src-2011', 'SRC column core uses the official current profile');
assert.ok(Core.REGULATION_PROFILE.chapter3Url.endsWith('.pdf') && Core.REGULATION_PROFILE.chapter6Url.endsWith('.pdf') && Core.REGULATION_PROFILE.chapter7Url.endsWith('.pdf'), 'official chapter sources remain explicit');
assert.ok(Core.REGULATION_PROFILE.draftBoundary.includes('草案'), 'research draft remains separated from current regulation');

const official = Core.calculate(officialGuideExample8());
close(official.section.grossAreaCm2, 5200, 1e-10, 'example 8 gross area');
close(official.section.grossIxCm4, 65 * Math.pow(80, 3) / 12, 1e-8, 'example 8 gross Ix');
close(official.section.ecKgfCm2, 15000 * Math.sqrt(280), 1e-8, 'example 8 concrete modulus');
close(official.allocation.axialSteelRatio, 0.379, 0.001, 'example 8 axial stiffness ratio');
close(official.allocation.momentSteelRatioX, 0.443, 0.001, 'example 8 flexural stiffness ratio');
close(official.allocation.initialSteelDemands.puTf, 278.2, 0.3, 'example 8 initial steel axial demand');
close(official.allocation.initialSteelDemands.muxTfM, 57.1, 0.15, 'example 8 initial steel moment demand');

assert.equal(official.compactness.governingMode, 'general-lambda-p', 'nonseismic research scope uses table 3.4-2 lambda_p');
assert.equal(official.compactness.gradeGroup, '490', 'A572 Gr.50 maps to the 490-grade table row');
close(official.compactness.flangeRatio, 6.3333333333, 1e-9, 'example 8 flange b/tf');
close(official.compactness.webRatio, 30.1333333333, 1e-9, 'example 8 web hc/tw');
close(official.compactness.flangeGeneralLimit, 20, 1e-12, '490-grade general flange limit');
close(official.compactness.webGeneralLimit, 81, 1e-12, '490-grade general web limit');
close(official.compactness.flangeSeismicLimit, 21 / Math.sqrt(3.5), 1e-12, 'example 8 guide seismic-reference flange limit');
close(official.compactness.webSeismicLimit, 123 / Math.sqrt(3.5), 1e-12, 'example 8 guide seismic-reference web limit');
assert.equal(official.compactness.ok, true, 'example 8 passes the implemented general compactness boundary');

close(official.steel.compressionX.effectiveRadiusCm, 25.64, 0.03, 'example 8 effective steel radius x');
close(official.steel.compressionY.effectiveRadiusCm, 14.76, 0.03, 'example 8 effective steel radius y');
close(official.steel.compressionX.lambdaC, 0.275, 0.002, 'example 8 lambda x');
close(official.steel.compressionY.lambdaC, 0.572, 0.002, 'example 8 lambda y');
close(official.steel.compressionX.nominalCompressionTf, 729.0, 0.7, 'example 8 Pns x');
close(official.steel.compressionY.nominalCompressionTf, 656.1, 0.7, 'example 8 Pns y');
assert.equal(official.steel.compressionControlAxis, 'y', 'weak axis controls example 8 steel compression');
close(official.steel.nominalMomentXTfM, 149.5, 0.08, 'example 8 Mns x');
close(official.steel.initialInteraction.utilization, 0.876, 0.003, 'example 8 steel interaction beta');

assert.equal(official.redistribution.applied, true, 'example 8 applies clauses 7.3-9 and 7.3-10 redistribution');
close(official.redistribution.finalRcDemands.puTf, 416.4, 0.3, 'example 8 redistributed RC axial demand');
close(official.redistribution.finalRcDemands.muxTfM, 64.2, 0.6, 'example 8 redistributed RC moment demand');
close(official.steel.finalInteraction.utilization, 1.0, 1e-10, 'redistribution places steel on its interaction boundary');
close(official.rc.phiMnTfM, 126.5, 2.0, 'current strain-compatibility RC capacity agrees with official chart example');
assert.equal(official.checks.steelInteraction, true, 'official example steel portion passes');
assert.equal(official.checks.rcInteraction, true, 'official example RC portion passes');
assert.equal(official.checks.compactness, true, 'official example compactness passes');
assert.equal(official.checks.formalRelease, false, 'research result is never a formal release result');
assert.equal(official.status, 'REVIEW', 'engineering pass remains review until the tool boundary is completed');
assert.ok(official.reviewItems.some(item => item.code === 'section-properties-not-derived'), 'section-table property provenance gap stays visible');
assert.equal(official.reviewItems.some(item => item.code === 'compactness-not-recomputed'), false, 'completed automatic compactness is not reported as a remaining gap');

const noRedistributionInput = officialGuideExample8();
noRedistributionInput.detailing.redistributeToSteelBoundary = false;
const noRedistribution = Core.calculate(noRedistributionInput);
assert.equal(noRedistribution.redistribution.applied, false, 'redistribution is explicit, not silently assumed');
close(noRedistribution.redistribution.finalRcDemands.puTf, 734 - noRedistribution.allocation.initialSteelDemands.puTf, 1e-9, 'initial RC residual is preserved without redistribution');
assert.ok(noRedistribution.rc.ok, 'official example also passes the unreallocated RC demand with the current strain-compatible section');

const highDemandInput = officialGuideExample8();
highDemandInput.demands.muxTfM = 500;
const highDemand = Core.calculate(highDemandInput);
assert.equal(highDemand.status, 'NG', 'an RC or steel interaction failure produces NG even in research mode');
assert.equal(highDemand.checks.engineeringStrength, false, 'high-demand counterexample fails the engineering strength chain');

const slenderFlangeInput = officialGuideExample8();
slenderFlangeInput.steel.flangeThicknessCm = 0.5;
const slenderFlange = Core.calculate(slenderFlangeInput);
assert.equal(slenderFlange.compactness.flangeOk, false, 'slender synthetic flange fails table 3.4-2');
assert.equal(slenderFlange.status, 'NG', 'compactness failure cannot remain REVIEW');
assert.equal(slenderFlange.checks.engineeringStrength, false, 'compactness participates in the engineering check chain');

[
  ['unsupported-input-schema', input => { input.schema = 'src-column.input.v999'; }],
  ['biaxial-scope-not-implemented', input => { input.demands.muyTfM = 1; }],
  ['second-order-demand-not-confirmed', input => { input.detailing.secondOrderDemandIncluded = false; }],
  ['seismic-scope-not-implemented', input => { input.detailing.seismicDesign = true; }],
  ['not-fully-encased', input => { input.detailing.fullyEncased = false; }],
  ['unsupported-steel-shape', input => { input.detailing.centeredDoublySymmetricH = false; }],
  ['main-bars-not-continuous', input => { input.detailing.mainBarsContinuous = false; }],
  ['unsupported-steel-grade', input => { input.steel.grade = 'unknown'; }],
  ['invalid-h-section-flange-geometry', input => { input.steel.flangeThicknessCm = 25; }],
  ['invalid-h-section-web-geometry', input => { input.steel.webThicknessCm = 30.4; }],
  ['compression-demand-required', input => { input.demands.puTf = 0; }],
  ['steel-ratio-below-src-scope', input => { input.steel.areaCm2 = 100; }],
  ['longitudinal-ratio-below-scope', input => { input.reinforcement.layers.forEach(layer => { layer.areaCm2 = 20; }); }],
  ['longitudinal-ratio-above-scope', input => { input.reinforcement.layers.forEach(layer => { layer.areaCm2 = 220; }); }],
  ['concrete-strength-below-scope', input => { input.concrete.fcKgfCm2 = 209; }],
  ['high-strength-concrete-evidence-missing', input => { input.concrete.fcKgfCm2 = 421; }],
  ['high-strength-material-evidence-missing', input => { input.steel.fysKgfCm2 = 3521; }],
].forEach(([expectedCode, mutate]) => {
  const input = officialGuideExample8();
  mutate(input);
  assert.throws(
    () => Core.calculate(input),
    error => error instanceof Core.SrcColumnInputError && error.issues.some(item => item.code === expectedCode),
    `${expectedCode} fails closed`
  );
});

const catalogPath = path.join(__dirname, 'src-column-traceability.catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
assert.equal(catalog.coreVersion, Core.CORE_VERSION, 'SRC column traceability follows the research engine version');
assert.equal(catalog.release.status, Core.RELEASE_STATUS, 'traceability catalog keeps the core non-public');
assert.equal(catalog.regulation.chapter3Url, Core.REGULATION_PROFILE.chapter3Url, 'catalog and core use the same official chapter 3 source');
assert.equal(catalog.regulation.chapter7Url, Core.REGULATION_PROFILE.chapter7Url, 'catalog and core use the same official chapter 7 source');
assert.deepEqual(
  catalog.equations.map(item => item.id),
  ['src-3.4-2', 'src-6.4-2-5', 'src-7.3-3-6', 'src-7.3-7-8', 'src-7.3-9-10', 'rc-pm-current'],
  'catalog covers every implemented equation family'
);
assert.equal(catalog.goldenCases[0].id, 'MOI-SRC-GUIDE-COLUMN-EXAMPLE-8', 'official example 8 remains the canonical research golden case');
assert.ok(catalog.goldenCases[0].sourceArithmeticNote.includes('57.1') && catalog.goldenCases[0].sourceArithmeticNote.includes('56.7'), 'catalog discloses the guide example arithmetic inconsistency');
close(catalog.goldenCases[0].expected.flangeRatio, official.compactness.flangeRatio, 1e-9, 'catalog preserves the example 8 flange compactness benchmark');
close(catalog.goldenCases[0].expected.webRatio, official.compactness.webRatio, 1e-9, 'catalog preserves the example 8 web compactness benchmark');
close(catalog.goldenCases[0].expected.flangeSeismicReferenceLimit, official.compactness.flangeSeismicLimit, 1e-9, 'catalog preserves the example 8 flange lambda_pd reference');
close(catalog.goldenCases[0].expected.webSeismicReferenceLimit, official.compactness.webSeismicLimit, 1e-9, 'catalog preserves the example 8 web lambda_pd reference');
assert.equal(catalog.oracle.file, 'core/src-column-oracle.js', 'catalog identifies the independent oracle');
assert.equal(catalog.oracle.comparisonCount, 30, 'catalog states the independently compared arithmetic surface');
assert.ok(catalog.oracle.uncovered.includes('RC 應變相容 P-M'), 'catalog does not overclaim independent RC P-M coverage');

for (const missingPath of ['depthCm', 'flangeWidthCm', 'flangeThicknessCm', 'webThicknessCm']) {
  const input = officialGuideExample8();
  delete input.steel[missingPath];
  assert.throws(
    () => Core.calculate(input),
    error => error instanceof Core.SrcColumnInputError && error.issues.some(item => item.path === `steel.${missingPath}`),
    `steel.${missingPath} is required for the encasement boundary`
  );
}

for (const [group, field] of [['concrete', 'ecKgfCm2'], ['reinforcement', 'esKgfCm2'], ['steel', 'esKgfCm2']]) {
  const input = officialGuideExample8();
  input[group][field] = 0;
  assert.throws(
    () => Core.calculate(input),
    error => error instanceof Core.SrcColumnInputError && error.issues.some(item => item.path === `${group}.${field}`),
    `${group}.${field} cannot silently fall back when an invalid explicit value is supplied`
  );
}

console.log('SRC column research core OK (official guide example 8 + fail-closed scope)');
