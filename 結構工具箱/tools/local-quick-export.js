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

  function buildPayload(options) {
    const generatedAt = options.generatedAt || new Date().toISOString();
    const payload = {
      tool: Object.assign({}, options.tool),
      project: Object.assign({}, options.project),
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

  return {
    version: '0.1.0',
    jsonReplacer,
    buildPayload,
    downloadJson,
    downloadResultJson
  };
});
