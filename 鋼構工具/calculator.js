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
      pageTitle: "鋼構單剪力板正式規範核算工具",
      pageDescription: "單剪力板 Shear Tab｜LRFD 單列單剪承壓型接頭｜偏心栓群、板件、腹板、銲群與細部規定整合",
      complianceReady: true,
    },
    column_splice: {
      reportTitle: "全斷面 CJP 耐震柱續接能力審查附件",
      reportSubtitle: "Full-Section CJP Seismic Column Splice Capacity Review Attachment",
      pageTitle: "全斷面 CJP 耐震柱續接能力審查",
      pageDescription: "LRFD｜同斷面熱軋 H 形柱｜距梁翼 1.2 m 以上｜13.4.1 軸力、全斷面 CJP 強度與 NDT 計畫治理",
      complianceReady: true,
    },
    brace_gusset: {
      reportTitle: "支撐 / Gusset 接頭檢核計算書",
      reportSubtitle: "Brace Gusset Connection Report",
      pageTitle: "鋼構平板支撐 Gusset 接頭設計與檢核",
      pageDescription: "LRFD 正軸向拉力｜扁鋼 / 平板支撐—Gusset 單列承壓螺栓與 Gusset—支承材雙面縱向填角銲",
      complianceReady: true,
    },
    beam_column_moment: {
      reportTitle: "梁柱彎矩接頭耐震能力審查附件",
      reportSubtitle: "Beam-Column Moment Seismic Review Attachment",
      pageTitle: "鋼構補強式梁柱彎矩接頭耐震能力審查附件",
      pageDescription: "LRFD｜單一選定構架面｜補強式梁柱彎矩接頭耐震能力審查附件，不宣稱 AISC 358 預認證或完整接頭設計",
      complianceReady: true,
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

  function toText(value) {
    return value == null ? "" : String(value);
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
    if (!Number.isFinite(demand) || !Number.isFinite(available) || available <= 0) return Infinity;
    const ratio = demand / available;
    return Number.isFinite(ratio) ? ratio : Infinity;
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

  function getMaximumStandardHoleDiameter(boltDiameter) {
    const table = new Map([[12, 13.5], [16, 17.5], [20, 21.5], [22, 23.5], [24, 25.5]]);
    for (const [nominalDiameter, maximumHoleDiameter] of table.entries()) {
      if (Math.abs(boltDiameter - nominalDiameter) <= 1e-9) return maximumHoleDiameter;
    }
    return boltDiameter >= 27 ? boltDiameter + 1.5 : null;
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

  function createCheck({ key, label, demand, nominal, available, note, equationLines, latexLines, codeRef, equationRef, warning, unit = "" }) {
    return { key, label, demand, nominal, available, ratio: safeRatio(demand, available), note, equationLines, latexLines, codeRef, equationRef, warning: Boolean(warning), unit };
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

  function getF10TBearingBoltShearStress(threadsCondition) {
    const tableStressTfCm2 = threadsCondition === "excluded" ? 5.00 : 4.00;
    return {
      tableStressTfCm2,
      nominalShearStress: tableStressTfCm2 * 98.0665,
    };
  }

  function buildF10TBearingBoltShearCheck({ key, label, demand, boltDiameter, boltCount, shearPlanes, threadsCondition, designMethod, note }) {
    const area = boltArea(boltDiameter);
    const { tableStressTfCm2, nominalShearStress } = getF10TBearingBoltShearStress(threadsCondition);
    const nominal = mm2ToKn(nominalShearStress, area * boltCount * shearPlanes);
    const available = applyDesignStrength(nominal, designMethod, "boltShear");
    return createCheck({
      key,
      label,
      demand,
      nominal,
      available,
      note: `${note} CNS F10T 承壓式螺栓依表 10.3-2 採 ${tableStressTfCm2.toFixed(2)} tf/cm²（${formatEquationNumber(nominalShearStress)} MPa）；LRFD φ = 0.75。`,
      codeRef: "10.3.3、表10.3-2",
      equationRef: "表10.3-2",
      equationLines: [
        `Ab = π db² / 4 = ${formatEquationNumber(area)} mm²`,
        `Fnv = ${tableStressTfCm2.toFixed(2)} tf/cm² × 98.0665 = ${formatEquationNumber(nominalShearStress)} MPa`,
        `Rn = Fnv × Ab × n × ns = ${formatEquationNumber(nominal)} kN`,
        `φRn = 0.75 × Rn = ${formatEquationNumber(available)} kN`,
      ],
      latexLines: [
        String.raw`\begin{aligned}
A_b &= \frac{\pi d_b^2}{4} = \frac{\pi (${formatEquationNumber(boltDiameter)})^2}{4} = ${formatEquationNumber(area)}\ \text{mm}^2\\
F_{nv} &= ${tableStressTfCm2.toFixed(2)}\ \text{tf/cm}^2 \times 98.0665 = ${formatEquationNumber(nominalShearStress)}\ \text{MPa}\\
R_n &= F_{nv} A_b n n_s = ${formatEquationNumber(nominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(designMethod, "boltShear", nominal)}
\end{aligned}`,
      ],
    });
  }

  function getSinglePlateBoltDistribution(state) {
    const count = Math.max(state.boltCount, 1);
    const ordinates = Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * state.pitch);
    const polarSum = ordinates.reduce((sum, ordinate) => sum + ordinate * ordinate, 0);
    const coefficients = ordinates.map((ordinate) => {
      const direct = 1 / count;
      const moment = state.eccentricity > 0
        ? (polarSum > 0 ? state.eccentricity * ordinate / polarSum : Infinity)
        : 0;
      return { ordinate, direct, moment, resultant: Math.hypot(direct, moment) };
    });
    const maxCoefficient = coefficients.reduce((maximum, item) => Math.max(maximum, item.resultant), 0);
    return { count, ordinates, polarSum, coefficients, maxCoefficient };
  }

  function buildSinglePlateBoltShearCheck(state, fillerReduction, distribution) {
    const area = boltArea(state.boltDiameter);
    const { tableStressTfCm2, nominalShearStress } = getF10TBearingBoltShearStress(state.threadsCondition);
    const reduction = fillerReduction.applies ? fillerReduction.reductionFactor : 1;
    const nominalPerBolt = mm2ToKn(nominalShearStress, area * state.shearPlanes * reduction);
    const availablePerBolt = 0.75 * nominalPerBolt;
    const available = distribution.maxCoefficient > 0 && Number.isFinite(distribution.maxCoefficient)
      ? availablePerBolt / distribution.maxCoefficient
      : 0;
    const nominal = available / 0.75;
    return createCheck({
      key: "boltShearEccentric",
      label: "偏心栓群螺栓剪力",
      demand: state.requiredShear,
      nominal,
      available,
      note: `單列栓群採彈性法分配直接剪力與 V·e 彎矩；CNS F10T 螺栓標稱剪應力依表取 ${formatEquationNumber(tableStressTfCm2)} tf/cm²（${formatEquationNumber(nominalShearStress)} MPa）。${fillerReduction.applies ? ` 填板折減係數 ${formatEquationNumber(reduction)} 已納入。` : ""}`,
      codeRef: "10.1.1、10.3.3",
      equationRef: "表10.3-2＋專案指定彈性栓群模型",
      equationLines: [
        `Σyi² = ${formatEquationNumber(distribution.polarSum)} mm²`,
        `Cv = 1/n，Ch,i = e_b yi / Σyi²，Cmax = max√(Cv² + Ch,i²) = ${formatEquationNumber(distribution.maxCoefficient)}`,
        `Ab = πdb²/4 = ${formatEquationNumber(area)} mm²，Rn,bolt = Fnv Ab ns r = ${formatEquationNumber(nominalPerBolt)} kN/支`,
        `φRn,group = 0.75 Rn,bolt / Cmax = ${formatEquationNumber(available)} kN`,
      ],
      latexLines: [String.raw`\begin{aligned}
\sum y_i^2 &= ${formatEquationNumber(distribution.polarSum)}\ \text{mm}^2\\
C_{v} &= \frac{1}{n},\quad C_{h,i}=\frac{e_b y_i}{\sum y_i^2},\quad C_{\max}=${formatEquationNumber(distribution.maxCoefficient)}\\
A_b &= \frac{\pi d_b^2}{4}=${formatEquationNumber(area)}\ \text{mm}^2\\
F_{nv} &= ${formatEquationNumber(tableStressTfCm2)}\ \text{tf/cm}^2=${formatEquationNumber(nominalShearStress)}\ \text{MPa}\\
R_{n,b} &= F_{nv}A_b n_s r=${formatEquationNumber(nominalPerBolt)}\ \text{kN/bolt}\\
\phi R_{n,g} &= \frac{0.75R_{n,b}}{C_{\max}}=${formatEquationNumber(available)}\ \text{kN}
\end{aligned}`],
    });
  }

  function buildSinglePlateEccentricBearingCheck({ key, label, state, distribution, endDistance, sideDistance, thickness, fu, note }) {
    const verticalEndLc = Math.max(endDistance - state.holeDiameter / 2, 0);
    const verticalInteriorLc = Math.max(state.pitch - state.holeDiameter, 0);
    const horizontalLc = Math.max(sideDistance - state.holeDiameter / 2, 0);
    const verticalEnd = 0.75 * bearingNominalPerBolt(verticalEndLc, thickness, fu, state.boltDiameter, state.deformationConsidered);
    const verticalInterior = 0.75 * bearingNominalPerBolt(verticalInteriorLc, thickness, fu, state.boltDiameter, state.deformationConsidered);
    const horizontal = 0.75 * bearingNominalPerBolt(horizontalLc, thickness, fu, state.boltDiameter, state.deformationConsidered);
    const interactions = distribution.coefficients.map((coefficient, index) => {
      const verticalAvailable = index === distribution.count - 1 ? verticalEnd : verticalInterior;
      return verticalAvailable > 0 && horizontal > 0
        ? Math.abs(coefficient.direct) / verticalAvailable + Math.abs(coefficient.moment) / horizontal
        : Infinity;
    });
    const maxInteractionPerKn = interactions.reduce((maximum, value) => Math.max(maximum, value), 0);
    const available = maxInteractionPerKn > 0 && Number.isFinite(maxInteractionPerKn) ? 1 / maxInteractionPerKn : 0;
    return createCheck({
      key,
      label,
      demand: state.requiredShear,
      nominal: available / 0.75,
      available,
      note: `${note} 各栓以 |Fv|/φRn,v + |Fh|/φRn,h ≤ 1.0 作保守線性互制。`,
      codeRef: "10.1.1、10.3.9",
      equationRef: "式(10.3-2)~式(10.3-4)＋專案指定承壓互制",
      equationLines: [
        `Lc,end = ${formatEquationNumber(verticalEndLc)} mm，Lc,int = ${formatEquationNumber(verticalInteriorLc)} mm，Lc,h = ${formatEquationNumber(horizontalLc)} mm`,
        `φRn,v,end = ${formatEquationNumber(verticalEnd)} kN/栓，φRn,v,int = ${formatEquationNumber(verticalInterior)} kN/栓`,
        `φRn,h = ${formatEquationNumber(horizontal)} kN/栓`,
        `max[|Cv|/φRn,v + |Ch,i|/φRn,h] = ${formatEquationNumber(maxInteractionPerKn)} 1/kN`,
        `Vavailable = 1 / max(interaction per unit V) = ${formatEquationNumber(available)} kN`,
      ],
    });
  }

  function buildSinglePlateShearRuptureCheck({ state, area }) {
    const nominal = mm2ToKn(0.6 * state.plateUltimateStrength, area);
    const available = 0.75 * nominal;
    return createCheck({
      key: "plateNetShearRupture",
      label: "剪力板淨斷面剪力斷裂",
      demand: state.requiredShear,
      nominal,
      available,
      note: "扣除單列栓孔之規範淨孔寬後，檢核連接元件剪力斷裂。",
      codeRef: "10.5.2",
      equationRef: "φ = 0.75，Rn = 0.6FuAnv",
      equationLines: [
        `Anv = ${formatEquationNumber(area)} mm²`,
        `Rn = 0.6 Fu Anv = ${formatEquationNumber(nominal)} kN`,
        `φRn = 0.75 Rn = ${formatEquationNumber(available)} kN`,
      ],
    });
  }

  function buildSinglePlateBlockShearCheck({ key, label, state, endDistance, edgeDistance, thickness, fy, fu, note }) {
    const holeWidth = netHoleWidth(state.holeDiameter);
    const shearLength = endDistance + Math.max(state.boltCount - 1, 0) * state.pitch;
    const agv = Math.max(shearLength, 0) * thickness;
    const anv = Math.max(shearLength - (state.boltCount - 0.5) * holeWidth, 0) * thickness;
    const agt = Math.max(edgeDistance, 0) * thickness;
    const ant = Math.max(edgeDistance - holeWidth / 2, 0) * thickness;
    const tensionRupture = mm2ToKn(fu, ant);
    const shearRupture = mm2ToKn(0.6 * fu, anv);
    const shearYield = mm2ToKn(0.6 * fy, agv);
    const tensionYield = mm2ToKn(fy, agt);
    const tensionControls = tensionRupture >= shearRupture;
    const nominal = tensionControls
      ? Math.min(shearYield + tensionRupture, shearRupture + tensionRupture)
      : Math.min(shearRupture + tensionYield, shearRupture + tensionRupture);
    const available = 0.75 * nominal;
    return {
      check: createCheck({
        key,
        label,
        demand: state.requiredShear,
        nominal,
        available,
        note: `${note} 採單一縱向剪力面與一個橫向拉力面之 L 形候選路徑。`,
        codeRef: "10.4",
        equationRef: tensionControls ? "式(10.4-3)" : "式(10.4-4)",
        equationLines: [
          `Agv = ${formatEquationNumber(agv)} mm²，Anv = ${formatEquationNumber(anv)} mm²`,
          `Agt = ${formatEquationNumber(agt)} mm²，Ant = ${formatEquationNumber(ant)} mm²`,
          `Rn = ${formatEquationNumber(nominal)} kN，φRn = 0.75Rn = ${formatEquationNumber(available)} kN`,
        ],
      }),
      areas: { Agv: agv, Anv: anv, Agt: agt, Ant: ant },
    };
  }

  function getVerticalLineGroupCoefficient(length, lineCount, eccentricity) {
    const count = Math.max(lineCount, 1);
    const direct = length > 0 ? 1 / (count * length) : Infinity;
    const polar = count * Math.pow(length, 3) / 12;
    const moment = eccentricity > 0 && polar > 0 ? eccentricity * length / 2 / polar : 0;
    return { direct, moment, maximum: Math.hypot(direct, moment), polar };
  }

  function buildSinglePlateEccentricWeldCheck({ state, key, label, strengthPerLength, nominalStrengthPerLength, note }) {
    const distribution = getVerticalLineGroupCoefficient(state.weldLength, state.weldLineCount, state.weldEccentricity);
    const available = distribution.maximum > 0 && Number.isFinite(distribution.maximum)
      ? strengthPerLength / distribution.maximum
      : 0;
    const nominal = distribution.maximum > 0 && Number.isFinite(distribution.maximum)
      ? nominalStrengthPerLength / distribution.maximum
      : 0;
    return createCheck({
      key,
      label,
      demand: state.requiredShear,
      nominal,
      available,
      note: `${note} 垂直線群採彈性法合成直接剪流與 V·e_w 扭矩剪流。`,
      codeRef: "10.1.1、10.2.4",
      equationRef: "表10.2-5＋專案指定彈性銲群模型",
      equationLines: [
        `Jw = nline Le³/12 = ${formatEquationNumber(distribution.polar)} mm³`,
        `Cq,v = 1/(nline Le) = ${formatEquationNumber(distribution.direct)} 1/mm`,
        `Cq,m = ew Le/(2Jw) = ${formatEquationNumber(distribution.moment)} 1/mm`,
        `Cq,max = √(Cq,v² + Cq,m²) = ${formatEquationNumber(distribution.maximum)} 1/mm`,
        `Vavailable = qavailable / Cq,max = ${formatEquationNumber(available)} kN`,
      ],
    });
  }

  function buildSinglePlateFlexureCheck(state) {
    const plasticModulus = state.plateThickness * Math.pow(state.plateHeight, 2) / 4;
    const nominalMoment = state.plateYieldStrength * plasticModulus / 1e6;
    const availableMoment = 0.9 * nominalMoment;
    const plateEccentricity = Math.max(state.eccentricity, state.weldEccentricity);
    const available = plateEccentricity > 0
      ? availableMoment * 1000 / plateEccentricity
      : Number.MAX_SAFE_INTEGER;
    const nominal = available / 0.9;
    return createCheck({
      key: "plateFlexure",
      label: "剪力板偏心彎曲",
      demand: state.requiredShear,
      nominal,
      available,
      note: "依 10.5.1 與 AISC EJ 2011 對螺栓及剪力板採用 e_b 之要求，板彎曲取 e_p = max(e_b, e_w)；採專案確認之矩形板塑性斷面模數 Zp = tp hp²/4。",
      codeRef: "10.5.1",
      equationRef: "專案指定塑性彎曲模型",
      equationLines: [
        `Zp = tp hp²/4 = ${formatEquationNumber(plasticModulus)} mm³`,
        `Mn = Fy Zp = ${formatEquationNumber(nominalMoment)} kN-m，φMn = 0.90Mn = ${formatEquationNumber(availableMoment)} kN-m`,
        `e_p = max(e_b, e_w) = max(${formatEquationNumber(state.eccentricity)}, ${formatEquationNumber(state.weldEccentricity)}) = ${formatEquationNumber(plateEccentricity)} mm`,
        plateEccentricity > 0
          ? `Vavailable = φMn × 1000 / e_p = ${formatEquationNumber(available)} kN`
          : "e_p = 0，無偏心板彎矩需求。",
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

  function buildLongitudinalBaseMetalWeldCheck({ key, label, demand, thickness, fy, fu, weldLength, weldLineCount, designMethod, note }) {
    const effectiveArea = thickness * weldLength * weldLineCount;
    const nominalYield = mm2ToKn(0.6 * fy, effectiveArea);
    const nominalRupture = mm2ToKn(0.6 * fu, effectiveArea);
    const availableYield = applyDesignStrength(nominalYield, designMethod, "shearYield");
    const availableRupture = applyDesignStrength(nominalRupture, designMethod, "netRupture");
    const available = Math.min(availableYield, availableRupture);
    const nominal = availableYield <= availableRupture ? nominalYield : nominalRupture;
    return createCheck({
      key,
      label,
      demand,
      nominal,
      available,
      note: `${note} 母材剪力降伏與剪力斷裂分別核算，採可用強度較小值。`,
      codeRef: "10.2.4、10.5.2",
      equationRef: "表10.2-5",
      equationLines: [
        `Abase = t × Le × nline = ${formatEquationNumber(effectiveArea)} mm²`,
        `φRn,y = 0.90 × 0.6FyAbase = ${formatEquationNumber(availableYield)} kN`,
        `φRn,u = 0.75 × 0.6FuAbase = ${formatEquationNumber(availableRupture)} kN`,
        `採控制可用強度 = ${formatEquationNumber(available)} kN`,
      ],
      latexLines: [
        String.raw`\begin{aligned}
A_{\mathrm{base}} &= t L_e n = ${formatEquationNumber(effectiveArea)}\ \text{mm}^2\\
\phi R_{n,y} &= 0.90(0.6F_yA_{\mathrm{base}}) = ${formatEquationNumber(availableYield)}\ \text{kN}\\
\phi R_{n,u} &= 0.75(0.6F_uA_{\mathrm{base}}) = ${formatEquationNumber(availableRupture)}\ \text{kN}\\
\phi R_n &= \min(\phi R_{n,y},\phi R_{n,u}) = ${formatEquationNumber(available)}\ \text{kN}
\end{aligned}`,
      ],
    });
  }

  function getLinearBlockShearAreas({ boltCount, endDistance, pitch, holeDiameter, edgeDistance, thickness, shearPlaneCount = 2 }) {
    const holeWidth = netHoleWidth(holeDiameter);
    const lv = endDistance + Math.max(boltCount - 1, 0) * pitch;
    const agv = shearPlaneCount * lv * thickness;
    const anv = shearPlaneCount * Math.max(lv - (boltCount - 0.5) * holeWidth, 0) * thickness;
    const agt = edgeDistance * thickness;
    const ant = Math.max(edgeDistance - holeWidth / 2, 0) * thickness;
    return { Agv: agv, Anv: anv, Agt: agt, Ant: ant };
  }

  function buildBlockShearCheck({ key, label, demand, boltCount, endDistance, pitch, holeDiameter, edgeDistance, thickness, fy, fu, designMethod, note, shearPlaneCount = 2, codeRef = "10.4" }) {
    const { Agv: agv, Anv: anv, Agt: agt, Ant: ant } = getLinearBlockShearAreas({ boltCount, endDistance, pitch, holeDiameter, edgeDistance, thickness, shearPlaneCount });
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
      eccentricity: toNumber(rawState.eccentricity),
      boltDiameter: positive(rawState.boltDiameter),
      holeType: rawState.holeType || "standard",
      holeDiameter: positive(rawState.holeDiameter),
      edgeFabrication: rawState.edgeFabrication || "rolled",
      boltUltimateStrength: positive(rawState.boltUltimateStrength),
      boltGrade: rawState.boltGrade || "F10T",
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
      plateHeight: positive(rawState.plateHeight),
      boltLineToWeldDistance: positive(rawState.boltLineToWeldDistance),
      weldEccentricity: positive(rawState.weldEccentricity),
      beamWebThickness: positive(rawState.beamWebThickness),
      beamWebYieldStrength: positive(rawState.beamWebYieldStrength),
      beamWebUltimateStrength: positive(rawState.beamWebUltimateStrength),
      beamWebEndDistance: positive(rawState.beamWebEndDistance),
      beamWebEdgeDistance: positive(rawState.beamWebEdgeDistance),
      supportThickness: positive(rawState.supportThickness),
      supportYieldStrength: positive(rawState.supportYieldStrength),
      supportUltimateStrength: positive(rawState.supportUltimateStrength),
      fillerThickness: positive(rawState.fillerThickness),
      fillerExtended: rawState.fillerExtended === true || rawState.fillerExtended === "true",
      weldSize: positive(rawState.weldSize),
      weldLength: positive(rawState.weldLength),
      weldLineCount: toNumber(rawState.weldLineCount),
      weldElectrodeStrength: positive(rawState.weldElectrodeStrength),
      demandBasis: rawState.demandBasis || "",
      geometryBasis: rawState.geometryBasis || "",
      materialBasis: rawState.materialBasis || "",
      eccentricityBasis: rawState.eccentricityBasis || "",
      conventionalMaterialConfirmed: rawState.conventionalMaterialConfirmed === true || rawState.conventionalMaterialConfirmed === "true",
      connectionModelConfirmed: rawState.connectionModelConfirmed === true || rawState.connectionModelConfirmed === "true",
      spliceFrameRole: toText(rawState.spliceFrameRole),
      spliceDesignRoute: toText(rawState.spliceDesignRoute),
      spliceLocationRoute: toText(rawState.spliceLocationRoute),
      spliceDistanceToNearestBeamFlange: positive(rawState.spliceDistanceToNearestBeamFlange),
      spliceDeadAxial: toNumber(rawState.spliceDeadAxial),
      spliceDeadAxialRaw: toText(rawState.spliceDeadAxial),
      spliceLiveAxial: toNumber(rawState.spliceLiveAxial),
      spliceLiveAxialRaw: toText(rawState.spliceLiveAxial),
      spliceSeismicAxial: toNumber(rawState.spliceSeismicAxial),
      spliceSeismicAxialRaw: toText(rawState.spliceSeismicAxial),
      spliceLiveLoadFactor: positive(rawState.spliceLiveLoadFactor),
      spliceSeismicReductionFu: positive(rawState.spliceSeismicReductionFu),
      spliceTransferCapRoute: toText(rawState.spliceTransferCapRoute || "uncapped"),
      spliceMaxTransferableAxial: positive(rawState.spliceMaxTransferableAxial),
      spliceAg: positive(rawState.spliceAg),
      spliceZx: positive(rawState.spliceZx),
      spliceZy: positive(rawState.spliceZy),
      spliceAvx: positive(rawState.spliceAvx),
      spliceAvy: positive(rawState.spliceAvy),
      spliceFy: positive(rawState.spliceFy),
      spliceFexx: positive(rawState.spliceFexx),
      spliceMaxThickness: positive(rawState.spliceMaxThickness),
      spliceFabricationLocation: toText(rawState.spliceFabricationLocation),
      spliceNdtMethod: toText(rawState.spliceNdtMethod),
      spliceDemandBasis: toText(rawState.spliceDemandBasis),
      spliceGeometryBasis: toText(rawState.spliceGeometryBasis),
      spliceMaterialBasis: toText(rawState.spliceMaterialBasis),
      spliceWpsBasis: toText(rawState.spliceWpsBasis),
      spliceNdtPlanBasis: toText(rawState.spliceNdtPlanBasis),
      spliceDemandEvidenceSha256: toText(rawState.spliceDemandEvidenceSha256),
      spliceDetailEvidenceSha256: toText(rawState.spliceDetailEvidenceSha256),
      spliceWpsEvidenceSha256: toText(rawState.spliceWpsEvidenceSha256),
      spliceNdtPlanEvidenceSha256: toText(rawState.spliceNdtPlanEvidenceSha256),
      spliceIdenticalSectionsAndMaterialConfirmed: rawState.spliceIdenticalSectionsAndMaterialConfirmed === true || rawState.spliceIdenticalSectionsAndMaterialConfirmed === "true",
      spliceAlignedAxesConfirmed: rawState.spliceAlignedAxesConfirmed === true || rawState.spliceAlignedAxesConfirmed === "true",
      spliceFullProfileCjpConfirmed: rawState.spliceFullProfileCjpConfirmed === true || rawState.spliceFullProfileCjpConfirmed === "true",
      spliceMatchingFillerConfirmed: rawState.spliceMatchingFillerConfirmed === true || rawState.spliceMatchingFillerConfirmed === "true",
      spliceWpsApprovedConfirmed: rawState.spliceWpsApprovedConfirmed === true || rawState.spliceWpsApprovedConfirmed === "true",
      spliceNdtFullCoverageConfirmed: rawState.spliceNdtFullCoverageConfirmed === true || rawState.spliceNdtFullCoverageConfirmed === "true",
      spliceNoPjpConfirmed: rawState.spliceNoPjpConfirmed === true || rawState.spliceNoPjpConfirmed === "true",
      spliceNoMixedLoadSharingConfirmed: rawState.spliceNoMixedLoadSharingConfirmed === true || rawState.spliceNoMixedLoadSharingConfirmed === "true",
      spliceSeismicColumnConfirmed: rawState.spliceSeismicColumnConfirmed === true || rawState.spliceSeismicColumnConfirmed === "true",
      spliceLocationScopeConfirmed: rawState.spliceLocationScopeConfirmed === true || rawState.spliceLocationScopeConfirmed === "true",
      spliceAllAdjacentTransferSourcesIncludedConfirmed: rawState.spliceAllAdjacentTransferSourcesIncludedConfirmed === true || rawState.spliceAllAdjacentTransferSourcesIncludedConfirmed === "true",
      spliceAsBuiltBoundaryConfirmed: rawState.spliceAsBuiltBoundaryConfirmed === true || rawState.spliceAsBuiltBoundaryConfirmed === "true",
      gussetBoltCount: toNumber(rawState.gussetBoltCount),
      gussetShearPlanes: toNumber(rawState.gussetShearPlanes),
      gussetEndDistance: positive(rawState.gussetEndDistance),
      gussetPitch: positive(rawState.gussetPitch),
      gussetEdgeDistance: positive(rawState.gussetEdgeDistance),
      gussetThickness: positive(rawState.gussetThickness),
      gussetYieldStrength: positive(rawState.gussetYieldStrength),
      gussetUltimateStrength: positive(rawState.gussetUltimateStrength),
      gussetNetWidth: positive(rawState.gussetNetWidth),
      gussetConnectionWidth: positive(rawState.gussetConnectionWidth),
      gussetWhitmoreConnectionLength: positive(rawState.gussetWhitmoreConnectionLength),
      gussetAvailableWidth: positive(rawState.gussetAvailableWidth),
      braceSectionType: rawState.braceSectionType || "flat_plate",
      braceEndDistance: positive(rawState.braceEndDistance),
      braceEdgeDistance: positive(rawState.braceEdgeDistance),
      braceThickness: positive(rawState.braceThickness),
      braceFy: positive(rawState.braceFy),
      braceFu: positive(rawState.braceFu),
      braceGrossWidth: positive(rawState.braceGrossWidth),
      braceNetWidth: positive(rawState.braceNetWidth),
      weldFexx: positive(rawState.weldFexx),
      supportFy: positive(rawState.supportFy),
      supportFu: positive(rawState.supportFu),
      gussetDemandBasis: rawState.gussetDemandBasis || "",
      gussetGeometryBasis: rawState.gussetGeometryBasis || "",
      gussetMaterialBasis: rawState.gussetMaterialBasis || "",
      gussetModelBasis: rawState.gussetModelBasis || "",
      gussetStaticNonseismicConfirmed: rawState.gussetStaticNonseismicConfirmed === true || rawState.gussetStaticNonseismicConfirmed === "true",
      gussetLoadPathConfirmed: rawState.gussetLoadPathConfirmed === true || rawState.gussetLoadPathConfirmed === "true",
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
      momentFrameSystem: toText(rawState.momentFrameSystem),
      momentAxis: toText(rawState.momentAxis),
      momentConnectionDesignRoute: toText(rawState.momentConnectionDesignRoute || "reinforced"),
      momentRotationDemandMethod: toText(rawState.momentRotationDemandMethod || "default"),
      momentNonlinearPlasticRotation: positive(rawState.momentNonlinearPlasticRotation),
      momentSystemDuctilityR: positive(rawState.momentSystemDuctilityR),
      momentElasticStoryDrift: positive(rawState.momentElasticStoryDrift),
      momentBeamPlasticModulus: positive(rawState.momentBeamPlasticModulus),
      momentBeamYieldStrength: positive(rawState.momentBeamYieldStrength),
      momentExpectedStrengthFactor: positive(rawState.momentExpectedStrengthFactor),
      momentCriticalSectionDistance: positive(rawState.momentCriticalSectionDistance),
      momentPlasticHingeSpan: positive(rawState.momentPlasticHingeSpan),
      momentFarCriticalSectionExpectedMoment: Math.max(toNumber(rawState.momentFarCriticalSectionExpectedMoment), 0),
      momentFarCriticalSectionExpectedMomentRaw: toText(rawState.momentFarCriticalSectionExpectedMoment),
      momentGravityShear: toNumber(rawState.momentGravityShear),
      momentAmplifiedShear: toNumber(rawState.momentAmplifiedShear),
      momentAvailableFlexuralStrength: positive(rawState.momentAvailableFlexuralStrength),
      momentAvailableShearStrength: positive(rawState.momentAvailableShearStrength),
      momentQualifiedPlasticRotation: positive(rawState.momentQualifiedPlasticRotation),
      momentQualificationRoute: toText(rawState.momentQualificationRoute),
      momentQualificationTestCount: toInteger(rawState.momentQualificationTestCount, 0),
      momentDesignBeamFlangeThickness: positive(rawState.momentDesignBeamFlangeThickness),
      momentTestBeamFlangeThickness: positive(rawState.momentTestBeamFlangeThickness),
      momentDesignFlangePlasticRatio: positive(rawState.momentDesignFlangePlasticRatio),
      momentTestFlangePlasticRatio: positive(rawState.momentTestFlangePlasticRatio),
      momentColumnWebYieldStrength: positive(rawState.momentColumnWebYieldStrength),
      momentColumnDepth: positive(rawState.momentColumnDepth),
      momentPanelZoneThickness: positive(rawState.momentPanelZoneThickness),
      momentPanelZoneClearDepth: positive(rawState.momentPanelZoneClearDepth),
      momentPanelZoneClearWidth: positive(rawState.momentPanelZoneClearWidth),
      momentPanelZoneAnalysisDemand: positive(rawState.momentPanelZoneAnalysisDemand),
      momentPanelZoneBeamMomentSum: positive(rawState.momentPanelZoneBeamMomentSum),
      momentPanelZoneLeverArm: positive(rawState.momentPanelZoneLeverArm),
      momentDoublerPresent: rawState.momentDoublerPresent === true || rawState.momentDoublerPresent === "true",
      momentDoublerAttachmentConfirmed: rawState.momentDoublerAttachmentConfirmed === true || rawState.momentDoublerAttachmentConfirmed === "true",
      momentBeamFlangeWidth: positive(rawState.momentBeamFlangeWidth),
      momentBeamFlangeThickness: positive(rawState.momentBeamFlangeThickness),
      momentColumnFlangeLocalNominalStrength: positive(rawState.momentColumnFlangeLocalNominalStrength),
      momentContinuityPlateProvidedConfirmed: rawState.momentContinuityPlateProvidedConfirmed === true || rawState.momentContinuityPlateProvidedConfirmed === "true",
      momentContinuityPlateWeldConfirmed: rawState.momentContinuityPlateWeldConfirmed === true || rawState.momentContinuityPlateWeldConfirmed === "true",
      momentBeamFlangeCompactnessRatio: positive(rawState.momentBeamFlangeCompactnessRatio),
      momentBeamWebCompactnessRatio: positive(rawState.momentBeamWebCompactnessRatio),
      momentBeamFlangePlasticModulusRatio: positive(rawState.momentBeamFlangePlasticModulusRatio),
      momentCwUpperColumnMoment: positive(rawState.momentCwUpperColumnMoment),
      momentCwLowerColumnMoment: positive(rawState.momentCwLowerColumnMoment),
      momentCwLeftBeamMoment: positive(rawState.momentCwLeftBeamMoment),
      momentCwRightBeamMoment: positive(rawState.momentCwRightBeamMoment),
      momentCcwUpperColumnMoment: positive(rawState.momentCcwUpperColumnMoment),
      momentCcwLowerColumnMoment: positive(rawState.momentCcwLowerColumnMoment),
      momentCcwLeftBeamMoment: positive(rawState.momentCcwLeftBeamMoment),
      momentCcwRightBeamMoment: positive(rawState.momentCcwRightBeamMoment),
      momentDemandBasis: toText(rawState.momentDemandBasis),
      momentGeometryBasis: toText(rawState.momentGeometryBasis),
      momentMaterialBasis: toText(rawState.momentMaterialBasis),
      momentCapacityBasis: toText(rawState.momentCapacityBasis),
      momentPanelZoneBasis: toText(rawState.momentPanelZoneBasis),
      momentStrongColumnBasis: toText(rawState.momentStrongColumnBasis),
      momentQualificationBasis: toText(rawState.momentQualificationBasis),
      momentQualificationEvidenceSha256: toText(rawState.momentQualificationEvidenceSha256),
      momentCapacityEvidenceSha256: toText(rawState.momentCapacityEvidenceSha256),
      momentQualificationConfigurationConfirmed: rawState.momentQualificationConfigurationConfirmed === true || rawState.momentQualificationConfigurationConfirmed === "true",
      momentQualificationMaterialConfirmed: rawState.momentQualificationMaterialConfirmed === true || rawState.momentQualificationMaterialConfirmed === "true",
      momentQualificationWeldingConfirmed: rawState.momentQualificationWeldingConfirmed === true || rawState.momentQualificationWeldingConfirmed === "true",
      momentQualificationGeometryConfirmed: rawState.momentQualificationGeometryConfirmed === true || rawState.momentQualificationGeometryConfirmed === "true",
      momentQualificationFabricationConfirmed: rawState.momentQualificationFabricationConfirmed === true || rawState.momentQualificationFabricationConfirmed === "true",
      momentQualificationProcedureConfirmed: rawState.momentQualificationProcedureConfirmed === true || rawState.momentQualificationProcedureConfirmed === "true",
      momentThirdPartyReviewConfirmed: rawState.momentThirdPartyReviewConfirmed === true || rawState.momentThirdPartyReviewConfirmed === "true",
      momentPlasticZoneGeometryConfirmed: rawState.momentPlasticZoneGeometryConfirmed === true || rawState.momentPlasticZoneGeometryConfirmed === "true",
      momentPlasticZoneOpeningsAbsentConfirmed: rawState.momentPlasticZoneOpeningsAbsentConfirmed === true || rawState.momentPlasticZoneOpeningsAbsentConfirmed === "true",
      momentSeismicMaterialConfirmed: rawState.momentSeismicMaterialConfirmed === true || rawState.momentSeismicMaterialConfirmed === "true",
      momentMatchingWeldConfirmed: rawState.momentMatchingWeldConfirmed === true || rawState.momentMatchingWeldConfirmed === "true",
      momentCns3506WeldConfirmed: rawState.momentCns3506WeldConfirmed === true || rawState.momentCns3506WeldConfirmed === "true",
      momentEndTabsRemovedGroundConfirmed: rawState.momentEndTabsRemovedGroundConfirmed === true || rawState.momentEndTabsRemovedGroundConfirmed === "true",
      momentWeldProcedureMatchesQualificationConfirmed: rawState.momentWeldProcedureMatchesQualificationConfirmed === true || rawState.momentWeldProcedureMatchesQualificationConfirmed === "true",
      momentJointLateralRestraintConfirmed: rawState.momentJointLateralRestraintConfirmed === true || rawState.momentJointLateralRestraintConfirmed === "true",
      momentBeamLateralBracingConfirmed: rawState.momentBeamLateralBracingConfirmed === true || rawState.momentBeamLateralBracingConfirmed === "true",
      momentAllMembersIncludedConfirmed: rawState.momentAllMembersIncludedConfirmed === true || rawState.momentAllMembersIncludedConfirmed === "true",
      momentColumnStrengthsAtGoverningAxialConfirmed: rawState.momentColumnStrengthsAtGoverningAxialConfirmed === true || rawState.momentColumnStrengthsAtGoverningAxialConfirmed === "true",
      momentOpposingDirectionsConfirmed: rawState.momentOpposingDirectionsConfirmed === true || rawState.momentOpposingDirectionsConfirmed === "true",
      momentOrthogonalDirectionSeparateConfirmed: rawState.momentOrthogonalDirectionSeparateConfirmed === true || rawState.momentOrthogonalDirectionSeparateConfirmed === "true",
      momentConnectionHardwareVerifiedConfirmed: rawState.momentConnectionHardwareVerifiedConfirmed === true || rawState.momentConnectionHardwareVerifiedConfirmed === "true",
      momentSelectedAxisScopeConfirmed: rawState.momentSelectedAxisScopeConfirmed === true || rawState.momentSelectedAxisScopeConfirmed === "true",
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
      || (state.connectionType === "tension_member" && (state.tensionConnectionMode === "welded" || state.tensionAreaInput === "manual"))
      || ["column_splice", "beam_column_moment"].includes(state.connectionType);
    if (!skipHoleValidation && state.holeDiameter <= state.boltDiameter) validations.push("孔徑 dh 應大於螺栓直徑 db。");
    if (state.eccentricity > 0 && !["single_plate", "column_splice"].includes(state.connectionType)) validations.push("本版未將偏心造成之栓群附加力納入，偏心接頭請再以栓群分析確認。");
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
        caption: "本案採指定斷面面積，示意圖以文字摘要代替。",
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
          "採指定斷面面積時，須提供 Ag、An、Agv、Anv、Agt、Ant。",
          "Manual"
        ),
        makeDetailCheck(
          "plate_manualNetArea",
          "淨面積合理性",
          state.netArea <= state.grossArea && state.Ant <= state.Agt && state.Anv <= state.Agv ? 1 : 0,
          true,
          "custom",
          "採指定斷面面積時，淨面積不應大於對應總面積。",
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
        caption: "本案採指定斷面面積，示意圖以文字摘要代替。",
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
          : "採指定斷面面積",
        connection: state.tensionConnectionMode === "bolted"
          ? `${state.tensionBoltLineCount} 行 × ${state.tensionBoltRowCount} 列螺栓`
          : `${getTensionWeldTypeLabel(state.tensionWeldType)} / ${state.tensionWeldLineCount} 道縱向銲 / ${formatEquationNumber(state.tensionWeldLengthLongitudinal)} mm`,
        shearLag: derived.shearLag.note,
        areaInput: state.tensionAreaInput === "geometry" ? "依幾何推導" : "採指定斷面面積",
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
    const enteredShear = state.requiredShear;
    const minimumConnectionShear = 4.5 * 9.80665;
    state = { ...state, requiredShear: Math.max(Math.abs(enteredShear), minimumConnectionShear) };
    const validations = [];
    const fillerReduction = getFillerReduction(state);
    const distribution = getSinglePlateBoltDistribution(state);
    const plateWidth = state.boltLineToWeldDistance + state.transverseEdgeDistance;
    const grossShearArea = state.plateHeight * state.plateThickness;
    const netShearArea = Math.max(state.plateHeight - state.boltCount * netHoleWidth(state.holeDiameter), 0) * state.plateThickness;
    const plateBlock = buildSinglePlateBlockShearCheck({
      key: "plateBlockShear",
      label: "剪力板塊狀撕裂",
      state,
      endDistance: state.endDistance,
      edgeDistance: state.transverseEdgeDistance,
      thickness: state.plateThickness,
      fy: state.plateYieldStrength,
      fu: state.plateUltimateStrength,
      note: "剪力板自由邊側典型破壞路徑。",
    });
    const beamBlock = buildSinglePlateBlockShearCheck({
      key: "beamWebBlockShear",
      label: "梁腹板塊狀撕裂",
      state,
      endDistance: state.beamWebEndDistance,
      edgeDistance: state.beamWebEdgeDistance,
      thickness: state.beamWebThickness,
      fy: state.beamWebYieldStrength,
      fu: state.beamWebUltimateStrength,
      note: "梁腹板端部之保守單剪力面破壞路徑。",
    });

    if (state.pitch <= state.holeDiameter) validations.push("孔距 s 應大於孔徑 dh，否則內部孔淨距會小於等於 0。");
    if (state.endDistance <= state.holeDiameter / 2) validations.push("剪力板端距 ep 應大於 dh / 2。");
    if (state.beamWebEndDistance <= state.holeDiameter / 2) validations.push("梁腹板端距 ew 應大於 dh / 2。");
    if (state.transverseEdgeDistance <= state.holeDiameter / 2) validations.push("剪力板自由邊距 g 應大於 dh / 2。");
    if (fillerReduction.invalid) validations.push("未延伸填板厚度超過 19 mm，現有螺栓剪力折減規定已不適用。");
    if (state.designMethod !== "LRFD") validations.push("Shear Tab V1 正式範圍僅支援極限設計法；ASD 需補充螺栓等級與容許應力表後另案核算。");
    if (Math.abs(state.requiredAxial) > 0 || Math.abs(state.requiredMoment) > 0) validations.push("Shear Tab V1 僅核算剪力；非零軸力或外加彎矩須另建接頭模型。");

    let checks = [
      buildSinglePlateBoltShearCheck(state, fillerReduction, distribution),
      buildSinglePlateEccentricBearingCheck({
        key: "plateBearing",
        label: "剪力板偏心孔承壓",
        state,
        distribution,
        endDistance: state.endDistance,
        sideDistance: Math.min(state.transverseEdgeDistance, state.boltLineToWeldDistance),
        thickness: state.plateThickness,
        fu: state.plateUltimateStrength,
        note: "垂直方向分端部孔與內部孔，水平方向保守採自由邊與銲線側之較小淨距。",
      }),
      buildSinglePlateEccentricBearingCheck({
        key: "beamBearing",
        label: "梁腹板偏心孔承壓",
        state,
        distribution,
        endDistance: state.beamWebEndDistance,
        sideDistance: state.beamWebEdgeDistance,
        thickness: state.beamWebThickness,
        fu: state.beamWebUltimateStrength,
        note: "梁腹板採專案確認之端距與最小橫向邊距，與剪力板分開檢核。",
      }),
      buildShearYieldCheck({
        key: "plateGrossShearYield",
        label: "剪力板全斷面剪力降伏",
        demand: state.requiredShear,
        fy: state.plateYieldStrength,
        area: grossShearArea,
        designMethod: "LRFD",
        note: "以沿垂直傳力方向之剪力板全高乘板厚作為連接元件全剪力面積。",
        codeRef: "10.5.2",
        equationRef: "φ = 0.90，Rn = 0.6FyAgv",
      }),
      buildSinglePlateShearRuptureCheck({ state, area: netShearArea }),
      plateBlock.check,
      beamBlock.check,
      buildSinglePlateFlexureCheck(state),
    ];

    const weldThroat = 0.707 * state.weldSize;
    const weldNominalPerLength = 0.6 * state.weldElectrodeStrength * weldThroat / 1000;
    const weldAvailablePerLength = 0.75 * weldNominalPerLength;
    const plateBaseNominalPerLength = Math.min(0.6 * state.plateYieldStrength, 0.6 * state.plateUltimateStrength) * state.plateThickness / 1000;
    const supportBaseNominalPerLength = Math.min(0.6 * state.supportYieldStrength, 0.6 * state.supportUltimateStrength) * state.supportThickness / 1000;
    const baseNominalPerLength = Math.min(plateBaseNominalPerLength, supportBaseNominalPerLength);
    const baseAvailablePerLength = Math.min(
      0.9 * 0.6 * state.plateYieldStrength * state.plateThickness,
      0.75 * 0.6 * state.plateUltimateStrength * state.plateThickness,
      0.9 * 0.6 * state.supportYieldStrength * state.supportThickness,
      0.75 * 0.6 * state.supportUltimateStrength * state.supportThickness
    ) / 1000;
    checks.push(
      buildSinglePlateEccentricWeldCheck({
        state,
        key: "weldMetalEccentric",
        label: "偏心銲群銲材強度",
        strengthPerLength: weldAvailablePerLength,
        nominalStrengthPerLength: weldNominalPerLength,
        note: "填角銲有效喉厚取 0.707a，銲材剪力強度取 φ0.6FEXX。",
      }),
      buildSinglePlateEccentricWeldCheck({
        state: { ...state, weldLineCount: 1 },
        key: "weldBaseMetalEccentric",
        label: "偏心銲群母材強度",
        strengthPerLength: baseAvailablePerLength,
        nominalStrengthPerLength: baseNominalPerLength,
        note: "剪力板與支承材各採唯一母材剪力面；沿銲線之剪力降伏、剪力斷裂均檢核，採四者可用強度最小值。",
      })
    );
    if (state.designMethod !== "LRFD") {
      checks = checks.map((check) => ({
        ...check,
        available: 0,
        ratio: Infinity,
        warning: true,
        note: `${check.note} ASD 路徑未核算，容量封鎖為 0。`,
      }));
    }

    const minWeldSize = getMinimumFilletSize(Math.max(state.plateThickness, state.supportThickness));
    const maxWeldSize = getMaximumEdgeFilletSize(Math.min(state.plateThickness, state.supportThickness));
    const conventionalThicknessLimit = state.boltCount <= 5
      ? state.boltDiameter / 2 + 1.5875
      : state.boltDiameter / 2 - 1.5875;
    const conventionalBoltEccentricity = state.boltCount <= 5
      ? state.boltLineToWeldDistance / 2
      : state.boltLineToWeldDistance;
    const conventionalWeldSize = 0.625 * state.plateThickness;
    const maximumStandardHoleDiameter = getMaximumStandardHoleDiameter(state.boltDiameter);
    const hasBasis = (value) => Boolean(String(value || "").trim()) && !/示例|請依專案覆寫/.test(String(value));
    const detailChecks = [
      makeDetailCheck("singlePlateMethod", "設計法適用範圍", state.designMethod === "LRFD" ? 1 : 0, true, "custom", state.designMethod === "LRFD" ? "Shear Tab V1 採極限設計法。" : "本版未建立 ASD 螺栓等級與容許應力表，禁止核可。", "V1 適用範圍"),
      makeDetailCheck("singlePlateShearOnlyAxial", "剪力單一作用｜軸力", Math.abs(state.requiredAxial), 0, "lte", "需求軸力必須為 0 kN。", "V1 適用範圍"),
      makeDetailCheck("singlePlateShearOnlyMoment", "剪力單一作用｜外加彎矩", Math.abs(state.requiredMoment), 0, "lte", "外加彎矩必須為 0 kN-m；偏心 V·e 已由本模組計入。", "V1 適用範圍"),
      makeDetailCheck("singlePlatePositiveShear", "正剪力需求", state.requiredShear > 0 ? 1 : 0, true, "custom", "剪力需求須大於 0 kN。", "專案指定"),
      makeDetailCheck("singlePlateBoltCount", "單列栓數適用範圍", state.boltCount >= 2 && state.boltCount <= 12 ? 1 : 0, true, "custom", "本版限單列 2 至 12 支螺栓。", "專案指定"),
      makeDetailCheck("singlePlateConventionalPitch", "傳統程序栓距上限", state.pitch, 76.2, "lte", "本版 conventional procedure 限栓列中心距 s ≤ 3 in = 76.2 mm；更大栓距須另做轉角延性與延伸型構造檢核。", "專案指定｜AISC EJ 2011"),
      makeDetailCheck("singlePlateConventionalHeight", "傳統程序板高上限", state.plateHeight, 914.4, "lte", "本版 conventional procedure 限剪力板高度 hp ≤ 36 in = 914.4 mm；超出時須另做板挫屈與延伸型構造檢核。", "專案指定｜AISC EJ 2011"),
      makeDetailCheck("singlePlateSingleShear", "單剪適用範圍", state.shearPlanes, 1, "lte", "Shear Tab V1 限單剪面。", "專案指定"),
      makeDetailCheck("singlePlateStandardHole", "標準孔適用範圍", state.holeType === "standard" ? 1 : 0, true, "custom", "本版偏心承壓互制僅對標準孔核可。", "10.3.9"),
      makeDetailCheck("singlePlateBoltGrade", "螺栓等級", state.boltGrade === "F10T" && Math.abs(state.boltUltimateStrength - 1000) <= 1 ? 1 : 0, true, "custom", "Shear Tab V1 鎖定 CNS F10T、Fub = 1000 MPa；其他等級須新增規範表路線。", "10.3.3、表10.3-2"),
      makeDetailCheck("singlePlatePlateMaterialOrder", "剪力板材料強度順序", state.plateUltimateStrength >= state.plateYieldStrength ? 1 : 0, true, "custom", "剪力板材料須滿足 Fu,p ≥ Fy,p；強度順序不合理時禁止核可。", "規範判定｜材料物理一致性"),
      makeDetailCheck("singlePlateBeamWebMaterialOrder", "梁腹板材料強度順序", state.beamWebUltimateStrength >= state.beamWebYieldStrength ? 1 : 0, true, "custom", "梁腹板材料須滿足 Fu,w ≥ Fy,w；強度順序不合理時禁止核可。", "規範判定｜材料物理一致性"),
      makeDetailCheck("singlePlateSupportMaterialOrder", "支承材材料強度順序", state.supportUltimateStrength >= state.supportYieldStrength ? 1 : 0, true, "custom", "支承材材料須滿足 Fu,s ≥ Fy,s；強度順序不合理時禁止核可。", "規範判定｜材料物理一致性"),
      makeDetailCheck("singlePlateConventionalPlateFy", "傳統程序剪力板 Fy 上限", state.plateYieldStrength, 345, "lte", "AISC EJ 2011 conventional single-plate procedure 的本版適用範圍限剪力板 Fy,p ≤ 345 MPa；專案確認不得覆寫此硬上限。", "專案指定｜AISC EJ 2011"),
      makeDetailCheck("singlePlateConventionalBeamWebFy", "傳統程序梁腹板 Fy 上限", state.beamWebYieldStrength, 345, "lte", "AISC EJ 2011 conventional single-plate procedure 的本版適用範圍限梁腹板 Fy,w ≤ 345 MPa；專案確認不得覆寫此硬上限。", "專案指定｜AISC EJ 2011"),
      makeDetailCheck("singlePlateConventionalMaterialConfirmed", "AISC conventional 材料延性等同性確認", state.conventionalMaterialConfirmed ? 1 : 0, true, "custom", state.conventionalMaterialConfirmed ? "已依核定材料規範確認剪力板與梁腹板之鋼種、規定最小強度與延性，可採用 Fy = 36/50 ksi 所建立之 bolt-plowing／0.03 rad 梁端轉角延性基礎。" : "須由設計者依核定材料規範完成等同性確認；此確認不適用於 Fy > 345 MPa、低延性鋼材、耐震塑鉸、疲勞或反覆載重。", "設計者判斷｜AISC EJ 2011"),
      makeDetailCheck("singlePlateBoltDiameterTable", "螺栓直徑表列範圍", maximumStandardHoleDiameter !== null ? 1 : 0, true, "custom", maximumStandardHoleDiameter !== null ? `db = ${formatEquationNumber(state.boltDiameter)} mm 可依表 10.3-5 判定標準孔上限。` : "db 須為 12、16、20、22、24 mm 或不小於 27 mm，否則本版無表列標準孔路線。", "10.3.8、表10.3-5"),
      makeDetailCheck("singlePlateHoleDiameter", "孔徑大於螺栓直徑", state.holeDiameter > state.boltDiameter ? 1 : 0, true, "custom", "標準孔徑須大於螺栓標稱直徑。", "10.3.8"),
      makeDetailCheck("singlePlateStandardHoleMaximum", "標準孔最大孔徑", state.holeDiameter, maximumStandardHoleDiameter ?? 0, "lte", maximumStandardHoleDiameter === null ? "螺栓直徑不在本版可判定之表列範圍，禁止核可。" : `表 10.3-5 對 db = ${formatEquationNumber(state.boltDiameter)} mm 規定標準孔最大直徑 ${formatEquationNumber(maximumStandardHoleDiameter)} mm。`, "10.3.8、表10.3-5"),
      ...buildLinearBoltDetailChecks({ prefix: "剪力板", state, pitch: state.pitch, endDistance: state.endDistance, edgeDistance: state.transverseEdgeDistance, boltDiameter: state.boltDiameter, thickness: state.plateThickness }),
      makeDetailCheck("singlePlateWeldSideEdge", "栓列至銲線距離", state.boltLineToWeldDistance, getMinimumSideEdgeDistance(state, state.boltDiameter), "gte", "栓列至銲線距離至少採側邊距下限，以保守建立水平承壓淨距。", "10.3.12、專案指定"),
      makeDetailCheck("singlePlateConventionalWidth", "傳統單剪力板栓列—銲線上限", state.boltLineToWeldDistance, 88.9, "lte", "採用之 conventional single-plate procedure 限 a ≤ 3.5 in = 88.9 mm。", "專案指定｜AISC EJ 2011"),
      makeDetailCheck("singlePlateBoltEccentricity", "栓群有效偏心下限", state.eccentricity, conventionalBoltEccentricity, "gte", `標準孔 ${state.boltCount <= 5 ? "2–5 栓採 e_b ≥ a/2" : "6–12 栓採 e_b ≥ a"}；輸入可採更大之專案分析值，不得低於程序下限。`, "專案指定｜AISC EJ 2011 Table 1"),
      makeDetailCheck("singlePlateWeldEccentricity", "銲群有效偏心下限", state.weldEccentricity, state.boltLineToWeldDistance, "gte", "銲群彈性檢核至少採栓列至銲線距離 a；更大偏心依專案力流輸入。", "專案指定｜保守彈性銲群模型"),
      makeDetailCheck("singlePlatePlateHorizontalEdge", "剪力板水平邊距", Math.min(state.transverseEdgeDistance, state.boltLineToWeldDistance), 2 * state.boltDiameter, "gte", "conventional procedure 要求剪力板兩側水平有效邊距至少 2db。", "專案指定｜AISC EJ 2011"),
      makeDetailCheck("singlePlateBeamHorizontalEdge", "梁腹板水平邊距", state.beamWebEdgeDistance, 2 * state.boltDiameter, "gte", "conventional procedure 要求梁腹板水平有效邊距至少 2db。", "專案指定｜AISC EJ 2011"),
      makeDetailCheck("singlePlateConventionalThickness", "傳統單剪力板厚度上限", Math.min(state.plateThickness, state.beamWebThickness), conventionalThicknessLimit, "lte", `依標準孔 ${state.boltCount <= 5 ? "2–5 栓" : "6–12 栓"} 分支限制 min(tp, tw)。`, "專案指定｜AISC EJ 2011"),
      ...buildLinearBoltDetailChecks({ prefix: "梁腹板", state, pitch: state.pitch, endDistance: state.beamWebEndDistance, edgeDistance: state.beamWebEdgeDistance, boltDiameter: state.boltDiameter, thickness: state.beamWebThickness }),
      makeDetailCheck("singlePlatePlateHeight", "板高容納栓列", state.plateHeight, 2 * state.endDistance + Math.max(state.boltCount - 1, 0) * state.pitch, "gte", "板高需容納上下端距與完整栓列。", "專案指定幾何"),
      makeDetailCheck("singlePlateWeldLength", "有效銲長不超過板高", state.weldLength, state.plateHeight, "lte", "有效銲長不得大於剪力板實際高度。", "10.2.2、專案指定幾何"),
      makeDetailCheck("singlePlateShortWeld", "最短有效銲長", state.weldLength, 4 * state.weldSize, "gte", "有效銲長至少為 4a。", "10.2.2"),
      makeDetailCheck("singlePlateLongWeld", "長銲道適用範圍", state.weldLength, 70 * state.weldSize, "lte", "Shear Tab V1 限 Le ≤ 70a；超出時須另計長銲道強度折減。", "10.2.2、V1 適用範圍"),
      makeDetailCheck("singlePlateDoubleFilletWeld", "雙面填角銲", state.weldLineCount === 2 ? 1 : 0, true, "custom", "conventional single-plate procedure 採剪力板兩側對稱填角銲；單面銲之板外偏心不在 V1 模型內。", "專案指定｜AISC EJ 2011"),
      makeDetailCheck("singlePlateConventionalWeldSize", "傳統單剪力板銲腳下限", state.weldSize, conventionalWeldSize, "gte", "雙面填角銲各側銲腳至少取 5/8 tp，以維持程序採用之延性力流。", "專案指定｜AISC EJ 2011"),
      makeDetailCheck("singlePlateMinWeld", "最小填角銲尺寸", state.weldSize, minWeldSize, "gte", "依較厚連接材厚度判定最小填角銲尺寸。", "10.2.2"),
      makeDetailCheck("singlePlateMaxWeld", "最大填角銲尺寸", state.weldSize, maxWeldSize, "lte", "依較薄連接材邊緣厚度限制最大填角銲尺寸。", "10.2.2"),
      makeDetailCheck("singlePlateFiller", "填板規定", fillerReduction.invalid ? 0 : 1, true, "custom", fillerReduction.invalid ? "未延伸填板厚度超過 19 mm，須改採延伸填板或重新配置接頭。" : fillerReduction.applies ? `未延伸填板厚度 ${formatEquationNumber(state.fillerThickness)} mm，已對螺栓剪力折減。` : "未觸發填板折減規定。", "10.6"),
      makeDetailCheck("singlePlateDemandBasis", "剪力需求來源", hasBasis(state.demandBasis) ? 1 : 0, true, "custom", hasBasis(state.demandBasis) ? state.demandBasis : "請填入專案分析、載重組合或簽核文件來源。", "專案指定"),
      makeDetailCheck("singlePlateGeometryBasis", "幾何資料來源", hasBasis(state.geometryBasis) ? 1 : 0, true, "custom", hasBasis(state.geometryBasis) ? state.geometryBasis : "請填入核定圖說或量測資料來源。", "專案指定"),
      makeDetailCheck("singlePlateMaterialBasis", "材料資料來源", hasBasis(state.materialBasis) ? 1 : 0, true, "custom", hasBasis(state.materialBasis) ? state.materialBasis : "請填入材料規格、試驗或證明文件來源。", "專案指定"),
      makeDetailCheck("singlePlateEccentricityBasis", "偏心模型來源", hasBasis(state.eccentricityBasis) ? 1 : 0, true, "custom", hasBasis(state.eccentricityBasis) ? state.eccentricityBasis : "請說明 e_b、e_w 與栓列至銲線距離之採用依據。", "專案指定"),
      makeDetailCheck("singlePlateModelConfirmed", "工程師確認接頭模型", state.connectionModelConfirmed ? 1 : 0, true, "custom", state.connectionModelConfirmed ? "已確認單列、單剪、靜力承壓型及彈性偏心分配適用。" : "須由設計者確認模型與實際力流一致。", "設計者判斷"),
    ];

    return {
      ...CONNECTION_META.single_plate,
      checks,
      detailChecks,
      validations,
      assumptions: [
        "正式適用範圍為 LRFD、單剪力板、單列 2 至 12 栓、栓距不大於 76.2 mm、板高不大於 914.4 mm、單剪、標準孔、靜力承壓型螺栓、雙面填角銲與純剪力作用。",
        "剪力板及梁腹板 Fy 均不得大於 345 MPa，Fu 須不小於 Fy，且設計者須依核定材料規範確認可採 AISC EJ 2011 conventional single-plate procedure 的材料延性基礎；此專案確認不能覆寫強度硬上限。",
        "偏心栓群、偏心銲群與剪力板彎剪採專案指定之彈性模型；剪力板彎曲偏心固定取 e_p = max(e_b, e_w)，設計者須確認輸入力線、e_b、e_w 與實際構造一致。",
        "本附件不含滑動臨界、疲勞、反覆載重、耐震特別規定、火害、腐蝕、梁端削切與支承構件整體或局部極限狀態；各項另由專案設計文件確認。",
      ],
      references: [
        "10.1.1 接合與偏心效應", "10.2.2 填角銲細部", "10.2.4 銲接接合強度", "10.3.3 螺栓剪力強度",
        "10.3.9 螺栓孔承壓", "10.3.11 最小間距", "10.3.12 最小邊距", "10.3.13 最大邊距及間距",
        "10.4 塊狀撕裂", "10.5.1 偏心接合", "10.5.2 連接元件剪力降伏與斷裂", "10.6 填板",
        "專案指定｜AISC Engineering Journal 2011 conventional single-plate procedure：Fy = 36/50 ksi 材料延性基礎、3 in 栓距與 36 in 連接高度驗證包絡、e_b、幾何及 5/8 tp 雙面銲細部",
      ],
      derivedAreas: {
        Agv: grossShearArea, Anv: netShearArea,
        plateBlockAgv: plateBlock.areas.Agv, plateBlockAnv: plateBlock.areas.Anv, plateBlockAgt: plateBlock.areas.Agt, plateBlockAnt: plateBlock.areas.Ant,
        beamBlockAgv: beamBlock.areas.Agv, beamBlockAnv: beamBlock.areas.Anv, beamBlockAgt: beamBlock.areas.Agt, beamBlockAnt: beamBlock.areas.Ant,
      },
      plateGeometrySummary: {
        size: `${formatEquationNumber(plateWidth)} × ${formatEquationNumber(state.plateHeight)} × ${formatEquationNumber(state.plateThickness)} mm`,
        holePattern: `單列 ${state.boltCount} 栓 @ ${formatEquationNumber(state.pitch)} mm`,
        eccentricity: `e_b = ${formatEquationNumber(state.eccentricity)} mm；e_w = ${formatEquationNumber(state.weldEccentricity)} mm；e_p = max(e_b, e_w) = ${formatEquationNumber(Math.max(state.eccentricity, state.weldEccentricity))} mm`,
      },
      pathSummary: {
        netSection: `剪力板全 / 淨剪力面積 ${formatEquationNumber(grossShearArea)} / ${formatEquationNumber(netShearArea)} mm²；設計剪力 Vd = max(|${formatEquationNumber(enteredShear)}|, 4.5 tf) = ${formatEquationNumber(state.requiredShear)} kN。`,
        blockShear: "剪力板與梁腹板均採單一縱向剪力面加一個橫向拉力面之 L 形候選路徑。",
      },
      designDemand: { enteredShear, minimumConnectionShear, adoptedShear: state.requiredShear },
    };
  }

  function calculateColumnSplice(state) {
    const hasBasis = (value) => Boolean(String(value || "").trim()) && !/示例|請依專案覆寫|請填|待補|未填|placeholder/i.test(String(value));
    const isSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value || ""));
    const hasFiniteRawNumber = (value) => String(value ?? "").trim() !== "" && Number.isFinite(Number(value));
    const rawLoadInputsValid = [
      state.spliceDeadAxialRaw,
      state.spliceLiveAxialRaw,
      state.spliceSeismicAxialRaw,
    ].every(hasFiniteRawNumber);
    const liveFactorValid = state.spliceLiveLoadFactor === 0.5 || state.spliceLiveLoadFactor === 1.0;
    const seismicFactorValid = Number.isFinite(state.spliceSeismicReductionFu)
      && state.spliceSeismicReductionFu > 0
      && state.spliceSeismicReductionFu <= 2.5;
    const seismicInputValid = Number.isFinite(state.spliceSeismicAxial);
    const EampRaw = 1.4 * state.spliceSeismicReductionFu * Math.abs(state.spliceSeismicAxial);
    const qualifiedTransferCap = state.spliceTransferCapRoute === "qualified";
    const qualifiedTransferCapValid = qualifiedTransferCap
      && Number.isFinite(state.spliceMaxTransferableAxial)
      && state.spliceMaxTransferableAxial > 0
      && state.spliceAllAdjacentTransferSourcesIncludedConfirmed;
    const EampAdopted = qualifiedTransferCapValid
      ? Math.min(EampRaw, 1.25 * state.spliceMaxTransferableAxial)
      : EampRaw;
    const compressionBase = 1.2 * state.spliceDeadAxial + state.spliceLiveLoadFactor * state.spliceLiveAxial;
    const tensionBase = 0.9 * state.spliceDeadAxial;
    const compressionCombinations = [compressionBase + EampAdopted, compressionBase - EampAdopted];
    const tensionCombinations = [tensionBase + EampAdopted, tensionBase - EampAdopted];
    const PuCompression = Math.max(0, ...compressionCombinations.map((value) => -value));
    const TuTension = Math.max(0, ...tensionCombinations);

    const normalNominal = state.spliceFy * state.spliceAg / 1000;
    const normalCapacity = 0.9 * normalNominal;
    const majorFlexuralNominal = state.spliceFy * state.spliceZx / 1e6;
    const majorFlexuralCapacity = 0.9 * majorFlexuralNominal;
    const minorFlexuralNominal = state.spliceFy * state.spliceZy / 1e6;
    const minorFlexuralCapacity = 0.9 * minorFlexuralNominal;
    const majorShearBaseNominal = 0.6 * state.spliceFy * state.spliceAvx / 1000;
    const majorShearWeldNominal = 0.6 * state.spliceFexx * state.spliceAvx / 1000;
    const majorShearBaseCapacity = 0.9 * majorShearBaseNominal;
    const majorShearWeldCapacity = 0.8 * majorShearWeldNominal;
    const majorShearCapacity = Math.min(majorShearBaseCapacity, majorShearWeldCapacity);
    const minorShearBaseNominal = 0.6 * state.spliceFy * state.spliceAvy / 1000;
    const minorShearWeldNominal = 0.6 * state.spliceFexx * state.spliceAvy / 1000;
    const minorShearBaseCapacity = 0.9 * minorShearBaseNominal;
    const minorShearWeldCapacity = 0.8 * minorShearWeldNominal;
    const minorShearCapacity = Math.min(minorShearBaseCapacity, minorShearWeldCapacity);
    const validations = [];

    if (!rawLoadInputsValid || !liveFactorValid || !seismicFactorValid || !seismicInputValid) {
      validations.push("柱續接 13.4.1 需求輸入須為有限值；活載係數限 0.5 或 1.0，且結構系統地震力折減係數 Fu 須大於 0 且不超過 2.5。PE 得為 0，但仍須由受控分析來源明確提供。");
    }
    const positiveSectionInputs = [
      ["全斷面積 Ag", state.spliceAg],
      ["強軸塑性斷面模數 Zx", state.spliceZx],
      ["弱軸塑性斷面模數 Zy", state.spliceZy],
      ["強軸剪力面積 Avx", state.spliceAvx],
      ["弱軸剪力面積 Avy", state.spliceAvy],
      ["母材降伏強度 Fy", state.spliceFy],
      ["銲材標稱拉力強度 FEXX", state.spliceFexx],
      ["最大板厚", state.spliceMaxThickness],
      ["距最近梁翼距離", state.spliceDistanceToNearestBeamFlange],
    ];
    const invalidSectionInputs = positiveSectionInputs.filter(([, value]) => !(Number.isFinite(value) && value > 0));
    if (invalidSectionInputs.length > 0) {
      validations.push(`柱續接幾何與材料輸入須為有限正值：${invalidSectionInputs.map(([label]) => label).join("、")}。`);
    }
    if (qualifiedTransferCap && !qualifiedTransferCapValid) {
      validations.push("採 13.4.1 相接梁／斜撐極限狀態軸力上限時，最大可傳軸力須為有限正值，且須確認所有相接構材均已納入受控來源。");
    }
    const derivedValues = [
      ["EampRaw", EampRaw, "nonnegative"],
      ["EampAdopted", EampAdopted, "nonnegative"],
      ["PuCompression", PuCompression, "nonnegative"],
      ["TuTension", TuTension, "nonnegative"],
      ["normalCapacity", normalCapacity, "positive"],
      ["majorFlexuralCapacity", majorFlexuralCapacity, "positive"],
      ["minorFlexuralCapacity", minorFlexuralCapacity, "positive"],
      ["majorShearCapacity", majorShearCapacity, "positive"],
      ["minorShearCapacity", minorShearCapacity, "positive"],
    ];
    const invalidDerivedValues = derivedValues.filter(([, value, requirement]) => !Number.isFinite(value)
      || (requirement === "positive" ? value <= 0 : value < 0));
    if (invalidDerivedValues.length > 0) {
      validations.push(`柱續接派生需求或容量出現非有限／非正值：${invalidDerivedValues.map(([label]) => label).join("、")}。`);
    }

    const evidenceItems = [
      ["需求來源", hasBasis(state.spliceDemandBasis)],
      ["幾何來源", hasBasis(state.spliceGeometryBasis)],
      ["材料來源", hasBasis(state.spliceMaterialBasis)],
      ["WPS/PQR 來源", hasBasis(state.spliceWpsBasis)],
      ["NDT 計畫來源", hasBasis(state.spliceNdtPlanBasis)],
      ["需求證據 SHA-256", isSha256(state.spliceDemandEvidenceSha256)],
      ["接頭細節證據 SHA-256", isSha256(state.spliceDetailEvidenceSha256)],
      ["WPS/PQR 證據 SHA-256", isSha256(state.spliceWpsEvidenceSha256)],
      ["NDT 計畫證據 SHA-256", isSha256(state.spliceNdtPlanEvidenceSha256)],
    ];
    const evidenceComplete = evidenceItems.every(([, ok]) => ok);
    const cjpRouteComplete = state.spliceDesignRoute === "cjp_full_section_identical_rolled_h"
      && state.spliceFullProfileCjpConfirmed
      && state.spliceNoPjpConfirmed
      && state.spliceNoMixedLoadSharingConfirmed;
    const topologyComplete = state.spliceIdenticalSectionsAndMaterialConfirmed && state.spliceAlignedAxesConfirmed;
    const locationComplete = state.spliceLocationRoute === "beam_flange_1200"
      && state.spliceDistanceToNearestBeamFlange >= 1200
      && state.spliceLocationScopeConfirmed;
    const seismicColumnComplete = state.spliceFrameRole === "seismic_force_resisting" && state.spliceSeismicColumnConfirmed;
    const matchingFillerComplete = state.spliceMatchingFillerConfirmed
      && majorShearWeldCapacity >= majorShearBaseCapacity
      && minorShearWeldCapacity >= minorShearBaseCapacity;
    const wpsComplete = state.spliceWpsApprovedConfirmed
      && hasBasis(state.spliceWpsBasis)
      && isSha256(state.spliceWpsEvidenceSha256);
    const ndtPlanComplete = ["shop", "field"].includes(state.spliceFabricationLocation)
      && ["UT", "RT"].includes(state.spliceNdtMethod)
      && state.spliceNdtFullCoverageConfirmed
      && hasBasis(state.spliceNdtPlanBasis)
      && isSha256(state.spliceNdtPlanEvidenceSha256);
    const loadInputsComplete = rawLoadInputsValid && liveFactorValid && seismicFactorValid && seismicInputValid;
    const transferCapComplete = ["uncapped", "qualified"].includes(state.spliceTransferCapRoute)
      && (!qualifiedTransferCap || qualifiedTransferCapValid);

    const checks = [
      createCheck({
        key: "spliceAxialCompression13_4_1",
        label: "13.4.1 控制軸壓力",
        demand: PuCompression,
        nominal: normalNominal,
        available: normalCapacity,
        note: "採拉力為正、壓力為負之符號，依 13.4.1 放大地震軸力組合取得控制壓力。",
        codeRef: "規範判定｜13.4.1、13.4.2",
        equationRef: "式(13.4-1)",
        unit: "kN",
        equationLines: [
          `Eamp,raw = 1.4 × Fu × |PE| = ${formatEquationNumber(EampRaw)} kN`,
          `Eamp,adopted = ${formatEquationNumber(EampAdopted)} kN${qualifiedTransferCapValid ? "（受 1.25 倍相接構材極限狀態可傳軸力上限控制）" : "（未採可傳軸力上限）"}`,
          `Nuc,+/- = 1.2PD + alphaL PL +/- Eamp = ${formatEquationNumber(compressionCombinations[0])} / ${formatEquationNumber(compressionCombinations[1])} kN（拉力為正）`,
          `Pu,compression = max(0, -Nuc,+, -Nuc,-) = ${formatEquationNumber(PuCompression)} kN`,
          `phi Pn,CJP = 0.90 × Fy × Ag / 1000 = ${formatEquationNumber(normalCapacity)} kN`,
        ],
      }),
      createCheck({
        key: "spliceAxialTension13_4_1",
        label: "13.4.1 控制軸拉力",
        demand: TuTension,
        nominal: normalNominal,
        available: normalCapacity,
        note: "依 0.9D +/- 放大地震軸力組合取得控制拉力；活載不列入式(13.4-2)。",
        codeRef: "規範判定｜13.4.1、13.4.2",
        equationRef: "式(13.4-2)",
        unit: "kN",
        equationLines: [
          `Nut,+/- = 0.9PD +/- Eamp = ${formatEquationNumber(tensionCombinations[0])} / ${formatEquationNumber(tensionCombinations[1])} kN（拉力為正）`,
          `Tu,tension = max(0, Nut,+, Nut,-) = ${formatEquationNumber(TuTension)} kN`,
          `phi Pn,CJP = 0.90 × Fy × Ag / 1000 = ${formatEquationNumber(normalCapacity)} kN`,
        ],
      }),
      createCheck({
        key: "spliceFullSectionNormal",
        label: "全斷面 CJP 法向強度等同性",
        demand: normalCapacity,
        nominal: normalNominal,
        available: normalCapacity,
        note: "全斷面 CJP 有效喉厚等於較薄母材厚度，法向設計強度依母材 0.90Fy 控制。",
        codeRef: "規範判定｜10.2.1、表10.2-5、10.2.6、13.4.2",
        equationRef: "表10.2-5 全滲透開槽銲",
        unit: "kN",
        equationLines: [
          `母材全斷面可用法向強度 = 0.90 × Fy × Ag / 1000 = ${formatEquationNumber(normalCapacity)} kN`,
          `全斷面 CJP 可用法向強度 = ${formatEquationNumber(normalCapacity)} kN`,
        ],
      }),
      createCheck({
        key: "spliceFullSectionMajorFlexure",
        label: "全斷面 CJP 強軸彎曲強度等同性",
        demand: majorFlexuralCapacity,
        nominal: majorFlexuralNominal,
        available: majorFlexuralCapacity,
        note: "相同且對齊之 H 形斷面以全斷面 CJP 延續母材法向降伏應力分布。",
        codeRef: "規範判定｜10.2.1、表10.2-5、10.2.6、13.4.2",
        equationRef: "Mp = Fy Zx；phi = 0.90",
        unit: "kN-m",
        equationLines: [
          `Mn,x = Fy × Zx / 10^6 = ${formatEquationNumber(majorFlexuralNominal)} kN-m`,
          `phi Mn,x = 0.90 × Mn,x = ${formatEquationNumber(majorFlexuralCapacity)} kN-m`,
        ],
      }),
      createCheck({
        key: "spliceFullSectionMinorFlexure",
        label: "全斷面 CJP 弱軸彎曲強度等同性",
        demand: minorFlexuralCapacity,
        nominal: minorFlexuralNominal,
        available: minorFlexuralCapacity,
        note: "相同且對齊之 H 形斷面以全斷面 CJP 延續弱軸法向降伏應力分布。",
        codeRef: "規範判定｜10.2.1、表10.2-5、10.2.6、13.4.2",
        equationRef: "Mp = Fy Zy；phi = 0.90",
        unit: "kN-m",
        equationLines: [
          `Mn,y = Fy × Zy / 10^6 = ${formatEquationNumber(minorFlexuralNominal)} kN-m`,
          `phi Mn,y = 0.90 × Mn,y = ${formatEquationNumber(minorFlexuralCapacity)} kN-m`,
        ],
      }),
      createCheck({
        key: "spliceFullSectionMajorShear",
        label: "全斷面 CJP 強軸剪力強度",
        demand: majorShearBaseCapacity,
        nominal: Math.min(majorShearBaseNominal, majorShearWeldNominal),
        available: majorShearCapacity,
        note: "CJP 剪力可用強度取母材 0.90(0.6Fy) 與銲材 0.80(0.6FEXX) 較小值，並須至少等於母材全斷面剪力強度。",
        codeRef: "規範判定｜表10.2-5、10.2.6、13.4.2",
        equationRef: "表10.2-5 全滲透開槽銲剪應力",
        unit: "kN",
        equationLines: [
          `母材 phi Vn,x = 0.90 × 0.6Fy × Avx / 1000 = ${formatEquationNumber(majorShearBaseCapacity)} kN`,
          `銲材 phi Vn,x = 0.80 × 0.6FEXX × Avx / 1000 = ${formatEquationNumber(majorShearWeldCapacity)} kN`,
          `CJP 可用強度 = min(母材, 銲材) = ${formatEquationNumber(majorShearCapacity)} kN`,
        ],
      }),
      createCheck({
        key: "spliceFullSectionMinorShear",
        label: "全斷面 CJP 弱軸剪力強度",
        demand: minorShearBaseCapacity,
        nominal: Math.min(minorShearBaseNominal, minorShearWeldNominal),
        available: minorShearCapacity,
        note: "弱軸剪力同樣以母材與銲材可用剪應力較小值控制。",
        codeRef: "規範判定｜表10.2-5、10.2.6、13.4.2",
        equationRef: "表10.2-5 全滲透開槽銲剪應力",
        unit: "kN",
        equationLines: [
          `母材 phi Vn,y = 0.90 × 0.6Fy × Avy / 1000 = ${formatEquationNumber(minorShearBaseCapacity)} kN`,
          `銲材 phi Vn,y = 0.80 × 0.6FEXX × Avy / 1000 = ${formatEquationNumber(minorShearWeldCapacity)} kN`,
          `CJP 可用強度 = min(母材, 銲材) = ${formatEquationNumber(minorShearCapacity)} kN`,
        ],
      }),
    ];

    const detailChecks = [
      makeDetailCheck("spliceLrfdMethod", "LRFD 設計法", state.designMethod === "LRFD" ? 1 : 0, true, "custom", "V1 僅接受 LRFD 耐震柱續接能力審查。", "規範判定｜第十三章"),
      makeDetailCheck("spliceSeismicColumn", "抗震受力柱適用範圍", seismicColumnComplete ? 1 : 0, true, "custom", "須為抵抗地震力之柱，並由設計者確認此構架角色。", "規範判定｜13.4"),
      makeDetailCheck("spliceCjpRoute", "全斷面 CJP 路線", cjpRouteComplete ? 1 : 0, true, "custom", "V1 只接受同斷面熱軋 H 形柱全斷面 CJP；PJP、栓接板與栓銲混合分擔均禁止核可。", "規範判定｜13.4.2；10.1.8"),
      makeDetailCheck("spliceTopologyScope", "同斷面與主軸對齊", topologyComplete ? 1 : 0, true, "custom", "上下柱須為相同熱軋 H 形斷面、相同材料，重心與主軸完全對齊。", "專案指定"),
      makeDetailCheck("spliceLocation1200", "續接位置距梁翼 1.2 m", locationComplete ? state.spliceDistanceToNearestBeamFlange : 0, 1200, "gte", `V1 只接受距最近梁翼 >= 1200 mm 路線；提供 ${formatEquationNumber(state.spliceDistanceToNearestBeamFlange)} mm。`, "規範判定｜13.4.2"),
      makeDetailCheck("spliceNonJumbo", "非巨型斷面適用範圍", state.spliceMaxThickness > 0 ? state.spliceMaxThickness : Infinity, 40, "lte", `最大板厚須 <= 40 mm；提供 ${formatEquationNumber(state.spliceMaxThickness)} mm。超出者須另依 10.7.2 完成 CVN、預熱、製作與檢驗規定。`, "規範判定｜10.7.2"),
      makeDetailCheck("spliceLoadInputs", "13.4.1 需求輸入完整性", loadInputsComplete ? 1 : 0, true, "custom", "PD、PL、PE 須採拉力正／壓力負之有限值；alphaL 限 0.5 或 1.0，0 < Fu <= 2.5。", "規範判定｜13.4.1"),
      makeDetailCheck("spliceTransferCap", "相接構材可傳軸力上限", transferCapComplete ? 1 : 0, true, "custom", qualifiedTransferCap ? `qualified 路線採 min(1.4Fu|PE|, 1.25Ptransfer)；Ptransfer = ${formatEquationNumber(state.spliceMaxTransferableAxial)} kN。` : "uncapped 路線完整採用 1.4Fu|PE|，不主張相接構材上限。", "規範判定｜13.4.1"),
      makeDetailCheck("spliceMatchingFiller", "相稱銲材與全斷面剪力", matchingFillerComplete ? 1 : 0, true, "custom", `須確認相稱銲材，且 0.80FEXX >= 0.90Fy；目前 ${formatEquationNumber(0.8 * state.spliceFexx)} / ${formatEquationNumber(0.9 * state.spliceFy)} MPa。`, "規範判定｜表10.2-5、10.2.6"),
      makeDetailCheck("spliceWps", "WPS/PQR 核定與追溯", wpsComplete ? 1 : 0, true, "custom", wpsComplete ? state.spliceWpsBasis : "須提供已核定 WPS/PQR 來源與 64 碼 SHA-256。", "專案指定｜鋼結構施工規範"),
      makeDetailCheck("spliceNdtPlan", "CJP 全覆蓋 NDT 計畫", ndtPlanComplete ? 1 : 0, true, "custom", ndtPlanComplete ? `${state.spliceFabricationLocation === "shop" ? "工廠" : "工地"} CJP 採 ${state.spliceNdtMethod} 全覆蓋檢驗計畫。` : "工廠／工地 CJP 均須指定 UT 或 RT 全覆蓋計畫、來源與 64 碼 SHA-256。", "規範判定｜13.10"),
      makeDetailCheck("spliceEvidence", "需求、圖說、材料、WPS 與 NDT 證據", evidenceComplete ? 1 : 0, true, "custom", evidenceComplete ? "五項依據與四項 SHA-256 已完整提供。" : `缺少或無效：${evidenceItems.filter(([, ok]) => !ok).map(([label]) => label).join("、")}。`, "專案指定"),
      makeDetailCheck("spliceAsBuiltBoundary", "設計附件／完工驗收邊界", state.spliceAsBuiltBoundaryConfirmed ? 1 : 0, true, "custom", "須確認本附件為設計階段能力審查；asBuiltAcceptance = false，完工 NDT 結果與施工驗收另案。", "專案指定"),
    ];

    return {
      ...CONNECTION_META.column_splice,
      checks,
      detailChecks,
      validations,
      assumptions: [
        "V1 正式附件固定為 LRFD、抵抗地震力之柱、上下同一熱軋 H 形斷面與材料、重心及主軸對齊、全斷面 CJP、距最近梁翼至少 1200 mm，且最大板厚不超過 40 mm。",
        "13.4.1 需求採拉力為正、壓力為負；V1 對所有案例均計入式(13.4-1)與式(13.4-2)，不使用條文所列柱強度比免檢例外。",
        "相接梁或斜撐極限狀態可傳軸力上限只有在 qualified 路線、正值容量與全構材來源確認齊備時才可降低 Eamp，否則完整採用 1.4Fu|PE|。",
        "本附件驗證接頭設計階段之規範算術、全斷面 CJP 強度等同性與 NDT 計畫；柱構材本體、整體構架分析、施工品質結果與完工驗收均屬各自受控文件。completeColumnMemberDesign = false；asBuiltAcceptance = false。",
      ],
      references: [
        "規範判定｜臺灣鋼結構極限設計法 13.4.1 柱強度之放大地震軸力需求",
        "規範判定｜臺灣鋼結構極限設計法 13.4.2 柱續接位置、CJP／高強度螺栓與全斷面強度",
        "規範判定｜臺灣鋼結構極限設計法 10.2.1、表10.2-5、10.2.6 全滲透開槽銲有效喉厚、設計強度與相稱銲材",
        "規範判定｜臺灣鋼結構極限設計法 13.10 工廠／工地 CJP 非破壞檢驗",
        "專案指定｜同斷面熱軋 H 形柱、1.2 m 位置路線、需求／圖說／材料／WPS／NDT 來源與 SHA-256",
      ],
      scopeLimited: false,
      completeJointDesign: false,
      completeColumnMemberDesign: false,
      asBuiltAcceptance: false,
      spliceReview: {
        frameRole: state.spliceFrameRole,
        designRoute: state.spliceDesignRoute,
        locationRoute: state.spliceLocationRoute,
        fabricationLocation: state.spliceFabricationLocation,
        ndtMethod: state.spliceNdtMethod,
        liveLoadFactor: state.spliceLiveLoadFactor,
        EampRaw,
        EampAdopted,
        transferCapApplied: qualifiedTransferCapValid && EampAdopted < EampRaw,
        compressionCombinations,
        tensionCombinations,
        PuCompression,
        TuTension,
        normalCapacity,
        majorFlexuralCapacity,
        minorFlexuralCapacity,
        majorShearCapacity,
        minorShearCapacity,
        normalNominal,
        majorFlexuralNominal,
        minorFlexuralNominal,
        majorShearBaseCapacity,
        majorShearWeldCapacity,
        minorShearBaseCapacity,
        minorShearWeldCapacity,
      },
    };
  }

  function calculateBraceGusset(state) {
    const axialDemand = Math.max(state.requiredAxial, 0);
    const gussetGrossArea = state.gussetConnectionWidth * state.gussetThickness;
    const gussetNetArea = state.gussetNetWidth * state.gussetThickness;
    const gussetEffectiveNetArea = Math.min(gussetNetArea, 0.85 * gussetGrossArea);
    const braceGrossArea = state.braceGrossWidth * state.braceThickness;
    const braceNetArea = state.braceNetWidth * state.braceThickness;
    const expectedWhitmoreConnectionLength = (state.gussetBoltCount - 1) * state.gussetPitch;
    const whitmoreConnectionLengthMatches = state.gussetWhitmoreConnectionLength > 0
      && Math.abs(state.gussetWhitmoreConnectionLength - expectedWhitmoreConnectionLength) <= 1e-9;
    const gussetWhitmoreTheoreticalWidth = 2 * state.gussetWhitmoreConnectionLength * Math.tan(Math.PI / 6);
    const gussetWhitmoreEffectiveWidth = Math.min(gussetWhitmoreTheoreticalWidth, state.gussetAvailableWidth);
    const gussetWhitmoreArea = gussetWhitmoreEffectiveWidth * state.gussetThickness;
    const maximumStandardHoleDiameter = getMaximumStandardHoleDiameter(state.boltDiameter);
    const minimumWeldSize = getMinimumFilletSize(Math.max(state.gussetThickness, state.supportThickness));
    const maximumWeldSize = getMaximumEdgeFilletSize(Math.min(state.gussetThickness, state.supportThickness));
    const maximumGussetNetWidth = Math.min(
      state.gussetConnectionWidth - netHoleWidth(state.holeDiameter),
      gussetWhitmoreEffectiveWidth
    );
    const maximumBraceNetWidth = state.braceGrossWidth - netHoleWidth(state.holeDiameter);
    const gussetBlockAreas = getLinearBlockShearAreas({
      boltCount: state.gussetBoltCount,
      endDistance: state.gussetEndDistance,
      pitch: state.gussetPitch,
      holeDiameter: state.holeDiameter,
      edgeDistance: state.gussetEdgeDistance,
      thickness: state.gussetThickness,
      shearPlaneCount: 1,
    });
    const braceBlockAreas = getLinearBlockShearAreas({
      boltCount: state.gussetBoltCount,
      endDistance: state.braceEndDistance,
      pitch: state.gussetPitch,
      holeDiameter: state.holeDiameter,
      edgeDistance: state.braceEdgeDistance,
      thickness: state.braceThickness,
      shearPlaneCount: 1,
    });
    const hasBasis = (value) => Boolean(String(value || "").trim()) && !/示例|請依專案覆寫|請填|待補|未填|placeholder/i.test(String(value));
    const validations = [];

    if (state.designMethod !== "LRFD") validations.push("Gusset V1 正式範圍僅支援 LRFD。");
    if (!(state.requiredAxial > 0)) validations.push("Gusset V1 僅接受大於 0 kN 的設計拉力 Pu；壓力、零需求與正負包絡不得套用。");
    if (Math.abs(state.requiredShear) > 0) validations.push("Gusset V1 限純軸向拉力，requiredShear 必須為 0。");
    if (Math.abs(state.requiredMoment) > 0) validations.push("Gusset V1 限純軸向拉力，requiredMoment 必須為 0。");
    if (state.eccentricity !== 0) validations.push("Gusset V1 限同心軸向拉力，eccentricity 必須精確為 0。");
    if (state.boltGrade !== "F10T" || Math.abs(state.boltUltimateStrength - 1000) > 1) validations.push("Gusset V1 鎖定 CNS F10T、Fub = 1000 MPa。");
    if (state.holeType !== "standard" || maximumStandardHoleDiameter === null || state.holeDiameter > (maximumStandardHoleDiameter ?? 0)) validations.push("Gusset V1 僅接受表列標準孔及其最大孔徑。");
    if (state.gussetShearPlanes !== 1) validations.push("Gusset V1 限單剪螺栓。");
    if (!Number.isInteger(state.gussetBoltCount) || state.gussetBoltCount < 2 || state.gussetBoltCount > 12) validations.push("Gusset V1 限單一直線 2 至 12 支整數螺栓。");
    if (!whitmoreConnectionLengthMatches) validations.push("Whitmore 連接長度 Lconn 必須大於 0，且精確等於 (gussetBoltCount − 1) × gussetPitch。");
    if (state.gussetWhitmoreConnectionLength > 1250) validations.push("表 10.3-2 註 [e] 針對承壓式接合之續接拉力構材，規定平行拉力方向接合長度大於 125 cm 時表列螺栓強度須降 20%；本 Gusset 為端部接合，V1 在尚未實作長接合路線前保守援用 Lconn ≤ 1250 mm 的適用範圍，並非將該註解泛化為所有接合的條文上限。");
    if (state.braceSectionType !== "flat_plate") validations.push("Gusset V1 僅適用扁鋼 / 平板支撐之矩形截面；angle、WT、HSS 與需考慮剪力遲滯之斷面禁止核可。");
    if (state.gussetPitch <= state.holeDiameter) validations.push("Gusset 孔距 sg 應大於孔徑 dh。");
    if (state.gussetEndDistance <= state.holeDiameter / 2 || state.braceEndDistance <= state.holeDiameter / 2) validations.push("Gusset 與支撐材端距均須大於 dh / 2。");
    if (state.gussetUltimateStrength < state.gussetYieldStrength) validations.push("Gusset 材料須滿足 Fu ≥ Fy。");
    if (state.braceFu < state.braceFy) validations.push("支撐材須滿足 Fu ≥ Fy。");
    if (state.supportFu < state.supportFy) validations.push("支承材須滿足 Fu ≥ Fy。");
    if (!(state.gussetNetWidth > 0 && state.gussetNetWidth <= maximumGussetNetWidth)) validations.push("Gusset 淨寬須為正值，且同時不得大於栓孔斷面總寬扣孔後之寬度與實際可用 Whitmore 寬度。");
    if (!(state.braceNetWidth > 0 && state.braceNetWidth <= maximumBraceNetWidth)) validations.push("支撐材淨寬須為正值，且不得大於扣除單列孔後之總寬。");
    if (!(state.gussetAvailableWidth > 0)) validations.push("Whitmore 可用板寬必須大於 0，並作為理論展開寬度之上限。");
    if (state.weldLineCount !== 2) validations.push("Gusset V1 限兩側對稱縱向填角銲。");
    if (state.weldSize < minimumWeldSize || state.weldSize > maximumWeldSize) validations.push("Gusset 銲腳不符合較厚材最小值或較薄材最大值。");
    if (state.weldLength < 4 * state.weldSize || state.weldLength > 70 * state.weldSize) validations.push("Gusset V1 有效銲長須介於 4a 與 70a 之間。");
    if (!hasBasis(state.gussetDemandBasis) || !hasBasis(state.gussetGeometryBasis) || !hasBasis(state.gussetMaterialBasis) || !hasBasis(state.gussetModelBasis)) validations.push("Gusset 正式附件須提供非占位之需求、幾何、材料與模型依據。");
    if (!state.gussetStaticNonseismicConfirmed) validations.push("須確認本案為靜力、非耐震、非 BRB 接頭。");
    if (!state.gussetLoadPathConfirmed) validations.push("須確認單列螺栓及雙側縱向填角銲之串聯力流與實際構造一致。");

    const gussetNetRuptureCheck = buildEffectiveNetRuptureCheck({
      key: "gussetNetRupture",
      label: "Gusset 有效淨斷面斷裂",
      demand: axialDemand,
      fu: state.gussetUltimateStrength,
      effectiveNetArea: gussetEffectiveNetArea,
      designMethod: state.designMethod,
      note: "Gusset 屬栓接接續／連接板，依 4.3 採 Ae = min(An, 0.85Ag)；gussetConnectionWidth 僅為栓孔斷面 gross plate width。",
      codeRef: "4.3、5.2",
      equationRef: "式(5.2-2)",
    });
    gussetNetRuptureCheck.equationLines = [
      `Ag = ${formatEquationNumber(gussetGrossArea)} mm²`,
      `An = ${formatEquationNumber(gussetNetArea)} mm²`,
      `Ae = min(An, 0.85Ag) = min(${formatEquationNumber(gussetNetArea)}, ${formatEquationNumber(0.85 * gussetGrossArea)}) = ${formatEquationNumber(gussetEffectiveNetArea)} mm²`,
      `Rn = Fu × Ae = ${formatEquationNumber(gussetNetRuptureCheck.nominal)} kN`,
    ];
    gussetNetRuptureCheck.latexLines = [
      String.raw`\begin{aligned}
A_g &= ${formatEquationNumber(gussetGrossArea)}\ \text{mm}^2\\
A_n &= ${formatEquationNumber(gussetNetArea)}\ \text{mm}^2\\
A_e &= \min(A_n,\ 0.85A_g) = \min(${formatEquationNumber(gussetNetArea)},\ ${formatEquationNumber(0.85 * gussetGrossArea)}) = ${formatEquationNumber(gussetEffectiveNetArea)}\ \text{mm}^2\\
R_n &= F_u A_e = ${formatEquationNumber(gussetNetRuptureCheck.nominal)}\ \text{kN}\\
${buildAvailableStrengthLatex(state.designMethod, "netRupture", gussetNetRuptureCheck.nominal)}
\end{aligned}`,
    ];

    const checks = [
      buildF10TBearingBoltShearCheck({
        key: "gussetBoltShear",
        label: "Gusset 螺栓剪力",
        demand: axialDemand,
        boltDiameter: state.boltDiameter,
        boltCount: state.gussetBoltCount,
        shearPlanes: state.gussetShearPlanes,
        threadsCondition: state.threadsCondition,
        designMethod: state.designMethod,
        note: "支撐軸力由單列螺栓群以剪力方式傳遞。",
      }),
      buildBoltLineBearingCheck({
        key: "gussetBoltBearing",
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
      buildBoltLineBearingCheck({
        key: "braceBoltBearing",
        label: "支撐材孔承壓",
        demand: axialDemand,
        count: state.gussetBoltCount,
        endDistance: state.braceEndDistance,
        pitch: state.gussetPitch,
        holeDiameter: state.holeDiameter,
        thickness: state.braceThickness,
        fu: state.braceFu,
        boltDiameter: state.boltDiameter,
        deformationConsidered: state.deformationConsidered,
        designMethod: state.designMethod,
        note: "支撐材與 Gusset 分別依其端距、厚度與 Fu 檢核孔承壓。",
      }),
      buildGrossYieldCheck({
        key: "gussetGrossYield",
        label: "Gusset 總斷面降伏",
        demand: axialDemand,
        fy: state.gussetYieldStrength,
        grossArea: gussetGrossArea,
        designMethod: state.designMethod,
        note: "以 Gusset 在栓孔斷面之 gross plate width 乘厚度估算總斷面降伏；此寬度不是 Whitmore 初始寬度。",
      }),
      gussetNetRuptureCheck,
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
        note: "單一直線栓列採一個縱向剪力面與一個橫向拉力面之 L 形塊狀撕裂候選路徑。",
        shearPlaneCount: 1,
      }),
      buildGrossYieldCheck({
        key: "braceGrossYield",
        label: "支撐材總斷面降伏",
        demand: axialDemand,
        fy: state.braceFy,
        grossArea: braceGrossArea,
        designMethod: state.designMethod,
        note: "以支撐材總寬 bg 乘厚度檢核總斷面降伏。",
      }),
      buildNetRuptureCheck({
        key: "braceNetRupture",
        label: "支撐材淨斷面斷裂",
        demand: axialDemand,
        fu: state.braceFu,
        netArea: braceNetArea,
        designMethod: state.designMethod,
        note: "扁鋼 / 平板支撐為矩形截面且全截面元素由單列栓直接連接，U = 1.0、Ae = An；以 bn × tb 檢核淨斷面斷裂。",
      }),
      buildBlockShearCheck({
        key: "braceBlockShear",
        label: "支撐材塊狀撕裂",
        demand: axialDemand,
        boltCount: state.gussetBoltCount,
        endDistance: state.braceEndDistance,
        pitch: state.gussetPitch,
        holeDiameter: state.holeDiameter,
        edgeDistance: state.braceEdgeDistance,
        thickness: state.braceThickness,
        fy: state.braceFy,
        fu: state.braceFu,
        designMethod: state.designMethod,
        note: "支撐材採與 Gusset 對應之一個縱向剪力面與一個橫向拉力面 L 形路徑。",
        shearPlaneCount: 1,
      }),
      buildGrossYieldCheck({
        key: "gussetWhitmoreYield",
        label: "Whitmore 有效寬度降伏",
        demand: axialDemand,
        fy: state.gussetYieldStrength,
        grossArea: gussetWhitmoreArea,
        designMethod: state.designMethod,
        note: "單一直線栓列之 fastener-group 起始寬度為 0；bW = 2Lconn tan30°，有效寬度再取理論值與實際可用板寬之較小值。",
      }),
      buildWeldCheck({
        key: "gussetWeldMetal",
        label: "Gusset 縱向填角銲銲材",
        demand: axialDemand,
        weldSize: state.weldSize,
        weldLength: state.weldLength,
        weldLineCount: state.weldLineCount,
        electrodeStrength: state.weldFexx,
        designMethod: state.designMethod,
        note: "Gusset 至支承材採兩側對稱縱向填角銲；銲材有效喉厚取 0.707a。",
      }),
      buildLongitudinalBaseMetalWeldCheck({
        key: "gussetWeldBaseGusset",
        label: "Gusset 銲線母材",
        demand: axialDemand,
        thickness: state.gussetThickness,
        fy: state.gussetYieldStrength,
        fu: state.gussetUltimateStrength,
        weldLength: state.weldLength,
        weldLineCount: state.weldLineCount,
        designMethod: state.designMethod,
        note: "Gusset 板沿兩條縱向銲線之母材傳力面。",
      }),
      buildLongitudinalBaseMetalWeldCheck({
        key: "gussetWeldBaseSupport",
        label: "支承材銲線母材",
        demand: axialDemand,
        thickness: state.supportThickness,
        fy: state.supportFy,
        fu: state.supportFu,
        weldLength: state.weldLength,
        weldLineCount: state.weldLineCount,
        designMethod: state.designMethod,
        note: "支承材沿兩條縱向銲線之母材傳力面。",
      }),
    ];

    const requiredDerivedResults = {
      gussetGrossArea,
      gussetNetArea,
      gussetEffectiveNetArea,
      braceGrossArea,
      braceNetArea,
      gussetBlockAgv: gussetBlockAreas.Agv,
      gussetBlockAnv: gussetBlockAreas.Anv,
      gussetBlockAgt: gussetBlockAreas.Agt,
      gussetBlockAnt: gussetBlockAreas.Ant,
      braceBlockAgv: braceBlockAreas.Agv,
      braceBlockAnv: braceBlockAreas.Anv,
      braceBlockAgt: braceBlockAreas.Agt,
      braceBlockAnt: braceBlockAreas.Ant,
      gussetWhitmoreTheoreticalWidth,
      gussetWhitmoreEffectiveWidth,
      gussetWhitmoreArea,
    };
    const finiteDerivedResults = Object.values(requiredDerivedResults).every(Number.isFinite);
    const finiteStrengthResults = checks.every((check) => Number.isFinite(check.demand)
      && check.demand > 0
      && Number.isFinite(check.nominal)
      && check.nominal > 0
      && Number.isFinite(check.available)
      && check.available > 0
      && Number.isFinite(check.ratio)
      && check.ratio >= 0);
    if (!finiteDerivedResults) validations.push("Gusset 派生寬度或面積出現非有限值；輸入雖可解析為有限數，組合運算已發生數值溢位，禁止核可與正式輸出。");
    if (!finiteStrengthResults) validations.push("Gusset 強度結果之需求、標稱強度、可用強度或 DCR 出現非有限／非正值；禁止核可與正式輸出。");

    const detailChecks = [
      makeDetailCheck("gussetMethod", "設計法適用範圍", state.designMethod === "LRFD" ? 1 : 0, true, "custom", "Gusset V1 僅採 LRFD。", "V1 適用範圍"),
      makeDetailCheck("gussetPositiveTension", "正軸向拉力", state.requiredAxial > 0 ? 1 : 0, true, "custom", "Pu 必須大於 0；壓力與零需求不在本版範圍。", "V1 適用範圍"),
      makeDetailCheck("gussetZeroShear", "零剪力需求", Math.abs(state.requiredShear), 0, "lte", "requiredShear 必須為 0 kN。", "V1 適用範圍"),
      makeDetailCheck("gussetZeroMoment", "零彎矩需求", Math.abs(state.requiredMoment), 0, "lte", "requiredMoment 必須為 0 kN-m。", "V1 適用範圍"),
      makeDetailCheck("gussetConcentric", "同心軸力", state.eccentricity === 0 ? 1 : 0, true, "custom", "eccentricity 必須精確為 0 mm，正負偏心均禁止核可。", "V1 適用範圍"),
      makeDetailCheck("gussetStaticNonseismicConfirmed", "靜力非耐震確認", state.gussetStaticNonseismicConfirmed ? 1 : 0, true, "custom", state.gussetStaticNonseismicConfirmed ? "已確認為靜力、非耐震、非 BRB 接頭。" : "須由設計者確認靜力、非耐震且非 BRB。", "設計者判斷"),
      makeDetailCheck("gussetLoadPathConfirmed", "串聯力流確認", state.gussetLoadPathConfirmed ? 1 : 0, true, "custom", state.gussetLoadPathConfirmed ? "已確認支撐—Gusset 螺栓與 Gusset—支承材銲道串聯傳力。" : "須確認本模型之串聯力流與實際構造一致。", "設計者判斷"),
      makeDetailCheck("gussetBoltGrade", "螺栓等級", state.boltGrade === "F10T" && Math.abs(state.boltUltimateStrength - 1000) <= 1 ? 1 : 0, true, "custom", "本版鎖定 CNS F10T、Fub = 1000 MPa。", "10.3.3、表10.3-2"),
      makeDetailCheck("gussetStandardHole", "標準孔", state.holeType === "standard" ? 1 : 0, true, "custom", "本版限標準孔承壓型接頭。", "10.3.8"),
      makeDetailCheck("gussetBoltDiameterTable", "螺栓直徑表列範圍", maximumStandardHoleDiameter !== null ? 1 : 0, true, "custom", maximumStandardHoleDiameter !== null ? "螺栓直徑可依表 10.3-5 判定標準孔上限。" : "螺栓直徑不在本版表列路線。", "10.3.8、表10.3-5"),
      makeDetailCheck("gussetHoleDiameter", "孔徑大於螺栓直徑", state.holeDiameter > state.boltDiameter ? 1 : 0, true, "custom", "標準孔徑須大於螺栓直徑。", "10.3.8"),
      makeDetailCheck("gussetStandardHoleMaximum", "標準孔最大孔徑", state.holeDiameter, maximumStandardHoleDiameter ?? 0, "lte", maximumStandardHoleDiameter === null ? "無可採之表列孔徑上限。" : `標準孔最大直徑 = ${formatEquationNumber(maximumStandardHoleDiameter)} mm。`, "10.3.8、表10.3-5"),
      makeDetailCheck("gussetSingleShear", "單剪適用範圍", state.gussetShearPlanes === 1 ? 1 : 0, true, "custom", "本版限單剪面。", "V1 適用範圍"),
      makeDetailCheck("gussetBoltCount", "單列栓數適用範圍", Number.isInteger(state.gussetBoltCount) && state.gussetBoltCount >= 2 && state.gussetBoltCount <= 12 ? 1 : 0, true, "custom", "本版限 2 至 12 支整數螺栓。", "V1 適用範圍"),
      makeDetailCheck("gussetSingleStraightBoltLine", "單一直線栓列", state.gussetLoadPathConfirmed && state.gussetShearPlanes === 1 ? 1 : 0, true, "custom", "V1 模型僅有一條直線栓列，不含多排、錯列或偏心栓群。", "專案指定"),
      makeDetailCheck("gussetWhitmoreConnectionLength", "Whitmore 栓群連接長度", whitmoreConnectionLengthMatches ? 1 : 0, true, "custom", `Lconn 必須大於 0，且等於 (n − 1)s = (${formatEquationNumber(state.gussetBoltCount)} − 1) × ${formatEquationNumber(state.gussetPitch)} = ${formatEquationNumber(expectedWhitmoreConnectionLength)} mm；單列栓起始寬度取 0。`, "專案指定｜Whitmore 30° 模型"),
      makeDetailCheck("gussetBearingConnectionLength", "承壓式螺栓接合長度", state.gussetWhitmoreConnectionLength, 1250, "lte", "表 10.3-2 註 [e] 對象為承壓式接合之續接拉力構材；本 Gusset 為端部接合，V1 在尚未實作長接合路線前保守援用 Lconn ≤ 1250 mm，並非一般接合的條文上限。", "表10.3-2 註[e]｜V1 保守適用範圍"),
      makeDetailCheck("gussetFiniteDerivedResults", "派生幾何有限值", finiteDerivedResults ? 1 : 0, true, "custom", finiteDerivedResults ? "所有正式報告所需之派生寬度與面積均為有限值。" : "至少一個派生寬度或面積為 NaN／Infinity；禁止核可與正式輸出。", "V1 數值安全閘門"),
      makeDetailCheck("gussetFiniteStrengthResults", "強度結果有限值與正容量", finiteStrengthResults ? 1 : 0, true, "custom", finiteStrengthResults ? "13 條強度路線之需求、標稱強度、可用強度與 DCR 均為有限值，且 Pu > 0 時容量為正。" : "至少一條強度路線含 NaN／Infinity、非正容量或非有限 DCR；禁止核可與正式輸出。", "V1 數值安全閘門"),
      makeDetailCheck("gussetFlatPlateBrace", "平板支撐截面與 Ae = An", state.braceSectionType === "flat_plate" ? 1 : 0, true, "custom", "V1 限扁鋼 / 平板支撐矩形截面，所有截面元素由單列栓直接連接，U = 1.0、Ae = An；angle、WT、HSS 與剪力遲滯不適用。", "V1 適用範圍｜5.2"),
      makeDetailCheck("gussetMaterialOrder", "Gusset 材料強度順序", state.gussetUltimateStrength >= state.gussetYieldStrength ? 1 : 0, true, "custom", "Gusset 須滿足 Fu ≥ Fy。", "規範判定｜材料物理一致性"),
      makeDetailCheck("braceMaterialOrder", "支撐材材料強度順序", state.braceFu >= state.braceFy ? 1 : 0, true, "custom", "支撐材須滿足 Fu ≥ Fy。", "規範判定｜材料物理一致性"),
      makeDetailCheck("gussetSupportMaterialOrder", "支承材材料強度順序", state.supportFu >= state.supportFy ? 1 : 0, true, "custom", "支承材須滿足 Fu ≥ Fy。", "規範判定｜材料物理一致性"),
      makeDetailCheck("gussetNetGeometry", "Gusset 淨斷面幾何", state.gussetNetWidth > 0 && state.gussetNetWidth <= maximumGussetNetWidth ? 1 : 0, true, "custom", `bnet 同時受栓孔斷面 gross plate width 扣孔後之寬度與實際可用 Whitmore 寬限制；min(${formatEquationNumber(state.gussetConnectionWidth - netHoleWidth(state.holeDiameter))}, ${formatEquationNumber(gussetWhitmoreEffectiveWidth)}) = ${formatEquationNumber(maximumGussetNetWidth)} mm。`, "規範判定｜專案指定幾何"),
      makeDetailCheck("braceNetGeometry", "支撐材淨斷面幾何", state.braceNetWidth > 0 && state.braceNetWidth <= maximumBraceNetWidth ? 1 : 0, true, "custom", `bn 應不大於 bg − 孔扣除 = ${formatEquationNumber(maximumBraceNetWidth)} mm。`, "規範判定｜專案指定幾何"),
      makeDetailCheck("gussetAvailableWidth", "Whitmore 可用板寬", state.gussetAvailableWidth > 0 ? 1 : 0, true, "custom", `單列栓起始寬度為 0；bW = 2Lconn tan30° = ${formatEquationNumber(gussetWhitmoreTheoreticalWidth)} mm，有效寬度取 min(${formatEquationNumber(gussetWhitmoreTheoreticalWidth)}, ${formatEquationNumber(state.gussetAvailableWidth)}) = ${formatEquationNumber(gussetWhitmoreEffectiveWidth)} mm。`, "專案指定幾何"),
      ...buildLinearBoltDetailChecks({ prefix: "gussetBoltLine", state, pitch: state.gussetPitch, endDistance: state.gussetEndDistance, edgeDistance: state.gussetEdgeDistance, boltDiameter: state.boltDiameter, thickness: state.gussetThickness }),
      ...buildLinearBoltDetailChecks({ prefix: "braceBoltLine", state, pitch: state.gussetPitch, endDistance: state.braceEndDistance, edgeDistance: state.braceEdgeDistance, boltDiameter: state.boltDiameter, thickness: state.braceThickness }),
      makeDetailCheck("gussetDoubleFilletWeld", "雙側縱向填角銲", state.weldLineCount === 2 ? 1 : 0, true, "custom", "本版限兩側對稱、等長縱向填角銲。", "V1 適用範圍"),
      makeDetailCheck("gussetMinWeldSize", "最小填角銲尺寸", state.weldSize, minimumWeldSize, "gte", "依較厚連接材厚度判定最小填角銲尺寸。", "10.2.2"),
      makeDetailCheck("gussetMaxWeldSize", "最大填角銲尺寸", state.weldSize, maximumWeldSize, "lte", "依較薄連接材邊緣厚度限制最大填角銲尺寸。", "10.2.2"),
      makeDetailCheck("gussetShortWeld", "最短有效銲長", state.weldLength, 4 * state.weldSize, "gte", "有效銲長至少為 4a。", "10.2.2"),
      makeDetailCheck("gussetLongWeld", "長銲道適用範圍", state.weldLength, 70 * state.weldSize, "lte", "Gusset V1 限 Le ≤ 70a；超出須另計長銲道折減。", "10.2.2、V1 適用範圍"),
      makeDetailCheck("gussetDemandBasis", "設計拉力來源", hasBasis(state.gussetDemandBasis) ? 1 : 0, true, "custom", hasBasis(state.gussetDemandBasis) ? state.gussetDemandBasis : "請填入核定分析模型與載重組合來源。", "專案指定"),
      makeDetailCheck("gussetGeometryBasis", "幾何資料來源", hasBasis(state.gussetGeometryBasis) ? 1 : 0, true, "custom", hasBasis(state.gussetGeometryBasis) ? state.gussetGeometryBasis : "請填入核定圖說或量測來源。", "專案指定"),
      makeDetailCheck("gussetMaterialBasis", "材料資料來源", hasBasis(state.gussetMaterialBasis) ? 1 : 0, true, "custom", hasBasis(state.gussetMaterialBasis) ? state.gussetMaterialBasis : "請填入鋼材、螺栓與銲材規格來源。", "專案指定"),
      makeDetailCheck("gussetModelBasis", "接頭模型來源", hasBasis(state.gussetModelBasis) ? 1 : 0, true, "custom", hasBasis(state.gussetModelBasis) ? state.gussetModelBasis : "請說明同心單列栓與雙側縱向銲之力流模型。", "專案指定"),
    ];

    return {
      ...CONNECTION_META.brace_gusset,
      checks,
      detailChecks,
      validations,
      assumptions: [
        "正式適用範圍為 LRFD、扁鋼 / 平板支撐矩形截面、正軸向同心拉力、靜力非耐震且非 BRB、F10T 標準孔單剪、單一直線 2 至 12 栓與兩側對稱縱向填角銲。",
        "平板支撐之所有截面元素由單列栓直接連接，U = 1.0、Ae = An；angle、WT、HSS 與任何需剪力遲滯折減之支撐截面均排除。",
        "力流依序由支撐材經承壓螺栓傳至 Gusset，再由 Gusset 兩側縱向填角銲傳至支承材；三段不得視為並聯容量。",
        "單一直線栓列之 Whitmore fastener-group 起始寬度取 0，Lconn = (n − 1)s，bW = 2Lconn tan30°；有效寬度再取理論值與專案實際可用板寬之較小值。",
        "F10T 承壓式螺栓標稱剪應力依表 10.3-2 採含牙 4.00 tf/cm²、不含牙 5.00 tf/cm²。註 [e] 的 20% 長接合折減原針對承壓式接合之續接拉力構材；本 Gusset 為端部接合，V1 在尚未實作長接合路線前保守援用 Lconn ≤ 1250 mm，並非一般接合的條文上限。",
        "本附件不含壓桿挫屈、Gusset 壓力屈曲、折角外移、偏心、疲勞、反覆載重、耐震特別規定、BRB、支承構件整體或局部極限狀態。",
      ],
      references: [
        "5.2 拉力構件之降伏與斷裂",
        "10.2.2 填角銲細部",
        "10.2.4 銲接接合強度",
        "10.3.3 螺栓剪力強度",
        "表10.3-2 F10T 承壓式螺栓標稱剪應力與註[e]長接合折減",
        "10.3.8 標準孔",
        "10.3.9 螺栓孔承壓",
        "10.3.11~10.3.13 孔距與邊距",
        "10.4 塊狀撕裂",
        "專案指定｜單列栓起始寬度 0、Lconn = (n − 1)s 之 Whitmore 30° 有效寬度模型與可用板寬上限",
      ],
      derivedAreas: {
        gussetGrossArea,
        gussetNetArea,
        gussetEffectiveNetArea,
        braceGrossArea,
        braceNetArea,
        gussetBlockAgv: gussetBlockAreas.Agv,
        gussetBlockAnv: gussetBlockAreas.Anv,
        gussetBlockAgt: gussetBlockAreas.Agt,
        gussetBlockAnt: gussetBlockAreas.Ant,
        braceBlockAgv: braceBlockAreas.Agv,
        braceBlockAnv: braceBlockAreas.Anv,
        braceBlockAgt: braceBlockAreas.Agt,
        braceBlockAnt: braceBlockAreas.Ant,
        gussetWhitmoreTheoreticalWidth,
        gussetWhitmoreEffectiveWidth,
        gussetWhitmoreArea,
      },
    };
  }

  function calculateMomentConnection(state) {
    const hasBasis = (value) => Boolean(String(value || "").trim()) && !/示例|請依專案覆寫|請填|待補|未填|placeholder/i.test(String(value));
    const isSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value || ""));
    const rotationDemand = state.momentRotationDemandMethod === "nonlinear"
      ? state.momentNonlinearPlasticRotation + 0.005
      : state.momentRotationDemandMethod === "formula"
        ? 1.1 * (state.momentSystemDuctilityR - 1) * state.momentElasticStoryDrift
        : state.momentFrameSystem === "smrf"
          ? 0.03
          : state.momentFrameSystem === "imrf"
            ? 0.01
            : 0;
    const Mp = state.momentBeamPlasticModulus * state.momentBeamYieldStrength / 1e6;
    const Mpr = state.momentExpectedStrengthFactor * Mp;
    const farMomentRaw = Number(state.momentFarCriticalSectionExpectedMomentRaw);
    const farMomentInputValid = Number.isFinite(farMomentRaw) && farMomentRaw >= 0;
    const MprFar = state.momentFarCriticalSectionExpectedMoment;
    const Vp = state.momentPlasticHingeSpan > 0 ? (Mpr + MprFar) * 1000 / state.momentPlasticHingeSpan : 0;
    const MuFace = Mpr + Vp * state.momentCriticalSectionDistance / 1000;
    const VuRequired = Math.min(Math.abs(state.momentGravityShear) + Vp, Math.abs(state.momentAmplifiedShear));
    const VpzMin = state.momentPanelZoneLeverArm > 0 ? state.momentPanelZoneBeamMomentSum * 1000 / state.momentPanelZoneLeverArm : 0;
    const VpzRequired = Math.max(state.momentPanelZoneAnalysisDemand, VpzMin);
    const VpzNominal = 0.6 * state.momentColumnWebYieldStrength * state.momentColumnDepth * state.momentPanelZoneThickness / 1000;
    const panelThicknessRequired = (state.momentPanelZoneClearDepth + state.momentPanelZoneClearWidth) / 90;
    const continuityThreshold = 1.8 * state.momentBeamYieldStrength * state.momentBeamFlangeWidth * state.momentBeamFlangeThickness / 1000;
    const continuityRequired = state.momentColumnFlangeLocalNominalStrength < continuityThreshold;
    const scwbCwColumn = state.momentCwUpperColumnMoment + state.momentCwLowerColumnMoment;
    const scwbCwBeam = state.momentCwLeftBeamMoment + state.momentCwRightBeamMoment;
    const scwbCcwColumn = state.momentCcwUpperColumnMoment + state.momentCcwLowerColumnMoment;
    const scwbCcwBeam = state.momentCcwLeftBeamMoment + state.momentCcwRightBeamMoment;
    const scwbCw = scwbCwBeam > 0 ? scwbCwColumn / scwbCwBeam : 0;
    const scwbCcw = scwbCcwBeam > 0 ? scwbCcwColumn / scwbCcwBeam : 0;
    const panelZoneAvailable = applyDesignStrength(VpzNominal, state.designMethod, "panelZone");
    const validations = [];

    const positiveInputChecks = [
      ["梁塑性斷面模數 Zb", state.momentBeamPlasticModulus],
      ["梁降伏強度 Fyb", state.momentBeamYieldStrength],
      ["預期強度係數 beta", state.momentExpectedStrengthFactor],
      ["臨界截面距離 x", state.momentCriticalSectionDistance],
      ["塑鉸跨距 Lh", state.momentPlasticHingeSpan],
      ["接頭可用抗彎強度", state.momentAvailableFlexuralStrength],
      ["接頭可用抗剪強度", state.momentAvailableShearStrength],
      ["接頭合格塑性轉角", state.momentQualifiedPlasticRotation],
      ["柱腹板降伏強度 Fyc", state.momentColumnWebYieldStrength],
      ["柱深 dc", state.momentColumnDepth],
      ["Panel Zone 厚度 tp", state.momentPanelZoneThickness],
      ["Panel Zone 淨高 dz", state.momentPanelZoneClearDepth],
      ["Panel Zone 淨寬 wz", state.momentPanelZoneClearWidth],
      ["Panel Zone 分析需求", state.momentPanelZoneAnalysisDemand],
      ["梁端彎矩合計", state.momentPanelZoneBeamMomentSum],
      ["Panel Zone 槓桿臂 hpz", state.momentPanelZoneLeverArm],
      ["梁翼板寬 bfb", state.momentBeamFlangeWidth],
      ["梁翼板厚 tfb", state.momentBeamFlangeThickness],
      ["柱翼局部標稱拉力強度", state.momentColumnFlangeLocalNominalStrength],
      ["梁翼緣塑性厚度", state.momentDesignBeamFlangeThickness],
      ["試體翼緣塑性厚度", state.momentTestBeamFlangeThickness],
      ["設計翼緣塑性比例", state.momentDesignFlangePlasticRatio],
      ["試體翼緣塑性比例", state.momentTestFlangePlasticRatio],
    ];
    const invalidPositiveInputs = positiveInputChecks.filter(([, value]) => !(Number.isFinite(value) && value > 0));
    if (invalidPositiveInputs.length > 0) {
      validations.push(`梁柱彎矩接頭輸入值需為有限正值：${invalidPositiveInputs.map(([label]) => label).join("、")}。`);
    }
    if (!farMomentInputValid) {
      validations.push("對端臨界截面預期塑性彎矩 Mpr,far 需為有限非負值；負值或非數值輸入即使正規化後為 0，仍不得視為有效需求來源。");
    }

    const invalidDerived = [
      ["Mp", Mp],
      ["Mpr", Mpr],
      ["Vp", Vp],
      ["Mu_face", MuFace],
      ["Vu_req", VuRequired],
      ["theta_req", rotationDemand],
      ["Vpz_min", VpzMin],
      ["Vpz_req", VpzRequired],
      ["Vpz_n", VpzNominal],
      ["tz_req", panelThicknessRequired],
      ["continuity threshold", continuityThreshold],
      ["SCWB cw", scwbCw],
      ["SCWB ccw", scwbCcw],
    ].filter(([, value]) => !(Number.isFinite(value) && value > 0));
    if (invalidDerived.length > 0) {
      validations.push(`梁柱彎矩接頭派生量需為有限正值：${invalidDerived.map(([label]) => label).join("、")}。`);
    }
    if (!(Number.isFinite(MprFar) && MprFar >= 0)) {
      validations.push("對端臨界截面預期塑性彎矩 Mpr,far 之正規化結果需為有限非負值。");
    }

    const qualificationSimilarityChecks = [
      ["momentQualificationConfigurationConfirmed", "資格試驗構造配置一致", state.momentQualificationConfigurationConfirmed],
      ["momentQualificationMaterialConfirmed", "資格試驗材料一致", state.momentQualificationMaterialConfirmed],
      ["momentQualificationWeldingConfirmed", "資格試驗銲接一致", state.momentQualificationWeldingConfirmed],
      ["momentQualificationGeometryConfirmed", "資格試驗幾何一致", state.momentQualificationGeometryConfirmed],
      ["momentQualificationFabricationConfirmed", "資格試驗製造一致", state.momentQualificationFabricationConfirmed],
      ["momentQualificationProcedureConfirmed", "資格試驗程序一致", state.momentQualificationProcedureConfirmed],
    ];

    const detailChecks = [
      makeDetailCheck("momentLrfdMethod", "LRFD 設計法", state.designMethod === "LRFD" ? 1 : 0, true, "custom", "V1 限 LRFD 正式附件，不接受 ASD。", "規範判定｜第十章"),
      makeDetailCheck("momentFrameSystem", "構架系統適用範圍", ["smrf", "imrf"].includes(state.momentFrameSystem) ? 1 : 0, true, "custom", "V1 限 SMRF 或 IMRF。", "規範判定｜13.6、13.7"),
      makeDetailCheck("momentAxis", "單一選定構架面", ["x", "y"].includes(state.momentAxis) ? 1 : 0, true, "custom", "正式附件只涵蓋單一選定構架面之 X 或 Y 方向。", "專案指定"),
      makeDetailCheck("momentDesignRoute", "補強式接頭路線", state.momentConnectionDesignRoute === "reinforced" ? 1 : 0, true, "custom", "V1 只接受補強式梁柱彎矩接頭。", "專案指定"),
      makeDetailCheck("momentExpectedStrengthFactor", "預期強度係數 beta", state.momentExpectedStrengthFactor, 1, "gte", "beta 須 >= 1.0；規範解說對 A572 Gr.50 常見建議可採 1.4，或採其他經驗證值，但均須由資格與容量來源追溯。", "設計者判斷｜規範解說"),
      makeDetailCheck("momentFarCriticalSectionExpectedMoment", "對端臨界截面預期塑性彎矩", farMomentInputValid ? 1 : 0, true, "custom", farMomentInputValid ? "Mpr,far 已依需求/構架模型提供，允許為 0。" : "Mpr,far 須來自需求/構架模型，且原始輸入必須為有限非負值。", "專案指定"),
      makeDetailCheck("momentBeamFlangeCompactnessRatio", "梁翼緣緊密斷面比", state.momentBeamFlangeCompactnessRatio, 1, "lte", "梁翼緣緊密斷面比須 <= 1；IMRF 由本附件依專案保守同採。", "規範判定｜13.6.3；專案指定｜IMRF 同採"),
      makeDetailCheck("momentBeamWebCompactnessRatio", "梁腹板緊密斷面比", state.momentBeamWebCompactnessRatio, 1, "lte", "梁腹板緊密斷面比須 <= 1；IMRF 由本附件依專案保守同採。", "規範判定｜13.6.3；專案指定｜IMRF 同採"),
      makeDetailCheck("momentBeamFlangePlasticModulusRatio", "梁翼緣塑性模數比", state.momentBeamFlangePlasticModulusRatio, 0.7, "gte", "梁翼緣塑性模數比須 >= 0.70；IMRF 由本附件依專案保守同採。", "規範判定｜13.6.3；專案指定｜IMRF 同採"),
      makeDetailCheck("momentPanelZoneThickness", "Panel Zone 厚度需求", state.momentPanelZoneThickness, panelThicknessRequired, "gte", `tp = ${formatEquationNumber(state.momentPanelZoneThickness)} mm，tz,req = (dz + wz) / 90 = ${formatEquationNumber(panelThicknessRequired)} mm；IMRF 由本附件依專案保守同採。`, "規範判定｜13.6.2；專案指定｜IMRF 同採"),
      makeDetailCheck("momentDoublerAttachmentConfirmed", "Doubler 板銜接確認", state.momentDoublerPresent ? (state.momentDoublerAttachmentConfirmed ? 1 : 0) : 1, true, "custom", state.momentDoublerPresent ? "設置 doubler 板時，須確認與柱翼/柱腹之傳力銜接。" : "未設 doubler 板時本項不控制。", "設計者判斷"),
      makeDetailCheck("momentContinuityPlateRequirement", "Continuity Plate 需求", continuityRequired ? (state.momentContinuityPlateProvidedConfirmed ? 1 : 0) : 1, true, "custom", continuityRequired ? `柱翼局部標稱拉力強度 ${formatEquationNumber(state.momentColumnFlangeLocalNominalStrength)} kN 小於門檻 ${formatEquationNumber(continuityThreshold)} kN，需設 continuity plate；IMRF 由本附件依專案保守同採。` : `柱翼局部標稱拉力強度 ${formatEquationNumber(state.momentColumnFlangeLocalNominalStrength)} kN >= 門檻 ${formatEquationNumber(continuityThreshold)} kN。`, "規範判定｜13.6.4；專案指定｜IMRF 同採"),
      makeDetailCheck("momentContinuityPlateWeldConfirmed", "Continuity Plate 銲接確認", continuityRequired ? (state.momentContinuityPlateWeldConfirmed ? 1 : 0) : 1, true, "custom", continuityRequired ? "需確認 continuity plate 銲接細節已納入核定圖與容量來源。" : "未觸發 continuity plate 需求時本項不控制。", "設計者判斷"),
      makeDetailCheck("momentQualificationRoute", "資格路線", ["direct_test", "prior_test_similarity", "third_party_review"].includes(state.momentQualificationRoute) ? 1 : 0, true, "custom", "耐震資格路線限直接試驗、既有試驗相似性或第三方審查。", "規範判定｜13.6.1、13.7.2"),
      makeDetailCheck("momentQualificationTestCount", "資格試驗數量", state.momentQualificationRoute === "direct_test" ? state.momentQualificationTestCount : 2, 2, "gte", state.momentQualificationRoute === "direct_test" ? "直接試驗路線至少 2 組試體，作為本專案保守門檻。" : "既有試驗相似性與第三方審查路線不以本項作為硬性規範門檻。", "專案指定"),
      makeDetailCheck("momentQualificationThicknessSimilarity", "翼緣厚度相似性", state.momentQualificationRoute === "prior_test_similarity" ? state.momentDesignBeamFlangeThickness : state.momentQualificationRoute === "third_party_review" ? state.momentDesignBeamFlangeThickness : 1, state.momentQualificationRoute === "prior_test_similarity" ? 1.25 * state.momentTestBeamFlangeThickness : state.momentQualificationRoute === "third_party_review" ? 45 : 0, state.momentQualificationRoute === "direct_test" ? "gte" : "lte", state.momentQualificationRoute === "prior_test_similarity" ? `設計翼緣厚度需 <= 1.25 × 試體翼緣厚度 = ${formatEquationNumber(1.25 * state.momentTestBeamFlangeThickness)} mm。` : state.momentQualificationRoute === "third_party_review" ? "第三方審查路線限設計梁翼緣厚度 <= 45 mm。" : "直接試驗路線不以 45 mm 作為此項限制。", "設計者判斷"),
      makeDetailCheck("momentQualificationPlasticRatioSimilarity", "翼緣塑性比例相似性", state.momentQualificationRoute === "prior_test_similarity" ? state.momentDesignFlangePlasticRatio : 1, state.momentQualificationRoute === "prior_test_similarity" ? state.momentTestFlangePlasticRatio : 0, state.momentQualificationRoute === "prior_test_similarity" ? "gte" : "gte", state.momentQualificationRoute === "prior_test_similarity" ? "既有試驗相似性路線要求設計翼緣塑性比例 >= 試體比例。" : "非既有試驗相似性路線本項不控制。", "設計者判斷"),
      makeDetailCheck("momentThirdPartyReviewConfirmed", "第三方審查確認", state.momentQualificationRoute === "third_party_review" ? (state.momentThirdPartyReviewConfirmed ? 1 : 0) : 1, true, "custom", state.momentQualificationRoute === "third_party_review" ? "第三方審查路線須提供有效審查確認。" : "非第三方審查路線本項不控制。", "設計者判斷"),
      ...qualificationSimilarityChecks.map(([key, label, value]) => makeDetailCheck(key, label, value ? 1 : 0, true, "custom", `${label}須明確確認。`, "設計者判斷")),
      makeDetailCheck("momentPlasticZoneGeometryConfirmed", "塑鉸區幾何確認", state.momentPlasticZoneGeometryConfirmed ? 1 : 0, true, "custom", "須確認塑鉸區幾何與審查附件一致。", "設計者判斷"),
      makeDetailCheck("momentPlasticZoneOpeningsAbsentConfirmed", "塑鉸區無開孔確認", state.momentPlasticZoneOpeningsAbsentConfirmed ? 1 : 0, true, "custom", "須確認塑鉸區未設置削弱延性之開孔。", "設計者判斷"),
      makeDetailCheck("momentSeismicMaterialConfirmed", "耐震材料確認", state.momentSeismicMaterialConfirmed ? 1 : 0, true, "custom", "須確認耐震鋼材與材料韌性要求。", "設計者判斷"),
      makeDetailCheck("momentMatchingWeldConfirmed", "相容銲材確認", state.momentMatchingWeldConfirmed ? 1 : 0, true, "custom", "須確認銲材與母材強度及韌性相容。", "設計者判斷"),
      makeDetailCheck("momentCns3506WeldConfirmed", "CNS 3506 銲材確認", state.momentCns3506WeldConfirmed ? 1 : 0, true, "custom", "須確認銲材與程序符合 CNS 3506 或專案核定要求。", "規範判定｜第十章"),
      makeDetailCheck("momentEndTabsRemovedGroundConfirmed", "導銲板處理確認", state.momentEndTabsRemovedGroundConfirmed ? 1 : 0, true, "custom", "須確認導銲板移除與打磨完成。", "設計者判斷"),
      makeDetailCheck("momentWeldProcedureMatchesQualificationConfirmed", "WPS 與資格一致", state.momentWeldProcedureMatchesQualificationConfirmed ? 1 : 0, true, "custom", "須確認施工 WPS 與資格依據一致。", "設計者判斷"),
      makeDetailCheck("momentJointLateralRestraintConfirmed", "節點側向拘束確認", state.momentJointLateralRestraintConfirmed ? 1 : 0, true, "custom", "須確認節點附近側向拘束條件。", "設計者判斷"),
      makeDetailCheck("momentBeamLateralBracingConfirmed", "梁側向支撐確認", state.momentBeamLateralBracingConfirmed ? 1 : 0, true, "custom", "須確認梁塑鉸區側向支撐配置。", "設計者判斷"),
      makeDetailCheck("momentAllMembersIncludedConfirmed", "選定構架面構件完整性", state.momentAllMembersIncludedConfirmed ? 1 : 0, true, "custom", "須確認選定構架面內之柱、梁均已納入。", "專案指定"),
      makeDetailCheck("momentColumnStrengthsAtGoverningAxialConfirmed", "柱強度採控制軸力確認", state.momentColumnStrengthsAtGoverningAxialConfirmed ? 1 : 0, true, "custom", "須確認柱強度比採控制軸力組合。", "設計者判斷"),
      makeDetailCheck("momentOpposingDirectionsConfirmed", "正反向耐震檢核確認", state.momentOpposingDirectionsConfirmed ? 1 : 0, true, "custom", "須確認正向與反向地震作用均已檢核。", "規範判定｜13.6.5"),
      makeDetailCheck("momentOrthogonalDirectionSeparateConfirmed", "正交方向另案確認", state.momentOrthogonalDirectionSeparateConfirmed ? 1 : 0, true, "custom", "本附件不含正交方向，須另案檢核。", "專案指定"),
      makeDetailCheck("momentConnectionHardwareVerifiedConfirmed", "接頭零組件核對確認", state.momentConnectionHardwareVerifiedConfirmed ? 1 : 0, true, "custom", "螺栓、端板、補強材與銲材等零組件須由外部受控來源核對。", "專案指定"),
      makeDetailCheck("momentSelectedAxisScopeConfirmed", "單一方向附件範圍確認", state.momentSelectedAxisScopeConfirmed ? 1 : 0, true, "custom", "正式附件只核對所選單一構架面與單一方向。", "專案指定"),
      makeDetailCheck("momentDemandBasis", "需求來源", hasBasis(state.momentDemandBasis) ? 1 : 0, true, "custom", hasBasis(state.momentDemandBasis) ? state.momentDemandBasis : "請填入分析模型、組合與簽核來源。", "專案指定"),
      makeDetailCheck("momentGeometryBasis", "幾何來源", hasBasis(state.momentGeometryBasis) ? 1 : 0, true, "custom", hasBasis(state.momentGeometryBasis) ? state.momentGeometryBasis : "請填入核定圖說或量測來源。", "專案指定"),
      makeDetailCheck("momentMaterialBasis", "材料來源", hasBasis(state.momentMaterialBasis) ? 1 : 0, true, "custom", hasBasis(state.momentMaterialBasis) ? state.momentMaterialBasis : "請填入鋼材、銲材與材料證明來源。", "專案指定"),
      makeDetailCheck("momentCapacityBasis", "容量來源", hasBasis(state.momentCapacityBasis) ? 1 : 0, true, "custom", hasBasis(state.momentCapacityBasis) ? state.momentCapacityBasis : "請填入外部受控容量來源。", "專案指定"),
      makeDetailCheck("momentPanelZoneBasis", "Panel Zone 來源", hasBasis(state.momentPanelZoneBasis) ? 1 : 0, true, "custom", hasBasis(state.momentPanelZoneBasis) ? state.momentPanelZoneBasis : "請填入 Panel Zone 幾何與分析來源。", "專案指定"),
      makeDetailCheck("momentStrongColumnBasis", "強柱弱梁來源", hasBasis(state.momentStrongColumnBasis) ? 1 : 0, true, "custom", hasBasis(state.momentStrongColumnBasis) ? state.momentStrongColumnBasis : "請填入控制軸力柱項，以及各梁 ZbFyb、Vp 與塑鉸至柱面距離 x 的來源。", "專案指定"),
      makeDetailCheck("momentQualificationBasis", "資格依據來源", hasBasis(state.momentQualificationBasis) ? 1 : 0, true, "custom", hasBasis(state.momentQualificationBasis) ? state.momentQualificationBasis : "請填入耐震資格試驗或第三方審查來源。", "專案指定"),
      makeDetailCheck("momentQualificationEvidenceSha256", "資格證據 SHA-256", isSha256(state.momentQualificationEvidenceSha256) ? 1 : 0, true, "custom", isSha256(state.momentQualificationEvidenceSha256) ? "已提供 64 碼 SHA-256。" : "資格證據 SHA-256 須為 64 碼十六進位字串。", "專案指定"),
      makeDetailCheck("momentCapacityEvidenceSha256", "容量證據 SHA-256", isSha256(state.momentCapacityEvidenceSha256) ? 1 : 0, true, "custom", isSha256(state.momentCapacityEvidenceSha256) ? "已提供 64 碼 SHA-256。" : "容量證據 SHA-256 須為 64 碼十六進位字串。", "專案指定"),
    ];

    const checks = [
      createCheck({
        key: "momentFlexuralStrength",
        label: "接頭彎矩容量",
        demand: MuFace,
        nominal: state.momentAvailableFlexuralStrength,
        available: state.momentAvailableFlexuralStrength,
        note: "以外部受控來源提供之接頭可用抗彎強度對照梁端面需求。",
        codeRef: state.momentFrameSystem === "imrf" ? "規範判定｜13.7.2" : "規範判定｜13.6.1",
        equationRef: "專案指定外部容量",
        unit: "kN-m",
        equationLines: [
          `Mp = Zb × Fyb / 10^6 = ${formatEquationNumber(Mp)} kN-m`,
          `Mpr = beta × Mp = ${formatEquationNumber(Mpr)} kN-m`,
          `Mpr,far = ${formatEquationNumber(MprFar)} kN-m`,
          `Vp = (Mpr + Mpr,far) × 1000 / Lh = ${formatEquationNumber(Vp)} kN`,
          `Mu,face = Mpr + Vp × x / 1000 = ${formatEquationNumber(MuFace)} kN-m`,
          `接頭可用抗彎強度 = ${formatEquationNumber(state.momentAvailableFlexuralStrength)} kN-m`,
        ],
      }),
      createCheck({
        key: "momentShearStrength",
        label: "接頭剪力容量",
        demand: VuRequired,
        nominal: state.momentAvailableShearStrength,
        available: state.momentAvailableShearStrength,
        note: "以外部受控來源提供之接頭可用抗剪強度對照塑鉸機制剪力需求。",
        codeRef: state.momentFrameSystem === "imrf" ? "規範判定｜13.7.2" : "規範判定｜13.6.1",
        equationRef: "專案指定外部容量",
        unit: "kN",
        equationLines: [
          `Vu,req = min(|Vgravity| + Vp, |Vamplified|) = ${formatEquationNumber(VuRequired)} kN`,
          `接頭可用抗剪強度 = ${formatEquationNumber(state.momentAvailableShearStrength)} kN`,
        ],
      }),
      createCheck({
        key: "momentPlasticRotation",
        label: "塑性轉角資格",
        demand: rotationDemand,
        nominal: state.momentQualifiedPlasticRotation,
        available: state.momentQualifiedPlasticRotation,
        note: "以所選需求法計算之塑性轉角需求對照資格或審查可接受轉角。",
        codeRef: state.momentFrameSystem === "imrf" ? "規範判定｜13.7.2" : "規範判定｜13.6.1",
        equationRef: state.momentFrameSystem === "imrf" ? "13.7.2＋專案指定需求法" : "13.6.1＋專案指定需求法",
        unit: "rad",
        equationLines: [
          state.momentRotationDemandMethod === "nonlinear"
            ? `theta,req = thetaNL + 0.005 = ${formatEquationNumber(rotationDemand)} rad`
            : state.momentRotationDemandMethod === "formula"
              ? `theta,req = 1.1 × (R - 1) × thetaE = ${formatEquationNumber(rotationDemand)} rad`
              : `theta,req = ${state.momentFrameSystem === "smrf" ? "0.03" : "0.01"} rad`,
          `資格可接受塑性轉角 = ${formatEquationNumber(state.momentQualifiedPlasticRotation)} rad`,
        ],
      }),
      createCheck({
        key: "momentPanelZoneShear",
        label: "Panel Zone 剪力",
        demand: VpzRequired,
        nominal: VpzNominal,
        available: panelZoneAvailable,
        note: "以梁端面彎矩合計與分析需求較大者控制 Panel Zone 剪力。",
        codeRef: "規範判定｜13.6.2；專案指定｜IMRF 同採",
        equationRef: "式(13.6-1)、式(13.6-2)",
        unit: "kN",
        equationLines: [
          `Vpz,min = ΣMp × 1000 / hpz = ${formatEquationNumber(VpzMin)} kN`,
          `Vpz,req = max(Vpz,analysis, Vpz,min) = ${formatEquationNumber(VpzRequired)} kN`,
          `Vpz,n = 0.6 × Fyc × dc × tp / 1000 = ${formatEquationNumber(VpzNominal)} kN`,
          `可用 Panel Zone 強度 = ${formatEquationNumber(panelZoneAvailable)} kN`,
        ],
      }),
      createCheck({
        key: "momentStrongColumnCw",
        label: "強柱弱梁比 CW",
        demand: 1.25,
        nominal: scwbCw,
        available: scwbCw,
        note: state.momentFrameSystem === "imrf" ? "順時針方向以柱項總和 / 補強式梁項總和檢核；每支梁項須已包含 ZbFyb + Vp·x。IMRF 若仍加做本項，視為專案額外採用。" : "順時針方向以柱項總和 / 補強式梁項總和檢核；依 13.6.5 解說，每支梁項須已包含 ZbFyb + Vp·x。",
        codeRef: state.momentFrameSystem === "imrf" ? "專案指定｜IMRF 保守同採 13.6.5" : "規範判定｜13.6.5",
        equationRef: state.momentFrameSystem === "imrf" ? "專案指定｜IMRF 同採式(13.6-3)＋補強式接頭解說" : "式(13.6-3)＋13.6.5 補強式接頭解說",
        unit: "",
        equationLines: [
          `CW = sum Zc(Fyc - Puc/Ag) / sum(ZbFyb + Vp x) = ${formatEquationNumber(scwbCw)}`,
          "需求比值 = 1.25",
        ],
      }),
      createCheck({
        key: "momentStrongColumnCcw",
        label: "強柱弱梁比 CCW",
        demand: 1.25,
        nominal: scwbCcw,
        available: scwbCcw,
        note: state.momentFrameSystem === "imrf" ? "逆時針方向以柱項總和 / 補強式梁項總和檢核；每支梁項須已包含 ZbFyb + Vp·x。IMRF 若仍加做本項，視為專案額外採用。" : "逆時針方向以柱項總和 / 補強式梁項總和檢核；依 13.6.5 解說，每支梁項須已包含 ZbFyb + Vp·x。",
        codeRef: state.momentFrameSystem === "imrf" ? "專案指定｜IMRF 保守同採 13.6.5" : "規範判定｜13.6.5",
        equationRef: state.momentFrameSystem === "imrf" ? "專案指定｜IMRF 同採式(13.6-3)＋補強式接頭解說" : "式(13.6-3)＋13.6.5 補強式接頭解說",
        unit: "",
        equationLines: [
          `CCW = sum Zc(Fyc - Puc/Ag) / sum(ZbFyb + Vp x) = ${formatEquationNumber(scwbCcw)}`,
          "需求比值 = 1.25",
        ],
      }),
    ];

    return {
      ...CONNECTION_META.beam_column_moment,
      checks,
      detailChecks,
      validations,
      assumptions: [
        "正式附件只涵蓋單一選定方向之規範算術、來源證據與耐震能力審查，不延伸為多向或整體構架完整接頭設計。",
        "塑鉸機制剪力 Vp 依本端與對端臨界截面之預期塑性彎矩共同決定；Mpr,far 屬需求/構架模型輸入，不屬接頭外部容量。",
        "補強式接頭之強柱弱梁分母依 13.6.5 解說採各梁 ZbFyb + Vp·x；四個梁項為順、逆向分別整理的受控輸入，須追溯各梁自己的 Vp 與塑鉸至柱面距離 x。",
        "接頭螺栓、端板、prying action、yield-line、焊道與其他局部容量均由外部受控來源提供，本附件僅核對其可用強度與證據追溯。",
        "AISC 358 family / prequalification、正交方向、NDT 與施工程序為另案控制；completeJointDesign = false。",
      ],
      references: [
        "規範判定｜臺灣鋼結構極限設計法 13.6.1~13.6.5 梁柱彎矩接頭耐震能力審查、式(13.6-3)及補強式接頭解說之 ZbFyb + Vp·x 梁項",
        "規範判定｜臺灣鋼結構極限設計法 第十章 接合設計一般規定",
        ...(state.momentFrameSystem === "imrf" ? ["規範判定｜臺灣鋼結構極限設計法 13.7.2 IMRF 接頭規定"] : []),
        "專案指定｜單一選定構架面、需求/構架模型提供之 Mpr,far、外部受控容量來源與 SHA-256 證據追溯",
        "設計者判斷｜補強式梁柱彎矩接頭資格相似性、第三方審查與施工適用性確認",
      ],
      seismicReview: {
        frameSystem: state.momentFrameSystem,
        axis: state.momentAxis,
        qualificationRoute: state.momentQualificationRoute,
        rotationDemandMethod: state.momentRotationDemandMethod,
        Mp,
        Mpr,
        MprFar,
        Vp,
        MuFace,
        VuRequired,
        rotationDemand,
        qualifiedRotation: state.momentQualifiedPlasticRotation,
        VpzMin,
        VpzRequired,
        VpzNominal,
        panelThicknessRequired,
        continuityThreshold,
        continuityRequired,
        scwbCw,
        scwbCcw,
      },
      completeJointDesign: false,
      scopeLimited: false,
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
        validations.push("採指定斷面面積時，須完整提供 Ag、An、Agv、Anv、Agt、Ant。");
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
          : "本案採指定斷面面積，Ae 仍依 4.3 以 min(An, 0.85Ag) 整理。",
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
        note: derived.pathSource === "manual_override" ? "區塊剪力面積採指定值。" : derived.pathSource === "manual_area" ? "本案區塊剪力面積採指定值。" : "依矩形板件常用 U 型區塊剪力路徑自動推導。",
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
          : `採指定斷面面積，Ae = min(An, 0.85Ag) = ${formatEquationNumber(effectiveNetArea)} mm²`,
        blockShear: derived.pathSource === "manual_override"
          ? "區塊剪力採手動覆寫路徑"
          : derived.pathSource === "manual_area"
            ? "區塊剪力面積採指定值"
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
    const blockingValidations = [...baseValidations, ...(result.validations || [])];
    const validations = [...blockingValidations];
    const connectionMeta = CONNECTION_META[state.connectionType] || CONNECTION_META.single_plate;
    const complianceReady = Boolean(connectionMeta.complianceReady);
    if (!complianceReady) {
      validations.push("此模組尚未收斂到完整規範覆核範圍，現階段不提供正式規範核算。");
    }
    const scopeNotes = result.assumptions || [];
    const scopeLimited = Object.prototype.hasOwnProperty.call(result, "scopeLimited")
      ? Boolean(result.scopeLimited)
      : scopeNotes.some((item) => /(未納入|簡化|保守|第一階段|不含)/.test(item));
    if (scopeLimited) {
      validations.push("本模組仍含範圍受限或簡化條件，結果不得直接視為完整規範覆核。");
    }
    const governing = checks.reduce((maxCheck, current) => (!maxCheck || current.ratio > maxCheck.ratio ? current : maxCheck), null);
    const strengthFailure = checks.some((item) => {
      const numericResultsAreFinite = [item.demand, item.nominal, item.available, item.ratio].every(Number.isFinite);
      const positiveDemandHasPositiveCapacity = item.demand <= 0 || (item.nominal > 0 && item.available > 0);
      return !numericResultsAreFinite || !positiveDemandHasPositiveCapacity || item.ratio > 1.0;
    });
    const detailFailure = detailChecks.some((item) => !item.passes);
    const validationFailure = ["single_plate", "column_splice", "brace_gusset", "beam_column_moment"].includes(state.connectionType) && blockingValidations.length > 0;
    const hasWarning = validations.length > 0 || checks.some((item) => item.warning) || scopeLimited;
    const overallStatus = !complianceReady || strengthFailure || detailFailure || validationFailure ? "fail" : hasWarning ? "warn" : "ok";

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
      designDemand: result.designDemand || null,
      sketchData: result.sketchData || null,
      seismicReview: result.seismicReview || null,
      spliceReview: result.spliceReview || null,
      completeJointDesign: Object.prototype.hasOwnProperty.call(result, "completeJointDesign") ? result.completeJointDesign : null,
      completeColumnMemberDesign: Object.prototype.hasOwnProperty.call(result, "completeColumnMemberDesign") ? result.completeColumnMemberDesign : null,
      asBuiltAcceptance: Object.prototype.hasOwnProperty.call(result, "asBuiltAcceptance") ? result.asBuiltAcceptance : null,
      complianceReady,
      scopeLimited,
      overallStatus,
      passes: complianceReady && !(strengthFailure || detailFailure || validationFailure),
      summary: { strengthFailure, detailFailure, validationFailure },
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
