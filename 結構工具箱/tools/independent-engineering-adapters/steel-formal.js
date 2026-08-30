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
  '<option value="single_plate">剪力接頭｜單剪力板 Shear Tab｜LRFD</option>',
  '<script src="./calculator.js"></script>',
  '<script src="./app.js"></script>',
]) {
  if (!productionPageSource.includes(token)) throw new Error(`steel-formal-page-contract-missing:${token}`);
}
for (const token of [
  'const { calculateConnection } = window.ShearConnectionCalculator;',
  'exampleStates.single_plate',
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
  const expectedSinglePlateIds = [
    'singlePlateG1MinimumForce',
    'singlePlateG2F10TM20Eccentric',
    'singlePlateNegativeShear',
    'singlePlateAsdBlocked',
    'singlePlateGeometryRejected',
  ];
  if (!Array.isArray(input?.singlePlateCases) || input.singlePlateCases.length !== expectedSinglePlateIds.length) {
    issues.push('singlePlateCases:five-required');
  }
  const actualSinglePlateIds = (input?.singlePlateCases || []).map(item => item?.id);
  if (actualSinglePlateIds.join('|') !== expectedSinglePlateIds.join('|')) {
    issues.push('singlePlateCases:case-order-and-ids');
  }
  for (const [index, item] of (input?.singlePlateCases || []).entries()) {
    const prefix = `singlePlateCases[${index}]`;
    validatePositiveFields(item, [
      'boltDiameter', 'holeDiameter', 'boltUltimateStrength', 'boltCount', 'shearPlanes',
      'endDistance', 'pitch', 'plateThickness', 'plateYieldStrength', 'plateUltimateStrength',
      'transverseEdgeDistance', 'plateHeight', 'boltLineToWeldDistance', 'beamWebThickness',
      'beamWebYieldStrength', 'beamWebUltimateStrength', 'beamWebEndDistance', 'beamWebEdgeDistance',
      'supportThickness', 'supportYieldStrength', 'supportUltimateStrength', 'weldSize', 'weldLength',
      'weldLineCount', 'weldElectrodeStrength',
    ], prefix, issues);
    for (const key of ['requiredAxial', 'requiredShear', 'requiredMoment', 'eccentricity', 'weldEccentricity', 'fillerThickness']) {
      if (!Number.isFinite(Number(item?.[key]))) issues.push(`${prefix}.${key}:finite-required`);
    }
    if (!['LRFD', 'ASD'].includes(item?.designMethod)) issues.push(`${prefix}.designMethod:unsupported`);
    if (item?.holeType !== 'standard') issues.push(`${prefix}.holeType:standard-required`);
    if (item?.boltGrade !== 'F10T') issues.push(`${prefix}.boltGrade:F10T-required`);
    if (!['included', 'excluded'].includes(item?.threadsCondition)) issues.push(`${prefix}.threadsCondition:unsupported`);
    if (![true, 'true', false, 'false'].includes(item?.deformationConsidered)) issues.push(`${prefix}.deformationConsidered:boolean-required`);
    if (![true, 'true', false, 'false'].includes(item?.fillerExtended)) issues.push(`${prefix}.fillerExtended:boolean-required`);
    if (![true, 'true', false, 'false'].includes(item?.conventionalMaterialConfirmed)) issues.push(`${prefix}.conventionalMaterialConfirmed:boolean-required`);
    if (![true, 'true', false, 'false'].includes(item?.connectionModelConfirmed)) issues.push(`${prefix}.connectionModelConfirmed:boolean-required`);
    for (const key of ['demandBasis', 'geometryBasis', 'materialBasis', 'eccentricityBasis']) {
      if (!String(item?.[key] || '').trim()) issues.push(`${prefix}.${key}:basis-required`);
    }
  }
  const singlePlateById = Object.fromEntries((input?.singlePlateCases || []).map(item => [item?.id, item]));
  if (!(Math.abs(Number(singlePlateById.singlePlateG1MinimumForce?.requiredShear)) < 4.5 * 9.80665)) {
    issues.push('singlePlateCases:G1-minimum-force-required');
  }
  const g2 = singlePlateById.singlePlateG2F10TM20Eccentric;
  if (!(g2?.boltGrade === 'F10T' && Number(g2?.boltDiameter) === 20 && Number(g2?.holeDiameter) === 21.5
    && Number(g2?.boltUltimateStrength) === 1000 && Number(g2?.boltCount) === 4
    && Number(g2?.eccentricity) === Number(g2?.boltLineToWeldDistance) / 2
    && Number(g2?.weldEccentricity) === Number(g2?.boltLineToWeldDistance)
    && Number(g2?.weldLineCount) === 2
    && Number(g2?.weldSize) >= 0.625 * Number(g2?.plateThickness)
    && g2?.conventionalMaterialConfirmed === true
    && Number(g2?.plateYieldStrength) <= 345 && Number(g2?.beamWebYieldStrength) <= 345
    && Number(g2?.pitch) <= 76.2 && Number(g2?.plateHeight) <= 914.4)) {
    issues.push('singlePlateCases:G2-F10T-M20-eccentric-required');
  }
  for (const id of ['singlePlateG1MinimumForce', 'singlePlateG2F10TM20Eccentric', 'singlePlateNegativeShear', 'singlePlateAsdBlocked']) {
    if (!(Number(singlePlateById[id]?.boltDiameter) === 20 && Number(singlePlateById[id]?.holeDiameter) === 21.5)) {
      issues.push(`singlePlateCases:${id}:M20-standard-hole-required`);
    }
  }
  if (!(Number(singlePlateById.singlePlateNegativeShear?.requiredShear) < 0)) {
    issues.push('singlePlateCases:negative-shear-required');
  }
  if (singlePlateById.singlePlateAsdBlocked?.designMethod !== 'ASD') {
    issues.push('singlePlateCases:ASD-block-required');
  }
  const rejectedGeometry = singlePlateById.singlePlateGeometryRejected;
  if (!(Number(rejectedGeometry?.plateHeight) < 2 * Number(rejectedGeometry?.endDistance)
    + Math.max(Number(rejectedGeometry?.boltCount) - 1, 0) * Number(rejectedGeometry?.pitch))) {
    issues.push('singlePlateCases:geometry-rejection-required');
  }
  if (!(Number(rejectedGeometry?.boltDiameter) === 20 && Number(rejectedGeometry?.holeDiameter) > 21.5
    && Number(rejectedGeometry?.boltCount) >= 6 && Number(rejectedGeometry?.boltCount) <= 12
    && Number(rejectedGeometry?.eccentricity) < Number(rejectedGeometry?.boltLineToWeldDistance)
    && Number(rejectedGeometry?.weldEccentricity) < Number(rejectedGeometry?.boltLineToWeldDistance)
    && Number(rejectedGeometry?.weldLineCount) !== 2
    && Number(rejectedGeometry?.weldSize) < 0.625 * Number(rejectedGeometry?.plateThickness)
    && rejectedGeometry?.conventionalMaterialConfirmed === true
    && Number(rejectedGeometry?.plateYieldStrength) > 345
    && Number(rejectedGeometry?.beamWebYieldStrength) > 345
    && Number(rejectedGeometry?.pitch) > 76.2
    && Number(rejectedGeometry?.plateHeight) > 914.4)) {
    issues.push('singlePlateCases:detail-rejection-required');
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

function calculateSinglePlateCase(input) {
  const result = calculateConnection({ ...input, connectionType: 'single_plate' });
  const checkPrefixes = {
    boltShearEccentric: 'bolt',
    plateBearing: 'plateBearing',
    beamBearing: 'beamBearing',
    plateGrossShearYield: 'plateYield',
    plateNetShearRupture: 'plateRupture',
    plateBlockShear: 'plateBlock',
    beamWebBlockShear: 'beamBlock',
    plateFlexure: 'plateFlexure',
    weldMetalEccentric: 'weldMetal',
    weldBaseMetalEccentric: 'weldBase',
  };
  const output = {
    lrfd: result.state.designMethod === 'LRFD' ? 1 : 0,
    checkCount: result.checks.length,
    enteredShear: result.designDemand.enteredShear,
    minimumConnectionShear: result.designDemand.minimumConnectionShear,
    adoptedShear: result.designDemand.adoptedShear,
    grossShearArea: result.derivedAreas.Agv,
    netShearArea: result.derivedAreas.Anv,
    plateBlockAgv: result.derivedAreas.plateBlockAgv,
    plateBlockAnv: result.derivedAreas.plateBlockAnv,
    plateBlockAgt: result.derivedAreas.plateBlockAgt,
    plateBlockAnt: result.derivedAreas.plateBlockAnt,
    beamBlockAgv: result.derivedAreas.beamBlockAgv,
    beamBlockAnv: result.derivedAreas.beamBlockAnv,
    beamBlockAgt: result.derivedAreas.beamBlockAgt,
    beamBlockAnt: result.derivedAreas.beamBlockAnt,
    governingBolt: result.governing?.key === 'boltShearEccentric' ? 1 : 0,
    methodPass: detailByKey(result, 'singlePlateMethod').passes ? 1 : 0,
    positiveShearPass: detailByKey(result, 'singlePlatePositiveShear').passes ? 1 : 0,
    boltDiameterTablePass: detailByKey(result, 'singlePlateBoltDiameterTable').passes ? 1 : 0,
    holeDiameterPass: detailByKey(result, 'singlePlateHoleDiameter').passes ? 1 : 0,
    standardHoleMaximum: detailByKey(result, 'singlePlateStandardHoleMaximum').required,
    standardHoleMaximumPass: detailByKey(result, 'singlePlateStandardHoleMaximum').passes ? 1 : 0,
    boltEccentricityRequired: detailByKey(result, 'singlePlateBoltEccentricity').required,
    boltEccentricityPass: detailByKey(result, 'singlePlateBoltEccentricity').passes ? 1 : 0,
    weldEccentricityRequired: detailByKey(result, 'singlePlateWeldEccentricity').required,
    weldEccentricityPass: detailByKey(result, 'singlePlateWeldEccentricity').passes ? 1 : 0,
    doubleFilletWeldPass: detailByKey(result, 'singlePlateDoubleFilletWeld').passes ? 1 : 0,
    conventionalWeldSizeRequired: detailByKey(result, 'singlePlateConventionalWeldSize').required,
    conventionalWeldSizePass: detailByKey(result, 'singlePlateConventionalWeldSize').passes ? 1 : 0,
    plateMaterialOrderPass: detailByKey(result, 'singlePlatePlateMaterialOrder').passes ? 1 : 0,
    beamWebMaterialOrderPass: detailByKey(result, 'singlePlateBeamWebMaterialOrder').passes ? 1 : 0,
    supportMaterialOrderPass: detailByKey(result, 'singlePlateSupportMaterialOrder').passes ? 1 : 0,
    conventionalPlateFyPass: detailByKey(result, 'singlePlateConventionalPlateFy').passes ? 1 : 0,
    conventionalBeamWebFyPass: detailByKey(result, 'singlePlateConventionalBeamWebFy').passes ? 1 : 0,
    conventionalMaterialConfirmedPass: detailByKey(result, 'singlePlateConventionalMaterialConfirmed').passes ? 1 : 0,
    conventionalPitchPass: detailByKey(result, 'singlePlateConventionalPitch').passes ? 1 : 0,
    conventionalHeightPass: detailByKey(result, 'singlePlateConventionalHeight').passes ? 1 : 0,
    geometryPass: detailByKey(result, 'singlePlatePlateHeight').passes ? 1 : 0,
    strengthPass: result.summary.strengthFailure ? 0 : 1,
    detailPass: result.detailChecks.every(item => item.passes) ? 1 : 0,
    validationFailure: result.summary.validationFailure ? 1 : 0,
    complianceReady: result.complianceReady ? 1 : 0,
    overallPass: result.passes ? 1 : 0,
  };
  for (const [key, prefix] of Object.entries(checkPrefixes)) {
    const check = checkByKey(result, key);
    output[`${prefix}Available`] = check.available;
    output[`${prefix}Ratio`] = check.ratio;
  }
  return output;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-steel-formal-benchmark-input:${issues.join(',')}`);
  return {
    [input.plateCase.id]: calculatePlateCase(input.plateCase),
    ...Object.fromEntries(input.tensionCases.map(item => [item.id, calculateTensionCase(item)])),
    ...Object.fromEntries(input.singlePlateCases.map(item => [item.id, calculateSinglePlateCase(item)])),
  };
}

module.exports = { validateInput, calculate };
