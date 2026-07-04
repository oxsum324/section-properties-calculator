(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.FoundationLocalCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CORE_NAME = 'FoundationLocalCore';
  const CORE_VERSION = '0.5.0';
  const INPUT_SCHEMA_VERSION = 'foundation-local.input.v0.5';
  const RESULT_SCHEMA_VERSION = 'foundation-local.result.v0.5';
  const LOGIC_SIGNATURE = 'foundation-local-core:v0.5:design-basis-service-stability:qmax-qmin-sliding-overturning-effective-area-elastic-settlement-consolidation-boussinesq-2to1-terzaghi-time-rate';

  const DESIGN_CODE_PRESETS = {
    'tw-foundation-112': {
      id: 'tw-foundation-112',
      label: '台灣《建築物基礎構造設計規範》112 年版',
      reference: '內政部 112.06.20 台內營字第1120807974號令修正，113.01.01 生效',
      note: '本工具僅引用淺基礎局部穩定相關安全係數；沉陷、液化、樁基與結構配筋仍需另行詳算。',
      loadCases: {
        'long-term': {
          label: '長期載重',
          verticalBearingFs: 3.0,
          horizontalResistanceFs: 1.5,
          stabilityFs: 1.5,
          basis: '4.3.5 地盤容許垂直支承力；4.6.1 淺基礎容許水平支承力'
        },
        'short-term': {
          label: '短期載重（風、震、施工或偶發載重）',
          verticalBearingFs: 2.0,
          horizontalResistanceFs: 1.2,
          stabilityFs: 1.2,
          basis: '4.3.5 短期載重支承力；4.6.1 短期水平支承力'
        },
        'ultimate': {
          label: '極限限界狀態',
          verticalBearingFs: 1.1,
          horizontalResistanceFs: 1.1,
          stabilityFs: 1.1,
          basis: '2.11 極限限界狀態；4.3.5 與 4.6.1 極限檢核安全係數'
        }
      }
    },
    'project-custom': {
      id: 'project-custom',
      label: '專案自訂基準',
      reference: '由使用者依地工報告、審查意見或專案設計準則輸入',
      note: '自訂模式不宣告符合特定法規，報告將標示為使用者自訂。',
      loadCases: {}
    },
    'aci-asce-ibc-reference': {
      id: 'aci-asce-ibc-reference',
      label: 'ACI / ASCE / IBC 參考模式',
      reference: '地盤承載通常以服務載重檢核；RC 剪力、彎矩與配筋另以強度設計檢核',
      note: '此模式僅作國外工具邏輯參考，不作台灣正式核算預設。',
      loadCases: {}
    },
    'eurocode7-reference': {
      id: 'eurocode7-reference',
      label: 'Eurocode 7 參考模式',
      reference: 'Eurocode 7 以分項係數與設計方法處理 GEO/STR 限界狀態',
      note: 'Eurocode 7 不宜簡化成單一安全係數；本頁僅保留自訂 FS 記錄。',
      loadCases: {}
    }
  };

  const LOAD_CASE_FALLBACK = {
    'long-term': { label: '長期載重', verticalBearingFs: 3.0, horizontalResistanceFs: 1.5, stabilityFs: 1.5, basis: '使用者自訂' },
    'short-term': { label: '短期載重', verticalBearingFs: 2.0, horizontalResistanceFs: 1.2, stabilityFs: 1.2, basis: '使用者自訂' },
    'ultimate': { label: '極限限界狀態', verticalBearingFs: 1.1, horizontalResistanceFs: 1.1, stabilityFs: 1.1, basis: '使用者自訂' }
  };

  function provenance() {
    return {
      core: CORE_NAME,
      version: CORE_VERSION,
      inputSchemaVersion: INPUT_SCHEMA_VERSION,
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
      logicSignature: LOGIC_SIGNATURE
    };
  }

  function checkItem(key, label, passed, detail, value, limit, unit) {
    return {
      key,
      label,
      status: passed ? 'pass' : 'fail',
      passed: Boolean(passed),
      detail,
      value,
      limit,
      unit
    };
  }

  function numberValue(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function positiveOrDefault(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    return numberValue(value);
  }

  function textValue(value, fallback) {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }

  // Boussinesq 矩形載重角點應力影響係數 Iσ(m,n)（Newmark 解）；m=B'/z、n=L'/z。
  function boussinesqCornerFactor(m, n) {
    if (!(m > 0) || !(n > 0)) return 0;
    const m2 = m * m, n2 = n * n;
    const A = m2 + n2 + 1;
    const sqrtA = Math.sqrt(A);
    const term1 = (2 * m * n * sqrtA / (A + m2 * n2)) * ((A + 1) / A);
    const term2 = Math.atan2(2 * m * n * sqrtA, A - m2 * n2);
    return (term1 + term2) / (4 * Math.PI);
  }
  // 矩形基礎中心點下方深度 z 之應力影響係數（4 個象限角點疊加）。
  function boussinesqCenterFactor(B, L, z) {
    if (!(z > 0) || !(B > 0) || !(L > 0)) return 0;
    return 4 * boussinesqCornerFactor((B / 2) / z, (L / 2) / z);
  }
  // 2:1 應力分散法：Δσ = q·B·L / [(B+z)(L+z)]，回傳影響係數（乘以 q 即為 Δσ）。
  function twoToOneFactor(B, L, z) {
    if (!(z >= 0) || !(B > 0) || !(L > 0)) return 0;
    return (B * L) / ((B + z) * (L + z));
  }
  function stressInfluenceFactor(method, B, L, z) {
    return method === 'boussinesq' ? boussinesqCenterFactor(B, L, z) : twoToOneFactor(B, L, z);
  }

  // 一維壓密沉陷（NC / OC 判別）：sigma0=初始有效覆土應力，sigmaP=前期壓密應力（≤sigma0 視為 NC）。
  function consolidationSettlementLayer(h, e0, Cc, Cr, sigma0, sigmaP, deltaSigma) {
    if (!(h > 0) || !(e0 > -1) || !(sigma0 > 0)) {
      return { Sc: NaN, regime: 'invalid', sigmaFinal: NaN };
    }
    const sigmaFinal = sigma0 + Math.max(deltaSigma, 0);
    const isOC = sigmaP > sigma0 * (1 + 1e-9);
    let Sc, regime;
    if (!isOC) {
      Sc = Cc * h / (1 + e0) * Math.log10(sigmaFinal / sigma0);
      regime = 'normally-consolidated';
    } else if (sigmaFinal <= sigmaP * (1 + 1e-9)) {
      Sc = Cr * h / (1 + e0) * Math.log10(sigmaFinal / sigma0);
      regime = 'overconsolidated-recompression';
    } else {
      Sc = Cr * h / (1 + e0) * Math.log10(sigmaP / sigma0) + Cc * h / (1 + e0) * Math.log10(sigmaFinal / sigmaP);
      regime = 'overconsolidated-straddling';
    }
    return { Sc, regime, sigmaFinal };
  }
  const CONSOLIDATION_REGIME_LABELS = {
    'normally-consolidated': '正常壓密（NC）',
    'overconsolidated-recompression': '過壓密（OC，再壓縮範圍內）',
    'overconsolidated-straddling': '過壓密（OC，跨越 σp′ 進入處女壓縮線）',
    'invalid': '輸入不足或不合理'
  };
  const DRAINAGE_LABELS = {
    single: '單面排水',
    double: '雙面排水'
  };

  // Terzaghi 壓密度 U(%) → 時間因數 Tv（標準近似式；U≤60% 拋物線、U>60% 對數擬合）。
  function timeFactorFromDegree(Upercent) {
    if (!(Upercent >= 0)) return NaN;
    const u = Upercent / 100;
    if (Upercent <= 60) return (Math.PI / 4) * u * u;
    return 1.781 - 0.933 * Math.log10(100 - Upercent);
  }
  const TV_50 = timeFactorFromDegree(50);
  const TV_90 = timeFactorFromDegree(90);
  const TV_AT_U60 = (Math.PI / 4) * 0.36; // U=60% 為兩段公式交界之 Tv

  // 時間因數 Tv → 壓密度 U(%)（上式反函數）；U 上限截於 99.9% 避免對數項發散。
  function degreeFromTimeFactor(Tv) {
    if (!(Tv >= 0)) return NaN;
    if (Tv <= TV_AT_U60) {
      return Math.min(100 * Math.sqrt(4 * Tv / Math.PI), 60);
    }
    const U = 100 - Math.pow(10, (1.781 - Tv) / 0.933);
    return Math.min(Math.max(U, 60), 99.9);
  }

  // 單層壓密時間率：Hdr=排水路徑長，t50/t90=達 50%/90% 壓密所需時間（年，與 cv 單位 m²/年一致）；
  // 若提供 evaluationYears，另計該時刻壓密度 U(t) 與對應沉陷量（Sc 為該層最終壓密沉陷量，m）。
  function consolidationTimeRate(h, cv, drainageType, Sc, evaluationYears) {
    if (!(h > 0) || !(cv > 0)) return null;
    const Hdr = drainageType === 'single' ? h : h / 2;
    const t50 = TV_50 * Hdr * Hdr / cv;
    const t90 = TV_90 * Hdr * Hdr / cv;
    let atTarget = null;
    if (evaluationYears > 0) {
      const Tv = cv * evaluationYears / (Hdr * Hdr);
      const Upercent = degreeFromTimeFactor(Tv);
      const settlementAtT = Number.isFinite(Sc) ? (Upercent / 100) * Sc : NaN;
      atTarget = { evaluationYears, Tv, Upercent, settlementAtT };
    }
    return { Hdr, t50, t90, atTarget };
  }

  function sanitizeConsolidationLayers(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (Ly) {
      Ly = Ly || {};
      return {
        h: numberValue(Ly.h),
        zMid: numberValue(Ly.zMid),
        sigma0: numberValue(Ly.sigma0),
        e0: numberValue(Ly.e0),
        Cc: numberValue(Ly.Cc),
        Cr: numberValue(Ly.Cr),
        sigmaP: numberValue(Ly.sigmaP),
        cv: numberValue(Ly.cv),
        drainageType: Ly.drainageType === 'single' ? 'single' : 'double'
      };
    });
  }

  function getDesignBasis(designCode, loadCondition) {
    const preset = DESIGN_CODE_PRESETS[designCode] || DESIGN_CODE_PRESETS['tw-foundation-112'];
    const fallback = LOAD_CASE_FALLBACK[loadCondition] || LOAD_CASE_FALLBACK['long-term'];
    const loadCase = preset.loadCases[loadCondition] || fallback;
    return {
      designCode: preset.id,
      designCodeLabel: preset.label,
      loadCondition: loadCondition || 'long-term',
      loadConditionLabel: loadCase.label,
      reference: preset.reference,
      basis: loadCase.basis,
      note: preset.note,
      presetVerticalBearingFs: loadCase.verticalBearingFs,
      presetHorizontalResistanceFs: loadCase.horizontalResistanceFs,
      presetStabilityFs: loadCase.stabilityFs,
      isReferenceMode: /reference$/.test(preset.id),
      isCustomMode: preset.id === 'project-custom'
    };
  }

  function criteriaSource(input, basis, bearingSafetyFactor, fsSlideReq, fsOverReq) {
    if (basis.isCustomMode || basis.isReferenceMode) return 'user-defined';
    const fsMatches = Math.abs(bearingSafetyFactor - basis.presetVerticalBearingFs) < 1e-9
      && Math.abs(fsSlideReq - basis.presetHorizontalResistanceFs) < 1e-9
      && Math.abs(fsOverReq - basis.presetStabilityFs) < 1e-9;
    return fsMatches ? 'code-preset' : 'code-preset-overridden';
  }

  function normalizeInput(input) {
    const designCode = textValue(input.designCode, 'tw-foundation-112');
    const loadCondition = textValue(input.loadCondition, 'long-term');
    const bearingMode = textValue(input.bearingMode, 'allowable');
    const basis = getDesignBasis(designCode, loadCondition);
    const bearingSafetyFactor = positiveOrDefault(input.bearingSafetyFactor, basis.presetVerticalBearingFs);
    const qaInput = numberValue(input.qa);
    const qult = numberValue(input.qult);
    const qa = bearingMode === 'ultimate' && bearingSafetyFactor > 0 ? qult / bearingSafetyFactor : qaInput;
    const fsSlideReq = positiveOrDefault(input.fsSlideReq, basis.presetHorizontalResistanceFs);
    const fsOverReq = positiveOrDefault(input.fsOverReq, basis.presetStabilityFs);
    return {
      designCode: basis.designCode,
      loadCondition: basis.loadCondition,
      bearingMode,
      bearingSafetyFactor,
      qult,
      qaInput,
      qa,
      fsSlideReq,
      fsOverReq,
      designBasis: Object.assign({}, basis, {
        bearingMode,
        bearingSafetyFactor,
        fsSlideReq,
        fsOverReq,
        criteriaSource: criteriaSource(input, basis, bearingSafetyFactor, fsSlideReq, fsOverReq)
      }),
      B: numberValue(input.B),
      L: numberValue(input.L),
      t: numberValue(input.t),
      Df: numberValue(input.Df),
      gammaC: numberValue(input.gammaC),
      gammaS: numberValue(input.gammaS),
      P: numberValue(input.P),
      Mx: numberValue(input.Mx),
      My: numberValue(input.My),
      Hx: numberValue(input.Hx),
      Hy: numberValue(input.Hy),
      mu: numberValue(input.mu),
      passive: numberValue(input.passive),
      includeSelfWeight: Boolean(input.includeSelfWeight),
      effectiveAreaCheck: Boolean(input.effectiveAreaCheck),
      Es: numberValue(input.Es),
      nu: Object.prototype.hasOwnProperty.call(input, 'nu') ? numberValue(input.nu) : 0.3,
      settlementInfluence: Object.prototype.hasOwnProperty.call(input, 'settlementInfluence') ? numberValue(input.settlementInfluence) : 0.88,
      allowableSettlementCm: Object.prototype.hasOwnProperty.call(input, 'allowableSettlementCm') ? numberValue(input.allowableSettlementCm) : 2.5,
      consolidationEnable: Boolean(input.consolidationEnable),
      consolidationMethod: input.consolidationMethod === 'boussinesq' ? 'boussinesq' : '2:1',
      consolidationLayers: sanitizeConsolidationLayers(input.consolidationLayers),
      evaluationYears: numberValue(input.evaluationYears)
    };
  }

  function validateInput(input) {
    const i = normalizeInput(input);
    const errors = [];
    if (i.B <= 0 || i.L <= 0) errors.push('基礎 B、L 必須大於 0。');
    if (i.qa <= 0) errors.push('容許地耐力 qa 必須大於 0。');
    if (i.bearingMode === 'ultimate' && i.qult <= 0) errors.push('由極限支承力換算時，qult 必須大於 0。');
    if (i.bearingSafetyFactor <= 0) errors.push('垂直支承安全係數必須大於 0。');
    if (i.P <= 0 && !i.includeSelfWeight) errors.push('未納入自重時，外加垂直力 P 應大於 0。');
    if (i.fsSlideReq <= 0 || i.fsOverReq <= 0) errors.push('安全係數需求值必須大於 0。');
    if (i.mu < 0 || i.passive < 0) errors.push('摩擦係數與被動抵抗不得為負。');
    if (i.consolidationEnable) {
      if (i.consolidationLayers.length < 1) errors.push('壓密沉陷至少需輸入 1 層黏土層。');
      i.consolidationLayers.forEach(function (Ly, idx) {
        const n = idx + 1;
        if (!(Ly.h > 0)) errors.push(`第 ${n} 層壓密層厚度必須大於 0。`);
        if (!(Ly.zMid >= 0)) errors.push(`第 ${n} 層中點深度不得為負。`);
        if (!(Ly.sigma0 > 0)) errors.push(`第 ${n} 層初始有效覆土應力 σ0′ 必須大於 0。`);
        if (!(Ly.e0 > -1)) errors.push(`第 ${n} 層初始孔隙比 e0 必須大於 -1。`);
        if (Ly.Cc < 0 || Ly.Cr < 0) errors.push(`第 ${n} 層壓縮指數 Cc / 再壓縮指數 Cr 不得為負。`);
        if (Ly.cv < 0) errors.push(`第 ${n} 層壓密係數 cv 不得為負。`);
      });
      if (i.evaluationYears < 0) errors.push('評估年限不得為負。');
    }
    return errors;
  }

  function calculate(input) {
    const i = normalizeInput(input);
    const area = i.B * i.L;
    const soilCoverDepth = Math.max(i.Df - i.t, 0);
    const footingWeight = i.includeSelfWeight ? area * i.t * i.gammaC : 0;
    const soilWeight = i.includeSelfWeight ? area * soilCoverDepth * i.gammaS : 0;
    const Ptotal = i.P + footingWeight + soilWeight;
    const qAvg = Ptotal / area;
    const ex = Ptotal > 0 ? i.My / Ptotal : Infinity;
    const ey = Ptotal > 0 ? i.Mx / Ptotal : Infinity;
    const kernUtil = Math.abs(ex) / i.B + Math.abs(ey) / i.L;
    const qFromMx = 6 * i.Mx / (i.B * i.L * i.L);
    const qFromMy = 6 * i.My / (i.L * i.B * i.B);
    const corners = [
      { name: '+X +Y', q: qAvg + qFromMy + qFromMx },
      { name: '+X -Y', q: qAvg + qFromMy - qFromMx },
      { name: '-X +Y', q: qAvg - qFromMy + qFromMx },
      { name: '-X -Y', q: qAvg - qFromMy - qFromMx }
    ];
    const qmax = Math.max.apply(null, corners.map(c => c.q));
    const qmin = Math.min.apply(null, corners.map(c => c.q));
    const qmaxCorner = corners.reduce((a, b) => (b.q > a.q ? b : a), corners[0]);
    const qminCorner = corners.reduce((a, b) => (b.q < a.q ? b : a), corners[0]);
    const fullContact = qmin >= -1e-9 && kernUtil <= (1 / 6) + 1e-9;
    const bearingOk = fullContact && qmax <= i.qa;
    const H = Math.hypot(i.Hx, i.Hy);
    const slideResistance = i.mu * Ptotal + i.passive;
    const fsSlide = H > 0 ? slideResistance / H : Infinity;
    const slideOk = fsSlide >= i.fsSlideReq;
    const fsOverB = Math.abs(i.My) > 0 ? Ptotal * (i.B / 2) / Math.abs(i.My) : Infinity;
    const fsOverL = Math.abs(i.Mx) > 0 ? Ptotal * (i.L / 2) / Math.abs(i.Mx) : Infinity;
    const fsOver = Math.min(fsOverB, fsOverL);
    const overOk = fsOver >= i.fsOverReq;
    const compressionOk = Ptotal > 0;

    // ── Meyerhof 有效面積承壓（偏心折減；報告恆算，opt-in 才納入 pass/fail）──
    const exAbs = Number.isFinite(ex) ? Math.abs(ex) : Infinity;
    const eyAbs = Number.isFinite(ey) ? Math.abs(ey) : Infinity;
    const effWidthB = i.B - 2 * exAbs;
    const effWidthL = i.L - 2 * eyAbs;
    const effArea = (effWidthB > 0 && effWidthL > 0) ? effWidthB * effWidthL : 0;
    const qEff = effArea > 0 ? Ptotal / effArea : Infinity;
    const qEffOk = effArea > 0 && qEff <= i.qa;
    const effectiveAreaOk = !i.effectiveAreaCheck || qEffOk;

    // ── 立即彈性沉陷初估（opt-in：提供 Es 才計算）Se = q·B·(1−ν²)·Iw / Es ──
    const hasSettlement = i.Es > 0;
    const settlementM = hasSettlement ? (qAvg * i.B * (1 - i.nu * i.nu) * i.settlementInfluence) / i.Es : null;
    const settlementCm = hasSettlement ? settlementM * 100 : null;
    const settlementOk = !hasSettlement || settlementCm <= i.allowableSettlementCm;

    // ── 壓密沉陷（opt-in：Boussinesq / 2:1 應力增量 + Cc/Cr 一維壓密）──
    // 淨壓力＝平均底壓扣除基礎面原有效覆土應力（近似，不含水位修正）。
    const qNet = Math.max(qAvg - i.gammaS * i.Df, 0);
    const hasConsolidation = i.consolidationEnable && i.consolidationLayers.length > 0;
    const consolidationLayerResults = hasConsolidation ? i.consolidationLayers.map(function (Ly) {
      const influenceFactor = stressInfluenceFactor(i.consolidationMethod, i.B, i.L, Ly.zMid);
      const deltaSigma = qNet * influenceFactor;
      const r = consolidationSettlementLayer(Ly.h, Ly.e0, Ly.Cc, Ly.Cr, Ly.sigma0, Ly.sigmaP, deltaSigma);
      const timeRate = consolidationTimeRate(Ly.h, Ly.cv, Ly.drainageType, r.Sc, i.evaluationYears);
      return Object.assign({}, Ly, {
        influenceFactor, deltaSigma,
        sigmaFinal: r.sigmaFinal, Sc: r.Sc, regime: r.regime, regimeLabel: CONSOLIDATION_REGIME_LABELS[r.regime],
        drainageTypeLabel: DRAINAGE_LABELS[Ly.drainageType],
        hasTimeRate: Boolean(timeRate),
        timeRate
      });
    }) : [];
    const consolidationValid = hasConsolidation && consolidationLayerResults.every(function (r) { return Number.isFinite(r.Sc); });
    const consolidationSettlementM = hasConsolidation ? consolidationLayerResults.reduce(function (sum, r) { return sum + (Number.isFinite(r.Sc) ? r.Sc : 0); }, 0) : null;
    const consolidationSettlementCm = hasConsolidation ? consolidationSettlementM * 100 : null;
    const consolidationOk = !hasConsolidation || (consolidationValid && consolidationSettlementCm <= i.allowableSettlementCm);
    const combinedSettlementCm = (hasSettlement ? settlementCm : 0) + (hasConsolidation && consolidationValid ? consolidationSettlementCm : 0);

    // 僅當「所有」壓密層皆提供 cv 時，才合計評估年限之壓密度沉陷量（避免混雜已知/未知速率層）。
    const allLayersHaveTimeRate = hasConsolidation && consolidationLayerResults.every(function (r) { return r.hasTimeRate; });
    const hasTimeRateEvaluation = allLayersHaveTimeRate && i.evaluationYears > 0;
    const settlementAtEvaluationCm = hasTimeRateEvaluation
      ? consolidationLayerResults.reduce(function (sum, r) { return sum + (r.timeRate.atTarget ? r.timeRate.atTarget.settlementAtT * 100 : 0); }, 0)
      : null;
    const governingT90Years = allLayersHaveTimeRate
      ? Math.max.apply(null, consolidationLayerResults.map(function (r) { return r.timeRate.t90; }))
      : null;

    const overallOk = compressionOk && bearingOk && slideOk && overOk && effectiveAreaOk && settlementOk && consolidationOk;
    const summary = {
      status: overallOk ? 'pass' : 'fail',
      headline: overallOk ? '局部穩定檢核初步通過' : '需修正尺寸 / 載重，或改採正式詳算',
      primaryMetrics: [
        { key: 'Ptotal', label: '垂直合力', value: Ptotal, unit: 'tf' },
        { key: 'qmax', label: '最大底壓', value: qmax, unit: 'tf/m2' },
        { key: 'fsSlide', label: '抗滑 FS', value: fsSlide, unit: '' },
        { key: 'fsOver', label: '抗傾覆 FS', value: fsOver, unit: '' }
      ]
    };
    const checks = [
      checkItem('compression', '垂直合力為壓力', compressionOk, `Ptotal = ${Ptotal}`, Ptotal, 0, 'tf'),
      checkItem('full-contact', '合力位於中央核內', fullContact, `kernUtil = ${kernUtil}`, kernUtil, 1 / 6, ''),
      checkItem('bearing', '容許地耐力', bearingOk, `qmax = ${qmax}, qa = ${i.qa}`, qmax, i.qa, 'tf/m2'),
      checkItem('sliding', '抗滑', slideOk, `fsSlide = ${fsSlide}, fsSlideReq = ${i.fsSlideReq}`, fsSlide, i.fsSlideReq, ''),
      checkItem('overturning', '抗傾覆', overOk, `fsOver = ${fsOver}, fsOverReq = ${i.fsOverReq}`, fsOver, i.fsOverReq, '')
    ];
    if (i.effectiveAreaCheck) {
      checks.push(checkItem('bearing-effective', 'Meyerhof 有效面積承壓', qEffOk, `qEff = ${qEff}, qa = ${i.qa}, B' = ${effWidthB}, L' = ${effWidthL}`, qEff, i.qa, 'tf/m2'));
    }
    if (hasSettlement) {
      checks.push(checkItem('settlement', '彈性沉陷初估', settlementOk, `Se = ${settlementCm} cm, 容許 = ${i.allowableSettlementCm} cm`, settlementCm, i.allowableSettlementCm, 'cm'));
    }
    if (hasConsolidation) {
      if (consolidationValid) {
        checks.push(checkItem('consolidation-settlement', '壓密沉陷初估', consolidationOk,
          `Sc(總) = ${consolidationSettlementCm} cm, 容許 = ${i.allowableSettlementCm} cm, 方法 = ${i.consolidationMethod}`,
          consolidationSettlementCm, i.allowableSettlementCm, 'cm'));
      } else {
        checks.push(checkItem('consolidation-settlement', '壓密沉陷初估', false, '部分壓密層輸入不足或不合理，無法計算', NaN, i.allowableSettlementCm, 'cm'));
      }
    }

    return Object.assign({}, i, {
      effWidthB,
      effWidthL,
      effArea,
      qEff,
      qEffOk,
      effectiveAreaOk,
      hasSettlement,
      settlementM,
      settlementCm,
      settlementOk,
      qNet,
      hasConsolidation,
      consolidationValid,
      consolidationLayerResults,
      consolidationSettlementM,
      consolidationSettlementCm,
      consolidationOk,
      combinedSettlementCm,
      allLayersHaveTimeRate,
      hasTimeRateEvaluation,
      settlementAtEvaluationCm,
      governingT90Years,
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
      designCode: i.designCode,
      loadCondition: i.loadCondition,
      bearingMode: i.bearingMode,
      bearingSafetyFactor: i.bearingSafetyFactor,
      qult: i.qult,
      qaInput: i.qaInput,
      designBasis: i.designBasis,
      area,
      soilCoverDepth,
      footingWeight,
      soilWeight,
      Ptotal,
      qAvg,
      ex,
      ey,
      kernUtil,
      qFromMx,
      qFromMy,
      corners,
      qmax,
      qmin,
      qmaxCorner,
      qminCorner,
      fullContact,
      bearingOk,
      H,
      slideResistance,
      fsSlide,
      slideOk,
      fsOverB,
      fsOverL,
      fsOver,
      overOk,
      compressionOk,
      overallOk,
      summary,
      checks,
      provenance: provenance()
    });
  }

  return {
    version: CORE_VERSION,
    inputSchemaVersion: INPUT_SCHEMA_VERSION,
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    logicSignature: LOGIC_SIGNATURE,
    designCodePresets: DESIGN_CODE_PRESETS,
    consolidationRegimeLabels: CONSOLIDATION_REGIME_LABELS,
    drainageLabels: DRAINAGE_LABELS,
    boussinesqCornerFactor,
    boussinesqCenterFactor,
    twoToOneFactor,
    stressInfluenceFactor,
    consolidationSettlementLayer,
    timeFactorFromDegree,
    degreeFromTimeFactor,
    consolidationTimeRate,
    getDesignBasis,
    provenance,
    normalizeInput,
    validateInput,
    calculate
  };
});
