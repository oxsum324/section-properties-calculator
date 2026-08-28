import {
  CURRENT_CALC_ENGINE_VERSION,
  PUBLIC_TOOL_VERSION,
  REPORT_SOURCE_TOOL,
} from './appMeta'
import type { ReportDocumentState } from './reportDocumentState'

export const REPORT_TEXT_BOM = '\uFEFF'

export interface GovernedReportTextParams {
  html: string
  documentState: ReportDocumentState
  reportGeneratedAt: string
  auditHash?: string
}

export interface GovernedReportTextArtifact {
  text: string
  bodyText: string
  contentSha256: string
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (token, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const codePoint = Number.parseInt(entity.slice(2), 16)
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : token
      }
      if (entity.startsWith('#')) {
        const codePoint = Number.parseInt(entity.slice(1), 10)
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : token
      }
      return named[entity.toLowerCase()] ?? token
    },
  )
}

/**
 * 由同一份正式 HTML 主文衍生可讀文字，不重新執行工程計算。
 * 圖形、樣式、封印腳本與操作控制不屬於 TXT 備查內容。
 */
export function extractReportPlainText(html: string): string {
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
  const mainMatch = (bodyMatch?.[1] ?? html).match(
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
  )
  let source = mainMatch?.[1] ?? bodyMatch?.[1] ?? html

  source = source
    .replace(/<(script|style|template|noscript|svg|canvas)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, '_$1')
    .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, '^$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(h1|h2|h3|h4|p|li|ul|ol|section|header|footer)>/gi, '\n')
    .replace(/<\/(th|td)>/gi, '\t')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/(div|article|main)>/gi, '\n')
    .replace(/<[^>]+>/g, '')

  const decoded = decodeHtmlEntities(source).replace(/\r\n?/g, '\n')
  const normalizedLines = decoded.split('\n').map((line) =>
    line
      .replace(/[ \f\v]+/g, ' ')
      .replace(/ *\t */g, ' | ')
      .replace(/(?: \| )+$/g, '')
      .trim(),
  )

  return normalizedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function sha256Text(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export async function buildGovernedReportText(
  params: GovernedReportTextParams,
): Promise<GovernedReportTextArtifact> {
  const bodyText = extractReportPlainText(params.html)
  if (bodyText.length < 1_000) {
    throw new Error('報告可讀文字不足，已停止產生 TXT 備查。')
  }

  const calculationFingerprint = params.auditHash
    ? `CF-${params.auditHash.slice(0, 16).toUpperCase()}`
    : '—'
  const sourceState = [
    params.documentState.label,
    params.documentState.reason,
    `計算指紋：${calculationFingerprint}`,
  ]
    .filter(Boolean)
    .join('｜')
  const baseText = [
    `${REPORT_SOURCE_TOOL}｜文字備查`,
    '文件類別：文字備查',
    '正式附件資格：否',
    '文件用途：文字備查版（不作為正式附件）',
    `來源文件狀態：${sourceState}`,
    `產出工具：${REPORT_SOURCE_TOOL}`,
    `工具版本：${PUBLIC_TOOL_VERSION}`,
    `計算引擎：${CURRENT_CALC_ENGINE_VERSION}`,
    `輸出時間：${params.reportGeneratedAt}`,
    `計算指紋：${calculationFingerprint}`,
    '文字版限制：不含可列印圖形、版面、核可控制與雙封印；正式附件請使用原 HTML、DOCX 或 XLSX。',
    '範圍邊界：本檔僅承接錨栓檢核報告內容，不代表完整基礎、樓板、底板或新舊混凝土介面設計。',
    '',
    '＝＝＝＝＝ 同源報告可讀文字 ＝＝＝＝＝',
    bodyText,
    '',
  ].join('\r\n')
  const contentSha256 = await sha256Text(baseText)
  return {
    bodyText,
    contentSha256,
    text: `${baseText}文字內容 SHA-256（非數位簽章）：${contentSha256}\r\n`,
  }
}
