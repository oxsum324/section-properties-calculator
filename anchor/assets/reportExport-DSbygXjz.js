import{c as e,o as t}from"./units-CQ38fsXI.js";import{c as n,d as r,l as i,n as a,r as o,s,u as c}from"./index-BsF33d70.js";import{t as l}from"./seismicRouteGuidance-Dn5r5gPN.js";function u(e){return e.replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function d(e){return Number.isFinite(e)?new Intl.NumberFormat(`zh-TW`,{maximumFractionDigits:2}).format(e):`—`}function f(e){switch(e){case`pass`:return`符合`;case`fail`:return`不符合`;case`screening`:return`初篩`;case`incomplete`:return`需補資料`;case`warning`:return`提醒`;default:return e}}function p(e){switch(e){case`cast_in`:return`預埋錨栓`;case`post_installed_expansion`:return`後置膨脹錨栓`;case`post_installed_bonded`:return`後置黏結式錨栓`;case`screw_anchor`:return`螺紋錨栓`;case`undercut_anchor`:return`擴底式錨栓`;case`shear_lug`:return`剪力榫`;default:return e}}function m(e){return e===`summary`?`摘要版`:`完整明細版`}function h(e,t){return`${t} ${e}`}function g(e){if(!e)return`—`;let t=new Date(e);return Number.isNaN(t.getTime())?e:t.toLocaleDateString(`zh-TW`,{year:`numeric`,month:`2-digit`,day:`2-digit`})}function _(e){if(!e)return`—`;let t=new Date(e);return Number.isNaN(t.getTime())?e:t.toLocaleString(`zh-TW`,{year:`numeric`,month:`2-digit`,day:`2-digit`,hour:`2-digit`,minute:`2-digit`})}function v(e,t=12){return e?e.slice(0,Math.max(8,t)).toUpperCase():`—`}function y(e){switch(e){case`manual`:return`手動留存`;case`preview`:return`報表預覽`;case`print`:return`列印報表`;case`html`:return`匯出 HTML`;case`xlsx`:return`匯出 XLSX`;case`docx`:return`匯出 DOCX`;default:return`—`}}function b(e){return e===`product`?`產品值`:e===`code_fallback`?`規範退回值`:`規範值`}function x(n,r,i){return Number.isFinite(n)?`${d(e(n,r,i))} ${t(r,i)}`:`—`}function S(e,t){let n=e.anchorCountX*e.anchorCountY,r=Math.min(e.edgeLeftMm,e.edgeRightMm,e.edgeBottomMm,e.edgeTopMm);return[`${e.anchorCountX} × ${e.anchorCountY}（${n} 支）`,`hef ${x(e.effectiveEmbedmentMm,`length`,t)}`,`sx ${x(e.spacingXmm,`length`,t)}`,`sy ${x(e.spacingYmm,`length`,t)}`,`cmin ${x(r,`length`,t)}`].join(` / `)}function C(e,t,n){return e.presentation===`ratio`?d(t):e.presentation===`stress`?x(t,`stress`,n):e.presentation===`length`?x(t,`length`,n):x(t,`force`,n)}function w(e){return!e.factors||e.factors.length===0?`—`:e.factors.map(e=>e.note?`${e.symbol}=${e.value}（${e.label}；${e.note}）`:`${e.symbol}=${e.value}（${e.label}）`).join(`；`)}function T(e){return e.governingDcr??e.maxDcr}function E(e){if(e.project.layout.basePlateLoadedAreaMm2>0)return e.project.layout.basePlateLoadedAreaMm2;let t=Math.max(0,e.project.layout.basePlateLoadedWidthMm??0),n=Math.max(0,e.project.layout.basePlateLoadedHeightMm??0);return t>0&&n>0?t*n:0}function D(e){return e.project.layout.basePlateSectionType===`custom`?`custom`:`rectangle`}function O(e){return e===`custom`?`自訂 Sx / Sy`:`矩形承壓區`}function k(e){switch(e){case`i_h`:return`I / H 形柱`;case`rect`:return`矩形柱`;case`pipe`:return`圓管 / 圓柱`;default:return`手動輸入`}}function A(e){switch(e){case`ready`:return`pass`;case`configuration_issue`:return`warning`;default:return`incomplete`}}function j(e){return`zone-${e}`}function M(e){return`<span class="chip chip-${e}">${u(f(e))}</span>`}function N(e,t){let{layout:n}=e.project,i=r(n,e.anchorPoints),a=s(n,e.analysisLoads),o=new Map,c=new Map(e.visualization.anchors.map(e=>[e.anchorId,e]));e.visualization.edges.forEach(e=>{let t=o.get(e.edge)??[];t.includes(e.label)||t.push(e.label),o.set(e.edge,t)});let l=e.visualization.rectangles.map(e=>`<rect x="${e.x1}" y="${e.y1}" width="${e.x2-e.x1}" height="${e.y2-e.y1}" class="zone ${j(e.kind)}" />`).join(``),f=a?`<g>
        <rect
          x="${a.loadedArea.x1}"
          y="${a.loadedArea.y1}"
          width="${a.loadedArea.x2-a.loadedArea.x1}"
          height="${a.loadedArea.y2-a.loadedArea.y1}"
          class="bearing-zone"
        />
        ${a.contactArea?`<rect
                x="${a.contactArea.x1}"
                y="${a.contactArea.y1}"
                width="${a.contactArea.x2-a.contactArea.x1}"
                height="${a.contactArea.y2-a.contactArea.y1}"
                class="bearing-contact-zone bearing-contact-zone-${a.mode}"
              />`:``}
        <text
          x="${a.labelX}"
          y="${a.labelY}"
          class="bearing-overlay-label"
        >${u(a.label)}</text>
      </g>`:``,p=e.anchorPoints.map(e=>{let t=c.get(e.id),n=t?.state===`tension`?`anchor-tension`:t?.state===`compression`?`anchor-compression`:`anchor-neutral`,r=t?`${t.elasticTensionKn>=0?`+`:``}${d(t.elasticTensionKn)}`:`0`;return`<g>
        <circle cx="${e.x}" cy="${e.y}" r="10" class="anchor ${n}" />
        <circle cx="${e.x}" cy="${e.y}" r="3" class="anchor-center" />
        <text x="${e.x}" y="${e.y-16}" text-anchor="middle" class="anchor-label">${u(e.id)}</text>
        <text x="${e.x}" y="${e.y+24}" text-anchor="middle" class="anchor-demand">${u(r)}</text>
      </g>`}).join(``),m=Array.from(o.entries()).map(([e,t])=>{let r=u(t.join(` / `));return e===`left`?`<g><line x1="4" y1="0" x2="4" y2="${n.concreteHeightMm}" class="edge-highlight" /><text x="12" y="22" class="edge-label">${r}</text></g>`:e===`right`?`<g><line x1="${n.concreteWidthMm-4}" y1="0" x2="${n.concreteWidthMm-4}" y2="${n.concreteHeightMm}" class="edge-highlight" /><text x="${n.concreteWidthMm-12}" y="22" text-anchor="end" class="edge-label">${r}</text></g>`:e===`bottom`?`<g><line x1="0" y1="${n.concreteHeightMm-4}" x2="${n.concreteWidthMm}" y2="${n.concreteHeightMm-4}" class="edge-highlight" /><text x="12" y="${n.concreteHeightMm-12}" class="edge-label">${r}</text></g>`:`<g><line x1="0" y1="4" x2="${n.concreteWidthMm}" y2="4" class="edge-highlight" /><text x="12" y="22" class="edge-label">${r}</text></g>`}).join(``),h=i?`<g>
        <rect
          x="${i.x1}"
          y="${i.y1}"
          width="${i.x2-i.x1}"
          height="${i.y2-i.y1}"
          class="reinforcement-zone"
        />
        <line
          x1="${i.x1}"
          y1="${i.y1}"
          x2="${i.x2}"
          y2="${i.y2}"
          class="reinforcement-line"
        />
        <line
          x1="${i.x2}"
          y1="${i.y1}"
          x2="${i.x1}"
          y2="${i.y2}"
          class="reinforcement-line"
        />
        <text
          x="${i.labelX}"
          y="${i.labelY}"
          class="reinforcement-label"
        >${u(i.label)}</text>
      </g>`:``;return`<svg class="geometry" viewBox="0 0 ${n.concreteWidthMm} ${n.concreteHeightMm}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${n.concreteWidthMm}" height="${n.concreteHeightMm}" rx="8" class="concrete-body" />
    ${f}
    ${l}
    ${h}
    ${m}
    ${p}
    <text x="16" y="24" class="sketch-title">混凝土平面 / 活躍組合</text>
    <text x="16" y="46" class="sketch-legend">紅 = 受拉，藍 = 受壓，灰 = 中性；青 = A_Nc，橘 = A_Vc，綠 = 錨栓補強鋼筋，紫 = A1 / 接觸承壓區</text>
    <text x="16" y="${n.concreteHeightMm-14}" class="sketch-meta">${u(`${x(n.concreteWidthMm,`length`,t)} × ${x(n.concreteHeightMm,`length`,t)}`)}</text>
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
  .anchor-center { fill:#fff; }`;function F(e,t){return N(e,t).replace(/<svg([^>]*)>/,(e,t)=>`<svg${t} xmlns="http://www.w3.org/2000/svg"><defs><style>${P}</style></defs>`)}function I(e){let{batchReview:r,candidateProductReviews:s,layoutVariantReviews:f=[],review:j,selectedProduct:P,completeness:F,evaluationFieldStates:I,unitPreferences:L,reportSettings:R,saveMessage:z,auditEntry:B,auditTrail:V=[],autoPrint:H=!1,reportGeneratedAt:U=new Date().toISOString()}=e,W=new Set(j.project.excludedCheckIds??[]),G=j.results.filter(e=>!W.has(e.id)),K=I.filter(e=>e.hasValue||e.hasEvidence),q=G.filter(e=>e.factors&&e.factors.length>0),J=G.find(e=>e.id===`seismic`)??null,Y=j.project.loads.considerSeismic?l(j.project.loads,P,J):null,X=D(j),Z=n(j.project.layout),Q=c(j.project.layout),$=i(j.project.layout),ee=r.loadCaseReviews.map(e=>{let t=s.map(t=>{let n=t.batchReview.loadCaseReviews.find(t=>t.loadCaseId===e.loadCaseId);return n?`<td>
            <strong>DCR ${u(d(T(n.review.summary)))}</strong><br />
            ${M(n.review.summary.overallStatus)}<br />
            <small>${u(n.review.summary.governingMode)}${t.batchReview.controllingLoadCaseId===e.loadCaseId?` / 該產品控制`:``}</small>
          </td>`:`<td>—</td>`}).join(``),n=e.loadCaseId===r.activeLoadCaseId&&e.loadCaseId===r.controllingLoadCaseId?`（目前編輯 / 控制組合）`:e.loadCaseId===r.activeLoadCaseId?`（目前編輯）`:e.loadCaseId===r.controllingLoadCaseId?`（控制組合）`:``;return`<tr><td>${u(e.loadCaseName+n)}</td>${t}</tr>`}).join(``),te=r.loadCaseReviews.map(e=>{let t=f.map(t=>{let n=t.batchReview.loadCaseReviews.find(t=>t.loadCaseId===e.loadCaseId);return n?`<td>
              <div class="matrix-cell${t.batchReview.controllingLoadCaseId===e.loadCaseId?` matrix-cell-controlling`:``}">
                <strong>DCR ${u(d(T(n.review.summary)))}</strong>
                ${M(n.review.summary.overallStatus)}
                <small>${u(n.review.summary.governingMode)}${t.batchReview.controllingLoadCaseId===e.loadCaseId?` / 該配置控制`:``}</small>
              </div>
            </td>`:`<td>—</td>`}).join(``),n=e.loadCaseId===r.activeLoadCaseId&&e.loadCaseId===r.controllingLoadCaseId?`目前編輯 / 控制組合`:e.loadCaseId===r.activeLoadCaseId?`目前編輯`:e.loadCaseId===r.controllingLoadCaseId?`控制組合`:`批次結果`;return`<tr>
          <td>
            <div class="table-mode">
              <strong>${u(e.loadCaseName)}</strong>
              <small>${u(n)}</small>
            </div>
          </td>
          ${t}
        </tr>`}).join(``);return`<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${u(j.project.name)} - 錨栓檢討報告</title>
    <style>
      @page { size: A4; margin: 14mm 12mm 16mm; }
      :root { color-scheme: light; --ink:#14213d; --muted:#5b6475; --line:#d8deea; --panel:#f7f9fc; --accent:#0b7285; --warn:#c2410c; --pass:#166534; --fail:#b91c1c; --screen:#7c3aed; }
      * { box-sizing:border-box; }
      body { margin:0; font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif; color:var(--ink); background:#eef2f7; }
      main { max-width:1120px; margin:0 auto; padding:32px 24px 72px; }
      h1,h2,h3 { margin:0 0 12px; }
      p,li,td,th,dd,dt,small,span,strong { line-height:1.5; }
      .hero { background:linear-gradient(135deg,#ffffff 0%,#eef8fb 100%); border:1px solid var(--line); border-radius:24px; padding:28px; margin-bottom:24px; }
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
        <p class="meta">${u(R.companyName||`工程報表草稿`)}</p>
        <h1>${u(j.project.name)}</h1>
        <p>台灣《建築物混凝土結構設計規範》112年版第17章 錨栓檢討 ${u(m(R.reportMode))}</p>
        <div class="hero-grid">
          <div><small class="meta">案號 / 專案</small><div>${u(R.projectCode||`未填`)}</div></div>
          <div><small class="meta">規範版本</small><div>${u(j.ruleProfile.versionLabel)}</div></div>
          <div><small class="meta">發行日期</small><div>${u(g(R.issueDate))}</div></div>
          <div><small class="meta">${o.editedAt}</small><div>${u(_(j.project.updatedAt))}</div></div>
          <div><small class="meta">${o.generatedAt}</small><div>${u(_(U))}</div></div>
          <div><small class="meta">${o.auditedAt}</small><div>${u(_(B?.createdAt))}</div></div>
          <div><small class="meta">${o.auditSource} / ${o.auditHash}</small><div>${u(B?`${y(B.source)} · ${v(B.hash)}`:`尚未留存`)}</div></div>
          <div><small class="meta">整體判定</small><div>${M(r.summary.overallStatus)}</div></div>
          <div><small class="meta">正式判定</small><div>${M(r.summary.formalStatus)}</div></div>
          <div><small class="meta">控制模式</small><div>${u(r.summary.governingMode)}</div></div>
          <div><small class="meta">控制組合</small><div>${u(r.controllingLoadCaseName)}</div></div>
        </div>
      </section>

      <section class="grid">
        <article class="card">
          <h2>產品與案例</h2>
          <p><strong>${u(P.brand)} ${u(P.model)}</strong> / ${u(p(P.family))}</p>
          <ul>
            <li>錨栓直徑 da = ${u(x(P.diameterMm,`length`,L))}</li>
            <li>Ase = ${u(x(P.effectiveAreaMm2,`area`,L))}</li>
            <li>目前單位 = ${u(t(`length`,L))} / ${u(t(`area`,L))} / ${u(t(`force`,L))} / ${u(t(`stress`,L))}</li>
            <li>產品完整性 = ${u(F.formal?`正式判定`:`需補資料`)}</li>
            <li>基板承壓 = ${u(j.project.layout.basePlateBearingEnabled?`已啟用（A1 ${x(E(j),`area`,L)} / ${O(X)}${Z.widthMm>0&&Z.heightMm>0?` / B × N ${x(Z.widthMm,`length`,L)} × ${x(Z.heightMm,`length`,L)}`:``}${(j.project.layout.columnCentroidOffsetXmm??0)!==0||(j.project.layout.columnCentroidOffsetYmm??0)!==0?` / 柱偏移 ${x(j.project.layout.columnCentroidOffsetXmm??0,`length`,L)} × ${x(j.project.layout.columnCentroidOffsetYmm??0,`length`,L)}`:``}${j.project.layout.basePlateBendingEnabled?` / tp ${x(j.project.layout.basePlateThicknessMm,`length`,L)} / Fy ${x(j.project.layout.basePlateSteelYieldMpa,`stress`,L)}`:``}）`:`未啟用`)}</li>
          </ul>
          ${Y?`<p class="meta">耐震路徑狀態：${u(Y.title)} / ${u(Y.stateMessage)}${Y.recommendation?` 建議：${u(Y.recommendation.title)}。`:``}</p>`:``}
        </article>
        <article class="card">
          <h2>總結</h2>
          <ul>
            <li>控制 DCR = ${u(d(T(r.summary)))}</li>
            <li>批次最大數值 DCR = ${u(d(r.summary.maxDcr))}</li>
            <li>控制拉力 = ${u(r.summary.governingTensionMode)}</li>
            <li>控制剪力 = ${u(r.summary.governingShearMode)}</li>
            <li>離線狀態 = ${u(z)}</li>
            <li>最新留痕 = ${u(B?`${v(B.hash)} / ${y(B.source)}`:`未留存`)}</li>
          </ul>
          ${T(r.summary)<r.summary.maxDcr?`<p class="meta">控制 DCR 跟隨 severity 判定；最大數值 DCR 僅供統計比較。</p>`:``}
        </article>
      </section>

      ${V.length>0?`<section class="card">
              <h2>審查留痕</h2>
              <table>
                <thead><tr><th>時間</th><th>來源</th><th>Hash</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th></tr></thead>
                <tbody>
                  ${V.map(e=>`<tr>
                        <td>${u(_(e.createdAt))}</td>
                        <td>${u(y(e.source))}</td>
                        <td><code>${u(v(e.hash,16))}</code></td>
                        <td>${u(e.summary.controllingLoadCaseName??`—`)}</td>
                        <td>${u(e.summary.governingMode)}</td>
                        <td>${u(d(e.summary.governingDcr??e.summary.maxDcr))}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>幾何配置</h2>
        <div class="geometry-wrap">
          ${N(j,L)}
        </div>
        ${j.project.layout.basePlateBearingEnabled?`<p class="meta">基板承壓：A1 ${u(x(E(j),`area`,L))} / A2 ${u(x(j.project.layout.basePlateSupportAreaMm2,`area`,L))}${(j.project.layout.basePlateLoadedWidthMm??0)>0&&(j.project.layout.basePlateLoadedHeightMm??0)>0?` / b1 × h1 ${u(x(j.project.layout.basePlateLoadedWidthMm??0,`length`,L))} × ${u(x(j.project.layout.basePlateLoadedHeightMm??0,`length`,L))}`:``}${Z.widthMm>0&&Z.heightMm>0?` / B × N ${u(x(Z.widthMm,`length`,L))} × ${u(x(Z.heightMm,`length`,L))}`:``}${(j.project.layout.columnCentroidOffsetXmm??0)!==0||(j.project.layout.columnCentroidOffsetYmm??0)!==0?` / 柱偏移 ${u(x(j.project.layout.columnCentroidOffsetXmm??0,`length`,L))} × ${u(x(j.project.layout.columnCentroidOffsetYmm??0,`length`,L))}`:``} / ${u(O(X))}${X===`custom`?` / Sx ${u(d(j.project.layout.basePlateSectionModulusXmm3??0))} mm³ / Sy ${u(d(j.project.layout.basePlateSectionModulusYmm3??0))} mm³`:``}</p>
               <p class="meta">${X===`custom`?`若以 b1 / h1 + 自訂 Sx / Sy 進入偏心承壓應力模式，b1 / h1 僅供接觸尺寸、kern 與 uplift 判讀；彎曲應力採自訂斷面模數。`:`若以 b1 / h1 進入偏心承壓應力模式，報表目前採矩形承壓區之 Sx / Sy 假設；非矩形基板請另按實際幾何檢算。`}${$===`manual`?``:` 基板抗彎若未手填 lx / ly，可由 ${u(k($))}、B / N 與柱尺寸自動推算。`}</p>
               ${Q?`<p class="meta">AISC DG1 自動推算：m = ${u(x(Q.mMm,`length`,L))} / n = ${u(x(Q.nMm,`length`,L))} / λn' = ${u(x(Q.lambdaPrimeMm,`length`,L))} / 建議 lx = ${u(x(Q.xMm,`length`,L))} / ly = ${u(x(Q.yMm,`length`,L))}</p>`:``}`:``}
      </section>

      <section class="card">
        <h2>載重組合批次檢核</h2>
        <table>
          <thead><tr><th>組合</th><th>拉力 N</th><th>合成剪力 V</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th></tr></thead>
          <tbody>
            ${r.loadCaseReviews.map(e=>`<tr>
                  <td>${u(e.loadCaseName)}</td>
                  <td>${u(x(e.review.analysisLoads.tensionKn,`force`,L))}</td>
                  <td>${u(x(Math.hypot(e.review.analysisLoads.shearXKn,e.review.analysisLoads.shearYKn),`force`,L))}</td>
                  <td>${u(e.review.summary.governingMode)}</td>
                  <td>${u(d(T(e.review.summary)))}</td>
                  <td>${M(e.review.summary.overallStatus)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
        ${j.analysisNote?`<p class="meta">${u(j.analysisNote)}</p>`:``}
      </section>

      ${Y?`<section class="card">
              <h2>耐震路徑建議</h2>
              <p><strong>${u(Y.title)}</strong> / ${u(Y.clause)}</p>
              <p class="meta">${u(Y.summary)}</p>
              <p class="meta">目前路徑狀態：${u(Y.stateMessage)}</p>
              <div class="route-matrix">
                ${Y.routeMatrix.map(e=>`<article class="route-matrix-card route-matrix-card-${e.state}${e.isCurrent?` route-matrix-card-current`:``}">
                      <div class="route-matrix-head">
                        <div>
                          <strong>${u(e.title)}</strong>
                          <small>${u(e.clause)}${e.isCurrent?` / 目前路徑`:``}</small>
                        </div>
                        <span class="chip chip-${A(e.state)}">${u(e.readinessLabel)}</span>
                      </div>
                      <div class="route-matrix-bar"><span style="width:${Math.max(6,Math.round(e.readinessScore*100))}%"></span></div>
                      <p class="meta">readiness ${Math.round(e.readinessScore*100)}% / 待補輸入 ${e.missingInputCount} 項${e.configurationIssueCount>0?`，配置限制 ${e.configurationIssueCount} 項`:``}</p>
                    </article>`).join(``)}
              </div>
              ${Y.recommendation?`<p class="meta">建議路徑：<strong>${u(Y.recommendation.title)}</strong>。${u(Y.recommendation.reason)}</p>`:``}
            </section>`:``}

      ${s.length>1?`<section class="card">
              <h2>候選產品比選</h2>
              <table>
                <thead><tr><th>產品</th><th>族群</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${s.map(e=>`<tr>
                        <td>${u(e.product.brand)} ${u(e.product.model)}${e.product.id===P.id?`（目前選定）`:``}</td>
                        <td>${u(p(e.product.family))}</td>
                        <td>${u(e.batchReview.controllingLoadCaseName)}</td>
                        <td>${u(e.batchReview.summary.governingMode)}</td>
                        <td>${u(d(T(e.batchReview.summary)))}</td>
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
                    ${s.map(e=>`<th>${u(e.product.brand)} ${u(e.product.model)}</th>`).join(``)}
                  </tr>
                </thead>
                <tbody>${ee}</tbody>
              </table>
            </section>`:``}

      ${f.length>1?`<section class="card">
              <h2>候選配置比選</h2>
              <table>
                <thead><tr><th>配置</th><th>幾何摘要</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${f.map(e=>`<tr>
                        <td>${u(e.variant.name)}${e.isCurrent?`（目前配置）`:``}</td>
                        <td>${u(S(e.variant.layout,L))}</td>
                        <td>${u(e.batchReview.controllingLoadCaseName)}</td>
                        <td>${u(e.batchReview.summary.governingMode)}</td>
                        <td>${u(d(T(e.batchReview.summary)))}</td>
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
                    ${f.map(e=>`<th>${u(e.variant.name)}<br /><small class="meta">${u(e.isCurrent?`目前配置`:S(e.variant.layout,L))}</small></th>`).join(``)}
                  </tr>
                </thead>
                <tbody>${te}</tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>最小尺寸檢核</h2>
        <table>
          <thead><tr><th>項目</th><th>實際</th><th>需求</th><th>來源</th><th>條文</th><th>狀態</th></tr></thead>
          <tbody>
            ${j.dimensionChecks.map(e=>`<tr>
                  <td>${u(e.label)}</td>
                  <td>${u(x(e.actualMm,`length`,L))}</td>
                  <td>${u(x(e.requiredMm,`length`,L))}</td>
                  <td>${u(b(e.source))}</td>
                  <td>${u(h(e.citation.title,e.citation.clause))}</td>
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
            ${G.map(e=>`<tr>
                  <td>${u(e.mode)}<br /><small class="meta">${u(a(e,L))}</small></td>
                  <td>${u(h(e.citation.title,e.citation.clause))}</td>
                  <td>${u(C(e,e.demandKn,L))}</td>
                  <td>${u(C(e,e.designStrengthKn,L))}</td>
                  <td>${u(d(e.dcr))}</td>
                  <td>${M(e.status)} ${u(e.formal?`正式`:`初篩 / 補資料`)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>φ / ψ 採用總表</h2>
        <table>
          <thead><tr><th>模式</th><th>條文</th><th>採用因子</th><th>狀態</th></tr></thead>
          <tbody>
            ${q.map(e=>`<tr>
                  <td>${u(e.mode)}</td>
                  <td>${u(h(e.citation.title,e.citation.clause))}</td>
                  <td>${u(w(e))}</td>
                  <td>${M(e.status)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      ${K.length>0?`<section class="card">
              <h2>產品證據對照</h2>
              <table>
                <thead><tr><th>欄位</th><th>目前值</th><th>文件 / 報告</th><th>頁碼 / 表號</th><th>已核對</th></tr></thead>
                <tbody>
                  ${K.map(e=>{let t=typeof e.rawValue==`number`&&e.quantity?x(e.rawValue,e.quantity,L):e.rawValue===void 0||e.rawValue===null||e.rawValue===``?`未填`:String(e.rawValue);return`<tr>
                        <td>${u(e.label)}</td>
                        <td>${u(t)}</td>
                        <td>${u(e.evidence?.documentName??`—`)}</td>
                        <td>${u(e.evidence?.page??`—`)}</td>
                        <td>${u(e.evidence?.verified?`是`:`否`)}</td>
                      </tr>`}).join(``)}
                </tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>工程提醒</h2>
        <ul>
          ${Array.from(new Set([...j.summary.notes,...F.missing])).map(e=>`<li>${u(e)}</li>`).join(``)}
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
</html>`}export{F as buildStandaloneGeometrySketchSvg,I as buildStandaloneReportHtml};