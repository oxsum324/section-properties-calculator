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

const splice = calculateConnection({
  ...shared,
  connectionType: "column_splice",
  requiredAxial: 850,
  requiredShear: 180,
  requiredMoment: 120,
  spliceLeverArm: 420,
  spliceBearingTransfer: "true",
  flangeBoltCount: 8,
  flangeEndDistance: 55,
  flangePitch: 90,
  flangeEdgeDistance: 70,
  flangePlateThickness: 20,
  flangePlateWidth: 240,
  flangePlateNetWidth: 180,
  flangePlateYieldStrength: 325,
  flangePlateUltimateStrength: 490,
  webBoltCount: 8,
  webShearPlanes: 2,
  webEndDistance: 50,
  webPitch: 80,
  webEdgeDistance: 60,
  webPlateDepth: 420,
  webPlateThickness: 14,
  webPlateYieldStrength: 325,
  webPlateUltimateStrength: 490,
  spliceWeldSize: 10,
  spliceWeldLength: 320,
  spliceWeldLineCount: 2,
  spliceWeldElectrodeStrength: 490,
});
assert.equal(splice.passes, false, "column splice example should be blocked from formal code check");
assert.equal(splice.complianceReady, false, "column splice should be marked as non-compliance-ready");
assert.equal(splice.reportTitle, "柱續接檢核計算書");

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

const moment = calculateConnection({
  ...shared,
  connectionType: "beam_column_moment",
  requiredShear: 160,
  requiredMoment: 420,
  momentLeverArm: 550,
  momentBoltCount: 8,
  momentEndDistance: 55,
  momentPitch: 90,
  momentEdgeDistance: 85,
  momentPlateThickness: 28,
  momentPlateWidth: 320,
  momentPlateNetWidth: 240,
  momentPlateYieldStrength: 325,
  momentPlateUltimateStrength: 490,
  momentShearBoltCount: 4,
  momentShearPlanes: 1,
  momentShearPlateThickness: 16,
  momentShearPlateUltimateStrength: 490,
  panelZoneCapacity: 980,
  momentWeldSize: 10,
  momentWeldLength: 280,
  momentWeldLineCount: 2,
  momentWeldElectrodeStrength: 490,
});
assert.equal(moment.passes, false, "moment example should be blocked from formal code check");
assert.equal(moment.complianceReady, false, "moment example should be marked as non-compliance-ready");
assert.ok(moment.checks.some((item) => item.label.includes("Panel Zone")), "moment connection should include panel zone check");

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
