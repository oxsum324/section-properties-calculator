(function (root, factory) {
  const spec = typeof module === 'object' && module.exports ? require('./concrete-strength-ndt-spec.js') : root.ConcreteStrengthNdtSpec;
  const api = factory(spec);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ConcreteStrengthNdtCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function (Spec) {
  'use strict';
  if (!Spec) throw new Error('ConcreteStrengthNdtSpec is required');
  const F = Spec.formulas;
  const CORE_NAME = 'ConcreteStrengthNdtCore';
  const CORE_VERSION = '0.1.0';
  const INPUT_SCHEMA_VERSION = 'concrete-strength-ndt.input.v0.1';
  const RESULT_SCHEMA_VERSION = 'concrete-strength-ndt.result.v0.1';
  const LOGIC_SIGNATURE = 'concrete-strength-ndt-core:v0.1:zone-aggregation-non-destructive-methods';
  const version = CORE_VERSION;
  const methods = ['rebound', 'ultrasonic', 'core'];
  const labels = { rebound: '回彈法', ultrasonic: '超音波法', core: '鑽心法' };
  const allowed = {
    moistureState: ['dry', 'wet', 'unknown'],
    samplingDirection: ['parallel', 'perpendicular', 'unknown'],
    drillingDamage: ['low', 'typical', 'high', 'unknown']
  };

  function provenance() {
    return {
      core: CORE_NAME,
      version: CORE_VERSION,
      inputSchemaVersion: INPUT_SCHEMA_VERSION,
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
      logicSignature: LOGIC_SIGNATURE
    };
  }

  function normalizeInput(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    return {
      project: source.project,
      designStrengthMpa: source.designStrengthMpa,
      designStrengthSource: source.designStrengthSource,
      rebound: Array.isArray(source.rebound) ? source.rebound : source.rebound,
      ultrasonic: Array.isArray(source.ultrasonic) ? source.ultrasonic : source.ultrasonic,
      core: Array.isArray(source.core) ? source.core : source.core
    };
  }

  function validateInput(input, options = {}) {
    const result = calculate(input, options);
    return result.ok ? [] : result.errors.slice();
  }

  function checkItem(key, label, status, detail, value = null, unit = null) {
    const applicable = status !== 'not_applicable';
    return {
      key, label, status,
      passed: applicable ? status === 'pass' : null,
      detail: String(detail),
      value,
      limit: null,
      unit
    };
  }

  function calculate(input, options = {}) {
    const errors = [], warnings = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) return failure(['輸入資料必須是物件。']);
    const spec = Spec;
    if (options.model && !Spec.isConfirmedModel(options.model)) return failure(['確認規格模型必須由固定檔案的封閉 schema 驗證建立。']);
    const model = options.model || Spec.defaultModel();
    if (!model || !model.rebound || !model.ultrasonic || !model.core || !Array.isArray(model.characteristicBands)) return failure(['計算模型不完整，已停止計算。']);
    input = normalizeInput(input);
    const project = normalizeProject(input.project, errors);
    const designStrengthMpa = parseNumber(input.designStrengthMpa, '設計強度', errors, { min: 0, exclusiveMin: 0 }, spec);
    const designStrengthSource = cleanText(input.designStrengthSource);
    const normalized = {};
    methods.forEach(method => {
      if (!Array.isArray(input[method])) {
        errors.push(`${labels[method]}資料必須是陣列。`);
        normalized[method] = [];
        return;
      }
      if (input[method].length > spec.rules.maximumRows) errors.push(`${labels[method]}資料筆數超過上限。`);
      const ids = new Set();
      normalized[method] = input[method].map((row, index) => {
        const item = normalizeRow(method, row, index, errors, model, spec);
        if (ids.has(item.id)) errors.push(`${labels[method]}編號重複：${item.id}`);
        ids.add(item.id);
        return item;
      });
    });
    if (methods.every(method => normalized[method].length === 0)) errors.push('至少須輸入一種檢測方法的資料。');
    if (errors.length) return failure(errors);
    if (options.model) {
      const applicability = model.applicability;
      const activeMethods = methods.filter(method => normalized[method].length > 0);
      if (!applicability || project.number !== applicability.projectNumber || project.instrumentModel !== applicability.instrumentModel || project.concreteDescription !== applicability.concreteDescription) {
        return failure(['確認規格不適用於目前案件編號、儀器型號或混凝土資料識別。']);
      }
      if (applicability.applicableMethod !== 'all-methods' && (activeMethods.length !== 1 || activeMethods[0] !== applicability.applicableMethod)) {
        return failure(['確認規格不適用於目前輸入的檢測方法。']);
      }
    }

    const rows = {
      rebound: normalized.rebound.map(row => calculateReboundZone(row, model, errors, spec)),
      ultrasonic: normalized.ultrasonic.map(row => calculateUltrasonicZone(row, model, errors, spec)),
      core: normalized.core.map(row => calculateCoreZone(row, model, errors, spec))
    };
    if (errors.length) return failure(errors);

    const zoneResults = Object.fromEntries(methods.map(method => [method, groupZoneResults(rows[method], spec)]));
    methods.forEach(method => {
      if (zoneResults[method].length > 0 && zoneResults[method].length < spec.rules.minimumMethodZones) {
        warnings.push(`${labels[method]}只有${zoneResults[method].length}個測區；低於本工具示例的3區提示門檻。`);
      }
    });
    const stats = Object.fromEntries(methods.map(method => [
      method,
      summarize(zoneResults[method].map(row => row.strengthMpa), designStrengthMpa, model.characteristicBands, spec)
    ]));
    const pooledValues = methods.flatMap(method => zoneResults[method].map(row => row.strengthMpa));
    const pooled = summarize(pooledValues, designStrengthMpa, model.characteristicBands, spec);
    pooled.label = '數值彙整，非獨立試體母體';
    pooled.nMeaning = 'n為三種方法的測區結果筆數合計；同一測區可能跨方法重複，不能解讀為獨立試體數或母體樣本數。';
    pooled.populationNote = '此為假設模型描述指標；方法結果可能來自相同測區或相關測區，不代表獨立試體母體推論，也不構成工程核可。';
    const crossCheck = compareByMatchingZone(zoneResults, spec);
    const assumptions = assumptionInventory(model, spec);
    methods.forEach(method => rows[method].forEach(row => {
      if (row.assumed) assumptions.push({ label: `${labels[method]} ${row.id} 所用模型（示例或覆寫）`, assumed: true, confirmed: false, source: row.source || '使用者覆寫，尚未外部核驗' });
    }));
    const result = {
      ok: true,
      overallOk: true,
      version,
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
      provenance: provenance(),
      input: { project, designStrengthMpa, designStrengthSource, rebound: normalized.rebound, ultrasonic: normalized.ultrasonic, core: normalized.core },
      project,
      designStrengthMpa,
      designStrengthSource,
      designStrengthSourceStatus: designStrengthSource ? 'user-supplied source statement; not independently verified' : 'source not provided',
      appliedModel: appliedModel(model, spec),
      formulaSources: Object.entries(spec.definitions).map(([key, item]) => ({ key, assumed: item.assumed === true, source: item.source, url: item.url || null })),
      units: { siteEquivalentStrength: 'MPa', characteristicStrength: 'MPa', rebound: 'dimensionless', velocity: 'km/s', coreLoad: 'kN', coreGeometry: 'mm' },
      state: 'internal-review-only',
      formalAttachmentEligible: false,
      reportDisposition: '僅供內部審閱；數值有效或已載入確認規格，不會取得正式附件資格。',
      methods: Object.fromEntries(methods.map(method => [method, {
        label: labels[method], rows: rows[method], zoneResults: zoneResults[method], stats: stats[method],
        source: methodSource(method, spec), assumed: model[method].assumed !== false || rows[method].some(row => row.assumed)
      }])),
      pooled,
      crossCheck,
      assumptions,
      statusGroups: {
        confirmed: assumptions.filter(item => item.assumed === false).map(item => item.label),
        reasonableInference: [],
        pending: assumptions.filter(item => item.assumed !== false).map(item => item.label)
      },
      warnings,
      scope: '本工具整理輸入資料與假設模型數值，不判定結構安全、規範符合性、材料驗收或可否採用。'
    };
    result.summary = {
      status: result.overallOk ? 'pass' : 'fail',
      headline: '輸入與數值計算有效；結果限內部審閱，不代表工程驗收或核可。',
      primaryMetrics: [
        { key: 'rebound-mean', label: '回彈法測區平均', value: stats.rebound.meanMpa, unit: 'MPa' },
        { key: 'ultrasonic-mean', label: '超音波法測區平均', value: stats.ultrasonic.meanMpa, unit: 'MPa' },
        { key: 'core-mean', label: '鑽心法測區平均', value: stats.core.meanMpa, unit: 'MPa' },
        { key: 'pooled-mean', label: '三法非獨立數值彙整平均', value: pooled.meanMpa, unit: 'MPa' }
      ]
    };
    result.checks = [
      checkItem('input-and-calculation-valid', '輸入與數值計算', 'pass', '所有輸入通過格式與有限數值檢查。'),
      checkItem('engineering-acceptance', '工程驗收判定', 'not_applicable', '本工具不判定工程驗收或規範符合性。'),
      checkItem('independent-population-inference', '獨立試體母體推論', 'not_applicable', '同測區先平均，三方法合併值亦非獨立樣本母體。'),
      checkItem('formal-attachment-eligibility', '正式附件資格', 'not_applicable', '本 assist 工具永不授予正式附件資格。')
    ];
    if (!finiteTree(result)) return failure(['中間計算結果含非有限數值，已停止輸出。'], warnings);
    return result;
  }

  function normalizeRow(method, row, index, errors, model, spec) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(`${labels[method]}第${index + 1}列格式錯誤。`);
      return { id: `${method}-${index}`, zone: '' };
    }
    const id = cleanText(row.id), zone = cleanText(row.zone);
    if (!id || !zone) errors.push(`${labels[method]}第${index + 1}列缺少編號或測區。`);
    const item = { id, zone };
    if (method === 'rebound') {
      const raw = row.readings;
      if (!Array.isArray(raw) || raw.length < model.rebound.minimumRawReadings) {
        errors.push(`${id}回彈原始讀值少於${model.rebound.minimumRawReadings}擊。`);
      }
      item.readings = (Array.isArray(raw) ? raw : []).map((value, i) => parseNumber(value, `${id}第${i + 1}擊`, errors, { min: 0 }, spec));
      item.angleDeg = parseNumber(row.angleDeg, `${id}角度`, errors, { min: 0 }, spec);
      item.angleCorrectionOverrideDeltaR = optionalNumber(row.angleCorrectionOverrideDeltaR, `${id}角度修正覆寫 ΔR`, errors, {}, spec);
      item.curveType = row.curveType || model.rebound.curve.type;
      item.curveCoefficients = row.curveCoefficients || model.rebound.curve.coefficients;
      if (!['linear', 'quadratic'].includes(item.curveType)) errors.push(`${id}回彈曲線型式不支援。`);
      validateCoefficients(item.curveType, item.curveCoefficients, ['linear', 'quadratic'], id, errors, spec);
    } else if (method === 'ultrasonic') {
      const hasDistanceTime = (row.distanceMm !== undefined && row.distanceMm !== null) || (row.timeMicroseconds !== undefined && row.timeMicroseconds !== null);
      const hasVelocity = row.velocityKmS !== undefined && row.velocityKmS !== null;
      if (hasDistanceTime === hasVelocity) errors.push(`${id}須輸入傳播距離與時間，或直接輸入速度，且只能擇一。`);
      item.distanceMm = hasDistanceTime ? parseNumber(row.distanceMm, `${id}傳播距離 mm`, errors, { min: 0, exclusiveMin: 0 }, spec) : null;
      item.timeMicroseconds = hasDistanceTime ? parseNumber(row.timeMicroseconds, `${id}傳播時間 μs`, errors, { min: 0, exclusiveMin: 0 }, spec) : null;
      item.velocityKmS = hasVelocity ? parseNumber(row.velocityKmS, `${id}速度 km/s`, errors, { min: 0, exclusiveMin: 0 }, spec) : null;
      item.curveType = row.curveType || model.ultrasonic.curve.type;
      item.curveCoefficients = row.curveCoefficients || model.ultrasonic.curve.coefficients;
      if (!['exponential', 'power'].includes(item.curveType)) errors.push(`${id}超音波曲線型式不支援。`);
      validateCoefficients(item.curveType, item.curveCoefficients, ['exponential', 'power'], id, errors, spec);
    } else {
      item.diameterMm = parseNumber(row.diameterMm, `${id}直徑 mm`, errors, { min: 0, exclusiveMin: 0 }, spec);
      item.lengthMm = parseNumber(row.lengthMm, `${id}長度 mm`, errors, { min: 0, exclusiveMin: 0 }, spec);
      item.failureLoadKn = parseNumber(row.failureLoadKn, `${id}破壞荷重 kN`, errors, { min: 0, exclusiveMin: 0 }, spec);
      item.moistureState = enumValue(row.moistureState, allowed.moistureState, `${id}含水狀態`, errors);
      item.samplingDirection = enumValue(row.samplingDirection, allowed.samplingDirection, `${id}取樣方向`, errors);
      item.drillingDamage = enumValue(row.drillingDamage, allowed.drillingDamage, `${id}鑽取損傷`, errors);
      item.factorOverrides = {};
      ['lengthDiameter', 'diameter', 'moisture', 'drillingDamage'].forEach(key => {
        item.factorOverrides[key] = optionalNumber(row.factorOverrides && row.factorOverrides[key], `${id}${key}修正係數覆寫`, errors, { min: 0, exclusiveMin: 0 }, spec);
      });
    }
    return item;
  }

  function calculateReboundZone(row, model, errors, spec) {
    const trim = F.trimRebound(row.readings, model.rebound.trimDifference);
    if (trim.retained.length < model.rebound.minRetainedReadings) {
      errors.push(`${row.id}剔除後僅剩${trim.retained.length}擊；至少須有${model.rebound.minRetainedReadings}筆有效讀值。`);
    }
    const correction = F.reboundAngleCorrection(row.angleDeg, row.angleCorrectionOverrideDeltaR, model.rebound.angleTableDeltaR);
    if (correction === null) errors.push(`${row.id}${row.angleDeg}度沒有可用角度修正來源，請提供逐筆覆寫或已確認規格。`);
    const curve = { type: row.curveType, coefficients: row.curveCoefficients };
    const adjustedMeanRebound = F.adjustedMeanRebound(trim.mean, correction === null ? 0 : correction);
    const strength = F.reboundAdjustedStrength(trim.mean, correction === null ? 0 : correction, curve);
    if (!validOutput(strength, spec) || strength < 0) errors.push(`${row.id}回彈換算結果不是有效非負數值。`);
    return {
      id: row.id, zone: row.zone, rawReadings: row.readings, originalMean: trim.rawMean,
      removedReadings: trim.removed, removedCount: trim.removed.length, retainedReadings: trim.retained,
      retainedCount: trim.retained.length, retainedMean: trim.mean, angleDeg: row.angleDeg,
      curveType: row.curveType, curveCoefficients: row.curveCoefficients,
      angleCorrectionDeltaR: correction, adjustedMeanRebound, strengthMpa: strength,
      assumed: model.rebound.assumed !== false || row.angleCorrectionOverrideDeltaR !== null || !sameCurve(curve, model.rebound.curve),
      source: row.angleCorrectionOverrideDeltaR !== null ? 'user row override; not externally verified' : (!sameCurve(curve, model.rebound.curve) ? 'user curve override; not externally verified' : model.rebound.source || 'illustrative assumed model')
    };
  }

  function calculateUltrasonicZone(row, model, errors, spec) {
    const velocity = row.velocityKmS === null ? F.velocityFromDistanceTime(row.distanceMm, row.timeMicroseconds) : row.velocityKmS;
    const strength = F.ultrasonicStrength(velocity, { type: row.curveType, coefficients: row.curveCoefficients });
    if (!validOutput(velocity, spec) || velocity <= 0) errors.push(`${row.id}超音波速度不是有效正值。`);
    if (!validOutput(strength, spec) || strength < 0) errors.push(`${row.id}超音波換算結果不是有效非負數值。`);
    const grade = model.ultrasonic.gradeRanges.find(item => velocity >= item.minKmS);
    return {
      id: row.id, zone: row.zone, distanceMm: row.distanceMm, timeMicroseconds: row.timeMicroseconds,
      velocityKmS: velocity, strengthMpa: strength, qualityGrade: grade ? grade.label : '未分級',
      curveType: row.curveType, curveCoefficients: row.curveCoefficients,
      assumed: model.ultrasonic.assumed !== false || !sameCurve({ type: row.curveType, coefficients: row.curveCoefficients }, model.ultrasonic.curve),
      source: !sameCurve({ type: row.curveType, coefficients: row.curveCoefficients }, model.ultrasonic.curve) ? 'user curve override; not externally verified' : model.ultrasonic.source || 'illustrative assumed model'
    };
  }

  function calculateCoreZone(row, model, errors, spec) {
    const ratio = F.lengthDiameterRatio(row.lengthMm, row.diameterMm);
    if (!Number.isFinite(ratio) || ratio < model.core.minimumLengthDiameter) errors.push(`${row.id} L/D小於1或計算無效，已拒絕。`);
    const area = F.coreArea(row.diameterMm);
    const rawStrength = F.coreRawStrength(row.failureLoadKn, row.diameterMm);
    const table = model.core;
    const tableFactors = {
      lengthDiameter: F.lengthDiameterFactor(ratio, table.lengthDiameterFactors),
      diameter: F.diameterFactor(row.diameterMm, table.diameterFactors),
      moisture: table.moistureFactors[row.moistureState],
      drillingDamage: table.drillingDamageFactors[row.drillingDamage]
    };
    const factors = {};
    Object.keys(tableFactors).forEach(key => {
      factors[key] = row.factorOverrides[key] === null ? tableFactors[key] : row.factorOverrides[key];
      if (!Number.isFinite(factors[key]) || factors[key] <= 0) errors.push(`${row.id}${key}修正係數缺值或無效；請提供覆寫或已確認規格。`);
    });
    const corrected = F.correctedCoreStrength(rawStrength, factors);
    if (![area, rawStrength, corrected].every(value => validOutput(value, spec)) || rawStrength <= 0 || corrected <= 0) {
      errors.push(`${row.id}鑽心強度計算中間值無效或溢出。`);
    }
    return {
      id: row.id, zone: row.zone, diameterMm: row.diameterMm, lengthMm: row.lengthMm,
      lengthDiameterRatio: ratio, failureLoadKn: row.failureLoadKn, areaMm2: area,
      rawStrengthMpa: rawStrength, moistureState: row.moistureState,
      samplingDirection: row.samplingDirection, drillingDamage: row.drillingDamage,
      factors, correctedStrengthMpa: corrected, strengthMpa: corrected,
      assumed: model.core.assumed !== false || Object.values(row.factorOverrides).some(value => value !== null),
      source: Object.values(row.factorOverrides).some(value => value !== null) ? 'user factor override; not externally verified' : model.core.source || 'illustrative assumed model'
    };
  }

  function groupZoneResults(rows, spec) {
    const groups = F.groupMeanByZone(rows);
    return groups.map(group => ({
      zone: group.zone, strengthMpa: group.mean, measurementCount: group.measurementCount,
      note: group.measurementCount > 1 ? '同測區重複測量先取算術平均；統計 n 計一個測區。' : '該方法測區結果。'
    }));
  }

  function summarize(values, designStrengthMpa, bands, spec) {
    const characteristic = F.characteristic(values, bands);
    const design = F.meanToDesignRatio(values, designStrengthMpa);
    return {
      n: values.length,
      nMeaning: 'n為不同測區的結果筆數；同測區重複測量已先平均。',
      meanMpa: F.mean(values),
      sampleSdMpa: F.sampleSd(values),
      coefficientOfVariation: F.cov(values),
      characteristicStrengthMpa: characteristic.value,
      characteristicStatus: characteristic.status,
      characteristicK: characteristic.k,
      minimumSingleMpa: F.lowest(values),
      designStrengthMpa,
      meanToDesignRatio: design.ratio,
      meanAtLeastDesign: design.meanAtLeastDesign,
      descriptiveOnly: true,
      zeroSdNote: characteristic.sampleSd === 0 ? '樣本標準差為零時，依公式 mean − k×0 = mean；零離散不表示母體零變異，也不代表工程核可。' : null
    };
  }

  function compareByMatchingZone(zoneResults, spec) {
    const zones = new Set(methods.flatMap(method => zoneResults[method].map(row => row.zone)));
    const byZone = Object.fromEntries(methods.map(method => [method, new Map(zoneResults[method].map(row => [row.zone, row.strengthMpa]))]));
    return [...zones].sort().map(zone => {
      const values = Object.fromEntries(methods.map(method => [method, byZone[method].get(zone) ?? null]));
      const core = values.core;
      return {
        zone, reboundMpa: values.rebound, ultrasonicMpa: values.ultrasonic, coreMpa: core,
        reboundDifferencePercent: values.rebound !== null && core > 0 ? F.differencePercent(values.rebound, core) : null,
        ultrasonicDifferencePercent: values.ultrasonic !== null && core > 0 ? F.differencePercent(values.ultrasonic, core) : null,
        reboundToCoreRatio: values.rebound !== null && core > 0 ? F.coreReferenceRatio(values.rebound, core) : null,
        ultrasonicToCoreRatio: values.ultrasonic !== null && core > 0 ? F.coreReferenceRatio(values.ultrasonic, core) : null,
        note: core !== null && (values.rebound !== null || values.ultrasonic !== null)
          ? '僅同一測區配對數值比較；不宣稱通用校正比例。'
          : '測區未配對，不計算跨方法差異或比率。'
      };
    });
  }

  function assumptionInventory(model, spec) {
    if (Array.isArray(model.assumptions)) return model.assumptions.map(item => ({
      label: item.label || item.id || '已確認規格項目', assumed: item.assumed !== false,
      confirmed: item.confirmed === true, source: item.source || '來源未載明'
    }));
    return Object.entries(spec.definitions).filter(([, value]) => value.assumed).map(([key, value]) => ({
      label: key, assumed: true, confirmed: false, source: value.source
    }));
  }

  function appliedModel(model, spec) {
    return {
      rebound: {
        trimDifference: model.rebound.trimDifference,
        minimumRawReadings: model.rebound.minimumRawReadings,
        minRetainedReadings: model.rebound.minRetainedReadings,
        angleTableDeltaR: model.rebound.angleTableDeltaR,
        curve: model.rebound.curve
      },
      ultrasonic: { curve: model.ultrasonic.curve, gradeRanges: model.ultrasonic.gradeRanges },
      core: {
        minimumLengthDiameter: model.core.minimumLengthDiameter,
        lengthDiameterFactors: model.core.lengthDiameterFactors,
        diameterFactors: model.core.diameterFactors,
        moistureFactors: model.core.moistureFactors,
        drillingDamageFactors: model.core.drillingDamageFactors
      },
      characteristicBands: model.characteristicBands,
      confirmedApplicability: model.applicability || null,
      confirmationAttribution: model.confirmedBy ? { confirmedBy: model.confirmedBy, confirmedAt: model.confirmedAt } : null,
      assumptions: assumptionInventory(model, spec)
    };
  }

  function sameCurve(a,b) { return !!a && !!b && a.type === b.type && JSON.stringify(a.coefficients) === JSON.stringify(b.coefficients); }

  function methodSource(method, spec) {
    return method === 'rebound' ? spec.sources.rebound : method === 'ultrasonic' ? spec.sources.ultrasonic : spec.sources.core;
  }
  function enumValue(value, options, label, errors) {
    if (!options.includes(value)) { errors.push(`${label}欄位缺漏或值不在允許清單。`); return 'unknown'; }
    return value;
  }
  function parseNumber(value, label, errors, limits = {}, spec = Spec) {
    if (value === '' || value === null || value === undefined || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) {
      errors.push(`${label}不可空白。`); return NaN;
    }
    if (typeof value !== 'number' && typeof value !== 'string') {
      errors.push(`${label}不是有效數值。`); return NaN;
    }
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number) || Math.abs(number) > spec.rules.maximumMagnitude) {
      errors.push(`${label}不是有限數值或超出數值上限。`); return NaN;
    }
    if (limits.min !== undefined && number < limits.min) errors.push(`${label}不可小於${limits.min}。`);
    if (limits.exclusiveMin !== undefined && number <= limits.exclusiveMin) errors.push(`${label}必須大於${limits.exclusiveMin}。`);
    return number;
  }
  function optionalNumber(value, label, errors, limits = {}, spec = Spec) {
    if (value === undefined || value === null || value === '') return null;
    return parseNumber(value, label, errors, limits, spec);
  }
  function validateCoefficients(type, coefficients, allowedTypes, id, errors, spec) {
    if (!allowedTypes.includes(type) || !coefficients || typeof coefficients !== 'object' || Array.isArray(coefficients)) {
      errors.push(`${id}曲線係數格式錯誤。`); return;
    }
    const keys = type === 'quadratic' ? ['a', 'b', 'c'] : ['a', 'b'];
    if (Object.keys(coefficients).sort().join('|') !== keys.sort().join('|') ||
        !Object.values(coefficients).every(value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= spec.rules.maximumMagnitude)) {
      errors.push(`${id}曲線係數缺漏、非有限或超出數值上限。`);
    }
  }
  function normalizeProject(project, errors) {
    if (project == null) return { name: '', number: '', preparer: '', instrumentModel: '', concreteDescription: '' };
    if (typeof project !== 'object' || Array.isArray(project)) {
      errors.push('案件資料格式錯誤。'); return { name: '', number: '', preparer: '' };
    }
    return { name: cleanText(project.name), number: cleanText(project.number), preparer: cleanText(project.preparer), instrumentModel: cleanText(project.instrumentModel), concreteDescription: cleanText(project.concreteDescription) };
  }
  function cleanText(value) { return typeof value === 'string' ? value.trim().slice(0, 160) : ''; }
  function validOutput(value, spec) { return Number.isFinite(value) && Math.abs(value) <= spec.rules.maximumMagnitude; }
  function finiteTree(value) {
    return value === null || typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' ? Number.isFinite(value) : Array.isArray(value) ? value.every(finiteTree) :
        typeof value === 'object' ? Object.values(value).every(finiteTree) : false);
  }
  function failure(errors, warnings = []) {
    return { ok: false, state: 'internal-review-only', formalAttachmentEligible: false, errors, warnings };
  }
  return Object.freeze({
    CORE_NAME, CORE_VERSION, INPUT_SCHEMA_VERSION, RESULT_SCHEMA_VERSION, LOGIC_SIGNATURE,
    version, inputSchemaVersion: INPUT_SCHEMA_VERSION, resultSchemaVersion: RESULT_SCHEMA_VERSION,
    logicSignature: LOGIC_SIGNATURE, provenance, normalizeInput, validateInput, checkItem, calculate, Spec
  });
});
