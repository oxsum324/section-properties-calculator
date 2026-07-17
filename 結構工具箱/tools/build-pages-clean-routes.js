'use strict';

const fs = require('fs');
const path = require('path');

const GENERATED_MARKER = 'generated-by: build-pages-clean-routes.js';

function parseArgs(argv) {
  const valueAfter = name => {
    const index = argv.indexOf(name);
    return index === -1 ? '' : argv[index + 1] || '';
  };
  return {
    siteRoot: valueAfter('--site-root'),
    configPath: valueAfter('--config')
  };
}

function normalizeRoutePath(value, label) {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    throw new Error(`${label} must be an absolute route: ${value}`);
  }
  if (/[?#\\]/.test(value)) {
    throw new Error(`${label} contains unsupported route characters: ${value}`);
  }
  const segments = value.split('/').filter(Boolean);
  if (segments.some(segment => segment === '.' || segment === '..' || segment.includes('*') || segment.includes(':'))) {
    throw new Error(`${label} contains unsupported route segments: ${value}`);
  }
  return segments.length ? `/${segments.join('/')}` : '/';
}

function sitePath(siteRoot, routePath) {
  const segments = routePath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const resolved = path.resolve(siteRoot, ...segments);
  const relative = path.relative(siteRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`route escapes staged site: ${routePath}`);
  }
  return resolved;
}

function destinationCandidates(siteRoot, destination) {
  const normalized = normalizeRoutePath(destination, 'destination');
  if (normalized === '/') return [path.join(siteRoot, 'index.html')];
  const exact = sitePath(siteRoot, normalized);
  return [exact, `${exact}.html`, path.join(exact, 'index.html')];
}

function resolveDestination(siteRoot, destination) {
  return destinationCandidates(siteRoot, destination).find(candidate => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function encodeRelativePath(relativePath) {
  return relativePath
    .replace(/\\/g, '/')
    .split('/')
    .map(segment => (segment === '.' || segment === '..' ? segment : encodeURIComponent(segment)))
    .join('/');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function redirectHtml(source, relativeTarget) {
  const safeSource = escapeHtml(source);
  const safeTarget = escapeHtml(relativeTarget);
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="pages-clean-route" content="${safeSource}">
  <meta name="pages-clean-route-target" content="${safeTarget}">
  <meta http-equiv="refresh" content="0; url=${safeTarget}">
  <title>正在開啟結構工具</title>
</head>
<body data-pages-clean-route="${safeSource}">
  <p>正在開啟工具；若未自動前往，請<a href="${safeTarget}">點此繼續</a>。</p>
  <script>
    // ${GENERATED_MARKER}
    const target = ${JSON.stringify(relativeTarget)} + window.location.search + window.location.hash;
    window.location.replace(target);
  </script>
</body>
</html>
`;
}

function collectRoutes(config) {
  const routes = [...(config.rewrites || []), ...(config.redirects || [])];
  const deduplicated = new Map();
  for (const route of routes) {
    const source = normalizeRoutePath(route.source, 'source');
    const destination = normalizeRoutePath(route.destination, `destination for ${source}`);
    if (deduplicated.has(source) && deduplicated.get(source) !== destination) {
      throw new Error(`conflicting destinations for ${source}`);
    }
    deduplicated.set(source, destination);
  }
  return [...deduplicated].map(([source, destination]) => ({ source, destination }));
}

function buildPagesCleanRoutes({ siteRoot, config }) {
  const resolvedSiteRoot = path.resolve(siteRoot);
  if (!fs.statSync(resolvedSiteRoot).isDirectory()) {
    throw new Error(`staged site root is not a directory: ${resolvedSiteRoot}`);
  }

  const generated = [];
  const skipped = [];
  for (const route of collectRoutes(config)) {
    if (route.source === '/') {
      skipped.push({ ...route, reason: 'preserve-root-index' });
      continue;
    }

    const destinationFile = resolveDestination(resolvedSiteRoot, route.destination);
    if (!destinationFile) {
      throw new Error(`no staged destination for ${route.source}: ${route.destination}`);
    }

    const outputFile = path.join(sitePath(resolvedSiteRoot, route.source), 'index.html');
    if (path.resolve(outputFile) === path.resolve(destinationFile)) {
      skipped.push({ ...route, reason: 'source-is-destination' });
      continue;
    }
    if (fs.existsSync(outputFile)) {
      throw new Error(`clean route would overwrite a public page: ${route.source} -> ${outputFile}`);
    }

    let relativeTarget = path.relative(path.dirname(outputFile), destinationFile).replace(/\\/g, '/');
    if (!relativeTarget.startsWith('.')) relativeTarget = `./${relativeTarget}`;
    relativeTarget = encodeRelativePath(relativeTarget);

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, redirectHtml(route.source, relativeTarget), 'utf8');
    generated.push({ ...route, outputFile, destinationFile, relativeTarget });
  }

  return { generated, skipped };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const siteRoot = path.resolve(args.siteRoot || path.join(process.cwd(), '_site'));
  const configPath = path.resolve(args.configPath || path.join(__dirname, '..', '..', 'vercel.json'));
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const result = buildPagesCleanRoutes({ siteRoot, config });
  console.log(`Pages clean routes generated: ${result.generated.length}; preserved: ${result.skipped.length}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exit(1);
  }
}

module.exports = {
  GENERATED_MARKER,
  buildPagesCleanRoutes,
  collectRoutes,
  destinationCandidates,
  normalizeRoutePath,
  redirectHtml,
  resolveDestination
};
