'use strict';

const path = require('path');

const RELATIONSHIP_PATTERN = /<Relationship\b([^>]*)\/?\s*>/g;
const ATTRIBUTE_PATTERN = /([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/g;
const REVISION_PATTERN = /<w:(?:ins|del|moveFrom|moveTo)\b/;
const COMMENT_PATTERN = /<w:comment\b/;
const COMMENT_ANCHOR_PATTERN = /<w:(?:commentRangeStart|commentRangeEnd|commentReference)\b/;
const SENSITIVE_RELATIONSHIP_PATTERN = /\/(?:attachedTemplate|image|oleObject|package)$/i;

function normalizePartName(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = [];
  for (const part of normalized.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function relationshipOwnerPart(relationshipPart) {
  const normalized = normalizePartName(relationshipPart);
  if (normalized === '_rels/.rels') return '';
  const match = normalized.match(/^(.*\/)?_rels\/([^/]+)\.rels$/);
  if (!match) return null;
  return normalizePartName(`${match[1] || ''}${match[2]}`);
}

function parseAttributes(source) {
  const attributes = {};
  for (const match of String(source || '').matchAll(ATTRIBUTE_PATTERN)) {
    attributes[match[1]] = match[3];
  }
  return attributes;
}

function parseRelationships(entries) {
  const relationships = [];
  for (const [name, bytes] of entries.entries()) {
    if (!name.endsWith('.rels')) continue;
    const owner = relationshipOwnerPart(name);
    if (owner === null) continue;
    const xml = bytes.toString('utf8');
    for (const match of xml.matchAll(RELATIONSHIP_PATTERN)) {
      const attributes = parseAttributes(match[1]);
      const targetMode = attributes.TargetMode || '';
      const target = attributes.Target || '';
      relationships.push({
        owner,
        relationshipPart: name,
        id: attributes.Id || '',
        type: attributes.Type || '',
        target,
        targetMode,
        resolvedTarget: /^external$/i.test(targetMode)
          ? ''
          : normalizePartName(path.posix.join(path.posix.dirname(owner), target)),
      });
    }
  }
  return relationships;
}

function ownerUsesRelationship(entries, relationship) {
  if (!relationship.owner || !relationship.id || !entries.has(relationship.owner)) return false;
  const xml = entries.get(relationship.owner).toString('utf8');
  const escaped = relationship.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:r:id|r:embed|r:link|o:relid)=["']${escaped}["']`).test(xml);
}

function isAllowedEmptyBibliography(xml) {
  return /<b:Sources\b/.test(xml) && !/<b:Source\b/.test(xml);
}

function issue(code, part, detail) {
  return { code, part, detail };
}

function inspectDocxPackage(entries, options = {}) {
  if (!(entries instanceof Map)) throw new TypeError('DOCX entries must be a Map');
  const label = options.label || 'DOCX';
  const names = [...entries.keys()].filter(name => !name.endsWith('/'));
  const issues = [];

  for (const required of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) {
    if (!entries.has(required)) issues.push(issue('missing-required-part', required, `${label} 缺少必要 OOXML 零件`));
  }

  const relationships = parseRelationships(entries);
  for (const relationship of relationships) {
    if (/^external$/i.test(relationship.targetMode)) {
      if (SENSITIVE_RELATIONSHIP_PATTERN.test(relationship.type)) {
        issues.push(issue('external-sensitive-relationship', relationship.relationshipPart, `${relationship.type} -> ${relationship.target}`));
      }
      continue;
    }
    if (relationship.resolvedTarget && !entries.has(relationship.resolvedTarget)) {
      issues.push(issue('missing-relationship-target', relationship.relationshipPart, `${relationship.id} -> ${relationship.resolvedTarget}`));
    }
  }

  const referencedSensitiveParts = new Set(
    relationships
      .filter(relationship => !/^external$/i.test(relationship.targetMode))
      .filter(relationship => /\/(?:image|header|footer)$/i.test(relationship.type))
      .filter(relationship => ownerUsesRelationship(entries, relationship))
      .map(relationship => relationship.resolvedTarget)
  );
  const mediaParts = names.filter(name => /^word\/media\//.test(name));
  const headerParts = names.filter(name => /^word\/header\d+\.xml$/i.test(name));
  const footerParts = names.filter(name => /^word\/footer\d+\.xml$/i.test(name));
  for (const part of [...mediaParts, ...headerParts, ...footerParts]) {
    if (!referencedSensitiveParts.has(part)) {
      issues.push(issue('unreferenced-sensitive-part', part, `${label} 含未由可見文件內容引用的媒體或頁首頁尾`));
    }
  }

  for (const name of names.filter(name => /^word\/.*\.xml$/i.test(name))) {
    const xml = entries.get(name).toString('utf8');
    if (REVISION_PATTERN.test(xml)) issues.push(issue('tracked-revision', name, `${label} 含未接受的追蹤修訂`));
    if (COMMENT_ANCHOR_PATTERN.test(xml)) issues.push(issue('comment-anchor', name, `${label} 正文含批註錨點`));
  }
  for (const name of names.filter(name => /^word\/comments(?:Extended|Extensible|Ids|People)?\.xml$/i.test(name) || /^word\/comments\.xml$/i.test(name))) {
    const xml = entries.get(name).toString('utf8');
    if (COMMENT_PATTERN.test(xml)) issues.push(issue('comment-content', name, `${label} 含實際批註內容`));
  }

  for (const name of names.filter(name => /^word\/(?:embeddings|activeX)\//i.test(name) || /^word\/vbaProject\.bin$/i.test(name))) {
    issues.push(issue('embedded-active-content', name, `${label} 含嵌入物件、ActiveX 或巨集`));
  }
  for (const name of names.filter(name => /^customXml\/item\d+\.xml$/i.test(name))) {
    const xml = entries.get(name).toString('utf8');
    if (!isAllowedEmptyBibliography(xml)) {
      issues.push(issue('unexpected-custom-xml', name, `${label} 含非空白書目容器的 custom XML`));
    }
  }

  const uniqueIssues = [...new Map(issues.map(item => [`${item.code}\0${item.part}\0${item.detail}`, item])).values()];
  return {
    schemaVersion: 1,
    label,
    pass: uniqueIssues.length === 0,
    issueCount: uniqueIssues.length,
    issues: uniqueIssues,
    partCount: names.length,
    relationshipCount: relationships.length,
    mediaCount: mediaParts.length,
    referencedMediaCount: mediaParts.filter(part => referencedSensitiveParts.has(part)).length,
    headerCount: headerParts.length,
    referencedHeaderCount: headerParts.filter(part => referencedSensitiveParts.has(part)).length,
    footerCount: footerParts.length,
    referencedFooterCount: footerParts.filter(part => referencedSensitiveParts.has(part)).length,
  };
}

module.exports = {
  inspectDocxPackage,
  normalizePartName,
  parseRelationships,
  relationshipOwnerPart,
};
