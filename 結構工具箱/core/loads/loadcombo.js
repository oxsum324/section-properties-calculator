/* core/loads/loadcombo.js
 * 載重組合產生器 — Taiwan 112 規範 (含風力 W)
 *
 * LRFD 簡化組合：
 *   1.4D
 *   1.2D + 1.6L
 *   1.2D + 1.0L + 1.0W   /  - 1.0W
 *   1.2D + 1.0L + 1.0E   /  - 1.0E
 *   0.9D + 1.0W          /  - 1.0W
 *   0.9D + 1.0E          /  - 1.0E
 *
 * ASD / 使用荷重簡化組合：
 *   D
 *   D + L
 *   D + 0.75L + 0.75W    /  - 0.75W
 *   D + 0.75L + 0.75E    /  - 0.75E
 *   0.6D + 0.6W          /  - 0.6W
 *   0.6D + 0.7E          /  - 0.7E
 */
(function () {
  const TUPLE_SCHEMA_VERSION = 'loadcombo-tuples-v2';
  const LIMIT_STATE_SCHEMA_VERSION = 'loadcombo-limit-states-v1';
  const LOAD_CASE_KEYS = ['D', 'L', 'W', 'E'];
  let targetWriteDepth = 0;

  const LRFD_COMBOS = [
    { name:'1.4D',                D:1.4, L:0,    W:0,     E:0    },
    { name:'1.2D+1.6L',           D:1.2, L:1.6,  W:0,     E:0    },
    { name:'1.2D+1.0L+1.0W',      D:1.2, L:1.0,  W:1.0,   E:0    },
    { name:'1.2D+1.0L-1.0W',      D:1.2, L:1.0,  W:-1.0,  E:0    },
    { name:'1.2D+1.0L+1.0E',      D:1.2, L:1.0,  W:0,     E:1.0  },
    { name:'1.2D+1.0L-1.0E',      D:1.2, L:1.0,  W:0,     E:-1.0 },
    { name:'0.9D+1.0W',           D:0.9, L:0,    W:1.0,   E:0    },
    { name:'0.9D-1.0W',           D:0.9, L:0,    W:-1.0,  E:0    },
    { name:'0.9D+1.0E',           D:0.9, L:0,    W:0,     E:1.0  },
    { name:'0.9D-1.0E',           D:0.9, L:0,    W:0,     E:-1.0 },
  ];

  const ASD_COMBOS = [
    { name:'D',                   D:1.0, L:0,    W:0,     E:0    },
    { name:'D+L',                 D:1.0, L:1.0,  W:0,     E:0    },
    { name:'D+0.75L+0.75W',       D:1.0, L:0.75, W:0.75,  E:0    },
    { name:'D+0.75L-0.75W',       D:1.0, L:0.75, W:-0.75, E:0    },
    { name:'D+0.75L+0.75E',       D:1.0, L:0.75, W:0,     E:0.75 },
    { name:'D+0.75L-0.75E',       D:1.0, L:0.75, W:0,     E:-0.75 },
    { name:'0.6D+0.6W',           D:0.6, L:0,    W:0.6,   E:0    },
    { name:'0.6D-0.6W',           D:0.6, L:0,    W:-0.6,  E:0    },
    { name:'0.6D+0.7E',           D:0.6, L:0,    W:0,     E:0.7  },
    { name:'0.6D-0.7E',           D:0.6, L:0,    W:0,     E:-0.7 },
  ];

  function getMethod(cfg) {
    if (typeof cfg.getMethod === 'function') return cfg.getMethod() || 'LRFD';
    return cfg.method || 'LRFD';
  }

  function getComboSet(cfg) {
    const normalizedCfg = typeof cfg === 'string' ? { method:cfg } : (cfg || {});
    const requestedMethod = String(getMethod(normalizedCfg)).toUpperCase();
    const method = requestedMethod === 'ASD' ? 'ASD' : 'LRFD';
    const combos = method === 'ASD' ? ASD_COMBOS : LRFD_COMBOS;
    return {
      method,
      name: method === 'ASD' ? 'ASD / 使用荷重組合' : 'LRFD / 因數化載重組合',
      combos: combos.map(combo => ({ ...combo })),
    };
  }

  function toFiniteNumber(value) {
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function clonePlainData(value, seen) {
    if (!value || typeof value !== 'object') return value;
    const visited = seen || new WeakMap();
    if (visited.has(value)) return visited.get(value);
    if (Array.isArray(value)) {
      const output = [];
      visited.set(value, output);
      value.forEach(item => output.push(clonePlainData(item, visited)));
      return output;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    const output = {};
    visited.set(value, output);
    Object.keys(value).forEach(key => {
      output[key] = clonePlainData(value[key], visited);
    });
    return output;
  }

  function normalizeForceInputs(forces) {
    const entries = Array.isArray(forces)
      ? forces.map((force, index) => [String(force?.key || force?.name || index), force || {}])
      : Object.entries(forces || {});
    const normalized = {};
    for (const [forceKey, rawInput] of entries) {
      const source = rawInput || {};
      normalized[forceKey] = {};
      LOAD_CASE_KEYS.forEach(loadCase => {
        normalized[forceKey][loadCase] = toFiniteNumber(source[loadCase]);
      });
    }
    return normalized;
  }

  /**
   * 計算每一個載重組合的完整內力向量，不讀取或修改 DOM。
   *
   * @param {Object} options
   * @param {'LRFD'|'ASD'} [options.method='LRFD']
   * @param {Object|Array} options.forces - 例如 { P:{D,L,W,E}, Mx:{D,L,W,E} }
   * @param {*} [options.source] - 分析模型、匯入批次或單位等來源追溯資料
   */
  function computeTuples(options) {
    const cfg = options || {};
    const method = String(cfg.method || 'LRFD').toUpperCase() === 'ASD' ? 'ASD' : 'LRFD';
    const comboSet = getComboSet(method);
    const inputForces = normalizeForceInputs(cfg.forces);
    const source = cfg.source === undefined ? null : clonePlainData(cfg.source);
    const tuples = comboSet.combos.map((combo, index) => {
      const values = {};
      for (const forceKey of Object.keys(inputForces)) {
        const force = inputForces[forceKey];
        values[forceKey] = LOAD_CASE_KEYS.reduce(
          (sum, loadCase) => sum + combo[loadCase] * force[loadCase],
          0
        );
      }
      return {
        index,
        name: combo.name,
        method,
        factors: {
          D: combo.D,
          L: combo.L,
          W: combo.W,
          E: combo.E,
        },
        values,
      };
    });
    return {
      schemaVersion: TUPLE_SCHEMA_VERSION,
      method,
      comboName: comboSet.name,
      inputForces,
      source,
      tuples,
    };
  }

  function getTupleByName(tupleResultOrDetail, comboName) {
    const container = tupleResultOrDetail || {};
    const tuples = Array.isArray(container)
      ? container
      : (Array.isArray(container.tuples) ? container.tuples : container.combos);
    if (!Array.isArray(tuples)) return null;
    const tuple = tuples.find(item => item && item.name === comboName);
    if (!tuple) return null;
    const method = tuple.method || container.method || null;
    const comboSet = method ? getComboSet(method) : null;
    const combo = comboSet?.combos.find(item => item.name === tuple.name);
    return {
      index: Number.isInteger(tuple.index) ? tuple.index : tuples.indexOf(tuple),
      name: tuple.name,
      method,
      factors: tuple.factors
        ? clonePlainData(tuple.factors)
        : (combo ? { D:combo.D, L:combo.L, W:combo.W, E:combo.E } : null),
      values: clonePlainData(tuple.values || {}),
    };
  }

  /**
   * 由呼叫端提供評分函式，從完整內力向量中選出控制組合。
   * 評分函式可回傳數值，或 { score, ...details }；預設取最大分數。
   */
  function selectGoverningTuple(tupleResult, scorer, options) {
    if (typeof scorer !== 'function') throw new TypeError('scorer must be a function');
    const tupleSet = Array.isArray(tupleResult)
      ? { tuples: tupleResult, method: null, inputForces: null, source: null }
      : (tupleResult || {});
    const tuples = Array.isArray(tupleSet.tuples)
      ? tupleSet.tuples
      : (Array.isArray(tupleSet.combos) ? tupleSet.combos : []);
    const direction = options?.direction === 'min' ? 'min' : 'max';
    const evaluations = [];
    let best = null;

    tuples.forEach((tuple, index) => {
      const rawEvaluation = scorer(tuple, index, tupleSet);
      const isObjectResult = rawEvaluation && typeof rawEvaluation === 'object';
      const score = Number(isObjectResult ? rawEvaluation.score : rawEvaluation);
      const details = isObjectResult ? clonePlainData(rawEvaluation) : null;
      if (details) delete details.score;
      const eligible = Number.isFinite(score);
      evaluations.push({
        index,
        name: tuple.name,
        score: eligible ? score : null,
        details,
        eligible,
      });
      if (!eligible) return;
      if (!best || (direction === 'min' ? score < best.score : score > best.score)) {
        best = { tuple, score, details, index };
      }
    });

    if (!best) {
      return {
        method: tupleSet.method || null,
        source: clonePlainData(tupleSet.source),
        inputForces: clonePlainData(tupleSet.inputForces),
        governing: null,
        score: null,
        details: null,
        evaluations,
      };
    }
    return {
      method: tupleSet.method || best.tuple.method || null,
      source: clonePlainData(tupleSet.source),
      inputForces: clonePlainData(tupleSet.inputForces),
      governing: getTupleByName(tupleSet, best.tuple.name) || clonePlainData(best.tuple),
      score: best.score,
      details: clonePlainData(best.details),
      evaluations,
    };
  }

  function getLimitStateComponent(tuple, term) {
    const value = Number(tuple?.values?.[term.forceKey]);
    if (!Number.isFinite(value)) return null;
    if (term.component === 'positive') return Math.max(value, 0);
    if (term.component === 'negative') return Math.max(-value, 0);
    if (term.component === 'signed') return value;
    return Math.abs(value);
  }

  function getEnvelopeScale(tuples, term) {
    return tuples.reduce((maximum, tuple) => {
      const component = getLimitStateComponent(tuple, term);
      return Number.isFinite(component) ? Math.max(maximum, Math.abs(component)) : maximum;
    }, 0);
  }

  function buildLimitStateScorer(definition, tuples) {
    const criterion = String(definition?.criterion || 'abs').trim().toLowerCase();
    if (typeof definition?.scorer === 'function') {
      return {
        criterion: 'custom',
        criterionLabel: definition.criterionLabel || '專用工程評分函式',
        scorer: definition.scorer,
        activeTerms: [],
      };
    }

    const forceKey = String(definition?.forceKey || '').trim();
    if (['max', 'min', 'abs', 'positive', 'negative'].includes(criterion)) {
      if (!forceKey) throw new TypeError(`limit state ${definition?.key || ''} requires forceKey`);
      const labels = {
        max: `${forceKey} 最大值`,
        min: `${forceKey} 最小值`,
        abs: `|${forceKey}| 最大值`,
        positive: `${forceKey} 正向最大值`,
        negative: `${forceKey} 負向最大幅值`,
      };
      return {
        criterion,
        criterionLabel: definition.criterionLabel || labels[criterion],
        activeTerms: [{ forceKey, component: criterion }],
        scorer(tuple) {
          const value = Number(tuple?.values?.[forceKey]);
          if (!Number.isFinite(value)) return NaN;
          if (criterion === 'min' || criterion === 'negative') return -value;
          if (criterion === 'abs') return Math.abs(value);
          if (criterion === 'positive') return value;
          return value;
        },
      };
    }

    if (criterion !== 'normalized-srss') {
      throw new TypeError(`unsupported limit state criterion: ${criterion}`);
    }
    const terms = (Array.isArray(definition?.terms) ? definition.terms : []).map(term => ({
      forceKey: String(term?.forceKey || '').trim(),
      component: ['positive', 'negative', 'signed'].includes(term?.component) ? term.component : 'abs',
      weight: Number.isFinite(Number(term?.weight)) ? Math.abs(Number(term.weight)) : 1,
      requestedScale: term?.scale,
    })).filter(term => term.forceKey && term.weight > 0);
    if (!terms.length) throw new TypeError(`limit state ${definition?.key || ''} requires normalized-srss terms`);
    const activeTerms = terms.map(term => {
      const numericScale = Number(term.requestedScale);
      const scale = Number.isFinite(numericScale) && numericScale > 0
        ? numericScale
        : getEnvelopeScale(tuples, term);
      return { ...term, scale };
    }).filter(term => Number.isFinite(term.scale) && term.scale > 0);
    return {
      criterion,
      criterionLabel: definition.criterionLabel || '各分量依本批次包絡正規化後之 SRSS 需求向量',
      activeTerms,
      scorer(tuple) {
        if (!activeTerms.length) return NaN;
        const squares = activeTerms.map(term => {
          const component = getLimitStateComponent(tuple, term);
          if (!Number.isFinite(component)) return NaN;
          return Math.pow(term.weight * component / term.scale, 2);
        });
        if (squares.some(value => !Number.isFinite(value))) return NaN;
        return Math.sqrt(squares.reduce((sum, value) => sum + value, 0));
      },
    };
  }

  /**
   * 依極限狀態定義自動篩選控制組合。每個結果仍保留一個完整有號 tuple；
   * 不會把不同極限狀態或不同組合的分量拼成不存在的內力向量。
   */
  function selectGoverningLimitStates(tupleResult, definitions, options) {
    const tupleSet = Array.isArray(tupleResult)
      ? { tuples:tupleResult, method:null, source:null }
      : (tupleResult || {});
    const tuples = Array.isArray(tupleSet.tuples)
      ? tupleSet.tuples
      : (Array.isArray(tupleSet.combos) ? tupleSet.combos : []);
    const tolerance = Number.isFinite(Number(options?.tieTolerance))
      ? Math.max(Number(options.tieTolerance), 0)
      : 1e-9;
    const states = (Array.isArray(definitions) ? definitions : []).map((definition, definitionIndex) => {
      const key = String(definition?.key || `state-${definitionIndex + 1}`).trim();
      const label = String(definition?.label || key).trim();
      const minimumScore = Number.isFinite(Number(definition?.minimumScore))
        ? Number(definition.minimumScore)
        : 1e-9;
      try {
        const built = buildLimitStateScorer(definition, tuples);
        const selected = selectGoverningTuple(tupleSet, built.scorer, { direction:'max' });
        const eligibleEvaluations = selected.evaluations.filter(item => item.eligible);
        const topScore = selected.score;
        const ties = Number.isFinite(topScore)
          ? eligibleEvaluations.filter(item => Math.abs(item.score - topScore) <= tolerance).map(item => item.name)
          : [];
        const hasDemand = selected.governing && Number.isFinite(topScore) && topScore > minimumScore;
        return {
          key,
          label,
          criterion: built.criterion,
          criterionLabel: built.criterionLabel,
          activeTerms: clonePlainData(built.activeTerms),
          governing: hasDemand ? selected.governing : null,
          score: hasDemand ? topScore : null,
          ties: hasDemand ? ties : [],
          evaluations: selected.evaluations,
          status: hasDemand ? 'recommended' : 'no-demand',
          reason: hasDemand ? '' : '目前輸入未形成可辨識的控制需求',
        };
      } catch (error) {
        return {
          key,
          label,
          criterion: String(definition?.criterion || ''),
          criterionLabel: String(definition?.criterionLabel || ''),
          activeTerms: [],
          governing: null,
          score: null,
          ties: [],
          evaluations: [],
          status: 'invalid',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    });
    return {
      schemaVersion: LIMIT_STATE_SCHEMA_VERSION,
      method: tupleSet.method || null,
      source: clonePlainData(tupleSet.source),
      states,
      pass: states.every(state => state.status !== 'invalid'),
    };
  }

  function usesTupleSelection(cfg) {
    return cfg?.tupleMode === 'select' && Array.isArray(cfg.forces) && cfg.forces.length > 1;
  }

  function usesLimitStateSuggestions(cfg) {
    return usesTupleSelection(cfg) && Array.isArray(cfg.limitStates) && cfg.limitStates.length > 0;
  }

  function formatSigned(value, digits = 2) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';
    const normalized = Math.abs(numeric) < Math.pow(10, -digits) / 2 ? 0 : numeric;
    return `${normalized > 0 ? '+' : ''}${normalized.toFixed(digits)}`;
  }

  function buildPanel(cfg) {
    const p = cfg.prefix;
    const comboSet = getComboSet(cfg);
    const tupleSelection = usesTupleSelection(cfg);
    const rows = cfg.forces.map(f => `
      <tr>
        <td style="padding:4px 6px; font-weight:600;">${f.label} <span class="hint" style="font-style:normal;">(${f.unit})</span></td>
        <td><input type="number" id="${p}_${f.key}_D" value="0" style="width:100%;"></td>
        <td><input type="number" id="${p}_${f.key}_L" value="0" style="width:100%;"></td>
        <td><input type="number" id="${p}_${f.key}_W" value="0" style="width:100%;"></td>
        <td><input type="number" id="${p}_${f.key}_E" value="0" style="width:100%;"></td>
        <td id="${p}_${f.key}_out" style="padding:4px 6px; font-weight:600; color:#1a3d5c;">—</td>
        <td id="${p}_${f.key}_gov" style="padding:4px 6px; color:#666; font-size:0.85em;">—</td>
      </tr>`).join('');
    const tupleRows = tupleSelection ? comboSet.combos.map((combo, index) => `
      <tr data-load-combo-row="${index}">
        <td style="padding:4px 6px; text-align:center;"><input type="radio" name="${p}_tupleSelect" id="${p}_tupleSelect_${index}" value="${index}" aria-label="採用 ${combo.name}"></td>
        <td style="padding:4px 6px; font-weight:600; white-space:nowrap;"><label for="${p}_tupleSelect_${index}">${combo.name}</label></td>
        ${cfg.forces.map(force => `<td id="${p}_tuple_${index}_${force.key}" style="padding:4px 6px; text-align:right; font-variant-numeric:tabular-nums;">${formatSigned(0)}</td>`).join('')}
      </tr>`).join('') : '';
    const limitStateRows = usesLimitStateSuggestions(cfg) ? cfg.limitStates.map((state, index) => `
      <tr data-limit-state-row="${index}">
        <td style="padding:4px 6px; font-weight:600;">${state.label || state.key || `檢核 ${index + 1}`}</td>
        <td id="${p}_limit_${index}_criterion" style="padding:4px 6px; color:#475569;">${state.criterionLabel || '依完整組合列自動篩選'}</td>
        <td id="${p}_limit_${index}_combo" style="padding:4px 6px; font-weight:600;">—</td>
        <td id="${p}_limit_${index}_score" style="padding:4px 6px; text-align:right; font-variant-numeric:tabular-nums;">—</td>
        <td style="padding:4px 6px; text-align:center;"><button type="button" id="${p}_limit_${index}_select" disabled style="padding:4px 10px;">選取此完整組合</button></td>
      </tr>`).join('') : '';
    return `
    <div class="hint" style="margin-bottom:6px;">目前使用 <strong>${comboSet.name}</strong>。輸入 D / L / W / E 各分量 (W 為風力，E 為地震力)。${tupleSelection ? '下方每列均為同一組合的完整有號內力；請選定一列後再套用，系統不會把不同列的控制分量自動拼接。' : '按下方按鈕產生主控組合並套用至設計欄位。'}</div>
    <div style="overflow-x:auto;">
    <table style="width:100%; border-collapse:collapse; font-size:0.92em;">
      <thead><tr style="background:#eef2f7;">
        <th style="padding:4px 6px; text-align:left;">力種</th>
        <th style="padding:4px;">D 靜載重</th>
        <th style="padding:4px;">L 活載重</th>
        <th style="padding:4px;">W 風力</th>
        <th style="padding:4px;">E 地震</th>
        <th style="padding:4px;">${tupleSelection ? '採用值' : '封包值'}</th>
        <th style="padding:4px;">${tupleSelection ? '採用組合' : '主控組合'}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
    ${tupleSelection ? `
    <div class="hint" style="margin:10px 0 6px;"><strong>完整組合列</strong>｜比較表僅供挑選，不會自動拼接各分量的控制值。</div>
    <div style="overflow-x:auto; max-height:320px;">
      <table style="width:100%; border-collapse:collapse; font-size:0.88em;">
        <thead><tr style="background:#eef2f7; position:sticky; top:0;">
          <th style="padding:4px 6px;">採用</th>
          <th style="padding:4px 6px; text-align:left;">真實組合列</th>
          ${cfg.forces.map(force => `<th style="padding:4px 6px;">${force.label}<br><span class="hint" style="font-style:normal;">${force.unit}</span></th>`).join('')}
        </tr></thead>
        <tbody>${tupleRows}</tbody>
      </table>
    </div>
    ${usesLimitStateSuggestions(cfg) ? `
    <div class="hint" style="margin:10px 0 6px;"><strong>控制組合建議（頁面輔助，不進計算書）</strong>｜每項建議都指向一列真實完整組合；不同極限狀態可有不同控制列，但不會拼成單一假想 tuple。</div>
    <div style="overflow-x:auto; max-width:100%; min-width:0;">
      <table style="width:100%; min-width:720px; border-collapse:collapse; font-size:0.88em;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:4px 6px; text-align:left;">極限狀態</th>
          <th style="padding:4px 6px; text-align:left;">篩選準則</th>
          <th style="padding:4px 6px; text-align:left;">建議完整組合</th>
          <th style="padding:4px 6px;">指標</th>
          <th style="padding:4px 6px;">動作</th>
        </tr></thead>
        <tbody>${limitStateRows}</tbody>
      </table>
    </div>` : ''}
    <div id="${p}_status" role="status" aria-live="polite" data-state="waiting" class="hint" style="margin-top:8px;">尚未選擇組合；未選定完整組合列前不得套用。</div>` : ''}
    <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
      <button type="button" id="${p}_btnApply" ${tupleSelection ? 'disabled' : ''} style="padding:6px 14px; background:#1a3d5c; color:#fff; border:0; border-radius:6px; cursor:pointer; font-family:inherit; font-weight:600;">${tupleSelection ? '套用所選完整組合' : '產生封包並套用'}</button>
      <button type="button" id="${p}_btnClear" style="padding:6px 14px; background:#f0f0f0; color:#333; border:0; border-radius:6px; cursor:pointer; font-family:inherit;">清除</button>
    </div>`;
  }

  function compute(cfg) {
    const p = cfg.prefix;
    const comboSet = getComboSet(cfg);
    const result = {};
    for (const f of cfg.forces) {
      const D = parseFloat(document.getElementById(`${p}_${f.key}_D`).value) || 0;
      const L = parseFloat(document.getElementById(`${p}_${f.key}_L`).value) || 0;
      const W = parseFloat(document.getElementById(`${p}_${f.key}_W`).value) || 0;
      const E = parseFloat(document.getElementById(`${p}_${f.key}_E`).value) || 0;
      let bestAbs = 0, bestVal = 0, bestName = '';
      for (const c of comboSet.combos) {
        const v = c.D * D + c.L * L + c.W * W + c.E * E;
        if (Math.abs(v) > bestAbs) {
          bestAbs = Math.abs(v);
          bestVal = v;
          bestName = c.name;
        }
      }
      result[f.key] = { D, L, W, E, value: bestVal, abs: bestAbs, governing: bestName, method: comboSet.method };
    }
    return result;
  }

  function computeDetailed(cfg) {
    const p = cfg.prefix;
    const comboSet = getComboSet(cfg);
    const combos = comboSet.combos.map(c => {
      const values = {};
      for (const f of cfg.forces) {
        const D = parseFloat(document.getElementById(`${p}_${f.key}_D`).value) || 0;
        const L = parseFloat(document.getElementById(`${p}_${f.key}_L`).value) || 0;
        const W = parseFloat(document.getElementById(`${p}_${f.key}_W`).value) || 0;
        const E = parseFloat(document.getElementById(`${p}_${f.key}_E`).value) || 0;
        values[f.key] = c.D * D + c.L * L + c.W * W + c.E * E;
      }
      return { name: c.name, values };
    });

    const envelope = {};
    for (const f of cfg.forces) {
      const series = combos.map(c => ({ name: c.name, value: c.values[f.key] }));
      const max = series.reduce((a, b) => b.value > a.value ? b : a, { name:'—', value:-Infinity });
      const min = series.reduce((a, b) => b.value < a.value ? b : a, { name:'—', value: Infinity });
      const abs = series.reduce((a, b) => Math.abs(b.value) > Math.abs(a.value) ? b : a, { name:'—', value:0 });
      envelope[f.key] = { max, min, abs, series };
    }
    return { method: comboSet.method, comboName: comboSet.name, combos, envelope };
  }

  function drawEnvelopeChart(canvas, detail, forceKey, options) {
    const series = detail?.envelope?.[forceKey]?.series;
    if (!canvas || !canvas.getContext || !Array.isArray(series) || !series.length) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = options?.width || canvas.clientWidth || 560;
    const cssHeight = options?.height || 220;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const pad = { top: 20, right: 16, bottom: 42, left: 58 };
    const plotW = cssWidth - pad.left - pad.right;
    const plotH = cssHeight - pad.top - pad.bottom;
    const values = series.map(s => s.value);
    const maxVal = Math.max(...values, 0);
    const minVal = Math.min(...values, 0);
    const span = Math.max(maxVal - minVal, 1e-6);
    const y = v => pad.top + (maxVal - v) / span * plotH;
    const x = i => pad.left + (series.length === 1 ? plotW / 2 : i * plotW / (series.length - 1));
    const zeroY = y(0);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(pad.left + plotW, zeroY);
    ctx.stroke();

    const env = detail.envelope[forceKey];
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(pad.left, y(env.max.value));
    ctx.lineTo(pad.left + plotW, y(env.max.value));
    ctx.moveTo(pad.left, y(env.min.value));
    ctx.lineTo(pad.left + plotW, y(env.min.value));
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#0f766e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((pt, i) => {
      const px = x(i), py = y(pt.value);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    series.forEach((pt, i) => {
      const px = x(i), py = y(pt.value);
      ctx.beginPath();
      ctx.fillStyle = Math.abs(pt.value) === Math.abs(env.abs.value) ? '#dc2626' : '#2563eb';
      ctx.arc(px, py, Math.abs(pt.value) === Math.abs(env.abs.value) ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#334155';
    ctx.font = '12px Segoe UI';
    ctx.textAlign = 'right';
    ctx.fillText(maxVal.toFixed(2), pad.left - 8, pad.top + 4);
    ctx.fillText('0', pad.left - 8, zeroY + 4);
    ctx.fillText(minVal.toFixed(2), pad.left - 8, pad.top + plotH + 4);

    ctx.textAlign = 'center';
    const labelStep = series.length > 6 ? 2 : 1;
    series.forEach((pt, i) => {
      if (i % labelStep !== 0) return;
      ctx.save();
      ctx.translate(x(i), cssHeight - 24);
      ctx.rotate(-Math.PI / 7);
      ctx.fillStyle = '#64748b';
      ctx.fillText(pt.name, 0, 0);
      ctx.restore();
    });
  }

  function setInlineStatus(cfg, message, state) {
    const status = document.getElementById(`${cfg.prefix}_status`);
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state || 'info';
    status.style.color = state === 'error' ? '#b91c1c' : (state === 'applied' ? '#166534' : '#475569');
  }

  function getSelectedTupleIndex(cfg) {
    const selected = document.querySelector(`input[name="${cfg.prefix}_tupleSelect"]:checked`);
    if (!selected) return -1;
    const index = Number(selected.value);
    return Number.isInteger(index) ? index : -1;
  }

  function computeTupleResultFromDom(cfg) {
    const forces = {};
    for (const force of cfg.forces || []) {
      forces[force.key] = {};
      LOAD_CASE_KEYS.forEach(loadCase => {
        forces[force.key][loadCase] = toFiniteNumber(
          document.getElementById(`${cfg.prefix}_${force.key}_${loadCase}`)?.value
        );
      });
    }
    return computeTuples({
      method: getComboSet(cfg).method,
      forces,
      source: typeof cfg.getTupleSource === 'function' ? cfg.getTupleSource() : null,
    });
  }

  function markTuplePending(cfg) {
    const stored = window.lastLoadCombo && window.lastLoadCombo[cfg.prefix];
    if (stored) stored.tuplePreserved = false;
    for (const force of cfg.forces || []) {
      const output = document.getElementById(`${cfg.prefix}_${force.key}_out`);
      const governing = document.getElementById(`${cfg.prefix}_${force.key}_gov`);
      if (output) output.textContent = '—';
      if (governing) governing.textContent = '待重新套用';
    }
  }

  function refreshLimitStateSuggestions(cfg, tupleResult) {
    if (!usesLimitStateSuggestions(cfg)) return null;
    const result = selectGoverningLimitStates(
      tupleResult || computeTupleResultFromDom(cfg),
      cfg.limitStates,
      cfg.limitStateOptions
    );
    window.lastLoadComboSuggestions = window.lastLoadComboSuggestions || {};
    window.lastLoadComboSuggestions[cfg.prefix] = clonePlainData(result);
    result.states.forEach((state, index) => {
      const criterion = document.getElementById(`${cfg.prefix}_limit_${index}_criterion`);
      const combo = document.getElementById(`${cfg.prefix}_limit_${index}_combo`);
      const score = document.getElementById(`${cfg.prefix}_limit_${index}_score`);
      const button = document.getElementById(`${cfg.prefix}_limit_${index}_select`);
      if (criterion) criterion.textContent = state.criterionLabel || '—';
      if (combo) {
        if (state.governing) {
          const otherTies = state.ties.filter(name => name !== state.governing.name);
          combo.textContent = `${state.governing.name}${otherTies.length ? `（另有 ${otherTies.join('、')} 平手）` : ''}`;
        } else {
          combo.textContent = state.status === 'invalid' ? `設定錯誤：${state.reason}` : '目前無控制需求';
        }
      }
      if (score) score.textContent = Number.isFinite(state.score) ? state.score.toFixed(3) : '—';
      if (button) {
        button.disabled = !state.governing;
        button.dataset.comboName = state.governing?.name || '';
        button.dataset.limitStateLabel = state.label;
      }
    });
    return result;
  }

  function selectSuggestedLimitState(cfg, stateIndex) {
    const result = window.lastLoadComboSuggestions && window.lastLoadComboSuggestions[cfg.prefix];
    const state = result?.states?.[stateIndex];
    if (!state?.governing) return null;
    const comboIndex = getComboSet(cfg).combos.findIndex(combo => combo.name === state.governing.name);
    if (comboIndex < 0) return null;
    const radios = document.querySelectorAll(`input[name="${cfg.prefix}_tupleSelect"]`);
    radios.forEach(radio => {
      radio.checked = Number(radio.value) === comboIndex;
      if (radio.checked) radio.setAttribute('checked', 'checked');
      else radio.removeAttribute('checked');
    });
    markTuplePending(cfg);
    const button = document.getElementById(`${cfg.prefix}_btnApply`);
    if (button) button.disabled = false;
    setInlineStatus(
      cfg,
      `已依「${state.label}」建議選取 ${state.governing.name}；請確認完整有號內力後再套用。`,
      'selected'
    );
    return state.governing;
  }

  function refreshTupleRows(cfg) {
    if (!usesTupleSelection(cfg)) return null;
    const detail = computeDetailed(cfg);
    detail.combos.forEach((combo, index) => {
      cfg.forces.forEach(force => {
        const cell = document.getElementById(`${cfg.prefix}_tuple_${index}_${force.key}`);
        if (cell) cell.textContent = formatSigned(combo.values[force.key]);
      });
    });
    const selectedIndex = getSelectedTupleIndex(cfg);
    const button = document.getElementById(`${cfg.prefix}_btnApply`);
    if (button) button.disabled = selectedIndex < 0;
    refreshLimitStateSuggestions(cfg, computeTupleResultFromDom(cfg));
    return detail;
  }

  function getTargetIdsForForce(cfg, force) {
    const configured = cfg.targetIds && cfg.targetIds[force.key];
    if (!configured) return [];
    return (Array.isArray(configured) ? configured : [configured])
      .map(target => typeof target === 'string' ? target : target?.id)
      .filter(Boolean);
  }

  function getAllTargetIds(cfg) {
    const ids = [];
    for (const force of cfg.forces || []) {
      getTargetIdsForForce(cfg, force).forEach(id => {
        if (!ids.includes(id)) ids.push(id);
      });
    }
    return ids;
  }

  function resolveTargetWrites(cfg, force, value, selectedTuple) {
    const targets = getTargetIdsForForce(cfg, force);
    if (!targets.length) return [];
    const numericValue = Number(value) || 0;
    const adapted = typeof cfg.targetAdapter === 'function'
      ? cfg.targetAdapter({ force, forceKey:force.key, value:numericValue, selectedTuple, targets:[...targets], cfg })
      : null;
    if (adapted == null) return targets.map(id => ({ id, value:numericValue }));
    if (typeof adapted === 'number') return targets.map(id => ({ id, value:adapted }));
    if (Array.isArray(adapted)) {
      return adapted.map((entry, index) => (
        entry && typeof entry === 'object'
          ? { id:entry.id || targets[index], value:Number(entry.value) || 0 }
          : { id:targets[index], value:Number(entry) || 0 }
      )).filter(entry => entry.id);
    }
    if (adapted && typeof adapted === 'object' && adapted.id) {
      return [{ id:adapted.id, value:Number(adapted.value) || 0 }];
    }
    if (adapted && typeof adapted === 'object') {
      return Object.entries(adapted).map(([id, adaptedValue]) => ({ id, value:Number(adaptedValue) || 0 }));
    }
    return [];
  }

  function getTargetReportMeta(cfg, targetId, force) {
    const configured = cfg.targetReportMeta && cfg.targetReportMeta[targetId];
    return {
      label: configured?.label || targetId,
      unit: configured?.unit ?? force?.unit ?? '',
      signed: configured?.signed === true,
    };
  }

  function writeTargetValue(cfg, force, value, selectedTuple) {
    const appliedWrites = [];
    for (const write of resolveTargetWrites(cfg, force, value, selectedTuple)) {
      const target = document.getElementById(write.id);
      if (!target) continue;
      targetWriteDepth += 1;
      try {
        target.value = Number(write.value).toFixed(3);
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      } finally {
        targetWriteDepth -= 1;
      }
      const reportMeta = getTargetReportMeta(cfg, write.id, force);
      const actualValue = Number(target.value);
      appliedWrites.push({
        forceKey: force.key,
        targetId: write.id,
        value: Number.isFinite(actualValue) ? actualValue : (Number(write.value) || 0),
        label: reportMeta.label,
        unit: reportMeta.unit,
        signed: reportMeta.signed,
      });
    }
    return appliedWrites;
  }

  function apply(cfg) {
    const p = cfg.prefix;
    const detail = computeDetailed(cfg);
    if (usesTupleSelection(cfg)) {
      const selectedIndex = getSelectedTupleIndex(cfg);
      const selectedDetail = detail.combos[selectedIndex];
      const combo = getComboSet(cfg).combos[selectedIndex];
      if (!selectedDetail || !combo) {
        setInlineStatus(cfg, '尚未套用：請先選擇一個完整組合列。', 'error');
        return null;
      }
      const selectedTuple = {
        schemaVersion: TUPLE_SCHEMA_VERSION,
        index: selectedIndex,
        name: selectedDetail.name,
        method: detail.method,
        factors: { D:combo.D, L:combo.L, W:combo.W, E:combo.E },
        values: clonePlainData(selectedDetail.values),
      };
      const adoptedWrites = [];
      for (const force of cfg.forces) {
        const value = Number(selectedTuple.values[force.key]) || 0;
        const output = document.getElementById(`${p}_${force.key}_out`);
        const governing = document.getElementById(`${p}_${force.key}_gov`);
        if (output) output.textContent = formatSigned(value);
        if (governing) governing.textContent = selectedTuple.name;
        adoptedWrites.push(...writeTargetValue(cfg, force, value, selectedTuple));
      }
      const env = compute(cfg);
      window.lastLoadCombo = window.lastLoadCombo || {};
      window.lastLoadCombo[p] = {
        method: detail.method,
        comboName: detail.comboName,
        tupleMode: 'select',
        env,
        detail,
        selectedTuple,
        adoptedWrites,
        tuplePreserved: true,
        forceMeta: cfg.forces.map(force => ({ key:force.key, label:force.label, unit:force.unit || '' })),
      };
      const vector = cfg.forces
        .map(force => `${force.key}=${formatSigned(selectedTuple.values[force.key])}${force.unit ? ` ${force.unit}` : ''}`)
        .join('，');
      setInlineStatus(cfg, `已套用 ${selectedTuple.name} 的完整有號內力：${vector}`, 'applied');
      if (typeof cfg.onApplied === 'function') cfg.onApplied(window.lastLoadCombo[p]);
      return selectedTuple;
    }

    const env = compute(cfg);
    for (const f of cfg.forces) {
      const r = env[f.key];
      document.getElementById(`${p}_${f.key}_out`).textContent = r.value.toFixed(2);
      document.getElementById(`${p}_${f.key}_gov`).textContent = r.governing || '—';
      writeTargetValue(cfg, f, r.value);
    }
    window.lastLoadCombo = window.lastLoadCombo || {};
    window.lastLoadCombo[p] = { method: getMethod(cfg), env, detail, tupleMode:'envelope', tuplePreserved:false };
    if (typeof cfg.onApplied === 'function') cfg.onApplied(window.lastLoadCombo[p]);
    return env;
  }

  function clear(cfg) {
    const p = cfg.prefix;
    for (const f of cfg.forces) {
      ['D','L','W','E'].forEach(k => {
        const input = document.getElementById(`${p}_${f.key}_${k}`);
        if (input) input.value = 0;
      });
      const output = document.getElementById(`${p}_${f.key}_out`);
      const governing = document.getElementById(`${p}_${f.key}_gov`);
      if (output) output.textContent = '—';
      if (governing) governing.textContent = '—';
    }
    if (usesTupleSelection(cfg)) {
      document.querySelectorAll(`input[name="${p}_tupleSelect"]`).forEach(radio => {
        radio.checked = false;
        radio.removeAttribute('checked');
      });
      refreshTupleRows(cfg);
      setInlineStatus(cfg, '尚未選擇組合；未選定完整組合列前不得套用。', 'waiting');
    }
    if (window.lastLoadCombo) delete window.lastLoadCombo[p];
  }

  function bind(cfg) {
    const p = cfg.prefix;
    const activeMethod = getComboSet(cfg).method;
    const storedAtBind = window.lastLoadCombo && window.lastLoadCombo[p];
    if (storedAtBind && storedAtBind.method !== activeMethod) delete window.lastLoadCombo[p];

    document.getElementById(`${p}_btnApply`)?.addEventListener('click', () => apply(cfg));
    document.getElementById(`${p}_btnClear`)?.addEventListener('click', () => clear(cfg));
    if (!usesTupleSelection(cfg)) return;

    const onSourceChanged = () => {
      markTuplePending(cfg);
      refreshTupleRows(cfg);
      const selectedIndex = getSelectedTupleIndex(cfg);
      const selected = selectedIndex >= 0 ? getComboSet(cfg).combos[selectedIndex] : null;
      setInlineStatus(
        cfg,
        selected ? `輸入已變更；已選 ${selected.name}，請重新套用完整組合。` : '輸入已變更；請選擇一個完整組合列。',
        'waiting'
      );
    };
    cfg.forces.forEach(force => {
      LOAD_CASE_KEYS.forEach(loadCase => {
        document.getElementById(`${p}_${force.key}_${loadCase}`)?.addEventListener('input', onSourceChanged);
      });
    });
    getAllTargetIds(cfg).forEach(targetId => {
      const target = document.getElementById(targetId);
      if (!target) return;
      const onTargetChanged = () => {
        if (targetWriteDepth > 0) return;
        markTuplePending(cfg);
        setInlineStatus(cfg, '設計外力已變更；原採用組合已失效，請重新選擇並套用。', 'waiting');
      };
      target.addEventListener('input', onTargetChanged);
      target.addEventListener('change', onTargetChanged);
    });
    document.querySelectorAll(`input[name="${p}_tupleSelect"]`).forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll(`input[name="${p}_tupleSelect"]`).forEach(item => {
          if (item.checked) item.setAttribute('checked', 'checked');
          else item.removeAttribute('checked');
        });
        markTuplePending(cfg);
        const button = document.getElementById(`${p}_btnApply`);
        if (button) button.disabled = false;
        const combo = getComboSet(cfg).combos[Number(radio.value)];
        setInlineStatus(cfg, `已選擇 ${combo?.name || '完整組合列'}；按「套用所選完整組合」後才會寫入設計外力。`, 'selected');
      });
    });
    if (usesLimitStateSuggestions(cfg)) {
      cfg.limitStates.forEach((state, index) => {
        document.getElementById(`${p}_limit_${index}_select`)?.addEventListener('click', () => {
          selectSuggestedLimitState(cfg, index);
        });
      });
    }
    refreshTupleRows(cfg);
  }

  function toReportGroup(prefix, title) {
    const stored = window.lastLoadCombo && window.lastLoadCombo[prefix];
    if (!stored) return null;
    if (stored.tupleMode === 'select') {
      if (!stored.selectedTuple || stored.tuplePreserved !== true) return null;
      const selected = stored.selectedTuple;
      const forceMeta = new Map((stored.forceMeta || []).map(force => [force.key, force]));
      const sourceValues = Object.keys(selected.values || {}).map(key => {
        const meta = forceMeta.get(key);
        const unit = meta?.unit ? ` ${meta.unit}` : '';
        return `${key}=${formatSigned(selected.values[key], 3)}${unit}`;
      }).join('；');
      const adoptedValues = (stored.adoptedWrites || []).map(write => {
        const value = write.signed ? formatSigned(write.value, 3) : (Number(write.value) || 0).toFixed(3);
        const unit = write.unit ? ` ${write.unit}` : '';
        return `${write.label || write.targetId}=${value}${unit}`;
      }).join('；');
      const items = [
        { label:'設計方法', value: stored.method || selected.method || 'LRFD' },
        { label:'採用組合', value: selected.name },
        { label:'來源完整有號內力', value: sourceValues || '—' },
        { label:'採用需求欄位', value: adoptedValues || '—' },
      ];
      return { group: title || '載重組合', items };
    }
    if (!stored.env) return null;
    const items = [{ label:'組合模式', value: stored.method || 'LRFD' }];
    const env = stored.env;
    for (const k of Object.keys(env)) {
      const r = env[k];
      items.push({ label: `${k}_D`, value: r.D });
      items.push({ label: `${k}_L`, value: r.L });
      items.push({ label: `${k}_W`, value: r.W });
      items.push({ label: `${k}_E`, value: r.E });
      items.push({ label: `${k} 封包`, value: `${r.value.toFixed(2)} (${r.governing})` });
    }
    return { group: title || '載重組合', items };
  }

  const LoadCombo = {
    COMBOS: { LRFD: LRFD_COMBOS, ASD: ASD_COMBOS },
    TUPLE_SCHEMA_VERSION,
    LIMIT_STATE_SCHEMA_VERSION,
    getComboSet, computeTuples, getTupleByName, selectGoverningTuple, selectGoverningLimitStates,
    buildPanel, compute, computeDetailed, apply, clear, bind, toReportGroup, drawEnvelopeChart,
  };

  if (typeof window !== 'undefined') window.LoadCombo = LoadCombo;
  if (typeof module !== 'undefined' && module.exports) module.exports = LoadCombo;
})();
