import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import {
  CURRENT_APP_BUILD_TIME,
  REPORT_SOURCE_TOOL,
  getCalcEngineVersionStatus,
} from './appMeta'
import { buildStandaloneGeometrySketchSvg } from './reportExport'
import type { ReportArtifactParams } from './reportExport'
import { buildReportDocumentState } from './reportDocumentState'
import { REPORT_TIMESTAMP_LABELS } from './reportTimestamps'
import {
  buildAuditRows,
  buildCandidateProductRows,
  buildDimensionRows,
  buildEvidenceRows,
  buildFactorRows,
  buildLayoutVariantRows,
  buildLoadCaseRows,
  buildResultRows,
  buildSummaryRows,
  type ReportTableRow,
} from './reportWorkbook'

/**
 * 將 SVG 字串轉為 PNG Uint8Array；瀏覽器環境使用。
 * 失敗（例如無 document / canvas）時回傳 null，呼叫端需優雅降級。
 */
async function svgToPngBytes(
  svg: string,
  targetWidth = 960,
  targetHeight = 720,
  timeoutMs = 2000,
): Promise<Uint8Array | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null
  }
  // jsdom 不支援 HTMLCanvasElement.toBlob；直接略過
  const probeCanvas =
    typeof document.createElement === 'function'
      ? document.createElement('canvas')
      : null
  if (
    !probeCanvas ||
    typeof (probeCanvas as HTMLCanvasElement).toBlob !== 'function' ||
    typeof (probeCanvas as HTMLCanvasElement).getContext !== 'function'
  ) {
    return null
  }
  return new Promise((resolve) => {
    let settled = false
    const settle = (value: Uint8Array | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    try {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const image = new Image()
      const cleanup = () => URL.revokeObjectURL(url)
      // 安全網：若 2 秒內 onload/onerror 都未觸發（例如 jsdom 或受限環境），放棄嵌入
      const timeoutHandle = setTimeout(() => {
        cleanup()
        settle(null)
      }, timeoutMs)
      const originalOnload = () => clearTimeout(timeoutHandle)
      image.onload = () => {
        originalOnload()
        try {
          const canvas = document.createElement('canvas')
          canvas.width = targetWidth
          canvas.height = targetHeight
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            cleanup()
            settle(null)
            return
          }
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, targetWidth, targetHeight)
          // 保持比例縮放 + 置中
          const ratio = Math.min(
            targetWidth / image.width,
            targetHeight / image.height,
          )
          const drawWidth = image.width * ratio
          const drawHeight = image.height * ratio
          const offsetX = (targetWidth - drawWidth) / 2
          const offsetY = (targetHeight - drawHeight) / 2
          ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)
          canvas.toBlob((pngBlob) => {
            cleanup()
            if (!pngBlob) {
              settle(null)
              return
            }
            pngBlob
              .arrayBuffer()
              .then((buf) => settle(new Uint8Array(buf)))
              .catch(() => settle(null))
          }, 'image/png')
        } catch (error) {
          console.warn('[reportDocx] SVG→PNG 繪製失敗', error)
          cleanup()
          settle(null)
        }
      }
      image.onerror = () => {
        originalOnload()
        console.warn('[reportDocx] SVG 載入失敗，略過圖片嵌入')
        cleanup()
        settle(null)
      }
      image.src = url
    } catch (error) {
      console.warn('[reportDocx] SVG→PNG 轉換異常', error)
      settle(null)
    }
  })
}

const docxColors = {
  brand: '0F5461',
  headerText: 'F7F5EF',
  border: 'CBD8D8',
  bodyBorder: 'D8E1E1',
  sectionFill: 'EAF4F3',
  dcrWarnFill: 'FBE8C8',
  dcrFailFill: 'F8D7D4',
  dcrFailText: '9C2B16',
  muted: '5D6D72',
} as const

function toCellText(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }
  return String(value)
}

function createParagraph(
  text: string,
  options?: {
    bold?: boolean
    color?: string
    heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]
    size?: number
    pageBreakBefore?: boolean
  },
) {
  return new Paragraph({
    heading: options?.heading,
    alignment: options?.alignment,
    pageBreakBefore: options?.pageBreakBefore,
    keepNext: Boolean(options?.heading),
    keepLines: Boolean(options?.heading),
    spacing: {
      after: 120,
    },
    children: [
      new TextRun({
        text,
        bold: options?.bold,
        color: options?.color,
        size: options?.size,
      }),
    ],
  })
}

function createTableCell(
  text: string,
  options?: {
    bold?: boolean
    color?: string
    fill?: string
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]
    widthPercent?: number
  },
) {
  return new TableCell({
    width: options?.widthPercent
      ? {
          size: options.widthPercent,
          type: WidthType.PERCENTAGE,
        }
      : undefined,
    margins: {
      top: 80,
      bottom: 80,
      left: 90,
      right: 90,
    },
    shading: options?.fill
      ? {
          fill: options.fill,
        }
      : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, color: docxColors.bodyBorder, size: 1 },
      bottom: {
        style: BorderStyle.SINGLE,
        color: docxColors.bodyBorder,
        size: 1,
      },
      left: { style: BorderStyle.SINGLE, color: docxColors.bodyBorder, size: 1 },
      right: {
        style: BorderStyle.SINGLE,
        color: docxColors.bodyBorder,
        size: 1,
      },
    },
    children: [
      new Paragraph({
        alignment: options?.alignment,
        keepLines: true,
        spacing: { after: 0 },
        children: [
          new TextRun({
            text,
            bold: options?.bold,
            color: options?.color,
            size: 20,
          }),
        ],
      }),
    ],
  })
}

function getDcrFill(value: string) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    return undefined
  }
  if (numericValue > 1) {
    return docxColors.dcrFailFill
  }
  if (numericValue >= 0.85) {
    return docxColors.dcrWarnFill
  }
  return undefined
}

function buildDataTable(
  rows: ReportTableRow[],
  options?: {
    highlightDcrHeaders?: string[]
    omittedHeaders?: string[]
  },
) {
  if (rows.length === 0) {
    return createParagraph('目前沒有可輸出的資料。', {
      color: docxColors.muted,
    })
  }

  const omittedHeaders = new Set(options?.omittedHeaders ?? [])
  const headers = Object.keys(rows[0]).filter((header) => !omittedHeaders.has(header))
  const dcrHeaders = new Set(options?.highlightDcrHeaders ?? [])

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((header) =>
          createTableCell(header, {
            bold: true,
            fill: docxColors.brand,
            color: docxColors.headerText,
            alignment: AlignmentType.CENTER,
          }),
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            cantSplit: true,
            children: headers.map((header) => {
              const text = toCellText(row[header])
              const fill = dcrHeaders.has(header) ? getDcrFill(text) : undefined
              const isFail = fill === docxColors.dcrFailFill
              return createTableCell(text, {
                fill,
                color: isFail ? docxColors.dcrFailText : undefined,
                bold: isFail,
              })
            }),
          }),
      ),
    ],
  })
}

function formatDocxDateTime(value?: string) {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-TW', { hour12: false })
}

function buildTimestampBlock(params: ReportArtifactParams): Table {
  const reportGeneratedAt =
    params.reportGeneratedAt ?? new Date().toISOString()
  const audit = params.auditEntry
  const auditSourceMap: Record<string, string> = {
    manual: '手動留痕',
    html: 'HTML 匯出',
    print: '列印',
    preview: '預覽',
    xlsx: 'XLSX 匯出',
    docx: 'DOCX 匯出',
  }
  const rows: Array<[string, string]> = [
    [
      REPORT_TIMESTAMP_LABELS.editedAt,
      formatDocxDateTime(params.review.project.updatedAt),
    ],
    [
      REPORT_TIMESTAMP_LABELS.generatedAt,
      formatDocxDateTime(reportGeneratedAt),
    ],
    [
      REPORT_TIMESTAMP_LABELS.auditedAt,
      audit ? formatDocxDateTime(audit.createdAt) : '尚未留存',
    ],
    [
      REPORT_TIMESTAMP_LABELS.auditSource,
      audit ? (auditSourceMap[audit.source] ?? audit.source) : '—',
    ],
    [
      REPORT_TIMESTAMP_LABELS.auditHash,
      audit
        ? `${audit.hash.slice(0, 12)}${audit.hash.length > 12 ? '…' : ''}`
        : '—',
    ],
  ]
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          cantSplit: true,
          children: [
            createTableCell(label, {
              bold: true,
              fill: docxColors.sectionFill,
              color: docxColors.brand,
            }),
            createTableCell(value, {}),
          ],
        }),
    ),
  })
}

function buildSummarySection(
  params: ReportArtifactParams,
  geometryPngBytes: Uint8Array | null,
) {
  const geometryParagraphs: Paragraph[] = []
  if (geometryPngBytes) {
    geometryParagraphs.push(
      createParagraph('配置預覽（含 1.5hef 投影 / 承壓接觸區 / 補強鋼筋覆蓋）', {
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            // docx 型別為 Buffer | Uint8Array；Uint8Array 直接可用
            data: geometryPngBytes,
            transformation: {
              width: 560,
              height: 420,
            },
            type: 'png',
          }),
        ],
      }),
      createParagraph(
        '圖示：紅 = 受拉、藍 = 受壓、灰 = 中性；青 = A_Nc、橘 = A_Vc、綠 = 錨栓補強鋼筋、紫 = A1/接觸承壓區。',
        { color: docxColors.muted, size: 18 },
      ),
    )
  }

  // 公司 LOGO（PNG/JPG dataURL → Uint8Array）；SVG 與其他格式略過
  const logoParagraphs: Paragraph[] = []
  const logoDataUrl = params.reportSettings.companyLogoDataUrl ?? ''
  if (logoDataUrl) {
    const match = logoDataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/i)
    if (match) {
      try {
        const binary = atob(match[2])
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i)
        }
        const imgType = match[1].toLowerCase().startsWith('jp') ? 'jpg' : 'png'
        logoParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: bytes,
                transformation: { width: 200, height: 100 },
                type: imgType as 'png' | 'jpg',
              }),
            ],
          }),
        )
      } catch (error) {
        console.warn('[reportDocx] LOGO 解碼失敗，略過：', error)
      }
    }
  }

  return [
    ...logoParagraphs,
    createParagraph(params.review.project.name, {
      bold: true,
      size: 34,
      alignment: AlignmentType.CENTER,
    }),
    createParagraph('鋼筋混凝土錨栓檢討報告', {
      alignment: AlignmentType.CENTER,
      color: docxColors.muted,
      size: 24,
    }),
    createParagraph(
      [
        params.review.ruleProfile.versionLabel,
        params.reportSettings.companyName,
        params.reportSettings.projectCode,
      ].filter(Boolean).join(' / '),
      {
        alignment: AlignmentType.CENTER,
        color: docxColors.muted,
      },
    ),
    createParagraph('報告時間戳', {
      heading: HeadingLevel.HEADING_2,
    }),
    buildTimestampBlock(params),
    createParagraph('報告摘要', {
      heading: HeadingLevel.HEADING_1,
    }),
    buildDataTable(buildSummaryRows(params)),
    ...geometryParagraphs,
  ]
}

function buildSection(
  title: string,
  rows: ReportTableRow[],
  options?: {
    highlightDcrHeaders?: string[]
    omittedHeaders?: string[]
    pageBreakBefore?: boolean
  },
) {
  return [
    createParagraph(title, {
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: options?.pageBreakBefore,
    }),
    buildDataTable(rows, {
      highlightDcrHeaders: options?.highlightDcrHeaders,
      omittedHeaders: options?.omittedHeaders,
    }),
  ]
}

function buildResultNotes(rows: ReportTableRow[]) {
  const noteRows = rows
    .filter((row) => String(row.說明 ?? '').trim())
    .map((row) => ({
      檢核項目: [row.組合, row.檢核模式].filter(Boolean).join('｜'),
      計算說明: row.說明,
    }))
  if (noteRows.length === 0) return []
  return [
    createParagraph('逐項檢核說明', { heading: HeadingLevel.HEADING_2 }),
    buildDataTable(noteRows),
  ]
}

/**
 * 「使用邊界與版本」終章：保留 calc engine 版本、build 時間與版本一致性狀態，
 * 供附件追溯；通用流程警語與責任宣告留在 HTML 畫面，不寫入計算附件。
 */
function buildVersionAndDisclaimerSection(params: ReportArtifactParams) {
  const status = getCalcEngineVersionStatus(
    params.review.project.calcEngineVersion,
  )
  const versionRows: Array<[string, string]> = [
    ['產出工具', REPORT_SOURCE_TOOL],
    ['工具版本', status.runtimeVersion],
    ['輸出時間', formatDocxDateTime(params.reportGeneratedAt ?? new Date().toISOString())],
    [
      '計算指紋',
      params.auditEntry?.hash
        ? `CF-${params.auditEntry.hash.slice(0, 16).toUpperCase()}`
        : '—',
    ],
    ['本案計算版本', status.projectVersion],
    ['目前工具版本（runtime）', status.runtimeVersion],
    [
      '版本一致性',
      status.mismatch
        ? '⚠ 不一致：本案先前以另一版本計算；如需確認請按主畫面「升級至目前版本」並重新留痕'
        : '✓ 一致：本案計算版本與目前工具相同',
    ],
    ['工具 build 時間', formatDocxDateTime(CURRENT_APP_BUILD_TIME)],
    [
      '規範版本',
      `${params.review.ruleProfile.chapter17Title}（${params.review.ruleProfile.versionLabel}）`,
    ],
  ]
  return [
    createParagraph('文件追溯與版本', {
      heading: HeadingLevel.HEADING_1,
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: versionRows.map(
        ([label, value]) =>
          new TableRow({
            cantSplit: true,
            children: [
              createTableCell(label, {
                bold: true,
                fill: docxColors.sectionFill,
                color: docxColors.brand,
              }),
              createTableCell(value, {}),
            ],
          }),
      ),
    }),
  ]
}

export function buildReportDocument(
  params: ReportArtifactParams,
  geometryPngBytes: Uint8Array | null = null,
) {
  const documentState = buildReportDocumentState({
    batchReview: params.batchReview,
    review: params.review,
    completeness: params.completeness,
    reportSettings: params.reportSettings,
  })
  const loadCaseRows = buildLoadCaseRows(params)
  const resultRows = buildResultRows(params)
  const dimensionRows = buildDimensionRows(params)
  const factorRows = buildFactorRows(params)
  const candidateRows = buildCandidateProductRows(params)
  const layoutRows = buildLayoutVariantRows(params)
  const evidenceRows = buildEvidenceRows(params)
  const auditRows = buildAuditRows(params)

  const portraitOpeningChildren = [
    ...buildSummarySection(params, geometryPngBytes),
    ...buildSection('載重組合批次檢核', loadCaseRows, {
      highlightDcrHeaders: ['控制DCR', '最大數值DCR'],
    }),
  ]
  const landscapeDetailChildren = [
    ...buildSection('逐項檢核明細', resultRows, {
      highlightDcrHeaders: ['DCR', 'DCR重算'],
      omittedHeaders: ['DCR重算', '說明'],
    }),
    ...buildResultNotes(resultRows),
    ...buildSection('尺寸檢核', dimensionRows),
    ...buildSection('φ / ψ 與因子總表', factorRows),
  ]
  const documentStatusLine = [
    `文件狀態：${documentState.label}`,
    documentState.reason,
    params.auditEntry?.hash
      ? `計算指紋：CF-${params.auditEntry.hash.slice(0, 16).toUpperCase()}`
      : '',
  ].filter(Boolean).join('｜')

  const portraitClosingChildren = [
    ...buildSection('候選產品比選', candidateRows, {
      highlightDcrHeaders: ['控制DCR', '最大數值DCR'],
    }),
    ...buildSection('候選配置比選', layoutRows, {
      highlightDcrHeaders: ['控制DCR'],
    }),
    ...buildSection('產品證據與文件對照', evidenceRows),
    ...buildSection('審查留痕', auditRows, {
      highlightDcrHeaders: ['控制DCR', '最大數值DCR'],
    }),
    // 文件追溯與版本：固定置於文件最末，保留正式附件來源與版本驗證依據
    ...buildVersionAndDisclaimerSection(params),
  ]

  const pageMargin = { top: 720, right: 720, bottom: 720, left: 720 }

  return new Document({
    creator: 'bolt-review-tool',
    title: `${params.review.project.name} 錨栓檢討報告`,
    description: `鋼筋混凝土錨栓檢討 Word 匯出報告；文件狀態：${documentState.label}`,
    sections: [
      {
        properties: { page: { margin: pageMargin } },
        children: portraitOpeningChildren,
      },
      {
        properties: {
          page: {
            margin: pageMargin,
            size: { orientation: PageOrientation.LANDSCAPE },
          },
        },
        children: landscapeDetailChildren,
      },
      {
        properties: { page: { margin: pageMargin } },
        footers: {
          default: new Footer({
            children: [
              createParagraph(documentStatusLine, {
                alignment: AlignmentType.RIGHT,
                color: docxColors.muted,
                size: 18,
              }),
            ],
          }),
        },
        children: portraitClosingChildren,
      },
    ],
  })
}

export async function serializeReportDocument(params: ReportArtifactParams) {
  // 嘗試將幾何 SVG 轉為 PNG 以嵌入 Word；若環境不支援 canvas/Image 則略過
  let geometryPngBytes: Uint8Array | null = null
  try {
    const svg = buildStandaloneGeometrySketchSvg(
      params.review,
      params.unitPreferences,
    )
    geometryPngBytes = await svgToPngBytes(svg)
  } catch (error) {
    console.warn('[reportDocx] 幾何圖嵌入失敗，僅輸出表格版', error)
  }
  const document = buildReportDocument(params, geometryPngBytes)
  const buffer = await Packer.toBuffer(document)
  return new Uint8Array(buffer)
}
