import type { CheckResult, UnitPreferences } from './domain'
import { getUnitSymbol, toDisplayValue } from './units'

/**
 * 檢核結果數值的單位與換算；XLSX（reportWorkbook）與明細 CSV（resultsCsv）共用，
 * 讓兩種匯出依同一套使用者單位輸出。從 reportWorkbook 抽出，避免 CSV 載入 ExcelJS。
 */
export function getResultValueUnit(
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

/**
 * 把 CheckResult 的內部數值（mm / kN / MPa）依使用者單位轉成顯示單位的「原始數值」。
 * 回傳 number（無法解析 finite 時回 ''），供 ExcelJS 寫入 raw cell；
 * 顯示位數靠 cell.numFmt 控制，避免依賴格式化字串供公式重算。
 */
export function convertResultValue(
  result: CheckResult,
  value: number,
  units: UnitPreferences,
): number | string {
  if (!Number.isFinite(value)) {
    return ''
  }
  const presentation = getResultValueUnit(result, units)
  if (presentation.quantity === 'ratio') {
    return value
  }
  return toDisplayValue(
    value,
    presentation.quantity === 'force'
      ? 'force'
      : presentation.quantity === 'stress'
        ? 'stress'
        : 'length',
    units,
  )
}
