import type {
  AnchorProduct,
  ProjectAuditEntry,
  ProjectAuditSource,
  ProjectCase,
  ProjectSnapshot,
  ReportSettings,
  ReviewResult,
} from './domain'
import { CURRENT_CALC_ENGINE_VERSION } from './appMeta'
import {
  evaluateProjectBatch,
  assessProductCompleteness,
} from './calc'
import { createProjectAuditEntry, formatAuditHash } from './evaluationAudit'
import { auditSourceLabel, getGoverningDcr } from './formatHelpers'

type BatchReviewResult = ReturnType<typeof evaluateProjectBatch>

function buildProjectSnapshot(
  summary: ReviewResult['summary'],
  controllingLoadCaseName?: string,
): ProjectSnapshot {
  return {
    overallStatus: summary.overallStatus,
    governingMode: summary.governingMode,
    governingDcr: getGoverningDcr(summary),
    maxDcr: summary.maxDcr,
    controllingLoadCaseName,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * 留痕（audit trail）管理：把建立 / 沿用 / 手動留存 / 刪除 / 匯出 CSV 五個動作整合為單一 hook。
 *
 * 留痕本身就是「目前案件 + 計算結果」的 SHA-1 雜湊封存，供日後審查覆驗；
 * 同樣輸入應產生同樣 hash（這就是 ensureProjectAudit 內 reused 判斷的依據）。
 *
 * 從 App.tsx 抽出（~140 行）；與 useReportExports 一同構成「行為層」hook 第一波。
 */
export function useAuditTrail(deps: {
  project: ProjectCase
  selectedProduct: AnchorProduct
  batchReview: BatchReviewResult
  reportSettings: ReportSettings
  completeness: ReturnType<typeof assessProductCompleteness>
  cloneProject: (project: ProjectCase) => ProjectCase
  commitProject: (project: ProjectCase) => void
  patchProject: (patch: Partial<ProjectCase>) => void
  setSaveMessage: (message: string) => void
}) {
  const {
    project,
    selectedProduct,
    batchReview,
    reportSettings,
    completeness,
    cloneProject,
    commitProject,
    patchProject,
    setSaveMessage,
  } = deps

  async function ensureProjectAudit(
    source: ProjectAuditSource,
  ): Promise<{
    auditEntry: ProjectAuditEntry
    auditTrail: ProjectAuditEntry[]
    reused: boolean
  }> {
    const snapshot = buildProjectSnapshot(
      batchReview.summary,
      batchReview.controllingLoadCaseName,
    )
    const nextEntry = await createProjectAuditEntry({
      project: cloneProject({ ...project, snapshot }),
      selectedProduct,
      batchReview,
      reportSettings,
      completeness,
      snapshot,
      source,
    })
    const currentTrail = project.auditTrail ?? []
    const existingEntry = currentTrail.find(
      (item) => item.hash === nextEntry.hash,
    )
    if (existingEntry) {
      return {
        auditEntry: existingEntry,
        auditTrail: currentTrail,
        reused: true,
      }
    }

    const nextProject = cloneProject({
      ...project,
      updatedAt: new Date().toISOString(),
      snapshot,
      auditTrail: [nextEntry, ...currentTrail].slice(0, 25),
    })
    commitProject(nextProject)

    return {
      auditEntry: nextEntry,
      auditTrail: nextProject.auditTrail ?? [nextEntry],
      reused: false,
    }
  }

  async function recordCurrentAuditTrail(source: ProjectAuditSource) {
    const { auditEntry, reused } = await ensureProjectAudit(source)
    setSaveMessage(
      reused
        ? `已沿用既有留痕：${formatAuditHash(auditEntry.hash)}`
        : `已留存檢核簽章：${formatAuditHash(auditEntry.hash)}`,
    )
  }

  function deleteAuditEntry(entryId: string) {
    const trail = project.auditTrail ?? []
    const target = trail.find((entry) => entry.id === entryId)
    if (!target) {
      return
    }
    const confirmed = window.confirm(
      `確定刪除留痕「${formatAuditHash(target.hash)}」？此操作不可復原。`,
    )
    if (!confirmed) {
      return
    }
    patchProject({
      auditTrail: trail.filter((entry) => entry.id !== entryId),
    })
    setSaveMessage(`已刪除留痕：${formatAuditHash(target.hash)}`)
  }

  function exportAuditTrailCsv() {
    const trail = project.auditTrail ?? []
    if (trail.length === 0) {
      setSaveMessage('目前案例無留痕可匯出')
      return
    }
    const escape = (cell: string | number) => {
      const text = String(cell ?? '')
      if (/[",\n]/.test(text)) {
        return `"${text.replaceAll('"', '""')}"`
      }
      return text
    }
    const header = [
      '時間',
      '來源',
      '案件名稱',
      '產品',
      '整體判定',
      '控制 DCR',
      '最大 DCR',
      '控制模式',
      '控制組合',
      '計算版本',
      'Hash',
    ]
    const body = [...trail]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((e) => [
        e.createdAt,
        auditSourceLabel(e.source),
        e.projectName,
        e.productLabel,
        e.summary.overallStatus,
        e.summary.governingDcr ?? e.summary.maxDcr ?? '',
        e.summary.maxDcr ?? '',
        e.summary.governingMode ?? '',
        e.summary.controllingLoadCaseName ?? '',
        e.calcEngineVersion ?? CURRENT_CALC_ENGINE_VERSION,
        e.hash,
      ])
    const csv = [header, ...body]
      .map((line) => line.map(escape).join(','))
      .join('\r\n')
    // BOM (U+FEFF) 讓 Excel 開啟 UTF-8 CSV 不亂碼
    const BOM = '﻿'
    const blob = new Blob([`${BOM}${csv}`], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName =
      (project.name || 'anchor-audit-trail')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .trim() || 'anchor-audit-trail'
    link.href = url
    link.download = `${safeName}-audit-trail.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    setSaveMessage(`已匯出 ${trail.length} 筆留痕為 CSV`)
  }

  return {
    ensureProjectAudit,
    recordCurrentAuditTrail,
    deleteAuditEntry,
    exportAuditTrailCsv,
  }
}
