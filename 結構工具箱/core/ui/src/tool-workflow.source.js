/**
 * 操作頁的計算捷徑、結論導向與待更新提示；報表核心不得載入本模組。
 * calculate 是唯一計算入口；showResults / readSummary 只讀既有結果。
 * 自動計算頁應在原計算完成處呼叫 handle.refresh()，輸入修改則 invalidate()。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HYToolWorkflow = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const installed = new WeakMap();
  const STYLE_ID = 'hyToolWorkflowStyle';
  const STYLE = `
    [data-hy-workflow]{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;min-width:0;max-width:100%;box-sizing:border-box;margin:12px 0;padding:12px 16px;border:1px solid var(--border-strong,#d4d7dc);border-radius:var(--radius-lg,6px);background:var(--bg-page,#f7f8fa);color:var(--fg-1,#111316);font:var(--fs-sm,13px)/1.55 var(--font-sans,sans-serif)}
    [data-hy-workflow] [data-workflow-summary]{flex:1 1 220px;min-width:0;overflow-wrap:anywhere;font-weight:700}
    [data-hy-workflow] [data-workflow-hint]{flex:1 1 100%;min-width:0;overflow-wrap:anywhere;color:var(--fg-2,#3f4653);font-size:var(--fs-xs,12px)}
    [data-hy-workflow] button{max-width:100%;min-height:40px;padding:8px 14px;border:0;border-radius:var(--radius-lg,6px);background:var(--hy-navy,#002060);color:var(--fg-on-navy,#fff);font:inherit;cursor:pointer}
    [data-hy-workflow] button:disabled{opacity:.6;cursor:wait}
    [data-hy-workflow] button:focus-visible{outline:2px solid var(--hy-navy,#002060);outline-offset:3px}
    [data-hy-workflow][data-tone="ok"]{border-color:var(--hy-success,#1f7a4d);background:var(--hy-success-100,#e3f1ea)}
    [data-hy-workflow][data-tone="warn"]{border-color:var(--hy-warning,#b8860b);background:var(--hy-warning-100,#fbf2db)}
    [data-hy-workflow][data-tone="fail"]{border-color:var(--hy-danger,#e00000);background:var(--hy-danger-100,#fce5e5)}
    @media print{[data-hy-workflow]{display:none!important}}
  `;

  function isCalculationKey(event) {
    return event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
  }

  // 可獨立測試事件與非同步生命週期，不倚賴 DOM 或工程公式。
  function createController(options) {
    if (typeof options.calculate !== 'function') throw new TypeError('calculate callback is required');
    let busy = false;
    let disposed = false;

    function finish(result) {
      if (!disposed) {
        if (result !== false) {
          options.showResults?.();
          options.refresh?.();
        } else {
          options.invalidate?.();
        }
      }
      return result;
    }
    function fail(error) {
      if (!disposed) options.onError?.(error);
      return false;
    }
    function release() {
      busy = false;
      if (!disposed) options.onBusy?.(false);
    }
    function run() {
      if (disposed || busy) return false;
      busy = true;
      options.onBusy?.(true);
      try {
        const result = options.calculate();
        if (result && typeof result.then === 'function') {
          return Promise.resolve(result).then(finish).catch(fail).finally(release);
        }
        const value = finish(result);
        release();
        return value;
      } catch (error) {
        const value = fail(error);
        release();
        return value;
      }
    }
    function handleKeyDown(event) {
      if (disposed || event.defaultPrevented) return false;
      // 連按／組字中的 Ctrl+Enter 也不能落入彈窗的 Enter 確認處理器。
      if (isCalculationKey(event) && options.blockedByModal?.() === true) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        return true;
      }
      if (event.isComposing || event.keyCode === 229 || event.repeat) {
        if (!isCalculationKey(event)) return false;
        // 舊頁可能另有 bubble Ctrl+Enter；消耗重複事件，禁止交給舊 handler 重算。
        event.preventDefault();
        event.stopImmediatePropagation?.();
        return true;
      }
      if (event.key === 'Escape') {
        if (options.closeModal?.() !== true) return false;
        event.preventDefault();
        event.stopImmediatePropagation?.();
        return true;
      }
      if (!isCalculationKey(event)) return false;
      event.preventDefault();
      event.stopImmediatePropagation?.();
      run();
      return true;
    }
    return { run, handleKeyDown, get busy() { return busy; }, destroy() { disposed = true; } };
  }

  function hasOpenModal(documentRef) {
    return Array.from(documentRef.querySelectorAll('dialog[open], [aria-modal="true"]')).some(node => {
      if (node.tagName === 'DIALOG' && node.matches(':modal')) return true;
      if (node.getAttribute('aria-modal') !== 'true') return false;
      const style = documentRef.defaultView?.getComputedStyle(node);
      return !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.getClientRects().length > 0 && style?.display !== 'none' && style?.visibility !== 'hidden';
    });
  }

  // 僅關閉 adapter 明列的視窗或原生 dialog；不猜測分頁／卡片的關閉方式。
  function closeTopModal(documentRef, registrations = []) {
    const view = documentRef.defaultView;
    const candidates = [];
    registrations.forEach(registration => {
      documentRef.querySelectorAll(registration.selector).forEach(node => {
        const style = view?.getComputedStyle(node);
        const visible = registration.isOpen ? registration.isOpen(node) :
          !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.getClientRects().length > 0 && style?.display !== 'none' && style?.visibility !== 'hidden';
        if (visible) candidates.push({ node, z: Number.parseInt(style?.zIndex, 10) || 0, close: () => registration.close(node) });
      });
    });
    documentRef.querySelectorAll('dialog[open]').forEach(node => {
      if (!candidates.some(candidate => candidate.node === node)) {
        candidates.push({ node, z: node.matches(':modal') ? Number.MAX_SAFE_INTEGER : 0, close: () => node.close() });
      }
    });
    candidates.sort((a, b) => a.z - b.z || (a.node.compareDocumentPosition(b.node) & 4 ? -1 : 1));
    const top = candidates.at(-1);
    if (!top) return false;
    top.close();
    return true;
  }

  function install(options = {}) {
    const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null);
    if (!documentRef?.body) return null;
    if (installed.has(documentRef)) return installed.get(documentRef);
    if (!options.key) throw new TypeError('workflow key is required');
    if (typeof options.calculate !== 'function') throw new TypeError('calculate callback is required');

    if (!documentRef.getElementById(STYLE_ID)) {
      const style = documentRef.createElement('style');
      style.id = STYLE_ID;
      style.textContent = STYLE;
      documentRef.head.appendChild(style);
    }
    const panel = documentRef.createElement('aside');
    panel.setAttribute('data-hy-workflow', options.key);
    panel.setAttribute('data-page-only', 'true');
    panel.setAttribute('aria-label', '計算操作');
    const summary = documentRef.createElement('span');
    summary.setAttribute('data-workflow-summary', '');
    summary.setAttribute('role', 'status');
    summary.setAttribute('aria-live', 'polite');
    summary.hidden = typeof options.readSummary !== 'function';
    panel.appendChild(summary);
    let calculateButton = null;
    if (options.createCalculateButton) {
      calculateButton = documentRef.createElement('button');
      calculateButton.type = 'button';
      calculateButton.setAttribute('data-workflow-calculate', '');
      calculateButton.textContent = '開始計算';
      panel.appendChild(calculateButton);
    }
    const hint = documentRef.createElement('span');
    hint.setAttribute('data-workflow-hint', '');
    hint.textContent = 'Ctrl+Enter（Mac：⌘+Enter）開始計算；Esc 關閉最上層彈窗。';
    panel.appendChild(hint);
    const anchor = options.anchorSelector ? documentRef.querySelector(options.anchorSelector) : null;
    if (anchor) anchor.insertAdjacentElement('afterend', panel);
    else documentRef.body.prepend(panel);

    let dirty = false;
    let disposed = false;
    function invalidate() {
      dirty = true;
      panel.setAttribute('data-tone', 'idle');
      panel.setAttribute('data-state', 'pending');
      summary.textContent = '輸入已變更，請開始計算更新結論。';
    }
    function refresh() {
      if (disposed) return;
      const value = options.readSummary?.();
      dirty = false;
      panel.setAttribute('data-state', 'current');
      panel.setAttribute('data-tone', ['ok', 'warn', 'fail'].includes(value?.tone) ? value.tone : 'idle');
      summary.textContent = typeof value === 'string' ? value : value?.text || '尚未計算';
    }
    const controller = createController({
      calculate: options.calculate,
      showResults: options.showResults,
      refresh,
      invalidate,
      closeModal: () => options.closeModal?.() === true || closeTopModal(documentRef),
      blockedByModal: () => options.blockedByModal?.() === true || hasOpenModal(documentRef),
      onBusy(value) {
        panel.setAttribute('aria-busy', String(value));
        if (calculateButton) calculateButton.disabled = value;
      },
      onError(error) {
        invalidate();
        summary.textContent = '計算未完成，請檢查輸入與頁面錯誤提示。';
        options.onError?.(error);
        if (!options.onError) (documentRef.defaultView?.console || console).error('計算捷徑未完成', error);
      }
    });
    function onInput(event) {
      if (event.target.closest?.('[data-hy-workflow]')) return;
      if (event.target.matches?.(options.inputSelector || 'input,select,textarea,[contenteditable="true"]')) invalidate();
    }
    function onClick(event) {
      if (!options.calcButtonSelector || controller.busy) return;
      const button = event.target.closest?.(options.calcButtonSelector);
      if (!button || button.disabled) return;
      // 原計算按鈕的 callback 已執行；此處只刷新結論與導向，禁止再次計算。
      options.showResults?.();
      refresh();
    }
    const onCalculate = () => controller.run();
    calculateButton?.addEventListener('click', onCalculate);
    documentRef.addEventListener('keydown', controller.handleKeyDown, true);
    documentRef.addEventListener('input', onInput, true);
    documentRef.addEventListener('change', onInput, true);
    documentRef.addEventListener('click', onClick);
    refresh();
    const handle = {
      run: controller.run, refresh, invalidate,
      get pending() { return dirty; },
      get busy() { return controller.busy; },
      panel,
      destroy() {
        disposed = true;
        controller.destroy();
        calculateButton?.removeEventListener('click', onCalculate);
        documentRef.removeEventListener('keydown', controller.handleKeyDown, true);
        documentRef.removeEventListener('input', onInput, true);
        documentRef.removeEventListener('change', onInput, true);
        documentRef.removeEventListener('click', onClick);
        panel.remove();
        installed.delete(documentRef);
      }
    };
    installed.set(documentRef, handle);
    return handle;
  }

  return { install, createController, closeTopModal, hasOpenModal, isCalculationKey, STYLE };
});
