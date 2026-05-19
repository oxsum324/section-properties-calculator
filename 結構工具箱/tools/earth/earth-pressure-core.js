(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.EarthPressureCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CORE_NAME = 'EarthPressureCore';
  const CORE_VERSION = '0.1.0';
  const INPUT_SCHEMA_VERSION = 'earth-pressure.input.v0.1';
  const LOGIC_SIGNATURE = 'earth-pressure-core:v0.1:rankine-surcharge-water-stability';

  function provenance() {
    return {
      core: CORE_NAME,
      version: CORE_VERSION,
      inputSchemaVersion: INPUT_SCHEMA_VERSION,
      logicSignature: LOGIC_SIGNATURE
    };
  }

  function numberValue(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeInput(input) {
    const H = numberValue(input.H);
    const waterDepth = Math.min(Math.max(numberValue(input.waterDepth), 0), Math.max(H, 0));
    const mode = input.mode === 'atRest' ? 'atRest' : 'active';
    return {
      H,
      gammaSoil: numberValue(input.gammaSoil),
      phiDeg: numberValue(input.phiDeg),
      mode,
      surcharge: numberValue(input.surcharge),
      waterDepth,
      gammaWater: numberValue(input.gammaWater),
      baseB: numberValue(input.baseB),
      verticalLoad: numberValue(input.verticalLoad),
      qa: numberValue(input.qa),
      mu: numberValue(input.mu),
      passive: numberValue(input.passive),
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

    const soilForce = 0.5 * K * i.gammaSoil * i.H * i.H;
    const soilMoment = soilForce * i.H / 3;
    const surchargeForce = K * i.surcharge * i.H;
    const surchargeMoment = surchargeForce * i.H / 2;
    const waterForce = 0.5 * i.gammaWater * i.waterDepth * i.waterDepth;
    const waterMoment = waterForce * i.waterDepth / 3;
    const totalForce = soilForce + surchargeForce + waterForce;
    const overturningMoment = soilMoment + surchargeMoment + waterMoment;
    const resultantHeight = totalForce > 0 ? overturningMoment / totalForce : 0;

    const slideResistance = i.mu * i.verticalLoad + i.passive;
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

    return Object.assign({}, i, {
      phiRad,
      sinPhi,
      Ka,
      K0,
      K,
      modeLabel,
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
      fullContact,
      bearingOk,
      overallOk,
      provenance: provenance()
    });
  }

  return {
    version: CORE_VERSION,
    inputSchemaVersion: INPUT_SCHEMA_VERSION,
    logicSignature: LOGIC_SIGNATURE,
    provenance,
    normalizeInput,
    validateInput,
    calculate
  };
});
