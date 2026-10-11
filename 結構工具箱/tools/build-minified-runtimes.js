'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const terserPath = path.join(repoRoot, 'output/playwright/phase2-quality-deps/node_modules/terser');
const requiredVersion = '5.44.0';
const runtimes = [
  {
    id: 'survey-report-ui',
    source: 'field-survey/src/report-ui.source.js',
    output: 'field-survey/report-ui.js',
    builder: 'build-minified-runtimes.js',
    module: true,
  },
  {
    id: 'survey-signoff-ui',
    source: 'field-survey/src/signoff-ui.source.js',
    output: 'field-survey/signoff-ui.js',
    builder: 'build-minified-runtimes.js',
    module: true,
  },
  {
    id: 'survey-sketch',
    source: 'field-survey/src/sketch.source.js',
    output: 'field-survey/sketch.js',
    builder: 'build-minified-runtimes.js',
    module: true,
  },
  {
    id: 'survey-detail',
    source: 'field-survey/src/detail.source.js',
    output: 'field-survey/detail.js',
    builder: 'build-minified-runtimes.js',
    module: true,
  },
  {
    id: 'survey-model',
    source: 'field-survey/src/model.source.js',
    output: 'field-survey/model.js',
    builder: 'build-minified-runtimes.js',
    module: true,
  },
  {
    id: 'src-column-page',
    source: 'SRC工具/src/src-column.source.js',
    output: 'SRC工具/src-column.js',
    builder: 'build-minified-runtimes.js',
  },
  {
    id: 'src-beam-page',
    source: 'SRC工具/src/src-beam.source.js',
    output: 'SRC工具/src-beam.js',
    builder: 'build-minified-runtimes.js',
  },
  {
    id: 'src-beam-core',
    source: 'SRC工具/core/src/src-beam-core.source.js',
    output: 'SRC工具/core/src-beam-core.js',
    builder: 'build-minified-runtimes.js',
  },
  {
    id: 'wind-report',
    source: '結構工具箱/core/src/wind-report.source.js',
    output: '結構工具箱/core/wind-report.js',
    builder: 'build-minified-runtimes.js',
  },
  {
    id: 'seismic-zones',
    source: '結構工具箱/core/loads/src/seismic-zones.source.js',
    output: '結構工具箱/core/loads/seismic-zones.js',
    builder: 'build-minified-runtimes.js',
  },
  {
    id: 'wind-shared-profile',
    source: '結構工具箱/tools/風力/src/wind-shared-profile.source.js',
    output: '結構工具箱/tools/風力/wind-shared-profile.js',
    builder: 'build-minified-runtimes.js',
  },
  {
    id: 'rc-common',
    source: '鋼筋混凝土/shared/src/common.source.js',
    output: '鋼筋混凝土/shared/common.js',
    builder: 'build-minified-runtimes.js',
  },
  {
    id: 'home',
    source: '結構工具箱/assets/home/src/home.source.js',
    output: '結構工具箱/assets/home/home.js',
    builder: 'build-minified-runtimes.js',
  },
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
  {
    id: 'report-docx',
    source: '結構工具箱/core/ui/src/report-docx.source.js',
    output: '結構工具箱/core/ui/report-docx.js',
    builder: 'build-minified-runtimes.js',
  },
  {
    id: 'tool-workflow',
    source: '結構工具箱/core/ui/src/tool-workflow.source.js',
    output: '結構工具箱/core/ui/tool-workflow.js',
    builder: 'build-minified-runtimes.js',
  },
  {
    id: 'workflow-adapters',
    source: '結構工具箱/tools/src/tool-workflow-adapters.source.js',
    output: '結構工具箱/tools/tool-workflow-adapters.js',
    builder: 'build-minified-runtimes.js',
  },
  {
    id: 'toolbox-storage',
    source: '結構工具箱/tools/src/project-storage.source.js',
    output: '結構工具箱/tools/project-storage.js',
    builder: 'build-minified-runtimes.js',
  },
  {
    id: 'rc-storage',
    source: '鋼筋混凝土/shared/src/project-storage.source.js',
    output: '鋼筋混凝土/shared/project-storage.js',
    builder: 'build-minified-runtimes.js',
  },
  {
    id: 'loadcombo',
    source: '結構工具箱/core/loads/src/loadcombo.source.js',
    output: '結構工具箱/core/loads/loadcombo.js',
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
    module: Boolean(runtime.module),
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
    if (!arg.startsWith('--only=')) throw new Error('Usage: node 結構工具箱/tools/build-minified-runtimes.js [--check] [--only=home|a11y|profile|wind|report-docx|tool-workflow|workflow-adapters|toolbox-storage|rc-storage|loadcombo|survey-report-ui|survey-signoff-ui|survey-sketch|survey-detail|survey-model|src-column-page|src-beam-page|src-beam-core|wind-report|seismic-zones|wind-shared-profile|rc-common]');
    return arg.slice('--only='.length);
  });
  if (args.filter(arg => arg === '--check').length > 1 || selected.length > 1
      || selected.some(id => !runtimes.some(runtime => runtime.id === id))) {
    throw new Error('Usage: node 結構工具箱/tools/build-minified-runtimes.js [--check] [--only=home|a11y|profile|wind|report-docx|tool-workflow|workflow-adapters|toolbox-storage|rc-storage|loadcombo|survey-report-ui|survey-signoff-ui|survey-sketch|survey-detail|survey-model|src-column-page|src-beam-page|src-beam-core|wind-report|seismic-zones|wind-shared-profile|rc-common]');
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
