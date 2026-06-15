(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.EarthPressureCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CORE_NAME = 'EarthPressureCore';
  const CORE_VERSION = '0.4.0';
  const INPUT_SCHEMA_VERSION = 'earth-pressure.input.v0.4';
  const RESULT_SCHEMA_VERSION = 'earth-pressure.result.v0.4';
  const LOGIC_SIGNATURE = 'earth-pressure-core:v0.4:wall-type-output-rankine-model-assumptions-passive-policy-water-stability';

  const DESIGN_REFERENCE_LABELS = {
    taiwanFoundation2023: '台灣《建築物基礎構造設計規範》112 年版（穩定檢核初估）',
    rankineTextbook: 'Rankine 土壓理論 / 土壤力學教科書初估',
    projectManual: '專案指定準則（需人工確認）'
  };

  const WALL_CONDITION_LABELS = {
    yielding: '牆體可產生足夠位移，採主動土壓',
    restrained: '牆體受約束或近地下室外牆，採靜止土壓',
    manual: '手動指定土壓模式'
  };

  const WALL_TYPE_LABELS = {
    cantilever: '懸臂式擋土牆',
    gravity: '重力式擋土牆'
  };

  const WATER_MODEL_LABELS = {
    hydrostatic: '依 hw 納入靜水壓',
    none: '不納入地下水壓'
  };

  const PASSIVE_MODE_LABELS = {
    ignore: '不採計被動抵抗',
    reduced: '折減採計被動抵抗',
    includeFull: '全額採計被動抵抗'
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

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return '∞';
    return Number(value).toFixed(digits);
  }

  function choice(value, labels, fallback) {
    return Object.prototype.hasOwnProperty.call(labels, value) ? value : fallback;
  }

  function resolvePressureMode(input, wallCondition) {
    if (wallCondition === 'yielding') return 'active';
    if (wallCondition === 'restrained') return 'atRest';
    return input.mode === 'atRest' ? 'atRest' : 'active';
  }

  function normalizeInput(input) {
    const H = numberValue(input.H);
    const rawWaterDepth = Math.min(Math.max(numberValue(input.waterDepth), 0), Math.max(H, 0));
    const hasWallCondition = Object.prototype.hasOwnProperty.call(input, 'wallCondition');
    const wallCondition = hasWallCondition
      ? choice(input.wallCondition, WALL_CONDITION_LABELS, 'manual')
      : 'manual';
    const mode = resolvePressureMode(input, wallCondition);
    const wallType = choice(input.wallType, WALL_TYPE_LABELS, 'cantilever');
    const designReference = choice(input.designReference, DESIGN_REFERENCE_LABELS, 'taiwanFoundation2023');
    const waterModel = Object.prototype.hasOwnProperty.call(input, 'waterModel')
      ? choice(input.waterModel, WATER_MODEL_LABELS, 'hydrostatic')
      : (rawWaterDepth > 0 ? 'hydrostatic' : 'none');
    const waterDepth = waterModel === 'none' ? 0 : rawWaterDepth;
    const passive = numberValue(input.passive);
    const passiveMode = Object.prototype.hasOwnProperty.call(input, 'passiveMode')
      ? choice(input.passiveMode, PASSIVE_MODE_LABELS, 'ignore')
      : (passive > 0 ? 'includeFull' : 'ignore');
    const passiveReductionFactor = numberValue(input.passiveReductionFactor || 0.5);
    const passiveFactor = passiveMode === 'ignore'
      ? 0
      : (passiveMode === 'reduced' ? passiveReductionFactor : 1);
    return {
      designReference,
      wallType,
      wallCondition,
      H,
      gammaSoil: numberValue(input.gammaSoil),
      phiDeg: numberValue(input.phiDeg),
      mode,
      surcharge: numberValue(input.surcharge),
      waterModel,
      waterDepth,
      gammaWater: numberValue(input.gammaWater),
      baseB: numberValue(input.baseB),
      verticalLoad: numberValue(input.verticalLoad),
      qa: numberValue(input.qa),
      mu: numberValue(input.mu),
      passive,
      passiveMode,
      passiveReductionFactor,
      passiveFactor,
      effectivePassive: passive * passiveFactor,
      fsSlideReq: numberValue(input.fsSlideReq),
      fsOverReq: numberValue(input.fsOverReq)
    };
  }

  function validateInput(input) {
    const i = normalizeInput(input);
    const errors = [];
    if (i.H <= 0) errors.push('擋土高度 H 必須大於 0。');
    if (i.gammaSoil <= 0) errors.push('土壤單位重 γ 必須大於 0。');
    if (i.phiDeg < 0 || i.phiDeg >= 60) errors.push('內摩擦角 φ 應介於 0° 與 60° 之間。');
    if (i.surcharge < 0) errors.push('均佈超載 q 不得為負。');
    if (numberValue(input.waterDepth) < 0 || numberValue(input.waterDepth) > i.H) errors.push('地下水深度 hw 應介於 0 與 H 之間。');
    if (i.gammaWater < 0) errors.push('水單位重不得為負。');
    if (i.baseB <= 0) errors.push('基底寬 B 必須大於 0。');
    if (i.verticalLoad <= 0) errors.push('垂直穩定重量 V 必須大於 0。');
    if (i.qa <= 0) errors.push('容許承載壓 qa 必須大於 0。');
    if (i.mu < 0 || i.passive < 0) errors.push('摩擦係數與被動抵抗不得為負。');
    if (i.passiveMode === 'reduced' && (i.passiveReductionFactor <= 0 || i.passiveReductionFactor > 1)) errors.push('被動抵抗折減係數應大於 0 且不大於 1。');
    if (i.fsSlideReq <= 0 || i.fsOverReq <= 0) errors.push('安全係數需求值必須大於 0。');
    return errors;
  }

  function calculate(input) {
    const i = normalizeInput(input);
    const phiRad = i.phiDeg * Math.PI / 180;
    const sinPhi = Math.sin(phiRad);
    const Ka = (1 - sinPhi) / (1 + sinPhi);
    const K0 = 1 - sinPhi;
    const K = i.mode === 'atRest' ? K0 : Ka;
    const modeLabel = i.mode === 'atRest' ? '靜止土壓 K0' : '主動土壓 Ka';
    const selectedModeReason = i.wallCondition === 'yielding'
      ? '牆體可產生足夠位移，採 Rankine 主動土壓。'
      : (i.wallCondition === 'restrained'
        ? '牆體受約束或近地下室外牆，採 Rankine 靜止土壓。'
        : '由使用者手動指定本次土壓模式。');
    const backfillModelLabel = '水平背填、垂直牆背、無黏性土 Rankine 初估';

    const soilForce = 0.5 * K * i.gammaSoil * i.H * i.H;
    const soilMoment = soilForce * i.H / 3;
    const surchargeForce = K * i.surcharge * i.H;
    const surchargeMoment = surchargeForce * i.H / 2;
    const waterForce = 0.5 * i.gammaWater * i.waterDepth * i.waterDepth;
    const waterMoment = waterForce * i.waterDepth / 3;
    const totalForce = soilForce + surchargeForce + waterForce;
    const overturningMoment = soilMoment + surchargeMoment + waterMoment;
    const resultantHeight = totalForce > 0 ? overturningMoment / totalForce : 0;

    const slideResistance = i.mu * i.verticalLoad + i.effectivePassive;
    const fsSlide = totalForce > 0 ? slideResistance / totalForce : Infinity;
    const slideOk = fsSlide >= i.fsSlideReq;
    const resistingMoment = i.verticalLoad * i.baseB / 2;
    const fsOver = overturningMoment > 0 ? resistingMoment / overturningMoment : Infinity;
    const overOk = fsOver >= i.fsOverReq;

    const e = i.verticalLoad > 0 ? overturningMoment / i.verticalLoad : Infinity;
    const kernLimit = i.baseB / 6;
    const qAvg = i.verticalLoad / i.baseB;
    const qmax = qAvg * (1 + 6 * e / i.baseB);
    const qmin = qAvg * (1 - 6 * e / i.baseB);
    const kernUtil = i.baseB > 0 ? e / i.baseB : Infinity;
    const fullContact = qmin >= -1e-9 && e <= kernLimit + 1e-9;
    const bearingOk = fullContact && qmax <= i.qa;
    const overallOk = bearingOk && slideOk && overOk;
    const bearingUtilization = i.qa > 0 ? qmax / i.qa : Infinity;
    const slidingUtilization = Number.isFinite(fsSlide) && fsSlide > 0 ? i.fsSlideReq / fsSlide : Infinity;
    const overturningUtilization = Number.isFinite(fsOver) && fsOver > 0 ? i.fsOverReq / fsOver : Infinity;
    const controllingItems = [
      { key: 'bearing', label: '基底承壓', utilization: bearingUtilization, passed: bearingOk },
      { key: 'sliding', label: '抗滑', utilization: slidingUtilization, passed: slideOk },
      { key: 'overturning', label: '抗傾覆', utilization: overturningUtilization, passed: overOk }
    ].sort(function (a, b) { return b.utilization - a.utilization; });
    const controllingItem = controllingItems[0];
    const baseWidthHeightRatio = i.H > 0 ? i.baseB / i.H : Infinity;
    const wallTypeOutput = i.wallType === 'gravity'
      ? {
        headline: '重力式工作輸出',
        focus: '以牆體自重、基底寬度與偏心控制整體穩定。',
        primaryResult: `控制項：${controllingItem.label}；B/H = ${formatNumber(baseWidthHeightRatio, 2)}`,
        outputGroups: [
          { label: '自重與抗傾覆', detail: `V = ${formatNumber(i.verticalLoad, 2)} tf/m；Mr = ${formatNumber(resistingMoment, 2)} tf·m/m；FSover = ${formatNumber(fsOver, 2)}` },
          { label: '抗滑與承壓', detail: `FSslide = ${formatNumber(fsSlide, 2)}；qmax = ${formatNumber(qmax, 2)} tf/m2；qmin = ${formatNumber(qmin, 2)} tf/m2` },
          { label: '重力式後續檢核', detail: '應補斷面塊體自重、趾踵接觸壓、牆身壓應力與局部剪壓檢核。' }
        ]
      }
      : {
        headline: '懸臂式工作輸出',
        focus: '以土壓、底版反力與牆身 / 趾版 / 踵版構件設計銜接為主。',
        primaryResult: `控制項：${controllingItem.label}；作用高 = ${formatNumber(resultantHeight, 2)} m`,
        outputGroups: [
          { label: '整體穩定', detail: `FSover = ${formatNumber(fsOver, 2)}；FSslide = ${formatNumber(fsSlide, 2)}；qmax = ${formatNumber(qmax, 2)} tf/m2` },
          { label: '底版反力', detail: `e = ${formatNumber(e, 3)} m；B/6 = ${formatNumber(kernLimit, 3)} m；qmin = ${formatNumber(qmin, 2)} tf/m2` },
          { label: '懸臂式後續檢核', detail: '應補牆身、趾版、踵版之彎矩、剪力與 RC 配筋檢核。' }
        ]
      };
    const summary = {
      status: overallOk ? 'pass' : 'fail',
      headline: overallOk ? '土壓局部穩定初估通過' : '土壓或穩定條件需修正 / 詳算',
      primaryMetrics: [
        { key: 'K', label: '土壓係數', value: K, unit: '' },
        { key: 'totalForce', label: '側向合力', value: totalForce, unit: 'tf/m' },
        { key: 'fsSlide', label: '抗滑 FS', value: fsSlide, unit: '' },
        { key: 'fsOver', label: '抗傾覆 FS', value: fsOver, unit: '' }
      ]
    };
    const checks = [
      checkItem('full-contact', '基底全壓縮', fullContact, `e = ${e}, kernLimit = ${kernLimit}`, e, kernLimit, 'm'),
      checkItem('bearing', '容許基底壓', bearingOk, `qmax = ${qmax}, qa = ${i.qa}`, qmax, i.qa, 'tf/m2'),
      checkItem('sliding', '抗滑', slideOk, `fsSlide = ${fsSlide}, fsSlideReq = ${i.fsSlideReq}, effectivePassive = ${i.effectivePassive}`, fsSlide, i.fsSlideReq, ''),
      checkItem('overturning', '抗傾覆', overOk, `fsOver = ${fsOver}, fsOverReq = ${i.fsOverReq}`, fsOver, i.fsOverReq, '')
    ];

    return Object.assign({}, i, {
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
      phiRad,
      sinPhi,
      Ka,
      K0,
      K,
      modeLabel,
      designReferenceLabel: DESIGN_REFERENCE_LABELS[i.designReference],
      wallTypeLabel: WALL_TYPE_LABELS[i.wallType],
      wallConditionLabel: WALL_CONDITION_LABELS[i.wallCondition],
      waterModelLabel: WATER_MODEL_LABELS[i.waterModel],
      passiveModeLabel: PASSIVE_MODE_LABELS[i.passiveMode],
      backfillModelLabel,
      selectedModeReason,
      soilForce,
      soilMoment,
      surchargeForce,
      surchargeMoment,
      waterForce,
      waterMoment,
      totalForce,
      overturningMoment,
      resultantHeight,
      slideResistance,
      fsSlide,
      slideOk,
      resistingMoment,
      fsOver,
      overOk,
      e,
      kernLimit,
      qAvg,
      qmax,
      qmin,
      kernUtil,
      bearingUtilization,
      slidingUtilization,
      overturningUtilization,
      controllingItems,
      controllingItem,
      baseWidthHeightRatio,
      fullContact,
      bearingOk,
      overallOk,
      wallTypeOutput,
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
    provenance,
    normalizeInput,
    validateInput,
    calculate
  };
});
