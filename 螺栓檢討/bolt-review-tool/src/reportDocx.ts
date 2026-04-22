import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { buildStandaloneGeometrySketchSvg } from './reportExport'
import type { ReportArtifactParams } from './reportExport'
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

  return [
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
      `${params.review.ruleProfile.versionLabel} / ${params.reportSettings.companyName || '未填公司'} / ${params.reportSettings.projectCode || '未填案號'}`,
      {
        alignment: AlignmentType.CENTER,
        color: docxColors.muted,
      },
    ),
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

export function buildReportDocument(
  params: ReportArtifactParams,
  geometryPngBytes: Uint8Array | null = null,
) {
  const loadCaseRows = buildLoadCaseRows(params)
  const resultRows = buildResultRows(params)
  const dimensionRows = buildDimensionRows(params)
  const factorRows = buildFactorRows(params)
  const candidateRows = buildCandidateProductRows(params)
  const layoutRows = buildLayoutVariantRows(params)
  const evidenceRows = buildEvidenceRows(params)
  const auditRows = buildAuditRows(params)

  const children = [
    ...buildSummarySection(params, geometryPngBytes),
    ...buildSection('載重組合批次檢核', loadCaseRows, {
      highlightDcrHeaders: ['控制DCR', '最大數值DCR'],
      pageBreakBefore: true,
    }),
    ...buildSection('逐項檢核明細', resultRows, {
      highlightDcrHeaders: ['DCR', 'DCR重算'],
      omittedHeaders: ['DCR重算'],
      pageBreakBefore: true,
    }),
    ...buildSection('尺寸檢核', dimensionRows, {
      pageBreakBefore: true,
    }),
    ...buildSection('φ / ψ 與因子總表', factorRows, {
      pageBreakBefore: true,
    }),
    ...buildSection('候選產品比選', candidateRows, {
      highlightDcrHeaders: ['控制DCR', '最大數值DCR'],
      pageBreakBefore: true,
    }),
    ...buildSection('候選配置比選', layoutRows, {
      highlightDcrHeaders: ['控制DCR'],
      pageBreakBefore: true,
    }),
    ...buildSection('產品證據與文件對照', evidenceRows, {
      pageBreakBefore: true,
    }),
    ...buildSection('審查留痕', auditRows, {
      highlightDcrHeaders: ['控制DCR', '最大數值DCR'],
      pageBreakBefore: true,
    }),
  ]

  return new Document({
    creator: 'bolt-review-tool',
    title: `${params.review.project.name} 錨栓檢討報告`,
    description: '鋼筋混凝土錨栓檢討 Word 匯出報告',
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children,
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
