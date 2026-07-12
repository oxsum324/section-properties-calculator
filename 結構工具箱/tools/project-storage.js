(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.ToolProjectStorage = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { api.autoBind(); });
    } else {
      api.autoBind();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.3.0';
  const REVIEW_VERSION = '1';
  const CONTROL_CLASS = 'project-storage-bar';
  const PROJECT_META_FIELD_IDS = new Set([
    'projName',
    'projNo',
    'projDesigner',
    'projectName',
    'projectNo',
    'projectDesigner',
  ]);

  function safeFileName(text) {
    return String(text || 'tool-project')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'tool-project';
  }

  function normalizeProjectFieldValue(value) {
    const text = String(value == null ? '' : value).trim();
    return text === '未填' ? '' : text;
  }

  function normalizeFieldValue(id, value) {
    if (!PROJECT_META_FIELD_IDS.has(id)) return value;
    return normalizeProjectFieldValue(value);
  }

  function fingerprintHash(text) {
    let hash = 2166136261;
    const source = String(text || '');
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  function fieldSelector(rootNode) {
    return Array.from((rootNode || document).querySelectorAll('input[id], select[id], textarea[id]'))
      .filter(function (el) {
        return el.type !== 'file' && !el.closest('.' + CONTROL_CLASS);
      });
  }

  function fieldType(el) {
    return el?.type || String(el?.tagName || '').toLowerCase();
  }

  function hasAvailableSelectValue(el, value) {
    if (!/^select-/.test(fieldType(el)) || value == null || value === '') return true;
    return Array.from(el.options || []).some(function (option) { return option.value === String(value); });
  }

  function validatePayload(payload, meta) {
    if (!payload || typeof payload !== 'object') throw new Error('JSON 格式不正確。');
    if (payload.schema !== 'tool-project-storage.v1') {
      throw new Error('此檔不是本頁專案 JSON；請使用「存檔 JSON」產生的檔案。');
    }
    if (payload.tool && payload.tool.id && payload.tool.id !== meta.id) {
      throw new Error('此 JSON 屬於 ' + payload.tool.id + '，不是本頁案例。');
    }
  }

  function describeFieldIds(label, ids) {
    if (!ids.length) return '';
    const visible = ids.slice(0, 3).join('、');
    return `${label} ${visible}${ids.length > 3 ? ` 等 ${ids.length} 項` : ''}`;
  }

  function inspectPayload(payload, meta, rootNode) {
    validatePayload(payload, meta);
    const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {};
    const currentFields = fieldSelector(rootNode);
    const currentById = new Map(currentFields.map(function (el) { return [el.id, el]; }));
    const savedIds = Object.keys(fields);
    const unknownFieldIds = savedIds.filter(function (id) { return !currentById.has(id); });
    const missingFieldIds = currentFields.map(function (el) { return el.id; }).filter(function (id) {
      return !Object.prototype.hasOwnProperty.call(fields, id);
    });
    const incompatibleFieldIds = savedIds.filter(function (id) {
      const current = currentById.get(id);
      const saved = fields[id];
      return !!current && !!saved?.type && saved.type !== fieldType(current);
    });
    const unavailableOptionFieldIds = savedIds.filter(function (id) {
      const current = currentById.get(id);
      const saved = fields[id];
      return !!current && !!saved && !incompatibleFieldIds.includes(id) && !hasAvailableSelectValue(current, saved.value);
    });
    const notices = [];
    const storageVersion = payload.storageVersion || '未標示';
    const savedToolVersion = payload.tool?.version || '';
    if (storageVersion !== VERSION) notices.push(`儲存格式 ${storageVersion}，目前 ${VERSION}，將以相容模式讀取`);
    if (savedToolVersion && meta.version && savedToolVersion !== meta.version) {
      notices.push(`工具版本 ${savedToolVersion}，目前 ${meta.version}`);
    }
    const unknownNotice = describeFieldIds('未識別欄位：', unknownFieldIds);
    const missingNotice = describeFieldIds('本頁新增欄位保留預設值：', missingFieldIds);
    const incompatibleNotice = describeFieldIds('型別不一致而不套用：', incompatibleFieldIds);
    const unavailableOptionNotice = describeFieldIds('已不存在的選項而保留本頁值：', unavailableOptionFieldIds);
    [unknownNotice, missingNotice, incompatibleNotice, unavailableOptionNotice].filter(Boolean).forEach(function (notice) { notices.push(notice); });
    return {
      storageVersion,
      savedToolVersion,
      unknownFieldIds,
      missingFieldIds,
      incompatibleFieldIds,
      unavailableOptionFieldIds,
      notices,
      compatible: incompatibleFieldIds.length === 0 && unavailableOptionFieldIds.length === 0,
    };
  }

  function collectFields(rootNode) {
    const fields = {};
    fieldSelector(rootNode).forEach(function (el) {
      fields[el.id] = el.type === 'checkbox' || el.type === 'radio'
        ? { type: el.type, checked: !!el.checked, value: el.value }
        : { type: el.type || el.tagName.toLowerCase(), value: normalizeFieldValue(el.id, el.value) };
    });
    return fields;
  }

  function buildReviewSnapshotFromFields(fields) {
    const normalized = Object.keys(fields || {}).sort().map(function (id) {
      const item = fields[id] || {};
      return [
        id,
        String(item.type || ''),
        item.type === 'checkbox' || item.type === 'radio' ? !!item.checked : normalizeFieldValue(id, item.value)
      ];
    });
    return 'RS-' + fingerprintHash(JSON.stringify(normalized));
  }

  function buildReviewSnapshot(rootNode) {
    return buildReviewSnapshotFromFields(collectFields(rootNode));
  }

  function evaluateReviewRecord(review, snapshot) {
    if (!review || typeof review !== 'object') return null;
    const reviewer = String(review.reviewer || '').trim();
    const reviewedAt = String(review.reviewedAt || '').trim();
    const reviewedSnapshot = String(review.reviewedSnapshot || '').trim();
    if (!reviewer || !reviewedAt || !reviewedSnapshot) return null;
    return {
      reviewVersion: REVIEW_VERSION,
      status: reviewedSnapshot === snapshot ? 'confirmed' : 'stale',
      reviewer,
      reviewedAt,
      reviewedSnapshot,
      scope: '本頁案件資料與計算輸入'
    };
  }

  function applyFields(fields, rootNode) {
    const appliedFieldIds = [];
    const skippedFieldIds = [];
    const unavailableOptionFieldIds = [];
    Object.keys(fields || {}).forEach(function (id) {
      const el = (rootNode || document).getElementById(id);
      const item = fields[id];
      if (!el || !item || el.type === 'file') return;
      if (item.type && item.type !== fieldType(el)) {
        skippedFieldIds.push(id);
        return;
      }
      if (!hasAvailableSelectValue(el, item.value)) {
        skippedFieldIds.push(id);
        unavailableOptionFieldIds.push(id);
        return;
      }
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = !!item.checked;
      } else {
        el.value = normalizeFieldValue(id, item.value);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      appliedFieldIds.push(id);
    });
    return { appliedFieldIds, skippedFieldIds, unavailableOptionFieldIds };
  }

  function getToolMeta(scriptEl) {
    const title = document.title || 'tool-project';
    const fallbackId = safeFileName(title).toLowerCase();
    return {
      id: scriptEl?.dataset.toolId || fallbackId,
      name: scriptEl?.dataset.toolName || title,
      version: scriptEl?.dataset.toolVersion || '',
    };
  }

  function storageKey(meta) {
    return 'toolProjectStorage:' + meta.id + ':draft.v1';
  }

  function reviewStorageKey(meta) {
    return 'toolProjectStorage:' + meta.id + ':review.v1';
  }

  function buildPayload(meta, rootNode, review) {
    return {
      schema: 'tool-project-storage.v1',
      storageVersion: VERSION,
      tool: meta,
      savedAt: new Date().toISOString(),
      fields: collectFields(rootNode),
      review: review || null,
    };
  }

  function downloadJson(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function setStatus(bar, message, tone) {
    const status = bar.querySelector('[data-project-storage-status]');
    if (!status) return;
    status.textContent = message || '';
    status.dataset.tone = tone || 'ok';
  }

  function refreshPage() {
    const candidates = ['runCheck', 'calc', 'calculate', 'compute', 'renderSummaryFromFields', 'renderSummary', 'loadOverview'];
    for (const name of candidates) {
      if (typeof window[name] === 'function') {
        try {
          window[name]();
          return;
        } catch (err) {
          continue;
        }
      }
    }
  }

  function formatReviewTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    return date.toLocaleString('zh-TW', { hour12: false });
  }

  function createReviewControl(meta, bar) {
    const panel = bar.querySelector('[data-project-review]');
    const reviewerInput = bar.querySelector('[data-project-reviewer]');
    const stateText = bar.querySelector('[data-project-review-state]');
    let storedReview = null;

    function persist() {
      try {
        if (storedReview) {
          localStorage.setItem(reviewStorageKey(meta), JSON.stringify(storedReview));
        } else {
          localStorage.removeItem(reviewStorageKey(meta));
        }
      } catch (err) {
        // The current page remains usable when browser storage is unavailable.
      }
    }

    function currentState() {
      return evaluateReviewRecord(storedReview, buildReviewSnapshot());
    }

    function render() {
      const review = currentState();
      if (review?.reviewer && !reviewerInput.value.trim()) reviewerInput.value = review.reviewer;
      if (!review) {
        panel.dataset.state = 'pending';
        stateText.textContent = '尚未確認；複核後會記錄複核人與時間。';
        return;
      }
      if (review.status === 'confirmed') {
        panel.dataset.state = 'confirmed';
        stateText.textContent = `已由 ${review.reviewer} 於 ${formatReviewTime(review.reviewedAt)} 完成人工作業複核。`;
        return;
      }
      panel.dataset.state = 'stale';
      stateText.textContent = `本頁案件資料或計算輸入已變更；原複核人 ${review.reviewer} 需重新確認。`;
    }

    function setFromPayload(review) {
      storedReview = review && typeof review === 'object' ? review : null;
      persist();
      render();
      return currentState();
    }

    try {
      const raw = localStorage.getItem(reviewStorageKey(meta));
      storedReview = raw ? JSON.parse(raw) : null;
    } catch (err) {
      storedReview = null;
    }

    bar.querySelector('[data-project-review-confirm]').addEventListener('click', function () {
      const reviewer = reviewerInput.value.trim();
      if (!reviewer) {
        setStatus(bar, '請填入複核人後再確認。', 'error');
        reviewerInput.focus();
        return;
      }
      storedReview = {
        reviewVersion: REVIEW_VERSION,
        status: 'confirmed',
        reviewer,
        reviewedAt: new Date().toISOString(),
        reviewedSnapshot: buildReviewSnapshot(),
        scope: '本頁案件資料與計算輸入'
      };
      persist();
      render();
      setStatus(bar, '已記錄人工作業複核；案件資料或計算輸入變更時會要求重新確認。', 'ok');
    });
    bar.querySelector('[data-project-review-clear]').addEventListener('click', function () {
      storedReview = null;
      persist();
      render();
      setStatus(bar, '已清除人工作業複核記錄。', 'warn');
    });
    fieldSelector().forEach(function (field) {
      field.addEventListener('input', render);
      field.addEventListener('change', render);
    });
    render();
    return {
      getState: currentState,
      setFromPayload,
      render,
    };
  }

  function applyPayload(payload, meta, bar, label, compatibility, reviewControl) {
    const review = compatibility || inspectPayload(payload, meta);
    const result = applyFields(payload.fields || {});
    refreshPage();
    reviewControl?.setFromPayload(payload.review);
    const details = review.notices.concat(
      result.skippedFieldIds.length ? [describeFieldIds('未套用欄位：', result.skippedFieldIds)] : []
    ).filter(Boolean);
    setStatus(
      bar,
      `已讀取：${label || '案例檔'}；已套用 ${result.appliedFieldIds.length} 項${details.length ? `；${details.join('；')}` : ''}。`,
      details.length ? 'warn' : 'ok'
    );
    return { compatibility: review, result };
  }

  function createBar(meta) {
    const bar = document.createElement('div');
    bar.className = CONTROL_CLASS;
    bar.innerHTML = [
      '<button type="button" data-project-storage-save>存檔 JSON</button>',
      '<button type="button" data-project-storage-load>讀取 JSON</button>',
      '<button type="button" data-project-storage-draft-save>暫存</button>',
      '<button type="button" data-project-storage-draft-load>讀取暫存</button>',
      '<input type="file" accept=".json,application/json" data-project-storage-file hidden>',
      '<div class="project-storage-preview" data-project-storage-preview hidden><span data-project-storage-preview-text aria-live="polite"></span><button type="button" data-project-storage-apply>套用讀檔內容</button><button type="button" data-project-storage-cancel>取消</button></div>',
      '<div class="project-review" data-project-review data-state="pending"><strong>人工作業複核</strong><span>頁面專用，不會寫入計算書、列印或 PDF。</span><label>複核人 <input type="text" data-project-reviewer autocomplete="name"></label><button type="button" data-project-review-confirm>確認已複核</button><button type="button" data-project-review-clear>清除複核</button><span data-project-review-state aria-live="polite"></span></div>',
      '<span class="project-storage-status" data-project-storage-status aria-live="polite"></span>'
    ].join('');
    const style = document.createElement('style');
    style.textContent = [
      '.' + CONTROL_CLASS + '{max-width:1200px;margin:12px auto 0;padding:10px 14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#f8fafc;border:1px solid #dbe4ef;border-radius:8px;}',
      '.' + CONTROL_CLASS + ' button{border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;background:#e2e8f0;color:#0f172a;}',
      '.' + CONTROL_CLASS + ' button:hover{filter:brightness(.96);}',
      '.' + CONTROL_CLASS + ' .project-storage-status{font-size:.84em;color:#166534;line-height:1.5;}',
      '.' + CONTROL_CLASS + ' .project-storage-status[data-tone="warn"]{color:#92400e;}',
      '.' + CONTROL_CLASS + ' .project-storage-status[data-tone="error"]{color:#991b1b;}',
      '.' + CONTROL_CLASS + ' .project-storage-preview{width:100%;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 10px;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;font-size:.84em;line-height:1.5;}',
      '.' + CONTROL_CLASS + ' .project-storage-preview[hidden]{display:none!important;}',
      '.' + CONTROL_CLASS + ' .project-storage-preview button{padding:6px 9px;background:#fff;}',
      '.' + CONTROL_CLASS + ' .project-review{width:100%;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 10px;border-left:3px solid #d97706;background:#fffbeb;color:#78350f;font-size:.84em;line-height:1.5;}',
      '.' + CONTROL_CLASS + ' .project-review[data-state="confirmed"]{border-left-color:#059669;background:#f0fdf4;color:#166534;}',
      '.' + CONTROL_CLASS + ' .project-review[data-state="stale"]{border-left-color:#dc2626;background:#fef2f2;color:#991b1b;}',
      '.' + CONTROL_CLASS + ' .project-review strong{font-size:.94em;}',
      '.' + CONTROL_CLASS + ' .project-review label{display:flex;align-items:center;gap:5px;font-weight:700;}',
      '.' + CONTROL_CLASS + ' .project-review input{width:132px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;color:#0f172a;}',
      '.' + CONTROL_CLASS + ' .project-review [data-project-review-state]{flex:1 1 260px;font-weight:700;}',
      '@media print{.' + CONTROL_CLASS + '{display:none!important;}}'
    ].join('');
    document.head.appendChild(style);
    const file = bar.querySelector('[data-project-storage-file]');
    const preview = bar.querySelector('[data-project-storage-preview]');
    const previewText = bar.querySelector('[data-project-storage-preview-text]');
    const reviewControl = createReviewControl(meta, bar);
    let pendingLoad = null;

    function clearPreview() {
      pendingLoad = null;
      preview.hidden = true;
      previewText.textContent = '';
    }

    function queuePayloadPreview(payload, label) {
      const compatibility = inspectPayload(payload, meta);
      pendingLoad = { payload, label, compatibility };
      const notices = compatibility.notices.length ? compatibility.notices.join('；') : '欄位與版本相容，可套用。';
      previewText.textContent = `準備讀取「${label || '案例檔'}」：${notices}`;
      preview.hidden = false;
      setStatus(bar, '已建立讀檔預覽，請確認後套用。', 'warn');
    }
    bar.querySelector('[data-project-storage-save]').addEventListener('click', function () {
      try {
        const payload = buildPayload(meta, undefined, reviewControl.getState());
        downloadJson(safeFileName(meta.id) + '-project-' + payload.savedAt.slice(0, 10) + '.json', payload);
        setStatus(bar, '已存檔 JSON；可用「讀取 JSON」回復目前案例。', 'ok');
      } catch (err) {
        setStatus(bar, '存檔失敗：' + (err.message || err), 'error');
      }
    });
    bar.querySelector('[data-project-storage-load]').addEventListener('click', function () { file.click(); });
    file.addEventListener('change', async function () {
      const selected = file.files && file.files[0];
      if (!selected) return;
      try {
        queuePayloadPreview(JSON.parse(await selected.text()), selected.name);
      } catch (err) {
        setStatus(bar, '讀檔失敗：' + (err.message || err), 'error');
      } finally {
        file.value = '';
      }
    });
    bar.querySelector('[data-project-storage-apply]').addEventListener('click', function () {
      if (!pendingLoad) return;
      try {
        applyPayload(pendingLoad.payload, meta, bar, pendingLoad.label, pendingLoad.compatibility, reviewControl);
        clearPreview();
      } catch (err) {
        setStatus(bar, '讀檔失敗：' + (err.message || err), 'error');
      }
    });
    bar.querySelector('[data-project-storage-cancel]').addEventListener('click', function () {
      clearPreview();
      setStatus(bar, '已取消讀檔，畫面資料未變更。', 'warn');
    });
    bar.querySelector('[data-project-storage-draft-save]').addEventListener('click', function () {
      try {
        localStorage.setItem(storageKey(meta), JSON.stringify(buildPayload(meta, undefined, reviewControl.getState())));
        setStatus(bar, '已暫存目前案例到此瀏覽器。', 'ok');
      } catch (err) {
        setStatus(bar, '暫存失敗：' + (err.message || err), 'error');
      }
    });
    bar.querySelector('[data-project-storage-draft-load]').addEventListener('click', function () {
      try {
        const raw = localStorage.getItem(storageKey(meta));
        if (!raw) {
          setStatus(bar, '尚無可讀取的瀏覽器暫存。', 'warn');
          return;
        }
        queuePayloadPreview(JSON.parse(raw), '瀏覽器暫存');
      } catch (err) {
        setStatus(bar, '讀取暫存失敗：' + (err.message || err), 'error');
      }
    });
    return bar;
  }

  function autoBind() {
    if (document.querySelector('.' + CONTROL_CLASS)) return null;
    const scriptEl = document.currentScript || Array.from(document.scripts).find(function (script) {
      return /project-storage\.js(?:\?|$)/.test(script.src || '');
    });
    const meta = getToolMeta(scriptEl);
    const bar = createBar(meta);
    const target = document.querySelector('.mode-bar') || document.querySelector('header') || document.body.firstElementChild;
    if (target && target.parentNode) {
      target.insertAdjacentElement(target.matches('header') ? 'afterend' : 'afterend', bar);
    } else {
      document.body.insertBefore(bar, document.body.firstChild);
    }
    return bar;
  }

  return {
    version: VERSION,
    safeFileName,
    normalizeProjectFieldValue,
    inspectPayload,
    collectFields,
    applyFields,
    buildReviewSnapshotFromFields,
    buildReviewSnapshot,
    evaluateReviewRecord,
    buildPayload,
    autoBind,
  };
});
