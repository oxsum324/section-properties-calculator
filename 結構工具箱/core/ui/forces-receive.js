/* core/ui/forces-receive.js
 * 設計工具端接收 ForcePicker 暫存之內力。
 *
 * 預設為 candidate：只保留候選資料，由目標工具確認後才寫入正式欄位。
 * 舊版頁面可在 script 標籤指定 data-force-import-mode="auto"，保留原自動
 * 匯入流程。候選頁面可使用 window.ForcePickerReceive 的 get/apply/discard API。
 */
(function () {
  const STORAGE_KEY = 'structToolbox.pendingForces';
  const importMode = document.currentScript?.dataset?.forceImportMode || 'candidate';
  let pendingPayload = null;

  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function clone(value) {
    return value == null ? null : JSON.parse(JSON.stringify(value));
  }

  function readPending() {
    if (getParam('import') !== '1') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function fillFromMap(selector, source, filled, prefix, allowedKeys) {
    if (!source) return;
    const attribute = selector.slice(1, -1);
    document.querySelectorAll(selector).forEach(el => {
      const key = el.getAttribute(attribute);
      if (allowedKeys && !allowedKeys.has(key)) return;
      const value = Number(source[key]);
      if (!Number.isFinite(value)) return;
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      filled.push(`${prefix}${key}=${value}`);
    });
  }

  function applyPending(options = {}) {
    if (!pendingPayload) return { payload: null, filled: [] };
    const filled = [];
    const forceKeys = Array.isArray(options.forceKeys) ? new Set(options.forceKeys) : null;
    fillFromMap('[data-force]', pendingPayload.forces || {}, filled, '', forceKeys);
    if (options.includeSection) {
      fillFromMap('[data-section]', pendingPayload.section || {}, filled, '§');
    }
    if (options.includeMaterial) {
      fillFromMap('[data-material]', pendingPayload.material || {}, filled, '※');
    }
    const payload = clone(pendingPayload);
    if (options.clear !== false) discardPending();
    return { payload, filled };
  }

  function discardPending() {
    const payload = clone(pendingPayload);
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
    pendingPayload = null;
    return payload;
  }

  function showAutoBanner(payload, filled) {
    const banner = document.createElement('div');
    banner.style.cssText = [
      'position:sticky', 'top:0', 'z-index:9999', 'padding:12px 20px',
      'background:#155e75', 'color:#fff', 'font-family:Segoe UI,Microsoft JhengHei,sans-serif',
      'font-size:0.88em', 'box-shadow:0 2px 8px rgba(0,0,0,0.2)',
      'display:flex', 'align-items:center', 'justify-content:space-between', 'gap:12px', 'flex-wrap:wrap'
    ].join(';');
    const meta = payload.meta || {};
    const detail = document.createElement('div');
    const timestamp = meta.timestamp ? new Date(meta.timestamp).toLocaleString('zh-TW') : '—';
    const basis = meta.factored ? '已因數化' : '未因數化';
    detail.textContent = `已自 ForcePicker 匯入內力｜來源：${meta.source || '—'}｜工況：${meta.caseName || '—'}｜${basis}｜時間：${timestamp}｜填入：${filled.join('、') || '(無對應欄位)'}`;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '關閉';
    close.style.cssText = 'background:#fff;color:#0e7490;border:0;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer;font-family:inherit';
    close.addEventListener('click', () => banner.remove());
    banner.append(detail, close);
    document.body.insertBefore(banner, document.body.firstChild);
  }

  function run() {
    pendingPayload = readPending();
    if (!pendingPayload) return;
    if (importMode === 'auto') {
      const result = applyPending({ includeSection: true, includeMaterial: true });
      showAutoBanner(result.payload, result.filled);
      return;
    }
    document.dispatchEvent(new CustomEvent('force-picker-candidate-ready', {
      detail: clone(pendingPayload)
    }));
  }

  window.ForcePickerReceive = {
    STORAGE_KEY,
    getPending: () => clone(pendingPayload),
    applyPending,
    discardPending,
    mode: importMode
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
