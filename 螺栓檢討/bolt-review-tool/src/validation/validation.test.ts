import { describe, expect, it } from 'vitest'
import { evaluateProject } from '../calc'
import { defaultProducts, defaultProject } from '../defaults'
import type { AnchorProduct, ProjectCase } from '../domain'
import baselineCase from './aci-318-19/R17-cast-in-2x2-baseline.json'
import crackedCase from './aci-318-19/R17-cracked-vs-uncracked.json'

interface ExpectedCheck {
  id: string
  designStrengthKnMin?: number
  designStrengthKnMax?: number
  dcrTolerance?: number
  dcrMax?: number
  note?: string
}

interface ValidationCase {
  id: string
  source: string
  description: string
  input: {
    ruleProfileId: string
    layout: Partial<ProjectCase['layout']>
    product: Partial<AnchorProduct> & { id: string; family: AnchorProduct['family'] }
    loads: Partial<ProjectCase['loads']>
  }
  expected: {
    overallStatus: 'pass' | 'fail' | 'incomplete' | 'warning' | 'screening'
    governingDcrMax?: number
    checks: ExpectedCheck[]
  }
}

const cases: ValidationCase[] = [
  baselineCase as ValidationCase,
  crackedCase as ValidationCase,
]

function buildProject(testCase: ValidationCase): ProjectCase {
  return {
    ...defaultProject,
    id: `validation-${testCase.id}`,
    name: testCase.id,
    ruleProfileId:
      testCase.input.ruleProfileId as ProjectCase['ruleProfileId'],
    selectedProductId: testCase.input.product.id,
    candidateProductIds: [testCase.input.product.id],
    layout: {
      ...defaultProject.layout,
      ...testCase.input.layout,
    } as ProjectCase['layout'],
    loads: {
      ...defaultProject.loads,
      ...testCase.input.loads,
    } as ProjectCase['loads'],
  }
}

function buildProduct(testCase: ValidationCase): AnchorProduct {
  const baseProduct = defaultProducts.find(
    (item) => item.id === testCase.input.product.id,
  )
  return {
    ...(baseProduct ?? defaultProducts[0]),
    ...testCase.input.product,
    family: testCase.input.product.family,
  } as AnchorProduct
}

describe('calc engine validation suite', () => {
  for (const testCase of cases) {
    it(`${testCase.id}: ${testCase.description.slice(0, 60)}…`, () => {
      const project = buildProject(testCase)
      const product = buildProduct(testCase)
      const review = evaluateProject(project, product)

      // 整體判定
      expect(review.summary.overallStatus, '整體判定').toBe(
        testCase.expected.overallStatus,
      )

      // 控制 DCR 上限
      if (typeof testCase.expected.governingDcrMax === 'number') {
        const dcr =
          review.summary.governingDcr ?? review.summary.maxDcr ?? 0
        expect(
          dcr,
          `控制 DCR ≤ ${testCase.expected.governingDcrMax}`,
        ).toBeLessThanOrEqual(testCase.expected.governingDcrMax)
      }

      // 各檢核項目
      for (const expectedCheck of testCase.expected.checks) {
        const actual = review.results.find(
          (item) => item.id === expectedCheck.id,
        )
        expect(actual, `應有 ${expectedCheck.id} 檢核`).toBeDefined()
        if (!actual) continue

        if (typeof expectedCheck.designStrengthKnMin === 'number') {
          expect(
            actual.designStrengthKn,
            `${expectedCheck.id}.designStrengthKn ≥ ${expectedCheck.designStrengthKnMin}`,
          ).toBeGreaterThanOrEqual(expectedCheck.designStrengthKnMin)
        }
        if (typeof expectedCheck.designStrengthKnMax === 'number') {
          expect(
            actual.designStrengthKn,
            `${expectedCheck.id}.designStrengthKn ≤ ${expectedCheck.designStrengthKnMax}`,
          ).toBeLessThanOrEqual(expectedCheck.designStrengthKnMax)
        }
        if (typeof expectedCheck.dcrMax === 'number') {
          expect(
            actual.dcr,
            `${expectedCheck.id}.dcr ≤ ${expectedCheck.dcrMax}`,
          ).toBeLessThanOrEqual(expectedCheck.dcrMax)
        }
      }
    })
  }
})
