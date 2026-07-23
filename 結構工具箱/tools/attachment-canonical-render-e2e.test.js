'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const Checker = require('./attachment-package-check.js');
const {
  CANONICAL_RENDER_EVIDENCE_KIND,
  renderAndValidateReportPdf,
} = require('./rendered-delivery-evidence.js');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function removeTempDirectory(directory) {
  const resolved = path.resolve(directory);
  assert.ok(path.basename(resolved).startsWith('attachment-canonical-render-'), `refuse to remove unexpected path: ${resolved}`);
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code) || attempt === 12) {
        console.warn(`Warning: could not remove temporary Edge profile: ${resolved} (${error.message})`);
        return;
      }
      await delay(250 * attempt);
    }
  }
}

async function waitForJson(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function createCdpClient(webSocketUrl) {
  let nextId = 1;
  const pending = new Map();
  const socket = new WebSocket(webSocketUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const promise = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) promise.reject(new Error(message.error.message || 'CDP error'));
    else promise.resolve(message.result || {});
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return {
    open: () => opened,
    send(method, params = {}, sessionId) {
      const id = nextId++;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify(payload));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function main() {
  const edgePath = EDGE_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert.ok(edgePath, `Microsoft Edge not found in: ${EDGE_CANDIDATES.join(', ')}`);
  assert.equal(typeof WebSocket, 'function', 'Node WebSocket support is required');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-canonical-render-'));
  const packageDir = path.join(tempDir, 'package');
  const reusedDir = path.join(tempDir, 'reused');
  const userDataDir = path.join(tempDir, '.edge-profile');
  fs.mkdirSync(packageDir, { recursive: true });
  const debugPort = await getFreePort();
  let edge;
  let client;
  try {
    edge = spawn(edgePath, [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-gpu',
      'about:blank',
    ], { stdio: 'ignore', windowsHide: true });
    const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
    client = createCdpClient(version.webSocketDebuggerUrl);
    await client.open();

    const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><style>
      body{font-family:"Microsoft JhengHei",sans-serif;color:#111;margin:32px;line-height:1.55}
      h1{font-size:28px} h2{font-size:20px;margin-top:24px}.trace{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      @media print{.screen-note{display:none!important}}
    </style></head><body>
      <h1>RC 梁設計計算書</h1>
      <div class="screen-note">採用輸入 計算內容 檢核結論 Mu=9999 tf·m DCR=0.01（此列不得進入列印證據）</div>
      <div style="color:#fff;background-color:#fff">採用輸入 計算內容 檢核結論 Mu=8888 tf·m DCR=0.02（白字不得補足可見內容）</div>
      <div style="position:absolute;clip:rect(1px,1px,1px,1px);width:1px;height:1px;overflow:hidden">MathJax assistive hidden copy Mu=7777 tf·m</div>
      <mjx-assistive-mml style="position:absolute;clip:rect(1px,1px,1px,1px);width:10px;height:10px;overflow:hidden"><span>Mu=7766</span></mjx-assistive-mml>
      <div class="trace"><div>文件狀態：正式附件</div><div>核可時間：2026/07/23 13:05:00</div><div>產出工具：RC 梁</div><div>工具版本：v3.1</div><div>輸出時間：2026/07/23 13:00:00</div><div>計算指紋：CF-1234ABCD5678EF90</div></div>
      <section><h2>採用輸入</h2><p>採用混凝土強度 fc'=280 kgf/cm²、梁寬 b=40 cm、梁深 h=70 cm，設計彎矩 Mu=12.5 tf·m。</p></section>
      <section><h2>計算內容</h2><p>依設計條件代入公式計算，名目彎矩 Mn=20.2 tf·m，設計強度 φMn=18.2 tf·m；需求容量比 DCR=Mu/φMn=0.69。</p></section>
      <section><h2>檢核結論</h2><p>主軸彎矩 DCR=0.69，小於 1.00，檢核結果：通過。以上數值為本次正式附件的工程計算結果。</p></section>
    </body></html>`;
    const rendered = await renderAndValidateReportPdf(client, {
      html,
      outputDir: packageDir,
      artifactName: 'canonical-report',
      label: 'attachment canonical render e2e',
      renderer: 'attachment-e2e-browser-print',
      minTextLength: 180,
      contentBoundaryProfile: 'traceable-calculation-book',
      requiredNeedles: ['RC 梁設計計算書', '文件狀態：正式附件', '採用輸入', '計算內容', '檢核結論'],
      titleNeedle: 'RC 梁設計計算書',
      projectNeedle: '文件狀態',
      footerNeedles: [],
    });
    const evidence = JSON.parse(fs.readFileSync(rendered.evidencePath, 'utf8'));
    assert.equal(evidence.kind, CANONICAL_RENDER_EVIDENCE_KIND);
    assert.match(evidence.artifactSha256, /^[0-9a-f]{64}$/);
    assert.match(evidence.sourceHtmlSha256, /^[0-9a-f]{64}$/);
    assert.equal(evidence.pdf.visibleText.source, 'controlled-html-print-session');
    assert.equal(evidence.pdf.visibleText.derivedFromRenderedPages, false, 'print DOM evidence is not mislabeled as OCR');
    assert.ok(evidence.dom.printVisibility.excludedTextNodeCount >= 1, 'print-hidden content is excluded from canonical visible text');
    assert.ok(evidence.dom.printVisibility.excludedLowContrastTextNodeCount >= 1, 'white-on-white text is excluded from canonical visible text');
    assert.equal(evidence.pdf.visibleText.text.includes('8888'), false, 'white-on-white engineering values are absent from canonical visible text');
    assert.equal(evidence.pdf.visibleText.text.includes('7777'), false, 'degenerate one-pixel assistive text is excluded from canonical visible text');
    assert.equal(evidence.pdf.visibleText.text.includes('7766'), false, 'clipped MathJax assistive MathML is excluded from canonical visible text');
    assert.equal(evidence.dom.printVisibility.ambiguousTextNodeCount, 0);

    const ready = Checker.checkPackage(packageDir);
    assert.equal(ready.status, 'ready', Checker.formatSummary(ready));
    assert.equal(ready.attachments[0].visibilityEvidence?.status, 'verified');
    assert.equal(ready.issues.some(issue => issue.code === 'pdf-canonical-render-evidence-required'), false);

    const originalEvidenceJson = fs.readFileSync(rendered.evidencePath, 'utf8');
    const originalEvidence = JSON.parse(originalEvidenceJson);
    const writeEvidence = value => fs.writeFileSync(rendered.evidencePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

    const hashTamperedEvidence = JSON.parse(JSON.stringify(originalEvidence));
    hashTamperedEvidence.pdf.visibleText.text += ' 證據文字遭竄改';
    writeEvidence(hashTamperedEvidence);
    const textHashTampered = Checker.checkPackage(packageDir);
    assert.equal(textHashTampered.status, 'review', 'changing canonical visible text without its digest is detected');
    assert(
      textHashTampered.attachments[0].visibilityEvidence?.reasons.includes('visible-text-sha256'),
    );
    fs.writeFileSync(rendered.evidencePath, originalEvidenceJson, 'utf8');

    const falseBoundaryEvidence = JSON.parse(JSON.stringify(originalEvidence));
    falseBoundaryEvidence.pdf.visibleText.text = 'RC 梁設計計算書 文件狀態：正式附件 只有標題與狀態，沒有工程計算內容。';
    falseBoundaryEvidence.pdf.visibleText.textLength = falseBoundaryEvidence.pdf.visibleText.text.length;
    falseBoundaryEvidence.pdf.visibleText.textSha256 = crypto.createHash('sha256').update(falseBoundaryEvidence.pdf.visibleText.text, 'utf8').digest('hex');
    writeEvidence(falseBoundaryEvidence);
    const falseBoundary = Checker.checkPackage(packageDir);
    assert.equal(falseBoundary.status, 'review', 'claimed calculation boundary is recomputed from canonical visible text');
    assert(
      falseBoundary.attachments[0].visibilityEvidence?.reasons.includes('visible-content-boundary'),
    );
    fs.writeFileSync(rendered.evidencePath, originalEvidenceJson, 'utf8');

    const approvalTamperedEvidence = JSON.parse(JSON.stringify(originalEvidence));
    const originalApprovalText = approvalTamperedEvidence.pdf.visibleText.text;
    approvalTamperedEvidence.pdf.visibleText.text = originalApprovalText.replace('2026/07/23 13:05:00', '2026/07/23 13:06:00');
    assert.notEqual(approvalTamperedEvidence.pdf.visibleText.text, originalApprovalText, 'approval time exists in canonical visible text');
    approvalTamperedEvidence.pdf.visibleText.textLength = approvalTamperedEvidence.pdf.visibleText.text.length;
    approvalTamperedEvidence.pdf.visibleText.textSha256 = crypto.createHash('sha256').update(approvalTamperedEvidence.pdf.visibleText.text, 'utf8').digest('hex');
    writeEvidence(approvalTamperedEvidence);
    const approvalTampered = Checker.checkPackage(packageDir);
    assert.equal(approvalTampered.status, 'review', 'PDF text metadata must agree with canonical visible DOM metadata');
    assert(
      approvalTampered.attachments[0].visibilityEvidence?.reasons.includes('pdf-visible-approvalTime-mismatch'),
    );
    fs.writeFileSync(rendered.evidencePath, originalEvidenceJson, 'utf8');

    const originalPdf = fs.readFileSync(rendered.pdfPath);
    fs.appendFileSync(rendered.pdfPath, '\n% sha-tamper\n', 'utf8');
    const tampered = Checker.checkPackage(packageDir);
    assert.equal(tampered.status, 'review', 'changing PDF bytes invalidates canonical evidence');
    assert(tampered.attachments[0].visibilityEvidence?.reasons.includes('artifactSha256'));
    fs.writeFileSync(rendered.pdfPath, originalPdf);

    fs.mkdirSync(reusedDir, { recursive: true });
    fs.copyFileSync(rendered.pdfPath, path.join(reusedDir, 'reused-report.pdf'));
    fs.copyFileSync(rendered.evidencePath, path.join(reusedDir, 'reused-report.evidence.json'));
    const reused = Checker.checkPackage(reusedDir);
    assert.equal(reused.status, 'review', 'evidence cannot be reused for a differently named artifact');
    assert(reused.attachments[0].visibilityEvidence?.reasons.includes('artifact'));
    console.log('attachment canonical render e2e OK');
  } finally {
    try { client?.close(); } catch {}
    if (edge?.pid) spawnSync('taskkill', ['/pid', String(edge.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    await delay(750);
    await removeTempDirectory(tempDir);
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
