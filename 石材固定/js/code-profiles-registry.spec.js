// V2.1：規範 profile registry — 治理鏈第二環的延伸
//
// 設計目的：
//   - 把過去散落於 calc-core 的規範參數抽出為獨立 JSON profile
//   - 計算結果 meta 內含 active profiles 指紋，達到法規版本綁定
//   - Phase 1：骨架上線（profile 已可被讀取、寫入 meta、顯示於法規 footer）
//   - Phase 2 (TODO)：calc-core 真正消費 profile（取代 hardcoded 數值）
//
// 此檔可在瀏覽器與 Node.js 同時載入。

(function (root) {
  'use strict';

  const REGISTRY_VERSION = 'code-profiles-registry-2026.04.27-v1';
  // V3.0.0：StoneGovernanceProtocol 版本號 — 對應 dev_tools/StoneGovernanceProtocol-v1.0.md
  // 任何 protocol-compliant 工具於 result.meta.governance_protocol_version 寫入此值；
  // 用於跨工具 / 跨版本比對時確認治理欄位 schema 相容性
  const STONE_GOVERNANCE_PROTOCOL_VERSION = '1.0.0';

  // 預設 active profile（每個 scope 對應一個 profile id）
  // 業務上：每個專案可儲存自己的 active profile，舊案載入時沿用
  const DEFAULT_ACTIVE = Object.freeze({
    wind:    'cns_wind_107',
    seismic: 'cns_seismic_113',
    anchor:  'aci_318_appendix_d',
    steel:   'cns_steel_general',
    stone:   'cns_stone_general'
  });

  // profile 內容註冊表（Phase 1：先以 inline 物件保存，避免動態 fetch 在 file:// 失敗）
  // 內容必須與 js/code-profiles/*.json 一致；若有差異以 .json 為準
  const PROFILES = Object.freeze({
    cns_wind_107: Object.freeze({
      schema_version: '1.0.0',
      id: 'cns_wind_107',
      scope: 'wind',
      name: '建築物耐風設計規範及解說（107 年版）',
      issued: '2018-XX-XX',
      params: Object.freeze({
        I_categories: Object.freeze({ general: 1.0, important: 1.1, essential: 1.15 }),
        exposure_classes: Object.freeze(['A','B','C']),
        design_pressure_factor_default: 1.25,
        GCpi_enclosed: 0.18,
        GCpi_partial: 0.55,
        Cpe_zone_4_typical: 1.07,
        Cpe_zone_5_typical: 1.07
      })
    }),
    cns_seismic_113: Object.freeze({
      schema_version: '1.0.0',
      id: 'cns_seismic_113',
      scope: 'seismic',
      name: '建築物耐震設計規範及解說（113 年版）',
      issued: '2024-XX-XX',
      params: Object.freeze({
        Fph_simple_factor: 1.6,
        Fph_detailed_lower_factor: 0.3,
        Fph_detailed_upper_factor: 1.6,
        Fph_detailed_base_factor: 0.4,
        ap_default: 1.0,
        ap_rigid: 1.0,
        ap_flexible: 2.5,
        Rp_stone_panel_default: 2.5,
        Rp_rigid_component: 1.5,
        PEV_factor_conservative: 0.5,
        PEV_factor_standard: 0.2,
        Ip_categories: Object.freeze({ general: 1.0, important: 1.25, essential: 1.5 }),
        Ip_facade_minimum: 1.5
      })
    }),
    // V2.2.3：保守對照 profile — 同 113 年版規範依據，採較保守參數
    // 用途：工程設計階段對照保守邊界；正式簽證採用須附說明
    cns_seismic_113_conservative: Object.freeze({
      schema_version: '1.0.0',
      id: 'cns_seismic_113_conservative',
      scope: 'seismic',
      name: '建築物耐震設計規範（113 年版）— 保守對照',
      issued: '2024-XX-XX',
      params: Object.freeze({
        Fph_simple_factor: 1.6,
        Fph_detailed_lower_factor: 0.4,
        Fph_detailed_upper_factor: 1.6,
        Fph_detailed_base_factor: 0.4,
        ap_default: 1.0,
        ap_rigid: 1.0,
        ap_flexible: 2.5,
        Rp_stone_panel_default: 2.0,
        Rp_rigid_component: 1.5,
        PEV_factor_conservative: 0.5,
        PEV_factor_standard: 0.2,
        Ip_categories: Object.freeze({ general: 1.0, important: 1.25, essential: 1.5 }),
        Ip_facade_minimum: 1.5
      })
    }),
    aci_318_appendix_d: Object.freeze({
      schema_version: '1.0.0',
      id: 'aci_318_appendix_d',
      scope: 'anchor',
      name: 'ACI 318 Appendix D（混凝土結構用錨栓）',
      issued: '2014',
      params: Object.freeze({
        phi_steel: 0.75,
        phi_concrete_condition_a: 0.75,
        phi_concrete_condition_b: 0.65,
        psi_cN_uncracked: 1.25,
        psi_cN_cracked: 1.0,
        psi_cV_full_rebar: 1.4,
        psi_cV_edge_rebar: 1.2,
        psi_cV_no_rebar: 1.0,
        service_factor_typical: 1.6,
        interaction_exponent_steel: 5 / 3,
        min_anchor_diameter_mm: 4,
        min_anchor_length_mm: 75,
        min_embedment_mm: 40,
        min_edge_distance_mm: 25
      })
    }),
    cns_steel_general: Object.freeze({
      schema_version: '1.0.0',
      id: 'cns_steel_general',
      scope: 'steel',
      name: '鋼構造建築物鋼結構設計技術規範（容許應力設計法）',
      issued: null,
      params: Object.freeze({
        Fy_SUS304_default: 2100,
        Fy_A36_default: 2500,
        Fb_factor_static: 0.6,
        Fb_factor_with_wind_seismic: 1.25,
        Fv_factor: 0.4
      })
    }),
    cns_stone_general: Object.freeze({
      schema_version: '1.0.0',
      id: 'cns_stone_general',
      scope: 'stone',
      name: 'CNS 14448、CNS 6300 A1028 與 JASS 9 常用安全係數',
      issued: null,
      params: Object.freeze({
        // V2.2.0：marble / sandstone 容許值對齊 CONSTS.STONE_GRADE_CATALOG（CNS 14448 / CNS 6300 A1028 為依據）
        granite_grade1_fb: 70, granite_grade2_fb: 55, marble_fb: 35, sandstone_fb: 22,
        granite_grade1_ft: 45, granite_grade2_ft: 35, marble_ft: 22, sandstone_ft: 14,
        min_thickness_default_mm: 30,
        max_panel_area_default_m2: 1.0,
        back_anchor_cone_angle_deg_default: 30,
        thermal_alpha_stone_default: 8e-6,
        thermal_alpha_steel_default: 12e-6,
        thermal_delta_T_default: 40
      })
    })
  });

  // 由 inp.code_profiles 取出 active profile id；缺失時回退至 DEFAULT_ACTIVE
  function resolveActiveProfiles(inp) {
    const sel = (inp && inp.code_profiles) || {};
    const out = {};
    for (const scope of Object.keys(DEFAULT_ACTIVE)) {
      const id = sel[scope] || DEFAULT_ACTIVE[scope];
      out[scope] = id;
    }
    return out;
  }

  // 取出指定 profile 物件（不存在則返回 null）
  function getProfile(id) {
    return PROFILES[id] || null;
  }

  // 取出指定 scope 的目前 active profile 物件
  function getActiveProfile(inp, scope) {
    const active = resolveActiveProfiles(inp);
    return getProfile(active[scope]);
  }

  // 列出所有可用 profile（給 UI 切換器用）
  function listProfilesByScope(scope) {
    return Object.values(PROFILES).filter(p => p.scope === scope);
  }

  // 給匯出用：active profile ids + 名稱對照
  function buildActiveProfilesMeta(inp) {
    const active = resolveActiveProfiles(inp);
    const out = {};
    for (const [scope, id] of Object.entries(active)) {
      const p = getProfile(id);
      out[scope] = { id, name: p ? p.name : '(未知)', issued: p ? p.issued : null };
    }
    return out;
  }

  // V2.1 Phase 2 helper：取得指定 scope 內某 key 的參數值
  // 用法：const f = StoneCodeProfiles.getParam(inp, 'seismic', 'Fph_simple_factor', 1.6)
  // 若 active profile 內有此 key 回傳 profile 值；否則回傳 fallback（預設 hardcoded 數值）
  // 用 fallback 機制可保證即使 profile 缺失或未上線，calc-core 行為仍與從前一致
  function getParam(inp, scope, key, fallback) {
    try {
      const p = getActiveProfile(inp, scope);
      if (p && p.params && Object.prototype.hasOwnProperty.call(p.params, key)) {
        return p.params[key];
      }
    } catch (e) { /* swallow，用 fallback */ }
    return fallback;
  }

  // V2.4.1：profile params hash 歷史快照
  // 每次重大 profile 異動時，於此處新增一個 snapshot 條目
  // compareProfileHashWithArchive() 會以「最近 snapshot」為比較基準
  // 若某 profile 之 hash 與該 snapshot 不一致 → 標記「自 V2.X.Y 起已變動」
  const PROFILE_HASH_ARCHIVE = Object.freeze([
    Object.freeze({
      version: 'V2.4.0',
      date: '2026-04-28',
      note: '首批 archive：V2.4.0 上線時對所有 profile 取 cyrb53 指紋作為基準',
      hashes: Object.freeze({
        cns_wind_107:                  'cyrb53:17b5da32fdece2',
        cns_seismic_113:               'cyrb53:16d961ede8be9d',
        cns_seismic_113_conservative:  'cyrb53:13f5c547d3cd78',
        aci_318_appendix_d:            'cyrb53:1c6c15536a2ad1',
        cns_steel_general:             'cyrb53:1e704b3330bcff',
        cns_stone_general:             'cyrb53:1dfaff36620b45'
      })
    })
  ]);

  // V2.4.0：deterministic canonical JSON（鍵遞迴排序）
  // 用於對 profile.params 計算指紋；不同 key 順序產生相同 hash
  function _canonicalJSON(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(_canonicalJSON).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + _canonicalJSON(value[k])).join(',') + '}';
  }

  // V2.4.0：cyrb53 — 53-bit deterministic hash，碰撞率 ~0.0001%（足以做 governance fingerprint）
  // 同步、無依賴、可在 Node 與 browser 通用；產出 14 字元 hex
  function _cyrb53(str, seed) {
    seed = seed || 0;
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return n.toString(16).padStart(14, '0');
  }

  // V2.5.0：對任意字串產生 deterministic 指紋（cyrb53）— 暴露給 HTML 用於組合 governance fingerprint
  function computeFingerprint(str) {
    return 'cyrb53:' + _cyrb53(String(str || ''));
  }

  // V3.0.1：protocol compliance self-check — 給定 result.meta，驗證是否符合 StoneGovernanceProtocol v1.0
  // 用途：跨工具 / 跨版本驗證；外部稽核工具可呼叫此 helper 取得結構化合規報告
  // 回傳 { ok, version, errors[], warnings[], checks[] }
  function validateGovernanceMeta(meta) {
    const errors = [];
    const warnings = [];
    const checks = [];
    const _record = (label, ok, note) => {
      checks.push({ label, ok: !!ok, note: note || '' });
      return !!ok;
    };

    if (!meta || typeof meta !== 'object') {
      return { ok: false, version: null, errors: ['meta 不是物件'], warnings: [], checks: [] };
    }

    // 1. governance_protocol_version 必填且為 1.0.x
    const pv = meta.governance_protocol_version;
    if (!pv){
      errors.push('缺 governance_protocol_version');
      _record('protocol version 存在', false);
    } else if (!/^1\.0\.\d+$/.test(pv)){
      errors.push(`不支援的 protocol version：${pv}（本驗證器支援 1.0.x）`);
      _record('protocol version 為 1.0.x', false, pv);
    } else {
      _record('protocol version 為 1.0.x', true, pv);
    }

    // 2. SHA-256 欄位格式檢查（spec § 4.1）
    const sha256Fields = ['input_hash', 'normalized_input_hash', 'result_hash'];
    for (const f of sha256Fields){
      const v = meta[f];
      if (!v){
        warnings.push(`缺 ${f}（建議寫入）`);
        _record(`${f} 存在`, false, '(缺)');
      } else if (typeof v !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(v)){
        errors.push(`${f} 不符 SHA-256 格式：${v}`);
        _record(`${f} 格式正確`, false, v);
      } else {
        _record(`${f} 格式正確`, true);
      }
    }

    // 3. calc_source_hash（D1 工具）
    const csh = meta.calc_source_hash;
    if (!csh){
      warnings.push('calc_source_hash 為空（file:// 環境合理；http:// 環境應產生）');
      _record('calc_source_hash 存在', false, '(空，可能 file:// 環境)');
    } else if (!/^sha256:[0-9a-f]{64}$/.test(csh)){
      errors.push(`calc_source_hash 不符 SHA-256 格式：${csh}`);
      _record('calc_source_hash 格式正確', false, csh);
    } else {
      _record('calc_source_hash 格式正確', true);
    }

    // 4. code_profiles + code_profiles_hashes（D2 規範）
    const cp = meta.code_profiles;
    const cph = meta.code_profiles_hashes;
    if (!cp || typeof cp !== 'object'){
      errors.push('缺 code_profiles');
      _record('code_profiles 存在', false);
    } else {
      _record('code_profiles 存在', true, `${Object.keys(cp).length} scopes`);
    }
    if (!cph || typeof cph !== 'object'){
      errors.push('缺 code_profiles_hashes');
      _record('code_profiles_hashes 存在', false);
    } else {
      let allValid = true;
      for (const [scope, info] of Object.entries(cph)){
        if (!info?.hash || !/^cyrb53:[0-9a-f]{14}$/.test(info.hash)){
          allValid = false;
          errors.push(`code_profiles_hashes[${scope}].hash 不符 cyrb53 格式：${info?.hash}`);
        }
      }
      _record('code_profiles_hashes 全 cyrb53 格式', allValid, `${Object.keys(cph).length} scopes`);
    }

    // 5. governance_fingerprint（gov:14hex）
    const gfp = meta.governance_fingerprint;
    if (gfp && !/^gov:[0-9a-f]{14}$/.test(gfp)){
      errors.push(`governance_fingerprint 不符 gov: 格式：${gfp}`);
      _record('governance_fingerprint 格式正確', false, gfp);
    } else {
      _record('governance_fingerprint 格式正確', !!gfp || true, gfp || '(無，需 calc_source_hash)');
    }

    // 6. governance_ack_hash（ack:14hex；可為 null）
    const ackh = meta.governance_ack_hash;
    if (ackh && !/^ack:[0-9a-f]{14}$/.test(ackh)){
      errors.push(`governance_ack_hash 不符 ack: 格式：${ackh}`);
      _record('governance_ack_hash 格式正確', false, ackh);
    } else {
      _record('governance_ack_hash 格式正確', true, ackh || '(無 trigger / 為空)');
    }

    // 7. code_profiles_changelog 結構（D3 一致性）
    const cl = meta.code_profiles_changelog;
    if (cl && typeof cl === 'object'){
      const requiredKeys = ['ok', 'anyChanged', 'anyNew', 'perScope'];
      const missing = requiredKeys.filter(k => !(k in cl));
      if (missing.length){
        errors.push(`code_profiles_changelog 缺欄位：${missing.join(', ')}`);
        _record('changelog 結構完整', false, `缺 ${missing.join(', ')}`);
      } else {
        _record('changelog 結構完整', true);
      }
    } else {
      warnings.push('code_profiles_changelog 為空（archive 未啟用？）');
      _record('changelog 結構完整', false, '(空)');
    }

    // 8. 邏輯一致：governance_fingerprint 應僅當 calc_source_hash 存在時產出
    if (gfp && !csh){
      errors.push('governance_fingerprint 存在但 calc_source_hash 為空（違反 spec § 5.2）');
      _record('fingerprint 與 calc_source_hash 邏輯一致', false);
    } else {
      _record('fingerprint 與 calc_source_hash 邏輯一致', true);
    }

    // 9. 邏輯一致：ack 為空但 ack_hash 存在 → 必有 trigger（overrides/drifts 觸發）
    // 此項僅做 hint；無法從 meta 直接驗證 trigger 條件
    if (ackh && !meta.governance_ack){
      _record('ack hash 存在但文字空（合理：trigger 但未補述）', true);
    } else if (!ackh && meta.governance_ack){
      warnings.push('governance_ack 文字存在但 ack_hash 為空（不一致）');
      _record('ack 文字與 hash 一致', false);
    } else {
      _record('ack 文字與 hash 一致', true);
    }

    return {
      ok: errors.length === 0,
      version: pv || null,
      errors,
      warnings,
      checks,
    };
  }

  // V3.0.1：人讀合規摘要（用於 dashboard / CLI 顯示）
  function buildGovernanceComplianceBadge(meta) {
    const r = validateGovernanceMeta(meta);
    if (r.ok) return { ok: true, label: `✓ protocol ${r.version || '1.0.x'} compliant`, errors: [] };
    const errCount = r.errors.length;
    return {
      ok: false,
      label: `⚠ protocol 不合規（${errCount} 項錯誤）`,
      errors: r.errors,
    };
  }

  // V2.5.0：governance fingerprint — 把 calc_source_hash（SHA-256 of calc-core JS）
  // 與 code_profiles_hashes（cyrb53 per profile）合併為單一指紋
  // 用一個 14-hex 同時表達「工具版本 + 規範版本」之 governance state
  function buildGovernanceFingerprint(calcSourceHash, codeProfilesHashes) {
    if (!calcSourceHash) return null;
    const profileStr = codeProfilesHashes ? _canonicalJSON(codeProfilesHashes) : '';
    return 'gov:' + _cyrb53(calcSourceHash + '|' + profileStr);
  }

  // V2.8.0：governance acknowledgment hash — 三方雜湊綁定
  // 把（archive 比對結果 + 目前 active state + 技師 ack 文字）合成單一 hash
  // 用途：技師簽證後文字若被竄改 → hash 變動，可作匯出後防偽憑證
  // 結構：cyrb53(canonical({overrides, drifts, ackText}))
  // - overrides：採用之非預設 profile id 清單（排序）
  // - drifts：自最近 archive 起變動之 profile/scope 清單（含 archive→current hash）
  // - ackText：技師補充採用理由文字（trim 後）
  function buildGovernanceAckHash(inp) {
    try {
      const active = resolveActiveProfiles(inp || {});
      const overrides = [];
      for (const [scope, id] of Object.entries(active)) {
        const def = DEFAULT_ACTIVE[scope];
        if (def && id !== def) overrides.push({ scope, id });
      }
      overrides.sort((a, b) => a.scope.localeCompare(b.scope));

      const drifts = [];
      const archive = getLatestProfileArchive();
      if (archive) {
        for (const [scope, id] of Object.entries(active)) {
          const archiveHash = archive.hashes[id];
          const currentHash = getProfileParamsHash(id);
          if (archiveHash && currentHash && archiveHash !== currentHash) {
            drifts.push({ scope, id, archiveHash, currentHash });
          }
        }
        drifts.sort((a, b) => a.scope.localeCompare(b.scope));
      }

      const ackText = String((inp && inp.governance_ack) || '').trim();
      const triggered = overrides.length > 0 || drifts.length > 0;

      // 無 trigger 且無 ack 時不產生 hash（避免每份皆有 hash 造成噪音）
      if (!triggered && !ackText) return null;

      const payload = { overrides, drifts, ackText };
      return 'ack:' + _cyrb53(_canonicalJSON(payload));
    } catch (e) { return null; }
  }

  // V2.4.0：取得 profile params 之 deterministic 指紋
  // 用途：規範改版時 hash 變動，可寫入 result.meta 作 governance 追蹤
  function getProfileParamsHash(id) {
    const profile = PROFILES[id];
    if (!profile || !profile.params) return null;
    return 'cyrb53:' + _cyrb53(_canonicalJSON(profile.params));
  }

  // V2.4.0：所有 profile 的指紋對照表
  function getAllProfileHashes() {
    const out = {};
    for (const id of Object.keys(PROFILES)) {
      out[id] = getProfileParamsHash(id);
    }
    return out;
  }

  // V2.4.0：依目前 active 結果產出每 scope 的 profile 指紋
  // 用法：result.meta.code_profiles_hashes = StoneCodeProfiles.buildActiveProfileHashes(inp)
  function buildActiveProfileHashes(inp) {
    const active = resolveActiveProfiles(inp);
    const out = {};
    for (const [scope, id] of Object.entries(active)) {
      out[scope] = { id, hash: getProfileParamsHash(id) };
    }
    return out;
  }

  // V2.4.1：取得最新 archive snapshot
  function getLatestProfileArchive() {
    return PROFILE_HASH_ARCHIVE[PROFILE_HASH_ARCHIVE.length - 1] || null;
  }

  // V2.4.1：對單一 profile 比對「目前 hash」與「archive 中最新 hash」
  // 回傳 { changed: bool, currentHash, archiveHash, archiveVersion, archiveDate }
  function compareProfileHashWithArchive(id) {
    const currentHash = getProfileParamsHash(id);
    const archive = getLatestProfileArchive();
    if (!archive) return { changed: false, currentHash, archiveHash: null, archiveVersion: null, archiveDate: null };
    const archiveHash = archive.hashes[id] || null;
    return {
      changed: archiveHash !== null && archiveHash !== currentHash,
      newProfile: archiveHash === null && currentHash !== null,
      currentHash,
      archiveHash,
      archiveVersion: archive.version,
      archiveDate: archive.date
    };
  }

  // V2.4.1：對所有 active profile 走 compareProfileHashWithArchive
  // 回傳 { ok: bool, anyChanged: bool, perScope: { scope: {id, ...result} } }
  function buildActiveProfileChangelog(inp) {
    const active = resolveActiveProfiles(inp);
    const perScope = {};
    let anyChanged = false;
    let anyNew = false;
    for (const [scope, id] of Object.entries(active)) {
      const r = compareProfileHashWithArchive(id);
      perScope[scope] = { id, ...r };
      if (r.changed) anyChanged = true;
      if (r.newProfile) anyNew = true;
    }
    return { ok: !anyChanged, anyChanged, anyNew, perScope };
  }

  // V2.2.0：profile schema 驗證 — 檢查 profile 是否含必要欄位、scope 是否合法
  // 回傳 { ok: bool, errors: string[] }
  function validateProfile(profile) {
    const errors = [];
    if (!profile || typeof profile !== 'object') {
      return { ok: false, errors: ['profile 不是物件'] };
    }
    const requiredFields = ['schema_version', 'id', 'scope', 'name', 'params'];
    for (const f of requiredFields) {
      if (!Object.prototype.hasOwnProperty.call(profile, f)) {
        errors.push(`缺少必要欄位：${f}`);
      }
    }
    if (profile.scope && !Object.prototype.hasOwnProperty.call(DEFAULT_ACTIVE, profile.scope)) {
      errors.push(`未知 scope：${profile.scope}（合法：${Object.keys(DEFAULT_ACTIVE).join(', ')}）`);
    }
    if (profile.params && typeof profile.params !== 'object') {
      errors.push('params 必須為物件');
    }
    if (profile.schema_version && !/^\d+\.\d+\.\d+$/.test(profile.schema_version)) {
      errors.push(`schema_version 格式不符 SemVer：${profile.schema_version}`);
    }
    return { ok: errors.length === 0, errors };
  }

  // V2.2.0：所有已註冊 profile 的健全性檢查
  // 回傳 { ok: bool, results: [{id, ok, errors}] }
  function validateAllProfiles() {
    const results = [];
    let allOk = true;
    for (const [id, p] of Object.entries(PROFILES)) {
      const r = validateProfile(p);
      results.push({ id, ok: r.ok, errors: r.errors });
      if (!r.ok) allOk = false;
    }
    return { ok: allOk, results };
  }

  // V2.2.0：把外部 CONSTS 與 profile 對應 key 的差異列出
  // mapping 形如 { stone: { granite_grade2_fb: ['STONE_GRADE_CATALOG.granite_grade2.fb'] } }
  // 主要供啟動時自我檢查與測試使用，不阻擋執行
  function auditProfileAgainstConsts(profileId, mapping, CONSTS) {
    const profile = getProfile(profileId);
    if (!profile) return { ok: false, errors: [`profile ${profileId} 不存在`], diffs: [] };
    const diffs = [];
    for (const [key, paths] of Object.entries(mapping || {})) {
      if (!Object.prototype.hasOwnProperty.call(profile.params, key)) continue;
      const profileVal = profile.params[key];
      for (const path of paths) {
        // 解析 'STONE_GRADE_CATALOG.granite_grade2.fb' 形式
        const parts = path.split('.');
        let cur = CONSTS;
        for (const part of parts) {
          if (cur == null) break;
          cur = cur[part];
        }
        if (cur != null && cur !== profileVal) {
          diffs.push({ key, path, profileValue: profileVal, constsValue: cur });
        }
      }
    }
    return { ok: diffs.length === 0, diffs };
  }

  const api = Object.freeze({
    VERSION: REGISTRY_VERSION,
    GOVERNANCE_PROTOCOL_VERSION: STONE_GOVERNANCE_PROTOCOL_VERSION,
    DEFAULT_ACTIVE,
    PROFILES,
    resolveActiveProfiles,
    getProfile,
    getActiveProfile,
    listProfilesByScope,
    buildActiveProfilesMeta,
    getParam,
    validateProfile,
    validateAllProfiles,
    auditProfileAgainstConsts,
    getProfileParamsHash,
    getAllProfileHashes,
    buildActiveProfileHashes,
    PROFILE_HASH_ARCHIVE,
    getLatestProfileArchive,
    compareProfileHashWithArchive,
    buildActiveProfileChangelog,
    computeFingerprint,
    buildGovernanceFingerprint,
    buildGovernanceAckHash,
    validateGovernanceMeta,
    buildGovernanceComplianceBadge
  });

  if (typeof window !== 'undefined') window.StoneCodeProfiles = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined' && !globalThis.StoneCodeProfiles) globalThis.StoneCodeProfiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
