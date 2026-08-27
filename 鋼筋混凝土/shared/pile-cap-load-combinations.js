/* LRFD load-component adapter for RC foundation -> pile-cap 3D STM. */
(function (root, factory) {
  const api = factory(
    root.LoadCombo || (typeof require === 'function' ? require('../../結構工具箱/core/loads/loadcombo.js') : null),
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PileCapLoadCombinations = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (LoadCombo) {
  'use strict';

  const SCHEMA = 'pile-cap-stm-load-combinations-v1';
  const LOAD_KEYS = ['D', 'L', 'W', 'E'];
  const FORCE_KEYS = ['Pu', 'Mux', 'Muy'];
  const EPSILON = 1e-9;

  function requireDependency() {
    if (!LoadCombo || typeof LoadCombo.computeTuples !== 'function') {
      throw new Error('缺少共用載重組合核心 LoadCombo.computeTuples。');
    }
  }

  function finite(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${label} 必須是有限數值。`);
    return Math.abs(number) < EPSILON ? 0 : number;
  }

  function normalizeComponents(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('基本載重分量必須是物件。');
    const normalized = {};
    FORCE_KEYS.forEach(forceKey => {
      const source = raw[forceKey] || {};
      normalized[forceKey] = {};
      LOAD_KEYS.forEach(loadKey => {
        normalized[forceKey][loadKey] = finite(source[loadKey] == null ? 0 : source[loadKey], `${forceKey}.${loadKey}`);
      });
    });
    return normalized;
  }

  function isLoadActive(inputForces, loadKey) {
    return FORCE_KEYS.some(forceKey => Math.abs(inputForces[forceKey][loadKey]) > EPSILON);
  }

  function displayName(name) {
    return String(name || '').replace(/([+-])/g, ' $1 ').replace(/\s+/g, ' ').trim();
  }

  function vectorKey(values) {
    return FORCE_KEYS.map(key => finite(values[key], key).toFixed(9)).join('|');
  }

  function generate(rawComponents, options = {}) {
    requireDependency();
    const method = String(options.method || 'LRFD').toUpperCase();
    if (method !== 'LRFD') throw new Error('樁帽三維 STM 自動組合僅接受 LRFD 因數化載重組合。');
    const inputForces = normalizeComponents(rawComponents);
    const tupleResult = LoadCombo.computeTuples({
      method,
      forces:inputForces,
      source:{ purpose:'RC 樁帽三維 STM 多載重組合包絡' },
    });
    const activeW = isLoadActive(inputForces, 'W');
    const activeE = isLoadActive(inputForces, 'E');
    const seenVectors = new Set();
    const tuples = tupleResult.tuples.filter(tuple => {
      if (tuple.factors.W !== 0 && !activeW) return false;
      if (tuple.factors.E !== 0 && !activeE) return false;
      const key = vectorKey(tuple.values);
      if (seenVectors.has(key)) return false;
      seenVectors.add(key);
      return true;
    });
    if (!tuples.length) throw new Error('沒有可用的 LRFD 載重組合。');
    const cases = tuples.map((tuple, index) => {
      const PuTf = finite(tuple.values.Pu, `${tuple.name} Pu`);
      if (PuTf <= 0) throw new Error(`${displayName(tuple.name)} 的 Pu 必須大於 0 tf，無法建立壓縮型樁帽 STM。`);
      return {
        id:`LC${index + 1}`,
        combination:displayName(tuple.name),
        PuTf,
        MuxTfm:finite(tuple.values.Mux, `${tuple.name} Mux`),
        MuyTfm:finite(tuple.values.Muy, `${tuple.name} Muy`),
        factors:{ ...tuple.factors },
      };
    });
    return {
      schema:SCHEMA,
      mode:'auto-lrfd',
      method,
      loadComboSchema:LoadCombo.TUPLE_SCHEMA_VERSION || null,
      inputForces,
      activeLoads:{ D:isLoadActive(inputForces, 'D'), L:isLoadActive(inputForces, 'L'), W:activeW, E:activeE },
      cases,
    };
  }

  return { schema:SCHEMA, normalizeComponents, displayName, generate };
});
