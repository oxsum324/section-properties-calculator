import { describe, expect, it } from 'vitest'
import { defaultProducts, defaultProject } from './defaults'
import { scanProductsForProject } from './productScanner'

describe('productScanner', () => {
  const selectedProduct = defaultProducts[0]

  it('can exclude products already in the candidate list', () => {
    const summary = scanProductsForProject(
      defaultProject,
      defaultProducts,
      selectedProduct,
      {
        familyFilter: 'all',
        statusFilter: 'all',
        formalOnly: false,
        excludeCurrentCandidates: true,
        respectSeismicQualification: false,
      },
    )

    expect(summary.scannedCount).toBe(defaultProducts.length)
    expect(summary.matches.map((entry) => entry.product.id)).not.toContain(
      defaultProject.selectedProductId,
    )
    expect(summary.rejectionSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: '已在目前候選比選清單中。',
        }),
      ]),
    )
  })

  it('supports filtering to the same family as the selected product', () => {
    const summary = scanProductsForProject(
      defaultProject,
      defaultProducts,
      selectedProduct,
      {
        familyFilter: 'same_as_selected',
        statusFilter: 'all',
        formalOnly: false,
        excludeCurrentCandidates: false,
        respectSeismicQualification: false,
      },
    )

    expect(summary.matches).toHaveLength(1)
    expect(summary.matches[0]?.product.family).toBe(selectedProduct.family)
  })

  it('can enforce seismic qualification for post-installed products', () => {
    const seismicProject = {
      ...defaultProject,
      loads: {
        ...defaultProject.loads,
        considerSeismic: true,
      },
      loadCases: [
        {
          id: 'load-case-1',
          name: 'LC1',
          loads: {
            ...defaultProject.loads,
            considerSeismic: true,
          },
        },
      ],
    }

    const summary = scanProductsForProject(
      seismicProject,
      defaultProducts,
      selectedProduct,
      {
        familyFilter: 'all',
        statusFilter: 'all',
        formalOnly: false,
        excludeCurrentCandidates: false,
        respectSeismicQualification: true,
      },
    )

    expect(summary.matches.map((entry) => entry.product.id)).toContain(
      selectedProduct.id,
    )
    expect(summary.rejectionSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: '未標示耐震適格資料。',
        }),
      ]),
    )
  })
})
