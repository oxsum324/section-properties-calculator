/**
 * RC 工具共用：計算結果導向列（頁面專用，不進計算書）
 *
 * 目的：按下「開始計算」後，使用者停留在輸入分頁時沒有任何回饋，
 * 結果藏在「綜合結果」分頁。此模組在作業模式列下方加一條固定的結論列，
 * 鏡射綜合結果的整體狀態（bannerStatus），並在使用者於輸入分頁按下計算時
 * 自動切到綜合結果分頁。
 *
 * 邊界：本列只存在於 HTML 操作頁；列印、直接列印與計算書視窗皆不包含。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RCCalcVerdictStrip = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const STYLE_ID = 'rcCalcVerdictStripStyle';
  const STRIP_ID = 'rcCalcVerdictStrip';
  const DEFAULTS = Object.freeze({
    bannerId: 'bannerStatus',
    tabsSelector: '.section-tabs button',
    summaryTab: 'summary',
    jumpFromTabs: ['geom', 'loads', 'basic', 'geometry', 'input'],
    calcButtonSelector: '.btn-calc',
    anchorSelector: '.mode-bar',
    summaryLabel: '綜合結果',
    flashMs: 2600
  });

  function classify(text) {
    const value = String(text || '').trim();
    if (!value || /尚未計算/.test(value)) return 'idle';
    if (/^✗|NG/.test(value)) return 'fail';
    if (/人工複核|待檢核|⚠/.test(value)) return 'warn';
    if (/^✓|OK|可核可|符合規範/.test(value)) return 'ok';
    return 'warn';
  }

  function firstLine(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('div, br').forEach(child => child.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  function ensureStyle(documentRef) {
    if (documentRef.getElementById(STYLE_ID)) return;
    const style = documentRef.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      `#${STRIP_ID}{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:-6px 0 14px;padding:10px 16px;border-radius:10px;border:1px solid #cbd5e1;background:#f8fafc;color:#1e293b;font-size:0.95rem;line-height:1.4}`,
      `#${STRIP_ID}[hidden]{display:none}`,
      `#${STRIP_ID}.is-ok{border-color:#86efac;background:#f0fdf4;color:#166534}`,
      `#${STRIP_ID}.is-warn{border-color:#fcd34d;background:#fffbeb;color:#92400e}`,
      `#${STRIP_ID}.is-fail{border-color:#fca5a5;background:#fef2f2;color:#991b1b}`,
      `#${STRIP_ID}.is-idle{color:#475569}`,
      `#${STRIP_ID} .rc-verdict-strip__label{font-size:0.78rem;font-weight:700;letter-spacing:0.04em;color:inherit;opacity:0.75;white-space:nowrap}`,
      `#${STRIP_ID} .rc-verdict-strip__text{flex:1 1 240px;font-weight:700}`,
      `#${STRIP_ID} .rc-verdict-strip__flash{font-weight:500;opacity:0;transition:opacity .3s}`,
      `#${STRIP_ID}.is-flash .rc-verdict-strip__flash{opacity:1}`,
      `#${STRIP_ID} .rc-verdict-strip__go{appearance:none;border:1px solid currentColor;background:transparent;color:inherit;border-radius:999px;padding:5px 14px;font:inherit;font-size:0.85rem;font-weight:600;cursor:pointer;white-space:nowrap}`,
      `#${STRIP_ID} .rc-verdict-strip__go:hover{background:rgba(255,255,255,0.6)}`,
      `#${STRIP_ID} .rc-verdict-strip__boundary{flex-basis:100%;font-size:0.72rem;font-weight:400;opacity:0.7}`,
      `@media print{#${STRIP_ID}{display:none !important}}`
    ].join('\n');
    documentRef.head.appendChild(style);
  }

  function install(options = {}) {
    const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null);
    if (!documentRef) return null;
    const config = Object.assign({}, DEFAULTS, options);
    const anchor = documentRef.querySelector(config.anchorSelector);
    const banner = documentRef.getElementById(config.bannerId);
    if (!anchor || !banner) return null;
    if (documentRef.getElementById(STRIP_ID)) return documentRef.getElementById(STRIP_ID);
    ensureStyle(documentRef);

    const strip = documentRef.createElement('div');
    strip.id = STRIP_ID;
    strip.className = 'rc-verdict-strip is-idle';
    strip.setAttribute('role', 'status');
    strip.setAttribute('aria-live', 'polite');
    strip.dataset.pageOnly = 'true';

    const label = documentRef.createElement('span');
    label.className = 'rc-verdict-strip__label';
    label.textContent = '目前結論';
    const text = documentRef.createElement('span');
    text.className = 'rc-verdict-strip__text';
    text.textContent = '尚未計算';
    const flash = documentRef.createElement('span');
    flash.className = 'rc-verdict-strip__flash';
    flash.textContent = '已重新計算，各分頁結果已更新';
    const go = documentRef.createElement('button');
    go.type = 'button';
    go.className = 'rc-verdict-strip__go';
    go.textContent = `查看${config.summaryLabel} →`;
    const boundary = documentRef.createElement('span');
    boundary.className = 'rc-verdict-strip__boundary';
    boundary.textContent = '頁面導向提示，不進計算書、列印或 PDF。';
    strip.append(label, text, flash, go, boundary);
    anchor.insertAdjacentElement('afterend', strip);

    function activeTab() {
      const active = documentRef.querySelector(`${config.tabsSelector}.active`);
      return active ? active.dataset.tab || '' : '';
    }

    function summaryButton() {
      return Array.from(documentRef.querySelectorAll(config.tabsSelector))
        .find(button => button.dataset.tab === config.summaryTab) || null;
    }

    function goToSummary() {
      const button = summaryButton();
      if (!button) return;
      if (activeTab() !== config.summaryTab) button.click();
      const tabs = button.closest('.section-tabs') || button;
      tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    let flashTimer = null;
    function flashUpdated() {
      strip.classList.add('is-flash');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => strip.classList.remove('is-flash'), config.flashMs);
    }

    function sync() {
      const summary = firstLine(banner);
      const tone = classify(summary);
      strip.classList.remove('is-ok', 'is-warn', 'is-fail', 'is-idle');
      strip.classList.add(`is-${tone}`);
      strip.dataset.tone = tone;
      text.textContent = summary || '尚未計算';
      go.hidden = tone === 'idle';
    }

    go.addEventListener('click', goToSummary);
    new MutationObserver(sync).observe(banner, { childList: true, characterData: true, subtree: true, attributes: true });
    sync();

    documentRef.querySelectorAll(config.calcButtonSelector).forEach(button => {
      button.addEventListener('click', () => {
        // 計算函式已先於本監聽器執行（註冊順序），此處只處理導向。
        if (config.jumpFromTabs.includes(activeTab())) {
          goToSummary();
          return;
        }
        flashUpdated();
      });
    });

    return strip;
  }

  function autoInstall(options) {
    if (typeof document === 'undefined') return;
    const run = () => install(options);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }

  return { install, autoInstall, classify, firstLine };
});
