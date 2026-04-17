(function initSteelConnectionCalculator(globalScope) {
  const DESIGN_FACTORS = {
    boltShear: { LRFD: 0.75, ASD: 2.0 },
    boltTension: { LRFD: 0.75, ASD: 2.0 },
    bearing: { LRFD: 0.75, ASD: 2.0 },
    blockShear: { LRFD: 0.75, ASD: 2.0 },
    weld: { LRFD: 0.75, ASD: 2.0 },
    grossYield: { LRFD: 0.9, ASD: 1.67 },
    shearYield: { LRFD: 0.9, ASD: 1.67 },
    netRupture: { LRFD: 0.75, ASD: 2.0 },
    panelZone: { LRFD: 1.0, ASD: 1.5 },
  };

  const STANDARD_EDGE_DISTANCE_TABLE = {
    sheared: [
      { maxDiameter: 13, value: 22.0 },
      { maxDiameter: 16, value: 28.5 },
      { maxDiameter: 20, value: 32.0 },
      { maxDiameter: 22, value: 38.0 },
      { maxDiameter: 24, value: 44.5 },
      { maxDiameter: 27, value: 50.0 },
      { maxDiameter: 30, value: 57.0 },
    ],
    rolled: [
      { maxDiameter: 13, value: 19.0 },
      { maxDiameter: 16, value: 22.0 },
      { maxDiameter: 20, value: 25.0 },
      { maxDiameter: 22, value: 28.5 },
      { maxDiameter: 24, value: 32.0 },
      { maxDiameter: 27, value: 38.0 },
      { maxDiameter: 30, value: 41.0 },
    ],
  };

  const HOLE_TYPE_RULES = {
    standard: {
      label: "標準孔",
      spacingIncrement: () => 0,
      endEdgeIncrement: () => 0,
      sideEdgeIncrement: () => 0,
      allowedForBearing: true,
    },
    oversized: {
      label: "超大孔",
      spacingIncrement: (db) => byDiameter(db, 3.0, 5.0, 6.5),
      endEdgeIncrement: (db) => byDiameter(db, 1.5, 3.0, 3.0),
      sideEdgeIncrement: (db) => byDiameter(db, 1.5, 3.0, 3.0),
      allowedForBearing: false,
    },
    short_slot_parallel: {
      label: "短槽孔，平行於力方向",
      spacingIncrement: (db) => byDiameter(db, 5.0, 6.5, 8.0),
      endEdgeIncrement: (db) => byDiameter(db, 3.0, 3.0, 4.5),
      sideEdgeIncrement: () => 0,
      allowedForBearing: false,
    },
    short_slot_perpendicular: {
      label: "短槽孔，垂直於力方向",
      spacingIncrement: () => 0,
      endEdgeIncrement: () => 0,
      sideEdgeIncrement: (db) => byDiameter(db, 3.0, 3.0, 4.5),
      allowedForBearing: true,
    },
    long_slot_parallel: {
      label: "長槽孔，平行於力方向",
      spacingIncrement: (db) => (db <= 24 ? 1.5 * db - 1.5 : 1.5 * db - 1.5),
      endEdgeIncrement: (db) => 0.75 * db,
      sideEdgeIncrement: () => 0,
      allowedForBearing: false,
    },
    long_slot_perpendicular: {
      label: "長槽孔，垂直於力方向",
      spacingIncrement: () => 0,
      endEdgeIncrement: () => 0,
      sideEdgeIncrement: (db) => 0.75 * db,
      allowedForBearing: true,
    },
  };

  const CONNECTION_META = {
    single_plate: {
      reportTitle: "剪力接頭檢核計算書",
      reportSubtitle: "Single Plate Shear Connection Report",
      pageTitle: "鋼構剪力接頭設計與檢核",
      pageDescription: "單剪力板 Shear Tab｜承壓型螺栓、孔承壓、塊狀撕裂、銲接與細部規定整合",
      complianceReady: false,
    },
    column_splice: {
      reportTitle: "柱續接檢核計算書",
      reportSubtitle: "Column Splice Connection Report",
      pageTitle: "鋼構柱續接設計與檢核",
      pageDescription: "柱翼 / 柱腹續接板｜軸力、剪力、彎矩分流，搭配螺栓、板件與銲接檢核",
      complianceReady: false,
    },
    brace_gusset: {
      reportTitle: "支撐 / Gusset 接頭檢核計算書",
      reportSubtitle: "Brace Gusset Connection Report",
      pageTitle: "鋼構支撐 Gusset 接頭設計與檢核",
      pageDescription: "支撐軸力、Gusset 板、Whitmore 有效寬度、螺栓、塊狀撕裂與銲接檢核",
      complianceReady: false,
    },
    beam_column_moment: {
      reportTitle: "梁柱彎矩接頭檢核計算書",
      reportSubtitle: "Beam-Column Moment Connection Report",
      pageTitle: "鋼構梁柱彎矩接頭設計與檢核",
      pageDescription: "簡化力偶模型｜拉側螺栓、端板張力、腹板剪力傳遞與 Panel Zone 容量檢核",
      complianceReady: false,
    },
    plate_check: {
      reportTitle: "連接板檢核計算書",
      reportSubtitle: "Connection Plate Check Report",
      pageTitle: "鋼構連接板正式規範核算工具",
      pageDescription: "矩形連接板｜全斷面降伏、有效淨斷面斷裂、區塊剪力破壞｜支援幾何推導與面積直輸",
      complianceReady: true,
    },
    tension_member: {
      reportTitle: "拉力構件檢核計算書",
      reportSubtitle: "Tension Member Design Report",
      pageTitle: "鋼構拉力構件正式規範核算工具",
      pageDescription: "受拉構材｜全斷面降伏、有效淨斷面斷裂、長細比、螺栓或銲接接合與區塊剪力整合檢核",
      complianceReady: true,
    },
  };

  function byDiameter(db, le22, at24, ge27) {
    if (db <= 22) return le22;
    if (db <= 24) return at24;
    return ge27;
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toInteger(value, minimum = 0) {
    return Math.max(minimum, Math.round(toNumber(value)));
  }

  function positive(value) {
    return Math.max(toNumber(value), 0);
  }

  function mm2ToKn(stressMpa, areaMm2) {
    return (stressMpa * areaMm2) / 1000;
  }

  function applyDesignStrength(nominal, method, category) {
    const factors = DESIGN_FACTORS[category] || DESIGN_FACTORS.bearing;
    return method === "ASD" ? nominal / factors.ASD : nominal * factors.LRFD;
  }

  function getDesignFactorValue(method, category) {
    const factors = DESIGN_FACTORS[category] || DESIGN_FACTORS.bearing;
    return method === "ASD" ? factors.ASD : factors.LRFD;
  }

  function buildAvailableStrengthLatex(method, category, nominal) {
    const factor = getDesignFactorValue(method, category);
    if (method === "ASD") {
      return String.raw`\frac{R_n}{\Omega} &= \frac{${formatEquationNumber(nominal)}}{${formatEquationNumber(factor)}} = ${formatEquationNumber(applyDesignStrength(nominal, method, category))}\ \text{kN}`;
    }
    return String.raw`\phi R_n &= ${formatEquationNumber(factor)} \times ${formatEquationNumber(nominal)} = ${formatEquationNumber(applyDesignStrength(nominal, method, category))}\ \text{kN}`;
  }

  function safeRatio(demand, available) {
    return available > 0 ? demand / available : Infinity;
  }

  function formatEquationNumber(value) {
    return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
  }

  function boltArea(db) {
    return Math.PI * Math.pow(db, 2) / 4;
  }

  function netHoleWidth(holeDiameter) {
    return holeDiameter + 1.5;
  }

  function getBaseMinimumEdgeDistance(db, edgeFabrication) {
    const table = STANDARD_EDGE_DISTANCE_TABLE[edgeFabrication] || STANDARD_EDGE_DISTANCE_TABLE.rolled;
    const row = table.find((item) => db <= item.maxDiameter);
    return row ? row.value : (edgeFabrication === "sheared" ? 1.75 : 1.25) * db;
  }

  function getHoleRule(holeType) {
    return HOLE_TYPE_RULES[holeType] || HOLE_TYPE_RULES.standard;
  }

  function getMinimumSpacing(state, boltDiameter) {
    const holeRule = getHoleRule(state.holeType);
    return 3 * boltDiameter + holeRule.spacingIncrement(boltDiameter);
  }

  function getMinimumEndEdgeDistance(state, boltDiameter) {
    const holeRule = getHoleRule(state.holeType);
    return getBaseMinimumEdgeDistance(boltDiameter, state.edgeFabrication) + holeRule.endEdgeIncrement(boltDiameter);
  }

  function getMinimumSideEdgeDistance(state, boltDiameter) {
    const holeRule = getHoleRule(state.holeType);
    return getBaseMinimumEdgeDistance(boltDiameter, state.edgeFabrication) + holeRule.sideEdgeIncrement(boltDiameter);
  }

  function getMaximumEdgeDistance(thickness) {
    return Math.min(12 * thickness, 150);
  }

  function getMaximumSpacing(state, thickness) {
    return state.exposureCondition === "weathering" ? Math.min(14 * thickness, 180) : Math.min(24 * thickness, 300);
  }

  function getFillerReduction(state) {
    if (state.fillerExtended || state.fillerThickness <= 6) return { reductionFactor: 1, applies: false, invalid: false };
    if (state.fillerThickness > 19) return { reductionFactor: 0, applies: false, invalid: true };
    return { reductionFactor: Math.max(1.1 - 0.016 * state.fillerThickness, 0), applies: true, invalid: false };
  }

  function createCheck({ key, label, demand, nominal, available, note, equationLines, latexLines, codeRef, equationRef, warning }) {
    return { key, label, demand, nominal, available, ratio: safeRatio(demand, available), note, equationLines, latexLines, codeRef, equationRef, warning: Boolean(warning) };
  }

  function makeDetailCheck(key, label, provided, required, comparator, note, codeRef) {
    const passes = comparator === "gte" ? provided >= required : comparator === "lte" ? provided <= required : Boolean(provided);
    return { key, label, passes, provided, required, comparator, note, codeRef };
  }

  function buildBoltShearCheck({ key, label, demand, boltDiameter, boltUltimateStrength, boltCount, shearPlanes, threadsCondition, designMethod, reductionFactor = 1, note, codeRef = "10.3" }) {
    const area = boltArea(boltDiameter);
    const shearFactor = threadsCondition === "excluded" ? 0.62 : 0.48;
    const nominal = mm2ToKn(shearFactor * boltUltimateStrength, area * boltCount * shearPlanes * reductionFactor);
    const available = applyDesignStrength(nominal, designMethod, "boltShear");
    return createCheck({
      key,
      label,
      demand,
      nominal,
      available,
      note,
      codeRef,
      equationLines: [
        `Ab = π db² / 4 = ${formatEquationNumber(area)} mm²`,
        `Fnv = ${formatEquationNumber(shearFactor)} × Fub = ${formatEquationNumber(shearFactor * boltUltimateStrength)} MPa`,
        `Rn = Fnv × Ab × n × ns × r = ${formatEquationNumber(nominal)} kN`,
      ],
      latexLines: [
        String.raw`\begin{aligned}
A_b &= \frac{\pi d_b^2}{4} = \frac{\pi (${formatEquationNumber(boltDiameter)})^2}{4} = ${formatEquationNumber(area)}\ \text{mm}^2\\
F_{nv} &= ${formatEquationNumber(shearFactor)} F_{ub} = ${formatEquationNumber(shearFactor)} \times ${formatEquationNumber(boltUltimateStrength)} = ${formatEquationNumber(shearFactor * boltUltimateStrength)}\ \text{MPa}\\
R_n &= F_{nv} A_b n n_s r = ${formatEquationNumber(nominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(designMethod, "boltShear", nominal)}
\end{aligned}`,
      ],
    });
  }

  function buildBoltTensionCheck({ key, label, demand, boltDiameter, boltUltimateStrength, boltCount, designMethod, note, codeRef = "10.3" }) {
    const area = boltArea(boltDiameter);
    const nominal = mm2ToKn(0.75 * boltUltimateStrength, area * boltCount);
    const available = applyDesignStrength(nominal, designMethod, "boltTension");
    return createCheck({
      key,
      label,
      demand,
      nominal,
      available,
      note,
      equationLines: [
        `Ab = π db² / 4 = ${formatEquationNumber(area)} mm²`,
        `Fnt = 0.75 × Fub = ${formatEquationNumber(0.75 * boltUltimateStrength)} MPa`,
        `Rn = Fnt × Ab × n = ${formatEquationNumber(nominal)} kN`,
      ],
      codeRef,
      latexLines: [
        String.raw`\begin{aligned}
A_b &= \frac{\pi d_b^2}{4} = \frac{\pi (${formatEquationNumber(boltDiameter)})^2}{4} = ${formatEquationNumber(area)}\ \text{mm}^2\\
F_{nt} &= 0.75 F_{ub} = 0.75 \times ${formatEquationNumber(boltUltimateStrength)} = ${formatEquationNumber(0.75 * boltUltimateStrength)}\ \text{MPa}\\
R_n &= F_{nt} A_b n = ${formatEquationNumber(nominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(designMethod, "boltTension", nominal)}
\end{aligned}`,
      ],
    });
  }

  function bearingNominalPerBolt(lc, t, fu, db, deformationConsidered) {
    const lcSafe = Math.max(lc, 0);
    const c1 = deformationConsidered ? 1.2 : 1.5;
    const c2 = deformationConsidered ? 2.4 : 3.0;
    return Math.min(c1 * lcSafe * t * fu, c2 * db * t * fu) / 1000;
  }

  function buildBoltLineBearingCheck({ key, label, demand, count, endDistance, pitch, holeDiameter, thickness, fu, boltDiameter, deformationConsidered, designMethod, note, codeRef = "10.3.9", equationRef = "式(10.3-2)~式(10.3-4)" }) {
    const endLc = endDistance - holeDiameter / 2;
    const interiorLc = pitch - holeDiameter;
    const endNominal = bearingNominalPerBolt(endLc, thickness, fu, boltDiameter, deformationConsidered);
    const interiorNominal = bearingNominalPerBolt(interiorLc, thickness, fu, boltDiameter, deformationConsidered);
    const nominal = endNominal + interiorNominal * Math.max(count - 1, 0);
    const available = applyDesignStrength(nominal, designMethod, "bearing");
    return createCheck({
      key,
      label,
      demand,
      nominal,
      available,
      note,
      codeRef,
      equationRef,
      equationLines: [
        `Lc,end = e - dh / 2 = ${formatEquationNumber(endLc)} mm`,
        `Lc,int = s - dh = ${formatEquationNumber(interiorLc)} mm`,
        `Rn = Σ min(c1 × Lc × t × Fu, c2 × db × t × Fu) = ${formatEquationNumber(nominal)} kN`,
      ],
      latexLines: [
        String.raw`\begin{aligned}
L_{c,\mathrm{end}} &= e - \frac{d_h}{2} = ${formatEquationNumber(endDistance)} - \frac{${formatEquationNumber(holeDiameter)}}{2} = ${formatEquationNumber(endLc)}\ \text{mm}\\
L_{c,\mathrm{int}} &= s - d_h = ${formatEquationNumber(pitch)} - ${formatEquationNumber(holeDiameter)} = ${formatEquationNumber(interiorLc)}\ \text{mm}\\
R_n &= \sum \min\!\left(c_1 L_c t F_u,\ c_2 d_b t F_u\right) = ${formatEquationNumber(nominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(designMethod, "bearing", nominal)}
\end{aligned}`,
      ],
    });
  }

  function buildGrossYieldCheck({ key, label, demand, fy, grossArea, designMethod, note, codeRef = "5.2", equationRef = "式(5.2-1)" }) {
    const nominal = mm2ToKn(fy, grossArea);
    const available = applyDesignStrength(nominal, designMethod, "grossYield");
    return createCheck({
      key,
      label,
      demand,
      nominal,
      available,
      note,
      codeRef,
      equationRef,
      equationLines: [`Ag = ${formatEquationNumber(grossArea)} mm²`, `Rn = Fy × Ag = ${formatEquationNumber(nominal)} kN`],
      latexLines: [
        String.raw`\begin{aligned}
A_g &= ${formatEquationNumber(grossArea)}\ \text{mm}^2\\
R_n &= F_y A_g = ${formatEquationNumber(fy)} \times ${formatEquationNumber(grossArea)} / 1000 = ${formatEquationNumber(nominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(designMethod, "grossYield", nominal)}
\end{aligned}`,
      ],
    });
  }

  function buildNetRuptureCheck({ key, label, demand, fu, netArea, designMethod, note, codeRef = "5.2", equationRef = "式(5.2-2)" }) {
    const nominal = mm2ToKn(fu, netArea);
    const available = applyDesignStrength(nominal, designMethod, "netRupture");
    return createCheck({
      key,
      label,
      demand,
      nominal,
      available,
      note,
      codeRef,
      equationRef,
      equationLines: [`An = ${formatEquationNumber(netArea)} mm²`, `Rn = Fu × An = ${formatEquationNumber(nominal)} kN`],
      latexLines: [
        String.raw`\begin{aligned}
A_n &= ${formatEquationNumber(netArea)}\ \text{mm}^2\\
R_n &= F_u A_n = ${formatEquationNumber(fu)} \times ${formatEquationNumber(netArea)} / 1000 = ${formatEquationNumber(nominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(designMethod, "netRupture", nominal)}
\end{aligned}`,
      ],
    });
  }

  function buildEffectiveNetRuptureCheck({ key, label, demand, fu, effectiveNetArea, designMethod, note, areaSymbol = "Ae", codeRef = "5.2", equationRef = "式(5.2-2)" }) {
    const nominal = mm2ToKn(fu, effectiveNetArea);
    const available = applyDesignStrength(nominal, designMethod, "netRupture");
    return createCheck({
      key,
      label,
      demand,
      nominal,
      available,
      note,
      codeRef,
      equationRef,
      equationLines: [
        `${areaSymbol} = ${formatEquationNumber(effectiveNetArea)} mm²`,
        `Rn = Fu × ${areaSymbol} = ${formatEquationNumber(nominal)} kN`,
      ],
      latexLines: [
        String.raw`\begin{aligned}
${areaSymbol} &= ${formatEquationNumber(effectiveNetArea)}\ \text{mm}^2\\
R_n &= F_u ${areaSymbol} = ${formatEquationNumber(fu)} \times ${formatEquationNumber(effectiveNetArea)} / 1000 = ${formatEquationNumber(nominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(designMethod, "netRupture", nominal)}
\end{aligned}`,
      ],
    });
  }

  function buildShearYieldCheck({ key, label, demand, fy, area, designMethod, note, codeRef = "10.2.4", equationRef = "表10.2-5" }) {
    const nominal = mm2ToKn(0.6 * fy, area);
    const available = applyDesignStrength(nominal, designMethod, "shearYield");
    return createCheck({
      key,
      label,
      demand,
      nominal,
      available,
      note,
      codeRef,
      equationRef,
      equationLines: [`Av = ${formatEquationNumber(area)} mm²`, `Rn = 0.6 × Fy × Av = ${formatEquationNumber(nominal)} kN`],
      latexLines: [
        String.raw`\begin{aligned}
A_v &= ${formatEquationNumber(area)}\ \text{mm}^2\\
R_n &= 0.6 F_y A_v = 0.6 \times ${formatEquationNumber(fy)} \times ${formatEquationNumber(area)} / 1000 = ${formatEquationNumber(nominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(designMethod, "shearYield", nominal)}
\end{aligned}`,
      ],
    });
  }

  function buildWeldCheck({ key, label, demand, weldSize, weldLength, weldLineCount, electrodeStrength, designMethod, note, codeRef = "10.2.4", equationRef = "表10.2-5" }) {
    const throat = 0.707 * weldSize;
    const effectiveArea = throat * weldLength * weldLineCount;
    const nominal = mm2ToKn(0.6 * electrodeStrength, effectiveArea);
    const available = applyDesignStrength(nominal, designMethod, "weld");
    return createCheck({
      key,
      label,
      demand,
      nominal,
      available,
      note,
      codeRef,
      equationRef,
      warning: weldLength < 4 * weldSize,
      equationLines: [
        `te = 0.707a = ${formatEquationNumber(throat)} mm`,
        `Ae = te × Le × nline = ${formatEquationNumber(effectiveArea)} mm²`,
        `Rn = 0.6 × FEXX × Ae = ${formatEquationNumber(nominal)} kN`,
      ],
      latexLines: [
        String.raw`\begin{aligned}
t_e &= 0.707 a = 0.707 \times ${formatEquationNumber(weldSize)} = ${formatEquationNumber(throat)}\ \text{mm}\\
A_{e,\mathrm{weld}} &= t_e L_e n = ${formatEquationNumber(effectiveArea)}\ \text{mm}^2\\
R_n &= 0.6 F_{EXX} A_{e,\mathrm{weld}} = ${formatEquationNumber(nominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(designMethod, "weld", nominal)}
\end{aligned}`,
      ],
    });
  }

  function buildBlockShearCheck({ key, label, demand, boltCount, endDistance, pitch, holeDiameter, edgeDistance, thickness, fy, fu, designMethod, note, codeRef = "10.4" }) {
    const holeWidth = netHoleWidth(holeDiameter);
    const lv = endDistance + Math.max(boltCount - 1, 0) * pitch;
    const agv = 2 * lv * thickness;
    const anv = 2 * Math.max(lv - (boltCount - 0.5) * holeWidth, 0) * thickness;
    const agt = edgeDistance * thickness;
    const ant = Math.max(edgeDistance - holeWidth / 2, 0) * thickness;
    const tensionRupture = mm2ToKn(fu, ant);
    const shearRupture = mm2ToKn(0.6 * fu, anv);
    const shearYield = mm2ToKn(0.6 * fy, agv);
    const tensionYield = mm2ToKn(fy, agt);
    const tensionControls = tensionRupture >= shearRupture;
    const nominal = tensionControls
      ? Math.min(shearYield + tensionRupture, shearRupture + tensionRupture)
      : Math.min(shearRupture + tensionYield, shearRupture + tensionRupture);
    const available = applyDesignStrength(nominal, designMethod, "blockShear");
    return createCheck({
      key,
      label,
      demand,
      nominal,
      available,
      note,
      codeRef,
      equationRef: tensionControls ? "式(10.4-3)" : "式(10.4-4)",
      equationLines: [
        `Agv = ${formatEquationNumber(agv)} mm², Anv = ${formatEquationNumber(anv)} mm²`,
        `Agt = ${formatEquationNumber(agt)} mm², Ant = ${formatEquationNumber(ant)} mm²`,
        tensionControls
          ? `FuAnt >= 0.6FuAnv，依式(10.4-3)取 Rn = min(0.6FyAgv + FuAnt, 0.6FuAnv + FuAnt) = ${formatEquationNumber(nominal)} kN`
          : `0.6FuAnv > FuAnt，依式(10.4-4)取 Rn = min(0.6FuAnv + FyAgt, 0.6FuAnv + FuAnt) = ${formatEquationNumber(nominal)} kN`,
      ],
    });
  }

  function getMinimumFilletSize(thickness) {
    if (thickness <= 6) return 3;
    if (thickness <= 12) return 5;
    if (thickness <= 19) return 6;
    if (thickness <= 38) return 8;
    return 8;
  }

  function getMaximumEdgeFilletSize(thickness) {
    return thickness < 6 ? thickness : Math.max(thickness - 1.5, 0);
  }

  function getMinimumPjpThroat(thickness) {
    if (thickness <= 6) return 3;
    if (thickness <= 12) return 5;
    if (thickness <= 19) return 6;
    if (thickness <= 38) return 8;
    if (thickness <= 57) return 10;
    if (thickness <= 150) return 12;
    return 16;
  }

  function createWeldStrengthCheck({ key, label, demand, baseAvailable, weldAvailable, note, equationLines, latexLines, codeRef = "10.2.4", equationRef = "表10.2-5" }) {
    const options = [
      { material: "母材", available: baseAvailable },
      { material: "銲材", available: weldAvailable },
    ].filter((item) => Number.isFinite(item.available) && item.available > 0);
    const controlling = options.reduce((lowest, item) => (!lowest || item.available < lowest.available ? item : lowest), null);
    return createCheck({
      key,
      label,
      demand,
      nominal: controlling?.available || 0,
      available: controlling?.available || 0,
      note: `${note} 控制材料：${controlling?.material || "—"}。`,
      codeRef,
      equationRef,
      equationLines: [
        ...equationLines,
        `母材可用強度 = ${formatEquationNumber(baseAvailable)} kN`,
        `銲材可用強度 = ${formatEquationNumber(weldAvailable)} kN`,
        `採較小值作為接合可用強度 = ${formatEquationNumber(controlling?.available || 0)} kN`,
      ],
      latexLines: latexLines || [
        String.raw`\begin{aligned}
\text{Base} &= ${formatEquationNumber(baseAvailable)}\ \text{kN}\\
\text{Weld} &= ${formatEquationNumber(weldAvailable)}\ \text{kN}\\
R_{\mathrm{allow}} &= \min(\text{Base},\ \text{Weld}) = ${formatEquationNumber(controlling?.available || 0)}\ \text{kN}
\end{aligned}`,
      ],
    });
  }

  function buildTensionWeldStrengthCheck(state, derived) {
    const totalWeldLength = state.tensionWeldLengthLongitudinal * state.tensionWeldLineCount + state.tensionWeldLengthTransverse;
    const baseShearArea = state.tensionConnectedThickness * totalWeldLength;
    const directArea = state.tensionDirectConnectedArea > 0
      ? state.tensionDirectConnectedArea
      : Math.max(derived.grossArea, 0);

    if (state.tensionWeldType === "groove_cjp") {
      const available = applyDesignStrength(mm2ToKn(state.memberYieldStrength, directArea), state.designMethod, "grossYield");
      return createCheck({
        key: "tensionWeldStrength",
        label: "全滲透開槽銲接合強度",
        demand: state.requiredTension,
        nominal: available,
        available,
        note: "依 10.2.4，全滲透開槽銲採母材有效面積之拉應力強度，並要求使用相稱銲材。",
        codeRef: "10.2.4",
        equationRef: "表10.2-5",
        equationLines: [
          `A = ${formatEquationNumber(directArea)} mm²`,
          `可用強度 = ${formatEquationNumber(available)} kN`,
        ],
        latexLines: [
          String.raw`\begin{aligned}
A &= ${formatEquationNumber(directArea)}\ \text{mm}^2\\
\phi R_n \text{ or } \frac{R_n}{\Omega} &= ${formatEquationNumber(available)}\ \text{kN}
\end{aligned}`,
        ],
      });
    }

    if (state.tensionWeldType === "groove_pjp") {
      const area = state.tensionWeldEffectiveThroat * totalWeldLength;
      const baseAvailable = applyDesignStrength(mm2ToKn(state.memberYieldStrength, area), state.designMethod, "grossYield");
      const weldAvailable = state.tensionWeldCase === "transverse_direct"
        ? mm2ToKn((state.designMethod === "LRFD" ? 0.8 * 0.6 : 0.3) * state.tensionWeldElectrodeStrength, area)
        : mm2ToKn((state.designMethod === "LRFD" ? 0.75 * 0.6 : 0.3) * state.tensionWeldElectrodeStrength, area);
      return createWeldStrengthCheck({
        key: "tensionWeldStrength",
        label: "部分滲透開槽銲接合強度",
        demand: state.requiredTension,
        baseAvailable,
        weldAvailable,
        note: state.tensionWeldCase === "transverse_direct"
          ? "依 10.2.4，垂直於有效面積之拉應力取母材與銲材可用強度較小值。"
          : "依 10.2.4 與解說，平行銲軸之受拉以母材與銲材控制值較小者為準。",
        equationLines: [
          `te = ${formatEquationNumber(state.tensionWeldEffectiveThroat)} mm`,
          `Le,total = ${formatEquationNumber(totalWeldLength)} mm`,
          `Ae,weld = te × Le,total = ${formatEquationNumber(area)} mm²`,
        ],
      });
    }

    if (state.tensionWeldType === "plug_slot") {
      const openingArea = state.tensionWeldOpeningWidth * state.tensionWeldOpeningLength * state.tensionWeldOpeningCount;
      const baseAvailable = applyDesignStrength(mm2ToKn(0.6 * state.memberYieldStrength, openingArea), state.designMethod, "shearYield");
      const weldAvailable = mm2ToKn((state.designMethod === "LRFD" ? 0.75 * 0.6 : 0.3) * state.tensionWeldElectrodeStrength, openingArea);
      return createWeldStrengthCheck({
        key: "tensionWeldStrength",
        label: "塞孔銲 / 塞槽銲接合強度",
        demand: state.requiredTension,
        baseAvailable,
        weldAvailable,
        note: "依 10.2.3 與 10.2.4，以接合平面標稱面積為有效剪力面積，取母材與銲材可用強度較小值。",
        equationLines: [
          `Aeff = 寬 × 長 × 數量 = ${formatEquationNumber(openingArea)} mm²`,
        ],
      });
    }

    const throat = 0.707 * state.tensionWeldSize;
    const weldArea = throat * totalWeldLength;
    const baseAvailable = applyDesignStrength(mm2ToKn(0.6 * state.memberYieldStrength, baseShearArea), state.designMethod, "shearYield");
    const weldAvailable = mm2ToKn((state.designMethod === "LRFD" ? 0.75 * 0.6 : 0.3) * state.tensionWeldElectrodeStrength, weldArea);
    return createWeldStrengthCheck({
      key: "tensionWeldStrength",
      label: "填角銲接合強度",
      demand: state.requiredTension,
      baseAvailable,
      weldAvailable,
      note: "依 10.2.4，填角銲接合強度應低於母材與銲材可用強度之較小值。",
      equationLines: [
        `a = ${formatEquationNumber(state.tensionWeldSize)} mm`,
        `te = 0.707a = ${formatEquationNumber(throat)} mm`,
        `Le,total = ${formatEquationNumber(totalWeldLength)} mm`,
        `Aeff,weld = te × Le,total = ${formatEquationNumber(weldArea)} mm²`,
        `Aeff,base = t × Le,total = ${formatEquationNumber(baseShearArea)} mm²`,
      ],
    });
  }

  function buildLinearBoltDetailChecks({ prefix, state, pitch, endDistance, edgeDistance, boltDiameter, thickness, shortWeld = null }) {
    const holeRule = getHoleRule(state.holeType);
    const minSpacing = getMinimumSpacing(state, boltDiameter);
    const minEndEdge = getMinimumEndEdgeDistance(state, boltDiameter);
    const minSideEdge = getMinimumSideEdgeDistance(state, boltDiameter);
    const maxEdge = getMaximumEdgeDistance(thickness);
    const maxSpacing = getMaximumSpacing(state, thickness);
    const checks = [
      makeDetailCheck(`${prefix}_holeCompatibility`, `${prefix}孔型適用性`, holeRule.allowedForBearing ? 1 : 0, true, "custom", holeRule.allowedForBearing ? "此孔型可用於目前承壓型檢核假設。" : "此孔型通常需另行確認摩阻型或特殊設計，不宜直接套用承壓型假設。", "10.3.9"),
      makeDetailCheck(`${prefix}_minSpacing`, `${prefix}最小間距`, pitch, minSpacing, "gte", `提供值 = ${formatEquationNumber(pitch)} mm，規定下限 = ${formatEquationNumber(minSpacing)} mm`, "10.3.11"),
      makeDetailCheck(`${prefix}_minEnd`, `${prefix}最小端距`, endDistance, minEndEdge, "gte", `提供值 = ${formatEquationNumber(endDistance)} mm，規定下限 = ${formatEquationNumber(minEndEdge)} mm`, "10.3.12"),
      makeDetailCheck(`${prefix}_minEdge`, `${prefix}最小側邊距`, edgeDistance, minSideEdge, "gte", `提供值 = ${formatEquationNumber(edgeDistance)} mm，規定下限 = ${formatEquationNumber(minSideEdge)} mm`, "10.3.12"),
      makeDetailCheck(`${prefix}_maxEnd`, `${prefix}最大端距`, endDistance, maxEdge, "lte", `提供值 = ${formatEquationNumber(endDistance)} mm，規定上限 = ${formatEquationNumber(maxEdge)} mm`, "10.3.13"),
      makeDetailCheck(`${prefix}_maxEdge`, `${prefix}最大側邊距`, edgeDistance, maxEdge, "lte", `提供值 = ${formatEquationNumber(edgeDistance)} mm，規定上限 = ${formatEquationNumber(maxEdge)} mm`, "10.3.13"),
      makeDetailCheck(`${prefix}_maxSpacing`, `${prefix}最大間距`, pitch, maxSpacing, "lte", `提供值 = ${formatEquationNumber(pitch)} mm，規定上限 = ${formatEquationNumber(maxSpacing)} mm`, "10.3.13"),
    ];

    if (shortWeld) {
      checks.push(makeDetailCheck(`${prefix}_shortWeld`, `${prefix}短銲道`, shortWeld.weldLength, 4 * shortWeld.weldSize, "gte", `Le = ${formatEquationNumber(shortWeld.weldLength)} mm，建議至少 4a = ${formatEquationNumber(4 * shortWeld.weldSize)} mm`, "Weld"));
    }

    return checks;
  }

  function normalizeState(rawState) {
    return {
      projectName: rawState.projectName || "",
      connectionTag: rawState.connectionTag || "",
      designer: rawState.designer || "",
      notes: rawState.notes || "",
      designMethod: rawState.designMethod || "LRFD",
      connectionType: rawState.connectionType || "single_plate",
      exposureCondition: rawState.exposureCondition || "painted",
      requiredAxial: toNumber(rawState.requiredAxial),
      requiredShear: toNumber(rawState.requiredShear),
      requiredMoment: toNumber(rawState.requiredMoment),
      eccentricity: positive(rawState.eccentricity),
      boltDiameter: positive(rawState.boltDiameter),
      holeType: rawState.holeType || "standard",
      holeDiameter: positive(rawState.holeDiameter),
      edgeFabrication: rawState.edgeFabrication || "rolled",
      boltUltimateStrength: positive(rawState.boltUltimateStrength),
      threadsCondition: rawState.threadsCondition || "included",
      deformationConsidered: rawState.deformationConsidered === true || rawState.deformationConsidered === "true",
      boltCount: toInteger(rawState.boltCount, 1),
      shearPlanes: toInteger(rawState.shearPlanes, 1),
      endDistance: positive(rawState.endDistance),
      pitch: positive(rawState.pitch),
      plateThickness: positive(rawState.plateThickness),
      plateYieldStrength: positive(rawState.plateYieldStrength),
      plateUltimateStrength: positive(rawState.plateUltimateStrength),
      transverseEdgeDistance: positive(rawState.transverseEdgeDistance),
      beamWebThickness: positive(rawState.beamWebThickness),
      beamWebUltimateStrength: positive(rawState.beamWebUltimateStrength),
      fillerThickness: positive(rawState.fillerThickness),
      fillerExtended: rawState.fillerExtended === true || rawState.fillerExtended === "true",
      weldSize: positive(rawState.weldSize),
      weldLength: positive(rawState.weldLength),
      weldLineCount: toInteger(rawState.weldLineCount, 1),
      weldElectrodeStrength: positive(rawState.weldElectrodeStrength),
      spliceLeverArm: positive(rawState.spliceLeverArm),
      spliceBearingTransfer: rawState.spliceBearingTransfer === true || rawState.spliceBearingTransfer === "true",
      flangeBoltCount: toInteger(rawState.flangeBoltCount, 1),
      flangeEndDistance: positive(rawState.flangeEndDistance),
      flangePitch: positive(rawState.flangePitch),
      flangeEdgeDistance: positive(rawState.flangeEdgeDistance),
      flangePlateThickness: positive(rawState.flangePlateThickness),
      flangePlateWidth: positive(rawState.flangePlateWidth),
      flangePlateNetWidth: positive(rawState.flangePlateNetWidth),
      flangePlateYieldStrength: positive(rawState.flangePlateYieldStrength),
      flangePlateUltimateStrength: positive(rawState.flangePlateUltimateStrength),
      webBoltCount: toInteger(rawState.webBoltCount, 1),
      webShearPlanes: toInteger(rawState.webShearPlanes, 1),
      webEndDistance: positive(rawState.webEndDistance),
      webPitch: positive(rawState.webPitch),
      webEdgeDistance: positive(rawState.webEdgeDistance),
      webPlateDepth: positive(rawState.webPlateDepth),
      webPlateThickness: positive(rawState.webPlateThickness),
      webPlateYieldStrength: positive(rawState.webPlateYieldStrength),
      webPlateUltimateStrength: positive(rawState.webPlateUltimateStrength),
      spliceWeldSize: positive(rawState.spliceWeldSize),
      spliceWeldLength: positive(rawState.spliceWeldLength),
      spliceWeldLineCount: toInteger(rawState.spliceWeldLineCount, 1),
      spliceWeldElectrodeStrength: positive(rawState.spliceWeldElectrodeStrength),
      gussetBoltCount: toInteger(rawState.gussetBoltCount, 1),
      gussetShearPlanes: toInteger(rawState.gussetShearPlanes, 1),
      gussetEndDistance: positive(rawState.gussetEndDistance),
      gussetPitch: positive(rawState.gussetPitch),
      gussetEdgeDistance: positive(rawState.gussetEdgeDistance),
      gussetThickness: positive(rawState.gussetThickness),
      gussetYieldStrength: positive(rawState.gussetYieldStrength),
      gussetUltimateStrength: positive(rawState.gussetUltimateStrength),
      gussetNetWidth: positive(rawState.gussetNetWidth),
      gussetConnectionWidth: positive(rawState.gussetConnectionWidth),
      gussetWhitmoreLength: positive(rawState.gussetWhitmoreLength),
      gussetWeldSize: positive(rawState.gussetWeldSize),
      gussetWeldLength: positive(rawState.gussetWeldLength),
      gussetWeldLineCount: toInteger(rawState.gussetWeldLineCount, 1),
      gussetWeldElectrodeStrength: positive(rawState.gussetWeldElectrodeStrength),
      momentLeverArm: positive(rawState.momentLeverArm),
      momentBoltCount: toInteger(rawState.momentBoltCount, 1),
      momentEndDistance: positive(rawState.momentEndDistance),
      momentPitch: positive(rawState.momentPitch),
      momentEdgeDistance: positive(rawState.momentEdgeDistance),
      momentPlateThickness: positive(rawState.momentPlateThickness),
      momentPlateWidth: positive(rawState.momentPlateWidth),
      momentPlateNetWidth: positive(rawState.momentPlateNetWidth),
      momentPlateYieldStrength: positive(rawState.momentPlateYieldStrength),
      momentPlateUltimateStrength: positive(rawState.momentPlateUltimateStrength),
      momentShearBoltCount: toInteger(rawState.momentShearBoltCount, 0),
      momentShearPlanes: toInteger(rawState.momentShearPlanes, 1),
      momentShearPlateThickness: positive(rawState.momentShearPlateThickness),
      momentShearPlateUltimateStrength: positive(rawState.momentShearPlateUltimateStrength),
      panelZoneCapacity: positive(rawState.panelZoneCapacity),
      momentWeldSize: positive(rawState.momentWeldSize),
      momentWeldLength: positive(rawState.momentWeldLength),
      momentWeldLineCount: toInteger(rawState.momentWeldLineCount, 1),
      momentWeldElectrodeStrength: positive(rawState.momentWeldElectrodeStrength),
      plateInputMode: rawState.plateInputMode || "geometry",
      requiredTension: positive(rawState.requiredTension),
      loadDirection: rawState.loadDirection || "horizontal",
      plateWidth: positive(rawState.plateWidth),
      plateLength: positive(rawState.plateLength),
      rowCount: toInteger(rawState.rowCount, 1),
      lineCount: toInteger(rawState.lineCount, 1),
      pitchX: positive(rawState.pitchX),
      pitchY: positive(rawState.pitchY),
      endDistanceStart: positive(rawState.endDistanceStart),
      endDistanceEnd: positive(rawState.endDistanceEnd),
      edgeDistanceTop: positive(rawState.edgeDistanceTop),
      edgeDistanceBottom: positive(rawState.edgeDistanceBottom),
      grossArea: positive(rawState.grossArea),
      netArea: positive(rawState.netArea),
      Agv: positive(rawState.Agv),
      Anv: positive(rawState.Anv),
      Agt: positive(rawState.Agt),
      Ant: positive(rawState.Ant),
      netSectionMode: rawState.netSectionMode || "straight_only",
      blockShearMode: rawState.blockShearMode || "auto_with_override",
      useManualBlockShearPath: rawState.useManualBlockShearPath === true || rawState.useManualBlockShearPath === "true",
      manualAgv: positive(rawState.manualAgv),
      manualAnv: positive(rawState.manualAnv),
      manualAgt: positive(rawState.manualAgt),
      manualAnt: positive(rawState.manualAnt),
      showPlateSketch: rawState.showPlateSketch === true || rawState.showPlateSketch === "true",
      tensionConnectionMode: rawState.tensionConnectionMode || "bolted",
      tensionSectionType: rawState.tensionSectionType || "connection_plate",
      tensionAreaInput: rawState.tensionAreaInput || "geometry",
      memberYieldStrength: positive(rawState.memberYieldStrength),
      memberUltimateStrength: positive(rawState.memberUltimateStrength),
      memberWidth: positive(rawState.memberWidth),
      memberThickness: positive(rawState.memberThickness),
      tensionGrossArea: positive(rawState.tensionGrossArea),
      tensionNetArea: positive(rawState.tensionNetArea),
      tensionEffectiveNetArea: positive(rawState.tensionEffectiveNetArea),
      tensionShearLagFactor: positive(rawState.tensionShearLagFactor),
      tensionShearLagCase: rawState.tensionShearLagCase || "connection_plate_cap",
      unsupportedLength: positive(rawState.unsupportedLength),
      radiusOfGyration: positive(rawState.radiusOfGyration),
      tensionBoltLineCount: toInteger(rawState.tensionBoltLineCount, 1),
      tensionBoltRowCount: toInteger(rawState.tensionBoltRowCount, 1),
      tensionShearPlanes: toInteger(rawState.tensionShearPlanes, 1),
      tensionEndDistance: positive(rawState.tensionEndDistance),
      tensionPitchLongitudinal: positive(rawState.tensionPitchLongitudinal),
      tensionGaugeTransverse: positive(rawState.tensionGaugeTransverse),
      tensionEdgeDistanceNear: positive(rawState.tensionEdgeDistanceNear),
      tensionEdgeDistanceFar: positive(rawState.tensionEdgeDistanceFar),
      tensionUseManualBlockAreas: rawState.tensionUseManualBlockAreas === true || rawState.tensionUseManualBlockAreas === "true",
      tensionAgv: positive(rawState.tensionAgv),
      tensionAnv: positive(rawState.tensionAnv),
      tensionAgt: positive(rawState.tensionAgt),
      tensionAnt: positive(rawState.tensionAnt),
      tensionWeldCase: rawState.tensionWeldCase || "plate_longitudinal_both_sides",
      tensionWeldType: rawState.tensionWeldType || "fillet",
      tensionWeldSize: positive(rawState.tensionWeldSize),
      tensionWeldLengthLongitudinal: positive(rawState.tensionWeldLengthLongitudinal),
      tensionWeldLengthTransverse: positive(rawState.tensionWeldLengthTransverse),
      tensionWeldLineCount: toInteger(rawState.tensionWeldLineCount, 1),
      tensionWeldElectrodeStrength: positive(rawState.tensionWeldElectrodeStrength),
      tensionConnectedThickness: positive(rawState.tensionConnectedThickness),
      tensionWeldEffectiveThroat: positive(rawState.tensionWeldEffectiveThroat),
      tensionWeldOpeningWidth: positive(rawState.tensionWeldOpeningWidth),
      tensionWeldOpeningLength: positive(rawState.tensionWeldOpeningLength),
      tensionWeldOpeningCount: toInteger(rawState.tensionWeldOpeningCount, 1),
      tensionLapLength: positive(rawState.tensionLapLength),
      tensionWeldMatchingFiller: rawState.tensionWeldMatchingFiller === true || rawState.tensionWeldMatchingFiller === "true",
      tensionDirectConnectedArea: positive(rawState.tensionDirectConnectedArea),
    };
  }

  function validateBaseState(state) {
    const validations = [];
    const skipHoleValidation = (state.connectionType === "plate_check" && state.plateInputMode === "area_manual")
      || (state.connectionType === "tension_member" && (state.tensionConnectionMode === "welded" || state.tensionAreaInput === "manual"));
    if (!skipHoleValidation && state.holeDiameter <= state.boltDiameter) validations.push("孔徑 dh 應大於螺栓直徑 db。");
    if (state.eccentricity > 0) validations.push("本版未將偏心造成之栓群附加力納入，偏心接頭請再以栓群分析確認。");
    return validations;
  }

  function getPlateOrientation(state) {
    const horizontal = state.loadDirection === "horizontal";
    return {
      horizontal,
      grossWidth: horizontal ? state.plateLength : state.plateWidth,
      grossLength: horizontal ? state.plateWidth : state.plateLength,
      holeCountAcross: horizontal ? state.rowCount : state.lineCount,
      holeCountAlong: horizontal ? state.lineCount : state.rowCount,
      parallelSpacing: horizontal ? state.pitchX : state.pitchY,
      transverseSpacing: horizontal ? state.pitchY : state.pitchX,
      startDistance: state.endDistanceStart,
      endDistance: state.endDistanceEnd,
      edgeStart: state.edgeDistanceTop,
      edgeEnd: state.edgeDistanceBottom,
      label: horizontal ? "水平" : "垂直",
    };
  }

  function buildPlateHolePositions(state) {
    const columns = [];
    const rows = [];

    for (let i = 0; i < state.lineCount; i += 1) {
      columns.push(state.loadDirection === "horizontal" ? state.endDistanceStart + i * state.pitchX : state.edgeDistanceTop + i * state.pitchX);
    }

    for (let j = 0; j < state.rowCount; j += 1) {
      rows.push(state.loadDirection === "horizontal" ? state.edgeDistanceTop + j * state.pitchY : state.endDistanceStart + j * state.pitchY);
    }

    return { columns, rows };
  }

  function derivePlateAreasFromGeometry(state) {
    const orientation = getPlateOrientation(state);
    const holeWidth = netHoleWidth(state.holeDiameter);
    const grossArea = orientation.grossWidth * state.plateThickness;
    const straightNetWidth = orientation.grossWidth - orientation.holeCountAcross * holeWidth;
    const turnCount = 0;
    const zigzagCorrection = 0;
    const zigzagNetWidth = straightNetWidth;
    const controlNetWidth = straightNetWidth;
    const controlNetType = "straight";
    const shearLength = Math.min(orientation.startDistance, orientation.endDistance) + Math.max(orientation.holeCountAlong - 1, 0) * orientation.parallelSpacing;
    const Agt = orientation.grossWidth * state.plateThickness;
    const AntAuto = Math.max(controlNetWidth, 0) * state.plateThickness;
    const AgvAuto = 2 * shearLength * state.plateThickness;
    const AnvAuto = 2 * Math.max(shearLength - (orientation.holeCountAlong - 0.5) * holeWidth, 0) * state.plateThickness;
    const autoBlockValid = shearLength > 0 && AgvAuto > 0 && AnvAuto > 0 && Agt > 0 && AntAuto > 0;

    const derived = {
      grossArea,
      netArea: Math.max(controlNetWidth, 0) * state.plateThickness,
      Agv: AgvAuto,
      Anv: AnvAuto,
      Agt,
      Ant: AntAuto,
      straightNetWidth,
      zigzagNetWidth,
      zigzagCorrection,
      turnCount,
      controlNetWidth,
      controlNetType,
      autoBlockValid,
      shearLength,
      pathSource: state.useManualBlockShearPath ? "manual_override" : "auto_geometry",
    };

    if (state.useManualBlockShearPath) {
      derived.Agv = state.manualAgv;
      derived.Anv = state.manualAnv;
      derived.Agt = state.manualAgt;
      derived.Ant = state.manualAnt;
      derived.autoBlockValid = state.manualAgv > 0 && state.manualAnv > 0 && state.manualAgt > 0 && state.manualAnt > 0;
    }

    return { orientation, derived };
  }

  function derivePlateAreasFromManual(state) {
    return {
      orientation: getPlateOrientation(state),
      derived: {
        grossArea: state.grossArea,
        netArea: state.netArea,
        Agv: state.Agv,
        Anv: state.Anv,
        Agt: state.Agt,
        Ant: state.Ant,
        straightNetWidth: 0,
        zigzagNetWidth: 0,
        zigzagCorrection: 0,
        turnCount: 0,
        controlNetWidth: 0,
        controlNetType: "manual",
        autoBlockValid: state.Agv > 0 && state.Anv > 0 && state.Agt > 0 && state.Ant > 0,
        shearLength: 0,
        pathSource: "manual_area",
      },
    };
  }

  function buildPlateSketchData(state, orientation, derived) {
    if (state.plateInputMode !== "geometry") {
      return {
        mode: "manual_area",
        caption: "面積直輸模式，示意圖改為文字摘要。",
      };
    }

    const holes = [];
    const positions = buildPlateHolePositions(state);
    positions.columns.forEach((x) => {
      positions.rows.forEach((y) => holes.push({ x, y }));
    });

    const netSection = orientation.horizontal
      ? {
          kind: derived.controlNetType,
          points: derived.controlNetType === "zigzag"
            ? positions.rows.map((y, index) => ({
                x: positions.columns[Math.min(index, positions.columns.length - 1)],
                y,
              }))
            : positions.rows.map((y) => ({ x: positions.columns[Math.floor((positions.columns.length - 1) / 2)] || state.plateWidth / 2, y })),
        }
      : {
          kind: derived.controlNetType,
          points: derived.controlNetType === "zigzag"
            ? positions.columns.map((x, index) => ({
                x,
                y: positions.rows[Math.min(index, positions.rows.length - 1)],
              }))
            : positions.columns.map((x) => ({ x, y: positions.rows[Math.floor((positions.rows.length - 1) / 2)] || state.plateLength / 2 })),
        };

    const farX = positions.columns[positions.columns.length - 1] || state.plateWidth / 2;
    const farY = positions.rows[positions.rows.length - 1] || state.plateLength / 2;
    const nearX = positions.columns[0] || state.plateWidth / 2;
    const nearY = positions.rows[0] || state.plateLength / 2;
    const blockShear = orientation.horizontal
      ? [
          { x: 0, y: nearY - state.holeDiameter / 2 },
          { x: farX + state.holeDiameter / 2, y: nearY - state.holeDiameter / 2 },
          { x: farX + state.holeDiameter / 2, y: farY + state.holeDiameter / 2 },
          { x: 0, y: farY + state.holeDiameter / 2 },
        ]
      : [
          { x: nearX - state.holeDiameter / 2, y: 0 },
          { x: nearX - state.holeDiameter / 2, y: farY + state.holeDiameter / 2 },
          { x: farX + state.holeDiameter / 2, y: farY + state.holeDiameter / 2 },
          { x: farX + state.holeDiameter / 2, y: 0 },
        ];

    return {
      mode: "geometry",
      plateWidth: state.plateWidth,
      plateLength: state.plateLength,
      loadDirection: state.loadDirection,
      holes,
      netSection,
      blockShear,
    };
  }

  function buildPlateDetailChecks(state, orientation, derived) {
    if (state.plateInputMode === "area_manual") {
      return [
        makeDetailCheck(
          "plate_manualAreas",
          "面積輸入完整性",
          state.grossArea > 0 && state.netArea > 0 && state.Agv > 0 && state.Anv > 0 && state.Agt > 0 && state.Ant > 0 ? 1 : 0,
          true,
          "custom",
          "面積直輸模式需提供 Ag、An、Agv、Anv、Agt、Ant。",
          "Manual"
        ),
        makeDetailCheck(
          "plate_manualNetArea",
          "淨面積合理性",
          state.netArea <= state.grossArea && state.Ant <= state.Agt && state.Anv <= state.Agv ? 1 : 0,
          true,
          "custom",
          "面積直輸模式下，淨面積不應大於對應總面積。",
          "Manual"
        ),
      ];
    }

    const holeRule = getHoleRule(state.holeType);
    const minSpacing = getMinimumSpacing(state, state.boltDiameter);
    const minEndEdge = getMinimumEndEdgeDistance(state, state.boltDiameter);
    const minSideEdge = getMinimumSideEdgeDistance(state, state.boltDiameter);
    const maxEdge = getMaximumEdgeDistance(state.plateThickness);
    const maxSpacing = getMaximumSpacing(state, state.plateThickness);
    const spacingAlong = orientation.holeCountAlong > 1 ? orientation.parallelSpacing : minSpacing;
    const spacingAcross = orientation.holeCountAcross > 1 ? orientation.transverseSpacing : minSpacing;

    return [
      makeDetailCheck("plate_holeCompatibility", "孔型適用性", holeRule.allowedForBearing ? 1 : 0, true, "custom", holeRule.allowedForBearing ? "此孔型可用於目前的連接板面積與細部檢核假設。" : "此孔型屬特殊孔，現階段僅允許作提醒式檢核。", "10.3.9"),
      makeDetailCheck("plate_minSpacingAlong", "最小孔距 X/Y(受力向)", spacingAlong, minSpacing, "gte", `提供值 = ${formatEquationNumber(spacingAlong)} mm，規定下限 = ${formatEquationNumber(minSpacing)} mm`, "10.3.11"),
      makeDetailCheck("plate_minSpacingAcross", "最小孔距 Y/X(橫向)", spacingAcross, minSpacing, "gte", `提供值 = ${formatEquationNumber(spacingAcross)} mm，規定下限 = ${formatEquationNumber(minSpacing)} mm`, "10.3.11"),
      makeDetailCheck("plate_minEndStart", "起始端距", state.endDistanceStart, minEndEdge, "gte", `提供值 = ${formatEquationNumber(state.endDistanceStart)} mm，規定下限 = ${formatEquationNumber(minEndEdge)} mm`, "10.3.12"),
      makeDetailCheck("plate_minEndEnd", "末端端距", state.endDistanceEnd, minEndEdge, "gte", `提供值 = ${formatEquationNumber(state.endDistanceEnd)} mm，規定下限 = ${formatEquationNumber(minEndEdge)} mm`, "10.3.12"),
      makeDetailCheck("plate_minEdgeTop", "橫向邊距一", state.edgeDistanceTop, minSideEdge, "gte", `提供值 = ${formatEquationNumber(state.edgeDistanceTop)} mm，規定下限 = ${formatEquationNumber(minSideEdge)} mm`, "10.3.12"),
      makeDetailCheck("plate_minEdgeBottom", "橫向邊距二", state.edgeDistanceBottom, minSideEdge, "gte", `提供值 = ${formatEquationNumber(state.edgeDistanceBottom)} mm，規定下限 = ${formatEquationNumber(minSideEdge)} mm`, "10.3.12"),
      makeDetailCheck("plate_maxSpacingAlong", "最大孔距 X/Y(受力向)", spacingAlong, maxSpacing, "lte", `提供值 = ${formatEquationNumber(spacingAlong)} mm，規定上限 = ${formatEquationNumber(maxSpacing)} mm`, "10.3.13"),
      makeDetailCheck("plate_maxSpacingAcross", "最大孔距 Y/X(橫向)", spacingAcross, maxSpacing, "lte", `提供值 = ${formatEquationNumber(spacingAcross)} mm，規定上限 = ${formatEquationNumber(maxSpacing)} mm`, "10.3.13"),
      makeDetailCheck("plate_maxEnd", "最大端距", Math.max(state.endDistanceStart, state.endDistanceEnd), maxEdge, "lte", `提供最大值 = ${formatEquationNumber(Math.max(state.endDistanceStart, state.endDistanceEnd))} mm，規定上限 = ${formatEquationNumber(maxEdge)} mm`, "10.3.13"),
      makeDetailCheck("plate_geometryNet", "淨斷面幾何完整性", derived.netArea > 0 ? 1 : 0, true, "custom", "板件扣孔後需仍保有正值淨斷面面積。", "Geometry"),
      makeDetailCheck("plate_geometryBlock", "區塊剪力路徑完整性", derived.autoBlockValid ? 1 : 0, true, "custom", derived.pathSource === "manual_override" ? "已採手動覆寫區塊剪力路徑值。" : "自動區塊剪力路徑需形成有效 Agv、Anv、Agt、Ant。", "Geometry"),
    ];
  }

  function getTensionShearLagData(state, grossArea, netArea) {
    if (state.tensionConnectionMode === "bolted") {
      switch (state.tensionShearLagCase) {
        case "connection_plate_cap": {
          const effectiveNetArea = Math.min(netArea, 0.85 * grossArea);
          return {
            U: grossArea > 0 ? effectiveNetArea / grossArea : 0,
            effectiveNetArea,
            note: "依 4.3 栓接之接續板或連接板規定，Ae 可採 An，惟不得大於 0.85Ag。",
            equationLines: [
              `Ae = min(An, 0.85Ag) = ${formatEquationNumber(effectiveNetArea)} mm²`,
            ],
            latexLines: [
              String.raw`\begin{aligned}
A_e &= \min(A_n,\ 0.85A_g)\\
&= \min(${formatEquationNumber(netArea)},\ 0.85 \times ${formatEquationNumber(grossArea)})\\
&= ${formatEquationNumber(effectiveNetArea)}\ \text{mm}^2
\end{aligned}`,
            ],
          };
        }
        case "w_shape_flange_ge_3":
          return {
            U: 0.9,
            effectiveNetArea: 0.9 * netArea,
            note: "依 4.3(1) 翼板接合且沿力方向每行不少於 3 根螺栓，U = 0.90。",
            equationLines: ["U = 0.90", `Ae = U × An = ${formatEquationNumber(0.9 * netArea)} mm²`],
            latexLines: [
              String.raw`\begin{aligned}
U &= 0.90\\
A_e &= U A_n = 0.90 \times ${formatEquationNumber(netArea)} = ${formatEquationNumber(0.9 * netArea)}\ \text{mm}^2
\end{aligned}`,
            ],
          };
        case "other_ge_3":
          return {
            U: 0.85,
            effectiveNetArea: 0.85 * netArea,
            note: "依 4.3(1) 其他斷面且沿力方向每行不少於 3 根螺栓，U = 0.85。",
            equationLines: ["U = 0.85", `Ae = U × An = ${formatEquationNumber(0.85 * netArea)} mm²`],
            latexLines: [
              String.raw`\begin{aligned}
U &= 0.85\\
A_e &= U A_n = 0.85 \times ${formatEquationNumber(netArea)} = ${formatEquationNumber(0.85 * netArea)}\ \text{mm}^2
\end{aligned}`,
            ],
          };
        case "two_bolts":
          return {
            U: 0.75,
            effectiveNetArea: 0.75 * netArea,
            note: "依 4.3(1) 沿力方向每行僅 2 根螺栓時，U = 0.75。",
            equationLines: ["U = 0.75", `Ae = U × An = ${formatEquationNumber(0.75 * netArea)} mm²`],
            latexLines: [
              String.raw`\begin{aligned}
U &= 0.75\\
A_e &= U A_n = 0.75 \times ${formatEquationNumber(netArea)} = ${formatEquationNumber(0.75 * netArea)}\ \text{mm}^2
\end{aligned}`,
            ],
          };
        case "manual_u":
        default: {
          const U = state.tensionShearLagFactor;
          return {
            U,
            effectiveNetArea: U * netArea,
            note: "依 4.3 輸入剪力遲滯係數 U；此值應由試驗、學理分析或其他正式依據證明。",
            equationLines: [`U = ${formatEquationNumber(U)}`, `Ae = U × An = ${formatEquationNumber(U * netArea)} mm²`],
            latexLines: [
              String.raw`\begin{aligned}
U &= ${formatEquationNumber(U)}\\
A_e &= U A_n = ${formatEquationNumber(U)} \times ${formatEquationNumber(netArea)} = ${formatEquationNumber(U * netArea)}\ \text{mm}^2
\end{aligned}`,
            ],
          };
        }
      }
    }

    switch (state.tensionWeldCase) {
      case "plate_longitudinal_both_sides": {
        const ratio = state.memberWidth > 0 ? state.tensionWeldLengthLongitudinal / state.memberWidth : 0;
        const U = ratio >= 2 ? 1.0 : ratio >= 1.5 ? 0.87 : ratio >= 1.0 ? 0.75 : 0;
        return {
          U,
          effectiveNetArea: U * grossArea,
          note: "依 4.3 端部雙側縱向銲接之鋼板，Ae = UAg，U 由 l / W 決定。",
          equationLines: [
            `l / W = ${formatEquationNumber(ratio)}`,
            `U = ${formatEquationNumber(U)}`,
            `Ae = U × Ag = ${formatEquationNumber(U * grossArea)} mm²`,
          ],
          latexLines: [
            String.raw`\begin{aligned}
\frac{l}{W} &= ${formatEquationNumber(ratio)}\\
U &= ${formatEquationNumber(U)}\\
A_e &= U A_g = ${formatEquationNumber(U)} \times ${formatEquationNumber(grossArea)} = ${formatEquationNumber(U * grossArea)}\ \text{mm}^2
\end{aligned}`,
          ],
        };
      }
      case "transverse_direct":
        return {
          U: 1.0,
          effectiveNetArea: state.tensionDirectConnectedArea,
          note: "依 4.3 當載重經由橫向銲道傳遞時，U = 1.0，Ae 為直接連接部分面積 A。",
          equationLines: [
            "U = 1.0",
            `Ae = A = ${formatEquationNumber(state.tensionDirectConnectedArea)} mm²`,
          ],
          latexLines: [
            String.raw`\begin{aligned}
U &= 1.0\\
A_e &= A = ${formatEquationNumber(state.tensionDirectConnectedArea)}\ \text{mm}^2
\end{aligned}`,
          ],
        };
      case "other_manual_u":
      default: {
        const U = state.tensionShearLagFactor;
        return {
          U,
          effectiveNetArea: U * grossArea,
          note: "依 4.3 輸入剪力遲滯係數 U；此值應由試驗、學理分析或其他正式依據證明，Ae = UAg。",
          equationLines: [`U = ${formatEquationNumber(U)}`, `Ae = U × Ag = ${formatEquationNumber(U * grossArea)} mm²`],
          latexLines: [
            String.raw`\begin{aligned}
U &= ${formatEquationNumber(U)}\\
A_e &= U A_g = ${formatEquationNumber(U)} \times ${formatEquationNumber(grossArea)} = ${formatEquationNumber(U * grossArea)}\ \text{mm}^2
\end{aligned}`,
          ],
        };
      }
    }
  }

  function buildBlockShearAreaCheck({ key, label, demand, fy, fu, Agv, Anv, Agt, Ant, designMethod, note, codeRef = "10.4" }) {
    const tensionRupture = mm2ToKn(fu, Ant);
    const shearRupture = mm2ToKn(0.6 * fu, Anv);
    const shearYield = mm2ToKn(0.6 * fy, Agv);
    const tensionYield = mm2ToKn(fy, Agt);
    const tensionControls = tensionRupture >= shearRupture;
    const nominal = tensionControls
      ? Math.min(shearYield + tensionRupture, shearRupture + tensionRupture)
      : Math.min(shearRupture + tensionYield, shearRupture + tensionRupture);
    const available = applyDesignStrength(nominal, designMethod, "blockShear");
    return createCheck({
      key,
      label,
      demand,
      nominal,
      available,
      note,
      codeRef,
      equationRef: tensionControls ? "式(10.4-3)" : "式(10.4-4)",
      equationLines: [
        `Agv = ${formatEquationNumber(Agv)} mm², Anv = ${formatEquationNumber(Anv)} mm²`,
        `Agt = ${formatEquationNumber(Agt)} mm², Ant = ${formatEquationNumber(Ant)} mm²`,
        tensionControls
          ? `FuAnt >= 0.6FuAnv，依式(10.4-3)取 Rn = min(0.6FyAgv + FuAnt, 0.6FuAnv + FuAnt) = ${formatEquationNumber(nominal)} kN`
          : `0.6FuAnv > FuAnt，依式(10.4-4)取 Rn = min(0.6FuAnv + FyAgt, 0.6FuAnv + FuAnt) = ${formatEquationNumber(nominal)} kN`,
      ],
      latexLines: [
        String.raw`\begin{aligned}
A_{gv} &= ${formatEquationNumber(Agv)}\ \text{mm}^2,\quad A_{nv} = ${formatEquationNumber(Anv)}\ \text{mm}^2\\
A_{gt} &= ${formatEquationNumber(Agt)}\ \text{mm}^2,\quad A_{nt} = ${formatEquationNumber(Ant)}\ \text{mm}^2\\
0.6 F_u A_{nv} &= ${formatEquationNumber(shearRupture)}\ \text{kN}\\
F_u A_{nt} &= ${formatEquationNumber(tensionRupture)}\ \text{kN}
\end{aligned}`,
        tensionControls
          ? String.raw`\begin{aligned}
R_n &= \min \left(0.6 F_y A_{gv} + F_u A_{nt},\ 0.6 F_u A_{nv} + F_u A_{nt}\right)\\
&= ${formatEquationNumber(nominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(designMethod, "blockShear", nominal)}
\end{aligned}`
          : String.raw`\begin{aligned}
R_n &= \min \left(0.6 F_u A_{nv} + F_y A_{gt},\ 0.6 F_u A_{nv} + F_u A_{nt}\right)\\
&= ${formatEquationNumber(nominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(designMethod, "blockShear", nominal)}
\end{aligned}`,
      ],
    });
  }

  function deriveTensionMemberData(state) {
    const isBolted = state.tensionConnectionMode === "bolted";
    const holeWidth = netHoleWidth(state.holeDiameter);
    let grossArea = 0;
    let netArea = 0;
    let Agv = state.tensionAgv;
    let Anv = state.tensionAnv;
    let Agt = state.tensionAgt;
    let Ant = state.tensionAnt;

    if (state.tensionAreaInput === "geometry") {
      grossArea = state.memberWidth * state.memberThickness;
      netArea = isBolted
        ? Math.max(state.memberWidth - state.tensionBoltRowCount * holeWidth, 0) * state.memberThickness
        : grossArea;

      if (isBolted && !state.tensionUseManualBlockAreas) {
        const shearLength = state.tensionEndDistance + Math.max(state.tensionBoltLineCount - 1, 0) * state.tensionPitchLongitudinal;
        const grossWidth = state.memberWidth;
        Agv = 2 * shearLength * state.memberThickness;
        Anv = 2 * Math.max(shearLength - (state.tensionBoltLineCount - 0.5) * holeWidth, 0) * state.memberThickness;
        Agt = grossWidth * state.memberThickness;
        Ant = Math.max(grossWidth - state.tensionBoltRowCount * holeWidth, 0) * state.memberThickness;
      }
    } else {
      grossArea = state.tensionGrossArea;
      netArea = state.tensionNetArea;
    }

    const shearLag = getTensionShearLagData(state, grossArea, netArea);

    return {
      holeWidth,
      grossArea,
      netArea,
      effectiveNetArea: state.tensionAreaInput === "manual" && state.tensionEffectiveNetArea > 0 ? state.tensionEffectiveNetArea : shearLag.effectiveNetArea,
      shearLag,
      Agv,
      Anv,
      Agt,
      Ant,
    };
  }

  function buildTensionSketchData(state, derived) {
    if (state.tensionAreaInput !== "geometry") {
      return {
        mode: "manual_area",
        caption: "面積輸入模式，示意圖改為文字摘要。",
      };
    }

    const memberWidth = Math.max(state.memberWidth, 1);
    const memberLength = state.tensionConnectionMode === "bolted"
      ? Math.max(
          state.tensionEndDistance * 2 + Math.max(state.tensionBoltLineCount - 1, 0) * state.tensionPitchLongitudinal,
          memberWidth * 1.35,
          220
        )
      : Math.max(
          state.tensionWeldLengthLongitudinal + 80,
          state.tensionWeldLengthTransverse + 80,
          memberWidth * 1.35,
          220
        );

    if (state.tensionConnectionMode === "bolted") {
      const holeXs = Array.from({ length: Math.max(state.tensionBoltLineCount, 1) }, (_, index) => state.tensionEndDistance + index * state.tensionPitchLongitudinal);
      const holeYs = state.tensionBoltRowCount <= 1
        ? [memberWidth / 2]
        : Array.from({ length: state.tensionBoltRowCount }, (_, index) => state.tensionEdgeDistanceNear + index * state.tensionGaugeTransverse);
      const holes = [];
      holeXs.forEach((x) => {
        holeYs.forEach((y) => holes.push({ x, y }));
      });
      const netX = holeXs[0] || state.tensionEndDistance;
      const nearY = holeYs[0] || memberWidth / 2;
      const farY = holeYs[holeYs.length - 1] || memberWidth / 2;
      const farX = holeXs[holeXs.length - 1] || netX;
      const halfHole = state.holeDiameter / 2;
      const blockTop = Math.max(nearY - halfHole, 0);
      const blockBottom = Math.min(farY + halfHole, memberWidth);
      const blockFarX = Math.min(farX + halfHole, memberLength);

      return {
        mode: "geometry",
        connectionMode: "bolted",
        loadDirection: "horizontal",
        memberWidth,
        memberLength,
        holes,
        netSection: {
          label: "控制淨斷面",
          points: [
            { x: netX, y: 0 },
            { x: netX, y: memberWidth },
          ],
        },
        blockShear: [
          { x: 0, y: blockTop },
          { x: blockFarX, y: blockTop },
          { x: blockFarX, y: blockBottom },
          { x: 0, y: blockBottom },
        ],
        caption: `螺栓接合示意，Ae = ${formatEquationNumber(derived.effectiveNetArea)} mm²。`,
      };
    }

    const weldSegments = [];
    const longitudinalStart = 18;
    const longitudinalEnd = Math.min(longitudinalStart + Math.max(state.tensionWeldLengthLongitudinal, 0), memberLength - 18);
    const weldInset = Math.min(14, Math.max(memberWidth * 0.08, 10));

    if (state.tensionWeldLengthLongitudinal > 0) {
      const lineCount = Math.max(state.tensionWeldLineCount, 1);
      const weldYPositions = lineCount === 1
        ? [memberWidth / 2]
        : [weldInset, memberWidth - weldInset];
      weldYPositions.slice(0, lineCount).forEach((y) => {
        weldSegments.push({
          type: "longitudinal",
          x1: longitudinalStart,
          y1: y,
          x2: longitudinalEnd,
          y2: y,
        });
      });
    }

    if (state.tensionWeldCase === "transverse_direct" || state.tensionWeldLengthTransverse > 0) {
      const transverseLength = Math.min(
        state.tensionWeldCase === "transverse_direct" && state.tensionWeldLengthTransverse <= 0
          ? memberWidth
          : state.tensionWeldLengthTransverse,
        memberWidth
      );
      const startY = Math.max((memberWidth - transverseLength) / 2, 0);
      weldSegments.push({
        type: "transverse",
        x1: 26,
        y1: startY,
        x2: 26,
        y2: startY + transverseLength,
      });
    }

    const controllingX = state.tensionWeldCase === "transverse_direct"
      ? 38
      : Math.min(longitudinalEnd + 16, memberLength - 10);

    return {
      mode: "geometry",
      connectionMode: "welded",
      loadDirection: "horizontal",
      memberWidth,
      memberLength,
      weldSegments,
      netSection: {
        label: "有效斷面示意",
        points: [
          { x: controllingX, y: 0 },
          { x: controllingX, y: memberWidth },
        ],
      },
      caption: state.tensionWeldCase === "transverse_direct"
        ? `橫向銲道直接傳力，Ae = A = ${formatEquationNumber(derived.effectiveNetArea)} mm²。`
        : `銲接接合示意，Ae = ${formatEquationNumber(derived.effectiveNetArea)} mm²。`,
    };
  }

  function getTensionWeldTypeLabel(type) {
    switch (type) {
      case "groove_cjp": return "全滲透開槽銲";
      case "groove_pjp": return "部分滲透開槽銲";
      case "plug_slot": return "塞孔銲 / 塞槽銲";
      case "fillet":
      default: return "填角銲";
    }
  }

  function buildTensionMemberDetailChecks(state, derived) {
    const slenderness = state.radiusOfGyration > 0 ? state.unsupportedLength / state.radiusOfGyration : Infinity;
    const checks = [
      makeDetailCheck("tension_slenderness", "受拉構材長細比", slenderness, 300, "lte", `L / r = ${formatEquationNumber(slenderness)}，規範建議不宜超過 300。`, "4.4"),
      makeDetailCheck("tension_effectiveNetArea", "有效淨斷面合理性", derived.effectiveNetArea <= derived.grossArea ? 1 : 0, true, "custom", "Ae 不應大於 Ag。", "4.3"),
    ];

    if (state.tensionConnectionMode === "bolted") {
      const minSpacing = getMinimumSpacing(state, state.boltDiameter);
      const minEndEdge = getMinimumEndEdgeDistance(state, state.boltDiameter);
      const minSideEdge = getMinimumSideEdgeDistance(state, state.boltDiameter);
      const maxEdge = getMaximumEdgeDistance(state.memberThickness);
      const maxSpacing = getMaximumSpacing(state, state.memberThickness);
      checks.push(
        makeDetailCheck("tension_holeCompatibility", "孔型適用性", getHoleRule(state.holeType).allowedForBearing ? 1 : 0, true, "custom", getHoleRule(state.holeType).allowedForBearing ? "此孔型可配合目前承壓型螺栓檢核。" : "此孔型多屬特殊孔，承壓型檢核應再行確認。", "10.3.8~10.3.9"),
        makeDetailCheck("tension_minSpacing", "最小間距 s", state.tensionBoltLineCount > 1 ? state.tensionPitchLongitudinal : minSpacing, minSpacing, "gte", `提供值 = ${formatEquationNumber(state.tensionBoltLineCount > 1 ? state.tensionPitchLongitudinal : minSpacing)} mm，規定下限 = ${formatEquationNumber(minSpacing)} mm`, "10.3.11"),
        makeDetailCheck("tension_minGauge", "最小橫距 g", state.tensionBoltRowCount > 1 ? state.tensionGaugeTransverse : minSpacing, minSpacing, "gte", `提供值 = ${formatEquationNumber(state.tensionBoltRowCount > 1 ? state.tensionGaugeTransverse : minSpacing)} mm，規定下限 = ${formatEquationNumber(minSpacing)} mm`, "10.3.11"),
        makeDetailCheck("tension_minEnd", "最小端距", state.tensionEndDistance, minEndEdge, "gte", `提供值 = ${formatEquationNumber(state.tensionEndDistance)} mm，規定下限 = ${formatEquationNumber(minEndEdge)} mm`, "10.3.12"),
        makeDetailCheck("tension_minEdgeNear", "最小邊距 e1", state.tensionEdgeDistanceNear, minSideEdge, "gte", `提供值 = ${formatEquationNumber(state.tensionEdgeDistanceNear)} mm，規定下限 = ${formatEquationNumber(minSideEdge)} mm`, "10.3.12"),
        makeDetailCheck("tension_minEdgeFar", "最小邊距 e2", state.tensionEdgeDistanceFar, minSideEdge, "gte", `提供值 = ${formatEquationNumber(state.tensionEdgeDistanceFar)} mm，規定下限 = ${formatEquationNumber(minSideEdge)} mm`, "10.3.12"),
        makeDetailCheck("tension_maxSpacing", "最大間距 s", state.tensionBoltLineCount > 1 ? state.tensionPitchLongitudinal : 0, maxSpacing, "lte", state.tensionBoltLineCount > 1 ? `提供值 = ${formatEquationNumber(state.tensionPitchLongitudinal)} mm，規定上限 = ${formatEquationNumber(maxSpacing)} mm` : "單一螺栓列不受此項控制。", "10.3.13"),
        makeDetailCheck("tension_maxEdge", "最大邊距", Math.max(state.tensionEndDistance, state.tensionEdgeDistanceNear, state.tensionEdgeDistanceFar), maxEdge, "lte", `提供最大值 = ${formatEquationNumber(Math.max(state.tensionEndDistance, state.tensionEdgeDistanceNear, state.tensionEdgeDistanceFar))} mm，規定上限 = ${formatEquationNumber(maxEdge)} mm`, "10.3.13"),
        makeDetailCheck("tension_blockArea", "區塊剪力面積完整性", derived.Agv > 0 && derived.Anv > 0 && derived.Agt > 0 && derived.Ant > 0 ? 1 : 0, true, "custom", "Agv、Anv、Agt、Ant 需為正值。", "10.4")
      );
    } else {
      const thickerPart = Math.max(state.memberThickness, state.tensionConnectedThickness);
      const thinnerPart = Math.min(state.memberThickness || Infinity, state.tensionConnectedThickness || Infinity);
      const totalWeldLength = state.tensionWeldLengthLongitudinal * state.tensionWeldLineCount + state.tensionWeldLengthTransverse;
      checks.push(
        makeDetailCheck("tension_weldLength", "縱向銲長與板寬", state.tensionWeldCase !== "plate_longitudinal_both_sides" || state.tensionWeldLengthLongitudinal >= state.memberWidth ? 1 : 0, true, "custom", "端部雙側縱向銲之鋼板應滿足 l ≥ W。", "4.3"),
        makeDetailCheck("tension_shortWeld", "最小有效銲長", state.tensionWeldType !== "fillet" || state.tensionWeldLengthLongitudinal >= 4 * state.tensionWeldSize || state.tensionWeldLengthTransverse >= 4 * state.tensionWeldSize ? 1 : 0, true, "custom", "填角銲有效長度宜至少為 4a。", "10.2.2"),
        makeDetailCheck("tension_filletMin", "填角銲最小尺寸", state.tensionWeldType !== "fillet" || state.tensionWeldSize >= getMinimumFilletSize(thickerPart) ? 1 : 0, true, "custom", `依表 10.2-4，厚板 ${formatEquationNumber(thickerPart)} mm 時，最小填角銲尺寸 = ${formatEquationNumber(getMinimumFilletSize(thickerPart))} mm。`, "10.2.2"),
        makeDetailCheck("tension_filletMax", "填角銲最大尺寸", state.tensionWeldType !== "fillet" || thinnerPart === Infinity || state.tensionWeldSize <= getMaximumEdgeFilletSize(thinnerPart) ? 1 : 0, true, "custom", `依 10.2.2，沿板邊填角銲尺寸不宜大於較薄板厚限制值 ${formatEquationNumber(getMaximumEdgeFilletSize(thinnerPart === Infinity ? 0 : thinnerPart))} mm。`, "10.2.2"),
        makeDetailCheck("tension_lapLength", "搭接長度", state.tensionWeldType !== "fillet" || state.tensionLapLength >= Math.max(5 * thinnerPart, 25) ? 1 : 0, true, "custom", `依 10.2.2，搭接長度應至少為 5t 且不小於 25 mm；本例下限 = ${formatEquationNumber(Math.max(5 * thinnerPart, 25))} mm。`, "10.2.2"),
        makeDetailCheck("tension_pjpThroat", "PJP 最小有效喉厚", state.tensionWeldType !== "groove_pjp" || state.tensionWeldEffectiveThroat >= getMinimumPjpThroat(thickerPart) ? 1 : 0, true, "custom", `依表 10.2-3，厚板 ${formatEquationNumber(thickerPart)} mm 時，最小有效銲喉厚 = ${formatEquationNumber(getMinimumPjpThroat(thickerPart))} mm。`, "10.2.2"),
        makeDetailCheck("tension_plugWidth", "塞孔 / 塞槽最小寬度", state.tensionWeldType !== "plug_slot" || state.tensionWeldOpeningWidth >= Math.max(state.tensionConnectedThickness + 8, 16) ? 1 : 0, true, "custom", `依 10.2.2，開孔寬度應不小於板厚 + 8 mm，且不得小於 16 mm；本例下限 = ${formatEquationNumber(Math.max(state.tensionConnectedThickness + 8, 16))} mm。`, "10.2.2"),
        makeDetailCheck("tension_plugLength", "塞槽長寬比", state.tensionWeldType !== "plug_slot" || state.tensionWeldOpeningLength <= 10 * state.tensionWeldOpeningWidth ? 1 : 0, true, "custom", "依 10.2.2，塞槽長度不得大於寬度之 10 倍。", "10.2.2"),
        makeDetailCheck("tension_plugSpacing", "塞孔邊緣淨距", state.tensionWeldType !== "plug_slot" || state.tensionLapLength >= 4 * state.tensionWeldOpeningWidth ? 1 : 0, true, "custom", "依 10.2.2，塞孔中心間距與邊緣淨距應足供承力且不宜小於孔寬 4 倍；本工具以搭接長度作保守提示。", "10.2.2"),
        makeDetailCheck("tension_matchingFiller", "相稱銲材", state.tensionWeldType !== "groove_cjp" || state.tensionWeldMatchingFiller ? 1 : 0, true, "custom", "依 10.2.6，全滲透開槽銲應採相稱之銲材。", "10.2.6"),
        makeDetailCheck("tension_singleWeldType", "組合銲道範圍", totalWeldLength > 0 ? 1 : 0, true, "custom", "本模組以單一銲道型式作正式檢核；若同一受力面含多種銲型組合，應另依 10.2.5 整理有效面積後確認。", "10.2.5")
      );
    }

    return checks;
  }

  function calculateTensionMember(state) {
    const validations = [];
    const derived = deriveTensionMemberData(state);
    const boltCount = state.tensionBoltLineCount * state.tensionBoltRowCount;
    const slenderness = state.radiusOfGyration > 0 ? state.unsupportedLength / state.radiusOfGyration : Infinity;

    if (state.requiredTension <= 0) validations.push("需求拉力 Tu / Ta 應大於 0。");
    if (state.memberYieldStrength <= 0 || state.memberUltimateStrength <= 0) validations.push("構材強度 Fy、Fu 應完整輸入。");
    if (state.unsupportedLength <= 0 || state.radiusOfGyration <= 0) validations.push("未支撐長度 L 與迴轉半徑 r 應大於 0。");

    if (state.tensionAreaInput === "geometry") {
      if (state.memberWidth <= 0 || state.memberThickness <= 0) validations.push("幾何模式下，構材寬度與厚度應大於 0。");
      if (state.tensionConnectionMode === "bolted") {
        if (state.tensionBoltLineCount < 1 || state.tensionBoltRowCount < 1) validations.push("螺栓配置至少需有 1 行與 1 列。");
        if (state.tensionBoltLineCount > 1 && state.tensionPitchLongitudinal <= 0) validations.push("沿力方向孔距 s 應大於 0。");
        if (state.tensionBoltRowCount > 1 && state.tensionGaugeTransverse <= 0) validations.push("垂直力方向橫距 g 應大於 0。");
        if (derived.netArea <= 0) validations.push("扣除孔寬後之淨斷面積 An 小於等於 0。");
        if (!state.tensionUseManualBlockAreas && (derived.Agv <= 0 || derived.Anv <= 0 || derived.Agt <= 0 || derived.Ant <= 0)) validations.push("自動區塊剪力面積無法成立，請檢查幾何或改採手動輸入。");
      } else {
        if (state.tensionConnectedThickness <= 0) validations.push("銲接模式下，應輸入對接構件厚度 tc。");
        if (state.tensionWeldElectrodeStrength <= 0) validations.push("銲接模式下，銲材強度 FEXX 應完整輸入。");
        if (state.tensionWeldType === "fillet" && state.tensionWeldSize <= 0) validations.push("填角銲型式需輸入銲腳尺寸 a。");
        if (state.tensionWeldType === "groove_pjp" && state.tensionWeldEffectiveThroat <= 0) validations.push("部分滲透開槽銲需輸入有效銲喉厚 te。");
        if (state.tensionWeldType === "plug_slot" && !(state.tensionWeldOpeningWidth > 0 && state.tensionWeldOpeningLength > 0 && state.tensionWeldOpeningCount > 0)) validations.push("塞孔銲 / 塞槽銲需輸入開孔寬、長與數量。");
        if (state.tensionWeldCase === "plate_longitudinal_both_sides" && state.tensionWeldLengthLongitudinal <= 0) validations.push("端部雙側縱向銲需輸入縱向有效銲長 l。");
        if ((state.tensionWeldCase === "transverse_direct" || state.tensionWeldType === "groove_cjp") && state.tensionDirectConnectedArea <= 0) validations.push("橫向直接傳力或全滲透開槽銲模式需輸入直接連接部分面積 A。");
        if (state.tensionWeldType === "fillet" && state.tensionLapLength <= 0) validations.push("填角銲模式需輸入搭接長度。");
      }
    } else {
      if (!(state.tensionGrossArea > 0 && state.tensionNetArea > 0)) validations.push("面積模式下，Ag 與 An 應完整輸入。");
      if (state.tensionNetArea > state.tensionGrossArea) validations.push("An 不可大於 Ag。");
      if (state.tensionConnectionMode === "bolted" && !(state.tensionAgv > 0 && state.tensionAnv > 0 && state.tensionAgt > 0 && state.tensionAnt > 0)) {
        validations.push("螺栓模式之面積輸入需同時提供 Agv、Anv、Agt、Ant。");
      }
    }

    if (state.tensionConnectionMode === "bolted" && state.tensionShearLagCase === "manual_u" && !(state.tensionShearLagFactor > 0 && state.tensionShearLagFactor <= 1)) {
      validations.push("手動輸入之剪力遲滯係數 U 應介於 0 與 1 之間。");
    }
    if (state.tensionConnectionMode === "bolted" && state.tensionSectionType === "connection_plate" && !["connection_plate_cap", "manual_u"].includes(state.tensionShearLagCase)) {
      validations.push("栓接之接續板 / 連接板應採用對應之 Ae = min(An, 0.85Ag) 規則，或改由外部證明後手動輸入 U。");
    }
    if (state.tensionConnectionMode === "bolted" && state.tensionSectionType === "general_shape" && state.tensionShearLagCase === "connection_plate_cap") {
      validations.push("一般受拉構材不可直接套用接續板 / 連接板之 Ae = min(An, 0.85Ag) 規則。");
    }
    if (state.tensionConnectionMode === "welded" && state.tensionWeldCase === "other_manual_u" && !(state.tensionShearLagFactor > 0 && state.tensionShearLagFactor <= 1)) {
      validations.push("手動輸入之剪力遲滯係數 U 應介於 0 與 1 之間。");
    }
    if (derived.effectiveNetArea > derived.grossArea) validations.push("有效淨斷面積 Ae 不可大於 Ag。");
    if (slenderness > 300) validations.push("受拉構材長細比 L / r 已超過 300。");

    const checks = [
      buildGrossYieldCheck({
        key: "tensionGrossYield",
        label: "全斷面降伏強度",
        demand: state.requiredTension,
        fy: state.memberYieldStrength,
        grossArea: derived.grossArea,
        designMethod: state.designMethod,
        note: "依 5.2 全斷面降伏，Pn = FyAg。",
      }),
      buildEffectiveNetRuptureCheck({
        key: "tensionNetRupture",
        label: "有效淨斷面斷裂強度",
        demand: state.requiredTension,
        fu: state.memberUltimateStrength,
        effectiveNetArea: derived.effectiveNetArea,
        designMethod: state.designMethod,
        note: derived.shearLag.note,
      }),
    ];

    checks[1].equationLines = [
      `Ag = ${formatEquationNumber(derived.grossArea)} mm²`,
      `An = ${formatEquationNumber(derived.netArea)} mm²`,
      ...derived.shearLag.equationLines,
      `Rn = Fu × Ae = ${formatEquationNumber(checks[1].nominal)} kN`,
    ];
    checks[1].latexLines = [
      String.raw`\begin{aligned}
A_g &= ${formatEquationNumber(derived.grossArea)}\ \text{mm}^2\\
A_n &= ${formatEquationNumber(derived.netArea)}\ \text{mm}^2
\end{aligned}`,
      ...(derived.shearLag.latexLines || []),
      String.raw`\begin{aligned}
R_n &= F_u A_e = ${formatEquationNumber(state.memberUltimateStrength)} \times ${formatEquationNumber(derived.effectiveNetArea)} / 1000 = ${formatEquationNumber(checks[1].nominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(state.designMethod, "netRupture", checks[1].nominal)}
\end{aligned}`,
    ];

    if (state.tensionConnectionMode === "bolted") {
      const area = boltArea(state.boltDiameter);
      const perRowBearingDemand = state.tensionBoltRowCount > 0 ? state.requiredTension / state.tensionBoltRowCount : state.requiredTension;
      const endLc = state.tensionEndDistance - state.holeDiameter / 2;
      const interiorLc = state.tensionPitchLongitudinal - state.holeDiameter;
      const perRowNominal = bearingNominalPerBolt(endLc, state.memberThickness, state.memberUltimateStrength, state.boltDiameter, state.deformationConsidered)
        + bearingNominalPerBolt(interiorLc, state.memberThickness, state.memberUltimateStrength, state.boltDiameter, state.deformationConsidered) * Math.max(state.tensionBoltLineCount - 1, 0);
      const totalBearingNominal = perRowNominal * state.tensionBoltRowCount;

      checks.push(
        buildBoltShearCheck({
          key: "tensionBoltShear",
          label: "螺栓剪力強度",
          demand: state.requiredTension,
          boltDiameter: state.boltDiameter,
          boltUltimateStrength: state.boltUltimateStrength,
          boltCount,
          shearPlanes: state.tensionShearPlanes,
          threadsCondition: state.threadsCondition,
          designMethod: state.designMethod,
          note: "依 10.3 螺栓剪力強度檢核連接螺栓群。",
        }),
        createCheck({
          key: "tensionBearing",
          label: "構材螺栓孔承壓強度",
          demand: state.requiredTension,
          nominal: totalBearingNominal,
          available: applyDesignStrength(totalBearingNominal, state.designMethod, "bearing"),
          note: "依 10.3.9 檢核構材端部與內部孔之承壓強度。",
          codeRef: "10.3.9",
          equationRef: "式(10.3-2)~式(10.3-4)",
          equationLines: [
            `Ab = π db² / 4 = ${formatEquationNumber(area)} mm²`,
            `單列需求 = ${formatEquationNumber(perRowBearingDemand)} kN`,
            `Lc,end = e - dh / 2 = ${formatEquationNumber(endLc)} mm`,
            `Lc,int = s - dh = ${formatEquationNumber(interiorLc)} mm`,
            `Rn,total = ${formatEquationNumber(totalBearingNominal)} kN`,
          ],
          latexLines: [
            String.raw`\begin{aligned}
A_b &= \frac{\pi d_b^2}{4} = ${formatEquationNumber(area)}\ \text{mm}^2\\
R_{u,\mathrm{row}} &= ${formatEquationNumber(perRowBearingDemand)}\ \text{kN}\\
L_{c,\mathrm{end}} &= e - \frac{d_h}{2} = ${formatEquationNumber(endLc)}\ \text{mm}\\
L_{c,\mathrm{int}} &= s - d_h = ${formatEquationNumber(interiorLc)}\ \text{mm}\\
R_{n,\mathrm{total}} &= ${formatEquationNumber(totalBearingNominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(state.designMethod, "bearing", totalBearingNominal)}
\end{aligned}`,
          ],
        }),
        buildBlockShearAreaCheck({
          key: "tensionBlockShear",
          label: "區塊剪力破壞強度",
          demand: state.requiredTension,
          fy: state.memberYieldStrength,
          fu: state.memberUltimateStrength,
          Agv: derived.Agv,
          Anv: derived.Anv,
          Agt: derived.Agt,
          Ant: derived.Ant,
          designMethod: state.designMethod,
          note: state.tensionUseManualBlockAreas ? "區塊剪力面積採手動輸入。" : "區塊剪力面積由規則孔群幾何自動推導。",
        })
      );
    } else {
      checks.push(buildTensionWeldStrengthCheck(state, derived));
    }

    return {
      ...CONNECTION_META.tension_member,
      checks,
      detailChecks: buildTensionMemberDetailChecks(state, derived),
      validations,
      assumptions: [
        "本模組依受拉構材與接合設計之常用設計流程，將構材本體與接合細部整合檢核。",
        "幾何模式之栓孔排列以規則矩形孔群且孔位對齊為前提；若為交錯孔群或特殊外形，宜改採手動面積輸入。",
        "若採螺栓接合，本版未納入偏心栓群與螺栓拉剪合成；若採銲接接合，本版以單一銲道型式之靜力設計為主。",
      ],
      references: [
        "4.1 全斷面積",
        "4.2 淨斷面積",
        "4.3 有效淨斷面積",
        "4.4 長細比",
        "5.2 設計拉力強度",
        "10.2.2 銲接之限制",
        "10.2.3 塞孔銲及塞槽銲",
        "10.2.4 銲接強度",
        "10.2.5 組合銲道",
        "10.2.6 相稱銲材",
        "10.3 螺栓接合",
        "10.4 設計斷裂破壞強度",
      ],
      derivedAreas: {
        Ag: derived.grossArea,
        An: derived.netArea,
        Ae: derived.effectiveNetArea,
        U: derived.shearLag.U,
        Agv: derived.Agv,
        Anv: derived.Anv,
        Agt: derived.Agt,
        Ant: derived.Ant,
      },
      tensionGeometrySummary: {
        size: state.tensionAreaInput === "geometry"
          ? `${formatEquationNumber(state.memberWidth)} × ${formatEquationNumber(state.memberThickness)} mm`
          : "面積輸入模式",
        connection: state.tensionConnectionMode === "bolted"
          ? `${state.tensionBoltLineCount} 行 × ${state.tensionBoltRowCount} 列螺栓`
          : `${getTensionWeldTypeLabel(state.tensionWeldType)} / ${state.tensionWeldLineCount} 道縱向銲 / ${formatEquationNumber(state.tensionWeldLengthLongitudinal)} mm`,
        shearLag: derived.shearLag.note,
        areaInput: state.tensionAreaInput === "geometry" ? "幾何輸入" : "面積輸入",
      },
      pathSummary: {
        netSection: derived.shearLag.note,
        blockShear: state.tensionConnectionMode === "bolted"
          ? (state.tensionUseManualBlockAreas ? "區塊剪力面積採手動輸入。" : "區塊剪力面積由幾何自動推導。")
          : "銲接模式不檢核螺栓型區塊剪力路徑。",
      },
      sketchData: buildTensionSketchData(state, derived),
    };
  }

  function calculateSinglePlate(state) {
    const validations = [];
    const fillerReduction = getFillerReduction(state);
    if (state.pitch <= state.holeDiameter) validations.push("孔距 s 應大於孔徑 dh，否則內部孔淨距會小於等於 0。");
    if (state.endDistance <= state.holeDiameter / 2) validations.push("端距 e 應大於 dh / 2，否則端部孔淨距會小於等於 0。");
    if (state.transverseEdgeDistance <= state.holeDiameter / 2) validations.push("自由邊距 g 應大於 dh / 2，否則塊狀撕裂拉力淨面積會小於等於 0。");
    if (fillerReduction.invalid) validations.push("未延伸填板厚度超過 19 mm，現有螺栓剪力折減規定已不適用。");

    const checks = [
      buildBoltShearCheck({
        key: "boltShear",
        label: "螺栓剪力",
        demand: state.requiredShear,
        boltDiameter: state.boltDiameter,
        boltUltimateStrength: state.boltUltimateStrength,
        boltCount: state.boltCount,
        shearPlanes: state.shearPlanes,
        threadsCondition: state.threadsCondition,
        designMethod: state.designMethod,
        reductionFactor: fillerReduction.applies ? fillerReduction.reductionFactor : 1,
        note: fillerReduction.applies
          ? `未延伸填板厚度 ${formatEquationNumber(state.fillerThickness)} mm，螺栓剪力已乘折減 ${formatEquationNumber(fillerReduction.reductionFactor)}。`
          : "以單剪力板承壓型螺栓剪力作為主要傳力機制。",
      }),
      buildBoltLineBearingCheck({
        key: "plateBearing",
        label: "剪力板孔承壓",
        demand: state.requiredShear,
        count: state.boltCount,
        endDistance: state.endDistance,
        pitch: state.pitch,
        holeDiameter: state.holeDiameter,
        thickness: state.plateThickness,
        fu: state.plateUltimateStrength,
        boltDiameter: state.boltDiameter,
        deformationConsidered: state.deformationConsidered,
        designMethod: state.designMethod,
        note: "剪力板孔承壓採 1 個端部孔與其餘內部孔分別計算。",
      }),
      buildBoltLineBearingCheck({
        key: "beamBearing",
        label: "梁腹板孔承壓",
        demand: state.requiredShear,
        count: state.boltCount,
        endDistance: state.endDistance,
        pitch: state.pitch,
        holeDiameter: state.holeDiameter,
        thickness: state.beamWebThickness,
        fu: state.beamWebUltimateStrength,
        boltDiameter: state.boltDiameter,
        deformationConsidered: state.deformationConsidered,
        designMethod: state.designMethod,
        note: "腹板孔承壓與剪力板孔承壓分開檢核，不採疊加。",
      }),
      buildBlockShearCheck({
        key: "blockShear",
        label: "剪力板塊狀撕裂",
        demand: state.requiredShear,
        boltCount: state.boltCount,
        endDistance: state.endDistance,
        pitch: state.pitch,
        holeDiameter: state.holeDiameter,
        edgeDistance: state.transverseEdgeDistance,
        thickness: state.plateThickness,
        fy: state.plateYieldStrength,
        fu: state.plateUltimateStrength,
        designMethod: state.designMethod,
        note: "依單列栓孔典型塊狀撕裂路徑估算。",
      }),
      buildWeldCheck({
        key: "weldStrength",
        label: "支承側填角銲",
        demand: state.requiredShear,
        weldSize: state.weldSize,
        weldLength: state.weldLength,
        weldLineCount: state.weldLineCount,
        electrodeStrength: state.weldElectrodeStrength,
        designMethod: state.designMethod,
        note: "以有效喉厚 0.707a 換算支承側銲道強度。",
      }),
    ];

    const detailChecks = [
      ...buildLinearBoltDetailChecks({
        prefix: "剪力板",
        state,
        pitch: state.pitch,
        endDistance: state.endDistance,
        edgeDistance: state.transverseEdgeDistance,
        boltDiameter: state.boltDiameter,
        thickness: state.plateThickness,
        shortWeld: { weldLength: state.weldLength, weldSize: state.weldSize },
      }),
      makeDetailCheck(
        "fillerPlate",
        "填板規定",
        fillerReduction.invalid ? 0 : 1,
        true,
        "custom",
        fillerReduction.invalid
          ? "未延伸填板厚度超過 19 mm，須改採延伸填板或重新配置接頭。"
          : fillerReduction.applies
            ? `未延伸填板厚度 ${formatEquationNumber(state.fillerThickness)} mm，已對螺栓剪力折減。`
            : "未觸發填板折減規定。",
        "10.6"
      ),
    ];

    return {
      ...CONNECTION_META.single_plate,
      checks,
      detailChecks,
      validations,
      assumptions: [
        "接頭型式為單剪力板、單列栓孔、承壓型螺栓。",
        "未納入螺栓剪拉合成、滑動臨界接頭、面板區與耐震特別規定。",
      ],
      references: [
        "10.3.9 螺栓孔承壓",
        "10.3.11 最小間距",
        "10.3.12 最小邊距",
        "10.3.13 最大邊距及間距",
        "10.4 塊狀撕裂",
        "10.6 填板",
      ],
    };
  }

  function calculateColumnSplice(state) {
    const momentTension = state.spliceLeverArm > 0 ? Math.abs(state.requiredMoment) * 1000 / state.spliceLeverArm : 0;
    const axialContribution = state.spliceBearingTransfer ? Math.max(state.requiredAxial, 0) / 2 : Math.abs(state.requiredAxial) / 2;
    const flangeDemand = momentTension + axialContribution;
    const webDemand = Math.abs(state.requiredShear);
    const flangeGrossArea = state.flangePlateWidth * state.flangePlateThickness;
    const flangeNetArea = state.flangePlateNetWidth * state.flangePlateThickness;
    const webArea = state.webPlateDepth * state.webPlateThickness;
    const validations = [];

    if (state.spliceLeverArm <= 0) validations.push("柱翼受力槓桿臂 hsp 必須大於 0。");
    if (state.flangePlateNetWidth > state.flangePlateWidth) validations.push("翼板淨寬 bfn 不應大於翼板總寬 bfp。");
    if (state.webPitch <= state.holeDiameter) validations.push("腹板續接孔距 sw 應大於孔徑 dh。");
    if (state.flangePitch <= state.holeDiameter) validations.push("翼板孔距 sf 應大於孔徑 dh。");
    if (state.requiredAxial < 0 && !state.spliceBearingTransfer) validations.push("壓力未採直接承壓傳遞時，本版會保守將壓力也分配給續接元件。");

    const checks = [
      buildBoltTensionCheck({
        key: "flangeBoltTension",
        label: "柱翼續接螺栓拉力",
        demand: flangeDemand,
        boltDiameter: state.boltDiameter,
        boltUltimateStrength: state.boltUltimateStrength,
        boltCount: state.flangeBoltCount,
        designMethod: state.designMethod,
        note: "拉側有效翼板螺栓群承受由 Mu / hsp 與軸力分配而來之張力。",
      }),
      buildGrossYieldCheck({
        key: "flangePlateYield",
        label: "柱翼續接板降伏",
        demand: flangeDemand,
        fy: state.flangePlateYieldStrength,
        grossArea: flangeGrossArea,
        designMethod: state.designMethod,
        note: "以翼板總寬乘厚度檢核 gross section yielding。",
      }),
      buildNetRuptureCheck({
        key: "flangePlateRupture",
        label: "柱翼續接板淨斷面斷裂",
        demand: flangeDemand,
        fu: state.flangePlateUltimateStrength,
        netArea: flangeNetArea,
        designMethod: state.designMethod,
        note: "以翼板淨寬乘厚度檢核淨斷面抗拉。",
      }),
      buildBoltShearCheck({
        key: "webBoltShear",
        label: "柱腹續接螺栓剪力",
        demand: webDemand,
        boltDiameter: state.boltDiameter,
        boltUltimateStrength: state.boltUltimateStrength,
        boltCount: state.webBoltCount,
        shearPlanes: state.webShearPlanes,
        threadsCondition: state.threadsCondition,
        designMethod: state.designMethod,
        note: "腹板續接螺栓群承擔剪力傳遞。",
      }),
      buildBoltLineBearingCheck({
        key: "webPlateBearing",
        label: "柱腹續接板孔承壓",
        demand: webDemand,
        count: state.webBoltCount,
        endDistance: state.webEndDistance,
        pitch: state.webPitch,
        holeDiameter: state.holeDiameter,
        thickness: state.webPlateThickness,
        fu: state.webPlateUltimateStrength,
        boltDiameter: state.boltDiameter,
        deformationConsidered: state.deformationConsidered,
        designMethod: state.designMethod,
        note: "柱腹續接板孔承壓以線性栓列方式估算。",
      }),
      buildShearYieldCheck({
        key: "webPlateShearYield",
        label: "柱腹續接板剪力降伏",
        demand: webDemand,
        fy: state.webPlateYieldStrength,
        area: webArea,
        designMethod: state.designMethod,
        note: "以腹板續接板深度乘厚度計算剪力面積。",
      }),
      buildWeldCheck({
        key: "spliceWeld",
        label: "柱續接銲道",
        demand: Math.max(flangeDemand, webDemand),
        weldSize: state.spliceWeldSize,
        weldLength: state.spliceWeldLength,
        weldLineCount: state.spliceWeldLineCount,
        electrodeStrength: state.spliceWeldElectrodeStrength,
        designMethod: state.designMethod,
        note: "續接銲道未與螺栓疊加取用，保守以單獨承受主要需求檢核。",
      }),
    ];

    const detailChecks = [
      ...buildLinearBoltDetailChecks({
        prefix: "柱翼續接",
        state,
        pitch: state.flangePitch,
        endDistance: state.flangeEndDistance,
        edgeDistance: state.flangeEdgeDistance,
        boltDiameter: state.boltDiameter,
        thickness: state.flangePlateThickness,
      }),
      ...buildLinearBoltDetailChecks({
        prefix: "柱腹續接",
        state,
        pitch: state.webPitch,
        endDistance: state.webEndDistance,
        edgeDistance: state.webEdgeDistance,
        boltDiameter: state.boltDiameter,
        thickness: state.webPlateThickness,
        shortWeld: { weldLength: state.spliceWeldLength, weldSize: state.spliceWeldSize },
      }),
    ];

    return {
      ...CONNECTION_META.column_splice,
      checks,
      detailChecks,
      validations,
      assumptions: [
        "柱翼拉力需求採 Mu / hsp 加上軸力分配估算，未考慮 prying action。",
        "腹板續接板、螺栓與銲道均分別以可單獨承受主要需求之保守方式檢核。",
        "未納入局部承壓、支承板、勁板與耐震塑性需求。",
      ],
      references: [
        "10.3 螺栓與孔承壓",
        "10.3.11~10.3.13 孔距與邊距",
        "10.4 塊狀撕裂與板件破壞概念",
        "第十章接合設計一般規定",
      ],
    };
  }

  function calculateBraceGusset(state) {
    const axialDemand = Math.abs(state.requiredAxial);
    const grossArea = state.gussetConnectionWidth * state.gussetThickness;
    const netArea = state.gussetNetWidth * state.gussetThickness;
    const whitmoreWidth = state.gussetConnectionWidth + 2 * state.gussetWhitmoreLength * Math.tan(Math.PI / 6);
    const whitmoreArea = whitmoreWidth * state.gussetThickness;
    const validations = [];

    if (state.requiredAxial === 0) validations.push("支撐 / Gusset 接頭通常以軸力為主控；目前 Pu / Pa 為 0。");
    if (state.gussetPitch <= state.holeDiameter) validations.push("Gusset 孔距 sg 應大於孔徑 dh。");
    if (state.gussetNetWidth > whitmoreWidth) validations.push("淨寬 bnet 大於 Whitmore 展開寬度時，請確認淨斷面定義是否正確。");

    const checks = [
      buildBoltShearCheck({
        key: "gussetBoltShear",
        label: "Gusset 螺栓剪力",
        demand: axialDemand,
        boltDiameter: state.boltDiameter,
        boltUltimateStrength: state.boltUltimateStrength,
        boltCount: state.gussetBoltCount,
        shearPlanes: state.gussetShearPlanes,
        threadsCondition: state.threadsCondition,
        designMethod: state.designMethod,
        note: "假設支撐軸力由螺栓群以剪力方式傳遞。",
      }),
      buildBoltLineBearingCheck({
        key: "gussetBearing",
        label: "Gusset 孔承壓",
        demand: axialDemand,
        count: state.gussetBoltCount,
        endDistance: state.gussetEndDistance,
        pitch: state.gussetPitch,
        holeDiameter: state.holeDiameter,
        thickness: state.gussetThickness,
        fu: state.gussetUltimateStrength,
        boltDiameter: state.boltDiameter,
        deformationConsidered: state.deformationConsidered,
        designMethod: state.designMethod,
        note: "以單列栓孔方向之孔承壓強度檢核 Gusset 板。",
      }),
      buildGrossYieldCheck({
        key: "gussetGrossYield",
        label: "Gusset 總斷面降伏",
        demand: axialDemand,
        fy: state.gussetYieldStrength,
        grossArea,
        designMethod: state.designMethod,
        note: "以連接區初始寬度 b0 乘厚度估算 gross section yielding。",
      }),
      buildNetRuptureCheck({
        key: "gussetNetRupture",
        label: "Gusset 淨斷面斷裂",
        demand: axialDemand,
        fu: state.gussetUltimateStrength,
        netArea,
        designMethod: state.designMethod,
        note: "以輸入之有效淨寬 bnet 乘厚度估算淨斷面抗拉。",
      }),
      buildBlockShearCheck({
        key: "gussetBlockShear",
        label: "Gusset 塊狀撕裂",
        demand: axialDemand,
        boltCount: state.gussetBoltCount,
        endDistance: state.gussetEndDistance,
        pitch: state.gussetPitch,
        holeDiameter: state.holeDiameter,
        edgeDistance: state.gussetEdgeDistance,
        thickness: state.gussetThickness,
        fy: state.gussetYieldStrength,
        fu: state.gussetUltimateStrength,
        designMethod: state.designMethod,
        note: "採單列栓孔典型 Gusset 塊狀撕裂破壞路徑。",
      }),
      buildGrossYieldCheck({
        key: "whitmoreYield",
        label: "Whitmore 有效寬度降伏",
        demand: axialDemand,
        fy: state.gussetYieldStrength,
        grossArea: whitmoreArea,
        designMethod: state.designMethod,
        note: "Whitmore 寬度 = b0 + 2L tan30°。",
      }),
      buildWeldCheck({
        key: "gussetWeld",
        label: "Gusset 傳力銲道",
        demand: axialDemand,
        weldSize: state.gussetWeldSize,
        weldLength: state.gussetWeldLength,
        weldLineCount: state.gussetWeldLineCount,
        electrodeStrength: state.gussetWeldElectrodeStrength,
        designMethod: state.designMethod,
        note: "銲道與螺栓不併算，個別檢核其是否可獨立承擔需求。",
      }),
    ];

    return {
      ...CONNECTION_META.brace_gusset,
      checks,
      detailChecks: buildLinearBoltDetailChecks({
        prefix: "Gusset",
        state,
        pitch: state.gussetPitch,
        endDistance: state.gussetEndDistance,
        edgeDistance: state.gussetEdgeDistance,
        boltDiameter: state.boltDiameter,
        thickness: state.gussetThickness,
        shortWeld: { weldLength: state.gussetWeldLength, weldSize: state.gussetWeldSize },
      }),
      validations,
      assumptions: [
        "支撐接頭以軸力傳遞為主，未納入壓桿挫屈與 Gusset 折角外移分析。",
        "Whitmore 有效寬度依 30 度展開估算，僅作第一階段設計檢核。",
        "未納入 brace outstanding leg、偏心接合與耐震 BRB 特別規定。",
      ],
      references: [
        "10.3 螺栓與孔承壓",
        "10.3.11~10.3.13 孔距與邊距",
        "10.4 塊狀撕裂",
        "Whitmore section 工程實務概念",
      ],
    };
  }

  function calculateMomentConnection(state) {
    const tensionDemand = state.momentLeverArm > 0 ? Math.abs(state.requiredMoment) * 1000 / state.momentLeverArm : 0;
    const shearDemand = Math.abs(state.requiredShear);
    const panelZoneDemand = tensionDemand + 0.5 * shearDemand;
    const grossArea = state.momentPlateWidth * state.momentPlateThickness;
    const netArea = state.momentPlateNetWidth * state.momentPlateThickness;
    const validations = [];

    if (state.momentLeverArm <= 0) validations.push("梁翼力偶槓桿臂 hm 必須大於 0。");
    if (state.momentPitch <= state.holeDiameter) validations.push("端板孔距 sm 應大於孔徑 dh。");
    if (state.momentPlateNetWidth > state.momentPlateWidth) validations.push("端板淨寬 bmn 不應大於端板總寬 bmp。");
    if (state.momentShearBoltCount === 0 && shearDemand > 0) validations.push("目前腹板剪力螺栓數為 0，剪力將只由腹板傳力銲道與 panel zone 檢核控制。");

    const checks = [
      buildBoltTensionCheck({
        key: "momentBoltTension",
        label: "拉側端板螺栓拉力",
        demand: tensionDemand,
        boltDiameter: state.boltDiameter,
        boltUltimateStrength: state.boltUltimateStrength,
        boltCount: state.momentBoltCount,
        designMethod: state.designMethod,
        note: "以 Mu / hm 換算拉側螺栓群總張力，不含 prying action 放大。",
      }),
      buildGrossYieldCheck({
        key: "momentPlateYield",
        label: "端板總斷面降伏",
        demand: tensionDemand,
        fy: state.momentPlateYieldStrength,
        grossArea,
        designMethod: state.designMethod,
        note: "以端板總寬乘厚度估算 gross section yielding。",
      }),
      buildNetRuptureCheck({
        key: "momentPlateRupture",
        label: "端板淨斷面斷裂",
        demand: tensionDemand,
        fu: state.momentPlateUltimateStrength,
        netArea,
        designMethod: state.designMethod,
        note: "以端板淨寬乘厚度估算淨斷面抗拉。",
      }),
      buildBoltShearCheck({
        key: "momentShearBolt",
        label: "腹板剪力螺栓",
        demand: shearDemand,
        boltDiameter: state.boltDiameter,
        boltUltimateStrength: state.boltUltimateStrength,
        boltCount: Math.max(state.momentShearBoltCount, 1),
        shearPlanes: state.momentShearPlanes,
        threadsCondition: state.threadsCondition,
        designMethod: state.designMethod,
        note: state.momentShearBoltCount > 0 ? "以腹板剪力螺栓群傳遞 Vu / Va。" : "未配置腹板剪力螺栓時，此檢核會顯示為不利結果，提醒需仰賴其他傳力元件。",
      }),
      buildBoltLineBearingCheck({
        key: "momentShearBearing",
        label: "腹板剪力板孔承壓",
        demand: shearDemand,
        count: Math.max(state.momentShearBoltCount, 1),
        endDistance: state.momentEndDistance,
        pitch: state.momentPitch,
        holeDiameter: state.holeDiameter,
        thickness: state.momentShearPlateThickness,
        fu: state.momentShearPlateUltimateStrength,
        boltDiameter: state.boltDiameter,
        deformationConsidered: state.deformationConsidered,
        designMethod: state.designMethod,
        note: "暫以腹板剪力板線性栓列模型檢核孔承壓。",
      }),
      buildWeldCheck({
        key: "momentWeld",
        label: "腹板傳力銲道",
        demand: shearDemand,
        weldSize: state.momentWeldSize,
        weldLength: state.momentWeldLength,
        weldLineCount: state.momentWeldLineCount,
        electrodeStrength: state.momentWeldElectrodeStrength,
        designMethod: state.designMethod,
        note: "腹板傳力銲道保守視為單獨承受剪力需求。",
      }),
      createCheck({
        key: "panelZone",
        label: "Panel Zone 等效剪力",
        demand: panelZoneDemand,
        nominal: state.panelZoneCapacity,
        available: applyDesignStrength(state.panelZoneCapacity, state.designMethod, "panelZone"),
        note: "以拉側翼力加半數剪力之簡化等效需求評估 panel zone，可作第一階段篩選。",
        equationLines: [
          `T = Mu / hm = ${formatEquationNumber(tensionDemand)} kN`,
          `Vpz,eq = T + 0.5Vu = ${formatEquationNumber(panelZoneDemand)} kN`,
          `可用 panel zone 容量 = ${formatEquationNumber(applyDesignStrength(state.panelZoneCapacity, state.designMethod, "panelZone"))} kN`,
        ],
      }),
    ];

    return {
      ...CONNECTION_META.beam_column_moment,
      checks,
      detailChecks: buildLinearBoltDetailChecks({
        prefix: "端板",
        state,
        pitch: state.momentPitch,
        endDistance: state.momentEndDistance,
        edgeDistance: state.momentEdgeDistance,
        boltDiameter: state.boltDiameter,
        thickness: state.momentPlateThickness,
        shortWeld: { weldLength: state.momentWeldLength, weldSize: state.momentWeldSize },
      }),
      validations,
      assumptions: [
        "彎矩需求以簡化力偶 Mu / hm 換算拉側需求，不含 prying action、端板彎曲與栓列非線性分配。",
        "腹板剪力元件、銲道與 panel zone 分別檢核，不採組合增益。",
        "未納入 continuity plate、panel doubler、耐震 prequalified connection 特別規定。",
      ],
      references: [
        "10.3 螺栓與孔承壓",
        "10.3.11~10.3.13 孔距與邊距",
        "第十章接合設計一般規定",
        "第十三章耐震接頭應另行補充檢核",
      ],
    };
  }

  function calculatePlateCheck(state) {
    const validations = [];
    const plateData = state.plateInputMode === "geometry" ? derivePlateAreasFromGeometry(state) : derivePlateAreasFromManual(state);
    const { orientation, derived } = plateData;
    const effectiveNetArea = Math.min(derived.netArea, 0.85 * derived.grossArea);

    if (state.requiredTension <= 0) validations.push("連接板檢核的需求拉力 Tu / Ta 應大於 0。");
    if (state.plateThickness <= 0) validations.push("連接板厚度 t 應大於 0。");

    if (state.plateInputMode === "geometry") {
      if (state.rowCount < 1 || state.lineCount < 1) validations.push("幾何推導模式需至少有 1 列 × 1 行孔群。");
      if (orientation.holeCountAlong > 1 && orientation.parallelSpacing <= 0) validations.push("受力方向孔距需大於 0。");
      if (orientation.holeCountAcross > 1 && orientation.transverseSpacing <= 0) validations.push("橫向孔距需大於 0。");
      if (derived.controlNetWidth <= 0) validations.push("自動淨斷面推導結果小於等於 0，請調整板件幾何。");
      if (!derived.autoBlockValid && !state.useManualBlockShearPath) validations.push("自動區塊剪力路徑無法成立，請調整幾何或改採手動覆寫。");
      if (state.useManualBlockShearPath && !(state.manualAgv > 0 && state.manualAnv > 0 && state.manualAgt > 0 && state.manualAnt > 0)) {
        validations.push("手動區塊剪力覆寫已啟用，但 Agv、Anv、Agt、Ant 尚未完整輸入。");
      }
    } else {
      if (!(state.grossArea > 0 && state.netArea > 0 && state.Agv > 0 && state.Anv > 0 && state.Agt > 0 && state.Ant > 0)) {
        validations.push("面積直輸模式需完整提供 Ag、An、Agv、Anv、Agt、Ant。");
      }
      if (state.netArea > state.grossArea) validations.push("淨面積 An 不可大於總面積 Ag。");
      if (state.Ant > state.Agt || state.Anv > state.Agv) validations.push("塊狀撕裂的淨面積不可大於對應總面積。");
    }

    const checks = [
      buildGrossYieldCheck({
        key: "plateGrossYield",
        label: "連接板全斷面降伏",
        demand: state.requiredTension,
        fy: state.plateYieldStrength,
        grossArea: derived.grossArea,
        designMethod: state.designMethod,
        codeRef: "10.5",
        equationRef: "式(10.5-1)",
        note: "以受力垂直截面之總斷面積 Ag 檢核板件降伏。",
      }),
      buildEffectiveNetRuptureCheck({
        key: "plateNetRupture",
        label: "連接板有效淨斷面斷裂",
        demand: state.requiredTension,
        fu: state.plateUltimateStrength,
        effectiveNetArea,
        designMethod: state.designMethod,
        codeRef: "10.5",
        equationRef: "式(10.5-2)",
        note: state.plateInputMode === "geometry"
          ? "依 4.3 栓接之連接板規定，Ae = min(An, 0.85Ag)；幾何模式目前僅採直線淨斷面。"
          : "面積直輸模式下，Ae 仍依 4.3 以 min(An, 0.85Ag) 整理。",
      }),
      buildBlockShearAreaCheck({
        key: "plateBlockShear",
        label: "連接板區塊剪力破壞",
        demand: state.requiredTension,
        fy: state.plateYieldStrength,
        fu: state.plateUltimateStrength,
        Agv: derived.Agv,
        Anv: derived.Anv,
        Agt: derived.Agt,
        Ant: derived.Ant,
        designMethod: state.designMethod,
        note: derived.pathSource === "manual_override" ? "區塊剪力面積已採手動覆寫。" : derived.pathSource === "manual_area" ? "面積直輸模式，區塊剪力由使用者提供。" : "依矩形板件常用 U 型區塊剪力路徑自動推導。",
      }),
    ];

    return {
      ...CONNECTION_META.plate_check,
      checks,
      detailChecks: buildPlateDetailChecks(state, orientation, derived),
      validations,
      assumptions: [
        "本模組僅適用矩形板件，且主拉力方向限水平或垂直。",
        "幾何模式僅適用規則孔群之直線淨斷面；交錯孔或特殊淨斷面應改採面積輸入。",
        "區塊剪力幾何模式以矩形 U 型路徑為適用範圍，超出者應改採面積輸入。",
      ],
      references: [
        "4.3 有效淨斷面積",
        "第十章接合設計一般規定",
        "10.3.11~10.3.13 孔距與邊距",
        "10.4 塊狀撕裂",
      ],
      plateGeometrySummary: {
        inputMode: state.plateInputMode,
        loadDirection: orientation.label,
        size: `${formatEquationNumber(state.plateWidth)} × ${formatEquationNumber(state.plateLength)} × ${formatEquationNumber(state.plateThickness)} mm`,
        holePattern: state.plateInputMode === "geometry" ? `${state.lineCount} 行 × ${state.rowCount} 列` : "面積直輸",
      },
      derivedAreas: {
        Ag: derived.grossArea,
        An: derived.netArea,
        Ae: effectiveNetArea,
        Agv: derived.Agv,
        Anv: derived.Anv,
        Agt: derived.Agt,
        Ant: derived.Ant,
      },
      pathSummary: {
        netSection: state.plateInputMode === "geometry"
          ? `直線淨斷面控制，Ae = min(An, 0.85Ag) = ${formatEquationNumber(effectiveNetArea)} mm²`
          : `面積直輸模式，Ae = min(An, 0.85Ag) = ${formatEquationNumber(effectiveNetArea)} mm²`,
        blockShear: derived.pathSource === "manual_override"
          ? "區塊剪力採手動覆寫路徑"
          : derived.pathSource === "manual_area"
            ? "區塊剪力面積由使用者直接輸入"
            : `自動區塊剪力路徑，剪力面長度 ${formatEquationNumber(derived.shearLength)} mm`,
      },
      sketchData: buildPlateSketchData(state, orientation, derived),
    };
  }

  function calculateConnection(rawState) {
    const state = normalizeState(rawState);
    const baseValidations = validateBaseState(state);
    let result;

    switch (state.connectionType) {
      case "column_splice":
        result = calculateColumnSplice(state);
        break;
      case "brace_gusset":
        result = calculateBraceGusset(state);
        break;
      case "beam_column_moment":
        result = calculateMomentConnection(state);
        break;
      case "plate_check":
        result = calculatePlateCheck(state);
        break;
      case "tension_member":
        result = calculateTensionMember(state);
        break;
      case "single_plate":
      default:
        result = calculateSinglePlate(state);
        break;
    }

    const checks = result.checks || [];
    const detailChecks = result.detailChecks || [];
    const validations = [...baseValidations, ...(result.validations || [])];
    const connectionMeta = CONNECTION_META[state.connectionType] || CONNECTION_META.single_plate;
    const complianceReady = Boolean(connectionMeta.complianceReady);
    if (!complianceReady) {
      validations.push("此模組尚未收斂到完整規範覆核範圍，現階段不提供正式規範核算。");
    }
    const scopeNotes = result.assumptions || [];
    const scopeLimited = scopeNotes.some((item) => /(未納入|簡化|保守|第一階段|不含)/.test(item));
    if (scopeLimited) {
      validations.push("本模組仍含範圍受限或簡化條件，結果不得直接視為完整規範覆核。");
    }
    const governing = checks.reduce((maxCheck, current) => (!maxCheck || current.ratio > maxCheck.ratio ? current : maxCheck), null);
    const strengthFailure = checks.some((item) => item.ratio > 1.0);
    const detailFailure = detailChecks.some((item) => !item.passes);
    const hasWarning = validations.length > 0 || checks.some((item) => item.warning) || scopeLimited;
    const overallStatus = !complianceReady || strengthFailure || detailFailure ? "fail" : hasWarning ? "warn" : "ok";

    return {
      state,
      checks,
      detailChecks,
      governing,
      validations,
      assumptions: scopeNotes,
      references: result.references || [],
      reportTitle: result.reportTitle || "鋼構接頭檢核計算書",
      reportSubtitle: result.reportSubtitle || "Steel Connection Report",
      pageTitle: result.pageTitle || "鋼構接頭設計與檢核",
      pageDescription: result.pageDescription || "",
      plateGeometrySummary: result.plateGeometrySummary || null,
      derivedAreas: result.derivedAreas || null,
      pathSummary: result.pathSummary || null,
      sketchData: result.sketchData || null,
      complianceReady,
      scopeLimited,
      overallStatus,
      passes: complianceReady && !(strengthFailure || detailFailure),
      summary: { strengthFailure, detailFailure },
    };
  }

  const api = {
    calculateConnection,
    normalizeState,
    getMinimumSpacing,
    getMinimumEndEdgeDistance,
    getMinimumSideEdgeDistance,
    getMaximumSpacing,
    getConnectionMeta: (type) => CONNECTION_META[type] || CONNECTION_META.single_plate,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.ShearConnectionCalculator = api;
})(typeof window !== "undefined" ? window : globalThis);
