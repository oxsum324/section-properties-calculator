(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FloorSlabWestergaardCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CORE_NAME = 'FloorSlabWestergaardCore';
  const CORE_VERSION = '0.1.0';
  const INPUT_SCHEMA_VERSION = 'floor-slab-westergaard.input.v0.1';
  const RESULT_SCHEMA_VERSION = 'floor-slab-westergaard.result.v0.1';
  const LOGIC_SIGNATURE = 'floor-slab-westergaard-core:v0.1:generalized-interior-edge-corner-linear-superposition';
  const K_MNM3_TO_NMM3 = 0.001;
  const KN_TO_N = 1000;
  const EQUIVALENT_RADIUS_LIMIT = 1.724;
  const POSITION_KEYS = ['interior', 'edge', 'corner'];
  const POSITION_LABELS = { interior: '內部', edge: '邊緣', corner: '角隅' };

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

  function textValue(value) {
    return String(value == null ? '' : value).trim();
  }

  function clampInfluence(value) {
    return numberValue(value);
  }

  function normalizeLoadGroup(group, index) {
    const source = group || {};
    return {
      id: textValue(source.id) || `L${index + 1}`,
      name: textValue(source.name) || `載重群 ${index + 1}`,
      loadKn: numberValue(source.loadKn),
      count: numberValue(source.count),
      dynamicFactor: numberValue(source.dynamicFactor),
      contactRadiusMm: numberValue(source.contactRadiusMm),
      influenceInterior: clampInfluence(source.influenceInterior),
      influenceEdge: clampInfluence(source.influenceEdge),
      influenceCorner: clampInfluence(source.influenceCorner),
      influenceBasis: textValue(source.influenceBasis)
    };
  }

  function normalizeInput(input) {
    const source = input || {};
    const groups = Array.isArray(source.loadGroups) ? source.loadGroups : [];
    return {
      slabThicknessMm: numberValue(source.slabThicknessMm),
      elasticModulusMpa: numberValue(source.elasticModulusMpa),
      poissonRatio: numberValue(source.poissonRatio),
      subgradeModulusMNm3: numberValue(source.subgradeModulusMNm3),
      allowableStressMpa: numberValue(source.allowableStressMpa),
      allowableStressBasis: textValue(source.allowableStressBasis),
      loadGroups: groups.map(normalizeLoadGroup)
    };
  }

  function isPlaceholderBasis(value) {
    const text = textValue(value);
    return !text || /^(?:尚未指定|未指定|待確認|請填)/.test(text) || /(?:示例|示範)/.test(text);
  }

  function validateInput(input) {
    const i = normalizeInput(input);
    const errors = [];
    if (i.slabThicknessMm <= 0) errors.push('版厚 h 必須大於 0。');
    if (i.elasticModulusMpa <= 0) errors.push('混凝土彈性模數 E 必須大於 0。');
    if (!(i.poissonRatio > 0 && i.poissonRatio < 0.5)) errors.push('泊松比 ν 必須介於 0 與 0.5 之間。');
    if (i.subgradeModulusMNm3 <= 0) errors.push('版下反力模數 k 必須大於 0。');
    if (i.allowableStressMpa <= 0) errors.push('容許彎拉應力必須大於 0。');
    if (!i.loadGroups.length) errors.push('至少需要一組輪壓或機具腳位載重。');
    i.loadGroups.forEach(function (group, index) {
      const label = `第 ${index + 1} 組載重`;
      if (group.loadKn <= 0) errors.push(`${label}之單輪／單腳載重必須大於 0。`);
      if (group.count < 1 || Math.abs(group.count - Math.round(group.count)) > 1e-9) errors.push(`${label}之數量必須為正整數。`);
      if (group.dynamicFactor <= 0) errors.push(`${label}之動力／衝擊係數必須大於 0。`);
      if (group.contactRadiusMm <= 0) errors.push(`${label}之接觸半徑 a 必須大於 0。`);
      POSITION_KEYS.forEach(function (key) {
        const value = group[`influence${key[0].toUpperCase()}${key.slice(1)}`];
        if (value < 0 || value > 1) errors.push(`${label}之${POSITION_LABELS[key]}影響係數必須介於 0 與 1。`);
      });
    });
    return errors;
  }

  function radiusOfRelativeStiffness(i) {
    const h = i.slabThicknessMm;
    const k = i.subgradeModulusMNm3 * K_MNM3_TO_NMM3;
    return Math.pow(i.elasticModulusMpa * Math.pow(h, 3) / (12 * (1 - Math.pow(i.poissonRatio, 2)) * k), 0.25);
  }

  function equivalentRadius(a, h) {
    return a >= EQUIVALENT_RADIUS_LIMIT * h
      ? a
      : Math.sqrt(1.6 * a * a + h * h) - 0.675 * h;
  }

  function groupResponse(i, group, l) {
    const h = i.slabThicknessMm;
    const e = i.elasticModulusMpa;
    const nu = i.poissonRatio;
    const k = i.subgradeModulusMNm3 * K_MNM3_TO_NMM3;
    const a = group.contactRadiusMm;
    const b = equivalentRadius(a, h);
    const effectiveLoadKn = group.loadKn * Math.round(group.count) * group.dynamicFactor;
    const p = effectiveLoadKn * KN_TO_N;
    const logArgument = e * Math.pow(h, 3) / (k * Math.pow(b, 4));
    const logTerm = Math.log10(logArgument);
    const cornerRatio = a * Math.SQRT2 / l;
    const cornerBracket = 1 - Math.pow(cornerRatio, 0.6);
    const baseStress = {
      interior: 0.275 * (1 + nu) * p / Math.pow(h, 2) * logTerm,
      edge: 0.529 * (1 + 0.54 * nu) * p / Math.pow(h, 2) * (logTerm - 0.71),
      corner: 3 * p / Math.pow(h, 2) * cornerBracket
    };
    const influences = {
      interior: group.influenceInterior,
      edge: group.influenceEdge,
      corner: group.influenceCorner
    };
    const contributions = {};
    POSITION_KEYS.forEach(function (key) {
      contributions[key] = baseStress[key] * influences[key];
    });
    const activeFormulaOk = POSITION_KEYS.every(function (key) {
      return influences[key] <= 0 || (Number.isFinite(baseStress[key]) && baseStress[key] >= 0);
    });
    const usesReducedInfluence = POSITION_KEYS.some(function (key) { return influences[key] < 1; });
    const influenceBasisReady = !usesReducedInfluence || Boolean(group.influenceBasis);
    return Object.assign({}, group, {
      count: Math.round(group.count),
      effectiveLoadKn,
      equivalentRadiusMm: b,
      equivalentRadiusBranch: a >= EQUIVALENT_RADIUS_LIMIT * h ? 'direct-radius' : 'equivalent-radius',
      logArgument,
      logTerm,
      cornerRatio,
      cornerBracket,
      baseStressMpa: baseStress,
      influenceFactors: influences,
      stressContributionMpa: contributions,
      activeFormulaOk,
      usesReducedInfluence,
      influenceBasisReady
    });
  }

  function calculate(input) {
    const i = normalizeInput(input);
    const l = radiusOfRelativeStiffness(i);
    const groups = i.loadGroups.map(function (group) { return groupResponse(i, group, l); });
    const totalStress = { interior: 0, edge: 0, corner: 0 };
    groups.forEach(function (group) {
      POSITION_KEYS.forEach(function (key) { totalStress[key] += group.stressContributionMpa[key]; });
    });
    const ratios = {};
    POSITION_KEYS.forEach(function (key) { ratios[key] = totalStress[key] / i.allowableStressMpa; });
    const governingPosition = POSITION_KEYS.reduce(function (best, key) {
      return ratios[key] > ratios[best] ? key : best;
    }, POSITION_KEYS[0]);
    const formulaApplicable = groups.every(function (group) { return group.activeFormulaOk; });
    const influenceBasisReady = groups.every(function (group) { return group.influenceBasisReady; });
    const allowableBasisReady = !isPlaceholderBasis(i.allowableStressBasis);
    const stressChecksOk = POSITION_KEYS.every(function (key) { return ratios[key] <= 1; });
    const overallOk = formulaApplicable && influenceBasisReady && allowableBasisReady && stressChecksOk;
    const totalEffectiveLoadKn = groups.reduce(function (sum, group) { return sum + group.effectiveLoadKn; }, 0);
    const governing = {
      key: `${governingPosition}-stress`,
      label: `${POSITION_LABELS[governingPosition]}載重應力`,
      utilization: ratios[governingPosition],
      value: totalStress[governingPosition],
      limit: i.allowableStressMpa,
      unit: 'MPa'
    };
    const checks = [
      checkItem('allowable-stress-basis', '容許彎拉應力依據', allowableBasisReady, allowableBasisReady ? i.allowableStressBasis : '尚未提供可追溯的規範判定、專案指定或材料試驗依據。', null, null, ''),
      checkItem('formula-applicability', 'Westergaard 閉式解適用性', formulaApplicable, formulaApplicable ? '各啟用位置之對數項與角隅括號均形成非負應力。' : '至少一組啟用位置超出本閉式解可用範圍，須改採板殼／有限元素模型。', null, null, ''),
      checkItem('influence-basis', '多輪／多腳影響係數依據', influenceBasisReady, influenceBasisReady ? '影響係數均為 1.0，或每組折減已有專案依據。' : '影響係數小於 1.0，但未填寫幾何、圖表或分析依據。', null, null, ''),
      checkItem('interior-stress', '內部載重彎拉應力', ratios.interior <= 1, `σi = ${totalStress.interior}, σallow = ${i.allowableStressMpa}`, totalStress.interior, i.allowableStressMpa, 'MPa'),
      checkItem('edge-stress', '邊緣載重彎拉應力', ratios.edge <= 1, `σe = ${totalStress.edge}, σallow = ${i.allowableStressMpa}`, totalStress.edge, i.allowableStressMpa, 'MPa'),
      checkItem('corner-stress', '角隅載重彎拉應力', ratios.corner <= 1, `σc = ${totalStress.corner}, σallow = ${i.allowableStressMpa}`, totalStress.corner, i.allowableStressMpa, 'MPa')
    ];
    const summary = {
      status: overallOk ? 'pass' : 'fail',
      headline: overallOk ? '地坪 Westergaard 彎拉應力檢核通過' : '地坪 Westergaard 檢核尚未通過或依據不完整',
      governing,
      primaryMetrics: [
        { key: 'relativeStiffnessRadius', label: '相對勁度半徑 ℓ', value: l / 1000, unit: 'm' },
        { key: 'interiorStress', label: '內部應力 σi', value: totalStress.interior, unit: 'MPa' },
        { key: 'edgeStress', label: '邊緣應力 σe', value: totalStress.edge, unit: 'MPa' },
        { key: 'cornerStress', label: '角隅應力 σc', value: totalStress.corner, unit: 'MPa' },
        { key: 'governingRatio', label: '控制應力比', value: ratios[governingPosition], unit: 'ratio' }
      ]
    };
    return {
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
      input: i,
      slabThicknessMm: i.slabThicknessMm,
      elasticModulusMpa: i.elasticModulusMpa,
      poissonRatio: i.poissonRatio,
      subgradeModulusMNm3: i.subgradeModulusMNm3,
      subgradeModulusNmm3: i.subgradeModulusMNm3 * K_MNM3_TO_NMM3,
      allowableStressMpa: i.allowableStressMpa,
      allowableStressBasis: i.allowableStressBasis,
      allowableBasisReady,
      relativeStiffnessRadiusMm: l,
      relativeStiffnessRadiusM: l / 1000,
      equivalentRadiusLimit: EQUIVALENT_RADIUS_LIMIT,
      loadGroups: groups,
      totalEffectiveLoadKn,
      totalStressMpa: totalStress,
      stressRatios: ratios,
      governingPosition,
      governingPositionLabel: POSITION_LABELS[governingPosition],
      governingStressMpa: totalStress[governingPosition],
      governingRatio: ratios[governingPosition],
      formulaApplicable,
      influenceBasisReady,
      stressChecksOk,
      governingCheck: governing,
      overallOk,
      summary,
      checks,
      provenance: provenance()
    };
  }

  return {
    version: CORE_VERSION,
    inputSchemaVersion: INPUT_SCHEMA_VERSION,
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    logicSignature: LOGIC_SIGNATURE,
    equivalentRadiusLimit: EQUIVALENT_RADIUS_LIMIT,
    provenance,
    normalizeInput,
    validateInput,
    radiusOfRelativeStiffness,
    equivalentRadius,
    calculate
  };
});
