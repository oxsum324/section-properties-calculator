/* core/ui/forces-receive.js
 * 設計工具端 — 自動接收 ForcePicker 暫存之內力
 *
 * 用法：在目標工具 (beam.html / column.html) 加入：
 *   <input id="Mu"  data-force="M">
 *   <input id="Vu"  data-force="V">
 *   <input id="Tu"  data-force="T">
 *   <script src="../core/ui/forces-receive.js"></script>
 *
 * 動作流程：
 *   (1) 偵測 URL 含 ?import=1
 *   (2) 從 localStorage 讀回 ForcePicker 暫存
 *   (3) 找出所有 [data-force] 元素，依鍵填入值
 *   (4) 觸發 input/change 事件 (使既有計算流程能感知)
 *   (5) 顯示頂部橫幅 (來源、工況、時間)
 *   (6) 消費後自動清除暫存 (避免下次重整再次套用)
 */
(function () {
  const STORAGE_KEY = 'structToolbox.pendingForces';

  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function fillFromMap(selector, source, filled, prefix) {
    if (!source) return;
    document.querySelectorAll(selector).forEach(el => {
      const k = el.getAttribute(selector.replace(/[\[\]]/g,''));
      if (source[k] != null && !isNaN(source[k])) {
        el.value = source[k];
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        filled.push(`${prefix}${k}=${source[k]}`);
      }
    });
  }

  function fillForces(payload) {
    const filled = [];
    fillFromMap('[data-force]',    payload.forces   || {}, filled, '');
    fillFromMap('[data-section]',  payload.section  || {}, filled, '§');
    fillFromMap('[data-material]', payload.material || {}, filled, '※');
    return filled;
  }

  function showBanner(payload, filled) {
    const banner = document.createElement('div');
    banner.style.cssText = `
      position: sticky; top: 0; z-index: 9999;
      padding: 12px 20px;
      background: linear-gradient(135deg, #0e7490, #155e75);
      color: #fff;
      font-family: 'Segoe UI','Microsoft JhengHei',sans-serif;
      font-size: 0.88em;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; flex-wrap: wrap;
    `;
    const m = payload.meta || {};
    const tStr = m.timestamp ? new Date(m.timestamp).toLocaleString('zh-TW') : '';
    banner.innerHTML = `
      <div>
        <strong>✓ 已自 ForcePicker 匯入內力</strong>
        ｜ 來源：${m.source || '—'}
        ｜ 工況：${m.caseName || '—'}
        ｜ ${m.factored ? '<span style="background:#fef3c7;color:#78350f;padding:1px 6px;border-radius:3px;font-size:0.85em;">已因數化</span>' : '<span style="background:#fee2e2;color:#7f1d1d;padding:1px 6px;border-radius:3px;font-size:0.85em;">未因數化</span>'}
        ｜ 時間：${tStr}
        <br>
        <span style="font-size:0.85em; opacity:0.85;">填入：${filled.join('、') || '(無對應欄位)'}</span>
      </div>
      <button style="background:#fff; color:#0e7490; border:0; padding:6px 14px; border-radius:6px; font-weight:600; cursor:pointer; font-family:inherit;">關閉</button>
    `;
    banner.querySelector('button').addEventListener('click', () => banner.remove());
    document.body.insertBefore(banner, document.body.firstChild);
  }

  function run() {
    if (getParam('import') !== '1') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    let payload;
    try { payload = JSON.parse(raw); } catch (e) { return; }
    const filled = fillForces(payload);
    showBanner(payload, filled);
    // 消費後清除 (避免重整再套)
    localStorage.removeItem(STORAGE_KEY);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
