'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Builder = require('./attachment-package-build.js');
const History = require('./attachment-package-upgrade-history.js');
const Index = require('./attachment-package-upgrade-history-index.js');
const Advance = require('./attachment-package-upgrade-history-baseline-advance.js');

const CHAIN_KIND = 'formal-attachment-package-upgrade-history-baseline-chain-index.v1';
const CHAIN_BOUNDARY_INSTRUCTION = '本索引僅供案件內部驗證可信基準版本鏈，不得放入計算書、主報告或正式附件包，亦不代表正式附件核可或數位簽章。';

function issue(level, code, message, files = []) {
  return { level, code, message, files: [...files] };
}

function samePath(left, right) {
  const normalize = value => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
  return normalize(left) === normalize(right);
}

function sha256File(filePath) {
  return Advance.sha256File(filePath);
}

function physicalDirectory(directory, label) {
  const resolved = path.resolve(directory || '');
  if (!directory || !fs.existsSync(resolved)) throw new Error(`${label}不存在：${resolved || directory || '(未指定)'}`);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label}必須是實體資料夾。`);
  const realPath = (fs.realpathSync.native || fs.realpathSync)(resolved);
  if (!samePath(realPath, resolved)) throw new Error(`${label}不得透過符號連結或目錄連接重新導向。`);
  return { resolved, realPath };
}

function directorySnapshot(directory, label = '可信基準版本鏈根目錄') {
  const root = physicalDirectory(directory, label);
  const rootStat = fs.lstatSync(root.resolved, { bigint: true });
  const entries = [];
  function visit(current, relativeParent = '') {
    fs.readdirSync(current).sort().forEach(name => {
      const absolutePath = path.join(current, name);
      const relativePath = relativeParent ? `${relativeParent}/${name}` : name;
      const stat = fs.lstatSync(absolutePath, { bigint: true });
      const type = stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other';
      entries.push({
        path: relativePath,
        type,
        size: stat.size.toString(),
        mtimeNs: stat.mtimeNs.toString(),
        sha256: type === 'file' ? sha256File(absolutePath) : '',
      });
      if (type === 'directory') visit(absolutePath, relativePath);
    });
  }
  visit(root.resolved);
  return {
    root: {
      realPath: root.realPath,
      dev: rootStat.dev.toString(),
      ino: rootStat.ino.toString(),
    },
    entries,
  };
}

function chainFingerprint(baselines, links) {
  const payload = {
    baselines: baselines.map(item => ({
      sha256: item.sha256,
      collectionFingerprint: item.collectionFingerprint,
      receiptCount: item.receiptCount,
    })),
    links: links.map(item => ({
      advancementFingerprint: item.advancementFingerprint,
      previousSha256: item.previousSha256,
      nextSha256: item.nextSha256,
      acceptedAddedReceiptIds: item.acceptedAddedReceiptIds,
    })),
  };
  const hash = crypto.createHash('sha256')
    .update(History.canonicalJson(payload), 'utf8')
    .digest('hex')
    .slice(0, 24)
    .toUpperCase();
  return `HCX-${hash}`;
}

function inspectChain(historyDir, chainRoot, options = {}) {
  const history = physicalDirectory(historyDir, '附件升級內部歷程資料夾');
  const root = physicalDirectory(chainRoot, '可信基準版本鏈根目錄');
  if (Builder.isPathInside(history.resolved, root.resolved)
      || Builder.isPathInside(root.resolved, history.resolved)
      || Builder.isPathInside(history.realPath, root.realPath)
      || Builder.isPathInside(root.realPath, history.realPath)) {
    throw new Error('可信基準版本鏈根目錄必須與歷程資料夾完全分離。');
  }
  const generatedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('無法建立可信基準版本鏈索引時間。');
  const rootBefore = directorySnapshot(root.resolved);
  const historyBefore = Index.historySnapshot(history.resolved);
  let externalBefore = null;
  let externalPath = '';
  if (options.initialBaseline) {
    const external = Advance.fileSnapshot(options.initialBaseline);
    externalPath = external.resolved;
    externalBefore = external;
    if (Builder.isPathInside(history.resolved, external.realPath)
        || Builder.isPathInside(history.realPath, external.realPath)
        || Builder.isPathInside(root.resolved, external.realPath)
        || Builder.isPathInside(root.realPath, external.realPath)) {
      throw new Error('外部初始可信基準不得位於歷程或版本鏈根目錄內。');
    }
  }

  const issues = [];
  const nodes = [];
  const bundles = [];

  function addBaseline(filePath, fileName, sourceKind, bundleName = '') {
    const baselineIssues = [];
    const records = Index.baselineRecords(filePath, history.resolved, baselineIssues);
    if (!records || baselineIssues.some(item => item.level === 'error')) {
      baselineIssues.forEach(item => issues.push(issue('error', item.code || 'invalid-chain-baseline', item.message, [fileName])));
      return null;
    }
    const baseline = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const node = {
      filePath: path.resolve(filePath),
      fileName,
      sourceKind,
      bundleName,
      sha256: sha256File(filePath),
      collectionFingerprint: baseline.collectionFingerprint,
      receiptCount: records.length,
      generatedAt: baseline.generatedAt,
      records,
    };
    nodes.push(node);
    return node;
  }

  const topEntries = fs.readdirSync(root.resolved).sort();
  topEntries.forEach(name => {
    const absolutePath = path.join(root.resolved, name);
    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      issues.push(issue('error', 'unsafe-chain-entry', '版本鏈根目錄含符號連結或目錄連接。', [name]));
      return;
    }
    if (stat.isFile()) {
      if (!name.toLowerCase().endsWith('.json')) {
        issues.push(issue('error', 'unexpected-chain-file', '版本鏈根目錄只能直接存放初始基準 JSON。', [name]));
        return;
      }
      if (externalPath && samePath(absolutePath, externalPath)) return;
      addBaseline(absolutePath, name, 'root-baseline');
      return;
    }
    if (!stat.isDirectory()) {
      issues.push(issue('error', 'unsafe-chain-entry', '版本鏈根目錄含特殊項目。', [name]));
      return;
    }
    const entries = fs.readdirSync(absolutePath).sort();
    const expected = [Advance.APPROVAL_FILE_NAME, Advance.BASELINE_FILE_NAME].sort();
    if (JSON.stringify(entries) !== JSON.stringify(expected)) {
      issues.push(issue('error', 'invalid-advancement-bundle-contents', '前進包必須且只能包含新版基準與內部核准紀錄。', [name]));
      return;
    }
    const unsafeEntry = entries.find(entry => {
      const entryStat = fs.lstatSync(path.join(absolutePath, entry));
      return entryStat.isSymbolicLink() || !entryStat.isFile();
    });
    if (unsafeEntry) {
      issues.push(issue('error', 'unsafe-advancement-bundle-entry', '前進包內檔案不得為連結或特殊項目。', [`${name}/${unsafeEntry}`]));
      return;
    }
    const baselinePath = path.join(absolutePath, Advance.BASELINE_FILE_NAME);
    const approvalPath = path.join(absolutePath, Advance.APPROVAL_FILE_NAME);
    const nextNode = addBaseline(baselinePath, `${name}/${Advance.BASELINE_FILE_NAME}`, 'advancement-baseline', name);
    let approval = null;
    try {
      approval = Advance.readApprovalRecord(approvalPath);
      Advance.validateApprovalRecord(approval);
    } catch (error) {
      issues.push(issue('error', 'invalid-advancement-approval', error.message, [`${name}/${Advance.APPROVAL_FILE_NAME}`]));
    }
    bundles.push({ name, path: absolutePath, baselinePath, approvalPath, nextNode, approval });
  });

  if (externalPath && !nodes.some(node => samePath(node.filePath, externalPath))) {
    addBaseline(externalPath, `外部初始基準：${path.basename(externalPath)}`, 'external-root-baseline');
  }
  if (!nodes.length) issues.push(issue('error', 'chain-empty', '版本鏈沒有任何有效可信基準。'));

  const nodesBySha = new Map();
  nodes.forEach(node => {
    if (nodesBySha.has(node.sha256)) {
      issues.push(issue('error', 'duplicate-chain-baseline', '版本鏈含內容完全相同的重複基準檔。', [nodesBySha.get(node.sha256).fileName, node.fileName]));
    } else {
      nodesBySha.set(node.sha256, node);
    }
  });

  const edges = [];
  bundles.forEach(bundle => {
    if (!bundle.approval || !bundle.nextNode) return;
    const approval = bundle.approval;
    const previousNode = nodesBySha.get(approval.previousBaseline.sha256);
    const nextNode = nodesBySha.get(approval.nextBaseline.sha256);
    if (!previousNode) {
      issues.push(issue('error', 'chain-predecessor-missing', '前進包參照的舊基準不存在，版本鏈已斷裂。', [bundle.name]));
      return;
    }
    if (!nextNode || nextNode !== bundle.nextNode || approval.nextBaseline.sha256 !== bundle.nextNode.sha256) {
      issues.push(issue('error', 'chain-next-baseline-mismatch', '前進包的新基準 SHA-256 與核准紀錄不符。', [bundle.name]));
      return;
    }
    const edge = { bundle, approval, previousNode, nextNode };
    edges.push(edge);
    const previousGeneratedAt = new Date(previousNode.generatedAt).getTime();
    const nextGeneratedAt = new Date(nextNode.generatedAt).getTime();
    const reviewedAt = new Date(approval.reviewedAt).getTime();
    if (previousGeneratedAt > nextGeneratedAt) {
      issues.push(issue('error', 'baseline-time-reversed', '新版基準產生時間不得早於舊基準。', [bundle.name]));
    }
    if (nextGeneratedAt > reviewedAt) {
      issues.push(issue('error', 'advancement-time-reversed', '前進核准時間不得早於新版基準產生時間。', [bundle.name]));
    }
    if (approval.acceptedAdditions.some(item => new Date(item.recordedAt).getTime() > nextGeneratedAt)) {
      issues.push(issue('error', 'receipt-after-baseline', '核准接受的收據時間不得晚於新版基準產生時間。', [bundle.name]));
    }
    try {
      Advance.validateAdvancementBundle(bundle.path, history.resolved, previousNode.filePath, {
        now: generatedAt,
        requireHistoryMatch: false,
      });
    } catch (error) {
      issues.push(issue('error', 'invalid-advancement-link', error.message, [bundle.name]));
    }
  });

  const incoming = new Map(nodes.map(node => [node.sha256, []]));
  const outgoing = new Map(nodes.map(node => [node.sha256, []]));
  edges.forEach(edge => {
    incoming.get(edge.nextNode.sha256)?.push(edge);
    outgoing.get(edge.previousNode.sha256)?.push(edge);
  });
  incoming.forEach((items, sha) => {
    if (items.length > 1) issues.push(issue('error', 'chain-merge', '同一新版基準有多個前進來源，版本鏈形成合併。', [nodesBySha.get(sha)?.fileName || sha]));
  });
  outgoing.forEach((items, sha) => {
    if (items.length > 1) issues.push(issue('error', 'chain-fork', '同一舊基準產生多個後續版本，版本鏈形成分叉。', items.map(item => item.bundle.name)));
  });

  const roots = nodes.filter(node => (incoming.get(node.sha256) || []).length === 0);
  const terminals = nodes.filter(node => (outgoing.get(node.sha256) || []).length === 0);
  if (nodes.length && roots.length !== 1) issues.push(issue('error', 'chain-root-count', `版本鏈必須只有一個根基準，目前為 ${roots.length} 個。`, roots.map(node => node.fileName)));
  if (nodes.length && terminals.length !== 1) issues.push(issue('error', 'chain-terminal-count', `版本鏈必須只有一個鏈尾基準，目前為 ${terminals.length} 個。`, terminals.map(node => node.fileName)));

  const orderedNodes = [];
  const orderedEdges = [];
  if (roots.length === 1) {
    const visited = new Set();
    let current = roots[0];
    while (current && !visited.has(current.sha256)) {
      visited.add(current.sha256);
      orderedNodes.push(current);
      const nextEdges = outgoing.get(current.sha256) || [];
      if (nextEdges.length !== 1) break;
      orderedEdges.push(nextEdges[0]);
      current = nextEdges[0].nextNode;
    }
    if (visited.size !== nodes.length) {
      issues.push(issue('error', 'chain-disconnected', '版本鏈含未連接、循環或無法由根基準到達的節點。', nodes.filter(node => !visited.has(node.sha256)).map(node => node.fileName)));
    }
  }

  let currentComparison = {
    status: 'not-checked', used: false, added: [], missing: [], changed: [],
  };
  let currentReceiptCount = 0;
  const terminal = terminals.length === 1 ? terminals[0] : null;
  if (terminal) {
    const terminalIndex = Index.inspectHistoryDir(history.resolved, {
      baseline: terminal.filePath,
      now: generatedAt,
    });
    currentReceiptCount = terminalIndex.summary.validReceipts;
    currentComparison = {
      status: terminalIndex.baseline.status,
      used: terminalIndex.baseline.used,
      added: [...terminalIndex.baseline.added],
      missing: [...terminalIndex.baseline.missing],
      changed: [...terminalIndex.baseline.changed],
    };
    if (terminalIndex.status === 'blocked') {
      issues.push(issue('error', 'chain-terminal-history-mismatch', '鏈尾基準相較目前歷程有遺失、改變或完整性異常。', [terminal.fileName]));
    } else if (terminalIndex.status === 'review') {
      const onlyNew = terminalIndex.baseline.status === 'new-records'
        && terminalIndex.issues.every(item => item.level === 'warn' && item.code === 'baseline-receipt-added');
      if (onlyNew) {
        issues.push(issue('warn', 'chain-advancement-pending', `目前歷程另有 ${terminalIndex.baseline.added.length} 份合法新增收據尚未完成基準前進。`, terminalIndex.baseline.added));
      } else {
        issues.push(issue('error', 'chain-terminal-not-valid', '鏈尾基準無法完整比對目前歷程。', [terminal.fileName]));
      }
    }
  }

  if (typeof options.beforeFinalize === 'function') options.beforeFinalize();
  if (JSON.stringify(rootBefore) !== JSON.stringify(directorySnapshot(root.resolved))) {
    issues.push(issue('error', 'chain-changed-during-read', '版本鏈根目錄或內容在唯讀驗證期間發生變更。'));
  }
  if (JSON.stringify(historyBefore) !== JSON.stringify(Index.historySnapshot(history.resolved))) {
    issues.push(issue('error', 'history-changed-during-chain-read', '歷程資料夾在版本鏈驗證期間發生變更。'));
  }
  if (externalBefore && JSON.stringify(externalBefore) !== JSON.stringify(Advance.fileSnapshot(externalPath))) {
    issues.push(issue('error', 'external-baseline-changed-during-read', '外部初始可信基準在版本鏈驗證期間發生變更。'));
  }

  const errors = issues.filter(item => item.level === 'error').length;
  const warnings = issues.filter(item => item.level === 'warn').length;
  const status = errors ? 'blocked' : warnings ? 'review' : 'valid';
  const ordered = orderedNodes.length === nodes.length ? orderedNodes : [...nodes].sort((a, b) => a.fileName.localeCompare(b.fileName));
  const linksInOrder = orderedEdges.length === edges.length ? orderedEdges : [...edges].sort((a, b) => a.bundle.name.localeCompare(b.bundle.name));
  const baselineOutput = ordered.map((node, index) => ({
    fileName: node.fileName,
    role: roots.length === 1 && node === roots[0] ? 'root'
      : terminals.length === 1 && node === terminals[0] ? 'terminal'
        : orderedNodes.includes(node) ? 'intermediate' : 'disconnected',
    generatedAt: node.generatedAt,
    collectionFingerprint: node.collectionFingerprint,
    sha256: node.sha256,
    receiptCount: node.receiptCount,
  }));
  const linkOutput = linksInOrder.map(edge => ({
    bundleName: edge.bundle.name,
    reviewedAt: edge.approval.reviewedAt,
    advancementId: edge.approval.advancementId,
    advancementFingerprint: edge.approval.advancementFingerprint,
    previousSha256: edge.previousNode.sha256,
    nextSha256: edge.nextNode.sha256,
    previousCollectionFingerprint: edge.previousNode.collectionFingerprint,
    nextCollectionFingerprint: edge.nextNode.collectionFingerprint,
    acceptedAddedReceiptIds: edge.approval.acceptedAdditions.map(item => item.receiptId).sort(),
  }));
  return {
    schemaVersion: 1,
    kind: CHAIN_KIND,
    generatedAt: generatedAt.toISOString(),
    status,
    chainFingerprint: chainFingerprint(baselineOutput, linkOutput),
    boundary: {
      classification: 'internal-governance-only',
      attachToFormalReport: false,
      formalAttachmentApproval: false,
      instruction: CHAIN_BOUNDARY_INSTRUCTION,
    },
    summary: {
      baselines: nodes.length,
      bundles: bundles.length,
      links: edges.length,
      terminalReceiptCount: terminal?.receiptCount || 0,
      currentReceiptCount,
      pendingAdditions: currentComparison.added.length,
      errors,
      warnings,
    },
    root: roots.length === 1 ? {
      collectionFingerprint: roots[0].collectionFingerprint,
      sha256: roots[0].sha256,
      receiptCount: roots[0].receiptCount,
    } : null,
    terminal: terminal ? {
      collectionFingerprint: terminal.collectionFingerprint,
      sha256: terminal.sha256,
      receiptCount: terminal.receiptCount,
    } : null,
    baselines: baselineOutput,
    links: linkOutput,
    currentComparison,
    issues,
  };
}

function formatSummary(result) {
  const label = result.status === 'valid' ? '版本鏈完整' : result.status === 'review' ? '尚有新增待前進' : '版本鏈阻擋';
  const lines = [
    '附件升級可信基準版本鏈唯讀驗證',
    `狀態：${label}`,
    `基準：${result.summary.baselines}；前進包：${result.summary.bundles}；有效連結：${result.summary.links}`,
    `版本鏈指紋：${result.chainFingerprint}`,
  ];
  if (result.root) lines.push(`根基準：${result.root.collectionFingerprint}`);
  if (result.terminal) lines.push(`鏈尾基準：${result.terminal.collectionFingerprint}`);
  if (result.summary.pendingAdditions) lines.push(`尚待核准前進的新增收據：${result.summary.pendingAdditions}`);
  result.issues.forEach(item => lines.push(`- ${item.level === 'error' ? '錯誤' : '提醒'}：${item.message}`));
  lines.push(CHAIN_BOUNDARY_INSTRUCTION);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`參數 ${arg} 缺少路徑值。`);
      index += 1;
      return value;
    };
    if (arg === '--history') options.history = takeValue();
    else if (arg === '--chain-root') options.chainRoot = takeValue();
    else if (arg === '--initial-baseline') options.initialBaseline = takeValue();
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return [
    '用法：node attachment-package-upgrade-history-baseline-chain.js',
    '  --history <外部歷程資料夾> --chain-root <可信基準根目錄>',
    '  [--initial-baseline <根目錄外的初始可信基準 JSON>] [--json]',
    '驗證器固定唯讀；純新增但尚未前進為 review，斷鏈、分叉、替換或缺少核准紀錄為 blocked。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return Index.INDEX_EXIT_CODES.valid;
  }
  if (!options.history || !options.chainRoot) {
    console.error(usage());
    return Index.INDEX_EXIT_CODES.error;
  }
  const result = inspectChain(options.history, options.chainRoot, options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return Index.exitCodeForStatus(result.status);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = Index.INDEX_EXIT_CODES.error;
  }
}

module.exports = {
  CHAIN_KIND,
  CHAIN_BOUNDARY_INSTRUCTION,
  directorySnapshot,
  chainFingerprint,
  inspectChain,
  formatSummary,
  parseArgs,
  usage,
};
