import type ExcelJS from 'exceljs'
import { sha256Text } from './reportHtmlSeal'

export const ANCHOR_XLSX_CONTENT_SEAL_SCOPE =
  'anchor-xlsx-calculation-book-content-v1'
export const ANCHOR_XLSX_APPROVAL_SEAL_SCOPE =
  'anchor-xlsx-calculation-book-approval-v1'

export const ANCHOR_XLSX_SEAL_LABELS = {
  contentScope: 'XLSX 內容封印範圍',
  contentSha256: 'XLSX 內容 SHA-256',
  approvalScope: 'XLSX 核可封印範圍',
  approvalSha256: 'XLSX 核可 SHA-256',
  note: 'XLSX 封印說明',
} as const

const APPROVAL_FIELD_LABELS = [
  '文件狀態',
  '核可資訊',
  '產出工具',
  '工具版本',
  '輸出時間',
  '計算指紋',
] as const

const EXCLUDED_SUMMARY_LABELS: ReadonlySet<string> = new Set<string>([
  ...APPROVAL_FIELD_LABELS,
  ...Object.values(ANCHOR_XLSX_SEAL_LABELS),
])

type CanonicalScalar = string | number | boolean | null

function canonicalScalar(value: unknown): CanonicalScalar {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function canonicalCellValue(
  cell: ExcelJS.Cell,
): [kind: string, formula: string, value: CanonicalScalar] {
  const value = cell.value
  if (
    value &&
    typeof value === 'object' &&
    'formula' in value &&
    typeof value.formula === 'string'
  ) {
    return ['formula', value.formula, canonicalScalar(value.result)]
  }
  return ['value', '', canonicalScalar(value)]
}

function summaryLabelForRow(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  return String(worksheet.getRow(rowNumber).getCell(1).value ?? '').trim()
}

export function canonicalAnchorWorkbookContent(workbook: ExcelJS.Workbook) {
  const sheets = workbook.worksheets.map((worksheet) => {
    const cells: Array<[string, string, string, CanonicalScalar]> = []
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (
        worksheet.name === 'Summary' &&
        EXCLUDED_SUMMARY_LABELS.has(summaryLabelForRow(worksheet, rowNumber))
      ) {
        return
      }
      row.eachCell({ includeEmpty: false }, (cell) => {
        const [kind, formula, value] = canonicalCellValue(cell)
        cells.push([cell.address, kind, formula, value])
      })
    })
    return { name: worksheet.name, cells }
  })
  return JSON.stringify({ scope: ANCHOR_XLSX_CONTENT_SEAL_SCOPE, sheets })
}

function summaryFieldMap(workbook: ExcelJS.Workbook) {
  const summary = workbook.getWorksheet('Summary')
  if (!summary) throw new Error('XLSX 缺少 Summary 工作表')
  const fields = new Map<string, string>()
  summary.eachRow({ includeEmpty: false }, (row) => {
    fields.set(String(row.getCell(1).value ?? '').trim(), String(row.getCell(2).value ?? '').trim())
  })
  return fields
}

export function canonicalAnchorWorkbookApproval(
  workbook: ExcelJS.Workbook,
  contentSha256: string,
) {
  const fields = summaryFieldMap(workbook)
  return JSON.stringify({
    scope: ANCHOR_XLSX_APPROVAL_SEAL_SCOPE,
    documentState: fields.get('文件狀態') ?? '',
    approvalInfo: fields.get('核可資訊') ?? '',
    sourceTool: fields.get('產出工具') ?? '',
    toolVersion: fields.get('工具版本') ?? '',
    outputTime: fields.get('輸出時間') ?? '',
    calculationFingerprint: fields.get('計算指紋') ?? '',
    contentSha256: contentSha256.toLowerCase(),
  })
}

export interface AnchorWorkbookSealValues {
  contentScope: string
  contentSha256: string
  approvalScope: string
  approvalSha256: string
  note: string
}

export function buildAnchorWorkbookSealValues(
  workbook: ExcelJS.Workbook,
): AnchorWorkbookSealValues {
  const contentSha256 = sha256Text(canonicalAnchorWorkbookContent(workbook))
  const approvalSha256 = sha256Text(
    canonicalAnchorWorkbookApproval(workbook, contentSha256),
  )
  return {
    contentScope: ANCHOR_XLSX_CONTENT_SEAL_SCOPE,
    contentSha256,
    approvalScope: ANCHOR_XLSX_APPROVAL_SEAL_SCOPE,
    approvalSha256,
    note: 'SHA-256 防竄改證據，非核可人身分之數位簽章',
  }
}

export function appendAnchorWorkbookSealRows(workbook: ExcelJS.Workbook) {
  const summary = workbook.getWorksheet('Summary')
  if (!summary) throw new Error('XLSX 缺少 Summary 工作表')
  const values = buildAnchorWorkbookSealValues(workbook)
  const rows = [
    [ANCHOR_XLSX_SEAL_LABELS.contentScope, values.contentScope],
    [ANCHOR_XLSX_SEAL_LABELS.contentSha256, values.contentSha256],
    [ANCHOR_XLSX_SEAL_LABELS.approvalScope, values.approvalScope],
    [ANCHOR_XLSX_SEAL_LABELS.approvalSha256, values.approvalSha256],
    [ANCHOR_XLSX_SEAL_LABELS.note, values.note],
  ]
  for (const [label, value] of rows) summary.addRow({ 項目: label, 值: value })
  return values
}
