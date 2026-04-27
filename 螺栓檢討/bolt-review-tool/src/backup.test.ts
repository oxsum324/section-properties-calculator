import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceBackup,
  mergeWorkspaceBackup,
  parseWorkspaceBackup,
} from './backup'
import { defaultProducts, defaultProject } from './defaults'

describe('workspace backup helpers', () => {
  it('builds and parses a portable backup payload', async () => {
    const projectWithDocument = {
      ...defaultProject,
      auditTrail: [
        {
          id: 'audit-1',
          createdAt: '2026-04-20T00:00:00.000Z',
          hash: 'abcdef1234567890',
          source: 'manual' as const,
          ruleProfileId: defaultProject.ruleProfileId,
          projectName: defaultProject.name,
          productLabel: 'Generic Cast-in Headed M20',
          summary: {
            overallStatus: 'pass' as const,
            governingMode: '鋼材拉力',
            governingDcr: 0.42,
            maxDcr: 0.42,
            controllingLoadCaseName: 'LC1',
            updatedAt: '2026-04-20T00:00:00.000Z',
          },
        },
      ],
      documents: [
        {
          id: 'doc-1',
          name: 'ETA Example',
          fileName: 'eta-example.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 3,
          kind: 'eta' as const,
          note: 'Table C1',
          verified: true,
          addedAt: '2026-04-20T00:00:00.000Z',
        },
      ],
    }
    const files = [
      {
        id: 'doc-1',
        projectId: projectWithDocument.id,
        fileName: 'eta-example.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 3,
        blob: new Blob(['ETA'], { type: 'application/pdf' }),
        updatedAt: '2026-04-20T00:00:00.000Z',
      },
    ]
    const payload = await buildWorkspaceBackup(
      defaultProducts,
      [projectWithDocument],
      files,
    )
    const parsed = parseWorkspaceBackup(JSON.stringify(payload))

    expect(parsed.schema).toBe('bolt-review-tool-backup')
    expect(parsed.products).toHaveLength(defaultProducts.length)
    expect(parsed.projects[0].name).toBe(defaultProject.name)
    expect(parsed.projects[0].documents).toHaveLength(1)
    expect(parsed.projects[0].auditTrail).toHaveLength(1)
    await expect(parsed.files[0].blob.text()).resolves.toBe('ETA')
  })

  it('merges imported data and remaps duplicate ids and names', async () => {
    const duplicateProject = {
      ...defaultProject,
      selectedProductId: defaultProducts[0].id,
      documents: [
        {
          id: 'doc-1',
          name: 'Catalog',
          fileName: 'catalog.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 7,
          kind: 'catalog' as const,
          note: '',
          verified: false,
          addedAt: '2026-04-20T00:00:00.000Z',
        },
      ],
    }
    const payload = await buildWorkspaceBackup(defaultProducts, [duplicateProject], [
      {
        id: 'doc-1',
        projectId: duplicateProject.id,
        fileName: 'catalog.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 7,
        blob: new Blob(['catalog'], { type: 'application/pdf' }),
        updatedAt: '2026-04-20T00:00:00.000Z',
      },
    ])

    const merged = mergeWorkspaceBackup(
      defaultProducts,
      [defaultProject],
      [],
      parseWorkspaceBackup(JSON.stringify(payload)),
    )

    expect(merged.products).toHaveLength(defaultProducts.length * 2)
    expect(merged.projects).toHaveLength(2)
    expect(merged.projects[1].id).not.toBe(defaultProject.id)
    expect(merged.projects[1].name).not.toBe(defaultProject.name)
    expect(merged.projects[1].selectedProductId).not.toBe('')
    expect(merged.files).toHaveLength(1)
    expect(merged.projects[1].documents?.[0]?.id).toBe(merged.files[0].id)
  })

  it('rejects backup with wrong schema marker', () => {
    const payload = JSON.stringify({
      schema: 'other-tool-backup',
      version: 1,
      products: [],
      projects: [],
    })
    expect(() => parseWorkspaceBackup(payload)).toThrow(/schema 不符/)
  })

  it('rejects malformed JSON with helpful message', () => {
    expect(() => parseWorkspaceBackup('{"products":')).toThrow(
      /JSON 格式錯誤/,
    )
  })

  it('rejects backup missing required fields per project', () => {
    const payload = JSON.stringify({
      schema: 'bolt-review-tool-backup',
      version: 1,
      products: [
        { id: 'p1', diameterMm: 16 },
      ],
      projects: [
        // 缺 layout
        { id: 'pr1', name: '案 A', loads: { tensionKn: 10 } },
      ],
    })
    expect(() => parseWorkspaceBackup(payload)).toThrow(/缺 layout/)
  })
})
