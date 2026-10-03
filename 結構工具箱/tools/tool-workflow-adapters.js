/** 41 入口清冊中的一般頁 adapter；鋼構 closure 與 anchor React 在其來源自行接入。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root?.document) return;
  root.HYToolWorkflowAdapters = api;
  const script = root.document.currentScript;
  if (!script?.dataset.toolKey) return;
  const config = {
    key: script.dataset.toolKey,
    resultSelector: script.dataset.workflowResult,
    calculateButton: script.dataset.workflowCalculate || null,
    createCalculateButton: script.dataset.workflowCreateCalculate === 'true'
  };
  const start = () => api.install(config, root);
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const RC_SUMMARY = new Set(['/rc-beam', '/rc-column', '/rc-wall', '/rc-shear-wall']);
  const installed = new WeakMap();
  const CALLBACKS = Object.freeze({ '/rc-foundation': 'calcFdtn', '/rc-slab': 'runSlabWorkflowCalculation', '/decking': 'recalcAll', '/beam-analysis': 'runAnalysis', '/stone-fixing': 'render' });
  const SEISMIC_ROUTES = Object.freeze({ appendageCard: ['calcAppendage', '#apResult'], verticalCard: ['calcVertical', '#vResult'], miscCard: ['calcMisc', '#miscResult'] });
  const SEISMIC_BUTTONS = '#btnCalc, button[onclick="calcAppendage()"], button[onclick="calcVertical()"], button[onclick="calcMisc()"]';
  const STONE_DIALOGS = Object.freeze([
    ['#pdf_picker_modal', 'v2ClosePdfPagePicker'], ['#v2-validation-modal', 'v2CloseValidationModal'],
    ['#v2-lightbox', 'v2HideLightbox'], ['#v2-tpl-mgr', 'v2CloseTemplateManager'], ['#v2-check-modal', 'v2CloseCheckModal']
  ]);

  function visible(node, windowRef) {
    if (!node || node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
    const style = windowRef.getComputedStyle(node);
    return node.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }
  function mirror(node) {
    if (!node) return { text: '尚未計算', tone: 'idle' };
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    // 色彩只承接原節點已給的狀態，不以數值或文字重新判定工程 OK。
    const tone = node.classList.contains('fail') || node.classList.contains('ng') ? 'fail' : node.classList.contains('warn') ? 'warn' : node.classList.contains('ok') ? 'ok' : 'idle';
    return { text: text.length > 240 ? text.slice(0, 240) + '…' : text || '尚未計算', tone };
  }
  function call(windowRef, name, ...args) {
    if (typeof windowRef[name] !== 'function') throw Error(`操作入口 ${name} 尚未就緒`);
    return windowRef[name](...args);
  }
  function createOptions(config, windowRef) {
    const documentRef = windowRef.document;
    let resultSelector = config.resultSelector;
    let activeSeismicResult = '#resultPanel';
    function selectSeismicResult(element) {
      const route = SEISMIC_ROUTES[element?.closest('#appendageCard, #verticalCard, #miscCard')?.id];
      activeSeismicResult = route ? route[1] : '#resultPanel';
      return route;
    }
    const resultNode = () => {
      if (config.key === '/rc-retrofit-section') resultSelector = documentRef.getElementById('tabCol')?.classList.contains('active') ? '#c-results' : '#b-results';
      if (config.key === '/seismic-force') resultSelector = activeSeismicResult;
      return Array.from(documentRef.querySelectorAll(resultSelector)).find(node => visible(node, windowRef)) || documentRef.querySelector(resultSelector);
    };
    function scrollResults() {
      if (config.key === '/decking') documentRef.querySelector('nav.tabs button[data-tab="report"]')?.click();
      const node = resultNode();
      if (node && visible(node, windowRef)) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function invokeButton(selector) {
      const button = documentRef.querySelector(selector);
      if (!button || button.disabled) return false;
      button.click();
      return true;
    }
    function calculate() {
      if (RC_SUMMARY.has(config.key)) {
        // applyPanel 本身含一次 calc；先切 summary 才能刷新整體結論，之後僅捲動。
        call(windowRef, 'applyPanel', 'summary');
      } else if (config.key === '/rc-retrofit-section') {
        call(windowRef, documentRef.getElementById('tabCol')?.classList.contains('active') ? 'calcCol' : 'calcBeam');
      } else if (config.key === '/seismic-force') {
        const route = selectSeismicResult(documentRef.activeElement);
        if (route) call(windowRef, route[0]); else return invokeButton('#btnCalc');
      } else if (CALLBACKS[config.key]) {
        call(windowRef, CALLBACKS[config.key]);
      } else {
        return invokeButton(config.calculateButton);
      }
      if (config.key === '/beam-analysis') {
        const error = documentRef.getElementById('errorMsg');
        if (error?.textContent.trim()) { error.scrollIntoView({ block: 'center' }); return false; }
      }
      return true;
    }
    const registrations = [];
    if (config.key === '/stone-fixing') {
      STONE_DIALOGS.forEach(([selector, name]) => registrations.push({ selector, close: () => call(windowRef, name) }));
    } else if (config.key === '/beam-analysis') {
      ['#saveModal', '#loadModal'].forEach(selector => registrations.push({ selector, isOpen: node => node.classList.contains('active'), close: node => node.classList.remove('active') }));
    }
    let summarySelector = config.resultSelector;
    if (config.key === '/frame-analysis') summarySelector = '#storyResponseSummary';
    if (config.key === '/beam-analysis') summarySelector = '#reactionTable';
    if (config.key === '/stone-fixing') summarySelector = '#review-dashboard .dash-state';
    const readSummary = () => mirror(config.key === '/rc-retrofit-section' || config.key === '/seismic-force' ? resultNode() : documentRef.querySelector(summarySelector));
    const anchorSelector = config.key === '/stone-fixing' ? '#v2-toolbar' : config.key === '/decking' ? 'nav.tabs' : documentRef.querySelector('.mode-bar') ? '.mode-bar' : 'header';
    const calcButtonSelector = RC_SUMMARY.has(config.key) ? null : config.key === '/seismic-force' ? SEISMIC_BUTTONS : config.calculateButton || (config.key === '/beam-analysis' ? 'button[onclick="runAnalysis()"]' : config.key === '/stone-fixing' ? 'button[onclick="render()"]' : null);
    return {
      key: config.key, documentRef, calculate, showResults: scrollResults, readSummary, anchorSelector,
      createCalculateButton: config.createCalculateButton, calcButtonSelector,
      closeModal: () => windowRef.HYToolWorkflow.closeTopModal(documentRef, registrations),
      blockedByModal: () => registrations.some(registration => Array.from(documentRef.querySelectorAll(registration.selector)).some(node => registration.isOpen ? registration.isOpen(node) : visible(node, windowRef))),
      onError(error) { windowRef.console.error('計算操作未完成', error); },
      selectResultFor: config.key === '/seismic-force' ? selectSeismicResult : null,
      // 僅供此 adapter 的完成通知觀察，不讓 core 自行猜測工程結果。
      summarySelector: config.key === '/decking' ? '#report-output' : config.key === '/stone-fixing' ? '#review-dashboard' : config.key === '/seismic-force' ? '#resultPanel, #apResult, #vResult, #miscResult' : summarySelector
    };
  }

  function install(config, windowRef) {
    if (installed.has(windowRef.document)) return installed.get(windowRef.document);
    if (!windowRef.HYToolWorkflow) throw Error('計算操作核心未載入');
    const options = createOptions(config, windowRef);
    const handle = windowRef.HYToolWorkflow.install(options);
    if (!handle) return null;
    if (RC_SUMMARY.has(config.key)) {
      const legacy = windowRef.document.getElementById('rcCalcVerdictStrip');
      if (legacy) legacy.hidden = true; // 新列承接原導向列，保留既有 id / class 與計算書邊界。
      windowRef.document.querySelectorAll('.btn-calc').forEach(button => {
        // 舊 calc callback 與舊 strip 都在 bubble；接管這個明確計算按鈕，保證只算一次。
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopImmediatePropagation(); handle.run();
        }, true);
      });
    }
    if (options.selectResultFor) {
      windowRef.document.addEventListener('click', event => {
        const button = event.target.closest?.(options.calcButtonSelector);
        if (button) options.selectResultFor(button);
      }, true);
    }
    if (config.key === '/beam-analysis') {
      windowRef.document.querySelectorAll(options.calcButtonSelector).forEach(button => {
        // 既有分析入口也走相同錯誤導向，模型失敗時不可捲到前次成功結果。
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopImmediatePropagation(); handle.run();
        }, true);
      });
    }
    const targets = Array.from(windowRef.document.querySelectorAll(options.summarySelector));
    const observer = new windowRef.MutationObserver(() => handle.refresh());
    // 只以結果內容重繪作完成通知；開關卡片的 display/class 不能使舊摘要變成最新。
    targets.forEach(target => observer.observe(target, { childList: true, characterData: true, subtree: true }));
    windowRef.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    installed.set(windowRef.document, handle);
    return handle;
  }
  return { createOptions, install, mirror };
});
