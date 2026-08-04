(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PilePyTableAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA = 'rc-pile-py-table-adapter.v1';
  const RESULT_SCHEMA = 'rc-pile-py-result.v1';
  const GRAVITY_KN_PER_TF = 9.80665;

  const PROFILES = Object.freeze({
    'si-kn-m-mm': Object.freeze({
      label: 'SI：m / mm / kN / kN·m',
      headers: ['depth_m', 'deflection_mm', 'shear_kn', 'moment_kn_m'],
      depthToM: 1,
      displacementToCm: 0.1,
      shearToTf: 1 / GRAVITY_KN_PER_TF,
      momentToTfm: 1 / GRAVITY_KN_PER_TF
    }),
    'us-kip-ft-in': Object.freeze({
      label: 'US：ft / in / kip / kip·ft',
      headers: ['depth_ft', 'deflection_in', 'shear_kip', 'moment_kip_ft'],
      depthToM: 0.3048,
      displacementToCm: 2.54,
      shearToTf: 0.45359237,
      momentToTfm: 0.45359237 * 0.3048
    }),
    'project-tf-m-cm': Object.freeze({
      label: '專案：m / cm / tf / tf·m',
      headers: ['depth_m', 'deflection_cm', 'shear_tf', 'moment_tf_m'],
      depthToM: 1,
      displacementToCm: 1,
      shearToTf: 1,
      momentToTfm: 1
    })
  });

  function text(value, label, required = true) {
    const normalized = String(value == null ? '' : value).trim();
    if (required && !normalized) throw new Error(`${label} 不得空白。`);
    return normalized;
  }

  function sourceFilename(value, label) {
    const normalized = text(value, label, false);
    if (!normalized) return '';
    if (normalized.length > 180 || /[\\/\u0000-\u001f]/.test(normalized)) throw new Error(`${label} 格式錯誤。`);
    return normalized;
  }

  function finite(value, label) {
    const normalized = String(value == null ? '' : value).trim().replace(/,/g, '');
    const number = Number(normalized);
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

  function canonicalHeader(value) {
    return String(value || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/[·⋅×]/g, '_')
      .replace(/[()\[\]{}]/g, '_')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
  }

  function parseDelimitedLine(line, delimiter) {
    const cells = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (quoted && line[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === delimiter && !quoted) {
        cells.push(value.trim());
        value = '';
      } else {
        value += char;
      }
    }
    if (quoted) throw new Error('表格含未結束的引號。');
    cells.push(value.trim());
    return cells;
  }

  function detectDelimiter(headerLine) {
    const candidates = ['\t', ',', ';'].map(delimiter => ({
      delimiter,
      count: parseDelimitedLine(headerLine, delimiter).length
    })).sort((a, b) => b.count - a.count);
    if (candidates[0].count < 4) throw new Error('表格須以 Tab、逗號或分號分隔至少四欄。');
    if (candidates[0].count === candidates[1].count) throw new Error('無法唯一判定表格分隔符號。');
    return candidates[0].delimiter;
  }

  function parseTable(raw, profileKey, direction = '—') {
    const profile = PROFILES[profileKey];
    if (!profile) throw new Error(`不支援的來源單位：${profileKey || '缺少'}。`);
    const lines = String(raw == null ? '' : raw)
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    if (lines.length < 3) throw new Error(`${direction} 向表格至少須有表頭與 2 筆數值列。`);
    const delimiter = detectDelimiter(lines[0]);
    const headers = parseDelimitedLine(lines[0], delimiter).map(canonicalHeader);
    const duplicateHeaders = headers.filter((header, index) => header && headers.indexOf(header) !== index);
    if (duplicateHeaders.length) throw new Error(`${direction} 向表格有重複欄名：${[...new Set(duplicateHeaders)].join('、')}。`);
    const indexes = {};
    profile.headers.forEach(required => {
      const index = headers.indexOf(required);
      if (index < 0) throw new Error(`${direction} 向表格缺少欄位 ${required}；所選單位不接受其他欄名。`);
      indexes[required] = index;
    });
    const rows = lines.slice(1).map((line, rowIndex) => {
      const cells = parseDelimitedLine(line, delimiter);
      if (cells.length !== headers.length) throw new Error(`${direction} 向第 ${rowIndex + 2} 列欄數與表頭不一致。`);
      return {
        depthM: finite(cells[indexes[profile.headers[0]]], `${direction} 向第 ${rowIndex + 1} 筆深度`) * profile.depthToM,
        displacementCm: finite(cells[indexes[profile.headers[1]]], `${direction} 向第 ${rowIndex + 1} 筆位移`) * profile.displacementToCm,
        shearTf: finite(cells[indexes[profile.headers[2]]], `${direction} 向第 ${rowIndex + 1} 筆剪力`) * profile.shearToTf,
        momentTfm: finite(cells[indexes[profile.headers[3]]], `${direction} 向第 ${rowIndex + 1} 筆彎矩`) * profile.momentToTfm
      };
    });
    const uniqueDepths = new Set(rows.map(row => row.depthM.toFixed(9)));
    if (uniqueDepths.size < 2) throw new Error(`${direction} 向表格須至少包含 2 個不同深度。`);
    const head = rows.reduce((best, row) => Math.abs(row.depthM) < Math.abs(best.depthM) ? row : best, rows[0]);
    if (Math.abs(head.depthM) > 0.001) throw new Error(`${direction} 向表格缺少深度 0 m 的樁頭列。`);
    return {
      rowCount: rows.length,
      headDepthM: head.depthM,
      headDisplacementCm: Math.abs(head.displacementCm),
      maxShearTf: Math.max(...rows.map(row => Math.abs(row.shearTf))),
      maxMomentTfm: Math.max(...rows.map(row => Math.abs(row.momentTfm)))
    };
  }

  function normalizeModel(raw) {
    const model = raw && typeof raw === 'object' ? raw : {};
    return {
      pileNL: positiveInteger(model.pileNL, 'L 向樁數'),
      pileNB: positiveInteger(model.pileNB, 'B 向樁數'),
      spacingLCm: positive(model.spacingLCm, 'L 向樁距'),
      spacingBCm: positive(model.spacingBCm, 'B 向樁距'),
      pileDiameterCm: positive(model.pileDiameterCm, '樁徑'),
      pileLengthM: positive(model.pileLengthM, '樁長'),
      horizontalXTf: Math.abs(finite(model.horizontalXTf || 0, '群樁 Hx')),
      horizontalYTf: Math.abs(finite(model.horizontalYTf || 0, '群樁 Hy')),
      representativeXTf: model.representativeXTf == null ? null : Math.abs(finite(model.representativeXTf, '代表單樁 Hx')),
      representativeYTf: model.representativeYTf == null ? null : Math.abs(finite(model.representativeYTf, '代表單樁 Hy'))
    };
  }

  function buildPayload(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const model = normalizeModel(input.model);
    const profileKey = text(input.unitProfile, '來源單位');
    if (!PROFILES[profileKey]) throw new Error(`不支援的來源單位：${profileKey}。`);
    const scope = text(input.analysisScope, '分析範圍');
    if (!['pile-group', 'representative-pile'].includes(scope)) throw new Error('分析範圍須為 pile-group 或 representative-pile。');
    const analysisHorizontalXTf = scope === 'representative-pile' ? model.representativeXTf : model.horizontalXTf;
    const analysisHorizontalYTf = scope === 'representative-pile' ? model.representativeYTf : model.horizontalYTf;
    if (scope === 'representative-pile' && (!Number.isFinite(analysisHorizontalXTf) || !Number.isFinite(analysisHorizontalYTf))) {
      throw new Error('代表單樁分析須先完成支援範圍內的 p-multiplier 水平力分配。');
    }
    const allowable = positive(input.allowableHeadDisplacementCm, '容許樁頭位移');
    const shearCapacity = positive(input.shearCapacityTf, '剪力容量');
    const momentCapacity = positive(input.momentCapacityTfm, '彎矩容量');
    const makeDirection = (key, label, required) => {
      const tableText = String(input.tables?.[key] || '').trim();
      if (!required && !tableText) return null;
      if (!tableText) throw new Error(`${label} 向有分析水平力，缺少 ${label} 向表格。`);
      const parsed = parseTable(tableText, profileKey, label);
      const sha256 = text(input.tableSha256?.[key], `${label} 向來源表格 SHA-256`);
      if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new Error(`${label} 向來源表格 SHA-256 格式錯誤。`);
      const filename = sourceFilename(input.tableSourceFilename?.[key], `${label} 向來源檔名`);
      return {
        result: {
          headDisplacementCm: parsed.headDisplacementCm,
          allowableHeadDisplacementCm: allowable,
          maxShearTf: parsed.maxShearTf,
          shearCapacityTf: shearCapacity,
          maxMomentTfm: parsed.maxMomentTfm,
          momentCapacityTfm: momentCapacity
        },
        evidence: {
          rowCount: parsed.rowCount,
          tableSha256: sha256.toLowerCase(),
          sourceFilename: filename
        }
      };
    };
    const x = makeDirection('x', 'X', analysisHorizontalXTf > 0);
    const y = makeDirection('y', 'Y', analysisHorizontalYTf > 0);
    const generatedAt = text(input.generatedAt || new Date().toISOString(), '分析產出時間');
    if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('分析產出時間不是有效 ISO 日期時間。');
    return {
      schema: RESULT_SCHEMA,
      generatedAt: new Date(Date.parse(generatedAt)).toISOString(),
      units: { length: 'cm', force: 'tf', moment: 'tf·m' },
      analysis: {
        analysisId: text(input.analysisId, '分析識別碼'),
        software: text(input.software, '分析軟體'),
        version: text(input.version, '分析軟體版本'),
        caseName: text(input.caseName, '分析案例名稱'),
        analyst: text(input.analyst, '分析人員', false),
        capacityBasis: text(input.capacityBasis, '容量依據')
      },
      source: {
        ...model,
        analysisScope: scope,
        analysisHorizontalXTf,
        analysisHorizontalYTf
      },
      results: { x: x?.result || null, y: y?.result || null },
      adapterEvidence: {
        schema: SCHEMA,
        sourceKind: 'tabular-export',
        unitProfile: profileKey,
        analysisScope: scope,
        x: x?.evidence || null,
        y: y?.evidence || null
      }
    };
  }

  return { schema: SCHEMA, resultSchema: RESULT_SCHEMA, profiles: PROFILES, parseTable, buildPayload };
});
