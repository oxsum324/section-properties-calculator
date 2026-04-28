/**
 * 結果展示純函式（P4 跨工具共用，無 JSX）。
 *
 * 拆出純函式以滿足 react-refresh 「同檔只能匯出元件」規則；
 * 視覺元件 Badge / DimensionRow 在 ./resultDisplay.tsx，
 * 兩者都依賴本檔的 statusLabel / sectionCitation 等。
 */
import type {
  CheckResult,
  DimensionCheck,
  ReviewStatus,
  UnitPreferences,
} from './domain'
import { formatNumber, formatQuantity } from './formatHelpers'

/** 中文化的 ReviewStatus 標籤。 */
export function statusLabel(status: ReviewStatus): string {
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

/** 條文顯示：「條號 + 標題」一行表示。 */
export function sectionCitation(label: string, clause: string): string {
  return `${clause} ${label}`
}

/** 依 result.presentation 把數值轉為帶單位的顯示文字（ratio 不帶單位）。 */
export function formatResultValue(
  result: CheckResult,
  value: number,
  units: UnitPreferences,
): string {
  if (result.presentation === 'ratio') {
    return formatNumber(value)
  }
  if (result.presentation === 'stress') {
    return formatQuantity(value, 'stress', units)
  }
  if (result.presentation === 'length') {
    return formatQuantity(value, 'length', units)
  }
  return formatQuantity(value, 'force', units)
}

/** 因子列攤平：「symbol=value（label；note）」分號串接；無資料回「—」。 */
export function formatResultFactorList(result: CheckResult): string {
  if (!result.factors || result.factors.length === 0) {
    return '—'
  }
  return result.factors
    .map((item) =>
      item.note
        ? `${item.symbol}=${item.value}（${item.label}；${item.note}）`
        : `${item.symbol}=${item.value}（${item.label}）`,
    )
    .join('；')
}

/** 最小尺寸檢核資料來源標籤。 */
export function dimensionSourceLabel(source: DimensionCheck['source']): string {
  if (source === 'product') {
    return '產品值'
  }
  if (source === 'code_fallback') {
    return '規範退回值'
  }
  return '規範值'
}
