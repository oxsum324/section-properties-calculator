/* RC 相容適配：引號策略與非同步 SHA 契約；演算法唯一來源為 core/ui/report-utils.js。 */
(function (root, createRcReportUtils) {
  if (typeof module === 'object' && module.exports) {
    module.exports = { createRcReportUtils };
  } else {
    root.RCReportUtilsFactory = createRcReportUtils;
    root.RCReportUtils = createRcReportUtils(root.StructReportUtils, root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRcReportUtils(shared, runtime) {
  if (!shared || typeof shared.sha256Text !== 'function') throw new Error('需先載入共用 report-utils.js。');
  async function sha256Text(value) {
    if (!runtime.crypto || !runtime.crypto.subtle || typeof runtime.TextEncoder !== 'function') {
      return shared.sha256Text(value);
    }
    const digest = await runtime.crypto.subtle.digest('SHA-256', new runtime.TextEncoder().encode(String(value || '')));
    return Array.from(new Uint8Array(digest)).map(function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }
  return Object.freeze(Object.assign({}, shared, {
    escapeText: value => shared.escapeHtml(value, 'none'),
    escapeAttribute: value => shared.escapeHtml(value, 'double'),
    sha256Text
  }));
});
