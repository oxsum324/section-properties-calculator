const assert = require('node:assert/strict');
const { JSDOM } = require('./螺栓檢討/bolt-review-tool/node_modules/jsdom');
const { build, buildWithRuntime, TEXT_BOUNDARY, MAX_BYTES } = require('./結構工具箱/core/ui/report-docx.js');

// 僅驗證 DOM → 文書結構與送往影像轉換的 SVG；不執行瀏覽器、Word 或實際 PNG 渲染。
function mockLibrary(blobSize = 512) {
  const library = {};
  for (const kind of ['Document', 'Paragraph', 'TextRun', 'ImageRun', 'Table', 'TableRow', 'TableCell', 'Footer']) {
    library[kind] = class { constructor(options) { this.kind = kind; this.options = options; } };
  }
  Object.assign(library, {
    BorderStyle: { SINGLE: 'single' }, WidthType: { DXA: 'dxa' },
    VerticalAlign: { CENTER: 'center' }, ShadingType: { CLEAR: 'clear' },
    TableLayoutType: { FIXED: 'fixed' }, AlignmentType: { CENTER: 'center' },
    PageNumber: { CURRENT: 'current-page', TOTAL_PAGES: 'total-pages' },
    HeadingLevel: { TITLE: 'title', HEADING_1: 'heading1', HEADING_2: 'heading2', HEADING_3: 'heading3' },
    Packer: { async toBlob(document) { library.document = document; return { size: blobSize }; } },
  });
  return library;
}

function find(value, kind) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return [];
  return [
    ...(value.kind === kind ? [value] : []),
    ...Object.values(value).flatMap(child => Array.isArray(child) ? child.flatMap(item => find(item, kind)) : find(child, kind)),
  ];
}
function words(value) {
  return find(value, 'TextRun').map(run => typeof run.options === 'string' ? run.options : run.options.text || '').join('');
}

async function convert(body, { outside = '', style = '', blobSize, options, prepare } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head><style>${style}</style></head><body>${outside}<div class="rep-paper">${body}</div></body></html>`);
  const { window } = dom;
  const imageSources = [];
  window.Image = class {
    set src(value) { imageSources.push(value); queueMicrotask(() => this.onload()); }
  };
  window.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {}, fillStyle: '' });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,aW1hZ2U=';
  const library = mockLibrary(blobSize);
  try {
    if (prepare) prepare(window.document);
    const sourceHtml = window.document.documentElement.outerHTML;
    const result = await build(window.document, library, options);
    assert.equal(window.document.documentElement.outerHTML, sourceHtml, '轉換器不得更改來源計算書 DOM／封印內容');
    return { ...result, document: library.document, body: library.document.options.sections[0].children, imageSources };
  } finally { window.close(); }
}

async function main() {
  const caption = await convert('<table><caption>需求表 <strong>單位：kN</strong></caption><thead><tr><th>項目</th><th>值</th></tr></thead><tbody><tr><td>剪力</td><td>12</td></tr></tbody></table>');
  const captionParagraph = caption.body.find(node => node.kind === 'Paragraph' && words(node) === '需求表 單位：kN');
  assert.ok(captionParagraph, '表題與單位不得遺失');
  assert.equal(captionParagraph.options.keepNext, true, '表題應跟隨表格');
  assert.equal(caption.body.indexOf(captionParagraph) + 1, caption.body.findIndex(node => node.kind === 'Table'));
  const captionRows = find(caption.document, 'TableRow');
  assert.equal(captionRows[0].options.tableHeader, true);
  assert.equal(Object.hasOwn(captionRows[1].options, 'tableHeader'), false, '一般列不得產生重複表頭標記');
  for (const cell of find(caption.document, 'TableCell')) {
    assert.equal(Object.hasOwn(cell.options, 'rowSpan'), false, '單列格不得產生垂直合併');
    assert.equal(Object.hasOwn(cell.options, 'columnSpan'), false);
    assert.ok(cell.options.width.size > 0, '無版面引擎時仍需有效欄寬');
  }

  const merged = await convert('<table><tbody><tr><td rowspan="0" colspan="2">群組甲</td><td>甲1</td></tr><tr><td>甲2</td></tr></tbody><tbody><tr><td>乙1</td><td>乙2</td><td>乙3</td></tr></tbody></table>');
  const mergedCells = find(merged.document, 'TableCell');
  assert.equal(mergedCells[0].options.rowSpan, 2, 'rowspan=0 僅合併原 tbody，不得跨群組');
  assert.equal(mergedCells[0].options.columnSpan, 2);
  assert.deepEqual(mergedCells.map(words), ['群組甲', '甲1', '甲2', '乙1', '乙2', '乙3']);
  assert.equal(merged.stats.rows, 3);
  assert.equal(merged.stats.mergedCells, 1);

  const nested = await convert('<ul><li>上層項目<ul><li>下層甲</li><li>下層乙</li></ul></li></ul><ol start="4" reversed><li>第四項</li><li value="2">第二項</li><li>第一項</li></ol>');
  const listParagraphs = nested.body.filter(node => node.kind === 'Paragraph' && node.options.indent);
  assert.deepEqual(listParagraphs.map(words), ['• 上層項目', '• 下層甲', '• 下層乙', '4. 第四項', '2. 第二項', '1. 第一項']);
  assert.ok(listParagraphs[1].options.indent.left > listParagraphs[0].options.indent.left, '巢狀項目必須保留層級');
  assert.equal(listParagraphs[2].options.indent.left, listParagraphs[1].options.indent.left);

  const media = await convert('<div class="equation-math"><mjx-container><svg width="120" height="40" viewBox="0 0 120 40"><use href="#glyph"/></svg></mjx-container></div><span><img src="data:image/png;base64,aW1hZ2U=" width="40" height="20" alt="巢狀圖片"></span><mjx-assistive-mml><math>不可重複的輔助公式</math></mjx-assistive-mml>', {
    outside: '<svg hidden><defs><path id="glyph" d="M0 0L10 10"/></defs></svg>',
  });
  assert.equal(media.stats.images, 2, '空文字的 mjx-container 與 span 圖片仍須匯出');
  assert.equal(find(media.document, 'ImageRun').length, 2);
  assert.ok(!words(media.document).includes('不可重複的輔助公式'));
  const mathSvg = decodeURIComponent(media.imageSources.find(uri => uri.startsWith('data:image/svg+xml')).split(',').slice(1).join(','));
  assert.match(mathSvg, /id="glyph"/, '全域字形需內嵌，不能依賴原視窗');
  const parsedStaticSvg = new JSDOM(mathSvg, { contentType: 'image/svg+xml' });
  assert.equal([...parsedStaticSvg.window.document.documentElement.attributes].filter(attr => attr.name === 'xmlns').length, 1, 'static SVG 也必須只有一個有效 xmlns');
  parsedStaticSvg.window.close();

  // MathJax／其他 runtime 可用 setAttribute 建立 xmlns，與 HTML 解析後的 namespace 不同。
  // setAttributeNS 不會覆寫這個同名但 namespace=null 的屬性；必須避免雙 xmlns 的無效 XML。
  const dynamicSvg = await convert('<svg width="120" height="40" viewBox="0 0 120 40"><use href="#runtime-glyph"/></svg>', {
    outside: '<svg hidden><defs><path id="runtime-glyph" d="M0 0L10 10"/></defs></svg>',
    prepare(document) {
      const svg = document.querySelector('.rep-paper svg');
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      assert.equal(svg.getAttributeNode('xmlns').namespaceURI, null, 'fixture 必須保留 runtime 的無 namespace 屬性');
      svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      assert.equal(svg.getAttributeNode('xmlns:xlink').namespaceURI, null);
      const use = svg.querySelector('use');
      use.removeAttribute('href');
      use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#runtime-glyph');
    },
  });
  const dynamicXml = decodeURIComponent(dynamicSvg.imageSources[0].split(',').slice(1).join(','));
  const parsedDynamicSvg = new JSDOM(dynamicXml, { contentType: 'image/svg+xml' });
  assert.equal(parsedDynamicSvg.window.document.documentElement.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal([...parsedDynamicSvg.window.document.documentElement.attributes].filter(attr => attr.name === 'xmlns').length, 1);
  assert.equal([...parsedDynamicSvg.window.document.documentElement.attributes].filter(attr => attr.name === 'xmlns:xlink').length, 1, 'runtime plain xmlns:xlink 不得產生重複宣告');
  assert.equal(parsedDynamicSvg.window.document.querySelector('#runtime-glyph').getAttribute('d'), 'M0 0L10 10', '字形定義與原路徑不能因 namespace 修正遺失');
  assert.equal(parsedDynamicSvg.window.document.querySelector('use').getAttributeNS('http://www.w3.org/1999/xlink', 'href'), '#runtime-glyph');
  parsedDynamicSvg.window.close();

  const dashed = await convert('<svg width="120" height="40"><polyline class="sketch-net" points="0,0 20,20"/></svg>', {
    style: '.sketch-net{fill:none;stroke:#c0392b;stroke-width:3;stroke-dasharray:8 6;stroke-linecap:round;stroke-linejoin:round;stroke-opacity:.6}',
  });
  const dashedSvg = decodeURIComponent(dashed.imageSources[0].split(',').slice(1).join(','));
  const renderedSvg = new JSDOM(dashedSvg, { contentType: 'image/svg+xml' });
  const polyline = renderedSvg.window.document.querySelector('polyline');
  for (const [property, expected] of Object.entries({ 'stroke-dasharray': '8 6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-opacity': '0.6' })) {
    assert.equal(polyline.style.getPropertyValue(property), expected, `${property} 必須隨 SVG 進入影像轉換`);
  }
  renderedSvg.window.close();

  const formalSource = await convert('<span class="rep-document-status-line" data-document-class="formal-attachment">正式狀態控制項</span><h1>工程報告</h1><p>檢核內容</p>');
  for (const line of TEXT_BOUNDARY) assert.ok(words(formalSource.body).includes(line));
  assert.match(words(formalSource.document.options.sections[0].footers), /文字備查.*不作為正式附件/);
  assert.ok(!words(formalSource.document).includes('正式狀態控制項'));
  assert.match(words(formalSource.body), /來源報告狀態：已核可正式附件/);
  assert.equal(formalSource.document.options.title, '工程報告');
  await assert.rejects(convert('<p>內容必須保留</p>', { blobSize: MAX_BYTES + 1 }), /超過 2 MB/);
  await assert.rejects(convert('<svg width="20" height="20"><use href="#missing"/></svg>'), /缺少字形定義/);
  const runtimeDom = new JSDOM('<html><head></head><body><div class="paper"><h1>延遲載入測試</h1><p>123.45</p></div></body></html>');
  const runtimeDocument = runtimeDom.window.document;
  let loads = 0;
  const originalAppend = runtimeDocument.head.appendChild.bind(runtimeDocument.head);
  runtimeDocument.head.appendChild = script => {
    loads++;
    originalAppend(script);
    queueMicrotask(() => { runtimeDom.window.docx = mockLibrary(); script.onload(); });
    return script;
  };
  const lazyResults = await Promise.all([buildWithRuntime(runtimeDocument, 'https://example.test/docx.js'), buildWithRuntime(runtimeDocument, 'https://example.test/docx.js')]);
  assert.equal(loads, 1, '同一報告同時匯出只載入一份 runtime');
  assert.equal(lazyResults.length, 2);
  assert.equal(runtimeDocument.querySelectorAll('script').length, 0, '載入控制項不留在可攜 HTML');
  delete runtimeDom.window.docx;
  const retryDocument = new JSDOM('<html><head></head><body><div class="paper"><p>不省略內容</p></div></body></html>');
  let retries = 0;
  retryDocument.window.document.head.appendChild = script => {
    retries++;
    queueMicrotask(() => {
      if (retries === 1) script.onerror();
      else { retryDocument.window.docx = mockLibrary(); script.onload(); }
    });
    return script;
  };
  await assert.rejects(buildWithRuntime(retryDocument.window.document, 'https://example.test/docx.js'), /元件無法載入/);
  await buildWithRuntime(retryDocument.window.document, 'https://example.test/docx.js');
  assert.equal(retries, 2, '載入失敗可明確重試，不把失敗 promise 永久快取');
  runtimeDom.window.close(); retryDocument.window.close();
  console.log('report-docx.contract.test.js passed (caption/merged row groups/nested lists/media/SVG/nonformal boundary)');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
