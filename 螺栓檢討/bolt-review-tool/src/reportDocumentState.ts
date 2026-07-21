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

export function formatReportDocumentDateTime(value?: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsed)
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${valueOf('year')}/${valueOf('month')}/${valueOf('day')} ${valueOf('hour')}:${valueOf('minute')}:${valueOf('second')}`
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
        ? `核可時間：${formatReportDocumentDateTime(input.reportSettings.documentApprovedAt)}`
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
