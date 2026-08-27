(function (root, factory) {
  const api = factory(root.LoadCombo);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.JointReactionLoadAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (defaultLoadCombo) {
  'use strict';

  const SCHEMA = 'rc-joint-reaction-load-adapter.v1';
  const VERSION = 'V1.1';
  const GRAVITY_KN_PER_TF = 9.80665;
  const LOAD_CASE_KEYS = Object.freeze(['D', 'L', 'W', 'E']);
  const FORCE_KEYS = Object.freeze(['F1', 'F2', 'F3']);
  const MOMENT_KEYS = Object.freeze(['', 'M1', 'M2', 'M3']);

  const UNIT_PROFILES = Object.freeze({
    'tf-m': Object.freeze({ label:'tf / tf·m', forceToTf:1, momentToTfm:1 }),
    'kn-m': Object.freeze({ label:'kN / kN·m', forceToTf:1 / GRAVITY_KN_PER_TF, momentToTfm:1 / GRAVITY_KN_PER_TF }),
    'kgf-cm': Object.freeze({ label:'kgf / kgf·cm', forceToTf:1 / 1000, momentToTfm:1 / 100000 }),
    'kip-ft': Object.freeze({ label:'kip / kip·ft', forceToTf:0.45359237, momentToTfm:0.45359237 * 0.3048 }),
  });

  const HEADER_ALIASES = Object.freeze({
    point:new Set(['point', 'joint', 'pointlabel', 'jointlabel', 'pointname', 'jointname']),
    story:new Set(['story', 'storyname']),
    uniqueName:new Set(['uniquename', 'pointuniquename', 'jointuniquename']),
    outputCase:new Set(['outputcase', 'loadcasecombo', 'loadcasecombination', 'loadcase', 'case', 'casename']),
    caseType:new Set(['casetype', 'outputcasetype', 'loadcasetype']),
    stepType:new Set(['steptype']),
    stepNum:new Set(['stepnum', 'stepnumber']),
    F1:new Set(['f1']), F2:new Set(['f2']), F3:new Set(['f3']),
    M1:new Set(['m1']), M2:new Set(['m2']), M3:new Set(['m3']),
  });

  function text(value, label, required = true) {
    const normalized = String(value == null ? '' : value).trim();
    if (required && !normalized) throw new Error(`${label} 不得空白。`);
    return normalized;
  }

  function finite(value, label) {
    const normalized = String(value == null ? '' : value).trim().replace(/,/g, '');
    if (!normalized) throw new Error(`${label} 不得空白。`);
    const number = Number(normalized);
    if (!Number.isFinite(number)) throw new Error(`${label} 必須是有限數值。`);
    return number;
  }

  function sign(value, label) {
    const number = Number(value);
    if (number !== 1 && number !== -1) throw new Error(`${label} 必須為 +1 或 -1。`);
    return number;
  }

  function canonicalHeader(value) {
    return String(value || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
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
    if (quoted) throw new Error('Joint Reactions 表格含未結束的引號。');
    cells.push(value.trim());
    return cells;
  }

  function resolveColumns(cells) {
    const columns = {};
    cells.forEach((cell, index) => {
      const canonical = canonicalHeader(cell);
      Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
        if (aliases.has(canonical)) {
          if (columns[key] != null) throw new Error(`Joint Reactions 表頭重複對應 ${key}。`);
          columns[key] = index;
        }
      });
    });
    return columns;
  }

  function findHeader(lines) {
    const delimiters = ['\t', ',', ';'];
    const limit = Math.min(lines.length, 25);
    for (let lineIndex = 0; lineIndex < limit; lineIndex += 1) {
      for (const delimiter of delimiters) {
        const cells = parseDelimitedLine(lines[lineIndex], delimiter);
        if (cells.length < 8) continue;
        let columns;
        try { columns = resolveColumns(cells); }
        catch (_) { continue; }
        const required = ['point', 'outputCase', ...FORCE_KEYS, 'M1', 'M2', 'M3'];
        if (required.every(key => columns[key] != null)) return { lineIndex, delimiter, cells, columns };
      }
    }
    throw new Error('找不到 Joint Reactions 表頭；至少需要 Point／Joint、OutputCase、F1～F3、M1～M3。');
  }

  function makePointKey(row) {
    return row.story ? `${row.story} / ${row.point}` : row.point;
  }

  function parseTable(raw) {
    const lines = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n').split('\n');
    if (!lines.some(line => line.trim())) throw new Error('Joint Reactions 表格不得空白。');
    const header = findHeader(lines);
    const { columns, delimiter } = header;
    const rows = [];
    for (let lineIndex = header.lineIndex + 1; lineIndex < lines.length; lineIndex += 1) {
      if (!lines[lineIndex].trim()) continue;
      const cells = parseDelimitedLine(lines[lineIndex], delimiter);
      if (cells.every(cell => !cell)) continue;
      if (cells.length !== header.cells.length) throw new Error(`Joint Reactions 第 ${lineIndex + 1} 列欄數與表頭不一致。`);
      const cell = key => columns[key] == null ? '' : String(cells[columns[key]] || '').trim();
      const point = text(cell('point'), `第 ${lineIndex + 1} 列 Point／Joint`);
      const outputCase = text(cell('outputCase'), `第 ${lineIndex + 1} 列 OutputCase`);
      const row = {
        sourceLine:lineIndex + 1,
        point,
        story:cell('story'),
        uniqueName:cell('uniqueName'),
        outputCase,
        caseType:cell('caseType'),
        stepType:cell('stepType'),
        stepNum:cell('stepNum'),
        F1:finite(cell('F1'), `第 ${lineIndex + 1} 列 F1`),
        F2:finite(cell('F2'), `第 ${lineIndex + 1} 列 F2`),
        F3:finite(cell('F3'), `第 ${lineIndex + 1} 列 F3`),
        M1:finite(cell('M1'), `第 ${lineIndex + 1} 列 M1`),
        M2:finite(cell('M2'), `第 ${lineIndex + 1} 列 M2`),
        M3:finite(cell('M3'), `第 ${lineIndex + 1} 列 M3`),
      };
      row.pointKey = makePointKey(row);
      rows.push(row);
    }
    if (!rows.length) throw new Error('Joint Reactions 表格沒有可讀取的資料列。');
    const points = [...new Set(rows.map(row => row.pointKey))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const casesByPoint = {};
    points.forEach(pointKey => {
      casesByPoint[pointKey] = [...new Set(rows.filter(row => row.pointKey === pointKey).map(row => row.outputCase))]
        .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    });
    return {
      schema:SCHEMA,
      rowCount:rows.length,
      headerLine:header.lineIndex + 1,
      delimiter,
      headers:header.cells.slice(),
      columns:{ ...columns },
      rows,
      points,
      casesByPoint,
    };
  }

  function normalizeChoice(value, allowed, label, allowBlank = false) {
    const normalized = text(value, label, !allowBlank).toUpperCase();
    if (allowBlank && !normalized) return '';
    if (!allowed.includes(normalized)) throw new Error(`${label} 不支援 ${normalized || '空白'}。`);
    return normalized;
  }

  function normalizeCaseType(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function isCombinationCaseType(value) {
    return /(comb|combination|組合)/i.test(String(value || ''));
  }

  function isLinearStaticCaseType(value) {
    const normalized = normalizeCaseType(value);
    return normalized === 'linearstatic' || normalized === 'linstatic';
  }

  function round(value) {
    return Math.round((Number(value) + Number.EPSILON) * 1e9) / 1e9;
  }

  function selectedRow(parsed, pointKey, caseName, loadKey) {
    if (!caseName) return null;
    const matches = parsed.rows.filter(row => row.pointKey === pointKey && row.outputCase === caseName);
    if (!matches.length) throw new Error(`${loadKey} 對應案例 ${caseName} 在節點 ${pointKey} 沒有反力資料。`);
    if (matches.length > 1) throw new Error(`${loadKey} 對應案例 ${caseName} 在節點 ${pointKey} 有 ${matches.length} 列；多步驟或重複列不得自動取值。`);
    const row = matches[0];
    if (!row.caseType) throw new Error(`${loadKey} 對應案例 ${caseName} 缺少 CaseType，無法確認為基本載重案例。`);
    if (isCombinationCaseType(row.caseType)) throw new Error(`${loadKey} 對應 ${caseName} 為載重組合，不得再套用 D／L／W／E 組合係數。`);
    if (!isLinearStaticCaseType(row.caseType)) {
      throw new Error(`${loadKey} 對應 ${caseName} 的 CaseType「${row.caseType}」不是可線性疊加的 Linear Static／LinStatic 基本案例。`);
    }
    return row;
  }

  function buildPackage(options) {
    const cfg = options && typeof options === 'object' ? options : {};
    const parsed = cfg.parsed?.schema === SCHEMA ? cfg.parsed : parseTable(cfg.raw);
    const loadCombo = cfg.loadCombo || defaultLoadCombo;
    if (!loadCombo?.createComponentPackage) throw new Error('缺少共用 LoadCombo 基本載重分量核心。');
    const software = text(cfg.software, '來源軟體');
    if (!['ETABS', 'SAP2000'].includes(software)) throw new Error('來源軟體須為 ETABS 或 SAP2000。');
    const filename = text(cfg.filename, '來源檔名');
    const pointKey = text(cfg.pointKey, '節點');
    if (!parsed.points.includes(pointKey)) throw new Error(`Joint Reactions 表格沒有節點 ${pointKey}。`);
    const profileKey = text(cfg.unitProfile, '來源單位');
    const profile = UNIT_PROFILES[profileKey];
    if (!profile) throw new Error(`不支援的來源單位：${profileKey}。`);
    const verticalForce = normalizeChoice(cfg.verticalForce || 'F3', FORCE_KEYS, 'P 來源分量');
    const mxMoment = normalizeChoice(cfg.mxMoment == null ? 'M1' : cfg.mxMoment, MOMENT_KEYS, 'Mx 來源分量', true);
    const myMoment = normalizeChoice(cfg.myMoment == null ? 'M2' : cfg.myMoment, MOMENT_KEYS, 'My 來源分量', true);
    if (mxMoment && myMoment && mxMoment === myMoment) throw new Error('Mx 與 My 不得同時取用同一來源彎矩分量。');
    const verticalSign = sign(cfg.verticalSign == null ? 1 : cfg.verticalSign, 'P 軸向係數');
    const mxSign = sign(cfg.mxSign == null ? 1 : cfg.mxSign, 'Mx 軸向係數');
    const mySign = sign(cfg.mySign == null ? 1 : cfg.mySign, 'My 軸向係數');
    const cases = {};
    LOAD_CASE_KEYS.forEach(loadKey => { cases[loadKey] = String(cfg.cases?.[loadKey] || '').trim(); });
    const mappedNames = LOAD_CASE_KEYS.map(key => cases[key]).filter(Boolean);
    if (!mappedNames.length) throw new Error('D／L／W／E 至少須對應一個基本載重案例。');
    if (new Set(mappedNames).size !== mappedNames.length) throw new Error('D／L／W／E 不得重複對應同一來源案例。');
    const selected = {};
    LOAD_CASE_KEYS.forEach(loadKey => { selected[loadKey] = selectedRow(parsed, pointKey, cases[loadKey], loadKey); });
    const forceValues = component => Object.fromEntries(LOAD_CASE_KEYS.map(loadKey => {
      const row = selected[loadKey];
      if (!row || !component) return [loadKey, 0];
      const scale = component.startsWith('F') ? profile.forceToTf : profile.momentToTfm;
      const axisSign = component.startsWith('F') ? verticalSign : (component === mxMoment ? mxSign : mySign);
      const actionReaction = component.startsWith('M') ? -1 : 1;
      return [loadKey, round(row[component] * scale * axisSign * actionReaction)];
    }));
    const caseMap = LOAD_CASE_KEYS.map(key => `${key}=${cases[key] || '0'}`).join(', ');
    const axisMap = `P=${verticalForce}×${verticalSign}; Mx=-${mxMoment || '0'}×${mxSign}; My=-${myMoment || '0'}×${mySign}`;
    return loadCombo.createComponentPackage({
      generatedAt:cfg.generatedAt || new Date().toISOString(),
      source:{
        tool:`${software} Joint Reactions 轉接器`,
        label:`${filename}｜${pointKey}`,
        version:VERSION,
        analysisId:`${filename}:${pointKey}`,
        caseSet:`${caseMap}｜${profile.label}｜${axisMap}`,
      },
      forces:{
        P:forceValues(verticalForce),
        Mx:forceValues(mxMoment),
        My:forceValues(myMoment),
      },
    });
  }

  return {
    schema:SCHEMA,
    version:VERSION,
    unitProfiles:UNIT_PROFILES,
    isCombinationCaseType,
    isLinearStaticCaseType,
    parseTable,
    buildPackage,
  };
});
