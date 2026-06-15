(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.EquipmentLoadCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CORE_NAME = 'EquipmentLoadCore';
  const CORE_VERSION = '0.2.0';
  const INPUT_SCHEMA_VERSION = 'equipment-load.input.v0.2';
  const RESULT_SCHEMA_VERSION = 'equipment-load.result.v0.2';
  const LOGIC_SIGNATURE = 'equipment-load-core:v0.2:point-contact-spread-concrete-punching-steelplate';
  const KGCM2_TO_TFM2 = 10;
  const M_TO_CM = 100;
  const PUNCHING_ALPHA = {
    interior: 40,
    edge: 30,
    corner: 20
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
    const isApplicable = passed !== null;
    return {
      key,
      label,
      status: isApplicable ? (passed ? 'pass' : 'fail') : 'not_applicable',
      passed: isApplicable ? Boolean(passed) : null,
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

  function punchingPositionValue(value) {
    return Object.prototype.hasOwnProperty.call(PUNCHING_ALPHA, value) ? value : 'interior';
  }

  function normalizeInput(input) {
    const source = input || {};
    return {
      equipmentWeight: numberValue(source.equipmentWeight),
      fluidWeight: numberValue(source.fluidWeight),
      accessoryWeight: numberValue(source.accessoryWeight),
      dynamicFactor: numberValue(source.dynamicFactor),
      supportCount: numberValue(source.supportCount),
      contactB: numberValue(source.contactB),
      contactL: numberValue(source.contactL),
      spreadDepth: numberValue(source.spreadDepth),
      planB: numberValue(source.planB),
      planL: numberValue(source.planL),
      allowableContact: numberValue(source.allowableContact),
      allowableSpread: numberValue(source.allowableSpread),
      allowablePoint: numberValue(source.allowablePoint),
      horizontalCoeff: numberValue(source.horizontalCoeff),
      concreteFc: numberValue(source.concreteFc),
      concreteThickness: numberValue(source.concreteThickness),
      effectiveDepth: numberValue(source.effectiveDepth),
      bearingSupportB: numberValue(source.bearingSupportB),
      bearingSupportL: numberValue(source.bearingSupportL),
      concretePhiBearing: numberValue(source.concretePhiBearing),
      concretePhiShear: numberValue(source.concretePhiShear),
      punchingPosition: punchingPositionValue(source.punchingPosition),
      steelPlateB: numberValue(source.steelPlateB),
      steelPlateL: numberValue(source.steelPlateL),
      steelPlateThickness: numberValue(source.steelPlateThickness),
      steelFy: numberValue(source.steelFy),
      steelPhiFlexure: numberValue(source.steelPhiFlexure)
    };
  }

  function isConcreteBearingEnabled(i) {
    return i.concreteFc > 0 && i.bearingSupportB > 0 && i.bearingSupportL > 0 && i.concretePhiBearing > 0;
  }

  function isPunchingEnabled(i) {
    return i.concreteFc > 0 && i.effectiveDepth > 0 && i.concretePhiShear > 0;
  }

  function isSteelPlateEnabled(i) {
    return i.steelPlateB > 0 && i.steelPlateL > 0 && i.steelPlateThickness > 0 && i.steelFy > 0 && i.steelPhiFlexure > 0;
  }

  function validateInput(input) {
    const i = normalizeInput(input);
    const errors = [];
    if (i.equipmentWeight + i.fluidWeight + i.accessoryWeight <= 0) errors.push('設備總重量必須大於 0。');
    if (i.dynamicFactor <= 0) errors.push('動力 / 衝擊係數必須大於 0。');
    if (i.supportCount < 1 || Math.abs(i.supportCount - Math.round(i.supportCount)) > 1e-9) errors.push('支承點數必須為正整數。');
    if (i.contactB <= 0 || i.contactL <= 0) errors.push('單支承接觸尺寸必須大於 0。');
    if (i.spreadDepth < 0) errors.push('分布厚度不得為負。');
    if (i.planB <= 0 || i.planL <= 0) errors.push('設備平面範圍 B、L 必須大於 0。');
    if (i.allowableContact <= 0 || i.allowableSpread <= 0) errors.push('容許接觸壓與容許分布壓必須大於 0。');
    if (i.allowablePoint < 0) errors.push('容許單點反力不得為負；若不檢核請填 0。');
    if (i.horizontalCoeff < 0) errors.push('水平係數不得為負。');
    if (isConcreteBearingEnabled(i)) {
      if (i.concreteThickness < 0) errors.push('混凝土厚度不得為負。');
    }
    if (isSteelPlateEnabled(i)) {
      if (i.steelPlateB < i.contactB) errors.push('鋼板寬 Bp 不得小於單支承接觸寬 b。');
      if (i.steelPlateL < i.contactL) errors.push('鋼板長 Lp 不得小於單支承接觸長 l。');
    }
    return errors;
  }

  function concreteBearingCheck(i, pointLoad, contactAreaEach) {
    if (!isConcreteBearingEnabled(i)) return null;
    const projectedB = i.contactB + 4 * i.concreteThickness;
    const projectedL = i.contactL + 4 * i.concreteThickness;
    const supportArea = i.bearingSupportB * i.bearingSupportL;
    const projectedArea = Math.max(contactAreaEach, projectedB * projectedL);
    const bearingAreaA2 = Math.max(contactAreaEach, Math.min(supportArea, projectedArea));
    const bearingFactor = Math.min(2, Math.sqrt(bearingAreaA2 / contactAreaEach));
    const concreteFcTfm2 = i.concreteFc * KGCM2_TO_TFM2;
    const nominal = 0.85 * concreteFcTfm2 * contactAreaEach * bearingFactor;
    const design = i.concretePhiBearing * nominal;
    return {
      ok: pointLoad <= design,
      areaA1: contactAreaEach,
      areaA2: bearingAreaA2,
      bearingFactor,
      nominal,
      design,
      allowablePressure: design / contactAreaEach,
      utilization: pointLoad / design
    };
  }

  function punchingShearCheck(i, pointLoad) {
    if (!isPunchingEnabled(i)) return null;
    const beta = Math.max(i.contactB / i.contactL, i.contactL / i.contactB);
    const alpha = PUNCHING_ALPHA[i.punchingPosition] || PUNCHING_ALPHA.interior;
    const bo = 2 * (i.contactB + i.contactL + 2 * i.effectiveDepth);
    const boCm = bo * M_TO_CM;
    const dCm = i.effectiveDepth * M_TO_CM;
    const sqrtFc = Math.sqrt(i.concreteFc);
    const vc1 = 1.06 * sqrtFc;
    const vc2 = 0.53 * (1 + 2 / beta) * sqrtFc;
    const vc3 = 0.265 * (alpha * dCm / boCm + 2) * sqrtFc;
    const vc = Math.min(vc1, vc2, vc3);
    const nominal = vc * boCm * dCm / 1000;
    const design = i.concretePhiShear * nominal;
    return {
      ok: pointLoad <= design,
      beta,
      alpha,
      bo,
      vc,
      vc1,
      vc2,
      vc3,
      nominal,
      design,
      utilization: pointLoad / design
    };
  }

  function steelPlateCheck(i, pointLoad) {
    if (!isSteelPlateEnabled(i)) return null;
    const plateArea = i.steelPlateB * i.steelPlateL;
    const qPlate = pointLoad / plateArea;
    const projectionB = Math.max(0, (i.steelPlateB - i.contactB) / 2);
    const projectionL = Math.max(0, (i.steelPlateL - i.contactL) / 2);
    const controllingProjection = Math.max(projectionB, projectionL);
    const momentDemand = qPlate * controllingProjection * controllingProjection / 2;
    const steelFyTfm2 = i.steelFy * KGCM2_TO_TFM2;
    const momentCapacity = i.steelPhiFlexure * steelFyTfm2 * i.steelPlateThickness * i.steelPlateThickness / 6;
    const requiredThickness = momentDemand > 0 ? Math.sqrt(6 * momentDemand / (i.steelPhiFlexure * steelFyTfm2)) : 0;
    return {
      ok: momentDemand <= momentCapacity,
      plateArea,
      qPlate,
      projectionB,
      projectionL,
      controllingProjection,
      momentDemand,
      momentCapacity,
      requiredThickness,
      utilization: momentDemand / momentCapacity
    };
  }

  function governingCheck(items) {
    return items
      .filter(item => Number.isFinite(item.utilization))
      .sort((a, b) => b.utilization - a.utilization)[0] || null;
  }

  function calculate(input) {
    const i = normalizeInput(input);
    const supportCount = Math.round(i.supportCount);
    const serviceWeight = i.equipmentWeight + i.fluidWeight + i.accessoryWeight;
    const designWeight = serviceWeight * i.dynamicFactor;
    const pointLoad = designWeight / supportCount;
    const contactAreaEach = i.contactB * i.contactL;
    const qContact = pointLoad / contactAreaEach;
    const spreadB = i.contactB + 2 * i.spreadDepth;
    const spreadL = i.contactL + 2 * i.spreadDepth;
    const spreadAreaEach = spreadB * spreadL;
    const qSpread = pointLoad / spreadAreaEach;
    const planArea = i.planB * i.planL;
    const qEquivalent = designWeight / planArea;
    const totalContactArea = contactAreaEach * supportCount;
    const totalSpreadArea = spreadAreaEach * supportCount;
    const horizontalTotal = designWeight * i.horizontalCoeff;
    const horizontalPerSupport = horizontalTotal / supportCount;
    const contactUtil = qContact / i.allowableContact;
    const spreadUtil = qSpread / i.allowableSpread;
    const pointUtil = i.allowablePoint > 0 ? pointLoad / i.allowablePoint : null;
    const contactOk = qContact <= i.allowableContact;
    const spreadOk = qSpread <= i.allowableSpread;
    const pointOk = i.allowablePoint > 0 ? pointLoad <= i.allowablePoint : null;
    const concreteBearing = concreteBearingCheck(i, pointLoad, contactAreaEach);
    const punching = punchingShearCheck(i, pointLoad);
    const steelPlate = steelPlateCheck(i, pointLoad);
    const concreteBearingOk = concreteBearing ? concreteBearing.ok : null;
    const punchingOk = punching ? punching.ok : null;
    const steelPlateOk = steelPlate ? steelPlate.ok : null;
    const governing = governingCheck([
      { key: 'contact-pressure', label: '接觸壓', utilization: contactUtil },
      { key: 'spread-pressure', label: '分布壓', utilization: spreadUtil },
      { key: 'point-load', label: '單點反力', utilization: pointUtil },
      concreteBearing ? { key: 'concrete-bearing', label: '混凝土承壓', utilization: concreteBearing.utilization } : null,
      punching ? { key: 'punching-shear', label: '穿孔剪力', utilization: punching.utilization } : null,
      steelPlate ? { key: 'steel-plate-flexure', label: '鋼板分散彎曲', utilization: steelPlate.utilization } : null
    ].filter(Boolean));
    const overallOk = contactOk && spreadOk && pointOk !== false && concreteBearingOk !== false && punchingOk !== false && steelPlateOk !== false;
    const summary = {
      status: overallOk ? 'pass' : 'fail',
      headline: overallOk ? '設備局部荷重初步通過' : '設備局部荷重需調整或另行詳算',
      governing,
      primaryMetrics: [
        { key: 'designWeight', label: '設計重量', value: designWeight, unit: 'tf' },
        { key: 'pointLoad', label: '單點反力', value: pointLoad, unit: 'tf' },
        { key: 'qContact', label: '接觸壓', value: qContact, unit: 'tf/m2' },
        { key: 'qSpread', label: '分布壓', value: qSpread, unit: 'tf/m2' },
        { key: 'concreteBearingDesign', label: '混凝土承壓設計強度', value: concreteBearing ? concreteBearing.design : null, unit: 'tf' },
        { key: 'punchingDesignShear', label: '穿孔剪力設計強度', value: punching ? punching.design : null, unit: 'tf' },
        { key: 'steelPlateRequiredThickness', label: '鋼板需求厚度', value: steelPlate ? steelPlate.requiredThickness : null, unit: 'm' }
      ]
    };
    const checks = [
      checkItem('contact-pressure', '接觸壓檢核', contactOk, `qContact = ${qContact}, allowableContact = ${i.allowableContact}`, qContact, i.allowableContact, 'tf/m2'),
      checkItem('spread-pressure', '分布壓檢核', spreadOk, `qSpread = ${qSpread}, allowableSpread = ${i.allowableSpread}`, qSpread, i.allowableSpread, 'tf/m2'),
      checkItem('point-load', '單點反力檢核', pointOk, i.allowablePoint > 0 ? `pointLoad = ${pointLoad}, allowablePoint = ${i.allowablePoint}` : '未設定容許單點反力，略過單點反力檢核。', pointLoad, i.allowablePoint, 'tf'),
      checkItem('concrete-bearing', '混凝土承壓檢核', concreteBearingOk, concreteBearing ? `phiBn = ${concreteBearing.design}, A2/A1 factor = ${concreteBearing.bearingFactor}` : '未啟用混凝土承壓基準。', pointLoad, concreteBearing ? concreteBearing.design : null, 'tf'),
      checkItem('punching-shear', 'RC 穿孔剪力初判', punchingOk, punching ? `phiVn = ${punching.design}, bo = ${punching.bo}, vc = ${punching.vc}` : '未啟用 RC 穿孔剪力初判。', pointLoad, punching ? punching.design : null, 'tf'),
      checkItem('steel-plate-flexure', '鋼板分散彎曲初判', steelPlateOk, steelPlate ? `Mu/phiMn = ${steelPlate.utilization}, tReq = ${steelPlate.requiredThickness}` : '未啟用鋼板分散彎曲初判。', steelPlate ? steelPlate.utilization : null, 1, 'ratio'),
      checkItem('horizontal-load', '水平力提示', true, `horizontalTotal = ${horizontalTotal}`, horizontalTotal, null, 'tf')
    ];

    return Object.assign({}, i, {
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
      supportCount,
      serviceWeight,
      designWeight,
      pointLoad,
      contactAreaEach,
      qContact,
      spreadB,
      spreadL,
      spreadAreaEach,
      qSpread,
      planArea,
      qEquivalent,
      totalContactArea,
      totalSpreadArea,
      horizontalTotal,
      horizontalPerSupport,
      contactUtil,
      spreadUtil,
      pointUtil,
      contactOk,
      spreadOk,
      pointOk,
      concreteBearingApplicable: Boolean(concreteBearing),
      concreteBearingAreaA1: concreteBearing ? concreteBearing.areaA1 : null,
      concreteBearingAreaA2: concreteBearing ? concreteBearing.areaA2 : null,
      concreteBearingFactor: concreteBearing ? concreteBearing.bearingFactor : null,
      concreteBearingNominal: concreteBearing ? concreteBearing.nominal : null,
      concreteBearingDesign: concreteBearing ? concreteBearing.design : null,
      concreteBearingAllowablePressure: concreteBearing ? concreteBearing.allowablePressure : null,
      concreteBearingUtil: concreteBearing ? concreteBearing.utilization : null,
      concreteBearingOk,
      punchingApplicable: Boolean(punching),
      punchingBeta: punching ? punching.beta : null,
      punchingAlpha: punching ? punching.alpha : null,
      punchingBo: punching ? punching.bo : null,
      punchingVc: punching ? punching.vc : null,
      punchingVc1: punching ? punching.vc1 : null,
      punchingVc2: punching ? punching.vc2 : null,
      punchingVc3: punching ? punching.vc3 : null,
      punchingNominalShear: punching ? punching.nominal : null,
      punchingDesignShear: punching ? punching.design : null,
      punchingUtil: punching ? punching.utilization : null,
      punchingOk,
      steelPlateApplicable: Boolean(steelPlate),
      steelPlateArea: steelPlate ? steelPlate.plateArea : null,
      steelPlatePressure: steelPlate ? steelPlate.qPlate : null,
      steelPlateProjectionB: steelPlate ? steelPlate.projectionB : null,
      steelPlateProjectionL: steelPlate ? steelPlate.projectionL : null,
      steelPlateControllingProjection: steelPlate ? steelPlate.controllingProjection : null,
      steelPlateMomentDemand: steelPlate ? steelPlate.momentDemand : null,
      steelPlateMomentCapacity: steelPlate ? steelPlate.momentCapacity : null,
      steelPlateRequiredThickness: steelPlate ? steelPlate.requiredThickness : null,
      steelPlateUtil: steelPlate ? steelPlate.utilization : null,
      steelPlateOk,
      governingCheck: governing,
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
    provenance,
    normalizeInput,
    validateInput,
    calculate
  };
});
