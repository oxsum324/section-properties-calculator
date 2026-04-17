/* core/ui/force-picker.js
 * 內力 picker — 共用模組
 *
 * 概念：上游分析工具 (連續梁分析、struct_dx、手動輸入) 把計算出的內力
 * 透過此模組「打包 → 暫存 → 跳轉到設計工具」。設計工具 (beam.html、
 * column.html) 在 <input> 上加 data-force="M|V|T|P|Mx|My|Vx|Vy" 後，
 * 配合 forces-receive.js 即可自動填入。
 *
 * 統一內力 schema：
 *   {
 *     meta: { source, caseName, factored, timestamp },
 *     forces: {
 *       P  : 軸力 (tf, 壓+)
 *       Mx : x 向彎矩 (tf·m)   ── 柱專用 (雙向)
 *       My : y 向彎矩 (tf·m)   ── 柱專用
 *       Vx : x 向剪力 (tf)     ── 柱專用
 *       Vy : y 向剪力 (tf)     ── 柱專用
 *       M  : 主彎矩 (tf·m)     ── 梁專用 (單軸)
 *       V  : 主剪力 (tf)       ── 梁專用
 *       T  : 扭矩 (tf·m)       ── 梁專用
 *     },
 *     target: 'beam' | 'column-rect' | 'column-circ'
 *   }
 *
 * 目標 (target) → 對應 URL：
 *   beam        → ../鋼筋混凝土/tools/beam.html?import=1
 *   column-rect → ../鋼筋混凝土/tools/column.html?import=1
 *   column-circ → tools/column-circular.html?import=1   (尚未實作)
 */
(function (global) {

  const STORAGE_KEY = 'structToolbox.pendingForces';

  // 各設計工具相對於 force-picker.html 之路徑
  // column.html 內建矩形/圓形(螺箍筋)/圓形(箍筋) 三種柱型，共用同一檔案
  const TARGET_URL = {
    'beam':        '../鋼筋混凝土/tools/beam.html?import=1',
    'column-rect': '../鋼筋混凝土/tools/column.html?import=1',
    'column-circ': '../鋼筋混凝土/tools/column.html?import=1&colType=circle',
    'steel-beam':   'tools/steel-beam.html?import=1',
    'steel-column': 'tools/steel-column.html?import=1',
  };

  // 各 target 預期使用的 force keys (用於驗證 + UI 顯示)
  const TARGET_KEYS = {
    'beam':         ['M', 'MNeg', 'V', 'T'],
    'column-rect':  ['P', 'Mx', 'My', 'Vx', 'Vy'],
    'column-circ':  ['P', 'Mx', 'Vx'],
    'steel-beam':   ['M', 'MNeg', 'V'],
    'steel-column': ['P', 'Mx', 'My'],
  };

  const TARGET_LABEL = {
    'beam':         '梁構件設計 (beam.html)',
    'column-rect':  '矩形柱設計 (column.html)',
    'column-circ':  '圓形柱設計 (column.html)',
    'steel-beam':   '鋼梁設計 (steel-beam.html)',
    'steel-column': '鋼柱設計 (steel-column.html)',
  };

  // 內力鍵 → 中文標籤、單位
  const FORCE_META = {
    P:  { label: '軸力 P',         unit: 'tf',   sign: '壓 +, 拉 −' },
    Mx: { label: '彎矩 Mx',        unit: 'tf·m', sign: '右手定則' },
    My: { label: '彎矩 My',        unit: 'tf·m', sign: '右手定則' },
    Vx: { label: '剪力 Vx',        unit: 'tf',   sign: '' },
    Vy: { label: '剪力 Vy',        unit: 'tf',   sign: '' },
    M:    { label: '正彎矩 +M',       unit: 'tf·m', sign: '底拉' },
    MNeg: { label: '負彎矩 −M',       unit: 'tf·m', sign: '頂拉' },
    V:  { label: '剪力 V',         unit: 'tf',   sign: '' },
    T:  { label: '扭矩 T',         unit: 'tf·m', sign: '' },
  };

  /**
   * 暫存內力到 localStorage
   */
  function stash(payload) {
    const safe = {
      meta: {
        source:    payload.meta?.source    || '未指定',
        caseName:  payload.meta?.caseName  || '未命名工況',
        factored:  !!payload.meta?.factored,
        timestamp: new Date().toISOString(),
      },
      forces: payload.forces || {},
      // 可選: 斷面幾何 {shape:'rect'|'circle', b, h, D, title}
      section:  payload.section  || null,
      // 可選: 材料性質 {fc, fy}  (kgf/cm²)
      material: payload.material || null,
      target:   payload.target   || null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    return safe;
  }

  /**
   * 讀取暫存內力 (給目標工具使用)
   */
  function consume() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * 清除暫存
   */
  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * 送出 — 暫存後開新分頁到目標工具
   * @param {string}  target   - 'beam' | 'column-rect' | 'column-circ'
   * @param {object}  payload  - { meta, forces, section, material }
   * @param {string} [urlOverride] - 可選：由呼叫者提供正確的相對路徑
   *        （TARGET_URL 是相對於 force-picker.html 的預設值，
   *          從其他頁面呼叫時傳入覆寫路徑即可，不必再 stash + 手動 open）
   */
  function sendTo(target, payload, urlOverride) {
    const url = urlOverride || TARGET_URL[target];
    if (!url) throw new Error('未知 target: ' + target);
    stash({ ...payload, target });
    window.open(url, '_blank');
  }

  /**
   * 過濾 forces 只保留目標工具會用到的鍵
   */
  function filterForTarget(forces, target) {
    const keys = TARGET_KEYS[target] || Object.keys(forces);
    const out = {};
    for (const k of keys) {
      if (forces[k] != null && !isNaN(forces[k])) out[k] = forces[k];
    }
    return out;
  }

  global.ForcePicker = {
    STORAGE_KEY,
    TARGET_URL,
    TARGET_KEYS,
    TARGET_LABEL,
    FORCE_META,
    stash,
    consume,
    clear,
    sendTo,
    filterForTarget,
  };
})(window);
