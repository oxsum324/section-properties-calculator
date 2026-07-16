const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = __dirname;

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8');
}

const workflow = readText('.github/workflows/pr-validation.yml');
const preflight = readText('preflight-tools.ps1');
const ciWrapper = readText('run-preflight-tools-ci.bat');
const readme = readText('README.md');
const staging = readText('STAGING_GROUPS.md');
const toolBoundaries = readText('TOOL_BOUNDARIES.md');

assert.ok(workflow.includes('name: PR validation'), 'PR validation workflow has a stable display name');
assert.ok(workflow.includes('pull_request:') && workflow.includes('- master'), 'PR validation runs for pull requests targeting master');
assert.ok(workflow.includes('workflow_dispatch:'), 'PR validation can be rerun manually');
assert.equal(workflow.includes('pull_request_target:'), false, 'PR validation never executes untrusted code with pull_request_target');
assert.match(workflow, /permissions:\s*[\s\S]*?contents:\s*read/, 'PR validation uses read-only repository permissions');
assert.ok(workflow.includes('cancel-in-progress: true'), 'superseded PR validation runs are cancelled');
assert.ok(workflow.includes('runs-on: windows-latest'), 'PR validation matches the Windows-first local preflight environment');
assert.ok(workflow.includes('timeout-minutes: 30'), 'PR validation has a bounded runtime');
assert.ok(workflow.includes('uses: actions/checkout@v7'), 'PR validation uses the current checkout action');
assert.ok(workflow.includes('fetch-depth: 0'), 'PR validation fetches history for source-date governance checks');
assert.ok(workflow.includes('persist-credentials: false'), 'PR validation does not retain checkout credentials');
assert.ok(workflow.includes('uses: actions/setup-node@v6') && workflow.includes('node-version: 24'), 'PR validation pins Node 24');
assert.ok(workflow.includes('package-manager-cache: false'), 'PR validation does not enable an unused package-manager cache');
assert.ok(workflow.includes('uses: actions/setup-python@v6') && workflow.includes("python-version: '3.14'"), 'PR validation pins Python 3.14');
assert.ok(workflow.includes('shell: cmd') && workflow.includes('call run-preflight-tools-ci.bat'), 'PR validation calls the clean-checkout CI wrapper');
assert.ok(workflow.includes('if: ${{ always() }}') && workflow.includes('uses: actions/upload-artifact@v7'), 'PR validation always uploads available evidence');
assert.ok(workflow.includes('output/preflight/preflight-summary.json') && workflow.includes('output/preflight/history/'), 'PR validation preserves summary and history evidence');
assert.ok(workflow.includes('if-no-files-found: warn') && workflow.includes('retention-days: 7'), 'PR evidence upload is bounded and diagnostic-safe');
assert.equal(/secrets\./i.test(workflow), false, 'PR validation does not depend on repository secrets');

assert.ok(ciWrapper.includes('preflight-tools.ps1') && ciWrapper.includes('-Quiet') && ciWrapper.includes('-Quick') && ciWrapper.includes('-CI'), 'CI wrapper uses explicit quick clean-checkout mode');
assert.ok(ciWrapper.includes('CI clean-checkout preflight failed') && ciWrapper.includes('exit /b 1'), 'CI wrapper propagates preflight failures');

assert.ok(preflight.includes('$prValidationContractCommand'), 'preflight defines the PR validation contract command');
assert.ok(preflight.includes('node pr-validation.contract.test.js'), 'preflight runs the PR validation contract');
assert.ok(preflight.includes('pr-validation-contract'), 'preflight records the PR validation governance result');
assert.ok(preflight.includes('[switch]$CI') && preflight.includes('$ciExcludedCheckKeys'), 'preflight has an explicit clean-checkout CI boundary');
assert.ok(preflight.includes('ci = [bool]$CI') && preflight.includes('not $CI -and (Test-Path -LiteralPath $maturityMatrixScript)'), 'CI summary is labeled and skips stateful postchecks');
for (const key of [
  'rc-column-report-contract',
  'steel-audit-status',
  'anchor-route',
  'stone-report-contract',
  'excavation-report-contract',
  'decking-report-contract',
]) {
  assert.ok(preflight.includes(`'${key}'`), `CI exclusion documents stateful gate ${key}`);
}
assert.ok(readme.includes('.github/workflows/pr-validation.yml'), 'README documents PR validation');
assert.ok(staging.includes('.github/workflows/pr-validation.yml') && staging.includes('pr-validation.contract.test.js') && staging.includes('run-preflight-tools-ci.bat'), 'staging guide keeps workflow, wrapper, and contract together');
assert.ok(toolBoundaries.includes('.github/workflows/pr-validation.yml') && toolBoundaries.includes('pr-validation.contract.test.js') && toolBoundaries.includes('run-preflight-tools-ci.bat'), 'tool boundaries document PR validation governance');

console.log('PR validation contract OK');
