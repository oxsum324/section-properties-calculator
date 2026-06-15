(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.FoundationLocalCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CORE_NAME = 'FoundationLocalCore';
  const CORE_VERSION = '0.2.0';
  const INPUT_SCHEMA_VERSION = 'foundation-local.input.v0.2';
  const RESULT_SCHEMA_VERSION = 'foundation-local.result.v0.2';
  const LOGIC_SIGNATURE = 'foundation-local-core:v0.2:design-basis-service-stability:qmax-qmin-sliding-overturning';

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
      includeSelfWeight: Boolean(input.includeSelfWeight)
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
    const overallOk = compressionOk && bearingOk && slideOk && overOk;
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

    return Object.assign({}, i, {
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
    getDesignBasis,
    provenance,
    normalizeInput,
    validateInput,
    calculate
  };
});
