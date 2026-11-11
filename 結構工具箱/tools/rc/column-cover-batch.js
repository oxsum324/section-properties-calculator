(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./column-cover-deviation-core.js'));
  else root.ColumnCoverBatch = factory(root.RcColumnCoverDeviationCore);
})(globalThis, function (core) {
  'use strict';

  const columns = [
    ['案號', 'caseNo', 'id'],
    ['樓層', 'floor', 'id'],
    ['柱號', 'columnId', 'id'],
    ['修次', 'revision', 'id'],
    ['需求識別', 'demandId', 'id'],
    ['原始列號', 'sourceRow', 'row'],
    ['柱寬_mm', 'sectionWidthMm', 'positive'],
    ['柱深_mm', 'sectionDepthMm', 'positive'],
    ['斷面尺寸依據', 'sectionDimensionBasis', 'basis'],
    ['混凝土強度_kgf/cm²', 'fcKgfCm2', 'positive'],
    ['鋼筋降伏強度_kgf/cm²', 'fyKgfCm2', 'positive'],
    ['材料依據', 'materialBasis', 'basis'],
    ['單支主筋面積_cm²', 'barAreaCm2', 'positive'],
    ['主筋直徑_mm', 'mainBarDiameterMm', 'positive'],
    ['箍筋直徑_mm', 'stirrupDiameterMm', 'positive'],
    ['上下每面支數_含角筋', 'barsPerTopBottomFace', 'faceCount'],
    ['左右每側中間支數_不含角筋', 'intermediateBarsPerSide', 'sideCount'],
    ['設計上中心距_mm', 'designCenterTopMm', 'positive'],
    ['設計下中心距_mm', 'designCenterBottomMm', 'positive'],
    ['設計左中心距_mm', 'designCenterLeftMm', 'positive'],
    ['設計右中心距_mm', 'designCenterRightMm', 'positive'],
    ['實測基準', 'measurementMode', 'mode'],
    ['實測上_mm', 'measuredTopMm', 'positive'],
    ['實測下_mm', 'measuredBottomMm', 'positive'],
    ['實測左_mm', 'measuredLeftMm', 'positive'],
    ['實測右_mm', 'measuredRightMm', 'positive'],
    ['量測依據', 'measurementBasis', 'basis'],
    ['軸力Pu_tf', 'puTf', 'signed'],
    ['正Mx幅值_tf·m', 'muXPositiveTfm', 'amplitude'],
    ['負Mx幅值_tf·m', 'muXNegativeTfm', 'amplitude'],
    ['正My幅值_tf·m', 'muYPositiveTfm', 'amplitude'],
    ['負My幅值_tf·m', 'muYNegativeTfm', 'amplitude'],
    ['需求內力依據', 'demandBasis', 'basis'],
    ['最低容量保留比', 'minimumRetentionRatio', 'positive']
  ].map(([label, key, type]) => ({ label, key, type }));
  const byLabel = new Map(columns.map(column => [column.label, column]));
  const identity = columns.filter(column => column.type === 'id');
  const identityKeys = identity.map(column => column.key);
  const status = { pass: '已算／通過', fail: '已算／未通過', missing: '待補', invalid: '資料錯誤', format: '格式錯誤', duplicate: '識別重複' };
  const formats = {
    id: '文字識別，保留前導零', row: '原 Excel 正整數列號', mode: 'bar-center 或 clear-cover',
    basis: '填寫可回查的紀錄、圖號或試驗依據', faceCount: '每面 2～30 支，包含角筋',
    sideCount: '每側 0～28 支，不含角筋', signed: '有限數值，壓正拉負，單位 tf',
    amplitude: '非負幅值，單位 tf·m', positive: '依表頭單位填寫大於零的純數值'
  };

  // 逐記錄解析：引號內可有分隔符、換行和成對引號；空欄及尾欄都保留。
  function parseRecords(text, delimiter) {
    const data = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const records = [];
    let cells = [], value = '', quoted = false, closed = false;
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      if (quoted) {
        if (ch !== '"') value += ch;
        else if (data[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; closed = true; }
      } else if (ch === delimiter || ch === '\n') {
        cells.push(value);
        value = ''; closed = false;
        if (ch === '\n') { records.push(cells); cells = []; }
      } else if (ch === '"' && !closed && value === '') {
        quoted = true;
      } else {
        if (ch === '"' || closed) throw Error('第 ' + (records.length + 1) + ' 筆記錄引號格式錯誤。');
        value += ch;
      }
    }
    if (quoted) throw Error('第 ' + (records.length + 1) + ' 筆記錄缺少結束引號。');
    cells.push(value);
    records.push(cells);
    return records;
  }

  function preview(text, delimiter) {
    const [header, ...records] = parseRecords(text, delimiter);
    const labels = header.map(label => label.trim());
    const seen = new Set(), errors = [];
    for (const label of labels) {
      if (seen.has(label)) errors.push('重複表頭：' + label);
      if (!byLabel.has(label)) errors.push('無法辨識表頭：' + (label || '空白欄名'));
      seen.add(label);
    }
    for (const { label } of columns) if (!seen.has(label)) errors.push('缺少表頭：' + label);
    if (errors.length) throw Error(errors.join('；'));
    const rows = [];
    records.forEach((cells, index) => {
      if (cells.every(value => !value.trim())) return;
      const raw = Object.fromEntries(labels.map((label, i) => [byLabel.get(label).key, cells[i]]));
      rows.push({ record: index + 2, raw, extra: cells.slice(labels.length) });
    });
    if (!rows.length) throw Error('只有表頭，請加入至少一列柱資料。');
    return { labels, rows };
  }

  const missing = value => value == null || /^(?:null|undefined)?$/i.test(String(value).trim());
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  const excelError = /^#(?:N\/A|VALUE!|REF!|DIV\/0!|NUM!|NAME\?|NULL!|SPILL!|CALC!|GETTING_DATA|BLOCKED!|FIELD!|CONNECT!|UNKNOWN!|BUSY!)$/i;
  // 已填的欄位可先檢查，即使同列還有缺格，也能一次回報誤填資料。
  const bounds = {
    sectionWidthMm:[200,3000], sectionDepthMm:[200,3000], fcKgfCm2:[175,700],
    fyKgfCm2:[2000,5600], barAreaCm2:[0,25], mainBarDiameterMm:[6,80],
    stirrupDiameterMm:[4,40], minimumRetentionRatio:[0,1.5]
  };
  function readValue(value, key, type) {
    const text = String(value).trim();
    if (excelError.test(text)) throw Error('Excel 錯誤值');
    if (type === 'mode' && !['bar-center', 'clear-cover'].includes(text)) throw Error('未知量測基準');
    if (type === 'basis' && (text.length < 8 || /不明|未知|待確認|未確認|待複核|待.{0,8}複核|placeholder|n\/a|none/i.test(text))) throw Error('依據不足');
    if (['id', 'mode', 'basis'].includes(type)) return text;
    const number = Number(text);
    if (!decimal.test(text) || !Number.isFinite(number)) throw Error('應填有限數值');
    if (type === 'row' && !(Number.isSafeInteger(number) && number > 0)) throw Error('列號無效');
    if (type === 'sideCount' && !(Number.isInteger(number) && number >= 0 && number <= 28)) throw Error('側邊支數無效');
    if (type === 'faceCount' && !(Number.isInteger(number) && number >= 2 && number <= 30)) throw Error('上下支數無效');
    if (type === 'amplitude' && number < 0) throw Error('負方向亦須填非負幅值');
    if (type === 'positive' && number <= 0) throw Error('數值必須大於零');
    const range = bounds[key];
    if (range && (number < range[0] || number > range[1])) throw Error('超出單筆頁範圍 ' + range.join('～'));
    return number;
  }

  // 核心的跨欄問題可涉及多個原值；保留關聯欄位，完整列亦收在核對 JSON。
  function coreIssue(message, raw) {
    const fields = [
      [/柱寬/, ['sectionWidthMm']], [/柱深/, ['sectionDepthMm']], [/fc'/, ['fcKgfCm2']], [/\bfy\b/, ['fyKgfCm2']],
      [/主筋面積與直徑/, ['barAreaCm2','mainBarDiameterMm']], [/單支主筋面積/, ['barAreaCm2']],
      [/主筋直徑/, ['mainBarDiameterMm']], [/箍筋直徑/, ['stirrupDiameterMm']], [/保留比/, ['minimumRetentionRatio']]
    ].find(([pattern]) => pattern.test(message));
    const related = fields ? columns.filter(c => fields[1].includes(c.key))
      : columns.filter(c => !['id','row','basis'].includes(c.type));
    return { field: related.map(c => c.label).join('、'), raw: related.map(c => raw[c.key]).join('／'), reason: message, expected: fields ? '依單筆頁的範圍及單位修正' : '核對同一斷面的尺寸、配筋與四面位置' };
  }

  function evaluate(prepared) {
    const duplicates = new Map();
    const rowKey = raw => JSON.stringify(identityKeys.map(key => String(raw[key]).trim()));
    for (const {raw, record} of prepared.rows) {
      if (identityKeys.some(key => missing(raw[key]))) continue;
      const key = rowKey(raw);
      if (!duplicates.has(key)) duplicates.set(key, []);
      duplicates.get(key).push({record, source:raw.sourceRow});
    }
    return prepared.rows.map(row => {
      const { raw, extra } = row;
      const issues = [], input = { esKgfCm2: 2040000 };
      let state = '', incomplete = false;
      for (const {label, key, type} of columns) {
        const value = raw[key];
        if (missing(value)) {
          issues.push({ field: label, raw: value ?? '', reason: '缺少必填值', expected: formats[type] });
          incomplete = true;
          continue;
        }
        try {
          const parsed = readValue(value, key, type);
          if (type !== 'id' && type !== 'row') input[key] = parsed;
        } catch (error) {
          issues.push({ field: label, raw: value, reason: error.message, expected: formats[type] });
          state = status.invalid;
        }
      }
      if (extra.length) {
        issues.push({ field: '額外欄位', raw: extra.join('／'), reason: '資料列多於表頭', expected: '核對分隔符與欄數' });
        state = status.format;
      } else if (state && columns.some(c => raw[c.key] === undefined)) {
        state = status.format;
      }
      const peers = duplicates.get(rowKey(raw));
      if (peers && peers.length > 1) {
        issues.push({field:'識別鍵', raw:identityKeys.map(key => raw[key]).join('／'), reason:'重複來源列：' + peers.map(p => (p.source || '未填') + '（記錄 ' + p.record + '）').join('、'), expected:'核對案號、樓層、柱號、修次及需求識別'});
        state = status.duplicate;
      }
      // 任一原始必填值缺漏即停止。validateInput 也會先 normalize，不能拿它來辨識缺格。
      if (state || incomplete) return { ...row, status: state || status.missing, issues, result: null };
      try {
        const problems = core.validateInput(input);
        if (problems.length) return { ...row, status:status.invalid, issues:problems.map(msg => coreIssue(msg, raw)), result:null };
        const result = core.calculate(input);
        return { ...row, status:result.overallOk ? status.pass : status.fail, issues, result };
      } catch (error) {
        return { ...row, status:status.invalid, issues:[coreIssue('核心計算未完成：' + error.message, raw)], result:null };
      }
    });
  }

  function summarize(rows) {
    const counts = { pass:0, fail:0, missing:0, error:0 };
    let minimum = Infinity, maximum = -Infinity;
    for (const row of rows) {
      if (row.result) {
        counts[row.result.overallOk ? 'pass' : 'fail']++;
        minimum = Math.min(minimum, row.result.minimumRetentionRatio);
        maximum = Math.max(maximum, row.result.maximumMeasuredUtilization);
      } else counts[row.status === status.missing ? 'missing' : 'error']++;
    }
    return {
      counts,
      minimumRows: rows.filter(r => r.result && r.result.minimumRetentionRatio === minimum),
      maximumRows: rows.filter(r => r.result && r.result.maximumMeasuredUtilization === maximum)
    };
  }

  return { columns, identityKeys, preview, evaluate, summarize, status };
});
