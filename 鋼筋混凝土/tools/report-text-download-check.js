const fs = require('fs');
const path = require('path');
const AttachmentPackageChecker = require('../../結構工具箱/tools/attachment-package-check');

async function captureReportTextDownload(report, options = {}) {
  const {
    outputDir,
    filePrefix,
    caseKey,
    label,
    assert,
    expectedFragments = [],
    minBytes = 1024,
    removeAfterCheck = false,
  } = options;
  if (!outputDir || !filePrefix || !caseKey || !label || typeof assert !== 'function') {
    throw new Error('captureReportTextDownload requires outputDir, filePrefix, caseKey, label, and assert');
  }

  const generated = await report.evaluate(async () => ({
    hasTextDownloadControl: Boolean(document.getElementById('repDownloadCurrentText')),
    textBuilderAvailable: typeof window.buildReportText === 'function',
    text: typeof window.buildReportText === 'function' ? await window.buildReportText() : '',
  }));
  assert(
    generated.hasTextDownloadControl && generated.textBuilderAvailable,
    `${label} exposes governed TXT download`,
    JSON.stringify({ hasTextDownloadControl: generated.hasTextDownloadControl, textBuilderAvailable: generated.textBuilderAvailable }),
  );

  const filePath = path.join(outputDir, `${filePrefix}-report-text-download-${caseKey}.txt`);
  const downloadPromise = report.waitForEvent('download', { timeout: 10000 });
  await report.click('#repDownloadCurrentText');
  const download = await downloadPromise;
  await download.saveAs(filePath);

  const buffer = fs.readFileSync(filePath);
  const decoded = buffer.toString('utf8');
  const hasBom = decoded.charCodeAt(0) === 0xFEFF;
  const content = hasBom ? decoded.slice(1) : decoded;
  const suggestedFilename = download.suggestedFilename();
  const requiredFragments = [
    '文件類別：文字備查',
    '正式附件資格：否',
    '文件用途：文字備查版（不作為正式附件）',
    '產出工具：',
    '工具版本：',
    '輸出時間：',
    '計算指紋：CF-',
    '文字版限制：不含可列印圖形',
    '文字內容 SHA-256（非數位簽章）：',
    ...expectedFragments,
  ];

  for (const fragment of requiredFragments) {
    assert(generated.text.includes(fragment), `${label} generated TXT includes`, fragment);
    assert(content.includes(fragment), `${label} downloaded TXT includes`, fragment);
  }
  assert(generated.text === content, `${label} downloaded TXT matches the generated report state`, `${content.length} chars`);
  assert(hasBom, `${label} downloaded TXT has UTF-8 BOM`, suggestedFilename);
  assert(buffer.length > minBytes, `${label} downloaded TXT has substantive calculation content`, `${buffer.length} bytes`);
  assert(/文字備查.*CF-[A-F0-9]{16}\.txt$/.test(suggestedFilename), `${label} TXT filename is traceable`, suggestedFilename);
  assert(/文字內容 SHA-256（非數位簽章）：[0-9a-f]{64}/.test(content), `${label} TXT carries content digest`, 'SHA-256 present');
  assert(!content.includes('產報前檢查') && !content.includes('data:image/'), `${label} TXT excludes page-only state and embedded images`, 'clean text boundary');

  const record = AttachmentPackageChecker.inspectAttachment(filePath, outputDir);
  const packageReport = AttachmentPackageChecker.analyzePackage([record]);
  const issueCodes = packageReport.issues.map(issue => issue.code);
  assert(
    packageReport.status === 'blocked' && issueCodes.includes('non-formal-reference-text'),
    `${label} TXT is blocked from formal attachment packaging`,
    JSON.stringify({ status: packageReport.status, issueCodes }),
  );
  assert(
    record.readyDocumentNeedles.length === 0 && record.draftDocumentNeedles.length === 0 && record.nonFormalReferenceNeedles.length >= 2,
    `${label} source report status cannot reclassify the TXT artifact`,
    JSON.stringify({ ready: record.readyDocumentNeedles, draft: record.draftDocumentNeedles, nonFormal: record.nonFormalReferenceNeedles }),
  );

  if (removeAfterCheck && fs.existsSync(filePath)) fs.unlinkSync(filePath);

  return {
    artifact: path.basename(filePath),
    bytes: buffer.length,
    suggestedFilename,
    hasBom,
    textLength: content.length,
    packageStatus: packageReport.status,
    packageIssueCodes: issueCodes,
    nonFormalReferenceNeedles: record.nonFormalReferenceNeedles,
    retained: !removeAfterCheck,
  };
}

module.exports = { captureReportTextDownload };
