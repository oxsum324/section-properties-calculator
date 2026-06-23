/* 鋼筋混凝土工具箱 — 剪力牆工況檢核核心
 *
 * 給定剪力牆 base 計算結果與單一載重工況，輸出 P-M、剪力、SBE、
 * 剪摩擦與 overall 狀態。保持 DOM-free，供頁面與單元測試共用。
 */
(function (root) {
  const WallEvaluator = {};

  WallEvaluator.nominalMomentAtPu = function (nominal, Pu) {
    let best = null;
    const points = Array.isArray(nominal) ? nominal : [];
    for (let i = 0; i < points.length - 1; i++) {
      const A = points[i];
      const B = points[i + 1];
      if ((A.P - Pu) * (B.P - Pu) <= 0 && A.P !== B.P) {
        const t = (Pu - A.P) / (B.P - A.P);
        const M = A.M + t * (B.M - A.M);
        if (best == null || M > best) best = M;
      }
    }
    return best == null ? 0 : Math.abs(best);
  };

  WallEvaluator.reviewWarnings = function (base, result) {
    const warnings = Array.isArray(base.scopeWarnings) ? [...base.scopeWarnings] : [];
    if (!result.pmAxialOk) {
      warnings.push(`Pu=${Number(result.Pu).toFixed(1)} tf 超出 P-M 設計軸力封包 (${isFinite(result.pmPMin) ? result.pmPMin.toFixed(1) : '—'}~${isFinite(result.pmPMax) ? result.pmPMax.toFixed(1) : '—'} tf)，c@Pu 與 φMn 不採用`);
    }
    if (result.noSbeHookRequired || result.noSbeTieRequired) {
      const parts = [];
      if (result.noSbeHookRequired) parts.push('水平筋端部彎鉤/U型筋');
      if (result.noSbeTieRequired) parts.push('邊界縱筋橫向束制');
      warnings.push(`免 SBE 邊界細部仍須圖說確認：${parts.join('、')}`);
    }
    if (result.shearFricActive && !result.shearFricOk) {
      warnings.push('水平施工縫剪摩擦強度不足或 Vn 上限不足，須調整穿縫筋、界面處理或牆段設計');
    }
    if (base.hasJoint && result.shearFricOk) {
      warnings.push(`水平施工縫剪摩擦已初估：仍須於圖說註明「${base.shearFricSurface.label}」並確認穿縫筋錨定`);
    }
    if (result.shearFricFyCapped) {
      warnings.push(`剪摩擦 fy 設計值依 20.2.2.4 採 ${result.shearFricFyDesign.toFixed(0)} kgf/cm²，不採輸入 fy=${base.fy.toFixed(0)} 全值`);
    }
    if (result.shearPhiMode === 'vmn-not-applicable') {
      warnings.push('Mu≤0 或 Mn@Pu≤0，Vmn=Ve·Mn/Mu 不適用；需確認剪力 φ 採用依據');
    }
    return warnings;
  };

  WallEvaluator.evaluateLoadCase = function (base, lc) {
    const Wall = root.Wall;
    const PMSection = root.PMSection;
    if (!Wall || !PMSection) throw new Error('WallEvaluator requires Wall and PMSection modules');

    const Pu = lc.Pu;
    const Mu = lc.Mu;
    const MuAbs = Math.abs(Mu);
    const Ve = Wall.designShear({
      mode: lc.shearDemandMode,
      Vu: lc.Vu,
      Vuns: lc.Vuns,
      VuEh: lc.VuEh,
      omegaV: lc.omegaV,
      omegaW: lc.omegaW,
    });
    const dem = PMSection.checkDemand(base.pm.design, Pu, Mu);
    const pmAxialOk = dem.axialOk !== false;
    const cAtPu = PMSection.cAtP(base.pm.nominal, Pu);
    const cUsable = pmAxialOk && isFinite(cAtPu);
    const MnNomAtPu = WallEvaluator.nominalMomentAtPu(base.pm.nominal, Pu);

    let shearPhiMode = 'flexure-comparison';
    let shearPhiNote = '';
    let Vmn_kgf = null;
    let flexureControlled = false;
    if (Ve <= 0) {
      shearPhiMode = 'zero-shear';
      shearPhiNote = 'Ve=0，剪力需求不控制；φVn 僅列示容量。';
    } else if (MuAbs > 0 && MnNomAtPu > 0) {
      Vmn_kgf = (Ve * 1000) * (MnNomAtPu / MuAbs);
      flexureControlled = base.Vn < Vmn_kgf;
      shearPhiNote = flexureControlled
        ? `Vn=${(base.Vn/1000).toFixed(1)} tf < Vmn=${(Vmn_kgf/1000).toFixed(1)} tf，採 φ=0.60`
        : `Vn=${(base.Vn/1000).toFixed(1)} tf ≥ Vmn=${(Vmn_kgf/1000).toFixed(1)} tf，採 φ=0.75`;
    } else {
      shearPhiMode = 'vmn-not-applicable';
      shearPhiNote = 'Mu≤0 或 Mn@Pu≤0，Vmn=Ve·Mn/Mu 無法建立；須確認此工況之剪力 φ 採用依據。';
    }

    const phiShear = flexureControlled ? 0.60 : 0.75;
    const phiVn = phiShear * base.Vn;
    const shearOk = phiVn >= Ve * 1000 - 1e-9;
    const vnMaxOk = Ve * 1000 <= phiShear * base.VnMaxSingle + 1e-9;
    const needTwoLayer = Wall.needTwoLayer({
      Vu: Ve * 1000,
      phi: phiShear,
      alpha_c: base.alpha_c,
      lambda: base.lambda,
      fc: base.fc,
      Acv: base.Acv,
      hwlw: base.hwlw,
    });
    const twoLayerOk = !needTwoLayer || base.nLayer >= 2;

    const S = base.tw * base.lw * base.lw / 6;
    const sigmaFiber = base.Ag > 0 ? (Pu * 1000 / base.Ag + MuAbs * 1e5 / S) : 0;
    const sigmaTrig = sigmaFiber > 0.2 * base.fc;
    const duhwEff = Math.max(0.005, Number(lc.duhw) || base.duhw);
    const cLimit = Wall.beStrainTrigger(base.lw, duhwEff);
    const cTrig = cUsable && cAtPu >= cLimit;
    const sbeReq = base.seismic && (cTrig || sigmaTrig);
    const sbeHoriz = cUsable ? Wall.beHorizontalLength(cAtPu, base.lw) : NaN;
    const sbeVert = Ve > 0 ? Wall.beExtensionLength(base.lw, MuAbs * 1e5, Ve * 1000) : base.lw;
    const sbeExt = Wall.sbeExtension({ method: 'linear', fc: base.fc, sigmaMax: sigmaFiber, lw: base.lw });
    const sbeLengthOk = !sbeReq ? true : (isFinite(sbeHoriz) ? base.lbe >= sbeHoriz - 1e-9 : null);
    const bWidthMin = base.hu / 16;
    const cRatio = (cUsable && base.lw > 0) ? cAtPu / base.lw : NaN;
    const b30Required = sbeReq && isFinite(cRatio) && cRatio >= 0.375;
    const sbeBWidthOk = !sbeReq || base.bComp >= bWidthMin - 1e-9;
    const sbeCratioBOk = !sbeReq ? true : (isFinite(cRatio) ? (!b30Required || base.bComp >= 30 - 1e-9) : null);
    const hxLimit = Math.min(35, (2 / 3) * base.bComp);
    const sbeHxOk = !sbeReq || base.hx <= hxLimit + 1e-9;
    const sbeSpOk = !sbeReq || base.sTie <= base.sbeSpLimit + 1e-9;
    const sbeAshOk = !sbeReq || base.AshProv >= base.AshReq - 1e-9;
    const sbeDesignOk = !sbeReq || (sbeLengthOk === true && sbeBWidthOk && sbeCratioBOk === true && sbeHxOk && sbeSpOk && sbeAshOk);

    const shearFricLim = Wall.shearFricLimit(base.lambda, base.fc, base.Acv);
    const shearFricActive = base.hasJoint && (Ve * 1000 > shearFricLim);
    const shearFricPhi = phiShear;
    const shearFricDesign = Wall.shearFrictionDesign({
      Vu: Ve * 1000,
      phi: shearFricPhi,
      mu: base.shearFricSurface.mu,
      fy: base.fy,
      Avf: base.shearFricAvfProv,
      fc: base.fc,
      Ac: base.Acv,
      surface: base.jointSurface,
    });
    const shearFricAvfReq = shearFricActive ? shearFricDesign.AvfReq : 0;
    const shearFricOk = !base.hasJoint || !shearFricActive || (shearFricDesign.strengthOk && shearFricDesign.capOk);
    const shearFricWebAvfReq = Math.max(0, shearFricAvfReq - base.shearFricBoundaryAvf);
    const shearFricSVReq = shearFricWebAvfReq > 0 && base.shearFricWebLength > 0 && base.nLayer > 0 && base.aV > 0
      ? (base.nLayer * base.aV * base.shearFricWebLength) / shearFricWebAvfReq
      : Infinity;
    const shearFricFyCapped = base.fy > base.shearFricFyDesign + 1e-9;
    const needShearFric = shearFricActive && !shearFricOk;
    const noSbeHookThreshold = 0.265 * base.lambda * Math.sqrt(base.fc) * base.Acv;
    const noSbeHookRequired = base.seismic && !sbeReq && (Ve * 1000 >= noSbeHookThreshold);
    const rhoBoundary = (base.tw > 0 && base.lbe > 0) ? base.AsBEend / (base.tw * base.lbe) : 0;
    const rhoBoundaryLimit = base.fy > 0 ? 28 / base.fy : Infinity;
    const noSbeTieRequired = base.seismic && !sbeReq && rhoBoundary > rhoBoundaryLimit + 1e-9;

    const pmUtil = dem.util;
    const shearUtil = phiVn > 0 ? (Ve * 1000) / phiVn : (Ve > 0 ? Infinity : 0);
    const sbeIndex = Math.max(
      0.2 * base.fc > 0 ? sigmaFiber / (0.2 * base.fc) : 0,
      cUsable && cLimit > 0 ? cAtPu / cLimit : 0
    );
    const shearFricUtil = shearFricActive && base.shearFricAvfProv > 0 ? shearFricDesign.AvfReq / base.shearFricAvfProv : 0;
    const overallOk = base.geomModelOk && !base.isPier && pmAxialOk && dem.ok && shearOk && vnMaxOk && twoLayerOk && sbeDesignOk && shearFricOk && base.rholOk && base.rhotOk && base.spVOk && base.spHOk;

    const result = {
      ...lc,
      Ve,
      cAtPu,
      phiMn: dem.phiMn,
      pmUtil,
      pmOk: dem.ok,
      pmAxialOk,
      pmPMin: dem.pMin,
      pmPMax: dem.pMax,
      pmOutOfRange: dem.outOfRange === true,
      MnNomAtPu,
      Vmn_kgf,
      phiShear,
      phiVn,
      shearPhiMode,
      shearPhiNote,
      flexureControlled,
      shearOk,
      vnMaxOk,
      needTwoLayer,
      twoLayerOk,
      shearUtil,
      sigmaFiber,
      sigmaTrig,
      cLimit,
      cTrig,
      sbeReq,
      sbeHoriz,
      sbeVert,
      sbeExtX: sbeExt.x,
      sbeLengthOk,
      bWidthMin,
      cRatio,
      b30Required,
      sbeBWidthOk,
      sbeCratioBOk,
      hxLimit,
      sbeHxOk,
      sbeSpOk,
      sbeAshOk,
      sbeDesignOk,
      sbeIndex,
      shearFricLim,
      shearFricActive,
      shearFricPhi,
      shearFricFyDesign: base.shearFricFyDesign,
      shearFricFyCapped,
      shearFricNWeb: base.shearFricNWeb,
      shearFricBoundaryAvf: base.shearFricBoundaryAvf,
      shearFricWebAvf: base.shearFricWebAvf,
      shearFricOk,
      shearFricAvfReq,
      shearFricAvfProv: base.shearFricAvfProv,
      shearFricWebAvfReq,
      shearFricSVReq,
      shearFricWebLength: base.shearFricWebLength,
      shearFricDesign,
      shearFricUtil,
      shearFricVnMaxOk: !shearFricActive || shearFricDesign.capOk,
      needShearFric,
      noSbeHookThreshold,
      noSbeHookRequired,
      rhoBoundary,
      rhoBoundaryLimit,
      noSbeTieRequired,
      overallOk,
    };
    result.reviewWarnings = WallEvaluator.reviewWarnings(base, result);
    return result;
  };

  root.WallEvaluator = WallEvaluator;
})(typeof window !== 'undefined' ? window : globalThis);
