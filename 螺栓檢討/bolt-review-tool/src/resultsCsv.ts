import type { CheckResult, UnitPreferences } from './domain'
import { statusLabel } from './resultDisplayHelpers'
import { convertResultValue, getResultValueUnit } from './resultUnits'

/**
 * 明細 CSV：數值依使用者單位換算，欄位與 XLSX「檢核結果」表一致
 * （需求值 / 設計值 / 名義值 + 單位欄；reportWorkbook buildResultRows）；數值取 4 位小數。
 */
export const RESULTS_CSV_HEADER = [
  '檢核模式',
  '條文',
  '需求值',
  '設計值',
  '名義值',
  '單位',
  'DCR',
  '狀態',
  '正式性',
  '說明',
] as const

function escapeCsvCell(cell: string | number) {
  const text = String(cell ?? '')
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

/** CSV 無儲存格格式，換算後取 4 位小數，避免 tf / kgf 換算出現冗長浮點尾數 */
function csvValue(result: CheckResult, value: number, units: UnitPreferences) {
  const converted = convertResultValue(result, value, units)
  return typeof converted === 'number' ? Number(converted.toFixed(4)) : converted
}

export function buildResultsCsv(rows: CheckResult[], units: UnitPreferences) {
  const body = rows.map((r) => [
    r.mode,
    `${r.citation.clause} ${r.citation.title}`,
    csvValue(r, r.demandKn, units),
    csvValue(r, r.designStrengthKn, units),
    csvValue(r, r.nominalStrengthKn, units),
    getResultValueUnit(r, units).symbol,
    Number.isFinite(r.dcr) ? r.dcr : '',
    statusLabel(r.status),
    r.formal ? '正式' : '初篩/補資料',
    r.note ?? '',
  ])
  return [[...RESULTS_CSV_HEADER], ...body]
    .map((line) => line.map(escapeCsvCell).join(','))
    .join('\r\n')
}
