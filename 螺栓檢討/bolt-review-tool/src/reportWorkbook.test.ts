import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { Buffer } from 'buffer'
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
import { buildReportWorkbook, serializeReportWorkbook } from './reportWorkbook'
import { normalizeUnitPreferences } from './units'

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
        updatedAt: new Date().toISOString(),
      },
    ],
  }
  const batchReview = evaluateProjectBatch(project, product!)

  return {
    batchReview,
    candidateProductReviews: evaluateCandidateProducts(project, [product!]),
    layoutVariantReviews: evaluateLayoutVariants(
      project,
      product!,
      project.candidateLayoutVariants ?? [],
    ),
    review: batchReview.activeReview,
    selectedProduct: product!,
    completeness: assessProductCompleteness(product!),
    evaluationFieldStates: getEvaluationFieldStates(product!),
    unitPreferences: normalizeUnitPreferences(project.ui),
    reportSettings: normalizeReportSettings(project.report),
    saveMessage: '離線資料已同步',
    auditEntry: {
      id: 'audit-1',
      createdAt: '2026-04-22T10:00:00.000Z',
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
        updatedAt: '2026-04-22T10:00:00.000Z',
      },
    },
    auditTrail: [
      {
        id: 'audit-1',
        createdAt: '2026-04-22T10:00:00.000Z',
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
          updatedAt: '2026-04-22T10:00:00.000Z',
        },
      },
    ],
  }
}

async function readWorkbook(buffer: Uint8Array) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(
    Buffer.from(buffer) as unknown as Parameters<
      ExcelJS.Workbook['xlsx']['load']
    >[0],
  )
  return workbook
}

function worksheetToObjects(workbook: ExcelJS.Workbook, name: string) {
  const worksheet = workbook.getWorksheet(name)
  expect(worksheet).toBeDefined()
  const headerRow = worksheet!.getRow(1)
  const rawHeaderValues = Array.isArray(headerRow.values)
    ? headerRow.values.slice(1)
    : []
  const headers = rawHeaderValues.map((value: ExcelJS.CellValue) =>
    String(value ?? ''),
  )
  const dataRows = worksheet!.getRows(2, Math.max(worksheet!.rowCount - 1, 0)) ?? []
  return dataRows.map((row) => {
    const result: Record<string, string> = {}
    headers.forEach((header: string, index: number) => {
      result[header] = String(row.getCell(index + 1).value ?? '')
    })
    return result
  })
}

describe('reportWorkbook', () => {
  it('builds a workbook with the core review sheets', () => {
    const workbook = buildReportWorkbook(buildParams())

    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain('Summary')
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain('LoadCases')
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain('Results')
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain('Factors')
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain('Evidence')
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain('Layouts')
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain('AuditTrail')
  })

  it('serializes a valid xlsx workbook buffer', async () => {
    const buffer = await serializeReportWorkbook(buildParams())
    const workbook = await readWorkbook(buffer)

    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain('Summary')
    const summaryRows = worksheetToObjects(workbook, 'Summary')
    expect(summaryRows.some((row) => row.項目 === '案例名稱')).toBe(true)
    expect(summaryRows.some((row) => row.項目 === '控制模式')).toBe(true)

    const summarySheet = workbook.getWorksheet('Summary')
    expect(summarySheet).toBeDefined()
    expect(summarySheet!.getRow(1).getCell(1).fill).toMatchObject({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F5461' },
    })
    expect(summarySheet!.getRow(2).getCell(1).font).toMatchObject({ bold: true })
  })

  it('includes candidate and layout comparison content in dedicated sheets', async () => {
    const buffer = await serializeReportWorkbook(buildParams())
    const workbook = await readWorkbook(buffer)

    const candidateRows = worksheetToObjects(workbook, 'Candidates')
    const layoutRows = worksheetToObjects(workbook, 'Layouts')
    const auditRows = worksheetToObjects(workbook, 'AuditTrail')

    expect(candidateRows[0]?.產品).toContain('Generic')
    expect(layoutRows.some((row) => row.配置 === '加大邊距方案')).toBe(true)
    expect(auditRows[0]?.Hash).toContain('ABCDEF1234567890')
  })

  it('writes formula-backed DCR recalculation cells in the Results sheet', async () => {
    const buffer = await serializeReportWorkbook(buildParams())
    const workbook = await readWorkbook(buffer)
    const resultsSheet = workbook.getWorksheet('Results')

    expect(resultsSheet).toBeDefined()
    expect(resultsSheet!.getRow(1).values).toContain('DCR重算')

    const headerRow = resultsSheet!.getRow(1)
    const dcrFormulaColumn = Array.isArray(headerRow.values)
      ? headerRow.values.findIndex((value) => value === 'DCR重算')
      : -1

    expect(dcrFormulaColumn).toBeGreaterThan(0)

    const formulaCell = resultsSheet!.getRow(2).getCell(dcrFormulaColumn)
    expect(formulaCell.value).toMatchObject({
      formula: expect.stringContaining('IFERROR('),
    })
  })
})
