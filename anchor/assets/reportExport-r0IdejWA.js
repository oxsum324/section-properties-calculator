import{c as e,o as t}from"./units-DndPln9F.js";import{c as n,l as r,n as i,o as a,s as o,u as s}from"./index-P4k3VvN0.js";import{getSeismicRouteGuidance as c}from"./seismicRouteGuidance-B9l6PZe2.js";function l(e){return e.replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function u(e){return Number.isFinite(e)?new Intl.NumberFormat(`zh-TW`,{maximumFractionDigits:2}).format(e):`—`}function d(e){switch(e){case`pass`:return`符合`;case`fail`:return`不符合`;case`screening`:return`初篩`;case`incomplete`:return`需補資料`;case`warning`:return`提醒`;default:return e}}function f(e){switch(e){case`cast_in`:return`預埋錨栓`;case`post_installed_expansion`:return`後置膨脹錨栓`;case`post_installed_bonded`:return`後置黏結式錨栓`;case`screw_anchor`:return`螺紋錨栓`;case`undercut_anchor`:return`擴底式錨栓`;case`shear_lug`:return`剪力榫`;default:return e}}function p(e){return e===`summary`?`摘要版`:`完整明細版`}function m(e,t){return`${t} ${e}`}function h(e){if(!e)return`—`;let t=new Date(e);return Number.isNaN(t.getTime())?e:t.toLocaleDateString(`zh-TW`,{year:`numeric`,month:`2-digit`,day:`2-digit`})}function g(e){if(!e)return`—`;let t=new Date(e);return Number.isNaN(t.getTime())?e:t.toLocaleString(`zh-TW`,{year:`numeric`,month:`2-digit`,day:`2-digit`,hour:`2-digit`,minute:`2-digit`})}function _(e,t=12){return e?e.slice(0,Math.max(8,t)).toUpperCase():`—`}function v(e){switch(e){case`manual`:return`手動留存`;case`preview`:return`報表預覽`;case`print`:return`列印報表`;case`html`:return`匯出 HTML`;case`xlsx`:return`匯出 XLSX`;case`docx`:return`匯出 DOCX`;default:return`—`}}function y(e){return e===`product`?`產品值`:e===`code_fallback`?`規範退回值`:`規範值`}function b(n,r,i){return Number.isFinite(n)?`${u(e(n,r,i))} ${t(r,i)}`:`—`}function x(e,t){let n=e.anchorCountX*e.anchorCountY,r=Math.min(e.edgeLeftMm,e.edgeRightMm,e.edgeBottomMm,e.edgeTopMm);return[`${e.anchorCountX} × ${e.anchorCountY}（${n} 支）`,`hef ${b(e.effectiveEmbedmentMm,`length`,t)}`,`sx ${b(e.spacingXmm,`length`,t)}`,`sy ${b(e.spacingYmm,`length`,t)}`,`cmin ${b(r,`length`,t)}`].join(` / `)}function S(e,t,n){return e.presentation===`ratio`?u(t):e.presentation===`stress`?b(t,`stress`,n):e.presentation===`length`?b(t,`length`,n):b(t,`force`,n)}function C(e){return!e.factors||e.factors.length===0?`—`:e.factors.map(e=>e.note?`${e.symbol}=${e.value}（${e.label}；${e.note}）`:`${e.symbol}=${e.value}（${e.label}）`).join(`；`)}function w(e){return e.governingDcr??e.maxDcr}function T(e){if(e.project.layout.basePlateLoadedAreaMm2>0)return e.project.layout.basePlateLoadedAreaMm2;let t=Math.max(0,e.project.layout.basePlateLoadedWidthMm??0),n=Math.max(0,e.project.layout.basePlateLoadedHeightMm??0);return t>0&&n>0?t*n:0}function E(e){return e.project.layout.basePlateSectionType===`custom`?`custom`:`rectangle`}function D(e){return e===`custom`?`自訂 Sx / Sy`:`矩形承壓區`}function O(e){switch(e){case`i_h`:return`I / H 形柱`;case`rect`:return`矩形柱`;case`pipe`:return`圓管 / 圓柱`;default:return`手動輸入`}}function k(e){switch(e){case`ready`:return`pass`;case`configuration_issue`:return`warning`;default:return`incomplete`}}function A(e){return`zone-${e}`}function j(e){return`<span class="chip chip-${e}">${l(d(e))}</span>`}function M(e,t){let{layout:n}=e.project,r=s(n,e.anchorPoints),i=a(n,e.analysisLoads),o=new Map,c=new Map(e.visualization.anchors.map(e=>[e.anchorId,e]));e.visualization.edges.forEach(e=>{let t=o.get(e.edge)??[];t.includes(e.label)||t.push(e.label),o.set(e.edge,t)});let d=e.visualization.rectangles.map(e=>`<rect x="${e.x1}" y="${e.y1}" width="${e.x2-e.x1}" height="${e.y2-e.y1}" class="zone ${A(e.kind)}" />`).join(``),f=i?`<g>
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
        >${l(i.label)}</text>
      </g>`:``,p=e.anchorPoints.map(e=>{let t=c.get(e.id),n=t?.state===`tension`?`anchor-tension`:t?.state===`compression`?`anchor-compression`:`anchor-neutral`,r=t?`${t.elasticTensionKn>=0?`+`:``}${u(t.elasticTensionKn)}`:`0`;return`<g>
        <circle cx="${e.x}" cy="${e.y}" r="10" class="anchor ${n}" />
        <circle cx="${e.x}" cy="${e.y}" r="3" class="anchor-center" />
        <text x="${e.x}" y="${e.y-16}" text-anchor="middle" class="anchor-label">${l(e.id)}</text>
        <text x="${e.x}" y="${e.y+24}" text-anchor="middle" class="anchor-demand">${l(r)}</text>
      </g>`}).join(``),m=Array.from(o.entries()).map(([e,t])=>{let r=l(t.join(` / `));return e===`left`?`<g><line x1="4" y1="0" x2="4" y2="${n.concreteHeightMm}" class="edge-highlight" /><text x="12" y="22" class="edge-label">${r}</text></g>`:e===`right`?`<g><line x1="${n.concreteWidthMm-4}" y1="0" x2="${n.concreteWidthMm-4}" y2="${n.concreteHeightMm}" class="edge-highlight" /><text x="${n.concreteWidthMm-12}" y="22" text-anchor="end" class="edge-label">${r}</text></g>`:e===`bottom`?`<g><line x1="0" y1="${n.concreteHeightMm-4}" x2="${n.concreteWidthMm}" y2="${n.concreteHeightMm-4}" class="edge-highlight" /><text x="12" y="${n.concreteHeightMm-12}" class="edge-label">${r}</text></g>`:`<g><line x1="0" y1="4" x2="${n.concreteWidthMm}" y2="4" class="edge-highlight" /><text x="12" y="22" class="edge-label">${r}</text></g>`}).join(``),h=r?`<g>
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
        >${l(r.label)}</text>
      </g>`:``;return`<svg class="geometry" viewBox="0 0 ${n.concreteWidthMm} ${n.concreteHeightMm}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${n.concreteWidthMm}" height="${n.concreteHeightMm}" rx="8" class="concrete-body" />
    ${f}
    ${d}
    ${h}
    ${m}
    ${p}
    <text x="16" y="24" class="sketch-title">混凝土平面 / 活躍組合</text>
    <text x="16" y="46" class="sketch-legend">紅 = 受拉，藍 = 受壓，灰 = 中性；青 = A_Nc，橘 = A_Vc，綠 = 錨栓補強鋼筋，紫 = A1 / 接觸承壓區</text>
    <text x="16" y="${n.concreteHeightMm-14}" class="sketch-meta">${l(`${b(n.concreteWidthMm,`length`,t)} × ${b(n.concreteHeightMm,`length`,t)}`)}</text>
  </svg>`}function N(e){let{batchReview:a,candidateProductReviews:s,layoutVariantReviews:d=[],review:A,selectedProduct:N,completeness:P,evaluationFieldStates:F,unitPreferences:I,reportSettings:L,saveMessage:R,auditEntry:z,auditTrail:B=[],autoPrint:V=!1}=e,H=F.filter(e=>e.hasValue||e.hasEvidence),U=A.results.filter(e=>e.factors&&e.factors.length>0),W=A.results.find(e=>e.id===`seismic`)??null,G=A.project.loads.considerSeismic?c(A.project.loads,N,W):null,K=E(A),q=o(A.project.layout),J=r(A.project.layout),Y=n(A.project.layout),X=a.loadCaseReviews.map(e=>{let t=s.map(t=>{let n=t.batchReview.loadCaseReviews.find(t=>t.loadCaseId===e.loadCaseId);return n?`<td>
            <strong>DCR ${l(u(w(n.review.summary)))}</strong><br />
            ${j(n.review.summary.overallStatus)}<br />
            <small>${l(n.review.summary.governingMode)}${t.batchReview.controllingLoadCaseId===e.loadCaseId?` / 該產品控制`:``}</small>
          </td>`:`<td>—</td>`}).join(``),n=e.loadCaseId===a.activeLoadCaseId&&e.loadCaseId===a.controllingLoadCaseId?`（目前編輯 / 控制組合）`:e.loadCaseId===a.activeLoadCaseId?`（目前編輯）`:e.loadCaseId===a.controllingLoadCaseId?`（控制組合）`:``;return`<tr><td>${l(e.loadCaseName+n)}</td>${t}</tr>`}).join(``),Z=a.loadCaseReviews.map(e=>{let t=d.map(t=>{let n=t.batchReview.loadCaseReviews.find(t=>t.loadCaseId===e.loadCaseId);return n?`<td>
              <div class="matrix-cell${t.batchReview.controllingLoadCaseId===e.loadCaseId?` matrix-cell-controlling`:``}">
                <strong>DCR ${l(u(w(n.review.summary)))}</strong>
                ${j(n.review.summary.overallStatus)}
                <small>${l(n.review.summary.governingMode)}${t.batchReview.controllingLoadCaseId===e.loadCaseId?` / 該配置控制`:``}</small>
              </div>
            </td>`:`<td>—</td>`}).join(``),n=e.loadCaseId===a.activeLoadCaseId&&e.loadCaseId===a.controllingLoadCaseId?`目前編輯 / 控制組合`:e.loadCaseId===a.activeLoadCaseId?`目前編輯`:e.loadCaseId===a.controllingLoadCaseId?`控制組合`:`批次結果`;return`<tr>
          <td>
            <div class="table-mode">
              <strong>${l(e.loadCaseName)}</strong>
              <small>${l(n)}</small>
            </div>
          </td>
          ${t}
        </tr>`}).join(``);return`<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${l(A.project.name)} - 錨栓檢討報告</title>
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
      @media print {
        body { background:#fff; }
        main { max-width:none; padding:0; }
        .card,.hero,.geometry-wrap { box-shadow:none; break-inside:avoid-page; }
        table { break-inside:auto; }
        tr,td,th { break-inside:avoid; }
        h2,h3 { break-after:avoid-page; }
        .hero { break-after:page; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="meta">${l(L.companyName||`工程報表草稿`)}</p>
        <h1>${l(A.project.name)}</h1>
        <p>台灣《建築物混凝土結構設計規範》112年版第17章 錨栓檢討 ${l(p(L.reportMode))}</p>
        <div class="hero-grid">
          <div><small class="meta">案號 / 專案</small><div>${l(L.projectCode||`未填`)}</div></div>
          <div><small class="meta">規範版本</small><div>${l(A.ruleProfile.versionLabel)}</div></div>
          <div><small class="meta">發行日期</small><div>${l(h(L.issueDate))}</div></div>
          <div><small class="meta">輸出時間</small><div>${l(g(A.project.updatedAt))}</div></div>
          <div><small class="meta">留痕 Hash</small><div>${l(_(z?.hash))}</div></div>
          <div><small class="meta">留痕時間</small><div>${l(g(z?.createdAt))}</div></div>
          <div><small class="meta">整體判定</small><div>${j(a.summary.overallStatus)}</div></div>
          <div><small class="meta">正式判定</small><div>${j(a.summary.formalStatus)}</div></div>
          <div><small class="meta">控制模式</small><div>${l(a.summary.governingMode)}</div></div>
          <div><small class="meta">控制組合</small><div>${l(a.controllingLoadCaseName)}</div></div>
        </div>
      </section>

      <section class="grid">
        <article class="card">
          <h2>產品與案例</h2>
          <p><strong>${l(N.brand)} ${l(N.model)}</strong> / ${l(f(N.family))}</p>
          <ul>
            <li>錨栓直徑 da = ${l(b(N.diameterMm,`length`,I))}</li>
            <li>Ase = ${l(b(N.effectiveAreaMm2,`area`,I))}</li>
            <li>目前單位 = ${l(t(`length`,I))} / ${l(t(`area`,I))} / ${l(t(`force`,I))} / ${l(t(`stress`,I))}</li>
            <li>產品完整性 = ${l(P.formal?`正式判定`:`需補資料`)}</li>
            <li>基板承壓 = ${l(A.project.layout.basePlateBearingEnabled?`已啟用（A1 ${b(T(A),`area`,I)} / ${D(K)}${q.widthMm>0&&q.heightMm>0?` / B × N ${b(q.widthMm,`length`,I)} × ${b(q.heightMm,`length`,I)}`:``}${(A.project.layout.columnCentroidOffsetXmm??0)!==0||(A.project.layout.columnCentroidOffsetYmm??0)!==0?` / 柱偏移 ${b(A.project.layout.columnCentroidOffsetXmm??0,`length`,I)} × ${b(A.project.layout.columnCentroidOffsetYmm??0,`length`,I)}`:``}${A.project.layout.basePlateBendingEnabled?` / tp ${b(A.project.layout.basePlateThicknessMm,`length`,I)} / Fy ${b(A.project.layout.basePlateSteelYieldMpa,`stress`,I)}`:``}）`:`未啟用`)}</li>
          </ul>
          ${G?`<p class="meta">耐震路徑狀態：${l(G.title)} / ${l(G.stateMessage)}${G.recommendation?` 建議：${l(G.recommendation.title)}。`:``}</p>`:``}
        </article>
        <article class="card">
          <h2>總結</h2>
          <ul>
            <li>控制 DCR = ${l(u(w(a.summary)))}</li>
            <li>批次最大數值 DCR = ${l(u(a.summary.maxDcr))}</li>
            <li>控制拉力 = ${l(a.summary.governingTensionMode)}</li>
            <li>控制剪力 = ${l(a.summary.governingShearMode)}</li>
            <li>離線狀態 = ${l(R)}</li>
            <li>最新留痕 = ${l(z?`${_(z.hash)} / ${v(z.source)}`:`未留存`)}</li>
          </ul>
          ${w(a.summary)<a.summary.maxDcr?`<p class="meta">控制 DCR 跟隨 severity 判定；最大數值 DCR 僅供統計比較。</p>`:``}
        </article>
      </section>

      ${B.length>0?`<section class="card">
              <h2>審查留痕</h2>
              <table>
                <thead><tr><th>時間</th><th>來源</th><th>Hash</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th></tr></thead>
                <tbody>
                  ${B.map(e=>`<tr>
                        <td>${l(g(e.createdAt))}</td>
                        <td>${l(v(e.source))}</td>
                        <td><code>${l(_(e.hash,16))}</code></td>
                        <td>${l(e.summary.controllingLoadCaseName??`—`)}</td>
                        <td>${l(e.summary.governingMode)}</td>
                        <td>${l(u(e.summary.governingDcr??e.summary.maxDcr))}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>幾何配置</h2>
        <div class="geometry-wrap">
          ${M(A,I)}
        </div>
        ${A.project.layout.basePlateBearingEnabled?`<p class="meta">基板承壓：A1 ${l(b(T(A),`area`,I))} / A2 ${l(b(A.project.layout.basePlateSupportAreaMm2,`area`,I))}${(A.project.layout.basePlateLoadedWidthMm??0)>0&&(A.project.layout.basePlateLoadedHeightMm??0)>0?` / b1 × h1 ${l(b(A.project.layout.basePlateLoadedWidthMm??0,`length`,I))} × ${l(b(A.project.layout.basePlateLoadedHeightMm??0,`length`,I))}`:``}${q.widthMm>0&&q.heightMm>0?` / B × N ${l(b(q.widthMm,`length`,I))} × ${l(b(q.heightMm,`length`,I))}`:``}${(A.project.layout.columnCentroidOffsetXmm??0)!==0||(A.project.layout.columnCentroidOffsetYmm??0)!==0?` / 柱偏移 ${l(b(A.project.layout.columnCentroidOffsetXmm??0,`length`,I))} × ${l(b(A.project.layout.columnCentroidOffsetYmm??0,`length`,I))}`:``} / ${l(D(K))}${K===`custom`?` / Sx ${l(u(A.project.layout.basePlateSectionModulusXmm3??0))} mm³ / Sy ${l(u(A.project.layout.basePlateSectionModulusYmm3??0))} mm³`:``}</p>
               <p class="meta">${K===`custom`?`若以 b1 / h1 + 自訂 Sx / Sy 進入偏心承壓應力模式，b1 / h1 僅供接觸尺寸、kern 與 uplift 判讀；彎曲應力採自訂斷面模數。`:`若以 b1 / h1 進入偏心承壓應力模式，報表目前採矩形承壓區之 Sx / Sy 假設；非矩形基板請另按實際幾何檢算。`}${Y===`manual`?``:` 基板抗彎若未手填 lx / ly，可由 ${l(O(Y))}、B / N 與柱尺寸自動推算。`}</p>
               ${J?`<p class="meta">AISC DG1 自動推算：m = ${l(b(J.mMm,`length`,I))} / n = ${l(b(J.nMm,`length`,I))} / λn' = ${l(b(J.lambdaPrimeMm,`length`,I))} / 建議 lx = ${l(b(J.xMm,`length`,I))} / ly = ${l(b(J.yMm,`length`,I))}</p>`:``}`:``}
      </section>

      <section class="card">
        <h2>載重組合批次檢核</h2>
        <table>
          <thead><tr><th>組合</th><th>拉力 N</th><th>合成剪力 V</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th></tr></thead>
          <tbody>
            ${a.loadCaseReviews.map(e=>`<tr>
                  <td>${l(e.loadCaseName)}</td>
                  <td>${l(b(e.review.analysisLoads.tensionKn,`force`,I))}</td>
                  <td>${l(b(Math.hypot(e.review.analysisLoads.shearXKn,e.review.analysisLoads.shearYKn),`force`,I))}</td>
                  <td>${l(e.review.summary.governingMode)}</td>
                  <td>${l(u(w(e.review.summary)))}</td>
                  <td>${j(e.review.summary.overallStatus)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
        ${A.analysisNote?`<p class="meta">${l(A.analysisNote)}</p>`:``}
      </section>

      ${G?`<section class="card">
              <h2>耐震路徑建議</h2>
              <p><strong>${l(G.title)}</strong> / ${l(G.clause)}</p>
              <p class="meta">${l(G.summary)}</p>
              <p class="meta">目前路徑狀態：${l(G.stateMessage)}</p>
              <div class="route-matrix">
                ${G.routeMatrix.map(e=>`<article class="route-matrix-card route-matrix-card-${e.state}${e.isCurrent?` route-matrix-card-current`:``}">
                      <div class="route-matrix-head">
                        <div>
                          <strong>${l(e.title)}</strong>
                          <small>${l(e.clause)}${e.isCurrent?` / 目前路徑`:``}</small>
                        </div>
                        <span class="chip chip-${k(e.state)}">${l(e.readinessLabel)}</span>
                      </div>
                      <div class="route-matrix-bar"><span style="width:${Math.max(6,Math.round(e.readinessScore*100))}%"></span></div>
                      <p class="meta">readiness ${Math.round(e.readinessScore*100)}% / 待補輸入 ${e.missingInputCount} 項${e.configurationIssueCount>0?`，配置限制 ${e.configurationIssueCount} 項`:``}</p>
                    </article>`).join(``)}
              </div>
              ${G.recommendation?`<p class="meta">建議路徑：<strong>${l(G.recommendation.title)}</strong>。${l(G.recommendation.reason)}</p>`:``}
            </section>`:``}

      ${s.length>1?`<section class="card">
              <h2>候選產品比選</h2>
              <table>
                <thead><tr><th>產品</th><th>族群</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${s.map(e=>`<tr>
                        <td>${l(e.product.brand)} ${l(e.product.model)}${e.product.id===N.id?`（目前選定）`:``}</td>
                        <td>${l(f(e.product.family))}</td>
                        <td>${l(e.batchReview.controllingLoadCaseName)}</td>
                        <td>${l(e.batchReview.summary.governingMode)}</td>
                        <td>${l(u(w(e.batchReview.summary)))}</td>
                        <td>${j(e.batchReview.summary.overallStatus)}</td>
                        <td>${j(e.batchReview.summary.formalStatus)}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
              <h3>產品 × 載重組合矩陣</h3>
              <table>
                <thead>
                  <tr>
                    <th>載重組合</th>
                    ${s.map(e=>`<th>${l(e.product.brand)} ${l(e.product.model)}</th>`).join(``)}
                  </tr>
                </thead>
                <tbody>${X}</tbody>
              </table>
            </section>`:``}

      ${d.length>1?`<section class="card">
              <h2>候選配置比選</h2>
              <table>
                <thead><tr><th>配置</th><th>幾何摘要</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${d.map(e=>`<tr>
                        <td>${l(e.variant.name)}${e.isCurrent?`（目前配置）`:``}</td>
                        <td>${l(x(e.variant.layout,I))}</td>
                        <td>${l(e.batchReview.controllingLoadCaseName)}</td>
                        <td>${l(e.batchReview.summary.governingMode)}</td>
                        <td>${l(u(w(e.batchReview.summary)))}</td>
                        <td>${j(e.batchReview.summary.overallStatus)}</td>
                        <td>${j(e.batchReview.summary.formalStatus)}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
              <h3>配置 × 載重組合矩陣</h3>
              <table>
                <thead>
                  <tr>
                    <th>載重組合</th>
                    ${d.map(e=>`<th>${l(e.variant.name)}<br /><small class="meta">${l(e.isCurrent?`目前配置`:x(e.variant.layout,I))}</small></th>`).join(``)}
                  </tr>
                </thead>
                <tbody>${Z}</tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>最小尺寸檢核</h2>
        <table>
          <thead><tr><th>項目</th><th>實際</th><th>需求</th><th>來源</th><th>條文</th><th>狀態</th></tr></thead>
          <tbody>
            ${A.dimensionChecks.map(e=>`<tr>
                  <td>${l(e.label)}</td>
                  <td>${l(b(e.actualMm,`length`,I))}</td>
                  <td>${l(b(e.requiredMm,`length`,I))}</td>
                  <td>${l(y(e.source))}</td>
                  <td>${l(m(e.citation.title,e.citation.clause))}</td>
                  <td>${j(e.status)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>破壞模式檢核</h2>
        <table>
          <thead><tr><th>模式</th><th>條文</th><th>需求值</th><th>設計值</th><th>DCR</th><th>狀態</th></tr></thead>
          <tbody>
            ${A.results.map(e=>`<tr>
                  <td>${l(e.mode)}<br /><small class="meta">${l(i(e,I))}</small></td>
                  <td>${l(m(e.citation.title,e.citation.clause))}</td>
                  <td>${l(S(e,e.demandKn,I))}</td>
                  <td>${l(S(e,e.designStrengthKn,I))}</td>
                  <td>${l(u(e.dcr))}</td>
                  <td>${j(e.status)} ${l(e.formal?`正式`:`初篩 / 補資料`)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>φ / ψ 採用總表</h2>
        <table>
          <thead><tr><th>模式</th><th>條文</th><th>採用因子</th><th>狀態</th></tr></thead>
          <tbody>
            ${U.map(e=>`<tr>
                  <td>${l(e.mode)}</td>
                  <td>${l(m(e.citation.title,e.citation.clause))}</td>
                  <td>${l(C(e))}</td>
                  <td>${j(e.status)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      ${H.length>0?`<section class="card">
              <h2>產品證據對照</h2>
              <table>
                <thead><tr><th>欄位</th><th>目前值</th><th>文件 / 報告</th><th>頁碼 / 表號</th><th>已核對</th></tr></thead>
                <tbody>
                  ${H.map(e=>{let t=typeof e.rawValue==`number`&&e.quantity?b(e.rawValue,e.quantity,I):e.rawValue===void 0||e.rawValue===null||e.rawValue===``?`未填`:String(e.rawValue);return`<tr>
                        <td>${l(e.label)}</td>
                        <td>${l(t)}</td>
                        <td>${l(e.evidence?.documentName??`—`)}</td>
                        <td>${l(e.evidence?.page??`—`)}</td>
                        <td>${l(e.evidence?.verified?`是`:`否`)}</td>
                      </tr>`}).join(``)}
                </tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>工程提醒</h2>
        <ul>
          ${Array.from(new Set([...A.summary.notes,...P.missing])).map(e=>`<li>${l(e)}</li>`).join(``)}
        </ul>
      </section>
    </main>
    ${V?`<script>
            window.addEventListener('load', () => {
              window.setTimeout(() => window.print(), 160)
            })
          <\/script>`:``}
  </body>
</html>`}export{N as buildStandaloneReportHtml};