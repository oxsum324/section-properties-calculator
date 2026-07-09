(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LocalQuickExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function jsonReplacer(key, value) {
    return typeof value === 'number' && !Number.isFinite(value) ? String(value) : value;
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }

  function cleanText(text) {
    return String(text == null ? '' : text).trim();
  }

  function normalizeProjectFieldValue(value) {
    const text = cleanText(value);
    return text === '未填' ? '' : text;
  }

  function isBlankProjectMetaValue(value) {
    return !normalizeProjectFieldValue(value);
  }

  function isProjectMetaMissing(project) {
    const meta = project || {};
    return ['name', 'no', 'designer'].some(function (key) {
      return isBlankProjectMetaValue(meta[key]);
    });
  }

  function normalizeProjectMeta(project) {
    const meta = Object.assign({}, project);
    if (Object.prototype.hasOwnProperty.call(meta, 'name')) meta.name = normalizeProjectFieldValue(meta.name);
    if (Object.prototype.hasOwnProperty.call(meta, 'no')) meta.no = normalizeProjectFieldValue(meta.no);
    if (Object.prototype.hasOwnProperty.call(meta, 'designer')) meta.designer = normalizeProjectFieldValue(meta.designer);
    return meta;
  }

  function normalizeStatusGridItem(item) {
    if (Array.isArray(item)) return { label: item[0], value: item[1] };
    if (item && typeof item === 'object') return { label: item.label, value: item.value };
    return null;
  }

  function normalizeStatusGridOptions(options) {
    const target = options && (options.target || options.container);
    if (!target) return null;
    const model = options && options.model && typeof options.model === 'object' ? options.model : {};
    const itemsSource = Array.isArray(model.items) ? model.items : options && options.items;
    return {
      target: target,
      level: model.level || (options && options.level) || 'blocked',
      eyebrow: options && options.eyebrow != null
        ? options.eyebrow
        : (options && options.panelLabel != null ? options.panelLabel : ''),
      title: model.title || (options && options.title) || '',
      badge: model.badge || (options && options.badge) || '',
      items: (Array.isArray(itemsSource) ? itemsSource : []).map(normalizeStatusGridItem).filter(Boolean),
      priorityItems: Array.isArray(options && options.priorityItems) ? options.priorityItems.filter(Boolean) : [],
      note: options && options.note ? options.note : '',
      containerClassName: cleanText(options && options.containerClassName ? options.containerClassName : 'report-readiness')
    };
  }

  function renderStatusGridPanel(options) {
    const normalized = normalizeStatusGridOptions(options);
    if (!normalized) return;
    normalized.target.className = `${normalized.containerClassName} ${normalized.level}`.trim();
    normalized.target.innerHTML = `
      <div class="report-readiness-head">
        <div>
          <p class="report-readiness-kicker">${escapeHtml(normalized.eyebrow)}</p>
          <p class="report-readiness-title">${escapeHtml(normalized.title)}</p>
        </div>
        <span class="report-readiness-badge">${escapeHtml(normalized.badge)}</span>
      </div>
      ${normalized.priorityItems.length ? `<ul>${normalized.priorityItems.map(function (item) { return `<li>${escapeHtml(item)}</li>`; }).join('')}</ul>` : ''}
      <div class="report-readiness-grid">
        ${normalized.items.map(function (item) {
          return `<div class="report-readiness-item"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span></div>`;
        }).join('')}
      </div>
      ${normalized.note ? `<div class="report-readiness-note">${escapeHtml(normalized.note)}</div>` : ''}`;
  }

  function buildPayload(options) {
    const generatedAt = options.generatedAt || new Date().toISOString();
    const payload = {
      tool: Object.assign({}, options.tool),
      project: normalizeProjectMeta(options.project),
      generatedAt,
      result: options.result
    };
    if (options.input) payload.input = Object.assign({}, options.input);
    return payload;
  }

  function downloadJson(filename, payload) {
    const json = JSON.stringify(payload, jsonReplacer, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadResultJson(options) {
    const generatedAt = options.generatedAt || new Date().toISOString();
    const payload = buildPayload({
      tool: options.tool,
      project: options.project,
      generatedAt,
      input: options.input,
      result: options.result
    });
    const filename = options.filename || `${options.tool.id}-${generatedAt.slice(0, 10)}.json`;
    downloadJson(filename, payload);
    return payload;
  }

  function downloadProjectJson(options) {
    const generatedAt = options.generatedAt || new Date().toISOString();
    const payload = buildPayload({
      tool: options.tool,
      project: options.project,
      generatedAt,
      input: options.input,
      result: options.result
    });
    const filename = options.filename || `${options.tool.id}-project-${generatedAt.slice(0, 10)}.json`;
    downloadJson(filename, payload);
    return payload;
  }

  function getStorage(storage) {
    if (storage) return storage;
    if (typeof localStorage !== 'undefined') return localStorage;
    throw new Error('此環境無法使用瀏覽器暫存。');
  }

  function saveDraft(storageKey, payload, storage) {
    if (!storageKey) throw new Error('缺少暫存鍵值。');
    getStorage(storage).setItem(storageKey, JSON.stringify(payload, jsonReplacer));
    return payload;
  }

  function loadDraft(storageKey, storage) {
    if (!storageKey) throw new Error('缺少暫存鍵值。');
    const raw = getStorage(storage).getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }

  return {
    version: '0.2.0',
    escapeHtml,
    normalizeProjectFieldValue,
    normalizeProjectMeta,
    isProjectMetaMissing,
    renderStatusGridPanel,
    jsonReplacer,
    buildPayload,
    downloadJson,
    downloadResultJson,
    downloadProjectJson,
    saveDraft,
    loadDraft
  };
});
