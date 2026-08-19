import type {
  AnchorApplication,
  CheckResult,
  ProjectCase,
  ReviewBatchResult,
  ReviewResult,
  ReviewStatus,
  ReviewSummary,
  ReportMode,
} from './domain'

export const CODE_CHECK_RESULT_IDS = new Set([
  'steel-tension',
  'concrete-breakout-tension',
  'pullout',
  'bond',
  'side-face-blowout',
  'steel-shear',
  'concrete-breakout-shear',
  'pryout',
  'interaction',
  'seismic',
])

const FORMULAS: Record<string, string> = {
  'steel-tension': 'φNsa = φ·Ase,N·futa（單支以最大受拉需求 Tmax 檢核）',
  'concrete-breakout-tension':
    'φNcb(g) = φ·(ANc/ANco)·ψed,N·ψec,N·ψc,N·Nb',
  pullout:
    'φNpn(g) = φ·nt·Np，並比較單支 Tmax/(φNp) 與群組 ΣT/(φntNp)',
  bond:
    'φNag = φ·(ANa/ANao)·ψed,Na·ψec,Na·ψcp,Na·π·da·hef·τ',
  'side-face-blowout':
    "φNsb(g) = φ·（邊距／群錨修正）·13·λa·ca1·√Abrg·√f'c",
  'steel-shear': 'φVsa = φ·0.6·Ase,V·futa·nv·ψe,V',
  'concrete-breakout-shear':
    'φVcb(g) = φ·(AVc/AVco)·ψed,V·ψec,V·ψc,V·Vb',
  pryout: 'φVcp(g) = φ·kcp·min[Ncb(g), Npn/Na]',
  interaction:
    '依 17.8.1～17.8.3：0.2 例外，或 N/(φNn) + V/(φVn) ≤ 1.2（可選 5/3 次方式）',
  seismic:
    '依 17.10 選定路徑，以地震分量、Ωo 或韌性／附掛物降伏條件檢核',
}

export function normalizeAnchorApplication(
  value?: AnchorApplication,
): AnchorApplication {
  return value === 'isolated_footing' || value === 'slab_attachment'
    ? value
    : 'general'
}

export function anchorApplicationLabel(value?: AnchorApplication): string {
  switch (normalizeAnchorApplication(value)) {
    case 'isolated_footing':
      return '獨立基腳錨栓連接'
    case 'slab_attachment':
      return '混凝土板上錨栓固定'
    default:
      return '一般錨栓連接（未指定附件用途）'
  }
}

export function anchorApplicationScope(value?: AnchorApplication): string {
  switch (normalizeAnchorApplication(value)) {
    case 'isolated_footing':
      return '獨立基腳上部構件、基板或支架之預埋／後置錨栓，檢核錨栓與基腳局部混凝土的第 17 章強度。'
    case 'slab_attachment':
      return '新設或既有混凝土板上固定件之預埋／後置錨栓，檢核錨栓與板局部混凝土的第 17 章強度。'
    default:
      return '一般混凝土結構用錨栓之第 17 章局部連接檢核。'
  }
}

export function anchorConfigurationLabel(anchorCount: number): string {
  return anchorCount === 1
    ? '1 支／單錨'
    : `${anchorCount} 支／群錨（含群錨投影面積、邊距、間距與偏心效應）`
}

export function reportModeLabel(mode: ReportMode): string {
  if (mode === 'summary') return '摘要版'
  if (mode === 'code_check') return '規範簡核附件版'
  return '完整明細版'
}

export function isCodeCheckReport(mode: ReportMode): boolean {
  return mode === 'code_check'
}

export function isCodeCheckResult(result: Pick<CheckResult, 'id'>): boolean {
  return CODE_CHECK_RESULT_IDS.has(result.id)
}

export function codeCheckFormula(result: Pick<CheckResult, 'id'>): string {
  return FORMULAS[result.id] ?? '依該檢核項目所列規範條文與採用因子計算'
}

export function codeCheckBoundaryNotes(project: ProjectCase): string[] {
  const notes = [
    '本附件僅就《建築物混凝土結構設計規範》第 17 章的錨栓鋼材、局部混凝土、拉剪互制、尺寸與耐震適用條件進行檢核。',
    '不包含基腳／混凝土板本體之彎曲、剪力、沖切、支承、土壤承載力，也不包含基板 CBFEM、焊道與加勁板設計。',
    '「板上錨栓固定」不等於結構植筋。若用於主筋伸展、搭接、新舊混凝土界面傳力或結構連續性，應另依適用章節與產品評估文件檢核。',
  ]

  if (
    project.layout.basePlateBearingEnabled ||
    project.layout.basePlateBendingEnabled
  ) {
    notes.push(
      '本案仍啟用基板承壓或抗彎模組；規範簡核附件不應將該模組當成第 17 章錨栓結論，送審前請分開覆核。',
    )
  }

  return notes
}

export function codeCheckConfigurationIssues(project: ProjectCase): string[] {
  const issues: string[] = []
  if (normalizeAnchorApplication(project.anchorApplication) === 'general') {
    issues.push('尚未指定獨立基腳或混凝土板上錨栓固定用途')
  }
  if (
    project.layout.basePlateBearingEnabled ||
    project.layout.basePlateBendingEnabled
  ) {
    issues.push('基板承壓／抗彎模組仍啟用，不屬第 17 章簡核附件範圍')
  }
  return issues
}

export function codeCheckScopeRows(
  project: ProjectCase,
  anchorCount: number,
): Array<{ label: string; value: string }> {
  return [
    { label: '檢核用途', value: anchorApplicationLabel(project.anchorApplication) },
    { label: '錨栓型態', value: anchorConfigurationLabel(anchorCount) },
    { label: '規範範圍', value: '台灣 112 年版《建築物混凝土結構設計規範》第 17 章' },
    { label: '適用說明', value: anchorApplicationScope(project.anchorApplication) },
    {
      label: '計算原則',
      value:
        '單錨依單支需求與強度檢核；群錨依受力分配、投影面積重疊、邊距／間距、偏心與拉剪互制效應檢核。',
    },
  ]
}

function reviewStatusSeverity(status: ReviewStatus): number {
  switch (status) {
    case 'fail':
      return 5
    case 'incomplete':
      return 4
    case 'screening':
      return 3
    case 'warning':
      return 2
    case 'pass':
    default:
      return 1
  }
}

function compareScopedResults(first: CheckResult, second: CheckResult): number {
  return (
    reviewStatusSeverity(second.status) - reviewStatusSeverity(first.status) ||
    second.dcr - first.dcr
  )
}

function governingScopedMode(
  results: CheckResult[],
  emptyLabel: string,
): string {
  const result = [...results].sort(compareScopedResults)[0]
  return result && (result.dcr > 0 || result.status !== 'pass')
    ? result.mode
    : emptyLabel
}

/**
 * 重新以第 17 章錨栓結果取控制項，避免 code_check 附件被基板承壓／抗彎等
 * 非本附件範圍的模組改寫封面結論。原始完整 review 不會被修改。
 */
export function buildCodeCheckReviewSummary(
  review: ReviewResult,
): ReviewSummary {
  const excludedIds = new Set(review.project.excludedCheckIds ?? [])
  const results = review.results.filter(
    (result) => !excludedIds.has(result.id) && isCodeCheckResult(result),
  )
  const controlling = [...results].sort(compareScopedResults)[0]
  const hasDimensionFailure = review.dimensionChecks.some(
    (check) => check.status === 'fail',
  )
  const hasFail = results.some((result) => result.status === 'fail')
  const hasIncomplete = results.some((result) => result.status === 'incomplete')
  const hasScreening = results.some((result) => result.status === 'screening')
  let overallStatus: ReviewStatus = 'pass'
  if (hasDimensionFailure || hasFail) overallStatus = 'fail'
  else if (hasIncomplete) overallStatus = 'incomplete'
  else if (hasScreening) overallStatus = 'screening'

  const allFormal = results.length > 0 && results.every((result) => result.formal)
  const governingDcr = Number.isFinite(controlling?.dcr)
    ? controlling.dcr
    : 0
  const maxDcr = results.reduce(
    (maximum, result) =>
      Number.isFinite(result.dcr) ? Math.max(maximum, result.dcr) : maximum,
    0,
  )
  const tensionResults = results.filter((result) =>
    result.citation.clause.startsWith('17.6'),
  )
  const shearResults = results.filter((result) =>
    result.citation.clause.startsWith('17.7'),
  )

  return {
    overallStatus,
    formalStatus: allFormal ? overallStatus : 'incomplete',
    maxDcr,
    governingDcr,
    governingMode:
      controlling && (controlling.dcr > 0 || controlling.status !== 'pass')
        ? controlling.mode
        : '尚無控制結果',
    governingTensionMode: governingScopedMode(tensionResults, '無拉力'),
    governingShearMode: governingScopedMode(shearResults, '無剪力'),
    notes: [
      `本結論已限定於第 17 章錨栓簡核範圍，共納入 ${results.length} 項破壞模式。`,
      ...(!allFormal
        ? ['存在非正式檢核路徑，不得將數值符合直接當成正式附件結論。']
        : []),
    ],
  }
}

export interface CodeCheckBatchPresentation {
  summary: ReviewSummary
  controllingLoadCaseId: string
  controllingLoadCaseName: string
  loadCaseSummaries: Map<string, ReviewSummary>
}

export function buildCodeCheckBatchPresentation(
  batchReview: ReviewBatchResult,
): CodeCheckBatchPresentation {
  const scopedReviews = batchReview.loadCaseReviews.map((item) => ({
    loadCaseId: item.loadCaseId,
    loadCaseName: item.loadCaseName,
    summary: buildCodeCheckReviewSummary(item.review),
  }))
  const controlling = [...scopedReviews].sort((first, second) => {
    const overallGap =
      reviewStatusSeverity(second.summary.overallStatus) -
      reviewStatusSeverity(first.summary.overallStatus)
    if (overallGap !== 0) return overallGap
    const formalGap =
      reviewStatusSeverity(second.summary.formalStatus) -
      reviewStatusSeverity(first.summary.formalStatus)
    if (formalGap !== 0) return formalGap
    return second.summary.governingDcr - first.summary.governingDcr
  })[0]
  const fallback = scopedReviews[0]
  const adopted = controlling ?? fallback
  const notes = [...(adopted?.summary.notes ?? [])]
  if (scopedReviews.length > 1 && adopted) {
    notes.push(
      `共檢核 ${scopedReviews.length} 組載重組合，第 17 章簡核控制組合為 ${adopted.loadCaseName}。`,
    )
  }

  return {
    summary: {
      ...(adopted?.summary ?? buildCodeCheckReviewSummary(batchReview.activeReview)),
      notes,
    },
    controllingLoadCaseId:
      adopted?.loadCaseId ?? batchReview.activeLoadCaseId,
    controllingLoadCaseName:
      adopted?.loadCaseName ?? batchReview.activeLoadCaseName,
    loadCaseSummaries: new Map(
      scopedReviews.map((item) => [item.loadCaseId, item.summary]),
    ),
  }
}
