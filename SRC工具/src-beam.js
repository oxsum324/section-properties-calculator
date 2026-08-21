(function initSrcBeamPage(root, factory) {
  const core = root.SrcBeamCore || (typeof require === 'function' ? require('./core/src-beam-core.js') : null);
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SrcBeamPage = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => api.init(document, root));
    else api.init(document, root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildSrcBeamPage(Core) {
  'use strict';

  const PAGE_VERSION = 'v1.0';
  const TOOL_ID = 'src-beam';
  const CASE_SCHEMA = 'src-beam.case.v1';
  const TOOL_NAME = 'SRC 梁正式規範核算工具';
  const REPORT_TITLE = 'SRC 梁正式規範核算計算書';
  const REGULATION_LABEL = '鋼骨鋼筋混凝土構造設計規範與解說（100 年修正版）';
  const SECTION_DIAGRAM_TITLE = 'SRC 梁計算斷面';
  const SECTION_DIAGRAM_CAPTION = '混凝土及 H 型鋼依採用尺寸比例繪製；As／As′ 為計算面積位置標示，本圖非施工配筋詳圖。';
  const NUMBER_FIELDS = Object.freeze([
    'puTf', 'muTfM', 'vuTf',
    'bCm', 'hCm', 'fcKgfCm2', 'flexureDepthCm', 'compressionSteelDepthCm', 'shearDepthCm',
    'asTensionCm2', 'asCompressionCm2', 'esKgfCm2', 'fyrTensionKgfCm2', 'fyrCompressionKgfCm2',
    'avCm2', 'avfCm2', 'spacingCm', 'fyhKgfCm2',
    'steelDepthCm', 'flangeWidthCm', 'flangeThicknessCm', 'webThicknessCm', 'zCm3', 'fysKgfCm2', 'fywKgfCm2',
    'frictionMu', 'frictionK1', 'studContributionTf', 'longitudinalClearSpacingMm',
  ]);
  const CHECK_FIELDS = Object.freeze([
    'fullyEncased', 'normalWeightConcrete', 'monolithicSurface', 'mainBarsContinuous',
    'reinforcementDetailingConfirmed', 'temporaryShoringProvided', 'steelConstructionCapacityVerified',
    'highStrengthConcreteEvidenceConfirmed', 'highStrengthMaterialEvidenceConfirmed', 'seismicDesign',
  ]);
  const CHECK_LABELS = Object.freeze({
    flangeCompactness: '翼板寬厚比',
    webCompactness: '腹板寬厚比',
    flexure: '彎矩強度',
    steelShearShare: '鋼骨剪力分擔',
    rcShearShare: 'RC 剪力分擔',
  });

  function assertDependencies(reportUi) {
    if (!Core) throw new Error('SRC 梁計算核心未載入。');
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

  function assertSectionDiagramInput(input) {
    const concrete = input?.concrete || {};
    const steel = input?.steel || {};
    const values = [
      concrete.bCm, concrete.hCm, concrete.flexureDepthCm,
      concrete.compressionSteelDepthCm, concrete.shearDepthCm,
      steel.depthCm, steel.flangeWidthCm, steel.flangeThicknessCm, steel.webThicknessCm,
    ].map(Number);
    if (values.some(value => !Number.isFinite(value) || value <= 0)) {
      throw new Error('SRC 梁計算斷面圖缺少有效的正值尺寸。');
    }
    const [b, h, d, dPrime, dv, steelDepth, flangeWidth, flangeThickness, webThickness] = values;
    if (d >= h || dPrime >= d || dv >= h) throw new Error('SRC 梁計算斷面圖的有效深度超出混凝土斷面。');
    if (steelDepth >= h || flangeWidth >= b) throw new Error('SRC 梁計算斷面圖的 H 型鋼未完全包覆於混凝土斷面。');
    if (2 * flangeThickness >= steelDepth || webThickness >= flangeWidth) {
      throw new Error('SRC 梁計算斷面圖的 H 型鋼幾何尺寸無效。');
    }
  }

  function buildSectionDiagram(input) {
    assertSectionDiagramInput(input);
    const concrete = input.concrete;
    const steel = input.steel;
    const reinforcement = input.reinforcement || {};
    const b = Number(concrete.bCm);
    const h = Number(concrete.hCm);
    const d = Number(concrete.flexureDepthCm);
    const dPrime = Number(concrete.compressionSteelDepthCm);
    const dv = Number(concrete.shearDepthCm);
    const plot = { x: 72, y: 50, width: 330, height: 360 };
    const scale = Math.min(plot.width / b, plot.height / h);
    const sectionWidth = b * scale;
    const sectionHeight = h * scale;
    const x = plot.x + (plot.width - sectionWidth) / 2;
    const y = plot.y + (plot.height - sectionHeight) / 2;
    const x2 = x + sectionWidth;
    const y2 = y + sectionHeight;
    const cx = x + sectionWidth / 2;
    const cy = y + sectionHeight / 2;
    const steelDepth = Number(steel.depthCm) * scale;
    const flangeWidth = Number(steel.flangeWidthCm) * scale;
    const flangeThickness = Number(steel.flangeThicknessCm) * scale;
    const webThickness = Number(steel.webThicknessCm) * scale;
    const steelTop = cy - steelDepth / 2;
    const steelLeft = cx - flangeWidth / 2;
    const webLeft = cx - webThickness / 2;
    const compressionY = y + dPrime * scale;
    const tensionY = y + d * scale;
    const shearY = y + dv * scale;
    const hDimX = x - 28;
    const depthDimension = (dimensionX, targetY, label, color) => `
      <line class="extension" x1="${x2 + 5}" y1="${y}" x2="${dimensionX}" y2="${y}"/>
      <line class="extension" x1="${x2 + 5}" y1="${targetY}" x2="${dimensionX}" y2="${targetY}"/>
      <line x1="${dimensionX}" y1="${y}" x2="${dimensionX}" y2="${targetY}" stroke="${color}" marker-start="url(#arrow-${label.replace('′', 'p')})" marker-end="url(#arrow-${label.replace('′', 'p')})"/>
      <text class="dimension-label" x="${dimensionX + 5}" y="${(y + targetY) / 2}" fill="${color}">${escapeXml(label)}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 450" role="img" aria-labelledby="src-section-title src-section-desc">
      <title id="src-section-title">${SECTION_DIAGRAM_TITLE}</title>
      <desc id="src-section-desc">矩形混凝土斷面內置中雙對稱 H 型鋼；主筋以 As 與 As′ 計算面積位置表示。</desc>
      <defs>
        <marker id="arrow-d" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7 Z" fill="#9a3412"/></marker>
        <marker id="arrow-dp" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7 Z" fill="#7c3aed"/></marker>
        <marker id="arrow-dv" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7 Z" fill="#047857"/></marker>
        <marker id="arrow-dim" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7 Z" fill="#334155"/></marker>
        <style>
          text{font-family:"Noto Sans TC","Microsoft JhengHei",Arial,sans-serif;fill:#172033}
          .dimension{stroke:#334155;stroke-width:1.4;marker-start:url(#arrow-dim);marker-end:url(#arrow-dim)}
          .extension{stroke:#94a3b8;stroke-width:1;stroke-dasharray:3 3}
          .dimension-label{font-size:14px;font-weight:700;dominant-baseline:middle}
          .legend-title{font-size:17px;font-weight:800}.legend{font-size:14px}.legend-small{font-size:12px;fill:#475569}
          .area-line{fill:none;stroke-width:3;stroke-dasharray:7 5}
        </style>
      </defs>
      <rect x="0.5" y="0.5" width="719" height="449" rx="10" fill="#ffffff" stroke="#cbd5e1"/>
      <rect x="${x}" y="${y}" width="${sectionWidth}" height="${sectionHeight}" fill="#f1f5f9" stroke="#334155" stroke-width="2.2"/>
      <line class="area-line" x1="${x + 10}" y1="${compressionY}" x2="${x2 - 10}" y2="${compressionY}" stroke="#7c3aed"/>
      <line class="area-line" x1="${x + 10}" y1="${tensionY}" x2="${x2 - 10}" y2="${tensionY}" stroke="#9a3412"/>
      <rect x="${steelLeft}" y="${steelTop}" width="${flangeWidth}" height="${flangeThickness}" fill="#2563eb" stroke="#1e3a8a" stroke-width="1.3"/>
      <rect x="${webLeft}" y="${steelTop + flangeThickness}" width="${webThickness}" height="${steelDepth - 2 * flangeThickness}" fill="#2563eb" stroke="#1e3a8a" stroke-width="1.3"/>
      <rect x="${steelLeft}" y="${steelTop + steelDepth - flangeThickness}" width="${flangeWidth}" height="${flangeThickness}" fill="#2563eb" stroke="#1e3a8a" stroke-width="1.3"/>
      <line class="extension" x1="${x}" y1="${y - 5}" x2="${x}" y2="${y - 30}"/>
      <line class="extension" x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y - 30}"/>
      <line class="dimension" x1="${x}" y1="${y - 25}" x2="${x2}" y2="${y - 25}"/>
      <text class="dimension-label" x="${cx}" y="${y - 39}" text-anchor="middle">b = ${fmt(b, 1)} cm</text>
      <line class="extension" x1="${x - 5}" y1="${y}" x2="${hDimX}" y2="${y}"/>
      <line class="extension" x1="${x - 5}" y1="${y2}" x2="${hDimX}" y2="${y2}"/>
      <line class="dimension" x1="${hDimX}" y1="${y}" x2="${hDimX}" y2="${y2}"/>
      <text class="dimension-label" x="${hDimX - 9}" y="${cy}" text-anchor="middle" transform="rotate(-90 ${hDimX - 9} ${cy})">h = ${fmt(h, 1)} cm</text>
      ${depthDimension(x2 + 22, compressionY, 'd′', '#7c3aed')}
      ${depthDimension(x2 + 50, tensionY, 'd', '#9a3412')}
      ${depthDimension(x2 + 78, shearY, 'dv', '#047857')}
      <g transform="translate(470 78)">
        <text class="legend-title" x="0" y="0">採用斷面</text>
        <rect x="0" y="22" width="18" height="18" fill="#f1f5f9" stroke="#334155"/><text class="legend" x="28" y="36">混凝土 ${fmt(b, 1)} × ${fmt(h, 1)} cm</text>
        <rect x="0" y="56" width="18" height="18" fill="#2563eb" stroke="#1e3a8a"/><text class="legend" x="28" y="70">H 型鋼（置中）</text>
        <text class="legend-small" x="28" y="91">D × bf × tw × tf</text>
        <text class="legend" x="28" y="112">${fmt(steel.depthCm, 1)} × ${fmt(steel.flangeWidthCm, 1)} × ${fmt(steel.webThicknessCm, 1)} × ${fmt(steel.flangeThicknessCm, 1)} cm</text>
        <line x1="0" y1="148" x2="20" y2="148" stroke="#7c3aed" stroke-width="3" stroke-dasharray="7 5"/><text class="legend" x="28" y="153">As′ = ${fmt(reinforcement.asCompressionCm2, 3)} cm²</text>
        <line x1="0" y1="181" x2="20" y2="181" stroke="#9a3412" stroke-width="3" stroke-dasharray="7 5"/><text class="legend" x="28" y="186">As = ${fmt(reinforcement.asTensionCm2, 3)} cm²</text>
        <text class="legend" x="0" y="228" fill="#7c3aed">d′ = ${fmt(dPrime, 1)} cm</text>
        <text class="legend" x="0" y="257" fill="#9a3412">d = ${fmt(d, 1)} cm</text>
        <text class="legend" x="0" y="286" fill="#047857">dv = ${fmt(dv, 1)} cm</text>
        <text class="legend-small" x="0" y="333">Av / s = ${fmt(reinforcement.avCm2, 3)} cm² / ${fmt(reinforcement.spacingCm, 1)} cm</text>
      </g>
    </svg>`;
    return Object.freeze({
      title: SECTION_DIAGRAM_TITLE,
      caption: SECTION_DIAGRAM_CAPTION,
      width: 640,
      svg,
      dataURL: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    });
  }

  function readProject(doc) {
    const normalize = value => String(value || '').trim().replace(/^未填$/, '');
    return {
      name: normalize(doc.getElementById('projName')?.value),
      no: normalize(doc.getElementById('projNo')?.value),
      designer: normalize(doc.getElementById('projDesigner')?.value),
    };
  }

  function readCoreInput(doc) {
    const number = id => finite(doc.getElementById(id)?.value);
    const checked = id => doc.getElementById(id)?.checked === true;
    return {
      schema: Core.INPUT_SCHEMA,
      demands: {
        puTf: number('puTf'),
        muTfM: number('muTfM'),
        vuTf: number('vuTf'),
      },
      concrete: {
        bCm: number('bCm'),
        hCm: number('hCm'),
        fcKgfCm2: number('fcKgfCm2'),
        flexureDepthCm: number('flexureDepthCm'),
        compressionSteelDepthCm: number('compressionSteelDepthCm'),
        shearDepthCm: number('shearDepthCm'),
      },
      reinforcement: {
        asTensionCm2: number('asTensionCm2'),
        asCompressionCm2: number('asCompressionCm2'),
        esKgfCm2: number('esKgfCm2'),
        fyrTensionKgfCm2: number('fyrTensionKgfCm2'),
        fyrCompressionKgfCm2: number('fyrCompressionKgfCm2'),
        avCm2: number('avCm2'),
        avfCm2: number('avfCm2'),
        spacingCm: number('spacingCm'),
        fyhKgfCm2: number('fyhKgfCm2'),
      },
      steel: {
        grade: String(doc.getElementById('steelGrade')?.value || ''),
        depthCm: number('steelDepthCm'),
        flangeWidthCm: number('flangeWidthCm'),
        flangeThicknessCm: number('flangeThicknessCm'),
        webThicknessCm: number('webThicknessCm'),
        zCm3: number('zCm3'),
        fysKgfCm2: number('fysKgfCm2'),
        fywKgfCm2: number('fywKgfCm2'),
      },
      shearFriction: {
        mu: number('frictionMu'),
        k1KgfCm2: number('frictionK1'),
        studContributionTf: number('studContributionTf'),
      },
      detailing: {
        fullyEncased: checked('fullyEncased'),
        normalWeightConcrete: checked('normalWeightConcrete'),
        monolithicShearFrictionSurface: checked('monolithicSurface'),
        mainBarsContinuous: checked('mainBarsContinuous'),
        reinforcementDetailingConfirmed: checked('reinforcementDetailingConfirmed'),
        temporaryShoringProvided: checked('temporaryShoringProvided'),
        steelConstructionCapacityVerified: checked('steelConstructionCapacityVerified'),
        highStrengthConcreteEvidenceConfirmed: checked('highStrengthConcreteEvidenceConfirmed'),
        highStrengthMaterialEvidenceConfirmed: checked('highStrengthMaterialEvidenceConfirmed'),
        longitudinalClearSpacingMm: number('longitudinalClearSpacingMm'),
        seismicDesign: checked('seismicDesign'),
      },
    };
  }

  function writeCoreInput(doc, input) {
    const setValue = (id, value) => {
      const node = doc.getElementById(id);
      if (node && value != null) node.value = String(value);
    };
    const setChecked = (id, value) => {
      const node = doc.getElementById(id);
      if (node) node.checked = value === true;
    };
    const d = input.demands || {};
    const c = input.concrete || {};
    const r = input.reinforcement || {};
    const s = input.steel || {};
    const f = input.shearFriction || {};
    const detail = input.detailing || {};
    [
      ['puTf', d.puTf], ['muTfM', d.muTfM], ['vuTf', d.vuTf],
      ['bCm', c.bCm], ['hCm', c.hCm], ['fcKgfCm2', c.fcKgfCm2], ['flexureDepthCm', c.flexureDepthCm],
      ['compressionSteelDepthCm', c.compressionSteelDepthCm], ['shearDepthCm', c.shearDepthCm],
      ['asTensionCm2', r.asTensionCm2], ['asCompressionCm2', r.asCompressionCm2], ['esKgfCm2', r.esKgfCm2],
      ['fyrTensionKgfCm2', r.fyrTensionKgfCm2], ['fyrCompressionKgfCm2', r.fyrCompressionKgfCm2],
      ['avCm2', r.avCm2], ['avfCm2', r.avfCm2], ['spacingCm', r.spacingCm], ['fyhKgfCm2', r.fyhKgfCm2],
      ['steelDepthCm', s.depthCm], ['flangeWidthCm', s.flangeWidthCm], ['flangeThicknessCm', s.flangeThicknessCm],
      ['webThicknessCm', s.webThicknessCm], ['zCm3', s.zCm3], ['fysKgfCm2', s.fysKgfCm2], ['fywKgfCm2', s.fywKgfCm2],
      ['frictionMu', f.mu], ['frictionK1', f.k1KgfCm2], ['studContributionTf', f.studContributionTf],
      ['longitudinalClearSpacingMm', detail.longitudinalClearSpacingMm],
    ].forEach(([id, value]) => setValue(id, value));
    setValue('steelGrade', s.grade);
    [
      ['fullyEncased', detail.fullyEncased], ['normalWeightConcrete', detail.normalWeightConcrete],
      ['monolithicSurface', detail.monolithicShearFrictionSurface], ['mainBarsContinuous', detail.mainBarsContinuous],
      ['reinforcementDetailingConfirmed', detail.reinforcementDetailingConfirmed],
      ['temporaryShoringProvided', detail.temporaryShoringProvided],
      ['steelConstructionCapacityVerified', detail.steelConstructionCapacityVerified],
      ['highStrengthConcreteEvidenceConfirmed', detail.highStrengthConcreteEvidenceConfirmed],
      ['highStrengthMaterialEvidenceConfirmed', detail.highStrengthMaterialEvidenceConfirmed],
      ['seismicDesign', detail.seismicDesign],
    ].forEach(([id, value]) => setChecked(id, value));
  }

  function writeProject(doc, project) {
    ['name', 'no', 'designer'].forEach(key => {
      const id = key === 'name' ? 'projName' : (key === 'no' ? 'projNo' : 'projDesigner');
      const node = doc.getElementById(id);
      if (node) node.value = String(project?.[key] || '').trim().replace(/^未填$/, '');
    });
  }

  function failedLabels(result) {
    return (result.failedChecks || []).map(key => CHECK_LABELS[key] || key);
  }

  function reviewLabels(result) {
    return (result.reviewItems || []).map(item => item.message || item.code || '人工複核');
  }

  function buildReportConfig(input, result, project) {
    const flexure = result.flexure;
    const shear = result.shear;
    const compactness = result.compactness;
    const checks = result.checks;
    const overallStrengthOk = Object.values(checks).every(Boolean);
    const sectionDiagram = buildSectionDiagram(input);
    return {
      title: REPORT_TITLE,
      subtitle: 'Fully Encased SRC Beam Design Report',
      toolName: TOOL_NAME,
      toolVersion: PAGE_VERSION,
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
          group: '規範與構材條件',
          items: [
            { label: '採用規範', value: REGULATION_LABEL, unit: '' },
            { label: '構材型式', value: '完全包覆型矩形 SRC 梁；置中雙對稱 H 型鋼骨', unit: '' },
            { label: '設計範圍', value: '無軸力、非耐震構材強度檢核', unit: '' },
            { label: 'Pu', value: fmt(input.demands.puTf, 2), unit: 'tf' },
            { label: '混凝土／澆置', value: '常重混凝土；剪力摩擦面整體澆置', unit: '' },
            { label: '主筋／淨距', value: `主筋連續；淨距 ${fmt(input.detailing.longitudinalClearSpacingMm, 0)} mm`, unit: '' },
          ],
        },
        {
          group: '設計需求與混凝土斷面',
          items: [
            { label: 'Mu', value: fmt(input.demands.muTfM, 2), unit: 'tf·m' },
            { label: 'Vu', value: fmt(input.demands.vuTf, 2), unit: 'tf' },
            { label: 'b × h', value: `${fmt(input.concrete.bCm, 1)} × ${fmt(input.concrete.hCm, 1)}`, unit: 'cm' },
            { label: "fc′", value: fmt(input.concrete.fcKgfCm2, 0), unit: 'kgf/cm²' },
            { label: 'd / d′ / dv', value: `${fmt(input.concrete.flexureDepthCm, 1)} / ${fmt(input.concrete.compressionSteelDepthCm, 1)} / ${fmt(input.concrete.shearDepthCm, 1)}`, unit: 'cm' },
          ],
        },
        {
          group: '主筋、箍筋與鋼骨',
          items: [
            { label: 'As / As′', value: `${fmt(input.reinforcement.asTensionCm2, 3)} / ${fmt(input.reinforcement.asCompressionCm2, 3)}`, unit: 'cm²' },
            { label: 'Fyr / Fyr′', value: `${fmt(input.reinforcement.fyrTensionKgfCm2, 0)} / ${fmt(input.reinforcement.fyrCompressionKgfCm2, 0)}`, unit: 'kgf/cm²' },
            { label: 'Av / Avf / s', value: `${fmt(input.reinforcement.avCm2, 3)} / ${fmt(input.reinforcement.avfCm2, 3)} / ${fmt(input.reinforcement.spacingCm, 1)}`, unit: 'cm² / cm² / cm' },
            { label: '鋼骨', value: `${input.steel.grade}；H ${fmt(input.steel.depthCm, 1)} × ${fmt(input.steel.flangeWidthCm, 1)} × ${fmt(input.steel.webThicknessCm, 1)} × ${fmt(input.steel.flangeThicknessCm, 1)}`, unit: 'cm' },
            { label: 'Z / Fys / Fyw', value: `${fmt(input.steel.zCm3, 1)} / ${fmt(input.steel.fysKgfCm2, 0)} / ${fmt(input.steel.fywKgfCm2, 0)}`, unit: 'cm³ / kgf/cm²' },
          ],
        },
      ],
      diagrams: [{
        title: sectionDiagram.title,
        dataURL: sectionDiagram.dataURL,
        caption: sectionDiagram.caption,
        width: sectionDiagram.width,
      }],
      checks: [
        {
          group: '寬厚比與撓曲強度',
          items: [
            { label: '翼板寬厚比', formula: '(bf/2)/tf ≤ λp', sub: `${fmt(compactness.flangeRatio, 3)} ≤ ${fmt(compactness.flangeLimit, 3)}`, value: fmt(compactness.flangeRatio, 3), ok: checks.flangeCompactness },
            { label: '腹板寬厚比', formula: '(D−2tf)/tw ≤ λp', sub: `${fmt(compactness.webRatio, 3)} ≤ ${fmt(compactness.webLimit, 3)}`, value: fmt(compactness.webRatio, 3), ok: checks.webCompactness },
            { label: '彎矩強度（5.4.1）', formula: 'Mu ≤ 0.9Mns + 0.9Mnrc', sub: `${fmt(flexure.demandTfM, 2)} ≤ ${fmt(flexure.designMomentTfM, 2)}`, value: percent(flexure.utilization), ok: checks.flexure },
          ],
        },
        {
          group: '剪力分擔強度',
          items: [
            { label: '鋼骨剪力分擔（5.5）', formula: '(Mns/Mn)Vu ≤ 0.9Vns', sub: `${fmt(shear.steelDemandTf, 2)} ≤ ${fmt(shear.phiVnSteelTf, 2)}`, value: percent(shear.steelUtilization), ok: checks.steelShearShare },
            { label: 'RC 剪力分擔（5.5）', formula: '(Mnrc/Mn)Vu ≤ 0.75Vnrc', sub: `${fmt(shear.rcDemandTf, 2)} ≤ ${fmt(shear.phiVnRcTf, 2)}`, value: percent(shear.rcUtilization), ok: checks.rcShearShare },
          ],
        },
      ],
      steps: [
        {
          group: 'RC 撓曲內力平衡',
          body: `β1 = ${fmt(flexure.beta1, 4)}\nc = ${fmt(flexure.neutralAxisCm, 4)} cm；a = β1c = ${fmt(flexure.stressBlockDepthCm, 4)} cm\nCc = ${fmt(flexure.concreteForceTf, 4)} tf；Cs′ = ${fmt(flexure.compressionSteel.forceTf, 4)} tf\nMnrc = Cc(d−a/2) + Cs′(d−d′) = ${fmt(flexure.mnRcTfM, 4)} tf·m`,
        },
        {
          group: 'SRC 撓曲強度疊加',
          body: `Mns = ZFys = ${fmt(flexure.mnSteelTfM, 4)} tf·m\nMn = Mns + Mnrc = ${fmt(flexure.nominalMomentTfM, 4)} tf·m\nφMn = 0.9Mns + 0.9Mnrc = ${fmt(flexure.designMomentTfM, 4)} tf·m\nMu/φMn = ${fmt(flexure.utilization, 4)}`,
        },
        {
          group: '鋼骨與 RC 剪力容量',
          body: `Vns = 0.6FywAw = ${fmt(shear.vnSteelTf, 4)} tf；0.9Vns = ${fmt(shear.phiVnSteelTf, 4)} tf\nVnrc,general = Vnr + Vnc = ${fmt(shear.vnRcGeneralTf, 4)} tf\nVnrc,friction = Vnr′ + K1b′d + Vns′ = ${fmt(shear.vnRcFrictionTf, 4)} tf\nVnrc = min(Vnrc,general, Vnrc,friction) = ${fmt(shear.vnRcTf, 4)} tf；0.75Vnrc = ${fmt(shear.phiVnRcTf, 4)} tf`,
        },
        {
          group: '剪力需求分擔',
          body: `Mns/Mn = ${fmt(shear.steelDemandShare, 6)}；Mnrc/Mn = ${fmt(shear.rcDemandShare, 6)}\n鋼骨需求 = (Mns/Mn)Vu = ${fmt(shear.steelDemandTf, 4)} tf；需求比 = ${fmt(shear.steelUtilization, 4)}\nRC 需求 = (Mnrc/Mn)Vu = ${fmt(shear.rcDemandTf, 4)} tf；需求比 = ${fmt(shear.rcUtilization, 4)}`,
        },
      ],
      summary: {
        ok: overallStrengthOk,
        text: overallStrengthOk ? '本次 SRC 梁構材強度檢核通過。' : `本次 SRC 梁之${failedLabels(result).join('、')}未通過。`,
      },
      snapshot: {
        schema: CASE_SCHEMA,
        input: clone(input),
        result: clone(result),
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
        governingUtilization: result.governingUtilization,
        failedChecks: clone(result.failedChecks || []),
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
    if (doc.documentElement.dataset.srcBeamInitialized === 'true') return;
    doc.documentElement.dataset.srcBeamInitialized = 'true';
    const reportUi = win.ToolReportUI;
    assertDependencies(reportUi);
    let lastInput = null;
    let lastResult = null;
    let lastConfig = null;
    let lastFingerprint = '';

    const $ = id => doc.getElementById(id);
    $('coreVersion').textContent = `Core ${Core.CORE_VERSION}`;

    function setActionStatus(message, tone = '') {
      $('actionStatus').textContent = message || '';
      $('actionStatus').className = `src-action-status ${tone}`.trim();
    }

    function renderInvalid(issues) {
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
      $('reportReadiness').className = 'src-readiness blocked';
      $('reportReadiness').innerHTML = `<strong>輸入未通過檢查</strong><ul>${issues.map(item => `<li>${escapeHtml(item.message || item)}</li>`).join('')}</ul><span>本區只顯示於 HTML，不進計算書、列印或 PDF。</span>`;
    }

    function metric(label, value, ok) {
      return `<div class="src-metric ${ok === false ? 'ng' : 'ok'}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
    }

    function renderResult(input, result, config) {
      const flexure = result.flexure;
      const shear = result.shear;
      const failed = failedLabels(result);
      const reviews = reviewLabels(result);
      const strengthOk = failed.length === 0;
      $('resultBadge').className = `src-status ${result.status === 'OK' ? 'ok' : (result.status === 'REVIEW' ? 'review' : 'ng')}`;
      $('resultBadge').textContent = result.status === 'OK' ? 'OK' : (result.status === 'REVIEW' ? '待複核' : 'NG');
      $('resultHeadline').textContent = strengthOk
        ? (reviews.length ? '構材強度通過，另有人工複核項目。' : '構材強度與適用條件檢核通過。')
        : `控制不符：${failed.join('、')}。`;
      $('metricGrid').innerHTML = [
        metric('設計彎矩強度 φMn', `${fmt(flexure.designMomentTfM, 2)} tf·m`, result.checks.flexure),
        metric('彎矩需求比 Mu/φMn', percent(flexure.utilization), result.checks.flexure),
        metric('鋼骨剪力需求比', percent(shear.steelUtilization), result.checks.steelShearShare),
        metric('RC 剪力需求比', percent(shear.rcUtilization), result.checks.rcShearShare),
        metric('控制需求比', percent(result.governingUtilization), result.governingUtilization <= 1),
        metric('RC 剪力控制', shear.rcControlMode === 'general-shear' ? '一般剪力' : '剪力摩擦', true),
      ].join('');
      $('checkList').innerHTML = Object.entries(result.checks).map(([key, ok]) => `
        <div class="src-check-item ${ok ? 'ok' : 'ng'}"><strong>${escapeHtml(CHECK_LABELS[key] || key)}</strong><span>${ok ? 'OK' : 'NG'}</span></div>`).join('');
      $('resultTables').innerHTML = `
        <table class="src-table"><thead><tr><th>撓曲項目</th><th>結果</th></tr></thead><tbody>
          <tr><td>中性軸 c / 壓力塊 a</td><td>${fmt(flexure.neutralAxisCm, 3)} / ${fmt(flexure.stressBlockDepthCm, 3)} cm</td></tr>
          <tr><td>Mns / Mnrc</td><td>${fmt(flexure.mnSteelTfM, 2)} / ${fmt(flexure.mnRcTfM, 2)} tf·m</td></tr>
          <tr><td>Mu / φMn</td><td>${fmt(flexure.demandTfM, 2)} / ${fmt(flexure.designMomentTfM, 2)} tf·m</td></tr>
        </tbody></table>
        <table class="src-table"><thead><tr><th>剪力項目</th><th>需求 / 設計容量</th></tr></thead><tbody>
          <tr><td>鋼骨分擔</td><td>${fmt(shear.steelDemandTf, 2)} / ${fmt(shear.phiVnSteelTf, 2)} tf</td></tr>
          <tr><td>RC 分擔</td><td>${fmt(shear.rcDemandTf, 2)} / ${fmt(shear.phiVnRcTf, 2)} tf</td></tr>
          <tr><td>Vnrc 一般 / 摩擦</td><td>${fmt(shear.vnRcGeneralTf, 2)} / ${fmt(shear.vnRcFrictionTf, 2)} tf</td></tr>
        </tbody></table>`;
      const diagram = config?.diagrams?.[0];
      $('sectionDiagramImage').src = diagram?.dataURL || '';
      $('sectionDiagramImage').alt = `${diagram?.title || SECTION_DIAGRAM_TITLE}：矩形混凝土內置中 H 型鋼，主筋以計算面積位置標示`;
      $('sectionDiagramImage').hidden = !diagram;
      $('sectionDiagramPlaceholder').hidden = Boolean(diagram);
      $('sectionDiagramCaption').textContent = diagram?.caption || '';
      if (!strengthOk) {
        $('reportReadiness').className = 'src-readiness ng';
        $('reportReadiness').innerHTML = `<strong>工程結果含 NG</strong><span>${escapeHtml(failed.join('、'))}不符。仍可列印如實呈現計算結果；文件核可與工程判定是不同層次。</span><span>本區只顯示於 HTML，不進計算書、列印或 PDF。</span>`;
      } else if (reviews.length) {
        $('reportReadiness').className = 'src-readiness review';
        $('reportReadiness').innerHTML = `<strong>有 ${reviews.length} 項待人工複核</strong><ul>${reviews.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul><span>本區只顯示於 HTML，不進計算書、列印或 PDF。</span>`;
      } else {
        $('reportReadiness').className = 'src-readiness ready';
        $('reportReadiness').innerHTML = '<strong>計算完成</strong><span>可產生內部審閱計算書；在計算書預覽中明確勾選核可後，文件狀態才改為正式附件。</span><span>本區只顯示於 HTML，不進計算書、列印或 PDF。</span>';
      }
    }

    function calculate(options = {}) {
      const input = readCoreInput(doc);
      try {
        const result = Core.calculate(input);
        const config = buildReportConfig(input, result, readProject(doc));
        const trace = reportUi.buildReportTrace(config);
        lastInput = clone(input);
        lastResult = result;
        lastConfig = config;
        lastFingerprint = trace.calculationFingerprint;
        win.lastSrcBeamInput = clone(input);
        win.lastSrcBeamResult = result;
        win.lastSrcBeamReportConfig = config;
        win.lastSrcBeamCalculationFingerprint = lastFingerprint;
        renderResult(input, result, config);
        if (options.announce !== false) setActionStatus(`核算完成；計算指紋 ${lastFingerprint}。`, 'ok');
        return result;
      } catch (error) {
        lastInput = null;
        lastResult = null;
        lastConfig = null;
        lastFingerprint = '';
        win.lastSrcBeamInput = null;
        win.lastSrcBeamResult = null;
        win.lastSrcBeamReportConfig = null;
        win.lastSrcBeamCalculationFingerprint = '';
        const issues = Array.isArray(error?.issues) ? error.issues : [{ message: error?.message || String(error) }];
        renderInvalid(issues);
        if (options.announce !== false) setActionStatus(`無法計算：${issues.map(item => item.message).join('；')}`, 'error');
        return null;
      }
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
        reportUi.validateCalculationCasePayload(payload, {
          expectedSchema: CASE_SCHEMA,
          expectedToolId: TOOL_ID,
          expectedVersion: PAGE_VERSION,
        });
        if (!payload.input || typeof payload.input !== 'object') throw new Error('案件 JSON 缺少計算輸入。');
        writeCoreInput(doc, payload.input);
        writeProject(doc, payload.project || {});
        const result = calculate({ announce: false });
        if (!result) throw new Error('案件 JSON 套用後未通過輸入檢核。');
        reportUi.assertCalculationCaseReplay(payload, lastFingerprint);
        setActionStatus(`已匯入 ${file.name || '案件 JSON'}，重算指紋一致。`, 'ok');
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
        downloadJson(win, `src-beam-case-${payload.savedAt.slice(0, 10)}.json`, payload);
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
    [...NUMBER_FIELDS, ...CHECK_FIELDS, 'steelGrade'].forEach(id => {
      const node = $(id);
      if (!node) return;
      node.addEventListener('input', () => calculate({ announce: false }));
      node.addEventListener('change', () => calculate({ announce: false }));
    });
    ['projName', 'projNo', 'projDesigner'].forEach(id => {
      $(id).addEventListener('input', () => {
        if (!lastResult) return;
        lastConfig = buildReportConfig(lastInput, lastResult, readProject(doc));
        lastFingerprint = reportUi.buildReportTrace(lastConfig).calculationFingerprint;
        win.lastSrcBeamReportConfig = lastConfig;
        win.lastSrcBeamCalculationFingerprint = lastFingerprint;
      });
    });

    win.runSrcBeamCalculation = () => calculate({ announce: true });
    win.buildSrcBeamCasePayload = currentPayload;
    win.importSrcBeamCaseFile = importCase;
    calculate({ announce: false });
  }

  return Object.freeze({
    PAGE_VERSION,
    TOOL_ID,
    CASE_SCHEMA,
    TOOL_NAME,
    REPORT_TITLE,
    readCoreInput,
    writeCoreInput,
    buildReportConfig,
    buildSectionDiagram,
    buildCasePayload,
    failedLabels,
    reviewLabels,
    init,
  });
});
