/* 鋼筋混凝土工具箱 — RC 相容層 (v4)
 *
 * 材料常數、鋼筋表、Ec 公式的單一來源已移至：
 *   結構工具箱/core/materials/concrete.js  → window.Concrete
 *   結構工具箱/core/materials/rebar.js     → window.Rebar
 *
 * 本檔將 core 模組內容同步到 window，避免與 core 腳本內既有 const 名稱重複宣告。
 * 使既有 RC 工具 (beam/column/slab/wall/foundation) 仍可直接以 PHI、REBAR_TABLE、calcBeta1... 存取。
 * 同時保留 RC 專用的 fmt() 與 makeResult()。
 */

// === 從 core/materials/concrete.js / rebar.js 同步到 window ===
window.PHI           = window.PHI           || window.Concrete?.PHI           || {};
window.FC_OPTIONS    = window.FC_OPTIONS    || window.Concrete?.FC_OPTIONS    || [210, 245, 280, 350, 420, 490, 560];
window.LAMBDA_NORMAL = window.LAMBDA_NORMAL || window.Concrete?.LAMBDA_NORMAL || 1.0;
window.calcBeta1     = window.calcBeta1     || window.Concrete?.calcBeta1     || (fc => 0.85);
window.calcEc        = window.calcEc        || window.Concrete?.calcEc        || (fc => 12000 * Math.sqrt(fc));

window.REBAR_TABLE   = window.REBAR_TABLE   || window.Rebar?.REBAR_TABLE || {};
window.FY_OPTIONS    = window.FY_OPTIONS    || window.Rebar?.FY_OPTIONS  || [2800, 4200, 5600];
window.ES            = window.ES            || window.Rebar?.ES          || 2.04e6;

// === RC 專用工具函式 (全域) ===
function fmt(v, digits = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return Number(v).toFixed(digits);
}

function makeResult(label, value, unit, status) {
  const cls = status ? ` ${status}` : '';
  return `<div class="result-item${cls}">
    <span class="label">${label}</span>
    <span><span class="value">${value}</span><span class="unit">${unit || ''}</span></span>
  </div>`;
}

window.RCUI = window.RCUI || {};

window.RCUI.getStepsVerbosity = function(defaultMode = 'full') {
  return document.getElementById('stepsVerbosity')?.value || defaultMode;
};

window.RCUI.summarizeStepText = function(text) {
  return String(text || '')
    .split('\n')
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      return t.startsWith('【')
        || t.includes('檢核')
        || t.includes('→')
        || t.startsWith('φVn')
        || t.startsWith('φMn')
        || t.startsWith('Mcr')
        || t.startsWith('Δa')
        || t.startsWith('Tu');
    })
    .join('\n');
};

window.RCUI.renderWarningList = function(cardId, listId, warnings) {
  const card = document.getElementById(cardId);
  const list = document.getElementById(listId);
  if (!card || !list) return;
  if (!warnings || !warnings.length) {
    card.style.display = '';
    list.textContent = '目前沒有特殊警示。';
    return;
  }
  card.style.display = '';
  list.innerHTML = warnings
    .map((msg, idx) => `<div style="margin:6px 0; color:#92400e;">${idx + 1}. ${msg}</div>`)
    .join('');
};
