import type { UnitPreferences } from './domain'
import {
  formatInputQuantity,
  fromDisplayValue,
  getInputStep,
  getUnitSymbol,
  type QuantityKind,
} from './units'

/**
 * 帶單位的數字輸入欄位：顯示單位由使用者偏好控制（mm/cm/m、kN/kgf/tf 等），
 * 內部值固定以 SI（mm / kN / MPa）儲存；可選 warning 文字會顯示於欄位下方。
 *
 * 從 App.tsx 抽出（P4 跨工具共用第一波）；本元件用於所有 N / V / M / hef / 邊距等輸入。
 */
export function UnitNumberField(props: {
  label: string
  quantity: QuantityKind
  units: UnitPreferences
  value?: number
  onValueChange?: (value: number | undefined) => void
  optional?: boolean
  disabled?: boolean
  min?: number
  fallback?: number
  /** 可選的輸入警告；非 null 時以黃底小字顯示於輸入框下方，不攔截輸入。 */
  warning?: string | null
}) {
  const {
    label,
    quantity,
    units,
    value,
    onValueChange,
    optional = false,
    disabled = false,
    min,
    fallback = 0,
    warning = null,
  } = props

  const unitSymbol = getUnitSymbol(quantity, units)

  return (
    <label
      title={`${label}（單位：${unitSymbol}；可於頂部切換）`}
      className={warning ? 'field-has-warning' : undefined}
    >
      <span className="label-row">
        <span>{label}</span>
        <span className="unit-chip">{unitSymbol}</span>
      </span>
      <input
        type="number"
        step={getInputStep(quantity, units)}
        min={min}
        disabled={disabled}
        value={
          optional
            ? formatInputQuantity(value, quantity, units)
            : formatInputQuantity(value ?? fallback, quantity, units)
        }
        onChange={(event) => {
          if (!onValueChange) {
            return
          }

          if (optional && event.target.value.trim() === '') {
            onValueChange(undefined)
            return
          }

          const parsed = Number(event.target.value)
          if (!Number.isFinite(parsed)) {
            onValueChange(optional ? undefined : fallback)
            return
          }

          onValueChange(fromDisplayValue(parsed, quantity, units))
        }}
      />
      {warning ? (
        <span className="field-warning" role="status">
          {warning}
        </span>
      ) : null}
    </label>
  )
}
