/* 鋼筋混凝土工具箱 — RC 相容層 (v4)
 *
 * 材料常數、鋼筋表、Ec 公式的單一來源已移至：
 *   結構工具箱/core/materials/concrete.js  → window.Concrete
 *   結構工具箱/core/materials/rebar.js     → window.Rebar
 *
 * 本檔將 core 模組內容同步到 window，避免與 core 腳本內既有 const 名稱重複宣告。
 * 使既有 RC 工具 (beam/column/slab/wall/foundation) 仍可直接以 PHI、REBAR_TABLE、calcBeta1... 存取。
 * 同時保留 RC 專用的 fmt() 與 makeResult()。
 */

// === 從 core/materials/concrete.js / rebar.js 同步到 window ===
window.PHI           = window.PHI           || window.Concrete?.PHI           || {};
window.FC_OPTIONS    = window.FC_OPTIONS    || window.Concrete?.FC_OPTIONS    || [210, 245, 280, 350, 420, 490, 560];
window.LAMBDA_NORMAL = window.LAMBDA_NORMAL || window.Concrete?.LAMBDA_NORMAL || 1.0;
window.calcBeta1     = window.calcBeta1     || window.Concrete?.calcBeta1     || (fc => 0.85);
window.calcEc        = window.calcEc        || window.Concrete?.calcEc        || (fc => 12000 * Math.sqrt(fc));

window.REBAR_TABLE   = window.REBAR_TABLE   || window.Rebar?.REBAR_TABLE || {};
window.FY_OPTIONS    = window.FY_OPTIONS    || window.Rebar?.FY_OPTIONS  || [2800, 4200, 5600];
window.ES            = window.ES            || window.Rebar?.ES          || 2.04e6;

// === RC 專用工具函式 (全域) ===
function fmt(v, digits = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return Number(v).toFixed(digits);
}

function makeResult(label, value, unit, status) {
  const cls = status ? ` ${status}` : '';
  return `<div class="result-item${cls}">
    <span class="label">${label}</span>
    <span><span class="value">${value}</span><span class="unit">${unit || ''}</span></span>
  </div>`;
}

window.RCUI = window.RCUI || {};

window.RCUI.escapeHtml = window.RCUI.escapeHtml || function(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.RCUI.normalizeProjectFieldValue = window.RCUI.normalizeProjectFieldValue || function(value) {
  const text = String(value ?? '').trim();
  return text === '未填' ? '' : text;
};

window.RCUI.getStepsVerbosity = function(defaultMode = 'full') {
  return document.getElementById('stepsVerbosity')?.value || defaultMode;
};

window.RCUI.summarizeStepText = function(text) {
  return String(text || '')
    .split('\n')
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      return t.startsWith('【')
        || t.includes('檢核')
        || t.includes('→')
        || t.startsWith('φVn')
        || t.startsWith('φMn')
        || t.startsWith('Mcr')
        || t.startsWith('Δa')
        || t.startsWith('Tu');
    })
    .join('\n');
};

window.RCUI.renderWarningList = function(cardId, listId, warnings) {
  const card = document.getElementById(cardId);
  const list = document.getElementById(listId);
  if (!card || !list) return;
  if (!warnings || !warnings.length) {
    card.style.display = '';
    list.textContent = '目前沒有特殊警示。';
    return;
  }
  card.style.display = '';
  list.innerHTML = warnings
    .map((msg, idx) => `<div style="margin:6px 0; color:#92400e;">${idx + 1}. ${msg}</div>`)
    .join('');
};

window.RCUI.buildReviewCheckGroup = function(entries, options = {}) {
  const source = Array.isArray(entries) ? entries : [];
  const normalized = source
    .map(entry => typeof entry === 'string' ? { sub: entry } : (entry || null))
    .filter(entry => {
      if (!entry) return false;
      const text = entry.sub ?? entry.text ?? entry.detail ?? entry.value ?? entry.label;
      return String(text ?? '').trim().length > 0;
    });
  if (!normalized.length) return null;
  const defined = (value, fallback) => value === undefined ? fallback : value;
  const labelPrefix = options.labelPrefix || '待確認事項';
  const formula = options.formula || '不列為 OK 結論';
  const value = defined(options.value, '待確認');
  const unit = defined(options.unit, '');
  return {
    group: options.group || '待確認事項',
    items: normalized.map((entry, index) => ({
      label: entry.label || `${labelPrefix} ${index + 1}`,
      formula: defined(entry.formula, formula),
      sub: defined(entry.sub, entry.text || entry.detail || ''),
      value: defined(entry.value, value),
      unit: defined(entry.unit, unit),
      ok: defined(entry.ok, null),
      note: entry.note
    }))
  };
};

window.RCUI.getAttachmentReadinessPriority = function(state = {}, itemsInput, notesInput) {
  const statusTone = {
    ready: 'ok',
    review: 'warn',
    estimate: 'warn',
    blocked: 'fail',
    neutral: 'neutral'
  };
  const toneClass = value => ['ok', 'warn', 'fail', 'neutral'].includes(value) ? value : 'neutral';
  const status = statusTone[state.status] ? state.status : 'neutral';
  const items = Array.isArray(itemsInput ?? state.items) ? (itemsInput ?? state.items).filter(Boolean) : [];
  const notes = Array.isArray(notesInput ?? state.notes)
    ? (notesInput ?? state.notes).map(note => String(note || '').trim()).filter(Boolean)
    : [];
  const explicit = state.priority || state.priorityAction;
  if (explicit) {
    if (typeof explicit === 'string') {
      return { label: '優先閱讀', value: explicit, tone: statusTone[status] || 'neutral' };
    }
    const value = String(explicit.value || explicit.text || '').trim();
    if (value) {
      return {
        label: explicit.label || '優先閱讀',
        value,
        tone: toneClass(explicit.tone || statusTone[status])
      };
    }
  }
  const cleanPriorityNote = note => String(note || '')
    .replace(/^(優先處理|需人工確認|需確認)[：:]\s*/u, '')
    .trim();
  const noteByPrefix = prefixes => notes.find(note => prefixes.some(prefix => note.startsWith(prefix)));
  const priorityNote = noteByPrefix(['優先處理：', '優先處理:']);
  const reviewNote = noteByPrefix(['需人工確認：', '需人工確認:', '需確認：', '需確認:']);
  const nonZero = value => !/^(0\s*項|無|0)$/u.test(String(value || '').trim());
  const preferredItem = tone => {
    const candidates = items.filter(item => toneClass(item.tone) === tone && nonZero(item.value));
    if (!candidates.length) return null;
    return candidates.find(item => /^(阻擋|不符|人工複核|正式分析|人工)/u.test(String(item.label || ''))) || candidates[0];
  };
  if (status === 'blocked') {
    if (priorityNote) {
      return { label: '優先閱讀', value: `先處理：${cleanPriorityNote(priorityNote)}`, tone: 'fail', sourceNote: priorityNote };
    }
    const failItem = preferredItem('fail');
    if (failItem) {
      return { label: '優先閱讀', value: `先看「${failItem.label}」：${failItem.value}`, tone: 'fail' };
    }
  }
  if (status === 'review' || status === 'estimate') {
    if (reviewNote) {
      return { label: '優先閱讀', value: `先確認：${cleanPriorityNote(reviewNote)}`, tone: 'warn', sourceNote: reviewNote };
    }
    const warnItem = preferredItem('warn');
    if (warnItem) {
      return { label: '優先閱讀', value: `先看「${warnItem.label}」：${warnItem.value}`, tone: 'warn' };
    }
  }
  if (status === 'ready') {
    return { label: '優先閱讀', value: '先確認輸出邊界，再產出公司計算附件。', tone: 'ok' };
  }
  return null;
};

window.RCUI.renderAttachmentReadiness = function(targetId, state = {}) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const escape = window.RCUI.escapeHtml;
  const statusTone = {
    ready: 'ok',
    review: 'warn',
    estimate: 'warn',
    blocked: 'fail',
    neutral: 'neutral'
  };
  const statusLabel = {
    ready: '可作附件',
    review: '可作附件，需人工複核',
    estimate: '僅供初估，不建議直接作附件',
    blocked: '暫勿作附件',
    neutral: '尚未計算'
  };
  const status = statusTone[state.status] ? state.status : 'neutral';
  const tone = statusTone[status];
  const label = state.label || statusLabel[status];
  const summary = state.summary || '輸入後自動更新附件適用狀態。';
  const items = Array.isArray(state.items) ? state.items.filter(Boolean) : [];
  const notes = Array.isArray(state.notes)
    ? state.notes.map(note => String(note || '').trim()).filter(Boolean)
    : [];
  const toneClass = value => ['ok', 'warn', 'fail', 'neutral'].includes(value) ? value : 'neutral';
  const priority = window.RCUI.getAttachmentReadinessPriority(state, items, notes);
  const renderNotes = priority?.sourceNote
    ? notes.filter(note => note !== priority.sourceNote)
    : notes;

  target.dataset.attachmentStatus = status;
  target.innerHTML = `
    <div class="report-readiness-summary ${tone}">
      <span class="report-readiness-badge ${tone}">${escape(label)}</span>
      <span>${escape(summary)}</span>
    </div>
    ${priority ? `<div class="report-readiness-priority ${toneClass(priority.tone)}" data-readiness-priority="${toneClass(priority.tone)}">
      <span class="label">${escape(priority.label)}</span>
      <span class="value">${escape(priority.value)}</span>
    </div>` : ''}
    ${items.length ? `<div class="report-readiness-list">
      ${items.map(item => `<div class="report-readiness-item ${toneClass(item.tone)}">
        <span class="label">${escape(item.label)}</span>
        <span class="value">${escape(item.value)}</span>
      </div>`).join('')}
    </div>` : ''}
    ${renderNotes.length ? `<ul class="report-readiness-notes">
      ${renderNotes.map(note => `<li>${escape(note)}</li>`).join('')}
    </ul>` : ''}
  `;
};
