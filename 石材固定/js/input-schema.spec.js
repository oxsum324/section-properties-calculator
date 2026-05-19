// V2 治理鏈 #2：input schema validation
// 設計目的：把「raw input」轉成「normalized input」並驗證關鍵欄位完整性。
//   - errors  : 阻擋級（必填空、enum 違反、型別無法轉換）
//   - warnings: 提示級（範圍外、套用預設值、可疑配置）
// 此模組為純函式（無 DOM 依賴），可在瀏覽器與 Node.js 同樣載入。
//
// 用法（瀏覽器）：
//   const r = window.StoneInputSchema.validateAndNormalize({ inp: rawInp, cases: rawCases });
//   r.normalized = { inp, cases }
//   r.errors    = [{ path, code, message, raw_value }]
//   r.warnings  = [{ path, code, message, raw_value }]
//   r.applied_defaults = ['st_t', 'w_v', ...]
//
// 用法（Node）：
//   const { StoneInputSchema } = require('./input-schema.spec.js')(global);
//   或載入後讀 globalThis.StoneInputSchema

(function (root) {
  'use strict';

  const VERSION = 'input-schema-2026.04.27';

  // ─────────────────────────────────────────────────────────────
  // 欄位 schema 定義
  // 每個欄位至少需有 type；其他可選：min/max（數值）、options（enum）、default、required
  // 缺欄位 + 有 default → 自動填入並 warn 「applied_default」
  // 缺欄位 + 無 default + required → error
  // 數值超範圍 → warn（不 block，可能為刻意設計）
  // type 不對能 coerce → coerce + warn；無法 coerce → error
  // ─────────────────────────────────────────────────────────────
  const INP_SCHEMA = Object.freeze({
    // ─── 石材 ───
    st_t:    { type: 'number', min: 10,   max: 100,  default: 30,   unit: 'mm',     label: '石材厚度 t' },
    st_gam:  { type: 'number', min: 2000, max: 3500, default: 2800, unit: 'kgf/m³', label: '石材單位重 γ' },
    // ─── 風力 ───
    w_v:     { type: 'number', min: 20,   max: 80,   default: 37.5, unit: 'm/s',    label: '設計風速 V' },
    w_i:     { type: 'number', min: 0.5,  max: 2.0,  default: 1.0,                  label: '用途係數 I' },
    w_neg:   { type: 'number', min: 1,    max: 1500, default: 341,  unit: 'kgf/m²', label: '負風壓' },
    w_pos:   { type: 'number', min: 1,    max: 1500, default: 426,  unit: 'kgf/m²', label: '正風壓' },
    w_cf:    { type: 'number', min: 0.5,  max: 2.0,  default: 1.25,                 label: '載重組合係數' },
    // ─── 地震 ───
    s_sds:   { type: 'number', min: 0.1,  max: 2.0,  default: 0.6,                  label: 'SDS 短週期設計譜' },
    s_ip:    { type: 'number', min: 1.0,  max: 1.5,  default: 1.0,                  label: 'Ip 重要性係數',   required: false },
    // ─── 材料 ───
    m_fy:        { type: 'number', min: 1000, max: 5000, default: 2100, unit: 'kgf/cm²', label: 'SUS304 Fy' },
    m_fya36:     { type: 'number', min: 1000, max: 5000, default: 2500, unit: 'kgf/cm²', label: 'A36 Fy' },
    m_anc_type:  { type: 'enum', options: ['custom', 'SH-440', 'SH-550', 'SH-560', 'SH-660'], default: 'SH-440', label: '內迫膨脹螺栓型號' },
    m_anc_fc:    { type: 'enum', options: ['210', '280', 210, 280],  default: '280', label: '錨入混凝土 fc\'' },
    m_anc_sf:    { type: 'number', min: 1, max: 15,    default: 5,                  label: '錨栓安全係數 SF' },
    m_screw_ta:  { type: 'number', min: 0, max: 10000, default: 255.3, unit: 'kgf', label: '背扣螺絲 Ta' },
    m_anc_ta:    { type: 'number', min: 0, max: 10000, default: 499.7, unit: 'kgf', label: '內迫螺栓 Ta' },
    m_mc_va:     { type: 'number', min: 0, max: 10000, default: 567,   unit: 'kgf', label: '馬車螺栓 Va' },
    m_mc_ta:     { type: 'number', min: 0, max: 10000, default: 709,   unit: 'kgf', label: '馬車螺栓 Ta' },
    m_pin_d:     { type: 'number', min: 1, max: 20,    default: 4,     unit: 'mm',  label: '插銷直徑 d' },
    m_pin_fy:    { type: 'number', min: 500, max: 5000, default: 1350, unit: 'kgf/cm²', label: '插銷 Fy' },
    // ─── 規範附加 (僅關鍵旗標) ───
    sp_anchor_phi: { type: 'number', min: 0.4, max: 1.0, default: 0.75, label: 'φ 折減係數' },
  });

  const CASE_SCHEMA = Object.freeze({
    name:  { type: 'string', default: '', required: false,                                 label: '案例名稱' },
    w:     { type: 'number', min: 50,   max: 3000, default: 870,  unit: 'mm', label: '石材寬 W' },
    h:     { type: 'number', min: 50,   max: 3000, default: 800,  unit: 'mm', label: '石材高 H' },
    type:  { type: 'enum',
             options: ['bk_2','bk_4h','bk_6h','bk_6v','pk_4h','pk_6h','pk_4v','pk_6v'],
             default: 'pk_4h',
             label: '固定形式' },
    fx:    { type: 'number', min: 1, max: 1500, default: 150, unit: 'mm', label: '側邊距 fx' },
    fy1:   { type: 'number', min: 1, max: 1500, default: 150, unit: 'mm', label: '上邊距 fy1' },
    fy2:   { type: 'number', min: 1, max: 1500, default: 200, unit: 'mm', label: '下邊距 fy2' },
    bh:    { type: 'number', min: 1, max: 30,   default: 10,  unit: 'cm', label: 'H 總臂深',   required: false },
    H1:    { type: 'number', min: 1, max: 30,   default: 5,   unit: 'cm', label: 'H₁ 靠牆腳長', required: false },
    d1:    { type: 'number', min: 0.1, max: 30, default: 2.5, unit: 'cm', label: 'd₁ 螺栓偏心', required: false },
  });

  // ─────────────────────────────────────────────────────────────
  // 核心驗證函式
  // ─────────────────────────────────────────────────────────────
  function _coerceToNumber(value) {
    if (value === '' || value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function _coerceToString(value) {
    if (value == null) return null;
    return String(value);
  }

  function _validateField(path, raw, fieldSchema, errors, warnings, applied_defaults) {
    const required = fieldSchema.required !== false;  // 預設 required = true
    const present = raw !== undefined && raw !== null && raw !== '';

    // 1. 缺值處理
    if (!present) {
      if ('default' in fieldSchema) {
        applied_defaults.push(path);
        return fieldSchema.default;
      }
      if (required) {
        errors.push({
          path, code: 'required_missing',
          message: `必填欄位「${fieldSchema.label || path}」缺失`,
          raw_value: raw
        });
      }
      return null;
    }

    // 2. 型別驗證 + coerce
    if (fieldSchema.type === 'number') {
      const n = _coerceToNumber(raw);
      if (n === null) {
        errors.push({
          path, code: 'type_error',
          message: `欄位「${fieldSchema.label || path}」應為數值，無法解析`,
          raw_value: raw
        });
        return ('default' in fieldSchema) ? fieldSchema.default : null;
      }
      // 範圍檢查
      if (fieldSchema.min !== undefined && n < fieldSchema.min) {
        warnings.push({
          path, code: 'range_below_min',
          message: `${fieldSchema.label || path} = ${n} 低於建議最小值 ${fieldSchema.min}${fieldSchema.unit?' '+fieldSchema.unit:''}`,
          raw_value: n
        });
      }
      if (fieldSchema.max !== undefined && n > fieldSchema.max) {
        warnings.push({
          path, code: 'range_above_max',
          message: `${fieldSchema.label || path} = ${n} 高於建議最大值 ${fieldSchema.max}${fieldSchema.unit?' '+fieldSchema.unit:''}`,
          raw_value: n
        });
      }
      return n;
    }

    if (fieldSchema.type === 'enum') {
      const opts = fieldSchema.options || [];
      // 嘗試嚴格相等；其次轉字串相等
      const match = opts.find(o => o === raw || String(o) === String(raw));
      if (match === undefined) {
        errors.push({
          path, code: 'enum_invalid',
          message: `${fieldSchema.label || path} 「${raw}」不在合法選項內：${opts.join(' / ')}`,
          raw_value: raw
        });
        return ('default' in fieldSchema) ? fieldSchema.default : null;
      }
      return match;
    }

    if (fieldSchema.type === 'string') {
      return _coerceToString(raw);
    }

    if (fieldSchema.type === 'boolean') {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === 'on' || raw === '1' || raw === 1) return true;
      if (raw === 'false' || raw === 'off' || raw === '0' || raw === 0 || raw === '') return false;
      return Boolean(raw);
    }

    // 未知型別：原樣傳回（不阻擋，但記 warning）
    warnings.push({
      path, code: 'unknown_type',
      message: `${path} 未定義 schema 型別 ${fieldSchema.type}`,
      raw_value: raw
    });
    return raw;
  }

  function _validateObject(prefix, raw, schema, errors, warnings, applied_defaults) {
    const out = {};
    // schema 定義的欄位
    for (const key of Object.keys(schema)) {
      const fieldSchema = schema[key];
      const path = prefix ? `${prefix}.${key}` : key;
      out[key] = _validateField(path, raw ? raw[key] : undefined, fieldSchema, errors, warnings, applied_defaults);
    }
    // schema 外的欄位：原樣保留（不丟棄；可能是其他選用設定）
    if (raw && typeof raw === 'object') {
      for (const key of Object.keys(raw)) {
        if (!(key in schema)) {
          out[key] = raw[key];
        }
      }
    }
    return out;
  }

  /**
   * 驗證 + 正規化整個 input 物件（含 inp 與 cases[]）
   * @param {Object} raw - { inp: {...}, cases: [{...}, ...] } 或 { ...inp_fields, cases: [...] }
   * @returns {Object} { normalized, errors, warnings, applied_defaults, version }
   */
  function validateAndNormalize(raw) {
    const errors = [];
    const warnings = [];
    const applied_defaults = [];

    // 支援兩種輸入格式：
    //   (a) { inp: {...}, cases: [...] }      (V2 LocalStorage 結構)
    //   (b) { ...inp_fields..., cases: [...] } (舊版扁平結構)
    let rawInp, rawCases;
    if (raw && typeof raw === 'object' && raw.inp && typeof raw.inp === 'object') {
      rawInp = raw.inp;
      rawCases = raw.cases || [];
    } else {
      rawInp = raw || {};
      rawCases = (raw && raw.cases) || [];
    }

    const normalized_inp = _validateObject('inp', rawInp, INP_SCHEMA, errors, warnings, applied_defaults);

    let normalized_cases = [];
    if (!Array.isArray(rawCases)) {
      errors.push({ path: 'cases', code: 'type_error', message: 'cases 應為陣列', raw_value: rawCases });
    } else if (rawCases.length === 0) {
      errors.push({ path: 'cases', code: 'empty_cases', message: '至少需 1 組案例（cases 陣列為空）', raw_value: [] });
    } else {
      normalized_cases = rawCases.map((c, idx) =>
        _validateObject(`cases[${idx}]`, c, CASE_SCHEMA, errors, warnings, applied_defaults)
      );
      // 案例層級邏輯檢查（schema 無法表達）
      normalized_cases.forEach((c, idx) => {
        if (Number.isFinite(c.fx) && Number.isFinite(c.w) && c.fx * 2 >= c.w) {
          errors.push({
            path: `cases[${idx}]`, code: 'geometry_conflict',
            message: `案例 ${idx + 1}: 側邊距 fx (${c.fx}) × 2 ≥ 石材寬 W (${c.w})，固定點將重疊或超出邊界`,
            raw_value: { fx: c.fx, w: c.w }
          });
        }
        if (Number.isFinite(c.fy1) && Number.isFinite(c.fy2) && Number.isFinite(c.h) && (c.fy1 + c.fy2 >= c.h)) {
          errors.push({
            path: `cases[${idx}]`, code: 'geometry_conflict',
            message: `案例 ${idx + 1}: 上下邊距 fy1+fy2 (${c.fy1}+${c.fy2}) ≥ 石材高 H (${c.h})`,
            raw_value: { fy1: c.fy1, fy2: c.fy2, h: c.h }
          });
        }
      });
    }

    return {
      version: VERSION,
      normalized: { inp: normalized_inp, cases: normalized_cases },
      errors,
      warnings,
      applied_defaults
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 匯出
  // ─────────────────────────────────────────────────────────────
  const api = Object.freeze({
    VERSION,
    INP_SCHEMA,
    CASE_SCHEMA,
    validateAndNormalize
  });

  if (typeof window !== 'undefined') {
    window.StoneInputSchema = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined' && !globalThis.StoneInputSchema) {
    globalThis.StoneInputSchema = api;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
