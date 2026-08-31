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
  '<option value="brace_gusset">',
  '<option value="beam_column_moment">梁柱彎矩接頭｜耐震能力審查｜LRFD 正式模組</option>',
  '<option value="column_splice">柱續接｜全斷面 CJP 耐震能力審查｜LRFD 正式模組</option>',
  '<script src="./calculator.js"></script>',
  '<script src="./app.js"></script>',
]) {
  if (!productionPageSource.includes(token)) throw new Error(`steel-formal-page-contract-missing:${token}`);
}
for (const token of [
  'const { calculateConnection } = window.ShearConnectionCalculator;',
  'exampleStates.single_plate',
  'exampleStates.tension_member',
  'exampleStates.brace_gusset',
  'exampleStates.beam_column_moment',
  'exampleStates.column_splice',
  'MOMENT_SOURCE_FIELD_KEYS',
  'SPLICE_SOURCE_FIELD_KEYS',
  'buildConnectionReportConfig(result)',
]) {
  if (!productionAppSource.includes(token)) throw new Error(`steel-formal-app-contract-missing:${token}`);
}

const MOMENT_CASE_IDS = [
  'momentPriorTestSmrfPass',
  'momentPanelZoneFail',
  'momentRotationFail',
  'momentScwbFail',
  'momentThirdPartyThicknessFail',
  'momentGovernanceRejected',
];
const MOMENT_STRENGTH_KEYS = [
  'momentFlexuralStrength',
  'momentShearStrength',
  'momentPlasticRotation',
  'momentPanelZoneShear',
  'momentStrongColumnCw',
  'momentStrongColumnCcw',
];
const MOMENT_ENUM_FIELDS = {
  designMethod: ['LRFD'],
  connectionType: ['beam_column_moment'],
  exposureCondition: ['painted', 'weathering'],
  momentFrameSystem: ['smrf', 'imrf'],
  momentAxis: ['x', 'y'],
  momentConnectionDesignRoute: ['reinforced'],
  momentRotationDemandMethod: ['default', 'nonlinear', 'formula'],
  momentQualificationRoute: ['direct_test', 'prior_test_similarity', 'third_party_review'],
};
const MOMENT_FINITE_FIELDS = [
  'momentNonlinearPlasticRotation', 'momentSystemDuctilityR', 'momentElasticStoryDrift',
  'momentBeamPlasticModulus', 'momentBeamYieldStrength', 'momentExpectedStrengthFactor',
  'momentFarCriticalSectionExpectedMoment', 'momentCriticalSectionDistance',
  'momentPlasticHingeSpan', 'momentGravityShear',
  'momentAmplifiedShear', 'momentAvailableFlexuralStrength', 'momentAvailableShearStrength',
  'momentQualifiedPlasticRotation', 'momentQualificationTestCount',
  'momentDesignBeamFlangeThickness', 'momentTestBeamFlangeThickness',
  'momentDesignFlangePlasticRatio', 'momentTestFlangePlasticRatio',
  'momentColumnWebYieldStrength', 'momentColumnDepth', 'momentPanelZoneThickness',
  'momentPanelZoneClearDepth', 'momentPanelZoneClearWidth', 'momentPanelZoneAnalysisDemand',
  'momentPanelZoneBeamMomentSum', 'momentPanelZoneLeverArm',
  'momentBeamFlangeWidth', 'momentBeamFlangeThickness', 'momentColumnFlangeLocalNominalStrength',
  'momentBeamFlangeCompactnessRatio', 'momentBeamWebCompactnessRatio',
  'momentBeamFlangePlasticModulusRatio',
  'momentCwUpperColumnMoment', 'momentCwLowerColumnMoment',
  'momentCwLeftBeamMoment', 'momentCwRightBeamMoment',
  'momentCcwUpperColumnMoment', 'momentCcwLowerColumnMoment',
  'momentCcwLeftBeamMoment', 'momentCcwRightBeamMoment',
];
const MOMENT_BOOLEAN_FIELDS = [
  'momentDoublerPresent', 'momentDoublerAttachmentConfirmed',
  'momentContinuityPlateProvidedConfirmed', 'momentContinuityPlateWeldConfirmed',
  'momentQualificationConfigurationConfirmed', 'momentQualificationMaterialConfirmed',
  'momentQualificationWeldingConfirmed', 'momentQualificationGeometryConfirmed',
  'momentQualificationFabricationConfirmed', 'momentQualificationProcedureConfirmed',
  'momentThirdPartyReviewConfirmed', 'momentPlasticZoneGeometryConfirmed',
  'momentPlasticZoneOpeningsAbsentConfirmed', 'momentSeismicMaterialConfirmed',
  'momentMatchingWeldConfirmed', 'momentCns3506WeldConfirmed',
  'momentEndTabsRemovedGroundConfirmed', 'momentWeldProcedureMatchesQualificationConfirmed',
  'momentJointLateralRestraintConfirmed', 'momentBeamLateralBracingConfirmed',
  'momentAllMembersIncludedConfirmed', 'momentColumnStrengthsAtGoverningAxialConfirmed',
  'momentOpposingDirectionsConfirmed', 'momentOrthogonalDirectionSeparateConfirmed',
  'momentConnectionHardwareVerifiedConfirmed', 'momentSelectedAxisScopeConfirmed',
];
const MOMENT_BASIS_FIELDS = [
  'momentDemandBasis', 'momentGeometryBasis', 'momentMaterialBasis', 'momentCapacityBasis',
  'momentPanelZoneBasis', 'momentStrongColumnBasis', 'momentQualificationBasis',
];
const MOMENT_SHA_FIELDS = ['momentQualificationEvidenceSha256', 'momentCapacityEvidenceSha256'];
const MOMENT_TEXT_FIELDS = [
  'projectName', 'connectionTag', 'designer', 'notes',
  ...MOMENT_BASIS_FIELDS, ...MOMENT_SHA_FIELDS,
];
const MOMENT_SOURCE_FIELDS = [
  'projectName', 'connectionTag', 'designer', 'notes', 'designMethod', 'connectionType', 'exposureCondition',
  'momentFrameSystem', 'momentAxis', 'momentConnectionDesignRoute',
  'momentBeamPlasticModulus', 'momentBeamYieldStrength', 'momentExpectedStrengthFactor', 'momentCriticalSectionDistance', 'momentPlasticHingeSpan',
  'momentFarCriticalSectionExpectedMoment',
  'momentGravityShear', 'momentAmplifiedShear', 'momentAvailableFlexuralStrength', 'momentAvailableShearStrength',
  'momentRotationDemandMethod', 'momentQualifiedPlasticRotation', 'momentNonlinearPlasticRotation', 'momentSystemDuctilityR', 'momentElasticStoryDrift',
  'momentQualificationRoute', 'momentQualificationTestCount', 'momentDesignBeamFlangeThickness', 'momentTestBeamFlangeThickness',
  'momentDesignFlangePlasticRatio', 'momentTestFlangePlasticRatio', 'momentThirdPartyReviewConfirmed',
  'momentColumnWebYieldStrength', 'momentColumnDepth', 'momentPanelZoneThickness', 'momentPanelZoneClearDepth', 'momentPanelZoneClearWidth',
  'momentPanelZoneAnalysisDemand', 'momentPanelZoneBeamMomentSum', 'momentPanelZoneLeverArm', 'momentDoublerPresent', 'momentDoublerAttachmentConfirmed',
  'momentBeamFlangeWidth', 'momentBeamFlangeThickness', 'momentColumnFlangeLocalNominalStrength',
  'momentContinuityPlateProvidedConfirmed', 'momentContinuityPlateWeldConfirmed', 'momentBeamFlangeCompactnessRatio', 'momentBeamWebCompactnessRatio',
  'momentBeamFlangePlasticModulusRatio', 'momentCwUpperColumnMoment', 'momentCwLowerColumnMoment', 'momentCwLeftBeamMoment', 'momentCwRightBeamMoment',
  'momentCcwUpperColumnMoment', 'momentCcwLowerColumnMoment', 'momentCcwLeftBeamMoment', 'momentCcwRightBeamMoment',
  'momentDemandBasis', 'momentGeometryBasis', 'momentMaterialBasis', 'momentCapacityBasis', 'momentPanelZoneBasis', 'momentStrongColumnBasis',
  'momentQualificationBasis', 'momentQualificationEvidenceSha256', 'momentCapacityEvidenceSha256',
  'momentQualificationConfigurationConfirmed', 'momentQualificationMaterialConfirmed', 'momentQualificationWeldingConfirmed',
  'momentQualificationGeometryConfirmed', 'momentQualificationFabricationConfirmed', 'momentQualificationProcedureConfirmed',
  'momentPlasticZoneGeometryConfirmed', 'momentPlasticZoneOpeningsAbsentConfirmed', 'momentSeismicMaterialConfirmed', 'momentMatchingWeldConfirmed',
  'momentCns3506WeldConfirmed', 'momentEndTabsRemovedGroundConfirmed', 'momentWeldProcedureMatchesQualificationConfirmed',
  'momentJointLateralRestraintConfirmed', 'momentBeamLateralBracingConfirmed', 'momentAllMembersIncludedConfirmed',
  'momentColumnStrengthsAtGoverningAxialConfirmed', 'momentOpposingDirectionsConfirmed', 'momentOrthogonalDirectionSeparateConfirmed',
  'momentConnectionHardwareVerifiedConfirmed', 'momentSelectedAxisScopeConfirmed',
];
if (MOMENT_SOURCE_FIELDS.length !== 88) throw new Error(`steel-formal-moment-source-field-count:${MOMENT_SOURCE_FIELDS.length}`);
const momentSourceContractMatch = productionAppSource.match(/const MOMENT_SOURCE_FIELD_KEYS = \[([\s\S]*?)\n\s*\];/);
const productionMomentSourceFields = momentSourceContractMatch
  ? [...momentSourceContractMatch[1].matchAll(/"([^"]+)"/g)].map(match => match[1])
  : [];
if (productionMomentSourceFields.join('|') !== MOMENT_SOURCE_FIELDS.join('|')) {
  throw new Error(`steel-formal-moment-source-contract:${productionMomentSourceFields.join('|')}`);
}
const MOMENT_CASE_FIELDS = ['id', ...MOMENT_SOURCE_FIELDS].sort();
const momentCategorizedFields = [
  ...Object.keys(MOMENT_ENUM_FIELDS), ...MOMENT_FINITE_FIELDS,
  ...MOMENT_BOOLEAN_FIELDS, ...MOMENT_TEXT_FIELDS,
].sort();
if (momentCategorizedFields.join('|') !== [...MOMENT_SOURCE_FIELDS].sort().join('|')) {
  throw new Error(`steel-formal-moment-field-categories:${momentCategorizedFields.join('|')}`);
}

const SPLICE_CASE_IDS = [
  'spliceUncappedReferencePass',
  'spliceQualifiedCapPass',
  'spliceAxialDemandFail',
  'spliceWeakFillerShearFail',
  'spliceLocationNdtEvidenceFail',
  'spliceGovernanceFuRejected',
];
const SPLICE_STRENGTH_KEYS = [
  'spliceAxialCompression13_4_1',
  'spliceAxialTension13_4_1',
  'spliceFullSectionNormal',
  'spliceFullSectionMajorFlexure',
  'spliceFullSectionMinorFlexure',
  'spliceFullSectionMajorShear',
  'spliceFullSectionMinorShear',
];
const SPLICE_ENUM_FIELDS = {
  designMethod: ['LRFD'],
  connectionType: ['column_splice'],
  exposureCondition: ['painted', 'weathering'],
  spliceFrameRole: ['seismic_force_resisting'],
  spliceDesignRoute: ['cjp_full_section_identical_rolled_h'],
  spliceLocationRoute: ['beam_flange_1200'],
  spliceTransferCapRoute: ['uncapped', 'qualified'],
  spliceFabricationLocation: ['shop', 'field'],
  spliceNdtMethod: ['UT', 'RT'],
};
const SPLICE_FINITE_FIELDS = [
  'spliceDistanceToNearestBeamFlange',
  'spliceDeadAxial', 'spliceLiveAxial', 'spliceSeismicAxial',
  'spliceLiveLoadFactor', 'spliceSeismicReductionFu', 'spliceMaxTransferableAxial',
  'spliceAg', 'spliceZx', 'spliceZy', 'spliceAvx', 'spliceAvy',
  'spliceFy', 'spliceFexx', 'spliceMaxThickness',
];
const SPLICE_BOOLEAN_FIELDS = [
  'spliceIdenticalSectionsAndMaterialConfirmed', 'spliceAlignedAxesConfirmed',
  'spliceFullProfileCjpConfirmed', 'spliceMatchingFillerConfirmed',
  'spliceWpsApprovedConfirmed', 'spliceNdtFullCoverageConfirmed',
  'spliceNoPjpConfirmed', 'spliceNoMixedLoadSharingConfirmed',
  'spliceSeismicColumnConfirmed', 'spliceLocationScopeConfirmed',
  'spliceAllAdjacentTransferSourcesIncludedConfirmed', 'spliceAsBuiltBoundaryConfirmed',
];
const SPLICE_TEXT_FIELDS = [
  'projectName', 'connectionTag', 'designer', 'notes',
  'spliceDemandBasis', 'spliceGeometryBasis', 'spliceMaterialBasis',
  'spliceWpsBasis', 'spliceNdtPlanBasis',
  'spliceDemandEvidenceSha256', 'spliceDetailEvidenceSha256',
  'spliceWpsEvidenceSha256', 'spliceNdtPlanEvidenceSha256',
];
const SPLICE_SOURCE_FIELDS = [
  'projectName', 'connectionTag', 'designer', 'notes', 'designMethod', 'connectionType', 'exposureCondition',
  'spliceFrameRole', 'spliceDesignRoute', 'spliceLocationRoute', 'spliceDistanceToNearestBeamFlange',
  'spliceDeadAxial', 'spliceLiveAxial', 'spliceSeismicAxial', 'spliceLiveLoadFactor', 'spliceSeismicReductionFu',
  'spliceTransferCapRoute', 'spliceMaxTransferableAxial', 'spliceAg', 'spliceZx', 'spliceZy', 'spliceAvx', 'spliceAvy',
  'spliceFy', 'spliceFexx', 'spliceMaxThickness', 'spliceFabricationLocation', 'spliceNdtMethod',
  'spliceDemandBasis', 'spliceGeometryBasis', 'spliceMaterialBasis', 'spliceWpsBasis', 'spliceNdtPlanBasis',
  'spliceDemandEvidenceSha256', 'spliceDetailEvidenceSha256', 'spliceWpsEvidenceSha256', 'spliceNdtPlanEvidenceSha256',
  'spliceIdenticalSectionsAndMaterialConfirmed', 'spliceAlignedAxesConfirmed', 'spliceFullProfileCjpConfirmed', 'spliceMatchingFillerConfirmed',
  'spliceWpsApprovedConfirmed', 'spliceNdtFullCoverageConfirmed', 'spliceNoPjpConfirmed', 'spliceNoMixedLoadSharingConfirmed',
  'spliceSeismicColumnConfirmed', 'spliceLocationScopeConfirmed', 'spliceAllAdjacentTransferSourcesIncludedConfirmed', 'spliceAsBuiltBoundaryConfirmed',
];
if (SPLICE_SOURCE_FIELDS.length !== 49) throw new Error(`steel-formal-splice-source-field-count:${SPLICE_SOURCE_FIELDS.length}`);
const spliceSourceContractMatch = productionAppSource.match(/const SPLICE_SOURCE_FIELD_KEYS = \[([\s\S]*?)\n\s*\];/);
const productionSpliceSourceFields = spliceSourceContractMatch
  ? [...spliceSourceContractMatch[1].matchAll(/"([^"]+)"/g)].map(match => match[1])
  : [];
if (productionSpliceSourceFields.join('|') !== SPLICE_SOURCE_FIELDS.join('|')) {
  throw new Error(`steel-formal-splice-source-contract:${productionSpliceSourceFields.join('|')}`);
}
const SPLICE_CASE_FIELDS = ['id', ...SPLICE_SOURCE_FIELDS].sort();
const spliceCategorizedFields = [
  ...Object.keys(SPLICE_ENUM_FIELDS), ...SPLICE_FINITE_FIELDS,
  ...SPLICE_BOOLEAN_FIELDS, ...SPLICE_TEXT_FIELDS,
].sort();
if (spliceCategorizedFields.join('|') !== [...SPLICE_SOURCE_FIELDS].sort().join('|')) {
  throw new Error(`steel-formal-splice-field-categories:${spliceCategorizedFields.join('|')}`);
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
  const expectedGussetIds = [
    'gussetLrfdConcentric',
    'gussetCompressionBlocked',
    'gussetAsdBlocked',
    'gussetNonConcentricBlocked',
    'gussetGovernanceRejected',
  ];
  if (!Array.isArray(input?.gussetCases) || input.gussetCases.length !== expectedGussetIds.length) {
    issues.push('gussetCases:five-required');
  }
  const actualGussetIds = (input?.gussetCases || []).map(item => item?.id);
  if (actualGussetIds.join('|') !== expectedGussetIds.join('|')) {
    issues.push('gussetCases:case-order-and-ids');
  }
  for (const [index, item] of (input?.gussetCases || []).entries()) {
    const prefix = `gussetCases[${index}]`;
    validatePositiveFields(item, [
      'boltDiameter', 'holeDiameter', 'boltUltimateStrength', 'gussetBoltCount', 'gussetShearPlanes',
      'gussetEndDistance', 'gussetPitch', 'gussetEdgeDistance', 'gussetThickness',
      'gussetYieldStrength', 'gussetUltimateStrength', 'gussetConnectionWidth', 'gussetNetWidth',
      'gussetWhitmoreConnectionLength', 'gussetAvailableWidth', 'braceEndDistance', 'braceEdgeDistance',
      'braceThickness', 'braceFy', 'braceFu', 'braceGrossWidth', 'braceNetWidth',
      'weldSize', 'weldLength', 'weldLineCount', 'weldFexx',
      'supportThickness', 'supportFy', 'supportFu',
    ], prefix, issues);
    for (const key of ['requiredAxial', 'requiredShear', 'requiredMoment', 'eccentricity']) {
      if (!Number.isFinite(Number(item?.[key]))) issues.push(`${prefix}.${key}:finite-required`);
    }
    if (!['LRFD', 'ASD'].includes(item?.designMethod)) issues.push(`${prefix}.designMethod:unsupported`);
    if (item?.holeType !== 'standard') issues.push(`${prefix}.holeType:standard-required`);
    if (item?.boltGrade !== 'F10T') issues.push(`${prefix}.boltGrade:F10T-required`);
    if (!['flat_plate', 'angle'].includes(item?.braceSectionType)) issues.push(`${prefix}.braceSectionType:unsupported`);
    if (!['included', 'excluded'].includes(item?.threadsCondition)) issues.push(`${prefix}.threadsCondition:unsupported`);
    if (![true, 'true', false, 'false'].includes(item?.deformationConsidered)) issues.push(`${prefix}.deformationConsidered:boolean-required`);
    if (![true, 'true', false, 'false'].includes(item?.gussetStaticNonseismicConfirmed)) issues.push(`${prefix}.gussetStaticNonseismicConfirmed:boolean-required`);
    if (![true, 'true', false, 'false'].includes(item?.gussetLoadPathConfirmed)) issues.push(`${prefix}.gussetLoadPathConfirmed:boolean-required`);
    for (const key of ['gussetDemandBasis', 'gussetGeometryBasis', 'gussetMaterialBasis', 'gussetModelBasis']) {
      if (!String(item?.[key] || '').trim()) issues.push(`${prefix}.${key}:basis-required`);
    }
  }
  const gussetById = Object.fromEntries((input?.gussetCases || []).map(item => [item?.id, item]));
  const gussetGolden = gussetById.gussetLrfdConcentric;
  if (!(gussetGolden?.designMethod === 'LRFD'
    && Number(gussetGolden?.requiredAxial) === 400
    && Number(gussetGolden?.requiredShear) === 0
    && Number(gussetGolden?.requiredMoment) === 0
    && Number(gussetGolden?.eccentricity) === 0
    && gussetGolden?.boltGrade === 'F10T'
    && Number(gussetGolden?.boltDiameter) === 20
    && Number(gussetGolden?.holeDiameter) === 21.5
    && Number(gussetGolden?.boltUltimateStrength) === 1000
    && Number(gussetGolden?.gussetBoltCount) === 6
    && Number(gussetGolden?.gussetShearPlanes) === 1
    && Number(gussetGolden?.gussetEndDistance) === 50
    && Number(gussetGolden?.gussetPitch) === 70
    && Number(gussetGolden?.gussetEdgeDistance) === 60
    && Number(gussetGolden?.gussetThickness) === 14
    && Number(gussetGolden?.gussetYieldStrength) === 325
    && Number(gussetGolden?.gussetUltimateStrength) === 490
    && Number(gussetGolden?.gussetConnectionWidth) === 180
    && Number(gussetGolden?.gussetNetWidth) === 156.5
    && Number(gussetGolden?.gussetWhitmoreConnectionLength) === 350
    && gussetGolden?.braceSectionType === 'flat_plate'
    && Number(gussetGolden?.gussetAvailableWidth) === 400
    && Number(gussetGolden?.braceEndDistance) === 50
    && Number(gussetGolden?.braceEdgeDistance) === 60
    && Number(gussetGolden?.braceThickness) === 12
    && Number(gussetGolden?.braceFy) === 325
    && Number(gussetGolden?.braceFu) === 490
    && Number(gussetGolden?.braceGrossWidth) === 160
    && Number(gussetGolden?.braceNetWidth) === 136.5
    && Number(gussetGolden?.weldSize) === 8
    && Number(gussetGolden?.weldLength) === 250
    && Number(gussetGolden?.weldLineCount) === 2
    && Number(gussetGolden?.weldFexx) === 490
    && Number(gussetGolden?.supportThickness) === 16
    && Number(gussetGolden?.supportFy) === 325
    && Number(gussetGolden?.supportFu) === 490
    && gussetGolden?.gussetStaticNonseismicConfirmed === true
    && gussetGolden?.gussetLoadPathConfirmed === true)) {
    issues.push('gussetCases:LRFD-concentric-reference-required');
  }
  if (!(Number(gussetById.gussetCompressionBlocked?.requiredAxial) < 0)) {
    issues.push('gussetCases:compression-block-required');
  }
  if (gussetById.gussetAsdBlocked?.designMethod !== 'ASD') {
    issues.push('gussetCases:ASD-block-required');
  }
  const nonConcentric = gussetById.gussetNonConcentricBlocked;
  if (!(Number(nonConcentric?.requiredShear) !== 0
    && Number(nonConcentric?.requiredMoment) !== 0
    && Number(nonConcentric?.eccentricity) !== 0)) {
    issues.push('gussetCases:nonconcentric-V-M-e-required');
  }
  const governanceRejected = gussetById.gussetGovernanceRejected;
  if (!(Number(governanceRejected?.gussetUltimateStrength) < Number(governanceRejected?.gussetYieldStrength)
    && Number(governanceRejected?.braceFu) < Number(governanceRejected?.braceFy)
    && Number(governanceRejected?.supportFu) < Number(governanceRejected?.supportFy)
    && Number(governanceRejected?.holeDiameter) > 21.5
    && Number(governanceRejected?.gussetPitch) < 3 * Number(governanceRejected?.boltDiameter)
    && Number(governanceRejected?.gussetEndDistance) < 25
    && Number(governanceRejected?.braceEndDistance) < 25
    && Number(governanceRejected?.gussetNetWidth) > Number(governanceRejected?.gussetConnectionWidth)
    && Number(governanceRejected?.braceNetWidth) > Number(governanceRejected?.braceGrossWidth)
    && Number(governanceRejected?.gussetShearPlanes) !== 1
    && Number(governanceRejected?.gussetWhitmoreConnectionLength) !== (Number(governanceRejected?.gussetBoltCount) - 1) * Number(governanceRejected?.gussetPitch)
    && Number(governanceRejected?.gussetWhitmoreConnectionLength) > 1250
    && governanceRejected?.braceSectionType !== 'flat_plate'
    && Number(governanceRejected?.weldLineCount) !== 2
    && Number(governanceRejected?.weldLength) < 4 * Number(governanceRejected?.weldSize)
    && governanceRejected?.gussetStaticNonseismicConfirmed === false
    && governanceRejected?.gussetLoadPathConfirmed === false)) {
    issues.push('gussetCases:material-geometry-confirmation-rejection-required');
  }

  if (!Array.isArray(input?.momentCases) || input.momentCases.length !== MOMENT_CASE_IDS.length) {
    issues.push('momentCases:six-required');
  }
  const actualMomentIds = (input?.momentCases || []).map(item => item?.id);
  if (actualMomentIds.join('|') !== MOMENT_CASE_IDS.join('|')) {
    issues.push('momentCases:case-order-and-ids');
  }
  for (const [index, item] of (input?.momentCases || []).entries()) {
    const prefix = `momentCases[${index}]`;
    const actualKeys = Object.keys(item || {}).sort();
    if (actualKeys.join('|') !== MOMENT_CASE_FIELDS.join('|')) {
      issues.push(`${prefix}:exact-88-source-field-shape-required`);
    }
    for (const [key, values] of Object.entries(MOMENT_ENUM_FIELDS)) {
      if (!values.includes(item?.[key])) issues.push(`${prefix}.${key}:unsupported`);
    }
    for (const key of MOMENT_FINITE_FIELDS) {
      if (typeof item?.[key] !== 'number' || !Number.isFinite(item[key])) {
        issues.push(`${prefix}.${key}:finite-number-required`);
      }
    }
    if (!Number.isInteger(item?.momentQualificationTestCount) || item.momentQualificationTestCount < 0) {
      issues.push(`${prefix}.momentQualificationTestCount:nonnegative-integer-required`);
    }
    if (!(item?.momentFarCriticalSectionExpectedMoment >= 0)) {
      issues.push(`${prefix}.momentFarCriticalSectionExpectedMoment:nonnegative-required`);
    }
    for (const key of MOMENT_BOOLEAN_FIELDS) {
      if (typeof item?.[key] !== 'boolean') issues.push(`${prefix}.${key}:boolean-required`);
    }
    for (const key of ['projectName', 'connectionTag', 'designer', 'notes']) {
      if (typeof item?.[key] !== 'string') issues.push(`${prefix}.${key}:string-required`);
    }
    for (const key of [...MOMENT_BASIS_FIELDS, ...MOMENT_SHA_FIELDS]) {
      if (typeof item?.[key] !== 'string' || !item[key]) issues.push(`${prefix}.${key}:nonempty-string-required`);
    }
  }
  const momentById = Object.fromEntries((input?.momentCases || []).map(item => [item?.id, item]));
  const momentPositive = momentById.momentPriorTestSmrfPass;
  if (!(momentPositive?.designMethod === 'LRFD'
    && momentPositive?.momentFrameSystem === 'smrf'
    && momentPositive?.momentRotationDemandMethod === 'default'
    && momentPositive?.momentQualificationRoute === 'prior_test_similarity')) {
    issues.push('momentCases:prior-test-smrf-positive-required');
  }
  const hasReferenceScwbTerms = item => Number(item?.momentCwUpperColumnMoment) === 1200
    && Number(item?.momentCwLowerColumnMoment) === 1100
    && Number(item?.momentCwLeftBeamMoment) === 840
    && Number(item?.momentCwRightBeamMoment) === 830
    && Number(item?.momentCcwUpperColumnMoment) === 1220
    && Number(item?.momentCcwLowerColumnMoment) === 1120
    && Number(item?.momentCcwLeftBeamMoment) === 850
    && Number(item?.momentCcwRightBeamMoment) === 825;
  if (!['momentPriorTestSmrfPass', 'momentPanelZoneFail', 'momentRotationFail', 'momentGovernanceRejected']
    .every(id => hasReferenceScwbTerms(momentById[id]))) {
    issues.push('momentCases:reference-SCWB-physical-terms-required');
  }
  const hasExplicitScwbBasis = item => ['ZbFyb=700', 'Vp·x=132', '840', '830', '850', '825']
    .every(token => String(item?.momentStrongColumnBasis || '').includes(token));
  if (!['momentPriorTestSmrfPass', 'momentPanelZoneFail', 'momentRotationFail', 'momentScwbFail', 'momentThirdPartyThicknessFail']
    .every(id => hasExplicitScwbBasis(momentById[id]))) {
    issues.push('momentCases:explicit-ZbFyb-plus-Vpx-basis-required');
  }
  const panelFail = momentById.momentPanelZoneFail;
  const panelFailRequired = Math.max(
    Number(panelFail?.momentPanelZoneAnalysisDemand),
    Number(panelFail?.momentPanelZoneBeamMomentSum) * 1000 / Number(panelFail?.momentPanelZoneLeverArm),
  );
  const panelFailAvailable = 0.6 * Number(panelFail?.momentColumnWebYieldStrength)
    * Number(panelFail?.momentColumnDepth) * Number(panelFail?.momentPanelZoneThickness) / 1000;
  if (!(panelFailAvailable < panelFailRequired)) issues.push('momentCases:panel-zone-strength-failure-required');
  if (!(Number(momentById.momentRotationFail?.momentQualifiedPlasticRotation) < 0.03)) {
    issues.push('momentCases:rotation-failure-required');
  }
  const scwbFail = momentById.momentScwbFail;
  const scwbCw = (Number(scwbFail?.momentCwUpperColumnMoment) + Number(scwbFail?.momentCwLowerColumnMoment))
    / (Number(scwbFail?.momentCwLeftBeamMoment) + Number(scwbFail?.momentCwRightBeamMoment));
  const scwbCcw = (Number(scwbFail?.momentCcwUpperColumnMoment) + Number(scwbFail?.momentCcwLowerColumnMoment))
    / (Number(scwbFail?.momentCcwLeftBeamMoment) + Number(scwbFail?.momentCcwRightBeamMoment));
  if (!(Number(scwbFail?.momentCwUpperColumnMoment) === 1050
    && Number(scwbFail?.momentCwLowerColumnMoment) === 1000
    && Number(scwbFail?.momentCwLeftBeamMoment) === 840
    && Number(scwbFail?.momentCwRightBeamMoment) === 830
    && Number(scwbFail?.momentCcwUpperColumnMoment) === 1060
    && Number(scwbFail?.momentCcwLowerColumnMoment) === 1010
    && Number(scwbFail?.momentCcwLeftBeamMoment) === 850
    && Number(scwbFail?.momentCcwRightBeamMoment) === 825
    && scwbCw < 1.25 && scwbCcw < 1.25)) {
    issues.push('momentCases:SCWB-bidirectional-failure-required');
  }
  const thirdParty = momentById.momentThirdPartyThicknessFail;
  if (!(thirdParty?.momentQualificationRoute === 'third_party_review'
    && Number(thirdParty?.momentDesignBeamFlangeThickness) > 45
    && thirdParty?.momentThirdPartyReviewConfirmed === true
    && Number(thirdParty?.momentCwUpperColumnMoment) === 0
    && Number(thirdParty?.momentCcwUpperColumnMoment) === 0
    && Number(thirdParty?.momentCwLowerColumnMoment) > 0
    && Number(thirdParty?.momentCcwLowerColumnMoment) > 0
    && Number(thirdParty?.momentCwLeftBeamMoment) + Number(thirdParty?.momentCwRightBeamMoment) > 0
    && Number(thirdParty?.momentCcwLeftBeamMoment) + Number(thirdParty?.momentCcwRightBeamMoment) > 0)) {
    issues.push('momentCases:third-party-thickness-failure-required');
  }
  const momentGovernance = momentById.momentGovernanceRejected;
  const rejectedBasis = value => /示例|請依專案覆寫|請填|待補|未填|placeholder/i.test(String(value || ''));
  const validSha = value => /^[a-f0-9]{64}$/i.test(String(value || ''));
  if (!(MOMENT_BASIS_FIELDS.every(key => rejectedBasis(momentGovernance?.[key]))
    && MOMENT_SHA_FIELDS.every(key => !validSha(momentGovernance?.[key]))
    && momentGovernance?.momentConnectionHardwareVerifiedConfirmed === false
    && momentGovernance?.momentSelectedAxisScopeConfirmed === false)) {
    issues.push('momentCases:governance-basis-sha-rejection-required');
  }

  if (!Array.isArray(input?.spliceCases) || input.spliceCases.length !== SPLICE_CASE_IDS.length) {
    issues.push('spliceCases:six-required');
  }
  const actualSpliceIds = (input?.spliceCases || []).map(item => item?.id);
  if (actualSpliceIds.join('|') !== SPLICE_CASE_IDS.join('|')) {
    issues.push('spliceCases:case-order-and-ids');
  }
  for (const [index, item] of (input?.spliceCases || []).entries()) {
    const prefix = `spliceCases[${index}]`;
    const actualKeys = Object.keys(item || {}).sort();
    if (actualKeys.join('|') !== SPLICE_CASE_FIELDS.join('|')) {
      issues.push(`${prefix}:exact-49-source-field-shape-required`);
    }
    for (const [key, values] of Object.entries(SPLICE_ENUM_FIELDS)) {
      if (!values.includes(item?.[key])) issues.push(`${prefix}.${key}:unsupported`);
    }
    for (const key of SPLICE_FINITE_FIELDS) {
      if (typeof item?.[key] !== 'number' || !Number.isFinite(item[key])) {
        issues.push(`${prefix}.${key}:finite-number-required`);
      }
    }
    for (const key of SPLICE_BOOLEAN_FIELDS) {
      if (typeof item?.[key] !== 'boolean') issues.push(`${prefix}.${key}:boolean-required`);
    }
    for (const key of SPLICE_TEXT_FIELDS) {
      if (typeof item?.[key] !== 'string') issues.push(`${prefix}.${key}:string-required`);
    }
    for (const key of [
      'spliceDistanceToNearestBeamFlange', 'spliceAg', 'spliceZx', 'spliceZy',
      'spliceAvx', 'spliceAvy', 'spliceFy', 'spliceFexx', 'spliceMaxThickness',
    ]) {
      if (!(item?.[key] > 0)) issues.push(`${prefix}.${key}:positive-required`);
    }
    if (![0.5, 1].includes(item?.spliceLiveLoadFactor)) issues.push(`${prefix}.spliceLiveLoadFactor:unsupported`);
    if (!(item?.spliceSeismicReductionFu > 0)) issues.push(`${prefix}.spliceSeismicReductionFu:positive-required`);
    if (!(item?.spliceMaxTransferableAxial >= 0)) issues.push(`${prefix}.spliceMaxTransferableAxial:nonnegative-required`);
    if (item?.spliceTransferCapRoute === 'qualified' && !(item?.spliceMaxTransferableAxial > 0)) {
      issues.push(`${prefix}.spliceMaxTransferableAxial:qualified-positive-required`);
    }
  }
  const spliceById = Object.fromEntries((input?.spliceCases || []).map(item => [item?.id, item]));
  const spliceEampRaw = item => 1.4 * Number(item?.spliceSeismicReductionFu) * Math.abs(Number(item?.spliceSeismicAxial));
  const spliceEampAdopted = item => item?.spliceTransferCapRoute === 'qualified'
    && Number(item?.spliceMaxTransferableAxial) > 0
    && item?.spliceAllAdjacentTransferSourcesIncludedConfirmed === true
    ? Math.min(spliceEampRaw(item), 1.25 * Number(item.spliceMaxTransferableAxial))
    : spliceEampRaw(item);
  const splicePu = item => {
    const base = 1.2 * Number(item?.spliceDeadAxial) + Number(item?.spliceLiveLoadFactor) * Number(item?.spliceLiveAxial);
    const amplified = spliceEampAdopted(item);
    return Math.max(0, -(base + amplified), -(base - amplified));
  };
  const spliceNormalCapacity = item => 0.9 * Number(item?.spliceFy) * Number(item?.spliceAg) / 1000;
  const spliceReference = spliceById.spliceUncappedReferencePass;
  if (!(spliceReference?.spliceTransferCapRoute === 'uncapped'
    && spliceReference?.designMethod === 'LRFD'
    && spliceReference?.connectionType === 'column_splice'
    && spliceReference?.spliceSeismicReductionFu > 0
    && spliceReference?.spliceSeismicReductionFu <= 2.5
    && SPLICE_BOOLEAN_FIELDS.every(key => spliceReference?.[key] === true)
    && ['spliceDemandBasis', 'spliceGeometryBasis', 'spliceMaterialBasis', 'spliceWpsBasis', 'spliceNdtPlanBasis']
      .every(key => Boolean(String(spliceReference?.[key] || '').trim()) && !rejectedBasis(spliceReference?.[key]))
    && ['spliceDemandEvidenceSha256', 'spliceDetailEvidenceSha256', 'spliceWpsEvidenceSha256', 'spliceNdtPlanEvidenceSha256']
      .every(key => validSha(spliceReference?.[key])))) {
    issues.push('spliceCases:uncapped-reference-pass-required');
  }
  const spliceQualified = spliceById.spliceQualifiedCapPass;
  if (!(spliceQualified?.spliceTransferCapRoute === 'qualified'
    && spliceQualified?.spliceAllAdjacentTransferSourcesIncludedConfirmed === true
    && 1.25 * Number(spliceQualified?.spliceMaxTransferableAxial) < spliceEampRaw(spliceQualified))) {
    issues.push('spliceCases:qualified-transfer-cap-pass-required');
  }
  const spliceAxialFail = spliceById.spliceAxialDemandFail;
  if (!(splicePu(spliceAxialFail) > spliceNormalCapacity(spliceAxialFail))) {
    issues.push('spliceCases:axial-strength-failure-required');
  }
  const spliceWeakFiller = spliceById.spliceWeakFillerShearFail;
  if (!(0.8 * Number(spliceWeakFiller?.spliceFexx) < 0.9 * Number(spliceWeakFiller?.spliceFy)
    && spliceWeakFiller?.spliceMatchingFillerConfirmed === true)) {
    issues.push('spliceCases:weak-filler-shear-failure-required');
  }
  const spliceDetailFail = spliceById.spliceLocationNdtEvidenceFail;
  if (!(Number(spliceDetailFail?.spliceDistanceToNearestBeamFlange) < 1200
    && spliceDetailFail?.spliceNdtFullCoverageConfirmed === false
    && rejectedBasis(spliceDetailFail?.spliceNdtPlanBasis)
    && !validSha(spliceDetailFail?.spliceNdtPlanEvidenceSha256))) {
    issues.push('spliceCases:location-NDT-evidence-failure-required');
  }
  const spliceGovernance = spliceById.spliceGovernanceFuRejected;
  if (!(Number(spliceGovernance?.spliceSeismicReductionFu) > 2.5
    && ['spliceDemandBasis', 'spliceGeometryBasis', 'spliceMaterialBasis', 'spliceWpsBasis', 'spliceNdtPlanBasis']
      .every(key => rejectedBasis(spliceGovernance?.[key]))
    && ['spliceDemandEvidenceSha256', 'spliceDetailEvidenceSha256', 'spliceWpsEvidenceSha256', 'spliceNdtPlanEvidenceSha256']
      .every(key => !validSha(spliceGovernance?.[key]))
    && spliceGovernance?.spliceWpsApprovedConfirmed === false
    && spliceGovernance?.spliceNdtFullCoverageConfirmed === false
    && spliceGovernance?.spliceAsBuiltBoundaryConfirmed === false)) {
    issues.push('spliceCases:Fu-and-governance-rejection-required');
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

function calculateGussetCase(input) {
  const result = calculateConnection({ ...input, connectionType: 'brace_gusset' });
  const checkPrefixes = {
    gussetBoltShear:'bolt',
    gussetBoltBearing:'gussetBearing',
    braceBoltBearing:'braceBearing',
    gussetGrossYield:'gussetGross',
    gussetNetRupture:'gussetNet',
    gussetBlockShear:'gussetBlock',
    braceGrossYield:'braceGross',
    braceNetRupture:'braceNet',
    braceBlockShear:'braceBlock',
    gussetWhitmoreYield:'whitmore',
    gussetWeldMetal:'weldMetal',
    gussetWeldBaseGusset:'weldGussetBase',
    gussetWeldBaseSupport:'weldSupportBase',
  };
  const detailPrefixes = {
    gussetMethod:'methodPass',
    gussetPositiveTension:'positiveTensionPass',
    gussetZeroShear:'zeroShearPass',
    gussetZeroMoment:'zeroMomentPass',
    gussetConcentric:'concentricPass',
    gussetStaticNonseismicConfirmed:'staticNonseismicConfirmedPass',
    gussetLoadPathConfirmed:'loadPathConfirmedPass',
    gussetBoltGrade:'boltGradePass',
    gussetStandardHole:'standardHolePass',
    gussetBoltDiameterTable:'boltDiameterTablePass',
    gussetHoleDiameter:'holeDiameterPass',
    gussetStandardHoleMaximum:'standardHoleMaximumPass',
    gussetSingleShear:'singleShearPass',
    gussetBoltCount:'boltCountPass',
    gussetSingleStraightBoltLine:'singleStraightBoltLinePass',
    gussetMaterialOrder:'gussetMaterialOrderPass',
    braceMaterialOrder:'braceMaterialOrderPass',
    gussetSupportMaterialOrder:'supportMaterialOrderPass',
    gussetNetGeometry:'gussetNetGeometryPass',
    braceNetGeometry:'braceNetGeometryPass',
    gussetAvailableWidth:'availableWidthPass',
    gussetWhitmoreConnectionLength:'whitmoreConnectionLengthPass',
    gussetBearingConnectionLength:'bearingConnectionLengthPass',
    gussetFlatPlateBrace:'flatPlateBracePass',
    gussetBoltLine_holeCompatibility:'gussetBoltLineHoleCompatibilityPass',
    gussetBoltLine_minSpacing:'gussetBoltLineMinSpacingPass',
    gussetBoltLine_minEnd:'gussetBoltLineMinEndPass',
    gussetBoltLine_minEdge:'gussetBoltLineMinEdgePass',
    gussetBoltLine_maxEnd:'gussetBoltLineMaxEndPass',
    gussetBoltLine_maxEdge:'gussetBoltLineMaxEdgePass',
    gussetBoltLine_maxSpacing:'gussetBoltLineMaxSpacingPass',
    braceBoltLine_holeCompatibility:'braceBoltLineHoleCompatibilityPass',
    braceBoltLine_minSpacing:'braceBoltLineMinSpacingPass',
    braceBoltLine_minEnd:'braceBoltLineMinEndPass',
    braceBoltLine_minEdge:'braceBoltLineMinEdgePass',
    braceBoltLine_maxEnd:'braceBoltLineMaxEndPass',
    braceBoltLine_maxEdge:'braceBoltLineMaxEdgePass',
    braceBoltLine_maxSpacing:'braceBoltLineMaxSpacingPass',
    gussetDoubleFilletWeld:'doubleFilletWeldPass',
    gussetMinWeldSize:'minWeldSizePass',
    gussetMaxWeldSize:'maxWeldSizePass',
    gussetShortWeld:'shortWeldPass',
    gussetLongWeld:'longWeldPass',
    gussetDemandBasis:'demandBasisPass',
    gussetGeometryBasis:'geometryBasisPass',
    gussetMaterialBasis:'materialBasisPass',
    gussetModelBasis:'modelBasisPass',
  };
  const areas = result.derivedAreas || {};
  const output = {
    lrfd:result.state.designMethod === 'LRFD' ? 1 : 0,
    checkCount:result.checks.length,
    gussetGrossArea:areas.gussetGrossArea,
    gussetNetArea:areas.gussetNetArea,
    gussetEffectiveNetArea:areas.gussetEffectiveNetArea,
    braceGrossArea:areas.braceGrossArea,
    braceNetArea:areas.braceNetArea,
    gussetBlockAgv:areas.gussetBlockAgv,
    gussetBlockAnv:areas.gussetBlockAnv,
    gussetBlockAgt:areas.gussetBlockAgt,
    gussetBlockAnt:areas.gussetBlockAnt,
    braceBlockAgv:areas.braceBlockAgv,
    braceBlockAnv:areas.braceBlockAnv,
    braceBlockAgt:areas.braceBlockAgt,
    braceBlockAnt:areas.braceBlockAnt,
    gussetWhitmoreTheoreticalWidth:areas.gussetWhitmoreTheoreticalWidth,
    gussetWhitmoreEffectiveWidth:areas.gussetWhitmoreEffectiveWidth,
    gussetWhitmoreArea:areas.gussetWhitmoreArea,
    gussetBlockEquation3:checkByKey(result, 'gussetBlockShear').equationRef === '式(10.4-3)' ? 1 : 0,
    braceBlockEquation3:checkByKey(result, 'braceBlockShear').equationRef === '式(10.4-3)' ? 1 : 0,
    governingBraceGross:result.governing?.key === 'braceGrossYield' ? 1 : 0,
    standardHoleMaximum:detailByKey(result, 'gussetStandardHoleMaximum').required,
    minimumWeldSize:detailByKey(result, 'gussetMinWeldSize').required,
    maximumWeldSize:detailByKey(result, 'gussetMaxWeldSize').required,
    strengthPass:result.summary.strengthFailure ? 0 : 1,
    detailPass:result.detailChecks.every(item => item.passes) ? 1 : 0,
    validationFailure:result.summary.validationFailure ? 1 : 0,
    complianceReady:result.complianceReady ? 1 : 0,
    overallPass:result.passes ? 1 : 0,
  };
  for (const [key, prefix] of Object.entries(checkPrefixes)) {
    const check = checkByKey(result, key);
    output[`${prefix}Nominal`] = check.nominal;
    output[`${prefix}Available`] = check.available;
    output[`${prefix}Ratio`] = check.ratio;
  }
  for (const [key, outputKey] of Object.entries(detailPrefixes)) {
    output[outputKey] = detailByKey(result, key).passes ? 1 : 0;
  }
  return output;
}

function calculateMomentCase(input) {
  const result = calculateConnection({ ...input, connectionType:'beam_column_moment' });
  const actualStrengthKeys = result.checks.map(item => item.key);
  if (actualStrengthKeys.join('|') !== MOMENT_STRENGTH_KEYS.join('|')) {
    throw new Error(`steel-formal-production-moment-strength-keys:${actualStrengthKeys.join('|')}`);
  }
  const seismic = result.seismicReview || {};
  const flexural = checkByKey(result, 'momentFlexuralStrength');
  const shear = checkByKey(result, 'momentShearStrength');
  const rotation = checkByKey(result, 'momentPlasticRotation');
  const panelZone = checkByKey(result, 'momentPanelZoneShear');
  const scwbCw = checkByKey(result, 'momentStrongColumnCw');
  const scwbCcw = checkByKey(result, 'momentStrongColumnCcw');
  const detailOutputs = {
    lrfdPass:'momentLrfdMethod',
    frameSystemPass:'momentFrameSystem',
    axisPass:'momentAxis',
    designRoutePass:'momentDesignRoute',
    farCriticalMomentPass:'momentFarCriticalSectionExpectedMoment',
    expectedStrengthFactorPass:'momentExpectedStrengthFactor',
    beamFlangeCompactnessPass:'momentBeamFlangeCompactnessRatio',
    beamWebCompactnessPass:'momentBeamWebCompactnessRatio',
    beamFlangePlasticModulusPass:'momentBeamFlangePlasticModulusRatio',
    panelZoneThicknessPass:'momentPanelZoneThickness',
    doublerAttachmentPass:'momentDoublerAttachmentConfirmed',
    continuityPlateRequirementPass:'momentContinuityPlateRequirement',
    continuityPlateWeldPass:'momentContinuityPlateWeldConfirmed',
    qualificationRoutePass:'momentQualificationRoute',
    qualificationTestCountPass:'momentQualificationTestCount',
    qualificationThicknessSimilarityPass:'momentQualificationThicknessSimilarity',
    qualificationPlasticRatioSimilarityPass:'momentQualificationPlasticRatioSimilarity',
    thirdPartyReviewPass:'momentThirdPartyReviewConfirmed',
    qualificationConfigurationPass:'momentQualificationConfigurationConfirmed',
    qualificationMaterialPass:'momentQualificationMaterialConfirmed',
    qualificationWeldingPass:'momentQualificationWeldingConfirmed',
    qualificationGeometryPass:'momentQualificationGeometryConfirmed',
    qualificationFabricationPass:'momentQualificationFabricationConfirmed',
    qualificationProcedurePass:'momentQualificationProcedureConfirmed',
    plasticZoneGeometryPass:'momentPlasticZoneGeometryConfirmed',
    plasticZoneOpeningsPass:'momentPlasticZoneOpeningsAbsentConfirmed',
    seismicMaterialPass:'momentSeismicMaterialConfirmed',
    matchingWeldPass:'momentMatchingWeldConfirmed',
    cns3506WeldPass:'momentCns3506WeldConfirmed',
    endTabsPass:'momentEndTabsRemovedGroundConfirmed',
    weldProcedurePass:'momentWeldProcedureMatchesQualificationConfirmed',
    jointLateralRestraintPass:'momentJointLateralRestraintConfirmed',
    beamLateralBracingPass:'momentBeamLateralBracingConfirmed',
    allMembersIncludedPass:'momentAllMembersIncludedConfirmed',
    governingAxialPass:'momentColumnStrengthsAtGoverningAxialConfirmed',
    opposingDirectionsPass:'momentOpposingDirectionsConfirmed',
    orthogonalSeparatePass:'momentOrthogonalDirectionSeparateConfirmed',
    hardwareVerifiedPass:'momentConnectionHardwareVerifiedConfirmed',
    selectedAxisScopePass:'momentSelectedAxisScopeConfirmed',
    demandBasisPass:'momentDemandBasis',
    geometryBasisPass:'momentGeometryBasis',
    materialBasisPass:'momentMaterialBasis',
    capacityBasisPass:'momentCapacityBasis',
    panelZoneBasisPass:'momentPanelZoneBasis',
    strongColumnBasisPass:'momentStrongColumnBasis',
    qualificationBasisPass:'momentQualificationBasis',
    qualificationEvidenceShaPass:'momentQualificationEvidenceSha256',
    capacityEvidenceShaPass:'momentCapacityEvidenceSha256',
  };
  return {
    sourceFieldCount:MOMENT_SOURCE_FIELDS.length,
    checkCount:result.checks.length,
    Mp:seismic.Mp,
    Mpr:seismic.Mpr,
    MprFar:seismic.MprFar,
    Vp:seismic.Vp,
    MuFace:seismic.MuFace,
    VuRequired:seismic.VuRequired,
    rotationDemand:seismic.rotationDemand,
    qualifiedRotation:seismic.qualifiedRotation,
    VpzMin:seismic.VpzMin,
    VpzRequired:seismic.VpzRequired,
    VpzNominal:seismic.VpzNominal,
    VpzAvailable:panelZone.available,
    panelThicknessRequired:seismic.panelThicknessRequired,
    continuityThreshold:seismic.continuityThreshold,
    continuityRequired:seismic.continuityRequired ? 1 : 0,
    scwbCw:seismic.scwbCw,
    scwbCcw:seismic.scwbCcw,
    flexuralRatio:flexural.ratio,
    shearRatio:shear.ratio,
    rotationRatio:rotation.ratio,
    panelZoneRatio:panelZone.ratio,
    scwbCwRatio:scwbCw.ratio,
    scwbCcwRatio:scwbCcw.ratio,
    ...Object.fromEntries(Object.entries(detailOutputs).map(([outputKey, detailKey]) => (
      [outputKey, detailByKey(result, detailKey).passes ? 1 : 0]
    ))),
    strengthPass:result.summary.strengthFailure ? 0 : 1,
    detailPass:result.detailChecks.every(item => item.passes) ? 1 : 0,
    validationFailure:result.summary.validationFailure ? 1 : 0,
    complianceReady:result.complianceReady ? 1 : 0,
    completeJointDesign:result.completeJointDesign === false ? 0 : 1,
    passes:result.passes ? 1 : 0,
  };
}

function calculateSpliceCase(input) {
  const result = calculateConnection({ ...input, connectionType:'column_splice' });
  const actualStrengthKeys = result.checks.map(item => item.key);
  if (actualStrengthKeys.join('|') !== SPLICE_STRENGTH_KEYS.join('|')) {
    throw new Error(`steel-formal-production-splice-strength-keys:${actualStrengthKeys.join('|')}`);
  }
  const splice = result.spliceReview || {};
  const strengthOutputs = {
    axialCompressionRatio:'spliceAxialCompression13_4_1',
    axialTensionRatio:'spliceAxialTension13_4_1',
    normalRatio:'spliceFullSectionNormal',
    majorFlexuralRatio:'spliceFullSectionMajorFlexure',
    minorFlexuralRatio:'spliceFullSectionMinorFlexure',
    majorShearRatio:'spliceFullSectionMajorShear',
    minorShearRatio:'spliceFullSectionMinorShear',
  };
  const detailOutputs = {
    lrfdPass:'spliceLrfdMethod',
    seismicColumnPass:'spliceSeismicColumn',
    cjpRoutePass:'spliceCjpRoute',
    topologyPass:'spliceTopologyScope',
    locationPass:'spliceLocation1200',
    nonJumboPass:'spliceNonJumbo',
    loadInputsPass:'spliceLoadInputs',
    transferCapPass:'spliceTransferCap',
    matchingFillerPass:'spliceMatchingFiller',
    wpsPass:'spliceWps',
    ndtPlanPass:'spliceNdtPlan',
    evidencePass:'spliceEvidence',
    asBuiltBoundaryPass:'spliceAsBuiltBoundary',
  };
  return {
    sourceFieldCount:SPLICE_SOURCE_FIELDS.length,
    checkCount:result.checks.length,
    EampRaw:splice.EampRaw,
    EampAdopted:splice.EampAdopted,
    transferCapApplied:splice.transferCapApplied ? 1 : 0,
    compressionPlus:splice.compressionCombinations?.[0],
    compressionMinus:splice.compressionCombinations?.[1],
    tensionPlus:splice.tensionCombinations?.[0],
    tensionMinus:splice.tensionCombinations?.[1],
    PuCompression:splice.PuCompression,
    TuTension:splice.TuTension,
    normalNominal:splice.normalNominal,
    normalCapacity:splice.normalCapacity,
    majorFlexuralNominal:splice.majorFlexuralNominal,
    majorFlexuralCapacity:splice.majorFlexuralCapacity,
    minorFlexuralNominal:splice.minorFlexuralNominal,
    minorFlexuralCapacity:splice.minorFlexuralCapacity,
    majorShearBaseCapacity:splice.majorShearBaseCapacity,
    majorShearWeldCapacity:splice.majorShearWeldCapacity,
    majorShearCapacity:splice.majorShearCapacity,
    minorShearBaseCapacity:splice.minorShearBaseCapacity,
    minorShearWeldCapacity:splice.minorShearWeldCapacity,
    minorShearCapacity:splice.minorShearCapacity,
    ...Object.fromEntries(Object.entries(strengthOutputs).map(([outputKey, strengthKey]) => (
      [outputKey, checkByKey(result, strengthKey).ratio]
    ))),
    ...Object.fromEntries(Object.entries(detailOutputs).map(([outputKey, detailKey]) => (
      [outputKey, detailByKey(result, detailKey).passes ? 1 : 0]
    ))),
    strengthPass:result.summary.strengthFailure ? 0 : 1,
    detailPass:result.detailChecks.every(item => item.passes) ? 1 : 0,
    validationFailure:result.summary.validationFailure ? 1 : 0,
    complianceReady:result.complianceReady ? 1 : 0,
    completeJointDesign:result.completeJointDesign === false ? 0 : 1,
    completeColumnMemberDesign:result.completeColumnMemberDesign === false ? 0 : 1,
    asBuiltAcceptance:result.asBuiltAcceptance === false ? 0 : 1,
    passes:result.passes ? 1 : 0,
  };
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-steel-formal-benchmark-input:${issues.join(',')}`);
  return {
    [input.plateCase.id]: calculatePlateCase(input.plateCase),
    ...Object.fromEntries(input.tensionCases.map(item => [item.id, calculateTensionCase(item)])),
    ...Object.fromEntries(input.singlePlateCases.map(item => [item.id, calculateSinglePlateCase(item)])),
    ...Object.fromEntries(input.gussetCases.map(item => [item.id, calculateGussetCase(item)])),
    ...Object.fromEntries(input.momentCases.map(item => [item.id, calculateMomentCase(item)])),
    ...Object.fromEntries(input.spliceCases.map(item => [item.id, calculateSpliceCase(item)])),
  };
}

module.exports = { validateInput, calculate };
