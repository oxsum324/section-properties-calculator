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
    },
    column_splice: {
      reportTitle: "柱續接檢核計算書",
      reportSubtitle: "Column Splice Connection Report",
      pageTitle: "鋼構柱續接設計與檢核",
      pageDescription: "柱翼 / 柱腹續接板｜軸力、剪力、彎矩分流，搭配螺栓、板件與銲接檢核",
    },
    brace_gusset: {
      reportTitle: "支撐 / Gusset 接頭檢核計算書",
      reportSubtitle: "Brace Gusset Connection Report",
      pageTitle: "鋼構支撐 Gusset 接頭設計與檢核",
      pageDescription: "支撐軸力、Gusset 板、Whitmore 有效寬度、螺栓、塊狀撕裂與銲接檢核",
    },
    beam_column_moment: {
      reportTitle: "梁柱彎矩接頭檢核計算書",
      reportSubtitle: "Beam-Column Moment Connection Report",
      pageTitle: "鋼構梁柱彎矩接頭設計與檢核",
      pageDescription: "簡化力偶模型｜拉側螺栓、端板張力、腹板剪力傳遞與 Panel Zone 容量檢核",
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

  function safeRatio(demand, available) {
    return available > 0 ? demand / available : Infinity;
  }

  function formatEquationNumber(value) {
    return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
  }

  function boltArea(db) {
    return Math.PI * Math.pow(db, 2) / 4;
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

  function createCheck({ key, label, demand, nominal, available, note, equationLines, warning }) {
    return { key, label, demand, nominal, available, ratio: safeRatio(demand, available), note, equationLines, warning: Boolean(warning) };
  }

  function makeDetailCheck(key, label, provided, required, comparator, note, codeRef) {
    const passes = comparator === "gte" ? provided >= required : comparator === "lte" ? provided <= required : Boolean(provided);
    return { key, label, passes, provided, required, comparator, note, codeRef };
  }

  function buildBoltShearCheck({ key, label, demand, boltDiameter, boltUltimateStrength, boltCount, shearPlanes, threadsCondition, designMethod, reductionFactor = 1, note }) {
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
      equationLines: [
        `Ab = π db² / 4 = ${formatEquationNumber(area)} mm²`,
        `Fnv = ${formatEquationNumber(shearFactor)} × Fub = ${formatEquationNumber(shearFactor * boltUltimateStrength)} MPa`,
        `Rn = Fnv × Ab × n × ns × r = ${formatEquationNumber(nominal)} kN`,
      ],
    });
  }

  function buildBoltTensionCheck({ key, label, demand, boltDiameter, boltUltimateStrength, boltCount, designMethod, note }) {
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
    });
  }

  function bearingNominalPerBolt(lc, t, fu, db, deformationConsidered) {
    const lcSafe = Math.max(lc, 0);
    const c1 = deformationConsidered ? 1.2 : 1.5;
    const c2 = deformationConsidered ? 2.4 : 3.0;
    return Math.min(c1 * lcSafe * t * fu, c2 * db * t * fu) / 1000;
  }

  function buildBoltLineBearingCheck({ key, label, demand, count, endDistance, pitch, holeDiameter, thickness, fu, boltDiameter, deformationConsidered, designMethod, note }) {
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
      equationLines: [
        `Lc,end = e - dh / 2 = ${formatEquationNumber(endLc)} mm`,
        `Lc,int = s - dh = ${formatEquationNumber(interiorLc)} mm`,
        `Rn = Σ min(c1 × Lc × t × Fu, c2 × db × t × Fu) = ${formatEquationNumber(nominal)} kN`,
      ],
    });
  }

  function buildGrossYieldCheck({ key, label, demand, fy, grossArea, designMethod, note }) {
    const nominal = mm2ToKn(fy, grossArea);
    const available = applyDesignStrength(nominal, designMethod, "grossYield");
    return createCheck({ key, label, demand, nominal, available, note, equationLines: [`Ag = ${formatEquationNumber(grossArea)} mm²`, `Rn = Fy × Ag = ${formatEquationNumber(nominal)} kN`] });
  }

  function buildNetRuptureCheck({ key, label, demand, fu, netArea, designMethod, note }) {
    const nominal = mm2ToKn(fu, netArea);
    const available = applyDesignStrength(nominal, designMethod, "netRupture");
    return createCheck({ key, label, demand, nominal, available, note, equationLines: [`An = ${formatEquationNumber(netArea)} mm²`, `Rn = Fu × An = ${formatEquationNumber(nominal)} kN`] });
  }

  function buildShearYieldCheck({ key, label, demand, fy, area, designMethod, note }) {
    const nominal = mm2ToKn(0.6 * fy, area);
    const available = applyDesignStrength(nominal, designMethod, "shearYield");
    return createCheck({ key, label, demand, nominal, available, note, equationLines: [`Av = ${formatEquationNumber(area)} mm²`, `Rn = 0.6 × Fy × Av = ${formatEquationNumber(nominal)} kN`] });
  }

  function buildWeldCheck({ key, label, demand, weldSize, weldLength, weldLineCount, electrodeStrength, designMethod, note }) {
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
      warning: weldLength < 4 * weldSize,
      equationLines: [
        `te = 0.707a = ${formatEquationNumber(throat)} mm`,
        `Ae = te × Le × nline = ${formatEquationNumber(effectiveArea)} mm²`,
        `Rn = 0.6 × FEXX × Ae = ${formatEquationNumber(nominal)} kN`,
      ],
    });
  }

  function buildBlockShearCheck({ key, label, demand, boltCount, endDistance, pitch, holeDiameter, edgeDistance, thickness, fy, fu, designMethod, note }) {
    const lv = endDistance + Math.max(boltCount - 1, 0) * pitch;
    const agv = 2 * lv * thickness;
    const anv = 2 * Math.max(lv - (boltCount - 0.5) * holeDiameter, 0) * thickness;
    const agt = edgeDistance * thickness;
    const ant = Math.max(edgeDistance - holeDiameter / 2, 0) * thickness;
    const nominalA = mm2ToKn(0.6 * fy, agv) + mm2ToKn(fu, ant);
    const nominalB = mm2ToKn(0.6 * fu, anv) + mm2ToKn(fu, ant);
    const nominalC = mm2ToKn(0.6 * fu, anv) + mm2ToKn(fy, agt);
    const nominal = Math.min(nominalA, nominalB, nominalC);
    const available = applyDesignStrength(nominal, designMethod, "blockShear");
    return createCheck({
      key,
      label,
      demand,
      nominal,
      available,
      note,
      equationLines: [
        `Agv = ${formatEquationNumber(agv)} mm², Anv = ${formatEquationNumber(anv)} mm²`,
        `Agt = ${formatEquationNumber(agt)} mm², Ant = ${formatEquationNumber(ant)} mm²`,
        `Rn = min(Rn,a, Rn,b, Rn,c) = ${formatEquationNumber(nominal)} kN`,
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
    };
  }

  function validateBaseState(state) {
    const validations = [];
    if (state.holeDiameter <= state.boltDiameter) validations.push("孔徑 dh 應大於螺栓直徑 db。");
    if (state.eccentricity > 0) validations.push("本版未將偏心造成之栓群附加力納入，偏心接頭請再以栓群分析確認。");
    return validations;
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
      case "single_plate":
      default:
        result = calculateSinglePlate(state);
        break;
    }

    const checks = result.checks || [];
    const detailChecks = result.detailChecks || [];
    const validations = [...baseValidations, ...(result.validations || [])];
    const governing = checks.reduce((maxCheck, current) => (!maxCheck || current.ratio > maxCheck.ratio ? current : maxCheck), null);
    const strengthFailure = checks.some((item) => item.ratio > 1.0);
    const detailFailure = detailChecks.some((item) => !item.passes);
    const hasWarning = validations.length > 0 || checks.some((item) => item.warning);
    const overallStatus = strengthFailure || detailFailure ? "fail" : hasWarning ? "warn" : "ok";

    return {
      state,
      checks,
      detailChecks,
      governing,
      validations,
      assumptions: result.assumptions || [],
      references: result.references || [],
      reportTitle: result.reportTitle || "鋼構接頭檢核計算書",
      reportSubtitle: result.reportSubtitle || "Steel Connection Report",
      pageTitle: result.pageTitle || "鋼構接頭設計與檢核",
      pageDescription: result.pageDescription || "",
      overallStatus,
      passes: !(strengthFailure || detailFailure),
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
