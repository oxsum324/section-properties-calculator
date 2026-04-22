/**
 * 報表時間戳標籤常數：HTML / XLSX / DOCX / 畫面列印區共用，避免三處漂移。
 * 單獨抽檔以避免把 reportExport.ts（含 SVG 組圖邏輯）綁進主 bundle。
 *
 * - editedAt：案例最後編修（project.updatedAt）
 * - generatedAt：報表生成時間（匯出那一刻）
 * - auditedAt：最新留痕時間（auditEntry.createdAt）
 * - auditSource：留痕來源
 * - auditHash：留痕 Hash
 */
export const REPORT_TIMESTAMP_LABELS = {
  editedAt: '案例最後編修',
  generatedAt: '報表生成時間',
  auditedAt: '留痕時間',
  auditSource: '留痕來源',
  auditHash: '留痕 Hash',
} as const

export type ReportTimestampLabelKey = keyof typeof REPORT_TIMESTAMP_LABELS
