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

function runNode(label, relativePath) {
  const fullPath = assertFile(relativePath);
  const run = spawnSync(process.execPath, [fullPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.status !== 0) {
    throw new Error(`${label} failed: ${relativePath}`);
  }
  console.log(`[local-quick] ${label} OK`);
}

const manifest = readJson('tools/local-quick-tools.manifest.json');
if (manifest.family !== 'local-quick-tools') {
  throw new Error(`unexpected local quick manifest family: ${manifest.family}`);
}
if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
  throw new Error('local quick manifest has no tools');
}

assertFile(manifest.shared.exportHelper);
assertFile(manifest.shared.exportHelperTest);
assertFile(manifest.shared.outputConsistencyTest);
assertFile(manifest.shared.contractTest);

console.log(`[local-quick] manifest v${manifest.version}: ${manifest.tools.length} tools`);
runNode('export helper regression', manifest.shared.exportHelperTest);
runNode('output consistency regression', manifest.shared.outputConsistencyTest);
runNode('manifest contract regression', manifest.shared.contractTest);
console.log(`local quick tools manifest runner OK (${manifest.tools.length} tools)`);
