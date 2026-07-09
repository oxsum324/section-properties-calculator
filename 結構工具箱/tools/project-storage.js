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

  const VERSION = '0.1.0';
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
    Object.keys(fields || {}).forEach(function (id) {
      const el = (rootNode || document).getElementById(id);
      const item = fields[id];
      if (!el || !item || el.type === 'file') return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = !!item.checked;
      } else {
        el.value = normalizeFieldValue(id, item.value);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
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

  function applyPayload(payload, meta, bar, label) {
    if (!payload || typeof payload !== 'object') throw new Error('JSON 格式不正確。');
    if (payload.schema !== 'tool-project-storage.v1') {
      throw new Error('此檔不是本頁專案 JSON；請使用「存檔 JSON」產生的檔案。');
    }
    if (payload.tool && payload.tool.id && payload.tool.id !== meta.id) {
      throw new Error('此 JSON 屬於 ' + payload.tool.id + '，不是本頁案例。');
    }
    applyFields(payload.fields || {});
    refreshPage();
    setStatus(bar, '已讀取：' + (label || '案例檔') + '。', 'ok');
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
      '@media print{.' + CONTROL_CLASS + '{display:none!important;}}'
    ].join('');
    document.head.appendChild(style);
    const file = bar.querySelector('[data-project-storage-file]');
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
        applyPayload(JSON.parse(await selected.text()), meta, bar, selected.name);
      } catch (err) {
        setStatus(bar, '讀檔失敗：' + (err.message || err), 'error');
      } finally {
        file.value = '';
      }
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
        applyPayload(JSON.parse(raw), meta, bar, '瀏覽器暫存');
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
    collectFields,
    applyFields,
    buildPayload,
    autoBind,
  };
});
