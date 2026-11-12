// G1 局部快算試辦。另行執行普通全量預檢，再以 --compare 核對同一提交。
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const nav = require('../結構工具箱/tools/nav/build-tool-nav-manifest');
const family = require('../結構工具箱/tools/local-quick-tools.manifest.json');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'output', 'g1-impact');
const toolbox = '結構工具箱/';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const gitPaths = (...args) => git(...args).split('\0').filter(Boolean);
const head = () => git('rev-parse', '--verify', 'HEAD').trim();
const clean = () => git('status', '--porcelain=v1', '-z', '--untracked-files=normal') === '';

function inventory() {
  const source = fs.readFileSync(path.join(root, nav.HOME_SOURCE), 'utf8');
  const catalogue = nav.buildManifest(source).tools;
  const dependencies = nav.extractLiteral(source, 'HOME_TOOL_UPDATE_DEPENDENCIES').routes;
  const routes = family.tools.map(tool => {
    const page = catalogue.find(entry => entry.route === tool.route);
    if (page?.file !== toolbox + tool.html || !Array.isArray(dependencies[tool.route])) {
      throw new Error('家族清冊與首頁不一致 ' + tool.route);
    }
    return { route: tool.route, name: tool.label, page: page.file, test: toolbox + tool.test,
      core: toolbox + tool.core, golden: toolbox + tool.golden, dependencies: dependencies[tool.route] };
  });
  return { routes, catalogue, dependencies };
}

function classify(files, registry) {
  const selected = new Set();
  const changes = files.map(file => {
    const owners = registry.catalogue.filter(entry =>
      entry.file === file || registry.dependencies[entry.route]?.includes(file)).map(entry => entry.route);
    const local = registry.routes.filter(item => [item.page, item.core, item.test, item.golden].includes(file));
    const routes = [...new Set([...owners, ...local.map(item => item.route)])].sort();
    let reason;
    if (/golden|benchmark|baseline/i.test(file)) reason = '基準或算例';
    else if (/(?:^|\/)(?:build[-.]|generate[-.]|generated\/|dist\/)|\.manifest\.|\.source\.|assets\/status\//i.test(file)) reason = '生成器、來源或生成檔';
    else if (routes.length > 1 || file.startsWith(toolbox + 'core/')) reason = '共用依存';
    // 只縮小已明確歸屬的頁面與單元測試。即使核心只有一個登錄者，其他工具仍可能直接引用。
    else if (local.length === 1 && [local[0].page, local[0].test].includes(file)) {
      selected.add(local[0].route);
      return { file, routes, full: false, reason: '家族專屬頁面或測試' };
    } else if (routes.length === 1 && registry.catalogue.some(item => item.file === file)) {
      return { file, routes, full: false, reason: '其他家族專屬頁面' };
    } else reason = routes.length ? '核心或其他依存' : '未登錄或跨工具流程';
    return { file, routes, full: true, reason };
  });
  const full = changes.some(change => change.full);
  return { fullFamily: full, changes, routes: registry.routes.filter(item => full || selected.has(item.route)).map(item => item.route) };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(temp, file);
}

function runTest(script, args = []) {
  const start = performance.now();
  const run = spawnSync(process.execPath, [script, ...args], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 240000 });
  return { script, args, seconds: (performance.now() - start) / 1000, exit: run.status,
    error: run.error?.message || run.signal || null, stdout: run.stdout || '', stderr: run.stderr || '' };
}

function validCache(entry, key, scripts) {
  return entry?.key === key && Array.isArray(entry.records) && entry.records.length === scripts.length &&
    hash(JSON.stringify(entry.records)) === entry.digest && entry.records.every((r, i) =>
      r?.script === scripts[i] && r.exit === 0 && r.error === null && typeof r.stdout === 'string');
}

function compare(pilot, full) {
  const reasons = [];
  if (pilot.clean !== true || !/^[0-9a-f]{40}$/.test(pilot.sha) || pilot.sha !== full.sourceCommitSha || full.sourceDirty !== false) reasons.push('兩份紀錄須為同一乾淨提交');
  const pilotSteps = [...(pilot.records || []), ...(pilot.navigation || [])];
  if (pilot.pass !== true || !Array.isArray(pilot.plan?.routes) || pilot.records?.length !== pilot.plan?.routes.length ||
    pilot.navigation?.length !== 2 || pilotSteps.some(r => r.exit !== 0 || r.error !== null)) reasons.push('局部檢查未全部通過');
  const records = Array.isArray(full.records) ? full.records : [];
  const post = Array.isArray(full.postChecks) ? full.postChecks : [];
  if (full.quick !== false || full.ci !== false || !records.length || records.length !== full.recordsCount ||
    new Set(records.map(r => r.key)).size !== records.length || full.passedCount !== records.length ||
    full.pass !== true || full.failureCount !== 0 || records.some(r => r.pass !== true) ||
    !post.length || post.length !== full.postCheckCount || full.postChecksPassedCount !== post.length ||
    post.some(r => r.pass !== true)) reasons.push('全量或後段檢查未全部通過');
  const familyRecords = ['local-quick-tools-static', 'local-quick-tools-runner'].map(key =>
    records.find(record => record.key === key));
  if (familyRecords.some(r => !r || r.pass !== true || r.exitCode !== 0 || r.reused === true)) reasons.push('家族全量檢查缺少本次執行的成功紀錄');
  return { sameHeadFullPass: reasons.length === 0, reasons, fullCount: records.length, failedKeys: full.failedKeys,
    postCheckFailures: full.postCheckFailures,
    fullSeconds: full.totalSeconds, slowReuseKeys: full.slowReuseKeys, platformAuditReused: full.platformAuditReused,
    familyRecords: familyRecords.map(r => r && ({ key: r.key, pass: r.pass, seconds: r.seconds, reused: r.reused })) };
}

function main() {
  const started = performance.now();
  const { values } = parseArgs({ options: { base: { type: 'string' }, run: { type: 'boolean' },
    fresh: { type: 'boolean' }, compare: { type: 'string' }, pilot: { type: 'string' } } });
  if (values.compare || values.pilot) {
    if (!values.compare || !values.pilot || values.base || values.run || values.fresh) throw new Error('請同時指定 --compare 全量紀錄 --pilot 局部紀錄');
    const report = compare(readJson(values.pilot), readJson(values.compare));
    console.log(JSON.stringify(report, null, 2));
    if (!report.sameHeadFullPass) process.exitCode = 1;
    return;
  }
  if (!values.base || (values.fresh && !values.run)) throw new Error('用法：node dev_tools/local-quick-impact.js --base <提交> [--run [--fresh]]');
  const sha = head();
  const base = git('rev-parse', '--verify', '--end-of-options', values.base + '^{commit}').trim();
  const beforeClean = clean();
  const changed = [...new Set([...gitPaths('diff', '--name-only', '--no-renames', '-z', base, '--'),
    ...gitPaths('ls-files', '--others', '--exclude-standard', '-z')])].sort();
  const registry = inventory();
  const plan = classify(changed, registry);
  if (!values.run) {
    console.log(JSON.stringify({ base, sha, inventory: registry.routes, plan }, null, 2));
    return;
  }
  const scripts = registry.routes.filter(item => plan.routes.includes(item.route)).map(item => item.test);
  const runtime = { node: process.version, exec: process.execPath, arch: process.arch, os: os.release(),
    platform: process.platform, options: process.env.NODE_OPTIONS || '', nodePath: process.env.NODE_PATH || '' };
  const key = hash(JSON.stringify({ sha, scripts, runtime }));
  const cacheFile = path.join(out, 'cache', key + '.json');
  let cached;
  if (beforeClean && scripts.length && !values.fresh) {
    try { cached = readJson(cacheFile); } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
  }
  const hit = validCache(cached, key, scripts);
  const records = hit ? cached.records : scripts.map(script => runTest(script));
  const navigation = ['build-tool-nav-manifest', 'build-family-pages'].map(name =>
    runTest(toolbox + 'tools/nav/' + name + '.js', ['--check']));
  const sameHead = head() === sha;
  const afterClean = clean();
  const pass = sameHead && beforeClean === afterClean && [...records, ...navigation].every(r => r.exit === 0 && !r.error);
  if (!hit && beforeClean && afterClean && pass && scripts.length) writeJson(cacheFile, { key, records, digest: hash(JSON.stringify(records)) });
  const result = { sha, base, clean: beforeClean && afterClean, pass, plan, runtime, cacheHit: hit, key,
    records, navigation, seconds: (performance.now() - started) / 1000 };
  const receipt = path.join(out, 'runs', crypto.randomUUID() + '.json');
  writeJson(receipt, result);
  console.log(JSON.stringify({ receipt, pass, routes: plan.routes, cacheHit: hit, seconds: result.seconds }));
  if (!pass) process.exitCode = 1;
}

module.exports = { classify, inventory, compare, validCache };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
