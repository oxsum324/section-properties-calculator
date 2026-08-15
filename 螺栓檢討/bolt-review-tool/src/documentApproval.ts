import type { ProjectCase } from './domain'

/**
 * 正式核可綁定本次計算內容及實際輸出的報告識別／版面設定。
 * 核可旗標、匯出留痕、衍生結果快照與儲存時間不屬於附件內容異動。
 */
export function buildDocumentApprovalCalculationKey(
  project: ProjectCase,
): string {
  const report = project.report
  const approvedArtifactState: Record<string, unknown> = {
    ...project,
    report: {
      companyName: report?.companyName ?? '',
      projectCode: report?.projectCode ?? '',
      designer: report?.designer ?? '',
      checker: report?.checker ?? '',
      issueDate: report?.issueDate ?? '',
      reportMode: report?.reportMode ?? 'full',
      companyLogoDataUrl: report?.companyLogoDataUrl ?? '',
    },
  }
  delete approvedArtifactState.auditTrail
  delete approvedArtifactState.snapshot
  delete approvedArtifactState.updatedAt
  return JSON.stringify(approvedArtifactState)
}
