const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_FORBIDDEN = [
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
];

function safeName(value) {
  return String(value || 'artifact')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'artifact';
}

function decodeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
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
  run('pdftotext', ['-layout', pdfPath, textPath], `${options.label} pdftotext`);
  const text = decodeText(fs.readFileSync(textPath, 'utf8'));
  assert.ok(text.length >= (options.minTextLength || 300), `${options.label} PDF has readable text: chars=${text.length}`);

  const required = [...new Set((options.requiredNeedles || []).map(decodeText).filter(Boolean))];
  for (const needle of required) {
    assert.ok(text.includes(needle), `${options.label} PDF text includes ${needle}`);
  }
  for (const needle of [...DEFAULT_FORBIDDEN, ...(options.forbiddenNeedles || [])].map(decodeText).filter(Boolean)) {
    assert.equal(text.includes(needle), false, `${options.label} PDF excludes page-only/forbidden text: ${needle}`);
  }
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
    return { pageCount, textLength: text.length, textPath, pages };
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
        return {
          bodyText: clean(document.body?.innerText || document.body?.textContent),
          headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(node => clean(node.textContent)).filter(Boolean),
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
    const pdf = validatePdfFile(pdfPath, options);
    const evidence = {
      artifact: path.basename(pdfPath),
      label: options.label,
      generatedAt: new Date().toISOString(),
      renderer: options.renderer || 'browser-print',
      dom: {
        headings: dom.headings,
        tableCount: dom.tableCount,
        tableHeaders: dom.tableHeaders,
        horizontalOverflow: dom.horizontalOverflow,
      },
      pdf,
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
  DEFAULT_FORBIDDEN,
  resolveEvidenceDir,
  renderAndValidateReportPdf,
  validatePdfFile,
  writeEvidenceSummary,
};
