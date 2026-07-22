import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
const CALCULATION_BOOK_CONTENT_BOUNDARY = JSON.parse(readFileSync(
  new URL('../../../結構工具箱/tools/calculation-book-content-boundary.json', import.meta.url),
  'utf8',
)) as { forbiddenCategories: Record<string, string[]> }
const PAGE_ONLY_REPORT_STATUS_NEEDLES = [...new Set(
  Object.values(CALCULATION_BOOK_CONTENT_BOUNDARY.forbiddenCategories).flat(),
)]

function buildParams(
  documentState: 'ready' | 'review' | 'blocked' = 'ready',
) {
  const product = defaultProducts.find(
    (item) => item.id === defaultProject.selectedProductId,
  )
  expect(product).toBeDefined()

  const project = {
    ...defaultProject,
    report: normalizeReportSettings({
      companyName: '測試工程顧問有限公司',
      projectCode: 'ANCHOR-001',
      designer: '王設計',
      checker: '李複核',
      issueDate: '2026-07-20',
      documentApproved: documentState === 'ready',
      documentApprovedAt:
        documentState === 'ready' ? REPORT_GENERATED_AT : '',
    }),
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
  if (documentState === 'review') {
    project.excludedCheckIds = [
      ...(defaultProject.excludedCheckIds ?? []),
      'pullout',
    ]
  }
  if (documentState === 'blocked') {
    project.loads = { ...defaultProject.loads, tensionKn: 100000 }
    project.loadCases = (defaultProject.loadCases ?? []).map((loadCase) => ({
      ...loadCase,
      loads: { ...loadCase.loads, tensionKn: 100000 },
    }))
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
    const reviewHtml = buildStandaloneReportHtml(buildParams('review'))
    const blockedHtml = buildStandaloneReportHtml(buildParams('blocked'))
    const docx = await serializeReportDocument(params)
    const workbook = await serializeReportWorkbook(params)

    expect(html.length).toBeGreaterThan(20_000)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain(defaultProject.name)
    expect(html).toContain('載重組合批次檢核')
    expect(html).toContain('文件追溯與版本')
    expect(html).toContain('data-document-state="formal-attachment"')
    expect(html).toContain('文件狀態：正式附件')
    expect(html).toContain('王設計')
    expect(html).toContain('李複核')
    expect(reviewHtml).toContain('data-document-state="internal-review"')
    expect(reviewHtml).toContain('文件狀態：內部審閱')
    expect(blockedHtml).toContain('data-document-state="internal-review"')
    expect(blockedHtml).toContain('文件狀態：內部審閱')
    expect(docx.byteLength).toBeGreaterThan(4_000)
    expect(Buffer.from(docx).subarray(0, 2).toString('ascii')).toBe('PK')
    expect(workbook.byteLength).toBeGreaterThan(4_000)
    expect(Buffer.from(workbook).subarray(0, 2).toString('ascii')).toBe('PK')
    for (const needle of PAGE_ONLY_REPORT_STATUS_NEEDLES) {
      expect(html).not.toContain(needle)
      expect(reviewHtml).not.toContain(needle)
      expect(blockedHtml).not.toContain(needle)
    }

    const evidenceDir = resolveEvidenceDirectory()
    if (!evidenceDir) {
      return
    }

    mkdirSync(evidenceDir, { recursive: true })
    const htmlName = `${ARTIFACT_KEY}.html`
    const docxName = `${ARTIFACT_KEY}.docx`
    const workbookName = `${ARTIFACT_KEY}.xlsx`
    const reviewHtmlName = `${ARTIFACT_KEY}-review.html`
    const blockedHtmlName = `${ARTIFACT_KEY}-blocked.html`
    writeFileSync(path.join(evidenceDir, htmlName), html, 'utf8')
    writeFileSync(path.join(evidenceDir, docxName), docx)
    writeFileSync(path.join(evidenceDir, workbookName), workbook)
    writeFileSync(path.join(evidenceDir, reviewHtmlName), reviewHtml, 'utf8')
    writeFileSync(path.join(evidenceDir, blockedHtmlName), blockedHtml, 'utf8')
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
              documentState: 'ready',
              reviewArtifact: reviewHtmlName,
              reviewDocumentState: 'review',
              reviewHtmlTextLength: reviewHtml.length,
              blockedArtifact: blockedHtmlName,
              blockedDocumentState: 'blocked',
              blockedHtmlTextLength: blockedHtml.length,
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
