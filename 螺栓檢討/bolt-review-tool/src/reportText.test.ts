import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assessProductCompleteness,
  evaluateCandidateProducts,
  evaluateLayoutVariants,
  evaluateProjectBatch,
} from './calc'
import {
  defaultProducts,
  defaultProject,
  normalizeReportSettings,
} from './defaults'
import { getEvaluationFieldStates } from './evaluationCatalog'
import { buildStandaloneReportHtml } from './reportExport'
import { buildReportDocumentState } from './reportDocumentState'
import {
  buildGovernedReportText,
  REPORT_TEXT_BOM,
  sha256Text,
} from './reportText'
import { normalizeUnitPreferences } from './units'

const require = createRequire(import.meta.url)
const AttachmentPackageChecker = require(
  '../../../結構工具箱/tools/attachment-package-check.js',
) as {
  inspectAttachment: (filePath: string, rootDir: string) => {
    nonFormalReferenceNeedles: string[]
    readyDocumentNeedles: string[]
  }
  analyzePackage: (records: unknown[]) => {
    status: string
    issues: Array<{ code: string }>
  }
}

const REPORT_GENERATED_AT = '2026-08-29T02:30:00.000Z'
const AUDIT_HASH = 'abcdef1234567890abcdef1234567890'

function buildArtifactParams() {
  const selectedProduct = defaultProducts.find(
    (item) => item.id === defaultProject.selectedProductId,
  )
  expect(selectedProduct).toBeDefined()
  const reportSettings = normalizeReportSettings({
    ...defaultProject.report,
    companyName: '測試工程顧問有限公司',
    projectCode: 'ANCHOR-TXT-001',
    designer: '王設計',
    checker: '李複核',
    documentApproved: true,
    documentApprovedAt: REPORT_GENERATED_AT,
  })
  const project = { ...defaultProject, report: reportSettings }
  const batchReview = evaluateProjectBatch(project, selectedProduct!)
  const auditEntry = {
    id: 'anchor-text-export',
    createdAt: REPORT_GENERATED_AT,
    hash: AUDIT_HASH,
    source: 'txt' as const,
    ruleProfileId: project.ruleProfileId,
    projectName: project.name,
    productLabel: `${selectedProduct!.brand} ${selectedProduct!.model}`,
    summary: {
      overallStatus: batchReview.summary.overallStatus,
      governingMode: batchReview.summary.governingMode,
      governingDcr:
        batchReview.summary.governingDcr ?? batchReview.summary.maxDcr,
      maxDcr: batchReview.summary.maxDcr,
      controllingLoadCaseName: batchReview.controllingLoadCaseName,
      updatedAt: REPORT_GENERATED_AT,
    },
  }
  return {
    htmlParams: {
      batchReview,
      candidateProductReviews: evaluateCandidateProducts(project, [
        selectedProduct!,
      ]),
      layoutVariantReviews: evaluateLayoutVariants(
        project,
        selectedProduct!,
        project.candidateLayoutVariants ?? [],
      ),
      review: batchReview.activeReview,
      selectedProduct: selectedProduct!,
      completeness: assessProductCompleteness(selectedProduct!),
      evaluationFieldStates: getEvaluationFieldStates(selectedProduct!),
      unitPreferences: normalizeUnitPreferences(project.ui),
      reportSettings,
      auditEntry,
      auditTrail: [auditEntry],
      reportGeneratedAt: REPORT_GENERATED_AT,
    },
    documentState: buildReportDocumentState({
      batchReview,
      review: batchReview.activeReview,
      completeness: assessProductCompleteness(selectedProduct!),
      reportSettings,
    }),
  }
}

describe('governed anchor TXT export', () => {
  it('derives a substantial traceable text artifact from the same HTML state', async () => {
    const params = buildArtifactParams()
    const html = buildStandaloneReportHtml(params.htmlParams)
    const artifact = await buildGovernedReportText({
      html,
      documentState: params.documentState,
      reportGeneratedAt: REPORT_GENERATED_AT,
      auditHash: AUDIT_HASH,
    })

    expect(artifact.bodyText.length).toBeGreaterThan(2_000)
    expect(artifact.text).toContain('文件類別：文字備查')
    expect(artifact.text).toContain('正式附件資格：否')
    expect(artifact.text).toContain('文件用途：文字備查版（不作為正式附件）')
    expect(artifact.text).toContain('來源文件狀態：正式附件')
    expect(artifact.text).toContain('產出工具：錨栓檢討工具')
    expect(artifact.text).toContain('工具版本：V1.0')
    expect(artifact.text).toContain(
      '計算指紋：CF-ABCDEF1234567890',
    )
    expect(artifact.text).toContain('載重組合批次檢核')
    expect(artifact.text).toContain('破壞模式檢核')
    expect(artifact.text).toContain('工程提醒')
    expect(artifact.text).toContain('完整基礎、樓板、底板或新舊混凝土介面設計')
    expect(artifact.text).not.toContain('<svg')
    expect(artifact.text).not.toContain('data:image/')
    expect(artifact.text).not.toContain('產報前檢查')
    expect(artifact.contentSha256).toBe(
      await sha256Text(
        artifact.text.slice(
          0,
          artifact.text.indexOf('文字內容 SHA-256（非數位簽章）：'),
        ),
      ),
    )
    expect(artifact.text).toMatch(
      /文字內容 SHA-256（非數位簽章）：[0-9a-f]{64}\r\n$/,
    )
  })

  it('writes UTF-8 BOM and is blocked from formal attachment packaging', async () => {
    const params = buildArtifactParams()
    const artifact = await buildGovernedReportText({
      html: buildStandaloneReportHtml(params.htmlParams),
      documentState: params.documentState,
      reportGeneratedAt: REPORT_GENERATED_AT,
      auditHash: AUDIT_HASH,
    })
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'anchor-text-export-'))
    try {
      const filePath = path.join(
        tempRoot,
        '錨栓檢討工具_正式附件_CF-ABCDEF1234567890_文字備查.txt',
      )
      writeFileSync(filePath, `${REPORT_TEXT_BOM}${artifact.text}`, 'utf8')
      const bytes = readFileSync(filePath)
      expect(Array.from(bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf])
      expect(bytes.byteLength).toBeGreaterThan(5_000)

      const record = AttachmentPackageChecker.inspectAttachment(
        filePath,
        tempRoot,
      )
      const report = AttachmentPackageChecker.analyzePackage([record])
      expect(record.nonFormalReferenceNeedles).toContain('文件類別：文字備查')
      expect(record.readyDocumentNeedles).toEqual([])
      expect(report.status).toBe('blocked')
      expect(report.issues.map((issue) => issue.code)).toContain(
        'non-formal-reference-text',
      )
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
