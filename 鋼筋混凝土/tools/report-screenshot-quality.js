const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const zlib = require('zlib');
const { validatePdfFile } = require('../../結構工具箱/tools/rendered-delivery-evidence');

const PAGE_ONLY_REPORT_STATUS_NEEDLES = [
  '產報前檢查',
  '附件適用狀態',
  '優先建議報告閱讀狀態',
  '優先閱讀',
  '報告閱讀狀態',
  '可作附件',
  '可作附件，需人工複核',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
  '頁面顯示，不進計算書、列印或 PDF',
  '輸入模式',
  '計算書模式',
  '換算對照',
  '流程顯示',
  '報表模式',
  '輸出設定',
];

function paethPredictor(left, up, upperLeft) {
  const p = left + up - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upperLeft;
}

function readPngVisualQuality(file) {
  const buffer = fs.readFileSync(file);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, signature.length).equals(signature)) {
    throw new Error(`not a PNG file: ${path.basename(file)}`);
  }

  let offset = signature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  const channelsByColorType = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const channels = channelsByColorType[colorType];
  if (bitDepth !== 8 || !channels || !width || !height || idat.length === 0) {
    throw new Error(`unsupported PNG format: ${width}x${height}, bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = Buffer.alloc(height * stride);
  let sourceOffset = 0;
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = rows.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x] || 0;
      const upperLeft = x >= channels ? previous[x - channels] || 0 : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paethPredictor(left, up, upperLeft);
      else throw new Error(`unsupported PNG filter: ${filter}`);
      row[x] = value & 0xff;
    }
    sourceOffset += stride;
    previous = Buffer.from(row);
  }

  let nonWhitePixelCount = 0;
  const colors = new Set();
  for (let offset = 0; offset < rows.length; offset += channels) {
    const r = rows[offset];
    const g = colorType === 0 ? r : rows[offset + 1];
    const b = colorType === 0 ? r : rows[offset + 2];
    const a = colorType === 4 ? rows[offset + 1] : colorType === 6 ? rows[offset + 3] : 255;
    if (a > 16 && (r < 245 || g < 245 || b < 245)) nonWhitePixelCount += 1;
    if (colors.size < 512) colors.add(`${r >> 4},${g >> 4},${b >> 4},${a > 127 ? 1 : 0}`);
  }

  return {
    width,
    height,
    bitDepth,
    colorType,
    nonWhitePixelCount,
    uniqueColorCount: colors.size,
  };
}

function defaultAssert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

function assertReportScreenshotQuality(file, title, options = {}) {
  const assertFn = options.assert || defaultAssert;
  let stats = null;
  try {
    stats = readPngVisualQuality(file);
  } catch (err) {
    assertFn(false, `${title} PNG visual quality`, err.message);
    return null;
  }

  const minWidth = options.minWidth || 900;
  const minHeight = options.minHeight || 1000;
  const minNonWhitePixels = options.minNonWhitePixels || 5000;
  const minUniqueColors = options.minUniqueColors || 8;
  assertFn(stats.width >= minWidth, `${title} screenshot width`, `${stats.width}px >= ${minWidth}px`);
  assertFn(stats.height >= minHeight, `${title} screenshot height`, `${stats.height}px >= ${minHeight}px`);
  assertFn(stats.nonWhitePixelCount >= minNonWhitePixels, `${title} screenshot non-white pixels`, `${stats.nonWhitePixelCount} >= ${minNonWhitePixels}`);
  assertFn(stats.uniqueColorCount >= minUniqueColors, `${title} screenshot color diversity`, `${stats.uniqueColorCount} >= ${minUniqueColors}`);
  return stats;
}

function readPdfTextWithPython(file) {
  const script = `
import json
import sys
from pathlib import Path
from pypdf import PdfReader

pdf_path = Path(sys.argv[1])
reader = PdfReader(str(pdf_path))
text = "\\n".join(page.extract_text() or "" for page in reader.pages)
print(json.dumps({
    "pages": len(reader.pages),
    "textLength": len(text),
    "text": text,
}, ensure_ascii=False))
`;
  const result = spawnSync('python', ['-c', script, file], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `python exit ${result.status}`).trim());
  }
  return JSON.parse(result.stdout);
}

function readPdfTextWithPoppler(file) {
  const pageStats = readPdfTextWithPython(file);
  const result = spawnSync('pdftotext', ['-layout', file, '-'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `pdftotext exit ${result.status}`).trim());
  }
  const text = result.stdout || '';
  return {
    pages: pageStats.pages,
    textLength: text.length,
    text,
  };
}

function assertReportPdfTextQuality(file, title, options = {}) {
  const assertFn = options.assert || defaultAssert;
  let stats = null;
  try {
    stats = readPdfTextWithPython(file);
  } catch (err) {
    assertFn(false, `${title} PDF text extraction`, err.message);
    return null;
  }

  const minPages = options.minPages || 2;
  const minTextLength = options.minTextLength || 800;
  const requiredText = options.include || options.requiredText || [];
  const includeAny = options.includeAny || [];
  const forbiddenText = [
    ...PAGE_ONLY_REPORT_STATUS_NEEDLES,
    ...(options.exclude || options.forbiddenText || []),
  ];

  assertFn(stats.pages >= minPages, `${title} PDF page count`, `${stats.pages} >= ${minPages}`);
  assertFn(stats.textLength >= minTextLength, `${title} PDF extracted text length`, `${stats.textLength} >= ${minTextLength}`);
  for (const needle of requiredText) {
    assertFn(stats.text.includes(needle), `${title} PDF includes`, needle);
  }
  for (const group of includeAny) {
    const candidates = Array.isArray(group) ? group : [group];
    assertFn(
      candidates.some(needle => stats.text.includes(needle)),
      `${title} PDF includes one of`,
      candidates.join(' || ')
    );
  }
  for (const needle of forbiddenText) {
    assertFn(!stats.text.includes(needle), `${title} PDF excludes page-only status`, needle);
  }

  let renderedStats = null;
  try {
    renderedStats = validatePdfFile(file, {
      label: title,
      minTextLength,
      projectNeedle: '__skip_project_order__',
      forbiddenNeedles: options.exclude || options.forbiddenText || [],
    });
  } catch (err) {
    assertFn(false, `${title} PDF rendered pagination quality`, err.message);
  }

  return {
    pages: stats.pages,
    textLength: stats.textLength,
    renderedPagination: renderedStats,
  };
}

module.exports = {
  assertReportPdfTextQuality,
  assertReportScreenshotQuality,
  readPdfTextWithPoppler,
  readPdfTextWithPython,
  readPngVisualQuality,
  PAGE_ONLY_REPORT_STATUS_NEEDLES,
};
