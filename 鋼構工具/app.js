(function initSteelConnectionApp() {
  const { calculateConnection } = window.ShearConnectionCalculator;
  const STORAGE_KEY = location.pathname.toLowerCase().includes("plate-check")
    ? "steel-plate-check-draft-v2"
    : "steel-connection-suite-draft-v3";
  const UI_PREFS_KEY = location.pathname.toLowerCase().includes("plate-check")
    ? "steel-plate-check-ui-v1"
    : "steel-connection-suite-ui-v1";

  const glossaryItems = [
    ["Pu / Pa", "需求軸力", "kN", "接頭於設計載重組合下應傳遞之軸力。", "柱續接、支撐接頭主控需求。"],
    ["Vu / Va", "需求剪力", "kN", "接頭於設計載重組合下應傳遞之剪力。", "剪力接頭、柱腹續接、梁柱腹板傳力。"],
    ["Mu / Ma", "需求彎矩", "kN-m", "接頭於設計載重組合下應傳遞之彎矩。", "柱續接與梁柱彎矩接頭主控需求。"],
    ["eec", "偏心距", "mm", "力作用線與接頭重心間之距離。", "本版列為提醒，不直接納入栓群偏心分析。"],
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
    ["hsp", "柱續接槓桿臂", "mm", "柱翼壓拉偶力之力臂。", "柱續接由彎矩換算翼板拉力。"],
    ["bfp / bfn", "翼板總寬 / 淨寬", "mm", "柱翼續接板總寬及扣孔後有效淨寬。", "續接板降伏與斷裂。"],
    ["hw", "腹板續接板深度", "mm", "柱腹續接板可傳遞剪力之有效高度。", "腹板剪力降伏。"],
    ["b0", "Whitmore 初始寬度", "mm", "支撐連接於 Gusset 板起始之寬度。", "Whitmore 展開寬度。"],
    ["bnet", "Gusset 淨寬", "mm", "扣除孔洞後之有效淨寬。", "Gusset 淨斷面斷裂。"],
    ["Lw", "Whitmore 展開長度", "mm", "沿受力方向向外展開之評估長度。", "Whitmore 有效寬度。"],
    ["hm", "彎矩接頭槓桿臂", "mm", "梁翼張壓偶力之力臂。", "將彎矩換算拉側需求。"],
    ["bmp / bmn", "端板總寬 / 淨寬", "mm", "梁柱彎矩接頭端板總寬與淨寬。", "端板降伏與斷裂。"],
    ["Vpz", "Panel Zone 可用容量", "kN", "由工程師或外部模型提供之 panel zone 可用等效容量。", "梁柱接頭 panel zone 篩選。"],
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
      notes: "套用鋼梁 / RC 梁模板版面",
      designMethod: "LRFD",
      connectionType: "single_plate",
      exposureCondition: "painted",
      requiredAxial: 0,
      requiredShear: 250,
      requiredMoment: 0,
      eccentricity: 0,
      boltDiameter: 20,
      holeDiameter: 22,
      holeType: "standard",
      edgeFabrication: "rolled",
      boltUltimateStrength: 1000,
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
      beamWebThickness: 9,
      beamWebUltimateStrength: 490,
      fillerThickness: 0,
      fillerExtended: "true",
      weldSize: 8,
      weldLength: 220,
      weldLineCount: 2,
      weldElectrodeStrength: 490,
    },
    column_splice: {
      projectName: "示範柱續接",
      connectionTag: "CS-01",
      designer: "",
      notes: "柱續接以翼板拉力與腹板剪力分流檢核",
      designMethod: "LRFD",
      connectionType: "column_splice",
      exposureCondition: "painted",
      requiredAxial: 850,
      requiredShear: 180,
      requiredMoment: 120,
      eccentricity: 0,
      boltDiameter: 22,
      holeDiameter: 24,
      holeType: "standard",
      edgeFabrication: "rolled",
      boltUltimateStrength: 1000,
      threadsCondition: "included",
      deformationConsidered: "true",
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
    },
    brace_gusset: {
      projectName: "示範支撐 Gusset",
      connectionTag: "BG-01",
      designer: "",
      notes: "支撐 / Gusset 接頭以軸力傳遞為主",
      designMethod: "LRFD",
      connectionType: "brace_gusset",
      exposureCondition: "painted",
      requiredAxial: 700,
      requiredShear: 0,
      requiredMoment: 0,
      eccentricity: 0,
      boltDiameter: 22,
      holeDiameter: 24,
      holeType: "standard",
      edgeFabrication: "rolled",
      boltUltimateStrength: 1000,
      threadsCondition: "included",
      deformationConsidered: "true",
      gussetBoltCount: 6,
      gussetShearPlanes: 1,
      gussetEndDistance: 55,
      gussetPitch: 80,
      gussetEdgeDistance: 70,
      gussetThickness: 14,
      gussetYieldStrength: 325,
      gussetUltimateStrength: 490,
      gussetNetWidth: 220,
      gussetConnectionWidth: 180,
      gussetWhitmoreLength: 240,
      gussetWeldSize: 10,
      gussetWeldLength: 320,
      gussetWeldLineCount: 2,
      gussetWeldElectrodeStrength: 490,
    },
    beam_column_moment: {
      projectName: "示範梁柱彎矩接頭",
      connectionTag: "BM-01",
      designer: "",
      notes: "梁柱彎矩接頭以簡化力偶與腹板剪力模型檢核",
      designMethod: "LRFD",
      connectionType: "beam_column_moment",
      exposureCondition: "painted",
      requiredAxial: 0,
      requiredShear: 160,
      requiredMoment: 420,
      eccentricity: 0,
      boltDiameter: 22,
      holeDiameter: 24,
      holeType: "standard",
      edgeFabrication: "rolled",
      boltUltimateStrength: 1000,
      threadsCondition: "included",
      deformationConsidered: "true",
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
    },
    plate_check: {
      projectName: "示範連接板檢核",
      connectionTag: "PL-01",
      designer: "",
      notes: "連接板可切換幾何推導與面積直輸模式",
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
      { id: "column_splice_standard", label: "柱續接｜翼板 + 腹板續接", state: exampleStates.column_splice },
    ],
    brace_gusset: [
      { id: "brace_gusset_standard", label: "Gusset｜支撐軸力接頭", state: exampleStates.brace_gusset },
    ],
    beam_column_moment: [
      { id: "beam_column_moment_standard", label: "梁柱彎矩｜簡化力偶模型", state: exampleStates.beam_column_moment },
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
          notes: "面積直輸模式，適合特殊破壞路徑由工程師先行整理後核算",
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
          notes: "特殊路徑以 Ag、An、Ae 與區塊剪力面積直接輸入",
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
        ["designMethod", "設計法"],
        ["connectionType", "接頭型式"],
        ["requiredAxial", "需求軸力", "kN"],
        ["requiredShear", "需求剪力", "kN"],
        ["requiredMoment", "需求彎矩", "kN-m"],
        ["eccentricity", "偏心距", "mm"],
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
        ["deformationConsidered", "承壓變形允許"],
      ],
    },
  ];

  const specificGroups = {
    single_plate: [
      {
        title: "剪力接頭資料",
        items: [
          ["boltCount", "螺栓數量", "支"],
          ["shearPlanes", "剪斷面數"],
          ["endDistance", "端距 e", "mm"],
          ["pitch", "孔距 s", "mm"],
          ["plateThickness", "板厚 tp", "mm"],
          ["transverseEdgeDistance", "自由邊距 g", "mm"],
          ["plateYieldStrength", "Fy,p", "MPa"],
          ["plateUltimateStrength", "Fu,p", "MPa"],
          ["beamWebThickness", "腹板厚 tw", "mm"],
          ["beamWebUltimateStrength", "Fu,w", "MPa"],
          ["fillerThickness", "填板厚度", "mm"],
          ["fillerExtended", "填板延伸"],
          ["weldSize", "銲腳尺寸 a", "mm"],
          ["weldLength", "有效銲長 Le", "mm"],
          ["weldLineCount", "銲道數量"],
          ["weldElectrodeStrength", "FEXX", "MPa"],
        ],
      },
    ],
    column_splice: [
      {
        title: "柱續接資料",
        items: [
          ["spliceLeverArm", "柱翼槓桿臂 hsp", "mm"],
          ["spliceBearingTransfer", "壓力直接承壓"],
          ["flangeBoltCount", "拉側翼板螺栓數", "支"],
          ["flangeEndDistance", "翼板端距", "mm"],
          ["flangePitch", "翼板孔距", "mm"],
          ["flangeEdgeDistance", "翼板邊距", "mm"],
          ["flangePlateThickness", "翼板厚度", "mm"],
          ["flangePlateWidth", "翼板總寬", "mm"],
          ["flangePlateNetWidth", "翼板淨寬", "mm"],
          ["flangePlateYieldStrength", "翼板 Fy", "MPa"],
          ["flangePlateUltimateStrength", "翼板 Fu", "MPa"],
          ["webBoltCount", "腹板螺栓數", "支"],
          ["webShearPlanes", "腹板剪斷面數"],
          ["webEndDistance", "腹板端距", "mm"],
          ["webPitch", "腹板孔距", "mm"],
          ["webEdgeDistance", "腹板邊距", "mm"],
          ["webPlateDepth", "腹板續接板深度", "mm"],
          ["webPlateThickness", "腹板厚度", "mm"],
          ["webPlateYieldStrength", "腹板 Fy", "MPa"],
          ["webPlateUltimateStrength", "腹板 Fu", "MPa"],
          ["spliceWeldSize", "續接銲腳", "mm"],
          ["spliceWeldLength", "續接有效銲長", "mm"],
          ["spliceWeldLineCount", "續接銲道數量"],
          ["spliceWeldElectrodeStrength", "續接 FEXX", "MPa"],
        ],
      },
    ],
    brace_gusset: [
      {
        title: "Gusset 接頭資料",
        items: [
          ["gussetBoltCount", "Gusset 螺栓數", "支"],
          ["gussetShearPlanes", "剪斷面數"],
          ["gussetEndDistance", "端距", "mm"],
          ["gussetPitch", "孔距", "mm"],
          ["gussetEdgeDistance", "邊距", "mm"],
          ["gussetThickness", "板厚", "mm"],
          ["gussetYieldStrength", "Fy", "MPa"],
          ["gussetUltimateStrength", "Fu", "MPa"],
          ["gussetNetWidth", "有效淨寬", "mm"],
          ["gussetConnectionWidth", "初始寬度 b0", "mm"],
          ["gussetWhitmoreLength", "Whitmore 展開長度", "mm"],
          ["gussetWeldSize", "銲腳尺寸", "mm"],
          ["gussetWeldLength", "有效銲長", "mm"],
          ["gussetWeldLineCount", "銲道數量"],
          ["gussetWeldElectrodeStrength", "FEXX", "MPa"],
        ],
      },
    ],
    beam_column_moment: [
      {
        title: "梁柱彎矩接頭資料",
        items: [
          ["momentLeverArm", "槓桿臂 hm", "mm"],
          ["momentBoltCount", "拉側螺栓數", "支"],
          ["momentEndDistance", "端板端距", "mm"],
          ["momentPitch", "端板孔距", "mm"],
          ["momentEdgeDistance", "端板邊距", "mm"],
          ["momentPlateThickness", "端板厚度", "mm"],
          ["momentPlateWidth", "端板總寬", "mm"],
          ["momentPlateNetWidth", "端板淨寬", "mm"],
          ["momentPlateYieldStrength", "端板 Fy", "MPa"],
          ["momentPlateUltimateStrength", "端板 Fu", "MPa"],
          ["momentShearBoltCount", "腹板剪力螺栓數", "支"],
          ["momentShearPlanes", "腹板剪斷面數"],
          ["momentShearPlateThickness", "腹板剪力板厚", "mm"],
          ["momentShearPlateUltimateStrength", "腹板剪力板 Fu", "MPa"],
          ["panelZoneCapacity", "Panel Zone 可用容量", "kN"],
          ["momentWeldSize", "腹板銲腳", "mm"],
          ["momentWeldLength", "腹板有效銲長", "mm"],
          ["momentWeldLineCount", "腹板銲道數量"],
          ["momentWeldElectrodeStrength", "腹板 FEXX", "MPa"],
        ],
      },
    ],
    plate_check: [
      {
        title: "連接板基本資料",
        items: [
          ["plateInputMode", "輸入模式"],
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
          ["tensionAreaInput", "輸入模式"],
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

  const labelMap = {
    designMethod: { LRFD: "LRFD 極限設計法", ASD: "ASD 容許應力設計法" },
    connectionType: {
      plate_check: "連接板檢核｜Connection Plate",
      tension_member: "拉力構件｜Tension Member",
      single_plate: "剪力接頭｜單剪力板 Shear Tab｜開發中",
      column_splice: "柱續接｜Column Splice｜開發中",
      brace_gusset: "支撐 / Gusset 接頭｜開發中",
      beam_column_moment: "梁柱彎矩接頭｜開發中",
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
    deformationConsidered: { true: "允許一般變形", false: "不允許明顯變形" },
    fillerExtended: { true: "已延伸至連接板外", false: "未延伸至連接板外" },
    spliceBearingTransfer: { true: "是，可由承壓面直接傳遞", false: "否，保守由續接元件承擔" },
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
      case "single_plate":
      case "column_splice":
      case "brace_gusset":
      case "beam_column_moment":
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
        return !((type === "plate_check" && plateMode === "area_manual") || (type === "tension_member" && tensionConnectionMode === "welded"));
      }
      if (!group.modes) return true;
      if (type === "plate_check") return group.modes.includes(plateMode);
      if (type === "tension_member") return group.modes.includes(tensionAreaInput) || group.modes.includes(tensionConnectionMode);
      return true;
    }).map((group) => {
      let items = group.items;
      if (group.title === "基本資料" && (type === "plate_check" || type === "tension_member")) {
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
    const showFrameForces = !(type === "plate_check" || type === "tension_member");
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
      const visible = !((type === "plate_check" && plateMode === "area_manual") || (type === "tension_member" && tensionConnectionMode === "welded"));
      card.classList.toggle("is-hidden", !visible);
    });
    document.querySelectorAll("[data-weld-type]").forEach((section) => {
      const visible = type === "tension_member" && tensionConnectionMode === "welded" && section.dataset.weldType === tensionWeldType;
      section.classList.toggle("is-hidden", !visible);
    });
    syncVisibleFieldState();
  }

  function renderInputSummary(result) {
    inputSummaryTables.innerHTML = getInputGroups(result.state.connectionType).map((group) => `
      <div class="report-subtable">
        <table class="report-table">
          <thead><tr><th colspan="2">${group.title}</th></tr></thead>
          <tbody>${group.items.map(([key, label, unit]) => `
            <tr>
              <th>${label}</th>
              <td>${mapValue(key, result.state[key])}${unit ? ` <span class="unit">${unit}</span>` : ""}</td>
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
        <th>${label}</th>
        <td>${value}</td>
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
        <span class="health-chip__label">${chip.label}</span>
        <span class="health-chip__value">${chip.value}</span>
      </div>
    `).join("");
  }

  function renderAuditStatusCard(status, options = {}) {
    if (!reportAuditStatus) return;

    const { error = "", note = "", hidden = false } = options;
    if (hidden) {
      reportAuditStatus.classList.add("is-hidden");
      reportAuditStatus.innerHTML = "";
      return;
    }

    reportAuditStatus.classList.remove("is-hidden");

    let badgeTone = "warn";
    let badgeLabel = "未讀取";
    let summary = note || "尚未載入最新自巡檢狀態。";
    const meta = [];
    const links = [];

    if (status) {
      badgeTone = status.pass ? "ok" : "fail";
      badgeLabel = status.pass ? "最近巡檢通過" : `最近巡檢異常 ${status.failureCount || 0} 項`;
      summary = `最近一輪自巡檢 ${status.pass ? "已通過" : "發現異常"}，runId：${status.runId || "—"}。`;
      if (status.runId) meta.push(`runId｜${status.runId}`);
      meta.push(status.loop ? "模式｜循環巡檢" : "模式｜單次巡檢");
      meta.push(status.quiet ? "輸出｜靜默" : "輸出｜標準");
      meta.push(`結果｜${status.failureCount || 0} 項異常`);
      links.push({ href: "./output/audit/audit-summary.md", label: "開啟巡檢摘要" });
      links.push({ href: "./output/audit/audit-status.json", label: "開啟狀態 JSON" });
    } else if (error) {
      badgeTone = "warn";
      badgeLabel = "巡檢狀態未載入";
      summary = error;
    }

    reportAuditStatus.innerHTML = `
      <div class="audit-status-card__head">
        <span class="audit-status-card__title">內建自巡檢狀態</span>
        <span class="audit-status-card__badge ${badgeTone}">${badgeLabel}</span>
      </div>
      <div class="audit-status-card__summary">${summary}</div>
      ${meta.length ? `<div class="audit-status-card__meta">${meta.map((item) => `<span>${item}</span>`).join("")}</div>` : ""}
      ${links.length ? `<div class="audit-status-card__links">${links.map((item) => `<a href="${item.href}" target="_blank" rel="noreferrer">${item.label}</a>`).join("")}</div>` : ""}
    `;
  }

  async function loadAuditStatus() {
    if (!reportAuditStatus) return;

    if (!/^https?:$/i.test(window.location.protocol)) {
      renderAuditStatusCard(null, {
        note: "目前以直接開檔模式執行，未讀取自巡檢狀態；若改以本機伺服器開啟，會顯示最新桌機 / 平板 / 手機巡檢結果。",
      });
      return;
    }

    try {
      const response = await fetch(`./output/audit/audit-status.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const status = await response.json();
      renderAuditStatusCard(status);
    } catch (error) {
      renderAuditStatusCard(null, {
        error: `尚未取得最新自巡檢狀態（${error.message || "讀取失敗"}）。可先執行 run-audit.bat 或 run-audit-loop.bat。`,
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
          <div class="review-section__title">${title}</div>
          <ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>
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
      return `<div class="card-placeholder">${result.sketchData?.caption || "面積直輸模式，未顯示幾何示意。"}</div>`;
    }

    const { plateWidth, plateLength, holes, netSection, blockShear, loadDirection } = result.sketchData;
    const scale = Math.min(480 / Math.max(plateWidth, 1), 340 / Math.max(plateLength, 1));
    const toX = (value) => 20 + value * scale;
    const toY = (value) => 20 + value * scale;
    const holeRadius = Math.max(result.state.holeDiameter * scale / 2, 3);
    const netPath = (netSection?.points || []).map((point) => `${toX(point.x)},${toY(point.y)}`).join(" ");
    const blockPath = (blockShear || []).map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.x)} ${toY(point.y)}`).join(" ") + " Z";
    const arrow = loadDirection === "horizontal"
      ? `<line x1="${toX(10)}" y1="${toY(plateLength / 2)}" x2="${toX(plateWidth - 10)}" y2="${toY(plateLength / 2)}" class="sketch-arrow" marker-end="url(#plateArrow)" />`
      : `<line x1="${toX(plateWidth / 2)}" y1="${toY(10)}" x2="${toX(plateWidth / 2)}" y2="${toY(plateLength - 10)}" class="sketch-arrow" marker-end="url(#plateArrow)" />`;
    const widthDim = buildDimensionLine({
      x1: toX(0),
      y1: toY(plateLength) + 26,
      x2: toX(plateWidth),
      y2: toY(plateLength) + 26,
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
          y1: toY(plateLength) + 50,
          x2: toX(Math.min(holes[0].x + result.state.pitchX, plateWidth)),
          y2: toY(plateLength) + 50,
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
      <svg class="plate-sketch${inline ? " plate-sketch--print" : ""}" viewBox="0 0 ${toX(plateWidth) + 76} ${toY(plateLength) + 76}" xmlns="http://www.w3.org/2000/svg" aria-label="連接板幾何示意">
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
        <text x="${toX(plateWidth / 2)}" y="${toY(plateLength) + 16}" text-anchor="middle" class="sketch-label">${loadDirection === "horizontal" ? "水平拉力" : "垂直拉力"}</text>
      </svg>
    `;
  }

  function buildTensionSketchMarkup(result, { inline = false } = {}) {
    if (result.sketchData?.mode !== "geometry") {
      return `<div class="card-placeholder">${result.sketchData?.caption || "面積輸入模式，未顯示幾何示意。"}</div>`;
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
        <div><b>輸入模式</b><span>${mapValue("plateInputMode", result.state.plateInputMode)}</span></div>
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
        <div><b>輸入模式</b><span>${result.tensionGeometrySummary?.areaInput || mapValue("tensionAreaInput", result.state.tensionAreaInput)}</span></div>
        <div><b>接合方式</b><span>${mapValue("tensionConnectionMode", result.state.tensionConnectionMode)}</span></div>
        <div><b>剪力遲滯係數 U</b><span>${formatNumber(result.derivedAreas?.U, 3)}</span></div>
        <div><b>有效淨面積 Ae</b><span>${formatNumber(result.derivedAreas?.Ae, 2)} mm²</span></div>
        <div><b>有效淨面積說明</b><span>${result.pathSummary?.netSection || "—"}</span></div>
        <div><b>區塊剪力說明</b><span>${result.pathSummary?.blockShear || "—"}</span></div>
      </div>
    `;

    tensionSketchWrap.innerHTML = buildTensionSketchMarkup(result);
  }

  function getCheckStatus(check) {
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
          <td data-label="檢核項目">${check.label}${buildCheckReferenceMarkup(check)}</td>
          <td data-label="需求值">${formatNumber(check.demand)} kN</td>
          <td data-label="可用強度">${formatNumber(check.available)} kN</td>
          <td data-label="DCR">${formatNumber(check.ratio, 3)}</td>
          <td data-label="判定">${statusPill(status)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderDetailChecks(result) {
    detailCheckTableBody.innerHTML = result.detailChecks.map((item) => `
      <tr data-detail-key="${item.key || item.label}" class="${item.passes ? "" : "is-failing"}">
        <td data-label="檢核項目">${item.label}</td>
        <td data-label="規定條文">${item.codeRef}</td>
        <td data-label="提供值">${formatDetailField(item.provided)}</td>
        <td data-label="規定值">${formatDetailField(item.required)}</td>
        <td data-label="檢核說明">${item.note}<div class="check-coderef">${buildDetailDecisionSentence(item)}</div></td>
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
            ${check.latexLines.map((line) => `<div class="equation-math__line">\\[${line}\\]</div>`).join("")}
          </div>
          <ul class="equation-list equation-list--fallback">${(check.equationLines || []).map((line) => `<li>${line}</li>`).join("")}</ul>
        </div>
      `;
    }
    return `<ul class="equation-list">${(check.equationLines || []).map((line) => `<li>${line}</li>`).join("")}</ul>`;
  }

  function buildCheckReferenceMarkup(check) {
    if (!check.codeRef && !check.equationRef) return "";
    const parts = [];
    if (check.codeRef) parts.push(`條文：${check.codeRef}`);
    if (check.equationRef) parts.push(`式號：${check.equationRef}`);
    return `<div class="check-coderef">${parts.join("｜")}</div>`;
  }

  function buildDecisionSentence(check) {
    const status = getCheckStatus(check);
    if (status.className === "fail") {
      return `需求值 ${formatNumber(check.demand)} kN 大於可用強度 ${formatNumber(check.available)} kN，故本項檢核不符合。`;
    }
    if (status.className === "warn") {
      return `需求值 ${formatNumber(check.demand)} kN 未超過可用強度 ${formatNumber(check.available)} kN，但仍需留意警示條件。`;
    }
    return `需求值 ${formatNumber(check.demand)} kN 未超過可用強度 ${formatNumber(check.available)} kN，故本項檢核符合。`;
  }

  function buildDetailDecisionSentence(item) {
    if (Number.isFinite(item.provided) && Number.isFinite(item.required)) {
      if (item.comparator === "gte") {
        return item.passes
          ? `提供值 ${formatNumber(item.provided)} 已不小於規定值 ${formatNumber(item.required)}，故本項符合。`
          : `提供值 ${formatNumber(item.provided)} 小於規定值 ${formatNumber(item.required)}，故本項不符合。`;
      }
      if (item.comparator === "lte") {
        return item.passes
          ? `提供值 ${formatNumber(item.provided)} 未超過規定上限 ${formatNumber(item.required)}，故本項符合。`
          : `提供值 ${formatNumber(item.provided)} 已超過規定上限 ${formatNumber(item.required)}，故本項不符合。`;
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
              <h3>${check.label}</h3>
              ${buildCheckReferenceMarkup(check)}
            </div>
            ${statusPill(status)}
          </div>
          <p>${check.note}</p>
          <div class="flow-metrics">
            <div class="flow-metric"><span class="label">需求值</span><span class="value">${formatNumber(check.demand)} kN</span></div>
            <div class="flow-metric"><span class="label">可用強度</span><span class="value">${formatNumber(check.available)} kN</span></div>
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
    pageTitle.textContent = result.pageTitle;
    pageDescription.textContent = result.pageDescription;
    document.title = result.pageTitle;
    reportTitle.textContent = result.reportTitle;
    reportSubtitle.textContent = result.reportSubtitle;
    metaProjectName.textContent = result.state.projectName || "—";
    metaConnectionTag.textContent = result.state.connectionTag || "—";
    metaDesigner.textContent = result.state.designer || "—";
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
      : `控制項為「${result.governing.label}」${result.governing.equationRef ? `（${result.governing.equationRef}）` : ""}，需求 ${formatNumber(result.governing.demand)} kN，容量 ${formatNumber(result.governing.available)} kN，DCR = ${formatNumber(result.governing.ratio, 3)}。`;
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

  function buildReportHtml(result) {
    const strengthRows = result.checks.map((check) => `
      <tr>
        <td>${check.label}${buildCheckReferenceMarkup(check)}</td>
        <td>${formatNumber(check.demand)} kN</td>
        <td>${formatNumber(check.available)} kN</td>
        <td>${formatNumber(check.ratio, 3)}</td>
        <td>${getCheckStatus(check).text}</td>
      </tr>
    `).join("");
    const detailRows = result.detailChecks.map((item) => `
      <tr>
        <td>${item.label}</td>
        <td>${item.codeRef}</td>
        <td>${formatDetailField(item.provided)}</td>
        <td>${formatDetailField(item.required)}</td>
        <td>${item.note}<div class="check-coderef">${buildDetailDecisionSentence(item)}</div></td>
        <td>${item.passes ? "OK" : "NG"}</td>
      </tr>
    `).join("");
    const flowHtml = showFlow.checked ? result.checks.map((check) => `
      <section class="block">
        <h3>${check.label}${check.codeRef || check.equationRef ? `｜${[check.codeRef, check.equationRef].filter(Boolean).join("｜")}` : ""}</h3>
        <p style="font-size:12px;color:#555;margin:0 0 8px;">${buildDecisionSentence(check)}</p>
        ${check.latexLines?.length
          ? `<div class="equation-math-wrap equation-math-wrap--print"><div class="equation-math equation-math--print">${check.latexLines.map((line) => `<div class="equation-math__line">\\[${line}\\]</div>`).join("")}</div><div class="mono mono--fallback">${(check.equationLines || []).join("<br>")}</div></div>`
          : `<div class="mono">${(check.equationLines || []).join("<br>")}</div>`}
      </section>
    `).join("") : "";
    const notes = [
      ...result.validations,
      ...result.assumptions,
      ...result.references.map((item) => `參考條文：${item}`),
      result.state.notes ? `設計備註：${result.state.notes}` : null,
    ].filter(Boolean);
    const reviewSectionsHtml = buildReviewSectionsMarkup(result, { inline: true });
    const reviewSummaryRows = [
      ["規範基準", getCodeBasisText(result.state)],
      ["正式規範核算模組", result.complianceReady ? "是" : "否"],
      ["控制檢核項目", result.governing.label],
      ["控制式號", result.governing.equationRef || "—"],
      ["整體判定", result.passes ? (result.overallStatus === "warn" ? "條件式核可" : "核可") : "不核可"],
      ["限制條件狀態", result.scopeLimited ? "有範圍限制，應配合限制事項判讀" : "無額外範圍限制訊息"],
    ].map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join("");
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
        <section class="block"><h3>破壞路徑示意</h3>${buildPlateSketchMarkup(result, { inline: true })}</section>`
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
        <section class="block"><h3>構材與接合示意</h3>${buildTensionSketchMarkup(result, { inline: true })}</section>`
      : "";
    const referenceToolsHtml = `<section class="block"><h3>功能借鏡</h3><p style="font-size:12px;color:#555;line-height:1.6;">下列網路工具僅作介面流程與報表表現方式之借鏡，規範判定仍以本工具引用之正式條文為準。</p><ul>${toolReferences.map((item) => `<li><a href="${item.url}" target="_blank" rel="noreferrer noopener">${item.name}</a>：${item.adopted}</li>`).join("")}</ul></section>`;

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
body{font-family:"Microsoft JhengHei",sans-serif;color:#111;margin:0;padding:24px;background:#f4f4f4}
.paper{max-width:820px;margin:0 auto;background:#fff;padding:32px 36px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
h1{margin:0 0 6px;font-size:24px}.sub{color:#555;margin-bottom:16px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:12px;margin-bottom:18px}
.meta div{border-bottom:1px dotted #888;padding:4px 0}
.banner{padding:14px 18px;border:2px solid #888;border-radius:6px;text-align:center;font-size:18px;font-weight:700;margin-bottom:18px}
.block{margin:16px 0}.block h3{margin:0 0 8px;padding:4px 8px;background:#1a3d5c;color:#fff;border-radius:4px;font-size:14px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#eef2f6}
.check-coderef{margin-top:4px;font-size:11px;color:#64748b}
.flow-decision{font-size:12px;color:#334155;font-weight:700;margin:0 0 8px}
.mono{white-space:pre-wrap;font-family:Consolas,monospace;background:#faf5ff;border:1px solid #e9d5ff;border-radius:4px;padding:10px;color:#3b0764;font-size:11px;line-height:1.6}
.equation-math{background:#faf5ff;border:1px solid #e9d5ff;border-radius:6px;padding:10px 12px;color:#3b0764;overflow:auto}.equation-math__line + .equation-math__line{margin-top:8px}.equation-list--fallback,.mono--fallback{display:none}.mathjax-fallback .equation-math{display:none}.mathjax-fallback .equation-list--fallback,.mathjax-fallback .mono--fallback{display:block}
.review-section + .review-section{margin-top:12px}.review-section__title{margin-bottom:6px;font-size:12px;font-weight:700;color:#0e7490}
.card-placeholder{padding:14px;border:1px dashed #cbd5e1;border-radius:10px;background:#f8fafc;color:#64748b}
.plate-sketch{width:100%;height:auto;min-height:220px}.sketch-plate,.sketch-member{fill:rgba(14,116,144,.08);stroke:#0e7490;stroke-width:2}.sketch-hole{fill:#fff;stroke:#1e293b;stroke-width:1.5}.sketch-net{fill:none;stroke:#c0392b;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:8 6}.sketch-block{fill:rgba(217,119,6,.12);stroke:#d97706;stroke-width:2.5}.sketch-arrow{stroke:#0e7490;stroke-width:2.5}.sketch-label{fill:#0f172a;font-size:12px;font-weight:700}.sketch-note{fill:#475569;font-size:11px}.sketch-weld{stroke:#b45309;stroke-width:5;stroke-linecap:round}.sketch-weld--transverse{stroke:#c2410c}.sketch-dim{stroke:#64748b;stroke-width:1.4}.sketch-dim-label{fill:#475569;font-size:10px;font-weight:700}
ul{margin:0;padding-left:20px}.toolbar{max-width:820px;margin:0 auto 12px;text-align:right}.toolbar button{padding:8px 18px}
@media print{body{background:#fff;padding:0}.toolbar{display:none}.paper{box-shadow:none;max-width:none;padding:0}}
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">列印 / 存 PDF</button></div>
<div class="paper">
<h1>${result.reportTitle}</h1>
<div class="sub">${result.reportSubtitle}</div>
<div class="meta">
  <div><b>計畫名稱</b> ${result.state.projectName || "—"}</div>
  <div><b>接頭編號</b> ${result.state.connectionTag || "—"}</div>
  <div><b>設計人</b> ${result.state.designer || "—"}</div>
  <div><b>製表時間</b> ${nowLabel()}</div>
  <div><b>設計法</b> ${mapValue("designMethod", result.state.designMethod)}</div>
  <div><b>規範基準</b> ${getCodeBasisText(result.state)}</div>
  <div><b>控制項</b> ${result.governing.label}</div>
</div>
<div class="banner">${reportBanner.textContent}</div>
<section class="block"><h3>審查摘要</h3><table><tbody>${reviewSummaryRows}</tbody></table></section>
<section class="block"><h3>強度檢核總表</h3><table><thead><tr><th>檢核項目</th><th>需求值</th><th>可用強度</th><th>DCR</th><th>判定</th></tr></thead><tbody>${strengthRows}</tbody></table></section>
<section class="block"><h3>細部規定檢核</h3><table><thead><tr><th>檢核項目</th><th>規定條文</th><th>提供值</th><th>規定值</th><th>檢核說明</th><th>判定</th></tr></thead><tbody>${detailRows}</tbody></table></section>
${plateAreaTable}
${tensionAreaTable}
${flowHtml}
<section class="block"><h3>設計依據與限制條件</h3>${reviewSectionsHtml || `<ul>${notes.map((item) => `<li>${item}</li>`).join("")}</ul>`}</section>
${referenceToolsHtml}
</div>
</body>
</html>`;
  }

  function exportReport() {
    const result = window.latestSteelConnectionResult || calculateConnection(collectFormState());
    const reportWindow = window.open("", "_blank", "width=980,height=1100,scrollbars=yes");
    if (!reportWindow) {
      window.alert("請允許彈出視窗以輸出報表。");
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
    update(autoSave);
  }

  async function copySummary() {
    const result = window.latestSteelConnectionResult || calculateConnection(collectFormState());
    const lines = [
      result.reportTitle,
      `計畫：${result.state.projectName || "—"}`,
      `接頭：${result.state.connectionTag || "—"}`,
      `判定：${reportBanner.textContent}`,
      `控制項：${result.governing.label}`,
      ...result.checks.map((check) => `${check.label}｜需求 ${formatNumber(check.demand)} kN｜容量 ${formatNumber(check.available)} kN｜DCR ${formatNumber(check.ratio, 3)}`),
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
  exportReportBtn.addEventListener("click", exportReport);
  copySummaryBtn.addEventListener("click", copySummary);
  printReportBtn.addEventListener("click", () => window.print());
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
  setFormState(loadSavedDraft() || getCurrentExampleState(), false);
  activatePanel(currentPanel);
  loadAuditStatus();
  requestQuickNavSync();
})();
