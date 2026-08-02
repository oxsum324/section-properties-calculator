const assert = require('assert/strict');
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const AttachmentPackageChecker = require('../結構工具箱/tools/attachment-package-check');

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function describeHtmlArtifact(htmlArtifact, html) {
  assert.ok(String(htmlArtifact || '').trim(), 'HTML attachment manifest names the artifact');
  const buffer = Buffer.from(String(html || ''), 'utf8');
  assert.ok(buffer.length > 0, `HTML attachment manifest records non-empty bytes: ${htmlArtifact}`);
  return {
    htmlArtifactBytes: buffer.length,
    htmlArtifactSha256: sha256Buffer(buffer),
  };
}

function verifyHtmlArtifact(directory, record, label = 'HTML attachment') {
  assert.ok(record?.htmlArtifact, `${label} names HTML artifact`);
  assert.ok(Number.isInteger(record.htmlArtifactBytes) && record.htmlArtifactBytes > 0, `${label} records HTML artifact bytes: ${record.htmlArtifact}`);
  assert.match(String(record.htmlArtifactSha256 || ''), /^[0-9a-f]{64}$/i, `${label} records HTML artifact SHA-256: ${record.htmlArtifact}`);

  const htmlArtifactPath = path.join(directory, record.htmlArtifact);
  assert.ok(fs.existsSync(htmlArtifactPath), `${label} HTML artifact exists: ${record.htmlArtifact}`);
  const buffer = fs.readFileSync(htmlArtifactPath);
  assert.equal(buffer.length, record.htmlArtifactBytes, `${label} HTML artifact bytes match render manifest: ${record.htmlArtifact}`);
  const actualSha256 = sha256Buffer(buffer);
  assert.equal(actualSha256, String(record.htmlArtifactSha256).toLowerCase(), `${label} HTML artifact SHA-256 matches render manifest: ${record.htmlArtifact}`);

  const html = buffer.toString('utf8');
  const visibleText = AttachmentPackageChecker.extractHtmlVisibleContent(html).text;
  assert.ok(visibleText.includes('文件狀態：正式附件'), `${label} HTML artifact keeps static formal state: ${record.htmlArtifact}`);
  if (record.calculationFingerprint) {
    assert.ok(visibleText.includes(record.calculationFingerprint), `${label} HTML artifact keeps fingerprint: ${record.htmlArtifact}`);
  }

  return {
    name: record.htmlArtifact,
    bytes: buffer.length,
    sha256: actualSha256,
    calculationFingerprint: String(record.calculationFingerprint || ''),
  };
}

module.exports = {
  describeHtmlArtifact,
  sha256Buffer,
  verifyHtmlArtifact,
};
