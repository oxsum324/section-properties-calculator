import type {
  AnchorLayout,
  LoadCase,
  LoadCasePresetInput,
  ProjectCase,
  ProjectLayoutVariant,
  ProjectLoadCase,
  ProjectSnapshot,
  ReportSettings,
  UnitPreferences,
} from './domain'
import { defaultProject } from './defaults'

export type ProjectTemplateCategory =
  | 'steel_column'
  | 'pipe_column'
  | 'embed_plate'
  | 'equipment_base'

export interface ProjectTemplate {
  id: string
  name: string
  category: ProjectTemplateCategory
  summary: string
  highlights: string[]
  project: ProjectCase
}

export interface ProjectTemplateRecommendation {
  template: ProjectTemplate
  score: number
  reasons: string[]
}

const projectTemplateCategoryLabels: Record<ProjectTemplateCategory, string> = {
  steel_column: '鋼柱柱腳',
  pipe_column: '鋼管柱柱腳',
  embed_plate: '埋件 / 牆面固定',
  equipment_base: '設備基座',
}

function cloneUnitPreferences(
  units?: UnitPreferences,
): UnitPreferences | undefined {
  return units ? { ...units } : undefined
}

function cloneReportSettings(
  report?: ReportSettings,
): ReportSettings | undefined {
  return report ? { ...report } : undefined
}

function cloneSnapshot(snapshot?: ProjectSnapshot): ProjectSnapshot | undefined {
  return snapshot ? { ...snapshot } : undefined
}

function cloneLoadCase(loadCase: ProjectLoadCase): ProjectLoadCase {
  return {
    ...loadCase,
    loads: {
      ...loadCase.loads,
    },
  }
}

function cloneLoadPresetInput(
  input?: LoadCasePresetInput,
): LoadCasePresetInput | undefined {
  if (!input) {
    return undefined
  }

  return {
    ...input,
    dead: {
      ...input.dead,
    },
    live: {
      ...input.live,
    },
    earthquake: {
      ...input.earthquake,
    },
  }
}

function mergeLoadPresetInput(
  patch?: Partial<LoadCasePresetInput>,
): LoadCasePresetInput | undefined {
  const baseInput = cloneLoadPresetInput(defaultProject.loadPresetInput)

  if (!baseInput) {
    return undefined
  }

  if (!patch) {
    return baseInput
  }

  return {
    ...baseInput,
    ...patch,
    dead: {
      ...baseInput.dead,
      ...patch.dead,
    },
    live: {
      ...baseInput.live,
      ...patch.live,
    },
    earthquake: {
      ...baseInput.earthquake,
      ...patch.earthquake,
    },
  }
}

function cloneLayout(layout: AnchorLayout): AnchorLayout {
  return {
    ...layout,
  }
}

function cloneLayoutVariant(variant: ProjectLayoutVariant): ProjectLayoutVariant {
  return {
    ...variant,
    layout: cloneLayout(variant.layout),
  }
}

function cloneProjectTemplateProject(project: ProjectCase): ProjectCase {
  return {
    ...project,
    candidateProductIds: [...(project.candidateProductIds ?? [])],
    candidateLayoutVariants: (project.candidateLayoutVariants ?? []).map(
      cloneLayoutVariant,
    ),
    layout: cloneLayout(project.layout),
    loads: {
      ...project.loads,
    },
    loadCases: (project.loadCases ?? []).map(cloneLoadCase),
    loadPresetInput: cloneLoadPresetInput(project.loadPresetInput),
    ui: cloneUnitPreferences(project.ui),
    report: cloneReportSettings(project.report),
    documents: (project.documents ?? []).map((document) => ({
      ...document,
    })),
    snapshot: cloneSnapshot(project.snapshot),
  }
}

function buildLoadCase(
  id: string,
  name: string,
  patch: Partial<LoadCase>,
): ProjectLoadCase {
  return {
    id,
    name,
    loads: {
      ...defaultProject.loads,
      ...patch,
    },
  }
}

function buildTemplateProject(config: {
  id: string
  name: string
  selectedProductId: string
  candidateProductIds?: string[]
  layoutPatch: Partial<AnchorLayout>
  loadCasePatches: Array<{
    id: string
    name: string
    loads: Partial<LoadCase>
  }>
  activeLoadCaseId?: string
  loadPresetInput?: Partial<LoadCasePresetInput>
  candidateLayoutVariants?: ProjectLayoutVariant[]
}): ProjectCase {
  const loadCases = config.loadCasePatches.map((item) =>
    buildLoadCase(item.id, item.name, item.loads),
  )
  const activeLoadCaseId =
    config.activeLoadCaseId ?? loadCases[0]?.id ?? defaultProject.activeLoadCaseId
  const activeLoads =
    loadCases.find((item) => item.id === activeLoadCaseId)?.loads ??
    defaultProject.loads

  return cloneProjectTemplateProject({
    ...defaultProject,
    id: config.id,
    name: config.name,
    selectedProductId: config.selectedProductId,
    candidateProductIds:
      config.candidateProductIds ?? [config.selectedProductId],
    candidateLayoutVariants: config.candidateLayoutVariants ?? [],
    layout: {
      ...defaultProject.layout,
      ...config.layoutPatch,
    },
    loads: activeLoads,
    loadCases,
    activeLoadCaseId,
    loadPresetInput: mergeLoadPresetInput(config.loadPresetInput),
  })
}

export function getProjectTemplateCategoryLabel(
  category: ProjectTemplateCategory,
) {
  return projectTemplateCategoryLabels[category]
}

export const projectTemplates: ProjectTemplate[] = [
  {
    id: 'template-steel-column-cast-in',
    name: 'I / H 鋼柱柱腳 4 預埋錨栓',
    category: 'steel_column',
    summary:
      '適合一般鋼柱柱腳起案，已預放 2x2 預埋錨栓、基板承壓與基板抗彎欄位，可直接進入柱腳拉剪與承壓整合檢核。',
    highlights: [
      '預埋 M20 2x2 錨栓，含基板承壓與基板抗彎輸入。',
      '內建壓力控制、地震控制與抗傾覆三組常見載重組合。',
      '已設定 I / H 形柱自動推算懸臂長度的必要幾何欄位。',
    ],
    project: buildTemplateProject({
      id: 'template-steel-column-cast-in',
      name: 'I / H 鋼柱柱腳 4 預埋錨栓',
      selectedProductId: 'generic-cast-m20',
      layoutPatch: {
        concreteWidthMm: 620,
        concreteHeightMm: 620,
        thicknessMm: 700,
        concreteStrengthMpa: 35,
        effectiveEmbedmentMm: 230,
        anchorCountX: 2,
        anchorCountY: 2,
        spacingXmm: 260,
        spacingYmm: 260,
        edgeLeftMm: 150,
        edgeRightMm: 150,
        edgeBottomMm: 150,
        edgeTopMm: 150,
        basePlateBearingEnabled: true,
        basePlateLoadedWidthMm: 360,
        basePlateLoadedHeightMm: 360,
        basePlatePlanWidthMm: 520,
        basePlatePlanHeightMm: 520,
        basePlateSupportAreaMm2: 520 * 520,
        basePlateConfinedOnAllSides: true,
        basePlateConfinementMode: 'full',
        basePlateBendingEnabled: true,
        basePlateThicknessMm: 32,
        basePlateSteelYieldMpa: 325,
        basePlateCantileverXmm: 110,
        basePlateCantileverYmm: 130,
        columnSectionType: 'i_h',
        columnDepthMm: 300,
        columnFlangeWidthMm: 200,
      },
      loadCasePatches: [
        {
          id: 'load-case-steel-lc1',
          name: '1.2D+1.6L',
          loads: {
            tensionKn: -220,
            shearXKn: 14,
            shearYKn: 0,
            momentXKnM: 0,
            momentYKnM: 0,
          },
        },
        {
          id: 'load-case-steel-lc2',
          name: '1.2D+1.0E+0.5L',
          loads: {
            tensionKn: 118,
            shearXKn: 56,
            shearYKn: 12,
            momentXKnM: 0,
            momentYKnM: 72,
            considerSeismic: true,
            seismicInputMode: 'total_design',
            designEarthquakeTensionKn: 92,
            designEarthquakeShearKn: 57,
            designEarthquakeShearXKn: 52,
            designEarthquakeShearYKn: 11,
            seismicDesignMethod: 'standard',
          },
        },
        {
          id: 'load-case-steel-lc3',
          name: '0.9D+1.0E',
          loads: {
            tensionKn: 154,
            shearXKn: 44,
            shearYKn: 8,
            momentXKnM: 0,
            momentYKnM: 88,
            considerSeismic: true,
            seismicInputMode: 'total_design',
            designEarthquakeTensionKn: 124,
            designEarthquakeShearKn: 45,
            designEarthquakeShearXKn: 42,
            designEarthquakeShearYKn: 7,
            seismicDesignMethod: 'standard',
          },
        },
      ],
      activeLoadCaseId: 'load-case-steel-lc2',
      loadPresetInput: {
        dead: {
          tensionKn: -180,
          shearXKn: 4,
          shearYKn: 0,
          momentXKnM: 0,
          momentYKnM: 0,
        },
        live: {
          tensionKn: -40,
          shearXKn: 10,
          shearYKn: 0,
          momentXKnM: 0,
          momentYKnM: 0,
        },
        earthquake: {
          tensionKn: 158,
          shearXKn: 52,
          shearYKn: 11,
          momentXKnM: 0,
          momentYKnM: 72,
        },
      },
    }),
  },
  {
    id: 'template-pipe-column-bonded',
    name: '鋼管柱 6 化學錨栓 / 附掛物降伏',
    category: 'pipe_column',
    summary:
      '適合鋼管柱設備平台或外掛支架柱腳，已預放 3x2 後置黏結式錨栓與 attachment_yield 路徑所需欄位。',
    highlights: [
      '後置黏結式 M16 3x2 錨栓，適合較高拉力與剪力需求。',
      '耐震路徑預設為附掛物降伏，已填拉 / 剪降伏上限。',
      '鋼管柱幾何與基板承壓、基板抗彎欄位已一併帶入。',
    ],
    project: buildTemplateProject({
      id: 'template-pipe-column-bonded',
      name: '鋼管柱 6 化學錨栓 / 附掛物降伏',
      selectedProductId: 'template-bonded-m16',
      layoutPatch: {
        concreteWidthMm: 540,
        concreteHeightMm: 540,
        thicknessMm: 420,
        concreteStrengthMpa: 30,
        effectiveEmbedmentMm: 180,
        anchorCountX: 3,
        anchorCountY: 2,
        spacingXmm: 160,
        spacingYmm: 150,
        edgeLeftMm: 120,
        edgeRightMm: 120,
        edgeBottomMm: 110,
        edgeTopMm: 110,
        basePlateBearingEnabled: true,
        basePlateLoadedWidthMm: 260,
        basePlateLoadedHeightMm: 260,
        basePlatePlanWidthMm: 460,
        basePlatePlanHeightMm: 460,
        basePlateSupportAreaMm2: 460 * 460,
        basePlateConfinementMode: 'partial',
        basePlateConfinedOnAllSides: false,
        basePlateBendingEnabled: true,
        basePlateThicknessMm: 28,
        basePlateSteelYieldMpa: 325,
        basePlateCantileverXmm: 95,
        basePlateCantileverYmm: 110,
        columnSectionType: 'pipe',
        columnDepthMm: 216,
        columnFlangeWidthMm: 216,
      },
      loadCasePatches: [
        {
          id: 'load-case-pipe-lc1',
          name: '1.2D+1.0E+L',
          loads: {
            tensionKn: 92,
            shearXKn: 36,
            shearYKn: 28,
            momentXKnM: 16,
            momentYKnM: 42,
            considerSeismic: true,
            seismicInputMode: 'total_design',
            designEarthquakeTensionKn: 68,
            designEarthquakeShearKn: 46,
            designEarthquakeShearXKn: 30,
            designEarthquakeShearYKn: 24,
            seismicDesignMethod: 'attachment_yield',
            attachmentYieldTensionKn: 70,
            attachmentYieldShearKn: 42,
            attachmentYieldInteractionEquation: 'linear',
          },
        },
        {
          id: 'load-case-pipe-lc2',
          name: '0.9D+1.0E',
          loads: {
            tensionKn: 128,
            shearXKn: 40,
            shearYKn: 18,
            momentXKnM: 18,
            momentYKnM: 58,
            considerSeismic: true,
            seismicInputMode: 'total_design',
            designEarthquakeTensionKn: 102,
            designEarthquakeShearKn: 44,
            designEarthquakeShearXKn: 34,
            designEarthquakeShearYKn: 16,
            seismicDesignMethod: 'attachment_yield',
            attachmentYieldTensionKn: 70,
            attachmentYieldShearKn: 42,
            attachmentYieldInteractionEquation: 'linear',
          },
        },
      ],
      activeLoadCaseId: 'load-case-pipe-lc1',
      loadPresetInput: {
        dead: {
          tensionKn: -75,
          shearXKn: 6,
          shearYKn: 4,
          momentXKnM: 4,
          momentYKnM: 8,
        },
        live: {
          tensionKn: 14,
          shearXKn: 8,
          shearYKn: 6,
          momentXKnM: 2,
          momentYKnM: 6,
        },
        earthquake: {
          tensionKn: 82,
          shearXKn: 28,
          shearYKn: 22,
          momentXKnM: 10,
          momentYKnM: 34,
        },
      },
    }),
  },
  {
    id: 'template-rc-wall-embed-plate',
    name: 'RC 牆埋件 / 側面破裂控制',
    category: 'embed_plate',
    summary:
      '適合牆面埋件、支架底座或偏近自由邊固定案件，幾何刻意拉向 side-face blowout 與邊距控制情境。',
    highlights: [
      '單排 2 支預埋錨栓，接近自由邊，利於檢視 Nsb 與最小邊距控制。',
      '混凝土厚度與埋深比例較敏感，適合牆面埋件審查案例。',
      '未啟用基板承壓，焦點放在錨栓幾何與拉力破壞模式。',
    ],
    project: buildTemplateProject({
      id: 'template-rc-wall-embed-plate',
      name: 'RC 牆埋件 / 側面破裂控制',
      selectedProductId: 'generic-cast-m20',
      layoutPatch: {
        concreteWidthMm: 360,
        concreteHeightMm: 620,
        thicknessMm: 240,
        concreteStrengthMpa: 28,
        effectiveEmbedmentMm: 170,
        anchorCountX: 1,
        anchorCountY: 2,
        spacingXmm: 0,
        spacingYmm: 170,
        edgeLeftMm: 58,
        edgeRightMm: 302,
        edgeBottomMm: 135,
        edgeTopMm: 135,
        basePlateBearingEnabled: false,
        basePlateBendingEnabled: false,
      },
      loadCasePatches: [
        {
          id: 'load-case-wall-lc1',
          name: '吊掛拉力控制',
          loads: {
            tensionKn: 54,
            shearXKn: 6,
            shearYKn: 14,
            momentXKnM: 0,
            momentYKnM: 0,
          },
        },
        {
          id: 'load-case-wall-lc2',
          name: '偏心維修荷重',
          loads: {
            tensionKn: 46,
            shearXKn: 10,
            shearYKn: 18,
            momentXKnM: 12,
            momentYKnM: 0,
          },
        },
      ],
      activeLoadCaseId: 'load-case-wall-lc1',
    }),
  },
  {
    id: 'template-equipment-base-expansion',
    name: '設備基座 / 後置膨脹錨栓 Ωo 路徑',
    category: 'equipment_base',
    summary:
      '適合設備固定、機組基座與剛性基板起案，已預放後置膨脹錨栓與 Ωo 耐震路徑的常見輸入。',
    highlights: [
      '後置膨脹 M16 2x2 錨栓，含受剪錨栓數與 shear lever arm 欄位。',
      '耐震路徑預設為 Ωo 放大，適合非降伏附掛物或設備基座情境。',
      '含基板承壓與基板抗彎資料，可直接比較拉剪與壓力控制組合。',
    ],
    project: buildTemplateProject({
      id: 'template-equipment-base-expansion',
      name: '設備基座 / 後置膨脹錨栓 Ωo 路徑',
      selectedProductId: 'template-expansion-m16',
      layoutPatch: {
        concreteWidthMm: 460,
        concreteHeightMm: 420,
        thicknessMm: 260,
        concreteStrengthMpa: 30,
        effectiveEmbedmentMm: 95,
        anchorCountX: 2,
        anchorCountY: 2,
        spacingXmm: 180,
        spacingYmm: 180,
        edgeLeftMm: 80,
        edgeRightMm: 80,
        edgeBottomMm: 75,
        edgeTopMm: 75,
        basePlateBearingEnabled: true,
        basePlateLoadedWidthMm: 280,
        basePlateLoadedHeightMm: 240,
        basePlatePlanWidthMm: 360,
        basePlatePlanHeightMm: 320,
        basePlateSupportAreaMm2: 360 * 320,
        basePlateConfinementMode: 'partial',
        basePlateBendingEnabled: true,
        basePlateThicknessMm: 22,
        basePlateSteelYieldMpa: 275,
        basePlateCantileverXmm: 45,
        basePlateCantileverYmm: 40,
        columnSectionType: 'manual',
      },
      loadCasePatches: [
        {
          id: 'load-case-equipment-lc1',
          name: '1.2D+ΩoE+L',
          loads: {
            tensionKn: -32,
            shearXKn: 18,
            shearYKn: 6,
            shearLeverArmMm: 40,
            momentXKnM: 6,
            momentYKnM: 10,
            considerSeismic: true,
            seismicInputMode: 'static_plus_earthquake',
            designEarthquakeTensionKn: 24,
            designEarthquakeShearKn: 32,
            designEarthquakeShearXKn: 28,
            designEarthquakeShearYKn: 7,
            designEarthquakeMomentXKnM: 5,
            designEarthquakeMomentYKnM: 9,
            seismicDesignMethod: 'overstrength',
            overstrengthFactor: 2.5,
          },
        },
        {
          id: 'load-case-equipment-lc2',
          name: '0.9D+ΩoE',
          loads: {
            tensionKn: 42,
            shearXKn: 26,
            shearYKn: 8,
            shearLeverArmMm: 40,
            momentXKnM: 8,
            momentYKnM: 14,
            considerSeismic: true,
            seismicInputMode: 'static_plus_earthquake',
            designEarthquakeTensionKn: 38,
            designEarthquakeShearKn: 36,
            designEarthquakeShearXKn: 30,
            designEarthquakeShearYKn: 9,
            designEarthquakeMomentXKnM: 6,
            designEarthquakeMomentYKnM: 11,
            seismicDesignMethod: 'overstrength',
            overstrengthFactor: 2.5,
          },
        },
      ],
      activeLoadCaseId: 'load-case-equipment-lc1',
      loadPresetInput: {
        dead: {
          tensionKn: -56,
          shearXKn: 4,
          shearYKn: 1,
          momentXKnM: 0,
          momentYKnM: 0,
        },
        live: {
          tensionKn: 0,
          shearXKn: 6,
          shearYKn: 2,
          momentXKnM: 1,
          momentYKnM: 2,
        },
        earthquake: {
          tensionKn: 28,
          shearXKn: 28,
          shearYKn: 7,
          momentXKnM: 5,
          momentYKnM: 9,
        },
        overstrengthFactor: 2.5,
      },
    }),
  },
]

export function findProjectTemplateById(id: string) {
  return projectTemplates.find((template) => template.id === id)
}

export function applyProjectTemplate(
  template: ProjectTemplate,
  currentProject: ProjectCase,
): ProjectCase {
  const applied = cloneProjectTemplateProject(template.project)

  return {
    ...applied,
    id: currentProject.id,
    ui: cloneUnitPreferences(currentProject.ui),
    report: cloneReportSettings(currentProject.report),
    documents: (currentProject.documents ?? []).map((document) => ({
      ...document,
    })),
    snapshot: undefined,
    updatedAt: new Date().toISOString(),
  }
}
