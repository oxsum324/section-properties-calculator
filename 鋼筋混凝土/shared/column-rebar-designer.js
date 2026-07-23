/* RC 矩形柱容量式主筋候選枚舉器（DOM-free）。
 * 正式 P-M / 雙軸容量由呼叫端 evaluateCandidate callback 提供。
 */
(function (root) {
  'use strict';
  const DEFAULT_BARS = ['#6', '#7', '#8', '#9', '#10', '#11'];
  const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;

  function search(options) {
    const table = options?.barTable || root.Rebar?.REBAR_TABLE || root.REBAR_TABLE || {};
    const b = Number(options?.b), h = Number(options?.h), cover = Number(options?.cover);
    const tieDb = Number(options?.tieDb), Ag = b * h;
    const maxRho = options?.seismic === true ? 0.06 : 0.08;
    const evaluate = options?.evaluateCandidate;
    if (![b, h, cover, tieDb].every(Number.isFinite) || ![b, h, Ag].every(finitePositive) || typeof evaluate !== 'function') {
      return { status:'invalid-input', reason:'矩形柱幾何與正式容量 evaluator 須完整提供', candidates:[] };
    }
    const bars = [...new Set(options?.bars || DEFAULT_BARS)].filter(barNo => table[barNo]);
    const pool = [];
    for (const barNo of bars) {
      const bar = table[barNo];
      for (let bundle = 1; bundle <= 4; bundle += 1) {
        const dbEq = Math.sqrt(bundle) * bar.db;
        const clear = Math.max(1.5 * dbEq, 4);
        const maxPerSide = side => {
          const available = side - 2 * cover - 2 * tieDb - dbEq;
          return available > 0 ? Math.max(0, Math.floor(available / (dbEq + clear)) + 1) : 0;
        };
        const maxSide = Math.min(maxPerSide(b), maxPerSide(h));
        for (let nSide = 2; nSide <= maxSide; nSide += 1) {
          const positions = 4 * nSide - 4;
          const nBar = positions * bundle;
          const Ast = nBar * bar.area;
          const rhog = Ast / Ag;
          if (rhog < 0.01 - 1e-9 || rhog > maxRho + 1e-9) continue;
          pool.push({
            barNo, nSide, bundle, nBar, Ast, rhog, db:bar.db, ab:bar.area, dbEq, clear,
            congestion:nSide + bundle * 1.5 + dbEq,
          });
        }
      }
    }
    pool.sort((a, b2) => a.Ast - b2.Ast || a.congestion - b2.congestion);
    const candidates = [];
    let evaluatedCount = 0;
    const limit = Math.max(1, Number(options?.limit) || 5);
    let acceptedAstLimit = Infinity;
    for (const candidate of pool) {
      // 排序第一鍵為 Ast；取得足量後仍完成同 Ast 群組，確保同量方案排序穩定。
      if (candidates.length >= limit && candidate.Ast > acceptedAstLimit + 1e-9) break;
      evaluatedCount += 1;
      let result;
      try {
        result = evaluate(candidate);
      } catch (error) {
        continue;
      }
      const utilization = Number(result?.utilization);
      if (result?.ok !== true || !Number.isFinite(utilization) || utilization > 1 + 1e-9) continue;
      candidates.push({
        ...candidate,
        utilization,
        pmUtilization:Number(result.pmUtilization ?? utilization),
        transverseSteel:Number(result.transverse?.transverseSteel) || 0,
        phiMnX:Number(result.phiMnX), phiMnY:Number(result.phiMnY),
        transverse:result.transverse || null,
      });
      if (candidates.length === limit) acceptedAstLimit = candidate.Ast;
    }
    candidates.sort((a, b2) => a.Ast - b2.Ast || a.transverseSteel - b2.transverseSteel || a.congestion - b2.congestion || b2.utilization - a.utilization);
    const picked = [];
    const keys = new Set();
    for (const candidate of candidates) {
      const key = `${candidate.barNo}|${candidate.nSide}|${candidate.bundle}`;
      if (keys.has(key)) continue;
      keys.add(key);
      picked.push(candidate);
      if (picked.length >= limit) break;
    }
    return {
      status:picked.length ? 'evaluated' : 'no-solution',
      reason:picked.length ? '' : '目前搜尋範圍內沒有通過正式 P-M 容量、配筋率及排內可配置性的矩形柱方案',
      candidates:picked,
      evaluatedCount,
    };
  }

  function searchCircular(options) {
    const table = options?.barTable || root.Rebar?.REBAR_TABLE || root.REBAR_TABLE || {};
    const D = Number(options?.D), cover = Number(options?.cover), transverseDb = Number(options?.transverseDb);
    const Ag = Math.PI * D * D / 4;
    const maxRho = options?.seismic === true ? 0.06 : 0.08;
    const evaluate = options?.evaluateCandidate;
    if (![D, cover, transverseDb].every(Number.isFinite) || ![D, Ag].every(finitePositive) || typeof evaluate !== 'function') {
      return { status:'invalid-input', reason:'圓柱幾何與正式容量 evaluator 須完整提供', candidates:[] };
    }
    const bars = [...new Set(options?.bars || DEFAULT_BARS)].filter(barNo => table[barNo]);
    const pool = [];
    for (const barNo of bars) {
      const bar = table[barNo];
      const rLong = D / 2 - cover - transverseDb - bar.db / 2;
      if (!(rLong > 0)) continue;
      for (let nBar = 6; nBar <= 48; nBar += 1) {
        const chord = 2 * rLong * Math.sin(Math.PI / nBar);
        const clear = chord - bar.db;
        const clearRequired = Math.max(1.5 * bar.db, 4);
        if (clear + 1e-9 < clearRequired) break;
        const Ast = nBar * bar.area;
        const rhog = Ast / Ag;
        if (rhog < 0.01 - 1e-9 || rhog > maxRho + 1e-9) continue;
        pool.push({
          barNo, nBar, Ast, rhog, db:bar.db, ab:bar.area,
          chord, clear, clearRequired, congestion:nBar + bar.db * 2,
        });
      }
    }
    pool.sort((a, b) => a.Ast - b.Ast || a.congestion - b.congestion);
    const candidates = [];
    let evaluatedCount = 0;
    const limit = Math.max(1, Number(options?.limit) || 5);
    let acceptedAstLimit = Infinity;
    for (const candidate of pool) {
      if (candidates.length >= limit && candidate.Ast > acceptedAstLimit + 1e-9) break;
      evaluatedCount += 1;
      let result;
      try { result = evaluate(candidate); } catch (error) { continue; }
      const utilization = Number(result?.utilization);
      if (result?.ok !== true || !Number.isFinite(utilization) || utilization > 1 + 1e-9) continue;
      candidates.push({
        ...candidate,
        utilization,
        pmUtilization:Number(result.pmUtilization ?? utilization),
        transverseSteel:Number(result.transverse?.transverseSteel) || 0,
        phiMnX:Number(result.phiMnX), phiMnY:Number(result.phiMnY),
        transverse:result.transverse || null,
      });
      if (candidates.length === limit) acceptedAstLimit = candidate.Ast;
    }
    candidates.sort((a, b) => a.Ast - b.Ast || a.transverseSteel - b.transverseSteel || a.congestion - b.congestion || b.utilization - a.utilization);
    return {
      status:candidates.length ? 'evaluated' : 'no-solution',
      reason:candidates.length ? '' : '目前搜尋範圍內沒有通過正式 P-M 容量、配筋率及圓周淨距的圓柱方案',
      candidates:candidates.slice(0, limit),
      evaluatedCount,
    };
  }

  root.ColumnRebarDesigner = { search, searchCircular };
})(typeof window !== 'undefined' ? window : globalThis);
