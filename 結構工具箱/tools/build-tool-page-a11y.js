'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const canonicalBuilder = path.join(__dirname, 'build-minified-runtimes.js');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check') || args.length > 1) {
  console.error('Usage: node 結構工具箱/tools/build-tool-page-a11y.js [--check]');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, [canonicalBuilder, ...args, '--only=a11y'], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
