import{a as e,i as t,o as n,t as r}from"./appMeta-BhhPHJQp.js";import{a as i,i as a,r as o}from"./basePlateStressState-wYduPT6T.js";import{c as s,o as c}from"./units-m4ngsLPL.js";import{a as l,i as u,n as d,o as f,t as p}from"./index-DAL0fVF-.js";import{i as ee,n as te,r as m,t as ne}from"./reportHtmlSeal-hBwqWEKZ.js";import{t as re}from"./seismicRouteGuidance-CA5XgnZ0.js";function h(e){return e.replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function g(e){return Number.isFinite(e)?new Intl.NumberFormat(`zh-TW`,{maximumFractionDigits:2}).format(e):`—`}function _(e){switch(e){case`pass`:return`符合`;case`fail`:return`不符合`;case`screening`:return`初篩`;case`incomplete`:return`需補資料`;case`warning`:return`提醒`;default:return e}}function v(e){switch(e){case`cast_in`:return`預埋錨栓`;case`post_installed_expansion`:return`後置膨脹錨栓`;case`post_installed_bonded`:return`後置黏結式錨栓`;case`screw_anchor`:return`螺紋錨栓`;case`undercut_anchor`:return`擴底式錨栓`;case`shear_lug`:return`剪力榫`;default:return e}}function ie(e){return e===`summary`?`摘要版`:`完整明細版`}function y(e,t){return`${t} ${e}`}function ae(e){if(!e)return`—`;let t=new Date(e);return Number.isNaN(t.getTime())?e:t.toLocaleDateString(`zh-TW`,{year:`numeric`,month:`2-digit`,day:`2-digit`})}function b(e){if(!e)return`—`;let t=new Date(e);return Number.isNaN(t.getTime())?e:t.toLocaleString(`zh-TW`,{year:`numeric`,month:`2-digit`,day:`2-digit`,hour:`2-digit`,minute:`2-digit`})}function x(e,t=12){return e?e.slice(0,Math.max(8,t)).toUpperCase():`—`}function S(e){switch(e){case`manual`:return`手動留存`;case`preview`:return`報表預覽`;case`print`:return`列印報表`;case`html`:return`匯出 HTML`;case`xlsx`:return`匯出 XLSX`;case`docx`:return`匯出 DOCX`;default:return`—`}}function oe(e){return e===`product`?`產品值`:e===`code_fallback`?`規範退回值`:`規範值`}function C(e,t,n){return Number.isFinite(e)?`${g(s(e,t,n))} ${c(t,n)}`:`—`}function w(e,t){let n=e.anchorCountX*e.anchorCountY,r=Math.min(e.edgeLeftMm,e.edgeRightMm,e.edgeBottomMm,e.edgeTopMm);return[`${e.anchorCountX} × ${e.anchorCountY}（${n} 支）`,`hef ${C(e.effectiveEmbedmentMm,`length`,t)}`,`sx ${C(e.spacingXmm,`length`,t)}`,`sy ${C(e.spacingYmm,`length`,t)}`,`cmin ${C(r,`length`,t)}`].join(` / `)}function T(e,t,n){return e.presentation===`ratio`?g(t):e.presentation===`stress`?C(t,`stress`,n):e.presentation===`length`?C(t,`length`,n):C(t,`force`,n)}function se(e){return!e.factors||e.factors.length===0?`—`:e.factors.map(e=>e.note?`${e.symbol}=${e.value}（${e.label}；${e.note}）`:`${e.symbol}=${e.value}（${e.label}）`).join(`；`)}function E(e){return e.governingDcr??e.maxDcr}function D(e){if(e.project.layout.basePlateLoadedAreaMm2>0)return e.project.layout.basePlateLoadedAreaMm2;let t=Math.max(0,e.project.layout.basePlateLoadedWidthMm??0),n=Math.max(0,e.project.layout.basePlateLoadedHeightMm??0);return t>0&&n>0?t*n:0}function ce(e){return e.project.layout.basePlateSectionType===`custom`?`custom`:`rectangle`}function O(e){return e===`custom`?`自訂 Sx / Sy`:`矩形承壓區`}function k(e){switch(e){case`i_h`:return`I / H 形柱`;case`rect`:return`矩形柱`;case`pipe`:return`圓管 / 圓柱`;default:return`手動輸入`}}function A(e){switch(e){case`ready`:return`pass`;case`configuration_issue`:return`warning`;default:return`incomplete`}}function j(e){return`zone-${e}`}function M(e){return`<span class="chip chip-${e}">${h(_(e))}</span>`}function N(e,t){let{layout:n}=e.project,r=f(n,e.anchorPoints),i=l(n,e.analysisLoads),a=new Map,o=new Map(e.visualization.anchors.map(e=>[e.anchorId,e]));e.visualization.edges.forEach(e=>{let t=a.get(e.edge)??[];t.includes(e.label)||t.push(e.label),a.set(e.edge,t)});let s=e.visualization.rectangles.map(e=>`<rect x="${e.x1}" y="${e.y1}" width="${e.x2-e.x1}" height="${e.y2-e.y1}" class="zone ${j(e.kind)}" />`).join(``),c=i?`<g>
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
        >${h(i.label)}</text>
      </g>`:``,u=e.anchorPoints.map(e=>{let t=o.get(e.id),n=t?.state===`tension`?`anchor-tension`:t?.state===`compression`?`anchor-compression`:`anchor-neutral`,r=t?`${t.elasticTensionKn>=0?`+`:``}${g(t.elasticTensionKn)}`:`0`;return`<g>
        <circle cx="${e.x}" cy="${e.y}" r="10" class="anchor ${n}" />
        <circle cx="${e.x}" cy="${e.y}" r="3" class="anchor-center" />
        <text x="${e.x}" y="${e.y-16}" text-anchor="middle" class="anchor-label">${h(e.id)}</text>
        <text x="${e.x}" y="${e.y+24}" text-anchor="middle" class="anchor-demand">${h(r)}</text>
      </g>`}).join(``),d=Array.from(a.entries()).map(([e,t])=>{let r=h(t.join(` / `));return e===`left`?`<g><line x1="4" y1="0" x2="4" y2="${n.concreteHeightMm}" class="edge-highlight" /><text x="12" y="22" class="edge-label">${r}</text></g>`:e===`right`?`<g><line x1="${n.concreteWidthMm-4}" y1="0" x2="${n.concreteWidthMm-4}" y2="${n.concreteHeightMm}" class="edge-highlight" /><text x="${n.concreteWidthMm-12}" y="22" text-anchor="end" class="edge-label">${r}</text></g>`:e===`bottom`?`<g><line x1="0" y1="${n.concreteHeightMm-4}" x2="${n.concreteWidthMm}" y2="${n.concreteHeightMm-4}" class="edge-highlight" /><text x="12" y="${n.concreteHeightMm-12}" class="edge-label">${r}</text></g>`:`<g><line x1="0" y1="4" x2="${n.concreteWidthMm}" y2="4" class="edge-highlight" /><text x="12" y="22" class="edge-label">${r}</text></g>`}).join(``),p=r?`<g>
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
        >${h(r.label)}</text>
      </g>`:``;return`<svg class="geometry" viewBox="0 0 ${n.concreteWidthMm} ${n.concreteHeightMm}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${n.concreteWidthMm}" height="${n.concreteHeightMm}" rx="8" class="concrete-body" />
    ${c}
    ${s}
    ${p}
    ${d}
    ${u}
    <text x="16" y="24" class="sketch-title">混凝土平面 / 活躍組合</text>
    <text x="16" y="46" class="sketch-legend">紅 = 受拉，藍 = 受壓，灰 = 中性；青 = A_Nc，橘 = A_Vc，綠 = 錨栓補強鋼筋，紫 = A1 / 接觸承壓區</text>
    <text x="16" y="${n.concreteHeightMm-14}" class="sketch-meta">${h(`${C(n.concreteWidthMm,`length`,t)} × ${C(n.concreteHeightMm,`length`,t)}`)}</text>
  </svg>`}var P=`.concrete-body { fill:#edf1f6; stroke:#7f8ea3; stroke-width:3; }
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
  .anchor-center { fill:#fff; }`;function F(e,t){return N(e,t).replace(/<svg([^>]*)>/,(e,t)=>`<svg${t} xmlns="http://www.w3.org/2000/svg"><defs><style>${P}</style></defs>`)}function I(s){let{batchReview:l,candidateProductReviews:f,layoutVariantReviews:_=[],review:j,selectedProduct:P,completeness:F,evaluationFieldStates:I,unitPreferences:L,reportSettings:R,auditEntry:z,auditTrail:B=[],autoPrint:V=!1,reportGeneratedAt:H=new Date().toISOString()}=s,U=n(j.project.calcEngineVersion),W=d({batchReview:l,review:j,completeness:F,reportSettings:R}),G=z?.hash?`CF-${x(z.hash,16)}`:``,le=U.mismatch?`本案原始版本 ${U.projectVersion}，目前以 ${U.runtimeVersion} 重算；正式交付前應重新檢核並留痕。`:`本案計算引擎與目前計算引擎一致：${U.runtimeVersion}`,ue=new Set(j.project.excludedCheckIds??[]),K=j.results.filter(e=>!ue.has(e.id)),q=I.filter(e=>e.hasValue||e.hasEvidence),de=K.filter(e=>e.factors&&e.factors.length>0),J=K.find(e=>e.id===`seismic`)??null,Y=j.project.loads.considerSeismic?re(j.project.loads,P,J):null,X=ce(j),Z=o(j.project.layout),Q=i(j.project.layout),$=a(j.project.layout),fe=l.loadCaseReviews.map(e=>{let t=f.map(t=>{let n=t.batchReview.loadCaseReviews.find(t=>t.loadCaseId===e.loadCaseId);return n?`<td>
            <strong>DCR ${h(g(E(n.review.summary)))}</strong><br />
            ${M(n.review.summary.overallStatus)}<br />
            <small>${h(n.review.summary.governingMode)}${t.batchReview.controllingLoadCaseId===e.loadCaseId?` / 該產品控制`:``}</small>
          </td>`:`<td>—</td>`}).join(``),n=e.loadCaseId===l.activeLoadCaseId&&e.loadCaseId===l.controllingLoadCaseId?`（目前編輯 / 控制組合）`:e.loadCaseId===l.activeLoadCaseId?`（目前編輯）`:e.loadCaseId===l.controllingLoadCaseId?`（控制組合）`:``;return`<tr><td>${h(e.loadCaseName+n)}</td>${t}</tr>`}).join(``),pe=l.loadCaseReviews.map(e=>{let t=_.map(t=>{let n=t.batchReview.loadCaseReviews.find(t=>t.loadCaseId===e.loadCaseId);return n?`<td>
              <div class="matrix-cell${t.batchReview.controllingLoadCaseId===e.loadCaseId?` matrix-cell-controlling`:``}">
                <strong>DCR ${h(g(E(n.review.summary)))}</strong>
                ${M(n.review.summary.overallStatus)}
                <small>${h(n.review.summary.governingMode)}${t.batchReview.controllingLoadCaseId===e.loadCaseId?` / 該配置控制`:``}</small>
              </div>
            </td>`:`<td>—</td>`}).join(``),n=e.loadCaseId===l.activeLoadCaseId&&e.loadCaseId===l.controllingLoadCaseId?`目前編輯 / 控制組合`:e.loadCaseId===l.activeLoadCaseId?`目前編輯`:e.loadCaseId===l.controllingLoadCaseId?`控制組合`:`批次結果`;return`<tr>
          <td>
            <div class="table-mode">
              <strong>${h(e.loadCaseName)}</strong>
              <small>${h(n)}</small>
            </div>
          </td>
          ${t}
        </tr>`}).join(``);return ee(`<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${h(j.project.name)} - 錨栓檢討報告</title>
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
      .document-footer-status { margin-top:20px; padding-top:8px; border-top:1px solid var(--line); color:var(--muted); font-size:9pt; text-align:right; }
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
      .preview-approval-control { display:flex; gap:6px; align-items:center; font-weight:600; }
      .anchor-seal-source { display:none !important; }
      .anchor-integrity-status { color:#4b5f66; font-size:11px; }
      .anchor-integrity-status[data-integrity-status='failed'] { color:#b91c1c; font-weight:700; }
      .anchor-integrity-alert {
        max-width:1120px; margin:16px auto 0; padding:14px 18px;
        border:2px solid #b91c1c; border-radius:14px; background:#fff1f2;
        color:#991b1b; font-weight:800;
      }
      @media print {
        body { background:#fff; }
        main { max-width:none; padding:0; }
        .card,.hero,.geometry-wrap { box-shadow:none; break-inside:avoid-page; }
        table { break-inside:auto; }
        tr,td,th { break-inside:avoid; page-break-inside:avoid; }
        h2,h3 { break-after:avoid-page; page-break-after:avoid; }
        p,li { orphans:3; widows:3; }
        .hero { break-after:page; }
        .report-preview-toolbar { display: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="report-preview-toolbar" data-role="preview-toolbar">
      <span class="preview-approval-control">工作頁核可狀態：${h(W.label)}</span>
      <button type="button" onclick="window.print()" aria-label="列印報表">
        🖨 列印 / 另存 PDF
      </button>
      <button type="button" onclick="window.close()" aria-label="關閉預覽視窗">
        ✕ 關閉視窗
      </button>
      <span class="preview-toolbar-hint">預覽列印效果；印出後此工具列會自動隱藏</span>
    </div>
    <span
      class="anchor-seal-source anchor-content-seal-source"
      data-content-seal-scope="${te}"
      data-content-sha256=""
      aria-hidden="true"
    ></span>
    <span
      class="anchor-seal-source anchor-approval-seal-source"
      data-approval-seal-scope="${ne}"
      data-approval-sha256=""
      data-report-title="${h(j.project.name)}"
      data-calculation-fingerprint="${h(G)}"
      data-approved="${W.status===`formal-attachment`?`true`:`false`}"
      data-approved-at="${h(R.documentApprovedAt||``)}"
      aria-hidden="true"
    ></span>
    <main>
      <!--anchor-content-seal:start-->
      <div class="anchor-sealed-content">
      <section class="hero">
        ${R.companyLogoDataUrl?`<img src="${h(R.companyLogoDataUrl)}" alt="${h(R.companyName||`公司 LOGO`)}" class="hero-logo" />`:``}
        <p class="meta">${h(R.companyName||`工程報表`)}</p>
        <h1>${h(j.project.name)}</h1>
        <p>台灣《建築物混凝土結構設計規範》112年版第17章 錨栓檢討 ${h(ie(R.reportMode))}</p>
        <div class="hero-grid">
          ${R.projectCode?`<div><small class="meta">案號 / 專案</small><div>${h(R.projectCode)}</div></div>`:``}
          ${R.designer?`<div><small class="meta">設計人員</small><div>${h(R.designer)}</div></div>`:``}
          ${R.checker?`<div><small class="meta">複核人員</small><div>${h(R.checker)}</div></div>`:``}
          <div><small class="meta">規範版本</small><div>${h(j.ruleProfile.versionLabel)}</div></div>
          <div><small class="meta">發行日期</small><div>${h(ae(R.issueDate))}</div></div>
          <div><small class="meta">${p.editedAt}</small><div>${h(b(j.project.updatedAt))}</div></div>
          <div><small class="meta">${p.generatedAt}</small><div>${h(b(H))}</div></div>
          <div><small class="meta">${p.auditedAt}</small><div>${h(b(z?.createdAt))}</div></div>
          <div><small class="meta">${p.auditSource} / ${p.auditHash}</small><div>${h(z?`${S(z.source)} · ${x(z.hash)}`:`尚未留存`)}</div></div>
          <div><small class="meta">整體判定</small><div>${M(l.summary.overallStatus)}</div></div>
          <div><small class="meta">正式判定</small><div>${M(l.summary.formalStatus)}</div></div>
          <div><small class="meta">控制模式</small><div>${h(l.summary.governingMode)}</div></div>
          <div><small class="meta">控制組合</small><div>${h(l.controllingLoadCaseName)}</div></div>
        </div>
      </section>

      <section class="grid">
        <article class="card">
          <h2>產品與案例</h2>
          <p><strong>${h(P.brand)} ${h(P.model)}</strong> / ${h(v(P.family))}</p>
          <ul>
            <li>錨栓直徑 da = ${h(C(P.diameterMm,`length`,L))}</li>
            <li>Ase = ${h(C(P.effectiveAreaMm2,`area`,L))}</li>
            <li>目前單位 = ${h(c(`length`,L))} / ${h(c(`area`,L))} / ${h(c(`force`,L))} / ${h(c(`stress`,L))}</li>
            <li>產品完整性 = ${h(F.formal?`正式判定`:`需補資料`)}</li>
            <li>案件計算引擎 = <code>${h(U.projectVersion)}</code></li>
            <li>目前計算引擎 = <code>${h(U.runtimeVersion)}</code> / build ${h(b(r))}</li>
            <li>基板承壓 = ${h(j.project.layout.basePlateBearingEnabled?`已啟用（A1 ${C(D(j),`area`,L)} / ${O(X)}${Z.widthMm>0&&Z.heightMm>0?` / B × N ${C(Z.widthMm,`length`,L)} × ${C(Z.heightMm,`length`,L)}`:``}${(j.project.layout.columnCentroidOffsetXmm??0)!==0||(j.project.layout.columnCentroidOffsetYmm??0)!==0?` / 柱偏移 ${C(j.project.layout.columnCentroidOffsetXmm??0,`length`,L)} × ${C(j.project.layout.columnCentroidOffsetYmm??0,`length`,L)}`:``}${j.project.layout.basePlateBendingEnabled?` / tp ${C(j.project.layout.basePlateThicknessMm,`length`,L)} / Fy ${C(j.project.layout.basePlateSteelYieldMpa,`stress`,L)}`:``}）`:`未啟用`)}</li>
          </ul>
          ${Y?`<p class="meta">耐震路徑狀態：${h(Y.title)} / ${h(Y.stateMessage)}${Y.recommendation?` 建議：${h(Y.recommendation.title)}。`:``}</p>`:``}
        </article>
        <article class="card">
          <h2>總結</h2>
          <ul>
            <li>控制 DCR = ${h(g(E(l.summary)))}</li>
            <li>批次最大數值 DCR = ${h(g(l.summary.maxDcr))}</li>
            <li>控制拉力 = ${h(l.summary.governingTensionMode)}</li>
            <li>控制剪力 = ${h(l.summary.governingShearMode)}</li>
            <li>最新留痕 = ${h(z?`${x(z.hash)} / ${S(z.source)}`:`未留存`)}</li>
          </ul>
          ${E(l.summary)<l.summary.maxDcr?`<p class="meta">控制 DCR 跟隨 severity 判定；最大數值 DCR 僅供統計比較。</p>`:``}
        </article>
      </section>

      ${B.length>0?`<section class="card">
              <h2>審查留痕</h2>
              <table>
                <thead><tr><th>時間</th><th>來源</th><th>計算引擎</th><th>Hash</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th></tr></thead>
                <tbody>
                  ${B.map(e=>`<tr>
                        <td>${h(b(e.createdAt))}</td>
                        <td>${h(S(e.source))}</td>
                        <td><code>${h(e.calcEngineVersion??U.runtimeVersion)}</code></td>
                        <td><code>${h(x(e.hash,16))}</code></td>
                        <td>${h(e.summary.controllingLoadCaseName??`—`)}</td>
                        <td>${h(e.summary.governingMode)}</td>
                        <td>${h(g(e.summary.governingDcr??e.summary.maxDcr))}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>文件追溯與版本</h2>
        <ul>
          <li>產出工具 = ${h(e)}</li>
          <li>工具版本 = ${h(t)}</li>
          <li>輸出時間 = ${h(b(H))}</li>
          <li>計算指紋 = ${h(G||`—`)}</li>
          <li>引擎狀態 = ${h(le)}</li>
          <li>本案計算引擎 = <code>${h(U.projectVersion)}</code></li>
          <li>目前計算引擎 = <code>${h(U.runtimeVersion)}</code></li>
          <li>目前 build 時間 = ${h(b(r))}</li>
          <li>留痕來源 / Hash = ${h(z?`${S(z.source)} / ${x(z.hash,16)}`:`未留存`)}</li>
        </ul>
      </section>

      <section class="card">
        <h2>幾何配置</h2>
        <div class="geometry-wrap">
          ${N(j,L)}
        </div>
        ${j.project.layout.basePlateBearingEnabled?`<p class="meta">基板承壓：A1 ${h(C(D(j),`area`,L))} / A2 ${h(C(j.project.layout.basePlateSupportAreaMm2,`area`,L))}${(j.project.layout.basePlateLoadedWidthMm??0)>0&&(j.project.layout.basePlateLoadedHeightMm??0)>0?` / b1 × h1 ${h(C(j.project.layout.basePlateLoadedWidthMm??0,`length`,L))} × ${h(C(j.project.layout.basePlateLoadedHeightMm??0,`length`,L))}`:``}${Z.widthMm>0&&Z.heightMm>0?` / B × N ${h(C(Z.widthMm,`length`,L))} × ${h(C(Z.heightMm,`length`,L))}`:``}${(j.project.layout.columnCentroidOffsetXmm??0)!==0||(j.project.layout.columnCentroidOffsetYmm??0)!==0?` / 柱偏移 ${h(C(j.project.layout.columnCentroidOffsetXmm??0,`length`,L))} × ${h(C(j.project.layout.columnCentroidOffsetYmm??0,`length`,L))}`:``} / ${h(O(X))}${X===`custom`?` / Sx ${h(g(j.project.layout.basePlateSectionModulusXmm3??0))} mm³ / Sy ${h(g(j.project.layout.basePlateSectionModulusYmm3??0))} mm³`:``}</p>
               <p class="meta">${X===`custom`?`若以 b1 / h1 + 自訂 Sx / Sy 進入偏心承壓應力模式，b1 / h1 僅供接觸尺寸、kern 與 uplift 判讀；彎曲應力採自訂斷面模數。`:`若以 b1 / h1 進入偏心承壓應力模式，報表目前採矩形承壓區之 Sx / Sy 假設；非矩形基板請另按實際幾何檢算。`}${$===`manual`?``:` 基板抗彎若未手填 lx / ly，可由 ${h(k($))}、B / N 與柱尺寸自動推算。`}</p>
               ${Q?`<p class="meta">AISC DG1 自動推算：m = ${h(C(Q.mMm,`length`,L))} / n = ${h(C(Q.nMm,`length`,L))} / λn' = ${h(C(Q.lambdaPrimeMm,`length`,L))} / 建議 lx = ${h(C(Q.xMm,`length`,L))} / ly = ${h(C(Q.yMm,`length`,L))}</p>`:``}`:``}
      </section>

      <section class="card">
        <h2>載重組合批次檢核</h2>
        <table>
          <thead><tr><th>組合</th><th>拉力 N</th><th>合成剪力 V</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th></tr></thead>
          <tbody>
            ${l.loadCaseReviews.map(e=>`<tr>
                  <td>${h(e.loadCaseName)}</td>
                  <td>${h(C(e.review.analysisLoads.tensionKn,`force`,L))}</td>
                  <td>${h(C(Math.hypot(e.review.analysisLoads.shearXKn,e.review.analysisLoads.shearYKn),`force`,L))}</td>
                  <td>${h(e.review.summary.governingMode)}</td>
                  <td>${h(g(E(e.review.summary)))}</td>
                  <td>${M(e.review.summary.overallStatus)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
        ${j.analysisNote?`<p class="meta">${h(j.analysisNote)}</p>`:``}
      </section>

      ${Y?`<section class="card">
              <h2>耐震路徑建議</h2>
              <p><strong>${h(Y.title)}</strong> / ${h(Y.clause)}</p>
              <p class="meta">${h(Y.summary)}</p>
              <p class="meta">目前路徑狀態：${h(Y.stateMessage)}</p>
              <div class="route-matrix">
                ${Y.routeMatrix.map(e=>`<article class="route-matrix-card route-matrix-card-${e.state}${e.isCurrent?` route-matrix-card-current`:``}">
                      <div class="route-matrix-head">
                        <div>
                          <strong>${h(e.title)}</strong>
                          <small>${h(e.clause)}${e.isCurrent?` / 目前路徑`:``}</small>
                        </div>
                        <span class="chip chip-${A(e.state)}">${h(e.readinessLabel)}</span>
                      </div>
                      <div class="route-matrix-bar"><span style="width:${Math.max(6,Math.round(e.readinessScore*100))}%"></span></div>
                      <p class="meta">readiness ${Math.round(e.readinessScore*100)}% / 待補輸入 ${e.missingInputCount} 項${e.configurationIssueCount>0?`，配置限制 ${e.configurationIssueCount} 項`:``}</p>
                    </article>`).join(``)}
              </div>
              ${Y.recommendation?`<p class="meta">建議路徑：<strong>${h(Y.recommendation.title)}</strong>。${h(Y.recommendation.reason)}</p>`:``}
            </section>`:``}

      ${f.length>1?`<section class="card">
              <h2>候選產品比選</h2>
              <table>
                <thead><tr><th>產品</th><th>族群</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${f.map(e=>`<tr>
                        <td>${h(e.product.brand)} ${h(e.product.model)}${e.product.id===P.id?`（目前選定）`:``}</td>
                        <td>${h(v(e.product.family))}</td>
                        <td>${h(e.batchReview.controllingLoadCaseName)}</td>
                        <td>${h(e.batchReview.summary.governingMode)}</td>
                        <td>${h(g(E(e.batchReview.summary)))}</td>
                        <td>${M(e.batchReview.summary.overallStatus)}</td>
                        <td>${M(e.batchReview.summary.formalStatus)}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
              <h3>產品 × 載重組合矩陣</h3>
              <table>
                <thead>
                  <tr>
                    <th>載重組合</th>
                    ${f.map(e=>`<th>${h(e.product.brand)} ${h(e.product.model)}</th>`).join(``)}
                  </tr>
                </thead>
                <tbody>${fe}</tbody>
              </table>
            </section>`:``}

      ${_.length>1?`<section class="card">
              <h2>候選配置比選</h2>
              <table>
                <thead><tr><th>配置</th><th>幾何摘要</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${_.map(e=>`<tr>
                        <td>${h(e.variant.name)}${e.isCurrent?`（目前配置）`:``}</td>
                        <td>${h(w(e.variant.layout,L))}</td>
                        <td>${h(e.batchReview.controllingLoadCaseName)}</td>
                        <td>${h(e.batchReview.summary.governingMode)}</td>
                        <td>${h(g(E(e.batchReview.summary)))}</td>
                        <td>${M(e.batchReview.summary.overallStatus)}</td>
                        <td>${M(e.batchReview.summary.formalStatus)}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
              <h3>配置 × 載重組合矩陣</h3>
              <table>
                <thead>
                  <tr>
                    <th>載重組合</th>
                    ${_.map(e=>`<th>${h(e.variant.name)}<br /><small class="meta">${h(e.isCurrent?`目前配置`:w(e.variant.layout,L))}</small></th>`).join(``)}
                  </tr>
                </thead>
                <tbody>${pe}</tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>最小尺寸檢核</h2>
        <table>
          <thead><tr><th>項目</th><th>實際</th><th>需求</th><th>來源</th><th>條文</th><th>狀態</th></tr></thead>
          <tbody>
            ${j.dimensionChecks.map(e=>`<tr>
                  <td>${h(e.label)}</td>
                  <td>${h(C(e.actualMm,`length`,L))}</td>
                  <td>${h(C(e.requiredMm,`length`,L))}</td>
                  <td>${h(oe(e.source))}</td>
                  <td>${h(y(e.citation.title,e.citation.clause))}</td>
                  <td>${M(e.status)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>破壞模式檢核</h2>
        <table>
          <thead><tr><th>模式</th><th>條文</th><th>需求值</th><th>設計值</th><th>DCR</th><th>狀態</th></tr></thead>
          <tbody>
            ${K.map(e=>`<tr>
                  <td>${h(e.mode)}<br /><small class="meta">${h(u(e,L))}</small></td>
                  <td>${h(y(e.citation.title,e.citation.clause))}</td>
                  <td>${h(T(e,e.demandKn,L))}</td>
                  <td>${h(T(e,e.designStrengthKn,L))}</td>
                  <td>${h(g(e.dcr))}</td>
                  <td>${M(e.status)} ${h(e.formal?`正式`:`初篩 / 補資料`)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>φ / ψ 採用總表</h2>
        <table>
          <thead><tr><th>模式</th><th>條文</th><th>採用因子</th><th>狀態</th></tr></thead>
          <tbody>
            ${de.map(e=>`<tr>
                  <td>${h(e.mode)}</td>
                  <td>${h(y(e.citation.title,e.citation.clause))}</td>
                  <td>${h(se(e))}</td>
                  <td>${M(e.status)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      ${q.length>0?`<section class="card">
              <h2>產品證據對照</h2>
              <table>
                <thead><tr><th>欄位</th><th>目前值</th><th>文件 / 報告</th><th>頁碼 / 表號</th><th>已核對</th></tr></thead>
                <tbody>
                  ${q.map(e=>{let t=typeof e.rawValue==`number`&&e.quantity?C(e.rawValue,e.quantity,L):e.rawValue===void 0||e.rawValue===null||e.rawValue===``?`未填`:String(e.rawValue);return`<tr>
                        <td>${h(e.label)}</td>
                        <td>${h(t)}</td>
                        <td>${h(e.evidence?.documentName??`—`)}</td>
                        <td>${h(e.evidence?.page??`—`)}</td>
                        <td>${h(e.evidence?.verified?`是`:`否`)}</td>
                      </tr>`}).join(``)}
                </tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>工程提醒</h2>
        <ul>
          ${Array.from(new Set([...j.summary.notes,...F.missing])).map(e=>`<li>${h(e)}</li>`).join(``)}
        </ul>
      </section>
      </div>
      <!--anchor-content-seal:end-->
      <footer
        id="reportDocumentStatus"
        class="document-footer-status"
        data-document-state="${W.status}"
        data-approved-at="${h(R.documentApprovedAt||``)}"
        data-calculation-fingerprint="${h(G)}"
      >文件狀態：${h(W.label)}${W.reason?`｜${h(W.reason)}`:``}${G?`｜計算指紋：${h(G)}`:``}</footer>
    </main>
    <script>
      ${m}
    <\/script>
    ${V?`<script>
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
</html>`)}export{F as buildStandaloneGeometrySketchSvg,I as buildStandaloneReportHtml};