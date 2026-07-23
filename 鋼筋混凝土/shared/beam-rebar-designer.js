/* 鋼筋混凝土工具箱 — RC 梁容量式配筋候選搜尋
 *
 * DOM-free；依賴 Rebar.REBAR_TABLE、Flexure.solveSection / phiFlexure、
 * BeamEvaluator.computeShearState。候選只供頁面比較，套用後仍由梁頁正式重算。
 */
(function (root) {
  'use strict';

  const DEFAULT_MAIN_BARS = ['#6', '#7', '#8', '#9', '#10'];
  const DEFAULT_STIRRUPS = ['#3', '#4', '#5'];
  const DEFAULT_LEGS = [2, 4];
  const DEFAULT_SPACINGS = [10, 12.5, 15, 17.5, 20, 22.5, 25, 30];
  const PHI_SHEAR = 0.75;

  const finite = value => Number.isFinite(Number(value));
  const positive = value => finite(value) && Number(value) > 0;
  const unique = values => [...new Set(values)];

  function shapeFor(sectionType, direction, bw, bf, hf) {
    return sectionType === 'rect'
      ? { type: 'rect', b: bw }
      : { type: sectionType, bw, bf, hf, flangeOnComp: direction === 'pos' };
  }

  function buildStack(barNo, counts, cover, tieDb, sv, table) {
    const bar = table[barNo];
    let usedDepth = cover + tieDb;
    return [0, 1, 2].map(index => {
      usedDepth += bar.db / 2;
      const n = Number(counts[index]) || 0;
      const layer = { n, barNo, db: bar.db, ab: bar.area, As: n * bar.area, dFromFace: usedDepth };
      usedDepth += bar.db / 2 + sv;
      return layer;
    });
  }

  function summarize(stack) {
    const active = stack.filter(layer => layer.n > 0);
    const As = active.reduce((sum, layer) => sum + layer.As, 0);
    const centroid = As > 0
      ? active.reduce((sum, layer) => sum + layer.As * layer.dFromFace, 0) / As
      : 0;
    const innerEdge = active.length
      ? Math.max(...active.map(layer => layer.dFromFace + layer.db / 2))
      : 0;
    return { active, As, centroid, innerEdge, rows: active.length };
  }

  function distribute(total, cap) {
    if (cap < 2 || total < 2 || total > 3 * cap) return null;
    const counts = [0, 0, 0];
    let remain = total;
    for (let index = 0; index < 3 && remain > 0; index += 1) {
      const rowsLeft = 3 - index;
      let take = Math.min(cap, remain);
      if (remain > cap && remain - take === 1 && rowsLeft > 1) take -= 1;
      if (take < 2) return null;
      counts[index] = take;
      remain -= take;
    }
    return remain === 0 ? counts : null;
  }

  function maxBarsPerLayer({ bw, cover, tieDb, shMin, db }) {
    const clear = Math.max(shMin, db);
    const available = bw - 2 * cover - 2 * tieDb - db;
    return available > 0 ? Math.max(0, Math.floor(available / (db + clear)) + 1) : 0;
  }

  function grossSection(sectionType, bw, bf, hf, h) {
    if (sectionType === 'rect') {
      const Ig = bw * Math.pow(h, 3) / 12;
      return { Ig, ytPos: h / 2, ytNeg: h / 2 };
    }
    const flangeArea = bf * hf;
    const flangeY = hf / 2;
    const webArea = bw * (h - hf);
    const webY = hf + (h - hf) / 2;
    const total = flangeArea + webArea;
    const ybarTop = total > 0 ? (flangeArea * flangeY + webArea * webY) / total : h / 2;
    const Ig = bf * Math.pow(hf, 3) / 12 + flangeArea * Math.pow(ybarTop - flangeY, 2)
      + bw * Math.pow(h - hf, 3) / 12 + webArea * Math.pow(webY - ybarTop, 2);
    return { Ig, ytPos: h - ybarTop, ytNeg: ybarTop };
  }

  function asMin(direction, sectionType, bw, bf, d, fc, fy) {
    const width = sectionType !== 'rect' && direction === 'neg' ? Math.min(bf, 2 * bw) : bw;
    return Math.max(0.8 * Math.sqrt(fc) / fy, 14 / fy) * width * d;
  }

  function crackSpacingLimit(fy, cover) {
    const fs = Math.max((2 / 3) * fy, 1);
    return Math.max(0, Math.min((2800 / fs) * (38 - 2.5 * Math.max(cover, 0)), 30 * (2800 / fs)));
  }

  function flexure(direction, base, bottomStack, topStack) {
    const layers = [];
    if (direction === 'pos') {
      topStack.forEach(layer => { if (layer.n > 0) layers.push({ y: layer.dFromFace, As: layer.As }); });
      bottomStack.forEach(layer => { if (layer.n > 0) layers.push({ y: base.h - layer.dFromFace, As: layer.As }); });
    } else {
      bottomStack.forEach(layer => { if (layer.n > 0) layers.push({ y: layer.dFromFace, As: layer.As }); });
      topStack.forEach(layer => { if (layer.n > 0) layers.push({ y: base.h - layer.dFromFace, As: layer.As }); });
    }
    const solved = root.Flexure.solveSection({
      shape: shapeFor(base.sectionType, direction, base.bw, base.bf, base.hf),
      h: base.h,
      layers,
      fc: base.fc,
      fy: base.fy,
      beta1: base.beta1,
    });
    const phi = root.Flexure.phiFlexure(solved.epsT_max, base.fy);
    return { valid: solved.valid, phi, phiMn: phi * solved.Mn / 1e5, Mn: solved.Mn / 1e5 };
  }

  function planCatalog(base, direction, barNo, tieDb, section) {
    const table = base.barTable;
    const bar = table[barNo];
    if (!bar) return [];
    const cap = maxBarsPerLayer({ ...base, tieDb, db: bar.db });
    if (cap < 2) return [];
    const smax = crackSpacingLimit(base.fy, base.cover);
    const plans = [];
    for (let total = 2; total <= 3 * cap; total += 1) {
      const counts = distribute(total, cap);
      if (!counts) continue;
      const stack = buildStack(barNo, counts, base.cover, tieDb, base.sv, table);
      const summary = summarize(stack);
      if (summary.rows > 1 && base.sv + 1e-9 < Math.max(2.5, bar.db)) continue;
      const d = base.h - summary.centroid;
      if (d <= 0 || summary.innerEdge >= base.h / 2) continue;
      const rho = summary.As / (base.bw * d);
      if (rho > base.rhoMax + 1e-9) continue;
      if (summary.As + 1e-9 < asMin(direction, base.sectionType, base.bw, base.bf, d, base.fc, base.fy)) continue;
      const centerSpan = Math.max(0, base.bw - 2 * base.cover - 2 * tieDb - bar.db);
      const outerSpacing = counts[0] > 1 ? centerSpan / (counts[0] - 1) : Infinity;
      if (outerSpacing > smax + 1e-9) continue;
      const zero = buildStack(barNo, [0, 0, 0], base.cover, tieDb, base.sv, table);
      const trial = direction === 'pos'
        ? flexure(direction, base, stack, zero)
        : flexure(direction, base, zero, stack);
      const mcr = 1.2 * (2 * Math.sqrt(base.fc)) * section.Ig / (direction === 'pos' ? section.ytPos : section.ytNeg) / 1e5;
      if (!trial.valid || trial.phiMn + 1e-9 < mcr) continue;
      const demand = direction === 'pos' ? base.MuPos : base.MuNeg;
      plans.push({ barNo, counts, stack, summary, d, rho, phiMn: trial.phiMn, utilization: Math.max(demand, mcr) / trial.phiMn });
    }
    return plans;
  }

  function search(options) {
    const table = options?.barTable || root.Rebar?.REBAR_TABLE || root.REBAR_TABLE || {};
    const base = {
      sectionType: String(options?.sectionType || 'rect'),
      bw: Number(options?.bw), h: Number(options?.h), bf: Number(options?.bf), hf: Number(options?.hf),
      cover: Number(options?.cover), sv: Number(options?.sv), shMin: Math.max(Number(options?.shMin) || 4, 2.5),
      fc: Number(options?.fc), fy: Number(options?.fy), fyt: Number(options?.fyt), beta1: Number(options?.beta1),
      MuPos: Math.abs(Number(options?.MuPos)), MuNeg: Math.abs(Number(options?.MuNeg)),
      Vu: Math.abs(Number(options?.Vu)), Pu: Number(options?.Pu), Tu: Math.abs(Number(options?.Tu)), Ve: Math.abs(Number(options?.Ve)),
      ln: Number(options?.ln), seismic: options?.seismic === true, enableTorsion: options?.enableTorsion === true,
      torsionDesignStatus: String(options?.torsionDesignStatus || 'pending'), barTable: table,
    };
    const required = ['bw', 'h', 'cover', 'sv', 'fc', 'fy', 'fyt', 'beta1', 'MuPos', 'MuNeg', 'Vu', 'Pu', 'Tu', 'Ve'];
    if (!required.every(key => finite(base[key])) || ![base.bw, base.h, base.fc, base.fy, base.fyt, base.beta1].every(positive)) {
      return { status: 'invalid-input', reason: '梁幾何、材料與需求須為有限正值', candidates: [] };
    }
    if (!['rect', 'T', 'L'].includes(base.sectionType)) return { status: 'invalid-input', reason: '不支援的梁斷面型式', candidates: [] };
    if (base.sectionType !== 'rect' && (!positive(base.bf) || !positive(base.hf) || base.bf < base.bw || base.hf >= base.h)) {
      return { status: 'invalid-input', reason: 'T / L 形梁翼板尺寸不合理', candidates: [] };
    }
    base.bf = base.sectionType === 'rect' ? base.bw : base.bf;
    base.hf = base.sectionType === 'rect' ? 0 : base.hf;
    base.rhoMax = 0.85 * base.beta1 * (base.fc / base.fy) * (0.003 / 0.008);

    const mainBars = unique(options?.mainBars || DEFAULT_MAIN_BARS).filter(barNo => table[barNo]);
    const stirrups = unique(options?.stirrupBars || DEFAULT_STIRRUPS).filter(barNo => table[barNo]);
    const legsCatalog = unique(options?.legsCatalog || DEFAULT_LEGS).map(Number).filter(value => value >= 2);
    const spacings = unique(options?.spacings || DEFAULT_SPACINGS).map(Number).filter(positive).sort((a, b) => b - a);
    const section = grossSection(base.sectionType, base.bw, base.bf, base.hf, base.h);
    const candidates = [];
    let evaluatedCount = 0;
    let torsionBoundaryEncountered = false;
    const planCache = new Map();

    for (const stirrup of stirrups) {
      const tie = table[stirrup];
      const cacheKey = stirrup;
      let plans = planCache.get(cacheKey);
      if (!plans) {
        const bottom = mainBars.flatMap(barNo => planCatalog(base, 'pos', barNo, tie.db, section));
        const top = mainBars.flatMap(barNo => planCatalog(base, 'neg', barNo, tie.db, section));
        plans = { bottom, top };
        planCache.set(cacheKey, plans);
      }
      for (const bottom of plans.bottom) for (const top of plans.top) {
        const clearBetween = base.h - bottom.summary.innerEdge - top.summary.innerEdge;
        const verticalClear = Math.max(2.5, bottom.stack[0].db, top.stack[0].db);
        if (clearBetween + 1e-9 < verticalClear) continue;
        const pos = flexure('pos', base, bottom.stack, top.stack);
        const neg = flexure('neg', base, bottom.stack, top.stack);
        const dPos = base.h - bottom.summary.centroid;
        const dNeg = base.h - top.summary.centroid;
        const rhoPos = bottom.summary.As / (base.bw * dPos);
        const rhoNeg = top.summary.As / (base.bw * dNeg);
        const mcrPos = 1.2 * (2 * Math.sqrt(base.fc)) * section.Ig / section.ytPos / 1e5;
        const mcrNeg = 1.2 * (2 * Math.sqrt(base.fc)) * section.Ig / section.ytNeg / 1e5;
        if (!pos.valid || !neg.valid || pos.phiMn + 1e-9 < Math.max(base.MuPos, mcrPos) || neg.phiMn + 1e-9 < Math.max(base.MuNeg, mcrNeg)) continue;
        if (rhoPos > base.rhoMax + 1e-9 || rhoNeg > base.rhoMax + 1e-9) continue;
        const d = Math.min(dPos, dNeg);
        const rhoShear = Math.max(0.0001, Math.min(rhoPos, rhoNeg));
        for (const legs of legsCatalog) for (const spacing of spacings) {
          evaluatedCount += 1;
          const Av = legs * tie.area;
          const shear = root.BeamEvaluator.computeShearState({
            sectionType: base.sectionType, bw: base.bw, bf: base.bf, hf: base.hf, h: base.h,
            fc: base.fc, fyt: base.fyt, d, Ag: base.bw * base.h, Av, s: spacing, rhoShear,
            phiShear: PHI_SHEAR, lambda: 1, seismic: base.seismic, Ve: base.Ve * 1000,
            enableTorsion: base.enableTorsion, torsionDesignStatus: base.torsionDesignStatus,
          }, { Pu: base.Pu * 1000, Vu: base.Vu * 1000, Tu: base.Tu * 1e5 });
          if (!shear.valid) continue;
          if (!['inactive', 'below-threshold'].includes(shear.torsionStatus)) {
            torsionBoundaryEncountered = true;
            continue;
          }
          const shearUtilization = shear.phiVn_eff > 0 ? shear.shearDemand / shear.phiVn_eff : Infinity;
          if (shearUtilization > 1 + 1e-9) continue;
          const needsMin = shear.shearDemand > PHI_SHEAR * 0.265 * Math.sqrt(base.fc) * base.bw * d;
          if (needsMin && !shear.hasMinStir) continue;
          const highShear = shear.Vs_provided > 1.06 * Math.sqrt(base.fc) * base.bw * d;
          const spacingLimit = highShear ? Math.min(d / 4, 30) : Math.min(d / 2, 60);
          const clearWidth = Math.max(0, base.bw - 2 * base.cover - 2 * tie.db);
          const legSpacing = clearWidth / (legs - 1);
          const legSpacingLimit = highShear ? d / 2 : d;
          const needsShearRebar = needsMin || shear.shearDemand > (shear.forceVc0 ? 0 : shear.phiVc);
          if (needsShearRebar && (spacing > spacingLimit + 1e-9 || legSpacing > legSpacingLimit + 1e-9)) continue;
          if (base.seismic) {
            const dbMin = Math.min(bottom.stack[0].db, top.stack[0].db);
            const factor = base.fy <= 4200 ? 6 : base.fy <= 5000 ? 5.5 : 5;
            const seismicLimit = Math.min(d / 4, 15, factor * dbMin);
            if (spacing > seismicLimit + 1e-9 || (finite(base.ln) && base.ln < 4 * d - 1e-9) || base.bw < Math.max(0.3 * base.h, 25) - 1e-9) continue;
          }
          const flexPosUtilization = base.MuPos > 0 ? base.MuPos / pos.phiMn : 0;
          const flexNegUtilization = base.MuNeg > 0 ? base.MuNeg / neg.phiMn : 0;
          const steelScore = bottom.summary.As + top.summary.As + (Av / spacing) * base.bw * 0.2;
          candidates.push({
            bottomBar: bottom.barNo, bottomCounts: [...bottom.counts], bottomAs: bottom.summary.As,
            topBar: top.barNo, topCounts: [...top.counts], topAs: top.summary.As,
            stirrup, legs, spacing, dPos, dNeg,
            phiMnPos: pos.phiMn, phiMnNeg: neg.phiMn, shearCapacity: shear.phiVn_eff / 1000,
            flexPosUtilization, flexNegUtilization, shearUtilization,
            utilization: Math.max(flexPosUtilization, flexNegUtilization, shearUtilization),
            steelScore, congestion: bottom.summary.rows + top.summary.rows + legs / 2 + tie.db,
          });
        }
      }
    }

    candidates.sort((a, b) => a.steelScore - b.steelScore || a.congestion - b.congestion || b.utilization - a.utilization);
    const deduped = [];
    const keys = new Set();
    for (const candidate of candidates) {
      const key = [candidate.bottomBar, candidate.bottomCounts.join('-'), candidate.topBar, candidate.topCounts.join('-'), candidate.stirrup, candidate.legs, candidate.spacing].join('|');
      if (keys.has(key)) continue;
      keys.add(key);
      deduped.push(candidate);
      if (deduped.length >= Math.max(1, Number(options?.limit) || 5)) break;
    }
    return {
      status: deduped.length ? 'evaluated' : 'no-solution',
      reason: deduped.length ? '' : torsionBoundaryEncountered
        ? '扭力已達自動設計邊界，須先完成規範 22.7 詳算'
        : '目前搜尋範圍內沒有同時滿足撓曲、剪力、最小配筋與可配置性的方案',
      candidates: deduped,
      evaluatedCount,
      planCounts: [...planCache.values()].map(item => ({ bottom:item.bottom.length, top:item.top.length })),
    };
  }

  root.BeamRebarDesigner = { search, buildStack, maxBarsPerLayer, planCatalog };
})(typeof window !== 'undefined' ? window : globalThis);
