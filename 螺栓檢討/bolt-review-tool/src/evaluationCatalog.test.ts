import { describe, expect, it } from 'vitest'
import { defaultProducts } from './defaults'
import {
  getEvaluationFieldStates,
  getEvidenceCoverageSummary,
  hasEvidence,
} from './evaluationCatalog'

describe('evaluation field catalog', () => {
  it('returns cast-in specific fields for cast-in anchors', () => {
    const castIn = defaultProducts.find((product) => product.family === 'cast_in')

    expect(castIn).toBeDefined()

    const states = getEvaluationFieldStates(castIn!)
    const keys = states.map((state) => state.key)

    expect(keys).toContain('headBearingAreaMm2')
    expect(keys).toContain('hookExtensionMm')
    expect(keys).not.toContain('crackedBondStressMpa')
  })

  it('counts evidence coverage and verified entries correctly', () => {
    const product = {
      ...defaultProducts.find(
        (item) => item.id === 'template-bonded-m16',
      )!,
      evidence: {
        qualificationStandard: {
          documentName: 'ETA-Example',
          page: 'p.12',
          verified: true,
        },
        crackedBondStressMpa: {
          note: 'Table 7 cracked condition',
          verified: false,
        },
      },
    }

    const summary = getEvidenceCoverageSummary(product)

    expect(summary.total).toBeGreaterThan(0)
    expect(summary.withEvidence).toBe(2)
    expect(summary.verified).toBe(1)
  })

  it('treats empty evidence as missing and populated evidence as present', () => {
    expect(hasEvidence(undefined)).toBe(false)
    expect(hasEvidence({})).toBe(false)
    expect(hasEvidence({ page: 'Table 7' })).toBe(true)
  })
})
