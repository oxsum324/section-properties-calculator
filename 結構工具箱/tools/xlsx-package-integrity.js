'use strict';

const path = require('path');

const RELATIONSHIP_PATTERN = /<Relationship\b([^>]*)\/?\s*>/g;
const ATTRIBUTE_PATTERN = /([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/g;
const FORMULA_PATTERN = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/g;
const CELL_PATTERN = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
const NETWORK_FORMULA_PATTERN = /\b(?:WEBSERVICE|FILTERXML|HYPERLINK|RTD)\s*\(/i;
const EXTERNAL_REFERENCE_PATTERN = /(?:^|[^\w])\[[^\]]+\](?:'[^']+'|[^!\s]+)!/;

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
  for (const match of String(source || '').matchAll(ATTRIBUTE_PATTERN)) attributes[match[1]] = match[3];
  return attributes;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
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
  return new RegExp(`(?:r:id|r:embed|r:link)=['"]${escaped}['"]`).test(xml);
}

function issue(code, part, detail) {
  return { code, part, detail };
}

function inspectXlsxPackage(entries, options = {}) {
  if (!(entries instanceof Map)) throw new TypeError('XLSX entries must be a Map');
  const label = options.label || 'XLSX';
  const names = [...entries.keys()].filter(name => !name.endsWith('/'));
  const issues = [];

  for (const required of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml']) {
    if (!entries.has(required)) issues.push(issue('missing-required-part', required, `${label} 缺少必要 OOXML 零件`));
  }

  const relationships = parseRelationships(entries);
  for (const relationship of relationships) {
    if (/^external$/i.test(relationship.targetMode)) {
      issues.push(issue('external-relationship', relationship.relationshipPart, `${relationship.type} -> ${relationship.target}`));
    } else if (relationship.resolvedTarget && !entries.has(relationship.resolvedTarget)) {
      issues.push(issue('missing-relationship-target', relationship.relationshipPart, `${relationship.id} -> ${relationship.resolvedTarget}`));
    }
  }

  const workbookXml = entries.get('xl/workbook.xml')?.toString('utf8') || '';
  const sheets = [...workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/g)].map(match => parseAttributes(match[1]));
  for (const sheet of sheets) {
    if (String(sheet.state || 'visible').toLowerCase() !== 'visible') {
      issues.push(issue('hidden-sheet', 'xl/workbook.xml', `${sheet.name || sheet.sheetId || 'unknown'}:${sheet.state}`));
    }
  }
  if (/<workbookView\b[^>]*\bvisibility=["'](?:hidden|veryHidden)["']/i.test(workbookXml)) {
    issues.push(issue('hidden-workbook-window', 'xl/workbook.xml', `${label} 含隱藏活頁簿視窗`));
  }
  if (/<definedName\b[^>]*\bhidden=["']1["']/i.test(workbookXml)) {
    issues.push(issue('hidden-defined-name', 'xl/workbook.xml', `${label} 含隱藏名稱定義`));
  }
  for (const match of workbookXml.matchAll(/<definedName\b[^>]*>([\s\S]*?)<\/definedName>/g)) {
    const formula = decodeXml(match[1]);
    if (EXTERNAL_REFERENCE_PATTERN.test(formula)) issues.push(issue('external-formula-reference', 'xl/workbook.xml', formula));
    if (NETWORK_FORMULA_PATTERN.test(formula) || /\bDDE\s*\(/i.test(formula)) issues.push(issue('network-capable-formula', 'xl/workbook.xml', formula));
  }

  const worksheetRelationships = relationships.filter(relationship => /\/worksheet$/i.test(relationship.type));
  const referencedWorksheets = new Set(
    worksheetRelationships
      .filter(relationship => relationship.owner === 'xl/workbook.xml')
      .filter(relationship => ownerUsesRelationship(entries, relationship))
      .map(relationship => relationship.resolvedTarget)
  );
  const worksheetParts = names.filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
  for (const part of worksheetParts) {
    if (!referencedWorksheets.has(part)) issues.push(issue('unreferenced-worksheet', part, `${label} 含未列入工作表清冊的 worksheet`));
  }

  let formulaCount = 0;
  let cachedFormulaCount = 0;
  for (const name of worksheetParts) {
    const xml = entries.get(name).toString('utf8');
    if (/<row\b[^>]*\bhidden=["'](?:1|true)["']/i.test(xml)) issues.push(issue('hidden-row', name, `${label} 含隱藏列`));
    if (/<col\b[^>]*\bhidden=["'](?:1|true)["']/i.test(xml)) issues.push(issue('hidden-column', name, `${label} 含隱藏欄`));
    for (const cellMatch of xml.matchAll(CELL_PATTERN)) {
      const attributes = parseAttributes(cellMatch[1]);
      const body = cellMatch[2];
      const formulaMatch = body.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/);
      if (String(attributes.t || '').toLowerCase() === 'e') {
        issues.push(issue('formula-error-cell', name, `${attributes.r || 'unknown'}:${decodeXml((body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '')}`));
      }
      if (!formulaMatch) continue;
      formulaCount += 1;
      const formula = decodeXml(formulaMatch[1]);
      if (/<v(?:\s[^>]*)?>[\s\S]*?<\/v>/.test(body)) cachedFormulaCount += 1;
      else issues.push(issue('formula-without-cached-result', name, `${attributes.r || 'unknown'}:${formula}`));
      if (EXTERNAL_REFERENCE_PATTERN.test(formula)) issues.push(issue('external-formula-reference', name, `${attributes.r || 'unknown'}:${formula}`));
      if (NETWORK_FORMULA_PATTERN.test(formula)) issues.push(issue('network-capable-formula', name, `${attributes.r || 'unknown'}:${formula}`));
    }
    for (const formulaMatch of xml.matchAll(FORMULA_PATTERN)) {
      const formula = decodeXml(formulaMatch[1]);
      if (/\bDDE\s*\(/i.test(formula)) issues.push(issue('network-capable-formula', name, formula));
    }
  }

  const activeContentParts = names.filter(name =>
    /^xl\/(?:externalLinks|connections|queryTables|pivotCache|embeddings|activeX|ctrlProps|customXml|persons)\//i.test(name)
    || /^xl\/(?:connections\.xml|vbaProject\.bin)$/i.test(name)
    || /^customXml\//i.test(name)
  );
  for (const name of activeContentParts) {
    issues.push(issue('external-or-active-content', name, `${label} 含外部資料、嵌入物件、巨集或非預期 custom XML`));
  }
  for (const name of names.filter(name => /^xl\/(?:comments\d*\.xml|threadedComments\/)/i.test(name))) {
    issues.push(issue('comment-content', name, `${label} 含批註或執行緒註解`));
  }
  const stylesXml = entries.get('xl/styles.xml')?.toString('utf8') || '';
  if (/<numFmt\b[^>]*\bformatCode=["'][^"']*;;;[^"']*["']/i.test(stylesXml)) {
    issues.push(issue('hidden-number-format', 'xl/styles.xml', `${label} 含可隱藏儲存格顯示的自訂格式`));
  }

  const referencedPackageParts = new Set(
    relationships
      .filter(relationship => !/^external$/i.test(relationship.targetMode))
      .filter(relationship => /\/(?:drawing|image)$/i.test(relationship.type))
      .filter(relationship => ownerUsesRelationship(entries, relationship))
      .map(relationship => relationship.resolvedTarget)
  );
  const mediaParts = names.filter(name => /^xl\/media\//i.test(name));
  const drawingParts = names.filter(name => /^xl\/drawings\/drawing\d+\.xml$/i.test(name));
  for (const part of [...mediaParts, ...drawingParts]) {
    if (!referencedPackageParts.has(part)) issues.push(issue('unreferenced-sensitive-part', part, `${label} 含未引用媒體或圖形`));
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
    sheetCount: sheets.length,
    visibleSheetCount: sheets.filter(sheet => String(sheet.state || 'visible').toLowerCase() === 'visible').length,
    formulaCount,
    cachedFormulaCount,
    mediaCount: mediaParts.length,
    referencedMediaCount: mediaParts.filter(part => referencedPackageParts.has(part)).length,
  };
}

module.exports = {
  inspectXlsxPackage,
  normalizePartName,
  parseRelationships,
  relationshipOwnerPart,
};
