'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('./core/src-column-core.js');
const WeakAxisReference = require('./core/src-column-weak-axis-shear-reference.js');

function close(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: actual must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: actual=${actual}, expected=${expected}, tolerance=${tolerance}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function officialGuideExample8() {
  const barAreaCm2 = 5.07;
  return {
    schema: Core.INPUT_SCHEMA,
    caseName: 'MOI SRC design guide example 8',
    seismicAxis: 'x',
    demands: { puTf: 734.0, muxTfM: 128.9, muyTfM: 0 },
    concrete: { widthCm: 65, depthCm: 80, fcKgfCm2: 280 },
    reinforcement: {
      tieType: 'tied',
      fyKgfCm2: 4200,
      esKgfCm2: 2_040_000,
      layers: [
        { yCm: 7, areaCm2: 4 * 5.07 },
        { yCm: 17, areaCm2: 2 * 5.07 },
        { yCm: 63, areaCm2: 2 * 5.07 },
        { yCm: 73, areaCm2: 4 * 5.07 },
      ],
      xLayers: [
        { xCm: 7, areaCm2: 4 * 5.07 },
        { xCm: 17, areaCm2: 2 * 5.07 },
        { xCm: 48, areaCm2: 2 * 5.07 },
        { xCm: 58, areaCm2: 4 * 5.07 },
      ],
      bars: [
        { xCm: 7, yCm: 7, areaCm2: barAreaCm2 }, { xCm: 17, yCm: 7, areaCm2: barAreaCm2 },
        { xCm: 48, yCm: 7, areaCm2: barAreaCm2 }, { xCm: 58, yCm: 7, areaCm2: barAreaCm2 },
        { xCm: 7, yCm: 17, areaCm2: barAreaCm2 }, { xCm: 58, yCm: 17, areaCm2: barAreaCm2 },
        { xCm: 7, yCm: 63, areaCm2: barAreaCm2 }, { xCm: 58, yCm: 63, areaCm2: barAreaCm2 },
        { xCm: 7, yCm: 73, areaCm2: barAreaCm2 }, { xCm: 17, yCm: 73, areaCm2: barAreaCm2 },
        { xCm: 48, yCm: 73, areaCm2: barAreaCm2 }, { xCm: 58, yCm: 73, areaCm2: barAreaCm2 },
      ],
    },
    steel: {
      catalogId: 'rh-500x304x15x24',
      grade: 'A572 Gr.50',
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

function manualExample8() {
  const input = officialGuideExample8();
  delete input.steel.catalogId;
  Object.assign(input.steel, {
    shape: 'H500x304x15x24',
    depthCm: 50,
    flangeWidthCm: 30.4,
    flangeThicknessCm: 2.4,
    webThicknessCm: 1.5,
    areaCm2: 215,
    ixCm4: 95000,
    iyCm4: 11300,
    zxCm3: 4270,
    zyCm3: 1140,
  });
  return input;
}

assert.equal(Core.CORE_VERSION, 'src-column.core.v0.12.0-research', 'SRC column core is explicitly versioned as research');
assert.equal(Core.INPUT_SCHEMA, 'src-column.input.v11', 'SRC column core has a versioned input schema');
assert.equal(Core.RELEASE_STATUS, 'research-core-not-public', 'research core cannot be mistaken for a formal public route');
assert.equal(Core.REGULATION_PROFILE.id, 'tw-src-2011', 'SRC column core uses the official current profile');
assert.ok(Core.REGULATION_PROFILE.chapter3Url.endsWith('.pdf') && Core.REGULATION_PROFILE.chapter5Url.endsWith('.pdf') && Core.REGULATION_PROFILE.chapter6Url.endsWith('.pdf') && Core.REGULATION_PROFILE.chapter7Url.endsWith('.pdf') && Core.REGULATION_PROFILE.chapter8Url.endsWith('.pdf') && Core.REGULATION_PROFILE.chapter9Url.endsWith('.pdf'), 'official chapter sources remain explicit');
assert.ok(Core.REGULATION_PROFILE.draftBoundary.includes('草案'), 'research draft remains separated from current regulation');

const official = Core.calculate(officialGuideExample8());
assert.equal(official.steelSection.source.mode, 'catalog', 'official example properties are resolved from the verified catalog');
assert.equal(official.steelSection.source.catalogId, 'rh-500x304x15x24', 'result preserves the adopted catalog identity');
assert.equal(official.steelSection.source.catalogVersion, 'src-column.h-section-catalog.v0.1.0-research', 'result preserves the catalog version');
assert.equal(official.steelSection.source.printedPage, 289, 'result preserves the printed source page');
assert.equal(official.steelSection.source.pdfPage, 301, 'result preserves the PDF source page');
assert.equal(official.steelSection.properties.areaCm2, 215, 'catalog supplies example 8 area without manual duplication');
assert.equal(official.steelSection.properties.ixCm4, 95000, 'catalog supplies example 8 Ix without manual duplication');
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
close(official.steel.nominalMomentYTfM, 39.9, 0.08, 'example 8 Mns y');
close(official.steel.initialInteraction.utilization, 0.876, 0.003, 'example 8 steel interaction beta');

assert.equal(official.redistribution.applied, true, 'example 8 applies clauses 7.3-9 and 7.3-10 redistribution');
close(official.redistribution.finalRcDemands.puTf, 416.4, 0.3, 'example 8 redistributed RC axial demand');
close(official.redistribution.finalRcDemands.muxTfM, 64.2, 0.6, 'example 8 redistributed RC moment demand');
close(official.steel.finalInteraction.utilization, 1.0, 1e-10, 'redistribution places steel on its interaction boundary');
close(official.rc.phiMnTfM, 121.4, 0.15, 'strain-compatibility RC capacity follows the four-layer bar layout shown in the guide');
assert.ok(Math.abs(official.rc.phiMnTfM - 126.5) / 126.5 < 0.05, 'continuous strain compatibility remains within 5% of the guide chart interpolation');
assert.equal(official.checks.steelInteraction, true, 'official example steel portion passes');
assert.equal(official.checks.rcInteraction, true, 'official example RC portion passes');
assert.equal(official.checks.compactness, true, 'official example compactness passes');
assert.equal(official.checks.formalRelease, false, 'research result is never a formal release result');
assert.equal(official.status, 'REVIEW', 'engineering pass remains review until the tool boundary is completed');
assert.equal(official.reviewItems.some(item => item.code === 'section-properties-manual'), false, 'catalog-backed properties do not produce the manual-source review');
assert.equal(official.reviewItems.some(item => item.code === 'section-properties-not-derived'), false, 'completed catalog provenance is not reported as an old gap');
assert.equal(official.reviewItems.some(item => item.code === 'compactness-not-recomputed'), false, 'completed automatic compactness is not reported as a remaining gap');

const manual = Core.calculate(manualExample8());
assert.ok(manual.reviewItems.some(item => item.code === 'section-properties-manual'), 'manual properties remain usable but visibly require review');
close(manual.steel.nominalMomentXTfM, official.steel.nominalMomentXTfM, 1e-12, 'matching manual and catalog values produce the same steel capacity');

const noRedistributionInput = officialGuideExample8();
noRedistributionInput.detailing.redistributeToSteelBoundary = false;
const noRedistribution = Core.calculate(noRedistributionInput);
assert.equal(noRedistribution.redistribution.applied, false, 'redistribution is explicit, not silently assumed');
close(noRedistribution.redistribution.finalRcDemands.puTf, 734 - noRedistribution.allocation.initialSteelDemands.puTf, 1e-9, 'initial RC residual is preserved without redistribution');
assert.ok(noRedistribution.rc.ok, 'official example also passes the unreallocated RC demand with the current strain-compatible section');

const biaxialInput = officialGuideExample8();
biaxialInput.demands.muyTfM = 30;
const biaxial = Core.calculate(biaxialInput);
assert.equal(biaxial.rc.biaxial, true, 'nonzero Muy selects the biaxial RC engine');
assert.equal(biaxial.rc.method, 'exact-polygon-log-bisection', 'production biaxial engine uses exact compression-polygon integration');
assert.equal(biaxial.rc.angleSteps, 72, 'biaxial surface uses the governed angular resolution');
assert.ok(biaxial.allocation.momentSteelRatioY > 0 && biaxial.allocation.momentSteelRatioY < 1, 'Muy is allocated by weak-axis relative stiffness');
assert.ok(biaxial.steel.initialInteraction.momentRatioY > 0, 'steel equations 7.3-7/8 include the weak-axis moment term');
assert.ok(Math.abs(biaxial.steel.finalInteraction.utilization - 1) < 1e-10, 'biaxial redistribution places steel on the full three-term boundary');
assert.ok(Number.isFinite(biaxial.rc.capacityMuxTfM) && Number.isFinite(biaxial.rc.capacityMuyTfM), 'biaxial RC demand ray returns both capacity components');
assert.ok(biaxial.rc.biaxialSurface.length === 72 && biaxial.rc.biaxialHull.length >= 3, 'biaxial RC result retains reviewable surface and hull points');
close(biaxial.redistribution.beta, 0.9697375509552353, 1e-10, 'derived biaxial case redistribution beta');
close(biaxial.rc.utilization, 0.722961423183255, 1e-9, 'derived biaxial case RC utilization');
close(biaxial.rc.capacityMuxTfM, 96.8383719409521, 1e-8, 'derived biaxial case Mux capacity component');
close(biaxial.rc.capacityMuyTfM, 36.13180489461291, 1e-8, 'derived biaxial case Muy capacity component');

const seismicShearInput = officialGuideExample8();
seismicShearInput.detailing.seismicDesign = true;
seismicShearInput.detailing.seismicColumnShearSubcheck = true;
seismicShearInput.steel.fywKgfCm2 = 3500;
seismicShearInput.shear = {
  axis: 'x',
  mctTfM: 120,
  mcbTfM: 110,
  clearHeightCm: 300,
  effectiveDepthCm: 73,
  avCm2: 2 * 1.27,
  avfCm2: 2 * 1.27,
  spacingCm: 20,
  fyhKgfCm2: 4200,
  shearStudContributionTf: 0,
  projectPlasticHingeMomentsConfirmed: true,
  normalWeightConcreteConfirmed: true,
  monolithicInterfaceConfirmed: true,
  transverseReinforcementPerpendicularConfirmed: true,
};
const seismicShear = Core.calculate(seismicShearInput);
assert.equal(seismicShear.compactness.governingMode, 'seismic-lambda-pd-subcheck', 'seismic shear path governs compactness with lambda-pd');
assert.equal(seismicShear.compactness.seismicDesignSupported, false, 'a limited shear subcheck never claims complete seismic support');
assert.equal(seismicShear.compactness.seismicScope, 'limited-current-code-subchecks', 'compactness exposes the limited seismic scope separately');
assert.equal(seismicShear.shear.mode, 'seismic-selected-axis-subcheck', 'integrated result preserves the limited selected-axis shear mode');
close(seismicShear.shear.demand.shearTf, 76.66666666666667, 1e-12, 'derived equation 9.6-5 demand');
close(seismicShear.shear.probableMoments.rcProbableMomentTfM, 106.47554095016433, 1e-10, 'production recomputes RC probable moment with 1.25 Fyr');
close(seismicShear.shear.steel.utilization, 0.31583903435376404, 1e-12, 'derived steel shear utilization');
close(seismicShear.shear.rc.utilization, 0.41746744896153815, 1e-12, 'derived RC shear utilization');
assert.equal(seismicShear.shear.rc.governingMode, 'shear-friction', 'derived integrated case reports the governing RC failure mode');
assert.equal(seismicShear.checks.columnShear, true, 'both allocated shear paths pass');
assert.equal(seismicShear.checks.completeSeismicDesign, false, 'shear subcheck does not claim complete seismic design');
assert.ok(seismicShear.reviewItems.some(item => item.code === 'seismic-column-subchecks-only'), 'remaining seismic scope is explicit');
assert.equal(seismicShear.status, 'REVIEW', 'passing seismic shear remains a non-public review result');

const seismicAxialInput = officialGuideExample8();
seismicAxialInput.detailing.seismicDesign = true;
seismicAxialInput.detailing.seismicAxialStrengthSubcheck = true;
seismicAxialInput.seismicAxial = {
  pdTf: 400,
  plTf: 100,
  peTf: 80,
  fu: 3,
  fuFromProjectSeismicCriteriaConfirmed: true,
  parkingUse: true,
  publicAssemblyUse: false,
  liveLoadExceeds05TfM2: false,
  applyTransferCapacityCap: false,
  applyMomentFrameOmission: false,
};
const seismicAxial = Core.calculate(seismicAxialInput);
assert.equal(seismicAxial.seismicAxial.mode, 'seismic-axial-strength-subcheck', 'integrated result preserves the limited axial-strength mode');
assert.equal(seismicAxial.seismicAxial.factors.adoptedFu, 2.5, 'integrated axial subcheck caps Fu at 2.5 and discloses it');
close(seismicAxial.seismicAxial.compression.adoptedDemandTf, 860, 1e-12, 'integrated equation 9.3-1 compression demand');
assert.equal(seismicAxial.seismicAxial.tension.applicable, false, 'integrated case does not invent tensile strength without tensile demand');
assert.equal(seismicAxial.seismicAxial.compressionStrength.steel.controlAxis, 'y', 'integrated clause 6.4 strength uses the governing steel axis');
assert.equal(seismicAxial.checks.seismicAxialStrength, true, 'seismic axial strength participates in the engineering chain');
assert.equal(seismicAxial.checks.completeSeismicDesign, false, 'axial subcheck does not claim complete seismic design');
assert.equal(seismicAxial.status, 'REVIEW', 'passing seismic axial strength remains a non-public review result');

const seismicAxialFailureInput = clone(seismicAxialInput);
seismicAxialFailureInput.seismicAxial.pdTf = 1000;
const seismicAxialFailure = Core.calculate(seismicAxialFailureInput);
assert.equal(seismicAxialFailure.checks.seismicAxialStrength, false, 'clause 9.3 compression failure participates in the engineering chain');
assert.equal(seismicAxialFailure.status, 'NG', 'failed seismic axial strength produces NG');

const seismicAxialTensionInput = clone(seismicAxialInput);
Object.assign(seismicAxialTensionInput.seismicAxial, {
  pdTf: 100,
  plTf: 20,
  peTf: 100,
  fu: 2,
  parkingUse: false,
  designTensionStrengthTf: 900,
  designTensionStrengthConfirmed: true,
});
const seismicAxialTension = Core.calculate(seismicAxialTensionInput);
close(seismicAxialTension.seismicAxial.compression.adoptedDemandTf, 410, 1e-12, 'equation 9.3-1 plus sense governs compression');
close(seismicAxialTension.seismicAxial.tension.adoptedDemandTf, 190, 1e-12, 'equation 9.3-2 minus sense governs tension');
assert.equal(seismicAxialTension.seismicAxial.tension.strengthSource, 'project-confirmed', 'tension strength remains a confirmed project input');

const seismicPackageInput = clone(seismicShearInput);
seismicPackageInput.detailing.seismicAxialStrengthSubcheck = true;
seismicPackageInput.detailing.jointFlexuralStrengthRatioSubcheck = true;
seismicPackageInput.detailing.seismicStrongColumnWeakBeamSubcheck = true;
seismicPackageInput.detailing.seismicConfinementSubcheck = true;
seismicPackageInput.shear.spacingCm = 10;
seismicPackageInput.seismicAxial = clone(seismicAxialInput.seismicAxial);
const exactColumnShareTfM = 1.2 * (195.8 + 153.4) / 2;
seismicPackageInput.jointFlexuralStrengthRatio = {
  axis: 'x',
  connectionType: 'src-beam-src-column',
  jointFaceNominalStrengthsConfirmed: true,
  allConnectedMembersIncludedConfirmed: true,
  componentStrengthsSeparatedConfirmed: true,
  useVerifiedSmoothTransferAlternative: false,
  smoothStressTransferAnalysisConfirmed: false,
  cases: [
    { sense: 'clockwise', steelColumnSumTfM: 251.424, steelBeamSumTfM: 209.52, rcColumnSumTfM: 167.616, rcBeamSumTfM: 139.68 },
    { sense: 'counterclockwise', steelColumnSumTfM: 251.424, steelBeamSumTfM: 209.52, rcColumnSumTfM: 167.616, rcBeamSumTfM: 139.68 },
  ],
};
seismicPackageInput.strongColumnWeakBeam = {
  axis: 'x',
  orthogonalBeamDirectionPresent: false,
  columnStrengthsAtGoverningAxialLoadsConfirmed: true,
  jointFaceNominalStrengthsConfirmed: true,
  opposingMomentDirectionsConfirmed: true,
  cases: [
    { sense: 'clockwise', upperColumnNominalTfM: exactColumnShareTfM, lowerColumnNominalTfM: exactColumnShareTfM, leftBeamNominalTfM: 195.8, rightBeamNominalTfM: 153.4 },
    { sense: 'counterclockwise', upperColumnNominalTfM: exactColumnShareTfM, lowerColumnNominalTfM: exactColumnShareTfM, leftBeamNominalTfM: 153.4, rightBeamNominalTfM: 195.8 },
  ],
};
seismicPackageInput.confinement = {
  axis: 'x',
  coreWidthCm: 54,
  coreAreaCm2: 4104,
  highlyConfinedAreaCm2: 0,
  minimumLongitudinalBarDiameterCm: 2.54,
  providedConfinementZoneHeightCm: 80,
  nonConfinedSpacingCm: 15,
  firstHoopDistanceCm: 5,
  inflectionPointWithinMiddleHalf: true,
  wholeLengthConfined: false,
  mainBarSplicePresent: false,
  highlyConfinedAreaConfirmed: true,
  cornerLongitudinalBarsConfirmed: true,
  crosstiesProvidedAsNeededConfirmed: true,
  crosstiesEngageLongitudinalBarsConfirmed: true,
  crosstieHooksAlternatedConfirmed: true,
};
const seismicPackage = Core.calculate(seismicPackageInput);
assert.equal(seismicPackage.jointFlexuralStrengthRatio.ok, true, 'integrated package checks both clause 8.4.2 component ratios in both directions');
assert.equal(seismicPackage.strongColumnWeakBeam.ok, true, 'integrated package checks both strong-column loading senses');
assert.equal(seismicPackage.confinement.ok, true, 'integrated package checks current-code confinement quantity and placement');
assert.equal(seismicPackage.confinement.ash.governingMode, 'equation-9.6-7', 'current equation 9.6-7 governs the derived H-section package');
assert.equal(seismicPackage.confinement.spacing.nonConfinedLimitCm, 15, 'integrated package uses the current 15 cm non-confined-zone limit');
assert.equal(seismicPackage.checks.strongColumnWeakBeam, true, 'strong-column/weak-beam participates in the engineering chain');
assert.equal(seismicPackage.checks.jointFlexuralStrengthRatio, true, 'joint component ratios participate in the engineering chain');
assert.equal(seismicPackage.checks.confinement, true, 'confinement participates in the engineering chain');
assert.equal(seismicPackage.checks.seismicAxialStrength, true, 'axial strength participates in the integrated engineering chain');
assert.equal(seismicPackage.checks.completeSeismicDesign, false, 'four column subchecks still do not claim complete seismic design');
assert.equal(seismicPackage.status, 'REVIEW', 'the integrated column package remains research review only');

const weakAxisPackageInput = clone(seismicPackageInput);
weakAxisPackageInput.seismicAxis = 'y';
weakAxisPackageInput.shear.axis = 'y';
weakAxisPackageInput.jointFlexuralStrengthRatio.axis = 'y';
weakAxisPackageInput.strongColumnWeakBeam.axis = 'y';
weakAxisPackageInput.confinement.axis = 'y';
Object.assign(weakAxisPackageInput.shear, {
  weakAxisRcDesignBasis: 'project-confirmed',
  weakAxisSteelNominalShearTf: 100,
  weakAxisEffectiveDepthCm: 58,
  weakAxisAvCm2: 2.54,
  weakAxisAvfCm2: 2.54,
  weakAxisRcNominalShearTf: 120,
  weakAxisRequiredTransverseAreaCm2: 1.2,
  weakAxisStrengthsConfirmed: true,
  weakAxisRcStrengthConfirmed: true,
  weakAxisRequiredTransverseAreaConfirmed: true,
});
weakAxisPackageInput.confinement.weakAxisAhccZeroConfirmed = true;
const weakAxisPackage = Core.calculate(weakAxisPackageInput);
assert.equal(weakAxisPackage.seismicAxis, 'y', 'integrated package preserves the selected y direction');
assert.equal(weakAxisPackage.shear.strengthSource, 'project-confirmed+project-confirmed-rc');
close(weakAxisPackage.shear.probableMoments.steelNominalMomentTfM, 39.9, 1e-12, 'weak-axis steel probable-moment share uses ZyFys');
assert.ok(Number.isFinite(weakAxisPackage.shear.probableMoments.rcProbableMomentTfM), 'weak-axis RC probable moment is derived from the coordinate-bar section rotated to y bending');
assert.equal(Object.hasOwn(weakAxisPackage.shear.steel, 'webAreaCm2'), false, 'integrated weak-axis result never reuses the strong-axis steel web area');
close(weakAxisPackage.confinement.ash.shearRequiredCm2, 1.2, 1e-12, 'project-confirmed weak-axis transverse demand flows into confinement');
assert.equal(weakAxisPackage.confinement.axialTerms.highlyConfinedAxialTf, 0, 'weak-axis confinement gives no Ahcc credit');
assert.equal(weakAxisPackage.checks.engineeringStrength, true, 'selected weak-axis package participates in the same engineering check chain');

const automaticWeakAxisPackageInput = clone(weakAxisPackageInput);
automaticWeakAxisPackageInput.shear.weakAxisRcDesignBasis = 'automatic-clause-5.5.2';
const automaticWeakAxisPackage = Core.calculate(automaticWeakAxisPackageInput);
assert.equal(automaticWeakAxisPackage.shear.strengthSource, 'project-confirmed+automatic-rc-clause-5.5.2');
assert.equal(automaticWeakAxisPackage.shear.rc.source, 'automatic-clause-5.5.2-selected-y-axis');
close(automaticWeakAxisPackage.shear.rc.sectionWidthCm, 80, 1e-12, 'integrated weak-axis RC path adopts concrete depth as selected-direction b');
close(automaticWeakAxisPackage.shear.rc.sectionDepthCm, 65, 1e-12, 'integrated weak-axis RC path adopts concrete width as selected-direction depth');
close(automaticWeakAxisPackage.shear.rc.netConcreteWidthCm, 30, 1e-12, 'integrated weak-axis RC path deducts the 50 cm steel depth from b');
close(automaticWeakAxisPackage.confinement.ash.providedCm2, 2.54, 1e-12, 'weak-axis confinement receives direction-specific provided Av');
close(automaticWeakAxisPackage.confinement.ash.shearRequiredCm2, automaticWeakAxisPackage.shear.rc.requiredTransverseAreaCm2, 1e-12, 'automatic weak-axis RC demand flows into confinement without re-entry');
assert.equal(automaticWeakAxisPackage.checks.engineeringStrength, true, 'automatic weak-axis RC path participates in the engineering check chain');

const automaticAiscWeakAxisPackageInput = clone(automaticWeakAxisPackageInput);
automaticAiscWeakAxisPackageInput.shear.weakAxisSteelDesignBasis = 'project-specified-aisc-360-g6';
automaticAiscWeakAxisPackageInput.shear.weakAxisAiscG6ApplicabilityConfirmed = true;
delete automaticAiscWeakAxisPackageInput.shear.weakAxisSteelNominalShearTf;
delete automaticAiscWeakAxisPackageInput.shear.weakAxisStrengthsConfirmed;
const automaticAiscWeakAxisPackage = Core.calculate(automaticAiscWeakAxisPackageInput);
assert.equal(automaticAiscWeakAxisPackage.shear.strengthSource, 'project-specified-aisc-360-g6+automatic-rc-clause-5.5.2');
assert.equal(automaticAiscWeakAxisPackage.shear.steel.cv2Equation, 'G2-9');
close(automaticAiscWeakAxisPackage.shear.steel.nominalShearTf, 306.432, 1e-12, 'integrated project-specified AISC G6 steel Vns');
close(automaticAiscWeakAxisPackage.shear.steel.designShearTf, 275.7888, 1e-10, 'integrated project-specified AISC G6 phi Vns');
assert.equal(Object.hasOwn(automaticAiscWeakAxisPackage.shear.steel, 'webAreaCm2'), false, 'AISC weak-axis route uses the two flanges and never rotates the SRC web formula');

const inconsistentJointComponents = clone(seismicPackageInput);
inconsistentJointComponents.jointFlexuralStrengthRatio.cases[0].steelColumnSumTfM += 0.01;
assert.throws(
  () => Core.calculate(inconsistentJointComponents),
  error => error instanceof Core.SrcColumnInputError && error.issues.some(item => item.code === 'joint-component-column-sum-conflict'),
  'clause 8.4.2 component sums cannot contradict the same-direction clause 9.6.1 total'
);

const shearGoverningConfinementInput = clone(seismicPackageInput);
shearGoverningConfinementInput.shear.mctTfM = 350;
shearGoverningConfinementInput.shear.mcbTfM = 350;
shearGoverningConfinementInput.shear.avCm2 = 10;
shearGoverningConfinementInput.shear.avfCm2 = 10;
const shearGoverningConfinement = Core.calculate(shearGoverningConfinementInput);
assert.ok(shearGoverningConfinement.shear.rc.requiredTransverseAreaCm2 > shearGoverningConfinement.confinement.ash.equation7Cm2, 'higher column shear can govern the confinement transverse-steel requirement');
close(shearGoverningConfinement.confinement.ash.shearRequiredCm2, shearGoverningConfinement.shear.rc.requiredTransverseAreaCm2, 1e-12, 'confinement receives the derived shear-required Ash without manual re-entry');
assert.equal(shearGoverningConfinement.confinement.ash.governingMode, 'shear-demand', 'integrated confinement reports shear demand when it governs');
assert.equal(shearGoverningConfinement.status, 'REVIEW', 'a passing shear-governed package remains research review only');

const highDemandInput = officialGuideExample8();
highDemandInput.demands.muxTfM = 500;
const highDemand = Core.calculate(highDemandInput);
assert.equal(highDemand.status, 'NG', 'an RC or steel interaction failure produces NG even in research mode');
assert.equal(highDemand.checks.engineeringStrength, false, 'high-demand counterexample fails the engineering strength chain');

const slenderFlangeInput = manualExample8();
slenderFlangeInput.steel.flangeThicknessCm = 0.5;
const slenderFlange = Core.calculate(slenderFlangeInput);
assert.equal(slenderFlange.compactness.flangeOk, false, 'slender synthetic flange fails table 3.4-2');
assert.equal(slenderFlange.status, 'NG', 'compactness failure cannot remain REVIEW');
assert.equal(slenderFlange.checks.engineeringStrength, false, 'compactness participates in the engineering check chain');

const failClosedCases = [
  ['unsupported-input-schema', input => { input.schema = 'src-column.input.v999'; }],
  ['coordinate-bars-required', input => { input.demands.muyTfM = 1; delete input.reinforcement.bars; }],
  ['biaxial-bars-not-doubly-symmetric', input => { input.demands.muyTfM = 1; input.reinforcement.bars[0].xCm = 8; }],
  ['biaxial-bars-layers-conflict', input => { input.demands.muyTfM = 1; [0, 3, 8, 11].forEach(index => { input.reinforcement.bars[index].areaCm2 = 5.08; }); }],
  ['second-order-demand-not-confirmed', input => { input.detailing.secondOrderDemandIncluded = false; }],
  ['seismic-scope-not-implemented', input => { input.detailing.seismicDesign = true; }],
  ['not-fully-encased', input => { input.detailing.fullyEncased = false; }],
  ['unsupported-steel-shape', input => { input.detailing.centeredDoublySymmetricH = false; }],
  ['main-bars-not-continuous', input => { input.detailing.mainBarsContinuous = false; }],
  ['unsupported-steel-grade', input => { input.steel.grade = 'unknown'; }],
  ['compression-demand-required', input => { input.demands.puTf = 0; }],
  ['longitudinal-ratio-below-scope', input => { input.reinforcement.layers.forEach(layer => { layer.areaCm2 = 10; }); }],
  ['longitudinal-ratio-above-scope', input => { input.reinforcement.layers.forEach(layer => { layer.areaCm2 = 220; }); }],
  ['concrete-strength-below-scope', input => { input.concrete.fcKgfCm2 = 209; }],
  ['high-strength-concrete-evidence-missing', input => { input.concrete.fcKgfCm2 = 421; }],
  ['high-strength-material-evidence-missing', input => { input.steel.fysKgfCm2 = 3521; }],
  ['unknown-section-catalog-id', input => { input.steel.catalogId = 'missing'; }],
];

const shearFailClosedCases = [
  ['seismic-shear-mode-required', input => {
    input.detailing.seismicColumnShearSubcheck = true;
  }],
  ['seismic-axis-conflict', input => {
    Object.assign(input, clone(seismicShearInput));
    input.shear.axis = 'y';
  }],
  ['confirmation-required', input => {
    Object.assign(input, clone(seismicShearInput));
    input.shear.projectPlasticHingeMomentsConfirmed = false;
  }],
  ['shear-stud-scope-not-implemented', input => {
    Object.assign(input, clone(seismicShearInput));
    input.shear.shearStudContributionTf = 1;
  }],
  ['effective-depth-outside-section', input => {
    Object.assign(input, clone(seismicShearInput));
    input.shear.effectiveDepthCm = 80;
  }],
];
const seismicDetailingFailClosedCases = [
  ['seismic-axial-mode-required', input => {
    input.detailing.seismicAxialStrengthSubcheck = true;
  }],
  ['finite-number-required', input => {
    input.detailing.seismicDesign = true;
    input.detailing.seismicAxialStrengthSubcheck = true;
  }],
  ['seismic-detailing-mode-required', input => {
    input.detailing.seismicStrongColumnWeakBeamSubcheck = true;
  }],
  ['confinement-shear-demand-required', input => {
    input.detailing.seismicDesign = true;
    input.detailing.seismicConfinementSubcheck = true;
  }],
  ['seismic-axis-conflict', input => {
    Object.assign(input, clone(seismicPackageInput));
    input.strongColumnWeakBeam.axis = 'y';
  }],
  ['orthogonal-frame-plane-not-covered', input => {
    Object.assign(input, clone(seismicPackageInput));
    input.strongColumnWeakBeam.orthogonalBeamDirectionPresent = true;
  }],
  ['whole-length-confinement-required', input => {
    Object.assign(input, clone(seismicPackageInput));
    input.confinement.inflectionPointWithinMiddleHalf = false;
  }],
  ['confirmation-required', input => {
    Object.assign(input, clone(seismicPackageInput));
    input.confinement.crosstieHooksAlternatedConfirmed = false;
  }],
];
const manualFailClosedCases = [
  ['invalid-h-section-flange-geometry', input => { input.steel.flangeThicknessCm = 25; }],
  ['invalid-h-section-web-geometry', input => { input.steel.webThicknessCm = 30.4; }],
  ['steel-ratio-below-src-scope', input => { input.steel.areaCm2 = 100; }],
  ['invalid-optional-section-property', input => { input.steel.zyCm3 = 0; }],
  ['weak-axis-steel-zy-required', input => { input.demands.muyTfM = 1; delete input.steel.zyCm3; }],
];

for (const [expectedCode, mutate, makeInput] of [
  ...failClosedCases.map(item => [...item, officialGuideExample8]),
  ...manualFailClosedCases.map(item => [...item, manualExample8]),
  ...shearFailClosedCases.map(item => [...item, officialGuideExample8]),
  ...seismicDetailingFailClosedCases.map(item => [...item, officialGuideExample8]),
]) {
  const input = makeInput();
  mutate(input);
  assert.throws(
    () => Core.calculate(input),
    error => error instanceof Core.SrcColumnInputError && error.issues.some(item => item.code === expectedCode),
    `${expectedCode} fails closed`
  );
}

for (const [expectedCode, mutate] of [
  ['unsupported-weak-axis-steel-design-basis', input => { input.shear.weakAxisSteelDesignBasis = 'invented'; }],
  ['unsupported-weak-axis-rc-design-basis', input => { input.shear.weakAxisRcDesignBasis = 'invented'; }],
  ['effective-depth-outside-section', input => { input.shear.weakAxisEffectiveDepthCm = input.concrete.widthCm; }],
  ['confirmation-required', input => { input.shear.normalWeightConcreteConfirmed = false; }],
]) {
  const input = clone(automaticWeakAxisPackageInput);
  mutate(input);
  assert.throws(
    () => Core.calculate(input),
    error => error instanceof Core.SrcColumnInputError && error.issues.some(item => item.code === expectedCode),
    `automatic weak-axis ${expectedCode} fails closed in the integrated core`
  );
}

const unconfirmedAiscWeakAxis = clone(automaticAiscWeakAxisPackageInput);
unconfirmedAiscWeakAxis.shear.weakAxisAiscG6ApplicabilityConfirmed = false;
assert.throws(
  () => Core.calculate(unconfirmedAiscWeakAxis),
  error => error instanceof Core.SrcColumnInputError && error.issues.some(item => item.code === 'confirmation-required' && item.path === 'shear.weakAxisAiscG6ApplicabilityConfirmed'),
  'integrated AISC G6 route fails closed without project applicability confirmation'
);

const catalogConflict = officialGuideExample8();
catalogConflict.steel.areaCm2 = 214;
assert.throws(
  () => Core.calculate(catalogConflict),
  error => error instanceof Core.SrcColumnInputError && error.issues.some(item => item.code === 'catalog-section-conflict' && item.path === 'steel.areaCm2'),
  'a supplied property cannot silently override the catalog value'
);

const catalogPath = path.join(__dirname, 'src-column-traceability.catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
assert.equal(catalog.schemaVersion, 13, 'SRC column traceability schema includes controlled project-specified weak-axis steel shear');
assert.equal(catalog.coreVersion, Core.CORE_VERSION, 'SRC column traceability follows the research engine version');
assert.equal(catalog.release.status, Core.RELEASE_STATUS, 'traceability catalog keeps the core non-public');
assert.equal(catalog.regulation.chapter3Url, Core.REGULATION_PROFILE.chapter3Url, 'catalog and core use the same official chapter 3 source');
assert.equal(catalog.regulation.chapter5Url, Core.REGULATION_PROFILE.chapter5Url, 'catalog and core use the same official chapter 5 source');
assert.equal(catalog.regulation.chapter7Url, Core.REGULATION_PROFILE.chapter7Url, 'catalog and core use the same official chapter 7 source');
assert.equal(catalog.regulation.chapter8Url, Core.REGULATION_PROFILE.chapter8Url, 'catalog and core use the same official chapter 8 source');
assert.equal(catalog.regulation.chapter9Url, Core.REGULATION_PROFILE.chapter9Url, 'catalog and core use the same official chapter 9 source');
assert.equal(catalog.concreteRegulation.officialPage, 'https://www.nlma.gov.tw/ch/legislation/regsearch/6874', 'catalog identifies the official 112 concrete regulation page');
assert.equal(catalog.concreteRegulation.officialPdf, 'https://www.nlma.gov.tw/uploads/files/011d9249cac7d6c5547786aa348e352a.pdf', 'catalog locks the reviewed official concrete regulation PDF');
assert.deepEqual(catalog.concreteRegulation.clauses.map(item => item.clause), ['21.2.2', '22.2.2', '22.2.2.4.1、22.4.2'], 'catalog traces the RC strain, stress block, phi, and axial-cap clauses');
assert.equal(catalog.sectionCatalog.version, official.steelSection.source.catalogVersion, 'traceability identifies the adopted H-section catalog version');
assert.equal(catalog.sectionCatalog.source.printedPage, official.steelSection.source.printedPage, 'traceability preserves the section source page');
assert.equal(catalog.sectionCatalog.entryCount, 7, 'traceability states the deliberately limited catalog coverage');
assert.deepEqual(
  catalog.equations.map(item => item.id),
  ['src-3.4-2', 'src-6.4-1-7', 'src-6.4-2-5', 'src-7.3-3-6', 'src-7.3-7-8', 'src-7.3-9-10', 'rc-pm-current', 'rc-pm-biaxial', 'src-9.3-1-2', 'src-9.6-3-5', 'src-5.5-3', 'project-aisc-360-g6', 'src-5.5-4-13', 'src-8.4-1-4', 'src-9.6-1', 'src-9.6-6-10'],
  'catalog covers every implemented equation family'
);
assert.equal(catalog.goldenCases[0].id, 'MOI-SRC-GUIDE-COLUMN-EXAMPLE-8', 'official example 8 remains the canonical research golden case');
assert.equal(catalog.goldenCases[0].sectionCatalogId, official.steelSection.source.catalogId, 'golden case locks the verified section identity');
assert.ok(catalog.goldenCases[0].sourceArithmeticNote.includes('57.1') && catalog.goldenCases[0].sourceArithmeticNote.includes('56.7'), 'catalog discloses the guide example arithmetic inconsistency');
assert.ok(catalog.goldenCases[0].reinforcementLayoutNote.includes('y=7/17/63/73 cm'), 'catalog preserves the four-layer interpretation of the guide section drawing');
close(catalog.goldenCases[0].expected.continuousPhiMnTfM, official.rc.phiMnTfM, 0.15, 'catalog preserves the continuous four-layer RC capacity benchmark');
close(catalog.goldenCases[0].expected.flangeRatio, official.compactness.flangeRatio, 1e-9, 'catalog preserves the example 8 flange compactness benchmark');
close(catalog.goldenCases[0].expected.webRatio, official.compactness.webRatio, 1e-9, 'catalog preserves the example 8 web compactness benchmark');
close(catalog.goldenCases[0].expected.flangeSeismicReferenceLimit, official.compactness.flangeSeismicLimit, 1e-9, 'catalog preserves the example 8 flange lambda_pd reference');
close(catalog.goldenCases[0].expected.webSeismicReferenceLimit, official.compactness.webSeismicLimit, 1e-9, 'catalog preserves the example 8 web lambda_pd reference');
const externalWeakAxisReference = catalog.externalWeakAxisSteelReference;
assert.equal(externalWeakAxisReference.version, WeakAxisReference.VERSION, 'catalog identifies the independent AISC G6 reference version');
assert.equal(externalWeakAxisReference.authority, '專案指定', 'external weak-axis reference uses the project-specified authority label');
assert.ok(externalWeakAxisReference.authorityBoundary.includes('專案主動選擇') && externalWeakAxisReference.authorityBoundary.includes('Vnrc'), 'external reference keeps adoption and RC boundaries explicit');
const catalogOfficialG6 = WeakAxisReference.calculate({ fy: 50, modulus: 29000, flangeWidth: 8.14, flangeThickness: 0.43 });
close(externalWeakAxisReference.officialExample.expected.nominalShearKipBeforePublishedRounding, catalogOfficialG6.nominalShear, 1e-12, 'catalog preserves the official G.6 unrounded nominal shear');
const catalogH500G6 = WeakAxisReference.calculate({ fy: 3500, modulus: 2040000, flangeWidth: 30.4, flangeThickness: 2.4, forceDivisor: 1000 });
close(externalWeakAxisReference.derivedCatalogComparison.expected.referenceNominalShearTf, catalogH500G6.nominalShear, 1e-12, 'catalog preserves the H500 project-specified reference comparison');
const shearGolden = catalog.goldenCases.find(item => item.id === 'MOI-SRC-GUIDE-COLUMN-EXAMPLE-14-SHEAR-ARITHMETIC');
assert.ok(shearGolden.authorityBoundary.includes('十字型鋼骨') && shearGolden.authorityBoundary.includes('算術'), 'official example 14 is limited to its supported arithmetic surface');
close(shearGolden.expected.vuTf, 170.57777777777778, 1e-12, 'catalog preserves official example 14 demand shear arithmetic');
close(shearGolden.expected.steelDesignShearTf, 121.3758, 1e-12, 'catalog preserves official example 14 steel design shear');
const detailingGolden = catalog.goldenCases.find(item => item.id === 'MOI-SRC-GUIDE-COLUMN-EXAMPLE-14-SEISMIC-DETAILING-ARITHMETIC');
assert.ok(detailingGolden.authorityBoundary.includes('現行規範') && detailingGolden.authorityBoundary.includes('15 cm'), 'old guide arithmetic is explicitly subordinated to current clause 9.6.3');
close(detailingGolden.expected.requiredColumnMomentSumTfM, 419.04, 1e-12, 'catalog preserves example 14 strong-column arithmetic');
close(detailingGolden.expected.ashEquation7At10CmCm2, 2.3812966738744072, 1e-12, 'catalog preserves the current-code conservative confinement arithmetic');
assert.ok(catalog.verificationCases[0].authorityBoundary.includes('不是教材原載例題'), 'derived biaxial regression is not misrepresented as an official example');
close(catalog.verificationCases[0].expected.redistributionBeta, biaxial.redistribution.beta, 1e-12, 'catalog preserves the derived biaxial redistribution benchmark');
close(catalog.verificationCases[0].expected.rcUtilization, biaxial.rc.utilization, 1e-12, 'catalog preserves the derived biaxial RC utilization benchmark');
close(catalog.verificationCases[0].expected.capacityMuxTfM, biaxial.rc.capacityMuxTfM, 1e-12, 'catalog preserves the derived biaxial Mux capacity component');
close(catalog.verificationCases[0].expected.capacityMuyTfM, biaxial.rc.capacityMuyTfM, 1e-12, 'catalog preserves the derived biaxial Muy capacity component');
const shearVerification = catalog.verificationCases.find(item => item.id === 'DERIVED-EXAMPLE-8-SEISMIC-STRONG-AXIS-SHEAR');
assert.ok(shearVerification.authorityBoundary.includes('不是教材原載例題'), 'derived shear regression is not misrepresented as an official example');
close(shearVerification.expected.vuTf, seismicShear.shear.demand.shearTf, 1e-12, 'catalog preserves the derived shear demand');
close(shearVerification.expected.rcProbableMomentTfM, seismicShear.shear.probableMoments.rcProbableMomentTfM, 1e-12, 'catalog preserves the production probable RC moment');
close(shearVerification.expected.steelUtilization, seismicShear.shear.steel.utilization, 1e-12, 'catalog preserves the derived steel shear utilization');
close(shearVerification.expected.rcUtilization, seismicShear.shear.rc.utilization, 1e-12, 'catalog preserves the derived RC shear utilization');
const axialVerification = catalog.verificationCases.find(item => item.id === 'DERIVED-EXAMPLE-8-SEISMIC-AXIAL-STRENGTH');
assert.ok(axialVerification.authorityBoundary.includes('不是教材原載例題') && axialVerification.authorityBoundary.includes('專案核定拉力設計強度'), 'derived axial regression discloses its project-input boundary');
close(axialVerification.expected.designCompressionStrengthTf, seismicAxialTension.seismicAxial.compression.designStrengthTf, 0.5, 'catalog preserves the derived clause 6.4 compression-strength benchmark');
close(axialVerification.expected.compressionDemandTf, seismicAxialTension.seismicAxial.compression.adoptedDemandTf, 1e-12, 'catalog preserves the derived equation 9.3-1 demand');
close(axialVerification.expected.tensionDemandTf, seismicAxialTension.seismicAxial.tension.adoptedDemandTf, 1e-12, 'catalog preserves the derived equation 9.3-2 demand');
const packageVerification = catalog.verificationCases.find(item => item.id === 'DERIVED-EXAMPLE-8-SEISMIC-COLUMN-PACKAGE');
assert.ok(packageVerification.authorityBoundary.includes('不是教材原載完整例題') && packageVerification.authorityBoundary.includes('完整耐震設計'), 'derived seismic package is not misrepresented as an official complete design');
close(packageVerification.expected.strongColumnMinimumRatio, seismicPackage.strongColumnWeakBeam.minimumRatio, 1e-12, 'catalog preserves the integrated strong-column ratio');
close(packageVerification.expected.nominalAxialTf, seismicPackage.confinement.axialTerms.nominalAxialTf, 1e-12, 'catalog preserves the integrated confinement axial denominator');
close(packageVerification.expected.ashEquation7Cm2, seismicPackage.confinement.ash.equation7Cm2, 1e-12, 'catalog preserves the integrated governing confinement quantity');
assert.equal(packageVerification.expected.completeSeismicDesign, seismicPackage.checks.completeSeismicDesign, 'catalog preserves the incomplete seismic-design boundary');
const weakAxisVerification = catalog.verificationCases.find(item => item.id === 'DERIVED-EXAMPLE-8-SEISMIC-Y-AXIS-PACKAGE');
assert.ok(weakAxisVerification.authorityBoundary.includes('專案確認') && weakAxisVerification.authorityBoundary.includes('標準答案'), 'weak-axis verification discloses the project-strength boundary');
close(weakAxisVerification.expected.steelNominalMomentTfM, weakAxisPackage.shear.probableMoments.steelNominalMomentTfM, 1e-12, 'catalog preserves the weak-axis steel probable moment');
close(weakAxisVerification.expected.projectConfirmedRequiredTransverseAreaCm2, weakAxisPackage.confinement.ash.shearRequiredCm2, 1e-12, 'catalog preserves the project-confirmed weak-axis transverse demand');
close(weakAxisVerification.expected.weakAxisBendingDepthCm, weakAxisPackage.confinement.extent.bendingDepthCm, 1e-12, 'catalog preserves the weak-axis bending depth');
const automaticWeakAxisVerification = catalog.verificationCases.find(item => item.id === 'DERIVED-EXAMPLE-8-SEISMIC-Y-AXIS-AUTOMATIC-RC');
assert.ok(automaticWeakAxisVerification.authorityBoundary.includes('第 5.5.2 節') && automaticWeakAxisVerification.authorityBoundary.includes('完整耐震設計'), 'automatic weak-axis RC verification states its authority boundary');
close(automaticWeakAxisVerification.expected.rcSectionWidthCm, automaticWeakAxisPackage.shear.rc.sectionWidthCm, 1e-12, 'catalog preserves automatic weak-axis RC b');
close(automaticWeakAxisVerification.expected.rcSectionDepthCm, automaticWeakAxisPackage.shear.rc.sectionDepthCm, 1e-12, 'catalog preserves automatic weak-axis RC selected-direction depth');
close(automaticWeakAxisVerification.expected.netConcreteWidthCm, automaticWeakAxisPackage.shear.rc.netConcreteWidthCm, 1e-12, 'catalog preserves automatic weak-axis b prime');
close(automaticWeakAxisVerification.expected.frictionPathTf, automaticWeakAxisPackage.shear.rc.frictionTf, 1e-12, 'catalog preserves automatic weak-axis shear-friction path');
close(automaticWeakAxisVerification.expected.rcNominalShearTf, automaticWeakAxisPackage.shear.rc.nominalShearTf, 1e-12, 'catalog preserves automatic weak-axis nominal RC shear');
const automaticAiscWeakAxisVerification = catalog.verificationCases.find(item => item.id === 'DERIVED-EXAMPLE-8-SEISMIC-Y-AXIS-PROJECT-AISC-G6');
assert.ok(automaticAiscWeakAxisVerification.authorityBoundary.includes('不是臺灣 SRC 規範原生') && automaticAiscWeakAxisVerification.authorityBoundary.includes('專案明確指定'), 'AISC G6 verification states its project authority boundary');
close(automaticAiscWeakAxisVerification.expected.flangeSlenderness, automaticAiscWeakAxisPackage.shear.steel.flangeSlenderness, 1e-12, 'catalog preserves adopted AISC G6 flange slenderness');
close(automaticAiscWeakAxisVerification.expected.steelNominalShearTf, automaticAiscWeakAxisPackage.shear.steel.nominalShearTf, 1e-12, 'catalog preserves adopted AISC G6 nominal shear');
close(automaticAiscWeakAxisVerification.expected.steelDesignShearTf, automaticAiscWeakAxisPackage.shear.steel.designShearTf, 1e-12, 'catalog preserves adopted AISC G6 design shear');
assert.equal(catalog.oracle.file, 'core/src-column-oracle.js', 'catalog identifies the independent oracle');
assert.equal(catalog.oracle.version, 'src-column.oracle.v0.10.0-research', 'catalog identifies the current independent oracle version');
assert.equal(catalog.oracle.comparisonCount, 174, 'catalog states the independently compared exact arithmetic surface');
assert.equal(catalog.oracle.approximateComparisonCount, 27, 'catalog states the production/oracle tolerance comparisons');
assert.equal(catalog.oracle.driftSentinelCount, 7, 'catalog states all independent drift sentinels');
assert.ok(catalog.oracle.covered.includes('RC 應變相容 P-M'), 'catalog declares the completed independent RC P-M coverage');
assert.equal(catalog.oracle.uncovered.includes('RC 應變相容 P-M'), false, 'catalog no longer lists completed RC P-M work as uncovered');
assert.ok(catalog.oracle.covered.includes('RC 定軸力 Mux-Muy 互制曲面'), 'catalog declares the completed independent biaxial RC coverage');
assert.ok(catalog.oracle.covered.some(item => item.includes('第 9.6.2 節 X 向') && item.includes('Y 向 RC 第 5.5.2 節自動路徑')), 'catalog declares both selected-direction automatic RC shear paths');
assert.ok(catalog.oracle.covered.some(item => item.includes('第 9.6.1 節單一選定方向接頭')), 'catalog declares completed selected-direction strong-column coverage');
assert.ok(catalog.oracle.covered.some(item => item.includes('第 9.6.3 節現行選定方向矩形柱圍束')), 'catalog declares completed selected-direction confinement coverage');
assert.ok(catalog.oracle.covered.some(item => item.includes('第 9.3 節耐震軸力組合')), 'catalog declares completed limited seismic axial-strength coverage');
assert.ok(catalog.oracle.uncovered.some(item => item.includes('Y 向鋼骨名義剪力強度')), 'catalog keeps automatic weak-axis steel strength derivation outside the supported boundary');

for (const missingPath of ['depthCm', 'flangeWidthCm', 'flangeThicknessCm', 'webThicknessCm']) {
  const input = manualExample8();
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
