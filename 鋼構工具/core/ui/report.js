/* 結構工具箱 — 共用計算書產生器
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

function escapeReportHtml(value) {
  return (value === null || value === undefined ? '' : String(value))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeProjectFieldValue(value) {
  const text = (value === null || value === undefined ? '' : String(value)).trim();
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

const CALCULATION_BOOK_PAGE_ONLY_LABELS = Object.freeze([
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
  '符號說明',
  '備註與條文說明',
  '預計輸出符號',
  '預計輸出備註',
]);

function isCalculationBookPageOnlyLabel(value) {
  const label = String(value || '').trim();
  return CALCULATION_BOOK_PAGE_ONLY_LABELS.includes(label);
}

function getCalculationBookInputGroups(groups) {
  return (Array.isArray(groups) ? groups : []).map((group) => ({
    ...group,
    items: (Array.isArray(group?.items) ? group.items : [])
      .filter((item) => !isCalculationBookPageOnlyLabel(item?.label)),
  })).filter((group) => group.items.length > 0 && !isCalculationBookPageOnlyLabel(group.group));
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
    inputs: getCalculationBookInputGroups(cfg.inputs),
    checks: cfg.checks || [],
    summary: cfg.summary || {},
    steps: cfg.steps || [],
    snapshot: cfg.snapshot || {},
  });
  const source = JSON.stringify(snapshot);
  return `CF-${fingerprintHash(source, 0x811C9DC5)}${fingerprintHash(source, 0x9E3779B9)}`;
}

function normalizeReportVersion(value) {
  const raw = String(value || '').trim();
  const bareVersion = raw.match(/^v?(\d+(?:\.\d+)*(?:[-+.\w]*)?)$/i);
  if (bareVersion) return `v${bareVersion[1]}`;
  const namespacedVersion = raw.match(/^[a-z][a-z0-9-]*\.v(\d+(?:\.\d+)*(?:[-+.\w]*)?)$/i);
  if (namespacedVersion) return `v${namespacedVersion[1]}`;
  return raw;
}

function getReportSourceTrace(cfg) {
  const configured = cfg.outputSource && typeof cfg.outputSource === 'object' ? cfg.outputSource : {};
  const documentTitle = typeof document !== 'undefined' ? String(document.title || '').trim() : '';
  const rawTool = String(configured.tool || cfg.toolName || documentTitle || cfg.title || '').trim();
  const versionMatch = rawTool.match(/(?:^|\s)(V\d+(?:\.\d+)*(?:[-+.\w]*)?)(?=\s|$)/i);
  const version = normalizeReportVersion(configured.version || cfg.toolVersion || versionMatch?.[1]);
  const tool = rawTool.replace(/\s*V\d+(?:\.\d+)*(?:[-+.\w]*)?\s*$/i, '').trim() || String(cfg.title || '').trim();
  return { tool, version };
}

function buildReportTrace(cfg = {}) {
  const generatedAt = cfg.generatedAt instanceof Date ? cfg.generatedAt : new Date(cfg.generatedAt || Date.now());
  const sourceTrace = getReportSourceTrace(cfg);
  const calculationFingerprint = buildCalculationFingerprint({
    title: cfg.title || '',
    subtitle: cfg.subtitle || '',
    inputs: getCalculationBookInputGroups(cfg.inputs),
    checks: cfg.checks || [],
    summary: cfg.summary || {},
    steps: cfg.steps || [],
    snapshot: cfg.snapshot || {},
    calculationFingerprint: cfg.calculationFingerprint,
  });
  return {
    sourceTrace,
    generatedAt: formatReportTimestamp(generatedAt),
    calculationFingerprint,
  };
}

function validateCalculationSourcePayload(payload, options = {}) {
  const fail = (message) => {
    throw new Error(`來源 JSON 驗證失敗：${message}`);
  };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('內容不是有效物件。');
  if (payload.schemaVersion !== 1) fail('不支援此 schemaVersion。');
  if (payload.kind !== 'formal-calculation-source') fail('kind 不是正式計算來源。');
  if (!payload.tool || typeof payload.tool !== 'object') fail('缺少工具識別。');
  const expectedToolIds = (Array.isArray(options.expectedToolIds) ? options.expectedToolIds : [options.expectedToolId])
    .map(value => String(value || '').trim())
    .filter(Boolean);
  if (expectedToolIds.length && !expectedToolIds.includes(String(payload.tool.id || '').trim())) {
    fail(`工具種類不符（${payload.tool.id || '未提供'}）。`);
  }
  const expectedVersion = normalizeReportVersion(options.expectedVersion);
  const actualVersion = normalizeReportVersion(payload.tool.version);
  if (!actualVersion) fail('缺少工具版本。');
  if (expectedVersion && actualVersion !== expectedVersion) {
    fail(`工具版本不符（來源 ${actualVersion}，目前 ${expectedVersion}）。`);
  }
  if (!payload.fields || typeof payload.fields !== 'object' || Array.isArray(payload.fields) || !Object.keys(payload.fields).length) {
    fail('缺少可重現的輸入欄位。');
  }
  if (!/^CF-[0-9A-F]{16}$/.test(String(payload.calculationFingerprint || ''))) {
    fail('計算指紋格式不正確。');
  }
  if (payload.report?.calculationFingerprint !== payload.calculationFingerprint) {
    fail('來源與報告快照的計算指紋不一致。');
  }
  return payload;
}

function validateCalculationCasePayload(payload, options = {}) {
  const fail = (message) => {
    throw new Error(`案件 JSON 驗證失敗：${message}`);
  };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('內容不是有效物件。');
  const actualSchema = String(payload.schema ?? payload.schemaVersion ?? '').trim();
  const expectedSchema = String(options.expectedSchema || '').trim();
  if (!actualSchema) fail('缺少案件 schema。');
  if (expectedSchema && actualSchema !== expectedSchema) {
    fail(`案件格式不符（來源 ${actualSchema}，目前 ${expectedSchema}）。`);
  }

  const expectedToolId = String(options.expectedToolId || '').trim();
  const actualToolId = String(payload.tool?.id || '').trim();
  const schemaIdentifiesTool = options.allowSchemaToolIdentity === true &&
    expectedToolId && actualSchema.startsWith(`${expectedToolId}.case.`);
  if (expectedToolId && !actualToolId && !schemaIdentifiesTool) fail('缺少工具識別。');
  if (expectedToolId && actualToolId && actualToolId !== expectedToolId) {
    fail(`工具種類不符（來源 ${actualToolId}，目前 ${expectedToolId}）。`);
  }

  const actualVersion = normalizeReportVersion(payload.tool?.version ?? payload.toolVersion);
  const expectedVersion = normalizeReportVersion(options.expectedVersion);
  if (!actualVersion) fail('缺少工具版本。');
  if (expectedVersion && actualVersion !== expectedVersion) {
    fail(`工具版本不符（來源 ${actualVersion}，目前 ${expectedVersion}）。`);
  }
  if (!/^CF-[0-9A-F]{16}$/.test(String(payload.calculationFingerprint || ''))) {
    fail('計算指紋格式不正確。');
  }
  return payload;
}

function assertCalculationCaseReplay(payload, replayedFingerprint) {
  const sourceFingerprint = String(payload?.calculationFingerprint || '');
  const actualFingerprint = String(replayedFingerprint || '');
  if (!/^CF-[0-9A-F]{16}$/.test(actualFingerprint)) {
    throw new Error('案件 JSON 重現失敗：重新計算後未取得有效計算指紋。');
  }
  if (sourceFingerprint !== actualFingerprint) {
    throw new Error(`案件 JSON 重現失敗：來源 ${sourceFingerprint}，重算 ${actualFingerprint}。`);
  }
  return actualFingerprint;
}

function replayCalculationCasePayload(payload, options = {}) {
  for (const name of ['capture', 'apply', 'recalculate', 'getFingerprint', 'restore']) {
    if (typeof options[name] !== 'function') {
      throw new Error(`案件 JSON 回放設定缺少 ${name}。`);
    }
  }
  const previous = options.capture();
  let applied = false;
  try {
    const source = validateCalculationCasePayload(payload, options);
    applied = true;
    options.apply(source);
    if (options.recalculate() === false) {
      throw new Error('案件 JSON 重現失敗：重新計算未通過輸入檢核。');
    }
    const calculationFingerprint = assertCalculationCaseReplay(source, options.getFingerprint());
    return { payload: source, calculationFingerprint };
  } catch (error) {
    if (applied) {
      try {
        options.restore(previous);
      } catch (rollbackError) {
        throw new Error(`${error.message || error}；原輸入復原失敗：${rollbackError.message || rollbackError}`);
      }
    }
    const message = String(error?.message || error || '未知錯誤').replace(/[。；\s]+$/, '');
    throw new Error(`${message}；已保留原輸入。`);
  }
}

async function readCalculationSourceFile(file, options = {}) {
  if (!file) throw new Error('尚未選擇來源 JSON。');
  if (Number(file.size || 0) > 5 * 1024 * 1024) throw new Error('來源 JSON 超過 5 MB。');
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error('來源 JSON 無法解析。');
  }
  return validateCalculationSourcePayload(payload, options);
}

function hasBlankFieldValues(ids, resolver) {
  const getNode = typeof resolver === 'function'
    ? resolver
    : (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
  return (Array.isArray(ids) ? ids : []).some((id) => {
    return !normalizeProjectFieldValue(getNode(id)?.value);
  });
}

function assessFormalAttachment(state = {}) {
  const normalizeItems = input => [...new Set((Array.isArray(input) ? input : [])
    .map(item => String(item?.label ?? item ?? '').trim())
    .filter(Boolean))];
  const project = {
    name: normalizeProjectFieldValue(state.project?.name),
    no: normalizeProjectFieldValue(state.project?.no),
    designer: normalizeProjectFieldValue(state.project?.designer),
  };
  const requiredMetadata = [
    ['name', '計畫名稱'],
    ['no', '計畫編號'],
    ['designer', '設計人員'],
  ];
  const missingMetadata = requiredMetadata
    .filter(([key]) => !project[key])
    .map(([, label]) => label);
  const failedItems = normalizeItems(state.failedItems);
  const reviewItems = normalizeItems(state.reviewItems);
  const calculated = state.calculated !== false;
  const status = !calculated || failedItems.length
    ? 'blocked'
    : (reviewItems.length ? 'review' : 'ready');
  const detailParts = [];
  if (!calculated) detailParts.push('計算或分析尚未完成。');
  if (failedItems.length) detailParts.push(`尚有 ${failedItems.length} 項檢核不符：${failedItems.join('、')}。`);
  if (reviewItems.length) detailParts.push(`尚有 ${reviewItems.length} 項待人工複核：${reviewItems.join('、')}。`);
  if (missingMetadata.length) detailParts.push(`案件識別資料可由主文承接：${missingMetadata.join('、')}。`);
  const approved = state.approved === true || state.documentApproval?.approved === true;
  const documentState = approved ? null : {
    kind: 'internal-review',
    reason: status,
    label: '內部審閱',
    detail: '本計算內容尚未勾選核可；仍可列印供內部審閱。',
  };
  return {
    status,
    project,
    calculated,
    failedItems,
    reviewItems,
    missingMetadata,
    printable: calculated,
    approvalRequired: !approved,
    formalOutputAllowed: calculated,
    readyToSign: calculated && approved,
    documentClass: approved
      ? { key: 'formal-attachment', label: '正式附件' }
      : { key: 'internal-review', label: '內部審閱' },
    documentState,
    engineeringDetail: detailParts.join(' '),
  };
}

const FORMAL_DOCUMENT_STATE_REPORT_CSS = `
.rep-attachment-approval-source { display:none !important; }
.rep-approval-control { display:inline-flex; align-items:center; gap:6px; margin-right:10px; padding:7px 10px;
  border:1px solid #94a3b8; border-radius:4px; background:#fff; color:#1f2937; font-size:12px; cursor:pointer; }
.rep-approval-control input { width:16px; height:16px; margin:0; accent-color:#166534; }
.rep-document-status-line { display:block; margin-bottom:3mm; color:#4b5563; font-weight:600; }
.rep-footer-copyright { display:block; }
.rep-footer { break-inside:avoid-page; page-break-inside:avoid; }
.rep-document-status-line[data-document-class="formal-attachment"] { color:#14532d; }
@media print { .rep-approval-control { display:none !important; } }`;

function normalizeFormalDocumentState(documentState) {
  if (!documentState) return null;
  return {
    kind: 'internal-review',
    reason: ['blocked', 'review', 'ready'].includes(documentState.reason) ? documentState.reason : 'review',
    label: '內部審閱',
    detail: '本計算內容尚未勾選核可；仍可列印供內部審閱。',
  };
}

function normalizeFormalDocumentClass(documentClass, documentState) {
  if (documentState) return { key: 'internal-review', label: '內部審閱', detail: '' };
  const configured = documentClass && typeof documentClass === 'object' ? documentClass : {};
  const configuredKey = String(configured.key || configured.kind || '').trim().toLowerCase();
  const approved = ['formal-attachment', 'approved', 'formal'].includes(configuredKey);
  return {
    key: approved ? 'formal-attachment' : 'internal-review',
    label: approved ? '正式附件' : '內部審閱',
    detail: '',
  };
}

function buildAttachmentApprovalReport(options = {}) {
  const approved = options.approved === true;
  const fingerprint = String(options.calculationFingerprint || '').trim();
  const approvedAt = String(options.approvedAt || '').trim();
  const esc = escapeReportHtml;
  return {
    approved,
    css: FORMAL_DOCUMENT_STATE_REPORT_CSS,
    html: `<style data-formal-document-state-style>${FORMAL_DOCUMENT_STATE_REPORT_CSS}</style>
      <span class="rep-attachment-approval-source" data-initial-approved="${approved ? 'true' : 'false'}" data-calculation-fingerprint="${esc(fingerprint)}" data-approved-at="${esc(approvedAt)}" aria-hidden="true"></span>
      <script data-attachment-approval-script>
      (function () {
        function initAttachmentApproval() {
          var source = document.querySelector('.rep-attachment-approval-source');
          if (!source || source.dataset.initialized === 'true') return;
          source.dataset.initialized = 'true';
          var toolbar = document.querySelector('.rep-toolbar, .toolbar');
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
          if (!fingerprint) {
            var traceRow = Array.from(document.querySelectorAll('.rep-meta div')).find(function (row) {
              return /計算指紋/.test(row.textContent || '');
            });
            fingerprint = traceRow ? String(traceRow.textContent || '').replace(/^.*?計算指紋\s*/, '').trim() : '';
          }
          var status = document.createElement('span');
          status.className = 'rep-document-status-line';
          footer.insertBefore(status, footer.firstChild);
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
          checkbox.checked = source.dataset.initialApproved === 'true';
          var approvedAtValue = source.dataset.approvedAt || '';
          function formatApprovedAt(value) {
            var d = new Date(value);
            return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-TW', { timeZone:'Asia/Taipei', hour12:false }) : value;
          }
          function updateStatus() {
            if (checkbox.checked && !approvedAtValue) approvedAtValue = new Date().toISOString();
            if (!checkbox.checked) approvedAtValue = '';
            var parts = checkbox.checked
              ? ['文件狀態：正式附件', approvedAtValue ? '核可時間：' + formatApprovedAt(approvedAtValue) : '']
              : ['文件狀態：內部審閱'];
            if (fingerprint) parts.push('計算指紋：' + fingerprint);
            status.textContent = parts.filter(Boolean).join('｜');
            status.dataset.documentClass = checkbox.checked ? 'formal-attachment' : 'internal-review';
            status.dataset.approved = checkbox.checked ? 'true' : 'false';
            status.dataset.approvedAt = approvedAtValue;
            document.body.dataset.documentClass = status.dataset.documentClass;
          }
          checkbox.addEventListener('change', updateStatus);
          updateStatus();
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAttachmentApproval, { once:true });
        else initAttachmentApproval();
      })();
      <\/script>`,
  };
}

function getPageReportReadinessLevel(root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope?.querySelector) return '';
  if (scope.querySelector('.page-only-report-status.blocked, .page-only-report-status .blocked')) return 'blocked';
  if (scope.querySelector('.page-only-report-status.review, .page-only-report-status .review')) return 'review';
  if (scope.querySelector('.page-only-report-status.ready, .page-only-report-status .ready')) return 'ready';
  return '';
}

function buildFormalDocumentStateReport(state = {}) {
  const readinessLevel = ['ready', 'review', 'blocked'].includes(state.readinessLevel)
    ? state.readinessLevel
    : '';
  const failedItems = Array.isArray(state.failedItems) ? [...state.failedItems] : [];
  const reviewItems = Array.isArray(state.reviewItems) ? [...state.reviewItems] : [];
  if (readinessLevel === 'blocked' && failedItems.length === 0) {
    failedItems.push('規範適用或檢核結果未通過');
  }
  if (readinessLevel === 'review' && reviewItems.length === 0) {
    reviewItems.push('計算結果尚待人工複核');
  }
  const assessment = assessFormalAttachment({
    project: state.project,
    calculated: state.calculated,
    failedItems,
    reviewItems,
    approved: state.approved === true || state.documentApproval?.approved === true,
  });
  const documentState = normalizeFormalDocumentState(assessment.documentState);
  const documentClass = normalizeFormalDocumentClass(assessment.documentClass, documentState);
  const approvalReport = buildAttachmentApprovalReport({
    approved: documentClass.key === 'formal-attachment',
    calculationFingerprint: state.calculationFingerprint,
    approvedAt: state.approvedAt || state.documentApproval?.approvedAt,
  });
  return {
    ...assessment,
    documentState,
    documentClass,
    css: FORMAL_DOCUMENT_STATE_REPORT_CSS,
    html: approvalReport.html,
  };
}

function normalizeStatusGridItem(item) {
  if (Array.isArray(item)) {
    return { label: item[0], value: item[1] };
  }
  if (item && typeof item === 'object') {
    return { label: item.label, value: item.value };
  }
  return null;
}

function renderStatusGridPanel(options) {
  const target = options?.target;
  if (!target) return;
  const items = (Array.isArray(options.items) ? options.items : [])
    .map(normalizeStatusGridItem)
    .filter(Boolean);
  const priorityItems = Array.isArray(options.priorityItems) ? options.priorityItems.filter(Boolean) : [];
  const containerClassName = String(options.containerClassName || 'report-readiness').trim();
  target.className = `${containerClassName} ${options.level || 'blocked'}`.trim();
  target.innerHTML = `
    <div class="report-readiness-head">
      <div>
        <p class="report-readiness-kicker">${escapeReportHtml(options.eyebrow || '')}</p>
        <p class="report-readiness-title">${escapeReportHtml(options.title || '')}</p>
      </div>
      <span class="report-readiness-badge">${escapeReportHtml(options.badge || '')}</span>
    </div>
    ${priorityItems.length ? `<ul>${priorityItems.map((item) => `<li>${escapeReportHtml(item)}</li>`).join('')}</ul>` : ''}
    <div class="report-readiness-grid">
      ${items.map((item) => `<div class="report-readiness-item"><span>${escapeReportHtml(item.label)}</span><strong>${escapeReportHtml(item.value)}</strong></div>`).join('')}
    </div>
    ${options.note ? `<div class="report-readiness-note">${escapeReportHtml(options.note)}</div>` : ''}`;
}

if (typeof window !== 'undefined') {
  const sharedReportUI = Object.assign(window.ToolReportUI || window.SteelFormalUI || {}, {
    escapeHtml: escapeReportHtml,
    normalizeProjectFieldValue,
    normalizeReportVersion,
    hasBlankFieldValues,
    assessFormalAttachment,
    buildAttachmentApprovalReport,
    buildFormalDocumentStateReport,
    getPageReportReadinessLevel,
    buildReportTrace,
    validateCalculationSourcePayload,
    readCalculationSourceFile,
    validateCalculationCasePayload,
    assertCalculationCaseReplay,
    replayCalculationCasePayload,
    renderStatusGridPanel,
    calculationBookPageOnlyLabels: CALCULATION_BOOK_PAGE_ONLY_LABELS,
    getCalculationBookInputGroups,
  });
  window.ToolReportUI = sharedReportUI;
  window.SteelFormalUI = sharedReportUI;
}

function showReportIssue(message) {
  if (typeof document === 'undefined' || !document.body) {
    if (typeof console !== 'undefined' && console.warn) console.warn(message);
    return;
  }
  let status = document.getElementById('sharedReportStatus');
  if (!status) {
    status = document.createElement('div');
    status.id = 'sharedReportStatus';
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
      'box-shadow:0 8px 24px rgba(15, 23, 42, .16)',
    ].join(';');
    document.body.appendChild(status);
  }
  status.textContent = message;
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

  const esc = escapeReportHtml;
  const inferredFailedItems = [];
  if (cfg.summary?.ok === false) inferredFailedItems.push(cfg.summary.text || '檢核結論不符');
  (Array.isArray(cfg.checks) ? cfg.checks : []).forEach(group => {
    (Array.isArray(group?.items) ? group.items : []).forEach(item => {
      if (item?.ok === false) inferredFailedItems.push(item.label || group.group || '檢核項目不符');
    });
  });
  const initialApproval = cfg.documentApproval && typeof cfg.documentApproval === 'object'
    ? cfg.documentApproval
    : (cfg.attachmentApproval && typeof cfg.attachmentApproval === 'object' ? cfg.attachmentApproval : {});
  const automaticAttachmentAssessment = assessFormalAttachment({
    project: proj,
    calculated: cfg.calculated !== false,
    failedItems: [...inferredFailedItems, ...(Array.isArray(cfg.failedItems) ? cfg.failedItems : [])],
    reviewItems: cfg.reviewItems,
    approved: initialApproval.approved === true,
  });
  const documentState = normalizeFormalDocumentState(automaticAttachmentAssessment.documentState);
  const documentClass = normalizeFormalDocumentClass(automaticAttachmentAssessment.documentClass, documentState);
  const approvalReport = buildAttachmentApprovalReport({
    approved: initialApproval.approved === true,
    calculationFingerprint,
    approvedAt: initialApproval.approvedAt,
  });

  const inputsHtml = getCalculationBookInputGroups(cfg.inputs).map(g => `
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

  const checksHtml = (cfg.checks || []).map(g => `
    <section class="rep-block">
      <h3>${esc(g.group)}</h3>
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
      <h3>計算線圖與示意圖</h3>
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

  const reportSteps = Array.isArray(cfg.steps) ? cfg.steps.filter(Boolean) : [];
  const renderStep = s => `
    <div class="rep-step">
      <h4>${esc(s.group)}</h4>
      <pre class="rep-step-body">${esc(s.body)}</pre>
    </div>`;
  const leadingSteps = reportSteps.slice(0, -1);
  const stepsHtml = leadingSteps.length ? `
    <section class="rep-block rep-steps-wrap">
      <h3>計算過程明細</h3>
      ${leadingSteps.map(renderStep).join('')}
    </section>` : '';
  const finalStepHtml = reportSteps.length ? `
    <section class="rep-block rep-steps-wrap rep-steps-final">
      ${reportSteps.length === 1 ? '<h3>計算過程明細</h3>' : ''}
      ${renderStep(reportSteps[reportSteps.length - 1])}
    </section>` : '';

  const summary = cfg.summary || {};
  const summaryCls = summary.ok===true?'ok':summary.ok===false?'ng':'na';
  const summaryHtml = `<section class="rep-block rep-conclusion">
    <h3>檢核結論</h3>
    <div class="rep-summary ${summaryCls}">${esc(summary.text || '—')}</div>
  </section>`;
  const documentStateHtml = approvalReport.html;

  const html = `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<title>${esc(cfg.title || '計算書')}</title>
<style>
@page { size: A4 portrait; margin: 18mm 14mm 18mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
       color:#111; margin:0; padding:24px; background:#f4f4f4; }
.rep-paper { max-width: 800px; margin:0 auto; background:#fff; padding:32px 36px;
             box-shadow:0 2px 12px rgba(0,0,0,.08); }
.rep-header { border-bottom:3px double #222; padding-bottom:12px; margin-bottom:16px; }
.rep-header h1 { margin:0 0 4px; font-size:22px; }
.rep-header .sub { color:#555; font-size:13px; }
${FORMAL_DOCUMENT_STATE_REPORT_CSS}
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
.rep-check td.sub { width:30%; font-family:"Cascadia Code","Consolas",monospace; font-size:11px; color:#333; white-space:pre-wrap; word-break:break-word; }
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
                 font-family:"Cascadia Code","Consolas",monospace; font-size:11px;
                 line-height:1.55; background:#faf5ff; border:1px solid #e9d5ff;
                 border-radius:4px; padding:8px 10px; margin:0; color:#3b0764; }
.rep-ending { break-inside:avoid-page; page-break-inside:avoid; }
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
@media (max-width: 600px) {
  .rep-paper { padding: 16px; }
  .rep-meta { grid-template-columns: 1fr; }
  .rep-check { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
}
@media print {
  body { background:#fff; padding:0; }
  .rep-toolbar { display:none; }
  .rep-paper { position:relative; box-shadow:none; padding:0; max-width:none; }
  .rep-block h3, .rep-step h4 { break-after:avoid-page; page-break-after:avoid; }
  .rep-block--keep { break-inside:avoid-page; page-break-inside:avoid; }
  thead { display:table-header-group; }
  table { break-inside:auto; page-break-inside:auto; }
  tr { break-inside:avoid-page; page-break-inside:avoid; }
  p, li, .rep-step-body { orphans:3; widows:3; }
  .rep-footer { position:static; width:auto; padding:0; margin-top:4mm; break-before:avoid-page; page-break-before:avoid; break-inside:avoid; }
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
  <div class="rep-header">
    <h1>${esc(cfg.title || '計算書')}</h1>
    ${cfg.subtitle?`<div class="sub">${esc(cfg.subtitle)}</div>`:''}
  </div>
  ${documentStateHtml}
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
  <div class="rep-ending">
    ${finalStepHtml}
    ${summaryHtml}
  </div>

  <div class="rep-footer"><span class="rep-footer-copyright">版權所有 弘一工程顧問有限公司</span></div>
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
    showReportIssue('請允許彈出視窗以開啟計算書。');
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
