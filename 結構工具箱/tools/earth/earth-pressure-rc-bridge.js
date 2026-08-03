(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EarthPressureRcBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BRIDGE_SCHEMA = 'earth-pressure-to-rc-foundation.v1';
  const SOURCE_TOOL_ID = 'earth-pressure';
  const SOURCE_PAGE_VERSION = 'V0.6';
  const RELATIVE_TOLERANCE = 1e-8;

  function parsePayload(raw) {
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); }
      catch (_) { throw new Error('土壓 JSON 格式不正確。'); }
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('土壓 JSON 格式不正確。');
    return raw;
  }

  function finiteNumber(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${label} 必須是有限數值。`);
    return number;
  }

  function cleanText(value) {
    return String(value == null ? '' : value).trim();
  }

  function sameNumber(actual, expected) {
    const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
    return Math.abs(actual - expected) <= RELATIVE_TOLERANCE * scale;
  }

  function assertRecalculatedResult(saved, recalculated, key, label) {
    const actual = finiteNumber(saved[key], `來源結果 ${label}`);
    const expected = finiteNumber(recalculated[key], `重新計算 ${label}`);
    if (!sameNumber(actual, expected)) throw new Error(`土壓 JSON 的${label}與同版核心重新計算不一致，已拒絕匯入。`);
  }

  function normalizeProject(project) {
    const source = project && typeof project === 'object' ? project : {};
    return {
      name: cleanText(source.name),
      no: cleanText(source.no),
      designer: cleanText(source.designer)
    };
  }

  function importPayload(raw, core) {
    if (!core || typeof core.calculate !== 'function' || typeof core.validateInput !== 'function') {
      throw new Error('缺少相容的土壓計算核心，無法驗證來源。');
    }
    const payload = parsePayload(raw);
    const tool = payload.tool && typeof payload.tool === 'object' ? payload.tool : {};
    if (tool.id !== SOURCE_TOOL_ID) throw new Error(`此 JSON 屬於 ${tool.id || '未知工具'}，不是擋土土壓局部快算。`);
    if (tool.pageVersion !== SOURCE_PAGE_VERSION) {
      throw new Error(`土壓 JSON 版本 ${tool.pageVersion || '未知'} 與支援版本 ${SOURCE_PAGE_VERSION} 不相容。`);
    }
    if (!payload.input || typeof payload.input !== 'object') throw new Error('土壓 JSON 缺少可重新計算的 input。');
    if (!payload.result || typeof payload.result !== 'object') throw new Error('土壓 JSON 缺少 result。');
    const sourceGeneratedAt = cleanText(payload.generatedAt);
    if (!sourceGeneratedAt || !Number.isFinite(Date.parse(sourceGeneratedAt))) {
      throw new Error('土壓 JSON 缺少有效的輸出時間，無法建立來源追溯。');
    }

    const errors = core.validateInput(payload.input);
    if (errors.length) throw new Error(`土壓 JSON 輸入未通過檢查：${errors.join(' ')}`);
    const recalculated = core.calculate(payload.input);
    const saved = payload.result;
    if (saved.resultSchemaVersion !== core.resultSchemaVersion) {
      throw new Error(`土壓結果 schema ${saved.resultSchemaVersion || '未知'} 與目前核心 ${core.resultSchemaVersion} 不相容。`);
    }
    if (!saved.provenance || saved.provenance.logicSignature !== core.logicSignature) {
      throw new Error('土壓 JSON 缺少相符的計算邏輯簽章。');
    }
    [
      ['H', '擋土高度'],
      ['gammaSoil', '土壤單位重'],
      ['surcharge', '均佈超載'],
      ['K', '採用土壓係數'],
      ['effectiveSoilCoef', '有效土壓係數'],
      ['soilForce', '土壤側向力'],
      ['surchargeForce', '超載側向力'],
      ['waterForce', '水壓側向力'],
      ['totalForce', '側向合力'],
      ['overturningMoment', '傾覆矩'],
      ['effectivePassive', '採用被動抵抗']
    ].forEach(([key, label]) => assertRecalculatedResult(saved, recalculated, key, label));

    if (recalculated.wallType !== 'cantilever') throw new Error('第一階段僅接受懸臂式擋土牆土壓結果。');
    if (recalculated.mode !== 'active') throw new Error('懸臂式 RC 擋土牆目前僅接受主動土壓結果；靜止土壓應另採受約束牆模型。');
    if (recalculated.seismicEnable) throw new Error('地震 Mononobe-Okabe 結果尚未建立 RC 強度載重組合，第一階段不自動匯入。');
    if (recalculated.useCoulomb && !recalculated.coulombValid) throw new Error('Coulomb 土壓解不成立，不得匯入 RC 設計。');

    return {
      schema: BRIDGE_SCHEMA,
      sourceTool: SOURCE_TOOL_ID,
      sourcePageVersion: SOURCE_PAGE_VERSION,
      sourceGeneratedAt,
      project: normalizeProject(payload.project),
      model: {
        designReference: recalculated.designReference,
        designReferenceLabel: recalculated.designReferenceLabel,
        theoryLabel: recalculated.theoryLabel,
        backfillModelLabel: recalculated.backfillModelLabel,
        waterModelLabel: recalculated.waterModelLabel,
        passiveModeLabel: recalculated.passiveModeLabel,
        useCoulomb: Boolean(recalculated.useCoulomb),
        useLayered: Boolean(recalculated.useLayered),
        waterDepth: finiteNumber(recalculated.waterDepth, '地下水深'),
        sourceOverallOk: Boolean(recalculated.overallOk)
      },
      sourceGeometry: {
        retainedHeight: finiteNumber(recalculated.H, '擋土高度'),
        baseWidth: finiteNumber(recalculated.baseB, '來源基底寬'),
        verticalLoad: finiteNumber(recalculated.verticalLoad, '來源垂直重量')
      },
      foundationFields: {
        rHw: finiteNumber(recalculated.H, '擋土高度') * 100,
        rKa: finiteNumber(recalculated.effectiveSoilCoef, '有效土壓係數'),
        rGamma: finiteNumber(recalculated.gammaSoil, '土壤單位重'),
        rQs: finiteNumber(recalculated.surcharge, '均佈超載'),
        rMu: finiteNumber(recalculated.mu, '基底摩擦係數'),
        rQa: finiteNumber(recalculated.qa, '容許基底壓')
      },
      serviceLoads: {
        lateralForce: finiteNumber(recalculated.totalForce, '側向合力'),
        overturningMoment: finiteNumber(recalculated.overturningMoment, '傾覆矩'),
        effectivePassive: finiteNumber(recalculated.effectivePassive, '採用被動抵抗'),
        resultantHeight: finiteNumber(recalculated.resultantHeight, '合力作用高')
      },
      provenance: {
        core: cleanText(recalculated.provenance && recalculated.provenance.core),
        version: cleanText(recalculated.provenance && recalculated.provenance.version),
        inputSchemaVersion: cleanText(recalculated.provenance && recalculated.provenance.inputSchemaVersion),
        resultSchemaVersion: cleanText(recalculated.provenance && recalculated.provenance.resultSchemaVersion),
        logicSignature: cleanText(recalculated.provenance && recalculated.provenance.logicSignature)
      }
    };
  }

  function normalizeState(raw) {
    const state = parsePayload(raw);
    if (state.schema !== BRIDGE_SCHEMA || state.sourceTool !== SOURCE_TOOL_ID || state.sourcePageVersion !== SOURCE_PAGE_VERSION) {
      throw new Error('已儲存的土壓銜接資料版本不相容。');
    }
    if (!cleanText(state.sourceGeneratedAt) || !Number.isFinite(Date.parse(state.sourceGeneratedAt))) {
      throw new Error('已儲存的土壓銜接資料缺少有效輸出時間。');
    }
    if (!state.provenance || !cleanText(state.provenance.logicSignature)) throw new Error('已儲存的土壓銜接資料缺少邏輯簽章。');
    ['retainedHeight', 'baseWidth', 'verticalLoad'].forEach(key => finiteNumber(state.sourceGeometry && state.sourceGeometry[key], `土壓來源 ${key}`));
    ['lateralForce', 'overturningMoment', 'effectivePassive', 'resultantHeight'].forEach(key => finiteNumber(state.serviceLoads && state.serviceLoads[key], `土壓來源 ${key}`));
    return state;
  }

  return {
    schema: BRIDGE_SCHEMA,
    sourceToolId: SOURCE_TOOL_ID,
    sourcePageVersion: SOURCE_PAGE_VERSION,
    importPayload,
    normalizeState
  };
});
