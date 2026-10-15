'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GROUPS, readGovernanceDocument } = require('./governance-documents.js');

function write(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function wrapper(relativePath, eol, body) {
  return [`# ${relativePath}`, '', `<!-- P2-BOOK:${relativePath} -->`, '', '> 原文分冊；若本冊從表格中段開始，欄位沿用來源表頭。此 wrapper 不併入虛擬正文。', '', body].join(eol);
}

function expectedStagingIds() {
  return [7, 6, 36].flatMap((count, index) => Array.from({ length: count }, (_, i) => `SG-${String(index + 1).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`));
}

function fixture(eol) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-docs-contract-'));
  const stagingIds = expectedStagingIds();
  for (const relativePath of Object.keys(GROUPS)) {
    let main = `body:${relativePath}${eol}`;
    if (relativePath === 'STAGING_GROUPS.md') {
      main += stagingIds.map(id => `<!--P2:${id}-->${eol}`).join('');
      main += `git add -- "new-p2-entry.js"${eol}`;
    } else {
      for (const bookPath of GROUPS[relativePath]) main += `<!-- P2_INCLUDE:${bookPath} -->${eol}`;
      main += `registered P2 file${eol}`;
    }
    main += `<!-- P2-BOOK-INDEX-START -->${eol}generated index${eol}<!-- P2-BOOK-INDEX-END -->${eol}`;
    write(root, relativePath, main);
  }
  for (const relativePath of GROUPS['README.md'].concat(GROUPS['TOOL_BOUNDARIES.md'])) {
      write(root, relativePath, wrapper(relativePath, eol, `source:${relativePath}:$&$'$${eol}`));
  }
  for (const relativePath of GROUPS['STAGING_GROUPS.md']) {
    const index = GROUPS['STAGING_GROUPS.md'].indexOf(relativePath);
    const count = [7, 6, 36][index];
    const prefix = `SG-${String(index + 1).padStart(2, '0')}-`;
    const segments = Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(3, '0')}`)
      .map(id => `<!-- P2-SEGMENT:${id} -->${eol}content:${id}:$&$'$${eol}`).join('');
    write(root, relativePath, wrapper(relativePath, eol, segments));
  }
  return { root, stagingIds };
}

const tempRoots = [];
try {
  for (const eol of ['\n', '\r\n']) {
    const { root, stagingIds } = fixture(eol);
    tempRoots.push(root);
    for (const relativePath of ['README.md', 'TOOL_BOUNDARIES.md']) {
      const reconstructed = readGovernanceDocument(root, relativePath);
      for (const bookPath of GROUPS[relativePath]) assert.ok(reconstructed.includes(`source:${bookPath}:$&$'$${eol}`));
      assert.ok(reconstructed.includes('registered P2 file'));
      assert.equal(reconstructed.includes('generated index'), false);
    }
    const staging = readGovernanceDocument(root, 'STAGING_GROUPS.md');
    assert.equal(stagingIds.every(id => staging.includes(`content:${id}:$&$'$${eol}`)), true);
    assert.ok(staging.includes(`git add -- "new-p2-entry.js"${eol}`));
    assert.equal(staging.includes('generated index'), false);
  }

  const bad = fixture('\n');
  tempRoots.push(bad.root);
  const missing = GROUPS['README.md'][0];
  fs.unlinkSync(path.join(bad.root, ...missing.split('/')));
  assert.throws(() => readGovernanceDocument(bad.root, 'README.md'), /missing book/);

  const duplicate = fixture('\n');
  tempRoots.push(duplicate.root);
  const stagingPath = path.join(duplicate.root, 'STAGING_GROUPS.md');
  fs.appendFileSync(stagingPath, `<!--P2:SG-01-001-->\n`);
  assert.throws(() => readGovernanceDocument(duplicate.root, 'STAGING_GROUPS.md'), /missing or duplicate main marker|duplicate main segment marker/);

  const crossGroup = fixture('\n');
  tempRoots.push(crossGroup.root);
  const crossPath = path.join(crossGroup.root, ...GROUPS['STAGING_GROUPS.md'][0].split('/'));
  const crossText = fs.readFileSync(crossPath, 'utf8').replace('SG-01-001', 'SG-02-001');
  fs.writeFileSync(crossPath, crossText, 'utf8');
  assert.throws(() => readGovernanceDocument(crossGroup.root, 'STAGING_GROUPS.md'), /cross-group or unlisted segment|segment order mismatch/);

  const outOfRange = fixture('\n');
  tempRoots.push(outOfRange.root);
  const outPath = path.join(outOfRange.root, 'STAGING_GROUPS.md');
  fs.appendFileSync(outPath, `<!--P2:SG-04-001-->\n`);
  assert.throws(() => readGovernanceDocument(outOfRange.root, 'STAGING_GROUPS.md'), /unlisted or cross-group main segment|staging main segment order mismatch/);

  const reordered = fixture('\r\n');
  tempRoots.push(reordered.root);
  const readmePath = path.join(reordered.root, 'README.md');
  let readmeMain = fs.readFileSync(readmePath, 'utf8');
  const [first, second] = GROUPS['README.md'];
  readmeMain = readmeMain.replace(`<!-- P2_INCLUDE:${first} -->\r\n<!-- P2_INCLUDE:${second} -->`, `<!-- P2_INCLUDE:${second} -->\r\n<!-- P2_INCLUDE:${first} -->`);
  readmeMain = readmeMain.replace(`registered P2 file\r\n`, 'registered P2 file\r\n');
  fs.writeFileSync(readmePath, readmeMain, 'utf8');
  assert.throws(() => readGovernanceDocument(reordered.root, 'README.md'), /include marker order mismatch/);

  const mixed = fixture('\r\n');
  tempRoots.push(mixed.root);
  const mixedPath = path.join(mixed.root, 'README.md');
  const mixedMain = fs.readFileSync(mixedPath, 'utf8').replace(`<!-- P2_INCLUDE:${GROUPS['README.md'][0]} -->\r\n`, `<!-- P2_INCLUDE:${GROUPS['README.md'][0]} -->\n`);
  fs.writeFileSync(mixedPath, mixedMain, 'utf8');
  const mixedResult = readGovernanceDocument(mixed.root, 'README.md');
  assert.ok(mixedResult.includes(`source:${GROUPS['README.md'][0]}:$&$'$\r\n`));
  assert.ok(mixedResult.includes('registered P2 file\r\n'));

  const unsafeMarker = fixture('\n');
  tempRoots.push(unsafeMarker.root);
  fs.appendFileSync(path.join(unsafeMarker.root, 'STAGING_GROUPS.md'), '<!--P2:../outside-->\n');
  assert.throws(() => readGovernanceDocument(unsafeMarker.root, 'STAGING_GROUPS.md'), /unknown or out-of-range staging marker/);

  const reorderedStaging = fixture('\n');
  tempRoots.push(reorderedStaging.root);
  const reorderedStagingPath = path.join(reorderedStaging.root, 'STAGING_GROUPS.md');
  const reorderedStagingText = fs.readFileSync(reorderedStagingPath, 'utf8')
    .replace('<!--P2:SG-01-001-->\n<!--P2:SG-01-002-->', '<!--P2:SG-01-002-->\n<!--P2:SG-01-001-->');
  fs.writeFileSync(reorderedStagingPath, reorderedStagingText, 'utf8');
  assert.throws(() => readGovernanceDocument(reorderedStaging.root, 'STAGING_GROUPS.md'), /staging main segment order mismatch/);

  console.log('governance-documents contract passed: LF/CRLF reconstruction and fail-closed book/segment cases');
} finally {
  const tempParent = path.resolve(os.tmpdir());
  for (const root of tempRoots) {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== tempParent || !path.basename(resolved).startsWith('governance-docs-contract-')) {
      throw new Error(`Unsafe temporary cleanup path: ${resolved}`);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
