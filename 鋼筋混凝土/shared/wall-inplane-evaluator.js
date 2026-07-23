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

  WallInplaneEvaluator.computePMCapacity = function (base) {
    const PMSection = root.PMSection;
    if (!PMSection) return { status:'capacity-unresolved', valid:false, reason:'P-M 互制核心未載入' };
    const keys = ['fc', 'fy', 'h', 'lw', 'vBarArea', 'vBarDb', 'hBarDb', 'vSp', 'layers', 'cover'];
    const value = Object.fromEntries(keys.map(key => [key, Number(base?.[key])]));
    if (!Object.values(value).every(Number.isFinite)) {
      return { status:'capacity-unresolved', valid:false, reason:'P-M 斷面參數須為有限值' };
    }
    const { fc, fy, h, lw, vBarArea, vBarDb, hBarDb, vSp, layers, cover } = value;
    if (![fc, fy, h, lw, vBarArea, vBarDb, vSp, layers].every(item => item > 0) || hBarDb < 0 || cover < 0) {
      return { status:'capacity-unresolved', valid:false, reason:'P-M 斷面參數未完整建立' };
    }
    const boundaryBarArea = Number(base?.boundaryBarArea || 0);
    const boundaryBarDb = Number(base?.boundaryBarDb || 0);
    const boundaryBarCountEach = Number(base?.boundaryBarCountEach || 0);
    if (![boundaryBarArea, boundaryBarDb, boundaryBarCountEach].every(Number.isFinite)
      || boundaryBarArea < 0 || boundaryBarDb < 0 || boundaryBarCountEach < 0
      || !Number.isInteger(boundaryBarCountEach)) {
      return { status:'capacity-unresolved', valid:false, reason:'牆端附加縱筋參數須為非負有限值，且每端支數須為整數' };
    }
    const boundaryEnabled = boundaryBarCountEach > 0;
    if (boundaryEnabled && (!(boundaryBarArea > 0) || !(boundaryBarDb > 0))) {
      return { status:'capacity-unresolved', valid:false, reason:'啟用牆端附加縱筋時須提供鋼筋面積與直徑' };
    }
    const throughThicknessOffset = cover + hBarDb + Math.max(vBarDb, boundaryEnabled ? boundaryBarDb : 0) / 2;
    if (throughThicknessOffset > h / 2 + 1e-9) {
      return { status:'capacity-unresolved', valid:false, reason:'保護層與鋼筋尺寸無法置入牆厚斷面' };
    }
    const edgeOffset = cover + hBarDb + vBarDb / 2;
    if (!(edgeOffset < lw / 2)) {
      return { status:'capacity-unresolved', valid:false, reason:'保護層與鋼筋尺寸無法置入牆長斷面' };
    }
    const usableLength = lw - 2 * edgeOffset;
    const intervals = Math.max(1, Math.ceil(usableLength / vSp));
    const actualSpacing = usableLength / intervals;
    const distributedBars = Array.from({ length:intervals + 1 }, (_, index) => ({
      y:edgeOffset + actualSpacing * index,
      As:layers * vBarArea,
    }));
    const boundaryEdgeOffset = boundaryEnabled ? cover + hBarDb + boundaryBarDb / 2 : null;
    if (boundaryEnabled && !(boundaryEdgeOffset < lw / 2)) {
      return { status:'capacity-unresolved', valid:false, reason:'保護層與牆端鋼筋尺寸無法置入牆長斷面' };
    }
    const boundaryBars = boundaryEnabled ? [
      { y:boundaryEdgeOffset, As:boundaryBarCountEach * boundaryBarArea },
      { y:lw - boundaryEdgeOffset, As:boundaryBarCountEach * boundaryBarArea },
    ] : [];
    const bars = distributedBars.concat(boundaryBars).sort((a, b) => a.y - b.y);
    const sec = { b:h, h:lw, bars };
    const mat = {
      fc,
      fy,
      phiComp:Number.isFinite(Number(base?.phiComp)) ? Number(base.phiComp) : 0.65,
      phiTen:Number.isFinite(Number(base?.phiTen)) ? Number(base.phiTen) : 0.90,
      PnMaxFactor:Number.isFinite(Number(base?.pnMaxFactor)) ? Number(base.pnMaxFactor) : 0.80,
    };
    const pm = PMSection.curve(sec, mat, { steps:Number(base?.pmSteps) || 140 });
    const range = PMSection.pRange(pm.design);
    const valid = Number.isFinite(range.min) && Number.isFinite(range.max) && range.min < 0 && range.max > 0;
    return {
      status:valid ? 'evaluated' : 'capacity-unresolved',
      valid,
      reason:valid ? '' : 'P-M 設計封包無法建立',
      sec,
      mat,
      pm,
      pMin:range.min,
      pMax:range.max,
      edgeOffset,
      boundaryEdgeOffset,
      throughThicknessOffset,
      actualSpacing,
      barCount:distributedBars.length,
      distributedRowCount:distributedBars.length,
      distributedBarCount:distributedBars.length * layers,
      boundaryBarCountEach,
      boundaryBarCountTotal:boundaryBarCountEach * 2,
      AstDistributed:distributedBars.length * layers * vBarArea,
      AstBoundary:boundaryBarCountEach * 2 * boundaryBarArea,
      Ast:pm.Ast,
    };
  };

  WallInplaneEvaluator.evaluatePMDemand = function (base, demand) {
    const P = Number(demand?.P);
    const explicitM = Number(demand?.M);
    const e = Number(base?.e);
    const M = Number.isFinite(explicitM)
      ? explicitM
      : (Number.isFinite(P) && Number.isFinite(e) ? P * e / 100 : NaN);
    if (![P, M].every(Number.isFinite)) {
      return { status:'invalid-demand', ok:false, P, M, reason:'P / M 須為有限值' };
    }
    const capacity = WallInplaneEvaluator.computePMCapacity(base);
    if (!capacity.valid) return { status:capacity.status, ok:false, P, M, reason:capacity.reason };
    const check = root.PMSection.checkDemand(capacity.pm.design, P, M);
    const status = check.axialOk === false ? 'axial-out-of-range'
      : Number.isFinite(check.util) ? 'evaluated' : 'capacity-unresolved';
    return {
      status,
      ok:status === 'evaluated' && check.ok,
      P,
      M,
      phiMn:check.axialOk === false ? null : check.phiMn,
      utilization:check.axialOk === false ? null : check.util,
      pMin:check.pMin,
      pMax:check.pMax,
      axialOk:check.axialOk,
      outOfRange:check.outOfRange,
      phiPnMax:capacity.pm.phiPnMax,
      Po:capacity.pm.Po,
      design:capacity.pm.design,
      barCount:capacity.barCount,
      distributedRowCount:capacity.distributedRowCount,
      distributedBarCount:capacity.distributedBarCount,
      boundaryBarCountEach:capacity.boundaryBarCountEach,
      boundaryBarCountTotal:capacity.boundaryBarCountTotal,
      AstDistributed:capacity.AstDistributed,
      AstBoundary:capacity.AstBoundary,
      Ast:capacity.Ast,
      edgeOffset:capacity.edgeOffset,
      boundaryEdgeOffset:capacity.boundaryEdgeOffset,
      throughThicknessOffset:capacity.throughThicknessOffset,
      actualSpacing:capacity.actualSpacing,
      reason:status === 'axial-out-of-range'
        ? 'Pu 超出 P-M 設計軸力封包'
        : status === 'capacity-unresolved' ? 'P-M 容量無法建立' : '',
    };
  };

  WallInplaneEvaluator.pmScore = function (base, demand) {
    const result = WallInplaneEvaluator.evaluatePMDemand(base, demand);
    if (result.status !== 'evaluated') {
      const labels = {
        'invalid-demand':'需求無效',
        'axial-out-of-range':'軸力越界',
        'capacity-unresolved':'容量待確認',
      };
      const demandRank = Math.min(Math.abs(Number(result.P) || 0) + Math.abs(Number(result.M) || 0), 1e6);
      return { score:FAIL_CLOSED_BASE + demandRank, scoreLabel:labels[result.status] || '容量待確認', ...result };
    }
    return { score:result.utilization, scoreLabel:result.utilization.toFixed(3), ...result };
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
