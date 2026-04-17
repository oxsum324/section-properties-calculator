/* 公式說明 tooltip 共用模組
 * 用法：
 *   FormulaInfo.attach({
 *     'r-Mu':   '撓曲強度需求\nMu = wu·ℓn²/8 (簡支)\nwu = 1.2D + 1.6L',
 *     'r-phiMn':'φMn = φ·As·fy·(d − a/2)\na = As·fy / (0.85·fc·b)',
 *     ...
 *   });
 * 會在每個 id 之 .label 後加上 ⓘ 按鈕，hover/點擊顯示說明。
 */
(function (global) {
  const FormulaInfo = {
    attach(map) {
      Object.keys(map).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const lbl = el.querySelector('.label');
        if (!lbl || lbl.querySelector('.formula-info')) return;
        const tip = document.createElement('span');
        tip.className = 'formula-info';
        tip.textContent = 'ⓘ';
        tip.setAttribute('data-tip', map[id]);
        tip.addEventListener('click', e => {
          e.stopPropagation();
          const open = tip.getAttribute('data-open') === '1';
          document.querySelectorAll('.formula-info[data-open="1"]').forEach(o => o.removeAttribute('data-open'));
          if (!open) tip.setAttribute('data-open', '1');
        });
        lbl.appendChild(tip);
      });
      // 點空白關閉
      if (!FormulaInfo._bound) {
        document.addEventListener('click', () => {
          document.querySelectorAll('.formula-info[data-open="1"]').forEach(o => o.removeAttribute('data-open'));
        });
        FormulaInfo._bound = true;
      }
    }
  };
  global.FormulaInfo = FormulaInfo;
})(window);
