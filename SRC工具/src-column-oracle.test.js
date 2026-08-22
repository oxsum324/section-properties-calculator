'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Production = require('./core/src-column-core.js');
const Oracle = require('./core/src-column-oracle.js');

function example8() {
  return {
    schema: 'src-column.input.v2',
    demands: { puTf: 734.0, muxTfM: 128.9, muyTfM: 0 },
    concrete: { widthCm: 65, depthCm: 80, fcKgfCm2: 280 },
    reinforcement: {
      tieType: 'tied',
      fyKgfCm2: 4200,
      esKgfCm2: 2_040_000,
      layers: [
        { yCm: 7, areaCm2: 30.42 },
        { yCm: 73, areaCm2: 30.42 },
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

assert.equal(Oracle.ORACLE_VERSION, 'src-column.oracle.v0.1.0-research', 'independent oracle is explicitly versioned');
assert.equal(Oracle.SUPPORTED_SCHEMA, Production.INPUT_SCHEMA, 'oracle and production accept the same research input schema');
const oracleSource = fs.readFileSync(path.join(__dirname, 'core', 'src-column-oracle.js'), 'utf8');
assert.equal(oracleSource.includes('require('), false, 'oracle imports neither the production core nor shared PMSection');

const input = example8();
const production = Production.calculate(input);
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
  'allocation.initialSteelDemands.puTf',
  'allocation.initialSteelDemands.muxTfM',
  'allocation.initialRcDemands.puTf',
  'allocation.initialRcDemands.muxTfM',
  'steel.compressionX.effectiveRadiusCm',
  'steel.compressionX.lambdaC',
  'steel.compressionX.nominalCompressionTf',
  'steel.compressionY.effectiveRadiusCm',
  'steel.compressionY.lambdaC',
  'steel.compressionY.nominalCompressionTf',
  'steel.nominalCompressionTf',
  'steel.nominalMomentXTfM',
  'steel.initialInteraction.axialRatio',
  'steel.initialInteraction.momentRatio',
  'steel.initialInteraction.utilization',
  'steel.finalInteraction.utilization',
  'redistribution.beta',
  'redistribution.finalSteelDemands.puTf',
  'redistribution.finalSteelDemands.muxTfM',
  'redistribution.finalRcDemands.puTf',
  'redistribution.finalRcDemands.muxTfM',
];
assert.deepEqual(compare(production, oracle, comparedPaths, 1e-10), [], 'independent oracle agrees with every covered production value');
assert.equal(oracle.steel.compressionControlAxis, production.steel.compressionControlAxis, 'independent oracle agrees on the controlling compression axis');
assert.equal(oracle.compactness.gradeGroup, production.compactness.gradeGroup, 'independent oracle agrees on the table grade group');
assert.equal(oracle.compactness.ok, production.compactness.ok, 'independent oracle agrees on compactness disposition');
assert.ok(oracle.coverage.uncovered.includes('rc-strain-compatibility-pm'), 'oracle does not overclaim RC P-M independence');

const drifted = structuredClone(production);
drifted.steel.nominalMomentXTfM += 0.01;
assert.deepEqual(
  compare(drifted, oracle, comparedPaths, 1e-10).map(item => item.path),
  ['steel.nominalMomentXTfM'],
  'comparison catches a production arithmetic drift'
);

const grade400 = example8();
grade400.steel.grade = 'SS400';
const grade400Result = Oracle.compactness(grade400);
assert.equal(grade400Result.flangeGeneralLimit, 23, 'oracle independently selects the 400-grade flange limit');
assert.equal(grade400Result.webGeneralLimit, 96, 'oracle independently selects the 400-grade web limit');

for (const mutate of [
  value => { value.schema = 'src-column.input.v999'; },
  value => { value.steel.grade = 'unknown'; },
  value => { value.detailing.seismicDesign = true; },
]) {
  const invalid = example8();
  mutate(invalid);
  assert.throws(() => Oracle.calculate(invalid), Oracle.SrcColumnOracleError, 'oracle fails closed outside its declared scope');
}

console.log(`SRC column independent oracle OK (${comparedPaths.length} arithmetic comparisons + drift sentinel)`);
