/* 鋼筋混凝土工具箱 — 對稱單跨深梁壓拉桿模型核心
 *
 * 支援模型：簡支深梁、跨中單一係數化集中載重、左右對稱二維 STM。
 * 規範依據：112 年建築物混凝土結構設計規範 9.9、21.2.1、23 章。
 *
 * 本模組只計算已明確選定的力流；不自動替工程師選擇壓拉桿拓樸。
 */
(function (root) {
  'use strict';

  const PHI_STM = 0.75;
  const EPS = 1e-9;
  const MAX_STM_TIE_FY = 5600;
  const MAX_LAMBDA = 1;
  const MAX_BETA_C = 2;

  function n(value) {
    return Number(value);
  }

  function positive(value) {
    return Number.isFinite(n(value)) && n(value) > 0;
  }

  function ratioOk(provided, required) {
    return Number.isFinite(provided) && Number.isFinite(required) && provided + EPS >= required;
  }

  function asMinFlexure(bw, d, fc, fy) {
    const fyLimited = Math.min(fy, 5600);
    return Math.max(0.8 * Math.sqrt(fc) / fyLimited, 14 / fyLimited) * bw * d;
  }

  function distributeBars(total, rows) {
    if (!Number.isInteger(total) || !Number.isInteger(rows) || total < 1 || rows < 1 || rows > total) return [];
    const base = Math.floor(total / rows);
    const remainder = total % rows;
    return Array.from({ length: rows }, (_, index) => base + (index < remainder ? 1 : 0));
  }

  function alignedColumnIndices(count, maximum) {
    if (!Number.isInteger(count) || !Number.isInteger(maximum) || count < 1 || maximum < count) return [];
    if (count === 1) return [Math.floor((maximum - 1) / 2)];
    return Array.from({ length:count }, (_, index) => Math.round(index * (maximum - 1) / (count - 1)));
  }

  function assessTieLayout(input = {}) {
    const values = {
      bw: n(input.bw),
      h: n(input.h),
      barArea: n(input.tieBarArea),
      barDiameter: n(input.tieBarDiameter),
      count: n(input.tieCount),
      rows: n(input.tieRows),
      sideCover: n(input.tieSideCover),
      transverseBarDiameter: n(input.tieTransverseBarDiameter),
      maxAggregateSize: n(input.maxAggregateSize),
      verticalClearSpacing: n(input.tieVerticalClearSpacing),
    };
    const supplied = ['barArea', 'barDiameter', 'count', 'rows', 'sideCover', 'transverseBarDiameter', 'maxAggregateSize', 'verticalClearSpacing']
      .some(key => Number.isFinite(values[key]));
    if (!supplied) return { evaluated:false, valid:true };

    const errors = [];
    for (const key of ['bw', 'h', 'barArea', 'barDiameter', 'sideCover', 'transverseBarDiameter', 'maxAggregateSize', 'verticalClearSpacing']) {
      if (!positive(values[key])) errors.push(`${key} 須為正值`);
    }
    if (!Number.isInteger(values.count) || values.count < 1) errors.push('tieCount 須為正整數');
    if (!Number.isInteger(values.rows) || values.rows < 1 || values.rows > 12) errors.push('tieRows 須為 1 至 12 的整數');
    if (Number.isInteger(values.count) && Number.isInteger(values.rows) && values.rows > values.count) {
      errors.push('tieRows 不得大於 tieCount');
    }
    if (errors.length) return { evaluated:true, valid:false, errors, input:values };

    const rowCounts = distributeBars(values.count, values.rows);
    const requiredHorizontalClear = Math.max(2.5, values.barDiameter, (4 / 3) * values.maxAggregateSize);
    const insideWidth = values.bw - 2 * (values.sideCover + values.transverseBarDiameter);
    const maxBarsPerRow = insideWidth > 0
      ? Math.max(0, Math.floor((insideWidth + requiredHorizontalClear + EPS) / (values.barDiameter + requiredHorizontalClear)))
      : 0;
    const horizontalClears = rowCounts.map(count => count <= 1
      ? Infinity
      : (insideWidth - count * values.barDiameter) / (count - 1));
    const minHorizontalClear = Math.min(...horizontalClears);
    const maximumRowCount = Math.max(...rowCounts);
    const rowColumnIndices = rowCounts.map(count => alignedColumnIndices(count, maximumRowCount));
    const rowAlignmentOk = rowColumnIndices.every(indices => indices.length > 0
      && new Set(indices).size === indices.length
      && indices.every(index => index >= 0 && index < maximumRowCount));
    const horizontalSpacingOk = rowCounts.every(count => count <= maxBarsPerRow)
      && minHorizontalClear + EPS >= requiredHorizontalClear;
    const requiredVerticalClear = 2.5;
    const verticalSpacingOk = values.rows === 1 || values.verticalClearSpacing + EPS >= requiredVerticalClear;
    const tieBandDepth = values.rows * values.barDiameter
      + (values.rows - 1) * values.verticalClearSpacing;
    const availableDepth = values.h - 2 * (values.sideCover + values.transverseBarDiameter);
    const depthFitOk = tieBandDepth <= availableDepth + EPS;
    const firstRowCenter = values.sideCover + values.transverseBarDiameter + values.barDiameter / 2;
    const rowCentersFromBottom = rowCounts.map((_, index) => firstRowCenter
      + index * (values.barDiameter + values.verticalClearSpacing));
    const centroidFromBottom = rowCentersFromBottom.reduce((sum, y, index) => sum + y * rowCounts[index], 0)
      / values.count;
    const providedArea = values.count * values.barArea;
    const layoutOk = horizontalSpacingOk && verticalSpacingOk && rowAlignmentOk && depthFitOk;

    return {
      evaluated:true,
      valid:true,
      input:values,
      rowCounts,
      rowColumnIndices,
      rowCentersFromBottom,
      providedArea,
      requiredHorizontalClear,
      insideWidth,
      maxBarsPerRow,
      horizontalClears,
      minHorizontalClear,
      requiredVerticalClear,
      tieBandDepth,
      availableDepth,
      centroidFromBottom,
      horizontalSpacingOk,
      verticalSpacingOk,
      rowAlignmentOk,
      depthFitOk,
      layoutOk,
    };
  }

  function assess(input = {}) {
    const tieLayout = assessTieLayout(input);
    const values = {
      h: n(input.h),
      ln: n(input.ln),
      bw: n(input.bw),
      d: n(input.d),
      z: n(input.z),
      Pu: n(input.Pu),
      fc: n(input.fc),
      fy: n(input.fy),
      lambda: input.lambda == null ? 1 : n(input.lambda),
      betaC: input.betaC == null ? 1 : n(input.betaC),
      betaS: n(input.betaS),
      strutWidth: n(input.strutWidth),
      loadBearingWidth: n(input.loadBearingWidth),
      supportBearingWidth: n(input.supportBearingWidth),
      topNodeWidth: n(input.topNodeWidth),
      bottomNodeWidth: n(input.bottomNodeWidth),
      tieAsProvided: tieLayout.evaluated && tieLayout.valid
        ? tieLayout.providedArea
        : n(input.tieAsProvided),
      verticalBarArea: n(input.verticalBarArea),
      verticalFaces: input.verticalFaces == null ? 2 : n(input.verticalFaces),
      verticalSpacing: n(input.verticalSpacing),
      horizontalBarArea: n(input.horizontalBarArea),
      horizontalFaces: input.horizontalFaces == null ? 2 : n(input.horizontalFaces),
      horizontalSpacing: n(input.horizontalSpacing),
    };

    const requiredPositive = [
      'h', 'ln', 'bw', 'd', 'z', 'Pu', 'fc', 'fy', 'lambda', 'betaC', 'betaS',
      'strutWidth', 'loadBearingWidth', 'supportBearingWidth', 'topNodeWidth',
      'bottomNodeWidth', 'tieAsProvided', 'verticalBarArea', 'verticalFaces',
      'verticalSpacing', 'horizontalBarArea', 'horizontalFaces', 'horizontalSpacing',
    ];
    const errors = requiredPositive
      .filter(key => !positive(values[key]))
      .map(key => `${key} 須為正值`);
    if (positive(values.h) && positive(values.d) && values.d > values.h + EPS) errors.push('d 不得大於 h');
    if (positive(values.h) && positive(values.z) && values.z > values.h + EPS) errors.push('z 不得大於 h');
    if (positive(values.fy) && values.fy > MAX_STM_TIE_FY + EPS) errors.push('STM 拉桿 fy 不得大於 5600 kgf/cm²');
    if (positive(values.lambda) && values.lambda > MAX_LAMBDA + EPS) errors.push('λ 不得大於 1.0');
    if (positive(values.betaC) && values.betaC > MAX_BETA_C + EPS) errors.push('βc 不得大於 2.0');
    if (positive(values.betaS) && ![0.4, 0.75, 1].some(v => Math.abs(values.betaS - v) < EPS)) {
      errors.push('βs 僅支援規範表列 0.40、0.75 或 1.00');
    }
    if (tieLayout.evaluated && !tieLayout.valid) errors.push(...tieLayout.errors);

    if (errors.length) {
      return {
        valid: false,
        status: 'invalid-input',
        errors,
        input: values,
      };
    }

    const a = values.ln / 2;
    const thetaRad = Math.atan2(values.z, a);
    const thetaDeg = thetaRad * 180 / Math.PI;
    const reaction = values.Pu / 2;
    const strutDemand = reaction / Math.sin(thetaRad);
    const tieDemand = reaction / Math.tan(thetaRad);

    const deepBySpan = values.ln <= 4 * values.h + EPS;
    const deepByLoad = a <= 2 * values.h + EPS;
    const isDeepBeam = deepBySpan || deepByLoad;
    const angleOk = thetaDeg + EPS >= 25;

    const tieAsStm = tieDemand * 1000 / (PHI_STM * values.fy);
    const tieAsMin = asMinFlexure(values.bw, values.d, values.fc, values.fy);
    const tieAsRequired = Math.max(tieAsStm, tieAsMin);
    const tieOk = ratioOk(values.tieAsProvided, tieAsRequired);
    const tieDcr = tieAsRequired / values.tieAsProvided;
    const tieLayoutOk = !tieLayout.evaluated || tieLayout.layoutOk;

    const strutFce = 0.85 * values.betaC * values.betaS * values.fc;
    const strutNominal = strutFce * values.bw * values.strutWidth / 1000;
    const strutDesign = PHI_STM * strutNominal;
    const strutOk = ratioOk(strutDesign, strutDemand);
    const strutDcr = strutDemand / strutDesign;

    const topNodeBetaN = 1.0;
    const bottomNodeBetaN = 0.8;
    const topNodeFce = 0.85 * values.betaC * topNodeBetaN * values.fc;
    const bottomNodeFce = 0.85 * values.betaC * bottomNodeBetaN * values.fc;
    const topNodeDemand = Math.max(values.Pu, strutDemand);
    const bottomNodeDemand = Math.max(reaction, strutDemand);
    const topNodeDesign = PHI_STM * topNodeFce * values.bw * values.topNodeWidth / 1000;
    const bottomNodeDesign = PHI_STM * bottomNodeFce * values.bw * values.bottomNodeWidth / 1000;
    const topNodeGeometryOk = values.topNodeWidth <= values.loadBearingWidth + EPS;
    const bottomNodeGeometryOk = values.bottomNodeWidth <= values.supportBearingWidth + EPS;
    const topNodeOk = topNodeGeometryOk && ratioOk(topNodeDesign, topNodeDemand);
    const bottomNodeOk = bottomNodeGeometryOk && ratioOk(bottomNodeDesign, bottomNodeDemand);

    const verticalAreaWithinSpacing = values.verticalBarArea * values.verticalFaces;
    const horizontalAreaWithinSpacing = values.horizontalBarArea * values.horizontalFaces;
    const rhoVertical = verticalAreaWithinSpacing / (values.bw * values.verticalSpacing);
    const rhoHorizontal = horizontalAreaWithinSpacing / (values.bw * values.horizontalSpacing);
    const verticalRatioOk = rhoVertical + EPS >= 0.0025;
    const horizontalRatioOk = rhoHorizontal + EPS >= 0.0025;
    const distributedSpacingLimit = Math.min(values.d / 5, 30);
    const verticalSpacingOk = values.verticalSpacing <= distributedSpacingLimit + EPS;
    const horizontalSpacingOk = values.horizontalSpacing <= distributedSpacingLimit + EPS;
    const distributionOk = verticalRatioOk && horizontalRatioOk && verticalSpacingOk && horizontalSpacingOk;

    const shearDesignLimit99 = PHI_STM * 2.65 * values.lambda * Math.sqrt(values.fc)
      * values.bw * values.d / 1000;
    const shearLimit99Ok = ratioOk(shearDesignLimit99, reaction);

    const check2344Required = Math.abs(values.betaS - 0.75) < EPS;
    const lambdaS = distributionOk ? 1 : null;
    const shearDesignLimit2344 = check2344Required && lambdaS != null
      ? PHI_STM * 1.32 * Math.tan(thetaRad) * values.lambda * lambdaS
        * Math.sqrt(values.fc) * values.bw * values.d / 1000
      : null;
    const shearLimit2344Ok = !check2344Required
      ? null
      : (shearDesignLimit2344 != null && ratioOk(shearDesignLimit2344, reaction));

    const geometryConfirmed = input.geometryConfirmed === true;
    const anchorageConfirmed = input.anchorageConfirmed === true;
    const modelReviewItems = [];
    if (!geometryConfirmed) modelReviewItems.push('壓桿、拉桿與節點有效寬度／力流幾何');
    if (!anchorageConfirmed) modelReviewItems.push('拉桿於兩端節點區之錨定與發展');

    const checks = {
      isDeepBeam,
      angleOk,
      tieOk,
      tieLayoutOk,
      strutOk,
      topNodeGeometryOk,
      bottomNodeGeometryOk,
      topNodeOk,
      bottomNodeOk,
      verticalRatioOk,
      horizontalRatioOk,
      verticalSpacingOk,
      horizontalSpacingOk,
      distributionOk,
      shearLimit99Ok,
      shearLimit2344Ok,
    };
    const failedItems = Object.entries({
      '深梁適用條件': isDeepBeam,
      '壓桿與拉桿夾角': angleOk,
      '底部拉桿鋼筋': tieOk,
      ...((tieLayout.evaluated && !tieLayoutOk) ? { '底部拉桿多排配筋幾何': false } : {}),
      '對角壓桿強度': strutOk,
      '載重節點有效寬度': topNodeGeometryOk,
      '支承節點有效寬度': bottomNodeGeometryOk,
      '上部 CCC 節點': topNodeOk,
      '下部 CCT 節點': bottomNodeOk,
      '垂直分布筋比': verticalRatioOk,
      '水平分布筋比': horizontalRatioOk,
      '垂直分布筋間距': verticalSpacingOk,
      '水平分布筋間距': horizontalSpacingOk,
      '9.9.2.1 剪力上限': shearLimit99Ok,
      ...(check2344Required ? { '23.4.4 剪力條件': shearLimit2344Ok } : {}),
    }).filter(([, ok]) => ok === false).map(([label]) => label);

    const strengthPass = failedItems.length === 0;
    const status = strengthPass ? (modelReviewItems.length ? 'review' : 'ready') : 'blocked';

    return {
      valid: true,
      status,
      input: values,
      phiStm: PHI_STM,
      a,
      thetaRad,
      thetaDeg,
      reaction,
      strutDemand,
      tieDemand,
      deepBySpan,
      deepByLoad,
      isDeepBeam,
      tieAsStm,
      tieAsMin,
      tieAsRequired,
      tieDcr,
      tieLayout,
      strutFce,
      strutNominal,
      strutDesign,
      strutDcr,
      topNodeBetaN,
      bottomNodeBetaN,
      topNodeFce,
      bottomNodeFce,
      topNodeDemand,
      bottomNodeDemand,
      topNodeDesign,
      bottomNodeDesign,
      topNodeDcr: topNodeDemand / topNodeDesign,
      bottomNodeDcr: bottomNodeDemand / bottomNodeDesign,
      verticalAreaWithinSpacing,
      horizontalAreaWithinSpacing,
      rhoVertical,
      rhoHorizontal,
      distributedSpacingLimit,
      shearDesignLimit99,
      check2344Required,
      lambdaS,
      shearDesignLimit2344,
      geometryConfirmed,
      anchorageConfirmed,
      modelReviewItems,
      failedItems,
      strengthPass,
      checks,
    };
  }

  root.DeepBeamSTM = {
    PHI_STM,
    asMinFlexure,
    distributeBars,
    alignedColumnIndices,
    assessTieLayout,
    assess,
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module === 'object' && module.exports) {
  module.exports = globalThis.DeepBeamSTM;
}
