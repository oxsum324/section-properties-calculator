import{i as e,r as t,t as n}from"./appMeta-CWIHtunM.js";import{a as r,i,r as a}from"./basePlateStressState-wYduPT6T.js";import{c as o,o as s}from"./units-m4ngsLPL.js";import{a as c,i as l,n as u,r as d,t as f}from"./index-W6YFXDH9.js";import{t as p}from"./seismicRouteGuidance-CMiH4g__.js";function m(e){return e.replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function h(e){return Number.isFinite(e)?new Intl.NumberFormat(`zh-TW`,{maximumFractionDigits:2}).format(e):`—`}function g(e){switch(e){case`pass`:return`符合`;case`fail`:return`不符合`;case`screening`:return`初篩`;case`incomplete`:return`需補資料`;case`warning`:return`提醒`;default:return e}}function _(e){switch(e){case`cast_in`:return`預埋錨栓`;case`post_installed_expansion`:return`後置膨脹錨栓`;case`post_installed_bonded`:return`後置黏結式錨栓`;case`screw_anchor`:return`螺紋錨栓`;case`undercut_anchor`:return`擴底式錨栓`;case`shear_lug`:return`剪力榫`;default:return e}}function v(e){return e===`summary`?`摘要版`:`完整明細版`}function y(e,t){return`${t} ${e}`}function b(e){if(!e)return`—`;let t=new Date(e);return Number.isNaN(t.getTime())?e:t.toLocaleDateString(`zh-TW`,{year:`numeric`,month:`2-digit`,day:`2-digit`})}function x(e){if(!e)return`—`;let t=new Date(e);return Number.isNaN(t.getTime())?e:t.toLocaleString(`zh-TW`,{year:`numeric`,month:`2-digit`,day:`2-digit`,hour:`2-digit`,minute:`2-digit`})}function S(e,t=12){return e?e.slice(0,Math.max(8,t)).toUpperCase():`—`}function C(e){switch(e){case`manual`:return`手動留存`;case`preview`:return`報表預覽`;case`print`:return`列印報表`;case`html`:return`匯出 HTML`;case`xlsx`:return`匯出 XLSX`;case`docx`:return`匯出 DOCX`;default:return`—`}}function w(e){return e===`product`?`產品值`:e===`code_fallback`?`規範退回值`:`規範值`}function T(e,t,n){return Number.isFinite(e)?`${h(o(e,t,n))} ${s(t,n)}`:`—`}function E(e,t){let n=e.anchorCountX*e.anchorCountY,r=Math.min(e.edgeLeftMm,e.edgeRightMm,e.edgeBottomMm,e.edgeTopMm);return[`${e.anchorCountX} × ${e.anchorCountY}（${n} 支）`,`hef ${T(e.effectiveEmbedmentMm,`length`,t)}`,`sx ${T(e.spacingXmm,`length`,t)}`,`sy ${T(e.spacingYmm,`length`,t)}`,`cmin ${T(r,`length`,t)}`].join(` / `)}function D(e,t,n){return e.presentation===`ratio`?h(t):e.presentation===`stress`?T(t,`stress`,n):e.presentation===`length`?T(t,`length`,n):T(t,`force`,n)}function ee(e){return!e.factors||e.factors.length===0?`—`:e.factors.map(e=>e.note?`${e.symbol}=${e.value}（${e.label}；${e.note}）`:`${e.symbol}=${e.value}（${e.label}）`).join(`；`)}function O(e){return e.governingDcr??e.maxDcr}function k(e){if(e.project.layout.basePlateLoadedAreaMm2>0)return e.project.layout.basePlateLoadedAreaMm2;let t=Math.max(0,e.project.layout.basePlateLoadedWidthMm??0),n=Math.max(0,e.project.layout.basePlateLoadedHeightMm??0);return t>0&&n>0?t*n:0}function te(e){return e.project.layout.basePlateSectionType===`custom`?`custom`:`rectangle`}function A(e){return e===`custom`?`自訂 Sx / Sy`:`矩形承壓區`}function j(e){switch(e){case`i_h`:return`I / H 形柱`;case`rect`:return`矩形柱`;case`pipe`:return`圓管 / 圓柱`;default:return`手動輸入`}}function M(e){switch(e){case`ready`:return`pass`;case`configuration_issue`:return`warning`;default:return`incomplete`}}function N(e){return`zone-${e}`}function P(e){return`<span class="chip chip-${e}">${m(g(e))}</span>`}function F(e,t){let{layout:n}=e.project,r=c(n,e.anchorPoints),i=l(n,e.analysisLoads),a=new Map,o=new Map(e.visualization.anchors.map(e=>[e.anchorId,e]));e.visualization.edges.forEach(e=>{let t=a.get(e.edge)??[];t.includes(e.label)||t.push(e.label),a.set(e.edge,t)});let s=e.visualization.rectangles.map(e=>`<rect x="${e.x1}" y="${e.y1}" width="${e.x2-e.x1}" height="${e.y2-e.y1}" class="zone ${N(e.kind)}" />`).join(``),u=i?`<g>
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
        >${m(i.label)}</text>
      </g>`:``,d=e.anchorPoints.map(e=>{let t=o.get(e.id),n=t?.state===`tension`?`anchor-tension`:t?.state===`compression`?`anchor-compression`:`anchor-neutral`,r=t?`${t.elasticTensionKn>=0?`+`:``}${h(t.elasticTensionKn)}`:`0`;return`<g>
        <circle cx="${e.x}" cy="${e.y}" r="10" class="anchor ${n}" />
        <circle cx="${e.x}" cy="${e.y}" r="3" class="anchor-center" />
        <text x="${e.x}" y="${e.y-16}" text-anchor="middle" class="anchor-label">${m(e.id)}</text>
        <text x="${e.x}" y="${e.y+24}" text-anchor="middle" class="anchor-demand">${m(r)}</text>
      </g>`}).join(``),f=Array.from(a.entries()).map(([e,t])=>{let r=m(t.join(` / `));return e===`left`?`<g><line x1="4" y1="0" x2="4" y2="${n.concreteHeightMm}" class="edge-highlight" /><text x="12" y="22" class="edge-label">${r}</text></g>`:e===`right`?`<g><line x1="${n.concreteWidthMm-4}" y1="0" x2="${n.concreteWidthMm-4}" y2="${n.concreteHeightMm}" class="edge-highlight" /><text x="${n.concreteWidthMm-12}" y="22" text-anchor="end" class="edge-label">${r}</text></g>`:e===`bottom`?`<g><line x1="0" y1="${n.concreteHeightMm-4}" x2="${n.concreteWidthMm}" y2="${n.concreteHeightMm-4}" class="edge-highlight" /><text x="12" y="${n.concreteHeightMm-12}" class="edge-label">${r}</text></g>`:`<g><line x1="0" y1="4" x2="${n.concreteWidthMm}" y2="4" class="edge-highlight" /><text x="12" y="22" class="edge-label">${r}</text></g>`}).join(``),p=r?`<g>
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
        >${m(r.label)}</text>
      </g>`:``;return`<svg class="geometry" viewBox="0 0 ${n.concreteWidthMm} ${n.concreteHeightMm}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${n.concreteWidthMm}" height="${n.concreteHeightMm}" rx="8" class="concrete-body" />
    ${u}
    ${s}
    ${p}
    ${f}
    ${d}
    <text x="16" y="24" class="sketch-title">混凝土平面 / 活躍組合</text>
    <text x="16" y="46" class="sketch-legend">紅 = 受拉，藍 = 受壓，灰 = 中性；青 = A_Nc，橘 = A_Vc，綠 = 錨栓補強鋼筋，紫 = A1 / 接觸承壓區</text>
    <text x="16" y="${n.concreteHeightMm-14}" class="sketch-meta">${m(`${T(n.concreteWidthMm,`length`,t)} × ${T(n.concreteHeightMm,`length`,t)}`)}</text>
  </svg>`}var I=`.concrete-body { fill:#edf1f6; stroke:#7f8ea3; stroke-width:3; }
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
  .anchor-center { fill:#fff; }`;function L(e,t){return F(e,t).replace(/<svg([^>]*)>/,(e,t)=>`<svg${t} xmlns="http://www.w3.org/2000/svg"><defs><style>${I}</style></defs>`)}function R(o){let{batchReview:c,candidateProductReviews:l,layoutVariantReviews:g=[],review:N,selectedProduct:I,completeness:L,evaluationFieldStates:R,unitPreferences:z,reportSettings:B,auditEntry:V,auditTrail:H=[],autoPrint:U=!1,reportGeneratedAt:ne=new Date().toISOString()}=o,W=e(N.project.calcEngineVersion),G=u({batchReview:c,review:N,completeness:L,reportSettings:B}),K=V?.hash?`CF-${S(V.hash,16)}`:``,re=W.mismatch?`本案原始版本 ${W.projectVersion}，目前以 ${W.runtimeVersion} 重算；正式交付前應重新檢核並留痕。`:`本案計算版本與目前工具版本一致：${W.runtimeVersion}`,ie=new Set(N.project.excludedCheckIds??[]),q=N.results.filter(e=>!ie.has(e.id)),J=R.filter(e=>e.hasValue||e.hasEvidence),ae=q.filter(e=>e.factors&&e.factors.length>0),oe=q.find(e=>e.id===`seismic`)??null,Y=N.project.loads.considerSeismic?p(N.project.loads,I,oe):null,X=te(N),Z=a(N.project.layout),Q=r(N.project.layout),$=i(N.project.layout),se=c.loadCaseReviews.map(e=>{let t=l.map(t=>{let n=t.batchReview.loadCaseReviews.find(t=>t.loadCaseId===e.loadCaseId);return n?`<td>
            <strong>DCR ${m(h(O(n.review.summary)))}</strong><br />
            ${P(n.review.summary.overallStatus)}<br />
            <small>${m(n.review.summary.governingMode)}${t.batchReview.controllingLoadCaseId===e.loadCaseId?` / 該產品控制`:``}</small>
          </td>`:`<td>—</td>`}).join(``),n=e.loadCaseId===c.activeLoadCaseId&&e.loadCaseId===c.controllingLoadCaseId?`（目前編輯 / 控制組合）`:e.loadCaseId===c.activeLoadCaseId?`（目前編輯）`:e.loadCaseId===c.controllingLoadCaseId?`（控制組合）`:``;return`<tr><td>${m(e.loadCaseName+n)}</td>${t}</tr>`}).join(``),ce=c.loadCaseReviews.map(e=>{let t=g.map(t=>{let n=t.batchReview.loadCaseReviews.find(t=>t.loadCaseId===e.loadCaseId);return n?`<td>
              <div class="matrix-cell${t.batchReview.controllingLoadCaseId===e.loadCaseId?` matrix-cell-controlling`:``}">
                <strong>DCR ${m(h(O(n.review.summary)))}</strong>
                ${P(n.review.summary.overallStatus)}
                <small>${m(n.review.summary.governingMode)}${t.batchReview.controllingLoadCaseId===e.loadCaseId?` / 該配置控制`:``}</small>
              </div>
            </td>`:`<td>—</td>`}).join(``),n=e.loadCaseId===c.activeLoadCaseId&&e.loadCaseId===c.controllingLoadCaseId?`目前編輯 / 控制組合`:e.loadCaseId===c.activeLoadCaseId?`目前編輯`:e.loadCaseId===c.controllingLoadCaseId?`控制組合`:`批次結果`;return`<tr>
          <td>
            <div class="table-mode">
              <strong>${m(e.loadCaseName)}</strong>
              <small>${m(n)}</small>
            </div>
          </td>
          ${t}
        </tr>`}).join(``);return`<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${m(N.project.name)} - 錨栓檢討報告</title>
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
      <label class="preview-approval-control">
        <input id="reportAttachmentApproval" type="checkbox" ${G.status===`formal-attachment`?`checked`:``} />
        本計算內容已完成審閱，核可作為正式附件
      </label>
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
        ${B.companyLogoDataUrl?`<img src="${m(B.companyLogoDataUrl)}" alt="${m(B.companyName||`公司 LOGO`)}" class="hero-logo" />`:``}
        <p class="meta">${m(B.companyName||`工程報表`)}</p>
        <h1>${m(N.project.name)}</h1>
        <p>台灣《建築物混凝土結構設計規範》112年版第17章 錨栓檢討 ${m(v(B.reportMode))}</p>
        <div class="hero-grid">
          ${B.projectCode?`<div><small class="meta">案號 / 專案</small><div>${m(B.projectCode)}</div></div>`:``}
          ${B.designer?`<div><small class="meta">設計人員</small><div>${m(B.designer)}</div></div>`:``}
          ${B.checker?`<div><small class="meta">複核人員</small><div>${m(B.checker)}</div></div>`:``}
          <div><small class="meta">規範版本</small><div>${m(N.ruleProfile.versionLabel)}</div></div>
          <div><small class="meta">發行日期</small><div>${m(b(B.issueDate))}</div></div>
          <div><small class="meta">${f.editedAt}</small><div>${m(x(N.project.updatedAt))}</div></div>
          <div><small class="meta">${f.generatedAt}</small><div>${m(x(ne))}</div></div>
          <div><small class="meta">${f.auditedAt}</small><div>${m(x(V?.createdAt))}</div></div>
          <div><small class="meta">${f.auditSource} / ${f.auditHash}</small><div>${m(V?`${C(V.source)} · ${S(V.hash)}`:`尚未留存`)}</div></div>
          <div><small class="meta">整體判定</small><div>${P(c.summary.overallStatus)}</div></div>
          <div><small class="meta">正式判定</small><div>${P(c.summary.formalStatus)}</div></div>
          <div><small class="meta">控制模式</small><div>${m(c.summary.governingMode)}</div></div>
          <div><small class="meta">控制組合</small><div>${m(c.controllingLoadCaseName)}</div></div>
        </div>
      </section>

      <section class="grid">
        <article class="card">
          <h2>產品與案例</h2>
          <p><strong>${m(I.brand)} ${m(I.model)}</strong> / ${m(_(I.family))}</p>
          <ul>
            <li>錨栓直徑 da = ${m(T(I.diameterMm,`length`,z))}</li>
            <li>Ase = ${m(T(I.effectiveAreaMm2,`area`,z))}</li>
            <li>目前單位 = ${m(s(`length`,z))} / ${m(s(`area`,z))} / ${m(s(`force`,z))} / ${m(s(`stress`,z))}</li>
            <li>產品完整性 = ${m(L.formal?`正式判定`:`需補資料`)}</li>
            <li>案件計算版本 = <code>${m(W.projectVersion)}</code></li>
            <li>目前工具版本 = <code>${m(W.runtimeVersion)}</code> / build ${m(x(n))}</li>
            <li>基板承壓 = ${m(N.project.layout.basePlateBearingEnabled?`已啟用（A1 ${T(k(N),`area`,z)} / ${A(X)}${Z.widthMm>0&&Z.heightMm>0?` / B × N ${T(Z.widthMm,`length`,z)} × ${T(Z.heightMm,`length`,z)}`:``}${(N.project.layout.columnCentroidOffsetXmm??0)!==0||(N.project.layout.columnCentroidOffsetYmm??0)!==0?` / 柱偏移 ${T(N.project.layout.columnCentroidOffsetXmm??0,`length`,z)} × ${T(N.project.layout.columnCentroidOffsetYmm??0,`length`,z)}`:``}${N.project.layout.basePlateBendingEnabled?` / tp ${T(N.project.layout.basePlateThicknessMm,`length`,z)} / Fy ${T(N.project.layout.basePlateSteelYieldMpa,`stress`,z)}`:``}）`:`未啟用`)}</li>
          </ul>
          ${Y?`<p class="meta">耐震路徑狀態：${m(Y.title)} / ${m(Y.stateMessage)}${Y.recommendation?` 建議：${m(Y.recommendation.title)}。`:``}</p>`:``}
        </article>
        <article class="card">
          <h2>總結</h2>
          <ul>
            <li>控制 DCR = ${m(h(O(c.summary)))}</li>
            <li>批次最大數值 DCR = ${m(h(c.summary.maxDcr))}</li>
            <li>控制拉力 = ${m(c.summary.governingTensionMode)}</li>
            <li>控制剪力 = ${m(c.summary.governingShearMode)}</li>
            <li>最新留痕 = ${m(V?`${S(V.hash)} / ${C(V.source)}`:`未留存`)}</li>
          </ul>
          ${O(c.summary)<c.summary.maxDcr?`<p class="meta">控制 DCR 跟隨 severity 判定；最大數值 DCR 僅供統計比較。</p>`:``}
        </article>
      </section>

      ${H.length>0?`<section class="card">
              <h2>審查留痕</h2>
              <table>
                <thead><tr><th>時間</th><th>來源</th><th>計算版本</th><th>Hash</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th></tr></thead>
                <tbody>
                  ${H.map(e=>`<tr>
                        <td>${m(x(e.createdAt))}</td>
                        <td>${m(C(e.source))}</td>
                        <td><code>${m(e.calcEngineVersion??W.runtimeVersion)}</code></td>
                        <td><code>${m(S(e.hash,16))}</code></td>
                        <td>${m(e.summary.controllingLoadCaseName??`—`)}</td>
                        <td>${m(e.summary.governingMode)}</td>
                        <td>${m(h(e.summary.governingDcr??e.summary.maxDcr))}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>使用邊界與版本追溯</h2>
        <ul>
          <li>版本狀態 = ${m(re)}</li>
          <li>案件計算版本 = <code>${m(W.projectVersion)}</code></li>
          <li>目前工具版本 = <code>${m(W.runtimeVersion)}</code></li>
          <li>目前 build 時間 = ${m(x(n))}</li>
          <li>留痕來源 / Hash = ${m(V?`${C(V.source)} / ${S(V.hash,16)}`:`未留存`)}</li>
        </ul>
        <p class="meta">${m(t)}</p>
      </section>

      <section class="card">
        <h2>幾何配置</h2>
        <div class="geometry-wrap">
          ${F(N,z)}
        </div>
        ${N.project.layout.basePlateBearingEnabled?`<p class="meta">基板承壓：A1 ${m(T(k(N),`area`,z))} / A2 ${m(T(N.project.layout.basePlateSupportAreaMm2,`area`,z))}${(N.project.layout.basePlateLoadedWidthMm??0)>0&&(N.project.layout.basePlateLoadedHeightMm??0)>0?` / b1 × h1 ${m(T(N.project.layout.basePlateLoadedWidthMm??0,`length`,z))} × ${m(T(N.project.layout.basePlateLoadedHeightMm??0,`length`,z))}`:``}${Z.widthMm>0&&Z.heightMm>0?` / B × N ${m(T(Z.widthMm,`length`,z))} × ${m(T(Z.heightMm,`length`,z))}`:``}${(N.project.layout.columnCentroidOffsetXmm??0)!==0||(N.project.layout.columnCentroidOffsetYmm??0)!==0?` / 柱偏移 ${m(T(N.project.layout.columnCentroidOffsetXmm??0,`length`,z))} × ${m(T(N.project.layout.columnCentroidOffsetYmm??0,`length`,z))}`:``} / ${m(A(X))}${X===`custom`?` / Sx ${m(h(N.project.layout.basePlateSectionModulusXmm3??0))} mm³ / Sy ${m(h(N.project.layout.basePlateSectionModulusYmm3??0))} mm³`:``}</p>
               <p class="meta">${X===`custom`?`若以 b1 / h1 + 自訂 Sx / Sy 進入偏心承壓應力模式，b1 / h1 僅供接觸尺寸、kern 與 uplift 判讀；彎曲應力採自訂斷面模數。`:`若以 b1 / h1 進入偏心承壓應力模式，報表目前採矩形承壓區之 Sx / Sy 假設；非矩形基板請另按實際幾何檢算。`}${$===`manual`?``:` 基板抗彎若未手填 lx / ly，可由 ${m(j($))}、B / N 與柱尺寸自動推算。`}</p>
               ${Q?`<p class="meta">AISC DG1 自動推算：m = ${m(T(Q.mMm,`length`,z))} / n = ${m(T(Q.nMm,`length`,z))} / λn' = ${m(T(Q.lambdaPrimeMm,`length`,z))} / 建議 lx = ${m(T(Q.xMm,`length`,z))} / ly = ${m(T(Q.yMm,`length`,z))}</p>`:``}`:``}
      </section>

      <section class="card">
        <h2>載重組合批次檢核</h2>
        <table>
          <thead><tr><th>組合</th><th>拉力 N</th><th>合成剪力 V</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th></tr></thead>
          <tbody>
            ${c.loadCaseReviews.map(e=>`<tr>
                  <td>${m(e.loadCaseName)}</td>
                  <td>${m(T(e.review.analysisLoads.tensionKn,`force`,z))}</td>
                  <td>${m(T(Math.hypot(e.review.analysisLoads.shearXKn,e.review.analysisLoads.shearYKn),`force`,z))}</td>
                  <td>${m(e.review.summary.governingMode)}</td>
                  <td>${m(h(O(e.review.summary)))}</td>
                  <td>${P(e.review.summary.overallStatus)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
        ${N.analysisNote?`<p class="meta">${m(N.analysisNote)}</p>`:``}
      </section>

      ${Y?`<section class="card">
              <h2>耐震路徑建議</h2>
              <p><strong>${m(Y.title)}</strong> / ${m(Y.clause)}</p>
              <p class="meta">${m(Y.summary)}</p>
              <p class="meta">目前路徑狀態：${m(Y.stateMessage)}</p>
              <div class="route-matrix">
                ${Y.routeMatrix.map(e=>`<article class="route-matrix-card route-matrix-card-${e.state}${e.isCurrent?` route-matrix-card-current`:``}">
                      <div class="route-matrix-head">
                        <div>
                          <strong>${m(e.title)}</strong>
                          <small>${m(e.clause)}${e.isCurrent?` / 目前路徑`:``}</small>
                        </div>
                        <span class="chip chip-${M(e.state)}">${m(e.readinessLabel)}</span>
                      </div>
                      <div class="route-matrix-bar"><span style="width:${Math.max(6,Math.round(e.readinessScore*100))}%"></span></div>
                      <p class="meta">readiness ${Math.round(e.readinessScore*100)}% / 待補輸入 ${e.missingInputCount} 項${e.configurationIssueCount>0?`，配置限制 ${e.configurationIssueCount} 項`:``}</p>
                    </article>`).join(``)}
              </div>
              ${Y.recommendation?`<p class="meta">建議路徑：<strong>${m(Y.recommendation.title)}</strong>。${m(Y.recommendation.reason)}</p>`:``}
            </section>`:``}

      ${l.length>1?`<section class="card">
              <h2>候選產品比選</h2>
              <table>
                <thead><tr><th>產品</th><th>族群</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${l.map(e=>`<tr>
                        <td>${m(e.product.brand)} ${m(e.product.model)}${e.product.id===I.id?`（目前選定）`:``}</td>
                        <td>${m(_(e.product.family))}</td>
                        <td>${m(e.batchReview.controllingLoadCaseName)}</td>
                        <td>${m(e.batchReview.summary.governingMode)}</td>
                        <td>${m(h(O(e.batchReview.summary)))}</td>
                        <td>${P(e.batchReview.summary.overallStatus)}</td>
                        <td>${P(e.batchReview.summary.formalStatus)}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
              <h3>產品 × 載重組合矩陣</h3>
              <table>
                <thead>
                  <tr>
                    <th>載重組合</th>
                    ${l.map(e=>`<th>${m(e.product.brand)} ${m(e.product.model)}</th>`).join(``)}
                  </tr>
                </thead>
                <tbody>${se}</tbody>
              </table>
            </section>`:``}

      ${g.length>1?`<section class="card">
              <h2>候選配置比選</h2>
              <table>
                <thead><tr><th>配置</th><th>幾何摘要</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${g.map(e=>`<tr>
                        <td>${m(e.variant.name)}${e.isCurrent?`（目前配置）`:``}</td>
                        <td>${m(E(e.variant.layout,z))}</td>
                        <td>${m(e.batchReview.controllingLoadCaseName)}</td>
                        <td>${m(e.batchReview.summary.governingMode)}</td>
                        <td>${m(h(O(e.batchReview.summary)))}</td>
                        <td>${P(e.batchReview.summary.overallStatus)}</td>
                        <td>${P(e.batchReview.summary.formalStatus)}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
              <h3>配置 × 載重組合矩陣</h3>
              <table>
                <thead>
                  <tr>
                    <th>載重組合</th>
                    ${g.map(e=>`<th>${m(e.variant.name)}<br /><small class="meta">${m(e.isCurrent?`目前配置`:E(e.variant.layout,z))}</small></th>`).join(``)}
                  </tr>
                </thead>
                <tbody>${ce}</tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>最小尺寸檢核</h2>
        <table>
          <thead><tr><th>項目</th><th>實際</th><th>需求</th><th>來源</th><th>條文</th><th>狀態</th></tr></thead>
          <tbody>
            ${N.dimensionChecks.map(e=>`<tr>
                  <td>${m(e.label)}</td>
                  <td>${m(T(e.actualMm,`length`,z))}</td>
                  <td>${m(T(e.requiredMm,`length`,z))}</td>
                  <td>${m(w(e.source))}</td>
                  <td>${m(y(e.citation.title,e.citation.clause))}</td>
                  <td>${P(e.status)}</td>
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
                  <td>${m(e.mode)}<br /><small class="meta">${m(d(e,z))}</small></td>
                  <td>${m(y(e.citation.title,e.citation.clause))}</td>
                  <td>${m(D(e,e.demandKn,z))}</td>
                  <td>${m(D(e,e.designStrengthKn,z))}</td>
                  <td>${m(h(e.dcr))}</td>
                  <td>${P(e.status)} ${m(e.formal?`正式`:`初篩 / 補資料`)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>φ / ψ 採用總表</h2>
        <table>
          <thead><tr><th>模式</th><th>條文</th><th>採用因子</th><th>狀態</th></tr></thead>
          <tbody>
            ${ae.map(e=>`<tr>
                  <td>${m(e.mode)}</td>
                  <td>${m(y(e.citation.title,e.citation.clause))}</td>
                  <td>${m(ee(e))}</td>
                  <td>${P(e.status)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      ${J.length>0?`<section class="card">
              <h2>產品證據對照</h2>
              <table>
                <thead><tr><th>欄位</th><th>目前值</th><th>文件 / 報告</th><th>頁碼 / 表號</th><th>已核對</th></tr></thead>
                <tbody>
                  ${J.map(e=>{let t=typeof e.rawValue==`number`&&e.quantity?T(e.rawValue,e.quantity,z):e.rawValue===void 0||e.rawValue===null||e.rawValue===``?`未填`:String(e.rawValue);return`<tr>
                        <td>${m(e.label)}</td>
                        <td>${m(t)}</td>
                        <td>${m(e.evidence?.documentName??`—`)}</td>
                        <td>${m(e.evidence?.page??`—`)}</td>
                        <td>${m(e.evidence?.verified?`是`:`否`)}</td>
                      </tr>`}).join(``)}
                </tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>工程提醒</h2>
        <ul>
          ${Array.from(new Set([...N.summary.notes,...L.missing])).map(e=>`<li>${m(e)}</li>`).join(``)}
        </ul>
      </section>
      <footer
        id="reportDocumentStatus"
        class="document-footer-status"
        data-document-state="${G.status}"
        data-approved-at="${m(B.documentApprovedAt||``)}"
        data-calculation-fingerprint="${m(K)}"
      >文件狀態：${m(G.label)}${G.reason?`｜${m(G.reason)}`:``}${K?`｜計算指紋：${m(K)}`:``}</footer>
    </main>
    <script>
      (() => {
        const checkbox = document.getElementById('reportAttachmentApproval')
        const status = document.getElementById('reportDocumentStatus')
        if (!checkbox || !status) return
        let approvedAt = status.dataset.approvedAt || ''
        const fingerprint = status.dataset.calculationFingerprint || ''
        const formatNow = () => new Date().toLocaleString('zh-TW', { hour12:false })
        const update = () => {
          if (checkbox.checked && !approvedAt) approvedAt = formatNow()
          if (!checkbox.checked) approvedAt = ''
          const parts = checkbox.checked
            ? ['文件狀態：正式附件', approvedAt ? '核可時間：' + approvedAt : '']
            : ['文件狀態：內部審閱']
          if (fingerprint) parts.push('計算指紋：' + fingerprint)
          status.textContent = parts.filter(Boolean).join('｜')
          status.dataset.documentState = checkbox.checked ? 'formal-attachment' : 'internal-review'
          status.dataset.approvedAt = approvedAt
        }
        checkbox.addEventListener('change', update)
        update()
      })()
    <\/script>
    ${U?`<script>
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
</html>`}export{L as buildStandaloneGeometrySketchSvg,R as buildStandaloneReportHtml};