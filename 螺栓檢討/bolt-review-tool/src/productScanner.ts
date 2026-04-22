import { evaluateCandidateProducts } from './calc'
import type { AnchorFamily, AnchorProduct, ProjectCase } from './domain'
import { getRuleProfileById } from './ruleProfiles'

export type ProductScanFamilyFilter = 'all' | 'same_as_selected' | AnchorFamily
export type ProductScanStatusFilter = 'all' | 'pass' | 'pass_or_screening'

export interface ProductScanFilters {
  familyFilter: ProductScanFamilyFilter
  statusFilter: ProductScanStatusFilter
  formalOnly: boolean
  excludeCurrentCandidates: boolean
  respectSeismicQualification: boolean
}

export interface ProductScanEntry {
  product: AnchorProduct
  batchReview: ReturnType<typeof evaluateCandidateProducts>[number]['batchReview']
  completeness: ReturnType<typeof evaluateCandidateProducts>[number]['completeness']
  matched: boolean
  alreadyCandidate: boolean
  reasons: string[]
}

export interface ProductScanSummary {
  scannedCount: number
  matchedCount: number
  alreadyCandidateCount: number
  matches: ProductScanEntry[]
  rejected: ProductScanEntry[]
  rejectionSummary: Array<{
    reason: string
    count: number
  }>
}

function getGoverningDcr(summary: { governingDcr?: number; maxDcr: number }) {
  return summary.governingDcr ?? summary.maxDcr
}

function statusMatchesFilter(
  status: ProductScanEntry['batchReview']['summary']['overallStatus'],
  filter: ProductScanStatusFilter,
) {
  if (filter === 'all') {
    return true
  }
  if (filter === 'pass') {
    return status === 'pass'
  }
  return status === 'pass' || status === 'screening'
}

function addReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) {
    reasons.push(reason)
  }
}

export function scanProductsForProject(
  project: ProjectCase,
  products: AnchorProduct[],
  selectedProduct: AnchorProduct,
  filters: ProductScanFilters,
): ProductScanSummary {
  const profile = getRuleProfileById(project.ruleProfileId)
  const candidateIds = new Set(
    project.candidateProductIds ?? [project.selectedProductId],
  )
  const desiredFamily =
    filters.familyFilter === 'same_as_selected'
      ? selectedProduct.family
      : filters.familyFilter
  const seismicDemanded =
    project.loads.considerSeismic ||
    (project.loadCases ?? []).some((loadCase) => loadCase.loads.considerSeismic)

  const evaluated = evaluateCandidateProducts(project, products, profile).map(
    (entry) => {
      const reasons: string[] = []
      const alreadyCandidate = candidateIds.has(entry.product.id)
      const overallStatus = entry.batchReview.summary.overallStatus

      if (
        desiredFamily !== 'all' &&
        entry.product.family !== desiredFamily
      ) {
        addReason(reasons, '產品族群不符合目前篩選。')
      }

      if (
        filters.excludeCurrentCandidates &&
        alreadyCandidate
      ) {
        addReason(reasons, '已在目前候選比選清單中。')
      }

      if (!statusMatchesFilter(overallStatus, filters.statusFilter)) {
        addReason(reasons, `整體狀態為 ${overallStatus}，未符合結果篩選。`)
      }

      if (
        filters.formalOnly &&
        entry.batchReview.summary.formalStatus !== 'pass'
      ) {
        addReason(reasons, '尚未達正式判定狀態。')
      }

      if (
        filters.respectSeismicQualification &&
        seismicDemanded &&
        entry.product.family !== 'cast_in' &&
        entry.product.evaluation.seismicQualified !== true
      ) {
        addReason(reasons, '未標示耐震適格資料。')
      }

      return {
        ...entry,
        alreadyCandidate,
        matched: reasons.length === 0,
        reasons,
      } satisfies ProductScanEntry
    },
  )

  const matches = evaluated.filter((entry) => entry.matched)
  const rejected = evaluated.filter((entry) => !entry.matched)
  const rejectionMap = new Map<string, number>()

  rejected.forEach((entry) => {
    entry.reasons.forEach((reason) => {
      rejectionMap.set(reason, (rejectionMap.get(reason) ?? 0) + 1)
    })
  })

  const rejectionSummary = [...rejectionMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason, 'zh-Hant'))

  return {
    scannedCount: evaluated.length,
    matchedCount: matches.length,
    alreadyCandidateCount: matches.filter((entry) => entry.alreadyCandidate).length,
    matches,
    rejected,
    rejectionSummary,
  }
}

export function describeProductScanResult(entry: ProductScanEntry) {
  return [
    `控制組合 ${entry.batchReview.controllingLoadCaseName}`,
    `控制模式 ${entry.batchReview.summary.governingMode}`,
    `控制 DCR ${getGoverningDcr(entry.batchReview.summary).toFixed(2)}`,
  ].join(' / ')
}
