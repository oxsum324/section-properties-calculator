(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.EarthPressureCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CORE_NAME = 'EarthPressureCore';
  const CORE_VERSION = '0.6.0';
  const INPUT_SCHEMA_VERSION = 'earth-pressure.input.v0.6';
  const RESULT_SCHEMA_VERSION = 'earth-pressure.result.v0.6';
  const LOGIC_SIGNATURE = 'earth-pressure-core:v0.6:rankine-coulomb-mononobe-okabe-layered-sand-clay-seepage-passive-policy-water-stability';

  const DESIGN_REFERENCE_LABELS = {
    taiwanFoundation2023: '台灣《建築物基礎構造設計規範》112 年版（穩定檢核初估）',
    rankineTextbook: 'Rankine 土壓理論 / 土壤力學教科書初估',
    projectManual: '專案指定準則（需人工確認）'
  };

  const WALL_CONDITION_LABELS = {
    yielding: '牆體可產生足夠位移，採主動土壓',
    restrained: '牆體受約束或近地下室外牆，採靜止土壓',
    manual: '手動指定土壓模式'
  };

  const WALL_TYPE_LABELS = {
    cantilever: '懸臂式擋土牆',
    gravity: '重力式擋土牆'
  };

  const WATER_MODEL_LABELS = {
    hydrostatic: '依 hw 納入靜水壓',
    none: '不納入地下水壓'
  };

  const PASSIVE_MODE_LABELS = {
    ignore: '不採計被動抵抗',
    reduced: '折減採計被動抵抗',
    includeFull: '全額採計被動抵抗'
  };

  const PRESSURE_THEORY_LABELS = {
    rankine: 'Rankine 土壓（水平背填、垂直光滑牆背初估）',
    coulomb: 'Coulomb 土壓（含牆摩擦 δ、牆背傾角 θ、背填傾角 β）'
  };

  // Coulomb 主動土壓係數 Ka（角度單位：弧度）。
  // φ 內摩擦角、δ 牆摩擦角、β 背填傾角(自水平)、θ 牆背傾角(自鉛直)。
  // 當 δ=β=θ=0 時退化為 Rankine Ka=(1-sinφ)/(1+sinφ)。
  function coulombActiveKa(phi, delta, beta, theta) {
    const num = Math.cos(phi - theta) * Math.cos(phi - theta);
    const denomLead = Math.cos(theta) * Math.cos(theta) * Math.cos(delta + theta);
    const sinTermNum = Math.sin(phi + delta) * Math.sin(phi - beta);
    const sinTermDen = Math.cos(delta + theta) * Math.cos(theta - beta);
    if (denomLead === 0 || sinTermDen === 0) {
      return { Ka: Infinity, valid: false, reason: '牆背/牆摩擦幾何使分母為零，無法計算。' };
    }
    const ratio = sinTermNum / sinTermDen;
    if (ratio < 0) {
      return { Ka: Infinity, valid: false, reason: '背填傾角 β 接近或超過內摩擦角 φ，Coulomb 主動解不成立。' };
    }
    const bracket = 1 + Math.sqrt(ratio);
    const Ka = num / (denomLead * bracket * bracket);
    return { Ka, valid: Number.isFinite(Ka) && Ka > 0, reason: '' };
  }

  // Mononobe-Okabe 地震主動土壓係數 Kae（角度單位：弧度）。
  // ψ = atan(kh/(1-kv))；當 kh=kv=0 時退化為 Coulomb Ka。
  function mononobeOkabeKae(phi, delta, beta, theta, psi) {
    const a = phi - theta - psi;
    const num = Math.cos(a) * Math.cos(a);
    const denomLead = Math.cos(psi) * Math.cos(theta) * Math.cos(theta) * Math.cos(delta + theta + psi);
    const sinTermNum = Math.sin(phi + delta) * Math.sin(phi - beta - psi);
    const sinTermDen = Math.cos(delta + theta + psi) * Math.cos(theta - beta);
    if (denomLead === 0 || sinTermDen === 0) {
      return { Kae: Infinity, valid: false, reason: '地震慣性角使分母為零，無法計算。' };
    }
    const ratio = sinTermNum / sinTermDen;
    if (ratio < 0) {
      return { Kae: Infinity, valid: false, reason: 'φ < β + ψ，地震時主動楔形不成立（邊坡或地震係數過大）。' };
    }
    const bracket = 1 + Math.sqrt(ratio);
    const Kae = num / (denomLead * bracket * bracket);
    return { Kae, valid: Number.isFinite(Kae) && Kae > 0, reason: '' };
  }

  const SOIL_TYPE_LABELS = {
    sand: '砂土（無黏聚力，c=0）',
    clay: '黏土（含黏聚力 c；可含張力裂縫）'
  };

  // 線性壓力段（pTop@zTop → pBot@zBot，深度 z 自頂面向下）之水平力與對牆底力矩；
  // 有效主動壓力小於 0（張力）者截斷為 0（張力裂縫不推牆）。回傳 {force, moment, crackDepth}。
  function segForceMoment(pTop, pBot, zTop, zBot, H) {
    const L = zBot - zTop;
    if (L <= 0) return { force: 0, moment: 0, crackDepth: null };
    let a = pTop, b = pBot, za = zTop, zb = zBot, crackDepth = null;
    if (a <= 0 && b <= 0) return { force: 0, moment: 0, crackDepth: zBot };
    if (a < 0 && b > 0) { const t = -a / (b - a); za = zTop + t * L; crackDepth = za; a = 0; }
    else if (a > 0 && b < 0) { const t = a / (a - b); zb = zTop + t * L; b = 0; }
    const Ls = zb - za;
    const force = (a + b) / 2 * Ls;
    const zc = (a + b) !== 0 ? za + Ls * (a + 2 * b) / (3 * (a + b)) : (za + zb) / 2; // 形心深度
    const moment = force * (H - zc); // 對牆底
    return { force, moment, crackDepth };
  }

  // 分層土主動土壓（Rankine 逐層，含黏土張力裂縫、超載併入 σv、地下水以有效應力＋靜水壓處理）。
  // layers: [{type,h,gamma,phi,c}] 自頂面向下；zw = 地下水位自頂面之深度。
  function computeLayeredActive(layers, surcharge, H, zw, gammaWater) {
    let z = 0, sigmaV = surcharge; // 頂面總垂直應力＝超載
    let soilForce = 0, soilMoment = 0;
    let tensionCrackDepth = 0;
    let crackOpen = true; // 自頂面延伸之張力裂縫是否仍開放（可跨層）
    const byLayer = [];
    for (const Ly of layers) {
      const h = Math.max(numberValue(Ly.h), 0);
      const gamma = numberValue(Ly.gamma);
      const isClay = Ly.type === 'clay';
      const phiRad = numberValue(Ly.phi) * Math.PI / 180;
      const c = isClay ? Math.max(numberValue(Ly.c), 0) : 0;
      const sinPhi = Math.sin(phiRad);
      const Ka = (1 - sinPhi) / (1 + sinPhi);
      const twoCsqrtKa = 2 * c * Math.sqrt(Ka);
      const zTop = z, zBot = z + h;
      const uTop = gammaWater * Math.max(zTop - zw, 0);
      const uBot = gammaWater * Math.max(zBot - zw, 0);
      const svTop = sigmaV, svBot = sigmaV + gamma * h;
      const saTop = Ka * (svTop - uTop) - twoCsqrtKa; // 有效主動壓力
      const saBot = Ka * (svBot - uBot) - twoCsqrtKa;
      const seg = segForceMoment(saTop, saBot, zTop, zBot, H);
      soilForce += seg.force;
      soilMoment += seg.moment;
      // 自頂面延伸之張力裂縫深度（可跨層累計，直到有效主動壓力轉為正值）
      if (crackOpen) {
        if (saTop <= 0 && saBot <= 0) { tensionCrackDepth = zBot; }
        else if (saTop <= 0 && saBot > 0) { tensionCrackDepth = zTop + (-saTop / (saBot - saTop)) * h; crackOpen = false; }
        else { crackOpen = false; }
      }
      byLayer.push({
        type: Ly.type, typeLabel: SOIL_TYPE_LABELS[isClay ? 'clay' : 'sand'],
        h, gamma, phiDeg: numberValue(Ly.phi), c, Ka,
        zTop, zBot, saTop, saBot, force: seg.force
      });
      sigmaV = svBot; z = zBot;
    }
    const hw = Math.max(H - zw, 0);
    const waterForce = 0.5 * gammaWater * hw * hw;
    const waterMoment = waterForce * (hw / 3);
    const totalForce = soilForce + waterForce;
    const totalMoment = soilMoment + waterMoment;
    return {
      soilForce, soilMoment, waterForce, waterMoment,
      totalForce, totalMoment,
      resultantHeight: totalForce > 0 ? totalMoment / totalForce : 0,
      tensionCrackDepth, byLayer,
      layerCount: layers.length, totalThickness: z
    };
  }

  function provenance() {
    return {
      core: CORE_NAME,
      version: CORE_VERSION,
      inputSchemaVersion: INPUT_SCHEMA_VERSION,
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
      logicSignature: LOGIC_SIGNATURE
    };
  }

  function checkItem(key, label, passed, detail, value, limit, unit) {
    return {
      key,
      label,
      status: passed ? 'pass' : 'fail',
      passed: Boolean(passed),
      detail,
      value,
      limit,
      unit
    };
  }

  function numberValue(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return '∞';
    return Number(value).toFixed(digits);
  }

  function choice(value, labels, fallback) {
    return Object.prototype.hasOwnProperty.call(labels, value) ? value : fallback;
  }

  function resolvePressureMode(input, wallCondition) {
    if (wallCondition === 'yielding') return 'active';
    if (wallCondition === 'restrained') return 'atRest';
    return input.mode === 'atRest' ? 'atRest' : 'active';
  }

  function sanitizeLayers(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (Ly) {
      Ly = Ly || {};
      const type = Ly.type === 'clay' ? 'clay' : 'sand';
      return {
        type,
        h: numberValue(Ly.h),
        gamma: numberValue(Ly.gamma),
        phi: numberValue(Ly.phi),
        c: type === 'clay' ? numberValue(Ly.c) : 0
      };
    });
  }

  function normalizeInput(input) {
    const H = numberValue(input.H);
    const rawWaterDepth = Math.min(Math.max(numberValue(input.waterDepth), 0), Math.max(H, 0));
    const hasWallCondition = Object.prototype.hasOwnProperty.call(input, 'wallCondition');
    const wallCondition = hasWallCondition
      ? choice(input.wallCondition, WALL_CONDITION_LABELS, 'manual')
      : 'manual';
    const mode = resolvePressureMode(input, wallCondition);
    const wallType = choice(input.wallType, WALL_TYPE_LABELS, 'cantilever');
    const designReference = choice(input.designReference, DESIGN_REFERENCE_LABELS, 'taiwanFoundation2023');
    const waterModel = Object.prototype.hasOwnProperty.call(input, 'waterModel')
      ? choice(input.waterModel, WATER_MODEL_LABELS, 'hydrostatic')
      : (rawWaterDepth > 0 ? 'hydrostatic' : 'none');
    const waterDepth = waterModel === 'none' ? 0 : rawWaterDepth;
    const passive = numberValue(input.passive);
    const passiveMode = Object.prototype.hasOwnProperty.call(input, 'passiveMode')
      ? choice(input.passiveMode, PASSIVE_MODE_LABELS, 'ignore')
      : (passive > 0 ? 'includeFull' : 'ignore');
    const passiveReductionFactor = numberValue(input.passiveReductionFactor || 0.5);
    const passiveFactor = passiveMode === 'ignore'
      ? 0
      : (passiveMode === 'reduced' ? passiveReductionFactor : 1);
    const pressureTheory = choice(input.pressureTheory, PRESSURE_THEORY_LABELS, 'rankine');
    const deltaDeg = numberValue(input.deltaDeg);
    const betaDeg = numberValue(input.betaDeg);
    const thetaDeg = numberValue(input.thetaDeg);
    const seismicEnable = Boolean(input.seismicEnable);
    const kh = numberValue(input.kh);
    const kv = numberValue(input.kv);
    const layeredMode = Boolean(input.layeredMode);
    const layers = sanitizeLayers(input.layers);
    return {
      designReference,
      wallType,
      wallCondition,
      H,
      gammaSoil: numberValue(input.gammaSoil),
      phiDeg: numberValue(input.phiDeg),
      mode,
      pressureTheory,
      deltaDeg,
      betaDeg,
      thetaDeg,
      seismicEnable,
      kh,
      kv,
      layeredMode,
      layers,
      surcharge: numberValue(input.surcharge),
      waterModel,
      waterDepth,
      gammaWater: numberValue(input.gammaWater),
      baseB: numberValue(input.baseB),
      verticalLoad: numberValue(input.verticalLoad),
      qa: numberValue(input.qa),
      mu: numberValue(input.mu),
      passive,
      passiveMode,
      passiveReductionFactor,
      passiveFactor,
      effectivePassive: passive * passiveFactor,
      fsSlideReq: numberValue(input.fsSlideReq),
      fsOverReq: numberValue(input.fsOverReq),
      fsSlideReqSeismic: Object.prototype.hasOwnProperty.call(input, 'fsSlideReqSeismic') ? numberValue(input.fsSlideReqSeismic) : 1.2,
      fsOverReqSeismic: Object.prototype.hasOwnProperty.call(input, 'fsOverReqSeismic') ? numberValue(input.fsOverReqSeismic) : 1.2
    };
  }

  function validateInput(input) {
    const i = normalizeInput(input);
    const errors = [];
    if (i.H <= 0) errors.push('擋土高度 H 必須大於 0。');
    if (i.gammaSoil <= 0) errors.push('土壤單位重 γ 必須大於 0。');
    if (i.phiDeg < 0 || i.phiDeg >= 60) errors.push('內摩擦角 φ 應介於 0° 與 60° 之間。');
    if (i.surcharge < 0) errors.push('均佈超載 q 不得為負。');
    if (numberValue(input.waterDepth) < 0 || numberValue(input.waterDepth) > i.H) errors.push('地下水深度 hw 應介於 0 與 H 之間。');
    if (i.gammaWater < 0) errors.push('水單位重不得為負。');
    if (i.baseB <= 0) errors.push('基底寬 B 必須大於 0。');
    if (i.verticalLoad <= 0) errors.push('垂直穩定重量 V 必須大於 0。');
    if (i.qa <= 0) errors.push('容許承載壓 qa 必須大於 0。');
    if (i.mu < 0 || i.passive < 0) errors.push('摩擦係數與被動抵抗不得為負。');
    if (i.passiveMode === 'reduced' && (i.passiveReductionFactor <= 0 || i.passiveReductionFactor > 1)) errors.push('被動抵抗折減係數應大於 0 且不大於 1。');
    if (i.fsSlideReq <= 0 || i.fsOverReq <= 0) errors.push('安全係數需求值必須大於 0。');
    if (i.pressureTheory === 'coulomb') {
      if (i.deltaDeg < 0 || i.deltaDeg > i.phiDeg) errors.push('Coulomb 牆摩擦角 δ 應介於 0° 與內摩擦角 φ 之間。');
      if (i.betaDeg < 0 || i.betaDeg >= i.phiDeg) errors.push('Coulomb 背填傾角 β 應介於 0° 且小於內摩擦角 φ。');
      if (i.thetaDeg < -30 || i.thetaDeg > 30) errors.push('Coulomb 牆背傾角 θ 建議介於 -30° 與 30° 之間。');
    }
    if (i.seismicEnable) {
      if (i.kh < 0) errors.push('地震水平係數 kh 不得為負。');
      if (i.kv <= -1 || i.kv >= 1) errors.push('地震垂直係數 kv 應介於 -1 與 1 之間。');
      if (i.fsSlideReqSeismic <= 0 || i.fsOverReqSeismic <= 0) errors.push('地震時安全係數需求值必須大於 0。');
    }
    if (i.layeredMode) {
      if (i.layers.length < 1) errors.push('分層模式至少需輸入 1 層土壤。');
      let sumH = 0;
      i.layers.forEach(function (L, idx) {
        const n = idx + 1;
        if (!(L.h > 0)) errors.push(`第 ${n} 層厚度必須大於 0。`);
        if (!(L.gamma > 0)) errors.push(`第 ${n} 層單位重必須大於 0。`);
        if (L.phi < 0 || L.phi >= 60) errors.push(`第 ${n} 層內摩擦角 φ 應介於 0° 與 60° 之間。`);
        if (L.type === 'clay' && L.c < 0) errors.push(`第 ${n} 層黏聚力 c 不得為負。`);
        sumH += L.h > 0 ? L.h : 0;
      });
      if (i.layers.length >= 1 && Math.abs(sumH - i.H) > 0.05) errors.push(`各層厚度總和 ${sumH.toFixed(2)} m 與擋土高度 H ${i.H.toFixed(2)} m 不一致。`);
    }
    return errors;
  }

  function calculate(input) {
    const i = normalizeInput(input);
    const phiRad = i.phiDeg * Math.PI / 180;
    const sinPhi = Math.sin(phiRad);
    const Ka = (1 - sinPhi) / (1 + sinPhi);
    const K0 = 1 - sinPhi;
    const K = i.mode === 'atRest' ? K0 : Ka;
    const modeLabel = i.mode === 'atRest' ? '靜止土壓 K0' : '主動土壓 Ka';
    const selectedModeReason = i.wallCondition === 'yielding'
      ? '牆體可產生足夠位移，採 Rankine 主動土壓。'
      : (i.wallCondition === 'restrained'
        ? '牆體受約束或近地下室外牆，採 Rankine 靜止土壓。'
        : '由使用者手動指定本次土壓模式。');
    const deltaRad = i.deltaDeg * Math.PI / 180;
    const betaRad = i.betaDeg * Math.PI / 180;
    const thetaRad = i.thetaDeg * Math.PI / 180;
    // Coulomb 僅適用主動狀態；靜止(受約束)仍採 Rankine K0。
    const useCoulomb = i.pressureTheory === 'coulomb' && i.mode === 'active';
    const coulomb = useCoulomb ? coulombActiveKa(phiRad, deltaRad, betaRad, thetaRad) : null;
    const coulombValid = useCoulomb && coulomb.valid;
    const horizontalFactor = Math.cos(deltaRad + thetaRad); // 主動推力水平分量係數
    const effectiveSoilCoef = coulombValid ? coulomb.Ka : K;
    // 分層土模式（opt-in）優先於單層 Rankine / Coulomb；採有效應力逐層 Rankine 主動土壓。
    const useLayered = i.layeredMode && i.layers.length > 0;
    const zwForLayered = i.waterModel === 'none' ? i.H : (i.H - i.waterDepth);
    const layered = useLayered
      ? computeLayeredActive(i.layers, i.surcharge, i.H, zwForLayered, i.gammaWater)
      : null;
    const theoryLabel = useLayered ? '分層土 Rankine 主動土壓（逐層）'
      : (useCoulomb ? (coulombValid ? 'Coulomb 主動土壓 Ka' : 'Coulomb 解不成立，暫退回 Rankine') : modeLabel);
    const theoryNote = useCoulomb && !coulombValid ? coulomb.reason : '';
    const backfillModelLabel = useLayered
      ? `分層土：${layered.layerCount} 層，砂/黏土逐層 Rankine 主動土壓（有效應力，含黏土張力裂縫與靜水壓）`
      : (useCoulomb
        ? 'Coulomb：可含牆摩擦 δ、牆背傾角 θ、背填傾角 β（水平分量計入穩定）'
        : '水平背填、垂直牆背、無黏性土 Rankine 初估');

    const soilForce = useLayered ? layered.soilForce
      : (coulombValid ? 0.5 * coulomb.Ka * i.gammaSoil * i.H * i.H * horizontalFactor
                      : 0.5 * K * i.gammaSoil * i.H * i.H);
    const soilMoment = useLayered ? layered.soilMoment : soilForce * i.H / 3;
    // 分層模式：超載已併入各層 σv，不另計 surchargeForce
    const surchargeForce = useLayered ? 0
      : (coulombValid ? coulomb.Ka * i.surcharge * i.H * horizontalFactor
                      : K * i.surcharge * i.H);
    const surchargeMoment = useLayered ? 0 : surchargeForce * i.H / 2;
    const waterForce = useLayered ? layered.waterForce : 0.5 * i.gammaWater * i.waterDepth * i.waterDepth;
    const waterMoment = useLayered ? layered.waterMoment : waterForce * i.waterDepth / 3;
    const totalForce = soilForce + surchargeForce + waterForce;
    const overturningMoment = soilMoment + surchargeMoment + waterMoment;
    const resultantHeight = totalForce > 0 ? overturningMoment / totalForce : 0;

    // ── 地震時主動土壓（Mononobe-Okabe，opt-in，水平分量計入；報告與檢核並陳）──
    // 分層模式不套用 M-O（單一楔形假設不適用分層），如需地震土壓請用單層模式。
    let seismic = null;
    if (i.seismicEnable && !useLayered) {
      const oneMinusKv = 1 - i.kv;
      const psi = oneMinusKv !== 0 ? Math.atan(i.kh / oneMinusKv) : Infinity;
      const mo = Number.isFinite(psi)
        ? mononobeOkabeKae(phiRad, deltaRad, betaRad, thetaRad, psi)
        : { Kae: Infinity, valid: false, reason: 'kv = 1，地震慣性角無法定義。' };
      const seismicValid = mo.valid && Number.isFinite(psi);
      const seismicSoilForce = seismicValid
        ? 0.5 * mo.Kae * i.gammaSoil * i.H * i.H * oneMinusKv * horizontalFactor
        : Infinity;
      const deltaPae = seismicValid ? seismicSoilForce - soilForce : Infinity; // Seed-Whitman 動態增量
      // 靜態土壓作用於 H/3，動態增量作用於 0.6H
      const seismicSoilMoment = seismicValid
        ? soilForce * (i.H / 3) + deltaPae * (0.6 * i.H)
        : Infinity;
      const seismicTotalForce = seismicValid ? seismicSoilForce + surchargeForce + waterForce : Infinity;
      const seismicOverMoment = seismicValid ? seismicSoilMoment + surchargeMoment + waterMoment : Infinity;
      const seismicSoilHeight = seismicValid && seismicSoilForce > 0 ? seismicSoilMoment / seismicSoilForce : 0;
      const seismicResistance = i.mu * i.verticalLoad + i.effectivePassive;
      const seismicFsSlide = seismicValid && seismicTotalForce > 0 ? seismicResistance / seismicTotalForce : Infinity;
      const seismicFsOver = seismicValid && seismicOverMoment > 0 ? (i.verticalLoad * i.baseB / 2) / seismicOverMoment : Infinity;
      const seismicSlideOk = seismicValid && seismicFsSlide >= i.fsSlideReqSeismic;
      const seismicOverOk = seismicValid && seismicFsOver >= i.fsOverReqSeismic;
      seismic = {
        valid: seismicValid,
        reason: mo.reason,
        psiDeg: Number.isFinite(psi) ? psi * 180 / Math.PI : Infinity,
        Kae: mo.Kae,
        seismicSoilForce,
        deltaPae,
        seismicSoilHeight,
        seismicTotalForce,
        seismicOverMoment,
        seismicFsSlide,
        seismicFsOver,
        fsSlideReqSeismic: i.fsSlideReqSeismic,
        fsOverReqSeismic: i.fsOverReqSeismic,
        seismicSlideOk,
        seismicOverOk
      };
    }

    const slideResistance = i.mu * i.verticalLoad + i.effectivePassive;
    const fsSlide = totalForce > 0 ? slideResistance / totalForce : Infinity;
    const slideOk = fsSlide >= i.fsSlideReq;
    const resistingMoment = i.verticalLoad * i.baseB / 2;
    const fsOver = overturningMoment > 0 ? resistingMoment / overturningMoment : Infinity;
    const overOk = fsOver >= i.fsOverReq;

    const e = i.verticalLoad > 0 ? overturningMoment / i.verticalLoad : Infinity;
    const kernLimit = i.baseB / 6;
    const qAvg = i.verticalLoad / i.baseB;
    const qmax = qAvg * (1 + 6 * e / i.baseB);
    const qmin = qAvg * (1 - 6 * e / i.baseB);
    const kernUtil = i.baseB > 0 ? e / i.baseB : Infinity;
    const fullContact = qmin >= -1e-9 && e <= kernLimit + 1e-9;
    const bearingOk = fullContact && qmax <= i.qa;
    const seismicOk = !i.seismicEnable || Boolean(seismic && seismic.valid && seismic.seismicSlideOk && seismic.seismicOverOk);
    const overallOk = bearingOk && slideOk && overOk && seismicOk;
    const bearingUtilization = i.qa > 0 ? qmax / i.qa : Infinity;
    const slidingUtilization = Number.isFinite(fsSlide) && fsSlide > 0 ? i.fsSlideReq / fsSlide : Infinity;
    const overturningUtilization = Number.isFinite(fsOver) && fsOver > 0 ? i.fsOverReq / fsOver : Infinity;
    const controllingItems = [
      { key: 'bearing', label: '基底承壓', utilization: bearingUtilization, passed: bearingOk },
      { key: 'sliding', label: '抗滑', utilization: slidingUtilization, passed: slideOk },
      { key: 'overturning', label: '抗傾覆', utilization: overturningUtilization, passed: overOk }
    ].sort(function (a, b) { return b.utilization - a.utilization; });
    const controllingItem = controllingItems[0];
    const baseWidthHeightRatio = i.H > 0 ? i.baseB / i.H : Infinity;
    const wallTypeOutput = i.wallType === 'gravity'
      ? {
        headline: '重力式工作輸出',
        focus: '以牆體自重、基底寬度與偏心控制整體穩定。',
        primaryResult: `控制項：${controllingItem.label}；B/H = ${formatNumber(baseWidthHeightRatio, 2)}`,
        outputGroups: [
          { label: '自重與抗傾覆', detail: `V = ${formatNumber(i.verticalLoad, 2)} tf/m；Mr = ${formatNumber(resistingMoment, 2)} tf·m/m；FSover = ${formatNumber(fsOver, 2)}` },
          { label: '抗滑與承壓', detail: `FSslide = ${formatNumber(fsSlide, 2)}；qmax = ${formatNumber(qmax, 2)} tf/m2；qmin = ${formatNumber(qmin, 2)} tf/m2` },
          { label: '重力式後續檢核', detail: '應補斷面塊體自重、趾踵接觸壓、牆身壓應力與局部剪壓檢核。' }
        ]
      }
      : {
        headline: '懸臂式工作輸出',
        focus: '以土壓、底版反力與牆身 / 趾版 / 踵版構件設計銜接為主。',
        primaryResult: `控制項：${controllingItem.label}；作用高 = ${formatNumber(resultantHeight, 2)} m`,
        outputGroups: [
          { label: '整體穩定', detail: `FSover = ${formatNumber(fsOver, 2)}；FSslide = ${formatNumber(fsSlide, 2)}；qmax = ${formatNumber(qmax, 2)} tf/m2` },
          { label: '底版反力', detail: `e = ${formatNumber(e, 3)} m；B/6 = ${formatNumber(kernLimit, 3)} m；qmin = ${formatNumber(qmin, 2)} tf/m2` },
          { label: '懸臂式後續檢核', detail: '應補牆身、趾版、踵版之彎矩、剪力與 RC 配筋檢核。' }
        ]
      };
    const summary = {
      status: overallOk ? 'pass' : 'fail',
      headline: overallOk ? '土壓局部穩定初估通過' : '土壓或穩定條件需修正 / 詳算',
      primaryMetrics: [
        { key: 'K', label: '土壓係數', value: K, unit: '' },
        { key: 'totalForce', label: '側向合力', value: totalForce, unit: 'tf/m' },
        { key: 'fsSlide', label: '抗滑 FS', value: fsSlide, unit: '' },
        { key: 'fsOver', label: '抗傾覆 FS', value: fsOver, unit: '' }
      ]
    };
    const checks = [
      checkItem('full-contact', '基底全壓縮', fullContact, `e = ${e}, kernLimit = ${kernLimit}`, e, kernLimit, 'm'),
      checkItem('bearing', '容許基底壓', bearingOk, `qmax = ${qmax}, qa = ${i.qa}`, qmax, i.qa, 'tf/m2'),
      checkItem('sliding', '抗滑', slideOk, `fsSlide = ${fsSlide}, fsSlideReq = ${i.fsSlideReq}, effectivePassive = ${i.effectivePassive}`, fsSlide, i.fsSlideReq, ''),
      checkItem('overturning', '抗傾覆', overOk, `fsOver = ${fsOver}, fsOverReq = ${i.fsOverReq}`, fsOver, i.fsOverReq, '')
    ];
    if (i.seismicEnable) {
      if (seismic && seismic.valid) {
        checks.push(checkItem('seismic-sliding', '地震時抗滑 (M-O)', seismic.seismicSlideOk, `fsSlide = ${seismic.seismicFsSlide}, req = ${seismic.fsSlideReqSeismic}`, seismic.seismicFsSlide, seismic.fsSlideReqSeismic, ''));
        checks.push(checkItem('seismic-overturning', '地震時抗傾覆 (M-O)', seismic.seismicOverOk, `fsOver = ${seismic.seismicFsOver}, req = ${seismic.fsOverReqSeismic}`, seismic.seismicFsOver, seismic.fsOverReqSeismic, ''));
      } else {
        checks.push(checkItem('seismic-validity', '地震時主動土壓可解性', false, seismic ? seismic.reason : 'Mononobe-Okabe 解不成立', 0, 0, ''));
      }
    }

    return Object.assign({}, i, {
      pressureTheoryLabel: PRESSURE_THEORY_LABELS[i.pressureTheory],
      theoryLabel,
      theoryNote,
      useCoulomb,
      coulombValid,
      effectiveSoilCoef,
      coulombKa: useCoulomb && coulomb ? coulomb.Ka : null,
      horizontalFactor,
      seismic,
      useLayered,
      layered,
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
      phiRad,
      sinPhi,
      Ka,
      K0,
      K,
      modeLabel,
      designReferenceLabel: DESIGN_REFERENCE_LABELS[i.designReference],
      wallTypeLabel: WALL_TYPE_LABELS[i.wallType],
      wallConditionLabel: WALL_CONDITION_LABELS[i.wallCondition],
      waterModelLabel: WATER_MODEL_LABELS[i.waterModel],
      passiveModeLabel: PASSIVE_MODE_LABELS[i.passiveMode],
      backfillModelLabel,
      selectedModeReason,
      soilForce,
      soilMoment,
      surchargeForce,
      surchargeMoment,
      waterForce,
      waterMoment,
      totalForce,
      overturningMoment,
      resultantHeight,
      slideResistance,
      fsSlide,
      slideOk,
      resistingMoment,
      fsOver,
      overOk,
      e,
      kernLimit,
      qAvg,
      qmax,
      qmin,
      kernUtil,
      bearingUtilization,
      slidingUtilization,
      overturningUtilization,
      controllingItems,
      controllingItem,
      baseWidthHeightRatio,
      fullContact,
      bearingOk,
      overallOk,
      wallTypeOutput,
      summary,
      checks,
      provenance: provenance()
    });
  }

  return {
    version: CORE_VERSION,
    inputSchemaVersion: INPUT_SCHEMA_VERSION,
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    logicSignature: LOGIC_SIGNATURE,
    pressureTheoryLabels: PRESSURE_THEORY_LABELS,
    coulombActiveKa,
    mononobeOkabeKae,
    computeLayeredActive,
    soilTypeLabels: SOIL_TYPE_LABELS,
    provenance,
    normalizeInput,
    validateInput,
    calculate
  };
});
