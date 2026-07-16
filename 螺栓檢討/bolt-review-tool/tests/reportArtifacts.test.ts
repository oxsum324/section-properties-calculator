import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  assessProductCompleteness,
  evaluateCandidateProducts,
  evaluateLayoutVariants,
  evaluateProjectBatch,
} from '../src/calc'
import {
  defaultProducts,
  defaultProject,
  normalizeReportSettings,
} from '../src/defaults'
import { getEvaluationFieldStates } from '../src/evaluationCatalog'
import { serializeReportDocument } from '../src/reportDocx'
import { buildStandaloneReportHtml } from '../src/reportExport'
import { serializeReportWorkbook } from '../src/reportWorkbook'
import { normalizeUnitPreferences } from '../src/units'

const ARTIFACT_KEY = 'anchor-review'
const REPORT_GENERATED_AT = '2026-07-17T00:00:00.000Z'
const PAGE_ONLY_REPORT_STATUS_NEEDLES = [
  '產報前檢查',
  '附件適用狀態',
  '優先建議報告閱讀狀態',
  '優先閱讀',
  '報告閱讀狀態',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
  '頁面顯示，不進計算書、列印或 PDF',
]

function buildParams() {
  const product = defaultProducts.find(
    (item) => item.id === defaultProject.selectedProductId,
  )
  expect(product).toBeDefined()

  const project = {
    ...defaultProject,
    candidateLayoutVariants: [
      {
        id: 'layout-wide',
        name: '加大邊距方案',
        layout: {
          ...defaultProject.layout,
          edgeLeftMm: 160,
          edgeRightMm: 160,
          edgeBottomMm: 160,
          edgeTopMm: 160,
        },
        updatedAt: REPORT_GENERATED_AT,
      },
    ],
  }
  const batchReview = evaluateProjectBatch(project, product!)
  const auditEntry = {
    id: 'anchor-formal-artifact',
    createdAt: REPORT_GENERATED_AT,
    hash: 'abcdef1234567890abcdef1234567890',
    source: 'manual' as const,
    ruleProfileId: project.ruleProfileId,
    projectName: project.name,
    productLabel: `${product!.brand} ${product!.model}`,
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
    batchReview,
    candidateProductReviews: evaluateCandidateProducts(project, [product!]),
    layoutVariantReviews: evaluateLayoutVariants(
      project,
      product!,
      project.candidateLayoutVariants,
    ),
    review: batchReview.activeReview,
    selectedProduct: product!,
    completeness: assessProductCompleteness(product!),
    evaluationFieldStates: getEvaluationFieldStates(product!),
    unitPreferences: normalizeUnitPreferences(project.ui),
    reportSettings: normalizeReportSettings(project.report),
    auditEntry,
    auditTrail: [auditEntry],
    reportGeneratedAt: REPORT_GENERATED_AT,
  }
}

function resolveEvidenceDirectory() {
  const override = process.env.ANCHOR_RENDERED_EVIDENCE_DIR
  if (override) {
    return path.resolve(override)
  }

  if (process.env.PREFLIGHT_RELEASE !== '1') {
    return null
  }

  const runDir = process.env.PREFLIGHT_RUN_DIR
  if (!runDir) {
    throw new Error('Anchor release artifact generation requires PREFLIGHT_RUN_DIR')
  }
  return path.join(
    path.resolve(runDir),
    'rendered-delivery-evidence',
    'anchor-formal',
  )
}

describe('release report artifacts', () => {
  it('serializes and optionally preserves the actual HTML, DOCX, and XLSX reports', async () => {
    const params = buildParams()
    const html = buildStandaloneReportHtml(params)
    const docx = await serializeReportDocument(params)
    const workbook = await serializeReportWorkbook(params)

    expect(html.length).toBeGreaterThan(20_000)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain(defaultProject.name)
    expect(html).toContain('載重組合批次檢核')
    expect(html).toContain('使用邊界與版本追溯')
    expect(docx.byteLength).toBeGreaterThan(4_000)
    expect(Buffer.from(docx).subarray(0, 2).toString('ascii')).toBe('PK')
    expect(workbook.byteLength).toBeGreaterThan(4_000)
    expect(Buffer.from(workbook).subarray(0, 2).toString('ascii')).toBe('PK')
    for (const needle of PAGE_ONLY_REPORT_STATUS_NEEDLES) {
      expect(html).not.toContain(needle)
    }

    const evidenceDir = resolveEvidenceDirectory()
    if (!evidenceDir) {
      return
    }

    mkdirSync(evidenceDir, { recursive: true })
    const htmlName = `${ARTIFACT_KEY}.html`
    const docxName = `${ARTIFACT_KEY}.docx`
    const workbookName = `${ARTIFACT_KEY}.xlsx`
    writeFileSync(path.join(evidenceDir, htmlName), html, 'utf8')
    writeFileSync(path.join(evidenceDir, docxName), docx)
    writeFileSync(path.join(evidenceDir, workbookName), workbook)
    writeFileSync(
      path.join(evidenceDir, 'rendered-delivery-evidence-summary.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          family: 'anchor-formal',
          generatedAt: new Date().toISOString(),
          required: 1,
          complete: [ARTIFACT_KEY],
          pass: true,
          records: [
            {
              key: ARTIFACT_KEY,
              artifact: htmlName,
              document: docxName,
              workbook: workbookName,
              htmlTextLength: html.length,
              documentBytes: docx.byteLength,
              workbookBytes: workbook.byteLength,
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
  })
})
