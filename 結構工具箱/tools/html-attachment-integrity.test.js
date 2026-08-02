const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  describeHtmlArtifact,
  verifyHtmlArtifact,
} = require('./html-attachment-integrity');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-html-integrity-'));
const htmlArtifact = 'RC-test-formal-attachment.html';
const htmlArtifactPath = path.join(directory, htmlArtifact);
const fingerprint = 'CF-1234567890ABCDEF';
const html = `<!doctype html><html><head><title>RC 測試計算書</title></head><body><div>文件狀態：正式附件</div><div>${fingerprint}</div><!-- seal:A --></body></html>`;
const manifest = {
  htmlArtifact,
  calculationFingerprint: fingerprint,
  ...describeHtmlArtifact(htmlArtifact, html),
};

try {
  fs.writeFileSync(htmlArtifactPath, html, 'utf8');
  const verified = verifyHtmlArtifact(directory, manifest, 'RC tamper fixture');
  assert.equal(verified.bytes, manifest.htmlArtifactBytes, 'untouched fixture keeps recorded bytes');
  assert.equal(verified.sha256, manifest.htmlArtifactSha256, 'untouched fixture keeps recorded SHA-256');

  fs.unlinkSync(htmlArtifactPath);
  assert.throws(
    () => verifyHtmlArtifact(directory, manifest, 'RC deleted fixture'),
    /HTML artifact exists/,
    'deleted HTML attachment is rejected',
  );

  fs.writeFileSync(htmlArtifactPath, html.slice(0, -1), 'utf8');
  assert.throws(
    () => verifyHtmlArtifact(directory, manifest, 'RC truncated fixture'),
    /bytes match render manifest/,
    'truncated HTML attachment is rejected',
  );

  const sameLengthTamper = html.replace('seal:A', 'seal:B');
  assert.equal(Buffer.byteLength(sameLengthTamper, 'utf8'), manifest.htmlArtifactBytes, 'tamper fixture preserves byte count');
  fs.writeFileSync(htmlArtifactPath, sameLengthTamper, 'utf8');
  assert.throws(
    () => verifyHtmlArtifact(directory, manifest, 'RC same-length tamper fixture'),
    /SHA-256 matches render manifest/,
    'same-length HTML attachment tampering is rejected',
  );

  console.log('HTML attachment integrity negative contract OK (deleted, truncated, same-length tamper rejected)');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
