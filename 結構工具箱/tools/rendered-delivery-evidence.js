const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  CALCULATION_BOOK_CONTENT_BOUNDARY,
  CONTENT_GROUPS,
  CONTENT_PROFILES,
  DEFAULT_FORBIDDEN,
  decodeText,
  evaluateCalculationContent,
} = require('./calculation-book-content-boundary.js');
const CANONICAL_RENDER_EVIDENCE_KIND = 'attachment-canonical-render-evidence.v1';


const DEFAULT_FOOTER_NEEDLES = [
  '版權所有 弘一工程顧問有限公司',
];

function safeName(value) {
  return String(value || 'artifact')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'artifact';
}

function normalizeLayoutLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function findPdfFooterOverlapLines(layoutText, footerNeedles = DEFAULT_FOOTER_NEEDLES) {
  const needles = [...new Set((footerNeedles || []).map(normalizeLayoutLine).filter(Boolean))];
  const overlaps = [];
  let footerLineCount = 0;
  String(layoutText || '').split(/\r?\n/).forEach((line, index) => {
    const normalized = normalizeLayoutLine(line);
    if (!normalized) return;
    for (const needle of needles) {
      const marker = needle.split(' ')[0];
      if (!normalized.includes(marker)) continue;
      footerLineCount += 1;
      if (normalized !== needle) {
        overlaps.push({ line: index + 1, footer: needle, text: normalized });
      }
      break;
    }
  });
  return { footerLineCount, overlaps };
}

function summarizePdfLayoutPages(layoutText, footerNeedles = DEFAULT_FOOTER_NEEDLES) {
  const footerLines = new Set((footerNeedles || []).map(normalizeLayoutLine).filter(Boolean));
  const rawPages = String(layoutText || '').split('\f');
  if (rawPages.length > 0 && !rawPages[rawPages.length - 1].trim()) rawPages.pop();
  return rawPages.map((pageText, index) => {
    const contentLines = pageText
      .split(/\r?\n/)
      .map(normalizeLayoutLine)
      .filter(line => line && !footerLines.has(line));
    return {
      page: index + 1,
      lines: contentLines.length,
      chars: contentLines.join('').length,
      preview: contentLines.slice(0, 3),
      ending: contentLines.slice(-3),
    };
  });
}

function looksLikeKeepWithNextHeading(line) {
  const normalized = normalizeLayoutLine(line);
  if (!normalized || normalized.length > 80 || /[=≥≤。；，,;]/.test(normalized)) return false;
  if (/^(?:強制|自動|人工)檢核$/.test(normalized)) return false;
  return /^[①-⑳]/.test(normalized)
    || /(?:檢核|摘要|說明|明細|計算|備註|輸入資料|結果)$/.test(normalized);
}

function findPdfOrphanPageEndHeadings(pageTextStats, keepWithNextLabels = []) {
  const labels = new Set((keepWithNextLabels || []).map(normalizeLayoutLine).filter(Boolean));
  const orphans = [];
  for (const page of (pageTextStats || []).slice(0, -1)) {
    const line = page.ending?.[page.ending.length - 1] || '';
    if (labels.has(line) || (labels.size === 0 && looksLikeKeepWithNextHeading(line))) {
      orphans.push({ page: page.page, heading: line });
    }
  }
  return orphans;
}

function looksLikeContinuationContext(line) {
  const normalized = normalizeLayoutLine(line);
  if (/^\d+(?:\.\d+)*[.、]\s*/.test(normalized)) return true;
  if (/^(?:板厚最小值檢核|溫度收縮筋檢核|撓曲檢核)/.test(normalized)) return true;
  if (!normalized || normalized.length > 120 || /[=≥≤；;]/.test(normalized)) return false;
  const headingCandidate = normalized.replace(/\s*[（(].*[）)]\s*[−-]?$/, '').trim();
  const tableHeaderTokens = ['項目', '採用值', '檢核項', '公式', '代入值', '數值', '單位', '結果', '判定', '說明', '需求', '容量', '符號', '規範'];
  const tableHeaderTokenCount = tableHeaderTokens.filter(token => normalized.includes(token)).length;
  return /^[①-⑳]/.test(normalized)
    || /^第\s*\d+(?:\.\d+)*\s*節/.test(normalized)
    || /^(?:P-M\s*互制曲線|面內撓曲|撓曲檢核|檢核對比|內力分析|設計建議|需求對比)/.test(normalized)
    || tableHeaderTokenCount >= 2
    || /(?:表|資料|條件|內容|明細|結果|備註|說明|檢核|計算|輸出|需求|材料|規範|規定|配筋|耐震|分析|分級|方法|設計|初估|細節|鋼筋|載重|延伸|抗滑|控制|矩陣|方案|圖|外力)$/.test(headingCandidate);
}

function findPdfUncontextualPageStarts(pageTextStats, continuationContextLabels = []) {
  const labels = [...new Set((continuationContextLabels || []).map(normalizeLayoutLine).filter(Boolean))];
  const issues = [];
  for (const page of (pageTextStats || []).slice(1)) {
    const preview = page.preview || [];
    const hasKnownLabel = line => labels.some(label => (
      line === label
      || (label.length >= 4 && line.startsWith(`${label} `))
      || (line.length >= 4 && label.startsWith(`${line} `))
    ));
    let line = preview[0] || '';
    const nextLine = preview[1] || '';
    if (line.length <= 2 && nextLine && (hasKnownLabel(nextLine) || looksLikeContinuationContext(nextLine))) {
      line = nextLine;
    }
    const hasKnownContext = hasKnownLabel(line);
    if (line && !hasKnownContext && !looksLikeContinuationContext(line)) {
      issues.push({ page: page.page, text: line });
    }
  }
  return issues;
}

function findSparseFinalPage(pageTextStats, pageMetrics, options = {}) {
  if (!Array.isArray(pageTextStats) || pageTextStats.length <= 1) return null;
  const minTextChars = options.minFinalPageTextChars ?? 100;
  const minInkRatio = options.minFinalPageInkRatio ?? 0.035;
  const text = pageTextStats[pageTextStats.length - 1];
  const visual = pageMetrics?.[pageMetrics.length - 1];
  if (!visual || text.chars >= minTextChars || visual.inkRatio >= minInkRatio) return null;
  return {
    page: text.page,
    chars: text.chars,
    lines: text.lines,
    inkRatio: visual.inkRatio,
    preview: text.preview,
    minTextChars,
    minInkRatio,
  };
}

function resolveEvidenceDir(repoRoot, family) {
  const base = process.env.PREFLIGHT_RUN_DIR
    ? path.resolve(process.env.PREFLIGHT_RUN_DIR, 'rendered-delivery-evidence')
    : path.resolve(repoRoot, 'output', 'rendered-delivery-evidence');
  return path.join(base, safeName(family));
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${label}: exit=${result.status}\n${result.stderr || result.stdout || ''}`);
  }
  return result.stdout || '';
}

function runWithRetries(command, args, label, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return run(command, args, label);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        // Windows antivirus/indexing can briefly retain a newly written PDF.
        // A bounded synchronous pause keeps delivery validation deterministic.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150 * attempt);
      }
    }
  }
  throw lastError;
}

function readPpmMetrics(filePath) {
  const buffer = fs.readFileSync(filePath);
  let offset = 0;
  const tokens = [];
  while (tokens.length < 4 && offset < buffer.length) {
    while (offset < buffer.length && /\s/.test(String.fromCharCode(buffer[offset]))) offset += 1;
    if (buffer[offset] === 0x23) {
      while (offset < buffer.length && buffer[offset] !== 0x0a) offset += 1;
      continue;
    }
    const start = offset;
    while (offset < buffer.length && !/\s/.test(String.fromCharCode(buffer[offset]))) offset += 1;
    tokens.push(buffer.subarray(start, offset).toString('ascii'));
  }
  assert.equal(tokens[0], 'P6', `${filePath} must be a binary PPM image`);
  const width = Number(tokens[1]);
  const height = Number(tokens[2]);
  const maxValue = Number(tokens[3]);
  assert.ok(width > 0 && height > 0 && maxValue === 255, `${filePath} has valid PPM dimensions`);
  while (offset < buffer.length && /\s/.test(String.fromCharCode(buffer[offset]))) offset += 1;
  const expectedBytes = width * height * 3;
  assert.ok(buffer.length - offset >= expectedBytes, `${filePath} contains complete RGB pixels`);

  let inkPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const byte = offset + pixel * 3;
    const r = buffer[byte];
    const g = buffer[byte + 1];
    const b = buffer[byte + 2];
    if (r < 245 || g < 245 || b < 245) {
      inkPixels += 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const inkRatio = inkPixels / (width * height);
  return {
    file: path.basename(filePath),
    width,
    height,
    inkPixels,
    inkRatio,
    bounds: inkPixels > 0 ? { minX, minY, maxX, maxY } : null,
  };
}

function validatePdfFile(pdfPath, options) {
  const info = run('pdfinfo', [pdfPath], `${options.label} pdfinfo`);
  const pageMatch = info.match(/^Pages:\s+(\d+)/m);
  const pageCount = Number(pageMatch?.[1] || 0);
  assert.ok(pageCount > 0, `${options.label} PDF has at least one page`);

  const textPath = pdfPath.replace(/\.pdf$/i, '.txt');
  runWithRetries('pdftotext', ['-layout', pdfPath, textPath], `${options.label} pdftotext`);
  const layoutText = fs.readFileSync(textPath, 'utf8');
  const text = decodeText(layoutText);
  assert.ok(text.length >= (options.minTextLength || 300), `${options.label} PDF has readable text: chars=${text.length}`);

  const footerLayout = findPdfFooterOverlapLines(
    layoutText,
    options.footerNeedles || DEFAULT_FOOTER_NEEDLES
  );
  const pageTextStats = summarizePdfLayoutPages(
    layoutText,
    options.footerNeedles || DEFAULT_FOOTER_NEEDLES
  );
  const orphanHeadings = findPdfOrphanPageEndHeadings(
    pageTextStats,
    options.keepWithNextLabels || []
  );
  const uncontextualPageStarts = findPdfUncontextualPageStarts(
    pageTextStats,
    options.continuationContextLabels || []
  );
  assert.deepEqual(
    footerLayout.overlaps,
    [],
    `${options.label} PDF footer does not overlap report content: ${JSON.stringify(footerLayout.overlaps)}`
  );
  assert.deepEqual(
    orphanHeadings,
    [],
    `${options.label} PDF keeps section headings with following content: ${JSON.stringify(orphanHeadings)}`
  );
  assert.deepEqual(
    uncontextualPageStarts,
    [],
    `${options.label} PDF continuation pages start with context: ${JSON.stringify(uncontextualPageStarts)}`
  );

  const required = [...new Set((options.requiredNeedles || []).map(decodeText).filter(Boolean))];
  for (const needle of required) {
    assert.ok(text.includes(needle), `${options.label} PDF text includes ${needle}`);
  }
  for (const needle of [...DEFAULT_FORBIDDEN, ...(options.forbiddenNeedles || [])].map(decodeText).filter(Boolean)) {
    assert.equal(text.includes(needle), false, `${options.label} PDF excludes page-only/forbidden text: ${needle}`);
  }
  const contentBoundary = evaluateCalculationContent(text, options);
  assert.deepEqual(
    contentBoundary.missingGroups,
    [],
    `${options.label} PDF includes required calculation content groups for ${contentBoundary.profile}: ${contentBoundary.missingGroups.join(', ')}`
  );
  assert.equal(/\b(?:NaN|Infinity|undefined|null)\b/.test(text), false, `${options.label} PDF excludes raw invalid tokens`);

  const titleNeedle = decodeText(options.titleNeedle || required[0]);
  const titleIndex = titleNeedle ? text.indexOf(titleNeedle) : -1;
  const projectNeedle = decodeText(options.projectNeedle || '計畫名稱');
  const projectIndex = text.indexOf(projectNeedle);
  if (titleNeedle && projectIndex >= 0) {
    assert.ok(titleIndex >= 0 && titleIndex < projectIndex, `${options.label} PDF reading order keeps title before project metadata (${projectNeedle})`);
  }

  const renderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rendered-delivery-'));
  const prefix = path.join(renderDir, 'page');
  try {
    run('pdftoppm', ['-r', '72', pdfPath, prefix], `${options.label} pdftoppm`);
    const pageFiles = fs.readdirSync(renderDir)
      .filter(name => /^page-\d+\.ppm$/i.test(name))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    assert.equal(pageFiles.length, pageCount, `${options.label} rendered page count matches PDF page count`);
    const pages = pageFiles.map(name => readPpmMetrics(path.join(renderDir, name)));
    assert.equal(pageTextStats.length, pageCount, `${options.label} PDF text page count matches PDF page count`);
    for (const [index, page] of pages.entries()) {
      assert.ok(page.inkRatio >= 0.002, `${options.label} PDF page ${index + 1} is nonblank: inkRatio=${page.inkRatio.toFixed(4)}`);
      assert.ok(
        page.bounds.minX > 1
          && page.bounds.minY > 1
          && page.bounds.maxX < page.width - 2
          && page.bounds.maxY < page.height - 2,
        `${options.label} PDF page ${index + 1} content is not clipped at page edges: ${JSON.stringify(page.bounds)}`
      );
    }
    const sparseFinalPage = findSparseFinalPage(pageTextStats, pages, options);
    assert.equal(
      sparseFinalPage,
      null,
      `${options.label} PDF final page is not sparse: ${JSON.stringify(sparseFinalPage)}`
    );
    return {
      pageCount,
      textLength: text.length,
      textPath,
      contentBoundary,
      footerLineCount: footerLayout.footerLineCount,
      orphanHeadingCount: orphanHeadings.length,
      uncontextualPageStartCount: uncontextualPageStarts.length,
      pageTextStats,
      pages,
    };
  } finally {
    fs.rmSync(renderDir, { recursive: true, force: true });
  }
}

async function renderAndValidateReportPdf(client, options) {
  assert.ok(options?.html, `${options?.label || 'artifact'} requires report HTML`);
  const outputDir = path.resolve(options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  const artifactName = safeName(options.artifactName || options.label);
  const pdfPath = path.join(outputDir, `${artifactName}.pdf`);
  const evidencePath = path.join(outputDir, `${artifactName}.evidence.json`);
  const created = await client.send('Target.createTarget', { url: 'about:blank' });
  let sessionId;
  try {
    const attached = await client.send('Target.attachToTarget', {
      targetId: created.targetId,
      flatten: true,
    });
    sessionId = attached.sessionId;
    await client.send('Page.enable', {}, sessionId);
    await client.send('Runtime.enable', {}, sessionId);
    const frameTree = await client.send('Page.getFrameTree', {}, sessionId);
    const frameId = frameTree.frameTree.frame.id;
    await client.send('Page.setDocumentContent', { frameId, html: options.html }, sessionId);
    await client.send('Runtime.evaluate', {
      expression: `(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
        await Promise.all(Array.from(document.images).map(img => img.complete
          ? Promise.resolve()
          : new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return true;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);
    const domResult = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const clean = value => String(value || '').replace(/\\s+/g, ' ').trim();
        const overflow = Array.from(document.querySelectorAll('table, th, td, pre, img, svg, canvas'))
          .filter(node => node.scrollWidth > node.clientWidth + 2)
          .slice(0, 20)
          .map(node => ({
            tag: node.tagName,
            text: clean(node.textContent).slice(0, 100),
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
          }));
        const headingLabels = Array.from(document.querySelectorAll('h2, h3, h4, .step-title, .rep-step-title'))
          .map(node => clean(node.textContent))
          .filter(Boolean);
        const tableHeaderRows = Array.from(document.querySelectorAll('tr'))
          .filter(row => row.querySelectorAll('th').length > 0 && row.querySelectorAll('td').length === 0)
          .map(row => Array.from(row.children).map(cell => clean(cell.textContent)).filter(Boolean).join(' '))
          .filter(Boolean);
        return {
          bodyText: clean(document.body?.innerText || document.body?.textContent),
          headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(node => clean(node.textContent)).filter(Boolean),
          keepWithNextLabels: headingLabels,
          continuationContextLabels: Array.from(new Set([...headingLabels, ...tableHeaderRows])),
          tableCount: document.querySelectorAll('table').length,
          tableHeaders: Array.from(document.querySelectorAll('th')).map(node => clean(node.textContent)).filter(Boolean),
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
          overflow,
        };
      })()`,
      returnByValue: true,
    }, sessionId);
    const dom = domResult.result?.value || {};
    assert.equal(dom.horizontalOverflow, false, `${options.label} report DOM has no horizontal overflow`);
    assert.deepEqual(dom.overflow || [], [], `${options.label} report DOM has no overflowing table/media elements`);
    assert.ok((dom.headings || []).length > 0, `${options.label} report DOM exposes heading order`);
    if ((dom.tableCount || 0) > 0) {
      assert.ok((dom.tableHeaders || []).length > 0, `${options.label} report tables expose headings`);
    }

    await client.send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
    const printDomResult = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const clean = value => String(value || '').replace(/\\s+/g, ' ').trim();
        const transparentColor = value => {
          const color = clean(value).toLowerCase();
          if (!color) return false;
          if (color === 'transparent') return true;
          if (/^rgba\\(/.test(color)) {
            const parts = color.slice(5, -1).split(',').map(item => item.trim());
            return parts.length === 4 && Number(parts[3]) <= 0.01;
          }
          return /\\/\\s*0(?:\\.0+)?\\s*\\)$/.test(color);
        };
        const intersects = (left, right) => (
          left.right > right.left && left.left < right.right
          && left.bottom > right.top && left.top < right.bottom
        );
        const isDegenerateClipRect = value => {
          const clip = clean(value).toLowerCase();
          if (!clip || clip === 'auto' || clip === 'rect(auto, auto, auto, auto)') return false;
          const match = clip.match(/^rect\\(\\s*(-?[\\d.]+)px\\s*[, ]\\s*(-?[\\d.]+)px\\s*[, ]\\s*(-?[\\d.]+)px\\s*[, ]\\s*(-?[\\d.]+)px\\s*\\)$/);
          if (!match) return false;
          const edges = match.slice(1).map(Number);
          return edges.every(Number.isFinite)
            && Math.abs(edges[0] - edges[2]) <= 0.01
            && Math.abs(edges[1] - edges[3]) <= 0.01;
        };
        const inspectTextNode = node => {
        const parseComputedColor = value => {
          const color = clean(value).toLowerCase();
          if (color === 'transparent') return [0, 0, 0, 0];
          const numbers = color.match(/[\\d.]+/g)?.map(Number) || [];
          if (!/^rgba?\\(/.test(color) || numbers.length < 3) return null;
          return [numbers[0], numbers[1], numbers[2], Number.isFinite(numbers[3]) ? numbers[3] : 1];
        };
        const blendOnWhite = color => color.slice(0, 3).map(channel => channel * color[3] + 255 * (1 - color[3]));
        const luminance = color => {
          const linear = color.slice(0, 3).map(channel => {
            const value = channel / 255;
            return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
          });
          return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
        };
        const contrastRatio = (left, right) => {
          const first = luminance(left);
          const second = luminance(right);
          return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        };
        const inspectTextContrast = element => {
          const foregroundStyle = getComputedStyle(element);
          const foreground = parseComputedColor(foregroundStyle.webkitTextFillColor || foregroundStyle.color)
            || parseComputedColor(foregroundStyle.color);
          let background = [255, 255, 255, 1];
          let ambiguousBackground = false;
          for (let current = element; current; current = current.parentElement) {
            const style = getComputedStyle(current);
            if (style.backgroundImage && style.backgroundImage !== 'none') ambiguousBackground = true;
            const candidate = parseComputedColor(style.backgroundColor);
            if (candidate && candidate[3] > 0.01) {
              background = candidate;
              break;
            }
          }
          if (!foreground) return { lowContrast: false, ambiguous: true, ratio: null, reason: 'unparsed-foreground' };
          const ratio = contrastRatio(blendOnWhite(foreground), blendOnWhite(background));
          const lowContrast = ratio <= 1.05;
          const reason = ambiguousBackground
            ? 'background-image'
            : (ratio > 1.05 && ratio < 1.5 ? 'near-zero-contrast' : '');
          return { lowContrast, ambiguous: Boolean(reason), ratio, reason };
        };

          let element = node.parentElement;
          let opacity = 1;
          let ambiguous = false;
          const ambiguousReasons = [];
          const assistiveMath = element?.closest?.('mjx-assistive-mml');
          if (assistiveMath) {
            const assistiveStyle = getComputedStyle(assistiveMath);
            const assistiveHiddenOverflow = [assistiveStyle.overflow, assistiveStyle.overflowX, assistiveStyle.overflowY]
              .some(item => ['hidden', 'clip'].includes(item));
            const assistiveHasClip = assistiveStyle.clip
              && !['auto', 'rect(auto, auto, auto, auto)'].includes(assistiveStyle.clip);
            if (['absolute', 'fixed'].includes(assistiveStyle.position) && assistiveHiddenOverflow && assistiveHasClip) {
              return { visible: false, ambiguous: false, lowContrast: false };
            }
          }
          const contrast = inspectTextContrast(element);
          const clippingAncestors = [];
          while (element) {
            const style = getComputedStyle(element);
            if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility)
              || style.contentVisibility === 'hidden' || Number.parseFloat(style.fontSize || '0') <= 0
              || transparentColor(style.color) || transparentColor(style.webkitTextFillColor)) {
              return { visible: false, ambiguous: false, lowContrast: false };
            }
            const elementOpacity = Number.parseFloat(style.opacity || '1');
            if (Number.isFinite(elementOpacity)) opacity *= elementOpacity;
            if (opacity <= 0.01) return { visible: false, ambiguous: false, lowContrast: false };
            const box = element.getBoundingClientRect();
            const hasHiddenOverflow = [style.overflow, style.overflowX, style.overflowY]
              .some(item => ['hidden', 'clip'].includes(item));
            const isDefinitelyClippedAssistiveText = ['absolute', 'fixed'].includes(style.position)
              && hasHiddenOverflow
              && box.width <= 2 && box.height <= 2
              && isDegenerateClipRect(style.clip);
            if (isDefinitelyClippedAssistiveText) {
              return { visible: false, ambiguous: false, lowContrast: false };
            }
            if (contrast.ambiguous) {
              ambiguous = true;
              if (contrast.reason && !ambiguousReasons.includes(contrast.reason)) ambiguousReasons.push(contrast.reason);
            }
            if (opacity < 0.1) {
              ambiguous = true;
              if (!ambiguousReasons.includes('near-transparent')) ambiguousReasons.push('near-transparent');
            }
            if (style.clipPath && style.clipPath !== 'none') {
              ambiguous = true;
              if (!ambiguousReasons.includes('clip-path')) ambiguousReasons.push('clip-path');
            }
            if (style.clip && !['auto', 'rect(auto, auto, auto, auto)'].includes(style.clip)) {
              ambiguous = true;
              if (!ambiguousReasons.includes('clip')) ambiguousReasons.push('clip');
            }
            if (hasHiddenOverflow) {
              clippingAncestors.push(box);
            }
            element = element.parentElement;
          }
          const range = document.createRange();
          range.selectNodeContents(node);
          const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
          range.detach?.();
          const horizontalLimit = 8.27 * 96 + 2;
          const visible = rects.some(rect => (
            rect.right > 0 && rect.bottom > 0 && rect.left < horizontalLimit
            && clippingAncestors.every(clip => intersects(rect, clip))
          ));
          return { visible: visible && !contrast.lowContrast, ambiguous, lowContrast: contrast.lowContrast, ambiguousReasons };
        };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const visible = [];
        let textNodeCount = 0;
        let excludedTextNodeCount = 0;
        let excludedLowContrastTextNodeCount = 0;
        let ambiguousTextNodeCount = 0;
        const ambiguousSamples = [];
        let node;
        while ((node = walker.nextNode())) {
          const text = clean(node.nodeValue);
          if (!text) continue;
          textNodeCount += 1;
          const state = inspectTextNode(node);
          if (state.lowContrast) excludedLowContrastTextNodeCount += 1;
          if (state.ambiguous) {
            ambiguousTextNodeCount += 1;
            if (ambiguousSamples.length < 12) {
              ambiguousSamples.push({
                text: text.slice(0, 120),
                tag: node.parentElement?.tagName || '',
                className: clean(node.parentElement?.className || '').slice(0, 120),
                reasons: state.ambiguousReasons || [],
              });
            }
          }
          if (!state.visible || state.ambiguous) {
            excludedTextNodeCount += 1;
            continue;
          }
          visible.push(text);
        }
        return {
          bodyText: clean(visible.join(' ')),
          textNodeCount,
          excludedTextNodeCount,
          excludedLowContrastTextNodeCount,
          ambiguousTextNodeCount,
          ambiguousSamples,
          checks: [
            'print-media',
            'computed-display-visibility-content-visibility',
            'computed-opacity-color-font-size-and-contrast',
            'text-range-client-rects',
            'overflow-clipping-intersection',
            'horizontal-print-bounds',
          ],
        };
      })()`,
      returnByValue: true,
    }, sessionId);
    assert.equal(printDomResult.exceptionDetails, undefined, `${options.label} print-visibility DOM evaluation succeeds: ${JSON.stringify(printDomResult.exceptionDetails || {})}`);
    const printDom = printDomResult.result?.value || {};
    assert.ok((printDom.bodyText || '').length >= (options.minTextLength || 300), `${options.label} print-visible DOM has readable text`);
    assert.equal(printDom.ambiguousTextNodeCount || 0, 0, `${options.label} print-visible DOM has no unresolved clipped or near-transparent text: ${JSON.stringify(printDom.ambiguousSamples || [])}`);
    const visibleContentBoundary = evaluateCalculationContent(printDom.bodyText, options);
    assert.deepEqual(
      visibleContentBoundary.missingGroups,
      [],
      `${options.label} print-visible DOM includes required calculation content groups: ${visibleContentBoundary.missingGroups.join(', ')}`
    );

    const printed = await client.send('Page.printToPDF', {
      printBackground: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.55,
      marginRight: 0.45,
      marginBottom: 0.55,
      marginLeft: 0.45,
      preferCSSPageSize: false,
      generateTaggedPDF: true,
    }, sessionId);
    const pdfBuffer = Buffer.from(printed.data || '', 'base64');
    assert.ok(pdfBuffer.length > 1024, `${options.label} produced a real PDF`);
    assert.equal(pdfBuffer.subarray(0, 4).toString('ascii'), '%PDF', `${options.label} PDF signature`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    const pdf = validatePdfFile(pdfPath, {
      ...options,
      keepWithNextLabels: dom.keepWithNextLabels || [],
      continuationContextLabels: dom.continuationContextLabels || [],
    });
    const evidence = {
      kind: CANONICAL_RENDER_EVIDENCE_KIND,
      artifact: path.basename(pdfPath),
      artifactSha256: crypto.createHash('sha256').update(pdfBuffer).digest('hex'),
      sourceHtmlSha256: crypto.createHash('sha256').update(String(options.html), 'utf8').digest('hex'),
      label: options.label,
      generatedAt: new Date().toISOString(),
      renderer: options.renderer || 'browser-print',
      dom: {
        headings: dom.headings,
        keepWithNextLabels: dom.keepWithNextLabels,
        continuationContextLabels: dom.continuationContextLabels,
        tableCount: dom.tableCount,
        tableHeaders: dom.tableHeaders,
        horizontalOverflow: dom.horizontalOverflow,
        printVisibility: {
          textNodeCount: printDom.textNodeCount,
          excludedTextNodeCount: printDom.excludedTextNodeCount,
          excludedLowContrastTextNodeCount: printDom.excludedLowContrastTextNodeCount,
          ambiguousTextNodeCount: printDom.ambiguousTextNodeCount,
          checks: printDom.checks,
        },
      },
      pdf: {
        ...pdf,
        visibleText: {
          source: 'controlled-html-print-session',
          method: 'print-media-computed-style-client-rects',
          generatedInSamePrintSession: true,
          derivedFromRenderedPages: false,
          text: printDom.bodyText,
          textLength: printDom.bodyText.length,
          textSha256: crypto.createHash('sha256').update(printDom.bodyText, 'utf8').digest('hex'),
          contentBoundary: visibleContentBoundary,
        },
      },
    };
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    return { ...evidence, pdfPath, evidencePath };
  } finally {
    await client.send('Target.closeTarget', { targetId: created.targetId }).catch(() => {});
  }
}

function writeEvidenceSummary(outputDir, family, records, expectedKeys = []) {
  fs.mkdirSync(outputDir, { recursive: true });
  const actualKeys = records.map(record => record.key);
  for (const key of expectedKeys) {
    assert.ok(actualKeys.includes(key), `${family} rendered delivery evidence missing ${key}`);
  }
  const payload = {
    schemaVersion: 1,
    family,
    generatedAt: new Date().toISOString(),
    expected: expectedKeys,
    complete: expectedKeys.filter(key => actualKeys.includes(key)),
    records,
    pass: expectedKeys.every(key => actualKeys.includes(key)),
  };
  const summaryPath = path.join(outputDir, 'rendered-delivery-evidence-summary.json');
  fs.writeFileSync(summaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { payload, summaryPath };
}

module.exports = {
  CALCULATION_BOOK_CONTENT_BOUNDARY,
  CANONICAL_RENDER_EVIDENCE_KIND,
  CONTENT_GROUPS,
  CONTENT_PROFILES,
  DEFAULT_FORBIDDEN,
  DEFAULT_FOOTER_NEEDLES,
  findPdfFooterOverlapLines,
  summarizePdfLayoutPages,
  findPdfOrphanPageEndHeadings,
  findPdfUncontextualPageStarts,
  findSparseFinalPage,
  evaluateCalculationContent,
  resolveEvidenceDir,
  renderAndValidateReportPdf,
  validatePdfFile,
  writeEvidenceSummary,
};
