window.StoneCalculator = (() => {
const VERSION = '2026.04.23-spec-core11';
  const CONSTS = window.STONE_CONSTANTS || {};
  const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯'];
  const MATERIALS = Object.fromEntries((CONSTS.MATERIAL_GRADE_OPTIONS || []).map((item) => [item.value, item]));
  const APPROVED_MATERIALS = new Set(
    (CONSTS.MATERIAL_GRADE_OPTIONS || []).filter((item) => item.approved).map((item) => item.value)
  );

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function bool(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value === 'true' || value === '1' || value === 'on';
    return Boolean(value);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function circled(index) {
    return CIRCLED[index - 1] || `(${index})`;
  }

  function inferCheckSense(formula, allow, extra = {}) {
    if (extra.sense) return extra.sense;
    const text = `${formula || ''} ${allow || ''}`;
    const hasMin = text.includes('≥') || text.includes('>=');
    const hasMax = text.includes('≤') || text.includes('<=');
    if (hasMin && hasMax) return 'range';
    if (hasMin) return 'min';
    return 'max';
  }

  function normalizedDcr(value, limit, sense = 'max', extra = {}) {
    const v = Number(value);
    const a = Number(limit);
    if (!Number.isFinite(v)) return null;
    if (sense === 'min') {
      return Number.isFinite(a) && a > 0 && v > 0 ? a / v : null;
    }
    if (sense === 'range') {
      const min = Number(extra.min);
      const max = Number(extra.max ?? limit);
      const ratios = [];
      if (Number.isFinite(min) && min > 0) ratios.push(v > 0 ? min / v : null);
      if (Number.isFinite(max) && max > 0) ratios.push(v / max);
      const finite = ratios.filter((ratio) => Number.isFinite(ratio));
      return finite.length ? Math.max(...finite) : null;
    }
    return Number.isFinite(a) && a > 0 ? v / a : null;
  }

  function row(item, formula, calc, allow, value, limit, unit, pass, extra = {}) {
    const sense = inferCheckSense(formula, allow, extra);
    const dcr = normalizedDcr(value, limit, sense, extra);
    return {
      item,
      formula,
      calc,
      allow,
      v: value,
      a: limit,
      unit,
      pass: Boolean(pass),
      label: `${item}：${formula} = ${calc}，容許值 ${allow}`,
      ...extra,
      sense,
      dcr,
    };
  }

  function renumber(rows) {
    return rows.map((entry, idx) => ({
      ...entry,
      no: circled(idx + 1),
    }));
  }

  function moduleOn(inp, key) {
    return bool(inp?.[key]);
  }

  function geometryRuleSource(inp) {
    return inp?.sp_geometry_source || 'combined';
  }

  function geometryRuleLabel(inp) {
    const source = geometryRuleSource(inp);
    const option = (CONSTS.GEOMETRY_RULE_OPTIONS || []).find((item) => item.value === source);
    return option?.label || source;
  }

  function panelLocalMode(inp, cd) {
    const selected = inp?.sp_panel_local_mode || 'auto';
    if (selected === 'auto') {
      return String(cd?.type || '').startsWith('bk_') ? 'cone' : 'ring';
    }
    return selected;
  }

  function panelLocalModeLabel(mode) {
    const option = (CONSTS.PANEL_LOCAL_MODE_OPTIONS || []).find((item) => item.value === mode);
    return option?.label || mode;
  }

  function angleSectionMode(inp, cd) {
    if (!moduleOn(inp, 'sp_angle_on')) return 'rect_plate';
    return cd?.angle_section_mode || 'l_angle_composite';
  }

  function angleSectionModeLabel(mode) {
    const option = (CONSTS.ANGLE_SECTION_OPTIONS || []).find((item) => item.value === mode);
    return option?.label || mode;
  }

  function concreteState(inp) {
    return inp?.sp_concrete_crack === 'noncracked' ? 'noncracked' : 'cracked';
  }

  function psiFactors(inp) {
    if (!moduleOn(inp, 'sp_psicv_on')) {
      return {
        psiCv: 1.0,
        psiCn: 1.0,
        basisLabel: '未啟用 ψc 模組',
        cracked: null,
        note: '未啟用混凝土開裂修正係數模組。',
        tensionUsesShared: false,
      };
    }

    // V2.1.1：ψc 係數改由 profile（active = aci_318_appendix_d）取得，CONSTS 為 fallback
    const _profilesPsi = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const _gp = (key, fallback) => _profilesPsi ? _profilesPsi.getParam(inp, 'anchor', key, fallback) : fallback;

    const cracked = concreteState(inp) === 'cracked';
    const aciCategory = Math.max(1, Math.round(toNumber(inp?.sp_anchor_aci_category, 1)));
    if (!cracked) {
      const psiCnUncracked = _gp('psi_cN_uncracked', toNumber(CONSTS.PSI_CN?.noncracked, 1.25));
      const psiCvUncracked = _gp('psi_cV_full_rebar', 1.4);
      const psiCn = aciCategory === 1 ? psiCnUncracked : 1.0;
      return {
        psiCv: psiCvUncracked,
        psiCn,
        basisLabel: `未開裂混凝土＋ACI 355.2 Category ${aciCategory}（ψc,N = ${psiCn.toFixed(2)}；ψc,V = ${psiCvUncracked.toFixed(2)}）`,
        cracked: false,
        note: `未開裂混凝土：剪力採 ψc,V = ${psiCvUncracked.toFixed(2)}；拉力依 ACI 355.2 Category ${aciCategory} 採 ψc,N = ${psiCn.toFixed(2)}。`,
        tensionUsesShared: false,
        aciCategory,
      };
    }

    const key = inp?.sp_rebar_support || 'none';
    const label = CONSTS.PSI_CV_LABEL?.[key] || key;
    // 將 CONSTS.PSI_CV[key] 對應至 profile key
    const psiCvProfileKey = key === 'full_rebar' ? 'psi_cV_full_rebar'
      : key === 'edge_rebar' ? 'psi_cV_edge_rebar'
      : 'psi_cV_no_rebar';
    const psiCv = _gp(psiCvProfileKey, toNumber(CONSTS.PSI_CV?.[key], 1.0));
    const psiCn = _gp('psi_cN_cracked', toNumber(CONSTS.PSI_CN?.cracked, 1.0));
    return {
      psiCv,
      psiCn,
      basisLabel: `開裂混凝土＋${label}（ψc,N = ${psiCn.toFixed(2)}）`,
      cracked: true,
      note: `開裂混凝土：剪力採 ψc,V = ${psiCv.toFixed(2)}（${label}）；拉力採 ψc,N = ${psiCn.toFixed(2)}。`,
      tensionUsesShared: false,
      aciCategory,
    };
  }

  function psiCvValue(inp) {
    return psiFactors(inp).psiCv;
  }

  function psiCvLabel(inp) {
    return psiFactors(inp).basisLabel;
  }

  function effectiveIp(inp) {
    const selected = toNumber(inp?.s_ip_raw ?? inp?.s_ip, 1.0);
    if (!moduleOn(inp, 'sp_ip15_on')) return selected;
    // V2.1.2：外牆 Ip 最小值由 profile（cns_seismic_113）取得
    const _profilesIp = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const ipFacadeMin = _profilesIp ? _profilesIp.getParam(inp, 'seismic', 'Ip_facade_minimum', 1.5) : 1.5;
    return Math.max(selected, toNumber(inp?.sp_ip_default, ipFacadeMin));
  }

  function effectiveAncDiameterMm(inp) {
    const custom = toNumber(inp?.sp_custom_anchor_d_mm, 0);
    if (custom > 0) return custom;
    const type = inp?.m_anc_type || 'custom';
    const spec = CONSTS.ANCHOR_CATALOG?.[type];
    return toNumber(spec?.holeMm, 0);
  }

  function anchorCapacity(inp) {
    const type = inp?.m_anc_type || 'custom';
    const fc = toNumber(inp?.m_anc_fc, 280);
    const sf = Math.max(1, toNumber(inp?.m_anc_sf, 5));
    const vendorTa = toNumber(inp?.m_anc_ta, 0);
    const spec = CONSTS.ANCHOR_CATALOG?.[type];
    // V2.1.1：φ 折減係數與 service factor 由 profile（ACI 318 Appendix D）取得
    const _profilesPhi = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const phiDefault = _profilesPhi ? _profilesPhi.getParam(inp, 'anchor', 'phi_steel', 0.75) : 0.75;
    const serviceFactorDefault = _profilesPhi ? _profilesPhi.getParam(inp, 'anchor', 'service_factor_typical', 1.6) : 1.6;
    const phi = Math.max(0.1, toNumber(inp?.sp_anchor_phi, phiDefault));
    const psi = psiFactors(inp);
    const serviceFactor = Math.max(1.0, toNumber(inp?.sp_anchor_service_factor, serviceFactorDefault));
    const mode = moduleOn(inp, 'sp_anchor_on') ? (inp?.sp_anchor_design_mode || 'dual_compare') : 'vendor_sf';

    let ultimateTension = 0;
    let ultimateShear = 0;
    if (spec?.Nu?.[fc]) ultimateTension = toNumber(spec.Nu[fc]);
    if (spec?.Vu?.[fc]) ultimateShear = toNumber(spec.Vu[fc]);
    if (!ultimateTension && vendorTa > 0) ultimateTension = vendorTa * sf;
    if (!ultimateShear && ultimateTension > 0) ultimateShear = ultimateTension;

    const vendorAllow = vendorTa || (ultimateTension ? ultimateTension / sf : 0);
    const vendorAllowShear = ultimateShear ? ultimateShear / sf : (vendorAllow || 0);
    const appendixTensionAvailable = ultimateTension > 0;
    const appendixShearAvailable = ultimateShear > 0;
    const appendixAvailable = appendixTensionAvailable;
    const appendixTensionService = ultimateTension ? (ultimateTension * phi * psi.psiCn) / serviceFactor : 0;
    const appendixShearService = ultimateShear ? (ultimateShear * phi * psi.psiCv) / serviceFactor : 0;

    let governingTa = vendorAllow;
    let governingVa = vendorAllowShear;
    let basis = '廠商試驗 SF 法';
    let basisShear = '廠商試驗 SF 法';
    let warning = false;
    if (mode === 'appendix_d' && appendixTensionService > 0) {
      governingTa = appendixTensionService;
      basis = '附篇 D 等效服務值';
    } else if (mode === 'dual_compare' && appendixTensionService > 0) {
      governingTa = Math.min(vendorAllow || Number.POSITIVE_INFINITY, appendixTensionService);
      basis = '雙軌比較取較保守者';
    } else if (mode !== 'vendor_sf' && !appendixTensionAvailable) {
      basis = mode === 'appendix_d'
        ? '附篇 D 模式不可用，退回廠商試驗 SF 法'
        : '雙軌模式缺 Nu 資料，退回廠商試驗 SF 法';
      warning = true;
    }
    if (mode === 'appendix_d' && appendixShearService > 0) {
      governingVa = appendixShearService;
      basisShear = '附篇 D 等效服務值';
    } else if (mode === 'dual_compare' && appendixShearService > 0) {
      governingVa = Math.min(vendorAllowShear || Number.POSITIVE_INFINITY, appendixShearService);
      basisShear = '雙軌比較取較保守者';
    } else if (mode !== 'vendor_sf' && !appendixShearAvailable) {
      basisShear = mode === 'appendix_d'
        ? '附篇 D 剪力資料不足，退回廠商試驗 SF 法'
        : '雙軌模式缺 Vu 資料，退回廠商試驗 SF 法';
      warning = true;
    }
    if (!Number.isFinite(governingTa)) governingTa = appendixTensionService || vendorAllow || 0;
    if (!Number.isFinite(governingVa)) governingVa = appendixShearService || vendorAllowShear || governingTa || 0;

    const compareRatio = vendorAllow > 0 ? appendixTensionService / vendorAllow : null;
    const shearCompareRatio = vendorAllowShear > 0 ? appendixShearService / vendorAllowShear : null;
    const fallbackNotes = [];
    if (mode !== 'vendor_sf' && !appendixTensionAvailable) fallbackNotes.push('Nu');
    if (mode !== 'vendor_sf' && !appendixShearAvailable) fallbackNotes.push('Vu');
    const equivalentNote = appendixAvailable
      ? `拉力等效服務值 = φ·Nu·ψc,N ÷ ${serviceFactor.toFixed(2)} = ${appendixTensionService.toFixed(1)} kgf；`
        + ` 剪力等效服務值 = φ·Vu·ψc,V ÷ ${serviceFactor.toFixed(2)} = ${appendixShearService.toFixed(1)} kgf；`
        + ` 廠商 SF 法（拉力 / 剪力）= ${vendorAllow.toFixed(1)} / ${vendorAllowShear.toFixed(1)} kgf。`
        + `${psi.note} 本工具 Nu / Vu 採廠商報告之最小值，視為已包絡鋼材拉力、混凝土錐形、拉出與側爆等破壞模式。`
        + ` ${mode === 'dual_compare' ? '雙軌模式採較保守值。' : '供保守性比較參考。'}`
        + `${fallbackNotes.length ? ` ${fallbackNotes.join(' / ')} 資料不足時，對應項目已退回廠商試驗 SF 法。` : ''}`
      : '缺少 Nu / Vu 極限資料，附篇 D 模式不可用，已退回廠商試驗 SF 法。';
    const torqueNm = spec?.torqueNm != null ? toNumber(spec.torqueNm, 0) : toNumber(inp?.sp_custom_torque_nm, 0);
    const embedMm = spec?.embedMm != null ? toNumber(spec.embedMm, 0) : toNumber(inp?.sp_custom_anchor_embed_mm, 0);
    const lengthMm = spec?.lengthMm != null ? toNumber(spec.lengthMm, 0) : toNumber(inp?.sp_custom_anchor_length_mm, 0);

    return {
      type,
      fc,
      sf,
      phi,
      psiCv: psi.psiCv,
      psiCn: psi.psiCn,
      psiCvLabel: psiCvLabel(inp),
      psiBasisLabel: psi.basisLabel,
      psiNote: psi.note,
      serviceFactor,
      vendorAllow,
      vendorAllowShear,
      appendixAvailable,
      appendixTensionAvailable,
      appendixShearAvailable,
      appendixTensionService,
      appendixShearService,
      governingTa,
      governingVa,
      basis,
      basisShear,
      mode,
      warning,
      ultimateTension,
      ultimateShear,
      compareRatio,
      shearCompareRatio,
      equivalentNote,
      torqueNm,
      embedMm,
      lengthMm,
      diameterMm: effectiveAncDiameterMm(inp),
    };
  }

  function anchorGroupReduction(cd, inp, anchor) {
    const baseTa = toNumber(anchor?.governingTa, 0);
    const baseVa = toNumber(anchor?.governingVa, baseTa);
    if (!moduleOn(inp, 'sp_anchor_group_on')) {
      return {
        enabled: false,
        reducedTa: baseTa,
        reducedVa: baseVa,
        tensionFactor: 1.0,
        shearFactor: 1.0,
        note: '',
      };
    }

    const hefMm = Math.max(0, toNumber(anchor?.embedMm, toNumber(inp?.sp_custom_anchor_embed_mm, 0)));
    const spacingMm = Math.max(0, toNumber(cd?.anchor_spacing_mm, 0));
    const edgeMm = Math.max(0, toNumber(cd?.anchor_edge_mm, toNumber(inp?.sp_custom_anchor_edge_mm, 0)));
    const anchorCount = Math.max(1, toNumber(cd?.N, CONSTS.TYPE_N?.[cd?.type] || 4));
    const groupApplicable = anchorCount > 1 && spacingMm > 0;
    if (hefMm <= 0) {
      return {
        enabled: true,
        hefMm,
        spacingMm,
        edgeMm,
        anOverAnco: 1.0,
        avOverAvco: 1.0,
        psiEdN: 1.0,
        psiEdV: 1.0,
        tensionFactor: 1.0,
        shearFactor: 1.0,
        reducedTa: baseTa,
        reducedVa: baseVa,
        note: '錨栓群組／邊距折減已啟用，但目前缺少有效埋深 hef，暫未折減。',
      };
    }

    const anOverAnco = groupApplicable
      ? clamp((3 * hefMm + spacingMm) / Math.max(6 * hefMm, 0.1), 0.5, 1)
      : 1.0;
    const avOverAvco = groupApplicable
      ? clamp((3 * hefMm + spacingMm) / Math.max(6 * hefMm, 0.1), 0.5, 1)
      : 1.0;
    const psiEdN = edgeMm >= 1.5 * hefMm
      ? 1.0
      : clamp(0.7 + 0.3 * edgeMm / Math.max(1.5 * hefMm, 0.1), 0.7, 1.0);
    const psiEdV = edgeMm >= 1.5 * hefMm
      ? 1.0
      : clamp(0.7 + 0.3 * edgeMm / Math.max(1.5 * hefMm, 0.1), 0.7, 1.0);
    const tensionFactor = clamp(anOverAnco * psiEdN, 0.35, 1);
    const shearFactor = clamp(avOverAvco * psiEdV, 0.35, 1);
    const reducedTa = baseTa * tensionFactor;
    const reducedVa = baseVa * shearFactor;

    return {
      enabled: true,
      hefMm,
      spacingMm,
      edgeMm,
      anOverAnco,
      avOverAvco,
      psiEdN,
      psiEdV,
      tensionFactor,
      shearFactor,
      reducedTa,
      reducedVa,
      note: `錨栓群組／邊距折減：hef = ${hefMm.toFixed(1)} mm，s = ${spacingMm.toFixed(1)} mm，c1 = ${edgeMm.toFixed(1)} mm；`
        + ` ${groupApplicable ? `AN/ANco = ${anOverAnco.toFixed(3)}` : '單錨栓或未輸入群組間距，群組投影面積比未折減（AN/ANco = 1.000）'}、ψed,N = ${psiEdN.toFixed(3)}，`
        + ` ${groupApplicable ? `AVc/AVco = ${avOverAvco.toFixed(3)}` : '剪力群組投影面積比未折減（AVc/AVco = 1.000）'}、ψed,V = ${psiEdV.toFixed(3)}（剪力暫採與拉力同式保守估算）；`
        + ` 服務值折減後 Ta / Va = ${reducedTa.toFixed(1)} / ${reducedVa.toFixed(1)} kgf。`,
    };
  }

  function clearSpanMm(cd) {
    const w = toNumber(cd?.w, 0);
    const h = toNumber(cd?.h, 0);
    const fx = toNumber(cd?.fx, 0);
    const fy1 = toNumber(cd?.fy1, 0);
    const fy2 = toNumber(cd?.fy2, 0);
    const type = String(cd?.type || '');
    let spanX = Math.max(50, w - fx * 2);
    let spanY = Math.max(50, h - fy1 - fy2);
    if (/^pk_.*h$/.test(type)) spanY = Math.max(50, h);
    if (/^pk_.*v$/.test(type)) spanX = Math.max(50, w);
    return { spanX, spanY };
  }

  function rectSectionResult(legOut, t, d0, extra = {}) {
    return {
      mode: 'rect_plate',
      modeLabel: angleSectionModeLabel('rect_plate'),
      area: legOut * t,
      shearArea: Math.max(0.01, Math.max(0.1, legOut - d0) * t),
      sectionModulus: (1 / 6) * legOut * t * t,
      axisLabel: '矩形板近似',
      Sx: null,
      Sy: null,
      ...extra,
    };
  }

  function sectionProperties(cd, inp) {
    const legOut = Math.max(0.1, toNumber(cd?.LL, 5));
    const legWall = Math.max(0.1, toNumber(cd?.H1, 5));
    const t = Math.max(0.1, toNumber(cd?.Lt, 0.5));
    const d0 = Math.max(0, toNumber(cd?.d0, 1.2));
    const mode = angleSectionMode(inp, cd);
    if (mode !== 'l_angle_composite') {
      return rectSectionResult(legOut, t, d0);
    }

    if (legWall <= t || legOut <= t) {
      return rectSectionResult(legOut, t, d0, {
        fallbackRect: true,
        requestedMode: mode,
        axisLabel: 'L 型角鋼輸入不成立，退回矩形板近似',
        fallbackNote: '角鋼腳長需大於板厚；已退回矩形板近似以避免非實際斷面模數。',
      });
    }

    const webHeight = Math.max(0, legWall - t);
    const area1 = legOut * t;
    const area2 = t * webHeight;
    const area = area1 + area2;
    const shearArea = Math.max(0.01, Math.max(0.1, legOut - d0) * t);
    const x1 = legOut / 2;
    const y1 = t / 2;
    const x2 = t / 2;
    const y2 = t + webHeight / 2;
    const xBar = (area1 * x1 + area2 * x2) / area;
    const yBar = (area1 * y1 + area2 * y2) / area;
    const ix1 = legOut * Math.pow(t, 3) / 12;
    const ix2 = t * Math.pow(webHeight, 3) / 12;
    const iy1 = t * Math.pow(legOut, 3) / 12;
    const iy2 = webHeight * Math.pow(t, 3) / 12;
    const Ix = ix1 + area1 * Math.pow(y1 - yBar, 2) + ix2 + area2 * Math.pow(y2 - yBar, 2);
    const Iy = iy1 + area1 * Math.pow(x1 - xBar, 2) + iy2 + area2 * Math.pow(x2 - xBar, 2);
    const sxt = Ix / Math.max(0.1, legWall - yBar);
    const sxb = Ix / Math.max(0.1, yBar);
    const syl = Iy / Math.max(0.1, xBar);
    const syr = Iy / Math.max(0.1, legOut - xBar);
    const Sx = Math.min(sxt, sxb);
    const Sy = Math.min(syl, syr);
    const sectionModulus = Math.min(Sx, Sy);
    if (!Number.isFinite(sectionModulus) || sectionModulus <= 0) {
      return rectSectionResult(legOut, t, d0, {
        fallbackRect: true,
        requestedMode: mode,
        axisLabel: 'L 型角鋼合成斷面計算異常，退回矩形板近似',
        fallbackNote: '合成斷面計算結果無效；已退回矩形板近似。',
      });
    }
    const axisLabel = Sx <= Sy ? 'L 型角鋼合成斷面（x 軸控制）' : 'L 型角鋼合成斷面（y 軸控制）';

    return {
      mode,
      modeLabel: angleSectionModeLabel(mode),
      area,
      shearArea,
      sectionModulus,
      axisLabel,
      Sx,
      Sy,
      xBar,
      yBar,
      Ix,
      Iy,
      fallbackRect: false,
    };
  }

  function seismicDemand(inp, Wp, ipEff) {
    const sds = Math.max(0, toNumber(inp?.s_sds, 0.6));
    const ip = Math.max(0.1, toNumber(ipEff, effectiveIp(inp)));
    // V2.1 Phase 2 demo：規範參數從 active code-profile 讀取，缺失時 fallback 至 hardcoded 預設
    // 未來規範修訂時只需更新 js/code-profiles/cns_seismic_*.json，calc-core 邏輯不動
    const _profiles = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const fphLowerFactor = _profiles ? _profiles.getParam(inp, 'seismic', 'Fph_detailed_lower_factor', 0.3) : 0.3;
    const fphUpperFactor = _profiles ? _profiles.getParam(inp, 'seismic', 'Fph_detailed_upper_factor', 1.6) : 1.6;
    const fphSimpleFactor = _profiles ? _profiles.getParam(inp, 'seismic', 'Fph_simple_factor', 1.6) : 1.6;
    const fphBaseFactor = _profiles ? _profiles.getParam(inp, 'seismic', 'Fph_detailed_base_factor', 0.4) : 0.4;

    const lower = fphLowerFactor * sds * ip * Wp;
    const upper = fphUpperFactor * sds * ip * Wp;
    if (!moduleOn(inp, 'sp_seismic_detail_on')) {
      return {
        enabled: false,
        detailed: false,
        fph: fphSimpleFactor * sds * ip * Wp,
        formula: `Fph = ${fphSimpleFactor} × SDS × Ip × Wp`,
        coefficient: fphSimpleFactor * sds * ip,
        lower,
        upper,
        base: fphSimpleFactor * sds * ip * Wp,
        ap: null,
        rp: null,
        zhRatio: null,
        control: '規範上限值',
        note: `未啟用耐震細算模組，採規範上限 ${fphSimpleFactor} × SDS × Ip × Wp。`,
      };
    }

    // V2.1.2：ap / Rp 預設由 profile（cns_seismic_113）取得
    const apDefault = _profiles ? _profiles.getParam(inp, 'seismic', 'ap_default', 1.0) : 1.0;
    const rpDefault = _profiles ? _profiles.getParam(inp, 'seismic', 'Rp_stone_panel_default', 2.5) : 2.5;
    const ap = Math.max(0.1, toNumber(inp?.sp_seis_ap, apDefault));
    const rp = Math.max(0.1, toNumber(inp?.sp_seis_rp, rpDefault));
    const zhRatio = clamp(toNumber(inp?.sp_seis_zh_ratio, 0.5), 0, 1);
    const coefficient = fphBaseFactor * ap * sds * ip * (1 + 2 * zhRatio) / rp;
    const base = coefficient * Wp;
    const fph = Math.min(upper, Math.max(lower, base));
    const control = base < lower ? '下限值控制' : base > upper ? '上限值控制' : '細算值控制';
    return {
      enabled: true,
      detailed: true,
      fph,
      formula: `Fph = ${fphBaseFactor} × ap × SDS × Ip × (1 + 2z/h) × Wp ÷ Rp`,
      coefficient,
      lower,
      upper,
      base,
      ap,
      rp,
      zhRatio,
      control,
      note: `耐震細算：ap = ${ap.toFixed(2)}，Rp = ${rp.toFixed(2)}，z/h = ${zhRatio.toFixed(2)}；細算值受 ${fphLowerFactor}SDSIpWp 與 ${fphUpperFactor}SDSIpWp 上下限控制，現為${control}。`,
    };
  }

  function computeWindFromGCp(inp) {
    const q = toNumber(inp?.w_qref, 0);
    const cpePos = toNumber(inp?.w_cpe_pos, 0);
    const cpeNeg = toNumber(inp?.w_cpe_neg, 0);
    const gcpi = toNumber(inp?.w_gcpi, 0);
    if (q <= 0) return null;
    const pos = Math.abs(q * (cpePos + gcpi));
    const neg = Math.abs(q * (cpeNeg - gcpi));
    return {
      q,
      cpePos,
      cpeNeg,
      gcpi,
      pos,
      neg,
      note: `手動 GCp / GCpi 細算：q = ${q.toFixed(1)} kgf/m²，ΔGCp(+) = ${(cpePos + gcpi).toFixed(2)}，ΔGCp(-) = ${(cpeNeg - gcpi).toFixed(2)}；w+ / |w-| = ${pos.toFixed(1)} / ${neg.toFixed(1)} kgf/m²。`,
    };
  }

  function driftRatioLabel(theta) {
    if (!Number.isFinite(theta) || theta <= 0) return '';
    const inv = 1 / theta;
    if (!Number.isFinite(inv) || inv <= 0) return '';
    return `（約 1/${inv.toFixed(inv >= 100 ? 0 : 1)}）`;
  }

  function driftCheck(cd, inp) {
    if (!moduleOn(inp, 'sp_drift_on')) {
      return { enabled: false, checks: [], pass: true };
    }

    const spanMode = cd?.drift_span_mode || 'single_story';
    const theta = clamp(toNumber(inp?.sp_drift_theta, 0.005), 0, 0.2);
    const storyHeightMm = Math.max(1, toNumber(inp?.sp_story_height_mm, 4000));
    const gaugeHeightMm = Math.max(1, Math.min(toNumber(cd?.h, storyHeightMm), storyHeightMm));
    const storyDispMm = theta * storyHeightMm;
    const displacementMm = spanMode === 'multi_story' ? storyDispMm : theta * gaugeHeightMm;
    const movementAllowMm = Math.max(0, toNumber(cd?.movement_allow_mm, 10));
    const rotationDemandDeg = theta * 180 / Math.PI;
    const rotationAllowDeg = Math.max(0, toNumber(cd?.rotation_allow_deg, 0.6));
    const thetaLabel = `${theta.toFixed(4)}${driftRatioLabel(theta)}`;
    const checks = [
      row(
        '掛件相對位移容許',
        `δ = θa × ${spanMode === 'multi_story' ? 'hstory' : 'hpanel'} ≤ Δallow`,
        `${theta.toFixed(4)} × ${(spanMode === 'multi_story' ? storyHeightMm : gaugeHeightMm).toFixed(0)} = ${displacementMm.toFixed(2)} mm`,
        `≤ ${movementAllowMm.toFixed(2)} mm`,
        displacementMm,
        movementAllowMm,
        'mm',
        displacementMm <= movementAllowMm
      ),
      row(
        '掛件轉角容許',
        'θa ≤ θallow',
        `${rotationDemandDeg.toFixed(3)}°`,
        `≤ ${rotationAllowDeg.toFixed(3)}°`,
        rotationDemandDeg,
        rotationAllowDeg,
        '°',
        rotationDemandDeg <= rotationAllowDeg
      ),
    ];

    return {
      enabled: true,
      theta,
      thetaLabel,
      storyHeightMm,
      gaugeHeightMm,
      storyDispMm,
      displacementMm,
      movementAllowMm,
      rotationDemandDeg,
      rotationAllowDeg,
      spanMode,
      pass: checks.every((check) => check.pass),
      checks,
      note: `層間變位檢核：θa = ${thetaLabel}，層高 = ${storyHeightMm.toFixed(0)} mm，`
        + ` 參考層間位移 = ${storyDispMm.toFixed(2)} mm；本案例採 ${spanMode === 'multi_story' ? '跨層石材（以層高評估）' : `單層內石材（以板高 ${gaugeHeightMm.toFixed(0)} mm 評估）`}，`
        + ` 掛件相對位移需求 = ${displacementMm.toFixed(2)} mm，容許滑移 = ${movementAllowMm.toFixed(2)} mm，`
        + ` 需求轉角 = ${rotationDemandDeg.toFixed(3)}°，容許轉角 = ${rotationAllowDeg.toFixed(3)}°。`,
    };
  }

  function thermalCheck(cd, inp) {
    if (!moduleOn(inp, 'sp_thermal_on')) {
      return { enabled: false, checks: [], pass: true };
    }

    // V2.1.2：熱伸縮係數預設由 profile（cns_stone_general）取得
    const _profilesTh = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const alphaDefault = _profilesTh ? _profilesTh.getParam(inp, 'stone', 'thermal_alpha_stone_default', 8e-6) : 8e-6;
    const deltaTDefault = _profilesTh ? _profilesTh.getParam(inp, 'stone', 'thermal_delta_T_default', 40) : 40;
    const alpha = Math.max(0, toNumber(inp?.sp_thermal_alpha, alphaDefault));
    const deltaT = Math.max(0, toNumber(inp?.sp_thermal_delta_t, deltaTDefault));
    const reserveMm = Math.max(0, toNumber(inp?.sp_thermal_reserve_mm, 3));
    const widthMm = Math.max(0, toNumber(cd?.w, 0));
    const heightMm = Math.max(0, toNumber(cd?.h, 0));
    const deltaWidthMm = alpha * deltaT * widthMm;
    const deltaHeightMm = alpha * deltaT * heightMm;
    const governingMovementMm = Math.max(deltaWidthMm, deltaHeightMm);
    const governingAxis = deltaWidthMm >= deltaHeightMm ? '寬向' : '高向';
    const governingLengthMm = governingAxis === '寬向' ? widthMm : heightMm;
    const jointWidthMm = Math.max(0, toNumber(cd?.joint_width_mm, 8));
    const requiredJointMm = governingMovementMm + reserveMm;
    const checks = [
      row(
        '伸縮縫淨寬估算',
        'g ≥ α × ΔT × L + r',
        `${alpha.toExponential(2)} × ${deltaT.toFixed(1)} × ${governingLengthMm.toFixed(0)} + ${reserveMm.toFixed(1)} = ${requiredJointMm.toFixed(2)} mm`,
        `≥ ${requiredJointMm.toFixed(2)} mm`,
        jointWidthMm,
        requiredJointMm,
        'mm',
        jointWidthMm >= requiredJointMm,
        {
          sense: 'min',
          detail: `ΔLw = ${deltaWidthMm.toFixed(3)} mm，ΔLh = ${deltaHeightMm.toFixed(3)} mm；控制方向 = ${governingAxis}。本式假設單縫承擔相鄰兩塊各 L/2 之伸縮量。`,
        }
      ),
    ];

    return {
      enabled: true,
      alpha,
      deltaT,
      reserveMm,
      widthMm,
      heightMm,
      deltaWidthMm,
      deltaHeightMm,
      governingMovementMm,
      governingAxis,
      jointWidthMm,
      requiredJointMm,
      pass: checks.every((check) => check.pass),
      checks,
      note: `溫度伸縮估算：α = ${alpha.toExponential(2)} /°C，ΔT = ${deltaT.toFixed(1)}°C；`
        + ` 寬向 / 高向自由伸縮量 = ${deltaWidthMm.toFixed(3)} / ${deltaHeightMm.toFixed(3)} mm，`
        + ` 控制方向 = ${governingAxis}，本式假設單縫承擔相鄰兩塊各 L/2 之伸縮量；建議淨縫寬 ≥ ${requiredJointMm.toFixed(2)} mm（含 ${reserveMm.toFixed(1)} mm 施工 / 封膠預留），`
        + ` 現況淨縫寬 = ${jointWidthMm.toFixed(2)} mm。`,
    };
  }

  function panelCheck(cd, inp, loadCtx) {
    if (!moduleOn(inp, 'sp_panel_on')) {
      return { enabled: false, checks: [], pass: true };
    }

    // V2.1.2：石材容許值與背切錐角預設由 profile（cns_stone_general）取得
    const _profilesStone = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const fbDefault = _profilesStone ? _profilesStone.getParam(inp, 'stone', 'granite_grade2_fb', 55) : 55;
    const ftDefault = _profilesStone ? _profilesStone.getParam(inp, 'stone', 'granite_grade2_ft', 35) : 35;
    const coneAngleDefault = _profilesStone ? _profilesStone.getParam(inp, 'stone', 'back_anchor_cone_angle_deg_default', 30) : 30;
    const tCm = Math.max(0.1, toNumber(inp?.st_t, 30) / 10);
    const fbAllow = Math.max(1, toNumber(inp?.sp_stone_fb, fbDefault));
    const ftAllow = Math.max(1, toNumber(inp?.sp_stone_ft, ftDefault));
    const coneAngleDeg = clamp(toNumber(inp?.sp_panel_cone_angle, coneAngleDefault), 20, 45);
    const { spanX, spanY } = clearSpanMm(cd);
    const panelMode = cd?.panel_mode || 'two_way_rankine';
    const qPanel = Math.max(
      toNumber(loadCtx?.pressureNeg, 0),
      toNumber(loadCtx?.pressurePos, 0),
      toNumber(loadCtx?.eqPressure, 0)
    );

    let spanLabel = '雙向 Rankine-Grashof 載重分配';
    let spanUseMm = 0;
    let detailNote = '';
    let momentShort = 0;
    let momentLong = 0;
    let shareShort = null;
    let shareLong = null;
    if (panelMode === 'one_way_short') {
      spanUseMm = Math.min(spanX, spanY);
      spanLabel = '單向短邊簡支';
    } else if (panelMode === 'one_way_long') {
      spanUseMm = Math.max(spanX, spanY);
      spanLabel = '單向長邊簡支';
    } else {
      spanUseMm = Math.min(spanX, spanY);
    }

    const spanUseCm = spanUseMm / 10;
    const qStrip = qPanel / 10000;
    let moment = qStrip * spanUseCm * spanUseCm / 8;
    if (panelMode === 'two_way_rankine') {
      const shortMm = Math.min(spanX, spanY);
      const longMm = Math.max(spanX, spanY);
      const shortCm = shortMm / 10;
      const longCm = longMm / 10;
      shareShort = Math.pow(longMm, 4) / (Math.pow(shortMm, 4) + Math.pow(longMm, 4));
      shareLong = 1 - shareShort;
      momentShort = qStrip * shareShort * shortCm * shortCm / 8;
      momentLong = qStrip * shareLong * longCm * longCm / 8;
      moment = Math.max(momentShort, momentLong);
      detailNote = `短邊分攤 ${(shareShort * 100).toFixed(1)}%，長邊分攤 ${(shareLong * 100).toFixed(1)}%；Mshort = ${momentShort.toFixed(3)}，Mlong = ${momentLong.toFixed(3)} kgf·cm/cm。`;
    }
    const sectionModulus = (tCm * tCm) / 6;
    const fb = sectionModulus ? moment / sectionModulus : Number.POSITIVE_INFINITY;

    const holeDepthCm = Math.max(0, toNumber(cd?.hole_depth_mm, 0) / 10);
    const holeDiaCm = toNumber(cd?.hole_diameter_mm, 0) > 0
      ? Math.max(0.1, toNumber(cd.hole_diameter_mm, 0) / 10)
      : Math.max(0.1, toNumber(cd?.d0, 1.2));
    const tNet = Math.max(0, tCm - holeDepthCm);
    const localMode = panelLocalMode(inp, cd);
    const isBack = String(cd?.type || '').startsWith('bk_');
    const tensionPoint = toNumber(loadCtx?.tensionPerPoint, 0);
    let localFormula = 'σ = T ÷ (π·d·t_net)';
    let localLabel = '石材孔周剪應力 / 石板衝切（簡化）';
    let localArea = Math.max(0.01, Math.PI * holeDiaCm * Math.max(tNet, 0.1));
    let localModeResolved = localMode;
    let localDetail = `孔深 = ${(holeDepthCm * 10).toFixed(1)} mm，剩餘淨厚 = ${(tNet * 10).toFixed(1)} mm；此為孔周剪應力簡化保守式。`;
    if (localMode === 'cone' && isBack) {
      const spread = Math.tan(coneAngleDeg * Math.PI / 180);
      const outerDiaCm = holeDiaCm + 2 * Math.max(tNet, 0.1) * spread;
      localArea = Math.max(0.01, Math.PI * (outerDiaCm * outerDiaCm - holeDiaCm * holeDiaCm) / 4);
      localFormula = 'σ = T ÷ A_cone';
      localLabel = `石材背擴孔錐形拉出 / 石板衝切（${coneAngleDeg.toFixed(0)}°簡化）`;
      localDetail = `以 ${coneAngleDeg.toFixed(0)}° 擴散假設 Acone = π(Dout² - d²)/4，Dout = d + 2t_net·tan(${coneAngleDeg.toFixed(0)}°) = ${(outerDiaCm * 10).toFixed(1)} mm；剩餘淨厚 = ${(tNet * 10).toFixed(1)} mm。`;
    } else if (localMode === 'cone' && !isBack) {
      localModeResolved = 'ring';
      localDetail = `插梢孔未採背擴孔錐形拉出模式，已自動回退為孔周剪應力簡化式；孔深 = ${(holeDepthCm * 10).toFixed(1)} mm，剩餘淨厚 = ${(tNet * 10).toFixed(1)} mm。`;
    }
    const localStress = tensionPoint / localArea;

    const checks = [
      row(
        '石材板彎曲應力',
        'fb = m / Z',
        `${fb.toFixed(2)} kgf/cm²`,
        `${fbAllow.toFixed(2)} kgf/cm²`,
        fb,
        fbAllow,
        'kgf/cm²',
        fb <= fbAllow,
        {
          detail: `${spanLabel}；q = ${qPanel.toFixed(1)} kgf/m²，Le = ${(spanUseMm / 10).toFixed(1)} cm${detailNote ? `；${detailNote}` : ''}`,
        }
      ),
      row(
        localLabel,
        localFormula,
        `${localStress.toFixed(2)} kgf/cm²`,
        `${ftAllow.toFixed(2)} kgf/cm²`,
        localStress,
        ftAllow,
        'kgf/cm²',
        tNet > 0 && localStress <= ftAllow,
        {
          detail: localDetail,
        }
      ),
    ];

    return {
      enabled: true,
      mode: panelMode,
      modeLabel: spanLabel,
      spanXmm: spanX,
      spanYmm: spanY,
      spanUseMm,
      qPanel,
      moment,
      momentShort,
      momentLong,
      shareShort,
      shareLong,
      sectionModulus,
      fb,
      fbAllow,
      localStress,
      localArea,
      localMode: localModeResolved,
      localModeLabel: localModeResolved === 'cone'
        ? `${panelLocalModeLabel(localModeResolved)}（${coneAngleDeg.toFixed(0)}°）`
        : panelLocalModeLabel(localModeResolved),
      localAngleDeg: localModeResolved === 'cone' ? coneAngleDeg : null,
      localFormula,
      localLabel,
      localDetail,
      detailNote,
      ftAllow,
      tNetMm: tNet * 10,
      holeDiameterMm: holeDiaCm * 10,
      pass: checks.every((check) => check.pass),
      checks,
    };
  }

  function geometryCheck(cd, inp) {
    if (!moduleOn(inp, 'sp_geometry_on')) {
      return { enabled: false, checks: [], pass: true };
    }

    const type = String(cd?.type || '');
    const edge = toNumber(cd?.hole_edge_mm, 0);
    const spacing = toNumber(cd?.hole_spacing_mm, 0);
    const depth = toNumber(cd?.hole_depth_mm, 0);
    const tMm = toNumber(inp?.st_t, 30);
    const quarterLimit = Math.min(toNumber(cd?.w, 0), toNumber(cd?.h, 0)) * 0.25;
    const isBack = type.startsWith('bk_');
    const source = geometryRuleSource(inp);
    const sourceLabel = geometryRuleLabel(inp);

    const checks = [];
    if (isBack) {
      if (source === 'draft') {
        checks.push(
          row(
            '背擴孔邊距',
            '60 ≤ e ≤ 300',
            `${edge.toFixed(1)} mm`,
            '60～300 mm',
            edge,
            300,
            'mm',
            edge >= 60 && edge <= 300,
            { sense: 'range', min: 60, max: 300 }
          ),
          row(
            '背擴孔間距',
            's ≤ 800',
            `${spacing.toFixed(1)} mm`,
            '≤ 800 mm',
            spacing,
            800,
            'mm',
            spacing > 0 && spacing <= 800
          )
        );
      } else if (source === 'taipei') {
        checks.push(
          row(
            '背擴孔邊距',
            '50 ≤ e ≤ 0.25×板寬/高',
            `${edge.toFixed(1)} mm`,
            `50 mm 以上且 ≤ ${quarterLimit.toFixed(1)} mm`,
            edge,
            quarterLimit,
            'mm',
            edge >= 50 && edge <= quarterLimit,
            { sense: 'range', min: 50, max: quarterLimit }
          ),
          row(
            '背擴孔深度',
            '12 ≤ h ≤ 38 且 h ≤ 0.4t',
            `${depth.toFixed(1)} mm`,
            `12～38 mm 且 ≤ ${(tMm * 0.4).toFixed(1)} mm`,
            depth,
            tMm * 0.4,
            'mm',
            depth >= 12 && depth <= 38 && depth <= tMm * 0.4,
            { sense: 'range', min: 12, max: Math.min(38, tMm * 0.4) }
          )
        );
      } else {
        checks.push(
          row(
            '背擴孔邊距',
            '60 ≤ e ≤ 300 且 e ≤ 0.25×板寬/高',
            `${edge.toFixed(1)} mm`,
            `60～300 mm 且 ≤ ${quarterLimit.toFixed(1)} mm`,
            edge,
            Math.min(300, quarterLimit),
            'mm',
            edge >= 60 && edge <= 300 && edge <= quarterLimit,
            { sense: 'range', min: 60, max: Math.min(300, quarterLimit) }
          ),
          row(
            '背擴孔間距',
            's ≤ 800',
            `${spacing.toFixed(1)} mm`,
            '≤ 800 mm',
            spacing,
            800,
            'mm',
            spacing > 0 && spacing <= 800
          ),
          row(
            '背擴孔深度',
            '12 ≤ h ≤ 38 且 h ≤ 0.4t',
            `${depth.toFixed(1)} mm`,
            `12～38 mm 且 ≤ ${(tMm * 0.4).toFixed(1)} mm`,
            depth,
            tMm * 0.4,
            'mm',
            depth >= 12 && depth <= 38 && depth <= tMm * 0.4,
            { sense: 'range', min: 12, max: Math.min(38, tMm * 0.4) }
          )
        );
      }
    } else {
      if (source === 'draft') {
        return {
          enabled: true,
          checks: [],
          pass: true,
          notApplicable: true,
          edge,
          spacing,
          depth,
          quarterLimit,
          source,
          sourceLabel,
          note: '規範研擬本未明列插梢孔幾何限制，本案未納入判定。',
        };
      }
      checks.push(
        row(
          '插梢孔邊距',
          '50 ≤ e ≤ 0.25×板寬/高',
          `${edge.toFixed(1)} mm`,
          `50 mm 以上且 ≤ ${quarterLimit.toFixed(1)} mm`,
          edge,
          quarterLimit,
          'mm',
          edge >= 50 && edge <= quarterLimit,
          { sense: 'range', min: 50, max: quarterLimit }
        ),
        row(
          '插梢孔深度',
          '20 ≤ h ≤ 30',
          `${depth.toFixed(1)} mm`,
          '20～30 mm',
          depth,
          30,
          'mm',
          depth >= 20 && depth <= 30,
          { sense: 'range', min: 20, max: 30 }
        )
      );
    }

    return {
      enabled: true,
      checks,
      pass: checks.every((check) => check.pass),
      notApplicable: false,
      edge,
      spacing,
      depth,
      quarterLimit,
      source,
      sourceLabel,
      note: '',
    };
  }

  function materialCheck(cd, inp) {
    if (!moduleOn(inp, 'sp_material_on')) {
      return { enabled: false, checks: [], pass: true };
    }

    const gradeKey = cd?.mat_grade || 'sus304';
    // 未核可項目整段隱藏（不納入檢核、摘要、引用規範）
    if (gradeKey === 'other' && !bool(cd?.mat_approved)) {
      return { enabled: false, checks: [], pass: true };
    }
    const grade = MATERIALS[gradeKey] || { label: gradeKey, approved: false };
    const pass = gradeKey === 'other' ? bool(cd?.mat_approved) : APPROVED_MATERIALS.has(gradeKey);
    const allowText = gradeKey === 'other'
      ? '需業主／建築師認可'
      : 'SUS304／SUS316／ASTM-A123 或同等以上';

    return {
      enabled: true,
      gradeKey,
      gradeLabel: grade.label,
      pass,
      checks: [
        row(
          '金屬支撐材質',
          '規範材質比對',
          grade.label,
          allowText,
          pass ? 1 : 0,
          1,
          '',
          pass,
          {
            detail: gradeKey === 'other'
              ? (cd?.mat_other || '未填寫補充材質說明')
              : '',
          }
        ),
      ],
    };
  }

  function dimensionCheck(cd, inp, area, panel) {
    if (!moduleOn(inp, 'sp_dimension_on')) {
      return { enabled: false, checks: [], pass: true };
    }

    // V2.1.2：石材厚度與單片面積限制由 profile（cns_stone_general）取得
    const _profilesDim = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const minThicknessMm = _profilesDim ? _profilesDim.getParam(inp, 'stone', 'min_thickness_default_mm', 30) : 30;
    const maxPanelAreaM2 = _profilesDim ? _profilesDim.getParam(inp, 'stone', 'max_panel_area_default_m2', 1.0) : 1.0;
    const t = toNumber(inp?.st_t, minThicknessMm);
    const exemptByPanel = Boolean(panel?.enabled && panel?.pass);
    const thicknessOk = t >= minThicknessMm;
    const areaOk = area <= maxPanelAreaM2;
    const thicknessWarn = !thicknessOk && exemptByPanel;
    const areaWarn = !areaOk && exemptByPanel;
    const checks = [
      row(
        '石材厚度限制',
        `t ≥ ${minThicknessMm}`,
        `${t.toFixed(1)} mm`,
        thicknessWarn ? `≥ ${minThicknessMm} mm（本案因板塊檢核通過列警示）` : `≥ ${minThicknessMm} mm`,
        t,
        minThicknessMm,
        'mm',
        thicknessOk || thicknessWarn,
        thicknessWarn ? {
          sense: 'min',
          status: 'warning',
          detail: '原規範限制未達，但石材板塊檢核已通過，依「經結構計算證明者不在此限」列為警示。',
        } : { sense: 'min' }
      ),
      row(
        '單片面積限制',
        `A ≤ ${maxPanelAreaM2.toFixed(1)}`,
        `${area.toFixed(3)} m²`,
        areaWarn ? `≤ ${maxPanelAreaM2.toFixed(1)} m²（本案因板塊檢核通過列警示）` : `≤ ${maxPanelAreaM2.toFixed(1)} m²`,
        area,
        maxPanelAreaM2,
        'm²',
        areaOk || areaWarn,
        areaWarn ? {
          status: 'warning',
          detail: '原規範限制超出，但石材板塊檢核已通過，依「經結構計算證明者不在此限」列為警示。',
        } : {}
      ),
    ];

    return {
      enabled: true,
      warning: checks.some((check) => check.status === 'warning'),
      pass: checks.every((check) => check.pass),
      checks,
    };
  }

  function customAnchorCheck(cd, inp) {
    if (!moduleOn(inp, 'sp_custom_anchor_on')) {
      return { enabled: false, checks: [], pass: true };
    }

    const type = String(inp?.m_anc_type || 'custom');
    const spec = CONSTS.ANCHOR_CATALOG?.[type];
    const isPin = String(cd?.type || '').startsWith('pk_');
    const anchorLength = type === 'custom'
      ? toNumber(inp?.sp_custom_anchor_length_mm, 0)
      : toNumber(spec?.lengthMm, toNumber(inp?.sp_custom_anchor_length_mm, 0));
    const anchorEmbed = type === 'custom'
      ? toNumber(inp?.sp_custom_anchor_embed_mm, 0)
      : toNumber(spec?.embedMm, toNumber(inp?.sp_custom_anchor_embed_mm, 0));
    const cdAnchorEdge = toNumber(cd?.anchor_edge_mm, 0);
    // V2.3.0：邊距預設值由 profile 取得（fallback = 25）
    const _profilesEdge = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const edgeDefault = _profilesEdge ? _profilesEdge.getParam(inp, 'anchor', 'min_edge_distance_mm', 25) : 25;
    const anchorEdge = cdAnchorEdge > 0 ? cdAnchorEdge : toNumber(inp?.sp_custom_anchor_edge_mm, edgeDefault);
    const anchorDia = type === 'custom'
      ? toNumber(inp?.sp_custom_anchor_d_mm, 0)
      : effectiveAncDiameterMm(inp);
    // V2.3.0：插梢鋼棒預設值亦由 profile 取得（與 anchor 共用同一組構造最小值）
    const _profilesPin = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const pinLengthDefault = _profilesPin ? _profilesPin.getParam(inp, 'anchor', 'min_anchor_length_mm', 75) : 75;
    const pinEmbedDefault = _profilesPin ? _profilesPin.getParam(inp, 'anchor', 'min_embedment_mm', 40) : 40;
    const pinEdgeDefault = _profilesPin ? _profilesPin.getParam(inp, 'anchor', 'min_edge_distance_mm', 25) : 25;
    const pinLength = toNumber(inp?.sp_custom_pin_length_mm, pinLengthDefault);
    const pinEmbed = toNumber(inp?.sp_custom_pin_embed_mm, pinEmbedDefault);
    const cdPinEdge = toNumber(cd?.pin_edge_mm, 0);
    const pinEdge = cdPinEdge > 0 ? cdPinEdge : toNumber(inp?.sp_custom_pin_edge_mm, pinEdgeDefault);
    const pinDia = Math.max(toNumber(inp?.m_pin_d, 5), 0);
    const labelPrefix = type === 'custom' ? '自訂錨栓' : '錨栓';

    // V2.3.0：構造最小值改由 profile（aci_318_appendix_d）取得
    // fallback = 原 hardcoded 值（4 / 75 / 40 / 25），保證 drift = 0
    const _profilesAC = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const minD = _profilesAC ? _profilesAC.getParam(inp, 'anchor', 'min_anchor_diameter_mm', 4) : 4;
    const minL = _profilesAC ? _profilesAC.getParam(inp, 'anchor', 'min_anchor_length_mm', 75) : 75;
    const minH = _profilesAC ? _profilesAC.getParam(inp, 'anchor', 'min_embedment_mm', 40) : 40;
    const minC = _profilesAC ? _profilesAC.getParam(inp, 'anchor', 'min_edge_distance_mm', 25) : 25;

    const checks = [
      row(`${labelPrefix}長度`, `L ≥ ${minL}`, `${anchorLength.toFixed(1)} mm`, `≥ ${minL} mm`, anchorLength, minL, 'mm', anchorLength >= minL, { sense: 'min' }),
      row(`${labelPrefix}埋深`, `hef ≥ ${minH}`, `${anchorEmbed.toFixed(1)} mm`, `≥ ${minH} mm`, anchorEmbed, minH, 'mm', anchorEmbed >= minH, { sense: 'min' }),
      row(`${labelPrefix}邊距`, `c ≥ ${minC}`, `${anchorEdge.toFixed(1)} mm`, `≥ ${minC} mm`, anchorEdge, minC, 'mm', anchorEdge >= minC, { sense: 'min' }),
      row(`${labelPrefix}直徑`, `d ≥ ${minD}`, `${anchorDia.toFixed(1)} mm`, `≥ ${minD} mm`, anchorDia, minD, 'mm', anchorDia >= minD, { sense: 'min' }),
    ];

    if (isPin) {
      checks.push(
        row('插梢鋼棒長度', `L ≥ ${minL}`, `${pinLength.toFixed(1)} mm`, `≥ ${minL} mm`, pinLength, minL, 'mm', pinLength >= minL, { sense: 'min' }),
        row('插梢鋼棒埋深', `hef ≥ ${minH}`, `${pinEmbed.toFixed(1)} mm`, `≥ ${minH} mm`, pinEmbed, minH, 'mm', pinEmbed >= minH, { sense: 'min' }),
        row('插梢鋼棒邊距', `c ≥ ${minC}`, `${pinEdge.toFixed(1)} mm`, `≥ ${minC} mm`, pinEdge, minC, 'mm', pinEdge >= minC, { sense: 'min' }),
        row('插梢鋼棒直徑', `d ≥ ${minD}`, `${pinDia.toFixed(1)} mm`, `≥ ${minD} mm`, pinDia, minD, 'mm', pinDia >= minD, { sense: 'min' })
      );
    }

    return {
      enabled: true,
      actualType: type,
      fromCatalog: type !== 'custom',
      pass: checks.every((check) => check.pass),
      checks,
    };
  }

  function bk2Check(cd, inp) {
    if (!moduleOn(inp, 'sp_bk2_on') || String(cd?.type || '') !== 'bk_2') {
      return { enabled: false, checks: [], pass: true };
    }

    const pass = bool(cd?.bk2_exception);
    return {
      enabled: true,
      pass,
      checks: [
        row(
          '二點固定例外條件',
          '3.2.4(5) 四點固定原則',
          pass ? '已勾選例外計算佐證' : '未提供例外計算佐證',
          '需附結構計算證明',
          pass ? 1 : 0,
          1,
          '',
          pass,
          {
            detail: '任何部位石材原則應採四點固定；僅得於附結構計算佐證時採兩點固定。',
          }
        ),
      ],
    };
  }

  function buildCaseCheckData(cd, result, inp) {
    const design = result?.design || {};
    const spec = result?.spec || {};
    const T = toNumber(design.tensionPerPoint, result?.T);
    const Tb = toNumber(design.bendingPerPoint, T);
    const V = toNumber(result?.V);
    const mc_h1 = toNumber(result?.mc_h1, 3.4);
    const mc_h2 = toNumber(result?.mc_h2, 3.6);
    const bh = toNumber(cd?.bh, 10);
    const d1 = toNumber(cd?.d1, 8);
    const Lt = toNumber(cd?.Lt, 0.5);
    const LL = toNumber(cd?.LL, 5);
    const d0 = toNumber(cd?.d0, 1.2);
    // V2.1.3：鋼材 Fy 預設由 profile（cns_steel_general）取得（SUS304 = 2100 kgf/cm²）
    const _profilesFy = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const fyDefault = _profilesFy ? _profilesFy.getParam(inp, 'steel', 'Fy_SUS304_default', 2100) : 2100;
    const fy = toNumber(inp?.m_fy, fyDefault);
    const screwTa = toNumber(inp?.m_screw_ta, 255.3);
    const anchorTa = toNumber(spec?.anchor?.effectiveTa, toNumber(spec?.anchor?.governingTa, toNumber(inp?.m_anc_ta, 499.7)));
    const anchorVa = toNumber(spec?.anchor?.effectiveVa, toNumber(spec?.anchor?.governingVa, anchorTa));
    const mcVa = toNumber(inp?.m_mc_va, 567);
    const mcTa = toNumber(inp?.m_mc_ta, 709);
    const pinVa = toNumber(inp?.m_pin_va, 85);
    const allowStressFactor = toNumber(spec?.allowStressFactor, 1.0);
    const hasMC = Boolean(cd?.hasMC);
    const section = spec?.section || sectionProperties(cd, inp);
    const slipPlate = spec?.slipPlate || slipPlateCheckData(cd, inp);

    const Tu1 = d1 ? (V * bh) / d1 : 0;
    const Tu2 = d1 ? (T * bh) / d1 : 0;
    const Tu = Math.max(Tu1, Tu2);
    const T1 = mc_h2 ? (V * mc_h1) / mc_h2 : 0;
    const Au = toNumber(section?.shearArea, Math.max(0.01, (LL - d0) * Lt));
    const S_sec = toNumber(section?.sectionModulus, (1 / 6) * LL * Lt * Lt);
    // V2.1.1：鋼材容許應力係數 Fb / Fv 由 profile（cns_steel_general）取得，CONSTS 為 fallback
    const _profilesSteel = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const fbFactorStatic = _profilesSteel ? _profilesSteel.getParam(inp, 'steel', 'Fb_factor_static', 0.6) : 0.6;
    const fvFactor = _profilesSteel ? _profilesSteel.getParam(inp, 'steel', 'Fv_factor', 0.4) : 0.4;
    const Va_L = fvFactor * fy * Au;
    const M = Math.max(V * bh, Tb * d1);
    const Fb = fbFactorStatic * fy * allowStressFactor;
    const Sreq = Fb ? M / Fb : 0;

    const isPinTypeCase = String(cd?.type || '').startsWith('pk_');
    const rows = [
      // 背扣螺絲 抗拔：僅 bk_（背扣）型態有，插銷型態 pk_* 不出（該處抗剪由插銷負責）
      ...(isPinTypeCase ? [] : [
        row('背扣螺絲 抗拔', 'T = P ÷ N', `${T.toFixed(2)} kgf`, `${screwTa.toFixed(1)} kgf`, T, screwTa, 'kgf', T <= screwTa),
      ]),
      row('膨脹螺栓 Tu1（垂直力）', 'Tu1 = V × h ÷ d₁', `${Tu1.toFixed(2)} kgf`, `${anchorTa.toFixed(1)} kgf`, Tu1, anchorTa, 'kgf', Tu1 <= anchorTa, {
        detail: `V（每固定點垂直力）= ${V.toFixed(2)} kgf，由荷載計算 V = S ÷ N 得出；h = ${bh.toFixed(1)} cm，d₁ = ${d1.toFixed(1)} cm。`,
      }),
      row('膨脹螺栓 Tu2（水平力）', 'Tu2 = T × h ÷ d₁', `${Tu2.toFixed(2)} kgf`, `${anchorTa.toFixed(1)} kgf`, Tu2, anchorTa, 'kgf', Tu2 <= anchorTa, {
        detail: `T（每固定點水平力）= ${T.toFixed(2)} kgf，由荷載計算 T = P ÷ N 得出；h = ${bh.toFixed(1)} cm，d₁ = ${d1.toFixed(1)} cm。`,
      }),
      // 膨脹螺栓剪力：每固定點只有一支膨脹螺栓承擔該點之剪力，不再除以 N（V 已是每點之值）
      row('膨脹螺栓 剪力', 'Vanc = V', `${V.toFixed(2)} kgf`, `${anchorVa.toFixed(1)} kgf`, V, anchorVa, 'kgf', V <= anchorVa, {
        detail: `每固定點僅一支膨脹螺栓承擔該點剪力，即 Vanc = V = ${V.toFixed(2)} kgf；V 由荷載計算 V = S ÷ N 得出，此處不再除以 N。`,
      }),
      (() => {
        const interactionMode = inp?.sp_interaction_mode || 'conservative_envelope';
        const useSeparatedMode = interactionMode === 'separated' && Tu2 < Tu1;
        const interactionTu = Tu2 >= Tu1 ? Tu2 : Tu;
        // V2.1.1：拉剪互制指數改由 profile 取得（ACI 318 Appendix D.7.3 = 5/3）
        const _profilesIE = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
          ? globalThis.StoneCodeProfiles
          : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
        const interactionExp = _profilesIE ? _profilesIE.getParam(inp, 'anchor', 'interaction_exponent_steel', 5 / 3) : 5 / 3;
        const interactionValue = anchorTa > 0 && anchorVa > 0
          ? (useSeparatedMode
              ? Math.pow(Tu1 / anchorTa, interactionExp)
              : (Math.pow(interactionTu / anchorTa, interactionExp) + Math.pow(V / anchorVa, interactionExp)))
          : Number.POSITIVE_INFINITY;
        return row(
        '膨脹螺栓 拉剪交互',
        useSeparatedMode ? 'R = (Tu1/Ta)^1.67' : 'R = (Tu/Ta)^1.67 + (V/Va)^1.67',
        `${interactionValue.toFixed(3)}`,
        '≤ 1.000',
        interactionValue,
        1,
        '',
        anchorTa > 0 && anchorVa > 0 && interactionValue <= 1,
        {
          detail: useSeparatedMode
            ? `Tu1 = ${Tu1.toFixed(2)} kgf（Tu1 與 V 同源，依分離計算模式僅檢核 Tu1/Ta），Ta = ${anchorTa.toFixed(1)} kgf；V = ${V.toFixed(2)} kgf，Va = ${anchorVa.toFixed(1)} kgf。`
            : `Tu = ${interactionTu.toFixed(2)} kgf（${Tu2 >= Tu1 ? 'Tu2 水平力拉拔控制' : 'Tu1 垂直剪力導出，保守包絡'}），Ta = ${anchorTa.toFixed(1)} kgf；V = ${V.toFixed(2)} kgf，Va = ${anchorVa.toFixed(1)} kgf。`,
        }
      )})(),
    ];

    // 馬車螺栓：依 hasMC 獨立判定（pk_ 型有伸縮片時亦可加上馬車檢核）
    if (hasMC) {
      rows.push(
        row('馬車螺栓 剪力', 'V = T', `${T.toFixed(2)} kgf`, `${mcVa.toFixed(1)} kgf`, T, mcVa, 'kgf', T <= mcVa),
        row('馬車螺栓 拉力 T₁', 'T₁ = V × h₁ ÷ h₂', `${T1.toFixed(2)} kgf`, `${mcTa.toFixed(1)} kgf`, T1, mcTa, 'kgf', T1 <= mcTa)
      );
    }
    // 插銷檢核：型態為 pk_*（插銷）就獨立檢核，不因 hasMC 而排除
    if (isPinTypeCase) {
      rows.push(
        row('插銷 剪力', 'Tu ≤ Va', `${Tu.toFixed(2)} kgf`, `${pinVa.toFixed(1)} kgf`, Tu, pinVa, 'kgf', Tu <= pinVa)
      );
      if (slipPlate.enabled) {
        const plateVa = fvFactor * slipPlate.fy * slipPlate.area;
        const plateM = V * slipPlate.spanCm;
        const plateFb = fbFactorStatic * slipPlate.fy * allowStressFactor;
        const plateSreq = plateFb ? plateM / plateFb : 0;
        rows.push(
          row(
            '伸縮片 剪力（淨截面）',
            'V ≤ 0.4·Fy·A',
            `${V.toFixed(2)} kgf`,
            `${plateVa.toFixed(2)} kgf`,
            V,
            plateVa,
            'kgf',
            V <= plateVa,
            {
              detail: `${slipPlate.specLabel}；A = B × t = ${slipPlate.widthCm.toFixed(2)} × ${slipPlate.thicknessCm.toFixed(2)} = ${slipPlate.area.toFixed(3)} cm²。`,
            }
          ),
          row(
            '伸縮片 彎矩（斷面模數）',
            'Sreq = M ÷ Fb',
            `${plateSreq.toFixed(4)} cm³`,
            `${slipPlate.sectionModulus.toFixed(4)} cm³`,
            plateSreq,
            slipPlate.sectionModulus,
            'cm³',
            plateSreq <= slipPlate.sectionModulus,
            {
              detail: `L = ${slipPlate.spanLabel} = ${slipPlate.spanCm.toFixed(2)} cm；M = V × L = ${V.toFixed(2)} × ${slipPlate.spanCm.toFixed(2)} = ${plateM.toFixed(2)} kgf·cm；Fb = 0.6 × Fy × cf = 0.6 × ${slipPlate.fy.toFixed(0)} × ${allowStressFactor.toFixed(2)} = ${plateFb.toFixed(2)} kgf/cm²。`,
            }
          )
        );
      }
    }

    rows.push(
      // 角鋼檢核（共用）
      row('角鋼 剪力（淨截面）', 'V ≤ 0.4·Fy·Au', `${V.toFixed(2)} kgf`, `${Va_L.toFixed(2)} kgf`, V, Va_L, 'kgf', V <= Va_L),
      row('角鋼 彎矩（斷面模數）', 'Sreq = M ÷ Fb', `${Sreq.toFixed(4)} cm³`, `${S_sec.toFixed(4)} cm³`, Sreq, S_sec, 'cm³', Sreq <= S_sec, {
        detail: section?.mode === 'l_angle_composite'
          ? `${section.axisLabel}；Sx = ${toNumber(section.Sx, 0).toFixed(4)} cm³，Sy = ${toNumber(section.Sy, 0).toFixed(4)} cm³，取較小值 ${S_sec.toFixed(4)} cm³。`
          : '矩形板近似：S = (1/6) × h × t²。',
      })
    );

    if (Array.isArray(spec?.extraChecks) && spec.extraChecks.length) {
      rows.push(...spec.extraChecks);
    }

    return renumber(rows);
  }

  function slipPlateCheckData(cd, inp) {
    const isPin = String(cd?.type || '').startsWith('pk_');
    if (!isPin || !bool(cd?.hasSlipPlate)) return { enabled: false };
    const widthCm = Math.max(0.1, toNumber(cd?.slip_plate_b, toNumber(cd?.LL, 5)));
    const thicknessCm = Math.max(0.05, toNumber(cd?.slip_plate_t, toNumber(cd?.Lt, 0.5)));
    // V2.1.3：伸縮片 Fy 預設亦由 profile 取得
    const _profilesFySlip = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const fySlipDefault = _profilesFySlip ? _profilesFySlip.getParam(inp, 'steel', 'Fy_SUS304_default', 2100) : 2100;
    const fy = Math.max(0, toNumber(inp?.m_fy, fySlipDefault));
    const area = widthCm * thicknessCm;
    const sectionModulus = (1 / 6) * widthCm * thicknessCm * thicknessCm;
    const rawSpan = toNumber(cd?.bh, 10) - toNumber(cd?.H1, 5);
    const spanCm = rawSpan > 0 ? rawSpan : Math.max(0.1, toNumber(cd?.bh, 10));
    const spanLabel = rawSpan > 0
      ? `H − H₁ = ${toNumber(cd?.bh, 10).toFixed(2)} − ${toNumber(cd?.H1, 5).toFixed(2)}`
      : `H = ${toNumber(cd?.bh, 10).toFixed(2)}`;
    const explicit = String(cd?.slip_plate_spec || '').trim();
    const specLabel = explicit || `PL${Math.round(widthCm * 10)}×${Math.round(thicknessCm * 10)}t 伸縮片`;
    return {
      enabled: true,
      widthCm,
      thicknessCm,
      fy,
      area,
      sectionModulus,
      spanCm,
      spanLabel,
      specLabel,
    };
  }

  function totalPointCount(cd) {
    return Math.max(1, Math.round(toNumber(cd?.N, CONSTS.TYPE_N?.[cd?.type] || 4)));
  }

  function effectivePointCount(cd, totalN = null) {
    const baseN = Math.max(1, Number.isFinite(Number(totalN)) ? Number(totalN) : totalPointCount(cd));
    return String(cd?.type || '').startsWith('pk_')
      ? Math.max(1, baseN / 2)
      : baseN;
  }

  function calcCase(cd, inp) {
    const w = toNumber(cd?.w, 870);
    const h = toNumber(cd?.h, 800);
    const N = totalPointCount(cd);
    const effectiveN = effectivePointCount(cd, N);
    const pointCount = {
      total: N,
      effective: effectiveN,
      usesHalf: String(cd?.type || '').startsWith('pk_'),
      note: String(cd?.type || '').startsWith('pk_')
        ? `插銷固定點按一半受力：固定點數 N = ${N}，有效受力點數 N_eff = ${effectiveN}。`
        : `螺栓孔固定點全數受力：固定點數 N = ${N}。`,
    };
    const h12 = String(cd?.h12 || '3.4,3.6')
      .split(',')
      .map((value) => toNumber(value.trim()))
      .filter((value) => Number.isFinite(value));
    const mc_h1 = h12[0] || 3.4;
    const mc_h2 = h12[1] || 3.6;

    const ipEff = effectiveIp(inp);
    const Wp = toNumber(inp?.st_gam, 2800) * toNumber(inp?.st_t, 30) / 1000;
    const A = (w / 1000) * (h / 1000);
    const G = A * Wp;
    const seismic = seismicDemand(inp, Wp, ipEff);
    const Fph = seismic.fph;
    const PE = Fph * A;
    const compareFph = bool(inp?.sp_seis_upper_compare_on) ? toNumber(seismic.upper, Fph) : Fph;
    const PECompare = compareFph * A;
    // V2.1.3：PEV 係數由 profile（cns_seismic_113）取得
    const _profilesPev = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const pevConservativeFactor = _profilesPev ? _profilesPev.getParam(inp, 'seismic', 'PEV_factor_conservative', 0.5) : 0.5;
    const pevStandardFactor = _profilesPev ? _profilesPev.getParam(inp, 'seismic', 'PEV_factor_standard', 0.2) : 0.2;
    const pevConservative = bool(inp?.sp_pev_conservative_on);
    const PEV = pevConservative ? pevConservativeFactor * PE : pevStandardFactor * toNumber(inp?.s_sds, 0.6) * G;
    const pevMethod = pevConservative ? `${pevConservativeFactor}PE 保守式` : `Ev = ${pevStandardFactor}SDSD 規範式`;
    const seismicInfo = {
      ...seismic,
      compareUpper: bool(inp?.sp_seis_upper_compare_on),
      compareFph,
      compareForce: PECompare,
      pevMethod,
    };

    const windFromGCp = inp?.w_src === 'manual' && inp?.w_manual_mode === 'coeff'
      ? computeWindFromGCp(inp)
      : null;
    const rawPressurePos = windFromGCp ? windFromGCp.pos : toNumber(inp?.w_pos, 426);
    const rawPressureNeg = windFromGCp ? windFromGCp.neg : toNumber(inp?.w_neg, 341);
    // V2.1.1：風壓組合係數預設由鋼材 profile Fb_factor_with_wind_seismic 取得，
    // 同時也是允許應力法 D+W/D+E 組合下 Fb 放大係數的對應預設
    const _profilesWcf = (typeof globalThis !== 'undefined' && globalThis.StoneCodeProfiles)
      ? globalThis.StoneCodeProfiles
      : (typeof window !== 'undefined' && window.StoneCodeProfiles ? window.StoneCodeProfiles : null);
    const wcfDefault = _profilesWcf ? _profilesWcf.getParam(inp, 'steel', 'Fb_factor_with_wind_seismic', 1.25) : 1.25;
    const pressurePos = rawPressurePos * toNumber(inp?.w_cf, wcfDefault);
    const pressureNeg = rawPressureNeg * toNumber(inp?.w_cf, wcfDefault);
    const PWPos = A * pressurePos;
    const PWNeg = A * pressureNeg;
    const windDirectional = moduleOn(inp, 'sp_wind_dir_on');
    const windEnvelope = Math.max(PWPos, PWNeg);
    const horizontalPull = windDirectional ? Math.max(PE, PWNeg) : Math.max(PE, windEnvelope);
    const horizontalPush = windDirectional ? Math.max(PE, PWPos) : horizontalPull;
    const P = Math.max(horizontalPull, horizontalPush);
    const compareHorizontalPull = windDirectional ? Math.max(PECompare, PWNeg) : Math.max(PECompare, windEnvelope);
    const compareHorizontalPush = windDirectional ? Math.max(PECompare, PWPos) : compareHorizontalPull;
    const compareP = Math.max(compareHorizontalPull, compareHorizontalPush);
    const hasDynamicLoad = Math.max(PE, PWPos, PWNeg) > 0;
    const eqControlsPull = PE >= (windDirectional ? PWNeg : windEnvelope);
    const eqControlsPush = PE >= PWPos;
    const compareControlsPull = PECompare >= (windDirectional ? PWNeg : windEnvelope);
    const compareControlsPush = PECompare >= PWPos;
    const verticalPull = eqControlsPull ? (G + PEV) : G;
    const verticalPush = eqControlsPush ? (G + PEV) : G;
    const S = Math.max(verticalPull, verticalPush);
    const T = horizontalPull / effectiveN;
    const Tbend = Math.max(horizontalPull, horizontalPush) / effectiveN;
    const V = S / effectiveN;
    const manualStaticAllow = bool(inp?.sp_allow_stress_static_on);
    const verticalBasis = !hasDynamicLoad
      ? 'D only'
      : (eqControlsPull && eqControlsPush
        ? 'D + E'
        : (!eqControlsPull && !eqControlsPush ? 'D + W' : 'D + E / D + W 取較不利'));
    const allowStressBasis = manualStaticAllow ? 'D only（手動）' : verticalBasis;
    const allowStressFactor = allowStressBasis.startsWith('D only') ? 1.0 : toNumber(inp?.w_cf, wcfDefault);

    const anchorBase = anchorCapacity(inp);
    const anchorGroup = anchorGroupReduction(cd, inp, anchorBase);
    const anchor = {
      ...anchorBase,
      baseTa: anchorBase.governingTa,
      baseVa: anchorBase.governingVa,
      effectiveTa: anchorGroup.enabled ? anchorGroup.reducedTa : anchorBase.governingTa,
      effectiveVa: anchorGroup.enabled ? anchorGroup.reducedVa : anchorBase.governingVa,
    };
    const panel = panelCheck(cd, inp, {
      pressurePos,
      pressureNeg,
      eqPressure: Fph,
      tensionPerPoint: T,
    });
    const section = sectionProperties(cd, inp);
    const slipPlate = slipPlateCheckData(cd, inp);
    const drift = driftCheck(cd, inp);
    const thermal = thermalCheck(cd, inp);
    const geometry = geometryCheck(cd, inp);
    const material = materialCheck(cd, inp);
    const dimensions = dimensionCheck(cd, inp, A, panel);
    const customAnchor = customAnchorCheck(cd, inp);
    const bk2 = bk2Check(cd, inp);

    const extraChecks = [];
    [panel, drift, thermal, geometry, material, dimensions, customAnchor, bk2].forEach((group) => {
      if (Array.isArray(group?.checks) && group.checks.length) extraChecks.push(...group.checks);
    });

    const prelimResult = {
      T,
      V,
      mc_h1,
      mc_h2,
      design: {
        tensionPerPoint: T,
        bendingPerPoint: Tbend,
        compareHorizontalPull,
        compareHorizontalPush,
        compareP,
      },
      spec: {
        anchor,
        anchorGroup,
        extraChecks,
        section,
        slipPlate,
        seismic: seismicInfo,
        windFromGCp,
        allowStressFactor,
        pointCount,
      },
    };
    const checks = buildCaseCheckData(cd, prelimResult, inp);
    const allOK = checks.every((check) => check.pass);

    return {
      id: cd?.id ?? null,
      A,
      G,
      Wp,
      Fph,
      PE,
      PEV,
      PW: Math.max(PWPos, PWNeg),
      PWPos,
      PWNeg,
      FW: Math.max(pressurePos, pressureNeg),
      pressurePos,
      pressureNeg,
      S,
      P,
      T,
      V,
      govWind: windDirectional ? PWNeg >= PE : Math.max(PWPos, PWNeg) >= PE,
      gov_wind: windDirectional ? PWNeg >= PE : Math.max(PWPos, PWNeg) >= PE,
      govWindPos: PWPos >= PE,
      govWindNeg: PWNeg >= PE,
      checks,
      allOK,
      all_ok: allOK,
      mc_h1,
      mc_h2,
      design: {
        tensionPerPoint: T,
        bendingPerPoint: Tbend,
        horizontalPull,
        horizontalPush,
        compareHorizontalPull,
        compareHorizontalPush,
        compareP,
      },
      spec: {
        ipInput: toNumber(inp?.s_ip_raw ?? inp?.s_ip, 1.0),
        ipEffective: ipEff,
        ipRaised: ipEff > toNumber(inp?.s_ip_raw ?? inp?.s_ip, 1.0),
        anchor,
        anchorGroup,
        pointCount,
        panel,
        drift,
        thermal,
        section,
        seismic: seismicInfo,
        pevMethod,
        pevConservative,
        seismicCompareUpper: bool(inp?.sp_seis_upper_compare_on),
        seismicCompareFph: compareFph,
        seismicCompareForce: PECompare,
        windFromGCp,
        geometry,
        material,
        dimensions,
        customAnchor,
        bk2,
        windDirectional,
        verticalBasis,
        allowStressBasis,
        verticalPull,
        verticalPush,
        allowStressFactor,
        compareControlsPull,
        compareControlsPush,
        modules: {
          anchor: moduleOn(inp, 'sp_anchor_on'),
          bk2: moduleOn(inp, 'sp_bk2_on'),
          panel: moduleOn(inp, 'sp_panel_on'),
          psicv: moduleOn(inp, 'sp_psicv_on'),
          geometry: moduleOn(inp, 'sp_geometry_on'),
          customAnchor: moduleOn(inp, 'sp_custom_anchor_on'),
          material: moduleOn(inp, 'sp_material_on'),
          dimensions: moduleOn(inp, 'sp_dimension_on'),
          windDirectional,
          ip15: moduleOn(inp, 'sp_ip15_on'),
          chapter: moduleOn(inp, 'sp_chapter_on'),
          torque: moduleOn(inp, 'sp_torque_on'),
          angleSection: moduleOn(inp, 'sp_angle_on'),
          seismicDetail: moduleOn(inp, 'sp_seismic_detail_on'),
          anchorGroup: moduleOn(inp, 'sp_anchor_group_on'),
          drift: moduleOn(inp, 'sp_drift_on'),
          thermal: moduleOn(inp, 'sp_thermal_on'),
        },
        summary: [
          pointCount.usesHalf ? pointCount.note : '',
          panel.enabled ? `石材板塊檢核：${panel.pass ? '符合' : '不符合'}` : '',
          drift.enabled ? `層間變位：${drift.pass ? '符合' : '不符合'}（δ ${drift.displacementMm.toFixed(2)} / ${drift.movementAllowMm.toFixed(2)} mm）` : '',
          thermal.enabled ? `伸縮縫估算：${thermal.pass ? '符合' : '不符合'}（g ${thermal.jointWidthMm.toFixed(2)} / ${thermal.requiredJointMm.toFixed(2)} mm）` : '',
          section.mode === 'l_angle_composite' ? `角鋼斷面：${section.axisLabel}` : '',
          section.fallbackRect ? 'L 型角鋼輸入不成立：已退回矩形板近似' : '',
          geometry.enabled ? `孔位幾何：${geometry.pass ? '符合' : '不符合'}` : '',
          material.enabled ? `材質要求：${material.pass ? '符合' : '不符合'}` : '',
          dimensions.enabled ? `厚度/面積：${dimensions.warning ? '警示' : dimensions.pass ? '符合' : '不符合'}` : '',
          customAnchor.enabled ? `錨栓／插梢尺寸：${customAnchor.pass ? '符合' : '不符合'}` : '',
          anchor.warning ? '附篇 D 模式資料不足：已退回廠商試驗 SF 法' : '',
          anchorGroup.enabled ? `群組/邊距折減：Ta ${anchor.baseTa.toFixed(1)}→${anchor.effectiveTa.toFixed(1)} kgf，Va ${anchor.baseVa.toFixed(1)}→${anchor.effectiveVa.toFixed(1)} kgf` : '',
          seismic.detailed ? `耐震細算：${seismic.control}` : '',
          bool(inp?.sp_seis_upper_compare_on) ? `地震上限比較：Fph* = ${compareFph.toFixed(2)} kgf/m²，P* = ${compareP.toFixed(2)} kgf（${compareControlsPull && compareControlsPush ? '上限比較為地震控制' : compareControlsPull || compareControlsPush ? '上限比較於不同方向控制不同' : '上限比較仍為風力控制'}，僅供比較，不回寫主設計力）` : '',
          manualStaticAllow ? `角鋼容許應力採純靜載模式：Fb 不乘 ${wcfDefault.toFixed(2)}。` : '',
          inp?.sp_interaction_mode === 'separated' ? '錨栓拉剪交互採分離計算：Tu1 與 V 同源時，不重複累加 V 項。' : '',
          `PEV 採 ${pevMethod}`,
          ipEff > toNumber(inp?.s_ip_raw ?? inp?.s_ip, 1.0) ? `Ip 自動提升：${toNumber(inp?.s_ip_raw ?? inp?.s_ip, 1.0).toFixed(2)} → ${ipEff.toFixed(2)}` : '',
        ].filter(Boolean),
      },
      calculator_version: VERSION,
    };
  }

  function computeAllCases(caseRows, inp) {
    return (caseRows || []).map((cd) => calcCase(cd, inp));
  }

  return Object.freeze({
    VERSION,
    buildCaseCheckData,
    calcCase,
    computeAllCases,
  });
})();
