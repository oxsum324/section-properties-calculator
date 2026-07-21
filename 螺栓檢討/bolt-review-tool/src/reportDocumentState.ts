import type {
  ProductCompleteness,
  ReportSettings,
  ReviewResult,
} from './domain'

export type ReportDocumentStateStatus = 'formal-attachment' | 'internal-review'

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

/**
 * 文件身分只反映使用者是否已完成核可，不取代工程檢核結果。
 * NG、資料待確認等內容仍應如實列在計算書中；頁面流程說明不進報告。
 */
export function buildReportDocumentState(
  input: BuildReportDocumentStateInput,
): ReportDocumentState {
  const approved = input.reportSettings.documentApproved === true
  return {
    status: approved ? 'formal-attachment' : 'internal-review',
    label: approved ? '正式附件' : '內部審閱',
    reason:
      approved && input.reportSettings.documentApprovedAt
        ? `核可時間：${input.reportSettings.documentApprovedAt}`
        : '',
    isDraft: false,
  }
}

export function appendReportDocumentStateSuffix(
  fileStem: string,
  state: ReportDocumentState,
): string {
  void state
  return fileStem
}
