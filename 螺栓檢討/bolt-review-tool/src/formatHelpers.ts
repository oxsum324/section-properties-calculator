/**
 * 共用格式化工具：將 App.tsx 中分散的 formatNumber / formatQuantity /
 * getGoverningDcr 抽出為獨立模組，供拆分後的子元件（SensitivityPanel /
 * FormulaReferencePanel / 等）直接 import，不必透過 props 傳遞。
 *
 * 後續 P4「同盤工具共用模組」第一波候選之一；可移至 monorepo shared 套件。
 */
import type { ProjectAuditSource, UnitPreferences } from './domain'
import {
  getUnitSymbol,
  toDisplayValue,
  type QuantityKind,
} from './units'

const numberFormatter = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 2,
})

/** 通用數值格式化：非有限值回傳「—」；其餘以 zh-TW + 最多 2 位小數呈現。 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '—'
  }
  return numberFormatter.format(value)
}

/** 把內部單位（mm / kN / MPa）轉成使用者偏好顯示單位 + 單位符號。 */
export function formatQuantity(
  value: number,
  quantity: QuantityKind,
  units: UnitPreferences,
): string {
  if (!Number.isFinite(value)) {
    return '—'
  }
  return `${formatNumber(toDisplayValue(value, quantity, units))} ${getUnitSymbol(quantity, units)}`
}

/**
 * 取得控制 DCR（governingDcr 優先；無則退回 maxDcr）。
 * 不同於 maxDcr，governingDcr 跟隨 severity 排序，較貼近工程意義。
 */
export function getGoverningDcr(summary: {
  governingDcr?: number
  maxDcr: number
}): number {
  return summary.governingDcr ?? summary.maxDcr
}

/**
 * 將 ISO 字串格式化為 zh-TW 在地化日期時間（YYYY/MM/DD HH:mm）。
 * 無效輸入回傳「—」；無法解析則原字串回傳。
 */
export function formatDateTime(value?: string): string {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 留痕來源代碼 → 顯示文字（手動 / 預覽 / 列印 / HTML / XLSX / DOCX）。 */
export function auditSourceLabel(source: ProjectAuditSource): string {
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
      return source
  }
}

/** 檔案大小友善顯示：B / KB / MB */
export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }
  if (sizeBytes < 1024 * 1024) {
    return `${formatNumber(sizeBytes / 1024)} KB`
  }
  return `${formatNumber(sizeBytes / (1024 * 1024))} MB`
}
