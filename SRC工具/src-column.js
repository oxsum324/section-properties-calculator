(function initSrcColumnPage(root, factory) {
  const core = root.SrcColumnCore || (typeof require === 'function' ? require('./core/src-column-core.js') : null);
  const catalog = root.SrcColumnHSectionCatalog || (typeof require === 'function' ? require('./core/src-column-h-section-catalog.js') : null);
  const weakAxisReference = root.SrcColumnWeakAxisShearReference || (typeof require === 'function' ? require('./core/src-column-weak-axis-shear-reference.js') : null);
  const api = factory(core, catalog, weakAxisReference);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SrcColumnPage = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => api.init(document, root));
    else api.init(document, root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildSrcColumnPage(Core, Catalog, WeakAxisReference) {
  'use strict';

  const PAGE_VERSION = 'v0.5';
  const TOOL_ID = 'src-column-research';
  const CASE_SCHEMA = 'src-column-research.case.v4';
  const PREVIOUS_CASE_SCHEMA = 'src-column-research.case.v3';
  const PREVIOUS_PAGE_VERSION = 'v0.4';
  const LEGACY_CASE_SCHEMA = 'src-column-research.case.v2';
  const LEGACY_PAGE_VERSION = 'v0.3';
  const TOOL_NAME = 'SRC 柱方向可選耐震研究核算';
  const REPORT_TITLE = 'SRC 柱方向可選耐震研究核算計算書';
  const REGULATION_LABEL = '鋼骨鋼筋混凝土構造設計規範與解說（100 年修正版）';
  const SECTION_DIAGRAM_TITLE = 'SRC 柱計算斷面';
  const SECTION_DIAGRAM_CAPTION = '混凝土與置中 H 型鋼依採用尺寸比例繪製；主筋以選定方向計算層（列）總面積表示，本圖非施工配筋詳圖。';
  const NUMBER_FIELDS = Object.freeze([
    'puTf', 'muxTfM', 'muyTfM', 'pdTf', 'plTf', 'peTf', 'fu', 'designTensionStrengthTf',
    'compressionTransferCapacityTf', 'tensionTransferCapacityTf',
    'widthCm', 'depthCm', 'fcKgfCm2', 'lengthCm', 'kx', 'ky',
    'reinforcementFy', 'reinforcementEs', 'steelFys', 'steelEs',
    'layer1Y', 'layer1Area', 'layer2Y', 'layer2Area', 'layer3Y', 'layer3Area', 'layer4Y', 'layer4Area',
    'xLayer1X', 'xLayer1Area', 'xLayer2X', 'xLayer2Area', 'xLayer3X', 'xLayer3Area', 'xLayer4X', 'xLayer4Area',
    'mctTfM', 'mcbTfM', 'clearHeightCm', 'effectiveDepthCm', 'avCm2', 'avfCm2', 'spacingCm',
    'fyhKgfCm2', 'steelFywKgfCm2', 'shearStudContributionTf',
    'weakAxisSteelNominalShearTf', 'weakAxisEffectiveDepthCm', 'weakAxisAvCm2', 'weakAxisAvfCm2',
    'weakAxisRcNominalShearTf', 'weakAxisRequiredTransverseAreaCm2',
    'jcwSteelColumnTfM', 'jcwSteelBeamTfM', 'jcwRcColumnTfM', 'jcwRcBeamTfM',
    'jccwSteelColumnTfM', 'jccwSteelBeamTfM', 'jccwRcColumnTfM', 'jccwRcBeamTfM',
    'cwUpperColumnTfM', 'cwLowerColumnTfM', 'cwLeftBeamTfM', 'cwRightBeamTfM',
    'ccwUpperColumnTfM', 'ccwLowerColumnTfM', 'ccwLeftBeamTfM', 'ccwRightBeamTfM',
    'coreWidthCm', 'coreAreaCm2', 'highlyConfinedAreaCm2', 'minimumLongitudinalBarDiameterCm',
    'providedConfinementZoneHeightCm', 'nonConfinedSpacingCm', 'firstHoopDistanceCm', 'spliceStaggerDistanceCm',
  ]);
  const CHECK_FIELDS = Object.freeze([
    'fuConfirmed', 'parkingUse', 'publicAssemblyUse', 'liveLoadHigh', 'designTensionStrengthConfirmed',
    'applyTransferCap', 'transferCapacityConfirmed', 'applyMomentFrameOmission', 'momentFrameConfirmed',
    'relevantProvisionsConfirmed', 'fullyEncased', 'centeredH', 'mainBarsContinuous', 'secondOrderIncluded',
    'redistribute', 'highStrengthConcreteConfirmed', 'highStrengthMaterialConfirmed',
    'enableShearSubcheck', 'projectPlasticHingeMomentsConfirmed', 'normalWeightConcreteConfirmed',
    'monolithicInterfaceConfirmed', 'transverseReinforcementPerpendicularConfirmed',
    'weakAxisStrengthsConfirmed', 'weakAxisRcStrengthConfirmed', 'weakAxisRequiredTransverseAreaConfirmed',
    'enableJointRatioSubcheck', 'jointRatioJointFaceStrengthsConfirmed', 'allConnectedMembersIncludedConfirmed',
    'componentStrengthsSeparatedConfirmed', 'useVerifiedSmoothTransferAlternative', 'smoothStressTransferAnalysisConfirmed',
    'enableStrongColumnSubcheck', 'singleStrongAxisFramePlaneConfirmed',
    'columnStrengthsAtGoverningAxialLoadsConfirmed', 'jointFaceNominalStrengthsConfirmed',
    'opposingMomentDirectionsConfirmed', 'enableConfinementSubcheck', 'inflectionPointWithinMiddleHalf',
    'wholeLengthConfined', 'highlyConfinedAreaConfirmed', 'cornerLongitudinalBarsConfirmed',
    'weakAxisAhccZeroConfirmed',
    'crosstiesProvidedAsNeededConfirmed', 'crosstiesEngageLongitudinalBarsConfirmed',
    'crosstieHooksAlternatedConfirmed', 'mainBarSplicePresent', 'spliceWithinMiddleHalfConfirmed',
    'tensionLapSpliceDesignedConfirmed', 'confinementThroughSpliceConfirmed', 'alternateBarsSplicedOnlyConfirmed',
  ]);
  const CHECK_LABELS = Object.freeze({
    flangeCompactness: '翼板寬厚比',
    webCompactness: '腹板寬厚比',
    steelInteraction: '鋼骨軸壓－彎矩互制',
    rcInteraction: 'RC 軸壓－彎矩互制',
    seismicAxialStrength: '第 9.3 節耐震軸向強度',
    columnShear: '第 9.6.2 節選定方向柱剪力',
    jointFlexuralStrengthRatio: '第 8.4.2 節接頭撓曲強度比',
    strongColumnWeakBeam: '第 9.6.1 節強柱弱梁',
    confinement: '第 9.6.3 節矩形柱圍束',
  });

  function assertDependencies(reportUi) {
    if (!Core) throw new Error('SRC 柱計算核心未載入。');
    if (!Catalog) throw new Error('SRC 柱型鋼 catalog 未載入。');
    if (!reportUi) throw new Error('共用計算書核心未載入。');
  }

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  function fmt(value, digits = 2) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : '—';
  }

  function percent(value, digits = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? `${(number * 100).toFixed(digits)}%` : '—';
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function migrateCasePayload(sourcePayload) {
    const payload = clone(sourcePayload);
    const isPrevious = payload?.schema === PREVIOUS_CASE_SCHEMA
      && payload?.tool?.id === TOOL_ID
      && payload?.tool?.version === PREVIOUS_PAGE_VERSION;
    const isLegacy = payload?.schema === LEGACY_CASE_SCHEMA
      && payload?.tool?.id === TOOL_ID
      && payload?.tool?.version === LEGACY_PAGE_VERSION;
    if (!isPrevious && !isLegacy) return { payload, migrated: false };
    if (!payload.input || typeof payload.input !== 'object') throw new Error('舊版案件 JSON 缺少計算輸入。');
    const input = payload.input;
    if (isLegacy) {
      input.seismicAxis = 'x';
      input.demands = { ...(input.demands || {}), muyTfM: 0 };
      for (const key of ['shear', 'jointFlexuralStrengthRatio', 'strongColumnWeakBeam', 'confinement']) {
        if (input[key] && typeof input[key] === 'object') input[key].axis = 'x';
      }
    }
    input.schema = Core.INPUT_SCHEMA;
    if (input.shear && typeof input.shear === 'object') {
      const shear = input.shear;
      const xPositions = Array.isArray(input.reinforcement?.xLayers)
        ? input.reinforcement.xLayers.map(item => Number(item?.xCm)).filter(Number.isFinite)
        : [];
      shear.weakAxisRcDesignBasis = 'project-confirmed';
      shear.weakAxisEffectiveDepthCm = xPositions.length ? Math.max(...xPositions) : Math.max(1, Number(input.concrete?.widthCm || 1) - 7);
      shear.weakAxisAvCm2 = Number.isFinite(Number(shear.avCm2)) ? Number(shear.avCm2) : 2.54;
      shear.weakAxisAvfCm2 = Number.isFinite(Number(shear.avfCm2)) ? Number(shear.avfCm2) : shear.weakAxisAvCm2;
      shear.weakAxisRcStrengthConfirmed = shear.weakAxisStrengthsConfirmed === true;
    }
    payload.schema = CASE_SCHEMA;
    payload.tool = {
      ...(payload.tool || {}),
      name: TOOL_NAME,
      version: PAGE_VERSION,
      calculationEngine: Core.CORE_VERSION,
    };
    delete payload.calculationFingerprint;
    if (payload.report && typeof payload.report === 'object') delete payload.report.calculationFingerprint;
    return {
      payload,
      migrated: true,
      sourceSchema: isLegacy ? LEGACY_CASE_SCHEMA : PREVIOUS_CASE_SCHEMA,
      sourceVersion: isLegacy ? LEGACY_PAGE_VERSION : PREVIOUS_PAGE_VERSION,
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
  }

  function escapeXml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    })[char]);
  }

  function readProject(doc) {
    const normalize = value => String(value || '').trim().replace(/^未填$/, '');
    return {
      name: normalize(doc.getElementById('projName')?.value),
      no: normalize(doc.getElementById('projNo')?.value),
      designer: normalize(doc.getElementById('projDesigner')?.value),
    };
  }

  function writeProject(doc, project) {
    const value = (id, next) => {
      const node = doc.getElementById(id);
      if (node) node.value = String(next || '');
    };
    value('projName', project?.name);
    value('projNo', project?.no);
    value('projDesigner', project?.designer);
  }

  function readCoreInput(doc) {
    const number = id => finite(doc.getElementById(id)?.value);
    const checked = id => doc.getElementById(id)?.checked === true;
    const layers = [1, 2, 3, 4].map(index => ({
      yCm: number(`layer${index}Y`),
      areaCm2: number(`layer${index}Area`),
    }));
    const xLayers = [1, 2, 3, 4].map(index => ({
      xCm: number(`xLayer${index}X`),
      areaCm2: number(`xLayer${index}Area`),
    }));
    const seismicAxis = String(doc.getElementById('seismicAxis')?.value || 'x');
    return {
      schema: Core.INPUT_SCHEMA,
      caseName: readProject(doc).name,
      seismicAxis,
      demands: {
        puTf: number('puTf'),
        muxTfM: seismicAxis === 'x' ? number('muxTfM') : 0,
        muyTfM: seismicAxis === 'y' ? number('muyTfM') : 0,
      },
      concrete: { widthCm: number('widthCm'), depthCm: number('depthCm'), fcKgfCm2: number('fcKgfCm2') },
      reinforcement: {
        tieType: 'tied',
        fyKgfCm2: number('reinforcementFy'),
        esKgfCm2: number('reinforcementEs'),
        layers,
        xLayers,
      },
      steel: {
        catalogId: String(doc.getElementById('steelCatalogId')?.value || ''),
        grade: String(doc.getElementById('steelGrade')?.value || ''),
        fysKgfCm2: number('steelFys'),
        fywKgfCm2: number('steelFywKgfCm2'),
        esKgfCm2: number('steelEs'),
      },
      member: { lengthCm: number('lengthCm'), kx: number('kx'), ky: number('ky') },
      detailing: {
        fullyEncased: checked('fullyEncased'),
        centeredDoublySymmetricH: checked('centeredH'),
        mainBarsContinuous: checked('mainBarsContinuous'),
        secondOrderDemandIncluded: checked('secondOrderIncluded'),
        seismicDesign: true,
        seismicAxialStrengthSubcheck: true,
        seismicColumnShearSubcheck: checked('enableShearSubcheck'),
        jointFlexuralStrengthRatioSubcheck: checked('enableJointRatioSubcheck'),
        seismicStrongColumnWeakBeamSubcheck: checked('enableStrongColumnSubcheck'),
        seismicConfinementSubcheck: checked('enableConfinementSubcheck'),
        redistributeToSteelBoundary: checked('redistribute'),
        highStrengthConcreteEvidenceConfirmed: checked('highStrengthConcreteConfirmed'),
        highStrengthMaterialEvidenceConfirmed: checked('highStrengthMaterialConfirmed'),
      },
      seismicAxial: {
        pdTf: number('pdTf'),
        plTf: number('plTf'),
        peTf: number('peTf'),
        fu: number('fu'),
        fuFromProjectSeismicCriteriaConfirmed: checked('fuConfirmed'),
        parkingUse: checked('parkingUse'),
        publicAssemblyUse: checked('publicAssemblyUse'),
        liveLoadExceeds05TfM2: checked('liveLoadHigh'),
        designTensionStrengthTf: number('designTensionStrengthTf'),
        designTensionStrengthConfirmed: checked('designTensionStrengthConfirmed'),
        applyTransferCapacityCap: checked('applyTransferCap'),
        transferCapacityConfirmed: checked('transferCapacityConfirmed'),
        compressionTransferCapacityTf: number('compressionTransferCapacityTf'),
        tensionTransferCapacityTf: number('tensionTransferCapacityTf'),
        applyMomentFrameOmission: checked('applyMomentFrameOmission'),
        momentFrameConfirmed: checked('momentFrameConfirmed'),
        relevantProvisionsSatisfiedConfirmed: checked('relevantProvisionsConfirmed'),
      },
      shear: {
        axis: seismicAxis,
        mctTfM: number('mctTfM'),
        mcbTfM: number('mcbTfM'),
        clearHeightCm: number('clearHeightCm'),
        effectiveDepthCm: number('effectiveDepthCm'),
        avCm2: number('avCm2'),
        avfCm2: number('avfCm2'),
        spacingCm: number('spacingCm'),
        fyhKgfCm2: number('fyhKgfCm2'),
        shearStudContributionTf: number('shearStudContributionTf'),
        projectPlasticHingeMomentsConfirmed: checked('projectPlasticHingeMomentsConfirmed'),
        normalWeightConcreteConfirmed: checked('normalWeightConcreteConfirmed'),
        monolithicInterfaceConfirmed: checked('monolithicInterfaceConfirmed'),
        transverseReinforcementPerpendicularConfirmed: checked('transverseReinforcementPerpendicularConfirmed'),
        weakAxisRcDesignBasis: String(doc.getElementById('weakAxisRcDesignBasis')?.value || 'automatic-clause-5.5.2'),
        weakAxisSteelNominalShearTf: number('weakAxisSteelNominalShearTf'),
        weakAxisEffectiveDepthCm: number('weakAxisEffectiveDepthCm'),
        weakAxisAvCm2: number('weakAxisAvCm2'),
        weakAxisAvfCm2: number('weakAxisAvfCm2'),
        weakAxisRcNominalShearTf: number('weakAxisRcNominalShearTf'),
        weakAxisRequiredTransverseAreaCm2: number('weakAxisRequiredTransverseAreaCm2'),
        weakAxisStrengthsConfirmed: checked('weakAxisStrengthsConfirmed'),
        weakAxisRcStrengthConfirmed: checked('weakAxisRcStrengthConfirmed'),
        weakAxisRequiredTransverseAreaConfirmed: checked('weakAxisRequiredTransverseAreaConfirmed'),
      },
      jointFlexuralStrengthRatio: {
        axis: seismicAxis,
        connectionType: String(doc.getElementById('jointConnectionType')?.value || ''),
        jointFaceNominalStrengthsConfirmed: checked('jointRatioJointFaceStrengthsConfirmed'),
        allConnectedMembersIncludedConfirmed: checked('allConnectedMembersIncludedConfirmed'),
        componentStrengthsSeparatedConfirmed: checked('componentStrengthsSeparatedConfirmed'),
        useVerifiedSmoothTransferAlternative: checked('useVerifiedSmoothTransferAlternative'),
        smoothStressTransferAnalysisConfirmed: checked('smoothStressTransferAnalysisConfirmed'),
        cases: [
          {
            sense: 'clockwise',
            steelColumnSumTfM: number('jcwSteelColumnTfM'),
            steelBeamSumTfM: number('jcwSteelBeamTfM'),
            rcColumnSumTfM: number('jcwRcColumnTfM'),
            rcBeamSumTfM: number('jcwRcBeamTfM'),
          },
          {
            sense: 'counterclockwise',
            steelColumnSumTfM: number('jccwSteelColumnTfM'),
            steelBeamSumTfM: number('jccwSteelBeamTfM'),
            rcColumnSumTfM: number('jccwRcColumnTfM'),
            rcBeamSumTfM: number('jccwRcBeamTfM'),
          },
        ],
      },
      strongColumnWeakBeam: {
        axis: seismicAxis,
        orthogonalBeamDirectionPresent: !checked('singleStrongAxisFramePlaneConfirmed'),
        columnStrengthsAtGoverningAxialLoadsConfirmed: checked('columnStrengthsAtGoverningAxialLoadsConfirmed'),
        jointFaceNominalStrengthsConfirmed: checked('jointFaceNominalStrengthsConfirmed'),
        opposingMomentDirectionsConfirmed: checked('opposingMomentDirectionsConfirmed'),
        cases: [
          {
            sense: 'clockwise',
            upperColumnNominalTfM: number('cwUpperColumnTfM'),
            lowerColumnNominalTfM: number('cwLowerColumnTfM'),
            leftBeamNominalTfM: number('cwLeftBeamTfM'),
            rightBeamNominalTfM: number('cwRightBeamTfM'),
          },
          {
            sense: 'counterclockwise',
            upperColumnNominalTfM: number('ccwUpperColumnTfM'),
            lowerColumnNominalTfM: number('ccwLowerColumnTfM'),
            leftBeamNominalTfM: number('ccwLeftBeamTfM'),
            rightBeamNominalTfM: number('ccwRightBeamTfM'),
          },
        ],
      },
      confinement: {
        axis: seismicAxis,
        coreWidthCm: number('coreWidthCm'),
        coreAreaCm2: number('coreAreaCm2'),
        highlyConfinedAreaCm2: number('highlyConfinedAreaCm2'),
        minimumLongitudinalBarDiameterCm: number('minimumLongitudinalBarDiameterCm'),
        providedConfinementZoneHeightCm: number('providedConfinementZoneHeightCm'),
        nonConfinedSpacingCm: number('nonConfinedSpacingCm'),
        firstHoopDistanceCm: number('firstHoopDistanceCm'),
        inflectionPointWithinMiddleHalf: checked('inflectionPointWithinMiddleHalf'),
        wholeLengthConfined: checked('wholeLengthConfined'),
        mainBarSplicePresent: checked('mainBarSplicePresent'),
        highlyConfinedAreaConfirmed: checked('highlyConfinedAreaConfirmed'),
        weakAxisAhccZeroConfirmed: checked('weakAxisAhccZeroConfirmed'),
        cornerLongitudinalBarsConfirmed: checked('cornerLongitudinalBarsConfirmed'),
        crosstiesProvidedAsNeededConfirmed: checked('crosstiesProvidedAsNeededConfirmed'),
        crosstiesEngageLongitudinalBarsConfirmed: checked('crosstiesEngageLongitudinalBarsConfirmed'),
        crosstieHooksAlternatedConfirmed: checked('crosstieHooksAlternatedConfirmed'),
        spliceWithinMiddleHalfConfirmed: checked('spliceWithinMiddleHalfConfirmed'),
        tensionLapSpliceDesignedConfirmed: checked('tensionLapSpliceDesignedConfirmed'),
        confinementThroughSpliceConfirmed: checked('confinementThroughSpliceConfirmed'),
        alternateBarsSplicedOnlyConfirmed: checked('alternateBarsSplicedOnlyConfirmed'),
        spliceStaggerDistanceCm: number('spliceStaggerDistanceCm'),
      },
    };
  }

  function writeCoreInput(doc, input) {
    const setValue = (id, value) => {
      const node = doc.getElementById(id);
      if (node && value != null && Number.isFinite(Number(value))) node.value = String(value);
    };
    const setText = (id, value) => {
      const node = doc.getElementById(id);
      if (node && value != null) node.value = String(value);
    };
    const setChecked = (id, value) => {
      const node = doc.getElementById(id);
      if (node) node.checked = value === true;
    };
    const d = input?.demands || {};
    const c = input?.concrete || {};
    const r = input?.reinforcement || {};
    const s = input?.steel || {};
    const m = input?.member || {};
    const detail = input?.detailing || {};
    const axial = input?.seismicAxial || {};
    const shear = input?.shear || {};
    const jointRatio = input?.jointFlexuralStrengthRatio || {};
    const strongColumn = input?.strongColumnWeakBeam || {};
    const confinement = input?.confinement || {};
    const strongColumnCases = Array.isArray(strongColumn.cases) ? strongColumn.cases : [];
    const jointRatioCases = Array.isArray(jointRatio.cases) ? jointRatio.cases : [];
    const jointClockwise = jointRatioCases.find(item => item?.sense === 'clockwise') || {};
    const jointCounterclockwise = jointRatioCases.find(item => item?.sense === 'counterclockwise') || {};
    const clockwise = strongColumnCases.find(item => item?.sense === 'clockwise') || {};
    const counterclockwise = strongColumnCases.find(item => item?.sense === 'counterclockwise') || {};
    [
      ['puTf', d.puTf], ['muxTfM', d.muxTfM], ['muyTfM', d.muyTfM],
      ['pdTf', axial.pdTf], ['plTf', axial.plTf], ['peTf', axial.peTf], ['fu', axial.fu],
      ['designTensionStrengthTf', axial.designTensionStrengthTf],
      ['compressionTransferCapacityTf', axial.compressionTransferCapacityTf],
      ['tensionTransferCapacityTf', axial.tensionTransferCapacityTf],
      ['widthCm', c.widthCm], ['depthCm', c.depthCm], ['fcKgfCm2', c.fcKgfCm2],
      ['lengthCm', m.lengthCm], ['kx', m.kx], ['ky', m.ky],
      ['reinforcementFy', r.fyKgfCm2], ['reinforcementEs', r.esKgfCm2],
      ['steelFys', s.fysKgfCm2], ['steelFywKgfCm2', s.fywKgfCm2], ['steelEs', s.esKgfCm2],
      ['mctTfM', shear.mctTfM], ['mcbTfM', shear.mcbTfM], ['clearHeightCm', shear.clearHeightCm],
      ['effectiveDepthCm', shear.effectiveDepthCm], ['avCm2', shear.avCm2], ['avfCm2', shear.avfCm2],
      ['spacingCm', shear.spacingCm], ['fyhKgfCm2', shear.fyhKgfCm2],
      ['shearStudContributionTf', shear.shearStudContributionTf],
      ['weakAxisSteelNominalShearTf', shear.weakAxisSteelNominalShearTf],
      ['weakAxisEffectiveDepthCm', shear.weakAxisEffectiveDepthCm],
      ['weakAxisAvCm2', shear.weakAxisAvCm2],
      ['weakAxisAvfCm2', shear.weakAxisAvfCm2],
      ['weakAxisRcNominalShearTf', shear.weakAxisRcNominalShearTf],
      ['weakAxisRequiredTransverseAreaCm2', shear.weakAxisRequiredTransverseAreaCm2],
      ['jcwSteelColumnTfM', jointClockwise.steelColumnSumTfM], ['jcwSteelBeamTfM', jointClockwise.steelBeamSumTfM],
      ['jcwRcColumnTfM', jointClockwise.rcColumnSumTfM], ['jcwRcBeamTfM', jointClockwise.rcBeamSumTfM],
      ['jccwSteelColumnTfM', jointCounterclockwise.steelColumnSumTfM], ['jccwSteelBeamTfM', jointCounterclockwise.steelBeamSumTfM],
      ['jccwRcColumnTfM', jointCounterclockwise.rcColumnSumTfM], ['jccwRcBeamTfM', jointCounterclockwise.rcBeamSumTfM],
      ['cwUpperColumnTfM', clockwise.upperColumnNominalTfM], ['cwLowerColumnTfM', clockwise.lowerColumnNominalTfM],
      ['cwLeftBeamTfM', clockwise.leftBeamNominalTfM], ['cwRightBeamTfM', clockwise.rightBeamNominalTfM],
      ['ccwUpperColumnTfM', counterclockwise.upperColumnNominalTfM], ['ccwLowerColumnTfM', counterclockwise.lowerColumnNominalTfM],
      ['ccwLeftBeamTfM', counterclockwise.leftBeamNominalTfM], ['ccwRightBeamTfM', counterclockwise.rightBeamNominalTfM],
      ['coreWidthCm', confinement.coreWidthCm], ['coreAreaCm2', confinement.coreAreaCm2],
      ['highlyConfinedAreaCm2', confinement.highlyConfinedAreaCm2],
      ['minimumLongitudinalBarDiameterCm', confinement.minimumLongitudinalBarDiameterCm],
      ['providedConfinementZoneHeightCm', confinement.providedConfinementZoneHeightCm],
      ['nonConfinedSpacingCm', confinement.nonConfinedSpacingCm], ['firstHoopDistanceCm', confinement.firstHoopDistanceCm],
      ['spliceStaggerDistanceCm', confinement.spliceStaggerDistanceCm],
    ].forEach(([id, value]) => setValue(id, value));
    (Array.isArray(r.layers) ? r.layers : []).slice(0, 4).forEach((layer, index) => {
      setValue(`layer${index + 1}Y`, layer.yCm);
      setValue(`layer${index + 1}Area`, layer.areaCm2);
    });
    (Array.isArray(r.xLayers) ? r.xLayers : []).slice(0, 4).forEach((layer, index) => {
      setValue(`xLayer${index + 1}X`, layer.xCm);
      setValue(`xLayer${index + 1}Area`, layer.areaCm2);
    });
    setText('seismicAxis', input?.seismicAxis || shear.axis || 'x');
    setText('weakAxisRcDesignBasis', shear.weakAxisRcDesignBasis || 'project-confirmed');
    setText('steelCatalogId', s.catalogId);
    setText('steelGrade', s.grade);
    setText('jointConnectionType', jointRatio.connectionType);
    [
      ['fuConfirmed', axial.fuFromProjectSeismicCriteriaConfirmed], ['parkingUse', axial.parkingUse],
      ['publicAssemblyUse', axial.publicAssemblyUse], ['liveLoadHigh', axial.liveLoadExceeds05TfM2],
      ['designTensionStrengthConfirmed', axial.designTensionStrengthConfirmed],
      ['applyTransferCap', axial.applyTransferCapacityCap], ['transferCapacityConfirmed', axial.transferCapacityConfirmed],
      ['applyMomentFrameOmission', axial.applyMomentFrameOmission], ['momentFrameConfirmed', axial.momentFrameConfirmed],
      ['relevantProvisionsConfirmed', axial.relevantProvisionsSatisfiedConfirmed],
      ['fullyEncased', detail.fullyEncased], ['centeredH', detail.centeredDoublySymmetricH],
      ['mainBarsContinuous', detail.mainBarsContinuous], ['secondOrderIncluded', detail.secondOrderDemandIncluded],
      ['redistribute', detail.redistributeToSteelBoundary],
      ['highStrengthConcreteConfirmed', detail.highStrengthConcreteEvidenceConfirmed],
      ['highStrengthMaterialConfirmed', detail.highStrengthMaterialEvidenceConfirmed],
      ['enableShearSubcheck', detail.seismicColumnShearSubcheck],
      ['projectPlasticHingeMomentsConfirmed', shear.projectPlasticHingeMomentsConfirmed],
      ['normalWeightConcreteConfirmed', shear.normalWeightConcreteConfirmed],
      ['monolithicInterfaceConfirmed', shear.monolithicInterfaceConfirmed],
      ['transverseReinforcementPerpendicularConfirmed', shear.transverseReinforcementPerpendicularConfirmed],
      ['weakAxisStrengthsConfirmed', shear.weakAxisStrengthsConfirmed],
      ['weakAxisRcStrengthConfirmed', shear.weakAxisRcStrengthConfirmed ?? shear.weakAxisStrengthsConfirmed],
      ['weakAxisRequiredTransverseAreaConfirmed', shear.weakAxisRequiredTransverseAreaConfirmed],
      ['enableJointRatioSubcheck', detail.jointFlexuralStrengthRatioSubcheck],
      ['jointRatioJointFaceStrengthsConfirmed', jointRatio.jointFaceNominalStrengthsConfirmed],
      ['allConnectedMembersIncludedConfirmed', jointRatio.allConnectedMembersIncludedConfirmed],
      ['componentStrengthsSeparatedConfirmed', jointRatio.componentStrengthsSeparatedConfirmed],
      ['useVerifiedSmoothTransferAlternative', jointRatio.useVerifiedSmoothTransferAlternative],
      ['smoothStressTransferAnalysisConfirmed', jointRatio.smoothStressTransferAnalysisConfirmed],
      ['enableStrongColumnSubcheck', detail.seismicStrongColumnWeakBeamSubcheck],
      ['singleStrongAxisFramePlaneConfirmed', strongColumn.orthogonalBeamDirectionPresent === false],
      ['columnStrengthsAtGoverningAxialLoadsConfirmed', strongColumn.columnStrengthsAtGoverningAxialLoadsConfirmed],
      ['jointFaceNominalStrengthsConfirmed', strongColumn.jointFaceNominalStrengthsConfirmed],
      ['opposingMomentDirectionsConfirmed', strongColumn.opposingMomentDirectionsConfirmed],
      ['enableConfinementSubcheck', detail.seismicConfinementSubcheck],
      ['inflectionPointWithinMiddleHalf', confinement.inflectionPointWithinMiddleHalf],
      ['wholeLengthConfined', confinement.wholeLengthConfined],
      ['mainBarSplicePresent', confinement.mainBarSplicePresent],
      ['highlyConfinedAreaConfirmed', confinement.highlyConfinedAreaConfirmed],
      ['weakAxisAhccZeroConfirmed', confinement.weakAxisAhccZeroConfirmed],
      ['cornerLongitudinalBarsConfirmed', confinement.cornerLongitudinalBarsConfirmed],
      ['crosstiesProvidedAsNeededConfirmed', confinement.crosstiesProvidedAsNeededConfirmed],
      ['crosstiesEngageLongitudinalBarsConfirmed', confinement.crosstiesEngageLongitudinalBarsConfirmed],
      ['crosstieHooksAlternatedConfirmed', confinement.crosstieHooksAlternatedConfirmed],
      ['spliceWithinMiddleHalfConfirmed', confinement.spliceWithinMiddleHalfConfirmed],
      ['tensionLapSpliceDesignedConfirmed', confinement.tensionLapSpliceDesignedConfirmed],
      ['confinementThroughSpliceConfirmed', confinement.confinementThroughSpliceConfirmed],
      ['alternateBarsSplicedOnlyConfirmed', confinement.alternateBarsSplicedOnlyConfirmed],
    ].forEach(([id, value]) => setChecked(id, value));
  }

  function resolvedSection(input) {
    return Core.resolveSteelSection(input).steel;
  }

  function assertSectionDiagramInput(input) {
    const steel = resolvedSection(input);
    const values = [
      input?.concrete?.widthCm, input?.concrete?.depthCm,
      steel.depthCm, steel.flangeWidthCm, steel.flangeThicknessCm, steel.webThicknessCm,
    ].map(Number);
    if (values.some(value => !Number.isFinite(value) || value <= 0)) throw new Error('SRC 柱計算斷面圖缺少有效正值尺寸。');
    const [width, depth, steelDepth, flangeWidth, flangeThickness, webThickness] = values;
    if (steelDepth >= depth || flangeWidth >= width) throw new Error('SRC 柱計算斷面圖的 H 型鋼未完全包覆於混凝土斷面。');
    if (2 * flangeThickness >= steelDepth || webThickness >= flangeWidth) throw new Error('SRC 柱計算斷面圖的 H 型鋼幾何尺寸無效。');
    const layers = input?.reinforcement?.layers || [];
    if (layers.length < 2 || layers.some(layer => !(Number(layer.yCm) > 0 && Number(layer.yCm) < depth && Number(layer.areaCm2) > 0))) {
      throw new Error('SRC 柱計算斷面圖的主筋計算層資料無效。');
    }
    if (input?.seismicAxis === 'y') {
      const xLayers = input?.reinforcement?.xLayers || [];
      if (xLayers.length < 2 || xLayers.some(layer => !(Number(layer.xCm) > 0 && Number(layer.xCm) < width && Number(layer.areaCm2) > 0))) {
        throw new Error('SRC 柱計算斷面圖的 Y 向主筋計算列資料無效。');
      }
    }
    return steel;
  }

  function buildSectionDiagram(input) {
    const steel = assertSectionDiagramInput(input);
    const width = Number(input.concrete.widthCm);
    const depth = Number(input.concrete.depthCm);
    const axis = input.seismicAxis === 'y' ? 'y' : 'x';
    const layers = axis === 'y' ? input.reinforcement.xLayers : input.reinforcement.layers;
    const plot = { x: 70, y: 52, width: 330, height: 350 };
    const scale = Math.min(plot.width / width, plot.height / depth);
    const sectionWidth = width * scale;
    const sectionHeight = depth * scale;
    const x = plot.x + (plot.width - sectionWidth) / 2;
    const y = plot.y + (plot.height - sectionHeight) / 2;
    const cx = x + sectionWidth / 2;
    const cy = y + sectionHeight / 2;
    const steelDepth = Number(steel.depthCm) * scale;
    const flangeWidth = Number(steel.flangeWidthCm) * scale;
    const flangeThickness = Number(steel.flangeThicknessCm) * scale;
    const webThickness = Number(steel.webThicknessCm) * scale;
    const steelTop = cy - steelDepth / 2;
    const steelLeft = cx - flangeWidth / 2;
    const webLeft = cx - webThickness / 2;
    const layerSvg = layers.map((layer, index) => {
      if (axis === 'y') {
        const layerX = x + Number(layer.xCm) * scale;
        return `<line x1="${layerX}" y1="${y + 9}" x2="${layerX}" y2="${y + sectionHeight - 9}" stroke="#b45309" stroke-width="2.5" stroke-dasharray="6 5"/>
          <rect x="${layerX - 12.5}" y="${y + 7}" width="25" height="18" rx="4" fill="#fff7ed" stroke="#fdba74"/>
          <text x="${layerX}" y="${y + 20}" text-anchor="middle" class="layer">L${index + 1}</text>`;
      }
      const layerY = y + Number(layer.yCm) * scale;
      return `<line x1="${x + 9}" y1="${layerY}" x2="${x + sectionWidth - 9}" y2="${layerY}" stroke="#b45309" stroke-width="2.5" stroke-dasharray="6 5"/>
        <rect x="${x + 7}" y="${layerY - 10}" width="25" height="18" rx="4" fill="#fff7ed" stroke="#fdba74"/>
        <text x="${x + 19.5}" y="${layerY + 3}" text-anchor="middle" class="layer">L${index + 1}</text>`;
    }).join('');
    const layerLegendSvg = layers.map((layer, index) =>
      `<text class="note" x="0" y="${154 + index * 27}">L${index + 1}: ${axis === 'y' ? 'x' : 'y'}=${fmt(axis === 'y' ? layer.xCm : layer.yCm, 1)} cm, As=${fmt(layer.areaCm2, 2)} cm²</text>`
    ).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 455" role="img" aria-labelledby="src-column-title src-column-desc">
      <title id="src-column-title">${SECTION_DIAGRAM_TITLE}</title>
      <desc id="src-column-desc">矩形混凝土柱內置中雙對稱 H 型鋼，主筋以 ${axis.toUpperCase()} 向計算層列總面積表示。</desc>
      <style>text{font-family:"Noto Sans TC","Microsoft JhengHei",Arial,sans-serif;fill:#172033}.dim{font-size:14px;font-weight:700}.layer{font-size:12px;fill:#92400e}.note{font-size:12px;fill:#64748b}.title{font-size:17px;font-weight:800}</style>
      <rect x="0.5" y="0.5" width="759" height="454" rx="10" fill="#fff" stroke="#cbd5e1"/>
      <rect x="${x}" y="${y}" width="${sectionWidth}" height="${sectionHeight}" fill="#f1f5f9" stroke="#334155" stroke-width="2.2"/>
      ${layerSvg}
      <rect x="${steelLeft}" y="${steelTop}" width="${flangeWidth}" height="${flangeThickness}" fill="#2563eb" stroke="#1e3a8a" stroke-width="1.3"/>
      <rect x="${webLeft}" y="${steelTop + flangeThickness}" width="${webThickness}" height="${steelDepth - 2 * flangeThickness}" fill="#2563eb" stroke="#1e3a8a" stroke-width="1.3"/>
      <rect x="${steelLeft}" y="${steelTop + steelDepth - flangeThickness}" width="${flangeWidth}" height="${flangeThickness}" fill="#2563eb" stroke="#1e3a8a" stroke-width="1.3"/>
      <text x="${cx}" y="${y - 18}" text-anchor="middle" class="dim">b = ${fmt(width, 1)} cm</text>
      <text x="${x - 22}" y="${cy}" text-anchor="middle" class="dim" transform="rotate(-90 ${x - 22} ${cy})">h = ${fmt(depth, 1)} cm</text>
      <g transform="translate(475 82)">
        <text class="title" x="0" y="0">採用計算斷面</text>
        <text class="dim" x="0" y="35">混凝土 ${fmt(width, 1)} × ${fmt(depth, 1)} cm</text>
        <text class="dim" x="0" y="66">${escapeXml(steel.shape || '')}</text>
        <text class="note" x="0" y="91">D × bf × tw × tf</text>
        <text class="dim" x="0" y="116">${fmt(steel.depthCm, 1)} × ${fmt(steel.flangeWidthCm, 1)} × ${fmt(steel.webThicknessCm, 1)} × ${fmt(steel.flangeThicknessCm, 1)} cm</text>
        <line x1="0" y1="132" x2="28" y2="132" stroke="#b45309" stroke-width="2.5" stroke-dasharray="6 5"/>
        <text class="note" x="38" y="136">${axis.toUpperCase()} 向主筋計算${axis === 'y' ? '列' : '層'}與總 As</text>
        ${layerLegendSvg}
        <text class="note" x="0" y="278">本圖依計算尺寸同比例繪製</text>
        <text class="note" x="0" y="303">不表示鋼筋根數、號數或施工配置</text>
      </g>
    </svg>`;
    return Object.freeze({
      title: SECTION_DIAGRAM_TITLE,
      caption: SECTION_DIAGRAM_CAPTION,
      width: 680,
      svg,
      dataURL: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    });
  }

  function failedLabels(result) {
    return Object.entries(CHECK_LABELS)
      .filter(([key]) => result?.checks?.[key] === false)
      .map(([, label]) => label);
  }

  function reviewLabels(result) {
    return (result?.reviewItems || []).map(item => item.message || item.code || '人工複核');
  }

  function buildReportConfig(input, result, project) {
    const axial = result.seismicAxial;
    const shear = result.shear;
    const jointRatio = result.jointFlexuralStrengthRatio;
    const strongColumn = result.strongColumnWeakBeam;
    const confinement = result.confinement;
    const compressionStrength = axial.compressionStrength;
    const compactness = result.compactness;
    const section = result.steelSection;
    const axis = input.seismicAxis === 'y' ? 'y' : 'x';
    const axisLabel = axis === 'y' ? 'Y 向（鋼骨弱軸）' : 'X 向（鋼骨強軸）';
    const automaticWeakAxisRc = axis === 'y' && shear?.weakAxisRcDesignBasis === 'automatic-clause-5.5.2';
    const rcShearBasisLabel = axis === 'x' || automaticWeakAxisRc ? '第 5.5.2 節自動計算' : '專案確認值';
    const selectedMoment = axis === 'y' ? input.demands.muyTfM : input.demands.muxTfM;
    const selectedLayers = axis === 'y' ? input.reinforcement.xLayers : input.reinforcement.layers;
    const diagram = buildSectionDiagram(input);
    const compressionCombos = axial.combinations.compression;
    const tensionCombos = axial.combinations.tension;
    const strengthOk = result.checks.engineeringStrength === true;
    const tensionText = axial.tension.applicable
      ? `${fmt(axial.tension.adoptedDemandTf, 2)} / ${fmt(axial.tension.designStrengthTf, 2)} tf`
      : '無拉力需求';
    const transferText = axial.transferCapacityCap.applied
      ? `採用；壓／拉上限 = ${fmt(axial.transferCapacityCap.compressionLimitTf, 2)} / ${fmt(axial.transferCapacityCap.tensionLimitTf, 2)} tf`
      : '未採用';
    const omissionText = axial.omission.applied
      ? `採用；Pu/φPn = ${fmt(axial.omission.ratio, 4)} ≤ 0.5`
      : '未採用';
    const implementedScope = [
      `${axisLabel}單向 P-M`,
      '第 9.3 節耐震軸向強度',
      jointRatio ? '第 8.4.2 節接頭撓曲強度比' : '',
      shear ? '第 9.6.2 節柱剪力' : '',
      strongColumn ? '第 9.6.1 節強柱弱梁' : '',
      confinement ? '第 9.6.3 節矩形柱圍束' : '',
    ].filter(Boolean).join('、');
    return {
      title: `SRC 柱 ${axisLabel}耐震研究核算計算書`,
      subtitle: `SRC Column ${axis.toUpperCase()}-Axis Seismic Research Calculation Report`,
      toolName: TOOL_NAME,
      toolVersion: PAGE_VERSION,
      formalApprovalAllowed: false,
      outputSource: {
        tool: TOOL_NAME,
        version: PAGE_VERSION,
        displayVersion: PAGE_VERSION,
        calculationEngine: result.coreVersion,
      },
      project: project || {},
      calculated: true,
      failedItems: failedLabels(result),
      reviewItems: reviewLabels(result),
      inputs: [
        {
          group: '規範、構材與分析條件',
          items: [
            { label: '採用規範', value: REGULATION_LABEL, unit: '' },
            { label: '構材型式', value: '完全包覆矩形 SRC 橫箍筋柱；置中雙對稱 H 型鋼骨', unit: '' },
            { label: '本計算書核算方向', value: axisLabel, unit: '' },
            { label: '檢核範圍', value: implementedScope, unit: '' },
            { label: `Pu / Mu${axis}`, value: `${fmt(input.demands.puTf, 2)} / ${fmt(selectedMoment, 2)}`, unit: 'tf / tf·m' },
            { label: '二階需求', value: '專案分析已納入 P-Δ 效應', unit: '' },
            { label: '重分配', value: result.redistribution.applied ? '依式 (7.3-9)～(7.3-10) 採用' : '未採用', unit: '' },
          ],
        },
        {
          group: '採用斷面與材料',
          items: [
            { label: '混凝土 b × h', value: `${fmt(input.concrete.widthCm, 1)} × ${fmt(input.concrete.depthCm, 1)}`, unit: 'cm' },
            { label: "fc′ / Fyr", value: `${fmt(input.concrete.fcKgfCm2, 0)} / ${fmt(input.reinforcement.fyKgfCm2, 0)}`, unit: 'kgf/cm²' },
            { label: '鋼骨', value: `${section.shape}；${input.steel.grade}`, unit: '' },
            { label: 'A / Ix / Iy', value: `${fmt(section.properties.areaCm2, 1)} / ${fmt(section.properties.ixCm4, 0)} / ${fmt(section.properties.iyCm4, 0)}`, unit: 'cm² / cm⁴ / cm⁴' },
            { label: 'Fys', value: fmt(input.steel.fysKgfCm2, 0), unit: 'kgf/cm²' },
            { label: 'L / Kx / Ky', value: `${fmt(input.member.lengthCm, 1)} / ${fmt(input.member.kx, 2)} / ${fmt(input.member.ky, 2)}`, unit: 'cm / — / —' },
            { label: `${axisLabel}主筋計算${axis === 'y' ? '列' : '層'}`, value: selectedLayers.map(layer => `${axis === 'y' ? 'x' : 'y'}=${fmt(axis === 'y' ? layer.xCm : layer.yCm, 1)} cm：As=${fmt(layer.areaCm2, 2)} cm²`).join('；'), unit: '' },
          ],
        },
        {
          group: '第 9.3 節採用地震軸力資料',
          keepTogether: true,
          pageBreakBefore: true,
          items: [
            { label: 'PD / PL / PE', value: `${fmt(input.seismicAxial.pdTf, 2)} / ${fmt(input.seismicAxial.plTf, 2)} / ${fmt(input.seismicAxial.peTf, 2)}`, unit: 'tf' },
            { label: '專案 Fu / 採用 Fu', value: `${fmt(axial.factors.projectFu, 2)} / ${fmt(axial.factors.adoptedFu, 2)}`, unit: '—' },
            { label: '活載係數', value: fmt(axial.factors.liveLoadFactor, 1), unit: '—' },
            { label: '1.4FuPE', value: fmt(axial.factors.amplifiedSeismicTf, 2), unit: 'tf' },
            { label: '傳力容量上限', value: transferText, unit: '' },
            { label: '彎矩構架免檢', value: omissionText, unit: '' },
            { label: '專案拉力設計強度', value: axial.tension.applicable ? fmt(axial.tension.designStrengthTf, 2) : '本組合未產生拉力需求', unit: axial.tension.applicable ? 'tf' : '' },
          ],
        },
        ...(shear ? [{
          group: '第 9.6.2 節採用柱剪力資料',
          keepTogether: true,
          items: [
            { label: 'Mct / Mcb', value: `${fmt(shear.demand.mctTfM, 2)} / ${fmt(shear.demand.mcbTfM, 2)}`, unit: 'tf·m' },
            { label: '柱淨高 Ln', value: fmt(shear.demand.clearHeightCm, 1), unit: 'cm' },
            ...(axis === 'x' ? [
              { label: 'RC 有效深度 d', value: fmt(input.shear.effectiveDepthCm, 1), unit: 'cm' },
              { label: 'Av / Avf', value: `${fmt(input.shear.avCm2, 3)} / ${fmt(input.shear.avfCm2, 3)}`, unit: 'cm²' },
              { label: 's / fyh / Fyw', value: `${fmt(input.shear.spacingCm, 1)} / ${fmt(input.shear.fyhKgfCm2, 0)} / ${fmt(input.steel.fywKgfCm2, 0)}`, unit: 'cm / kgf/cm² / kgf/cm²' },
              { label: '剪力釘貢獻', value: fmt(input.shear.shearStudContributionTf, 2), unit: 'tf' },
            ] : [
              { label: 'Y 向鋼骨 Vns', value: fmt(shear.steel.nominalShearTf, 3), unit: 'tf（專案確認）' },
              { label: 'Y 向 RC 計算依據', value: rcShearBasisLabel, unit: '' },
              ...(automaticWeakAxisRc ? [
                { label: 'Y 向 RC b / d / b′', value: `${fmt(shear.rc.sectionWidthCm, 1)} / ${fmt(shear.rc.effectiveDepthCm, 1)} / ${fmt(shear.rc.netConcreteWidthCm, 1)}`, unit: 'cm' },
                { label: 'Y 向 Av / Avf', value: `${fmt(input.shear.weakAxisAvCm2, 3)} / ${fmt(input.shear.weakAxisAvfCm2, 3)}`, unit: 'cm²' },
                { label: 's / fyh', value: `${fmt(input.shear.spacingCm, 1)} / ${fmt(input.shear.fyhKgfCm2, 0)}`, unit: 'cm / kgf/cm²' },
                { label: '計算 Vnrc / Ash,shear', value: `${fmt(shear.rc.nominalShearTf, 3)} / ${fmt(shear.rc.requiredTransverseAreaCm2, 3)}`, unit: 'tf / cm²' },
              ] : [
                { label: '專案確認 Vnrc', value: fmt(shear.rc.nominalShearTf, 3), unit: 'tf' },
                { label: '專案確認 Ash,shear', value: fmt(shear.rc.requiredTransverseAreaCm2, 3), unit: 'cm²' },
                { label: '提供 Av,y / s / fyh', value: `${fmt(input.shear.weakAxisAvCm2, 3)} / ${fmt(input.shear.spacingCm, 1)} / ${fmt(input.shear.fyhKgfCm2, 0)}`, unit: 'cm² / cm / kgf/cm²' },
              ]),
            ]),
          ],
        }] : []),
        ...(jointRatio ? [{
          group: '第 8.4.2 節採用接頭面分量彎矩',
          keepTogether: true,
          items: [
            { label: '接合類型', value: jointRatio.connectionType === 'src-beam-src-column' ? 'SRC 梁－SRC 柱' : '鋼梁－SRC 柱', unit: '' },
            ...jointRatio.cases.flatMap(item => [
              {
                label: `${item.sense === 'clockwise' ? '順時針' : '逆時針'}：鋼骨 Σ(Mns)C / Σ(Mns)B`,
                value: `${fmt(item.steel.columnSumTfM, 3)} / ${fmt(item.steel.beamSumTfM, 3)}`,
                unit: 'tf·m',
              },
              ...(item.rc ? [{
                label: `${item.sense === 'clockwise' ? '順時針' : '逆時針'}：RC Σ(Mnrc)C / Σ(Mnrc)B`,
                value: `${fmt(item.rc.columnSumTfM, 3)} / ${fmt(item.rc.beamSumTfM, 3)}`,
                unit: 'tf·m',
              }] : []),
            ]),
          ],
        }] : []),
        ...(strongColumn ? [{
          group: '第 9.6.1 節採用接頭面名義彎矩',
          keepTogether: true,
          items: strongColumn.cases.map(item => ({
            label: item.sense === 'clockwise' ? '順時針：ΣMnc / ΣMnb' : '逆時針：ΣMnc / ΣMnb',
            value: `${fmt(item.columnSumTfM, 2)} / ${fmt(item.beamSumTfM, 2)}`,
            unit: 'tf·m',
          })),
        }] : []),
        ...(confinement ? [{
          group: '第 9.6.3 節採用圍束資料',
          keepTogether: true,
          pageBreakBefore: true,
          items: [
            { label: 'bc / Ach / Ahcc', value: `${fmt(input.confinement.coreWidthCm, 1)} / ${fmt(input.confinement.coreAreaCm2, 1)} / ${fmt(input.confinement.highlyConfinedAreaCm2, 1)}`, unit: 'cm / cm² / cm²' },
            { label: '最小 db / 圍束區高度 lo', value: `${fmt(input.confinement.minimumLongitudinalBarDiameterCm, 2)} / ${fmt(input.confinement.providedConfinementZoneHeightCm, 1)}`, unit: 'cm / cm' },
            { label: '圍束區／非圍束區間距', value: `${fmt(input.shear.spacingCm, 1)} / ${confinement.spacing.nonConfinedProvidedCm == null ? '全高圍束' : fmt(confinement.spacing.nonConfinedProvidedCm, 1)}`, unit: 'cm' },
            { label: '第一道箍筋距接頭面', value: fmt(input.confinement.firstHoopDistanceCm, 1), unit: 'cm' },
            { label: '主筋搭接', value: confinement.splice.present ? `有；錯開 ${fmt(input.confinement.spliceStaggerDistanceCm, 1)} cm` : '無', unit: '' },
          ],
        }] : []),
      ],
      diagrams: [{ title: diagram.title, dataURL: diagram.dataURL, caption: diagram.caption, width: diagram.width }],
      checks: [
        {
          group: '構材斷面與軸彎互制',
          items: [
            { label: '翼板寬厚比', formula: '(bf/2)/tf ≤ λpd', sub: `${fmt(compactness.flangeRatio, 3)} ≤ ${fmt(compactness.flangeSeismicLimit, 3)}`, value: fmt(compactness.flangeRatio, 3), ok: result.checks.flangeCompactness },
            { label: '腹板寬厚比', formula: '(D−2tf)/tw ≤ λpd', sub: `${fmt(compactness.webRatio, 3)} ≤ ${fmt(compactness.webSeismicLimit, 3)}`, value: fmt(compactness.webRatio, 3), ok: result.checks.webCompactness },
            { label: '鋼骨 P-M 互制', formula: '式 (7.3-7) 或 (7.3-8)', sub: `β = ${fmt(result.steel.finalInteraction.utilization, 5)}`, value: percent(result.steel.finalInteraction.utilization), ok: result.checks.steelInteraction },
            { label: 'RC P-M 互制', formula: '應變相容 P-M 曲線', sub: `需求比 = ${fmt(result.rc.utilization, 5)}`, value: percent(result.rc.utilization), ok: result.checks.rcInteraction },
          ],
        },
        {
          group: '第 9.3 節耐震軸向強度',
          items: [
            { label: '受壓組合', formula: '1.2PD + αLPL ± 1.4FuPE ≤ φcPn', sub: `${fmt(axial.compression.adoptedDemandTf, 2)} ≤ ${fmt(axial.compression.designStrengthTf, 2)} tf`, value: percent(axial.compression.utilization), ok: axial.omission.applied ? true : axial.compression.ok },
            { label: '受拉組合', formula: '0.9PD ± 1.4FuPE ≤ φtPn', sub: tensionText, value: axial.tension.applicable ? percent(axial.tension.utilization) : '無需求', ok: axial.omission.applied ? true : axial.tension.ok },
          ],
        },
        ...(jointRatio ? [{
          group: '第 8.4.2 節接頭撓曲強度比',
          keepTogether: true,
          pageBreakBefore: true,
          items: jointRatio.cases.flatMap(item => [
            {
              label: `${item.sense === 'clockwise' ? '順時針' : '逆時針'}鋼骨部分`,
              formula: `Σ(Mns)C / Σ(Mns)B ≥ ${fmt(item.steel.requiredRatio, 1)}`,
              sub: `${fmt(item.steel.columnSumTfM, 3)} / ${fmt(item.steel.beamSumTfM, 3)} = ${fmt(item.steel.ratio, 4)}`,
              value: percent(item.steel.utilization),
              ok: item.steel.ok,
            },
            ...(item.rc ? [{
              label: `${item.sense === 'clockwise' ? '順時針' : '逆時針'} RC 部分`,
              formula: `Σ(Mnrc)C / Σ(Mnrc)B ≥ ${fmt(item.rc.requiredRatio, 1)}`,
              sub: `${fmt(item.rc.columnSumTfM, 3)} / ${fmt(item.rc.beamSumTfM, 3)} = ${fmt(item.rc.ratio, 4)}`,
              value: percent(item.rc.utilization),
              ok: item.rc.ok,
            }] : []),
          ]),
        }] : []),
        ...((shear || strongColumn || confinement) ? [{
          group: `第 9.6 節${axisLabel}耐震子檢核`,
          items: [
            ...(shear ? [
              { label: '鋼骨柱剪力', formula: 'Vus ≤ φsVns', sub: `${fmt(shear.steel.requiredShearTf, 3)} ≤ ${fmt(shear.steel.designShearTf, 3)} tf`, value: percent(shear.steel.utilization), ok: shear.steel.ok },
              { label: 'RC 柱剪力', formula: 'Vur ≤ φrcVnrc', sub: `${fmt(shear.rc.requiredShearTf, 3)} ≤ ${fmt(shear.rc.designShearTf, 3)} tf`, value: percent(shear.rc.utilization), ok: shear.rc.ok },
            ] : []),
            ...(strongColumn ? [{ label: '強柱弱梁', formula: 'ΣMnc ≥ 1.2ΣMnb', sub: `最小 ΣMnc/ΣMnb = ${fmt(strongColumn.minimumRatio, 4)}`, value: percent(strongColumn.utilization), ok: strongColumn.ok }] : []),
            ...(confinement ? [
              { label: '圍束箍筋量', formula: 'Ash,prov ≥ max(Ash,9.6-6, Ash,9.6-7, Ash,shear)', sub: `${fmt(confinement.ash.providedCm2, 3)} ≥ ${fmt(confinement.ash.requiredCm2, 3)} cm²`, value: percent(confinement.ash.utilization), ok: confinement.checks.ash },
              { label: '圍束範圍與間距', formula: 's、lo 與第一道箍筋位置', sub: `s = ${fmt(confinement.spacing.confinedProvidedCm, 1)} ≤ ${fmt(confinement.spacing.confinedLimitCm, 1)} cm；lo = ${fmt(confinement.extent.providedCm, 1)} ≥ ${fmt(confinement.extent.requiredCm, 1)} cm`, value: confinement.ok ? 'OK' : 'NG', ok: confinement.ok },
            ] : []),
          ],
        }] : []),
      ],
      steps: [
        {
          group: '鋼骨與 RC 剛度分配',
          body: `鋼骨軸力分配比 = ${fmt(result.allocation.axialSteelRatio, 6)}\n鋼骨${axisLabel}彎矩分配比 = ${fmt(axis === 'y' ? result.allocation.momentSteelRatioY : result.allocation.momentSteelRatioX, 6)}\n初始鋼骨需求 Ps / Ms${axis} = ${fmt(result.allocation.initialSteelDemands.puTf, 4)} tf / ${fmt(axis === 'y' ? result.allocation.initialSteelDemands.muyTfM : result.allocation.initialSteelDemands.muxTfM, 4)} tf·m\n最終 RC 需求 Prc / Mrc${axis} = ${fmt(result.redistribution.finalRcDemands.puTf, 4)} tf / ${fmt(axis === 'y' ? result.redistribution.finalRcDemands.muyTfM : result.redistribution.finalRcDemands.muxTfM, 4)} tf·m`,
        },
        {
          group: '第 6.4 節鋼骨受壓與 SRC 受壓強度',
          body: `Pns,x = ${fmt(compressionStrength.steel.nominalXTf, 4)} tf；Pns,y = ${fmt(compressionStrength.steel.nominalYTf, 4)} tf\n鋼骨控制軸 = ${compressionStrength.steel.controlAxis}；φcsPns = 0.85 × ${fmt(compressionStrength.steel.nominalTf, 4)} = ${fmt(compressionStrength.steel.designTf, 4)} tf\nPnrc,short = ${fmt(compressionStrength.rc.shortNominalTf, 4)} tf\nPnrc,Euler-x / Euler-y = ${fmt(compressionStrength.rc.eulerXNominalTf, 4)} / ${fmt(compressionStrength.rc.eulerYNominalTf, 4)} tf\nφcrcPnrc = 0.65 × ${fmt(compressionStrength.rc.nominalTf, 4)} = ${fmt(compressionStrength.rc.designTf, 4)} tf\nφcPn = φcsPns + φcrcPnrc = ${fmt(compressionStrength.designCompressionStrengthTf, 4)} tf`,
        },
        {
          group: '式 (9.3-1) 受壓組合',
          body: compressionCombos.map(item => `${item.seismicSense === 'plus' ? '+' : '−'}E：1.2PD + αLPL ${item.seismicSense === 'plus' ? '+' : '−'} 1.4FuPE = ${fmt(item.signedTf, 4)} tf；採用受壓需求 = ${fmt(item.adoptedCompressionDemandTf, 4)} tf`).join('\n'),
        },
        {
          group: '式 (9.3-2) 受拉組合',
          body: tensionCombos.map(item => `${item.seismicSense === 'plus' ? '+' : '−'}E：0.9PD ${item.seismicSense === 'plus' ? '+' : '−'} 1.4FuPE = ${fmt(item.signedTf, 4)} tf；採用受拉需求 = ${fmt(item.adoptedTensionDemandTf, 4)} tf`).join('\n'),
        },
        ...(jointRatio ? [{
          group: `第 8.4.2 節接頭撓曲強度比（${jointRatio.clauses.join('、')}）`,
          body: jointRatio.cases.flatMap(item => [
            `${item.sense === 'clockwise' ? '順時針' : '逆時針'}鋼骨：Σ(Mns)C / Σ(Mns)B = ${fmt(item.steel.columnSumTfM, 4)} / ${fmt(item.steel.beamSumTfM, 4)} = ${fmt(item.steel.ratio, 6)} ≥ ${fmt(item.steel.requiredRatio, 1)}；${item.steel.ok ? 'OK' : 'NG'}`,
            ...(item.rc ? [`${item.sense === 'clockwise' ? '順時針' : '逆時針'} RC：Σ(Mnrc)C / Σ(Mnrc)B = ${fmt(item.rc.columnSumTfM, 4)} / ${fmt(item.rc.beamSumTfM, 4)} = ${fmt(item.rc.ratio, 6)} ≥ ${fmt(item.rc.requiredRatio, 1)}；${item.rc.ok ? 'OK' : 'NG'}`] : []),
          ]).join('\n'),
        }] : []),
        ...(shear ? [{
          group: `第 9.6.2 節${axisLabel}柱剪力`,
          body: [
            `Vu = (Mct + Mcb) / Ln = (${fmt(shear.demand.mctTfM, 4)} + ${fmt(shear.demand.mcbTfM, 4)}) / ${fmt(shear.demand.clearHeightCm / 100, 4)} = ${fmt(shear.demand.shearTf, 4)} tf`,
            `Mns / (Mns + Mnr) = ${fmt(shear.probableMoments.steelShare, 6)}；Mnr / (Mns + Mnr) = ${fmt(shear.probableMoments.rcShare, 6)}`,
            ...(axis === 'y' ? [`Y 向鋼骨專案確認 Vns = ${fmt(shear.steel.nominalShearTf, 4)} tf`] : []),
            ...((axis === 'x' || automaticWeakAxisRc) ? [
              `RC 第 5.5.2 節：b = ${fmt(shear.rc.sectionWidthCm, 4)} cm；d = ${fmt(shear.rc.effectiveDepthCm, 4)} cm；b′ = ${fmt(shear.rc.sectionWidthCm, 4)} − ${fmt(shear.rc.steelFrictionPlaneWidthCm, 4)} = ${fmt(shear.rc.netConcreteWidthCm, 4)} cm`,
              `一般剪力：Vnr + Vnc = ${fmt(shear.rc.transverseTf, 4)} + ${fmt(shear.rc.concreteTf, 4)} = ${fmt(shear.rc.generalTf, 4)} tf`,
              `剪力摩擦：Vnr′ + Vnc′ + Vns = ${fmt(shear.rc.frictionTransverseTf, 4)} + ${fmt(shear.rc.frictionConcreteTf, 4)} + ${fmt(shear.rc.shearStudContributionTf, 4)} = ${fmt(shear.rc.frictionTf, 4)} tf`,
              `Vnrc = min(${fmt(shear.rc.generalTf, 4)}, ${fmt(shear.rc.frictionTf, 4)}) = ${fmt(shear.rc.nominalShearTf, 4)} tf`,
            ] : [`Y 向 RC 專案確認 Vnrc = ${fmt(shear.rc.nominalShearTf, 4)} tf；Ash,shear = ${fmt(shear.rc.requiredTransverseAreaCm2, 4)} cm²`]),
            `鋼骨需求／設計剪力 = ${fmt(shear.steel.requiredShearTf, 4)} / ${fmt(shear.steel.designShearTf, 4)} tf；需求比 = ${fmt(shear.steel.utilization, 6)}`,
            `RC 需求／設計剪力 = ${fmt(shear.rc.requiredShearTf, 4)} / ${fmt(shear.rc.designShearTf, 4)} tf；需求比 = ${fmt(shear.rc.utilization, 6)}`,
            `剪力所需 Ash = ${fmt(shear.rc.requiredTransverseAreaCm2, 4)} cm²；控制模式 = ${shear.rc.governingMode}`,
          ].join('\n'),
        }] : []),
        ...(strongColumn ? [{
          group: '式 (9.6-1) 強柱弱梁',
          body: strongColumn.cases.map(item => `${item.sense === 'clockwise' ? '順時針' : '逆時針'}：ΣMnc = ${fmt(item.columnSumTfM, 4)} tf·m；1.2ΣMnb = 1.2 × ${fmt(item.beamSumTfM, 4)} = ${fmt(item.requiredColumnSumTfM, 4)} tf·m；比值 = ${fmt(item.ratio, 6)}；${item.ok ? 'OK' : 'NG'}`).join('\n'),
        }] : []),
        ...(confinement ? [{
          group: '式 (9.6-6)～(9.6-10) 矩形柱圍束',
          body: `Pn = ${fmt(confinement.axialTerms.nominalAxialTf, 4)} tf；[1 − (Ps + Phcc) / Pn] = ${fmt(confinement.axialTerms.reductionFactor, 6)}\nAsh,9.6-6 = ${fmt(confinement.ash.equation6Cm2, 4)} cm²；Ash,9.6-7 = ${fmt(confinement.ash.equation7Cm2, 4)} cm²；Ash,shear = ${fmt(confinement.ash.shearRequiredCm2, 4)} cm²\nAsh,req = ${fmt(confinement.ash.requiredCm2, 4)} cm²；Ash,prov = ${fmt(confinement.ash.providedCm2, 4)} cm²；控制模式 = ${confinement.ash.governingMode}\n圍束區 s = ${fmt(confinement.spacing.confinedProvidedCm, 2)} ≤ ${fmt(confinement.spacing.confinedLimitCm, 2)} cm；lo = ${fmt(confinement.extent.providedCm, 2)} ≥ ${fmt(confinement.extent.requiredCm, 2)} cm\n第一道箍筋距離 = ${fmt(confinement.spacing.firstHoopDistanceCm, 2)} ≤ ${fmt(confinement.spacing.firstHoopLimitCm, 2)} cm`,
        }] : []),
        {
          group: '控制結果',
          body: [
            axial.omission.applied
              ? `已依明確確認之彎矩構架免檢條件採用第 9.3 節省略；Pu/φcPn = ${fmt(axial.omission.ratio, 5)} ≤ 0.5。`
              : `受壓需求比 = ${fmt(axial.compression.utilization, 5)}；受拉需求比 = ${fmt(axial.tension.utilization, 5)}；第 9.3 節 = ${axial.ok ? 'OK' : 'NG'}`,
            jointRatio ? `第 8.4.2 節接頭撓曲強度比 = ${jointRatio.ok ? 'OK' : 'NG'}` : '',
            shear ? `第 9.6.2 節${axisLabel}柱剪力 = ${shear.ok ? 'OK' : 'NG'}` : '',
            strongColumn ? `第 9.6.1 節強柱弱梁 = ${strongColumn.ok ? 'OK' : 'NG'}` : '',
            confinement ? `第 9.6.3 節矩形柱圍束 = ${confinement.ok ? 'OK' : 'NG'}` : '',
          ].filter(Boolean).join('\n'),
        },
      ],
      summary: {
        ok: strengthOk,
        text: strengthOk
          ? `本次已實作之 SRC 柱${implementedScope}檢核通過。`
          : `本次 SRC 柱之${failedLabels(result).join('、')}未通過。`,
      },
      snapshot: {
        schema: CASE_SCHEMA,
        input: clone(input),
        result: {
          status: result.status,
          checks: clone(result.checks),
          steelUtilization: result.steel.finalInteraction.utilization,
          rcUtilization: result.rc.utilization,
           compressionUtilization: axial.compression.utilization,
           tensionUtilization: axial.tension.utilization,
           shearUtilization: shear ? Math.max(shear.steel.utilization, shear.rc.utilization) : null,
           jointRatioUtilization: jointRatio ? jointRatio.maximumUtilization : null,
           strongColumnUtilization: strongColumn ? strongColumn.utilization : null,
           confinementUtilization: confinement ? confinement.ash.utilization : null,
        },
      },
    };
  }

  function buildCasePayload(input, result, project, reportUi) {
    assertDependencies(reportUi);
    const config = buildReportConfig(input, result, project);
    const trace = reportUi.buildReportTrace(config);
    return {
      schema: CASE_SCHEMA,
      schemaVersion: 1,
      tool: { id: TOOL_ID, name: TOOL_NAME, version: PAGE_VERSION, calculationEngine: result.coreVersion },
      savedAt: new Date().toISOString(),
      project: clone(project || {}),
      input: clone(input),
      result: {
        status: result.status,
        checks: clone(result.checks),
        compressionUtilization: result.seismicAxial.compression.utilization,
        tensionUtilization: result.seismicAxial.tension.utilization,
        shearUtilization: result.shear ? Math.max(result.shear.steel.utilization, result.shear.rc.utilization) : null,
        jointRatioUtilization: result.jointFlexuralStrengthRatio?.maximumUtilization ?? null,
        strongColumnUtilization: result.strongColumnWeakBeam?.utilization ?? null,
        confinementUtilization: result.confinement?.ash?.utilization ?? null,
      },
      calculationFingerprint: trace.calculationFingerprint,
      report: { calculationFingerprint: trace.calculationFingerprint },
    };
  }

  function downloadJson(win, fileName, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = win.URL.createObjectURL(blob);
    const link = win.document.createElement('a');
    link.href = url;
    link.download = fileName;
    win.document.body.appendChild(link);
    link.click();
    link.remove();
    win.URL.revokeObjectURL(url);
  }

  function init(doc, win) {
    if (doc.documentElement.dataset.srcColumnInitialized === 'true') return;
    doc.documentElement.dataset.srcColumnInitialized = 'true';
    const reportUi = win.ToolReportUI;
    assertDependencies(reportUi);
    let lastInput = null;
    let lastResult = null;
    let lastConfig = null;
    let lastFingerprint = '';
    let calculateTimer = 0;
    const $ = id => doc.getElementById(id);

    Catalog.listSections().forEach(item => {
      const option = doc.createElement('option');
      option.value = item.id;
      option.textContent = `${item.name}${item.orderProducedAtPublication ? '（教材星號）' : ''}`;
      $('steelCatalogId').appendChild(option);
    });
    $('steelCatalogId').value = 'rh-500x304x15x24';
    $('coreVersion').textContent = `Core ${Core.CORE_VERSION}`;

    function updateDependentFields() {
      const transfer = $('applyTransferCap').checked;
      $('compressionTransferCapacityTf').disabled = !transfer;
      $('tensionTransferCapacityTf').disabled = !transfer;
      const setSubcheckEnabled = (selector, enabled) => {
        const body = doc.querySelector(selector);
        if (!body) return;
        body.classList.toggle('is-disabled', !enabled);
        body.querySelectorAll('input,select,textarea').forEach(node => { node.disabled = !enabled; });
      };
      const shearEnabled = $('enableShearSubcheck').checked;
      if (!shearEnabled) $('enableConfinementSubcheck').checked = false;
      $('enableConfinementSubcheck').disabled = !shearEnabled;
      const jointRatioEnabled = $('enableJointRatioSubcheck').checked;
      const strongColumnEnabled = $('enableStrongColumnSubcheck').checked;
      const confinementEnabled = shearEnabled && $('enableConfinementSubcheck').checked;
      setSubcheckEnabled('[data-subcheck-body="shear"]', shearEnabled);
      setSubcheckEnabled('[data-subcheck-body="joint-ratio"]', jointRatioEnabled);
      setSubcheckEnabled('[data-subcheck-body="strong-column"]', strongColumnEnabled);
      setSubcheckEnabled('[data-subcheck-body="confinement"]', confinementEnabled);
      if (jointRatioEnabled) {
        const steelBeamConnection = $('jointConnectionType').value === 'steel-beam-src-column';
        doc.querySelectorAll('[data-joint-rc]').forEach(node => {
          node.hidden = steelBeamConnection;
          node.querySelectorAll('input').forEach(input => { input.disabled = steelBeamConnection; });
        });
        doc.querySelectorAll('[data-steel-beam-alternative]').forEach(node => { node.hidden = !steelBeamConnection; });
        $('useVerifiedSmoothTransferAlternative').disabled = !steelBeamConnection;
        if (!steelBeamConnection) $('useVerifiedSmoothTransferAlternative').checked = false;
        const alternativeEnabled = steelBeamConnection && $('useVerifiedSmoothTransferAlternative').checked;
        $('smoothStressTransferAnalysisConfirmed').disabled = !alternativeEnabled;
        if (!alternativeEnabled) $('smoothStressTransferAnalysisConfirmed').checked = false;
      }
      const spliceEnabled = confinementEnabled && $('mainBarSplicePresent').checked;
      const spliceFields = doc.querySelector('[data-splice-fields]');
      if (spliceFields) {
        spliceFields.classList.toggle('is-disabled', !spliceEnabled);
        spliceFields.querySelectorAll('input').forEach(node => { node.disabled = !spliceEnabled; });
      }
      const axis = $('seismicAxis').value === 'y' ? 'y' : 'x';
      $('muxTfM').disabled = axis !== 'x';
      $('muyTfM').disabled = axis !== 'y';
      doc.querySelectorAll('[data-x-shear]').forEach(node => {
        node.hidden = axis !== 'x';
        node.querySelectorAll('input,select,textarea').forEach(input => { input.disabled = !shearEnabled || axis !== 'x'; });
      });
      doc.querySelectorAll('[data-y-shear]').forEach(node => {
        node.hidden = axis !== 'y';
        node.querySelectorAll('input,select,textarea').forEach(input => { input.disabled = !shearEnabled || axis !== 'y'; });
      });
      const automaticRc = axis === 'x' || $('weakAxisRcDesignBasis').value === 'automatic-clause-5.5.2';
      doc.querySelectorAll('[data-y-automatic-rc]').forEach(node => {
        node.hidden = axis !== 'y' || !automaticRc;
        node.querySelectorAll('input,select,textarea').forEach(input => { input.disabled = !shearEnabled || axis !== 'y' || !automaticRc; });
      });
      doc.querySelectorAll('[data-y-project-rc]').forEach(node => {
        node.hidden = axis !== 'y' || automaticRc;
        node.querySelectorAll('input,select,textarea').forEach(input => { input.disabled = !shearEnabled || axis !== 'y' || automaticRc; });
      });
      doc.querySelectorAll('[data-automatic-rc]').forEach(node => {
        node.hidden = !automaticRc;
        node.querySelectorAll('input,select,textarea').forEach(input => { input.disabled = !shearEnabled || !automaticRc; });
      });
      doc.querySelectorAll('[data-y-reinforcement]').forEach(node => {
        node.hidden = axis !== 'y';
        node.querySelectorAll('input,select,textarea').forEach(input => { input.disabled = axis !== 'y'; });
      });
      doc.querySelectorAll('[data-y-confinement]').forEach(node => {
        node.hidden = axis !== 'y';
        node.querySelectorAll('input,select,textarea').forEach(input => { input.disabled = !confinementEnabled || axis !== 'y'; });
      });
      $('highlyConfinedAreaCm2').readOnly = axis === 'y';
      if (axis === 'y') $('highlyConfinedAreaCm2').value = '0';
      const section = Catalog.getSection($('steelCatalogId').value);
      $('catalogSource').textContent = section
        ? `${section.name}：教材附錄（一）表 1-1，印刷頁 ${section.source.printedPage}／PDF 第 ${section.source.pdfPage} 頁；實際供貨與材證仍依專案確認。`
        : '尚未選擇具來源頁碼的型鋼斷面。';
    }

    function setActionStatus(message, tone = '') {
      $('actionStatus').textContent = message || '';
      $('actionStatus').className = `src-action-status ${tone}`.trim();
    }

    function renderInvalid(issues) {
      const weakAxisReferenceNode = $('weakAxisSteelReference');
      if (weakAxisReferenceNode) weakAxisReferenceNode.textContent = '';
      $('resultBadge').className = 'src-status ng';
      $('resultBadge').textContent = '輸入有誤';
      $('resultHeadline').textContent = '請修正輸入後重新核算。';
      $('metricGrid').innerHTML = '';
      $('checkList').innerHTML = `<ul>${issues.map(item => `<li>${escapeHtml(item.message || item)}</li>`).join('')}</ul>`;
      $('resultTables').innerHTML = '<p class="src-muted">輸入尚未通過檢查，未產生計算結果。</p>';
      $('sectionDiagramImage').hidden = true;
      $('sectionDiagramImage').removeAttribute('src');
      $('sectionDiagramPlaceholder').hidden = false;
      $('sectionDiagramPlaceholder').textContent = '輸入尚未通過檢查，未產生計算斷面圖。';
      $('sectionDiagramCaption').textContent = '';
      $('reportReadiness').className = 'src-readiness blocked';
      $('reportReadiness').innerHTML = `<strong>輸入未通過檢查</strong><ul>${issues.map(item => `<li>${escapeHtml(item.message || item)}</li>`).join('')}</ul><span>本區只顯示於 HTML，不進計算書、列印或 PDF。</span>`;
    }

    function metric(label, value, ok) {
      return `<div class="src-metric ${ok === false ? 'ng' : 'ok'}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
    }

    function renderResult(input, result, config) {
      const axisLabel = input.seismicAxis === 'y' ? 'Y 向（鋼骨弱軸）' : 'X 向（鋼骨強軸）';
      const axial = result.seismicAxial;
      const shear = result.shear;
      const jointRatio = result.jointFlexuralStrengthRatio;
      const strongColumn = result.strongColumnWeakBeam;
      const confinement = result.confinement;
      const failed = failedLabels(result);
      const strengthOk = result.checks.engineeringStrength === true;
      const weakAxisReferenceNode = $('weakAxisSteelReference');
      if (weakAxisReferenceNode) {
        if (input.seismicAxis === 'y' && WeakAxisReference?.calculate) {
          try {
            const reference = WeakAxisReference.calculate({
              fy: input.steel.fysKgfCm2,
              modulus: input.steel.esKgfCm2,
              flangeWidth: result.steelSection.dimensions.flangeWidthCm,
              flangeThickness: result.steelSection.dimensions.flangeThicknessCm,
              forceDivisor: 1000,
            });
            weakAxisReferenceNode.innerHTML = `<strong>專案指定參考｜AISC 360 G6 鋼骨弱軸對照</strong><span>若專案明確指定此路徑，本斷面參考 Vns = ${fmt(reference.nominalShear, 3)} tf，φVns = ${fmt(reference.designShear, 3)} tf；bf/(2tf) = ${fmt(reference.flangeSlenderness, 3)}，Cv2 = ${fmt(reference.cv2, 3)}（${reference.cv2Equation}）。</span><span>目前鋼骨計算仍採你輸入並確認的 Vns = ${fmt(input.shear.weakAxisSteelNominalShearTf, 3)} tf；此對照不自動取代採用值。RC 的 Vnrc 與 Ash,shear 則依上方選定模式處理。<a href="${escapeHtml(reference.source.url)}" target="_blank" rel="noreferrer">官方 Example G.6</a></span><span>本區只顯示於 HTML，不進計算書、列印、PDF 或計算指紋。</span>`;
          } catch (error) {
            weakAxisReferenceNode.innerHTML = '<strong>AISC G6 外部對照目前無法建立</strong><span>請先完成有效的 H 型鋼翼板尺寸、Fys 與 Es；採用的 Y 向 Vns 仍須由專案確認。</span><span>本區只顯示於 HTML，不進計算書、列印、PDF 或計算指紋。</span>';
          }
        } else {
          weakAxisReferenceNode.textContent = '';
        }
      }
      $('resultBadge').className = `src-status ${strengthOk ? 'review' : 'ng'}`;
      $('resultBadge').textContent = strengthOk ? '研究通過' : 'NG';
      $('resultHeadline').textContent = strengthOk
        ? '已實作強度檢核通過；文件仍維持私有研究狀態。'
        : `控制不符：${failed.join('、')}。`;
      $('metricGrid').innerHTML = [
        metric('SRC 設計受壓強度 φcPn', `${fmt(axial.compression.designStrengthTf, 2)} tf`, axial.compression.ok),
        metric('9.3 受壓需求比', percent(axial.compression.utilization), axial.compression.ok),
        metric('9.3 受拉需求比', axial.tension.applicable ? percent(axial.tension.utilization) : '無需求', axial.tension.ok),
        metric('鋼骨 P-M 需求比', percent(result.steel.finalInteraction.utilization), result.checks.steelInteraction),
        metric('RC P-M 需求比', percent(result.rc.utilization), result.checks.rcInteraction),
        metric('採用 Fu', `${fmt(axial.factors.adoptedFu, 2)}${axial.factors.fuCappedAt25 ? '（上限）' : ''}`, true),
        ...(jointRatio ? [metric('8.4.2 接頭比值需求比', percent(jointRatio.maximumUtilization), jointRatio.ok)] : []),
        ...(shear ? [metric(`9.6.2 ${axisLabel}柱剪力控制比`, percent(Math.max(shear.steel.utilization, shear.rc.utilization)), shear.ok)] : []),
        ...(strongColumn ? [metric('9.6.1 強柱弱梁需求比', percent(strongColumn.utilization), strongColumn.ok)] : []),
        ...(confinement ? [metric('9.6.3 圍束箍筋需求比', percent(confinement.ash.utilization), confinement.ok)] : []),
      ].join('');
      $('checkList').innerHTML = Object.entries(CHECK_LABELS).filter(([key]) => result.checks[key] != null).map(([key, label]) => {
        const ok = result.checks[key];
        return `<div class="src-check-item ${ok ? 'ok' : 'ng'}"><strong>${escapeHtml(label)}</strong><span>${ok ? 'OK' : 'NG'}</span></div>`;
      }).join('');
      $('resultTables').innerHTML = `
        <table class="src-table"><thead><tr><th>受壓強度</th><th>結果</th></tr></thead><tbody>
          <tr><td>鋼骨控制軸／φcsPns</td><td>${escapeHtml(axial.compressionStrength.steel.controlAxis)} / ${fmt(axial.compressionStrength.steel.designTf, 2)} tf</td></tr>
          <tr><td>RC 控制模式／φcrcPnrc</td><td>${escapeHtml(axial.compressionStrength.rc.governingMode)} / ${fmt(axial.compressionStrength.rc.designTf, 2)} tf</td></tr>
          <tr><td>φcPn</td><td>${fmt(axial.compressionStrength.designCompressionStrengthTf, 2)} tf</td></tr>
        </tbody></table>
        <table class="src-table"><thead><tr><th>第 9.3 節</th><th>需求 / 強度</th></tr></thead><tbody>
          <tr><td>受壓控制</td><td>${fmt(axial.compression.adoptedDemandTf, 2)} / ${fmt(axial.compression.designStrengthTf, 2)} tf</td></tr>
          <tr><td>受拉控制</td><td>${axial.tension.applicable ? `${fmt(axial.tension.adoptedDemandTf, 2)} / ${fmt(axial.tension.designStrengthTf, 2)} tf` : '未產生拉力需求'}</td></tr>
          <tr><td>免檢條件</td><td>${axial.omission.applied ? '已採用' : '未採用'}；Pu/φcPn = ${fmt(axial.omission.ratio, 3)}</td></tr>
        </tbody></table>
        ${shear ? `<table class="src-table"><thead><tr><th>第 9.6.2 節柱剪力</th><th>需求 / 設計強度</th></tr></thead><tbody>
          <tr><td>柱剪力 Vu</td><td>${fmt(shear.demand.shearTf, 3)} tf</td></tr>
          <tr><td>鋼骨部分</td><td>${fmt(shear.steel.requiredShearTf, 3)} / ${fmt(shear.steel.designShearTf, 3)} tf</td></tr>
          <tr><td>RC 部分</td><td>${fmt(shear.rc.requiredShearTf, 3)} / ${fmt(shear.rc.designShearTf, 3)} tf</td></tr>
        </tbody></table>` : ''}
        ${jointRatio ? `<table class="src-table"><thead><tr><th>第 8.4.2 節接頭撓曲強度比</th><th>柱 / 梁；比值</th></tr></thead><tbody>
          ${jointRatio.cases.flatMap(item => [
            `<tr><td>${item.sense === 'clockwise' ? '順時針' : '逆時針'}鋼骨</td><td>${fmt(item.steel.columnSumTfM, 3)} / ${fmt(item.steel.beamSumTfM, 3)} tf·m；${fmt(item.steel.ratio, 3)}</td></tr>`,
            ...(item.rc ? [`<tr><td>${item.sense === 'clockwise' ? '順時針' : '逆時針'} RC</td><td>${fmt(item.rc.columnSumTfM, 3)} / ${fmt(item.rc.beamSumTfM, 3)} tf·m；${fmt(item.rc.ratio, 3)}</td></tr>`] : []),
          ]).join('')}
        </tbody></table>` : ''}
        ${strongColumn ? `<table class="src-table"><thead><tr><th>第 9.6.1 節強柱弱梁</th><th>ΣMnc / ΣMnb</th></tr></thead><tbody>
          ${strongColumn.cases.map(item => `<tr><td>${item.sense === 'clockwise' ? '順時針' : '逆時針'}</td><td>${fmt(item.columnSumTfM, 2)} / ${fmt(item.beamSumTfM, 2)} tf·m（比值 ${fmt(item.ratio, 3)}）</td></tr>`).join('')}
        </tbody></table>` : ''}
        ${confinement ? `<table class="src-table"><thead><tr><th>第 9.6.3 節矩形柱圍束</th><th>結果</th></tr></thead><tbody>
          <tr><td>Ash 提供 / 需求</td><td>${fmt(confinement.ash.providedCm2, 3)} / ${fmt(confinement.ash.requiredCm2, 3)} cm²</td></tr>
          <tr><td>圍束區間距 提供 / 上限</td><td>${fmt(confinement.spacing.confinedProvidedCm, 1)} / ${fmt(confinement.spacing.confinedLimitCm, 1)} cm</td></tr>
          <tr><td>圍束高度 提供 / 需求</td><td>${fmt(confinement.extent.providedCm, 1)} / ${fmt(confinement.extent.requiredCm, 1)} cm</td></tr>
        </tbody></table>` : ''}`;
      const diagram = config?.diagrams?.[0];
      $('sectionDiagramImage').src = diagram?.dataURL || '';
      $('sectionDiagramImage').hidden = !diagram;
      $('sectionDiagramPlaceholder').hidden = Boolean(diagram);
      $('sectionDiagramCaption').textContent = diagram?.caption || '';
      $('reportReadiness').className = strengthOk ? 'src-readiness review' : 'src-readiness ng';
      $('reportReadiness').innerHTML = strengthOk
        ? `<strong>${escapeHtml(axisLabel)}研究計算完成</strong><span>可產生並列印內部審閱計算書；正式附件核可仍封閉。正交方向、接頭區剪力與接合細部、完整構架範圍仍須另案完成。</span><span>本區只顯示於 HTML，不進計算書、列印或 PDF。</span>`
        : `<strong>工程結果含 NG</strong><span>${escapeHtml(failed.join('、'))}不符；研究計算書仍可如實列印結果。</span><span>本區只顯示於 HTML，不進計算書、列印或 PDF。</span>`;
    }

    function calculate(options = {}) {
      updateDependentFields();
      const input = readCoreInput(doc);
      try {
        const result = Core.calculate(input);
        const config = buildReportConfig(input, result, readProject(doc));
        const trace = reportUi.buildReportTrace(config);
        lastInput = clone(input);
        lastResult = result;
        lastConfig = config;
        lastFingerprint = trace.calculationFingerprint;
        win.lastSrcColumnInput = clone(input);
        win.lastSrcColumnResult = result;
        win.lastSrcColumnReportConfig = config;
        win.lastSrcColumnCalculationFingerprint = lastFingerprint;
        renderResult(input, result, config);
        if (options.announce !== false) setActionStatus(`核算完成；計算指紋 ${lastFingerprint}。`, 'ok');
        return result;
      } catch (error) {
        lastInput = null;
        lastResult = null;
        lastConfig = null;
        lastFingerprint = '';
        win.lastSrcColumnInput = null;
        win.lastSrcColumnResult = null;
        win.lastSrcColumnReportConfig = null;
        win.lastSrcColumnCalculationFingerprint = '';
        const issues = Array.isArray(error?.issues) ? error.issues : [{ message: error?.message || String(error) }];
        renderInvalid(issues);
        if (options.announce !== false) setActionStatus(`無法計算：${issues.map(item => item.message).join('；')}`, 'error');
        return null;
      }
    }

    function scheduleCalculate() {
      win.clearTimeout(calculateTimer);
      calculateTimer = win.setTimeout(() => calculate({ announce: false }), 120);
    }

    function ensureCurrent() {
      const result = calculate({ announce: false });
      if (!result) throw new Error('輸入尚未通過檢查，無法產生輸出。');
      return result;
    }

    function currentPayload() {
      ensureCurrent();
      return buildCasePayload(lastInput, lastResult, readProject(doc), reportUi);
    }

    function captureState() {
      return { input: readCoreInput(doc), project: readProject(doc) };
    }

    function restoreState(state) {
      writeCoreInput(doc, state.input);
      writeProject(doc, state.project);
      updateDependentFields();
      calculate({ announce: false });
    }

    async function importCase(file) {
      if (!file) return;
      if (Number(file.size || 0) > 1024 * 1024) throw new Error('案件 JSON 超過 1 MiB。');
      let payload;
      try { payload = JSON.parse(await file.text()); }
      catch { throw new Error('案件 JSON 無法解析。'); }
      const previous = captureState();
      try {
        const migration = migrateCasePayload(payload);
        payload = migration.payload;
        if (!migration.migrated) {
          reportUi.validateCalculationCasePayload(payload, {
            expectedSchema: CASE_SCHEMA,
            expectedToolId: TOOL_ID,
            expectedVersion: PAGE_VERSION,
          });
        }
        if (!payload.input || typeof payload.input !== 'object') throw new Error('案件 JSON 缺少計算輸入。');
        writeCoreInput(doc, payload.input);
        writeProject(doc, payload.project || {});
        updateDependentFields();
        const result = calculate({ announce: false });
        if (!result) throw new Error('案件 JSON 套用後未通過輸入檢核。');
        if (migration.migrated) {
          setActionStatus(`已升級 ${migration.sourceVersion} 案件並以現行核心重算；原 Y 向 RC 專案確認值已保留，新計算指紋 ${lastFingerprint}。`, 'ok');
        } else {
          reportUi.assertCalculationCaseReplay(payload, lastFingerprint);
          setActionStatus(`已匯入 ${file.name || '案件 JSON'}，重算指紋一致。`, 'ok');
        }
      } catch (error) {
        restoreState(previous);
        throw new Error(`${error.message || error}；已保留原輸入。`);
      }
    }

    $('btnCalculate').addEventListener('click', () => calculate({ announce: true }));
    $('btnReport').addEventListener('click', () => {
      try {
        ensureCurrent();
        win.openReport(lastConfig);
      } catch (error) { setActionStatus(error.message || String(error), 'error'); }
    });
    $('btnExportCase').addEventListener('click', () => {
      try {
        const payload = currentPayload();
        downloadJson(win, `src-column-research-case-${payload.savedAt.slice(0, 10)}.json`, payload);
        setActionStatus(`案件 JSON 已下載；計算指紋 ${payload.calculationFingerprint}。`, 'ok');
      } catch (error) { setActionStatus(error.message || String(error), 'error'); }
    });
    $('btnImportCase').addEventListener('click', () => $('caseFile').click());
    $('caseFile').addEventListener('change', async event => {
      const file = event.target.files?.[0];
      try { await importCase(file); }
      catch (error) { setActionStatus(`匯入失敗：${error.message || error}`, 'error'); }
      finally { event.target.value = ''; }
    });
    [...NUMBER_FIELDS, ...CHECK_FIELDS, 'steelCatalogId', 'steelGrade', 'jointConnectionType', 'seismicAxis', 'weakAxisRcDesignBasis'].forEach(id => {
      const node = $(id);
      if (!node) return;
      node.addEventListener('input', scheduleCalculate);
      node.addEventListener('change', scheduleCalculate);
    });
    ['projName', 'projNo', 'projDesigner'].forEach(id => {
      $(id).addEventListener('input', () => {
        if (!lastResult) return;
        lastConfig = buildReportConfig(lastInput, lastResult, readProject(doc));
        lastFingerprint = reportUi.buildReportTrace(lastConfig).calculationFingerprint;
        win.lastSrcColumnReportConfig = lastConfig;
        win.lastSrcColumnCalculationFingerprint = lastFingerprint;
      });
    });

    win.runSrcColumnCalculation = () => calculate({ announce: true });
    win.buildSrcColumnCasePayload = currentPayload;
    win.importSrcColumnCaseFile = importCase;
    updateDependentFields();
    calculate({ announce: false });
  }

  return Object.freeze({
    PAGE_VERSION,
    TOOL_ID,
    CASE_SCHEMA,
    PREVIOUS_CASE_SCHEMA,
    PREVIOUS_PAGE_VERSION,
    LEGACY_CASE_SCHEMA,
    LEGACY_PAGE_VERSION,
    TOOL_NAME,
    REPORT_TITLE,
    readCoreInput,
    writeCoreInput,
    buildReportConfig,
    buildSectionDiagram,
    buildCasePayload,
    migrateCasePayload,
    failedLabels,
    reviewLabels,
    init,
  });
});
