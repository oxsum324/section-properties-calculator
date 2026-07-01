import type {
  ProductCompleteness,
  ReportSettings,
  ReviewResult,
  ReviewStatus,
} from './domain'
import { formatNumber, getGoverningDcr } from './formatHelpers'
import { statusLabel } from './resultDisplayHelpers'

export type AttachmentReadinessStatus = 'ready' | 'review' | 'blocked'
export type AttachmentReadinessTone = 'ok' | 'warn' | 'fail' | 'neutral'

export interface AttachmentReadinessItem {
  label: string
  value: string
  tone: AttachmentReadinessTone
}

export interface AttachmentReadinessModel {
  status: AttachmentReadinessStatus
  label: string
  summary: string
  priority: {
    label: string
    value: string
    tone: AttachmentReadinessTone
  }
  items: AttachmentReadinessItem[]
  notes: string[]
}

export interface BuildAttachmentReadinessInput {
  review: ReviewResult
  completeness: ProductCompleteness
  reportSettings: ReportSettings
}

const REVIEW_STATUSES = new Set<ReviewStatus>([
  'incomplete',
  'screening',
  'warning',
])

function toneForStatus(status: ReviewStatus): AttachmentReadinessTone {
  if (status === 'pass') return 'ok'
  if (status === 'fail') return 'fail'
  if (status === 'screening' || status === 'incomplete' || status === 'warning') {
    return 'warn'
  }
  return 'neutral'
}

function reportModeLabel(reportSettings: ReportSettings): string {
  return reportSettings.reportMode === 'summary' ? '摘要版' : '完整明細版'
}

function firstBlockingIssue(review: ReviewResult): string {
  const failedDimension = review.dimensionChecks.find(
    (check) => check.status === 'fail',
  )
  if (failedDimension) return `最小尺寸「${failedDimension.label}」不符合`

  const excludedIds = new Set(review.project.excludedCheckIds ?? [])
  const failedResult = review.results.find(
    (result) => !excludedIds.has(result.id) && result.status === 'fail',
  )
  if (failedResult) return `${failedResult.mode} 不符合`

  return '仍有不符合項目'
}

function firstReviewIssue(
  review: ReviewResult,
  completeness: ProductCompleteness,
  excludedCount: number,
): string {
  if (!completeness.formal && completeness.missing.length > 0) {
    return `產品評估資料缺 ${completeness.missing.length} 項`
  }

  const excludedIds = new Set(review.project.excludedCheckIds ?? [])
  const incompleteResult = review.results.find(
    (result) => !excludedIds.has(result.id) && result.status === 'incomplete',
  )
  if (incompleteResult) return `${incompleteResult.mode} 需補資料`

  const screeningResult = review.results.find(
    (result) => !excludedIds.has(result.id) && result.status === 'screening',
  )
  if (screeningResult) return `${screeningResult.mode} 僅能作篩選`

  const warningResult = review.results.find(
    (result) => !excludedIds.has(result.id) && result.status === 'warning',
  )
  if (warningResult) return `${warningResult.mode} 需人工複核`

  if (excludedCount > 0) {
    return `已標記 ${excludedCount} 項不檢討，送審前需確認適用性`
  }

  return '送審前仍需確認產品評估報告、施工圖與專案文件'
}

export function buildAttachmentReadinessModel({
  review,
  completeness,
  reportSettings,
}: BuildAttachmentReadinessInput): AttachmentReadinessModel {
  const excludedCount = review.project.excludedCheckIds?.length ?? 0
  const governingDcr = getGoverningDcr(review.summary)
  const modeLabel = reportModeLabel(reportSettings)
  const overallTone = toneForStatus(review.summary.overallStatus)
  const hasReviewIssue =
    !completeness.formal ||
    REVIEW_STATUSES.has(review.summary.overallStatus) ||
    excludedCount > 0

  const sharedItems: AttachmentReadinessItem[] = [
    {
      label: '整體判定',
      value: statusLabel(review.summary.overallStatus),
      tone: overallTone,
    },
    {
      label: '控制 DCR',
      value: governingDcr === null ? '未建立' : formatNumber(governingDcr),
      tone: governingDcr !== null && governingDcr > 1 ? 'fail' : 'ok',
    },
    {
      label: '產品資料',
      value: completeness.formal ? '完整' : `缺 ${completeness.missing.length} 項`,
      tone: completeness.formal ? 'ok' : 'warn',
    },
    {
      label: '不檢討項目',
      value: `${excludedCount} 項`,
      tone: excludedCount > 0 ? 'warn' : 'ok',
    },
    { label: '輸出模式', value: modeLabel, tone: 'neutral' },
    { label: '輸出邊界', value: '頁面顯示，不進報告', tone: 'neutral' },
  ]
  const sharedNotes = [
    '此面板僅供公司內部整理計算附件前檢查，不會寫入計算書或列印 PDF。',
    '匯出前請確認產品評估報告、施工圖與專案文件已完成留痕。',
  ]

  if (review.summary.overallStatus === 'fail') {
    return {
      status: 'blocked',
      label: '暫勿作附件',
      summary: '尚有阻擋項目，先不要匯出為公司計算附件。',
      priority: {
        label: '優先閱讀',
        value: `先處理：${firstBlockingIssue(review)}`,
        tone: 'fail',
      },
      items: sharedItems,
      notes: [
        sharedNotes[0],
        '匯出前請完成必要補強、重算與專案留痕。',
      ],
    }
  }

  if (hasReviewIssue) {
    return {
      status: 'review',
      label: '可作附件，需人工複核',
      summary: '數值未見阻擋，但仍有資料或適用性需人工複核。',
      priority: {
        label: '優先閱讀',
        value: `先確認：${firstReviewIssue(review, completeness, excludedCount)}`,
        tone: 'warn',
      },
      items: sharedItems,
      notes: sharedNotes,
    }
  }

  return {
    status: 'ready',
    label: '可作附件',
    summary: `${modeLabel}已可產出；匯出前仍請確認留痕與專案文件。`,
    priority: {
      label: '優先閱讀',
      value: '先確認輸出模式與留痕，再產出 HTML / XLSX / DOCX 報告。',
      tone: 'ok',
    },
    items: sharedItems,
    notes: sharedNotes,
  }
}
