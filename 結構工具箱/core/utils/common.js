/* core/utils/common.js — 通用工具函式 (單位約定: cm, kgf) */

// 取得欄位數值 (空字串/NaN → 0)
function val(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const v = parseFloat(el.value);
  return isNaN(v) ? 0 : v;
}

// 數值格式化 (NaN/null → '—')
function fmt(v, digits = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  if (Math.abs(v) >= 1e6 || (v !== 0 && Math.abs(v) < 1e-3)) return Number(v).toExponential(2);
  return Number(v).toFixed(digits);
}

// 結果項目 DOM 字串
function makeResult(label, value, unit, status) {
  const cls = status ? ` ${status}` : '';
  return `<div class="result-item${cls}">
    <span class="label">${label}</span>
    <span><span class="value">${value}</span><span class="unit">${unit || ''}</span></span>
  </div>`;
}

// 將結果寫入既有 .result-item
function setResult(id, value, status) {
  const el = document.getElementById(id);
  if (!el) return;
  const v = el.querySelector('.value');
  if (v) v.textContent = (typeof value === 'number') ? fmt(value) : value;
  el.classList.remove('ok', 'warn', 'fail', 'rc-pending');
  if (status) el.classList.add(status);
}

window.StructUtils = { val, fmt, makeResult, setResult };
