'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Production = require('./core/src-column-core.js');
const Oracle = require('./core/src-column-oracle.js');

function example8() {
  const barAreaCm2 = 5.07;
  return {
    schema: 'src-column.input.v4',
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

assert.equal(Oracle.ORACLE_VERSION, 'src-column.oracle.v0.3.0-research', 'independent oracle is explicitly versioned');
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

console.log(`SRC column independent oracle OK (${comparedPaths.length + rcComparedPaths.length + 6} exact comparisons + 3 biaxial tolerance comparisons + two drift sentinels)`);
