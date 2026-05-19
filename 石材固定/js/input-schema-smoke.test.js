// V2 input-schema 模組 smoke 測試
// 用法：node js/input-schema-smoke.test.js
'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const MODULE_PATH = path.join(__dirname, 'input-schema.spec.js');

// 在 vm context 載入（避免污染 Node 全域）
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(MODULE_PATH, 'utf8'), ctx, { filename: 'input-schema.spec.js' });

const Schema = ctx.StoneInputSchema || ctx.globalThis?.StoneInputSchema;
assert.ok(Schema, 'StoneInputSchema 應載入成功');
assert.ok(typeof Schema.validateAndNormalize === 'function', 'validateAndNormalize 應為函式');

let testNum = 0;
function test(name, fn) {
  testNum++;
  try {
    fn();
    console.log(`  ✓ [${testNum}] ${name}`);
  } catch (e) {
    console.error(`  ✗ [${testNum}] ${name}`);
    console.error(`     ${e.message}`);
    process.exitCode = 1;
  }
}

console.log(`StoneInputSchema ${Schema.VERSION} 測試開始`);
console.log('=' .repeat(60));

// ─── Test 1: 完整合法輸入 → 0 errors, 0 warnings（applied_defaults 可能含選填欄位）───
test('完整合法輸入：無 errors / 無 warnings', () => {
  const r = Schema.validateAndNormalize({
    inp: {
      st_t: 30, st_gam: 2800,
      w_v: 37.5, w_i: 1.0, w_neg: 341, w_pos: 426, w_cf: 1.25,
      s_sds: 0.6, s_ip: 1.0,
      m_fy: 2100, m_fya36: 2500,
      m_anc_type: 'SH-440', m_anc_fc: '280', m_anc_sf: 5,
      m_screw_ta: 255.3, m_anc_ta: 499.7,
      m_mc_va: 567, m_mc_ta: 709,
      m_pin_d: 4, m_pin_fy: 1350,
      sp_anchor_phi: 0.75
    },
    cases: [{
      name: 'TEST_01', w: 870, h: 800, type: 'pk_4h',
      fx: 150, fy1: 150, fy2: 200, bh: 10, H1: 5, d1: 2.5
    }]
  });
  assert.strictEqual(r.errors.length, 0, `應 0 errors，實際 ${r.errors.length}: ${JSON.stringify(r.errors)}`);
  assert.strictEqual(r.warnings.length, 0, `應 0 warnings，實際 ${r.warnings.length}: ${JSON.stringify(r.warnings)}`);
  assert.strictEqual(r.normalized.inp.st_t, 30);
  assert.strictEqual(r.normalized.cases[0].type, 'pk_4h');
});

// ─── Test 2: 缺欄位 + 有 default → 套用預設並 applied_defaults 記錄 ───
test('缺欄位 + 有 default → 自動填入並記錄', () => {
  const r = Schema.validateAndNormalize({
    inp: { /* 全部缺，全部用 default */ },
    cases: [{ /* 全部缺 */ }]
  });
  assert.ok(r.applied_defaults.length > 5, `applied_defaults 應 > 5（多個欄位用 default）`);
  // 但不應有 required_missing errors（因為都有 default）
  const reqErrors = r.errors.filter(e => e.code === 'required_missing');
  assert.strictEqual(reqErrors.length, 0, `不應有 required_missing 錯誤（因都有 default），實際 ${reqErrors.length}`);
  assert.strictEqual(r.normalized.inp.st_t, 30, '應套用 st_t default 30');
  assert.strictEqual(r.normalized.cases[0].w, 870, '應套用 case w default 870');
});

// ─── Test 3: 字串型數值 → coerce 成數值 ───
test('字串型數值 "37.5" → 自動 coerce 成 37.5', () => {
  const r = Schema.validateAndNormalize({
    inp: { st_t: '30', w_v: '37.5', s_sds: '0.6', w_neg: 341, w_pos: 426, w_i: 1.0 },
    cases: [{ w: '870', h: '800', type: 'pk_4h', fx: 150, fy1: 150, fy2: 200 }]
  });
  assert.strictEqual(r.normalized.inp.st_t, 30, 'string "30" 應 coerce 為 number');
  assert.strictEqual(r.normalized.inp.w_v, 37.5);
  assert.strictEqual(r.normalized.cases[0].w, 870);
});

// ─── Test 4: 型別無法解析 → error ───
test('型別錯誤（"abc"）→ 產生 type_error', () => {
  const r = Schema.validateAndNormalize({
    inp: { st_t: 'abc', w_v: 37.5 },
    cases: [{ w: 870, h: 800, type: 'pk_4h' }]
  });
  const typeErrors = r.errors.filter(e => e.code === 'type_error');
  assert.ok(typeErrors.length >= 1, `應有 type_error，實際 errors: ${JSON.stringify(r.errors)}`);
  const stTError = typeErrors.find(e => e.path === 'inp.st_t');
  assert.ok(stTError, 'st_t = "abc" 應產 type_error');
});

// ─── Test 5: enum 違反 → error ───
test('enum 違反（type="invalid_method"）→ enum_invalid error', () => {
  const r = Schema.validateAndNormalize({
    inp: { st_t: 30, st_gam: 2800, w_v: 37.5, w_i: 1.0, w_neg: 341, w_pos: 426 },
    cases: [{ w: 870, h: 800, type: 'invalid_method' }]
  });
  const enumErrors = r.errors.filter(e => e.code === 'enum_invalid');
  assert.ok(enumErrors.length >= 1, `應有 enum_invalid 錯誤，實際 errors: ${JSON.stringify(r.errors)}`);
});

// ─── Test 6: 範圍超出 → warning（不是 error）───
test('範圍超出（w_v = 200）→ range warning（非 error）', () => {
  const r = Schema.validateAndNormalize({
    inp: { st_t: 30, w_v: 200, w_i: 1.0, w_neg: 341, w_pos: 426, s_sds: 0.6 },
    cases: [{ w: 870, h: 800, type: 'pk_4h', fx: 150, fy1: 150, fy2: 200 }]
  });
  const rangeWarns = r.warnings.filter(w => w.code === 'range_above_max' || w.code === 'range_below_min');
  assert.ok(rangeWarns.length >= 1, `應有範圍 warning，實際 warnings: ${JSON.stringify(r.warnings)}`);
  // w_v = 200 應產 range_above_max（max 80），但不是 error
  const wvWarn = rangeWarns.find(w => w.path === 'inp.w_v');
  assert.ok(wvWarn, 'w_v = 200 應產生 range warning');
  // 不應為 error
  const wvErr = r.errors.find(e => e.path === 'inp.w_v');
  assert.ok(!wvErr, 'w_v = 200 不應為 error（範圍超出僅 warn）');
});

// ─── Test 7: 幾何衝突（fx*2 >= w）→ error ───
test('幾何衝突（fx*2 = 1000 ≥ w = 800）→ geometry_conflict error', () => {
  const r = Schema.validateAndNormalize({
    inp: { st_t: 30, w_v: 37.5, w_i: 1.0, w_neg: 341, w_pos: 426, s_sds: 0.6 },
    cases: [{ w: 800, h: 800, type: 'pk_4h', fx: 500, fy1: 150, fy2: 200 }]
  });
  const geoErrors = r.errors.filter(e => e.code === 'geometry_conflict');
  assert.ok(geoErrors.length >= 1, `應有 geometry_conflict，實際 errors: ${JSON.stringify(r.errors)}`);
});

// ─── Test 8: 空 cases → error ───
test('空 cases 陣列 → empty_cases error', () => {
  const r = Schema.validateAndNormalize({ inp: { st_t: 30 }, cases: [] });
  const emptyErr = r.errors.find(e => e.code === 'empty_cases');
  assert.ok(emptyErr, '空 cases 應產 empty_cases error');
});

// ─── Test 9: schema 外欄位 → 保留不丟棄 ───
test('schema 外欄位（如 cover_show_engineer_on）→ 原樣保留', () => {
  const r = Schema.validateAndNormalize({
    inp: { st_t: 30, w_v: 37.5, w_i: 1.0, w_neg: 341, w_pos: 426, s_sds: 0.6, cover_show_engineer_on: true },
    cases: [{ w: 870, h: 800, type: 'pk_4h', fx: 150, fy1: 150, fy2: 200, custom_extra_field: 'foo' }]
  });
  assert.strictEqual(r.normalized.inp.cover_show_engineer_on, true, 'schema 外欄位應原樣保留');
  assert.strictEqual(r.normalized.cases[0].custom_extra_field, 'foo', 'case schema 外欄位應原樣保留');
});

// ─── Test 10: 確定性 ── 同輸入兩次 normalize 結果應相等（hash 穩定）───
test('確定性：相同輸入重複呼叫產生相同 normalized', () => {
  const input = {
    inp: { st_t: 30, w_v: 37.5, w_i: 1.0, w_neg: 341, w_pos: 426, s_sds: 0.6 },
    cases: [{ w: 870, h: 800, type: 'pk_4h', fx: 150, fy1: 150, fy2: 200 }]
  };
  const r1 = Schema.validateAndNormalize(input);
  const r2 = Schema.validateAndNormalize(input);
  assert.deepStrictEqual(r1.normalized, r2.normalized, '相同輸入應產生相同 normalized 結果');
});

console.log('=' .repeat(60));
if (process.exitCode === 1) {
  console.log(`StoneInputSchema smoke test FAILED`);
  process.exit(1);
} else {
  console.log(`StoneInputSchema ${Schema.VERSION} smoke test passed (${testNum} tests).`);
}
