import type { AnchorFamily, ProjectCase } from './domain'
import {
  projectTemplates,
  type ProjectTemplateRecommendation,
} from './projectTemplates'

function getLayoutMinEdgeDistance(project: ProjectCase) {
  return Math.min(
    project.layout.edgeLeftMm,
    project.layout.edgeRightMm,
    project.layout.edgeBottomMm,
    project.layout.edgeTopMm,
  )
}

function getRepresentativeLoads(project: ProjectCase) {
  const loadCases = project.loadCases?.length ? project.loadCases : null
  if (!loadCases) {
    return [project.loads]
  }
  return loadCases.map((item) => item.loads)
}

export function recommendProjectTemplates(
  project: ProjectCase,
  selectedFamily: AnchorFamily,
): ProjectTemplateRecommendation[] {
  const loadsList = getRepresentativeLoads(project)
  const considerSeismic = loadsList.some((loads) => loads.considerSeismic)
  const seismicMethods = new Set(
    loadsList
      .filter((loads) => loads.considerSeismic)
      .map((loads) => loads.seismicDesignMethod),
  )
  const maxMoment = Math.max(
    ...loadsList.map((loads) =>
      Math.max(Math.abs(loads.momentXKnM), Math.abs(loads.momentYKnM)),
    ),
    0,
  )
  const maxTension = Math.max(
    ...loadsList.map((loads) => Math.max(0, loads.tensionKn)),
    0,
  )
  const bearingEnabled = project.layout.basePlateBearingEnabled
  const minEdgeDistance = getLayoutMinEdgeDistance(project)
  const edgeSensitive =
    project.layout.effectiveEmbedmentMm > 0 &&
    minEdgeDistance <= Math.max(project.layout.effectiveEmbedmentMm * 0.45, 80)
  const anchorCount = project.layout.anchorCountX * project.layout.anchorCountY

  return projectTemplates
    .map((template) => {
      let score = 0
      const reasons: string[] = []

      if (template.project.selectedProductId === project.selectedProductId) {
        score += 5
        reasons.push('目前已選產品與此樣板一致')
      } else if (
        (selectedFamily === 'cast_in' && template.category === 'steel_column') ||
        (selectedFamily === 'cast_in' && template.category === 'embed_plate') ||
        (selectedFamily === 'post_installed_bonded' &&
          template.category === 'pipe_column') ||
        (selectedFamily === 'post_installed_expansion' &&
          template.category === 'equipment_base')
      ) {
        score += 4
        reasons.push('錨栓族群與此樣板的典型情境相近')
      }

      if (bearingEnabled && template.category === 'steel_column') {
        score += 3
        reasons.push('目前已啟用基板承壓，接近鋼柱柱腳起案流程')
      }
      if (bearingEnabled && template.category === 'equipment_base') {
        score += 2
        reasons.push('目前配置含基板承壓，設備基座樣板可直接沿用')
      }
      if (!bearingEnabled && template.category === 'embed_plate') {
        score += 3
        reasons.push('目前未啟用基板承壓，較接近埋件 / 牆面固定情境')
      }

      if (edgeSensitive && template.category === 'embed_plate') {
        score += 4
        reasons.push('邊距較敏感，側面破裂 / 自由邊控制樣板更貼近現況')
      }

      if (
        seismicMethods.has('attachment_yield') &&
        template.category === 'pipe_column'
      ) {
        score += 4
        reasons.push('耐震路徑使用附掛物降伏，與鋼管柱樣板設定相符')
      }
      if (
        (seismicMethods.has('overstrength') ||
          seismicMethods.has('nonyielding_attachment')) &&
        template.category === 'equipment_base'
      ) {
        score += 4
        reasons.push('目前走 Ω 放大 / 非降伏附掛物邏輯，接近設備基座樣板')
      }
      if (
        seismicMethods.has('ductile_steel') &&
        template.category === 'steel_column'
      ) {
        score += 2
        reasons.push('目前走韌性鋼材路徑，鋼柱柱腳樣板較容易延續')
      }

      if (
        considerSeismic &&
        template.project.loadCases?.some((item) => item.loads.considerSeismic)
      ) {
        score += 1
        reasons.push('此樣板本身已帶耐震載重組合')
      }

      if (maxMoment >= 20 && template.category === 'steel_column') {
        score += 2
        reasons.push('目前彎矩需求偏明顯，鋼柱柱腳樣板較貼近')
      }

      if (anchorCount <= 2 && template.category === 'embed_plate') {
        score += 2
        reasons.push('錨栓數較少，埋件樣板更接近')
      }
      if (anchorCount >= 6 && template.category === 'pipe_column') {
        score += 2
        reasons.push('群錨數較多，鋼管柱樣板的配置更相近')
      }

      if (maxTension <= 0 && bearingEnabled && template.category === 'steel_column') {
        score += 1
        reasons.push('目前有壓力控制情境，可直接用柱腳承壓樣板起案')
      }

      return {
        template,
        score,
        reasons,
      }
    })
    .sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score
      }
      return first.template.name.localeCompare(second.template.name, 'zh-Hant')
    })
}
