(function (root, factory) {
  const dependency = typeof module === 'object' && module.exports
    ? require('../../../鋼筋混凝土/shared/pmsection.js')
    : root.PMSection;
  const api = factory(dependency);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RcColumnCoverDeviationCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function (PMSection) {
  'use strict';

  if (!PMSection || typeof PMSection.curve !== 'function' || typeof PMSection.checkDemand !== 'function') {
    throw new Error('RcColumnCoverDeviationCore requires PMSection');
  }

  const CORE_VERSION = '0.1.0';
  const inputSchemaVersion = 'rc-column-cover-deviation.input.v0.1';
  const resultSchemaVersion = 'rc-column-cover-deviation.result.v0.1';
  const logicSignature = 'rc-column-cover-deviation-core:v0.1:pmsection-strain-compatibility:four-face-center-distance';
  const BAR_AREA_DIAMETER_RELATIVE_TOLERANCE = 0.05;
  const OFFICIAL_REFERENCE_URL = 'https://www.nlma.gov.tw/uploads/files/011d9249cac7d6c5547786aa348e352a.pdf';
  const DIRECTION_DEFINITIONS = Object.freeze([
    Object.freeze({ key: 'mxPositive', label: '+Mx（上緣受壓）', axis: 'x', reverse: false, demandKey: 'muXPositiveTfm' }),
    Object.freeze({ key: 'mxNegative', label: '−Mx（下緣受壓）', axis: 'x', reverse: true, demandKey: 'muXNegativeTfm' }),
    Object.freeze({ key: 'myPositive', label: '+My（左緣受壓）', axis: 'y', reverse: false, demandKey: 'muYPositiveTfm' }),
    Object.freeze({ key: 'myNegative', label: '−My（右緣受壓）', axis: 'y', reverse: true, demandKey: 'muYNegativeTfm' }),
  ]);

  function number(value, fallback) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string' && !value.trim()) return NaN;
    return Number(value);
  }

  function integer(value, fallback) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string' && !value.trim()) return NaN;
    return Number(value);
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeInput(input) {
    const source = input || {};
    return {
      inputSchemaVersion,
      sectionWidthMm: number(source.sectionWidthMm, 500),
      sectionDepthMm: number(source.sectionDepthMm, 600),
      sectionDimensionBasis: text(source.sectionDimensionBasis),
      fcKgfCm2: number(source.fcKgfCm2, 280),
      fyKgfCm2: number(source.fyKgfCm2, 4200),
      esKgfCm2: number(source.esKgfCm2, 2040000),
      materialBasis: text(source.materialBasis),
      barAreaCm2: number(source.barAreaCm2, 5.067),
      mainBarDiameterMm: number(source.mainBarDiameterMm, 25.4),
      stirrupDiameterMm: number(source.stirrupDiameterMm, 10),
      barsPerTopBottomFace: integer(source.barsPerTopBottomFace, 4),
      intermediateBarsPerSide: integer(source.intermediateBarsPerSide, 2),
      designCenterTopMm: number(source.designCenterTopMm, 65),
      designCenterBottomMm: number(source.designCenterBottomMm, 65),
      designCenterLeftMm: number(source.designCenterLeftMm, 65),
      designCenterRightMm: number(source.designCenterRightMm, 65),
      measurementMode: text(source.measurementMode || 'unknown'),
      measuredTopMm: number(source.measuredTopMm, 80),
      measuredBottomMm: number(source.measuredBottomMm, 65),
      measuredLeftMm: number(source.measuredLeftMm, 70),
      measuredRightMm: number(source.measuredRightMm, 65),
      measurementBasis: text(source.measurementBasis),
      puTf: number(source.puTf, 120),
      muXPositiveTfm: number(source.muXPositiveTfm, 28),
      muXNegativeTfm: number(source.muXNegativeTfm, 22),
      muYPositiveTfm: number(source.muYPositiveTfm, 20),
      muYNegativeTfm: number(source.muYNegativeTfm, 18),
      demandBasis: text(source.demandBasis),
      minimumRetentionRatio: number(source.minimumRetentionRatio, 0.90),
    };
  }

  function hasTraceableBasis(value) {
    const normalized = text(value);
    if (normalized.length < 8) return false;
    return !/(?:不明|未知|待確認|未確認|待複核|待.{0,8}複核|placeholder|n\/a|none)/i.test(normalized);
  }

  function centerDistances(input, measured) {
    if (!measured) {
      return {
        top: input.designCenterTopMm,
        bottom: input.designCenterBottomMm,
        left: input.designCenterLeftMm,
        right: input.designCenterRightMm,
        conversionOffsetMm: 0,
        sourceMode: 'bar-center',
      };
    }
    const conversionOffsetMm = input.measurementMode === 'clear-cover'
      ? input.stirrupDiameterMm + input.mainBarDiameterMm / 2
      : 0;
    return {
      top: input.measuredTopMm + conversionOffsetMm,
      bottom: input.measuredBottomMm + conversionOffsetMm,
      left: input.measuredLeftMm + conversionOffsetMm,
      right: input.measuredRightMm + conversionOffsetMm,
      conversionOffsetMm,
      sourceMode: input.measurementMode,
    };
  }

  function validateCenters(centers, width, depth, prefix, issues) {
    for (const [face, value] of Object.entries({ top: centers.top, bottom: centers.bottom, left: centers.left, right: centers.right })) {
      if (!(value > 0) || !Number.isFinite(value)) issues.push(`${prefix}${face} 主筋中心距必須大於 0。`);
    }
    if (centers.top + centers.bottom >= depth) issues.push(`${prefix}上、下主筋中心距合計必須小於柱深。`);
    if (centers.left + centers.right >= width) issues.push(`${prefix}左、右主筋中心距合計必須小於柱寬。`);
  }

  function validateBarLayoutGeometry(input, centers, prefix, issues) {
    const radius = input.mainBarDiameterMm / 2;
    const faceCenters = { top: centers.top, bottom: centers.bottom, left: centers.left, right: centers.right };
    for (const [face, value] of Object.entries(faceCenters)) {
      if (Number.isFinite(value) && Number.isFinite(radius) && value + 1e-9 < radius) {
        issues.push(`${prefix}${face}主筋中心距不得小於主筋半徑 db/2=${radius.toFixed(2)} mm。`);
      }
    }
    const countsReady = Number.isInteger(input.barsPerTopBottomFace)
      && input.barsPerTopBottomFace >= 2
      && Number.isInteger(input.intermediateBarsPerSide)
      && input.intermediateBarsPerSide >= 0;
    const centersReady = Object.values(faceCenters).every(Number.isFinite)
      && centers.top + centers.bottom < input.sectionDepthMm
      && centers.left + centers.right < input.sectionWidthMm;
    if (!countsReady || !centersReady || !(input.mainBarDiameterMm > 0)) return;

    const horizontalSpan = input.sectionWidthMm - centers.left - centers.right;
    const verticalSpan = input.sectionDepthMm - centers.top - centers.bottom;
    const horizontalSpacing = horizontalSpan / (input.barsPerTopBottomFace - 1);
    const verticalSpacing = verticalSpan / (input.intermediateBarsPerSide + 1);
    if (horizontalSpacing + 1e-9 < input.mainBarDiameterMm) {
      issues.push(`${prefix}上、下沿面相鄰主筋中心距 ${horizontalSpacing.toFixed(2)} mm 小於 db=${input.mainBarDiameterMm.toFixed(2)} mm，鋼筋幾何重疊。`);
    }
    if (verticalSpacing + 1e-9 < input.mainBarDiameterMm) {
      issues.push(`${prefix}左、右沿面相鄰主筋中心距 ${verticalSpacing.toFixed(2)} mm 小於 db=${input.mainBarDiameterMm.toFixed(2)} mm，鋼筋幾何重疊。`);
    }

    const bars = buildPhysicalBars(input, centers);
    const widthCm = input.sectionWidthMm / 10;
    const depthCm = input.sectionDepthMm / 10;
    const radiusCm = radius / 10;
    bars.forEach(bar => {
      if (bar.x + 1e-9 < radiusCm || bar.x - 1e-9 > widthCm - radiusCm
        || bar.y + 1e-9 < radiusCm || bar.y - 1e-9 > depthCm - radiusCm) {
        issues.push(`${prefix}主筋 ${bar.id} 座標超出混凝土斷面可容納範圍。`);
      }
    });
    for (let i = 0; i < bars.length; i += 1) {
      for (let j = i + 1; j < bars.length; j += 1) {
        const distanceMm = Math.hypot(bars[i].x - bars[j].x, bars[i].y - bars[j].y) * 10;
        if (distanceMm + 1e-9 < input.mainBarDiameterMm) {
          issues.push(`${prefix}主筋 ${bars[i].id} 與 ${bars[j].id} 中心距 ${distanceMm.toFixed(2)} mm 小於 db，座標重合或鋼筋重疊。`);
          return;
        }
      }
    }
  }

  function validateInput(input) {
    const normalized = normalizeInput(input);
    const issues = [];
    if (!(normalized.sectionWidthMm >= 200) || !(normalized.sectionWidthMm <= 3000)) issues.push('柱寬必須介於 200 與 3000 mm。');
    if (!(normalized.sectionDepthMm >= 200) || !(normalized.sectionDepthMm <= 3000)) issues.push('柱深必須介於 200 與 3000 mm。');
    if (!(normalized.fcKgfCm2 >= 175) || !(normalized.fcKgfCm2 <= 700)) issues.push("fc' 必須介於 175 與 700 kgf/cm²。 ");
    if (!Number.isFinite(normalized.fyKgfCm2) || normalized.fyKgfCm2 < 2000 || normalized.fyKgfCm2 > 5600) issues.push('fy 必須為 2,000～5,600 kgf/cm² 的有限數值；本版不涵蓋較低強度或特殊／舊式鋼筋。');
    if (!Number.isFinite(normalized.esKgfCm2) || Math.abs(normalized.esKgfCm2 - 2040000) > 1e-9) {
      issues.push('Es 本版依規範 20.2.2.2 固定採 2,040,000 kgf/cm²；自訂彈性模數不在本版範圍。');
    }
    if (!(normalized.barAreaCm2 > 0) || !(normalized.barAreaCm2 <= 25)) issues.push('單支主筋面積必須大於 0 且不超過 25 cm²。');
    if (!Number.isFinite(normalized.mainBarDiameterMm) || normalized.mainBarDiameterMm < 6 || normalized.mainBarDiameterMm > 80) issues.push('主筋直徑 db 必須為 6～80 mm 的有限數值；微型或非標準補強筋不在本版範圍。');
    if (!Number.isFinite(normalized.stirrupDiameterMm) || normalized.stirrupDiameterMm < 4 || normalized.stirrupDiameterMm > 40) issues.push('箍筋直徑 dtie 必須為 4～40 mm 的有限數值；微型或非標準箍筋不在本版範圍。');
    const nominalAreaFromDiameterCm2 = Math.PI * Math.pow(normalized.mainBarDiameterMm / 10, 2) / 4;
    const areaDiameterRelativeDifference = Math.abs(normalized.barAreaCm2 - nominalAreaFromDiameterCm2) / nominalAreaFromDiameterCm2;
    if (Number.isFinite(areaDiameterRelativeDifference) && areaDiameterRelativeDifference > BAR_AREA_DIAMETER_RELATIVE_TOLERANCE + 1e-12) {
      issues.push(`主筋面積與直徑不一致：As=${normalized.barAreaCm2.toFixed(3)} cm²，πdb²/4=${nominalAreaFromDiameterCm2.toFixed(3)} cm²，相對差 ${(100 * areaDiameterRelativeDifference).toFixed(1)}% 超過 5%。`);
    }
    if (!Number.isInteger(normalized.barsPerTopBottomFace) || normalized.barsPerTopBottomFace < 2 || normalized.barsPerTopBottomFace > 30) issues.push('上、下每面主筋支數必須為 2 至 30 的整數，且包含兩支角筋。');
    if (!Number.isInteger(normalized.intermediateBarsPerSide) || normalized.intermediateBarsPerSide < 0 || normalized.intermediateBarsPerSide > 28) issues.push('左、右每側中間主筋支數必須為 0 至 28 的整數，且不含角筋。');
    if (!['bar-center', 'clear-cover'].includes(normalized.measurementMode)) issues.push('量測基準必須明確選擇縱向主筋中心距或淨保護層換算。');
    if (!hasTraceableBasis(normalized.sectionDimensionBasis)) issues.push('臨界斷面尺寸量測依據不足。');
    if (!hasTraceableBasis(normalized.materialBasis)) issues.push('材料強度依據不足。');
    if (!hasTraceableBasis(normalized.measurementBasis)) issues.push('鋼筋位置量測依據不足。');
    if (!hasTraceableBasis(normalized.demandBasis)) issues.push('需求內力來源依據不足。');
    for (const [face, key] of Object.entries({ top: 'measuredTopMm', bottom: 'measuredBottomMm', left: 'measuredLeftMm', right: 'measuredRightMm' })) {
      if (!Number.isFinite(normalized[key]) || !(normalized[key] > 0)) {
        issues.push(`實測 ${face} 原始輸入必須為大於 0 的有限數值；淨保護層不得以換算偏移掩蓋零值或負值。`);
      }
    }
    if (!Number.isFinite(normalized.puTf)) issues.push('Pu 必須為有限數值（壓力為正、拉力為負）。');
    for (const key of ['muXPositiveTfm', 'muXNegativeTfm', 'muYPositiveTfm', 'muYNegativeTfm']) {
      if (!(normalized[key] >= 0) || !Number.isFinite(normalized[key])) issues.push(`${key} 必須為非負有限數值。`);
    }
    if (!(normalized.minimumRetentionRatio > 0) || !(normalized.minimumRetentionRatio <= 1.5)) issues.push('專案指定最低容量保留比必須大於 0 且不超過 1.5。');
    const designCenters = centerDistances(normalized, false);
    const measuredCenters = centerDistances(normalized, true);
    validateCenters(designCenters, normalized.sectionWidthMm, normalized.sectionDepthMm, '設計', issues);
    validateCenters(measuredCenters, normalized.sectionWidthMm, normalized.sectionDepthMm, '實測', issues);
    validateBarLayoutGeometry(normalized, designCenters, '設計', issues);
    validateBarLayoutGeometry(normalized, measuredCenters, '實測', issues);
    const totalBars = 2 * normalized.barsPerTopBottomFace + 2 * normalized.intermediateBarsPerSide;
    const totalSteelAreaCm2 = totalBars * normalized.barAreaCm2;
    const grossAreaCm2 = normalized.sectionWidthMm * normalized.sectionDepthMm / 100;
    if (Number.isFinite(totalSteelAreaCm2) && Number.isFinite(grossAreaCm2) && totalSteelAreaCm2 >= grossAreaCm2) {
      issues.push(`縱向主筋總面積 Ast=${totalSteelAreaCm2.toFixed(3)} cm² 必須小於混凝土毛斷面 Ag=${grossAreaCm2.toFixed(3)} cm²。`);
    }
    return issues;
  }

  function evenlySpaced(start, end, count, includeEnds) {
    if (count <= 0) return [];
    if (includeEnds) {
      if (count === 1) return [(start + end) / 2];
      return Array.from({ length: count }, (_, index) => start + (end - start) * index / (count - 1));
    }
    return Array.from({ length: count }, (_, index) => start + (end - start) * (index + 1) / (count + 1));
  }

  function buildPhysicalBars(input, centers) {
    const left = centers.left / 10;
    const right = (input.sectionWidthMm - centers.right) / 10;
    const top = centers.top / 10;
    const bottom = (input.sectionDepthMm - centers.bottom) / 10;
    const xFace = evenlySpaced(left, right, input.barsPerTopBottomFace, true);
    const ySide = evenlySpaced(top, bottom, input.intermediateBarsPerSide, false);
    const bars = [];
    xFace.forEach((x, index) => bars.push({ id: `T${index + 1}`, x, y: top, As: input.barAreaCm2 }));
    xFace.forEach((x, index) => bars.push({ id: `B${index + 1}`, x, y: bottom, As: input.barAreaCm2 }));
    ySide.forEach((y, index) => bars.push({ id: `L${index + 1}`, x: left, y, As: input.barAreaCm2 }));
    ySide.forEach((y, index) => bars.push({ id: `R${index + 1}`, x: right, y, As: input.barAreaCm2 }));
    return bars;
  }

  function sectionForDirection(input, bars, direction) {
    const widthCm = input.sectionWidthMm / 10;
    const depthCm = input.sectionDepthMm / 10;
    if (direction.axis === 'x') {
      return {
        b: widthCm,
        h: depthCm,
        bars: bars.map(bar => ({ y: direction.reverse ? depthCm - bar.y : bar.y, As: bar.As })),
      };
    }
    return {
      b: depthCm,
      h: widthCm,
      bars: bars.map(bar => ({ y: direction.reverse ? widthCm - bar.x : bar.x, As: bar.As })),
    };
  }

  function material(input) {
    return {
      fc: input.fcKgfCm2,
      fy: input.fyKgfCm2,
      Es: input.esKgfCm2,
      phiComp: 0.65,
      phiTen: 0.90,
      PnMaxFactor: 0.80,
    };
  }

  function evaluateDirection(input, designBars, measuredBars, direction) {
    const designCurve = PMSection.curve(sectionForDirection(input, designBars, direction), material(input), { steps: 181 });
    const measuredCurve = PMSection.curve(sectionForDirection(input, measuredBars, direction), material(input), { steps: 181 });
    const demand = input[direction.demandKey];
    const designCheck = PMSection.checkDemand(designCurve.design, input.puTf, demand);
    const measuredCheck = PMSection.checkDemand(measuredCurve.design, input.puTf, demand);
    const retentionRatio = designCheck.phiMn > 0 ? measuredCheck.phiMn / designCheck.phiMn : 0;
    return {
      key: direction.key,
      label: direction.label,
      axis: direction.axis,
      demandTfm: demand,
      design: {
        phiMnTfm: designCheck.phiMn,
        utilization: designCheck.util,
        axialOk: designCheck.axialOk,
        ok: designCheck.ok,
        pMinTf: designCheck.pMin,
        pMaxTf: designCheck.pMax,
      },
      measured: {
        phiMnTfm: measuredCheck.phiMn,
        utilization: measuredCheck.util,
        axialOk: measuredCheck.axialOk,
        ok: measuredCheck.ok,
        pMinTf: measuredCheck.pMin,
        pMaxTf: measuredCheck.pMax,
      },
      retentionRatio,
      capacityChangePercent: (retentionRatio - 1) * 100,
    };
  }

  function checkItem(key, label, passed, detail) {
    return {
      key,
      label,
      status: passed == null ? 'not_applicable' : (passed ? 'pass' : 'fail'),
      passed: passed == null ? null : Boolean(passed),
      detail: String(detail || ''),
    };
  }

  function provenance() {
    return {
      core: 'RcColumnCoverDeviationCore',
      version: CORE_VERSION,
      inputSchemaVersion,
      resultSchemaVersion,
      logicSignature,
      productionDependency: '鋼筋混凝土/shared/pmsection.js',
      reference: {
        authority: '規範判定',
        title: '內政部國土署 建築物混凝土結構設計規範（112 年版）',
        url: OFFICIAL_REFERENCE_URL,
        clauses: ['20.2.2.2', '21.2.2', '22.2.2.4', '22.4.2', '27.3.1.1', '27.3.1.2', '27.3.2.1'],
      },
      phiPolicy: '第 21 章一般強度折減因數；不自動採用表 27.3.2.1 提高值',
    };
  }

  function calculate(input) {
    const normalized = normalizeInput(input);
    const issues = validateInput(normalized);
    if (issues.length) throw new Error(issues.join(' '));

    const designCenters = centerDistances(normalized, false);
    const measuredCenters = centerDistances(normalized, true);
    const designBars = buildPhysicalBars(normalized, designCenters);
    const measuredBars = buildPhysicalBars(normalized, measuredCenters);
    const directions = DIRECTION_DEFINITIONS.map(direction => evaluateDirection(normalized, designBars, measuredBars, direction));
    const allAxialOk = directions.every(item => item.design.axialOk && item.measured.axialOk);
    const allMeasuredDemandOk = directions.every(item => item.measured.ok);
    const minimumRetention = Math.min(...directions.map(item => item.retentionRatio));
    const maximumMeasuredUtilization = Math.max(...directions.map(item => item.measured.utilization));
    const criticalRetentionDirection = directions.reduce((critical, item) => item.retentionRatio < critical.retentionRatio ? item : critical, directions[0]);
    const governingDemandDirection = directions.reduce((critical, item) => item.measured.utilization > critical.measured.utilization ? item : critical, directions[0]);
    const grossAreaCm2 = normalized.sectionWidthMm * normalized.sectionDepthMm / 100;
    const totalBars = designBars.length;
    const totalSteelAreaCm2 = totalBars * normalized.barAreaCm2;
    const steelRatio = totalSteelAreaCm2 / grossAreaCm2;
    const nominalAreaFromDiameterCm2 = Math.PI * Math.pow(normalized.mainBarDiameterMm / 10, 2) / 4;
    const areaDiameterRelativeDifference = Math.abs(normalized.barAreaCm2 - nominalAreaFromDiameterCm2) / nominalAreaFromDiameterCm2;
    const evidenceReady = [normalized.sectionDimensionBasis, normalized.materialBasis, normalized.measurementBasis, normalized.demandBasis].every(hasTraceableBasis);
    const retentionOk = minimumRetention + 1e-12 >= normalized.minimumRetentionRatio;
    const overallOk = allAxialOk && allMeasuredDemandOk && retentionOk && evidenceReady;
    const checks = [
      checkItem('evidence-basis', '尺寸、材料、鋼筋位置與需求來源', evidenceReady, evidenceReady ? '四類依據皆已填寫；仍須由專案工程師核對證據代表性。' : '至少一類依據不足，結果不得採用。'),
      checkItem('axial-envelope', 'Pu 位於設計與實測 P-M 封包', allAxialOk, allAxialOk ? `Pu=${normalized.puTf.toFixed(2)} tf 位於四方向兩組封包內。` : 'Pu 超出至少一組設計或實測斷面的 P-M 封包。'),
      checkItem('measured-demand', '實測位置斷面強度', allMeasuredDemandOk, `四方向最大利用率=${Number.isFinite(maximumMeasuredUtilization) ? maximumMeasuredUtilization.toFixed(3) : '∞'}。`),
      checkItem('retention-threshold', '專案指定容量保留比', retentionOk, `最小保留比=${minimumRetention.toFixed(3)}；門檻=${normalized.minimumRetentionRatio.toFixed(3)}。`),
      checkItem('manual-review', '現況代表性與未涵蓋行為', null, '即使數值通過，仍須人工審查量測代表性、材料證據、雙軸與二階效應、耐久性及施工狀況。'),
    ];

    return {
      resultSchemaVersion,
      provenance: provenance(),
      input: normalized,
      calculationPolicy: {
        strainCompatibility: true,
        phiComp: 0.65,
        phiTen: 0.90,
        pnMaxFactor: 0.80,
        enhancedExistingStructurePhiApplied: false,
        coverComplianceEvaluated: false,
        barAreaDiameterRelativeTolerance: BAR_AREA_DIAMETER_RELATIVE_TOLERANCE,
        compressionPositive: true,
      },
      measurement: {
        mode: normalized.measurementMode,
        enteredQuantity: normalized.measurementMode === 'clear-cover' ? '混凝土面至箍筋外緣之淨保護層' : '混凝土面至縱向主筋中心',
        conversionFormula: normalized.measurementMode === 'clear-cover' ? 'c_center = c_clear + d_tie + d_bar/2' : 'c_center = measured center distance',
        conversionOffsetMm: measuredCenters.conversionOffsetMm,
        designCentersMm: designCenters,
        measuredCentersMm: measuredCenters,
        deviationsMm: {
          top: measuredCenters.top - designCenters.top,
          bottom: measuredCenters.bottom - designCenters.bottom,
          left: measuredCenters.left - designCenters.left,
          right: measuredCenters.right - designCenters.right,
        },
      },
      barLayout: {
        totalBars,
        cornerBars: 4,
        topBottomBarsIncludingCorners: 2 * normalized.barsPerTopBottomFace,
        sideIntermediateBarsExcludingCorners: 2 * normalized.intermediateBarsPerSide,
        totalSteelAreaCm2,
        nominalAreaFromDiameterCm2,
        areaDiameterRelativeDifference,
        grossAreaCm2,
        steelRatio,
        cornerBarsCountedOnce: true,
      },
      layouts: {
        design: { bars: designBars },
        measured: { bars: measuredBars },
      },
      directions,
      minimumRetentionRatio: minimumRetention,
      maximumMeasuredUtilization,
      criticalRetentionDirection: criticalRetentionDirection.key,
      criticalRetentionDirectionLabel: criticalRetentionDirection.label,
      governingDemandDirection: governingDemandDirection.key,
      governingDemandDirectionLabel: governingDemandDirection.label,
      allAxialOk,
      allMeasuredDemandOk,
      retentionOk,
      evidenceReady,
      requiresManualReview: true,
      checks,
      overallOk,
      summary: {
        status: overallOk ? 'pass' : 'fail',
        headline: overallOk
          ? `單軸 P-M 截面強度比較通過；最小容量保留比 ${minimumRetention.toFixed(3)}。這不是保護層厚度合規或現況安全結論，仍須人工審查。`
          : `單軸 P-M 截面強度比較未通過或依據不足；最小容量保留比 ${minimumRetention.toFixed(3)}。不得作為保護層厚度合規或現況安全結論。`,
        primaryMetrics: [
          { key: 'minimum-retention', label: '最小容量保留比', value: minimumRetention, unit: '' },
          { key: 'maximum-utilization', label: '實測斷面最大利用率', value: maximumMeasuredUtilization, unit: '' },
          { key: 'total-bars', label: '縱向主筋總支數', value: totalBars, unit: '支' },
          { key: 'steel-ratio', label: '縱向鋼筋比', value: steelRatio, unit: '' },
        ],
      },
      references: provenance().reference,
      scope: {
        applicable: '矩形、繫筋、非預力 RC 短柱；比較相同斷面尺寸、材料與同一 Pu 下，四面縱向主筋中心位置偏差對單軸正負向 P-M 設計強度之影響。',
        excluded: '雙軸同時作用、二階效應、剪力與扭力、接頭與握裹、腐蝕或斷筋、混凝土剝落、材料劣化、耐火與耐久性、施工容許差判定、量測誤差統計及整體結構安全評估。',
      },
      complianceBoundary: 'capacity OK 不等於保護層厚度合規；耐久性、防火、施工容許差、握裹／裂縫與箍筋包覆須獨立判定。',
      manualReview: [
        '依 27.3.1.1 確認臨界斷面尺寸；輸入值須代表實際受力斷面，不得只採單一方便量測點。',
        '依 27.3.1.2 以掃描、開鑿或其他受控方法確認縱向主筋位置與尺寸；cover meter 顯示值不得未經判讀就當成主筋中心距。',
        '若由淨保護層換算，須核對量測至箍筋外緣，並明列箍筋直徑及主筋半徑；量測基準不明時不得採用。',
        '材料強度須由原設計資料、試驗或專案指定值建立代表性；本工具不因現場調查自動採用表 27.3.2.1 提高後的 φ。',
        'capacity OK 不等於保護層厚度合規；耐久性、防火、施工容許差、握裹／裂縫與箍筋包覆須獨立判定。',
        '四方向單軸結果不得取代雙軸 P-M-M、二階分析、剪力、接頭、握裹、耐久性或整體安全評估。',
      ],
    };
  }

  return Object.freeze({
    CORE_VERSION,
    version: CORE_VERSION,
    inputSchemaVersion,
    resultSchemaVersion,
    logicSignature,
    BAR_AREA_DIAMETER_RELATIVE_TOLERANCE,
    OFFICIAL_REFERENCE_URL,
    DIRECTION_DEFINITIONS,
    provenance,
    checkItem,
    normalizeInput,
    validateInput,
    centerDistances,
    buildPhysicalBars,
    validateBarLayoutGeometry,
    calculate,
  });
});
