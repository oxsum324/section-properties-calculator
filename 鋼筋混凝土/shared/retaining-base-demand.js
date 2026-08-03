(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RetainingBaseDemand = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA = 'rc-retaining-base-demand.v1';

  function finite(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${label} 必須是有限數值。`);
    return number;
  }

  function positive(value, label) {
    const number = finite(value, label);
    if (number <= 0) throw new Error(`${label} 必須大於 0。`);
    return number;
  }

  function pressureFromEquilibrium(vertical, momentAboutToe, width) {
    const V = positive(vertical, '垂直合力');
    const M = finite(momentAboutToe, '趾端合力矩');
    const B = positive(width, '底版總寬');
    const resultantX = M / V;
    const eccentricity = B / 2 - resultantX;
    const average = V / B;
    return {
      vertical: V,
      momentAboutToe: M,
      resultantX,
      eccentricity,
      average,
      toe: average * (1 + 6 * eccentricity / B),
      heel: average * (1 - 6 * eccentricity / B)
    };
  }

  function lineValue(start, end, length, x) {
    if (length <= 0) return start;
    return start + (end - start) * x / length;
  }

  function integrateLinear(start, end, length, x0, x1) {
    const a = finite(start, '線性載重起點');
    const b = length > 0 ? (finite(end, '線性載重終點') - a) / length : 0;
    const lo = Math.max(0, Math.min(length, finite(x0, '積分起點')));
    const hi = Math.max(lo, Math.min(length, finite(x1, '積分終點')));
    const force = a * (hi - lo) + 0.5 * b * (hi * hi - lo * lo);
    const firstMoment = 0.5 * a * (hi * hi - lo * lo) + (b / 3) * (hi * hi * hi - lo * lo * lo);
    return { force, firstMoment };
  }

  function evaluate(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const g = input.geometry || {};
    const loads = input.loads || {};
    const factors = Object.assign({ deadMax: 1.2, deadMin: 0.9, earth: 1.6 }, input.factors || {});
    const Lt = positive(g.toeLength, '趾版長');
    const tw = positive(g.stemThickness, '牆厚');
    const Lh = positive(g.heelLength, '踵版長');
    const commonD = g.effectiveDepth;
    const toeD = positive(g.toeEffectiveDepth == null ? commonD : g.toeEffectiveDepth, '趾版有效深度');
    const heelD = positive(g.heelEffectiveDepth == null ? commonD : g.heelEffectiveDepth, '踵版有效深度');
    const B = Lt + tw + Lh;
    const deadVertical = positive(loads.deadVertical, '永久垂直重量');
    const deadMoment = finite(loads.deadMomentAboutToe, '永久抵抗矩');
    const lateralMoment = Math.max(0, finite(loads.lateralMoment, '側向傾覆矩'));
    const baseUnit = Math.max(0, finite(loads.baseUnitWeight, '底版單位長度自重'));
    const heelSoilUnit = Math.max(0, finite(loads.heelSoilUnitWeight, '踵版回填土單位載重'));
    const heelSurchargeUnit = Math.max(0, finite(loads.heelSurchargeUnitWeight, '踵版超載'));
    const surchargeVertical = heelSurchargeUnit * Lh;
    const surchargeMoment = surchargeVertical * (Lt + tw + Lh / 2);

    const service = pressureFromEquilibrium(deadVertical, deadMoment - lateralMoment, B);
    const toeCombo = pressureFromEquilibrium(
      factors.deadMin * deadVertical,
      factors.deadMin * deadMoment - factors.earth * lateralMoment,
      B
    );
    const heelCombo = pressureFromEquilibrium(
      factors.deadMax * deadVertical + factors.earth * surchargeVertical,
      factors.deadMax * deadMoment + factors.earth * surchargeMoment - factors.earth * lateralMoment,
      B
    );

    const toeReactionFree = toeCombo.toe;
    const toeReactionWall = lineValue(toeCombo.toe, toeCombo.heel, B, Lt);
    const toeNetFree = toeReactionFree - factors.deadMin * baseUnit;
    const toeNetWall = toeReactionWall - factors.deadMin * baseUnit;
    const toeLoad = integrateLinear(toeNetFree, toeNetWall, Lt, 0, Lt);
    const toeMomentSigned = Lt * toeLoad.force - toeLoad.firstMoment;
    const toeShearLimit = Math.max(0, Lt - toeD);
    const toeShear = integrateLinear(toeNetFree, toeNetWall, Lt, 0, toeShearLimit).force;

    const heelReactionWall = lineValue(heelCombo.toe, heelCombo.heel, B, Lt + tw);
    const heelReactionFree = heelCombo.heel;
    const heelDownUnit = factors.deadMax * (baseUnit + heelSoilUnit) + factors.earth * heelSurchargeUnit;
    const heelNetWall = heelDownUnit - heelReactionWall;
    const heelNetFree = heelDownUnit - heelReactionFree;
    const heelLoad = integrateLinear(heelNetWall, heelNetFree, Lh, 0, Lh);
    const heelMomentSigned = heelLoad.firstMoment;
    const heelShearStart = Math.min(Lh, heelD);
    const heelShear = integrateLinear(heelNetWall, heelNetFree, Lh, heelShearStart, Lh).force;

    return {
      schema: SCHEMA,
      factors,
      assumptions: {
        linearBasePressure: true,
        favorablePassiveMomentIncluded: false
      },
      width: B,
      servicePressure: service,
      toeCombination: toeCombo,
      heelCombination: heelCombo,
      toe: {
        netFree: toeNetFree,
        netWall: toeNetWall,
        momentSigned: toeMomentSigned,
        moment: Math.abs(toeMomentSigned),
        shearSigned: toeShear,
        shear: Math.abs(toeShear),
        expectedFace: 'bottom',
        demandFace: toeMomentSigned >= 0 ? 'bottom' : 'top',
        faceMatches: toeMomentSigned >= 0
      },
      heel: {
        netWall: heelNetWall,
        netFree: heelNetFree,
        momentSigned: heelMomentSigned,
        moment: Math.abs(heelMomentSigned),
        shearSigned: heelShear,
        shear: Math.abs(heelShear),
        expectedFace: 'top',
        demandFace: heelMomentSigned >= 0 ? 'top' : 'bottom',
        faceMatches: heelMomentSigned >= 0
      },
      contactOk: [service, toeCombo, heelCombo].every(item => item.toe >= 0 && item.heel >= 0)
    };
  }

  return { schema: SCHEMA, pressureFromEquilibrium, integrateLinear, evaluate };
});
