/* 共用 Word 文書版轉換器。來源為完成的計算書 DOM，不授予正式附件資格。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.ReportDocx = api;
    root.ReportDocxFactory = factory;
    const script = root.document && root.document.currentScript;
    if (script && script.src) root.ReportDocxLibraryURL = new URL('../../../石材固定/vendor/package/dist/index.iife.js', script.src).href;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_BYTES = 2000000;
  const WIDTH = 9866; // A4 210 mm，左右各 18 mm，單位 twip。
  const OMIT = 'script,style,noscript,mjx-assistive-mml,button,input,select,textarea,.rep-toolbar,.toolbar,.rep-approval-control,.rep-approval-meta-control,.rep-download-control,.rep-window-status,.rep-document-status-line,.rep-content-integrity-status,.rep-content-integrity-alert,[data-page-only="true"]';
  const BLOCKS = new Set(['DIV','SECTION','ARTICLE','HEADER','FOOTER','P','PRE','UL','OL','LI','H1','H2','H3','H4','H5','H6','FIGURE','FIGCAPTION','TABLE']);
  const TEXT_BOUNDARY = ['文件類別：文字備查', '正式附件資格：否', '文件用途：文字備查版（不作為正式附件）'];
  const runtimes = new WeakMap();

  async function buildWithRuntime(documentRef, libraryURL, options) {
    const view = documentRef.defaultView;
    if (!view.docx || !view.docx.Packer) {
      if (!libraryURL) throw new Error('找不到 Word 元件位置，請回原工具頁重新開啟計算書。');
      if (!runtimes.has(documentRef)) {
        const pending = new Promise((resolve, reject) => {
          const script = documentRef.createElement('script');
          script.dataset.reportDocxRuntime = 'true';
          const finish = error => {
            clearTimeout(timer);
            script.remove();
            if (error) reject(error); else resolve();
          };
          const timer = setTimeout(() => finish(new Error('Word 元件載入逾時，請確認網路或回原工具頁重試。')), 30000);
          script.onload = () => finish(view.docx && view.docx.Packer ? null : new Error('Word 元件版本不完整。'));
          script.onerror = () => finish(new Error('Word 元件無法載入；請確認原工具站可用。計算書仍可離線列印。'));
          script.src = libraryURL;
          documentRef.head.appendChild(script);
        });
        runtimes.set(documentRef, pending);
        pending.catch(() => runtimes.delete(documentRef));
      }
      await runtimes.get(documentRef);
    }
    if (view.MathJax && view.MathJax.typesetPromise) await view.MathJax.typesetPromise();
    return build(documentRef, view.docx, options);
  }

  function text(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function ignored(node, view) {
    if (node.nodeType !== 1) return false;
    if (node.matches(OMIT) || [...node.classList].some(name => name.startsWith('page-only-'))) return true;
    const style = view.getComputedStyle(node);
    return node.hidden || style.display === 'none' || style.visibility === 'hidden';
  }
  function imageDimensions(node) {
    const rect = node.getBoundingClientRect();
    const box = node.viewBox && node.viewBox.baseVal;
    const width = rect.width || node.naturalWidth || Number(node.getAttribute('width')) || (box && box.width);
    const height = rect.height || node.naturalHeight || Number(node.getAttribute('height')) || (box && box.height);
    if (!(width > 0 && height > 0)) throw new Error('報告圖像沒有有效尺寸，已停止 Word 匯出。');
    const scale = Math.min(1, 650 / width, 820 / height);
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
  }
  async function imageData(node, documentRef) {
    const view = documentRef.defaultView;
    const size = imageDimensions(node);
    let uri;
    if (node.tagName.toLowerCase() === 'canvas') {
      uri = node.toDataURL('image/png');
    } else if (node.tagName.toLowerCase() === 'svg') {
      const clone = node.cloneNode(true);
      const sourceNodes = [node, ...node.querySelectorAll('*')];
      const cloneNodes = [clone, ...clone.querySelectorAll('*')];
      const properties = ['fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity','stroke-dasharray','stroke-dashoffset','stroke-linecap','stroke-linejoin','stroke-miterlimit','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline','opacity','paint-order','vector-effect','marker-start','marker-mid','marker-end','clip-path','clip-rule','mask','filter'];
      sourceNodes.forEach((original, index) => {
        const computed = view.getComputedStyle(original);
        properties.forEach(property => cloneNodes[index].style.setProperty(property, computed.getPropertyValue(property)));
      });
      // MathJax 的全域字形定義也必須跟圖像走，不能依賴原視窗。
      const defs = documentRef.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const copied = new Set();
      const copyReference = href => {
          if (!href.startsWith('#') || copied.has(href)) return;
          copied.add(href);
          const original = documentRef.getElementById(href.slice(1));
          if (!original) throw new Error('報告 SVG 缺少字形定義：' + href);
          const definition = original.cloneNode(true);
          defs.appendChild(definition);
          copyReferences(definition);
      };
      const copyReferences = element => {
        [element, ...element.querySelectorAll('*')].forEach(child => {
          if (child.tagName.toLowerCase() === 'use') copyReference(child.getAttribute('href') || child.getAttribute('xlink:href') || '');
          [...child.attributes].forEach(attribute => {
            const value = attribute.value.replace(/url\(['"]?([^)'"\s]+)['"]?\)/g, (match, reference) => {
              const hash = reference.indexOf('#');
              if (hash < 0) return match;
              const local = reference.slice(hash);
              copyReference(local);
              return 'url(' + local + ')';
            });
            if (value !== attribute.value) child.setAttribute(attribute.name, value);
          });
        });
      };
      copyReferences(clone);
      if (defs.children.length) clone.insertBefore(defs, clone.firstChild);
      // Runtime SVG 的 xmlns 可能由 setAttribute 建立（namespace=null）。
      // 先移除同名宣告，避免 setAttributeNS 另加一個 xmlns 而產生無效 XML。
      clone.removeAttribute('xmlns');
      clone.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', String(size.width));
      clone.setAttribute('height', String(size.height));
      uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new view.XMLSerializer().serializeToString(clone));
    } else {
      uri = node.currentSrc || node.src;
      if (!uri) throw new Error('報告圖片來源遺失，已停止 Word 匯出。');
    }
    const image = new view.Image();
    image.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('報告圖像無法轉換，已停止 Word 匯出。'));
      image.src = uri;
    });
    const canvas = documentRef.createElement('canvas');
    canvas.width = size.width * 2;
    canvas.height = size.height * 2;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');
    if (!png.startsWith('data:image/png;base64,')) throw new Error('報告圖像轉換未產生 PNG。');
    return { data: Uint8Array.from(view.atob(png.split(',')[1]), c => c.charCodeAt(0)), ...size };
  }

  async function build(documentRef, library, options = {}) {
    const d = library;
    if (!d || !d.Document || !d.Packer || !d.ImageRun) throw new Error('Word 元件尚未載入，請稍後再試。');
    const paper = documentRef.querySelector('.rep-paper, .paper');
    if (!paper) throw new Error('找不到計算書內容，無法建立 Word 文書版。');
    const view = documentRef.defaultView;
    const stats = { tables: 0, rows: 0, cells: 0, images: 0, mergedCells: 0 };
    const border = { style: d.BorderStyle.SINGLE, size: 4, color: 'D9D9D9' };
    const normal = { font: 'Microsoft JhengHei', size: 21, color: '000000' };

    async function runs(node, format = {}) {
      if (node.nodeType === 3) {
        const value = format.preserve ? node.textContent : node.textContent.replace(/\s+/g, ' ');
        return value.split(/\r?\n/).flatMap((line, index) => [new d.TextRun({ ...normal, ...format, text: line, ...(index ? { break: 1 } : {}) })]);
      }
      if (node.nodeType !== 1 || ignored(node, view)) return [];
      const tag = node.tagName.toUpperCase();
      if (tag === 'BR') return [new d.TextRun({ break: 1 })];
      if (['SVG','CANVAS','IMG'].includes(tag)) {
        const image = await imageData(node, documentRef);
        stats.images += 1;
        const scale = Math.min(1, (format.imageMaxWidth || 650) / image.width);
        return [new d.ImageRun({ type: 'png', data: image.data, transformation: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) }, altText: { title: node.getAttribute('aria-label') || node.getAttribute('alt') || '計算書圖像', description: '由來源計算書內嵌', name: 'report-figure-' + stats.images } })];
      }
      const next = { ...format };
      if (['B','STRONG','TH'].includes(tag)) next.bold = true;
      if (['I','EM'].includes(tag)) next.italics = true;
      if (tag === 'SUB') next.subScript = true;
      if (tag === 'SUP') next.superScript = true;
      if (['CODE','PRE'].includes(tag)) { next.font = 'Consolas'; next.size = 19; next.preserve = true; }
      const children = [];
      for (const child of node.childNodes) children.push(...await runs(child, next));
      return children;
    }
    async function paragraph(nodes, options = {}, format = {}) {
      const children = [];
      for (const node of nodes) children.push(...await runs(node, format));
      return new d.Paragraph({ children, spacing: { after: 100, line: 276 }, widowControl: true, ...options });
    }
    async function table(node) {
      stats.tables += 1;
      const sourceRows = [...node.rows].filter(row => !ignored(row, view));
      const rows = [];
      // 欄寬由完整占位格計算；跨列儲存格不會使後續欄向左移。
      const occupancy = [], placements = [], columnWidths = [];
      sourceRows.forEach((row, rowIndex) => {
        occupancy[rowIndex] ||= [];
        let column = 0;
        const cells = [...row.cells].filter(cell => !ignored(cell, view));
        placements[rowIndex] = cells.map(cell => {
          while (occupancy[rowIndex][column]) column += 1;
          const groupRemaining = sourceRows.slice(rowIndex).filter(candidate => candidate.parentElement === row.parentElement).length;
          const colSpan = Math.max(1, cell.colSpan), rowSpan = Math.max(1, Math.min(cell.rowSpan || groupRemaining, groupRemaining));
          const start = column;
          for (let r = rowIndex; r < rowIndex + rowSpan; r++) {
            occupancy[r] ||= [];
            for (let c = start; c < start + colSpan; c++) occupancy[r][c] = true;
          }
          const width = cell.getBoundingClientRect().width / colSpan;
          for (let c = start; c < start + colSpan; c++) columnWidths[c] = Math.max(columnWidths[c] || 0, width);
          column += colSpan;
          return { cell, start, colSpan, rowSpan };
        });
      });
      const measured = columnWidths.map(value => value > 0 ? value : 1);
      const total = measured.reduce((a,b) => a+b, 0);
      const widths = measured.map(value => Math.round(value / total * WIDTH));
      for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex++) {
        const row = sourceRows[rowIndex], children = [];
        stats.rows += 1;
        for (const { cell, start, colSpan, rowSpan } of placements[rowIndex]) {
          stats.cells += 1;
          if (colSpan > 1 || rowSpan > 1) stats.mergedCells += 1;
          const cellWidth = widths.slice(start, start + colSpan).reduce((a,b) => a+b, 0);
          const cellChildren = await blocks(cell, true, { bold: cell.tagName === 'TH', imageMaxWidth: Math.max(24, (cellWidth - 180) / 15) });
          children.push(new d.TableCell({
            children: cellChildren.length ? cellChildren : [new d.Paragraph('')],
            width: { size: cellWidth, type: d.WidthType.DXA },
            ...(colSpan > 1 ? { columnSpan: colSpan } : {}),
            ...(rowSpan > 1 ? { rowSpan } : {}),
            margins: { top: 80, bottom: 80, left: 90, right: 90 },
            borders: { top: border, bottom: border, left: border, right: border },
            verticalAlign: d.VerticalAlign.CENTER,
            ...(cell.tagName === 'TH' ? { shading: { fill: 'E6EAF3', type: d.ShadingType.CLEAR } } : {})
          }));
        }
        rows.push(new d.TableRow({ children, ...(row.parentElement.tagName === 'THEAD' ? { tableHeader: true } : {}) }));
      }
      if (!rows.length) throw new Error('報告含有空白表格，無法確認 Word 表格一致性。');
      return new d.Table({ rows, width: { size: WIDTH, type: d.WidthType.DXA }, columnWidths: widths, layout: d.TableLayoutType.FIXED,
        borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border } });
    }
    async function blocks(parent, inCell = false, inheritedFormat = {}) {
      const result = [], pending = [];
      const format = { ...(inCell ? { size: 19 } : {}), ...inheritedFormat };
      async function flush() {
        if (pending.length && pending.some(n => text(n.textContent) || (n.nodeType === 1 && (n.matches('img,svg,canvas,br') || n.querySelector('img,svg,canvas,br'))))) result.push(await paragraph(pending, {}, format));
        pending.length = 0;
      }
      for (const node of parent.childNodes) {
        if (node.nodeType === 1 && ignored(node, view)) continue;
        if (node.nodeType !== 1 || !BLOCKS.has(node.tagName.toUpperCase())) { pending.push(node); continue; }
        await flush();
        const tag = node.tagName.toUpperCase();
        if (tag === 'TABLE') {
          if (node.caption && !ignored(node.caption, view)) result.push(await paragraph([node.caption], { keepNext: true }, { ...format, bold: true }));
          result.push(await table(node), new d.Paragraph({ spacing: { after: 80 }, children: [] }));
          continue;
        }
        if (/^H[1-6]$/.test(tag)) {
          result.push(await paragraph([node], { heading: tag === 'H1' ? d.HeadingLevel.TITLE : d.HeadingLevel['HEADING_' + Math.min(3, Number(tag[1]) - 1)], keepNext: true, spacing: { before: 180, after: 120 } }, { bold: true, size: tag === 'H1' ? 32 : 24 }));
        } else if (['P','PRE','FIGCAPTION'].includes(tag)) {
          result.push(await paragraph([node], { ...(tag === 'FIGCAPTION' ? { keepNext: true } : {}) }, format));
        } else if (tag === 'LI') {
          const list = node.parentElement;
          const ordered = list.tagName === 'OL';
          const siblings = [...list.children].filter(child => child.tagName === 'LI');
          const reversed = list.hasAttribute('reversed');
          let number = list.hasAttribute('start') ? Number(list.getAttribute('start')) : reversed ? siblings.length : 1;
          for (const sibling of siblings) {
            if (sibling.hasAttribute('value')) number = Number(sibling.getAttribute('value'));
            if (sibling === node) break;
            number += reversed ? -1 : 1;
          }
          const prefix = documentRef.createTextNode(ordered ? number + '. ' : '• ');
          let level = 0, ancestor = list.parentElement;
          while (ancestor && ancestor !== paper) { if (['UL','OL'].includes(ancestor.tagName)) level++; ancestor = ancestor.parentElement; }
          const own = [...node.childNodes].filter(child => child.nodeType !== 1 || !['UL','OL'].includes(child.tagName));
          result.push(await paragraph([prefix, ...own], { indent: { left: (level + 1) * 300, hanging: 220 } }, format));
          for (const nested of node.children) if (['UL','OL'].includes(nested.tagName)) result.push(...await blocks(nested, inCell, inheritedFormat));
        } else result.push(...await blocks(node, inCell, inheritedFormat));
      }
      await flush();
      return result;
    }
    const sourceStatus = documentRef.querySelector('.rep-document-status-line');
    const sourceLabel = sourceStatus && sourceStatus.dataset.documentClass === 'formal-attachment' ? '已核可正式附件' : '內部審閱';
    const children = [
      ...TEXT_BOUNDARY.map(value => new d.Paragraph({ children: [new d.TextRun({ ...normal, text: value, bold: true })], spacing: { after: 70 }, keepNext: true })),
      new d.Paragraph({ children: [new d.TextRun({ ...normal, text: '來源報告狀態：' + sourceLabel + '。本 Word 檔僅供文書編排，不含核可封印與完整性驗證。' })], spacing: { after: 160 } }),
      ...await blocks(paper)
    ];
    const document = new d.Document({
      creator: '結構工具箱', title: text((documentRef.querySelector('h1') || {}).textContent) || '計算書文書版', description: '文字備查版，不作為正式附件',
      styles: { default: {
        document: { run: normal, paragraph: { spacing: { after: 100, line: 276 }, widowControl: true } },
        title: { run: { ...normal, size: 32, bold: true }, paragraph: { keepNext: true } },
        heading1: { run: { ...normal, size: 26, bold: true }, paragraph: { keepNext: true } },
        heading2: { run: { ...normal, size: 24, bold: true }, paragraph: { keepNext: true } },
        heading3: { run: { ...normal, size: 22, bold: true }, paragraph: { keepNext: true } }
      } },
      sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1020, right: 1020 } } },
        footers: { default: new d.Footer({ children: [new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.TextRun({ ...normal, size: 18, text: '文字備查　不作為正式附件　' }), new d.TextRun({ children: [d.PageNumber.CURRENT] }), new d.TextRun(' / '), new d.TextRun({ children: [d.PageNumber.TOTAL_PAGES] })] })] }) }, children }]
    });
    const blob = await d.Packer.toBlob(document);
    if (blob.size > (options.maxBytes || MAX_BYTES)) throw new Error('Word 檔案超過 2 MB，請降低來源圖片解析度後重試；未刪減任何工程內容。');
    return { blob, stats, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }
  return Object.freeze({ build, buildWithRuntime, MAX_BYTES, TEXT_BOUNDARY });
});
