'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const shell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
const tracked = spawnSync('git', ['ls-files', '-z', '*.ps1'], { cwd: root, encoding: 'utf8', windowsHide: true });
assert.equal(tracked.status, 0, tracked.stderr);
const files = tracked.stdout.split('\0').filter(Boolean);
assert.ok(files.length > 0, 'tracked PowerShell scripts must be scanned');
const fixtures = [
  { path: 'fixture/valid.ps1', text: "Get-Content -Raw -Encoding UTF8 $p | ConvertFrom-Json\nSet-Content -Encoding UTF8 $p '中文'\nOut-File -Encoding UTF8 $p\n[IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)\n# Get-Content omitted in a comment\n'Get-Content omitted in a string'" },
  { path: 'fixture/missing.ps1', text: "Get-Content `\n -Raw $p | ConvertFrom-Json\n[IO.File]::ReadAllText($p)\nSet-Content $p '中文'\nOut-File $p" },
  { path: 'fixture/wrong.ps1', text: 'Get-Content -Encoding Default $p\nSet-Content -Encoding Ascii $p' },
];
const inputs = [...files.map(file => ({ path: file, text: fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '') })), ...fixtures];
// The parser ignores comments and string literals and preserves multiline command extents.
const parser = String.raw`
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) { throw 'Windows PowerShell 5.1 required' }
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$inputs = [Console]::In.ReadToEnd() | ConvertFrom-Json
$rows = @()
$parseErrors = @()
foreach ($inputFile in $inputs) {
 $tokens = $null; $errors = $null
 $ast = [Management.Automation.Language.Parser]::ParseInput($inputFile.text, [ref]$tokens, [ref]$errors)
 foreach ($errorItem in $errors) { $parseErrors += [pscustomobject]@{ file=$inputFile.path; line=$errorItem.Extent.StartLineNumber; message=$errorItem.Message } }
 $commands = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.CommandAst] }, $true)
 foreach ($command in $commands) {
  $name = $command.GetCommandName()
  if ($name -notin @('Get-Content','Set-Content','Out-File')) { continue }
  $encoding = $null; $encodingCount = 0
  for ($i=0; $i -lt $command.CommandElements.Count; $i++) {
   $element = $command.CommandElements[$i]
   if ($element -is [Management.Automation.Language.CommandParameterAst] -and $element.ParameterName -eq 'Encoding') {
    $encodingCount++
    $argument = $element.Argument
    if ($null -eq $argument -and $i+1 -lt $command.CommandElements.Count) { $argument = $command.CommandElements[$i+1] }
    if ($argument -is [Management.Automation.Language.StringConstantExpressionAst]) { $encoding = $argument.Value }
   }
  }
  $rows += [pscustomobject]@{ file=$inputFile.path; line=$command.Extent.StartLineNumber; command=$name; encoding=$encoding; encodingCount=$encodingCount; text=$command.Extent.Text }
 }
 $methods = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $node.Member.Value -eq 'ReadAllText' }, $true)
 foreach ($method in $methods) {
  $explicitUtf8 = $method.Arguments.Count -eq 2 -and $method.Arguments[1].Extent.Text -match '^\[(?:System\.)?Text\.Encoding\]::UTF8$'
  $rows += [pscustomobject]@{ file=$inputFile.path; line=$method.Extent.StartLineNumber; command='ReadAllText'; encoding=$(if ($explicitUtf8) {'UTF8'} else {$null}); encodingCount=$(if ($explicitUtf8) {1} else {0}); text=$method.Extent.Text }
 }
}
[pscustomobject]@{ shellVersion=$PSVersionTable.PSVersion.ToString(); rows=@($rows); parseErrors=@($parseErrors) } | ConvertTo-Json -Depth 6 -Compress
`;
const parsed = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(parser, 'utf16le').toString('base64')], {
  cwd: root, encoding: 'utf8', input: JSON.stringify(inputs), windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
});
assert.equal(parsed.error, undefined, parsed.error?.message);
assert.equal(parsed.status, 0, parsed.stderr);
const result = JSON.parse(parsed.stdout.replace(/^\uFEFF/, '').trim());
assert.match(result.shellVersion, /^5\.1\./);
assert.deepEqual(result.parseErrors, [], 'all scripts and fixtures must parse');
const whitelist = [{
  file: 'preflight-tools.ps1', line: 287, command: 'Set-Content', encoding: 'Unicode',
  reason: 'Existing UTF-16 temporary child script preserves its output format; T53 only moves this exact exception after adding the ownership gate; the existing UTF-16 output format stays unchanged.',
}];
assert.ok(whitelist.every(entry => entry.reason.trim().length > 0), 'each encoding exception needs a reason');
const accepted = row => row.encodingCount === 1 && (/^utf8(?:bom)?$/i.test(row.encoding || '') || whitelist.some(entry =>
  row.file === entry.file && row.line === entry.line && row.command === entry.command && row.encoding === entry.encoding));
assert.deepEqual(result.rows.filter(row => row.file === 'fixture/valid.ps1').filter(row => !accepted(row)), []);
assert.deepEqual(result.rows.filter(row => row.file === 'fixture/missing.ps1').filter(row => !accepted(row)).map(row => row.command),
  ['Get-Content', 'Set-Content', 'Out-File', 'ReadAllText']);
assert.equal(result.rows.filter(row => row.file === 'fixture/wrong.ps1').filter(row => !accepted(row)).length, 2);
const actual = result.rows.filter(row => !row.file.startsWith('fixture/'));
const failures = actual.filter(row => !accepted(row));
assert.deepEqual(failures.map(row => `${row.file}:${row.line} ${row.command} requires explicit UTF-8`), [], 'PowerShell text I/O encoding contract');
assert.equal(actual.filter(row => whitelist.some(entry => row.file === entry.file && row.line === entry.line && row.command === entry.command)).length,
  whitelist.length, 'documented exceptions must remain exact and used');
console.log(`PowerShell encoding contract OK (${files.length} tracked scripts, ${actual.length} text I/O commands, PS ${result.shellVersion}, ${whitelist.length} justified write-format exception)`);
