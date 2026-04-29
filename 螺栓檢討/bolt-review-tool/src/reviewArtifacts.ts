/**
 * Review artifact 共用型別與比較矩陣 helper：
 *   - 3 個 ReturnType 型別（BatchReviewResult / CandidateProductReview / LayoutVariantReview）
 *   - 4 個比較矩陣 helper（getCandidateLoadCaseReview / buildCandidateComparisonMatrix /
 *     getLayoutVariantLoadCaseReview / buildLayoutComparisonMatrix）
 *
 * 從 App.tsx 抽出（~70 行）；供 useReviewArtifacts hook 與 ReportDocument 元件共用。
 */
import {
  evaluateCandidateProducts,
  evaluateLayoutVariants,
  evaluateProjectBatch,
} from './calc'

export type BatchReviewResult = ReturnType<typeof evaluateProjectBatch>
export type CandidateProductReview = ReturnType<
  typeof evaluateCandidateProducts
>[number]
export type LayoutVariantReview = ReturnType<typeof evaluateLayoutVariants>[number]

export function getCandidateLoadCaseReview(
  candidateReview: CandidateProductReview,
  loadCaseId: string,
) {
  return candidateReview.batchReview.loadCaseReviews.find(
    (item) => item.loadCaseId === loadCaseId,
  )
}

export function buildCandidateComparisonMatrix(
  batchReview: BatchReviewResult,
  candidateProductReviews: CandidateProductReview[],
) {
  return batchReview.loadCaseReviews.map((loadCaseReview) => ({
    loadCaseId: loadCaseReview.loadCaseId,
    loadCaseName: loadCaseReview.loadCaseName,
    isActive: loadCaseReview.loadCaseId === batchReview.activeLoadCaseId,
    isControlling:
      loadCaseReview.loadCaseId === batchReview.controllingLoadCaseId,
    candidateCells: candidateProductReviews.map((candidateReview) => ({
      candidateReview,
      loadCaseReview: getCandidateLoadCaseReview(
        candidateReview,
        loadCaseReview.loadCaseId,
      ),
      isControllingForProduct:
        candidateReview.batchReview.controllingLoadCaseId ===
        loadCaseReview.loadCaseId,
    })),
  }))
}

export function getLayoutVariantLoadCaseReview(
  layoutVariantReview: LayoutVariantReview,
  loadCaseId: string,
) {
  return layoutVariantReview.batchReview.loadCaseReviews.find(
    (item) => item.loadCaseId === loadCaseId,
  )
}

export function buildLayoutComparisonMatrix(
  batchReview: BatchReviewResult,
  layoutVariantReviews: LayoutVariantReview[],
) {
  return batchReview.loadCaseReviews.map((loadCaseReview) => ({
    loadCaseId: loadCaseReview.loadCaseId,
    loadCaseName: loadCaseReview.loadCaseName,
    isActive: loadCaseReview.loadCaseId === batchReview.activeLoadCaseId,
    isControlling:
      loadCaseReview.loadCaseId === batchReview.controllingLoadCaseId,
    variantCells: layoutVariantReviews.map((layoutVariantReview) => ({
      layoutVariantReview,
      loadCaseReview: getLayoutVariantLoadCaseReview(
        layoutVariantReview,
        loadCaseReview.loadCaseId,
      ),
      isControllingForVariant:
        layoutVariantReview.batchReview.controllingLoadCaseId ===
        loadCaseReview.loadCaseId,
    })),
  }))
}
