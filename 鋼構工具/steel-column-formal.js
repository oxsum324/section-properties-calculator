(function initSteelColumnFormal() {
  const $ = (id) => document.getElementById(id);
  const f2 = (value) => Number(value || 0).toFixed(2);
  const f1 = (value) => Number(value || 0).toFixed(1);
  const f0 = (value) => Math.round(Number(value || 0)).toLocaleString();
  const num = (id) => parseFloat($(id)?.value) || 0;
  const UI_PREFS_KEY = "steel-column-formal-ui-v2";
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
    $("methodBadge").textContent = `鋼構造建築物鋼結構設計技術規範｜鋼柱檢核 (${method})`;
    $("lblPu").textContent = isLRFD ? "Pu 軸力 (tf)" : "Pa 軸力 (tf)";
    $("lblMx").textContent = isLRFD ? "Mux 強軸彎矩 (tf·m)" : "Max 強軸彎矩 (tf·m)";
    $("lblMy").textContent = isLRFD ? "Muy 弱軸彎矩 (tf·m)" : "May 弱軸彎矩 (tf·m)";
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
        <tr><td>Sy</td><td>${f1(sec.Sy)}</td><td>cm³</td></tr>
        <tr><td>rx</td><td>${f2(sec.rx)}</td><td>cm</td></tr>
        <tr><td>ry</td><td>${f2(sec.ry)}</td><td>cm</td></tr>
      </tbody>
    `;
    $("propsCard").style.display = "";
  }

  function renderFillStatus() {
    const groups = [
      { id: "columnFillBasic", fields: ["codeBasisDisplay"] },
      { id: "columnFillSection", fields: ["secSelect", "inH", "inB", "inTw", "inTf"] },
      { id: "columnFillMaterial", fields: ["matSelect", "inFy", "inLx", "inLy", "inKx", "inKy"] },
      { id: "columnFillLoad", fields: ["inPu", "inMux", "inMuy", "inLbx", "inCbx", "inCmx", "inCmy"] },
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
    const fields = ["secSelect", "inH", "inB", "inTw", "inTf", "matSelect", "inFy", "inLx", "inLy", "inKx", "inKy", "inPu", "inMux", "inMuy", "inLbx", "inCbx", "inCmx", "inCmy"];
    const filled = fields.filter(isFilled).length;
    return { filled, total: fields.length };
  }

  function renderCardStatuses(result) {
    setCardMeta("columnMetaBasic", "neutral", "正式模組");
    setCardMeta(
      "columnMetaSection",
      $("secSelect").value || (isFilled("inH") && isFilled("inB") && isFilled("inTw") && isFilled("inTf")) ? "ok" : "warn",
      $("secSelect").value ? "已選型鋼" : "自訂斷面",
    );
    setCardMeta("columnMetaMaterial", (isFilled("inFy") && isFilled("inLx") && isFilled("inLy") && isFilled("inKx") && isFilled("inKy")) ? "ok" : "warn", "材料 / 穩定");
    if (!result) {
      setCardMeta("columnMetaLoad", "neutral", "待檢核");
      return;
    }
    const overallOk = result.axialOk && result.interOk && result.KLrMax <= 200;
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
      if (block.id === "columnReminderCard") shouldCollapse = !!result && result.axialOk && result.interOk && result.KLrMax <= 200;
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
          `λf = ${f2(result.clsC.lambdaF)}，λr = ${f2(result.clsC.lrf_comp)}`,
          `λw = ${f2(result.clsC.lambdaW)}，λr = ${f2(result.clsC.lrw_comp)}`,
        ].join("\n"),
      },
      {
        group: "2. 細長比與軸壓強度",
          body: [
            `x 軸代入：Kx = ${f2(result.Kx)}，Lx = ${f1(result.Lx)} cm，rx = ${f2(result.sec.rx)} cm`,
            `KxLx/rx = ${f2(result.Kx)} × ${f1(result.Lx)} / ${f2(result.sec.rx)} = ${f1(result.KLrX)}`,
            `y 軸代入：Ky = ${f2(result.Ky)}，Ly = ${f1(result.Ly)} cm，ry = ${f2(result.sec.ry)} cm`,
            `KyLy/ry = ${f2(result.Ky)} × ${f1(result.Ly)} / ${f2(result.sec.ry)} = ${f1(result.KLrY)}`,
            `控制 KL/r = ${f1(result.KLrMax)} (${result.ctrlAxis})`,
            `Fe = π²E/(KL/r)² = π² × ${f0(result.E)} / ${f1(result.KLrMax)}² = ${f0(result.pn.Fe)} kgf/cm²`,
            `Fcr = ${f0(result.pn.Fcr)} kgf/cm² (${result.pn.zone})`,
            axialFactorLine,
            `${result.isLRFD ? "φPn" : "Pa"} = ${f2(result.designPcTf)} tf，需求 = ${f2(result.PuTf)} tf`,
          ].join("\n"),
        },
        {
          group: "3. 主軸 / 弱軸彎矩強度",
          body: [
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
    return [
      "規範依據：鋼構造建築物鋼結構設計技術規範總則、極限設計法第六章受壓構材與第八章構材承受組合力及扭矩。",
      `有效長度輸入：Lx = ${f1(result.Lx)} cm，Ly = ${f1(result.Ly)} cm，Kx = ${f2(result.Kx)}，Ky = ${f2(result.Ky)}。`,
      `係數採用：軸壓 ${result.isLRFD ? `φc = ${f2(Steel.PHI.compress)}` : `Ωc = ${f2(Steel.OMEGA.compress)}`}；彎矩 ${result.isLRFD ? `φb = ${f2(Steel.PHI.flexure)}` : `Ωb = ${f2(Steel.OMEGA.flexure)}`}。`,
      `控制 KL/r：${f1(result.KLrMax)} (${result.ctrlAxis})。`,
      `輸出報表內容：${getReportContentSummaryText()}`,
      `互制狀態：${result.interRatioText}。`,
      `${result.isLRFD ? "LRFD 以強度折減因數 φ 表示可用強度。" : "ASD 軸壓比較值目前採傳統容許軸壓 Pa，彎矩則以 M/Ωb 之等效容量形式顯示；若需完全容許應力法表達，應另以 fa、fb 等應力格式出具。"} `,
    ];
  }

  function renderReminders(result) {
    const reminders = [
      {
        level: result.axialOk && result.interOk ? "ok" : "info",
        title: "規範檢核摘要",
        body: result.axialOk && result.interOk
          ? "本次鋼柱於軸壓與軸力—彎矩互制檢核均通過，可作為正式報表預覽基礎。"
          : "本頁已同步提供正式報表預覽、計算流程與控制項目；若有 NG，請優先檢視 KL/r、Fcr 與互制比。",
      },
      {
        level: "info",
        title: "控制軸向",
        body: `本次控制細長比為 ${f1(result.KLrMax)}，控制軸向為 ${result.ctrlAxis}；主要規範基準為第六章受壓構材與第八章構材承受組合力及扭矩。`,
      },
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
    const overallOk = result.axialOk && result.interOk;
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
    $("columnReportSubtitle").textContent = `Steel Column Formal Report (${designMethod})`;
    $("columnReportTitle").textContent = `鋼柱正式規範核算計算書｜${designMethod}`;
    $("columnGoverningMode").textContent = `${result.ctrlAxis}｜KL/r ${f1(result.KLrMax)}`;
  }

  function renderReviewBrief(result) {
    const overallOk = result.axialOk && result.interOk;
    $("columnReviewBriefBody").innerHTML = `
      ${pairRow("規範基準", "鋼構造建築物鋼結構設計技術規範｜第六章受壓構材、第八章構材承受組合力及扭矩")}
      ${pairRow("設計方法", designMethod)}
     ${pairRow("控制軸向", result.ctrlAxis)}
     ${pairRow("控制 KL/r", f1(result.KLrMax))}
     ${pairRow("輸出報表流程", getFlowApprovalText())}
     ${pairRow("符號說明", getSymbolsApprovalText())}
     ${pairRow("備註與條文說明", getNotesApprovalText())}
     ${pairRow("預計輸出符號", `${$("columnShowSymbolsInReport").checked ? buildReportSymbols(result, { includeFlow: $("columnShowFlowInReport").checked }).length : 0} 項`)}
     ${pairRow("預計輸出備註", `${$("columnShowNotesInReport").checked ? buildReportNotes(result).length : 0} 則`)}
     ${pairRow("整體判定", overallOk ? "全部通過" : "部分不通過，請檢視軸壓或互制控制項目")}
    `;
  }

  function renderInputSummary(result) {
    $("columnInputSummaryBody").innerHTML = `
      ${pairRow("斷面規格", result.sec.name)}
      ${pairRow("材料強度 Fy", `${f0(result.Fy)} kgf/cm²`)}
      ${pairRow("有效長度", `Lx = ${f1(result.Lx)} cm，Ly = ${f1(result.Ly)} cm`)}
     ${pairRow("K 值", `Kx = ${f2(result.Kx)}，Ky = ${f2(result.Ky)}`)}
     ${pairRow("設計需求", `${designMethod === "LRFD" ? "Pu" : "Pa"} = ${f2(result.PuTf)} tf，Mux = ${f2(result.MuxTf)} tf·m，Muy = ${f2(result.MuyTf)} tf·m`)}
     ${pairRow("互制參數", `Lbx = ${f2(num("inLbx"))} cm，Cbx = ${f2(num("inCbx"))}，Cmx = ${f2(num("inCmx"))}，Cmy = ${f2(num("inCmy"))}`)}
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
    const overallOk = result.axialOk && result.interOk;
    $("columnApprovalStamp").textContent = overallOk ? "通過" : "需調整";
    $("columnApprovalDecision").textContent = overallOk ? "可核可" : "需修正";
    $("columnApprovalGoverning").textContent = `${result.ctrlAxis}｜KL/r ${f1(result.KLrMax)}`;
    $("columnApprovalFlow").textContent = `${getFlowApprovalText()}｜${getSymbolsApprovalText()}｜${getNotesApprovalText()}`;
    $("columnOverallMessage").textContent = overallOk
      ? "鋼柱正式檢核已完成，右側可直接作為審查版預覽。"
      : "目前至少一項控制條件未通過；請先依審查摘要與提醒區調整。";
  }

  function renderHealthBar(result) {
    const chips = [
      { label: "正式核算", value: designMethod, tone: "neutral" },
      { label: "軸壓強度", value: result.axialOk ? "OK" : "NG", tone: result.axialOk ? "ok" : "fail" },
      { label: "互制檢核", value: result.interOk ? "OK" : "NG", tone: result.interOk ? "ok" : "fail" },
      { label: "控制軸向", value: result.ctrlAxis, tone: "neutral" },
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
    const overallOk = result.axialOk && result.interOk;
    $("columnSummaryBanner").className = `member-banner ${overallOk ? "ok" : "fail"}`;
    $("columnSummaryBanner").textContent = overallOk ? "全部通過｜鋼柱斷面目前符合檢核條件" : "部分不通過｜請檢視軸壓或互制控制項目";
    $("columnSummaryGrid").innerHTML = `
      <div class="member-summary-card"><span class="label">設計方法</span><span class="value">${designMethod}</span></div>
      <div class="member-summary-card"><span class="label">控制軸向</span><span class="value">${result.ctrlAxis}</span></div>
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
        <div class="formula">λf = bf/(2tf) = ${f2(result.clsC.lambdaF)}，λr = ${f2(result.clsC.lrf_comp)}</div>
        <div class="formula">λw = h/tw = ${f2(result.clsC.lambdaW)}，λr = ${f2(result.clsC.lrw_comp)}</div>
        </div>
        <div class="step-card">
          <h4>3. 細長比與軸壓強度</h4>
          <div class="formula">x 軸代入：Kx = ${f2(result.Kx)}，Lx = ${f1(result.Lx)} cm，rx = ${f2(result.sec.rx)} cm</div>
          <div class="formula">KxLx/rx = ${f2(result.Kx)} × ${f1(result.Lx)} / ${f2(result.sec.rx)} = ${f1(result.KLrX)}</div>
          <div class="formula">y 軸代入：Ky = ${f2(result.Ky)}，Ly = ${f1(result.Ly)} cm，ry = ${f2(result.sec.ry)} cm</div>
            <div class="formula">KyLy/ry = ${f2(result.Ky)} × ${f1(result.Ly)} / ${f2(result.sec.ry)} = ${f1(result.KLrY)}</div>
            <div class="formula">控制 KL/r = ${f1(result.KLrMax)} (${result.ctrlAxis})</div>
            <div class="formula">Fe = π²E/(KL/r)² = π² × ${f0(result.E)} / ${f1(result.KLrMax)}² = ${f0(result.pn.Fe)} kgf/cm²</div>
            <div class="formula">Fcr = ${f0(result.pn.Fcr)} kgf/cm² (${result.pn.zone})</div>
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
    const Lx = num("inLx");
    const Ly = num("inLy");
    const Kx = num("inKx") || 1.0;
    const Ky = num("inKy") || 1.0;
    const KLrX = Kx * Lx / sec.rx;
    const KLrY = Ky * Ly / sec.ry;
    const KLrMax = Math.max(KLrX, KLrY);
    const ctrlAxis = KLrX >= KLrY ? "x 軸" : "y 軸";
    const PuTf = Math.abs(num("inPu"));
    const MuxTf = Math.abs(num("inMux"));
    const MuyTf = Math.abs(num("inMuy"));
    const Lbx = num("inLbx") || Lx;
    const Cbx = num("inCbx") || 1.0;
    const Cmx = num("inCmx") || 0.85;
    const Cmy = num("inCmy") || 0.85;
    const isLRFD = designMethod === "LRFD";

      const E = Steel.ES;
      const clsC = Steel.classifyCompression(sec, Fy);
      const pn = Steel.calcPn(sec, Fy, KLrX, KLrY);
    const designPcTf = isLRFD ? pn.phiPn_tf : pn.Pa_asd_tf;
    const axialOk = designPcTf >= PuTf;
    const ratioAx = designPcTf > 0 ? f1(PuTf / designPcTf * 100) : "∞";
    const PuKgf = PuTf * 1000;
    const flexX = Steel.calcMn(sec, Fy, Lbx, Cbx);
    const flexY = Steel.calcMny(sec, Fy);
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
        interDetail.push(`fa/Fa = ${f2(ir.ratio)}`, `IR1 = ${f2(ir.IR1)}`, `IR2 = ${f2(ir.IR2 || 0)}`, `方程式：${ir.eqUsed === "simplified" ? "簡化式" : "完整式"}`);
      }
    } else {
      interDetail.push("未輸入彎矩，故本次未啟動軸力—彎矩互制檢核。");
    }

    renderProps(sec);
    $("clsResult").innerHTML = `
      <div class="result-item ${clsC.flangeSlender ? "fail" : "ok"}"><span class="label">翼板分類</span><span class="value">${clsC.flangeSlender ? "細長" : "非細長"}</span></div>
      <div class="result-item ${clsC.webSlender ? "fail" : "ok"}"><span class="label">腹板分類</span><span class="value">${clsC.webSlender ? "細長" : "非細長"}</span></div>
    `;
    $("clsCard").style.display = "";
    $("slenderResult").innerHTML = `
      <div class="result-item"><span class="label">KxLx / rx</span><span class="value">${f1(KLrX)}</span></div>
      <div class="result-item"><span class="label">KyLy / ry</span><span class="value">${f1(KLrY)}</span></div>
      <div class="result-item ${KLrMax <= 200 ? "ok" : "warn"}"><span class="label">控制 KL/r</span><span class="value">${f1(KLrMax)} (${ctrlAxis})</span></div>
    `;
    $("slenderCard").style.display = "";
    $("axialResult").innerHTML = `
      <div class="result-item ${axialOk ? "ok" : "fail"}"><span class="label">${isLRFD ? "φPn" : "Pa"} vs |${isLRFD ? "Pu" : "Pa"}|</span><span class="value">${f2(designPcTf)} / ${f2(PuTf)} tf</span></div>
      <div class="result-item"><span class="label">Fe</span><span class="value">${f0(pn.Fe)} kgf/cm²</span></div>
      <div class="result-item"><span class="label">Fcr</span><span class="value">${f0(pn.Fcr)} kgf/cm²</span></div>
      ${pn.Q < 1 ? `<div class="result-item warn"><span class="label">Q</span><span class="value">${f2(pn.Q)}</span></div>` : ""}
    `;
    $("axialCard").style.display = "";
    $("interResult").innerHTML = `
      <div class="result-item ${(MuxTf > 0 || MuyTf > 0) ? (interOk ? "ok" : "fail") : "warn"}"><span class="label">互制狀態</span><span class="value">${interRatioText}</span></div>
      ${interDetail.map((line) => `<div class="result-item"><span class="label">互制資訊</span><span class="value">${line}</span></div>`).join("")}
    `;
    $("interCard").style.display = "";
    $("summaryResult").innerHTML = `<div class="member-note">${axialOk && interOk ? "本次鋼柱斷面於軸壓與互制檢核均通過。" : "本次鋼柱斷面至少有一項控制條件未通過，請優先檢視 KL/r、Fcr 與互制項目。"}</div>`;
    $("summaryCard").style.display = "";

      const result = { sec, clsC, pn, E, Fy, Kx, Ky, Lx, Ly, KLrX, KLrY, KLrMax, ctrlAxis, PuTf, MuxTf, MuyTf, isLRFD, designPcTf, axialOk, interOk, ratioAx, interRatioText, flexX, flexY, interDetail };
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
    openReport({
      title: "鋼柱正式規範核算計算書",
      subtitle: `Steel Column Formal Report (${designMethod})`,
        project: { name: $("projName").value.trim(), no: $("projNo").value.trim(), designer: $("projDesigner").value.trim() },
        inputs: [
          { group: "斷面與材料", items: [
            { label: "規格", value: result.sec.name },
            { label: "Fy", value: result.Fy, unit: "kgf/cm²" },
            { label: "rx", value: f2(result.sec.rx), unit: "cm" },
            { label: "ry", value: f2(result.sec.ry), unit: "cm" },
          ]},
          { group: "有效長度與穩定參數", items: [
            { label: "Lx", value: f1(result.Lx), unit: "cm" },
            { label: "Ly", value: f1(result.Ly), unit: "cm" },
            { label: "Kx", value: f2(result.Kx) },
            { label: "Ky", value: f2(result.Ky) },
            { label: "KxLx/rx", value: f1(result.KLrX) },
            { label: "KyLy/ry", value: f1(result.KLrY) },
          ]},
        { group: "設計需求", items: [
          { label: designMethod === "LRFD" ? "Pu" : "Pa", value: result.PuTf, unit: "tf" },
          { label: "Mux", value: result.MuxTf, unit: "tf·m" },
          { label: "Muy", value: result.MuyTf, unit: "tf·m" },
        ]},
      ],
          checks: [
            { group: "軸壓強度", items: [
              { label: "Fe", formula: "π²E/(KL/r)²", sub: `π² × ${f0(result.E)} / ${f1(result.KLrMax)}² = ${f0(result.pn.Fe)}`, value: f0(result.pn.Fe), unit: "kgf/cm²", note: `第六章受壓構材｜控制 ${result.ctrlAxis}` },
              { label: "Fcr", formula: result.pn.zone === "inelastic" ? "0.658^(Fy/Fe)Fy" : "0.877Fe", value: f0(result.pn.Fcr), unit: "kgf/cm²", note: `挫屈區段：${result.pn.zone}` },
              { label: designMethod === "LRFD" ? "φPn ≥ |Pu|" : "Pa ≥ |Pa|", formula: designMethod === "LRFD" ? "φcPn" : "容許軸壓", sub: result.isLRFD ? `φc = ${f2(Steel.PHI.compress)}，${f2(result.designPcTf)} ≥ ${f2(result.PuTf)} ｜ KxLx/rx = ${f1(result.KLrX)}，KyLy/ry = ${f1(result.KLrY)}` : `Ωc = ${f2(Steel.OMEGA.compress)}，Pa = ${f2(result.designPcTf)} ≥ ${f2(result.PuTf)} ｜ KxLx/rx = ${f1(result.KLrX)}，KyLy/ry = ${f1(result.KLrY)}`, value: `${result.ratioAx}%`, ok: result.axialOk, note: `控制 KL/r = ${f1(result.KLrMax)}` },
            ]},
          { group: "互制檢核", items: [{ label: "互制狀態", formula: "第八章組合力互制式", sub: `${result.isLRFD ? `φb = ${f2(Steel.PHI.flexure)}` : `Ωb = ${f2(Steel.OMEGA.flexure)}`} ｜ ${result.interDetail.join(" ｜ ")}`, value: result.interRatioText, ok: result.interOk, note: `控制軸向：${result.ctrlAxis}` }] },
      ],
      summary: { ok: result.axialOk && result.interOk, text: result.axialOk && result.interOk ? "全部通過" : "請檢視控制項目" },
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
