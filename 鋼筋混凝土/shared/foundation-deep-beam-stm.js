/* 鋼筋混凝土工具箱 — 基礎深梁／樁帽二維壓拉桿模型核心
 *
 * 支援模型：
 *   1. 單一置中柱載重 + 全長均佈地盤反力之對稱二維條帶 STM。
 *   2. 單一置中柱載重 + 對稱離散樁反力之二維條帶 STM。
 *
 * 規範依據：112 年建築物混凝土結構設計規範 13.2.6、13.4.6、23 章及 25.2。
 * 本模組不把二維條帶自動等同於三維樁帽；反力來源、條帶代表性與節點幾何須由設計者確認。
 */
(function (root) {
  'use strict';

  const PHI_STM = 0.75;
  const EPS = 1e-9;
  const MAX_STM_TIE_FY = 5600;
  const MAX_LAMBDA = 1;
  const MAX_BETA_C = 2;
  const NUMERICAL_TOLERANCE_POLICY = Object.freeze({
    authority:'numerical-quality-gate',
    label:'數值門檻（非條文值）',
    maxForceErrorPct:2,
    maxSymmetryErrorPct:2,
    maxMomentErrorPct:1,
    maxHorizontalResidualPct:1,
  });
  const MAX_BALANCE_TOLERANCE_PCT = NUMERICAL_TOLERANCE_POLICY.maxForceErrorPct;
  const MAX_SYMMETRY_TOLERANCE_PCT = NUMERICAL_TOLERANCE_POLICY.maxSymmetryErrorPct;
  const MAX_MOMENT_TOLERANCE_PCT = NUMERICAL_TOLERANCE_POLICY.maxMomentErrorPct;
  const MAX_HORIZONTAL_TOLERANCE_PCT = NUMERICAL_TOLERANCE_POLICY.maxHorizontalResidualPct;
  const REACTION_MODES = ['soil-uniform', 'pile-group'];
  const DeepBeamSTM = root.DeepBeamSTM
    || (typeof module === 'object' && module.exports ? require('./deep-beam-stm.js') : null);

  function n(value) { return Number(value); }
  function positive(value) { return Number.isFinite(n(value)) && n(value) > 0; }
  function nonnegative(value) { return Number.isFinite(n(value)) && n(value) >= 0; }
  function ratioOk(provided, required) {
    return Number.isFinite(provided) && Number.isFinite(required) && provided + EPS >= required;
  }

  function parsePileReactions(text) {
    if (Array.isArray(text)) {
      return text.map((item, index) => {
        const x = n(item?.x);
        const reaction = n(item?.reaction);
        if (!Number.isFinite(x) || !positive(reaction)) throw new Error(`樁反力第 ${index + 1} 列數值無效`);
        return { x, reaction };
      });
    }
    const source = String(text == null ? '' : text).trim();
    if (!source) return [];
    return source.split(/\r?\n/).map((line, index) => {
      const clean = line.trim();
      if (!clean) return null;
      const parts = clean.split(/[\s,，;；\t]+/).filter(Boolean);
      if (parts.length !== 2) throw new Error(`樁反力第 ${index + 1} 列須為「x(cm), R(tf)」`);
      const x = n(parts[0]);
      const reaction = n(parts[1]);
      if (!Number.isFinite(x) || !positive(reaction)) throw new Error(`樁反力第 ${index + 1} 列數值無效`);
      return { x, reaction };
    }).filter(Boolean);
  }

  function mergeReactionNodes(nodes) {
    const merged = [];
    [...nodes].sort((a, b) => a.x - b.x).forEach((node) => {
      const previous = merged[merged.length - 1];
      if (previous && Math.abs(previous.x - node.x) < EPS) previous.reaction += node.reaction;
      else merged.push({ x:node.x, reaction:node.reaction });
    });
    return merged;
  }

  function symmetryCheck(nodes, tolerancePct) {
    const center = nodes.filter((node) => Math.abs(node.x) < EPS);
    if (center.length > 1) return false;
    const negative = nodes.filter((node) => node.x < -EPS);
    const positiveNodes = nodes.filter((node) => node.x > EPS);
    if (negative.length !== positiveNodes.length) return false;
    return negative.every((left) => {
      const right = positiveNodes.find((candidate) => Math.abs(candidate.x + left.x) < 1e-6);
      if (!right) return false;
      const scale = Math.max(left.reaction, right.reaction, EPS);
      return Math.abs(left.reaction - right.reaction) / scale * 100 <= tolerancePct + EPS;
    });
  }

  function buildTieSegments(nodes, z) {
    let cumulativeHorizontal = 0;
    const segments = [];
    for (let index = 0; index < nodes.length - 1; index += 1) {
      const node = nodes[index];
      cumulativeHorizontal += node.reaction * node.x / z;
      segments.push({
        x1:node.x,
        x2:nodes[index + 1].x,
        demand:Math.abs(cumulativeHorizontal),
      });
    }
    return segments;
  }

  function pileReactionFactor(distanceFromSection, pileDiameter) {
    const half = pileDiameter / 2;
    if (distanceFromSection >= half - EPS) return 1;
    if (distanceFromSection <= -half + EPS) return 0;
    return (distanceFromSection + half) / pileDiameter;
  }

  function assess(input = {}) {
    if (!DeepBeamSTM || typeof DeepBeamSTM.assessTieLayout !== 'function') {
      return { valid:false, status:'invalid-input', errors:['缺少深梁多排拉桿配置核心'] };
    }

    const reactionMode = input.reactionMode == null ? 'soil-uniform' : String(input.reactionMode);
    const tieLayout = DeepBeamSTM.assessTieLayout(input);
    const values = {
      reactionMode,
      h:n(input.h),
      ln:n(input.ln),
      bw:n(input.bw),
      columnWidth:n(input.columnWidth),
      loadNodeDepth:n(input.loadNodeDepth),
      Pu:n(input.Pu),
      fc:n(input.fc),
      fy:n(input.fy),
      lambda:input.lambda == null ? 1 : n(input.lambda),
      betaC:input.betaC == null ? 1 : n(input.betaC),
      betaS:input.betaS == null ? 0.4 : n(input.betaS),
      strutWidth:n(input.strutWidth),
      topNodeWidth:n(input.topNodeWidth),
      bottomNodeWidth:n(input.bottomNodeWidth),
      supportBearingWidth:n(input.supportBearingWidth),
      soilPressure:n(input.soilPressure),
      soilTributaryWidth:n(input.soilTributaryWidth),
      pileDiameter:n(input.pileDiameter),
      tieMinimumArea:n(input.tieMinimumArea),
      tieAsProvided:tieLayout.evaluated && tieLayout.valid ? tieLayout.providedArea : n(input.tieAsProvided),
      balanceTolerancePct:input.balanceTolerancePct == null ? MAX_BALANCE_TOLERANCE_PCT : n(input.balanceTolerancePct),
      symmetryTolerancePct:input.symmetryTolerancePct == null ? MAX_SYMMETRY_TOLERANCE_PCT : n(input.symmetryTolerancePct),
      momentTolerancePct:input.momentTolerancePct == null ? MAX_MOMENT_TOLERANCE_PCT : n(input.momentTolerancePct),
      horizontalTolerancePct:input.horizontalTolerancePct == null ? MAX_HORIZONTAL_TOLERANCE_PCT : n(input.horizontalTolerancePct),
    };

    const errors = [];
    if (!REACTION_MODES.includes(reactionMode)) errors.push('reactionMode 僅支援 soil-uniform 或 pile-group');
    for (const key of [
      'h', 'ln', 'bw', 'columnWidth', 'loadNodeDepth', 'Pu', 'fc', 'fy', 'lambda',
      'betaC', 'strutWidth', 'topNodeWidth', 'bottomNodeWidth', 'supportBearingWidth',
      'tieMinimumArea', 'tieAsProvided', 'balanceTolerancePct', 'symmetryTolerancePct', 'momentTolerancePct', 'horizontalTolerancePct',
    ]) if (!positive(values[key])) errors.push(`${key} 須為正值`);
    if (positive(values.fy) && values.fy > MAX_STM_TIE_FY + EPS) errors.push('STM 拉桿 fy 不得大於 5600 kgf/cm²');
    if (positive(values.lambda) && values.lambda > MAX_LAMBDA + EPS) errors.push('λ 不得大於 1.0');
    if (positive(values.betaC) && values.betaC > MAX_BETA_C + EPS) errors.push('βc 不得大於 2.0');
    if (positive(values.balanceTolerancePct) && values.balanceTolerancePct > MAX_BALANCE_TOLERANCE_PCT + EPS) errors.push(`垂直力平衡容許誤差不得大於 ${MAX_BALANCE_TOLERANCE_PCT.toFixed(1)}%`);
    if (positive(values.symmetryTolerancePct) && values.symmetryTolerancePct > MAX_SYMMETRY_TOLERANCE_PCT + EPS) errors.push(`反力對稱容許誤差不得大於 ${MAX_SYMMETRY_TOLERANCE_PCT.toFixed(1)}%`);
    if (positive(values.momentTolerancePct) && values.momentTolerancePct > MAX_MOMENT_TOLERANCE_PCT + EPS) errors.push(`力矩平衡容許誤差不得大於 ${MAX_MOMENT_TOLERANCE_PCT.toFixed(1)}%`);
    if (positive(values.horizontalTolerancePct) && values.horizontalTolerancePct > MAX_HORIZONTAL_TOLERANCE_PCT + EPS) errors.push(`水平力平衡容許殘差不得大於 ${MAX_HORIZONTAL_TOLERANCE_PCT.toFixed(1)}%`);
    if (![0.4, 0.75].some((candidate) => Math.abs(values.betaS - candidate) < EPS)) {
      errors.push('βs 僅支援樁帽／基礎內部壓桿適用的 0.40 或 0.75');
    }
    if (positive(values.loadNodeDepth) && positive(values.h) && values.loadNodeDepth >= values.h - EPS) {
      errors.push('loadNodeDepth 須小於 h');
    }
    if (tieLayout.evaluated && !tieLayout.valid) errors.push(...tieLayout.errors);

    let nodes = [];
    let soilLineReaction = null;
    try {
      if (reactionMode === 'soil-uniform') {
        if (!positive(values.soilPressure)) errors.push('soilPressure 須為正值');
        if (!positive(values.soilTributaryWidth)) errors.push('soilTributaryWidth 須為正值');
        if (positive(values.soilPressure) && positive(values.soilTributaryWidth) && positive(values.ln)) {
          soilLineReaction = values.soilPressure * values.soilTributaryWidth / 100;
          const total = soilLineReaction * values.ln / 100;
          nodes = [
            { x:-values.ln / 4, reaction:total / 2 },
            { x:values.ln / 4, reaction:total / 2 },
          ];
        }
      } else if (reactionMode === 'pile-group') {
        if (!positive(values.pileDiameter)) errors.push('pileDiameter 須為正值');
        nodes = mergeReactionNodes(parsePileReactions(input.pileReactions));
        if (nodes.length < 2) errors.push('pileReactions 至少須有 2 個反力節點');
        if (nodes.some((node) => Math.abs(node.x) > values.ln / 2 + EPS)) errors.push('樁反力位置不得超出模型長度');
        if (nodes.filter((node) => Math.abs(node.x) > EPS).length < 2) errors.push('須至少有左右各一個偏心反力節點');
      }
    } catch (error) {
      errors.push(error.message || String(error));
    }

    if (errors.length) return { valid:false, status:'invalid-input', errors, input:values };

    const tieAxisFromBottom = tieLayout.evaluated ? tieLayout.centroidFromBottom : n(input.tieAxisFromBottom);
    if (!positive(tieAxisFromBottom)) {
      return { valid:false, status:'invalid-input', errors:['tieAxisFromBottom 須為正值'], input:values };
    }
    const d = values.h - tieAxisFromBottom;
    const z = values.h - values.loadNodeDepth - tieAxisFromBottom;
    if (!positive(d) || !positive(z)) {
      return { valid:false, status:'invalid-input', errors:['拉桿形心與載重節點造成無效有效深度或桿臂'], input:values };
    }

    nodes = nodes.map((node, index) => {
      const thetaRad = Math.atan2(z, Math.abs(node.x));
      const thetaDeg = thetaRad * 180 / Math.PI;
      const strutDemand = node.reaction / Math.sin(thetaRad);
      const horizontalComponent = node.reaction * Math.abs(node.x) / z;
      return { ...node, index:index + 1, thetaRad, thetaDeg, strutDemand, horizontalComponent };
    });

    const reactionTotal = nodes.reduce((sum, node) => sum + node.reaction, 0);
    const reactionMoment = nodes.reduce((sum, node) => sum + node.reaction * node.x, 0);
    const balanceErrorPct = Math.abs(reactionTotal - values.Pu) / values.Pu * 100;
    const momentErrorPct = Math.abs(reactionMoment) / Math.max(values.Pu * values.ln / 2, EPS) * 100;
    const horizontalResidual = nodes.reduce((sum, node) => sum + node.reaction * node.x / z, 0);
    const horizontalAction = nodes.reduce((sum, node) => sum + Math.abs(node.reaction * node.x / z), 0);
    const horizontalResidualPct = Math.abs(horizontalResidual) / Math.max(horizontalAction, EPS) * 100;
    const balanceOk = balanceErrorPct <= values.balanceTolerancePct + EPS;
    const momentBalanceOk = momentErrorPct <= values.momentTolerancePct + EPS;
    const horizontalBalanceOk = horizontalResidualPct <= values.horizontalTolerancePct + EPS;
    const symmetryOk = reactionMode === 'soil-uniform' || symmetryCheck(nodes, values.symmetryTolerancePct);
    const topologyOk = balanceOk && momentBalanceOk && horizontalBalanceOk && symmetryOk;

    const minThetaDeg = Math.min(...nodes.map((node) => node.thetaDeg));
    const angleOk = minThetaDeg + EPS >= 25;
    const tieSegments = buildTieSegments(nodes, z);
    const tieDemand = tieSegments.length ? Math.max(...tieSegments.map((segment) => segment.demand)) : 0;
    const tieAsStm = tieDemand * 1000 / (PHI_STM * values.fy);
    const tieAsRequired = Math.max(tieAsStm, values.tieMinimumArea);
    const tieOk = ratioOk(values.tieAsProvided, tieAsRequired);
    const tieLayoutOk = !tieLayout.evaluated || tieLayout.layoutOk;

    const strutFce = 0.85 * values.betaC * values.betaS * values.fc;
    const strutDesign = PHI_STM * strutFce * values.bw * values.strutWidth / 1000;
    nodes = nodes.map((node) => ({
      ...node,
      strutDcr:node.strutDemand / strutDesign,
      strutOk:ratioOk(strutDesign, node.strutDemand),
    }));
    const strutOk = nodes.every((node) => node.strutOk);
    const maxStrutDcr = Math.max(...nodes.map((node) => node.strutDcr));

    const topNodeFce = 0.85 * values.betaC * 1.0 * values.fc;
    const topNodeDesign = PHI_STM * topNodeFce * values.bw * values.topNodeWidth / 1000;
    const topNodeGeometryOk = values.topNodeWidth <= values.columnWidth + EPS;
    const topNodeOk = topNodeGeometryOk && ratioOk(topNodeDesign, values.Pu);

    const bottomNodeGeometryOk = values.bottomNodeWidth <= values.supportBearingWidth + EPS;
    const bottomNodeResults = nodes.map((node) => {
      const betaN = Math.abs(node.x) < EPS ? 1.0 : 0.8;
      const fce = 0.85 * values.betaC * betaN * values.fc;
      const design = PHI_STM * fce * values.bw * values.bottomNodeWidth / 1000;
      const demand = Math.max(node.reaction, node.strutDemand);
      return { index:node.index, x:node.x, betaN, demand, design, dcr:demand / design, ok:bottomNodeGeometryOk && ratioOk(design, demand) };
    });
    const bottomNodeOk = bottomNodeResults.every((node) => node.ok);

    const criticalSectionX = values.columnWidth / 2 + d;
    let shearDemandLeft = 0;
    let shearDemandRight = 0;
    if (reactionMode === 'soil-uniform') {
      const halfLength = values.ln / 2;
      const outsideLength = Math.max(0, halfLength - criticalSectionX);
      shearDemandLeft = soilLineReaction * outsideLength / 100;
      shearDemandRight = shearDemandLeft;
    } else {
      nodes.forEach((node) => {
        if (node.x > EPS) shearDemandRight += node.reaction * pileReactionFactor(node.x - criticalSectionX, values.pileDiameter);
        if (node.x < -EPS) shearDemandLeft += node.reaction * pileReactionFactor(-node.x - criticalSectionX, values.pileDiameter);
      });
    }
    const shearDemand = Math.max(shearDemandLeft, shearDemandRight);
    const distributionReinforcementComplies = input.distributionReinforcementComplies === true;
    const lambdaS = distributionReinforcementComplies ? 1 : Math.sqrt(2 / (1 + d / 25));
    const shearDesignLimit2344 = PHI_STM * 1.32 * Math.tan(minThetaDeg * Math.PI / 180)
      * values.lambda * lambdaS * Math.sqrt(values.fc) * values.bw * d / 1000;
    const check2344Required = Math.abs(values.betaS - 0.75) < EPS;
    const shearLimit2344Ok = !check2344Required || ratioOk(shearDesignLimit2344, shearDemand);
    const pileEffectiveDepthOk = reactionMode !== 'pile-group' || d + EPS >= 30;

    const reactionSourceConfirmed = input.reactionSourceConfirmed === true;
    const twoDimensionalConfirmed = input.twoDimensionalConfirmed === true;
    const geometryConfirmed = input.geometryConfirmed === true;
    const anchorageConfirmed = input.anchorageConfirmed === true;
    const modelReviewItems = [];
    if (!reactionSourceConfirmed) modelReviewItems.push('因數化地盤／樁反力來源與平衡');
    if (!twoDimensionalConfirmed) modelReviewItems.push('二維條帶代表性與橫向力流');
    if (!geometryConfirmed) modelReviewItems.push('壓桿、拉桿與節點有效寬度／力流幾何');
    if (!anchorageConfirmed) modelReviewItems.push('拉桿於外側節點區之錨定與發展');

    const checks = {
      balanceOk,
      momentBalanceOk,
      horizontalBalanceOk,
      symmetryOk,
      topologyOk,
      angleOk,
      tieOk,
      tieLayoutOk,
      strutOk,
      topNodeGeometryOk,
      topNodeOk,
      bottomNodeGeometryOk,
      bottomNodeOk,
      shearLimit2344Ok,
      pileEffectiveDepthOk,
    };
    const failedItems = Object.entries({
      '垂直力平衡':balanceOk,
      '反力力矩平衡':momentBalanceOk,
      '水平力平衡':horizontalBalanceOk,
      '對稱反力拓樸':symmetryOk,
      '壓桿與拉桿夾角':angleOk,
      '底部拉桿鋼筋':tieOk,
      ...((tieLayout.evaluated && !tieLayoutOk) ? { '底部拉桿多排配筋幾何':false } : {}),
      '扇形壓桿強度':strutOk,
      '柱下載重節點有效寬度':topNodeGeometryOk,
      '柱下載重節點強度':topNodeOk,
      '反力節點有效寬度':bottomNodeGeometryOk,
      '反力節點強度':bottomNodeOk,
      ...(check2344Required ? { '23.4.4 剪力條件':shearLimit2344Ok } : {}),
      ...(reactionMode === 'pile-group' ? { '13.4.6.1 樁帽有效深度':pileEffectiveDepthOk } : {}),
    }).filter(([, ok]) => ok === false).map(([label]) => label);

    const strengthPass = failedItems.length === 0;
    const status = strengthPass ? (modelReviewItems.length ? 'review' : 'ready') : 'blocked';

    return {
      valid:true,
      status,
      input:values,
      phiStm:PHI_STM,
      numericalTolerancePolicy:{
        ...NUMERICAL_TOLERANCE_POLICY,
        adoptedForceErrorPct:values.balanceTolerancePct,
        adoptedSymmetryErrorPct:values.symmetryTolerancePct,
        adoptedMomentErrorPct:values.momentTolerancePct,
        adoptedHorizontalResidualPct:values.horizontalTolerancePct,
      },
      tieLayout,
      tieAxisFromBottom,
      d,
      z,
      nodes,
      reactionTotal,
      reactionMoment,
      balanceErrorPct,
      momentErrorPct,
      horizontalResidual,
      horizontalAction,
      horizontalResidualPct,
      soilLineReaction,
      minThetaDeg,
      tieSegments,
      tieDemand,
      tieAsStm,
      tieAsRequired,
      tieDcr:tieAsRequired / values.tieAsProvided,
      strutFce,
      strutDesign,
      maxStrutDcr,
      topNodeFce,
      topNodeDesign,
      topNodeDcr:values.Pu / topNodeDesign,
      bottomNodeResults,
      criticalSectionX,
      shearDemandLeft,
      shearDemandRight,
      shearDemand,
      distributionReinforcementComplies,
      lambdaS,
      shearDesignLimit2344,
      check2344Required,
      reactionSourceConfirmed,
      twoDimensionalConfirmed,
      geometryConfirmed,
      anchorageConfirmed,
      modelReviewItems,
      failedItems,
      strengthPass,
      checks,
    };
  }

  root.FoundationDeepBeamSTM = {
    PHI_STM,
    NUMERICAL_TOLERANCE_POLICY,
    parsePileReactions,
    mergeReactionNodes,
    symmetryCheck,
    buildTieSegments,
    pileReactionFactor,
    assess,
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module === 'object' && module.exports) module.exports = globalThis.FoundationDeepBeamSTM;
