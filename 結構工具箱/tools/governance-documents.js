'use strict';

const fs = require('fs');
const path = require('path');

const GROUPS = Object.freeze({
  'README.md': Object.freeze([
    'docs/governance-current/README-catalog-01.md',
    'docs/governance-current/README-catalog-02.md',
    'docs/governance-current/README-audit.md',
  ]),
  'TOOL_BOUNDARIES.md': Object.freeze([
    'docs/governance-current/TOOL_BOUNDARIES-catalog-01.md',
    'docs/governance-current/TOOL_BOUNDARIES-catalog-02.md',
    'docs/governance-current/TOOL_BOUNDARIES-catalog-03.md',
    'docs/governance-current/TOOL_BOUNDARIES-catalog-04.md',
  ]),
  'STAGING_GROUPS.md': Object.freeze([
    'docs/governance-current/STAGING_GROUPS-ledger-01.md',
    'docs/governance-current/STAGING_GROUPS-ledger-02.md',
    'docs/governance-current/STAGING_GROUPS-ledger-03.md',
    'docs/governance-current/STAGING_GROUPS-ledger-04.md',
  ]),
});

const STAGING_SEGMENTS = Object.freeze({
  'docs/governance-current/STAGING_GROUPS-ledger-01.md': Object.freeze(Array.from({ length: 7 }, (_, i) => `SG-01-${String(i + 1).padStart(3, '0')}`)),
  'docs/governance-current/STAGING_GROUPS-ledger-02.md': Object.freeze(Array.from({ length: 6 }, (_, i) => `SG-02-${String(i + 1).padStart(3, '0')}`)),
  'docs/governance-current/STAGING_GROUPS-ledger-03.md': Object.freeze(Array.from({ length: 36 }, (_, i) => `SG-03-${String(i + 1).padStart(3, '0')}`)),
  'docs/governance-current/STAGING_GROUPS-ledger-04.md': Object.freeze(Array.from({ length: 109 }, (_, i) => `SG-04-${String(i + 1).padStart(3, '0')}`)),
});

const STAGING_MAIN_ORDER = Object.freeze([
  'SG-01-001',
  'SG-04-001',
  'SG-04-002',
  'SG-04-003',
  'SG-01-002',
  'SG-04-004',
  'SG-01-003',
  'SG-04-005',
  'SG-04-006',
  'SG-04-007',
  'SG-04-008',
  'SG-04-009',
  'SG-04-010',
  'SG-04-011',
  'SG-04-012',
  'SG-04-013',
  'SG-04-014',
  'SG-04-015',
  'SG-01-004',
  'SG-04-016',
  'SG-04-017',
  'SG-04-018',
  'SG-04-019',
  'SG-04-020',
  'SG-04-021',
  'SG-04-022',
  'SG-04-023',
  'SG-04-024',
  'SG-01-005',
  'SG-04-025',
  'SG-04-026',
  'SG-04-027',
  'SG-04-028',
  'SG-04-029',
  'SG-04-030',
  'SG-04-031',
  'SG-04-032',
  'SG-04-033',
  'SG-04-034',
  'SG-04-035',
  'SG-04-036',
  'SG-01-006',
  'SG-04-037',
  'SG-01-007',
  'SG-02-001',
  'SG-04-038',
  'SG-04-039',
  'SG-04-040',
  'SG-04-041',
  'SG-04-042',
  'SG-02-002',
  'SG-04-043',
  'SG-04-044',
  'SG-04-045',
  'SG-04-046',
  'SG-04-047',
  'SG-04-048',
  'SG-04-049',
  'SG-04-050',
  'SG-04-051',
  'SG-04-052',
  'SG-04-053',
  'SG-04-054',
  'SG-04-055',
  'SG-02-003',
  'SG-02-004',
  'SG-04-056',
  'SG-04-057',
  'SG-04-058',
  'SG-04-059',
  'SG-02-005',
  'SG-04-060',
  'SG-04-061',
  'SG-04-062',
  'SG-04-063',
  'SG-02-006',
  'SG-04-064',
  'SG-04-065',
  'SG-04-066',
  'SG-04-067',
  'SG-04-068',
  'SG-03-001',
  'SG-04-069',
  'SG-03-002',
  'SG-04-070',
  'SG-03-003',
  'SG-04-071',
  'SG-03-004',
  'SG-04-072',
  'SG-03-005',
  'SG-04-073',
  'SG-03-006',
  'SG-04-074',
  'SG-03-007',
  'SG-04-075',
  'SG-03-008',
  'SG-04-076',
  'SG-03-009',
  'SG-04-077',
  'SG-03-010',
  'SG-04-078',
  'SG-03-011',
  'SG-04-079',
  'SG-03-012',
  'SG-04-080',
  'SG-03-013',
  'SG-04-081',
  'SG-03-014',
  'SG-04-082',
  'SG-03-015',
  'SG-04-083',
  'SG-03-016',
  'SG-04-084',
  'SG-03-017',
  'SG-04-085',
  'SG-03-018',
  'SG-04-086',
  'SG-03-019',
  'SG-04-087',
  'SG-03-020',
  'SG-04-088',
  'SG-03-021',
  'SG-04-089',
  'SG-03-022',
  'SG-04-090',
  'SG-03-023',
  'SG-04-091',
  'SG-03-024',
  'SG-04-092',
  'SG-03-025',
  'SG-04-093',
  'SG-03-026',
  'SG-04-094',
  'SG-03-027',
  'SG-04-095',
  'SG-03-028',
  'SG-04-096',
  'SG-03-029',
  'SG-04-097',
  'SG-03-030',
  'SG-04-098',
  'SG-03-031',
  'SG-04-099',
  'SG-03-032',
  'SG-04-100',
  'SG-03-033',
  'SG-04-101',
  'SG-03-034',
  'SG-04-102',
  'SG-03-035',
  'SG-04-103',
  'SG-03-036',
  'SG-04-104',
  'SG-04-105',
  'SG-04-106',
  'SG-04-107',
  'SG-04-108',
  'SG-04-109',
]);

const UNSPLIT_READMES = Object.freeze([
  '鋼筋混凝土/README.md',
  '鋼構工具/README.md',
  '石材固定/README.md',
  '覆工板/README.md',
  '開挖擋土支撐/README.md',
]);

function fail(message) {
  throw new Error(`governance document contract: ${message}`);
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripBookWrapper(text, expectedPath) {
  const prefix = new RegExp(`^# ${escaped(expectedPath)}\\r?\\n\\r?\\n<!-- P2-BOOK:${escaped(expectedPath)} -->\\r?\\n\\r?\\n> 原文分冊；若本冊從表格中段開始，欄位沿用來源表頭。此 wrapper 不併入虛擬正文。\\r?\\n\\r?\\n`, 'u');
  const match = prefix.exec(text);
  if (!match) fail(`invalid or missing book wrapper: ${expectedPath}`);
  return text.slice(match[0].length);
}

function readBook(repoRoot, relativePath, expectedMain) {
  const absolute = path.resolve(repoRoot, ...relativePath.split('/'));
  if (!absolute.startsWith(`${path.resolve(repoRoot)}${path.sep}`)) fail(`book path escapes repository: ${relativePath}`);
  if (!fs.existsSync(absolute)) fail(`missing book: ${relativePath}`);
  const text = fs.readFileSync(absolute, 'utf8');
  if (relativePath.startsWith('docs/governance-current/STAGING_GROUPS-')) {
    return readStagingSegments(text, relativePath, expectedMain);
  }
  return stripBookWrapper(text, relativePath);
}

function readStagingSegments(text, relativePath, expectedMain) {
  const expected = STAGING_SEGMENTS[relativePath];
  if (!expected) fail(`unlisted staging book: ${relativePath}`);
  const wrapperPattern = new RegExp(`^# ${escaped(relativePath)}\\r?\\n\\r?\\n<!-- P2-BOOK:${escaped(relativePath)} -->\\r?\\n\\r?\\n> 原文分冊；若本冊從表格中段開始，欄位沿用來源表頭。此 wrapper 不併入虛擬正文。\\r?\\n\\r?\\n`, 'u');
  const wrapperMatch = wrapperPattern.exec(text);
  if (!wrapperMatch) fail(`invalid staging book wrapper: ${relativePath}`);
  let body = text.slice(wrapperMatch[0].length);
  const markerPattern = /<!-- P2-SEGMENT:(SG-[0-9]{2}-[0-9]{3}) -->\r?\n/g;
  const markers = [...body.matchAll(markerPattern)];
  if (markers.length !== expected.length) fail(`segment count mismatch in ${relativePath}`);
  const found = new Map();
  for (let i = 0; i < markers.length; i += 1) {
    const id = markers[i][1];
    if (id !== expected[i]) fail(`segment order mismatch in ${relativePath}: expected ${expected[i]}, found ${id}`);
    if (!expected.includes(id)) fail(`cross-group or unlisted segment ${id} in ${relativePath}`);
    if (found.has(id)) fail(`duplicate segment ${id} in ${relativePath}`);
    const start = markers[i].index + markers[i][0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index : body.length;
    found.set(id, body.slice(start, end));
  }
  for (const id of expected) if (!found.has(id)) fail(`missing segment ${id} in ${relativePath}`);
  const observedInMain = [...expectedMain.matchAll(/<!--P2:(SG-[0-9]{2}-[0-9]{3})-->\r?\n/g)].map(match => match[1]);
  for (const id of expected) {
    if (observedInMain.filter(candidate => candidate === id).length !== 1) fail(`missing or duplicate main marker ${id}`);
  }
  return found;
}

function removeGeneratedBookIndex(text, eol) {
  const matches = [...text.matchAll(/<!-- P2-BOOK-INDEX-START -->\r?\n[\s\S]*?<!-- P2-BOOK-INDEX-END -->\r?\n/g)];
  if (matches.length !== 1 || text.indexOf('<!-- P2-BOOK-INDEX-START -->') !== matches[0]?.index || text.indexOf('<!-- P2-BOOK-INDEX-END -->') < matches[0]?.index) {
    fail('missing, duplicate, or out-of-order generated book index markers');
  }
  return text.slice(0, matches[0].index) + text.slice(matches[0].index + matches[0][0].length);
}

function readGovernanceDocument(repoRoot, relativePath) {
  const group = GROUPS[relativePath];
  const root = path.resolve(repoRoot);
  const mainPath = path.resolve(root, ...relativePath.split('/'));
  if (!mainPath.startsWith(`${root}${path.sep}`) || !fs.existsSync(mainPath)) fail(`missing or unsafe main document: ${relativePath}`);
  if (!group) {
    if (!UNSPLIT_READMES.includes(relativePath)) fail(`unlisted governance document: ${relativePath}`);
    return fs.readFileSync(mainPath, 'utf8');
  }
  let text = fs.readFileSync(mainPath, 'utf8');
  text = removeGeneratedBookIndex(text);
  const registered = [...group];
  if (relativePath === 'STAGING_GROUPS.md') {
    const allSegments = new Map();
    for (const bookPath of group) {
      const segments = readBook(root, bookPath, text);
      for (const [id, content] of segments) {
        if (allSegments.has(id)) fail(`duplicate segment ${id} across books`);
        allSegments.set(id, content);
      }
    }
    const mainMarkers = [...text.matchAll(/<!--P2:(SG-[0-9]{2}-[0-9]{3})-->\r?\n/g)];
    const registeredIds = group.flatMap(bookPath => {
      const ids = STAGING_SEGMENTS[bookPath];
      if (!ids) fail(`unlisted staging book: ${bookPath}`);
      return ids;
    });
    const registeredSet = new Set(registeredIds);
    if (registeredSet.size !== registeredIds.length || STAGING_MAIN_ORDER.length !== registeredIds.length || new Set(STAGING_MAIN_ORDER).size !== STAGING_MAIN_ORDER.length || STAGING_MAIN_ORDER.some(id => !registeredSet.has(id))) {
      fail('staging main order registration mismatch');
    }
    if (mainMarkers.map(marker => marker[1]).join('\n') !== STAGING_MAIN_ORDER.join('\n')) fail('staging main segment order mismatch');
    const seen = new Set();
    for (const marker of mainMarkers) {
      const id = marker[1];
      if (seen.has(id)) fail(`duplicate main segment marker ${id}`);
      if (!allSegments.has(id)) fail(`unlisted or cross-group main segment ${id}`);
      seen.add(id);
    }
    for (const marker of mainMarkers.slice().reverse()) {
      text = text.slice(0, marker.index) + allSegments.get(marker[1]) + text.slice(marker.index + marker[0].length);
    }
    if (seen.size !== allSegments.size) fail('segment marker cardinality mismatch');
    if (/P2(?:_INCLUDE|:)/u.test(text)) fail('unknown or out-of-range staging marker');
  } else {
    const markers = [...text.matchAll(/<!-- P2_INCLUDE:([^\r\n]+) -->\r?\n/g)].map(match => match[1]);
    if (markers.join('\n') !== registered.join('\n')) fail(`include marker order mismatch for ${relativePath}`);
    for (const bookPath of registered) {
      const marker = new RegExp(`<!-- P2_INCLUDE:${escaped(bookPath)} -->\\r?\\n`, 'gu');
      const matches = [...text.matchAll(marker)];
      if (matches.length !== 1) fail(`missing or duplicate include marker for ${bookPath}`);
      const match = matches[0];
      text = text.slice(0, match.index) + readBook(root, bookPath, text) + text.slice(match.index + match[0].length);
    }
    if (/P2(?:_INCLUDE|:)/u.test(text)) fail('unlisted or malformed include marker');
  }
  return text;
}

module.exports = { readGovernanceDocument, GROUPS, STAGING_SEGMENTS, STAGING_MAIN_ORDER };
