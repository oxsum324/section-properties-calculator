const path = require('path');
const { spawnSync } = require('child_process');

const toolRoot = __dirname;
const packageRoot = path.join(toolRoot, 'bolt-review-tool');
const vitestArgs = [
  'vitest',
  '--run',
  'src/reportExport.test.ts',
  'src/reportDocx.test.ts',
  'src/reportWorkbook.test.ts',
  'src/attachmentReadiness.test.ts',
  'tests/reportArtifacts.test.ts',
];

const result =
  process.platform === 'win32'
    ? spawnSync(
        'cmd.exe',
        ['/d', '/s', '/c', `npx ${vitestArgs.join(' ')}`],
        {
          cwd: packageRoot,
          stdio: 'inherit',
        }
      )
    : spawnSync('npx', vitestArgs, {
        cwd: packageRoot,
        stdio: 'inherit',
      });

if (result.error) {
  console.error(`FAIL | anchor report contract spawn error :: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`FAIL | anchor report contract :: exit=${result.status ?? 'null'}`);
  process.exit(result.status || 1);
}

console.log('\nAnchor report contract checks passed.');
