'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Production = require('./core/src-column-core.js');
const Oracle = require('./core/src-column-oracle.js');

function example8() {
  const barAreaCm2 = 5.07;
  return {
    schema: Oracle.SUPPORTED_SCHEMA,
    seismicAxis: 'x',
    demands: { puTf: 734.0, muxTfM: 128.9, muyTfM: 0 },
    concrete: { widthCm: 65, depthCm: 80, fcKgfCm2: 280 },
    reinforcement: {
      tieType: 'tied',
      fyKgfCm2: 4200,
      esKgfCm2: 2_040_000,
      layers: [
        { yCm: 7, areaCm2: 20.28 },
        { yCm: 17, areaCm2: 10.14 },
        { yCm: 63, areaCm2: 10.14 },
        { yCm: 73, areaCm2: 20.28 },
      ],
      xLayers: [
        { xCm: 7, areaCm2: 20.28 }, { xCm: 17, areaCm2: 10.14 },
        { xCm: 48, areaCm2: 10.14 }, { xCm: 58, areaCm2: 20.28 },
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
      zyCm3: 1140,
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

function at(value, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => current[key], value);
}

function compare(production, oracle, paths, tolerance) {
  return paths.flatMap(dottedPath => {
    const actual = Number(at(production, dottedPath));
    const expected = Number(at(oracle, dottedPath));
    return Number.isFinite(actual)
      && Number.isFinite(expected)
      && Math.abs(actual - expected) <= tolerance
      ? []
      : [{ path: dottedPath, production: actual, oracle: expected }];
  });
}

assert.equal(Oracle.ORACLE_VERSION, 'src-column.oracle.v0.8.0-research', 'independent oracle is explicitly versioned');
assert.equal(Oracle.SUPPORTED_SCHEMA, Production.INPUT_SCHEMA, 'oracle and production accept the same research input schema');
const oracleSource = fs.readFileSync(path.join(__dirname, 'core', 'src-column-oracle.js'), 'utf8');
assert.equal(oracleSource.includes('require('), false, 'oracle imports neither the production core nor shared PMSection');

const input = example8();
const productionInput = example8();
productionInput.steel = {
  catalogId: 'rh-500x304x15x24',
  grade: productionInput.steel.grade,
  fysKgfCm2: productionInput.steel.fysKgfCm2,
  esKgfCm2: productionInput.steel.esKgfCm2,
};
const production = Production.calculate(productionInput);
const oracle = Oracle.calculate(input);
const comparedPaths = [
  'compactness.flangeRatio',
  'compactness.clearWebDepthCm',
  'compactness.webRatio',
  'compactness.flangeGeneralLimit',
  'compactness.webGeneralLimit',
  'compactness.flangeSeismicLimit',
  'compactness.webSeismicLimit',
  'allocation.axialSteelRatio',
  'allocation.momentSteelRatioX',
  'allocation.momentSteelRatioY',
  'allocation.initialSteelDemands.puTf',
  'allocation.initialSteelDemands.muxTfM',
  'allocation.initialSteelDemands.muyTfM',
  'allocation.initialRcDemands.puTf',
  'allocation.initialRcDemands.muxTfM',
  'allocation.initialRcDemands.muyTfM',
  'steel.compressionX.effectiveRadiusCm',
  'steel.compressionX.lambdaC',
  'steel.compressionX.nominalCompressionTf',
  'steel.compressionY.effectiveRadiusCm',
  'steel.compressionY.lambdaC',
  'steel.compressionY.nominalCompressionTf',
  'steel.nominalCompressionTf',
  'steel.nominalMomentXTfM',
  'steel.nominalMomentYTfM',
  'steel.initialInteraction.axialRatio',
  'steel.initialInteraction.momentRatio',
  'steel.initialInteraction.utilization',
  'steel.finalInteraction.utilization',
  'redistribution.beta',
  'redistribution.finalSteelDemands.puTf',
  'redistribution.finalSteelDemands.muxTfM',
  'redistribution.finalSteelDemands.muyTfM',
  'redistribution.finalRcDemands.puTf',
  'redistribution.finalRcDemands.muxTfM',
  'redistribution.finalRcDemands.muyTfM',
];
assert.deepEqual(compare(production, oracle, comparedPaths, 1e-10), [], 'independent oracle agrees with every covered production value');
const rcComparedPaths = ['rc.phiMnTfM', 'rc.utilization', 'rc.phiPnMaxTf', 'rc.nominalPoTf'];
assert.deepEqual(compare(production, oracle, ['rc.phiMnTfM'], 0.05), [], 'continuous oracle agrees with the production curve interpolation within 0.05 tf-m');
assert.deepEqual(compare(production, oracle, ['rc.utilization'], 0.001), [], 'continuous oracle agrees with the production RC utilization');
assert.deepEqual(compare(production, oracle, ['rc.phiPnMaxTf', 'rc.nominalPoTf'], 1e-10), [], 'independent oracle agrees on the RC axial caps');
assert.equal(oracle.steel.compressionControlAxis, production.steel.compressionControlAxis, 'independent oracle agrees on the controlling compression axis');
assert.equal(oracle.compactness.gradeGroup, production.compactness.gradeGroup, 'independent oracle agrees on the table grade group');
assert.equal(oracle.compactness.ok, production.compactness.ok, 'independent oracle agrees on compactness disposition');
assert.equal(production.steelSection.source.mode, 'catalog', 'production path resolves the official section from the catalog while the oracle keeps independent source values');
assert.ok(oracle.coverage.covered.includes('rc-strain-compatibility-pm'), 'oracle declares its independent RC P-M coverage');
assert.equal(oracle.rc.method, 'continuous-log-bisection', 'RC oracle uses a continuous neutral-axis solver rather than the production curve');
assert.ok(Math.abs(oracle.rc.solution.designPTf - oracle.rc.demand.puTf) < 1e-9, 'continuous RC solution equilibrates the redistributed axial demand');
assert.ok(Math.abs(oracle.rc.phiMnTfM - 126.5) / 126.5 < 0.05, 'independent result remains within 5% of the guide chart interpolation');

const biaxialProductionInput = example8();
biaxialProductionInput.steel = {
  catalogId: 'rh-500x304x15x24',
  grade: biaxialProductionInput.steel.grade,
  fysKgfCm2: biaxialProductionInput.steel.fysKgfCm2,
  esKgfCm2: biaxialProductionInput.steel.esKgfCm2,
};
biaxialProductionInput.demands.muyTfM = 30;
const biaxialOracleInput = example8();
biaxialOracleInput.demands.muyTfM = 30;
const biaxialProduction = Production.calculate(biaxialProductionInput);
const biaxialOracle = Oracle.calculate(biaxialOracleInput);
assert.equal(biaxialOracle.rc.method, 'numerical-strip-log-bisection', 'independent biaxial oracle uses numerical strip integration instead of the production polygon clip');
assert.ok(biaxialOracle.coverage.covered.includes('rc-biaxial-interaction'), 'oracle declares completed biaxial RC interaction coverage');
assert.equal(biaxialOracle.coverage.uncovered.includes('biaxial-interaction'), false, 'completed biaxial interaction is removed from uncovered scope');
assert.deepEqual(compare(biaxialProduction, biaxialOracle, [
  'allocation.momentSteelRatioY',
  'allocation.initialSteelDemands.muyTfM',
  'steel.nominalMomentYTfM',
  'steel.initialInteraction.momentRatioY',
  'steel.initialInteraction.utilization',
  'redistribution.finalRcDemands.muyTfM',
], 1e-10), [], 'independent oracle agrees with every exact biaxial allocation and steel term');
assert.ok(Math.abs(biaxialProduction.rc.utilization - biaxialOracle.rc.utilization) <= 1e-5, 'independent strip oracle agrees with exact-polygon RC biaxial utilization within 1e-5');
assert.ok(Math.abs(biaxialProduction.rc.capacityMuxTfM - biaxialOracle.rc.capacityMuxTfM) <= 0.01, 'independent strip oracle agrees with the Mux capacity component within 0.01 tf-m');
assert.ok(Math.abs(biaxialProduction.rc.capacityMuyTfM - biaxialOracle.rc.capacityMuyTfM) <= 0.01, 'independent strip oracle agrees with the Muy capacity component within 0.01 tf-m');

const shearOracleInput = example8();
shearOracleInput.detailing.seismicDesign = true;
shearOracleInput.detailing.seismicColumnShearSubcheck = true;
shearOracleInput.steel.fywKgfCm2 = 3500;
shearOracleInput.shear = {
  axis: 'x',
  mctTfM: 120,
  mcbTfM: 110,
  clearHeightCm: 300,
  effectiveDepthCm: 73,
  avCm2: 2.54,
  avfCm2: 2.54,
  spacingCm: 20,
  fyhKgfCm2: 4200,
  shearStudContributionTf: 0,
  projectPlasticHingeMomentsConfirmed: true,
  normalWeightConcreteConfirmed: true,
  monolithicInterfaceConfirmed: true,
  transverseReinforcementPerpendicularConfirmed: true,
};
const shearProductionInput = structuredClone(shearOracleInput);
shearProductionInput.steel = {
  catalogId: 'rh-500x304x15x24',
  grade: shearOracleInput.steel.grade,
  fysKgfCm2: shearOracleInput.steel.fysKgfCm2,
  fywKgfCm2: shearOracleInput.steel.fywKgfCm2,
  esKgfCm2: shearOracleInput.steel.esKgfCm2,
};
const shearProduction = Production.calculate(shearProductionInput);
const shearOracle = Oracle.calculate(shearOracleInput);
const shearExactPaths = [
  'shear.demand.shearTf',
  'shear.probableMoments.steelNominalMomentTfM',
  'shear.steel.webAreaCm2',
  'shear.steel.nominalShearTf',
  'shear.steel.designShearTf',
  'shear.rc.transverseLimitTf',
  'shear.rc.transverseTf',
  'shear.rc.concreteTf',
  'shear.rc.generalTf',
  'shear.rc.frictionTransverseTf',
  'shear.rc.frictionConcreteTf',
  'shear.rc.frictionTf',
  'shear.rc.nominalShearTf',
  'shear.rc.designShearTf',
];
assert.deepEqual(compare(shearProduction, shearOracle, shearExactPaths, 1e-10), [], 'independent oracle agrees with the exact shear arithmetic surface');
const shearTolerancePaths = [
  'shear.probableMoments.rcProbableMomentTfM',
  'shear.steel.requiredShearTf',
  'shear.steel.utilization',
  'shear.rc.requiredShearTf',
  'shear.rc.utilization',
  'shear.rc.requiredNominalShearTf',
  'shear.rc.requiredGeneralTransverseTf',
  'shear.rc.requiredGeneralAreaCm2',
  'shear.rc.requiredFrictionTransverseTf',
  'shear.rc.requiredFrictionAreaCm2',
  'shear.rc.requiredTransverseAreaCm2',
];
assert.deepEqual(compare(shearProduction, shearOracle, shearTolerancePaths, 0.002), [], 'continuous probable-moment oracle agrees with the discretized production shear allocation');
assert.equal(shearOracle.shear.method, 'independent-continuous-probable-moment', 'shear oracle independently solves the 1.25 Fyr pure-bending state');
assert.equal(shearOracle.shear.rc.governingMode, shearProduction.shear.rc.governingMode, 'oracle agrees on the governing RC shear mode');
assert.equal(shearOracle.shear.ok, shearProduction.shear.ok, 'oracle agrees on the separately allocated shear disposition');
assert.ok(shearOracle.coverage.covered.includes('seismic-x-axis-column-shear-subcheck'), 'oracle declares the completed limited x-axis shear coverage');
assert.equal(shearOracle.coverage.uncovered.includes('shear'), false, 'generic shear is replaced by explicit covered and uncovered axes');

const axialOracleInput = example8();
axialOracleInput.detailing.seismicDesign = true;
axialOracleInput.detailing.seismicAxialStrengthSubcheck = true;
axialOracleInput.seismicAxial = {
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
  designTensionStrengthTf: 900,
  designTensionStrengthConfirmed: true,
};
const axialProductionInput = structuredClone(axialOracleInput);
axialProductionInput.steel = {
  catalogId: 'rh-500x304x15x24',
  grade: axialOracleInput.steel.grade,
  fysKgfCm2: axialOracleInput.steel.fysKgfCm2,
  esKgfCm2: axialOracleInput.steel.esKgfCm2,
};
const axialProduction = Production.calculate(axialProductionInput);
const axialOracle = Oracle.calculate(axialOracleInput);
const axialExactPaths = [
  'seismicAxial.compressionStrength.grossAreaCm2',
  'seismicAxial.compressionStrength.concreteAreaCm2',
  'seismicAxial.compressionStrength.grossIxCm4',
  'seismicAxial.compressionStrength.grossIyCm4',
  'seismicAxial.compressionStrength.steel.nominalXTf',
  'seismicAxial.compressionStrength.steel.nominalYTf',
  'seismicAxial.compressionStrength.steel.nominalTf',
  'seismicAxial.compressionStrength.steel.designTf',
  'seismicAxial.compressionStrength.rc.shortNominalTf',
  'seismicAxial.compressionStrength.rc.eulerXNominalTf',
  'seismicAxial.compressionStrength.rc.eulerYNominalTf',
  'seismicAxial.compressionStrength.rc.nominalTf',
  'seismicAxial.compressionStrength.rc.designTf',
  'seismicAxial.compressionStrength.designCompressionStrengthTf',
  'seismicAxial.factors.projectFu',
  'seismicAxial.factors.adoptedFu',
  'seismicAxial.factors.liveLoadFactor',
  'seismicAxial.factors.amplifiedSeismicTf',
  'seismicAxial.combinations.compression.0.signedTf',
  'seismicAxial.combinations.compression.0.adoptedCompressionDemandTf',
  'seismicAxial.combinations.compression.1.signedTf',
  'seismicAxial.combinations.tension.0.signedTf',
  'seismicAxial.combinations.tension.1.signedTf',
  'seismicAxial.combinations.tension.1.adoptedTensionDemandTf',
  'seismicAxial.omission.ratio',
  'seismicAxial.compression.rawDemandTf',
  'seismicAxial.compression.adoptedDemandTf',
  'seismicAxial.compression.designStrengthTf',
  'seismicAxial.compression.utilization',
  'seismicAxial.tension.rawDemandTf',
  'seismicAxial.tension.adoptedDemandTf',
  'seismicAxial.tension.designStrengthTf',
  'seismicAxial.tension.utilization',
];
assert.deepEqual(compare(axialProduction, axialOracle, axialExactPaths, 1e-10), [], 'independent oracle agrees with every clause 6.4 and 9.3 axial arithmetic term');
assert.equal(axialOracle.seismicAxial.compressionStrength.rc.governingMode, axialProduction.seismicAxial.compressionStrength.rc.governingMode, 'oracle agrees on the governing RC compression branch');
assert.equal(axialOracle.seismicAxial.ok, axialProduction.seismicAxial.ok, 'oracle agrees on the axial-strength disposition');
assert.ok(axialOracle.coverage.covered.includes('seismic-axial-strength-subcheck'), 'oracle declares the completed limited clause 9.3 coverage');

const packageOracleInput = structuredClone(shearOracleInput);
packageOracleInput.detailing.seismicAxialStrengthSubcheck = true;
packageOracleInput.detailing.jointFlexuralStrengthRatioSubcheck = true;
packageOracleInput.detailing.seismicStrongColumnWeakBeamSubcheck = true;
packageOracleInput.detailing.seismicConfinementSubcheck = true;
packageOracleInput.shear.spacingCm = 10;
packageOracleInput.seismicAxial = structuredClone(axialOracleInput.seismicAxial);
const exactColumnShareTfM = 1.2 * (195.8 + 153.4) / 2;
packageOracleInput.jointFlexuralStrengthRatio = {
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
packageOracleInput.strongColumnWeakBeam = {
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
packageOracleInput.confinement = {
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
const packageProductionInput = structuredClone(packageOracleInput);
packageProductionInput.steel = {
  catalogId: 'rh-500x304x15x24',
  grade: packageOracleInput.steel.grade,
  fysKgfCm2: packageOracleInput.steel.fysKgfCm2,
  fywKgfCm2: packageOracleInput.steel.fywKgfCm2,
  esKgfCm2: packageOracleInput.steel.esKgfCm2,
};
const packageProduction = Production.calculate(packageProductionInput);
const packageOracle = Oracle.calculate(packageOracleInput);
const detailingExactPaths = [
  'jointFlexuralStrengthRatio.cases.0.steel.columnSumTfM',
  'jointFlexuralStrengthRatio.cases.0.steel.beamSumTfM',
  'jointFlexuralStrengthRatio.cases.0.steel.requiredColumnSumTfM',
  'jointFlexuralStrengthRatio.cases.0.steel.ratio',
  'jointFlexuralStrengthRatio.cases.0.rc.columnSumTfM',
  'jointFlexuralStrengthRatio.cases.0.rc.beamSumTfM',
  'jointFlexuralStrengthRatio.cases.0.rc.ratio',
  'jointFlexuralStrengthRatio.cases.1.steel.ratio',
  'jointFlexuralStrengthRatio.cases.1.rc.ratio',
  'jointFlexuralStrengthRatio.maximumUtilization',
  'strongColumnWeakBeam.cases.0.columnSumTfM',
  'strongColumnWeakBeam.cases.0.beamSumTfM',
  'strongColumnWeakBeam.cases.0.requiredColumnSumTfM',
  'strongColumnWeakBeam.cases.0.ratio',
  'strongColumnWeakBeam.cases.0.utilization',
  'strongColumnWeakBeam.cases.1.columnSumTfM',
  'strongColumnWeakBeam.cases.1.beamSumTfM',
  'strongColumnWeakBeam.cases.1.ratio',
  'strongColumnWeakBeam.minimumRatio',
  'confinement.axialTerms.grossAreaCm2',
  'confinement.axialTerms.concreteAreaCm2',
  'confinement.axialTerms.steelAxialTf',
  'confinement.axialTerms.highlyConfinedAxialTf',
  'confinement.axialTerms.nominalAxialTf',
  'confinement.axialTerms.reductionFactor',
  'confinement.ash.shearRequiredCm2',
  'confinement.ash.equation6Cm2',
  'confinement.ash.equation7Cm2',
  'confinement.ash.requiredCm2',
  'confinement.ash.utilization',
  'confinement.spacing.confinedLimitCm',
  'confinement.spacing.nonConfinedLimitCm',
  'confinement.spacing.firstHoopLimitCm',
  'confinement.extent.requiredCm',
];
assert.deepEqual(compare(packageProduction, packageOracle, detailingExactPaths, 1e-10), [], 'independent oracle agrees with every strong-column and confinement arithmetic term');
assert.equal(packageOracle.jointFlexuralStrengthRatio.ok, packageProduction.jointFlexuralStrengthRatio.ok, 'oracle agrees on every clause 8.4.2 component and direction');
assert.equal(packageOracle.strongColumnWeakBeam.ok, packageProduction.strongColumnWeakBeam.ok, 'oracle agrees on both strong-column loading senses');
assert.equal(packageOracle.confinement.ok, packageProduction.confinement.ok, 'oracle agrees on current-code confinement disposition');
assert.equal(packageOracle.confinement.ash.governingMode, packageProduction.confinement.ash.governingMode, 'oracle agrees on the governing confinement requirement');
assert.ok(packageOracle.coverage.covered.includes('seismic-selected-axis-joint-subcheck') && packageOracle.coverage.covered.includes('seismic-selected-axis-confinement-subcheck'), 'oracle declares both selected-axis seismic subchecks');
assert.ok(packageOracle.coverage.covered.includes('clause-8.4.2-selected-axis-joint-flexural-strength-ratio'), 'oracle declares the completed selected-axis clause 8.4.2 arithmetic path');

const weakAxisOracleInput = structuredClone(packageOracleInput);
weakAxisOracleInput.seismicAxis = 'y';
weakAxisOracleInput.shear.axis = 'y';
weakAxisOracleInput.jointFlexuralStrengthRatio.axis = 'y';
weakAxisOracleInput.strongColumnWeakBeam.axis = 'y';
weakAxisOracleInput.confinement.axis = 'y';
Object.assign(weakAxisOracleInput.shear, {
  weakAxisSteelNominalShearTf: 100,
  weakAxisRcNominalShearTf: 120,
  weakAxisRequiredTransverseAreaCm2: 1.2,
  weakAxisStrengthsConfirmed: true,
  weakAxisRequiredTransverseAreaConfirmed: true,
});
weakAxisOracleInput.confinement.weakAxisAhccZeroConfirmed = true;
const weakAxisProductionInput = structuredClone(weakAxisOracleInput);
weakAxisProductionInput.steel = {
  catalogId: 'rh-500x304x15x24',
  grade: weakAxisOracleInput.steel.grade,
  fysKgfCm2: weakAxisOracleInput.steel.fysKgfCm2,
  fywKgfCm2: weakAxisOracleInput.steel.fywKgfCm2,
  esKgfCm2: weakAxisOracleInput.steel.esKgfCm2,
};
const weakAxisProduction = Production.calculate(weakAxisProductionInput);
const weakAxisOracle = Oracle.calculate(weakAxisOracleInput);
assert.equal(weakAxisProduction.seismicAxis, 'y');
assert.equal(weakAxisOracle.seismicAxis, 'y');
const weakAxisExactPaths = [
  'shear.demand.shearTf',
  'shear.probableMoments.steelNominalMomentTfM',
  'shear.steel.nominalShearTf',
  'shear.steel.designShearTf',
  'shear.rc.nominalShearTf',
  'shear.rc.designShearTf',
  'shear.rc.requiredTransverseAreaCm2',
  'jointFlexuralStrengthRatio.maximumUtilization',
  'strongColumnWeakBeam.minimumRatio',
  'confinement.axialTerms.highlyConfinedAxialTf',
  'confinement.ash.shearRequiredCm2',
  'confinement.ash.equation6Cm2',
  'confinement.ash.equation7Cm2',
  'confinement.extent.bendingDepthCm',
  'confinement.extent.requiredCm',
];
assert.deepEqual(compare(weakAxisProduction, weakAxisOracle, weakAxisExactPaths, 1e-10), [], 'independent oracle agrees with selected weak-axis project-strength and confinement arithmetic');
const weakAxisTolerancePaths = [
  'shear.probableMoments.rcProbableMomentTfM',
  'shear.steel.requiredShearTf',
  'shear.steel.utilization',
  'shear.rc.requiredShearTf',
  'shear.rc.utilization',
];
assert.deepEqual(compare(weakAxisProduction, weakAxisOracle, weakAxisTolerancePaths, 0.002), [], 'continuous weak-axis probable-moment oracle agrees with production demand allocation');
assert.equal(Object.hasOwn(weakAxisProduction.shear.steel, 'webAreaCm2'), false, 'production weak-axis result does not rotate the x-axis web formula');
assert.equal(Object.hasOwn(weakAxisOracle.shear.steel, 'webAreaCm2'), false, 'oracle independently preserves the same weak-axis formula boundary');
assert.ok(weakAxisOracle.coverage.covered.includes('project-confirmed-y-axis-column-shear-subcheck'));
assert.ok(weakAxisOracle.coverage.uncovered.includes('automatic-weak-axis-nominal-strength-derivation'));

const drifted = structuredClone(production);
drifted.steel.nominalMomentXTfM += 0.01;
assert.deepEqual(
  compare(drifted, oracle, comparedPaths, 1e-10).map(item => item.path),
  ['steel.nominalMomentXTfM'],
  'comparison catches a production arithmetic drift'
);
const rcDrifted = structuredClone(production);
rcDrifted.rc.phiMnTfM += 0.2;
assert.deepEqual(
  compare(rcDrifted, oracle, ['rc.phiMnTfM'], 0.05).map(item => item.path),
  ['rc.phiMnTfM'],
  'comparison catches an RC P-M production drift'
);
const shearDrifted = structuredClone(shearProduction);
shearDrifted.shear.steel.nominalShearTf += 0.01;
assert.deepEqual(
  compare(shearDrifted, shearOracle, shearExactPaths, 1e-10).map(item => item.path),
  ['shear.steel.nominalShearTf'],
  'comparison catches a shear production arithmetic drift'
);
const confinementDrifted = structuredClone(packageProduction);
confinementDrifted.confinement.ash.equation7Cm2 += 0.01;
assert.deepEqual(
  compare(confinementDrifted, packageOracle, detailingExactPaths, 1e-10).map(item => item.path),
  ['confinement.ash.equation7Cm2'],
  'comparison catches a confinement production arithmetic drift'
);
const jointRatioDrifted = structuredClone(packageProduction);
jointRatioDrifted.jointFlexuralStrengthRatio.cases[0].steel.ratio += 0.01;
assert.deepEqual(
  compare(jointRatioDrifted, packageOracle, detailingExactPaths, 1e-10).map(item => item.path),
  ['jointFlexuralStrengthRatio.cases.0.steel.ratio'],
  'comparison catches a clause 8.4.2 component-ratio arithmetic drift'
);
const axialDrifted = structuredClone(axialProduction);
axialDrifted.seismicAxial.compressionStrength.rc.eulerYNominalTf += 0.01;
assert.deepEqual(
  compare(axialDrifted, axialOracle, axialExactPaths, 1e-10).map(item => item.path),
  ['seismicAxial.compressionStrength.rc.eulerYNominalTf'],
  'comparison catches a seismic axial-strength production drift'
);

const grade400 = example8();
grade400.steel.grade = 'SS400';
const grade400Result = Oracle.compactness(grade400);
assert.equal(grade400Result.flangeGeneralLimit, 23, 'oracle independently selects the 400-grade flange limit');
assert.equal(grade400Result.webGeneralLimit, 96, 'oracle independently selects the 400-grade web limit');

for (const fy of [2800, 5600]) {
  const epsTy = fy / 2_040_000;
  assert.equal(Oracle.rcPhiFromTensionStrain(epsTy, fy, 2_040_000), 0.65, `oracle uses fy/Es for the fy=${fy} compression-control limit`);
  assert.ok(Math.abs(Oracle.rcPhiFromTensionStrain(epsTy + 0.0015, fy, 2_040_000) - 0.775) < 1e-12, `oracle uses the 0.003 transition width for fy=${fy}`);
}
const axialOutOfRange = Oracle.rcInteractionAtDemand(example8(), 1000, 0);
assert.equal(axialOutOfRange.axialOk, false, 'RC oracle fails the demand outside the tied-column axial cap');
assert.equal(axialOutOfRange.ok, false, 'out-of-range RC axial demand cannot pass');

for (const mutate of [
  value => { value.schema = 'src-column.input.v999'; },
  value => { value.steel.grade = 'unknown'; },
  value => { value.detailing.seismicDesign = true; },
]) {
  const invalid = example8();
  mutate(invalid);
  assert.throws(() => Oracle.calculate(invalid), Oracle.SrcColumnOracleError, 'oracle fails closed outside its declared scope');
}

for (const missingBoolean of ['mainBarSplicePresent', 'inflectionPointWithinMiddleHalf', 'wholeLengthConfined']) {
  const invalid = structuredClone(packageOracleInput);
  delete invalid.confinement[missingBoolean];
  assert.throws(
    () => Oracle.calculate(invalid),
    error => error instanceof Oracle.SrcColumnOracleError && error.code === 'boolean-required',
    `oracle requires explicit confinement.${missingBoolean}`
  );
}

console.log(`SRC column independent oracle OK (${comparedPaths.length + rcComparedPaths.length + 6 + shearExactPaths.length + axialExactPaths.length + detailingExactPaths.length + weakAxisExactPaths.length} exact comparisons + ${3 + shearTolerancePaths.length + weakAxisTolerancePaths.length} tolerance comparisons + six drift sentinels)`);
