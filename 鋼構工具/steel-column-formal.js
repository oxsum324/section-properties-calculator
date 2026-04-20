(function initSteelColumnFormal() {
  const $ = (id) => document.getElementById(id);
  const f2 = (value) => Number(value || 0).toFixed(2);
  const f1 = (value) => Number(value || 0).toFixed(1);
  const f0 = (value) => Math.round(Number(value || 0)).toLocaleString();
  const num = (id) => parseFloat($(id)?.value) || 0;
  const UI_PREFS_KEY = "steel-column-formal-ui-v3";
  const TF_TO_KN = 9.80665;
  const KGFCM2_TO_MPA = 0.0980665;
  const columnUnitFieldConfigs = [
    { id: "inFy", kind: "stress", legacyDigits: 0, siDigits: 1 },
    { id: "inLx", kind: "memberLength", legacyDigits: 1, siDigits: 3 },
    { id: "inLy", kind: "memberLength", legacyDigits: 1, siDigits: 3 },
    { id: "inLbx", kind: "memberLength", legacyDigits: 1, siDigits: 3 },
    { id: "inPu", kind: "force", legacyDigits: 2, siDigits: 2 },
    { id: "inMux", kind: "moment", legacyDigits: 2, siDigits: 2 },
    { id: "inMuy", kind: "moment", legacyDigits: 2, siDigits: 2 },
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
    return Number(value || 0);
  }

  function convertDisplayValue(value, kind, mode = unitMode) {
    if (mode !== "si") return Number(value || 0);
    if (kind === "stress") return Number(value || 0) / KGFCM2_TO_MPA;
    if (kind === "force" || kind === "moment") return Number(value || 0) / TF_TO_KN;
    if (kind === "memberLength") return Number(value || 0) * 100;
    return Number(value || 0);
  }

  function getQuantityUnit(kind, mode = unitMode) {
    if (kind === "stress") return mode === "si" ? "MPa" : "kgf/cm²";
    if (kind === "force") return mode === "si" ? "kN" : "tf";
    if (kind === "moment") return mode === "si" ? "kN·m" : "tf·m";
    if (kind === "memberLength") return mode === "si" ? "m" : "cm";
    return "";
  }

  function getFieldConfig(id) {
    return columnUnitFieldConfigs.find((item) => item.id === id) || null;
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
    columnUnitFieldConfigs.forEach((config) => {
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
    return !!result && result.axialOk && result.interOk && result.KLrMax <= 200;
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
    ["KL/r", "細長比", "-", "有效長度與迴轉半徑之比值。", "壓力構材挫屈控制。", "第六章受壓構材"],
    ["Kx / Ky", "有效長度因數", "-", "依構架邊界條件修正之有效長度係數。", "壓力構材穩定分析。", "第六章受壓構材"],
    ["Lx / Ly", "未支撐長度", "cm", "柱構材於強軸、弱軸方向採用之設計長度。", "KL/r 與穩定檢核。", "第六章受壓構材"],
    ["rx / ry", "迴轉半徑", "cm", "截面面積二次矩除以面積後開根號所得之迴轉半徑。", "細長比與 Euler 挫屈應力。", "第六章受壓構材"],
    ["φc / Ωc", "軸壓係數", "-", "LRFD 軸壓強度折減因數與 ASD 軸壓安全因數。", "φPn 或 Pa 顯示與檢核。", "第六章受壓構材設計強度"],
    ["φb / Ωb", "彎矩係數", "-", "LRFD 撓曲強度折減因數與 ASD 撓曲安全因數。", "φMnx、φMny 或 Mn/Ω 顯示與檢核。", "第七章撓曲構材；第八章互制"],
    ["Fe", "Euler 彈性挫屈應力", "kgf/cm²", "依 π²E/(KL/r)² 求得之彈性挫屈應力。", "Fcr 計算。", "第六章受壓構材挫屈應力"],
    ["Fcr", "臨界壓力應力", "kgf/cm²", "依非彈性挫屈或彈性挫屈分支求得。", "Pn 計算。", "第六章受壓構材強度"],
    ["Pn", "標稱軸壓強度", "kgf", "Fcr 乘以有效面積後之軸壓強度。", "軸壓檢核。", "第六章受壓構材強度"],
    ["Q", "細長板件折減係數", "-", "當壓力構材板件細長時用於折減有效面積。", "細長壓力構材。", "第六章細長板件壓力構材"],
    ["Mux / Muy", "強軸 / 弱軸彎矩", "tf·m", "鋼柱截面承受之雙向彎矩需求。", "軸力—彎矩互制。", "第八章構材承受組合力及扭矩"],
    ["B1", "一階放大係數", "-", "非側移構架中考慮二階效應之彎矩放大係數。", "LRFD 互制檢核。", "第八章構材承受組合力及扭矩"],
    ["Cmx / Cmy", "彎矩圖形係數", "-", "反映端彎矩分布對彎矩放大之影響。", "互制檢核。", "第八章構材承受組合力及扭矩"],
    ["φPn / Pa", "可用軸壓強度", "tf", "LRFD 採 φPn，ASD 採容許軸壓 Pa。", "與需求比較。", "第六章受壓構材設計強度"],
    ["φMnx / φMny", "可用彎矩強度", "tf·m", "依主軸、弱軸分別求得之可用彎矩強度。", "互制檢核。", "第七章撓曲構材；第八章互制"],
    ["Qs / Qa", "截面 / 構件有效面積折減", "-", "細長板件時分別代表截面元素與構件層級折減。", "Q 值分解。", "第六章細長板件壓力構材"],
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
        showFlowInReport: $("columnShowFlowInReport")?.checked ?? true,
        showSymbolsInReport: $("columnShowSymbolsInReport")?.checked ?? true,
        showNotesInReport: $("columnShowNotesInReport")?.checked ?? true,
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
      if (typeof parsed.showFlowInReport === "boolean" && $("columnShowFlowInReport")) {
        $("columnShowFlowInReport").checked = parsed.showFlowInReport;
      }
      if (typeof parsed.showSymbolsInReport === "boolean" && $("columnShowSymbolsInReport")) {
        $("columnShowSymbolsInReport").checked = parsed.showSymbolsInReport;
      }
      if (typeof parsed.showNotesInReport === "boolean" && $("columnShowNotesInReport")) {
        $("columnShowNotesInReport").checked = parsed.showNotesInReport;
      }
    } catch {
      // ignore
    }
  }

  function renderGlossary() {
    $("columnGlossaryBody").innerHTML = glossaryItems.map((item) => `
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

  function suppressesColumnLtbInput(type = getSectionType()) {
    return type === "shs" || type === "chs";
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

  function getColumnClosedShapeNote(type = getSectionType()) {
    if (type === "rhs") {
      return "矩形管 RHS 為封閉斷面；本版強軸撓曲仍使用 Lbx / Cbx 評估 F7 側扭挫屈，弱軸撓曲不另啟用。";
    }
    return "方管與圓管為封閉斷面，本版暫不啟用 Lbx / Cbx 側扭挫屈參數。";
  }

  function getClosedShapeInteractionNote(type = getSectionType()) {
    if (type === "rhs") {
      return "RHS 強軸撓曲依 F7 仍考慮 Lbx / Cbx；弱軸撓曲不另啟用側扭挫屈參數。";
    }
    return "封閉 HSS 斷面不啟用 Lbx / Cbx；撓曲強度以局部挫屈控制。";
  }

  function syncSectionTypeUI() {
    const type = getSectionType();
    document.querySelectorAll("[data-section-type]").forEach((block) => {
      block.classList.toggle("is-hidden", block.dataset.sectionType !== type);
    });
    $("columnLtbRow").classList.toggle("is-hidden", suppressesColumnLtbInput(type));
    $("columnClosedShapeNote").textContent = getColumnClosedShapeNote(type);
    $("columnClosedShapeNote").classList.toggle("is-hidden", !isClosedHss(type));
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
      option.textContent = `${item.label}｜Fy ${formatDisplayValue(item.Fy, "stress", unitMode === "si" ? 1 : 0)} ${getQuantityUnit("stress")}`;
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
    $("methodBadge").textContent = `鋼構造建築物鋼結構設計技術規範｜鋼柱檢核 (${method})`;
    $("loadTitle").textContent = isLRFD ? "載重 (LRFD)" : "載重 (ASD / 使用荷重)";
    updateUnitLabels();
    persistUiPrefs();
  }

  function updateUnitCard() {
    const isSi = unitMode === "si";
    $("columnUnitModeLegacyBtn").classList.toggle("active", !isSi);
    $("columnUnitModeSiBtn").classList.toggle("active", isSi);
    $("columnUnitModeBadge").textContent = isSi ? "輸入：SI" : "輸入：舊制";
    $("columnUnitIntro").textContent = isSi
      ? "柱正式頁目前採 SI 輸入；斷面尺寸與規格選單固定維持 mm，其他主要欄位可直接輸入 kN / MPa / m。"
      : "柱正式頁目前採舊制輸入；斷面尺寸與規格選單固定維持 mm，其餘欄位採 tf / kgf/cm² / cm。";
    $("columnUnitSectionValue").textContent = "mm";
    $("columnUnitSectionNote").textContent = "規格資料庫與手動斷面尺寸固定使用 mm";
    $("columnUnitLengthValue").textContent = getQuantityUnit("memberLength");
    $("columnUnitLengthNote").textContent = isSi ? "Lx / Ly / Lbx 以 m 輸入" : "Lx / Ly / Lbx 以 cm 輸入";
    $("columnUnitForceValue").textContent = `${getQuantityUnit("force")} / ${getQuantityUnit("moment")}`;
    $("columnUnitForceNote").textContent = isSi ? "Pu、Mux、Muy、設計強度與可用容量以 kN / kN·m 顯示" : "Pu、Mux、Muy、設計強度與可用容量以 tf / tf·m 顯示";
    $("columnUnitStressValue").textContent = getQuantityUnit("stress");
    $("columnUnitStressNote").textContent = isSi ? "Fy、Fe、Fcr 以 MPa 顯示" : "Fy、Fe、Fcr 以 kgf/cm² 顯示";
    $("columnUnitConversionText").textContent = "1 tf = 9.80665 kN｜1 tf·m = 9.80665 kN·m｜1 kgf/cm² = 0.0980665 MPa｜1 cm = 10 mm";
    $("columnUnitCallout").textContent = isSi
      ? "輸入欄位、摘要卡與匯出報表會跟著切換到 SI；斷面尺寸欄位與規格下拉固定維持 mm，重新開頁會維持上次選擇。"
      : "輸入欄位、摘要卡與匯出報表會跟著切換到舊制；斷面尺寸欄位與規格下拉固定維持 mm，重新開頁會維持上次選擇。";
    $("columnUnitFlowNote").textContent = "計算流程與符號詞典仍沿用核心計算單位 kgf/cm²、tf、cm 顯示代入。";
  }

  function updateUnitLabels() {
    const isLRFD = designMethod === "LRFD";
    $("columnFyLabel").textContent = `Fy (${getQuantityUnit("stress")})`;
    $("columnLxLabel").textContent = `Lx 強軸無支撐長 (${getQuantityUnit("memberLength")})`;
    $("columnLyLabel").textContent = `Ly 弱軸無支撐長 (${getQuantityUnit("memberLength")})`;
    $("lblPu").textContent = `${isLRFD ? "Pu" : "Pa"} 軸力 (${getQuantityUnit("force")})`;
    $("lblMx").textContent = `${isLRFD ? "Mux" : "Max"} 強軸彎矩 (${getQuantityUnit("moment")})`;
    $("lblMy").textContent = `${isLRFD ? "Muy" : "May"} 弱軸彎矩 (${getQuantityUnit("moment")})`;
    $("columnLbxLabel").textContent = `Lbx 強軸側撐間距 (${getQuantityUnit("memberLength")})`;
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
    $("propsTable").innerHTML = `
      <thead><tr><th>項目</th><th>數值</th><th>單位</th></tr></thead>
      <tbody>
        <tr><td>規格</td><td>${sec.name}</td><td>-</td></tr>
        ${shapeRows}
        <tr><td>A</td><td>${f2(sec.A)}</td><td>cm²</td></tr>
        <tr><td>Ix</td><td>${f0(sec.Ix)}</td><td>cm⁴</td></tr>
        <tr><td>Iy</td><td>${f0(sec.Iy)}</td><td>cm⁴</td></tr>
        <tr><td>Sx</td><td>${f1(sec.Sx)}</td><td>cm³</td></tr>
        <tr><td>Sy</td><td>${f1(sec.Sy)}</td><td>cm³</td></tr>
        <tr><td>rx</td><td>${f2(sec.rx)}</td><td>cm</td></tr>
        <tr><td>ry</td><td>${f2(sec.ry)}</td><td>cm</td></tr>
      </tbody>
    `;
    $("propsCard").style.display = "";
  }

  function getClassificationFlowLines(result) {
    if (result.sec.shape === "shs") {
      return [
        `Bflat/t = (${f1(result.sec.B)} - 3 × ${f2(result.sec.t)}) / ${f2(result.sec.t)} = ${f2(result.clsC.lambdaF)}`,
        `非細長界限 = ${f2(result.clsC.lrf_comp)}；彎曲 λp = ${f2(result.flexX.lp)}，λr = ${f2(result.flexX.lr)}（${getColumnFlexLocalZoneDisplay(result.flexX.localZone)}）`,
      ];
    }
    if (result.sec.shape === "rhs") {
      return [
        `Bflat/t = (${f1(result.sec.B)} - 3 × ${f2(result.sec.t)}) / ${f2(result.sec.t)} = ${f2(result.clsC.lambdaF)}`,
        `Hflat/t = (${f1(result.sec.H)} - 3 × ${f2(result.sec.t)}) / ${f2(result.sec.t)} = ${f2(result.clsC.lambdaW)}；非細長界限 = ${f2(result.clsC.lrf_comp)}`,
        `x 軸彎曲：翼板 λp = ${f2(result.flexX.cls.lpf)}，λr = ${f2(result.flexX.cls.lrf)}；腹板 λp = ${f2(result.flexX.cls.lpw)}，λr = ${f2(result.flexX.cls.lrw)}`,
      ];
    }
    if (result.sec.shape === "chs") {
      return [
        `D/t = ${f1(result.sec.D)} / ${f2(result.sec.t)} = ${f2(result.clsC.lambdaF)}`,
        `非細長界限 = ${f2(result.clsC.lrf_comp)}；彎曲 λp = ${f2(result.flexX.lp)}，λr = ${f2(result.flexX.lr)}（${getColumnFlexLocalZoneDisplay(result.flexX.localZone)}）`,
      ];
    }
    return [
      `λf = bf/(2tf) = ${f2(result.clsC.lambdaF)}，λr = ${f2(result.clsC.lrf_comp)}`,
      `λw = h/tw = ${f2(result.clsC.lambdaW)}，λr = ${f2(result.clsC.lrw_comp)}`,
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

  function renderFillStatus() {
    const groups = [
      { id: "columnFillBasic", fields: ["codeBasisDisplay"] },
      { id: "columnFillSection", fields: getSectionFieldIds() },
      { id: "columnFillMaterial", fields: ["matSelect", "inFy", "inLx", "inLy", "inKx", "inKy"] },
      { id: "columnFillLoad", fields: suppressesColumnLtbInput() ? ["inPu", "inMux", "inMuy", "inCmx", "inCmy"] : ["inPu", "inMux", "inMuy", "inLbx", "inCbx", "inCmx", "inCmy"] },
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
      "matSelect", "inFy", "inLx", "inLy", "inKx", "inKy",
      "inPu", "inMux", "inMuy",
      ...(suppressesColumnLtbInput() ? [] : ["inLbx", "inCbx"]),
      "inCmx", "inCmy",
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
    setCardMeta("columnMetaBasic", "neutral", "正式模組");
    setCardMeta(
      "columnMetaSection",
      sectionOk ? "ok" : "warn",
      getSectionMetaText(),
    );
    setCardMeta("columnMetaMaterial", (isFilled("inFy") && isFilled("inLx") && isFilled("inLy") && isFilled("inKx") && isFilled("inKy")) ? "ok" : "warn", "材料 / 穩定");
    if (!result) {
      setCardMeta("columnMetaLoad", "neutral", "待檢核");
      return;
    }
    const overallOk = isOverallOk(result);
    setCardMeta("columnMetaLoad", overallOk ? "ok" : "warn", overallOk ? "控制穩定" : "需檢視");
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
    const activeId = { smart: "columnInputPresetSmart", focus: "columnInputPresetFocus", open: "columnInputPresetOpen" }[preset];
    ["columnInputPresetSmart", "columnInputPresetFocus", "columnInputPresetOpen"].forEach((id) => {
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
        ? ["columnCardBasic", "columnCardMaterial"].includes(card.id)
        : ["columnCardBasic"].includes(card.id);
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
    $("columnReportPresetFocus").classList.toggle("active", preset === "focus");
    $("columnReportPresetOpen").classList.toggle("active", preset === "open");
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
      if (block.querySelector("#columnInputSummaryBody")) shouldCollapse = true;
    if (block.id === "columnReminderCard") shouldCollapse = isOverallOk(result);
      block.classList.toggle("is-collapsed", shouldCollapse);
      toggle.textContent = shouldCollapse ? "展開" : "收合";
    });
    persistUiPrefs();
  }

  function getFlowApprovalText() {
    return $("columnShowFlowInReport").checked ? "已核可顯示" : "僅輸出摘要";
  }

  function getSymbolsApprovalText() {
    return $("columnShowSymbolsInReport").checked ? "已核可顯示" : "不顯示符號說明";
  }

  function getNotesApprovalText() {
    return $("columnShowNotesInReport").checked ? "已核可顯示" : "不顯示備註與條文說明";
  }

  function getReportContentSummaryText() {
    const items = [
      $("columnShowFlowInReport").checked ? "計算流程" : null,
      $("columnShowSymbolsInReport").checked ? "符號說明" : null,
      $("columnShowNotesInReport").checked ? "備註與條文說明" : null,
    ].filter(Boolean);
    return items.length ? `摘要 + ${items.join(" + ")}` : "僅輸出摘要與核可結果";
  }

  function getFormalUnitSummaryText() {
    return unitMode === "si"
      ? "輸入採 SI：斷面尺寸 mm；長度 m；力 kN；彎矩 kN·m；應力 MPa。"
      : "輸入採舊制：斷面尺寸 mm；長度 cm；力 tf；彎矩 tf·m；應力 kgf/cm²。";
  }

  function getInternalUnitNoteText() {
    return "計算流程與符號詞典仍沿用核心計算單位 kgf/cm²、tf、cm。";
  }

  function getFormalUnitConversionText() {
    return "換算：1 tf = 9.80665 kN；1 tf·m = 9.80665 kN·m；1 kgf/cm² = 0.0980665 MPa；1 cm = 10 mm";
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

  function getColumnAxisDisplay(axis) {
    if (axis === "x 軸") return "x 軸";
    if (axis === "y 軸") return "y 軸";
    return String(axis || "未分類");
  }

  function getColumnControlSummary(result) {
    return `${getColumnAxisDisplay(result.ctrlAxis)}｜KL/r ${f1(result.KLrMax)}`;
  }

  function getColumnZoneLabel(zone) {
    if (zone === "inelastic") return "非彈性挫屈區";
    if (zone === "elastic") return "彈性挫屈區";
    return String(zone || "未分類");
  }

  function getColumnFlexLocalZoneDisplay(localZone) {
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

  function getColumnLtbZoneDisplay(ltbZone) {
    const map = {
      plastic: "塑性區",
      inelastic: "非彈性側向扭轉挫屈區",
      elastic: "彈性側向扭轉挫屈區",
      not_applicable: "不適用",
    };
    return map[ltbZone] || String(ltbZone || "未分類");
  }

  function getColumnPrimaryIssue(result) {
    if (result.KLrMax > 200) {
      return {
        value: "細長比超限",
        note: `控制 KL/r = ${f1(result.KLrMax)}（${getColumnAxisDisplay(result.ctrlAxis)}），已超過 200。`,
        tone: "fail",
      };
    }
    if (!result.axialOk) {
      return {
        value: "軸壓強度未通過",
        note: `${designMethod === "LRFD" ? "φPn" : "Pa"} = ${formatDisplayValue(result.designPcTf, "force", 2)} ${getQuantityUnit("force")}，需求 = ${formatDisplayValue(result.PuTf, "force", 2)} ${getQuantityUnit("force")}。`,
        tone: "fail",
      };
    }
    if (!result.interOk) {
      return {
        value: "互制檢核未通過",
        note: `互制比 ${result.interRatioText}；請檢視 B1 放大、端彎矩係數與彎矩需求。`,
        tone: "fail",
      };
    }
    if (result.MuxTf === 0 && result.MuyTf === 0) {
      return {
        value: "互制未啟動",
        note: "未輸入彎矩，本次僅檢核細長比與軸壓強度。",
        tone: "neutral",
      };
    }
    return {
      value: "目前無 NG",
      note: "細長比、軸壓與互制檢核均在允許範圍內。",
      tone: "ok",
    };
  }

  function getColumnReportSummaryState(result) {
    const issue = getColumnPrimaryIssue(result);
    if (isOverallOk(result)) {
      return {
        ok: true,
        text: `全部通過｜${getColumnControlSummary(result)}`,
      };
    }
    return {
      ok: false,
      text: `${issue.value}｜${getColumnControlSummary(result)}`,
    };
  }

  function getColumnReportSummaryFacts(result) {
    const issue = getColumnPrimaryIssue(result);
    return [
      {
        label: "控制軸向",
        value: getColumnControlSummary(result),
        note: `KxLx/rx = ${f1(result.KLrX)}；KyLy/ry = ${f1(result.KLrY)}`,
        tone: result.KLrMax <= 200 ? "ok" : "fail",
      },
      {
        label: "軸壓區段",
        value: getColumnZoneLabel(result.pn.zone),
        note: `Fcr = ${formatDisplayValue(result.pn.Fcr, "stress", unitMode === "si" ? 1 : 0)} ${getQuantityUnit("stress")}`,
        tone: "neutral",
      },
      {
        label: "互制狀態",
        value: result.MuxTf === 0 && result.MuyTf === 0 ? "未啟動" : result.interRatioText,
        note: result.MuxTf === 0 && result.MuyTf === 0
          ? "未輸入彎矩，本次未形成第八章組合力互制式。"
          : `第八章組合力互制式｜${result.interOk ? "通過" : "NG"}`,
        tone: result.MuxTf === 0 && result.MuyTf === 0 ? "neutral" : (result.interOk ? "ok" : "fail"),
      },
      {
        label: "主要狀態",
        value: issue.value,
        note: issue.note,
        tone: issue.tone,
      },
    ];
  }

  function buildReportSteps(result) {
    const axialFactorLine = result.isLRFD
      ? `φc = ${f2(Steel.PHI.compress)}，φPn = ${f2(Steel.PHI.compress)} × ${f2(result.pn.Pn / 1000)} = ${f2(result.designPcTf)} tf`
      : `Ωc = ${f2(Steel.OMEGA.compress)}，Pn/Ωc = ${f2(result.pn.Pn / 1000)} / ${f2(Steel.OMEGA.compress)} = ${f2(result.pn.PnOmega_tf)} tf；本頁 ASD 比較值採 Pa = ${f2(result.designPcTf)} tf`;
    const flexureFactorLineX = result.isLRFD
      ? `φb = ${f2(Steel.PHI.flexure)}，φMnx = ${f2(Steel.PHI.flexure)} × ${f2(result.flexX.Mn / 1e5)} = ${f2(result.flexX.phiMn_tfm)} tf·m`
      : `Ωb = ${f2(Steel.OMEGA.flexure)}，Mnx/Ωb = ${f2(result.flexX.Mn / 1e5)} / ${f2(Steel.OMEGA.flexure)} = ${f2(result.flexX.MnOmega_tfm)} tf·m`;
    const flexureFactorLineY = result.isLRFD
      ? `φb = ${f2(Steel.PHI.flexure)}，φMny = ${f2(Steel.PHI.flexure)} × ${f2(result.flexY.Mn / 1e5)} = ${f2(result.flexY.phiMny_tfm)} tf·m`
      : `Ωb = ${f2(Steel.OMEGA.flexure)}，Mny/Ωb = ${f2(result.flexY.Mn / 1e5)} / ${f2(Steel.OMEGA.flexure)} = ${f2(result.flexY.MnyOmega_tfm)} tf·m`;
    return [
      {
        group: "1. 斷面性質與壓力構材分類",
        body: [
          `A = ${f2(result.sec.A)} cm²`,
          `rx = ${f2(result.sec.rx)} cm，ry = ${f2(result.sec.ry)} cm`,
          `Lx = ${f1(result.Lx)} cm，Ly = ${f1(result.Ly)} cm`,
          ...getClassificationFlowLines(result),
        ].join("\n"),
      },
      {
        group: "2. 細長比與軸壓強度",
          body: [
            `x 軸代入：Kx = ${f2(result.Kx)}，Lx = ${f1(result.Lx)} cm，rx = ${f2(result.sec.rx)} cm`,
            `KxLx/rx = ${f2(result.Kx)} × ${f1(result.Lx)} / ${f2(result.sec.rx)} = ${f1(result.KLrX)}`,
            `y 軸代入：Ky = ${f2(result.Ky)}，Ly = ${f1(result.Ly)} cm，ry = ${f2(result.sec.ry)} cm`,
            `KyLy/ry = ${f2(result.Ky)} × ${f1(result.Ly)} / ${f2(result.sec.ry)} = ${f1(result.KLrY)}`,
            `控制 KL/r = ${f1(result.KLrMax)}（${getColumnAxisDisplay(result.ctrlAxis)}）`,
            `Fe = π²E/(KL/r)² = π² × ${f0(result.E)} / ${f1(result.KLrMax)}² = ${f0(result.pn.Fe)} kgf/cm²`,
            `Fcr = ${f0(result.pn.Fcr)} kgf/cm²（${getColumnZoneLabel(result.pn.zone)}）`,
            axialFactorLine,
            `${result.isLRFD ? "φPn" : "Pa"} = ${f2(result.designPcTf)} tf，需求 = ${f2(result.PuTf)} tf`,
          ].join("\n"),
        },
      {
        group: "3. 主軸 / 弱軸彎矩強度",
        body: [
          ...(result.sec.shape === "rhs" ? [`Lbx = ${f1(result.Lbx)} cm，Cbx = ${f2(result.Cbx)}；x 軸側向扭轉挫屈區段 = ${getColumnLtbZoneDisplay(result.flexX.ltbZone)}`] : []),
          flexureFactorLineX,
          `${result.isLRFD ? "φMnx" : "Mnx / Ω"} = ${f2(result.isLRFD ? result.flexX.phiMn_tfm : result.flexX.MnOmega_tfm)} tf·m`,
          flexureFactorLineY,
          `${result.isLRFD ? "φMny" : "Mny / Ω"} = ${f2(result.isLRFD ? result.flexY.phiMny_tfm : result.flexY.MnyOmega_tfm)} tf·m`,
        ].join("\n"),
        },
      {
        group: "4. 軸力—彎矩互制檢核",
        body: result.interDetail.join("\n"),
      },
      ...(result.pn.Q < 1 ? [{
        group: "5. 細長板件折減",
        body: [`Qs = ${f2(result.pn.qr.Qs)}`, `Qa = ${f2(result.pn.qr.Qa)}`, `Q = ${f2(result.pn.Q)}`].join("\n"),
      }] : []),
    ];
  }

  function buildReportSymbols(result, { includeFlow = true } = {}) {
    const used = new Set([
      "KL/r",
      "Kx / Ky",
      "Lx / Ly",
      "rx / ry",
      "Fe",
      "Fcr",
      "Pn",
      result.isLRFD ? "φc / Ωc" : "φPn / Pa",
      "φb / Ωb",
      "Mux / Muy",
      result.isLRFD ? "φMnx / φMny" : "φb / Ωb",
    ]);
    if (result.pn.Q < 1) {
      ["Q", "Qs / Qa"].forEach((item) => used.add(item));
    }
    if (includeFlow) {
      ["KL/r", "Kx / Ky", "Lx / Ly", "rx / ry"].forEach((item) => used.add(item));
    }
    if (result.isLRFD && (result.MuxTf > 0 || result.MuyTf > 0)) {
      used.add("B1");
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
      "規範依據：鋼構造建築物鋼結構設計技術規範總則、極限設計法第六章受壓構材與第八章構材承受組合力及扭矩。",
      ...(result.sec.shape === "h" ? [] : [`HSS 斷面採名義厚度輸入、設計壁厚 t = 0.93 tnom；本版正式檢核目前限非細長 ${result.sec.shape === "shs" ? "方管" : result.sec.shape === "rhs" ? "矩形管" : "圓管"}。${result.sec.shape === "rhs" ? `強軸撓曲另使用 Lbx = ${formatDisplayValue(result.Lbx, "memberLength", lengthDigits)} ${lengthUnit}、Cbx = ${f2(result.Cbx)} 評估 F7 側扭挫屈。` : ""}`]),
      `有效長度輸入：Lx = ${formatDisplayValue(result.Lx, "memberLength", lengthDigits)} ${lengthUnit}，Ly = ${formatDisplayValue(result.Ly, "memberLength", lengthDigits)} ${lengthUnit}，Kx = ${f2(result.Kx)}，Ky = ${f2(result.Ky)}。`,
      `係數採用：軸壓 ${result.isLRFD ? `φc = ${f2(Steel.PHI.compress)}` : `Ωc = ${f2(Steel.OMEGA.compress)}`}；彎矩 ${result.isLRFD ? `φb = ${f2(Steel.PHI.flexure)}` : `Ωb = ${f2(Steel.OMEGA.flexure)}`}。`,
      `控制 KL/r：${f1(result.KLrMax)}（${getColumnAxisDisplay(result.ctrlAxis)}）。`,
      `輸出報表內容：${getReportContentSummaryText()}`,
      `互制狀態：${result.interRatioText}。`,
      `${result.isLRFD ? "LRFD 以強度折減因數 φ 表示可用強度。" : "ASD 軸壓比較值目前採傳統容許軸壓 Pa，彎矩則以 M/Ωb 之等效容量形式顯示；若需完全容許應力法表達，應另以 fa、fb 等應力格式出具。"} `,
    ];
  }

  function renderReminders(result) {
    const overallOk = isOverallOk(result);
    const reminders = [
      {
        level: overallOk ? "ok" : "info",
        title: "規範檢核摘要",
        body: overallOk
          ? "本次鋼柱於細長比、軸壓與軸力—彎矩互制檢核均通過，可作為正式報表預覽基礎。"
          : "本頁已同步提供正式報表預覽、計算流程與控制項目；若有 NG，請優先檢視 KL/r、Fcr 與互制比。",
      },
      {
        level: "info",
        title: "控制軸向",
        body: `本次控制細長比為 ${f1(result.KLrMax)}，控制軸向為 ${getColumnAxisDisplay(result.ctrlAxis)}；主要規範基準為第六章受壓構材與第八章構材承受組合力及扭矩。`,
      },
      ...(result.sec.shape === "h" ? [] : [{
        level: "info",
        title: "HSS 壁厚採用",
        body: result.sec.shape === "rhs"
          ? `本次矩形管以名義厚度輸入，正式檢核採設計壁厚 t = 0.93 tnom；本版僅支援非細長 RHS，且強軸撓曲仍使用 Lbx = ${f1(result.Lbx)} cm、Cbx = ${f2(result.Cbx)} 評估 F7。`
          : `本次 ${result.sec.shape === "shs" ? "方管" : "圓管"} 以名義厚度輸入，正式檢核採設計壁厚 t = 0.93 tnom；本版僅支援非細長 HSS。`,
      }]),
    ];
    if (result.clsC.flangeSlender || result.clsC.webSlender) {
      reminders.push({
        level: "warn",
        title: "細長板件提醒",
        body: "斷面含細長板件時，Q 折減可能控制有效面積與軸壓強度，請特別留意壓力構材板件分類。",
      });
    }
    if (result.KLrMax > 200) {
      reminders.push({
        level: "fail",
        title: "細長比超限",
        body: "控制 KL/r 已大於 200，建議先調整構架長度、支撐條件或改用較大斷面。",
      });
    }
    if (!result.axialOk) {
      reminders.push({
        level: "fail",
        title: "軸壓強度未通過",
        body: `${designMethod === "LRFD" ? "φPn" : "Pa"} 小於需求軸力，請檢視 Fcr、Q 折減與控制長細比，並依第六章受壓構材條文重新確認。`,
      });
    }
    if (result.MuxTf === 0 && result.MuyTf === 0) {
      reminders.push({
        level: "warn",
        title: "互制未啟動",
        body: "目前未輸入彎矩，因此軸力—彎矩互制僅列為未啟動狀態；若屬實際框架柱，建議補入設計彎矩。",
      });
    } else if (!result.interOk) {
      reminders.push({
        level: "fail",
        title: "互制檢核未通過",
        body: "軸力—彎矩互制比已超過允許值，請優先檢視 B1 放大、端彎矩係數與主弱軸彎矩需求，並依第八章組合力條文調整。",
      });
    }
    $("columnReminderList").innerHTML = reminders.map((item) => `
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
    const usedSymbolsCount = $("columnShowSymbolsInReport").checked ? buildReportSymbols(result, { includeFlow: $("columnShowFlowInReport").checked }).length : 0;
    const notesCount = $("columnShowNotesInReport").checked ? buildReportNotes(result).length : 0;
    setStatusBadge("columnReviewBadge", overallOk ? "ok" : "fail", overallOk ? "OK" : "需檢視");
    setStatusBadge("columnInputBadge", completion.filled === completion.total ? "ok" : "warn", `已填 ${completion.filled}/${completion.total}`);
    setStatusBadge("columnOutputBadge", $("columnShowFlowInReport").checked || $("columnShowSymbolsInReport").checked || $("columnShowNotesInReport").checked ? "neutral" : "warn", `${[$("columnShowFlowInReport").checked, $("columnShowSymbolsInReport").checked, $("columnShowNotesInReport").checked].filter(Boolean).length}/3 已啟用`);
    setStatusBadge("columnReminderBadge", failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "ok", failCount > 0 ? `NG ${failCount}` : warnCount > 0 ? `提醒 ${warnCount}` : "已整理");
    setStatusBadge("columnClauseBadge", "neutral", $("columnShowNotesInReport").checked ? `${notesCount} 則說明` : "說明隱藏");
    setStatusBadge("columnAxialBadge", result.axialOk ? "ok" : "fail", result.axialOk ? "OK" : "NG");
    setStatusBadge("columnInterBadge", result.interOk ? "ok" : "fail", result.interOk ? "OK" : "NG");
    setStatusBadge("columnApprovalBadge", overallOk ? "ok" : "fail", `${overallOk ? "可核可" : "需修正"}｜符號 ${usedSymbolsCount}`);
  }

  function renderMeta(result) {
    $("columnMetaProjectName").textContent = $("projName").value.trim() || "—";
    $("columnMetaProjectNo").textContent = $("projNo").value.trim() || "—";
    $("columnMetaDesigner").textContent = $("projDesigner").value.trim() || "—";
    $("columnReportTimestamp").textContent = new Intl.DateTimeFormat("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
    $("columnReportSubtitle").textContent = `Steel Column Formal Report (${designMethod}｜${getCurrentInputModeLabel()})`;
    $("columnReportTitle").textContent = `鋼柱正式規範核算計算書｜${designMethod}`;
    $("columnGoverningMode").textContent = getColumnControlSummary(result);
  }

  function renderReviewBrief(result) {
    const overallOk = isOverallOk(result);
    $("columnReviewBriefBody").innerHTML = `
      ${pairRow("規範基準", "鋼構造建築物鋼結構設計技術規範｜第六章受壓構材、第八章構材承受組合力及扭矩")}
      ${pairRow("單位系統", getFormalUnitSummaryText())}
      ${pairRow("換算對照", getFormalUnitConversionText())}
      ${pairRow("流程顯示", getInternalUnitNoteText())}
      ${pairRow("設計方法", designMethod)}
     ${pairRow("控制軸向", getColumnAxisDisplay(result.ctrlAxis))}
     ${pairRow("控制 KL/r", f1(result.KLrMax))}
     ${pairRow("輸出報表流程", getFlowApprovalText())}
     ${pairRow("符號說明", getSymbolsApprovalText())}
     ${pairRow("備註與條文說明", getNotesApprovalText())}
     ${pairRow("預計輸出符號", `${$("columnShowSymbolsInReport").checked ? buildReportSymbols(result, { includeFlow: $("columnShowFlowInReport").checked }).length : 0} 項`)}
     ${pairRow("預計輸出備註", `${$("columnShowNotesInReport").checked ? buildReportNotes(result).length : 0} 則`)}
     ${pairRow("整體判定", overallOk ? "全部通過" : "部分不通過，請檢視 KL/r、軸壓或互制控制項目")}
    `;
  }

  function renderInputSummary(result) {
    $("columnInputSummaryBody").innerHTML = `
      ${pairRow("斷面規格", getSectionInputSummaryText(result))}
      ${pairRow("材料強度 Fy", `${formatDisplayValue(result.Fy, "stress", unitMode === "si" ? 1 : 0)} ${getQuantityUnit("stress")}`)}
      ${pairRow("單位系統", getFormalUnitSummaryText())}
      ${pairRow("有效長度", `Lx = ${formatDisplayValue(result.Lx, "memberLength", unitMode === "si" ? 3 : 1)} ${getQuantityUnit("memberLength")}，Ly = ${formatDisplayValue(result.Ly, "memberLength", unitMode === "si" ? 3 : 1)} ${getQuantityUnit("memberLength")}`)}
     ${pairRow("K 值", `Kx = ${f2(result.Kx)}，Ky = ${f2(result.Ky)}`)}
     ${pairRow("設計需求", `${designMethod === "LRFD" ? "Pu" : "Pa"} = ${formatDisplayValue(result.PuTf, "force", 2)} ${getQuantityUnit("force")}，Mux = ${formatDisplayValue(result.MuxTf, "moment", 2)} ${getQuantityUnit("moment")}，Muy = ${formatDisplayValue(result.MuyTf, "moment", 2)} ${getQuantityUnit("moment")}`)}
     ${pairRow("互制參數", result.sec.shape === "h" || result.sec.shape === "rhs" ? `Lbx = ${formatDisplayValue(getLegacyInputValue("inLbx", "memberLength"), "memberLength", unitMode === "si" ? 3 : 1)} ${getQuantityUnit("memberLength")}，Cbx = ${f2(num("inCbx"))}，Cmx = ${f2(num("inCmx"))}，Cmy = ${f2(num("inCmy"))}` : `封閉斷面不啟用 Lbx / Cbx；Cmx = ${f2(num("inCmx"))}，Cmy = ${f2(num("inCmy"))}`)}
     ${pairRow("輸出報表內容", getReportContentSummaryText())}
    `;
  }

  function renderOutputSummary(result) {
    const flowCount = $("columnShowFlowInReport").checked ? buildReportSteps(result).length : 0;
    const symbolsCount = $("columnShowSymbolsInReport").checked
      ? buildReportSymbols(result, { includeFlow: $("columnShowFlowInReport").checked }).length
      : 0;
    const notesCount = $("columnShowNotesInReport").checked ? buildReportNotes(result).length : 0;
    $("columnOutputSummaryBody").innerHTML = `
      ${pairRow("計算流程", `${getFlowApprovalText()}｜${flowCount} 式`)}
      ${pairRow("符號說明", `${getSymbolsApprovalText()}｜${symbolsCount} 項`)}
      ${pairRow("備註與條文說明", `${getNotesApprovalText()}｜${notesCount} 則`)}
      ${pairRow("輸出摘要", getReportContentSummaryText())}
    `;
  }

  function renderApproval(result) {
    const overallOk = isOverallOk(result);
    $("columnApprovalStamp").textContent = overallOk ? "通過" : "需調整";
    $("columnApprovalDecision").textContent = overallOk ? "可核可" : "需修正";
    $("columnApprovalGoverning").textContent = getColumnControlSummary(result);
    $("columnApprovalFlow").textContent = `${getFlowApprovalText()}｜${getSymbolsApprovalText()}｜${getNotesApprovalText()}`;
    $("columnOverallMessage").textContent = overallOk
      ? "鋼柱正式檢核已完成，右側可直接作為審查版預覽。"
      : "目前至少一項控制條件未通過；請先依審查摘要與提醒區調整 KL/r、軸壓或互制控制項目。";
  }

  function renderHealthBar(result) {
    const chips = [
      { label: "正式核算", value: designMethod, tone: "neutral" },
      { label: "軸壓強度", value: result.axialOk ? "OK" : "NG", tone: result.axialOk ? "ok" : "fail" },
      { label: "互制檢核", value: result.interOk ? "OK" : "NG", tone: result.interOk ? "ok" : "fail" },
      { label: "控制軸向", value: getColumnAxisDisplay(result.ctrlAxis), tone: "neutral" },
      { label: "控制 KL/r", value: f1(result.KLrMax), tone: result.KLrMax <= 200 ? "ok" : "fail" },
      {
        label: "輸出內容",
        value: `符號 ${$("columnShowSymbolsInReport").checked ? buildReportSymbols(result, { includeFlow: $("columnShowFlowInReport").checked }).length : 0} / 備註 ${$("columnShowNotesInReport").checked ? buildReportNotes(result).length : 0}`,
        tone: "neutral",
      },
    ];
    $("columnHealthBar").innerHTML = chips.map((chip) => `
      <div class="health-chip ${chip.tone}">
        <span class="health-chip__label">${chip.label}</span>
        <span class="health-chip__value">${chip.value}</span>
      </div>
    `).join("");
  }

  function updateSectionTabSummary(result) {
    const reportBadge = $("columnTabReportBadge");
    const flowBadge = $("columnTabFlowBadge");
    const glossaryBadge = $("columnTabGlossaryBadge");
    const failCount = [result.axialOk, result.interOk, result.KLrMax <= 200].filter((item) => item === false).length;
    const usedSymbolsCount = $("columnShowSymbolsInReport").checked ? buildReportSymbols(result, { includeFlow: $("columnShowFlowInReport").checked }).length : 0;
    const flowCount = $("columnShowFlowInReport").checked ? buildReportSteps(result).length : 0;
    reportBadge.textContent = failCount > 0 ? `NG ${failCount}` : "OK";
    reportBadge.className = `section-tab-badge ${failCount > 0 ? "fail" : "ok"}`;
    flowBadge.textContent = $("columnShowFlowInReport").checked ? `${flowCount} 式` : "流程隱藏";
    flowBadge.className = "section-tab-badge neutral";
    glossaryBadge.textContent = $("columnShowSymbolsInReport").checked ? `${usedSymbolsCount} 項` : "符號隱藏";
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
    $("columnJumpGoverningBtn").classList.toggle("active", target === "governing");
    $("columnJumpFirstNgBtn").classList.toggle("active", target === "firstNg");
    $("columnJumpAlertsBtn").classList.toggle("active", target === "alerts");
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
    $("columnQuickInputBtn").classList.toggle("active", target === "input");
    $("columnQuickReportBtn").classList.toggle("active", target === "report");
    $("columnQuickFlowBtn").classList.toggle("active", target === "flow");
  }

  function syncQuickNavState() {
    quickNavTicking = false;
    const inputTop = $("inputColumn").getBoundingClientRect().top;
    const flowTop = $("panel-flow").getBoundingClientRect().top;
    const reportTop = $("reportColumn").getBoundingClientRect().top;
    const isFlowActive = document.querySelector('[data-panel="flow"]')?.classList.contains("active");
    if (window.scrollY > 240) {
      $("columnMobileFab").classList.add("is-visible");
    } else {
      $("columnMobileFab").classList.remove("is-visible");
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
    return !resultState?.axialOk ? $("axialCard") : $("interCard");
  }

  function getFirstNgTarget() {
    return resultState?.KLrMax > 200 ? $("slenderCard")
      : !resultState?.axialOk ? $("axialCard")
        : !resultState?.interOk ? $("interCard")
          : $("columnReminderCard");
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
      { key: "alerts", block: $("columnReminderCard") },
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
    const ngCount = [result.KLrMax > 200, !result.axialOk, !result.interOk].filter(Boolean).length;
    const alertCount = Array.from(document.querySelectorAll("#columnReminderList .member-reminder")).length;
    $("columnJumpGoverningBtn").disabled = false;
    $("columnJumpAlertsBtn").disabled = false;
    $("columnJumpFirstNgBtn").disabled = ngCount === 0;
    $("columnJumpGoverningBtn").textContent = "控制檢核";
    $("columnJumpFirstNgBtn").textContent = ngCount > 0 ? `首個 NG (${ngCount})` : "首個 NG";
    $("columnJumpAlertsBtn").textContent = alertCount > 0 ? `限制條件 (${alertCount})` : "限制條件";
  }

  function renderSummary(result) {
    const overallOk = isOverallOk(result);
    $("columnSummaryBanner").className = `member-banner ${overallOk ? "ok" : "fail"}`;
    $("columnSummaryBanner").textContent = overallOk ? "全部通過｜鋼柱斷面目前符合檢核條件" : "部分不通過｜請檢視 KL/r、軸壓或互制控制項目";
    $("columnSummaryGrid").innerHTML = `
      <div class="member-summary-card"><span class="label">設計方法</span><span class="value">${designMethod}</span></div>
      <div class="member-summary-card"><span class="label">控制軸向</span><span class="value">${getColumnAxisDisplay(result.ctrlAxis)}</span></div>
      <div class="member-summary-card"><span class="label">控制 KL/r</span><span class="value">${f1(result.KLrMax)}</span></div>
      <div class="member-summary-card"><span class="label">軸力需求比</span><span class="value">${result.ratioAx}%</span></div>
      <div class="member-summary-card"><span class="label">互制需求比</span><span class="value">${result.interRatioText}</span></div>
      <div class="member-summary-card"><span class="label">板件狀態</span><span class="value">${result.clsC.flangeSlender || result.clsC.webSlender ? "含細長板件" : "非細長板件"}</span></div>
    `;
      $("reportStatus").textContent = overallOk ? "最新檢核：全部通過" : "最新檢核：請查看控制項目";
      renderMeta(result);
      renderReviewBrief(result);
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
      const axialFactorLine = result.isLRFD
        ? `<div class="formula">φc = ${f2(Steel.PHI.compress)}，φPn = ${f2(Steel.PHI.compress)} × ${f2(result.pn.Pn / 1000)} = ${f2(result.designPcTf)} tf</div>`
        : `<div class="formula">Ωc = ${f2(Steel.OMEGA.compress)}，Pn / Ωc = ${f2(result.pn.Pn / 1000)} / ${f2(Steel.OMEGA.compress)} = ${f2(result.pn.PnOmega_tf)} tf；本頁 ASD 比較值採 Pa = ${f2(result.designPcTf)} tf</div>`;
      const flexureFactorLineX = result.isLRFD
        ? `<div class="formula">φb = ${f2(Steel.PHI.flexure)}，φMnx = ${f2(Steel.PHI.flexure)} × ${f2(result.flexX.Mn / 1e5)} = ${f2(result.flexX.phiMn_tfm)} tf·m</div>`
        : `<div class="formula">Ωb = ${f2(Steel.OMEGA.flexure)}，Mnx / Ωb = ${f2(result.flexX.Mn / 1e5)} / ${f2(Steel.OMEGA.flexure)} = ${f2(result.flexX.MnOmega_tfm)} tf·m</div>`;
      const flexureFactorLineY = result.isLRFD
        ? `<div class="formula">φb = ${f2(Steel.PHI.flexure)}，φMny = ${f2(Steel.PHI.flexure)} × ${f2(result.flexY.Mn / 1e5)} = ${f2(result.flexY.phiMny_tfm)} tf·m</div>`
        : `<div class="formula">Ωb = ${f2(Steel.OMEGA.flexure)}，Mny / Ωb = ${f2(result.flexY.Mn / 1e5)} / ${f2(Steel.OMEGA.flexure)} = ${f2(result.flexY.MnyOmega_tfm)} tf·m</div>`;
        $("columnFlowBody").innerHTML = `
        <div class="step-card">
          <h4>1. 斷面性質</h4>
          <div class="formula">A = ${f2(result.sec.A)} cm²</div>
          <div class="formula">rx = ${f2(result.sec.rx)} cm，ry = ${f2(result.sec.ry)} cm</div>
          <div class="formula">Lx = ${f1(result.Lx)} cm，Ly = ${f1(result.Ly)} cm</div>
          <div class="formula">Sx = ${f1(result.sec.Sx)} cm³，Sy = ${f1(result.sec.Sy)} cm³</div>
        </div>
      <div class="step-card">
        <h4>2. 壓力構材板件分類</h4>
        ${getClassificationFlowLines(result).map((line) => `<div class="formula">${line}</div>`).join("")}
        </div>
        <div class="step-card">
          <h4>3. 細長比與軸壓強度</h4>
          <div class="formula">x 軸代入：Kx = ${f2(result.Kx)}，Lx = ${f1(result.Lx)} cm，rx = ${f2(result.sec.rx)} cm</div>
          <div class="formula">KxLx/rx = ${f2(result.Kx)} × ${f1(result.Lx)} / ${f2(result.sec.rx)} = ${f1(result.KLrX)}</div>
          <div class="formula">y 軸代入：Ky = ${f2(result.Ky)}，Ly = ${f1(result.Ly)} cm，ry = ${f2(result.sec.ry)} cm</div>
            <div class="formula">KyLy/ry = ${f2(result.Ky)} × ${f1(result.Ly)} / ${f2(result.sec.ry)} = ${f1(result.KLrY)}</div>
            <div class="formula">控制 KL/r = ${f1(result.KLrMax)}（${getColumnAxisDisplay(result.ctrlAxis)}）</div>
            <div class="formula">Fe = π²E/(KL/r)² = π² × ${f0(result.E)} / ${f1(result.KLrMax)}² = ${f0(result.pn.Fe)} kgf/cm²</div>
            <div class="formula">Fcr = ${f0(result.pn.Fcr)} kgf/cm²（${getColumnZoneLabel(result.pn.zone)}）</div>
            ${axialFactorLine}
            <div class="formula">${result.isLRFD ? "φPn" : "Pa"} = ${f2(result.designPcTf)} tf</div>
          </div>
        <div class="step-card">
          <h4>4. 主軸 / 弱軸彎矩強度</h4>
          ${flexureFactorLineX}
          <div class="formula">${result.isLRFD ? "φMnx" : "Mnx/Ω"} = ${f2(result.isLRFD ? result.flexX.phiMn_tfm : result.flexX.MnOmega_tfm)} tf·m</div>
          ${flexureFactorLineY}
          <div class="formula">${result.isLRFD ? "φMny" : "Mny/Ω"} = ${f2(result.isLRFD ? result.flexY.phiMny_tfm : result.flexY.MnyOmega_tfm)} tf·m</div>
        </div>
      <div class="step-card">
        <h4>5. 軸力—彎矩互制</h4>
        ${result.interDetail.map((line) => `<div class="formula">${line}</div>`).join("")}
      </div>
      ${result.pn.Q < 1 ? `<div class="step-card"><h4>6. 細長板件折減</h4><div class="formula">Qs = ${f2(result.pn.qr.Qs)}</div><div class="formula">Qa = ${f2(result.pn.qr.Qa)}</div><div class="formula">Q = ${f2(result.pn.Q)}</div></div>` : ""}
    `;
  }

  function runCheck() {
    renderFillStatus();
    const sectionType = getSectionType();
    const Fy = getLegacyInputValue("inFy", "stress");
    let sec;
    let clsC;

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
      clsC = Steel.classifyCompression(sec, Fy);
    } else if (sectionType === "shs") {
      const Bmm = num("inShsB");
      const tmm = num("inShsT");
      const selected = getGroupedSection(Steel.SHS_SECTIONS_MM, $("shsSelect").value);
      sec = Steel.calcSquareHssProps({ n: selected?.n || `SHS ${f0(Bmm)}×${f0(Bmm)}×${f1(tmm)}`, B: Bmm, t: tmm });
      if (!sec) {
        alert("請確認方管尺寸輸入完整且合理。");
        return null;
      }
      clsC = Steel.classifySquareHssCompression(sec, Fy);
      if (clsC.isSlender) {
        alert("目前方管正式檢核僅支援非細長 SHS；請調整 B/t 或改用 H 型鋼。");
        return null;
      }
    } else if (sectionType === "rhs") {
      const Hmm = num("inRhsH");
      const Bmm = num("inRhsB");
      const tmm = num("inRhsT");
      const selected = getGroupedSection(Steel.RHS_SECTIONS_MM, $("rhsSelect").value);
      if (Hmm < Bmm) {
        alert("矩形管請以 H ≥ B 輸入，讓 Mux 對應強軸、Muy 對應弱軸。");
        return null;
      }
      sec = Steel.calcRectHssProps({ n: selected?.n || `RHS ${f0(Hmm)}×${f0(Bmm)}×${f1(tmm)}`, H: Hmm, B: Bmm, t: tmm });
      if (!sec) {
        alert("請確認矩形管尺寸輸入完整且合理。");
        return null;
      }
      clsC = Steel.classifyRectHssCompression(sec, Fy);
      if (clsC.isSlender) {
        alert("目前矩形管正式檢核僅支援非細長 RHS；請調整 H/t、B/t 或改用其他斷面。");
        return null;
      }
    } else {
      const Dmm = num("inChsD");
      const tmm = num("inChsT");
      const selected = getGroupedSection(Steel.CHS_SECTIONS_MM, $("chsSelect").value);
      sec = Steel.calcRoundHssProps({ n: selected?.n || `CHS ${f1(Dmm)}×${f1(tmm)}`, D: Dmm, t: tmm });
      if (!sec) {
        alert("請確認圓管尺寸輸入完整且合理。");
        return null;
      }
      clsC = Steel.classifyRoundHssCompression(sec, Fy);
      if (clsC.isSlender) {
        alert("目前圓管正式檢核僅支援非細長 CHS；請調整 D/t 或改用 H 型鋼。");
        return null;
      }
    }

    const Lx = getLegacyInputValue("inLx", "memberLength");
    const Ly = getLegacyInputValue("inLy", "memberLength");
    const Kx = num("inKx") || 1.0;
    const Ky = num("inKy") || 1.0;
    const KLrX = Kx * Lx / sec.rx;
    const KLrY = Ky * Ly / sec.ry;
    const KLrMax = Math.max(KLrX, KLrY);
    const ctrlAxis = KLrX >= KLrY ? "x 軸" : "y 軸";
    const PuTf = Math.abs(getLegacyInputValue("inPu", "force"));
    const MuxTf = Math.abs(getLegacyInputValue("inMux", "moment"));
    const MuyTf = Math.abs(getLegacyInputValue("inMuy", "moment"));
    const usesLtbInput = sectionType === "h" || sectionType === "rhs";
    const Lbx = usesLtbInput ? (getLegacyInputValue("inLbx", "memberLength") || Lx) : 0;
    const Cbx = usesLtbInput ? (num("inCbx") || 1.0) : 1.0;
    const Cmx = num("inCmx") || 0.85;
    const Cmy = num("inCmy") || 0.85;
    const isLRFD = designMethod === "LRFD";

      const E = Steel.ES;
      const pn = sectionType === "h" ? Steel.calcPn(sec, Fy, KLrX, KLrY) : Steel.calcPnNonslender(sec, Fy, KLrX, KLrY);
    const designPcTf = isLRFD ? pn.phiPn_tf : pn.Pa_asd_tf;
    const axialOk = designPcTf >= PuTf;
    const ratioAx = designPcTf > 0 ? f1(PuTf / designPcTf * 100) : "∞";
    const PuKgf = PuTf * 1000;
    const flexX = sectionType === "h"
      ? Steel.calcMn(sec, Fy, Lbx, Cbx)
      : sectionType === "shs"
        ? Steel.calcMnSquareHss(sec, Fy)
        : sectionType === "rhs"
          ? Steel.calcMnRectHss(sec, Fy, "x", Lbx, Cbx)
        : Steel.calcMnRoundHss(sec, Fy);
    const flexY = sectionType === "h"
      ? Steel.calcMny(sec, Fy)
      : sectionType === "rhs"
        ? Steel.calcMnRectHss(sec, Fy, "y")
        : { ...flexX };
    let interOk = true;
    let interRatioText = "N/A";
    const interDetail = [];

    if (MuxTf > 0 || MuyTf > 0) {
        if (isLRFD) {
        const PI2 = Math.PI * Math.PI;
        const Pe1x = PI2 * E * sec.Ix / (Kx * Lx) ** 2;
        const Pe1y = PI2 * E * sec.Iy / (Ky * Ly) ** 2;
        const B1x = Steel.calcB1(Cmx, PuKgf, Pe1x);
        const B1y = Steel.calcB1(Cmy, PuKgf, Pe1y);
        const ir = Steel.calcInteraction(PuKgf, pn.phiPn, B1x * MuxTf * 1e5, flexX.phiMn, B1y * MuyTf * 1e5, flexY.phiMny);
        interOk = ir.ok;
        interRatioText = `${f2(ir.IR)} (${f1(ir.IR * 100)}%)`;
        if (sectionType !== "h") interDetail.push(getClosedShapeInteractionNote(sectionType));
        interDetail.push(`B1x = ${f2(B1x)}`, `B1y = ${f2(B1y)}`, `IR = ${f2(ir.IR)} ${ir.ok ? "≤" : ">"} 1.0`, `方程式：${ir.eqUsed}`);
      } else {
        const PI2 = Math.PI * Math.PI;
        const fa = PuKgf / sec.A;
        const fbx = MuxTf * 1e5 / sec.Sx;
        const fby = MuyTf * 1e5 / sec.Sy;
        const Fbx = flexX.Mn / (Steel.OMEGA.flexure * sec.Sx);
        const Fby = flexY.Mn / (Steel.OMEGA.flexure * sec.Sy);
        const Fex = 12 * PI2 * E / (23 * KLrX * KLrX);
        const Fey = 12 * PI2 * E / (23 * KLrY * KLrY);
        const ir = Steel.calcInteractionASD(fa, pn.Fa, fbx, Fbx, fby, Fby, Cmx, Cmy, Fex, Fey, Fy);
        const maxIR = Math.max(ir.IR1, ir.IR2 || 0);
        interOk = ir.ok;
        interRatioText = `${f2(maxIR)} (${f1(maxIR * 100)}%)`;
        if (sectionType !== "h") interDetail.push(getClosedShapeInteractionNote(sectionType));
        interDetail.push(`fa/Fa = ${f2(ir.ratio)}`, `IR1 = ${f2(ir.IR1)}`, `IR2 = ${f2(ir.IR2 || 0)}`, `方程式：${ir.eqUsed === "simplified" ? "簡化式" : "完整式"}`);
      }
    } else {
      interDetail.push("未輸入彎矩，故本次未啟動軸力—彎矩互制檢核。");
    }

    const classificationCards = sectionType === "h"
      ? `
        <div class="result-item ${clsC.flangeSlender ? "fail" : "ok"}"><span class="label">翼板分類</span><span class="value">${clsC.flangeSlender ? "細長" : "非細長"}</span></div>
        <div class="result-item ${clsC.webSlender ? "fail" : "ok"}"><span class="label">腹板分類</span><span class="value">${clsC.webSlender ? "細長" : "非細長"}</span></div>
      `
      : sectionType === "rhs"
        ? `
          <div class="result-item ${clsC.isSlender ? "fail" : "ok"}"><span class="label">壁厚分類</span><span class="value">${clsC.isSlender ? "細長" : "非細長"}</span></div>
          <div class="result-item"><span class="label">Bflat / t</span><span class="value">${f2(clsC.lambdaF)}</span></div>
          <div class="result-item"><span class="label">Hflat / t</span><span class="value">${f2(clsC.lambdaW)}</span></div>
        `
      : `
        <div class="result-item ${clsC.isSlender ? "fail" : "ok"}"><span class="label">壁厚分類</span><span class="value">${clsC.isSlender ? "細長" : "非細長"}</span></div>
        <div class="result-item"><span class="label">${sectionType === "shs" ? "Bflat / t" : "D / t"}</span><span class="value">${f2(clsC.lambdaF)}</span></div>
      `;
    const result = { sectionType, sec, clsC, pn, E, Fy, Kx, Ky, Lx, Ly, KLrX, KLrY, KLrMax, ctrlAxis, PuTf, MuxTf, MuyTf, Lbx, Cbx, isLRFD, designPcTf, axialOk, interOk, ratioAx, interRatioText, flexX, flexY, interDetail };
    renderProps(sec);
    $("clsResult").innerHTML = classificationCards;
    $("clsCard").style.display = "";
    $("slenderResult").innerHTML = `
      <div class="result-item"><span class="label">KxLx / rx</span><span class="value">${f1(KLrX)}</span></div>
      <div class="result-item"><span class="label">KyLy / ry</span><span class="value">${f1(KLrY)}</span></div>
      <div class="result-item ${KLrMax <= 200 ? "ok" : "warn"}"><span class="label">控制 KL/r</span><span class="value">${f1(KLrMax)} (${ctrlAxis})</span></div>
    `;
    $("slenderCard").style.display = "";
    $("axialResult").innerHTML = `
      <div class="result-item ${axialOk ? "ok" : "fail"}"><span class="label">${isLRFD ? "φPn" : "Pa"} vs |${isLRFD ? "Pu" : "Pa"}|</span><span class="value">${formatDisplayValue(designPcTf, "force", 2)} / ${formatDisplayValue(PuTf, "force", 2)} ${getQuantityUnit("force")}</span></div>
      <div class="result-item"><span class="label">Fe</span><span class="value">${formatDisplayValue(pn.Fe, "stress", unitMode === "si" ? 1 : 0)} ${getQuantityUnit("stress")}</span></div>
      <div class="result-item"><span class="label">Fcr</span><span class="value">${formatDisplayValue(pn.Fcr, "stress", unitMode === "si" ? 1 : 0)} ${getQuantityUnit("stress")}</span></div>
      ${pn.Q < 1 ? `<div class="result-item warn"><span class="label">Q</span><span class="value">${f2(pn.Q)}</span></div>` : ""}
    `;
    $("axialCard").style.display = "";
    $("interResult").innerHTML = `
      <div class="result-item ${(MuxTf > 0 || MuyTf > 0) ? (interOk ? "ok" : "fail") : "warn"}"><span class="label">互制狀態</span><span class="value">${interRatioText}</span></div>
      ${interDetail.map((line) => `<div class="result-item"><span class="label">互制資訊</span><span class="value">${line}</span></div>`).join("")}
    `;
    $("interCard").style.display = "";
    $("summaryResult").innerHTML = `<div class="member-note">${isOverallOk(result) ? "本次鋼柱斷面於細長比、軸壓與互制檢核均通過。" : "本次鋼柱斷面至少有一項控制條件未通過，請優先檢視 KL/r、Fcr 與互制項目。"}</div>`;
    $("summaryCard").style.display = "";
    renderSummary(result);
    renderFlow(result);
    resultState = result;
    return result;
  }

  function buildReport() {
    const result = runCheck();
    if (!result) return;
    const includeFlow = $("columnShowFlowInReport").checked;
    const includeSymbols = $("columnShowSymbolsInReport").checked;
    const includeNotes = $("columnShowNotesInReport").checked;
    const reportNotes = buildReportNotes(result);
    const summaryState = getColumnReportSummaryState(result);
    openReport({
      title: "鋼柱正式規範核算計算書",
      subtitle: `Steel Column Formal Report (${designMethod}｜${getCurrentInputModeLabel()})`,
        project: { name: $("projName").value.trim(), no: $("projNo").value.trim(), designer: $("projDesigner").value.trim() },
        highlights: getUnitReportHighlights(),
        summaryFacts: getColumnReportSummaryFacts(result),
        inputs: [
          { group: "單位系統", items: [
            { label: "輸入模式", value: getFormalUnitSummaryText() },
            { label: "換算對照", value: getFormalUnitConversionText() },
            { label: "流程顯示", value: getInternalUnitNoteText() },
          ]},
          { group: "斷面與材料", items: [
            { label: "規格", value: getSectionInputSummaryText(result) },
            { label: "Fy", value: formatDisplayValue(result.Fy, "stress", unitMode === "si" ? 1 : 0), unit: getQuantityUnit("stress") },
            { label: "rx", value: f2(result.sec.rx), unit: "cm" },
            { label: "ry", value: f2(result.sec.ry), unit: "cm" },
          ]},
          { group: "有效長度與穩定參數", items: [
            { label: "Lx", value: formatDisplayValue(result.Lx, "memberLength", unitMode === "si" ? 3 : 1), unit: getQuantityUnit("memberLength") },
            { label: "Ly", value: formatDisplayValue(result.Ly, "memberLength", unitMode === "si" ? 3 : 1), unit: getQuantityUnit("memberLength") },
            { label: "Kx", value: f2(result.Kx) },
            { label: "Ky", value: f2(result.Ky) },
            { label: "KxLx/rx", value: f1(result.KLrX) },
            { label: "KyLy/ry", value: f1(result.KLrY) },
            ...(result.sec.shape === "rhs" || result.sec.shape === "h" ? [
              { label: "Lbx", value: formatDisplayValue(result.Lbx, "memberLength", unitMode === "si" ? 3 : 1), unit: getQuantityUnit("memberLength") },
              { label: "Cbx", value: f2(result.Cbx) },
            ] : []),
          ]},
        { group: "設計需求", items: [
          { label: designMethod === "LRFD" ? "Pu" : "Pa", value: formatDisplayValue(result.PuTf, "force", 2), unit: getQuantityUnit("force") },
          { label: "Mux", value: formatDisplayValue(result.MuxTf, "moment", 2), unit: getQuantityUnit("moment") },
          { label: "Muy", value: formatDisplayValue(result.MuyTf, "moment", 2), unit: getQuantityUnit("moment") },
        ]},
      ],
          checks: [
            { group: "軸壓強度", items: [
              { label: "Fe", formula: "π²E/(KL/r)²", sub: `π² × ${f0(result.E)} / ${f1(result.KLrMax)}² = ${f0(result.pn.Fe)}`, value: formatDisplayValue(result.pn.Fe, "stress", unitMode === "si" ? 1 : 0), unit: getQuantityUnit("stress"), note: `第六章受壓構材｜控制 ${getColumnAxisDisplay(result.ctrlAxis)}` },
              { label: "Fcr", formula: result.pn.zone === "inelastic" ? "0.658^(Fy/Fe)Fy" : "0.877Fe", value: formatDisplayValue(result.pn.Fcr, "stress", unitMode === "si" ? 1 : 0), unit: getQuantityUnit("stress"), note: `挫屈區段：${getColumnZoneLabel(result.pn.zone)}` },
              { label: designMethod === "LRFD" ? "φPn ≥ |Pu|" : "Pa ≥ |Pa|", formula: designMethod === "LRFD" ? "φcPn" : "容許軸壓", sub: result.isLRFD ? `φc = ${f2(Steel.PHI.compress)}，${f2(result.designPcTf)} ≥ ${f2(result.PuTf)} ｜ KxLx/rx = ${f1(result.KLrX)}，KyLy/ry = ${f1(result.KLrY)}` : `Ωc = ${f2(Steel.OMEGA.compress)}，Pa = ${f2(result.designPcTf)} ≥ ${f2(result.PuTf)} ｜ KxLx/rx = ${f1(result.KLrX)}，KyLy/ry = ${f1(result.KLrY)}`, value: `${result.ratioAx}%`, ok: result.axialOk, note: `控制 KL/r = ${f1(result.KLrMax)}` },
            ]},
          { group: "互制檢核", items: [{ label: "互制狀態", formula: "第八章組合力互制式", sub: `${result.isLRFD ? `φb = ${f2(Steel.PHI.flexure)}` : `Ωb = ${f2(Steel.OMEGA.flexure)}`} ｜ ${result.interDetail.join(" ｜ ")}`, value: result.interRatioText, ok: result.interOk, note: `控制軸向：${getColumnAxisDisplay(result.ctrlAxis)}` }] },
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
    $("columnUnitModeLegacyBtn").addEventListener("click", () => setUnitMode("legacy"));
    $("columnUnitModeSiBtn").addEventListener("click", () => setUnitMode("si"));
    $("btnLRFD").addEventListener("click", () => { setMethod("LRFD"); resultState = runCheck(); });
    $("btnASD").addEventListener("click", () => { setMethod("ASD"); resultState = runCheck(); });
    $("runCheckBtn").addEventListener("click", () => { resultState = runCheck(); });
    $("btnReport").addEventListener("click", buildReport);
    $("printReportBtn").addEventListener("click", () => window.print());
    $("columnJumpGoverningBtn").addEventListener("click", () => scrollToBlock(getGoverningTarget()));
    $("columnJumpFirstNgBtn").addEventListener("click", () => {
      scrollToBlock(getFirstNgTarget());
    });
    $("columnJumpAlertsBtn").addEventListener("click", () => scrollToBlock($("columnReminderCard")));
    $("copySummaryBtn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("columnSummaryBanner").textContent.trim());
        $("reportStatus").textContent = "摘要已複製";
      } catch {
        $("reportStatus").textContent = "無法複製摘要";
      }
    });
    document.querySelectorAll(".section-tabs button").forEach((button) => button.addEventListener("click", () => activatePanel(button.dataset.panel)));
    $("columnQuickInputBtn").addEventListener("click", () => {
      $("inputColumn").scrollIntoView({ behavior: "smooth", block: "start" });
      updateQuickNavActive("input");
    });
    $("columnQuickReportBtn").addEventListener("click", () => {
      activatePanel("report");
      $("reportColumn").scrollIntoView({ behavior: "smooth", block: "start" });
      updateQuickNavActive("report");
    });
    $("columnQuickFlowBtn").addEventListener("click", () => {
      activatePanel("flow");
      $("panel-flow").scrollIntoView({ behavior: "smooth", block: "start" });
      updateQuickNavActive("flow");
    });
    $("columnMobileFab").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    $("columnInputPresetSmart").addEventListener("click", () => applyInputAccordionPreset("smart"));
    $("columnInputPresetFocus").addEventListener("click", () => applyInputAccordionPreset("focus"));
    $("columnInputPresetOpen").addEventListener("click", () => applyInputAccordionPreset("open"));
    $("columnReportPresetFocus").addEventListener("click", () => applyReportAccordionPreset(resultState, "focus"));
    $("columnReportPresetOpen").addEventListener("click", () => applyReportAccordionPreset(resultState, "open"));
    ["columnShowFlowInReport", "columnShowSymbolsInReport", "columnShowNotesInReport"].forEach((id) => {
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
