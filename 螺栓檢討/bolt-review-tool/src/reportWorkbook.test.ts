import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { Buffer } from 'buffer'
import { readFileSync } from 'node:fs'
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
import { CURRENT_CALC_ENGINE_VERSION, ENGINEERING_USE_DISCLAIMER, REPORT_SOURCE_TOOL } from './appMeta'
import { getEvaluationFieldStates } from './evaluationCatalog'
import { buildReportWorkbook, serializeReportWorkbook } from './reportWorkbook'
import { normalizeUnitPreferences } from './units'

const CORE_WORKBOOK_SHEETS = [
  'Summary',
  'LoadCases',
  'Results',
  'Dimensions',
  'Factors',
  'Candidates',
  'Evidence',
  'Layouts',
  'AuditTrail',
]

const CALCULATION_BOOK_CONTENT_BOUNDARY = JSON.parse(readFileSync(
  new URL('../../../結構工具箱/tools/calculation-book-content-boundary.json', import.meta.url),
  'utf8',
)) as { forbiddenCategories: Record<string, string[]> }
const PAGE_ONLY_REPORT_STATUS_NEEDLES = [...new Set(
  Object.values(CALCULATION_BOOK_CONTENT_BOUNDARY.forbiddenCategories).flat(),
)]

function buildParams() {
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
      documentApproved: true,
      documentApprovedAt: '2026-07-20T10:00:00.000Z',
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

function workbookText(workbook: ExcelJS.Workbook) {
  const chunks: string[] = []
  for (const worksheet of workbook.worksheets) {
    chunks.push(worksheet.name)
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.text) {
          chunks.push(cell.text)
          return
        }
        chunks.push(String(cell.value ?? ''))
      })
    })
  }
  return chunks.join('\n')
}

describe('reportWorkbook', () => {
  it('builds a workbook with the core review sheets', () => {
    const workbook = buildReportWorkbook(buildParams())

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(
      expect.arrayContaining(CORE_WORKBOOK_SHEETS),
    )
  })

  it('builds populated and filterable workbook sheets', () => {
    const workbook = buildReportWorkbook(buildParams())

    for (const sheetName of CORE_WORKBOOK_SHEETS) {
      const worksheet = workbook.getWorksheet(sheetName)
      expect(worksheet, `${sheetName} sheet exists`).toBeDefined()
      expect(worksheet!.rowCount, `${sheetName} row count`).toBeGreaterThan(1)
      expect(worksheet!.columnCount, `${sheetName} column count`).toBeGreaterThan(1)
      expect(worksheet!.views, `${sheetName} frozen header`).toContainEqual({
        state: 'frozen',
        ySplit: 1,
      })
      expect(worksheet!.autoFilter, `${sheetName} autofilter`).toMatchObject({
        from: { row: 1, column: 1 },
        to: { row: 1, column: worksheet!.columnCount },
      })
    }

    expect(workbook.getWorksheet('Summary')!.rowCount).toBeGreaterThanOrEqual(20)
    expect(workbook.getWorksheet('Results')!.rowCount).toBeGreaterThanOrEqual(8)
    expect(workbook.getWorksheet('Factors')!.rowCount).toBeGreaterThanOrEqual(8)
  })

  it('serializes a valid xlsx workbook buffer', async () => {
    const buffer = await serializeReportWorkbook(buildParams())
    const workbook = await readWorkbook(buffer)

    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain('Summary')
    const summaryRows = worksheetToObjects(workbook, 'Summary')
    expect(summaryRows.some((row) => row.項目 === '案例名稱')).toBe(true)
    expect(summaryRows.some((row) => row.項目 === '控制模式')).toBe(true)
    expect(
      summaryRows.some(
        (row) => row.項目 === '文件狀態' && row.值 === '正式附件',
      ),
    ).toBe(true)
    expect(
      summaryRows.some(
        (row) => row.項目 === '設計人員' && row.值 === '王設計',
      ),
    ).toBe(true)
    expect(
      summaryRows.some(
        (row) => row.項目 === '複核人員' && row.值 === '李複核',
      ),
    ).toBe(true)
    expect(
      summaryRows.some(
        (row) =>
          row.項目 === '案件計算版本' && row.值 === CURRENT_CALC_ENGINE_VERSION,
      ),
    ).toBe(true)
    expect(summaryRows.some((row) => row.項目 === '產出工具' && row.值 === REPORT_SOURCE_TOOL)).toBe(true)
    expect(summaryRows.some((row) => row.項目 === '工具版本' && row.值 === CURRENT_CALC_ENGINE_VERSION)).toBe(true)
    expect(summaryRows.some((row) => row.項目 === '輸出時間' && row.值)).toBe(true)
    expect(summaryRows.some((row) => row.項目 === '計算指紋' && String(row.值).startsWith('CF-'))).toBe(true)
    expect(summaryRows.some((row) => row.項目 === '使用邊界 / 簽證責任')).toBe(false)
    const text = workbookText(workbook)
    expect(text.length).toBeGreaterThan(2_000)
    expect(text).not.toContain(ENGINEERING_USE_DISCLAIMER)
    for (const needle of PAGE_ONLY_REPORT_STATUS_NEEDLES) {
      expect(text).not.toContain(needle)
    }

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
