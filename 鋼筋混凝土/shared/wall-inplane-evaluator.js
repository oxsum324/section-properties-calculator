/* 鋼筋混凝土工具箱 — 一般 RC 牆面內 P / V 逐工況 evaluator
 *
 * 保持 DOM-free，沿用 shared/wall.js 的正式公式。簡易軸壓僅適用於
 * |e| ≤ h/6；拉力工況與偏心超界不假造容量，控制組合評分採失敗關閉。
 */
(function (root) {
  const WallInplaneEvaluator = {};
  const FAIL_CLOSED_BASE = 1e12;

  WallInplaneEvaluator.computeCapacity = function (base) {
    const Wall = root.Wall;
    if (!Wall) return { status:'capacity-unresolved', valid:false, reason:'Wall 公式核心未載入' };
    const keys = ['fc', 'fy', 'h', 'lw', 'lc', 'k', 'hw', 'e', 'lambda', 'rhot', 'phiComp', 'phiShear'];
    const value = Object.fromEntries(keys.map(key => [key, Number(base?.[key])]));
    if (!Object.values(value).every(Number.isFinite)) {
      return { status:'capacity-unresolved', valid:false, reason:'牆面內容量參數須為有限值' };
    }
    const { fc, fy, h, lw, lc, k, hw, e, lambda, rhot, phiComp, phiShear } = value;
    if (![fc, fy, h, lw, lc, k, lambda, phiComp, phiShear].every(item => item > 0) || hw < 0 || rhot < 0) {
      return { status:'capacity-unresolved', valid:false, reason:'牆面內容量參數未完整建立' };
    }

    const eLimit = h / 6;
    const eOk = Math.abs(e) <= eLimit + 1e-9;
    const Ag = h * lw;
    const Pn = Wall.simplePn({ fc, Ag, k, lc, h });
    const phiPn = eOk && Pn > 0 ? phiComp * Pn : null;
    const Acv = h * lw;
    const hwlw = lw > 0 ? hw / lw : NaN;
    const alpha_c = Wall.alphaC(hwlw);
    const Vn = Wall.vn({ Acv, alpha_c, lambda, fc, rhot, fy });
    const phiVn = phiShear * Vn;
    const VnLimit = Wall.vnMaxSingle(fc, Acv);
    const isShearWall = base?.seismic === true || String(base?.wallType || '') === 'shear';
    const effectiveShearCapacity = isShearWall ? Math.min(phiVn, VnLimit) : phiVn;
    const valid = Pn > 0 && Number.isFinite(phiVn) && phiVn > 0 && Number.isFinite(VnLimit) && VnLimit > 0;
    return {
      status:valid ? 'evaluated' : 'capacity-unresolved',
      valid,
      reason:valid ? '' : '牆面內容量無法建立',
      e, eLimit, eOk, Ag, Pn, phiPn,
      Acv, hwlw, alpha_c, Vn, phiVn, VnLimit,
      isShearWall, effectiveShearCapacity,
    };
  };

  WallInplaneEvaluator.evaluateDemand = function (base, demand) {
    const P = Number(demand?.P);
    const V = Number(demand?.V);
    if (![P, V].every(Number.isFinite)) {
      return { status:'invalid-demand', ok:false, P, V, reason:'P / V 須為有限值' };
    }
    const capacity = WallInplaneEvaluator.computeCapacity(base);
    if (!capacity.valid) return { ...capacity, ok:false, P, V, capacity };

    let axialStatus = 'inactive';
    let axialUtilization = 0;
    if (P < -1e-9) {
      axialStatus = 'tension-capacity-unresolved';
    } else if (P > 1e-9) {
      if (!capacity.eOk || !(capacity.phiPn > 0)) axialStatus = 'eccentricity-out-of-range';
      else {
        axialStatus = 'evaluated';
        axialUtilization = P * 1000 / capacity.phiPn;
      }
    }
    const shearDemand = Math.abs(V) * 1000;
    const shearUtilization = shearDemand / capacity.phiVn;
    const shearLimitUtilization = capacity.isShearWall ? shearDemand / capacity.VnLimit : 0;
    const shearControlUtilization = Math.max(shearUtilization, shearLimitUtilization);
    const status = axialStatus === 'tension-capacity-unresolved'
      ? axialStatus
      : axialStatus === 'eccentricity-out-of-range' ? axialStatus : 'evaluated';
    const utilization = Math.max(axialUtilization, shearControlUtilization);
    return {
      status,
      ok:status === 'evaluated' && utilization <= 1,
      P, V,
      axialStatus,
      axialDemand:Math.max(P, 0),
      axialCapacity:capacity.phiPn == null ? null : capacity.phiPn / 1000,
      axialUtilization,
      shearDemand:Math.abs(V),
      shearCapacity:capacity.phiVn / 1000,
      shearLimit:capacity.isShearWall ? capacity.VnLimit / 1000 : null,
      shearUtilization,
      shearLimitUtilization,
      shearControlUtilization,
      utilization,
      capacity,
      reason:status === 'tension-capacity-unresolved'
        ? '目前牆頁未建立面內軸拉容量'
        : status === 'eccentricity-out-of-range' ? '|e| > h/6，簡易軸壓公式不適用' : '',
    };
  };

  WallInplaneEvaluator.compressionScore = function (base, demand) {
    const P = Number(demand?.P);
    if (!Number.isFinite(P) || P <= 0) return NaN;
    const result = WallInplaneEvaluator.evaluateDemand(base, demand);
    const labels = {
      'invalid-demand':'需求無效',
      'capacity-unresolved':'容量待確認',
      'eccentricity-out-of-range':'偏心超界',
    };
    if (result.status !== 'evaluated') {
      return { score:FAIL_CLOSED_BASE + Math.min(P, 1e6), scoreLabel:labels[result.status] || '容量待確認', ...result };
    }
    return { score:result.axialUtilization, scoreLabel:result.axialUtilization.toFixed(3), ...result };
  };

  WallInplaneEvaluator.tensionScore = function (base, demand) {
    const P = Number(demand?.P);
    const V = Number(demand?.V);
    if (![P, V].every(Number.isFinite) || P >= 0) return NaN;
    const result = WallInplaneEvaluator.evaluateDemand(base, demand);
    return {
      score:FAIL_CLOSED_BASE + Math.min(Math.abs(P), 1e6),
      scoreLabel:'拉力容量待確認',
      ...result,
    };
  };

  WallInplaneEvaluator.shearScore = function (base, demand) {
    const V = Number(demand?.V);
    if (!Number.isFinite(V) || Math.abs(V) <= 1e-9) return NaN;
    const result = WallInplaneEvaluator.evaluateDemand(base, demand);
    if (!result.capacity?.valid) {
      return { score:FAIL_CLOSED_BASE, scoreLabel:'容量待確認', ...result };
    }
    return {
      score:result.shearControlUtilization,
      scoreLabel:result.shearControlUtilization.toFixed(3),
      ...result,
    };
  };

  root.WallInplaneEvaluator = WallInplaneEvaluator;
})(typeof window !== 'undefined' ? window : globalThis);
