import { describe, expect, it } from 'vitest'
import {
  assessProductCompleteness,
  evaluateCandidateProducts,
  evaluateLayoutVariants,
  evaluateProjectBatch,
} from './calc'
import {
  defaultProducts,
  defaultProject,
  normalizeReportSettings,
} from './defaults'
import { getEvaluationFieldStates } from './evaluationCatalog'
import { serializeReportDocument } from './reportDocx'
import { normalizeUnitPreferences } from './units'

function buildParams() {
  const product = defaultProducts.find(
    (item) => item.id === defaultProject.selectedProductId,
  )
  expect(product).toBeDefined()

  const project = {
    ...defaultProject,
    candidateLayoutVariants: [
      {
        id: 'layout-wide',
        name: '加大邊距方案',
        layout: {
          ...defaultProject.layout,
          edgeLeftMm: 160,
          edgeRightMm: 160,
          edgeBottomMm: 160,
          edgeTopMm: 160,
        },
        updatedAt: new Date().toISOString(),
      },
    ],
  }
  const batchReview = evaluateProjectBatch(project, product!)

  return {
    batchReview,
    candidateProductReviews: evaluateCandidateProducts(project, [product!]),
    layoutVariantReviews: evaluateLayoutVariants(
      project,
      product!,
      project.candidateLayoutVariants ?? [],
    ),
    review: batchReview.activeReview,
    selectedProduct: product!,
    completeness: assessProductCompleteness(product!),
    evaluationFieldStates: getEvaluationFieldStates(product!),
    unitPreferences: normalizeUnitPreferences(project.ui),
    reportSettings: normalizeReportSettings(project.report),
  }
}

describe('reportDocx', () => {
  it('serializes a valid docx buffer', async () => {
    const buffer = await serializeReportDocument(buildParams())

    expect(buffer.byteLength).toBeGreaterThan(4_000)
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)
    expect(buffer[2]).toBe(0x03)
    expect(buffer[3]).toBe(0x04)
  })
})
