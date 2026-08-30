(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CableTensionFrequencyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CORE_NAME = 'CableTensionFrequencyCore';
  const CORE_VERSION = '0.1.0';
  const INPUT_SCHEMA_VERSION = 'cable-tension-frequency.input.v0.1';
  const RESULT_SCHEMA_VERSION = 'cable-tension-frequency.result.v0.1';
  const LOGIC_SIGNATURE = 'cable-tension-frequency-core:v0.1:fhwa-taut-string-multimode-origin-fit';
  const STANDARD_GRAVITY = 9.80665;
  const DEFAULT_HARMONIC_TOLERANCE_PCT = 5;
  const DEFAULT_TARGET_TOLERANCE_PCT = 10;
  const MIN_TOLERANCE_PCT = 0.1;
  const MAX_HARMONIC_TOLERANCE_PCT = 10;
  const MAX_TARGET_TOLERANCE_PCT = 10;
  const MIN_TRACEABLE_BASIS_LENGTH = 8;
  const STRICT_DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const UNTRACEABLE_BASIS_PATTERN = /(?:示例資料|請依專案覆寫|待確認|未確認|尚待確認|不明|未知|不適用|無資料|暫估|待補|待定|未定)/i;
  const UNTRACEABLE_BASIS_TOKEN_PATTERN = /(?:^|[^a-z0-9])(?:n\s*[/.]?\s*a|na|none|tbd|unknown|placeholder)(?:$|[^a-z0-9])/i;

  const METHOD = Object.freeze({
    id: 'fhwa-taut-string-frequency',
    name: 'FHWA 理想弦頻率法',
    equation: 'f_n = n/(2L) × sqrt(T/m)',
    fittedEquation: 'f_n = n × a；a = Σ(n·f_n) / Σ(n²)；T(N) = 4mL²a²；T(kN) = 4mL²a² / 1000',
    forceUnit: 'N',
    displayedForceUnit: 'kN'
  });

  const SCOPE = Object.freeze({
    appliesTo: [
      '可合理視為兩端支承、軸力均勻且小振幅振動的拉索或鋼索',
      '已確認自由振動有效長度、有效單位長質量及量測模態編號的現地快算'
    ],
    excludes: [
      '抗彎勁度、垂度、端部轉動彈簧、阻尼、溫度、附加集中質量與非均勻索力修正',
      '索體強度、錨具、疲勞、腐蝕、振動舒適度、動態穩定及完整結構安全判定'
    ]
  });

  function provenance() {
    return {
      core: CORE_NAME,
      version: CORE_VERSION,
      inputSchemaVersion: INPUT_SCHEMA_VERSION,
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
      logicSignature: LOGIC_SIGNATURE,
      method: METHOD.id
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

  function strictNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
    if (typeof value !== 'string') return Number.NaN;
    const text = value.trim();
    if (!STRICT_DECIMAL_PATTERN.test(text)) return Number.NaN;
    const number = Number(text);
    return Number.isFinite(number) ? number : Number.NaN;
  }

  function requiredNumber(value) {
    return strictNumber(value);
  }

  function numberWithDefault(value, fallback) {
    if (value == null || (typeof value === 'string' && value.trim() === '')) return fallback;
    return strictNumber(value);
  }

  function optionalNumber(value) {
    if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
    return strictNumber(value);
  }

  function trimmedText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function hasTraceableBasis(value) {
    const text = trimmedText(value);
    if (text.length < MIN_TRACEABLE_BASIS_LENGTH) return false;
    return !UNTRACEABLE_BASIS_PATTERN.test(text)
      && !UNTRACEABLE_BASIS_TOKEN_PATTERN.test(text);
  }

  function normalizeMeasurements(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
      return {
        mode: requiredNumber(source.mode),
        frequencyHz: requiredNumber(source.frequencyHz),
        note: trimmedText(source.note)
      };
    });
  }

  function normalizeInput(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const targetTensionKn = optionalNumber(source.targetTensionKn);
    return {
      effectiveLengthM: requiredNumber(source.effectiveLengthM),
      effectiveLengthBasis: trimmedText(source.effectiveLengthBasis),
      massPerLengthKgM: requiredNumber(source.massPerLengthKgM),
      massBasis: trimmedText(source.massBasis),
      frequencyBasis: trimmedText(source.frequencyBasis),
      measurements: normalizeMeasurements(source.measurements),
      assumptionConfirmed: source.assumptionConfirmed === true,
      harmonicTolerancePct: numberWithDefault(
        source.harmonicTolerancePct,
        DEFAULT_HARMONIC_TOLERANCE_PCT
      ),
      harmonicToleranceBasis: trimmedText(source.harmonicToleranceBasis),
      targetTensionKn,
      targetTolerancePct: targetTensionKn === null
        ? null
        : numberWithDefault(source.targetTolerancePct, DEFAULT_TARGET_TOLERANCE_PCT),
      targetTensionBasis: targetTensionKn === null ? '' : trimmedText(source.targetTensionBasis)
    };
  }

  function validateInput(input) {
    const normalized = normalizeInput(input);
    const errors = [];

    if (!(normalized.effectiveLengthM > 0)) errors.push('自由振動有效長度 effectiveLengthM 必須大於 0 m。');
    if (!normalized.effectiveLengthBasis) errors.push('必須填寫自由振動有效長度依據 effectiveLengthBasis。');
    if (!(normalized.massPerLengthKgM > 0)) errors.push('有效單位長質量 massPerLengthKgM 必須大於 0 kg/m。');
    if (!normalized.massBasis) errors.push('必須填寫有效單位長質量依據 massBasis。');
    if (!normalized.frequencyBasis) errors.push('必須填寫頻率量測與模態辨識依據 frequencyBasis。');
    if (normalized.measurements.length === 0) errors.push('至少需要一筆模態與頻率量測。');

    const seenModes = new Set();
    normalized.measurements.forEach((measurement, index) => {
      if (!(measurement.mode > 0) || !Number.isSafeInteger(measurement.mode)) {
        errors.push(`第 ${index + 1} 筆模態編號 mode 必須為正安全整數。`);
      } else if (seenModes.has(measurement.mode)) {
        errors.push(`第 ${index + 1} 筆模態編號 mode=${measurement.mode} 重複；每個模態只能輸入一筆代表頻率。`);
      } else {
        seenModes.add(measurement.mode);
      }
      if (!(measurement.frequencyHz > 0)) {
        errors.push(`第 ${index + 1} 筆量測頻率 frequencyHz 必須大於 0 Hz。`);
      }
    });

    if (!Number.isFinite(normalized.harmonicTolerancePct)
      || normalized.harmonicTolerancePct < MIN_TOLERANCE_PCT
      || normalized.harmonicTolerancePct > MAX_HARMONIC_TOLERANCE_PCT) {
      errors.push(`諧波一致性容許差 harmonicTolerancePct 超出本頁有效輸入範圍 ${MIN_TOLERANCE_PCT}%–${MAX_HARMONIC_TOLERANCE_PCT}%；實際門檻須由專案指定，且不得以放寬門檻掩蓋振型不一致。`);
    }
    if (!normalized.harmonicToleranceBasis) errors.push('必須填寫諧波一致性容許差之專案指定依據 harmonicToleranceBasis。');

    if (normalized.targetTensionKn !== null) {
      if (!Number.isFinite(normalized.targetTensionKn) || !(normalized.targetTensionKn > 0)) {
        errors.push('目標索力 targetTensionKn 必須大於 0 kN；不比較時請留空。');
      }
      if (!Number.isFinite(normalized.targetTolerancePct)
        || normalized.targetTolerancePct < MIN_TOLERANCE_PCT
        || normalized.targetTolerancePct > MAX_TARGET_TOLERANCE_PCT) {
        errors.push(`目標索力容許差 targetTolerancePct 超出本頁有效輸入範圍 ${MIN_TOLERANCE_PCT}%–${MAX_TARGET_TOLERANCE_PCT}%；實際門檻須由專案指定。`);
      }
      if (!normalized.targetTensionBasis) errors.push('提供目標索力時，必須填寫目標索力與容許差之專案指定依據 targetTensionBasis。');
    }

    return errors;
  }

  function roundForDetail(value, digits) {
    return Number(value).toFixed(digits);
  }

  function requireFinite(value, label) {
    if (!Number.isFinite(value)) throw new RangeError(`${label} 必須為有限數值；請縮小輸入量級並檢查單位。`);
    return value;
  }

  function requireFinitePositive(value, label) {
    requireFinite(value, label);
    if (!(value > 0)) throw new RangeError(`${label} 必須大於 0；請檢查輸入量級與單位。`);
    return value;
  }

  function finitePositiveSum(items, term, label) {
    return items.reduce((sum, item, index) => {
      const value = requireFinitePositive(term(item), `${label}第 ${index + 1} 項`);
      return requireFinitePositive(sum + value, `${label}累加值`);
    }, 0);
  }

  function calculate(input) {
    const normalized = normalizeInput(input);
    const errors = validateInput(normalized);
    if (errors.length) throw new Error(errors.join('\n'));

    const sumModeFrequency = finitePositiveSum(
      normalized.measurements,
      (measurement) => measurement.mode * measurement.frequencyHz,
      'Σ(n·fₙ) '
    );
    const sumModeSquared = finitePositiveSum(
      normalized.measurements,
      (measurement) => measurement.mode * measurement.mode,
      'Σ(n²) '
    );
    const fundamentalFrequencyHz = requireFinitePositive(
      sumModeFrequency / sumModeSquared,
      '回歸基本頻率'
    );
    const tensionN = requireFinitePositive(4
      * normalized.massPerLengthKgM
      * normalized.effectiveLengthM ** 2
      * fundamentalFrequencyHz ** 2, '反算索力 T(N)');
    const tensionKn = requireFinitePositive(tensionN / 1000, '反算索力 T(kN)');
    const equivalentTf = requireFinitePositive(tensionKn / STANDARD_GRAVITY, '反算索力 T(tf)');

    const measurements = normalized.measurements.map((measurement) => {
      const predictedFrequencyHz = requireFinitePositive(
        measurement.mode * fundamentalFrequencyHz,
        `模態 n=${measurement.mode} 擬合頻率`
      );
      const frequencyDeviationPct = requireFinite((
        (measurement.frequencyHz - predictedFrequencyHz) / predictedFrequencyHz
      ) * 100, `模態 n=${measurement.mode} 頻率偏差`);
      const modalFundamentalFrequencyHz = requireFinitePositive(
        measurement.frequencyHz / measurement.mode,
        `模態 n=${measurement.mode} 單列基本頻率`
      );
      const modalTensionN = requireFinitePositive(4
        * normalized.massPerLengthKgM
        * normalized.effectiveLengthM ** 2
        * modalFundamentalFrequencyHz ** 2, `模態 n=${measurement.mode} 單列索力 T(N)`);
      const modalTensionKn = requireFinitePositive(
        modalTensionN / 1000,
        `模態 n=${measurement.mode} 單列索力 T(kN)`
      );
      const tensionDeviationPct = requireFinite(
        ((modalTensionKn - tensionKn) / tensionKn) * 100,
        `模態 n=${measurement.mode} 索力偏差`
      );
      return {
        mode: measurement.mode,
        frequencyHz: measurement.frequencyHz,
        note: measurement.note,
        predictedFrequencyHz,
        frequencyDeviationPct,
        modalFundamentalFrequencyHz,
        tensionKn: modalTensionKn,
        tensionDeviationPct
      };
    });

    const maxFrequencyDeviationPct = requireFinite(
      measurements.reduce(
        (maximum, measurement) => Math.max(maximum, Math.abs(measurement.frequencyDeviationPct)),
        0
      ),
      '最大頻率偏差'
    );
    const squaredFrequencyDeviationSum = measurements.reduce(
      (sum, measurement, index) => requireFinite(
        sum + requireFinite(measurement.frequencyDeviationPct ** 2, `頻率偏差平方第 ${index + 1} 項`),
        '頻率偏差平方和'
      ),
      0
    );
    const rmsFrequencyDeviationPct = requireFinite(
      Math.sqrt(squaredFrequencyDeviationSum / measurements.length),
      'RMS 頻率偏差'
    );

    const targetProvided = normalized.targetTensionKn !== null;
    const targetDeviationSignedPct = targetProvided
      ? requireFinite(
        ((tensionKn - normalized.targetTensionKn) / normalized.targetTensionKn) * 100,
        '目標索力有號偏差'
      )
      : null;
    const targetDeviationPct = targetProvided
      ? requireFinite(Math.abs(targetDeviationSignedPct), '目標索力絕對偏差')
      : null;
    const targetLowerKn = targetProvided
      ? requireFinitePositive(
        normalized.targetTensionKn * (1 - normalized.targetTolerancePct / 100),
        '目標索力下限'
      )
      : null;
    const targetUpperKn = targetProvided
      ? requireFinitePositive(
        normalized.targetTensionKn * (1 + normalized.targetTolerancePct / 100),
        '目標索力上限'
      )
      : null;
    const targetPassed = targetProvided
      ? tensionKn >= targetLowerKn - 1e-12 && tensionKn <= targetUpperKn + 1e-12
      : null;

    const harmonicApplicable = measurements.length >= 2;
    const harmonicPassed = harmonicApplicable
      ? maxFrequencyDeviationPct <= normalized.harmonicTolerancePct + 1e-12
      : null;

    const basisEntries = [
      ['有效長度依據', normalized.effectiveLengthBasis],
      ['單位長度質量依據', normalized.massBasis],
      ['頻率辨識依據', normalized.frequencyBasis],
      ['諧波容許差依據', normalized.harmonicToleranceBasis],
      ...(targetProvided ? [['目標索力與容許差依據', normalized.targetTensionBasis]] : [])
    ];
    const untraceableBasisLabels = basisEntries
      .filter((entry) => !hasTraceableBasis(entry[1]))
      .map((entry) => entry[0]);
    const projectDataPassed = untraceableBasisLabels.length === 0;

    const checks = [
      checkItem(
        'project-data-provenance',
        '專案資料與依據覆寫',
        projectDataPassed,
        projectDataPassed
          ? `共 ${basisEntries.length} 項專案資料與判定門檻均有可追溯文字依據。`
          : `缺乏可追溯專案依據：${untraceableBasisLabels.join('、')}；估算值只能供內部審閱。`,
        basisEntries.length - untraceableBasisLabels.length,
        basisEntries.length,
        '項'
      ),
      checkItem(
        'taut-string-assumption',
        '理想弦模型假設確認',
        normalized.assumptionConfirmed,
        normalized.assumptionConfirmed
          ? '已確認有效長度、有效單位長質量、模態辨識及理想弦近似可用。'
          : '尚未確認理想弦模型假設；估算值不得直接作為正式採用索力。',
        normalized.assumptionConfirmed,
        true,
        ''
      ),
      checkItem(
        'measurement-set',
        '頻率量測資料',
        true,
        `共 ${measurements.length} 筆有效模態頻率，採原點回歸估算基本頻率。`,
        measurements.length,
        1,
        '筆'
      ),
      checkItem(
        'harmonic-consistency',
        '多模態諧波一致性',
        harmonicPassed,
        harmonicApplicable
          ? `最大頻率偏差 ${roundForDetail(maxFrequencyDeviationPct, 2)}%，容許 ${roundForDetail(normalized.harmonicTolerancePct, 2)}%。`
          : '僅一筆模態量測，無法獨立檢查諧波一致性。',
        harmonicApplicable ? maxFrequencyDeviationPct : null,
        harmonicApplicable ? normalized.harmonicTolerancePct : null,
        '%'
      ),
      checkItem(
        'target-tension',
        '目標索力差異',
        targetPassed,
        targetProvided
          ? `估算 ${roundForDetail(tensionKn, 3)} kN；目標 ${roundForDetail(normalized.targetTensionKn, 3)} kN ± ${roundForDetail(normalized.targetTolerancePct, 2)}%。`
          : '未提供目標索力，本項不判定。',
        targetProvided ? targetDeviationPct : null,
        targetProvided ? normalized.targetTolerancePct : null,
        '%'
      )
    ];

    const overallOk = checks.every((check) => check.status !== 'fail');
    let headline = `理想弦模型估算索力 ${roundForDetail(tensionKn, 2)} kN`;
    if (!projectDataPassed) headline = '專案資料或判定依據尚未可追溯，估算值不得作為附件採用';
    else if (!normalized.assumptionConfirmed) headline = '模型假設尚未確認，估算值不得直接採用';
    else if (harmonicPassed === false) headline = '量測頻率未通過多模態諧波一致性檢查';
    else if (targetPassed === false) headline = '估算索力超出目標索力容許範圍';

    const fit = {
      method: 'least-squares-through-origin',
      sampleCount: measurements.length,
      fundamentalFrequencyHz,
      tensionN,
      tensionKn,
      equivalentTf,
      maxFrequencyDeviationPct,
      rmsFrequencyDeviationPct
    };
    const target = {
      provided: targetProvided,
      tensionKn: targetProvided ? normalized.targetTensionKn : null,
      tolerancePct: targetProvided ? normalized.targetTolerancePct : null,
      deviationPct: targetDeviationPct,
      signedDeviationPct: targetDeviationSignedPct,
      lowerKn: targetLowerKn,
      upperKn: targetUpperKn,
      passed: targetPassed
    };
    const summary = {
      status: overallOk ? 'pass' : 'fail',
      headline,
      primaryMetrics: [
        { key: 'tension', label: '估算索力', value: tensionKn, unit: 'kN' },
        { key: 'fundamental-frequency', label: '回歸基本頻率', value: fundamentalFrequencyHz, unit: 'Hz' },
        { key: 'equivalent-force', label: '估算索力', value: equivalentTf, unit: 'tf' },
        { key: 'frequency-deviation', label: '最大頻率偏差', value: maxFrequencyDeviationPct, unit: '%' }
      ]
    };

    return {
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
      input: normalized,
      method: METHOD,
      scope: SCOPE,
      fit,
      measurements,
      target,
      checks,
      summary,
      overallOk,
      provenance: provenance()
    };
  }

  return {
    version: CORE_VERSION,
    inputSchemaVersion: INPUT_SCHEMA_VERSION,
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    logicSignature: LOGIC_SIGNATURE,
    standardGravity: STANDARD_GRAVITY,
    minimumTolerancePct: MIN_TOLERANCE_PCT,
    maximumHarmonicTolerancePct: MAX_HARMONIC_TOLERANCE_PCT,
    maximumTargetTolerancePct: MAX_TARGET_TOLERANCE_PCT,
    minimumTraceableBasisLength: MIN_TRACEABLE_BASIS_LENGTH,
    method: METHOD,
    scope: SCOPE,
    provenance,
    checkItem,
    strictNumber,
    hasTraceableBasis,
    normalizeInput,
    validateInput,
    calculate
  };
});
