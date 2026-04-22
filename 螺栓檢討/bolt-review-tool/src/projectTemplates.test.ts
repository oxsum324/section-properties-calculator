import { describe, expect, it } from 'vitest'
import { defaultProject } from './defaults'
import type { ProjectCase } from './domain'
import {
  applyProjectTemplate,
  findProjectTemplateById,
  getProjectTemplateCategoryLabel,
  projectTemplates,
} from './projectTemplates'
import { recommendProjectTemplates } from './projectTemplateRecommendations'

describe('projectTemplates', () => {
  it('provides the expected starter catalog', () => {
    expect(projectTemplates).toHaveLength(4)
    expect(
      projectTemplates.map((template) => template.id),
    ).toEqual(
      expect.arrayContaining([
        'template-steel-column-cast-in',
        'template-pipe-column-bonded',
        'template-rc-wall-embed-plate',
        'template-equipment-base-expansion',
      ]),
    )
  })

  it('preserves current case identity, report settings, and documents when applying a template', () => {
    const template = findProjectTemplateById('template-pipe-column-bonded')
    expect(template).toBeTruthy()

    const currentProject: ProjectCase = {
      ...defaultProject,
      id: 'case-under-review',
      name: '既有案件',
      ui: {
        ...defaultProject.ui!,
        forceUnit: 'tf',
      },
      report: {
        ...defaultProject.report!,
        companyName: '測試工程顧問',
        projectCode: 'CASE-99',
      },
      documents: [
        {
          id: 'doc-1',
          name: 'ETA',
          fileName: 'eta.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          kind: 'eta' as const,
          note: '既有附件',
          verified: true,
          addedAt: '2026-04-22T00:00:00.000Z',
        },
      ],
      snapshot: {
        overallStatus: 'pass' as const,
        governingMode: '舊控制',
        governingDcr: 0.52,
        maxDcr: 0.52,
        controllingLoadCaseName: '舊組合',
        updatedAt: '2026-04-22T00:00:00.000Z',
      },
    }

    const applied = applyProjectTemplate(template!, currentProject)

    expect(applied.id).toBe(currentProject.id)
    expect(applied.name).toBe(template!.project.name)
    expect(applied.ui).toEqual(currentProject.ui)
    expect(applied.report).toEqual(currentProject.report)
    expect(applied.documents).toEqual(currentProject.documents)
    expect(applied.snapshot).toBeUndefined()
    expect(applied.selectedProductId).toBe(template!.project.selectedProductId)
    expect(applied.loadCases).toHaveLength(
      template!.project.loadCases?.length ?? 0,
    )
  })

  it('exposes category labels for the template browser', () => {
    expect(getProjectTemplateCategoryLabel('steel_column')).toBe('鋼柱柱腳')
    expect(getProjectTemplateCategoryLabel('equipment_base')).toBe('設備基座')
  })

  it('recommends the equipment-base template for expansion anchors with overstrength loading', () => {
    const project: ProjectCase = {
      ...defaultProject,
      selectedProductId: 'template-expansion-m16',
      layout: {
        ...defaultProject.layout,
        basePlateBearingEnabled: true,
        basePlateBendingEnabled: true,
      },
      loads: {
        ...defaultProject.loads,
        considerSeismic: true,
        seismicDesignMethod: 'overstrength',
        overstrengthFactor: 2.5,
      },
    }

    const recommendations = recommendProjectTemplates(
      project,
      'post_installed_expansion',
    )

    expect(recommendations[0]?.template.id).toBe(
      'template-equipment-base-expansion',
    )
  })

  it('recommends the embed-plate template for edge-sensitive cast-in layouts', () => {
    const project: ProjectCase = {
      ...defaultProject,
      selectedProductId: 'generic-cast-m20',
      layout: {
        ...defaultProject.layout,
        basePlateBearingEnabled: false,
        effectiveEmbedmentMm: 180,
        anchorCountX: 1,
        anchorCountY: 2,
        edgeLeftMm: 60,
        edgeRightMm: 320,
        edgeBottomMm: 120,
        edgeTopMm: 120,
      },
      loads: {
        ...defaultProject.loads,
        tensionKn: 45,
      },
    }

    const recommendations = recommendProjectTemplates(project, 'cast_in')

    expect(recommendations[0]?.template.id).toBe(
      'template-rc-wall-embed-plate',
    )
    expect(recommendations[0]?.reasons.length).toBeGreaterThan(0)
  })
})
