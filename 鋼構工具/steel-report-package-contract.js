'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Checker = require('../結構工具箱/tools/attachment-package-check');

// 九個正式來源案例要求 JSON/HTML 成對；一般 Checker 仍容許獨立附件，未改其產品政策。
function verifySteelReportPackage({ key, approvedHtml, internalHtml, sourcePayload, outputDir }) {
  assert.equal(sourcePayload?.kind, 'formal-calculation-source', key + ' must retain its actual source JSON');
  assert.ok(internalHtml && approvedHtml, key + ' must capture both actual approval states');
  const sourceFingerprint = sourcePayload.calculationFingerprint;
  assert.equal(sourcePayload.report?.calculationFingerprint, sourceFingerprint);
  const marker = Checker.FORMAL_CONTENT_SEAL_START;
  assert.ok(approvedHtml.includes(marker));
  // marker 亦出現在可攜 script 的常數中；必須改最後一個實際內容邊界。
  const contentOffset = approvedHtml.lastIndexOf(marker) + marker.length;
  const contentTamper = approvedHtml.slice(0, contentOffset) + '<div>異動後計算內容</div>' + approvedHtml.slice(contentOffset);
  const changedSource = JSON.parse(JSON.stringify(sourcePayload));
  changedSource.calculationFingerprint = 'CF-0000000000000000';
  changedSource.report.calculationFingerprint = changedSource.calculationFingerprint;
  const approvalTamper = approvedHtml.replace(/(rep-attachment-approval-source[^>]*data-approved-at=")[^"]+/i, (_, prefix) => prefix + '2000-01-01T00:00:00.000Z');
  assert.notEqual(approvalTamper, approvedHtml, key + ' approval tamper must actually mutate the record');
  const variants = [
    { name: 'approved', html: approvedHtml, source: sourcePayload, ready: true },
    { name: 'internal-review', html: internalHtml, source: sourcePayload, issue: 'not-formally-approved' },
    { name: 'content-tamper', html: contentTamper, source: sourcePayload, issue: 'content-seal' },
    { name: 'approval-tamper', html: approvalTamper, source: sourcePayload, issue: 'approval-seal' },
    { name: 'source-mismatch', html: approvedHtml, source: changedSource, issue: 'fingerprint-mismatch' },
    { name: 'missing-source', html: approvedHtml, source: null, issue: 'case-source-required' },
  ];
  const records = variants.map(variant => {
    const directory = path.join(outputDir, key, variant.name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'report.html'), variant.html, 'utf8');
    if (variant.source) fs.writeFileSync(path.join(directory, 'source.json'), JSON.stringify(variant.source, null, 2) + '\n', 'utf8');
    const report = Checker.checkPackage(directory);
    const sourceComplete = Boolean(variant.source) && report.fingerprintLinks.length === 1;
    const ready = report.status === 'ready' && sourceComplete;
    assert.equal(ready, variant.ready === true, key + '/' + variant.name + ': ' + JSON.stringify({ status: report.status, links: report.fingerprintLinks, issues: report.issues }));
    if (variant.name !== 'missing-source' && !variant.ready) assert.notEqual(report.status, 'ready');
    if (variant.ready) assert.equal(report.fingerprintLinks[0].fingerprint, sourceFingerprint);
    return { variant: variant.name, directory, checkerStatus: report.status, sourceComplete, ready,
      issueCodes: report.issues.map(issue => issue.code), expectedBoundary: variant.issue || 'qualified-approved-paired' };
  });
  return { key, fingerprint: sourceFingerprint, records, passed: true };
}

module.exports = { verifySteelReportPackage };
