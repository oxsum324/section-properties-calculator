/**
 * 結果展示視覺元件：Badge / DimensionRow。
 *
 * 純函式（statusLabel / sectionCitation / formatResultValue 等）在 ./resultDisplayHelpers，
 * 拆檔以滿足 react-refresh 「同檔只能匯出元件」的規則。
 */
import type {
  DimensionCheck,
  ReviewStatus,
  UnitPreferences,
} from './domain'
import { formatQuantity } from './formatHelpers'
import {
  dimensionSourceLabel,
  sectionCitation,
  statusLabel,
} from './resultDisplayHelpers'

/** 顏色化判定 pill；CSS 由 .badge.badge-${status} 控制。 */
export function Badge({ status }: { status: ReviewStatus }) {
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>
}

/** 最小尺寸檢核標準列：用於 17.7 / 17.10 等需要「實際 vs 需求」對照的表格。 */
export function DimensionRow({
  check,
  units,
}: {
  check: DimensionCheck
  units: UnitPreferences
}) {
  return (
    <tr>
      <td>{check.label}</td>
      <td>{formatQuantity(check.actualMm, 'length', units)}</td>
      <td>{formatQuantity(check.requiredMm, 'length', units)}</td>
      <td>{dimensionSourceLabel(check.source)}</td>
      <td>{sectionCitation(check.citation.title, check.citation.clause)}</td>
      <td>
        <Badge status={check.status} />
      </td>
    </tr>
  )
}
