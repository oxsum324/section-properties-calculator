(function initSteelBeamFormal() {
  const $ = (id) => document.getElementById(id);
  const f2 = (value) => Number(value || 0).toFixed(2);
  const f1 = (value) => Number(value || 0).toFixed(1);
  const f0 = (value) => Math.round(Number(value || 0)).toLocaleString();
  const num = (id) => parseFloat($(id)?.value) || 0;
  const UI_PREFS_KEY = "steel-beam-formal-ui-v3";
  const TF_TO_KN = 9.80665;
  const KGFCM2_TO_MPA = 0.0980665;
  const KGFCM_TO_KNM = 0.980665;
  const beamUnitFieldConfigs = [
    { id: "inFy", kind: "stress", legacyDigits: 0, siDigits: 1 },
    { id: "inL", kind: "memberLength", legacyDigits: 1, siDigits: 3 },
    { id: "inLb", kind: "memberLength", legacyDigits: 1, siDigits: 3 },
    { id: "inLv", kind: "memberLength", legacyDigits: 1, siDigits: 3 },
    { id: "inMu", kind: "moment", legacyDigits: 2, siDigits: 2 },
    { id: "inVu", kind: "force", legacyDigits: 2, siDigits: 2 },
    { id: "inWD", kind: "lineLoad", legacyDigits: 2, siDigits: 3 },
    { id: "inWL", kind: "lineLoad", legacyDigits: 2, siDigits: 3 },
  ];
  const isFilled = (id) => {
    const field = $(id);
    if (!field) return false;
    if (field.tagName === "SELECT") return field.value !== "";
    return String(field.value ?? "").trim() !== "";
  };

  function formatInputValue(value, digits = 2) {
    if (!Number.isFinite(Number(value))) return "";
    return Number(value).toFixed(digits).replace(/(?:\.0+|(\.\d+?)0+)$/, "$1");
  }

  function convertLegacyValue(value, kind, mode = unitMode) {
    if (mode !== "si") return Number(value || 0);
    if (kind === "stress") return Number(value || 0) * KGFCM2_TO_MPA;
    if (kind === "force" || kind === "moment") return Number(value || 0) * TF_TO_KN;
    if (kind === "memberLength") return Number(value || 0) / 100;
    if (kind === "lineLoad") return Number(value || 0) * KGFCM_TO_KNM;
    if (kind === "deflection") return Number(value || 0) * 10;
    return Number(value || 0);
  }

  function convertDisplayValue(value, kind, mode = unitMode) {
    if (mode !== "si") return Number(value || 0);
    if (kind === "stress") return Number(value || 0) / KGFCM2_TO_MPA;
    if (kind === "force" || kind === "moment") return Number(value || 0) / TF_TO_KN;
    if (kind === "memberLength") return Number(value || 0) * 100;
    if (kind === "lineLoad") return Number(value || 0) / KGFCM_TO_KNM;
    if (kind === "deflection") return Number(value || 0) / 10;
    return Number(value || 0);
  }

  function getQuantityUnit(kind, mode = unitMode) {
    if (kind === "stress") return mode === "si" ? "MPa" : "kgf/cm²";
    if (kind === "force") return mode === "si" ? "kN" : "tf";
    if (kind === "moment") return mode === "si" ? "kN·m" : "tf·m";
    if (kind === "memberLength") return mode === "si" ? "m" : "cm";
    if (kind === "lineLoad") return mode === "si" ? "kN/m" : "kgf/cm";
    if (kind === "deflection") return mode === "si" ? "mm" : "cm";
    return "";
  }

  function getFieldConfig(id) {
    return beamUnitFieldConfigs.find((item) => item.id === id) || null;
  }

  function setDisplayFieldValue(id, legacyValue, kind = getFieldConfig(id)?.kind, mode = unitMode) {
    const field = $(id);
    const config = getFieldConfig(id);
    if (!field || !kind) return;
    const digits = mode === "si" ? (config?.siDigits ?? 2) : (config?.legacyDigits ?? 2);
    field.value = formatInputValue(convertLegacyValue(legacyValue, kind, mode), digits);
  }

  function getLegacyInputValue(id, kind = getFieldConfig(id)?.kind) {
    const raw = parseFloat($(id)?.value);
    if (!Number.isFinite(raw)) return 0;
    return kind ? convertDisplayValue(raw, kind, unitMode) : raw;
  }

  function convertConfiguredFields(previousMode, nextMode) {
    beamUnitFieldConfigs.forEach((config) => {
      const field = $(config.id);
      const raw = String(field?.value ?? "").trim();
      if (!field || !raw) return;
      const parsed = parseFloat(raw);
      if (!Number.isFinite(parsed)) return;
      const legacyValue = convertDisplayValue(parsed, config.kind, previousMode);
      const digits = nextMode === "si" ? config.siDigits : config.legacyDigits;
      field.value = formatInputValue(convertLegacyValue(legacyValue, config.kind, nextMode), digits);
    });
  }

  function formatDisplayValue(value, kind, digits = 2, mode = unitMode) {
    return formatInputValue(convertLegacyValue(value, kind, mode), digits);
  }

  function getCurrentInputModeLabel(mode = unitMode) {
    return mode === "si" ? "SI（kN / MPa / m）" : "舊制（tf / kgf/cm² / cm）";
  }

  function isOverallOk(result) {
    return !!result && result.flexOk && result.shearOk && result.deflStatus === "ok";
  }

  let designMethod = "LRFD";
  let unitMode = "legacy";
  let quickNavTicking = false;
  let reportJumpTicking = false;
  let currentInputPreset = "smart";
  let currentReportPreset = "focus";
  let currentPanel = "report";
  let resultState = null;

  const glossaryItems = [
    ["Fy", "鋼材降伏強度", "kgf/cm²", "鋼材規定最小降伏強度。", "撓曲與剪力強度計算。", "第七章撓曲構材一般規定"],
    ["λf", "翼板寬厚比", "-", "翼板外伸寬度與厚度之比值。", "翼板局部挫屈分類。", "第七章斷面分類條文"],
    ["λw", "腹板寬厚比", "-", "腹板淨高與腹板厚度之比值。", "腹板局部挫屈分類。", "第七章斷面分類條文"],
    ["Lb", "未側撐長度", "cm", "壓縮翼板兩側向支撐點間之距離。", "橫向扭轉挫屈計算。", "第七章橫向扭轉挫屈條文"],
    ["Cb", "彎矩梯度修正係數", "-", "反映未側撐段彎矩分布之修正係數。", "LTB 強度調整。", "第七章橫向扭轉挫屈條文"],
    ["Mp", "塑性彎矩", "kgf·cm", "Fy 乘以塑性斷面係數 Zx。", "撓曲強度上限。", "第七章撓曲降伏條文"],
    ["Lp", "塑性區界限未側撐長度", "cm", "不發生 LTB 折減之界限長度。", "撓曲構材區段判定。", "第七章界限長度條文"],
    ["Lr", "彈性 LTB 界限未側撐長度", "cm", "非彈性與彈性 LTB 之轉換界限。", "撓曲構材區段判定。", "第七章界限長度條文"],
    ["F2", "條文分類 F2", "-", "腹板為結實、翼板為結實時之 I 形撓曲構材條文分類。", "判定撓曲強度算式來源。", "第七章 F2"],
    ["F3", "條文分類 F3", "-", "腹板為結實，但翼板為非結實或細長時之 I 形撓曲構材條文分類。", "判定撓曲強度算式來源。", "第七章 F3"],
    ["F4", "條文分類 F4", "-", "腹板為非結實時之 I 形撓曲構材條文分類。", "判定撓曲強度算式來源。", "第七章 F4"],
    ["F5", "條文分類 F5", "-", "腹板為細長時之 I 形撓曲構材條文分類。", "判定撓曲強度算式來源。", "第七章 F5"],
    ["F7", "條文分類 F7", "-", "方形或矩形 HSS 之撓曲構材條文分類。", "判定閉鎖 HSS 撓曲強度算式來源。", "第七章 F7"],
    ["F8", "條文分類 F8", "-", "圓形 HSS 之撓曲構材條文分類。", "判定圓管撓曲強度算式來源。", "第七章 F8"],
    ["LTB", "橫向扭轉挫屈", "-", "未側撐壓縮翼板發生側移與扭轉耦合之撓曲失穩模式。", "控制模式判讀。", "第七章橫向扭轉挫屈條文"],
    ["FLB", "翼板局部挫屈", "-", "受壓翼板局部板件先行挫屈而控制撓曲強度。", "控制模式判讀。", "第七章翼板局部挫屈條文"],
    ["WLB", "腹板局部挫屈", "-", "受壓腹板板件先行局部挫屈而控制撓曲強度。", "控制模式判讀。", "第七章 F7 矩形 HSS"],
    ["Yielding", "降伏控制", "-", "斷面達到撓曲降伏或塑性彎矩上限所控制。", "控制模式判讀。", "第七章撓曲降伏條文"],
    ["Mn", "標稱彎矩強度", "kgf·cm", "綜合降伏、LTB 與局部挫屈後之控制彎矩強度。", "主軸彎矩檢核。", "第七章撓曲構材強度"],
    ["φb", "撓曲強度折減因數", "-", "LRFD 撓曲強度採用之折減因數。", "LRFD φMn 顯示與檢核。", "第七章撓曲構材設計強度"],
    ["Ωb", "撓曲安全因數", "-", "ASD 以標稱彎矩強度換算可用強度時採用之安全因數。", "ASD Mn/Ωb 顯示與檢核。", "第七章撓曲構材安全因數"],
    ["Aw", "腹板剪力面積", "cm²", "腹板淨高乘腹板厚度。", "剪力強度。", "第七章剪力條文"],
    ["Cv1", "腹板剪力折減係數", "-", "依腹板高厚比與剪力挫屈條件取得。", "剪力強度。", "第七章剪力條文"],
    ["Cv2", "HSS 剪力折減係數", "-", "方形或矩形 HSS 依壁厚比例與剪力挫屈條件取得之折減係數。", "方管剪力強度。", "第七章 G4 HSS 剪力"],
    ["Lv", "剪力長度", "cm", "圓管剪力由最大剪力到零剪力之距離。", "圓管剪力挫屈。", "第七章 G5 圓形 HSS 剪力"],
    ["Fcr", "臨界應力", "kgf/cm²", "依局部挫屈或剪力挫屈條文取得之臨界應力。", "圓管撓曲與剪力。", "第七章 F8 / G5"],
    ["Vn", "標稱剪力強度", "kgf", "依 0.6FyAwCv1 求得之剪力強度。", "剪力檢核。", "第七章剪力條文"],
    ["φv / Ωv", "剪力係數", "-", "剪力強度之 LRFD 折減因數與 ASD 安全因數；緊密腹板時採特別係數。", "φVn 或 Vn/Ωv 顯示與檢核。", "第七章剪力條文"],
    ["ΔL", "活載重撓度", "cm", "使用活載重引致之即時撓度。", "使用性檢核。", "使用性需求；限值由設計者輸入"],
    ["ΔT", "總撓度", "cm", "靜載重與活載重合計之即時撓度。", "使用性檢核。", "使用性需求；限值由設計者輸入"],
    ["Sx / Zx", "彈性 / 塑性斷面係數", "cm³", "對主軸彎矩之彈性與塑性抵抗能力。", "撓曲強度。", "第七章斷面性質定義"],
    ["ry / rts", "迴轉半徑 / 扭轉相關半徑", "cm", "描述側向穩定性與 LTB 行為之幾何量。", "LTB 計算。", "第七章橫向扭轉挫屈條文"],
  ];

  function activatePanel(name) {
    currentPanel = name;
    document.querySelectorAll(".section-tabs button").forEach((button) => {
      button.classList.toggle("active", button.dataset.panel === name);
    });
    document.querySelectorAll(".subpanel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `panel-${name}`);
    });
    updateQuickNavActive(name === "flow" ? "flow" : "report");
    requestQuickNavSync();
    requestReportJumpSync();
    persistUiPrefs();
  }

  function persistUiPrefs() {
    try {
      localStorage.setItem(UI_PREFS_KEY, JSON.stringify({
        designMethod,
        unitMode,
        sectionType: $("sectionTypeSelect")?.value || "h",
        inputPreset: currentInputPreset,
        reportPreset: currentReportPreset,
        panel: currentPanel,
        showFlowInReport: $("beamShowFlowInReport")?.checked ?? true,
        showSymbolsInReport: $("beamShowSymbolsInReport")?.checked ?? true,
        showNotesInReport: $("beamShowNotesInReport")?.checked ?? true,
      }));
    } catch {
      // ignore
    }
  }

  function loadUiPrefs() {
    try {
      const raw = localStorage.getItem(UI_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.designMethod === "LRFD" || parsed.designMethod === "ASD") designMethod = parsed.designMethod;
      if (parsed.unitMode === "legacy" || parsed.unitMode === "si") unitMode = parsed.unitMode;
      if (["h", "shs", "rhs", "chs"].includes(parsed.sectionType) && $("sectionTypeSelect")) {
        $("sectionTypeSelect").value = parsed.sectionType;
      }
      if (parsed.inputPreset) currentInputPreset = parsed.inputPreset;
      if (parsed.reportPreset) currentReportPreset = parsed.reportPreset;
      if (parsed.panel) currentPanel = parsed.panel;
      if (typeof parsed.showFlowInReport === "boolean" && $("beamShowFlowInReport")) {
        $("beamShowFlowInReport").checked = parsed.showFlowInReport;
      }
      if (typeof parsed.showSymbolsInReport === "boolean" && $("beamShowSymbolsInReport")) {
        $("beamShowSymbolsInReport").checked = parsed.showSymbolsInReport;
      }
      if (typeof parsed.showNotesInReport === "boolean" && $("beamShowNotesInReport")) {
        $("beamShowNotesInReport").checked = parsed.showNotesInReport;
      }
    } catch {
      // ignore
    }
  }

  function renderGlossary() {
    $("beamGlossaryBody").innerHTML = glossaryItems.map((item) => `
      <tr>
        <td>${item[0]}</td>
        <td>${item[1]}</td>
        <td>${item[2]}</td>
        <td>${item[3]}</td>
        <td>${item[4]}</td>
        <td>${item[5]}</td>
      </tr>
    `).join("");
  }

  function getSectionType() {
    return $("sectionTypeSelect")?.value || "h";
  }

  function isClosedHss(type = getSectionType()) {
    return type === "shs" || type === "rhs" || type === "chs";
  }

  function suppressesBeamLtbInput(type = getSectionType()) {
    return type === "shs" || type === "chs";
  }

  function isRoundHss(type = getSectionType()) {
    return type === "chs";
  }

  function getSectionFieldIds(type = getSectionType()) {
    if (type === "shs") return ["shsSelect", "inShsB", "inShsT"];
    if (type === "rhs") return ["rhsSelect", "inRhsH", "inRhsB", "inRhsT"];
    if (type === "chs") return ["chsSelect", "inChsD", "inChsT"];
    return ["secSelect", "inH", "inB", "inTw", "inTf"];
  }

  function getSectionMetaText(type = getSectionType()) {
    if (type === "shs") return $("shsSelect").value ? "已選方管" : "方管 SHS";
    if (type === "rhs") return $("rhsSelect").value ? "已選矩形管" : (isFilled("inRhsH") && isFilled("inRhsB") && isFilled("inRhsT") ? "已填矩形管" : "矩形管 RHS");
    if (type === "chs") return $("chsSelect").value ? "已選圓管" : "圓管 CHS";
    return $("secSelect").value ? "已選型鋼" : "自訂斷面";
  }

  function getBeamClosedShapeNote(type = getSectionType()) {
    if (type === "rhs") {
      return "矩形管 RHS 為閉鎖 HSS；本版強軸彎曲仍使用 Lb / Cb 評估 F7 側扭挫屈，請以 H ≥ B 輸入。";
    }
    return "方管與圓管為閉鎖 HSS，本版梁檢核不啟用 Lb / Cb 的 H 型鋼側扭挫屈輸入。";
  }

  function syncSectionTypeUI() {
    const type = getSectionType();
    document.querySelectorAll("[data-section-type]").forEach((block) => {
      block.classList.toggle("is-hidden", block.dataset.sectionType !== type);
    });
    $("beamLtbField").classList.toggle("is-hidden", suppressesBeamLtbInput(type));
    $("beamCbGroup").classList.toggle("is-hidden", suppressesBeamLtbInput(type));
    $("beamClosedShapeNote").textContent = getBeamClosedShapeNote(type);
    $("beamClosedShapeNote").classList.toggle("is-hidden", !isClosedHss(type));
    $("beamRoundShearRow").classList.toggle("is-hidden", !isRoundHss(type));
    renderFillStatus();
    renderCardStatuses(resultState);
    persistUiPrefs();
  }

  function buildGroupedSectionOptions(select, groups) {
    groups.forEach((group) => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.g;
      group.s.forEach((section, index) => {
        const option = document.createElement("option");
        option.value = `${group.g}|${index}`;
        option.textContent = section.n;
        optgroup.appendChild(option);
      });
      select.appendChild(optgroup);
    });
  }

  function normalizeSectionQuery(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[×*]/g, "x");
  }

  function buildSectionSearchText(groupLabel, section) {
    const parts = [groupLabel, section.n];
    if (typeof section.H === "number" && typeof section.B === "number") {
      parts.push(`${section.H}x${section.B}`, `${section.H}x${section.B}x${section.t}`, `${section.B}x${section.H}`);
    } else if (typeof section.B === "number") {
      parts.push(`${section.B}x${section.B}`, `${section.B}x${section.B}x${section.t}`);
    } else if (typeof section.D === "number") {
      parts.push(`${section.D}`, `${section.D}x${section.t}`);
    }
    if (typeof section.t === "number") parts.push(`${section.t}`);
    return normalizeSectionQuery(parts.join(" "));
  }

  function filterGroupedSections(groups, query) {
    const normalizedQuery = normalizeSectionQuery(query);
    if (!normalizedQuery) return groups;
    return groups
      .map((group) => ({
        g: group.g,
        s: group.s.filter((section) => buildSectionSearchText(group.g, section).includes(normalizedQuery)),
      }))
      .filter((group) => group.s.length > 0);
  }

  function getGroupedSection(groups, raw) {
    if (!raw) return null;
    const [groupName, indexRaw] = raw.split("|");
    const group = groups.find((item) => item.g === groupName);
    if (!group) return null;
    return group.s[parseInt(indexRaw, 10)] || null;
  }

  function renderGroupedSectionOptions(select, groups, { query = "", selectedValue = "" } = {}) {
    const filteredGroups = filterGroupedSections(groups, query);
    const selectedSection = getGroupedSection(groups, selectedValue);
    const selectedInFiltered = filteredGroups.some((group) =>
      group.s.some((section, index) => `${group.g}|${index}` === selectedValue),
    );
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = filteredGroups.length ? "-- 自訂尺寸 --" : "-- 查無符合規格，請改用手動輸入 --";
    select.appendChild(placeholder);
    if (selectedSection && selectedValue && query && !selectedInFiltered) {
      const currentGroup = document.createElement("optgroup");
      currentGroup.label = "目前選擇";
      const option = document.createElement("option");
      option.value = selectedValue;
      option.textContent = selectedSection.n;
      currentGroup.appendChild(option);
      select.appendChild(currentGroup);
    }
    buildGroupedSectionOptions(select, filteredGroups);
    if (selectedValue) select.value = selectedValue;
  }

  function setupFilteredSectionSelect(inputId, selectId, groups) {
    const input = $(inputId);
    const select = $(selectId);
    if (!input || !select) return;
    renderGroupedSectionOptions(select, groups);
    input.addEventListener("input", () => {
      const currentValue = select.value;
      renderGroupedSectionOptions(select, groups, { query: input.value, selectedValue: currentValue });
    });
  }

  function buildSecOptions() {
    buildGroupedSectionOptions($("secSelect"), Steel.H_SECTIONS_MM);
    setupFilteredSectionSelect("shsFilterInput", "shsSelect", Steel.SHS_SECTIONS_MM);
    setupFilteredSectionSelect("rhsFilterInput", "rhsSelect", Steel.RHS_SECTIONS_MM);
    setupFilteredSectionSelect("chsFilterInput", "chsSelect", Steel.CHS_SECTIONS_MM);
  }

  function buildMatOptions() {
    const select = $("matSelect");
    const currentValue = select.value || "0";
    select.innerHTML = "";
    Steel.FY_OPTIONS.forEach((item, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${item.label}｜Fy ${formatDisplayValue(item.Fy, "stress", unitMode === "si" ? 1 : 0) } ${getQuantityUnit("stress")}`;
      select.appendChild(option);
    });
    select.value = currentValue;
  }

  function onSecSelect() {
    if (getSectionType() !== "h") return;
    const section = getGroupedSection(Steel.H_SECTIONS_MM, $("secSelect").value);
    if (!section) return;
    $("inH").value = section.H;
    $("inB").value = section.B;
    $("inTw").value = section.tw;
    $("inTf").value = section.tf;
    $("inR").value = section.R;
  }

  function onShsSelect() {
    if (getSectionType() !== "shs") return;
    const section = getGroupedSection(Steel.SHS_SECTIONS_MM, $("shsSelect").value);
    if (!section) return;
    $("inShsB").value = section.B;
    $("inShsT").value = section.t;
  }

  function onRhsSelect() {
    if (getSectionType() !== "rhs") return;
    const section = getGroupedSection(Steel.RHS_SECTIONS_MM, $("rhsSelect").value);
    if (!section) return;
    $("inRhsH").value = section.H;
    $("inRhsB").value = section.B;
    $("inRhsT").value = section.t;
  }

  function onChsSelect() {
    if (getSectionType() !== "chs") return;
    const section = getGroupedSection(Steel.CHS_SECTIONS_MM, $("chsSelect").value);
    if (!section) return;
    $("inChsD").value = section.D;
    $("inChsT").value = section.t;
  }

  function onMatSelect() {
    const item = Steel.FY_OPTIONS[parseInt($("matSelect").value || "0", 10)];
    if (item) setDisplayFieldValue("inFy", item.Fy, "stress");
  }

  function setMethod(method) {
    designMethod = method;
    const isLRFD = method === "LRFD";
    $("btnLRFD").classList.toggle("active", isLRFD);
    $("btnASD").classList.toggle("active", !isLRFD);
    $("methodBadge").textContent = `鋼構造建築物鋼結構設計技術規範｜鋼梁檢核 (${method})`;
    $("loadTitle").textContent = isLRFD ? "載重 (LRFD)" : "載重 (ASD / 使用荷重)";
    updateUnitLabels();
    persistUiPrefs();
  }

  function updateUnitCard() {
    const isSi = unitMode === "si";
    $("beamUnitModeLegacyBtn").classList.toggle("active", !isSi);
    $("beamUnitModeSiBtn").classList.toggle("active", isSi);
    $("beamUnitModeBadge").textContent = isSi ? "輸入：SI" : "輸入：舊制";
    $("beamUnitIntro").textContent = isSi
      ? "梁正式頁目前採 SI 輸入；斷面尺寸與規格選單固定維持 mm，其他主要欄位可直接輸入 kN / MPa / m。"
      : "梁正式頁目前採舊制輸入；斷面尺寸與規格選單固定維持 mm，其餘欄位採 tf / kgf/cm² / cm。";
    $("beamUnitSectionValue").textContent = "mm";
    $("beamUnitSectionNote").textContent = "規格資料庫與手動斷面尺寸固定使用 mm";
    $("beamUnitLengthValue").textContent = getQuantityUnit("memberLength");
    $("beamUnitLengthNote").textContent = isSi ? "L / Lb / Lv 以 m 輸入" : "L / Lb / Lv 以 cm 輸入";
    $("beamUnitForceValue").textContent = `${getQuantityUnit("force")} / ${getQuantityUnit("moment")}`;
    $("beamUnitForceNote").textContent = isSi ? "Mu、Vu、設計強度與可用容量以 kN / kN·m 顯示" : "Mu、Vu、設計強度與可用容量以 tf / tf·m 顯示";
    $("beamUnitStressValue").textContent = `${getQuantityUnit("stress")} / ${getQuantityUnit("lineLoad")}`;
    $("beamUnitStressNote").textContent = isSi ? "Fy、wD、wL 以 MPa / kN/m 輸入" : "Fy、wD、wL 以 kgf/cm² / kgf/cm 輸入";
    $("beamUnitConversionText").textContent = "1 tf = 9.80665 kN｜1 tf·m = 9.80665 kN·m｜1 kgf/cm² = 0.0980665 MPa｜1 kgf/cm = 0.980665 kN/m｜1 cm = 10 mm";
    $("beamUnitCallout").textContent = isSi
      ? "輸入欄位、摘要卡與匯出報表會跟著切換到 SI；斷面尺寸欄位與規格下拉固定維持 mm，重新開頁會維持上次選擇。"
      : "輸入欄位、摘要卡與匯出報表會跟著切換到舊制；斷面尺寸欄位與規格下拉固定維持 mm，重新開頁會維持上次選擇。";
    $("beamUnitFlowNote").textContent = "計算流程與符號詞典仍沿用核心計算單位 kgf/cm²、tf、cm 顯示代入。";
  }

  function updateUnitLabels() {
    const isLRFD = designMethod === "LRFD";
    $("beamFyLabel").textContent = `Fy (${getQuantityUnit("stress")})`;
    $("beamLLabel").textContent = `跨度 L (${getQuantityUnit("memberLength")})`;
    $("beamLbLabel").textContent = `側撐間距 Lb (${getQuantityUnit("memberLength")})`;
    $("lblMu").textContent = `${isLRFD ? "Mu" : "Ma"} 主軸彎矩 (${getQuantityUnit("moment")})`;
    $("lblVu").textContent = `${isLRFD ? "Vu" : "Va"} 剪力 (${getQuantityUnit("force")})`;
    $("beamLvLabel").textContent = `Lv 圓管剪力長度 (${getQuantityUnit("memberLength")})`;
    $("beamWdLabel").textContent = `wD 靜載重 (${getQuantityUnit("lineLoad")})`;
    $("beamWlLabel").textContent = `wL 活載重 (${getQuantityUnit("lineLoad")})`;
    updateUnitCard();
  }

  function setUnitMode(nextMode, { convertFields = true, previousMode = unitMode, rerun = true, persist = true } = {}) {
    if (!["legacy", "si"].includes(nextMode)) return;
    if (convertFields && previousMode !== nextMode) {
      convertConfiguredFields(previousMode, nextMode);
    }
    unitMode = nextMode;
    buildMatOptions();
    updateUnitLabels();
    if (persist) persistUiPrefs();
    if (rerun) resultState = runCheck();
  }

  function renderProps(sec) {
    const shapeRows = sec.shape === "shs"
      ? `
        <tr><td>外寬 B</td><td>${formatInputValue(sec.B * 10, 1)}</td><td>mm</td></tr>
        <tr><td>名義厚 tnom</td><td>${formatInputValue(sec.tNom * 10, 2)}</td><td>mm</td></tr>
        <tr><td>設計厚 t = 0.93tnom</td><td>${formatInputValue(sec.t * 10, 2)}</td><td>mm</td></tr>
      `
      : sec.shape === "rhs"
        ? `
          <tr><td>外高 H</td><td>${formatInputValue(sec.H * 10, 1)}</td><td>mm</td></tr>
          <tr><td>外寬 B</td><td>${formatInputValue(sec.B * 10, 1)}</td><td>mm</td></tr>
          <tr><td>名義厚 tnom</td><td>${formatInputValue(sec.tNom * 10, 2)}</td><td>mm</td></tr>
          <tr><td>設計厚 t = 0.93tnom</td><td>${formatInputValue(sec.t * 10, 2)}</td><td>mm</td></tr>
        `
      : sec.shape === "chs"
        ? `
          <tr><td>外徑 D</td><td>${formatInputValue(sec.D * 10, 1)}</td><td>mm</td></tr>
          <tr><td>名義厚 tnom</td><td>${formatInputValue(sec.tNom * 10, 2)}</td><td>mm</td></tr>
          <tr><td>設計厚 t = 0.93tnom</td><td>${formatInputValue(sec.t * 10, 2)}</td><td>mm</td></tr>
        `
        : "";
    const stabilityRows = sec.shape === "h"
      ? `
        <tr><td>ry</td><td>${f2(sec.ry)}</td><td>cm</td></tr>
        <tr><td>rts</td><td>${f2(sec.rts)}</td><td>cm</td></tr>
      `
      : `
        <tr><td>ry</td><td>${f2(sec.ry)}</td><td>cm</td></tr>
      `;
    const shearLabel = sec.shape === "chs" ? "Ag" : "Aw";
    const shearValue = sec.shape === "chs" ? sec.A : sec.Aw;
    $("propsTable").innerHTML = `
      <thead><tr><th>項目</th><th>數值</th><th>單位</th></tr></thead>
      <tbody>
        <tr><td>規格</td><td>${sec.name}</td><td>-</td></tr>
        ${shapeRows}
        <tr><td>A</td><td>${f2(sec.A)}</td><td>cm²</td></tr>
        <tr><td>Ix</td><td>${f0(sec.Ix)}</td><td>cm⁴</td></tr>
        <tr><td>Iy</td><td>${f0(sec.Iy)}</td><td>cm⁴</td></tr>
        <tr><td>Sx</td><td>${f1(sec.Sx)}</td><td>cm³</td></tr>
        <tr><td>Zx</td><td>${f1(sec.Zx)}</td><td>cm³</td></tr>
        ${stabilityRows}
        <tr><td>${shearLabel}</td><td>${f2(shearValue)}</td><td>cm²</td></tr>
      </tbody>
    `;
    $("propsCard").style.display = "";
  }

  function renderFillStatus() {
    const groups = [
      { id: "beamFillBasic", fields: ["codeBasisDisplay"] },
      { id: "beamFillSection", fields: getSectionFieldIds() },
      { id: "beamFillMaterial", fields: suppressesBeamLtbInput() ? ["matSelect", "inFy", "inL"] : ["matSelect", "inFy", "inL", "inLb", "inCb"] },
      { id: "beamFillLoad", fields: isRoundHss() ? ["inMu", "inVu", "inLv", "inWD", "inWL", "limL", "limT"] : ["inMu", "inVu", "inWD", "inWL", "limL", "limT"] },
    ];
    groups.forEach((group) => {
      const filled = group.fields.filter(isFilled).length;
      const badge = $(group.id);
      if (badge) badge.textContent = `已填 ${filled}/${group.fields.length}`;
    });
  }

  function setCardMeta(id, tone, text) {
    const node = $(id);
    if (!node) return;
    node.className = `card-header-meta ${tone}`;
    node.textContent = text;
  }

  function setStatusBadge(id, tone, text) {
    const node = $(id);
    if (!node) return;
    node.className = `report-block-status ${tone}`;
    node.textContent = text;
  }

  function pairRow(label, value) {
    return `<tr><td data-label="項目">${label}</td><td data-label="內容">${value}</td></tr>`;
  }

  function getInputCompletion() {
    const fields = [
      ...getSectionFieldIds(),
      "matSelect", "inFy", "inL",
      ...(suppressesBeamLtbInput() ? [] : ["inLb", "inCb"]),
      "inMu", "inVu",
      ...(isRoundHss() ? ["inLv"] : []),
      "inWD", "inWL", "limL", "limT",
    ];
    const filled = fields.filter(isFilled).length;
    return { filled, total: fields.length };
  }

  function renderCardStatuses(result) {
    const sectionFields = getSectionFieldIds();
    const sectionOk = getSectionType() === "h"
      ? ($("secSelect").value || (isFilled("inH") && isFilled("inB") && isFilled("inTw") && isFilled("inTf")))
      : getSectionType() === "shs"
        ? ($("shsSelect").value || (isFilled("inShsB") && isFilled("inShsT")))
        : getSectionType() === "rhs"
          ? ($("rhsSelect").value || (isFilled("inRhsH") && isFilled("inRhsB") && isFilled("inRhsT")))
          : ($("chsSelect").value || (isFilled("inChsD") && isFilled("inChsT")));
    setCardMeta("beamMetaBasic", "neutral", "正式模組");
    setCardMeta(
      "beamMetaSection",
      sectionOk ? "ok" : "warn",
      getSectionMetaText(),
    );
    const materialOk = isFilled("inFy") && isFilled("inL") && (suppressesBeamLtbInput() || (isFilled("inLb") && isFilled("inCb")));
    setCardMeta("beamMetaMaterial", materialOk ? "ok" : "warn", "材料 / 穩定");
    if (!result) {
      setCardMeta("beamMetaLoad", "neutral", "待檢核");
      return;
    }
    const overallOk = result.flexOk && result.shearOk && result.deflStatus !== "fail";
    setCardMeta("beamMetaLoad", overallOk ? "ok" : "warn", overallOk ? "控制穩定" : "需檢視");
  }


  function prepareInputCardAccordions() {
    document.querySelectorAll("#inputColumn .card").forEach((card) => {
      const header = card.querySelector(".member-card-head");
      if (!header || card.querySelector(".card-body")) return;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "card-toggle";
      toggle.textContent = "收合";
      header.appendChild(toggle);
      const body = document.createElement("div");
      body.className = "card-body";
      Array.from(card.children).forEach((child) => {
        if (child !== header) body.appendChild(child);
      });
      card.appendChild(body);
      toggle.addEventListener("click", () => {
        card.classList.toggle("is-collapsed");
        toggle.textContent = card.classList.contains("is-collapsed") ? "展開" : "收合";
      });
    });
  }

  function applyInputAccordionPreset(preset = currentInputPreset) {
    currentInputPreset = preset;
    const activeId = { smart: "beamInputPresetSmart", focus: "beamInputPresetFocus", open: "beamInputPresetOpen" }[preset];
    ["beamInputPresetSmart", "beamInputPresetFocus", "beamInputPresetOpen"].forEach((id) => {
      $(id).classList.toggle("active", id === activeId);
    });
    const narrow = window.innerWidth <= 1024;
    document.querySelectorAll("#inputColumn .card").forEach((card) => {
      const toggle = card.querySelector(".card-toggle");
      if (!toggle) return;
      if (!narrow || preset === "open") {
        card.classList.remove("is-collapsed");
        toggle.textContent = "收合";
        return;
      }
      const shouldCollapse = preset === "focus"
        ? ["beamCardBasic", "beamCardMaterial"].includes(card.id)
        : ["beamCardBasic"].includes(card.id);
      card.classList.toggle("is-collapsed", shouldCollapse);
      toggle.textContent = shouldCollapse ? "展開" : "收合";
    });
    persistUiPrefs();
  }

  function prepareReportBlockAccordions() {
    document.querySelectorAll(".report-paper .report-block").forEach((block) => {
      if (block.querySelector(".report-block-body")) return;
      const title = block.querySelector("h3");
      if (!title) return;
      const head = document.createElement("div");
      head.className = "card-header";
      title.parentNode.insertBefore(head, title);
      head.appendChild(title);
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "report-block-toggle card-toggle";
      toggle.textContent = "收合";
      head.appendChild(toggle);
      const body = document.createElement("div");
      body.className = "report-block-body";
      Array.from(block.children).forEach((child) => {
        if (child !== head) body.appendChild(child);
      });
      block.appendChild(body);
      toggle.addEventListener("click", () => {
        block.classList.toggle("is-collapsed");
        toggle.textContent = block.classList.contains("is-collapsed") ? "展開" : "收合";
      });
    });
  }

  function applyReportAccordionPreset(result, preset = currentReportPreset) {
    currentReportPreset = preset;
    $("beamReportPresetFocus").classList.toggle("active", preset === "focus");
    $("beamReportPresetOpen").classList.toggle("active", preset === "open");
    const narrow = window.innerWidth <= 1024;
    document.querySelectorAll(".report-paper .report-block").forEach((block) => {
      const toggle = block.querySelector(".report-block-toggle");
      if (!toggle) return;
      if (!narrow || preset === "open") {
        block.classList.remove("is-collapsed");
        toggle.textContent = "收合";
        return;
      }
      let shouldCollapse = false;
      if (block.querySelector("#beamInputSummaryBody")) shouldCollapse = true;
      if (block.id === "beamReminderCard") shouldCollapse = !!result && result.flexOk && result.shearOk && result.deflStatus !== "fail";
      block.classList.toggle("is-collapsed", shouldCollapse);
      toggle.textContent = shouldCollapse ? "展開" : "收合";
    });
    persistUiPrefs();
  }

  function getFlowApprovalText() {
    return $("beamShowFlowInReport").checked ? "已核可顯示" : "僅輸出摘要";
  }

  function getSymbolsApprovalText() {
    return $("beamShowSymbolsInReport").checked ? "已核可顯示" : "不顯示符號說明";
  }

  function getNotesApprovalText() {
    return $("beamShowNotesInReport").checked ? "已核可顯示" : "不顯示備註與條文說明";
  }

  function getReportContentSummaryText() {
    const items = [
      $("beamShowFlowInReport").checked ? "計算流程" : null,
      $("beamShowSymbolsInReport").checked ? "符號說明" : null,
      $("beamShowNotesInReport").checked ? "備註與條文說明" : null,
    ].filter(Boolean);
    return items.length ? `摘要 + ${items.join(" + ")}` : "僅輸出摘要與核可結果";
  }

  function getFormalUnitSummaryText() {
    return unitMode === "si"
      ? "輸入採 SI：斷面尺寸 mm；長度 m；力 kN；彎矩 kN·m；應力 MPa；分佈載重 kN/m。"
      : "輸入採舊制：斷面尺寸 mm；長度 cm；力 tf；彎矩 tf·m；應力 kgf/cm²；分佈載重 kgf/cm。";
  }

  function getInternalUnitNoteText() {
    return "計算流程與符號詞典仍沿用核心計算單位 kgf/cm²、tf、cm。";
  }

  function getFormalUnitConversionText() {
    return "換算：1 tf = 9.80665 kN；1 tf·m = 9.80665 kN·m；1 kgf/cm² = 0.0980665 MPa；1 kgf/cm = 0.980665 kN/m；1 cm = 10 mm";
  }

  function getUnitReportHighlights() {
    return [
      {
        label: "輸入模式",
        value: getFormalUnitSummaryText(),
        note: "需求值、摘要卡與檢核結果會依目前模式同步顯示。",
        tone: "accent",
      },
      {
        label: "斷面尺寸",
        value: "固定 mm",
        note: "H / SHS / RHS / CHS 規格下拉與手動尺寸欄位不隨單位模式切換。",
        tone: "info",
      },
      {
        label: "流程顯示",
        value: "核心計算單位",
        note: "計算流程與符號詞典仍沿用 kgf/cm²、tf、cm 顯示代入。",
        tone: "neutral",
      },
    ];
  }

  function parsePercentText(text) {
    if (text === "∞") return Infinity;
    const parsed = parseFloat(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getBeamClauseDisplay(webSection) {
    const map = {
      F2: "F2｜I 形梁結實斷面",
      F3: "F3｜I 形梁非結實翼板",
      F4: "F4｜I 形梁非結實腹板",
      F5: "F5｜I 形梁細長腹板",
      F7: "F7｜閉鎖 HSS 方形／矩形",
      F8: "F8｜閉鎖 HSS 圓管",
    };
    return map[webSection] || String(webSection || "未分類");
  }

  function getBeamGoverningDisplay(governing) {
    const map = {
      Yielding: "降伏控制（Yielding）",
      LTB: "側向扭轉挫屈控制（LTB）",
      FLB: "翼板局部挫屈控制（FLB）",
      WLB: "腹板局部挫屈控制（WLB）",
      OutOfScope: "超出本版適用範圍（OutOfScope）",
    };
    return map[governing] || String(governing || "未分類");
  }

  function getBeamLtbZoneDisplay(ltbZone) {
    const map = {
      plastic: "塑性區",
      inelastic: "非彈性側向扭轉挫屈區",
      elastic: "彈性側向扭轉挫屈區",
      not_applicable: "不適用",
    };
    return map[ltbZone] || String(ltbZone || "未分類");
  }

  function getBeamLocalZoneDisplay(localZone) {
    const map = {
      compact: "結實",
      noncompact: "非結實",
      slender: "細長",
      "noncompact-flange": "翼板非結實",
      "slender-flange": "翼板細長",
      "noncompact-web": "腹板非結實",
      "unsupported-web-slender": "腹板細長，超出本版適用範圍",
      unsupported: "超出本版適用範圍",
      not_applicable: "不適用",
    };
    return map[localZone] || String(localZone || "未分類");
  }

  function getBeamPrimaryIssue(result) {
    if (result.deflStatus === "skipped" && result.flexOk && result.shearOk) {
      return {
        value: "撓度未檢核",
        note: "目前 wD 與 wL 為 0，尚未形成服務性檢核；強度檢核已可先行閱讀。",
        tone: "warn",
      };
    }

    const issues = [];
    if (!result.flexOk) {
      issues.push({
        value: "主軸彎矩超限",
        note: `需求比 ${result.ratioFlex}%；控制模式 ${getBeamGoverningDisplay(result.flex.governing)}。`,
        tone: "fail",
        score: parsePercentText(result.ratioFlex),
      });
    }
    if (!result.shearOk) {
      issues.push({
        value: "剪力超限",
        note: `需求比 ${result.ratioShear}%；請檢視剪力強度與腹板條件。`,
        tone: "fail",
        score: parsePercentText(result.ratioShear),
      });
    }
    if (result.deflStatus === "fail") {
      const liveRatio = result.allowLive > 0 ? result.deflection.deltaL / result.allowLive * 100 : 0;
      const totalRatio = result.allowTotal > 0 ? result.deflection.deltaT / result.allowTotal * 100 : 0;
      issues.push({
        value: "撓度超限",
        note: `ΔL = ${formatDisplayValue(result.deflection.deltaL, "deflection", unitMode === "si" ? 1 : 2)} / ${formatDisplayValue(result.allowLive, "deflection", unitMode === "si" ? 1 : 2)}，ΔT = ${formatDisplayValue(result.deflection.deltaT, "deflection", unitMode === "si" ? 1 : 2)} / ${formatDisplayValue(result.allowTotal, "deflection", unitMode === "si" ? 1 : 2)} ${getQuantityUnit("deflection")}。`,
        tone: "fail",
        score: Math.max(liveRatio, totalRatio),
      });
    }
    if (!issues.length) {
      return {
        value: "目前無 NG",
        note: "彎矩、剪力與撓度均在允許範圍內。",
        tone: "ok",
      };
    }
    return issues.sort((a, b) => b.score - a.score)[0];
  }

  function getBeamCriticalDemandSummary(result) {
    const candidates = [
      { label: "主軸彎矩", score: parsePercentText(result.ratioFlex), note: `需求比 ${result.ratioFlex}%` },
      { label: "剪力", score: parsePercentText(result.ratioShear), note: `需求比 ${result.ratioShear}%` },
    ];
    if (result.deflStatus === "fail") {
      const liveRatio = result.allowLive > 0 ? result.deflection.deltaL / result.allowLive * 100 : 0;
      const totalRatio = result.allowTotal > 0 ? result.deflection.deltaT / result.allowTotal * 100 : 0;
      const score = Math.max(liveRatio, totalRatio);
      candidates.push({
        label: "撓度",
        score,
        note: `控制比 ${Number.isFinite(score) ? f1(score) : "∞"}%`,
      });
    }
    const critical = candidates.sort((a, b) => b.score - a.score)[0];
    const scoreText = Number.isFinite(critical.score) ? `${f1(critical.score)}%` : "∞";
    return {
      value: `${critical.label}｜${scoreText}`,
      note: critical.note,
      tone: critical.score >= 100 ? "fail" : critical.score >= 85 ? "warn" : "ok",
    };
  }

  function getBeamReportSummaryState(result) {
    const issue = getBeamPrimaryIssue(result);
    if (isOverallOk(result)) {
      return {
        ok: true,
        text: `全部通過｜${getBeamGoverningDisplay(result.flex.governing)}・${getBeamClauseDisplay(result.flex.webSection)}`,
      };
    }
    if (issue.value === "撓度未檢核") {
      return {
        ok: null,
        text: `強度通過｜${issue.value}｜${getBeamGoverningDisplay(result.flex.governing)}`,
      };
    }
    return {
      ok: false,
      text: `${issue.value}｜${getBeamGoverningDisplay(result.flex.governing)}・${getBeamClauseDisplay(result.flex.webSection)}`,
    };
  }

  function getBeamReportSummaryFacts(result) {
    const issue = getBeamPrimaryIssue(result);
    const critical = getBeamCriticalDemandSummary(result);
    return [
      {
        label: "控制條文",
        value: getBeamClauseDisplay(result.flex.webSection),
        note: getClauseExplanation(result.flex.webSection),
        tone: "neutral",
      },
      {
        label: "控制模式",
        value: getBeamGoverningDisplay(result.flex.governing),
        note: getGoverningModeExplanation(result.flex.governing, result.flex.ltbZone),
        tone: issue.value === "主軸彎矩超限" ? "fail" : "neutral",
      },
      {
        label: "臨界需求",
        value: critical.value,
        note: critical.note,
        tone: critical.tone,
      },
      {
        label: "主要狀態",
        value: issue.value,
        note: issue.note,
        tone: issue.tone,
      },
    ];
  }

  function getClassificationFlowLines(result) {
    if (result.sec.shape === "shs") {
      return [
        `λ = Bflat/t = (${f1(result.sec.B)} - 3 × ${f2(result.sec.t)}) / ${f2(result.sec.t)} = ${f2(result.cls.lambdaF)}`,
        `翼板 λp = ${f2(result.cls.lpf)}，λr = ${f2(result.cls.lrf)}；分類 = ${getBeamLocalZoneDisplay(result.cls.flange)}`,
      ];
    }
    if (result.sec.shape === "rhs") {
      return [
        `翼板 λf = Bflat/t = (${f1(result.sec.B)} - 3 × ${f2(result.sec.t)}) / ${f2(result.sec.t)} = ${f2(result.cls.lambdaF)}`,
        `腹板 λw = Hflat/t = (${f1(result.sec.H)} - 3 × ${f2(result.sec.t)}) / ${f2(result.sec.t)} = ${f2(result.cls.lambdaW)}`,
        `翼板 λp = ${f2(result.cls.lpf)}，λr = ${f2(result.cls.lrf)}；腹板 λp = ${f2(result.cls.lpw)}，λr = ${f2(result.cls.lrw)}；分類 = 翼板 ${getBeamLocalZoneDisplay(result.cls.flange)}／腹板 ${getBeamLocalZoneDisplay(result.cls.web)}`,
      ];
    }
    if (result.sec.shape === "chs") {
      return [
        `λ = D/t = ${f1(result.sec.D)} / ${f2(result.sec.t)} = ${f2(result.cls.lambdaF)}`,
        `圓管 λp = ${f2(result.cls.lpf)}，λr = ${f2(result.cls.lrf)}，適用上限 = ${f2(result.cls.limit)}；分類 = ${getBeamLocalZoneDisplay(result.cls.flange)}`,
      ];
    }
    return [
      `λf = bf/(2tf) = ${f2(result.cls.lambdaF)}，塑性界限 = ${f2(result.cls.lpf)}，非結實界限 = ${f2(result.cls.lrf)}`,
      `λw = hw/tw = ${f2(result.cls.lambdaW)}，塑性界限 = ${f2(result.cls.lpw)}，非結實界限 = ${f2(result.cls.lrw)}`,
    ];
  }

  function getSectionInputSummaryText(result) {
    if (result.sec.shape === "shs") {
      return `${result.sec.name}｜B = ${formatInputValue(result.sec.B * 10, 1)} mm，tnom = ${formatInputValue(result.sec.tNom * 10, 2)} mm，t = ${formatInputValue(result.sec.t * 10, 2)} mm`;
    }
    if (result.sec.shape === "rhs") {
      return `${result.sec.name}｜H = ${formatInputValue(result.sec.H * 10, 1)} mm，B = ${formatInputValue(result.sec.B * 10, 1)} mm，tnom = ${formatInputValue(result.sec.tNom * 10, 2)} mm，t = ${formatInputValue(result.sec.t * 10, 2)} mm`;
    }
    if (result.sec.shape === "chs") {
      return `${result.sec.name}｜D = ${formatInputValue(result.sec.D * 10, 1)} mm，tnom = ${formatInputValue(result.sec.tNom * 10, 2)} mm，t = ${formatInputValue(result.sec.t * 10, 2)} mm`;
    }
    return result.sec.name;
  }

  function buildReportSteps(result) {
    const strengthMoment = result.isLRFD ? result.flex.phiMn_tfm : result.flex.MnOmega_tfm;
    const strengthShear = result.isLRFD ? result.shear.phiVn_tf : result.shear.VnOmega_tf;
    const flexureFactorLine = result.isLRFD
      ? `φb = ${f2(Steel.PHI.flexure)}，φMn = ${f2(Steel.PHI.flexure)} × ${f2(result.flex.Mn / 1e5)} = ${f2(strengthMoment)} tf·m`
      : `Ωb = ${f2(Steel.OMEGA.flexure)}，Mn/Ωb = ${f2(result.flex.Mn / 1e5)} / ${f2(Steel.OMEGA.flexure)} = ${f2(strengthMoment)} tf·m`;
    const shearFactorLine = result.isLRFD
      ? `φv = ${f2(result.shear.phiV)}，φVn = ${f2(result.shear.phiV)} × ${f2(result.shear.Vn / 1000)} = ${f2(strengthShear)} tf`
      : `Ωv = ${f2(result.shear.omgV)}，Vn/Ωv = ${f2(result.shear.Vn / 1000)} / ${f2(result.shear.omgV)} = ${f2(strengthShear)} tf`;
    const sectionBody = [
      `A = ${f2(result.sec.A)} cm²`,
      `Sx = ${f1(result.sec.Sx)} cm³，Zx = ${f1(result.sec.Zx)} cm³`,
      `ry = ${f2(result.sec.ry)} cm${result.sec.shape === "h" ? `，rts = ${f2(result.sec.rts)} cm` : ""}`,
      ...getClassificationFlowLines(result),
    ];
    const flexureBody = [
      `Mp = Fy × Zx = ${f0(result.Fy)} × ${f1(result.sec.Zx)} = ${f2(result.flex.Mp / 1e5)} tf·m`,
      result.sec.shape === "h" || result.sec.shape === "rhs"
        ? `Lb = ${f1(result.Lb)} cm，Cb = ${f2(result.Cb)}`
        : "閉鎖 HSS 斷面本版不套用 H 型鋼 Lb / Cb 側扭挫屈輸入。",
      result.sec.shape === "h"
        ? `Lp = ${f1(result.flex.Lp)} cm，Lr = ${f1(result.flex.Lr)} cm`
        : result.sec.shape === "rhs"
          ? `Lp = ${f1(result.flex.Lp)} cm，Lr = ${f1(result.flex.Lr)} cm，側向扭轉挫屈區段 = ${getBeamLtbZoneDisplay(result.flex.ltbZone)}；局部挫屈分類 = ${getBeamLocalZoneDisplay(result.flex.localZone)}`
          : `局部挫屈分類 = ${getBeamLocalZoneDisplay(result.flex.localZone)}${result.flex.Fcr ? `，Fcr = ${f0(result.flex.Fcr)} kgf/cm²` : ""}`,
      `Mn = ${f2(result.flex.Mn / 1e5)} tf·m，控制模式 = ${getBeamGoverningDisplay(result.flex.governing)}`,
      flexureFactorLine,
      `${result.isLRFD ? "φMn" : "Mn / Ω"} = ${f2(strengthMoment)} tf·m，需求 = ${f2(result.demandMoment)} tf·m`,
    ];
    const shearBody = result.sec.shape === "chs"
      ? [
          `Ag = ${f2(result.sec.A)} cm²，Lv = ${f1(result.Lv)} cm`,
          `Fcr = min(0.6Fy, max(Fcr,1, Fcr,2)) = ${f0(result.shear.Fcr)} kgf/cm²`,
          `Vn = Fcr × Ag / 2 = ${f0(result.shear.Fcr)} × ${f2(result.sec.A)} / 2`,
          shearFactorLine,
          `${result.isLRFD ? "φVn" : "Vn / Ω"} = ${f2(strengthShear)} tf，需求 = ${f2(result.demandShear)} tf`,
        ]
      : [
          `Aw = ${f2(result.sec.Aw)} cm²`,
          `${result.sec.shape === "shs" ? "Cv2" : "Cv1"} = ${f2(result.shear.Cv2 ?? result.shear.Cv1)}`,
          `Vn = 0.6 × Fy × ${result.sec.shape === "shs" ? "Aw × Cv2" : "Aw × Cv1"} = 0.6 × ${f0(result.Fy)} × ${f2(result.sec.Aw)} × ${f2(result.shear.Cv2 ?? result.shear.Cv1)}`,
          shearFactorLine,
          `${result.isLRFD ? "φVn" : "Vn / Ω"} = ${f2(strengthShear)} tf，需求 = ${f2(result.demandShear)} tf`,
        ];
    return [
      {
        group: "1. 斷面性質與分類",
        body: sectionBody.join("\n"),
      },
      {
        group: "2. 撓曲強度檢核",
        body: flexureBody.join("\n"),
      },
      {
        group: "3. 剪力強度檢核",
        body: shearBody.join("\n"),
      },
      {
        group: "4. 撓度與使用性檢核",
        body: [
          `ΔL = ${f2(result.deflection.deltaL)} cm，容許活載重撓度 = ${f2(result.allowLive)} cm`,
          `ΔT = ${f2(result.deflection.deltaT)} cm，容許總撓度 = ${f2(result.allowTotal)} cm`,
          "撓度限值由設計者依使用性需求輸入；如涉積水載重，應另依規範 11.3 節與附錄 4 檢核。",
        ].join("\n"),
      },
    ];
  }

  function buildReportSymbols(result, { includeFlow = true } = {}) {
    const used = new Set([
      "Fy",
      "Mn",
      result.isLRFD ? "φb" : "Ωb",
      result.sec.shape === "chs" ? "Fcr" : "Aw",
      result.sec.shape === "chs" ? "Lv" : (result.sec.shape === "h" ? "Cv1" : "Cv2"),
      "Vn",
      "φv / Ωv",
      "ΔL",
      "ΔT",
      result.flex.webSection,
      result.flex.governing,
    ]);
    if (includeFlow) {
      ["λf", "λw", "Mp", "Sx / Zx", "ry / rts"].forEach((item) => used.add(item));
      if (result.sec.shape === "h" || result.sec.shape === "rhs") {
        ["Lb", "Cb", "Lp", "Lr"].forEach((item) => used.add(item));
      }
      if (result.sec.shape === "chs") used.add("Lv");
    }
    return glossaryItems.filter((item) => used.has(item[0])).map((item) => ({
      sym: item[0],
      desc: `${item[1]}：${item[3]}${item[5] ? `（${item[5]}）` : ""}`,
    }));
  }

  function buildReportNotes(result) {
    const lengthDigits = unitMode === "si" ? 3 : 1;
    const lengthUnit = getQuantityUnit("memberLength");
    return [
      "規範依據：鋼構造建築物鋼結構設計技術規範總則與極限設計法第七章撓曲構材。",
      `控制條文分類：${getBeamClauseDisplay(result.flex.webSection)}，控制模式：${getBeamGoverningDisplay(result.flex.governing)}。`,
      `控制條文說明：${getClauseExplanation(result.flex.webSection)}`,
      `控制模式說明：${getGoverningModeExplanation(result.flex.governing, result.flex.ltbZone)}`,
      `係數採用：撓曲 ${result.isLRFD ? `φb = ${f2(Steel.PHI.flexure)}` : `Ωb = ${f2(Steel.OMEGA.flexure)}`}；剪力 ${result.isLRFD ? `φv = ${f2(result.shear.phiV)}` : `Ωv = ${f2(result.shear.omgV)}`}。`,
      ...(result.sec.shape === "h" ? [] : [`HSS 斷面採名義厚度輸入、設計壁厚 t = 0.93 tnom；${result.sec.shape === "chs" ? "圓管剪力採 Lv 輸入，若為簡支均佈載重常可取 L/2。" : result.sec.shape === "rhs" ? `矩形管強軸彎曲仍使用 Lb = ${formatDisplayValue(result.Lb, "memberLength", lengthDigits)} ${lengthUnit}、Cb = ${f2(result.Cb)} 評估 F7 側扭挫屈。` : "本版不套用 H 型鋼 Lb / Cb 側扭挫屈輸入。"} `]),
      `輸出報表內容：${getReportContentSummaryText()}`,
      `${result.isLRFD ? "LRFD 以強度折減因數 φ 表示可用強度。" : "ASD 目前以 Mn/Ωb、Vn/Ωv 的等效容量形式呈現；若需完全容許應力法表達，應另以 Fb、Fv 應力格式出具。"} `,
      "撓度限值由設計者依使用性需求輸入；如涉積水載重，應另依規範 11.3 節及附錄 4 檢核。",
    ];
  }

  function getClauseExplanation(webSection) {
    const map = {
      F2: "F2 對應腹板與翼板皆為結實之 I 形梁，通常由降伏或側向扭轉挫屈條文控制。",
      F3: "F3 對應腹板為結實，但翼板為非結實或細長之 I 形梁，除側向扭轉挫屈外亦須留意翼板局部挫屈折減。",
      F4: "F4 對應腹板為非結實之 I 形梁，撓曲強度除降伏與側向扭轉挫屈外，亦受腹板非結實條文控制。",
      F5: "F5 對應腹板為細長之 I 形梁，需依細長腹板條文修正有效強度。",
      F7: "F7 對應方形或矩形閉鎖 HSS；本版 SHS 依閉鎖斷面條文檢核降伏與局部挫屈，RHS 強軸彎曲另以 F7 評估側向扭轉挫屈。",
      F8: "F8 對應圓形閉鎖 HSS；本版圓管依局部挫屈條文檢核降伏與局部挫屈，不套用 H 型鋼側向扭轉挫屈輸入。",
    };
    return map[webSection] || "此條文分類為撓曲構材強度判讀用代號，應回到第七章對應條文確認適用算式。";
  }

  function getGoverningModeExplanation(governing, ltbZone) {
    const map = {
      Yielding: "降伏控制（Yielding）表示本次由斷面降伏或塑性彎矩上限控制，尚未因側向扭轉挫屈或局部挫屈進一步折減。",
      LTB: `側向扭轉挫屈控制（LTB）表示由側向扭轉挫屈控制；目前區段屬 ${getBeamLtbZoneDisplay(ltbZone)}。`,
      FLB: "翼板局部挫屈控制（FLB）表示由翼板局部挫屈控制，應依翼板寬厚比與第七章相應條文檢視強度折減。",
      WLB: "腹板局部挫屈控制（WLB）表示由腹板局部挫屈控制，應依矩形 HSS 腹板寬厚比與第七章 F7 條文檢視強度折減。",
      OutOfScope: "超出本版適用範圍（OutOfScope）表示目前輸入超出本版正式檢核的適用條件，請調整板件比例或改用其他斷面條文檢核。",
    };
    return map[governing] || "此控制模式為撓曲強度控制名稱，請回到第七章對應條文檢視適用條件。";
  }

  function renderReminders(result) {
    const overallOk = isOverallOk(result);
    const reminders = [
      {
        level: overallOk ? "ok" : "info",
        title: "規範檢核摘要",
        body: overallOk
          ? "本次鋼梁於撓曲、剪力與撓度檢核均通過，可作為正式報表預覽基礎。"
          : "本頁已同步提供正式報表預覽、計算流程與控制項目；若有 NG，請優先檢視控制模式與需求比。",
      },
      {
        level: "info",
        title: "控制條文",
        body: `本次撓曲控制模式為 ${getBeamGoverningDisplay(result.flex.governing)}，條文分類為 ${getBeamClauseDisplay(result.flex.webSection)}；主要規範基準為第七章撓曲構材。`,
      },
      ...(result.sec.shape === "h" ? [] : [{
        level: "info",
        title: "HSS 輸入提醒",
        body: result.sec.shape === "chs"
          ? `本次圓管以名義厚度輸入、設計壁厚取 0.93 tnom，剪力長度 Lv = ${f1(result.Lv)} cm。`
          : result.sec.shape === "rhs"
            ? `本次矩形管以名義厚度輸入、設計壁厚取 0.93 tnom，強軸彎曲仍採 Lb = ${f1(result.Lb)} cm、Cb = ${f2(result.Cb)} 評估 F7 側扭挫屈。`
          : "本次方管以名義厚度輸入、設計壁厚取 0.93 tnom，且不套用 H 型鋼 Lb / Cb 側扭挫屈輸入。",
      }]),
    ];
    if (result.cls.flange === "slender" || result.cls.web === "slender") {
      reminders.push({
        level: "warn",
        title: "板件分類提醒",
        body: "目前斷面含細長板件或接近細長邊界，請特別留意局部挫屈對可用強度的影響。",
      });
    }
    if (!result.flexOk) {
      reminders.push({
        level: "fail",
        title: "撓曲強度未通過",
        body: `${designMethod === "LRFD" ? "φMn" : "Mn/Ω"} 小於需求彎矩，需調整斷面、局部板件比例或載重條件，並回到第七章撓曲構材相關條文重新確認。`,
      });
    }
    if (!result.shearOk) {
      reminders.push({
        level: "fail",
        title: "剪力強度未通過",
        body: `${designMethod === "LRFD" ? "φVn" : "Vn/Ω"} 小於需求剪力，請優先檢視${result.sec.shape === "chs" ? "Lv、D/t 與剪力挫屈應力" : "壁厚與剪力折減係數"}，並依第七章剪力條文調整。`,
      });
    }
    if (result.deflStatus === "skipped") {
      reminders.push({
        level: "warn",
        title: "撓度尚未啟動",
        body: "目前使用載重為 0，故撓度僅列為未檢核；若要形成完整服務性報表，請輸入 wD 與 wL。",
      });
    } else if (result.deflStatus === "fail") {
      reminders.push({
        level: "fail",
        title: "撓度未通過",
        body: "活載重撓度或總撓度已超過限值；本頁撓度限值屬使用性控制，請依專案需求、建築功能與相關規範條件重新確認。",
      });
    }
    $("beamReminderList").innerHTML = reminders.map((item) => `
      <div class="member-reminder ${item.level}">
        <strong>${item.title}</strong>
        <p>${item.body}</p>
      </div>
    `).join("");
    return reminders;
  }

  function renderBlockBadges(result, reminders) {
    const overallOk = isOverallOk(result);
    const completion = getInputCompletion();
    const failCount = reminders.filter((item) => item.level === "fail").length;
    const warnCount = reminders.filter((item) => item.level === "warn" || item.level === "info").length;
    const usedSymbolsCount = $("beamShowSymbolsInReport").checked ? buildReportSymbols(result, { includeFlow: $("beamShowFlowInReport").checked }).length : 0;
    const notesCount = $("beamShowNotesInReport").checked ? buildReportNotes(result).length : 0;
    setStatusBadge("beamReviewBadge", overallOk ? "ok" : "fail", overallOk ? "OK" : "需檢視");
    setStatusBadge("beamInputBadge", completion.filled === completion.total ? "ok" : "warn", `已填 ${completion.filled}/${completion.total}`);
    setStatusBadge("beamOutputBadge", $("beamShowFlowInReport").checked || $("beamShowSymbolsInReport").checked || $("beamShowNotesInReport").checked ? "neutral" : "warn", `${[$("beamShowFlowInReport").checked, $("beamShowSymbolsInReport").checked, $("beamShowNotesInReport").checked].filter(Boolean).length}/3 已啟用`);
    setStatusBadge("beamReminderBadge", failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "ok", failCount > 0 ? `NG ${failCount}` : warnCount > 0 ? `提醒 ${warnCount}` : "已整理");
    setStatusBadge("beamClauseBadge", "neutral", $("beamShowNotesInReport").checked ? `${notesCount} 則說明` : "說明隱藏");
    setStatusBadge("beamFlexBadge", result.flexOk ? "ok" : "fail", result.flexOk ? "OK" : "NG");
    setStatusBadge("beamShearBadge", result.shearOk ? "ok" : "fail", result.shearOk ? "OK" : "NG");
    setStatusBadge("beamDeflBadge", result.deflStatus === "ok" ? "ok" : result.deflStatus === "fail" ? "fail" : "warn", result.deflStatus === "ok" ? "OK" : result.deflStatus === "fail" ? "NG" : "未檢核");
    setStatusBadge("beamApprovalBadge", overallOk ? "ok" : "fail", `${overallOk ? "可核可" : "需修正"}｜符號 ${usedSymbolsCount}`);
  }

  function renderClauseNotes(result) {
    const items = [
      {
        level: "info",
        title: `控制條文分類｜${getBeamClauseDisplay(result.flex.webSection)}`,
        body: getClauseExplanation(result.flex.webSection),
      },
      {
        level: "info",
        title: `控制模式｜${getBeamGoverningDisplay(result.flex.governing)}`,
        body: getGoverningModeExplanation(result.flex.governing, result.flex.ltbZone),
      },
      {
        level: "warn",
        title: "符號與代號檢核",
        body: result.sec.shape === "h"
          ? "本頁涉及之 F2/F3/F4/F5、側向扭轉挫屈（LTB）、翼板局部挫屈（FLB）、Lp、Lr、Cb、rts、Cv1 等符號與專有名詞，已同步納入參數詞典；輸出報表時亦會帶入符號說明。"
          : "本頁已將閉鎖 HSS 常用之 F7/F8、側向扭轉挫屈（LTB）、翼板局部挫屈（FLB）、腹板局部挫屈（WLB）、Lv、Fcr 等符號與說明同步納入詞典與輸出報表。",
      },
    ];
    $("beamClauseNotes").innerHTML = items.map((item) => `
      <div class="member-reminder ${item.level}">
        <strong>${item.title}</strong>
        <p>${item.body}</p>
      </div>
    `).join("");
  }

  function renderMeta(result) {
    $("beamMetaProjectName").textContent = $("projName").value.trim() || "—";
    $("beamMetaProjectNo").textContent = $("projNo").value.trim() || "—";
    $("beamMetaDesigner").textContent = $("projDesigner").value.trim() || "—";
    $("beamReportTimestamp").textContent = new Intl.DateTimeFormat("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
    $("beamReportSubtitle").textContent = `Steel Beam Formal Report (${designMethod}｜${getCurrentInputModeLabel()})`;
    $("beamReportTitle").textContent = `鋼梁正式規範核算計算書｜${designMethod}`;
    $("beamGoverningMode").textContent = getBeamGoverningDisplay(result.flex.governing);
  }

  function renderReviewBrief(result) {
    const overallOk = isOverallOk(result);
    $("beamReviewBriefBody").innerHTML = `
      ${pairRow("規範基準", "鋼構造建築物鋼結構設計技術規範｜第七章撓曲構材")}
      ${pairRow("單位系統", getFormalUnitSummaryText())}
      ${pairRow("換算對照", getFormalUnitConversionText())}
      ${pairRow("流程顯示", getInternalUnitNoteText())}
      ${pairRow("設計方法", designMethod)}
      ${pairRow("控制模式", getBeamGoverningDisplay(result.flex.governing))}
      ${pairRow("控制條文分類", getBeamClauseDisplay(result.flex.webSection))}
      ${pairRow("輸出報表流程", getFlowApprovalText())}
      ${pairRow("符號說明", getSymbolsApprovalText())}
      ${pairRow("備註與條文說明", getNotesApprovalText())}
      ${pairRow("預計輸出符號", `${$("beamShowSymbolsInReport").checked ? buildReportSymbols(result, { includeFlow: $("beamShowFlowInReport").checked }).length : 0} 項`)}
      ${pairRow("預計輸出備註", `${$("beamShowNotesInReport").checked ? buildReportNotes(result).length : 0} 則`)}
      ${pairRow("整體判定", overallOk ? "全部通過" : "部分不通過，請檢視撓曲、剪力或撓度控制項目")}
    `;
  }

  function renderInputSummary(result) {
    const spanAndStability = result.sec.shape === "h"
      ? `L = ${formatDisplayValue(result.L, "memberLength", unitMode === "si" ? 3 : 1)} ${getQuantityUnit("memberLength")}，Lb = ${formatDisplayValue(result.Lb, "memberLength", unitMode === "si" ? 3 : 1)} ${getQuantityUnit("memberLength")}，Cb = ${f2(result.Cb)}`
      : result.sec.shape === "rhs"
        ? `L = ${formatDisplayValue(result.L, "memberLength", unitMode === "si" ? 3 : 1)} ${getQuantityUnit("memberLength")}，Lb = ${formatDisplayValue(result.Lb, "memberLength", unitMode === "si" ? 3 : 1)} ${getQuantityUnit("memberLength")}，Cb = ${f2(result.Cb)}`
      : result.sec.shape === "chs"
        ? `L = ${formatDisplayValue(result.L, "memberLength", unitMode === "si" ? 3 : 1)} ${getQuantityUnit("memberLength")}，Lv = ${formatDisplayValue(result.Lv, "memberLength", unitMode === "si" ? 3 : 1)} ${getQuantityUnit("memberLength")}`
        : `L = ${formatDisplayValue(result.L, "memberLength", unitMode === "si" ? 3 : 1)} ${getQuantityUnit("memberLength")}｜閉鎖 HSS 不啟用 Lb / Cb`;
    $("beamInputSummaryBody").innerHTML = `
      ${pairRow("斷面規格", getSectionInputSummaryText(result))}
      ${pairRow("材料強度 Fy", `${formatDisplayValue(result.Fy, "stress", unitMode === "si" ? 1 : 0)} ${getQuantityUnit("stress")}`)}
      ${pairRow("單位系統", getFormalUnitSummaryText())}
      ${pairRow("跨度 / 穩定參數", spanAndStability)}
      ${pairRow("設計需求", `${designMethod === "LRFD" ? "Mu" : "Ma"} = ${formatDisplayValue(result.demandMoment, "moment", 2)} ${getQuantityUnit("moment")}，${designMethod === "LRFD" ? "Vu" : "Va"} = ${formatDisplayValue(result.demandShear, "force", 2)} ${getQuantityUnit("force")}`)}
      ${pairRow("使用載重", `wD = ${formatDisplayValue(getLegacyInputValue("inWD"), "lineLoad", unitMode === "si" ? 3 : 2)} ${getQuantityUnit("lineLoad")}，wL = ${formatDisplayValue(getLegacyInputValue("inWL"), "lineLoad", unitMode === "si" ? 3 : 2)} ${getQuantityUnit("lineLoad")}`)}
      ${pairRow("撓度限值", `活載重 L/${$("limL").value}，總撓度 L/${$("limT").value}`)}
      ${pairRow("輸出報表內容", getReportContentSummaryText())}
    `;
  }

  function renderOutputSummary(result) {
    const flowCount = $("beamShowFlowInReport").checked ? buildReportSteps(result).length : 0;
    const symbolsCount = $("beamShowSymbolsInReport").checked
      ? buildReportSymbols(result, { includeFlow: $("beamShowFlowInReport").checked }).length
      : 0;
    const notesCount = $("beamShowNotesInReport").checked ? buildReportNotes(result).length : 0;
    $("beamOutputSummaryBody").innerHTML = `
      ${pairRow("計算流程", `${getFlowApprovalText()}｜${flowCount} 式`)}
      ${pairRow("符號說明", `${getSymbolsApprovalText()}｜${symbolsCount} 項`)}
      ${pairRow("備註與條文說明", `${getNotesApprovalText()}｜${notesCount} 則`)}
      ${pairRow("輸出摘要", getReportContentSummaryText())}
    `;
  }

  function renderApproval(result) {
    const overallOk = isOverallOk(result);
    $("beamApprovalStamp").textContent = overallOk ? "通過" : "需調整";
    $("beamApprovalDecision").textContent = overallOk ? "可核可" : "需修正";
    $("beamApprovalGoverning").textContent = getBeamGoverningDisplay(result.flex.governing);
    $("beamApprovalFlow").textContent = `${getFlowApprovalText()}｜${getSymbolsApprovalText()}｜${getNotesApprovalText()}`;
    $("beamOverallMessage").textContent = overallOk
      ? "鋼梁正式檢核已完成，右側可直接作為審查版預覽。"
      : "目前至少一項控制條件未通過；請先依審查摘要與提醒區調整撓曲、剪力或撓度條件。";
  }

  function renderHealthBar(result) {
    const chips = [
      { label: "正式核算", value: designMethod, tone: "neutral" },
      { label: "撓曲強度", value: result.flexOk ? "OK" : "NG", tone: result.flexOk ? "ok" : "fail" },
      { label: "剪力強度", value: result.shearOk ? "OK" : "NG", tone: result.shearOk ? "ok" : "fail" },
      {
        label: "撓度",
        value: result.deflStatus === "ok" ? "OK" : result.deflStatus === "fail" ? "NG" : "未檢核",
        tone: result.deflStatus === "ok" ? "ok" : result.deflStatus === "fail" ? "fail" : "warn",
      },
      { label: "控制模式", value: getBeamGoverningDisplay(result.flex.governing), tone: "neutral" },
      {
        label: "輸出內容",
        value: `符號 ${$("beamShowSymbolsInReport").checked ? buildReportSymbols(result, { includeFlow: $("beamShowFlowInReport").checked }).length : 0} / 備註 ${$("beamShowNotesInReport").checked ? buildReportNotes(result).length : 0}`,
        tone: "neutral",
      },
    ];
    $("beamHealthBar").innerHTML = chips.map((chip) => `
      <div class="health-chip ${chip.tone}">
        <span class="health-chip__label">${chip.label}</span>
        <span class="health-chip__value">${chip.value}</span>
      </div>
    `).join("");
  }

  function updateSectionTabSummary(result) {
    const reportBadge = $("beamTabReportBadge");
    const flowBadge = $("beamTabFlowBadge");
    const glossaryBadge = $("beamTabGlossaryBadge");
    const failCount = [result.flexOk, result.shearOk, result.deflStatus !== "fail"].filter((item) => item === false).length;
    const usedSymbolsCount = $("beamShowSymbolsInReport").checked ? buildReportSymbols(result, { includeFlow: $("beamShowFlowInReport").checked }).length : 0;
    const flowCount = $("beamShowFlowInReport").checked ? buildReportSteps(result).length : 0;
    reportBadge.textContent = failCount > 0 ? `NG ${failCount}` : "OK";
    reportBadge.className = `section-tab-badge ${failCount > 0 ? "fail" : "ok"}`;
    flowBadge.textContent = $("beamShowFlowInReport").checked ? `${flowCount} 式` : "流程隱藏";
    flowBadge.className = "section-tab-badge neutral";
    glossaryBadge.textContent = $("beamShowSymbolsInReport").checked ? `${usedSymbolsCount} 項` : "符號隱藏";
    glossaryBadge.className = "section-tab-badge neutral";
  }

  function flashBlock(block) {
    if (!block) return;
    block.classList.remove("is-flashed");
    void block.offsetWidth;
    block.classList.add("is-flashed");
    window.setTimeout(() => block.classList.remove("is-flashed"), 1800);
  }

  function ensureReportBlockExpanded(block) {
    if (!block) return;
    if (block.classList.contains("is-collapsed")) {
      block.classList.remove("is-collapsed");
      const toggle = block.querySelector(".report-block-toggle");
      if (toggle) toggle.textContent = "收合";
    }
  }

  function updateJumpbarActive(target) {
    $("beamJumpGoverningBtn").classList.toggle("active", target === "governing");
    $("beamJumpFirstNgBtn").classList.toggle("active", target === "firstNg");
    $("beamJumpAlertsBtn").classList.toggle("active", target === "alerts");
  }

  function scrollToBlock(block) {
    if (!block) return;
    activatePanel("report");
    ensureReportBlockExpanded(block);
    block.scrollIntoView({ behavior: "smooth", block: "start" });
    flashBlock(block);
    requestReportJumpSync();
  }

  function updateQuickNavActive(target) {
    $("beamQuickInputBtn").classList.toggle("active", target === "input");
    $("beamQuickReportBtn").classList.toggle("active", target === "report");
    $("beamQuickFlowBtn").classList.toggle("active", target === "flow");
  }

  function syncQuickNavState() {
    quickNavTicking = false;
    const inputTop = $("inputColumn").getBoundingClientRect().top;
    const flowTop = $("panel-flow").getBoundingClientRect().top;
    const reportTop = $("reportColumn").getBoundingClientRect().top;
    const isFlowActive = document.querySelector('[data-panel="flow"]')?.classList.contains("active");
    if (window.scrollY > 240) {
      $("beamMobileFab").classList.add("is-visible");
    } else {
      $("beamMobileFab").classList.remove("is-visible");
    }
    if (isFlowActive || flowTop < 220) {
      updateQuickNavActive("flow");
      return;
    }
    if (reportTop < 220 && inputTop > -120) {
      updateQuickNavActive("report");
      return;
    }
    updateQuickNavActive("input");
  }

  function requestQuickNavSync() {
    if (quickNavTicking) return;
    quickNavTicking = true;
    window.requestAnimationFrame(syncQuickNavState);
  }

  function getGoverningTarget() {
    return !resultState?.flexOk ? $("flexCard") : !resultState?.shearOk ? $("shearCard") : $("deflCard");
  }

  function getFirstNgTarget() {
    return !resultState?.flexOk ? $("flexCard")
      : !resultState?.shearOk ? $("shearCard")
        : resultState?.deflStatus === "fail" ? $("deflCard")
          : $("beamReminderCard");
  }

  function syncReportJumpState() {
    reportJumpTicking = false;
    const reportPanelActive = document.querySelector('[data-panel="report"]')?.classList.contains("active");
    if (!reportPanelActive) {
      updateJumpbarActive(null);
      return;
    }
    const candidates = [
      { key: "firstNg", block: getFirstNgTarget() },
      { key: "governing", block: getGoverningTarget() },
      { key: "alerts", block: $("beamReminderCard") },
    ].filter((item) => item.block && item.block.offsetParent !== null);
    let best = null;
    for (const item of candidates) {
      const rect = item.block.getBoundingClientRect();
      const score = Math.abs(rect.top - 220);
      if (!best || score < best.score) best = { key: item.key, score };
    }
    updateJumpbarActive(best?.key || null);
  }

  function requestReportJumpSync() {
    if (reportJumpTicking) return;
    reportJumpTicking = true;
    window.requestAnimationFrame(syncReportJumpState);
  }

  function updateJumpButtons(result) {
    const ngCount = [!result.flexOk, !result.shearOk, result.deflStatus === "fail"].filter(Boolean).length;
    const alertCount = Array.from(document.querySelectorAll("#beamReminderList .member-reminder")).length;
    $("beamJumpGoverningBtn").disabled = false;
    $("beamJumpAlertsBtn").disabled = false;
    $("beamJumpFirstNgBtn").disabled = ngCount === 0;
    $("beamJumpGoverningBtn").textContent = "控制檢核";
    $("beamJumpFirstNgBtn").textContent = ngCount > 0 ? `首個 NG (${ngCount})` : "首個 NG";
    $("beamJumpAlertsBtn").textContent = alertCount > 0 ? `限制條件 (${alertCount})` : "限制條件";
  }

  function renderSummary(result) {
    const overallOk = isOverallOk(result);
    $("beamSummaryBanner").className = `member-banner ${overallOk ? "ok" : (result.deflStatus === "skipped" && result.flexOk && result.shearOk ? "warn" : "fail")}`;
    $("beamSummaryBanner").textContent = overallOk
      ? "全部通過｜鋼梁斷面目前符合檢核條件"
      : (result.deflStatus === "skipped" && result.flexOk && result.shearOk ? "強度通過｜目前未執行撓度檢核" : "部分不通過｜請檢視控制項目");
    $("beamSummaryGrid").innerHTML = `
      <div class="member-summary-card"><span class="label">設計方法</span><span class="value">${designMethod}</span></div>
      <div class="member-summary-card"><span class="label">控制條文</span><span class="value">${getBeamClauseDisplay(result.flex.webSection)}</span></div>
      <div class="member-summary-card"><span class="label">控制模式</span><span class="value">${getBeamGoverningDisplay(result.flex.governing)}</span></div>
      <div class="member-summary-card"><span class="label">彎矩需求比</span><span class="value">${result.ratioFlex}%</span></div>
      <div class="member-summary-card"><span class="label">剪力需求比</span><span class="value">${result.ratioShear}%</span></div>
      <div class="member-summary-card"><span class="label">撓度狀態</span><span class="value">${result.deflStatus === "ok" ? "OK" : result.deflStatus === "fail" ? "NG" : "未檢核"}</span></div>
    `;
    $("reportStatus").textContent = overallOk ? "最新檢核：全部通過" : "最新檢核：請查看控制項目";
      renderMeta(result);
      renderReviewBrief(result);
      renderClauseNotes(result);
      renderInputSummary(result);
      renderOutputSummary(result);
      renderApproval(result);
      renderHealthBar(result);
    updateSectionTabSummary(result);
    updateJumpButtons(result);
    const reminders = renderReminders(result);
    renderBlockBadges(result, reminders);
    renderCardStatuses(result);
    applyReportAccordionPreset(result, currentReportPreset);
    requestReportJumpSync();
  }

  function renderFlow(result) {
    $("beamFlowBody").innerHTML = buildReportSteps(result).map((step) => `
      <div class="step-card">
        <h4>${step.group}</h4>
        ${step.body.split("\n").map((line) => `<div class="formula">${line}</div>`).join("")}
      </div>
    `).join("");
  }

  function runCheck() {
    renderFillStatus();
    const sectionType = getSectionType();
    const Fy = getLegacyInputValue("inFy", "stress");
    const L = getLegacyInputValue("inL", "memberLength");
    const isLRFD = designMethod === "LRFD";
    const demandMoment = Math.abs(getLegacyInputValue("inMu", "moment"));
    const demandShear = Math.abs(getLegacyInputValue("inVu", "force"));
    const loadDead = getLegacyInputValue("inWD", "lineLoad");
    const loadLive = getLegacyInputValue("inWL", "lineLoad");
    let sec;
    let cls;
    let flex;
    let shear;

    if (sectionType === "h") {
      const mm = { n: "自訂", H: num("inH"), B: num("inB"), tw: num("inTw"), tf: num("inTf"), R: num("inR") };
      const selected = getGroupedSection(Steel.H_SECTIONS_MM, $("secSelect").value);
      if (selected) mm.n = selected.n;
      if (!mm.H || !mm.B || !mm.tw || !mm.tf || mm.tf * 2 >= mm.H) {
        alert("請確認 H 型鋼尺寸輸入完整且合理。");
        return null;
      }
      sec = Steel.calcProps(mm);
      sec.shape = "h";
      cls = Steel.classify(sec, Fy);
      flex = Steel.calcMn(sec, Fy, getLegacyInputValue("inLb", "memberLength"), num("inCb") || 1.0);
      shear = Steel.calcVn(sec, Fy);
    } else if (sectionType === "shs") {
      const Bmm = num("inShsB");
      const tmm = num("inShsT");
      const selected = getGroupedSection(Steel.SHS_SECTIONS_MM, $("shsSelect").value);
      sec = Steel.calcSquareHssProps({ n: selected?.n || `SHS ${f0(Bmm)}×${f0(Bmm)}×${f1(tmm)}`, B: Bmm, t: tmm });
      if (!sec) {
        alert("請確認方管尺寸輸入完整且合理。");
        return null;
      }
      cls = Steel.classifySquareHssFlexure(sec, Fy);
      flex = Steel.calcMnSquareHss(sec, Fy);
      shear = Steel.calcSquareHssShear(sec, Fy);
    } else if (sectionType === "rhs") {
      const Hmm = num("inRhsH");
      const Bmm = num("inRhsB");
      const tmm = num("inRhsT");
      const selected = getGroupedSection(Steel.RHS_SECTIONS_MM, $("rhsSelect").value);
      if (Hmm < Bmm) {
        alert("矩形管請以 H ≥ B 輸入，讓本頁主軸彎曲對應強軸。");
        return null;
      }
      sec = Steel.calcRectHssProps({ n: selected?.n || `RHS ${f0(Hmm)}×${f0(Bmm)}×${f1(tmm)}`, H: Hmm, B: Bmm, t: tmm });
      if (!sec) {
        alert("請確認矩形管尺寸輸入完整且合理。");
        return null;
      }
      cls = Steel.classifyRectHssFlexure(sec, Fy, "x");
      flex = Steel.calcMnRectHss(sec, Fy, "x", getLegacyInputValue("inLb", "memberLength"), num("inCb") || 1.0);
      if (flex.outOfScope || cls.web === "slender") {
        alert("目前矩形管梁正式檢核不支援腹板細長 RHS；請調整 H/t、B/t 或改用其他條文檢核。");
        return null;
      }
      shear = Steel.calcRectHssShear(sec, Fy, "x");
    } else {
      const Dmm = num("inChsD");
      const tmm = num("inChsT");
      const selected = getGroupedSection(Steel.CHS_SECTIONS_MM, $("chsSelect").value);
      sec = Steel.calcRoundHssProps({ n: selected?.n || `CHS ${f1(Dmm)}×${f1(tmm)}`, D: Dmm, t: tmm });
      if (!sec) {
        alert("請確認圓管尺寸輸入完整且合理。");
        return null;
      }
      cls = Steel.classifyRoundHssFlexure(sec, Fy);
      flex = Steel.calcMnRoundHss(sec, Fy);
      if (flex.outOfScope || cls.outOfScope) {
        alert("目前圓管梁正式檢核僅支援 D/t < 0.45E/Fy 的適用範圍；請調整 D/t 或改用其他條文檢核。");
        return null;
      }
      shear = Steel.calcRoundHssShear(sec, Fy, getLegacyInputValue("inLv", "memberLength") || L / 2);
    }

    const usesLtbInput = sectionType === "h" || sectionType === "rhs";
    const Lb = usesLtbInput ? getLegacyInputValue("inLb", "memberLength") : 0;
    const Cb = usesLtbInput ? (num("inCb") || 1.0) : 1.0;
    const Lv = sectionType === "chs" ? (getLegacyInputValue("inLv", "memberLength") || L / 2) : 0;
    const strengthMoment = isLRFD ? flex.phiMn_tfm : flex.MnOmega_tfm;
    const strengthShear = isLRFD ? shear.phiVn_tf : shear.VnOmega_tf;
    const flexOk = strengthMoment >= demandMoment;
    const shearOk = strengthShear >= demandShear;
    const ratioFlex = strengthMoment > 0 ? f1(demandMoment / strengthMoment * 100) : "∞";
    const ratioShear = strengthShear > 0 ? f1(demandShear / strengthShear * 100) : "∞";
    const deflection = Steel.calcDeflection(sec, loadDead, loadLive, L);
    const limitLive = parseInt($("limL").value, 10);
    const limitTotal = parseInt($("limT").value, 10);
    const allowLive = L / limitLive;
    const allowTotal = L / limitTotal;
    let deflStatus = "skipped";
    if (loadDead > 0 || loadLive > 0) {
      deflStatus = deflection.deltaL <= allowLive && deflection.deltaT <= allowTotal ? "ok" : "fail";
    }

    const clsCards = sec.shape === "h"
      ? `
        <div class="result-item ${cls.flange === "slender" ? "fail" : "ok"}"><span class="label">翼板分類</span><span class="value">${getBeamLocalZoneDisplay(cls.flange)}</span></div>
        <div class="result-item ${cls.web === "slender" ? "fail" : "ok"}"><span class="label">腹板分類</span><span class="value">${getBeamLocalZoneDisplay(cls.web)}</span></div>
      `
      : sec.shape === "rhs"
        ? `
          <div class="result-item ${(cls.flange === "slender" || cls.web === "slender") ? "fail" : "ok"}"><span class="label">壁厚分類</span><span class="value">${getBeamLocalZoneDisplay(cls.flange)}／${getBeamLocalZoneDisplay(cls.web)}</span></div>
          <div class="result-item"><span class="label">Bflat / t</span><span class="value">${f2(cls.lambdaF)}</span></div>
          <div class="result-item"><span class="label">Hflat / t</span><span class="value">${f2(cls.lambdaW)}</span></div>
        `
      : sec.shape === "shs"
        ? `
          <div class="result-item ${cls.flange === "slender" ? "fail" : "ok"}"><span class="label">壁厚分類</span><span class="value">${getBeamLocalZoneDisplay(cls.flange)}</span></div>
          <div class="result-item"><span class="label">Bflat / t</span><span class="value">${f2(cls.lambdaF)}</span></div>
        `
        : `
          <div class="result-item ${cls.flange === "slender" ? "warn" : "ok"}"><span class="label">壁厚分類</span><span class="value">${getBeamLocalZoneDisplay(cls.flange)}</span></div>
          <div class="result-item"><span class="label">D / t</span><span class="value">${f2(cls.lambdaF)}</span></div>
        `;
    const flexDetails = sec.shape === "h"
      ? `
        <div class="result-item"><span class="label">控制模式</span><span class="value">${getBeamGoverningDisplay(flex.governing)}</span></div>
        <div class="result-item"><span class="label">條文分類</span><span class="value">${getBeamClauseDisplay(flex.webSection)}</span></div>
      `
      : sec.shape === "rhs"
        ? `
          <div class="result-item"><span class="label">控制模式</span><span class="value">${getBeamGoverningDisplay(flex.governing)}</span></div>
          <div class="result-item"><span class="label">條文分類</span><span class="value">${getBeamClauseDisplay(flex.webSection)}</span></div>
          <div class="result-item"><span class="label">側向扭轉挫屈區段</span><span class="value">${getBeamLtbZoneDisplay(flex.ltbZone)}</span></div>
          <div class="result-item"><span class="label">局部挫屈區</span><span class="value">${getBeamLocalZoneDisplay(flex.localZone)}</span></div>
        `
      : `
        <div class="result-item"><span class="label">控制模式</span><span class="value">${getBeamGoverningDisplay(flex.governing)}</span></div>
        <div class="result-item"><span class="label">條文分類</span><span class="value">${getBeamClauseDisplay(flex.webSection)}</span></div>
        <div class="result-item"><span class="label">局部挫屈區</span><span class="value">${getBeamLocalZoneDisplay(flex.localZone)}</span></div>
      `;
    const shearDetails = sec.shape === "chs"
      ? `
        <div class="result-item"><span class="label">Lv</span><span class="value">${formatDisplayValue(Lv, "memberLength", unitMode === "si" ? 3 : 1)} ${getQuantityUnit("memberLength")}</span></div>
        <div class="result-item"><span class="label">Fcr</span><span class="value">${formatDisplayValue(shear.Fcr, "stress", unitMode === "si" ? 1 : 0)} ${getQuantityUnit("stress")}</span></div>
      `
      : `
        <div class="result-item"><span class="label">${sec.shape === "shs" ? "Cv2" : "Cv1"}</span><span class="value">${f2(shear.Cv2 ?? shear.Cv1)}</span></div>
      `;
    renderProps(sec);
    $("clsResult").innerHTML = clsCards;
    $("clsCard").style.display = "";
    $("flexResult").innerHTML = `
      <div class="result-item ${flexOk ? "ok" : "fail"}"><span class="label">${isLRFD ? "φMn" : "Mn/Ω"} vs |${isLRFD ? "Mu" : "Ma"}|</span><span class="value">${formatDisplayValue(strengthMoment, "moment", 2)} / ${formatDisplayValue(demandMoment, "moment", 2)} ${getQuantityUnit("moment")}</span></div>
      ${flexDetails}
    `;
    $("flexCard").style.display = "";
    $("shearResult").innerHTML = `
      <div class="result-item ${shearOk ? "ok" : "fail"}"><span class="label">${isLRFD ? "φVn" : "Vn/Ω"} vs |${isLRFD ? "Vu" : "Va"}|</span><span class="value">${formatDisplayValue(strengthShear, "force", 2)} / ${formatDisplayValue(demandShear, "force", 2)} ${getQuantityUnit("force")}</span></div>
      ${shearDetails}
    `;
    $("shearCard").style.display = "";
    $("deflResult").innerHTML = `
      <div class="result-item ${deflStatus === "ok" ? "ok" : deflStatus === "fail" ? "fail" : "warn"}"><span class="label">撓度狀態</span><span class="value">${deflStatus === "ok" ? "OK" : deflStatus === "fail" ? "NG" : "未檢核"}</span></div>
      <div class="result-item"><span class="label">ΔL / 容許值</span><span class="value">${formatDisplayValue(deflection.deltaL, "deflection", unitMode === "si" ? 1 : 2)} / ${formatDisplayValue(allowLive, "deflection", unitMode === "si" ? 1 : 2)} ${getQuantityUnit("deflection")}</span></div>
      <div class="result-item"><span class="label">ΔT / 容許值</span><span class="value">${formatDisplayValue(deflection.deltaT, "deflection", unitMode === "si" ? 1 : 2)} / ${formatDisplayValue(allowTotal, "deflection", unitMode === "si" ? 1 : 2)} ${getQuantityUnit("deflection")}</span></div>
    `;
    $("deflCard").style.display = "";
    $("summaryResult").innerHTML = `<div class="member-note">${isOverallOk({ flexOk, shearOk, deflStatus }) ? "本次鋼梁斷面於主軸彎矩、剪力與撓度檢核均通過。" : "本次鋼梁斷面至少有一項控制條件未通過，請優先檢視控制模式、剪力條件與撓度條件。"}</div>`;
    $("summaryCard").style.display = "";

    const result = { sectionType, sec, cls, flex, shear, deflection, Fy, Lb, Cb, L, Lv, isLRFD, flexOk, shearOk, ratioFlex, ratioShear, deflStatus, allowLive, allowTotal, demandMoment, demandShear };
    renderSummary(result);
    renderFlow(result);
    resultState = result;
    return result;
  }

  function buildReport() {
    const result = runCheck();
    if (!result) return;
    const includeFlow = $("beamShowFlowInReport").checked;
    const includeSymbols = $("beamShowSymbolsInReport").checked;
    const includeNotes = $("beamShowNotesInReport").checked;
    const reportNotes = buildReportNotes(result);
    const summaryState = getBeamReportSummaryState(result);
    openReport({
      title: "鋼梁正式規範核算計算書",
      subtitle: `Steel Beam Formal Report (${designMethod}｜${getCurrentInputModeLabel()})`,
      project: { name: $("projName").value.trim(), no: $("projNo").value.trim(), designer: $("projDesigner").value.trim() },
      highlights: getUnitReportHighlights(),
      summaryFacts: getBeamReportSummaryFacts(result),
      inputs: [
        { group: "單位系統", items: [
          { label: "輸入模式", value: getFormalUnitSummaryText() },
          { label: "換算對照", value: getFormalUnitConversionText() },
          { label: "流程顯示", value: getInternalUnitNoteText() },
        ]},
        { group: "斷面與材料", items: [
          { label: "規格", value: getSectionInputSummaryText(result) },
          { label: "Fy", value: formatDisplayValue(result.Fy, "stress", unitMode === "si" ? 1 : 0), unit: getQuantityUnit("stress") },
          ...(result.sec.shape === "h" || result.sec.shape === "rhs" ? [
            { label: "Lb", value: formatDisplayValue(result.Lb, "memberLength", unitMode === "si" ? 3 : 1), unit: getQuantityUnit("memberLength") },
            { label: "Cb", value: result.Cb },
          ] : result.sec.shape === "chs" ? [
            { label: "Lv", value: formatDisplayValue(result.Lv, "memberLength", unitMode === "si" ? 3 : 1), unit: getQuantityUnit("memberLength") },
          ] : []),
        ]},
        { group: "設計需求", items: [
          { label: designMethod === "LRFD" ? "Mu" : "Ma", value: formatDisplayValue(result.demandMoment, "moment", 2), unit: getQuantityUnit("moment") },
          { label: designMethod === "LRFD" ? "Vu" : "Va", value: formatDisplayValue(result.demandShear, "force", 2), unit: getQuantityUnit("force") },
          { label: "跨度 L", value: formatDisplayValue(result.L, "memberLength", unitMode === "si" ? 3 : 1), unit: getQuantityUnit("memberLength") },
        ]},
      ],
        checks: [
          { group: "撓曲強度", items: [
            { label: "Mp", formula: "Fy × Zx", sub: `${f0(result.Fy)} × ${f1(result.sec.Zx)}`, value: formatDisplayValue(result.flex.Mp / 1e5, "moment", 2), unit: getQuantityUnit("moment"), note: "第七章撓曲構材塑性彎矩" },
            { label: designMethod === "LRFD" ? "φMn ≥ |Mu|" : "Mn/Ω ≥ |Ma|", formula: designMethod === "LRFD" ? "φMn" : "Mn / Ω", sub: result.isLRFD ? `φb = ${f2(Steel.PHI.flexure)}，${f2(result.flex.phiMn_tfm)} ≥ ${f2(result.demandMoment)}` : `Ωb = ${f2(Steel.OMEGA.flexure)}，${f2(result.flex.MnOmega_tfm)} ≥ ${f2(result.demandMoment)}`, value: `${result.ratioFlex}%`, ok: result.flexOk, note: `控制模式：${getBeamGoverningDisplay(result.flex.governing)}` },
          ]},
          { group: "剪力強度", items: [
            result.sec.shape === "chs"
              ? { label: "Vn", formula: "FcrAg/2", sub: `${f0(result.shear.Fcr)} × ${f2(result.sec.A)} / 2`, value: formatDisplayValue(result.shear.Vn / 1000, "force", 2), unit: getQuantityUnit("force"), note: `第七章圓形 HSS 剪力條文｜Lv = ${formatDisplayValue(result.Lv, "memberLength", unitMode === "si" ? 3 : 1)} ${getQuantityUnit("memberLength")}` }
              : { label: "Vn", formula: `0.6FyAw${result.sec.shape === "shs" ? "Cv2" : "Cv1"}`, sub: `0.6 × ${f0(result.Fy)} × ${f2(result.sec.Aw)} × ${f2(result.shear.Cv2 ?? result.shear.Cv1)}`, value: formatDisplayValue(result.shear.Vn / 1000, "force", 2), unit: getQuantityUnit("force"), note: "第七章剪力條文" },
            { label: designMethod === "LRFD" ? "φVn ≥ |Vu|" : "Vn/Ω ≥ |Va|", formula: designMethod === "LRFD" ? "φVn" : "Vn / Ω", sub: result.isLRFD ? `φv = ${f2(result.shear.phiV)}，${f2(result.shear.phiVn_tf)} ≥ ${f2(result.demandShear)}` : `Ωv = ${f2(result.shear.omgV)}，${f2(result.shear.VnOmega_tf)} ≥ ${f2(result.demandShear)}`, value: `${result.ratioShear}%`, ok: result.shearOk, note: result.sec.shape === "chs" ? `Fcr = ${formatDisplayValue(result.shear.Fcr, "stress", unitMode === "si" ? 1 : 0)} ${getQuantityUnit("stress")}` : `${result.sec.shape === "shs" ? "Cv2" : "Cv1"} = ${f2(result.shear.Cv2 ?? result.shear.Cv1)}` },
          ]},
          { group: "撓度與使用性", items: [
          { label: "活載重撓度", formula: "ΔL ≤ L / limit", sub: `${f2(result.deflection.deltaL)} ≤ ${f2(result.allowLive)}`, value: result.deflStatus === "skipped" ? "未檢核" : `${formatDisplayValue(result.deflection.deltaL, "deflection", unitMode === "si" ? 1 : 2)} / ${formatDisplayValue(result.allowLive, "deflection", unitMode === "si" ? 1 : 2)} ${getQuantityUnit("deflection")}`, ok: result.deflStatus === "skipped" ? null : result.deflection.deltaL <= result.allowLive, note: `限值：L/${$("limL").value}` },
          { label: "總撓度", formula: "ΔT ≤ L / limit", sub: `${f2(result.deflection.deltaT)} ≤ ${f2(result.allowTotal)}`, value: result.deflStatus === "skipped" ? "未檢核" : `${formatDisplayValue(result.deflection.deltaT, "deflection", unitMode === "si" ? 1 : 2)} / ${formatDisplayValue(result.allowTotal, "deflection", unitMode === "si" ? 1 : 2)} ${getQuantityUnit("deflection")}`, ok: result.deflStatus === "skipped" ? null : result.deflection.deltaT <= result.allowTotal, note: `限值：L/${$("limT").value}` },
        ]},
      ],
      summary: summaryState,
      steps: includeFlow ? buildReportSteps(result) : [],
      symbols: includeSymbols ? buildReportSymbols(result, { includeFlow }) : [],
      notes: includeNotes ? reportNotes : [],
    });
  }

  function bindEvents() {
    $("sectionTypeSelect").addEventListener("change", () => {
      syncSectionTypeUI();
      resultState = runCheck();
    });
    $("secSelect").addEventListener("change", () => { onSecSelect(); resultState = runCheck(); });
    $("shsSelect").addEventListener("change", () => { onShsSelect(); resultState = runCheck(); });
    $("rhsSelect").addEventListener("change", () => { onRhsSelect(); resultState = runCheck(); });
    $("chsSelect").addEventListener("change", () => { onChsSelect(); resultState = runCheck(); });
    $("matSelect").addEventListener("change", () => { onMatSelect(); resultState = runCheck(); });
    $("beamUnitModeLegacyBtn").addEventListener("click", () => setUnitMode("legacy"));
    $("beamUnitModeSiBtn").addEventListener("click", () => setUnitMode("si"));
    $("btnLRFD").addEventListener("click", () => { setMethod("LRFD"); resultState = runCheck(); });
    $("btnASD").addEventListener("click", () => { setMethod("ASD"); resultState = runCheck(); });
    $("runCheckBtn").addEventListener("click", () => { resultState = runCheck(); });
    $("btnReport").addEventListener("click", buildReport);
    $("printReportBtn").addEventListener("click", () => window.print());
    $("beamJumpGoverningBtn").addEventListener("click", () => scrollToBlock(getGoverningTarget()));
    $("beamJumpFirstNgBtn").addEventListener("click", () => {
      scrollToBlock(getFirstNgTarget());
    });
    $("beamJumpAlertsBtn").addEventListener("click", () => scrollToBlock($("beamReminderCard")));
    $("copySummaryBtn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("beamSummaryBanner").textContent.trim());
        $("reportStatus").textContent = "摘要已複製";
      } catch {
        $("reportStatus").textContent = "無法複製摘要";
      }
    });
    document.querySelectorAll(".section-tabs button").forEach((button) => button.addEventListener("click", () => activatePanel(button.dataset.panel)));
    $("beamQuickInputBtn").addEventListener("click", () => {
      $("inputColumn").scrollIntoView({ behavior: "smooth", block: "start" });
      updateQuickNavActive("input");
    });
    $("beamQuickReportBtn").addEventListener("click", () => {
      activatePanel("report");
      $("reportColumn").scrollIntoView({ behavior: "smooth", block: "start" });
      updateQuickNavActive("report");
    });
    $("beamQuickFlowBtn").addEventListener("click", () => {
      activatePanel("flow");
      $("panel-flow").scrollIntoView({ behavior: "smooth", block: "start" });
      updateQuickNavActive("flow");
    });
    $("beamMobileFab").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    $("beamInputPresetSmart").addEventListener("click", () => applyInputAccordionPreset("smart"));
    $("beamInputPresetFocus").addEventListener("click", () => applyInputAccordionPreset("focus"));
    $("beamInputPresetOpen").addEventListener("click", () => applyInputAccordionPreset("open"));
    $("beamReportPresetFocus").addEventListener("click", () => applyReportAccordionPreset(resultState, "focus"));
    $("beamReportPresetOpen").addEventListener("click", () => applyReportAccordionPreset(resultState, "open"));
    ["beamShowFlowInReport", "beamShowSymbolsInReport", "beamShowNotesInReport"].forEach((id) => {
      $(id).addEventListener("change", () => {
        persistUiPrefs();
        if (resultState) renderSummary(resultState);
      });
    });
    document.querySelectorAll("input, select").forEach((input) => {
      if (!["projName", "projNo", "projDesigner"].includes(input.id) && !input.dataset.filterInput) {
        input.addEventListener("change", () => { resultState = runCheck(); });
      }
    });
    window.addEventListener("scroll", requestQuickNavSync, { passive: true });
    window.addEventListener("scroll", requestReportJumpSync, { passive: true });
    window.addEventListener("resize", () => {
      requestQuickNavSync();
      requestReportJumpSync();
      applyInputAccordionPreset(currentInputPreset);
      applyReportAccordionPreset(resultState, currentReportPreset);
    });
  }

  buildSecOptions();
  buildMatOptions();
  renderGlossary();
  loadUiPrefs();
  setUnitMode(unitMode, { convertFields: unitMode !== "legacy", previousMode: "legacy", rerun: false, persist: false });
  prepareInputCardAccordions();
  prepareReportBlockAccordions();
  bindEvents();
  syncSectionTypeUI();
  setMethod(designMethod);
  onMatSelect();
  renderFillStatus();
  renderCardStatuses(null);
  resultState = runCheck();
  applyInputAccordionPreset(currentInputPreset);
  applyReportAccordionPreset(resultState, currentReportPreset);
  activatePanel(currentPanel);
  requestQuickNavSync();
  requestReportJumpSync();
})();
