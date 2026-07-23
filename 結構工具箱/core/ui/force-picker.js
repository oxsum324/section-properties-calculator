/* core/ui/force-picker.js
 * 內力 picker — 共用模組
 *
 * 概念：上游分析工具 (連續梁分析、struct_dx、手動輸入) 把計算出的內力
 * 透過此模組「打包 → 暫存 → 跳轉到設計工具」。設計工具 (beam.html、
 * column.html) 在 <input> 上加 data-force="M|V|T|P|Mx|My|Vx|Vy" 後，
 * 配合 forces-receive.js 將資料送到目標頁的候選確認區；正式欄位必須由
 * 使用者確認後才會套用。僅標示 data-force-import-mode="auto" 的舊版頁面
 * 保留自動填入行為。
 *
 * 統一內力 schema：
 *   {
 *     meta: { source, caseName, factored, loadBasis, timestamp },
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
 *     target: 'beam' | 'column-rect' | 'column-circ' | 'steel-beam'
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
    'steel-beam':   '../../鋼構工具/steel-beam-formal.html?import=1',
  };

  // 各 target 預期使用的 force keys (用於驗證 + UI 顯示)
  const TARGET_KEYS = {
    'beam':         ['P', 'M', 'MNeg', 'V', 'T'],
    'column-rect':  ['P', 'Mx', 'My', 'Vx', 'Vy'],
    'column-circ':  ['P', 'Mx', 'Vx'],
    'steel-beam':   ['M', 'MNeg', 'V'],
  };

  const TARGET_LABEL = {
    'beam':         '梁構件設計 (beam.html)',
    'column-rect':  '矩形柱設計 (column.html)',
    'column-circ':  '圓形柱設計 (column.html)',
    'steel-beam':   '鋼梁正式檢核 (steel-beam-formal.html)',
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

  const NATIVE_FACTOR_KEYS = ['D', 'L', 'W', 'E'];
  const STRUCTURAL_FORCE_KEYS = new Set(['P', 'Mx', 'My', 'Vx', 'Vy', 'T', 'M', 'MNeg', 'V']);
  const TUPLE_VALUE_TOLERANCE = 0.00051;

  function normalizeNumericMap(value) {
    if (!value || typeof value !== 'object') return null;
    const normalized = {};
    Object.entries(value).forEach(([key, rawValue]) => {
      const numeric = Number(rawValue);
      if (Number.isFinite(numeric)) normalized[key] = numeric;
    });
    return Object.keys(normalized).length ? normalized : null;
  }

  function equivalentForceKeys(key) {
    if (key === 'M' || key === 'Mx') return ['M', 'Mx'];
    if (key === 'V' || key === 'Vx') return ['V', 'Vx'];
    return [key];
  }

  function normalizeCombination(combination) {
    if (!combination || typeof combination !== 'object') return null;
    const normalized = {
      name: String(combination.name || '').trim(),
      method: String(combination.method || '').trim().toUpperCase(),
      tuplePreserved: combination.tuplePreserved === true,
      factors: normalizeNumericMap(combination.factors),
      values: normalizeNumericMap(combination.values),
      validationStatus: String(combination.validationStatus || '').trim(),
      reasons: Array.isArray(combination.reasons)
        ? combination.reasons.map(reason => String(reason)).filter(Boolean)
        : [],
    };
    return normalized.name || normalized.method || normalized.tuplePreserved ||
      normalized.factors || normalized.values ? normalized : null;
  }

  function validateCombination(combination, rawForces) {
    const normalized = normalizeCombination(combination);
    if (!normalized) return null;

    const reasons = [];
    const addReason = reason => {
      if (!reasons.includes(reason)) reasons.push(reason);
    };
    const rawFactorSource = combination?.factors;
    const rawValueSource = combination?.values;
    const rawForceSource = rawForces && typeof rawForces === 'object' ? rawForces : {};

    if (!['LRFD', 'ASD'].includes(normalized.method)) addReason('method_not_supported');
    if (!normalized.name) addReason('combination_name_missing');
    if (combination.tuplePreserved !== true) addReason('tuple_preservation_not_claimed');

    let nativeCombo = null;
    let catalogUnavailable = false;
    if (['LRFD', 'ASD'].includes(normalized.method)) {
      if (!global.LoadCombo || typeof global.LoadCombo.getComboSet !== 'function') {
        catalogUnavailable = true;
        addReason('native_combo_catalog_unavailable');
      } else {
        try {
          const comboSet = global.LoadCombo.getComboSet(normalized.method);
          nativeCombo = comboSet?.combos?.find(combo => combo.name === normalized.name) || null;
          if (!nativeCombo) addReason('combination_name_not_native');
        } catch (_error) {
          catalogUnavailable = true;
          addReason('native_combo_catalog_unavailable');
        }
      }
    }

    if (!rawFactorSource || typeof rawFactorSource !== 'object' || Array.isArray(rawFactorSource)) {
      addReason('factors_missing');
    } else {
      const factorKeys = Object.keys(rawFactorSource);
      NATIVE_FACTOR_KEYS.forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(rawFactorSource, key)) {
          addReason(`factor_missing:${key}`);
          return;
        }
        const factor = Number(rawFactorSource[key]);
        if (!Number.isFinite(factor)) {
          addReason(`factor_not_numeric:${key}`);
        } else if (nativeCombo && Math.abs(factor - nativeCombo[key]) > 1e-12) {
          addReason(`factor_mismatch:${key}`);
        }
      });
      factorKeys
        .filter(key => !NATIVE_FACTOR_KEYS.includes(key))
        .forEach(key => addReason(`factor_unexpected:${key}`));
    }

    if (!rawValueSource || typeof rawValueSource !== 'object' || Array.isArray(rawValueSource) ||
        Object.keys(rawValueSource).length === 0) {
      addReason('values_missing');
    } else {
      Object.entries(rawValueSource).forEach(([key, rawValue]) => {
        const value = Number(rawValue);
        if (!Number.isFinite(value)) {
          addReason(`value_not_numeric:${key}`);
          return;
        }
        const matchingRawKeys = equivalentForceKeys(key).filter(candidate =>
          Object.prototype.hasOwnProperty.call(rawForceSource, candidate)
        );
        if (matchingRawKeys.length === 0) {
          addReason(`raw_force_missing:${key}`);
          return;
        }
        matchingRawKeys.forEach(rawKey => {
          const rawForce = Number(rawForceSource[rawKey]);
          if (!Number.isFinite(rawForce)) {
            addReason(`raw_force_not_numeric:${rawKey}`);
          } else if (Math.abs(value - rawForce) > TUPLE_VALUE_TOLERANCE) {
            addReason(`value_mismatch:${key}->${rawKey}`);
          }
        });
      });

      Object.keys(rawForceSource)
        .filter(key => STRUCTURAL_FORCE_KEYS.has(key))
        .forEach(rawKey => {
          const matchingValueKeys = equivalentForceKeys(rawKey).filter(candidate =>
            Object.prototype.hasOwnProperty.call(rawValueSource, candidate)
          );
          if (matchingValueKeys.length === 0) addReason(`value_missing_for_raw:${rawKey}`);
        });
    }

    const substantiveReasons = reasons.filter(reason => reason !== 'native_combo_catalog_unavailable');
    normalized.validationStatus = substantiveReasons.length > 0
      ? 'invalid'
      : (catalogUnavailable ? 'unverified' : 'verified');
    normalized.reasons = reasons;
    normalized.tuplePreserved = normalized.validationStatus === 'verified';
    return normalized;
  }

  /**
   * 暫存內力到 localStorage
   */
  function stashInternal(payload, validationForces) {
    const rawForces = normalizeNumericMap(validationForces) || {};
    const safe = {
      meta: {
        source:    payload.meta?.source    || '未指定',
        caseName:  payload.meta?.caseName  || '未命名工況',
        factored:  !!payload.meta?.factored,
        loadBasis: payload.meta?.loadBasis || (payload.meta?.factored ? 'factored' : 'unconfirmed'),
        combination: validateCombination(payload.meta?.combination, rawForces),
        timestamp: new Date().toISOString(),
      },
      forces: normalizeNumericMap(payload.forces) || {},
      // 可選: 斷面幾何 {shape:'rect'|'circle', b, h, D, title}
      section:  payload.section  || null,
      // 可選: 材料性質 {fc, fy}  (kgf/cm²)
      material: payload.material || null,
      // 可選: 構件幾何摘要，例如 {spanCm}
      member:   payload.member   || null,
      target:   payload.target   || null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    return safe;
  }

  function stash(payload) {
    return stashInternal(payload, payload.forces);
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

  function finiteForceValue(forces, key) {
    const rawValue = forces && forces[key];
    if (rawValue == null || rawValue === '') return null;
    const numeric = Number(rawValue);
    return Number.isFinite(numeric) ? numeric : null;
  }

  /**
   * 將來源內力轉成各下游工具的輸入語意。
   * 原始 signed tuple 必須另存於 meta.combination.values，不得由本結果反推。
   */
  function adaptForTarget(forces, target) {
    const source = forces || {};

    if (target === 'beam' || target === 'steel-beam') {
      const output = {};
      const axial = finiteForceValue(source, 'P');
      if (target === 'beam' && axial != null) output.P = axial;
      const explicitNegativeMoment = finiteForceValue(source, 'MNeg');
      const directMoment = finiteForceValue(source, 'M');
      const signedMoment = directMoment != null ? directMoment : finiteForceValue(source, 'Mx');
      if (explicitNegativeMoment != null) {
        output.M = Math.abs(signedMoment || 0);
        output.MNeg = Math.abs(explicitNegativeMoment);
      } else if (signedMoment != null) {
        output.M = signedMoment >= 0 ? Math.abs(signedMoment) : 0;
        output.MNeg = signedMoment < 0 ? Math.abs(signedMoment) : 0;
      }
      const signedShear = finiteForceValue(source, 'V') ?? finiteForceValue(source, 'Vx');
      const signedTorsion = finiteForceValue(source, 'T');
      if (signedShear != null) output.V = Math.abs(signedShear);
      if (signedTorsion != null) output.T = Math.abs(signedTorsion);
      return output;
    }

    if (target === 'column-rect' || target === 'column-circ') {
      const output = {};
      const axial = finiteForceValue(source, 'P');
      const mx = finiteForceValue(source, 'Mx') ?? finiteForceValue(source, 'M');
      const vx = finiteForceValue(source, 'Vx') ?? finiteForceValue(source, 'V');
      if (axial != null) output.P = axial;
      if (mx != null) output.Mx = Math.abs(mx);
      if (vx != null) output.Vx = Math.abs(vx);
      if (target === 'column-rect') {
        const my = finiteForceValue(source, 'My');
        const vy = finiteForceValue(source, 'Vy');
        if (my != null) output.My = Math.abs(my);
        if (vy != null) output.Vy = Math.abs(vy);
      }
      return output;
    }

    return normalizeNumericMap(source) || {};
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
    const rawForces = normalizeNumericMap(payload.forces) || {};
    const adaptedForces = filterForTarget(rawForces, target);
    const safe = stashInternal({ ...payload, forces:adaptedForces, target }, rawForces);
    window.open(url, '_blank');
    return safe;
  }

  /**
   * 過濾 forces 只保留目標工具會用到的鍵
   */
  function filterForTarget(forces, target) {
    const adapted = adaptForTarget(forces, target);
    const keys = TARGET_KEYS[target] || Object.keys(adapted);
    const out = {};
    for (const k of keys) {
      if (adapted[k] != null && !isNaN(adapted[k])) out[k] = adapted[k];
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
    adaptForTarget,
    sendTo,
    validateCombination,
    filterForTarget,
  };
})(window);
