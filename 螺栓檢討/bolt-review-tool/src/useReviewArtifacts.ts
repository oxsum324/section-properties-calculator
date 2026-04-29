import { useDeferredValue, useMemo } from 'react'
import {
  evaluateCandidateProducts,
  evaluateLayoutVariants,
  evaluateProjectBatch,
} from './calc'
import type {
  AnchorProduct,
  ProjectCase,
  ProjectLayoutVariant,
  RuleProfile,
} from './domain'
import {
  buildCandidateComparisonMatrix,
  buildLayoutComparisonMatrix,
} from './reviewArtifacts'

/**
 * Review artifact 計算 hook：用 useDeferredValue 把 project / product / candidates
 * 延後，再以 useMemo 快取重量級的 batch / candidate / layout 評估結果，
 * 避免使用者打字每 keystroke 都觸發完整評估。
 *
 * 從 App.tsx 抽出（~80 行 useMemo / useDeferredValue 鏈）；包裝為單一 hook 後，
 * 主元件只需要解構 8 個回傳值。
 */
export function useReviewArtifacts(deps: {
  project: ProjectCase
  selectedProduct: AnchorProduct
  candidateProducts: AnchorProduct[]
  candidateLayoutVariants: ProjectLayoutVariant[]
  activeRuleProfile: RuleProfile
}) {
  const {
    project,
    selectedProduct,
    candidateProducts,
    candidateLayoutVariants,
    activeRuleProfile,
  } = deps

  const deferredProject = useDeferredValue(project)
  const deferredProduct = useDeferredValue(selectedProduct)
  const deferredCandidateProducts = useDeferredValue(candidateProducts)
  const deferredCandidateLayoutVariants = useDeferredValue(
    candidateLayoutVariants,
  )

  const batchReview = useMemo(
    () =>
      evaluateProjectBatch(deferredProject, deferredProduct, activeRuleProfile),
    [deferredProject, deferredProduct, activeRuleProfile],
  )

  const candidateProductReviews = useMemo(
    () =>
      evaluateCandidateProducts(
        deferredProject,
        deferredCandidateProducts,
        activeRuleProfile,
      ),
    [deferredProject, deferredCandidateProducts, activeRuleProfile],
  )

  const layoutVariantReviews = useMemo(
    () =>
      evaluateLayoutVariants(
        deferredProject,
        deferredProduct,
        deferredCandidateLayoutVariants,
        activeRuleProfile,
      ),
    [
      deferredProject,
      deferredProduct,
      deferredCandidateLayoutVariants,
      activeRuleProfile,
    ],
  )

  const candidateComparisonMatrix = useMemo(
    () => buildCandidateComparisonMatrix(batchReview, candidateProductReviews),
    [batchReview, candidateProductReviews],
  )

  const layoutComparisonMatrix = useMemo(
    () => buildLayoutComparisonMatrix(batchReview, layoutVariantReviews),
    [batchReview, layoutVariantReviews],
  )

  const review = batchReview.activeReview
  const factorResults = review.results.filter(
    (result) => result.factors && result.factors.length > 0,
  )
  const bestCandidateReview = candidateProductReviews[0]
  const bestLayoutVariantReview = layoutVariantReviews[0]

  return {
    batchReview,
    candidateProductReviews,
    layoutVariantReviews,
    candidateComparisonMatrix,
    layoutComparisonMatrix,
    review,
    factorResults,
    bestCandidateReview,
    bestLayoutVariantReview,
  }
}
