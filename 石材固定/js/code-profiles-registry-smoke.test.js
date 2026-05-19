// V2.1 規範 profile registry smoke 測試
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const MODULE_PATH = path.join(__dirname, 'code-profiles-registry.spec.js');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(MODULE_PATH, 'utf8'), ctx, { filename: 'code-profiles-registry.spec.js' });

const Reg = ctx.StoneCodeProfiles || ctx.globalThis?.StoneCodeProfiles;
assert.ok(Reg, 'StoneCodeProfiles 應載入');
assert.ok(Reg.VERSION, 'VERSION 字串應存在');

let n = 0;
function test(name, fn){
  n++;
  try { fn(); console.log(`  ✓ [${n}] ${name}`); }
  catch(e){ console.error(`  ✗ [${n}] ${name}\n     ${e.message}`); process.exitCode = 1; }
}

console.log(`StoneCodeProfiles ${Reg.VERSION} 測試開始`);
console.log('='.repeat(60));

test('V3.0.0：StoneGovernanceProtocol 版本號暴露', () => {
  assert.ok(Reg.GOVERNANCE_PROTOCOL_VERSION, 'GOVERNANCE_PROTOCOL_VERSION 應暴露');
  assert.ok(/^\d+\.\d+\.\d+$/.test(Reg.GOVERNANCE_PROTOCOL_VERSION), `應符合 SemVer：${Reg.GOVERNANCE_PROTOCOL_VERSION}`);
  assert.strictEqual(Reg.GOVERNANCE_PROTOCOL_VERSION, '1.0.0', 'V3.0.0 對應 protocol 1.0.0');
});

test('V3.0.1：validateGovernanceMeta — 完整合規 meta 通過', () => {
  const meta = {
    governance_protocol_version: '1.0.0',
    input_hash: 'sha256:' + 'a'.repeat(64),
    normalized_input_hash: 'sha256:' + 'b'.repeat(64),
    result_hash: 'sha256:' + 'c'.repeat(64),
    calc_source_hash: 'sha256:' + 'd'.repeat(64),
    code_profiles: { wind: { id: 'cns_wind_107', name: '...' } },
    code_profiles_hashes: { wind: { id: 'cns_wind_107', hash: 'cyrb53:' + 'e'.repeat(14) } },
    governance_fingerprint: 'gov:' + 'f'.repeat(14),
    governance_ack_hash: 'ack:' + '1'.repeat(14),
    governance_ack: '理由',
    code_profiles_changelog: { ok: true, anyChanged: false, anyNew: false, perScope: {} },
  };
  const r = Reg.validateGovernanceMeta(meta);
  assert.strictEqual(r.ok, true, `應 ok=true，錯誤：${r.errors.join('; ')}`);
  assert.strictEqual(r.version, '1.0.0');
});

test('V3.0.1：validateGovernanceMeta — 缺 protocol_version 偵測', () => {
  const r = Reg.validateGovernanceMeta({});
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('governance_protocol_version')));
});

test('V3.0.1：validateGovernanceMeta — 不支援版本偵測', () => {
  const r = Reg.validateGovernanceMeta({ governance_protocol_version: '2.0.0' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('不支援的 protocol version')));
});

test('V3.0.1：validateGovernanceMeta — SHA-256 格式錯誤偵測', () => {
  const r = Reg.validateGovernanceMeta({
    governance_protocol_version: '1.0.0',
    input_hash: 'badhash',
    code_profiles: {},
    code_profiles_hashes: {},
  });
  assert.ok(r.errors.some(e => e.includes('input_hash 不符')));
});

test('V3.0.1：validateGovernanceMeta — 邏輯一致性違反（fingerprint without calc_source_hash）', () => {
  const r = Reg.validateGovernanceMeta({
    governance_protocol_version: '1.0.0',
    input_hash: 'sha256:' + 'a'.repeat(64),
    normalized_input_hash: 'sha256:' + 'b'.repeat(64),
    result_hash: 'sha256:' + 'c'.repeat(64),
    code_profiles: {},
    code_profiles_hashes: {},
    governance_fingerprint: 'gov:' + 'f'.repeat(14),
    // 缺 calc_source_hash
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('違反 spec § 5.2')));
});

test('V3.0.1：buildGovernanceComplianceBadge — 合規與不合規區分', () => {
  const okMeta = {
    governance_protocol_version: '1.0.0',
    input_hash: 'sha256:' + 'a'.repeat(64),
    normalized_input_hash: 'sha256:' + 'b'.repeat(64),
    result_hash: 'sha256:' + 'c'.repeat(64),
    calc_source_hash: 'sha256:' + 'd'.repeat(64),
    code_profiles: { wind: {} },
    code_profiles_hashes: { wind: { id: 'x', hash: 'cyrb53:' + 'e'.repeat(14) } },
  };
  const okBadge = Reg.buildGovernanceComplianceBadge(okMeta);
  assert.strictEqual(okBadge.ok, true);
  assert.ok(okBadge.label.includes('compliant'));

  const ngBadge = Reg.buildGovernanceComplianceBadge({});
  assert.strictEqual(ngBadge.ok, false);
  assert.ok(ngBadge.label.includes('不合規'));
  assert.ok(ngBadge.errors.length > 0);
});

test('5 個預設 profile 全部存在', () => {
  const ids = ['cns_wind_107','cns_seismic_113','aci_318_appendix_d','cns_steel_general','cns_stone_general'];
  for (const id of ids) {
    assert.ok(Reg.getProfile(id), `profile ${id} 應存在`);
  }
});

test('V2.2.3：cns_seismic_113_conservative 對照 profile 存在且差異正確', () => {
  const cons = Reg.getProfile('cns_seismic_113_conservative');
  assert.ok(cons, '對照 profile 應存在');
  assert.strictEqual(cons.scope, 'seismic');
  // 與 113 預設差異：lower 0.3→0.4、Rp 2.5→2.0
  assert.strictEqual(cons.params.Fph_detailed_lower_factor, 0.4);
  assert.strictEqual(cons.params.Rp_stone_panel_default, 2.0);
});

test('DEFAULT_ACTIVE 涵蓋 5 種 scope', () => {
  const expected = ['wind','seismic','anchor','steel','stone'];
  for (const s of expected) {
    assert.ok(Reg.DEFAULT_ACTIVE[s], `DEFAULT_ACTIVE.${s} 應存在`);
  }
});

test('resolveActiveProfiles 缺失 inp 回退至 default', () => {
  const r = Reg.resolveActiveProfiles({});
  assert.strictEqual(r.wind, 'cns_wind_107');
  assert.strictEqual(r.seismic, 'cns_seismic_113');
  assert.strictEqual(r.anchor, 'aci_318_appendix_d');
});

test('resolveActiveProfiles 從 inp.code_profiles 讀取覆寫', () => {
  const r = Reg.resolveActiveProfiles({ code_profiles: { wind: 'custom_wind' } });
  assert.strictEqual(r.wind, 'custom_wind');
  // 其他 scope 仍應回退至 default
  assert.strictEqual(r.seismic, 'cns_seismic_113');
});

test('getActiveProfile 可取得 scope 對應 profile 物件', () => {
  const seismic = Reg.getActiveProfile({}, 'seismic');
  assert.ok(seismic && seismic.id === 'cns_seismic_113');
  assert.strictEqual(seismic.params.Fph_simple_factor, 1.6);
  assert.strictEqual(seismic.params.Rp_stone_panel_default, 2.5);
});

test('Fph 上下限係數正確（耐震規範 113）', () => {
  const seismic = Reg.getProfile('cns_seismic_113');
  assert.strictEqual(seismic.params.Fph_detailed_lower_factor, 0.3);
  assert.strictEqual(seismic.params.Fph_detailed_upper_factor, 1.6);
  assert.strictEqual(seismic.params.Fph_detailed_base_factor, 0.4);
});

test('ACI Appendix D 折減係數正確', () => {
  const aci = Reg.getProfile('aci_318_appendix_d');
  assert.strictEqual(aci.params.phi_steel, 0.75);
  assert.strictEqual(aci.params.phi_concrete_condition_b, 0.65);
  assert.strictEqual(aci.params.psi_cV_full_rebar, 1.4);
  assert.strictEqual(aci.params.interaction_exponent_steel, 5 / 3);
});

test('V2.3.0：錨栓構造最小值（4 鍵齊備）', () => {
  const aci = Reg.getProfile('aci_318_appendix_d');
  assert.strictEqual(aci.params.min_anchor_diameter_mm, 4);
  assert.strictEqual(aci.params.min_anchor_length_mm, 75);
  assert.strictEqual(aci.params.min_embedment_mm, 40);
  assert.strictEqual(aci.params.min_edge_distance_mm, 25);
});

test('石材容許值正確（CNS 14448 / JASS 9）', () => {
  const stone = Reg.getProfile('cns_stone_general');
  assert.strictEqual(stone.params.granite_grade2_fb, 55);
  // V2.2.0：marble / sandstone 對齊 CONSTS.STONE_GRADE_CATALOG（CNS 為主）
  assert.strictEqual(stone.params.marble_fb, 35);
  assert.strictEqual(stone.params.marble_ft, 22);
  assert.strictEqual(stone.params.sandstone_fb, 22);
  assert.strictEqual(stone.params.sandstone_ft, 14);
  assert.strictEqual(stone.params.back_anchor_cone_angle_deg_default, 30);
});

test('listProfilesByScope 可依 scope 過濾', () => {
  const wind = Reg.listProfilesByScope('wind');
  assert.ok(wind.length >= 1);
  assert.ok(wind.every(p => p.scope === 'wind'));
  // V2.2.3：seismic scope 應有 >= 2 個 profile（含對照版）
  const seismic = Reg.listProfilesByScope('seismic');
  assert.ok(seismic.length >= 2, `seismic 候選應 >= 2，實際 ${seismic.length}`);
});

test('buildActiveProfilesMeta 產出 meta 寫入用結構', () => {
  const meta = Reg.buildActiveProfilesMeta({});
  assert.ok(meta.wind?.id === 'cns_wind_107');
  assert.ok(meta.wind?.name);
  assert.ok(meta.seismic?.id === 'cns_seismic_113');
  assert.ok(meta.seismic?.name);
});

test('getParam 回傳 profile 值（active profile 內含 key）', () => {
  // active seismic profile = cns_seismic_113，params.Fph_simple_factor = 1.6
  const v = Reg.getParam({}, 'seismic', 'Fph_simple_factor', 999);
  assert.strictEqual(v, 1.6, 'Fph_simple_factor 應從 cns_seismic_113 讀到 1.6');
});

test('getParam fallback：profile 未含 key 時回傳 fallback', () => {
  const v = Reg.getParam({}, 'seismic', 'NON_EXISTENT_KEY', 42);
  assert.strictEqual(v, 42, '不存在的 key 應回傳 fallback');
});

test('getParam fallback：scope 未識別時回傳 fallback', () => {
  const v = Reg.getParam({}, 'unknown_scope', 'any_key', 7);
  assert.strictEqual(v, 7);
});

test('getParam 隨 inp.code_profiles 切換 profile 值', () => {
  // 切到 active wind = cns_wind_107，design_pressure_factor_default = 1.25
  const v1 = Reg.getParam({}, 'wind', 'design_pressure_factor_default', 0);
  assert.strictEqual(v1, 1.25);
  // 故意覆寫到不存在的 profile
  const v2 = Reg.getParam({ code_profiles: { wind: 'no_such_profile' } }, 'wind', 'design_pressure_factor_default', 99);
  assert.strictEqual(v2, 99, 'profile 不存在時應 fallback');
});

test('validateProfile：合法 profile 通過驗證', () => {
  const seismic = Reg.getProfile('cns_seismic_113');
  const r = Reg.validateProfile(seismic);
  assert.strictEqual(r.ok, true, `應通過：${r.errors.join('; ')}`);
});

test('validateProfile：缺欄位 / 未知 scope / SemVer 錯誤皆能偵測', () => {
  const r1 = Reg.validateProfile({ id: 'x', scope: 'wind', name: 'x', params: {} });
  assert.strictEqual(r1.ok, false);
  assert.ok(r1.errors.some(e => e.includes('schema_version')));
  const r2 = Reg.validateProfile({ schema_version: '1.0.0', id: 'x', scope: 'unknown', name: 'x', params: {} });
  assert.strictEqual(r2.ok, false);
  assert.ok(r2.errors.some(e => e.includes('未知 scope')));
  const r3 = Reg.validateProfile({ schema_version: '1.0', id: 'x', scope: 'wind', name: 'x', params: {} });
  assert.strictEqual(r3.ok, false);
  assert.ok(r3.errors.some(e => e.includes('SemVer')));
});

test('validateAllProfiles：所有註冊 profile 全部通過', () => {
  const r = Reg.validateAllProfiles();
  assert.strictEqual(r.ok, true, `失敗 profile：${r.results.filter(x => !x.ok).map(x => x.id).join(', ')}`);
  // V2.2.3：6 個 profile（5 預設 + 1 對照）
  assert.ok(r.results.length >= 5, `應 >= 5，實際 ${r.results.length}`);
});

test('auditProfileAgainstConsts：石材 profile 與 STONE_GRADE_CATALOG 對齊', () => {
  // 模擬 CONSTS 結構
  const fakeCONSTS = {
    STONE_GRADE_CATALOG: {
      granite_grade1: { fb: 70, ft: 45 },
      granite_grade2: { fb: 55, ft: 35 },
      marble:         { fb: 35, ft: 22 },
      sandstone:      { fb: 22, ft: 14 },
    },
  };
  const mapping = {
    granite_grade1_fb: ['STONE_GRADE_CATALOG.granite_grade1.fb'],
    granite_grade2_fb: ['STONE_GRADE_CATALOG.granite_grade2.fb'],
    marble_fb:         ['STONE_GRADE_CATALOG.marble.fb'],
    sandstone_fb:      ['STONE_GRADE_CATALOG.sandstone.fb'],
    granite_grade1_ft: ['STONE_GRADE_CATALOG.granite_grade1.ft'],
    granite_grade2_ft: ['STONE_GRADE_CATALOG.granite_grade2.ft'],
    marble_ft:         ['STONE_GRADE_CATALOG.marble.ft'],
    sandstone_ft:      ['STONE_GRADE_CATALOG.sandstone.ft'],
  };
  const r = Reg.auditProfileAgainstConsts('cns_stone_general', mapping, fakeCONSTS);
  assert.strictEqual(r.ok, true, `差異：${JSON.stringify(r.diffs)}`);
});

test('auditProfileAgainstConsts：偵測得出差異', () => {
  const wrongCONSTS = {
    STONE_GRADE_CATALOG: { marble: { fb: 999 } },
  };
  const r = Reg.auditProfileAgainstConsts('cns_stone_general', {
    marble_fb: ['STONE_GRADE_CATALOG.marble.fb'],
  }, wrongCONSTS);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.diffs.length, 1);
  assert.strictEqual(r.diffs[0].profileValue, 35);
  assert.strictEqual(r.diffs[0].constsValue, 999);
});

test('profile JSON 檔與 inline 註冊內容一致（id 與 schema_version）', () => {
  const ids = ['cns_wind_107','cns_seismic_113','aci_318_appendix_d','cns_steel_general','cns_stone_general','cns_seismic_113_conservative'];
  for (const id of ids) {
    const jsonPath = path.join(__dirname, 'code-profiles', `${id}.json`);
    if (!fs.existsSync(jsonPath)) continue;  // 暫無 json 不阻擋
    const jsonObj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const inline = Reg.getProfile(id);
    assert.strictEqual(jsonObj.id, inline.id, `${id}: id 不一致`);
    assert.strictEqual(jsonObj.scope, inline.scope, `${id}: scope 不一致`);
    assert.strictEqual(jsonObj.schema_version, inline.schema_version, `${id}: schema_version 不一致`);
  }
});

test('V2.4.0：getProfileParamsHash 確定性（同 input 同 output）', () => {
  const h1 = Reg.getProfileParamsHash('cns_seismic_113');
  const h2 = Reg.getProfileParamsHash('cns_seismic_113');
  assert.strictEqual(h1, h2);
  assert.ok(typeof h1 === 'string' && h1.startsWith('cyrb53:'), `hash 格式錯誤：${h1}`);
  assert.strictEqual(h1.length, 7 + 14, 'cyrb53: prefix + 14 hex chars');
});

test('V2.4.0：getProfileParamsHash 不同 profile 產生不同 hash', () => {
  const h113 = Reg.getProfileParamsHash('cns_seismic_113');
  const hCons = Reg.getProfileParamsHash('cns_seismic_113_conservative');
  assert.notStrictEqual(h113, hCons, '不同 params 應產生不同 hash');
});

test('V2.4.0：getAllProfileHashes 涵蓋所有註冊 profile', () => {
  const all = Reg.getAllProfileHashes();
  const keys = Object.keys(all);
  assert.ok(keys.length >= 6, `應 >= 6 個 profile hash，實際 ${keys.length}`);
  assert.ok(keys.includes('cns_seismic_113'));
  assert.ok(keys.includes('cns_seismic_113_conservative'));
  for (const v of Object.values(all)) {
    assert.ok(v && v.startsWith('cyrb53:'));
  }
});

test('V2.4.0：buildActiveProfileHashes 產出 scope→{id,hash} map', () => {
  const r = Reg.buildActiveProfileHashes({});
  assert.ok(r.wind?.id === 'cns_wind_107');
  assert.ok(r.wind?.hash?.startsWith('cyrb53:'));
  assert.ok(r.seismic?.id === 'cns_seismic_113');
  assert.ok(r.seismic?.hash?.startsWith('cyrb53:'));
  // 切換對照後 hash 變動
  const rOverride = Reg.buildActiveProfileHashes({ code_profiles: { seismic: 'cns_seismic_113_conservative' } });
  assert.notStrictEqual(rOverride.seismic.hash, r.seismic.hash);
});

test('V2.4.1：archive 含 V2.4.0 baseline 與所有 6 個 profile', () => {
  const archive = Reg.getLatestProfileArchive();
  assert.ok(archive, 'archive 應存在');
  assert.strictEqual(archive.version, 'V2.4.0');
  assert.ok(archive.date);
  const ids = ['cns_wind_107','cns_seismic_113','cns_seismic_113_conservative','aci_318_appendix_d','cns_steel_general','cns_stone_general'];
  for (const id of ids) {
    assert.ok(archive.hashes[id], `archive 應含 ${id} 之 hash`);
  }
});

test('V2.4.1：compareProfileHashWithArchive — 未變動 profile changed=false', () => {
  // archive 與目前 inline 應一致（V2.4.0 上線時拍攝）
  const r = Reg.compareProfileHashWithArchive('cns_seismic_113');
  assert.strictEqual(r.changed, false, `應無變動，但 archive=${r.archiveHash} current=${r.currentHash}`);
  assert.strictEqual(r.archiveVersion, 'V2.4.0');
});

test('V2.4.1：compareProfileHashWithArchive — 未在 archive 之 profile newProfile=true', () => {
  // 假設未來新增一個未進 archive 的 profile，這裡用既有 id 模擬
  // 改為測試一個假 id 必須回傳 archiveHash=null
  const r = Reg.compareProfileHashWithArchive('non_existent_profile_id');
  assert.strictEqual(r.archiveHash, null);
  assert.strictEqual(r.changed, false, '不存在 profile 不應視為「變動」');
});

test('V2.4.1：buildActiveProfileChangelog 對預設 inp 應 anyChanged=false', () => {
  const r = Reg.buildActiveProfileChangelog({});
  assert.strictEqual(r.anyChanged, false, `應無變動，perScope=${JSON.stringify(r.perScope)}`);
  assert.strictEqual(r.ok, true);
  // 5 個 scope
  assert.strictEqual(Object.keys(r.perScope).length, 5);
});

test('V2.5.0：computeFingerprint 確定性 + 不同 input 不同 output', () => {
  const a = Reg.computeFingerprint('hello world');
  const b = Reg.computeFingerprint('hello world');
  const c = Reg.computeFingerprint('hello worlD');
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
  assert.ok(a.startsWith('cyrb53:'));
  assert.strictEqual(a.length, 7 + 14);
});

test('V2.5.0：buildGovernanceFingerprint 需 calc_source_hash 才產出', () => {
  const empty = Reg.buildGovernanceFingerprint(null, null);
  assert.strictEqual(empty, null);
  const withCalc = Reg.buildGovernanceFingerprint('sha256:abc', null);
  assert.ok(withCalc && withCalc.startsWith('gov:'));
  assert.strictEqual(withCalc.length, 4 + 14);
});

test('V2.5.0：buildGovernanceFingerprint 隨 calc_source_hash 或 profiles 變動而變', () => {
  const hashes1 = Reg.buildActiveProfileHashes({});
  const hashes2 = Reg.buildActiveProfileHashes({ code_profiles: { seismic: 'cns_seismic_113_conservative' } });
  const f1 = Reg.buildGovernanceFingerprint('sha256:abc', hashes1);
  const f2 = Reg.buildGovernanceFingerprint('sha256:abc', hashes2);
  const f3 = Reg.buildGovernanceFingerprint('sha256:def', hashes1);
  assert.notStrictEqual(f1, f2, '切換 profile 應變更 governance fingerprint');
  assert.notStrictEqual(f1, f3, '更動 calc_source_hash 應變更 governance fingerprint');
  // 同 input 應 deterministic
  const f1b = Reg.buildGovernanceFingerprint('sha256:abc', hashes1);
  assert.strictEqual(f1, f1b);
});

test('V2.8.0：buildGovernanceAckHash — 無 override 無 ack 時回 null', () => {
  const h = Reg.buildGovernanceAckHash({});
  assert.strictEqual(h, null, '無 trigger 應回 null');
});

test('V2.8.0：buildGovernanceAckHash — 切換對照 profile 後產生 hash', () => {
  const h = Reg.buildGovernanceAckHash({ code_profiles: { seismic: 'cns_seismic_113_conservative' } });
  assert.ok(h && h.startsWith('ack:'), `應為 ack:xxx 格式，實際 ${h}`);
  assert.strictEqual(h.length, 4 + 14);
});

test('V2.8.0：buildGovernanceAckHash — ack 文字變動 hash 也變動', () => {
  const inpA = { code_profiles: { seismic: 'cns_seismic_113_conservative' }, governance_ack: '理由 A' };
  const inpB = { code_profiles: { seismic: 'cns_seismic_113_conservative' }, governance_ack: '理由 B' };
  const hA = Reg.buildGovernanceAckHash(inpA);
  const hB = Reg.buildGovernanceAckHash(inpB);
  assert.notStrictEqual(hA, hB, '不同 ack 文字應產生不同 hash');
});

test('V2.8.0：buildGovernanceAckHash — 確定性（相同 input 相同 output）', () => {
  const inp = { code_profiles: { seismic: 'cns_seismic_113_conservative' }, governance_ack: '理由' };
  const h1 = Reg.buildGovernanceAckHash(inp);
  const h2 = Reg.buildGovernanceAckHash(inp);
  assert.strictEqual(h1, h2);
});

test('V2.8.0：buildGovernanceAckHash — 僅 ack 無 override 也產生 hash（用於 drift 場景）', () => {
  // 雖無 override 也無 drift（archive 對齊），但若 ack 非空也產生 hash 作為紀錄
  const h = Reg.buildGovernanceAckHash({ governance_ack: '無觸發但仍補充說明' });
  assert.ok(h && h.startsWith('ack:'));
});

test('V2.4.1：buildActiveProfileChangelog 對切換到對照 profile 也應 anyChanged=false（對照已在 archive）', () => {
  const r = Reg.buildActiveProfileChangelog({ code_profiles: { seismic: 'cns_seismic_113_conservative' } });
  assert.strictEqual(r.anyChanged, false);
  assert.strictEqual(r.perScope.seismic.id, 'cns_seismic_113_conservative');
});

test('V2.2.0：profile JSON 與 inline 之 params 數值一致（深入比對）', () => {
  // 不比對陣列 / 物件型 params（如 I_categories、exposure_classes），只比對 number / string
  const ids = ['cns_wind_107','cns_seismic_113','aci_318_appendix_d','cns_steel_general','cns_stone_general','cns_seismic_113_conservative'];
  for (const id of ids) {
    const jsonPath = path.join(__dirname, 'code-profiles', `${id}.json`);
    if (!fs.existsSync(jsonPath)) continue;
    const jsonObj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const inline = Reg.getProfile(id);
    if (!jsonObj.params || !inline.params) continue;
    for (const [k, v] of Object.entries(jsonObj.params)) {
      if (typeof v === 'number' || typeof v === 'string') {
        assert.strictEqual(inline.params[k], v, `${id}.params.${k}: JSON=${v} vs inline=${inline.params[k]}`);
      }
    }
  }
});

console.log('='.repeat(60));
if (process.exitCode === 1) {
  console.log(`StoneCodeProfiles smoke test FAILED`);
  process.exit(1);
} else {
  console.log(`StoneCodeProfiles ${Reg.VERSION} smoke test passed (${n} tests).`);
}
