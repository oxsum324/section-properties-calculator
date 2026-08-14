const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const runnerPath = path.join(__dirname, 'run-public-release-decision-backup-health.ps1');
const managerPath = path.join(__dirname, 'manage-public-release-decision-backup-health-task.ps1');
const runner = fs.readFileSync(runnerPath, 'utf8');
const manager = fs.readFileSync(managerPath, 'utf8');
const preflight = fs.readFileSync(path.join(repoRoot, 'preflight-tools.ps1'), 'utf8');

[
  "GetEnvironmentVariable('PUBLIC_RELEASE_DECISION_BACKUP_DIR', 'User')",
  'Test-Path -LiteralPath $externalDirectory -PathType Container',
  '$env:PUBLIC_RELEASE_DECISION_BACKUP_DIR = $externalDirectory',
  'public-release-decision-backup-health.js',
  'public-release-decision-restore-drill-health.js',
  'public-release-decision-cloud-checkpoint.js',
  '--check --write --require-external --json --repo-root $repoRoot',
  '--write --require-external --json --repo-root $repoRoot',
  'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
  'exit $LASTEXITCODE',
].forEach(needle => assert.ok(runner.includes(needle), `daily runner preserves ${needle}`));

[
  "[ValidateSet('Install', 'Status', 'Remove', 'Run')]",
  "[ValidatePattern('^(?:[01]\\d|2[0-3]):[0-5]\\d$')]",
  "'StructuralTools-PublicReleaseDecisionBackupHealth'",
  '-WindowStyle Hidden',
  'New-ScheduledTaskTrigger -Daily',
  'New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew',
  'New-ScheduledTaskPrincipal',
  '-LogonType Interactive -RunLevel Limited',
  'Initial external backup health verification failed; scheduled task was not installed.',
  '& $runner | Out-Null',
  'Unregister-ScheduledTask -TaskName $taskName -Confirm:$false',
  'configurationValid = Test-ManagedTaskConfiguration',
  '[int64]$info.LastTaskResult -ne 267011',
  "([datetime]$trigger.StartBoundary).ToString('HH:mm') -eq $DailyAt",
  '$actions.Count -ne 1 -or $triggers.Count -ne 1',
  "$Task.Principal.LogonType -eq 'Interactive'",
  "$Task.Principal.RunLevel -eq 'Limited'",
  "$Task.Settings.MultipleInstances -eq 'IgnoreNew'",
].forEach(needle => assert.ok(manager.includes(needle), `task manager preserves ${needle}`));

assert.ok(manager.indexOf('& $runner') < manager.indexOf('Register-ScheduledTask'), 'installation validates real backup health before task registration');
assert.equal((manager.match(/& \$runner \| Out-Null/g) || []).length, 1, 'installation suppresses the health payload so manager output stays one JSON document');
assert.equal(/-UserId\s+['"]?SYSTEM|RunLevel\s+Highest/i.test(manager), false, 'health task never requests system identity or elevation');
assert.ok(preflight.includes('public-release-decision-backup-task.test.js'), 'preflight includes the scheduled health contract');

console.log('public release decision backup task OK (runner=10, manager=17, guards=3)');
