import type { ProjectCase } from './domain'

/**
 * 核可只在計算輸入或採用條件改變時撤銷。
 * 報表欄位、匯出留痕、衍生結果快照與儲存時間不屬於計算內容變更。
 */
export function buildDocumentApprovalCalculationKey(
  project: ProjectCase,
): string {
  const calculationState: Record<string, unknown> = { ...project }
  delete calculationState.report
  delete calculationState.auditTrail
  delete calculationState.snapshot
  delete calculationState.updatedAt
  return JSON.stringify(calculationState)
}
