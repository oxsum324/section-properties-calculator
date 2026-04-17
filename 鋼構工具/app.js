(function initSteelConnectionApp() {
  const { calculateConnection } = window.ShearConnectionCalculator;
  const STORAGE_KEY = "steel-connection-suite-draft-v1";

  const glossaryItems = [
    ["Pu / Pa", "需求軸力", "kN", "接頭於設計載重組合下應傳遞之軸力。", "柱續接、支撐接頭主控需求。"],
    ["Vu / Va", "需求剪力", "kN", "接頭於設計載重組合下應傳遞之剪力。", "剪力接頭、柱腹續接、梁柱腹板傳力。"],
    ["Mu / Ma", "需求彎矩", "kN-m", "接頭於設計載重組合下應傳遞之彎矩。", "柱續接與梁柱彎矩接頭主控需求。"],
    ["eec", "偏心距", "mm", "力作用線與接頭重心間之距離。", "本版列為提醒，不直接納入栓群偏心分析。"],
    ["db", "螺栓直徑", "mm", "螺栓標稱直徑。", "螺栓強度、孔距、邊距。"],
    ["dh", "孔徑", "mm", "螺栓孔直徑。", "承壓、淨距、塊狀撕裂。"],
    ["Fub", "螺栓抗拉強度", "MPa", "螺栓材料規定最小抗拉強度。", "螺栓剪力與拉力。"],
    ["Fy / Fu", "鋼材降伏 / 抗拉強度", "MPa", "板件材料強度參數。", "總斷面降伏、淨斷面斷裂、塊狀撕裂。"],
    ["Lc", "力方向淨距", "mm", "孔邊至板邊或相鄰孔邊沿力方向之淨距。", "孔承壓強度。"],
    ["Ag / An", "總 / 淨斷面積", "mm²", "板件對應破壞路徑之總斷面積與淨斷面積。", "斷面降伏與斷裂。"],
    ["Agv / Anv", "剪力面全 / 淨面積", "mm²", "塊狀撕裂路徑之剪力面積。", "塊狀撕裂。"],
    ["Agt / Ant", "拉力面全 / 淨面積", "mm²", "塊狀撕裂路徑之拉力面積。", "塊狀撕裂。"],
    ["a", "銲腳尺寸", "mm", "填角銲腳長。", "銲道有效喉厚與強度。"],
    ["Le", "有效銲長", "mm", "可參與傳力之有效銲道長度。", "銲接容量。"],
    ["FEXX", "銲材抗拉強度", "MPa", "銲材規定最小抗拉強度。", "銲道可用強度。"],
    ["hsp", "柱續接槓桿臂", "mm", "柱翼壓拉偶力之力臂。", "柱續接由彎矩換算翼板拉力。"],
    ["bfp / bfn", "翼板總寬 / 淨寬", "mm", "柱翼續接板總寬及扣孔後有效淨寬。", "續接板降伏與斷裂。"],
    ["hw", "腹板續接板深度", "mm", "柱腹續接板可傳遞剪力之有效高度。", "腹板剪力降伏。"],
    ["b0", "Whitmore 初始寬度", "mm", "支撐連接於 Gusset 板起始之寬度。", "Whitmore 展開寬度。"],
    ["bnet", "Gusset 淨寬", "mm", "扣除孔洞後之有效淨寬。", "Gusset 淨斷面斷裂。"],
    ["Lw", "Whitmore 展開長度", "mm", "沿受力方向向外展開之評估長度。", "Whitmore 有效寬度。"],
    ["hm", "彎矩接頭槓桿臂", "mm", "梁翼張壓偶力之力臂。", "將彎矩換算拉側需求。"],
    ["bmp / bmn", "端板總寬 / 淨寬", "mm", "梁柱彎矩接頭端板總寬與淨寬。", "端板降伏與斷裂。"],
    ["Vpz", "Panel Zone 可用容量", "kN", "由工程師或外部模型提供之 panel zone 可用等效容量。", "梁柱接頭 panel zone 篩選。"],
    ["Rn", "標稱強度", "kN", "未乘抗力折減係數或未除安全係數前之強度。", "中間計算值。"],
    ["phiRn / Rn/Omega", "可用強度", "kN", "LRFD 為 phiRn；ASD 為 Rn / Omega。", "與需求比較之容量。"],
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
  };

  const defaultState = {
    ...exampleStates.column_splice,
    ...exampleStates.brace_gusset,
    ...exampleStates.beam_column_moment,
    ...exampleStates.single_plate,
  };

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
  };

  const labelMap = {
    designMethod: { LRFD: "LRFD 極限設計法", ASD: "ASD 容許應力設計法" },
    connectionType: {
      single_plate: "剪力接頭｜單剪力板 Shear Tab",
      column_splice: "柱續接｜Column Splice",
      brace_gusset: "支撐 / Gusset 接頭",
      beam_column_moment: "梁柱彎矩接頭",
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
  };

  const form = document.getElementById("connectionForm");
  const showFlow = document.getElementById("showFlow");
  const loadExampleBtn = document.getElementById("loadExampleBtn");
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
  const reportTitle = document.getElementById("reportTitle");
  const reportSubtitle = document.getElementById("reportSubtitle");
  const metaProjectName = document.getElementById("metaProjectName");
  const metaConnectionTag = document.getElementById("metaConnectionTag");
  const metaDesigner = document.getElementById("metaDesigner");
  const reportTimestamp = document.getElementById("reportTimestamp");
  const reportBanner = document.getElementById("reportBanner");
  const overallMessage = document.getElementById("overallMessage");
  const governingMode = document.getElementById("governingMode");
  const approvalStamp = document.getElementById("approvalStamp");
  const approvalDecision = document.getElementById("approvalDecision");
  const approvalGoverning = document.getElementById("approvalGoverning");
  const inputSummaryTables = document.getElementById("inputSummaryTables");
  const strengthCheckTableBody = document.getElementById("strengthCheckTableBody");
  const detailCheckTableBody = document.getElementById("detailCheckTableBody");
  const alertsList = document.getElementById("alertsList");
  const flowCards = document.getElementById("flowCards");

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

  function getCurrentConnectionType() {
    return form.elements.namedItem("connectionType").value;
  }

  function getCurrentExampleState() {
    return { ...defaultState, ...(exampleStates[getCurrentConnectionType()] || exampleStates.single_plate) };
  }

  function collectFormState() {
    return Object.fromEntries(new FormData(form).entries());
  }

  function getInputGroups(type) {
    return [...sharedGroups, ...(specificGroups[type] || [])];
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

  function toggleConnectionSections(type) {
    document.querySelectorAll("[data-connection]").forEach((card) => {
      const visible = card.dataset.connection === type;
      card.classList.toggle("is-hidden", !visible);
    });
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
        <tr>
          <td>${check.label}</td>
          <td>${formatNumber(check.demand)} kN</td>
          <td>${formatNumber(check.available)} kN</td>
          <td>${formatNumber(check.ratio, 3)}</td>
          <td>${statusPill(status)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderDetailChecks(result) {
    detailCheckTableBody.innerHTML = result.detailChecks.map((item) => `
      <tr>
        <td>${item.label}</td>
        <td>${item.codeRef}</td>
        <td>${item.note}</td>
        <td>${statusPill(item.passes ? { text: "OK", className: "ok" } : { text: "NG", className: "fail" })}</td>
      </tr>
    `).join("");
  }

  function renderAlerts(result) {
    const notes = [
      ...result.validations,
      ...result.assumptions,
      ...result.references.map((item) => `參考條文：${item}`),
      result.state.notes ? `設計備註：${result.state.notes}` : null,
    ].filter(Boolean);
    alertsList.innerHTML = `<ul>${notes.map((note) => `<li>${note}</li>`).join("")}</ul>`;
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
            <h3>${check.label}</h3>
            ${statusPill(status)}
          </div>
          <p>${check.note}</p>
          <div class="flow-metrics">
            <div class="flow-metric"><span class="label">需求值</span><span class="value">${formatNumber(check.demand)} kN</span></div>
            <div class="flow-metric"><span class="label">可用強度</span><span class="value">${formatNumber(check.available)} kN</span></div>
            <div class="flow-metric"><span class="label">DCR</span><span class="value">${formatNumber(check.ratio, 3)}</span></div>
          </div>
          <ul class="equation-list">${(check.equationLines || []).map((line) => `<li>${line}</li>`).join("")}</ul>
        </article>
      `;
    }).join("");
  }

  function updateMethodPresentation(method) {
    const isLrfd = method === "LRFD";
    methodLrfBtn.classList.toggle("active", isLrfd);
    methodAsdBtn.classList.toggle("active", !isLrfd);
    methodHint.textContent = isLrfd ? "鋼結構極限設計法，第十章接合設計" : "鋼結構容許應力設計法，第十章接合設計";
  }

  function renderSummary(result) {
    pageTitle.textContent = result.pageTitle;
    pageDescription.textContent = result.pageDescription;
    reportTitle.textContent = result.reportTitle;
    reportSubtitle.textContent = result.reportSubtitle;
    metaProjectName.textContent = result.state.projectName || "—";
    metaConnectionTag.textContent = result.state.connectionTag || "—";
    metaDesigner.textContent = result.state.designer || "—";
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
      : `控制項為「${result.governing.label}」，需求 ${formatNumber(result.governing.demand)} kN，容量 ${formatNumber(result.governing.available)} kN，DCR = ${formatNumber(result.governing.ratio, 3)}。`;
    governingMode.textContent = result.governing.label;
    approvalGoverning.textContent = `${result.governing.label} / DCR ${formatNumber(result.governing.ratio, 3)}`;
    updateMethodPresentation(result.state.designMethod);
    toggleConnectionSections(result.state.connectionType);
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
      draftStatus.textContent = `已載入草稿：${parsed.savedAt || "未知時間"}`;
      return parsed.state || null;
    } catch {
      draftStatus.textContent = "草稿讀取失敗";
      return null;
    }
  }

  function buildReportHtml(result) {
    const strengthRows = result.checks.map((check) => `
      <tr>
        <td>${check.label}</td>
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
        <td>${item.note}</td>
        <td>${item.passes ? "OK" : "NG"}</td>
      </tr>
    `).join("");
    const flowHtml = showFlow.checked ? result.checks.map((check) => `
      <section class="block">
        <h3>${check.label}</h3>
        <div class="mono">${(check.equationLines || []).join("<br>")}</div>
      </section>
    `).join("") : "";
    const notes = [
      ...result.validations,
      ...result.assumptions,
      ...result.references.map((item) => `參考條文：${item}`),
      result.state.notes ? `設計備註：${result.state.notes}` : null,
    ].filter(Boolean);

    return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<title>${result.reportTitle}</title>
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
.mono{white-space:pre-wrap;font-family:Consolas,monospace;background:#faf5ff;border:1px solid #e9d5ff;border-radius:4px;padding:10px;color:#3b0764;font-size:11px;line-height:1.6}
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
  <div><b>控制項</b> ${result.governing.label}</div>
</div>
<div class="banner">${reportBanner.textContent}</div>
<section class="block"><h3>強度檢核總表</h3><table><thead><tr><th>檢核項目</th><th>需求值</th><th>可用強度</th><th>DCR</th><th>判定</th></tr></thead><tbody>${strengthRows}</tbody></table></section>
<section class="block"><h3>細部規定檢核</h3><table><thead><tr><th>檢核項目</th><th>規定條文</th><th>檢核說明</th><th>判定</th></tr></thead><tbody>${detailRows}</tbody></table></section>
${flowHtml}
<section class="block"><h3>提醒與假設</h3><ul>${notes.map((item) => `<li>${item}</li>`).join("")}</ul></section>
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
  }

  function update(autoSave = true) {
    const state = collectFormState();
    const result = calculateConnection(state);
    renderSummary(result);
    renderInputSummary(result);
    renderStrengthChecks(result);
    renderDetailChecks(result);
    renderAlerts(result);
    renderFlow(result);
    window.latestSteelConnectionResult = result;
    if (autoSave) persistDraft(state);
  }

  function setFormState(state, autoSave = false) {
    Object.entries(state).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (field) field.value = value;
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

  function bindTabs() {
    document.querySelectorAll(".section-tabs button").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".section-tabs button").forEach((item) => item.classList.remove("active"));
        document.querySelectorAll(".subpanel").forEach((panel) => panel.classList.remove("active"));
        button.classList.add("active");
        document.getElementById(`panel-${button.dataset.panel}`).classList.add("active");
      });
    });
  }

  form.addEventListener("input", () => update(true));
  form.addEventListener("change", () => update(true));
  showFlow.addEventListener("change", () => update(false));
  loadExampleBtn.addEventListener("click", () => setFormState(getCurrentExampleState(), true));
  saveDraftBtn.addEventListener("click", () => persistDraft(collectFormState()));
  exportReportBtn.addEventListener("click", exportReport);
  copySummaryBtn.addEventListener("click", copySummary);
  printReportBtn.addEventListener("click", () => window.print());
  resetBtn.addEventListener("click", () => setFormState(getCurrentExampleState(), true));

  renderGlossary();
  bindMethodButtons();
  bindTabs();
  setFormState(loadSavedDraft() || defaultState, false);
})();
