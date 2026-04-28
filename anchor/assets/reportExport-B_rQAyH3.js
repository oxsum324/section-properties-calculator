import{i as e,r as t,t as n}from"./appMeta-BIMJoTA0.js";import{c as r,o as i}from"./units-MZTj-v8w.js";import{c as a,d as o,l as s,n as c,r as l,s as u,u as d}from"./index-M5E2-QVL.js";import{t as f}from"./seismicRouteGuidance-Bd1hg0fM.js";function p(e){return e.replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function m(e){return Number.isFinite(e)?new Intl.NumberFormat(`zh-TW`,{maximumFractionDigits:2}).format(e):`—`}function h(e){switch(e){case`pass`:return`符合`;case`fail`:return`不符合`;case`screening`:return`初篩`;case`incomplete`:return`需補資料`;case`warning`:return`提醒`;default:return e}}function g(e){switch(e){case`cast_in`:return`預埋錨栓`;case`post_installed_expansion`:return`後置膨脹錨栓`;case`post_installed_bonded`:return`後置黏結式錨栓`;case`screw_anchor`:return`螺紋錨栓`;case`undercut_anchor`:return`擴底式錨栓`;case`shear_lug`:return`剪力榫`;default:return e}}function ee(e){return e===`summary`?`摘要版`:`完整明細版`}function _(e,t){return`${t} ${e}`}function v(e){if(!e)return`—`;let t=new Date(e);return Number.isNaN(t.getTime())?e:t.toLocaleDateString(`zh-TW`,{year:`numeric`,month:`2-digit`,day:`2-digit`})}function y(e){if(!e)return`—`;let t=new Date(e);return Number.isNaN(t.getTime())?e:t.toLocaleString(`zh-TW`,{year:`numeric`,month:`2-digit`,day:`2-digit`,hour:`2-digit`,minute:`2-digit`})}function b(e,t=12){return e?e.slice(0,Math.max(8,t)).toUpperCase():`—`}function x(e){switch(e){case`manual`:return`手動留存`;case`preview`:return`報表預覽`;case`print`:return`列印報表`;case`html`:return`匯出 HTML`;case`xlsx`:return`匯出 XLSX`;case`docx`:return`匯出 DOCX`;default:return`—`}}function te(e){return e===`product`?`產品值`:e===`code_fallback`?`規範退回值`:`規範值`}function S(e,t,n){return Number.isFinite(e)?`${m(r(e,t,n))} ${i(t,n)}`:`—`}function C(e,t){let n=e.anchorCountX*e.anchorCountY,r=Math.min(e.edgeLeftMm,e.edgeRightMm,e.edgeBottomMm,e.edgeTopMm);return[`${e.anchorCountX} × ${e.anchorCountY}（${n} 支）`,`hef ${S(e.effectiveEmbedmentMm,`length`,t)}`,`sx ${S(e.spacingXmm,`length`,t)}`,`sy ${S(e.spacingYmm,`length`,t)}`,`cmin ${S(r,`length`,t)}`].join(` / `)}function w(e,t,n){return e.presentation===`ratio`?m(t):e.presentation===`stress`?S(t,`stress`,n):e.presentation===`length`?S(t,`length`,n):S(t,`force`,n)}function T(e){return!e.factors||e.factors.length===0?`—`:e.factors.map(e=>e.note?`${e.symbol}=${e.value}（${e.label}；${e.note}）`:`${e.symbol}=${e.value}（${e.label}）`).join(`；`)}function E(e){return e.governingDcr??e.maxDcr}function D(e){if(e.project.layout.basePlateLoadedAreaMm2>0)return e.project.layout.basePlateLoadedAreaMm2;let t=Math.max(0,e.project.layout.basePlateLoadedWidthMm??0),n=Math.max(0,e.project.layout.basePlateLoadedHeightMm??0);return t>0&&n>0?t*n:0}function O(e){return e.project.layout.basePlateSectionType===`custom`?`custom`:`rectangle`}function k(e){return e===`custom`?`自訂 Sx / Sy`:`矩形承壓區`}function A(e){switch(e){case`i_h`:return`I / H 形柱`;case`rect`:return`矩形柱`;case`pipe`:return`圓管 / 圓柱`;default:return`手動輸入`}}function j(e){switch(e){case`ready`:return`pass`;case`configuration_issue`:return`warning`;default:return`incomplete`}}function M(e){return`zone-${e}`}function N(e){return`<span class="chip chip-${e}">${p(h(e))}</span>`}function P(e,t){let{layout:n}=e.project,r=o(n,e.anchorPoints),i=u(n,e.analysisLoads),a=new Map,s=new Map(e.visualization.anchors.map(e=>[e.anchorId,e]));e.visualization.edges.forEach(e=>{let t=a.get(e.edge)??[];t.includes(e.label)||t.push(e.label),a.set(e.edge,t)});let c=e.visualization.rectangles.map(e=>`<rect x="${e.x1}" y="${e.y1}" width="${e.x2-e.x1}" height="${e.y2-e.y1}" class="zone ${M(e.kind)}" />`).join(``),l=i?`<g>
        <rect
          x="${i.loadedArea.x1}"
          y="${i.loadedArea.y1}"
          width="${i.loadedArea.x2-i.loadedArea.x1}"
          height="${i.loadedArea.y2-i.loadedArea.y1}"
          class="bearing-zone"
        />
        ${i.contactArea?`<rect
                x="${i.contactArea.x1}"
                y="${i.contactArea.y1}"
                width="${i.contactArea.x2-i.contactArea.x1}"
                height="${i.contactArea.y2-i.contactArea.y1}"
                class="bearing-contact-zone bearing-contact-zone-${i.mode}"
              />`:``}
        <text
          x="${i.labelX}"
          y="${i.labelY}"
          class="bearing-overlay-label"
        >${p(i.label)}</text>
      </g>`:``,d=e.anchorPoints.map(e=>{let t=s.get(e.id),n=t?.state===`tension`?`anchor-tension`:t?.state===`compression`?`anchor-compression`:`anchor-neutral`,r=t?`${t.elasticTensionKn>=0?`+`:``}${m(t.elasticTensionKn)}`:`0`;return`<g>
        <circle cx="${e.x}" cy="${e.y}" r="10" class="anchor ${n}" />
        <circle cx="${e.x}" cy="${e.y}" r="3" class="anchor-center" />
        <text x="${e.x}" y="${e.y-16}" text-anchor="middle" class="anchor-label">${p(e.id)}</text>
        <text x="${e.x}" y="${e.y+24}" text-anchor="middle" class="anchor-demand">${p(r)}</text>
      </g>`}).join(``),f=Array.from(a.entries()).map(([e,t])=>{let r=p(t.join(` / `));return e===`left`?`<g><line x1="4" y1="0" x2="4" y2="${n.concreteHeightMm}" class="edge-highlight" /><text x="12" y="22" class="edge-label">${r}</text></g>`:e===`right`?`<g><line x1="${n.concreteWidthMm-4}" y1="0" x2="${n.concreteWidthMm-4}" y2="${n.concreteHeightMm}" class="edge-highlight" /><text x="${n.concreteWidthMm-12}" y="22" text-anchor="end" class="edge-label">${r}</text></g>`:e===`bottom`?`<g><line x1="0" y1="${n.concreteHeightMm-4}" x2="${n.concreteWidthMm}" y2="${n.concreteHeightMm-4}" class="edge-highlight" /><text x="12" y="${n.concreteHeightMm-12}" class="edge-label">${r}</text></g>`:`<g><line x1="0" y1="4" x2="${n.concreteWidthMm}" y2="4" class="edge-highlight" /><text x="12" y="22" class="edge-label">${r}</text></g>`}).join(``),h=r?`<g>
        <rect
          x="${r.x1}"
          y="${r.y1}"
          width="${r.x2-r.x1}"
          height="${r.y2-r.y1}"
          class="reinforcement-zone"
        />
        <line
          x1="${r.x1}"
          y1="${r.y1}"
          x2="${r.x2}"
          y2="${r.y2}"
          class="reinforcement-line"
        />
        <line
          x1="${r.x2}"
          y1="${r.y1}"
          x2="${r.x1}"
          y2="${r.y2}"
          class="reinforcement-line"
        />
        <text
          x="${r.labelX}"
          y="${r.labelY}"
          class="reinforcement-label"
        >${p(r.label)}</text>
      </g>`:``;return`<svg class="geometry" viewBox="0 0 ${n.concreteWidthMm} ${n.concreteHeightMm}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${n.concreteWidthMm}" height="${n.concreteHeightMm}" rx="8" class="concrete-body" />
    ${l}
    ${c}
    ${h}
    ${f}
    ${d}
    <text x="16" y="24" class="sketch-title">混凝土平面 / 活躍組合</text>
    <text x="16" y="46" class="sketch-legend">紅 = 受拉，藍 = 受壓，灰 = 中性；青 = A_Nc，橘 = A_Vc，綠 = 錨栓補強鋼筋，紫 = A1 / 接觸承壓區</text>
    <text x="16" y="${n.concreteHeightMm-14}" class="sketch-meta">${p(`${S(n.concreteWidthMm,`length`,t)} × ${S(n.concreteHeightMm,`length`,t)}`)}</text>
  </svg>`}var F=`.concrete-body { fill:#edf1f6; stroke:#7f8ea3; stroke-width:3; }
  .bearing-zone { fill:rgba(123,92,168,.09); stroke:rgba(94,65,139,.42); stroke-width:2.4; stroke-dasharray:10 8; }
  .bearing-contact-zone { fill:rgba(110,77,163,.20); stroke:rgba(85,56,132,.56); stroke-width:2.8; }
  .bearing-contact-zone-uplift_x,.bearing-contact-zone-uplift_y,.bearing-contact-zone-uplift_xy { fill:rgba(129,72,191,.24); }
  .bearing-overlay-label { fill:#45315f; font-size:16px; font-weight:700; }
  .zone-tension_breakout { fill:rgba(14,165,233,.18); stroke:#0284c7; stroke-width:2; }
  .zone-shear_breakout_x,.zone-shear_breakout_y { fill:rgba(249,115,22,.16); stroke:#ea580c; stroke-width:2; }
  .reinforcement-zone { fill:rgba(24,133,84,.08); stroke:rgba(20,108,69,.6); stroke-width:2.5; stroke-dasharray:10 8; }
  .reinforcement-line { stroke:rgba(20,108,69,.55); stroke-width:2.5; stroke-linecap:round; }
  .edge-highlight { stroke:#dc2626; stroke-width:4; stroke-dasharray:10 8; }
  .edge-label,.anchor-label,.anchor-demand,.sketch-title,.sketch-legend,.sketch-meta,.reinforcement-label { font-size:12px; fill:#22304a; }
  .anchor { stroke:#10213b; stroke-width:2; }
  .anchor-tension { fill:#ef4444; }
  .anchor-compression { fill:#2563eb; }
  .anchor-neutral { fill:#9ca3af; }
  .anchor-center { fill:#fff; }`;function I(e,t){return P(e,t).replace(/<svg([^>]*)>/,(e,t)=>`<svg${t} xmlns="http://www.w3.org/2000/svg"><defs><style>${F}</style></defs>`)}function L(r){let{batchReview:o,candidateProductReviews:u,layoutVariantReviews:h=[],review:M,selectedProduct:F,completeness:I,evaluationFieldStates:L,unitPreferences:R,reportSettings:z,auditEntry:B,auditTrail:V=[],autoPrint:H=!1,reportGeneratedAt:U=new Date().toISOString()}=r,W=e(M.project.calcEngineVersion),G=W.mismatch?`本案原始版本 ${W.projectVersion}，目前以 ${W.runtimeVersion} 重算；正式交付前應重新檢核並留痕。`:`本案計算版本與目前工具版本一致：${W.runtimeVersion}`,K=new Set(M.project.excludedCheckIds??[]),q=M.results.filter(e=>!K.has(e.id)),J=L.filter(e=>e.hasValue||e.hasEvidence),ne=q.filter(e=>e.factors&&e.factors.length>0),re=q.find(e=>e.id===`seismic`)??null,Y=M.project.loads.considerSeismic?f(M.project.loads,F,re):null,X=O(M),Z=a(M.project.layout),Q=d(M.project.layout),$=s(M.project.layout),ie=o.loadCaseReviews.map(e=>{let t=u.map(t=>{let n=t.batchReview.loadCaseReviews.find(t=>t.loadCaseId===e.loadCaseId);return n?`<td>
            <strong>DCR ${p(m(E(n.review.summary)))}</strong><br />
            ${N(n.review.summary.overallStatus)}<br />
            <small>${p(n.review.summary.governingMode)}${t.batchReview.controllingLoadCaseId===e.loadCaseId?` / 該產品控制`:``}</small>
          </td>`:`<td>—</td>`}).join(``),n=e.loadCaseId===o.activeLoadCaseId&&e.loadCaseId===o.controllingLoadCaseId?`（目前編輯 / 控制組合）`:e.loadCaseId===o.activeLoadCaseId?`（目前編輯）`:e.loadCaseId===o.controllingLoadCaseId?`（控制組合）`:``;return`<tr><td>${p(e.loadCaseName+n)}</td>${t}</tr>`}).join(``),ae=o.loadCaseReviews.map(e=>{let t=h.map(t=>{let n=t.batchReview.loadCaseReviews.find(t=>t.loadCaseId===e.loadCaseId);return n?`<td>
              <div class="matrix-cell${t.batchReview.controllingLoadCaseId===e.loadCaseId?` matrix-cell-controlling`:``}">
                <strong>DCR ${p(m(E(n.review.summary)))}</strong>
                ${N(n.review.summary.overallStatus)}
                <small>${p(n.review.summary.governingMode)}${t.batchReview.controllingLoadCaseId===e.loadCaseId?` / 該配置控制`:``}</small>
              </div>
            </td>`:`<td>—</td>`}).join(``),n=e.loadCaseId===o.activeLoadCaseId&&e.loadCaseId===o.controllingLoadCaseId?`目前編輯 / 控制組合`:e.loadCaseId===o.activeLoadCaseId?`目前編輯`:e.loadCaseId===o.controllingLoadCaseId?`控制組合`:`批次結果`;return`<tr>
          <td>
            <div class="table-mode">
              <strong>${p(e.loadCaseName)}</strong>
              <small>${p(n)}</small>
            </div>
          </td>
          ${t}
        </tr>`}).join(``);return`<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${p(M.project.name)} - 錨栓檢討報告</title>
    <style>
      @page {
        size: A4;
        margin: 14mm 12mm 16mm;
        @bottom-right {
          content: "第 " counter(page) " / " counter(pages) " 頁";
          font-size: 9pt;
          color: #5b6475;
        }
      }
      :root { color-scheme: light; --ink:#14213d; --muted:#5b6475; --line:#d8deea; --panel:#f7f9fc; --accent:#0b7285; --warn:#c2410c; --pass:#166534; --fail:#b91c1c; --screen:#7c3aed; }
      * { box-sizing:border-box; }
      body { margin:0; font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif; color:var(--ink); background:#eef2f7; }
      main { max-width:1120px; margin:0 auto; padding:32px 24px 72px; }
      h1,h2,h3 { margin:0 0 12px; }
      p,li,td,th,dd,dt,small,span,strong { line-height:1.5; }
      .hero { background:linear-gradient(135deg,#ffffff 0%,#eef8fb 100%); border:1px solid var(--line); border-radius:24px; padding:28px; margin-bottom:24px; }
      .hero-logo { display:block; max-width:160px; max-height:80px; margin-bottom:14px; object-fit:contain; }
      .hero-grid,.grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); }
      .card { background:#fff; border:1px solid var(--line); border-radius:20px; padding:20px; margin-bottom:20px; box-shadow:0 8px 20px rgba(20,33,61,.06); }
      .chip { display:inline-block; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700; margin-right:6px; }
      .chip-pass { background:#dcfce7; color:var(--pass); }
      .chip-fail { background:#fee2e2; color:var(--fail); }
      .chip-incomplete { background:#fef3c7; color:#92400e; }
      .chip-screening { background:#ede9fe; color:var(--screen); }
      .chip-warning { background:#ffedd5; color:var(--warn); }
      .meta { color:var(--muted); }
      table { width:100%; border-collapse:collapse; }
      th,td { border:1px solid var(--line); padding:10px 12px; text-align:left; vertical-align:top; }
      th { background:#eef5fb; }
      .route-matrix { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin:14px 0; }
      .route-matrix-card { border:1px solid var(--line); border-radius:14px; padding:12px; background:rgba(255,255,255,.76); }
      .route-matrix-card-current { box-shadow:inset 0 0 0 1px rgba(15,84,97,.12); }
      .route-matrix-card-ready { border-color:rgba(13,107,85,.22); }
      .route-matrix-card-needs_input { border-color:rgba(201,138,45,.24); }
      .route-matrix-card-configuration_issue { border-color:rgba(194,109,62,.26); }
      .route-matrix-head { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; margin-bottom:10px; }
      .route-matrix-head strong { display:block; }
      .route-matrix-head small { color:var(--muted); }
      .route-matrix-bar { height:10px; border-radius:999px; background:rgba(15,58,69,.09); overflow:hidden; margin-bottom:8px; }
      .route-matrix-bar span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg, rgba(15,84,97,.88), rgba(194,109,62,.82)); }
      .geometry-wrap { overflow:auto; background:var(--panel); border:1px solid var(--line); border-radius:18px; padding:12px; }
      .geometry { width:100%; min-width:420px; height:auto; }
      .concrete-body { fill:#edf1f6; stroke:#7f8ea3; stroke-width:3; }
      .bearing-zone { fill:rgba(123,92,168,.09); stroke:rgba(94,65,139,.42); stroke-width:2.4; stroke-dasharray:10 8; }
      .bearing-contact-zone { fill:rgba(110,77,163,.20); stroke:rgba(85,56,132,.56); stroke-width:2.8; }
      .bearing-contact-zone-uplift_x,.bearing-contact-zone-uplift_y,.bearing-contact-zone-uplift_xy { fill:rgba(129,72,191,.24); }
      .bearing-overlay-label { fill:#45315f; font-size:16px; font-weight:700; }
      .zone-tension_breakout { fill:rgba(14,165,233,.18); stroke:#0284c7; stroke-width:2; }
      .zone-shear_breakout_x,.zone-shear_breakout_y { fill:rgba(249,115,22,.16); stroke:#ea580c; stroke-width:2; }
      .reinforcement-zone { fill:rgba(24,133,84,.08); stroke:rgba(20,108,69,.6); stroke-width:2.5; stroke-dasharray:10 8; }
      .reinforcement-line { stroke:rgba(20,108,69,.55); stroke-width:2.5; stroke-linecap:round; }
      .edge-highlight { stroke:#dc2626; stroke-width:4; stroke-dasharray:10 8; }
      .edge-label,.anchor-label,.anchor-demand,.sketch-title,.sketch-legend,.sketch-meta,.reinforcement-label { font-size:12px; fill:#22304a; }
      .anchor { stroke:#10213b; stroke-width:2; }
      .anchor-tension { fill:#ef4444; }
      .anchor-compression { fill:#2563eb; }
      .anchor-neutral { fill:#9ca3af; }
      .anchor-center { fill:#fff; }
      ul { margin:8px 0 0; padding-left:20px; }
      .report-preview-toolbar {
        position: fixed; top: 16px; right: 16px; z-index: 1000;
        display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
        padding: 10px 14px; background: rgba(255,255,255,0.96);
        border: 1px solid #cbd5d8; border-radius: 999px;
        box-shadow: 0 6px 20px rgba(23, 49, 58, 0.18);
        font-size: 13px;
      }
      .report-preview-toolbar button {
        background: #0b7285; color: #fff; border: 1px solid #0b7285;
        padding: 6px 14px; border-radius: 999px; cursor: pointer;
        font-size: 13px; font-weight: 600;
      }
      .report-preview-toolbar button:hover { background: #095d6e; }
      .report-preview-toolbar button[aria-label='關閉預覽視窗'] {
        background: #fff; color: #4b5f66; border-color: #cbd5d8;
      }
      .report-preview-toolbar button[aria-label='關閉預覽視窗']:hover {
        background: #f0f4f5;
      }
      .preview-toolbar-hint { color: #6a7a80; font-size: 12px; }
      @media print {
        body { background:#fff; }
        main { max-width:none; padding:0; }
        .card,.hero,.geometry-wrap { box-shadow:none; break-inside:avoid-page; }
        table { break-inside:auto; }
        tr,td,th { break-inside:avoid; }
        h2,h3 { break-after:avoid-page; }
        .hero { break-after:page; }
        .report-preview-toolbar { display: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="report-preview-toolbar" data-role="preview-toolbar">
      <button type="button" onclick="window.print()" aria-label="列印報表">
        🖨 列印 / 另存 PDF
      </button>
      <button type="button" onclick="window.close()" aria-label="關閉預覽視窗">
        ✕ 關閉視窗
      </button>
      <span class="preview-toolbar-hint">預覽列印效果；印出後此工具列會自動隱藏</span>
    </div>
    <main>
      <section class="hero">
        ${z.companyLogoDataUrl?`<img src="${p(z.companyLogoDataUrl)}" alt="${p(z.companyName||`公司 LOGO`)}" class="hero-logo" />`:``}
        <p class="meta">${p(z.companyName||`工程報表草稿`)}</p>
        <h1>${p(M.project.name)}</h1>
        <p>台灣《建築物混凝土結構設計規範》112年版第17章 錨栓檢討 ${p(ee(z.reportMode))}</p>
        <div class="hero-grid">
          <div><small class="meta">案號 / 專案</small><div>${p(z.projectCode||`未填`)}</div></div>
          <div><small class="meta">規範版本</small><div>${p(M.ruleProfile.versionLabel)}</div></div>
          <div><small class="meta">發行日期</small><div>${p(v(z.issueDate))}</div></div>
          <div><small class="meta">${l.editedAt}</small><div>${p(y(M.project.updatedAt))}</div></div>
          <div><small class="meta">${l.generatedAt}</small><div>${p(y(U))}</div></div>
          <div><small class="meta">${l.auditedAt}</small><div>${p(y(B?.createdAt))}</div></div>
          <div><small class="meta">${l.auditSource} / ${l.auditHash}</small><div>${p(B?`${x(B.source)} · ${b(B.hash)}`:`尚未留存`)}</div></div>
          <div><small class="meta">整體判定</small><div>${N(o.summary.overallStatus)}</div></div>
          <div><small class="meta">正式判定</small><div>${N(o.summary.formalStatus)}</div></div>
          <div><small class="meta">控制模式</small><div>${p(o.summary.governingMode)}</div></div>
          <div><small class="meta">控制組合</small><div>${p(o.controllingLoadCaseName)}</div></div>
        </div>
      </section>

      <section class="grid">
        <article class="card">
          <h2>產品與案例</h2>
          <p><strong>${p(F.brand)} ${p(F.model)}</strong> / ${p(g(F.family))}</p>
          <ul>
            <li>錨栓直徑 da = ${p(S(F.diameterMm,`length`,R))}</li>
            <li>Ase = ${p(S(F.effectiveAreaMm2,`area`,R))}</li>
            <li>目前單位 = ${p(i(`length`,R))} / ${p(i(`area`,R))} / ${p(i(`force`,R))} / ${p(i(`stress`,R))}</li>
            <li>產品完整性 = ${p(I.formal?`正式判定`:`需補資料`)}</li>
            <li>案件計算版本 = <code>${p(W.projectVersion)}</code></li>
            <li>目前工具版本 = <code>${p(W.runtimeVersion)}</code> / build ${p(y(n))}</li>
            <li>基板承壓 = ${p(M.project.layout.basePlateBearingEnabled?`已啟用（A1 ${S(D(M),`area`,R)} / ${k(X)}${Z.widthMm>0&&Z.heightMm>0?` / B × N ${S(Z.widthMm,`length`,R)} × ${S(Z.heightMm,`length`,R)}`:``}${(M.project.layout.columnCentroidOffsetXmm??0)!==0||(M.project.layout.columnCentroidOffsetYmm??0)!==0?` / 柱偏移 ${S(M.project.layout.columnCentroidOffsetXmm??0,`length`,R)} × ${S(M.project.layout.columnCentroidOffsetYmm??0,`length`,R)}`:``}${M.project.layout.basePlateBendingEnabled?` / tp ${S(M.project.layout.basePlateThicknessMm,`length`,R)} / Fy ${S(M.project.layout.basePlateSteelYieldMpa,`stress`,R)}`:``}）`:`未啟用`)}</li>
          </ul>
          ${Y?`<p class="meta">耐震路徑狀態：${p(Y.title)} / ${p(Y.stateMessage)}${Y.recommendation?` 建議：${p(Y.recommendation.title)}。`:``}</p>`:``}
        </article>
        <article class="card">
          <h2>總結</h2>
          <ul>
            <li>控制 DCR = ${p(m(E(o.summary)))}</li>
            <li>批次最大數值 DCR = ${p(m(o.summary.maxDcr))}</li>
            <li>控制拉力 = ${p(o.summary.governingTensionMode)}</li>
            <li>控制剪力 = ${p(o.summary.governingShearMode)}</li>
            <li>最新留痕 = ${p(B?`${b(B.hash)} / ${x(B.source)}`:`未留存`)}</li>
          </ul>
          ${E(o.summary)<o.summary.maxDcr?`<p class="meta">控制 DCR 跟隨 severity 判定；最大數值 DCR 僅供統計比較。</p>`:``}
        </article>
      </section>

      ${V.length>0?`<section class="card">
              <h2>審查留痕</h2>
              <table>
                <thead><tr><th>時間</th><th>來源</th><th>計算版本</th><th>Hash</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th></tr></thead>
                <tbody>
                  ${V.map(e=>`<tr>
                        <td>${p(y(e.createdAt))}</td>
                        <td>${p(x(e.source))}</td>
                        <td><code>${p(e.calcEngineVersion??W.runtimeVersion)}</code></td>
                        <td><code>${p(b(e.hash,16))}</code></td>
                        <td>${p(e.summary.controllingLoadCaseName??`—`)}</td>
                        <td>${p(e.summary.governingMode)}</td>
                        <td>${p(m(e.summary.governingDcr??e.summary.maxDcr))}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>使用邊界與版本追溯</h2>
        <ul>
          <li>版本狀態 = ${p(G)}</li>
          <li>案件計算版本 = <code>${p(W.projectVersion)}</code></li>
          <li>目前工具版本 = <code>${p(W.runtimeVersion)}</code></li>
          <li>目前 build 時間 = ${p(y(n))}</li>
          <li>留痕來源 / Hash = ${p(B?`${x(B.source)} / ${b(B.hash,16)}`:`未留存`)}</li>
        </ul>
        <p class="meta">${p(t)}</p>
      </section>

      <section class="card">
        <h2>幾何配置</h2>
        <div class="geometry-wrap">
          ${P(M,R)}
        </div>
        ${M.project.layout.basePlateBearingEnabled?`<p class="meta">基板承壓：A1 ${p(S(D(M),`area`,R))} / A2 ${p(S(M.project.layout.basePlateSupportAreaMm2,`area`,R))}${(M.project.layout.basePlateLoadedWidthMm??0)>0&&(M.project.layout.basePlateLoadedHeightMm??0)>0?` / b1 × h1 ${p(S(M.project.layout.basePlateLoadedWidthMm??0,`length`,R))} × ${p(S(M.project.layout.basePlateLoadedHeightMm??0,`length`,R))}`:``}${Z.widthMm>0&&Z.heightMm>0?` / B × N ${p(S(Z.widthMm,`length`,R))} × ${p(S(Z.heightMm,`length`,R))}`:``}${(M.project.layout.columnCentroidOffsetXmm??0)!==0||(M.project.layout.columnCentroidOffsetYmm??0)!==0?` / 柱偏移 ${p(S(M.project.layout.columnCentroidOffsetXmm??0,`length`,R))} × ${p(S(M.project.layout.columnCentroidOffsetYmm??0,`length`,R))}`:``} / ${p(k(X))}${X===`custom`?` / Sx ${p(m(M.project.layout.basePlateSectionModulusXmm3??0))} mm³ / Sy ${p(m(M.project.layout.basePlateSectionModulusYmm3??0))} mm³`:``}</p>
               <p class="meta">${X===`custom`?`若以 b1 / h1 + 自訂 Sx / Sy 進入偏心承壓應力模式，b1 / h1 僅供接觸尺寸、kern 與 uplift 判讀；彎曲應力採自訂斷面模數。`:`若以 b1 / h1 進入偏心承壓應力模式，報表目前採矩形承壓區之 Sx / Sy 假設；非矩形基板請另按實際幾何檢算。`}${$===`manual`?``:` 基板抗彎若未手填 lx / ly，可由 ${p(A($))}、B / N 與柱尺寸自動推算。`}</p>
               ${Q?`<p class="meta">AISC DG1 自動推算：m = ${p(S(Q.mMm,`length`,R))} / n = ${p(S(Q.nMm,`length`,R))} / λn' = ${p(S(Q.lambdaPrimeMm,`length`,R))} / 建議 lx = ${p(S(Q.xMm,`length`,R))} / ly = ${p(S(Q.yMm,`length`,R))}</p>`:``}`:``}
      </section>

      <section class="card">
        <h2>載重組合批次檢核</h2>
        <table>
          <thead><tr><th>組合</th><th>拉力 N</th><th>合成剪力 V</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th></tr></thead>
          <tbody>
            ${o.loadCaseReviews.map(e=>`<tr>
                  <td>${p(e.loadCaseName)}</td>
                  <td>${p(S(e.review.analysisLoads.tensionKn,`force`,R))}</td>
                  <td>${p(S(Math.hypot(e.review.analysisLoads.shearXKn,e.review.analysisLoads.shearYKn),`force`,R))}</td>
                  <td>${p(e.review.summary.governingMode)}</td>
                  <td>${p(m(E(e.review.summary)))}</td>
                  <td>${N(e.review.summary.overallStatus)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
        ${M.analysisNote?`<p class="meta">${p(M.analysisNote)}</p>`:``}
      </section>

      ${Y?`<section class="card">
              <h2>耐震路徑建議</h2>
              <p><strong>${p(Y.title)}</strong> / ${p(Y.clause)}</p>
              <p class="meta">${p(Y.summary)}</p>
              <p class="meta">目前路徑狀態：${p(Y.stateMessage)}</p>
              <div class="route-matrix">
                ${Y.routeMatrix.map(e=>`<article class="route-matrix-card route-matrix-card-${e.state}${e.isCurrent?` route-matrix-card-current`:``}">
                      <div class="route-matrix-head">
                        <div>
                          <strong>${p(e.title)}</strong>
                          <small>${p(e.clause)}${e.isCurrent?` / 目前路徑`:``}</small>
                        </div>
                        <span class="chip chip-${j(e.state)}">${p(e.readinessLabel)}</span>
                      </div>
                      <div class="route-matrix-bar"><span style="width:${Math.max(6,Math.round(e.readinessScore*100))}%"></span></div>
                      <p class="meta">readiness ${Math.round(e.readinessScore*100)}% / 待補輸入 ${e.missingInputCount} 項${e.configurationIssueCount>0?`，配置限制 ${e.configurationIssueCount} 項`:``}</p>
                    </article>`).join(``)}
              </div>
              ${Y.recommendation?`<p class="meta">建議路徑：<strong>${p(Y.recommendation.title)}</strong>。${p(Y.recommendation.reason)}</p>`:``}
            </section>`:``}

      ${u.length>1?`<section class="card">
              <h2>候選產品比選</h2>
              <table>
                <thead><tr><th>產品</th><th>族群</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${u.map(e=>`<tr>
                        <td>${p(e.product.brand)} ${p(e.product.model)}${e.product.id===F.id?`（目前選定）`:``}</td>
                        <td>${p(g(e.product.family))}</td>
                        <td>${p(e.batchReview.controllingLoadCaseName)}</td>
                        <td>${p(e.batchReview.summary.governingMode)}</td>
                        <td>${p(m(E(e.batchReview.summary)))}</td>
                        <td>${N(e.batchReview.summary.overallStatus)}</td>
                        <td>${N(e.batchReview.summary.formalStatus)}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
              <h3>產品 × 載重組合矩陣</h3>
              <table>
                <thead>
                  <tr>
                    <th>載重組合</th>
                    ${u.map(e=>`<th>${p(e.product.brand)} ${p(e.product.model)}</th>`).join(``)}
                  </tr>
                </thead>
                <tbody>${ie}</tbody>
              </table>
            </section>`:``}

      ${h.length>1?`<section class="card">
              <h2>候選配置比選</h2>
              <table>
                <thead><tr><th>配置</th><th>幾何摘要</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${h.map(e=>`<tr>
                        <td>${p(e.variant.name)}${e.isCurrent?`（目前配置）`:``}</td>
                        <td>${p(C(e.variant.layout,R))}</td>
                        <td>${p(e.batchReview.controllingLoadCaseName)}</td>
                        <td>${p(e.batchReview.summary.governingMode)}</td>
                        <td>${p(m(E(e.batchReview.summary)))}</td>
                        <td>${N(e.batchReview.summary.overallStatus)}</td>
                        <td>${N(e.batchReview.summary.formalStatus)}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
              <h3>配置 × 載重組合矩陣</h3>
              <table>
                <thead>
                  <tr>
                    <th>載重組合</th>
                    ${h.map(e=>`<th>${p(e.variant.name)}<br /><small class="meta">${p(e.isCurrent?`目前配置`:C(e.variant.layout,R))}</small></th>`).join(``)}
                  </tr>
                </thead>
                <tbody>${ae}</tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>最小尺寸檢核</h2>
        <table>
          <thead><tr><th>項目</th><th>實際</th><th>需求</th><th>來源</th><th>條文</th><th>狀態</th></tr></thead>
          <tbody>
            ${M.dimensionChecks.map(e=>`<tr>
                  <td>${p(e.label)}</td>
                  <td>${p(S(e.actualMm,`length`,R))}</td>
                  <td>${p(S(e.requiredMm,`length`,R))}</td>
                  <td>${p(te(e.source))}</td>
                  <td>${p(_(e.citation.title,e.citation.clause))}</td>
                  <td>${N(e.status)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>破壞模式檢核</h2>
        <table>
          <thead><tr><th>模式</th><th>條文</th><th>需求值</th><th>設計值</th><th>DCR</th><th>狀態</th></tr></thead>
          <tbody>
            ${q.map(e=>`<tr>
                  <td>${p(e.mode)}<br /><small class="meta">${p(c(e,R))}</small></td>
                  <td>${p(_(e.citation.title,e.citation.clause))}</td>
                  <td>${p(w(e,e.demandKn,R))}</td>
                  <td>${p(w(e,e.designStrengthKn,R))}</td>
                  <td>${p(m(e.dcr))}</td>
                  <td>${N(e.status)} ${p(e.formal?`正式`:`初篩 / 補資料`)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>φ / ψ 採用總表</h2>
        <table>
          <thead><tr><th>模式</th><th>條文</th><th>採用因子</th><th>狀態</th></tr></thead>
          <tbody>
            ${ne.map(e=>`<tr>
                  <td>${p(e.mode)}</td>
                  <td>${p(_(e.citation.title,e.citation.clause))}</td>
                  <td>${p(T(e))}</td>
                  <td>${N(e.status)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      ${J.length>0?`<section class="card">
              <h2>產品證據對照</h2>
              <table>
                <thead><tr><th>欄位</th><th>目前值</th><th>文件 / 報告</th><th>頁碼 / 表號</th><th>已核對</th></tr></thead>
                <tbody>
                  ${J.map(e=>{let t=typeof e.rawValue==`number`&&e.quantity?S(e.rawValue,e.quantity,R):e.rawValue===void 0||e.rawValue===null||e.rawValue===``?`未填`:String(e.rawValue);return`<tr>
                        <td>${p(e.label)}</td>
                        <td>${p(t)}</td>
                        <td>${p(e.evidence?.documentName??`—`)}</td>
                        <td>${p(e.evidence?.page??`—`)}</td>
                        <td>${p(e.evidence?.verified?`是`:`否`)}</td>
                      </tr>`}).join(``)}
                </tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>工程提醒</h2>
        <ul>
          ${Array.from(new Set([...M.summary.notes,...I.missing])).map(e=>`<li>${p(e)}</li>`).join(``)}
        </ul>
      </section>
    </main>
    ${H?`<script>
            window.addEventListener('load', () => {
              window.setTimeout(() => window.print(), 160)
            })
            // 列印完成後 1.2 秒自動關閉視窗（若瀏覽器允許）
            window.addEventListener('afterprint', () => {
              window.setTimeout(() => {
                try { window.close() } catch (_) {}
              }, 1200)
            })
          <\/script>`:``}
  </body>
</html>`}export{I as buildStandaloneGeometrySketchSvg,L as buildStandaloneReportHtml};