/* 鋼筋混凝土工具箱 — 共用計算書產生器
 *
 * 用法:
 *   openReport({
 *     title: '梁設計計算書',
 *     subtitle: 'RC Beam Design Report',
 *     project: { name, no, designer, date },        // date 留白會自動填今天
 *     inputs:   [{ group, items:[{ label, value, unit }] }, ...],
 *     checks:   [{ group, items:[{ label, formula, sub, value, unit, ok, note }] }, ...],
 *     diagrams: [{ title, dataURL, caption, width }, ...],   // 斷面 / PM 曲線等示意圖
 *     summary:  { ok: true|false, text: '✓ OK / ✗ NG' },
 *     symbols:  [{ sym, desc }, ...],
 *     methods:  [{ item, level, ref, note }, ...],
 *     coverage: [{ item, ref, applies, level, evidence, status, ok, gap }, ...],
 *     coverageSummary: [{ title, kind, items:[{ label, detail }] }, ...],
 *     notes:    ['依據 112 年混凝土結構設計規範', ...]
 *   });
 *
 * 開啟一個新視窗呈現可列印 (A4) 計算書;
 * checks[].formula 顯示原式, sub 顯示代入值, value 顯示計算結果
 */

function showRcReportIssue(message) {
  if (typeof document === 'undefined' || !document.body) {
    if (typeof console !== 'undefined' && console.warn) console.warn(message);
    return;
  }
  let status = document.getElementById('rcSharedReportStatus');
  if (!status) {
    status = document.createElement('div');
    status.id = 'rcSharedReportStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.style.cssText = [
      'position:fixed',
      'right:18px',
      'bottom:18px',
      'z-index:9999',
      'max-width:min(420px, calc(100vw - 36px))',
      'padding:10px 12px',
      'border:1px solid #f59e0b',
      'border-radius:6px',
      'background:#fffbeb',
      'color:#7c2d12',
      'font:13px/1.5 "Segoe UI", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
      'box-shadow:0 8px 24px rgba(15, 23, 42, .16)'
    ].join(';');
    document.body.appendChild(status);
  }
  status.textContent = message;
}

function openReport(cfg) {
  const today = new Date();
  const todayStr = today.getFullYear() + '/' +
                   String(today.getMonth()+1).padStart(2,'0') + '/' +
                   String(today.getDate()).padStart(2,'0');
  const proj = Object.assign({ name:'', no:'', designer:'', date: todayStr }, cfg.project || {});

  const esc = s => (s===null||s===undefined?'':String(s))
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const inputsHtml = (cfg.inputs || []).map(g => `
    <section class="rep-block">
      <h3>${esc(g.group)}</h3>
      <table class="rep-input">
        <tbody>
          ${g.items.map(it => `
            <tr>
              <th>${esc(it.label)}</th>
              <td><span class="val">${esc(it.value)}</span> <span class="unit">${esc(it.unit||'')}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  `).join('');

  const checksHtml = (cfg.checks || []).map(g => `
    <section class="rep-block">
      <h3>${esc(g.group)}</h3>
      <table class="rep-check">
        <thead>
          <tr><th>檢核項</th><th>公式</th><th>代入值</th><th>結果</th><th>OK?</th></tr>
        </thead>
        <tbody>
          ${g.items.map(it => {
            const ok = it.ok===true ? '✓ OK' : it.ok===false ? '✗ NG' : (it.ok===null||it.ok===undefined?'—':String(it.ok));
            const cls = it.ok===true?'ok':it.ok===false?'ng':'na';
            return `<tr class="${cls}">
              <td class="lbl">${esc(it.label)}${it.note?`<div class="note">${esc(it.note)}</div>`:''}</td>
              <td class="formula">${esc(it.formula||'—')}</td>
              <td class="sub">${esc(it.sub||'—')}</td>
              <td class="value">${esc(it.value||'—')} <span class="unit">${esc(it.unit||'')}</span></td>
              <td class="judge">${ok}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </section>
  `).join('');

  const symHtml = (cfg.symbols && cfg.symbols.length) ? `
    <section class="rep-block">
      <h3>符號說明</h3>
      <table class="rep-sym">
        <tbody>
          ${cfg.symbols.map(s => `<tr><th>${esc(s.sym)}</th><td>${esc(s.desc)}</td></tr>`).join('')}
       </tbody>
     </table>
   </section>` : '';

  const methodsHtml = (cfg.methods && cfg.methods.length) ? `
    <section class="rep-block">
      <h3>條文對照 ＆ 方法分級</h3>
      <table class="rep-method">
        <thead>
          <tr><th>功能</th><th>分級</th><th>條文 / 依據</th><th>說明</th></tr>
        </thead>
        <tbody>
          ${cfg.methods.map(m => `
            <tr>
              <td>${esc(m.item)}</td>
              <td class="level">${esc(m.level)}</td>
              <td class="ref">${esc(m.ref || '—')}</td>
              <td>${esc(m.note || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>` : '';

  const coverageHtml = (cfg.coverage && cfg.coverage.length) ? `
    <section class="rep-block">
      <h3>規範覆蓋矩陣</h3>
      <table class="rep-coverage">
        <thead>
          <tr><th>檢核項</th><th>條文 / 依據</th><th>適用條件</th><th>層級</th><th>判定證據</th><th>狀態</th><th>未納入 / 待複核</th></tr>
        </thead>
        <tbody>
          ${cfg.coverage.map(c => {
            const cls = c.ok===true?'ok':c.ok===false?'ng':'na';
            return `<tr class="${cls}">
              <td class="lbl">${esc(c.item)}</td>
              <td class="ref">${esc(c.ref || '—')}</td>
              <td>${esc(c.applies || '—')}</td>
              <td class="level">${esc(c.level || '—')}</td>
              <td>${esc(c.evidence || '—')}</td>
              <td class="status">${esc(c.status || '—')}</td>
              <td>${esc(c.gap || '—')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </section>` : '';
  const coverageSummaryHtml = (cfg.coverageSummary && cfg.coverageSummary.length) ? `
    <section class="rep-block rep-coverage-summary-wrap">
      <h3>缺漏 / 複核摘要</h3>
      <div class="rep-coverage-summary">
        ${cfg.coverageSummary.map(g => {
          const cls = g.kind || 'info';
          const items = g.items || [];
          return `<div class="rep-coverage-summary-card ${esc(cls)}">
            <div class="rep-coverage-summary-title">${esc(g.title)}<span>${items.length}</span></div>
            ${items.length ? `<ul>${items.map(it => `<li><b>${esc(it.label || '')}</b>${it.detail ? `<em>${esc(it.detail)}</em>` : ''}</li>`).join('')}</ul>` : '<div class="empty">無</div>'}
          </div>`;
        }).join('')}
      </div>
    </section>` : '';


  const notesHtml = (cfg.notes && cfg.notes.length) ? `
    <section class="rep-block">
      <h3>備註</h3>
      <ol class="rep-notes">
        ${cfg.notes.map(n=>`<li>${esc(n)}</li>`).join('')}
      </ol>
    </section>` : '';

  const diagramsHtml = (cfg.diagrams && cfg.diagrams.length) ? `
    <section class="rep-block rep-diagrams">
      <h3>斷面示意圖</h3>
      <div class="rep-diagrams-grid">
        ${cfg.diagrams.map(d => `
          <figure class="rep-diagram">
            ${d.title ? `<figcaption class="rep-diagram-title">${esc(d.title)}</figcaption>` : ''}
            <img src="${d.dataURL}" alt="${esc(d.title||'')}" style="${d.width?`max-width:${d.width}px;`:''}">
            ${d.caption ? `<div class="rep-diagram-caption">${esc(d.caption)}</div>` : ''}
          </figure>
        `).join('')}
      </div>
    </section>` : '';

  const stepsHtml = (cfg.steps && cfg.steps.length) ? `
    <section class="rep-block rep-steps-wrap">
      <h3>計算過程明細</h3>
      ${cfg.steps.map(s => `
        <div class="rep-step">
          <h4>${esc(s.group)}</h4>
          <pre class="rep-step-body">${esc(s.body)}</pre>
        </div>
      `).join('')}
    </section>` : '';

  const summary = cfg.summary || {};
  const summaryCls = summary.ok===true?'ok':summary.ok===false?'ng':'na';

  const html = `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<title>${esc(cfg.title || '計算書')}</title>
<style>
@page { size: A4 portrait; margin: 18mm 14mm; }
* { box-sizing: border-box; }
body { font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", system-ui, sans-serif;
       color:#111; margin:0; padding:24px; background:#f4f4f4; }
.rep-paper { max-width: 800px; margin:0 auto; background:#fff; padding:32px 36px;
             box-shadow:0 2px 12px rgba(0,0,0,.08); }
.rep-header { border-bottom:3px double #222; padding-bottom:12px; margin-bottom:16px; }
.rep-header h1 { margin:0 0 4px; font-size:22px; }
.rep-header .sub { color:#555; font-size:13px; }
.rep-meta { display:grid; grid-template-columns:repeat(2,1fr); gap:6px 24px;
            font-size:12px; margin:14px 0 18px; }
.rep-meta div { border-bottom:1px dotted #888; padding:4px 0; }
.rep-meta b { display:inline-block; min-width:64px; color:#444; }
.rep-block { margin:14px 0 18px; }
.rep-block h3 { font-size:14px; margin:0 0 6px; padding:4px 8px;
                background:#1a3d5c; color:#fff; border-radius:3px 3px 0 0; }
table { width:100%; border-collapse:collapse; font-size:12px; }
.rep-input th, .rep-input td { border:1px solid #888; padding:5px 8px; }
.rep-input th { background:#eef2f6; text-align:left; width:38%; font-weight:600; }
.rep-input .val { font-weight:600; }
.rep-input .unit { color:#666; font-size:11px; margin-left:4px; }
.rep-check th, .rep-check td { border:1px solid #888; padding:5px 6px; vertical-align:top; }
.rep-check th { background:#eef2f6; font-weight:600; text-align:center; font-size:11px; }
.rep-check td.lbl { width:18%; font-weight:600; }
.rep-check td.formula { width:24%; font-family:"Cambria Math","Times New Roman",serif; font-style:italic; }
.rep-check td.sub { width:30%; font-family:"Consolas",monospace; font-size:11px; color:#333; white-space:pre-wrap; word-break:break-word; }
.rep-check td.value { width:14%; font-weight:600; text-align:right; }
.rep-check td.judge { width:10%; text-align:center; font-weight:700; }
.rep-check tr.ok td.judge { color:#1b8a3a; }
.rep-check tr.ng td.judge { color:#c0392b; }
.rep-check tr.ng td.lbl { color:#c0392b; }
.rep-check .note { font-weight:400; font-size:10px; color:#666; margin-top:2px; }
.rep-sym th { background:#fafbfc; text-align:center; width:80px;
              font-family:"Cambria Math",serif; font-style:italic; }
  .rep-sym td { padding:4px 8px; border:1px solid #aaa; }
  .rep-sym tr th { border:1px solid #aaa; }
  .rep-method th, .rep-method td { border:1px solid #888; padding:5px 6px; vertical-align:top; }
  .rep-method th { background:#eef2f6; font-weight:600; text-align:center; font-size:11px; }
  .rep-method td.level { width:12%; text-align:center; font-weight:700; }
  .rep-method td.ref { width:16%; font-family:"Consolas",monospace; font-size:11px; }
  .rep-coverage th, .rep-coverage td { border:1px solid #888; padding:4px 5px; vertical-align:top; font-size:10.5px; }
  .rep-coverage th { background:#eef2f6; font-weight:600; text-align:center; }
  .rep-coverage td.lbl { width:13%; font-weight:700; }
  .rep-coverage td.ref { width:13%; font-family:"Consolas",monospace; font-size:10px; }
  .rep-coverage td.level { width:10%; text-align:center; font-weight:700; }
  .rep-coverage td.status { width:9%; text-align:center; font-weight:700; }
  .rep-coverage tr.ok td.status { color:#1b8a3a; }
  .rep-coverage tr.ng td.status { color:#c0392b; }
  .rep-coverage tr.ng td.lbl { color:#c0392b; }
  .rep-coverage-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  .rep-coverage-summary-card { border:1px solid #cbd5e1; border-left:4px solid #64748b; padding:6px 8px; font-size:10.5px; background:#fafbfc; page-break-inside:avoid; }
  .rep-coverage-summary-card.ng { border-left-color:#c0392b; background:#fff7f7; }
  .rep-coverage-summary-card.warn { border-left-color:#b45309; background:#fffaf0; }
  .rep-coverage-summary-card.info { border-left-color:#2563eb; background:#f8fbff; }
  .rep-coverage-summary-title { display:flex; justify-content:space-between; gap:8px; font-weight:700; margin-bottom:4px; color:#1f2937; }
  .rep-coverage-summary-title span { min-width:20px; text-align:center; border-radius:10px; background:#e5e7eb; padding:0 5px; }
  .rep-coverage-summary ul { margin:0; padding-left:16px; }
  .rep-coverage-summary li { margin:2px 0 4px; }
  .rep-coverage-summary li b { display:block; }
  .rep-coverage-summary li em { display:block; margin-top:1px; color:#555; font-style:normal; line-height:1.3; }
  .rep-coverage-summary .empty { color:#667085; }
  .rep-notes { padding-left:20px; font-size:12px; }
.rep-notes li { margin:3px 0; }
.rep-step { margin:10px 0 14px; page-break-inside: avoid; }
.rep-step h4 { margin:0 0 4px; padding:3px 8px; font-size:12px;
               background:#ede9fe; color:#5b21b6; border-left:3px solid #7c3aed; }
.rep-step-body { white-space:pre-wrap; word-break:break-word;
                 font-family:"Consolas","Cascadia Code",monospace; font-size:11px;
                 line-height:1.55; background:#faf5ff; border:1px solid #e9d5ff;
                 border-radius:4px; padding:8px 10px; margin:0; color:#3b0764; }
.rep-summary { margin:12px 0 20px; padding:14px 18px; border-radius:5px;
               font-size:18px; font-weight:700; text-align:center; }
.rep-summary.ok { background:#e8f5ec; color:#1b8a3a; border:2px solid #1b8a3a; }
.rep-summary.ng { background:#fbeaea; color:#c0392b; border:2px solid #c0392b; }
.rep-summary.na { background:#f0f0f0; color:#555; border:2px solid #888; }
.rep-diagrams-grid { display:flex; flex-wrap:wrap; gap:14px; justify-content:center; }
.rep-diagram { margin:0; padding:8px 10px; border:1px solid #cbd5e1; border-radius:4px;
               background:#fafbfc; text-align:center; page-break-inside: avoid; flex:0 0 auto; }
.rep-diagram-title { font-size:12px; font-weight:600; color:#1a3d5c; margin-bottom:4px; }
.rep-diagram img { max-width:100%; height:auto; display:block; margin:0 auto; }
.rep-diagram-caption { font-size:10px; color:#666; margin-top:4px; font-style:italic; }
.rep-toolbar { max-width:800px; margin:0 auto 12px; text-align:right; }
.rep-toolbar button { background:#1a3d5c; color:#fff; border:0; padding:8px 18px;
                      font-size:13px; border-radius:4px; cursor:pointer; margin-left:6px; }
.rep-toolbar button:hover { background:#27567c; }
.rep-window-status { display:block; margin-top:8px; color:#7c2d12; font-size:12px; line-height:1.45; min-height:18px; }
.rep-footer { position:fixed; right:14mm; bottom:8mm;
              font-size:10px; color:#666; text-align:right; }
@media print {
  body { background:#fff; padding:0; }
  .rep-toolbar { display:none; }
  .rep-paper { box-shadow:none; padding:0; max-width:none; }
}
</style>
</head>
<body>
<div class="rep-toolbar">
  <button onclick="window.print()">🖨️ 列印 / 存 PDF</button>
  <button onclick="closeReportWindow()">✕ 關閉</button>
  <span class="rep-window-status" id="repWindowStatus" role="status" aria-live="polite"></span>
</div>
<div class="rep-paper">
  <div class="rep-header">
    <h1>${esc(cfg.title || '計算書')}</h1>
    ${cfg.subtitle?`<div class="sub">${esc(cfg.subtitle)}</div>`:''}
  </div>
  <div class="rep-meta">
    <div><b>計畫名稱</b>${esc(proj.name)||'—'}</div>
    <div><b>計畫編號</b>${esc(proj.no)||'—'}</div>
    <div><b>設計人員</b>${esc(proj.designer)||'—'}</div>
    <div><b>製表日期</b>${esc(proj.date)}</div>
  </div>

  <div class="rep-summary ${summaryCls}">${esc(summary.text || '—')}</div>

  ${coverageSummaryHtml}
  ${diagramsHtml}
  ${inputsHtml}
  ${checksHtml}
  ${stepsHtml}
  ${symHtml}
  ${methodsHtml}
  ${coverageHtml}
  ${notesHtml}

  <div class="rep-footer">版權所有 弘一工程顧問有限公司</div>
</div>
<script>
function showReportWindowStatus(message) {
  var status = document.getElementById('repWindowStatus');
  if (status) status.textContent = message;
}
function closeReportWindow() {
  try { window.close(); } catch (e) {}
  try { window.open('', '_self', ''); window.close(); } catch (e) {}
  setTimeout(function() {
    if (!window.closed) {
      showReportWindowStatus('瀏覽器安全策略無法自動關閉，請手動按 Ctrl+W 或 Command+W 關閉分頁。');
    }
  }, 150);
}
</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=1100,scrollbars=yes');
  if (!w) {
    showRcReportIssue('請允許彈出視窗以開啟計算書。');
    return;
  }
  w.document.open(); w.document.write(html); w.document.close();
}

// === 為各工具提供共用 project info 欄位 (HTML 片段) ===
function projectFieldsHTML(prefix='proj') {
  return `
  <div class="card">
    <h3>計畫資訊（計算書 header）</h3>
    <div class="form-row">
      <div class="form-group"><label>計畫名稱</label><input type="text" id="${prefix}Name" placeholder="例：XX 大樓新建工程"></div>
      <div class="form-group"><label>計畫編號</label><input type="text" id="${prefix}No" placeholder="例：2026-001"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>設計人員</label><input type="text" id="${prefix}Designer" placeholder="姓名"></div>
      <div class="form-group"><label>備註</label><input type="text" id="${prefix}Note" placeholder="—"></div>
    </div>
    <button class="btn-report" id="btnReport" type="button">📄 產生計算書</button>
  </div>`;
}

// === 取得 project info ===
function getProjectInfo(prefix='proj') {
  const v = id => (document.getElementById(prefix+id)?.value || '').trim();
  return { name: v('Name'), no: v('No'), designer: v('Designer'), note: v('Note') };
}
