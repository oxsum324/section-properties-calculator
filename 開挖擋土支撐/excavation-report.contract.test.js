const path = require('path');
const { spawnSync } = require('child_process');

const toolRoot = __dirname;

const result = spawnSync(
  'python',
  ['-m', 'unittest', 'backend.tests.test_reporting'],
  {
    cwd: toolRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
    },
  }
);

if (result.error) {
  console.error(`FAIL | excavation report contract spawn error :: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`FAIL | excavation report contract :: exit=${result.status ?? 'null'}`);
  process.exit(result.status || 1);
}

console.log('\nExcavation report contract checks passed.');
