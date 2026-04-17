(function initSteelBeamFormal() {
  const $ = (id) => document.getElementById(id);
  const f2 = (value) => Number(value || 0).toFixed(2);
  const f1 = (value) => Number(value || 0).toFixed(1);
  const f0 = (value) => Math.round(Number(value || 0)).toLocaleString();
  const num = (id) => parseFloat($(id)?.value) || 0;
  const UI_PREFS_KEY = "steel-beam-formal-ui-v2";
  const isFilled = (id) => {
    const field = $(id);
    if (!field) return false;
    if (field.tagName === "SELECT") return field.value !== "";
    return String(field.value ?? "").trim() !== "";
  };

  let designMethod = "LRFD";
  let quickNavTicking = false;
  let reportJumpTicking = false;
  let currentInputPreset = "smart";
  let currentReportPreset = "focus";
  let currentPanel = "report";

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
    ["LTB", "橫向扭轉挫屈", "-", "未側撐壓縮翼板發生側移與扭轉耦合之撓曲失穩模式。", "控制模式判讀。", "第七章橫向扭轉挫屈條文"],
    ["FLB", "翼板局部挫屈", "-", "受壓翼板局部板件先行挫屈而控制撓曲強度。", "控制模式判讀。", "第七章翼板局部挫屈條文"],
    ["Yielding", "降伏控制", "-", "斷面達到撓曲降伏或塑性彎矩上限所控制。", "控制模式判讀。", "第七章撓曲降伏條文"],
    ["Mn", "標稱彎矩強度", "kgf·cm", "綜合降伏、LTB 與局部挫屈後之控制彎矩強度。", "主軸彎矩檢核。", "第七章撓曲構材強度"],
    ["φb", "撓曲強度折減因數", "-", "LRFD 撓曲強度採用之折減因數。", "LRFD φMn 顯示與檢核。", "第七章撓曲構材設計強度"],
    ["Ωb", "撓曲安全因數", "-", "ASD 以標稱彎矩強度換算可用強度時採用之安全因數。", "ASD Mn/Ωb 顯示與檢核。", "第七章撓曲構材安全因數"],
    ["Aw", "腹板剪力面積", "cm²", "腹板淨高乘腹板厚度。", "剪力強度。", "第七章剪力條文"],
    ["Cv1", "腹板剪力折減係數", "-", "依腹板高厚比與剪力挫屈條件取得。", "剪力強度。", "第七章剪力條文"],
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

  function buildSecOptions() {
    const select = $("secSelect");
    Steel.H_SECTIONS_MM.forEach((group) => {
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

  function buildMatOptions() {
    const select = $("matSelect");
    Steel.FY_OPTIONS.forEach((item, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = item.label;
      select.appendChild(option);
    });
  }

  function onSecSelect() {
    const raw = $("secSelect").value;
    if (!raw) return;
    const [groupName, indexRaw] = raw.split("|");
    const group = Steel.H_SECTIONS_MM.find((item) => item.g === groupName);
    if (!group) return;
    const section = group.s[parseInt(indexRaw, 10)];
    $("inH").value = section.H;
    $("inB").value = section.B;
    $("inTw").value = section.tw;
    $("inTf").value = section.tf;
    $("inR").value = section.R;
  }

  function onMatSelect() {
    const item = Steel.FY_OPTIONS[parseInt($("matSelect").value || "0", 10)];
    if (item) $("inFy").value = item.Fy;
  }

  function setMethod(method) {
    designMethod = method;
    const isLRFD = method === "LRFD";
    $("btnLRFD").classList.toggle("active", isLRFD);
    $("btnASD").classList.toggle("active", !isLRFD);
    $("methodBadge").textContent = `鋼構造建築物鋼結構設計技術規範｜鋼梁檢核 (${method})`;
    $("lblMu").textContent = isLRFD ? "Mu 主軸彎矩 (tf·m)" : "Ma 主軸彎矩 (tf·m)";
    $("lblVu").textContent = isLRFD ? "Vu 剪力 (tf)" : "Va 剪力 (tf)";
    $("loadTitle").textContent = isLRFD ? "載重 (LRFD)" : "載重 (ASD / 使用荷重)";
    persistUiPrefs();
  }

  function renderProps(sec) {
    $("propsTable").innerHTML = `
      <thead><tr><th>項目</th><th>數值</th><th>單位</th></tr></thead>
      <tbody>
        <tr><td>規格</td><td>${sec.name}</td><td>-</td></tr>
        <tr><td>A</td><td>${f2(sec.A)}</td><td>cm²</td></tr>
        <tr><td>Ix</td><td>${f0(sec.Ix)}</td><td>cm⁴</td></tr>
        <tr><td>Iy</td><td>${f0(sec.Iy)}</td><td>cm⁴</td></tr>
        <tr><td>Sx</td><td>${f1(sec.Sx)}</td><td>cm³</td></tr>
        <tr><td>Zx</td><td>${f1(sec.Zx)}</td><td>cm³</td></tr>
        <tr><td>ry</td><td>${f2(sec.ry)}</td><td>cm</td></tr>
        <tr><td>rts</td><td>${f2(sec.rts)}</td><td>cm</td></tr>
        <tr><td>Aw</td><td>${f2(sec.Aw)}</td><td>cm²</td></tr>
      </tbody>
    `;
    $("propsCard").style.display = "";
  }

  function renderFillStatus() {
    const groups = [
      { id: "beamFillBasic", fields: ["codeBasisDisplay"] },
      { id: "beamFillSection", fields: ["secSelect", "inH", "inB", "inTw", "inTf"] },
      { id: "beamFillMaterial", fields: ["matSelect", "inFy", "inL", "inLb", "inCb"] },
      { id: "beamFillLoad", fields: ["inMu", "inVu", "inWD", "inWL", "limL", "limT"] },
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
    const fields = ["secSelect", "inH", "inB", "inTw", "inTf", "matSelect", "inFy", "inL", "inLb", "inCb", "inMu", "inVu", "inWD", "inWL", "limL", "limT"];
    const filled = fields.filter(isFilled).length;
    return { filled, total: fields.length };
  }

  function renderCardStatuses(result) {
    setCardMeta("beamMetaBasic", "neutral", "正式模組");
    setCardMeta(
      "beamMetaSection",
      $("secSelect").value || (isFilled("inH") && isFilled("inB") && isFilled("inTw") && isFilled("inTf")) ? "ok" : "warn",
      $("secSelect").value ? "已選型鋼" : "自訂斷面",
    );
    setCardMeta("beamMetaMaterial", (isFilled("inFy") && isFilled("inL") && isFilled("inLb") && isFilled("inCb")) ? "ok" : "warn", "材料 / 穩定");
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

  function buildReportSteps(result) {
    const strengthMoment = result.isLRFD ? result.flex.phiMn_tfm : result.flex.MnOmega_tfm;
    const strengthShear = result.isLRFD ? result.shear.phiVn_tf : result.shear.VnOmega_tf;
    const flexureFactorLine = result.isLRFD
      ? `φb = ${f2(Steel.PHI.flexure)}，φMn = ${f2(Steel.PHI.flexure)} × ${f2(result.flex.Mn / 1e5)} = ${f2(strengthMoment)} tf·m`
      : `Ωb = ${f2(Steel.OMEGA.flexure)}，Mn/Ωb = ${f2(result.flex.Mn / 1e5)} / ${f2(Steel.OMEGA.flexure)} = ${f2(strengthMoment)} tf·m`;
    const shearFactorLine = result.isLRFD
      ? `φv = ${f2(result.shear.phiV)}，φVn = ${f2(result.shear.phiV)} × ${f2(result.shear.Vn / 1000)} = ${f2(strengthShear)} tf`
      : `Ωv = ${f2(result.shear.omgV)}，Vn/Ωv = ${f2(result.shear.Vn / 1000)} / ${f2(result.shear.omgV)} = ${f2(strengthShear)} tf`;
    return [
      {
        group: "1. 斷面性質與分類",
        body: [
          `A = ${f2(result.sec.A)} cm²`,
          `Sx = ${f1(result.sec.Sx)} cm³，Zx = ${f1(result.sec.Zx)} cm³`,
          `ry = ${f2(result.sec.ry)} cm，rts = ${f2(result.sec.rts)} cm`,
          `λf = ${f2(result.cls.lambdaF)}，塑性界限 = ${f2(result.cls.lpf)}，非結實界限 = ${f2(result.cls.lrf)}`,
          `λw = ${f2(result.cls.lambdaW)}，塑性界限 = ${f2(result.cls.lpw)}，非結實界限 = ${f2(result.cls.lrw)}`,
        ].join("\n"),
      },
      {
        group: "2. 撓曲強度檢核",
          body: [
            `Mp = Fy × Zx = ${f0(result.Fy)} × ${f1(result.sec.Zx)} = ${f2(result.flex.Mp / 1e5)} tf·m`,
            `Lb = ${f1(result.Lb)} cm，Cb = ${f2(result.Cb)}`,
            `Lp = ${f1(result.flex.Lp)} cm，Lr = ${f1(result.flex.Lr)} cm`,
            `Mn = ${f2(result.flex.Mn / 1e5)} tf·m，控制模式 = ${result.flex.governing}`,
            flexureFactorLine,
            `${result.isLRFD ? "φMn" : "Mn / Ω"} = ${f2(strengthMoment)} tf·m，需求 = ${f2(result.demandMoment)} tf·m`,
          ].join("\n"),
        },
      {
        group: "3. 剪力強度檢核",
          body: [
            `Aw = ${f2(result.sec.Aw)} cm²`,
            `Cv1 = ${f2(result.shear.Cv1)}`,
            `Vn = 0.6 × Fy × Aw × Cv1 = 0.6 × ${f0(result.Fy)} × ${f2(result.sec.Aw)} × ${f2(result.shear.Cv1)}`,
            shearFactorLine,
            `${result.isLRFD ? "φVn" : "Vn / Ω"} = ${f2(strengthShear)} tf，需求 = ${f2(result.demandShear)} tf`,
          ].join("\n"),
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
      "Aw",
      "Cv1",
      "Vn",
      "φv / Ωv",
      "ΔL",
      "ΔT",
      result.flex.webSection,
      result.flex.governing,
    ]);
    if (includeFlow) {
      ["λf", "λw", "Lb", "Cb", "Mp", "Lp", "Lr", "Sx / Zx", "ry / rts"].forEach((item) => used.add(item));
    }
    return glossaryItems.filter((item) => used.has(item[0])).map((item) => ({
      sym: item[0],
      desc: `${item[1]}：${item[3]}${item[5] ? `（${item[5]}）` : ""}`,
    }));
  }

  function buildReportNotes(result) {
    return [
      "規範依據：鋼構造建築物鋼結構設計技術規範總則與極限設計法第七章撓曲構材。",
      `控制條文分類：${result.flex.webSection}，控制模式：${result.flex.governing}。`,
      `控制條文說明：${getClauseExplanation(result.flex.webSection)}`,
      `控制模式說明：${getGoverningModeExplanation(result.flex.governing, result.flex.ltbZone)}`,
      `係數採用：撓曲 ${result.isLRFD ? `φb = ${f2(Steel.PHI.flexure)}` : `Ωb = ${f2(Steel.OMEGA.flexure)}`}；剪力 ${result.isLRFD ? `φv = ${f2(result.shear.phiV)}` : `Ωv = ${f2(result.shear.omgV)}`}。`,
      `輸出報表內容：${getReportContentSummaryText()}`,
      `${result.isLRFD ? "LRFD 以強度折減因數 φ 表示可用強度。" : "ASD 目前以 Mn/Ωb、Vn/Ωv 的等效容量形式呈現；若需完全容許應力法表達，應另以 Fb、Fv 應力格式出具。"} `,
      "撓度限值由設計者依使用性需求輸入；如涉積水載重，應另依規範 11.3 節及附錄 4 檢核。",
    ];
  }

  function getClauseExplanation(webSection) {
    const map = {
      F2: "F2 代表腹板為結實、翼板亦為結實之 I 形撓曲構材，通常以撓曲降伏與橫向扭轉挫屈條文控制。",
      F3: "F3 代表腹板為結實，但翼板為非結實或細長之 I 形撓曲構材，除 LTB 外尚須留意翼板局部挫屈折減。",
      F4: "F4 代表腹板為非結實之 I 形撓曲構材，撓曲強度除降伏與 LTB 外，亦受腹板非結實條文控制。",
      F5: "F5 代表腹板為細長之 I 形撓曲構材，需依細長腹板條文修正有效強度。",
    };
    return map[webSection] || "此條文分類為撓曲構材強度判讀用代號，應回到第七章對應條文確認適用算式。";
  }

  function getGoverningModeExplanation(governing, ltbZone) {
    const map = {
      Yielding: "Yielding 表示本次由斷面降伏或塑性彎矩上限控制，尚未因 LTB 或局部挫屈進一步折減。",
      LTB: `LTB 表示由橫向扭轉挫屈控制；目前區段屬 ${ltbZone === "plastic" ? "塑性區" : ltbZone === "inelastic" ? "非彈性 LTB 區" : ltbZone === "elastic" ? "彈性 LTB 區" : "LTB 控制區"}。`,
      FLB: "FLB 表示由翼板局部挫屈控制，應依翼板寬厚比與第七章相應條文檢視強度折減。",
    };
    return map[governing] || "此控制模式為撓曲強度控制名稱，請回到第七章對應條文檢視適用條件。";
  }

  function renderReminders(result) {
    const reminders = [
      {
        level: result.flexOk && result.shearOk && result.deflStatus === "ok" ? "ok" : "info",
        title: "規範檢核摘要",
        body: result.flexOk && result.shearOk && result.deflStatus === "ok"
          ? "本次鋼梁於撓曲、剪力與撓度檢核均通過，可作為正式報表預覽基礎。"
          : "本頁已同步提供正式報表預覽、計算流程與控制項目；若有 NG，請優先檢視控制模式與需求比。",
      },
      {
        level: "info",
        title: "控制條文",
        body: `本次撓曲控制模式為 ${result.flex.governing}，條文分類為 ${result.flex.webSection}；主要規範基準為第七章撓曲構材。`,
      },
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
        body: `${designMethod === "LRFD" ? "φMn" : "Mn/Ω"} 小於需求彎矩，需調整斷面、側撐間距或載重條件，並回到第七章撓曲構材相關條文重新確認。`,
      });
    }
    if (!result.shearOk) {
      reminders.push({
        level: "fail",
        title: "剪力強度未通過",
        body: `${designMethod === "LRFD" ? "φVn" : "Vn/Ω"} 小於需求剪力，請優先檢視腹板厚度與剪力折減係數 Cv1，並依第七章剪力條文調整。`,
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
    const overallOk = result.flexOk && result.shearOk && result.deflStatus === "ok";
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
        title: `控制條文分類｜${result.flex.webSection}`,
        body: getClauseExplanation(result.flex.webSection),
      },
      {
        level: "info",
        title: `控制模式｜${result.flex.governing}`,
        body: getGoverningModeExplanation(result.flex.governing, result.flex.ltbZone),
      },
      {
        level: "warn",
        title: "符號與代號檢核",
        body: "本頁涉及之 F2/F3/F4/F5、LTB、FLB、Lp、Lr、Cb、rts、Cv1 等符號與專有名詞，已同步納入參數詞典；輸出報表時亦會帶入符號說明。",
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
    $("beamReportSubtitle").textContent = `Steel Beam Formal Report (${designMethod})`;
    $("beamReportTitle").textContent = `鋼梁正式規範核算計算書｜${designMethod}`;
    $("beamGoverningMode").textContent = result.flex.governing;
  }

  function renderReviewBrief(result) {
    const overallOk = result.flexOk && result.shearOk && result.deflStatus === "ok";
    $("beamReviewBriefBody").innerHTML = `
      ${pairRow("規範基準", "鋼構造建築物鋼結構設計技術規範｜第七章撓曲構材")}
      ${pairRow("設計方法", designMethod)}
      ${pairRow("控制模式", result.flex.governing)}
      ${pairRow("控制條文分類", result.flex.webSection)}
      ${pairRow("輸出報表流程", getFlowApprovalText())}
      ${pairRow("符號說明", getSymbolsApprovalText())}
      ${pairRow("備註與條文說明", getNotesApprovalText())}
      ${pairRow("預計輸出符號", `${$("beamShowSymbolsInReport").checked ? buildReportSymbols(result, { includeFlow: $("beamShowFlowInReport").checked }).length : 0} 項`)}
      ${pairRow("預計輸出備註", `${$("beamShowNotesInReport").checked ? buildReportNotes(result).length : 0} 則`)}
      ${pairRow("整體判定", overallOk ? "全部通過" : "部分不通過，請檢視控制項目")}
    `;
  }

  function renderInputSummary(result) {
    $("beamInputSummaryBody").innerHTML = `
      ${pairRow("斷面規格", result.sec.name)}
      ${pairRow("材料強度 Fy", `${f0(result.Fy)} kgf/cm²`)}
      ${pairRow("跨度 / 側撐間距", `L = ${f1(result.L)} cm，Lb = ${f1(result.Lb)} cm`)}
      ${pairRow("設計需求", `${designMethod === "LRFD" ? "Mu" : "Ma"} = ${f2(result.demandMoment)} tf·m，${designMethod === "LRFD" ? "Vu" : "Va"} = ${f2(result.demandShear)} tf`)}
      ${pairRow("使用載重", `wD = ${f2(num("inWD"))} kgf/cm，wL = ${f2(num("inWL"))} kgf/cm`)}
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
    const overallOk = result.flexOk && result.shearOk && result.deflStatus === "ok";
    $("beamApprovalStamp").textContent = overallOk ? "通過" : "需調整";
    $("beamApprovalDecision").textContent = overallOk ? "可核可" : "需修正";
    $("beamApprovalGoverning").textContent = result.flex.governing;
    $("beamApprovalFlow").textContent = `${getFlowApprovalText()}｜${getSymbolsApprovalText()}｜${getNotesApprovalText()}`;
    $("beamOverallMessage").textContent = overallOk
      ? "鋼梁正式檢核已完成，右側可直接作為審查版預覽。"
      : "目前至少一項控制條件未通過；請先依審查摘要與提醒區調整。";
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
      { label: "控制模式", value: result.flex.governing, tone: "neutral" },
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
    const overallOk = result.flexOk && result.shearOk && result.deflStatus === "ok";
    $("beamSummaryBanner").className = `member-banner ${overallOk ? "ok" : (result.deflStatus === "skipped" && result.flexOk && result.shearOk ? "warn" : "fail")}`;
    $("beamSummaryBanner").textContent = overallOk
      ? "全部通過｜鋼梁斷面目前符合檢核條件"
      : (result.deflStatus === "skipped" && result.flexOk && result.shearOk ? "強度通過｜目前未執行撓度檢核" : "部分不通過｜請檢視控制項目");
    $("beamSummaryGrid").innerHTML = `
      <div class="member-summary-card"><span class="label">設計方法</span><span class="value">${designMethod}</span></div>
      <div class="member-summary-card"><span class="label">控制條文</span><span class="value">${result.flex.webSection}</span></div>
      <div class="member-summary-card"><span class="label">控制模式</span><span class="value">${result.flex.governing}</span></div>
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
    const strengthMoment = result.isLRFD ? result.flex.phiMn_tfm : result.flex.MnOmega_tfm;
    const strengthShear = result.isLRFD ? result.shear.phiVn_tf : result.shear.VnOmega_tf;
    const flexureFactorLine = result.isLRFD
      ? `<div class="formula">φb = ${f2(Steel.PHI.flexure)}，φMn = ${f2(Steel.PHI.flexure)} × ${f2(result.flex.Mn / 1e5)} = ${f2(strengthMoment)} tf·m</div>`
      : `<div class="formula">Ωb = ${f2(Steel.OMEGA.flexure)}，Mn / Ωb = ${f2(result.flex.Mn / 1e5)} / ${f2(Steel.OMEGA.flexure)} = ${f2(strengthMoment)} tf·m</div>`;
    const shearFactorLine = result.isLRFD
      ? `<div class="formula">φv = ${f2(result.shear.phiV)}，φVn = ${f2(result.shear.phiV)} × ${f2(result.shear.Vn / 1000)} = ${f2(strengthShear)} tf</div>`
      : `<div class="formula">Ωv = ${f2(result.shear.omgV)}，Vn / Ωv = ${f2(result.shear.Vn / 1000)} / ${f2(result.shear.omgV)} = ${f2(strengthShear)} tf</div>`;
    $("beamFlowBody").innerHTML = `
      <div class="step-card">
        <h4>1. 斷面性質</h4>
        <div class="formula">A = ${f2(result.sec.A)} cm²</div>
        <div class="formula">Sx = ${f1(result.sec.Sx)} cm³, Zx = ${f1(result.sec.Zx)} cm³</div>
        <div class="formula">ry = ${f2(result.sec.ry)} cm, rts = ${f2(result.sec.rts)} cm</div>
      </div>
      <div class="step-card">
        <h4>2. 斷面分類</h4>
        <div class="formula">λf = bf/(2tf) = ${f2(result.cls.lambdaF)}</div>
        <div class="formula">塑性界限 = ${f2(result.cls.lpf)}，非結實界限 = ${f2(result.cls.lrf)}</div>
        <div class="formula">λw = hw/tw = ${f2(result.cls.lambdaW)}</div>
        <div class="formula">塑性界限 = ${f2(result.cls.lpw)}，非結實界限 = ${f2(result.cls.lrw)}</div>
      </div>
      <div class="step-card">
        <h4>3. 撓曲強度</h4>
        <div class="formula">Mp = Fy × Zx = ${f0(result.Fy)} × ${f1(result.sec.Zx)} = ${f2(result.flex.Mp / 1e5)} tf·m</div>
          <div class="formula">Lb = ${f1(result.Lb)} cm, Cb = ${f2(result.Cb)}</div>
          <div class="formula">Lp = ${f1(result.flex.Lp)} cm, Lr = ${f1(result.flex.Lr)} cm</div>
          <div class="formula">Mn = min(Mn,yield, Mn,LTB, Mn,FLB) = ${f2(result.flex.Mn / 1e5)} tf·m</div>
          ${flexureFactorLine}
        </div>
        <div class="step-card">
          <h4>4. 剪力強度</h4>
          <div class="formula">Vn = 0.6 × Fy × Aw × Cv1</div>
          <div class="formula">= 0.6 × ${f0(result.Fy)} × ${f2(result.sec.Aw)} × ${f2(result.shear.Cv1)}</div>
          ${shearFactorLine}
        </div>
      <div class="step-card">
        <h4>5. 撓度檢核</h4>
        <div class="formula">ΔL = ${f2(result.deflection.deltaL)} cm，容許 = ${f2(result.allowLive)} cm</div>
        <div class="formula">ΔT = ${f2(result.deflection.deltaT)} cm，容許 = ${f2(result.allowTotal)} cm</div>
      </div>
    `;
  }

  function runCheck() {
    renderFillStatus();
    const mm = { n: "自訂", H: num("inH"), B: num("inB"), tw: num("inTw"), tf: num("inTf"), R: num("inR") };
    const secRaw = $("secSelect").value;
    if (secRaw) {
      const [groupName, indexRaw] = secRaw.split("|");
      const group = Steel.H_SECTIONS_MM.find((item) => item.g === groupName);
      if (group) mm.n = group.s[parseInt(indexRaw, 10)].n;
    }
    if (!mm.H || !mm.B || !mm.tw || !mm.tf || mm.tf * 2 >= mm.H) {
      alert("請確認斷面尺寸輸入完整且合理。");
      return null;
    }
    const sec = Steel.calcProps(mm);
    const Fy = num("inFy");
    const Lb = num("inLb");
    const Cb = num("inCb") || 1.0;
    const L = num("inL");
    const isLRFD = designMethod === "LRFD";
    const demandMoment = Math.abs(num("inMu"));
    const demandShear = Math.abs(num("inVu"));
    const cls = Steel.classify(sec, Fy);
    const flex = Steel.calcMn(sec, Fy, Lb, Cb);
    const shear = Steel.calcVn(sec, Fy);
    const strengthMoment = isLRFD ? flex.phiMn_tfm : flex.MnOmega_tfm;
    const strengthShear = isLRFD ? shear.phiVn_tf : shear.VnOmega_tf;
    const flexOk = strengthMoment >= demandMoment;
    const shearOk = strengthShear >= demandShear;
    const ratioFlex = strengthMoment > 0 ? f1(demandMoment / strengthMoment * 100) : "∞";
    const ratioShear = strengthShear > 0 ? f1(demandShear / strengthShear * 100) : "∞";
    const deflection = Steel.calcDeflection(sec, num("inWD"), num("inWL"), L);
    const limitLive = parseInt($("limL").value, 10);
    const limitTotal = parseInt($("limT").value, 10);
    const allowLive = L / limitLive;
    const allowTotal = L / limitTotal;
    let deflStatus = "skipped";
    if (num("inWD") > 0 || num("inWL") > 0) {
      deflStatus = deflection.deltaL <= allowLive && deflection.deltaT <= allowTotal ? "ok" : "fail";
    }

    renderProps(sec);
    $("clsResult").innerHTML = `
      <div class="result-item ${cls.flange === "slender" ? "fail" : "ok"}"><span class="label">翼板分類</span><span class="value">${cls.flange}</span></div>
      <div class="result-item ${cls.web === "slender" ? "fail" : "ok"}"><span class="label">腹板分類</span><span class="value">${cls.web}</span></div>
    `;
    $("clsCard").style.display = "";
    $("flexResult").innerHTML = `
      <div class="result-item ${flexOk ? "ok" : "fail"}"><span class="label">${isLRFD ? "φMn" : "Mn/Ω"} vs |${isLRFD ? "Mu" : "Ma"}|</span><span class="value">${f2(strengthMoment)} / ${f2(demandMoment)} tf·m</span></div>
      <div class="result-item"><span class="label">控制模式</span><span class="value">${flex.governing}</span></div>
      <div class="result-item"><span class="label">條文分類</span><span class="value">${flex.webSection}</span></div>
    `;
    $("flexCard").style.display = "";
    $("shearResult").innerHTML = `
      <div class="result-item ${shearOk ? "ok" : "fail"}"><span class="label">${isLRFD ? "φVn" : "Vn/Ω"} vs |${isLRFD ? "Vu" : "Va"}|</span><span class="value">${f2(strengthShear)} / ${f2(demandShear)} tf</span></div>
      <div class="result-item"><span class="label">Cv1</span><span class="value">${f2(shear.Cv1)}</span></div>
    `;
    $("shearCard").style.display = "";
    $("deflResult").innerHTML = `
      <div class="result-item ${deflStatus === "ok" ? "ok" : deflStatus === "fail" ? "fail" : "warn"}"><span class="label">撓度狀態</span><span class="value">${deflStatus === "ok" ? "OK" : deflStatus === "fail" ? "NG" : "未檢核"}</span></div>
      <div class="result-item"><span class="label">ΔL / 容許值</span><span class="value">${f2(deflection.deltaL)} / ${f2(allowLive)} cm</span></div>
      <div class="result-item"><span class="label">ΔT / 容許值</span><span class="value">${f2(deflection.deltaT)} / ${f2(allowTotal)} cm</span></div>
    `;
    $("deflCard").style.display = "";
    $("summaryResult").innerHTML = `<div class="member-note">${flexOk && shearOk && deflStatus === "ok" ? "本次鋼梁斷面於主軸彎矩、剪力與撓度檢核均通過。" : "本次鋼梁斷面至少有一項控制條件未通過，請優先檢視控制模式與撓度條件。"}</div>`;
    $("summaryCard").style.display = "";

    const result = { sec, cls, flex, shear, deflection, Fy, Lb, Cb, L, isLRFD, flexOk, shearOk, ratioFlex, ratioShear, deflStatus, allowLive, allowTotal, demandMoment, demandShear };
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
    openReport({
      title: "鋼梁正式規範核算計算書",
      subtitle: `Steel Beam Formal Report (${designMethod})`,
      project: { name: $("projName").value.trim(), no: $("projNo").value.trim(), designer: $("projDesigner").value.trim() },
      inputs: [
        { group: "斷面與材料", items: [
          { label: "規格", value: result.sec.name },
          { label: "Fy", value: result.Fy, unit: "kgf/cm²" },
          { label: "Lb", value: result.Lb, unit: "cm" },
          { label: "Cb", value: result.Cb },
        ]},
        { group: "設計需求", items: [
          { label: designMethod === "LRFD" ? "Mu" : "Ma", value: result.demandMoment, unit: "tf·m" },
          { label: designMethod === "LRFD" ? "Vu" : "Va", value: result.demandShear, unit: "tf" },
          { label: "跨度 L", value: result.L, unit: "cm" },
        ]},
      ],
        checks: [
          { group: "撓曲強度", items: [
            { label: "Mp", formula: "Fy × Zx", sub: `${f0(result.Fy)} × ${f1(result.sec.Zx)}`, value: f2(result.flex.Mp / 1e5), unit: "tf·m", note: "第七章撓曲構材塑性彎矩" },
            { label: designMethod === "LRFD" ? "φMn ≥ |Mu|" : "Mn/Ω ≥ |Ma|", formula: designMethod === "LRFD" ? "φMn" : "Mn / Ω", sub: result.isLRFD ? `φb = ${f2(Steel.PHI.flexure)}，${f2(result.flex.phiMn_tfm)} ≥ ${f2(result.demandMoment)}` : `Ωb = ${f2(Steel.OMEGA.flexure)}，${f2(result.flex.MnOmega_tfm)} ≥ ${f2(result.demandMoment)}`, value: `${result.ratioFlex}%`, ok: result.flexOk, note: `控制模式：${result.flex.governing}` },
          ]},
          { group: "剪力強度", items: [
            { label: "Vn", formula: "0.6FyAwCv1", sub: `0.6 × ${f0(result.Fy)} × ${f2(result.sec.Aw)} × ${f2(result.shear.Cv1)}`, value: f2(result.shear.Vn / 1000), unit: "tf", note: "第七章剪力條文" },
            { label: designMethod === "LRFD" ? "φVn ≥ |Vu|" : "Vn/Ω ≥ |Va|", formula: designMethod === "LRFD" ? "φVn" : "Vn / Ω", sub: result.isLRFD ? `φv = ${f2(result.shear.phiV)}，${f2(result.shear.phiVn_tf)} ≥ ${f2(result.demandShear)}` : `Ωv = ${f2(result.shear.omgV)}，${f2(result.shear.VnOmega_tf)} ≥ ${f2(result.demandShear)}`, value: `${result.ratioShear}%`, ok: result.shearOk, note: `Cv1 = ${f2(result.shear.Cv1)}` },
          ]},
        { group: "撓度與使用性", items: [
          { label: "活載重撓度", formula: "ΔL ≤ L / limit", sub: `${f2(result.deflection.deltaL)} ≤ ${f2(result.allowLive)}`, value: result.deflStatus === "skipped" ? "未檢核" : (result.deflection.deltaL <= result.allowLive ? "OK" : "NG"), ok: result.deflStatus === "skipped" ? null : result.deflection.deltaL <= result.allowLive, note: `限值：L/${$("limL").value}` },
          { label: "總撓度", formula: "ΔT ≤ L / limit", sub: `${f2(result.deflection.deltaT)} ≤ ${f2(result.allowTotal)}`, value: result.deflStatus === "skipped" ? "未檢核" : (result.deflection.deltaT <= result.allowTotal ? "OK" : "NG"), ok: result.deflStatus === "skipped" ? null : result.deflection.deltaT <= result.allowTotal, note: `限值：L/${$("limT").value}` },
        ]},
      ],
      summary: { ok: result.flexOk && result.shearOk && result.deflStatus === "ok", text: result.flexOk && result.shearOk && result.deflStatus === "ok" ? "全部通過" : "請檢視控制項目" },
      steps: includeFlow ? buildReportSteps(result) : [],
      symbols: includeSymbols ? buildReportSymbols(result, { includeFlow }) : [],
      notes: includeNotes ? reportNotes : [],
    });
  }

  function bindEvents() {
    $("secSelect").addEventListener("change", () => { onSecSelect(); resultState = runCheck(); });
    $("matSelect").addEventListener("change", () => { onMatSelect(); resultState = runCheck(); });
    $("btnLRFD").addEventListener("click", () => { setMethod("LRFD"); resultState = runCheck(); });
    $("btnASD").addEventListener("click", () => { setMethod("ASD"); resultState = runCheck(); });
    $("runCheckBtn").addEventListener("click", runCheck);
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
      if (!["projName", "projNo", "projDesigner"].includes(input.id)) {
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
  loadUiPrefs();
  renderGlossary();
  let resultState = null;
  prepareInputCardAccordions();
  prepareReportBlockAccordions();
  bindEvents();
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
