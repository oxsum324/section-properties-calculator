/* 鋼筋混凝土工具箱 — 剪力牆 base 組裝
 *
 * 將原始輸入 g 組成後續檢核需要的幾何、配筋、P-M、剪力容量、
 * SBE 圍束基本量與剪摩擦提供量。保持 DOM-free。
 */
(function (root) {
  const WallBase = {};

  function rebarTable() {
    return (root.Rebar && root.Rebar.REBAR_TABLE) || root.REBAR_TABLE || {};
  }

  WallBase.barArea = function (name) {
    const tbl = rebarTable();
    return tbl[name] ? tbl[name].area : 1.267;
  };

  WallBase.barDia = function (name) {
    const tbl = rebarTable();
    return tbl[name] ? tbl[name].db : 1.27;
  };

  WallBase.webVerticalBarCount = function (g) {
    const webStart = g.lbe;
    const webEnd = g.lw - g.lbe;
    if (!(webEnd > webStart) || !(g.sV > 0)) return 0;
    return Math.max(0, Math.round((webEnd - webStart) / g.sV));
  };

  WallBase.buildBars = function (g) {
    const bars = [];
    const aBE = WallBase.barArea(g.dBE);
    const aV = WallBase.barArea(g.dV);

    const rowsBE = Math.max(1, Math.round(g.nBE / 2));
    const AsRowBE = (g.nBE * aBE) / rowsBE;
    const y0 = g.cover;
    const y1 = Math.max(g.cover + 0.1, g.lbe - g.cover);
    for (let k = 0; k < rowsBE; k++) {
      const yy = rowsBE === 1 ? (y0 + y1) / 2 : y0 + (y1 - y0) * k / (rowsBE - 1);
      bars.push({ y: yy, As: AsRowBE, kind: 'BE' });
      bars.push({ y: g.lw - yy, As: AsRowBE, kind: 'BE' });
    }

    const webStart = g.lbe;
    const webEnd = g.lw - g.lbe;
    const AsRowWeb = g.nLayer * aV;
    const nWeb = WallBase.webVerticalBarCount(g);
    for (let i = 0; i < nWeb; i++) {
      bars.push({
        y: webStart + (i + 0.5) * (webEnd - webStart) / nWeb,
        As: AsRowWeb,
        kind: 'WEB',
      });
    }
    return bars;
  };

  WallBase.geometry = function (g) {
    const Wall = root.Wall;
    const Ag = g.tw * g.lw;
    const Acv = g.tw * g.lw;
    const hwlw = g.lw > 0 ? g.hw / g.lw : 0;
    const isPier = Wall.isWallPier(g.hw, g.lw, g.tw);
    const fcOk = Wall.checkFcLimit(g.fc, true) || !g.seismic;
    const scopeWarnings = [];
    if (!g.scopeSingleWall) scopeWarnings.push('連肢牆、連接梁或多牆段耦合效應須完整模型分析');
    if (!g.scopeNoOpening) scopeWarnings.push('開口牆或臨界斷面削弱須另行建立有效斷面與力流模型');
    if (!g.scopeAnalysisReady) scopeWarnings.push('Pu / Mu / Ve 尚未確認包含樓版、集力構件、扭轉與整體牆系統效應');
    const scopeOk = scopeWarnings.length === 0;
    const positiveGeomOk = [g.fc, g.fy, g.fyt, g.tw, g.lw, g.hw, g.cover, g.lbe, g.sV, g.sH, g.sTie, g.hx, g.hu, g.bComp]
      .every(v => Number.isFinite(v) && v > 0);
    const coverOk = g.tw > 0 && g.cover > 0 && (2 * g.cover) < g.tw;
    const lbeCoverOk = g.lbe > 2 * g.cover;
    const lbeOverlapOk = (2 * g.lbe) < g.lw;
    const geomModelOk = positiveGeomOk && coverOk && lbeCoverOk && lbeOverlapOk;
    const geomModelIssues = [];
    if (!positiveGeomOk) geomModelIssues.push('材料、幾何、間距與圍束輸入須為正值');
    if (!coverOk) geomModelIssues.push('cover 需小於 tw/2，圍束核心寬度 bc=tw−2cover 才有效');
    if (!lbeCoverOk) geomModelIssues.push('ℓbe 需大於 2cover，邊界縱筋才可放入邊界區內');
    if (!lbeOverlapOk) geomModelIssues.push('2ℓbe 需小於 ℓw，兩端邊界區不可重疊');
    return { Ag, Acv, hwlw, isPier, fcOk, scopeWarnings, scopeOk, positiveGeomOk, coverOk, lbeCoverOk, lbeOverlapOk, geomModelOk, geomModelIssues };
  };

  WallBase.buildBase = function (g, opt = {}) {
    const Wall = root.Wall;
    const PMSection = root.PMSection;
    if (!Wall || !PMSection) throw new Error('WallBase requires Wall and PMSection modules');

    const geom = WallBase.geometry(g);
    const bars = WallBase.buildBars(g);
    const aV = WallBase.barArea(g.dV);
    const aH = WallBase.barArea(g.dH);
    const aBE = WallBase.barArea(g.dBE);
    const aTie = WallBase.barArea(g.dTie);
    const AsBEend = g.nBE * aBE;
    const rhol = g.sV > 0 ? (g.nLayer * aV) / (g.tw * g.sV) : 0;
    const rhot = g.sH > 0 ? (g.nLayer * aH) / (g.tw * g.sH) : 0;
    const AstTotal = bars.reduce((s, b) => s + b.As, 0);

    const sec = { b: g.tw, h: g.lw, bars };
    const mat = { fc: g.fc, fy: g.fy };
    const pm = PMSection.curve(sec, mat, { steps: opt.pmSteps || 140 });
    const cAtPu = PMSection.cAtP(pm.nominal, g.Pu);
    const dem = PMSection.checkDemand(pm.design, g.Pu, g.Mu);
    const pmAxialOk = dem.axialOk !== false;
    const pmOutOfRange = dem.outOfRange === true;

    const alpha_c = Wall.alphaC(geom.hwlw);
    const Vn = Wall.vn({ Acv: geom.Acv, alpha_c, lambda: g.lambda, fc: g.fc, rhot, fy: g.fyt });
    const VnMaxSingle = Wall.vnMaxSingle(g.fc, geom.Acv);

    const bc = Math.max(0, g.tw - 2 * g.cover);
    const so = Math.min(15, Math.max(10, 10 + (35 - g.hx) / 3));
    const sbeSpLimit = Math.min(Math.min(g.tw, g.lbe) / 3, 6 * WallBase.barDia(g.dBE), so);
    const AshReqRatio = 0.09 * g.fc / g.fyt;
    const AshReq = AshReqRatio * g.sTie * bc;
    const AshProv = g.nLegTie * aTie;

    const spLim = Wall.spacingLimits(g.tw, g.lw);
    const spVmax = Math.min(spLim.general, spLim.inplaneVertical);
    const spHmax = Math.min(spLim.general, spLim.inplaneHorizontal);

    const shearFricLim = Wall.shearFricLimit(g.lambda, g.fc, geom.Acv);
    const shearFricSurface = Wall.shearFrictionSurface(g.jointSurface, g.lambda);
    const shearFricFyDesign = Math.min(g.fy, 4200);
    const shearFricNWeb = WallBase.webVerticalBarCount(g);
    const shearFricBoundaryAvf = 2 * g.nBE * aBE;
    const shearFricWebAvf = shearFricNWeb * g.nLayer * aV;
    const shearFricAvfProv = shearFricBoundaryAvf + shearFricWebAvf;
    const shearFricWebLength = Math.max(0, g.lw - 2 * g.lbe);

    return {
      ...geom,
      bars,
      sec,
      mat,
      pm,
      cAtPu,
      dem,
      pmAxialOk,
      pmOutOfRange,
      aV,
      aH,
      aBE,
      aTie,
      AsBEend,
      rhol,
      rhot,
      AstTotal,
      alpha_c,
      Vn,
      VnMaxSingle,
      bc,
      so,
      sbeSpLimit,
      AshReqRatio,
      AshReq,
      AshProv,
      spLim,
      spVmax,
      spHmax,
      shearFricLim,
      shearFricSurface,
      shearFricFyDesign,
      shearFricNWeb,
      shearFricBoundaryAvf,
      shearFricWebAvf,
      shearFricAvfProv,
      shearFricWebLength,
    };
  };

  root.WallBase = WallBase;
})(typeof window !== 'undefined' ? window : globalThis);
