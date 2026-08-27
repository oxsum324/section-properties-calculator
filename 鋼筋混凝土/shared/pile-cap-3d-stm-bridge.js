/* RC foundation -> pile-cap 3D STM versioned bridge.
 * The bridge carries only values calculated or entered by the foundation tool.
 * STM nodal/strut effective areas and model-adoption confirmations remain local
 * to the receiving tool and are deliberately not certified by this payload.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PileCap3DSTMBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LEGACY_SCHEMA = 'rc-foundation-pile-cap-3d-stm.v1';
  const SCHEMA = 'rc-foundation-pile-cap-3d-stm.v2';
  const SUPPORTED_SCHEMAS = new Set([LEGACY_SCHEMA, SCHEMA]);
  const SOURCE_TOOL = 'rc-foundation';
  const SOURCE_VERSION = 'V3.1';
  const TRANSFER_STORAGE_KEY = 'rc.foundation.pile-cap-3d-stm.transfer.v1';
  const MAX_BYTES = 1024 * 1024;
  const EPS = 1e-9;

  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必須是物件。`);
    return value;
  }

  function parse(raw) {
    if (typeof raw !== 'string') return raw;
    if (typeof TextEncoder !== 'undefined' && new TextEncoder().encode(raw).byteLength > MAX_BYTES) {
      throw new Error('樁帽三維 STM JSON 超過 1 MiB 上限。');
    }
    try { return JSON.parse(raw); }
    catch (_) { throw new Error('樁帽三維 STM 檔不是有效 JSON。'); }
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

  function positive(value, label) {
    const number = finite(value, label);
    if (number <= 0) throw new Error(`${label} 必須大於 0。`);
    return number;
  }

  function nonnegative(value, label) {
    const number = finite(value, label);
    if (number < 0) throw new Error(`${label} 不得小於 0。`);
    return number;
  }

  function positiveInteger(value, label) {
    const number = positive(value, label);
    if (!Number.isInteger(number)) throw new Error(`${label} 必須是正整數。`);
    return number;
  }

  function close(actual, expected, absoluteTolerance = 0.01, relativeTolerance = 1e-6) {
    return Math.abs(actual - expected) <= Math.max(absoluteTolerance, Math.abs(expected) * relativeTolerance);
  }

  function coordinateKey(value) { return Number(value).toFixed(6); }

  function normalizeProject(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      name:text(source.name, '計畫名稱', false),
      no:text(source.no, '計畫編號', false),
      designer:text(source.designer, '設計人員', false),
    };
  }

  function normalizeLoadComponentInputSource(raw) {
    if (raw == null) return null;
    const input = object(raw, '基本載重匯入來源');
    if (text(input.schemaVersion, '基本載重匯入 schema') !== 'loadcombo-components-v1') {
      throw new Error('基本載重匯入 schema 不相容。');
    }
    const generatedTime = new Date(text(input.generatedAt, '基本載重來源產出時間'));
    if (!Number.isFinite(generatedTime.getTime())) throw new Error('基本載重來源產出時間格式錯誤。');
    const sourceRaw = object(input.source, '基本載重來源');
    const source = {
      tool:text(sourceRaw.tool, '基本載重來源工具'),
      label:text(sourceRaw.label, '基本載重來源名稱'),
      version:text(sourceRaw.version, '基本載重來源版本', false),
      analysisId:text(sourceRaw.analysisId, '基本載重分析識別碼', false),
      caseSet:text(sourceRaw.caseSet, '基本載重工況集', false),
    };
    const sign = object(input.signConvention, '基本載重符號約定');
    if (sign.P !== 'compression-positive' || sign.Mx !== 'right-hand-rule' || sign.My !== 'right-hand-rule') {
      throw new Error('基本載重符號約定必須為 P 壓力正、Mx／My 右手定則。');
    }
    const transportRaw = object(input.transport, '基本載重傳遞資訊');
    const kind = text(transportRaw.kind, '基本載重傳遞方式');
    if (!['file', 'force-picker'].includes(kind)) throw new Error(`不支援的基本載重傳遞方式：${kind}。`);
    const contentSha256 = text(transportRaw.contentSha256, '基本載重來源 SHA-256').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(contentSha256)) throw new Error('基本載重來源 SHA-256 格式錯誤。');
    return {
      schemaVersion:'loadcombo-components-v1',
      generatedAt:generatedTime.toISOString(),
      source,
      signConvention:{ P:'compression-positive', Mx:'right-hand-rule', My:'right-hand-rule' },
      transport:{ kind, label:text(transportRaw.label, '基本載重傳遞標籤'), contentSha256 },
    };
  }

  function normalizeLoadCombinationSource(raw) {
    if (raw == null) return null;
    const source = object(raw, '載重組合來源');
    const mode = text(source.mode, '載重組合來源模式');
    if (mode === 'manual') return { mode, label:text(source.label || '手動因數化載重', '手動載重組合來源') };
    if (mode !== 'auto-lrfd') throw new Error(`不支援的載重組合來源模式：${mode}。`);
    if (String(source.method || '').toUpperCase() !== 'LRFD') throw new Error('自動載重組合來源必須為 LRFD。');
    const rawForces = object(source.inputForces, '基本載重分量');
    const inputForces = {};
    ['Pu','Mux','Muy'].forEach(forceKey => {
      const force = object(rawForces[forceKey], `${forceKey} 基本載重分量`);
      inputForces[forceKey] = {};
      ['D','L','W','E'].forEach(loadKey => {
        inputForces[forceKey][loadKey] = finite(force[loadKey], `${forceKey}.${loadKey}`);
      });
    });
    return {
      mode,
      schema:text(source.schema, '樁帽載重組合轉接 schema'),
      method:'LRFD',
      loadComboSchema:text(source.loadComboSchema, '共用載重組合 schema'),
      inputForces,
      inputSource:normalizeLoadComponentInputSource(source.inputSource),
    };
  }

  function expectedCoordinates(count, spacing) {
    return Array.from({ length:count }, (_, index) => (index - (count - 1) / 2) * spacing);
  }

  function sameCoordinates(actual, expected) {
    if (actual.length !== expected.length) return false;
    return actual.every((value, index) => close(value, expected[index], 0.001, 0));
  }

  function normalizePayload(raw) {
    const payload = object(parse(raw), '樁帽三維 STM 檔');
    const payloadSchema = text(payload.schema, '樁帽三維 STM schema');
    if (!SUPPORTED_SCHEMAS.has(payloadSchema)) throw new Error(`樁帽三維 STM schema 不相容：${payload.schema || '缺少'}。`);

    const generatedAt = text(payload.generatedAt, '產出時間');
    const generatedTime = Date.parse(generatedAt);
    if (!Number.isFinite(generatedTime)) throw new Error('產出時間不是有效 ISO 日期時間。');
    if (generatedTime > Date.now() + 5 * 60 * 1000) throw new Error('產出時間不得晚於目前時間 5 分鐘以上。');

    const sourceRaw = object(payload.source, '來源');
    const sourceTool = text(sourceRaw.tool, '來源工具');
    const sourceVersion = text(sourceRaw.version, '來源工具版本');
    if (sourceTool !== SOURCE_TOOL || sourceVersion !== SOURCE_VERSION) {
      throw new Error(`來源工具必須為 ${SOURCE_TOOL} ${SOURCE_VERSION}。`);
    }
    const calculationFingerprint = text(sourceRaw.calculationFingerprint, '來源計算指紋').toUpperCase();
    if (!/^CF-[0-9A-F]{16}$/.test(calculationFingerprint)) throw new Error('來源計算指紋格式錯誤。');

    const units = object(payload.units, '單位');
    if (units.length !== 'cm' || units.force !== 'tf' || units.moment !== 'tf·m' || units.stress !== 'kgf/cm²') {
      throw new Error('單位必須為 cm、tf、tf·m、kgf/cm²。');
    }

    const modelRaw = object(payload.model, '樁帽模型');
    const capRaw = object(modelRaw.cap, '樁帽幾何');
    const columnRaw = object(modelRaw.column, '柱／基座幾何');
    const pileRaw = object(modelRaw.pile, '樁群幾何');
    const materialsRaw = object(modelRaw.materials, '材料');
    const reinforcementRaw = object(modelRaw.reinforcement, '配筋候選');

    const cap = {
      lengthXCm:positive(capRaw.lengthXCm, '樁帽 X 向長度'),
      widthYCm:positive(capRaw.widthYCm, '樁帽 Y 向寬度'),
      thicknessCm:positive(capRaw.thicknessCm, '樁帽厚度'),
      coverCm:nonnegative(capRaw.coverCm, '樁帽保護層'),
    };
    const column = {
      xCm:positive(columnRaw.xCm, '柱／基座 X 尺寸'),
      yCm:positive(columnRaw.yCm, '柱／基座 Y 尺寸'),
    };
    if (column.xCm > cap.lengthXCm + EPS || column.yCm > cap.widthYCm + EPS) throw new Error('柱／基座尺寸不得大於樁帽。');

    const pile = {
      countX:positiveInteger(pileRaw.countX, 'X 向樁數'),
      countY:positiveInteger(pileRaw.countY, 'Y 向樁數'),
      spacingXCm:positive(pileRaw.spacingXCm, 'X 向樁距'),
      spacingYCm:positive(pileRaw.spacingYCm, 'Y 向樁距'),
      diameterCm:positive(pileRaw.diameterCm, '樁徑'),
    };
    if (pile.countX < 2 || pile.countY < 2) throw new Error('三維 STM 僅接受 X、Y 向均至少 2 支樁的完整矩形樁群。');

    const materials = {
      fcKgCm2:positive(materialsRaw.fcKgCm2, "fc'"),
      fyKgCm2:positive(materialsRaw.fyKgCm2, 'fy'),
      lambda:positive(materialsRaw.lambda, 'λ'),
    };
    if (materials.lambda > 1 + EPS) throw new Error('λ 不得大於 1.0。');
    const reinforcement = {
      barNo:text(reinforcementRaw.barNo, '樁帽主筋號數'),
      countEachDirection:positiveInteger(reinforcementRaw.countEachDirection, '每方向樁帽主筋支數'),
      sourceRequiredAreaCm2:positive(reinforcementRaw.sourceRequiredAreaCm2, '基礎工具樁帽需求鋼筋量'),
      sourceProvidedAreaCm2:positive(reinforcementRaw.sourceProvidedAreaCm2, '基礎工具樁帽提供鋼筋量'),
    };
    if (!/^#(?:3|4|5|6|7|8|9|10|11)$/.test(reinforcement.barNo)) throw new Error('樁帽主筋號數不受支援。');

    function normalizeLoadCase(rawCase, index) {
      const sourceCase = object(rawCase, `第 ${index + 1} 組載重`);
      const loadsRaw = object(sourceCase.loads, `第 ${index + 1} 組載重值`);
      const loads = {
        PuTf:positive(loadsRaw.PuTf, `第 ${index + 1} 組 Pu`),
        MuxTfm:finite(loadsRaw.MuxTfm, `第 ${index + 1} 組 Mux`),
        MuyTfm:finite(loadsRaw.MuyTfm, `第 ${index + 1} 組 Muy`),
        combination:text(loadsRaw.combination, `第 ${index + 1} 組載重組合`),
      };
      if (!Array.isArray(sourceCase.reactions)) throw new Error(`第 ${index + 1} 組各樁反力必須是陣列。`);
      const reactions = sourceCase.reactions.map((rawReaction, reactionIndex) => {
        const reaction = object(rawReaction, `第 ${index + 1} 組第 ${reactionIndex + 1} 支樁反力`);
        return {
          id:text(reaction.id, `第 ${index + 1} 組第 ${reactionIndex + 1} 支樁編號`),
          xCm:finite(reaction.xCm, `第 ${index + 1} 組第 ${reactionIndex + 1} 支樁 X 座標`),
          yCm:finite(reaction.yCm, `第 ${index + 1} 組第 ${reactionIndex + 1} 支樁 Y 座標`),
          reactionTf:positive(reaction.reactionTf, `第 ${index + 1} 組第 ${reactionIndex + 1} 支樁反力`),
        };
      });
      if (reactions.length !== pile.countX * pile.countY) throw new Error(`第 ${index + 1} 組樁反力數量與樁群列數不一致。`);
      const ids = new Set(reactions.map(item => item.id));
      const positions = new Set(reactions.map(item => `${coordinateKey(item.xCm)}|${coordinateKey(item.yCm)}`));
      if (ids.size !== reactions.length || positions.size !== reactions.length) throw new Error(`第 ${index + 1} 組樁編號或樁座標重複。`);
      const xCoordinates = [...new Set(reactions.map(item => item.xCm))].sort((a, b) => a - b);
      const yCoordinates = [...new Set(reactions.map(item => item.yCm))].sort((a, b) => a - b);
      if (!sameCoordinates(xCoordinates, expectedCoordinates(pile.countX, pile.spacingXCm))
        || !sameCoordinates(yCoordinates, expectedCoordinates(pile.countY, pile.spacingYCm))) {
        throw new Error(`第 ${index + 1} 組樁座標與樁數／樁距不一致。`);
      }
      for (const y of yCoordinates) for (const x of xCoordinates) {
        if (!positions.has(`${coordinateKey(x)}|${coordinateKey(y)}`)) throw new Error(`第 ${index + 1} 組樁群有缺角或不完整座標。`);
      }
      if (reactions.some(item => Math.abs(item.xCm) + pile.diameterCm / 2 > cap.lengthXCm / 2 + EPS)) throw new Error(`第 ${index + 1} 組樁圓超出樁帽 X 向邊界。`);
      if (reactions.some(item => Math.abs(item.yCm) + pile.diameterCm / 2 > cap.widthYCm / 2 + EPS)) throw new Error(`第 ${index + 1} 組樁圓超出樁帽 Y 向邊界。`);

      const total = reactions.reduce((sum, item) => sum + item.reactionTf, 0);
      const momentX = reactions.reduce((sum, item) => sum + item.reactionTf * item.yCm, 0);
      const momentY = reactions.reduce((sum, item) => sum + item.reactionTf * item.xCm, 0);
      if (!close(total, loads.PuTf, 0.01)) throw new Error(`第 ${index + 1} 組樁反力合計 ${total} tf 與 Pu ${loads.PuTf} tf 不平衡。`);
      if (!close(momentX, loads.MuxTfm * 100, 0.1)) throw new Error(`第 ${index + 1} 組樁反力繞 X 軸力矩與 Mux 不平衡。`);
      if (!close(momentY, loads.MuyTfm * 100, 0.1)) throw new Error(`第 ${index + 1} 組樁反力繞 Y 軸力矩與 Muy 不平衡。`);
      const loadX = loads.MuyTfm * 100 / loads.PuTf;
      const loadY = loads.MuxTfm * 100 / loads.PuTf;
      if (Math.abs(loadX) > column.xCm / 2 + EPS || Math.abs(loadY) > column.yCm / 2 + EPS) {
        throw new Error(`第 ${index + 1} 組載重合力節點超出柱／基座承壓面，不符合此三維 STM 橋接範圍。`);
      }
      return {
        id:text(sourceCase.id || `LC${index + 1}`, `第 ${index + 1} 組識別碼`),
        combination:loads.combination,
        loads,
        reactions,
      };
    }

    const rawCases = payloadSchema === LEGACY_SCHEMA
      ? [{ id:'LC1', loads:object(modelRaw.loads, '載重'), reactions:modelRaw.reactions }]
      : modelRaw.loadCases;
    if (!Array.isArray(rawCases) || rawCases.length < 1 || rawCases.length > 24) throw new Error('載重組合須為 1 至 24 組。');
    const loadCases = rawCases.map(normalizeLoadCase);
    const caseIds = new Set(loadCases.map(item => item.id));
    const caseNames = new Set(loadCases.map(item => item.combination));
    if (caseIds.size !== loadCases.length) throw new Error('載重組合識別碼不得重複。');
    if (caseNames.size !== loadCases.length) throw new Error('載重組合名稱不得重複。');
    const primaryCase = loadCases[0];
    const loadCombinationSource = normalizeLoadCombinationSource(modelRaw.loadCombinationSource);

    return {
      schema:payloadSchema,
      generatedAt:new Date(generatedTime).toISOString(),
      source:{
        tool:SOURCE_TOOL,
        title:text(sourceRaw.title, '來源工具名稱'),
        version:SOURCE_VERSION,
        calculationFingerprint,
      },
      project:normalizeProject(payload.project),
      units:{ length:'cm', force:'tf', moment:'tf·m', stress:'kgf/cm²' },
      model:{
        cap, column, pile, materials, reinforcement, loadCases, loadCombinationSource,
        // Aliases keep existing v1 consumers working while v2 consumers use loadCases.
        loads:primaryCase.loads,
        reactions:primaryCase.reactions,
      },
    };
  }

  function buildPayload(snapshot, options = {}) {
    const source = object(snapshot, '基礎工具計算快照');
    if (source.tab !== 'pile') throw new Error('基礎工具必須位於樁基／樁帽分頁。');
    if (!Array.isArray(source.xs) || !Array.isArray(source.ys) || !Array.isArray(source.pileReactions)) {
      throw new Error('基礎工具計算快照缺少樁位或樁反力。');
    }
    if (source.xs.length !== source.ys.length || source.xs.length !== source.pileReactions.length) {
      throw new Error('基礎工具樁位與樁反力數量不一致。');
    }
    const positionsFor = reactions => reactions.map((reaction, index) => {
      if (reaction && typeof reaction === 'object') {
        return {
          id:reaction.id || `P${index + 1}`,
          xCm:reaction.xCm == null ? source.xs[index] : reaction.xCm,
          yCm:reaction.yCm == null ? source.ys[index] : reaction.yCm,
          reactionTf:reaction.reactionTf == null ? reaction.reaction : reaction.reactionTf,
        };
      }
      return { id:`P${index + 1}`, xCm:source.xs[index], yCm:source.ys[index], reactionTf:reaction };
    });
    const primaryCase = {
      id:'LC1',
      loads:{
        PuTf:source.Pu_tf,
        MuxTfm:source.Mx,
        MuyTfm:source.My,
        combination:options.primaryCombination || '1.2D + 1.6L + 1.0E',
      },
      reactions:positionsFor(source.pileReactions),
    };
    const additionalCases = Array.isArray(options.loadCases) ? options.loadCases.map((item, index) => {
      const candidate = object(item, `附加載重組合 ${index + 1}`);
      return {
        id:candidate.id || `LC${index + 2}`,
        loads:{
          PuTf:candidate.PuTf,
          MuxTfm:candidate.MuxTfm,
          MuyTfm:candidate.MuyTfm,
          combination:candidate.combination,
        },
        reactions:positionsFor(candidate.reactions),
      };
    }) : [];
    const raw = {
      schema:SCHEMA,
      generatedAt:options.generatedAt || new Date().toISOString(),
      source:{
        tool:SOURCE_TOOL,
        title:'基礎 Foundation 設計／檢核',
        version:SOURCE_VERSION,
        calculationFingerprint:options.calculationFingerprint,
      },
      project:normalizeProject(options.project),
      units:{ length:'cm', force:'tf', moment:'tf·m', stress:'kgf/cm²' },
      model:{
        cap:{ lengthXCm:source.Lc, widthYCm:source.Bc, thicknessCm:source.hc, coverCm:source.pcCover },
        column:{ xCm:source.c1, yCm:source.c2 },
        pile:{ countX:source.pileNL, countY:source.pileNB, spacingXCm:source.pileSL, spacingYCm:source.pileSB, diameterCm:source.pileD },
        materials:{ fcKgCm2:source.fc, fyKgCm2:source.fy, lambda:source.lambda == null ? 1 : source.lambda },
        reinforcement:{ barNo:source.barNo, countEachDirection:source.nBar, sourceRequiredAreaCm2:source.capAsReq, sourceProvidedAreaCm2:source.capAsProv },
        loadCases:[primaryCase, ...additionalCases],
        loadCombinationSource:options.loadCombinationSource || { mode:'manual', label:'頁面目前結果與自訂因數化載重' },
      },
    };
    return normalizePayload(raw);
  }

  function resolveLoadCase(payload, reference = 0) {
    const cases = payload.model.loadCases;
    if (typeof reference === 'string') {
      const found = cases.find(item => item.id === reference);
      if (!found) throw new Error(`找不到載重組合 ${reference}。`);
      return found;
    }
    const index = Number(reference);
    if (!Number.isInteger(index) || index < 0 || index >= cases.length) throw new Error('載重組合索引超出範圍。');
    return cases[index];
  }

  function toToolFields(raw, loadCaseReference = 0) {
    const payload = normalizePayload(raw);
    const { cap, column, pile, materials, reinforcement } = payload.model;
    const { loads, reactions } = resolveLoadCase(payload, loadCaseReference);
    return {
      projName:payload.project.name,
      projNo:payload.project.no,
      projDesigner:payload.project.designer,
      capLengthX:cap.lengthXCm,
      capWidthY:cap.widthYCm,
      h:cap.thicknessCm,
      columnX:column.xCm,
      columnY:column.yCm,
      loadNodeDepth:Math.min(20, cap.thicknessCm * 0.2),
      pileDiameter:pile.diameterCm,
      Pu:loads.PuTf,
      Mx:loads.MuxTfm,
      My:loads.MuyTfm,
      pileReactions:reactions.map(item => `${item.id}, ${item.xCm}, ${item.yCm}, ${item.reactionTf}`).join('\n'),
      fc:materials.fcKgCm2,
      fy:materials.fyKgCm2,
      lambda:materials.lambda,
      xTieBar:reinforcement.barNo,
      yTieBar:reinforcement.barNo,
      xTieCount:reinforcement.countEachDirection,
      yTieCount:reinforcement.countEachDirection,
      xTieCover:cap.coverCm,
      yTieCover:cap.coverCm,
    };
  }

  function toolFieldMismatches(raw, current, loadCaseReference = 0) {
    const expected = toToolFields(raw, loadCaseReference);
    const actual = object(current, '目前三維 STM 輸入');
    const mismatches = [];
    const numeric = ['capLengthX','capWidthY','h','columnX','columnY','pileDiameter','Pu','Mx','My','fc','fy','lambda'];
    numeric.forEach(key => {
      if (!close(finite(actual[key], key), expected[key], key === 'Mx' || key === 'My' ? 0.001 : 0.01)) mismatches.push(key);
    });
    const normalized = normalizePayload(raw);
    const expectedReactions = resolveLoadCase(normalized, loadCaseReference).reactions;
    let actualReactions;
    try {
      actualReactions = String(actual.pileReactions || '').trim().split(/\r?\n/).filter(Boolean).map((line, index) => {
        const parts = line.trim().split(/[\s,，;；\t]+/).filter(Boolean);
        if (parts.length !== 4) throw new Error(`第 ${index + 1} 列格式錯誤`);
        return { id:parts[0], xCm:Number(parts[1]), yCm:Number(parts[2]), reactionTf:Number(parts[3]) };
      });
    } catch (_) {
      mismatches.push('pileReactions');
      return mismatches;
    }
    if (actualReactions.length !== expectedReactions.length || actualReactions.some((item, index) => {
      const expectedItem = expectedReactions[index];
      return item.id !== expectedItem.id || !close(item.xCm, expectedItem.xCm, 0.001, 0)
        || !close(item.yCm, expectedItem.yCm, 0.001, 0) || !close(item.reactionTf, expectedItem.reactionTf, 0.01);
    })) mismatches.push('pileReactions');
    return [...new Set(mismatches)];
  }

  return {
    schema:SCHEMA,
    legacySchema:LEGACY_SCHEMA,
    sourceTool:SOURCE_TOOL,
    sourceVersion:SOURCE_VERSION,
    transferStorageKey:TRANSFER_STORAGE_KEY,
    normalizePayload,
    validatePayload:normalizePayload,
    buildPayload,
    resolveLoadCase(raw, reference = 0) { return resolveLoadCase(normalizePayload(raw), reference); },
    listLoadCases(raw) {
      return normalizePayload(raw).model.loadCases.map(item => ({
        id:item.id,
        combination:item.combination,
        PuTf:item.loads.PuTf,
        MuxTfm:item.loads.MuxTfm,
        MuyTfm:item.loads.MuyTfm,
      }));
    },
    toToolFields,
    toolFieldMismatches,
  };
});
