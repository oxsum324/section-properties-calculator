const fs = require('fs');
const path = require('path');

const productionRoot = path.resolve(__dirname, '../../../鋼構工具');
const productionCorePath = path.join(productionRoot, 'calculator.js');
const productionPageSource = fs.readFileSync(path.join(productionRoot, 'index.html'), 'utf8');
const productionAppSource = fs.readFileSync(path.join(productionRoot, 'app.js'), 'utf8');
const { calculateConnection } = require(productionCorePath);

for (const token of [
  '<option value="plate_check">連接板檢核｜Connection Plate</option>',
  '<option value="tension_member">拉力構件｜Tension Member</option>',
  '<script src="./calculator.js"></script>',
  '<script src="./app.js"></script>',
]) {
  if (!productionPageSource.includes(token)) throw new Error(`steel-formal-page-contract-missing:${token}`);
}
for (const token of [
  'const { calculateConnection } = window.ShearConnectionCalculator;',
  'exampleStates.tension_member',
  'buildConnectionReportConfig(result)',
]) {
  if (!productionAppSource.includes(token)) throw new Error(`steel-formal-app-contract-missing:${token}`);
}

function validatePositiveFields(item, fields, prefix, issues) {
  for (const key of fields) {
    if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${prefix}.${key}:positive-finite-required`);
  }
}

function validateInput(input) {
  const issues = [];
  const plate = input?.plateCase;
  if (!plate || plate.id !== 'plateLrfd') issues.push('plateCase:plateLrfd-required');
  validatePositiveFields(plate, [
    'requiredTension', 'boltDiameter', 'holeDiameter', 'plateWidth', 'plateLength', 'plateThickness',
    'plateYieldStrength', 'plateUltimateStrength', 'rowCount', 'lineCount', 'pitchX', 'pitchY',
    'endDistanceStart', 'endDistanceEnd', 'edgeDistanceTop', 'edgeDistanceBottom',
  ], 'plateCase', issues);
  if (!Array.isArray(input?.tensionCases) || input.tensionCases.length !== 3) issues.push('tensionCases:three-required');
  for (const [index, item] of (input?.tensionCases || []).entries()) {
    const prefix = `tensionCases[${index}]`;
    validatePositiveFields(item, [
      'requiredTension', 'memberYieldStrength', 'memberUltimateStrength', 'memberWidth', 'memberThickness',
      'unsupportedLength', 'radiusOfGyration', 'tensionConnectedThickness', 'tensionWeldElectrodeStrength',
    ], prefix, issues);
    if (!['LRFD', 'ASD'].includes(item?.designMethod)) issues.push(`${prefix}.designMethod:unsupported`);
    if (!['bolted', 'welded'].includes(item?.tensionConnectionMode)) issues.push(`${prefix}.tensionConnectionMode:unsupported`);
    if (item?.tensionConnectionMode === 'bolted') {
      validatePositiveFields(item, [
        'boltDiameter', 'holeDiameter', 'boltUltimateStrength', 'tensionBoltLineCount', 'tensionBoltRowCount',
        'tensionShearPlanes', 'tensionEndDistance', 'tensionPitchLongitudinal', 'tensionGaugeTransverse',
        'tensionEdgeDistanceNear', 'tensionEdgeDistanceFar',
      ], prefix, issues);
    }
    if (item?.tensionWeldType === 'fillet') {
      validatePositiveFields(item, ['tensionWeldSize', 'tensionWeldLengthLongitudinal', 'tensionWeldLineCount', 'tensionLapLength'], prefix, issues);
    }
    if (item?.tensionWeldType === 'groove_cjp') {
      validatePositiveFields(item, ['tensionWeldLengthTransverse', 'tensionDirectConnectedArea'], prefix, issues);
    }
  }
  return issues;
}

function checkByKey(result, key) {
  const check = result.checks.find(item => item.key === key);
  if (!check) throw new Error(`steel-formal-production-check-missing:${key}`);
  return check;
}

function detailByKey(result, key) {
  const check = result.detailChecks.find(item => item.key === key);
  if (!check) throw new Error(`steel-formal-production-detail-missing:${key}`);
  return check;
}

function calculatePlateCase(input) {
  const result = calculateConnection({
    ...input,
    connectionType: 'plate_check',
    plateInputMode: 'geometry',
    deformationConsidered: true,
    netSectionMode: 'straight_only',
    blockShearMode: 'auto_with_override',
    useManualBlockShearPath: false,
  });
  const gross = checkByKey(result, 'plateGrossYield');
  const net = checkByKey(result, 'plateNetRupture');
  const block = checkByKey(result, 'plateBlockShear');
  return {
    Ag: result.derivedAreas.Ag,
    An: result.derivedAreas.An,
    Ae: result.derivedAreas.Ae,
    Agv: result.derivedAreas.Agv,
    Anv: result.derivedAreas.Anv,
    Agt: result.derivedAreas.Agt,
    Ant: result.derivedAreas.Ant,
    grossAvailable: gross.available,
    netAvailable: net.available,
    blockAvailable: block.available,
    governingBlock: result.governing?.key === 'plateBlockShear' ? 1 : 0,
    detailPass: result.detailChecks.every(item => item.passes) ? 1 : 0,
    overallPass: result.passes ? 1 : 0,
  };
}

function calculateTensionCase(input) {
  const result = calculateConnection({
    ...input,
    connectionType: 'tension_member',
    tensionAreaInput: 'geometry',
    deformationConsidered: input.deformationConsidered !== false,
    tensionUseManualBlockAreas: false,
  });
  const gross = checkByKey(result, 'tensionGrossYield');
  const net = checkByKey(result, 'tensionNetRupture');
  const output = {
    bolted: result.state.tensionConnectionMode === 'bolted' ? 1 : 0,
    lrfd: result.state.designMethod === 'LRFD' ? 1 : 0,
    Ag: result.derivedAreas.Ag,
    An: result.derivedAreas.An,
    Ae: result.derivedAreas.Ae,
    U: result.derivedAreas.U,
    slenderness: result.state.unsupportedLength / result.state.radiusOfGyration,
    grossNominal: gross.nominal,
    grossAvailable: gross.available,
    grossRatio: gross.ratio,
    netNominal: net.nominal,
    netAvailable: net.available,
    netRatio: net.ratio,
    governingGross: result.governing?.key === 'tensionGrossYield' ? 1 : 0,
    governingNet: result.governing?.key === 'tensionNetRupture' ? 1 : 0,
    validationCount: result.validations.length,
    detailPass: result.detailChecks.every(item => item.passes) ? 1 : 0,
    overallPass: result.passes ? 1 : 0,
  };

  if (result.state.tensionConnectionMode === 'bolted') {
    const bolt = checkByKey(result, 'tensionBoltShear');
    const bearing = checkByKey(result, 'tensionBearing');
    const block = checkByKey(result, 'tensionBlockShear');
    Object.assign(output, {
      Agv: result.derivedAreas.Agv,
      Anv: result.derivedAreas.Anv,
      Agt: result.derivedAreas.Agt,
      Ant: result.derivedAreas.Ant,
      boltNominal: bolt.nominal,
      boltAvailable: bolt.available,
      boltRatio: bolt.ratio,
      bearingNominal: bearing.nominal,
      bearingAvailable: bearing.available,
      bearingRatio: bearing.ratio,
      blockNominal: block.nominal,
      blockAvailable: block.available,
      blockRatio: block.ratio,
      blockEquation3: block.equationRef === '式(10.4-3)' ? 1 : 0,
      governingBolt: result.governing?.key === 'tensionBoltShear' ? 1 : 0,
      governingBearing: result.governing?.key === 'tensionBearing' ? 1 : 0,
      governingBlock: result.governing?.key === 'tensionBlockShear' ? 1 : 0,
      minSpacingRequired: detailByKey(result, 'tension_minSpacing').required,
      minEndRequired: detailByKey(result, 'tension_minEnd').required,
      maxSpacingRequired: detailByKey(result, 'tension_maxSpacing').required,
    });
  } else {
    const weld = checkByKey(result, 'tensionWeldStrength');
    Object.assign(output, {
      weldNominal: weld.nominal,
      weldAvailable: weld.available,
      weldRatio: weld.ratio,
      governingWeld: result.governing?.key === 'tensionWeldStrength' ? 1 : 0,
      fillet: result.state.tensionWeldType === 'fillet' ? 1 : 0,
      cjp: result.state.tensionWeldType === 'groove_cjp' ? 1 : 0,
    });
  }
  return output;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-steel-formal-benchmark-input:${issues.join(',')}`);
  return {
    [input.plateCase.id]: calculatePlateCase(input.plateCase),
    ...Object.fromEntries(input.tensionCases.map(item => [item.id, calculateTensionCase(item)])),
  };
}

module.exports = { validateInput, calculate };
