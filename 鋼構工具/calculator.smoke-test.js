const assert = require("node:assert/strict");
const { calculateConnection } = require("./calculator.js");

const shared = {
  designMethod: "LRFD",
  exposureCondition: "painted",
  boltDiameter: 22,
  holeDiameter: 24,
  holeType: "standard",
  edgeFabrication: "rolled",
  boltUltimateStrength: 1000,
  threadsCondition: "included",
  deformationConsidered: "true",
};

const columnSpliceBase = {
  projectName: "CJP 耐震柱續接正式算例",
  connectionTag: "CS-CJP-01",
  designer: "QA",
  notes: "拉力正、壓力負；全斷面 CJP 設計階段能力審查",
  connectionType: "column_splice",
  designMethod: "LRFD",
  spliceFrameRole: "seismic_force_resisting",
  spliceDesignRoute: "cjp_full_section_identical_rolled_h",
  spliceLocationRoute: "beam_flange_1200",
  spliceDistanceToNearestBeamFlange: 1500,
  spliceDeadAxial: -600,
  spliceLiveAxial: -200,
  spliceSeismicAxial: 400,
  spliceLiveLoadFactor: 0.5,
  spliceSeismicReductionFu: 1.5,
  spliceTransferCapRoute: "uncapped",
  spliceMaxTransferableAxial: 0,
  spliceAg: 30000,
  spliceZx: 5000000,
  spliceZy: 2000000,
  spliceAvx: 10000,
  spliceAvy: 12000,
  spliceFy: 345,
  spliceFexx: 490,
  spliceMaxThickness: 36,
  spliceFabricationLocation: "field",
  spliceNdtMethod: "UT",
  spliceDemandBasis: "分析模型 STR-CS-01／13.4.1 軸力分項與方向包絡",
  spliceGeometryBasis: "核定圖 S-701／CS-CJP-01 同斷面熱軋 H 形柱",
  spliceMaterialBasis: "材料證明 M-CS-01／Fy 345 MPa 與 E70 銲材",
  spliceWpsBasis: "核定 WPS/PQR WPS-CS-01／全斷面 CJP",
  spliceNdtPlanBasis: "檢驗計畫 ITP-CS-01／工地 CJP 100% UT",
  spliceDemandEvidenceSha256: "a".repeat(64),
  spliceDetailEvidenceSha256: "b".repeat(64),
  spliceWpsEvidenceSha256: "c".repeat(64),
  spliceNdtPlanEvidenceSha256: "d".repeat(64),
  spliceIdenticalSectionsAndMaterialConfirmed: true,
  spliceAlignedAxesConfirmed: true,
  spliceFullProfileCjpConfirmed: true,
  spliceMatchingFillerConfirmed: true,
  spliceWpsApprovedConfirmed: true,
  spliceNdtFullCoverageConfirmed: true,
  spliceNoPjpConfirmed: true,
  spliceNoMixedLoadSharingConfirmed: true,
  spliceSeismicColumnConfirmed: true,
  spliceLocationScopeConfirmed: true,
  spliceAllAdjacentTransferSourcesIncludedConfirmed: false,
  spliceAsBuiltBoundaryConfirmed: true,
};

const singlePlateBase = {
  connectionType: "single_plate",
  designMethod: "LRFD",
  exposureCondition: "painted",
  requiredAxial: 0,
  requiredShear: 200,
  requiredMoment: 0,
  eccentricity: 35,
  boltDiameter: 20,
  holeDiameter: 21.5,
  holeType: "standard",
  edgeFabrication: "rolled",
  boltUltimateStrength: 1000,
  boltGrade: "F10T",
  threadsCondition: "included",
  deformationConsidered: "true",
  boltCount: 4,
  shearPlanes: 1,
  endDistance: 40,
  pitch: 75,
  plateThickness: 9,
  plateYieldStrength: 235,
  plateUltimateStrength: 490,
  transverseEdgeDistance: 40,
  plateHeight: 305,
  boltLineToWeldDistance: 70,
  weldEccentricity: 70,
  beamWebThickness: 8,
  beamWebYieldStrength: 235,
  beamWebUltimateStrength: 490,
  beamWebEndDistance: 40,
  beamWebEdgeDistance: 40,
  supportThickness: 12,
  supportYieldStrength: 325,
  supportUltimateStrength: 490,
  fillerThickness: 0,
  fillerExtended: "true",
  weldSize: 6,
  weldLength: 305,
  weldLineCount: 2,
  weldElectrodeStrength: 490,
  demandBasis: "分析模型 R-01／ULS 反力表",
  geometryBasis: "核定圖 S-502／ST-01",
  materialBasis: "核定 Fy=235／Fu=490 MPa 鋼材規格與 F10T 螺栓證明",
  eccentricityBasis: "核定接頭圖與 a/2 彈性模型",
  conventionalMaterialConfirmed: "true",
  connectionModelConfirmed: "true",
};

const gussetBase = {
  projectName: "Gusset V1 正式算例",
  connectionTag: "BG-01",
  designer: "QA",
  notes: "LRFD 正軸向同心拉力",
  connectionType: "brace_gusset",
  designMethod: "LRFD",
  exposureCondition: "painted",
  requiredAxial: 400,
  requiredShear: 0,
  requiredMoment: 0,
  eccentricity: 0,
  boltDiameter: 20,
  holeDiameter: 21.5,
  holeType: "standard",
  edgeFabrication: "rolled",
  boltUltimateStrength: 1000,
  boltGrade: "F10T",
  threadsCondition: "included",
  deformationConsidered: true,
  gussetBoltCount: 6,
  gussetShearPlanes: 1,
  gussetEndDistance: 50,
  gussetPitch: 70,
  gussetEdgeDistance: 60,
  gussetThickness: 14,
  gussetYieldStrength: 325,
  gussetUltimateStrength: 490,
  gussetConnectionWidth: 180,
  gussetNetWidth: 156.5,
  gussetWhitmoreConnectionLength: 350,
  gussetAvailableWidth: 400,
  braceSectionType: "flat_plate",
  braceEndDistance: 50,
  braceEdgeDistance: 60,
  braceThickness: 12,
  braceFy: 325,
  braceFu: 490,
  braceGrossWidth: 160,
  braceNetWidth: 136.5,
  weldSize: 8,
  weldLength: 250,
  weldLineCount: 2,
  weldFexx: 490,
  supportThickness: 16,
  supportFy: 325,
  supportFu: 490,
  gussetDemandBasis: "分析模型 STR-GS-01／ULS 拉力包絡",
  gussetGeometryBasis: "核定接頭圖 S-503／BG-01",
  gussetMaterialBasis: "材料證明 M-01／F10T 與 E70 銲材證明",
  gussetModelBasis: "核定圖確認平板支撐矩形截面全元素直接連接、單一直線栓列與雙側縱向銲串聯力流",
  gussetStaticNonseismicConfirmed: true,
  gussetLoadPathConfirmed: true,
};

const momentBase = {
  ...shared,
  projectName: "Moment V1 正式算例",
  connectionTag: "MC-01",
  designer: "QA",
  notes: "補強式梁柱彎矩接頭耐震能力審查附件",
  connectionType: "beam_column_moment",
  requiredAxial: 900,
  requiredShear: 0,
  requiredMoment: 0,
  eccentricity: 0,
  momentFrameSystem: "smrf",
  momentAxis: "x",
  momentConnectionDesignRoute: "reinforced",
  momentRotationDemandMethod: "default",
  momentNonlinearPlasticRotation: 0.02,
  momentSystemDuctilityR: 8,
  momentElasticStoryDrift: 0.025,
  momentBeamPlasticModulus: 2000000,
  momentBeamYieldStrength: 350,
  momentExpectedStrengthFactor: 1.1,
  momentCriticalSectionDistance: 300,
  momentPlasticHingeSpan: 3500,
  momentFarCriticalSectionExpectedMoment: 770,
  momentGravityShear: 120,
  momentAmplifiedShear: 700,
  momentAvailableFlexuralStrength: 950,
  momentAvailableShearStrength: 600,
  momentQualifiedPlasticRotation: 0.04,
  momentQualificationRoute: "prior_test_similarity",
  momentQualificationTestCount: 3,
  momentDesignBeamFlangeThickness: 16,
  momentTestBeamFlangeThickness: 18,
  momentDesignFlangePlasticRatio: 0.76,
  momentTestFlangePlasticRatio: 0.75,
  momentColumnWebYieldStrength: 325,
  momentColumnDepth: 600,
  momentPanelZoneThickness: 20,
  momentPanelZoneClearDepth: 540,
  momentPanelZoneClearWidth: 360,
  momentPanelZoneAnalysisDemand: 2100,
  momentPanelZoneBeamMomentSum: 1540,
  momentPanelZoneLeverArm: 700,
  momentDoublerPresent: "true",
  momentDoublerAttachmentConfirmed: "true",
  momentBeamFlangeWidth: 250,
  momentBeamFlangeThickness: 16,
  momentColumnFlangeLocalNominalStrength: 2400,
  momentContinuityPlateProvidedConfirmed: true,
  momentContinuityPlateWeldConfirmed: true,
  momentBeamFlangeCompactnessRatio: 0.95,
  momentBeamWebCompactnessRatio: 0.85,
  momentBeamFlangePlasticModulusRatio: 0.75,
  momentCwUpperColumnMoment: 1200,
  momentCwLowerColumnMoment: 1100,
  momentCwLeftBeamMoment: 840,
  momentCwRightBeamMoment: 830,
  momentCcwUpperColumnMoment: 1220,
  momentCcwLowerColumnMoment: 1120,
  momentCcwLeftBeamMoment: 850,
  momentCcwRightBeamMoment: 825,
  momentDemandBasis: "ETABS ULS 包絡與節點剪力整理表",
  momentGeometryBasis: "核定鋼構詳圖 S-601 / MC-01",
  momentMaterialBasis: "梁柱鋼材與銲材材料證明 M-21",
  momentCapacityBasis: "受控接頭容量表 MC-01-R1",
  momentPanelZoneBasis: "Panel Zone 分析書 MC-PZ-01",
  momentStrongColumnBasis: "柱梁彎矩比整理表 MC-SCWB-01，含各梁 ZbFyb + Vp·x",
  momentQualificationBasis: "耐震資格試驗比對報告 MC-QUAL-01",
  momentQualificationEvidenceSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  momentCapacityEvidenceSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  momentQualificationConfigurationConfirmed: true,
  momentQualificationMaterialConfirmed: true,
  momentQualificationWeldingConfirmed: true,
  momentQualificationGeometryConfirmed: true,
  momentQualificationFabricationConfirmed: true,
  momentQualificationProcedureConfirmed: true,
  momentThirdPartyReviewConfirmed: true,
  momentPlasticZoneGeometryConfirmed: true,
  momentPlasticZoneOpeningsAbsentConfirmed: true,
  momentSeismicMaterialConfirmed: true,
  momentMatchingWeldConfirmed: true,
  momentCns3506WeldConfirmed: true,
  momentEndTabsRemovedGroundConfirmed: true,
  momentWeldProcedureMatchesQualificationConfirmed: true,
  momentJointLateralRestraintConfirmed: true,
  momentBeamLateralBracingConfirmed: true,
  momentAllMembersIncludedConfirmed: true,
  momentColumnStrengthsAtGoverningAxialConfirmed: true,
  momentOpposingDirectionsConfirmed: true,
  momentOrthogonalDirectionSeparateConfirmed: true,
  momentConnectionHardwareVerifiedConfirmed: true,
  momentSelectedAxisScopeConfirmed: true,
};

const shear = calculateConnection(singlePlateBase);
assert.equal(shear.complianceReady, true, "single plate should be a formal scoped module");
assert.equal(shear.passes, true, "complete LRFD single plate case should pass");
assert.equal(shear.checks.length, 10, "single plate should expose all ten strength routes");
assert.equal(shear.derivedAreas.Agv, 2745, "single plate gross shear area should use plate height");
assert.equal(shear.derivedAreas.Anv, 1917, "single plate net shear area should deduct every row hole");
assert.equal(shear.derivedAreas.plateBlockAgv, 2385, "single plate block shear gross area should use one longitudinal shear plane");
assert.equal(shear.derivedAreas.plateBlockAnv, 1660.5, "single plate block shear net area should use one longitudinal shear plane");
assert.equal(shear.derivedAreas.plateBlockAgt, 360, "single plate block shear gross tension area golden");
assert.equal(shear.derivedAreas.plateBlockAnt, 256.5, "single plate block shear net tension area golden");
assert.equal(shear.derivedAreas.beamBlockAgv, 2120, "beam web block shear gross area should use one longitudinal shear plane");
assert.equal(shear.derivedAreas.beamBlockAnv, 1476, "beam web block shear net area should use one longitudinal shear plane");
assert.equal(shear.derivedAreas.beamBlockAgt, 320, "beam web block shear gross tension area golden");
assert.equal(shear.derivedAreas.beamBlockAnt, 228, "beam web block shear net tension area golden");
assert.ok(Math.abs(shear.checks.find((item) => item.key === "plateGrossShearYield").available - 348.3405) < 1e-12, "plate gross shear yield golden capacity");
assert.ok(Math.abs(shear.checks.find((item) => item.key === "plateNetShearRupture").available - 422.6985) < 1e-12, "plate net shear rupture golden capacity");
assert.ok(Math.abs(shear.checks.find((item) => item.key === "plateBlockShear").available - 429.59025) < 1e-12, "single plate L-path block shear golden capacity");
assert.ok(Math.abs(shear.checks.find((item) => item.key === "beamWebBlockShear").available - 381.858) < 1e-12, "beam web L-path block shear golden capacity");
const shearBolt = shear.checks.find((item) => item.key === "boltShearEccentric");
assert.ok(Math.abs(shearBolt.ratio - 0.6200258140712452) < 1e-12, "F10T M20 eccentric bolt golden ratio");

const minimumShear = calculateConnection({ ...singlePlateBase, requiredShear: 20 });
assert.ok(Math.abs(minimumShear.designDemand.adoptedShear - 44.129925) < 1e-12, "minimum LRFD connection force should be 4.5 tf");
assert.ok(minimumShear.checks.every((item) => Math.abs(item.demand - 44.129925) < 1e-12), "every strength route should use adopted minimum force");

const negativeShear = calculateConnection({ ...singlePlateBase, requiredShear: -200 });
assert.ok(Math.abs(negativeShear.checks.find((item) => item.key === "boltShearEccentric").ratio - shearBolt.ratio) < 1e-12, "negative shear must use positive demand magnitude");

const concentricShear = calculateConnection({ ...singlePlateBase, eccentricity: 0 });
assert.ok(concentricShear.checks.find((item) => item.key === "boltShearEccentric").available > shearBolt.available, "eccentricity should reduce bolt-group capacity");
assert.equal(concentricShear.detailChecks.find((item) => item.key === "singlePlateBoltEccentricity").passes, false, "standard-hole bolt eccentricity below the conventional a/2 branch must block approval");

const sixBoltLowEccentricity = calculateConnection({
  ...singlePlateBase,
  boltCount: 6,
  eccentricity: 69,
  plateHeight: 460,
  weldLength: 400,
});
assert.equal(sixBoltLowEccentricity.detailChecks.find((item) => item.key === "singlePlateBoltEccentricity").passes, false, "six standard-hole bolts require eb at least equal to a");

const understatedWeldEccentricity = calculateConnection({ ...singlePlateBase, weldEccentricity: 69 });
assert.equal(understatedWeldEccentricity.detailChecks.find((item) => item.key === "singlePlateWeldEccentricity").passes, false, "weld-group eccentricity below the bolt-line-to-weld distance must block approval");

const undersizedConventionalWeld = calculateConnection({ ...singlePlateBase, plateThickness: 12, weldSize: 7 });
assert.equal(undersizedConventionalWeld.detailChecks.find((item) => item.key === "singlePlateConventionalWeldSize").passes, false, "conventional double fillet weld must be at least 5/8 tp");

const singleSidedWeld = calculateConnection({ ...singlePlateBase, weldLineCount: 1 });
assert.equal(singleSidedWeld.detailChecks.find((item) => item.key === "singlePlateDoubleFilletWeld").passes, false, "single-sided weld must remain outside the formal V1 model");

const oversizedStandardHole = calculateConnection({ ...singlePlateBase, holeDiameter: 22 });
assert.equal(oversizedStandardHole.detailChecks.find((item) => item.key === "singlePlateStandardHoleMaximum").passes, false, "M20 standard hole above 21.5 mm must fail Table 10.3-5");

const unsupportedBoltDiameter = calculateConnection({ ...singlePlateBase, boltDiameter: 18, holeDiameter: 19.5 });
assert.equal(unsupportedBoltDiameter.detailChecks.find((item) => item.key === "singlePlateBoltDiameterTable").passes, false, "non-tabulated bolt diameter below 27 mm must fail closed");

const nonDeformationBearing = calculateConnection({ ...singlePlateBase, deformationConsidered: "false" });
assert.ok(nonDeformationBearing.checks.find((item) => item.key === "plateBearing").available > shear.checks.find((item) => item.key === "plateBearing").available, "bearing equation should be less conservative only when service-load deformation is not a design consideration");

const asdShear = calculateConnection({ ...singlePlateBase, designMethod: "ASD" });
assert.equal(asdShear.passes, false, "ASD single plate route must fail closed");
assert.equal(asdShear.detailChecks.find((item) => item.key === "singlePlateMethod").passes, false, "ASD scope detail should fail");

const unconfirmedShear = calculateConnection({ ...singlePlateBase, demandBasis: "示例資料（請依專案覆寫）", connectionModelConfirmed: false });
assert.equal(unconfirmedShear.passes, false, "example provenance and unconfirmed model must block approval");

const unconfirmedConventionalMaterial = calculateConnection({ ...singlePlateBase, conventionalMaterialConfirmed: false });
assert.equal(unconfirmedConventionalMaterial.detailChecks.find((item) => item.key === "singlePlateConventionalMaterialConfirmed").passes, false, "missing project material-equivalency confirmation must block approval");
assert.equal(unconfirmedConventionalMaterial.passes, false, "material confirmation is a formal approval gate");

const highStrengthConventionalMaterial = calculateConnection({
  ...singlePlateBase,
  plateYieldStrength: 690,
  plateUltimateStrength: 780,
  beamWebYieldStrength: 690,
  beamWebUltimateStrength: 780,
  conventionalMaterialConfirmed: true,
});
assert.equal(highStrengthConventionalMaterial.detailChecks.find((item) => item.key === "singlePlateConventionalPlateFy").passes, false, "Fy 690 MPa plate must remain outside the conventional procedure even when confirmed");
assert.equal(highStrengthConventionalMaterial.detailChecks.find((item) => item.key === "singlePlateConventionalBeamWebFy").passes, false, "Fy 690 MPa beam web must remain outside the conventional procedure even when confirmed");
assert.equal(highStrengthConventionalMaterial.passes, false, "project confirmation must not override the 345 MPa hard caps");

for (const [label, overrides, key] of [
  ["plate", { plateYieldStrength: 500, plateUltimateStrength: 490 }, "singlePlatePlateMaterialOrder"],
  ["beam web", { beamWebYieldStrength: 500, beamWebUltimateStrength: 490 }, "singlePlateBeamWebMaterialOrder"],
  ["support", { supportYieldStrength: 500, supportUltimateStrength: 490 }, "singlePlateSupportMaterialOrder"],
]) {
  const invalidMaterialOrder = calculateConnection({ ...singlePlateBase, ...overrides });
  assert.equal(invalidMaterialOrder.detailChecks.find((item) => item.key === key).passes, false, `${label} Fu below Fy must fail closed`);
  assert.equal(invalidMaterialOrder.passes, false, `${label} material strength order must block approval`);
}

const axialShear = calculateConnection({ ...singlePlateBase, requiredAxial: 1 });
assert.equal(axialShear.passes, false, "nonzero axial demand must block scoped Shear Tab V1");

const slotShear = calculateConnection({ ...singlePlateBase, holeType: "short_slot_perpendicular" });
assert.equal(slotShear.passes, false, "non-standard hole must block scoped Shear Tab V1");

const flexureNg = calculateConnection({ ...singlePlateBase, requiredShear: 300, plateHeight: 180, plateThickness: 6, weldEccentricity: 35 });
assert.ok(Math.abs(flexureNg.checks.find((item) => item.key === "plateFlexure").ratio - 1.021510083763827) < 1e-12, "plate eccentric flexure golden ratio");

const boltEccentricityFlexureNg = calculateConnection({
  ...singlePlateBase,
  requiredShear: 45.008108,
  eccentricity: 400,
  pitch: 60,
  plateThickness: 5,
  plateUltimateStrength: 620,
  plateHeight: 260,
  boltLineToWeldDistance: 40,
  weldEccentricity: 40,
  beamWebThickness: 5,
  beamWebUltimateStrength: 620,
  supportThickness: 5,
  supportYieldStrength: 235,
  supportUltimateStrength: 620,
  weldSize: 3.125,
  weldLength: 218.75,
  deformationConsidered: false,
});
const boltEccentricityPlateFlexure = boltEccentricityFlexureNg.checks.find((item) => item.key === "plateFlexure");
assert.ok(Math.abs(boltEccentricityPlateFlexure.available - 44.679375) < 1e-12, "plate flexure must use ep=max(eb,ew), not weld eccentricity alone");
assert.ok(boltEccentricityPlateFlexure.ratio > 1, "large bolt eccentricity must control the plate flexure screen");
assert.equal(boltEccentricityFlexureNg.passes, false, "a case that fails only after coupling plate flexure to eb must not be approved");

const weldNg = calculateConnection({
  ...singlePlateBase,
  requiredShear: 200,
  weldEccentricity: 70,
  weldSize: 6,
  weldLength: 200,
  plateThickness: 10,
  plateYieldStrength: 325,
  supportThickness: 10,
  supportYieldStrength: 325,
});
assert.ok(Math.abs(weldNg.checks.find((item) => item.key === "weldMetalEccentric").ratio - 1.2433384917281143) < 1e-12, "eccentric weld-metal golden ratio");
assert.ok(Math.abs(weldNg.checks.find((item) => item.key === "weldBaseMetalEccentric").ratio - 1.3253223190442174) < 1e-12, "unique base-metal plane golden ratio");

const geometryBoundary = calculateConnection({ ...singlePlateBase, boltLineToWeldDistance: 89.0 });
assert.equal(geometryBoundary.detailChecks.find((item) => item.key === "singlePlateConventionalWidth").passes, false, "a > 88.9 mm must fail conventional scope");

const extendedPitch = calculateConnection({ ...singlePlateBase, pitch: 180, plateHeight: 760, weldLength: 760 });
assert.equal(extendedPitch.detailChecks.find((item) => item.key === "singlePlateConventionalPitch").passes, false, "pitch above 3 in must fail the conventional procedure envelope");
assert.equal(extendedPitch.passes, false, "extended row spacing must not be approved by generic model confirmation");

const extendedHeight = calculateConnection({ ...singlePlateBase, plateHeight: 920, weldLength: 900 });
assert.equal(extendedHeight.detailChecks.find((item) => item.key === "singlePlateConventionalHeight").passes, false, "plate height above 36 in must fail the conventional procedure envelope");
assert.equal(extendedHeight.passes, false, "extended plate height must require separate plate-buckling and rotational-ductility checks");

const splice = calculateConnection(columnSpliceBase);
assert.equal(splice.passes, true, "complete bounded CJP seismic column-splice review should pass");
assert.equal(splice.complianceReady, true, "CJP seismic column-splice review should be compliance-ready within its fixed scope");
assert.equal(splice.overallStatus, "ok", "complete CJP column-splice golden case should be formal OK");
assert.equal(splice.reportTitle, "全斷面 CJP 耐震柱續接能力審查附件");
assert.equal(splice.completeJointDesign, false, "column-splice attachment must not claim a complete joint design");
assert.equal(splice.completeColumnMemberDesign, false, "column-splice attachment must not claim complete column-member design");
assert.equal(splice.asBuiltAcceptance, false, "design-stage attachment must not claim as-built acceptance");
assert.equal(splice.scopeLimited, false, "the bounded attachment should be complete within its advertised scope");
assert.deepEqual(splice.checks.map((item) => item.key), [
  "spliceAxialCompression13_4_1",
  "spliceAxialTension13_4_1",
  "spliceFullSectionNormal",
  "spliceFullSectionMajorFlexure",
  "spliceFullSectionMinorFlexure",
  "spliceFullSectionMajorShear",
  "spliceFullSectionMinorShear",
], "column-splice V1 strength routes should remain a stable report/benchmark contract");
assert.deepEqual(splice.detailChecks.map((item) => item.key), [
  "spliceLrfdMethod",
  "spliceSeismicColumn",
  "spliceCjpRoute",
  "spliceTopologyScope",
  "spliceLocation1200",
  "spliceNonJumbo",
  "spliceLoadInputs",
  "spliceTransferCap",
  "spliceMatchingFiller",
  "spliceWps",
  "spliceNdtPlan",
  "spliceEvidence",
  "spliceAsBuiltBoundary",
], "column-splice V1 hard-gate keys should remain stable");
assert.ok(Math.abs(splice.spliceReview.EampRaw - 840) < 1e-9, "13.4.1 Eamp raw golden");
assert.ok(Math.abs(splice.spliceReview.EampAdopted - 840) < 1e-9, "uncapped route should keep full amplified seismic axial term");
assert.ok(Math.abs(splice.spliceReview.compressionCombinations[0] - 20) < 1e-9 && Math.abs(splice.spliceReview.compressionCombinations[1] + 1660) < 1e-9, "compression signed combinations golden");
assert.ok(Math.abs(splice.spliceReview.tensionCombinations[0] - 300) < 1e-9 && Math.abs(splice.spliceReview.tensionCombinations[1] + 1380) < 1e-9, "tension signed combinations golden");
assert.ok(Math.abs(splice.spliceReview.PuCompression - 1660) < 1e-9, "13.4.1 controlling compression golden");
assert.ok(Math.abs(splice.spliceReview.TuTension - 300) < 1e-9, "13.4.1 controlling tension golden");
assert.equal(splice.spliceReview.normalCapacity, 9315, "full-section CJP normal capacity golden");
assert.equal(splice.spliceReview.majorFlexuralCapacity, 1552.5, "full-section CJP major flexural capacity golden");
assert.equal(splice.spliceReview.minorFlexuralCapacity, 621, "full-section CJP minor flexural capacity golden");
assert.equal(splice.spliceReview.majorShearCapacity, 1863, "full-section CJP major shear capacity golden");
assert.ok(Math.abs(splice.spliceReview.minorShearCapacity - 2235.6) < 1e-12, "full-section CJP minor shear capacity golden");
assert.ok(splice.checks.every((item) => Number.isFinite(item.ratio)), "column-splice strength DCR values should all be finite");
assert.ok(splice.checks.find((item) => item.key === "spliceAxialCompression13_4_1").equationLines.join(" ").includes("1.4 × Fu") && splice.checks.find((item) => item.key === "spliceAxialCompression13_4_1").equationLines.join(" ").includes("1660"), "report equations should expose amplified axial-force derivation");
assert.ok(splice.checks.find((item) => item.key === "spliceFullSectionMajorShear").equationLines.some((line) => line.includes("0.80 × 0.6FEXX")), "report equations should expose table 10.2-5 weld-metal shear route");

const spliceQualifiedCap = calculateConnection({
  ...columnSpliceBase,
  spliceTransferCapRoute: "qualified",
  spliceMaxTransferableAxial: 500,
  spliceAllAdjacentTransferSourcesIncludedConfirmed: true,
});
assert.equal(spliceQualifiedCap.passes, true, "qualified transfer cap with complete evidence should pass");
assert.ok(Math.abs(spliceQualifiedCap.spliceReview.EampRaw - 840) < 1e-9, "qualified cap preserves raw amplified term");
assert.equal(spliceQualifiedCap.spliceReview.EampAdopted, 625, "qualified cap should adopt 1.25Ptransfer when governing");
assert.equal(spliceQualifiedCap.spliceReview.transferCapApplied, true, "qualified governing cap should be disclosed");
assert.equal(spliceQualifiedCap.spliceReview.PuCompression, 1445, "qualified-cap compression demand golden");
assert.equal(spliceQualifiedCap.spliceReview.TuTension, 85, "qualified-cap tension demand golden");

const spliceInvalidCap = calculateConnection({
  ...columnSpliceBase,
  spliceTransferCapRoute: "qualified",
  spliceMaxTransferableAxial: 500,
  spliceAllAdjacentTransferSourcesIncludedConfirmed: false,
});
assert.equal(spliceInvalidCap.passes, false, "qualified cap without all adjacent transfer sources must fail closed");
assert.ok(Math.abs(spliceInvalidCap.spliceReview.EampAdopted - 840) < 1e-9, "invalid qualified cap must revert to the uncapped demand");
assert.equal(spliceInvalidCap.summary.validationFailure, true, "invalid qualified cap should create a blocking validation");

const spliceOverstrengthDemand = calculateConnection({ ...columnSpliceBase, spliceSeismicAxial: 5000 });
assert.equal(spliceOverstrengthDemand.passes, false, "axial demand above CJP normal capacity must fail");
assert.ok(spliceOverstrengthDemand.checks.some((item) => item.ratio > 1), "overstrength demand should fail through a numeric DCR");

const spliceWeakFiller = calculateConnection({ ...columnSpliceBase, spliceFexx: 300 });
assert.equal(spliceWeakFiller.passes, false, "weld metal weaker than the full-section base shear route must fail");
assert.equal(spliceWeakFiller.detailChecks.find((item) => item.key === "spliceMatchingFiller").passes, false, "matching-filler gate should also fail the weak weld-metal case");
assert.ok(spliceWeakFiller.checks.find((item) => item.key === "spliceFullSectionMajorShear").ratio > 1, "weak filler should fail the independent shear-capacity equality");

const spliceShortLocation = calculateConnection({ ...columnSpliceBase, spliceDistanceToNearestBeamFlange: 1199 });
assert.equal(spliceShortLocation.passes, false, "splice closer than 1200 mm to the nearest beam flange must fail");
assert.equal(spliceShortLocation.detailChecks.find((item) => item.key === "spliceLocation1200").passes, false, "location hard gate should identify the 1.2 m breach");

const splicePjp = calculateConnection({ ...columnSpliceBase, spliceFullProfileCjpConfirmed: false, spliceNoPjpConfirmed: false });
assert.equal(splicePjp.passes, false, "PJP or incomplete-profile welding must never pass the CJP attachment");
assert.equal(splicePjp.detailChecks.find((item) => item.key === "spliceCjpRoute").passes, false, "CJP route hard gate should identify PJP scope escape");

const spliceMissingNdt = calculateConnection({ ...columnSpliceBase, spliceNdtPlanEvidenceSha256: "missing" });
assert.equal(spliceMissingNdt.passes, false, "missing NDT plan evidence must fail formal approval");
assert.equal(spliceMissingNdt.detailChecks.find((item) => item.key === "spliceNdtPlan").passes, false, "NDT gate should reject a malformed evidence hash");
assert.equal(spliceMissingNdt.detailChecks.find((item) => item.key === "spliceEvidence").passes, false, "aggregate evidence gate should also reject malformed NDT evidence");

const spliceJumbo = calculateConnection({ ...columnSpliceBase, spliceMaxThickness: 41 });
assert.equal(spliceJumbo.passes, false, "rolled H section above the V1 40 mm jumbo boundary must fail");
assert.equal(spliceJumbo.detailChecks.find((item) => item.key === "spliceNonJumbo").passes, false, "jumbo-section hard gate should identify the excluded route");

const spliceInvalidFinite = calculateConnection({ ...columnSpliceBase, spliceDeadAxial: "not-a-number" });
assert.equal(spliceInvalidFinite.passes, false, "non-finite source demand must fail despite normalization to zero");
assert.equal(spliceInvalidFinite.summary.validationFailure, true, "non-finite source demand should be a blocking validation");

const spliceZeroSeismicAxial = calculateConnection({ ...columnSpliceBase, spliceSeismicAxial: 0 });
assert.equal(spliceZeroSeismicAxial.passes, true, "a controlled analysis result with PE = 0 should remain a valid 13.4.1 envelope");
assert.equal(spliceZeroSeismicAxial.spliceReview.EampRaw, 0, "PE = 0 should produce a finite zero amplified seismic term");
assert.equal(spliceZeroSeismicAxial.spliceReview.EampAdopted, 0, "uncapped PE = 0 should keep a finite zero adopted term");

const spliceAsd = calculateConnection({ ...columnSpliceBase, designMethod: "ASD" });
assert.equal(spliceAsd.passes, false, "ASD must fail the LRFD-only column-splice attachment");
assert.equal(spliceAsd.detailChecks.find((item) => item.key === "spliceLrfdMethod").passes, false, "LRFD hard gate should identify ASD scope escape");

const legacySplice = calculateConnection({
  ...shared,
  connectionType: "column_splice",
  requiredAxial: 850,
  requiredShear: 180,
  requiredMoment: 120,
  spliceLeverArm: 420,
  flangeBoltCount: 8,
  webBoltCount: 8,
  spliceWeldSize: 10,
});
assert.equal(legacySplice.passes, false, "legacy Mu/h plus flange/web splice-plate fields must not unlock the formal CJP route");
assert.equal(legacySplice.summary.validationFailure, true, "legacy splice payload should fail blocking finite/section validations");

const gusset = calculateConnection(gussetBase);
assert.equal(gusset.passes, true, "complete Gusset V1 golden case should pass its formal scope");
assert.equal(gusset.complianceReady, true, "Gusset V1 should be marked compliance-ready");
assert.equal(gusset.checks.length, 13, "Gusset V1 should expose all thirteen required strength routes");
assert.deepEqual(gusset.checks.map((item) => item.key), [
  "gussetBoltShear", "gussetBoltBearing", "braceBoltBearing", "gussetGrossYield", "gussetNetRupture", "gussetBlockShear",
  "braceGrossYield", "braceNetRupture", "braceBlockShear", "gussetWhitmoreYield", "gussetWeldMetal", "gussetWeldBaseGusset", "gussetWeldBaseSupport",
], "Gusset V1 strength keys should remain a stable report/benchmark contract");
assert.equal(gusset.derivedAreas.gussetGrossArea, 2520, "Gusset gross area golden");
assert.equal(gusset.derivedAreas.gussetNetArea, 2191, "Gusset net area golden");
assert.equal(gusset.derivedAreas.gussetEffectiveNetArea, 2142, "bolted Gusset effective net area should use min(An, 0.85Ag)");
assert.equal(gusset.derivedAreas.braceGrossArea, 1920, "brace gross area golden");
assert.equal(gusset.derivedAreas.braceNetArea, 1638, "brace net area golden");
assert.equal(gusset.derivedAreas.gussetBlockAgv, 5600, "Gusset single-line L-path block-shear Agv golden");
assert.equal(gusset.derivedAreas.gussetBlockAnv, 3829, "Gusset single-line L-path block-shear Anv golden");
assert.equal(gusset.derivedAreas.gussetBlockAgt, 840, "Gusset block-shear Agt golden");
assert.equal(gusset.derivedAreas.gussetBlockAnt, 679, "Gusset block-shear Ant golden");
assert.equal(gusset.derivedAreas.braceBlockAgv, 4800, "brace single-line L-path block-shear Agv golden");
assert.equal(gusset.derivedAreas.braceBlockAnv, 3282, "brace single-line L-path block-shear Anv golden");
assert.equal(gusset.derivedAreas.braceBlockAgt, 720, "brace block-shear Agt golden");
assert.equal(gusset.derivedAreas.braceBlockAnt, 582, "brace block-shear Ant golden");
assert.ok(Math.abs(gusset.derivedAreas.gussetWhitmoreTheoreticalWidth - 404.145188432738) < 1e-12, "single-line Whitmore theoretical width should start at zero and use 2Lconn tan30 degrees");
assert.equal(gusset.derivedAreas.gussetWhitmoreEffectiveWidth, 400, "Whitmore effective width should be capped by available plate width");
assert.equal(gusset.derivedAreas.gussetWhitmoreArea, 5600, "Whitmore effective area golden");
assert.ok(Math.abs(gusset.checks.find((item) => item.key === "gussetWhitmoreYield").available - 1638) < 1e-9, "Whitmore yielding capacity golden");
assert.ok(Math.abs(gusset.checks.find((item) => item.key === "gussetBoltShear").nominal - 739.4039903118323) < 1e-9, "F10T included-thread table 10.3-2 nominal bolt shear golden");
assert.ok(Math.abs(gusset.checks.find((item) => item.key === "gussetBoltShear").available - 554.5529927338742) < 1e-9, "F10T included-thread table 10.3-2 LRFD bolt shear golden");
assert.ok(gusset.checks.find((item) => item.key === "gussetBoltShear").equationLines.some((line) => line.includes("4.00 tf/cm²") && line.includes("392.266 MPa")), "Gusset report equations should expose the adopted table 10.3-2 stress");
assert.ok(Math.abs(gusset.checks.find((item) => item.key === "gussetNetRupture").available - 787.185) < 1e-9, "Gusset effective-net rupture should use Ae=min(An,0.85Ag)");
assert.ok(Math.abs(gusset.checks.find((item) => item.key === "gussetBlockShear").available - 1049.0445) < 1e-9, "Gusset single-line L-path block-shear capacity golden");
assert.ok(Math.abs(gusset.checks.find((item) => item.key === "braceBlockShear").available - 899.181) < 1e-9, "brace single-line L-path block-shear capacity golden");
assert.ok(Math.abs(gusset.checks.find((item) => item.key === "gussetWeldMetal").available - 623.574) < 1e-9, "weld metal capacity golden");
assert.ok(Math.abs(gusset.checks.find((item) => item.key === "gussetWeldBaseGusset").available - 1228.5) < 1e-9, "Gusset base-metal weld-line capacity golden");
assert.ok(Math.abs(gusset.checks.find((item) => item.key === "gussetWeldBaseSupport").available - 1404) < 1e-9, "support base-metal weld-line capacity golden");
assert.equal(gusset.detailChecks.find((item) => item.key === "gussetWhitmoreConnectionLength")?.passes, true, "golden Lconn should equal (n-1) times pitch");
assert.equal(gusset.detailChecks.find((item) => item.key === "gussetFlatPlateBrace")?.passes, true, "golden brace should be a directly connected flat plate with Ae=An");
assert.ok(gusset.assumptions.some((item) => item.includes("fastener-group 起始寬度取 0") && item.includes("bW = 2Lconn tan30°")), "report assumptions should lock the zero-start Whitmore formula");
assert.ok(gusset.assumptions.some((item) => item.includes("U = 1.0、Ae = An") && item.includes("angle、WT、HSS")), "report assumptions should lock the flat-plate brace and shear-lag boundary");
const gussetThreadsExcluded = calculateConnection({ ...gussetBase, threadsCondition: "excluded" });
assert.ok(Math.abs(gussetThreadsExcluded.checks.find((item) => item.key === "gussetBoltShear").available - 693.1912409173427) < 1e-9, "F10T excluded-thread table 10.3-2 LRFD bolt shear golden");
assert.ok(gussetThreadsExcluded.checks.find((item) => item.key === "gussetBoltShear").equationLines.some((line) => line.includes("5.00 tf/cm²") && line.includes("490.333 MPa")), "excluded-thread Gusset report should expose the 5.00 tf/cm² table value");

const moment = calculateConnection(momentBase);
assert.equal(moment.complianceReady, true, "beam-column moment V1 should now be a formal scoped module");
assert.equal(moment.passes, true, "complete reinforced moment connection review should pass");
assert.equal(moment.reportTitle, "梁柱彎矩接頭耐震能力審查附件");
assert.equal(moment.completeJointDesign, false, "formal attachment should still disclose incomplete joint design boundary");
assert.equal(moment.scopeLimited, false, "boundary disclosure should not auto-lock the formal moment module");
assert.ok(Math.abs(moment.seismicReview.Mp - 700) < 1e-12, "Mp = Zb*Fyb/1e6 golden");
assert.ok(Math.abs(moment.seismicReview.Mpr - 770) < 1e-12, "Mpr = beta*Mp golden");
assert.ok(Math.abs(moment.seismicReview.MprFar - 770) < 1e-12, "Mpr,far demand-model input should be exposed in seismic review");
assert.ok(Math.abs(moment.seismicReview.Vp - 440) < 1e-12, "Vp = (Mpr+Mpr,far)*1000/Lh golden");
assert.ok(Math.abs(moment.seismicReview.MuFace - 902) < 1e-12, "Mu_face = Mpr + Vp*x/1000 golden");
assert.ok(Math.abs(moment.seismicReview.VuRequired - 560) < 1e-12, "Vu_req = min(abs(Vgravity)+Vp, abs(Vamplified)) golden");
assert.ok(Math.abs(moment.seismicReview.rotationDemand - 0.03) < 1e-12, "default SMRF plastic rotation demand should be 0.03 rad");
assert.ok(Math.abs(moment.seismicReview.VpzMin - 2200) < 1e-12, "Vpz_min = sumMp*1000/hpz golden");
assert.ok(Math.abs(moment.seismicReview.VpzRequired - 2200) < 1e-12, "Vpz_req = max(analysis, min) golden");
assert.ok(Math.abs(moment.seismicReview.VpzNominal - 2340) < 1e-12, "Vpz_n = 0.6*Fyc*dc*tp/1000 golden");
assert.ok(Math.abs(moment.seismicReview.panelThicknessRequired - 10) < 1e-12, "tz_req = (dz+wz)/90 golden");
assert.ok(Math.abs(moment.seismicReview.continuityThreshold - 2520) < 1e-12, "continuity threshold golden");
assert.ok(Math.abs(moment.seismicReview.scwbCw - (2300 / 1670)) < 1e-12, "CW SCWB ratio golden");
assert.ok(Math.abs(moment.seismicReview.scwbCcw - (2340 / 1675)) < 1e-12, "CCW SCWB ratio golden");
assert.equal(moment.checks.find((item) => item.key === "momentFlexuralStrength")?.unit, "kN-m", "moment flexural check should expose units");
assert.equal(moment.checks.find((item) => item.key === "momentPlasticRotation")?.unit, "rad", "plastic rotation check should expose units");
assert.ok(moment.checks.find((item) => item.key === "momentStrongColumnCw")?.equationLines.join(" ").includes("ZbFyb + Vp x"), "reinforced SCWB beam terms should explicitly include Vp x");
assert.ok(moment.assumptions.some((item) => item.includes("單一選定方向")), "assumptions should disclose single-axis formal attachment scope");
assert.ok(moment.assumptions.some((item) => item.includes("Mpr,far") && item.includes("需求/構架模型")), "assumptions should disclose that the far-end expected moment comes from demand or frame modeling");
assert.ok(moment.assumptions.some((item) => item.includes("AISC 358 family / prequalification")), "assumptions should disclose excluded prequalification scope");
assert.ok(moment.references.some((item) => item.includes("13.6.1~13.6.5")), "moment references should cite the seismic connection clauses");
assert.equal(moment.checks.find((item) => item.key === "momentStrongColumnCw")?.codeRef, "規範判定｜13.6.5", "SCWB code ref should align with 13.6.5");
assert.equal(moment.checks.find((item) => item.key === "momentPlasticRotation")?.equationRef, "13.6.1＋專案指定需求法", "SMRF rotation equation ref should point to 13.6.1");

const momentPanelZoneFail = calculateConnection({ ...momentBase, momentPanelZoneThickness: 12 });
assert.equal(momentPanelZoneFail.passes, false, "insufficient panel zone shear strength should fail");
assert.equal(momentPanelZoneFail.summary.strengthFailure, true, "panel zone understrength should be a strength failure");
assert.ok(momentPanelZoneFail.checks.find((item) => item.key === "momentPanelZoneShear")?.ratio > 1, "panel zone ratio should exceed 1.0 when understrength");

const momentRotationFail = calculateConnection({ ...momentBase, momentQualifiedPlasticRotation: 0.02 });
assert.equal(momentRotationFail.passes, false, "insufficient qualified plastic rotation should fail");
assert.equal(momentRotationFail.summary.strengthFailure, true, "rotation shortfall should be a strength failure");
assert.ok(momentRotationFail.checks.find((item) => item.key === "momentPlasticRotation")?.ratio > 1, "rotation demand/capacity ratio should exceed 1.0 when underqualified");

const momentQualificationSimilarityFail = calculateConnection({ ...momentBase, momentDesignBeamFlangeThickness: 23 });
assert.equal(momentQualificationSimilarityFail.passes, false, "qualification similarity thickness overrun should fail");
assert.equal(momentQualificationSimilarityFail.summary.detailFailure, true, "qualification similarity thickness overrun should be a detail failure");
assert.equal(momentQualificationSimilarityFail.detailChecks.find((item) => item.key === "momentQualificationThicknessSimilarity")?.passes, false, "qualification similarity failure should be exposed explicitly");

const momentDirectTestCountFail = calculateConnection({
  ...momentBase,
  momentQualificationRoute: "direct_test",
  momentQualificationTestCount: 1,
  momentDesignBeamFlangeThickness: 60,
});
assert.equal(momentDirectTestCountFail.passes, false, "direct-test route should fail when fewer than two specimens are provided");
assert.equal(momentDirectTestCountFail.detailChecks.find((item) => item.key === "momentQualificationTestCount")?.passes, false, "direct-test specimen count gate should reject fewer than two specimens");
assert.equal(momentDirectTestCountFail.detailChecks.find((item) => item.key === "momentQualificationThicknessSimilarity")?.passes, true, "direct-test route should not be blocked by the 45 mm thickness cap");

const momentPriorTestCountNonBlocking = calculateConnection({
  ...momentBase,
  momentQualificationRoute: "prior_test_similarity",
  momentQualificationTestCount: 1,
});
assert.equal(momentPriorTestCountNonBlocking.passes, true, "prior-test route should not hard-fail solely due to specimen count");
assert.equal(momentPriorTestCountNonBlocking.detailChecks.find((item) => item.key === "momentQualificationTestCount")?.passes, true, "prior-test route should treat specimen count as non-blocking in the current contract");

const momentThirdPartyThicknessFail = calculateConnection({
  ...momentBase,
  momentQualificationRoute: "third_party_review",
  momentDesignBeamFlangeThickness: 46,
});
assert.equal(momentThirdPartyThicknessFail.passes, false, "third-party review route should fail above the 45 mm thickness cap");
assert.equal(momentThirdPartyThicknessFail.detailChecks.find((item) => item.key === "momentQualificationThicknessSimilarity")?.passes, false, "third-party thickness cap should be enforced directly");

const momentBetaFail = calculateConnection({ ...momentBase, momentExpectedStrengthFactor: 0.95 });
assert.equal(momentBetaFail.passes, false, "beta below 1.0 should fail");
assert.equal(momentBetaFail.detailChecks.find((item) => item.key === "momentExpectedStrengthFactor")?.passes, false, "beta gate should reject values below 1.0");

const momentFarMomentZero = calculateConnection({ ...momentBase, momentFarCriticalSectionExpectedMoment: 0 });
assert.equal(momentFarMomentZero.passes, true, "zero far-end expected moment should still be allowed");
assert.ok(Math.abs(momentFarMomentZero.seismicReview.Vp - 220) < 1e-12, "Vp should remain positive from the near-end Mpr when Mpr,far is zero");

const momentExteriorJointZeroMember = calculateConnection({
  ...momentBase,
  momentCwRightBeamMoment: 0,
  momentCcwRightBeamMoment: 0,
});
assert.equal(momentExteriorJointZeroMember.passes, true, "an absent exterior-joint beam may be represented by a zero member term when each directional SCWB sum remains positive");

const momentFarMomentNegativeInvalid = calculateConnection({ ...momentBase, momentFarCriticalSectionExpectedMoment: -10 });
assert.equal(momentFarMomentNegativeInvalid.passes, false, "negative far-end expected moment should fail visibly after normalization");
assert.equal(momentFarMomentNegativeInvalid.summary.validationFailure, true, "negative far-end expected moment should be a blocking validation failure");
assert.equal(momentFarMomentNegativeInvalid.detailChecks.find((item) => item.key === "momentFarCriticalSectionExpectedMoment")?.passes, false, "negative far-end input should fail the explicit demand-model gate");
assert.ok(momentFarMomentNegativeInvalid.validations.some((item) => item.includes("Mpr,far")), "negative far-end expected moment should produce a visible validation message");

const momentFarMomentNaNInvalid = calculateConnection({ ...momentBase, momentFarCriticalSectionExpectedMoment: "not-a-number" });
assert.equal(momentFarMomentNaNInvalid.passes, false, "non-finite far-end expected moment should fail visibly after normalization");
assert.equal(momentFarMomentNaNInvalid.summary.validationFailure, true, "non-finite far-end expected moment should be a blocking validation failure");
assert.equal(momentFarMomentNaNInvalid.detailChecks.find((item) => item.key === "momentFarCriticalSectionExpectedMoment")?.passes, false, "non-finite far-end input should fail the explicit demand-model gate");

const momentScwbFail = calculateConnection({
  ...momentBase,
  momentCwUpperColumnMoment: 400,
  momentCwLowerColumnMoment: 400,
  momentCcwUpperColumnMoment: 420,
  momentCcwLowerColumnMoment: 420,
});
assert.equal(momentScwbFail.passes, false, "SCWB ratio below 1.25 should fail");
assert.equal(momentScwbFail.summary.strengthFailure, true, "SCWB shortfall should be a strength failure");
assert.ok(momentScwbFail.checks.find((item) => item.key === "momentStrongColumnCw")?.ratio > 1, "CW ratio should exceed 1.0 when SCWB is insufficient");
assert.ok(momentScwbFail.checks.find((item) => item.key === "momentStrongColumnCcw")?.ratio > 1, "CCW ratio should exceed 1.0 when SCWB is insufficient");

const momentImrf = calculateConnection({
  ...momentBase,
  momentFrameSystem: "imrf",
  momentRotationDemandMethod: "default",
});
assert.equal(momentImrf.checks.find((item) => item.key === "momentPlasticRotation")?.equationRef, "13.7.2＋專案指定需求法", "IMRF rotation equation ref should point to 13.7.2");
assert.ok(momentImrf.references.some((item) => item.includes("13.7.2 IMRF")), "IMRF references should include the IMRF connection clause");
assert.ok(momentImrf.checks.find((item) => item.key === "momentStrongColumnCw")?.note.includes("專案額外採用"), "IMRF SCWB note should disclose the extra-project adoption");
assert.ok(momentImrf.checks.find((item) => item.key === "momentStrongColumnCw")?.codeRef.includes("專案指定｜IMRF"), "IMRF SCWB should not be mislabeled as a direct 13.6.5 code requirement");

const momentInvalid = calculateConnection({ ...momentBase, momentBeamPlasticModulus: 0 });
assert.equal(momentInvalid.passes, false, "zero/non-finite seismic review inputs should fail closed");
assert.equal(momentInvalid.summary.validationFailure, true, "zero/non-finite seismic review inputs should be a blocking validation failure");
assert.ok(momentInvalid.validations.some((item) => item.includes("有限正值")), "invalid moment inputs should remain visibly blocked by finite positive validation");

const plateGeometry = calculateConnection({
  ...shared,
  connectionType: "plate_check",
  requiredTension: 620,
  plateInputMode: "geometry",
  loadDirection: "horizontal",
  plateWidth: 320,
  plateLength: 420,
  plateThickness: 16,
  plateYieldStrength: 325,
  plateUltimateStrength: 490,
  rowCount: 3,
  lineCount: 3,
  pitchX: 70,
  pitchY: 70,
  endDistanceStart: 55,
  endDistanceEnd: 65,
  edgeDistanceTop: 65,
  edgeDistanceBottom: 65,
  netSectionMode: "straight_only",
  blockShearMode: "auto_with_override",
  useManualBlockShearPath: "false",
  showPlateSketch: "true",
});
assert.equal(plateGeometry.passes, true, "plate geometry example should pass");
assert.equal(plateGeometry.reportTitle, "連接板檢核計算書");
assert.ok(plateGeometry.derivedAreas.Ag > plateGeometry.derivedAreas.An, "plate geometry should derive Ag and An");
assert.ok(plateGeometry.derivedAreas.Ae <= plateGeometry.derivedAreas.Ag, "plate geometry should derive Ae within Ag");
assert.equal(plateGeometry.complianceReady, true, "plate geometry should be marked as compliance-ready");

const plateGeometryScope = calculateConnection({
  ...shared,
  connectionType: "plate_check",
  requiredTension: 220,
  plateInputMode: "geometry",
  loadDirection: "horizontal",
  plateWidth: 220,
  plateLength: 260,
  plateThickness: 12,
  plateYieldStrength: 325,
  plateUltimateStrength: 490,
  rowCount: 3,
  lineCount: 4,
  pitchX: 20,
  pitchY: 60,
  endDistanceStart: 45,
  endDistanceEnd: 45,
  edgeDistanceTop: 40,
  edgeDistanceBottom: 40,
  netSectionMode: "straight_only",
  blockShearMode: "auto_with_override",
  useManualBlockShearPath: "false",
});
assert.equal(plateGeometryScope.pathSummary.netSection.includes("直線"), true, "plate geometry should now disclose straight net-section scope");

const plateManualBlock = calculateConnection({
  ...shared,
  connectionType: "plate_check",
  requiredTension: 300,
  plateInputMode: "geometry",
  loadDirection: "vertical",
  plateWidth: 280,
  plateLength: 360,
  plateThickness: 14,
  plateYieldStrength: 325,
  plateUltimateStrength: 490,
  rowCount: 3,
  lineCount: 2,
  pitchX: 70,
  pitchY: 70,
  endDistanceStart: 40,
  endDistanceEnd: 40,
  edgeDistanceTop: 40,
  edgeDistanceBottom: 40,
  useManualBlockShearPath: "true",
  manualAgv: 6800,
  manualAnv: 5400,
  manualAgt: 3920,
  manualAnt: 3080,
});
assert.equal(plateManualBlock.passes, true, "manual block shear override should pass when areas are supplied");
assert.equal(plateManualBlock.pathSummary.blockShear.includes("手動"), true, "manual block shear should be disclosed");

const plateAreaManual = calculateConnection({
  ...shared,
  connectionType: "plate_check",
  requiredTension: 450,
  plateInputMode: "area_manual",
  plateThickness: 16,
  plateYieldStrength: 325,
  plateUltimateStrength: 490,
  grossArea: 6720,
  netArea: 4992,
  Agv: 5760,
  Anv: 4608,
  Agt: 6720,
  Ant: 4992,
});
assert.equal(plateAreaManual.passes, true, "manual area input should pass with complete areas");
assert.equal(plateAreaManual.sketchData.mode, "manual_area", "manual area mode should switch sketch mode");

const detailFail = calculateConnection({
  ...gussetBase,
  gussetEndDistance: 20,
  gussetPitch: 50,
  gussetEdgeDistance: 20,
  braceEndDistance: 20,
  braceEdgeDistance: 20,
});
assert.equal(detailFail.passes, false, "undersized gusset geometry should fail");
assert.ok(detailFail.detailChecks.some((item) => !item.passes), "detail checks should catch tight spacing/edge distance");

const gussetScopeFailures = [
  ["positive tension", { requiredAxial: -400 }, "gussetPositiveTension"],
  ["zero shear", { requiredShear: 1 }, "gussetZeroShear"],
  ["zero moment", { requiredMoment: 1 }, "gussetZeroMoment"],
  ["concentricity", { eccentricity: 1 }, "gussetConcentric"],
  ["negative eccentricity", { eccentricity: -1 }, "gussetConcentric"],
  ["LRFD", { designMethod: "ASD" }, "gussetMethod"],
  ["F10T", { boltGrade: "A325" }, "gussetBoltGrade"],
  ["standard hole", { holeType: "oversized" }, "gussetStandardHole"],
  ["standard-hole maximum", { holeDiameter: 22 }, "gussetStandardHoleMaximum"],
  ["single shear", { gussetShearPlanes: 2 }, "gussetSingleShear"],
  ["2-12 bolt line", { gussetBoltCount: 13 }, "gussetBoltCount"],
  ["integer bolt count", { gussetBoltCount: 6.5 }, "gussetBoltCount"],
  ["Gusset Fu >= Fy", { gussetUltimateStrength: 300 }, "gussetMaterialOrder"],
  ["brace Fu >= Fy", { braceFu: 300 }, "braceMaterialOrder"],
  ["support Fu >= Fy", { supportFu: 300 }, "gussetSupportMaterialOrder"],
  ["Gusset net geometry", { gussetNetWidth: 180 }, "gussetNetGeometry"],
  ["brace net geometry", { braceNetWidth: 160 }, "braceNetGeometry"],
  ["available Whitmore width", { gussetAvailableWidth: 0 }, "gussetAvailableWidth"],
  ["zero Whitmore connection length", { gussetWhitmoreConnectionLength: 0 }, "gussetWhitmoreConnectionLength"],
  ["mismatched Whitmore connection length", { gussetWhitmoreConnectionLength: 349 }, "gussetWhitmoreConnectionLength"],
  ["long bearing connection", { gussetPitch: 250.2, gussetWhitmoreConnectionLength: 1251 }, "gussetBearingConnectionLength"],
  ["flat-plate brace scope", { braceSectionType: "angle" }, "gussetFlatPlateBrace"],
  ["finite-result overflow", { gussetThickness: Number.MAX_VALUE }, "gussetFiniteDerivedResults"],
  ["demand basis", { gussetDemandBasis: "請依專案覆寫" }, "gussetDemandBasis"],
  ["geometry basis", { gussetGeometryBasis: "" }, "gussetGeometryBasis"],
  ["material basis", { gussetMaterialBasis: "示例" }, "gussetMaterialBasis"],
  ["model basis", { gussetModelBasis: "待補" }, "gussetModelBasis"],
  ["static nonseismic confirmation", { gussetStaticNonseismicConfirmed: false }, "gussetStaticNonseismicConfirmed"],
  ["load-path confirmation", { gussetLoadPathConfirmed: false }, "gussetLoadPathConfirmed"],
  ["double fillet weld", { weldLineCount: 1 }, "gussetDoubleFilletWeld"],
  ["integer weld topology", { weldLineCount: 2.4 }, "gussetDoubleFilletWeld"],
  ["minimum weld", { weldSize: 4 }, "gussetMinWeldSize"],
  ["maximum weld", { weldSize: 14 }, "gussetMaxWeldSize"],
  ["short weld", { weldLength: 31 }, "gussetShortWeld"],
  ["long weld", { weldLength: 561 }, "gussetLongWeld"],
];
for (const [label, mutation, detailKey] of gussetScopeFailures) {
  const failed = calculateConnection({ ...gussetBase, ...mutation });
  assert.equal(failed.passes, false, `Gusset V1 should fail closed for ${label}`);
  assert.equal(failed.detailChecks.find((item) => item.key === detailKey)?.passes, false, `${detailKey} should expose the rejection`);
  assert.equal(failed.summary.validationFailure, true, `${label} should be a blocking Gusset validation failure`);
}
const gussetOverflow = calculateConnection({ ...gussetBase, gussetThickness: Number.MAX_VALUE });
assert.equal(gussetOverflow.detailChecks.find((item) => item.key === "gussetFiniteStrengthResults")?.passes, false, "overflowed Gusset strength results should fail closed");
assert.ok(gussetOverflow.validations.some((item) => item.includes("數值溢位")), "overflow should remain a blocking, visible validation instead of becoming DCR zero");
assert.equal(gussetOverflow.summary.strengthFailure, true, "overflowed capacity should be a strength failure, not only a detail failure");
assert.equal(gussetOverflow.checks.find((item) => item.key === "gussetGrossYield")?.ratio, Infinity, "overflowed capacity should retain a non-finite DCR that the reading layer renders as an em dash");

const plateInvalid = calculateConnection({
  ...shared,
  connectionType: "plate_check",
  requiredTension: 200,
  plateInputMode: "area_manual",
  plateThickness: 16,
  plateYieldStrength: 325,
  plateUltimateStrength: 490,
  grossArea: 3000,
  netArea: 3500,
  Agv: 0,
  Anv: 0,
  Agt: 0,
  Ant: 0,
});
assert.equal(plateInvalid.passes, false, "invalid manual areas should fail");
assert.ok(plateInvalid.validations.length > 0 || plateInvalid.detailChecks.some((item) => !item.passes), "invalid manual areas should be flagged");

const tensionBolted = calculateConnection({
  ...shared,
  connectionType: "tension_member",
  requiredTension: 620,
  tensionConnectionMode: "bolted",
  tensionSectionType: "connection_plate",
  tensionAreaInput: "geometry",
  memberYieldStrength: 325,
  memberUltimateStrength: 490,
  memberWidth: 220,
  memberThickness: 16,
  unsupportedLength: 3600,
  radiusOfGyration: 22,
  tensionShearLagCase: "connection_plate_cap",
  tensionBoltLineCount: 3,
  tensionBoltRowCount: 2,
  tensionShearPlanes: 2,
  tensionEndDistance: 55,
  tensionPitchLongitudinal: 80,
  tensionGaugeTransverse: 70,
  tensionEdgeDistanceNear: 40,
  tensionEdgeDistanceFar: 40,
  tensionUseManualBlockAreas: "false",
});
assert.equal(tensionBolted.passes, true, "bolted tension member example should pass");
assert.equal(tensionBolted.reportTitle, "拉力構件檢核計算書");
assert.ok(tensionBolted.derivedAreas.Ae <= tensionBolted.derivedAreas.Ag, "Ae should not exceed Ag");
assert.equal(tensionBolted.complianceReady, true, "tension member should be marked as compliance-ready");
assert.equal(tensionBolted.sketchData.mode, "geometry", "bolted tension member should provide geometry sketch data");
assert.equal(tensionBolted.sketchData.connectionMode, "bolted", "bolted tension sketch should identify bolt mode");
assert.ok(tensionBolted.sketchData.holes.length > 0, "bolted tension sketch should include hole positions");

const tensionWelded = calculateConnection({
  ...shared,
  connectionType: "tension_member",
  requiredTension: 420,
  tensionConnectionMode: "welded",
  tensionSectionType: "general_shape",
  tensionAreaInput: "geometry",
  memberYieldStrength: 325,
  memberUltimateStrength: 490,
  memberWidth: 180,
  memberThickness: 14,
  unsupportedLength: 3000,
  radiusOfGyration: 18,
  tensionWeldCase: "plate_longitudinal_both_sides",
  tensionWeldType: "fillet",
  tensionWeldSize: 10,
  tensionWeldLengthLongitudinal: 360,
  tensionWeldLengthTransverse: 0,
  tensionWeldLineCount: 2,
  tensionWeldElectrodeStrength: 490,
  tensionConnectedThickness: 14,
  tensionLapLength: 140,
  tensionWeldMatchingFiller: "true",
});
assert.equal(tensionWelded.passes, true, "welded tension member example should pass");
assert.ok(tensionWelded.checks.some((item) => item.label.includes("銲接")), "welded tension member should include weld check");
assert.equal(tensionWelded.sketchData.mode, "geometry", "welded tension member should provide geometry sketch data");
assert.equal(tensionWelded.sketchData.connectionMode, "welded", "welded tension sketch should identify weld mode");
assert.ok(tensionWelded.sketchData.weldSegments.length > 0, "welded tension sketch should include weld segments");

const tensionCjp = calculateConnection({
  ...shared,
  connectionType: "tension_member",
  requiredTension: 480,
  tensionConnectionMode: "welded",
  tensionSectionType: "general_shape",
  tensionAreaInput: "geometry",
  memberYieldStrength: 325,
  memberUltimateStrength: 490,
  memberWidth: 180,
  memberThickness: 16,
  unsupportedLength: 3000,
  radiusOfGyration: 20,
  tensionWeldCase: "transverse_direct",
  tensionWeldType: "groove_cjp",
  tensionWeldLengthLongitudinal: 0,
  tensionWeldLengthTransverse: 180,
  tensionWeldLineCount: 1,
  tensionWeldElectrodeStrength: 490,
  tensionConnectedThickness: 16,
  tensionDirectConnectedArea: 2880,
  tensionWeldMatchingFiller: "true",
});
assert.equal(tensionCjp.passes, true, "CJP welded tension member example should pass");
assert.ok(tensionCjp.checks.some((item) => item.label.includes("全滲透")), "CJP example should use groove-weld check");

const tensionManual = calculateConnection({
  ...shared,
  connectionType: "tension_member",
  requiredTension: 540,
  tensionConnectionMode: "bolted",
  tensionSectionType: "general_shape",
  tensionAreaInput: "manual",
  memberYieldStrength: 325,
  memberUltimateStrength: 490,
  unsupportedLength: 3600,
  radiusOfGyration: 22,
  tensionShearLagCase: "manual_u",
  tensionShearLagFactor: 0.82,
  tensionGrossArea: 3520,
  tensionNetArea: 2752,
  tensionEffectiveNetArea: 2256.64,
  tensionAgv: 6080,
  tensionAnv: 4776,
  tensionAgt: 3520,
  tensionAnt: 2752,
});
assert.equal(tensionManual.sketchData.mode, "manual_area", "manual tension area mode should switch to text sketch state");

console.log("calculator.smoke-test.js passed");
