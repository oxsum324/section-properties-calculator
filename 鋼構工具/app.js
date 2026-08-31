(function initSteelConnectionApp() {
  const { calculateConnection } = window.ShearConnectionCalculator;
  const SteelFormalUI = window.SteelFormalUI;
  const STEEL_TOOL_METADATA = window.SteelToolMetadata;
  if (!SteelFormalUI?.buildReportTrace) throw new Error("Steel formal report core is not loaded.");
  if (!STEEL_TOOL_METADATA) throw new Error("Steel tool metadata is not loaded.");
  const getFormalToolMetadata = (connectionType) => connectionType === "plate_check"
    ? STEEL_TOOL_METADATA.plate
    : connectionType === "tension_member"
      ? STEEL_TOOL_METADATA.tension
      : STEEL_TOOL_METADATA.connection;
  const withFormalToolVersion = (title, metadata) => `${title} ${metadata.version}`;
  const MAIN_SUITE_PAGE_TITLE = "鋼構正式規範核算工具";
  const IS_STANDALONE_PLATE = location.pathname.toLowerCase().includes("plate-check");
  const STORAGE_KEY = IS_STANDALONE_PLATE
    ? "steel-plate-check-draft-v2"
    : "steel-connection-suite-draft-v6";
  const UI_PREFS_KEY = IS_STANDALONE_PLATE
    ? "steel-plate-check-ui-v1"
    : "steel-connection-suite-ui-v1";
  const SINGLE_PLATE_SOURCE_FIELD_KEYS = [
    "projectName", "connectionTag", "designer", "notes", "designMethod", "connectionType", "exposureCondition",
    "requiredAxial", "requiredShear", "requiredMoment", "eccentricity",
    "boltDiameter", "holeType", "holeDiameter", "edgeFabrication", "boltUltimateStrength", "boltGrade", "threadsCondition", "deformationConsidered",
    "boltCount", "shearPlanes", "endDistance", "pitch", "plateThickness", "plateYieldStrength", "plateUltimateStrength", "transverseEdgeDistance",
    "plateHeight", "boltLineToWeldDistance", "weldEccentricity",
    "beamWebThickness", "beamWebYieldStrength", "beamWebUltimateStrength", "beamWebEndDistance", "beamWebEdgeDistance",
    "supportThickness", "supportYieldStrength", "supportUltimateStrength",
    "fillerThickness", "fillerExtended", "weldSize", "weldLength", "weldLineCount", "weldElectrodeStrength",
    "demandBasis", "geometryBasis", "materialBasis", "eccentricityBasis", "conventionalMaterialConfirmed", "connectionModelConfirmed",
  ];
  const SINGLE_PLATE_NUMBER_FIELDS = [
    "requiredAxial", "requiredShear", "requiredMoment", "eccentricity", "boltDiameter", "holeDiameter", "boltUltimateStrength",
    "boltCount", "shearPlanes", "endDistance", "pitch", "plateThickness", "plateYieldStrength", "plateUltimateStrength", "transverseEdgeDistance",
    "plateHeight", "boltLineToWeldDistance", "weldEccentricity", "beamWebThickness", "beamWebYieldStrength", "beamWebUltimateStrength",
    "beamWebEndDistance", "beamWebEdgeDistance", "supportThickness", "supportYieldStrength", "supportUltimateStrength", "fillerThickness",
    "weldSize", "weldLength", "weldLineCount", "weldElectrodeStrength",
  ];
  const GUSSET_SOURCE_FIELD_KEYS = [
    "projectName", "connectionTag", "designer", "notes", "designMethod", "connectionType", "exposureCondition",
    "requiredAxial", "requiredShear", "requiredMoment", "eccentricity",
    "boltDiameter", "holeType", "holeDiameter", "edgeFabrication", "boltUltimateStrength", "boltGrade", "threadsCondition", "deformationConsidered",
    "gussetBoltCount", "gussetShearPlanes", "gussetEndDistance", "gussetPitch", "gussetEdgeDistance",
    "gussetThickness", "gussetYieldStrength", "gussetUltimateStrength", "gussetConnectionWidth", "gussetNetWidth", "gussetWhitmoreConnectionLength", "gussetAvailableWidth",
    "braceSectionType", "braceEndDistance", "braceEdgeDistance", "braceThickness", "braceFy", "braceFu", "braceGrossWidth", "braceNetWidth",
    "weldSize", "weldLength", "weldLineCount", "weldFexx", "supportThickness", "supportFy", "supportFu",
    "gussetDemandBasis", "gussetGeometryBasis", "gussetMaterialBasis", "gussetModelBasis", "gussetStaticNonseismicConfirmed", "gussetLoadPathConfirmed",
  ];
  const GUSSET_NUMBER_FIELDS = [
    "requiredAxial", "requiredShear", "requiredMoment", "eccentricity", "boltDiameter", "holeDiameter", "boltUltimateStrength",
    "gussetBoltCount", "gussetShearPlanes", "gussetEndDistance", "gussetPitch", "gussetEdgeDistance",
    "gussetThickness", "gussetYieldStrength", "gussetUltimateStrength", "gussetConnectionWidth", "gussetNetWidth", "gussetWhitmoreConnectionLength", "gussetAvailableWidth",
    "braceEndDistance", "braceEdgeDistance", "braceThickness", "braceFy", "braceFu", "braceGrossWidth", "braceNetWidth",
    "weldSize", "weldLength", "weldLineCount", "weldFexx", "supportThickness", "supportFy", "supportFu",
  ];
  const MOMENT_SOURCE_FIELD_KEYS = [
    "projectName", "connectionTag", "designer", "notes", "designMethod", "connectionType", "exposureCondition",
    "momentFrameSystem", "momentAxis", "momentConnectionDesignRoute",
    "momentBeamPlasticModulus", "momentBeamYieldStrength", "momentExpectedStrengthFactor", "momentCriticalSectionDistance", "momentPlasticHingeSpan",
    "momentFarCriticalSectionExpectedMoment",
    "momentGravityShear", "momentAmplifiedShear", "momentAvailableFlexuralStrength", "momentAvailableShearStrength",
    "momentRotationDemandMethod", "momentQualifiedPlasticRotation", "momentNonlinearPlasticRotation", "momentSystemDuctilityR", "momentElasticStoryDrift",
    "momentQualificationRoute", "momentQualificationTestCount", "momentDesignBeamFlangeThickness", "momentTestBeamFlangeThickness",
    "momentDesignFlangePlasticRatio", "momentTestFlangePlasticRatio", "momentThirdPartyReviewConfirmed",
    "momentColumnWebYieldStrength", "momentColumnDepth", "momentPanelZoneThickness", "momentPanelZoneClearDepth", "momentPanelZoneClearWidth",
    "momentPanelZoneAnalysisDemand", "momentPanelZoneBeamMomentSum", "momentPanelZoneLeverArm", "momentDoublerPresent", "momentDoublerAttachmentConfirmed",
    "momentBeamFlangeWidth", "momentBeamFlangeThickness", "momentColumnFlangeLocalNominalStrength",
    "momentContinuityPlateProvidedConfirmed", "momentContinuityPlateWeldConfirmed", "momentBeamFlangeCompactnessRatio", "momentBeamWebCompactnessRatio",
    "momentBeamFlangePlasticModulusRatio", "momentCwUpperColumnMoment", "momentCwLowerColumnMoment", "momentCwLeftBeamMoment", "momentCwRightBeamMoment",
    "momentCcwUpperColumnMoment", "momentCcwLowerColumnMoment", "momentCcwLeftBeamMoment", "momentCcwRightBeamMoment",
    "momentDemandBasis", "momentGeometryBasis", "momentMaterialBasis", "momentCapacityBasis", "momentPanelZoneBasis", "momentStrongColumnBasis",
    "momentQualificationBasis", "momentQualificationEvidenceSha256", "momentCapacityEvidenceSha256",
    "momentQualificationConfigurationConfirmed", "momentQualificationMaterialConfirmed", "momentQualificationWeldingConfirmed",
    "momentQualificationGeometryConfirmed", "momentQualificationFabricationConfirmed", "momentQualificationProcedureConfirmed",
    "momentPlasticZoneGeometryConfirmed", "momentPlasticZoneOpeningsAbsentConfirmed", "momentSeismicMaterialConfirmed", "momentMatchingWeldConfirmed",
    "momentCns3506WeldConfirmed", "momentEndTabsRemovedGroundConfirmed", "momentWeldProcedureMatchesQualificationConfirmed",
    "momentJointLateralRestraintConfirmed", "momentBeamLateralBracingConfirmed", "momentAllMembersIncludedConfirmed",
    "momentColumnStrengthsAtGoverningAxialConfirmed", "momentOpposingDirectionsConfirmed", "momentOrthogonalDirectionSeparateConfirmed",
    "momentConnectionHardwareVerifiedConfirmed", "momentSelectedAxisScopeConfirmed",
  ];
  const MOMENT_NUMBER_FIELDS = [
    "momentBeamPlasticModulus", "momentBeamYieldStrength", "momentExpectedStrengthFactor", "momentCriticalSectionDistance", "momentPlasticHingeSpan",
    "momentFarCriticalSectionExpectedMoment",
    "momentGravityShear", "momentAmplifiedShear", "momentAvailableFlexuralStrength", "momentAvailableShearStrength",
    "momentQualifiedPlasticRotation", "momentNonlinearPlasticRotation", "momentSystemDuctilityR", "momentElasticStoryDrift", "momentQualificationTestCount",
    "momentDesignBeamFlangeThickness", "momentTestBeamFlangeThickness", "momentDesignFlangePlasticRatio", "momentTestFlangePlasticRatio",
    "momentColumnWebYieldStrength", "momentColumnDepth", "momentPanelZoneThickness", "momentPanelZoneClearDepth", "momentPanelZoneClearWidth",
    "momentPanelZoneAnalysisDemand", "momentPanelZoneBeamMomentSum", "momentPanelZoneLeverArm", "momentBeamFlangeWidth", "momentBeamFlangeThickness",
    "momentColumnFlangeLocalNominalStrength", "momentBeamFlangeCompactnessRatio", "momentBeamWebCompactnessRatio", "momentBeamFlangePlasticModulusRatio",
    "momentCwUpperColumnMoment", "momentCwLowerColumnMoment", "momentCwLeftBeamMoment", "momentCwRightBeamMoment",
    "momentCcwUpperColumnMoment", "momentCcwLowerColumnMoment", "momentCcwLeftBeamMoment", "momentCcwRightBeamMoment",
  ];
  const MOMENT_BOOLEAN_FIELDS = [
    "momentThirdPartyReviewConfirmed", "momentDoublerPresent", "momentDoublerAttachmentConfirmed", "momentContinuityPlateProvidedConfirmed",
    "momentContinuityPlateWeldConfirmed", "momentQualificationConfigurationConfirmed", "momentQualificationMaterialConfirmed",
    "momentQualificationWeldingConfirmed", "momentQualificationGeometryConfirmed", "momentQualificationFabricationConfirmed",
    "momentQualificationProcedureConfirmed", "momentPlasticZoneGeometryConfirmed", "momentPlasticZoneOpeningsAbsentConfirmed",
    "momentSeismicMaterialConfirmed", "momentMatchingWeldConfirmed", "momentCns3506WeldConfirmed", "momentEndTabsRemovedGroundConfirmed",
    "momentWeldProcedureMatchesQualificationConfirmed", "momentJointLateralRestraintConfirmed", "momentBeamLateralBracingConfirmed",
    "momentAllMembersIncludedConfirmed", "momentColumnStrengthsAtGoverningAxialConfirmed", "momentOpposingDirectionsConfirmed",
    "momentOrthogonalDirectionSeparateConfirmed", "momentConnectionHardwareVerifiedConfirmed", "momentSelectedAxisScopeConfirmed",
  ];
  const MOMENT_TEXT_FIELDS = [
    "projectName", "connectionTag", "designer", "notes", "momentDemandBasis", "momentGeometryBasis", "momentMaterialBasis", "momentCapacityBasis",
    "momentPanelZoneBasis", "momentStrongColumnBasis", "momentQualificationBasis", "momentQualificationEvidenceSha256", "momentCapacityEvidenceSha256",
  ];
  const SPLICE_SOURCE_FIELD_KEYS = [
    "projectName", "connectionTag", "designer", "notes", "designMethod", "connectionType", "exposureCondition",
    "spliceFrameRole", "spliceDesignRoute", "spliceLocationRoute", "spliceDistanceToNearestBeamFlange",
    "spliceDeadAxial", "spliceLiveAxial", "spliceSeismicAxial", "spliceLiveLoadFactor", "spliceSeismicReductionFu",
    "spliceTransferCapRoute", "spliceMaxTransferableAxial", "spliceAg", "spliceZx", "spliceZy", "spliceAvx", "spliceAvy",
    "spliceFy", "spliceFexx", "spliceMaxThickness", "spliceFabricationLocation", "spliceNdtMethod",
    "spliceDemandBasis", "spliceGeometryBasis", "spliceMaterialBasis", "spliceWpsBasis", "spliceNdtPlanBasis",
    "spliceDemandEvidenceSha256", "spliceDetailEvidenceSha256", "spliceWpsEvidenceSha256", "spliceNdtPlanEvidenceSha256",
    "spliceIdenticalSectionsAndMaterialConfirmed", "spliceAlignedAxesConfirmed", "spliceFullProfileCjpConfirmed", "spliceMatchingFillerConfirmed",
    "spliceWpsApprovedConfirmed", "spliceNdtFullCoverageConfirmed", "spliceNoPjpConfirmed", "spliceNoMixedLoadSharingConfirmed",
    "spliceSeismicColumnConfirmed", "spliceLocationScopeConfirmed", "spliceAllAdjacentTransferSourcesIncludedConfirmed", "spliceAsBuiltBoundaryConfirmed",
  ];
  const SPLICE_NUMBER_FIELDS = [
    "spliceDistanceToNearestBeamFlange", "spliceDeadAxial", "spliceLiveAxial", "spliceSeismicAxial", "spliceLiveLoadFactor",
    "spliceSeismicReductionFu", "spliceMaxTransferableAxial", "spliceAg", "spliceZx", "spliceZy", "spliceAvx", "spliceAvy",
    "spliceFy", "spliceFexx", "spliceMaxThickness",
  ];
  const SPLICE_BOOLEAN_FIELDS = [
    "spliceIdenticalSectionsAndMaterialConfirmed", "spliceAlignedAxesConfirmed", "spliceFullProfileCjpConfirmed", "spliceMatchingFillerConfirmed",
    "spliceWpsApprovedConfirmed", "spliceNdtFullCoverageConfirmed", "spliceNoPjpConfirmed", "spliceNoMixedLoadSharingConfirmed",
    "spliceSeismicColumnConfirmed", "spliceLocationScopeConfirmed", "spliceAllAdjacentTransferSourcesIncludedConfirmed", "spliceAsBuiltBoundaryConfirmed",
  ];
  const SPLICE_TEXT_FIELDS = [
    "projectName", "connectionTag", "designer", "notes", "spliceDemandBasis", "spliceGeometryBasis", "spliceMaterialBasis",
    "spliceWpsBasis", "spliceNdtPlanBasis", "spliceDemandEvidenceSha256", "spliceDetailEvidenceSha256", "spliceWpsEvidenceSha256",
    "spliceNdtPlanEvidenceSha256",
  ];

  const glossaryItems = [
    ["Pu / Pa", "需求軸力", "kN", "接頭於設計載重組合下應傳遞之軸力。", "柱續接、支撐接頭主控需求。"],
    ["Vu / Va", "需求剪力", "kN", "接頭於設計載重組合下應傳遞之剪力。", "剪力接頭、柱腹續接、梁柱腹板傳力。"],
    ["Mu / Ma", "需求彎矩", "kN-m", "接頭於設計載重組合下應傳遞之彎矩。", "柱續接與梁柱彎矩接頭主控需求。"],
    ["e_b / e_w", "栓群 / 銲群有效偏心", "mm", "力作用線分別至栓群與銲群重心之專案採用距離。", "Shear Tab 的彈性栓群、彈性銲群及板彎剪分析。"],
    ["db", "螺栓直徑", "mm", "螺栓標稱直徑。", "螺栓強度、孔距、邊距。"],
    ["dh", "螺栓孔徑", "mm", "螺栓孔之標稱孔徑。", "孔承壓、孔距、邊距；淨斷面另應依條文採用淨孔寬。"],
    ["Fub", "螺栓抗拉強度", "MPa", "螺栓材料規定最小抗拉強度。", "螺栓剪力與拉力。"],
    ["Fy / Fu", "鋼材降伏 / 抗拉強度", "MPa", "板件材料強度參數。", "總斷面降伏、淨斷面斷裂、塊狀撕裂。"],
    ["Lc", "力方向淨距", "mm", "孔邊至板邊或相鄰孔邊沿力方向之淨距。", "孔承壓強度。"],
    ["Ag / An", "總 / 淨斷面積", "mm²", "板件對應破壞路徑之總斷面積與淨斷面積。", "斷面降伏與斷裂。"],
    ["Agv / Anv", "剪力面全 / 淨面積", "mm²", "塊狀撕裂路徑之剪力面積。", "塊狀撕裂。"],
    ["Agt / Ant", "拉力面全 / 淨面積", "mm²", "塊狀撕裂路徑之拉力面積。", "塊狀撕裂。"],
    ["a", "銲腳尺寸", "mm", "填角銲腳長。", "銲道有效喉厚與強度。"],
    ["te", "有效銲喉厚", "mm", "依銲接型式定義之有效銲喉厚。", "部分滲透開槽銲與填角銲強度。"],
    ["Le", "有效銲長", "mm", "可參與傳力之有效銲道長度。", "銲接容量。"],
    ["FEXX", "銲材抗拉強度", "MPa", "銲材規定最小抗拉強度。", "銲道可用強度。"],
    ["CJP / PJP", "全 / 部分滲透開槽銲", "-", "依第 10.2 章分類之開槽銲型式。", "拉力構件銲接接合。"],
    ["塞孔銲 / 塞槽銲", "Plug / Slot Weld", "-", "以孔或槽之有效面積傳遞剪力之銲接型式。", "拉力構件銲接接合。"],
    ["Eamp", "放大地震軸力", "kN", "Eamp,raw = 1.4Fu|PE|；qualified 路線得再受 1.25Ptransfer 控制。", "13.4.1 柱續接軸壓力與軸拉力包絡。"],
    ["Zx / Zy", "強軸 / 弱軸塑性模數", "mm³", "相同且對齊之軋製 H 形柱塑性斷面模數。", "全斷面 CJP 強軸與弱軸彎曲強度等同性。"],
    ["Avx / Avy", "強軸 / 弱軸剪力面積", "mm²", "核定柱斷面在兩方向採用之有效剪力面積。", "全斷面 CJP 剪力強度。"],
    ["bg,gusset", "Gusset 栓孔斷面總寬", "mm", "Gusset 在栓孔斷面之 gross plate width，僅用於 Ag 與扣孔後 An；不是 Whitmore 初始寬度。", "Gusset 總／淨斷面。"],
    ["bnet", "Gusset 淨寬", "mm", "扣除孔洞後之有效淨寬。", "Gusset 淨斷面斷裂。"],
    ["Lconn", "Whitmore 栓群連接長度", "mm", "單一直線栓列首末螺栓中心距，必須等於 (n−1)s；fastener-group 起始寬度取 0。", "bW = 2Lconn tan30°。"],
    ["Mp / Mpr", "梁塑性／預期塑性彎矩", "kN-m", "Mp = ZbFyb；Mpr 再納入材料變異與應變硬化係數。", "補強式梁柱彎矩接頭之容量設計需求。"],
    ["Vp / Mu,face", "塑鉸剪力／柱面彎矩需求", "kN / kN-m", "由塑鉸間距與臨界斷面至柱面距離推導。", "接頭外部抗彎與抗剪容量核對。"],
    ["theta,p", "塑性轉角", "rad", "依構架系統固定值、非線性分析或 1.1(R-1)thetaE 決定。", "反覆載重資格證據核對。"],
    ["Vpz", "Panel Zone 剪力", "kN", "需求採分析值與梁端彎矩最低需求較大者，容量由柱腹板幾何與材料推導。", "梁柱接頭交會區剪力。"],
    ["SCWB", "強柱弱梁比", "-", "選定構架面之柱端彎矩總和除以梁端彎矩總和；補強式接頭每支梁項固定採 ZbFyb + Vp·x，正反向分別檢核。", "耐震構架整體能力審查。"],
    ["Tu / Ta", "需求拉力", "kN", "構材或連接板需傳遞之設計拉力需求。", "連接板與拉力構件主控需求。"],
    ["Ae", "有效淨斷面積", "mm²", "考慮剪力遲滯後之有效淨面積。", "受拉構材有效淨斷面斷裂。"],
    ["U", "剪力遲滯係數", "-", "依 4.3 規定、接合型式或試驗決定之折減係數，未必為固定值。", "Ae = UAn 或 Ae = UAg。"],
    ["l / W", "縱向銲長比", "-", "縱向銲接有效長度 l 與構材寬度 W 之比值。", "雙側縱向銲接時判定 U。"],
    ["L / r", "長細比", "-", "未支撐長度 L 除以迴轉半徑 r。", "受拉構材長細比檢核。"],
    ["s / g", "縱距 / 橫距", "mm", "栓孔中心平行與垂直於應力方向之距離。", "淨斷面與孔距規定。"],
    ["Ag", "全斷面面積", "mm²", "受力垂直截面之總斷面面積。", "全斷面降伏。"],
    ["An", "淨斷面面積", "mm²", "依規定扣除孔洞後之控制淨面積。", "淨斷面撕裂。"],
    ["沿力方向孔距 / 橫向孔距", "孔距", "mm", "規則孔群中，平行與垂直於力方向之孔中心距。", "連接板幾何與淨斷面路徑整理。"],
    ["輸入方式", "資料輸入方式", "-", "依模組可切換幾何輸入或面積輸入。", "決定計算書摘要與輸入欄位。"],
    ["主拉力方向", "主受力方向", "-", "用於判定受拉斷面與破壞路徑。", "連接板與拉力構件幾何路徑整理。"],
    ["Rn", "標稱強度", "kN", "未乘抗力折減係數或未除安全係數前之強度。", "中間計算值。"],
    ["phiRn / Rn/Omega", "可用強度", "kN", "LRFD 為 φRn；ASD 為 Rn / Ω，φ 或 Ω 應依破壞模式與條文類別分別採用。", "與需求比較之容量。"],
    ["DCR", "需求容量比", "-", "需求值除以可用強度。", "大於 1.0 即不符合。"],
  ].map(([symbol, name, unit, definition, usage]) => ({ symbol, name, unit, definition, usage }));

  const exampleStates = {
    single_plate: {
      projectName: "示範剪力接頭",
      connectionTag: "ST-01",
      designer: "",
      notes: "",
      designMethod: "LRFD",
      connectionType: "single_plate",
      exposureCondition: "painted",
      requiredAxial: 0,
      requiredShear: 180,
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
      pitch: 70,
      plateThickness: 12,
      plateYieldStrength: 325,
      plateUltimateStrength: 490,
      transverseEdgeDistance: 60,
      plateHeight: 300,
      boltLineToWeldDistance: 65,
      weldEccentricity: 65,
      beamWebThickness: 9,
      beamWebYieldStrength: 325,
      beamWebUltimateStrength: 490,
      beamWebEndDistance: 45,
      beamWebEdgeDistance: 60,
      supportThickness: 16,
      supportYieldStrength: 325,
      supportUltimateStrength: 490,
      fillerThickness: 0,
      fillerExtended: "true",
      weldSize: 8,
      weldLength: 260,
      weldLineCount: 2,
      weldElectrodeStrength: 490,
      demandBasis: "示例資料（請依專案覆寫）",
      geometryBasis: "示例資料（請依專案覆寫）",
      materialBasis: "示例資料（請依專案覆寫）",
      eccentricityBasis: "示例資料（請依專案覆寫）",
      conventionalMaterialConfirmed: "false",
      connectionModelConfirmed: "false",
    },
    column_splice: {
      projectName: "全斷面 CJP 耐震柱續接審查算例",
      connectionTag: "CS-01",
      designer: "",
      notes: "相同軋製 H 形柱、形心軸對齊、全斷面 CJP；本附件為耐震能力審查，不是柱構件完整設計或既有銲道驗收。",
      designMethod: "LRFD",
      connectionType: "column_splice",
      exposureCondition: "painted",
      spliceFrameRole: "seismic_force_resisting",
      spliceDesignRoute: "cjp_full_section_identical_rolled_h",
      spliceLocationRoute: "beam_flange_1200",
      spliceDistanceToNearestBeamFlange: 1500,
      spliceDeadAxial: -1000,
      spliceLiveAxial: -300,
      spliceSeismicAxial: 700,
      spliceLiveLoadFactor: 0.5,
      spliceSeismicReductionFu: 1,
      spliceTransferCapRoute: "uncapped",
      spliceMaxTransferableAxial: 0,
      spliceAg: 30000,
      spliceZx: 8000000,
      spliceZy: 2500000,
      spliceAvx: 12000,
      spliceAvy: 8000,
      spliceFy: 345,
      spliceFexx: 490,
      spliceMaxThickness: 30,
      spliceFabricationLocation: "field",
      spliceNdtMethod: "UT",
      spliceDemandBasis: "示例資料（請依專案覆寫分析模型與 13.4.1 組合）",
      spliceGeometryBasis: "示例資料（請依專案覆寫核定續接圖與斷面）",
      spliceMaterialBasis: "示例資料（請依專案覆寫上下柱與銲材證明）",
      spliceWpsBasis: "示例資料（請依專案覆寫核定 WPS／PQR）",
      spliceNdtPlanBasis: "示例資料（請依專案覆寫 UT／RT 檢測計畫）",
      spliceDemandEvidenceSha256: "",
      spliceDetailEvidenceSha256: "",
      spliceWpsEvidenceSha256: "",
      spliceNdtPlanEvidenceSha256: "",
      spliceIdenticalSectionsAndMaterialConfirmed: "false",
      spliceAlignedAxesConfirmed: "true",
      spliceFullProfileCjpConfirmed: "true",
      spliceMatchingFillerConfirmed: "true",
      spliceWpsApprovedConfirmed: "false",
      spliceNdtFullCoverageConfirmed: "false",
      spliceNoPjpConfirmed: "true",
      spliceNoMixedLoadSharingConfirmed: "true",
      spliceSeismicColumnConfirmed: "false",
      spliceLocationScopeConfirmed: "false",
      spliceAllAdjacentTransferSourcesIncludedConfirmed: "false",
      spliceAsBuiltBoundaryConfirmed: "false",
    },
    brace_gusset: {
      projectName: "Gusset V1 正式算例",
      connectionTag: "BG-01",
      designer: "",
      notes: "LRFD 平板支撐正軸向同心拉力；U=1.0、Ae=An；靜力、非耐震、非 BRB。",
      designMethod: "LRFD",
      connectionType: "brace_gusset",
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
      deformationConsidered: "true",
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
      gussetDemandBasis: "分析模型 STR-GS-01／ULS 拉力包絡 Pu = 400 kN",
      gussetGeometryBasis: "核定接頭圖 S-503／BG-01 尺寸表",
      gussetMaterialBasis: "鋼材規格 Fy=325、Fu=490 MPa；F10T 螺栓與 E70 系列銲材證明",
      gussetModelBasis: "專案接頭圖確認平板支撐矩形截面全元素直接連接、單一直線承壓栓列與 Gusset 兩側縱向填角銲串聯力流",
      gussetStaticNonseismicConfirmed: "true",
      gussetLoadPathConfirmed: "true",
    },
    beam_column_moment: {
      projectName: "梁柱彎矩接頭耐震審查算例",
      connectionTag: "BM-01",
      designer: "",
      notes: "SMRF 補強式接頭、X 向單一構架面；容量採外部受控詳算，本附件不等同完整接頭設計或 AISC 358 預認證。",
      designMethod: "LRFD",
      connectionType: "beam_column_moment",
      exposureCondition: "painted",
      momentFrameSystem: "smrf",
      momentAxis: "x",
      momentConnectionDesignRoute: "reinforced",
      momentBeamPlasticModulus: 5000000,
      momentBeamYieldStrength: 325,
      momentExpectedStrengthFactor: 1.1,
      momentCriticalSectionDistance: 500,
      momentPlasticHingeSpan: 8000,
      momentFarCriticalSectionExpectedMoment: 770,
      momentGravityShear: 100,
      momentAmplifiedShear: 600,
      momentAvailableFlexuralStrength: 2400,
      momentAvailableShearStrength: 700,
      momentRotationDemandMethod: "default",
      momentQualifiedPlasticRotation: 0.04,
      momentNonlinearPlasticRotation: 0.025,
      momentSystemDuctilityR: 4,
      momentElasticStoryDrift: 0.01,
      momentQualificationRoute: "direct_test",
      momentQualificationTestCount: 2,
      momentDesignBeamFlangeThickness: 20,
      momentTestBeamFlangeThickness: 20,
      momentDesignFlangePlasticRatio: 0.75,
      momentTestFlangePlasticRatio: 0.75,
      momentThirdPartyReviewConfirmed: "false",
      momentColumnWebYieldStrength: 345,
      momentColumnDepth: 600,
      momentPanelZoneThickness: 40,
      momentPanelZoneClearDepth: 500,
      momentPanelZoneClearWidth: 400,
      momentPanelZoneAnalysisDemand: 1600,
      momentPanelZoneBeamMomentSum: 1000,
      momentPanelZoneLeverArm: 550,
      momentDoublerPresent: "false",
      momentDoublerAttachmentConfirmed: "true",
      momentBeamFlangeWidth: 250,
      momentBeamFlangeThickness: 20,
      momentColumnFlangeLocalNominalStrength: 3200,
      momentContinuityPlateProvidedConfirmed: "true",
      momentContinuityPlateWeldConfirmed: "true",
      momentBeamFlangeCompactnessRatio: 0.9,
      momentBeamWebCompactnessRatio: 0.9,
      momentBeamFlangePlasticModulusRatio: 0.75,
      momentCwUpperColumnMoment: 2500,
      momentCwLowerColumnMoment: 2500,
      momentCwLeftBeamMoment: 1850,
      momentCwRightBeamMoment: 1850,
      momentCcwUpperColumnMoment: 2500,
      momentCcwLowerColumnMoment: 2500,
      momentCcwLeftBeamMoment: 1850,
      momentCcwRightBeamMoment: 1850,
      momentDemandBasis: "示例資料（請依專案覆寫分析模型與控制組合）",
      momentGeometryBasis: "示例資料（請依專案覆寫核定接頭圖）",
      momentMaterialBasis: "示例資料（請依專案覆寫鋼材與銲材證明）",
      momentCapacityBasis: "示例資料（請依專案覆寫接頭硬體完整詳算）",
      momentPanelZoneBasis: "示例資料（請依專案覆寫交會區分析）",
      momentStrongColumnBasis: "示例資料（請依專案覆寫柱項與各梁 ZbFyb + Vp·x）",
      momentQualificationBasis: "示例資料（請依專案覆寫反覆載重資格證據）",
      momentQualificationEvidenceSha256: "",
      momentCapacityEvidenceSha256: "",
      momentQualificationConfigurationConfirmed: "false",
      momentQualificationMaterialConfirmed: "false",
      momentQualificationWeldingConfirmed: "false",
      momentQualificationGeometryConfirmed: "false",
      momentQualificationFabricationConfirmed: "false",
      momentQualificationProcedureConfirmed: "false",
      momentPlasticZoneGeometryConfirmed: "true",
      momentPlasticZoneOpeningsAbsentConfirmed: "true",
      momentSeismicMaterialConfirmed: "true",
      momentMatchingWeldConfirmed: "true",
      momentCns3506WeldConfirmed: "true",
      momentEndTabsRemovedGroundConfirmed: "true",
      momentWeldProcedureMatchesQualificationConfirmed: "true",
      momentJointLateralRestraintConfirmed: "true",
      momentBeamLateralBracingConfirmed: "true",
      momentAllMembersIncludedConfirmed: "true",
      momentColumnStrengthsAtGoverningAxialConfirmed: "true",
      momentOpposingDirectionsConfirmed: "true",
      momentOrthogonalDirectionSeparateConfirmed: "true",
      momentConnectionHardwareVerifiedConfirmed: "false",
      momentSelectedAxisScopeConfirmed: "false",
    },
    plate_check: {
      projectName: "示範連接板檢核",
      connectionTag: "PL-01",
      designer: "",
      notes: "",
      designMethod: "LRFD",
      connectionType: "plate_check",
      exposureCondition: "painted",
      requiredAxial: 0,
      requiredShear: 0,
      requiredMoment: 0,
      requiredTension: 620,
      eccentricity: 0,
      boltDiameter: 22,
      holeDiameter: 24,
      holeType: "standard",
      edgeFabrication: "rolled",
      boltUltimateStrength: 1000,
      threadsCondition: "included",
      deformationConsidered: "true",
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
      grossArea: 6720,
      netArea: 4992,
      Agv: 5760,
      Anv: 4608,
      Agt: 6720,
      Ant: 4992,
      netSectionMode: "straight_only",
      blockShearMode: "auto_with_override",
      useManualBlockShearPath: "false",
      manualAgv: 0,
      manualAnv: 0,
      manualAgt: 0,
      manualAnt: 0,
      showPlateSketch: "true",
    },
    tension_member: {
      projectName: "示範拉力構件",
      connectionTag: "TM-01",
      designer: "",
      notes: "拉力構件模組整合構材本體與接合細部檢核",
      designMethod: "LRFD",
      connectionType: "tension_member",
      exposureCondition: "painted",
      requiredAxial: 0,
      requiredShear: 0,
      requiredMoment: 0,
      requiredTension: 620,
      eccentricity: 0,
      boltDiameter: 22,
      holeDiameter: 24,
      holeType: "standard",
      edgeFabrication: "rolled",
      boltUltimateStrength: 1000,
      threadsCondition: "included",
      deformationConsidered: "true",
      tensionConnectionMode: "bolted",
      tensionSectionType: "connection_plate",
      tensionAreaInput: "geometry",
      memberYieldStrength: 325,
      memberUltimateStrength: 490,
      memberWidth: 220,
      memberThickness: 16,
      tensionGrossArea: 3520,
      tensionNetArea: 2752,
      tensionEffectiveNetArea: 2752,
      tensionShearLagFactor: 0.85,
      tensionShearLagCase: "connection_plate_cap",
      unsupportedLength: 3600,
      radiusOfGyration: 22,
      tensionBoltLineCount: 3,
      tensionBoltRowCount: 2,
      tensionShearPlanes: 2,
      tensionEndDistance: 55,
      tensionPitchLongitudinal: 80,
      tensionGaugeTransverse: 70,
      tensionEdgeDistanceNear: 40,
      tensionEdgeDistanceFar: 40,
      tensionUseManualBlockAreas: "false",
      tensionAgv: 6080,
      tensionAnv: 4776,
      tensionAgt: 3520,
      tensionAnt: 2752,
      tensionWeldCase: "plate_longitudinal_both_sides",
      tensionWeldType: "fillet",
      tensionWeldSize: 10,
      tensionWeldLengthLongitudinal: 260,
      tensionWeldLengthTransverse: 0,
      tensionWeldLineCount: 2,
      tensionWeldElectrodeStrength: 490,
      tensionConnectedThickness: 16,
      tensionWeldEffectiveThroat: 0,
      tensionWeldOpeningWidth: 0,
      tensionWeldOpeningLength: 0,
      tensionWeldOpeningCount: 1,
      tensionLapLength: 120,
      tensionWeldMatchingFiller: "true",
      tensionDirectConnectedArea: 0,
    },
  };

  const examplePresets = {
    single_plate: [
      { id: "single_plate_standard", label: "剪力接頭｜標準單剪力板", state: exampleStates.single_plate },
    ],
    column_splice: [
      { id: "column_splice_cjp_seismic", label: "柱續接示例｜需依專案覆寫證據後才可核可", state: exampleStates.column_splice },
    ],
    brace_gusset: [
      { id: "brace_gusset_standard", label: "Gusset｜平板支撐軸力接頭", state: exampleStates.brace_gusset },
    ],
    beam_column_moment: [
      { id: "beam_column_moment_seismic_review", label: "梁柱彎矩示例｜需依專案覆寫證據後才可核可", state: exampleStates.beam_column_moment },
    ],
    plate_check: [
      { id: "plate_geometry", label: "連接板｜幾何推導", state: exampleStates.plate_check },
      {
        id: "plate_area_manual",
        label: "連接板｜面積直輸",
        state: {
          ...exampleStates.plate_check,
          projectName: "示範連接板檢核",
          connectionTag: "PL-02",
          notes: "本案 Ag、An、Agv、Anv、Agt、Ant 採設計指定值。",
          plateInputMode: "area_manual",
          grossArea: 6720,
          netArea: 4992,
          Agv: 5760,
          Anv: 4608,
          Agt: 6720,
          Ant: 4992,
          showPlateSketch: "false",
        },
      },
    ],
    tension_member: [
      { id: "tension_bolted_plate", label: "拉力構件｜螺栓接續板", state: exampleStates.tension_member },
      {
        id: "tension_welded_plate",
        label: "拉力構件｜雙側縱向銲接鋼板", state: {
          ...exampleStates.tension_member,
          projectName: "示範拉力構件",
          connectionTag: "TM-02",
          notes: "雙側縱向銲接鋼板，Ae 依 UAg 處理",
          tensionConnectionMode: "welded",
          tensionSectionType: "general_shape",
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
          tensionWeldEffectiveThroat: 0,
          tensionWeldOpeningWidth: 0,
          tensionWeldOpeningLength: 0,
          tensionWeldOpeningCount: 1,
          tensionLapLength: 140,
          tensionWeldMatchingFiller: "true",
          tensionDirectConnectedArea: 0,
          tensionShearLagFactor: 1,
          requiredTension: 420,
        },
      },
      {
        id: "tension_welded_cjp",
        label: "拉力構件｜全滲透開槽銲", state: {
          ...exampleStates.tension_member,
          projectName: "示範拉力構件",
          connectionTag: "TM-04",
          notes: "全滲透開槽銲接頭，依 10.2.4 採母材有效面積控制，並檢查相稱銲材。",
          tensionConnectionMode: "welded",
          tensionSectionType: "general_shape",
          tensionWeldCase: "transverse_direct",
          tensionWeldType: "groove_cjp",
          memberWidth: 180,
          memberThickness: 16,
          tensionConnectedThickness: 16,
          tensionWeldSize: 0,
          tensionWeldEffectiveThroat: 0,
          tensionWeldLengthLongitudinal: 0,
          tensionWeldLengthTransverse: 180,
          tensionWeldLineCount: 1,
          tensionDirectConnectedArea: 2880,
          tensionWeldElectrodeStrength: 490,
          tensionWeldMatchingFiller: "true",
          requiredTension: 480,
        },
      },
      {
        id: "tension_manual_area",
        label: "拉力構件｜面積輸入核算", state: {
          ...exampleStates.tension_member,
          projectName: "示範拉力構件",
          connectionTag: "TM-03",
          notes: "本案 Ag、An、Ae 與區塊剪力面積採設計指定值。",
          tensionConnectionMode: "bolted",
          tensionAreaInput: "manual",
          tensionShearLagCase: "manual_u",
          tensionShearLagFactor: 0.82,
          tensionGrossArea: 3520,
          tensionNetArea: 2752,
          tensionEffectiveNetArea: 2256.64,
          tensionAgv: 6080,
          tensionAnv: 4776,
          tensionAgt: 3520,
          tensionAnt: 2752,
          requiredTension: 540,
        },
      },
    ],
  };

  const defaultState = {
    ...exampleStates.tension_member,
    ...exampleStates.plate_check,
    ...exampleStates.column_splice,
    ...exampleStates.brace_gusset,
    ...exampleStates.beam_column_moment,
    ...exampleStates.single_plate,
  };

  const toolReferences = [
    {
      name: "SkyCiv Connection Design",
      url: "https://skyciv.com/structural-software/connection-design-software/",
      adopted: "借鏡其將輸入、控制破壞模式、計算書與幾何示意整合在同一工作流的做法。",
    },
    {
      name: "ClearCalcs Bolt Group / Steel Tools",
      url: "https://clearcalcs.com/",
      adopted: "借鏡其把利用率、控制案例與條文提醒放在同一結果頁，強化可讀性。",
    },
    {
      name: "Dlubal Steel Joints",
      url: "https://www.dlubal.com/",
      adopted: "借鏡其報表導向的結果整理方式，將派生面積、控制項與細部限制分開呈現。",
    },
    {
      name: "AISC Design Examples / Tension Member References",
      url: "https://www.aisc.org/publications/design-examples/",
      adopted: "借鏡其以案例驗證極限狀態與有效淨面積 Ae 的呈現方式，用於範例案例配置。",
    },
  ];

  const sharedGroups = [
    {
      title: "基本資料",
      items: [
        ["projectName", "計畫名稱"],
        ["connectionTag", "接頭編號"],
        ["designer", "設計人"],
        ["notes", "設計備註"],
        ["designMethod", "設計法"],
        ["connectionType", "接頭型式"],
        ["requiredAxial", "需求軸力", "kN"],
        ["requiredShear", "需求剪力", "kN"],
        ["requiredMoment", "需求彎矩", "kN-m"],
        ["eccentricity", "栓群有效偏心 e_b", "mm"],
        ["exposureCondition", "暴露條件"],
      ],
    },
    {
      title: "共用螺栓與孔型",
      items: [
        ["boltDiameter", "螺栓直徑 db", "mm"],
        ["holeDiameter", "孔徑 dh", "mm"],
        ["holeType", "孔型"],
        ["edgeFabrication", "邊緣加工型式"],
        ["boltUltimateStrength", "Fub", "MPa"],
        ["threadsCondition", "螺紋是否位於剪斷面"],
        ["deformationConsidered", "使用載重下承壓變形為設計考量"],
      ],
    },
  ];

  const specificGroups = {
    single_plate: [
      {
        title: "剪力接頭資料",
        items: [
          ["boltGrade", "螺栓規格等級"],
          ["boltCount", "螺栓數量", "支"],
          ["shearPlanes", "剪斷面數"],
          ["endDistance", "端距 e", "mm"],
          ["pitch", "孔距 s", "mm"],
          ["plateThickness", "板厚 tp", "mm"],
          ["transverseEdgeDistance", "自由邊距 g", "mm"],
          ["plateHeight", "剪力板高度 hp", "mm"],
          ["boltLineToWeldDistance", "栓列至銲線距離 a", "mm"],
          ["weldEccentricity", "銲群有效偏心 e_w", "mm"],
          ["plateYieldStrength", "Fy,p", "MPa"],
          ["plateUltimateStrength", "Fu,p", "MPa"],
          ["beamWebThickness", "腹板厚 tw", "mm"],
          ["beamWebYieldStrength", "Fy,w", "MPa"],
          ["beamWebUltimateStrength", "Fu,w", "MPa"],
          ["beamWebEndDistance", "梁腹板端距 e_bw", "mm"],
          ["beamWebEdgeDistance", "梁腹板最小橫向邊距 g_bw", "mm"],
          ["supportThickness", "支承材厚 ts", "mm"],
          ["supportYieldStrength", "Fy,s", "MPa"],
          ["supportUltimateStrength", "Fu,s", "MPa"],
          ["fillerThickness", "填板厚度", "mm"],
          ["fillerExtended", "填板延伸"],
          ["weldSize", "銲腳尺寸 a", "mm"],
          ["weldLength", "有效銲長 Le", "mm"],
          ["weldLineCount", "銲道數量"],
          ["weldElectrodeStrength", "FEXX", "MPa"],
          ["demandBasis", "剪力需求來源"],
          ["geometryBasis", "幾何資料來源"],
          ["materialBasis", "材料資料來源"],
          ["eccentricityBasis", "偏心模型來源"],
          ["conventionalMaterialConfirmed", "AISC conventional 材料延性等同性確認"],
          ["connectionModelConfirmed", "工程師確認模型"],
        ],
      },
    ],
    column_splice: [
      {
        title: "13.4 耐震需求與適用路線",
        items: [
          ["spliceFrameRole", "構架角色"],
          ["spliceDesignRoute", "續接設計路線"],
          ["spliceLocationRoute", "續接位置路線"],
          ["spliceDistanceToNearestBeamFlange", "至最近梁翼緣距離", "mm"],
          ["spliceDeadAxial", "死載軸力 D（拉正壓負）", "kN"],
          ["spliceLiveAxial", "活載軸力 L（拉正壓負）", "kN"],
          ["spliceSeismicAxial", "未放大地震軸力 E（拉正壓負）", "kN"],
          ["spliceLiveLoadFactor", "活載係數 fL"],
          ["spliceSeismicReductionFu", "13.4.1 結構系統地震力折減係數 Fu"],
          ["spliceTransferCapRoute", "相鄰構件最大可傳遞軸力路線"],
          ["spliceMaxTransferableAxial", "最大可傳遞軸力", "kN"],
        ],
      },
      {
        title: "全斷面 CJP 容量資料",
        items: [
          ["spliceAg", "全斷面面積 Ag", "mm²"],
          ["spliceZx", "強軸塑性模數 Zx", "mm³"],
          ["spliceZy", "弱軸塑性模數 Zy", "mm³"],
          ["spliceAvx", "強軸剪力有效面積 Avx", "mm²"],
          ["spliceAvy", "弱軸剪力有效面積 Avy", "mm²"],
          ["spliceFy", "柱鋼材 Fy", "MPa"],
          ["spliceFexx", "相稱銲材 FEXX", "MPa"],
          ["spliceMaxThickness", "接合最大母材厚度", "mm"],
          ["spliceFabricationLocation", "製作位置"],
          ["spliceNdtMethod", "全覆蓋 NDT 方法"],
        ],
      },
      {
        title: "依據、證據與失敗封閉確認",
        items: [
          ["spliceDemandBasis", "需求依據"],
          ["spliceGeometryBasis", "幾何依據"],
          ["spliceMaterialBasis", "材料依據"],
          ["spliceWpsBasis", "WPS／PQR 依據"],
          ["spliceNdtPlanBasis", "NDT 計畫依據"],
          ["spliceDemandEvidenceSha256", "需求證據 SHA-256"],
          ["spliceDetailEvidenceSha256", "續接細部證據 SHA-256"],
          ["spliceWpsEvidenceSha256", "WPS 證據 SHA-256"],
          ["spliceNdtPlanEvidenceSha256", "NDT 計畫證據 SHA-256"],
          ["spliceIdenticalSectionsAndMaterialConfirmed", "上下柱同材質、同軋製 H 形斷面確認"],
          ["spliceAlignedAxesConfirmed", "形心軸對齊確認"],
          ["spliceFullProfileCjpConfirmed", "全斷面 CJP 確認"],
          ["spliceMatchingFillerConfirmed", "相稱銲材確認"],
          ["spliceWpsApprovedConfirmed", "WPS／PQR 核定確認"],
          ["spliceNdtFullCoverageConfirmed", "NDT 全覆蓋確認"],
          ["spliceNoPjpConfirmed", "未採 PJP 確認"],
          ["spliceNoMixedLoadSharingConfirmed", "未採混合分擔確認"],
          ["spliceSeismicColumnConfirmed", "耐震系統柱確認"],
          ["spliceLocationScopeConfirmed", "1,200 mm 位置路線確認"],
          ["spliceAllAdjacentTransferSourcesIncludedConfirmed", "相鄰構件轉移來源完整性"],
          ["spliceAsBuiltBoundaryConfirmed", "既有銲道驗收排除邊界確認"],
        ],
      },
    ],
    brace_gusset: [
      {
        title: "平板支撐 Gusset V1 接頭資料",
        items: [
          ["boltGrade", "螺栓規格等級"],
          ["gussetBoltCount", "Gusset 螺栓數", "支"],
          ["gussetShearPlanes", "剪斷面數"],
          ["gussetEndDistance", "Gusset 端距 eg", "mm"],
          ["gussetPitch", "共同孔距 sg", "mm"],
          ["gussetEdgeDistance", "Gusset 邊距 gg", "mm"],
          ["gussetThickness", "Gusset 厚度 tg", "mm"],
          ["gussetYieldStrength", "Gusset Fy", "MPa"],
          ["gussetUltimateStrength", "Gusset Fu", "MPa"],
          ["gussetConnectionWidth", "Gusset 栓孔斷面總寬 bg,gusset", "mm"],
          ["gussetNetWidth", "Gusset 有效淨寬 bnet", "mm"],
          ["gussetWhitmoreConnectionLength", "Whitmore 栓群連接長度 Lconn=(n−1)s", "mm"],
          ["gussetAvailableWidth", "Whitmore 可用板寬", "mm"],
          ["braceSectionType", "支撐材截面型式"],
          ["braceEndDistance", "支撐材端距 eb", "mm"],
          ["braceEdgeDistance", "支撐材邊距 gb", "mm"],
          ["braceThickness", "支撐材厚度 tb", "mm"],
          ["braceFy", "支撐材 Fy", "MPa"],
          ["braceFu", "支撐材 Fu", "MPa"],
          ["braceGrossWidth", "支撐材總寬 bg", "mm"],
          ["braceNetWidth", "支撐材淨寬 bn", "mm"],
          ["weldSize", "雙側縱向銲腳 a", "mm"],
          ["weldLength", "各側有效銲長 Le", "mm"],
          ["weldLineCount", "縱向銲道數量"],
          ["weldFexx", "銲材 FEXX", "MPa"],
          ["supportThickness", "支承材厚度 ts", "mm"],
          ["supportFy", "支承材 Fy", "MPa"],
          ["supportFu", "支承材 Fu", "MPa"],
          ["gussetDemandBasis", "設計拉力來源"],
          ["gussetGeometryBasis", "幾何資料來源"],
          ["gussetMaterialBasis", "材料資料來源"],
          ["gussetModelBasis", "接頭模型來源"],
          ["gussetStaticNonseismicConfirmed", "靜力、非耐震、非 BRB 確認"],
          ["gussetLoadPathConfirmed", "串聯力流與單一直線栓列確認"],
        ],
      },
    ],
    beam_column_moment: [
      {
        title: "耐震需求與外部容量",
        items: [
          ["momentFrameSystem", "構架系統"],
          ["momentAxis", "選定構架面"],
          ["momentConnectionDesignRoute", "接頭設計路線"],
          ["momentBeamPlasticModulus", "梁塑性模數 Zb", "mm³"],
          ["momentBeamYieldStrength", "梁鋼材 Fyb", "MPa"],
          ["momentExpectedStrengthFactor", "預期強度／應變硬化係數 beta"],
          ["momentCriticalSectionDistance", "臨界斷面至柱面 x", "mm"],
          ["momentPlasticHingeSpan", "塑鉸間距 Lh", "mm"],
          ["momentFarCriticalSectionExpectedMoment", "對端臨界斷面預期塑性彎矩 Mpr,far", "kN-m"],
          ["momentGravityShear", "1.2D+0.5L 重力剪力", "kN"],
          ["momentAmplifiedShear", "13.3-1 放大組合剪力上限", "kN"],
          ["momentAvailableFlexuralStrength", "外部接頭可用撓曲強度", "kN-m"],
          ["momentAvailableShearStrength", "外部接頭可用剪力強度", "kN"],
        ],
      },
      {
        title: "塑性轉角與資格證據",
        items: [
          ["momentRotationDemandMethod", "轉角需求決定方式"],
          ["momentQualifiedPlasticRotation", "資格可提供塑性轉角", "rad"],
          ["momentNonlinearPlasticRotation", "非線性分析最大塑性轉角", "rad"],
          ["momentSystemDuctilityR", "系統韌性容量 R"],
          ["momentElasticStoryDrift", "設計地震最大層間變位角 thetaE", "rad"],
          ["momentQualificationRoute", "資格證據路線"],
          ["momentQualificationTestCount", "代表性試體數", "組"],
          ["momentDesignBeamFlangeThickness", "設計梁翼厚", "mm"],
          ["momentTestBeamFlangeThickness", "試驗梁翼厚", "mm"],
          ["momentDesignFlangePlasticRatio", "設計梁翼塑性模數比"],
          ["momentTestFlangePlasticRatio", "試驗梁翼塑性模數比"],
          ["momentThirdPartyReviewConfirmed", "公正第三者審查確認"],
          ["momentQualificationConfigurationConfirmed", "試驗構造配置一致"],
          ["momentQualificationMaterialConfirmed", "試驗材料一致"],
          ["momentQualificationWeldingConfirmed", "試驗銲接一致"],
          ["momentQualificationGeometryConfirmed", "試驗尺寸一致"],
          ["momentQualificationFabricationConfirmed", "試驗施工方法一致"],
          ["momentQualificationProcedureConfirmed", "試驗施工流程一致"],
        ],
      },
      {
        title: "Panel Zone、連續板與梁斷面",
        items: [
          ["momentColumnWebYieldStrength", "柱腹板 Fy", "MPa"],
          ["momentColumnDepth", "柱深 dc", "mm"],
          ["momentPanelZoneThickness", "Panel Zone 總厚 tp", "mm"],
          ["momentPanelZoneClearDepth", "Panel Zone dz", "mm"],
          ["momentPanelZoneClearWidth", "Panel Zone wz", "mm"],
          ["momentPanelZoneAnalysisDemand", "分析 Panel Zone 需求", "kN"],
          ["momentPanelZoneBeamMomentSum", "梁端彎矩合計 Sigma Mp", "kN-m"],
          ["momentPanelZoneLeverArm", "Panel Zone 等效力臂", "mm"],
          ["momentDoublerPresent", "Panel Zone 置合板"],
          ["momentDoublerAttachmentConfirmed", "置合板銜接確認"],
          ["momentBeamFlangeWidth", "梁翼寬 bfb", "mm"],
          ["momentBeamFlangeThickness", "梁翼厚 tfb", "mm"],
          ["momentColumnFlangeLocalNominalStrength", "柱翼板局部標稱拉力強度 Rn", "kN"],
          ["momentContinuityPlateProvidedConfirmed", "連續板設置確認"],
          ["momentContinuityPlateWeldConfirmed", "連續板銲接確認"],
          ["momentBeamFlangeCompactnessRatio", "梁翼 lambda/lambda_pd"],
          ["momentBeamWebCompactnessRatio", "梁腹 lambda/lambda_pd"],
          ["momentBeamFlangePlasticModulusRatio", "梁翼／全斷面塑性模數比"],
        ],
      },
      {
        title: "強柱弱梁與附件邊界",
        items: [
          ["momentCwUpperColumnMoment", "CW 上柱彎矩", "kN-m"],
          ["momentCwLowerColumnMoment", "CW 下柱彎矩", "kN-m"],
          ["momentCwLeftBeamMoment", "CW 左梁 ZbFyb + Vp·x", "kN-m"],
          ["momentCwRightBeamMoment", "CW 右梁 ZbFyb + Vp·x", "kN-m"],
          ["momentCcwUpperColumnMoment", "CCW 上柱彎矩", "kN-m"],
          ["momentCcwLowerColumnMoment", "CCW 下柱彎矩", "kN-m"],
          ["momentCcwLeftBeamMoment", "CCW 左梁 ZbFyb + Vp·x", "kN-m"],
          ["momentCcwRightBeamMoment", "CCW 右梁 ZbFyb + Vp·x", "kN-m"],
          ["momentDemandBasis", "需求依據"],
          ["momentGeometryBasis", "幾何依據"],
          ["momentMaterialBasis", "材料依據"],
          ["momentCapacityBasis", "容量依據"],
          ["momentPanelZoneBasis", "Panel Zone 依據"],
          ["momentStrongColumnBasis", "強柱弱梁依據"],
          ["momentQualificationBasis", "資格證據說明"],
          ["momentQualificationEvidenceSha256", "資格證據 SHA-256"],
          ["momentCapacityEvidenceSha256", "接頭容量證據 SHA-256"],
          ["momentPlasticZoneGeometryConfirmed", "塑性區斷面確認"],
          ["momentPlasticZoneOpeningsAbsentConfirmed", "塑性區未驗證開孔排除"],
          ["momentSeismicMaterialConfirmed", "耐震材料確認"],
          ["momentMatchingWeldConfirmed", "相稱銲材確認"],
          ["momentCns3506WeldConfirmed", "CNS 3506 銲材確認"],
          ["momentEndTabsRemovedGroundConfirmed", "導銲板切除磨平確認"],
          ["momentWeldProcedureMatchesQualificationConfirmed", "WPS 與資格一致"],
          ["momentJointLateralRestraintConfirmed", "接頭側向束制確認"],
          ["momentBeamLateralBracingConfirmed", "梁／塑鉸側向支撐確認"],
          ["momentAllMembersIncludedConfirmed", "選定構架面構件完整性"],
          ["momentColumnStrengthsAtGoverningAxialConfirmed", "柱控制軸力下強度確認"],
          ["momentOpposingDirectionsConfirmed", "正反向合力確認"],
          ["momentOrthogonalDirectionSeparateConfirmed", "正交方向另案確認"],
          ["momentConnectionHardwareVerifiedConfirmed", "接頭硬體詳算確認"],
          ["momentSelectedAxisScopeConfirmed", "單一方向附件邊界確認"],
        ],
      },
    ],
    plate_check: [
      {
        title: "連接板基本資料",
        items: [
          ["plateInputMode", "板件面積採用方式"],
          ["requiredTension", "需求拉力", "kN"],
          ["loadDirection", "主受力方向"],
          ["plateThickness", "板厚 t", "mm"],
          ["plateYieldStrength", "Fy", "MPa"],
          ["plateUltimateStrength", "Fu", "MPa"],
          ["showPlateSketch", "幾何示意"],
        ],
      },
      {
        title: "連接板幾何推導",
        modes: ["geometry"],
        items: [
          ["plateWidth", "板寬", "mm"],
          ["plateLength", "板長", "mm"],
          ["lineCount", "水平孔行數"],
          ["rowCount", "垂直孔列數"],
          ["pitchX", "水平孔距", "mm"],
          ["pitchY", "垂直孔距", "mm"],
          ["endDistanceStart", "起始端距", "mm"],
          ["endDistanceEnd", "末端端距", "mm"],
          ["edgeDistanceTop", "橫向邊距一", "mm"],
          ["edgeDistanceBottom", "橫向邊距二", "mm"],
          ["netSectionMode", "淨斷面模式"],
          ["blockShearMode", "區塊剪力模式"],
          ["useManualBlockShearPath", "手動覆寫區塊剪力"],
          ["manualAgv", "手動 Agv", "mm²"],
          ["manualAnv", "手動 Anv", "mm²"],
          ["manualAgt", "手動 Agt", "mm²"],
          ["manualAnt", "手動 Ant", "mm²"],
        ],
      },
      {
        title: "連接板面積直輸",
        modes: ["area_manual"],
        items: [
          ["grossArea", "Ag", "mm²"],
          ["netArea", "An", "mm²"],
          ["Agv", "Agv", "mm²"],
          ["Anv", "Anv", "mm²"],
          ["Agt", "Agt", "mm²"],
          ["Ant", "Ant", "mm²"],
        ],
      },
    ],
    tension_member: [
      {
        title: "拉力構件基本資料",
        items: [
          ["requiredTension", "需求拉力 Tu / Ta", "kN"],
          ["tensionConnectionMode", "接合方式"],
          ["tensionSectionType", "構材 / 接合分類"],
          ["tensionAreaInput", "斷面面積採用方式"],
          ["memberYieldStrength", "Fy", "MPa"],
          ["memberUltimateStrength", "Fu", "MPa"],
          ["unsupportedLength", "未支撐長度 L", "mm"],
          ["radiusOfGyration", "迴轉半徑 r", "mm"],
        ],
      },
      {
        title: "拉力構件幾何資料",
        modes: ["geometry"],
        items: [
          ["memberWidth", "構材寬度 b", "mm"],
          ["memberThickness", "構材厚度 t", "mm"],
        ],
      },
      {
        title: "拉力構件面積資料",
        modes: ["manual"],
        items: [
          ["tensionGrossArea", "Ag", "mm²"],
          ["tensionNetArea", "An", "mm²"],
          ["tensionEffectiveNetArea", "Ae", "mm²"],
        ],
      },
      {
        title: "螺栓接合資料",
        modes: ["bolted"],
        items: [
          ["tensionShearLagCase", "剪力遲滯分類"],
          ["tensionShearLagFactor", "手動 U"],
          ["tensionBoltLineCount", "沿力方向每行螺栓數"],
          ["tensionBoltRowCount", "垂直力方向螺栓列數"],
          ["tensionShearPlanes", "剪斷面數"],
          ["tensionEndDistance", "端距 e", "mm"],
          ["tensionPitchLongitudinal", "縱距 s", "mm"],
          ["tensionGaugeTransverse", "橫距 g", "mm"],
          ["tensionEdgeDistanceNear", "邊距 e1", "mm"],
          ["tensionEdgeDistanceFar", "邊距 e2", "mm"],
          ["tensionUseManualBlockAreas", "手動輸入區塊剪力面積"],
          ["tensionAgv", "Agv", "mm²"],
          ["tensionAnv", "Anv", "mm²"],
          ["tensionAgt", "Agt", "mm²"],
          ["tensionAnt", "Ant", "mm²"],
        ],
      },
      {
        title: "銲接接合資料",
        modes: ["welded"],
        items: [
          ["tensionWeldCase", "銲接與 Ae 分類"],
          ["tensionWeldType", "銲接型式"],
          ["tensionShearLagFactor", "手動 U"],
          ["tensionWeldSize", "銲腳尺寸 a", "mm"],
          ["tensionConnectedThickness", "對接構件厚度 tc", "mm"],
          ["tensionWeldEffectiveThroat", "有效銲喉厚 te", "mm"],
          ["tensionWeldLengthLongitudinal", "縱向有效銲長 l", "mm"],
          ["tensionWeldLengthTransverse", "橫向有效銲長", "mm"],
          ["tensionWeldLineCount", "縱向銲道數量"],
          ["tensionWeldOpeningWidth", "開孔寬度", "mm"],
          ["tensionWeldOpeningLength", "開孔長度", "mm"],
          ["tensionWeldOpeningCount", "開孔數量"],
          ["tensionLapLength", "搭接長度", "mm"],
          ["tensionWeldMatchingFiller", "相稱銲材"],
          ["tensionWeldElectrodeStrength", "FEXX", "MPa"],
          ["tensionDirectConnectedArea", "直接連接部分面積 A", "mm²"],
        ],
      },
    ],
  };

  const confirmationLabels = { true: "已確認", false: "未確認｜禁止核可" };
  const labelMap = {
    designMethod: { LRFD: "LRFD 極限設計法", ASD: "ASD 容許應力設計法" },
    connectionType: {
      plate_check: "連接板檢核｜Connection Plate",
      tension_member: "拉力構件｜Tension Member",
      single_plate: "剪力接頭｜單剪力板 Shear Tab｜LRFD 正式模組",
      column_splice: "柱續接｜全斷面 CJP 耐震能力審查｜LRFD 正式模組",
      brace_gusset: "支撐接頭｜平板支撐 Gusset 拉力接頭｜LRFD 正式模組",
      beam_column_moment: "梁柱彎矩接頭｜耐震能力審查｜LRFD 正式模組",
    },
    exposureCondition: { painted: "塗裝或不受腐蝕環境", weathering: "耐候鋼且暴露大氣" },
    holeType: {
      standard: "標準孔",
      oversized: "超大孔",
      short_slot_parallel: "短槽孔，平行於力方向",
      short_slot_perpendicular: "短槽孔，垂直於力方向",
      long_slot_parallel: "長槽孔，平行於力方向",
      long_slot_perpendicular: "長槽孔，垂直於力方向",
    },
    edgeFabrication: { rolled: "軋壓邊或熱切割邊", sheared: "剪斷邊" },
    threadsCondition: { included: "螺紋在剪斷面", excluded: "螺紋不在剪斷面" },
    deformationConsidered: { true: "變形為設計考量｜1.2Lc / 2.4db", false: "變形非設計考量｜1.5Lc / 3.0db" },
    fillerExtended: { true: "已延伸至連接板外", false: "未延伸至連接板外" },
    conventionalMaterialConfirmed: { true: "已依核定材料規範確認", false: "尚未確認" },
    connectionModelConfirmed: { true: "已確認", false: "尚未確認" },
    gussetStaticNonseismicConfirmed: { true: "已確認為靜力、非耐震、非 BRB", false: "尚未確認" },
    gussetLoadPathConfirmed: { true: "已確認單列栓與雙側縱向銲串聯力流", false: "尚未確認" },
    momentFrameSystem: { smrf: "韌性抗彎矩構架｜SMRF", imrf: "部分韌性抗彎矩構架｜IMRF" },
    momentAxis: { x: "X 向選定構架面", y: "Y 向選定構架面" },
    momentConnectionDesignRoute: { reinforced: "補強式接頭｜V1 正式路線" },
    momentRotationDemandMethod: {
      default: "規範固定值",
      nonlinear: "非線性分析 + 0.005 rad",
      formula: "1.1(R-1)thetaE",
    },
    momentQualificationRoute: {
      direct_test: "案件代表性反覆載重試驗",
      prior_test_similarity: "既有破壞試驗相似性",
      third_party_review: "分析／計算 + 公正第三者審查",
    },
    momentThirdPartyReviewConfirmed: confirmationLabels,
    momentDoublerPresent: { true: "有置合板", false: "無置合板" },
    momentDoublerAttachmentConfirmed: confirmationLabels,
    momentContinuityPlateProvidedConfirmed: confirmationLabels,
    momentContinuityPlateWeldConfirmed: confirmationLabels,
    momentQualificationConfigurationConfirmed: confirmationLabels,
    momentQualificationMaterialConfirmed: confirmationLabels,
    momentQualificationWeldingConfirmed: confirmationLabels,
    momentQualificationGeometryConfirmed: confirmationLabels,
    momentQualificationFabricationConfirmed: confirmationLabels,
    momentQualificationProcedureConfirmed: confirmationLabels,
    momentPlasticZoneGeometryConfirmed: confirmationLabels,
    momentPlasticZoneOpeningsAbsentConfirmed: confirmationLabels,
    momentSeismicMaterialConfirmed: confirmationLabels,
    momentMatchingWeldConfirmed: confirmationLabels,
    momentCns3506WeldConfirmed: confirmationLabels,
    momentEndTabsRemovedGroundConfirmed: confirmationLabels,
    momentWeldProcedureMatchesQualificationConfirmed: confirmationLabels,
    momentJointLateralRestraintConfirmed: confirmationLabels,
    momentBeamLateralBracingConfirmed: confirmationLabels,
    momentAllMembersIncludedConfirmed: confirmationLabels,
    momentColumnStrengthsAtGoverningAxialConfirmed: confirmationLabels,
    momentOpposingDirectionsConfirmed: confirmationLabels,
    momentOrthogonalDirectionSeparateConfirmed: confirmationLabels,
    momentConnectionHardwareVerifiedConfirmed: confirmationLabels,
    momentSelectedAxisScopeConfirmed: confirmationLabels,
    braceSectionType: { flat_plate: "扁鋼／平板支撐｜矩形截面｜U = 1.0、Ae = An" },
    spliceFrameRole: { seismic_force_resisting: "耐震力抵抗系統柱" },
    spliceDesignRoute: { cjp_full_section_identical_rolled_h: "相同軋製 H 形柱｜全斷面 CJP" },
    spliceLocationRoute: { beam_flange_1200: "距最近梁翼緣至少 1,200 mm" },
    spliceLiveLoadFactor: { 0.5: "0.5", 1: "1.0" },
    spliceTransferCapRoute: { uncapped: "不設上限｜完整採 1.4Fu|PE|", qualified: "取 min(1.4Fu|PE|, 1.25Ptransfer)" },
    spliceFabricationLocation: { shop: "工廠銲接", field: "工地銲接" },
    spliceNdtMethod: { UT: "超音波檢測 UT", RT: "放射線檢測 RT" },
    spliceIdenticalSectionsAndMaterialConfirmed: confirmationLabels,
    spliceAlignedAxesConfirmed: confirmationLabels,
    spliceFullProfileCjpConfirmed: confirmationLabels,
    spliceMatchingFillerConfirmed: confirmationLabels,
    spliceWpsApprovedConfirmed: confirmationLabels,
    spliceNdtFullCoverageConfirmed: confirmationLabels,
    spliceNoPjpConfirmed: confirmationLabels,
    spliceNoMixedLoadSharingConfirmed: confirmationLabels,
    spliceSeismicColumnConfirmed: confirmationLabels,
    spliceLocationScopeConfirmed: confirmationLabels,
    spliceAllAdjacentTransferSourcesIncludedConfirmed: { true: "qualified：全部相鄰構件轉移來源已納入", false: "未主張相鄰構材上限（uncapped 可用）" },
    spliceAsBuiltBoundaryConfirmed: confirmationLabels,
    plateInputMode: { geometry: "幾何推導", area_manual: "面積直輸" },
    loadDirection: { horizontal: "水平", vertical: "垂直" },
    netSectionMode: { straight_only: "直線淨斷面" },
    blockShearMode: { auto_with_override: "自動推導 + 手動覆寫" },
    useManualBlockShearPath: { true: "是", false: "否" },
    showPlateSketch: { true: "顯示", false: "隱藏" },
    tensionConnectionMode: { bolted: "螺栓接合", welded: "銲接接合" },
    tensionSectionType: {
      connection_plate: "栓接之接續板 / 連接板",
      general_shape: "其他斷面或一般受拉構材",
    },
    tensionAreaInput: { geometry: "幾何輸入", manual: "面積輸入" },
    tensionShearLagCase: {
      connection_plate_cap: "連接板 / 接續板，Ae = min(An, 0.85Ag)",
      w_shape_flange_ge_3: "翼板接合且每行不少於 3 栓，U = 0.90",
      other_ge_3: "其他斷面且每行不少於 3 栓，U = 0.85",
      two_bolts: "每行僅 2 栓，U = 0.75",
      manual_u: "手動輸入 U（需外部證明）",
    },
    tensionUseManualBlockAreas: { true: "是", false: "否" },
    tensionWeldCase: {
      plate_longitudinal_both_sides: "鋼板端部雙側縱向銲，U 依 l/W 決定，Ae = UAg",
      transverse_direct: "橫向銲道直接傳力，Ae = A",
      other_manual_u: "其他銲接型式，手動輸入 U（需外部證明）",
    },
    tensionWeldType: {
      fillet: "填角銲",
      groove_cjp: "全滲透開槽銲",
      groove_pjp: "部分滲透開槽銲",
      plug_slot: "塞孔銲 / 塞槽銲",
    },
    tensionWeldMatchingFiller: { true: "是", false: "否" },
  };

  const form = document.getElementById("connectionForm");
  const showFlow = document.getElementById("showFlow");
  const loadExampleBtn = document.getElementById("loadExampleBtn");
  const examplePresetSelect = document.getElementById("examplePresetSelect");
  const saveDraftBtn = document.getElementById("saveDraftBtn");
  const exportSourceJsonBtn = document.getElementById("exportSourceJsonBtn");
  const importSourceJsonBtn = document.getElementById("importSourceJsonBtn");
  const importSourceJsonInput = document.getElementById("importSourceJsonInput");
  const exportReportBtn = document.getElementById("exportReportBtn");
  const copySummaryBtn = document.getElementById("copySummaryBtn");
  const printReportBtn = document.getElementById("printReportBtn");
  const resetBtn = document.getElementById("resetBtn");
  const draftStatus = document.getElementById("draftStatus");
  const methodHint = document.getElementById("methodHint");
  const methodLrfBtn = document.getElementById("methodLrfBtn");
  const methodAsdBtn = document.getElementById("methodAsdBtn");
  const glossaryTableBody = document.getElementById("glossaryTableBody");
  const pageTitle = document.getElementById("pageTitle");
  const pageDescription = document.getElementById("pageDescription");
  const codeBasisDisplay = document.getElementById("codeBasisDisplay");
  const inputColumn = document.getElementById("inputColumn");
  const reportColumn = document.getElementById("reportColumn");
  const mobileQuickNav = document.querySelector(".mobile-quick-nav");
  const reportPanel = document.getElementById("panel-report");
  const flowPanel = document.getElementById("panel-flow");
  const jumpToGoverningBtn = document.getElementById("jumpToGoverningBtn");
  const jumpToFirstNgBtn = document.getElementById("jumpToFirstNgBtn");
  const jumpToAlertsBtn = document.getElementById("jumpToAlertsBtn");
  const strengthSection = document.getElementById("strengthSection");
  const detailSection = document.getElementById("detailSection");
  const alertsSection = document.getElementById("alertsSection");
  const reportTitle = document.getElementById("reportTitle");
  const reportSubtitle = document.getElementById("reportSubtitle");
  const metaProjectName = document.getElementById("metaProjectName");
  const metaConnectionTag = document.getElementById("metaConnectionTag");
  const metaDesigner = document.getElementById("metaDesigner");
  const reportTimestamp = document.getElementById("reportTimestamp");
  const reportBanner = document.getElementById("reportBanner");
  const overallMessage = document.getElementById("overallMessage");
  const reportHealthBar = document.getElementById("reportHealthBar");
  const reportAuditStatus = document.getElementById("reportAuditStatus");
  const exportReportStatus = document.getElementById("exportReportStatus");
  const governingMode = document.getElementById("governingMode");
  const approvalStamp = document.getElementById("approvalStamp");
  const approvalDecision = document.getElementById("approvalDecision");
  const approvalGoverning = document.getElementById("approvalGoverning");
  const reviewBriefBody = document.getElementById("reviewBriefBody");
  const inputSummaryTables = document.getElementById("inputSummaryTables");
  const strengthCheckTableBody = document.getElementById("strengthCheckTableBody");
  const detailCheckTableBody = document.getElementById("detailCheckTableBody");
  const alertsList = document.getElementById("alertsList");
  const toolReferenceIntro = document.getElementById("toolReferenceIntro");
  const toolReferenceList = document.getElementById("toolReferenceList");
  const flowCards = document.getElementById("flowCards");
  const plateExtrasBlock = document.getElementById("plateExtrasBlock");
  const plateSketchBlock = document.getElementById("plateSketchBlock");
  const plateDerivedAreaBody = document.getElementById("plateDerivedAreaBody");
  const platePathSummary = document.getElementById("platePathSummary");
  const plateSketchWrap = document.getElementById("plateSketchWrap");
  const tensionExtrasBlock = document.getElementById("tensionExtrasBlock");
  const tensionSketchBlock = document.getElementById("tensionSketchBlock");
  const tensionDerivedAreaBody = document.getElementById("tensionDerivedAreaBody");
  const tensionPathSummary = document.getElementById("tensionPathSummary");
  const tensionSketchWrap = document.getElementById("tensionSketchWrap");
  const shearTabExtrasBlock = document.getElementById("shearTabExtrasBlock");
  const shearTabDerivedAreaBody = document.getElementById("shearTabDerivedAreaBody");
  const shearTabPathSummary = document.getElementById("shearTabPathSummary");
  let mobileFab = null;
  let methodFab = null;
  let quickNavTicking = false;
  let currentAccordionPreset = "smart";
  let currentReportAccordionPreset = "focus";
  let currentPanel = "report";

  function formatNumber(value, digits = 1) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value);
  }

  function getCheckUnit(check) {
    if (check?.unit) return check.unit;
    return /^momentStrongColumn/.test(check?.key || "") ? "" : "kN";
  }

  function formatCheckValue(check, value, digits = null) {
    const unit = getCheckUnit(check);
    const displayDigits = Number.isInteger(digits)
      ? digits
      : unit === "rad"
        ? 4
        : unit
          ? 1
          : 3;
    return `${formatNumber(value, displayDigits)}${unit ? ` ${unit}` : ""}`;
  }

  function formatDetailDecisionValue(value) {
    return formatNumber(value, 3);
  }

  function nowLabel() {
    return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date());
  }

  function mapValue(key, value) {
    const mapper = labelMap[key];
    return mapper && Object.prototype.hasOwnProperty.call(mapper, value) ? mapper[value] : value || "—";
  }

  function getInputAccordionToolbar() {
    return document.querySelector(".input-accordion-toolbar");
  }

  function getReportAccordionToolbar() {
    return document.querySelector(".report-accordion-toolbar");
  }

  function persistUiPrefs() {
    try {
      localStorage.setItem(UI_PREFS_KEY, JSON.stringify({
        accordionPreset: currentAccordionPreset,
        reportAccordionPreset: currentReportAccordionPreset,
        panel: currentPanel,
      }));
    } catch {
      // ignore storage errors
    }
  }

  function loadUiPrefs() {
    try {
      const raw = localStorage.getItem(UI_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.accordionPreset) currentAccordionPreset = parsed.accordionPreset;
      if (parsed.reportAccordionPreset) currentReportAccordionPreset = parsed.reportAccordionPreset;
      if (parsed.panel) currentPanel = parsed.panel;
    } catch {
      // ignore storage errors
    }
  }

  function getCurrentConnectionType() {
    return form.elements.namedItem("connectionType").value;
  }

  function getExamplePresetList(type) {
    return examplePresets[type] || examplePresets.single_plate;
  }

  function getSelectedExamplePresetId() {
    return examplePresetSelect?.value || "";
  }

  function renderExamplePresetOptions(type, preferredId = "") {
    if (!examplePresetSelect) return;
    const presets = getExamplePresetList(type);
    const nextId = presets.some((item) => item.id === preferredId) ? preferredId : presets[0]?.id || "";
    examplePresetSelect.innerHTML = presets.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join("");
    examplePresetSelect.value = nextId;
  }

  function getCurrentExampleState() {
    const type = getCurrentConnectionType();
    const presets = getExamplePresetList(type);
    const preset = presets.find((item) => item.id === getSelectedExamplePresetId()) || presets[0];
    return { ...defaultState, ...(preset?.state || exampleStates[type] || exampleStates.single_plate) };
  }

  function getCodeBasisText(state) {
    const methodLabel = state.designMethod === "ASD"
      ? "鋼構造建築物鋼結構設計技術規範｜容許應力設計法"
      : "鋼構造建築物鋼結構設計技術規範｜極限設計法";
    switch (state.connectionType) {
      case "tension_member":
        return `${methodLabel}｜第四章一般要求、第五章受拉構材、第十章接合設計`;
      case "plate_check":
        return `${methodLabel}｜第四章一般要求、第十章接合設計`;
      case "brace_gusset":
        return "LRFD｜第五章受拉構材、第十章接合設計";
      case "beam_column_moment":
        return "LRFD｜第十章接合設計、第十三章耐震設計 13.6／13.7｜補強式接頭、單一選定構架面";
      case "column_splice":
        return "LRFD｜第十章 10.2.1、10.2.4、表 10.2-5 與 10.2.6；第十三章 13.4.1、13.4.2 與 13.10｜相同軋製 H 形柱、全斷面 CJP";
      case "single_plate":
      default:
        return `${methodLabel}｜第十章接合設計`;
    }
  }

  function getAssociatedFields(name = "") {
    const escapedName = name.replace(/"/g, '\\"');
    const internalSelector = name
      ? `#${form.id} [name="${escapedName}"]`
      : `#${form.id} [name]`;
    const externalSelector = name
      ? `[form="${form.id}"][name="${escapedName}"]`
      : `[form="${form.id}"][name]`;
    return Array.from(document.querySelectorAll(`${internalSelector}, ${externalSelector}`))
      .filter((field, index, fields) => fields.indexOf(field) === index);
  }

  function shouldSerializeField(field) {
    if (!field || field.disabled || !field.name) return false;
    if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
      return field.checked;
    }
    return true;
  }

  function normalizeProjectMetaValue(value) {
    const normalized = String(value ?? "").trim();
    return normalized === "未填" ? "" : normalized;
  }

  function getProjectMetaDisplayValue(value) {
    return normalizeProjectMetaValue(value) || "—";
  }

  function collectFormState() {
    return getAssociatedFields().reduce((state, field) => {
      if (!shouldSerializeField(field)) return state;
      state[field.name] = field.value;
      return state;
    }, {});
  }

  function getInputGroups(type) {
    const plateMode = form.elements.namedItem("plateInputMode")?.value || "geometry";
    const tensionAreaInput = form.elements.namedItem("tensionAreaInput")?.value || "geometry";
    const tensionConnectionMode = form.elements.namedItem("tensionConnectionMode")?.value || "bolted";
    const tensionWeldType = form.elements.namedItem("tensionWeldType")?.value || "fillet";
    return [...sharedGroups, ...(specificGroups[type] || [])].filter((group) => {
      if (group.title === "共用螺栓與孔型") {
        return !["beam_column_moment", "column_splice"].includes(type)
          && !((type === "plate_check" && plateMode === "area_manual") || (type === "tension_member" && tensionConnectionMode === "welded"));
      }
      if (!group.modes) return true;
      if (type === "plate_check") return group.modes.includes(plateMode);
      if (type === "tension_member") return group.modes.includes(tensionAreaInput) || group.modes.includes(tensionConnectionMode);
      return true;
    }).map((group) => {
      let items = group.items;
      if (group.title === "基本資料" && ["plate_check", "tension_member", "beam_column_moment", "column_splice"].includes(type)) {
        items = items.filter(([key]) => !["requiredAxial", "requiredShear", "requiredMoment", "eccentricity"].includes(key));
      }
      if (type === "tension_member" && group.title === "銲接接合資料") {
        items = items.filter(([key]) => {
          if (tensionConnectionMode !== "welded") return false;
          if (key === "tensionWeldSize") return tensionWeldType === "fillet";
          if (key === "tensionWeldEffectiveThroat") return tensionWeldType === "groove_pjp";
          if (["tensionWeldOpeningWidth", "tensionWeldOpeningLength", "tensionWeldOpeningCount"].includes(key)) return tensionWeldType === "plug_slot";
          if (key === "tensionLapLength") return tensionWeldType === "fillet";
          return true;
        });
      }
      return { ...group, items };
    });
  }

  function renderGlossary() {
    glossaryTableBody.innerHTML = glossaryItems.map((item) => `
      <tr>
        <td>${item.symbol}</td>
        <td>${item.name}</td>
        <td>${item.unit}</td>
        <td>${item.definition}</td>
        <td>${item.usage}</td>
      </tr>
    `).join("");
  }

  function syncVisibleFieldState() {
    form.querySelectorAll("input, select, textarea").forEach((field) => {
      field.disabled = Boolean(field.closest(".is-hidden"));
    });
  }

  function setInputCardCollapsed(card, collapsed) {
    const toggle = card.querySelector(".card-toggle");
    const body = card.querySelector(".card-body");
    if (!toggle || !body) return;
    card.classList.toggle("is-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.textContent = collapsed ? "展開" : "收合";
  }

  function prepareInputCardAccordions() {
    document.querySelectorAll(".input-column .card").forEach((card) => {
      if (card.dataset.accordionReady === "true") return;
      const heading = card.querySelector(":scope > h2");
      if (!heading) return;

      const header = document.createElement("div");
      header.className = "card-header";
      heading.replaceWith(header);
      header.appendChild(heading);

      const meta = document.createElement("span");
      meta.className = "card-header-meta muted";
      header.appendChild(meta);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "card-toggle";
      toggle.setAttribute("aria-expanded", "true");
      toggle.textContent = "收合";
      header.appendChild(toggle);

      const body = document.createElement("div");
      body.className = "card-body";
      while (header.nextSibling) {
        body.appendChild(header.nextSibling);
      }
      card.appendChild(body);

      toggle.addEventListener("click", () => {
        const collapsed = !card.classList.contains("is-collapsed");
        setInputCardCollapsed(card, collapsed);
      });

      card.dataset.accordionReady = "true";
    });
  }

  function updateInputCardStatuses() {
    document.querySelectorAll(".input-column .card").forEach((card) => {
      const meta = card.querySelector(".card-header-meta");
      if (!meta) return;

      if (card.classList.contains("is-hidden")) {
        meta.textContent = "目前未啟用";
        meta.className = "card-header-meta muted";
        return;
      }

      const fields = Array.from(card.querySelectorAll(".card-body input, .card-body select, .card-body textarea"))
        .filter((field) => field.type !== "hidden" && !field.disabled && !field.closest(".is-hidden"));

      if (!fields.length) {
        meta.textContent = "無需填寫";
        meta.className = "card-header-meta neutral";
        return;
      }

      const filledCount = fields.filter((field) => {
        if (field.type === "checkbox") return field.checked;
        return String(field.value ?? "").trim() !== "";
      }).length;
      const totalCount = fields.length;

      if (filledCount === 0) {
        meta.textContent = `待輸入 ${totalCount} 項`;
        meta.className = "card-header-meta warn";
        return;
      }

      if (filledCount === totalCount) {
        meta.textContent = `已填 ${filledCount}/${totalCount}`;
        meta.className = "card-header-meta ok";
        return;
      }

      meta.textContent = `已填 ${filledCount}/${totalCount}`;
      meta.className = "card-header-meta neutral";
    });
  }

  function updateQuickNavActive(target) {
    if (!mobileQuickNav) return;
    mobileQuickNav.querySelectorAll("button").forEach((item) => {
      item.classList.toggle("active", item.dataset.target === target);
    });
  }

  function prepareSectionTabBadges() {
    document.querySelectorAll(".section-tabs button").forEach((button) => {
      if (button.dataset.decorated === "true") return;
      const label = button.textContent.trim();
      button.dataset.baseLabel = label;
      button.innerHTML = `
        <span class="section-tab-label">${label}</span>
        <span class="section-tab-badge neutral"></span>
      `;
      button.dataset.decorated = "true";
    });
  }

  function setSectionTabBadge(panelName, badgeText = "", tone = "neutral") {
    const button = document.querySelector(`.section-tabs button[data-panel="${panelName}"]`);
    if (!button) return;
    const labelNode = button.querySelector(".section-tab-label");
    const badgeNode = button.querySelector(".section-tab-badge");
    const baseLabel = button.dataset.baseLabel || panelName;
    if (labelNode) labelNode.textContent = baseLabel;
    if (badgeNode) {
      badgeNode.textContent = badgeText;
      badgeNode.className = `section-tab-badge ${tone}${badgeText ? "" : " is-empty"}`;
    }
    button.setAttribute("aria-label", badgeText ? `${baseLabel}，${badgeText}` : baseLabel);
  }

  function setExportReportStatus(message) {
    if (!exportReportStatus) return;
    exportReportStatus.textContent = message || "";
    exportReportStatus.hidden = !message;
  }

  function prepareReportSectionStatuses() {
    [
      ["strengthSection", "強度檢核總表"],
      ["detailSection", "細部規定檢核"],
      ["alertsSection", "設計依據與限制條件"],
    ].forEach(([sectionId, fallbackLabel]) => {
      const section = document.getElementById(sectionId);
      const heading = section?.querySelector("h3");
      if (!heading || heading.dataset.decorated === "true") return;
      const label = heading.textContent.trim() || fallbackLabel;
      heading.dataset.baseLabel = label;
      heading.innerHTML = `
        <span class="report-section-title">${label}</span>
        <span class="report-section-status neutral is-empty"></span>
      `;
      heading.dataset.decorated = "true";
    });
  }

  function setReportBlockCollapsed(block, collapsed) {
    const toggle = block.querySelector(".report-block-toggle");
    const body = block.querySelector(".report-block-body");
    if (!toggle || !body) return;
    block.classList.toggle("is-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.textContent = collapsed ? "展開" : "收合";
  }

  function expandReportBlockForElement(element) {
    const block = element?.closest?.(".report-block");
    if (!block) return;
    setReportBlockCollapsed(block, false);
  }

  function prepareReportBlockAccordions() {
    document.querySelectorAll(".report-paper .report-block").forEach((block) => {
      if (block.dataset.reportAccordionReady === "true") return;
      const heading = block.querySelector(":scope > h3");
      if (!heading) return;

      const body = document.createElement("div");
      body.className = "report-block-body";
      while (heading.nextSibling) {
        body.appendChild(heading.nextSibling);
      }
      block.appendChild(body);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "report-block-toggle";
      toggle.setAttribute("aria-expanded", "true");
      toggle.textContent = "收合";
      heading.appendChild(toggle);

      toggle.addEventListener("click", () => {
        const collapsed = !block.classList.contains("is-collapsed");
        setReportBlockCollapsed(block, collapsed);
      });

      block.dataset.reportAccordionReady = "true";
    });
  }

  function syncReportBlockAccordions(result) {
    const compact = window.matchMedia("(max-width: 1024px)").matches;
    const hasDetailFailure = (result?.detailChecks || []).some((item) => !item.passes);
    const hasAlerts = getReviewItemCount(result) > 0;
    document.querySelectorAll(".report-paper .report-block").forEach((block) => {
      if (!compact) {
        setReportBlockCollapsed(block, false);
        return;
      }
      const id = block.id || "";
      let shouldCollapse = false;
      if (currentReportAccordionPreset === "all-open") {
        shouldCollapse = false;
      } else if (id === "reviewBriefSection" || id === "strengthSection") {
        shouldCollapse = false;
      } else if (id === "detailSection") {
        shouldCollapse = !hasDetailFailure;
      } else if (id === "alertsSection") {
        shouldCollapse = !hasAlerts;
      } else {
        shouldCollapse = true;
      }
      setReportBlockCollapsed(block, shouldCollapse);
    });
  }

  function applyReportAccordionPreset(result, preset = "focus") {
    currentReportAccordionPreset = preset;
    const toolbar = getReportAccordionToolbar();
    if (toolbar) {
      toolbar.querySelectorAll("[data-report-accordion-action]").forEach((button) => {
        button.classList.toggle("active", button.dataset.reportAccordionAction === preset);
      });
    }
    persistUiPrefs();
    syncReportBlockAccordions(result || window.latestSteelConnectionResult);
  }

  function prepareReportAccordionToolbar() {
    if (!reportPanel || getReportAccordionToolbar()) return;
    const reportPaper = reportPanel.querySelector(".report-paper");
    if (!reportPaper) return;
    const toolbar = document.createElement("div");
    toolbar.className = "report-accordion-toolbar";
    toolbar.innerHTML = `
      <span class="report-accordion-toolbar__label">報表閱讀模式</span>
      <div class="report-accordion-toolbar__actions">
        <button type="button" data-report-accordion-action="focus">重點閱讀</button>
        <button type="button" data-report-accordion-action="all-open">全部展開</button>
      </div>
    `;
    reportPanel.insertBefore(toolbar, reportPaper);
    toolbar.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        applyReportAccordionPreset(window.latestSteelConnectionResult, button.dataset.reportAccordionAction);
      });
    });
    applyReportAccordionPreset(window.latestSteelConnectionResult, currentReportAccordionPreset);
  }

  function setReportSectionStatus(sectionId, badgeText = "", tone = "neutral") {
    const heading = document.getElementById(sectionId)?.querySelector("h3");
    const labelNode = heading?.querySelector(".report-section-title");
    const badgeNode = heading?.querySelector(".report-section-status");
    if (!heading || !badgeNode) return;
    if (labelNode) labelNode.textContent = heading.dataset.baseLabel || labelNode.textContent;
    badgeNode.textContent = badgeText;
    badgeNode.className = `report-section-status ${tone}${badgeText ? "" : " is-empty"}`;
  }

  function updateSectionTabSummary(result) {
    if (!result) return;
    const failingStrength = (result.checks || []).filter((check) => getCheckStatus(check).className === "fail").length;
    const failingDetail = (result.detailChecks || []).filter((item) => !item.passes).length;
    const alertCount = getReviewItemCount(result);
    const reportBadge = failingStrength || failingDetail
      ? `NG ${failingStrength + failingDetail}`
      : alertCount
        ? `提醒 ${alertCount}`
        : "OK";
    const reportTone = failingStrength || failingDetail
      ? "fail"
      : alertCount
        ? "warn"
        : "ok";

    setSectionTabBadge("report", reportBadge, reportTone);
    setSectionTabBadge("flow", `${(result.checks || []).length} 式`, "neutral");
    setSectionTabBadge("glossary", `${glossaryItems.length} 詞`, "neutral");
  }

  function updateReportSectionStatuses(result) {
    if (!result) return;
    const failingStrength = (result.checks || []).filter((check) => getCheckStatus(check).className === "fail").length;
    const warningStrength = (result.checks || []).filter((check) => getCheckStatus(check).className === "warn").length;
    const failingDetail = (result.detailChecks || []).filter((item) => !item.passes).length;
    const alertCount = getReviewItemCount(result);

    setReportSectionStatus(
      "strengthSection",
      failingStrength ? `NG ${failingStrength}` : warningStrength ? `注意 ${warningStrength}` : `${(result.checks || []).length} 項符合`,
      failingStrength ? "fail" : warningStrength ? "warn" : "ok",
    );
    setReportSectionStatus(
      "detailSection",
      failingDetail ? `NG ${failingDetail}` : `${(result.detailChecks || []).length} 項符合`,
      failingDetail ? "fail" : "ok",
    );
    setReportSectionStatus(
      "alertsSection",
      alertCount ? `${alertCount} 項` : "無額外提醒",
      alertCount ? "warn" : "ok",
    );
  }

  function setQuickNavButtonContent(target, label, badgeText = "", tone = "neutral") {
    const button = mobileQuickNav?.querySelector(`[data-target="${target}"]`);
    if (!button) return;
    button.innerHTML = `
      <span class="quick-nav-label">${label}</span>
      ${badgeText ? `<span class="quick-nav-badge ${tone}">${badgeText}</span>` : ""}
    `;
    button.setAttribute("aria-label", badgeText ? `${label}，${badgeText}` : label);
  }

  function getReviewItemCount(result) {
    return (result?.validations || []).length
      + (result?.assumptions || []).length
      + (result?.references || []).length
      + (result?.state?.notes ? 1 : 0);
  }

  function updateMobileQuickNavSummary(result) {
    if (!mobileQuickNav || !result) return;
    const failingStrength = (result.checks || []).filter((check) => getCheckStatus(check).className === "fail").length;
    const failingDetail = (result.detailChecks || []).filter((item) => !item.passes).length;
    const alertCount = getReviewItemCount(result);
    const overallTone = result.overallStatus === "fail"
      ? "fail"
      : result.overallStatus === "warn"
        ? "warn"
        : "ok";
    const moduleLabel = result.state.connectionType === "tension_member" ? "拉力構件" : "連接板";

    setQuickNavButtonContent("input", "輸入區", moduleLabel, "neutral");
    setQuickNavButtonContent(
      "report",
      "報表",
      failingStrength || failingDetail
        ? `NG ${failingStrength + failingDetail}`
        : alertCount
          ? `提醒 ${alertCount}`
          : "OK",
      failingStrength || failingDetail ? "fail" : overallTone,
    );
    setQuickNavButtonContent("flow", "計算流程", `${(result.checks || []).length} 式`, "neutral");
  }

  function applyInputAccordionPreset(type, preset = "smart") {
    currentAccordionPreset = preset;
    const inputAccordionToolbar = getInputAccordionToolbar();
    if (inputAccordionToolbar) {
      inputAccordionToolbar.querySelectorAll("[data-accordion-action]").forEach((button) => {
        button.classList.toggle("active", button.dataset.accordionAction === preset);
      });
    }
    persistUiPrefs();
    const compact = window.matchMedia("(max-width: 1024px)").matches;
    document.querySelectorAll(".input-column .card").forEach((card) => {
      if (!compact) {
        setInputCardCollapsed(card, false);
        return;
      }
      const title = card.querySelector(":scope .card-header h2")?.textContent?.trim() || "";
      const isVisibleModuleCard = card.dataset.connection === type;
      const isBasicCard = title === "基本資料";
      const isSharedBoltCard = title === "共用螺栓與孔型";
      let shouldCollapse = false;

      if (preset === "all-open") {
        shouldCollapse = false;
      } else if (preset === "secondary") {
        shouldCollapse = !(isBasicCard || isVisibleModuleCard);
      } else {
        shouldCollapse = title === "設計備註" || (card.dataset.connection && card.dataset.connection !== type) || (!isBasicCard && !isVisibleModuleCard && !isSharedBoltCard);
      }
      setInputCardCollapsed(card, shouldCollapse);
    });
  }

  function syncInputCardAccordions(type) {
    applyInputAccordionPreset(type, currentAccordionPreset);
  }

  function prepareInputAccordionToolbar() {
    if (!inputColumn || getInputAccordionToolbar()) return;
    const toolbar = document.createElement("div");
    toolbar.className = "input-accordion-toolbar";
    toolbar.innerHTML = `
      <span class="input-accordion-toolbar__label">輸入區整理</span>
      <div class="input-accordion-toolbar__actions">
        <button type="button" data-accordion-action="smart">重整顯示</button>
        <button type="button" data-accordion-action="secondary">收合次要</button>
        <button type="button" data-accordion-action="all-open">全部展開</button>
      </div>
    `;
    inputColumn.insertBefore(toolbar, form);
    toolbar.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        applyInputAccordionPreset(collectFormState().connectionType, button.dataset.accordionAction);
      });
    });
    applyInputAccordionPreset(getCurrentConnectionType(), currentAccordionPreset);
  }

  function toggleBasicDemandRows(type) {
    const showFrameForces = !["plate_check", "tension_member", "beam_column_moment", "column_splice"].includes(type);
    document.querySelectorAll("[data-basic-demand='frame']").forEach((row) => {
      row.classList.toggle("is-hidden", !showFrameForces);
    });
  }

  function toggleConnectionSections(type) {
    document.querySelectorAll("[data-connection]").forEach((card) => {
      const visible = card.dataset.connection === type;
      card.classList.toggle("is-hidden", !visible);
    });
  }

  function toggleConditionalSections(type, plateMode, tensionAreaInput, tensionConnectionMode, tensionWeldType) {
    toggleBasicDemandRows(type);
    document.querySelectorAll("[data-plate-mode]").forEach((section) => {
      const visible = type === "plate_check" && section.dataset.plateMode === plateMode;
      section.classList.toggle("is-hidden", !visible);
    });
    document.querySelectorAll("[data-tension-area]").forEach((section) => {
      const visible = type === "tension_member" && section.dataset.tensionArea === tensionAreaInput;
      section.classList.toggle("is-hidden", !visible);
    });
    document.querySelectorAll("[data-tension-mode]").forEach((section) => {
      const visible = type === "tension_member" && section.dataset.tensionMode === tensionConnectionMode;
      section.classList.toggle("is-hidden", !visible);
    });
    document.querySelectorAll("[data-common-card='bolt']").forEach((card) => {
      const visible = !["beam_column_moment", "column_splice"].includes(type)
        && !((type === "plate_check" && plateMode === "area_manual") || (type === "tension_member" && tensionConnectionMode === "welded"));
      card.classList.toggle("is-hidden", !visible);
    });
    document.querySelectorAll("[data-weld-type]").forEach((section) => {
      const visible = type === "tension_member" && tensionConnectionMode === "welded" && section.dataset.weldType === tensionWeldType;
      section.classList.toggle("is-hidden", !visible);
    });
    syncVisibleFieldState();
  }

  function updateVisibility() {
    const type = getCurrentConnectionType();
    toggleConnectionSections(type);
    toggleConditionalSections(
      type,
      form.elements.namedItem("plateInputMode")?.value || "geometry",
      form.elements.namedItem("tensionAreaInput")?.value || "geometry",
      form.elements.namedItem("tensionConnectionMode")?.value || "bolted",
      form.elements.namedItem("tensionWeldType")?.value || "fillet",
    );
  }

  function renderInputSummary(result) {
    inputSummaryTables.innerHTML = getInputGroups(result.state.connectionType).map((group) => `
      <div class="report-subtable">
        <table class="report-table">
          <thead><tr><th colspan="2">${SteelFormalUI.escapeHtml(group.title)}</th></tr></thead>
          <tbody>${group.items.map(([key, label, unit]) => `
            <tr>
              <th>${SteelFormalUI.escapeHtml(label)}</th>
              <td>${SteelFormalUI.escapeHtml(mapValue(key, result.state[key]))}${unit ? ` <span class="unit">${SteelFormalUI.escapeHtml(unit)}</span>` : ""}</td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    `).join("");
  }

  function renderReviewBrief(result) {
    if (!reviewBriefBody) return;
    const rows = [
      ["規範基準", getCodeBasisText(result.state)],
      ["正式規範核算模組", result.complianceReady ? "是" : "否"],
      ["控制檢核項目", result.governing.label],
      ["控制式號", result.governing.equationRef || "—"],
      ["整體判定", result.passes ? (result.overallStatus === "warn" ? "條件式核可" : "核可") : "不核可"],
      ["限制條件狀態", result.scopeLimited ? "有範圍限制，應配合限制事項判讀" : "無額外範圍限制訊息"],
    ];
    reviewBriefBody.innerHTML = rows.map(([label, value]) => `
      <tr>
        <th>${SteelFormalUI.escapeHtml(label)}</th>
        <td>${SteelFormalUI.escapeHtml(value)}</td>
      </tr>
    `).join("");
  }

  function renderReportHealthBar(result) {
    if (!reportHealthBar) return;
    const failingStrength = (result.checks || []).filter((check) => getCheckStatus(check).className === "fail").length;
    const failingDetail = (result.detailChecks || []).filter((item) => !item.passes).length;
    const alertCount = getReviewItemCount(result);
    const chips = [
      {
        label: "正式核算",
        value: result.complianceReady ? "正式模組" : "範圍受限",
        tone: result.complianceReady ? "ok" : "warn",
      },
      {
        label: "控制項",
        value: result.governing.equationRef
          ? `${result.governing.label}｜${result.governing.equationRef}`
          : result.governing.label,
        tone: "neutral",
      },
      {
        label: "強度檢核",
        value: failingStrength ? `${failingStrength} 項 NG` : `${(result.checks || []).length} 項符合`,
        tone: failingStrength ? "fail" : "ok",
      },
      {
        label: "細部規定",
        value: failingDetail ? `${failingDetail} 項 NG` : `${(result.detailChecks || []).length} 項符合`,
        tone: failingDetail ? "fail" : "ok",
      },
      {
        label: "限制條件",
        value: alertCount ? `${alertCount} 項提醒` : "無額外提醒",
        tone: alertCount ? "warn" : "ok",
      },
    ];

    reportHealthBar.innerHTML = chips.map((chip) => `
      <div class="health-chip ${chip.tone}">
        <span class="health-chip__label">${SteelFormalUI.escapeHtml(chip.label)}</span>
        <span class="health-chip__value">${SteelFormalUI.escapeHtml(chip.value)}</span>
      </div>
    `).join("");
  }

  function renderAuditStatusCard(status, options = {}) {
    if (!reportAuditStatus) return;

    const { error = "", note = "", hidden = false, sourceKind = "local" } = options;
    if (hidden) {
      reportAuditStatus.classList.add("is-hidden");
      reportAuditStatus.innerHTML = "";
      return;
    }

    reportAuditStatus.classList.remove("is-hidden");

    let badgeTone = "warn";
    let badgeLabel = "未讀取";
    let summary = note || "尚未載入最新自巡檢狀態。";
    const cardTitle = sourceKind === "public" ? "平台公開巡檢狀態" : "鋼構本機自巡檢狀態";
    const meta = [];
    const links = [];

    if (status) {
      const isPublicPlatformStatus = sourceKind === "public" || status.kind === "platform-status";
      badgeTone = status.pass ? "ok" : "fail";
      badgeLabel = status.pass
        ? (isPublicPlatformStatus ? "平台最近巡檢通過" : "最近巡檢通過")
        : `${isPublicPlatformStatus ? "平台最近巡檢異常" : "最近巡檢異常"} ${status.failureCount || 0} 項`;
      summary = `${isPublicPlatformStatus ? "公開平台" : "鋼構本機"}最近一輪巡檢 ${status.pass ? "已通過" : "發現異常"}，runId：${status.runId || "—"}。`;
      if (status.runId) meta.push(`runId｜${status.runId}`);
      if (isPublicPlatformStatus) {
        const moduleLabels = { steel: "鋼構", rc: "RC", core: "風震核心" };
        const modules = (status.modules || []).map((key) => moduleLabels[key] || key).filter(Boolean);
        if (modules.length) meta.push(`範圍｜${modules.join("、")}`);
        meta.push("來源｜正式放行公開快照");
        links.push({ href: "../結構工具箱/audit-dashboard.html", label: "開啟平台公開巡檢狀態" });
        links.push({ href: "../結構工具箱/assets/status/platform-status.json", label: "開啟公開狀態 JSON" });
      } else {
        meta.push(status.loop ? "模式｜循環巡檢" : "模式｜單次巡檢");
        meta.push(status.quiet ? "輸出｜靜默" : "輸出｜標準");
        links.push({ href: "./output/audit/audit-summary.md", label: "開啟巡檢摘要" });
        links.push({ href: "./output/audit/audit-status.json", label: "開啟狀態 JSON" });
      }
      meta.push(`結果｜${status.failureCount || 0} 項異常`);
    } else if (error) {
      badgeTone = "warn";
      badgeLabel = sourceKind === "public" ? "公開狀態未載入" : "巡檢狀態未載入";
      summary = error;
    }

    reportAuditStatus.innerHTML = `
      <div class="audit-status-card__head">
        <span class="audit-status-card__title">${cardTitle}</span>
        <span class="audit-status-card__badge ${badgeTone}">${badgeLabel}</span>
      </div>
      <div class="audit-status-card__summary">${summary}</div>
      ${meta.length ? `<div class="audit-status-card__meta">${meta.map((item) => `<span>${item}</span>`).join("")}</div>` : ""}
      ${links.length ? `<div class="audit-status-card__links">${links.map((item) => `<a href="${item.href}" target="_blank" rel="noreferrer">${item.label}</a>`).join("")}</div>` : ""}
    `;
  }

  function getAuditStatusSource() {
    const localAuditRequested = new URLSearchParams(window.location.search).get("auditSource") === "local";
    if (localAuditRequested) {
      return {
        kind: "local",
        url: "./output/audit/audit-status.json",
        errorPrefix: "尚未取得最新鋼構自巡檢狀態",
      };
    }
    return {
      kind: "public",
      url: "../結構工具箱/assets/status/platform-status.json",
      errorPrefix: "尚未取得公開平台巡檢狀態",
    };
  }

  async function loadAuditStatus() {
    if (!reportAuditStatus) return;

    if (!/^https?:$/i.test(window.location.protocol)) {
      renderAuditStatusCard(null, {
        note: "目前以直接開檔模式執行，未讀取巡檢狀態；以 HTTP 開啟時預設顯示正式放行公開快照，本機詳細 audit 僅在網址明確加上 ?auditSource=local 時讀取。",
      });
      return;
    }

    const source = getAuditStatusSource();
    try {
      const response = await fetch(`${source.url}?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const status = await response.json();
      renderAuditStatusCard(status, { sourceKind: source.kind });
    } catch (error) {
      renderAuditStatusCard(null, {
        sourceKind: source.kind,
        error: source.kind === "public"
          ? `${source.errorPrefix}（${error.message || "讀取失敗"}）。請稍後重試或查看結構工具箱首頁。`
          : `${source.errorPrefix}（${error.message || "讀取失敗"}）。可先執行 run-audit.bat 或 run-audit-loop.bat。`,
      });
    }
  }

  function buildDerivedAreaRows(derived) {
    return [
      ["Ag", derived.Ag],
      ["An", derived.An],
      ["Ae", derived.Ae],
      ["Agv", derived.Agv],
      ["Anv", derived.Anv],
      ["Agt", derived.Agt],
      ["Ant", derived.Ant],
    ].map(([label, value]) => `
      <tr>
        <th>${label}</th>
        <td>${formatNumber(value, 2)} <span class="unit">mm²</span></td>
      </tr>
    `).join("");
  }

  function buildDimensionLine({ x1, y1, x2, y2, label, cls = "sketch-dim", textOffsetX = 0, textOffsetY = 0, markerId = "" }) {
    const textX = (x1 + x2) / 2 + textOffsetX;
    const textY = (y1 + y2) / 2 + textOffsetY;
    const markerAttrs = markerId ? ` marker-start="url(#${markerId})" marker-end="url(#${markerId})"` : "";
    return `
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"${markerAttrs} />
      <text x="${textX}" y="${textY}" text-anchor="middle" class="sketch-dim-label">${label}</text>
    `;
  }

  function classifyReviewNotes(result) {
    const limits = [];
    const scope = [];
    const validations = [...(result.validations || [])];
    (result.assumptions || []).forEach((item) => {
      if (/(未納入|不提供|不得直接|簡化|保守|宜改採|超出者|現階段)/.test(item)) {
        limits.push(item);
      } else {
        scope.push(item);
      }
    });
    return {
      references: result.references || [],
      scope,
      limits,
      validations,
      notes: result.state.notes ? [result.state.notes] : [],
    };
  }

  function buildReviewSectionsMarkup(result, { inline = false } = {}) {
    const review = classifyReviewNotes(result);
    const makeSection = (title, items) => {
      if (!items.length) return "";
      return `
        <div class="review-section${inline ? " review-section--print" : ""}">
          <div class="review-section__title">${SteelFormalUI.escapeHtml(title)}</div>
          <ul>${items.map((item) => `<li>${SteelFormalUI.escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      `;
    };
    return [
      makeSection("設計依據", review.references.map((item) => `依據條文：${item}`)),
      makeSection("適用範圍", review.scope),
      makeSection("限制與不適用事項", review.limits),
      makeSection("審查提醒", review.validations),
      makeSection("設計備註", review.notes),
    ].join("");
  }

  function buildPlateSketchMarkup(result, { inline = false } = {}) {
    if (result.sketchData?.mode !== "geometry" || result.state.showPlateSketch === false) {
      return `<div class="card-placeholder">${result.sketchData?.caption || "本案採指定斷面面積，未建立幾何示意。"}</div>`;
    }

    const { plateWidth, plateLength, holes, netSection, blockShear, loadDirection } = result.sketchData;
    const scale = Math.min(480 / Math.max(plateWidth, 1), 340 / Math.max(plateLength, 1));
    const toX = (value) => 20 + value * scale;
    const toY = (value) => 36 + value * scale;
    const holeRadius = Math.max(result.state.holeDiameter * scale / 2, 3);
    const netPath = (netSection?.points || []).map((point) => `${toX(point.x)},${toY(point.y)}`).join(" ");
    const blockPath = (blockShear || []).map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.x)} ${toY(point.y)}`).join(" ") + " Z";
    const arrow = loadDirection === "horizontal"
      ? `<line x1="${toX(10)}" y1="${toY(plateLength / 2)}" x2="${toX(plateWidth - 10)}" y2="${toY(plateLength / 2)}" class="sketch-arrow" marker-end="url(#plateArrow)" />`
      : `<line x1="${toX(plateWidth / 2)}" y1="${toY(10)}" x2="${toX(plateWidth / 2)}" y2="${toY(plateLength - 10)}" class="sketch-arrow" marker-end="url(#plateArrow)" />`;
    const widthDim = buildDimensionLine({
      x1: toX(0),
      y1: toY(plateLength) + 34,
      x2: toX(plateWidth),
      y2: toY(plateLength) + 34,
      label: `板寬 ${formatNumber(plateWidth, 1)} mm`,
      textOffsetY: -6,
      markerId: "plateDimArrow",
    });
    const lengthDim = buildDimensionLine({
      x1: toX(plateWidth) + 26,
      y1: toY(0),
      x2: toX(plateWidth) + 26,
      y2: toY(plateLength),
      label: `板長 ${formatNumber(plateLength, 1)} mm`,
      cls: "sketch-dim sketch-dim--vertical",
      textOffsetX: 24,
      markerId: "plateDimArrow",
    });
    const pitchXDim = result.state.pitchX > 0 && holes.length > 1
      ? buildDimensionLine({
          x1: toX(holes[0].x),
          y1: toY(plateLength) + 58,
          x2: toX(Math.min(holes[0].x + result.state.pitchX, plateWidth)),
          y2: toY(plateLength) + 58,
          label: `沿力方向孔距 ${formatNumber(result.state.pitchX, 1)} mm`,
          textOffsetY: -6,
          markerId: "plateDimArrow",
        })
      : "";
    const edgeDim = result.state.endDistanceStart > 0
      ? buildDimensionLine({
          x1: toX(0),
          y1: toY(0) - 14,
          x2: toX(Math.min(result.state.endDistanceStart, plateWidth)),
          y2: toY(0) - 14,
          label: `端距 ${formatNumber(result.state.endDistanceStart, 1)} mm`,
          textOffsetY: -6,
          markerId: "plateDimArrow",
        })
      : "";

    return `
      <svg class="plate-sketch${inline ? " plate-sketch--print" : ""}" viewBox="0 0 ${toX(plateWidth) + 76} ${toY(plateLength) + 92}" xmlns="http://www.w3.org/2000/svg" aria-label="連接板幾何示意">
        <defs>
          <marker id="plateArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#0e7490"></path>
          </marker>
          <marker id="plateDimArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#475569"></path>
          </marker>
        </defs>
        <rect x="${toX(0)}" y="${toY(0)}" width="${plateWidth * scale}" height="${plateLength * scale}" class="sketch-plate"/>
        ${holes.map((hole) => `<circle cx="${toX(hole.x)}" cy="${toY(hole.y)}" r="${holeRadius}" class="sketch-hole"/>`).join("")}
        <path d="${blockPath}" class="sketch-block"/>
        ${netPath ? `<polyline points="${netPath}" class="sketch-net"/>` : ""}
        ${arrow}
        ${widthDim}
        ${lengthDim}
        ${pitchXDim}
        ${edgeDim}
        <text x="${toX(plateWidth / 2)}" y="${toY(plateLength) + 14}" text-anchor="middle" class="sketch-label">${loadDirection === "horizontal" ? "水平拉力" : "垂直拉力"}</text>
      </svg>
    `;
  }

  function buildTensionSketchMarkup(result, { inline = false } = {}) {
    if (result.sketchData?.mode !== "geometry") {
      return `<div class="card-placeholder">${result.sketchData?.caption || "本案採指定斷面面積，未建立幾何示意。"}</div>`;
    }

    const {
      memberWidth,
      memberLength,
      connectionMode,
      holes = [],
      weldSegments = [],
      netSection,
      blockShear = [],
      caption,
    } = result.sketchData;
    const scale = Math.min(520 / Math.max(memberLength, 1), 260 / Math.max(memberWidth, 1));
    const toX = (value) => 20 + value * scale;
    const toY = (value) => 20 + value * scale;
    const holeRadius = Math.max(result.state.holeDiameter * scale / 2, 3);
    const netPath = (netSection?.points || []).map((point) => `${toX(point.x)},${toY(point.y)}`).join(" ");
    const blockPath = blockShear.length
      ? blockShear.map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.x)} ${toY(point.y)}`).join(" ") + " Z"
      : "";
    const widthDim = buildDimensionLine({
      x1: toX(0),
      y1: toY(memberWidth) + 42,
      x2: toX(memberLength),
      y2: toY(memberWidth) + 42,
      label: `構材長度示意 ${formatNumber(memberLength, 1)} mm`,
      textOffsetY: -6,
      markerId: "tensionDimArrow",
    });
    const depthDim = buildDimensionLine({
      x1: toX(memberLength) + 26,
      y1: toY(0),
      x2: toX(memberLength) + 26,
      y2: toY(memberWidth),
      label: `構材寬度 b = ${formatNumber(memberWidth, 1)} mm`,
      cls: "sketch-dim sketch-dim--vertical",
      textOffsetX: 34,
      markerId: "tensionDimArrow",
    });
    const localDim = connectionMode === "bolted" && holes.length
      ? buildDimensionLine({
          x1: toX(0),
          y1: toY(0) - 14,
          x2: toX(holes[0].x),
          y2: toY(0) - 14,
          label: `端距 e = ${formatNumber(result.state.tensionEndDistance, 1)} mm`,
          textOffsetY: -6,
          markerId: "tensionDimArrow",
        })
      : result.state.tensionWeldLengthLongitudinal > 0
        ? buildDimensionLine({
            x1: toX(18),
            y1: toY(memberWidth) + 66,
            x2: toX(Math.min(18 + result.state.tensionWeldLengthLongitudinal, memberLength - 18)),
            y2: toY(memberWidth) + 66,
            label: `縱向有效銲長 l = ${formatNumber(result.state.tensionWeldLengthLongitudinal, 1)} mm`,
            textOffsetY: -6,
            markerId: "tensionDimArrow",
          })
        : "";

    return `
      <svg class="plate-sketch${inline ? " plate-sketch--print" : ""}" viewBox="0 0 ${toX(memberLength) + 84} ${toY(memberWidth) + 88}" xmlns="http://www.w3.org/2000/svg" aria-label="拉力構件與接合示意">
        <defs>
          <marker id="tensionArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#0e7490"></path>
          </marker>
          <marker id="tensionDimArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#475569"></path>
          </marker>
        </defs>
        <rect x="${toX(0)}" y="${toY(0)}" width="${memberLength * scale}" height="${memberWidth * scale}" class="sketch-member"/>
        ${connectionMode === "bolted"
          ? holes.map((hole) => `<circle cx="${toX(hole.x)}" cy="${toY(hole.y)}" r="${holeRadius}" class="sketch-hole"/>`).join("")
          : weldSegments.map((segment) => `<line x1="${toX(segment.x1)}" y1="${toY(segment.y1)}" x2="${toX(segment.x2)}" y2="${toY(segment.y2)}" class="sketch-weld ${segment.type === "transverse" ? "sketch-weld--transverse" : ""}"/>`).join("")
        }
        ${blockPath ? `<path d="${blockPath}" class="sketch-block"/>` : ""}
        ${netPath ? `<polyline points="${netPath}" class="sketch-net"/>` : ""}
        <line x1="${toX(10)}" y1="${toY(memberWidth / 2)}" x2="${toX(memberLength - 10)}" y2="${toY(memberWidth / 2)}" class="sketch-arrow" marker-end="url(#tensionArrow)" />
        ${widthDim}
        ${depthDim}
        ${localDim}
        <text x="${toX(memberLength / 2)}" y="${toY(memberWidth) + 18}" text-anchor="middle" class="sketch-label">拉力作用方向</text>
        <text x="${toX(memberLength / 2)}" y="${toY(memberWidth) + 34}" text-anchor="middle" class="sketch-note">${caption || "構材與接合示意"}</text>
      </svg>
    `;
  }

  function renderPlateExtras(result) {
    if (!plateExtrasBlock || !plateSketchBlock || !plateDerivedAreaBody || !platePathSummary || !plateSketchWrap) {
      return;
    }

    const isPlate = result.state.connectionType === "plate_check";
    plateExtrasBlock.classList.toggle("is-hidden", !isPlate);
    plateSketchBlock.classList.toggle("is-hidden", !isPlate);

    if (!isPlate) {
      plateDerivedAreaBody.innerHTML = "";
      platePathSummary.innerHTML = "";
      plateSketchWrap.innerHTML = "";
      return;
    }

    const derived = result.derivedAreas || {};
    plateDerivedAreaBody.innerHTML = buildDerivedAreaRows(derived);

    platePathSummary.innerHTML = `
      <div class="plate-path-grid">
        <div><b>幾何摘要</b><span>${result.plateGeometrySummary?.size || "—"}</span></div>
        <div><b>受力方向</b><span>${result.plateGeometrySummary?.loadDirection || "—"}</span></div>
        <div><b>孔群配置</b><span>${result.plateGeometrySummary?.holePattern || "—"}</span></div>
        <div><b>控制式號</b><span>${result.governing?.equationRef || "—"}</span></div>
        <div><b>淨斷面路徑</b><span>${result.pathSummary?.netSection || "—"}</span></div>
        <div><b>區塊剪力路徑</b><span>${result.pathSummary?.blockShear || "—"}</span></div>
        <div><b>板件面積採用方式</b><span>${mapValue("plateInputMode", result.state.plateInputMode)}</span></div>
      </div>
    `;

    if (result.sketchData?.mode !== "geometry" || result.state.showPlateSketch === false) {
      plateSketchWrap.innerHTML = buildPlateSketchMarkup(result);
      return;
    }
    plateSketchWrap.innerHTML = buildPlateSketchMarkup(result);
  }

  function renderTensionExtras(result) {
    if (!tensionExtrasBlock || !tensionSketchBlock || !tensionDerivedAreaBody || !tensionPathSummary || !tensionSketchWrap) {
      return;
    }

    const isTension = result.state.connectionType === "tension_member";
    tensionExtrasBlock.classList.toggle("is-hidden", !isTension);
    tensionSketchBlock.classList.toggle("is-hidden", !isTension);

    if (!isTension) {
      tensionDerivedAreaBody.innerHTML = "";
      tensionPathSummary.innerHTML = "";
      tensionSketchWrap.innerHTML = "";
      return;
    }

    const derived = result.derivedAreas || {};
    tensionDerivedAreaBody.innerHTML = buildDerivedAreaRows(derived);

    tensionPathSummary.innerHTML = `
      <div class="plate-path-grid">
        <div><b>構材斷面</b><span>${result.tensionGeometrySummary?.size || "—"}</span></div>
        <div><b>接合配置</b><span>${result.tensionGeometrySummary?.connection || "—"}</span></div>
        <div><b>斷面面積採用方式</b><span>${result.tensionGeometrySummary?.areaInput || mapValue("tensionAreaInput", result.state.tensionAreaInput)}</span></div>
        <div><b>接合方式</b><span>${mapValue("tensionConnectionMode", result.state.tensionConnectionMode)}</span></div>
        <div><b>剪力遲滯係數 U</b><span>${formatNumber(result.derivedAreas?.U, 3)}</span></div>
        <div><b>有效淨面積 Ae</b><span>${formatNumber(result.derivedAreas?.Ae, 2)} mm²</span></div>
        <div><b>有效淨面積說明</b><span>${result.pathSummary?.netSection || "—"}</span></div>
        <div><b>區塊剪力說明</b><span>${result.pathSummary?.blockShear || "—"}</span></div>
      </div>
    `;

    tensionSketchWrap.innerHTML = buildTensionSketchMarkup(result);
  }

  function renderShearTabExtras(result) {
    if (!shearTabExtrasBlock || !shearTabDerivedAreaBody || !shearTabPathSummary) return;
    const isShearTab = result.state.connectionType === "single_plate";
    shearTabExtrasBlock.classList.toggle("is-hidden", !isShearTab);
    if (!isShearTab) {
      shearTabDerivedAreaBody.innerHTML = "";
      shearTabPathSummary.innerHTML = "";
      return;
    }
    const derived = result.derivedAreas || {};
    shearTabDerivedAreaBody.innerHTML = [
      ["板全剪力面積 Agv", derived.Agv], ["板淨剪力面積 Anv", derived.Anv],
      ["板 block Agv", derived.plateBlockAgv], ["板 block Anv", derived.plateBlockAnv],
      ["梁腹板 block Agv", derived.beamBlockAgv], ["梁腹板 block Anv", derived.beamBlockAnv],
    ].map(([label, value]) => `<tr><th>${label}</th><td>${formatNumber(value, 2)} mm²</td></tr>`).join("");
    shearTabPathSummary.innerHTML = `
      <div class="plate-path-grid">
        <div><b>剪力板尺寸</b><span>${SteelFormalUI.escapeHtml(result.plateGeometrySummary?.size || "—")}</span></div>
        <div><b>栓群配置</b><span>${SteelFormalUI.escapeHtml(result.plateGeometrySummary?.holePattern || "—")}</span></div>
        <div><b>採用偏心</b><span>${SteelFormalUI.escapeHtml(result.plateGeometrySummary?.eccentricity || "—")}</span></div>
        <div><b>採用設計剪力</b><span>${formatNumber(result.designDemand?.adoptedShear, 3)} kN</span></div>
        <div><b>剪力面說明</b><span>${SteelFormalUI.escapeHtml(result.pathSummary?.netSection || "—")}</span></div>
        <div><b>block 路徑</b><span>${SteelFormalUI.escapeHtml(result.pathSummary?.blockShear || "—")}</span></div>
      </div>`;
  }

  function getCheckStatus(check) {
    const numericResultsAreFinite = [check.demand, check.nominal, check.available, check.ratio].every(Number.isFinite);
    const positiveDemandHasPositiveCapacity = check.demand <= 0 || (check.nominal > 0 && check.available > 0);
    if (!numericResultsAreFinite || !positiveDemandHasPositiveCapacity) return { text: "NG", className: "fail" };
    if (check.ratio > 1) return { text: "NG", className: "fail" };
    if (check.warning) return { text: "注意", className: "warn" };
    return { text: "OK", className: "ok" };
  }

  function statusPill(status) {
    return `<span class="status-pill ${status.className}">${status.text}</span>`;
  }

  function renderStrengthChecks(result) {
    strengthCheckTableBody.innerHTML = result.checks.map((check) => {
      const status = getCheckStatus(check);
      return `
        <tr data-check-key="${check.key}" class="${result.governing.key === check.key ? "is-governing" : ""}">
          <td data-label="檢核項目">${SteelFormalUI.escapeHtml(check.label)}${buildCheckReferenceMarkup(check)}</td>
          <td data-label="需求值">${formatCheckValue(check, check.demand)}</td>
          <td data-label="可用強度">${formatCheckValue(check, check.available)}</td>
          <td data-label="DCR">${formatNumber(check.ratio, 3)}</td>
          <td data-label="判定">${statusPill(status)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderDetailChecks(result) {
    detailCheckTableBody.innerHTML = result.detailChecks.map((item) => `
      <tr data-detail-key="${item.key || item.label}" class="${item.passes ? "" : "is-failing"}">
        <td data-label="檢核項目">${SteelFormalUI.escapeHtml(item.label)}</td>
        <td data-label="規定條文">${SteelFormalUI.escapeHtml(item.codeRef)}</td>
        <td data-label="提供值">${SteelFormalUI.escapeHtml(formatDetailField(item.provided))}</td>
        <td data-label="規定值">${SteelFormalUI.escapeHtml(formatDetailField(item.required))}</td>
        <td data-label="檢核說明">${SteelFormalUI.escapeHtml(item.note)}<div class="check-coderef">${SteelFormalUI.escapeHtml(buildDetailDecisionSentence(item))}</div></td>
        <td data-label="判定">${statusPill(item.passes ? { text: "OK", className: "ok" } : { text: "NG", className: "fail" })}</td>
      </tr>
    `).join("");
  }

  function renderAlerts(result) {
    alertsList.innerHTML = buildReviewSectionsMarkup(result);
  }

  function renderToolReferences() {
    if (!toolReferenceIntro || !toolReferenceList) return;
    toolReferenceIntro.textContent = "下列網路工具僅作介面流程與報表表現方式之借鏡，規範判定仍以本工具引用之正式條文為準。";
    toolReferenceList.innerHTML = `<ul>${toolReferences.map((item) => `
      <li><a href="${item.url}" target="_blank" rel="noreferrer noopener">${item.name}</a>：${item.adopted}</li>
    `).join("")}</ul>`;
  }

  function renderMathIfReady() {
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise()
        .then(() => document.documentElement.classList.add("mathjax-ready"))
        .catch(() => document.documentElement.classList.add("mathjax-fallback"));
      return;
    }
    document.documentElement.classList.add("mathjax-fallback");
  }

  function buildEquationMarkup(check) {
    if (check.latexLines?.length) {
      return `
        <div class="equation-math-wrap">
          <div class="equation-math">
            ${check.latexLines.map((line) => `<div class="equation-math__line">\\[${SteelFormalUI.escapeHtml(line)}\\]</div>`).join("")}
          </div>
          <ul class="equation-list equation-list--fallback">${(check.equationLines || []).map((line) => `<li>${SteelFormalUI.escapeHtml(line)}</li>`).join("")}</ul>
        </div>
      `;
    }
    return `<ul class="equation-list">${(check.equationLines || []).map((line) => `<li>${SteelFormalUI.escapeHtml(line)}</li>`).join("")}</ul>`;
  }

  function buildCheckReferenceMarkup(check) {
    if (!check.codeRef && !check.equationRef) return "";
    const parts = [];
    if (check.codeRef) parts.push(`條文：${check.codeRef}`);
    if (check.equationRef) parts.push(`式號：${check.equationRef}`);
    return `<div class="check-coderef">${SteelFormalUI.escapeHtml(parts.join("｜"))}</div>`;
  }

  function buildDecisionSentence(check) {
    const status = getCheckStatus(check);
    const numericResultsAreFinite = [check.demand, check.nominal, check.available, check.ratio].every(Number.isFinite);
    if (!numericResultsAreFinite) {
      return "需求值、標稱強度、可用強度或 DCR 含非有限值，故本項檢核不符合。";
    }
    if (check.demand > 0 && (check.nominal <= 0 || check.available <= 0)) {
      return "正需求下標稱強度或可用強度不是正值，故本項檢核不符合。";
    }
    if (status.className === "fail") {
      return `需求值 ${formatCheckValue(check, check.demand)} 大於可用強度 ${formatCheckValue(check, check.available)}，故本項檢核不符合。`;
    }
    if (status.className === "warn") {
      return `需求值 ${formatCheckValue(check, check.demand)} 未超過可用強度 ${formatCheckValue(check, check.available)}，但仍需留意警示條件。`;
    }
    return `需求值 ${formatCheckValue(check, check.demand)} 未超過可用強度 ${formatCheckValue(check, check.available)}，故本項檢核符合。`;
  }

  function buildDetailDecisionSentence(item) {
    if (Number.isFinite(item.provided) && Number.isFinite(item.required)) {
      if (item.comparator === "gte") {
        return item.passes
          ? `提供值 ${formatDetailDecisionValue(item.provided)} 已不小於規定值 ${formatDetailDecisionValue(item.required)}，故本項符合。`
          : `提供值 ${formatDetailDecisionValue(item.provided)} 小於規定值 ${formatDetailDecisionValue(item.required)}，故本項不符合。`;
      }
      if (item.comparator === "lte") {
        return item.passes
          ? `提供值 ${formatDetailDecisionValue(item.provided)} 未超過規定上限 ${formatDetailDecisionValue(item.required)}，故本項符合。`
          : `提供值 ${formatDetailDecisionValue(item.provided)} 已超過規定上限 ${formatDetailDecisionValue(item.required)}，故本項不符合。`;
      }
    }
    return item.passes ? "本項檢核符合。" : "本項檢核不符合。";
  }

  function formatDetailField(value) {
    if (typeof value === "boolean") return value ? "是" : "否";
    if (value === true) return "需符合";
    if (value === false) return "不符合";
    if (Number.isFinite(value)) return formatNumber(value, 3);
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  }

  function renderFlow(result) {
    if (!showFlow.checked) {
      flowCards.innerHTML = '<div class="card-placeholder">已關閉計算流程顯示。</div>';
      return;
    }
    flowCards.innerHTML = result.checks.map((check) => {
      const status = getCheckStatus(check);
      return `
        <article class="flow-card">
          <div class="flow-card-head">
            <div>
              <h3>${SteelFormalUI.escapeHtml(check.label)}</h3>
              ${buildCheckReferenceMarkup(check)}
            </div>
            ${statusPill(status)}
          </div>
          <p>${SteelFormalUI.escapeHtml(check.note)}</p>
          <div class="flow-metrics">
            <div class="flow-metric"><span class="label">需求值</span><span class="value">${formatCheckValue(check, check.demand)}</span></div>
            <div class="flow-metric"><span class="label">可用強度</span><span class="value">${formatCheckValue(check, check.available)}</span></div>
            <div class="flow-metric"><span class="label">DCR</span><span class="value">${formatNumber(check.ratio, 3)}</span></div>
          </div>
          <p class="flow-decision">${buildDecisionSentence(check)}</p>
          ${buildEquationMarkup(check)}
        </article>
      `;
    }).join("");
    renderMathIfReady();
  }

  function updateMethodPresentation(state) {
    const isLrfd = state.designMethod === "LRFD";
    methodLrfBtn.classList.toggle("active", isLrfd);
    methodAsdBtn.classList.toggle("active", !isLrfd);
    methodHint.textContent = getCodeBasisText(state);
    updateMethodFab();
  }

  function renderSummary(result) {
    const currentToolMetadata = getFormalToolMetadata(result.state.connectionType);
    const pageToolMetadata = IS_STANDALONE_PLATE ? currentToolMetadata : STEEL_TOOL_METADATA.connection;
    const visiblePageTitle = IS_STANDALONE_PLATE ? result.pageTitle : MAIN_SUITE_PAGE_TITLE;
    const versionedPageTitle = withFormalToolVersion(visiblePageTitle, pageToolMetadata);
    pageTitle.textContent = versionedPageTitle;
    pageDescription.textContent = result.pageDescription;
    document.title = versionedPageTitle;
    reportTitle.textContent = result.reportTitle;
    reportSubtitle.textContent = result.reportSubtitle;
    metaProjectName.textContent = getProjectMetaDisplayValue(result.state.projectName);
    metaConnectionTag.textContent = getProjectMetaDisplayValue(result.state.connectionTag);
    metaDesigner.textContent = getProjectMetaDisplayValue(result.state.designer);
    if (codeBasisDisplay) codeBasisDisplay.value = getCodeBasisText(result.state);
    reportTimestamp.textContent = nowLabel();
    reportBanner.classList.remove("ok", "warn", "fail");
    reportBanner.classList.add(result.overallStatus);

    if (result.passes) {
      reportBanner.textContent = result.overallStatus === "warn" ? "基本通過，仍需留意提醒" : "檢核通過";
      approvalStamp.textContent = result.overallStatus === "warn" ? "條件式核可" : "核可";
      approvalDecision.textContent = result.overallStatus === "warn" ? "條件式核可" : "核可";
    } else if (result.summary.detailFailure && !result.summary.strengthFailure) {
      reportBanner.textContent = "強度可行，但細部規定未通過";
      approvalStamp.textContent = "退回修正";
      approvalDecision.textContent = "細部不符";
    } else {
      reportBanner.textContent = "檢核未通過";
      approvalStamp.textContent = "不核可";
      approvalDecision.textContent = "不核可";
    }

    overallMessage.textContent = result.validations.length
      ? result.validations.join(" ")
      : `控制項為「${result.governing.label}」${result.governing.equationRef ? `（${result.governing.equationRef}）` : ""}，需求 ${formatCheckValue(result.governing, result.governing.demand)}，容量 ${formatCheckValue(result.governing, result.governing.available)}，DCR = ${formatNumber(result.governing.ratio, 3)}。`;
    governingMode.textContent = result.governing.label;
    approvalGoverning.textContent = `${result.governing.label} / DCR ${formatNumber(result.governing.ratio, 3)}`;
    updateMethodPresentation(result.state);
    toggleConnectionSections(result.state.connectionType);
    toggleConditionalSections(result.state.connectionType, result.state.plateInputMode, result.state.tensionAreaInput, result.state.tensionConnectionMode, result.state.tensionWeldType);
    syncInputCardAccordions(result.state.connectionType);
    syncReportBlockAccordions(result);
    updateInputCardStatuses();
    updateMobileQuickNavSummary(result);
    renderExamplePresetOptions(result.state.connectionType, getSelectedExamplePresetId());
  }

  function persistDraft(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: nowLabel(), state }));
    draftStatus.textContent = `草稿已儲存：${nowLabel()}`;
  }

  function loadSavedDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const draftState = parsed.state || null;
      if (!draftState) return null;
      const draftType = draftState.connectionType || "plate_check";
      const mergedState = {
        ...defaultState,
        ...(exampleStates[draftType] || {}),
        ...draftState,
      };
      draftStatus.textContent = `已載入草稿：${parsed.savedAt || "未知時間"}`;
      return mergedState;
    } catch {
      draftStatus.textContent = "草稿讀取失敗";
      return null;
    }
  }

  function pickSourceFields(state, keys) {
    return Object.fromEntries(keys.map((key) => [key, state[key]]));
  }

  function getReportSnapshotState(result) {
    if (result.state.connectionType === "single_plate") return pickSourceFields(result.state, SINGLE_PLATE_SOURCE_FIELD_KEYS);
    if (result.state.connectionType === "brace_gusset") return pickSourceFields(result.state, GUSSET_SOURCE_FIELD_KEYS);
    if (result.state.connectionType === "beam_column_moment") return pickSourceFields(result.state, MOMENT_SOURCE_FIELD_KEYS);
    if (result.state.connectionType === "column_splice") return pickSourceFields(result.state, SPLICE_SOURCE_FIELD_KEYS);
    return result.state;
  }

  function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function jsonSerializableClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function containsNonFiniteNumber(value, seen = new Set()) {
    if (typeof value === "number") return !Number.isFinite(value);
    if (!value || typeof value !== "object") return false;
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.values(value).some((item) => containsNonFiniteNumber(item, seen));
  }

  function assertGussetFiniteFormalResult(result) {
    if (result?.state?.connectionType !== "brace_gusset") return;
    const finiteDerived = result.detailChecks?.find((item) => item.key === "gussetFiniteDerivedResults")?.passes === true;
    const finiteStrength = result.detailChecks?.find((item) => item.key === "gussetFiniteStrengthResults")?.passes === true;
    if (!finiteDerived || !finiteStrength || containsNonFiniteNumber({
      checks: result.checks,
      governing: result.governing,
      derivedAreas: result.derivedAreas,
    })) {
      throw new Error("Gusset 結果含非有限值或數值溢位，禁止核可、正式報告與來源 JSON；未建立含 Infinity 或以 null 代換的正式資料。");
    }
  }

  function assertMomentFiniteFormalResult(result) {
    if (result?.state?.connectionType !== "beam_column_moment") return;
    if (result.validations?.length) {
      throw new Error(`梁柱彎矩接頭輸入驗證未通過，禁止建立正式報告與來源 JSON：${result.validations.join(" ")}`);
    }
    const expectedCheckKeys = [
      "momentFlexuralStrength", "momentShearStrength", "momentPlasticRotation",
      "momentPanelZoneShear", "momentStrongColumnCw", "momentStrongColumnCcw",
    ].sort();
    const actualCheckKeys = (result.checks || []).map((check) => check?.key).sort();
    const seismicNumericKeys = [
      "Mp", "Mpr", "MprFar", "Vp", "MuFace", "VuRequired", "rotationDemand", "qualifiedRotation",
      "VpzMin", "VpzRequired", "VpzNominal", "panelThicknessRequired", "continuityThreshold", "scwbCw", "scwbCcw",
    ];
    const seismicKeysAreFinite = seismicNumericKeys.every((key) => Number.isFinite(result.seismicReview?.[key]));
    if (result.complianceReady !== true
      || result.completeJointDesign !== false
      || !result.seismicReview
      || typeof result.seismicReview.continuityRequired !== "boolean"
      || canonicalJson(actualCheckKeys) !== canonicalJson(expectedCheckKeys)
      || !seismicKeysAreFinite) {
      throw new Error("梁柱彎矩接頭正式邊界不完整；必須保留 completeJointDesign = false 與耐震審查派生資料，禁止建立正式輸出。");
    }
    if (containsNonFiniteNumber({
      checks: result.checks,
      governing: result.governing,
      detailChecks: result.detailChecks,
      seismicReview: result.seismicReview,
    })) {
      throw new Error("梁柱彎矩接頭結果含非有限值或數值溢位，禁止建立正式報告與來源 JSON。");
    }
  }

  function assertSpliceFiniteFormalResult(result) {
    if (result?.state?.connectionType !== "column_splice") return;
    if (result.validations?.length) {
      throw new Error(`全斷面 CJP 耐震柱續接輸入驗證未通過，禁止建立正式報告與來源 JSON：${result.validations.join(" ")}`);
    }
    const expectedCheckKeys = [
      "spliceAxialCompression13_4_1", "spliceAxialTension13_4_1", "spliceFullSectionNormal",
      "spliceFullSectionMajorFlexure", "spliceFullSectionMinorFlexure",
      "spliceFullSectionMajorShear", "spliceFullSectionMinorShear",
    ].sort();
    const actualCheckKeys = (result.checks || []).map((check) => check?.key).sort();
    const spliceNumericKeys = [
      "EampRaw", "EampAdopted", "PuCompression", "TuTension", "normalCapacity",
      "majorFlexuralCapacity", "minorFlexuralCapacity", "majorShearCapacity", "minorShearCapacity",
    ];
    const spliceKeysAreFinite = spliceNumericKeys.every((key) => Number.isFinite(result.spliceReview?.[key]));
    if (result.complianceReady !== true
      || result.completeColumnMemberDesign !== false
      || result.asBuiltAcceptance !== false
      || !result.spliceReview
      || canonicalJson(actualCheckKeys) !== canonicalJson(expectedCheckKeys)
      || !spliceKeysAreFinite) {
      throw new Error("全斷面 CJP 耐震柱續接正式邊界不完整；必須保留 completeColumnMemberDesign = false、asBuiltAcceptance = false 與固定七項能力鏈，禁止建立正式輸出。");
    }
    if (containsNonFiniteNumber({
      checks: result.checks,
      governing: result.governing,
      detailChecks: result.detailChecks,
      spliceReview: result.spliceReview,
    })) {
      throw new Error("全斷面 CJP 耐震柱續接結果含非有限值或數值溢位，禁止建立正式報告與來源 JSON。");
    }
  }

  function assertFormalResultBoundary(result) {
    assertGussetFiniteFormalResult(result);
    assertMomentFiniteFormalResult(result);
    assertSpliceFiniteFormalResult(result);
  }

  function buildConnectionReportConfig(result) {
    const outputSource = getFormalToolMetadata(result.state.connectionType);
    return {
      title: result.reportTitle,
      subtitle: result.reportSubtitle,
      outputSource,
      textExport: true,
      checks: result.checks,
      summary: { ok: result.passes, text: reportBanner.textContent },
      snapshot: {
        state: getReportSnapshotState(result),
        governing: result.governing,
        detailChecks: result.detailChecks,
        derivedAreas: result.derivedAreas,
        designDemand: result.designDemand,
        assumptions: result.assumptions,
        references: result.references,
        pathSummary: result.pathSummary,
        ...(result.seismicReview ? {
          seismicReview: result.seismicReview,
          completeJointDesign: result.completeJointDesign,
        } : {}),
        ...(result.spliceReview ? {
          spliceReview: result.spliceReview,
          completeColumnMemberDesign: result.completeColumnMemberDesign,
          asBuiltAcceptance: result.asBuiltAcceptance,
        } : {}),
      },
    };
  }

  function buildConnectionReportTrace(result) {
    return SteelFormalUI.buildReportTrace(buildConnectionReportConfig(result));
  }

  function buildConnectionSourcePayload(result = window.latestSteelConnectionResult || calculateConnection(collectFormState())) {
    assertFormalResultBoundary(result);
    const reportConfig = buildConnectionReportConfig(result);
    const reportTrace = SteelFormalUI.buildReportTrace(reportConfig);
    return {
      schemaVersion: 1,
      kind: "formal-calculation-source",
      savedAt: new Date().toISOString(),
      project: {
        name: normalizeProjectMetaValue(result.state.projectName),
        no: normalizeProjectMetaValue(result.state.connectionTag),
        designer: normalizeProjectMetaValue(result.state.designer),
      },
      tool: {
        id: reportConfig.outputSource.id,
        name: reportTrace.sourceTrace.tool,
        version: reportTrace.sourceTrace.version,
      },
      connectionType: result.state.connectionType,
      designMethod: result.state.designMethod,
      fields: { ...reportConfig.snapshot.state },
      calculationFingerprint: reportTrace.calculationFingerprint,
      report: {
        title: reportConfig.title,
        subtitle: reportConfig.subtitle,
        checks: reportConfig.checks,
        summary: reportConfig.summary,
        snapshot: reportConfig.snapshot,
        calculationFingerprint: reportTrace.calculationFingerprint,
      },
    };
  }

  function sourceJsonFilename(payload) {
    const identity = payload.project.no || payload.project.name || "source";
    const safeIdentity = String(identity).trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "source";
    return `${payload.tool.id}-${safeIdentity}.json`;
  }

  function exportConnectionSourceJson() {
    try {
      const payload = buildConnectionSourcePayload();
      const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = sourceJsonFilename(payload);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportReportStatus(`已匯出來源 JSON｜計算指紋 ${payload.calculationFingerprint}`);
    } catch (error) {
      setExportReportStatus(`來源 JSON 未匯出｜${error?.message || "未知錯誤"}`);
    }
  }

  function validateSinglePlateSourceFields(payload) {
    const fields = payload.fields;
    const expectedKeys = [...SINGLE_PLATE_SOURCE_FIELD_KEYS].sort();
    const actualKeys = Object.keys(fields || {}).sort();
    if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
      const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
      const extra = actualKeys.filter((key) => !expectedKeys.includes(key));
      throw new Error(`來源 JSON 驗證失敗：Shear Tab 欄位集合不符（缺少 ${missing.join(",") || "無"}；多出 ${extra.join(",") || "無"}）。`);
    }
    SINGLE_PLATE_NUMBER_FIELDS.forEach((key) => {
      if (typeof fields[key] !== "number" || !Number.isFinite(fields[key])) throw new Error(`來源 JSON 驗證失敗：${key} 必須為有限數值。`);
    });
    ["deformationConsidered", "fillerExtended", "conventionalMaterialConfirmed", "connectionModelConfirmed"].forEach((key) => {
      if (typeof fields[key] !== "boolean") throw new Error(`來源 JSON 驗證失敗：${key} 必須為布林值。`);
    });
    ["projectName", "connectionTag", "designer", "notes", "demandBasis", "geometryBasis", "materialBasis", "eccentricityBasis"].forEach((key) => {
      if (typeof fields[key] !== "string") throw new Error(`來源 JSON 驗證失敗：${key} 必須為文字。`);
    });
    const enums = {
      designMethod: ["LRFD", "ASD"], connectionType: ["single_plate"], exposureCondition: ["painted", "weathering"],
      holeType: ["standard", "oversized", "short_slot_parallel", "short_slot_perpendicular", "long_slot_parallel", "long_slot_perpendicular"],
      edgeFabrication: ["rolled", "sheared"], boltGrade: ["F10T"], threadsCondition: ["included", "excluded"],
    };
    Object.entries(enums).forEach(([key, allowed]) => {
      if (!allowed.includes(fields[key])) throw new Error(`來源 JSON 驗證失敗：${key} 列舉值不支援。`);
    });
    if (!Number.isInteger(fields.boltCount) || fields.boltCount < 1 || fields.boltCount > 12) throw new Error("來源 JSON 驗證失敗：boltCount 必須為 1 至 12 的整數。");
    if (!Number.isInteger(fields.shearPlanes) || ![1, 2].includes(fields.shearPlanes)) throw new Error("來源 JSON 驗證失敗：shearPlanes 必須為 1 或 2。");
    if (!Number.isInteger(fields.weldLineCount) || ![1, 2].includes(fields.weldLineCount)) throw new Error("來源 JSON 驗證失敗：weldLineCount 必須為 1 或 2。");
    const unconstrainedDemandFields = new Set(["requiredAxial", "requiredShear", "requiredMoment"]);
    const nonnegative = new Set(["eccentricity", "weldEccentricity", "fillerThickness"]);
    SINGLE_PLATE_NUMBER_FIELDS.forEach((key) => {
      if (unconstrainedDemandFields.has(key)) return;
      if (nonnegative.has(key) ? fields[key] < 0 : fields[key] <= 0) throw new Error(`來源 JSON 驗證失敗：${key} 超出允許範圍。`);
    });
    if (payload.project?.name !== normalizeProjectMetaValue(fields.projectName)
      || payload.project?.no !== normalizeProjectMetaValue(fields.connectionTag)
      || payload.project?.designer !== normalizeProjectMetaValue(fields.designer)) {
      throw new Error("來源 JSON 驗證失敗：project 與 fields 專案資料不一致。");
    }
  }

  function validateGussetSourceFields(payload) {
    const fields = payload.fields;
    const expectedKeys = [...GUSSET_SOURCE_FIELD_KEYS].sort();
    const actualKeys = Object.keys(fields || {}).sort();
    if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
      const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
      const extra = actualKeys.filter((key) => !expectedKeys.includes(key));
      throw new Error(`來源 JSON 驗證失敗：Gusset 欄位集合不符（缺少 ${missing.join(",") || "無"}；多出 ${extra.join(",") || "無"}）。`);
    }
    GUSSET_NUMBER_FIELDS.forEach((key) => {
      if (typeof fields[key] !== "number" || !Number.isFinite(fields[key])) throw new Error(`來源 JSON 驗證失敗：${key} 必須為有限數值。`);
    });
    ["deformationConsidered", "gussetStaticNonseismicConfirmed", "gussetLoadPathConfirmed"].forEach((key) => {
      if (typeof fields[key] !== "boolean") throw new Error(`來源 JSON 驗證失敗：${key} 必須為布林值。`);
    });
    ["projectName", "connectionTag", "designer", "notes", "gussetDemandBasis", "gussetGeometryBasis", "gussetMaterialBasis", "gussetModelBasis"].forEach((key) => {
      if (typeof fields[key] !== "string") throw new Error(`來源 JSON 驗證失敗：${key} 必須為文字。`);
    });
    const enums = {
      designMethod: ["LRFD"], connectionType: ["brace_gusset"], exposureCondition: ["painted", "weathering"],
      holeType: ["standard"], edgeFabrication: ["rolled", "sheared"], boltGrade: ["F10T"], threadsCondition: ["included", "excluded"],
      braceSectionType: ["flat_plate"],
    };
    Object.entries(enums).forEach(([key, allowed]) => {
      if (!allowed.includes(fields[key])) throw new Error(`來源 JSON 驗證失敗：${key} 列舉值不支援。`);
    });
    if (!Number.isInteger(fields.gussetBoltCount) || fields.gussetBoltCount < 2 || fields.gussetBoltCount > 12) throw new Error("來源 JSON 驗證失敗：gussetBoltCount 必須為 2 至 12 的整數。");
    if (fields.gussetShearPlanes !== 1) throw new Error("來源 JSON 驗證失敗：gussetShearPlanes 必須為 1。");
    if (fields.weldLineCount !== 2) throw new Error("來源 JSON 驗證失敗：weldLineCount 必須為 2。");
    const expectedWhitmoreConnectionLength = (fields.gussetBoltCount - 1) * fields.gussetPitch;
    if (!(fields.gussetWhitmoreConnectionLength > 0)
      || Math.abs(fields.gussetWhitmoreConnectionLength - expectedWhitmoreConnectionLength) > 1e-9) {
      throw new Error("來源 JSON 驗證失敗：gussetWhitmoreConnectionLength 必須大於 0 且等於 (gussetBoltCount − 1) × gussetPitch。");
    }
    if (fields.gussetWhitmoreConnectionLength > 1250) throw new Error("來源 JSON 驗證失敗：表 10.3-2 註 [e] 原針對承壓式接合之續接拉力構材；本 Gusset 為端部接合，V1 在尚未實作長接合路線前保守援用 Lconn ≤ 1250 mm，並非一般接合的條文上限。");
    if (!(fields.requiredAxial > 0)) throw new Error("來源 JSON 驗證失敗：requiredAxial 必須為正拉力。");
    for (const key of ["requiredShear", "requiredMoment", "eccentricity"]) {
      if (fields[key] !== 0) throw new Error(`來源 JSON 驗證失敗：${key} 必須為 0。`);
    }
    const positiveFields = GUSSET_NUMBER_FIELDS.filter((key) => !["requiredAxial", "requiredShear", "requiredMoment", "eccentricity", "gussetBoltCount", "gussetShearPlanes", "weldLineCount"].includes(key));
    positiveFields.forEach((key) => {
      if (!(fields[key] > 0)) throw new Error(`來源 JSON 驗證失敗：${key} 必須大於 0。`);
    });
    if (Math.abs(fields.boltUltimateStrength - 1000) > 1) throw new Error("來源 JSON 驗證失敗：F10T 的 boltUltimateStrength 必須為 1000 MPa。");
    const finiteProbe = calculateConnection(fields);
    if (finiteProbe.detailChecks.find((item) => item.key === "gussetFiniteDerivedResults")?.passes !== true
      || finiteProbe.detailChecks.find((item) => item.key === "gussetFiniteStrengthResults")?.passes !== true
      || containsNonFiniteNumber({ checks: finiteProbe.checks, governing: finiteProbe.governing, derivedAreas: finiteProbe.derivedAreas })) {
      throw new Error("來源 JSON 驗證失敗：Gusset 結果含非有限值或數值溢位；拒絕以 Infinity 或 JSON null 代換建立正式來源。");
    }
    if (payload.project?.name !== normalizeProjectMetaValue(fields.projectName)
      || payload.project?.no !== normalizeProjectMetaValue(fields.connectionTag)
      || payload.project?.designer !== normalizeProjectMetaValue(fields.designer)) {
      throw new Error("來源 JSON 驗證失敗：project 與 fields 專案資料不一致。");
    }
  }

  function validateMomentSourceFields(payload) {
    const fields = payload.fields || {};
    const expectedKeys = [...MOMENT_SOURCE_FIELD_KEYS].sort();
    const actualKeys = Object.keys(fields || {}).sort();
    if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
      const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
      const extra = actualKeys.filter((key) => !expectedKeys.includes(key));
      throw new Error(`來源 JSON 驗證失敗：梁柱彎矩欄位集合不符（缺少 ${missing.join(",") || "無"}；多出 ${extra.join(",") || "無"}）。`);
    }
    MOMENT_NUMBER_FIELDS.forEach((key) => {
      if (typeof fields[key] !== "number" || !Number.isFinite(fields[key])) {
        throw new Error(`來源 JSON 驗證失敗：${key} 必須為有限數值。`);
      }
    });
    MOMENT_BOOLEAN_FIELDS.forEach((key) => {
      if (typeof fields[key] !== "boolean") throw new Error(`來源 JSON 驗證失敗：${key} 必須為布林值。`);
    });
    MOMENT_TEXT_FIELDS.forEach((key) => {
      if (typeof fields[key] !== "string") throw new Error(`來源 JSON 驗證失敗：${key} 必須為文字。`);
    });
    const enums = {
      designMethod: ["LRFD"],
      connectionType: ["beam_column_moment"],
      exposureCondition: ["painted", "weathering"],
      momentFrameSystem: ["smrf", "imrf"],
      momentAxis: ["x", "y"],
      momentConnectionDesignRoute: ["reinforced"],
      momentRotationDemandMethod: ["default", "nonlinear", "formula"],
      momentQualificationRoute: ["direct_test", "prior_test_similarity", "third_party_review"],
    };
    Object.entries(enums).forEach(([key, allowed]) => {
      if (!allowed.includes(fields[key])) throw new Error(`來源 JSON 驗證失敗：${key} 列舉值不支援。`);
    });
    if (!Number.isInteger(fields.momentQualificationTestCount) || fields.momentQualificationTestCount < 0) {
      throw new Error("來源 JSON 驗證失敗：momentQualificationTestCount 必須為非負整數。");
    }
    const signedFields = new Set(["momentGravityShear"]);
    MOMENT_NUMBER_FIELDS.forEach((key) => {
      if (signedFields.has(key)) return;
      if (fields[key] < 0) {
        throw new Error(`來源 JSON 驗證失敗：${key} 超出允許範圍。`);
      }
    });
    if (payload.project?.name !== normalizeProjectMetaValue(fields.projectName)
      || payload.project?.no !== normalizeProjectMetaValue(fields.connectionTag)
      || payload.project?.designer !== normalizeProjectMetaValue(fields.designer)) {
      throw new Error("來源 JSON 驗證失敗：project 與 fields 專案資料不一致。");
    }
    const replay = calculateConnection(fields);
    try {
      assertMomentFiniteFormalResult(replay);
    } catch (error) {
      throw new Error(`來源 JSON 驗證失敗：${error?.message || "梁柱彎矩接頭正式邊界不完整。"}`);
    }
  }

  function validateColumnSpliceSourceFields(payload) {
    const fields = payload.fields || {};
    const expectedKeys = [...SPLICE_SOURCE_FIELD_KEYS].sort();
    const actualKeys = Object.keys(fields).sort();
    if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
      const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
      const extra = actualKeys.filter((key) => !expectedKeys.includes(key));
      throw new Error(`來源 JSON 驗證失敗：全斷面 CJP 耐震柱續接欄位集合不符（缺少 ${missing.join(",") || "無"}；多出 ${extra.join(",") || "無"}）。`);
    }
    SPLICE_NUMBER_FIELDS.forEach((key) => {
      if (typeof fields[key] !== "number" || !Number.isFinite(fields[key])) {
        throw new Error(`來源 JSON 驗證失敗：${key} 必須為有限數值。`);
      }
    });
    SPLICE_BOOLEAN_FIELDS.forEach((key) => {
      if (typeof fields[key] !== "boolean") throw new Error(`來源 JSON 驗證失敗：${key} 必須為布林值。`);
    });
    SPLICE_TEXT_FIELDS.forEach((key) => {
      if (typeof fields[key] !== "string") throw new Error(`來源 JSON 驗證失敗：${key} 必須為文字。`);
    });
    const enums = {
      designMethod: ["LRFD"],
      connectionType: ["column_splice"],
      exposureCondition: ["painted", "weathering"],
      spliceFrameRole: ["seismic_force_resisting"],
      spliceDesignRoute: ["cjp_full_section_identical_rolled_h"],
      spliceLocationRoute: ["beam_flange_1200"],
      spliceLiveLoadFactor: [0.5, 1],
      spliceTransferCapRoute: ["uncapped", "qualified"],
      spliceFabricationLocation: ["shop", "field"],
      spliceNdtMethod: ["UT", "RT"],
    };
    Object.entries(enums).forEach(([key, allowed]) => {
      if (!allowed.includes(fields[key])) throw new Error(`來源 JSON 驗證失敗：${key} 列舉值不支援。`);
    });
    if (!(fields.spliceSeismicReductionFu > 0) || fields.spliceSeismicReductionFu > 2.5) {
      throw new Error("來源 JSON 驗證失敗：spliceSeismicReductionFu 必須大於 0 且不得大於 2.5。");
    }
    const positiveFields = ["spliceAg", "spliceZx", "spliceZy", "spliceAvx", "spliceAvy", "spliceFy", "spliceFexx", "spliceMaxThickness"];
    positiveFields.forEach((key) => {
      if (!(fields[key] > 0)) throw new Error(`來源 JSON 驗證失敗：${key} 必須大於 0。`);
    });
    if (fields.spliceMaxTransferableAxial < 0
      || (fields.spliceTransferCapRoute === "qualified" && !(fields.spliceMaxTransferableAxial > 0))) {
      throw new Error("來源 JSON 驗證失敗：spliceMaxTransferableAxial 不得為負，qualified 路線且必須大於 0。");
    }
    if (payload.project?.name !== normalizeProjectMetaValue(fields.projectName)
      || payload.project?.no !== normalizeProjectMetaValue(fields.connectionTag)
      || payload.project?.designer !== normalizeProjectMetaValue(fields.designer)) {
      throw new Error("來源 JSON 驗證失敗：project 與 fields 專案資料不一致。");
    }
    const replay = calculateConnection(fields);
    try {
      assertSpliceFiniteFormalResult(replay);
    } catch (error) {
      throw new Error(`來源 JSON 驗證失敗：${error?.message || "全斷面 CJP 耐震柱續接正式邊界不完整。"}`);
    }
  }

  function validateConnectionSourcePayload(payload) {
    if (IS_STANDALONE_PLATE && payload?.connectionType !== "plate_check") {
      throw new Error("來源 JSON 驗證失敗：連接板獨立頁不可匯入梁柱彎矩或其他接頭模組。");
    }
    const expectedMetadata = getFormalToolMetadata(payload.connectionType);
    const allowedToolIds = IS_STANDALONE_PLATE
      ? [STEEL_TOOL_METADATA.plate.id]
      : [STEEL_TOOL_METADATA.plate.id, STEEL_TOOL_METADATA.tension.id, STEEL_TOOL_METADATA.connection.id];
    SteelFormalUI.validateCalculationSourcePayload(payload, {
      expectedToolIds: allowedToolIds,
      expectedVersion: expectedMetadata.version,
    });
    if (!['plate_check', 'tension_member', 'single_plate', 'brace_gusset', 'beam_column_moment', 'column_splice'].includes(payload.connectionType)) {
      throw new Error('來源 JSON 驗證失敗：不支援此檢核模組。');
    }
    if (payload.tool.id !== expectedMetadata.id || payload.fields.connectionType !== payload.connectionType) {
      throw new Error('來源 JSON 驗證失敗：工具種類與檢核模組不一致。');
    }
    if (!['LRFD', 'ASD'].includes(payload.designMethod) || payload.fields.designMethod !== payload.designMethod) {
      throw new Error('來源 JSON 驗證失敗：設計方法不一致。');
    }
    if (payload.connectionType === 'single_plate') validateSinglePlateSourceFields(payload);
    if (payload.connectionType === 'brace_gusset') validateGussetSourceFields(payload);
    if (payload.connectionType === 'beam_column_moment') validateMomentSourceFields(payload);
    if (payload.connectionType === 'column_splice') validateColumnSpliceSourceFields(payload);
    return payload;
  }

  async function importConnectionSourceJson(file) {
    const previousFields = collectFormState();
    let stateChanged = false;
    try {
      const payload = validateConnectionSourcePayload(await SteelFormalUI.readCalculationSourceFile(file, {
        expectedToolIds: IS_STANDALONE_PLATE
          ? [STEEL_TOOL_METADATA.plate.id]
          : [STEEL_TOOL_METADATA.plate.id, STEEL_TOOL_METADATA.tension.id, STEEL_TOOL_METADATA.connection.id],
      }));
      stateChanged = true;
      setFormState(['single_plate', 'brace_gusset', 'beam_column_moment', 'column_splice'].includes(payload.connectionType) ? { ...defaultState, ...payload.fields } : payload.fields, false);
      const replay = buildConnectionSourcePayload();
      if (replay.calculationFingerprint !== payload.calculationFingerprint) {
        throw new Error(`重現指紋不一致（來源 ${payload.calculationFingerprint}，重算 ${replay.calculationFingerprint}）。`);
      }
      if (['single_plate', 'brace_gusset', 'beam_column_moment', 'column_splice'].includes(payload.connectionType)
        && canonicalJson(jsonSerializableClone(replay.report)) !== canonicalJson(payload.report)) {
        throw new Error('來源 JSON 驗證失敗：內嵌報告內容與來源欄位重算結果不一致。');
      }
      setExportReportStatus(`已匯入並重現計算｜計算指紋 ${replay.calculationFingerprint}`);
    } catch (error) {
      if (stateChanged) setFormState(previousFields, false);
      setExportReportStatus(`匯入失敗，已保留原輸入｜${error?.message || '未知錯誤'}`);
    } finally {
      if (importSourceJsonInput) importSourceJsonInput.value = '';
    }
  }

  function buildReportHtml(result) {
    const reportTrace = buildConnectionReportTrace(result);
    const reportDocument = SteelFormalUI.buildFormalDocumentStateReport({
      project: {
        name: normalizeProjectMetaValue(result.state.projectName),
        no: normalizeProjectMetaValue(result.state.connectionTag),
        designer: normalizeProjectMetaValue(result.state.designer),
      },
      calculated: true,
      readinessLevel: result.passes ? (result.overallStatus === "warn" ? "review" : "ready") : "blocked",
      formalApprovalAllowed: result.passes,
      calculationFingerprint: reportTrace.calculationFingerprint,
      textExport: true,
    });
    const escReport = SteelFormalUI.escapeHtml;
    const inputTablesHtml = getInputGroups(result.state.connectionType).map((group) => `
      <section class="block input-block"><table class="input-table"><thead>
        <tr class="input-context-header"><th colspan="2">採用輸入｜${escReport(group.title)}</th></tr>
      </thead><tbody>
        ${group.items.map(([key, label, unit]) => `<tr><th>${escReport(label)}</th><td>${escReport(mapValue(key, result.state[key]))}${unit ? ` ${escReport(unit)}` : ""}</td></tr>`).join("")}
      </tbody></table></section>
    `).join("");
    const scopeHtml = `
      <section class="block"><h3>適用範圍、限制與人工複核責任</h3>
        <div class="review-section"><div class="review-section__title">規範判定與採用模型</div><ul>${(result.assumptions || []).map((item) => `<li>${escReport(item)}</li>`).join("")}</ul></div>
        <div class="review-section"><div class="review-section__title">引用依據</div><ul>${(result.references || []).map((item) => `<li>${escReport(item)}</li>`).join("")}</ul></div>
        <div class="review-section"><div class="review-section__title">人工複核責任</div><p>本附件只涵蓋表列模型與極限狀態；設計者仍須核對核定圖說、力流、材料證明、施工條件及所有排除事項，並對專案採用負責。</p></div>
      </section>`;
    const strengthRows = result.checks.map((check) => `
      <tr>
        <td>${escReport(check.label)}${buildCheckReferenceMarkup(check)}</td>
        <td>${formatCheckValue(check, check.demand)}</td>
        <td>${formatCheckValue(check, check.available)}</td>
        <td>${formatNumber(check.ratio, 3)}</td>
        <td>${escReport(getCheckStatus(check).text)}</td>
      </tr>
    `).join("");
    const detailRows = result.detailChecks.map((item) => `
      <tr>
        <td>${escReport(item.label)}</td>
        <td>${escReport(item.codeRef)}</td>
        <td>${escReport(formatDetailField(item.provided))}</td>
        <td>${escReport(formatDetailField(item.required))}</td>
        <td>${escReport(item.note)}<div class="check-coderef">${escReport(buildDetailDecisionSentence(item))}</div></td>
        <td>${item.passes ? "OK" : "NG"}</td>
      </tr>
    `).join("");
    const flowSections = result.checks.map((check) => `
      <section class="block">
        <h3>${escReport(check.label)}${check.codeRef || check.equationRef ? `｜${escReport([check.codeRef, check.equationRef].filter(Boolean).join("｜"))}` : ""}</h3>
        <p style="font-size:12px;color:#555;margin:0 0 8px;">${escReport(buildDecisionSentence(check))}</p>
        ${check.latexLines?.length
          ? `<div class="equation-math-wrap equation-math-wrap--print"><div class="equation-math equation-math--print">${check.latexLines.map((line) => `<div class="equation-math__line">\\[${line}\\]</div>`).join("")}</div><div class="mono mono--fallback">${(check.equationLines || []).map(escReport).join("<br>")}</div></div>`
          : `<div class="mono">${(check.equationLines || []).map(escReport).join("<br>")}</div>`}
      </section>
    `);
    const flowHtml = flowSections.slice(0, -1).join("");
    const endingFlowHtml = flowSections.at(-1) || "";
    const plateAreaTable = result.state.connectionType === "plate_check" && result.derivedAreas
      ? `<section class="block"><h3>連接板派生面積</h3><table><tbody>
          <tr><th>Ag</th><td>${formatNumber(result.derivedAreas.Ag, 2)} mm²</td></tr>
          <tr><th>An</th><td>${formatNumber(result.derivedAreas.An, 2)} mm²</td></tr>
          <tr><th>Ae</th><td>${formatNumber(result.derivedAreas.Ae, 2)} mm²</td></tr>
          <tr><th>Agv</th><td>${formatNumber(result.derivedAreas.Agv, 2)} mm²</td></tr>
          <tr><th>Anv</th><td>${formatNumber(result.derivedAreas.Anv, 2)} mm²</td></tr>
          <tr><th>Agt</th><td>${formatNumber(result.derivedAreas.Agt, 2)} mm²</td></tr>
          <tr><th>Ant</th><td>${formatNumber(result.derivedAreas.Ant, 2)} mm²</td></tr>
        </tbody></table><div style="margin-top:8px;font-size:12px;color:#555;">${result.pathSummary?.netSection || ""}<br>${result.pathSummary?.blockShear || ""}</div></section>
        <section class="block report-sketch-block"><h3>破壞路徑示意</h3>${buildPlateSketchMarkup(result, { inline: true })}</section>`
      : "";
    const tensionAreaTable = result.state.connectionType === "tension_member" && result.derivedAreas
      ? `<section class="block"><h3>拉力構件派生面積</h3><table><tbody>
          <tr><th>Ag</th><td>${formatNumber(result.derivedAreas.Ag, 2)} mm²</td></tr>
          <tr><th>An</th><td>${formatNumber(result.derivedAreas.An, 2)} mm²</td></tr>
          <tr><th>Ae</th><td>${formatNumber(result.derivedAreas.Ae, 2)} mm²</td></tr>
          <tr><th>U</th><td>${formatNumber(result.derivedAreas.U, 3)}</td></tr>
          <tr><th>Agv</th><td>${formatNumber(result.derivedAreas.Agv, 2)} mm²</td></tr>
          <tr><th>Anv</th><td>${formatNumber(result.derivedAreas.Anv, 2)} mm²</td></tr>
          <tr><th>Agt</th><td>${formatNumber(result.derivedAreas.Agt, 2)} mm²</td></tr>
          <tr><th>Ant</th><td>${formatNumber(result.derivedAreas.Ant, 2)} mm²</td></tr>
        </tbody></table><div style="margin-top:8px;font-size:12px;color:#555;">${result.pathSummary?.netSection || ""}<br>${result.pathSummary?.blockShear || ""}</div></section>
        <section class="block report-sketch-block"><h3>構材與接合示意</h3>${buildTensionSketchMarkup(result, { inline: true })}</section>`
      : "";
    const shearTabAreaTable = result.state.connectionType === "single_plate" && result.derivedAreas
      ? `<section class="block"><h3>Shear Tab 派生幾何與面積</h3><table><tbody>
          <tr><th>剪力板尺寸</th><td>${escReport(result.plateGeometrySummary?.size || "—")}</td></tr>
          <tr><th>栓群配置</th><td>${escReport(result.plateGeometrySummary?.holePattern || "—")}</td></tr>
          <tr><th>採用偏心</th><td>${escReport(result.plateGeometrySummary?.eccentricity || "—")}</td></tr>
          <tr><th>板全剪力面積 Agv</th><td>${formatNumber(result.derivedAreas.Agv, 2)} mm²</td></tr>
          <tr><th>板淨剪力面積 Anv</th><td>${formatNumber(result.derivedAreas.Anv, 2)} mm²</td></tr>
          <tr><th>採用設計剪力 Vd</th><td>${formatNumber(result.designDemand?.adoptedShear, 3)} kN</td></tr>
        </tbody></table><div style="margin-top:8px;font-size:12px;color:#555;">${escReport(result.pathSummary?.netSection || "")}<br>${escReport(result.pathSummary?.blockShear || "")}</div></section>`
      : "";
    const gussetAreaTable = result.state.connectionType === "brace_gusset" && result.derivedAreas
      ? `<section class="block"><h3>Gusset V1 派生幾何與面積</h3><table><tbody>
          <tr><th>Gusset 栓孔斷面 Ag / An / Ae</th><td>${formatNumber(result.derivedAreas.gussetGrossArea, 2)} / ${formatNumber(result.derivedAreas.gussetNetArea, 2)} / ${formatNumber(result.derivedAreas.gussetEffectiveNetArea, 2)} mm²；Ae = min(An, 0.85Ag)，Ag 採栓孔斷面 gross plate width，非 Whitmore 初始寬度</td></tr>
          <tr><th>平板支撐 Ag / An / Ae</th><td>${formatNumber(result.derivedAreas.braceGrossArea, 2)} / ${formatNumber(result.derivedAreas.braceNetArea, 2)} / ${formatNumber(result.derivedAreas.braceNetArea, 2)} mm²；矩形截面全元素直接連接，U = 1.0、Ae = An</td></tr>
          <tr><th>Gusset 塊狀撕裂 Agv / Anv / Agt / Ant</th><td>${formatNumber(result.derivedAreas.gussetBlockAgv, 2)} / ${formatNumber(result.derivedAreas.gussetBlockAnv, 2)} / ${formatNumber(result.derivedAreas.gussetBlockAgt, 2)} / ${formatNumber(result.derivedAreas.gussetBlockAnt, 2)} mm²</td></tr>
          <tr><th>支撐材塊狀撕裂 Agv / Anv / Agt / Ant</th><td>${formatNumber(result.derivedAreas.braceBlockAgv, 2)} / ${formatNumber(result.derivedAreas.braceBlockAnv, 2)} / ${formatNumber(result.derivedAreas.braceBlockAgt, 2)} / ${formatNumber(result.derivedAreas.braceBlockAnt, 2)} mm²</td></tr>
          <tr><th>Whitmore Lconn / 理論 / 可用有效寬度</th><td>${formatNumber(result.state.gussetWhitmoreConnectionLength, 2)} / ${formatNumber(result.derivedAreas.gussetWhitmoreTheoreticalWidth, 2)} / ${formatNumber(result.derivedAreas.gussetWhitmoreEffectiveWidth, 2)} mm；單列栓起始寬度 = 0，bW = 2Lconn tan30°</td></tr>
          <tr><th>Whitmore 有效面積</th><td>${formatNumber(result.derivedAreas.gussetWhitmoreArea, 2)} mm²</td></tr>
        </tbody></table></section>`
      : "";
    const momentReviewTable = result.state.connectionType === "beam_column_moment" && result.seismicReview
      ? `<section class="block"><h3>梁柱彎矩耐震能力審查派生稽核</h3><table><tbody>
          <tr><th>審查範圍</th><td>${escReport(mapValue("momentFrameSystem", result.seismicReview.frameSystem))}｜${escReport(mapValue("momentAxis", result.seismicReview.axis))}｜${escReport(mapValue("momentQualificationRoute", result.seismicReview.qualificationRoute))}</td></tr>
          <tr><th>Mp / Mpr</th><td>${formatNumber(result.seismicReview.Mp, 3)} / ${formatNumber(result.seismicReview.Mpr, 3)} kN-m</td></tr>
          <tr><th>Mpr,far / Vp / Mu,face / Vu,req</th><td>${formatNumber(result.state.momentFarCriticalSectionExpectedMoment, 3)} kN-m / ${formatNumber(result.seismicReview.Vp, 3)} kN / ${formatNumber(result.seismicReview.MuFace, 3)} kN-m / ${formatNumber(result.seismicReview.VuRequired, 3)} kN</td></tr>
          <tr><th>塑性轉角需求／資格</th><td>${formatNumber(result.seismicReview.rotationDemand, 4)} / ${formatNumber(result.seismicReview.qualifiedRotation, 4)} rad｜${escReport(mapValue("momentRotationDemandMethod", result.seismicReview.rotationDemandMethod))}</td></tr>
          <tr><th>Panel Zone Vpz,min / Vpz,req / Vpz,n</th><td>${formatNumber(result.seismicReview.VpzMin, 3)} / ${formatNumber(result.seismicReview.VpzRequired, 3)} / ${formatNumber(result.seismicReview.VpzNominal, 3)} kN</td></tr>
          <tr><th>Panel Zone 最低厚度／提供厚度</th><td>${formatNumber(result.seismicReview.panelThicknessRequired, 3)} / ${formatNumber(result.state.momentPanelZoneThickness, 3)} mm</td></tr>
          <tr><th>Continuity Plate 門檻／判定</th><td>${formatNumber(result.seismicReview.continuityThreshold, 3)} kN｜${result.seismicReview.continuityRequired ? "需設置並核對銲接" : "未觸發最低設置門檻"}</td></tr>
          <tr><th>強柱弱梁 CW / CCW</th><td>${formatNumber(result.seismicReview.scwbCw, 3)} / ${formatNumber(result.seismicReview.scwbCcw, 3)}｜需求皆為 1.25</td></tr>
          <tr><th>完整接頭設計聲明</th><td><b>completeJointDesign = ${String(result.completeJointDesign)}</b>；本附件不宣稱 AISC 358 預認證，也不取代接頭零組件、prying、yield-line、銲道、NDT 或正交方向另案。</td></tr>
          <tr><th>外部容量證據</th><td>${escReport(result.state.momentCapacityBasis)}<br>SHA-256：${escReport(result.state.momentCapacityEvidenceSha256)}</td></tr>
          <tr><th>資格證據</th><td>${escReport(result.state.momentQualificationBasis)}<br>SHA-256：${escReport(result.state.momentQualificationEvidenceSha256)}</td></tr>
        </tbody></table></section>`
      : "";
    const spliceReviewTable = result.state.connectionType === "column_splice" && result.spliceReview
      ? `<section class="block"><h3>全斷面 CJP 耐震柱續接派生稽核</h3><table><tbody>
          <tr><th>審查範圍</th><td>${escReport(mapValue("spliceFrameRole", result.state.spliceFrameRole))}｜${escReport(mapValue("spliceDesignRoute", result.state.spliceDesignRoute))}｜${escReport(mapValue("spliceLocationRoute", result.state.spliceLocationRoute))}</td></tr>
          <tr><th>Eamp 原始／採用</th><td>${formatNumber(result.spliceReview.EampRaw, 3)} / ${formatNumber(result.spliceReview.EampAdopted, 3)} kN｜${escReport(mapValue("spliceTransferCapRoute", result.state.spliceTransferCapRoute))}</td></tr>
          <tr><th>13.4.1 壓力／拉力需求</th><td>${formatNumber(result.spliceReview.PuCompression, 3)} / ${formatNumber(result.spliceReview.TuTension, 3)} kN</td></tr>
          <tr><th>全斷面正向容量</th><td>${formatNumber(result.spliceReview.normalCapacity, 3)} kN</td></tr>
          <tr><th>強軸／弱軸撓曲容量</th><td>${formatNumber(result.spliceReview.majorFlexuralCapacity, 3)} / ${formatNumber(result.spliceReview.minorFlexuralCapacity, 3)} kN-m</td></tr>
          <tr><th>強軸／弱軸剪力容量</th><td>${formatNumber(result.spliceReview.majorShearCapacity, 3)} / ${formatNumber(result.spliceReview.minorShearCapacity, 3)} kN</td></tr>
          <tr><th>製作與全覆蓋 NDT</th><td>${escReport(mapValue("spliceFabricationLocation", result.state.spliceFabricationLocation))}｜${escReport(mapValue("spliceNdtMethod", result.state.spliceNdtMethod))}</td></tr>
          <tr><th>附件邊界聲明</th><td><b>completeColumnMemberDesign = ${String(result.completeColumnMemberDesign)}；asBuiltAcceptance = ${String(result.asBuiltAcceptance)}</b>；本附件不取代柱構件整體穩定、梁柱交會區、基礎力流、施工可行性或既有銲道驗收。</td></tr>
          <tr><th>需求／細部證據</th><td>${escReport(result.state.spliceDemandBasis)}<br>需求 SHA-256：${escReport(result.state.spliceDemandEvidenceSha256)}<br>細部 SHA-256：${escReport(result.state.spliceDetailEvidenceSha256)}</td></tr>
          <tr><th>WPS／NDT 證據</th><td>${escReport(result.state.spliceWpsBasis)}｜${escReport(result.state.spliceNdtPlanBasis)}<br>WPS SHA-256：${escReport(result.state.spliceWpsEvidenceSha256)}<br>NDT SHA-256：${escReport(result.state.spliceNdtPlanEvidenceSha256)}</td></tr>
        </tbody></table></section>`
      : "";
    return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<title>${result.reportTitle}</title>
<script>
window.MathJax = { tex: { inlineMath: [["\\\\(", "\\\\)"]], displayMath: [["\\\\[", "\\\\]"]] }, svg: { fontCache: "global" } };
</script>
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
<style>
body{font-family:"Segoe UI","Noto Sans TC","Microsoft JhengHei",sans-serif;color:#111;margin:0;padding:24px;background:#f4f4f4}
.paper{max-width:820px;margin:0 auto;background:#fff;padding:32px 36px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
h1{margin:0 0 6px;font-size:24px}.sub{color:#555;margin-bottom:16px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:12px;margin-bottom:18px}
.meta div{border-bottom:1px dotted #888;padding:4px 0}
.banner{padding:14px 18px;border:2px solid #888;border-radius:6px;text-align:center;font-size:18px;font-weight:700;margin-bottom:18px}
.block{margin:12px 0}.block h3{margin:0 0 8px;padding:4px 8px;background:#1a3d5c;color:#fff;border-radius:4px;font-size:14px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#eef2f6}
.input-context-header th{padding:4px 8px;background:#1a3d5c;color:#fff;border-color:#1a3d5c;font-size:14px}
.check-coderef{margin-top:4px;font-size:11px;color:#64748b}
.flow-decision{font-size:12px;color:#334155;font-weight:700;margin:0 0 8px}
.mono{white-space:pre-wrap;font-family:"Cascadia Code","Consolas",monospace;background:#faf5ff;border:1px solid #e9d5ff;border-radius:4px;padding:10px;color:#3b0764;font-size:11px;line-height:1.6}
.equation-math{background:#faf5ff;border:1px solid #e9d5ff;border-radius:6px;padding:10px 12px;color:#3b0764;overflow:auto}.equation-math__line + .equation-math__line{margin-top:8px}.equation-list--fallback,.mono--fallback{display:none}.mathjax-fallback .equation-math{display:none}.mathjax-fallback .equation-list--fallback,.mathjax-fallback .mono--fallback{display:block}
.review-section{font-size:12px;line-height:1.5}.review-section + .review-section{margin-top:8px}.review-section__title{margin-bottom:4px;font-size:12px;font-weight:700;color:#0e7490}
.card-placeholder{padding:14px;border:1px dashed #cbd5e1;border-radius:10px;background:#f8fafc;color:#64748b}
.plate-sketch{width:100%;height:auto;min-height:220px}.sketch-plate,.sketch-member{fill:rgba(14,116,144,.08);stroke:#0e7490;stroke-width:2}.sketch-hole{fill:#fff;stroke:#1e293b;stroke-width:1.5}.sketch-net{fill:none;stroke:#c0392b;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:8 6}.sketch-block{fill:rgba(217,119,6,.12);stroke:#d97706;stroke-width:2.5}.sketch-arrow{stroke:#0e7490;stroke-width:2.5}.sketch-label{fill:#0f172a;font-size:12px;font-weight:700}.sketch-note{fill:#475569;font-size:11px}.sketch-weld{stroke:#b45309;stroke-width:5;stroke-linecap:round}.sketch-weld--transverse{stroke:#c2410c}.sketch-dim{stroke:#64748b;stroke-width:1.4}.sketch-dim-label{fill:#475569;font-size:10px;font-weight:700}
ul{margin:0;padding-left:20px}.toolbar{max-width:820px;margin:0 auto 12px;text-align:right}.toolbar button{padding:8px 18px}
@media print{body{background:#fff;padding:0}.toolbar{display:none}.paper{box-shadow:none;max-width:none;padding:0}.block h3,.input-context-header{break-after:avoid-page;page-break-after:avoid}.report-sketch-block,.report-ending,tr{break-inside:avoid-page;page-break-inside:avoid}thead{display:table-header-group}}
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">列印 / 存 PDF</button></div>
<div class="paper">
${reportDocument.html}
<h1>${result.reportTitle}</h1>
<div class="sub">${result.reportSubtitle}</div>
<div class="meta">
  ${normalizeProjectMetaValue(result.state.projectName) ? `<div><b>計畫名稱</b> ${escReport(normalizeProjectMetaValue(result.state.projectName))}</div>` : ""}
  ${normalizeProjectMetaValue(result.state.connectionTag) ? `<div><b>計畫編號</b> ${escReport(normalizeProjectMetaValue(result.state.connectionTag))}</div>` : ""}
  ${normalizeProjectMetaValue(result.state.designer) ? `<div><b>設計人員</b> ${escReport(normalizeProjectMetaValue(result.state.designer))}</div>` : ""}
  <div><b>產出工具</b> ${escReport(reportTrace.sourceTrace.tool)}</div>
  <div><b>工具版本</b> ${escReport(reportTrace.sourceTrace.version)}</div>
  <div><b>輸出時間</b> ${escReport(reportTrace.generatedAt)}</div>
  <div><b>計算指紋</b> ${escReport(reportTrace.calculationFingerprint)}</div>
  <div><b>設計法</b> ${mapValue("designMethod", result.state.designMethod)}</div>
  <div><b>規範基準</b> ${getCodeBasisText(result.state)}</div>
  <div><b>控制項</b> ${result.governing.label}</div>
</div>
<section class="block"><h3>強度檢核總表</h3><table><thead><tr><th>檢核項目</th><th>需求值</th><th>可用強度</th><th>DCR</th><th>判定</th></tr></thead><tbody>${strengthRows}</tbody></table></section>
<section class="block"><h3>細部規定檢核</h3><table><thead><tr><th>檢核項目</th><th>規定條文</th><th>提供值</th><th>規定值</th><th>檢核說明</th><th>判定</th></tr></thead><tbody>${detailRows}</tbody></table></section>
${inputTablesHtml}
${plateAreaTable}
${tensionAreaTable}
${shearTabAreaTable}
${gussetAreaTable}
${momentReviewTable}
${spliceReviewTable}
${flowHtml}
<div class="report-ending">
${endingFlowHtml}
${scopeHtml}
<section class="block"><h3>檢核結論</h3><div class="banner">${reportBanner.textContent}</div></section>
</div>
</div>
</body>
</html>`;
  }

  function exportReport() {
    const result = window.latestSteelConnectionResult || calculateConnection(collectFormState());
    setExportReportStatus("");
    try {
      assertFormalResultBoundary(result);
    } catch (error) {
      setExportReportStatus(`正式報告未開啟｜${error?.message || "未知錯誤"}`);
      return;
    }
    const reportWindow = window.open("", "_blank", "width=980,height=1100,scrollbars=yes");
    if (!reportWindow) {
      setExportReportStatus("請允許彈出視窗以輸出報表。");
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(buildReportHtml(result));
    reportWindow.document.close();
    setTimeout(() => {
      if (reportWindow.MathJax?.typesetPromise) {
        reportWindow.MathJax.typesetPromise()
          .then(() => reportWindow.document.documentElement.classList.add("mathjax-ready"))
          .catch(() => reportWindow.document.documentElement.classList.add("mathjax-fallback"));
      } else {
        reportWindow.document.documentElement.classList.add("mathjax-fallback");
      }
    }, 400);
  }

  function update(autoSave = true) {
    updateVisibility();
    const state = collectFormState();
    const result = calculateConnection(state);
    renderSummary(result);
    renderReviewBrief(result);
    renderReportHealthBar(result);
    updateSectionTabSummary(result);
    updateReportSectionStatuses(result);
    renderInputSummary(result);
    renderStrengthChecks(result);
    renderDetailChecks(result);
    renderAlerts(result);
    renderToolReferences();
    renderFlow(result);
    renderPlateExtras(result);
    renderTensionExtras(result);
    renderShearTabExtras(result);
    updateReportJumpButtons(result);
    window.latestSteelConnectionResult = result;
    if (autoSave) persistDraft(state);
  }

  function getNamedFields(name) {
    return getAssociatedFields(name);
  }

  function setFormState(state, autoSave = false) {
    Object.entries(state).forEach(([key, value]) => {
      const fields = getNamedFields(key);
      fields.forEach((field) => {
        field.value = value;
      });
    });
    updateVisibility();
    update(autoSave);
  }

  async function copySummary() {
    const result = window.latestSteelConnectionResult || calculateConnection(collectFormState());
    const lines = [
      result.reportTitle,
      `計畫：${getProjectMetaDisplayValue(result.state.projectName)}`,
      `接頭：${getProjectMetaDisplayValue(result.state.connectionTag)}`,
      `判定：${reportBanner.textContent}`,
      `控制項：${result.governing.label}`,
      ...result.checks.map((check) => `${check.label}｜需求 ${formatCheckValue(check, check.demand)}｜容量 ${formatCheckValue(check, check.available)}｜DCR ${formatNumber(check.ratio, 3)}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      copySummaryBtn.textContent = "已複製";
    } catch {
      copySummaryBtn.textContent = "複製失敗";
    }
    setTimeout(() => { copySummaryBtn.textContent = "複製摘要"; }, 1400);
  }

  function bindMethodButtons() {
    [methodLrfBtn, methodAsdBtn].forEach((button) => {
      button.addEventListener("click", () => {
        form.elements.namedItem("designMethod").value = button.dataset.method;
        update(true);
      });
    });
  }

  function activatePanel(panelName) {
    currentPanel = panelName;
    persistUiPrefs();
    document.querySelectorAll(".section-tabs button").forEach((item) => {
      item.classList.toggle("active", item.dataset.panel === panelName);
    });
    document.querySelectorAll(".subpanel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `panel-${panelName}`);
    });
    if (panelName === "flow") updateQuickNavActive("flow");
    if (panelName === "report" || panelName === "glossary") updateQuickNavActive("report");
  }

  function bindTabs() {
    document.querySelectorAll(".section-tabs button").forEach((button) => {
      button.addEventListener("click", () => {
        activatePanel(button.dataset.panel);
      });
    });
  }

  function bindMobileQuickNav() {
    if (!mobileQuickNav) return;
    mobileQuickNav.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.target;
        if (target === "input" && inputColumn) {
          inputColumn.scrollIntoView({ behavior: "smooth", block: "start" });
          updateQuickNavActive("input");
        }
        if (target === "report" && reportColumn) {
          activatePanel("report");
          reportColumn.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        if (target === "flow" && reportColumn) {
          activatePanel("flow");
          reportColumn.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  function prepareMobileFab() {
    if (document.querySelector(".mobile-fab")) {
      mobileFab = document.querySelector(".mobile-fab");
    } else {
      mobileFab = document.createElement("button");
      mobileFab.type = "button";
      mobileFab.className = "mobile-fab";
      mobileFab.textContent = "回到頂部";
      mobileFab.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
        updateQuickNavActive("input");
      });
      document.body.appendChild(mobileFab);
    }
    // 設計方法浮動切換鈕
    if (!document.querySelector(".method-fab")) {
      methodFab = document.createElement("button");
      methodFab.type = "button";
      methodFab.className = "method-fab";
      methodFab.innerHTML = '<span class="method-fab__label">設計法</span><span class="method-fab__value">LRFD</span>';
      methodFab.title = "切換 LRFD / ASD";
      methodFab.addEventListener("click", () => {
        const current = form.elements.namedItem("designMethod").value;
        const next = current === "LRFD" ? "ASD" : "LRFD";
        const targetBtn = next === "LRFD" ? methodLrfBtn : methodAsdBtn;
        if (targetBtn) targetBtn.click();
      });
      document.body.appendChild(methodFab);
    } else {
      methodFab = document.querySelector(".method-fab");
    }
    updateMethodFab();
  }

  function updateMethodFab() {
    if (!methodFab) return;
    const method = form?.elements.namedItem("designMethod")?.value || "LRFD";
    methodFab.dataset.method = method;
    const valueEl = methodFab.querySelector(".method-fab__value");
    if (valueEl) valueEl.textContent = method;
  }

  function syncQuickNavByScroll() {
    const compact = window.matchMedia("(max-width: 1024px)").matches;
    if (mobileFab) {
      mobileFab.classList.toggle("is-visible", compact && window.scrollY > 520);
    }
    // 設計方法浮動鈕：mode-bar 捲離畫面後 (不分裝置) 顯示
    if (methodFab) {
      const modeBar = document.querySelector(".mode-bar");
      const shouldShow = modeBar
        ? modeBar.getBoundingClientRect().bottom < 20
        : window.scrollY > 400;
      methodFab.classList.toggle("is-visible", shouldShow);
    }
    if (!mobileQuickNav || !compact) return;

    const inputTop = inputColumn?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
    const reportTop = reportColumn?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
    const flowActive = flowPanel?.classList.contains("active");
    const reportActive = reportPanel?.classList.contains("active");

    if (inputTop <= 200 && reportTop > 180) {
      updateQuickNavActive("input");
      return;
    }

    if (reportTop <= 220) {
      updateQuickNavActive(flowActive && !reportActive ? "flow" : "report");
    }
  }

  function requestQuickNavSync() {
    if (quickNavTicking) return;
    quickNavTicking = true;
    window.requestAnimationFrame(() => {
      quickNavTicking = false;
      syncQuickNavByScroll();
      syncReportJumpbarByScroll();
    });
  }

  function scrollToSectionTop(element) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const offset = window.matchMedia("(max-width: 640px)").matches
      ? 172
      : window.matchMedia("(max-width: 1024px)").matches
        ? 196
        : 112;
    const targetTop = window.scrollY + rect.top - offset;
    window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  }

  function updateReportJumpbarActive(target) {
    const mapping = {
      governing: jumpToGoverningBtn,
      firstNg: jumpToFirstNgBtn,
      alerts: jumpToAlertsBtn,
    };
    Object.entries(mapping).forEach(([key, button]) => {
      if (!button) return;
      button.classList.toggle("active", key === target);
    });
  }

  function flashElement(element) {
    if (!element) return;
    element.classList.add("is-flashed");
    window.setTimeout(() => element.classList.remove("is-flashed"), 1800);
  }

  function bindReportJumpButtons() {
    jumpToGoverningBtn?.addEventListener("click", () => {
      activatePanel("report");
      updateReportJumpbarActive("governing");
      const row = strengthCheckTableBody.querySelector("tr.is-governing") || strengthSection;
      expandReportBlockForElement(row);
      scrollToSectionTop(row || strengthSection);
      flashElement(row);
    });

    jumpToFirstNgBtn?.addEventListener("click", () => {
      activatePanel("report");
      updateReportJumpbarActive("firstNg");
      const failingDetail = detailCheckTableBody.querySelector("tr.is-failing");
      if (failingDetail) {
        expandReportBlockForElement(failingDetail);
        scrollToSectionTop(failingDetail);
        flashElement(failingDetail);
        return;
      }
      const failingStrength = strengthCheckTableBody.querySelector(".status-pill.fail")?.closest("tr");
      expandReportBlockForElement(failingStrength || strengthSection);
      scrollToSectionTop(failingStrength || strengthSection);
      flashElement(failingStrength);
    });

    jumpToAlertsBtn?.addEventListener("click", () => {
      activatePanel("report");
      updateReportJumpbarActive("alerts");
      expandReportBlockForElement(alertsSection);
      scrollToSectionTop(alertsSection);
      flashElement(alertsSection);
    });
  }

  function syncReportJumpbarByScroll() {
    if (!reportPanel?.classList.contains("active")) {
      updateReportJumpbarActive("");
      return;
    }
    const sections = [
      { key: "governing", element: strengthSection },
      { key: "firstNg", element: detailSection },
      { key: "alerts", element: alertsSection },
    ].filter((item) => item.element);

    const threshold = window.matchMedia("(max-width: 1024px)").matches ? 220 : 150;
    let activeKey = "";
    let bestDistance = Number.POSITIVE_INFINITY;

    sections.forEach((item) => {
      const rect = item.element.getBoundingClientRect();
      const distance = Math.abs(rect.top - threshold);
      if (rect.bottom > threshold && distance < bestDistance) {
        bestDistance = distance;
        activeKey = item.key;
      }
    });

    updateReportJumpbarActive(activeKey);
  }

  function updateReportJumpButtons(result) {
    const hasChecks = Array.isArray(result?.checks) && result.checks.length > 0;
    const hasFailingDetail = Array.isArray(result?.detailChecks) && result.detailChecks.some((item) => !item.passes);
    const hasFailingStrength = Array.isArray(result?.checks) && result.checks.some((check) => getCheckStatus(check).className === "fail");
    const alertCount = getReviewItemCount(result);
    const hasAlerts = Boolean(alertCount);
    const failingCount = (result?.detailChecks || []).filter((item) => !item.passes).length
      + (result?.checks || []).filter((check) => getCheckStatus(check).className === "fail").length;

    if (jumpToGoverningBtn) {
      jumpToGoverningBtn.disabled = !hasChecks;
      jumpToGoverningBtn.title = result?.governing?.label || "";
    }
    if (jumpToFirstNgBtn) {
      jumpToFirstNgBtn.disabled = !(hasFailingDetail || hasFailingStrength);
      jumpToFirstNgBtn.textContent = failingCount ? `首個 NG (${failingCount})` : "首個 NG";
    }
    if (jumpToAlertsBtn) {
      jumpToAlertsBtn.disabled = !hasAlerts;
      jumpToAlertsBtn.textContent = hasAlerts ? `限制條件 (${alertCount})` : "限制條件";
    }
  }

  getAssociatedFields().forEach((field) => {
    field.addEventListener("input", () => update(true));
    field.addEventListener("change", () => update(true));
  });
  showFlow.addEventListener("change", () => update(false));
  loadExampleBtn.addEventListener("click", () => setFormState(getCurrentExampleState(), true));
  saveDraftBtn.addEventListener("click", () => persistDraft(collectFormState()));
  exportSourceJsonBtn.addEventListener("click", exportConnectionSourceJson);
  importSourceJsonBtn.addEventListener("click", () => importSourceJsonInput.click());
  importSourceJsonInput.addEventListener("change", () => importConnectionSourceJson(importSourceJsonInput.files?.[0]));
  exportReportBtn.addEventListener("click", exportReport);
  copySummaryBtn.addEventListener("click", copySummary);
  printReportBtn.addEventListener("click", exportReport);
  resetBtn.addEventListener("click", () => setFormState(getCurrentExampleState(), true));

  renderGlossary();
  loadUiPrefs();
  prepareSectionTabBadges();
  prepareReportSectionStatuses();
  prepareReportBlockAccordions();
  prepareReportAccordionToolbar();
  prepareInputCardAccordions();
  prepareInputAccordionToolbar();
  prepareMobileFab();
  bindMethodButtons();
  bindTabs();
  bindMobileQuickNav();
  bindReportJumpButtons();
  window.addEventListener("resize", () => {
    const state = collectFormState();
    syncInputCardAccordions(state.connectionType);
    applyReportAccordionPreset(window.latestSteelConnectionResult, currentReportAccordionPreset);
    syncReportBlockAccordions(window.latestSteelConnectionResult);
    requestQuickNavSync();
  });
  window.addEventListener("scroll", requestQuickNavSync, { passive: true });
  form.addEventListener("focusin", () => updateQuickNavActive("input"));
  document.querySelectorAll(`[form="${form.id}"]`).forEach((field) => {
    field.addEventListener("focus", () => updateQuickNavActive("input"));
  });
  window.buildSteelConnectionSourcePayload = buildConnectionSourcePayload;
  window.importSteelConnectionSourceJson = importConnectionSourceJson;
  setFormState(loadSavedDraft() || getCurrentExampleState(), false);
  activatePanel(currentPanel);
  loadAuditStatus();
  requestQuickNavSync();
})();
