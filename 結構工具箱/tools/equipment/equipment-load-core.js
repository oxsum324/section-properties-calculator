(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.EquipmentLoadCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CORE_NAME = 'EquipmentLoadCore';
  const CORE_VERSION = '0.1.0';
  const INPUT_SCHEMA_VERSION = 'equipment-load.input.v0.1';
  const RESULT_SCHEMA_VERSION = 'equipment-load.result.v0.1';
  const LOGIC_SIGNATURE = 'equipment-load-core:v0.1:point-contact-spread-horizontal';

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

  function normalizeInput(input) {
    return {
      equipmentWeight: numberValue(input.equipmentWeight),
      fluidWeight: numberValue(input.fluidWeight),
      accessoryWeight: numberValue(input.accessoryWeight),
      dynamicFactor: numberValue(input.dynamicFactor),
      supportCount: numberValue(input.supportCount),
      contactB: numberValue(input.contactB),
      contactL: numberValue(input.contactL),
      spreadDepth: numberValue(input.spreadDepth),
      planB: numberValue(input.planB),
      planL: numberValue(input.planL),
      allowableContact: numberValue(input.allowableContact),
      allowableSpread: numberValue(input.allowableSpread),
      allowablePoint: numberValue(input.allowablePoint),
      horizontalCoeff: numberValue(input.horizontalCoeff)
    };
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
    return errors;
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
    const overallOk = contactOk && spreadOk && pointOk !== false;
    const summary = {
      status: overallOk ? 'pass' : 'fail',
      headline: overallOk ? '設備局部荷重初步通過' : '設備局部荷重需調整或另行詳算',
      primaryMetrics: [
        { key: 'designWeight', label: '設計重量', value: designWeight, unit: 'tf' },
        { key: 'pointLoad', label: '單點反力', value: pointLoad, unit: 'tf' },
        { key: 'qContact', label: '接觸壓', value: qContact, unit: 'tf/m2' },
        { key: 'qSpread', label: '分布壓', value: qSpread, unit: 'tf/m2' }
      ]
    };
    const checks = [
      checkItem('contact-pressure', '接觸壓檢核', contactOk, `qContact = ${qContact}, allowableContact = ${i.allowableContact}`, qContact, i.allowableContact, 'tf/m2'),
      checkItem('spread-pressure', '分布壓檢核', spreadOk, `qSpread = ${qSpread}, allowableSpread = ${i.allowableSpread}`, qSpread, i.allowableSpread, 'tf/m2'),
      checkItem('point-load', '單點反力檢核', pointOk, i.allowablePoint > 0 ? `pointLoad = ${pointLoad}, allowablePoint = ${i.allowablePoint}` : '未設定容許單點反力，略過單點反力檢核。', pointLoad, i.allowablePoint, 'tf'),
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
