(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RCProjectStorage = Object.assign(root.RCProjectStorage || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DEFAULT_PROJECT_FIELD_IDS = Object.freeze(['projName', 'projNo', 'projDesigner']);
  const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;

  function defaultNormalizeProjectFieldValue(value) {
    const text = String(value ?? '').trim();
    return text === '未填' ? '' : text;
  }

  function utf8ByteLength(value) {
    const text = String(value ?? '');
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  function safeFilenamePart(value, fallback = '專案') {
    const normalized = String(value || fallback)
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
    return normalized || fallback;
  }

  function filenameTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) throw new Error('專案檔時間戳無效。');
    return date.toISOString().slice(0, 19).replace(/[-:T]/g, '');
  }

  function createManager(options = {}) {
    const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null);
    const excludedIds = new Set(options.excludedIds || []);
    const projectFieldIds = new Set(options.projectFieldIds || DEFAULT_PROJECT_FIELD_IDS);
    const normalizeProjectFieldValue = options.normalizeProjectFieldValue || defaultNormalizeProjectFieldValue;
    const storageKey = String(options.storageKey || '');
    const fallbackBase = String(options.fallbackBase || '專案');
    const maxFileBytes = Number(options.maxFileBytes) > 0 ? Number(options.maxFileBytes) : DEFAULT_MAX_FILE_BYTES;
    const now = typeof options.now === 'function' ? options.now : () => new Date();

    function getElement(id) {
      if (typeof options.getElement === 'function') return options.getElement(id);
      return documentRef?.getElementById?.(id) || null;
    }

    function getStorage() {
      if (options.storage) return options.storage;
      if (typeof localStorage !== 'undefined') return localStorage;
      throw new Error('此環境沒有可用的瀏覽器暫存。');
    }

    function controls() {
      if (!documentRef?.querySelectorAll) return [];
      return Array.from(documentRef.querySelectorAll('input[id], select[id], textarea[id]')).filter((element) => {
        if (!element?.id || excludedIds.has(element.id)) return false;
        return String(element.type || '').toLowerCase() !== 'file';
      });
    }

    function readControl(element) {
      if (!element) return null;
      const type = String(element.type || '').toLowerCase();
      if (type === 'checkbox') return { kind: 'checkbox', checked: !!element.checked };
      return {
        kind: String(element.tagName || 'input').toLowerCase(),
        inputType: type,
        value: projectFieldIds.has(element.id)
          ? normalizeProjectFieldValue(element.value)
          : element.value,
      };
    }

    function collectFields() {
      const fields = {};
      controls().forEach((element) => { fields[element.id] = readControl(element); });
      return fields;
    }

    function dispatchControlEvent(element, type) {
      if (!element?.dispatchEvent) return;
      const EventCtor = options.EventCtor || (typeof Event === 'function' ? Event : null);
      element.dispatchEvent(EventCtor ? new EventCtor(type, { bubbles: true }) : { type, bubbles: true });
    }

    function setControl(id, saved) {
      const element = getElement(id);
      if (!element || String(element.type || '').toLowerCase() === 'file') return false;
      const type = String(element.type || '').toLowerCase();
      if (type === 'checkbox') {
        element.checked = !!(saved && typeof saved === 'object' && 'checked' in saved ? saved.checked : saved);
      } else {
        const value = saved && typeof saved === 'object' && 'value' in saved ? saved.value : saved;
        if (String(element.tagName || '').toUpperCase() === 'SELECT') {
          const exists = Array.from(element.options || []).some(option => String(option.value) === String(value));
          if (!exists) return false;
        }
        element.value = projectFieldIds.has(id)
          ? normalizeProjectFieldValue(value)
          : (value == null ? '' : String(value));
      }
      dispatchControlEvent(element, 'input');
      dispatchControlEvent(element, 'change');
      return true;
    }

    function applyFields(fields) {
      let applied = 0;
      Object.entries(fields && typeof fields === 'object' ? fields : {}).forEach(([id, saved]) => {
        if (setControl(id, saved)) applied += 1;
      });
      return applied;
    }

    function projectDisplayName(payload) {
      const metadata = payload?.metadata || {};
      return normalizeProjectFieldValue(metadata.projectName)
        || normalizeProjectFieldValue(metadata.projectNo)
        || '未命名專案';
    }

    function buildFilename(payload, overrideFallback) {
      const metadata = payload?.metadata || {};
      const base = [metadata.projectNo, metadata.projectName]
        .map(normalizeProjectFieldValue)
        .filter(Boolean)
        .join('_') || overrideFallback || fallbackBase;
      return `${safeFilenamePart(base, overrideFallback || fallbackBase)}_${filenameTimestamp(now())}.json`;
    }

    function downloadJson(payload, overrideFallback) {
      if (!documentRef?.createElement) throw new Error('此環境無法建立專案檔下載。');
      const BlobCtor = options.BlobCtor || (typeof Blob === 'function' ? Blob : null);
      const urlApi = options.urlApi || (typeof URL !== 'undefined' ? URL : null);
      if (!BlobCtor || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL) throw new Error('此環境不支援專案檔下載。');
      const filename = buildFilename(payload, overrideFallback);
      const blob = new BlobCtor([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = urlApi.createObjectURL(blob);
      const anchor = documentRef.createElement('a');
      try {
        anchor.href = url;
        anchor.download = filename;
        documentRef.body?.appendChild?.(anchor);
        anchor.click();
      } finally {
        anchor.remove?.();
        urlApi.revokeObjectURL(url);
      }
      return filename;
    }

    async function readProjectFile(file) {
      if (!file) return null;
      if (Number.isFinite(Number(file.size)) && Number(file.size) > maxFileBytes) {
        throw new Error(`專案 JSON 超過 ${Math.round(maxFileBytes / 1024)} KiB 上限。`);
      }
      if (typeof file.text !== 'function') throw new Error('無法讀取專案 JSON。');
      const text = await file.text();
      if (utf8ByteLength(text) > maxFileBytes) {
        throw new Error(`專案 JSON 超過 ${Math.round(maxFileBytes / 1024)} KiB 上限。`);
      }
      return text;
    }

    function writeDraft(payload) {
      if (!storageKey) throw new Error('未設定瀏覽器暫存識別。');
      getStorage().setItem(storageKey, JSON.stringify(payload));
      return payload;
    }

    function readDraft() {
      if (!storageKey) throw new Error('未設定瀏覽器暫存識別。');
      return getStorage().getItem(storageKey);
    }

    return Object.freeze({
      controls,
      readControl,
      collectFields,
      setControl,
      applyFields,
      projectDisplayName,
      buildFilename,
      downloadJson,
      readProjectFile,
      writeDraft,
      readDraft,
    });
  }

  return Object.freeze({
    DEFAULT_MAX_FILE_BYTES,
    DEFAULT_PROJECT_FIELD_IDS,
    defaultNormalizeProjectFieldValue,
    safeFilenamePart,
    filenameTimestamp,
    utf8ByteLength,
    createManager,
  });
});
