'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { PRIVATE_FILES, classifyPublishedPath } = require('./結構工具箱/tools/build-pages-artifact');
const { runtimes, headerFor } = require('./結構工具箱/tools/build-minified-runtimes');

const root = __dirname;
const sourcePath = '結構工具箱/tools/a11y/tool-page-a11y.source.js';
const buildPath = '結構工具箱/tools/build-tool-page-a11y.js';
const publicPath = path.join(root, 'tool-page-a11y.js');
const header = `/* generated from ${sourcePath} by build-tool-page-a11y.js; do not edit */`;
for (const relativePath of [sourcePath, buildPath]) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} must exist`);
  assert.ok(PRIVATE_FILES.has(relativePath), `${relativePath} must be explicitly private`);
  assert.equal(classifyPublishedPath(relativePath).publish, false, `${relativePath} must not enter Pages`);
}
assert.equal(classifyPublishedPath('tool-page-a11y.js').publish, true, 'the existing runtime path stays public');
const check = spawnSync(process.execPath, [path.join(root, buildPath), '--check'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
});
assert.equal(check.error, undefined, `build check should start: ${check.error?.message}`);
assert.equal(check.status, 0, `generated runtime must match source bytes: ${check.stderr}`);
const canonicalPath = '結構工具箱/tools/build-minified-runtimes.js';
const canonicalCheck = spawnSync(process.execPath, [path.join(root, canonicalPath), '--check'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
});
assert.equal(canonicalCheck.error, undefined, `canonical build check should start: ${canonicalCheck.error?.message}`);
assert.equal(canonicalCheck.status, 0, `all generated runtime bytes must match sources: ${canonicalCheck.stderr}`);
const sourcePaths = new Set(runtimes.map(runtime => runtime.source));
for (const relativePath of [...sourcePaths, canonicalPath, buildPath]) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} must exist`);
  assert.ok(PRIVATE_FILES.has(relativePath), `${relativePath} must be explicitly private`);
  assert.equal(classifyPublishedPath(relativePath).publish, false, `${relativePath} must not enter Pages`);
}
const runtimeByteLimits = { 'steel-app': 145458, 'steel-calculator': 156430, 'survey-report-ui': 26760, 'survey-signoff-ui': 22663, 'survey-sketch': 18191, 'survey-detail': 22706, 'survey-model': 52744, 'src-column-page': 74772, 'src-beam-page': 27802, 'src-beam-core': 13287, 'wind-report': 31211, 'seismic-zones': 44460, 'wind-shared-profile': 8836, 'rc-common': 10866, home: 78919, a11y: 10500, profile: 39000, wind: 45000, 'report-docx': 12800, 'tool-workflow': 7548, 'workflow-adapters': 6190, 'toolbox-storage': 16627, 'rc-storage': 4947, 'loadcombo': 30728 };
for (const runtimeDefinition of runtimes) {
  const runtimePath = path.join(root, runtimeDefinition.output);
  assert.equal(classifyPublishedPath(runtimeDefinition.output).publish, true, `${runtimeDefinition.output} stays public`);
  const bytes = fs.readFileSync(runtimePath);
  assert.ok(Number.isSafeInteger(runtimeByteLimits[runtimeDefinition.id]), `${runtimeDefinition.id} has a measured byte limit`);
  assert.ok(bytes.length <= runtimeByteLimits[runtimeDefinition.id], `${runtimeDefinition.output} exceeds ${runtimeByteLimits[runtimeDefinition.id]} bytes: ${bytes.length}`);
  assert.ok(!fs.readFileSync(path.join(root, runtimeDefinition.source)).includes(13), `${runtimeDefinition.source} uses LF`);
  assert.equal(bytes.toString('utf8').split('\n')[0], headerFor(runtimeDefinition),
    `${runtimeDefinition.output} retains its generated marker`);
  assert.ok(!bytes.includes(13), `${runtimeDefinition.output} uses LF`);
  if (runtimeDefinition.module) {
    const syntax = spawnSync(process.execPath, ['--check', runtimePath], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(syntax.error, undefined, `${runtimeDefinition.output} module syntax check should start`);
    assert.equal(syntax.status, 0, `${runtimeDefinition.output} retains valid ES module syntax: ${syntax.stderr}`);
  } else new vm.Script(bytes.toString('utf8'), { filename: runtimeDefinition.output });
}
const runtime = fs.readFileSync(publicPath);
assert.ok(runtime.length <= 10500, `runtime exceeds 10,500 bytes: ${runtime.length}`);
assert.equal(runtime.toString('utf8').split('\n')[0], header, 'the first line must identify the generated source');
assert.ok(!runtime.includes(13), 'generated runtime uses LF on every checkout');
new vm.Script(runtime.toString('utf8'), { filename: 'tool-page-a11y.js' });

function extractLiteral(source, name) {
  const prefix = `const ${name} = `;
  const start = source.indexOf(prefix);
  assert.ok(start >= 0, `home.js must define ${name}`);
  const valueStart = start + prefix.length;
  const open = source[valueStart], close = open === '[' ? ']' : '}';
  let depth = 0, quote = null;
  for (let index = valueStart; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (character === '\\') index++;
      else if (character === quote) quote = null;
    } else if (["'", '"', '`'].includes(character)) quote = character;
    else if (character === open) depth++;
    else if (character === close && --depth === 0) {
      return vm.runInNewContext(`(${source.slice(valueStart, index + 1)})`, {}, { timeout: 1000 });
    }
  }
  throw new Error(`Unterminated ${name}`);
}

const toolboxRoot = path.join(root, '結構工具箱');
const home = fs.readFileSync(path.join(toolboxRoot, 'assets/home/src/home.source.js'), 'utf8');
const tools = extractLiteral(home, 'tools').filter(tool => tool.state === 'formal');
const routeFileMap = extractLiteral(home, 'routeFileMap');
const dependencies = extractLiteral(home, 'HOME_TOOL_UPDATE_DEPENDENCIES').routes;
const homeRoutes = dependencies;
assert.deepEqual(Array.from(homeRoutes['/toolbox-home']), [
  '結構工具箱/assets/home/home.js', '結構工具箱/assets/home/src/home.source.js',
], 'homepage registers its unchanged runtime and readable source');
for (const runtimeDefinition of runtimes) {
  for (const [route, files] of Object.entries(homeRoutes)) {
    if (files.includes(runtimeDefinition.output)) assert.ok(files.includes(runtimeDefinition.source), `${route} registers readable source for ${runtimeDefinition.id}`);
  }
}
const existingHomeRoutes = Object.fromEntries(Object.entries(homeRoutes).filter(([route]) => route !== '/concrete-strength-ndt'));
assert.equal(Object.values(existingHomeRoutes).filter(files => files.includes('結構工具箱/tools/project-meta-profile.js')).length, 42,
  'all 42 profile runtime date dependencies stay registered');
assert.equal(Object.values(existingHomeRoutes).filter(files => files.includes('結構工具箱/tools/src/project-meta-profile.source.js')).length, 42,
  'all 42 profile source date dependencies are registered');
assert.equal(Object.values(homeRoutes).filter(files => files.includes('結構工具箱/core/loads/wind.js')).length, 16,
  'all 16 core wind runtime date dependencies stay registered');
assert.equal(Object.values(homeRoutes).filter(files => files.includes('結構工具箱/core/loads/src/wind.source.js')).length, 17,
  'all 16 core wind and the stone vendor source date dependencies are registered');
assert.ok(homeRoutes['/stone-fixing']?.includes('石材固定/vendor/loads/wind.js'),
  'stone page keeps its generated vendor wind dependency');
assert.equal(tools.length, 40, 'all 40 formal homepage tools must retain the runtime');
assert.equal(Object.entries(dependencies).filter(([route, files]) => route !== '/concrete-strength-ndt' && files.includes(sourcePath)).length, 40,
  'readable source must update the same 40 homepage dates');
const ndtTool = extractLiteral(home, 'tools').find(tool => tool.href === '/concrete-strength-ndt');
assert.equal(ndtTool?.state, 'assist', 'NDT accessibility coverage cannot grant formal status');
assert.ok(homeRoutes[ndtTool.href]?.includes('結構工具箱/tools/project-meta-profile.js'), 'NDT registers the existing profile runtime');
assert.ok(homeRoutes[ndtTool.href]?.includes('結構工具箱/tools/src/project-meta-profile.source.js'), 'NDT registers the profile readable source');
assert.equal(Object.values(homeRoutes).filter(files => files.includes('結構工具箱/tools/project-meta-profile.js')).length, 43, '42 existing profile routes plus NDT');
assert.equal(Object.values(dependencies).filter(files => files.includes(sourcePath)).length, 41, '40 existing a11y sources plus explicit NDT assist coverage');
for (const tool of [...tools, ndtTool]) {
  assert.ok(routeFileMap[tool.href], `formal route must map to HTML: ${tool.href}`);
  const htmlPath = path.resolve(toolboxRoot, routeFileMap[tool.href]);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*)>/gi)];
  const references = scripts.filter(match => /(?:^|\/)tool-page-a11y\.js$/.test(match[2]));
  assert.equal(references.length, 1, `${tool.href} loads the unchanged runtime exactly once`);
  const reference = references[0];
  assert.equal(path.resolve(path.dirname(htmlPath), reference[2]), publicPath, `${tool.href} preserves its relative runtime path`);
  assert.match(reference[1], /\bdefer\b/, `${tool.href} retains defer`);
  const profile = scripts.find(match => /(?:^|\/)project-meta-profile\.js$/.test(match[2]));
  if (profile) {
    assert.ok(reference.index < profile.index, `${tool.href} keeps a11y before project-meta-profile.js`);
    const bodyEnd = html.lastIndexOf('</body>');
    const profilePosition = html.lastIndexOf('project-meta-profile.js');
    assert.ok(bodyEnd > profilePosition && bodyEnd - profilePosition <= 200, `${tool.href} keeps profile next to body end`);
    assert.equal(scripts.at(-1), profile, `${tool.href} keeps profile as the last external script`);
    assert.doesNotMatch(html.slice(profile.index + profile[0].length, bodyEnd), /<script\b/i,
      `${tool.href} must not append inline scripts after profile`);
  }
  assert.ok(dependencies[tool.href]?.includes('tool-page-a11y.js'), `${tool.href} keeps the public runtime date dependency`);
  assert.ok(dependencies[tool.href]?.includes(sourcePath), `${tool.href} adds the readable source date dependency`);
}

assert.ok(fs.statSync(path.join(root, '結構工具箱/tools/project-meta-profile.js')).size <= 39000,
  'project-meta-profile.js must meet the 39,000-byte target (Terser-only output; no source aliasing)');
assert.ok(fs.statSync(path.join(root, '結構工具箱/core/loads/wind.js')).size <= 45000,
  'wind.js must meet the 45,000-byte target');

const steelRuntimes = runtimes.filter(runtime => ['steel-app', 'steel-calculator'].includes(runtime.id));
assert.equal(steelRuntimes.length, 2, 'both steel runtimes are deterministically built');
const steelSourceBytes = steelRuntimes.reduce((sum, runtime) => sum + fs.statSync(path.join(root, runtime.source)).size, 0);
const steelOutputBytes = steelRuntimes.reduce((sum, runtime) => sum + fs.statSync(path.join(root, runtime.output)).size, 0);
assert.ok(steelOutputBytes <= steelSourceBytes * 0.70, `steel output exceeds 70% of unchanged readable sources: ${steelOutputBytes}/${steelSourceBytes}`);

// 錨栓部署鏡像：同步腳本先在暫存目錄補回 dist index 的無障礙標籤（冪等），全部成功後才覆寫 anchor/
const anchorHelperPath = '結構工具箱/tools/anchor-a11y-tag.js';
assert.ok(PRIVATE_FILES.has(anchorHelperPath), `${anchorHelperPath} must be explicitly private`);
assert.equal(classifyPublishedPath(anchorHelperPath).publish, false, `${anchorHelperPath} must not enter Pages`);
const { ANCHOR_A11Y_TAG, ensureAnchorA11yTag } = require(`./${anchorHelperPath}`);
const insertBefore = (html, index) => html.slice(0, index) + ANCHOR_A11Y_TAG + html.slice(index);
const distLike = '<!doctype html>\n<html lang="zh-Hant">\n  <body>\n    <div id="root"></div>\n  </body>\n</html>\n';
const patched = ensureAnchorA11yTag(distLike);
assert.equal(patched.changed, true, 'a dist index without the tag is patched');
assert.equal(patched.html, `<!doctype html>\n<html lang="zh-Hant">\n  <body>\n    <div id="root"></div>\n  ${ANCHOR_A11Y_TAG}\n</body>\n</html>\n`,
  'an own-line </body> keeps the established two-space tag line format');
assert.deepEqual(ensureAnchorA11yTag(patched.html), { html: patched.html, changed: false }, 'patching is idempotent');
const singleLine = '<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>錨栓</title>'
  + '<script type="module" crossorigin src="./assets/index-x.js"></script></head><body><div id="root"></div></body></html>';
assert.equal(ensureAnchorA11yTag(singleLine).html, insertBefore(singleLine, singleLine.lastIndexOf('</body>')),
  'a single-line dist keeps its whole head and body');
const sameLine = '<html>\n  <body>\n    <div id="root"></div></body>\n</html>\n';
assert.equal(ensureAnchorA11yTag(sameLine).html, insertBefore(sameLine, sameLine.lastIndexOf('</body>')),
  'content sharing the </body> line is kept');
const upper = '<HTML>\n<BODY>\n<script>var s = "</body>";</script>\n<DIV ID="root"></DIV>\n</BODY>\n</HTML>\n';
assert.equal(ensureAnchorA11yTag(upper).html, upper.replace('\n</BODY>', `\n  ${ANCHOR_A11Y_TAG}\n</BODY>`),
  'the last </body> is matched case-insensitively and keeps its casing');
const crlf = distLike.replace(/\n/g, '\r\n');
const crlfPatched = ensureAnchorA11yTag(crlf).html;
assert.equal(crlfPatched, patched.html.replace(/\n/g, '\r\n'), 'CRLF input keeps CRLF');
assert.doesNotMatch(crlfPatched, /(?<!\r)\n/, 'CRLF input gains no bare LF');
assert.equal(ensureAnchorA11yTag(`﻿${distLike}`).html, `﻿${patched.html}`, 'a UTF-8 BOM is kept');
const twoTags = patched.html.replace('</body>', `${ANCHOR_A11Y_TAG}</body>`);
assert.throws(() => ensureAnchorA11yTag(twoTags), /2 accessibility runtime tags/, 'duplicate tags are rejected');
const noBody = '<!doctype html><html><head></head><div id="root"></div></html>';
assert.throws(() => ensureAnchorA11yTag(noBody), /no <\/body>/, 'a missing </body> is rejected');
assert.throws(() => ensureAnchorA11yTag(distLike.replace('  </body>', '<script src="../tool-page-a11y.js"></script></body>')),
  /references/, 'a non-canonical runtime reference is rejected instead of duplicated');
const anchorFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-a11y-tag-'));
try {
  const runHelper = file => spawnSync(process.execPath, [path.join(root, anchorHelperPath), file], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  });
  const fixtureDir = path.join(anchorFixtureRoot, '中文 路徑');
  fs.mkdirSync(fixtureDir);
  const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
  const okFile = path.join(fixtureDir, 'index.html');
  fs.writeFileSync(okFile, Buffer.concat([bom, Buffer.from(crlf, 'utf8')]));
  const added = runHelper(okFile);
  assert.equal(added.status, 0, `helper CLI patches a BOM/CRLF file: ${added.stderr}`);
  const expectedBytes = Buffer.concat([bom, Buffer.from(crlfPatched, 'utf8')]);
  assert.ok(fs.readFileSync(okFile).equals(expectedBytes), 'helper CLI keeps the BOM and CRLF bytes');
  const again = runHelper(okFile);
  assert.equal(again.status, 0, `helper CLI rerun succeeds: ${again.stderr}`);
  assert.match(again.stdout, /already present/, 'helper CLI rerun reports the tag as present');
  assert.ok(fs.readFileSync(okFile).equals(expectedBytes), 'helper CLI rerun leaves bytes unchanged');
  for (const [name, html, pattern] of [['two-tags.html', twoTags, /2 accessibility runtime tags/], ['no-body.html', noBody, /no <\/body>/]]) {
    const file = path.join(fixtureDir, name);
    fs.writeFileSync(file, html, 'utf8');
    const failed = runHelper(file);
    assert.notEqual(failed.status, 0, `helper CLI exits non-zero for ${name}`);
    assert.match(failed.stderr, pattern, `helper CLI explains the ${name} failure`);
    assert.equal(fs.readFileSync(file, 'utf8'), html, `helper CLI does not write ${name}`);
  }
} finally {
  fs.rmSync(anchorFixtureRoot, { recursive: true, force: true });
}
const committedAnchor = fs.readFileSync(path.join(root, 'anchor', 'index.html'), 'utf8');
assert.equal(ensureAnchorA11yTag(committedAnchor).changed, false, 'committed anchor index already holds the runtime tag');

const syncScriptBytes = fs.readFileSync(path.join(root, 'sync-anchor-deployment.ps1'));
assert.ok(syncScriptBytes.every(byte => byte < 0x80), 'sync-anchor-deployment.ps1 stays pure ASCII for Windows PowerShell 5.1');
const syncScript = syncScriptBytes.toString('utf8');
const decodeSyncDirName = variable => {
  const codes = syncScript.match(new RegExp(`^\\$${variable} = -join \\(\\[char\\[\\]\\]@\\(([0-9A-Fa-fx, ]+)\\)\\)\\r?$`, 'm'));
  assert.ok(codes, `sync script spells $${variable} with ASCII code points`);
  return String.fromCharCode(...codes[1].split(',').map(code => Number(code.trim())));
};
assert.equal(decodeSyncDirName('toolboxDirName'), anchorHelperPath.split('/')[0],
  'sync script code points decode to the helper toolbox directory');
const boltFamilyDirName = decodeSyncDirName('boltFamilyDirName');
assert.equal(boltFamilyDirName, '螺栓檢討', 'sync script code points decode to the bolt family directory');
assert.ok(fs.statSync(path.join(root, boltFamilyDirName, 'bolt-review-tool', 'src', 'App.tsx')).isFile(),
  'decoded bolt family directory holds the actual bolt review app');

// 傳回同步腳本違反「確切路徑定位、先在暫存目錄補標籤、檢查退出碼，才覆寫 anchor/」的項目；空陣列代表通過。
function anchorSyncProblems(script) {
  const code = script.split(/\r?\n/).map(line => (/^\s*#/.test(line) ? '' : line));
  const problems = [];
  const boltAt = code.findIndex(line => /^\s*\$boltRoot\s*=/.test(line));
  if (boltAt < 0 || code[boltAt].trim() !== "$boltRoot = Join-Path (Join-Path $root $boltFamilyDirName) 'bolt-review-tool'") {
    problems.push('bolt review app is not located at its exact path');
  }
  if (boltAt >= 0 && /Get-ChildItem|Select-Object\s+-First\s+1/i.test(code.slice(boltAt, boltAt + 6).join('\n'))) {
    problems.push('bolt review app lookup scans directories');
  }
  if (boltAt < 0 || !/^\s*if \(-not \(Test-Path -LiteralPath \(Join-Path \$boltRoot 'src\\App\.tsx'\) -PathType Leaf\)\) \{\s*$/.test(code[boltAt + 1] || '')
    || !/^\s*throw\b/.test(code[boltAt + 2] || '')) {
    problems.push('a missing bolt review app does not stop the sync');
  }
  const helperDefinitions = code.filter(line => /^\s*\$a11yHelper\s*=/.test(line));
  if (!helperDefinitions.some(line => line.includes("Join-Path (Join-Path (Join-Path $root $toolboxDirName) 'tools') 'anchor-a11y-tag.js'"))) {
    problems.push('helper is not located at its exact toolbox path');
  }
  if (/Select-Object\s+-First\s+1/i.test(code.slice(code.findIndex(line => /^\s*\$a11yHelper\s*=/.test(line))).slice(0, 6).join('\n'))) {
    problems.push('helper lookup takes the first scan match');
  }
  const calls = code.flatMap((line, index) => {
    const match = line.match(/^\s*&?\s*node\s+\$a11yHelper\b\s*(.*)$/i);
    return match ? [{ index, target: match[1].trim() }] : [];
  });
  if (calls.length !== 1) return [...problems, `expected one helper call, found ${calls.length}`];
  const [call] = calls;
  const buildAt = code.findIndex(line => /^\s*npm run build\s*$/.test(line));
  if (buildAt < 0 || helperDefinitions.length === 0 || code.findIndex(line => /^\s*\$a11yHelper\s*=/.test(line)) > buildAt) {
    problems.push('helper is not located before the build');
  }
  const targetDefinition = /^\$\w+$/.test(call.target)
    ? code.find(line => line.trim().startsWith(`${call.target} =`)) : undefined;
  if (!targetDefinition || !/=\s*Join-Path \$staging 'index\.html'\s*$/.test(targetDefinition)) {
    problems.push(`helper target ${call.target} is not the staged index`);
  }
  const nextAt = code.findIndex((line, index) => index > call.index && line.trim() !== '');
  const exitCheckAt = nextAt >= 0 && /^\s*if\s*\(\s*\$LASTEXITCODE\s+-ne\s+0\s*\)\s*\{\s*$/i.test(code[nextAt]) ? nextAt : -1;
  if (exitCheckAt < 0) problems.push('helper call is not followed by a $LASTEXITCODE check');
  else if (!/^\s*(?:throw|exit)\b/i.test(code[exitCheckAt + 1] || '')) problems.push('$LASTEXITCODE check does not stop the sync');
  const overwrites = code.flatMap((line, index) =>
    (/\b(?:Remove-Item|Copy-Item|Move-Item|Set-Content|Out-File)\b.*\$(?:resolvedAnchor|resolvedAssets|anchor|manifestPath)\b/i.test(line) ? [index] : []));
  if (overwrites.length === 0) problems.push('no anchor/ overwrite found');
  const guardAt = Math.max(call.index, exitCheckAt);
  if (overwrites.some(index => index < guardAt)) problems.push('anchor/ is overwritten before the staged index is patched and checked');
  if (!/\} finally \{\s*\r?\n\s*if \(Test-Path -LiteralPath \$staging\) \{\s*\r?\n\s*Remove-Item -LiteralPath \$staging -Recurse -Force/.test(script)) {
    problems.push('staging directory is not removed in a finally block');
  }
  return problems;
}
assert.deepEqual(anchorSyncProblems(syncScript), [], 'sync-anchor-deployment.ps1 patches the staged index before overwriting anchor/');
const mutateSync = (from, to) => {
  assert.ok(syncScript.includes(from), `mutation anchor exists in sync script: ${JSON.stringify(from)}`);
  return syncScript.replace(from, to);
};
const eolText = syncScript.includes('\r\n') ? '\r\n' : '\n';
const helperCallLine = `  node $a11yHelper $stagedIndex${eolText}`;
const exitCheckBlock = [
  '  if ($LASTEXITCODE -ne 0) {',
  '    throw "anchor accessibility helper failed with exit code $LASTEXITCODE; anchor/ was not modified"',
  '  }',
].join(eolText) + eolText;
const mirrorLine = `  Copy-Item -Path (Join-Path $staging '*') -Destination $resolvedAnchor -Recurse -Force${eolText}`;
const exactBoltLookup = [
  "$boltRoot = Join-Path (Join-Path $root $boltFamilyDirName) 'bolt-review-tool'",
  "if (-not (Test-Path -LiteralPath (Join-Path $boltRoot 'src\\App.tsx') -PathType Leaf)) {",
].join(eolText) + eolText;
const scanningBoltLookup = [
  '$boltRoot = Get-ChildItem -LiteralPath $root -Directory |',
  "  ForEach-Object { Join-Path $_.FullName 'bolt-review-tool' } |",
  "  Where-Object { Test-Path -LiteralPath (Join-Path $_ 'src\\App.tsx') } |",
  '  Select-Object -First 1',
  'if (-not $boltRoot) {',
].join(eolText) + eolText;
const anchorSyncMutations = {
  'bolt lookup reverted to scan': [mutateSync(exactBoltLookup, scanningBoltLookup), /bolt review app lookup scans directories/],
  'helper call removed': [mutateSync(helperCallLine, ''), /expected one helper call, found 0/],
  '$LASTEXITCODE check removed': [mutateSync(exitCheckBlock, ''), /not followed by a \$LASTEXITCODE check/],
  'tag patch moved after overwrite': [
    mutateSync(helperCallLine + exitCheckBlock, '').replace(mirrorLine, mirrorLine + helperCallLine + exitCheckBlock),
    /overwritten before the staged index is patched/,
  ],
};
for (const [name, [mutated, expected]] of Object.entries(anchorSyncMutations)) {
  assert.notEqual(mutated, syncScript, `mutation "${name}" changes the script`);
  const problems = anchorSyncProblems(mutated);
  assert.ok(problems.some(problem => expected.test(problem)), `mutation "${name}" is caught: ${JSON.stringify(problems)}`);
}

console.log(`tool-page-a11y build contract passed: ${runtime.length} bytes, exact generated bytes, private source/build, 40 routes, anchor sync patches the staged runtime tag before mirroring (${Object.keys(anchorSyncMutations).length} mutations caught)`);
