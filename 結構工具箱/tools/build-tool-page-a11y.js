'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const sourceRelativePath = '結構工具箱/tools/a11y/tool-page-a11y.source.js';
const sourcePath = path.join(repoRoot, sourceRelativePath);
const outputPath = path.join(repoRoot, 'tool-page-a11y.js');
const terserPath = path.join(repoRoot, 'output/playwright/phase2-quality-deps/node_modules/terser');
const requiredVersion = '5.44.0';
const header = `/* generated from ${sourceRelativePath} by build-tool-page-a11y.js; do not edit */`;

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check') || args.length > 1) {
    throw new Error('Usage: node 結構工具箱/tools/build-tool-page-a11y.js [--check]');
  }
  if (!fs.existsSync(path.join(terserPath, 'package.json'))) {
    throw new Error('Run ensure-homepage-quality-deps.ps1 to install the pinned ignored Terser dependency.');
  }
  const actualVersion = JSON.parse(fs.readFileSync(path.join(terserPath, 'package.json'), 'utf8')).version;
  if (actualVersion !== requiredVersion) {
    throw new Error(`Expected Terser ${requiredVersion}; found ${actualVersion}. Run ensure-homepage-quality-deps.ps1.`);
  }
  const { minify } = require(terserPath);
  // 不使用 unsafe 或 property mangling；DOM 名稱、可讀字串與既有行為保持。
  const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n?/g, '\n');
  const result = await minify({ [sourceRelativePath]: source }, {
    ecma: 2020,
    compress: true,
    mangle: true,
    format: { comments: false, ascii_only: false, beautify: false },
    sourceMap: false,
  });
  if (!result.code) throw new Error('Terser produced no runtime code.');
  const generated = Buffer.from(`${header}\n${result.code}\n`, 'utf8');
  if (args.includes('--check')) {
    if (!fs.existsSync(outputPath) || !fs.readFileSync(outputPath).equals(generated)) {
      throw new Error('tool-page-a11y.js is stale; run node 結構工具箱/tools/build-tool-page-a11y.js.');
    }
    console.log(`tool-page-a11y build in sync: ${generated.length} bytes, Terser ${requiredVersion}`);
  } else {
    fs.writeFileSync(outputPath, generated);
    console.log(`Built tool-page-a11y.js: ${generated.length} bytes, Terser ${requiredVersion}`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
