/* 鋼筋混凝土工具箱 — 共用計算書產生器
 *
 * 用法:
 *   openReport({
 *     title: '梁設計計算書',
 *     subtitle: 'RC Beam Design Report',
 *     project: { name, no, designer, date },        // date 留白會自動填今天
 *     inputs:   [{ group, items:[{ label, value, unit }] }, ...],
 *     checks:   [{ group, items:[{ label, formula, sub, value, unit, ok, note }] }, ...],
 *     diagrams: [{ title, dataURL, caption, width }, ...],   // 斷面 / PM 曲線等示意圖
 *     summary:  { ok: true|false, text: '✓ OK / ✗ NG' }
 *   });
 *
 * 開啟一個新視窗呈現可列印 (A4) 計算書;
 * checks[].formula 顯示原式, sub 顯示代入值, value 顯示計算結果
 */

function showRcReportIssue(message) {
  if (typeof document === 'undefined' || !document.body) {
    if (typeof console !== 'undefined' && console.warn) console.warn(message);
    return;
  }
  let status = document.getElementById('rcSharedReportStatus');
  if (!status) {
    status = document.createElement('div');
    status.id = 'rcSharedReportStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.style.cssText = [
      'position:fixed',
      'right:18px',
      'bottom:18px',
      'z-index:9999',
      'max-width:min(420px, calc(100vw - 36px))',
      'padding:10px 12px',
      'border:1px solid #f59e0b',
      'border-radius:6px',
      'background:#fffbeb',
      'color:#7c2d12',
      'font:13px/1.5 "Segoe UI", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
      'box-shadow:0 8px 24px rgba(15, 23, 42, .16)'
    ].join(';');
    document.body.appendChild(status);
  }
  status.textContent = message;
}

function normalizeProjectFieldValue(value) {
  if (window.RCUI?.normalizeProjectFieldValue) {
    return window.RCUI.normalizeProjectFieldValue(value);
  }
  const text = String(value ?? '').trim();
  return text === '未填' ? '' : text;
}

function formatReportTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.getFullYear() + '/' +
    String(date.getMonth() + 1).padStart(2, '0') + '/' +
    String(date.getDate()).padStart(2, '0') + ' ' +
    String(date.getHours()).padStart(2, '0') + ':' +
    String(date.getMinutes()).padStart(2, '0') + ':' +
    String(date.getSeconds()).padStart(2, '0');
}

const RC_CALCULATION_BOOK_PAGE_ONLY_LABELS = Object.freeze([
  '輸入模式',
  '計算書模式',
  '換算對照',
  '流程顯示',
  '報表模式',
  '輸出設定',
  '報表內容',
  '輸出報表內容',
  '輸出報表流程',
  '計算流程輸出',
  '預計輸出符號',
  '預計輸出備註',
]);

function getRcCalculationBookInputGroups(groups) {
  return (Array.isArray(groups) ? groups : []).map((group) => ({
    ...group,
    items: (Array.isArray(group?.items) ? group.items : [])
      .filter((item) => !RC_CALCULATION_BOOK_PAGE_ONLY_LABELS.includes(String(item?.label || '').trim())),
  })).filter((group) => group.items.length > 0 && !RC_CALCULATION_BOOK_PAGE_ONLY_LABELS.includes(String(group.group || '').trim()));
}

function normalizeFingerprintValue(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalizeFingerprintValue);
  if (typeof value === 'object') {
    const normalized = {};
    Object.keys(value).sort().forEach((key) => {
      if (key === 'dataURL' || key === 'html') return;
      normalized[key] = normalizeFingerprintValue(value[key]);
    });
    return normalized;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return String(value);
}

function fingerprintHash(text, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function buildCalculationFingerprint(cfg) {
  if (cfg.calculationFingerprint) return String(cfg.calculationFingerprint);
  const snapshot = normalizeFingerprintValue({
    title: cfg.title || '',
    subtitle: cfg.subtitle || '',
    inputs: getRcCalculationBookInputGroups(cfg.inputs),
    checks: cfg.checks || [],
    summary: cfg.summary || {},
    steps: cfg.steps || [],
  });
  const source = JSON.stringify(snapshot);
  return `CF-${fingerprintHash(source, 0x811C9DC5)}${fingerprintHash(source, 0x9E3779B9)}`;
}

const RC_PROJECT_FINGERPRINT_IGNORED_KEYS = Object.freeze([
  'calculationFingerprint',
  'savedAt',
  'exportedAt',
  'generatedAt',
  'metadata',
  'schema',
  'tool',
  'toolTitle',
  'appVersion',
  'pageVersion',
  'projectName',
  'projectNo',
  'designer',
  'projName',
  'projNo',
  'projDesigner',
]);

function normalizeProjectFingerprintValue(value, ignoredKeys) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => normalizeProjectFingerprintValue(item, ignoredKeys));
  if (typeof value === 'object') {
    const normalized = {};
    Object.keys(value).sort().forEach((key) => {
      if (ignoredKeys.has(key) || key === 'dataURL' || key === 'html') return;
      normalized[key] = normalizeProjectFingerprintValue(value[key], ignoredKeys);
    });
    return normalized;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return String(value);
}

function buildProjectCalculationFingerprint(payload, options = {}) {
  const ignoredKeys = new Set([
    ...RC_PROJECT_FINGERPRINT_IGNORED_KEYS,
    ...(Array.isArray(options.ignoredKeys) ? options.ignoredKeys : []),
  ]);
  const toolId = typeof payload?.tool === 'string'
    ? payload.tool
    : String(payload?.tool?.id || '');
  const sourceState = {
    toolId,
    payload,
  };
  if (options.calculationContext !== undefined) {
    sourceState.calculationContext = options.calculationContext;
  }
  const snapshot = normalizeProjectFingerprintValue(sourceState, ignoredKeys);
  const source = JSON.stringify(snapshot);
  return `CF-${fingerprintHash(source, 0x811C9DC5)}${fingerprintHash(source, 0x9E3779B9)}`;
}

function withProjectCalculationFingerprint(payload, options = {}) {
  return {
    ...payload,
    calculationFingerprint: buildProjectCalculationFingerprint(payload, options),
  };
}

function normalizeProjectToolVersion(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^v?(\d+(?:\.\d+)*(?:[-+.\w]*)?)$/i);
  return match ? `V${match[1]}` : raw;
}

function validateProjectCalculationSource(raw, options = {}) {
  const fail = message => { throw new Error(`專案 JSON 驗證失敗：${message}`); };
  let payload;
  try {
    payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    fail('內容無法解析。');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('內容不是有效物件。');
  if (options.expectedSchema && payload.schema !== options.expectedSchema) fail('schema 或檔案版本不符。');
  const toolId = typeof payload.tool === 'string' ? payload.tool : String(payload.tool?.id || '');
  if (options.expectedToolId && toolId !== options.expectedToolId) fail(`工具種類不符（${toolId || '未提供'}）。`);
  const sourceVersion = normalizeProjectToolVersion(payload.appVersion || payload.tool?.pageVersion || payload.pageVersion);
  const expectedVersion = normalizeProjectToolVersion(options.expectedVersion);
  if (!sourceVersion) fail('缺少工具版本。');
  if (expectedVersion && sourceVersion !== expectedVersion) fail(`工具版本不符（來源 ${sourceVersion}，目前 ${expectedVersion}）。`);
  const sourceKey = options.sourceKey || 'fields';
  if (!payload[sourceKey] || typeof payload[sourceKey] !== 'object' || Array.isArray(payload[sourceKey])) {
    fail(`缺少可重現的 ${sourceKey} 輸入。`);
  }
  if (!/^CF-[0-9A-F]{16}$/.test(String(payload.calculationFingerprint || ''))) fail('計算指紋格式不正確。');
  const fingerprintOptions = typeof options.fingerprintOptions === 'function'
    ? options.fingerprintOptions(payload)
    : (options.fingerprintOptions || {});
  const expectedFingerprint = buildProjectCalculationFingerprint(payload, fingerprintOptions);
  if (expectedFingerprint !== payload.calculationFingerprint) {
    fail(`來源內容與計算指紋不一致（來源 ${payload.calculationFingerprint}，驗證 ${expectedFingerprint}）。`);
  }
  return payload;
}

function assertProjectCalculationReplay(source, replayed) {
  const sourceFingerprint = String(source?.calculationFingerprint || '');
  const replayedFingerprint = String(replayed?.calculationFingerprint || '');
  if (!sourceFingerprint || sourceFingerprint !== replayedFingerprint) {
    throw new Error(`專案 JSON 重現失敗：來源 ${sourceFingerprint || '未提供'}，重算 ${replayedFingerprint || '無法計算'}。`);
  }
  return replayed;
}

if (typeof window !== 'undefined') {
  window.RCReportFingerprint = Object.assign(window.RCReportFingerprint || {}, {
    buildProjectCalculationFingerprint,
    withProjectCalculationFingerprint,
    validateProjectCalculationSource,
    assertProjectCalculationReplay,
  });
}

function getReportSourceTrace(cfg) {
  const configured = cfg.outputSource && typeof cfg.outputSource === 'object' ? cfg.outputSource : {};
  const documentTitle = typeof document !== 'undefined' ? String(document.title || '').trim() : '';
  const rawTool = String(configured.tool || cfg.toolName || documentTitle || cfg.title || '').trim();
  const versionMatch = rawTool.match(/(?:^|\s)(V\d+(?:\.\d+)*(?:[-+.\w]*)?)(?=\s|$)/i);
  const version = String(configured.version || cfg.toolVersion || versionMatch?.[1] || '').trim();
  const tool = rawTool.replace(/\s*V\d+(?:\.\d+)*(?:[-+.\w]*)?\s*$/i, '').trim() || String(cfg.title || '').trim();
  return { tool, version };
}

const RC_ATTACHMENT_APPROVAL_REPORT_CSS = `
.rep-attachment-approval-source, .rep-content-seal-source, .rep-approval-seal-source { display:none !important; }
.rep-toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:6px; }
.rep-toolbar .rep-window-status { flex:1 0 100%; }
.rep-approval-control { display:inline-flex; align-items:center; gap:6px; margin-right:10px; padding:7px 10px;
  border:1px solid #94a3b8; border-radius:4px; background:#fff; color:#1f2937; font-size:12px; cursor:pointer; }
.rep-approval-control input { width:16px; height:16px; margin:0; accent-color:#166534; }
.rep-approval-meta-control { display:inline-flex; flex-wrap:wrap; align-items:center; gap:6px; margin-right:10px; color:#334155; font-size:12px; }
.rep-approval-meta-control label { display:inline-flex; align-items:center; gap:4px; }
.rep-approval-meta-control input { width:118px; min-width:0; padding:6px 7px; border:1px solid #94a3b8; border-radius:4px; font:inherit; }
.rep-approval-meta-control input[data-approval-field="basis"] { width:180px; }
.rep-approval-meta-hint { flex:1 0 100%; color:#92400e; font-size:11px; line-height:1.35; }
.rep-document-status-line { display:block; margin-bottom:3mm; color:#4b5563; font-weight:600; }
.rep-content-integrity-status { display:block; margin-top:6px; color:#166534; font-size:12px; font-weight:700; }
.rep-content-integrity-status[data-integrity-status="failed"] { color:#b91c1c; }
.rep-content-integrity-status[data-integrity-status="unsealed"] { color:#92400e; }
.rep-content-integrity-alert { display:block; margin:0 0 8mm; padding:4mm; border:2px solid #b91c1c;
  color:#991b1b; background:#fef2f2; font-weight:800; }
.rep-footer-separator { display:block; height:4mm; }
.rep-footer-copyright { display:block; }
.rep-footer { break-inside:avoid-page; page-break-inside:avoid; }
.rep-document-status-line[data-document-class="formal-attachment"] { color:#14532d; }
@media print { .rep-toolbar, .rep-approval-control, .rep-approval-meta-control, .rep-content-integrity-status { display:none !important; } }`;

function buildRcAttachmentApprovalReport(options = {}) {
  const approved = options.approved === true;
  const fingerprint = String(options.calculationFingerprint || '').trim();
  const approvedAt = String(options.approvedAt || '').trim();
  const approvedBy = String(options.approvedBy || '').trim();
  const approvalBasis = String(options.approvalBasis || '').trim();
  const esc = s => (s === null || s === undefined ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<style data-formal-document-state-style>${RC_ATTACHMENT_APPROVAL_REPORT_CSS}</style>
    <span class="rep-attachment-approval-source" data-initial-approved="${approved ? 'true' : 'false'}" data-calculation-fingerprint="${esc(fingerprint)}" data-approved-at="${esc(approvedAt)}" data-approved-by="${esc(approvedBy)}" data-approval-basis="${esc(approvalBasis)}" aria-hidden="true"></span>
    <span class="rep-content-seal-source" data-content-seal-scope="rc-calculation-book-content-v1" data-content-sha256="" aria-hidden="true"></span>
    <span class="rep-approval-seal-source" data-approval-seal-scope="rc-calculation-book-approval-v2" data-approval-sha256="" aria-hidden="true"></span>
    <script data-attachment-approval-script>
    (function () {
      var CONTENT_SEAL_START = '<!--rc-content-seal:start-->';
      var CONTENT_SEAL_END = '<!--rc-content-seal:end-->';
      function canonicalSealedContent(serializedHtml) {
        var text = String(serializedHtml || '');
        var start = text.lastIndexOf(CONTENT_SEAL_START);
        var end = text.lastIndexOf(CONTENT_SEAL_END);
        if (start < 0 || end < 0 || end <= start) return '';
        return text.slice(start + CONTENT_SEAL_START.length, end)
          .replace(/<span\\b(?=[^>]*\\brep-document-status-line\\b)[^>]*>[\\s\\S]*?<\\/span>/i, '<span class="rep-document-status-line"></span>');
      }
      function canonicalApprovalPayload(serializedHtml) {
        var parsed = new DOMParser().parseFromString(String(serializedHtml || ''), 'text/html');
        var sources = parsed.querySelectorAll('.rep-attachment-approval-source');
        var statuses = parsed.querySelectorAll('.rep-document-status-line');
        var contentSeals = parsed.querySelectorAll('.rep-content-seal-source');
        var titles = parsed.querySelectorAll('title');
        if (sources.length !== 1 || statuses.length !== 1 || contentSeals.length !== 1 || titles.length !== 1) return '';
        var approvalSource = sources[0];
        var statusSource = statuses[0];
        function clean(value) { return String(value || '').replace(/\\s+/g, ' ').trim(); }
        return JSON.stringify({
          scope:'rc-calculation-book-approval-v2',
          reportTitle:clean(approvalSource.dataset.reportTitle),
          calculationFingerprint:clean(approvalSource.dataset.calculationFingerprint),
          sourceApproved:clean(approvalSource.dataset.initialApproved),
          sourceApprovedAt:clean(approvalSource.dataset.approvedAt),
          sourceApprovedBy:clean(approvalSource.dataset.approvedBy),
          sourceApprovalBasis:clean(approvalSource.dataset.approvalBasis),
          documentClass:clean(statusSource.dataset.documentClass),
          statusApproved:clean(statusSource.dataset.approved),
          statusApprovedAt:clean(statusSource.dataset.approvedAt),
          statusApprovedBy:clean(statusSource.dataset.approvedBy),
          statusApprovalBasis:clean(statusSource.dataset.approvalBasis),
          statusText:clean(statusSource.textContent),
          documentTitle:clean(titles[0].textContent),
          contentSha256:clean(contentSeals[0].dataset.contentSha256).toLowerCase()
        });
      }
      function sha256Fallback(value) {
        var bytes = typeof TextEncoder === 'function'
          ? Array.from(new TextEncoder().encode(String(value || '')))
          : Array.from(unescape(encodeURIComponent(String(value || '')))).map(function (char) { return char.charCodeAt(0); });
        var bitLength = bytes.length * 8;
        bytes.push(128);
        while (bytes.length % 64 !== 56) bytes.push(0);
        var high = Math.floor(bitLength / 4294967296);
        var low = bitLength >>> 0;
        [high, low].forEach(function (word) {
          bytes.push((word >>> 24) & 255, (word >>> 16) & 255, (word >>> 8) & 255, word & 255);
        });
        var h = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
        var k = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
        function rotr(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
        for (var offset = 0; offset < bytes.length; offset += 64) {
          var w = new Array(64);
          for (var index = 0; index < 16; index += 1) {
            var pos = offset + index * 4;
            w[index] = ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
          }
          for (var wi = 16; wi < 64; wi += 1) {
            var s0 = rotr(w[wi - 15], 7) ^ rotr(w[wi - 15], 18) ^ (w[wi - 15] >>> 3);
            var s1 = rotr(w[wi - 2], 17) ^ rotr(w[wi - 2], 19) ^ (w[wi - 2] >>> 10);
            w[wi] = (w[wi - 16] + s0 + w[wi - 7] + s1) >>> 0;
          }
          var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
          for (var round = 0; round < 64; round += 1) {
            var sum1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            var choice = (e & f) ^ ((~e) & g);
            var temp1 = (hh + sum1 + choice + k[round] + w[round]) >>> 0;
            var sum0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            var majority = (a & b) ^ (a & c) ^ (b & c);
            var temp2 = (sum0 + majority) >>> 0;
            hh = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
          }
          h = [(h[0] + a) >>> 0, (h[1] + b) >>> 0, (h[2] + c) >>> 0, (h[3] + d) >>> 0,
            (h[4] + e) >>> 0, (h[5] + f) >>> 0, (h[6] + g) >>> 0, (h[7] + hh) >>> 0];
        }
        return h.map(function (word) { return word.toString(16).padStart(8, '0'); }).join('');
      }
      async function sha256Text(value) {
        if (!window.crypto || !window.crypto.subtle || typeof TextEncoder !== 'function') return sha256Fallback(value);
        var digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
        return Array.from(new Uint8Array(digest)).map(function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('');
      }
      function initAttachmentApproval() {
        var source = document.querySelector('.rep-attachment-approval-source');
        if (!source || source.dataset.initialized === 'true') return;
        source.dataset.initialized = 'true';
        var toolbar = document.querySelector('.rep-toolbar, .toolbar');
        var sealSource = document.querySelector('.rep-content-seal-source');
        var approvalSealSource = document.querySelector('.rep-approval-seal-source');
        var initialSerializedHtml = document.documentElement ? document.documentElement.outerHTML : '';
        var footer = document.querySelector('.rep-footer');
        var paper = document.querySelector('.rep-paper, .paper') || document.body;
        Array.from(document.querySelectorAll('.rep-meta div, .meta div')).forEach(function (row) {
          var text = String(row.textContent || '').replace(/\s+/g, ' ').trim();
          if (/^(計畫名稱|計畫編號|設計人員)\s*[—-]$/.test(text)) row.hidden = true;
        });
        if (!footer) {
          footer = document.createElement('div');
          footer.className = 'rep-footer';
          paper.appendChild(footer);
        }
        var fingerprint = source.dataset.calculationFingerprint || '';
        var reportHeading = document.querySelector('.rep-header h1, .header h1, h1');
        var reportTitle = String(source.dataset.reportTitle || (reportHeading && reportHeading.textContent) || document.title || '計算書').trim();
        source.dataset.reportTitle = reportTitle;
        function buildArtifactBaseName(documentLabel) {
          return [reportTitle, documentLabel, fingerprint].filter(Boolean).join('_')
            .replace(/[<>:"/|?*]/g, '-').split(String.fromCharCode(92)).join('-').trim();
        }
        var status = document.querySelector('.rep-document-status-line');
        if (!status) {
          status = document.createElement('span');
          status.className = 'rep-document-status-line';
          footer.insertBefore(status, footer.firstChild);
        }
        var checkbox = document.getElementById('repAttachmentApproval');
        if (!checkbox && toolbar) {
          var label = document.createElement('label');
          label.className = 'rep-approval-control';
          checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = 'repAttachmentApproval';
          checkbox.setAttribute('aria-label', '核可為正式附件');
          label.appendChild(checkbox);
          label.appendChild(document.createTextNode('本計算內容已完成審閱，核可作為正式附件'));
          toolbar.insertBefore(label, toolbar.firstChild);
        }
        if (!checkbox) return;
        var approvalMetaControl = document.querySelector('.rep-approval-meta-control');
        var approvedByInput = document.getElementById('repAttachmentApprovedBy');
        var approvalBasisInput = document.getElementById('repAttachmentApprovalBasis');
        if (!approvalMetaControl && toolbar) {
          approvalMetaControl = document.createElement('span');
          approvalMetaControl.className = 'rep-approval-meta-control';
          var approvedByLabel = document.createElement('label');
          approvedByLabel.appendChild(document.createTextNode('核可人（選填）'));
          approvedByInput = document.createElement('input');
          approvedByInput.type = 'text';
          approvedByInput.id = 'repAttachmentApprovedBy';
          approvedByInput.maxLength = 80;
          approvedByInput.dataset.approvalField = 'approvedBy';
          approvedByInput.setAttribute('aria-label', '核可人，選填');
          approvedByLabel.appendChild(approvedByInput);
          var approvalBasisLabel = document.createElement('label');
          approvalBasisLabel.appendChild(document.createTextNode('核可依據（選填）'));
          approvalBasisInput = document.createElement('input');
          approvalBasisInput.type = 'text';
          approvalBasisInput.id = 'repAttachmentApprovalBasis';
          approvalBasisInput.maxLength = 160;
          approvalBasisInput.dataset.approvalField = 'basis';
          approvalBasisInput.setAttribute('aria-label', '核可依據，選填');
          approvalBasisLabel.appendChild(approvalBasisInput);
          var approvalMetaHint = document.createElement('small');
          approvalMetaHint.className = 'rep-approval-meta-hint';
          approvalMetaHint.id = 'repApprovalMetaHint';
          approvalMetaHint.textContent = '核可後修改上述紀錄會撤銷正式核可，需重新勾選。';
          approvedByInput.setAttribute('aria-describedby', approvalMetaHint.id);
          approvalBasisInput.setAttribute('aria-describedby', approvalMetaHint.id);
          approvalMetaControl.appendChild(approvedByLabel);
          approvalMetaControl.appendChild(approvalBasisLabel);
          approvalMetaControl.appendChild(approvalMetaHint);
          toolbar.insertBefore(approvalMetaControl, label.nextSibling);
        }
        function refreshIntegrityAlert() {
          var contentFailed = document.body.dataset.contentIntegrity === 'failed';
          var approvalFailed = document.body.dataset.approvalIntegrity === 'failed';
          var alert = document.querySelector('.rep-content-integrity-alert');
          if (contentFailed || approvalFailed) {
            if (!alert) {
              alert = document.createElement('div');
              alert.className = 'rep-content-integrity-alert';
              paper.insertBefore(alert, paper.firstChild);
            }
            alert.textContent = contentFailed
              ? '內容完整性異常：本 HTML 的計算內容與下載時封印不一致，請勿作為正式附件。'
              : '核可完整性異常：本 HTML 的核可狀態、時間或文件識別與下載時封印不一致，請勿作為正式附件。';
          } else if (alert) alert.remove();
        }
        function setIntegrityStatus(kind, statusValue, message) {
          var datasetKey = kind === 'approval' ? 'approvalIntegrity' : 'contentIntegrity';
          document.body.dataset[datasetKey] = statusValue;
          var target = document.querySelector('.rep-content-integrity-status[data-integrity-kind="' + kind + '"]');
          if (!target && toolbar) {
            target = document.createElement('span');
            target.className = 'rep-content-integrity-status';
            target.dataset.integrityKind = kind;
            toolbar.appendChild(target);
          }
          if (target) {
            target.dataset.integrityStatus = statusValue;
            target.textContent = message;
          }
          refreshIntegrityAlert();
        }
        async function verifySavedContentSeal(serializedHtml) {
          var expected = String(sealSource && sealSource.dataset.contentSha256 || '').trim().toLowerCase();
          if (!expected) return { status:'unsealed', expected:'', actual:'' };
          var sealedContent = canonicalSealedContent(serializedHtml || initialSerializedHtml || (document.documentElement && document.documentElement.outerHTML));
          if (!sealedContent) {
            setIntegrityStatus('content', 'failed', '內容完整性：異常（找不到封印範圍）');
            return { status:'failed', expected:expected, actual:'' };
          }
          try {
            var actual = await sha256Text(sealedContent);
            var pass = actual === expected;
            setIntegrityStatus('content', pass ? 'verified' : 'failed', pass
              ? '內容完整性：已驗證（SHA-256 內容封印；非數位簽章）'
              : '內容完整性：異常，計算內容已與下載時不同');
            return { status:pass ? 'verified' : 'failed', expected:expected, actual:actual };
          } catch (error) {
            setIntegrityStatus('content', 'failed', '內容完整性：無法驗證（' + (error && error.message || error) + '）');
            return { status:'failed', expected:expected, actual:'', error:String(error && error.message || error) };
          }
        }
        async function verifySavedApprovalSeal(serializedHtml) {
          var expected = String(approvalSealSource && approvalSealSource.dataset.approvalSha256 || '').trim().toLowerCase();
          if (!expected) {
            setIntegrityStatus('approval', 'unsealed', '核可完整性：舊版未封印，作為正式附件前需複核');
            return { status:'unsealed', expected:'', actual:'' };
          }
          var payload = canonicalApprovalPayload(serializedHtml || initialSerializedHtml || (document.documentElement && document.documentElement.outerHTML));
          if (!payload) {
            setIntegrityStatus('approval', 'failed', '核可完整性：異常（核可欄位不完整）');
            return { status:'failed', expected:expected, actual:'' };
          }
          try {
            var actual = await sha256Text(payload);
            var pass = actual === expected;
            setIntegrityStatus('approval', pass ? 'verified' : 'failed', pass
              ? '核可完整性：已驗證（SHA-256 核可封印；非數位簽章）'
              : '核可完整性：異常，核可狀態或文件識別已與下載時不同');
            return { status:pass ? 'verified' : 'failed', expected:expected, actual:actual };
          } catch (error) {
            setIntegrityStatus('approval', 'failed', '核可完整性：無法驗證（' + (error && error.message || error) + '）');
            return { status:'failed', expected:expected, actual:'', error:String(error && error.message || error) };
          }
        }
        async function serializeCurrentReportHtml() {
          var root = document.documentElement ? document.documentElement.cloneNode(true) : null;
          if (!root) return '';
          var savedSource = root.querySelector('.rep-attachment-approval-source');
          if (savedSource) savedSource.removeAttribute('data-initialized');
          root.querySelectorAll('.rep-approval-control, .rep-approval-meta-control, .rep-download-control').forEach(function (node) {
            node.remove();
          });
          root.querySelectorAll('.rep-window-status').forEach(function (node) {
            node.textContent = '';
          });
          Array.from(root.querySelectorAll('.rep-document-status-line')).slice(1).forEach(function (node) {
            node.remove();
          });
          var savedBody = root.querySelector('body');
          if (savedBody) savedBody.removeAttribute('data-document-class');
          if (savedBody) savedBody.removeAttribute('data-content-integrity');
          if (savedBody) savedBody.removeAttribute('data-approval-integrity');
          root.querySelectorAll('.rep-content-integrity-status').forEach(function (node) { node.remove(); });
          root.querySelectorAll('.rep-content-integrity-alert').forEach(function (node) { node.remove(); });
          var savedSealSource = root.querySelector('.rep-content-seal-source');
          var sealedContent = canonicalSealedContent(root.outerHTML);
          if (!savedSealSource || !sealedContent) throw new Error('無法建立 RC 計算書內容封印');
          savedSealSource.dataset.contentSha256 = await sha256Text(sealedContent);
          var savedApprovalSealSource = root.querySelector('.rep-approval-seal-source');
          var approvalPayload = canonicalApprovalPayload(root.outerHTML);
          if (!savedApprovalSealSource || !approvalPayload) throw new Error('無法建立 RC 計算書核可封印');
          savedApprovalSealSource.dataset.approvalSha256 = await sha256Text(approvalPayload);
          return '<!doctype html>' + String.fromCharCode(10) + root.outerHTML;
        }
        function showDownloadStatus(message) {
          var messageTarget = document.getElementById('repWindowStatus') || document.querySelector('.rep-window-status');
          if (messageTarget) messageTarget.textContent = message;
        }
        async function downloadCurrentReportHtml() {
          var html = await serializeCurrentReportHtml();
          if (!html) {
            showDownloadStatus('無法建立下載檔案，請改用列印 / 存 PDF。');
            return;
          }
          var currentStatus = document.querySelector('.rep-document-status-line');
          var documentLabel = currentStatus && currentStatus.dataset.documentClass === 'formal-attachment' ? '正式附件' : '內部審閱';
          var fileName = buildArtifactBaseName(documentLabel) + '.html';
          var url = URL.createObjectURL(new Blob([html], { type:'text/html;charset=utf-8' }));
          var link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          showDownloadStatus('已下載' + documentLabel + ' HTML；檔案保留核可狀態、時間、選填核可紀錄、計算指紋與獨立 SHA-256 內容／核可封印。');
        }
        window.serializeReportDocumentHtml = serializeCurrentReportHtml;
        window.downloadReportHtml = downloadCurrentReportHtml;
        var downloadButton = document.getElementById('repDownloadCurrentHtml');
        if (!downloadButton && toolbar) {
          downloadButton = document.createElement('button');
          downloadButton.type = 'button';
          downloadButton.id = 'repDownloadCurrentHtml';
          downloadButton.className = 'rep-download-control';
          downloadButton.textContent = '⬇ 下載目前版本 HTML';
          downloadButton.addEventListener('click', function () {
            downloadCurrentReportHtml().catch(function (error) {
              showDownloadStatus('無法下載 HTML：' + (error && error.message || error));
            });
          });
          var approvalControl = checkbox.closest('.rep-approval-control');
          toolbar.insertBefore(downloadButton, approvalControl ? approvalControl.nextSibling : toolbar.firstChild);
        }
        checkbox.checked = source.dataset.initialApproved === 'true';
        var approvedAtValue = source.dataset.approvedAt || '';
        if (approvedByInput) approvedByInput.value = source.dataset.approvedBy || '';
        if (approvalBasisInput) approvalBasisInput.value = source.dataset.approvalBasis || '';
        function formatApprovedAt(value) {
          var d = new Date(value);
          return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-TW', { timeZone:'Asia/Taipei', hour12:false }) : value;
        }
        function updateStatus() {
          if (checkbox.checked && !approvedAtValue) approvedAtValue = new Date().toISOString();
          if (!checkbox.checked) approvedAtValue = '';
          source.dataset.initialApproved = checkbox.checked ? 'true' : 'false';
          source.dataset.approvedAt = approvedAtValue;
          source.dataset.approvedBy = approvedByInput ? approvedByInput.value.replace(/\s+/g, ' ').trim() : '';
          source.dataset.approvalBasis = approvalBasisInput ? approvalBasisInput.value.replace(/\s+/g, ' ').trim() : '';
          if (checkbox.checked) checkbox.setAttribute('checked', 'checked');
          else checkbox.removeAttribute('checked');
          var parts = checkbox.checked
            ? ['文件狀態：正式附件', approvedAtValue ? '核可時間：' + formatApprovedAt(approvedAtValue) : '']
            : ['文件狀態：內部審閱'];
          if (checkbox.checked && source.dataset.approvedBy) parts.push('核可人：' + source.dataset.approvedBy);
          if (checkbox.checked && source.dataset.approvalBasis) parts.push('核可依據：' + source.dataset.approvalBasis);
          if (fingerprint) parts.push('計算指紋：' + fingerprint);
          status.textContent = parts.filter(Boolean).join('｜');
          status.dataset.documentClass = checkbox.checked ? 'formal-attachment' : 'internal-review';
          status.dataset.approved = checkbox.checked ? 'true' : 'false';
          status.dataset.approvedAt = approvedAtValue;
          status.dataset.approvedBy = checkbox.checked ? source.dataset.approvedBy : '';
          status.dataset.approvalBasis = checkbox.checked ? source.dataset.approvalBasis : '';
          document.body.dataset.documentClass = status.dataset.documentClass;
          document.title = buildArtifactBaseName(checkbox.checked ? '正式附件' : '內部審閱');
        }
        function updateApprovalMetadata() {
          var revoked = checkbox.checked;
          if (revoked) {
            checkbox.checked = false;
            approvedAtValue = '';
            checkbox.removeAttribute('checked');
          }
          updateStatus();
          if (revoked) {
            var revokedMessage = '核可紀錄已異動，正式核可已撤銷；請確認後重新勾選。';
            if (approvalMetaHint) approvalMetaHint.textContent = revokedMessage;
            showDownloadStatus(revokedMessage);
          }
        }
        function updateApprovalState() {
          if (approvalMetaHint) approvalMetaHint.textContent = '核可後修改上述紀錄會撤銷正式核可，需重新勾選。';
          updateStatus();
        }
        checkbox.addEventListener('change', updateApprovalState);
        if (approvedByInput) approvedByInput.addEventListener('input', updateApprovalMetadata);
        if (approvalBasisInput) approvalBasisInput.addEventListener('input', updateApprovalMetadata);
        updateApprovalState();
        window.verifyReportContentSeal = verifySavedContentSeal;
        window.verifyReportApprovalSeal = verifySavedApprovalSeal;
        verifySavedContentSeal(initialSerializedHtml);
        verifySavedApprovalSeal(initialSerializedHtml);
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAttachmentApproval, { once:true });
      else initAttachmentApproval();
    })();
    <\/script>`;
}

if (typeof window !== 'undefined') {
  window.RCUI = window.RCUI || {};
  window.RCUI.buildAttachmentApprovalReport = buildRcAttachmentApprovalReport;
}

function openReport(cfg) {
  const today = new Date();
  const todayStr = today.getFullYear() + '/' +
                   String(today.getMonth()+1).padStart(2,'0') + '/' +
                   String(today.getDate()).padStart(2,'0');
  const proj = Object.assign({ name:'', no:'', designer:'', date: todayStr }, cfg.project || {});
  proj.name = normalizeProjectFieldValue(proj.name);
  proj.no = normalizeProjectFieldValue(proj.no);
  proj.designer = normalizeProjectFieldValue(proj.designer);
  const reportGeneratedAt = formatReportTimestamp(today);
  const calculationFingerprint = buildCalculationFingerprint(cfg);
  const sourceTrace = getReportSourceTrace(cfg);
  const initialApproval = cfg.documentApproval && typeof cfg.documentApproval === 'object'
    ? cfg.documentApproval
    : (cfg.attachmentApproval && typeof cfg.attachmentApproval === 'object' ? cfg.attachmentApproval : {});
  const approved = initialApproval.approved === true;
  const documentClass = {
    key: approved ? 'formal-attachment' : 'internal-review',
    label: approved ? '正式附件' : '內部審閱'
  };
  const approvalHtml = buildRcAttachmentApprovalReport({
    approved,
    calculationFingerprint,
    approvedAt: initialApproval.approvedAt,
    approvedBy: initialApproval.approvedBy,
    approvalBasis: initialApproval.approvalBasis
  });

  const esc = s => (s===null||s===undefined?'':String(s))
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const checkGroupTitle = value => {
    const label = String(value || '').trim();
    return /(?:檢核|結果)(?:\s*[（(].*[）)])?$/.test(label) ? label : `${label}｜檢核結果`;
  };
  const calculationStepTitle = (value, index) => {
    const label = String(value || '').trim();
    return /^\d+(?:\.\d+)*[.、]\s*/.test(label) ? label : `${index + 1}. ${label}`;
  };

  const inputsHtml = getRcCalculationBookInputGroups(cfg.inputs).map(g => `
    <section class="rep-block${g.keepTogether ? ' rep-block--keep' : ''}">
      <h3>${esc(g.group)}</h3>
      <table class="rep-input">
        <thead><tr><th>項目</th><th>採用值</th></tr></thead>
        <tbody>
          ${g.items.map(it => `
            <tr>
              <th>${esc(it.label)}</th>
              <td><span class="val">${esc(it.value)}</span> <span class="unit">${esc(it.unit||'')}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  `).join('');

  const checksHtml = (cfg.checks || []).map((g, index, groups) => `
    <section class="rep-block${index === groups.length - 1 ? ' rep-block--last-check' : ''}${index === groups.length - 1 && g.items.length <= 5 ? ' rep-block--short-tail' : ''}">
      <h3>${esc(checkGroupTitle(g.group))}</h3>
      <table class="rep-check">
        <thead>
          <tr><th>檢核項</th><th>公式</th><th>代入值</th><th>結果</th><th>OK?</th></tr>
        </thead>
        <tbody>
          ${g.items.map(it => {
            const ok = it.ok===true ? '✓ OK' : it.ok===false ? '✗ NG' : (it.ok===null||it.ok===undefined?'—':String(it.ok));
            const cls = it.ok===true?'ok':it.ok===false?'ng':'na';
            return `<tr class="${cls}">
              <td class="lbl">${esc(it.label)}${it.note?`<div class="note">${esc(it.note)}</div>`:''}</td>
              <td class="formula">${esc(it.formula||'—')}</td>
              <td class="sub">${esc(it.sub||'—')}</td>
              <td class="value">${esc(it.value||'—')} <span class="unit">${esc(it.unit||'')}</span></td>
              <td class="judge">${ok}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </section>
  `).join('');

  const diagramsHtml = (cfg.diagrams && cfg.diagrams.length) ? `
    <section class="rep-block rep-diagrams">
      <h3>斷面示意圖</h3>
      <div class="rep-diagrams-grid">
        ${cfg.diagrams.map(d => `
          <figure class="rep-diagram">
            ${d.title ? `<figcaption class="rep-diagram-title">${esc(d.title)}</figcaption>` : ''}
            <img src="${d.dataURL}" alt="${esc(d.title||'')}" style="${d.width?`max-width:${d.width}px;`:''}">
            ${d.caption ? `<div class="rep-diagram-caption">${esc(d.caption)}</div>` : ''}
          </figure>
        `).join('')}
      </div>
    </section>` : '';

  const stepsHtml = (cfg.steps && cfg.steps.length) ? `
    <section class="rep-block rep-steps-wrap">
      <h3>計算過程明細</h3>
      ${cfg.steps.map((s, index) => `
        <div class="rep-step">
          <h4>${esc(calculationStepTitle(s.group, index))}</h4>
          <pre class="rep-step-body">${esc(s.body)}</pre>
        </div>
      `).join('')}
    </section>` : '';

  const hasSummary = cfg.summary !== false;
  const summary = hasSummary ? (cfg.summary || {}) : {};
  const summaryCls = summary.ok===true?'ok':summary.ok===false?'ng':'na';
  const summaryHtml = hasSummary
    ? `<div class="rep-summary ${summaryCls}">${esc(summary.text || '—')}</div>`
    : '';
  const documentStateHtml = approvalHtml;
  const initialApprovedAt = String(initialApproval.approvedAt || '').trim();
  const initialDocumentStatusParts = approved
    ? ['文件狀態：正式附件', initialApprovedAt ? `核可時間：${initialApprovedAt}` : '']
    : ['文件狀態：內部審閱'];
  const initialApprovedBy = String(initialApproval.approvedBy || '').trim();
  const initialApprovalBasis = String(initialApproval.approvalBasis || '').trim();
  if (approved && initialApprovedBy) initialDocumentStatusParts.push(`核可人：${initialApprovedBy}`);
  if (approved && initialApprovalBasis) initialDocumentStatusParts.push(`核可依據：${initialApprovalBasis}`);
  initialDocumentStatusParts.push(`計算指紋：${calculationFingerprint}`);
  const initialDocumentStatusHtml = `<span class="rep-document-status-line" data-document-class="${esc(documentClass.key)}" data-approved="${approved ? 'true' : 'false'}" data-approved-at="${esc(initialApprovedAt)}" data-approved-by="${esc(approved ? initialApprovedBy : '')}" data-approval-basis="${esc(approved ? initialApprovalBasis : '')}">${esc(initialDocumentStatusParts.filter(Boolean).join('｜'))}</span>`;

  const html = `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<title>${esc(cfg.title || '計算書')}</title>
<style>
@page { size: A4 portrait; margin: 18mm 14mm 18mm; }
* { box-sizing: border-box; }
body { font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", system-ui, sans-serif;
       color:#111; margin:0; padding:24px; background:#f4f4f4; }
.rep-paper { max-width: 800px; margin:0 auto; background:#fff; padding:32px 36px;
             box-shadow:0 2px 12px rgba(0,0,0,.08); }
.rep-header { border-bottom:3px double #222; padding-bottom:12px; margin-bottom:16px; }
.rep-header h1 { margin:0 0 4px; font-size:22px; }
.rep-header .sub { color:#555; font-size:13px; }
${RC_ATTACHMENT_APPROVAL_REPORT_CSS}
.rep-meta { display:grid; grid-template-columns:repeat(2,1fr); gap:6px 24px;
            font-size:12px; margin:14px 0 18px; }
.rep-meta--traceable { grid-template-columns:repeat(3,1fr); gap:6px 14px; }
.rep-meta div { border-bottom:1px dotted #888; padding:4px 0; }
.rep-meta b { display:inline-block; min-width:64px; color:#444; }
.rep-block { margin:14px 0 18px; }
.rep-block h3 { font-size:14px; margin:0 0 6px; padding:4px 8px;
                background:#1a3d5c; color:#fff; border-radius:3px 3px 0 0; }
table { width:100%; border-collapse:collapse; font-size:12px; }
.rep-input th, .rep-input td { border:1px solid #888; padding:5px 8px; }
.rep-input th { background:#eef2f6; text-align:left; width:38%; font-weight:600; }
.rep-input .val { font-weight:600; }
.rep-input .unit { color:#666; font-size:11px; margin-left:4px; }
.rep-check th, .rep-check td { border:1px solid #888; padding:5px 6px; vertical-align:top; }
.rep-check th { background:#eef2f6; font-weight:600; text-align:center; font-size:11px; }
.rep-check td.lbl { width:18%; font-weight:600; }
.rep-check td.formula { width:24%; font-family:"Cambria Math","Times New Roman",serif; font-style:italic; }
.rep-check td.sub { width:30%; font-family:"Consolas",monospace; font-size:11px; color:#333; white-space:pre-wrap; word-break:break-word; }
.rep-check td.value { width:14%; font-weight:600; text-align:right; }
.rep-check td.judge { width:10%; text-align:center; font-weight:700; }
.rep-check tr.ok td.judge { color:#1b8a3a; }
.rep-check tr.ng td.judge { color:#c0392b; }
.rep-check tr.ng td.lbl { color:#c0392b; }
.rep-check .note { font-weight:400; font-size:10px; color:#666; margin-top:2px; }
.rep-step { margin:10px 0 14px; page-break-inside: avoid; }
.rep-step h4 { margin:0 0 4px; padding:3px 8px; font-size:12px;
               background:#ede9fe; color:#5b21b6; border-left:3px solid #7c3aed; }
.rep-step-body { white-space:pre-wrap; word-break:break-word;
                 font-family:"Consolas","Cascadia Code",monospace; font-size:11px;
                 line-height:1.55; background:#faf5ff; border:1px solid #e9d5ff;
                 border-radius:4px; padding:8px 10px; margin:0; color:#3b0764; }
.rep-summary { margin:12px 0 20px; padding:14px 18px; border-radius:5px;
               font-size:18px; font-weight:700; text-align:center; }
.rep-summary.ok { background:#e8f5ec; color:#1b8a3a; border:2px solid #1b8a3a; }
.rep-summary.ng { background:#fbeaea; color:#c0392b; border:2px solid #c0392b; }
.rep-summary.na { background:#f0f0f0; color:#555; border:2px solid #888; }
.rep-diagrams-grid { display:flex; flex-wrap:wrap; gap:14px; justify-content:center; }
.rep-diagram { margin:0; padding:8px 10px; border:1px solid #cbd5e1; border-radius:4px;
               background:#fafbfc; text-align:center; page-break-inside: avoid; flex:0 0 auto; }
.rep-diagram-title { font-size:12px; font-weight:600; color:#1a3d5c; margin-bottom:4px; }
.rep-diagram img { max-width:100%; height:auto; display:block; margin:0 auto; }
.rep-diagram-caption { font-size:10px; color:#666; margin-top:4px; font-style:italic; }
.rep-toolbar { max-width:800px; margin:0 auto 12px; text-align:right; }
.rep-toolbar button { background:#1a3d5c; color:#fff; border:0; padding:8px 18px;
                      font-size:13px; border-radius:4px; cursor:pointer; margin-left:6px; }
.rep-toolbar button:hover { background:#27567c; }
.rep-window-status { display:block; margin-top:8px; color:#7c2d12; font-size:12px; line-height:1.45; min-height:18px; }
.rep-footer { position:fixed; right:14mm; bottom:8mm;
              font-size:10px; color:#666; text-align:right; }
@media print {
  body { background:#fff; padding:0; }
  .rep-toolbar { display:none; }
  .rep-paper { position:relative; box-shadow:none; padding:0; max-width:none; }
  .rep-block--last-check { margin-bottom:0; }
  .rep-block--short-tail { break-inside:avoid-page; page-break-inside:avoid; }
  .rep-block h3, .rep-step h4 { break-after:avoid-page; page-break-after:avoid; }
  .rep-block--keep { break-inside:avoid-page; page-break-inside:avoid; }
  .rep-steps-wrap > .rep-step:last-of-type { break-after:avoid-page; page-break-after:avoid; }
  .rep-summary { break-before:avoid-page; page-break-before:avoid; break-after:avoid-page; page-break-after:avoid; break-inside:avoid; page-break-inside:avoid; }
  thead { display:table-header-group; }
  table { break-inside:auto; page-break-inside:auto; }
  tr { break-inside:avoid-page; page-break-inside:avoid; }
  p, li, .rep-step-body { orphans:3; widows:3; }
  .rep-footer { position:static; width:auto; clear:both; padding:1mm 0 0; margin-top:4mm; break-before:avoid-page; page-break-before:avoid; break-inside:avoid; }
}
</style>
</head>
<body data-document-class="${esc(documentClass.key)}">
<div class="rep-toolbar">
  <button onclick="window.print()">🖨️ 列印 / 存 PDF</button>
  <button onclick="closeReportWindow()">✕ 關閉</button>
  <span class="rep-window-status" id="repWindowStatus" role="status" aria-live="polite"></span>
</div>
<div class="rep-paper">
  ${documentStateHtml}
<!--rc-content-seal:start-->
<div class="rep-sealed-content">
  <div class="rep-header">
    <h1>${esc(cfg.title || '計算書')}</h1>
    ${cfg.subtitle?`<div class="sub">${esc(cfg.subtitle)}</div>`:''}
  </div>
  ${initialDocumentStatusHtml}
  <div class="rep-meta${sourceTrace.tool ? ' rep-meta--traceable' : ''}">
    ${proj.name ? `<div><b>計畫名稱</b>${esc(proj.name)}</div>` : ''}
    ${proj.no ? `<div><b>計畫編號</b>${esc(proj.no)}</div>` : ''}
    ${proj.designer ? `<div><b>設計人員</b>${esc(proj.designer)}</div>` : ''}
    <div><b>製表日期</b>${esc(proj.date)}</div>
    ${sourceTrace.tool ? `<div><b>產出工具</b>${esc(sourceTrace.tool)}</div>` : ''}
    ${sourceTrace.version ? `<div><b>工具版本</b>${esc(sourceTrace.version)}</div>` : ''}
    <div><b>輸出時間</b>${esc(reportGeneratedAt)}</div>
    <div><b>計算指紋</b>${esc(calculationFingerprint)}</div>
  </div>

  ${inputsHtml}
  ${diagramsHtml}
  ${checksHtml}
  ${stepsHtml}
  ${summaryHtml}

  <div class="rep-footer"><div class="rep-footer-separator" aria-hidden="true"></div><div class="rep-footer-copyright">版權所有 弘一工程顧問有限公司</div></div>
</div>
<!--rc-content-seal:end-->
</div>
<script>
function showReportWindowStatus(message) {
  var status = document.getElementById('repWindowStatus');
  if (status) status.textContent = message;
}
function closeReportWindow() {
  try { window.close(); } catch (e) {}
  try { window.open('', '_self', ''); window.close(); } catch (e) {}
  setTimeout(function() {
    if (!window.closed) {
      showReportWindowStatus('瀏覽器安全策略無法自動關閉，請手動按 Ctrl+W 或 Command+W 關閉分頁。');
    }
  }, 150);
}
</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=1100,scrollbars=yes');
  if (!w) {
    showRcReportIssue('請允許彈出視窗以開啟計算書。');
    return;
  }
  w.document.open(); w.document.write(html); w.document.close();
}

// === 為各工具提供共用 project info 欄位 (HTML 片段) ===
function projectFieldsHTML(prefix='proj') {
  return `
  <div class="card">
    <h3>附件識別資料（選填，可由主文承接）</h3>
    <div class="form-row">
      <div class="form-group"><label>計畫名稱</label><input type="text" id="${prefix}Name" placeholder="例：XX 大樓新建工程"></div>
      <div class="form-group"><label>計畫編號</label><input type="text" id="${prefix}No" placeholder="例：2026-001"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>設計人員</label><input type="text" id="${prefix}Designer" placeholder="姓名"></div>
      <div class="form-group"><label>備註</label><input type="text" id="${prefix}Note" placeholder="—"></div>
    </div>
    <button class="btn-report" id="btnReport" type="button">📄 產生計算書</button>
  </div>`;
}

// === 取得 project info ===
function getProjectInfo(prefix='proj') {
  const v = id => (document.getElementById(prefix+id)?.value || '').trim();
  return { name: v('Name'), no: v('No'), designer: v('Designer'), note: v('Note') };
}
