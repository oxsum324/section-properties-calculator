import type {
  AnchorProduct,
  ProjectAuditEntry,
  ProjectAuditSource,
  ProjectCase,
  ReportSettings,
  ReviewResult,
  UnitPreferences,
} from './domain'
import type { EvaluationFieldState } from './evaluationCatalog'
import {
  evaluateCandidateProducts,
  evaluateLayoutVariants,
  evaluateProjectBatch,
  assessProductCompleteness,
} from './calc'
import { formatAuditHash } from './evaluationAudit'
import type { ReportArtifactParams } from './reportExport'
import {
  appendReportDocumentStateSuffix,
  buildReportDocumentState,
} from './reportDocumentState'
import { buildGovernedReportText, REPORT_TEXT_BOM } from './reportText'

type BatchReviewResult = ReturnType<typeof evaluateProjectBatch>
type CandidateProductReview = ReturnType<
  typeof evaluateCandidateProducts
>[number]
type LayoutVariantReview = ReturnType<typeof evaluateLayoutVariants>[number]

function makeSafeFileName(rawName: string, fallback: string): string {
  return (
    (rawName || fallback).replace(/[\\/:*?"<>|]+/g, '-').trim() || fallback
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/**
 * 報表匯出邏輯：把 HTML / TXT / XLSX / DOCX 四種匯出（共用 ensureProjectAudit + 共用
 * artifact params）+ openStandaloneReportWindow（預覽 / 列印）整合為單一 hook，
 * 從 App.tsx 的 250+ 行下放至此。
 */
export function useReportExports(deps: {
  project: ProjectCase
  batchReview: BatchReviewResult
  candidateProductReviews: CandidateProductReview[]
  layoutVariantReviews: LayoutVariantReview[]
  review: ReviewResult
  selectedProduct: AnchorProduct
  completeness: ReturnType<typeof assessProductCompleteness>
  evaluationFieldStates: EvaluationFieldState[]
  unitPreferences: UnitPreferences
  reportSettings: ReportSettings
  latestAuditEntry: ProjectAuditEntry | null
  ensureProjectAudit: (source: ProjectAuditSource) => Promise<{
    auditEntry: ProjectAuditEntry
    auditTrail: ProjectAuditEntry[]
    reused: boolean
  }>
  setSaveMessage: (message: string) => void
}) {
  const {
    project,
    batchReview,
    candidateProductReviews,
    layoutVariantReviews,
    review,
    selectedProduct,
    completeness,
    evaluationFieldStates,
    unitPreferences,
    reportSettings,
    latestAuditEntry,
    ensureProjectAudit,
    setSaveMessage,
  } = deps

  function getDocumentState() {
    return buildReportDocumentState({
      batchReview,
      review,
      completeness,
      reportSettings,
    })
  }

  function getReportFileStem(
    auditEntry: ProjectAuditEntry | null = latestAuditEntry,
    fallback = 'anchor-review-report',
  ) {
    const safeName = makeSafeFileName(project.name, fallback)
    return appendReportDocumentStateSuffix(
      safeName,
      getDocumentState(),
      auditEntry?.hash,
    )
  }

  function getReportArtifactParams(
    autoPrint = false,
    auditEntry: ProjectAuditEntry | null = latestAuditEntry,
    auditTrail: ProjectAuditEntry[] = project.auditTrail ?? [],
    reportGeneratedAt: string = new Date().toISOString(),
  ): ReportArtifactParams {
    return {
      batchReview,
      candidateProductReviews,
      layoutVariantReviews,
      review,
      selectedProduct,
      completeness,
      evaluationFieldStates,
      unitPreferences,
      reportSettings,
      auditEntry: auditEntry ?? undefined,
      auditTrail,
      autoPrint,
      reportGeneratedAt,
    }
  }

  async function buildReportHtml(
    autoPrint = false,
    source: ProjectAuditSource = 'html',
  ) {
    const { auditEntry, auditTrail } = await ensureProjectAudit(source)
    const { buildStandaloneReportHtml } = await import('./reportExport')
    return buildStandaloneReportHtml(
      getReportArtifactParams(autoPrint, auditEntry, auditTrail),
    )
  }

  async function buildReportBlobUrl(
    autoPrint = false,
    source: ProjectAuditSource = 'html',
  ) {
    const html = await buildReportHtml(autoPrint, source)
    return URL.createObjectURL(
      new Blob([html], { type: 'text/html;charset=utf-8' }),
    )
  }

  async function openStandaloneReportWindow(autoPrint = false) {
    const url = await buildReportBlobUrl(
      autoPrint,
      autoPrint ? 'print' : 'preview',
    )
    const nextWindow = window.open(url, '_blank')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    if (!nextWindow) {
      setSaveMessage('瀏覽器封鎖了報告視窗，請允許彈出視窗後再試。')
      return
    }
    setSaveMessage(
      autoPrint ? '已開啟獨立報告列印視窗。' : '已開啟獨立報告預覽。',
    )
  }

  async function exportHtmlReport() {
    const { auditEntry, auditTrail, reused } = await ensureProjectAudit('html')
    const { buildStandaloneReportHtml } = await import('./reportExport')
    const html = buildStandaloneReportHtml(
      getReportArtifactParams(false, auditEntry, auditTrail),
    )
    const url = URL.createObjectURL(
      new Blob([html], { type: 'text/html;charset=utf-8' }),
    )
    const safeName = getReportFileStem(auditEntry)
    const link = document.createElement('a')
    link.href = url
    link.download = `${safeName}.html`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    setSaveMessage(
      reused
        ? `已匯出 HTML 報告：${safeName}.html（沿用留痕 ${formatAuditHash(auditEntry.hash)}）`
        : `已匯出 HTML 報告：${safeName}.html`,
    )
  }

  async function exportTxtReport() {
    const { auditEntry, auditTrail, reused } = await ensureProjectAudit('txt')
    const reportGeneratedAt = new Date().toISOString()
    const { buildStandaloneReportHtml } = await import('./reportExport')
    const html = buildStandaloneReportHtml(
      getReportArtifactParams(
        false,
        auditEntry,
        auditTrail,
        reportGeneratedAt,
      ),
    )
    const artifact = await buildGovernedReportText({
      html,
      documentState: getDocumentState(),
      reportGeneratedAt,
      auditHash: auditEntry.hash,
    })
    const safeName = getReportFileStem(auditEntry)
    downloadBlob(
      new Blob([REPORT_TEXT_BOM, artifact.text], {
        type: 'text/plain;charset=utf-8',
      }),
      `${safeName}_文字備查.txt`,
    )
    setSaveMessage(
      reused
        ? `已匯出 TXT 文字備查：${safeName}_文字備查.txt（沿用留痕 ${formatAuditHash(auditEntry.hash)}；不可作為正式附件）`
        : `已匯出 TXT 文字備查：${safeName}_文字備查.txt（不可作為正式附件）`,
    )
  }

  async function exportXlsxReport() {
    const { auditEntry, auditTrail, reused } = await ensureProjectAudit('xlsx')
    const { serializeReportWorkbook } = await import('./reportWorkbook')
    const buffer = await serializeReportWorkbook(
      getReportArtifactParams(false, auditEntry, auditTrail),
    )
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const safeName = getReportFileStem(auditEntry)
    downloadBlob(blob, `${safeName}.xlsx`)
    setSaveMessage(
      reused
        ? `已匯出 XLSX 報告：${safeName}.xlsx（沿用留痕 ${formatAuditHash(auditEntry.hash)}）`
        : `已匯出 XLSX 報告：${safeName}.xlsx`,
    )
  }

  async function exportDocxReport() {
    const { auditEntry, auditTrail, reused } = await ensureProjectAudit('docx')
    const { serializeReportDocument } = await import('./reportDocx')
    const buffer = await serializeReportDocument(
      getReportArtifactParams(false, auditEntry, auditTrail),
    )
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    // DOCX 沿用既有的「替換 + 折疊空白」規則（不同於其他匯出的 trim）
    const safeNameBase =
      (project.name || 'anchor-review-report')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replaceAll(/\s+/g, '-')
    const safeName = appendReportDocumentStateSuffix(
      safeNameBase,
      getDocumentState(),
      auditEntry.hash,
    )
    downloadBlob(blob, `${safeName}.docx`)
    setSaveMessage(
      reused
        ? `已匯出 DOCX 報告：${safeName}.docx（沿用留痕 ${formatAuditHash(auditEntry.hash)}）`
        : `已匯出 DOCX 報告：${safeName}.docx`,
    )
  }

  return {
    openStandaloneReportWindow,
    exportHtmlReport,
    exportTxtReport,
    exportXlsxReport,
    exportDocxReport,
  }
}
