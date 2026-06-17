const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

function toolboxFile(relativePath) {
  return path.join(toolboxRoot, ...relativePath.split('/'));
}

function readJson(relativePath) {
  const fullPath = toolboxFile(relativePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function assertFile(relativePath) {
  const fullPath = toolboxFile(relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`missing toolbox file: ${relativePath}`);
  }
  return fullPath;
}

function runNode(label, relativePath, args = []) {
  const fullPath = assertFile(relativePath);
  const run = spawnSync(process.execPath, [fullPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.status !== 0) {
    throw new Error(`${label} failed: ${relativePath}`);
  }
  console.log(`[formal-tools] ${label} OK`);
}

const manifest = readJson('tools/formal-tools.manifest.json');
if (manifest.family !== 'formal-tools') {
  throw new Error(`unexpected formal tools manifest family: ${manifest.family}`);
}
if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
  throw new Error('formal tools manifest has no tools');
}

assertFile(manifest.shared.contractTest);
assertFile(manifest.shared.browserSmokeTest);
assertFile(manifest.shared.maturityMatrix);

console.log(`[formal-tools] manifest v${manifest.version}: ${manifest.tools.length} tools`);
runNode('manifest contract regression', manifest.shared.contractTest);
runNode('browser smoke regression', manifest.shared.browserSmokeTest);
runNode('maturity matrix generation', manifest.shared.maturityMatrix, ['--write', '--check']);
console.log(`formal tools manifest runner OK (${manifest.tools.length} tools)`);
