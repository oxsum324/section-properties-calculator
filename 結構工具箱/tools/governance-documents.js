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
  ]),
});

const STAGING_SEGMENTS = Object.freeze({
  'docs/governance-current/STAGING_GROUPS-ledger-01.md': Object.freeze(Array.from({ length: 7 }, (_, i) => `SG-01-${String(i + 1).padStart(3, '0')}`)),
  'docs/governance-current/STAGING_GROUPS-ledger-02.md': Object.freeze(Array.from({ length: 6 }, (_, i) => `SG-02-${String(i + 1).padStart(3, '0')}`)),
  'docs/governance-current/STAGING_GROUPS-ledger-03.md': Object.freeze(Array.from({ length: 36 }, (_, i) => `SG-03-${String(i + 1).padStart(3, '0')}`)),
});

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
    const expectedOrder = [...STAGING_SEGMENTS[GROUPS[relativePath][0]], ...STAGING_SEGMENTS[GROUPS[relativePath][1]], ...STAGING_SEGMENTS[GROUPS[relativePath][2]]];
    if (mainMarkers.map(marker => marker[1]).join('\n') !== expectedOrder.join('\n')) fail('staging main segment order mismatch');
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

module.exports = { readGovernanceDocument, GROUPS };
