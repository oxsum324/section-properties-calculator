'use strict';
// 以固定版本 Terser 把 tool-chrome.source.js 產生成根目錄 tool-chrome.js（確定性輸出，--check 逐位元組比對）。
// 清冊資料不內嵌：執行期讀同目錄的 tool-nav.manifest.js（window.STRUCT_TOOL_NAV，由 build-tool-nav-manifest.js 產生）。
// 用法：node 結構工具箱/tools/nav/build-tool-chrome.js [--check]

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const terserPath = path.join(repoRoot, 'output/playwright/phase2-quality-deps/node_modules/terser');
const requiredVersion = '5.44.0';
const SOURCE = '結構工具箱/tools/nav/tool-chrome.source.js';
const OUTPUT = 'tool-chrome.js';
const BUILDER = 'build-tool-chrome.js';
const header = `/* generated from ${SOURCE} by ${BUILDER}; do not edit */`;

async function build({ check = false } = {}) {
  if (!fs.existsSync(path.join(terserPath, 'package.json'))) {
    throw new Error('Run ensure-homepage-quality-deps.ps1 to install the pinned ignored Terser dependency.');
  }
  const actualVersion = JSON.parse(fs.readFileSync(path.join(terserPath, 'package.json'), 'utf8')).version;
  if (actualVersion !== requiredVersion) throw new Error(`Expected Terser ${requiredVersion}; found ${actualVersion}.`);
  const sourcePath = path.join(repoRoot, SOURCE);
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing readable source: ${SOURCE}`);
  const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n?/g, '\n');
  const { minify } = require(terserPath);
  const result = await minify({ [SOURCE]: source }, {
    ecma: 2020,
    module: false,
    compress: true,
    mangle: true,
    format: { comments: false, ascii_only: false, beautify: false },
    sourceMap: false,
  });
  if (!result.code) throw new Error('Terser produced no runtime code for tool-chrome.');
  const generated = Buffer.from(`${header}\n${result.code}\n`, 'utf8');
  const outputPath = path.join(repoRoot, OUTPUT);
  if (check) {
    if (!fs.existsSync(outputPath) || !fs.readFileSync(outputPath).equals(generated)) {
      throw new Error(`${OUTPUT} is stale; run node 結構工具箱/tools/nav/build-tool-chrome.js.`);
    }
    return `in sync ${OUTPUT}: ${generated.length} bytes (Terser ${requiredVersion})`;
  }
  fs.writeFileSync(outputPath, generated);
  return `built ${OUTPUT}: ${generated.length} bytes (Terser ${requiredVersion})`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check') || args.length > 1) {
    throw new Error('Usage: node 結構工具箱/tools/nav/build-tool-chrome.js [--check]');
  }
  console.log(await build({ check: args.includes('--check') }));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { SOURCE, OUTPUT, BUILDER, header, requiredVersion, build };
