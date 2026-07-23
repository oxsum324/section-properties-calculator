/* 鋼筋混凝土工具箱 — RC 柱逐工況 P-M 容量 evaluator
 *
 * 保持 DOM-free。斷面 P-M 曲線與雙向容量面仍由柱頁既有應變相容核心建立；
 * 本模組負責依每一完整載重 tuple 的 Pu 重算 δns / δs、放大彎矩與容量利用率。
 */
(function (root) {
  const ColumnEvaluator = {};
  const FAIL_CLOSED_SCORE = Number.MAX_SAFE_INTEGER;

  ColumnEvaluator.interpAt = function (points, target, key, otherKey) {
    let result = null;
    const rows = Array.isArray(points) ? points : [];
    for (let i = 0; i < rows.length - 1; i += 1) {
      const a = rows[i];
      const b = rows[i + 1];
      const av = Number(a?.[key]);
      const bv = Number(b?.[key]);
      if (![av, bv].every(Number.isFinite) || av === bv) continue;
      if ((av - target) * (bv - target) > 0) continue;
      const ao = Number(a?.[otherKey]);
      const bo = Number(b?.[otherKey]);
      if (![ao, bo].every(Number.isFinite)) continue;
      const t = (target - av) / (bv - av);
      const value = ao + t * (bo - ao);
      if (result == null || value > result) result = value;
    }
    return result;
  };

  ColumnEvaluator.magnifyAxis = function (axis, Pu, moment, swayMultiplier) {
    const Pc = Number(axis?.Pc);
    const Cm = Math.max(0.4, Number(axis?.Cm) || 0.4);
    let delta = 1;
    if (!axis?.isShort && Pc > 0) {
      const denominator = 1 - Pu / (0.75 * Pc);
      if (!(denominator > 0)) {
        return { stable:false, Pc, Cm, delta:Infinity, moment:Infinity, reason:'Pu >= 0.75Pc' };
      }
      delta = Math.max(1, Cm / denominator);
    }
    if (!Number.isFinite(swayMultiplier)) {
      return { stable:false, Pc, Cm, delta, moment:Infinity, reason:'δs 無法建立' };
    }
    return {
      stable:true,
      Pc,
      Cm,
      delta,
      moment:Math.abs(Number(moment) || 0) * delta * swayMultiplier,
      reason:'',
    };
  };

  ColumnEvaluator.evaluateDemand = function (base, demand, options) {
    const Pu = Number(demand?.Pu);
    const Mx = Number(demand?.Mx);
    const My = Number(demand?.My);
    if (![Pu, Mx, My].every(Number.isFinite)) {
      return { status:'invalid-demand', ok:false, utilization:null, reason:'Pu / Mx / My 須為有限值' };
    }
    const pmX = Array.isArray(base?.pmDesignX) ? base.pmDesignX : [];
    const pmY = Array.isArray(base?.pmDesignY) ? base.pmDesignY : [];
    if (pmX.length < 2 || pmY.length < 2) {
      return { status:'capacity-unresolved', ok:false, utilization:null, reason:'P-M 容量曲線未建立' };
    }

    const pValues = pmX.map(point => Number(point.P)).filter(Number.isFinite);
    const pMin = pValues.length ? Math.min(...pValues) : NaN;
    const pMax = pValues.length ? Math.max(...pValues) : NaN;
    const axialOk = Number.isFinite(pMin) && Number.isFinite(pMax) && Pu >= pMin - 1e-9 && Pu <= pMax + 1e-9;
    if (!axialOk) {
      return { status:'axial-out-of-range', ok:false, utilization:null, Pu, Mx, My, pMin, pMax, reason:'Pu 超出 P-M 設計軸力封包' };
    }

    const swayMultiplier = base?.swayMode ? Number(base?.deltaS) : 1;
    const x = ColumnEvaluator.magnifyAxis(base?.axisX, Pu, Mx, swayMultiplier);
    const y = ColumnEvaluator.magnifyAxis(base?.axisY, Pu, My, swayMultiplier);
    if (!x.stable || !y.stable) {
      return {
        status:'magnification-unstable',
        ok:false,
        utilization:null,
        Pu, Mx, My,
        deltaX:x.delta,
        deltaY:y.delta,
        deltaS:swayMultiplier,
        Mc:x.moment,
        Mcy:y.moment,
        reason:[x.reason, y.reason].filter(Boolean).join('；'),
      };
    }

    const phiMnAtPu = ColumnEvaluator.interpAt(pmX, Pu, 'P', 'M');
    const phiMnyAtPu = ColumnEvaluator.interpAt(pmY, Pu, 'P', 'M');
    if (![phiMnAtPu, phiMnyAtPu].every(value => Number.isFinite(value) && value >= 0)) {
      return { status:'capacity-unresolved', ok:false, utilization:null, Pu, Mx, My, Mc:x.moment, Mcy:y.moment, reason:'Pu 水平容量無法內插' };
    }

    const capacityAtPu = options?.capacityAtPu;
    if (typeof capacityAtPu !== 'function') {
      return { status:'capacity-unresolved', ok:false, utilization:null, Pu, Mx, My, Mc:x.moment, Mcy:y.moment, reason:'雙向容量 evaluator 未提供' };
    }
    let surface;
    try {
      surface = capacityAtPu({
        ...(base.biaxialOptions || {}),
        Pu,
        Mx:x.moment,
        My:y.moment,
        phiMnAtPu,
        phiMnyAtPu,
      });
    } catch (error) {
      return { status:'capacity-unresolved', ok:false, utilization:null, Pu, Mx, My, Mc:x.moment, Mcy:y.moment, reason:error instanceof Error ? error.message : String(error) };
    }
    const utilization = Number(surface?.ratio);
    if (!Number.isFinite(utilization)) {
      return { status:'capacity-unresolved', ok:false, utilization:null, Pu, Mx, My, Mc:x.moment, Mcy:y.moment, phiMnAtPu, phiMnyAtPu, surface, reason:'雙向容量利用率無法建立' };
    }
    return {
      status:'evaluated',
      ok:utilization <= 1,
      utilization,
      Pu, Mx, My,
      deltaX:x.delta,
      deltaY:y.delta,
      deltaS:swayMultiplier,
      Mc:x.moment,
      Mcy:y.moment,
      phiMnAtPu,
      phiMnyAtPu,
      surface,
      reason:'',
    };
  };

  ColumnEvaluator.limitStateScore = function (base, demand, options) {
    const result = ColumnEvaluator.evaluateDemand(base, demand, options);
    const labels = {
      'axial-out-of-range':'軸力越界',
      'magnification-unstable':'二階不穩定',
      'capacity-unresolved':'容量待確認',
      'invalid-demand':'需求無效',
    };
    if (result.status !== 'evaluated') {
      return {
        score:FAIL_CLOSED_SCORE,
        scoreLabel:labels[result.status] || '待確認',
        ...result,
      };
    }
    return {
      score:result.utilization,
      scoreLabel:result.utilization.toFixed(3),
      ...result,
    };
  };

  root.ColumnEvaluator = ColumnEvaluator;
})(typeof window !== 'undefined' ? window : globalThis);
