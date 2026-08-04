import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
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
import {
  buildWorkspaceBackup,
  parseWorkspaceBackup,
  verifyWorkspaceBackupReplay,
} from '../src/backup'
import type { AnchorProduct, ProjectCase } from '../src/domain'
import { getEvaluationFieldStates } from '../src/evaluationCatalog'
import { serializeReportDocument } from '../src/reportDocx'
import { buildStandaloneReportHtml } from '../src/reportExport'
import {
  ANCHOR_APPROVAL_SEAL_SCOPE,
  ANCHOR_CONTENT_SEAL_SCOPE,
  verifyAnchorReportHtmlSeals,
} from '../src/reportHtmlSeal'
import { serializeReportWorkbook } from '../src/reportWorkbook'
import { normalizeUnitPreferences } from '../src/units'

const ARTIFACT_KEY = 'anchor-review'
const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const REPORT_GENERATED_AT = '2026-07-17T00:00:00.000Z'
const CALCULATION_BOOK_CONTENT_BOUNDARY = JSON.parse(readFileSync(
  new URL('../../../結構工具箱/tools/calculation-book-content-boundary.json', import.meta.url),
  'utf8',
)) as { forbiddenCategories: Record<string, string[]> }
const PAGE_ONLY_REPORT_STATUS_NEEDLES = [...new Set(
  Object.values(CALCULATION_BOOK_CONTENT_BOUNDARY.forbiddenCategories).flat(),
)]

function buildProject(
  documentState: 'ready' | 'review' | 'blocked' = 'ready',
) {
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

  return project
}

function buildParamsFromProject(
  project: ProjectCase,
  product: AnchorProduct,
  auditHash = 'abcdef1234567890abcdef1234567890',
) {
  const batchReview = evaluateProjectBatch(project, product!)
  const auditEntry = {
    id: 'anchor-formal-artifact',
    createdAt: REPORT_GENERATED_AT,
    hash: auditHash,
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

function buildParams(
  documentState: 'ready' | 'review' | 'blocked' = 'ready',
) {
  const product = defaultProducts.find(
    (item) => item.id === defaultProject.selectedProductId,
  )
  expect(product).toBeDefined()
  return buildParamsFromProject(buildProject(documentState), product!)
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
    const sourceProject = buildProject()
    const sourceProduct = defaultProducts.find(
      (item) => item.id === sourceProject.selectedProductId,
    )
    expect(sourceProduct).toBeDefined()
    const sourceBatchReview = evaluateProjectBatch(sourceProject, sourceProduct!)
    const backupPayload = await buildWorkspaceBackup(
      [sourceProduct!],
      [sourceProject],
      [],
    )
    backupPayload.exportedAt = REPORT_GENERATED_AT
    const sourceBackupJson = JSON.stringify(backupPayload)
    const parsedBackup = parseWorkspaceBackup(sourceBackupJson)
    const replayVerification = await verifyWorkspaceBackupReplay(parsedBackup)
    expect(replayVerification).toEqual({ verifiedProjects: 1, legacyProjects: 0 })
    const replayProject = parsedBackup.projects[0]
    const replayProduct = parsedBackup.products.find(
      (item) => item.id === replayProject.selectedProductId,
    )
    const replayRecord = parsedBackup.caseReplay[0]
    expect(replayProduct).toBeDefined()
    expect(replayRecord.projectId).toBe(replayProject.id)
    const params = buildParamsFromProject(
      replayProject,
      replayProduct!,
      replayRecord.fingerprint,
    )
    expect(params.batchReview.controllingLoadCaseId).toBe(
      sourceBatchReview.controllingLoadCaseId,
    )
    expect(params.batchReview.controllingLoadCaseName).toBe(
      sourceBatchReview.controllingLoadCaseName,
    )
    expect(params.batchReview.summary.governingMode).toBe(
      sourceBatchReview.summary.governingMode,
    )
    expect(params.batchReview.summary.governingDcr).toBe(
      sourceBatchReview.summary.governingDcr,
    )
    expect(params.batchReview.summary.maxDcr).toBe(
      sourceBatchReview.summary.maxDcr,
    )
    expect(params.batchReview.summary.overallStatus).toBe(
      sourceBatchReview.summary.overallStatus,
    )
    expect(params.batchReview.summary.formalStatus).toBe(
      sourceBatchReview.summary.formalStatus,
    )
    const html = buildStandaloneReportHtml(params)
    const reviewHtml = buildStandaloneReportHtml(buildParams('review'))
    const blockedHtml = buildStandaloneReportHtml(buildParams('blocked'))
    const htmlSealVerification = verifyAnchorReportHtmlSeals(html)
    const contentTamperVerification = verifyAnchorReportHtmlSeals(
      html.replace('載重組合批次檢核', '載重組合批次檢核（遭修改）'),
    )
    const approvalTamperVerification = verifyAnchorReportHtmlSeals(
      html.replace(
        `data-approved-at="${REPORT_GENERATED_AT}"`,
        'data-approved-at="2026-07-17T00:01:00.000Z"',
      ),
    )
    const docx = await serializeReportDocument(params)
    const workbook = await serializeReportWorkbook(params)
    const calculationFingerprint = `CF-${replayRecord.fingerprint
      .slice(0, 16)
      .toUpperCase()}`

    expect(html.length).toBeGreaterThan(20_000)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain(defaultProject.name)
    expect(html).toContain('載重組合批次檢核')
    expect(html).toContain('文件追溯與版本')
    expect(html).toContain('data-document-state="formal-attachment"')
    expect(html).toContain('文件狀態：正式附件')
    expect(html).toContain('王設計')
    expect(html).toContain('李複核')
    expect(html).toContain(calculationFingerprint)
    expect(htmlSealVerification).toMatchObject({
      content: { status: 'verified' },
      approval: { status: 'verified' },
    })
    expect(contentTamperVerification).toMatchObject({
      content: { status: 'failed' },
      approval: { status: 'verified' },
    })
    expect(approvalTamperVerification).toMatchObject({
      content: { status: 'verified' },
      approval: { status: 'failed' },
    })
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
    const sourceBackupName = `${ARTIFACT_KEY}-source-backup.json`
    const reviewHtmlName = `${ARTIFACT_KEY}-review.html`
    const blockedHtmlName = `${ARTIFACT_KEY}-blocked.html`
    const resultReconciliation = {
      schemaVersion: 1,
      strategy: 'anchor-workspace-replay-to-html-docx-xlsx-hash',
      caseId: replayProject.id,
      sourceBackupSha256: sha256(sourceBackupJson),
      sourceReplayFingerprint: replayRecord.fingerprint,
      calculationFingerprint,
      verifiedProjectCount: replayVerification.verifiedProjects,
      verifiedAssertionCount: 7,
      htmlSha256: sha256(html),
      docxSha256: sha256(docx),
      workbookSha256: sha256(workbook),
      pass: true,
    }
    writeFileSync(path.join(evidenceDir, htmlName), html, 'utf8')
    writeFileSync(path.join(evidenceDir, docxName), docx)
    writeFileSync(path.join(evidenceDir, workbookName), workbook)
    writeFileSync(path.join(evidenceDir, sourceBackupName), sourceBackupJson, 'utf8')
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
              artifactBytes: Buffer.byteLength(html, 'utf8'),
              artifactSha256: sha256(html),
              document: docxName,
              documentBytes: docx.byteLength,
              documentSha256: sha256(docx),
              workbook: workbookName,
              workbookBytes: workbook.byteLength,
              workbookSha256: sha256(workbook),
              sourceBackup: sourceBackupName,
              sourceBackupBytes: Buffer.byteLength(sourceBackupJson, 'utf8'),
              sourceBackupArtifactSha256: sha256(sourceBackupJson),
              documentState: 'ready',
              evidenceRole: 'approved-formal-attachment',
              contentSealStatus: htmlSealVerification.content.status,
              contentSealScope: ANCHOR_CONTENT_SEAL_SCOPE,
              contentSha256: htmlSealVerification.content.actual,
              approvalSealStatus: htmlSealVerification.approval.status,
              approvalSealScope: ANCHOR_APPROVAL_SEAL_SCOPE,
              approvalSha256: htmlSealVerification.approval.actual,
              contentTamperDetectionStatus: contentTamperVerification.content.status,
              approvalTamperDetectionStatus: approvalTamperVerification.approval.status,
              approvalTamperContentStatus: approvalTamperVerification.content.status,
              reviewArtifact: reviewHtmlName,
              reviewArtifactBytes: Buffer.byteLength(reviewHtml, 'utf8'),
              reviewArtifactSha256: sha256(reviewHtml),
              reviewDocumentState: 'review',
              reviewHtmlTextLength: reviewHtml.length,
              blockedArtifact: blockedHtmlName,
              blockedArtifactBytes: Buffer.byteLength(blockedHtml, 'utf8'),
              blockedArtifactSha256: sha256(blockedHtml),
              blockedDocumentState: 'blocked',
              blockedHtmlTextLength: blockedHtml.length,
              htmlTextLength: html.length,
              resultReconciliation,
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
