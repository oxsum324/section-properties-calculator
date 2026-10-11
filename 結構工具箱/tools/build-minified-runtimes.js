'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const terserPath = path.join(repoRoot, 'output/playwright/phase2-quality-deps/node_modules/terser');
const requiredVersion = '5.44.0';
const runtimes = [
  {
    id: 'a11y',
    source: '結構工具箱/tools/a11y/tool-page-a11y.source.js',
    output: 'tool-page-a11y.js',
    builder: 'build-tool-page-a11y.js',
  },
  {
    id: 'profile',
    source: '結構工具箱/tools/src/project-meta-profile.source.js',
    output: '結構工具箱/tools/project-meta-profile.js',
    builder: 'build-minified-runtimes.js',
  },
  {
    id: 'wind',
    source: '結構工具箱/core/loads/src/wind.source.js',
    output: '結構工具箱/core/loads/wind.js',
    builder: 'build-minified-runtimes.js',
  },
];

function headerFor(runtime) {
  return `/* generated from ${runtime.source} by ${runtime.builder}; do not edit */`;
}

async function build(runtime, check) {
  const sourcePath = path.join(repoRoot, runtime.source);
  const outputPath = path.join(repoRoot, runtime.output);
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing readable source: ${runtime.source}`);
  const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n?/g, '\n');
  const { minify } = require(terserPath);
  const result = await minify({ [runtime.source]: source }, {
    ecma: 2020,
    compress: true,
    mangle: true,
    format: { comments: false, ascii_only: false, beautify: false },
    sourceMap: false,
  });
  if (!result.code) throw new Error(`Terser produced no runtime code for ${runtime.id}.`);
  const generated = Buffer.from(`${headerFor(runtime)}\n${result.code}\n`, 'utf8');
  if (check) {
    if (!fs.existsSync(outputPath) || !fs.readFileSync(outputPath).equals(generated)) {
      throw new Error(`${runtime.output} is stale; run node 結構工具箱/tools/build-minified-runtimes.js.`);
    }
    return `in sync ${runtime.output}: ${generated.length} bytes`;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, generated);
  return `built ${runtime.output}: ${generated.length} bytes`;
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const selected = args.filter(arg => arg !== '--check').map(arg => {
    if (!arg.startsWith('--only=')) throw new Error('Usage: node 結構工具箱/tools/build-minified-runtimes.js [--check] [--only=a11y|profile|wind]');
    return arg.slice('--only='.length);
  });
  if (args.filter(arg => arg === '--check').length > 1 || selected.length > 1
      || selected.some(id => !runtimes.some(runtime => runtime.id === id))) {
    throw new Error('Usage: node 結構工具箱/tools/build-minified-runtimes.js [--check] [--only=a11y|profile|wind]');
  }
  if (!fs.existsSync(path.join(terserPath, 'package.json'))) {
    throw new Error('Run ensure-homepage-quality-deps.ps1 to install the pinned ignored Terser dependency.');
  }
  const actualVersion = JSON.parse(fs.readFileSync(path.join(terserPath, 'package.json'), 'utf8')).version;
  if (actualVersion !== requiredVersion) {
    throw new Error(`Expected Terser ${requiredVersion}; found ${actualVersion}. Run ensure-homepage-quality-deps.ps1.`);
  }
  const targets = selected.length ? runtimes.filter(runtime => runtime.id === selected[0]) : runtimes;
  const messages = [];
  for (const runtime of targets) messages.push(await build(runtime, check));
  console.log(`${messages.join('\n')} (Terser ${requiredVersion})`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { runtimes, headerFor, requiredVersion };
