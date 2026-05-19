(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.FoundationLocalCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function numberValue(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeInput(input) {
    return {
      B: numberValue(input.B),
      L: numberValue(input.L),
      t: numberValue(input.t),
      Df: numberValue(input.Df),
      gammaC: numberValue(input.gammaC),
      gammaS: numberValue(input.gammaS),
      P: numberValue(input.P),
      qa: numberValue(input.qa),
      Mx: numberValue(input.Mx),
      My: numberValue(input.My),
      Hx: numberValue(input.Hx),
      Hy: numberValue(input.Hy),
      mu: numberValue(input.mu),
      passive: numberValue(input.passive),
      fsSlideReq: numberValue(input.fsSlideReq),
      fsOverReq: numberValue(input.fsOverReq),
      includeSelfWeight: Boolean(input.includeSelfWeight)
    };
  }

  function validateInput(input) {
    const i = normalizeInput(input);
    const errors = [];
    if (i.B <= 0 || i.L <= 0) errors.push('基礎 B、L 必須大於 0。');
    if (i.qa <= 0) errors.push('容許地耐力 qa 必須大於 0。');
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

    return Object.assign({}, i, {
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
      overallOk
    });
  }

  return {
    version: '0.1.0',
    inputSchemaVersion: 'foundation-local.input.v0.1',
    logicSignature: 'foundation-local-core:v0.1:service-stability:qmax-qmin-sliding-overturning',
    normalizeInput,
    validateInput,
    calculate
  };
});
