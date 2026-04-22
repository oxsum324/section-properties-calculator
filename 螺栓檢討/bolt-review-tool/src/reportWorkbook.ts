import ExcelJS from 'exceljs'
import type {
  CheckResult,
  ProjectAuditSource,
  ReviewStatus,
  UnitPreferences,
} from './domain'
import type { ReportArtifactParams } from './reportExport'
import { REPORT_TIMESTAMP_LABELS } from './reportTimestamps'
import { getUnitSymbol, toDisplayValue } from './units'

type WorkbookRow = Record<string, string | number | boolean | null>
export type ReportTableRow = WorkbookRow

const workbookColors = {
  headerFill: 'FF0F5461',
  headerText: 'FFF7F5EF',
  headerBorder: 'FFCBD8D8',
  bodyBorder: 'FFD8E1E1',
  summaryFill: 'FFEAF4F3',
  dcrWarnFill: 'FFFBE8C8',
  dcrFailFill: 'FFF8D7D4',
} as const

function formatNumber(value: number, digits = 3) {
  if (!Number.isFinite(value)) {
    return ''
  }

  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function statusLabel(status: ReviewStatus) {
  switch (status) {
    case 'pass':
      return '符合'
    case 'fail':
      return '不符合'
    case 'screening':
      return '初篩'
    case 'incomplete':
      return '需補資料'
    case 'warning':
      return '提醒'
    default:
      return status
  }
}

function familyLabel(family: ReportArtifactParams['selectedProduct']['family']) {
  switch (family) {
    case 'cast_in':
      return '預埋錨栓'
    case 'post_installed_expansion':
      return '後置膨脹錨栓'
    case 'post_installed_bonded':
      return '後置黏結式錨栓'
    case 'screw_anchor':
      return '螺紋錨栓'
    case 'undercut_anchor':
      return '擴底式錨栓'
    case 'shear_lug':
      return '剪力榫'
    default:
      return family
  }
}

function getGoverningDcr(summary: { governingDcr?: number; maxDcr: number }) {
  return summary.governingDcr ?? summary.maxDcr
}

function formatAuditHash(hash?: string, length = 12) {
  if (!hash) {
    return ''
  }

  return hash.slice(0, Math.max(8, length)).toUpperCase()
}

function auditSourceLabel(source?: ProjectAuditSource) {
  switch (source) {
    case 'manual':
      return '手動留存'
    case 'preview':
      return '報表預覽'
    case 'print':
      return '列印報表'
    case 'html':
      return '匯出 HTML'
    case 'xlsx':
      return '匯出 XLSX'
    case 'docx':
      return '匯出 DOCX'
    default:
      return ''
  }
}

function getResultValueUnit(
  result: CheckResult,
  units: UnitPreferences,
): { quantity: 'force' | 'stress' | 'length' | 'ratio'; symbol: string } {
  if (result.presentation === 'stress') {
    return { quantity: 'stress', symbol: getUnitSymbol('stress', units) }
  }
  if (result.presentation === 'length') {
    return { quantity: 'length', symbol: getUnitSymbol('length', units) }
  }
  if (result.presentation === 'ratio') {
    return { quantity: 'ratio', symbol: '—' }
  }
  return { quantity: 'force', symbol: getUnitSymbol('force', units) }
}

function convertResultValue(
  result: CheckResult,
  value: number,
  units: UnitPreferences,
) {
  const presentation = getResultValueUnit(result, units)
  if (presentation.quantity === 'ratio') {
    return formatNumber(value)
  }
  return formatNumber(
    toDisplayValue(
      value,
      presentation.quantity === 'force'
        ? 'force'
        : presentation.quantity === 'stress'
          ? 'stress'
          : 'length',
      units,
    ),
  )
}

function convertLength(value: number, units: UnitPreferences) {
  return formatNumber(toDisplayValue(value, 'length', units))
}

function getColumnLetter(columnNumber: number) {
  let dividend = columnNumber
  let columnName = ''

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26
    columnName = String.fromCharCode(65 + modulo) + columnName
    dividend = Math.floor((dividend - modulo) / 26)
  }

  return columnName
}

function autosizeWorksheet(worksheet: ExcelJS.Worksheet, rows: WorkbookRow[]) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : []
  worksheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: Math.min(
      Math.max(
        header.length + 2,
        ...rows.map((row) => String(row[header] ?? '').length + 2),
      ),
      48,
    ),
  }))
  worksheet.addRows(rows)
  worksheet.getRow(1).font = { bold: true, color: { argb: workbookColors.headerText } }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
}

function styleWorksheet(
  worksheet: ExcelJS.Worksheet,
  rows: WorkbookRow[],
  options?: {
    highlightDcrHeaders?: string[]
    formulaColumns?: Array<{
      outputHeader: string
      demandHeader: string
      designHeader: string
    }>
    emphasizeSummarySheet?: boolean
  },
) {
  const headerRow = worksheet.getRow(1)
  headerRow.height = 24
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: workbookColors.headerFill },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = {
      top: { style: 'thin', color: { argb: workbookColors.headerBorder } },
      left: { style: 'thin', color: { argb: workbookColors.headerBorder } },
      bottom: { style: 'thin', color: { argb: workbookColors.headerBorder } },
      right: { style: 'thin', color: { argb: workbookColors.headerBorder } },
    }
  })
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columnCount },
  }

  const headers = rows.length > 0 ? Object.keys(rows[0]) : []

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = {
        top: { style: 'thin', color: { argb: workbookColors.bodyBorder } },
        left: { style: 'thin', color: { argb: workbookColors.bodyBorder } },
        bottom: { style: 'thin', color: { argb: workbookColors.bodyBorder } },
        right: { style: 'thin', color: { argb: workbookColors.bodyBorder } },
      }
    })
  }

  if (options?.emphasizeSummarySheet) {
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber)
      row.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: workbookColors.summaryFill },
      }
      row.getCell(1).font = { bold: true }
    }
  }

  for (const dcrHeader of options?.highlightDcrHeaders ?? []) {
    const index = headers.indexOf(dcrHeader)
    if (index === -1) {
      continue
    }
    const column = index + 1
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const cell = worksheet.getRow(rowNumber).getCell(column)
      const numericValue =
        typeof cell.value === 'number'
          ? cell.value
          : typeof cell.value === 'object' &&
              cell.value !== null &&
              'result' in cell.value &&
              typeof cell.value.result === 'number'
            ? cell.value.result
            : null
      if (numericValue === null) {
        continue
      }
      if (numericValue > 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: workbookColors.dcrFailFill },
        }
        cell.font = { bold: true, color: { argb: 'FF9C2B16' } }
      } else if (numericValue >= 0.85) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: workbookColors.dcrWarnFill },
        }
      }
    }
  }

  for (const formulaColumn of options?.formulaColumns ?? []) {
    const outputIndex = headers.indexOf(formulaColumn.outputHeader)
    const demandIndex = headers.indexOf(formulaColumn.demandHeader)
    const designIndex = headers.indexOf(formulaColumn.designHeader)
    if (outputIndex === -1 || demandIndex === -1 || designIndex === -1) {
      continue
    }
    const outputColumn = outputIndex + 1
    const demandLetter = getColumnLetter(demandIndex + 1)
    const designLetter = getColumnLetter(designIndex + 1)
    const outputCellSourceIndex = headers.indexOf('DCR')

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const outputCell = worksheet.getRow(rowNumber).getCell(outputColumn)
      const cachedCell =
        outputCellSourceIndex === -1
          ? null
          : worksheet.getRow(rowNumber).getCell(outputCellSourceIndex + 1)
      const cachedResult =
        typeof cachedCell?.value === 'number' ? cachedCell.value : undefined
      outputCell.value = {
        formula: `IFERROR(${demandLetter}${rowNumber}/${designLetter}${rowNumber},"")`,
        result: cachedResult,
      }
    }
  }
}

function appendSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: WorkbookRow[],
  options?: {
    highlightDcrHeaders?: string[]
    formulaColumns?: Array<{
      outputHeader: string
      demandHeader: string
      designHeader: string
    }>
    emphasizeSummarySheet?: boolean
  },
) {
  const worksheet = workbook.addWorksheet(name)
  autosizeWorksheet(worksheet, rows)
  styleWorksheet(worksheet, rows, options)
}

export function buildSummaryRows(params: ReportArtifactParams): ReportTableRow[] {
  const {
    batchReview,
    review,
    selectedProduct,
    completeness,
    reportSettings,
    unitPreferences,
  } = params

  const reportGeneratedAt = params.reportGeneratedAt ?? new Date().toISOString()
  return [
    { 項目: '案例名稱', 值: review.project.name },
    { 項目: '規範版本', 值: review.ruleProfile.versionLabel },
    { 項目: '案號/專案', 值: reportSettings.projectCode || '' },
    { 項目: '公司/單位', 值: reportSettings.companyName || '' },
    { 項目: '產品', 值: `${selectedProduct.brand} ${selectedProduct.model}` },
    { 項目: '產品族群', 值: familyLabel(selectedProduct.family) },
    { 項目: '整體判定', 值: statusLabel(batchReview.summary.overallStatus) },
    { 項目: '正式性', 值: statusLabel(batchReview.summary.formalStatus) },
    { 項目: '控制組合', 值: batchReview.controllingLoadCaseName },
    { 項目: '控制模式', 值: batchReview.summary.governingMode },
    { 項目: '控制 DCR', 值: formatNumber(getGoverningDcr(batchReview.summary)) },
    { 項目: '最大數值 DCR', 值: formatNumber(batchReview.summary.maxDcr) },
    { 項目: '產品 completeness', 值: completeness.formal ? '完整' : '待補' },
    { 項目: REPORT_TIMESTAMP_LABELS.editedAt, 值: review.project.updatedAt },
    { 項目: REPORT_TIMESTAMP_LABELS.generatedAt, 值: reportGeneratedAt },
    { 項目: REPORT_TIMESTAMP_LABELS.auditedAt, 值: params.auditEntry?.createdAt ?? '' },
    { 項目: REPORT_TIMESTAMP_LABELS.auditSource, 值: auditSourceLabel(params.auditEntry?.source) },
    { 項目: REPORT_TIMESTAMP_LABELS.auditHash, 值: formatAuditHash(params.auditEntry?.hash) },
    {
      項目: '目前單位',
      值: `${getUnitSymbol('length', unitPreferences)} / ${getUnitSymbol('area', unitPreferences)} / ${getUnitSymbol('force', unitPreferences)} / ${getUnitSymbol('stress', unitPreferences)}`,
    },
  ]
}

export function buildAuditRows(params: ReportArtifactParams): ReportTableRow[] {
  return (params.auditTrail ?? []).map((entry) => ({
    時間: entry.createdAt,
    來源: auditSourceLabel(entry.source),
    Hash: formatAuditHash(entry.hash, 16),
    控制組合: entry.summary.controllingLoadCaseName ?? '',
    控制模式: entry.summary.governingMode,
    控制DCR: formatNumber(entry.summary.governingDcr ?? entry.summary.maxDcr),
    最大數值DCR: formatNumber(entry.summary.maxDcr),
    狀態: statusLabel(entry.summary.overallStatus),
  }))
}

export function buildLoadCaseRows(params: ReportArtifactParams): ReportTableRow[] {
  const { batchReview, unitPreferences } = params

  return batchReview.loadCaseReviews.map((item) => {
    const loads = item.review.analysisLoads
    return {
      組合: item.loadCaseName,
      目前編輯: item.loadCaseId === batchReview.activeLoadCaseId ? '是' : '',
      控制組合: item.loadCaseId === batchReview.controllingLoadCaseId ? '是' : '',
      N: formatNumber(toDisplayValue(loads.tensionKn, 'force', unitPreferences)),
      Vx: formatNumber(toDisplayValue(loads.shearXKn, 'force', unitPreferences)),
      Vy: formatNumber(toDisplayValue(loads.shearYKn, 'force', unitPreferences)),
      V合成: formatNumber(
        toDisplayValue(
          Math.hypot(loads.shearXKn, loads.shearYKn),
          'force',
          unitPreferences,
        ),
      ),
      Mx: formatNumber(toDisplayValue(loads.momentXKnM, 'moment', unitPreferences)),
      My: formatNumber(toDisplayValue(loads.momentYKnM, 'moment', unitPreferences)),
      控制模式: item.review.summary.governingMode,
      控制DCR: formatNumber(getGoverningDcr(item.review.summary)),
      最大數值DCR: formatNumber(item.review.summary.maxDcr),
      整體狀態: statusLabel(item.review.summary.overallStatus),
      正式性: statusLabel(item.review.summary.formalStatus),
    }
  })
}

export function buildResultRows(params: ReportArtifactParams): ReportTableRow[] {
  const { batchReview, unitPreferences } = params
  const rows: WorkbookRow[] = []

  for (const item of batchReview.loadCaseReviews) {
    for (const result of item.review.results) {
      const unit = getResultValueUnit(result, unitPreferences)
      rows.push({
        組合: item.loadCaseName,
        檢核模式: result.mode,
        條文: `${result.citation.clause} ${result.citation.title}`,
        狀態: statusLabel(result.status),
        正式性: result.formal ? '正式' : '初篩/提醒',
        需求值: convertResultValue(result, result.demandKn, unitPreferences),
        設計值: convertResultValue(result, result.designStrengthKn, unitPreferences),
        名義值: convertResultValue(result, result.nominalStrengthKn, unitPreferences),
      單位: unit.symbol,
      DCR: formatNumber(result.dcr),
      DCR重算: '',
      說明: result.note ?? '',
    })
  }
  }

  return rows
}

export function buildDimensionRows(params: ReportArtifactParams): ReportTableRow[] {
  const { batchReview, unitPreferences } = params
  const rows: WorkbookRow[] = []

  for (const item of batchReview.loadCaseReviews) {
    for (const check of item.review.dimensionChecks) {
      rows.push({
        組合: item.loadCaseName,
        項目: check.label,
        條文: `${check.citation.clause} ${check.citation.title}`,
        需求值: convertLength(check.requiredMm, unitPreferences),
        實際值: convertLength(check.actualMm, unitPreferences),
        單位: getUnitSymbol('length', unitPreferences),
        來源: check.source,
        狀態: statusLabel(check.status),
        說明: check.note ?? '',
      })
    }
  }

  return rows
}

export function buildFactorRows(params: ReportArtifactParams): ReportTableRow[] {
  const { batchReview } = params
  const rows: WorkbookRow[] = []

  for (const item of batchReview.loadCaseReviews) {
    for (const result of item.review.results) {
      for (const factor of result.factors ?? []) {
        rows.push({
          組合: item.loadCaseName,
          檢核模式: result.mode,
          符號: factor.symbol,
          標籤: factor.label,
          值: factor.value,
          備註: factor.note ?? '',
        })
      }
    }
  }

  return rows
}

export function buildEvidenceRows(params: ReportArtifactParams): ReportTableRow[] {
  return params.evaluationFieldStates
    .filter((field) => field.hasValue || field.hasEvidence)
    .map((field) => ({
      欄位: field.label,
      目前值:
        field.rawValue === undefined || field.rawValue === null
          ? ''
          : String(field.rawValue),
      文件: field.evidence?.documentName ?? '',
      頁碼表號: field.evidence?.page ?? '',
      已核對: field.evidence?.verified ? '是' : '',
    }))
}

export function buildCandidateProductRows(
  params: ReportArtifactParams,
): ReportTableRow[] {
  return params.candidateProductReviews.map((item) => ({
    產品: `${item.product.brand} ${item.product.model}`,
    族群: familyLabel(item.product.family),
    控制組合: item.batchReview.controllingLoadCaseName,
    控制模式: item.batchReview.summary.governingMode,
    控制DCR: formatNumber(getGoverningDcr(item.batchReview.summary)),
    最大數值DCR: formatNumber(item.batchReview.summary.maxDcr),
    整體狀態: statusLabel(item.batchReview.summary.overallStatus),
    正式性: statusLabel(item.batchReview.summary.formalStatus),
  }))
}

export function buildLayoutVariantRows(
  params: ReportArtifactParams,
): ReportTableRow[] {
  const { layoutVariantReviews, unitPreferences } = params
  return (layoutVariantReviews ?? []).map((item) => ({
    配置: item.variant.name,
    目前配置: item.isCurrent ? '是' : '',
    錨栓數: item.variant.layout.anchorCountX * item.variant.layout.anchorCountY,
    hef: convertLength(item.variant.layout.effectiveEmbedmentMm, unitPreferences),
    sx: convertLength(item.variant.layout.spacingXmm, unitPreferences),
    sy: convertLength(item.variant.layout.spacingYmm, unitPreferences),
    控制組合: item.batchReview.controllingLoadCaseName,
    控制模式: item.batchReview.summary.governingMode,
    控制DCR: formatNumber(getGoverningDcr(item.batchReview.summary)),
    整體狀態: statusLabel(item.batchReview.summary.overallStatus),
    備註: item.variant.note ?? '',
  }))
}

export function buildReportWorkbook(params: ReportArtifactParams) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'bolt-review-tool'
  workbook.created = new Date()

  appendSheet(workbook, 'Summary', buildSummaryRows(params), {
    emphasizeSummarySheet: true,
  })
  appendSheet(workbook, 'LoadCases', buildLoadCaseRows(params), {
    highlightDcrHeaders: ['控制DCR', '最大數值DCR'],
  })
  appendSheet(workbook, 'Results', buildResultRows(params), {
    highlightDcrHeaders: ['DCR', 'DCR重算'],
    formulaColumns: [
      {
        outputHeader: 'DCR重算',
        demandHeader: '需求值',
        designHeader: '設計值',
      },
    ],
  })

  const dimensionRows = buildDimensionRows(params)
  if (dimensionRows.length > 0) {
    appendSheet(workbook, 'Dimensions', dimensionRows)
  }

  const factorRows = buildFactorRows(params)
  if (factorRows.length > 0) {
    appendSheet(workbook, 'Factors', factorRows)
  }

  const candidateRows = buildCandidateProductRows(params)
  if (candidateRows.length > 0) {
    appendSheet(workbook, 'Candidates', candidateRows, {
      highlightDcrHeaders: ['控制DCR', '最大數值DCR'],
    })
  }

  const variantRows = buildLayoutVariantRows(params)
  if (variantRows.length > 0) {
    appendSheet(workbook, 'Layouts', variantRows, {
      highlightDcrHeaders: ['控制DCR'],
    })
  }

  const evidenceRows = buildEvidenceRows(params)
  if (evidenceRows.length > 0) {
    appendSheet(workbook, 'Evidence', evidenceRows)
  }

  const auditRows = buildAuditRows(params)
  if (auditRows.length > 0) {
    appendSheet(workbook, 'AuditTrail', auditRows, {
      highlightDcrHeaders: ['控制DCR', '最大數值DCR'],
    })
  }

  return workbook
}

export async function serializeReportWorkbook(params: ReportArtifactParams) {
  const workbook = buildReportWorkbook(params)
  const buffer = await workbook.xlsx.writeBuffer()
  if (buffer instanceof Uint8Array) {
    return buffer
  }
  return new Uint8Array(buffer)
}
