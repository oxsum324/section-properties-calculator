const fs = require('fs');
const path = require('path');

const productionCorePath = path.resolve(__dirname, '../../../鋼構工具/calculator.js');
const productionPagePath = path.resolve(__dirname, '../../../鋼構工具/plate-check.html');
const productionPageSource = fs.readFileSync(productionPagePath, 'utf8');
const { calculateConnection } = require(productionCorePath);

for (const token of [
  '<input type="hidden" name="connectionType" value="plate_check">',
  '<script src="./calculator.js"></script>',
  '<script src="./app.js"></script>',
  '鋼構連接板正式規範核算工具',
]) {
  if (!productionPageSource.includes(token)) throw new Error(`steel-plate-page-contract-missing:${token}`);
}

function validateInput(input) {
  const issues = [];
  if (!Array.isArray(input?.cases) || input.cases.length !== 2) issues.push('cases:two-required');
  for (const [index, item] of (input?.cases || []).entries()) {
    const prefix = `cases[${index}]`;
    for (const key of [
      'requiredTension', 'boltDiameter', 'holeDiameter', 'plateWidth', 'plateLength',
      'plateThickness', 'plateYieldStrength', 'plateUltimateStrength', 'rowCount',
      'lineCount', 'pitchX', 'pitchY', 'endDistanceStart', 'endDistanceEnd',
      'edgeDistanceTop', 'edgeDistanceBottom',
    ]) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${prefix}.${key}:positive-finite-required`);
    }
    if (!['LRFD', 'ASD'].includes(item?.designMethod)) issues.push(`${prefix}.designMethod:unsupported`);
    if (!['horizontal', 'vertical'].includes(item?.loadDirection)) issues.push(`${prefix}.loadDirection:unsupported`);
    if (!(Number(item?.holeDiameter) > Number(item?.boltDiameter))) issues.push(`${prefix}.holeDiameter:must-exceed-bolt-diameter`);
    if (item?.useManualBlockShearPath) {
      for (const key of ['manualAgv', 'manualAnv', 'manualAgt', 'manualAnt']) {
        if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${prefix}.${key}:positive-finite-required`);
      }
    }
  }
  return issues;
}

function checkByKey(result, key) {
  const check = result.checks.find(item => item.key === key);
  if (!check) throw new Error(`steel-plate-production-check-missing:${key}`);
  return check;
}

function detailByKey(result, key) {
  const check = result.detailChecks.find(item => item.key === key);
  if (!check) throw new Error(`steel-plate-production-detail-missing:${key}`);
  return check;
}

function calculateCase(input) {
  const result = calculateConnection({
    ...input,
    connectionType: 'plate_check',
    plateInputMode: 'geometry',
    boltUltimateStrength: input.boltUltimateStrength || 1000,
    deformationConsidered: input.deformationConsidered !== false,
    netSectionMode: 'straight_only',
    blockShearMode: 'auto_with_override',
  });
  const gross = checkByKey(result, 'plateGrossYield');
  const net = checkByKey(result, 'plateNetRupture');
  const block = checkByKey(result, 'plateBlockShear');
  const detail = key => detailByKey(result, key);

  return {
    horizontal: result.state.loadDirection === 'horizontal' ? 1 : 0,
    lrfd: result.state.designMethod === 'LRFD' ? 1 : 0,
    holeWidth: result.state.holeDiameter + 1.5,
    Ag: result.derivedAreas.Ag,
    An: result.derivedAreas.An,
    Ae: result.derivedAreas.Ae,
    Agv: result.derivedAreas.Agv,
    Anv: result.derivedAreas.Anv,
    Agt: result.derivedAreas.Agt,
    Ant: result.derivedAreas.Ant,
    grossNominal: gross.nominal,
    grossAvailable: gross.available,
    grossRatio: gross.ratio,
    netNominal: net.nominal,
    netAvailable: net.available,
    netRatio: net.ratio,
    blockNominal: block.nominal,
    blockAvailable: block.available,
    blockRatio: block.ratio,
    blockEquation3: block.equationRef === '式(10.4-3)' ? 1 : 0,
    blockEquation4: block.equationRef === '式(10.4-4)' ? 1 : 0,
    grossControls: result.governing?.key === 'plateGrossYield' ? 1 : 0,
    netControls: result.governing?.key === 'plateNetRupture' ? 1 : 0,
    blockControls: result.governing?.key === 'plateBlockShear' ? 1 : 0,
    minSpacingAlongProvided: detail('plate_minSpacingAlong').provided,
    minSpacingAlongRequired: detail('plate_minSpacingAlong').required,
    minSpacingAlongPass: detail('plate_minSpacingAlong').passes ? 1 : 0,
    minSpacingAcrossProvided: detail('plate_minSpacingAcross').provided,
    minSpacingAcrossRequired: detail('plate_minSpacingAcross').required,
    minSpacingAcrossPass: detail('plate_minSpacingAcross').passes ? 1 : 0,
    minEndRequired: detail('plate_minEndStart').required,
    minSideRequired: detail('plate_minEdgeTop').required,
    maxSpacingRequired: detail('plate_maxSpacingAlong').required,
    maxEdgeRequired: detail('plate_maxEnd').required,
    holeCompatible: detail('plate_holeCompatibility').passes ? 1 : 0,
    geometryNetValid: detail('plate_geometryNet').passes ? 1 : 0,
    geometryBlockValid: detail('plate_geometryBlock').passes ? 1 : 0,
    manualBlockPath: result.pathSummary.blockShear.includes('手動') ? 1 : 0,
    validationCount: result.validations.length,
    overallPass: result.passes ? 1 : 0,
  };
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-steel-plate-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => [item.id, calculateCase(item)]));
}

module.exports = { validateInput, calculate };
