const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const runnerPath = path.join(__dirname, 'run-public-release-decision-restore-drill.ps1');
const managerPath = path.join(__dirname, 'manage-public-release-decision-restore-drill-task.ps1');
const runner = fs.readFileSync(runnerPath, 'utf8');
const manager = fs.readFileSync(managerPath, 'utf8');
const preflight = fs.readFileSync(path.join(repoRoot, 'preflight-tools.ps1'), 'utf8');

[
  "GetEnvironmentVariable('PUBLIC_RELEASE_DECISION_BACKUP_DIR', 'User')",
  'Test-Path -LiteralPath $externalDirectory -PathType Container',
  '$env:PUBLIC_RELEASE_DECISION_BACKUP_DIR = $externalDirectory',
  'public-release-decision-restore-drill.js',
  'public-release-decision-restore-drill-health.js',
  'public-release-decision-cloud-checkpoint.js',
  '--check --write --require-external --json --repo-root $repoRoot',
  '--write --require-external --json --repo-root $repoRoot',
  'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
  'exit $LASTEXITCODE',
].forEach(needle => assert.ok(runner.includes(needle), `weekly runner preserves ${needle}`));

[
  "[ValidateSet('Install', 'Status', 'Remove', 'Run')]",
  "[ValidateSet('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')]",
  "[ValidatePattern('^(?:[01]\\d|2[0-3]):[0-5]\\d$')]",
  "'StructuralTools-PublicReleaseDecisionRestoreDrill'",
  "[string]$WeeklyDay = 'Sunday'",
  "[string]$WeeklyAt = '09:15'",
  '-WindowStyle Hidden',
  'New-ScheduledTaskTrigger -Weekly -WeeksInterval 1 -DaysOfWeek $WeeklyDay',
  'New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew',
  'New-ScheduledTaskPrincipal',
  '-LogonType Interactive -RunLevel Limited',
  'Initial isolated external restore drill failed; scheduled task was not installed.',
  '& $runner | Out-Null',
  'Unregister-ScheduledTask -TaskName $taskName -Confirm:$false',
  'configurationValid = Test-ManagedTaskConfiguration',
  '[int64]$info.LastTaskResult -ne 267011',
  "([datetime]$trigger.StartBoundary).ToString('HH:mm') -eq $WeeklyAt",
  '$actions.Count -ne 1 -or $triggers.Count -ne 1',
  "$Task.Principal.LogonType -eq 'Interactive'",
  "$Task.Principal.RunLevel -eq 'Limited'",
  "$Task.Settings.MultipleInstances -eq 'IgnoreNew'",
  "[int]$trigger.DaysOfWeek -eq [int]$dayMasks[$WeeklyDay]",
  '[int]$trigger.WeeksInterval -eq 1',
].forEach(needle => assert.ok(manager.includes(needle), `task manager preserves ${needle}`));

assert.ok(manager.indexOf('& $runner') < manager.indexOf('Register-ScheduledTask'), 'installation performs a real isolated restore before registration');
assert.equal((manager.match(/& \$runner \| Out-Null/g) || []).length, 1, 'installation suppresses the drill payload so manager output stays one JSON document');
assert.equal(/-UserId\s+['"]?SYSTEM|RunLevel\s+Highest/i.test(manager), false, 'restore drill task never requests system identity or elevation');
assert.ok(preflight.includes('public-release-decision-restore-drill-task.test.js'), 'preflight includes weekly drill task contract');

console.log('public release decision restore drill task OK (runner=10, manager=22, guards=3)');
