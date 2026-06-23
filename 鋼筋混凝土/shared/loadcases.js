/* 鋼筋混凝土工具箱 — 多組載重工況共用資料處理
 *
 * 純資料函式：解析文字清單、序列化、選取控制工況。
 * 不依賴 DOM 或特定構件公式，便於各工具共用與單元測試。
 */
(function (root) {
  const LoadCases = {};

  function finiteNumber(value, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function mode(value, fallback = 'direct') {
    const raw = String(value || fallback || 'direct').toLowerCase();
    return raw === 'amplified' ? 'amplified' : 'direct';
  }

  LoadCases.cleanCell = function (value) {
    return String(value ?? '').replace(/[,\t，\r\n]/g, ' ').trim();
  };

  LoadCases.parseText = function (text, defaults = {}) {
    const d = Object.assign({
      Vuns: 0,
      omegaV: 1.0,
      omegaW: 1.0,
      duhw: 0.01,
      shearDemandMode: 'direct',
    }, defaults || {});
    const errors = [];
    const cases = [];
    let sawDataOrHeader = false;
    String(text || '').split(/\r?\n/).forEach((raw, idx) => {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) return;
      const parts = line.split(/[,\t，]/).map(s => s.trim());
      if (!sawDataOrHeader && /pu/i.test(parts.join(',')) && /mu/i.test(parts.join(','))) {
        sawDataOrHeader = true;
        return;
      }
      sawDataOrHeader = true;
      if (parts.length < 4) {
        errors.push(`第 ${idx + 1} 列欄位不足`);
        return;
      }
      const Pu = finiteNumber(parts[1]);
      const Mu = finiteNumber(parts[2]);
      const Vu = finiteNumber(parts[3]);
      if (![Pu, Mu, Vu].every(Number.isFinite)) {
        errors.push(`第 ${idx + 1} 列 Pu/Mu/Vu 需為數值`);
        return;
      }
      cases.push({
        name: parts[0] || `LC${cases.length + 1}`,
        Pu,
        Mu,
        Vu,
        Vuns: finiteNumber(parts[4], d.Vuns),
        VuEh: finiteNumber(parts[5], Vu),
        omegaV: finiteNumber(parts[6], d.omegaV),
        omegaW: finiteNumber(parts[7], d.omegaW),
        duhw: finiteNumber(parts[8], d.duhw),
        shearDemandMode: mode(parts[9], d.shearDemandMode),
      });
    });
    return { cases, errors };
  };

  LoadCases.toText = function (cases) {
    return (cases || []).map(c => [
      c.name,
      c.Pu,
      c.Mu,
      c.Vu,
      c.Vuns,
      c.VuEh,
      c.omegaV,
      c.omegaW,
      c.duhw,
      c.shearDemandMode || 'direct',
    ].map(LoadCases.cleanCell).join(',')).join('\n');
  };

  function maxBy(arr, score) {
    return (arr || []).reduce((best, cur) => {
      const sCur = Number(score(cur));
      const sBest = best ? Number(score(best)) : -Infinity;
      return (!best || sCur > sBest) ? cur : best;
    }, null);
  }

  LoadCases.pickControls = function (cases) {
    return (cases || []).length ? {
      pm: maxBy(cases, c => c.pmAxialOk ? c.pmUtil : Infinity),
      shear: maxBy(cases, c => c.shearUtil),
      sbe: maxBy(cases, c => c.sbeIndex),
      shearFric: maxBy(cases, c => c.shearFricUtil),
      overall: maxBy(cases, c => (c.overallOk ? 0 : 1000) + Math.max(c.pmAxialOk ? c.pmUtil : 2, c.shearUtil, c.shearFricUtil, c.sbeIndex)),
    } : {};
  };

  LoadCases.result = function (cases, errors = []) {
    const evaluated = cases || [];
    const parseErrors = errors || [];
    return {
      loadCasesActive: evaluated.length > 0,
      loadCaseParseErrors: parseErrors,
      loadCases: evaluated,
      loadCaseControls: LoadCases.pickControls(evaluated),
      loadCaseFailures: evaluated.some(c => !c.overallOk) || parseErrors.length > 0,
    };
  };

  root.LoadCases = LoadCases;
})(typeof window !== 'undefined' ? window : globalThis);
