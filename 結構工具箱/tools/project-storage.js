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

  const VERSION = '0.2.0';
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

  function fieldSelector(rootNode) {
    return Array.from((rootNode || document).querySelectorAll('input[id], select[id], textarea[id]'))
      .filter(function (el) {
        return el.type !== 'file' && !el.closest('.' + CONTROL_CLASS);
      });
  }

  function fieldType(el) {
    return el?.type || String(el?.tagName || '').toLowerCase();
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
    [unknownNotice, missingNotice, incompatibleNotice].filter(Boolean).forEach(function (notice) { notices.push(notice); });
    return {
      storageVersion,
      savedToolVersion,
      unknownFieldIds,
      missingFieldIds,
      incompatibleFieldIds,
      notices,
      compatible: incompatibleFieldIds.length === 0,
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

  function applyFields(fields, rootNode) {
    const appliedFieldIds = [];
    const skippedFieldIds = [];
    Object.keys(fields || {}).forEach(function (id) {
      const el = (rootNode || document).getElementById(id);
      const item = fields[id];
      if (!el || !item || el.type === 'file') return;
      if (item.type && item.type !== fieldType(el)) {
        skippedFieldIds.push(id);
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
    return { appliedFieldIds, skippedFieldIds };
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

  function buildPayload(meta, rootNode) {
    return {
      schema: 'tool-project-storage.v1',
      storageVersion: VERSION,
      tool: meta,
      savedAt: new Date().toISOString(),
      fields: collectFields(rootNode),
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

  function applyPayload(payload, meta, bar, label, compatibility) {
    const review = compatibility || inspectPayload(payload, meta);
    const result = applyFields(payload.fields || {});
    refreshPage();
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
      '@media print{.' + CONTROL_CLASS + '{display:none!important;}}'
    ].join('');
    document.head.appendChild(style);
    const file = bar.querySelector('[data-project-storage-file]');
    const preview = bar.querySelector('[data-project-storage-preview]');
    const previewText = bar.querySelector('[data-project-storage-preview-text]');
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
        const payload = buildPayload(meta);
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
        applyPayload(pendingLoad.payload, meta, bar, pendingLoad.label, pendingLoad.compatibility);
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
        localStorage.setItem(storageKey(meta), JSON.stringify(buildPayload(meta)));
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
    buildPayload,
    autoBind,
  };
});
