/* 鋼筋混凝土工具箱 — 矩形正交樁群之三維樁帽壓拉桿模型核心
 *
 * 適用模型：單一柱／基座垂直合力節點，連接至完整矩形正交樁群；
 * 各樁僅提供正向垂直反力，底部以 X、Y 兩向整體拉桿帶平衡水平分力。
 *
 * 規範依據：112 年建築物混凝土結構設計規範 13.2.6、13.4.6、23 章及 25.2。
 * 本核心不適用多柱、斜樁、拔力樁、水平反力、缺角樁群或任意三維桁架拓樸。
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
    maxMomentErrorPct:1,
    maxHorizontalResidualPct:1,
  });
  const MAX_BALANCE_TOLERANCE_PCT = NUMERICAL_TOLERANCE_POLICY.maxForceErrorPct;
  const MAX_MOMENT_TOLERANCE_PCT = NUMERICAL_TOLERANCE_POLICY.maxMomentErrorPct;
  const MAX_HORIZONTAL_TOLERANCE_PCT = NUMERICAL_TOLERANCE_POLICY.maxHorizontalResidualPct;
  const DeepBeamSTM = root.DeepBeamSTM
    || (typeof module === 'object' && module.exports ? require('./deep-beam-stm.js') : null);

  function n(value) { return Number(value); }
  function positive(value) { return Number.isFinite(n(value)) && n(value) > 0; }
  function nonnegative(value) { return Number.isFinite(n(value)) && n(value) >= 0; }
  function ratioOk(provided, required) {
    return Number.isFinite(provided) && Number.isFinite(required) && provided + EPS >= required;
  }
  function coordinateKey(value) { return n(value).toFixed(6); }
  function nodeKey(x, y) { return `${coordinateKey(x)}|${coordinateKey(y)}`; }

  function parsePileReactions(source) {
    if (Array.isArray(source)) {
      return source.map((item, index) => {
        const id = String(item?.id || `P${index + 1}`).trim();
        const x = n(item?.x);
        const y = n(item?.y);
        const reaction = n(item?.reaction);
        if (!id || !Number.isFinite(x) || !Number.isFinite(y) || !positive(reaction)) {
          throw new Error(`樁反力第 ${index + 1} 列數值無效或含非正向反力`);
        }
        return { id, x, y, reaction };
      });
    }
    const text = String(source == null ? '' : source).trim();
    if (!text) return [];
    return text.split(/\r?\n/).map((line, index) => {
      const parts = line.trim().split(/[\s,，;；\t]+/).filter(Boolean);
      if (!parts.length) return null;
      if (parts.length !== 3 && parts.length !== 4) {
        throw new Error(`樁反力第 ${index + 1} 列須為「x(cm), y(cm), Ru(tf)」或「編號, x, y, Ru」`);
      }
      const offset = parts.length === 4 ? 1 : 0;
      const id = offset ? parts[0] : `P${index + 1}`;
      const x = n(parts[offset]);
      const y = n(parts[offset + 1]);
      const reaction = n(parts[offset + 2]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !positive(reaction)) {
        throw new Error(`樁反力第 ${index + 1} 列數值無效或含非正向反力`);
      }
      return { id, x, y, reaction };
    }).filter(Boolean);
  }

  function uniqueCoordinates(nodes, key) {
    return [...new Map(nodes.map((node) => [coordinateKey(node[key]), node[key]])).values()]
      .sort((a, b) => a - b);
  }

  function inspectRectangularGrid(nodes) {
    const xCoordinates = uniqueCoordinates(nodes, 'x');
    const yCoordinates = uniqueCoordinates(nodes, 'y');
    const keys = new Set(nodes.map((node) => nodeKey(node.x, node.y)));
    const duplicateCount = nodes.length - keys.size;
    const missing = [];
    for (const y of yCoordinates) {
      for (const x of xCoordinates) {
        if (!keys.has(nodeKey(x, y))) missing.push({ x, y });
      }
    }
    return {
      xCoordinates,
      yCoordinates,
      duplicateCount,
      missing,
      complete:xCoordinates.length >= 2
        && yCoordinates.length >= 2
        && duplicateCount === 0
        && missing.length === 0
        && nodes.length === xCoordinates.length * yCoordinates.length,
    };
  }

  function buildDirectionalTieCuts(nodes, coordinate, component) {
    const coordinates = uniqueCoordinates(nodes, coordinate);
    const cuts = [];
    for (let index = 0; index < coordinates.length - 1; index += 1) {
      const cut = (coordinates[index] + coordinates[index + 1]) / 2;
      const signedDemand = nodes
        .filter((node) => node[coordinate] <= cut + EPS)
        .reduce((sum, node) => sum + node[component], 0);
      cuts.push({
        coordinate:cut,
        signedDemand,
        demand:Math.abs(signedDemand),
        leftCoordinate:coordinates[index],
        rightCoordinate:coordinates[index + 1],
      });
    }
    return cuts;
  }

  function pileReactionFactor(distanceFromSection, pileDiameter) {
    const half = pileDiameter / 2;
    if (distanceFromSection >= half - EPS) return 1;
    if (distanceFromSection <= -half + EPS) return 0;
    return (distanceFromSection + half) / pileDiameter;
  }

  function directionalShearDemand(nodes, coordinate, sectionDistance, pileDiameter) {
    let negativeSide = 0;
    let positiveSide = 0;
    for (const node of nodes) {
      if (node[coordinate] > EPS) {
        positiveSide += node.reaction * pileReactionFactor(node[coordinate] - sectionDistance, pileDiameter);
      } else if (node[coordinate] < -EPS) {
        negativeSide += node.reaction * pileReactionFactor(-node[coordinate] - sectionDistance, pileDiameter);
      }
    }
    return { negativeSide, positiveSide, demand:Math.max(negativeSide, positiveSide) };
  }

  function tieLayoutFor(input, axis, bw, h) {
    const source = input?.[`${axis}Tie`] || {};
    return DeepBeamSTM.assessTieLayout({
      bw,
      h,
      tieBarArea:source.barArea,
      tieBarDiameter:source.barDiameter,
      tieCount:source.count,
      tieRows:source.rows,
      tieSideCover:source.sideCover,
      tieTransverseBarDiameter:source.transverseBarDiameter,
      maxAggregateSize:source.maxAggregateSize,
      tieVerticalClearSpacing:source.verticalClearSpacing,
    });
  }

  function assess(input = {}) {
    if (!DeepBeamSTM || typeof DeepBeamSTM.assessTieLayout !== 'function') {
      return { valid:false, status:'invalid-input', errors:['缺少深梁多排拉桿配置核心'] };
    }

    const values = {
      capLengthX:n(input.capLengthX),
      capWidthY:n(input.capWidthY),
      h:n(input.h),
      columnX:n(input.columnX),
      columnY:n(input.columnY),
      loadNodeDepth:n(input.loadNodeDepth),
      pileDiameter:n(input.pileDiameter),
      Pu:n(input.Pu),
      Mx:n(input.Mx),
      My:n(input.My),
      fc:n(input.fc),
      fy:n(input.fy),
      lambda:input.lambda == null ? 1 : n(input.lambda),
      betaC:input.betaC == null ? 1 : n(input.betaC),
      betaS:input.betaS == null ? 0.4 : n(input.betaS),
      strutArea:n(input.strutArea),
      topNodeArea:n(input.topNodeArea),
      bottomNodeArea:n(input.bottomNodeArea),
      xTieMinimumArea:n(input.xTieMinimumArea),
      yTieMinimumArea:n(input.yTieMinimumArea),
      balanceTolerancePct:input.balanceTolerancePct == null ? MAX_BALANCE_TOLERANCE_PCT : n(input.balanceTolerancePct),
      momentTolerancePct:input.momentTolerancePct == null ? MAX_MOMENT_TOLERANCE_PCT : n(input.momentTolerancePct),
      horizontalTolerancePct:input.horizontalTolerancePct == null ? MAX_HORIZONTAL_TOLERANCE_PCT : n(input.horizontalTolerancePct),
    };

    const errors = [];
    for (const key of [
      'capLengthX', 'capWidthY', 'h', 'columnX', 'columnY', 'loadNodeDepth', 'pileDiameter',
      'Pu', 'fc', 'fy', 'lambda', 'betaC', 'strutArea', 'topNodeArea', 'bottomNodeArea',
      'xTieMinimumArea', 'yTieMinimumArea', 'balanceTolerancePct', 'momentTolerancePct', 'horizontalTolerancePct',
    ]) if (!positive(values[key])) errors.push(`${key} 須為正值`);
    if (!Number.isFinite(values.Mx)) errors.push('Mx 須為有限數值');
    if (!Number.isFinite(values.My)) errors.push('My 須為有限數值');
    if (positive(values.fy) && values.fy > MAX_STM_TIE_FY + EPS) errors.push('STM 拉桿 fy 不得大於 5600 kgf/cm²');
    if (positive(values.lambda) && values.lambda > MAX_LAMBDA + EPS) errors.push('λ 不得大於 1.0');
    if (positive(values.betaC) && values.betaC > MAX_BETA_C + EPS) errors.push('βc 不得大於 2.0');
    if (positive(values.balanceTolerancePct) && values.balanceTolerancePct > MAX_BALANCE_TOLERANCE_PCT + EPS) errors.push(`垂直力平衡容許誤差不得大於 ${MAX_BALANCE_TOLERANCE_PCT.toFixed(1)}%`);
    if (positive(values.momentTolerancePct) && values.momentTolerancePct > MAX_MOMENT_TOLERANCE_PCT + EPS) errors.push(`力矩平衡容許誤差不得大於 ${MAX_MOMENT_TOLERANCE_PCT.toFixed(1)}%`);
    if (positive(values.horizontalTolerancePct) && values.horizontalTolerancePct > MAX_HORIZONTAL_TOLERANCE_PCT + EPS) errors.push(`水平力平衡容許殘差不得大於 ${MAX_HORIZONTAL_TOLERANCE_PCT.toFixed(1)}%`);
    if (![0.4, 0.75].some((candidate) => Math.abs(values.betaS - candidate) < EPS)) {
      errors.push('βs 僅支援樁帽內部壓桿適用的 0.40 或 0.75');
    }
    if (positive(values.loadNodeDepth) && positive(values.h) && values.loadNodeDepth >= values.h - EPS) {
      errors.push('loadNodeDepth 須小於 h');
    }

    const xTieLayout = tieLayoutFor(input, 'x', values.capWidthY, values.h);
    const yTieLayout = tieLayoutFor(input, 'y', values.capLengthX, values.h);
    if (!xTieLayout.valid) errors.push(...xTieLayout.errors.map((item) => `X 向：${item}`));
    if (!yTieLayout.valid) errors.push(...yTieLayout.errors.map((item) => `Y 向：${item}`));

    let nodes = [];
    try {
      nodes = parsePileReactions(input.pileReactions);
    } catch (error) {
      errors.push(error.message || String(error));
    }
    if (nodes.length && new Set(nodes.map((node) => node.id)).size !== nodes.length) errors.push('樁編號不得重複');
    if (nodes.length < 4) errors.push('三維正交樁群至少須有 4 支樁');
    const grid = inspectRectangularGrid(nodes);
    if (nodes.length && !grid.complete) errors.push('僅支援無重複、無缺角的完整矩形正交樁群');
    if (nodes.some((node) => Math.abs(node.x) + values.pileDiameter / 2 > values.capLengthX / 2 + EPS)) {
      errors.push('樁圓超出樁帽 X 向邊界');
    }
    if (nodes.some((node) => Math.abs(node.y) + values.pileDiameter / 2 > values.capWidthY / 2 + EPS)) {
      errors.push('樁圓超出樁帽 Y 向邊界');
    }
    if (values.topNodeArea > values.columnX * values.columnY + EPS) errors.push('topNodeArea 不得大於柱／基座承壓面積');
    const pileBearingArea = Math.PI * values.pileDiameter * values.pileDiameter / 4;
    if (values.bottomNodeArea > pileBearingArea + EPS) errors.push('bottomNodeArea 不得大於單樁承壓面積');

    if (errors.length) return { valid:false, status:'invalid-input', errors, input:values, grid };

    const xTieAxisFromBottom = xTieLayout.centroidFromBottom;
    const yTieAxisFromBottom = yTieLayout.centroidFromBottom;
    const lowerNodeAxisFromBottom = (xTieAxisFromBottom + yTieAxisFromBottom) / 2;
    const tieLayerOffset = Math.abs(xTieAxisFromBottom - yTieAxisFromBottom);
    const z = values.h - values.loadNodeDepth - lowerNodeAxisFromBottom;
    const dX = values.h - xTieAxisFromBottom;
    const dY = values.h - yTieAxisFromBottom;
    if (!positive(z) || !positive(dX) || !positive(dY)) {
      return { valid:false, status:'invalid-input', errors:['X/Y 拉桿形心造成無效桿臂或有效深度'], input:values, grid };
    }

    const loadX = values.My * 100 / values.Pu;
    const loadY = values.Mx * 100 / values.Pu;
    const loadPointInsideColumn = Math.abs(loadX) <= values.columnX / 2 + EPS
      && Math.abs(loadY) <= values.columnY / 2 + EPS;

    nodes = nodes.map((node, index) => {
      const dx = node.x - loadX;
      const dy = node.y - loadY;
      const planDistance = Math.hypot(dx, dy);
      const length = Math.hypot(planDistance, z);
      const thetaRad = Math.atan2(z, planDistance);
      const thetaDeg = thetaRad * 180 / Math.PI;
      const thetaXDeg = Math.abs(dx) < EPS ? 90 : Math.atan2(z, Math.abs(dx)) * 180 / Math.PI;
      const thetaYDeg = Math.abs(dy) < EPS ? 90 : Math.atan2(z, Math.abs(dy)) * 180 / Math.PI;
      const strutDemand = node.reaction * length / z;
      const horizontalX = node.reaction * dx / z;
      const horizontalY = node.reaction * dy / z;
      return {
        ...node,
        index:index + 1,
        dx,
        dy,
        planDistance,
        length,
        thetaRad,
        thetaDeg,
        thetaXDeg,
        thetaYDeg,
        strutDemand,
        horizontalX,
        horizontalY,
      };
    });

    const reactionTotal = nodes.reduce((sum, node) => sum + node.reaction, 0);
    const reactionMomentX = nodes.reduce((sum, node) => sum + node.reaction * node.y, 0);
    const reactionMomentY = nodes.reduce((sum, node) => sum + node.reaction * node.x, 0);
    const targetMomentX = values.Mx * 100;
    const targetMomentY = values.My * 100;
    const forceErrorPct = Math.abs(reactionTotal - values.Pu) / values.Pu * 100;
    const momentXErrorPct = Math.abs(reactionMomentX - targetMomentX)
      / Math.max(values.Pu * values.capWidthY / 2, EPS) * 100;
    const momentYErrorPct = Math.abs(reactionMomentY - targetMomentY)
      / Math.max(values.Pu * values.capLengthX / 2, EPS) * 100;
    const forceBalanceOk = forceErrorPct <= values.balanceTolerancePct + EPS;
    const momentXBalanceOk = momentXErrorPct <= values.momentTolerancePct + EPS;
    const momentYBalanceOk = momentYErrorPct <= values.momentTolerancePct + EPS;
    const horizontalResidualX = nodes.reduce((sum, node) => sum + node.horizontalX, 0);
    const horizontalResidualY = nodes.reduce((sum, node) => sum + node.horizontalY, 0);
    const horizontalActionX = nodes.reduce((sum, node) => sum + Math.abs(node.horizontalX), 0);
    const horizontalActionY = nodes.reduce((sum, node) => sum + Math.abs(node.horizontalY), 0);
    const horizontalResidualXPct = Math.abs(horizontalResidualX) / Math.max(horizontalActionX, EPS) * 100;
    const horizontalResidualYPct = Math.abs(horizontalResidualY) / Math.max(horizontalActionY, EPS) * 100;
    const horizontalXBalanceOk = horizontalResidualXPct <= values.horizontalTolerancePct + EPS;
    const horizontalYBalanceOk = horizontalResidualYPct <= values.horizontalTolerancePct + EPS;
    const topologyOk = grid.complete && forceBalanceOk && momentXBalanceOk && momentYBalanceOk
      && horizontalXBalanceOk && horizontalYBalanceOk && loadPointInsideColumn;
    const minThetaDeg = Math.min(...nodes.map((node) => node.thetaDeg));
    const minThetaXDeg = Math.min(...nodes.map((node) => node.thetaXDeg));
    const minThetaYDeg = Math.min(...nodes.map((node) => node.thetaYDeg));
    const angleOk = minThetaDeg + EPS >= 25;

    const xTieCuts = buildDirectionalTieCuts(nodes, 'x', 'horizontalX');
    const yTieCuts = buildDirectionalTieCuts(nodes, 'y', 'horizontalY');
    const xTieDemand = xTieCuts.length ? Math.max(...xTieCuts.map((cut) => cut.demand)) : 0;
    const yTieDemand = yTieCuts.length ? Math.max(...yTieCuts.map((cut) => cut.demand)) : 0;
    const xTieAsStm = xTieDemand * 1000 / (PHI_STM * values.fy);
    const yTieAsStm = yTieDemand * 1000 / (PHI_STM * values.fy);
    const xTieAsRequired = Math.max(xTieAsStm, values.xTieMinimumArea);
    const yTieAsRequired = Math.max(yTieAsStm, values.yTieMinimumArea);
    const xTieOk = ratioOk(xTieLayout.providedArea, xTieAsRequired);
    const yTieOk = ratioOk(yTieLayout.providedArea, yTieAsRequired);
    const tieLayoutOk = xTieLayout.layoutOk && yTieLayout.layoutOk;
    const tieLayerOffsetOk = tieLayerOffset <= Math.max(xTieLayout.input.barDiameter, yTieLayout.input.barDiameter) + EPS;

    const strutFce = 0.85 * values.betaC * values.betaS * values.fc;
    const strutDesign = PHI_STM * strutFce * values.strutArea / 1000;
    nodes = nodes.map((node) => ({
      ...node,
      strutDcr:node.strutDemand / strutDesign,
      strutOk:ratioOk(strutDesign, node.strutDemand),
    }));
    const strutOk = nodes.every((node) => node.strutOk);
    const maxStrutDcr = Math.max(...nodes.map((node) => node.strutDcr));

    const topNodeFce = 0.85 * values.betaC * 1.0 * values.fc;
    const topNodeDesign = PHI_STM * topNodeFce * values.topNodeArea / 1000;
    const topNodeOk = ratioOk(topNodeDesign, values.Pu);
    const bottomNodeFce = 0.85 * values.betaC * 0.8 * values.fc;
    const bottomNodeDesign = PHI_STM * bottomNodeFce * values.bottomNodeArea / 1000;
    const bottomNodeResults = nodes.map((node) => {
      const demand = Math.max(node.reaction, node.strutDemand);
      return { id:node.id, demand, design:bottomNodeDesign, dcr:demand / bottomNodeDesign, ok:ratioOk(bottomNodeDesign, demand) };
    });
    const bottomNodeOk = bottomNodeResults.every((item) => item.ok);

    const criticalSectionX = values.columnX / 2 + dX;
    const criticalSectionY = values.columnY / 2 + dY;
    const shearX = directionalShearDemand(nodes, 'x', criticalSectionX, values.pileDiameter);
    const shearY = directionalShearDemand(nodes, 'y', criticalSectionY, values.pileDiameter);
    const distributionReinforcementComplies = input.distributionReinforcementComplies === true;
    const lambdaSX = distributionReinforcementComplies ? 1 : Math.sqrt(2 / (1 + dX / 25));
    const lambdaSY = distributionReinforcementComplies ? 1 : Math.sqrt(2 / (1 + dY / 25));
    const shearDesignLimitX = PHI_STM * 1.32 * Math.tan(minThetaXDeg * Math.PI / 180)
      * values.lambda * lambdaSX * Math.sqrt(values.fc) * values.capWidthY * dX / 1000;
    const shearDesignLimitY = PHI_STM * 1.32 * Math.tan(minThetaYDeg * Math.PI / 180)
      * values.lambda * lambdaSY * Math.sqrt(values.fc) * values.capLengthX * dY / 1000;
    const check2344Required = Math.abs(values.betaS - 0.75) < EPS;
    const shearLimitXOk = !check2344Required || ratioOk(shearDesignLimitX, shearX.demand);
    const shearLimitYOk = !check2344Required || ratioOk(shearDesignLimitY, shearY.demand);
    const pileEffectiveDepthOk = Math.min(dX, dY) + EPS >= 30;

    const reactionSourceConfirmed = input.reactionSourceConfirmed === true;
    const threeDimensionalTopologyConfirmed = input.threeDimensionalTopologyConfirmed === true;
    const nodalGeometryConfirmed = input.nodalGeometryConfirmed === true;
    const anchorageConfirmed = input.anchorageConfirmed === true;
    const localTieDistributionConfirmed = input.localTieDistributionConfirmed === true;
    const modelReviewItems = [];
    if (!reactionSourceConfirmed) modelReviewItems.push('Pu、Mux、Muy 與各樁因數化反力之同一載重組合來源');
    if (!threeDimensionalTopologyConfirmed) modelReviewItems.push('三維壓桿拓樸與實際樁帽力流代表性');
    if (!nodalGeometryConfirmed) modelReviewItems.push('柱節點、樁節點與壓桿有效面積幾何');
    if (!anchorageConfirmed) modelReviewItems.push('X/Y 拉桿於外側樁節點區之錨定與發展');
    if (!localTieDistributionConfirmed) modelReviewItems.push('整體拉桿帶需求分配至各樁列與局部配筋帶之施工圖細節');

    const checks = {
      forceBalanceOk,
      momentXBalanceOk,
      momentYBalanceOk,
      horizontalXBalanceOk,
      horizontalYBalanceOk,
      loadPointInsideColumn,
      topologyOk,
      angleOk,
      xTieOk,
      yTieOk,
      tieLayoutOk,
      tieLayerOffsetOk,
      strutOk,
      topNodeOk,
      bottomNodeOk,
      shearLimitXOk,
      shearLimitYOk,
      pileEffectiveDepthOk,
    };
    const failedItems = Object.entries({
      '垂直力平衡':forceBalanceOk,
      '繞 X 軸力矩平衡':momentXBalanceOk,
      '繞 Y 軸力矩平衡':momentYBalanceOk,
      'X 向水平力平衡':horizontalXBalanceOk,
      'Y 向水平力平衡':horizontalYBalanceOk,
      '載重合力節點位於柱／基座承壓面內':loadPointInsideColumn,
      '三維壓桿最小夾角':angleOk,
      'X 向底部拉桿':xTieOk,
      'Y 向底部拉桿':yTieOk,
      'X/Y 拉桿多排配置':tieLayoutOk,
      'X/Y 拉桿節點高程相容':tieLayerOffsetOk,
      '三維壓桿強度':strutOk,
      '柱下 CCC 節點強度':topNodeOk,
      '樁頂 CCT 節點強度':bottomNodeOk,
      ...(check2344Required ? { '23.4.4 X 向剪力條件':shearLimitXOk, '23.4.4 Y 向剪力條件':shearLimitYOk } : {}),
      '13.4.6.1 樁帽有效深度':pileEffectiveDepthOk,
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
        adoptedMomentErrorPct:values.momentTolerancePct,
        adoptedHorizontalResidualPct:values.horizontalTolerancePct,
      },
      grid,
      nodes,
      pileBearingArea,
      loadX,
      loadY,
      xTieLayout,
      yTieLayout,
      xTieAxisFromBottom,
      yTieAxisFromBottom,
      lowerNodeAxisFromBottom,
      tieLayerOffset,
      z,
      dX,
      dY,
      reactionTotal,
      reactionMomentX,
      reactionMomentY,
      targetMomentX,
      targetMomentY,
      forceErrorPct,
      momentXErrorPct,
      momentYErrorPct,
      horizontalResidualX,
      horizontalResidualY,
      horizontalActionX,
      horizontalActionY,
      horizontalResidualXPct,
      horizontalResidualYPct,
      minThetaDeg,
      minThetaXDeg,
      minThetaYDeg,
      xTieCuts,
      yTieCuts,
      xTieDemand,
      yTieDemand,
      xTieAsStm,
      yTieAsStm,
      xTieAsRequired,
      yTieAsRequired,
      xTieDcr:xTieAsRequired / xTieLayout.providedArea,
      yTieDcr:yTieAsRequired / yTieLayout.providedArea,
      strutFce,
      strutDesign,
      maxStrutDcr,
      topNodeFce,
      topNodeDesign,
      topNodeDcr:values.Pu / topNodeDesign,
      bottomNodeFce,
      bottomNodeDesign,
      bottomNodeResults,
      criticalSectionX,
      criticalSectionY,
      shearX,
      shearY,
      distributionReinforcementComplies,
      lambdaSX,
      lambdaSY,
      shearDesignLimitX,
      shearDesignLimitY,
      check2344Required,
      reactionSourceConfirmed,
      threeDimensionalTopologyConfirmed,
      nodalGeometryConfirmed,
      anchorageConfirmed,
      localTieDistributionConfirmed,
      modelReviewItems,
      failedItems,
      strengthPass,
      checks,
    };
  }

  root.PileCap3DSTM = {
    PHI_STM,
    NUMERICAL_TOLERANCE_POLICY,
    parsePileReactions,
    inspectRectangularGrid,
    buildDirectionalTieCuts,
    pileReactionFactor,
    directionalShearDemand,
    assess,
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module === 'object' && module.exports) module.exports = globalThis.PileCap3DSTM;
