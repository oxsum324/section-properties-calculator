(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PileGroupLateral = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA = 'rc-pile-group-lateral.v1';

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

  function positiveInteger(value, label) {
    const number = positive(value, label);
    if (!Number.isInteger(number)) throw new Error(`${label} 必須是正整數。`);
    return number;
  }

  function interpolate(start, end, ratio) {
    return start + (end - start) * ratio;
  }

  // FHWA-HIF-18-031 Table 7-1 (AASHTO 2014): vertical piles, spacing in load direction.
  function rowMultiplier(spacingRatio, rowNumber, rowCount) {
    const ratio = positive(spacingRatio, '樁距比 s/D');
    const row = positiveInteger(rowNumber, '列次');
    const count = positiveInteger(rowCount, '列數');
    if (row > count) throw new Error('列次不得大於列數。');
    if (count === 1) return 1;
    if (ratio < 3) return null;
    const t = Math.max(0, Math.min(1, (ratio - 3) / 2));
    if (row === 1) return interpolate(0.8, 1.0, t);
    if (row === 2) return interpolate(0.4, 0.85, t);
    return interpolate(0.3, 0.7, t);
  }

  function analyzeDirection(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const direction = String(input.direction || '').toUpperCase() || '—';
    const totalLoad = Math.abs(finite(input.totalLoadTf || 0, `${direction} 向水平力`));
    const rowCount = positiveInteger(input.rowCount, `${direction} 向列數`);
    const pilesPerRow = positiveInteger(input.pilesPerRow, `${direction} 向每列樁數`);
    const spacing = positive(input.spacingCm, `${direction} 向樁距`);
    const diameter = positive(input.pileDiameterCm, '樁徑');
    const spacingRatio = spacing / diameter;
    const multipliers = [];
    for (let row = 1; row <= rowCount; row++) {
      multipliers.push(rowMultiplier(spacingRatio, row, rowCount));
    }
    const supported = multipliers.every(Number.isFinite);
    if (!supported) {
      return {
        direction,
        totalLoad,
        rowCount,
        pilesPerRow,
        pileCount: rowCount * pilesPerRow,
        spacing,
        diameter,
        spacingRatio,
        supported: false,
        required: totalLoad > 0,
        reason: '樁距小於 3D，超出 FHWA 表 7-1 的 3D～5D 插值範圍。',
        rows: [],
        averageMultiplier: null,
        maxPerPile: null,
        equilibriumError: null
      };
    }
    const multiplierSum = multipliers.reduce((sum, value) => sum + value, 0);
    const rows = multipliers.map((multiplier, index) => {
      const rowLoad = totalLoad > 0 ? totalLoad * multiplier / multiplierSum : 0;
      return {
        row: index + 1,
        multiplier,
        rowLoad,
        perPileLoad: rowLoad / pilesPerRow
      };
    });
    const distributed = rows.reduce((sum, row) => sum + row.rowLoad, 0);
    return {
      direction,
      totalLoad,
      rowCount,
      pilesPerRow,
      pileCount: rowCount * pilesPerRow,
      spacing,
      diameter,
      spacingRatio,
      supported: true,
      required: totalLoad > 0,
      reason: '',
      rows,
      averageMultiplier: multiplierSum / rowCount,
      maxPerPile: rows.length ? Math.max(...rows.map(row => row.perPileLoad)) : 0,
      equilibriumError: distributed - totalLoad
    };
  }

  function evaluate(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const pileNL = positiveInteger(input.pileNL, 'L 向樁數');
    const pileNB = positiveInteger(input.pileNB, 'B 向樁數');
    const pileD = positive(input.pileDiameterCm, '樁徑');
    const x = analyzeDirection({
      direction: 'X',
      totalLoadTf: input.horizontalX,
      rowCount: pileNL,
      pilesPerRow: pileNB,
      spacingCm: input.spacingL,
      pileDiameterCm: pileD
    });
    const y = analyzeDirection({
      direction: 'Y',
      totalLoadTf: input.horizontalY,
      rowCount: pileNB,
      pilesPerRow: pileNL,
      spacingCm: input.spacingB,
      pileDiameterCm: pileD
    });
    const required = x.required || y.required;
    return {
      schema: SCHEMA,
      source: 'FHWA-HIF-18-031 Table 7-1 (AASHTO 2014)',
      assumptions: {
        verticalPiles: true,
        equalLoadWithinRow: true,
        pMultiplierOnly: true,
        displacementAndMemberForcesIncluded: false
      },
      required,
      supported: x.supported && y.supported,
      responseAnalysisComplete: !required,
      x,
      y
    };
  }

  return { schema: SCHEMA, rowMultiplier, analyzeDirection, evaluate };
});
