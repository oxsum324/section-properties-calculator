/* 鋼筋混凝土工具箱 — RC 梁方法適用性判定
 *
 * 依 112 年建築物混凝土結構設計規範 9.9.1.1：
 * (a) 淨跨 ln 不超過構材總深 h 的 4 倍；或
 * (b) 集中載重作用在距支承面 2h 內，應按深梁行為處理。
 *
 * 本模組只判斷一般梁法是否適用，不進行第 23 章壓拉桿設計。
 */
(function (root) {
  'use strict';

  const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;

  function assess(options = {}) {
    const h = Number(options.h);
    const ln = Number(options.ln);
    const rawLoadDistance = options.loadDistance;
    const loadDistanceProvided = rawLoadDistance !== '' && rawLoadDistance != null
      && Number.isFinite(Number(rawLoadDistance)) && Number(rawLoadDistance) >= 0;
    const loadDistance = loadDistanceProvided ? Number(rawLoadDistance) : null;
    const loadDistanceRatio = loadDistanceProvided && finitePositive(h) ? loadDistance / h : null;

    if (!finitePositive(h) || !finitePositive(ln)) {
      return {
        status: 'invalid-input',
        methodApplicable: false,
        deepBeam: null,
        reason: '梁總深 h 與淨跨 ln 須為正值。',
        h,
        ln,
        spanDepthRatio: null,
        loadDistance,
        loadDistanceRatio,
        loadDistanceProvided,
        deepBySpan: null,
        deepByLoad: null,
      };
    }

    const spanDepthRatio = ln / h;
    const deepBySpan = ln <= 4 * h + 1e-9;
    const deepByLoad = loadDistanceProvided ? loadDistance <= 2 * h + 1e-9 : false;
    const deepBeam = deepBySpan || deepByLoad;
    const triggers = [];
    if (deepBySpan) triggers.push(`ln/h=${spanDepthRatio.toFixed(3)} <= 4`);
    if (deepByLoad) triggers.push(`a_v/h=${(loadDistance / h).toFixed(3)} <= 2`);

    if (deepBeam) {
      return {
        status: 'deep-beam',
        methodApplicable: false,
        deepBeam: true,
        reason: `符合深梁條件（${triggers.join('；')}）；一般梁平截面設計法不得作為正式結論。`,
        h,
        ln,
        spanDepthRatio,
        loadDistance,
        loadDistanceRatio,
        loadDistanceProvided,
        deepBySpan,
        deepByLoad,
        triggers,
      };
    }

    return {
      status: 'ordinary-beam',
      methodApplicable: true,
      deepBeam: false,
      reason: loadDistanceProvided
        ? `ln/h=${spanDepthRatio.toFixed(3)} > 4 且 a_v/h=${(loadDistance / h).toFixed(3)} > 2，未觸發第 9.9.1.1 深梁條件。`
        : `ln/h=${spanDepthRatio.toFixed(3)} > 4；未輸入集中載重距支承面 a_v，僅完成跨深比條件判定。`,
      h,
      ln,
      spanDepthRatio,
      loadDistance,
      loadDistanceRatio,
      loadDistanceProvided,
      deepBySpan,
      deepByLoad,
      triggers,
    };
  }

  root.BeamApplicability = { assess };
})(typeof window !== 'undefined' ? window : globalThis);
