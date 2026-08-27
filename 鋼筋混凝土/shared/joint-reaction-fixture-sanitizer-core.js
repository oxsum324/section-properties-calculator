(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./joint-reaction-load-adapter.js'));
  } else {
    root.JointReactionFixtureSanitizerCore = factory(root.JointReactionLoadAdapter);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Adapter) {
  'use strict';

  const SCHEMA = 'rc-joint-reaction-anonymization-evidence.v1';
  const IDENTIFIER_KEYS = Object.freeze(['point', 'story', 'uniqueName', 'outputCase']);
  const NUMBER_KEYS = Object.freeze(['F1', 'F2', 'F3', 'M1', 'M2', 'M3']);
  const SAFE_EXTENSIONS = new Set(['.csv', '.tsv', '.txt']);
  const ORIGIN_KINDS = new Set(['actual-observed', 'synthetic-compatibility', 'privacy-test']);

  function required(value, label) {
    const normalized = String(value == null ? '' : value).trim();
    if (!normalized) throw new Error(`${label}不得空白。`);
    return normalized;
  }

  function adapter() {
    if (!Adapter?.parseTable || !Adapter?.isCombinationCaseType || !Adapter?.isLinearStaticCaseType) {
      throw new Error('缺少 Joint Reactions 轉接核心。');
    }
    return Adapter;
  }

  function parseDelimitedLine(line, delimiter) {
    const cells = [];
    let value = '';
    let quoted = false;
    let everQuoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        everQuoted = true;
        if (quoted && line[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === delimiter && !quoted) {
        cells.push({ value:value.trim(), quoted:everQuoted });
        value = '';
        everQuoted = false;
      } else {
        value += char;
      }
    }
    if (quoted) throw new Error('Joint Reactions 表格含未結束的引號。');
    cells.push({ value:value.trim(), quoted:everQuoted });
    return cells;
  }

  function serializeCell(value, delimiter, quoted) {
    const safe = String(value == null ? '' : value);
    if (!quoted && !safe.includes(delimiter) && !/["\r\n]/.test(safe)) return safe;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  function makeTokenMap(prefix) {
    const values = new Map();
    return value => {
      const source = String(value == null ? '' : value).trim();
      if (!source) return '';
      if (!values.has(source)) values.set(source, `${prefix}_${String(values.size + 1).padStart(3, '0')}`);
      return values.get(source);
    };
  }

  function syntheticNumber(key, rowIndex) {
    const factor = rowIndex + 1;
    const values = {
      F1:factor * 1.25,
      F2:factor * -2.5,
      F3:100 + factor * 10,
      M1:factor * 3.5,
      M2:factor * -4.5,
      M3:factor * 5.5,
    };
    return String(values[key]);
  }

  function caseTypeToken(value) {
    const source = String(value == null ? '' : value).trim();
    if (!source) return '';
    if (adapter().isCombinationCaseType(source)) return 'Combination';
    if (adapter().isLinearStaticCaseType(source)) return 'Linear Static';
    return 'Other Case Type';
  }

  function sanitizeExportStructure(options) {
    const cfg = options && typeof options === 'object' ? options : {};
    const raw = String(cfg.raw == null ? '' : cfg.raw);
    const software = required(cfg.software, '來源軟體').toUpperCase();
    if (!['ETABS', 'SAP2000'].includes(software)) throw new Error('來源軟體須為 ETABS 或 SAP2000。');
    const softwareVersion = required(cfg.softwareVersion, '軟體版本');
    const units = required(cfg.units, '來源單位系統');
    const tableName = required(cfg.tableName || 'Joint Reactions', '匯出表名');
    const originKind = required(cfg.originKind, '來源分類');
    if (!ORIGIN_KINDS.has(originKind)) throw new Error('來源分類只支援 actual-observed、synthetic-compatibility 或 privacy-test。');
    const sourceExtension = String(cfg.sourceExtension || '.csv').trim().toLowerCase();
    if (!SAFE_EXTENSIONS.has(sourceExtension)) throw new Error('來源副檔名只支援 .csv、.tsv 或 .txt。');
    const generatedAt = cfg.generatedAt || new Date().toISOString();
    if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('產出時間必須是有效日期時間。');

    const parsed = adapter().parseTable(raw);
    const lines = raw.replace(/\r\n?/g, '\n').split('\n');
    const hadTrailingNewline = /\r?\n$/.test(raw);
    const newline = raw.includes('\r\n') ? '\r\n' : '\n';
    const headerIndex = parsed.headerLine - 1;
    const indexToKey = Object.fromEntries(Object.entries(parsed.columns).map(([key, index]) => [index, key]));
    const knownIndexes = new Set(Object.values(parsed.columns));
    const unknownHeaders = parsed.headers.filter((_, index) => !knownIndexes.has(index));
    const tokenFor = {
      point:makeTokenMap('JOINT'),
      story:makeTokenMap('STORY'),
      uniqueName:makeTokenMap('UNIQUE'),
      outputCase:makeTokenMap('CASE'),
      stepNum:makeTokenMap('STEP'),
    };
    let rowIndex = 0;
    const outputLines = lines.map((line, lineIndex) => {
      if (lineIndex < headerIndex) return line.trim() ? `FIXTURE PREAMBLE ${lineIndex + 1}: [REDACTED]` : '';
      if (lineIndex === headerIndex || !line.trim()) return line;
      const cells = parseDelimitedLine(line, parsed.delimiter);
      if (cells.length !== parsed.headers.length) throw new Error(`Joint Reactions 第 ${lineIndex + 1} 列欄數與表頭不一致。`);
      const transformed = cells.map((cell, columnIndex) => {
        const key = indexToKey[columnIndex];
        let value = cell.value;
        if (IDENTIFIER_KEYS.includes(key)) value = tokenFor[key](value);
        else if (NUMBER_KEYS.includes(key)) value = syntheticNumber(key, rowIndex);
        else if (key === 'caseType') value = caseTypeToken(value);
        else if (key === 'stepType') value = value ? 'STEP' : '';
        else if (key === 'stepNum') value = tokenFor.stepNum(value);
        else if (value) value = '[REDACTED]';
        return serializeCell(value, parsed.delimiter, cell.quoted);
      });
      rowIndex += 1;
      return transformed.join(parsed.delimiter);
    });
    if (!hadTrailingNewline && outputLines[outputLines.length - 1] === '') outputLines.pop();
    const sanitized = outputLines.join(newline);
    const reparsed = adapter().parseTable(sanitized);
    if (reparsed.rowCount !== parsed.rowCount || reparsed.headerLine !== parsed.headerLine || reparsed.delimiter !== parsed.delimiter) {
      throw new Error('匿名化後的表格結構與來源不一致。');
    }

    return {
      sanitized,
      evidence:{
        schemaVersion:SCHEMA,
        status:'candidate-manual-review-required',
        generatedAt:new Date(generatedAt).toISOString(),
        provenance:'anonymized-observed-export-candidate',
        originKind,
        notEngineeringData:true,
        source:{ software, softwareVersion, tableName, units, extension:sourceExtension, stored:false },
        output:{
          headerLine:reparsed.headerLine,
          delimiter:reparsed.delimiter === '\t' ? 'tab' : (reparsed.delimiter === ';' ? 'semicolon' : 'comma'),
          rowCount:reparsed.rowCount,
        },
        transform:{
          preambleContentRedacted:true,
          identifiersTokenized:true,
          numericResultsReplacedWithSyntheticValues:true,
          caseTypeReducedToClassification:true,
          unknownDataCellsRedacted:true,
          originalHeaderTextPreserved:true,
          unknownHeaders,
        },
        reviewChecklist:[
          '確認輸出不含工程名稱、模型路徑、人名、節點名稱或載重案例原名。',
          '逐一檢查保留的原始表頭文字，尤其是非標準欄名。',
          '確認軟體版本、Joint Reactions 表名與來源單位系統正確。',
          '以轉接器與 fixture test 驗證後，才可標記為 anonymized-observed-export。',
          '匿名檔只證明格式相容性，不得作為工程計算或正式附件來源。',
        ],
      },
    };
  }

  return Object.freeze({
    schemaVersion:SCHEMA,
    sanitizeExportStructure,
  });
}));
