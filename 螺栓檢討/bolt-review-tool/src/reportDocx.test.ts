import { describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import { inflateRawSync } from 'node:zlib'
import {
  assessProductCompleteness,
  evaluateCandidateProducts,
  evaluateLayoutVariants,
  evaluateProjectBatch,
} from './calc'
import {
  defaultProducts,
  defaultProject,
  normalizeReportSettings,
} from './defaults'
import { getEvaluationFieldStates } from './evaluationCatalog'
import { serializeReportDocument } from './reportDocx'
import { normalizeUnitPreferences } from './units'

const PAGE_ONLY_REPORT_STATUS_NEEDLES = [
  '產報前檢查',
  '附件適用狀態',
  '優先建議報告閱讀狀態',
  '優先閱讀',
  '報告閱讀狀態',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
  '頁面顯示，不進計算書、列印或 PDF',
]

function buildParams() {
  const product = defaultProducts.find(
    (item) => item.id === defaultProject.selectedProductId,
  )
  expect(product).toBeDefined()

  const project = {
    ...defaultProject,
    candidateLayoutVariants: [
      {
        id: 'layout-wide',
        name: '加大邊距方案',
        layout: {
          ...defaultProject.layout,
          edgeLeftMm: 160,
          edgeRightMm: 160,
          edgeBottomMm: 160,
          edgeTopMm: 160,
        },
        updatedAt: new Date().toISOString(),
      },
    ],
  }
  const batchReview = evaluateProjectBatch(project, product!)

  return {
    batchReview,
    candidateProductReviews: evaluateCandidateProducts(project, [product!]),
    layoutVariantReviews: evaluateLayoutVariants(
      project,
      product!,
      project.candidateLayoutVariants ?? [],
    ),
    review: batchReview.activeReview,
    selectedProduct: product!,
    completeness: assessProductCompleteness(product!),
    evaluationFieldStates: getEvaluationFieldStates(product!),
    unitPreferences: normalizeUnitPreferences(project.ui),
    reportSettings: normalizeReportSettings(project.report),
  }
}

function readZipEntry(buffer: Uint8Array, entryName: string) {
  const zip = Buffer.from(buffer)
  let eocdOffset = -1
  for (let offset = zip.length - 22; offset >= 0; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset
      break
    }
  }
  if (eocdOffset === -1) {
    throw new Error('DOCX end-of-central-directory not found')
  }

  const entryCount = zip.readUInt16LE(eocdOffset + 10)
  let centralOffset = zip.readUInt32LE(eocdOffset + 16)
  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error('DOCX central-directory entry is invalid')
    }

    const compressionMethod = zip.readUInt16LE(centralOffset + 10)
    const compressedSize = zip.readUInt32LE(centralOffset + 20)
    const fileNameLength = zip.readUInt16LE(centralOffset + 28)
    const extraLength = zip.readUInt16LE(centralOffset + 30)
    const commentLength = zip.readUInt16LE(centralOffset + 32)
    const localHeaderOffset = zip.readUInt32LE(centralOffset + 42)
    const nameStart = centralOffset + 46
    const name = zip.toString('utf8', nameStart, nameStart + fileNameLength)

    if (name === entryName) {
      if (zip.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error(`DOCX local header is invalid: ${entryName}`)
      }
      const localNameLength = zip.readUInt16LE(localHeaderOffset + 26)
      const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28)
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
      const compressed = zip.subarray(dataStart, dataStart + compressedSize)
      if (compressionMethod === 0) {
        return compressed.toString('utf8')
      }
      if (compressionMethod === 8) {
        return inflateRawSync(compressed).toString('utf8')
      }
      throw new Error(`Unsupported DOCX compression method: ${compressionMethod}`)
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength
  }

  throw new Error(`DOCX entry not found: ${entryName}`)
}

function docxVisibleText(buffer: Uint8Array) {
  return readZipEntry(buffer, 'word/document.xml')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function readDocxStructure(buffer: Uint8Array) {
  const documentXml = readZipEntry(buffer, 'word/document.xml')
  const visibleText = documentXml
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

  return {
    documentXml,
    visibleText,
    paragraphCount: documentXml.match(/<w:p(?:\s|>)/g)?.length ?? 0,
    tableCount: documentXml.match(/<w:tbl(?:\s|>)/g)?.length ?? 0,
    tableRowCount: documentXml.match(/<w:tr(?:\s|>)/g)?.length ?? 0,
    pageBreakCount:
      documentXml.match(/w:pageBreakBefore|<w:br[^>]+w:type="page"/g)
        ?.length ?? 0,
  }
}

describe('reportDocx', () => {
  it('serializes a valid docx buffer', async () => {
    const buffer = await serializeReportDocument(buildParams())

    expect(buffer.byteLength).toBeGreaterThan(4_000)
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)
    expect(buffer[2]).toBe(0x03)
    expect(buffer[3]).toBe(0x04)

    const visibleText = docxVisibleText(buffer)
    for (const needle of PAGE_ONLY_REPORT_STATUS_NEEDLES) {
      expect(visibleText).not.toContain(needle)
    }
  })

  it('serializes substantial report structure into the docx body', async () => {
    const structure = readDocxStructure(await serializeReportDocument(buildParams()))
    const sectionTitles = [
      '報告摘要',
      '載重組合批次檢核',
      '逐項檢核明細',
      '尺寸檢核',
      'φ / ψ 與因子總表',
      '候選產品比選',
      '候選配置比選',
      '產品證據與文件對照',
      '審查留痕',
      '使用邊界與版本',
    ]

    expect(structure.visibleText.length).toBeGreaterThan(3_000)
    expect(structure.paragraphCount).toBeGreaterThanOrEqual(35)
    expect(structure.tableCount).toBeGreaterThanOrEqual(9)
    expect(structure.tableRowCount).toBeGreaterThanOrEqual(30)
    expect(structure.pageBreakCount).toBeGreaterThanOrEqual(6)
    for (const title of sectionTitles) {
      expect(structure.visibleText).toContain(title)
    }
  })
})
