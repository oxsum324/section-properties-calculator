/* 鋼筋混凝土工具箱 — 一般 RC 牆容量式配筋候選搜尋
 *
 * DOM-free：以完整 P-M evaluator、剪力容量、最小配筋、筋距與可配置性
 * 篩選均布筋及兩端附加筋。候選只供設計模式套用；套用後仍回正式檢核流程。
 */
(function (root) {
  'use strict';

  const WallRebarDesigner = {};
  const DEFAULT_SPACINGS = [10, 12.5, 15, 17.5, 20, 22.5, 25, 30, 35, 40, 45];
  const DEFAULT_VERTICAL_BARS = ['#4', '#5', '#6', '#7', '#8'];
  const DEFAULT_HORIZONTAL_BARS = ['#3', '#4', '#5', '#6'];
  const DEFAULT_BOUNDARY_BARS = ['#6', '#7', '#8', '#9', '#10', '#11'];
  const DEFAULT_BOUNDARY_COUNTS = [2, 4, 6, 8];

  function finitePositive(value) {
    return Number.isFinite(Number(value)) && Number(value) > 0;
  }

  function namedBars(names, table) {
    return (names || []).filter(name => finitePositive(table?.[name]?.area) && finitePositive(table?.[name]?.db));
  }

  function candidateKey(candidate) {
    return [
      candidate.layers,
      candidate.vBar,
      candidate.vSp,
      candidate.hBar,
      candidate.hSp,
      candidate.boundaryEnabled ? candidate.boundaryBar : '-',
      candidate.boundaryEnabled ? candidate.boundaryCountEach : 0,
    ].join('|');
  }

  WallRebarDesigner.search = function (input) {
    const Wall = root.Wall;
    const Evaluator = root.WallInplaneEvaluator;
    if (!Wall || !Evaluator) return { status:'unresolved', reason:'牆公式或 P-M evaluator 未載入', candidates:[] };

    const base = input?.base || {};
    const demand = input?.demand || {};
    const barTable = input?.barTable || {};
    const required = ['fc', 'fy', 'h', 'lw', 'lc', 'k', 'hw', 'lambda', 'phiComp', 'phiTen', 'phiShear', 'cover'];
    if (!required.every(key => Number.isFinite(Number(base[key])))) {
      return { status:'invalid-input', reason:'配筋搜尋參數不完整', candidates:[] };
    }
    const P = Number(demand.P), M = Number(demand.M), V = Number(demand.V);
    if (![P, M, V].every(Number.isFinite)) {
      return { status:'invalid-input', reason:'P / M / V 需求須為有限值', candidates:[] };
    }

    const h = Number(base.h), lw = Number(base.lw), hw = Number(base.hw);
    const wallType = String(base.wallType || 'bearing');
    const seismic = base.seismic === true;
    const isShearWall = seismic || wallType === 'shear';
    const hmin = Wall.hmin(wallType, Number(base.lc), lw);
    if (!(h >= hmin)) return { status:'geometry-failed', reason:`牆厚 ${h} cm 小於下限 ${hmin.toFixed(1)} cm`, candidates:[] };
    if (Wall.isWallPier(hw, lw, h)) return { status:'geometry-failed', reason:'此構件符合 Wall Pier 判定，應改依柱設計', candidates:[] };

    const vBars = namedBars(input?.verticalBars || DEFAULT_VERTICAL_BARS, barTable);
    const hBars = namedBars(input?.horizontalBars || DEFAULT_HORIZONTAL_BARS, barTable);
    const boundaryBars = namedBars(input?.boundaryBars || DEFAULT_BOUNDARY_BARS, barTable);
    const spacings = (input?.spacings || DEFAULT_SPACINGS).map(Number).filter(finitePositive);
    const boundaryCounts = (input?.boundaryCounts || DEFAULT_BOUNDARY_COUNTS)
      .map(Number).filter(value => Number.isInteger(value) && value > 0);
    if (!vBars.length || !hBars.length || !spacings.length) {
      return { status:'invalid-input', reason:'候選鋼筋或間距清單為空', candidates:[] };
    }

    const Acv = h * lw;
    const hwlw = lw > 0 ? hw / lw : NaN;
    const alpha_c = Wall.alphaC(hwlw);
    const needTwoLayer = Wall.needTwoLayer({
      Vu:Math.abs(V) * 1000,
      phi:Number(base.phiShear),
      alpha_c,
      lambda:Number(base.lambda),
      fc:Number(base.fc),
      Acv,
      hwlw,
    });
    const layersOptions = needTwoLayer || isShearWall ? [2] : [1, 2];
    const limits = Wall.spacingLimits(h, lw);
    const vSpacingMax = isShearWall ? Math.min(limits.general, limits.inplaneVertical) : limits.general;
    const hSpacingMax = isShearWall ? Math.min(limits.general, limits.inplaneHorizontal) : limits.general;
    const boundaryOptions = [{ enabled:false, bar:null, countEach:0 }];
    if (input?.allowBoundary !== false) {
      boundaryBars.forEach(bar => boundaryCounts.forEach(countEach => {
        boundaryOptions.push({ enabled:true, bar, countEach });
      }));
    }

    const horizontalProfiles = [];
    for (const layers of layersOptions) {
      for (const hBar of hBars) {
        const hInfo = barTable[hBar];
        const feasible = [];
        for (const hSp of spacings) {
          if (hSp > hSpacingMax + 1e-9) continue;
          const rhot = layers * hInfo.area / (h * hSp);
          const mins = Wall.minRho({ seismic, isShearWall, needTwoLayer, hwlw, rhot });
          if (rhot + 1e-12 < mins.rhotMin) continue;

          const shearBase = { ...base, hBarDb:hInfo.db, layers, rhot };
          const shear = Evaluator.shearScore(shearBase, { P, V });
          if (!shear.capacity?.valid || !Number.isFinite(shear.shearControlUtilization)
            || shear.shearControlUtilization > 1 + 1e-9) continue;
          feasible.push({ layers, hBar, hInfo, hSp, rhot, mins, shear });
        }
        feasible.sort((a, b) => a.rhot - b.rhot || b.hSp - a.hSp);
        if (feasible.length) horizontalProfiles.push(feasible[0]);
      }
    }

    const candidates = [];
    for (const profile of horizontalProfiles) {
      const { layers, hBar, hInfo, hSp, rhot, mins, shear } = profile;
      for (const vBar of vBars) {
            const vInfo = barTable[vBar];
            for (const vSp of spacings) {
              if (vSp > vSpacingMax + 1e-9) continue;
              const rhol = layers * vInfo.area / (h * vSp);
              if (rhol + 1e-12 < mins.rholMin) continue;

              for (const boundary of boundaryOptions) {
                const bInfo = boundary.enabled ? barTable[boundary.bar] : null;
                const pmBase = {
                  ...base,
                  hBarDb:hInfo.db,
                  vBarArea:vInfo.area,
                  vBarDb:vInfo.db,
                  vSp,
                  layers,
                  boundaryBarArea:boundary.enabled ? bInfo.area : 0,
                  boundaryBarDb:boundary.enabled ? bInfo.db : 0,
                  boundaryBarCountEach:boundary.countEach,
                  pmSteps:Number(input?.pmSteps) || 72,
                  rhot,
                };
                const pm = Evaluator.evaluatePMDemand(pmBase, { P, M });
                if (pm.status !== 'evaluated' || !pm.ok) continue;

                const verticalActualRatio = pm.Ast / (h * lw);
                const steelIndex = verticalActualRatio + rhot;
                const congestionIndex = (100 / vSp) * layers + (100 / hSp) * layers
                  + boundary.countEach * 2 / Math.max(lw / 100, 1);
                candidates.push({
                  vBar, vSp, hBar, hSp, layers,
                  boundaryEnabled:boundary.enabled,
                  boundaryBar:boundary.bar,
                  boundaryCountEach:boundary.countEach,
                  cover:Number(base.cover),
                  rhol, rhot,
                  verticalActualRatio,
                  pmUtilization:pm.utilization,
                  shearUtilization:shear.shearControlUtilization,
                  Ast:pm.Ast,
                  AstDistributed:pm.AstDistributed,
                  AstBoundary:pm.AstBoundary,
                  phiMn:pm.phiMn,
                  shearCapacity:shear.shearCapacity,
                  actualVSpacing:pm.actualSpacing,
                  steelIndex,
                  congestionIndex,
                });
              }
            }
      }
    }

    candidates.sort((a, b) => (
      a.steelIndex - b.steelIndex
      || a.congestionIndex - b.congestionIndex
      || Math.max(a.pmUtilization, a.shearUtilization) - Math.max(b.pmUtilization, b.shearUtilization)
      || b.vSp - a.vSp
      || b.hSp - a.hSp
    ));
    const unique = [];
    const seen = new Set();
    for (const candidate of candidates) {
      const key = candidateKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(candidate);
      if (unique.length >= (Number(input?.limit) || 5)) break;
    }
    return {
      status:unique.length ? 'evaluated' : 'no-solution',
      reason:unique.length ? '' : '候選範圍內沒有同時滿足 P-M、剪力、最小配筋、筋距與可配置性的方案',
      needTwoLayer,
      spacingLimits:{ vertical:vSpacingMax, horizontal:hSpacingMax },
      evaluatedCount:candidates.length,
      candidates:unique,
    };
  };

  root.WallRebarDesigner = WallRebarDesigner;
})(typeof window !== 'undefined' ? window : globalThis);
