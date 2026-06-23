const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SKIP_DIRS = new Set([
  '.git',
  '.claude',
  '.codex',
  '.column-testdeps',
  'node_modules',
  'output',
  'dist',
  'build',
  'vendor',
  'backups',
]);
const SKIP_FILES = [/\.(test|spec)\.[cm]?[jt]sx?$/i];
const EXTENSIONS = new Set(['.html', '.js', '.ts', '.tsx']);
const CONFIRM_ALLOWLIST = new Map();

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

function shouldSkipFile(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  if (rel.startsWith('anchor/assets/')) return true;
  return SKIP_FILES.some((re) => re.test(rel));
}

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectFiles(full, out);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    if (shouldSkipFile(full)) continue;
    out.push(full);
  }
  return out;
}

const offenders = [];
const confirmCounts = new Map();
const DIALOG_CALL_RE =
  /(^|[^\w.])(?:(?:window|globalThis)\.)?(alert|prompt|confirm)\s*\(/;
function isTypeSignature(line, match, dialogName) {
  const callStart = match.index + match[1].length;
  const callSlice = line.slice(callStart);
  return new RegExp(
    `^(?:(?:window|globalThis)\\.)?${dialogName}\\s*\\([^)]*\\)\\s*:`,
  ).test(callSlice);
}

for (const file of collectFiles(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const match = line.match(DIALOG_CALL_RE);
    if (!match) return;
    const dialogName = match[2];
    if (isTypeSignature(line, match, dialogName)) return;
    if (dialogName === 'confirm') {
      confirmCounts.set(rel, (confirmCounts.get(rel) || 0) + 1);
      return;
    }
    offenders.push(`${rel}:${idx + 1}: ${dialogName}(`);
  });
}

assert(offenders.length === 0, 'browser dialogs avoid alert/prompt', offenders.join('\n') || 'clean');
const unreviewedConfirms = [];
for (const [rel, count] of confirmCounts) {
  const allowed = CONFIRM_ALLOWLIST.get(rel) || 0;
  if (!allowed || count > allowed) unreviewedConfirms.push(`${rel}: ${count} confirm(, allowed ${allowed}`);
}
assert(unreviewedConfirms.length === 0, 'browser confirm dialogs stay reviewed', unreviewedConfirms.join('\n') || 'reviewed');

const anchorAssetOffenders = [];
const anchorIndexPath = path.join(ROOT, 'anchor', 'index.html');
if (fs.existsSync(anchorIndexPath)) {
  const anchorIndex = fs.readFileSync(anchorIndexPath, 'utf8');
  const referencedAssets = [
    ...new Set(
      [...anchorIndex.matchAll(/\/anchor\/assets\/([^"']+\.js)/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  for (const assetName of referencedAssets) {
    const assetPath = path.join(ROOT, 'anchor', 'assets', assetName);
    if (!fs.existsSync(assetPath)) {
      anchorAssetOffenders.push(`anchor/assets/${assetName}: missing`);
      continue;
    }
    const assetText = fs.readFileSync(assetPath, 'utf8');
    const assetLines = assetText.split(/\r?\n/);
    assetLines.forEach((line, idx) => {
      const match = line.match(DIALOG_CALL_RE);
      if (!match) return;
      const dialogName = match[2];
      anchorAssetOffenders.push(
        `anchor/assets/${assetName}:${idx + 1}: ${dialogName}(`,
      );
    });
  }
}
assert(
  anchorAssetOffenders.length === 0,
  'anchor deployed assets avoid browser dialogs',
  anchorAssetOffenders.join('\n') || 'clean',
);
console.log('\nAll browser dialog contract checks passed.');
