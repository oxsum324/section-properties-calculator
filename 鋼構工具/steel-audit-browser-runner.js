const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const {
  resolveEvidenceDir,
  renderAndValidateReportPdf,
  validatePdfFile,
  writeEvidenceSummary,
} = require('../結構工具箱/tools/rendered-delivery-evidence');
const AttachmentPackageChecker = require('../結構工具箱/tools/attachment-package-check');
const CALCULATION_BOOK_CONTENT_BOUNDARY = require('../結構工具箱/tools/calculation-book-content-boundary.json');
const { buildSteelResultReconciliation } = require('./steel-result-reconciliation');

const args = parseArgs(process.argv.slice(2));
const baseUrl = String(args['base-url'] || 'http://127.0.0.1:8123').replace(/\/$/, '');
const outputDir = path.resolve(String(args['output-dir'] || path.join(__dirname, 'output', 'audit')));
const historyDir = path.resolve(String(args['history-dir'] || outputDir));
const summaryJson = path.resolve(String(args['summary-json'] || path.join(historyDir, 'steel-browser-runner-summary.json')));
const quiet = Boolean(args.quiet);
const scenarioTimeoutMs = Number(args['scenario-timeout-ms'] || 90000);
const repoRoot = path.resolve(__dirname, '..');
const renderedEvidenceDir = resolveEvidenceDir(repoRoot, 'steel-formal');
const renderedEvidenceRecords = [];
const textExportEvidenceRecords = [];
const ngSourceEvidenceRecords = [];
const directPrintOutputDir = path.resolve(String(
  args['direct-print-output-dir']
    || path.join(repoRoot, 'output', 'playwright', 'steel-formal-direct-print-block')
));
const directPrintSummaryJson = path.join(directPrintOutputDir, 'steel-formal-direct-print-block-summary.json');

const viewports = [
  { label: 'desktop', width: 1440, height: 1100, mobile: false },
  { label: 'tablet', width: 834, height: 1112, mobile: false },
  { label: 'mobile', width: 390, height: 844, mobile: true },
];

const scenarios = [
  { name: 'main-plate', url: '/index.html' },
  { name: 'main-plate-report-popup-placeholder', url: '/index.html', setup: setupMainPlateProjectMetaPlaceholder, assert: assertMainPlateReportPopupPlaceholder },
  { name: 'main-single-plate', url: '/index.html', setup: setupMainSinglePlate, assert: assertMainSinglePlateReady },
  { name: 'main-single-plate-report-popup', url: '/index.html', setup: setupMainSinglePlate, assert: assertMainSinglePlateReportPopup },
  { name: 'main-column-splice-preset-fail-closed', url: '/index.html', setup: setupMainColumnSplicePresetFailClosed, assert: assertMainColumnSplicePresetFailClosed },
  { name: 'main-column-splice', url: '/index.html', setup: setupMainColumnSplice, assert: assertMainColumnSpliceReady },
  { name: 'main-column-splice-report-popup', url: '/index.html', setup: setupMainColumnSplice, assert: assertMainColumnSpliceReportPopup },
  { name: 'main-gusset', url: '/index.html', setup: setupMainGusset, assert: assertMainGussetReady },
  { name: 'main-gusset-report-popup', url: '/index.html', setup: setupMainGusset, assert: assertMainGussetReportPopup },
  { name: 'main-moment-preset-fail-closed', url: '/index.html', setup: setupMainMomentPresetFailClosed, assert: assertMainMomentPresetFailClosed },
  { name: 'main-moment', url: '/index.html', setup: setupMainMoment, assert: assertMainMomentReady },
  { name: 'main-moment-report-popup', url: '/index.html', setup: setupMainMoment, assert: assertMainMomentReportPopup },
  { name: 'main-tension', url: '/index.html', setup: setupMainTension },
  { name: 'main-tension-report-popup', url: '/index.html', setup: setupMainTensionReport, assert: assertMainTensionReportPopup },
  { name: 'standalone-plate', url: '/plate-check.html' },
  { name: 'standalone-plate-report-popup', url: '/plate-check.html', setup: setupStandalonePlateReport, assert: assertStandalonePlateReportPopup },
  { name: 'formal-beam', url: '/steel-beam-formal.html', setup: setupFormalProjectMetaPlaceholder, assert: assertFormalBeamReadiness },
  { name: 'formal-beam-import-candidate', url: '/steel-beam-formal.html?import=1', setup: setupFormalBeamImportCandidate, assert: assertFormalBeamImportCandidate },
  { name: 'formal-beam-meta-complete', url: '/steel-beam-formal.html', setup: setupFormalProjectMetaComplete, assert: assertFormalBeamReadinessMetaComplete },
  { name: 'formal-beam-report-popup', url: '/steel-beam-formal.html', setup: setupFormalProjectMetaComplete, assert: assertFormalBeamReportPopupComplete },
  { name: 'formal-beam-report-popup-placeholder', url: '/steel-beam-formal.html', setup: setupFormalProjectMetaPlaceholder, assert: assertFormalBeamReportPopupPlaceholder },
  { name: 'formal-beam-invalid', url: '/steel-beam-formal.html', setup: setupFormalBeamInvalid, assert: assertFormalBeamReadinessBlocked },
  { name: 'formal-column', url: '/steel-column-formal.html', setup: setupFormalProjectMetaPlaceholder, assert: assertFormalColumnReadiness },
  { name: 'formal-column-meta-complete', url: '/steel-column-formal.html', setup: setupFormalProjectMetaComplete, assert: assertFormalColumnReadinessMetaComplete },
  { name: 'formal-column-report-popup', url: '/steel-column-formal.html', setup: setupFormalProjectMetaComplete, assert: assertFormalColumnReportPopupComplete },
  { name: 'formal-column-report-popup-placeholder', url: '/steel-column-formal.html', setup: setupFormalProjectMetaPlaceholder, assert: assertFormalColumnReportPopupPlaceholder },
  { name: 'formal-column-invalid', url: '/steel-column-formal.html', setup: setupFormalColumnInvalid, assert: assertFormalColumnReadinessBlocked },
];

const STEEL_DIRECT_PRINT_TITLE = '鋼構正式工具主頁列印已封鎖';
const STEEL_DIRECT_PRINT_BODY = '此頁是操作介面，不是計算書。請關閉列印視窗，使用頁面上的「產生計算書」按鈕開啟可列印的內部審閱版，並可在預覽視窗核可為正式附件；本頁不得作為附件。';
const MAIN_ROUTE_CANONICAL_PAGE_TITLE = '鋼構正式規範核算工具 V1.3';
const steelDirectPrintPages = [
  { key: 'steel-main-formal', url: '/index.html', pageTitle: '鋼構正式規範核算工具 V1.3' },
  { key: 'steel-plate-formal', url: '/plate-check.html', pageTitle: '鋼構連接板正式規範核算工具 V1.0' },
  { key: 'steel-beam-formal', url: '/steel-beam-formal.html', pageTitle: '鋼梁正式規範核算工具 V1.0' },
  { key: 'steel-column-formal', url: '/steel-column-formal.html', pageTitle: '鋼柱正式規範核算工具 V1.0' },
];

const FORMAL_PROJECT_META = {
  projName: '鋼構正式工具驗證案',
  projNo: 'STEEL-VERIFY-001',
  projDesigner: 'Codex QA',
};

const FORMAL_PROJECT_META_PLACEHOLDER = {
  projName: '',
  projNo: '',
  projDesigner: '',
};

const LEGACY_PROJECT_META_PLACEHOLDER = {
  projectName: '未填',
  connectionTag: 'PL-VERIFY-001',
  designer: 'Codex QA',
};

const LEGACY_TENSION_PROJECT_META = {
  projectName: '鋼構拉力構件驗證案',
  connectionTag: 'TM-VERIFY-001',
  designer: 'Codex QA',
};

const LEGACY_STANDALONE_PLATE_PROJECT_META = {
  projectName: '鋼構連接板驗證案',
  connectionTag: 'PL-VERIFY-002',
  designer: 'Codex QA',
};

const SHEAR_TAB_ESCAPE_PROBE = '<img src=x onerror="window.__steelXss=1">';

const SHEAR_TAB_FORMAL_STATE = {
  projectName: '鋼構單剪力板正式證據驗證案',
  connectionTag: 'ST-GOLDEN-001',
  designer: 'Codex QA',
  notes: '正式證據案例 ST-GOLDEN-001；輸入值與 calculator.smoke-test.js singlePlateBase 一致。',
  designMethod: 'LRFD',
  connectionType: 'single_plate',
  exposureCondition: 'painted',
  requiredAxial: 0,
  requiredShear: 200,
  requiredMoment: 0,
  eccentricity: 35,
  boltDiameter: 20,
  holeDiameter: 21.5,
  holeType: 'standard',
  edgeFabrication: 'rolled',
  boltUltimateStrength: 1000,
  boltGrade: 'F10T',
  threadsCondition: 'included',
  deformationConsidered: 'true',
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
  fillerExtended: 'true',
  weldSize: 6,
  weldLength: 305,
  weldLineCount: 2,
  weldElectrodeStrength: 490,
  demandBasis: '驗證分析模型 ST-GOLDEN-001／ULS 節點反力表 R-01（Vu = 200 kN）',
  geometryBasis: '驗證核定圖 S-502／接頭 ST-GOLDEN-001（tp = 9 mm、4-M20 標準孔 dh = 21.5 mm、s = 75 mm）',
  materialBasis: '驗證材料表 M-01／F10T 螺栓證明 B-01（Fy = 235 MPa、Fu = 490 MPa）',
  eccentricityBasis: '驗證接頭模型 ST-GOLDEN-001（eb = 35 mm、ew = 70 mm、a = 70 mm）',
  conventionalMaterialConfirmed: 'true',
  connectionModelConfirmed: 'true',
};

const SHEAR_TAB_XSS_STATE = {
  projectName: `${SHEAR_TAB_FORMAL_STATE.projectName} ${SHEAR_TAB_ESCAPE_PROBE}`,
  notes: `${SHEAR_TAB_FORMAL_STATE.notes}${SHEAR_TAB_ESCAPE_PROBE}`,
  demandBasis: `${SHEAR_TAB_FORMAL_STATE.demandBasis}${SHEAR_TAB_ESCAPE_PROBE}`,
};

const SHEAR_TAB_ARTIFACT_REQUIRED_NEEDLES = [
  'ST-GOLDEN-001',
  '工程師確認模型',
  '偏心栓群螺栓剪力',
  '偏心銲群銲材強度',
  '剪力板全斷面剪力降伏',
  '剪力板淨斷面剪力斷裂',
  'Shear Tab 派生幾何與面積',
  '材料延性',
];

const GUSSET_ESCAPE_PROBE = '<img src=x onerror="window.__steelXss=1">';

const GUSSET_FORMAL_STATE = {
  projectName: '鋼構支撐 Gusset 正式證據驗證案',
  connectionTag: 'BG-GOLDEN-001',
  designer: 'Codex QA',
  notes: '正式證據案例 BG-GOLDEN-001；平板支撐同心拉力、單列六支螺栓與雙線填角銲。',
  designMethod: 'LRFD',
  connectionType: 'brace_gusset',
  exposureCondition: 'painted',
  requiredAxial: 400,
  requiredShear: 0,
  requiredMoment: 0,
  eccentricity: 0,
  boltDiameter: 20,
  holeDiameter: 21.5,
  holeType: 'standard',
  edgeFabrication: 'rolled',
  boltUltimateStrength: 1000,
  boltGrade: 'F10T',
  threadsCondition: 'included',
  deformationConsidered: 'true',
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
  braceSectionType: 'flat_plate',
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
  gussetDemandBasis: '驗證分析模型 BG-GOLDEN-001／ULS 支撐軸力表 R-01（Pu = 400 kN 拉力）',
  gussetGeometryBasis: '驗證核定圖 S-601／接頭 BG-GOLDEN-001（6-M20 標準孔、Lconn = 350 mm、Gusset tg = 14 mm）',
  gussetMaterialBasis: '驗證材料表 M-02／F10T 螺栓證明 B-02（Fy = 325 MPa、Fu = 490 MPa）',
  gussetModelBasis: '驗證接頭模型 BG-GOLDEN-001（平板支撐矩形截面全元素由單列栓直接連接，U = 1.0、Ae = An；同心拉力、單列單剪螺栓、雙線填角銲）',
  gussetStaticNonseismicConfirmed: 'true',
  gussetLoadPathConfirmed: 'true',
};

const GUSSET_XSS_STATE = {
  projectName: `${GUSSET_FORMAL_STATE.projectName} ${GUSSET_ESCAPE_PROBE}`,
  notes: `${GUSSET_FORMAL_STATE.notes}${GUSSET_ESCAPE_PROBE}`,
  gussetDemandBasis: `${GUSSET_FORMAL_STATE.gussetDemandBasis}${GUSSET_ESCAPE_PROBE}`,
};

const GUSSET_STRENGTH_KEYS = [
  'gussetBoltShear',
  'gussetBoltBearing',
  'braceBoltBearing',
  'gussetGrossYield',
  'gussetNetRupture',
  'gussetBlockShear',
  'braceGrossYield',
  'braceNetRupture',
  'braceBlockShear',
  'gussetWhitmoreYield',
  'gussetWeldMetal',
  'gussetWeldBaseGusset',
  'gussetWeldBaseSupport',
];

const GUSSET_ARTIFACT_REQUIRED_NEEDLES = [
  'BG-GOLDEN-001',
  'Gusset 螺栓剪力',
  '表 10.3-2',
  '表10.3-2',
  '4.00 tf/cm²',
  'Gusset 孔承壓',
  '支撐材孔承壓',
  'Gusset 塊狀撕裂',
  '支撐材塊狀撕裂',
  'Whitmore 有效寬度降伏',
  'Gusset V1 派生幾何與面積',
  'Gusset 栓孔斷面 Ag / An / Ae',
  'Ae = min(An, 0.85Ag)',
  '平板支撐 Ag / An / Ae',
  '350 / 404.15 / 400 mm',
  'Gusset 縱向填角銲銲材',
  'Gusset 銲線母材',
  '支承材銲線母材',
  '靜力非耐震確認',
  '串聯力流確認',
];

const COLUMN_SPLICE_FORMAL_STATE = {
  projectName: '全斷面 CJP 耐震柱續接正式證據驗證案',
  connectionTag: 'CS-GOLDEN-001',
  designer: 'Codex QA',
  notes: '正式證據案例 CS-GOLDEN-001；拉力正、壓力負，同斷面熱軋 H 形柱全斷面 CJP 設計階段能力審查。',
  designMethod: 'LRFD',
  connectionType: 'column_splice',
  exposureCondition: 'painted',
  spliceFrameRole: 'seismic_force_resisting',
  spliceDesignRoute: 'cjp_full_section_identical_rolled_h',
  spliceLocationRoute: 'beam_flange_1200',
  spliceDistanceToNearestBeamFlange: 1500,
  spliceDeadAxial: -600,
  spliceLiveAxial: -200,
  spliceSeismicAxial: 400,
  spliceLiveLoadFactor: 0.5,
  spliceSeismicReductionFu: 1.5,
  spliceTransferCapRoute: 'uncapped',
  spliceMaxTransferableAxial: 0,
  spliceAg: 30000,
  spliceZx: 5000000,
  spliceZy: 2000000,
  spliceAvx: 10000,
  spliceAvy: 12000,
  spliceFy: 345,
  spliceFexx: 490,
  spliceMaxThickness: 36,
  spliceFabricationLocation: 'field',
  spliceNdtMethod: 'UT',
  spliceDemandBasis: '分析模型 STR-CS-GOLDEN-001／13.4.1 軸力分項與方向包絡',
  spliceGeometryBasis: '核定圖 S-701／CS-GOLDEN-001 同斷面熱軋 H 形柱',
  spliceMaterialBasis: '材料證明 M-CS-01／Fy 345 MPa 與 E70 銲材',
  spliceWpsBasis: '核定 WPS/PQR WPS-CS-GOLDEN-001／全斷面 CJP',
  spliceNdtPlanBasis: '檢驗計畫 ITP-CS-GOLDEN-001／工地 CJP 100% UT',
  spliceDemandEvidenceSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  spliceDetailEvidenceSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  spliceWpsEvidenceSha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  spliceNdtPlanEvidenceSha256: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  spliceIdenticalSectionsAndMaterialConfirmed: 'true',
  spliceAlignedAxesConfirmed: 'true',
  spliceFullProfileCjpConfirmed: 'true',
  spliceMatchingFillerConfirmed: 'true',
  spliceWpsApprovedConfirmed: 'true',
  spliceNdtFullCoverageConfirmed: 'true',
  spliceNoPjpConfirmed: 'true',
  spliceNoMixedLoadSharingConfirmed: 'true',
  spliceSeismicColumnConfirmed: 'true',
  spliceLocationScopeConfirmed: 'true',
  spliceAllAdjacentTransferSourcesIncludedConfirmed: 'false',
  spliceAsBuiltBoundaryConfirmed: 'true',
};

const COLUMN_SPLICE_EXPECTED_SOURCE_FIELDS = Object.fromEntries(
  Object.entries(COLUMN_SPLICE_FORMAL_STATE).map(([key, value]) => [
    key,
    value === 'true' ? true : value === 'false' ? false : value,
  ])
);

const COLUMN_SPLICE_STRENGTH_KEYS = [
  'spliceAxialCompression13_4_1',
  'spliceAxialTension13_4_1',
  'spliceFullSectionNormal',
  'spliceFullSectionMajorFlexure',
  'spliceFullSectionMinorFlexure',
  'spliceFullSectionMajorShear',
  'spliceFullSectionMinorShear',
];

const COLUMN_SPLICE_ARTIFACT_REQUIRED_NEEDLES = [
  'CS-GOLDEN-001',
  '全斷面 CJP 耐震柱續接派生稽核',
  '13.4.1 控制軸壓力',
  '13.4.1 控制軸拉力',
  '全斷面 CJP 法向強度等同性',
  '全斷面 CJP 強軸彎曲強度等同性',
  '全斷面 CJP 弱軸彎曲強度等同性',
  '全斷面 CJP 強軸剪力強度',
  '全斷面 CJP 弱軸剪力強度',
  'Eamp,raw = 1.4 × Fu × |PE| = 840 kN',
  'Eamp,adopted = 840 kN',
  'completeColumnMemberDesign = false',
  'asBuiltAcceptance = false',
  'WPS SHA-256',
  'NDT SHA-256',
];

const MOMENT_FORMAL_STATE = {
  projectName: '梁柱彎矩接頭正式證據驗證案',
  connectionTag: 'BM-GOLDEN-001',
  designer: 'Codex QA',
  notes: '正式證據案例 BM-GOLDEN-001；SMRF 補強式接頭、X 向單一構架面，外部受控容量與耐震資格證據均已鎖定。',
  designMethod: 'LRFD',
  connectionType: 'beam_column_moment',
  exposureCondition: 'painted',
  momentFrameSystem: 'smrf',
  momentAxis: 'x',
  momentConnectionDesignRoute: 'reinforced',
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
  momentRotationDemandMethod: 'default',
  momentQualifiedPlasticRotation: 0.04,
  momentNonlinearPlasticRotation: 0.02,
  momentSystemDuctilityR: 8,
  momentElasticStoryDrift: 0.025,
  momentQualificationRoute: 'prior_test_similarity',
  momentQualificationTestCount: 3,
  momentDesignBeamFlangeThickness: 16,
  momentTestBeamFlangeThickness: 18,
  momentDesignFlangePlasticRatio: 0.76,
  momentTestFlangePlasticRatio: 0.75,
  momentThirdPartyReviewConfirmed: 'true',
  momentColumnWebYieldStrength: 325,
  momentColumnDepth: 600,
  momentPanelZoneThickness: 20,
  momentPanelZoneClearDepth: 540,
  momentPanelZoneClearWidth: 360,
  momentPanelZoneAnalysisDemand: 2100,
  momentPanelZoneBeamMomentSum: 1540,
  momentPanelZoneLeverArm: 700,
  momentDoublerPresent: 'true',
  momentDoublerAttachmentConfirmed: 'true',
  momentBeamFlangeWidth: 250,
  momentBeamFlangeThickness: 16,
  momentColumnFlangeLocalNominalStrength: 2400,
  momentContinuityPlateProvidedConfirmed: 'true',
  momentContinuityPlateWeldConfirmed: 'true',
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
  momentDemandBasis: 'ETABS ULS 包絡與節點剪力整理表 BM-GOLDEN-001-R1',
  momentGeometryBasis: '核定鋼構詳圖 S-601／BM-GOLDEN-001',
  momentMaterialBasis: '梁柱鋼材與銲材材料證明 M-21',
  momentCapacityBasis: '受控接頭容量表 BM-GOLDEN-001-CAP-R1，涵蓋接頭零組件、prying、yield-line、螺栓與銲道',
  momentPanelZoneBasis: 'Panel Zone 分析書 BM-GOLDEN-001-PZ-R1',
  momentStrongColumnBasis: '柱梁彎矩比整理表 BM-GOLDEN-001-SCWB-R1，含四個補強式梁項 ZbFyb + Vp·x',
  momentQualificationBasis: '耐震資格試驗相似性比對報告 BM-GOLDEN-001-QUAL-R1',
  momentQualificationEvidenceSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  momentCapacityEvidenceSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  momentQualificationConfigurationConfirmed: 'true',
  momentQualificationMaterialConfirmed: 'true',
  momentQualificationWeldingConfirmed: 'true',
  momentQualificationGeometryConfirmed: 'true',
  momentQualificationFabricationConfirmed: 'true',
  momentQualificationProcedureConfirmed: 'true',
  momentPlasticZoneGeometryConfirmed: 'true',
  momentPlasticZoneOpeningsAbsentConfirmed: 'true',
  momentSeismicMaterialConfirmed: 'true',
  momentMatchingWeldConfirmed: 'true',
  momentCns3506WeldConfirmed: 'true',
  momentEndTabsRemovedGroundConfirmed: 'true',
  momentWeldProcedureMatchesQualificationConfirmed: 'true',
  momentJointLateralRestraintConfirmed: 'true',
  momentBeamLateralBracingConfirmed: 'true',
  momentAllMembersIncludedConfirmed: 'true',
  momentColumnStrengthsAtGoverningAxialConfirmed: 'true',
  momentOpposingDirectionsConfirmed: 'true',
  momentOrthogonalDirectionSeparateConfirmed: 'true',
  momentConnectionHardwareVerifiedConfirmed: 'true',
  momentSelectedAxisScopeConfirmed: 'true',
};

const MOMENT_STRENGTH_KEYS = [
  'momentFlexuralStrength',
  'momentShearStrength',
  'momentPlasticRotation',
  'momentPanelZoneShear',
  'momentStrongColumnCw',
  'momentStrongColumnCcw',
];

const MOMENT_EXPECTED_SOURCE_FIELDS = Object.fromEntries(
  Object.entries(MOMENT_FORMAL_STATE).map(([key, value]) => [
    key,
    value === 'true' ? true : value === 'false' ? false : value,
  ])
);

const MOMENT_ARTIFACT_REQUIRED_NEEDLES = [
  'BM-GOLDEN-001',
  '梁柱彎矩耐震能力審查派生稽核',
  '接頭彎矩容量',
  '接頭剪力容量',
  '塑性轉角資格',
  'Panel Zone 剪力',
  '強柱弱梁比 CW',
  '強柱弱梁比 CCW',
  'ZbFyb + Vp·x',
  'Mpr,far',
  'completeJointDesign = false',
  '本附件不宣稱 AISC 358 預認證',
  '外部容量證據',
  '正交方向另案',
];

const FORMAL_REPORT_TRACE_LABELS = ['產出工具', '工具版本', '輸出時間', '計算指紋'];
const FORMAL_REPORT_REFERENCE_NEEDLES = ['功能借鏡', 'SkyCiv', 'ClearCalcs', 'Dlubal'];
const STEEL_FORMAL_REPORT_INPUT_LABEL_ALLOWLIST = new Set(['適用範圍', '設計備註']);
const CALCULATION_BOOK_UI_ONLY_NEEDLES = [...new Set([
  ...Object.values(CALCULATION_BOOK_CONTENT_BOUNDARY.forbiddenCategories).flat(),
  '可切換', '面積直輸模式', '面積輸入模式', '設計依據與限制條件', '適用範圍', '限制與不適用事項', '審查提醒', '設計備註',
])].filter(needle => !STEEL_FORMAL_REPORT_INPUT_LABEL_ALLOWLIST.has(needle));

function assertFormalReportTraceText(value, label) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  for (const needle of FORMAL_REPORT_TRACE_LABELS) {
    if (!text.includes(needle)) throw new Error(`${label} missing report trace label ${needle}: ${text}`);
  }
  const expectations = [
    [/產出工具\s*(?:連接板|拉力構件|鋼構接頭|鋼梁|鋼柱)正式規範核算工具/, '產出工具'],
    [/工具版本\s*v\d+(?:\.\d+)*(?:[-+.\w]*)?/i, '工具版本'],
    [/輸出時間\s*\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}/, '輸出時間'],
    [/計算指紋\s*CF-[0-9A-F]{16}/, '計算指紋'],
  ];
  for (const [pattern, field] of expectations) {
    if (!pattern.test(text)) throw new Error(`${label} missing a valid ${field} value: ${text}`);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function log(message) {
  if (!quiet) console.log(message);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function findEdgeExecutable() {
  const candidates = [
    process.env.MSEDGE_PATH,
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Unable to locate msedge.exe. Set MSEDGE_PATH to the Edge executable path.');
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForJson(url, timeoutMs = 20000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isTransientLaunchError(error) {
  if (!error) return false;
  if (['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) return true;
  return /spawn EPERM|WinError 5|access is denied|Permission denied|Timed out waiting for Edge DevTools|Edge exited before DevTools endpoint was available/i.test(error.message || '');
}

function formatError(error) {
  return error && (error.stack || error.message) ? (error.stack || error.message) : String(error);
}

async function launchEdgeOnce(edgePath) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steel-audit-edge-'));
  const debugPort = await getFreePort();
  const versionUrl = `http://127.0.0.1:${debugPort}/json/version`;
  const browserArgs = [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--remote-allow-origins=*',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-popup-blocking',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ];
  let child;
  try {
    child = spawn(edgePath, browserArgs, { stdio: 'ignore', windowsHide: true });
    const version = await Promise.race([
      waitForJson(versionUrl, 20000),
      new Promise((_, reject) => child.once('error', reject)),
    ]);
    if (!version.webSocketDebuggerUrl) throw new Error('Edge DevTools endpoint did not provide webSocketDebuggerUrl.');
    return { child, profileDir, wsUrl: version.webSocketDebuggerUrl, debugPort };
  } catch (error) {
    if (child && !child.killed) child.kill('SIGKILL');
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
    } catch (_) {}
    throw error;
  }
}

async function launchEdge() {
  const edgePath = findEdgeExecutable();
  const retryDelaysMs = [0, 5000, 15000, 30000, 60000];
  let lastError;
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    try {
      if (attempt > 0) log(`Retrying Edge launch attempt ${attempt + 1}/${retryDelaysMs.length}...`);
      return await launchEdgeOnce(edgePath);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < retryDelaysMs.length - 1 && isTransientLaunchError(error);
      if (!canRetry) throw error;
      const delayMs = retryDelaysMs[attempt + 1];
      log(`Edge launch transient failure on attempt ${attempt + 1}: ${error.message}; retrying in ${delayMs}ms`);
      await wait(delayMs);
    }
  }
  throw lastError;
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Set();
  }

  async open() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', event => reject(new Error(`WebSocket error: ${event.message || 'unknown'}`)), { once: true });
    });
    this.ws.addEventListener('message', event => this.onMessage(event.data));
    this.ws.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('CDP connection closed.'));
      this.pending.clear();
    });
  }

  onMessage(data) {
    const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
    const message = JSON.parse(text);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result || {});
      return;
    }
    for (const handler of this.handlers) handler(message);
  }

  onEvent(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  async close() {
    if (!this.ws || this.ws.readyState >= 2) return;
    this.ws.close();
  }
}

function waitForEvent(cdp, method, sessionId, predicate = () => true, timeoutMs = 30000) {
  return withTimeout(new Promise(resolve => {
    const remove = cdp.onEvent(message => {
      if (message.method !== method) return;
      if (sessionId && message.sessionId !== sessionId) return;
      if (!predicate(message.params || {})) return;
      remove();
      resolve(message.params || {});
    });
  }), timeoutMs, method);
}

async function evaluate(cdp, sessionId, expression, label) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  }, sessionId);
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text || label;
    throw new Error(`${label}: ${text}`);
  }
  return result.result?.value;
}

async function setupMainTension(cdp, sessionId) {
  await evaluate(cdp, sessionId, `(() => {
    const connectionType = document.querySelector('select[name="connectionType"]');
    if (!connectionType) throw new Error('missing connectionType select');
    connectionType.value = 'tension_member';
    connectionType.dispatchEvent(new Event('change', { bubbles: true }));
    const preset = document.querySelector('#examplePresetSelect');
    if (!preset) throw new Error('missing examplePresetSelect');
    preset.value = 'tension_bolted_plate';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    const button = document.querySelector('#loadExampleBtn');
    if (!button) throw new Error('missing loadExampleBtn');
    button.click();
    return true;
  })()`, 'main tension setup');
  await wait(300);
}

async function setupLegacyProjectMeta(cdp, sessionId, fields, label) {
  await evaluate(cdp, sessionId, `(() => {
    const fields = ${JSON.stringify(fields)};
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.querySelector('[name="' + name + '"]');
      if (!input) throw new Error('missing [name="' + name + '"]');
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return true;
  })()`, label);
  await wait(250);
}

async function setupMainTensionReport(cdp, sessionId) {
  await setupMainTension(cdp, sessionId);
  await setupLegacyProjectMeta(cdp, sessionId, LEGACY_TENSION_PROJECT_META, 'main tension project meta setup');
}

async function setupStandalonePlateReport(cdp, sessionId) {
  await setupLegacyProjectMeta(cdp, sessionId, LEGACY_STANDALONE_PLATE_PROJECT_META, 'standalone plate project meta setup');
}

async function setupMainSinglePlate(cdp, sessionId) {
  await evaluate(cdp, sessionId, `(() => {
    window.__steelXss = 0;
    const connectionType = document.querySelector('select[name="connectionType"]');
    const preset = document.querySelector('#examplePresetSelect');
    const loadButton = document.querySelector('#loadExampleBtn');
    if (!connectionType || !preset || !loadButton) throw new Error('missing Shear Tab preset controls');
    connectionType.value = 'single_plate';
    connectionType.dispatchEvent(new Event('change', { bubbles: true }));
    preset.value = 'single_plate_standard';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    loadButton.click();

    const fields = ${JSON.stringify(SHEAR_TAB_FORMAL_STATE)};
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.querySelector('[name="' + name + '"]');
      if (!input) throw new Error('missing [name="' + name + '"]');
      input.value = value;
    });
    const updateTrigger = document.querySelector('[name="connectionModelConfirmed"]');
    updateTrigger.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`, 'main single plate formal verification setup');
  await wait(350);
}

async function setupMainFailClosedPreset(cdp, sessionId, options) {
  await evaluate(cdp, sessionId, `(() => {
    const options = ${JSON.stringify(options)};
    const connectionType = document.querySelector('select[name="connectionType"]');
    const preset = document.querySelector('#examplePresetSelect');
    const loadButton = document.querySelector('#loadExampleBtn');
    if (!connectionType || !preset || !loadButton) {
      throw new Error('missing fail-closed preset controls');
    }
    connectionType.value = options.connectionType;
    connectionType.dispatchEvent(new Event('change', { bubbles: true }));
    preset.value = options.presetId;
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    if (preset.value !== options.presetId) {
      throw new Error('missing built-in preset ' + options.presetId);
    }
    loadButton.click();
    return true;
  })()`, `${options.label} setup`);
  await wait(350);
}

async function setupMainColumnSplicePresetFailClosed(cdp, sessionId) {
  return setupMainFailClosedPreset(cdp, sessionId, {
    connectionType: 'column_splice',
    presetId: 'column_splice_cjp_seismic',
    label: 'main column splice built-in fail-closed preset',
  });
}

async function setupMainMomentPresetFailClosed(cdp, sessionId) {
  return setupMainFailClosedPreset(cdp, sessionId, {
    connectionType: 'beam_column_moment',
    presetId: 'beam_column_moment_seismic_review',
    label: 'main beam-column moment built-in fail-closed preset',
  });
}

async function setupMainColumnSplice(cdp, sessionId) {
  await evaluate(cdp, sessionId, `(() => {
    const connectionType = document.querySelector('select[name="connectionType"]');
    if (!connectionType) throw new Error('missing column splice connectionType control');
    connectionType.value = 'column_splice';
    connectionType.dispatchEvent(new Event('change', { bubbles: true }));

    const fields = ${JSON.stringify(COLUMN_SPLICE_FORMAL_STATE)};
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.querySelector('[name="' + name + '"]');
      if (!input) throw new Error('missing column splice field [name="' + name + '"]');
      input.value = value;
    });
    const updateTrigger = document.querySelector('[name="spliceAsBuiltBoundaryConfirmed"]');
    if (!updateTrigger) throw new Error('missing column splice as-built boundary trigger');
    updateTrigger.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`, 'main column splice formal verification setup');
  await wait(350);
}

async function setupMainGusset(cdp, sessionId) {
  await evaluate(cdp, sessionId, `(() => {
    window.__steelXss = 0;
    const connectionType = document.querySelector('select[name="connectionType"]');
    const preset = document.querySelector('#examplePresetSelect');
    const loadButton = document.querySelector('#loadExampleBtn');
    if (!connectionType || !preset || !loadButton) throw new Error('missing Gusset preset controls');
    connectionType.value = 'brace_gusset';
    connectionType.dispatchEvent(new Event('change', { bubbles: true }));
    preset.value = 'brace_gusset_standard';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    loadButton.click();

    const fields = ${JSON.stringify(GUSSET_FORMAL_STATE)};
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.querySelector('[name="' + name + '"]');
      if (!input) throw new Error('missing [name="' + name + '"]');
      input.value = value;
    });
    const updateTrigger = document.querySelector('[name="gussetLoadPathConfirmed"]');
    if (!updateTrigger) throw new Error('missing Gusset load-path confirmation trigger');
    updateTrigger.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`, 'main Gusset formal verification setup');
  await wait(350);
}

async function setupMainMoment(cdp, sessionId) {
  await evaluate(cdp, sessionId, `(() => {
    const connectionType = document.querySelector('select[name="connectionType"]');
    if (!connectionType) throw new Error('missing beam-column moment connectionType control');
    connectionType.value = 'beam_column_moment';
    connectionType.dispatchEvent(new Event('change', { bubbles: true }));

    const fields = ${JSON.stringify(MOMENT_FORMAL_STATE)};
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.querySelector('[name="' + name + '"]');
      if (!input) throw new Error('missing beam-column moment field [name="' + name + '"]');
      input.value = value;
    });
    const updateTrigger = document.querySelector('[name="momentSelectedAxisScopeConfirmed"]');
    if (!updateTrigger) throw new Error('missing beam-column moment scope confirmation trigger');
    updateTrigger.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`, 'main beam-column moment formal verification setup');
  await wait(350);
}

async function setupMainPlateProjectMetaPlaceholder(cdp, sessionId) {
  await evaluate(cdp, sessionId, `(() => {
    const connectionType = document.querySelector('select[name="connectionType"]');
    if (!connectionType) throw new Error('missing connectionType select');
    connectionType.value = 'plate_check';
    connectionType.dispatchEvent(new Event('change', { bubbles: true }));
    const preset = document.querySelector('#examplePresetSelect');
    if (!preset) throw new Error('missing examplePresetSelect');
    preset.value = 'plate_geometry';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    const button = document.querySelector('#loadExampleBtn');
    if (!button) throw new Error('missing loadExampleBtn');
    button.click();
    return true;
  })()`, 'main plate placeholder preset setup');
  await wait(300);
  await evaluate(cdp, sessionId, `(() => {
    const fields = ${JSON.stringify(LEGACY_PROJECT_META_PLACEHOLDER)};
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.querySelector('[name="' + name + '"]');
      if (!input) throw new Error('missing [name="' + name + '"]');
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return true;
  })()`, 'main plate placeholder project meta setup');
  await wait(250);
}

async function setupFormalBeamInvalid(cdp, sessionId) {
  await setupFormalInvalid(cdp, sessionId, '#beamInputStatus', 'beam inline validation');
}

async function setupFormalBeamImportCandidate(cdp, sessionId) {
  const payload = {
    target: 'steel-beam',
    meta: {
      source: '連續梁分析',
      caseName: '主控組合 (梁)',
      factored: false,
      loadBasis: 'unconfirmed',
    },
    forces: { M: 12.5, MNeg: -18.75, V: -7.25 },
    member: { spanCm: 650 },
    section: { title: '上游參考斷面' },
    material: null,
  };
  await evaluate(cdp, sessionId, `(() => {
    localStorage.setItem('structToolbox.pendingForces', ${JSON.stringify(JSON.stringify(payload))});
    return true;
  })()`, 'formal beam import candidate storage');
  const loadEvent = waitForEvent(cdp, 'Page.loadEventFired', sessionId, () => true, 60000);
  await cdp.send('Page.reload', { ignoreCache: true }, sessionId);
  await loadEvent;
  await wait(350);
  await setupFormalProjectMetaComplete(cdp, sessionId);
}

async function setupFormalProjectMeta(cdp, sessionId, fields, label) {
  await evaluate(cdp, sessionId, `(() => {
    const fields = ${JSON.stringify(fields)};
    Object.entries(fields).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (!input) throw new Error('missing #' + id);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return true;
  })()`, label);
  await wait(250);
}

async function setupFormalProjectMetaPlaceholder(cdp, sessionId) {
  await setupFormalProjectMeta(cdp, sessionId, FORMAL_PROJECT_META_PLACEHOLDER, 'formal project meta placeholder setup');
}

async function setupFormalProjectMetaComplete(cdp, sessionId) {
  await setupFormalProjectMeta(cdp, sessionId, FORMAL_PROJECT_META, 'formal project meta setup');
}

async function setupFormalColumnInvalid(cdp, sessionId) {
  await setupFormalInvalid(cdp, sessionId, '#columnInputStatus', 'column inline validation');
}

async function setupFormalInvalid(cdp, sessionId, statusSelector, label) {
  await evaluate(cdp, sessionId, `(async () => {
    const input = document.querySelector('#inH');
    if (!input) throw new Error('missing #inH');
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const button = document.querySelector('#runCheckBtn');
    if (!button) throw new Error('missing #runCheckBtn');
    button.click();
    await new Promise(resolve => setTimeout(resolve, 250));
    const status = document.querySelector('${statusSelector}')?.textContent || '';
    if (!status.includes('請確認 H 型鋼尺寸輸入完整且合理。')) {
      throw new Error('${label} status missing: ' + status);
    }
    return status;
  })()`, label);
}

async function assertFormalBeamReadiness(cdp, sessionId) {
  await assertFormalReportReadiness(cdp, sessionId, '#beamReportReadiness', 'beam report readiness');
  await assertFormalReportReadinessText(cdp, sessionId, '#beamReportReadiness', '計畫名稱 / 編號 / 設計人尚未完整', 'beam missing project metadata note');
  await assertFormalProjectMetaPlaceholderRendered(cdp, sessionId, {
    nameId: '#beamMetaProjectName',
    noId: '#beamMetaProjectNo',
    designerId: '#beamMetaDesigner',
  }, 'beam placeholder project meta render');
}

async function assertFormalBeamReadinessMetaComplete(cdp, sessionId) {
  await assertFormalReportReadiness(cdp, sessionId, '#beamReportReadiness', 'beam report readiness after metadata');
  await assertFormalReportReadinessTextAbsent(cdp, sessionId, '#beamReportReadiness', '計畫名稱 / 編號 / 設計人尚未完整', 'beam metadata warning should clear');
  await assertFormalProjectMetaRendered(cdp, sessionId, {
    nameId: '#beamMetaProjectName',
    noId: '#beamMetaProjectNo',
    designerId: '#beamMetaDesigner',
  }, 'beam project meta render');
}

async function assertFormalBeamReadinessBlocked(cdp, sessionId) {
  await assertFormalReportReadinessBlocked(cdp, sessionId, '#beamReportReadiness', 'beam report readiness');
}

async function assertFormalBeamImportCandidate(cdp, sessionId) {
  const state = await evaluate(cdp, sessionId, `(() => {
    const read = id => document.getElementById(id);
    const initial = {
      panelHidden: read('beamImportReview')?.hidden,
      applyDisabled: read('beamImportApply')?.disabled,
      moment: read('inMu')?.value,
      shear: read('inVu')?.value,
      span: read('inL')?.value,
      fy: read('inFy')?.value,
      lb: read('inLb')?.value,
      cb: read('inCb')?.value,
      candidateText: read('beamImportReview')?.innerText || '',
    };
    read('beamImportMomentChoice').value = 'absolute';
    read('beamImportConfirm').checked = true;
    read('beamImportConfirm').dispatchEvent(new Event('change', { bubbles: true }));
    const enabledAfterConfirm = !read('beamImportApply').disabled;
    read('beamImportApply').click();
    const adopted = {
      moment: read('inMu')?.value,
      shear: read('inVu')?.value,
      span: read('inL')?.value,
      fy: read('inFy')?.value,
      lb: read('inLb')?.value,
      cb: read('inCb')?.value,
      badge: read('beamImportReviewBadge')?.textContent || '',
      status: read('beamImportStatus')?.textContent || '',
      reportValidation: read('beamReportReadiness')?.innerText || '',
      pendingStorage: localStorage.getItem('structToolbox.pendingForces'),
    };

    const originalOpen = window.open;
    const writes = [];
    window.open = () => ({
      document: {
        open() {},
        write(html) { writes.push(String(html || '')); },
        close() {},
      },
      focus() {},
    });
    try {
      read('btnReport').click();
    } finally {
      window.open = originalOpen;
    }
    const reportHtml = writes.join('');
    const reportDocument = new DOMParser().parseFromString(reportHtml, 'text/html');
    return {
      initial,
      enabledAfterConfirm,
      adopted,
      reportText: (reportDocument.body?.innerText || reportDocument.body?.textContent || '').replace(/\\s+/g, ' ').trim(),
    };
  })()`, 'formal beam import candidate adoption');

  if (state.initial.panelHidden !== false || state.initial.applyDisabled !== true) {
    throw new Error(`beam candidate should be visible but disabled before confirmation: ${JSON.stringify(state.initial)}`);
  }
  if (!state.initial.candidateText.includes('12.50 tf·m') || !state.initial.candidateText.includes('-18.75 tf·m') || !state.initial.candidateText.includes('7.25 tf') || !state.initial.candidateText.includes('650.0 cm') || !state.initial.candidateText.includes('載重基準：未確認')) {
    throw new Error(`beam candidate values missing: ${state.initial.candidateText}`);
  }
  if (state.initial.moment !== '30' || state.initial.shear !== '15' || state.initial.span !== '800') {
    throw new Error(`beam formal inputs changed before confirmation: ${JSON.stringify(state.initial)}`);
  }
  if (!state.enabledAfterConfirm || state.adopted.moment !== '18.75' || state.adopted.shear !== '7.25' || state.adopted.span !== '650') {
    throw new Error(`beam candidate adoption mismatch: ${JSON.stringify(state)}`);
  }
  if (state.adopted.fy !== state.initial.fy || state.adopted.lb !== state.initial.lb || state.adopted.cb !== state.initial.cb) {
    throw new Error(`beam candidate must not overwrite Fy/Lb/Cb: ${JSON.stringify(state)}`);
  }
  if (!state.adopted.badge.includes('已套用') || !state.adopted.status.includes('請再確認斷面、Fy、Lb／Cb')) {
    throw new Error(`beam candidate adoption status missing: ${JSON.stringify(state.adopted)}`);
  }
  if (!state.adopted.reportValidation.includes('重新執行檢核') || state.adopted.pendingStorage !== null) {
    throw new Error(`beam candidate should require rerun and clear pending storage: ${JSON.stringify(state.adopted)}`);
  }
  if (!state.reportText.includes('內力來源') || !state.reportText.includes('連續梁分析') || !state.reportText.includes('人工確認採用') || !state.reportText.includes('載重基準：已人工確認')) {
    throw new Error(`beam formal report should record the adopted source: ${state.reportText}`);
  }
  for (const forbidden of ['候選輸入值', '候選值尚未套用', '優先建議報告閱讀狀態', '不會寫入計算書或列印 PDF']) {
    if (state.reportText.includes(forbidden)) {
      throw new Error(`beam formal report should exclude page-only candidate/readiness wording "${forbidden}": ${state.reportText}`);
    }
  }
  await assertPageOnlyReadinessHiddenInPrint(cdp, sessionId, '#beamImportReview', 'beam import candidate review');
}

async function assertFormalBeamReportPopupComplete(cdp, sessionId, context = {}) {
  return assertFormalReportPopup(cdp, sessionId, {
    label: 'beam formal report popup',
    buttonSelector: '#printReportBtn',
    titleNeedle: '鋼梁正式規範核算計算書',
    expectedProject: {
      name: FORMAL_PROJECT_META.projName,
      no: FORMAL_PROJECT_META.projNo,
      designer: FORMAL_PROJECT_META.projDesigner,
    },
    sourcePayloadBuilder: 'buildBeamSourcePayload',
    sourceReplay: {
      builder: 'buildBeamSourcePayload', inputSelector: '#inputImportSourceJson', mutationSelector: '#inFy',
      sourceFieldKey: 'inFy', statusSelector: '#beamInputStatus', nestedFields: true,
    },
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-beam-formal' : '',
  });
}

async function assertFormalBeamReportPopupPlaceholder(cdp, sessionId) {
  return assertFormalReportPopup(cdp, sessionId, {
    label: 'beam formal report popup placeholder',
    titleNeedle: '鋼梁正式規範核算計算書',
    expectedProject: {
      name: '',
      no: FORMAL_PROJECT_META_PLACEHOLDER.projNo,
      designer: FORMAL_PROJECT_META_PLACEHOLDER.projDesigner,
    },
    absentNeedles: ['未填'],
  });
}

async function assertMainPlateProjectMetaPlaceholderRendered(cdp, sessionId) {
  const meta = await evaluate(cdp, sessionId, `(() => ({
    name: document.querySelector('#metaProjectName')?.innerText?.trim() || '',
    tag: document.querySelector('#metaConnectionTag')?.innerText?.trim() || '',
    designer: document.querySelector('#metaDesigner')?.innerText?.trim() || '',
  }))()`, 'main plate placeholder project meta render');
  if (meta.name !== '—' || meta.tag !== LEGACY_PROJECT_META_PLACEHOLDER.connectionTag || meta.designer !== LEGACY_PROJECT_META_PLACEHOLDER.designer) {
    throw new Error(`main plate placeholder project meta render mismatch: ${JSON.stringify(meta)}`);
  }
}

async function assertMainPlateSummaryCopyPlaceholder(cdp, sessionId) {
  const snapshot = await evaluate(cdp, sessionId, `(async () => {
    window.__copiedSummary = '';
    const clipboardStub = { writeText: async (text) => { window.__copiedSummary = text; } };
    try {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboardStub });
    } catch (error) {
      if (!navigator.clipboard) throw error;
      navigator.clipboard.writeText = clipboardStub.writeText;
    }
    const button = document.querySelector('#copySummaryBtn');
    if (!button) throw new Error('missing #copySummaryBtn');
    button.click();
    await new Promise(resolve => setTimeout(resolve, 150));
    return {
      text: window.__copiedSummary || '',
      buttonText: button.textContent || '',
    };
  })()`, 'main plate summary copy placeholder');
  if (!snapshot.text.includes('計畫：—')) {
    throw new Error(`main plate copied summary should scrub placeholder project name: ${snapshot.text}`);
  }
  if (!snapshot.text.includes(`接頭：${LEGACY_PROJECT_META_PLACEHOLDER.connectionTag}`)) {
    throw new Error(`main plate copied summary should keep connection tag: ${snapshot.text}`);
  }
  if (snapshot.text.includes('未填')) {
    throw new Error(`main plate copied summary should exclude placeholder text: ${snapshot.text}`);
  }
}

async function assertMainPlateReportPopupPlaceholder(cdp, sessionId, context = {}) {
  await assertMainPlateProjectMetaPlaceholderRendered(cdp, sessionId);
  await assertMainPlateSummaryCopyPlaceholder(cdp, sessionId);
  return assertLegacyReportPopup(cdp, sessionId, {
    label: 'main plate report popup placeholder',
    buttonSelector: '#printReportBtn',
    titleNeedle: '連接板檢核計算書',
    expectedProject: {
      name: '',
      tag: LEGACY_PROJECT_META_PLACEHOLDER.connectionTag,
      designer: LEGACY_PROJECT_META_PLACEHOLDER.designer,
    },
    adoptedPlaceholderNeedle: '計畫名稱 未填',
    sourcePayloadBuilder: 'buildSteelConnectionSourcePayload',
    sourceReplay: {
      builder: 'buildSteelConnectionSourcePayload', inputSelector: '#importSourceJsonInput',
      mutationSelector: 'input[name="plateThickness"]:not([disabled])', sourceFieldKey: 'plateThickness',
      statusSelector: '#exportReportStatus', nestedFields: false,
    },
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-main-plate' : '',
  });
}

async function assertMainSinglePlateReady(cdp, sessionId) {
  const snapshot = await evaluate(cdp, sessionId, `(() => {
    const result = window.latestSteelConnectionResult;
    const payload = window.buildSteelConnectionSourcePayload?.();
    const calculate = window.ShearConnectionCalculator?.calculateConnection;
    const summarizeGate = (candidate) => ({
      passes: candidate?.passes === true,
      overallStatus: candidate?.overallStatus || '',
      failingKeys: (candidate?.detailChecks || []).filter(item => !item.passes).map(item => item.key),
      failingStrengthKeys: (candidate?.checks || []).filter(item => item.ratio > 1).map(item => item.key),
      plateFlexureAvailable: (candidate?.checks || []).find(item => item.key === 'plateFlexure')?.available,
    });
    const gateProbes = typeof calculate === 'function' && result?.state ? {
      materialUnconfirmed: summarizeGate(calculate({
        ...result.state,
        conventionalMaterialConfirmed: false,
      })),
      highStrengthConfirmed: summarizeGate(calculate({
        ...result.state,
        plateYieldStrength: 690,
        plateUltimateStrength: 780,
        beamWebYieldStrength: 690,
        beamWebUltimateStrength: 780,
        conventionalMaterialConfirmed: true,
      })),
      oversizedPitch: summarizeGate(calculate({ ...result.state, pitch: 76.3 })),
      oversizedHeight: summarizeGate(calculate({ ...result.state, plateHeight: 914.5 })),
      boltEccentricityFlexure: summarizeGate(calculate({
        ...result.state,
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
      })),
    } : null;
    return {
      connectionType: result?.state?.connectionType || '',
      complianceReady: result?.complianceReady === true,
      passes: result?.passes === true,
      checkCount: result?.checks?.length || 0,
      detailFailureCount: (result?.detailChecks || []).filter(item => !item.passes).length,
      detailFailures: (result?.detailChecks || []).filter(item => !item.passes).map(item => ({
        key: item.key, label: item.label, provided: item.provided, required: item.required, note: item.note,
      })),
      escapeProbeImageCount: Array.from(document.querySelectorAll('img')).filter(node =>
        String(node.getAttribute('onerror') || '').includes('__steelXss')).length,
      escapeProbeExecuted: window.__steelXss === 1,
      escapeProbeTextVisible: (document.body?.innerText || '').includes(${JSON.stringify(SHEAR_TAB_ESCAPE_PROBE)}),
      grossShearArea: result?.derivedAreas?.Agv,
      netShearArea: result?.derivedAreas?.Anv,
      adoptedShear: result?.designDemand?.adoptedShear,
      project: payload?.project || null,
      fields: payload?.fields || null,
      sourceFingerprint: payload?.calculationFingerprint || '',
      reportFingerprint: payload?.report?.calculationFingerprint || '',
      banner: document.querySelector('#reportBanner')?.textContent || '',
      gateProbes,
    };
  })()`, 'main single plate formal verification state');
  const expectedProject = {
    name: SHEAR_TAB_FORMAL_STATE.projectName,
    no: SHEAR_TAB_FORMAL_STATE.connectionTag,
    designer: SHEAR_TAB_FORMAL_STATE.designer,
  };
  if (snapshot.connectionType !== 'single_plate' || !snapshot.complianceReady || !snapshot.passes
      || snapshot.checkCount !== 10 || snapshot.detailFailureCount !== 0) {
    throw new Error(`main single plate should be formally ready with ten strength routes: ${JSON.stringify(snapshot)}`);
  }
  if (Math.abs(snapshot.grossShearArea - 2745) > 1e-9
      || Math.abs(snapshot.netShearArea - 1917) > 1e-9
      || Math.abs(snapshot.adoptedShear - 200) > 1e-9) {
    throw new Error(`main single plate browser golden values drifted: ${JSON.stringify(snapshot)}`);
  }
  if (JSON.stringify(snapshot.project) !== JSON.stringify(expectedProject)) {
    throw new Error(`main single plate project trace mismatch: ${JSON.stringify(snapshot.project)}`);
  }
  if (snapshot.escapeProbeImageCount !== 0 || snapshot.escapeProbeExecuted || snapshot.escapeProbeTextVisible) {
    throw new Error(`main single plate golden state should be free of the XSS probe literal: ${JSON.stringify(snapshot)}`);
  }
  for (const key of ['demandBasis', 'geometryBasis', 'materialBasis', 'eccentricityBasis']) {
    if (snapshot.fields?.[key] !== SHEAR_TAB_FORMAL_STATE[key] || /示例|請依專案覆寫/.test(String(snapshot.fields?.[key] || ''))) {
      throw new Error(`main single plate ${key} is not the governed verification value: ${JSON.stringify(snapshot.fields?.[key])}`);
    }
  }
  if (snapshot.fields?.connectionModelConfirmed !== true
      || snapshot.fields?.conventionalMaterialConfirmed !== true
      || !/^CF-[0-9A-F]{16}$/.test(snapshot.sourceFingerprint)
      || snapshot.reportFingerprint !== snapshot.sourceFingerprint) {
    throw new Error(`main single plate source snapshot/material-model confirmation mismatch: ${JSON.stringify(snapshot)}`);
  }
  const gateExpectations = [
    ['materialUnconfirmed', ['singlePlateConventionalMaterialConfirmed']],
    ['highStrengthConfirmed', ['singlePlateConventionalPlateFy', 'singlePlateConventionalBeamWebFy']],
    ['oversizedPitch', ['singlePlateConventionalPitch']],
    ['oversizedHeight', ['singlePlateConventionalHeight']],
  ];
  for (const [probeName, expectedKeys] of gateExpectations) {
    const probe = snapshot.gateProbes?.[probeName];
    if (!probe || probe.passes || probe.overallStatus !== 'fail'
        || expectedKeys.some(key => !probe.failingKeys.includes(key))) {
      throw new Error(`main single plate ${probeName} should remain fail-closed at the material/geometric hard gate: ${JSON.stringify(snapshot.gateProbes)}`);
    }
  }
  const flexureProbe = snapshot.gateProbes?.boltEccentricityFlexure;
  if (!flexureProbe || flexureProbe.passes || flexureProbe.overallStatus !== 'fail'
      || !flexureProbe.failingStrengthKeys.includes('plateFlexure')
      || Math.abs(flexureProbe.plateFlexureAvailable - 44.679375) > 1e-9) {
    throw new Error(`main single plate eb=400/ew=40 should be blocked by e_p=max(e_b,e_w) plate flexure: ${JSON.stringify(snapshot.gateProbes)}`);
  }
}

async function assertMainSinglePlateXssIsolation(cdp, sessionId) {
  const injection = await evaluate(cdp, sessionId, `(() => {
    window.__steelXss = 0;
    const fields = ${JSON.stringify(SHEAR_TAB_XSS_STATE)};
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.querySelector('[name="' + name + '"]');
      if (!input) throw new Error('missing XSS probe field [name="' + name + '"]');
      input.value = value;
    });
    const updateTrigger = document.querySelector('[name="connectionModelConfirmed"]');
    if (!updateTrigger) throw new Error('missing XSS probe update trigger');
    updateTrigger.dispatchEvent(new Event('change', { bubbles: true }));
    const payload = window.buildSteelConnectionSourcePayload?.();
    window.__steelSourceReplayPayload = payload;
    return {
      passes: window.latestSteelConnectionResult?.passes === true,
      fields: payload?.fields || null,
      sourceFingerprint: payload?.calculationFingerprint || '',
      reportFingerprint: payload?.report?.calculationFingerprint || '',
      escapeProbeImageCount: Array.from(document.querySelectorAll('img')).filter(node =>
        String(node.getAttribute('onerror') || '').includes('__steelXss')).length,
      escapeProbeExecuted: window.__steelXss === 1,
      escapeProbeTextVisible: (document.body?.innerText || '').includes(${JSON.stringify(SHEAR_TAB_ESCAPE_PROBE)}),
    };
  })()`, 'main single plate XSS injection');
  if (!injection.passes
      || injection.fields?.projectName !== SHEAR_TAB_XSS_STATE.projectName
      || injection.fields?.notes !== SHEAR_TAB_XSS_STATE.notes
      || injection.fields?.demandBasis !== SHEAR_TAB_XSS_STATE.demandBasis
      || !/^CF-[0-9A-F]{16}$/.test(injection.sourceFingerprint)
      || injection.reportFingerprint !== injection.sourceFingerprint
      || injection.escapeProbeImageCount !== 0 || injection.escapeProbeExecuted || !injection.escapeProbeTextVisible) {
    throw new Error(`main single plate XSS injection should remain escaped and fingerprinted: ${JSON.stringify(injection)}`);
  }

  await assertSourceJsonReplay(cdp, sessionId, {
    label: 'main single plate XSS source replay',
    builder: 'buildSteelConnectionSourcePayload',
    inputSelector: '#importSourceJsonInput',
    mutationSelector: 'input[name="plateThickness"]:not([disabled])',
    sourceFieldKey: 'plateThickness',
    statusSelector: '#exportReportStatus',
    nestedFields: false,
    escapeProbeNeedle: SHEAR_TAB_ESCAPE_PROBE,
    strictBooleanField: 'conventionalMaterialConfirmed',
  });

  const popup = await openLegacyReportPopup(cdp, sessionId, 'main single plate XSS popup', '#printReportBtn');
  try {
    const snapshot = await evaluate(cdp, popup.sessionId, `(() => ({
      bodyText: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim(),
      escapeProbeImageCount: Array.from(document.querySelectorAll('img')).filter(node =>
        String(node.getAttribute('onerror') || '').includes('__steelXss')).length,
      escapeProbeExecuted: window.__steelXss === 1,
    }))()`, 'main single plate XSS popup snapshot');
    const approvalState = await captureReportApprovalState(cdp, popup.sessionId, 'main single plate XSS popup');
    verifySteelApprovedHtml(approvalState, 'main single plate XSS popup');
    const approvedVisibleText = AttachmentPackageChecker.extractHtmlVisibleContent(approvalState.approvedHtml).text;
    if (snapshot.escapeProbeImageCount !== 0 || snapshot.escapeProbeExecuted
        || !snapshot.bodyText.includes(SHEAR_TAB_ESCAPE_PROBE)
        || !approvedVisibleText.includes(SHEAR_TAB_ESCAPE_PROBE)
        || approvalState.approvedHtml.includes(SHEAR_TAB_ESCAPE_PROBE)) {
      throw new Error(`main single plate XSS popup should preserve the probe as escaped visible text only: ${JSON.stringify(snapshot)}`);
    }
  } finally {
    await cdp.send('Target.closeTarget', { targetId: popup.targetId }).catch(() => {});
  }
}

async function assertMainSinglePlateReportPopup(cdp, sessionId, context = {}) {
  await assertMainSinglePlateReady(cdp, sessionId);
  await assertMainSinglePlateXssIsolation(cdp, sessionId);
  await setupMainSinglePlate(cdp, sessionId);
  await assertMainSinglePlateReady(cdp, sessionId);
  return assertLegacyReportPopup(cdp, sessionId, {
    label: 'main single plate report popup',
    buttonSelector: '#printReportBtn',
    titleNeedle: '剪力接頭檢核計算書',
    expectedProject: {
      name: SHEAR_TAB_FORMAL_STATE.projectName,
      tag: SHEAR_TAB_FORMAL_STATE.connectionTag,
      designer: SHEAR_TAB_FORMAL_STATE.designer,
    },
    sourcePayloadBuilder: 'buildSteelConnectionSourcePayload',
    sourceReplay: {
      builder: 'buildSteelConnectionSourcePayload', inputSelector: '#importSourceJsonInput',
      mutationSelector: 'input[name="plateThickness"]:not([disabled])', sourceFieldKey: 'plateThickness',
      statusSelector: '#exportReportStatus', nestedFields: false,
      strictBooleanField: 'conventionalMaterialConfirmed',
    },
    expectedSourceFields: {
      requiredShear: 200,
      holeDiameter: 21.5,
      plateThickness: 9,
      weldEccentricity: 70,
      weldLength: 305,
      weldLineCount: 2,
      demandBasis: SHEAR_TAB_FORMAL_STATE.demandBasis,
      geometryBasis: SHEAR_TAB_FORMAL_STATE.geometryBasis,
      materialBasis: SHEAR_TAB_FORMAL_STATE.materialBasis,
      eccentricityBasis: SHEAR_TAB_FORMAL_STATE.eccentricityBasis,
      conventionalMaterialConfirmed: true,
      connectionModelConfirmed: true,
    },
    artifactRequiredNeedles: SHEAR_TAB_ARTIFACT_REQUIRED_NEEDLES,
    absentNeedles: [SHEAR_TAB_ESCAPE_PROBE],
    continuationContextLabels: ['暴露條件', '銲腳尺寸 a', 'φRn,h', 'Vavailable', '自由邊距 g', '板淨剪力面積 Anv', '端距 e', '採用偏心 e_b'],
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-main-shear-tab' : '',
  });
}

async function assertMainFailClosedPreset(cdp, sessionId, options) {
  const snapshot = await evaluate(cdp, sessionId, `(() => {
    const options = ${JSON.stringify(options)};
    const clean = value => String(value || '').replace(/\\s+/g, ' ').trim();
    const result = window.latestSteelConnectionResult;
    const preset = document.querySelector('#examplePresetSelect');
    const connectionCard = document.querySelector('[data-connection="' + options.connectionType + '"]');
    const fieldValue = name => document.querySelector('[name="' + name + '"]')?.value ?? null;
    return {
      connectionType: result?.state?.connectionType || '',
      selectedType: document.querySelector('select[name="connectionType"]')?.value || '',
      presetId: preset?.value || '',
      presetLabel: clean(preset?.selectedOptions?.[0]?.textContent),
      presetVisible: (preset?.getClientRects().length || 0) > 0,
      connectionCardVisible: Boolean(connectionCard && !connectionCard.classList.contains('is-hidden')),
      complianceReady: result?.complianceReady === true,
      passes: result?.passes === true,
      overallStatus: result?.overallStatus || '',
      detailFailure: result?.summary?.detailFailure === true,
      failingDetailKeys: (result?.detailChecks || []).filter(item => !item.passes).map(item => item.key),
      basisValues: Object.fromEntries(options.basisFields.map(name => [name, fieldValue(name)])),
      confirmationValues: Object.fromEntries(options.unconfirmedFields.map(name => [name, result?.state?.[name]])),
      evidenceHashValues: Object.fromEntries(options.emptyHashFields.map(name => [name, result?.state?.[name]])),
      reportBanner: clean(document.querySelector('#reportBanner')?.textContent),
      approvalStamp: clean(document.querySelector('#approvalStamp')?.textContent),
      approvalDecision: clean(document.querySelector('#approvalDecision')?.textContent),
      projectName: fieldValue('projectName'),
    };
  })()`, `${options.label} state`);

  if (snapshot.connectionType !== options.connectionType || snapshot.selectedType !== options.connectionType
      || snapshot.presetId !== options.presetId || !snapshot.presetVisible || !snapshot.connectionCardVisible) {
    throw new Error(`${options.label} must visibly load the intended built-in preset: ${JSON.stringify(snapshot)}`);
  }
  if (!snapshot.presetLabel.includes('示例｜需依專案覆寫證據後才可核可')) {
    throw new Error(`${options.label} must visibly disclose its non-formal example boundary: ${JSON.stringify(snapshot)}`);
  }
  for (const [name, value] of Object.entries(snapshot.basisValues || {})) {
    if (!String(value || '').includes('示例資料（請依專案覆寫')) {
      throw new Error(`${options.label} field ${name} must retain visible example-source wording: ${JSON.stringify(snapshot)}`);
    }
  }
  for (const [name, value] of Object.entries(snapshot.confirmationValues || {})) {
    if (value !== false) {
      throw new Error(`${options.label} confirmation ${name} must start unconfirmed: ${JSON.stringify(snapshot)}`);
    }
  }
  for (const [name, value] of Object.entries(snapshot.evidenceHashValues || {})) {
    if (value !== '') {
      throw new Error(`${options.label} evidence ${name} must start empty: ${JSON.stringify(snapshot)}`);
    }
  }
  const missingFailures = options.expectedFailingDetailKeys.filter(key => !snapshot.failingDetailKeys.includes(key));
  if (!snapshot.complianceReady || snapshot.passes || snapshot.overallStatus !== 'fail' || !snapshot.detailFailure
      || missingFailures.length > 0
      || !['強度可行，但細部規定未通過', '檢核未通過'].includes(snapshot.reportBanner)
      || !['退回修正', '不核可'].includes(snapshot.approvalStamp)
      || !['細部不符', '不核可'].includes(snapshot.approvalDecision)) {
    throw new Error(`${options.label} must remain non-approvable until project evidence and confirmations are replaced: ${JSON.stringify({ ...snapshot, missingFailures })}`);
  }
}

async function assertMainColumnSplicePresetFailClosed(cdp, sessionId) {
  return assertMainFailClosedPreset(cdp, sessionId, {
    label: 'main column splice built-in fail-closed preset',
    connectionType: 'column_splice',
    presetId: 'column_splice_cjp_seismic',
    basisFields: [
      'spliceDemandBasis', 'spliceGeometryBasis', 'spliceMaterialBasis', 'spliceWpsBasis', 'spliceNdtPlanBasis',
    ],
    unconfirmedFields: [
      'spliceIdenticalSectionsAndMaterialConfirmed', 'spliceWpsApprovedConfirmed',
      'spliceNdtFullCoverageConfirmed', 'spliceSeismicColumnConfirmed',
      'spliceLocationScopeConfirmed', 'spliceAsBuiltBoundaryConfirmed',
    ],
    emptyHashFields: [
      'spliceDemandEvidenceSha256', 'spliceDetailEvidenceSha256',
      'spliceWpsEvidenceSha256', 'spliceNdtPlanEvidenceSha256',
    ],
    expectedFailingDetailKeys: ['spliceTopologyScope', 'spliceEvidence', 'spliceAsBuiltBoundary'],
  });
}

async function assertMainMomentPresetFailClosed(cdp, sessionId) {
  return assertMainFailClosedPreset(cdp, sessionId, {
    label: 'main beam-column moment built-in fail-closed preset',
    connectionType: 'beam_column_moment',
    presetId: 'beam_column_moment_seismic_review',
    basisFields: [
      'momentDemandBasis', 'momentGeometryBasis', 'momentMaterialBasis', 'momentCapacityBasis',
      'momentPanelZoneBasis', 'momentStrongColumnBasis', 'momentQualificationBasis',
    ],
    unconfirmedFields: [
      'momentQualificationConfigurationConfirmed', 'momentQualificationMaterialConfirmed',
      'momentQualificationWeldingConfirmed', 'momentQualificationGeometryConfirmed',
      'momentQualificationFabricationConfirmed', 'momentQualificationProcedureConfirmed',
      'momentConnectionHardwareVerifiedConfirmed', 'momentSelectedAxisScopeConfirmed',
    ],
    emptyHashFields: ['momentQualificationEvidenceSha256', 'momentCapacityEvidenceSha256'],
    expectedFailingDetailKeys: [
      'momentQualificationConfigurationConfirmed', 'momentConnectionHardwareVerifiedConfirmed',
      'momentSelectedAxisScopeConfirmed', 'momentQualificationEvidenceSha256', 'momentCapacityEvidenceSha256',
    ],
  });
}

async function assertMainColumnSpliceReady(cdp, sessionId) {
  const snapshot = await evaluate(cdp, sessionId, `(() => {
    const result = window.latestSteelConnectionResult;
    const payload = window.buildSteelConnectionSourcePayload?.();
    const calculate = window.ShearConnectionCalculator?.calculateConnection;
    const summarize = (candidate) => ({
      passes: candidate?.passes === true,
      overallStatus: candidate?.overallStatus || '',
      failingKeys: (candidate?.detailChecks || []).filter(item => !item.passes).map(item => item.key),
      validationFailure: candidate?.summary?.validationFailure === true,
      spliceReview: candidate?.spliceReview || null,
    });
    const probe = (overrides) => summarize(calculate({ ...result.state, ...overrides }));
    const probes = typeof calculate === 'function' && result?.state ? {
      qualifiedCap: probe({
        spliceTransferCapRoute: 'qualified',
        spliceMaxTransferableAxial: 500,
        spliceAllAdjacentTransferSourcesIncludedConfirmed: true,
      }),
      incompleteQualifiedCap: probe({
        spliceTransferCapRoute: 'qualified',
        spliceMaxTransferableAxial: 500,
        spliceAllAdjacentTransferSourcesIncludedConfirmed: false,
      }),
      invalidNdtHash: probe({ spliceNdtPlanEvidenceSha256: 'not-a-sha256' }),
      asBuiltBoundaryUnconfirmed: probe({ spliceAsBuiltBoundaryConfirmed: false }),
    } : null;
    const review = result?.spliceReview || null;
    const finiteReviewPaths = [];
    const visit = (value, path) => {
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) finiteReviewPaths.push(path);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, path + '[' + index + ']'));
      }
    };
    Object.entries(review || {}).forEach(([key, value]) => visit(value, 'spliceReview.' + key));
    return {
      connectionType: result?.state?.connectionType || '',
      complianceReady: result?.complianceReady === true,
      passes: result?.passes === true,
      completeJointDesign: result?.completeJointDesign,
      completeColumnMemberDesign: result?.completeColumnMemberDesign,
      asBuiltAcceptance: result?.asBuiltAcceptance,
      scopeLimited: result?.scopeLimited,
      checkKeys: (result?.checks || []).map(item => item.key),
      detailFailureCount: (result?.detailChecks || []).filter(item => !item.passes).length,
      validationFailure: result?.summary?.validationFailure === true,
      spliceReview: review,
      finiteReviewPaths,
      project: payload?.project || null,
      tool: payload?.tool || null,
      fields: payload?.fields || null,
      sourceFingerprint: payload?.calculationFingerprint || '',
      reportFingerprint: payload?.report?.calculationFingerprint || '',
      selectedType: document.querySelector('select[name="connectionType"]')?.value || '',
      optionDisabled: document.querySelector('select[name="connectionType"] option[value="column_splice"]')?.disabled === true,
      spliceCardVisible: !document.querySelector('[data-connection="column_splice"]')?.classList.contains('is-hidden'),
      strengthRows: Array.from(document.querySelectorAll('#strengthCheckTableBody [data-check-key]')).map(row => row.dataset.checkKey),
      probes,
    };
  })()`, 'main column splice formal verification state');

  const expectedProject = {
    name: COLUMN_SPLICE_FORMAL_STATE.projectName,
    no: COLUMN_SPLICE_FORMAL_STATE.connectionTag,
    designer: COLUMN_SPLICE_FORMAL_STATE.designer,
  };
  if (snapshot.connectionType !== 'column_splice' || snapshot.selectedType !== 'column_splice'
      || snapshot.optionDisabled || !snapshot.spliceCardVisible || !snapshot.complianceReady || !snapshot.passes
      || snapshot.completeJointDesign !== false || snapshot.completeColumnMemberDesign !== false
      || snapshot.asBuiltAcceptance !== false || snapshot.scopeLimited !== false
      || snapshot.validationFailure || snapshot.detailFailureCount !== 0 || snapshot.finiteReviewPaths.length !== 0) {
    throw new Error(`main column splice should be a ready finite formal design attachment with explicit member/as-built boundaries: ${JSON.stringify(snapshot)}`);
  }
  const expectedStrengthKeys = [...COLUMN_SPLICE_STRENGTH_KEYS].sort();
  if (JSON.stringify([...snapshot.checkKeys].sort()) !== JSON.stringify(expectedStrengthKeys)
      || JSON.stringify([...snapshot.strengthRows].sort()) !== JSON.stringify(expectedStrengthKeys)) {
    throw new Error(`main column splice should expose exactly seven fixed capacity routes in both result and rendered table: ${JSON.stringify(snapshot)}`);
  }
  const review = snapshot.spliceReview || {};
  const uncappedGolden = {
    EampRaw: 840,
    EampAdopted: 840,
    PuCompression: 1660,
    TuTension: 300,
    normalCapacity: 9315,
    majorFlexuralCapacity: 1552.5,
    minorFlexuralCapacity: 621,
    majorShearCapacity: 1863,
    minorShearCapacity: 2235.6,
  };
  for (const [key, expectedValue] of Object.entries(uncappedGolden)) {
    if (Math.abs(Number(review[key]) - expectedValue) > 1e-9) {
      throw new Error(`main column splice uncapped golden ${key} drifted: ${JSON.stringify({ expectedValue, actualValue: review[key], review })}`);
    }
  }
  if (review.transferCapApplied !== false
      || Math.abs(Number(review.compressionCombinations?.[0]) - 20) > 1e-9
      || Math.abs(Number(review.compressionCombinations?.[1]) + 1660) > 1e-9
      || Math.abs(Number(review.tensionCombinations?.[0]) - 300) > 1e-9
      || Math.abs(Number(review.tensionCombinations?.[1]) + 1380) > 1e-9) {
    throw new Error(`main column splice uncapped signed combinations/cap disclosure drifted: ${JSON.stringify(review)}`);
  }
  const qualified = snapshot.probes?.qualifiedCap;
  if (!qualified?.passes || qualified.overallStatus === 'fail'
      || qualified.spliceReview?.transferCapApplied !== true
      || Math.abs(Number(qualified.spliceReview?.EampRaw) - 840) > 1e-9
      || Math.abs(Number(qualified.spliceReview?.EampAdopted) - 625) > 1e-9
      || Math.abs(Number(qualified.spliceReview?.PuCompression) - 1445) > 1e-9
      || Math.abs(Number(qualified.spliceReview?.TuTension) - 85) > 1e-9) {
    throw new Error(`main column splice qualified-cap golden drifted: ${JSON.stringify(qualified)}`);
  }
  const failClosedProbes = {
    incompleteQualifiedCap: 'spliceTransferCap',
    invalidNdtHash: 'spliceNdtPlan',
    asBuiltBoundaryUnconfirmed: 'spliceAsBuiltBoundary',
  };
  for (const [probeName, failingKey] of Object.entries(failClosedProbes)) {
    const probeResult = snapshot.probes?.[probeName];
    if (!probeResult || probeResult.passes || probeResult.overallStatus !== 'fail' || !probeResult.failingKeys.includes(failingKey)) {
      throw new Error(`main column splice ${probeName} must fail closed at ${failingKey}: ${JSON.stringify(snapshot.probes)}`);
    }
  }
  if (Math.abs(Number(snapshot.probes?.incompleteQualifiedCap?.spliceReview?.EampAdopted) - 840) > 1e-9
      || snapshot.probes?.incompleteQualifiedCap?.validationFailure !== true) {
    throw new Error(`main column splice invalid qualified cap must revert to uncapped demand and block formal output: ${JSON.stringify(snapshot.probes?.incompleteQualifiedCap)}`);
  }
  if (JSON.stringify(snapshot.project) !== JSON.stringify(expectedProject)
      || String(snapshot.tool?.version || '').toUpperCase() !== 'V1.3'
      || Object.keys(snapshot.fields || {}).length !== 49
      || !/^CF-[0-9A-F]{16}$/.test(snapshot.sourceFingerprint)
      || snapshot.reportFingerprint !== snapshot.sourceFingerprint) {
    throw new Error(`main column splice 49-field source/project/version/fingerprint trace mismatch: ${JSON.stringify(snapshot)}`);
  }
  for (const [key, expectedValue] of Object.entries(COLUMN_SPLICE_EXPECTED_SOURCE_FIELDS)) {
    if (snapshot.fields?.[key] !== expectedValue) {
      throw new Error(`main column splice source field ${key} mismatch: ${JSON.stringify({ expectedValue, actualValue: snapshot.fields?.[key] })}`);
    }
  }
}

async function assertMainColumnSpliceReportPopup(cdp, sessionId, context = {}) {
  await assertMainColumnSpliceReady(cdp, sessionId);
  if (context.viewport?.label === 'desktop') {
    await verifySteelNgSourceFileRoundTrip(cdp, sessionId, {
      key: 'steel-main-column-splice-ng-source',
      label: 'main column splice self-produced NG source',
      ngOverrides: {
        spliceDistanceToNearestBeamFlange: 1000,
        spliceMaxThickness: 50,
      },
      recoveryOverrides: {
        spliceDistanceToNearestBeamFlange: 1500,
        spliceMaxThickness: 36,
      },
      updateTriggerSelector: '[name="spliceAsBuiltBoundaryConfirmed"]',
      expectedFailingDetailKeys: ['spliceLocation1200', 'spliceNonJumbo'],
      expectedFailingStrengthKeys: [],
      expectedNgStateValues: {
        spliceDistanceToNearestBeamFlange: 1000,
        spliceMaxThickness: 50,
      },
    });
    await setupMainColumnSplice(cdp, sessionId);
    await assertMainColumnSpliceReady(cdp, sessionId);
  }
  return assertLegacyReportPopup(cdp, sessionId, {
    label: 'main column splice report popup',
    buttonSelector: '#printReportBtn',
    titleNeedle: '全斷面 CJP 耐震柱續接能力審查附件',
    expectedProject: {
      name: COLUMN_SPLICE_FORMAL_STATE.projectName,
      tag: COLUMN_SPLICE_FORMAL_STATE.connectionTag,
      designer: COLUMN_SPLICE_FORMAL_STATE.designer,
    },
    sourcePayloadBuilder: 'buildSteelConnectionSourcePayload',
    sourceReplay: {
      builder: 'buildSteelConnectionSourcePayload', inputSelector: '#importSourceJsonInput',
      mutationSelector: 'input[name="spliceAg"]:not([disabled])', sourceFieldKey: 'spliceAg',
      statusSelector: '#exportReportStatus', nestedFields: false,
      strictBooleanField: 'spliceAsBuiltBoundaryConfirmed',
      updateTriggerSelector: '[name="spliceAsBuiltBoundaryConfirmed"]',
      reportTamper: true,
      crossModuleBeforeImport: 'single_plate',
      exactFieldSchemaProbes: true,
      schemaProbeMissingField: 'spliceAg',
      wrongEnumField: 'spliceNdtMethod',
      wrongEnumValue: 'VT',
    },
    expectedSourceFields: COLUMN_SPLICE_EXPECTED_SOURCE_FIELDS,
    expectedSourceFieldCount: 49,
    visibleCalculationCheckKeys: COLUMN_SPLICE_STRENGTH_KEYS,
    artifactRequiredNeedles: COLUMN_SPLICE_ARTIFACT_REQUIRED_NEEDLES,
    domAndTextRequiredNeedles: [
      'Eamp 原始／採用',
      'WPS／NDT 證據',
      '本附件不取代柱構件整體穩定、梁柱交會區、基礎力流、施工可行性或既有銲道驗收',
    ],
    reportOnlyRequiredNeedles: [
      'completeColumnMemberDesign = false；asBuiltAcceptance = false',
      '本附件不取代柱構件整體穩定',
      '既有銲道驗收',
      '相接梁或斜撐極限狀態可傳軸力上限只有在 qualified 路線',
    ],
    continuationContextLabels: ['13.4.1', '全斷面 CJP', 'Eamp', 'Nuc,+/-', 'WPS/PQR', 'NDT 計畫'],
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-main-column-splice' : '',
  });
}

async function assertMainGussetReady(cdp, sessionId) {
  const snapshot = await evaluate(cdp, sessionId, `(() => {
    const result = window.latestSteelConnectionResult;
    const payload = window.buildSteelConnectionSourcePayload?.();
    const calculate = window.ShearConnectionCalculator?.calculateConnection;
    const summarizeGate = (candidate) => ({
      passes: candidate?.passes === true,
      complianceReady: candidate?.complianceReady === true,
      overallStatus: candidate?.overallStatus || '',
      validationFailure: candidate?.summary?.validationFailure === true,
      strengthFailure: candidate?.summary?.strengthFailure === true,
      detailFailure: candidate?.summary?.detailFailure === true,
      failingKeys: (candidate?.detailChecks || []).filter(item => !item.passes).map(item => item.key),
      validations: candidate?.validations || [],
    });
    const probe = (overrides) => summarizeGate(calculate({ ...result.state, ...overrides }));
    const gateProbes = typeof calculate === 'function' && result?.state ? {
      compression: probe({ requiredAxial: -400 }),
      asd: probe({ designMethod: 'ASD' }),
      nonzeroShear: probe({ requiredShear: 1 }),
      nonzeroMoment: probe({ requiredMoment: 1 }),
      nonzeroEccentricity: probe({ eccentricity: 1 }),
      negativeEccentricity: probe({ eccentricity: -1 }),
      badGussetMaterialOrder: probe({ gussetYieldStrength: 491 }),
      badBraceMaterialOrder: probe({ braceFy: 491 }),
      badSupportMaterialOrder: probe({ supportFy: 491 }),
      badGussetGeometry: probe({ gussetNetWidth: 180.1 }),
      badBraceGeometry: probe({ braceNetWidth: 160.1 }),
      staticNonseismicUnconfirmed: probe({ gussetStaticNonseismicConfirmed: false }),
      loadPathUnconfirmed: probe({ gussetLoadPathConfirmed: false }),
      nonstandardHole: probe({ holeType: 'oversized' }),
      invalidStandardHole: probe({ holeDiameter: 25 }),
      unsupportedShearTopology: probe({ gussetShearPlanes: 2 }),
      unsupportedWeldTopology: probe({ weldLineCount: 1 }),
      unsupportedBraceSection: probe({ braceSectionType: 'angle' }),
      mismatchedWhitmoreConnectionLength: probe({ gussetWhitmoreConnectionLength: 349 }),
      overlongWhitmoreConnectionLength: probe({ gussetWhitmoreConnectionLength: 1251, gussetPitch: 250.2 }),
      numericOverflow: probe({ gussetThickness: Number.MAX_VALUE }),
    } : null;
    return {
      connectionType: result?.state?.connectionType || '',
      complianceReady: result?.complianceReady === true,
      passes: result?.passes === true,
      checkKeys: (result?.checks || []).map(item => item.key),
      strengthAvailable: Object.fromEntries((result?.checks || []).map(item => [item.key, item.available])),
      strengthEvidence: Object.fromEntries((result?.checks || []).map(item => [item.key, {
        nominal: item.nominal,
        available: item.available,
        ratio: item.ratio,
        note: item.note || '',
        codeRef: item.codeRef || '',
        equationRef: item.equationRef || '',
        equationLines: item.equationLines || [],
      }])),
      governingKey: result?.governing?.key || '',
      governingRatio: result?.governing?.ratio,
      detailFailureCount: (result?.detailChecks || []).filter(item => !item.passes).length,
      validationFailure: result?.summary?.validationFailure === true,
      derivedAreas: result?.derivedAreas || null,
      project: payload?.project || null,
      tool: payload?.tool || null,
      fields: payload?.fields || null,
      sourceFingerprint: payload?.calculationFingerprint || '',
      reportFingerprint: payload?.report?.calculationFingerprint || '',
      escapeProbeImageCount: Array.from(document.querySelectorAll('img')).filter(node =>
        String(node.getAttribute('onerror') || '').includes('__steelXss')).length,
      escapeProbeExecuted: window.__steelXss === 1,
      escapeProbeTextVisible: (document.body?.innerText || '').includes(${JSON.stringify(GUSSET_ESCAPE_PROBE)}),
      banner: document.querySelector('#reportBanner')?.textContent || '',
      moduleLabel: document.querySelector('[data-connection="brace_gusset"] h2')?.textContent?.trim() || '',
      gateProbes,
    };
  })()`, 'main Gusset formal verification state');
  const expectedProject = {
    name: GUSSET_FORMAL_STATE.projectName,
    no: GUSSET_FORMAL_STATE.connectionTag,
    designer: GUSSET_FORMAL_STATE.designer,
  };
  const actualStrengthKeys = [...snapshot.checkKeys].sort();
  const expectedStrengthKeys = [...GUSSET_STRENGTH_KEYS].sort();
  if (snapshot.connectionType !== 'brace_gusset' || !snapshot.complianceReady || !snapshot.passes
      || snapshot.validationFailure || snapshot.detailFailureCount !== 0
      || JSON.stringify(actualStrengthKeys) !== JSON.stringify(expectedStrengthKeys)) {
    throw new Error(`main Gusset should be formally ready with the complete V1 strength routes: ${JSON.stringify(snapshot)}`);
  }
  if (snapshot.governingKey !== 'gussetBoltShear'
      || Math.abs(Number(snapshot.governingRatio) - 0.7213016704283786) > 1e-12) {
    throw new Error(`main Gusset governing golden value drifted: ${JSON.stringify({ key: snapshot.governingKey, ratio: snapshot.governingRatio })}`);
  }
  const boltShearEvidence = snapshot.strengthEvidence?.gussetBoltShear || {};
  if (Math.abs(Number(boltShearEvidence.nominal) - 739.4039903118323) > 1e-9
      || Math.abs(Number(boltShearEvidence.available) - 554.5529927338742) > 1e-9
      || Math.abs(Number(boltShearEvidence.ratio) - (400 / 554.5529927338742)) > 1e-12
      || boltShearEvidence.codeRef !== '10.3.3、表10.3-2'
      || boltShearEvidence.equationRef !== '表10.3-2'
      || !boltShearEvidence.note.includes('表 10.3-2')
      || /式\s*\(?10\.3-1\)?/.test(boltShearEvidence.note)
      || !boltShearEvidence.note.includes('4.00 tf/cm²')
      || !boltShearEvidence.note.includes('392.266 MPa')
      || !boltShearEvidence.equationLines.some(line => line.includes('4.00 tf/cm²') && line.includes('392.266 MPa'))) {
    throw new Error(`main Gusset F10T table shear stress/capacity evidence drifted: ${JSON.stringify(boltShearEvidence)}`);
  }
  const expectedDerived = {
    gussetGrossArea: 2520,
    gussetNetArea: 2191,
    gussetEffectiveNetArea: 2142,
    braceGrossArea: 1920,
    braceNetArea: 1638,
    gussetBlockAgv: 5600,
    gussetBlockAnv: 3829,
    gussetBlockAgt: 840,
    gussetBlockAnt: 679,
    braceBlockAgv: 4800,
    braceBlockAnv: 3282,
    braceBlockAgt: 720,
    braceBlockAnt: 582,
    gussetWhitmoreTheoreticalWidth: 2 * 350 * Math.tan(Math.PI / 6),
    gussetWhitmoreEffectiveWidth: 400,
    gussetWhitmoreArea: 5600,
  };
  for (const [key, expected] of Object.entries(expectedDerived)) {
    if (Math.abs(Number(snapshot.derivedAreas?.[key]) - expected) > 1e-9) {
      throw new Error(`main Gusset browser golden ${key} drifted: ${JSON.stringify(snapshot.derivedAreas)}`);
    }
  }
  const expectedBlockShearAvailable = {
    gussetBlockShear: 1049.0445,
    braceBlockShear: 899.181,
  };
  for (const [key, expected] of Object.entries(expectedBlockShearAvailable)) {
    if (Math.abs(Number(snapshot.strengthAvailable?.[key]) - expected) > 1e-9) {
      throw new Error(`main Gusset browser golden ${key} capacity drifted: ${JSON.stringify(snapshot.strengthAvailable)}`);
    }
  }
  if (JSON.stringify(snapshot.project) !== JSON.stringify(expectedProject)) {
    throw new Error(`main Gusset project trace mismatch: ${JSON.stringify(snapshot.project)}`);
  }
  if (String(snapshot.tool?.version || '').toUpperCase() !== 'V1.3') {
    throw new Error(`main Gusset source should use the formal connection V1.3 contract: ${JSON.stringify(snapshot.tool)}`);
  }
  if (snapshot.moduleLabel !== '支撐接頭｜平板支撐 Gusset 拉力接頭｜LRFD 正式模組') {
    throw new Error(`main Gusset formal module label drifted: ${JSON.stringify(snapshot.moduleLabel)}`);
  }
  if (snapshot.escapeProbeImageCount !== 0 || snapshot.escapeProbeExecuted || snapshot.escapeProbeTextVisible) {
    throw new Error(`main Gusset golden state should be free of the XSS probe literal: ${JSON.stringify(snapshot)}`);
  }
  for (const key of ['gussetDemandBasis', 'gussetGeometryBasis', 'gussetMaterialBasis', 'gussetModelBasis']) {
    if (snapshot.fields?.[key] !== GUSSET_FORMAL_STATE[key] || /示例|請依專案覆寫/.test(String(snapshot.fields?.[key] || ''))) {
      throw new Error(`main Gusset ${key} is not the governed verification value: ${JSON.stringify(snapshot.fields?.[key])}`);
    }
  }
  if (snapshot.fields?.gussetStaticNonseismicConfirmed !== true
      || snapshot.fields?.gussetLoadPathConfirmed !== true
      || !/^CF-[0-9A-F]{16}$/.test(snapshot.sourceFingerprint)
      || snapshot.reportFingerprint !== snapshot.sourceFingerprint) {
    throw new Error(`main Gusset source snapshot/confirmation mismatch: ${JSON.stringify(snapshot)}`);
  }
  for (const [probeName, probe] of Object.entries(snapshot.gateProbes || {})) {
    if (!probe || probe.passes || !probe.complianceReady || probe.overallStatus !== 'fail' || !probe.validationFailure) {
      throw new Error(`main Gusset ${probeName} should remain fail-closed at the V1 hard gate: ${JSON.stringify(snapshot.gateProbes)}`);
    }
  }
  if (!snapshot.gateProbes?.overlongWhitmoreConnectionLength?.failingKeys?.includes('gussetBearingConnectionLength')) {
    throw new Error(`main Gusset Lconn > 1250 mm should fail specifically at the Table 10.3-2 note [e] envelope: ${JSON.stringify(snapshot.gateProbes?.overlongWhitmoreConnectionLength)}`);
  }
  const longConnectionValidations = snapshot.gateProbes.overlongWhitmoreConnectionLength.validations || [];
  if (!longConnectionValidations.some(message => message.includes('表 10.3-2 註 [e]')
      && message.includes('本 Gusset 為端部接合')
      && message.includes('V1 在尚未實作長接合路線前保守援用 Lconn ≤ 1250 mm')
      && message.includes('並非將該註解泛化為所有接合的條文上限'))) {
    throw new Error(`main Gusset Lconn > 1250 mm wording must identify the conservative V1 applicability boundary instead of a universal prohibition: ${JSON.stringify(longConnectionValidations)}`);
  }
  const overflowProbe = snapshot.gateProbes.numericOverflow;
  for (const key of ['gussetFiniteDerivedResults', 'gussetFiniteStrengthResults']) {
    if (!overflowProbe?.failingKeys?.includes(key)) {
      throw new Error(`main Gusset numeric overflow should fail ${key}: ${JSON.stringify(overflowProbe)}`);
    }
  }
}

async function assertMainGussetXssIsolation(cdp, sessionId) {
  const injection = await evaluate(cdp, sessionId, `(() => {
    window.__steelXss = 0;
    const fields = ${JSON.stringify(GUSSET_XSS_STATE)};
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.querySelector('[name="' + name + '"]');
      if (!input) throw new Error('missing Gusset XSS probe field [name="' + name + '"]');
      input.value = value;
    });
    const updateTrigger = document.querySelector('[name="gussetLoadPathConfirmed"]');
    if (!updateTrigger) throw new Error('missing Gusset XSS update trigger');
    updateTrigger.dispatchEvent(new Event('change', { bubbles: true }));
    const payload = window.buildSteelConnectionSourcePayload?.();
    window.__steelSourceReplayPayload = payload;
    return {
      passes: window.latestSteelConnectionResult?.passes === true,
      fields: payload?.fields || null,
      sourceFingerprint: payload?.calculationFingerprint || '',
      reportFingerprint: payload?.report?.calculationFingerprint || '',
      escapeProbeImageCount: Array.from(document.querySelectorAll('img')).filter(node =>
        String(node.getAttribute('onerror') || '').includes('__steelXss')).length,
      escapeProbeExecuted: window.__steelXss === 1,
      escapeProbeTextVisible: (document.body?.innerText || '').includes(${JSON.stringify(GUSSET_ESCAPE_PROBE)}),
    };
  })()`, 'main Gusset XSS injection');
  if (!injection.passes
      || injection.fields?.projectName !== GUSSET_XSS_STATE.projectName
      || injection.fields?.notes !== GUSSET_XSS_STATE.notes
      || injection.fields?.gussetDemandBasis !== GUSSET_XSS_STATE.gussetDemandBasis
      || !/^CF-[0-9A-F]{16}$/.test(injection.sourceFingerprint)
      || injection.reportFingerprint !== injection.sourceFingerprint
      || injection.escapeProbeImageCount !== 0 || injection.escapeProbeExecuted || !injection.escapeProbeTextVisible) {
    throw new Error(`main Gusset XSS injection should remain escaped and fingerprinted: ${JSON.stringify(injection)}`);
  }

  await assertSourceJsonReplay(cdp, sessionId, {
    label: 'main Gusset XSS source replay',
    builder: 'buildSteelConnectionSourcePayload',
    inputSelector: '#importSourceJsonInput',
    mutationSelector: 'input[name="gussetThickness"]:not([disabled])',
    sourceFieldKey: 'gussetThickness',
    statusSelector: '#exportReportStatus',
    nestedFields: false,
    escapeProbeNeedle: GUSSET_ESCAPE_PROBE,
    strictBooleanField: 'gussetStaticNonseismicConfirmed',
    updateTriggerSelector: '[name="gussetLoadPathConfirmed"]',
  });

  const popup = await openLegacyReportPopup(cdp, sessionId, 'main Gusset XSS popup', '#printReportBtn');
  try {
    const popupSnapshot = await evaluate(cdp, popup.sessionId, `(() => ({
      bodyText: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim(),
      escapeProbeImageCount: Array.from(document.querySelectorAll('img')).filter(node =>
        String(node.getAttribute('onerror') || '').includes('__steelXss')).length,
      escapeProbeExecuted: window.__steelXss === 1,
    }))()`, 'main Gusset XSS popup snapshot');
    const approvalState = await captureReportApprovalState(cdp, popup.sessionId, 'main Gusset XSS popup');
    verifySteelApprovedHtml(approvalState, 'main Gusset XSS popup');
    const approvedVisibleText = AttachmentPackageChecker.extractHtmlVisibleContent(approvalState.approvedHtml).text;
    if (popupSnapshot.escapeProbeImageCount !== 0 || popupSnapshot.escapeProbeExecuted
        || !popupSnapshot.bodyText.includes(GUSSET_ESCAPE_PROBE)
        || !approvedVisibleText.includes(GUSSET_ESCAPE_PROBE)
        || approvalState.approvedHtml.includes(GUSSET_ESCAPE_PROBE)) {
      throw new Error(`main Gusset XSS popup should preserve the probe as escaped visible text only: ${JSON.stringify(popupSnapshot)}`);
    }
  } finally {
    await cdp.send('Target.closeTarget', { targetId: popup.targetId }).catch(() => {});
  }
}

async function assertMainGussetOverflowIsolation(cdp, sessionId) {
  const blocked = await evaluate(cdp, sessionId, `(async () => {
    const overflowField = document.querySelector('input[name="gussetThickness"]:not([disabled])');
    const exportButton = document.querySelector('#exportSourceJsonBtn');
    const reportButton = document.querySelector('#printReportBtn');
    const status = document.querySelector('#exportReportStatus');
    if (!overflowField || !exportButton || !reportButton || !status) throw new Error('missing Gusset overflow controls');
    overflowField.value = String(Number.MAX_VALUE);
    overflowField.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 50));

    const result = window.latestSteelConnectionResult;
    const nonFiniteCheckKeys = (result?.checks || []).filter(check =>
      [check.demand, check.nominal, check.available, check.ratio].some(value => !Number.isFinite(value))
    ).map(check => check.key);
    const nonFiniteRows = nonFiniteCheckKeys.map(key => {
      const row = document.querySelector('#strengthCheckTableBody [data-check-key="' + key + '"]');
      return {
        key,
        dcr: row?.querySelector('[data-label="DCR"]')?.textContent?.trim() || '',
        status: row?.querySelector('[data-label="判定"]')?.textContent?.trim() || '',
      };
    });
    const collectNonFinitePaths = (value, path = '$', seen = new Set(), found = []) => {
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) found.push(path);
        return found;
      }
      if (!value || typeof value !== 'object' || seen.has(value)) return found;
      seen.add(value);
      Object.entries(value).forEach(([key, item]) => collectNonFinitePaths(item, path + '.' + key, seen, found));
      return found;
    };
    const nonFinitePaths = collectNonFinitePaths({
      checks: result?.checks,
      governing: result?.governing,
      derivedAreas: result?.derivedAreas,
    });
    let builderError = '';
    let builderJson = '';
    try {
      builderJson = JSON.stringify(window.buildSteelConnectionSourcePayload?.());
    } catch (error) {
      builderError = error?.message || String(error);
    }

    let sourceDownloadClicks = 0;
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function captureOverflowSourceDownload() {
      if (String(this.download || '').toLowerCase().endsWith('.json')) {
        sourceDownloadClicks += 1;
        return undefined;
      }
      return originalAnchorClick.apply(this, arguments);
    };
    try {
      exportButton.click();
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5000 && !(status.textContent || '').includes('來源 JSON 未匯出')) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    } finally {
      HTMLAnchorElement.prototype.click = originalAnchorClick;
    }
    const sourceStatus = status.textContent || '';

    let reportOpenCount = 0;
    const originalWindowOpen = window.open;
    window.open = () => {
      reportOpenCount += 1;
      return null;
    };
    try {
      reportButton.click();
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5000 && !(status.textContent || '').includes('正式報告未開啟')) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    } finally {
      window.open = originalWindowOpen;
    }
    const reportStatus = status.textContent || '';
    return {
      complianceReady: result?.complianceReady === true,
      passes: result?.passes === true,
      overallStatus: result?.overallStatus || '',
      strengthFailure: result?.summary?.strengthFailure === true,
      validationFailure: result?.summary?.validationFailure === true,
      failingKeys: (result?.detailChecks || []).filter(item => !item.passes).map(item => item.key),
      validations: result?.validations || [],
      nonFinitePaths,
      nonFiniteRows,
      builderError,
      builderJson,
      sourceDownloadClicks,
      sourceStatus,
      reportOpenCount,
      reportStatus,
      approvalStamp: document.querySelector('#approvalStamp')?.textContent || '',
      reportBanner: document.querySelector('#reportBanner')?.textContent?.trim() || '',
      overallMessage: document.querySelector('#overallMessage')?.textContent?.trim() || '',
    };
  })()`, 'main Gusset numeric-overflow formal output block');
  const finiteKeys = ['gussetFiniteDerivedResults', 'gussetFiniteStrengthResults'];
  if (!blocked.complianceReady || blocked.passes || blocked.overallStatus !== 'fail'
      || !blocked.strengthFailure || !blocked.validationFailure
      || finiteKeys.some(key => !blocked.failingKeys.includes(key))
      || blocked.nonFinitePaths.length === 0
      || blocked.nonFiniteRows.length === 0
      || blocked.nonFiniteRows.some(row => row.dcr !== '—' || row.status !== 'NG')
      || blocked.builderJson !== ''
      || !blocked.builderError.includes('未建立含 Infinity 或以 null 代換的正式資料')
      || blocked.sourceDownloadClicks !== 0
      || !blocked.sourceStatus.includes('來源 JSON 未匯出')
      || !blocked.sourceStatus.includes('未建立含 Infinity 或以 null 代換的正式資料')
      || blocked.reportOpenCount !== 0
      || !blocked.reportStatus.includes('正式報告未開啟')
      || !blocked.reportStatus.includes('未建立含 Infinity 或以 null 代換的正式資料')
      || blocked.approvalStamp !== '不核可'
      || blocked.reportBanner !== '檢核未通過'
      || blocked.reportBanner.includes('強度可行')
      || blocked.overallMessage.includes('強度可行')) {
    throw new Error(`main Gusset overflow must block calculation approval, source JSON, and formal report before Infinity can serialize as null: ${JSON.stringify(blocked)}`);
  }

  await setupMainGusset(cdp, sessionId);
  const replay = await evaluate(cdp, sessionId, `(async () => {
    const builder = window.buildSteelConnectionSourcePayload;
    const input = document.querySelector('#importSourceJsonInput');
    const status = document.querySelector('#exportReportStatus');
    const thickness = document.querySelector('input[name="gussetThickness"]:not([disabled])');
    if (typeof builder !== 'function' || !input || !status || !thickness) throw new Error('missing Gusset overflow replay controls');
    const baseline = builder();
    const collectNullPaths = (value, path = '$', found = []) => {
      if (value === null) {
        found.push(path);
        return found;
      }
      if (!value || typeof value !== 'object') return found;
      Object.entries(value).forEach(([key, item]) => collectNullPaths(item, path + '.' + key, found));
      return found;
    };
    const baselineNullPaths = collectNullPaths(baseline);
    const overflowSource = JSON.parse(JSON.stringify(baseline));
    overflowSource.fields.gussetThickness = Number.MAX_VALUE;
    const overflowJson = JSON.stringify(overflowSource);
    const overflowNullPaths = collectNullPaths(JSON.parse(overflowJson));
    const transfer = new DataTransfer();
    transfer.items.add(new File([overflowJson], 'gusset-overflow-source.json', { type: 'application/json' }));
    input.files = transfer.files;
    status.textContent = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5000
        && !((status.textContent || '').includes('匯入失敗')
          && (status.textContent || '').includes('Gusset 結果含非有限值或數值溢位'))) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const after = builder();
    const afterJson = JSON.stringify(after);
    return {
      baselineFingerprint: baseline.calculationFingerprint,
      afterFingerprint: after.calculationFingerprint,
      thicknessValue: thickness.value,
      status: status.textContent || '',
      inputCleared: input.value === '',
      overflowFieldSerializedAsFiniteNumber: overflowJson.includes('"gussetThickness":1.7976931348623157e+308'),
      overflowJsonContainsInfinity: overflowJson.includes('Infinity'),
      baselineNullPaths,
      overflowNullPaths,
      afterJsonContainsInfinity: afterJson.includes('Infinity'),
      afterNullPaths: collectNullPaths(JSON.parse(afterJson)),
      selectedType: document.querySelector('select[name="connectionType"]')?.value || '',
      gussetVisible: !document.querySelector('[data-connection="brace_gusset"]')?.classList.contains('is-hidden'),
    };
  })()`, 'main Gusset numeric-overflow source replay rejection');
  if (replay.afterFingerprint !== replay.baselineFingerprint
      || replay.thicknessValue !== String(GUSSET_FORMAL_STATE.gussetThickness)
      || !replay.status.includes('匯入失敗，已保留原輸入')
      || !replay.status.includes('拒絕以 Infinity 或 JSON null 代換建立正式來源')
      || !replay.inputCleared
      || !replay.overflowFieldSerializedAsFiniteNumber
      || replay.overflowJsonContainsInfinity
      || JSON.stringify(replay.overflowNullPaths) !== JSON.stringify(replay.baselineNullPaths)
      || replay.afterJsonContainsInfinity
      || JSON.stringify(replay.afterNullPaths) !== JSON.stringify(replay.baselineNullPaths)
      || replay.selectedType !== 'brace_gusset'
      || !replay.gussetVisible) {
    throw new Error(`main Gusset overflow source import must reject transactionally without Infinity-to-null serialization: ${JSON.stringify(replay)}`);
  }
}

async function assertMainGussetReportPopup(cdp, sessionId, context = {}) {
  await assertMainGussetReady(cdp, sessionId);
  await assertMainGussetOverflowIsolation(cdp, sessionId);
  await assertMainGussetReady(cdp, sessionId);
  await assertMainGussetXssIsolation(cdp, sessionId);
  await setupMainGusset(cdp, sessionId);
  await assertMainGussetReady(cdp, sessionId);
  return assertLegacyReportPopup(cdp, sessionId, {
    label: 'main Gusset report popup',
    buttonSelector: '#printReportBtn',
    titleNeedle: 'Gusset 接頭檢核計算書',
    headerNeedle: '支撐 / Gusset 接頭檢核計算書',
    expectedProject: {
      name: GUSSET_FORMAL_STATE.projectName,
      tag: GUSSET_FORMAL_STATE.connectionTag,
      designer: GUSSET_FORMAL_STATE.designer,
    },
    sourcePayloadBuilder: 'buildSteelConnectionSourcePayload',
    sourceReplay: {
      builder: 'buildSteelConnectionSourcePayload', inputSelector: '#importSourceJsonInput',
      mutationSelector: 'input[name="gussetThickness"]:not([disabled])', sourceFieldKey: 'gussetThickness',
      statusSelector: '#exportReportStatus', nestedFields: false,
      strictBooleanField: 'gussetStaticNonseismicConfirmed',
      updateTriggerSelector: '[name="gussetLoadPathConfirmed"]',
      reportTamper: true,
      crossModuleBeforeImport: 'single_plate',
    },
    expectedSourceFields: {
      connectionType: 'brace_gusset',
      requiredAxial: 400,
      requiredShear: 0,
      requiredMoment: 0,
      eccentricity: 0,
      boltDiameter: 20,
      holeDiameter: 21.5,
      boltUltimateStrength: 1000,
      boltGrade: 'F10T',
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
      braceSectionType: 'flat_plate',
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
      gussetDemandBasis: GUSSET_FORMAL_STATE.gussetDemandBasis,
      gussetGeometryBasis: GUSSET_FORMAL_STATE.gussetGeometryBasis,
      gussetMaterialBasis: GUSSET_FORMAL_STATE.gussetMaterialBasis,
      gussetModelBasis: GUSSET_FORMAL_STATE.gussetModelBasis,
      gussetStaticNonseismicConfirmed: true,
      gussetLoadPathConfirmed: true,
    },
    artifactRequiredNeedles: GUSSET_ARTIFACT_REQUIRED_NEEDLES,
    reportOnlyRequiredNeedles: [
      '支撐 / Gusset 接頭檢核計算書',
      'F10T 承壓式螺栓標稱剪應力依表 10.3-2',
      '含牙 4.00 tf/cm²、不含牙 5.00 tf/cm²',
      'V1 在尚未實作長接合路線前保守援用 Lconn ≤ 1250 mm，並非一般接合的條文上限',
      '三段不得視為並聯容量',
    ],
    domAndTextRequiredNeedles: ['392.266 MPa', 'Whitmore Lconn / 理論 / 可用有效寬度'],
    absentNeedles: [GUSSET_ESCAPE_PROBE],
    continuationContextLabels: ['Fub 1000 MPa', '材料資料來源', 'Whitmore 有效寬度', 'Gusset 塊狀撕裂', '支撐材塊狀撕裂', '銲腳尺寸 a'],
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-main-gusset' : '',
  });
}

async function assertMainMomentReady(cdp, sessionId) {
  const snapshot = await evaluate(cdp, sessionId, `(() => {
    const result = window.latestSteelConnectionResult;
    const payload = window.buildSteelConnectionSourcePayload?.();
    const calculate = window.ShearConnectionCalculator?.calculateConnection;
    const summarizeGate = (candidate) => ({
      passes: candidate?.passes === true,
      overallStatus: candidate?.overallStatus || '',
      failingKeys: (candidate?.detailChecks || []).filter(item => !item.passes).map(item => item.key),
    });
    const probe = (overrides) => summarizeGate(calculate({ ...result.state, ...overrides }));
    const gateProbes = typeof calculate === 'function' && result?.state ? {
      hardwareUnconfirmed: probe({ momentConnectionHardwareVerifiedConfirmed: false }),
      orthogonalDirectionUnconfirmed: probe({ momentOrthogonalDirectionSeparateConfirmed: false }),
      invalidQualificationHash: probe({ momentQualificationEvidenceSha256: 'not-a-sha256' }),
      invalidCapacityHash: probe({ momentCapacityEvidenceSha256: 'not-a-sha256' }),
    } : null;
    return {
      connectionType: result?.state?.connectionType || '',
      complianceReady: result?.complianceReady === true,
      passes: result?.passes === true,
      completeJointDesign: result?.completeJointDesign,
      scopeLimited: result?.scopeLimited,
      checkKeys: (result?.checks || []).map(item => item.key),
      detailFailureCount: (result?.detailChecks || []).filter(item => !item.passes).length,
      validationFailure: result?.summary?.validationFailure === true,
      seismicReview: result?.seismicReview || null,
      project: payload?.project || null,
      tool: payload?.tool || null,
      fields: payload?.fields || null,
      sourceFingerprint: payload?.calculationFingerprint || '',
      reportFingerprint: payload?.report?.calculationFingerprint || '',
      selectedType: document.querySelector('select[name="connectionType"]')?.value || '',
      optionDisabled: document.querySelector('select[name="connectionType"] option[value="beam_column_moment"]')?.disabled === true,
      momentCardVisible: !document.querySelector('[data-connection="beam_column_moment"]')?.classList.contains('is-hidden'),
      strengthRows: Array.from(document.querySelectorAll('#strengthCheckTableBody [data-check-key]')).map(row => row.dataset.checkKey),
      reportBanner: document.querySelector('#reportBanner')?.textContent?.trim() || '',
      gateProbes,
    };
  })()`, 'main beam-column moment formal verification state');

  const expectedProject = {
    name: MOMENT_FORMAL_STATE.projectName,
    no: MOMENT_FORMAL_STATE.connectionTag,
    designer: MOMENT_FORMAL_STATE.designer,
  };
  if (snapshot.connectionType !== 'beam_column_moment' || snapshot.selectedType !== 'beam_column_moment'
      || snapshot.optionDisabled || !snapshot.momentCardVisible || !snapshot.complianceReady || !snapshot.passes
      || snapshot.completeJointDesign !== false || snapshot.scopeLimited !== false
      || snapshot.validationFailure || snapshot.detailFailureCount !== 0) {
    throw new Error(`main beam-column moment should be a ready fail-closed formal attachment with explicit incomplete-joint boundary: ${JSON.stringify(snapshot)}`);
  }
  const expectedStrengthKeys = [...MOMENT_STRENGTH_KEYS].sort();
  if (JSON.stringify([...snapshot.checkKeys].sort()) !== JSON.stringify(expectedStrengthKeys)
      || JSON.stringify([...snapshot.strengthRows].sort()) !== JSON.stringify(expectedStrengthKeys)) {
    throw new Error(`main beam-column moment should expose exactly six fixed strength routes in both result and rendered table: ${JSON.stringify(snapshot)}`);
  }
  const seismic = snapshot.seismicReview || {};
  const goldenValues = {
    Mp: 700,
    Mpr: 770,
    MprFar: 770,
    Vp: 440,
    MuFace: 902,
    VuRequired: 560,
    rotationDemand: 0.03,
    VpzMin: 2200,
    VpzRequired: 2200,
    VpzNominal: 2340,
    panelThicknessRequired: 10,
    continuityThreshold: 2520,
    scwbCw: 2300 / 1670,
    scwbCcw: 2340 / 1675,
  };
  for (const [key, expectedValue] of Object.entries(goldenValues)) {
    if (Math.abs(Number(seismic[key]) - expectedValue) > 1e-12) {
      throw new Error(`main beam-column moment seismic golden ${key} drifted: ${JSON.stringify({ expectedValue, actualValue: seismic[key], seismic })}`);
    }
  }
  if (JSON.stringify(snapshot.project) !== JSON.stringify(expectedProject)
      || String(snapshot.tool?.version || '').toUpperCase() !== 'V1.3'
      || Object.keys(snapshot.fields || {}).length !== 88
      || snapshot.fields?.momentFarCriticalSectionExpectedMoment !== 770
      || snapshot.fields?.momentQualificationEvidenceSha256 !== MOMENT_FORMAL_STATE.momentQualificationEvidenceSha256
      || snapshot.fields?.momentCapacityEvidenceSha256 !== MOMENT_FORMAL_STATE.momentCapacityEvidenceSha256
      || !/^CF-[0-9A-F]{16}$/.test(snapshot.sourceFingerprint)
      || snapshot.reportFingerprint !== snapshot.sourceFingerprint) {
    throw new Error(`main beam-column moment 88-field source/project/version/fingerprint trace mismatch: ${JSON.stringify(snapshot)}`);
  }
  for (const [key, expectedValue] of Object.entries(MOMENT_EXPECTED_SOURCE_FIELDS)) {
    if (snapshot.fields?.[key] !== expectedValue) {
      throw new Error(`main beam-column moment source field ${key} mismatch: ${JSON.stringify({ expectedValue, actualValue: snapshot.fields?.[key] })}`);
    }
  }
  const gateExpectations = {
    hardwareUnconfirmed: 'momentConnectionHardwareVerifiedConfirmed',
    orthogonalDirectionUnconfirmed: 'momentOrthogonalDirectionSeparateConfirmed',
    invalidQualificationHash: 'momentQualificationEvidenceSha256',
    invalidCapacityHash: 'momentCapacityEvidenceSha256',
  };
  for (const [probeName, failingKey] of Object.entries(gateExpectations)) {
    const probeResult = snapshot.gateProbes?.[probeName];
    if (!probeResult || probeResult.passes || probeResult.overallStatus !== 'fail' || !probeResult.failingKeys.includes(failingKey)) {
      throw new Error(`main beam-column moment ${probeName} must fail closed at ${failingKey}: ${JSON.stringify(snapshot.gateProbes)}`);
    }
  }
}

async function assertMainMomentReportPopup(cdp, sessionId, context = {}) {
  await assertMainMomentReady(cdp, sessionId);
  if (context.viewport?.label === 'desktop') {
    await verifySteelNgSourceFileRoundTrip(cdp, sessionId, {
      key: 'steel-main-moment-ng-source',
      label: 'main beam-column moment self-produced NG source',
      ngOverrides: {
        momentCwRightBeamMoment: 0,
        momentAvailableFlexuralStrength: 800,
        momentConnectionHardwareVerifiedConfirmed: 'false',
      },
      recoveryOverrides: {
        momentCwRightBeamMoment: 830,
        momentAvailableFlexuralStrength: 950,
        momentConnectionHardwareVerifiedConfirmed: 'true',
      },
      updateTriggerSelector: '[name="momentSelectedAxisScopeConfirmed"]',
      expectedFailingDetailKeys: ['momentConnectionHardwareVerifiedConfirmed'],
      expectedFailingStrengthKeys: ['momentFlexuralStrength'],
      expectedNgStateValues: {
        momentCwRightBeamMoment: 0,
        momentAvailableFlexuralStrength: 800,
        momentConnectionHardwareVerifiedConfirmed: false,
      },
    });
    await setupMainMoment(cdp, sessionId);
    await assertMainMomentReady(cdp, sessionId);
  }
  return assertLegacyReportPopup(cdp, sessionId, {
    label: 'main beam-column moment report popup',
    buttonSelector: '#printReportBtn',
    titleNeedle: '梁柱彎矩接頭耐震能力審查附件',
    expectedProject: {
      name: MOMENT_FORMAL_STATE.projectName,
      tag: MOMENT_FORMAL_STATE.connectionTag,
      designer: MOMENT_FORMAL_STATE.designer,
    },
    sourcePayloadBuilder: 'buildSteelConnectionSourcePayload',
    sourceReplay: {
      builder: 'buildSteelConnectionSourcePayload', inputSelector: '#importSourceJsonInput',
      mutationSelector: 'input[name="momentPanelZoneThickness"]:not([disabled])', sourceFieldKey: 'momentPanelZoneThickness',
      statusSelector: '#exportReportStatus', nestedFields: false,
      strictBooleanField: 'momentSelectedAxisScopeConfirmed',
      updateTriggerSelector: '[name="momentSelectedAxisScopeConfirmed"]',
      reportTamper: true,
      crossModuleBeforeImport: 'single_plate',
      exactFieldSchemaProbes: true,
      schemaProbeMissingField: 'momentBeamPlasticModulus',
      wrongEnumField: 'momentFrameSystem',
      wrongEnumValue: 'brbf',
    },
    expectedSourceFields: MOMENT_EXPECTED_SOURCE_FIELDS,
    expectedSourceFieldCount: 88,
    visibleCalculationCheckKeys: MOMENT_STRENGTH_KEYS,
    artifactRequiredNeedles: MOMENT_ARTIFACT_REQUIRED_NEEDLES,
    domAndTextRequiredNeedles: [
      'Mpr,far / Vp / Mu,face / Vu,req',
      '提供值 0.95 未超過規定上限 1',
      '提供值 0.76 已不小於規定值 0.75',
    ],
    textOnlyRequiredNeedles: ['需求值：0.03 rad｜可用強度：0.04 rad'],
    expectedCheckRows: [
      { label: '塑性轉角資格', demand: '0.03 rad', available: '0.04 rad' },
    ],
    reportOnlyRequiredNeedles: [
      'AISC 358 family / prequalification',
      'Mpr,far 屬需求/構架模型輸入',
      '接頭螺栓、端板、prying action、yield-line、焊道與其他局部容量均由外部受控來源提供',
    ],
    continuationContextLabels: ['Mpr,far', 'Panel Zone', 'Continuity Plate', '資格證據 SHA-256', '容量證據 SHA-256'],
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-main-moment' : '',
  });
}

async function assertMainTensionReportPopup(cdp, sessionId, context = {}) {
  return assertLegacyReportPopup(cdp, sessionId, {
    label: 'main tension report popup',
    buttonSelector: '#printReportBtn',
    titleNeedle: '拉力構件檢核計算書',
    expectedProject: {
      name: LEGACY_TENSION_PROJECT_META.projectName,
      tag: LEGACY_TENSION_PROJECT_META.connectionTag,
      designer: LEGACY_TENSION_PROJECT_META.designer,
    },
    sourcePayloadBuilder: 'buildSteelConnectionSourcePayload',
    sourceReplay: {
      builder: 'buildSteelConnectionSourcePayload', inputSelector: '#importSourceJsonInput',
      mutationSelector: 'input[name="memberThickness"]:not([disabled])', sourceFieldKey: 'memberThickness',
      statusSelector: '#exportReportStatus', nestedFields: false,
    },
    continuationContextLabels: ['Fu 490 MPa'],
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-main-tension' : '',
  });
}

async function assertStandalonePlateReportPopup(cdp, sessionId, context = {}) {
  return assertLegacyReportPopup(cdp, sessionId, {
    label: 'standalone plate report popup',
    buttonSelector: '#printReportBtn',
    titleNeedle: '連接板檢核計算書',
    expectedProject: {
      name: LEGACY_STANDALONE_PLATE_PROJECT_META.projectName,
      tag: LEGACY_STANDALONE_PLATE_PROJECT_META.connectionTag,
      designer: LEGACY_STANDALONE_PLATE_PROJECT_META.designer,
    },
    sourcePayloadBuilder: 'buildSteelConnectionSourcePayload',
    sourceReplay: {
      builder: 'buildSteelConnectionSourcePayload', inputSelector: '#importSourceJsonInput',
      mutationSelector: 'input[name="plateThickness"]:not([disabled])', sourceFieldKey: 'plateThickness',
      statusSelector: '#exportReportStatus', nestedFields: false,
    },
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-standalone-plate' : '',
  });
}

async function assertFormalColumnReadiness(cdp, sessionId) {
  await assertFormalReportReadiness(cdp, sessionId, '#columnReportReadiness', 'column report readiness');
  await assertFormalReportReadinessText(cdp, sessionId, '#columnReportReadiness', '計畫名稱 / 編號 / 設計人尚未完整', 'column missing project metadata note');
  await assertFormalProjectMetaPlaceholderRendered(cdp, sessionId, {
    nameId: '#columnMetaProjectName',
    noId: '#columnMetaProjectNo',
    designerId: '#columnMetaDesigner',
  }, 'column placeholder project meta render');
}

async function assertFormalColumnReadinessMetaComplete(cdp, sessionId) {
  await assertFormalReportReadiness(cdp, sessionId, '#columnReportReadiness', 'column report readiness after metadata');
  await assertFormalReportReadinessTextAbsent(cdp, sessionId, '#columnReportReadiness', '計畫名稱 / 編號 / 設計人尚未完整', 'column metadata warning should clear');
  await assertFormalProjectMetaRendered(cdp, sessionId, {
    nameId: '#columnMetaProjectName',
    noId: '#columnMetaProjectNo',
    designerId: '#columnMetaDesigner',
  }, 'column project meta render');
}

async function assertFormalColumnReadinessBlocked(cdp, sessionId) {
  await assertFormalReportReadinessBlocked(cdp, sessionId, '#columnReportReadiness', 'column report readiness');
}

async function assertFormalColumnReportPopupComplete(cdp, sessionId, context = {}) {
  return assertFormalReportPopup(cdp, sessionId, {
    label: 'column formal report popup',
    buttonSelector: '#printReportBtn',
    titleNeedle: '鋼柱正式規範核算計算書',
    expectedProject: {
      name: FORMAL_PROJECT_META.projName,
      no: FORMAL_PROJECT_META.projNo,
      designer: FORMAL_PROJECT_META.projDesigner,
    },
    sourcePayloadBuilder: 'buildColumnSourcePayload',
    sourceReplay: {
      builder: 'buildColumnSourcePayload', inputSelector: '#inputImportSourceJson', mutationSelector: '#inFy',
      sourceFieldKey: 'inFy', statusSelector: '#columnInputStatus', nestedFields: true,
    },
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-column-formal' : '',
  });
}

async function assertFormalColumnReportPopupPlaceholder(cdp, sessionId) {
  return assertFormalReportPopup(cdp, sessionId, {
    label: 'column formal report popup placeholder',
    titleNeedle: '鋼柱正式規範核算計算書',
    expectedProject: {
      name: '',
      no: FORMAL_PROJECT_META_PLACEHOLDER.projNo,
      designer: FORMAL_PROJECT_META_PLACEHOLDER.projDesigner,
    },
    absentNeedles: ['未填'],
  });
}

async function assertFormalReportReadiness(cdp, sessionId, selector, label) {
  const text = await evaluate(cdp, sessionId, `(() => {
    const text = document.querySelector('${selector}')?.innerText || '';
    if (!text.includes('優先閱讀')) {
      throw new Error('${label} missing 優先閱讀: ' + text);
    }
    if (!text.includes('不會寫入計算書或列印 PDF')) {
      throw new Error('${label} missing print boundary note: ' + text);
    }
    return text;
  })()`, label);
  if (text.includes('[object Event]')) {
    throw new Error(`${label} should not stringify DOM events: ${text}`);
  }
  await assertPageOnlyReadinessHiddenInPrint(cdp, sessionId, selector, label);
}

async function assertFormalReportReadinessBlocked(cdp, sessionId, selector, label) {
  const text = await evaluate(cdp, sessionId, `(() => {
    const text = document.querySelector('${selector}')?.innerText || '';
    if (!text.includes('暫勿作附件')) {
      throw new Error('${label} missing blocked badge: ' + text);
    }
    if (!text.includes('不會寫入計算書或列印 PDF')) {
      throw new Error('${label} missing print boundary note: ' + text);
    }
    return text;
  })()`, `${label} blocked`);
  if (text.includes('[object Event]')) {
    throw new Error(`${label} should not stringify DOM events: ${text}`);
  }
  await assertPageOnlyReadinessHiddenInPrint(cdp, sessionId, selector, `${label} blocked`);
}

async function assertPageOnlyReadinessHiddenInPrint(cdp, sessionId, selector, label) {
  await cdp.send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
  await wait(100);
  try {
    const printState = await evaluate(cdp, sessionId, `(() => {
      const node = document.querySelector('${selector}');
      if (!node) {
        return { exists: false, targetDisplay: '', wrapperDisplay: '', visibility: '', text: '' };
      }
      const wrapper = node.closest('.page-only-report-status') || node;
      const wrapperStyle = window.getComputedStyle(wrapper);
      const targetStyle = window.getComputedStyle(node);
      return {
        exists: true,
        targetDisplay: targetStyle.display || '',
        wrapperDisplay: wrapperStyle.display || '',
        visibility: wrapperStyle.visibility || '',
        text: (wrapper.innerText || wrapper.textContent || '').replace(/\\s+/g, ' ').trim()
      };
    })()`);
    if (!printState.exists) {
      throw new Error(`${label} missing readiness node in print DOM`);
    }
    if (printState.wrapperDisplay !== 'none') {
      throw new Error(`${label} page-only readiness still visible in print: ${JSON.stringify(printState)}`);
    }
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { media: 'screen' }, sessionId).catch(() => {});
    await wait(100);
  }
}

async function assertFormalReportReadinessText(cdp, sessionId, selector, expectedText, label) {
  await evaluate(cdp, sessionId, `(() => {
    const text = document.querySelector('${selector}')?.innerText || '';
    if (!text.includes('${expectedText}')) {
      throw new Error('${label} missing: ' + text);
    }
    return text;
  })()`, label);
}

async function assertFormalReportReadinessTextAbsent(cdp, sessionId, selector, unexpectedText, label) {
  await evaluate(cdp, sessionId, `(() => {
    const text = document.querySelector('${selector}')?.innerText || '';
    if (text.includes('${unexpectedText}')) {
      throw new Error('${label}: ' + text);
    }
    return text;
  })()`, label);
}

async function assertFormalProjectMetaRendered(cdp, sessionId, selectors, label) {
  const meta = await evaluate(cdp, sessionId, `(() => ({
    name: document.querySelector(${JSON.stringify(selectors.nameId)})?.innerText?.trim() || '',
    no: document.querySelector(${JSON.stringify(selectors.noId)})?.innerText?.trim() || '',
    designer: document.querySelector(${JSON.stringify(selectors.designerId)})?.innerText?.trim() || '',
  }))()`, label);
  if (meta.name !== FORMAL_PROJECT_META.projName || meta.no !== FORMAL_PROJECT_META.projNo || meta.designer !== FORMAL_PROJECT_META.projDesigner) {
    throw new Error(`${label} mismatch: ${JSON.stringify(meta)}`);
  }
}

async function assertFormalProjectMetaPlaceholderRendered(cdp, sessionId, selectors, label) {
  const meta = await evaluate(cdp, sessionId, `(() => ({
    name: document.querySelector(${JSON.stringify(selectors.nameId)})?.innerText?.trim() || '',
    no: document.querySelector(${JSON.stringify(selectors.noId)})?.innerText?.trim() || '',
    designer: document.querySelector(${JSON.stringify(selectors.designerId)})?.innerText?.trim() || '',
  }))()`, label);
  if (meta.name !== '—' || meta.no !== '—' || meta.designer !== '—') {
    throw new Error(`${label} mismatch: ${JSON.stringify(meta)}`);
  }
}

async function assertSourceJsonReplay(cdp, sessionId, options) {
  const state = await evaluate(cdp, sessionId, `(async () => {
    const source = window.__steelSourceReplayPayload;
    const serializedSource = JSON.parse(JSON.stringify(source));
    const builder = window[${JSON.stringify(options.builder)}];
    const input = document.querySelector(${JSON.stringify(options.inputSelector)});
    const field = document.querySelector(${JSON.stringify(options.mutationSelector)});
    const status = document.querySelector(${JSON.stringify(options.statusSelector)});
    if (!source || typeof builder !== 'function' || !input || !field || !status) {
      throw new Error('source replay prerequisites missing');
    }
    const escapeProbeNeedle = ${JSON.stringify(options.escapeProbeNeedle || '')};
    const expectedValue = ${options.nestedFields
      ? `source.fields?.[${JSON.stringify(options.sourceFieldKey)}]?.value`
      : `source.fields?.[${JSON.stringify(options.sourceFieldKey)}]`};
    if (expectedValue === undefined) throw new Error('source replay field missing');
    const describeValue = (value, present = true) => {
      if (!present) return { type: 'missing', value: '<missing>' };
      if (value === undefined) return { type: 'undefined', value: '<undefined>' };
      if (typeof value === 'number' && !Number.isFinite(value)) return { type: 'non-finite-number', value: String(value) };
      if (value === null) return { type: 'null', value: null };
      return { type: Array.isArray(value) ? 'array' : typeof value, value };
    };
    const firstDifference = (payloadValue, replayValue, currentPath = 'report') => {
      if (Object.is(payloadValue, replayValue)) return null;
      if (Array.isArray(payloadValue) || Array.isArray(replayValue)) {
        if (!Array.isArray(payloadValue) || !Array.isArray(replayValue)) {
          return { path: currentPath, payload: describeValue(payloadValue), replay: describeValue(replayValue) };
        }
        if (payloadValue.length !== replayValue.length) {
          return { path: currentPath + '.length', payload: describeValue(payloadValue.length), replay: describeValue(replayValue.length) };
        }
        for (let index = 0; index < payloadValue.length; index += 1) {
          const difference = firstDifference(payloadValue[index], replayValue[index], currentPath + '[' + index + ']');
          if (difference) return difference;
        }
        return null;
      }
      const payloadObject = payloadValue && typeof payloadValue === 'object';
      const replayObject = replayValue && typeof replayValue === 'object';
      if (!payloadObject || !replayObject) {
        return { path: currentPath, payload: describeValue(payloadValue), replay: describeValue(replayValue) };
      }
      const keys = Array.from(new Set([...Object.keys(payloadValue), ...Object.keys(replayValue)])).sort();
      for (const key of keys) {
        const payloadHasKey = Object.prototype.hasOwnProperty.call(payloadValue, key);
        const replayHasKey = Object.prototype.hasOwnProperty.call(replayValue, key);
        if (!payloadHasKey || !replayHasKey) {
          return {
            path: currentPath + '.' + key,
            payload: describeValue(payloadValue[key], payloadHasKey),
            replay: describeValue(replayValue[key], replayHasKey),
          };
        }
        const difference = firstDifference(payloadValue[key], replayValue[key], currentPath + '.' + key);
        if (difference) return difference;
      }
      return null;
    };
    const triggerImport = async (payload, statusNeedle) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify(payload)], 'calculation-source.json', { type: 'application/json' }));
      input.files = transfer.files;
      status.textContent = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5000) {
        if ((status.textContent || '').includes(statusNeedle)) return { matched: true, text: status.textContent || '' };
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return { matched: false, text: status.textContent || '' };
    };
    let reportDifference = null;
    if (['single_plate', 'column_splice', 'brace_gusset', 'beam_column_moment'].includes(serializedSource.connectionType) && ${options.nestedFields ? 'false' : 'true'}) {
      Object.entries(serializedSource.fields || {}).forEach(([name, value]) => {
        const sourceField = document.querySelector('[name="' + name + '"]');
        if (!sourceField) throw new Error('missing strict replay field [name="' + name + '"]');
        sourceField.value = String(value);
      });
      const updateTrigger = document.querySelector(${JSON.stringify(options.updateTriggerSelector || '[name="connectionModelConfirmed"]')});
      if (!updateTrigger) throw new Error('missing strict replay update trigger');
      updateTrigger.dispatchEvent(new Event('change', { bubbles: true }));
      reportDifference = firstDifference(
        serializedSource.report,
        JSON.parse(JSON.stringify(builder()?.report || null))
      );
    }
    const snapshotModuleState = () => {
      const current = builder();
      const selectedType = document.querySelector('select[name="connectionType"]')?.value || '';
      const gussetCard = document.querySelector('[data-connection="brace_gusset"]');
      const shearTabCard = document.querySelector('[data-connection="single_plate"]');
      const momentCard = document.querySelector('[data-connection="beam_column_moment"]');
      const spliceCard = document.querySelector('[data-connection="column_splice"]');
      return {
        connectionType: current?.connectionType || '',
        calculationFingerprint: current?.calculationFingerprint || '',
        selectedType,
        gussetVisible: Boolean(gussetCard && !gussetCard.classList.contains('is-hidden')),
        shearTabVisible: Boolean(shearTabCard && !shearTabCard.classList.contains('is-hidden')),
        momentVisible: Boolean(momentCard && !momentCard.classList.contains('is-hidden')),
        spliceVisible: Boolean(spliceCard && !spliceCard.classList.contains('is-hidden')),
      };
    };
    const crossModuleBeforeImport = ${JSON.stringify(options.crossModuleBeforeImport || '')};
    let crossModule = null;
    if (crossModuleBeforeImport) {
      const connectionTypeSelect = document.querySelector('select[name="connectionType"]');
      const preset = document.querySelector('#examplePresetSelect');
      const loadButton = document.querySelector('#loadExampleBtn');
      if (!connectionTypeSelect || !preset || !loadButton) throw new Error('cross-module replay controls missing');
      connectionTypeSelect.value = crossModuleBeforeImport;
      connectionTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      preset.value = crossModuleBeforeImport === 'single_plate' ? 'single_plate_standard' : '';
      preset.dispatchEvent(new Event('change', { bubbles: true }));
      loadButton.click();
      await new Promise(resolve => setTimeout(resolve, 50));
      const baseline = snapshotModuleState();

      const invalidCrossVersion = JSON.parse(JSON.stringify(serializedSource));
      invalidCrossVersion.tool.version = 'V999.0';
      const versionRejected = await triggerImport(invalidCrossVersion, '工具版本不符');
      const afterVersionReject = snapshotModuleState();

      const invalidCrossReport = JSON.parse(JSON.stringify(serializedSource));
      invalidCrossReport.report.title = String(invalidCrossReport.report.title || '') + ' [cross-module-tampered]';
      const reportRejected = await triggerImport(invalidCrossReport, '內嵌報告內容與來源欄位重算結果不一致');
      const afterReportReject = snapshotModuleState();
      crossModule = {
        baseline,
        versionRejectedStatus: versionRejected.text,
        afterVersionReject,
        reportRejectedStatus: reportRejected.text,
        afterReportReject,
      };
    }
    field.value = String(Number(expectedValue) + 17);
    field.dispatchEvent(new Event('change', { bubbles: true }));
    const success = await triggerImport(serializedSource, '已匯入並重現計算');
    if (!success.matched) {
      return {
        importFailed: true,
        successStatus: success.text,
        reportDifference,
        sourceFingerprint: serializedSource.calculationFingerprint,
        inputCleared: input.value === '',
      };
    }
    const replay = builder();
    const restoredValue = field.value;
    const afterSuccessfulReplay = snapshotModuleState();
    const invalid = JSON.parse(JSON.stringify(serializedSource));
    invalid.tool.version = 'V999.0';
    const beforeReject = builder().calculationFingerprint;
    const rejected = await triggerImport(invalid, '工具版本不符');
    const afterReject = builder().calculationFingerprint;
    const strictBooleanField = ${JSON.stringify(options.strictBooleanField || '')};
    let booleanRejected = { matched: true, text: '' };
    let beforeBooleanReject = afterReject;
    let afterBooleanReject = afterReject;
    if (strictBooleanField) {
      const invalidBoolean = JSON.parse(JSON.stringify(serializedSource));
      invalidBoolean.fields[strictBooleanField] = String(invalidBoolean.fields[strictBooleanField]);
      beforeBooleanReject = builder().calculationFingerprint;
      booleanRejected = await triggerImport(invalidBoolean, strictBooleanField + ' 必須為布林值');
      afterBooleanReject = builder().calculationFingerprint;
    }
    const reportTamper = ${options.reportTamper ? 'true' : 'false'};
    let reportTamperRejected = { matched: true, text: '' };
    let beforeReportTamperReject = afterBooleanReject;
    let afterReportTamperReject = afterBooleanReject;
    if (reportTamper) {
      const invalidReport = JSON.parse(JSON.stringify(serializedSource));
      invalidReport.report.title = String(invalidReport.report.title || '') + ' [tampered]';
      beforeReportTamperReject = builder().calculationFingerprint;
      reportTamperRejected = await triggerImport(invalidReport, '內嵌報告內容與來源欄位重算結果不一致');
      afterReportTamperReject = builder().calculationFingerprint;
    }
    const exactFieldSchemaProbes = ${options.exactFieldSchemaProbes ? 'true' : 'false'};
    const schemaProbeMissingField = ${JSON.stringify(options.schemaProbeMissingField || '')};
    let extraFieldRejected = { matched: true, text: '' };
    let missingFieldRejected = { matched: true, text: '' };
    let beforeExtraFieldReject = afterReportTamperReject;
    let afterExtraFieldReject = afterReportTamperReject;
    let beforeMissingFieldReject = afterReportTamperReject;
    let afterMissingFieldReject = afterReportTamperReject;
    if (exactFieldSchemaProbes) {
      const invalidExtraField = JSON.parse(JSON.stringify(serializedSource));
      invalidExtraField.fields.__unexpectedFormalField = 1;
      beforeExtraFieldReject = builder().calculationFingerprint;
      extraFieldRejected = await triggerImport(invalidExtraField, '欄位集合不符');
      afterExtraFieldReject = builder().calculationFingerprint;

      const invalidMissingField = JSON.parse(JSON.stringify(serializedSource));
      delete invalidMissingField.fields[schemaProbeMissingField];
      beforeMissingFieldReject = builder().calculationFingerprint;
      missingFieldRejected = await triggerImport(invalidMissingField, '欄位集合不符');
      afterMissingFieldReject = builder().calculationFingerprint;
    }
    const wrongEnumField = ${JSON.stringify(options.wrongEnumField || '')};
    const wrongEnumValue = ${JSON.stringify(options.wrongEnumValue || '')};
    let wrongEnumRejected = { matched: true, text: '' };
    let beforeWrongEnumReject = afterMissingFieldReject;
    let afterWrongEnumReject = afterMissingFieldReject;
    if (wrongEnumField) {
      const invalidEnum = JSON.parse(JSON.stringify(serializedSource));
      invalidEnum.fields[wrongEnumField] = wrongEnumValue;
      beforeWrongEnumReject = builder().calculationFingerprint;
      wrongEnumRejected = await triggerImport(invalidEnum, wrongEnumField + ' 列舉值不支援');
      afterWrongEnumReject = builder().calculationFingerprint;
    }
    return {
      sourceConnectionType: serializedSource.connectionType,
      expectedValue: String(expectedValue),
      restoredValue: String(restoredValue),
      sourceFingerprint: serializedSource.calculationFingerprint,
      replayFingerprint: replay?.calculationFingerprint || '',
      successStatus: success.text,
      rejectedStatus: rejected.text,
      booleanRejectedStatus: booleanRejected.text,
      reportTamperRejectedStatus: reportTamperRejected.text,
      extraFieldRejectedStatus: extraFieldRejected.text,
      missingFieldRejectedStatus: missingFieldRejected.text,
      wrongEnumRejectedStatus: wrongEnumRejected.text,
      reportDifference,
      crossModule,
      afterSuccessfulReplay,
      beforeReject,
      afterReject,
      beforeBooleanReject,
      afterBooleanReject,
      beforeReportTamperReject,
      afterReportTamperReject,
      beforeExtraFieldReject,
      afterExtraFieldReject,
      beforeMissingFieldReject,
      afterMissingFieldReject,
      beforeWrongEnumReject,
      afterWrongEnumReject,
      inputCleared: input.value === '',
      escapeProbeImageCount: escapeProbeNeedle
        ? Array.from(document.querySelectorAll('img')).filter(node => String(node.getAttribute('onerror') || '').includes('__steelXss')).length
        : 0,
      escapeProbeExecuted: escapeProbeNeedle ? window.__steelXss === 1 : false,
      escapeProbeTextVisible: escapeProbeNeedle ? (document.body?.innerText || '').includes(escapeProbeNeedle) : true,
    };
  })()`, `${options.label} source JSON replay`);
  if (state.importFailed) {
    throw new Error(`${options.label} source replay failed: ${state.successStatus}; first payload.report/replay.report difference=${JSON.stringify(state.reportDifference)}`);
  }
  if (state.reportDifference) {
    throw new Error(`${options.label} source report did not reproduce from its fields before import: ${JSON.stringify(state.reportDifference)}`);
  }
  if (state.restoredValue !== state.expectedValue || state.replayFingerprint !== state.sourceFingerprint) {
    throw new Error(`${options.label} source replay mismatch: ${JSON.stringify(state)}`);
  }
  if (!state.successStatus.includes(state.sourceFingerprint) || !state.rejectedStatus.includes('已保留原輸入')) {
    throw new Error(`${options.label} source replay status mismatch: ${JSON.stringify(state)}`);
  }
  if (state.beforeReject !== state.afterReject || !state.inputCleared) {
    throw new Error(`${options.label} rejected source should preserve state and clear file input: ${JSON.stringify(state)}`);
  }
  if (options.crossModuleBeforeImport) {
    const baseline = state.crossModule?.baseline;
    const expectedBaseline = {
      connectionType: options.crossModuleBeforeImport,
      calculationFingerprint: baseline?.calculationFingerprint || '',
      selectedType: options.crossModuleBeforeImport,
      gussetVisible: false,
      shearTabVisible: options.crossModuleBeforeImport === 'single_plate',
      momentVisible: false,
      spliceVisible: false,
    };
    const targetConnectionType = state.sourceConnectionType || '';
    const targetVisibilityMatches = targetConnectionType === 'brace_gusset'
      ? state.afterSuccessfulReplay?.gussetVisible && !state.afterSuccessfulReplay?.shearTabVisible && !state.afterSuccessfulReplay?.momentVisible && !state.afterSuccessfulReplay?.spliceVisible
      : targetConnectionType === 'beam_column_moment'
        ? state.afterSuccessfulReplay?.momentVisible && !state.afterSuccessfulReplay?.gussetVisible && !state.afterSuccessfulReplay?.shearTabVisible && !state.afterSuccessfulReplay?.spliceVisible
        : targetConnectionType === 'column_splice'
          ? state.afterSuccessfulReplay?.spliceVisible && !state.afterSuccessfulReplay?.gussetVisible && !state.afterSuccessfulReplay?.shearTabVisible && !state.afterSuccessfulReplay?.momentVisible
        : targetConnectionType === 'single_plate'
          ? state.afterSuccessfulReplay?.shearTabVisible && !state.afterSuccessfulReplay?.gussetVisible && !state.afterSuccessfulReplay?.momentVisible && !state.afterSuccessfulReplay?.spliceVisible
          : false;
    if (!baseline || JSON.stringify(baseline) !== JSON.stringify(expectedBaseline)
        || JSON.stringify(state.crossModule.afterVersionReject) !== JSON.stringify(baseline)
        || JSON.stringify(state.crossModule.afterReportReject) !== JSON.stringify(baseline)
        || !state.crossModule.versionRejectedStatus.includes('已保留原輸入')
        || !state.crossModule.reportRejectedStatus.includes('已保留原輸入')
        || state.afterSuccessfulReplay?.connectionType !== targetConnectionType
        || state.afterSuccessfulReplay?.selectedType !== targetConnectionType
        || !targetVisibilityMatches) {
      throw new Error(`${options.label} cross-module replay should reject transactionally, then switch state and visibility on valid import: ${JSON.stringify({ crossModule: state.crossModule, afterSuccessfulReplay: state.afterSuccessfulReplay })}`);
    }
  }
  if (options.strictBooleanField
      && (!state.booleanRejectedStatus.includes(`${options.strictBooleanField} 必須為布林值`)
        || !state.booleanRejectedStatus.includes('已保留原輸入')
        || state.beforeBooleanReject !== state.afterBooleanReject)) {
    throw new Error(`${options.label} should reject a stringified ${options.strictBooleanField} without changing state: ${JSON.stringify(state)}`);
  }
  if (options.reportTamper
      && (!state.reportTamperRejectedStatus.includes('內嵌報告內容與來源欄位重算結果不一致')
        || !state.reportTamperRejectedStatus.includes('已保留原輸入')
        || state.beforeReportTamperReject !== state.afterReportTamperReject)) {
    throw new Error(`${options.label} should reject a tampered embedded report without changing state: ${JSON.stringify(state)}`);
  }
  if (options.exactFieldSchemaProbes
      && (!state.extraFieldRejectedStatus.includes('欄位集合不符')
        || !state.extraFieldRejectedStatus.includes('多出 __unexpectedFormalField')
        || !state.extraFieldRejectedStatus.includes('已保留原輸入')
        || state.beforeExtraFieldReject !== state.afterExtraFieldReject
        || !state.missingFieldRejectedStatus.includes('欄位集合不符')
        || !state.missingFieldRejectedStatus.includes(`缺少 ${options.schemaProbeMissingField}`)
        || !state.missingFieldRejectedStatus.includes('已保留原輸入')
        || state.beforeMissingFieldReject !== state.afterMissingFieldReject)) {
    throw new Error(`${options.label} should reject extra and missing formal source fields transactionally: ${JSON.stringify(state)}`);
  }
  if (options.wrongEnumField
      && (!state.wrongEnumRejectedStatus.includes(`${options.wrongEnumField} 列舉值不支援`)
        || !state.wrongEnumRejectedStatus.includes('已保留原輸入')
        || state.beforeWrongEnumReject !== state.afterWrongEnumReject)) {
    throw new Error(`${options.label} should reject unsupported ${options.wrongEnumField} transactionally: ${JSON.stringify(state)}`);
  }
  if (state.escapeProbeImageCount !== 0 || state.escapeProbeExecuted || !state.escapeProbeTextVisible) {
    throw new Error(`${options.label} source replay should preserve the XSS probe as visible text only: ${JSON.stringify(state)}`);
  }
  return state;
}

async function captureReportApprovalState(cdp, sessionId, label) {
  return evaluate(cdp, sessionId, `(() => {
    const approval = document.getElementById('repAttachmentApproval');
    const downloadButton = document.getElementById('repDownloadCurrentHtml');
    const serializerAvailable = typeof serializeReportDocumentHtml === 'function';
    const status = () => document.querySelector('.rep-document-status-line');
    const calculationFingerprint = () => (status()?.textContent || '').match(/CF-[0-9A-F]{16}/)?.[0] || '';
    const initialDocumentClass = status()?.dataset.documentClass || '';
    const initialStatusText = (status()?.textContent || '').replace(/\\s+/g, ' ').trim();
    const initialCalculationFingerprint = calculationFingerprint();
    const initialDocumentTitle = document.title || '';
    if (approval) {
      approval.checked = true;
      approval.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const approvedDocumentClass = status()?.dataset.documentClass || '';
    const approvedStatusText = (status()?.textContent || '').replace(/\\s+/g, ' ').trim();
    const approvedAt = status()?.dataset.approvedAt || '';
    const approvedCalculationFingerprint = calculationFingerprint();
    const approvedDocumentTitle = document.title || '';
    const approvedHtml = serializerAvailable ? serializeReportDocumentHtml() : '';
    const approvedDocument = approvedHtml ? new DOMParser().parseFromString(approvedHtml, 'text/html') : null;
    const approvedTableRows = approvedDocument
      ? Array.from(approvedDocument.querySelectorAll('table tbody tr')).map((row) =>
        Array.from(row.querySelectorAll('th, td')).map((cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim()))
      : [];
    let downloadedFileName = '';
    if (downloadButton) {
      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      try {
        HTMLAnchorElement.prototype.click = function captureReportDownload() {
          downloadedFileName = this.download || '';
        };
        downloadButton.click();
      } finally {
        HTMLAnchorElement.prototype.click = originalAnchorClick;
      }
    }
    if (approval) {
      approval.checked = false;
      approval.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const internalDocumentTitle = document.title || '';
    return {
      approvalControl: Boolean(approval),
      downloadControl: Boolean(downloadButton),
      serializerAvailable,
      initialDocumentClass,
      initialStatusText,
      initialCalculationFingerprint,
      initialDocumentTitle,
      approvedDocumentClass,
      approvedStatusText,
      approvedAt,
      approvedCalculationFingerprint,
      approvedDocumentTitle,
      approvedHtml,
      approvedTableRows,
      downloadedFileName,
      internalDocumentTitle,
    };
  })()`, `${label} approval state`);
}

function verifySteelApprovedHtml(approvalState, label) {
  if (!approvalState.approvalControl || approvalState.initialDocumentClass !== 'internal-review' || !approvalState.initialStatusText.includes('文件狀態：內部審閱')) {
    throw new Error(`${label} should default to printable internal review: ${JSON.stringify(approvalState)}`);
  }
  if (approvalState.approvedDocumentClass !== 'formal-attachment' || !approvalState.approvedStatusText.includes('文件狀態：正式附件') || !approvalState.approvedStatusText.includes('核可時間')) {
    throw new Error(`${label} approval checkbox should create a traceable formal attachment: ${JSON.stringify(approvalState)}`);
  }
  if (!approvalState.downloadControl || !approvalState.serializerAvailable) {
    throw new Error(`${label} should expose the reusable current-state HTML download: ${JSON.stringify(approvalState)}`);
  }
  if (!/^CF-[0-9A-F]{16}$/.test(approvalState.initialCalculationFingerprint)
      || approvalState.approvedCalculationFingerprint !== approvalState.initialCalculationFingerprint) {
    throw new Error(`${label} approval should preserve one calculation fingerprint: ${JSON.stringify(approvalState)}`);
  }
  if (!approvalState.initialDocumentTitle.includes('內部審閱')
      || !approvalState.initialDocumentTitle.includes(approvalState.initialCalculationFingerprint)
      || !approvalState.approvedDocumentTitle.includes('正式附件')
      || !approvalState.approvedDocumentTitle.includes(approvalState.approvedCalculationFingerprint)
      || !approvalState.internalDocumentTitle.includes('內部審閱')
      || !approvalState.internalDocumentTitle.includes(approvalState.initialCalculationFingerprint)) {
    throw new Error(`${label} document title should follow approval state and fingerprint: ${JSON.stringify(approvalState)}`);
  }
  if (approvalState.downloadedFileName !== `${approvalState.approvedDocumentTitle}.html`) {
    throw new Error(`${label} formal HTML filename should match the approved title: ${JSON.stringify(approvalState)}`);
  }
  if (!Number.isFinite(Date.parse(approvalState.approvedAt || ''))) {
    throw new Error(`${label} formal HTML should preserve a machine-readable approval time: ${JSON.stringify(approvalState)}`);
  }
  const savedStaticMarkup = approvalState.approvedHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const savedStatusCount = (savedStaticMarkup.match(/class=["'][^"']*rep-document-status-line[^"']*["']/gi) || []).length;
  const savedVisibleText = AttachmentPackageChecker.extractHtmlVisibleContent(approvalState.approvedHtml).text;
  if (savedStatusCount !== 1
      || !savedVisibleText.includes('文件狀態：正式附件')
      || !savedVisibleText.includes('核可時間')
      || !savedVisibleText.includes(approvalState.approvedCalculationFingerprint)) {
    throw new Error(`${label} saved formal HTML should expose one static traceable state line: ${JSON.stringify(approvalState)}`);
  }
  if (/class=["'][^"']*(?:rep-approval-control|rep-download-control)[^"']*["']/i.test(approvalState.approvedHtml)) {
    throw new Error(`${label} saved formal HTML should exclude interactive controls`);
  }
  const contentSeal = AttachmentPackageChecker.verifyFormalHtmlContentSeal(approvalState.approvedHtml);
  const approvalSeal = AttachmentPackageChecker.verifyFormalHtmlApprovalSeal(approvalState.approvedHtml);
  if (contentSeal.status !== 'verified' || contentSeal.scope !== AttachmentPackageChecker.FORMAL_CONTENT_SEAL_SCOPE) {
    throw new Error(`${label} saved formal HTML content seal failed: ${JSON.stringify(contentSeal)}`);
  }
  if (approvalSeal.status !== 'verified' || approvalSeal.scope !== AttachmentPackageChecker.FORMAL_APPROVAL_SEAL_SCOPE) {
    throw new Error(`${label} saved formal HTML approval seal failed: ${JSON.stringify(approvalSeal)}`);
  }
  const contentBoundaryIndex = approvalState.approvedHtml.lastIndexOf(AttachmentPackageChecker.FORMAL_CONTENT_SEAL_START);
  if (contentBoundaryIndex < 0) throw new Error(`${label} saved HTML lacks calculation-content boundary`);
  const contentInsertAt = contentBoundaryIndex + AttachmentPackageChecker.FORMAL_CONTENT_SEAL_START.length;
  const contentTamperedHtml = `${approvalState.approvedHtml.slice(0, contentInsertAt)}<div>異動後計算內容</div>${approvalState.approvedHtml.slice(contentInsertAt)}`;
  const contentTamperSeal = AttachmentPackageChecker.verifyFormalHtmlContentSeal(contentTamperedHtml);
  if (contentTamperSeal.status !== 'failed' || !contentTamperSeal.reasons.includes('content-sha256-mismatch')) {
    throw new Error(`${label} calculation-body tamper should fail content seal: ${JSON.stringify(contentTamperSeal)}`);
  }
  const approvalTamperedHtml = approvalState.approvedHtml.replace(
    /(rep-attachment-approval-source[^>]*data-approved-at=")[^"]+/i,
    (_, prefix) => `${prefix}2000-01-01T00:00:00.000Z`
  );
  const approvalTamperContentSeal = AttachmentPackageChecker.verifyFormalHtmlContentSeal(approvalTamperedHtml);
  const approvalTamperSeal = AttachmentPackageChecker.verifyFormalHtmlApprovalSeal(approvalTamperedHtml);
  if (approvalTamperContentSeal.status !== 'verified' || approvalTamperSeal.status !== 'failed' || !approvalTamperSeal.reasons.includes('approval-sha256-mismatch')) {
    throw new Error(`${label} approval-only tamper should preserve content seal and fail approval seal`);
  }
  return {
    contentSealStatus: contentSeal.status,
    contentSealScope: contentSeal.scope,
    contentSha256: contentSeal.actualSha256,
    contentTamperDetectionStatus: contentTamperSeal.status,
    approvalSealStatus: approvalSeal.status,
    approvalSealScope: approvalSeal.scope,
    approvalSha256: approvalSeal.actualSha256,
    approvalTamperDetectionStatus: approvalTamperSeal.status,
    approvalTamperContentSealStatus: approvalTamperContentSeal.status,
  };
}

async function waitForDownloadedArtifact(filePath, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0 && !fs.existsSync(`${filePath}.crdownload`)) return;
    await wait(100);
  }
  throw new Error(`timed out waiting for downloaded artifact: ${filePath}`);
}

function normalizeExactFailureKeySet(keys) {
  return [...new Set(Array.isArray(keys) ? keys : [])].sort();
}

async function verifySteelNgSourceFileRoundTrip(cdp, sessionId, options) {
  const prepared = await evaluate(cdp, sessionId, `(async () => {
    const overrides = ${JSON.stringify(options.ngOverrides || {})};
    Object.entries(overrides).forEach(([name, value]) => {
      const field = document.querySelector('[name="' + name + '"]');
      if (!field) throw new Error('missing NG source field [name="' + name + '"]');
      field.value = String(value);
    });
    const trigger = document.querySelector(${JSON.stringify(options.updateTriggerSelector)});
    if (!trigger) throw new Error('missing NG source update trigger');
    trigger.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = window.latestSteelConnectionResult;
    const payload = window.buildSteelConnectionSourcePayload?.();
    return {
      payload,
      passes: result?.passes === true,
      overallStatus: result?.overallStatus || '',
      validationFailure: result?.summary?.validationFailure === true,
      failingDetailKeys: (result?.detailChecks || []).filter(item => !item.passes).map(item => item.key),
      failingStrengthKeys: (result?.checks || []).filter(item => item.ratio > 1).map(item => item.key),
      stateValues: Object.fromEntries(Object.keys(overrides).map(key => [key, result?.state?.[key]])),
      reportFingerprint: payload?.report?.calculationFingerprint || '',
    };
  })()`, `${options.label} prepare self-produced NG source`);

  const payload = prepared.payload;
  if (!payload || prepared.passes || prepared.overallStatus !== 'fail' || prepared.validationFailure
      || !/^CF-[0-9A-F]{16}$/.test(payload.calculationFingerprint)
      || prepared.reportFingerprint !== payload.calculationFingerprint) {
    throw new Error(`${options.label} self-produced NG source must remain finite, reportable, fingerprinted, and NG: ${JSON.stringify(prepared)}`);
  }
  const expectedDetailFailureSet = normalizeExactFailureKeySet(options.expectedFailingDetailKeys);
  const expectedStrengthFailureSet = normalizeExactFailureKeySet(options.expectedFailingStrengthKeys);
  const preparedDetailFailureSet = normalizeExactFailureKeySet(prepared.failingDetailKeys);
  const preparedStrengthFailureSet = normalizeExactFailureKeySet(prepared.failingStrengthKeys);
  if (JSON.stringify(preparedDetailFailureSet) !== JSON.stringify(expectedDetailFailureSet)
      || JSON.stringify(preparedStrengthFailureSet) !== JSON.stringify(expectedStrengthFailureSet)) {
    throw new Error(`${options.label} self-produced NG source detail/strength failure sets must match exactly: ${JSON.stringify({ expectedDetailFailureSet, preparedDetailFailureSet, expectedStrengthFailureSet, preparedStrengthFailureSet })}`);
  }
  for (const [key, expectedValue] of Object.entries(options.expectedNgStateValues || {})) {
    if (prepared.stateValues?.[key] !== expectedValue) {
      throw new Error(`${options.label} self-produced NG state ${key} mismatch: ${JSON.stringify(prepared.stateValues)}`);
    }
  }

  const identity = payload.project?.no || payload.project?.name || 'source';
  const safeIdentity = String(identity).trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'source';
  const fileName = `${payload.tool.id}-${safeIdentity}.json`;
  const filePath = path.resolve(outputDir, fileName);
  if (path.dirname(filePath) !== outputDir) throw new Error(`${options.label} NG source filename escapes audit output directory`);
  for (const candidate of [filePath, `${filePath}.crdownload`]) {
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  }

  const downloadStatus = await evaluate(cdp, sessionId, `(async () => {
    const button = document.querySelector('#exportSourceJsonBtn');
    const status = document.querySelector('#exportReportStatus');
    if (!button || !status) throw new Error('missing NG source export controls');
    status.textContent = '';
    button.click();
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5000 && !(status.textContent || '').includes('已匯出來源 JSON')) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return status.textContent || '';
  })()`, `${options.label} download self-produced NG source`);
  if (!downloadStatus.includes(payload.calculationFingerprint)) {
    throw new Error(`${options.label} NG source download status/fingerprint mismatch: ${downloadStatus}`);
  }
  await waitForDownloadedArtifact(filePath);
  const buffer = fs.readFileSync(filePath);
  const downloadedText = buffer.toString('utf8');
  let downloadedPayload;
  try {
    downloadedPayload = JSON.parse(downloadedText);
  } catch (error) {
    throw new Error(`${options.label} downloaded NG source is not JSON: ${error.message}`);
  }
  if (buffer.length <= 1024
      || downloadedPayload.calculationFingerprint !== payload.calculationFingerprint
      || downloadedPayload.report?.calculationFingerprint !== payload.calculationFingerprint
      || JSON.stringify(downloadedPayload.fields) !== JSON.stringify(payload.fields)
      || JSON.stringify(downloadedPayload.report) !== JSON.stringify(payload.report)) {
    throw new Error(`${options.label} downloaded NG source does not exactly preserve fields/report/fingerprint: ${JSON.stringify({ bytes: buffer.length, prepared: payload.calculationFingerprint, downloaded: downloadedPayload.calculationFingerprint })}`);
  }

  const replay = await evaluate(cdp, sessionId, `(async () => {
    const recovery = ${JSON.stringify(options.recoveryOverrides || {})};
    Object.entries(recovery).forEach(([name, value]) => {
      const field = document.querySelector('[name="' + name + '"]');
      if (!field) throw new Error('missing NG recovery field [name="' + name + '"]');
      field.value = String(value);
    });
    const trigger = document.querySelector(${JSON.stringify(options.updateTriggerSelector)});
    const input = document.querySelector('#importSourceJsonInput');
    const status = document.querySelector('#exportReportStatus');
    if (!trigger || !input || !status) throw new Error('missing NG source replay controls');
    trigger.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 100));
    const passBeforeImport = window.latestSteelConnectionResult?.passes === true;

    const transfer = new DataTransfer();
    transfer.items.add(new File([${JSON.stringify(downloadedText)}], ${JSON.stringify(fileName)}, { type: 'application/json' }));
    input.files = transfer.files;
    status.textContent = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5000
        && !(status.textContent || '').includes('已匯入並重現計算')
        && !(status.textContent || '').includes('匯入失敗')) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const result = window.latestSteelConnectionResult;
    const replayPayload = window.buildSteelConnectionSourcePayload?.();
    return {
      passBeforeImport,
      status: status.textContent || '',
      passes: result?.passes === true,
      overallStatus: result?.overallStatus || '',
      validationFailure: result?.summary?.validationFailure === true,
      failingDetailKeys: (result?.detailChecks || []).filter(item => !item.passes).map(item => item.key),
      failingStrengthKeys: (result?.checks || []).filter(item => item.ratio > 1).map(item => item.key),
      stateValues: Object.fromEntries(Object.keys(${JSON.stringify(options.ngOverrides || {})}).map(key => [key, result?.state?.[key]])),
      replayPayload,
      inputCleared: input.value === '',
    };
  })()`, `${options.label} replay downloaded NG source file`);
  if (!replay.passBeforeImport || replay.passes || replay.overallStatus !== 'fail' || replay.validationFailure
      || !replay.status.includes('已匯入並重現計算')
      || !replay.status.includes(downloadedPayload.calculationFingerprint)
      || replay.replayPayload?.calculationFingerprint !== downloadedPayload.calculationFingerprint
      || replay.replayPayload?.report?.calculationFingerprint !== downloadedPayload.calculationFingerprint
      || JSON.stringify(replay.replayPayload?.fields) !== JSON.stringify(downloadedPayload.fields)
      || JSON.stringify(replay.replayPayload?.report) !== JSON.stringify(downloadedPayload.report)
      || !replay.inputCleared) {
    throw new Error(`${options.label} downloaded NG source must replay transactionally to the same NG report and fingerprint: ${JSON.stringify(replay)}`);
  }
  const replayDetailFailureSet = normalizeExactFailureKeySet(replay.failingDetailKeys);
  const replayStrengthFailureSet = normalizeExactFailureKeySet(replay.failingStrengthKeys);
  if (JSON.stringify(replayDetailFailureSet) !== JSON.stringify(expectedDetailFailureSet)
      || JSON.stringify(replayStrengthFailureSet) !== JSON.stringify(expectedStrengthFailureSet)) {
    throw new Error(`${options.label} replayed NG source detail/strength failure sets must match exactly: ${JSON.stringify({ expectedDetailFailureSet, replayDetailFailureSet, expectedStrengthFailureSet, replayStrengthFailureSet })}`);
  }
  for (const [key, expectedValue] of Object.entries(options.expectedNgStateValues || {})) {
    if (replay.stateValues?.[key] !== expectedValue) {
      throw new Error(`${options.label} replayed NG state ${key} mismatch: ${JSON.stringify(replay.stateValues)}`);
    }
  }

  const record = {
    key: options.key,
    artifact: path.basename(filePath),
    bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    calculationFingerprint: downloadedPayload.calculationFingerprint,
    connectionType: downloadedPayload.connectionType,
    overallStatus: replay.overallStatus,
    failingDetailKeys: replayDetailFailureSet,
    failingStrengthKeys: replayStrengthFailureSet,
    exactFailureSetsVerified: true,
    reportRoundTripExact: true,
  };
  ngSourceEvidenceRecords.push(record);
  return record;
}

async function verifySteelTextDownload(cdp, sessionId, label, evidenceKey, artifactRequiredNeedles = [], artifactForbiddenNeedles = []) {
  const prepared = await evaluate(cdp, sessionId, `(() => {
    const button = document.getElementById('repDownloadCurrentText');
    const builder = window.buildReportText;
    let fileName = '';
    if (button) {
      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      try {
        HTMLAnchorElement.prototype.click = function captureTextDownloadName() {
          fileName = this.download || '';
        };
        button.click();
      } finally {
        HTMLAnchorElement.prototype.click = originalAnchorClick;
      }
    }
    return {
      hasControl: Boolean(button),
      builderAvailable: typeof builder === 'function',
      text: typeof builder === 'function' ? builder() : '',
      fileName,
    };
  })()`, `${label} TXT preparation`);
  if (!prepared.hasControl || !prepared.builderAvailable) {
    throw new Error(`${label} should expose governed TXT export: ${JSON.stringify(prepared)}`);
  }
  if (!/文字備查.*CF-[A-F0-9]{16}\.txt$/.test(prepared.fileName)) {
    throw new Error(`${label} TXT filename is not traceable: ${prepared.fileName}`);
  }
  const filePath = path.resolve(outputDir, prepared.fileName);
  if (path.dirname(filePath) !== outputDir) throw new Error(`${label} TXT filename escapes the audit output directory`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await evaluate(cdp, sessionId, `(() => {
    const button = document.getElementById('repDownloadCurrentText');
    if (!button) throw new Error('missing TXT download control');
    button.click();
    return true;
  })()`, `${label} TXT download`);
  await waitForDownloadedArtifact(filePath);

  const buffer = fs.readFileSync(filePath);
  const decoded = buffer.toString('utf8');
  const hasBom = decoded.charCodeAt(0) === 0xFEFF;
  const content = hasBom ? decoded.slice(1) : decoded;
  const requiredFragments = [
    '文件類別：文字備查',
    '正式附件資格：否',
    '文件用途：文字備查版（不作為正式附件）',
    '產出工具：',
    '工具版本：',
    '輸出時間：',
    '計算指紋：CF-',
    '文字版限制：不含可列印圖形',
    '文字內容 SHA-256（非數位簽章）：',
    ...artifactRequiredNeedles,
  ];
  for (const fragment of requiredFragments) {
    if (!content.includes(fragment)) throw new Error(`${label} downloaded TXT missing ${fragment}`);
  }
  for (const fragment of artifactForbiddenNeedles) {
    if (content.includes(fragment)) throw new Error(`${label} downloaded TXT includes forbidden ${fragment}`);
  }
  if (!hasBom || content !== prepared.text || buffer.length <= 1024) {
    throw new Error(`${label} TXT content/BOM/substance mismatch: ${JSON.stringify({ hasBom, bytes: buffer.length, matchesBuilder: content === prepared.text })}`);
  }
  if (content.includes('data:image/') || content.includes('優先建議報告閱讀狀態')) {
    throw new Error(`${label} TXT includes page-only or embedded-image content`);
  }
  const digestMatch = content.match(/文字內容 SHA-256（非數位簽章）：([0-9a-f]{64})\r?\n$/);
  const baseText = digestMatch ? content.slice(0, digestMatch.index) : '';
  const actualDigest = baseText ? crypto.createHash('sha256').update(baseText, 'utf8').digest('hex') : '';
  if (!digestMatch || digestMatch[1] !== actualDigest) {
    throw new Error(`${label} TXT SHA-256 mismatch: ${JSON.stringify({ expected: digestMatch?.[1] || '', actual: actualDigest })}`);
  }
  const record = AttachmentPackageChecker.inspectAttachment(filePath, outputDir);
  const packageReport = AttachmentPackageChecker.analyzePackage([record]);
  const packageIssueCodes = packageReport.issues.map(issue => issue.code);
  if (packageReport.status !== 'blocked' || !packageIssueCodes.includes('non-formal-reference-text')) {
    throw new Error(`${label} TXT must be blocked from formal attachment packaging: ${JSON.stringify({ status: packageReport.status, packageIssueCodes })}`);
  }
  const evidence = {
    key: evidenceKey,
    artifact: path.basename(filePath),
    bytes: buffer.length,
    hasBom,
    textLength: content.length,
    contentSha256: actualDigest,
    packageStatus: packageReport.status,
    packageIssueCodes,
  };
  textExportEvidenceRecords.push(evidence);
  return evidence;
}

function saveSteelApprovedHtml(key, approvedHtml) {
  ensureDir(renderedEvidenceDir);
  const htmlArtifact = `${key}-approved-formal-attachment.html`;
  const htmlArtifactPath = path.join(renderedEvidenceDir, htmlArtifact);
  fs.writeFileSync(htmlArtifactPath, approvedHtml, 'utf8');
  const content = fs.readFileSync(htmlArtifactPath);
  return {
    htmlArtifact,
    htmlArtifactBytes: content.length,
    htmlArtifactSha256: crypto.createHash('sha256').update(content).digest('hex'),
  };
}

async function assertFormalReportPopup(cdp, sessionId, options) {
  const sourceExport = options.sourcePayloadBuilder
    ? await evaluate(cdp, sessionId, `(() => {
        const builder = window[${JSON.stringify(options.sourcePayloadBuilder)}];
        if (typeof builder !== 'function') throw new Error('missing source payload builder ${options.sourcePayloadBuilder}');
         const payload = builder();
         window.__steelSourceReplayPayload = payload;
        const button = document.querySelector('#btnExportSourceJson');
        if (!button) throw new Error('missing #btnExportSourceJson');
        const originalCreateObjectURL = URL.createObjectURL;
        const originalRevokeObjectURL = URL.revokeObjectURL;
        const originalAnchorClick = HTMLAnchorElement.prototype.click;
        let download = null;
        try {
          URL.createObjectURL = () => 'blob:steel-source-json-browser-test';
          URL.revokeObjectURL = () => {};
          HTMLAnchorElement.prototype.click = function captureSourceDownload() {
            download = { filename: this.download || '', href: this.href || '' };
          };
          button.click();
        } finally {
          URL.createObjectURL = originalCreateObjectURL;
          URL.revokeObjectURL = originalRevokeObjectURL;
          HTMLAnchorElement.prototype.click = originalAnchorClick;
        }
        return {
          payload,
          download,
          status: document.querySelector('#beamInputStatus, #columnInputStatus')?.textContent || '',
        };
      })()`, `${options.label} source payload`)
    : null;
  const sourcePayload = sourceExport?.payload || null;
  let sourceReplayState = null;
  if (sourcePayload && options.sourceReplay) {
    sourceReplayState = await assertSourceJsonReplay(cdp, sessionId, { ...options.sourceReplay, label: options.label });
  }
  const popup = await openFormalReportPopup(cdp, sessionId, options.label, options.buttonSelector || '#btnReport');
  const snapshot = await evaluate(cdp, popup.sessionId, `(() => ({
    title: document.title || '',
    header: document.querySelector('.rep-header h1')?.innerText?.trim() || '',
    bodyText: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim(),
    html: document.documentElement?.outerHTML || '',
    escapeProbeImageCount: Array.from(document.querySelectorAll('img')).filter(node =>
      String(node.getAttribute('onerror') || '').includes('__steelXss')).length,
    escapeProbeExecuted: window.__steelXss === 1,
    metaRows: Array.from(document.querySelectorAll('.rep-meta div')).map((node) => (node.innerText || '').replace(/\\s+/g, ' ').trim()),
    sectionHeadings: Array.from(document.querySelectorAll('.rep-paper h3')).map((node) => (node.innerText || '').replace(/\\s+/g, ' ').trim()),
    uiCardCount: document.querySelectorAll('.rep-highlights, .rep-summary-facts').length,
  }))()`, `${options.label} snapshot`);
  const approvalState = await evaluate(cdp, popup.sessionId, `(() => {
    const approval = document.getElementById('repAttachmentApproval');
    const downloadButton = document.getElementById('repDownloadCurrentHtml');
    const serializerAvailable = typeof serializeReportDocumentHtml === 'function';
    const status = () => document.querySelector('.rep-document-status-line');
    const calculationFingerprint = () => (status()?.textContent || '').match(/CF-[0-9A-F]{16}/)?.[0] || '';
    const initialDocumentClass = status()?.dataset.documentClass || '';
    const initialStatusText = (status()?.textContent || '').replace(/\\s+/g, ' ').trim();
    const initialCalculationFingerprint = calculationFingerprint();
    const initialDocumentTitle = document.title || '';
    if (approval) {
      approval.checked = true;
      approval.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const approvedDocumentClass = status()?.dataset.documentClass || '';
    const approvedStatusText = (status()?.textContent || '').replace(/\\s+/g, ' ').trim();
    const approvedAt = status()?.dataset.approvedAt || '';
    const approvedCalculationFingerprint = calculationFingerprint();
    const approvedDocumentTitle = document.title || '';
    const approvedHtml = serializerAvailable ? serializeReportDocumentHtml() : '';
    let downloadedFileName = '';
    if (downloadButton) {
      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      try {
        HTMLAnchorElement.prototype.click = function captureReportDownload() {
          downloadedFileName = this.download || '';
        };
        downloadButton.click();
      } finally {
        HTMLAnchorElement.prototype.click = originalAnchorClick;
      }
    }
    if (approval) {
      approval.checked = false;
      approval.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const internalDocumentTitle = document.title || '';
    return {
      approvalControl: Boolean(approval),
      downloadControl: Boolean(downloadButton),
      serializerAvailable,
      initialDocumentClass,
      initialStatusText,
      initialCalculationFingerprint,
      initialDocumentTitle,
      approvedDocumentClass,
      approvedStatusText,
      approvedAt,
      approvedCalculationFingerprint,
      approvedDocumentTitle,
      approvedHtml,
      downloadedFileName,
      internalDocumentTitle,
    };
  })()`, `${options.label} approval state`);
  const headerNeedle = options.headerNeedle || options.titleNeedle;
  if (!snapshot.title.includes(options.titleNeedle) || !snapshot.header.includes(headerNeedle)) {
    throw new Error(`${options.label} title mismatch: ${JSON.stringify(snapshot)}`);
  }
  const forbiddenNeedles = [
    '優先建議報告閱讀狀態',
    '報告閱讀狀態',
    '頁面輔助',
    '頁面顯示，不進計算書、列印或 PDF',
    '不會寫入計算書或列印 PDF',
    '計畫名稱 / 編號 / 設計人尚未完整',
    ...FORMAL_REPORT_REFERENCE_NEEDLES,
    ...CALCULATION_BOOK_UI_ONLY_NEEDLES,
    '符號說明',
    ...(Array.isArray(options.absentNeedles) ? options.absentNeedles : []),
  ];
  for (const needle of forbiddenNeedles) {
    if (snapshot.bodyText.includes(needle)) {
      throw new Error(`${options.label} should exclude "${needle}": ${snapshot.bodyText}`);
    }
  }
  if (snapshot.uiCardCount !== 0) {
    throw new Error(`${options.label} should not render interface-style cards: ${snapshot.uiCardCount}`);
  }
  const conclusionIndex = snapshot.sectionHeadings.lastIndexOf('檢核結論');
  if (conclusionIndex < 0 || conclusionIndex !== snapshot.sectionHeadings.length - 1) {
    throw new Error(`${options.label} should place 檢核結論 after calculation content: ${JSON.stringify(snapshot.sectionHeadings)}`);
  }
  const expectedRows = [
    ['計畫名稱', options.expectedProject.name],
    ['計畫編號', options.expectedProject.no],
    ['設計人員', options.expectedProject.designer],
  ];
  for (const [rowLabel, expectedValue] of expectedRows) {
    const row = snapshot.metaRows.find((item) => item.startsWith(rowLabel)) || '';
    if (expectedValue ? !row.includes(expectedValue) : Boolean(row)) {
      throw new Error(`${options.label} ${rowLabel} mismatch: ${JSON.stringify(snapshot.metaRows)}`);
    }
  }
  if (!approvalState.approvalControl || approvalState.initialDocumentClass !== 'internal-review' || !approvalState.initialStatusText.includes('文件狀態：內部審閱')) {
    throw new Error(`${options.label} should default to printable internal review: ${JSON.stringify(approvalState)}`);
  }
  if (approvalState.approvedDocumentClass !== 'formal-attachment' || !approvalState.approvedStatusText.includes('文件狀態：正式附件') || !approvalState.approvedStatusText.includes('核可時間')) {
    throw new Error(`${options.label} approval checkbox should create a traceable formal attachment: ${JSON.stringify(approvalState)}`);
  }
  if (!approvalState.downloadControl || !approvalState.serializerAvailable) {
    throw new Error(`${options.label} should expose the reusable current-state HTML download: ${JSON.stringify(approvalState)}`);
  }
  if (!/^CF-[0-9A-F]{16}$/.test(approvalState.initialCalculationFingerprint)
      || approvalState.approvedCalculationFingerprint !== approvalState.initialCalculationFingerprint) {
    throw new Error(`${options.label} approval should preserve one calculation fingerprint: ${JSON.stringify(approvalState)}`);
  }
  if (!approvalState.initialDocumentTitle.includes('內部審閱')
      || !approvalState.initialDocumentTitle.includes(approvalState.initialCalculationFingerprint)
      || !approvalState.approvedDocumentTitle.includes('正式附件')
      || !approvalState.approvedDocumentTitle.includes(approvalState.approvedCalculationFingerprint)
      || !approvalState.internalDocumentTitle.includes('內部審閱')
      || !approvalState.internalDocumentTitle.includes(approvalState.initialCalculationFingerprint)) {
    throw new Error(`${options.label} document title should follow approval state and fingerprint: ${JSON.stringify(approvalState)}`);
  }
  if (approvalState.downloadedFileName !== `${approvalState.approvedDocumentTitle}.html`) {
    throw new Error(`${options.label} formal HTML filename should match the approved title: ${JSON.stringify(approvalState)}`);
  }
  if (!Number.isFinite(Date.parse(approvalState.approvedAt || ''))) {
    throw new Error(`${options.label} formal HTML should preserve a machine-readable approval time: ${JSON.stringify(approvalState)}`);
  }
  const savedStaticMarkup = approvalState.approvedHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const savedStatusCount = (savedStaticMarkup.match(/class=["'][^"']*rep-document-status-line[^"']*["']/gi) || []).length;
  const savedVisibleText = AttachmentPackageChecker.extractHtmlVisibleContent(approvalState.approvedHtml).text;
  if (savedStatusCount !== 1
      || !savedVisibleText.includes('文件狀態：正式附件')
      || !savedVisibleText.includes('核可時間')
      || !savedVisibleText.includes(approvalState.approvedCalculationFingerprint)) {
    throw new Error(`${options.label} saved formal HTML should expose one static traceable state line: ${JSON.stringify(approvalState)}`);
  }
  if (/class=["'][^"']*(?:rep-approval-control|rep-download-control)[^"']*["']/i.test(approvalState.approvedHtml)) {
    throw new Error(`${options.label} saved formal HTML should exclude interactive controls`);
  }
  const dualSealEvidence = verifySteelApprovedHtml(approvalState, options.label);
  if (options.renderEvidenceKey) {
    await verifySteelTextDownload(cdp, popup.sessionId, options.label, options.renderEvidenceKey, options.artifactRequiredNeedles, options.absentNeedles);
  }
  if (snapshot.bodyText.includes('DRAFT')) {
    throw new Error(`${options.label} should not render a DRAFT banner: ${snapshot.bodyText}`);
  }
  assertFormalReportTraceText(snapshot.bodyText, options.label);
  let reportFingerprint = '';
  if (sourcePayload) {
    reportFingerprint = snapshot.bodyText.match(/計算指紋\s*(CF-[0-9A-F]{16})/)?.[1] || '';
    if (sourcePayload.schemaVersion !== 1 || sourcePayload.kind !== 'formal-calculation-source') {
      throw new Error(`${options.label} invalid source payload envelope: ${JSON.stringify(sourcePayload)}`);
    }
    if (!sourcePayload.tool?.name || !sourcePayload.tool?.version || !sourcePayload.fields?.inFy) {
      throw new Error(`${options.label} incomplete source payload trace/input fields: ${JSON.stringify(sourcePayload)}`);
    }
    if (sourcePayload.project?.no !== options.expectedProject.no) {
      throw new Error(`${options.label} source payload project mismatch: ${JSON.stringify(sourcePayload.project)}`);
    }
    if (!sourceExport.download?.filename?.endsWith('.json') || !sourceExport.status.includes(sourcePayload.calculationFingerprint)) {
      throw new Error(`${options.label} source JSON download/status mismatch: ${JSON.stringify(sourceExport)}`);
    }
    if (!reportFingerprint || sourcePayload.calculationFingerprint !== reportFingerprint || sourcePayload.report?.calculationFingerprint !== reportFingerprint) {
      throw new Error(`${options.label} source/report fingerprint mismatch: ${sourcePayload.calculationFingerprint} / ${sourcePayload.report?.calculationFingerprint} / ${reportFingerprint}`);
    }
  }
  if (options.renderEvidenceKey) {
    const htmlEvidence = saveSteelApprovedHtml(options.renderEvidenceKey, approvalState.approvedHtml);
    const resultReconciliation = buildSteelResultReconciliation({
      caseId: options.renderEvidenceKey,
      sourcePayload,
      replayCalculationFingerprint: sourceReplayState?.replayFingerprint,
      reportCalculationFingerprint: reportFingerprint,
      verifiedAssertionCount: 8,
    });
    const evidence = await renderAndValidateReportPdf(cdp, {
      html: approvalState.approvedHtml,
      outputDir: renderedEvidenceDir,
      artifactName: options.renderEvidenceKey,
      label: options.label,
      renderer: 'steel-formal-attachment',
      contentBoundaryProfile: 'traceable-calculation-book',
      titleNeedle: options.titleNeedle,
      requiredNeedles: [options.titleNeedle, '計畫名稱', '計算過程明細', '檢核結論', '文件狀態：正式附件', '核可時間', ...FORMAL_REPORT_TRACE_LABELS, ...(options.artifactRequiredNeedles || [])],
      forbiddenNeedles,
      continuationContextLabels: options.continuationContextLabels || [],
    });
    assertFormalReportTraceText(fs.readFileSync(evidence.pdf.textPath, 'utf8'), `${options.label} rendered PDF`);
    renderedEvidenceRecords.push({
      key: options.renderEvidenceKey,
      renderer: evidence.renderer,
      artifact: path.basename(evidence.pdfPath),
      evidence: path.basename(evidence.evidencePath),
      pageCount: evidence.pdf.pageCount,
      textLength: evidence.pdf.textLength,
      calculationFingerprint: reportFingerprint,
      resultReconciliation,
      evidenceRole: 'approved-formal-attachment',
      documentClass: 'formal-attachment',
      approvedAt: approvalState.approvedAt,
      ...htmlEvidence,
      ...dualSealEvidence,
    });
  }
  return {
    captureSessionId: popup.sessionId,
    captureTargetId: popup.targetId,
  };
}

function normalizeVisibleCalculationText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseVisibleCalculationNumber(text, label) {
  const normalized = normalizeVisibleCalculationText(text);
  const match = normalized.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) throw new Error(`${label} does not expose a finite visible number: ${normalized}`);
  const value = Number(match[0]);
  if (!Number.isFinite(value)) throw new Error(`${label} visible number is not finite: ${normalized}`);
  return value;
}

function visibleCalculationTolerance(text) {
  const normalized = normalizeVisibleCalculationText(text).replace(/,/g, '');
  const match = normalized.match(/-?\d+(?:\.(\d+))?/);
  if (!match) return Number.NaN;
  const decimals = match[1]?.length || 0;
  return (0.5 * (10 ** -decimals)) + 1e-12;
}

function visibleTextsOccurInOrder(haystack, needles) {
  let cursor = 0;
  for (const needle of needles) {
    const normalizedNeedle = normalizeVisibleCalculationText(needle);
    const index = haystack.indexOf(normalizedNeedle, cursor);
    if (index < 0) return false;
    cursor = index + normalizedNeedle.length;
  }
  return true;
}

function buildSteelVisibleCalculationAssertions(options) {
  const {
    sourcePayload,
    tableRows,
    approvedTableRows,
    popupBodyText,
    approvedVisibleText,
    renderedPdfText,
    expectedCheckKeys,
    label,
  } = options;
  const checks = Array.isArray(sourcePayload?.report?.checks) ? sourcePayload.report.checks : [];
  const expectedKeys = [...(expectedCheckKeys || [])].sort();
  const actualKeys = checks.map(check => check?.key).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`${label} visible reconciliation source check keys mismatch: ${JSON.stringify({ expectedKeys, actualKeys })}`);
  }
  const normalizedPopup = normalizeVisibleCalculationText(popupBodyText);
  const normalizedApproved = normalizeVisibleCalculationText(approvedVisibleText);
  const normalizedPdf = normalizeVisibleCalculationText(renderedPdfText);
  const pdfLines = String(renderedPdfText || '')
    .split(/[\r\n\f]+/)
    .map(normalizeVisibleCalculationText)
    .filter(Boolean);
  const assertions = [];
  for (const [checkIndex, check] of checks.entries()) {
    const normalizedLabel = normalizeVisibleCalculationText(check.label);
    const popupRows = (tableRows || []).filter(cells => normalizeVisibleCalculationText(cells?.[0]).startsWith(normalizedLabel));
    const htmlRows = (approvedTableRows || []).filter(cells => normalizeVisibleCalculationText(cells?.[0]).startsWith(normalizedLabel));
    if (popupRows.length !== 1 || htmlRows.length !== 1) {
      throw new Error(`${label} visible reconciliation requires exactly one popup and approved-HTML strength row for ${check.key}: ${JSON.stringify({ popupRows, htmlRows })}`);
    }
    const popupRow = popupRows[0];
    const htmlRow = htmlRows[0];
    const pdfRows = pdfLines.filter(line => visibleTextsOccurInOrder(line, [normalizedLabel, popupRow[1], popupRow[2], popupRow[3]]));
    if (pdfRows.length !== 1) {
      throw new Error(`${label} rendered PDF must expose exactly one ordered strength row for ${check.key}: ${JSON.stringify({ expected: [normalizedLabel, popupRow[1], popupRow[2], popupRow[3]], pdfRows })}`);
    }
    const pdfRow = pdfRows[0];
    const pdfDetailStart = normalizedPdf.lastIndexOf(normalizedLabel);
    const nextLabel = normalizeVisibleCalculationText(checks[checkIndex + 1]?.label);
    const nextDetailStart = nextLabel ? normalizedPdf.lastIndexOf(nextLabel) : -1;
    const pdfDetailEnd = nextDetailStart > pdfDetailStart ? nextDetailStart : normalizedPdf.length;
    const pdfDetailText = pdfDetailStart >= 0 ? normalizedPdf.slice(pdfDetailStart, pdfDetailEnd) : '';
    if (!pdfDetailText) {
      throw new Error(`${label} rendered PDF calculation detail missing for ${check.key}`);
    }
    const unit = String(check.unit || '');
    const numericFields = [
      { quantity: 'demand', sourceValue: check.demand, popupText: popupRow[1], htmlText: htmlRow[1], unit },
      { quantity: 'available', sourceValue: check.available, popupText: popupRow[2], htmlText: htmlRow[2], unit },
      { quantity: 'ratio', sourceValue: check.ratio, popupText: popupRow[3], htmlText: htmlRow[3], unit: '' },
    ];
    for (const item of numericFields) {
      const sourceValue = Number(item.sourceValue);
      const surfaces = [
        { id: 'report-popup', surface: 'report-popup-strength-table', visibleText: normalizeVisibleCalculationText(item.popupText), boundText: normalizedPopup },
        { id: 'approved-html', surface: 'approved-html-strength-table', visibleText: normalizeVisibleCalculationText(item.htmlText), boundText: normalizedApproved },
        { id: 'rendered-pdf', surface: 'rendered-pdf-extracted-text-strength-table', visibleText: normalizeVisibleCalculationText(item.popupText), boundText: pdfRow },
      ];
      for (const surface of surfaces) {
        const visibleValue = parseVisibleCalculationNumber(surface.visibleText, `${label} ${check.key}.${item.quantity} ${surface.id}`);
        const tolerance = visibleCalculationTolerance(surface.visibleText);
        if (!Number.isFinite(sourceValue) || !Number.isFinite(tolerance) || Math.abs(sourceValue - visibleValue) > tolerance) {
          throw new Error(`${label} ${check.key}.${item.quantity} ${surface.id} visible value mismatch: ${JSON.stringify({ sourceValue, visibleValue, visibleText: surface.visibleText, tolerance })}`);
        }
        if (item.unit && !surface.visibleText.endsWith(item.unit)) {
          throw new Error(`${label} ${check.key}.${item.quantity} ${surface.id} visible unit mismatch: ${surface.visibleText}`);
        }
        if (!surface.boundText.includes(surface.visibleText) || !surface.boundText.includes(normalizedLabel)) {
          throw new Error(`${label} ${check.key}.${item.quantity} must remain bound to its ${surface.id} row: ${surface.visibleText}`);
        }
        assertions.push({
          assertionId: `${check.key}:${item.quantity}:${surface.id}`,
          sourcePath: `report.checks.${check.key}.${item.quantity}`,
          surface: surface.surface,
          comparison: 'numeric-within-tolerance',
          sourceValue,
          visibleValue,
          visibleText: surface.visibleText,
          tolerance,
        });
      }
    }
    for (const [index, equationLine] of (check.equationLines || []).entries()) {
      const expectedText = normalizeVisibleCalculationText(equationLine);
      const surfaces = [
        { id: 'report-popup', surface: 'report-popup-calculation-detail', visibleText: normalizedPopup },
        { id: 'approved-html', surface: 'approved-html-calculation-detail', visibleText: normalizedApproved },
      ];
      for (const surface of surfaces) {
        if (!expectedText || !surface.visibleText.includes(expectedText)) {
          throw new Error(`${label} ${check.key} equation ${index + 1} must match source on ${surface.id}: ${expectedText}`);
        }
        assertions.push({
          assertionId: `${check.key}:equation:${index + 1}:${surface.id}`,
          sourcePath: `report.checks.${check.key}.equationLines.${index}`,
          surface: surface.surface,
          comparison: 'exact-visible-text',
          sourceValue: expectedText,
          visibleValue: expectedText,
          visibleText: expectedText,
        });
      }
      const numericTokens = [...new Set(expectedText.match(/-?\d[\d,.]*(?:\s*(?:kN-m|kN|rad))?/g) || [])];
      if (numericTokens.length === 0) {
        throw new Error(`${label} ${check.key} equation ${index + 1} lacks a source-derived PDF formula token: ${expectedText}`);
      }
      for (const [tokenIndex, token] of numericTokens.entries()) {
        if (!pdfDetailText.includes(token)) {
          throw new Error(`${label} ${check.key} equation ${index + 1} rendered PDF detail missing numeric token ${token}: ${pdfDetailText}`);
        }
        assertions.push({
          assertionId: `${check.key}:equation:${index + 1}:rendered-pdf-token:${tokenIndex + 1}`,
          sourcePath: `report.checks.${check.key}.equationLines.${index}.numericTokens.${tokenIndex}`,
          surface: 'rendered-pdf-extracted-text-calculation-token',
          comparison: 'exact-visible-text',
          sourceValue: token,
          visibleValue: token,
          visibleText: token,
        });
      }
    }
  }
  if (assertions.length <= 8) {
    throw new Error(`${label} visible calculation reconciliation must record more than eight actual comparisons: ${assertions.length}`);
  }
  return assertions;
}

async function assertLegacyReportPopup(cdp, sessionId, options) {
  const sourceExport = options.sourcePayloadBuilder
    ? await evaluate(cdp, sessionId, `(() => {
        const builder = window[${JSON.stringify(options.sourcePayloadBuilder)}];
        if (typeof builder !== 'function') throw new Error('missing source payload builder ${options.sourcePayloadBuilder}');
         const payload = builder();
         window.__steelSourceReplayPayload = payload;
        const button = document.querySelector('#exportSourceJsonBtn');
        if (!button) throw new Error('missing #exportSourceJsonBtn');
        const originalCreateObjectURL = URL.createObjectURL;
        const originalRevokeObjectURL = URL.revokeObjectURL;
        const originalAnchorClick = HTMLAnchorElement.prototype.click;
        let download = null;
        try {
          URL.createObjectURL = () => 'blob:steel-connection-source-json-browser-test';
          URL.revokeObjectURL = () => {};
          HTMLAnchorElement.prototype.click = function captureSourceDownload() {
            download = { filename: this.download || '', href: this.href || '' };
          };
          button.click();
        } finally {
          URL.createObjectURL = originalCreateObjectURL;
          URL.revokeObjectURL = originalRevokeObjectURL;
          HTMLAnchorElement.prototype.click = originalAnchorClick;
        }
        return {
          payload,
          download,
          status: document.querySelector('#exportReportStatus')?.textContent || '',
        };
      })()`, `${options.label} source payload`)
    : null;
  const sourcePayload = sourceExport?.payload || null;
  let sourceReplayState = null;
  if (sourcePayload && options.sourceReplay) {
    sourceReplayState = await assertSourceJsonReplay(cdp, sessionId, { ...options.sourceReplay, label: options.label });
  }
  const popup = await openLegacyReportPopup(cdp, sessionId, options.label, options.buttonSelector);
  const snapshot = await evaluate(cdp, popup.sessionId, `(() => ({
    title: document.title || '',
    header: document.querySelector('h1')?.innerText?.trim() || '',
    bodyText: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim(),
    html: document.documentElement?.outerHTML || '',
    escapeProbeImageCount: Array.from(document.querySelectorAll('img')).filter(node =>
      String(node.getAttribute('onerror') || '').includes('__steelXss')).length,
    escapeProbeExecuted: window.__steelXss === 1,
    metaRows: Array.from(document.querySelectorAll('.meta div')).map((node) => (node.innerText || '').replace(/\\s+/g, ' ').trim()),
    sectionHeadings: Array.from(document.querySelectorAll('.paper h3')).map((node) => (node.innerText || '').replace(/\\s+/g, ' ').trim()),
    tableRows: Array.from(document.querySelectorAll('table tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('th, td')).map((cell) => (cell.innerText || '').replace(/\\s+/g, ' ').trim())),
  }))()`, `${options.label} snapshot`);
  const approvalState = await captureReportApprovalState(cdp, popup.sessionId, options.label);
  const dualSealEvidence = verifySteelApprovedHtml(approvalState, options.label);
  const approvedVisibleText = AttachmentPackageChecker.extractHtmlVisibleContent(approvalState.approvedHtml).text;
  for (const needle of options.absentNeedles || []) {
    if (approvedVisibleText.includes(needle) || approvalState.approvedHtml.includes(needle)) {
      throw new Error(`${options.label} approved HTML should exclude ${needle}`);
    }
  }
  if (options.renderEvidenceKey) {
    await verifySteelTextDownload(
      cdp,
      popup.sessionId,
      options.label,
      options.renderEvidenceKey,
      [
        ...(options.artifactRequiredNeedles || []),
        ...(options.domAndTextRequiredNeedles || []),
        ...(options.textOnlyRequiredNeedles || []),
      ],
      options.absentNeedles
    );
  }
  const headerNeedle = options.headerNeedle || options.titleNeedle;
  if (!snapshot.title.includes(options.titleNeedle) || !snapshot.header.includes(headerNeedle)) {
    throw new Error(`${options.label} title mismatch: ${JSON.stringify(snapshot)}`);
  }
  const forbiddenNeedles = [
    '優先建議報告閱讀狀態',
    '報告閱讀狀態',
    '頁面輔助',
    '頁面顯示，不進計算書、列印或 PDF',
    '不會寫入計算書或列印 PDF',
    '計畫名稱 / 編號 / 設計人尚未完整',
    ...FORMAL_REPORT_REFERENCE_NEEDLES,
    ...CALCULATION_BOOK_UI_ONLY_NEEDLES,
    '審查摘要',
    ...(Array.isArray(options.absentNeedles) ? options.absentNeedles : []),
  ];
  for (const needle of forbiddenNeedles) {
    if (snapshot.bodyText.includes(needle)) {
      throw new Error(`${options.label} should exclude "${needle}": ${snapshot.bodyText}`);
    }
  }
  for (const needle of [
    ...(options.artifactRequiredNeedles || []),
    ...(options.reportOnlyRequiredNeedles || []),
    ...(options.domAndTextRequiredNeedles || []),
  ]) {
    if (!snapshot.bodyText.includes(needle)) {
      throw new Error(`${options.label} should include "${needle}": ${snapshot.bodyText}`);
    }
  }
  for (const expectedRow of options.expectedCheckRows || []) {
    const row = snapshot.tableRows.find((cells) => cells[0]?.startsWith(expectedRow.label));
    if (!row) {
      throw new Error(`${options.label} should include check row ${expectedRow.label}: ${JSON.stringify(snapshot.tableRows)}`);
    }
    if (row[1] !== expectedRow.demand || row[2] !== expectedRow.available) {
      throw new Error(
        `${options.label} ${expectedRow.label} value mismatch: expected ${expectedRow.demand} / ${expectedRow.available}, got ${row[1]} / ${row[2]}`,
      );
    }
  }
  if (options.escapeProbeNeedle
      && (snapshot.escapeProbeImageCount !== 0 || snapshot.escapeProbeExecuted || !snapshot.bodyText.includes(options.escapeProbeNeedle))) {
    throw new Error(`${options.label} should render the XSS probe as visible text only: ${JSON.stringify(snapshot)}`);
  }
  if (options.escapeProbeNeedle) {
    if (!approvedVisibleText.includes(options.escapeProbeNeedle) || approvalState.approvedHtml.includes(options.escapeProbeNeedle)) {
      throw new Error(`${options.label} approved HTML should preserve escaped XSS-probe text without an executable tag`);
    }
  }
  const legacyConclusionIndex = snapshot.sectionHeadings.lastIndexOf('檢核結論');
  if (legacyConclusionIndex < 0 || legacyConclusionIndex !== snapshot.sectionHeadings.length - 1) {
    throw new Error(`${options.label} should place 檢核結論 after calculation content: ${JSON.stringify(snapshot.sectionHeadings)}`);
  }
  const nameRow = snapshot.metaRows.find(row => row.startsWith('計畫名稱')) || '';
  const tagRow = snapshot.metaRows.find(row => /^(?:計畫編號|接頭編號)/.test(row)) || '';
  const designerRow = snapshot.metaRows.find(row => /^(?:設計人員|設計人)/.test(row)) || '';
  if (options.expectedProject.name ? !nameRow.includes(options.expectedProject.name) : Boolean(nameRow)) {
    throw new Error(`${options.label} project name mismatch: ${JSON.stringify(snapshot.metaRows)}`);
  }
  if (options.expectedProject.tag ? !tagRow.includes(options.expectedProject.tag) : Boolean(tagRow)) {
    throw new Error(`${options.label} connection tag mismatch: ${JSON.stringify(snapshot.metaRows)}`);
  }
  if (options.expectedProject.designer ? !designerRow.includes(options.expectedProject.designer) : Boolean(designerRow)) {
    throw new Error(`${options.label} project designer mismatch: ${JSON.stringify(snapshot.metaRows)}`);
  }
  if (options.adoptedPlaceholderNeedle && !snapshot.bodyText.includes(options.adoptedPlaceholderNeedle)) {
    throw new Error(`${options.label} should preserve the blank adopted input without emitting a project metadata row: ${snapshot.bodyText}`);
  }
  assertFormalReportTraceText(snapshot.bodyText, options.label);
  if (snapshot.bodyText.includes('DRAFT')) {
    throw new Error(`${options.label} should not render a DRAFT banner: ${snapshot.bodyText}`);
  }
  let reportFingerprint = '';
  if (sourcePayload) {
    reportFingerprint = snapshot.bodyText.match(/計算指紋\s*(CF-[0-9A-F]{16})/)?.[1] || '';
    if (sourcePayload.schemaVersion !== 1 || sourcePayload.kind !== 'formal-calculation-source') {
      throw new Error(`${options.label} invalid source payload envelope: ${JSON.stringify(sourcePayload)}`);
    }
    if (!sourcePayload.tool?.name || !sourcePayload.tool?.version || !sourcePayload.fields?.connectionType) {
      throw new Error(`${options.label} incomplete source payload trace/input fields: ${JSON.stringify(sourcePayload)}`);
    }
    if (sourcePayload.project?.no !== options.expectedProject.tag) {
      throw new Error(`${options.label} source payload project mismatch: ${JSON.stringify(sourcePayload.project)}`);
    }
    for (const [key, expectedValue] of Object.entries(options.expectedSourceFields || {})) {
      if (sourcePayload.fields?.[key] !== expectedValue) {
        throw new Error(`${options.label} source payload field ${key} mismatch: ${JSON.stringify(sourcePayload.fields?.[key])}`);
      }
    }
    if (Number.isInteger(options.expectedSourceFieldCount)
        && Object.keys(sourcePayload.fields || {}).length !== options.expectedSourceFieldCount) {
      throw new Error(`${options.label} source payload must contain exactly ${options.expectedSourceFieldCount} fields: ${Object.keys(sourcePayload.fields || {}).length}`);
    }
    if (!sourceExport.download?.filename?.endsWith('.json') || !sourceExport.status.includes(sourcePayload.calculationFingerprint)) {
      throw new Error(`${options.label} source JSON download/status mismatch: ${JSON.stringify(sourceExport)}`);
    }
    if (!reportFingerprint || sourcePayload.calculationFingerprint !== reportFingerprint || sourcePayload.report?.calculationFingerprint !== reportFingerprint) {
      throw new Error(`${options.label} source/report fingerprint mismatch: ${sourcePayload.calculationFingerprint} / ${sourcePayload.report?.calculationFingerprint} / ${reportFingerprint}`);
    }
  }
  if (options.renderEvidenceKey) {
    const htmlEvidence = saveSteelApprovedHtml(options.renderEvidenceKey, approvalState.approvedHtml);
    const evidence = await renderAndValidateReportPdf(cdp, {
      html: approvalState.approvedHtml,
      outputDir: renderedEvidenceDir,
      artifactName: options.renderEvidenceKey,
      label: options.label,
      renderer: 'steel-formal-attachment',
      contentBoundaryProfile: 'traceable-calculation-book',
      titleNeedle: options.titleNeedle,
      requiredNeedles: [options.titleNeedle, ...(options.expectedProject.name ? ['計畫名稱'] : []), ...(options.adoptedPlaceholderNeedle ? [options.adoptedPlaceholderNeedle] : []), '檢核結論', '文件狀態：正式附件', '核可時間', ...FORMAL_REPORT_TRACE_LABELS, ...(options.artifactRequiredNeedles || []), ...(options.reportOnlyRequiredNeedles || [])],
      forbiddenNeedles,
      continuationContextLabels: options.continuationContextLabels || [],
    });
    const renderedPdfText = fs.readFileSync(evidence.pdf.textPath, 'utf8');
    assertFormalReportTraceText(renderedPdfText, `${options.label} rendered PDF`);
    const visibleCalculationAssertions = options.visibleCalculationCheckKeys
      ? buildSteelVisibleCalculationAssertions({
        sourcePayload,
        tableRows: snapshot.tableRows,
        approvedTableRows: approvalState.approvedTableRows,
        popupBodyText: snapshot.bodyText,
        approvedVisibleText,
        renderedPdfText,
        expectedCheckKeys: options.visibleCalculationCheckKeys,
        label: options.label,
      })
      : null;
    const resultReconciliation = buildSteelResultReconciliation({
      caseId: options.renderEvidenceKey,
      sourcePayload,
      replayCalculationFingerprint: sourceReplayState?.replayFingerprint,
      reportCalculationFingerprint: reportFingerprint,
      verifiedAssertionCount: visibleCalculationAssertions?.length || 8,
      ...(visibleCalculationAssertions ? { verifiedAssertions: visibleCalculationAssertions } : {}),
    });
    renderedEvidenceRecords.push({
      key: options.renderEvidenceKey,
      renderer: evidence.renderer,
      artifact: path.basename(evidence.pdfPath),
      evidence: path.basename(evidence.evidencePath),
      pageCount: evidence.pdf.pageCount,
      textLength: evidence.pdf.textLength,
      calculationFingerprint: reportFingerprint,
      resultReconciliation,
      requiredNeedles: [options.titleNeedle, ...(options.artifactRequiredNeedles || [])],
      evidenceRole: 'approved-formal-attachment',
      documentClass: 'formal-attachment',
      approvedAt: approvalState.approvedAt,
      ...htmlEvidence,
      ...dualSealEvidence,
    });
  }
  return {
    captureSessionId: popup.sessionId,
    captureTargetId: popup.targetId,
  };
}

async function openFormalReportPopup(cdp, sessionId, label, buttonSelector = '#btnReport') {
  const beforeTargets = await cdp.send('Target.getTargets');
  const existingTargetIds = new Set(
    (beforeTargets.targetInfos || [])
      .filter((info) => info.type === 'page')
      .map((info) => info.targetId)
  );
  await evaluate(cdp, sessionId, `(() => {
    const button = document.querySelector(${JSON.stringify(buttonSelector)});
    if (!button) throw new Error('missing ${buttonSelector}');
    button.click();
    return true;
  })()`, `${label} open report`);
  const popupTarget = await waitForNewPageTarget(cdp, existingTargetIds, `${label} target`);
  const attached = await cdp.send('Target.attachToTarget', { targetId: popupTarget.targetId, flatten: true });
  const popupSessionId = attached.sessionId;
  await cdp.send('Page.enable', {}, popupSessionId);
  await cdp.send('Runtime.enable', {}, popupSessionId);
  await waitForPopupReady(cdp, popupSessionId, `${label} ready`);
  return {
    targetId: popupTarget.targetId,
    sessionId: popupSessionId,
  };
}

async function openLegacyReportPopup(cdp, sessionId, label, buttonSelector) {
  const beforeTargets = await cdp.send('Target.getTargets');
  const existingTargetIds = new Set(
    (beforeTargets.targetInfos || [])
      .filter((info) => info.type === 'page')
      .map((info) => info.targetId)
  );
  await evaluate(cdp, sessionId, `(() => {
    const button = document.querySelector(${JSON.stringify(buttonSelector)});
    if (!button) throw new Error('missing ${buttonSelector}');
    button.click();
    return true;
  })()`, `${label} open report`);
  const popupTarget = await waitForNewPageTarget(cdp, existingTargetIds, `${label} target`);
  const attached = await cdp.send('Target.attachToTarget', { targetId: popupTarget.targetId, flatten: true });
  const popupSessionId = attached.sessionId;
  await cdp.send('Page.enable', {}, popupSessionId);
  await cdp.send('Runtime.enable', {}, popupSessionId);
  await waitForPopupReady(cdp, popupSessionId, `${label} ready`);
  return {
    targetId: popupTarget.targetId,
    sessionId: popupSessionId,
  };
}

async function waitForNewPageTarget(cdp, existingTargetIds, label, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await cdp.send('Target.getTargets');
    const targetInfo = (result.targetInfos || []).find((info) => info.type === 'page' && !existingTargetIds.has(info.targetId));
    if (targetInfo) return targetInfo;
    await wait(100);
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

async function waitForPopupReady(cdp, sessionId, label, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const state = await evaluate(cdp, sessionId, `(() => ({
        readyState: document.readyState || '',
        title: document.title || '',
        bodyText: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim(),
      }))()`, label);
      if (state.readyState === 'complete' && state.title && state.bodyText.includes('計算書') && state.bodyText.length > 80) {
        return state;
      }
    } catch (_) {}
    await wait(100);
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

async function verifySteelDirectPrintBlock(cdp, page) {
  const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
  let sessionId;
  try {
    const attached = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
    sessionId = attached.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    const loadEvent = waitForEvent(cdp, 'Page.loadEventFired', sessionId, () => true, 45000);
    await cdp.send('Page.navigate', { url: `${baseUrl}${page.url}` }, sessionId);
    await loadEvent;
    const screenStateDeadline = Date.now() + 5000;
    let screenState;
    do {
      screenState = await evaluate(cdp, sessionId, `(() => {
        const boundary = document.querySelector('.steel-formal-direct-print-boundary');
        const stylesheet = document.querySelector('link[href$="direct-print-boundary.css"]');
        return {
          bodyClass: document.body?.classList.contains('steel-formal-output-page') || false,
          boundaryExists: Boolean(boundary),
          boundaryRects: boundary?.getClientRects().length || 0,
          stylesheetExists: Boolean(stylesheet),
          stylesheetLoaded: Boolean(stylesheet?.sheet),
        };
      })()`, `${page.key} screen direct-print state`);
      if (screenState.bodyClass && screenState.boundaryExists && screenState.boundaryRects === 0 && screenState.stylesheetExists && screenState.stylesheetLoaded) break;
      await wait(100);
    } while (Date.now() < screenStateDeadline);
    if (!screenState.bodyClass) throw new Error(`${page.key} missing steel-formal-output-page body class`);
    if (!screenState.boundaryExists) throw new Error(`${page.key} missing steel formal direct-print notice`);
    if (screenState.boundaryRects !== 0) throw new Error(`${page.key} direct-print notice must stay hidden on screen`);
    if (!screenState.stylesheetExists || !screenState.stylesheetLoaded) {
      throw new Error(`${page.key} shared direct-print stylesheet is unavailable`);
    }

    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
    await wait(150);
    const printState = await evaluate(cdp, sessionId, `(() => {
      const clean = value => String(value || '').replace(/\\s+/g, ' ').trim();
      const boundary = document.querySelector('.steel-formal-direct-print-boundary');
      const visibleSiblings = Array.from(document.body?.children || [])
        .filter(node => node !== boundary && node.getClientRects().length > 0)
        .map(node => ({ tag: node.tagName, id: node.id || '', className: node.className || '' }));
      return {
        boundaryRects: boundary?.getClientRects().length || 0,
        boundaryText: clean(boundary?.innerText),
        visibleSiblings,
        bodyPseudo: clean([
          getComputedStyle(document.body, '::before').content,
          getComputedStyle(document.body, '::after').content,
        ].join(' ')),
      };
    })()`, `${page.key} print direct-print state`);
    if (printState.boundaryRects === 0) throw new Error(`${page.key} direct-print notice is not visible in print media`);
    if (printState.visibleSiblings.length > 0) {
      throw new Error(`${page.key} still prints work-page children: ${JSON.stringify(printState.visibleSiblings)}`);
    }
    for (const needle of [STEEL_DIRECT_PRINT_TITLE, STEEL_DIRECT_PRINT_BODY]) {
      if (!printState.boundaryText.includes(needle)) throw new Error(`${page.key} print notice missing ${needle}`);
    }
    if (/DRAFT|非正式附件/i.test(printState.bodyPseudo)) {
      throw new Error(`${page.key} direct print must not create a draft calculation-book classification`);
    }

    const pdfResult = await cdp.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.25,
      marginBottom: 0.25,
      marginLeft: 0.25,
      marginRight: 0.25,
    }, sessionId);
    const pdfPath = path.join(directPrintOutputDir, `${page.key}.pdf`);
    fs.writeFileSync(pdfPath, Buffer.from(pdfResult.data || '', 'base64'));
    const pdf = validatePdfFile(pdfPath, {
      label: `${page.key} work-page direct-print block`,
      contentBoundaryProfile: 'direct-print-boundary',
      titleNeedle: STEEL_DIRECT_PRINT_TITLE,
      requiredNeedles: [STEEL_DIRECT_PRINT_TITLE, '此頁是操作介面，不是計算書', '產生計算書', '本頁不得作為'],
      forbiddenNeedles: [page.pageTitle, '計畫名稱', 'DRAFT', '非正式附件'],
      minTextLength: 60,
    });
    if (pdf.pageCount !== 1) throw new Error(`${page.key} direct-print block must be one page, got ${pdf.pageCount}`);
    return {
      key: page.key,
      url: page.url,
      pdfPath,
      textPath: pdf.textPath,
      pageCount: pdf.pageCount,
      textLength: pdf.textLength,
      screenBoundaryRects: screenState.boundaryRects,
      printBoundaryRects: printState.boundaryRects,
      visibleSiblingCount: printState.visibleSiblings.length,
    };
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { media: 'screen' }, sessionId).catch(() => {});
    await cdp.send('Target.closeTarget', { targetId: created.targetId }).catch(() => {});
  }
}

async function runSnapshot(cdp, scenario, viewport) {
  const label = `${scenario.name}-${viewport.label}`;
  log(`Edge CDP snapshot [${label}] ${viewport.width}x${viewport.height}`);
  const records = { consoleErrors: [], networkAlerts: [], requestMap: new Map() };
  const targetIds = [];
  const removeEventListeners = [];
  let sessionId;
  let captureSessionId;
  try {
    const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
    targetIds.push(created.targetId);
    const attached = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
    sessionId = attached.sessionId;
    captureSessionId = sessionId;
    removeEventListeners.push(cdp.onEvent(message => collectPageEvent(records, message, sessionId)));

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    }, sessionId);

    const loadEvent = waitForEvent(cdp, 'Page.loadEventFired', sessionId, () => true, 45000);
    await cdp.send('Page.navigate', { url: `${baseUrl}${scenario.url}` }, sessionId);
    await loadEvent;
    await wait(300);
    if (scenario.setup) await scenario.setup(cdp, sessionId);
    if (scenario.url === '/index.html') {
      const pageIdentity = await evaluate(cdp, sessionId, `(() => ({
        heading: String(document.querySelector('h1')?.textContent || '').replace(/\\s+/g, ' ').trim(),
        title: String(document.title || '').replace(/\\s+/g, ' ').trim(),
      }))()`, `${label} canonical page identity`);
      if (pageIdentity.heading !== MAIN_ROUTE_CANONICAL_PAGE_TITLE || pageIdentity.title !== MAIN_ROUTE_CANONICAL_PAGE_TITLE) {
        throw new Error(`${label} should preserve canonical main route title ${MAIN_ROUTE_CANONICAL_PAGE_TITLE}: ${JSON.stringify(pageIdentity)}`);
      }
    }
    if (scenario.assert) {
      const assertResult = await scenario.assert(cdp, sessionId, { scenario, viewport });
      if (assertResult?.captureSessionId) captureSessionId = assertResult.captureSessionId;
      if (assertResult?.captureTargetId) targetIds.push(assertResult.captureTargetId);
    }
    await wait(300);

    const snapshotText = await makeSnapshot(cdp, captureSessionId, label, viewport);
    const screenshotBuffer = await captureScreenshot(cdp, captureSessionId, viewport);
    const output = writeScenarioArtifacts(label, snapshotText, screenshotBuffer, records);
    const consoleErrors = records.consoleErrors.length;
    const networkAlerts = records.networkAlerts.length;
    return {
      label,
      snapshot: output.snapshotPath,
      screenshot: output.screenshotPath,
      console: output.consolePath,
      network: output.networkPath,
      consoleErrors,
      networkAlerts,
      failures: [
        ...(consoleErrors > 0 ? [`${label}: consoleErrors=${consoleErrors}`] : []),
        ...(networkAlerts > 0 ? [`${label}: networkAlerts=${networkAlerts}`] : []),
      ],
    };
  } catch (error) {
    const output = writeScenarioArtifacts(label, `Page URL: ${baseUrl}${scenario.url}\nScenario: ${label}\nERROR: ${error.message}\n`, Buffer.alloc(0), records);
    return {
      label,
      snapshot: output.snapshotPath,
      screenshot: output.screenshotPath,
      console: output.consolePath,
      network: output.networkPath,
      consoleErrors: records.consoleErrors.length,
      networkAlerts: records.networkAlerts.length,
      failures: [`${label}: ${error.message}`],
    };
  } finally {
    for (const remove of removeEventListeners.reverse()) {
      try { remove(); } catch (_) {}
    }
    for (const targetId of targetIds.reverse()) {
      await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    }
  }
}

function collectPageEvent(records, message, sessionId) {
  if (message.sessionId !== sessionId) return;
  const params = message.params || {};
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(params.type)) {
    const text = (params.args || []).map(arg => arg.value ?? arg.description ?? '').join(' ');
    records.consoleErrors.push(`[${params.type}] ${text}`.trim());
  }
  if (message.method === 'Runtime.exceptionThrown') {
    records.consoleErrors.push(params.exceptionDetails?.text || params.exceptionDetails?.exception?.description || 'Runtime exception');
  }
  if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(params.entry?.level)) {
    const level = params.entry.level;
    const text = params.entry.text || '';
    if (level === 'error') records.consoleErrors.push(`[log] ${text}`.trim());
  }
  if (message.method === 'Network.requestWillBeSent') {
    records.requestMap.set(params.requestId, { method: params.request?.method || 'GET', url: params.request?.url || '' });
  }
  if (message.method === 'Network.responseReceived') {
    const status = params.response?.status || 0;
    const url = params.response?.url || records.requestMap.get(params.requestId)?.url || '';
    if (status >= 400 && !isIgnoredNetworkUrl(url)) {
      const method = records.requestMap.get(params.requestId)?.method || 'GET';
      records.networkAlerts.push(`${method} ${url} ${status}`);
    }
  }
}

function isIgnoredNetworkUrl(url) {
  return !url || url.startsWith('data:') || url.startsWith('blob:') || /\/favicon\.ico(?:$|[?#])/.test(url);
}

async function makeSnapshot(cdp, sessionId, label, viewport) {
  const value = await evaluate(cdp, sessionId, `(() => ({
    url: location.href,
    title: document.title,
    text: document.body ? document.body.innerText : '',
    activeElement: document.activeElement ? document.activeElement.tagName : ''
  }))()`, `${label} snapshot`);
  return [
    `Page URL: ${value.url}`,
    `Title: ${value.title}`,
    `Scenario: ${label}`,
    `Viewport: ${viewport.width}x${viewport.height}`,
    `Active Element: ${value.activeElement}`,
    '',
    value.text || '',
  ].join('\n');
}

async function captureScreenshot(cdp, sessionId, viewport) {
  const metrics = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
  const contentSize = metrics.cssContentSize || metrics.contentSize || { width: viewport.width, height: viewport.height };
  const width = Math.max(viewport.width, Math.ceil(contentSize.width || viewport.width));
  const height = Math.max(viewport.height, Math.ceil(contentSize.height || viewport.height));
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  }, sessionId);
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  }, sessionId);
  return Buffer.from(result.data || '', 'base64');
}

function writeScenarioArtifacts(label, snapshotText, screenshotBuffer, records) {
  const snapshotPath = path.join(outputDir, `playwright-${label}.txt`);
  const screenshotPath = path.join(outputDir, `playwright-${label}.png`);
  const consolePath = path.join(outputDir, `playwright-${label}-console.txt`);
  const networkPath = path.join(outputDir, `playwright-${label}-network.txt`);
  const snapshotHistoryPath = path.join(historyDir, `playwright-${label}.txt`);
  const screenshotHistoryPath = path.join(historyDir, `playwright-${label}.png`);
  const consoleHistoryPath = path.join(historyDir, `playwright-${label}-console.txt`);
  const networkHistoryPath = path.join(historyDir, `playwright-${label}-network.txt`);

  const consoleText = [`Errors: ${records.consoleErrors.length}`, ...records.consoleErrors].join('\n') + '\n';
  const networkText = [`Network alerts: ${records.networkAlerts.length}`, ...records.networkAlerts].join('\n') + '\n';
  fs.writeFileSync(snapshotPath, snapshotText, 'utf8');
  fs.writeFileSync(snapshotHistoryPath, snapshotText, 'utf8');
  fs.writeFileSync(consolePath, consoleText, 'utf8');
  fs.writeFileSync(consoleHistoryPath, consoleText, 'utf8');
  fs.writeFileSync(networkPath, networkText, 'utf8');
  fs.writeFileSync(networkHistoryPath, networkText, 'utf8');
  if (screenshotBuffer.length > 0) {
    fs.writeFileSync(screenshotPath, screenshotBuffer);
    fs.writeFileSync(screenshotHistoryPath, screenshotBuffer);
  } else {
    fs.writeFileSync(screenshotPath, Buffer.alloc(0));
    fs.writeFileSync(screenshotHistoryPath, Buffer.alloc(0));
  }
  return { snapshotPath, screenshotPath, consolePath, networkPath };
}

async function main() {
  ensureDir(outputDir);
  ensureDir(historyDir);
  ensureDir(directPrintOutputDir);
  const records = [];
  const directPrintRecords = [];
  const directPrintFailures = [];
  const failures = [];
  const summaryLines = [];
  const cleanupWarnings = [];
  let browser;
  let cdp;
  try {
    browser = await launchEdge();
    cdp = new CdpConnection(browser.wsUrl);
    await cdp.open();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outputDir, eventsEnabled: true });
    for (const page of steelDirectPrintPages) {
      try {
        const record = await withTimeout(
          verifySteelDirectPrintBlock(cdp, page),
          scenarioTimeoutMs,
          `${page.key}-direct-print`
        );
        directPrintRecords.push(record);
        summaryLines.push(`- ${page.key} direct-print block: pdf=${record.pdfPath}`);
      } catch (error) {
        const failure = `${page.key}-direct-print: ${error.message || formatError(error)}`;
        directPrintFailures.push(failure);
        failures.push(failure);
        summaryLines.push(`- ${failure}`);
      }
    }
    for (const scenario of scenarios) {
      for (const viewport of viewports) {
        const record = await withTimeout(runSnapshot(cdp, scenario, viewport), scenarioTimeoutMs, `${scenario.name}-${viewport.label}`);
        records.push(record);
        summaryLines.push(`- ${record.label}: snapshot=${record.snapshot}`);
        summaryLines.push(`  screenshot=${record.screenshot}`);
        summaryLines.push(`  console=${record.console}`);
        summaryLines.push(`  network=${record.network}`);
        summaryLines.push(`  consoleErrors=${record.consoleErrors}, networkAlerts=${record.networkAlerts}`);
        failures.push(...record.failures);
      }
    }
  } catch (error) {
    const detail = formatError(error);
    failures.push(`audit-aborted: ${error.message || detail}`);
    summaryLines.push(`- audit-aborted: ${detail}`);
  } finally {
    if (cdp && cdp.ws) {
      await cdp.send('Browser.close').catch(() => {});
      await cdp.close().catch(() => {});
    }
    if (browser) {
      await wait(500);
      if (browser.child && !browser.child.killed) browser.child.kill('SIGKILL');
      try {
        fs.rmSync(browser.profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
      } catch (err) {
        cleanupWarnings.push(`profile cleanup warning: ${browser.profileDir}: ${err.message}`);
      }
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    runner: 'edge-cdp',
    records,
    directPrintRecords,
    textExportEvidenceRecords,
    ngSourceEvidenceRecords,
    failures,
    summaryLines,
    cleanupWarnings,
  };
  fs.writeFileSync(directPrintSummaryJson, JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl,
    expectedCount: steelDirectPrintPages.length,
    records: directPrintRecords,
    failures: directPrintFailures,
  }, null, 2) + '\n', 'utf8');
  const renderedSummary = failures.length === 0
    ? writeEvidenceSummary(
      renderedEvidenceDir,
      'steel-formal',
      renderedEvidenceRecords,
      ['steel-main-plate', 'steel-main-shear-tab', 'steel-main-column-splice', 'steel-main-gusset', 'steel-main-moment', 'steel-main-tension', 'steel-standalone-plate', 'steel-beam-formal', 'steel-column-formal']
    )
    : null;
  if (renderedSummary) {
    summaryLines.push(`- rendered delivery evidence: ${renderedSummary.summaryPath}`);
  }
  for (const warning of cleanupWarnings) {
    summaryLines.push(`- ${warning}`);
  }
  fs.writeFileSync(summaryJson, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  if (failures.length > 0) {
    console.error(`steel browser runner found ${failures.length} issue(s)`);
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
    return;
  }
  console.log(`steel browser runner OK (records=${records.length}, directPrintBlocks=${directPrintRecords.length}, textExports=${textExportEvidenceRecords.length}, ngSourceRoundTrips=${ngSourceEvidenceRecords.length}, runner=edge-cdp)`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
