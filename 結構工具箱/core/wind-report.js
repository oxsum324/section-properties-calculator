(function (global) {
  function esc(text) {
    return (text === null || text === undefined ? '' : String(text))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function cleanText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeProjectFieldValue(value) {
    const text = cleanText(value);
    return text === '未填' ? '' : text;
  }

  function isBlankProjectMetaValue(value) {
    return !normalizeProjectFieldValue(value);
  }

  function textFrom(el) {
    return cleanText(el?.textContent || '');
  }

  function titleFrom(el) {
    if (!el) return '未命名區塊';
    const heading = el.querySelector('h2');
    if (heading) return textFrom(heading) || '未命名區塊';
    const summary = el.querySelector('summary');
    if (!summary) return '未命名區塊';
    const primary = Array.from(summary.children).find(child => !child.classList.contains('fold-chip'));
    return textFrom(primary || summary) || '未命名區塊';
  }

  function project() {
    const v = id => cleanText(document.getElementById(id)?.value || '');
    return {
      name: normalizeProjectFieldValue(v('projName')),
      no: normalizeProjectFieldValue(v('projNo')),
      designer: normalizeProjectFieldValue(v('projDesigner'))
    };
  }

  function buildWindReportTrace({ title, subtitle, mode, summary, inputGroups }) {
    const reportUi = global.ToolReportUI;
    if (!reportUi || typeof reportUi.buildReportTrace !== 'function') {
      showWindReportIssue('共用報告追溯模組未載入，無法產生正式計算書。');
      return null;
    }
    const headerTitle = textFrom(document.querySelector('header h1')) || title;
    const displayedVersion = headerTitle.match(/(?:^|\s)(V\d+(?:\.\d+)*(?:[-+.\w]*)?)(?=\s|$)/i)?.[1] || '';
    const tool = headerTitle.replace(/\s*V\d+(?:\.\d+)*(?:[-+.\w]*)?\s*$/i, '').trim() || title;
    const version = typeof TOOL_VERSION !== 'undefined' && TOOL_VERSION
      ? String(TOOL_VERSION).trim()
      : displayedVersion;
    return reportUi.buildReportTrace({
      title,
      subtitle,
      outputSource: { tool, version },
      snapshot: {
        reportMode: mode,
        summary: { ok: summary?.ok, text: summary?.text || '' },
        inputs: inputGroups || [],
      },
    });
  }

  function getCurrentReportTrace() {
    const title = textFrom(document.querySelector('header h1')) || '耐風計算書';
    const subtitle = textFrom(document.querySelector('header p'));
    return buildWindReportTrace({
      title,
      subtitle,
      mode: currentReportMode(),
      summary: collectSummary(),
      inputGroups: collectInputGroups(),
    });
  }

  function isProjectMetaMissing(projectInfo = project()) {
    return isBlankProjectMetaValue(projectInfo?.name)
      || isBlankProjectMetaValue(projectInfo?.no)
      || isBlankProjectMetaValue(projectInfo?.designer);
  }

  function reportOpt(id, fallback) {
    const el = document.getElementById(id);
    return el ? !!el.checked : !!fallback;
  }

  function currentReportMode() {
    return document.getElementById('reportMode')?.value === 'summary' ? 'summary' : 'detailed';
  }

  function reportModeLabel(mode) {
    return mode === 'summary' ? '簡易結果' : '詳算式';
  }

  function ensureWindReportStatus() {
    if (typeof document === 'undefined' || !document.body) {
      return null;
    }
    let status = document.getElementById('windReportStatus');
    if (!status) {
      status = document.createElement('div');
      status.id = 'windReportStatus';
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
      status.hidden = true;
      document.body.appendChild(status);
    }
    return status;
  }

  function clearWindReportIssue() {
    const status = ensureWindReportStatus();
    if (!status) return;
    status.textContent = '';
    status.hidden = true;
  }

  function showWindReportIssue(message) {
    if (typeof document === 'undefined' || !document.body) {
      if (typeof console !== 'undefined' && console.warn) console.warn(message);
      return;
    }
    if (!message) {
      clearWindReportIssue();
      return;
    }
    const status = ensureWindReportStatus();
    if (!status) return;
    status.hidden = false;
    status.textContent = message;
  }

  function openWindReportWindow() {
    const reportWindow = window.open('', '_blank', 'width=1100,height=1100,scrollbars=yes');
    if (!reportWindow) {
      showWindReportIssue('請允許彈出視窗以開啟計算書。');
      return null;
    }
    return reportWindow;
  }

  function normalizeStatusGridItem(item) {
    if (Array.isArray(item)) {
      return { label: item[0], value: item[1] };
    }
    if (item && typeof item === 'object') {
      return { label: item.label, value: item.value };
    }
    return null;
  }

  function normalizeStatusGridOptions(options) {
    const container = options?.container || options?.target;
    if (!container) return null;

    const model = options?.model && typeof options.model === 'object' ? options.model : {};
    const itemsSource = Array.isArray(model.items) ? model.items : options?.items;
    const panelLabel = options?.eyebrow != null
      ? String(options.eyebrow)
      : (options?.panelLabel == null ? '' : String(options.panelLabel));

    return {
      container,
      containerClassName: cleanText(options?.containerClassName || 'report-readiness'),
      level: cleanText(model.level || options?.level || 'blocked'),
      panelLabel,
      title: model.title == null ? String(options?.title || '') : String(model.title),
      badge: model.badge == null ? String(options?.badge || '') : String(model.badge),
      items: (Array.isArray(itemsSource) ? itemsSource : []).map(normalizeStatusGridItem).filter(Boolean),
      priorityItems: Array.isArray(options?.priorityItems) ? options.priorityItems.filter(Boolean).map(item => String(item)) : [],
      note: options?.note == null ? '' : String(options.note)
    };
  }

  function renderStatusGridPanel(options) {
    const normalized = normalizeStatusGridOptions(options);
    if (!normalized) return;

    normalized.container.className = [normalized.containerClassName, normalized.level].filter(Boolean).join(' ');
    normalized.container.innerHTML = `
      <div class="report-readiness-head">
        <div>
          ${normalized.panelLabel ? `<p class="report-readiness-kicker">${esc(normalized.panelLabel)}</p>` : ''}
          <p class="report-readiness-title">${esc(normalized.title)}</p>
        </div>
        <span class="report-readiness-badge">${esc(normalized.badge)}</span>
      </div>
      ${normalized.priorityItems.length ? `<ul>${normalized.priorityItems.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
      <div class="report-readiness-grid">
        ${normalized.items.map(item => `
          <div class="report-readiness-item">
            <strong>${esc(item?.label || '')}</strong>
            <span>${esc(item?.value || '')}</span>
          </div>
        `).join('')}
      </div>
      ${normalized.note ? `<div class="report-readiness-note">${esc(normalized.note)}</div>` : ''}
    `;
  }

  function reportToolbarHtml() {
    return `
<div class="rep-toolbar">
  <button onclick="window.print()">🖨️ 列印 / 存 PDF</button>
  <button onclick="closeReportWindow()">✕ 關閉</button>
  <span class="rep-window-status" id="repWindowStatus" role="status" aria-live="polite"></span>
</div>`;
  }

  function reportWindowScriptHtml() {
    return `
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
</script>`;
  }

  function fieldValue(el) {
    if (!el) return '—';
    if (el.tagName === 'SELECT') return cleanText(el.selectedOptions[0]?.textContent || el.value);
    if (el.type === 'checkbox') return el.checked ? '啟用' : '未啟用';
    return cleanText(el.value);
  }

  function isCalculationBookOutputControl(field) {
    const id = String(field?.id || '');
    return id === 'chkDetail' || id === 'reportMode' || id === 'repRemember' || id.startsWith('rep_');
  }

  function collectInputGroups() {
    const left = document.querySelector('.main-layout > div:first-child');
    if (!left) return [];
    const groups = Array.from(left.children)
      .filter(node => node.matches('.card, details.card'))
      .map(card => {
        const items = [];
        card.querySelectorAll('.form-group').forEach(group => {
          if (!isVisible(group)) return;
          const label = textFrom(group.querySelector('label'));
          const field = group.querySelector('input, select, textarea');
          if (!label || !field) return;
          if (isCalculationBookOutputControl(field)) return;
          if (field.disabled || field.hidden || !isVisible(field)) return;
          items.push({ label, value: fieldValue(field), unit: '' });
        });
        card.querySelectorAll('.checkbox-row').forEach(row => {
          if (!isVisible(row)) return;
          const label = textFrom(row.querySelector('label'));
          const field = row.querySelector('input[type="checkbox"]');
          if (!label || !field) return;
          if (isCalculationBookOutputControl(field)) return;
          if (!field.checked && row.dataset.reportUnchecked === 'omit') return;
          items.push({ label, value: field.checked ? '啟用' : '未啟用', unit: '' });
        });
        return items.length ? { group: titleFrom(card), items } : null;
      })
      .filter(Boolean);
    return typeof global.ToolReportUI?.getCalculationBookInputGroups === 'function'
      ? global.ToolReportUI.getCalculationBookInputGroups(groups)
      : groups;
  }

  function makeTextGroup(group, text, label) {
    const body = cleanText(text);
    if (!body) return null;
    return {
      group,
      items: [{
        label: label || '內容',
        formula: '—',
        sub: body,
        value: '—',
        unit: '',
        ok: null
      }]
    };
  }

  function parseKVList(container, group) {
    if (!container) return null;
    const items = [];
    container.querySelectorAll('.k').forEach(row => {
      const label = textFrom(row.querySelector('.k-label')) || textFrom(row.children[0]);
      const value = textFrom(row.querySelector('.k-val')) || textFrom(row.children[1]);
      if (!label && !value) return;
      items.push({
        label: label || '項目',
        formula: '—',
        sub: '—',
        value: value || '—',
        unit: '',
        ok: null
      });
    });
    container.querySelectorAll('.applic-item').forEach(row => {
      const label = textFrom(row.querySelector('.k'));
      const value = textFrom(row.querySelector('.v'));
      if (!label && !value) return;
      items.push({
        label: label || '項目',
        formula: '—',
        sub: '—',
        value: value || '—',
        unit: '',
        ok: null
      });
    });
    return items.length ? { group, items } : null;
  }

  function parseResultGrid(card, group) {
    if (!card) return null;
    const items = Array.from(card.querySelectorAll('.result-item')).map(item => {
      const label = textFrom(item.querySelector('.label'));
      const value = textFrom(item.querySelector('.value'));
      const unit = textFrom(item.querySelector('.unit'));
      if (!label) return null;
      return {
        label,
        formula: '—',
        sub: '—',
        value: value || '—',
        unit,
        ok: null
      };
    }).filter(Boolean);
    return items.length ? { group: group || titleFrom(card), items } : null;
  }

  function parseTable(table, group, mode) {
    if (!table) return null;
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => textFrom(th));
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => {
      const cells = Array.from(tr.cells).map(td => textFrom(td));
      if (!cells.length) return null;
      const extras = [];
      for (let i = 2; i < cells.length; i++) {
        const head = headers[i] || `欄位${i + 1}`;
        if (cells[i]) extras.push(`${head}：${cells[i]}`);
      }
      let formula = '—';
      if (mode === 'directional' && headers[1]) formula = `${headers[1]} / ${headers[2]} / ${headers[3]}`;
      else if (headers[1]) formula = headers[1];
      return {
        label: cells[0] || '—',
        formula,
        sub: extras.join(' ｜ ') || '—',
        value: cells[1] || '—',
        unit: '',
        ok: null
      };
    }).filter(Boolean);
    return rows.length ? { group, items: rows } : null;
  }

  function appendIf(list, group) {
    if (group && group.items && group.items.length) list.push(group);
  }

  function collectSteps() {
    const stepWrap = document.getElementById('steps');
    if (!stepWrap) return [];
    return Array.from(stepWrap.querySelectorAll('.step')).map(step => {
      const group = textFrom(step.querySelector('.step-title'));
      const body = textFrom(step.querySelector('.step-body'));
      return group && body ? { group, body } : null;
    }).filter(Boolean);
  }

  function collectNotes() {
    return Array.from(document.querySelectorAll('.note'))
      .map(el => cleanText(el.textContent))
      .filter(Boolean)
      .slice(0, 8);
  }

  function collectSummary() {
    const banner = document.querySelector('#banner, #applicStatus, .banner-status');
    const text = textFrom(banner);
    const ok = /依規範條件計算如下/.test(text)
      ? true
      : /規範條件局部不適用/.test(text)
        ? false
        : null;
    return { ok, text: text || '—' };
  }

  function buildPageDocumentStateReport(projectInfo) {
    const reportUi = global.ToolReportUI;
    if (!reportUi || typeof reportUi.buildFormalDocumentStateReport !== 'function') {
      showWindReportIssue('共用文件狀態模組未載入，無法產生正式計算書。');
      return null;
    }
    return reportUi.buildFormalDocumentStateReport({
      project: projectInfo,
      calculated: true,
      readinessLevel: reportUi.getPageReportReadinessLevel(document),
    });
  }

  function collectWindForceChecks() {
    const groups = [];
    appendIf(groups, parseKVList(document.getElementById('bannerKey'), '綜合結論摘要'));
    appendIf(groups, makeTextGroup('適用性檢查', textFrom(document.getElementById('applicability'))));
    appendIf(groups, makeTextGroup('設計風力組合', textFrom(document.getElementById('comboSummary'))));
    appendIf(groups, parseTable(document.getElementById('controlTable'), '控制採用表', 'directional'));
    appendIf(groups, parseTable(document.getElementById('dirComboTable'), '雙主風向設計風力組合', 'directional'));
    appendIf(groups, makeTextGroup('第四章角隅加速度', textFrom(document.getElementById('accelFormalSummary'))));
    appendIf(groups, makeTextGroup('簡化推估附錄', textFrom(document.getElementById('accelEstimateSummary'))));
    appendIf(groups, parseTable(document.getElementById('comboTable'), '逐層設計風力組合', 'directional'));
    appendIf(groups, makeTextGroup('MWFRS 內外壓組合', textFrom(document.getElementById('caseSummary'))));
    appendIf(groups, makeTextGroup('屋面主結構壓力', textFrom(document.getElementById('roofSummary'))));
    appendIf(groups, makeTextGroup('橫風向與扭轉向設計風力', textFrom(document.getElementById('lateralSummary'))));
    appendIf(groups, makeTextGroup('MWFRS 女兒牆', textFrom(document.getElementById('parapetSummary'))));
    appendIf(groups, makeTextGroup('適用分流', textFrom(document.getElementById('routeSummary'))));
    appendIf(groups, parseTable(document.getElementById('storyTable'), '逐層風壓與風力', 'directional'));
    appendIf(groups, makeTextGroup('公式依據', textFrom(document.querySelector('h2 + .legend'))));
    return groups;
  }

  function collectWindCcChecks() {
    const groups = [];
    appendIf(groups, parseKVList(document.getElementById('applicList'), '適用性檢查'));
    appendIf(groups, parseTable(document.getElementById('designAdoptTable'), '設計採用表'));
    appendIf(groups, parseResultGrid(document.querySelector('#r-zone-name')?.closest('.card'), '控制區域明細'));
    appendIf(groups, parseTable(document.getElementById('zoneSummaryTable'), '各區域風壓總覽'));
    appendIf(groups, parseResultGrid(document.getElementById('reduceResultCard'), '特殊修正 / 折減結果'));
    appendIf(groups, makeTextGroup('區域示意與說明', textFrom(document.querySelector('.schema')) + ' ' + textFrom(document.querySelector('.schema')?.nextElementSibling)));
    return groups;
  }

  function collectWindOpenRoofChecks() {
    const groups = [];
    appendIf(groups, parseKVList(document.getElementById('applicList'), '適用性檢查'));
    appendIf(groups, parseTable(document.getElementById('designAdoptTable'), '設計採用表'));
    appendIf(groups, parseResultGrid(document.querySelector('#r-zone-name')?.closest('.card'), '控制區域明細'));
    appendIf(groups, parseTable(document.getElementById('zoneSummaryTable'), '各區域風壓總覽'));
    appendIf(groups, parseResultGrid(document.getElementById('reduceResultCard'), '特殊修正 / 折減結果'));
    appendIf(groups, makeTextGroup('圖 3.3 說明', textFrom(document.querySelector('.legend'))));
    return groups;
  }

  function collectWindParapetChecks() {
    const groups = [];
    appendIf(groups, parseKVList(document.getElementById('applicList'), '適用性檢查'));
    appendIf(groups, makeTextGroup('規範路線', `${textFrom(document.getElementById('designRouteTag'))} ${textFrom(document.getElementById('controlRouteTag'))}`));
    appendIf(groups, parseTable(document.getElementById('designAdoptTable'), '設計採用表'));
    appendIf(groups, parseResultGrid(document.querySelector('#r-control-name')?.closest('.card'), '控制條件明細'));
    appendIf(groups, parseTable(document.getElementById('ccSummaryTable'), '各條件風壓總覽'));
    appendIf(groups, parseResultGrid(document.getElementById('reduceResultCard'), '特殊修正 / 折減結果'));
    appendIf(groups, makeTextGroup('本頁假設', textFrom(document.querySelector('.assump'))));
    return groups;
  }

  function collectGenericChecks() {
    const groups = [];
    appendIf(groups, parseKVList(document.getElementById('applicList') || document.getElementById('bannerKey'), '適用性檢查'));
    appendIf(groups, parseTable(document.querySelector('table#adoptTable, table#designAdoptTable, table#controlTable'), '設計採用表'));
    const resultCard = document.querySelector('.results-grid')?.closest('.card');
    appendIf(groups, parseResultGrid(resultCard, titleFrom(resultCard)));
    appendIf(groups, parseTable(document.querySelector('table#segmentTable, table#zoneSummaryTable, table#ccSummaryTable, table#storyTable, table#comboTable, table#dirComboTable'), '結果總覽', 'directional'));
    appendIf(groups, makeTextGroup('說明', textFrom(document.querySelector('.legend, .note, .schema, .assump'))));
    return groups;
  }

  function collectCheckGroups() {
    if (document.getElementById('controlTable')) return collectWindForceChecks();
    if (document.getElementById('zoneSummaryTable') && document.getElementById('r-gcp-pos')) return collectWindCcChecks();
    if (document.getElementById('zoneSummaryTable') && document.getElementById('r-cpn-pos')) return collectWindOpenRoofChecks();
    if (document.getElementById('ccSummaryTable')) return collectWindParapetChecks();
    return collectGenericChecks();
  }

  function buildInputSectionsHtml(groups) {
    const blocks = (groups || []).map(g => `
      <section class="rep-block">
        <h3>${esc(g.group)}</h3>
        <table class="rep-input">
          <tbody>
            ${(g.items || []).map(it => `
              <tr>
                <th>${esc(it.label)}</th>
                <td><span class="val">${esc(it.value)}</span>${it.unit ? ` <span class="unit">${esc(it.unit)}</span>` : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    `).join('');
    return blocks ? `
      <section class="rep-block">
        <h3>輸入資料表</h3>
      </section>
      ${blocks}
    ` : '';
  }

  function isVisible(el) {
    if (!el) return false;
    let node = el;
    while (node && node !== document.body) {
      const style = global.getComputedStyle ? global.getComputedStyle(node) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      if (node.hidden) return false;
      node = node.parentElement;
    }
    return true;
  }

  function buildNarrativeSection(title, el) {
    if (!isVisible(el) || !cleanText(el.textContent || '')) return '';
    return `
      <section class="rep-block">
        <h3>${esc(title)}</h3>
        <div class="rep-text">${el.innerHTML}</div>
      </section>
    `;
  }

  function buildTableSection(title, table, noteEl) {
    if (!table || !isVisible(table)) return '';
    const hasRows = table.querySelector('tbody tr');
    if (!hasRows) return '';
    const noteHtml = cleanText(noteEl?.textContent || '') ? `<div class="rep-note">${noteEl.innerHTML}</div>` : '';
    return `
      <section class="rep-block">
        <h3>${esc(title)}</h3>
        <div class="rep-table-wrap">
          <table class="rep-table wind-table">${table.innerHTML}</table>
        </div>
        ${noteHtml}
      </section>
    `;
  }

  function buildBannerKeySection() {
    const key = document.getElementById('bannerKey');
    if (!key || !isVisible(key)) return '';
    const rows = Array.from(key.querySelectorAll('.k')).map(row => {
      const label = textFrom(row.querySelector('.k-label')) || textFrom(row.children[0]);
      const value = textFrom(row.querySelector('.k-val')) || textFrom(row.children[1]);
      if (!label && !value) return '';
      return `<tr><th>${esc(label || '項目')}</th><td>${esc(value || '—')}</td></tr>`;
    }).filter(Boolean).join('');
    if (!rows) return '';
    return `
      <section class="rep-block">
        <h3>綜合結論摘要</h3>
        <table class="rep-input">
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
  }

  function buildStepsHtml() {
    const steps = collectSteps();
    if (!steps.length) return '';
    return `
      <section class="rep-block rep-steps-wrap">
        <h3>逐步計算</h3>
        ${steps.map(s => `
          <div class="rep-step">
            <h4>${esc(s.group)}</h4>
            <pre class="rep-step-body">${esc(s.body)}</pre>
          </div>
        `).join('')}
      </section>
    `;
  }

  function buildApplicabilitySection(title, statusEl, listEl) {
    if (!statusEl || !isVisible(statusEl)) return '';
    const rows = [];
    if (listEl && isVisible(listEl)) {
      listEl.querySelectorAll('.applic-item, .k').forEach(item => {
        const label = textFrom(item.querySelector('.k, .k-label')) || textFrom(item.children[0]);
        const value = textFrom(item.querySelector('.v, .k-val')) || textFrom(item.children[1]);
        if (!label && !value) return;
        rows.push(`<tr><th>${esc(label || '項目')}</th><td>${esc(value || '—')}</td></tr>`);
      });
    }
    return `
      <section class="rep-block">
        <h3>${esc(title)}</h3>
        <div class="rep-text"><strong>${esc(textFrom(statusEl) || '—')}</strong></div>
        ${rows.length ? `<table class="rep-input"><tbody>${rows.join('')}</tbody></table>` : ''}
      </section>
    `;
  }

  function buildResultGridSection(title, card) {
    if (!card || !isVisible(card)) return '';
    const rows = Array.from(card.querySelectorAll('.result-item')).map(item => {
      const label = textFrom(item.querySelector('.label'));
      const value = textFrom(item.querySelector('.value'));
      const unit = textFrom(item.querySelector('.unit'));
      if (!label) return '';
      return `<tr><th>${esc(label)}</th><td>${esc(value || '—')}${unit ? ` <span class="unit">${esc(unit)}</span>` : ''}</td></tr>`;
    }).filter(Boolean).join('');
    if (!rows) return '';
    return `
      <section class="rep-block">
        <h3>${esc(title || titleFrom(card))}</h3>
        <table class="rep-input"><tbody>${rows}</tbody></table>
      </section>
    `;
  }

  function buildHtmlSection(title, html) {
    if (!cleanText((html || '').replace(/<[^>]+>/g, ' '))) return '';
    return `
      <section class="rep-block">
        <h3>${esc(title)}</h3>
        <div class="rep-text">${html}</div>
      </section>
    `;
  }

  function cloneSectionBody(card) {
    if (!card) return null;
    const body = card.cloneNode(true);
    body.querySelectorAll('h2, summary').forEach(el => el.remove());
    return body;
  }

  function buildFreeformCardSection(card, title) {
    const body = cloneSectionBody(card);
    if (!body) return '';
    body.querySelectorAll('table, .results-grid, #steps, .banner-status, .applic-list, .applic-grid, .k').forEach(el => el.remove());
    return buildHtmlSection(title || titleFrom(card), body.innerHTML);
  }

  function buildVisualCardSection(card, title) {
    const body = cloneSectionBody(card);
    if (!body) return '';
    if (/規範示意圖/.test(title || '')) {
      const shotTitle = textFrom(body.querySelector('#refShotTitle, .ref-panel h3:last-of-type')) || '規範圖面';
      const shot = body.querySelector('#refShot, .ref-shot');
      const shotHtml = shot ? shot.outerHTML.replace('class="ref-shot"', 'class="rep-visual-shot"') : '';
      return `
        <section class="rep-block rep-visual-compact">
          <h3>${esc(title || titleFrom(card))}</h3>
          <div class="rep-text">
            <div class="rep-visual-title">${esc(shotTitle)}</div>
            ${shotHtml}
          </div>
        </section>
      `;
    }
    return buildHtmlSection(title || titleFrom(card), body.innerHTML);
  }

  function buildStepsSectionFromCard(card, title) {
    const stepWrap = card?.querySelector('#steps') || card?.querySelector('.step')?.closest('.card, details.card');
    if (!stepWrap) return '';
    const steps = Array.from(stepWrap.querySelectorAll('.step')).map(step => {
      const group = textFrom(step.querySelector('.step-title'));
      const body = textFrom(step.querySelector('.step-body'));
      return group && body ? { group, body } : null;
    }).filter(Boolean);
    if (!steps.length) return '';
    return `
      <section class="rep-block rep-steps-wrap">
        <h3>${esc(title || titleFrom(card) || '逐步計算')}</h3>
        ${steps.map(s => `
          <div class="rep-step">
            <h4>${esc(s.group)}</h4>
            <pre class="rep-step-body">${esc(s.body)}</pre>
          </div>
        `).join('')}
      </section>
    `;
  }

  function buildWindCardSection(card) {
    if (!card || !isVisible(card)) return '';
    const title = titleFrom(card);
    if (!title) return '';
    if (title === '說明' || title === '本頁假設' || title === '區域示意與說明') return '';
    if (/規範適用檢查/.test(title)) {
      return buildApplicabilitySection(title, card.querySelector('#applicStatus, .banner-status'), card.querySelector('#applicList, #bannerKey'));
    }
    if (/逐步計算/.test(title) || card.querySelector('#steps')) {
      return buildStepsSectionFromCard(card, title);
    }
    if (card.querySelector('.ref-grid, .ref-panel, .ref-shot, .ref-svg')) {
      return buildVisualCardSection(card, title);
    }
    if (card.querySelector('table')) {
      const table = card.querySelector('table');
      return buildTableSection(title, table, null);
    }
    if (card.querySelector('.results-grid')) {
      return buildResultGridSection(title, card);
    }
    return buildFreeformCardSection(card, title);
  }

  function collectWindGenericSections() {
    const resultPanel = document.getElementById('resultPanel') || document.querySelector('.main-layout > div:last-child');
    if (!resultPanel) return [];
    return Array.from(resultPanel.children)
      .filter(node => node.matches('.card, details.card'))
      .map(card => buildWindCardSection(card))
      .filter(Boolean);
  }

  function openWindForceReport() {
    const calcResult = typeof global.calc === 'function' ? global.calc() : true;
    if (calcResult === false) {
      showWindReportIssue('輸入條件尚未通過，無法產生計算書。');
      return;
    }
    const w = openWindReportWindow();
    if (!w) return;
    clearWindReportIssue();
    const today = new Date();
    const todayStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    const proj = Object.assign({ name: '', no: '', designer: '', date: todayStr }, project());
    const title = textFrom(document.querySelector('header h1')) || '建築物耐風設計';
    const subtitle = textFrom(document.querySelector('header p'));
    const summary = collectSummary();
    const summaryCls = summary.ok === true ? 'ok' : summary.ok === false ? 'ng' : 'na';
    const mode = currentReportMode();
    const isSummaryReport = mode === 'summary';
    const inputGroups = collectInputGroups();
    const reportTrace = getCurrentReportTrace();
    if (!reportTrace) return;
    const documentStateReport = buildPageDocumentStateReport(proj);
    if (!documentStateReport) return;
    const inputsHtml = !isSummaryReport ? buildInputSectionsHtml(inputGroups) : '';
    const notesHtml = '';
    const html = `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<title>${esc(title)} 計算書</title>
<style>
@page { size: A4 portrait; margin: 18mm 14mm 18mm; }
* { box-sizing: border-box; }
body { font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", system-ui, sans-serif; color:#111; margin:0; padding:24px; background:#f4f4f4; }
.rep-paper { max-width: 980px; margin:0 auto; background:#fff; padding:32px 36px; box-shadow:0 2px 12px rgba(0,0,0,.08); }
.rep-header { border-bottom:3px double #222; padding-bottom:12px; margin-bottom:16px; }
.rep-header h1 { margin:0 0 4px; font-size:22px; }
.rep-header .sub { color:#555; font-size:13px; }
.rep-meta { display:grid; grid-template-columns:repeat(2,1fr); gap:6px 24px; font-size:12px; margin:14px 0 18px; }
.rep-meta--traceable { grid-template-columns:repeat(3,1fr); gap:6px 14px; }
.rep-meta div { border-bottom:1px dotted #888; padding:4px 0; }
.rep-meta b { display:inline-block; min-width:64px; color:#444; }
.rep-summary { margin:12px 0 20px; padding:14px 18px; border-radius:5px; font-size:18px; font-weight:700; text-align:center; }
.rep-summary.ok { background:#e8f5ec; color:#1b8a3a; border:2px solid #1b8a3a; }
.rep-summary.ng { background:#fbeaea; color:#c0392b; border:2px solid #c0392b; }
.rep-summary.na { background:#f0f0f0; color:#555; border:2px solid #888; }
.rep-block { margin:14px 0 18px; page-break-inside: avoid; }
.rep-block h3 { font-size:14px; margin:0 0 6px; padding:4px 8px; background:#1a3d5c; color:#fff; border-radius:3px 3px 0 0; }
table { width:100%; border-collapse:collapse; font-size:12px; }
.rep-input th, .rep-input td { border:1px solid #888; padding:5px 8px; vertical-align:top; }
.rep-input th { background:#eef2f6; text-align:left; width:38%; font-weight:600; }
.rep-input .val { font-weight:600; }
.rep-input .unit { color:#666; font-size:11px; margin-left:4px; }
.rep-table-wrap { overflow:hidden; }
.rep-table th, .rep-table td { border:1px solid #888; padding:5px 6px; vertical-align:top; }
.rep-table th { background:#eef2f6; font-weight:600; text-align:center; font-size:11px; }
.rep-table td { text-align:right; }
.rep-table td:first-child { text-align:left; font-weight:600; }
.rep-table td.idx { text-align:center; font-weight:700; }
.rep-text { border:1px solid #888; border-top:none; padding:10px 12px; font-size:12px; line-height:1.8; }
.rep-text strong { color:#0f3d62; }
.rep-visual-compact .rep-text { text-align:center; }
.rep-visual-title { font-weight:700; color:#0f3d62; margin-bottom:8px; text-align:left; }
.rep-visual-shot { display:block; width:100%; max-width:320px; height:auto; margin:0 auto; border:1px solid #888; border-radius:4px; }
.rep-note { margin-top:6px; font-size:11px; color:#555; line-height:1.7; }
.rep-step { margin:10px 0 14px; page-break-inside: avoid; }
.rep-step h4 { margin:0 0 4px; padding:3px 8px; font-size:12px; background:#ede9fe; color:#5b21b6; border-left:3px solid #7c3aed; }
.rep-step-body { white-space:pre-wrap; word-break:break-word; font-family:"Consolas","Cascadia Code",monospace; font-size:11px; line-height:1.55; background:#faf5ff; border:1px solid #e9d5ff; border-radius:4px; padding:8px 10px; margin:0; color:#3b0764; }
.rep-notes { padding-left:20px; font-size:12px; }
.rep-notes li { margin:3px 0; }
.rep-toolbar { max-width:980px; margin:0 auto 12px; text-align:right; }
.rep-toolbar button { background:#1a3d5c; color:#fff; border:0; padding:8px 18px; font-size:13px; border-radius:4px; cursor:pointer; margin-left:6px; }
.rep-toolbar button:hover { background:#27567c; }
.rep-window-status { display:block; margin-top:8px; color:#7c2d12; font-size:12px; line-height:1.45; min-height:18px; }
.rep-footer { position:fixed; right:14mm; bottom:8mm; font-size:10px; color:#666; text-align:right; }
@media print {
  body { background:#fff; padding:0; }
  .rep-toolbar { display:none; }
  .rep-paper { box-shadow:none; padding:0; max-width:none; }
  .rep-block h3, .rep-step h4 { break-after:avoid-page; page-break-after:avoid; }
  thead { display:table-header-group; }
  tr { break-inside:avoid-page; page-break-inside:avoid; }
  .rep-step { margin:6px 0 8px; }
  .rep-step-body { line-height:1.45; padding:6px 8px; }
  .rep-footer { position:static; width:auto; padding:0; margin-top:4mm; break-before:avoid-page; page-break-before:avoid; break-inside:avoid; }
}
</style>
</head>
<body>
${reportToolbarHtml()}
<div class="rep-paper">
  <div class="rep-header">
    <h1>${esc(title)} 計算書</h1>
    ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
  </div>
  ${documentStateReport.html}
  <div class="rep-meta rep-meta--traceable">
    <div><b>計畫名稱</b>${esc(proj.name) || '—'}</div>
    <div><b>計畫編號</b>${esc(proj.no) || '—'}</div>
    <div><b>設計人員</b>${esc(proj.designer) || '—'}</div>
    <div><b>製表日期</b>${esc(proj.date)}</div>
    <div><b>產出工具</b>${esc(reportTrace.sourceTrace.tool) || '—'}</div>
    <div><b>工具版本</b>${esc(reportTrace.sourceTrace.version) || '—'}</div>
    <div><b>輸出時間</b>${esc(reportTrace.generatedAt)}</div>
    <div><b>計算指紋</b>${esc(reportTrace.calculationFingerprint)}</div>
  </div>
  ${reportOpt('rep_summary', true) ? `<div class="rep-summary ${summaryCls}">${esc(summary.text || '—')}</div>` : ''}
  ${reportOpt('rep_summary', true) ? buildBannerKeySection() : ''}
  ${reportOpt('rep_applicability', true) ? buildNarrativeSection('適用性檢查', document.getElementById('applicability')) : ''}
  ${reportOpt('rep_combo', true) ? buildNarrativeSection('設計風力組合', document.getElementById('comboSummary')) : ''}
  ${reportOpt('rep_control', true) ? buildTableSection('採用控制表', document.getElementById('controlTable'), null) : ''}
  ${!isSummaryReport && reportOpt('rep_dir_combo', true) ? buildTableSection('雙主風向設計風力組合', document.getElementById('dirComboTable'), null) : ''}
  ${!isSummaryReport && reportOpt('rep_accel_formal', true) ? buildNarrativeSection('第四章角隅加速度', document.getElementById('accelFormalSummary')) : ''}
  ${!isSummaryReport && reportOpt('rep_accel_estimate', true) ? buildNarrativeSection('簡化推估附錄', document.getElementById('accelEstimateSummary')) : ''}
  ${!isSummaryReport && reportOpt('rep_floor_combo', true) ? buildTableSection('逐層設計風力組合', document.getElementById('comboTable'), null) : ''}
  ${!isSummaryReport && reportOpt('rep_story', true) ? buildTableSection('逐層風壓與設計風力', document.getElementById('storyTable'), null) : ''}
  ${!isSummaryReport && reportOpt('rep_case', false) ? buildNarrativeSection('MWFRS 內外壓組合', document.getElementById('caseSummary')) : ''}
  ${!isSummaryReport && reportOpt('rep_roof', false) ? buildNarrativeSection('屋面主結構壓力', document.getElementById('roofSummary')) : ''}
  ${!isSummaryReport && reportOpt('rep_lateral', false) ? buildNarrativeSection('橫風向與扭轉向設計風力', document.getElementById('lateralSummary')) : ''}
  ${!isSummaryReport && reportOpt('rep_parapet', false) ? buildNarrativeSection('MWFRS 女兒牆', document.getElementById('parapetSummary')) : ''}
  ${inputsHtml}
  ${!isSummaryReport ? buildStepsHtml() : ''}
  ${notesHtml}
  <div class="rep-footer">版權所有 弘一工程顧問有限公司</div>
</div>
${reportWindowScriptHtml()}
</body>
</html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function openWindGenericReport() {
    const calcResult = typeof global.calc === 'function' ? global.calc() : true;
    if (calcResult === false) {
      showWindReportIssue('輸入條件尚未通過，無法產生計算書。');
      return;
    }
    const w = openWindReportWindow();
    if (!w) return;
    clearWindReportIssue();
    const today = new Date();
    const todayStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    const proj = Object.assign({ name: '', no: '', designer: '', date: todayStr }, project());
    const title = textFrom(document.querySelector('header h1')) || '耐風計算書';
    const subtitle = textFrom(document.querySelector('header p'));
    const summary = collectSummary();
    const summaryCls = summary.ok === true ? 'ok' : summary.ok === false ? 'ng' : 'na';
    const mode = currentReportMode();
    const isSummaryReport = mode === 'summary';
    const inputGroups = collectInputGroups();
    const reportTrace = getCurrentReportTrace();
    if (!reportTrace) return;
    const documentStateReport = buildPageDocumentStateReport(proj);
    if (!documentStateReport) return;
    const inputsHtml = !isSummaryReport ? buildInputSectionsHtml(inputGroups) : '';
    const notesHtml = '';
    const sections = collectWindGenericSections();
    const reportSections = isSummaryReport
      ? sections.filter(section => !section.includes('rep-steps-wrap'))
      : sections;
    const hasStructuredSteps = reportSections.some(section => section.includes('rep-steps-wrap'));

    const html = `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<title>${esc(title)} 計算書</title>
<style>
@page { size: A4 portrait; margin: 18mm 14mm 18mm; }
* { box-sizing: border-box; }
body { font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", system-ui, sans-serif; color:#111; margin:0; padding:24px; background:#f4f4f4; }
.rep-paper { max-width: 980px; margin:0 auto; background:#fff; padding:32px 36px; box-shadow:0 2px 12px rgba(0,0,0,.08); }
.rep-header { border-bottom:3px double #222; padding-bottom:12px; margin-bottom:16px; }
.rep-header h1 { margin:0 0 4px; font-size:22px; }
.rep-header .sub { color:#555; font-size:13px; }
.rep-meta { display:grid; grid-template-columns:repeat(2,1fr); gap:6px 24px; font-size:12px; margin:14px 0 18px; }
.rep-meta--traceable { grid-template-columns:repeat(3,1fr); gap:6px 14px; }
.rep-meta div { border-bottom:1px dotted #888; padding:4px 0; }
.rep-meta b { display:inline-block; min-width:64px; color:#444; }
.rep-summary { margin:12px 0 20px; padding:14px 18px; border-radius:5px; font-size:18px; font-weight:700; text-align:center; }
.rep-summary.ok { background:#e8f5ec; color:#1b8a3a; border:2px solid #1b8a3a; }
.rep-summary.ng { background:#fbeaea; color:#c0392b; border:2px solid #c0392b; }
.rep-summary.na { background:#f0f0f0; color:#555; border:2px solid #888; }
.rep-block { margin:14px 0 18px; page-break-inside: avoid; }
.rep-block h3 { font-size:14px; margin:0 0 6px; padding:4px 8px; background:#1a3d5c; color:#fff; border-radius:3px 3px 0 0; }
table { width:100%; border-collapse:collapse; font-size:12px; }
.rep-input th, .rep-input td, .rep-table th, .rep-table td { border:1px solid #888; padding:5px 8px; vertical-align:top; }
.rep-input th { background:#eef2f6; text-align:left; width:38%; font-weight:600; }
.rep-table th { background:#eef2f6; text-align:center; font-weight:600; font-size:11px; }
.rep-table td { text-align:right; }
.rep-table td:first-child { text-align:left; font-weight:600; }
.rep-input .unit { color:#666; font-size:11px; margin-left:4px; }
.rep-text { border:1px solid #888; border-top:none; padding:10px 12px; font-size:12px; line-height:1.8; }
.rep-text strong { color:#0f3d62; }
.rep-visual-compact .rep-text { text-align:center; }
.rep-visual-title { font-weight:700; color:#0f3d62; margin-bottom:8px; text-align:left; }
.rep-visual-shot { display:block; width:100%; max-width:320px; height:auto; margin:0 auto; border:1px solid #888; border-radius:4px; }
.rep-note { margin-top:6px; font-size:11px; color:#555; line-height:1.7; }
.rep-step { margin:10px 0 14px; page-break-inside: avoid; }
.rep-step h4 { margin:0 0 4px; padding:3px 8px; font-size:12px; background:#ede9fe; color:#5b21b6; border-left:3px solid #7c3aed; }
.rep-step-body { white-space:pre-wrap; word-break:break-word; font-family:"Consolas","Cascadia Code",monospace; font-size:11px; line-height:1.55; background:#faf5ff; border:1px solid #e9d5ff; border-radius:4px; padding:8px 10px; margin:0; color:#3b0764; }
.rep-notes { padding-left:20px; font-size:12px; }
.rep-notes li { margin:3px 0; }
.rep-toolbar { max-width:980px; margin:0 auto 12px; text-align:right; }
.rep-toolbar button { background:#1a3d5c; color:#fff; border:0; padding:8px 18px; font-size:13px; border-radius:4px; cursor:pointer; margin-left:6px; }
.rep-toolbar button:hover { background:#27567c; }
.rep-window-status { display:block; margin-top:8px; color:#7c2d12; font-size:12px; line-height:1.45; min-height:18px; }
.rep-footer { position:fixed; right:14mm; bottom:8mm; font-size:10px; color:#666; text-align:right; }
@media print {
  body { background:#fff; padding:0; }
  .rep-toolbar { display:none; }
  .rep-paper { box-shadow:none; padding:0; max-width:none; }
  .rep-block h3, .rep-step h4 { break-after:avoid-page; page-break-after:avoid; }
  thead { display:table-header-group; }
  tr { break-inside:avoid-page; page-break-inside:avoid; }
  .rep-step { margin:6px 0 8px; }
  .rep-step-body { line-height:1.45; padding:6px 8px; }
  .rep-footer { position:static; width:auto; padding:0; margin-top:4mm; break-before:avoid-page; page-break-before:avoid; break-inside:avoid; }
}
</style>
</head>
<body>
${reportToolbarHtml()}
<div class="rep-paper">
  <div class="rep-header">
    <h1>${esc(title)} 計算書</h1>
    ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
  </div>
  ${documentStateReport.html}
  <div class="rep-meta rep-meta--traceable">
    <div><b>計畫名稱</b>${esc(proj.name) || '—'}</div>
    <div><b>計畫編號</b>${esc(proj.no) || '—'}</div>
    <div><b>設計人員</b>${esc(proj.designer) || '—'}</div>
    <div><b>製表日期</b>${esc(proj.date)}</div>
    <div><b>產出工具</b>${esc(reportTrace.sourceTrace.tool) || '—'}</div>
    <div><b>工具版本</b>${esc(reportTrace.sourceTrace.version) || '—'}</div>
    <div><b>輸出時間</b>${esc(reportTrace.generatedAt)}</div>
    <div><b>計算指紋</b>${esc(reportTrace.calculationFingerprint)}</div>
  </div>
  <div class="rep-summary ${summaryCls}">${esc(summary.text || '—')}</div>
  ${reportSections.filter(Boolean).join('')}
  ${inputsHtml}
  ${!isSummaryReport && !hasStructuredSteps ? buildStepsHtml() : ''}
  ${notesHtml}
  <div class="rep-footer">版權所有 弘一工程顧問有限公司</div>
</div>
${reportWindowScriptHtml()}
</body>
</html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function openWindReport() {
    if (document.getElementById('controlTable')) {
      openWindForceReport();
      return;
    }
    openWindGenericReport();
  }

  function bind() {
    const clearOnInput = event => {
      const target = event.target;
      if (!target) return;
      const tag = String(target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') clearWindReportIssue();
    };
    document.addEventListener('input', clearOnInput, true);
    document.addEventListener('change', clearOnInput, true);
    document.querySelectorAll('.btn-print, .mode-bar__report').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openWindReport();
      });
    });
  }

  global.WindReport = {
    openWindReport,
    bind,
    clearWindReportIssue,
    getCurrentReportTrace,
    normalizeProjectFieldValue,
    isProjectMetaMissing,
    renderStatusGridPanel
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  }
})(typeof window !== 'undefined' ? window : globalThis);
