/* SRC column research calculation core
 *
 * Scope: fully encased rectangular SRC column with a centered doubly-symmetric
 * H-shape, compression plus uniaxial x-axis bending, tied longitudinal
 * reinforcement, and second-order demand supplied by the project analysis.
 *
 * This core is deliberately not a public/formal tool yet. It implements the
 * strength-allocation path needed to reproduce the official MOI SRC design
 * guide example and automatically checks H-shape compactness. Shear, joint,
 * base, construction detailing, and seismic design remain outside the
 * automatic OK boundary.
 *
 * Units: cm, cm2, cm3, cm4, kgf/cm2, tf, tf-m.
 */
(function initSrcColumnCore(globalObject, factory) {
  const pmSection = typeof module === 'object' && module.exports
    ? require('../../鋼筋混凝土/shared/pmsection.js')
    : globalObject && globalObject.PMSection;
  const api = factory(pmSection);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (globalObject) globalObject.SrcColumnCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildSrcColumnCore(PMSection) {
  'use strict';

  const CORE_VERSION = 'src-column.core.v0.2.0-research';
  const INPUT_SCHEMA = 'src-column.input.v2';
  const RELEASE_STATUS = 'research-core-not-public';
  const REGULATION_PROFILE = Object.freeze({
    id: 'tw-src-2011',
    title: '鋼骨鋼筋混凝土構造設計規範與解說',
    versionLabel: '100 年修正版（100 年 7 月 1 日施行）',
    officialPage: 'https://www.nlma.gov.tw/ch/legislation/regsearch/977',
    chapter3Url: 'https://www.nlma.gov.tw/uploads/files/bb28d35b9a579aa2352ddac6b4cdc35e.pdf',
    chapter6Url: 'https://www.nlma.gov.tw/uploads/files/c0ec0fcd843b9fc64ed10865c5f03741.pdf',
    chapter7Url: 'https://www.nlma.gov.tw/uploads/files/de33d9841890f8f82630e6bb88f3acd2.pdf',
    officialGuidePage: 'https://www.abri.gov.tw/News_Content_Table.aspx?n=807&s=38030',
    clauses: Object.freeze({
      compactness: '3.4 / 表 3.4-2',
      steelCompression: '6.4.2 / 式 (6.4-2)~(6.4-5)',
      forceAllocation: '7.3.1 / 式 (7.3-3)~(7.3-6)',
      steelInteraction: '7.3.2 / 式 (7.3-7)~(7.3-8)',
      redistribution: '7.3.2 / 式 (7.3-9)~(7.3-10)',
      secondOrder: '7.4 / 式 (7.4-1)~(7.4-7)',
    }),
    draftBoundary: '2024 年研究成果為修正草案，未作為本核心的正式規範來源。',
  });

  const PHI = Object.freeze({ steelCompression: 0.85, steelFlexure: 0.9, rcTiedCompression: 0.65, rcFlexure: 0.9 });
  const DEFAULT_ES_KGF_CM2 = 2_040_000;
  const ZERO_TOLERANCE = 1e-9;

  class SrcColumnInputError extends Error {
    constructor(issues) {
      super(issues.map(item => item.message).join('；'));
      this.name = 'SrcColumnInputError';
      this.issues = issues;
    }
  }

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function positive(value) {
    const number = finite(value);
    return number != null && number > 0 ? number : null;
  }

  function issue(code, path, message, level) {
    return { code, path, message, level: level || 'blocked' };
  }

  function steelGradeGroup(value) {
    const grade = String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (['SS400', 'SM400', 'SN400', 'A36', '400'].includes(grade)) return '400';
    if (['SS490', 'SM490', 'SN490', 'A572GR50', 'A572 GR.50', 'A572 GR50', '490'].includes(grade)) return '490';
    return null;
  }

  function validateInput(input) {
    const blocked = [];
    const review = [];
    const addBlocked = (code, path, message) => blocked.push(issue(code, path, message, 'blocked'));
    const addReview = (code, path, message) => review.push(issue(code, path, message, 'review'));
    const concrete = input?.concrete || {};
    const reinforcement = input?.reinforcement || {};
    const steel = input?.steel || {};
    const member = input?.member || {};
    const demands = input?.demands || {};
    const detailing = input?.detailing || {};

    if (input?.schema !== INPUT_SCHEMA) {
      addBlocked('unsupported-input-schema', 'schema', `僅接受 ${INPUT_SCHEMA}，未知 schema 不得直接計算。`);
    }

    [
      ['concrete.widthCm', concrete.widthCm],
      ['concrete.depthCm', concrete.depthCm],
      ['concrete.fcKgfCm2', concrete.fcKgfCm2],
      ['reinforcement.fyKgfCm2', reinforcement.fyKgfCm2],
      ['steel.areaCm2', steel.areaCm2],
      ['steel.depthCm', steel.depthCm],
      ['steel.flangeWidthCm', steel.flangeWidthCm],
      ['steel.flangeThicknessCm', steel.flangeThicknessCm],
      ['steel.webThicknessCm', steel.webThicknessCm],
      ['steel.ixCm4', steel.ixCm4],
      ['steel.iyCm4', steel.iyCm4],
      ['steel.zxCm3', steel.zxCm3],
      ['steel.fysKgfCm2', steel.fysKgfCm2],
      ['member.lengthCm', member.lengthCm],
      ['member.kx', member.kx],
      ['member.ky', member.ky],
    ].forEach(([path, value]) => {
      if (positive(value) == null) addBlocked('positive-number-required', path, `${path} 必須為大於 0 的有限數值。`);
    });
    [
      ['concrete.ecKgfCm2', concrete.ecKgfCm2],
      ['reinforcement.esKgfCm2', reinforcement.esKgfCm2],
      ['steel.esKgfCm2', steel.esKgfCm2],
    ].forEach(([path, value]) => {
      if (value != null && positive(value) == null) addBlocked('invalid-optional-modulus', path, `${path} 若有提供，必須為大於 0 的有限數值。`);
    });

    const pu = finite(demands.puTf);
    const mux = finite(demands.muxTfM);
    const muy = finite(demands.muyTfM == null ? 0 : demands.muyTfM);
    if (pu == null || pu <= 0) addBlocked('compression-demand-required', 'demands.puTf', '第一版核心只接受正值軸壓需求 Pu。');
    if (mux == null) addBlocked('finite-demand-required', 'demands.muxTfM', 'Mux 必須為有限數值。');
    if (muy == null || Math.abs(muy) > ZERO_TOLERANCE) {
      addBlocked('biaxial-scope-not-implemented', 'demands.muyTfM', '雙向彎矩尚未納入第一版核心，Muy 必須為 0。');
    }
    if (detailing.secondOrderDemandIncluded !== true) {
      addBlocked('second-order-demand-not-confirmed', 'detailing.secondOrderDemandIncluded', '第 7.4 節 P-Δ 效應必須由專案分析納入需求彎矩後才可使用本核心。');
    }
    if (detailing.seismicDesign === true) {
      addBlocked('seismic-scope-not-implemented', 'detailing.seismicDesign', '第 9 章 SRC 耐震設計尚未納入，不得以本核心作通過判定。');
    }
    if (detailing.fullyEncased !== true) addBlocked('not-fully-encased', 'detailing.fullyEncased', '僅適用完全包覆型 SRC 柱。');
    if (detailing.centeredDoublySymmetricH !== true) addBlocked('unsupported-steel-shape', 'detailing.centeredDoublySymmetricH', '僅適用置中雙對稱 H 型鋼骨。');
    if (reinforcement.tieType !== 'tied') addBlocked('unsupported-tie-type', 'reinforcement.tieType', '第一版 RC 部分只支援橫箍筋柱。');

    const width = positive(concrete.widthCm);
    const depth = positive(concrete.depthCm);
    const steelDepth = positive(steel.depthCm);
    const steelWidth = positive(steel.flangeWidthCm);
    const flangeThickness = positive(steel.flangeThicknessCm);
    const webThickness = positive(steel.webThicknessCm);
    const steelArea = positive(steel.areaCm2);
    if (!steelGradeGroup(steel.grade)) {
      addBlocked('unsupported-steel-grade', 'steel.grade', '鋼骨寬厚比目前僅支援表 3.4-2 之 400 級或 490 級鋼材。');
    }
    if (width && steelWidth && steelWidth >= width) addBlocked('steel-not-encased-width', 'steel.flangeWidthCm', '鋼骨翼板寬度必須小於 SRC 柱寬度。');
    if (depth && steelDepth && steelDepth >= depth) addBlocked('steel-not-encased-depth', 'steel.depthCm', '鋼骨深度必須小於 SRC 柱深度。');
    if (steelDepth && flangeThickness && 2 * flangeThickness >= steelDepth) {
      addBlocked('invalid-h-section-flange-geometry', 'steel.flangeThicknessCm', 'H 型鋼骨兩片翼板總厚度必須小於鋼骨深度。');
    }
    if (steelWidth && webThickness && webThickness >= steelWidth) {
      addBlocked('invalid-h-section-web-geometry', 'steel.webThicknessCm', 'H 型鋼骨腹板厚度必須小於翼板寬度。');
    }
    if (width && depth && steelArea) {
      const steelRatio = steelArea / (width * depth);
      if (steelRatio < 0.02 - ZERO_TOLERANCE) addBlocked('steel-ratio-below-src-scope', 'steel.areaCm2', '第 6.3 節要求 SRC 柱鋼骨斷面積不得少於構材全斷面積的 2%。');
      if (steelRatio >= 1) addBlocked('invalid-steel-area', 'steel.areaCm2', '鋼骨斷面積必須小於 SRC 柱總斷面積。');
    }

    const fc = positive(concrete.fcKgfCm2);
    const fys = positive(steel.fysKgfCm2);
    const fyr = positive(reinforcement.fyKgfCm2);
    if (fc && fc < 210) addBlocked('concrete-strength-below-scope', 'concrete.fcKgfCm2', '第 6.3 節規定 fc\' 不宜小於 210 kgf/cm²。');
    if (fc && fc > 420 && detailing.highStrengthConcreteEvidenceConfirmed !== true) {
      addBlocked('high-strength-concrete-evidence-missing', 'detailing.highStrengthConcreteEvidenceConfirmed', 'fc\' 大於 420 kgf/cm² 時需有可靠性與施工品質依據。');
    }
    if (((fys && fys > 3520) || (fyr && fyr > 5600)) && detailing.highStrengthMaterialEvidenceConfirmed !== true) {
      addBlocked('high-strength-material-evidence-missing', 'detailing.highStrengthMaterialEvidenceConfirmed', '鋼骨 Fys>3520 或鋼筋 Fyr>5600 kgf/cm² 超出規範建議範圍，需有可靠性依據。');
    }

    const layers = Array.isArray(reinforcement.layers) ? reinforcement.layers : [];
    if (layers.length < 2) addBlocked('reinforcement-layers-required', 'reinforcement.layers', '單向 P-M 核心至少需要兩層正值主筋面積。');
    layers.forEach((layer, index) => {
      const y = finite(layer?.yCm);
      const area = positive(layer?.areaCm2);
      if (y == null || !depth || y <= 0 || y >= depth) addBlocked('invalid-reinforcement-depth', `reinforcement.layers[${index}].yCm`, '主筋層深度必須位於斷面內。');
      if (area == null) addBlocked('invalid-reinforcement-area', `reinforcement.layers[${index}].areaCm2`, '主筋層面積必須大於 0。');
    });
    if (width && depth && layers.length) {
      const ratio = layers.reduce((sum, layer) => sum + (positive(layer?.areaCm2) || 0), 0) / (width * depth);
      if (ratio < 0.01 - ZERO_TOLERANCE) addBlocked('longitudinal-ratio-below-scope', 'reinforcement.layers', 'RC 部分縱向主筋比不得小於 1%。');
      if (ratio > 0.08 + ZERO_TOLERANCE) addBlocked('longitudinal-ratio-above-scope', 'reinforcement.layers', '本核心排除耐震設計；非耐震 RC 柱縱向主筋比不得大於 8%。');
    }

    if (detailing.mainBarsContinuous !== true) addBlocked('main-bars-not-continuous', 'detailing.mainBarsContinuous', '未連續通過柱接頭或未適當錨定的主筋不得計入 RC 彎矩強度。');

    addReview('research-core-not-public', 'tool', 'SRC 柱目前只建立可審查核心，尚未登錄為公開或正式工具。');
    addReview('section-properties-not-derived', 'steel', 'A、Ix、Iy、Zx 仍採輸入或斷面表數值；尚未以型鋼資料庫與來源版次自動核對。');
    addReview('excluded-strength-paths', 'detailing', '柱剪力、柱腳、梁柱接頭、施工階段與耐震細節仍須另案檢核。');

    return { blocked, review };
  }

  function elasticModulusConcrete(fcKgfCm2) {
    return 15000 * Math.sqrt(fcKgfCm2);
  }

  function calculateCompactness(input) {
    const steel = input.steel || {};
    const gradeGroup = steelGradeGroup(steel.grade);
    if (!gradeGroup) {
      throw new SrcColumnInputError([
        issue('unsupported-steel-grade', 'steel.grade', '鋼骨寬厚比目前僅支援表 3.4-2 之 400 級或 490 級鋼材。'),
      ]);
    }
    const isGrade400 = gradeGroup === '400';
    const fysTfCm2 = Number(steel.fysKgfCm2) / 1000;
    const flangeRatio = (Number(steel.flangeWidthCm) / 2) / Number(steel.flangeThicknessCm);
    const clearWebDepthCm = Number(steel.depthCm) - 2 * Number(steel.flangeThicknessCm);
    const webRatio = clearWebDepthCm / Number(steel.webThicknessCm);
    const flangeGeneralLimit = isGrade400 ? 23 : 20;
    const webGeneralLimit = isGrade400 ? 96 : 81;
    const flangeSeismicLimit = 21 / Math.sqrt(fysTfCm2);
    const webSeismicLimit = 123 / Math.sqrt(fysTfCm2);
    return {
      governingMode: 'general-lambda-p',
      seismicDesignSupported: false,
      gradeGroup,
      flangeRatio,
      flangeGeneralLimit,
      flangeSeismicLimit,
      flangeOk: flangeRatio <= flangeGeneralLimit + ZERO_TOLERANCE,
      clearWebDepthCm,
      webRatio,
      webGeneralLimit,
      webSeismicLimit,
      webOk: webRatio <= webGeneralLimit + ZERO_TOLERANCE,
      ok: flangeRatio <= flangeGeneralLimit + ZERO_TOLERANCE
        && webRatio <= webGeneralLimit + ZERO_TOLERANCE,
    };
  }

  function steelCompressionAxis(input, axis) {
    const steel = input.steel;
    const concrete = input.concrete;
    const member = input.member;
    const area = Number(steel.areaCm2);
    const inertia = Number(axis === 'x' ? steel.ixCm4 : steel.iyCm4);
    const grossArea = Number(concrete.widthCm) * Number(concrete.depthCm);
    const grossInertia = axis === 'x'
      ? Number(concrete.widthCm) * Math.pow(Number(concrete.depthCm), 3) / 12
      : Number(concrete.depthCm) * Math.pow(Number(concrete.widthCm), 3) / 12;
    const steelRadiusCm = Math.sqrt(inertia / area);
    const grossRadiusCm = Math.sqrt(grossInertia / grossArea);
    const alpha = axis === 'x' ? 0.2 : 0.4;
    const effectiveRadiusCm = steelRadiusCm + alpha * grossRadiusCm;
    const k = Number(axis === 'x' ? member.kx : member.ky);
    const lambdaC = k * Number(member.lengthCm) / (Math.PI * effectiveRadiusCm)
      * Math.sqrt(Number(steel.fysKgfCm2) / (positive(steel.esKgfCm2) || DEFAULT_ES_KGF_CM2));
    const strengthFactor = lambdaC <= 1.5
      ? Math.exp(-0.419 * lambdaC * lambdaC)
      : 0.877 / (lambdaC * lambdaC);
    const nominalCompressionTf = strengthFactor * Number(steel.fysKgfCm2) * area / 1000;
    return {
      axis,
      alpha,
      steelRadiusCm,
      grossRadiusCm,
      effectiveRadiusCm,
      lambdaC,
      branch: lambdaC <= 1.5 ? 'inelastic' : 'elastic',
      strengthFactor,
      nominalCompressionTf,
    };
  }

  function steelInteraction(puTf, muxTfM, pnsTf, mnxTfM) {
    const axialRatio = puTf / (PHI.steelCompression * pnsTf);
    const momentRatio = Math.abs(muxTfM) / (PHI.steelFlexure * mnxTfM);
    const branch = axialRatio < 0.2 ? 'low-axial' : 'high-axial';
    const utilization = branch === 'low-axial'
      ? axialRatio / 2 + momentRatio
      : axialRatio + (8 / 9) * momentRatio;
    return { branch, axialRatio, momentRatio, utilization, ok: utilization <= 1 + ZERO_TOLERANCE };
  }

  function calculate(input) {
    if (!PMSection || typeof PMSection.curve !== 'function' || typeof PMSection.checkDemand !== 'function') {
      throw new Error('PMSection dependency is required for SRC column RC interaction checks.');
    }
    const validation = validateInput(input);
    if (validation.blocked.length) throw new SrcColumnInputError(validation.blocked);

    const concrete = input.concrete;
    const reinforcement = input.reinforcement;
    const steel = input.steel;
    const demands = input.demands;
    const detailing = input.detailing;
    const compactness = calculateCompactness(input);
    const width = Number(concrete.widthCm);
    const depth = Number(concrete.depthCm);
    const grossAreaCm2 = width * depth;
    const grossIxCm4 = width * Math.pow(depth, 3) / 12;
    const grossIyCm4 = depth * Math.pow(width, 3) / 12;
    const es = positive(steel.esKgfCm2) || DEFAULT_ES_KGF_CM2;
    const ec = positive(concrete.ecKgfCm2) || elasticModulusConcrete(Number(concrete.fcKgfCm2));
    const axialSteelRatio = es * Number(steel.areaCm2)
      / (es * Number(steel.areaCm2) + 0.55 * ec * grossAreaCm2);
    const momentSteelRatioX = es * Number(steel.ixCm4)
      / (es * Number(steel.ixCm4) + 0.35 * ec * grossIxCm4);
    const puTf = Number(demands.puTf);
    const muxTfM = Math.abs(Number(demands.muxTfM));
    const initialSteelDemands = {
      puTf: puTf * axialSteelRatio,
      muxTfM: muxTfM * momentSteelRatioX,
    };
    const initialRcDemands = {
      puTf: puTf - initialSteelDemands.puTf,
      muxTfM: muxTfM - initialSteelDemands.muxTfM,
    };

    const compressionX = steelCompressionAxis(input, 'x');
    const compressionY = steelCompressionAxis(input, 'y');
    const compressionControl = compressionX.nominalCompressionTf <= compressionY.nominalCompressionTf ? compressionX : compressionY;
    const mnxTfM = Number(steel.zxCm3) * Number(steel.fysKgfCm2) / 100000;
    const initialInteraction = steelInteraction(
      initialSteelDemands.puTf,
      initialSteelDemands.muxTfM,
      compressionControl.nominalCompressionTf,
      mnxTfM
    );

    let finalSteelDemands = { ...initialSteelDemands };
    let finalRcDemands = { ...initialRcDemands };
    let redistributionApplied = false;
    if (detailing.redistributeToSteelBoundary === true && initialInteraction.utilization > ZERO_TOLERANCE) {
      const beta = initialInteraction.utilization;
      finalSteelDemands = {
        puTf: initialSteelDemands.puTf / beta,
        muxTfM: initialSteelDemands.muxTfM / beta,
      };
      finalRcDemands = {
        puTf: puTf - finalSteelDemands.puTf,
        muxTfM: muxTfM - finalSteelDemands.muxTfM,
      };
      if (finalRcDemands.puTf < -ZERO_TOLERANCE || finalRcDemands.muxTfM < -ZERO_TOLERANCE) {
        throw new SrcColumnInputError([
          issue('redistribution-invalid-residual', 'detailing.redistributeToSteelBoundary', '式 (7.3-9)~(7.3-10) 重新分配後的 RC 殘餘需求不得變成反向負值。'),
        ]);
      }
      redistributionApplied = true;
    }
    const finalSteelInteraction = steelInteraction(
      finalSteelDemands.puTf,
      finalSteelDemands.muxTfM,
      compressionControl.nominalCompressionTf,
      mnxTfM
    );

    const rcSection = {
      b: width,
      h: depth,
      bars: reinforcement.layers.map(layer => ({ y: Number(layer.yCm), As: Number(layer.areaCm2) })),
    };
    const rcCurve = PMSection.curve(rcSection, {
      fc: Number(concrete.fcKgfCm2),
      fy: Number(reinforcement.fyKgfCm2),
      Es: positive(reinforcement.esKgfCm2) || DEFAULT_ES_KGF_CM2,
      phiComp: PHI.rcTiedCompression,
      phiTen: PHI.rcFlexure,
      PnMaxFactor: 0.8,
    }, {
      steps: 600,
      cMaxFactor: 20,
      cMinFactor: 0.0001,
    });
    const rcInteraction = PMSection.checkDemand(rcCurve.design, finalRcDemands.puTf, finalRcDemands.muxTfM);
    const engineeringChecksOk = compactness.ok && finalSteelInteraction.ok && rcInteraction.ok;

    return {
      coreVersion: CORE_VERSION,
      inputSchema: INPUT_SCHEMA,
      releaseStatus: RELEASE_STATUS,
      regulation: REGULATION_PROFILE,
      status: engineeringChecksOk ? 'REVIEW' : 'NG',
      reviewItems: validation.review,
      section: { grossAreaCm2, grossIxCm4, grossIyCm4, ecKgfCm2: ec, esKgfCm2: es },
      compactness,
      allocation: {
        axialSteelRatio,
        axialRcRatio: 1 - axialSteelRatio,
        momentSteelRatioX,
        momentRcRatioX: 1 - momentSteelRatioX,
        initialSteelDemands,
        initialRcDemands,
      },
      steel: {
        compressionX,
        compressionY,
        compressionControlAxis: compressionControl.axis,
        nominalCompressionTf: compressionControl.nominalCompressionTf,
        nominalMomentXTfM: mnxTfM,
        initialInteraction,
        finalInteraction: finalSteelInteraction,
      },
      redistribution: {
        requested: detailing.redistributeToSteelBoundary === true,
        applied: redistributionApplied,
        beta: initialInteraction.utilization,
        finalSteelDemands,
        finalRcDemands,
      },
      rc: {
        demand: finalRcDemands,
        phiMnTfM: rcInteraction.phiMn,
        utilization: rcInteraction.util,
        axialOk: rcInteraction.axialOk,
        ok: rcInteraction.ok,
        phiPnMaxTf: rcCurve.phiPnMax,
        nominalPoTf: rcCurve.Po,
        designCurve: rcCurve.design,
      },
      checks: {
        flangeCompactness: compactness.flangeOk,
        webCompactness: compactness.webOk,
        compactness: compactness.ok,
        steelInteraction: finalSteelInteraction.ok,
        rcInteraction: rcInteraction.ok,
        engineeringStrength: engineeringChecksOk,
        formalRelease: false,
      },
    };
  }

  return {
    CORE_VERSION,
    INPUT_SCHEMA,
    RELEASE_STATUS,
    REGULATION_PROFILE,
    PHI,
    SrcColumnInputError,
    elasticModulusConcrete,
    steelGradeGroup,
    calculateCompactness,
    validateInput,
    steelCompressionAxis,
    steelInteraction,
    calculate,
  };
});
