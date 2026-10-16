'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GROUPS, STAGING_SEGMENTS, STAGING_MAIN_ORDER, readGovernanceDocument } = require('./governance-documents.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GOVERNANCE_BOOKS_ROOT = 'docs/governance-current';
const GOVERNANCE_DOCUMENT_MAX_BYTES = 60000;

function write(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function wrapper(relativePath, eol, body) {
  return [`# ${relativePath}`, '', `<!-- P2-BOOK:${relativePath} -->`, '', '> 原文分冊；若本冊從表格中段開始，欄位沿用來源表頭。此 wrapper 不併入虛擬正文。', '', body].join(eol);
}

function expectedStagingIds() {
  const registered = GROUPS['STAGING_GROUPS.md'].flatMap(bookPath => STAGING_SEGMENTS[bookPath]);
  assert.equal(new Set(registered).size, registered.length, 'registered staging segment IDs are unique');
  assert.deepEqual([...STAGING_MAIN_ORDER].sort(), [...registered].sort(), 'main-order registration covers every registered staging segment exactly once');
  return [...STAGING_MAIN_ORDER];
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
    const ids = STAGING_SEGMENTS[relativePath];
    const segments = ids
      .map(id => `<!-- P2-SEGMENT:${id} -->${eol}content:${id}:$&$'$${eol}`).join('');
    write(root, relativePath, wrapper(relativePath, eol, segments));
  }
  return { root, stagingIds };
}

function validateGovernanceInventory(root, groups = GROUPS) {
  const registeredBooks = Object.values(groups).flat();
  const duplicateBooks = registeredBooks.filter((bookPath, index) => registeredBooks.indexOf(bookPath) !== index);
  assert.deepEqual(duplicateBooks, [], 'a governance book must be registered in exactly one main-document group');

  for (const [mainPath, bookPaths] of Object.entries(groups)) {
    const expectedPrefix = `${path.basename(mainPath, '.md')}-`;
    for (const bookPath of bookPaths) {
      assert.ok(path.basename(bookPath).startsWith(expectedPrefix), `${bookPath} is registered under the wrong governance group ${mainPath}`);
    }
  }

  const booksRoot = path.join(root, ...GOVERNANCE_BOOKS_ROOT.split('/'));
  const physicalBooks = [];
  function collectPhysicalEntries(directory, relativeDirectory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) collectPhysicalEntries(absolutePath, relativePath);
      else physicalBooks.push(`${GOVERNANCE_BOOKS_ROOT}/${relativePath}`);
    }
  }
  if (fs.existsSync(booksRoot)) collectPhysicalEntries(booksRoot, '');
  physicalBooks.sort();
  assert.deepEqual(physicalBooks, [...registeredBooks].sort(), 'physical governance-current files must exactly match GROUPS');

  for (const [mainPath, bookPaths] of Object.entries(groups)) {
    const mainText = fs.readFileSync(path.join(root, ...mainPath.split('/')), 'utf8');
    if (mainPath === 'STAGING_GROUPS.md') continue;
    const includeMarkers = [...mainText.matchAll(/<!-- P2_INCLUDE:([^\r\n]+) -->\r?\n/g)].map(match => match[1]);
    assert.deepEqual(includeMarkers, bookPaths, `${mainPath} must register its own GROUPS books in order`);
  }
}

function validateGovernanceDocumentSizes(root, groups = GROUPS) {
  const paths = [...Object.keys(groups), ...Object.values(groups).flat()];
  const sizes = {};
  for (const relativePath of paths) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    const bytes = fs.readFileSync(absolutePath).byteLength;
    sizes[relativePath] = bytes;
    assert.ok(bytes <= GOVERNANCE_DOCUMENT_MAX_BYTES, `${relativePath} raw bytes ${bytes} exceed ${GOVERNANCE_DOCUMENT_MAX_BYTES}`);
  }
  return sizes;
}

function makeCapacityBytes(targetBytes, eol) {
  const sample = Buffer.from(`中文資料${eol}混合行尾\n原始位元組測試${eol}`, 'utf8');
  assert.ok(sample.byteLength < targetBytes);
  return Buffer.concat([sample, Buffer.alloc(targetBytes - sample.byteLength, 0x20)]);
}

function readFormalToolsStaticCommand(preflightText) {
  const match = preflightText.match(/\$formalToolsStaticCommand\s*=\s*@'\r?\n([\s\S]*?)\r?\n'@/u);
  assert.ok(match, 'preflight-tools.ps1 must retain the formal-tools-static production command block');
  return match[1];
}

function verifyFormalToolsStaticCommandIsolation() {
  const preflightPath = path.join(REPO_ROOT, 'preflight-tools.ps1');
  const command = readFormalToolsStaticCommand(fs.readFileSync(preflightPath, 'utf8'));
  const checkPaths = [...command.matchAll(/^\s*'([^']+\.js)'\s*,?\s*$/gm)].map(match => match[1]);
  const governanceCheck = '結構工具箱\\tools\\governance-documents.contract.test.js';
  const formalContractCheck = '結構工具箱\\tools\\formal-tools.contract.test.js';
  const windProfileCheck = '結構工具箱\\tools\\wind-shared-profile.contract.test.js';
  assert.ok(checkPaths.includes(governanceCheck), 'formal-tools-static must include the governance documents contract');
  assert.ok(checkPaths.includes(formalContractCheck), 'formal-tools-static must retain the formal tools contract');
  assert.ok(checkPaths.includes(windProfileCheck), 'formal-tools-static must retain the wind shared profile contract');

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'formal-tools-static-contract-'));
  try {
    for (const checkPath of checkPaths) {
      const filePath = path.join(fixtureRoot, ...checkPath.split('\\'));
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, '// isolated child fixture\n', 'utf8');
    }
    const powershellPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    assert.ok(fs.existsSync(powershellPath), `Windows PowerShell 5.1 executable missing: ${powershellPath}`);

    function runScenario(failingIndex) {
      const nodeLogPath = path.join(fixtureRoot, `node-invocations-${failingIndex}.txt`);
      const scriptPath = path.join(fixtureRoot, `formal-tools-static-${failingIndex}.ps1`);
      const fakeNode = [
        'function node {',
        '  param([string]$check)',
        '  Add-Content -LiteralPath $env:GOVERNANCE_CONTRACT_NODE_LOG -Value $check -Encoding UTF8',
        '  $index = [Array]::IndexOf($env:GOVERNANCE_CONTRACT_CHECKS.Split("|"), $check)',
        '  $global:LASTEXITCODE = 0',
        '  if ($index -eq [int]$env:GOVERNANCE_CONTRACT_FAIL_INDEX) { $global:LASTEXITCODE = [int]$env:GOVERNANCE_CONTRACT_FAIL_CODE }',
        '  Write-Output "fixture child index=$index exit=$global:LASTEXITCODE"',
        '}'
      ].join('\r\n');
      const versionReceipt = 'Write-Output "powershell-version=$($PSVersionTable.PSVersion.ToString()) edition=$($PSVersionTable.PSEdition)"';
      const script = `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ${versionReceipt}\r\n${fakeNode}\r\n${command}\r\n`;
      fs.writeFileSync(scriptPath, `\uFEFF${script}`, 'utf8');
      const failCode = failingIndex >= 0 ? 17 + failingIndex : 0;
      const result = childProcess.spawnSync(powershellPath, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        timeout: 15000,
        env: {
          ...process.env,
          GOVERNANCE_CONTRACT_NODE_LOG: nodeLogPath,
          GOVERNANCE_CONTRACT_CHECKS: checkPaths.join('|'),
          GOVERNANCE_CONTRACT_FAIL_INDEX: String(failingIndex),
          GOVERNANCE_CONTRACT_FAIL_CODE: String(failCode)
        }
      });
      assert.equal(result.error, undefined, `isolated PowerShell command failed to launch: ${result.error?.message}`);
      assert.ok(result.stdout.includes('powershell-version=5.1'), `fixture must run under Windows PowerShell 5.1; output=${result.stdout}`);
      const invocations = fs.existsSync(nodeLogPath)
        ? fs.readFileSync(nodeLogPath, 'utf8').replace(/^\uFEFF/u, '').split(/\r?\n/).filter(Boolean)
        : [];
      return { result, invocations, output: `${result.stdout}\n${result.stderr}` };
    }

    const normal = runScenario(-1);
    assert.equal(normal.result.status, 0, `normal formal-tools-static fixture must pass; output=${normal.output}`);
    assert.deepEqual(normal.invocations, checkPaths, 'normal formal-tools-static fixture must execute every listed child in order');
    for (const checkPath of checkPaths) {
      assert.ok(normal.output.includes(`formal-tools-static child START: ${checkPath}`), `missing child start receipt for ${checkPath}`);
      assert.ok(normal.output.includes(`formal-tools-static child COMPLETE: ${checkPath} exit=0`), `missing child completion receipt for ${checkPath}`);
    }

    const propagatedExits = [];
    for (let failingIndex = 0; failingIndex < checkPaths.length; failingIndex += 1) {
      const failed = runScenario(failingIndex);
      const expectedExit = 17 + failingIndex;
      assert.equal(failed.result.status, expectedExit, `formal-tools-static must propagate child ${failingIndex + 1} exit=${expectedExit}; output=${failed.output}`);
      assert.deepEqual(failed.invocations, checkPaths.slice(0, failingIndex + 1), `formal-tools-static must stop after child ${failingIndex + 1} fails`);
      assert.ok(failed.output.includes(`formal-tools-static child COMPLETE: ${checkPaths[failingIndex]} exit=${expectedExit}`), `failed child completion must preserve exit code ${expectedExit}`);
      propagatedExits.push(expectedExit);
    }
    console.log(`formal-tools-static isolation passed under Windows PowerShell 5.1: normal child count=${checkPaths.length}, propagated exits=${propagatedExits.join(',')}, fail-fast verified at every child position`);
  } finally {
    const tempParent = path.resolve(os.tmpdir());
    const resolvedFixtureRoot = path.resolve(fixtureRoot);
    if (path.dirname(resolvedFixtureRoot) !== tempParent || !path.basename(resolvedFixtureRoot).startsWith('formal-tools-static-contract-')) {
      throw new Error(`Unsafe formal-tools-static fixture cleanup path: ${resolvedFixtureRoot}`);
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
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

  validateGovernanceInventory(REPO_ROOT);
  const repositorySizes = validateGovernanceDocumentSizes(REPO_ROOT);
  assert.equal(Object.keys(repositorySizes).length, Object.keys(GROUPS).length + Object.values(GROUPS).flat().length, 'repository inventory must cover each main document and registered book once');

  const missingBook = fixture('\n');
  tempRoots.push(missingBook.root);
  fs.unlinkSync(path.join(missingBook.root, ...GROUPS['README.md'][0].split('/')));
  assert.throws(() => validateGovernanceInventory(missingBook.root), /physical governance-current files must exactly match GROUPS/);

  const missingLedger04 = fixture('\n');
  tempRoots.push(missingLedger04.root);
  fs.unlinkSync(path.join(missingLedger04.root, ...GROUPS['STAGING_GROUPS.md'][3].split('/')));
  assert.throws(() => readGovernanceDocument(missingLedger04.root, 'STAGING_GROUPS.md'), /missing book/);

  const wrongStagingGroup = fixture('\n');
  tempRoots.push(wrongStagingGroup.root);
  const wrongStagingGroupMap = Object.fromEntries(Object.entries(GROUPS).map(([mainPath, bookPaths]) => [mainPath, [...bookPaths]]));
  const [ledger04] = wrongStagingGroupMap['STAGING_GROUPS.md'].splice(3, 1);
  wrongStagingGroupMap['README.md'].push(ledger04);
  assert.throws(() => validateGovernanceInventory(wrongStagingGroup.root, wrongStagingGroupMap), /registered under the wrong governance group/);

  const crossGroupLedger04 = fixture('\n');
  tempRoots.push(crossGroupLedger04.root);
  const ledger04Path = path.join(crossGroupLedger04.root, ...GROUPS['STAGING_GROUPS.md'][3].split('/'));
  fs.writeFileSync(ledger04Path, fs.readFileSync(ledger04Path, 'utf8').replace('<!-- P2-SEGMENT:SG-04-001 -->', '<!-- P2-SEGMENT:SG-03-001 -->'), 'utf8');
  assert.throws(() => readGovernanceDocument(crossGroupLedger04.root, 'STAGING_GROUPS.md'), /segment order mismatch|cross-group or unlisted segment/);

  const reorderedLedger04 = fixture('\n');
  tempRoots.push(reorderedLedger04.root);
  const reorderedLedger04Path = path.join(reorderedLedger04.root, ...GROUPS['STAGING_GROUPS.md'][3].split('/'));
  const reorderedLedger04Text = fs.readFileSync(reorderedLedger04Path, 'utf8')
    .replace('<!-- P2-SEGMENT:SG-04-001 -->', '<!-- P2-SEGMENT:SG-04-SWAP -->')
    .replace('<!-- P2-SEGMENT:SG-04-002 -->', '<!-- P2-SEGMENT:SG-04-001 -->')
    .replace('<!-- P2-SEGMENT:SG-04-SWAP -->', '<!-- P2-SEGMENT:SG-04-002 -->');
  fs.writeFileSync(reorderedLedger04Path, reorderedLedger04Text, 'utf8');
  assert.throws(() => readGovernanceDocument(reorderedLedger04.root, 'STAGING_GROUPS.md'), /segment order mismatch/);

  const extraBook = fixture('\n');
  tempRoots.push(extraBook.root);
  write(extraBook.root, `${GOVERNANCE_BOOKS_ROOT}/unregistered-extra.md`, 'extra physical book\n');
  assert.throws(() => validateGovernanceInventory(extraBook.root), /physical governance-current files must exactly match GROUPS/);

  const extraNestedFile = fixture('\n');
  tempRoots.push(extraNestedFile.root);
  write(extraNestedFile.root, `${GOVERNANCE_BOOKS_ROOT}/nested/unregistered.bin`, Buffer.from([0x00, 0x01, 0x02]));
  assert.throws(() => validateGovernanceInventory(extraNestedFile.root), /physical governance-current files must exactly match GROUPS/);

  const wrongGroup = fixture('\n');
  tempRoots.push(wrongGroup.root);
  const wrongGroupMap = Object.fromEntries(Object.entries(GROUPS).map(([mainPath, bookPaths]) => [mainPath, [...bookPaths]]));
  const [misplacedBook] = wrongGroupMap['README.md'].splice(0, 1);
  wrongGroupMap['TOOL_BOUNDARIES.md'].push(misplacedBook);
  const misplacedReadmePath = path.join(wrongGroup.root, 'README.md');
  const misplacedBoundariesPath = path.join(wrongGroup.root, 'TOOL_BOUNDARIES.md');
  fs.writeFileSync(misplacedReadmePath, fs.readFileSync(misplacedReadmePath, 'utf8').replace(`<!-- P2_INCLUDE:${misplacedBook} -->\n`, ''), 'utf8');
  fs.appendFileSync(misplacedBoundariesPath, `<!-- P2_INCLUDE:${misplacedBook} -->\n`, 'utf8');
  assert.throws(() => validateGovernanceInventory(wrongGroup.root, wrongGroupMap), /registered under the wrong governance group/);

  for (const relativePath of ['README.md', GROUPS['README.md'][0], GROUPS['STAGING_GROUPS.md'][3]]) {
    for (const eol of ['\n', '\r\n', '\r\n\n']) {
      const boundary = fixture('\n');
      tempRoots.push(boundary.root);
      const targetPath = path.join(boundary.root, ...relativePath.split('/'));
      fs.writeFileSync(targetPath, makeCapacityBytes(GOVERNANCE_DOCUMENT_MAX_BYTES, eol));
      assert.equal(validateGovernanceDocumentSizes(boundary.root)[relativePath], GOVERNANCE_DOCUMENT_MAX_BYTES, `${relativePath} raw UTF-8 bytes at the exact limit must pass for ${JSON.stringify(eol)}`);
      fs.writeFileSync(targetPath, makeCapacityBytes(GOVERNANCE_DOCUMENT_MAX_BYTES + 1, eol));
      assert.throws(() => validateGovernanceDocumentSizes(boundary.root), /raw bytes 60001 exceed 60000/, `${relativePath} raw UTF-8 bytes above the limit must fail for ${JSON.stringify(eol)}`);
    }
  }

  verifyFormalToolsStaticCommandIsolation();

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
  fs.appendFileSync(outPath, `<!--P2:SG-99-999-->\n`);
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

  function swapMarkers(mainText, firstId, secondId) {
    const first = `<!--P2:${firstId}-->`;
    const second = `<!--P2:${secondId}-->`;
    assert.equal(mainText.split(first).length - 1, 1, `fixture contains ${firstId} once`);
    assert.equal(mainText.split(second).length - 1, 1, `fixture contains ${secondId} once`);
    return mainText.replace(first, '<!--P2:SWAP-TEMP-->').replace(second, first).replace('<!--P2:SWAP-TEMP-->', second);
  }

  const reorderedStaging = fixture('\n');
  tempRoots.push(reorderedStaging.root);
  const reorderedStagingPath = path.join(reorderedStaging.root, 'STAGING_GROUPS.md');
  const reorderedStagingText = swapMarkers(fs.readFileSync(reorderedStagingPath, 'utf8'), 'SG-01-001', 'SG-01-002');
  fs.writeFileSync(reorderedStagingPath, reorderedStagingText, 'utf8');
  assert.throws(() => readGovernanceDocument(reorderedStaging.root, 'STAGING_GROUPS.md'), /staging main segment order mismatch/);

  const crossBookReordered = fixture('\n');
  tempRoots.push(crossBookReordered.root);
  const crossBookPath = path.join(crossBookReordered.root, 'STAGING_GROUPS.md');
  fs.writeFileSync(crossBookPath, swapMarkers(fs.readFileSync(crossBookPath, 'utf8'), 'SG-01-001', 'SG-02-001'), 'utf8');
  assert.throws(() => readGovernanceDocument(crossBookReordered.root, 'STAGING_GROUPS.md'), /staging main segment order mismatch/);

  console.log(`governance-documents contract passed: LF/CRLF reconstruction, inventory, raw-byte limits and isolated formal-tools-static propagation; repository docs=${Object.keys(repositorySizes).length}; maxBytes=${GOVERNANCE_DOCUMENT_MAX_BYTES}; sizes=${JSON.stringify(repositorySizes)}`);
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
