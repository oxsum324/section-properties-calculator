import { describe, expect, it } from 'vitest'
import { defaultProducts } from './defaults'
import { getEvaluationFieldStates } from './evaluationCatalog'
import {
  createEvidenceFieldViews,
  filterEvidenceFieldViews,
  summarizeEvidenceLinks,
} from './evidenceLinks'

describe('evidence link helpers', () => {
  it('links evidence fields to uploaded documents by name', () => {
    const product = {
      ...defaultProducts.find((item) => item.id === 'template-bonded-m16')!,
      evidence: {
        qualificationStandard: {
          documentName: 'ETA Example',
          verified: true,
        },
      },
    }
    const documents = [
      {
        id: 'doc-1',
        name: 'ETA Example',
        fileName: 'eta-example.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        kind: 'eta' as const,
        note: '',
        verified: true,
        addedAt: '2026-04-20T00:00:00.000Z',
      },
    ]

    const views = createEvidenceFieldViews(
      getEvaluationFieldStates(product),
      documents,
    )

    expect(views.find((item) => item.field.key === 'qualificationStandard')?.linkedDocument?.id).toBe('doc-1')
  })

  it('filters evidence views by document kind and link status', () => {
    const product = {
      ...defaultProducts.find((item) => item.id === 'template-bonded-m16')!,
      evidence: {
        qualificationStandard: {
          documentName: 'ETA Example',
          verified: true,
        },
      },
    }
    const documents = [
      {
        id: 'doc-1',
        name: 'ETA Example',
        fileName: 'eta-example.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        kind: 'eta' as const,
        note: '',
        verified: true,
        addedAt: '2026-04-20T00:00:00.000Z',
      },
    ]
    const views = createEvidenceFieldViews(
      getEvaluationFieldStates(product),
      documents,
    )

    expect(
      filterEvidenceFieldViews(views, {
        documentKind: 'eta',
        status: 'linked',
      }),
    ).toHaveLength(1)
    expect(
      filterEvidenceFieldViews(views, {
        documentKind: 'all',
        status: 'missing',
      }).length,
    ).toBeGreaterThan(0)
  })

  it('summarizes which fields reference each document', () => {
    const product = {
      ...defaultProducts.find((item) => item.id === 'template-expansion-m16')!,
      evidence: {
        qualificationStandard: {
          documentName: 'Catalog A',
          verified: true,
        },
        minEdgeDistanceMm: {
          documentName: 'Catalog A',
          verified: false,
        },
      },
    }
    const documents = [
      {
        id: 'doc-1',
        name: 'Catalog A',
        fileName: 'catalog-a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        kind: 'catalog' as const,
        note: '',
        verified: false,
        addedAt: '2026-04-20T00:00:00.000Z',
      },
    ]
    const summary = summarizeEvidenceLinks(
      createEvidenceFieldViews(getEvaluationFieldStates(product), documents),
      documents,
    )

    expect(summary[0].referencedFields).toHaveLength(2)
    expect(summary[0].verifiedFields).toEqual(['產品評估標準'])
  })
})
