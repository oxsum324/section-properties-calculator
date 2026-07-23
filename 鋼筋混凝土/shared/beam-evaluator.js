/* 鋼筋混凝土工具箱 — RC 梁逐工況強度 / 扭力邊界 evaluator
 *
 * 保持 DOM-free。撓曲容量由梁頁既有應變相容核心提供；本模組負責依每一完整
 * 載重 tuple 的 Pu / Vu / Tu 重算剪力容量、耐震 Vc 歸零條件及扭力門檻。
 * 超過扭力門檻時，因本工具沒有建立 φTn 與 V-T 互制面，必須失敗關閉。
 */
(function (root) {
  const BeamEvaluator = {};
  const FAIL_CLOSED_BASE = 1e12;

  const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;

  BeamEvaluator.computeShearState = function (base, demand) {
    const fields = ['fc', 'fyt', 'bw', 'h', 'd', 'Ag', 'Av', 's', 'rhoShear', 'phiShear'];
    const values = Object.fromEntries(fields.map(key => [key, Number(base?.[key])]));
    const Pu = Number(demand?.Pu);
    const Vu = Math.abs(Number(demand?.Vu));
    const Tu = Math.abs(Number(demand?.Tu));
    if (![...Object.values(values), Pu, Vu, Tu].every(Number.isFinite)) {
      return { status:'invalid-demand', valid:false, reason:'梁剪力評估輸入須為有限值' };
    }
    const { fc, fyt, bw, h, d, Ag, Av, s, rhoShear, phiShear } = values;
    if (![fc, fyt, bw, h, d, Ag, phiShear].every(value => value > 0) || Av < 0 || s < 0) {
      return { status:'capacity-unresolved', valid:false, reason:'梁剪力容量參數未完整建立' };
    }

    const lambda = finitePositive(base?.lambda) ? Number(base.lambda) : 1;
    const bf = finitePositive(base?.bf) ? Number(base.bf) : bw;
    const hf = Number.isFinite(Number(base?.hf)) ? Math.max(Number(base.hf), 0) : 0;
    const sectionType = String(base?.sectionType || 'rect');
    const seismic = base?.seismic === true;
    const Ve = Math.max(Number(base?.Ve) || 0, 0);
    const AvProvidedPerS = s > 0 ? Av / s : 0;
    const AvMinPerS = Math.max(0.2 * Math.sqrt(fc) * bw / fyt, 3.5 * bw / fyt);
    const hasMinStir = AvProvidedPerS >= AvMinPerS;
    const rhoForVc = Math.max(rhoShear || 0, 0.0001);
    const sqrtFc = Math.sqrt(fc);
    const vcBaseStress = 0.53 * lambda * sqrtFc;
    const axialStressRaw = Pu / (6 * Ag);
    const axialStress = Math.min(Math.max(axialStressRaw, -vcBaseStress), 0.05 * fc);
    const vcSimpleStress = Math.max(0, vcBaseStress + axialStress);
    const vcRhoStress = Math.max(0, 2.12 * lambda * Math.cbrt(rhoForVc) * sqrtFc + axialStress);
    const axialFactor = vcBaseStress > 0 ? vcSimpleStress / vcBaseStress : 1;
    const lambdaS = Math.min(1, Math.sqrt(2 / (1 + Math.max(d, 0) / 25)));
    const VcSimple = vcSimpleStress * bw * d;
    const VcRho = vcRhoStress * bw * d;
    const VcRaw = hasMinStir ? Math.max(VcSimple, VcRho) : lambdaS * VcRho;
    const VcMax = 1.33 * lambda * sqrtFc * bw * d;
    const Vc = Math.max(0, Math.min(VcRaw, VcMax));
    const phiVc = phiShear * Vc;
    const VsProvided = s > 0 ? Av * fyt * d / s : 0;
    const phiVs = phiShear * VsProvided;
    const phiVn = phiVc + phiVs;
    const shearDemand = seismic ? Math.max(Vu, Ve) : Vu;
    const shearDemandSource = seismic && Ve > Vu ? 'Ve' : 'Vu';
    const forceVc0 = seismic && Ve > 0.5 * shearDemand && Pu < Ag * fc / 20;
    const phiVnEff = forceVc0 ? phiVs : phiVn;

    const torsionActive = base?.enableTorsion === true;
    let TuThreshold = 0;
    let torsionRatio = 0;
    let torsionNegligible = true;
    let torsionStatus = torsionActive ? 'below-threshold' : 'inactive';
    if (torsionActive) {
      const effectiveFlangeWidth = sectionType === 'rect' ? bw : bf;
      const Acp = sectionType === 'rect' ? bw * h : bw * h + (effectiveFlangeWidth - bw) * hf;
      const pcp = sectionType === 'rect' ? 2 * (bw + h) : 2 * (effectiveFlangeWidth + h);
      TuThreshold = pcp > 0 ? phiShear * 0.265 * lambda * sqrtFc * (Acp * Acp / pcp) : 0;
      torsionRatio = TuThreshold > 0 ? Tu / TuThreshold : (Tu > 0 ? Infinity : 0);
      torsionNegligible = Tu < TuThreshold;
      if (!torsionNegligible) {
        const review = String(base?.torsionDesignStatus || 'pending');
        torsionStatus = review === 'ng'
          ? 'not-approved'
          : review === 'ok' ? 'capacity-unresolved' : 'review-required';
      }
    }

    return {
      status:'evaluated', valid:true,
      Pu, Vu, Tu, lambda, Vc, phiVc, Av, AvProvidedPerS,
      Vs_provided:VsProvided, phiVs, phiVn, forceVc0, phiVn_eff:phiVnEff,
      shearDemand, shearDemandSource, AvMinPerS, hasMinStir,
      lambdaS, rhoForVc, axialFactor, vcBaseStress, axialStress, vcSimpleStress, vcRhoStress,
      Tu_th:TuThreshold, torNegligible:torsionNegligible,
      torsionNeedsDesign:torsionActive && !torsionNegligible,
      torsionStatus, torsionRatio,
    };
  };

  BeamEvaluator.evaluateDemand = function (base, demand) {
    const M = Number(demand?.M);
    const V = Number(demand?.V);
    const P = Number(demand?.P);
    const T = Number(demand?.T);
    if (![M, V, P, T].every(Number.isFinite)) {
      return { status:'invalid-demand', ok:false, reason:'M / V / P / T 須為有限值' };
    }

    const phiMnPos = Number(base?.phiMnPos);
    const phiMnNeg = Number(base?.phiMnNeg);
    const flexureCapacity = M >= 0 ? phiMnPos : phiMnNeg;
    const flexureDemand = Math.abs(M);
    if (flexureDemand > 0 && !finitePositive(flexureCapacity)) {
      return { status:'capacity-unresolved', ok:false, M, V, P, T, reason:'彎矩容量未建立' };
    }
    const flexureUtilization = flexureDemand > 0 ? flexureDemand / flexureCapacity : 0;

    const shearBase = { ...(base?.shearBase || {}) };
    if (Math.abs(T) > 1e-9) shearBase.enableTorsion = true;
    const shear = BeamEvaluator.computeShearState(shearBase, {
      Pu:P * 1000,
      Vu:Math.abs(V) * 1000,
      Tu:Math.abs(T) * 1e5,
    });
    if (!shear.valid || !finitePositive(shear.phiVn_eff)) {
      return { status:shear.status || 'capacity-unresolved', ok:false, M, V, P, T, flexureUtilization, shear, reason:shear.reason || '剪力容量未建立' };
    }
    const shearUtilization = shear.shearDemand / shear.phiVn_eff;
    const torsionBoundaryStatus = shear.torsionStatus;
    const torsionResolved = ['inactive', 'below-threshold'].includes(torsionBoundaryStatus);
    const status = torsionResolved
      ? 'evaluated'
      : torsionBoundaryStatus === 'review-required'
        ? 'torsion-review-required'
        : torsionBoundaryStatus === 'not-approved'
          ? 'torsion-not-approved'
          : 'torsion-capacity-unresolved';
    const utilization = Math.max(flexureUtilization, shearUtilization, Number.isFinite(shear.torsionRatio) ? shear.torsionRatio : 0);
    return {
      status,
      ok:status === 'evaluated' && utilization <= 1,
      utilization,
      M, V, P, T,
      flexureDirection:M >= 0 ? 'positive' : 'negative',
      flexureCapacity,
      flexureDemand,
      flexureUtilization,
      shearCapacity:shear.phiVn_eff / 1000,
      shearDemand:shear.shearDemand / 1000,
      shearUtilization,
      torsionThreshold:shear.Tu_th / 1e5,
      torsionRatio:shear.torsionRatio,
      torsionStatus:torsionBoundaryStatus,
      shear,
      reason:status === 'evaluated' ? '' : 'Tu 已達扭力門檻；本工具未建立 φTn / V-T 互制容量，須完成另案詳算',
    };
  };

  BeamEvaluator.flexureScore = function (base, demand, direction) {
    const M = Number(demand?.M);
    if (!Number.isFinite(M)) return NaN;
    if (direction === 'positive' && M <= 0) return NaN;
    if (direction === 'negative' && M >= 0) return NaN;
    const result = BeamEvaluator.evaluateDemand(base, demand);
    if (result.status === 'invalid-demand' || result.status === 'capacity-unresolved') {
      return { score:FAIL_CLOSED_BASE, scoreLabel:'容量待確認', ...result };
    }
    return {
      score:result.flexureUtilization,
      scoreLabel:result.flexureUtilization.toFixed(3),
      ...result,
    };
  };

  BeamEvaluator.shearTorsionScore = function (base, demand) {
    const result = BeamEvaluator.evaluateDemand(base, demand);
    const labels = {
      'invalid-demand':'需求無效',
      'capacity-unresolved':'容量待確認',
      'torsion-review-required':'扭力詳算待複核',
      'torsion-not-approved':'扭力詳算不符',
      'torsion-capacity-unresolved':'扭力容量待確認',
    };
    if (result.status !== 'evaluated') {
      const torsionRank = Number.isFinite(result.torsionRatio) ? Math.max(result.torsionRatio, 0) : 0;
      return {
        score:FAIL_CLOSED_BASE + Math.min(torsionRank, 1e6),
        scoreLabel:labels[result.status] || '待確認',
        ...result,
      };
    }
    const boundaryUtilization = Math.max(result.shearUtilization, result.torsionRatio || 0);
    return {
      score:boundaryUtilization,
      scoreLabel:boundaryUtilization.toFixed(3),
      ...result,
    };
  };

  root.BeamEvaluator = BeamEvaluator;
})(typeof window !== 'undefined' ? window : globalThis);
