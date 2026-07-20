import { buildAttachmentReadinessModel } from './attachmentReadiness'
import type {
  ProductCompleteness,
  ReportSettings,
  ReviewResult,
} from './domain'

export type ReportDocumentStateStatus = 'ready' | 'review' | 'blocked'

export interface ReportDocumentState {
  status: ReportDocumentStateStatus
  label: string
  reason: string
  isDraft: boolean
}

export interface BuildReportDocumentStateInput {
  batchReview: ReturnType<typeof import('./calc').evaluateProjectBatch>
  review: ReviewResult
  completeness: ProductCompleteness
  reportSettings: ReportSettings
}

function removeActionPrefix(value: string): string {
  return value.replace(/^(先處理|先確認)：/, '').trim()
}

/**
 * 將頁面用的附件適用性判斷壓縮為計算書必要的文件分類。
 * 頁面的操作流程、閱讀順序與說明卡不進報告；非 ready 文件則必須明確標示 DRAFT。
 */
export function buildReportDocumentState(
  input: BuildReportDocumentStateInput,
): ReportDocumentState {
  const readiness = buildAttachmentReadinessModel(input)
  const issue = removeActionPrefix(readiness.priority.value)

  if (readiness.status === 'blocked') {
    return {
      status: 'blocked',
      label: 'DRAFT / 檢核不符',
      reason: `不得送簽；${issue}。`,
      isDraft: true,
    }
  }

  if (readiness.status === 'review') {
    return {
      status: 'review',
      label: 'DRAFT / 待人工複核',
      reason: `完成人工複核後方可送簽；${issue}。`,
      isDraft: true,
    }
  }

  return {
    status: 'ready',
    label: '可送簽版',
    reason: '數值檢核與必要資料具備送簽條件；仍須完成技師複核及簽章。',
    isDraft: false,
  }
}

export function appendReportDocumentStateSuffix(
  fileStem: string,
  state: ReportDocumentState,
): string {
  return state.isDraft ? `${fileStem}_DRAFT` : fileStem
}
