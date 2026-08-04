(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PilePyResultBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA = 'rc-pile-py-result.v1';
  const STATE_SCHEMA = 'rc-pile-py-adoption.v1';

  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必須是物件。`);
    return value;
  }

  function text(value, label, required = true) {
    const normalized = String(value == null ? '' : value).trim();
    if (required && !normalized) throw new Error(`${label} 不得空白。`);
    return normalized;
  }

  function finite(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${label} 必須是有限數值。`);
    return number;
  }

  function nonnegative(value, label) {
    const number = finite(value, label);
    if (number < 0) throw new Error(`${label} 不得小於 0。`);
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

  function parse(raw, label) {
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); }
      catch (_) { throw new Error(`${label} 不是有效 JSON。`); }
    }
    return raw;
  }

  function close(actual, expected, absoluteTolerance = 0.01, relativeTolerance = 0.001) {
    return Math.abs(actual - expected) <= Math.max(absoluteTolerance, Math.abs(expected) * relativeTolerance);
  }

  function normalizeExpected(raw) {
    const expected = object(raw, '目前樁基模型');
    return {
      pileNL: positiveInteger(expected.pileNL, 'L 向樁數'),
      pileNB: positiveInteger(expected.pileNB, 'B 向樁數'),
      spacingLCm: positive(expected.spacingLCm, 'L 向樁距'),
      spacingBCm: positive(expected.spacingBCm, 'B 向樁距'),
      pileDiameterCm: positive(expected.pileDiameterCm, '樁徑'),
      pileLengthM: positive(expected.pileLengthM, '樁長'),
      horizontalXTf: Math.abs(finite(expected.horizontalXTf || 0, 'Hx')),
      horizontalYTf: Math.abs(finite(expected.horizontalYTf || 0, 'Hy'))
    };
  }

  function compareSource(source, expected) {
    const mismatches = [];
    const exact = [
      ['pileNL', 'L 向樁數'],
      ['pileNB', 'B 向樁數']
    ];
    exact.forEach(([key, label]) => {
      if (source[key] !== expected[key]) mismatches.push(`${label} ${source[key]} ≠ ${expected[key]}`);
    });
    const numeric = [
      ['spacingLCm', 'L 向樁距', 0.1],
      ['spacingBCm', 'B 向樁距', 0.1],
      ['pileDiameterCm', '樁徑', 0.1],
      ['pileLengthM', '樁長', 0.01],
      ['horizontalXTf', 'Hx', 0.01],
      ['horizontalYTf', 'Hy', 0.01]
    ];
    numeric.forEach(([key, label, tolerance]) => {
      if (!close(source[key], expected[key], tolerance)) mismatches.push(`${label} ${source[key]} ≠ ${expected[key]}`);
    });
    return mismatches;
  }

  function normalizeDirection(raw, direction, required) {
    if (!raw) {
      if (required) throw new Error(`${direction} 向有水平力，缺少 ${direction} 向 p-y 結果。`);
      return null;
    }
    const item = object(raw, `${direction} 向結果`);
    const headDisplacementCm = nonnegative(item.headDisplacementCm, `${direction} 向樁頭位移`);
    const allowableHeadDisplacementCm = positive(item.allowableHeadDisplacementCm, `${direction} 向容許樁頭位移`);
    const maxShearTf = nonnegative(item.maxShearTf, `${direction} 向最大剪力`);
    const shearCapacityTf = positive(item.shearCapacityTf, `${direction} 向剪力容量`);
    const maxMomentTfm = nonnegative(item.maxMomentTfm, `${direction} 向最大彎矩`);
    const momentCapacityTfm = positive(item.momentCapacityTfm, `${direction} 向彎矩容量`);
    const displacementRatio = headDisplacementCm / allowableHeadDisplacementCm;
    const shearRatio = maxShearTf / shearCapacityTf;
    const momentRatio = maxMomentTfm / momentCapacityTfm;
    return {
      headDisplacementCm,
      allowableHeadDisplacementCm,
      maxShearTf,
      shearCapacityTf,
      maxMomentTfm,
      momentCapacityTfm,
      displacementRatio,
      shearRatio,
      momentRatio,
      displacementOk: displacementRatio <= 1 + 1e-9,
      shearOk: shearRatio <= 1 + 1e-9,
      momentOk: momentRatio <= 1 + 1e-9,
      pass: displacementRatio <= 1 + 1e-9 && shearRatio <= 1 + 1e-9 && momentRatio <= 1 + 1e-9
    };
  }

  function validatePayload(raw, currentModel) {
    const payload = object(parse(raw, 'p-y 結果檔'), 'p-y 結果檔');
    if (payload.schema !== SCHEMA) throw new Error(`p-y 結果 schema 不相容：${payload.schema || '缺少'}。`);
    const expected = normalizeExpected(currentModel);
    const units = object(payload.units, '單位');
    if (units.length !== 'cm' || units.force !== 'tf' || units.moment !== 'tf·m') {
      throw new Error('p-y 結果單位必須為 length=cm、force=tf、moment=tf·m。');
    }
    const analysis = object(payload.analysis, '分析識別');
    const generatedAt = text(payload.generatedAt, '分析產出時間');
    if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('分析產出時間不是有效 ISO 日期時間。');
    if (Date.parse(generatedAt) > Date.now() + 5 * 60 * 1000) throw new Error('分析產出時間不得晚於目前時間 5 分鐘以上。');
    const sourceRaw = object(payload.source, '分析來源模型');
    const source = {
      pileNL: positiveInteger(sourceRaw.pileNL, '來源 L 向樁數'),
      pileNB: positiveInteger(sourceRaw.pileNB, '來源 B 向樁數'),
      spacingLCm: positive(sourceRaw.spacingLCm, '來源 L 向樁距'),
      spacingBCm: positive(sourceRaw.spacingBCm, '來源 B 向樁距'),
      pileDiameterCm: positive(sourceRaw.pileDiameterCm, '來源樁徑'),
      pileLengthM: positive(sourceRaw.pileLengthM, '來源樁長'),
      horizontalXTf: Math.abs(finite(sourceRaw.horizontalXTf || 0, '來源 Hx')),
      horizontalYTf: Math.abs(finite(sourceRaw.horizontalYTf || 0, '來源 Hy'))
    };
    const mismatches = compareSource(source, expected);
    if (mismatches.length) throw new Error(`p-y 分析來源與目前樁基模型不符：${mismatches.join('；')}。`);
    const results = object(payload.results, '分析結果');
    const x = normalizeDirection(results.x, 'X', expected.horizontalXTf > 0);
    const y = normalizeDirection(results.y, 'Y', expected.horizontalYTf > 0);
    const requiredDirections = [expected.horizontalXTf > 0 ? x : null, expected.horizontalYTf > 0 ? y : null].filter(Boolean);
    const complete = requiredDirections.length > 0 && requiredDirections.every(Boolean);
    return {
      schema: SCHEMA,
      generatedAt: new Date(Date.parse(generatedAt)).toISOString(),
      analysis: {
        analysisId: text(analysis.analysisId, '分析識別碼'),
        software: text(analysis.software, '分析軟體'),
        version: text(analysis.version, '分析軟體版本'),
        caseName: text(analysis.caseName, '分析案例名稱'),
        analyst: text(analysis.analyst, '分析人員', false),
        capacityBasis: text(analysis.capacityBasis, '容量依據')
      },
      units: { length: 'cm', force: 'tf', moment: 'tf·m' },
      source,
      results: { x, y },
      complete,
      pass: complete && requiredDirections.every(item => item.pass)
    };
  }

  function adopt(candidate, provenance) {
    const normalized = object(candidate, '已驗證候選結果');
    if (normalized.schema !== SCHEMA || !normalized.complete) throw new Error('只能採用已完成驗證的 p-y 結果。');
    const source = provenance && typeof provenance === 'object' ? provenance : {};
    const sha256 = text(source.sourceSha256, '來源檔 SHA-256');
    if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new Error('來源檔 SHA-256 格式錯誤。');
    return {
      stateSchema: STATE_SCHEMA,
      adoptedAt: new Date().toISOString(),
      sourceFilename: text(source.sourceFilename, '來源檔名'),
      sourceSha256: sha256.toLowerCase(),
      payload: normalized
    };
  }

  function inspectState(raw, currentModel) {
    if (raw == null || raw === '') return { available: false, valid: false, complete: false, pass: false, reason: '尚未採用專業 p-y 分析結果。' };
    try {
      const state = object(parse(raw, 'p-y 採用記錄'), 'p-y 採用記錄');
      if (state.stateSchema !== STATE_SCHEMA) throw new Error(`p-y 採用記錄 schema 不相容：${state.stateSchema || '缺少'}。`);
      if (!/^[0-9a-f]{64}$/i.test(String(state.sourceSha256 || ''))) throw new Error('p-y 採用記錄缺少有效來源檔 SHA-256。');
      const payload = validatePayload(state.payload, currentModel);
      return {
        available: true,
        valid: true,
        complete: payload.complete,
        pass: payload.pass,
        reason: payload.pass ? '' : '外部 p-y 結果至少一項超過容許值或容量。',
        state: {
          stateSchema: STATE_SCHEMA,
          adoptedAt: text(state.adoptedAt, '採用時間'),
          sourceFilename: text(state.sourceFilename, '來源檔名'),
          sourceSha256: String(state.sourceSha256).toLowerCase(),
          payload
        },
        payload
      };
    } catch (error) {
      return { available: true, valid: false, complete: false, pass: false, reason: error.message || String(error) };
    }
  }

  return { schema: SCHEMA, stateSchema: STATE_SCHEMA, normalizeExpected, validatePayload, adopt, inspectState };
});
