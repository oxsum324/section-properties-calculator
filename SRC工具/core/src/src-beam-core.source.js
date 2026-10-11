/* SRC beam calculation core
 *
 * Scope: fully encased, rectangular SRC beam with a centered doubly-symmetric
 * H-shape, flexure without axial force, vertical stirrups, normal-weight
 * monolithic concrete, and non-seismic member-strength checks.
 *
 * Units: cm, cm2, cm3, kgf/cm2, tf, tf-m.
 */
(function initSrcBeamCore(globalObject, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (globalObject) globalObject.SrcBeamCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildSrcBeamCore() {
  'use strict';

  const CORE_VERSION = 'src-beam.core.v0.1.0';
  const INPUT_SCHEMA = 'src-beam.input.v1';
  const REGULATION_PROFILE = Object.freeze({
    id: 'tw-src-2011',
    title: '鋼骨鋼筋混凝土構造設計規範與解說',
    versionLabel: '100 年修正版（100 年 7 月 1 日施行）',
    officialPage: 'https://www.nlma.gov.tw/ch/legislation/regsearch/977',
    chapter3Url: 'https://www.nlma.gov.tw/uploads/files/bb28d35b9a579aa2352ddac6b4cdc35e.pdf',
    chapter5Url: 'https://www.nlma.gov.tw/uploads/files/1f2700a836544dafdc81c7a1130158c5.pdf',
    clauses: Object.freeze({
      compactness: '3.4 / 表 3.4-1',
      stiffness: '3.5',
      generalRequirements: '5.3',
      flexuralSuperposition: '5.4.1 / 式 (5.4-1)',
      shearAllocation: '5.5 / 式 (5.5-1)~(5.5-2)',
      steelShear: '5.5.1 / 式 (5.5-3)',
      rcGeneralShear: '5.5.2 / 式 (5.5-4)~(5.5-7)',
      rcShearFriction: '5.5.2 / 式 (5.5-10)~(5.5-13)',
      seismic: '第 9 章',
    }),
    draftBoundary: '2024 年研究成果為修正草案，未作為本核心的正式規範來源。',
  });

  const PHI = Object.freeze({ flexuralSteel: 0.9, flexuralRc: 0.9, shearSteel: 0.9, shearRc: 0.75 });
  const DEFAULT_ES_KGF_CM2 = 2_100_000;
  const FORCE_TOLERANCE = 1e-9;

  class SrcBeamInputError extends Error {
    constructor(issues) {
      super(issues.map(issue => issue.message).join('；'));
      this.name = 'SrcBeamInputError';
      this.issues = issues;
    }
  }

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function positive(value) {
    const number = finiteNumber(value);
    return number != null && number > 0 ? number : null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function nearlyEqual(a, b, tolerance = 1e-9) {
    return Math.abs(a - b) <= tolerance;
  }

  function beta1ForConcrete(fcKgfCm2) {
    if (fcKgfCm2 <= 280) return 0.85;
    return Math.max(0.65, 0.85 - 0.05 * ((fcKgfCm2 - 280) / 70));
  }

  function issue(code, path, message, level = 'blocked') {
    return { code, path, message, level };
  }

  function validateInput(input) {
    const issues = [];
    const reviews = [];
    const addBlocked = (code, path, message) => issues.push(issue(code, path, message, 'blocked'));
    const addReview = (code, path, message) => reviews.push(issue(code, path, message, 'review'));
    const concrete = input?.concrete || {};
    const reinforcement = input?.reinforcement || {};
    const steel = input?.steel || {};
    const detailing = input?.detailing || {};
    const demands = input?.demands || {};
    const shearFriction = input?.shearFriction || {};

    if (input?.schema !== INPUT_SCHEMA) {
      addBlocked('unsupported-input-schema', 'schema', `僅接受 ${INPUT_SCHEMA}，不得以未知版本輸入直接計算。`);
    }

    const requiredPositive = [
      ['concrete.bCm', concrete.bCm],
      ['concrete.hCm', concrete.hCm],
      ['concrete.fcKgfCm2', concrete.fcKgfCm2],
      ['concrete.flexureDepthCm', concrete.flexureDepthCm],
      ['concrete.compressionSteelDepthCm', concrete.compressionSteelDepthCm],
      ['concrete.shearDepthCm', concrete.shearDepthCm],
      ['reinforcement.asTensionCm2', reinforcement.asTensionCm2],
      ['reinforcement.fyrTensionKgfCm2', reinforcement.fyrTensionKgfCm2],
      ['reinforcement.avCm2', reinforcement.avCm2],
      ['reinforcement.spacingCm', reinforcement.spacingCm],
      ['reinforcement.fyhKgfCm2', reinforcement.fyhKgfCm2],
      ['steel.depthCm', steel.depthCm],
      ['steel.flangeWidthCm', steel.flangeWidthCm],
      ['steel.flangeThicknessCm', steel.flangeThicknessCm],
      ['steel.webThicknessCm', steel.webThicknessCm],
      ['steel.zCm3', steel.zCm3],
      ['steel.fysKgfCm2', steel.fysKgfCm2],
      ['steel.fywKgfCm2', steel.fywKgfCm2],
    ];
    requiredPositive.forEach(([path, value]) => {
      if (positive(value) == null) addBlocked('positive-number-required', path, `${path} 必須為大於 0 的有限數值。`);
    });

    const asCompression = finiteNumber(reinforcement.asCompressionCm2);
    if (asCompression == null || asCompression < 0) {
      addBlocked('nonnegative-number-required', 'reinforcement.asCompressionCm2', 'reinforcement.asCompressionCm2 必須為大於或等於 0 的有限數值。');
    }
    if (asCompression > 0 && positive(reinforcement.fyrCompressionKgfCm2) == null) {
      addBlocked('positive-number-required', 'reinforcement.fyrCompressionKgfCm2', '配置壓力筋時，reinforcement.fyrCompressionKgfCm2 必須為大於 0 的有限數值。');
    }

    const mu = finiteNumber(shearFriction.mu);
    const k1 = finiteNumber(shearFriction.k1KgfCm2);
    const studContribution = finiteNumber(shearFriction.studContributionTf);
    const muValue = mu == null ? 0.8 : mu;
    const k1Value = k1 == null ? 28 : k1;
    const studValue = studContribution == null ? 0 : studContribution;
    if (!nearlyEqual(muValue, 0.8)) addBlocked('unsupported-shear-friction-mu', 'shearFriction.mu', '第一版核心僅支援常重混凝土整體澆置之 μ=0.8。');
    if (!nearlyEqual(k1Value, 28)) addBlocked('unsupported-shear-friction-k1', 'shearFriction.k1KgfCm2', '第一版核心僅支援常重混凝土 K1=28 kgf/cm²。');
    if (!nearlyEqual(studValue, 0)) addBlocked('unsupported-shear-stud-contribution', 'shearFriction.studContributionTf', '剪力釘貢獻尚未納入核心，Vns′ 必須為 0。');
    if (detailing.normalWeightConcrete !== true) addBlocked('normal-weight-concrete-not-confirmed', 'detailing.normalWeightConcrete', '第一版剪力摩擦係數僅適用已確認之常重混凝土。');
    if (detailing.monolithicShearFrictionSurface !== true) addBlocked('monolithic-surface-not-confirmed', 'detailing.monolithicShearFrictionSurface', '第一版剪力摩擦係數僅適用已確認之整體澆置接觸面。');

    const b = positive(concrete.bCm);
    const h = positive(concrete.hCm);
    const dFlexure = positive(concrete.flexureDepthCm);
    const dCompression = positive(concrete.compressionSteelDepthCm);
    const dShear = positive(concrete.shearDepthCm);
    const steelDepth = positive(steel.depthCm);
    const flangeWidth = positive(steel.flangeWidthCm);
    const flangeThickness = positive(steel.flangeThicknessCm);
    const webThickness = positive(steel.webThicknessCm);
    if (h && dFlexure && dFlexure >= h) addBlocked('invalid-flexure-depth', 'concrete.flexureDepthCm', '擘曲有效深度必須小於全斷面深度。');
    if (dFlexure && dCompression && dCompression >= dFlexure) addBlocked('invalid-compression-steel-depth', 'concrete.compressionSteelDepthCm', '壓力筋深度必須小於拉力筋有效深度。');
    if (h && dShear && dShear >= h) addBlocked('invalid-shear-depth', 'concrete.shearDepthCm', '剪力有效深度必須小於全斷面深度。');
    if (h && steelDepth && steelDepth >= h) addBlocked('steel-not-encased-depth', 'steel.depthCm', '鋼骨深度必須小於 SRC 梁全斷面深度。');
    if (b && flangeWidth && flangeWidth >= b) addBlocked('steel-not-encased-width', 'steel.flangeWidthCm', '鋼骨翼板寬度必須小於 SRC 梁全斷面寬度。');
    if (steelDepth && flangeThickness && 2 * flangeThickness >= steelDepth) addBlocked('invalid-steel-web-depth', 'steel.flangeThicknessCm', '鋼骨翼板厚度導致腹板淨高不大於 0。');
    if (flangeWidth && webThickness && webThickness >= flangeWidth) addBlocked('invalid-steel-web-thickness', 'steel.webThicknessCm', '鋼骨腹板厚度必須小於翼板寬度。');

    const fc = positive(concrete.fcKgfCm2);
    const fys = positive(steel.fysKgfCm2);
    const fyrTension = positive(reinforcement.fyrTensionKgfCm2);
    const fyrCompression = asCompression > 0 ? positive(reinforcement.fyrCompressionKgfCm2) : null;
    if (fc && fc < 210) addBlocked('concrete-strength-below-scope', 'concrete.fcKgfCm2', '第 5.3 節規定 fc′ 不宜小於 210 kgf/cm²。');
    if (fc && fc > 420) {
      if (detailing.highStrengthConcreteEvidenceConfirmed !== true) {
        addBlocked('high-strength-concrete-evidence-missing', 'detailing.highStrengthConcreteEvidenceConfirmed', 'fc′ 大於 420 kgf/cm² 時，第 5.3 節要求以公認合理試驗證明可行性與可靠度。');
      } else {
        addReview('high-strength-concrete-evidence-review', 'detailing.highStrengthConcreteEvidenceConfirmed', '高強度混凝土試驗依據需列入專案人工複核。');
      }
    }
    const steelOrRebarAboveRecommended = (fys && fys > 3520) || (fyrTension && fyrTension > 5600) || (fyrCompression && fyrCompression > 5600);
    if (steelOrRebarAboveRecommended) {
      if (detailing.highStrengthMaterialEvidenceConfirmed !== true) {
        addBlocked('high-strength-material-evidence-missing', 'detailing.highStrengthMaterialEvidenceConfirmed', '鋼骨 Fys>3520 或鋼筋 Fyr>5600 kgf/cm² 超出第 5.3 節建議範圍，需要可靠性依據。');
      } else {
        addReview('high-strength-material-evidence-review', 'detailing.highStrengthMaterialEvidenceConfirmed', '高強度鋼材依據需列入專案人工複核。');
      }
    }

    if (detailing.fullyEncased !== true) addBlocked('not-fully-encased', 'detailing.fullyEncased', '第一版核心僅適用鋼骨完全包覆於鋼筋混凝土內之 SRC 梁。');
    if (detailing.mainBarsContinuous !== true) addBlocked('main-bars-not-continuous', 'detailing.mainBarsContinuous', '第 5.4 節規定未連續通過或未適當錨定之梁端主筋不得計入 Mnrc。');
    const clearSpacing = finiteNumber(detailing.longitudinalClearSpacingMm);
    if (clearSpacing == null || clearSpacing < 25) addBlocked('longitudinal-clear-spacing', 'detailing.longitudinalClearSpacingMm', '長向主筋與鋼板淨距應至少 25 mm。');
    if (detailing.reinforcementDetailingConfirmed !== true) addReview('reinforcement-detailing-review', 'detailing.reinforcementDetailingConfirmed', '第 4.3~4.6 節之配筋、保護層與澆置可行性尚待設計圖複核。');
    if (detailing.temporaryShoringProvided !== true && detailing.steelConstructionCapacityVerified !== true) {
      addReview('construction-stage-review', 'detailing.steelConstructionCapacityVerified', '未提供充分臨時支撐時，須另案確認鋼梁可承受混凝土凝固前全部靜載重。');
    }
    if (detailing.seismicDesign === true) addBlocked('seismic-scope-not-implemented', 'detailing.seismicDesign', '耐震 SRC 梁尚須符合第 9 章，不得僅以本構材強度核心作通過判定。');
    if (Math.abs(finiteNumber(demands.puTf) || 0) > FORCE_TOLERANCE) addBlocked('axial-force-outside-scope', 'demands.puTf', '本核心僅適用無軸力之 SRC 梁；P-M 互制應使用第 7 章專用核心。');
    if (finiteNumber(demands.muTfM) == null) addBlocked('finite-demand-required', 'demands.muTfM', 'Mu 必須為有限數值。');
    if (finiteNumber(demands.vuTf) == null) addBlocked('finite-demand-required', 'demands.vuTf', 'Vu 必須為有限數值。');

    return { blocked: issues, review: reviews };
  }

  function solveRcFlexure(input) {
    const concrete = input.concrete;
    const reinforcement = input.reinforcement;
    const b = Number(concrete.bCm);
    const h = Number(concrete.hCm);
    const fc = Number(concrete.fcKgfCm2);
    const d = Number(concrete.flexureDepthCm);
    const dPrime = Number(concrete.compressionSteelDepthCm);
    const asTension = Number(reinforcement.asTensionCm2);
    const asCompression = Number(reinforcement.asCompressionCm2);
    const fyTension = Number(reinforcement.fyrTensionKgfCm2);
    const fyCompression = Number(reinforcement.fyrCompressionKgfCm2);
    const es = positive(reinforcement.esKgfCm2) || DEFAULT_ES_KGF_CM2;
    const beta1 = beta1ForConcrete(fc);

    function steelResponse(area, depth, fy, c) {
      if (area === 0) return { strain: 0, stress: 0, forceTf: 0 };
      const strain = 0.003 * ((c - depth) / c);
      const stress = clamp(es * strain, -fy, fy);
      return { strain, stress, forceTf: area * stress / 1000 };
    }

    function equilibrium(c) {
      const a = beta1 * c;
      const concreteForceTf = 0.85 * fc * b * a / 1000;
      const compressionSteel = steelResponse(asCompression, dPrime, fyCompression, c);
      const tensionSteel = steelResponse(asTension, d, fyTension, c);
      return {
        c,
        a,
        concreteForceTf,
        compressionSteel,
        tensionSteel,
        residualTf: concreteForceTf + compressionSteel.forceTf + tensionSteel.forceTf,
      };
    }

    let low = Math.max(1e-6, h * 1e-9);
    let high = h * 0.999999;
    let lowState = equilibrium(low);
    let highState = equilibrium(high);
    if (lowState.residualTf > 0 || highState.residualTf < 0) {
      throw new SrcBeamInputError([issue('rc-equilibrium-not-bracketed', 'reinforcement', '無法在斷面深度內找到 RC 內力平衡中性軸。')]);
    }
    let state = null;
    for (let iteration = 0; iteration < 160; iteration += 1) {
      const mid = (low + high) / 2;
      state = equilibrium(mid);
      if (Math.abs(state.residualTf) < 1e-10 || high - low < 1e-10) break;
      if (state.residualTf > 0) high = mid;
      else low = mid;
    }

    const concreteMomentTfM = state.concreteForceTf * (d - state.a / 2) / 100;
    const compressionSteelMomentTfM = state.compressionSteel.forceTf * (d - dPrime) / 100;
    const mnRcTfM = concreteMomentTfM + compressionSteelMomentTfM;
    if (!(mnRcTfM > 0)) {
      throw new SrcBeamInputError([issue('nonpositive-rc-moment', 'reinforcement', 'RC 部分標稱彎矩強度不大於 0。')]);
    }
    return {
      beta1,
      neutralAxisCm: state.c,
      stressBlockDepthCm: state.a,
      concreteForceTf: state.concreteForceTf,
      compressionSteel: state.compressionSteel,
      tensionSteel: state.tensionSteel,
      concreteMomentTfM,
      compressionSteelMomentTfM,
      mnRcTfM,
      equilibriumResidualTf: state.residualTf,
    };
  }

  function calculateCompactness(input) {
    const steel = input.steel;
    const grade = String(steel.grade || '').toUpperCase();
    const isGrade400 = ['SS400', 'SM400', 'SN400', 'A36', '400'].includes(grade);
    const isGrade490 = ['SS490', 'SM490', 'SN490', 'A572GR50', 'A572 GR.50', '490'].includes(grade);
    if (!isGrade400 && !isGrade490) {
      throw new SrcBeamInputError([issue('unsupported-steel-grade', 'steel.grade', '鋼骨寬厚比目前僅支援表 3.4-1 之 400 級或 490 級鋼材。')]);
    }
    const seismic = input.detailing.seismicDesign === true;
    const fysTfCm2 = Number(steel.fysKgfCm2) / 1000;
    const flangeRatio = (Number(steel.flangeWidthCm) / 2) / Number(steel.flangeThicknessCm);
    const clearWebDepthCm = Number(steel.depthCm) - 2 * Number(steel.flangeThicknessCm);
    const webRatio = clearWebDepthCm / Number(steel.webThicknessCm);
    const flangeLimit = seismic ? 21 / Math.sqrt(fysTfCm2) : (isGrade400 ? 23 : 20);
    const webLimit = seismic ? 138 / Math.sqrt(fysTfCm2) : (isGrade400 ? 107 : 91);
    return {
      mode: seismic ? 'seismic-lambda-pd' : 'general-lambda-p',
      gradeGroup: isGrade400 ? '400' : '490',
      flangeRatio,
      flangeLimit,
      flangeOk: flangeRatio <= flangeLimit + 1e-12,
      clearWebDepthCm,
      webRatio,
      webLimit,
      webOk: webRatio <= webLimit + 1e-12,
    };
  }

  function calculateShear(input, mnSteelTfM, mnRcTfM) {
    const concrete = input.concrete;
    const reinforcement = input.reinforcement;
    const steel = input.steel;
    const shearFriction = input.shearFriction || {};
    const b = Number(concrete.bCm);
    const d = Number(concrete.shearDepthCm);
    const fc = Number(concrete.fcKgfCm2);
    const av = Number(reinforcement.avCm2);
    const avf = positive(reinforcement.avfCm2) || av;
    const fyh = Number(reinforcement.fyhKgfCm2);
    const spacing = Number(reinforcement.spacingCm);
    const mu = finiteNumber(shearFriction.mu) == null ? 0.8 : Number(shearFriction.mu);
    const k1 = finiteNumber(shearFriction.k1KgfCm2) == null ? 28 : Number(shearFriction.k1KgfCm2);
    const studContributionTf = finiteNumber(shearFriction.studContributionTf) || 0;

    const steelWebAreaCm2 = Number(steel.webThicknessCm) * Number(steel.depthCm);
    const vnSteelTf = 0.6 * Number(steel.fywKgfCm2) * steelWebAreaCm2 / 1000;
    const stirrupRawTf = av * fyh * d / spacing / 1000;
    const stirrupCapTf = 2.12 * Math.sqrt(fc) * b * d / 1000;
    const vnrTf = Math.min(stirrupRawTf, stirrupCapTf);
    const vncTf = 0.53 * Math.sqrt(fc) * b * d / 1000;
    const vnRcGeneralTf = vnrTf + vncTf;

    const frictionStirrupRawTf = mu * avf * fyh * d / spacing / 1000;
    const frictionStirrupCapTf = 2.12 * Math.sqrt(fc) * b * d * mu / 1000;
    const vnrFrictionTf = Math.min(frictionStirrupRawTf, frictionStirrupCapTf);
    const netConcreteWidthCm = b - Number(steel.flangeWidthCm);
    const vncFrictionTf = k1 * netConcreteWidthCm * d / 1000;
    const vnRcFrictionTf = vnrFrictionTf + vncFrictionTf + studContributionTf;
    const vnRcTf = Math.min(vnRcGeneralTf, vnRcFrictionTf);
    const rcControlMode = vnRcGeneralTf <= vnRcFrictionTf ? 'general-shear' : 'shear-friction';

    const mnTotalTfM = mnSteelTfM + mnRcTfM;
    const steelDemandShare = mnSteelTfM / mnTotalTfM;
    const rcDemandShare = mnRcTfM / mnTotalTfM;
    const vu = Math.abs(Number(input.demands.vuTf));
    const steelDemandTf = steelDemandShare * vu;
    const rcDemandTf = rcDemandShare * vu;
    const phiVnSteelTf = PHI.shearSteel * vnSteelTf;
    const phiVnRcTf = PHI.shearRc * vnRcTf;
    return {
      steelWebAreaCm2,
      vnSteelTf,
      phiVnSteelTf,
      stirrupRawTf,
      stirrupCapTf,
      vnrTf,
      vncTf,
      vnRcGeneralTf,
      frictionStirrupRawTf,
      frictionStirrupCapTf,
      vnrFrictionTf,
      netConcreteWidthCm,
      vncFrictionTf,
      studContributionTf,
      vnRcFrictionTf,
      vnRcTf,
      phiVnRcTf,
      rcControlMode,
      nominalSumTf: vnSteelTf + vnRcTf,
      steelDemandShare,
      rcDemandShare,
      steelDemandTf,
      rcDemandTf,
      steelUtilization: phiVnSteelTf > 0 ? steelDemandTf / phiVnSteelTf : Infinity,
      rcUtilization: phiVnRcTf > 0 ? rcDemandTf / phiVnRcTf : Infinity,
    };
  }

  function calculate(input) {
    const validation = validateInput(input);
    if (validation.blocked.length) throw new SrcBeamInputError(validation.blocked);
    const compactness = calculateCompactness(input);
    const rcFlexure = solveRcFlexure(input);
    const mnSteelTfM = Number(input.steel.zCm3) * Number(input.steel.fysKgfCm2) / 100000;
    const mnRcTfM = rcFlexure.mnRcTfM;
    const nominalMomentTfM = mnSteelTfM + mnRcTfM;
    const phiMnSteelTfM = PHI.flexuralSteel * mnSteelTfM;
    const phiMnRcTfM = PHI.flexuralRc * mnRcTfM;
    const designMomentTfM = phiMnSteelTfM + phiMnRcTfM;
    const muTfM = Math.abs(Number(input.demands.muTfM));
    const flexuralUtilization = designMomentTfM > 0 ? muTfM / designMomentTfM : Infinity;
    const shear = calculateShear(input, mnSteelTfM, mnRcTfM);
    const checks = {
      flangeCompactness: compactness.flangeOk,
      webCompactness: compactness.webOk,
      flexure: flexuralUtilization <= 1 + 1e-12,
      steelShearShare: shear.steelUtilization <= 1 + 1e-12,
      rcShearShare: shear.rcUtilization <= 1 + 1e-12,
    };
    const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key);
    const status = failedChecks.length ? 'NG' : (validation.review.length ? 'REVIEW' : 'OK');
    return {
      schema: INPUT_SCHEMA,
      coreVersion: CORE_VERSION,
      regulation: REGULATION_PROFILE,
      phi: PHI,
      status,
      reviewItems: validation.review,
      failedChecks,
      checks,
      compactness,
      flexure: {
        ...rcFlexure,
        mnSteelTfM,
        mnRcTfM,
        nominalMomentTfM,
        phiMnSteelTfM,
        phiMnRcTfM,
        designMomentTfM,
        demandTfM: muTfM,
        utilization: flexuralUtilization,
      },
      shear,
      governingUtilization: Math.max(flexuralUtilization, shear.steelUtilization, shear.rcUtilization),
    };
  }

  return Object.freeze({
    CORE_VERSION,
    INPUT_SCHEMA,
    REGULATION_PROFILE,
    PHI,
    SrcBeamInputError,
    beta1ForConcrete,
    validateInput,
    solveRcFlexure,
    calculateCompactness,
    calculateShear,
    calculate,
  });
});
