'use strict';

const { createHash } = require('crypto');

const ANCHOR_CONTENT_SEAL_SCOPE = 'anchor-calculation-book-content-v1';
const ANCHOR_APPROVAL_SEAL_SCOPE = 'anchor-calculation-book-approval-v1';
const CONTENT_SEAL_START = '<!--anchor-content-seal:start-->';
const CONTENT_SEAL_END = '<!--anchor-content-seal:end-->';

function sha256Text(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function normalizeSerializedFragment(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+\/>/g, '>')
    .replace(/<(img|br|hr|meta|link|input)(\b[^>]*)><\/\1>/gi, '<$1$2>')
    .replace(/<(path|line|circle|rect|polygon|polyline|ellipse|stop)(\b[^>]*)><\/\1>/gi, '<$1$2>')
    .replace(/>\s+</g, '><')
    .trim();
}

function canonicalSealedContent(serializedHtml) {
  const html = String(serializedHtml || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const start = html.lastIndexOf(CONTENT_SEAL_START);
  const end = html.lastIndexOf(CONTENT_SEAL_END);
  if (start < 0 || end < 0 || end <= start) return '';
  return normalizeSerializedFragment(html.slice(start + CONTENT_SEAL_START.length, end));
}

function findTagByClass(serializedHtml, className) {
  const pattern = new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, 'i');
  return String(serializedHtml || '').match(pattern)?.[0] || '';
}

function readAttribute(tag, name) {
  const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(tag || '').match(new RegExp(`${escapedName}=["']([^"']*)["']`, 'i'))?.[1] || '';
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function findElementTextById(serializedHtml, id) {
  const escapedId = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<([a-z0-9-]+)\\b(?=[^>]*\\bid=["']${escapedId}["'])[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i');
  return clean(String(serializedHtml || '').match(pattern)?.[2]?.replace(/<[^>]+>/g, ' ') || '');
}

function findTitleText(serializedHtml) {
  return clean(String(serializedHtml || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
}

function canonicalApprovalPayload(serializedHtml) {
  const html = String(serializedHtml || '');
  const approvalSource = findTagByClass(html, 'anchor-approval-seal-source');
  const contentSeal = findTagByClass(html, 'anchor-content-seal-source');
  const statusTag = html.match(/<footer\b(?=[^>]*\bid=["']reportDocumentStatus["'])[^>]*>/i)?.[0] || '';
  const statusText = findElementTextById(html, 'reportDocumentStatus');
  const documentTitle = findTitleText(html);
  if (!approvalSource || !contentSeal || !statusTag || !statusText || !documentTitle) return '';
  return JSON.stringify({
    scope: ANCHOR_APPROVAL_SEAL_SCOPE,
    reportTitle: clean(decodeHtmlEntities(readAttribute(approvalSource, 'data-report-title'))),
    calculationFingerprint: clean(readAttribute(approvalSource, 'data-calculation-fingerprint')),
    sourceApproved: clean(readAttribute(approvalSource, 'data-approved')),
    sourceApprovedAt: clean(readAttribute(approvalSource, 'data-approved-at')),
    documentClass: clean(readAttribute(statusTag, 'data-document-state')),
    statusApprovedAt: clean(readAttribute(statusTag, 'data-approved-at')),
    statusText: decodeHtmlEntities(statusText),
    documentTitle: decodeHtmlEntities(documentTitle),
    contentSha256: clean(readAttribute(contentSeal, 'data-content-sha256')).toLowerCase(),
  });
}

function sealStatus(expected, actual) {
  if (!expected) return 'unsealed';
  return expected === actual ? 'verified' : 'failed';
}

function verifyAnchorReportHtmlSeals(serializedHtml) {
  const html = String(serializedHtml || '');
  const contentSource = findTagByClass(html, 'anchor-content-seal-source');
  const approvalSource = findTagByClass(html, 'anchor-approval-seal-source');
  const contentScope = readAttribute(contentSource, 'data-content-seal-scope');
  const contentExpected = readAttribute(contentSource, 'data-content-sha256').toLowerCase();
  const content = canonicalSealedContent(html);
  const contentActual = content ? sha256Text(content) : '';
  const approvalScope = readAttribute(approvalSource, 'data-approval-seal-scope');
  const approvalExpected = readAttribute(approvalSource, 'data-approval-sha256').toLowerCase();
  const approvalPayload = canonicalApprovalPayload(html);
  const approvalActual = approvalPayload ? sha256Text(approvalPayload) : '';
  return {
    content: {
      scope: contentScope,
      status: sealStatus(contentExpected, contentActual),
      expectedSha256: contentExpected,
      actualSha256: contentActual,
    },
    approval: {
      scope: approvalScope,
      status: sealStatus(approvalExpected, approvalActual),
      expectedSha256: approvalExpected,
      actualSha256: approvalActual,
    },
  };
}

module.exports = {
  ANCHOR_CONTENT_SEAL_SCOPE,
  ANCHOR_APPROVAL_SEAL_SCOPE,
  verifyAnchorReportHtmlSeals,
};
